import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest


SCRIPTS = Path(__file__).resolve().parents[1]
TOOL = SCRIPTS / "deploy-control-worktree-materialize.py"
LIFECYCLE = SCRIPTS / "preparation_artifact_lifecycle.py"
spec = importlib.util.spec_from_file_location("preparation_artifact_lifecycle", LIFECYCLE)
lifecycle = importlib.util.module_from_spec(spec); spec.loader.exec_module(lifecycle)
CONTROL_NAMES = ("deploy-preparation-admission.py", "preparation_artifact_lifecycle.py",
                 "operational_state_contract.py")
INSTALLER_SOURCES = {
    "scripts/re7-converta-backup": 0o755,
    "scripts/backup-retention-protected-observer.py": 0o755,
    "scripts/read-state-backup-restore-isolated.py": 0o755,
    "scripts/install-re7-converta-backup-protected-retention.py": 0o755,
    "config/sudoers/re7online-backup-retention-protected-observer": 0o644,
    "config/backup-read-state.v2.json": 0o644,
}


class DeployControlWorktreeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.base = Path(self.temp.name)
        self.repo = self.base / "repo"; self.controls = self.base / "deploy-control"
        self.repo.mkdir(); self.controls.mkdir()
        subprocess.run(["git", "-C", str(self.repo), "init", "-q"], check=True)
        subprocess.run(["git", "-C", str(self.repo), "config", "user.email", "fixture@example.test"], check=True)
        subprocess.run(["git", "-C", str(self.repo), "config", "user.name", "Fixture"], check=True)
        (self.repo / "scripts").mkdir()
        for name in CONTROL_NAMES:
            shutil.copyfile(SCRIPTS / name, self.repo / "scripts" / name)
        for relative, mode in INSTALLER_SOURCES.items():
            target = self.repo / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            source = SCRIPTS.parent / relative if relative.startswith("config/") else SCRIPTS / Path(relative).name
            shutil.copyfile(source, target)
            target.chmod(mode)
        (self.repo / ".gitignore").write_text("private-*.txt\n")
        subprocess.run(["git", "-C", str(self.repo), "add", "scripts", "config", ".gitignore"],
                       check=True)
        subprocess.run(["git", "-C", str(self.repo), "commit", "-qm", "fixture"], check=True)
        self.commit = self.git("rev-parse", "HEAD"); self.tree = self.git("rev-parse", "HEAD^{tree}")
        self.destination = self.controls / self.commit[:12]
        self.contract = self.base / "contract.private.json"
        authority = hashlib.sha256((self.commit + "\n").encode()).hexdigest()
        equivalence = hashlib.sha256(lifecycle.canonical(
            {"repository": str(self.repo), "commit": self.commit, "tree": self.tree})).hexdigest()
        self.value = {"schemaVersion": 1, "generationId": "control-" + self.commit[:12],
            "reservationRoot": str(self.controls), "preparationArtifacts": [{
                "path": str(self.destination), "scope": "deploy-control:" + self.commit,
                "owner": "fixture", "budgetBytes": 1024 * 1024, "budgetInodes": 100,
                "protection": "DERIVED_WITH_AUTHORITY",
                "authority": {"path": str(self.repo), "sha256": authority},
                "terminalDisposition": "SANITIZE_AFTER_USE",
                "equivalenceSha256": equivalence,
                "operation": {"name": "materialize-deploy-control-worktree",
                              "kind": "git-worktree", "artifactIndex": 0,
                              "predictedBytes": 1024 * 1024, "predictedInodes": 100}}]}
        self.write_private(self.contract, self.value)

    def tearDown(self):
        subprocess.run(["git", "-C", str(self.repo), "worktree", "prune"], check=False)
        self.temp.cleanup()

    def git(self, *args):
        return subprocess.check_output(["git", "-C", str(self.repo), *args], text=True).strip()

    @staticmethod
    def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()

    @staticmethod
    def write_private(path, value):
        path.write_bytes(lifecycle.canonical(value)); path.chmod(0o600)

    def run_tool(self, *args, umask=-1):
        return subprocess.run([sys.executable, "-B", str(TOOL), *map(str, args)],
            text=True, capture_output=True,
            env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}, umask=umask)

    def materialize(self, *, umask=-1):
        result = self.run_tool("materialize", "--repository", self.repo,
            "--destination", self.destination, "--commit", self.commit,
            "--contract", self.contract, "--contract-sha256", self.sha(self.contract),
            umask=umask)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def terminal(self, materialized, outcome="TERMINAL_SUCCESS", path=None,
                 operation=None):
        receipt = self.base / (outcome.lower() + ".private.json")
        self.write_private(receipt, {"schemaVersion": 1,
            "kind": "DEPLOY_CONTROL_OPERATION_TERMINAL_RECEIPT",
            "operationId": operation or self.value["generationId"],
            "controlPath": str(path or self.destination),
            "controlCommit": self.commit,
            "materializationReceiptSha256": materialized["materializationReceiptSha256"],
            "outcome": outcome})
        return receipt

    def close(self, materialized, receipt):
        lifecycle_path = Path(materialized["lifecyclePath"])
        return self.run_tool("close", "--lifecycle", lifecycle_path,
            "--lifecycle-sha256", self.sha(lifecycle_path),
            "--terminal-receipt", receipt,
            "--terminal-receipt-sha256", self.sha(receipt),
            "--owner", "fixture", "--reason", "terminal fixture")

    def derived_copies(self):
        private = self.destination / "private-control"
        private.mkdir(mode=0o700)
        result = []
        for name in CONTROL_NAMES:
            authority = "scripts/" + name
            path = "private-control/" + name
            shutil.copyfile(self.destination / authority, self.destination / path)
            (self.destination / path).chmod(0o600)
            result.append({"path": path,
                "sha256": self.sha(self.destination / path),
                "authoritySource": authority})
        return result

    def consume_request(self, materialized, derived_copies=None):
        output = self.base / "private-custody"; output.mkdir(mode=0o700)
        request = self.base / "consume-request.private.json"
        controls = []
        for name in CONTROL_NAMES:
            source = "scripts/" + name
            controls.append({"source": source, "destination": source,
                "sha256": hashlib.sha256((self.repo / source).read_bytes()).hexdigest()})
        value = {"schemaVersion": 2 if derived_copies is not None else 1,
            "kind": "DEPLOY_CONTROL_MATERIALIZE_CONTROLS",
            "operationId": self.value["generationId"],
            "controlPath": str(self.destination), "controlCommit": self.commit,
            "materializationReceiptSha256": materialized["materializationReceiptSha256"],
            "outputRoot": str(output), "controls": controls}
        if derived_copies is not None:
            value["derivedCopies"] = derived_copies
        self.write_private(request, value)
        return output, request

    def consume(self, materialized, request):
        lifecycle_path = Path(materialized["lifecyclePath"])
        materialization = lifecycle_path.parent / "materialization-receipt.private.json"
        return self.run_tool("consume", "--lifecycle", lifecycle_path,
            "--lifecycle-sha256", self.sha(lifecycle_path),
            "--materialization-receipt", materialization,
            "--materialization-receipt-sha256", self.sha(materialization),
            "--request", request, "--request-sha256", self.sha(request),
            "--owner", "fixture", "--reason", "controls materialized")

    def stage_operation_receipt(self, materialized, output, request):
        request_value = json.loads(request.read_text())
        for item in request_value["controls"]:
            destination = output / item["destination"]
            destination.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            destination.write_bytes((self.destination / item["source"]).read_bytes())
            destination.chmod(0o600)
        operation = {"schemaVersion": 1,
            "kind": "DEPLOY_CONTROL_CONTROLS_MATERIALIZED",
            "operationId": self.value["generationId"],
            "controlPath": str(self.destination), "controlCommit": self.commit,
            "materializationReceiptSha256": materialized["materializationReceiptSha256"],
            "requestSha256": self.sha(request), "controls": request_value["controls"]}
        self.write_private(output / "deploy-control-operation-receipt.private.json", operation)
        return request_value

    def stage_completed_copy_disposition(self, output, request, copies):
        for ordinal, item in enumerate(copies, 1):
            attempt = {"schemaVersion": 1,
                "kind": "DEPLOY_CONTROL_DERIVED_COPY_ATTEMPT",
                "operationId": self.value["generationId"],
                "controlPath": str(self.destination), "controlCommit": self.commit,
                "requestSha256": self.sha(request), "ordinal": ordinal, **item}
            attempt_raw = lifecycle.canonical(attempt)
            self.write_private(output /
                f"deploy-control-derived-copy-{ordinal:02d}-attempt.private.json", attempt)
            (self.destination / item["path"]).unlink()
            receipt = {"schemaVersion": 1,
                "kind": "DEPLOY_CONTROL_DERIVED_COPY_SANITIZED",
                "operationId": self.value["generationId"],
                "controlPath": str(self.destination), "controlCommit": self.commit,
                "requestSha256": self.sha(request),
                "attemptSha256": hashlib.sha256(attempt_raw).hexdigest(),
                "ordinal": ordinal, **item, "absent": True}
            self.write_private(output /
                f"deploy-control-derived-copy-{ordinal:02d}-receipt.private.json", receipt)

    def test_real_control_materialization_closes_worktree_end_to_end(self):
        materialized = self.materialize()
        output, request = self.consume_request(materialized)
        result = self.consume(materialized, request)
        self.assertEqual(result.returncode, 0, result.stderr)
        value = json.loads(result.stdout)
        self.assertEqual(value["state"], "SANITIZED")
        self.assertFalse(self.destination.exists())
        copied = output / "scripts/deploy-preparation-admission.py"
        self.assertEqual(copied.read_bytes(), (SCRIPTS / copied.name).read_bytes())
        self.assertEqual(copied.stat().st_mode & 0o777, 0o600)
        imported = subprocess.run([sys.executable, "-B", str(copied), "--help"],
                                  capture_output=True, text=True,
                                  env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"})
        self.assertEqual(imported.returncode, 0, imported.stderr)
        self.assertTrue((output / "deploy-control-operation-receipt.private.json").exists())
        self.assertTrue((output / "deploy-control-terminal-receipt.private.json").exists())
        lifecycle_path = Path(materialized["lifecyclePath"])
        self.assertEqual(json.loads(lifecycle_path.read_text())["state"], "SANITIZED")
        self.assertEqual(lifecycle.validate_existing_lifecycles(self.controls, self.value)
                         ["reservedBytes"], 0)

    def test_shared_repository_umask_is_closed_and_real_installer_sources_pass(self):
        subprocess.run(["git", "-C", str(self.repo), "config", "core.sharedRepository", "true"],
                       check=True)
        source_hashes = {relative: self.sha(self.repo / relative)
                         for relative in INSTALLER_SOURCES}
        materialized = self.materialize(umask=0o002)
        for relative, mode in INSTALLER_SOURCES.items():
            staged = self.destination / relative
            self.assertEqual(stat.S_IMODE(staged.lstat().st_mode), mode)
            self.assertEqual(self.sha(staged), source_hashes[relative])
        receipt = json.loads((Path(materialized["lifecyclePath"]).parent /
                              "materialization-receipt.private.json").read_text())
        self.assertEqual(receipt["schemaVersion"], 2)
        self.assertEqual(receipt["physicalTreeSha256"], materialized["physicalTreeSha256"])
        self.assertEqual(self.git("-C", str(self.destination), "status", "--porcelain=v1",
                                  "--untracked-files=all", "--ignored=matching"), "")
        code = """import importlib.util, pathlib, sys
path = pathlib.Path(sys.argv[1])
spec = importlib.util.spec_from_file_location('real_installer', path)
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
for source, expected, mode in (
    (module.BACKUP_SOURCE, module.BACKUP_SOURCE_SHA256, 0o755),
    (module.OBSERVER_SOURCE, module.OBSERVER_SOURCE_SHA256, 0o755),
    (module.SUDOERS_SOURCE, module.SUDOERS_SOURCE_SHA256, 0o644),
    (module.READ_STATE_CONTRACT_SOURCE, module.READ_STATE_CONTRACT_SOURCE_SHA256, 0o644),
    (module.READ_STATE_RESTORE_SOURCE, module.READ_STATE_RESTORE_SOURCE_SHA256, 0o755),
): module.read_regular(source, expected, {mode})
print('INSTALLER_SOURCE_VALIDATION_PASS')
"""
        validated = subprocess.run(
            [sys.executable, "-I", "-B", "-E", "-s", "-c", code,
             str(self.destination / "scripts/install-re7-converta-backup-protected-retention.py")],
            text=True, capture_output=True)
        self.assertEqual(validated.returncode, 0, validated.stderr)
        self.assertIn("INSTALLER_SOURCE_VALIDATION_PASS", validated.stdout)

    def test_physical_mode_drift_is_denied_before_consumption(self):
        materialized = self.materialize()
        changed = self.destination / "scripts/deploy-preparation-admission.py"
        changed.chmod(0o664)
        output, request = self.consume_request(materialized)
        denied = self.consume(materialized, request)
        self.assertNotEqual(denied.returncode, 0)
        self.assertIn("deploy_control_tracked_mode", denied.stderr)
        self.assertTrue(self.destination.exists())
        self.assertFalse((output / "deploy-control-operation-receipt.private.json").exists())

    def test_tracked_symlink_and_content_drift_are_denied(self):
        materialized = self.materialize()
        changed = self.destination / "scripts/deploy-preparation-admission.py"
        changed.unlink(); changed.symlink_to("preparation_artifact_lifecycle.py")
        output, request = self.consume_request(materialized)
        denied = self.consume(materialized, request)
        self.assertNotEqual(denied.returncode, 0)
        self.assertIn("deploy_control_tracked_mode", denied.stderr)
        self.assertTrue(changed.is_symlink())
        self.assertFalse((output / "deploy-control-operation-receipt.private.json").exists())

    def test_tracked_bytes_drift_is_denied_against_materialization_receipt(self):
        materialized = self.materialize()
        changed = self.destination / "scripts/deploy-preparation-admission.py"
        changed.write_bytes(changed.read_bytes() + b"\n# drift\n")
        changed.chmod(0o644)
        output, request = self.consume_request(materialized)
        denied = self.consume(materialized, request)
        self.assertNotEqual(denied.returncode, 0)
        self.assertIn("deploy_control_physical_tree_hash", denied.stderr)
        self.assertTrue(self.destination.exists())
        self.assertFalse((output / "deploy-control-operation-receipt.private.json").exists())

    def test_historical_schema_one_materialization_receipt_remains_consumable(self):
        materialized = self.materialize()
        receipt_path = (Path(materialized["lifecyclePath"]).parent /
                        "materialization-receipt.private.json")
        receipt = json.loads(receipt_path.read_text())
        receipt["schemaVersion"] = 1
        receipt.pop("physicalTreeSha256")
        self.write_private(receipt_path, receipt)
        materialized["materializationReceiptSha256"] = self.sha(receipt_path)
        output, request = self.consume_request(materialized)
        consumed = self.consume(materialized, request)
        self.assertEqual(consumed.returncode, 0, consumed.stderr)
        self.assertEqual(json.loads(consumed.stdout)["state"], "SANITIZED")
        self.assertTrue((output / "deploy-control-terminal-receipt.private.json").exists())

    def test_tracked_symlink_is_denied_during_materialization(self):
        target = self.repo / "scripts" / "linked-control.py"
        target.symlink_to("deploy-preparation-admission.py")
        subprocess.run(["git", "-C", str(self.repo), "add", "scripts/linked-control.py"],
                       check=True)
        subprocess.run(["git", "-C", str(self.repo), "commit", "-qm", "tracked symlink"],
                       check=True)
        self.commit = self.git("rev-parse", "HEAD")
        self.tree = self.git("rev-parse", "HEAD^{tree}")
        self.destination = self.controls / self.commit[:12]
        item = self.value["preparationArtifacts"][0]
        item["path"] = str(self.destination)
        item["scope"] = "deploy-control:" + self.commit
        item["authority"]["sha256"] = hashlib.sha256(
            (self.commit + "\n").encode()).hexdigest()
        item["equivalenceSha256"] = hashlib.sha256(lifecycle.canonical({
            "repository": str(self.repo), "commit": self.commit,
            "tree": self.tree})).hexdigest()
        self.value["generationId"] = "control-" + self.commit[:12]
        self.write_private(self.contract, self.value)
        denied = self.run_tool("materialize", "--repository", self.repo,
            "--destination", self.destination, "--commit", self.commit,
            "--contract", self.contract, "--contract-sha256", self.sha(self.contract),
            umask=0o002)
        self.assertNotEqual(denied.returncode, 0)
        self.assertIn("deploy_control_tracked_mode", denied.stderr)
        lifecycle_path = (self.controls / ("." + self.destination.name + ".lifecycle") /
                          "preparation-artifacts.lifecycle.private.json")
        self.assertEqual(json.loads(lifecycle_path.read_text())["state"], "RETENTION_DEBT")
        self.assertFalse((lifecycle_path.parent /
                          "materialization-receipt.private.json").exists())

    def test_exact_private_copies_receive_individual_receipts_before_sanitization(self):
        materialized = self.materialize()
        copies = self.derived_copies()
        output, request = self.consume_request(materialized, copies)
        result = self.consume(materialized, request)
        self.assertEqual(result.returncode, 0, result.stderr)
        value = json.loads(result.stdout)
        self.assertEqual(value["state"], "SANITIZED")
        self.assertEqual(len(value["derivedCopyReceipts"]), len(CONTROL_NAMES))
        for ordinal, item in enumerate(copies, 1):
            attempt = output / f"deploy-control-derived-copy-{ordinal:02d}-attempt.private.json"
            receipt = output / f"deploy-control-derived-copy-{ordinal:02d}-receipt.private.json"
            self.assertTrue(attempt.is_file())
            receipt_value = json.loads(receipt.read_text())
            self.assertEqual(receipt_value["kind"],
                             "DEPLOY_CONTROL_DERIVED_COPY_SANITIZED")
            self.assertEqual(receipt_value["path"], item["path"])
            self.assertEqual(receipt_value["sha256"], item["sha256"])
            self.assertTrue(receipt_value["absent"])
        self.assertFalse(self.destination.exists())
        self.assertNotIn(f"worktree {self.destination}",
                         self.git("worktree", "list", "--porcelain").splitlines())

    def test_private_copy_drift_preserves_tree_and_records_debt(self):
        materialized = self.materialize()
        copies = self.derived_copies()
        output, request = self.consume_request(materialized, copies)
        changed = self.destination / copies[0]["path"]
        changed.write_text("different private bytes\n"); changed.chmod(0o600)
        result = self.consume(materialized, request)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("deploy_control_derived_copy_hash", result.stderr)
        self.assertTrue(changed.exists())
        self.assertTrue((self.destination / copies[1]["path"]).exists())
        self.assertEqual(json.loads(Path(materialized["lifecyclePath"]).read_text())["state"],
                         "RETENTION_DEBT")
        self.assertEqual(json.loads((output /
            "deploy-control-terminal-receipt.private.json").read_text())["outcome"],
            "TERMINAL_FAILURE")

    def test_unexpected_private_content_blocks_before_any_copy_disposition(self):
        materialized = self.materialize()
        copies = self.derived_copies()
        output, request = self.consume_request(materialized, copies)
        extra = self.destination / "private-control/unique-evidence.txt"
        extra.write_text("unique\n"); extra.chmod(0o600)
        result = self.consume(materialized, request)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("deploy_control_consume_drift", result.stderr)
        self.assertTrue(extra.exists())
        self.assertTrue(all((self.destination / item["path"]).exists() for item in copies))

    def test_resume_after_durable_copy_attempt_does_not_repeat_disposition(self):
        materialized = self.materialize()
        copies = self.derived_copies()
        output, request = self.consume_request(materialized, copies)
        self.stage_operation_receipt(materialized, output, request)
        request_sha = self.sha(request)
        first = copies[0]
        attempt = {"schemaVersion": 1, "kind": "DEPLOY_CONTROL_DERIVED_COPY_ATTEMPT",
            "operationId": self.value["generationId"],
            "controlPath": str(self.destination), "controlCommit": self.commit,
            "requestSha256": request_sha, "ordinal": 1, **first}
        self.write_private(
            output / "deploy-control-derived-copy-01-attempt.private.json", attempt)
        (self.destination / first["path"]).unlink()
        result = self.consume(materialized, request)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(self.destination.exists())
        receipt = json.loads((output /
            "deploy-control-derived-copy-01-receipt.private.json").read_text())
        self.assertEqual(receipt["attemptSha256"],
                         hashlib.sha256(lifecycle.canonical(attempt)).hexdigest())

    def test_resume_after_operation_receipt_denies_absence_without_attempt_before_unlink(self):
        materialized = self.materialize()
        copies = self.derived_copies()
        output, request = self.consume_request(materialized, copies)
        self.stage_operation_receipt(materialized, output, request)
        missing = self.destination / copies[0]["path"]
        missing.unlink()
        remaining = self.destination / copies[1]["path"]
        result = self.consume(materialized, request)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("deploy_control_derived_copy_absent_without_attempt", result.stderr)
        self.assertTrue(remaining.exists())
        self.assertFalse((output /
            "deploy-control-derived-copy-01-attempt.private.json").exists())
        self.assertFalse((output /
            "deploy-control-derived-copy-02-attempt.private.json").exists())

    def test_resume_after_operation_receipt_denies_new_extra_before_unlink(self):
        materialized = self.materialize()
        copies = self.derived_copies()
        output, request = self.consume_request(materialized, copies)
        self.stage_operation_receipt(materialized, output, request)
        extra = self.destination / "private-control/appeared-after-interruption.txt"
        extra.write_text("unique evidence\n"); extra.chmod(0o600)
        result = self.consume(materialized, request)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("deploy_control_consume_drift", result.stderr)
        self.assertTrue(extra.exists())
        self.assertTrue(all((self.destination / item["path"]).exists() for item in copies))
        self.assertFalse((output /
            "deploy-control-derived-copy-01-attempt.private.json").exists())
        self.assertFalse((output /
            "deploy-control-derived-copy-02-attempt.private.json").exists())

    def test_resume_after_operation_receipt_denies_crossed_copy_receipt_before_unlink(self):
        materialized = self.materialize()
        copies = self.derived_copies()
        output, request = self.consume_request(materialized, copies)
        self.stage_operation_receipt(materialized, output, request)
        first = copies[0]
        attempt = {"schemaVersion": 1, "kind": "DEPLOY_CONTROL_DERIVED_COPY_ATTEMPT",
            "operationId": self.value["generationId"],
            "controlPath": str(self.destination), "controlCommit": self.commit,
            "requestSha256": self.sha(request), "ordinal": 1, **first}
        self.write_private(
            output / "deploy-control-derived-copy-01-attempt.private.json", attempt)
        crossed = {"schemaVersion": 1,
            "kind": "DEPLOY_CONTROL_DERIVED_COPY_SANITIZED",
            "operationId": self.value["generationId"],
            "controlPath": str(self.destination), "controlCommit": self.commit,
            "requestSha256": "f" * 64,
            "attemptSha256": hashlib.sha256(lifecycle.canonical(attempt)).hexdigest(),
            "ordinal": 1, **first, "absent": True}
        self.write_private(
            output / "deploy-control-derived-copy-01-receipt.private.json", crossed)
        result = self.consume(materialized, request)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("deploy_control_derived_copy_receipt_hash", result.stderr)
        self.assertTrue(all((self.destination / item["path"]).exists() for item in copies))
        self.assertFalse((output /
            "deploy-control-derived-copy-02-attempt.private.json").exists())

    def test_crossed_terminal_receipt_is_denied_before_any_copy_disposition(self):
        materialized = self.materialize()
        copies = self.derived_copies()
        output, request = self.consume_request(materialized, copies)
        self.stage_operation_receipt(materialized, output, request)
        crossed = {"schemaVersion": 1,
            "kind": "DEPLOY_CONTROL_OPERATION_TERMINAL_RECEIPT",
            "operationId": "another-operation", "controlPath": str(self.destination),
            "controlCommit": self.commit,
            "materializationReceiptSha256": materialized["materializationReceiptSha256"],
            "outcome": "TERMINAL_SUCCESS"}
        self.write_private(output / "deploy-control-terminal-receipt.private.json", crossed)
        result = self.consume(materialized, request)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("deploy_control_terminal_receipt_hash", result.stderr)
        self.assertTrue(all((self.destination / item["path"]).exists() for item in copies))
        self.assertIn(f"worktree {self.destination}",
                      self.git("worktree", "list", "--porcelain").splitlines())
        self.assertEqual(json.loads(Path(materialized["lifecyclePath"]).read_text())["state"],
                         "OPEN")

    def test_schema_one_resume_after_git_disposition_closes_open_lifecycle(self):
        materialized = self.materialize()
        output, request = self.consume_request(materialized)
        self.stage_operation_receipt(materialized, output, request)
        subprocess.run(["git", "-C", str(self.repo), "worktree", "remove",
                        str(self.destination)], check=True)
        result = self.consume(materialized, request)
        self.assertEqual(result.returncode, 0, result.stderr)
        value = json.loads(result.stdout)
        self.assertEqual(value["state"], "SANITIZED")
        self.assertEqual(value["derivedCopyReceipts"], [])
        self.assertTrue((output / "deploy-control-terminal-receipt.private.json").exists())
        self.assertNotIn(f"worktree {self.destination}",
                         self.git("worktree", "list", "--porcelain").splitlines())

    def test_schema_two_resume_after_git_disposition_requires_copy_receipts(self):
        materialized = self.materialize()
        copies = self.derived_copies()
        output, request = self.consume_request(materialized, copies)
        self.stage_operation_receipt(materialized, output, request)
        self.stage_completed_copy_disposition(output, request, copies)
        subprocess.run(["git", "-C", str(self.repo), "worktree", "remove",
                        str(self.destination)], check=True)
        result = self.consume(materialized, request)
        self.assertEqual(result.returncode, 0, result.stderr)
        value = json.loads(result.stdout)
        self.assertEqual(value["state"], "SANITIZED")
        self.assertEqual(len(value["derivedCopyReceipts"]), len(CONTROL_NAMES))
        self.assertTrue((output / "deploy-control-terminal-receipt.private.json").exists())
        self.assertNotIn(f"worktree {self.destination}",
                         self.git("worktree", "list", "--porcelain").splitlines())

    def test_schema_two_absent_worktree_without_copy_receipts_is_denied(self):
        materialized = self.materialize()
        copies = self.derived_copies()
        output, request = self.consume_request(materialized, copies)
        self.stage_operation_receipt(materialized, output, request)
        self.stage_completed_copy_disposition(output, request, copies)
        (output / "deploy-control-derived-copy-02-receipt.private.json").unlink()
        subprocess.run(["git", "-C", str(self.repo), "worktree", "remove",
                        str(self.destination)], check=True)
        result = self.consume(materialized, request)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("deploy_control_derived_copy_receipt", result.stderr)
        self.assertFalse((output / "deploy-control-terminal-receipt.private.json").exists())
        self.assertEqual(json.loads(Path(materialized["lifecyclePath"]).read_text())["state"],
                         "OPEN")

    def test_absent_copy_without_durable_attempt_is_denied(self):
        materialized = self.materialize()
        copies = self.derived_copies()
        output, request = self.consume_request(materialized, copies)
        (self.destination / copies[0]["path"]).unlink()
        result = self.consume(materialized, request)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("deploy_control_consume_drift", result.stderr)
        self.assertTrue(self.destination.exists())
        self.assertTrue((self.destination / copies[1]["path"]).exists())

    def test_control_operation_failure_records_debt_before_next_allocation(self):
        materialized = self.materialize()
        output, request = self.consume_request(materialized)
        (self.destination / "unique-private.txt").write_text("must not disappear\n")
        result = self.consume(materialized, request)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("deploy_control_consume_drift", result.stderr)
        self.assertTrue(self.destination.exists())
        terminal = json.loads((output / "deploy-control-terminal-receipt.private.json").read_text())
        self.assertEqual(terminal["outcome"], "TERMINAL_FAILURE")
        lifecycle_path = Path(materialized["lifecyclePath"])
        self.assertEqual(json.loads(lifecycle_path.read_text())["state"], "RETENTION_DEBT")
        with self.assertRaisesRegex(ValueError, "equivalent_preparation_pending"):
            lifecycle.validate_existing_lifecycles(self.controls, self.value)

    def test_ignored_private_content_preserves_registered_worktree_as_debt(self):
        materialized = self.materialize()
        output, request = self.consume_request(materialized)
        private = self.destination / "private-customer-evidence.txt"
        private.write_text("unique ignored evidence\n")
        self.assertEqual(self.git("-C", str(self.destination), "status", "--porcelain=v1",
                                  "--untracked-files=all"), "")
        result = self.consume(materialized, request)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("deploy_control_consume_drift", result.stderr)
        self.assertEqual(private.read_text(), "unique ignored evidence\n")
        self.assertIn(f"worktree {self.destination}",
                      self.git("worktree", "list", "--porcelain").splitlines())
        lifecycle_path = Path(materialized["lifecyclePath"])
        self.assertEqual(json.loads(lifecycle_path.read_text())["state"], "RETENTION_DEBT")
        terminal = json.loads((output / "deploy-control-terminal-receipt.private.json").read_text())
        self.assertEqual(terminal["outcome"], "TERMINAL_FAILURE")
        with self.assertRaisesRegex(ValueError, "equivalent_preparation_pending"):
            lifecycle.validate_existing_lifecycles(self.controls, self.value)

    def test_resume_after_operation_receipt_finishes_git_disposition_once(self):
        materialized = self.materialize()
        output, request = self.consume_request(materialized)
        self.stage_operation_receipt(materialized, output, request)
        result = self.consume(materialized, request)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(self.destination.exists())
        self.assertEqual(json.loads(Path(materialized["lifecyclePath"]).read_text())["state"],
                         "SANITIZED")

    def budget_denial(self):
        item = self.value["preparationArtifacts"][0]
        item["budgetBytes"] = item["operation"]["predictedBytes"] = 1
        self.write_private(self.contract, self.value)
        denied = self.run_tool("materialize", "--repository", self.repo,
            "--destination", self.destination, "--commit", self.commit,
            "--contract", self.contract, "--contract-sha256", self.sha(self.contract))
        self.assertIn("preparation_realized_budget_exceeded", denied.stderr)
        path = self.controls / ("." + self.destination.name + ".lifecycle")
        return path / "preparation-artifacts.lifecycle.private.json"

    def retire_failed(self, path):
        return self.run_tool("retire-failed-materialization", "--contract", self.contract,
            "--contract-sha256", self.sha(self.contract), "--lifecycle", path,
            "--lifecycle-sha256", self.sha(path), "--owner", "fixture",
            "--reason", "authorized failed budget disposition")

    def test_failed_budget_disposition_then_measured_successor(self):
        path = self.budget_denial()
        original_sha = self.sha(path)
        failed = json.loads(path.read_text())
        self.assertEqual(failed["state"], "RETENTION_DEBT")
        with self.assertRaisesRegex(ValueError, "equivalent_preparation_pending"):
            lifecycle.validate_existing_lifecycles(self.controls, self.value)
        retired = self.retire_failed(path)
        self.assertEqual(retired.returncode, 0, retired.stderr)
        self.assertEqual(json.loads(path.read_text())["state"], "SANITIZED")
        self.assertEqual(self.sha(path.parent / "failed-materialization.lifecycle.private.json"),
                         original_sha)
        self.assertFalse(self.destination.exists())
        self.assertNotIn(str(self.destination), self.git("worktree", "list", "--porcelain"))
        closure_sha = self.sha(path)
        item = self.value["preparationArtifacts"][0]
        item["budgetBytes"] = item["operation"]["predictedBytes"] = (
            failed["realized"][0]["allocatedBytes"] * 2)
        self.value["generationId"] += "-successor"
        self.write_private(self.contract, self.value)
        materialized = self.materialize()
        self.assertNotEqual(Path(materialized["lifecyclePath"]).parent, path.parent)
        _, request = self.consume_request(materialized)
        consumed = self.consume(materialized, request)
        self.assertEqual(consumed.returncode, 0, consumed.stderr)
        self.assertEqual(json.loads(Path(materialized["lifecyclePath"]).read_text())["state"],
                         "SANITIZED")
        self.assertEqual(self.sha(path), closure_sha)

    def test_failed_budget_disposition_denies_ignored_content(self):
        path = self.budget_denial()
        (self.destination / "private-retain.txt").write_text("unique evidence")
        before = self.sha(path)
        denied = self.retire_failed(path)
        self.assertIn("deploy_control_consume_drift", denied.stderr)
        self.assertEqual(self.sha(path), before)
        self.assertTrue((self.destination / "private-retain.txt").is_file())
        self.assertFalse((path.parent / "failed-materialization-retirement-attempt.private.json").exists())

    def test_success_closes_only_after_external_removal(self):
        materialized = self.materialize()
        receipt = self.terminal(materialized)
        denied = self.close(materialized, receipt)
        self.assertNotEqual(denied.returncode, 0)
        self.assertIn("preparation_sanitized_artifact_present", denied.stderr)
        subprocess.run(["git", "-C", str(self.repo), "worktree", "remove",
                        str(self.destination)], check=True)
        closed = self.close(materialized, receipt)
        self.assertEqual(closed.returncode, 0, closed.stderr)
        self.assertEqual(json.loads(closed.stdout)["state"], "SANITIZED")

    def test_failure_records_debt_and_blocks_equivalent_allocation(self):
        materialized = self.materialize()
        receipt = self.terminal(materialized, "TERMINAL_FAILURE")
        closed = self.close(materialized, receipt)
        self.assertEqual(closed.returncode, 0, closed.stderr)
        self.assertEqual(json.loads(closed.stdout)["state"], "RETENTION_DEBT")
        with self.assertRaisesRegex(ValueError, "equivalent_preparation_pending"):
            lifecycle.validate_existing_lifecycles(self.controls, self.value)

    def test_contract_path_and_terminal_receipt_are_closed(self):
        altered = json.loads(json.dumps(self.value))
        altered["preparationArtifacts"].append(dict(altered["preparationArtifacts"][0]))
        altered["preparationArtifacts"][1]["path"] = str(self.controls / "extra")
        self.write_private(self.contract, altered)
        denied = self.run_tool("materialize", "--repository", self.repo,
            "--destination", self.destination, "--commit", self.commit,
            "--contract", self.contract, "--contract-sha256", self.sha(self.contract))
        self.assertNotEqual(denied.returncode, 0)
        self.assertIn("deploy_control_single_artifact", denied.stderr)

        altered = json.loads(json.dumps(self.value))
        altered["preparationArtifacts"][0]["equivalenceSha256"] = "0" * 64
        self.write_private(self.contract, altered)
        denied = self.run_tool("materialize", "--repository", self.repo,
            "--destination", self.destination, "--commit", self.commit,
            "--contract", self.contract, "--contract-sha256", self.sha(self.contract))
        self.assertNotEqual(denied.returncode, 0)
        self.assertIn("deploy_control_contract_binding", denied.stderr)

        self.write_private(self.contract, self.value)
        materialized = self.materialize()
        lifecycle_path = Path(materialized["lifecyclePath"])
        missing = self.run_tool("close", "--lifecycle", lifecycle_path,
            "--lifecycle-sha256", self.sha(lifecycle_path),
            "--terminal-receipt", self.base / "missing.private.json",
            "--terminal-receipt-sha256", "0" * 64,
            "--owner", "fixture", "--reason", "missing receipt")
        self.assertNotEqual(missing.returncode, 0)
        self.assertEqual(json.loads(lifecycle_path.read_text())["state"], "OPEN")
        crossed = self.terminal(materialized, path=self.controls / "other",
                                operation="other-operation")
        denied = self.close(materialized, crossed)
        self.assertNotEqual(denied.returncode, 0)
        self.assertTrue("deploy_control_terminal_operation" in denied.stderr or
                        "deploy_control_terminal_path" in denied.stderr)


if __name__ == "__main__": unittest.main()
