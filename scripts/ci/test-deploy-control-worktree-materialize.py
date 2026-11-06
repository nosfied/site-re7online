import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


SCRIPTS = Path(__file__).resolve().parents[1]
TOOL = SCRIPTS / "deploy-control-worktree-materialize.py"
LIFECYCLE = SCRIPTS / "preparation_artifact_lifecycle.py"
spec = importlib.util.spec_from_file_location("preparation_artifact_lifecycle", LIFECYCLE)
lifecycle = importlib.util.module_from_spec(spec); spec.loader.exec_module(lifecycle)


class DeployControlWorktreeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.base = Path(self.temp.name)
        self.repo = self.base / "repo"; self.controls = self.base / "deploy-control"
        self.repo.mkdir(); self.controls.mkdir()
        subprocess.run(["git", "-C", str(self.repo), "init", "-q"], check=True)
        subprocess.run(["git", "-C", str(self.repo), "config", "user.email", "fixture@example.test"], check=True)
        subprocess.run(["git", "-C", str(self.repo), "config", "user.name", "Fixture"], check=True)
        (self.repo / "scripts").mkdir()
        for name in ("deploy-preparation-admission.py", "preparation_artifact_lifecycle.py"):
            shutil.copyfile(SCRIPTS / name, self.repo / "scripts" / name)
        subprocess.run(["git", "-C", str(self.repo), "add", "scripts"], check=True)
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

    def run_tool(self, *args):
        return subprocess.run([sys.executable, "-B", str(TOOL), *map(str, args)],
            text=True, capture_output=True,
            env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1"})

    def materialize(self):
        result = self.run_tool("materialize", "--repository", self.repo,
            "--destination", self.destination, "--commit", self.commit,
            "--contract", self.contract, "--contract-sha256", self.sha(self.contract))
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

    def consume_request(self, materialized):
        output = self.base / "private-custody"; output.mkdir(mode=0o700)
        request = self.base / "consume-request.private.json"
        controls = []
        for name in ("deploy-preparation-admission.py", "preparation_artifact_lifecycle.py"):
            source = "scripts/" + name
            controls.append({"source": source, "destination": source,
                "sha256": hashlib.sha256((self.repo / source).read_bytes()).hexdigest()})
        self.write_private(request, {"schemaVersion": 1,
            "kind": "DEPLOY_CONTROL_MATERIALIZE_CONTROLS",
            "operationId": self.value["generationId"],
            "controlPath": str(self.destination), "controlCommit": self.commit,
            "materializationReceiptSha256": materialized["materializationReceiptSha256"],
            "outputRoot": str(output), "controls": controls})
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
        self.assertTrue((output / "deploy-control-operation-receipt.private.json").exists())
        self.assertTrue((output / "deploy-control-terminal-receipt.private.json").exists())
        lifecycle_path = Path(materialized["lifecyclePath"])
        self.assertEqual(json.loads(lifecycle_path.read_text())["state"], "SANITIZED")
        self.assertEqual(lifecycle.validate_existing_lifecycles(self.controls, self.value)
                         ["reservedBytes"], 0)

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

    def test_resume_after_operation_receipt_finishes_git_disposition_once(self):
        materialized = self.materialize()
        output, request = self.consume_request(materialized)
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
        result = self.consume(materialized, request)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(self.destination.exists())
        self.assertEqual(json.loads(Path(materialized["lifecyclePath"]).read_text())["state"],
                         "SANITIZED")

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
