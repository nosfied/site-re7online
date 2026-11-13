import copy
import fcntl
import importlib.util
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SPEC = importlib.util.spec_from_file_location(
    "observer", Path(__file__).resolve().parents[1] /
    "capacity-proc-observer-builder-a838bd33.py")
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


class DisposableBuilderProcProfile(unittest.TestCase):
    def setUp(self):
        temp = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.root = temp / "disposable"
        self.custody = temp / "custody"
        self.root.mkdir(mode=0o700); self.custody.mkdir(mode=0o700)
        roots = {}
        for name in ("worktrees", "outputs", "releases", "staging", "npm-cache", "temporary", "auxiliary"):
            path = self.root / name
            path.mkdir(mode=0o700)
            roots[name] = path
        self.worktree = roots["worktrees"] / "source"
        self.worktree.mkdir(mode=0o700)
        self.locks = (self.custody / "lifecycle.lock", self.custody / "writer.lock")
        for path in self.locks:
            path.touch(mode=0o600)
        self.contract = {
            "schemaVersion": 1, "generationId": observer.DISPOSABLE_GENERATION,
            "targetCommit": observer.DISPOSABLE_TARGET, "repository": str(temp / "repo"),
            "disposableRoot": str(self.root), "custodyRoot": str(self.custody),
            "ownerUid": os.getuid(), "groupGid": os.getgid(), "rootMode": "0700",
            "budget": {"requiredFreeBytes": 1, "requiredFreeInodes": 1,
                       "operationalReserveBytes": 1, "operationalReserveInodes": 1},
            "roots": {"worktrees": str(roots["worktrees"]), "outputs": str(roots["outputs"]),
                      "releases": str(roots["releases"]), "staging": str(roots["staging"]),
                      "cache": str(roots["npm-cache"]), "temporary": str(roots["temporary"]),
                      "auxiliary": str(roots["auxiliary"])},
            "worktreePath": str(self.worktree),
            "locks": {"lifecycle": str(self.locks[0]), "writer": str(self.locks[1])},
            "protectedPaths": [],
        }
        contract_raw = observer.canonical(self.contract)
        root_info = self.root.stat()
        self.lifecycle = {
            "schemaVersion": 1, "generationId": observer.DISPOSABLE_GENERATION,
            "targetCommit": observer.DISPOSABLE_TARGET,
            "contractSha256": observer.digest(contract_raw), "state": "EXPORTED",
            "event": "AUTHORITY_EXPORTED",
            "rootIdentity": {"path": str(self.root), "device": root_info.st_dev,
                             "inode": root_info.st_ino, "ownerUid": os.getuid(),
                             "groupGid": os.getgid(), "mode": "0700"},
        }
        lifecycle_raw = observer.canonical(self.lifecycle)
        self.enterContext(patch.multiple(
            observer, DISPOSABLE_ROOT=self.root, DISPOSABLE_CUSTODY=self.custody,
            DISPOSABLE_LOCKS=self.locks,
            DISPOSABLE_CONTRACT_SHA256=observer.digest(contract_raw),
            DISPOSABLE_LIFECYCLE_SHA256=observer.digest(lifecycle_raw)))
        self.descriptors = []
        for path in self.locks:
            descriptor = os.open(path, os.O_RDWR)
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.descriptors.append(descriptor)
            self.addCleanup(os.close, descriptor)
        self.request = {
            "schemaVersion": 1, "kind": "DISPOSABLE_BUILDER_PROC_REQUEST", "phase": "PREPARE",
            "generationId": observer.DISPOSABLE_GENERATION, "targetCommit": observer.DISPOSABLE_TARGET,
            "contractSha256": observer.DISPOSABLE_CONTRACT_SHA256,
            "lifecycleSha256": observer.DISPOSABLE_LIFECYCLE_SHA256,
            "contract": contract_raw.decode(), "lifecycle": lifecycle_raw.decode(),
            "nonce": "2" * 64,
            "consumer": {"pid": os.getpid(),
                         "startTicks": observer.start_ticks(Path("/proc") / str(os.getpid()))},
            "root": self.lifecycle["rootIdentity"], "worktree": str(self.worktree),
            "locks": [{"path": str(path), "device": path.stat().st_dev, "inode": path.stat().st_ino,
                       "sha256": observer.digest(path.read_bytes())} for path in self.locks],
            "maxAgeSeconds": 300,
        }
        self.scan = self.enterContext(patch.object(observer, "scan_proc", return_value={
            "complete": True, "references": [], "activeWriters": [], "failures": [],
            "failureDetailsTruncated": 0,
        }))

    def collect(self):
        return observer.collect_disposable(observer.canonical(self.request))

    def test_valid_request_is_bound_to_consumer_locks_and_root(self):
        result = self.collect()
        self.assertEqual(result["requestSha256"], observer.digest(observer.canonical(self.request)))
        self.assertEqual(result["candidatePaths"], [str(self.root)])
        self.assertEqual(result["consumer"], self.request["consumer"])
        self.assertTrue(result["observation"]["complete"])

    def test_missing_consumer_lock_is_denied(self):
        fcntl.flock(self.descriptors[-1], fcntl.LOCK_UN)
        with self.assertRaisesRegex(observer.Refused, "DISPOSABLE_CONSUMER_LOCKS"):
            self.collect()
        self.scan.assert_not_called()

    def test_incomplete_reference_and_writer_are_denied(self):
        for key, value, predicate in (
            ("complete", False, "DISPOSABLE_PROCESS_OBSERVATION_INCOMPLETE"),
            ("references", [{"pid": 1}], "DISPOSABLE_PROCESS_REFERENCE"),
            ("activeWriters", [{"pid": 1}], "DISPOSABLE_ACTIVE_WRITER"),
        ):
            with self.subTest(key=key):
                original = copy.deepcopy(self.scan.return_value)
                self.scan.return_value[key] = value
                with self.assertRaisesRegex(observer.Refused, predicate):
                    self.collect()
                self.scan.return_value = original

    def test_contract_lifecycle_or_root_identity_drift_is_denied(self):
        for key in ("contract", "lifecycle"):
            with self.subTest(key=key):
                original = self.request[key]
                self.request[key] += " "
                with self.assertRaisesRegex(observer.Refused, "DISPOSABLE_AUTHORITY"):
                    self.collect()
                self.request[key] = original
        moved = self.root.with_name("moved")
        self.root.rename(moved)
        self.root.mkdir(mode=0o700)
        with self.assertRaisesRegex(observer.Refused, "DISPOSABLE_PATH_IDENTITY"):
            self.collect()

    def test_execute_phase_has_closed_validity(self):
        self.request.update(phase="EXECUTE", maxAgeSeconds=60)
        self.assertEqual(self.collect()["phase"], "EXECUTE")
        self.request["maxAgeSeconds"] = 300
        with self.assertRaisesRegex(observer.Refused, "DISPOSABLE_REQUEST_SCHEMA"):
            self.collect()


if __name__ == "__main__":
    unittest.main()
