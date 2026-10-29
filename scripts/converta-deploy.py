#!/usr/bin/env python3
"""Minimal API/frontend deploy coordinator for the proven fixed-current route."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import urllib.request
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Callable


SHA40 = re.compile(r"^[0-9a-f]{40}$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")
PRIVATE_DATA_OVERLAY = PurePosixPath("api-runtime/.data")
PRIVATE_DATA_POLICY = "PRIVATE_DATA_NEVER_RETIRE"
STATES = {
    "PREFLIGHT_PASS", "ACTIVATING", "AWAITING_ACCEPTANCE", "FINALIZING",
    "DEPLOYED", "DEPLOYED_SANITIZED", "DEPLOYED_RETENTION_INCOMPLETE",
    "ROLLING_BACK", "ROLLED_BACK", "FAILED",
}
COMPONENTS = ("api", "frontend")
SUPPORTED_COMPONENT_SETS = (("api",), COMPONENTS)
STABLE = {
    "api": Path("/opt/re7online/current/api"),
    "frontend": Path("/opt/re7online/current/frontend"),
}
RUNTIME_DIR = {"api": "api-runtime", "frontend": "frontend-runtime"}
PORT = {"api": 3001, "frontend": 3000}
LOCAL_HEALTH = {
    "api": "http://127.0.0.1:3001/health",
    "frontend": "http://127.0.0.1:3000/app/login",
}
PUBLIC_HEALTH = {
    "api": "https://converta.re7online.com/agent-api/health",
    "frontend": "https://converta.re7online.com/app/login",
}
FRONTEND_GET_PATHS = ("/app/login", "/app/inbox", "/app/crm")
PROCESS_NAMES = {
    "api": "re7-whatsapp-agent",
    "frontend": "re7-admin-front",
    "worker": "re7-whatsapp-web-worker",
}
LOCK = Path("/opt/re7online/backups/converta-persistent/deploy.lock")
PM2_CANDIDATES = (
    Path.home() / ".npm-global/bin/pm2", Path.home() / ".local/bin/pm2",
    Path("/usr/local/bin/pm2"),
)


class Denied(RuntimeError):
    pass


def deny(reason: str) -> None:
    raise Denied(reason)


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def stable_regular_bytes(path: Path, *, required_mode: int | None = None) -> tuple[bytes, os.stat_result]:
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        fd = os.open(path, flags)
    except OSError as error:
        deny(f"stable_file_open:{path.name}:{type(error).__name__}")
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode): deny(f"stable_file_type:{path.name}")
        if required_mode is not None and stat.S_IMODE(before.st_mode) != required_mode:
            deny(f"stable_file_mode:{path.name}")
        blocks: list[bytes] = []
        while True:
            block = os.read(fd, 1024 * 1024)
            if not block: break
            blocks.append(block)
        after = os.fstat(fd)
    finally:
        os.close(fd)
    identity = lambda info: (info.st_dev, info.st_ino, info.st_mode, info.st_size,
                             info.st_mtime_ns, info.st_ctime_ns)
    raw = b"".join(blocks)
    if identity(before) != identity(after) or len(raw) != before.st_size:
        deny(f"stable_file_changed:{path.name}")
    return raw, after


def json_object(raw: bytes, filename: str) -> dict[str, Any]:
    try: value = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        deny(f"invalid_json:{filename}:{type(error).__name__}")
    if not isinstance(value, dict): deny(f"json_object_required:{filename}")
    return value


def regular_private(path: Path, mode: int = 0o600) -> None:
    try:
        info = path.lstat()
    except FileNotFoundError:
        deny(f"missing_private_file:{path.name}")
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
        deny(f"private_file_type:{path.name}")
    if stat.S_IMODE(info.st_mode) != mode:
        deny(f"private_file_mode:{path.name}")


def private_file_identity(path: Path) -> dict[str, int | str]:
    regular_private(path)
    info = path.stat()
    return {
        "sha256": digest(path), "uid": info.st_uid, "gid": info.st_gid,
        "mode": format(stat.S_IMODE(info.st_mode), "04o"),
    }


def private_directory(path: Path) -> None:
    info = path.lstat()
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
        deny(f"private_root_type:{path.name}")
    if stat.S_IMODE(info.st_mode) != 0o700:
        deny(f"private_root_mode:{path.name}")


def read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        deny(f"invalid_json:{path.name}:{type(error).__name__}")
    if not isinstance(value, dict):
        deny(f"json_object_required:{path.name}")
    return value


def atomic_private(path: Path, value: dict[str, Any], *, exclusive: bool = False) -> None:
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    private_directory(path.parent)
    if exclusive and path.exists():
        deny(f"destination_exists:{path.name}")
    raw = (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temp = Path(temporary)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb", closefd=True) as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        if exclusive and path.exists():
            deny(f"destination_exists:{path.name}")
        os.replace(temp, path)
        directory_fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        temp.unlink(missing_ok=True)


def atomic_private_bytes(path: Path, raw: bytes, *, exclusive: bool = True) -> None:
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    private_directory(path.parent)
    if exclusive and (path.exists() or path.is_symlink()):
        deny(f"destination_exists:{path.name}")
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temp = Path(temporary)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb", closefd=True) as stream:
            written = stream.write(raw)
            if written != len(raw):
                deny(f"short_write:{path.name}")
            stream.flush(); os.fsync(stream.fileno())
        if exclusive and (path.exists() or path.is_symlink()):
            deny(f"destination_exists:{path.name}")
        os.replace(temp, path)
        directory_fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        temp.unlink(missing_ok=True)


def atomic_symlink(link: Path, target: Path) -> None:
    temporary = link.with_name(f".{link.name}.deploy-{os.getpid()}")
    temporary.unlink(missing_ok=True)
    os.symlink(target, temporary)
    os.replace(temporary, link)


def atomic_marker(path: Path, value: dict[str, Any]) -> None:
    if path.exists():
        deny("deployed_marker_exists")
    raw = (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temp = Path(temporary)
    try:
        os.fchmod(fd, 0o644)
        with os.fdopen(fd, "wb", closefd=True) as stream:
            stream.write(raw); stream.flush(); os.fsync(stream.fileno())
        if path.exists():
            deny("deployed_marker_exists")
        os.replace(temp, path)
        directory_fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        temp.unlink(missing_ok=True)


def find_digest(value: Any, filename: str) -> str | None:
    if isinstance(value, dict):
        direct = value.get(filename)
        if isinstance(direct, str) and SHA256.fullmatch(direct):
            return direct
        if value.get("path") == filename or value.get("name") == filename:
            for key in ("sha256", "digest", "hash"):
                result = value.get(key)
                if isinstance(result, str) and SHA256.fullmatch(result):
                    return result
        for child in value.values():
            result = find_digest(child, filename)
            if result:
                return result
    elif isinstance(value, list):
        for child in value:
            result = find_digest(child, filename)
            if result:
                return result
    return None


@dataclass(frozen=True)
class RetirementBinding:
    tool: Path
    tool_sha256: str
    intent: Path
    intent_sha256: str
    authorization: Path
    authorization_sha256: str
    operational_state: Path
    operational_state_sha256: str
    root_policy: Path
    root_policy_sha256: str
    receipt_root: Path
    review_output: Path
    deployment_lock: Path

    def binding(self) -> dict[str, Any]:
        return {"tool": str(self.tool), "toolSha256": self.tool_sha256,
                "intent": str(self.intent), "intentSha256": self.intent_sha256,
                "authorization": str(self.authorization), "authorizationSha256": self.authorization_sha256,
                "operationalState": str(self.operational_state),
                "operationalStateSha256": self.operational_state_sha256,
                "rootPolicy": str(self.root_policy), "rootPolicySha256": self.root_policy_sha256,
                "receiptRoot": str(self.receipt_root), "reviewOutput": str(self.review_output),
                "deploymentLock": str(self.deployment_lock)}


@dataclass(frozen=True)
class Inputs:
    release: str
    target: str
    control_plane: str
    components: tuple[str, ...]
    runtime_manifest: Path
    transaction_root: Path
    runtime_manifest_sha256: str
    retirement: RetirementBinding | None = None

    def binding(self) -> dict[str, Any]:
        value = {
            "release": self.release, "target": self.target,
            "controlPlane": self.control_plane, "components": list(self.components),
            "runtimeManifest": str(self.runtime_manifest.resolve()),
            "transactionRoot": str(self.transaction_root.resolve()),
            "runtimeManifestSha256": self.runtime_manifest_sha256,
        }
        if self.retirement is not None:
            value["generationRetirement"] = self.retirement.binding()
        return value


class Host:
    """Small host surface; tests replace this object without changing the CLI."""

    def run(self, command: list[str], *, timeout: float = 40) -> subprocess.CompletedProcess[str]:
        return subprocess.run(command, text=True, capture_output=True, timeout=timeout, check=False)

    def get(self, url: str, timeout: float = 10) -> int:
        request = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return int(response.status)

    def api_health(self, url: str, timeout: float = 10) -> tuple[int, str, dict[str, Any]]:
        request = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read(64 * 1024 + 1)
            status = int(response.status)
            content_type = response.headers.get_content_type()
        if len(raw) > 64 * 1024:
            deny("api_health_response_too_large")
        try:
            payload = json.loads(raw)
        except (UnicodeDecodeError, json.JSONDecodeError):
            deny("api_health_response_invalid")
        if not isinstance(payload, dict):
            deny("api_health_response_invalid")
        return status, content_type, payload

    def pm2_rows(self, pm2: Path) -> list[dict[str, Any]]:
        result = self.run([str(pm2), "jlist"])
        if result.returncode:
            deny("pm2_jlist_failed")
        try:
            rows = json.loads(result.stdout)
        except json.JSONDecodeError:
            deny("pm2_jlist_invalid")
        if not isinstance(rows, list):
            deny("pm2_jlist_shape")
        return rows

    def pm2_mutate(self, pm2: Path, args: list[str]) -> None:
        result = self.run([str(pm2), *args], timeout=60)
        if result.returncode:
            deny(f"pm2_command_failed:{args[0]}")

    def control(self, root: Path, args: list[str]) -> dict[str, Any]:
        result = self.run([sys.executable, str(root / "scripts/pm2-definition-control.py"), *args], timeout=45)
        if result.returncode:
            reason = result.stderr.strip().splitlines()[-1] if result.stderr.strip() else "control_failed"
            deny(reason[:240])
        try:
            value = json.loads(result.stdout)
        except json.JSONDecodeError:
            deny("control_output_invalid")
        if not isinstance(value, dict):
            deny("control_output_shape")
        return value

    def control_evidence(self, root: Path, args: list[str], *, report: Path,
                         stdout: Path, stderr: Path) -> dict[str, Any]:
        timed_out = False
        try:
            result = self.run([sys.executable, str(root / "scripts/pm2-definition-control.py"),
                               *args, "--report", str(report)], timeout=45)
            stdout_raw = result.stdout.encode()
            stderr_raw = result.stderr.encode()
        except subprocess.TimeoutExpired as error:
            timed_out = True
            stdout_raw = error.stdout or b""
            stderr_raw = error.stderr or b""
            if isinstance(stdout_raw, str): stdout_raw = stdout_raw.encode()
            if isinstance(stderr_raw, str): stderr_raw = stderr_raw.encode()
        atomic_private_bytes(stdout, stdout_raw)
        atomic_private_bytes(stderr, stderr_raw)
        if not report.is_file() or report.is_symlink():
            deny("READINESS_OBSERVABILITY_DEFECT")
        raw, _ = stable_regular_bytes(report, required_mode=0o600)
        value = json_object(raw, report.name)
        if timed_out:
            reason = value.get("reason")
            deny(str(reason)[:240] if isinstance(reason, str) else "READINESS_OBSERVABILITY_DEFECT")
        if result.returncode:
            reason = value.get("reason")
            deny(str(reason)[:240] if isinstance(reason, str) else "READINESS_OBSERVABILITY_DEFECT")
        if value.get("result") != "READINESS_PASS":
            deny("READINESS_OBSERVABILITY_DEFECT")
        return value

    def process_cwd(self, pid: int) -> Path:
        try:
            return Path(f"/proc/{pid}/cwd").resolve(strict=True)
        except OSError:
            deny(f"process_cwd:{pid}")

    def process_exe(self, pid: int) -> Path:
        try:
            return Path(f"/proc/{pid}/exe").resolve(strict=True)
        except OSError:
            deny(f"process_exe:{pid}")


class Driver:
    def __init__(self, inputs: Inputs, *, host: Host | None = None,
                 repo: Path | None = None, releases: Path = Path("/opt/re7online/releases"),
                 stable: dict[str, Path] | None = None, lock: Path = LOCK,
                 dump: Path | None = None, pm2: Path | None = None,
                 clock: Callable[[], float] = time.time):
        self.inputs = inputs
        self.host = host or Host()
        self.repo = (repo or Path(__file__).resolve().parents[1]).resolve()
        self.releases = releases
        self.stable = stable or STABLE
        self.lock = lock
        self.dump = dump or (Path.home() / ".pm2/dump.pm2")
        self.pm2 = pm2
        self.clock = clock
        self.journal = inputs.transaction_root / "transaction.v1.private.json"
        self.acceptance = inputs.transaction_root / "acceptance.private.txt"
        self.release_root = releases / inputs.release

    @staticmethod
    def _stable_identity(info: os.stat_result) -> tuple[int, ...]:
        return (info.st_dev, info.st_ino, info.st_uid, info.st_gid, info.st_mode,
                info.st_size, info.st_mtime_ns, info.st_ctime_ns)

    def _authenticated_runtime_manifest(self) -> dict[str, Any]:
        path = self.inputs.runtime_manifest
        if not path.is_absolute() or not SHA256.fullmatch(self.inputs.runtime_manifest_sha256):
            deny("runtime_manifest_binding")
        raw, info = stable_regular_bytes(path, required_mode=0o600)
        if hashlib.sha256(raw).hexdigest() != self.inputs.runtime_manifest_sha256:
            deny("runtime_manifest_sha256_mismatch")
        value = json_object(raw, path.name)
        expected_keys = {"schemaVersion", "mode", "controlPlaneSha", "pm2Version",
                         "environmentAllowlistSha256", "processes", "rollbackReleases"}
        if set(value) != expected_keys or value.get("schemaVersion") != 1:
            deny("runtime_manifest_schema")
        if (value.get("mode") != "fixed-current-existing-pm2" or
                value.get("controlPlaneSha") != self.inputs.control_plane or
                value.get("pm2Version") != "6.0.14"):
            deny("runtime_manifest_identity")
        allowlist = self.repo / "scripts/pm2-definition-env-allowlist.v1.json"
        if digest(allowlist) != value.get("environmentAllowlistSha256"):
            deny("runtime_manifest_allowlist")
        if value.get("processes") != PROCESS_NAMES:
            deny("runtime_manifest_processes")
        rollbacks = value.get("rollbackReleases")
        if not isinstance(rollbacks, dict) or set(rollbacks) != set(COMPONENTS):
            deny("runtime_manifest_rollbacks")
        for component in COMPONENTS:
            identity = rollbacks.get(component)
            common = {"releaseId", "manifestSha256", "indexSha256", "entrySha256"}
            expected = common | ({"buildId"} if component == "frontend" else set())
            if (not isinstance(identity, dict) or set(identity) != expected or
                    not isinstance(identity.get("releaseId"), str) or
                    not identity["releaseId"] or
                    not all(SHA256.fullmatch(str(identity.get(key, "")))
                            for key in ("manifestSha256", "indexSha256", "entrySha256")) or
                    (component == "frontend" and
                     (not isinstance(identity.get("buildId"), str) or not identity["buildId"]))):
                deny(f"runtime_manifest_rollback:{component}")
        self._failpoint("runtime_manifest_read")
        try:
            current = path.stat()
        except OSError:
            deny("runtime_manifest_changed")
        if self._stable_identity(current) != self._stable_identity(info):
            deny("runtime_manifest_changed")
        return value

    def _environment_keys(self, component: str) -> list[str]:
        value = read_json(self.repo / "scripts/pm2-definition-env-allowlist.v1.json")
        try:
            roles = value["components"][component]
        except (KeyError, TypeError):
            deny(f"environment_allowlist:{component}")
        if set(roles) != {"common", "candidate", "rollbackCompatibility"}:
            deny(f"environment_allowlist:{component}")
        keys = roles["common"] + roles["candidate"] + roles["rollbackCompatibility"]
        if not all(isinstance(item, str) for item in keys) or len(keys) != len(set(keys)):
            deny(f"environment_allowlist:{component}")
        return sorted(keys)

    def _resolve_pm2(self) -> Path:
        if self.pm2 is not None:
            candidate = self.pm2
        else:
            candidate = next((path for path in PM2_CANDIDATES if path.is_file()), None)
            if candidate is None:
                deny("pm2_not_found")
        if not candidate.is_absolute() or not candidate.is_file():
            deny("pm2_invalid")
        result = self.host.run([str(candidate), "--version"])
        if result.returncode or result.stdout.strip().splitlines()[-1:] != ["6.0.14"]:
            deny("pm2_version")
        return candidate

    def _control_head(self) -> None:
        result = self.host.run(["git", "-C", str(self.repo), "rev-parse", "HEAD"])
        if result.returncode or result.stdout.strip() != self.inputs.control_plane:
            deny("control_plane_identity")
        status = self.host.run(["git", "-C", str(self.repo), "status", "--porcelain", "--untracked-files=no"])
        if status.returncode or status.stdout.strip():
            deny("control_plane_not_clean")

    def _private_data_contract(self) -> dict[str, Any]:
        binding = self.inputs.retirement
        if binding is None:
            deny("private_data_contract_binding")
        intent_raw, _ = stable_regular_bytes(binding.intent, required_mode=0o600)
        if hashlib.sha256(intent_raw).hexdigest() != binding.intent_sha256:
            deny("private_data_contract_intent")
        intent = json_object(intent_raw, binding.intent.name)
        contract_sha256 = intent.get("contractSha256")
        if not isinstance(contract_sha256, str) or not SHA256.fullmatch(contract_sha256):
            deny("private_data_contract_identity")
        contract_path = binding.review_output.parent / "generation-artifacts.private.json"
        contract_raw, _ = stable_regular_bytes(contract_path, required_mode=0o600)
        if hashlib.sha256(contract_raw).hexdigest() != contract_sha256:
            deny("private_data_contract_sha256")
        contract = json_object(contract_raw, contract_path.name)
        required = {"schemaVersion", "generationId", "releaseId", "targetCommit", "state",
                    "writerLockPath", "classes", "artifacts", "privateDataPolicy"}
        optional = {"privateDataOverlay"}
        if (not required.issubset(contract) or not set(contract).issubset(required | optional) or
                contract.get("schemaVersion") != 1 or contract.get("state") != "COMPLETE" or
                contract.get("generationId") != self.inputs.release or
                contract.get("releaseId") != self.inputs.release or
                contract.get("targetCommit") != self.inputs.target or
                contract.get("privateDataPolicy") != PRIVATE_DATA_POLICY):
            deny("private_data_contract_schema")
        declared = contract.get("privateDataOverlay")
        expected = {"path": PRIVATE_DATA_OVERLAY.as_posix(),
                    "classification": PRIVATE_DATA_POLICY,
                    "state": "ACTIVE_DEPENDENCY", "retirableOn": "NEVER_AUTOMATIC"}
        if declared is not None and declared != expected:
            deny("private_data_contract_overlay")
        return contract

    def _private_data_overlay(self) -> dict[str, Any]:
        self._private_data_contract()
        overlay = self.release_root / PRIVATE_DATA_OVERLAY
        if not overlay.exists() and not overlay.is_symlink():
            return {"present": False, "path": PRIVATE_DATA_OVERLAY.as_posix(),
                    "classification": PRIVATE_DATA_POLICY, "state": "ACTIVE_DEPENDENCY"}
        try:
            release_info = self.release_root.lstat()
            release_resolved = self.release_root.resolve(strict=True)
            before = overlay.lstat()
            resolved = overlay.resolve(strict=True)
        except OSError:
            deny("private_data_overlay_read")
        if (overlay.is_symlink() or not stat.S_ISDIR(before.st_mode) or resolved != overlay or
                release_resolved not in resolved.parents or
                (before.st_uid, before.st_gid) != (release_info.st_uid, release_info.st_gid) or
                stat.S_IMODE(before.st_mode) & 0o022):
            deny("private_data_overlay_identity")
        entries = 1
        for path in sorted(overlay.rglob("*"), key=lambda item: item.as_posix()):
            try:
                info = path.lstat()
                path_resolved = path.resolve(strict=True)
            except OSError:
                deny("private_data_overlay_read")
            if (stat.S_ISLNK(info.st_mode) or
                    not (stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode)) or
                    not (path_resolved == resolved or resolved in path_resolved.parents)):
                deny("private_data_overlay_symlink")
            entries += 1
        after = overlay.lstat()
        if ((before.st_dev, before.st_ino, before.st_mode, before.st_uid, before.st_gid) !=
                (after.st_dev, after.st_ino, after.st_mode, after.st_uid, after.st_gid)):
            deny("private_data_overlay_changed")
        return {"present": True, "path": PRIVATE_DATA_OVERLAY.as_posix(),
                "classification": PRIVATE_DATA_POLICY, "state": "ACTIVE_DEPENDENCY",
                "rootIdentity": {"device": after.st_dev, "inode": after.st_ino},
                "ownerUid": after.st_uid, "groupGid": after.st_gid,
                "mode": stat.S_IMODE(after.st_mode), "observedEntries": entries}

    def _release_index(self, index_path: Path, raw: bytes) -> dict[str, Any]:
        index = json_object(raw, index_path.name)
        if index.get("schemaVersion") != 1 or index.get("scope") != list(RUNTIME_DIR.values()):
            deny("release_index_schema")
        entries = index.get("entries")
        if not isinstance(entries, list):
            deny("release_index_entries")
        expected: dict[str, dict[str, Any]] = {}
        for entry in entries:
            if not isinstance(entry, dict) or not isinstance(entry.get("path"), str):
                deny("release_index_entry")
            relative = PurePosixPath(entry["path"])
            if relative.is_absolute() or not relative.parts or any(part in {"", ".", ".."} for part in relative.parts):
                deny("release_index_path")
            if relative.parts[0] not in RUNTIME_DIR.values() or entry["path"] in expected:
                deny("release_index_scope")
            kind = entry.get("type")
            allowed = {"path", "type", "mode"}
            if kind == "file": allowed |= {"size", "sha256"}
            elif kind == "symlink": allowed |= {"target"}
            elif kind != "directory": deny("release_index_type")
            if set(entry) != allowed or not isinstance(entry.get("mode"), int):
                deny("release_index_fields")
            if kind == "file" and (not isinstance(entry.get("size"), int) or
                                     not SHA256.fullmatch(str(entry.get("sha256", "")))):
                deny("release_index_file")
            if kind == "symlink" and not isinstance(entry.get("target"), str):
                deny("release_index_symlink")
            expected[entry["path"]] = entry

        overlay = self._private_data_overlay()
        observed: dict[str, dict[str, Any]] = {}
        observed_identity: dict[str, tuple[int, ...]] = {}
        for runtime_name in RUNTIME_DIR.values():
            root = self.release_root / runtime_name
            if not root.is_dir() or root.is_symlink():
                deny(f"release_runtime_missing:{runtime_name}")
            paths = [root, *sorted(root.rglob("*"))]
            for path in paths:
                relative_path = PurePosixPath(path.relative_to(self.release_root).as_posix())
                if (relative_path == PRIVATE_DATA_OVERLAY or
                        PRIVATE_DATA_OVERLAY in relative_path.parents):
                    continue
                relative = relative_path.as_posix()
                info = path.lstat()
                observed_identity[relative] = (info.st_dev, info.st_ino, info.st_mode,
                                               info.st_size, info.st_mtime_ns, info.st_ctime_ns)
                item: dict[str, Any] = {"path": relative, "mode": stat.S_IMODE(info.st_mode)}
                if stat.S_ISREG(info.st_mode):
                    content, stable = stable_regular_bytes(path)
                    item.update(type="file", size=stable.st_size,
                                sha256=hashlib.sha256(content).hexdigest())
                elif stat.S_ISDIR(info.st_mode): item["type"] = "directory"
                elif stat.S_ISLNK(info.st_mode):
                    item.update(type="symlink", target=os.readlink(path))
                    try: resolved = path.resolve(strict=True)
                    except OSError: deny("release_symlink_broken")
                    if self.release_root.resolve() not in (resolved, *resolved.parents):
                        deny("release_symlink_escape")
                else: deny("release_entry_type")
                observed[relative] = item
        for relative, identity in observed_identity.items():
            try: current = (self.release_root / relative).lstat()
            except OSError: deny(f"release_entry_changed:{relative}")
            current_identity = (current.st_dev, current.st_ino, current.st_mode,
                                current.st_size, current.st_mtime_ns, current.st_ctime_ns)
            if current_identity != identity: deny(f"release_entry_changed:{relative}")
        if set(observed) != set(expected):
            deny("release_index_inventory")
        for relative, item in expected.items():
            if observed[relative] != item:
                deny(f"release_index_mismatch:{relative}")
        overlay_after = self._private_data_overlay()
        stable = ("present", "path", "classification", "state", "rootIdentity",
                  "ownerUid", "groupGid", "mode")
        if any(overlay_after.get(key) != overlay.get(key) for key in stable):
            deny("private_data_overlay_changed")
        return {"sha256": hashlib.sha256(raw).hexdigest(), "entries": len(expected),
                "privateDataOverlay": overlay_after}

    def _release(self) -> dict[str, Any]:
        if not SHA40.fullmatch(self.inputs.target):
            deny("target_format")
        if self.release_root.parent != self.releases or not self.release_root.is_dir():
            deny("release_missing")
        manifest_path = self.release_root / "manifest.json"
        index_path = self.release_root / "index.sha256"
        if not manifest_path.is_file() or manifest_path.is_symlink():
            deny("release_manifest_missing")
        if not index_path.is_file() or index_path.is_symlink():
            deny("release_index_missing")
        manifest_raw, _ = stable_regular_bytes(manifest_path)
        index_raw, _ = stable_regular_bytes(index_path)
        manifest = json_object(manifest_raw, manifest_path.name)
        manifest_sha = hashlib.sha256(manifest_raw).hexdigest()
        index_sha = hashlib.sha256(index_raw).hexdigest()
        target = manifest.get("targetCommit", manifest.get("target"))
        if target != self.inputs.target:
            deny("release_target")
        declared_components = manifest.get("components") or manifest.get("payloadComponents")
        if declared_components is not None and sorted(declared_components) != list(COMPONENTS):
            deny("release_components")
        expected_index = manifest.get("indexSha256") or find_digest(manifest, index_path.name)
        if not isinstance(expected_index, str) or not SHA256.fullmatch(expected_index):
            deny("release_index_identity_missing")
        if index_sha != expected_index:
            deny("release_index_identity")
        index = self._release_index(index_path, index_raw)
        for component in COMPONENTS:
            runtime = self.release_root / RUNTIME_DIR[component]
            if not runtime.is_dir():
                deny(f"release_runtime_missing:{component}")
        return {"manifestSha256": manifest_sha, "indexSha256": index["sha256"],
                "indexEntries": index["entries"],
                "privateDataOverlay": index["privateDataOverlay"]}

    def _rollback_release(self, component: str, identity: dict[str, Any]) -> Path:
        root = self.releases / identity["releaseId"]
        runtime = root / RUNTIME_DIR[component]
        manifest_path = root / "manifest.json"
        index_path = root / "index.sha256"
        manifest_raw, _ = stable_regular_bytes(manifest_path)
        index_raw, _ = stable_regular_bytes(index_path)
        if hashlib.sha256(manifest_raw).hexdigest() != identity["manifestSha256"]:
            deny(f"rollback_manifest:{component}")
        if hashlib.sha256(index_raw).hexdigest() != identity["indexSha256"]:
            deny(f"rollback_index:{component}")
        manifest = json_object(manifest_raw, manifest_path.name)
        if manifest.get("indexSha256") != identity["indexSha256"]:
            deny(f"rollback_manifest_index:{component}")
        entry_relative = "dist/index.js" if component == "api" else "node_modules/next/dist/bin/next"
        entry_raw, _ = stable_regular_bytes(runtime / entry_relative)
        if hashlib.sha256(entry_raw).hexdigest() != identity["entrySha256"]:
            deny(f"rollback_entry:{component}")
        runtime_identity = manifest.get("runtimes", {}).get(component, {})
        if component == "api":
            declared = runtime_identity.get("entrySha256")
            if declared is not None and declared != identity["entrySha256"]:
                deny("rollback_manifest_entry:api")
        else:
            build_id = (runtime / ".next/BUILD_ID").read_text(encoding="utf-8").strip()
            if (build_id != identity["buildId"] or
                    runtime_identity.get("buildId") != identity["buildId"]):
                deny("rollback_build_id:frontend")
        return runtime

    def _row(self, rows: list[dict[str, Any]], name: str) -> dict[str, Any]:
        matches = [row for row in rows if row.get("name") == name]
        if len(matches) != 1:
            deny(f"process_identity_count:{name}:{len(matches)}")
        row = matches[0]
        env = row.get("pm2_env", {})
        pid = row.get("pid")
        if env.get("status") != "online" or not isinstance(pid, int) or pid <= 0:
            deny(f"process_not_online:{name}")
        return row

    def _ticks(self, pid: int) -> int:
        try:
            text = Path(f"/proc/{pid}/stat").read_text()
            return int(text[text.rfind(")") + 2:].split()[19])
        except (OSError, ValueError, IndexError):
            deny(f"process_ticks:{pid}")

    @staticmethod
    def _pm2_field(row: dict[str, Any], name: str) -> Any:
        env = row.get("pm2_env") if isinstance(row.get("pm2_env"), dict) else {}
        aliases = {"cwd": "pm_cwd", "script": "pm_exec_path", "interpreter": "exec_interpreter"}
        alias = aliases.get(name)
        keys = (name, alias) if alias is not None else (name,)
        for container in (row, env):
            for key in keys:
                if key in container and container[key] is not None:
                    return container[key]
        return None

    def _environment_sha256(self, row: dict[str, Any], component: str) -> str:
        env = row.get("pm2_env") if isinstance(row.get("pm2_env"), dict) else {}
        projected = {
            key: row[key] if key in row and row[key] is not None else env.get(key)
            for key in self._environment_keys(component)
        }
        raw = json.dumps(projected, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
        return hashlib.sha256(raw).hexdigest()

    def _process_snapshot(self, row: dict[str, Any], component: str,
                          expected_runtime: Path | None = None) -> dict[str, Any]:
        pid = row["pid"]
        cwd_lexical = self._pm2_field(row, "cwd")
        script_lexical = self._pm2_field(row, "script")
        interpreter = self._pm2_field(row, "interpreter")
        if not all(isinstance(item, str) and Path(item).is_absolute()
                   for item in (cwd_lexical, script_lexical, interpreter)):
            deny(f"process_paths:{component}")
        try:
            cwd_physical = Path(cwd_lexical).resolve(strict=True)
            script_physical = Path(script_lexical).resolve(strict=True)
            interpreter_physical = Path(interpreter).resolve(strict=True)
        except OSError:
            deny(f"process_paths:{component}")
        process_cwd = self.host.process_cwd(pid)
        process_exe = self.host.process_exe(pid)
        if expected_runtime is not None:
            expected = expected_runtime.resolve(strict=True)
            entry = "dist/index.js" if component == "api" else "node_modules/next/dist/bin/next"
            if (cwd_physical != expected or process_cwd != expected or
                    script_physical != (expected / entry).resolve(strict=True)):
                deny(f"process_runtime:{component}")
        if process_exe != interpreter_physical:
            deny(f"process_interpreter:{component}")
        return {
            "name": row["name"], "pid": pid, "startTicks": self._ticks(pid),
            "restartCount": self._pm2_field(row, "restart_time") or 0,
            "pmCwdLexical": cwd_lexical, "pmExecPathLexical": script_lexical,
            "cwdPhysical": str(cwd_physical), "scriptPhysical": str(script_physical),
            "processCwdPhysical": str(process_cwd), "interpreter": interpreter,
            "interpreterPhysical": str(interpreter_physical), "processExe": str(process_exe),
            "args": self._pm2_field(row, "args") or [],
            "nodeArgs": self._pm2_field(row, "node_args") or [],
            "execMode": self._pm2_field(row, "exec_mode"),
            "instancesRaw": self._pm2_field(row, "instances"),
            "namespace": self._pm2_field(row, "namespace"),
            "logs": {"out": self._pm2_field(row, "out_file"),
                     "error": self._pm2_field(row, "error_file"),
                     "merge": self._pm2_field(row, "merge_logs")},
            "environmentSha256": self._environment_sha256(row, component),
        }

    def _selection_snapshot(self, component: str) -> dict[str, str]:
        link = self.stable[component]
        if not link.is_symlink():
            deny(f"stable_path_not_symlink:{component}")
        try:
            physical = link.resolve(strict=True)
        except OSError:
            deny(f"stable_path_unresolved:{component}")
        if physical.parent.parent != self.releases.resolve(strict=True):
            deny(f"stable_path_release_root:{component}")
        if physical.name != RUNTIME_DIR[component]:
            deny(f"stable_path_runtime:{component}")
        return {"path": str(link), "target": os.readlink(link),
                "physicalRuntime": str(physical), "releaseId": physical.parent.name}

    @staticmethod
    def _configuration_projection(snapshot: dict[str, Any]) -> dict[str, Any]:
        keys = ("name", "pmCwdLexical", "pmExecPathLexical", "interpreter",
                "args", "nodeArgs", "execMode", "instancesRaw", "namespace",
                "logs", "environmentSha256")
        return {key: snapshot.get(key) for key in keys}

    def _worker(self, rows: list[dict[str, Any]]) -> dict[str, Any]:
        return self._process_snapshot(self._row(rows, PROCESS_NAMES["worker"]), "worker")

    def _process_name(self, component: str) -> str:
        if component not in PROCESS_NAMES:
            deny(f"process_component:{component}")
        return PROCESS_NAMES[component]

    def _health(self, *, candidate_asset: bool = False) -> None:
        for url in (LOCAL_HEALTH["api"], PUBLIC_HEALTH["api"]):
            try:
                status, content_type, payload = self.host.api_health(url)
            except Exception:
                deny("health_request_failed")
            if status != 200:
                deny(f"health_status:{status}")
            if content_type != "application/json" or payload.get("ok") is not True or payload.get("db") != "ok":
                deny("api_health_contract")
        urls: list[str] = []
        for path in FRONTEND_GET_PATHS:
            urls.extend((f"http://127.0.0.1:3000{path}", f"https://converta.re7online.com{path}"))
        if candidate_asset:
            static_root = self.stable["frontend"].resolve(strict=True) / ".next/static"
            assets = sorted(path for path in static_root.rglob("*")
                            if path.is_file() and not path.is_symlink())
            if not assets:
                deny("frontend_asset_missing")
            asset_path = "/_next/static/" + assets[0].relative_to(static_root).as_posix()
            urls.extend((f"http://127.0.0.1:3000{asset_path}",
                         f"https://converta.re7online.com{asset_path}"))
        for url in urls:
            try:
                status = self.host.get(url)
            except Exception:
                deny("health_request_failed")
            if status != 200:
                deny(f"health_status:{status}")

    def _journal_read(self) -> dict[str, Any]:
        regular_private(self.journal)
        journal = read_json(self.journal)
        if journal.get("schemaVersion") != 1 or journal.get("state") not in STATES:
            deny("transaction_schema")
        if journal.get("binding") != self.inputs.binding():
            deny("transaction_binding")
        return journal

    def _journal_write(self, journal: dict[str, Any], state: str) -> None:
        if state not in STATES:
            deny("transaction_state")
        journal["state"] = state
        journal["updatedAtUnix"] = int(self.clock())
        atomic_private(self.journal, journal)

    def _failpoint(self, _name: str) -> None:
        """No-op seam used only by the non-production fault-injection fixture."""

    @staticmethod
    def _failure_predicate(error: BaseException) -> str:
        return str(error)[:240] if isinstance(error, Denied) else type(error).__name__

    def _record_failure(self, journal: dict[str, Any], error: BaseException, recovery: str) -> None:
        journal["failure"] = self._failure_predicate(error)
        journal["recoveryAction"] = recovery
        self._journal_write(journal, "FAILED")

    def _authenticate_retirement(self, *, receipt_must_be_absent: bool = True) -> RetirementBinding:
        binding = self.inputs.retirement
        if binding is None:
            deny("generation_retirement_binding_required")
        for path, expected, label in (
            (binding.tool, binding.tool_sha256, "tool"),
            (binding.intent, binding.intent_sha256, "intent"),
            (binding.authorization, binding.authorization_sha256, "authorization"),
            (binding.operational_state, binding.operational_state_sha256, "operational_state"),
        ):
            raw, _ = stable_regular_bytes(path, required_mode=0o600)
            if hashlib.sha256(raw).hexdigest() != expected:
                deny(f"generation_retirement_hash:{label}")
        policy_raw, policy_info = stable_regular_bytes(binding.root_policy)
        if (stat.S_IMODE(policy_info.st_mode) not in {0o600, 0o644} or
                hashlib.sha256(policy_raw).hexdigest() != binding.root_policy_sha256):
            deny("generation_retirement_hash:root_policy")
        if receipt_must_be_absent and (binding.receipt_root.exists() or binding.receipt_root.is_symlink()):
            deny("generation_retirement_receipt_exists")
        if not binding.review_output.is_absolute() or not binding.receipt_root.is_absolute():
            deny("generation_retirement_destination")
        parent = binding.receipt_root.parent
        try:
            parent_info = parent.lstat()
        except FileNotFoundError:
            deny("generation_retirement_receipt_parent_missing")
        if (parent.is_symlink() or not stat.S_ISDIR(parent_info.st_mode) or
                parent_info.st_uid != os.geteuid() or parent_info.st_gid != os.getegid() or
                stat.S_IMODE(parent_info.st_mode) != 0o700):
            deny("generation_retirement_receipt_parent_identity")
        return binding

    @staticmethod
    def _retirement_pm2_fingerprint(rows: list[dict[str, Any]]) -> str:
        projected = []
        for row in rows:
            env = row.get("pm2_env") if isinstance(row.get("pm2_env"), dict) else {}
            projected.append({key: row[key] if key in row and row[key] is not None else env.get(key)
                              for key in ("name", "pid", "status", "restart_time", "pm_cwd",
                                          "pm_exec_path", "exec_mode", "instances", "args",
                                          "node_args", "namespace", "out_file", "error_file")})
        raw = (json.dumps(sorted(projected, key=lambda item: str(item.get("name"))),
                          sort_keys=True, separators=(",", ":")) + "\n").encode()
        return hashlib.sha256(raw).hexdigest()

    def _retirement_final_operational(self, binding: RetirementBinding,
                                      journal: dict[str, Any]) -> tuple[Path, str]:
        raw, _ = stable_regular_bytes(binding.operational_state, required_mode=0o600)
        value = json_object(raw, binding.operational_state.name)
        observations = value.get("observations")
        if not isinstance(observations, dict) or not isinstance(observations.get("currentLinks"), list):
            deny("generation_retirement_operational_schema")
        current_links = []
        current_paths = []
        for item in observations["currentLinks"]:
            path = Path(str(item.get("path", ""))) if isinstance(item, dict) else Path("")
            if not path.is_absolute() or not path.is_symlink():
                deny("generation_retirement_current_link")
            target = path.resolve(strict=True)
            current_links.append({"path": str(path), "target": str(target)})
            current_paths.append(str(target))
        rows = self.host.pm2_rows(self._resolve_pm2())
        live_paths: list[str] = []
        for row in rows:
            env = row.get("pm2_env") if isinstance(row.get("pm2_env"), dict) else {}
            for field in ("pm_cwd", "pm_exec_path"):
                candidate = row[field] if field in row and row[field] is not None else env.get(field)
                if isinstance(candidate, str) and candidate:
                    live_paths.append(candidate)
        dump_raw, _ = stable_regular_bytes(self.dump, required_mode=0o600)
        try:
            dump_rows = json.loads(dump_raw)
        except json.JSONDecodeError:
            deny("generation_retirement_dump_json")
        dump_paths: list[str] = []
        if not isinstance(dump_rows, list):
            deny("generation_retirement_dump_shape")
        for row in dump_rows:
            if not isinstance(row, dict):
                deny("generation_retirement_dump_shape")
            env = row.get("pm2_env") if isinstance(row.get("pm2_env"), dict) else {}
            for field in ("pm_cwd", "pm_exec_path"):
                candidate = row.get(field, env.get(field))
                if isinstance(candidate, str) and candidate:
                    dump_paths.append(candidate)
        previous_releases = set()
        for target in journal.get("previous", {}).get("symlinks", {}).values():
            if isinstance(target, str):
                try:
                    previous_releases.add(Path(target).resolve(strict=True).parent.name)
                except OSError:
                    deny("generation_retirement_previous_release")
        active = set(value.get("activeReleases", [])) - previous_releases
        active.add(self.inputs.release)
        rollback = set(value.get("rollbackReleases", [])) | previous_releases
        candidates = set(value.get("candidateReleases", [])); candidates.discard(self.inputs.release)
        installed = set(value.get("installedVerifiedReleases", [])); installed.add(self.inputs.release)
        value.update(currentPaths=sorted(set(current_paths)), pm2LivePaths=sorted(set(live_paths)),
                     pm2DumpPaths=sorted(set(dump_paths)), activeReleases=sorted(active),
                     rollbackReleases=sorted(rollback), candidateReleases=sorted(candidates),
                     installedVerifiedReleases=sorted(installed), deploymentState={"state": "DEPLOYED"})
        graph = {key: value[key] for key in ("activeReleases", "rollbackReleases",
                 "transitiveReturnReleases", "candidateReleases", "installedVerifiedReleases",
                 "supersededCandidates")}
        graph_path = self.inputs.transaction_root / "generation-release-graph.final.private.json"
        atomic_private(graph_path, graph, exclusive=True)
        observations["currentLinks"] = current_links
        observations["pm2"]["fingerprintSha256"] = self._retirement_pm2_fingerprint(rows)
        observations["dump"] = {"path": str(self.dump), "sha256": hashlib.sha256(dump_raw).hexdigest()}
        observations["releaseGraph"] = {"path": str(graph_path), "sha256": digest(graph_path)}
        final_path = self.inputs.transaction_root / "generation-operational.final.private.json"
        atomic_private(final_path, value, exclusive=True)
        return final_path, digest(final_path)

    def _retire_generation(self, journal: dict[str, Any]) -> tuple[str, dict[str, Any]]:
        binding = self._authenticate_retirement(receipt_must_be_absent=False)
        existing = binding.receipt_root / "execution-receipt.private.json"
        if existing.exists() or existing.is_symlink():
            raw, _ = stable_regular_bytes(existing, required_mode=0o600)
            receipt = json_object(raw, existing.name)
            state = receipt.get("state")
            if (state not in {"DEPLOYED_SANITIZED", "DEPLOYED_RETENTION_INCOMPLETE"} or
                    receipt.get("intentSha256") != binding.intent_sha256):
                deny("generation_retirement_existing_receipt")
            return state, {"result": state, "receiptSha256": hashlib.sha256(raw).hexdigest(),
                           "resumedFromDurableReceipt": True}
        final_operational, final_operational_sha = self._retirement_final_operational(binding, journal)
        command = [sys.executable, str(binding.tool), "execute",
                   "--intent", str(binding.intent), "--intent-sha256", binding.intent_sha256,
                   "--authorization", str(binding.authorization),
                   "--authorization-sha256", binding.authorization_sha256,
                   "--operational-state", str(final_operational),
                   "--operational-state-sha256", final_operational_sha,
                   "--root-policy", str(binding.root_policy),
                   "--root-policy-sha256", binding.root_policy_sha256,
                   "--deployment-lock", str(binding.deployment_lock),
                   "--receipt-root", str(binding.receipt_root),
                   "--review-output", str(binding.review_output)]
        result = self.host.run(command, timeout=180)
        stdout_raw = result.stdout.encode()
        stderr_raw = result.stderr.encode()
        stdout_path = self.inputs.transaction_root / "generation-retirement.stdout.private.txt"
        stderr_path = self.inputs.transaction_root / "generation-retirement.stderr.private.txt"
        exit_path = self.inputs.transaction_root / "generation-retirement.exit.private.txt"
        atomic_private_bytes(stdout_path, stdout_raw)
        atomic_private_bytes(stderr_path, stderr_raw)
        atomic_private_bytes(exit_path, (str(result.returncode) + "\n").encode())
        evidence = {
            "exitCode": result.returncode,
            "stdoutPath": str(stdout_path), "stdoutSha256": hashlib.sha256(stdout_raw).hexdigest(),
            "stderrPath": str(stderr_path), "stderrSha256": hashlib.sha256(stderr_raw).hexdigest(),
            "exitPath": str(exit_path), "exitSha256": digest(exit_path),
        }
        if result.returncode:
            reason = result.stderr.strip().splitlines()[-1] if result.stderr.strip() else None
            if reason is not None:
                evidence["failurePredicate"] = reason[:240]
            return "DEPLOYED_RETENTION_INCOMPLETE", evidence
        try:
            report = json.loads(result.stdout)
        except json.JSONDecodeError:
            return "DEPLOYED_RETENTION_INCOMPLETE", {**evidence, "predicate": "retirement_output_invalid"}
        state = report.get("result") if isinstance(report, dict) else None
        if state not in {"DEPLOYED_SANITIZED", "DEPLOYED_RETENTION_INCOMPLETE"}:
            return "DEPLOYED_RETENTION_INCOMPLETE", {**evidence, "predicate": "retirement_state_invalid"}
        receipt_sha = report.get("receiptSha256")
        if not isinstance(receipt_sha, str) or not SHA256.fullmatch(receipt_sha):
            return "DEPLOYED_RETENTION_INCOMPLETE", {**evidence, "predicate": "retirement_receipt_identity_missing"}
        receipt_raw, _ = stable_regular_bytes(
            binding.receipt_root / "execution-receipt.private.json", required_mode=0o600)
        if hashlib.sha256(receipt_raw).hexdigest() != receipt_sha:
            return "DEPLOYED_RETENTION_INCOMPLETE", {**evidence, "predicate": "retirement_receipt_identity"}
        report["operationalStateSha256"] = final_operational_sha
        report["operationalStatePath"] = str(final_operational)
        report["executionEvidence"] = evidence
        return state, report

    def _dump_environment_sha256(self, row: dict[str, Any], component: str) -> str:
        return self._environment_sha256(row, component)

    def _dump_equivalent(self, row: dict[str, Any], live: dict[str, Any],
                         component: str, process_count: int) -> None:
        fields = {
            "name": row.get("name"),
            "pmCwdLexical": self._pm2_field(row, "cwd"),
            "pmExecPathLexical": self._pm2_field(row, "script"),
            "interpreter": self._pm2_field(row, "interpreter"),
            "args": self._pm2_field(row, "args") or [],
            "nodeArgs": self._pm2_field(row, "node_args") or [],
            "execMode": self._pm2_field(row, "exec_mode"),
            "instancesRaw": self._pm2_field(row, "instances"),
            "namespace": self._pm2_field(row, "namespace"),
            "logs": {"out": self._pm2_field(row, "out_file"),
                     "error": self._pm2_field(row, "error_file"),
                     "merge": self._pm2_field(row, "merge_logs")},
            "environmentSha256": self._dump_environment_sha256(row, component),
        }
        raw_live = live.get("instancesRaw")
        raw_dump = fields["instancesRaw"]
        if raw_live == raw_dump:
            pass
        elif (raw_live == 1 and raw_dump is None and live.get("execMode") == "fork_mode"
              and process_count == 1):
            fields["instancesRaw"] = raw_live
        else:
            deny(f"final_dump_field:{component}:instances")
        if fields != self._configuration_projection(live):
            for key, value in fields.items():
                if value != self._configuration_projection(live).get(key):
                    deny(f"final_dump_field:{component}:{key}")
            deny(f"final_dump_field:{component}:unknown")

    def _candidate_dump_identity(self, journal: dict[str, Any]) -> dict[str, Any]:
        identity = private_file_identity(self.dump)
        try:
            rows = json.loads(self.dump.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            deny("final_dump_json")
        if not isinstance(rows, list):
            deny("final_dump_shape")
        live_snapshots = dict(journal.get("candidate", {}).get("processes", {}))
        live_snapshots["worker"] = journal.get("previous", {}).get("worker", {})
        for component in (*COMPONENTS, "worker"):
            live = live_snapshots.get(component)
            if not isinstance(live, dict):
                deny(f"final_dump_live:{component}")
            matches = [row for row in rows if isinstance(row, dict)
                       and row.get("name") == PROCESS_NAMES[component]]
            if len(matches) != 1:
                deny(f"final_dump_process:{component}")
            count = sum(1 for item in rows if isinstance(item, dict)
                        and item.get("name") == PROCESS_NAMES[component])
            self._dump_equivalent(matches[0], live, component, count)
        return identity

    def _preserved_components(self) -> tuple[str, ...]:
        return tuple(component for component in COMPONENTS
                     if component not in self.inputs.components)

    def _validate_preserved_components(
            self, journal: dict[str, Any], evidence_prefix: str) -> tuple[dict[str, Any], dict[str, Any]]:
        previous = journal.get("previous", {})
        processes: dict[str, Any] = {}
        readiness: dict[str, Any] = {}
        rows = self.host.pm2_rows(self._resolve_pm2())
        for component in self._preserved_components():
            expected_selection = journal.get("preflight", {}).get("selections", {}).get(component)
            selection = self._selection_snapshot(component)
            if selection != expected_selection:
                deny(f"preserved_selection_changed:{component}")
            runtime = Path(selection["physicalRuntime"])
            snapshot = self._process_snapshot(
                self._row(rows, self._process_name(component)), component, runtime)
            if snapshot != previous.get("processes", {}).get(component):
                deny(f"preserved_process_changed:{component}")
            processes[component] = snapshot
            readiness[component] = self._readiness(
                component, selection["releaseId"], runtime,
                f"{evidence_prefix}-{component}")
            for key in ("pid", "startTicks", "restartCount"):
                if (key in readiness[component] and
                        readiness[component][key] != snapshot[key]):
                    deny(f"preserved_readiness_identity:{component}:{key}")
        return processes, readiness

    def preflight(self) -> None:
        if self.inputs.components not in SUPPORTED_COMPONENT_SETS:
            deny("components_must_be_api_or_api_frontend")
        if self.inputs.retirement is None:
            deny("generation_retirement_binding_required")
        if self.inputs.retirement.deployment_lock != self.lock:
            deny("generation_retirement_lock_mismatch")
        self._authenticate_retirement()
        if self.journal.exists():
            deny("transaction_exists")
        if self.inputs.transaction_root.exists():
            private_directory(self.inputs.transaction_root)
            if any(self.inputs.transaction_root.iterdir()):
                deny("transaction_root_not_empty")
        else:
            self.inputs.transaction_root.mkdir(mode=0o700, parents=True)
        self._control_head()
        runtime_manifest = self._authenticated_runtime_manifest()
        release = self._release()
        pm2 = self._resolve_pm2()
        rows = self.host.pm2_rows(pm2)
        worker = self._worker(rows)
        processes: dict[str, Any] = {}
        readiness: dict[str, Any] = {}
        selections: dict[str, Any] = {}
        for component in COMPONENTS:
            selections[component] = self._selection_snapshot(component)
            rollback_identity = runtime_manifest["rollbackReleases"][component]
            expected = self._rollback_release(component, rollback_identity).resolve(strict=True)
            if Path(selections[component]["physicalRuntime"]) != expected:
                deny(f"preflight_rollback_runtime:{component}")
            processes[component] = self._process_snapshot(
                self._row(rows, self._process_name(component)), component, expected)
            release_id = selections[component]["releaseId"]
            if release_id != rollback_identity["releaseId"]:
                deny(f"preflight_rollback_release:{component}")
            readiness[component] = self._readiness(
                component, release_id, expected, f"preflight-{component}")
        regular_private(self.dump)
        if shutil.disk_usage(self.inputs.transaction_root).free < 64 * 1024 * 1024:
            deny("insufficient_space")
        self._health()
        journal = {
            "schemaVersion": 1, "state": "PREFLIGHT_PASS", "binding": self.inputs.binding(),
            "preflight": {"release": release, "worker": worker,
                          "processes": processes, "selections": selections,
                          "readiness": readiness,
                          "runtimeManifestSha256": self.inputs.runtime_manifest_sha256,
                          "dump": private_file_identity(self.dump),
                          "pm2": str(pm2.resolve())},
            "saveCount": 0, "deployedMarkerCreated": False,
            "createdAtUnix": int(self.clock()), "updatedAtUnix": int(self.clock()),
        }
        if self.inputs.components == ("api",):
            journal["components"] = ["api"]
        atomic_private(self.journal, journal, exclusive=True)

    def _acquire_lock(self, journal: dict[str, Any]) -> None:
        self.lock.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
        try:
            fd = os.open(self.lock, flags, 0o600)
        except FileExistsError:
            deny("global_lock_active")
        with os.fdopen(fd, "w") as stream:
            stream.write(hashlib.sha256(json.dumps(journal["binding"], sort_keys=True).encode()).hexdigest() + "\n")
            stream.flush(); os.fsync(stream.fileno())
        journal["lockDigest"] = digest(self.lock)

    def _release_lock(self, journal: dict[str, Any], *, allow_absent: bool = False) -> None:
        if not self.lock.exists() and allow_absent:
            return
        regular_private(self.lock)
        if digest(self.lock) != journal.get("lockDigest"):
            deny("global_lock_identity")
        self.lock.unlink()

    def _ensure_lock(self, journal: dict[str, Any]) -> None:
        if self.lock.exists():
            regular_private(self.lock)
            if digest(self.lock) != journal.get("lockDigest"): deny("global_lock_identity")
            return
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
        fd = os.open(self.lock, flags, 0o600)
        with os.fdopen(fd, "w") as stream:
            stream.write(hashlib.sha256(json.dumps(journal["binding"], sort_keys=True).encode()).hexdigest() + "\n")
            stream.flush(); os.fsync(stream.fileno())
        if digest(self.lock) != journal.get("lockDigest"): deny("global_lock_recovery_identity")

    def _readiness(self, component: str, release_id: str, runtime: Path,
                   evidence_name: str) -> dict[str, Any]:
        entry_relative = "dist/index.js" if component == "api" else "node_modules/next/dist/bin/next"
        entry = runtime / entry_relative
        raw, _ = stable_regular_bytes(entry)
        args = [
            "wait-existing-readiness", "--component", component,
            "--process-name", self._process_name(component),
            "--expected-cwd", str(self.stable[component]),
            "--expected-script", str(self.stable[component] / entry_relative),
            "--expected-interpreter", str(self.host.process_exe(
                self._row(self.host.pm2_rows(self._resolve_pm2()), self._process_name(component))["pid"])),
            "--release-id", release_id, "--entry-sha256", hashlib.sha256(raw).hexdigest(),
            "--pm2", str(self._resolve_pm2()), "--stable-path", str(self.stable[component]),
            "--release-root", str(runtime), "--port", str(PORT[component]),
            "--local-health", LOCAL_HEALTH[component], "--public-health", PUBLIC_HEALTH[component],
            "--deadline-seconds", "30", "--poll-seconds", "0.5",
        ]
        if component == "frontend":
            build_id = (runtime / ".next/BUILD_ID").read_text(encoding="utf-8").strip()
            args.extend(("--build-id", build_id))
        root = self.inputs.transaction_root
        report = root / f"{evidence_name}.report.private.json"
        stdout = root / f"{evidence_name}.stdout.private.txt"
        stderr = root / f"{evidence_name}.stderr.private.txt"
        existing = [path.exists() or path.is_symlink() for path in (report, stdout, stderr)]
        if any(existing):
            if not all(existing):
                deny("READINESS_OBSERVABILITY_DEFECT")
            regular_private(report); regular_private(stdout); regular_private(stderr)
            value = read_json(report)
            if value.get("result") != "READINESS_PASS":
                deny(str(value.get("reason", "READINESS_OBSERVABILITY_DEFECT"))[:240])
            return value
        return self.host.control_evidence(
            self.repo, args,
            report=report, stdout=stdout, stderr=stderr)

    def _restart_existing(self, component: str, before: dict[str, Any],
                          release_id: str, runtime: Path, evidence_name: str) -> tuple[dict[str, Any], dict[str, Any]]:
        pm2 = self._resolve_pm2()
        name = self._process_name(component)
        self.host.pm2_mutate(pm2, ["restart", name])
        row = self._row(self.host.pm2_rows(pm2), name)
        after = self._process_snapshot(row, component, runtime)
        if self._configuration_projection(after) != self._configuration_projection(before):
            deny(f"process_configuration_changed:{component}")
        if after["restartCount"] != before["restartCount"] + 1:
            deny(f"restart_count:{component}")
        readiness = self._readiness(component, release_id, runtime, evidence_name)
        for key in ("pid", "startTicks", "restartCount"):
            if key in readiness and readiness[key] != after[key]:
                deny(f"readiness_identity:{component}:{key}")
        return after, readiness

    @staticmethod
    def _validate_private_data_continuity(journal: dict[str, Any], release: dict[str, Any]) -> None:
        current = release.get("privateDataOverlay")
        if not isinstance(current, dict):
            deny("private_data_overlay_evidence")
        expected = journal.get("preflight", {}).get("release", {}).get("privateDataOverlay")
        # Transactions prepared before the generic contract was versioned did not
        # persist this projection. Their authenticated generation contract remains
        # the authority; finalization still performs the full current validation.
        if expected is None:
            return
        if not isinstance(expected, dict):
            deny("private_data_overlay_preflight_evidence")
        common = ("path", "classification", "state")
        if any(expected.get(key) != current.get(key) for key in common):
            deny("private_data_overlay_contract_drift")
        if expected.get("present") is True:
            stable = ("present", "rootIdentity", "ownerUid", "groupGid", "mode")
            if any(expected.get(key) != current.get(key) for key in stable):
                deny("private_data_overlay_identity_drift")

    def activate(self) -> None:
        journal = self._journal_read()
        if journal["state"] != "PREFLIGHT_PASS":
            deny("activate_state")
        self._control_head(); runtime_manifest = self._authenticated_runtime_manifest()
        release = self._release()
        self._validate_private_data_continuity(journal, release)
        self._acquire_lock(journal)
        try:
            rows = self.host.pm2_rows(self._resolve_pm2())
            processes = {}
            for component in COMPONENTS:
                selection = self._selection_snapshot(component)
                if selection != journal.get("preflight", {}).get("selections", {}).get(component):
                    deny(f"pre_activation_selection_drift:{component}")
                current_runtime = Path(selection["physicalRuntime"])
                snapshot = self._process_snapshot(
                    self._row(rows, self._process_name(component)), component, current_runtime)
                if snapshot != journal.get("preflight", {}).get("processes", {}).get(component):
                    deny(f"pre_activation_process_drift:{component}")
                processes[component] = snapshot
            worker = self._worker(rows)
            if worker != journal.get("preflight", {}).get("worker"):
                deny("pre_activation_worker_drift")
            previous = {
                "symlinks": {component: os.readlink(self.stable[component]) for component in COMPONENTS},
                "releases": {component: runtime_manifest["rollbackReleases"][component]["releaseId"]
                             for component in COMPONENTS},
                "worker": worker, "processes": processes,
                "dump": private_file_identity(self.dump),
            }
            rollback_dump = self.inputs.transaction_root / "rollback.dump.pm2"
            if rollback_dump.exists():
                deny("rollback_dump_exists")
            shutil.copyfile(self.dump, rollback_dump)
            os.chmod(rollback_dump, 0o600)
            with rollback_dump.open("rb") as stream: os.fsync(stream.fileno())
        except Exception:
            self._release_lock(journal)
            raise
        journal["previous"] = previous
        journal["rollbackDumpSha256"] = digest(rollback_dump)
        self._journal_write(journal, "ACTIVATING")
        try:
            readiness: dict[str, Any] = {}
            candidate_processes: dict[str, Any] = {}
            for component in self.inputs.components:
                runtime = self.release_root / RUNTIME_DIR[component]
                journal.setdefault("activationAttempted", []).append(component)
                self._journal_write(journal, "ACTIVATING")
                atomic_symlink(self.stable[component], runtime)
                candidate_processes[component], readiness[component] = self._restart_existing(
                    component, previous["processes"][component], self.inputs.release,
                    runtime, f"activate-{component}")
                journal.setdefault("activationProgress", []).append(component)
                self._journal_write(journal, "ACTIVATING")
                if component == "frontend":
                    build_id = (self.release_root / "frontend-runtime/.next/BUILD_ID").read_text().strip()
                    manifest = read_json(self.release_root / "manifest.json")
                    if build_id != manifest.get("runtimes", {}).get("frontend", {}).get("buildId"):
                        deny("frontend_build_id")
            self._health(candidate_asset=True)
            preserved_processes, preserved_readiness = self._validate_preserved_components(
                journal, "activate-preserved")
            candidate_processes.update(preserved_processes)
            readiness.update(preserved_readiness)
            worker = self._worker(self.host.pm2_rows(self._resolve_pm2()))
            if worker != previous["worker"]:
                deny("worker_changed")
            journal["candidate"] = {"readiness": readiness, "processes": candidate_processes,
                                    "worker": worker}
            self._journal_write(journal, "AWAITING_ACCEPTANCE")
        except Exception:
            self._rollback_internal(journal)
            raise

    def _rollback_internal(self, journal: dict[str, Any]) -> None:
        if journal.get("saveCount") != 0:
            deny("rollback_after_save")
        previous = journal.get("previous", {})
        progress = journal.setdefault("rollback", {"restoredComponents": [], "lockReleaseStarted": False})
        self._journal_write(journal, "ROLLING_BACK")
        try:
            attempted = journal.get("activationAttempted", [])
            if not isinstance(attempted, list) or any(item not in COMPONENTS for item in attempted):
                deny("rollback_activation_progress")
            for component in reversed(attempted):
                target = previous.get("symlinks", {}).get(component)
                if not isinstance(target, str): deny(f"rollback_symlink_missing:{component}")
                if component not in progress["restoredComponents"]:
                    current = self._process_snapshot(
                        self._row(self.host.pm2_rows(self._resolve_pm2()), self._process_name(component)),
                        component, self.stable[component].resolve(strict=True))
                    atomic_symlink(self.stable[component], Path(target))
                    release_id = previous.get("releases", {}).get(component)
                    if not isinstance(release_id, str):
                        deny(f"rollback_release_missing:{component}")
                    restored, readiness = self._restart_existing(
                        component, current, release_id, Path(target).resolve(strict=True),
                        f"rollback-{component}")
                    progress.setdefault("processes", {})[component] = restored
                    progress.setdefault("readiness", {})[component] = readiness
                    progress["restoredComponents"].append(component)
                    self._journal_write(journal, "ROLLING_BACK")
                    self._failpoint(f"rollback_after_{component}")
                else:
                    if self.stable[component].resolve(strict=True) != Path(target).resolve(strict=True):
                        deny(f"rollback_symlink_drift:{component}")
                    release_id = previous.get("releases", {}).get(component)
                    if not isinstance(release_id, str):
                        deny(f"rollback_release_missing:{component}")
                    current = self._process_snapshot(
                        self._row(self.host.pm2_rows(self._resolve_pm2()), self._process_name(component)),
                        component, Path(target).resolve(strict=True))
                    recorded = progress.get("processes", {}).get(component)
                    if current != recorded:
                        deny(f"rollback_process_drift:{component}")
            self._validate_preserved_components(journal, "rollback-preserved")
            self._health()
            worker = self._worker(self.host.pm2_rows(self._resolve_pm2()))
            if worker != previous.get("worker"): deny("rollback_worker_changed")
            progress["lockReleaseStarted"] = True
            self._journal_write(journal, "ROLLING_BACK")
            self._release_lock(journal, allow_absent=True)
            self._failpoint("rollback_after_lock_release")
            self._journal_write(journal, "ROLLED_BACK")
        except Exception as error:
            self._ensure_lock(journal)
            self._record_failure(journal, error, "rollback")
            raise

    def rollback(self) -> None:
        journal = self._journal_read()
        if journal["state"] not in {"ACTIVATING", "AWAITING_ACCEPTANCE", "ROLLING_BACK", "FAILED"}:
            deny("rollback_state")
        if journal["state"] == "FAILED" and journal.get("recoveryAction") != "rollback":
            deny("rollback_failed_state_owner")
        if journal.get("saveCount") != 0:
            deny("rollback_after_save")
        current_dump = private_file_identity(self.dump)
        previous_dump = journal.get("previous", {}).get("dump", {})
        if current_dump.get("sha256") != previous_dump.get("sha256"):
            try:
                self._candidate_dump_identity(journal)
            except Denied:
                deny("rollback_dump_drift")
            deny("rollback_after_candidate_dump")
        self._control_head(); self._authenticated_runtime_manifest()
        self._rollback_internal(journal)

    def finalize(self) -> None:
        journal = self._journal_read()
        if journal["state"] not in {"AWAITING_ACCEPTANCE", "FINALIZING", "FAILED"}:
            deny("finalize_state")
        if journal["state"] == "FAILED" and journal.get("recoveryAction") != "finalize":
            deny("finalize_failed_state_owner")
        regular_private(self.acceptance)
        if self.acceptance.read_text(encoding="utf-8").strip() != "ACEITE TÉCNICO PASS":
            deny("technical_acceptance")
        if journal.get("saveCount") not in {0, 1}:
            deny("finalize_replay")
        try:
            self._control_head(); self._authenticated_runtime_manifest()
            release = self._release()
            self._validate_private_data_continuity(journal, release)
            final_readiness: dict[str, Any] = {}
            for component in COMPONENTS:
                selected = component in self.inputs.components
                expected_runtime = ((self.release_root / RUNTIME_DIR[component]) if selected else
                                    Path(journal.get("preflight", {}).get("selections", {})
                                         .get(component, {}).get("physicalRuntime", "")))
                if (not expected_runtime.is_absolute() or
                        self.stable[component].resolve(strict=True) != expected_runtime.resolve(strict=True)):
                    deny(f"finalize_symlink:{component}")
                current = self._process_snapshot(
                    self._row(self.host.pm2_rows(self._resolve_pm2()), self._process_name(component)),
                    component, expected_runtime)
                activated = journal.get("candidate", {}).get("processes", {}).get(component, {})
                if current != activated:
                    deny(f"finalize_identity_changed:{component}")
                final_readiness[component] = self._readiness(
                    component, (self.inputs.release if selected else
                                journal["preflight"]["selections"][component]["releaseId"]),
                    expected_runtime,
                    f"finalize-{component}")
            self._health(candidate_asset=True)
            worker = self._worker(self.host.pm2_rows(self._resolve_pm2()))
            if worker != journal.get("previous", {}).get("worker"): deny("finalize_worker_changed")
            marker = self.release_root / "DEPLOYED"
            finalize = journal.setdefault("finalize", {})
            first_finalize = not finalize
            finalize["readiness"] = final_readiness
            if first_finalize:
                if marker.exists(): deny("deployed_marker_exists")
                finalize.update(preSaveDump=private_file_identity(self.dump),
                                preparedAtUnix=int(self.clock()), lockReleaseStarted=False)
                self._journal_write(journal, "FINALIZING")
            elif marker.exists() and not isinstance(finalize.get("markerPayload"), dict):
                deny("deployed_marker_unbound")

            current = private_file_identity(self.dump)
            if journal.get("saveCount") == 0:
                saved = False
                if current["sha256"] != finalize["preSaveDump"]["sha256"]:
                    try:
                        self._candidate_dump_identity(journal); saved = True
                    except Denied:
                        deny("final_dump_unrecognized_drift")
                if not saved:
                    self._failpoint("before_save")
                    self.host.pm2_mutate(self._resolve_pm2(), ["save"])
                    self._failpoint("after_save")
                journal["saveCount"] = 1
                self._journal_write(journal, "FINALIZING")

            self._failpoint("dump_validation")
            final_dump = self._candidate_dump_identity(journal)
            prior_dump = journal.get("preflight", {}).get("dump", {})
            if (final_dump["uid"], final_dump["gid"]) != (prior_dump.get("uid"), prior_dump.get("gid")):
                deny("final_dump_owner")
            recorded = finalize.get("finalDump")
            if recorded is not None and recorded != final_dump: deny("final_dump_identity_drift")
            finalize["finalDump"] = final_dump
            journal["finalDumpSha256"] = final_dump["sha256"]
            payload = {"target": self.inputs.target, "controlPlane": self.inputs.control_plane,
                       "release": self.inputs.release, "dumpSha256": final_dump["sha256"],
                       "accepted": "ACEITE TÉCNICO PASS", "deployedAtUnix": finalize["preparedAtUnix"]}
            if self.inputs.components == ("api",):
                payload["components"] = ["api"]
            if finalize.get("markerPayload") not in (None, payload): deny("deployed_marker_payload_drift")
            finalize["markerPayload"] = payload
            self._journal_write(journal, "FINALIZING")
            if marker.exists():
                if read_json(marker) != payload: deny("deployed_marker_identity")
            else:
                self._failpoint("marker_rename")
                atomic_marker(marker, payload)
            journal["deployedMarkerCreated"] = True
            journal["deployedMarkerSha256"] = digest(marker)
            retention_state = journal.get("generationRetirementState")
            if retention_state not in {"DEPLOYED_SANITIZED", "DEPLOYED_RETENTION_INCOMPLETE"}:
                try:
                    retention_state, retention = self._retire_generation(journal)
                except Exception as error:
                    retention_state = "DEPLOYED_RETENTION_INCOMPLETE"
                    retention = {"predicate": self._failure_predicate(error), "automaticRetry": False}
                journal["generationRetirement"] = retention
                journal["generationRetirementState"] = retention_state
                self._journal_write(journal, retention_state)
            finalize["lockReleaseStarted"] = True
            self._journal_write(journal, retention_state)
            self._release_lock(journal, allow_absent=True)
            self._failpoint("lock_release")
            self._failpoint("final_journal")
            self._journal_write(journal, retention_state)
        except Exception as error:
            self._record_failure(journal, error, "finalize")
            raise

    def status(self) -> str:
        journal = self._journal_read()
        self._authenticated_runtime_manifest()
        summary = {
            "state": journal["state"], "release": self.inputs.release,
            "target": self.inputs.target, "controlPlane": self.inputs.control_plane,
            "saveCount": journal.get("saveCount", 0),
            "deployedMarkerCreated": journal.get("deployedMarkerCreated", False),
        }
        return json.dumps(summary, sort_keys=True)


def parse() -> tuple[str, Inputs]:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("preflight", "activate", "finalize", "rollback", "status"))
    parser.add_argument("--release", required=True)
    parser.add_argument("--target", required=True)
    parser.add_argument("--control-plane", required=True)
    parser.add_argument("--components", required=True)
    parser.add_argument("--runtime-manifest", type=Path, required=True)
    parser.add_argument("--runtime-manifest-sha256", required=True)
    parser.add_argument("--transaction-root", type=Path, required=True)
    parser.add_argument("--generation-retirement-tool", type=Path, required=True)
    parser.add_argument("--generation-retirement-tool-sha256", required=True)
    parser.add_argument("--generation-retirement-intent", type=Path, required=True)
    parser.add_argument("--generation-retirement-intent-sha256", required=True)
    parser.add_argument("--generation-retirement-authorization", type=Path, required=True)
    parser.add_argument("--generation-retirement-authorization-sha256", required=True)
    parser.add_argument("--generation-retirement-operational-state", type=Path, required=True)
    parser.add_argument("--generation-retirement-operational-state-sha256", required=True)
    parser.add_argument("--generation-retirement-root-policy", type=Path, required=True)
    parser.add_argument("--generation-retirement-root-policy-sha256", required=True)
    parser.add_argument("--generation-retirement-receipt-root", type=Path, required=True)
    parser.add_argument("--generation-retirement-review-output", type=Path, required=True)
    parser.add_argument("--generation-retirement-deployment-lock", type=Path, required=True)
    args = parser.parse_args()
    components = tuple(args.components.split(","))
    retirement = RetirementBinding(
        args.generation_retirement_tool, args.generation_retirement_tool_sha256,
        args.generation_retirement_intent, args.generation_retirement_intent_sha256,
        args.generation_retirement_authorization, args.generation_retirement_authorization_sha256,
        args.generation_retirement_operational_state, args.generation_retirement_operational_state_sha256,
        args.generation_retirement_root_policy, args.generation_retirement_root_policy_sha256,
        args.generation_retirement_receipt_root, args.generation_retirement_review_output,
        args.generation_retirement_deployment_lock)
    return args.command, Inputs(args.release, args.target, args.control_plane,
                                components, args.runtime_manifest, args.transaction_root,
                                args.runtime_manifest_sha256, retirement)


def main() -> int:
    try:
        command, inputs = parse()
        driver = Driver(inputs)
        if command == "status":
            print(driver.status())
            return 0
        getattr(driver, command)()
    except (Denied, OSError, subprocess.SubprocessError) as error:
        print(f"DEPLOY_DENY:{str(error)[:240]}", file=sys.stderr)
        return 2
    if command == "finalize":
        print(driver.status())
    else:
        print({"preflight": "PREFLIGHT PASS", "activate": "AWAITING_ACCEPTANCE",
               "rollback": "ROLLED_BACK"}[command])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
