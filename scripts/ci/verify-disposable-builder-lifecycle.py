#!/usr/bin/env python3
"""Exercise a synthetic immutable package through install and real PM2 rollback."""
import argparse
import importlib.util
import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
import shutil
import tempfile

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location(
    "release_fixture", ROOT / "scripts/ci/test-converta-release.py")
assert SPEC and SPEC.loader
fixture = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(fixture)
producer = fixture.ReleaseProducerTest

def allocated(root):
    return sum(p.lstat().st_blocks * 512 for p in (root, *root.rglob("*")))


SERVER = """const http = require('node:http');
const role = 'ROLE';
http.createServer((req, res) => {
  res.statusCode = role === 'candidate' && req.url === '/fault' ? 503 : 200;
  res.end(role);
}).listen(Number(process.env.PORT), '127.0.0.1');
"""


def run_pm2_drill(root, final, pm2):
    pm2_home = root / "pm2-home"
    pm2_home.mkdir(mode=0o700)
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    env = dict(os.environ, PM2_HOME=str(pm2_home), PORT=str(port))
    rollback = root / "rollback-runtime"
    (rollback / "dist").mkdir(parents=True)
    (rollback / "dist/index.js").write_text(SERVER.replace("ROLE", "rollback"))
    current = root / "current"
    name = "converta-disposable-api-fixture"

    def cli(*args):
        result = subprocess.run([str(pm2), *args], env=env, timeout=25,
                                capture_output=True, text=True)
        assert result.returncode == 0, (args, result.stdout, result.stderr)
        return result.stdout

    def select(runtime):
        temporary = current.with_suffix(".next")
        temporary.symlink_to(runtime)
        temporary.replace(current)

    def ready(expected):
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=1) as response:
                    if response.read().decode() == expected:
                        return
            except OSError:
                pass
            time.sleep(0.1)
        raise AssertionError(f"readiness: {expected}")

    def start(runtime, role):
        select(runtime)
        cli("start", str(current / "dist/index.js"), "--name", name, "--cwd", str(current))
        ready(role)
        assert current.resolve() == runtime.resolve()

    try:
        start(rollback, "rollback")
        cli("delete", name)
        start(final / "api-runtime", "candidate")
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{port}/fault", timeout=2)
        except urllib.error.HTTPError as exc:
            assert exc.code == 503
        else:
            raise AssertionError("expected injected readiness failure")
        cli("delete", name)
        start(rollback, "rollback")
        assert not current.with_suffix(".next").exists()
        print("PM2_ACTIVATE_503_ROLLBACK_PASS")
    finally:
        cli("kill")
    assert not (pm2_home / "pm2.pid").exists()


def build(exchange):
    original_repo = fixture.fixture_repo

    def runnable_repo(root):
        repo, target, environment = original_repo(root)
        shim = root / "shims/npm"
        text = shim.read_text()
        needle = next(line for line in text.splitlines() if "api fixture" in line)
        replacement = (
            "    cat > dist/index.js <<'FIXTURE_SERVER'\n"
            + SERVER.replace("ROLE", "candidate") + "FIXTURE_SERVER"
        )
        shim.write_text(text.replace(needle, replacement))
        return repo, target, environment

    from unittest.mock import patch

    with patch.object(fixture, "fixture_repo", runnable_repo):
        producer.setUpClass()
        try:
            package = exchange / producer.package.name
            shutil.copyfile(producer.package, package)
            binding = {
                "package": package.name,
                "sha256": fixture.MODULE.sha256_bytes(package.read_bytes()),
                "target": producer.target,
                "release": producer.release_id,
            }
            print("BUILDER_CHECKPOINT_BYTES", allocated(producer.base))
            producer("test_failed_generation_is_closed_as_failed").test_failed_generation_is_closed_as_failed()
            print("INJECTED_BUILD_FAILURE_RECORDED")
        finally:
            producer.tearDownClass()
    assert not producer.base.exists()
    print("BUILDER_DISCARDED")
    return binding


def receive(exchange, binding, pm2):
    package = exchange / binding["package"]
    assert fixture.MODULE.sha256_bytes(package.read_bytes()) == binding["sha256"]
    with tempfile.TemporaryDirectory(prefix="disposable-receiver-") as directory:
        root = Path(directory)
        roots = {}
        for name in ("repository", "worktrees", "outputs", "releases", "staging", "evidence"):
            path = root / name
            path.mkdir(mode=0o700)
            info = path.stat()
            entry = {"path": str(path), "ownerUid": info.st_uid, "groupGid": info.st_gid,
                     "allowedModes": ["0700"]}
            roots[name] = [entry] if name == "evidence" else entry
        policy = root / "root-policy.private.json"
        fixture.write(policy, json.dumps({"schemaVersion": 1, "canonicalRoots": roots}), 0o600)
        result = fixture.invoke("install", "--package", str(package), "--target", binding["target"],
                                "--release-id", binding["release"], "--components", fixture.COMPONENTS,
                                "--installed-releases-root", str(root / "releases"),
                                "--root-policy", str(policy), "--root-policy-sha256",
                                fixture.MODULE.sha256_bytes(policy.read_bytes()))
        assert result.returncode == 0, result.stderr
        final = root / "releases" / binding["release"]
        verified = fixture.invoke("verify", "--release-root", str(final), "--target", binding["target"],
                                  "--release-id", binding["release"], "--components", fixture.COMPONENTS)
        assert verified.returncode == 0, verified.stderr
        assert set((root / "releases").iterdir()) == {final}
        assert not list((root / "staging").iterdir())
        print("INSTALLED_AND_VERIFIED_NO_STAGING", binding["sha256"])
        print("RECEIVER_INSTALLED_CHECKPOINT_BYTES", allocated(root))
        run_pm2_drill(root, final, pm2)
        assert fixture.MODULE.sha256_bytes(package.read_bytes()) == binding["sha256"]
        assert not list((root / "staging").iterdir())
    assert not root.exists()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pm2", type=Path, required=True)
    pm2 = parser.parse_args().pm2.resolve(strict=True)
    with tempfile.TemporaryDirectory(prefix="disposable-exchange-") as directory:
        exchange = Path(directory)
        binding = build(exchange)
        assert {entry.name for entry in exchange.iterdir()} == {binding["package"]}
        receive(exchange, binding, pm2)
    assert not exchange.exists()
    print("DISPOSABLE_BUILDER_PM2_LIFECYCLE_PASS")


if __name__ == "__main__":
    main()
