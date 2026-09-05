"""Real encryption/restore on a disposable local repository, never user storage."""
import json
import os
from pathlib import Path
import shutil
import sqlite3
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from workoutctl import Restic, checked

@unittest.skipUnless(shutil.which('restic'), 'restic unavailable; hosted CI installs it')
class ResticTests(unittest.TestCase):
    def test_encrypted_roundtrip_and_wrong_password_rejected(self):
        with tempfile.TemporaryDirectory(prefix='workout-restic-') as temp:
            root = Path(temp)
            database = root / 'sample.sqlite'
            db = sqlite3.connect(database)
            db.execute('CREATE TABLE records(actual INTEGER)')
            db.execute('INSERT INTO records VALUES (6)')
            db.commit()
            db.close()
            password = root / 'password'
            password.write_text('synthetic-test-only-password')
            # Explicit test-only adapter bypass: production refuses local repos.
            backend = Restic.__new__(Restic)
            backend.env = {**os.environ, 'RESTIC_REPOSITORY': str(root / 'encrypted-repo'), 'RESTIC_PASSWORD_FILE': str(password), 'RESTIC_CACHE_DIR': str(root / 'cache')}
            checked('restic', 'init', env=backend.env)
            backup_id, restored = backend.archive_verified(database, root / 'restore')
            self.assertEqual(restored.read_bytes(), database.read_bytes())
            self.assertEqual(len(backup_id), 64)
            password.write_text('wrong-password')
            with self.assertRaises(RuntimeError):
                backend.retrieve(backup_id, database, root / 'wrong-password-restore')

    def test_production_configuration_rejects_local_backup(self):
        with tempfile.TemporaryDirectory() as temp:
            config = Path(temp) / 'restic.json'
            config.write_text(json.dumps({'RESTIC_REPOSITORY': '/same-sd-card/backup', 'RESTIC_PASSWORD_FILE':'/tmp/example'}))
            config.chmod(0o600)
            with self.assertRaises(ValueError):
                Restic(config)
