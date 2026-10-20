#!/usr/bin/env python3
"""Stable, data-driven orchestration core for Converta normal releases.

The executor owns ordering, durable evidence and rollback. Environment-specific PM2
and frontend-launcher operations live behind an authenticated adapter. This file must
never contain release IDs, process IDs, PM2 dumps or release paths.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import stat
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

SHA256 = re.compile(r"^[0-9a-f]{64}$")
ACTIONS = (
    "capture",
    "select_api",
    "verify_api",
    "select_frontend",
    "verify_frontend",
    "verify_worker",
    "save_pm2",
)


class DeployDenied(RuntimeError):
    pass


def canonical_bytes(value: object) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_json_no_follow(path: Path) -> tuple[dict, bytes]:
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(path, flags)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode):
            raise DeployDenied(f"not_regular:{path.name}")
        raw = b""
        while True:
            chunk = os.read(fd, 1024 * 1024)
            if not chunk:
                break
            raw += chunk
        after = os.fstat(fd)
        if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) != (
            after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns
        ):
            raise DeployDenied(f"changed_while_reading:{path.name}")
    finally:
        os.close(fd)
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise DeployDenied(f"not_object:{path.name}")
    return value, raw


def validate_manifest(value: dict) -> None:
    if value.get("schemaVersion") != 1:
        raise DeployDenied("manifest_schema")
    if value.get("deploymentClass") != "NORMAL_RELEASE":
        raise DeployDenied("manifest_class")
    if value.get("deploymentOrder") != ["api", "frontend"]:
        raise DeployDenied("deployment_order")
    if not value.get("releaseId") or not value.get("candidateCommit"):
        raise DeployDenied("release_identity")
    boundary = value.get("changeBoundary", {})
    if not boundary or any(item is not False for item in boundary.values()):
        raise DeployDenied("break_glass_required")
    policy = value.get("runtimeStatePolicy", {})
    if policy.get("embeddedRuntimeStateForbidden") is not True:
        raise DeployDenied("runtime_state_policy")
    if value.get("promotionAuthorized") is not False:
        raise DeployDenied("manifest_must_not_authorize")
    for artifact in value.get("artifacts", {}).values():
        for key, field in artifact.items():
            if key.endswith("Sha256") and not SHA256.fullmatch(str(field)):
                raise DeployDenied(f"artifact_hash:{key}")


def parse_utc(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise DeployDenied("authorization_timezone")
    return parsed.astimezone(timezone.utc)


def validate_authorization(value: dict, manifest: dict, manifest_sha: str,
                           executor_sha: str) -> None:
    if value.get("schemaVersion") != 1 or value.get("decision") != "AUTHORIZED":
        raise DeployDenied("execution_not_authorized")
    if value.get("releaseId") != manifest["releaseId"]:
        raise DeployDenied("authorization_release")
    if value.get("manifestSha256") != manifest_sha:
        raise DeployDenied("authorization_manifest")
    if value.get("executorSha256") != executor_sha:
        raise DeployDenied("authorization_executor")
    if parse_utc(str(value.get("notAfterUtc", ""))) <= datetime.now(timezone.utc):
        raise DeployDenied("authorization_expired")


class Journal:
    def __init__(self, root: Path) -> None:
        root.mkdir(mode=0o700, parents=True, exist_ok=False)
        self.path = root / "events.jsonl"
        self.report = root / "result.json"
        self.sequence = 0

    def write(self, event: str, **fields: object) -> None:
        self.sequence += 1
        record = {"sequence": self.sequence, "event": event, **fields}
        fd = os.open(self.path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
        try:
            os.write(fd, canonical_bytes(record))
            os.fsync(fd)
        finally:
            os.close(fd)

    def finish(self, value: dict) -> None:
        raw = canonical_bytes(value)
        fd = os.open(self.report, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            os.write(fd, raw)
            os.fsync(fd)
        finally:
            os.close(fd)


def call_adapter(adapter: Path, action: str, manifest: Path, root: Path,
                 journal: Journal, timeout: int) -> dict:
    journal.write("ACTION_STARTED", action=action)
    adapter_env = {
        key: os.environ[key]
        for key in ("PATH", "HOME", "PM2_HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "TZ")
        if key in os.environ
    }
    adapter_env.setdefault("PATH", "/usr/local/bin:/usr/bin:/bin")
    result = subprocess.run(
        [str(adapter), action, "--manifest", str(manifest), "--work-dir", str(root)],
        check=False,
        capture_output=True,
        text=True,
        timeout=timeout,
        env=adapter_env,
    )
    stdout = result.stdout.strip()
    try:
        payload = json.loads(stdout) if stdout else {}
    except json.JSONDecodeError as exc:
        raise DeployDenied(f"adapter_invalid_json:{action}") from exc
    sanitized = {
        "action": action,
        "exitCode": result.returncode,
        "result": payload.get("result"),
        "reason": payload.get("reason"),
    }
    journal.write("ACTION_FINISHED", **sanitized)
    if result.returncode != 0 or payload.get("result") != "PASS":
        raise DeployDenied(f"adapter_denied:{action}:{payload.get('reason', 'unknown')}")
    return payload


def execute(args: argparse.Namespace, manifest: dict, manifest_sha: str,
            executor_sha: str) -> int:
    adapter = args.adapter.resolve()
    if not adapter.is_file() or not os.access(adapter, os.X_OK):
        raise DeployDenied("adapter_not_executable")
    if not SHA256.fullmatch(args.adapter_sha256 or ""):
        raise DeployDenied("adapter_sha_argument")
    if sha256_file(adapter) != args.adapter_sha256:
        raise DeployDenied("adapter_sha_mismatch")

    authorization, authorization_raw = read_json_no_follow(args.authorization.resolve())
    if args.authorization_sha256 != sha256_bytes(authorization_raw):
        raise DeployDenied("authorization_sha_mismatch")
    validate_authorization(authorization, manifest, manifest_sha, executor_sha)

    root = args.work_dir.resolve()
    journal = Journal(root)
    execution_adapter = root / "adapter"
    adapter_bytes = adapter.read_bytes()
    fd = os.open(execution_adapter, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o700)
    try:
        os.write(fd, adapter_bytes)
        os.fsync(fd)
    finally:
        os.close(fd)
    if sha256_file(execution_adapter) != args.adapter_sha256:
        raise DeployDenied("adapter_copy_sha_mismatch")
    journal.write(
        "AUTHORIZED_COMMITTED",
        releaseId=manifest["releaseId"],
        manifestSha256=manifest_sha,
        executorSha256=executor_sha,
        adapterSha256=args.adapter_sha256,
        authorizationSha256=args.authorization_sha256,
    )
    api_selected = False
    frontend_selected = False
    saved = False
    completed: list[str] = []
    try:
        for action in ACTIONS:
            # A selector can fail after a partial external effect. Mark the component
            # before invoking it so rollback is conservative and idempotent.
            api_selected = api_selected or action == "select_api"
            frontend_selected = frontend_selected or action == "select_frontend"
            call_adapter(execution_adapter, action, args.manifest.resolve(), root,
                         journal, args.timeout)
            completed.append(action)
            saved = saved or action == "save_pm2"
        journal.write("DEPLOYMENT_ACCEPTED")
        journal.finish({"status": "DEPLOYED_VERIFIED", "actions": completed,
                        "pm2SavedExactlyOnce": saved})
        print("DEPLOY_V2_EXECUTION_PASS")
        return 0
    except Exception as error:
        journal.write("DEPLOYMENT_DENIED", reason=str(error))
        rollback: list[str] = []
        rollback_error: str | None = None
        try:
            if frontend_selected:
                call_adapter(execution_adapter, "rollback_frontend", args.manifest.resolve(),
                             root, journal, args.timeout)
                rollback.append("rollback_frontend")
            if api_selected:
                call_adapter(execution_adapter, "rollback_api", args.manifest.resolve(),
                             root, journal, args.timeout)
                rollback.append("rollback_api")
            if rollback:
                call_adapter(execution_adapter, "verify_rollback", args.manifest.resolve(),
                             root, journal, args.timeout)
                rollback.append("verify_rollback")
        except Exception as rollback_exception:
            rollback_error = str(rollback_exception)
            journal.write("ROLLBACK_CRITICAL", reason=rollback_error)
        status = "ROLLBACK_CRITICAL" if rollback_error else "ROLLED_BACK"
        journal.finish({"status": status, "reason": str(error),
                        "completedActions": completed, "rollbackActions": rollback,
                        "rollbackError": rollback_error, "pm2Saved": saved})
        print(f"DEPLOY_V2_{status}: {error}", file=sys.stderr)
        return 2 if rollback_error else 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--adapter", type=Path)
    parser.add_argument("--adapter-sha256")
    parser.add_argument("--authorization", type=Path)
    parser.add_argument("--authorization-sha256")
    parser.add_argument("--work-dir", type=Path)
    parser.add_argument("--timeout", type=int, default=30)
    args = parser.parse_args()
    try:
        manifest, manifest_raw = read_json_no_follow(args.manifest.resolve())
        validate_manifest(manifest)
        manifest_sha = sha256_bytes(manifest_raw)
        executor_sha = sha256_file(Path(__file__).resolve())
        if not args.execute:
            print(json.dumps({"result": "DEPLOY_V2_PLAN_OK", "releaseId": manifest["releaseId"],
                              "manifestSha256": manifest_sha}, sort_keys=True))
            return 0
        if not all((args.adapter, args.adapter_sha256, args.authorization,
                    args.authorization_sha256, args.work_dir)):
            raise DeployDenied("execute_arguments")
        return execute(args, manifest, manifest_sha, executor_sha)
    except (DeployDenied, FileExistsError, json.JSONDecodeError, OSError) as error:
        print(f"DEPLOY_V2_DENIED: {error}", file=sys.stderr)
        return 64


if __name__ == "__main__":
    raise SystemExit(main())

