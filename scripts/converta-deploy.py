#!/usr/bin/env python3
"""Minimal API/frontend deploy coordinator for the proven fixed-current route."""

from __future__ import annotations

import argparse
import fcntl
import hashlib
import importlib.util
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
PRIVATE_DATA_RECONCILIATION_KIND = "LEGACY_PRIVATE_DATA_OVERLAY_FINALIZE_RECONCILIATION"
RUNTIME_CACHE_RECONCILIATION_KIND = "FIXED_CURRENT_RUNTIME_CACHE_FINALIZE_RECONCILIATION_V1"
WORKER_ROLLBACK_CONTINUATION_KIND = "WORKER_PM2_REAL_LOG_ROLLBACK_CONTINUATION_V1"
LEGACY_0FDEC_RELEASE = "immutable-0fdec8b0-vps-20261028T224726Z"
LEGACY_0FDEC_TARGET = "0fdec8b026b28acb42c2d95e1fe473b49b6b0a20"
LEGACY_0FDEC_CONTRACT_SHA256 = "f3188049ea87c6f9e9ece01c4698d6e49994a13fe682cc828a0b0fc34e020c0a"
LEGACY_0FDEC_RETIREMENT_INTENT_SHA256 = "edd0eedf0561c3634e369d605d8f94092e95e6e1726625df350a5378cf1b33c3"
LEGACY_0FDEC_TRANSACTION = Path(
    "/opt/re7online/backups/converta-persistent/deploy-transactions/"
    "immutable-0fdec8b0-vps-20261028T224726Z-api-only-a23aded8-v1-once"
)
RUNTIME_CACHE_36B_RELEASE = "immutable-36b94c6d-vps-20261107T165118Z"
RUNTIME_CACHE_36B_TARGET = "36b94c6da7a1f3e07d4a123d0629b35bea48b014"
RUNTIME_CACHE_36B_TRANSACTION = Path(
    "/opt/re7online/backups/converta-persistent/deploy-transactions/"
    "immutable-36b94c6d-vps-20261107T165118Z-api-frontend-6fd93b08-v4-once"
)
RUNTIME_CACHE_36B_INDEX_SHA256 = "9f667f08e0b492bc397ec6317ebcc9608cbd54224cb500e47f2d4e3163a80edb"
RUNTIME_CACHE_36B_MANIFEST_SHA256 = "97470e7f9dcb799f9554551545a384c5b2fe0b40e313149024f6672dae88d85a"
RUNTIME_CACHE_36B_INTENT_SHA256 = "6064a4a98ede89bb085b09e4e474048d976aa9cf31a4c0cd03207be18a0c4f7c"
RUNTIME_CACHE_36B_NEGATIVE_JOURNAL_SHA256 = "4bb0c4265431aa433ca48e131a2202644f4fd39ca8f611a5a56314e17164a4bc"
RUNTIME_CACHE_36B_ACCEPTANCE_SHA256 = "1427ff7dd23e5a1059295fa400bc9f5d9def1c7d8395ff54a2cb3c47d238de7a"
RUNTIME_CACHE_36B_LOCK_SHA256 = "9dcff444e29797988c0b9501533e8f59d2b15d7c10e5794d4eff8469fd508cdb"
RUNTIME_CACHE_36B_EXTRAS = {
    "frontend-runtime/.next/cache": {"type": "directory", "mode": 0o755},
    "frontend-runtime/.next/cache/images": {"type": "directory", "mode": 0o755},
    "frontend-runtime/.next/cache/images/5Zf6Dt9Da6GBJFCrYyD0xu2dFAWqjPJ01EZzZ76RaCc": {
        "type": "directory", "mode": 0o755,
    },
    ("frontend-runtime/.next/cache/images/5Zf6Dt9Da6GBJFCrYyD0xu2dFAWqjPJ01EZzZ76RaCc/"
     "14400.1794095402876.PWJME0lVvfrDOLRUu2QulRp1jBxfu1J5ZOWEpf0UqF0.Vy8iMTFmYjYtMWExYjI0NWI4MjAi.webp"): {
        "type": "file", "mode": 0o644, "size": 10558,
        "sha256": "3d624c134955bdfac338b454bb642e951a758c1c5fbb527964e584a5fd14a85d",
    },
    "frontend-runtime/.next/cache/images/To4GqmXFYdIkSU_SW9FDP1_xRixDFs9QFhJLchkU4LM": {
        "type": "directory", "mode": 0o755,
    },
    ("frontend-runtime/.next/cache/images/To4GqmXFYdIkSU_SW9FDP1_xRixDFs9QFhJLchkU4LM/"
     "14400.1794095402874.Jp0Av1TKNogbcbTT52mEHKtqho7b1DeMRy2xsGKSkmw.Vy8iMWIxOGYtMWExYjI0NWI4MjAi.webp"): {
        "type": "file", "mode": 0o644, "size": 11454,
        "sha256": "269d00bf54ca36881b71b4d3e769841cab6a868edbd4378c472db1b06292926c",
    },
}
RUNTIME_CACHE_FA10_RELEASE = "immutable-fa10f4f5-external-20261112T233820Z"
RUNTIME_CACHE_FA10_TARGET = "fa10f4f59c9a05328e536dd25a1668c3ba25939e"
RUNTIME_CACHE_FA10_TRANSACTION = Path(
    "/opt/re7online/backups/converta-persistent/deploy-transactions/"
    "immutable-fa10f4f5-external-20261112T233820Z-api-frontend-88a5e8b7-v1-once"
)
RUNTIME_CACHE_FA10_INDEX_SHA256 = "312e047ec58514eb62f115c2efe115fe261de7deafdd052bd428b3ad4d376b19"
RUNTIME_CACHE_FA10_MANIFEST_SHA256 = "8e255cdc234ccfa385751c934c181ed58eb2d0e8a9dcb1c71db81be1e9ffa3cc"
RUNTIME_CACHE_FA10_INTENT_SHA256 = "cf22eb0f466b448092e1bebd9bf83279c076cf654b6b00b4e57e725ade3b9bc2"
RUNTIME_CACHE_FA10_NEGATIVE_JOURNAL_SHA256 = "5e03099c401dc155522cb2b36b667ffaf32d2d7daed1ba219682f804a672f017"
RUNTIME_CACHE_FA10_ACCEPTANCE_SHA256 = "1427ff7dd23e5a1059295fa400bc9f5d9def1c7d8395ff54a2cb3c47d238de7a"
RUNTIME_CACHE_FA10_LOCK_SHA256 = "f9e10f1075681b67ede7c6e62ade690c2a50a562ace6604051aebe342db23339"
RUNTIME_CACHE_FA10_EXTRAS = {
    "frontend-runtime/.next/cache": {"type": "directory", "mode": 0o755},
    "frontend-runtime/.next/cache/images": {"type": "directory", "mode": 0o755},
    "frontend-runtime/.next/cache/images/5Zf6Dt9Da6GBJFCrYyD0xu2dFAWqjPJ01EZzZ76RaCc": {
        "type": "directory", "mode": 0o755,
    },
    ("frontend-runtime/.next/cache/images/5Zf6Dt9Da6GBJFCrYyD0xu2dFAWqjPJ01EZzZ76RaCc/"
     "14400.1794581947655.PWJME0lVvfrDOLRUu2QulRp1jBxfu1J5ZOWEpf0UqF0.Vy8iMTFmYjYtMWExZDE5YWIzMzgi.webp"): {
        "type": "file", "mode": 0o644, "size": 10558,
        "sha256": "3d624c134955bdfac338b454bb642e951a758c1c5fbb527964e584a5fd14a85d",
    },
    "frontend-runtime/.next/cache/images/C6kHOGVuBg99mi5S3icZefk2-A0olpaDNKnM99SLY6c": {
        "type": "directory", "mode": 0o755,
    },
    ("frontend-runtime/.next/cache/images/C6kHOGVuBg99mi5S3icZefk2-A0olpaDNKnM99SLY6c/"
     "14400.1794582030725.up7CnLxV2Ygzw45ELtSmlTWWqbBVEb1jmNYkVzoPN0M.Vy8iMWIxOGYtMWExZDE5YWIzMzgi.webp"): {
        "type": "file", "mode": 0o644, "size": 4432,
        "sha256": "ba9ec29cbc55d98833c38e442ed4a6953596a9b05511bd6398d624573a0f3743",
    },
    "frontend-runtime/.next/cache/images/To4GqmXFYdIkSU_SW9FDP1_xRixDFs9QFhJLchkU4LM": {
        "type": "directory", "mode": 0o755,
    },
    ("frontend-runtime/.next/cache/images/To4GqmXFYdIkSU_SW9FDP1_xRixDFs9QFhJLchkU4LM/"
     "14400.1794581947693.Jp0Av1TKNogbcbTT52mEHKtqho7b1DeMRy2xsGKSkmw.Vy8iMWIxOGYtMWExZDE5YWIzMzgi.webp"): {
        "type": "file", "mode": 0o644, "size": 11454,
        "sha256": "269d00bf54ca36881b71b4d3e769841cab6a868edbd4378c472db1b06292926c",
    },
    "frontend-runtime/.next/cache/images/r1KbNqxU2NuD77PnVvrMwZrgKgdEfSJkSuDExI5kGJo": {
        "type": "directory", "mode": 0o755,
    },
    ("frontend-runtime/.next/cache/images/r1KbNqxU2NuD77PnVvrMwZrgKgdEfSJkSuDExI5kGJo/"
     "14400.1794582030736.E97iu2qJMpu_QOlvSzWQQBBTk60sVR61v3ZerurFIKs.Vy8iMTFmYjYtMWExZDE5YWIzMzgi.webp"): {
        "type": "file", "mode": 0o644, "size": 3732,
        "sha256": "13dee2bb6a89329bbf40e96f4b359040105393ad2c551eb5bf765eaeeac520ab",
    },
}
RUNTIME_CACHE_ED74_RELEASE = "immutable-ed74c483-external-20261115T162015Z"
RUNTIME_CACHE_ED74_TARGET = "ed74c483b35c6cfebbdaa1a0a16e233101c46dd4"
RUNTIME_CACHE_ED74_TRANSACTION = Path(
    "/opt/re7online/backups/converta-persistent/preparations/"
    "immutable-ed74c483-external-20261115T162015Z-api-frontend-worker-"
    "preflight-4e55c9d9-v2/transaction"
)
RUNTIME_CACHE_ED74_INDEX_SHA256 = "6a4b5f1ac0e6f03b752019eeb8bdadedded2b29d6b6fbfb848f1cf2c433e639d"
RUNTIME_CACHE_ED74_MANIFEST_SHA256 = "b93851eeb3b3129a9ac5fbf0b8bfa263c800114064d3f4239ed2207f7deba850"
RUNTIME_CACHE_ED74_INTENT_SHA256 = "250a535c4c756a7fcc087b39a722d5237e04a1150b6720c6b8337cb98d7f5496"
RUNTIME_CACHE_ED74_ACCEPTANCE_JOURNAL_SHA256 = (
    "7b903e0f7606af2b65bc5f9a89f34ae576f83236ac26160c90c28bc93cbaf61c"
)
RUNTIME_CACHE_ED74_ACCEPTANCE_SHA256 = "1427ff7dd23e5a1059295fa400bc9f5d9def1c7d8395ff54a2cb3c47d238de7a"
RUNTIME_CACHE_ED74_LOCK_SHA256 = "973215dd06be1517ff14e00b85bceb91dc7698f906fc589b86aab98d49e8b582"
RUNTIME_CACHE_41D_RELEASE = "immutable-41d70b53-external-20261118T214122Z"
RUNTIME_CACHE_41D_TARGET = "41d70b5368bc413ea34ee517b79351d7b8cd526b"
RUNTIME_CACHE_41D_TRANSACTION = Path(
    "/opt/re7online/backups/converta-persistent/deploy-transactions/"
    "immutable-41d70b53-external-20261118T214122Z-api-frontend-41d70b53-v2-once"
)
RUNTIME_CACHE_41D_INDEX_SHA256 = "f99c00bf7724dd581e34a4fccae4b4fd47ae32c596af20b2fad187b390eaf14c"
RUNTIME_CACHE_41D_MANIFEST_SHA256 = "3d0a9c69de53e39d3ee9d8df389d1640615988a80354f421a5dfe7732932b5cc"
RUNTIME_CACHE_41D_INTENT_SHA256 = "5fb229f2390fd3fcdcfdd0efe7cb0c69b87df8721bec39568e9ffe46249ea287"
RUNTIME_CACHE_41D_NEGATIVE_JOURNAL_SHA256 = (
    "263114a6abed7b66e6ee298fc773f81825f1eb682515a20c0721d62275d9ed8e"
)
RUNTIME_CACHE_41D_ACCEPTANCE_SHA256 = "1427ff7dd23e5a1059295fa400bc9f5d9def1c7d8395ff54a2cb3c47d238de7a"
RUNTIME_CACHE_41D_LOCK_SHA256 = "235780dd913299a349c61ba55cb0006818de9743cd47418246dde0f643fa5368"
RUNTIME_CACHE_RECONCILIATION_KIND_V2 = (
    "FIXED_CURRENT_RUNTIME_CACHE_FINALIZE_RECONCILIATION_V2"
)
RUNTIME_CACHE_POLICY_V2 = "NEXT_IMAGE_CACHE_V1"
STATES = {
    "PREFLIGHT_PASS", "ACTIVATING", "AWAITING_ACCEPTANCE", "FINALIZING",
    "DEPLOYED", "DEPLOYED_SANITIZED", "DEPLOYED_RETENTION_INCOMPLETE",
    "ROLLING_BACK", "ROLLED_BACK", "FAILED",
}
COMPONENTS = ("api", "frontend")
THREE_COMPONENTS = ("api", "frontend", "worker")
SUPPORTED_COMPONENT_SETS = (("api",), COMPONENTS, THREE_COMPONENTS)
STABLE = {
    "api": Path("/opt/re7online/current/api"),
    "frontend": Path("/opt/re7online/current/frontend"),
    "worker": Path("/opt/re7online/current/worker"),
}
RUNTIME_DIR = {"api": "api-runtime", "frontend": "frontend-runtime", "worker": "worker-runtime"}
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
# Immutable authority recovered from the already sealed 3/3 preparation.  A
# successor manifest may point at these files, but it cannot choose their trust
# anchors.  Changing this authority requires another versioned consumer review.
WORKER_PM2_SUCCESSION_ORIGIN = {
    "releaseId": "immutable-ed74c483-external-20261115T162015Z",
    "targetCommit": "ed74c483b35c6cfebbdaa1a0a16e233101c46dd4",
    "controlPlane": "623cb42d1c2da644c15ac2c3a11d32f046e671e0",
    "requests": {
        "candidate": "c1ea9e71652661cc4e25c46fb1355c922c113776b10d20d3be5b2132ed266317",
        "rollback": "8ce314d98535ee6e10eec5879636ef34563e42747da43cdbbf26d7d9c2f1118a",
    },
}
LOCK = Path("/opt/re7online/backups/converta-persistent/deploy.lock")
FIXED_CURRENT_LOCK_PREFIX = b"CONVERTA_FIXED_CURRENT_V1:"
EXTERNAL_LOCK_ENV = "RE7_DEPLOYMENT_LOCK_HELD"
EXTERNAL_LOCK_FD = 9
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
        os.fchmod(fd, 0o600)
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
class RetirementSentinelClosureBinding:
    manifest: Path
    manifest_sha256: str

    def binding(self) -> dict[str, str]:
        return {"manifest": str(self.manifest), "manifestSha256": self.manifest_sha256}


@dataclass(frozen=True)
class ControlPlaneSuccessionBinding:
    manifest: Path
    manifest_sha256: str

    def binding(self) -> dict[str, str]:
        return {"manifest": str(self.manifest), "manifestSha256": self.manifest_sha256}


@dataclass(frozen=True)
class WorkerRollbackContinuationBinding:
    manifest: Path
    manifest_sha256: str


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
    private_data_reconciliation: Path | None = None
    private_data_reconciliation_sha256: str | None = None
    retirement_sentinel_closure: RetirementSentinelClosureBinding | None = None
    runtime_cache_reconciliation: Path | None = None
    runtime_cache_reconciliation_sha256: str | None = None
    control_plane_succession: ControlPlaneSuccessionBinding | None = None
    worker_rollback_continuation: WorkerRollbackContinuationBinding | None = None

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
        if self.retirement_sentinel_closure is not None:
            value["retirementSentinelClosure"] = self.retirement_sentinel_closure.binding()
        if self.control_plane_succession is not None:
            value["controlPlaneSuccession"] = self.control_plane_succession.binding()
        return value


class Host:
    """Small host surface; tests replace this object without changing the CLI."""

    def run(self, command: list[str], *, timeout: float = 40,
            pass_fds: tuple[int, ...] = (),
            env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
        options: dict[str, Any] = {
            "text": True, "capture_output": True, "timeout": timeout, "check": False,
        }
        if pass_fds:
            options["pass_fds"] = pass_fds
        if env is not None:
            options["env"] = env
        return subprocess.run(command, **options)

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

    def process_references(self, roots: list[Path]) -> list[dict[str, Any]]:
        expected = [root.resolve(strict=True) for root in roots]
        references: list[dict[str, Any]] = []
        for proc in Path("/proc").iterdir():
            if not proc.name.isdigit():
                continue
            links: list[tuple[str, Path]] = [("cwd", proc / "cwd")]
            try:
                links.extend((f"fd:{fd.name}", fd) for fd in (proc / "fd").iterdir())
            except (FileNotFoundError, PermissionError, OSError):
                pass
            for label, link in links:
                try:
                    target = link.resolve(strict=True)
                except (FileNotFoundError, PermissionError, OSError):
                    continue
                if any(target == root or root in target.parents for root in expected):
                    references.append({"pid": int(proc.name), "kind": label,
                                       "path": str(target)})
            try:
                maps = (proc / "maps").read_text(errors="replace").splitlines()
            except (FileNotFoundError, PermissionError, OSError):
                maps = []
            for line in maps:
                fields = line.split(None, 5)
                if len(fields) != 6 or not fields[5].startswith("/"):
                    continue
                mapped = fields[5].removesuffix(" (deleted)")
                try:
                    target = Path(mapped).resolve(strict=True)
                except (FileNotFoundError, PermissionError, OSError):
                    continue
                if any(target == root or root in target.parents for root in expected):
                    references.append({"pid": int(proc.name), "kind": "maps",
                                       "path": str(target)})
        return references

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

    def process_identity_absent(self, pid: int, start_ticks: int) -> bool:
        try:
            text = Path(f"/proc/{pid}/stat").read_text()
        except FileNotFoundError:
            return True
        except OSError:
            deny(f"process_absence:{pid}")
        try:
            observed = int(text[text.rfind(")") + 2:].split()[19])
        except (ValueError, IndexError):
            deny(f"process_absence:{pid}")
        return observed != start_ticks


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

    def _enforce_durable_persistence(self, manifest: dict[str, Any], phase: str) -> dict[str, Any] | None:
        binding = manifest.get("durablePersistence")
        if binding is None:
            # Schemas 1-3 are immutable historical authorities.  Only schema 4
            # declares the recurring persistence surface and is enforceable.
            if manifest.get("schemaVersion") == 4:
                deny("durable_persistence_binding")
            return None
        helper_path = Path(__file__).resolve().with_name("durable_persistence_enforcement.py")
        spec = importlib.util.spec_from_file_location("durable_persistence_enforcement", helper_path)
        if spec is None or spec.loader is None:
            deny("durable_persistence_helper")
        helper = importlib.util.module_from_spec(spec); spec.loader.exec_module(helper)
        return helper.enforce(binding, phase, deny, base=helper_path.parent)

    def _payload_components(self) -> tuple[str, ...]:
        return THREE_COMPONENTS if "worker" in self.inputs.components else COMPONENTS

    def _runtime_names(self) -> tuple[str, ...]:
        return tuple(RUNTIME_DIR[component] for component in self._payload_components())

    @staticmethod
    def _stable_identity(info: os.stat_result) -> tuple[int, ...]:
        return (info.st_dev, info.st_ino, info.st_uid, info.st_gid, info.st_mode,
                info.st_size, info.st_mtime_ns, info.st_ctime_ns)

    @staticmethod
    def _succession_file_binding(value: Any, label: str) -> tuple[Path, str]:
        if not isinstance(value, dict) or set(value) != {"path", "sha256"}:
            deny(f"control_plane_succession:{label}")
        path = Path(str(value.get("path", "")))
        expected = str(value.get("sha256", ""))
        if not path.is_absolute() or not SHA256.fullmatch(expected):
            deny(f"control_plane_succession:{label}")
        raw, _ = stable_regular_bytes(path, required_mode=0o600)
        if hashlib.sha256(raw).hexdigest() != expected:
            deny(f"control_plane_succession:{label}:sha256")
        return path, expected

    @staticmethod
    def _contains_scalar(value: Any, expected: str) -> bool:
        if value == expected:
            return True
        if isinstance(value, dict):
            return any(Driver._contains_scalar(child, expected) for child in value.values())
        if isinstance(value, list):
            return any(Driver._contains_scalar(child, expected) for child in value)
        return False

    def _authenticated_control_plane_succession(
        self, runtime_manifest: dict[str, Any]
    ) -> dict[str, Any]:
        binding = self.inputs.control_plane_succession
        if binding is None:
            deny("control_plane_succession_binding")
        if not binding.manifest.is_absolute() or not SHA256.fullmatch(binding.manifest_sha256):
            deny("control_plane_succession_binding")
        raw, _ = stable_regular_bytes(binding.manifest, required_mode=0o600)
        if hashlib.sha256(raw).hexdigest() != binding.manifest_sha256:
            deny("control_plane_succession_sha256")
        value = json_object(raw, binding.manifest.name)
        required = {
            "schemaVersion", "kind", "originalControlPlane", "successorControlPlane",
            "releaseId", "targetCommit", "packageSha256", "authorities",
            "originalRequests", "successorBindings", "scripts",
        }
        if (set(value) != required or value.get("schemaVersion") != 1 or
                value.get("kind") != "WORKER_PM2_CONTROL_PLANE_SUCCESSION"):
            deny("control_plane_succession_schema")
        origin = WORKER_PM2_SUCCESSION_ORIGIN
        original = value.get("originalControlPlane")
        if (original != origin["controlPlane"] or
                self.inputs.release != origin["releaseId"] or
                self.inputs.target != origin["targetCommit"] or
                value.get("successorControlPlane") != self.inputs.control_plane or
                value.get("releaseId") != self.inputs.release or
                value.get("targetCommit") != self.inputs.target or
                not SHA256.fullmatch(str(value.get("packageSha256", "")))):
            deny("control_plane_succession_identity")
        authorities = value.get("authorities")
        if not isinstance(authorities, dict) or set(authorities) != {
                "exportReceipt", "transferReceipt", "installationReceipt"}:
            deny("control_plane_succession_authorities")
        for name, authority in authorities.items():
            path, _ = self._succession_file_binding(authority, name)
            receipt = read_json(path)
            if (not self._contains_scalar(receipt, self.inputs.release) or
                    not self._contains_scalar(receipt, value["packageSha256"])):
                deny(f"control_plane_succession:{name}:release_package")
        originals = value.get("originalRequests")
        if not isinstance(originals, dict) or set(originals) != {"candidate", "rollback"}:
            deny("control_plane_succession_original_requests")
        for role, request in originals.items():
            _, authenticated_sha256 = self._succession_file_binding(
                request, f"original_request:{role}")
            if authenticated_sha256 != origin["requests"][role]:
                deny(f"control_plane_succession_original_request:{role}")
        successor = value.get("successorBindings")
        worker_pm2 = runtime_manifest.get("workerPm2")
        if (not isinstance(successor, dict) or set(successor) != {"candidate", "rollback"} or
                not isinstance(worker_pm2, dict)):
            deny("control_plane_succession_bindings")
        key_map = {"request": "request", "sourceArtifact": "sourceArtifact", "definition": "definition"}
        for role in ("candidate", "rollback"):
            declared = successor.get(role)
            actual = worker_pm2.get(role)
            if not isinstance(declared, dict) or set(declared) != set(key_map) or not isinstance(actual, dict):
                deny(f"control_plane_succession_binding:{role}")
            for declared_key, runtime_key in key_map.items():
                path, expected = self._succession_file_binding(
                    declared[declared_key], f"successor:{role}:{declared_key}")
                if path != Path(str(actual.get(runtime_key, ""))) or (
                        declared_key == "sourceArtifact" and expected != actual.get("sourceSha256")):
                    deny(f"control_plane_succession_binding:{role}:{declared_key}")
        scripts = value.get("scripts")
        script_paths = {
            "deploy": self.repo / "scripts/converta-deploy.py",
            "materializer": self.repo / "scripts/pm2-binding-materialize.py",
            "control": self.repo / "scripts/pm2-definition-control.py",
            "allowlist": self.repo / "scripts/pm2-definition-env-allowlist.v1.json",
        }
        if not isinstance(scripts, dict) or set(scripts) != set(script_paths):
            deny("control_plane_succession_scripts")
        rollback_continuation = (self._worker_rollback_continuation_manifest(self._journal_read())
                                 if self.inputs.worker_rollback_continuation is not None else None)
        for name, path in script_paths.items():
            if name == "deploy" and rollback_continuation is not None:
                # The authenticated rollback continuation names the historical
                # driver independently of the currently executing driver.
                expected = rollback_continuation["originalDriverSha256"]
            elif name == "deploy" and self.inputs.runtime_cache_reconciliation is not None:
                self._runtime_cache_manifest()
                # A finalize cache continuation can use a newer authenticated
                # driver. The worker succession manifest still seals the driver
                # from its *own* successor control plane, not the new checkout.
                # _control_head() independently authenticates the executing
                # checkout against the cache reconciliation's successor HEAD.
                historic = self.host.run([
                    "git", "-C", str(self.repo), "show",
                    f"{value['successorControlPlane']}:scripts/converta-deploy.py",
                ])
                if historic.returncode:
                    deny("control_plane_succession_script:deploy:historical_blob")
                expected = hashlib.sha256(historic.stdout.encode()).hexdigest()
            else:
                expected = digest(path)
            if scripts.get(name) != expected:
                deny(f"control_plane_succession_script:{name}")
        return value

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
        worker_selected = "worker" in self.inputs.components
        if worker_selected:
            expected_keys.add("workerPm2")
        successor = self.inputs.control_plane_succession is not None
        if successor:
            expected_keys.add("controlPlaneSuccessionSha256")
        durable = "durablePersistence" in value
        if durable:
            expected_keys.add("durablePersistence")
        temporal = "durablePersistenceAdmission" in value
        if temporal:
            expected_keys.add("durablePersistenceAdmission")
            if not durable:
                deny("runtime_manifest_temporal_authority")
        predecessor = "predecessorReleases" in value
        if predecessor:
            expected_keys.add("predecessorReleases")
            if not durable or "api" not in self.inputs.components:
                deny("runtime_manifest_predecessor_scope")
        base_schema = (5 if temporal else 4 if durable else
                       (3 if successor else (2 if worker_selected else 1)))
        expected_schema = base_schema + (1 if predecessor else 0)
        if set(value) != expected_keys or value.get("schemaVersion") != expected_schema:
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
        payload_components = self._payload_components()
        def validate_release_roles(roles: Any, label: str) -> None:
            if not isinstance(roles, dict) or set(roles) != set(payload_components):
                deny(f"runtime_manifest_{label}s")
            for component in payload_components:
                identity = roles.get(component)
                common = {"releaseId", "manifestSha256", "indexSha256", "entrySha256"}
                expected = common | ({"buildId"} if component == "frontend" else set())
                legacy_expected = common | {"authorityKind", "manifestName", "indexName"}
                allowed_expected = ({frozenset(expected), frozenset(legacy_expected)}
                                    if successor and component == "worker" else {frozenset(expected)})
                if (not isinstance(identity, dict) or frozenset(identity) not in allowed_expected or
                        not isinstance(identity.get("releaseId"), str) or
                        not identity["releaseId"] or
                        not all(SHA256.fullmatch(str(identity.get(key, "")))
                                for key in ("manifestSha256", "indexSha256", "entrySha256")) or
                        (component == "frontend" and
                         (not isinstance(identity.get("buildId"), str) or not identity["buildId"]))):
                    deny(f"runtime_manifest_{label}:{component}")
                if (successor and component == "worker" and set(identity) == legacy_expected and (
                        identity.get("authorityKind") != "legacy-enumerated-release" or
                        identity.get("manifestName") != "release-manifest.json" or
                        identity.get("indexName") != "release-index.json")):
                    deny(f"runtime_manifest_{label}:worker:legacy_authority")

        validate_release_roles(value.get("rollbackReleases"), "rollback")
        if predecessor:
            validate_release_roles(value.get("predecessorReleases"), "predecessor")
        if worker_selected:
            self._validate_worker_pm2_binding(value.get("workerPm2"))
        if successor:
            if value.get("controlPlaneSuccessionSha256") != self.inputs.control_plane_succession.manifest_sha256:
                deny("runtime_manifest_control_plane_succession")
            self._authenticated_control_plane_succession(value)
        self._failpoint("runtime_manifest_read")
        try:
            current = path.stat()
        except OSError:
            deny("runtime_manifest_changed")
        if self._stable_identity(current) != self._stable_identity(info):
            deny("runtime_manifest_changed")
        return value

    @staticmethod
    def _predecessor_releases(manifest: dict[str, Any]) -> dict[str, Any]:
        """Return the authenticated pre-cutover selections for this manifest version."""
        return manifest.get("predecessorReleases", manifest["rollbackReleases"])

    def _validate_worker_pm2_binding(self, value: Any) -> None:
        if not isinstance(value, dict) or set(value) != {"candidate", "rollback"}:
            deny("runtime_manifest_worker_pm2")
        arguments: list[str] = []
        for role in ("candidate", "rollback"):
            binding = value[role]
            expected = {"request", "sourceArtifact", "sourceSha256", "definition"}
            if not isinstance(binding, dict) or set(binding) != expected:
                deny(f"runtime_manifest_worker_pm2:{role}")
            for key in ("request", "sourceArtifact", "definition"):
                path = Path(str(binding[key]))
                if not path.is_absolute():
                    deny(f"runtime_manifest_worker_pm2:{role}:{key}")
                regular_private(path)
            if not SHA256.fullmatch(str(binding["sourceSha256"])):
                deny(f"runtime_manifest_worker_pm2:{role}:sourceSha256")
            arguments.extend((
                f"--{role}-request", str(binding["request"]),
                f"--{role}-source-artifact", str(binding["sourceArtifact"]),
                f"--{role}-source-sha256", binding["sourceSha256"],
                f"--{role}-definition", str(binding["definition"]),
            ))
        result = self.host.run(
            [sys.executable, str(self.repo / "scripts/pm2-definition-control.py"),
             "validate-pair", *arguments], timeout=45)
        if result.returncode:
            deny("runtime_manifest_worker_pm2_pair")
        report = json_object(result.stdout.encode(), "worker-pm2-pair")
        if report.get("result") != "PM2_DEFINITION_PAIR_VALID" or report.get("component") != "worker":
            deny("runtime_manifest_worker_pm2_pair")

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

    def _runtime_cache_manifest(self) -> dict[str, Any]:
        path = self.inputs.runtime_cache_reconciliation
        expected_sha256 = self.inputs.runtime_cache_reconciliation_sha256
        if (path is None or expected_sha256 is None or not path.is_absolute() or
                not SHA256.fullmatch(expected_sha256)):
            deny("runtime_cache_reconciliation_binding")
        raw, info = stable_regular_bytes(path, required_mode=0o600)
        if ((info.st_uid, info.st_gid) != (os.geteuid(), os.getegid()) or
                hashlib.sha256(raw).hexdigest() != expected_sha256):
            deny("runtime_cache_reconciliation_identity")
        value = json_object(raw, path.name)
        kind = value.get("kind")
        if kind == RUNTIME_CACHE_RECONCILIATION_KIND_V2:
            journal_authority = "acceptanceJournal"
        else:
            journal_authority = ("acceptanceJournal" if self.inputs.release ==
                                 RUNTIME_CACHE_ED74_RELEASE else "negativeJournal")
        required = {"schemaVersion", "kind", "releaseId", "targetCommit", "transactionRoot",
                    "indexSha256", "manifestSha256", "retirementIntentSha256",
                    "originalControlPlane", "continuationControlPlane",
                    "continuationDriverSha256", journal_authority, "acceptanceSha256",
                    "lockSha256", "cacheEntries"}
        if kind == RUNTIME_CACHE_RECONCILIATION_KIND_V2:
            required |= {"cachePolicy", "runtimeManifestSha256"}
        if (set(value) != required or value.get("schemaVersion") != 1 or
                kind not in {RUNTIME_CACHE_RECONCILIATION_KIND,
                             RUNTIME_CACHE_RECONCILIATION_KIND_V2}):
            deny("runtime_cache_reconciliation_schema")
        return value

    def _worker_rollback_continuation_manifest(self, journal: dict[str, Any]) -> dict[str, Any]:
        cached = getattr(self, "_worker_rollback_continuation_cache", None)
        if isinstance(cached, dict):
            return cached
        binding = self.inputs.worker_rollback_continuation
        if (binding is None or not binding.manifest.is_absolute() or
                not SHA256.fullmatch(binding.manifest_sha256)):
            deny("worker_rollback_continuation_binding")
        raw, info = stable_regular_bytes(binding.manifest, required_mode=0o600)
        if ((info.st_uid, info.st_gid) != (os.geteuid(), os.getegid()) or
                hashlib.sha256(raw).hexdigest() != binding.manifest_sha256):
            deny("worker_rollback_continuation_identity")
        value = json_object(raw, binding.manifest.name)
        required = {
            "schemaVersion", "kind", "releaseId", "targetCommit", "transactionRoot",
            "originalControlPlane", "continuationControlPlane", "originalDriverSha256",
            "continuationDriverSha256", "negativeJournal", "lockSha256",
            "controlPlaneSuccessionSha256", "candidateDefinition", "runtimeIdentity",
        }
        if (set(value) != required or value.get("schemaVersion") != 1 or
                value.get("kind") != WORKER_ROLLBACK_CONTINUATION_KIND):
            deny("worker_rollback_continuation_schema")
        if (value.get("releaseId") != self.inputs.release or
                value.get("targetCommit") != self.inputs.target or
                self.inputs.components != THREE_COMPONENTS or
                value.get("transactionRoot") != str(self.inputs.transaction_root) or
                value.get("originalControlPlane") != self.inputs.control_plane or
                not SHA40.fullmatch(str(value.get("continuationControlPlane", ""))) or
                not all(SHA256.fullmatch(str(value.get(key, ""))) for key in (
                    "originalDriverSha256", "continuationDriverSha256", "lockSha256",
                    "controlPlaneSuccessionSha256"))):
            deny("worker_rollback_continuation_scope")
        if (self.inputs.control_plane_succession is None or
                value["controlPlaneSuccessionSha256"] !=
                self.inputs.control_plane_succession.manifest_sha256):
            deny("worker_rollback_continuation_succession")
        negative = value.get("negativeJournal")
        if not isinstance(negative, dict) or set(negative) != {"path", "sha256"}:
            deny("worker_rollback_continuation_journal")
        journal_path = Path(str(negative.get("path", "")))
        if (journal_path != self.journal or not SHA256.fullmatch(str(negative.get("sha256", ""))) or
                digest(journal_path) != negative["sha256"] or read_json(journal_path) != journal):
            deny("worker_rollback_continuation_journal")
        transition = journal.get("workerActivationTransition")
        if (journal.get("state") != "FAILED" or journal.get("recoveryAction") != "rollback" or
                journal.get("saveCount") != 0 or not isinstance(transition, dict) or
                journal.get("components") != list(THREE_COMPONENTS) or
                journal.get("activationAttempted") != list(THREE_COMPONENTS) or
                transition.get("state") != "START_CONFIRMED"):
            deny("worker_rollback_continuation_state")
        definition = value.get("candidateDefinition")
        runtime_manifest = read_json(self.inputs.runtime_manifest)
        try:
            expected_definition = runtime_manifest["workerPm2"]["candidate"]["definition"]
        except (KeyError, TypeError):
            deny("worker_rollback_continuation_definition")
        if (not isinstance(definition, dict) or set(definition) != {"path", "sha256"} or
                Path(str(definition.get("path", ""))) != Path(expected_definition) or
                definition.get("sha256") != digest(Path(expected_definition)) or
                transition.get("definitionSha256") != definition.get("sha256")):
            deny("worker_rollback_continuation_definition")
        if journal.get("lockDigest") != value.get("lockSha256"):
            deny("worker_rollback_continuation_lock")
        runtime = value.get("runtimeIdentity")
        required_runtime = {"pid", "startTicks", "pmId", "runtime", "entrypoint",
                            "environmentSha256", "outLog", "errorLog"}
        if not isinstance(runtime, dict) or set(runtime) != required_runtime:
            deny("worker_rollback_continuation_runtime")
        row = self._row(self.host.pm2_rows(self._resolve_pm2()), PROCESS_NAMES["worker"])
        candidate_runtime = (self.release_root / RUNTIME_DIR["worker"]).resolve(strict=True)
        snapshot = self._process_snapshot(row, "worker", candidate_runtime)
        loaded = row.get("pm2_env", {})
        if (snapshot.get("pid") != runtime.get("pid") or
                snapshot.get("startTicks") != runtime.get("startTicks") or
                snapshot.get("environmentSha256") != runtime.get("environmentSha256") or
                str(candidate_runtime) != runtime.get("runtime") or
                snapshot.get("scriptPhysical") != runtime.get("entrypoint") or
                loaded.get("pm_id") != runtime.get("pmId") or
                loaded.get("pm_out_log_path") != runtime.get("outLog") or
                loaded.get("pm_err_log_path") != runtime.get("errorLog") or
                not self._worker_definition_app_matches(
                    row, snapshot, read_json(Path(expected_definition))["apps"][0])):
            deny("worker_rollback_continuation_runtime")
        self._worker_rollback_continuation_cache = value
        return value

    def _control_head(self, continuation_journal: dict[str, Any] | None = None) -> None:
        if (self.inputs.runtime_cache_reconciliation is not None and
                self.inputs.worker_rollback_continuation is not None):
            deny("continuation_binding_conflict")
        result = self.host.run(["git", "-C", str(self.repo), "rev-parse", "HEAD"])
        if result.returncode:
            deny("control_plane_identity")
        observed_head = result.stdout.strip()
        if (self.inputs.runtime_cache_reconciliation is None and
                self.inputs.worker_rollback_continuation is None):
            if observed_head != self.inputs.control_plane:
                deny("control_plane_identity")
        elif self.inputs.worker_rollback_continuation is not None:
            if continuation_journal is None:
                deny("worker_rollback_continuation_command")
            value = self._worker_rollback_continuation_manifest(continuation_journal)
            driver_path = Path(__file__).resolve()
            committed_driver = self.host.run([
                "git", "-C", str(self.repo), "show",
                f"{observed_head}:scripts/converta-deploy.py",
            ])
            original_driver = self.host.run([
                "git", "-C", str(self.repo), "show",
                f"{self.inputs.control_plane}:scripts/converta-deploy.py",
            ])
            committed_sha = (hashlib.sha256(committed_driver.stdout.encode()).hexdigest()
                             if committed_driver.returncode == 0 else None)
            original_sha = (hashlib.sha256(original_driver.stdout.encode()).hexdigest()
                            if original_driver.returncode == 0 else None)
            tracked = self.host.run([
                "git", "-C", str(self.repo), "ls-files", "--error-unmatch", "--",
                "scripts/converta-deploy.py",
            ])
            if (observed_head != value.get("continuationControlPlane") or
                    digest(driver_path) != value.get("continuationDriverSha256") or
                    committed_sha != value.get("continuationDriverSha256") or
                    original_sha != value.get("originalDriverSha256") or
                    tracked.returncode or tracked.stdout.strip() != "scripts/converta-deploy.py"):
                deny("worker_rollback_continuation_control_plane")
        else:
            if continuation_journal is None:
                deny("runtime_cache_continuation_command")
            value = self._runtime_cache_manifest()
            driver_path = Path(__file__).resolve()
            repo_driver = self.repo / "scripts/converta-deploy.py"
            tracked = self.host.run([
                "git", "-C", str(self.repo), "ls-files", "--error-unmatch", "--",
                "scripts/converta-deploy.py",
            ])
            committed_driver = self.host.run([
                "git", "-C", str(self.repo), "show",
                f"{observed_head}:scripts/converta-deploy.py",
            ])
            committed_driver_sha256 = (
                hashlib.sha256(committed_driver.stdout.encode()).hexdigest()
                if committed_driver.returncode == 0 else None
            )
            if (value.get("originalControlPlane") != self.inputs.control_plane or
                    not SHA40.fullmatch(str(value.get("continuationControlPlane", ""))) or
                    value.get("continuationControlPlane") == self.inputs.control_plane or
                    observed_head != value.get("continuationControlPlane") or
                    not SHA256.fullmatch(str(value.get("continuationDriverSha256", ""))) or
                    digest(driver_path) != value.get("continuationDriverSha256") or
                    tracked.returncode or tracked.stdout.strip() != "scripts/converta-deploy.py" or
                    committed_driver_sha256 != value.get("continuationDriverSha256") or
                    not repo_driver.is_file() or repo_driver.is_symlink() or
                    digest(repo_driver) != value.get("continuationDriverSha256") or
                    continuation_journal.get("binding", {}).get("controlPlane") !=
                    self.inputs.control_plane):
                deny("runtime_cache_continuation_control_plane")
        status = self.host.run(["git", "-C", str(self.repo), "status", "--porcelain", "--untracked-files=no"])
        if status.returncode or status.stdout.strip():
            deny("control_plane_not_clean")

    def _private_data_reconciliation(self, contract_sha256: str,
                                     journal: dict[str, Any]) -> dict[str, Any]:
        path = self.inputs.private_data_reconciliation
        expected_sha256 = self.inputs.private_data_reconciliation_sha256
        if path is None or expected_sha256 is None or not path.is_absolute() or not SHA256.fullmatch(expected_sha256):
            deny("private_data_reconciliation_binding")
        raw, info = stable_regular_bytes(path, required_mode=0o600)
        if ((info.st_uid, info.st_gid) != (os.geteuid(), os.getegid()) or
                hashlib.sha256(raw).hexdigest() != expected_sha256):
            deny("private_data_reconciliation_identity")
        value = json_object(raw, path.name)
        required = {"schemaVersion", "kind", "releaseId", "targetCommit", "contractSha256",
                    "retirementIntentSha256", "transactionRoot", "overlay", "requiredContinuation"}
        if set(value) != required or value.get("schemaVersion") != 1 or value.get("kind") != PRIVATE_DATA_RECONCILIATION_KIND:
            deny("private_data_reconciliation_schema")
        if (self.inputs.release != LEGACY_0FDEC_RELEASE or self.inputs.target != LEGACY_0FDEC_TARGET or
                self.inputs.transaction_root != LEGACY_0FDEC_TRANSACTION or
                contract_sha256 != LEGACY_0FDEC_CONTRACT_SHA256 or
                self.inputs.retirement is None or
                self.inputs.retirement.intent_sha256 != LEGACY_0FDEC_RETIREMENT_INTENT_SHA256):
            deny("private_data_reconciliation_scope")
        if (value.get("releaseId") != self.inputs.release or
                value.get("targetCommit") != self.inputs.target or
                value.get("contractSha256") != contract_sha256 or
                value.get("retirementIntentSha256") != self.inputs.retirement.intent_sha256 or
                value.get("transactionRoot") != str(self.inputs.transaction_root)):
            deny("private_data_reconciliation_binding")
        continuation = value.get("requiredContinuation")
        if (not isinstance(continuation, dict) or
                set(continuation) != {"state", "recoveryAction", "acceptanceSha256", "saveCount"} or
                continuation.get("state") != "FAILED" or
                continuation.get("recoveryAction") != "finalize" or
                continuation.get("saveCount") != 0 or
                not SHA256.fullmatch(str(continuation.get("acceptanceSha256", ""))) or
                journal.get("state") != continuation["state"] or
                journal.get("recoveryAction") != continuation["recoveryAction"] or
                journal.get("saveCount") != continuation["saveCount"]):
            deny("private_data_reconciliation_state")
        acceptance_raw, acceptance_info = stable_regular_bytes(self.acceptance, required_mode=0o600)
        if ((acceptance_info.st_uid, acceptance_info.st_gid) != (os.geteuid(), os.getegid()) or
                hashlib.sha256(acceptance_raw).hexdigest() != continuation["acceptanceSha256"]):
            deny("private_data_reconciliation_acceptance")
        overlay = value.get("overlay")
        if (not isinstance(overlay, dict) or
                set(overlay) != {"path", "classification", "state", "rootIdentity",
                                "ownerUid", "groupGid", "mode"} or
                overlay.get("path") != PRIVATE_DATA_OVERLAY.as_posix() or
                overlay.get("classification") != PRIVATE_DATA_POLICY or
                overlay.get("state") != "ACTIVE_DEPENDENCY" or
                not isinstance(overlay.get("rootIdentity"), dict) or
                set(overlay["rootIdentity"]) != {"device", "inode"} or
                any(not isinstance(overlay["rootIdentity"].get(key), int)
                    for key in ("device", "inode")) or
                any(not isinstance(overlay.get(key), int)
                    for key in ("ownerUid", "groupGid", "mode")) or
                any(overlay["rootIdentity"][key] < 0 for key in ("device", "inode")) or
                any(overlay[key] < 0 for key in ("ownerUid", "groupGid", "mode")) or
                overlay["mode"] > 0o7777 or overlay["mode"] & 0o022):
            deny("private_data_reconciliation_overlay")
        return value

    def _runtime_cache_reconciliation(self, index_sha256: str, manifest_sha256: str,
                                      observed_extras: dict[str, dict[str, Any]],
                                      journal: dict[str, Any]) -> dict[str, Any]:
        value = self._runtime_cache_manifest()
        if value.get("kind") == RUNTIME_CACHE_RECONCILIATION_KIND_V2:
            return self._runtime_cache_reconciliation_v2(
                value, index_sha256, manifest_sha256, observed_extras, journal)
        profiles = {
            RUNTIME_CACHE_36B_RELEASE: {
                "target": RUNTIME_CACHE_36B_TARGET,
                "transaction": RUNTIME_CACHE_36B_TRANSACTION,
                "indexSha256": RUNTIME_CACHE_36B_INDEX_SHA256,
                "manifestSha256": RUNTIME_CACHE_36B_MANIFEST_SHA256,
                "intentSha256": RUNTIME_CACHE_36B_INTENT_SHA256,
                "negativeJournalSha256": RUNTIME_CACHE_36B_NEGATIVE_JOURNAL_SHA256,
                "acceptanceSha256": RUNTIME_CACHE_36B_ACCEPTANCE_SHA256,
                "lockSha256": RUNTIME_CACHE_36B_LOCK_SHA256,
                "extras": RUNTIME_CACHE_36B_EXTRAS,
            },
            RUNTIME_CACHE_FA10_RELEASE: {
                "target": RUNTIME_CACHE_FA10_TARGET,
                "transaction": RUNTIME_CACHE_FA10_TRANSACTION,
                "indexSha256": RUNTIME_CACHE_FA10_INDEX_SHA256,
                "manifestSha256": RUNTIME_CACHE_FA10_MANIFEST_SHA256,
                "intentSha256": RUNTIME_CACHE_FA10_INTENT_SHA256,
                "negativeJournalSha256": RUNTIME_CACHE_FA10_NEGATIVE_JOURNAL_SHA256,
                "acceptanceSha256": RUNTIME_CACHE_FA10_ACCEPTANCE_SHA256,
                "lockSha256": RUNTIME_CACHE_FA10_LOCK_SHA256,
                "extras": None,
                "volatileCachePolicy": "FA10_NEXT_IMAGE_CACHE_V1",
                "allowedImageExtensions": {"webp"},
                "journalAuthority": "negative",
            },
            RUNTIME_CACHE_ED74_RELEASE: {
                "target": RUNTIME_CACHE_ED74_TARGET,
                "transaction": RUNTIME_CACHE_ED74_TRANSACTION,
                "indexSha256": RUNTIME_CACHE_ED74_INDEX_SHA256,
                "manifestSha256": RUNTIME_CACHE_ED74_MANIFEST_SHA256,
                "intentSha256": RUNTIME_CACHE_ED74_INTENT_SHA256,
                "acceptanceJournalSha256": RUNTIME_CACHE_ED74_ACCEPTANCE_JOURNAL_SHA256,
                "acceptanceSha256": RUNTIME_CACHE_ED74_ACCEPTANCE_SHA256,
                "lockSha256": RUNTIME_CACHE_ED74_LOCK_SHA256,
                "extras": None,
                "volatileCachePolicy": "ED74_NEXT_IMAGE_CACHE_V1",
                "allowedImageExtensions": {"webp", "png", "jpeg"},
                "journalAuthority": "acceptance",
            },
            RUNTIME_CACHE_41D_RELEASE: {
                "target": RUNTIME_CACHE_41D_TARGET,
                "transaction": RUNTIME_CACHE_41D_TRANSACTION,
                "indexSha256": RUNTIME_CACHE_41D_INDEX_SHA256,
                "manifestSha256": RUNTIME_CACHE_41D_MANIFEST_SHA256,
                "intentSha256": RUNTIME_CACHE_41D_INTENT_SHA256,
                "negativeJournalSha256": RUNTIME_CACHE_41D_NEGATIVE_JOURNAL_SHA256,
                "acceptanceSha256": RUNTIME_CACHE_41D_ACCEPTANCE_SHA256,
                "lockSha256": RUNTIME_CACHE_41D_LOCK_SHA256,
                "extras": None,
                "volatileCachePolicy": "META_DBFIRST_41D_NEXT_IMAGE_CACHE_V1",
                "allowedImageExtensions": {"webp", "png", "jpeg"},
                "journalAuthority": "negative",
            },
        }
        profile = profiles.get(self.inputs.release)
        if (profile is None or self.inputs.target != profile["target"] or
                self.inputs.transaction_root != profile["transaction"] or
                index_sha256 != profile["indexSha256"] or
                manifest_sha256 != profile["manifestSha256"] or
                self.inputs.retirement is None or
                self.inputs.retirement.intent_sha256 != profile["intentSha256"]):
            deny("runtime_cache_reconciliation_scope")
        expected_binding = {
            "releaseId": self.inputs.release, "targetCommit": self.inputs.target,
            "transactionRoot": str(self.inputs.transaction_root), "indexSha256": index_sha256,
            "manifestSha256": manifest_sha256,
            "retirementIntentSha256": self.inputs.retirement.intent_sha256,
            "acceptanceSha256": profile["acceptanceSha256"],
            "lockSha256": profile["lockSha256"],
            "originalControlPlane": self.inputs.control_plane,
        }
        if any(value.get(key) != item for key, item in expected_binding.items()):
            deny("runtime_cache_reconciliation_binding")
        if (not SHA40.fullmatch(str(value.get("continuationControlPlane", ""))) or
                not SHA256.fullmatch(str(value.get("continuationDriverSha256", "")))):
            deny("runtime_cache_reconciliation_binding")

        if profile.get("journalAuthority") == "acceptance":
            authority = value.get("acceptanceJournal")
            if (not isinstance(authority, dict) or
                    set(authority) != {"path", "sha256"} or
                    authority.get("sha256") != profile["acceptanceJournalSha256"] or
                    not isinstance(authority.get("path"), str) or
                    not Path(authority["path"]).is_absolute()):
                deny("runtime_cache_reconciliation_acceptance_journal")
            authority_raw, authority_info = stable_regular_bytes(
                Path(authority["path"]), required_mode=0o600)
            if ((authority_info.st_uid, authority_info.st_gid) !=
                    (os.geteuid(), os.getegid()) or
                    hashlib.sha256(authority_raw).hexdigest() != authority["sha256"]):
                deny("runtime_cache_reconciliation_acceptance_journal")
            authority_journal = json_object(authority_raw, Path(authority["path"]).name)
            if (authority_journal.get("state") != "AWAITING_ACCEPTANCE" or
                    authority_journal.get("saveCount") != 0 or
                    authority_journal.get("recoveryAction") is not None or
                    authority_journal.get("binding") != journal.get("binding") or
                    authority_journal.get("lockDigest") != value["lockSha256"]):
                deny("runtime_cache_reconciliation_acceptance_state")
            if (journal.get("state") not in {"AWAITING_ACCEPTANCE", "FAILED", "FINALIZING"} or
                    (journal.get("state") == "FAILED" and
                     journal.get("recoveryAction") != "finalize") or
                    journal.get("saveCount") not in {0, 1} or
                    journal.get("binding") != authority_journal.get("binding") or
                    journal.get("lockDigest") != value["lockSha256"]):
                deny("runtime_cache_reconciliation_state")
        else:
            negative = value.get("negativeJournal")
            if (not isinstance(negative, dict) or
                    set(negative) != {"path", "sha256"} or
                    negative.get("sha256") != profile["negativeJournalSha256"] or
                    not isinstance(negative.get("path"), str) or
                    not Path(negative["path"]).is_absolute()):
                deny("runtime_cache_reconciliation_negative_journal")
            negative_raw, negative_info = stable_regular_bytes(
                Path(negative["path"]), required_mode=0o600)
            if ((negative_info.st_uid, negative_info.st_gid) !=
                    (os.geteuid(), os.getegid()) or
                    hashlib.sha256(negative_raw).hexdigest() != negative["sha256"]):
                deny("runtime_cache_reconciliation_negative_journal")
            authority_journal = json_object(negative_raw, Path(negative["path"]).name)
            if (authority_journal.get("state") != "FAILED" or
                    authority_journal.get("recoveryAction") != "finalize" or
                    authority_journal.get("saveCount") != 0 or
                    authority_journal.get("binding") != journal.get("binding") or
                    authority_journal.get("lockDigest") != value["lockSha256"]):
                deny("runtime_cache_reconciliation_negative_state")
            if (journal.get("state") not in {"FAILED", "FINALIZING"} or
                    (journal.get("state") == "FAILED" and
                     journal.get("recoveryAction") != "finalize") or
                    journal.get("saveCount") not in {0, 1} or
                    journal.get("binding") != authority_journal.get("binding") or
                    journal.get("lockDigest") != value["lockSha256"]):
                deny("runtime_cache_reconciliation_state")
        acceptance_raw, acceptance_info = stable_regular_bytes(self.acceptance, required_mode=0o600)
        if ((acceptance_info.st_uid, acceptance_info.st_gid) != (os.geteuid(), os.getegid()) or
                hashlib.sha256(acceptance_raw).hexdigest() != value["acceptanceSha256"]):
            deny("runtime_cache_reconciliation_acceptance")
        lock_raw, lock_info = stable_regular_bytes(self.lock, required_mode=0o600)
        if ((lock_info.st_uid, lock_info.st_gid) != (os.geteuid(), os.getegid()) or
                hashlib.sha256(lock_raw).hexdigest() != value["lockSha256"]):
            deny("runtime_cache_reconciliation_lock")

        entries = value.get("cacheEntries")
        if (not isinstance(entries, list) or not entries or
                any(not isinstance(item, dict) or not isinstance(item.get("path"), str)
                    for item in entries)):
            deny("runtime_cache_reconciliation_entries")
        declared = {item["path"]: item for item in entries}
        if len(declared) != len(entries):
            deny("runtime_cache_reconciliation_entries")
        expected_extras = profile["extras"]
        if profile.get("volatileCachePolicy") in {
                "FA10_NEXT_IMAGE_CACHE_V1", "ED74_NEXT_IMAGE_CACHE_V1",
                "META_DBFIRST_41D_NEXT_IMAGE_CACHE_V1"}:
            bases = {
                "frontend-runtime/.next/cache",
                "frontend-runtime/.next/cache/images",
            }
            if (not bases.issubset(declared) or len(declared) > 256 or
                    any(declared[path].get("type") != "directory" or
                        declared[path].get("mode") != 0o755 for path in bases)):
                deny("runtime_cache_reconciliation_entries")
            for path, item in declared.items():
                parts = PurePosixPath(path).parts
                if path in bases:
                    continue
                if (len(parts) == 5 and parts[:4] ==
                        ("frontend-runtime", ".next", "cache", "images")):
                    if (item.get("type") != "directory" or item.get("mode") != 0o755 or
                            not re.fullmatch(r"[A-Za-z0-9_-]{20,96}", parts[4])):
                        deny("runtime_cache_reconciliation_entries")
                    continue
                if (len(parts) == 6 and parts[:4] ==
                        ("frontend-runtime", ".next", "cache", "images")):
                    parent = "/".join(parts[:5])
                    allowed = "|".join(sorted(profile["allowedImageExtensions"]))
                    if (parent not in declared or declared[parent].get("type") != "directory" or
                            item.get("type") != "file" or item.get("mode") != 0o644 or
                            not re.fullmatch(
                                rf"[A-Za-z0-9._-]{{20,240}}\.(?:{allowed})", parts[5]) or
                            not isinstance(item.get("size"), int) or
                            not 0 <= item["size"] <= 10 * 1024 * 1024 or
                            not SHA256.fullmatch(str(item.get("sha256", "")))):
                        deny("runtime_cache_reconciliation_entries")
                    continue
                deny("runtime_cache_reconciliation_entries")
        elif set(declared) != set(expected_extras):
            deny("runtime_cache_reconciliation_entries")
        for item in entries:
            kind = item.get("type")
            allowed = {"path", "type", "mode"}
            if kind == "file": allowed |= {"size", "sha256"}
            elif kind != "directory": deny("runtime_cache_reconciliation_entry_type")
            if (set(item) != allowed or item.get("mode") not in {0o644, 0o755} or
                    (kind == "directory" and item["mode"] != 0o755) or
                    (kind == "file" and (item["mode"] != 0o644 or
                     not isinstance(item.get("size"), int) or item["size"] < 0 or
                     not SHA256.fullmatch(str(item.get("sha256", "")))))):
                deny("runtime_cache_reconciliation_entry")
        sealed = (declared if expected_extras is None else
                  {path: {"path": path, **metadata}
                   for path, metadata in expected_extras.items()})
        if declared != sealed:
            deny("runtime_cache_reconciliation_sealed_entries")
        if observed_extras != declared:
            deny("runtime_cache_reconciliation_inventory")
        return value

    def _runtime_cache_reconciliation_v2(
            self, value: dict[str, Any], index_sha256: str, manifest_sha256: str,
            observed_extras: dict[str, dict[str, Any]], journal: dict[str, Any]
    ) -> dict[str, Any]:
        """Validate the reusable, closed Next.js image-cache contract.

        Unlike the historical V1 profiles, V2 derives release identities from
        the authenticated deployment journal.  Its policy remains closed to the
        API+frontend profile and the Next image-cache subtree.
        """
        if (self.inputs.components != COMPONENTS or
                value.get("cachePolicy") != RUNTIME_CACHE_POLICY_V2 or
                self.inputs.retirement is None):
            deny("runtime_cache_reconciliation_scope")
        expected = {
            "releaseId": self.inputs.release,
            "targetCommit": self.inputs.target,
            "transactionRoot": str(self.inputs.transaction_root),
            "indexSha256": index_sha256,
            "manifestSha256": manifest_sha256,
            "runtimeManifestSha256": self.inputs.runtime_manifest_sha256,
            "retirementIntentSha256": self.inputs.retirement.intent_sha256,
            "acceptanceSha256": digest(self.acceptance),
            "lockSha256": digest(self.lock),
            "originalControlPlane": self.inputs.control_plane,
        }
        if (any(value.get(key) != expected_value
                for key, expected_value in expected.items()) or
                not SHA40.fullmatch(str(value.get("continuationControlPlane", ""))) or
                not SHA256.fullmatch(str(value.get("continuationDriverSha256", "")))):
            deny("runtime_cache_reconciliation_binding")
        authority = value.get("acceptanceJournal")
        if (not isinstance(authority, dict) or
                set(authority) != {"path", "sha256"} or
                not isinstance(authority.get("path"), str) or
                not Path(authority["path"]).is_absolute() or
                not SHA256.fullmatch(str(authority.get("sha256", "")))):
            deny("runtime_cache_reconciliation_acceptance_journal")
        authority_raw, authority_info = stable_regular_bytes(
            Path(authority["path"]), required_mode=0o600)
        if ((authority_info.st_uid, authority_info.st_gid) !=
                (os.geteuid(), os.getegid()) or
                hashlib.sha256(authority_raw).hexdigest() != authority["sha256"]):
            deny("runtime_cache_reconciliation_acceptance_journal")
        acceptance_journal = json_object(authority_raw, Path(authority["path"]).name)
        if (acceptance_journal.get("state") != "AWAITING_ACCEPTANCE" or
                acceptance_journal.get("saveCount") != 0 or
                acceptance_journal.get("deployedMarkerCreated") is not False or
                acceptance_journal.get("recoveryAction") is not None or
                acceptance_journal.get("binding") != journal.get("binding") or
                acceptance_journal.get("lockDigest") != value["lockSha256"] or
                journal.get("state") not in {"AWAITING_ACCEPTANCE", "FINALIZING", "FAILED"} or
                (journal.get("state") == "FAILED" and
                 journal.get("recoveryAction") != "finalize") or
                journal.get("saveCount") not in {0, 1} or
                journal.get("binding") != acceptance_journal.get("binding") or
                journal.get("lockDigest") != value["lockSha256"]):
            deny("runtime_cache_reconciliation_state")
        acceptance_raw, acceptance_info = stable_regular_bytes(
            self.acceptance, required_mode=0o600)
        if ((acceptance_info.st_uid, acceptance_info.st_gid) !=
                (os.geteuid(), os.getegid()) or
                hashlib.sha256(acceptance_raw).hexdigest() != value["acceptanceSha256"]):
            deny("runtime_cache_reconciliation_acceptance")
        lock_raw, lock_info = stable_regular_bytes(self.lock, required_mode=0o600)
        if ((lock_info.st_uid, lock_info.st_gid) != (os.geteuid(), os.getegid()) or
                hashlib.sha256(lock_raw).hexdigest() != value["lockSha256"]):
            deny("runtime_cache_reconciliation_lock")
        for item in value.get("cacheEntries", []):
            path = self.release_root / str(item.get("path", ""))
            try:
                info = path.lstat()
            except OSError:
                deny("runtime_cache_reconciliation_entry")
            if (stat.S_ISLNK(info.st_mode) or
                    (item.get("type") == "file" and info.st_nlink != 1)):
                deny("runtime_cache_reconciliation_entry")
        self._validate_next_image_cache_entries(value.get("cacheEntries"), observed_extras)
        return value

    @staticmethod
    def _validate_next_image_cache_entries(
            entries: Any, observed_extras: dict[str, dict[str, Any]]) -> None:
        if (not isinstance(entries, list) or not entries or
                any(not isinstance(item, dict) or not isinstance(item.get("path"), str)
                    for item in entries)):
            deny("runtime_cache_reconciliation_entries")
        declared = {item["path"]: item for item in entries}
        bases = {"frontend-runtime/.next/cache",
                 "frontend-runtime/.next/cache/images"}
        if (len(declared) != len(entries) or not bases.issubset(declared) or
                len(declared) > 256 or
                any(declared[path] != {"path": path, "type": "directory", "mode": 0o755}
                    for path in bases)):
            deny("runtime_cache_reconciliation_entries")
        for path, item in declared.items():
            parts = PurePosixPath(path).parts
            if path in bases:
                continue
            if (len(parts) == 5 and parts[:4] ==
                    ("frontend-runtime", ".next", "cache", "images")):
                if (item != {"path": path, "type": "directory", "mode": 0o755} or
                        not re.fullmatch(r"[A-Za-z0-9_-]{20,96}", parts[4])):
                    deny("runtime_cache_reconciliation_entries")
                continue
            if (len(parts) == 6 and parts[:4] ==
                    ("frontend-runtime", ".next", "cache", "images")):
                parent = "/".join(parts[:5])
                if (parent not in declared or
                        declared[parent].get("type") != "directory" or
                        set(item) != {"path", "type", "mode", "size", "sha256"} or
                        item.get("type") != "file" or item.get("mode") != 0o644 or
                        not re.fullmatch(
                            r"[A-Za-z0-9._-]{20,240}\.(?:webp|png|jpeg)", parts[5]) or
                        not isinstance(item.get("size"), int) or
                        not 0 <= item["size"] <= 10 * 1024 * 1024 or
                        not SHA256.fullmatch(str(item.get("sha256", "")))):
                    deny("runtime_cache_reconciliation_entries")
                continue
            deny("runtime_cache_reconciliation_entries")
        if observed_extras != declared:
            deny("runtime_cache_reconciliation_inventory")

    def _private_data_contract(self, continuation_journal: dict[str, Any] | None = None
                               ) -> tuple[dict[str, Any], dict[str, Any] | None]:
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
        if (not required.issubset(contract) or not set(contract).issubset(
                required | {"privateDataOverlay", "durablePersistence"}) or
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
        reconciliation = None
        if declared is None:
            if continuation_journal is None:
                deny("private_data_contract_overlay_missing")
            reconciliation = self._private_data_reconciliation(contract_sha256, continuation_journal)
        elif declared != expected:
            deny("private_data_contract_overlay")
        elif self.inputs.private_data_reconciliation is not None:
            deny("private_data_reconciliation_unnecessary")
        return contract, reconciliation

    def _private_data_overlay(self, continuation_journal: dict[str, Any] | None = None) -> dict[str, Any]:
        _, reconciliation = self._private_data_contract(continuation_journal)
        overlay = self.release_root / PRIVATE_DATA_OVERLAY
        if not overlay.exists() and not overlay.is_symlink():
            if reconciliation is not None:
                deny("private_data_reconciliation_overlay_missing")
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
        evidence = {"present": True, "path": PRIVATE_DATA_OVERLAY.as_posix(),
                "classification": PRIVATE_DATA_POLICY, "state": "ACTIVE_DEPENDENCY",
                "rootIdentity": {"device": after.st_dev, "inode": after.st_ino},
                "ownerUid": after.st_uid, "groupGid": after.st_gid,
                "mode": stat.S_IMODE(after.st_mode), "observedEntries": entries}
        if reconciliation is not None:
            expected_overlay = reconciliation["overlay"]
            stable = ("path", "classification", "state", "rootIdentity", "ownerUid", "groupGid", "mode")
            if any(evidence.get(key) != expected_overlay.get(key) for key in stable):
                deny("private_data_reconciliation_overlay_drift")
        return evidence

    def _release_index(self, index_path: Path, raw: bytes,
                       continuation_journal: dict[str, Any] | None = None) -> dict[str, Any]:
        index = json_object(raw, index_path.name)
        runtime_names = self._runtime_names()
        if index.get("schemaVersion") != 1 or index.get("scope") != list(runtime_names):
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
            if relative.parts[0] not in runtime_names or entry["path"] in expected:
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

        overlay = self._private_data_overlay(continuation_journal)
        observed: dict[str, dict[str, Any]] = {}
        observed_identity: dict[str, tuple[int, ...]] = {}
        for runtime_name in runtime_names:
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
        missing = set(expected) - set(observed)
        extras = set(observed) - set(expected)
        if missing:
            deny("release_index_inventory")
        for relative, item in expected.items():
            if observed[relative] != item:
                deny(f"release_index_mismatch:{relative}")
        runtime_cache = None
        if extras:
            if continuation_journal is None:
                deny("release_index_inventory")
            manifest_raw, _ = stable_regular_bytes(self.release_root / "manifest.json")
            runtime_cache = self._runtime_cache_reconciliation(
                hashlib.sha256(raw).hexdigest(), hashlib.sha256(manifest_raw).hexdigest(),
                {relative: observed[relative] for relative in extras}, continuation_journal)
        elif self.inputs.runtime_cache_reconciliation is not None:
            deny("runtime_cache_reconciliation_unnecessary")
        overlay_after = self._private_data_overlay(continuation_journal)
        stable = ("present", "path", "classification", "state", "rootIdentity",
                  "ownerUid", "groupGid", "mode")
        if any(overlay_after.get(key) != overlay.get(key) for key in stable):
            deny("private_data_overlay_changed")
        result = {"sha256": hashlib.sha256(raw).hexdigest(), "entries": len(expected),
                  "privateDataOverlay": overlay_after}
        if runtime_cache is not None:
            result["runtimeCacheReconciliationSha256"] = self.inputs.runtime_cache_reconciliation_sha256
            result["runtimeCacheEntries"] = len(extras)
        return result

    def _release(self, continuation_journal: dict[str, Any] | None = None) -> dict[str, Any]:
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
        payload_components = self._payload_components()
        if declared_components is not None and declared_components != list(payload_components):
            deny("release_components")
        expected_index = manifest.get("indexSha256") or find_digest(manifest, index_path.name)
        if not isinstance(expected_index, str) or not SHA256.fullmatch(expected_index):
            deny("release_index_identity_missing")
        if index_sha != expected_index:
            deny("release_index_identity")
        index = self._release_index(index_path, index_raw, continuation_journal)
        for component in payload_components:
            runtime = self.release_root / RUNTIME_DIR[component]
            if not runtime.is_dir():
                deny(f"release_runtime_missing:{component}")
        result = {"manifestSha256": manifest_sha, "indexSha256": index["sha256"],
                  "indexEntries": index["entries"],
                  "privateDataOverlay": index["privateDataOverlay"]}
        if "runtimeCacheReconciliationSha256" in index:
            result["runtimeCacheReconciliationSha256"] = index["runtimeCacheReconciliationSha256"]
            result["runtimeCacheEntries"] = index["runtimeCacheEntries"]
        return result

    def _rollback_release(self, component: str, identity: dict[str, Any]) -> Path:
        root = self.releases / identity["releaseId"]
        runtime = root / RUNTIME_DIR[component]
        legacy_worker = (component == "worker" and
                         identity.get("authorityKind") == "legacy-enumerated-release")
        manifest_path = root / (identity.get("manifestName") if legacy_worker else "manifest.json")
        index_path = root / (identity.get("indexName") if legacy_worker else "index.sha256")
        manifest_raw, _ = stable_regular_bytes(manifest_path)
        index_raw, _ = stable_regular_bytes(index_path)
        if hashlib.sha256(manifest_raw).hexdigest() != identity["manifestSha256"]:
            deny(f"rollback_manifest:{component}")
        if hashlib.sha256(index_raw).hexdigest() != identity["indexSha256"]:
            deny(f"rollback_index:{component}")
        manifest = json_object(manifest_raw, manifest_path.name)
        declared_index = manifest.get("runtimeIndexSha256") if legacy_worker else manifest.get("indexSha256")
        if declared_index != identity["indexSha256"]:
            deny(f"rollback_manifest_index:{component}")
        entry_relative = ("dist/index.js" if component == "api" else
                          "node_modules/next/dist/bin/next" if component == "frontend" else
                          "dist/whatsapp-web-worker/src/index.js")
        entry_raw, _ = stable_regular_bytes(runtime / entry_relative)
        if hashlib.sha256(entry_raw).hexdigest() != identity["entrySha256"]:
            deny(f"rollback_entry:{component}")
        runtime_identity = manifest.get("runtimes", {}).get(component, {})
        if component == "api":
            declared = runtime_identity.get("entrySha256")
            if declared is not None and declared != identity["entrySha256"]:
                deny("rollback_manifest_entry:api")
        elif component == "frontend":
            build_id = (runtime / ".next/BUILD_ID").read_text(encoding="utf-8").strip()
            if (build_id != identity["buildId"] or
                    runtime_identity.get("buildId") != identity["buildId"]):
                deny("rollback_build_id:frontend")
        else:
            declared = (manifest.get("workerEntrypointSha256") if legacy_worker else
                        runtime_identity.get("entrySha256"))
            if declared is not None and declared != identity["entrySha256"]:
                deny("rollback_manifest_entry:worker")
            if legacy_worker and manifest.get("workerEntrypoint") != f"worker-runtime/{entry_relative}":
                deny("rollback_manifest_entry_path:worker")
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
            entry = ("dist/index.js" if component == "api" else
                     "node_modules/next/dist/bin/next" if component == "frontend" else
                     "dist/whatsapp-web-worker/src/index.js")
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

    def _optional_worker_row(self) -> dict[str, Any] | None:
        matches = [row for row in self.host.pm2_rows(self._resolve_pm2())
                   if row.get("name") == PROCESS_NAMES["worker"]]
        if len(matches) > 1:
            deny("worker_process_cardinality")
        return matches[0] if matches else None

    def _worker_pm2_binding(self, role: str) -> dict[str, Any]:
        manifest = self._authenticated_runtime_manifest()
        try:
            binding = manifest["workerPm2"][role]
        except (KeyError, TypeError):
            deny(f"worker_pm2_binding:{role}")
        return binding

    def _worker_definition_projection(self, role: str) -> dict[str, Any]:
        app = self._worker_definition_app(role)
        return {
            "name": app.get("name"), "pmCwdLexical": app.get("cwd"),
            "pmExecPathLexical": app.get("script"), "interpreter": app.get("interpreter"),
            "args": app.get("args"), "nodeArgs": app.get("node_args"),
            "execMode": app.get("exec_mode"), "instancesRaw": app.get("instances"),
            "namespace": app.get("namespace"),
            "logs": {"out": app.get("out_file"), "error": app.get("error_file"),
                     "merge": app.get("merge_logs")},
            "environmentSha256": hashlib.sha256(json.dumps(
                {key: app.get("env", {}).get(key) for key in self._environment_keys("worker")},
                sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest(),
        }

    def _worker_definition_app(self, role: str) -> dict[str, Any]:
        binding = self._worker_pm2_binding(role)
        value = read_json(Path(binding["definition"]))
        try:
            app = value["apps"][0]
        except (KeyError, IndexError, TypeError):
            deny(f"worker_pm2_definition:{role}")
        if not isinstance(app, dict):
            deny(f"worker_pm2_definition:{role}")
        return app

    def _pm2_definition_control(self) -> Any:
        path = self.repo / "scripts/pm2-definition-control.py"
        spec = importlib.util.spec_from_file_location("converta_pm2_definition_control", path)
        if spec is None or spec.loader is None:
            deny("pm2_definition_control_import")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def _worker_definition_matches(self, row: dict[str, Any], snapshot: dict[str, Any],
                                   role: str) -> bool:
        """Keep canonical fields strict; normalize only PM2 6.0.14 runtime log paths."""
        return self._worker_definition_app_matches(
            row, snapshot, self._worker_definition_app(role))

    def _worker_definition_app_matches(self, row: dict[str, Any], snapshot: dict[str, Any],
                                       app: dict[str, Any]) -> bool:
        observed = self._configuration_projection(snapshot)
        expected = {
            "name": app.get("name"), "pmCwdLexical": app.get("cwd"),
            "pmExecPathLexical": app.get("script"), "interpreter": app.get("interpreter"),
            "args": app.get("args"), "nodeArgs": app.get("node_args"),
            "execMode": app.get("exec_mode"), "instancesRaw": app.get("instances"),
            "namespace": app.get("namespace"),
            "environmentSha256": hashlib.sha256(json.dumps(
                {key: app.get("env", {}).get(key) for key in self._environment_keys("worker")},
                sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest(),
        }
        if any(observed.get(key) != value for key, value in expected.items() if key != "logs"):
            return False
        loaded = row.get("pm2_env")
        if not isinstance(loaded, dict):
            return False
        control = self._pm2_definition_control()
        try:
            control.validate_runtime_log_paths(app, loaded)
        except control.Denied:
            return False
        return True

    def _read_state_cutover_definition_matches(self, row: dict[str, Any],
                                               snapshot: dict[str, Any],
                                               binding: dict[str, Any]) -> bool:
        value = read_json(Path(binding["definition"]))
        try:
            app = value["apps"][0]
        except (KeyError, IndexError, TypeError):
            return False
        if not isinstance(app, dict):
            return False
        observed = self._configuration_projection(snapshot)
        expected = {
            "name": app.get("name"), "pmCwdLexical": app.get("cwd"),
            "pmExecPathLexical": app.get("script"), "interpreter": app.get("interpreter"),
            "args": app.get("args"), "nodeArgs": app.get("node_args"),
            "execMode": app.get("exec_mode"), "instancesRaw": app.get("instances"),
            "namespace": app.get("namespace"),
            "environmentSha256": hashlib.sha256(json.dumps(
                {key: app.get("env", {}).get(key) for key in self._environment_keys("api")},
                sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest(),
        }
        if any(observed.get(key) != value for key, value in expected.items()):
            return False
        loaded = row.get("pm2_env")
        if not isinstance(loaded, dict):
            return False
        try:
            self._pm2_definition_control().validate_runtime_log_paths(app, loaded)
        except Exception:
            return False
        return True

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
        expected_binding = self.inputs.binding()
        runtime_raw, _ = stable_regular_bytes(self.inputs.runtime_manifest, required_mode=0o600)
        if hashlib.sha256(runtime_raw).hexdigest() != self.inputs.runtime_manifest_sha256:
            deny("runtime_manifest_sha256_mismatch")
        manifest = json_object(runtime_raw, self.inputs.runtime_manifest.name)
        if "durablePersistence" in manifest:
            expected_binding["durablePersistence"] = manifest["durablePersistence"]
        if journal.get("binding") != expected_binding:
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

    def _require_reconciled_component_rollbacks(
            self, binding: RetirementBinding, manifest: dict[str, Any]) -> None:
        raw, _ = stable_regular_bytes(binding.operational_state, required_mode=0o600)
        value = json_object(raw, binding.operational_state.name)
        immediate = value.get("immediateRollbackReleases")
        payload_components = self._payload_components()
        predecessor = manifest.get("predecessorReleases")
        if predecessor is not None:
            expected_immediate = {
                component: predecessor[component]["releaseId"]
                for component in payload_components
            }
            durable = {
                manifest["rollbackReleases"][component]["releaseId"]
                for component in payload_components
            }
            rollbacks = value.get("rollbackReleases")
            if (immediate != expected_immediate or not isinstance(rollbacks, list) or
                    not set(expected_immediate.values()).issubset(set(rollbacks)) or
                    not durable.issubset(set(rollbacks))):
                deny("rollback_role_temporal_reconciliation_required")
            return
        if immediate is None:
            if set(self.inputs.components) != set(payload_components):
                deny("rollback_role_legacy_transition_required")
            return  # A full activation can establish both bindings from authenticated selections.
        rollbacks = value.get("rollbackReleases")
        if (not isinstance(immediate, dict) or set(immediate) != set(payload_components) or
                any(not isinstance(item, str) or not item for item in immediate.values()) or
                not isinstance(rollbacks, list) or
                set(rollbacks) != set(immediate.values())):
            deny("rollback_role_reconciliation_required")

    def _check_external_retirement(self, binding: RetirementBinding) -> None:
        raw, _ = stable_regular_bytes(binding.intent, required_mode=0o600)
        if hashlib.sha256(raw).hexdigest() != binding.intent_sha256:
            deny("generation_retirement_hash:intent")
        intent = json_object(raw, binding.intent.name)
        if ("externalHandoff" not in intent and
                binding.review_output.parent.name != f"{self.inputs.release}-external-import"):
            return
        self._authenticate_retirement()
        result = self.host.run(
            [sys.executable, str(binding.tool), "check-external-retirement",
             "--intent", str(binding.intent), "--intent-sha256", binding.intent_sha256,
             "--authorization", str(binding.authorization), "--authorization-sha256", binding.authorization_sha256,
             "--deployment-lock", str(binding.deployment_lock),
             "--root-policy", str(binding.root_policy), "--root-policy-sha256", binding.root_policy_sha256],
            timeout=180)
        if result.returncode:
            deny("external_retirement_verification")
        report = json_object(result.stdout.encode(), "external-retirement")
        expected = {"result": "EXTERNAL_RETIREMENT_READY", "releaseId": self.inputs.release,
                    "targetCommit": self.inputs.target, "intentSha256": binding.intent_sha256,
                    "installedPath": str(self.release_root),
                    "manifestSha256": digest(self.release_root / "manifest.json"),
                    "indexSha256": digest(self.release_root / "index.sha256")}
        if report != expected:
            deny("external_retirement_identity")

    @staticmethod
    def _closed_file_binding(value: Any, label: str) -> tuple[Path, str, bytes]:
        if (not isinstance(value, dict) or set(value) != {"path", "sha256"} or
                not isinstance(value.get("path"), str) or
                not SHA256.fullmatch(str(value.get("sha256", "")))):
            deny(f"retirement_sentinel_closure_binding:{label}")
        path = Path(value["path"])
        if not path.is_absolute():
            deny(f"retirement_sentinel_closure_binding:{label}")
        raw, _ = stable_regular_bytes(path, required_mode=0o600)
        observed = hashlib.sha256(raw).hexdigest()
        if observed != value["sha256"]:
            deny(f"retirement_sentinel_closure_hash:{label}")
        return path, observed, raw

    def _authenticate_retirement_sentinel_closure(self, lock_raw: bytes) -> dict[str, Any]:
        """Authenticate a completed retirement before re-binding its persistent sentinel."""
        binding = self.inputs.retirement_sentinel_closure
        retirement = self.inputs.retirement
        if binding is None or retirement is None:
            deny("retirement_sentinel_closure_required")
        manifest_raw, _ = stable_regular_bytes(binding.manifest, required_mode=0o600)
        if hashlib.sha256(manifest_raw).hexdigest() != binding.manifest_sha256:
            deny("retirement_sentinel_closure_manifest_hash")
        manifest = json_object(manifest_raw, binding.manifest.name)
        required = {"schemaVersion", "kind", "releaseId", "targetCommit", "removedPath",
                    "sentinelIntentSha256", "contract", "lifecycle", "review", "closure"}
        if (set(manifest) != required or manifest.get("schemaVersion") != 1 or
                manifest.get("kind") != "TERMINAL_GENERATION_RETIREMENT_SENTINEL_V1" or
                not isinstance(manifest.get("releaseId"), str) or
                not SHA40.fullmatch(str(manifest.get("targetCommit", ""))) or
                not SHA256.fullmatch(str(manifest.get("sentinelIntentSha256", "")))):
            deny("retirement_sentinel_closure_manifest_schema")
        sentinel_intent = manifest["sentinelIntentSha256"]
        if lock_raw != (sentinel_intent + "\n").encode():
            deny("retirement_sentinel_content")
        removed = Path(str(manifest.get("removedPath", "")))
        if (removed != self.releases / manifest["releaseId"] or
                removed.exists() or removed.is_symlink()):
            deny("retirement_sentinel_removed_release")
        _, contract_sha, contract_raw = self._closed_file_binding(
            manifest["contract"], "contract")
        _, lifecycle_sha, lifecycle_raw = self._closed_file_binding(
            manifest["lifecycle"], "lifecycle")
        _, _, review_raw = self._closed_file_binding(manifest["review"], "review")
        contract = json_object(contract_raw, "retirement-sentinel-contract")
        lifecycle = json_object(lifecycle_raw, "retirement-sentinel-lifecycle")
        review = json_object(review_raw, "retirement-sentinel-review")
        release = manifest["releaseId"]
        target = manifest["targetCommit"]
        if (contract.get("generationId") != release or contract.get("releaseId") != release or
                contract.get("targetCommit") != target or
                lifecycle.get("generationId") != release or lifecycle.get("state") != "COMPLETE" or
                review.get("schemaVersion") != 2 or review.get("generationId") != release or
                review.get("state") != "SANITIZED" or
                review.get("lifecycleSha256") != lifecycle_sha):
            deny("retirement_sentinel_closure_identity")
        tool_raw, tool_before = stable_regular_bytes(retirement.tool, required_mode=0o600)
        if hashlib.sha256(tool_raw).hexdigest() != retirement.tool_sha256:
            deny("retirement_sentinel_consumer_hash")
        spec = importlib.util.spec_from_file_location(
            "converta_authenticated_generation_retirement", retirement.tool)
        if spec is None or spec.loader is None:
            deny("retirement_sentinel_consumer_import")
        module = importlib.util.module_from_spec(spec)
        try:
            spec.loader.exec_module(module)
            normalized = module._canonical_retirement_closure(
                manifest["closure"], release, target, contract_sha, lifecycle_sha, review)
        except Exception as error:
            deny(f"retirement_sentinel_closure:{self._failure_predicate(error)}")
        tool_after = retirement.tool.lstat()
        before_identity = (tool_before.st_dev, tool_before.st_ino, tool_before.st_size,
                           tool_before.st_mtime_ns, tool_before.st_ctime_ns)
        after_identity = (tool_after.st_dev, tool_after.st_ino, tool_after.st_size,
                          tool_after.st_mtime_ns, tool_after.st_ctime_ns)
        if before_identity != after_identity or digest(retirement.tool) != retirement.tool_sha256:
            deny("retirement_sentinel_consumer_drift")
        chain = normalized.get("chain") if isinstance(normalized, dict) else None
        if (not isinstance(chain, list) or not chain or
                chain[-1].get("intent", {}).get("sha256") != sentinel_intent):
            deny("retirement_sentinel_intent_binding")
        return {
            "schemaVersion": 1,
            "kind": manifest["kind"],
            "releaseId": release,
            "targetCommit": target,
            "sentinelIntentSha256": sentinel_intent,
            "closureManifestSha256": binding.manifest_sha256,
        }

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
        affected = journal.get("components", list(self.inputs.components))
        if (not isinstance(affected, list) or not affected or
                any(component not in self._payload_components() for component in affected) or
                len(affected) != len(set(affected))):
            deny("generation_retirement_components")
        previous_by_component = journal.get("previous", {}).get("releases", {})
        if not isinstance(previous_by_component, dict):
            deny("generation_retirement_previous_release")
        previous_releases = set()
        for component in affected:
            release_id = previous_by_component.get(component)
            if not isinstance(release_id, str) or not release_id:
                deny("generation_retirement_previous_release")
            previous_releases.add(release_id)
        active = set(value.get("activeReleases", [])) - previous_releases
        active.add(self.inputs.release)
        for component in set(self._payload_components()) - set(affected):
            preserved_release = previous_by_component.get(component)
            if not isinstance(preserved_release, str) or not preserved_release:
                deny("generation_retirement_previous_release")
            active.add(preserved_release)
        immediate = value.get("immediateRollbackReleases")
        if immediate is not None and (not isinstance(immediate, dict) or
                                      set(immediate) != set(self._payload_components()) or
                                      any(not isinstance(item, str) or not item
                                          for item in immediate.values())):
            deny("generation_retirement_immediate_rollbacks")
        if immediate is not None:
            immediate = dict(immediate)
            for component in affected:
                immediate[component] = previous_by_component[component]
        elif set(affected) == set(self._payload_components()):
            # A full activation can establish the per-component binding without
            # guessing anything from the legacy accumulated list.  Partial
            # activations remain fail-closed until such a binding exists.
            immediate = {component: previous_by_component[component]
                         for component in self._payload_components()}
        rollback = set(value.get("rollbackReleases", [])) | previous_releases
        candidates = set(value.get("candidateReleases", [])); candidates.discard(self.inputs.release)
        installed = set(value.get("installedVerifiedReleases", [])); installed.add(self.inputs.release)
        value.update(currentPaths=sorted(set(current_paths)), pm2LivePaths=sorted(set(live_paths)),
                     pm2DumpPaths=sorted(set(dump_paths)), activeReleases=sorted(active),
                     rollbackReleases=sorted(rollback), candidateReleases=sorted(candidates),
                     installedVerifiedReleases=sorted(installed), deploymentState={"state": "DEPLOYED"})
        if immediate is not None:
            value["immediateRollbackReleases"] = immediate
        graph = {key: value[key] for key in ("activeReleases", "rollbackReleases",
                 "transitiveReturnReleases", "candidateReleases", "installedVerifiedReleases",
                 "supersededCandidates")}
        if immediate is not None:
            graph["immediateRollbackReleases"] = immediate
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
        if self._external_lock_active():
            self._authenticate_external_lock()
            command.extend(["--deployment-lock-fd", str(EXTERNAL_LOCK_FD)])
            environment = dict(os.environ)
            environment[EXTERNAL_LOCK_ENV] = "1"
            result = self.host.run(command, timeout=180,
                                   pass_fds=(EXTERNAL_LOCK_FD,), env=environment)
        else:
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
        if component == "worker" and "worker" in self.inputs.components:
            live_projection = self._configuration_projection(live)
            if any(fields.get(key) != value for key, value in live_projection.items()
                   if key != "logs"):
                deny("final_dump_field:worker:configuration")
            # PM2 6.0.14 persists the effective worker log paths at the
            # dump row's top level, but omits pm_id from its pm2_env. Bind
            # these paths to the independently authenticated *live* worker,
            # whose PM2 id and canonical definition were already verified.
            live_row = self._row(
                self.host.pm2_rows(self._resolve_pm2()), PROCESS_NAMES["worker"])
            if not self._worker_definition_matches(live_row, live, "candidate"):
                deny("final_dump_field:worker:logs")
            expected_logs = {
                "out": self._pm2_field(live_row, "pm_out_log_path"),
                "error": self._pm2_field(live_row, "pm_err_log_path"),
            }
            if "pm_out_log_path" in row or "pm_err_log_path" in row:
                # Real saved dump: both paths at top level, no fabricated pm_id.
                observed_logs = {
                    "out": row.get("pm_out_log_path"),
                    "error": row.get("pm_err_log_path"),
                }
            else:
                # Preserve the previously admitted nested representation only
                # when its own PM2 id and log paths remain authenticated.
                if not self._worker_definition_matches(row, live, "candidate"):
                    deny("final_dump_field:worker:logs")
                observed_logs = {
                    "out": self._pm2_field(row, "pm_out_log_path"),
                    "error": self._pm2_field(row, "pm_err_log_path"),
                }
            if (any(not isinstance(value, str) or not Path(value).is_absolute()
                    for value in observed_logs.values()) or
                    observed_logs != expected_logs):
                deny("final_dump_field:worker:logs")
            return
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
        if "worker" not in self.inputs.components:
            live_snapshots["worker"] = journal.get("previous", {}).get("worker", {})
        for component in THREE_COMPONENTS:
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
            deny("components_must_be_api_api_frontend_or_three_component")
        if self.inputs.retirement is None:
            deny("generation_retirement_binding_required")
        if self.inputs.retirement.deployment_lock != self.lock:
            deny("generation_retirement_lock_mismatch")
        retirement = self._authenticate_retirement()
        self._check_external_retirement(retirement)
        self._control_head()
        runtime_manifest = self._authenticated_runtime_manifest()
        self._require_reconciled_component_rollbacks(retirement, runtime_manifest)
        persistence = self._enforce_durable_persistence(runtime_manifest, "preflight")
        release = self._release()
        cutover = self._read_state_cutover(runtime_manifest) if persistence is not None else None
        if self.journal.exists():
            deny("transaction_exists")
        pm2 = self._resolve_pm2()
        rows = self.host.pm2_rows(pm2)
        worker = self._worker(rows)
        processes: dict[str, Any] = {}
        readiness: dict[str, Any] = {}
        selections: dict[str, Any] = {}
        predecessor_releases = self._predecessor_releases(runtime_manifest)
        for component in COMPONENTS:
            selections[component] = self._selection_snapshot(component)
            predecessor_identity = predecessor_releases[component]
            expected = self._rollback_release(component, predecessor_identity).resolve(strict=True)
            if Path(selections[component]["physicalRuntime"]) != expected:
                reason = ("preflight_predecessor_runtime" if "predecessorReleases" in runtime_manifest
                          else "preflight_rollback_runtime")
                deny(f"{reason}:{component}")
            processes[component] = self._process_snapshot(
                self._row(rows, self._process_name(component)), component, expected)
            release_id = selections[component]["releaseId"]
            if release_id != predecessor_identity["releaseId"]:
                reason = ("preflight_predecessor_release" if "predecessorReleases" in runtime_manifest
                          else "preflight_rollback_release")
                deny(f"{reason}:{component}")
        if "worker" in self.inputs.components:
            predecessor_identity = predecessor_releases["worker"]
            expected = self._rollback_release("worker", predecessor_identity).resolve(strict=True)
            worker = self._process_snapshot(
                self._row(rows, self._process_name("worker")), "worker", expected)
            selections["worker"] = {
                "path": None, "target": None, "physicalRuntime": str(expected),
                "releaseId": predecessor_identity["releaseId"],
            }
            processes["worker"] = worker
        if self.inputs.transaction_root.exists():
            private_directory(self.inputs.transaction_root)
            if any(self.inputs.transaction_root.iterdir()):
                deny("transaction_root_not_empty")
        else:
            self.inputs.transaction_root.mkdir(mode=0o700, parents=True)
        for component in COMPONENTS:
            release_id = selections[component]["releaseId"]
            expected = Path(selections[component]["physicalRuntime"])
            readiness[component] = self._readiness(
                component, release_id, expected, f"preflight-{component}")
        if "worker" in self.inputs.components:
            readiness["worker"] = {
                "result": "PREFLIGHT_WORKER_IDENTITY_PASS", "pid": worker["pid"],
                "startTicks": worker["startTicks"], "restartCount": worker["restartCount"],
                "releaseId": predecessor_releases["worker"]["releaseId"],
                "processCardinality": 1,
            }
        regular_private(self.dump)
        if shutil.disk_usage(self.inputs.transaction_root).free < 64 * 1024 * 1024:
            deny("insufficient_space")
        self._health()
        journal_binding = self.inputs.binding()
        if persistence is not None:
            journal_binding["durablePersistence"] = runtime_manifest["durablePersistence"]
        journal = {
            "schemaVersion": 1, "state": "PREFLIGHT_PASS", "binding": journal_binding,
            "preflight": {"release": release, "worker": worker,
                          "processes": processes, "selections": selections,
                          "readiness": readiness,
                          "runtimeManifestSha256": self.inputs.runtime_manifest_sha256,
                          "dump": private_file_identity(self.dump),
                          "pm2": str(pm2.resolve())},
            "saveCount": 0, "deployedMarkerCreated": False,
            "createdAtUnix": int(self.clock()), "updatedAtUnix": int(self.clock()),
        }
        if self.inputs.components != COMPONENTS:
            journal["components"] = list(self.inputs.components)
        atomic_private(self.journal, journal, exclusive=True)

    def _acquire_lock(self, journal: dict[str, Any]) -> None:
        self.lock.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        flags = os.O_RDWR | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
        try:
            fd = os.open(self.lock, flags, 0o600)
        except FileExistsError:
            self._adopt_existing_lock(journal)
        else:
            try:
                opened = os.fstat(fd)
                if (not stat.S_ISREG(opened.st_mode) or opened.st_uid != os.geteuid() or
                        opened.st_gid != os.getegid() or stat.S_IMODE(opened.st_mode) != 0o600 or
                        opened.st_nlink != 1 or opened.st_size != 0):
                    deny("global_lock_changed")
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                self._bind_lock_fd(journal, fd, opened, adopted_existing=False)
            finally:
                os.close(fd)

    @staticmethod
    def _lock_value(journal: dict[str, Any]) -> bytes:
        binding = hashlib.sha256(json.dumps(
            journal["binding"], sort_keys=True).encode()).hexdigest().encode()
        return FIXED_CURRENT_LOCK_PREFIX + binding + b"\n"

    def _bind_lock_fd(self, journal: dict[str, Any], fd: int, opened: os.stat_result,
                      *, adopted_existing: bool,
                      adopted_retirement_sentinel: dict[str, Any] | None = None) -> None:
        """Persist journal ownership before publishing the bound lock bytes."""
        value = self._lock_value(journal)
        expected_digest = hashlib.sha256(value).hexdigest()
        journal["lockDigest"] = expected_digest
        journal["lockTransition"] = {
            "schemaVersion": 1,
            "state": "PENDING",
            "adoptedExisting": adopted_existing,
            "device": opened.st_dev,
            "inode": opened.st_ino,
            "contentSha256": expected_digest,
            "zeroOperationalEffects": True,
        }
        if adopted_retirement_sentinel is not None:
            journal["lockTransition"]["adoptedRetirementSentinel"] = adopted_retirement_sentinel
        self._journal_write(journal, "ACTIVATING")
        self._failpoint("after_lock_transition_pending")
        if os.pwrite(fd, value, 0) != len(value):
            deny("global_lock_short_write")
        os.ftruncate(fd, len(value))
        os.fsync(fd)
        self._failpoint("after_lock_binding_fsync")
        after_fd = os.fstat(fd)
        after_path = self.lock.lstat()
        if (self.lock.is_symlink() or
                (after_fd.st_dev, after_fd.st_ino) != (opened.st_dev, opened.st_ino) or
                (after_path.st_dev, after_path.st_ino) != (opened.st_dev, opened.st_ino) or
                after_fd.st_size != len(value) or os.pread(fd, len(value) + 1, 0) != value):
            deny("global_lock_changed")
        journal["lockTransition"]["state"] = "BOUND"
        self._journal_write(journal, "ACTIVATING")
        directory_fd = os.open(self.lock.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)

    def _adopt_existing_lock(self, journal: dict[str, Any]) -> None:
        """Bind an empty or terminally authenticated retirement sentinel in place."""
        try:
            before = self.lock.lstat()
        except OSError:
            deny("global_lock_changed")
        expected_identity = (os.geteuid(), os.getegid(), 0o600, 1)
        own_value = self._lock_value(journal)
        observed_identity = (before.st_uid, before.st_gid, stat.S_IMODE(before.st_mode),
                             before.st_nlink)
        if (self.lock.is_symlink() or not stat.S_ISREG(before.st_mode) or
                observed_identity != expected_identity or
                before.st_size not in {0, 65, len(own_value)}):
            deny("global_lock_active")
        self._failpoint("existing_empty_lock_observed")
        try:
            fd = os.open(self.lock, os.O_RDWR | getattr(os, "O_NOFOLLOW", 0) | os.O_CLOEXEC)
        except OSError:
            deny("global_lock_changed")
        try:
            opened = os.fstat(fd)
            if ((before.st_dev, before.st_ino) != (opened.st_dev, opened.st_ino) or
                    (opened.st_uid, opened.st_gid, stat.S_IMODE(opened.st_mode),
                     opened.st_nlink) != expected_identity or opened.st_size != before.st_size):
                deny("global_lock_changed")
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                deny("global_lock_active")
            current = self.lock.lstat()
            content = os.pread(fd, max(66, len(own_value) + 1), 0)
            if (self.lock.is_symlink() or
                    (current.st_dev, current.st_ino) != (opened.st_dev, opened.st_ino) or
                    (current.st_uid, current.st_gid, stat.S_IMODE(current.st_mode),
                     current.st_nlink) != expected_identity or current.st_size != opened.st_size or
                    len(content) != opened.st_size):
                deny("global_lock_changed")
            adopted_sentinel = None
            if content:
                if len(content) == len(own_value) and content != own_value:
                    deny("global_lock_active")
                transition = journal.get("lockTransition")
                if content == own_value:
                    if (not isinstance(transition, dict) or transition.get("state") != "BOUND" or
                            transition.get("device") != opened.st_dev or
                            transition.get("inode") != opened.st_ino or
                            transition.get("contentSha256") != hashlib.sha256(content).hexdigest() or
                            journal.get("lockDigest") != hashlib.sha256(content).hexdigest()):
                        deny("global_lock_resume_authority")
                    return
                adopted_sentinel = self._authenticate_retirement_sentinel_closure(content)
                after_auth = self.lock.lstat()
                if ((after_auth.st_dev, after_auth.st_ino) != (opened.st_dev, opened.st_ino) or
                        os.pread(fd, 66, 0) != content):
                    deny("global_lock_changed")
            self._bind_lock_fd(
                journal, fd, opened, adopted_existing=True,
                adopted_retirement_sentinel=adopted_sentinel)
        finally:
            os.close(fd)

    def _external_lock_active(self) -> bool:
        value = os.environ.get(EXTERNAL_LOCK_ENV)
        if value is None:
            return False
        if value != "1":
            deny("external_lock_flag")
        return True

    def _authenticate_external_lock(self) -> None:
        try:
            before = self.lock.lstat()
            opened = os.fstat(EXTERNAL_LOCK_FD)
        except OSError:
            deny("external_lock_fd")
        if (self.lock.is_symlink() or not stat.S_ISREG(before.st_mode) or
                not stat.S_ISREG(opened.st_mode) or
                (before.st_dev, before.st_ino) != (opened.st_dev, opened.st_ino) or
                (before.st_uid, before.st_gid, stat.S_IMODE(before.st_mode)) !=
                (os.geteuid(), os.getegid(), 0o600) or
                (opened.st_uid, opened.st_gid, stat.S_IMODE(opened.st_mode)) !=
                (os.geteuid(), os.getegid(), 0o600) or
                not os.get_inheritable(EXTERNAL_LOCK_FD)):
            deny("external_lock_identity")
        try:
            fdinfo = Path(f"/proc/self/fdinfo/{EXTERNAL_LOCK_FD}").read_text()
        except OSError:
            deny("external_lock_fdinfo")
        expected = (os.major(opened.st_dev), os.minor(opened.st_dev), opened.st_ino)
        owned = False
        for line in fdinfo.splitlines():
            fields = line.split()
            if (len(fields) < 7 or fields[0] != "lock:" or
                    fields[2:5] != ["FLOCK", "ADVISORY", "WRITE"]):
                continue
            try:
                major, minor, inode = fields[6].split(":")
                observed = (int(major, 16), int(minor, 16), int(inode))
            except (ValueError, IndexError):
                continue
            if observed == expected:
                owned = True
                break
        if not owned:
            deny("external_lock_not_held")
        try:
            probe = os.open(self.lock, os.O_RDWR | getattr(os, "O_NOFOLLOW", 0))
        except OSError:
            deny("external_lock_probe")
        try:
            try:
                fcntl.flock(probe, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                return
            fcntl.flock(probe, fcntl.LOCK_UN)
            deny("external_lock_not_held")
        finally:
            os.close(probe)

    def _release_lock(self, journal: dict[str, Any], *, allow_absent: bool = False) -> None:
        if self._external_lock_active():
            self._authenticate_external_lock()
            if digest(self.lock) != journal.get("lockDigest"):
                deny("global_lock_identity")
            return
        if not self.lock.exists() and allow_absent:
            return
        regular_private(self.lock)
        if digest(self.lock) != journal.get("lockDigest"):
            deny("global_lock_identity")
        self.lock.unlink()

    def _transition_original_lock_bytes(self, transition: dict[str, Any]) -> bytes | None:
        """Return an authenticated pre-transition sentinel, or None for a created lock."""
        adopted_existing = transition.get("adoptedExisting")
        if adopted_existing is False:
            return None
        if adopted_existing is not True:
            deny("lock_transition_recovery_state")
        adopted_sentinel = transition.get("adoptedRetirementSentinel")
        if adopted_sentinel is None:
            return b""
        expected_keys = {"schemaVersion", "kind", "releaseId", "targetCommit",
                         "sentinelIntentSha256", "closureManifestSha256"}
        if (not isinstance(adopted_sentinel, dict) or
                set(adopted_sentinel) != expected_keys or
                not SHA256.fullmatch(str(adopted_sentinel.get("sentinelIntentSha256", "")))):
            deny("lock_transition_recovery_sentinel")
        restored = (adopted_sentinel["sentinelIntentSha256"] + "\n").encode()
        if self._authenticate_retirement_sentinel_closure(restored) != adopted_sentinel:
            deny("lock_transition_recovery_sentinel")
        return restored

    def _rollback_lock_transition(self, journal: dict[str, Any]) -> None:
        """Canonically close a lock transition that preceded all operational effects."""
        transition = journal.get("lockTransition")
        if (not isinstance(transition, dict) or transition.get("schemaVersion") != 1 or
                transition.get("state") not in {"PENDING", "BOUND"} or
                journal.get("previous") is not None or journal.get("activationAttempted") or
                journal.get("activationProgress") or journal.get("saveCount") != 0):
            deny("lock_transition_recovery_state")
        expected_identity = (transition.get("device"), transition.get("inode"))
        expected_value = self._lock_value(journal)
        expected_digest = hashlib.sha256(expected_value).hexdigest()
        if (journal.get("lockDigest") != expected_digest or
                transition.get("contentSha256") != expected_digest):
            deny("lock_transition_recovery_binding")
        progress = journal.setdefault("rollback", {
            "restoredComponents": [], "lockReleaseStarted": False,
            "zeroOperationalEffects": True,
        })
        self._journal_write(journal, "ROLLING_BACK")
        try:
            before = self.lock.lstat()
            if (self.lock.is_symlink() or not stat.S_ISREG(before.st_mode) or
                    (before.st_dev, before.st_ino) != expected_identity):
                deny("global_lock_recovery_identity")
            fd = os.open(self.lock, os.O_RDWR | getattr(os, "O_NOFOLLOW", 0) | os.O_CLOEXEC)
            try:
                opened = os.fstat(fd)
                if (opened.st_dev, opened.st_ino) != expected_identity:
                    deny("global_lock_recovery_identity")
                try:
                    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    deny("global_lock_recovery_busy")
                original_value = self._transition_original_lock_bytes(transition)
                content = os.pread(fd, len(expected_value) + 1, 0)
                admissible = {expected_value}
                if original_value is not None:
                    admissible.add(original_value)
                elif transition.get("state") == "PENDING":
                    admissible.add(b"")
                if content not in admissible:
                    deny("global_lock_recovery_content")
                progress["lockReleaseStarted"] = True
                self._journal_write(journal, "ROLLING_BACK")
                if transition.get("adoptedExisting") is True:
                    restored = original_value
                    if restored is None:
                        deny("lock_transition_recovery_state")
                    if restored and os.pwrite(fd, restored, 0) != len(restored):
                        deny("global_lock_recovery_short_write")
                    os.ftruncate(fd, len(restored))
                    os.fsync(fd)
                    self._failpoint("after_lock_sentinel_restore_fsync")
                    progress["result"] = ("RETIREMENT_SENTINEL_RESTORED" if restored else
                                          "EMPTY_SENTINEL_RESTORED")
                elif transition.get("adoptedExisting") is False:
                    current = self.lock.lstat()
                    if (current.st_dev, current.st_ino) != expected_identity:
                        deny("global_lock_recovery_identity")
                    self.lock.unlink()
                    progress["result"] = "CREATED_LOCK_REMOVED"
                else:
                    deny("lock_transition_recovery_state")
                directory_fd = os.open(self.lock.parent, os.O_RDONLY | os.O_DIRECTORY)
                try:
                    os.fsync(directory_fd)
                finally:
                    os.close(directory_fd)
            finally:
                os.close(fd)
            transition["state"] = "ROLLED_BACK"
            self._journal_write(journal, "ROLLED_BACK")
        except Exception as error:
            self._record_failure(journal, error, "rollback")
            raise

    def _ensure_lock(self, journal: dict[str, Any]) -> None:
        if self._external_lock_active():
            self._authenticate_external_lock()
            if digest(self.lock) != journal.get("lockDigest"):
                deny("global_lock_identity")
            return
        if self.lock.exists():
            regular_private(self.lock)
            if digest(self.lock) != journal.get("lockDigest"): deny("global_lock_identity")
            return
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
        fd = os.open(self.lock, flags, 0o600)
        with os.fdopen(fd, "w") as stream:
            stream.write(self._lock_value(journal).decode())
            stream.flush(); os.fsync(stream.fileno())
        if digest(self.lock) != journal.get("lockDigest"): deny("global_lock_recovery_identity")

    def _readiness(self, component: str, release_id: str, runtime: Path,
                   evidence_name: str, *, worker_role: str = "candidate") -> dict[str, Any]:
        entry_relative = ("dist/index.js" if component == "api" else
                          "node_modules/next/dist/bin/next" if component == "frontend" else
                          "dist/whatsapp-web-worker/src/index.js")
        entry = runtime / entry_relative
        raw, _ = stable_regular_bytes(entry)
        if component == "worker":
            binding = self._worker_pm2_binding(worker_role)
            args = [
                "wait-worker-readiness", "--request", str(binding["request"]),
                "--source-artifact", str(binding["sourceArtifact"]),
                "--source-sha256", binding["sourceSha256"],
                "--definition", str(binding["definition"]),
                "--pm2", str(self._resolve_pm2()), "--stable-path", str(self.stable[component]),
                "--release-root", str(runtime), "--deadline-seconds", "30",
                "--poll-seconds", "0.5",
            ]
        else:
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
                          release_id: str, runtime: Path, evidence_name: str,
                          *, worker_role: str = "candidate",
                          journal: dict[str, Any] | None = None,
                          worker_already_started: bool = False,
                          api_cutover_binding: dict[str, Any] | None = None) -> tuple[dict[str, Any], dict[str, Any]]:
        pm2 = self._resolve_pm2()
        name = self._process_name(component)
        if component == "worker":
            definition = self._worker_pm2_binding(worker_role)["definition"]
            if not worker_already_started:
                if journal is None or worker_role != "candidate":
                    deny("worker_transition_journal")
                transition = journal.setdefault("workerActivationTransition", {
                    "schemaVersion": 1, "role": "candidate", "state": "PENDING",
                    "definitionSha256": digest(Path(definition)),
                    "priorPid": before["pid"], "priorStartTicks": before["startTicks"],
                })
                if (transition.get("schemaVersion") != 1 or transition.get("role") != "candidate" or
                        transition.get("definitionSha256") != digest(Path(definition)) or
                        transition.get("priorPid") != before["pid"] or
                        transition.get("priorStartTicks") != before["startTicks"] or
                        transition.get("state") != "PENDING"):
                    deny("worker_transition_state")
                transition["state"] = "DELETE_ATTEMPT"
                self._journal_write(journal, "ACTIVATING")
                self.host.pm2_mutate(pm2, ["delete", name])
                transition["state"] = "DELETE_CONFIRMED"
                self._journal_write(journal, "ACTIVATING")
                self._failpoint("worker_after_delete")
                transition["state"] = "START_ATTEMPT"
                self._journal_write(journal, "ACTIVATING")
                self.host.pm2_mutate(pm2, ["start", str(definition), "--only", name])
                transition["state"] = "START_CONFIRMED"
                self._journal_write(journal, "ACTIVATING")
                self._failpoint("worker_after_start")
        elif api_cutover_binding is not None:
            if component != "api":
                deny("read_state_cutover_pm2_role")
            definition = api_cutover_binding["definition"]
            self.host.pm2_mutate(pm2, ["delete", name])
            self.host.pm2_mutate(pm2, ["start", str(definition), "--only", name])
        else:
            self.host.pm2_mutate(pm2, ["restart", name])
        row = self._row(self.host.pm2_rows(pm2), name)
        after = self._process_snapshot(row, component, runtime)
        if component == "worker":
            configuration_matches = self._worker_definition_matches(row, after, worker_role)
        elif api_cutover_binding is not None:
            configuration_matches = self._read_state_cutover_definition_matches(
                row, after, api_cutover_binding)
        else:
            before_projection = self._configuration_projection(before)
            after_projection = self._configuration_projection(after)
            configuration_matches = before_projection == after_projection
        if not configuration_matches:
            deny(f"process_configuration_changed:{component}")
        if component != "worker" and api_cutover_binding is None and after["restartCount"] != before["restartCount"] + 1:
            deny(f"restart_count:{component}")
        if api_cutover_binding is not None and after["restartCount"] != 0:
            deny("restart_count:api_cutover")
        if component == "worker" and after["restartCount"] != 0:
            deny("restart_count:worker")
        readiness = self._readiness(
            component, release_id, runtime, evidence_name, worker_role=worker_role)
        for key in ("pid", "startTicks", "restartCount"):
            if key in readiness and readiness[key] != after[key]:
                deny(f"readiness_identity:{component}:{key}")
        return after, readiness

    def _authenticated_worker_during_rollback(
            self, journal: dict[str, Any], row: dict[str, Any]) -> tuple[dict[str, Any], str]:
        observed = self._process_snapshot(row, "worker")
        if observed == journal.get("previous", {}).get("worker"):
            return observed, "prior"
        for role, release_id in (("candidate", self.inputs.release),
                                 ("rollback", journal.get("previous", {}).get("releases", {}).get("worker"))):
            if not isinstance(release_id, str):
                continue
            runtime = self.releases / release_id / RUNTIME_DIR["worker"]
            try:
                authenticated = self._process_snapshot(row, "worker", runtime.resolve(strict=True))
            except (Denied, OSError):
                continue
            if self._worker_definition_matches(row, authenticated, role):
                return authenticated, role
        deny("rollback_worker_unrelated_process")

    def _restore_worker(
            self, journal: dict[str, Any], progress: dict[str, Any], release_id: str,
            rollback_runtime: Path) -> tuple[dict[str, Any], dict[str, Any]]:
        """Restore one authenticated worker and reconcile interruption around PM2 effects."""
        transition = progress.setdefault("workerTransition", {
            "schemaVersion": 1, "state": "PENDING", "role": "rollback",
            "definitionSha256": digest(Path(self._worker_pm2_binding("rollback")["definition"])),
        })
        if (transition.get("schemaVersion") != 1 or transition.get("role") != "rollback" or
                transition.get("definitionSha256") !=
                digest(Path(self._worker_pm2_binding("rollback")["definition"])) or
                transition.get("state") not in {
                    "PENDING", "DELETE_ATTEMPT", "DELETE_CONFIRMED", "START_ATTEMPT",
                    "START_CONFIRMED", "VERIFIED",
                }):
            deny("rollback_worker_transition")
        row = self._optional_worker_row()
        role: str | None = None
        if row is not None:
            observed, role = self._authenticated_worker_during_rollback(journal, row)
        if row is not None and role == "rollback" and transition["state"] in {
                "START_ATTEMPT", "START_CONFIRMED", "VERIFIED"}:
            if self.stable["worker"].resolve(strict=True) != rollback_runtime:
                deny("rollback_worker_symlink_drift")
            transition["state"] = "START_CONFIRMED"
            transition["startReconciled"] = True
            self._journal_write(journal, "ROLLING_BACK")
        else:
            if row is not None:
                transition.update(state="DELETE_ATTEMPT", deletedPid=observed["pid"],
                                  deletedStartTicks=observed["startTicks"], deletedRole=role)
                self._journal_write(journal, "ROLLING_BACK")
                self.host.pm2_mutate(self._resolve_pm2(), ["delete", PROCESS_NAMES["worker"]])
                row = None
            elif transition["state"] == "PENDING":
                activation = journal.get("workerActivationTransition", {})
                if ("worker" not in journal.get("activationAttempted", []) or
                        activation.get("state") not in {
                            "DELETE_ATTEMPT", "DELETE_CONFIRMED", "START_ATTEMPT", "START_CONFIRMED",
                        }):
                    deny("rollback_worker_absence_unauthenticated")
                transition["absenceReconciledFromActivation"] = True
            transition["state"] = "DELETE_CONFIRMED"
            self._journal_write(journal, "ROLLING_BACK")
            self._failpoint("rollback_worker_after_delete")

        if transition["state"] != "START_CONFIRMED":
            atomic_symlink(self.stable["worker"], rollback_runtime)
            transition["state"] = "START_ATTEMPT"
            self._journal_write(journal, "ROLLING_BACK")
            definition = self._worker_pm2_binding("rollback")["definition"]
            self.host.pm2_mutate(
                self._resolve_pm2(), ["start", str(definition), "--only", PROCESS_NAMES["worker"]])
            self._failpoint("rollback_worker_after_start_effect")
            transition["state"] = "START_CONFIRMED"
            self._journal_write(journal, "ROLLING_BACK")
        row = self._optional_worker_row()
        if row is None:
            deny("rollback_worker_missing_after_start")
        _, role = self._authenticated_worker_during_rollback(journal, row)
        if role != "rollback":
            deny("rollback_worker_definition_not_restored")
        restored, readiness = self._restart_existing(
            "worker", journal.get("previous", {}).get("worker", {}), release_id,
            rollback_runtime, "rollback-worker", worker_role="rollback",
            worker_already_started=True)
        transition.update(state="VERIFIED", restoredPid=restored["pid"],
                          restoredStartTicks=restored["startTicks"])
        self._journal_write(journal, "ROLLING_BACK")
        return restored, readiness

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

    def _durable_persistence_request(self, manifest: dict[str, Any],
                                     key: str = "durablePersistence") -> dict[str, Any]:
        binding = manifest.get(key)
        if (not isinstance(binding, dict) or set(binding) != {"request", "requestSha256"} or
                not isinstance(binding.get("request"), str) or
                not SHA256.fullmatch(str(binding.get("requestSha256", "")))):
            deny("durable_persistence_binding")
        path = Path(binding["request"])
        raw, _ = stable_regular_bytes(path, required_mode=0o600)
        if hashlib.sha256(raw).hexdigest() != binding["requestSha256"]:
            deny("durable_persistence_request_sha256")
        value = json_object(raw, path.name)
        canonical = (json.dumps(value, ensure_ascii=False, sort_keys=True,
                                separators=(",", ":")) + "\n").encode()
        if raw != canonical:
            deny("durable_persistence_request_canonical")
        return value

    def _validate_temporal_persistence_authority(
        self, manifest: dict[str, Any], runtime_request: dict[str, Any]
    ) -> None:
        if "durablePersistenceAdmission" not in manifest:
            return
        admission_binding = manifest["durablePersistenceAdmission"]
        admission = self._durable_persistence_request(
            manifest, "durablePersistenceAdmission")
        if (admission.get("schemaVersion") != 5 or admission.get("kind") !=
                "CONVERTA_DURABLE_RUNTIME_PERSISTENCE_GATE_V5" or
                admission.get("candidateIdentity") != {
                    "generationId": self.inputs.release,
                    "targetCommit": self.inputs.target,
                }):
            deny("durable_persistence_temporal_admission")
        candidate_roots = [item for item in admission.get("releaseRoots", [])
                           if isinstance(item, dict) and item.get("role") == "candidate"]
        if (len(candidate_roots) != 1 or
                Path(str(candidate_roots[0].get("path", ""))) != self.release_root):
            deny("durable_persistence_temporal_candidate")
        expected = {key: value for key, value in admission.items()
                    if key not in {"externalAdmissionAuthority", "candidateIdentity"}}
        expected["schemaVersion"] = 3
        expected["kind"] = "CONVERTA_DURABLE_RUNTIME_PERSISTENCE_GATE_V3"
        expected["cutover"] = dict(expected["cutover"])
        # PM2 identities are produced only after the immutable manifest exists.
        # They remain fully authenticated by the runtime request and PM2 control.
        expected["cutover"]["pm2"] = runtime_request.get("cutover", {}).get("pm2")

        release_manifest = read_json(self.release_root / "manifest.json")
        compiled = release_manifest.get("durablePersistence")
        if (release_manifest.get("schemaVersion") != 2 or
                not isinstance(compiled, dict) or
                compiled.get("schemaVersion") != 1 or
                compiled.get("kind") !=
                "CONVERTA_DURABLE_READ_STATE_COMPILED_AUTHORITY_V1" or
                compiled.get("sourceAdmissionRequestSha256") !=
                admission_binding.get("requestSha256")):
            deny("durable_persistence_compiled_authority")
        artifacts = compiled.get("artifacts")
        relative_paths = {
            "runner": "api-runtime/dist/inbox/readStateReconciliationBatch.js",
            "candidateStorage": "api-runtime/dist/inbox/readStateStore.js",
        }
        if not isinstance(artifacts, dict) or set(artifacts) != set(relative_paths):
            deny("durable_persistence_compiled_artifacts")
        for label, relative in relative_paths.items():
            physical = self.release_root / relative
            physical_sha = digest(physical)
            pending = admission.get("cutover", {}).get(label)
            artifact = artifacts.get(label)
            runtime_binding = runtime_request.get("cutover", {}).get(label)
            if (pending != {"path": str(physical), "relativePath": relative,
                            "state": "PENDING_BUILD_VERIFY"} or
                    artifact != {"path": str(physical), "relativePath": relative,
                                 "sha256": physical_sha} or
                    runtime_binding != {"path": str(physical), "sha256": physical_sha}):
                deny(f"durable_persistence_compiled_artifact:{label}")
            expected["cutover"][label] = runtime_binding
        if runtime_request != expected:
            deny("durable_persistence_temporal_derivation")

    def _read_state_cutover(self, manifest: dict[str, Any]) -> dict[str, Any] | None:
        if "durablePersistence" not in manifest:
            return None
        request = self._durable_persistence_request(manifest)
        if request.get("schemaVersion") != 3:
            return None
        if (request.get("kind") != "CONVERTA_DURABLE_RUNTIME_PERSISTENCE_GATE_V3" or
                "api" not in self.inputs.components):
            deny("read_state_cutover_request")
        self._validate_temporal_persistence_authority(manifest, request)
        cutover = request.get("cutover")
        if (not isinstance(cutover, dict) or
                cutover.get("mode") != "FIRST_RELEASE_LOCAL_TO_DURABLE_V1"):
            deny("read_state_cutover_contract")
        reconciliation = request.get("reconciliation")
        if (not isinstance(reconciliation, dict) or reconciliation.get("required") is not True or
                reconciliation.get("state") != "PENDING"):
            deny("read_state_cutover_reconciliation")

        runner_binding = cutover.get("runner")
        candidate_storage_binding = cutover.get("candidateStorage")
        pm2_binding = cutover.get("pm2")
        rollback_binding = cutover.get("rollbackCompatibility")
        if (not isinstance(runner_binding, dict) or
                set(runner_binding) != {"path", "sha256"} or
                not isinstance(candidate_storage_binding, dict) or
                set(candidate_storage_binding) != {"path", "sha256"} or
                not isinstance(rollback_binding, dict) or
                set(rollback_binding) != {"path", "sha256"}):
            deny("read_state_cutover_binding")
        self._validate_read_state_cutover_pm2(pm2_binding, request["persistentRoot"]["path"])
        runner = Path(str(runner_binding.get("path", "")))
        expected_runner = (self.release_root /
                           "api-runtime/dist/inbox/readStateReconciliationBatch.js")
        if runner != expected_runner or not SHA256.fullmatch(str(runner_binding.get("sha256", ""))):
            deny("read_state_cutover_runner")
        runner_raw, _ = stable_regular_bytes(runner)
        if hashlib.sha256(runner_raw).hexdigest() != runner_binding["sha256"]:
            deny("read_state_cutover_runner_sha256")
        candidate_store = (self.release_root /
                           "api-runtime/dist/inbox/readStateStore.js")
        if (Path(str(candidate_storage_binding.get("path", ""))) != candidate_store or
                not SHA256.fullmatch(str(candidate_storage_binding.get("sha256", "")))):
            deny("read_state_cutover_candidate_store")
        candidate_store_raw, _ = stable_regular_bytes(candidate_store)
        if hashlib.sha256(candidate_store_raw).hexdigest() != candidate_storage_binding["sha256"]:
            deny("read_state_cutover_candidate_store_sha256")

        compatibility_path = Path(str(rollback_binding.get("path", "")))
        compatibility_raw, _ = stable_regular_bytes(compatibility_path, required_mode=0o600)
        if (not SHA256.fullmatch(str(rollback_binding.get("sha256", ""))) or
                hashlib.sha256(compatibility_raw).hexdigest() != rollback_binding["sha256"]):
            deny("read_state_cutover_rollback_binding")
        compatibility = json_object(compatibility_raw, compatibility_path.name)
        expected_keys = {"schemaVersion", "kind", "releaseId", "manifestSha256",
                         "indexSha256", "apiEntrySha256", "readStateStore",
                         "persistentRoot", "environment"}
        rollback = manifest["rollbackReleases"]["api"]
        root = request["persistentRoot"]["path"]
        if (set(compatibility) != expected_keys or compatibility.get("schemaVersion") != 1 or
                compatibility.get("kind") !=
                "CONVERTA_DURABLE_READ_STATE_ROLLBACK_COMPATIBILITY_V1" or
                compatibility.get("releaseId") != rollback["releaseId"] or
                compatibility.get("manifestSha256") != rollback["manifestSha256"] or
                compatibility.get("indexSha256") != rollback["indexSha256"] or
                compatibility.get("apiEntrySha256") != rollback["entrySha256"] or
                compatibility.get("persistentRoot") != root or
                compatibility.get("environment") != {"INBOX_READ_STATE_ROOT": root}):
            deny("read_state_cutover_rollback_compatibility")
        store = compatibility.get("readStateStore")
        rollback_store = (self.releases / rollback["releaseId"] /
                          "api-runtime/dist/inbox/readStateStore.js")
        if (not isinstance(store, dict) or set(store) != {"path", "sha256"} or
                Path(str(store.get("path", ""))) != rollback_store or
                not SHA256.fullmatch(str(store.get("sha256", "")))):
            deny("read_state_cutover_rollback_store")
        store_raw, _ = stable_regular_bytes(rollback_store)
        if hashlib.sha256(store_raw).hexdigest() != store["sha256"]:
            deny("read_state_cutover_rollback_store_sha256")
        api_rows = [row for row in self.host.pm2_rows(self._resolve_pm2())
                    if row.get("name") == PROCESS_NAMES["api"]]
        if len(api_rows) != 1:
            deny("read_state_cutover_api_cardinality")
        interpreter = api_rows[0].get("pm2_env", {}).get("exec_interpreter")
        if not isinstance(interpreter, str):
            deny("read_state_cutover_interpreter")
        self._probe_read_state_storage(Path(interpreter), candidate_store,
                                       self.release_root / RUNTIME_DIR["api"], root)
        self._probe_read_state_storage(Path(interpreter), rollback_store,
                                       self.releases / rollback["releaseId"] /
                                       RUNTIME_DIR["api"], root)
        return request

    def _validate_read_state_cutover_pm2(self, value: Any, root: str) -> None:
        if not isinstance(value, dict) or set(value) != {"candidate", "rollback"}:
            deny("read_state_cutover_pm2")
        arguments: list[str] = []
        allowlist = read_json(self.repo / "scripts/pm2-definition-env-allowlist.v1.json")
        for role, scope in (("candidate", "candidate"),
                            ("rollback", "rollbackCompatibility")):
            binding = value[role]
            expected = {"request", "sourceArtifact", "sourceSha256", "definition"}
            if not isinstance(binding, dict) or set(binding) != expected:
                deny(f"read_state_cutover_pm2:{role}")
            for key in ("request", "sourceArtifact", "definition"):
                path = Path(str(binding[key]))
                if not path.is_absolute():
                    deny(f"read_state_cutover_pm2:{role}:{key}")
                regular_private(path)
            if not SHA256.fullmatch(str(binding["sourceSha256"])):
                deny(f"read_state_cutover_pm2:{role}:sourceSha256")
            request = read_json(Path(binding["request"]))
            expected_keys = set(allowlist["components"]["api"]["common"] +
                                allowlist["components"]["api"][scope])
            if (request.get("component") != "api" or request.get("role") != role or
                    set(request.get("environmentKeys", [])) != expected_keys):
                deny(f"read_state_cutover_pm2:{role}:environment")
            definition = read_json(Path(binding["definition"]))
            try:
                environment = definition["apps"][0]["env"]
            except (KeyError, IndexError, TypeError):
                deny(f"read_state_cutover_pm2:{role}:definition")
            if environment.get("INBOX_READ_STATE_ROOT") != root:
                deny(f"read_state_cutover_pm2:{role}:root")
            arguments.extend((f"--{role}-request", str(binding["request"]),
                              f"--{role}-source-artifact", str(binding["sourceArtifact"]),
                              f"--{role}-source-sha256", binding["sourceSha256"],
                              f"--{role}-definition", str(binding["definition"])))
        result = self.host.run([sys.executable,
                                str(self.repo / "scripts/pm2-definition-control.py"),
                                "validate-pair", *arguments], timeout=45)
        if result.returncode:
            deny("read_state_cutover_pm2_pair")
        report = json_object(result.stdout.encode(), "read-state-cutover-pm2-pair")
        if (report.get("result") != "PM2_DEFINITION_PAIR_VALID" or
                report.get("component") != "api"):
            deny("read_state_cutover_pm2_pair")

    def _probe_read_state_storage(self, interpreter: Path, store: Path,
                                  runtime: Path, root: str) -> None:
        program = ("import {pathToFileURL} from 'node:url';"
                   "const m=await import(pathToFileURL(process.argv[1]).href);"
                   "process.stdout.write(m.resolveInboxReadStateRoot({cwd:process.argv[2],"
                   "nodeEnv:'production',configuredRoot:process.argv[3]})+'\\n')")
        result = self.host.run([str(interpreter), "--input-type=module", "--eval", program,
                                str(store), str(runtime), root])
        if result.returncode or result.stdout.strip() != root:
            deny("read_state_cutover_storage_behavior")

    def _read_state_snapshot_authorization(self, request: dict[str, Any]) -> dict[str, Any]:
        reconciliation = request["reconciliation"]
        authorization_path = Path(reconciliation["authorization"])
        authorization_raw, _ = stable_regular_bytes(authorization_path, required_mode=0o600)
        if hashlib.sha256(authorization_raw).hexdigest() != reconciliation["authorizationSha256"]:
            deny("read_state_cutover_authorization_sha256")
        authorization = json_object(authorization_raw, authorization_path.name)
        entries = authorization.get("entries")
        if not isinstance(entries, list) or len(entries) != reconciliation["destinationCount"]:
            deny("read_state_cutover_authorization_entries")
        return authorization

    def _read_state_source_roots(self, request: dict[str, Any]) -> list[Path]:
        authorization = self._read_state_snapshot_authorization(request)
        roots: dict[str, Path] = {}
        for entry in authorization["entries"]:
            if not isinstance(entry, dict) or not isinstance(entry.get("sources"), list):
                deny("read_state_cutover_authorization_entry")
            for source in entry["sources"]:
                if not isinstance(source, dict) or not isinstance(source.get("root"), dict):
                    deny("read_state_cutover_authorization_source")
                root = Path(str(source["root"].get("path", "")))
                roots[str(root)] = root
        return list(roots.values())

    def _seal_read_state_snapshot(self, request: dict[str, Any], previous: dict[str, Any]) -> dict[str, Any]:
        reconciliation = request["reconciliation"]
        runner = request["cutover"]["runner"]["path"]
        result = self.host.run([
            previous["interpreterPhysical"], runner, "seal",
            reconciliation["authorization"], reconciliation["authorizationSha256"],
        ], timeout=300)
        if result.returncode:
            deny("read_state_cutover_snapshot_seal_failed")
        try:
            output = json.loads(result.stdout)
        except json.JSONDecodeError:
            deny("read_state_cutover_snapshot_seal_output")
        if (not isinstance(output, dict) or output.get("state") != "SEALED" or
                output.get("manifestPath") != reconciliation["manifest"] or
                not SHA256.fullmatch(str(output.get("manifestSha256", ""))) or
                output.get("entryCount") != reconciliation["destinationCount"]):
            deny("read_state_cutover_snapshot_seal_result")
        return output

    def _read_state_snapshot_readback(self, request: dict[str, Any]) -> dict[str, Any]:
        reconciliation = request["reconciliation"]
        seal_path = Path(reconciliation["sealReceipt"])
        seal_raw, _ = stable_regular_bytes(seal_path, required_mode=0o600)
        seal = json_object(seal_raw, seal_path.name)
        if (seal.get("kind") != "CONVERTA_INBOX_READ_STATE_FINAL_SNAPSHOT_SEAL_V1" or
                seal.get("state") != "SEALED" or
                seal.get("authorizationSha256") != reconciliation["authorizationSha256"] or
                seal.get("manifestPath") != reconciliation["manifest"]):
            deny("read_state_cutover_snapshot_seal_readback")
        manifest_raw, _ = stable_regular_bytes(Path(reconciliation["manifest"]),
                                               required_mode=0o600)
        if hashlib.sha256(manifest_raw).hexdigest() != seal.get("manifestSha256"):
            deny("read_state_cutover_manifest_sha256")
        return {"sealReceiptSha256": hashlib.sha256(seal_raw).hexdigest(),
                "manifestSha256": seal["manifestSha256"]}

    def _api_is_quiesced(self, previous: dict[str, Any], source_roots: list[Path]) -> bool:
        matches = [row for row in self.host.pm2_rows(self._resolve_pm2())
                   if row.get("name") == PROCESS_NAMES["api"]]
        if len(matches) > 1:
            deny("read_state_cutover_api_cardinality")
        if matches:
            env = matches[0].get("pm2_env", {})
            if env.get("status") == "online":
                return False
        return (self.host.process_identity_absent(previous["pid"], previous["startTicks"]) and
                not self.host.process_references(source_roots))

    def _execute_read_state_cutover(self, journal: dict[str, Any], request: dict[str, Any]) -> None:
        previous = journal["previous"]["processes"]["api"]
        transition = journal.setdefault("readStateCutover", {
            "schemaVersion": 1, "state": "PENDING", "operationId":
            request["reconciliation"]["operationId"], "sealInvocations": 0,
            "runnerInvocations": 0,
        })
        if (transition.get("operationId") != request["reconciliation"]["operationId"] or
                transition.get("state") not in {"PENDING", "QUIESCE_ATTEMPT", "QUIESCED",
                                                "SNAPSHOT_SEALING", "SNAPSHOT_SEALED",
                                                "RECONCILING", "AGGREGATE_VERIFIED"}):
            deny("read_state_cutover_transition")
        if transition["state"] == "PENDING":
            transition["state"] = "QUIESCE_ATTEMPT"
            self._journal_write(journal, "ACTIVATING")
            self.host.pm2_mutate(self._resolve_pm2(), ["stop", PROCESS_NAMES["api"]])
        if transition["state"] == "QUIESCE_ATTEMPT":
            if not self._api_is_quiesced(previous, self._read_state_source_roots(request)):
                deny("read_state_cutover_writer_active")
            transition["state"] = "QUIESCED"
            transition["quiescedProcess"] = {"pid": previous["pid"],
                                              "startTicks": previous["startTicks"]}
            self._journal_write(journal, "ACTIVATING")
            self._failpoint("read_state_cutover_after_quiesce")
        if transition["state"] == "QUIESCED":
            transition["state"] = "SNAPSHOT_SEALING"
            transition["sealInvocations"] += 1
            self._journal_write(journal, "ACTIVATING")
        if transition["state"] == "SNAPSHOT_SEALING":
            transition["snapshotSeal"] = self._seal_read_state_snapshot(request, previous)
            transition["sourceReadback"] = self._read_state_snapshot_readback(request)
            transition["state"] = "SNAPSHOT_SEALED"
            self._journal_write(journal, "ACTIVATING")
            self._failpoint("read_state_cutover_after_snapshot_seal")
        if transition["state"] == "SNAPSHOT_SEALED":
            transition["state"] = "RECONCILING"
            self._journal_write(journal, "ACTIVATING")
        if transition["state"] == "RECONCILING":
            cutover = request["cutover"]
            runner = cutover["runner"]["path"]
            reconciliation = request["reconciliation"]
            transition["runnerInvocations"] += 1
            self._journal_write(journal, "ACTIVATING")
            result = self.host.run([
                previous["interpreterPhysical"], runner, "reconcile",
                reconciliation["manifest"], transition["sourceReadback"]["manifestSha256"],
            ], timeout=300)
            if result.returncode:
                deny("read_state_cutover_reconciliation_failed")
            try:
                output = json.loads(result.stdout)
            except json.JSONDecodeError:
                deny("read_state_cutover_reconciliation_output")
            if (not isinstance(output, dict) or output.get("state") not in
                    {"VERIFIED", "REPLAY_VERIFIED"} or
                    not SHA256.fullmatch(str(output.get("receiptSha256", "")))):
                deny("read_state_cutover_reconciliation_result")
            transition["state"] = "AGGREGATE_VERIFIED"
            transition["aggregateReceiptSha256"] = output["receiptSha256"]
            self._journal_write(journal, "ACTIVATING")
            self._failpoint("read_state_cutover_after_aggregate")
        self._enforce_durable_persistence(self._authenticated_runtime_manifest(), "activation")

    def _recover_quiesced_api(self, journal: dict[str, Any]) -> None:
        transition = journal.get("readStateCutover")
        if (not isinstance(transition, dict) or transition.get("state") not in
                {"QUIESCE_ATTEMPT", "QUIESCED", "SNAPSHOT_SEALING", "SNAPSHOT_SEALED",
                 "RECONCILING"} or
                journal.get("activationAttempted")):
            return
        previous = journal["previous"]
        prior_api = previous["processes"]["api"]
        if not self.host.process_identity_absent(prior_api["pid"], prior_api["startTicks"]):
            deny("read_state_cutover_writer_active_recovery")
        target = Path(previous["symlinks"]["api"])
        atomic_symlink(self.stable["api"], target)
        self.host.pm2_mutate(self._resolve_pm2(), ["restart", PROCESS_NAMES["api"]])
        restored = self._process_snapshot(
            self._row(self.host.pm2_rows(self._resolve_pm2()), PROCESS_NAMES["api"]),
            "api", target.resolve(strict=True))
        if self._configuration_projection(restored) != self._configuration_projection(
                previous["processes"]["api"]):
            deny("read_state_cutover_recovery_configuration")
        self._readiness("api", previous["releases"]["api"], target.resolve(strict=True),
                        "read-state-cutover-recovery-api")
        transition["state"] = "RECOVERED"
        self._journal_write(journal, "ACTIVATING")

    def activate(self) -> None:
        journal = self._journal_read()
        resuming = journal["state"] == "ACTIVATING"
        if journal["state"] not in {"PREFLIGHT_PASS", "ACTIVATING"}:
            deny("activate_state")
        if self.inputs.retirement is not None:
            self._check_external_retirement(self.inputs.retirement)
        self._control_head(journal if resuming else None)
        runtime_manifest = self._authenticated_runtime_manifest()
        cutover = self._read_state_cutover(runtime_manifest)
        if cutover is None:
            if resuming:
                deny("activate_state")
            self._enforce_durable_persistence(runtime_manifest, "activation")
        release = self._release()
        self._validate_private_data_continuity(journal, release)
        self._acquire_lock(journal)
        if not resuming:
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
                    "releases": {component: self._predecessor_releases(runtime_manifest)[component]["releaseId"]
                                 for component in self._payload_components()},
                    "worker": worker, "processes": processes,
                    "dump": private_file_identity(self.dump),
                }
                if "predecessorReleases" in runtime_manifest:
                    previous["durableRollbackReleases"] = {
                        component: runtime_manifest["rollbackReleases"][component]["releaseId"]
                        for component in self._payload_components()
                    }
                if "worker" in self.inputs.components:
                    previous["symlinks"]["worker"] = None
                    previous["processes"]["worker"] = worker
                rollback_dump = self.inputs.transaction_root / "rollback.dump.pm2"
                if rollback_dump.exists():
                    deny("rollback_dump_exists")
                shutil.copyfile(self.dump, rollback_dump)
                os.chmod(rollback_dump, 0o600)
                with rollback_dump.open("rb") as stream: os.fsync(stream.fileno())
            except Exception:
                self._rollback_lock_transition(journal)
                raise
            journal["previous"] = previous
            journal["rollbackDumpSha256"] = digest(rollback_dump)
            self._journal_write(journal, "ACTIVATING")
        else:
            if (cutover is None or journal.get("activationAttempted") or
                    journal.get("readStateCutover", {}).get("state") not in
                    {"QUIESCE_ATTEMPT", "QUIESCED", "SNAPSHOT_SEALING",
                     "SNAPSHOT_SEALED", "RECONCILING", "AGGREGATE_VERIFIED"}):
                deny("activate_resume_state")
            previous = journal.get("previous")
            if not isinstance(previous, dict):
                deny("activate_resume_previous")
        try:
            if cutover is not None:
                self._execute_read_state_cutover(journal, cutover)
            readiness: dict[str, Any] = {}
            candidate_processes: dict[str, Any] = {}
            for component in self.inputs.components:
                runtime = self.release_root / RUNTIME_DIR[component]
                journal.setdefault("activationAttempted", []).append(component)
                self._journal_write(journal, "ACTIVATING")
                atomic_symlink(self.stable[component], runtime)
                candidate_processes[component], readiness[component] = self._restart_existing(
                    component, previous["processes"][component], self.inputs.release,
                    runtime, f"activate-{component}", journal=journal,
                    api_cutover_binding=(cutover["cutover"]["pm2"]["candidate"]
                                         if cutover is not None and component == "api"
                                         else None))
                if cutover is not None and component == "api":
                    transition = journal.get("readStateCutover")
                    if (not isinstance(transition, dict) or
                            transition.get("state") != "AGGREGATE_VERIFIED"):
                        deny("read_state_cutover_commit_state")
                    transition["durableCommit"] = {
                        "schemaVersion": 1, "state": "COMMITTED",
                        "boundary": "CANDIDATE_API_HEALTHY",
                        "releaseId": self.inputs.release,
                        "pid": readiness[component]["pid"],
                        "startTicks": readiness[component]["startTicks"],
                        "restartCount": readiness[component]["restartCount"],
                    }
                    self._journal_write(journal, "ACTIVATING")
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
            if "worker" not in self.inputs.components and worker != previous["worker"]:
                deny("worker_changed")
            if "worker" in self.inputs.components and worker != candidate_processes.get("worker"):
                deny("worker_candidate_changed")
            journal["candidate"] = {"readiness": readiness, "processes": candidate_processes,
                                    "worker": worker}
            self._journal_write(journal, "AWAITING_ACCEPTANCE")
        except Exception:
            self._recover_quiesced_api(journal)
            self._rollback_internal(journal)
            raise

    def _rollback_internal(self, journal: dict[str, Any]) -> None:
        if journal.get("saveCount") != 0:
            deny("rollback_after_save")
        previous = journal.get("previous", {})
        cutover = self._read_state_cutover(self._authenticated_runtime_manifest())
        progress = journal.setdefault("rollback", {"restoredComponents": [], "lockReleaseStarted": False})
        self._journal_write(journal, "ROLLING_BACK")
        try:
            attempted = journal.get("activationAttempted", [])
            if not isinstance(attempted, list) or any(item not in THREE_COMPONENTS for item in attempted):
                deny("rollback_activation_progress")
            transition = journal.get("readStateCutover")
            durable_recovery = bool(
                isinstance(transition, dict) and
                transition.get("state") == "AGGREGATE_VERIFIED" and
                isinstance(previous.get("durableRollbackReleases"), dict)
            )
            rollback_role = "durableRollback" if durable_recovery else "predecessor"
            recorded_role = progress.setdefault("releaseRole", rollback_role)
            if recorded_role != rollback_role:
                deny("rollback_release_role_drift")
            releases = (previous["durableRollbackReleases"] if durable_recovery
                        else previous.get("releases", {}))
            restore_components = list(attempted)
            if durable_recovery:
                for component in self._payload_components():
                    if component not in restore_components:
                        restore_components.append(component)
            for component in reversed(restore_components):
                release_id = releases.get(component)
                if not isinstance(release_id, str):
                    deny(f"rollback_release_missing:{component}")
                rollback_runtime = self.releases / release_id / RUNTIME_DIR[component]
                target = (str(rollback_runtime) if durable_recovery and component != "worker"
                          else previous.get("symlinks", {}).get(component))
                if component != "worker" and not isinstance(target, str):
                    deny(f"rollback_symlink_missing:{component}")
                if component not in progress["restoredComponents"]:
                    if component == "worker":
                        restored, readiness = self._restore_worker(
                            journal, progress, release_id, rollback_runtime.resolve(strict=True))
                    else:
                        if durable_recovery and component == "api" and self._api_is_quiesced(
                                previous["processes"]["api"],
                                self._read_state_source_roots(cutover)):
                            current = previous["processes"]["api"]
                        else:
                            current = self._process_snapshot(
                                self._row(self.host.pm2_rows(self._resolve_pm2()),
                                          self._process_name(component)),
                                component, self.stable[component].resolve(strict=True))
                        atomic_symlink(self.stable[component], Path(target))
                        restored, readiness = self._restart_existing(
                            component, current, release_id, rollback_runtime.resolve(strict=True),
                            f"rollback-{component}", worker_role="rollback",
                            api_cutover_binding=(cutover["cutover"]["pm2"]["rollback"]
                                                if cutover is not None and component == "api"
                                                else None))
                    progress.setdefault("processes", {})[component] = restored
                    progress.setdefault("readiness", {})[component] = readiness
                    progress["restoredComponents"].append(component)
                    self._journal_write(journal, "ROLLING_BACK")
                    self._failpoint(f"rollback_after_{component}")
                else:
                    expected_target = (rollback_runtime if component == "worker" else Path(target))
                    if self.stable[component].resolve(strict=True) != expected_target.resolve(strict=True):
                        deny(f"rollback_symlink_drift:{component}")
                    current = self._process_snapshot(
                        self._row(self.host.pm2_rows(self._resolve_pm2()), self._process_name(component)),
                        component, expected_target.resolve(strict=True))
                    recorded = progress.get("processes", {}).get(component)
                    if current != recorded:
                        deny(f"rollback_process_drift:{component}")
            self._validate_preserved_components(journal, "rollback-preserved")
            self._health()
            worker = self._worker(self.host.pm2_rows(self._resolve_pm2()))
            expected_worker = (progress.get("processes", {}).get("worker")
                               if "worker" in attempted else previous.get("worker"))
            if worker != expected_worker: deny("rollback_worker_changed")
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
        if (journal.get("previous") is None and
                isinstance(journal.get("lockTransition"), dict) and
                journal["lockTransition"].get("state") in {"PENDING", "BOUND"}):
            self._control_head(journal); self._authenticated_runtime_manifest()
            self._rollback_lock_transition(journal)
            return
        current_dump = private_file_identity(self.dump)
        previous_dump = journal.get("previous", {}).get("dump", {})
        if current_dump.get("sha256") != previous_dump.get("sha256"):
            try:
                self._candidate_dump_identity(journal)
            except Denied:
                deny("rollback_dump_drift")
            deny("rollback_after_candidate_dump")
        self._control_head(journal); self._authenticated_runtime_manifest()
        self._rollback_internal(journal)

    def finalize(self) -> None:
        journal = self._journal_read()
        if journal["state"] not in {"AWAITING_ACCEPTANCE", "FINALIZING", "FAILED"}:
            deny("finalize_state")
        if journal["state"] == "FAILED" and journal.get("recoveryAction") != "finalize":
            deny("finalize_failed_state_owner")
        manifest = self._authenticated_runtime_manifest()
        self._enforce_durable_persistence(manifest, "finalize")
        regular_private(self.acceptance)
        if self.acceptance.read_text(encoding="utf-8").strip() != "ACEITE TÉCNICO PASS":
            deny("technical_acceptance")
        if journal.get("saveCount") not in {0, 1}:
            deny("finalize_replay")
        try:
            if self._external_lock_active():
                self._ensure_lock(journal)
            self._control_head(journal); self._authenticated_runtime_manifest()
            release = self._release(continuation_journal=journal)
            self._validate_private_data_continuity(journal, release)
            if journal["saveCount"] == 0 and self.inputs.retirement is not None:
                self._check_external_retirement(self.inputs.retirement)
            final_readiness: dict[str, Any] = {}
            for component in self._payload_components():
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
            expected_worker = (journal.get("candidate", {}).get("processes", {}).get("worker")
                               if "worker" in self.inputs.components else
                               journal.get("previous", {}).get("worker"))
            if worker != expected_worker: deny("finalize_worker_changed")
            if self.inputs.runtime_cache_reconciliation is not None:
                recaptured_release = self._release(continuation_journal=journal)
                if recaptured_release != release:
                    deny("runtime_cache_reconciliation_changed")
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
            if self.inputs.components != COMPONENTS:
                payload["components"] = list(self.inputs.components)
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
    parser.add_argument("--control-plane-succession", type=Path)
    parser.add_argument("--control-plane-succession-sha256")
    parser.add_argument("--worker-rollback-continuation", type=Path)
    parser.add_argument("--worker-rollback-continuation-sha256")
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
    parser.add_argument("--private-data-reconciliation", type=Path)
    parser.add_argument("--private-data-reconciliation-sha256")
    parser.add_argument("--runtime-cache-reconciliation", type=Path)
    parser.add_argument("--runtime-cache-reconciliation-sha256")
    parser.add_argument("--retirement-sentinel-closure", type=Path)
    parser.add_argument("--retirement-sentinel-closure-sha256")
    args = parser.parse_args()
    if ((args.private_data_reconciliation is None) !=
            (args.private_data_reconciliation_sha256 is None)):
        deny("private_data_reconciliation_binding")
    if ((args.runtime_cache_reconciliation is None) !=
            (args.runtime_cache_reconciliation_sha256 is None)):
        deny("runtime_cache_reconciliation_binding")
    if ((args.retirement_sentinel_closure is None) !=
            (args.retirement_sentinel_closure_sha256 is None)):
        deny("retirement_sentinel_closure_binding")
    if ((args.control_plane_succession is None) !=
            (args.control_plane_succession_sha256 is None)):
        deny("control_plane_succession_binding")
    if ((args.worker_rollback_continuation is None) !=
            (args.worker_rollback_continuation_sha256 is None)):
        deny("worker_rollback_continuation_binding")
    if args.worker_rollback_continuation is not None and args.command != "rollback":
        deny("worker_rollback_continuation_command")
    components = tuple(args.components.split(","))
    retirement = RetirementBinding(
        args.generation_retirement_tool, args.generation_retirement_tool_sha256,
        args.generation_retirement_intent, args.generation_retirement_intent_sha256,
        args.generation_retirement_authorization, args.generation_retirement_authorization_sha256,
        args.generation_retirement_operational_state, args.generation_retirement_operational_state_sha256,
        args.generation_retirement_root_policy, args.generation_retirement_root_policy_sha256,
        args.generation_retirement_receipt_root, args.generation_retirement_review_output,
        args.generation_retirement_deployment_lock)
    sentinel_closure = (RetirementSentinelClosureBinding(
        args.retirement_sentinel_closure, args.retirement_sentinel_closure_sha256)
        if args.retirement_sentinel_closure is not None else None)
    succession = (ControlPlaneSuccessionBinding(
        args.control_plane_succession, args.control_plane_succession_sha256)
        if args.control_plane_succession is not None else None)
    rollback_continuation = (WorkerRollbackContinuationBinding(
        args.worker_rollback_continuation, args.worker_rollback_continuation_sha256)
        if args.worker_rollback_continuation is not None else None)
    return args.command, Inputs(
        release=args.release, target=args.target, control_plane=args.control_plane,
        components=components, runtime_manifest=args.runtime_manifest,
        transaction_root=args.transaction_root,
        runtime_manifest_sha256=args.runtime_manifest_sha256, retirement=retirement,
        private_data_reconciliation=args.private_data_reconciliation,
        private_data_reconciliation_sha256=args.private_data_reconciliation_sha256,
        retirement_sentinel_closure=sentinel_closure,
        runtime_cache_reconciliation=args.runtime_cache_reconciliation,
        runtime_cache_reconciliation_sha256=args.runtime_cache_reconciliation_sha256,
        control_plane_succession=succession,
        worker_rollback_continuation=rollback_continuation)


def main() -> int:
    try:
        command, inputs = parse()
        if os.environ.get(EXTERNAL_LOCK_ENV) is not None and command != "finalize":
            deny("external_lock_command")
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
