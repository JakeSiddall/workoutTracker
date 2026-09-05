"""Isolated container checks. Production data is never sent to hosted CI."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import uuid

def run(*args):
    return subprocess.check_output(args, text=True, stderr=subprocess.PIPE).strip()

def wait(container):
    script = "fetch('http://127.0.0.1:3001/api/health').then(async r=>{let j=await r.json();if(!r.ok||j.database!==true)process.exit(1)}).catch(()=>process.exit(1))"
    for _ in range(30):
        try:
            run('docker', 'exec', container, 'node', '-e', script)
            return
        except subprocess.CalledProcessError:
            time.sleep(1)
    raise RuntimeError('Container failed database readiness; inspect private host logs')

def smoke(image, data_dir, runtime=None):
    """Start and stop the app on the provided disposable data directory."""
    container = 'workout-check-' + uuid.uuid4().hex
    # Test data only. Production directory permissions are provisioned by JAK-9.
    os.chmod(data_dir, 0o777)
    for path in Path(data_dir).iterdir():
        # Fresh files may belong to container UID 1000 rather than the hosted
        # runner. They already have the right owner for restart; don't chmod them.
        if os.geteuid() == 0 or path.stat().st_uid == os.geteuid():
            os.chmod(path, 0o666)
    try:
        runtime = runtime or json.loads(Path(__file__).with_name('runtime.json').read_text())
        args = ['docker', 'run', '-d', '--name', container, '--network', 'none',
            '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
            '--memory', runtime['memory'], '--user', runtime['user'], '--pids-limit', '128', '--tmpfs', '/tmp:rw,nosuid,size=32m',
            '-v', f'{Path(data_dir).resolve()}:/data']
        for key, value in runtime['environment'].items():
            args += ['-e', f'{key}={value}']
        run(*args, image)
        wait(container)
        run('docker', 'stop', '--time', '20', container)
    finally:
        subprocess.run(['docker', 'rm', '-f', container], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)

if __name__ == '__main__':
    from storage import preserves, snapshot
    image = sys.argv[1]
    if run('docker', 'image', 'inspect', image, '--format', '{{.Architecture}}') != 'arm64':
        raise SystemExit('Expected an ARM64 image')
    with tempfile.TemporaryDirectory(prefix='workout-container-') as directory:
        root = Path(directory)
        data = root / 'data'
        data.mkdir()
        smoke(image, data)
        snapshot(data / 'workouts.sqlite', root / 'before.sqlite')
        smoke(image, data)
        preserves(root / 'before.sqlite', data / 'workouts.sqlite')
    print('ARM64 fresh database, database readiness, and restart checks passed')
