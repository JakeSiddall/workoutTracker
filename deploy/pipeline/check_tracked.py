"""Fail closed if private runtime files are tracked; never print contents."""
from pathlib import PurePosixPath
import re
import subprocess

files = subprocess.check_output(["git", "ls-files", "-z"]).decode().split("\0")
bad = [f for f in files if f and (
    re.search(r"\.(?:sqlite|db)(?:-(?:wal|shm))?$", f)
    or PurePosixPath(f).name in {".env", "restic.env", "target.json"}
    or f.startswith(("data/", "backups/"))
)]
if bad:
    raise SystemExit("Private runtime files are tracked: " + ", ".join(bad))
print("Tracked-state guard passed")
