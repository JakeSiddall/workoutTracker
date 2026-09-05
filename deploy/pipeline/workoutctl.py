"""Manual host-side release controller; no GitHub runner or shell-sourced config.

    python3 workoutctl.py --target /etc/workout-tracker/target.json status

Deployment/rollback/recovery/restore require --approve. Provisioning is JAK-9.
"""
import argparse
from contextlib import contextmanager
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import uuid

from container_check import smoke, wait
from release import identity, validate
from storage import preserves, snapshot, verify

NAME = 'workout-tracker'

def atomic_json(path, value):
    """One fsync'd JSON commit for current + previous; also used for journal."""
    temp = path.with_name(path.name + '.tmp')
    with temp.open('w') as file:
        json.dump(value, file, indent=2)
        file.flush()
        os.fsync(file.fileno())
    temp.replace(path)
    fd = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)

def checked(*args, env=None):
    # Do not forward private container logs, storage credentials, or SQL contents.
    result = subprocess.run(args, capture_output=True, text=True, env=env)
    if result.returncode:
        raise RuntimeError(f'{args[0]} operation failed; inspect host locally')
    return result.stdout

class Docker:
    def __init__(self, target):
        self.target = target

    def pull(self, release):
        checked('docker', 'pull', release['image'])
        arch = checked('docker', 'image', 'inspect', release['image'], '--format', '{{.Architecture}}').strip()
        if arch != 'arm64':
            raise ValueError('Release image is not ARM64')
        commit = checked('docker', 'image', 'inspect', release['image'], '--format', '{{index .Config.Labels "org.opencontainers.image.revision"}}').strip()
        if commit != release['commit']:
            raise ValueError('Image revision and release manifest do not match')

    def stop(self):
        existing = checked('docker', 'ps', '-aq', '--filter', f'name=^/{NAME}$').strip()
        if existing:
            checked('docker', 'stop', '--time', '30', NAME)
            checked('docker', 'rm', NAME)

    def start(self, release, data):
        self.stop()
        runtime = release['runtime']
        args = ['docker', 'run', '-d', '--name', NAME, '--restart', 'unless-stopped',
                '--init', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
                '--memory', runtime['memory'], '--pids-limit', '128',
                '--user', runtime['user'], '--tmpfs', '/tmp:rw,nosuid,size=32m',
                '--log-opt', 'max-size=10m', '--log-opt', 'max-file=3',
                '-p', f"127.0.0.1:{self.target['host_port']}:{runtime['container_port']}",
                '-v', f'{data}:/data']
        for key, value in runtime['environment'].items():
            args += ['-e', f'{key}={value}']
        checked(*args, release['image'])
        wait(NAME)

    def check(self, release, data):
        smoke(release['image'], data, release['runtime'])

class Restic:
    def __init__(self, config):
        # JSON keeps secret values literal and does not execute host shell code.
        config = Path(config)
        if config.stat().st_mode & 0o077:
            raise ValueError('Backup configuration must be private (0600)')
        values = json.loads(config.read_text())
        repo = values.get('RESTIC_REPOSITORY', '')
        if not repo.startswith(('sftp:', 's3:', 'b2:', 'azure:', 'gs:', 'rest:https://', 'rclone:')):
            raise ValueError('An explicitly configured off-device restic repository is required')
        if not values.get('RESTIC_PASSWORD_FILE'):
            raise ValueError('RESTIC_PASSWORD_FILE is required')
        self.env = {**os.environ, **values}

    def archive_verified(self, source, scratch):
        source = source.resolve()
        output = checked('restic', 'backup', '--json', str(source), env=self.env)
        summary = [json.loads(line) for line in output.splitlines() if line.strip()]
        ids = [x['snapshot_id'] for x in summary if x.get('message_type') == 'summary']
        if len(ids) != 1:
            raise ValueError('Backup did not return an unambiguous snapshot ID')
        restored = self.retrieve(ids[0], source, scratch)
        if hashlib.sha256(restored.read_bytes()).digest() != hashlib.sha256(source.read_bytes()).digest():
            raise ValueError('Off-device restore differs from local snapshot')
        return ids[0], restored

    def retrieve(self, snapshot_id, source, scratch):
        if not re.fullmatch('[a-f0-9]{8,64}', snapshot_id):
            raise ValueError('Use an exact restic snapshot ID, never latest')
        checked('restic', 'restore', snapshot_id, '--target', str(scratch), env=self.env)
        restored = scratch / str(source.resolve()).lstrip('/')
        verify(restored)
        return restored

class Controller:
    def __init__(self, target, docker=None, backup=None):
        if target.get('approved') is not True:
            raise ValueError('JAK-9 target contract is not approved')
        self.root = Path(target['root']).resolve()
        if self.root.name != NAME or self.root == Path('/') or not self.root.is_dir():
            raise ValueError('Expected a provisioned workout-tracker directory')
        if not isinstance(target['host_port'], int) or not 1024 <= target['host_port'] <= 65535:
            raise ValueError('Expected an unprivileged loopback port')
        self.data = self.root / 'data'
        if not self.data.is_dir() or self.data.is_symlink():
            raise ValueError('JAK-9 must provision the isolated data directory')
        self.state_file = self.root / 'state.json'
        self.journal_file = self.root / 'transaction.json'
        self.docker = docker or Docker(target)
        self.backup = backup
        self.target = target

    @contextmanager
    def lock(self):
        with (self.root / '.operation.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            yield

    def state(self):
        return json.loads(self.state_file.read_text()) if self.state_file.exists() else {'current': None, 'previous': None}

    def require_idle(self):
        if self.journal_file.exists():
            raise ValueError('An interrupted operation needs explicit recover before any further mutation')
        target = self.state().get('target')
        if target and target != {'root': str(self.root), 'host_port': self.target['host_port']}:
            raise ValueError('Target path/port changed; restore the recorded target configuration first')

    def archive(self, database, work):
        local = work / 'snapshot.sqlite'
        snapshot(database, local)
        backend = self.backup or Restic(self.target['backup_config'])
        backup_id, restored = backend.archive_verified(local, work / 'offsite-restore')
        return local, backup_id, restored

    def check_upgrade(self, candidate, current, database, work):
        fresh = work / 'fresh'
        fresh.mkdir()
        self.docker.check(candidate, fresh)  # First deploy never skips this gate.
        if database is None:
            return
        upgraded = work / 'upgraded'
        upgraded.mkdir()
        shutil.copyfile(database, upgraded / 'workouts.sqlite')
        self.docker.check(candidate, upgraded)
        preserves(database, upgraded / 'workouts.sqlite')
        if current:
            self.docker.check(current, upgraded)  # Actual prior image on new schema.
            preserves(database, upgraded / 'workouts.sqlite')

    def _recover(self, journal):
        self.docker.stop()
        if journal.get('safety_directory'):
            safety = self.root / journal['safety_directory']
            if safety.exists():
                rejected = self.root / ('rejected-restore-' + uuid.uuid4().hex)
                if self.data.exists():
                    self.data.rename(rejected)
                safety.rename(self.data)
        old = journal['before']['current']
        if old:
            self.docker.start(old, self.data)
        atomic_json(self.state_file, journal['before'])
        self.journal_file.unlink()

    def deploy(self, candidate, approve=False, rollback=False):
        if not approve:
            raise ValueError('Manual release approval required: --approve')
        with self.lock():
            self.require_idle()
            before = self.state()
            if rollback:
                candidate = before['previous']
                if not candidate:
                    raise ValueError('No previous release')
            validate(candidate)
            if before['current'] == candidate:
                return
            if self.backup is None:
                self.backup = Restic(self.target['backup_config'])
            self.docker.pull(candidate)
            if before['current']:
                self.docker.pull(before['current'])
            journal = {'before': before, 'candidate': candidate, 'phase': 'quiesce'}
            atomic_json(self.journal_file, journal)
            try:
                self.docker.stop()  # No writes between final snapshot and compatibility test.
                with tempfile.TemporaryDirectory(prefix='release-', dir=self.root) as temp:
                    work = Path(temp)
                    database = self.data / 'workouts.sqlite'
                    prior = None
                    if database.exists():
                        prior, backup_id, restored = self.archive(database, work)
                        journal['backup'] = {'id': backup_id, 'path': str(prior)}
                        atomic_json(self.journal_file, journal)
                        # Verify decrypted backup can start under the existing release.
                        if before['current']:
                            self.docker.check(before['current'], restored.parent)
                    self.check_upgrade(candidate, before['current'], prior, work)
                journal['phase'] = 'launch'
                atomic_json(self.journal_file, journal)
                self.docker.start(candidate, self.data)
                if not journal.get('backup'):
                    # First release must prove that its newly initialized DB can be
                    # recovered off device before it becomes the successful release.
                    with tempfile.TemporaryDirectory(prefix='first-backup-', dir=self.root) as temp:
                        local, backup_id, _ = self.archive(self.data / 'workouts.sqlite', Path(temp))
                        journal['backup'] = {'id': backup_id, 'path': str(local)}
                        atomic_json(self.journal_file, journal)
                atomic_json(self.state_file, {'current': candidate, 'previous': before['current'], 'backup': journal.get('backup'),
                                             'target': {'root': str(self.root), 'host_port': self.target['host_port']}})
                self.journal_file.unlink()
            except BaseException:
                self._recover(journal)
                raise

    def recover(self, approve=False):
        if not approve:
            raise ValueError('Recovery requires --approve')
        with self.lock():
            if self.journal_file.exists():
                self._recover(json.loads(self.journal_file.read_text()))

    def backup_now(self):
        with self.lock():
            self.require_idle()
            with tempfile.TemporaryDirectory(prefix='backup-', dir=self.root) as temp:
                local, backup_id, _ = self.archive(self.data / 'workouts.sqlite', Path(temp))
                receipt = {'id': backup_id, 'path': str(local)}
                atomic_json(self.root / 'last-backup.json', receipt)
                return receipt

    def restore(self, receipt, approve=False):
        if not approve:
            raise ValueError('Restore replaces writes since this backup; requires --approve')
        with self.lock():
            self.require_idle()
            before = self.state()
            if not before['current']:
                raise ValueError('Restore requires a current release')
            with tempfile.TemporaryDirectory(prefix='restore-', dir=self.root) as temp:
                work = Path(temp)
                backend = self.backup or Restic(self.target['backup_config'])
                restored = backend.retrieve(receipt['id'], Path(receipt['path']), work / 'download')
                test_data = work / 'test'
                test_data.mkdir()
                shutil.copyfile(restored, test_data / 'workouts.sqlite')
                self.docker.check(before['current'], test_data)
                journal = {'before': before, 'phase': 'restore', 'safety_directory': 'pre-restore-' + uuid.uuid4().hex}
                atomic_json(self.journal_file, journal)
                try:
                    self.docker.stop()
                    self.archive(self.data / 'workouts.sqlite', work)
                    self.data.rename(self.root / journal['safety_directory'])
                    self.data.mkdir(mode=0o700)
                    shutil.copyfile(restored, self.data / 'workouts.sqlite')
                    uid, gid = map(int, before['current']['runtime']['user'].split(':'))
                    os.chown(self.data, uid, gid)
                    os.chown(self.data / 'workouts.sqlite', uid, gid)
                    self.docker.start(before['current'], self.data)
                    self.journal_file.unlink()
                except BaseException:
                    self._recover(journal)
                    raise

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target', required=True)
    parser.add_argument('--approve', action='store_true')
    parser.add_argument('command', choices=['status', 'logs', 'deploy', 'rollback', 'recover', 'backup', 'restore'])
    parser.add_argument('file', nargs='?')
    args = parser.parse_args()
    control = Controller(json.loads(Path(args.target).read_text()))
    if args.command == 'status':
        print(json.dumps({'state': control.state(), 'recovery_required': control.journal_file.exists()}, indent=2))
    elif args.command == 'logs':
        subprocess.run(['docker', 'logs', '--tail', '100', NAME], check=True)
    elif args.command == 'deploy':
        control.deploy(json.loads(Path(args.file).read_text()), args.approve)
    elif args.command == 'rollback':
        control.deploy(None, args.approve, rollback=True)
    elif args.command == 'recover':
        control.recover(args.approve)
    elif args.command == 'backup':
        print(json.dumps(control.backup_now()))
    elif args.command == 'restore':
        control.restore(json.loads(Path(args.file).read_text()), args.approve)

if __name__ == '__main__':
    main()
