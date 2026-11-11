import copy
import fcntl
import importlib.util
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location(
    "observer", Path(__file__).resolve().parents[1] / "capacity-proc-observer.py")
observer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(observer)


class BuilderProcProfile(unittest.TestCase):
    def setUp(self):
        temp = self.enterContext(tempfile.TemporaryDirectory())
        root = Path(temp) / "builder"
        output = root / "build-output"
        producer = output / f"{observer.BUILDER_RELEASE}-producer"
        release = producer / observer.BUILDER_RELEASE
        directories = (root, output, producer, release, release / "api-runtime",
                       release / "frontend-runtime")
        locks = (root / ".deployment-window.lock", output / ".generation-build.lock")
        for path in directories:
            path.mkdir(mode=0o700)
        for path in locks:
            path.touch(mode=0o600)
        self.enterContext(patch.multiple(
            observer, BUILDER_ROOT=root, BUILDER_OUTPUT=output,
            BUILDER_DIRECTORIES=directories, BUILDER_LOCKS=locks,
            BUILDER_DEVICE=root.stat().st_dev))
        self.lock = locks[0]
        self.candidate = directories[-1]
        self.request = {
            "schemaVersion": 1, "kind": "A838BD33_BUILDER_PROC_REQUEST",
            "targetCommit": observer.BUILDER_TARGET, "releaseId": observer.BUILDER_RELEASE,
            **observer.BUILDER_DIGESTS, "nonce": "1" * 64,
            "paths": {
                str(path): {"device": path.stat().st_dev, "inode": path.stat().st_ino,
                            **({"sha256": observer.digest(path.read_bytes())} if path in locks else {})}
                for path in (*directories, *locks)
            },
        }
        self.contract = {
            "releaseId": observer.BUILDER_RELEASE, "targetCommit": observer.BUILDER_TARGET,
            "writerLockPath": str(locks[1]),
            "artifacts": [{"class": "DERIVED_OUTPUT_RUNTIME", "path": str(path),
                           "releaseId": observer.BUILDER_RELEASE,
                           "targetCommit": observer.BUILDER_TARGET,
                           "observedIdentity": self.request["paths"][str(path)].copy()}
                          for path in directories[-2:]],
        }
        self.enterContext(patch.dict(observer.BUILDER_DIGESTS))
        self.bind_contract()
        self.scan = self.enterContext(patch.object(observer, "scan_proc", return_value={
            "complete": True, "references": [], "activeWriters": [],
        }))

    def collect(self):
        return observer.collect_builder(observer.canonical(self.request))

    def bind_contract(self):
        raw = observer.canonical(self.contract)
        self.request["contract"] = raw.decode()
        self.request["contractSha256"] = observer.BUILDER_DIGESTS["contractSha256"] = observer.digest(raw)

    def test_production_layout_literals(self):
        self.assertEqual(observer.BUILDER_RUNTIME_ROOT, Path(
            "/tmp/re7-external-builder-a838bd33-v2/build-output/"
            "immutable-a838bd33-external-20261110T130618Z-producer/"
            "immutable-a838bd33-external-20261110T130618Z"))

    def test_wrong_release_or_producer_in_authenticated_contract(self):
        original = self.contract["artifacts"][0]["path"]
        release = observer.BUILDER_RELEASE
        for path in (original.replace(f"{release}-producer/", ""),
                     original.replace(f"{release}-producer", "other-producer"),
                     original.replace(f"/{release}/", "/other-release/")):
            with self.subTest(path=path):
                self.contract["artifacts"][0]["path"] = path
                self.bind_contract()
                with self.assertRaisesRegex(observer.Refused, "BUILDER_CONTRACT_PATHS"):
                    self.collect()
        self.scan.assert_not_called()

    def test_third_runtime_in_authenticated_contract(self):
        self.contract["artifacts"].append(
            dict(self.contract["artifacts"][0], path=str(self.candidate.parent / "worker-runtime")))
        self.bind_contract()
        with self.assertRaisesRegex(observer.Refused, "BUILDER_CONTRACT_PATHS"):
            self.collect()

    def test_tampered_contract(self):
        self.request["contract"] += " "
        with self.assertRaisesRegex(observer.Refused, "BUILDER_CONTRACT_SHA256"):
            self.collect()

    def test_symlink_to_same_runtime(self):
        moved = self.candidate.with_name("moved")
        self.candidate.rename(moved)
        self.candidate.symlink_to(moved)
        with self.assertRaisesRegex(observer.Refused, "BUILDER_PATH_IDENTITY"):
            self.collect()

    def test_attestation_is_bound_and_locks_are_held(self):
        def observe(paths, uid):
            self.assertEqual(paths, [str(path) for path in observer.BUILDER_DIRECTORIES[-2:]])
            self.assertEqual(uid, self.candidate.stat().st_uid)
            with self.lock.open("rb") as lock, self.assertRaises(BlockingIOError):
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return self.scan.return_value

        self.scan.side_effect = observe
        result = self.collect()
        self.assertEqual(result["requestSha256"], observer.digest(observer.canonical(self.request)))
        for key in ("nonce", "targetCommit", "releaseId", *observer.BUILDER_DIGESTS):
            self.assertEqual(result[key], self.request[key])
        self.assertTrue(result["observation"]["complete"])
        with self.lock.open("rb") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)

    def test_extra_path(self):
        self.request["paths"]["/extra"] = {"device": observer.BUILDER_DEVICE, "inode": 1}
        with self.assertRaisesRegex(observer.Refused, "BUILDER_PATHS"):
            self.collect()
        self.scan.assert_not_called()

    def test_wrong_inode(self):
        self.request["paths"][str(self.candidate)]["inode"] += 1
        with self.assertRaisesRegex(observer.Refused, "BUILDER_CONTRACT_RUNTIME_IDENTITY"):
            self.collect()

    def test_physical_inode_diverges_from_contract(self):
        self.candidate.rename(self.candidate.with_name("moved"))
        self.candidate.mkdir(mode=0o700)
        with self.assertRaisesRegex(observer.Refused, "BUILDER_PATH_IDENTITY"):
            self.collect()

    def test_lock_changed(self):
        self.lock.write_text("changed")
        with self.assertRaisesRegex(observer.Refused, "BUILDER_LOCK_BINDING"):
            self.collect()

    def test_lock_busy(self):
        with self.lock.open("rb") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaisesRegex(observer.Refused, "BUILDER_LOCK_BUSY"):
                self.collect()

    def test_bad_observations(self):
        for key, value, predicate in (
            ("complete", False, "BUILDER_PROCESS_OBSERVATION_INCOMPLETE"),
            ("references", [{}], "BUILDER_PROCESS_REFERENCE"),
            ("activeWriters", [{}], "BUILDER_ACTIVE_WRITER"),
        ):
            with self.subTest(key=key):
                original = copy.copy(self.scan.return_value)
                self.scan.return_value[key] = value
                with self.assertRaisesRegex(observer.Refused, predicate):
                    self.collect()
                self.scan.return_value = original

    def test_changed_during_scan(self):
        def observe(*_):
            self.candidate.chmod(0o755)
            return self.scan.return_value

        self.scan.side_effect = observe
        with self.assertRaisesRegex(observer.Refused, "BUILDER_PATH_CHANGED"):
            self.collect()

    def test_direct_root_administrative_execution(self):
        with patch.object(observer.os, "geteuid", return_value=0), \
                patch.dict(observer.os.environ, {}, clear=True):
            self.assertEqual(observer.builder_administrative_execution((os.getuid(), os.getgid())),
                             {"mode": "DIRECT_ROOT"})

    def test_authenticated_sudo_administrative_execution(self):
        account = observer.pwd.getpwuid(os.getuid())
        environment = {
            "SUDO_UID": str(os.getuid()), "SUDO_GID": str(os.getgid()),
            "SUDO_USER": account.pw_name, "SUDO_COMMAND": observer.BUILDER_SUDO_COMMAND,
        }
        with patch.object(observer.os, "geteuid", return_value=0), \
                patch.dict(observer.os.environ, environment, clear=True):
            result = observer.builder_administrative_execution((os.getuid(), os.getgid()))
        self.assertEqual(result["mode"], "AUTHENTICATED_SUDO")
        self.assertEqual(result["uid"], os.getuid())
        self.assertEqual(result["commandSha256"],
                         observer.digest(observer.BUILDER_SUDO_COMMAND.encode()))

    def test_sudo_administrative_execution_is_closed(self):
        account = observer.pwd.getpwuid(os.getuid())
        base = {
            "SUDO_UID": str(os.getuid()), "SUDO_GID": str(os.getgid()),
            "SUDO_USER": account.pw_name, "SUDO_COMMAND": observer.BUILDER_SUDO_COMMAND,
        }
        variants = (
            {**base, "SUDO_COMMAND": base["SUDO_COMMAND"] + " extra"},
            {**base, "SUDO_UID": str(os.getuid() + 1)},
            {**base, "SUDO_PS1": "unexpected"},
        )
        for environment in variants:
            with self.subTest(environment=environment), \
                    patch.object(observer.os, "geteuid", return_value=0), \
                    patch.dict(observer.os.environ, environment, clear=True), \
                    self.assertRaisesRegex(observer.Refused, "BUILDER_SUDO_CALLER_IDENTITY"):
                observer.builder_administrative_execution((os.getuid(), os.getgid()))

    def test_non_root_administrative_execution_is_denied(self):
        with patch.object(observer.os, "geteuid", return_value=1000), \
                patch.dict(observer.os.environ, {}, clear=True), \
                self.assertRaisesRegex(observer.Refused, "BUILDER_ROOT_REQUIRED"):
            observer.builder_administrative_execution((os.getuid(), os.getgid()))


if __name__ == "__main__":
    unittest.main()
