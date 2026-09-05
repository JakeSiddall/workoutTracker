import copy
from contextlib import contextmanager
import json
import os
from pathlib import Path
import shutil
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from release import validate
from storage import snapshot, preserves
from workoutctl import Controller, atomic_json

def release(char):
    return {'image': 'ghcr.io/jakesiddall/workouttracker@sha256:' + char * 64,
            'commit': char * 40, 'runtime': json.loads(Path(__file__).resolve().parents[1].joinpath('runtime.json').read_text()),
            'rollback_policy': 'preserve-existing-data-v1'}

@contextmanager
def connection(path):
    db = sqlite3.connect(path)
    try:
        with db:
            yield db
    finally:
        db.close()

def database(path, value='confirmed actual'):
    with connection(path) as db:
        db.execute('CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY, actual TEXT)')
        db.execute('INSERT OR IGNORE INTO records VALUES (?,?)', ('set-1', value))

class FakeDocker:
    def __init__(self):
        self.running = None
        self.events = []
        self.fail_start = set()
        self.fail_check = set()
        self.rewrite = set()
        self.fail_next_start = False

    def pull(self, release):
        self.events.append(('pull', release['commit']))

    def stop(self):
        self.events.append(('stop', None))
        self.running = None

    def start(self, release, data):
        self.events.append(('start', copy.deepcopy(release)))
        self.running = release
        if self.fail_next_start:
            self.fail_next_start = False
            raise RuntimeError('Injected one-time launch failure')
        if release['commit'] in self.fail_start:
            raise RuntimeError('Injected launch or readiness failure')
        database(data / 'workouts.sqlite')

    def check(self, release, data):
        self.events.append(('check', release['commit']))
        if release['commit'] in self.fail_check:
            raise RuntimeError('Injected old-image compatibility failure')
        database(data / 'workouts.sqlite')
        if release['commit'] in self.rewrite:
            with connection(data / 'workouts.sqlite') as db:
                db.execute("UPDATE records SET actual='rewritten'")

class FakeBackup:
    def __init__(self):
        self.fail = False
        self.calls = 0
        self.objects = {}

    def archive_verified(self, source, scratch):
        self.calls += 1
        if self.fail:
            raise RuntimeError('Injected backup verification failure')
        scratch.mkdir()
        dest = scratch / 'workouts.sqlite'
        shutil.copyfile(source, dest)
        key = f'{self.calls:064x}'
        self.objects[key] = source.read_bytes()
        return key, dest

    def retrieve(self, snapshot_id, source, scratch):
        scratch.mkdir(parents=True)
        dest = scratch / 'restored.sqlite'
        dest.write_bytes(self.objects[snapshot_id])
        return dest

class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / 'workout-tracker'
        self.root.mkdir()
        (self.root / 'data').mkdir()
        self.target = {'approved': True, 'root': str(self.root), 'host_port': 3002}
        self.docker = FakeDocker()
        self.backup = FakeBackup()
        self.control = Controller(self.target, self.docker, self.backup)

    def tearDown(self):
        self.temp.cleanup()

    def first(self):
        self.control.deploy(release('a'), True)

    def test_unapproved_target_and_manual_gate(self):
        with self.assertRaises(ValueError):
            Controller({**self.target, 'approved': False})
        with self.assertRaises(ValueError):
            self.control.deploy(release('a'))
        self.assertEqual(self.docker.events, [])

    def test_first_deploy_smokes_and_commits_only_after_start(self):
        self.first()
        self.assertEqual(self.control.state()['current'], release('a'))
        self.assertIn(('check', 'a' * 40), self.docker.events)
        self.assertFalse(self.control.journal_file.exists())

    def test_launch_failure_restores_complete_old_release(self):
        self.first()
        before = self.control.state()
        self.docker.fail_start.add('b' * 40)
        with self.assertRaises(RuntimeError):
            self.control.deploy(release('b'), True)
        self.assertEqual(self.control.state(), before)
        self.assertEqual(self.docker.running, before['current'])
        self.assertEqual(self.backup.calls, 2)

    def test_backup_failure_restarts_prior_before_candidate_can_touch_live(self):
        self.first()
        self.backup.fail = True
        with self.assertRaises(RuntimeError):
            self.control.deploy(release('b'), True)
        self.assertEqual(self.docker.running, release('a'))
        self.assertFalse(any(event == ('check', 'b' * 40) for event in self.docker.events))

    def test_data_rewrite_rejected_before_live_launch(self):
        self.first()
        self.docker.rewrite.add('b' * 40)
        with self.assertRaises(ValueError):
            self.control.deploy(release('b'), True)
        with connection(self.root / 'data/workouts.sqlite') as db:
            self.assertEqual(db.execute('SELECT actual FROM records').fetchone()[0], 'confirmed actual')
        self.assertEqual(self.docker.running, release('a'))

    def test_previous_image_failure_blocks_upgrade(self):
        self.first()
        self.docker.fail_check.add('a' * 40)
        with self.assertRaises(RuntimeError):
            self.control.deploy(release('b'), True)
        self.assertEqual(self.docker.running, release('a'))

    def test_failed_first_launch_leaves_no_live_container(self):
        self.docker.fail_start.add('a' * 40)
        with self.assertRaises(RuntimeError):
            self.first()
        self.assertIsNone(self.docker.running)
        self.assertIsNone(self.control.state()['current'])

    def test_process_crash_requires_explicit_recover(self):
        self.first()
        before = self.control.state()
        atomic_json(self.control.journal_file, {'before': before, 'phase': 'launch'})
        self.docker.running = release('b')
        with self.assertRaises(ValueError):
            self.control.deploy(release('b'), True)
        self.control.recover(True)
        self.assertEqual(self.docker.running, release('a'))
        self.assertFalse(self.control.journal_file.exists())

    def test_concurrent_operation_cannot_acquire_lock(self):
        with self.control.lock():
            with self.assertRaises(BlockingIOError):
                self.control.deploy(release('a'), True)

    def test_rollback_failure_retains_recovery_journal(self):
        self.first()
        self.docker.fail_start.update({'a' * 40, 'b' * 40})
        with self.assertRaises(RuntimeError):
            self.control.deploy(release('b'), True)
        self.assertTrue(self.control.journal_file.exists())
        self.assertEqual(self.control.state()['current'], release('a'))

    def test_release_rejects_mutable_tag_and_wrong_repository(self):
        for image in ['ghcr.io/jakesiddall/workouttracker:latest', 'ghcr.io/other/app@sha256:' + 'a'*64]:
            with self.assertRaises(ValueError):
                validate({**release('a'), 'image': image})

    def test_restore_failure_returns_full_current_database(self):
        self.first()
        receipt = self.control.state()['backup']
        with connection(self.root / 'data/workouts.sqlite') as db:
            db.execute("UPDATE records SET actual='new confirmed data'")
        self.docker.fail_next_start = True
        with patch('workoutctl.os.chown'), self.assertRaises(RuntimeError):
            self.control.restore(receipt, True)
        with connection(self.root / 'data/workouts.sqlite') as db:
            self.assertEqual(db.execute('SELECT actual FROM records').fetchone()[0], 'new confirmed data')
        self.assertFalse(self.control.journal_file.exists())
        self.assertTrue(list(self.root.glob('rejected-restore-*')))

    def test_restore_success_keeps_pre_restore_directory(self):
        self.first()
        receipt = self.control.state()['backup']
        with connection(self.root / 'data/workouts.sqlite') as db:
            db.execute("UPDATE records SET actual='new confirmed data'")
        with patch('workoutctl.os.chown'):
            self.control.restore(receipt, True)
        with connection(self.root / 'data/workouts.sqlite') as db:
            self.assertEqual(db.execute('SELECT actual FROM records').fetchone()[0], 'confirmed actual')
        self.assertTrue(list(self.root.glob('pre-restore-*')))

    def test_successful_upgrade_and_rollback_record_full_manifest(self):
        old_release = release('a')
        old_release['runtime']['memory'] = '256m'
        self.control.deploy(old_release, True)
        self.control.deploy(release('b'), True)
        self.assertEqual(self.control.state()['previous'], old_release)
        self.control.deploy(None, True, rollback=True)
        self.assertEqual(self.control.state()['current'], old_release)
        self.assertEqual(self.docker.running['runtime']['memory'], '256m')
        self.assertEqual(self.control.state()['previous'], release('b'))

    def test_target_port_drift_is_rejected(self):
        self.first()
        self.target['host_port'] = 9999
        with self.assertRaises(ValueError):
            self.control.deploy(release('b'), True)

class StorageTests(unittest.TestCase):
    def test_wal_backup_captures_uncheckpointed_confirmed_values(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / 'live.sqlite'
            with connection(source) as db:
                db.execute('PRAGMA journal_mode=WAL')
                db.execute('CREATE TABLE records(id INTEGER PRIMARY KEY, reps INTEGER)')
                db.execute('INSERT INTO records VALUES (1,0)')
                db.commit()
                snapshot(source, root / 'copy.sqlite')
                with connection(root / 'copy.sqlite') as restored:
                    self.assertEqual(restored.execute('SELECT reps FROM records').fetchone(), (0,))
                preserves(source, root / 'copy.sqlite')

    def test_removed_changed_columns_and_values_fail_gate(self):
        for migration in ['DELETE FROM records', "UPDATE records SET actual='changed'", 'ALTER TABLE records RENAME COLUMN actual TO invented']:
            with self.subTest(migration=migration), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                database(root / 'before.sqlite')
                snapshot(root / 'before.sqlite', root / 'after.sqlite')
                with connection(root / 'after.sqlite') as db:
                    db.execute(migration)
                with self.assertRaises(ValueError):
                    preserves(root / 'before.sqlite', root / 'after.sqlite')

    def test_additive_schema_preserves_old_data(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            database(root / 'before.sqlite')
            snapshot(root / 'before.sqlite', root / 'after.sqlite')
            with connection(root / 'after.sqlite') as db:
                db.execute('ALTER TABLE records ADD COLUMN note TEXT')
            preserves(root / 'before.sqlite', root / 'after.sqlite')

if __name__ == '__main__':
    unittest.main()
