"""Create the digest-bound release artifact from the exact tested image."""
import hashlib
import json
import os
from pathlib import Path
import re
import sys

IMAGE = re.compile(r"ghcr\.io/jakesiddall/workouttracker@sha256:[a-f0-9]{64}")

def validate(release):
    if not IMAGE.fullmatch(release.get("image", "")):
        raise ValueError("Expected the workout image repository and a SHA-256 digest")
    if not re.fullmatch(r"[a-f0-9]{40}", release.get("commit", "")):
        raise ValueError("Expected a full source commit")
    runtime = release["runtime"]
    baseline = json.loads(Path(__file__).with_name('runtime.json').read_text())
    if set(runtime) != set(baseline) or runtime.get('format') != 1:
        raise ValueError('Unsupported runtime format; review the controller first')
    # Allow previously approved resource settings to roll back with the image.
    # Host mount, UID, port and origin are a fixed boundary, never arbitrary args.
    if runtime.get('memory') not in {'256m', '512m', '1g'}:
        raise ValueError('Unsupported runtime memory limit')
    if any(runtime.get(key) != baseline[key] for key in baseline if key != 'memory'):
        raise ValueError('Runtime changes the fixed host contract; review the controller first')
    if release.get("rollback_policy") != "preserve-existing-data-v1":
        raise ValueError("Breaking migrations require a separately reviewed recovery plan")
    return release

def identity(release):
    return hashlib.sha256(json.dumps(release, sort_keys=True).encode()).hexdigest()

if __name__ == "__main__":
    result = validate({
        "image": Path(sys.argv[1]).read_text().strip(),
        "commit": os.environ["GITHUB_SHA"],
        "runtime": json.loads(Path(__file__).with_name("runtime.json").read_text()),
        "rollback_policy": "preserve-existing-data-v1",
        "ci_run": os.environ["GITHUB_RUN_ID"],
        "ci_attempt": os.environ["GITHUB_RUN_ATTEMPT"]
    })
    Path(sys.argv[2]).write_text(json.dumps(result, indent=2) + "\n")
