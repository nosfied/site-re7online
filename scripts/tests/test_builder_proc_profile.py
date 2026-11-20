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


class DurableDisposableBuilderProcProfile(DisposableBuilderProcProfile):
    def setUp(self):
        super().setUp()
        self.enterContext(patch.object(
            observer, "DURABLE_ALLOWED_PREFIXES",
            {*observer.DURABLE_ALLOWED_PREFIXES, Path(tempfile.gettempdir())}))
        generation = "immutable-durable-proc-v1-external-20261118T000000Z"
        target = "1" * 40
        self.contract["generationId"] = generation
        self.contract["targetCommit"] = target
        self.lifecycle.update(
            generationId=generation,
            targetCommit=target,
            rootStorage={
                "policySha256": observer.DURABLE_ROOT_POLICY_SHA256,
                "rootClass": observer.DURABLE_ROOT_CLASS,
                "retention": observer.DURABLE_RETENTION,
                "allowedPrefix": tempfile.gettempdir(),
                "parentPath": str(self.root.parent),
            },
        )
        self._refresh_authorities()

    def _refresh_authorities(self):
        contract_raw = observer.canonical(self.contract)
        self.lifecycle["contractSha256"] = observer.digest(contract_raw)
        lifecycle_raw = observer.canonical(self.lifecycle)
        self.request.update(
            generationId=self.contract["generationId"],
            targetCommit=self.contract["targetCommit"],
            contractSha256=observer.digest(contract_raw),
            lifecycleSha256=observer.digest(lifecycle_raw),
            contract=contract_raw.decode(),
            lifecycle=lifecycle_raw.decode(),
        )

    def collect(self):
        return observer.collect_disposable_durable(observer.canonical(self.request))

    def authority_record(self, path):
        info = path.stat()
        return {"path": str(path), "sha256": observer.digest(path.read_bytes()),
                "device": info.st_dev, "inode": info.st_ino, "uid": info.st_uid,
                "gid": info.st_gid, "mode": f"0{info.st_mode & 0o777:03o}",
                "size": info.st_size}

    def bind_noncanonical_continuation(self):
        contract_raw = (observer.json.dumps(
            self.contract, sort_keys=True, indent=2) + "\n").encode()
        contract_path = self.custody / "contract.private.json"
        contract_path.write_bytes(contract_raw); contract_path.chmod(0o600)
        self.lifecycle.update(contractSha256=observer.digest(contract_raw), outcome="FAILED")
        receipt = {"schemaVersion": 1, "kind": "DISPOSABLE_BUILDER_EXPORT",
                   "generationId": self.contract["generationId"], "outcome": "FAILED",
                   "contractSha256": observer.digest(contract_raw),
                   "requestSha256": "3" * 64, "artifacts": []}
        receipt_path = self.custody / "disposable-builder.export-receipt.private.json"
        receipt_path.write_bytes(observer.canonical(receipt)); receipt_path.chmod(0o600)
        self.lifecycle["exportReceiptSha256"] = observer.digest(receipt_path.read_bytes())
        lifecycle_path = self.custody / "disposable-builder.lifecycle.private.json"
        lifecycle_path.write_bytes(observer.canonical(self.lifecycle)); lifecycle_path.chmod(0o600)
        self.request.update(
            contractSha256=observer.digest(contract_raw), contract=contract_raw.decode(),
            lifecycleSha256=observer.digest(lifecycle_path.read_bytes()),
            lifecycle=lifecycle_path.read_text(),
        )
        continuation = {
            "schemaVersion": 1, "kind": observer.AUTHORITY_CONTINUATION_KIND,
            "state": "SEALED_FOR_PRIVILEGED_OBSERVER",
            "generationId": self.contract["generationId"],
            "targetCommit": self.contract["targetCommit"],
            "historicalContract": self.authority_record(contract_path),
            "canonicalProjectionSha256": observer.digest(observer.canonical(self.contract)),
            "lifecycle": self.authority_record(lifecycle_path),
            "exportReceipt": self.authority_record(receipt_path),
            "observerCommand": observer.DURABLE_DISPOSABLE_COMMAND,
            "automaticSubstitution": False,
        }
        continuation_path = self.custody / "disposable-builder.authority-continuation.private.json"
        continuation_path.write_bytes(observer.canonical(continuation)); continuation_path.chmod(0o600)
        self.request["authorityContinuation"] = continuation_path.read_text()
        self.request["authorityContinuationAuthority"] = self.authority_record(continuation_path)
        return continuation

    def test_valid_request_is_bound_to_durable_policy_and_real_locks(self):
        result = self.collect()
        self.assertEqual(result["generationId"], self.contract["generationId"])
        self.assertEqual(result["candidatePaths"], [str(self.root)])
        self.assertEqual(
            [(item["device"], item["inode"]) for item in result["locks"]],
            [(item["device"], item["inode"]) for item in self.request["locks"]])

    def test_noncanonical_contract_requires_and_authenticates_explicit_continuation(self):
        self.bind_noncanonical_continuation()
        result = self.collect()
        self.assertEqual(result["contractSha256"], self.request["contractSha256"])
        del self.request["authorityContinuation"]
        del self.request["authorityContinuationAuthority"]
        with self.assertRaisesRegex(observer.Refused,
                                    "DURABLE_DISPOSABLE_CONTINUATION_REQUIRED"):
            self.collect()

    def test_continuation_denies_projection_physical_authority_and_cross_receipt(self):
        original = self.bind_noncanonical_continuation()
        variants = (
            ("canonicalProjectionSha256", "f" * 64, "DURABLE_DISPOSABLE_CONTINUATION"),
            ("generationId", "immutable-foreign", "DURABLE_DISPOSABLE_CONTINUATION"),
        )
        for key, value, predicate in variants:
            with self.subTest(key=key):
                changed = copy.deepcopy(original); changed[key] = value
                changed_raw = observer.canonical(changed)
                path = Path(self.request["authorityContinuationAuthority"]["path"])
                path.write_bytes(changed_raw); path.chmod(0o600)
                self.request["authorityContinuation"] = changed_raw.decode()
                self.request["authorityContinuationAuthority"] = self.authority_record(path)
                with self.assertRaisesRegex(observer.Refused, predicate):
                    self.collect()
        changed = copy.deepcopy(original)
        changed["historicalContract"]["inode"] += 1
        changed_raw = observer.canonical(changed)
        path = Path(self.request["authorityContinuationAuthority"]["path"])
        path.write_bytes(changed_raw); path.chmod(0o600)
        self.request["authorityContinuation"] = changed_raw.decode()
        self.request["authorityContinuationAuthority"] = self.authority_record(path)
        with self.assertRaisesRegex(observer.Refused,
                                    "DURABLE_DISPOSABLE_CONTINUATION_CONTRACT"):
            self.collect()

    def test_unknown_policy_generation_and_root_scope_are_denied(self):
        variants = (
            ("policySha256", "f" * 64, "DURABLE_DISPOSABLE_ROOT_POLICY"),
            ("allowedPrefix", "/var/tmp", "DURABLE_DISPOSABLE_ROOT_SCOPE"),
        )
        for key, value, predicate in variants:
            with self.subTest(key=key):
                original = self.lifecycle["rootStorage"][key]
                self.lifecycle["rootStorage"][key] = value
                self._refresh_authorities()
                with self.assertRaisesRegex(observer.Refused, predicate):
                    self.collect()
                self.lifecycle["rootStorage"][key] = original
                self._refresh_authorities()

    def test_cross_custody_and_forged_consumer_are_denied(self):
        original = self.contract["custodyRoot"]
        self.contract["custodyRoot"] = str(self.root / "inside")
        self._refresh_authorities()
        with self.assertRaisesRegex(observer.Refused, "DURABLE_DISPOSABLE_ROOT_SCOPE"):
            self.collect()
        self.contract["custodyRoot"] = original
        self._refresh_authorities()
        self.request["consumer"]["startTicks"] += 1
        with self.assertRaisesRegex(observer.Refused, "DISPOSABLE_CONSUMER_IDENTITY"):
            self.collect()

    def test_durable_sudo_command_is_exact(self):
        account = observer.pwd.getpwuid(os.getuid())
        environment = {
            "SUDO_UID": str(os.getuid()), "SUDO_GID": str(os.getgid()),
            "SUDO_USER": account.pw_name,
            "SUDO_COMMAND": observer.DURABLE_DISPOSABLE_SUDO_COMMAND,
        }
        with patch.object(observer.os, "geteuid", return_value=0), \
                patch.dict(observer.os.environ, environment, clear=True):
            result = observer.builder_administrative_execution(
                (os.getuid(), os.getgid()), observer.DURABLE_DISPOSABLE_SUDO_COMMAND)
        self.assertEqual(result["mode"], "AUTHENTICATED_SUDO")
        environment["SUDO_COMMAND"] += " extra"
        with patch.object(observer.os, "geteuid", return_value=0), \
                patch.dict(observer.os.environ, environment, clear=True), \
                self.assertRaisesRegex(observer.Refused, "BUILDER_SUDO_CALLER_IDENTITY"):
            observer.builder_administrative_execution(
                (os.getuid(), os.getgid()), observer.DURABLE_DISPOSABLE_SUDO_COMMAND)


if __name__ == "__main__":
    unittest.main()
