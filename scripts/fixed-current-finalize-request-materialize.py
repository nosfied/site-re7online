#!/usr/bin/env python3
"""Materialize a canonical fixed-current finalize request from sealed authorities.

This producer never executes the request.  In particular, it does not accept a
caller-provided argv: the complete finalize command is derived from the bound
transaction journal and its authenticated artifacts.
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
from pathlib import Path
from typing import Any


SHA256 = re.compile(r"^[0-9a-f]{64}$")
SHA40 = re.compile(r"^[0-9a-f]{40}$")
ACCEPTANCE = "ACEITE TÉCNICO PASS\n".encode("utf-8")
PROFILES = (["api"], ["api", "frontend"], ["api", "frontend", "worker"])
RUNTIME_CACHE_KIND = "FIXED_CURRENT_RUNTIME_CACHE_FINALIZE_RECONCILIATION_V1"
RUNTIME_CACHE_KIND_V2 = "FIXED_CURRENT_RUNTIME_CACHE_FINALIZE_RECONCILIATION_V2"
RUNTIME_CACHE_POLICY_V2 = "NEXT_IMAGE_CACHE_V1"
RELEASES_ROOT = Path("/opt/re7online/releases")
META_DBFIRST_RELEASE = "immutable-41d70b53-external-20261118T214122Z"
META_DBFIRST_TARGET = "41d70b5368bc413ea34ee517b79351d7b8cd526b"
META_DBFIRST_ORIGINAL_CONTROL_PLANE = "41d70b5368bc413ea34ee517b79351d7b8cd526b"
META_DBFIRST_TRANSACTION = Path(
    "/opt/re7online/backups/converta-persistent/deploy-transactions/"
    "immutable-41d70b53-external-20261118T214122Z-api-frontend-41d70b53-v2-once"
)
META_DBFIRST_INDEX_SHA256 = "f99c00bf7724dd581e34a4fccae4b4fd47ae32c596af20b2fad187b390eaf14c"
META_DBFIRST_MANIFEST_SHA256 = "3d0a9c69de53e39d3ee9d8df389d1640615988a80354f421a5dfe7732932b5cc"
META_DBFIRST_INTENT_SHA256 = "5fb229f2390fd3fcdcfdd0efe7cb0c69b87df8721bec39568e9ffe46249ea287"
META_DBFIRST_NEGATIVE_JOURNAL_SHA256 = (
    "263114a6abed7b66e6ee298fc773f81825f1eb682515a20c0721d62275d9ed8e"
)
META_DBFIRST_ACCEPTANCE_SHA256 = "1427ff7dd23e5a1059295fa400bc9f5d9def1c7d8395ff54a2cb3c47d238de7a"
META_DBFIRST_LOCK_SHA256 = "235780dd913299a349c61ba55cb0006818de9743cd47418246dde0f643fa5368"


class Denied(RuntimeError):
    pass


def sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def stable_regular(path: Path, *, modes: set[int]) -> tuple[bytes, os.stat_result]:
    try:
        before = path.lstat()
        fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    except OSError as error:
        raise Denied(f"file_open:{path.name}") from error
    try:
        opened = os.fstat(fd)
        if (stat.S_ISLNK(before.st_mode) or not stat.S_ISREG(opened.st_mode) or
                (before.st_dev, before.st_ino) != (opened.st_dev, opened.st_ino) or
                (opened.st_uid, opened.st_gid) != (os.geteuid(), os.getegid()) or
                stat.S_IMODE(opened.st_mode) not in modes):
            raise Denied(f"file_identity:{path.name}")
        blocks: list[bytes] = []
        while block := os.read(fd, 1024 * 1024):
            blocks.append(block)
        after = os.fstat(fd)
    finally:
        os.close(fd)
    identity = lambda value: (value.st_dev, value.st_ino, value.st_mode, value.st_uid,
                              value.st_gid, value.st_size, value.st_mtime_ns,
                              value.st_ctime_ns)
    raw = b"".join(blocks)
    if identity(opened) != identity(after) or len(raw) != opened.st_size:
        raise Denied(f"file_changed:{path.name}")
    return raw, after


def bound_regular(path: Path, expected: str, *, modes: set[int]) -> bytes:
    if not path.is_absolute() or not SHA256.fullmatch(expected):
        raise Denied(f"binding:{path.name}")
    raw, _ = stable_regular(path, modes=modes)
    if sha256(raw) != expected:
        raise Denied(f"sha256:{path.name}")
    return raw


def json_object(raw: bytes, name: str) -> dict[str, Any]:
    try:
        value = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise Denied(f"json:{name}") from error
    if not isinstance(value, dict):
        raise Denied(f"json_object:{name}")
    return value


def absolute(value: Any, predicate: str) -> Path:
    if not isinstance(value, str) or not Path(value).is_absolute():
        raise Denied(predicate)
    return Path(value)


def load_request(path: Path, expected: str) -> dict[str, Any]:
    raw = bound_regular(path, expected, modes={0o600})
    value = json_object(raw, path.name)
    if value.get("action") == "materialize_fixed_current_finalize_continuation":
        required_continuation = {
            "schemaVersion", "action", "transactionRoot", "transactionJournal",
            "transactionJournalSha256", "priorRequest", "priorRequestSha256",
            "lockPath", "lockSha256", "driver", "driverSha256",
            "wrapper", "wrapperSha256", "cacheManifestOutput",
            "finalizeRequestOutput",
        }
        allowed_continuation = (
            required_continuation,
            required_continuation | {"negativeJournalOutput"},
        )
        if set(value) not in allowed_continuation or value.get("schemaVersion") != 1:
            raise Denied("continuation_request_schema")
        for name in ("transactionRoot", "transactionJournal", "priorRequest",
                     "lockPath", "driver", "wrapper", "cacheManifestOutput",
                     "finalizeRequestOutput"):
            absolute(value.get(name), f"continuation_request_path:{name}")
        if "negativeJournalOutput" in value:
            absolute(value.get("negativeJournalOutput"),
                     "continuation_request_path:negativeJournalOutput")
        for name in ("transactionJournalSha256", "priorRequestSha256", "lockSha256",
                     "driverSha256", "wrapperSha256"):
            if not SHA256.fullmatch(str(value.get(name, ""))):
                raise Denied(f"continuation_request_sha256:{name}")
        return value
    required = {
        "schemaVersion", "action", "transactionRoot", "transactionJournal",
        "transactionJournalSha256", "acceptance", "acceptanceSha256",
        "lockPath", "lockSha256", "driver", "driverSha256", "wrapper",
        "wrapperSha256", "finalizeRequestOutput", "optionalAuthorities",
    }
    initial_cache = required | {"cacheManifestOutput", "acceptanceJournalOutput"}
    if (set(value) not in (required, initial_cache) or value.get("schemaVersion") != 1 or
            value.get("action") != "materialize_fixed_current_finalize_request"):
        raise Denied("request_schema")
    for name in ("transactionRoot", "transactionJournal", "acceptance", "lockPath",
                 "driver", "wrapper", "finalizeRequestOutput"):
        absolute(value.get(name), f"request_path:{name}")
    for name in ("cacheManifestOutput", "acceptanceJournalOutput"):
        if name in value:
            absolute(value.get(name), f"request_path:{name}")
    for name in ("transactionJournalSha256", "acceptanceSha256", "lockSha256",
                 "driverSha256", "wrapperSha256"):
        if not SHA256.fullmatch(str(value.get(name, ""))):
            raise Denied(f"request_sha256:{name}")
    optional = value.get("optionalAuthorities")
    if not isinstance(optional, dict) or not set(optional).issubset({
            "runtimeCacheReconciliation", "privateDataReconciliation"}):
        raise Denied("request_optional_authorities")
    for name, binding in optional.items():
        if (not isinstance(binding, dict) or set(binding) != {"path", "sha256"} or
                not isinstance(binding.get("path"), str) or
                not Path(binding["path"]).is_absolute() or
                not SHA256.fullmatch(str(binding.get("sha256", "")))):
            raise Denied(f"request_optional_authority:{name}")
    if "cacheManifestOutput" in value and optional:
        raise Denied("request_initial_cache_authorities")
    return value


def authenticate_root(root: Path) -> None:
    try:
        info = root.lstat()
    except OSError as error:
        raise Denied("transaction_root") from error
    if (root.is_symlink() or not root.is_dir() or
            (info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)) !=
            (os.geteuid(), os.getegid(), 0o700)):
        raise Denied("transaction_root_identity")


def authenticate_checkout(driver: Path, driver_sha: str, wrapper: Path,
                          wrapper_sha: str, expected_head: str) -> None:
    if (driver.name != "converta-deploy.py" or
            wrapper.name != "fixed-current-finalization-continuation.py" or
            driver.parent.name != "scripts" or wrapper.parent != driver.parent or
            not SHA40.fullmatch(expected_head)):
        raise Denied("checkout_layout")
    repo = driver.parent.parent
    commands = {
        "head": ["git", "-C", str(repo), "rev-parse", "HEAD"],
        "driverTracked": ["git", "-C", str(repo), "ls-files", "--error-unmatch", "--",
                          "scripts/converta-deploy.py"],
        "wrapperTracked": ["git", "-C", str(repo), "ls-files", "--error-unmatch", "--",
                           "scripts/fixed-current-finalization-continuation.py"],
        "driverBlob": ["git", "-C", str(repo), "show",
                       f"{expected_head}:scripts/converta-deploy.py"],
        "wrapperBlob": ["git", "-C", str(repo), "show",
                        f"{expected_head}:scripts/fixed-current-finalization-continuation.py"],
        "status": ["git", "-C", str(repo), "status", "--porcelain=v1",
                   "--untracked-files=all"],
    }
    results = {name: subprocess.run(command, check=False, capture_output=True)
               for name, command in commands.items()}
    if (any(result.returncode for result in results.values()) or
            results["head"].stdout.decode().strip() != expected_head or
            results["driverTracked"].stdout.decode().strip() !=
            "scripts/converta-deploy.py" or
            results["wrapperTracked"].stdout.decode().strip() !=
            "scripts/fixed-current-finalization-continuation.py" or
            results["status"].stdout or sha256(results["driverBlob"].stdout) != driver_sha or
            sha256(results["wrapperBlob"].stdout) != wrapper_sha):
        raise Denied("checkout_identity")


def authenticate_retirement(binding: Any, lock: Path) -> list[str]:
    required = {
        "tool", "toolSha256", "intent", "intentSha256", "authorization",
        "authorizationSha256", "operationalState", "operationalStateSha256",
        "rootPolicy", "rootPolicySha256", "receiptRoot", "reviewOutput",
        "deploymentLock",
    }
    if not isinstance(binding, dict) or set(binding) != required:
        raise Denied("retirement_binding")
    pairs = (
        ("tool", "toolSha256", {0o500, 0o600}),
        ("intent", "intentSha256", {0o600}),
        ("authorization", "authorizationSha256", {0o600}),
        ("operationalState", "operationalStateSha256", {0o600}),
        ("rootPolicy", "rootPolicySha256", {0o444, 0o600, 0o644}),
    )
    for path_name, sha_name, modes in pairs:
        bound_regular(absolute(binding.get(path_name), f"retirement_path:{path_name}"),
                      str(binding.get(sha_name, "")), modes=modes)
    receipt = absolute(binding.get("receiptRoot"), "retirement_path:receiptRoot")
    review = absolute(binding.get("reviewOutput"), "retirement_path:reviewOutput")
    deployment_lock = absolute(binding.get("deploymentLock"),
                               "retirement_path:deploymentLock")
    if deployment_lock != lock:
        raise Denied("retirement_lock")
    return [
        "--generation-retirement-tool", binding["tool"],
        "--generation-retirement-tool-sha256", binding["toolSha256"],
        "--generation-retirement-intent", binding["intent"],
        "--generation-retirement-intent-sha256", binding["intentSha256"],
        "--generation-retirement-authorization", binding["authorization"],
        "--generation-retirement-authorization-sha256", binding["authorizationSha256"],
        "--generation-retirement-operational-state", binding["operationalState"],
        "--generation-retirement-operational-state-sha256",
        binding["operationalStateSha256"],
        "--generation-retirement-root-policy", binding["rootPolicy"],
        "--generation-retirement-root-policy-sha256", binding["rootPolicySha256"],
        "--generation-retirement-receipt-root", str(receipt),
        "--generation-retirement-review-output", str(review),
        "--generation-retirement-deployment-lock", str(deployment_lock),
    ]


def optional_argument(request: dict[str, Any], name: str, flag: str) -> list[str]:
    binding = request["optionalAuthorities"].get(name)
    if binding is None:
        return []
    path = Path(binding["path"])
    bound_regular(path, binding["sha256"], modes={0o600})
    return [flag, str(path), f"{flag}-sha256", binding["sha256"]]


def runtime_cache_head(request: dict[str, Any], journal: dict[str, Any],
                       acceptance_sha: str, lock_sha: str) -> str | None:
    binding = request["optionalAuthorities"].get("runtimeCacheReconciliation")
    if binding is None:
        return None
    path = Path(binding["path"])
    manifest = json_object(bound_regular(path, binding["sha256"], modes={0o600}), path.name)
    common = {
        "schemaVersion", "kind", "releaseId", "targetCommit", "transactionRoot",
        "indexSha256", "manifestSha256", "retirementIntentSha256",
        "originalControlPlane", "continuationControlPlane",
        "continuationDriverSha256", "acceptanceSha256", "lockSha256", "cacheEntries",
    }
    authority_names = set(manifest) - common
    kind = manifest.get("kind")
    if kind == RUNTIME_CACHE_KIND_V2:
        common |= {"cachePolicy", "runtimeManifestSha256"}
        authority_names = set(manifest) - common
    if (manifest.get("schemaVersion") != 1 or
            kind not in {RUNTIME_CACHE_KIND, RUNTIME_CACHE_KIND_V2} or
            authority_names not in ({"acceptanceJournal"}, {"negativeJournal"}) or
            (kind == RUNTIME_CACHE_KIND_V2 and
             manifest.get("cachePolicy") != RUNTIME_CACHE_POLICY_V2)):
        raise Denied("runtime_cache_schema")
    bound = journal["binding"]
    retirement = bound["generationRetirement"]
    if (manifest.get("releaseId") != bound["release"] or
            manifest.get("targetCommit") != bound["target"] or
            manifest.get("transactionRoot") != bound["transactionRoot"] or
            manifest.get("originalControlPlane") != bound["controlPlane"] or
            manifest.get("retirementIntentSha256") != retirement["intentSha256"] or
            (kind == RUNTIME_CACHE_KIND_V2 and
             manifest.get("runtimeManifestSha256") != bound.get("runtimeManifestSha256")) or
            manifest.get("acceptanceSha256") != acceptance_sha or
            manifest.get("lockSha256") != lock_sha or
            manifest.get("continuationDriverSha256") != request["driverSha256"] or
            not SHA40.fullmatch(str(manifest.get("continuationControlPlane", ""))) or
            not isinstance(manifest.get("cacheEntries"), list)):
        raise Denied("runtime_cache_scope")
    authority = manifest[next(iter(authority_names))]
    if (not isinstance(authority, dict) or set(authority) != {"path", "sha256"} or
            not isinstance(authority.get("path"), str) or
            not Path(authority["path"]).is_absolute() or
            not SHA256.fullmatch(str(authority.get("sha256", "")))):
        raise Denied("runtime_cache_journal_authority")
    authority_raw = bound_regular(Path(authority["path"]), authority["sha256"], modes={0o600})
    if json_object(authority_raw, Path(authority["path"]).name) != journal:
        raise Denied("runtime_cache_journal_authority")
    if (kind == RUNTIME_CACHE_KIND_V2 and
            manifest.get("cacheEntries") != next_image_cache_inventory(
                bound["release"], manifest["indexSha256"],
                manifest["manifestSha256"])):
        raise Denied("runtime_cache_inventory")
    return str(manifest["continuationControlPlane"])


def derive(request: dict[str, Any]) -> dict[str, Any]:
    root = Path(request["transactionRoot"])
    authenticate_root(root)
    journal_path = Path(request["transactionJournal"])
    acceptance = Path(request["acceptance"])
    lock = Path(request["lockPath"])
    if (journal_path != root / "transaction.v1.private.json" or
            acceptance != root / "acceptance.private.txt"):
        raise Denied("transaction_paths")
    journal_raw = bound_regular(journal_path, request["transactionJournalSha256"],
                                modes={0o600})
    journal = json_object(journal_raw, journal_path.name)
    acceptance_raw = bound_regular(acceptance, request["acceptanceSha256"], modes={0o600})
    lock_raw = bound_regular(lock, request["lockSha256"], modes={0o600})
    if acceptance_raw != ACCEPTANCE:
        raise Denied("acceptance_payload")
    binding = journal.get("binding")
    required_binding = {"release", "target", "controlPlane", "components",
                        "runtimeManifest", "transactionRoot", "runtimeManifestSha256",
                        "generationRetirement"}
    optional_binding = {"retirementSentinelClosure", "controlPlaneSuccession"}
    if (not isinstance(binding, dict) or not required_binding.issubset(binding) or
            not set(binding).issubset(required_binding | optional_binding) or
            binding.get("components") not in PROFILES or
            not all(isinstance(binding.get(name), str) for name in
                    ("release", "target", "controlPlane", "runtimeManifest",
                     "transactionRoot", "runtimeManifestSha256")) or
            not SHA40.fullmatch(binding["target"]) or
            not SHA40.fullmatch(binding["controlPlane"]) or
            binding["transactionRoot"] != str(root)):
        raise Denied("journal_binding")
    if (journal.get("schemaVersion") != 1 or journal.get("state") != "AWAITING_ACCEPTANCE" or
            journal.get("saveCount") != 0 or journal.get("deployedMarkerCreated") is not False or
            journal.get("activationProgress") != binding["components"]):
        raise Denied("journal_state")
    runtime_manifest = absolute(binding["runtimeManifest"], "runtime_manifest_path")
    runtime_raw = bound_regular(runtime_manifest, binding["runtimeManifestSha256"],
                                modes={0o600})
    runtime = json_object(runtime_raw, runtime_manifest.name)
    if (runtime.get("controlPlaneSha") != binding["controlPlane"] or
            not isinstance(runtime.get("rollbackReleases"), dict) or
            any(component not in runtime["rollbackReleases"]
                for component in binding["components"])):
        raise Denied("runtime_manifest_binding")
    driver = Path(request["driver"]); wrapper = Path(request["wrapper"])
    bound_regular(driver, request["driverSha256"], modes={0o500, 0o600})
    bound_regular(wrapper, request["wrapperSha256"], modes={0o500, 0o600})
    successor = runtime_cache_head(request, journal, request["acceptanceSha256"],
                                   request["lockSha256"])
    authenticate_checkout(driver, request["driverSha256"], wrapper,
                          request["wrapperSha256"], successor or binding["controlPlane"])
    argv = [
        "/usr/bin/python3", "-B", str(driver), "finalize",
        "--release", binding["release"], "--target", binding["target"],
        "--control-plane", binding["controlPlane"],
        "--components", ",".join(binding["components"]),
        "--runtime-manifest", str(runtime_manifest),
        "--runtime-manifest-sha256", binding["runtimeManifestSha256"],
        "--transaction-root", str(root),
    ]
    argv.extend(authenticate_retirement(binding["generationRetirement"], lock))
    for name, flag in (("privateDataReconciliation", "--private-data-reconciliation"),
                       ("runtimeCacheReconciliation", "--runtime-cache-reconciliation")):
        argv.extend(optional_argument(request, name, flag))
    for name, flag in (("retirementSentinelClosure", "--retirement-sentinel-closure"),
                       ("controlPlaneSuccession", "--control-plane-succession")):
        item = binding.get(name)
        if item is not None:
            if (not isinstance(item, dict) or set(item) != {"manifest", "manifestSha256"} or
                    not SHA256.fullmatch(str(item.get("manifestSha256", "")))):
                raise Denied(f"journal_binding:{name}")
            path = absolute(item.get("manifest"), f"journal_binding:{name}")
            bound_regular(path, item["manifestSha256"], modes={0o600})
            argv.extend([flag, str(path), f"{flag}-sha256", item["manifestSha256"]])
    return {
        "schemaVersion": 1, "action": "finalize", "lockPath": str(lock),
        "transactionRoot": str(root), "driver": str(driver),
        "driverSha256": request["driverSha256"], "finalizeArgv": argv,
    }


def publish(request: dict[str, Any], value: dict[str, Any]) -> dict[str, Any]:
    output = Path(request["finalizeRequestOutput"])
    parent = output.parent
    try:
        parent_info = parent.lstat()
    except OSError as error:
        raise Denied("output_parent") from error
    if (parent.is_symlink() or not parent.is_dir() or
            (parent_info.st_uid, parent_info.st_gid, stat.S_IMODE(parent_info.st_mode)) !=
            (os.geteuid(), os.getegid(), 0o700)):
        raise Denied("output_parent_identity")
    raw = (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()
    try:
        fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                     getattr(os, "O_NOFOLLOW", 0), 0o600)
    except OSError as error:
        raise Denied("finalize_request_output") from error
    try:
        opened = os.fstat(fd)
        if (not stat.S_ISREG(opened.st_mode) or
                (opened.st_uid, opened.st_gid, stat.S_IMODE(opened.st_mode)) !=
                (os.geteuid(), os.getegid(), 0o600)):
            raise Denied("finalize_request_output_identity")
        written = 0
        while written < len(raw):
            written += os.write(fd, raw[written:])
        os.fsync(fd)
    finally:
        os.close(fd)
    directory = os.open(parent, os.O_RDONLY | os.O_DIRECTORY | getattr(os, "O_NOFOLLOW", 0))
    try:
        os.fsync(directory)
    finally:
        os.close(directory)
    readback, info = stable_regular(output, modes={0o600})
    if readback != raw:
        raise Denied("finalize_request_readback")
    return {
        "result": "FIXED_CURRENT_FINALIZE_REQUEST_MATERIALIZED", "path": str(output),
        "sha256": sha256(readback), "size": len(readback), "device": info.st_dev,
        "inode": info.st_ino, "mode": "0600",
    }


def publish_raw(output: Path, raw: bytes) -> dict[str, Any]:
    parent = output.parent
    try:
        parent_info = parent.lstat()
    except OSError as error:
        raise Denied("output_parent") from error
    if (parent.is_symlink() or not parent.is_dir() or
            (parent_info.st_uid, parent_info.st_gid, stat.S_IMODE(parent_info.st_mode)) !=
            (os.geteuid(), os.getegid(), 0o700)):
        raise Denied("output_parent_identity")
    try:
        fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                     getattr(os, "O_NOFOLLOW", 0), 0o600)
    except OSError as error:
        raise Denied("negative_journal_output") from error
    try:
        opened = os.fstat(fd)
        if (not stat.S_ISREG(opened.st_mode) or
                (opened.st_uid, opened.st_gid, stat.S_IMODE(opened.st_mode)) !=
                (os.geteuid(), os.getegid(), 0o600)):
            raise Denied("negative_journal_output_identity")
        written = 0
        while written < len(raw):
            written += os.write(fd, raw[written:])
        os.fsync(fd)
    finally:
        os.close(fd)
    directory = os.open(parent, os.O_RDONLY | os.O_DIRECTORY |
                        getattr(os, "O_NOFOLLOW", 0))
    try:
        os.fsync(directory)
    finally:
        os.close(directory)
    readback, info = stable_regular(output, modes={0o600})
    if readback != raw:
        raise Denied("negative_journal_readback")
    return {
        "path": str(output), "sha256": sha256(readback), "size": len(readback),
        "device": info.st_dev, "inode": info.st_ino, "mode": "0600",
    }



def continuation_argument(argv: list[str], flag: str) -> str:
    if argv.count(flag) != 1:
        raise Denied(f"continuation_prior_argv:{flag}")
    index = argv.index(flag)
    if index + 1 >= len(argv):
        raise Denied(f"continuation_prior_argv:{flag}")
    return argv[index + 1]


def meta_dbfirst_cache_inventory() -> list[dict[str, Any]]:
    return next_image_cache_inventory(
        META_DBFIRST_RELEASE, META_DBFIRST_INDEX_SHA256,
        META_DBFIRST_MANIFEST_SHA256)


def next_image_cache_inventory(
        release: str, index_sha256: str, manifest_sha256: str
) -> list[dict[str, Any]]:
    release_root = RELEASES_ROOT / release
    cache_root = release_root / "frontend-runtime/.next/cache"
    images_root = cache_root / "images"
    try:
        release_info = release_root.lstat()
        cache_info = cache_root.lstat()
        images_info = images_root.lstat()
    except OSError as error:
        raise Denied("continuation_cache_root") from error
    if (release_root.is_symlink() or cache_root.is_symlink() or images_root.is_symlink() or
            not release_root.is_dir() or not cache_root.is_dir() or not images_root.is_dir() or
            (release_info.st_uid, release_info.st_gid) != (os.geteuid(), os.getegid()) or
            any((info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)) !=
                (os.geteuid(), os.getegid(), 0o755)
                for info in (cache_info, images_info))):
        raise Denied("continuation_cache_root_identity")
    bound_regular(release_root / "index.sha256", index_sha256,
                  modes={0o644})
    bound_regular(release_root / "manifest.json", manifest_sha256,
                  modes={0o644})
    paths = [cache_root, *sorted(cache_root.rglob("*"),
                                 key=lambda item: item.relative_to(release_root).as_posix())]
    if not 2 <= len(paths) <= 256:
        raise Denied("continuation_cache_inventory")
    entries: list[dict[str, Any]] = []
    directory_identities: dict[Path, tuple[int, int, int, int, int]] = {}
    for path in paths:
        relative = path.relative_to(release_root).as_posix()
        try:
            info = path.lstat()
        except OSError as error:
            raise Denied("continuation_cache_entry") from error
        if stat.S_ISLNK(info.st_mode):
            raise Denied("continuation_cache_symlink")
        item: dict[str, Any] = {"path": relative, "mode": stat.S_IMODE(info.st_mode)}
        parts = relative.split("/")
        if stat.S_ISDIR(info.st_mode):
            if (item["mode"] != 0o755 or relative not in {
                    "frontend-runtime/.next/cache", "frontend-runtime/.next/cache/images"} and
                    (len(parts) != 5 or parts[:4] !=
                     ["frontend-runtime", ".next", "cache", "images"] or
                     not re.fullmatch(r"[A-Za-z0-9_-]{20,96}", parts[4]))):
                raise Denied("continuation_cache_directory")
            item["type"] = "directory"
            directory_identities[path] = (
                info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns)
        elif stat.S_ISREG(info.st_mode):
            if (item["mode"] != 0o644 or len(parts) != 6 or parts[:4] !=
                    ["frontend-runtime", ".next", "cache", "images"] or
                    not re.fullmatch(r"[A-Za-z0-9_-]{20,96}", parts[4]) or
                    not re.fullmatch(
                        r"[A-Za-z0-9._-]{20,240}\.(?:webp|png|jpeg)", parts[5]) or
                    info.st_nlink != 1):
                raise Denied("continuation_cache_file")
            raw, stable = stable_regular(path, modes={0o644})
            if stable.st_size > 10 * 1024 * 1024:
                raise Denied("continuation_cache_file_size")
            item.update(type="file", size=stable.st_size, sha256=sha256(raw))
        else:
            raise Denied("continuation_cache_entry_type")
        entries.append(item)
    for path, identity in directory_identities.items():
        current = path.lstat()
        observed = (current.st_dev, current.st_ino, current.st_size,
                    current.st_mtime_ns, current.st_ctime_ns)
        if observed != identity:
            raise Denied("continuation_cache_changed")
    return entries


def derive_initial_cache_manifest(
        request: dict[str, Any]
) -> tuple[bytes, dict[str, Any]]:
    root = Path(request["transactionRoot"])
    authenticate_root(root)
    journal_path = Path(request["transactionJournal"])
    acceptance = Path(request["acceptance"])
    lock = Path(request["lockPath"])
    if (journal_path != root / "transaction.v1.private.json" or
            acceptance != root / "acceptance.private.txt"):
        raise Denied("transaction_paths")
    journal_raw = bound_regular(
        journal_path, request["transactionJournalSha256"], modes={0o600})
    journal = json_object(journal_raw, journal_path.name)
    acceptance_raw = bound_regular(
        acceptance, request["acceptanceSha256"], modes={0o600})
    bound_regular(lock, request["lockSha256"], modes={0o600})
    binding = journal.get("binding")
    if (acceptance_raw != ACCEPTANCE or not isinstance(binding, dict) or
            binding.get("components") != ["api", "frontend"] or
            journal.get("state") != "AWAITING_ACCEPTANCE" or
            journal.get("saveCount") != 0 or
            journal.get("deployedMarkerCreated") is not False or
            journal.get("recoveryAction") is not None or
            journal.get("lockDigest") != request["lockSha256"] or
            binding.get("transactionRoot") != str(root) or
            not SHA40.fullmatch(str(binding.get("target", ""))) or
            not SHA40.fullmatch(str(binding.get("controlPlane", "")))):
        raise Denied("initial_cache_scope")
    retirement = binding.get("generationRetirement")
    if (not isinstance(retirement, dict) or
            not SHA256.fullmatch(str(retirement.get("intentSha256", "")))):
        raise Denied("initial_cache_retirement")
    release = binding.get("release")
    if not isinstance(release, str) or not release:
        raise Denied("initial_cache_release")
    release_root = RELEASES_ROOT / release
    index = release_root / "index.sha256"
    manifest = release_root / "manifest.json"
    index_raw, _ = stable_regular(index, modes={0o644})
    manifest_raw, _ = stable_regular(manifest, modes={0o644})
    driver = Path(request["driver"])
    wrapper = Path(request["wrapper"])
    bound_regular(driver, request["driverSha256"], modes={0o500, 0o600})
    bound_regular(wrapper, request["wrapperSha256"], modes={0o500, 0o600})
    head_result = subprocess.run(
        ["git", "-C", str(driver.parent.parent), "rev-parse", "HEAD"],
        capture_output=True, text=True, check=False)
    head = head_result.stdout.strip()
    if (head_result.returncode or not SHA40.fullmatch(head) or
            head == binding["controlPlane"]):
        raise Denied("initial_cache_successor")
    authenticate_checkout(
        driver, request["driverSha256"], wrapper, request["wrapperSha256"], head)
    authority_output = Path(request["acceptanceJournalOutput"])
    cache_output = Path(request["cacheManifestOutput"])
    finalize_output = Path(request["finalizeRequestOutput"])
    if (len({authority_output, cache_output, finalize_output}) != 3 or
            authority_output.parent != cache_output.parent or
            cache_output.parent != finalize_output.parent):
        raise Denied("initial_cache_output_scope")
    cache = {
        "schemaVersion": 1,
        "kind": RUNTIME_CACHE_KIND_V2,
        "cachePolicy": RUNTIME_CACHE_POLICY_V2,
        "releaseId": release,
        "targetCommit": binding["target"],
        "transactionRoot": str(root),
        "indexSha256": sha256(index_raw),
        "manifestSha256": sha256(manifest_raw),
        "runtimeManifestSha256": binding["runtimeManifestSha256"],
        "retirementIntentSha256": retirement["intentSha256"],
        "originalControlPlane": binding["controlPlane"],
        "continuationControlPlane": head,
        "continuationDriverSha256": request["driverSha256"],
        "acceptanceJournal": {
            "path": str(authority_output),
            "sha256": request["transactionJournalSha256"],
        },
        "acceptanceSha256": request["acceptanceSha256"],
        "lockSha256": request["lockSha256"],
        "cacheEntries": next_image_cache_inventory(
            release, sha256(index_raw), sha256(manifest_raw)),
    }
    return journal_raw, cache


def publish_initial_cache_finalize(request: dict[str, Any]) -> dict[str, Any]:
    journal_raw, cache = derive_initial_cache_manifest(request)
    journal_receipt = publish_raw(Path(request["acceptanceJournalOutput"]), journal_raw)
    cache_receipt = publish(
        {"finalizeRequestOutput": request["cacheManifestOutput"]}, cache)
    bound_request = dict(request)
    bound_request.pop("cacheManifestOutput")
    bound_request.pop("acceptanceJournalOutput")
    bound_request["optionalAuthorities"] = {
        "runtimeCacheReconciliation": {
            "path": cache_receipt["path"], "sha256": cache_receipt["sha256"],
        }
    }
    output = publish(bound_request, derive(bound_request))
    return {
        "result": "FIXED_CURRENT_FINALIZE_REQUEST_MATERIALIZED",
        "request": output,
        "cacheReconciliation": cache_receipt,
        "acceptanceJournalAuthority": journal_receipt,
    }


def meta_dbfirst_cache_manifest(
    request: dict[str, Any], journal: dict[str, Any], binding: dict[str, Any],
    original: list[str], successor_head: str,
) -> dict[str, Any]:
    if (binding.get("release") != META_DBFIRST_RELEASE or
            binding.get("target") != META_DBFIRST_TARGET or
            binding.get("controlPlane") != META_DBFIRST_ORIGINAL_CONTROL_PLANE or
            Path(request["transactionRoot"]) != META_DBFIRST_TRANSACTION or
            request["transactionJournalSha256"] != META_DBFIRST_NEGATIVE_JOURNAL_SHA256 or
            request["lockSha256"] != META_DBFIRST_LOCK_SHA256 or
            continuation_argument(original, "--generation-retirement-intent-sha256") !=
            META_DBFIRST_INTENT_SHA256 or
            any(flag in original for flag in (
                "--runtime-cache-reconciliation",
                "--runtime-cache-reconciliation-sha256"))):
        raise Denied("continuation_meta_dbfirst_scope")
    negative_journal_output = absolute(
        request.get("negativeJournalOutput"), "continuation_negative_journal_output")
    acceptance = META_DBFIRST_TRANSACTION / "acceptance.private.txt"
    bound_regular(acceptance, META_DBFIRST_ACCEPTANCE_SHA256, modes={0o600})
    return {
        "schemaVersion": 1,
        "kind": RUNTIME_CACHE_KIND,
        "releaseId": META_DBFIRST_RELEASE,
        "targetCommit": META_DBFIRST_TARGET,
        "transactionRoot": str(META_DBFIRST_TRANSACTION),
        "indexSha256": META_DBFIRST_INDEX_SHA256,
        "manifestSha256": META_DBFIRST_MANIFEST_SHA256,
        "retirementIntentSha256": META_DBFIRST_INTENT_SHA256,
        "originalControlPlane": binding["controlPlane"],
        "continuationControlPlane": successor_head,
        "continuationDriverSha256": request["driverSha256"],
        "negativeJournal": {
            "path": str(negative_journal_output),
            "sha256": request["transactionJournalSha256"],
        },
        "acceptanceSha256": META_DBFIRST_ACCEPTANCE_SHA256,
        "lockSha256": META_DBFIRST_LOCK_SHA256,
        "cacheEntries": meta_dbfirst_cache_inventory(),
    }


def derive_failed_finalize_continuation(
    request: dict[str, Any]
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Produce a new authenticated cache authority and recovery request.

    The existing first-finalize argv is the sole argument source; only the
    authenticated driver and cache binding can change.
    """
    root = Path(request["transactionRoot"])
    authenticate_root(root)
    journal_path = Path(request["transactionJournal"])
    lock_path = Path(request["lockPath"])
    if journal_path != root / "transaction.v1.private.json":
        raise Denied("continuation_journal_path")
    journal = json_object(bound_regular(
        journal_path, request["transactionJournalSha256"], modes={0o600}),
        journal_path.name)
    if (journal.get("state") != "FAILED" or
            journal.get("recoveryAction") != "finalize" or
            journal.get("saveCount") not in (0, 1) or
            journal.get("deployedMarkerCreated") is not False or
            journal.get("lockDigest") != request["lockSha256"]):
        raise Denied("continuation_journal_state")
    bound_regular(lock_path, request["lockSha256"], modes={0o600})
    prior_path = Path(request["priorRequest"])
    prior = json_object(bound_regular(
        prior_path, request["priorRequestSha256"], modes={0o600}), prior_path.name)
    prior_action = prior.get("action")
    base_keys = {
        "schemaVersion", "action", "lockPath", "transactionRoot",
        "driver", "driverSha256", "finalizeArgv",
    }
    binding = journal.get("binding")
    if not isinstance(binding, dict):
        raise Denied("continuation_journal_binding")
    meta_dbfirst_profile = binding.get("release") == META_DBFIRST_RELEASE
    initial_meta_dbfirst_cache = (
        prior_action == "finalize" and
        meta_dbfirst_profile and
        "--runtime-cache-reconciliation" not in prior.get("finalizeArgv", []) and
        "--runtime-cache-reconciliation-sha256" not in prior.get("finalizeArgv", [])
    )
    if prior_action == "finalize":
        expected_keys = base_keys
        ordinal, required_save = 2, 0
        evidence_predicate = (b"runtime_cache_reconciliation_binding"
                              if initial_meta_dbfirst_cache else
                              b"control_plane_succession_script:deploy")
    elif prior_action == "finalize_continuation":
        expected_keys = base_keys | {"attemptOrdinal", "evidenceOutputs", "recovery"}
        # A post-save continuation is the direct ordinal-02 successor.  ED74
        # retains its exact historical predicate; 41D admits only the closed
        # final-dump identity family emitted after the durable save checkpoint.
        if prior.get("attemptOrdinal") != 2:
            raise Denied("continuation_prior_ordinal")
        ordinal, required_save = 3, 1
        evidence_predicate = b"final_dump_field:worker:logs"
        recovery = prior.get("recovery")
        if (not isinstance(recovery, dict) or
                set(recovery) != {
                    "priorRequest", "priorRequestSha256", "negativeJournal",
                    "negativeJournalSha256", "priorEvidence",
                } or
                recovery.get("negativeJournal") != str(journal_path)):
            raise Denied("continuation_prior_chain")
    else:
        raise Denied("continuation_prior_request")
    if (set(prior) != expected_keys or prior.get("schemaVersion") != 1 or
            prior.get("transactionRoot") != str(root) or
            prior.get("lockPath") != str(lock_path) or
            journal.get("saveCount") != required_save):
        raise Denied("continuation_prior_request")
    original = prior["finalizeArgv"]
    if (not isinstance(original, list) or len(original) < 5 or
            original[:4] != ["/usr/bin/python3", "-B", prior["driver"], "finalize"]):
        raise Denied("continuation_prior_argv")
    expected = {
        "--release": binding.get("release"),
        "--target": binding.get("target"),
        "--control-plane": binding.get("controlPlane"),
        "--components": ",".join(binding.get("components", [])),
        "--transaction-root": str(root),
    }
    if any(continuation_argument(original, flag) != value
           for flag, value in expected.items()):
        raise Denied("continuation_prior_scope")
    evidence: dict[str, dict[str, str]] = {}
    for name in ("stdout", "stderr", "exit"):
        path = (root / f"fixed-current-finalize-continuation.{name}.private.txt"
                if ordinal == 2 else root /
                f"fixed-current-finalize-continuation-attempt-02.{name}.private.txt")
        if ordinal == 3:
            prior_output = prior.get("evidenceOutputs")
            if not isinstance(prior_output, dict) or (
                    set(prior_output) != {"stdout", "stderr", "exit"} or
                    prior_output.get(name) != str(path)):
                raise Denied("continuation_prior_evidence_scope")
        raw, _ = stable_regular(path, modes={0o600})
        evidence[name] = {"path": str(path), "sha256": sha256(raw)}
    stderr, _ = stable_regular(Path(evidence["stderr"]["path"]), modes={0o600})
    exit_bytes, _ = stable_regular(Path(evidence["exit"]["path"]), modes={0o600})
    if meta_dbfirst_profile and ordinal == 3:
        evidence_matches = stderr in {
            b"DEPLOY_DENY:final_dump_field:api:logs\n",
            b"DEPLOY_DENY:final_dump_field:frontend:logs\n",
            b"DEPLOY_DENY:final_dump_field:worker:logs\n",
        }
    else:
        evidence_matches = evidence_predicate in stderr
    if exit_bytes != b"2\n" or not evidence_matches:
        raise Denied("continuation_prior_failure_evidence")

    driver = Path(request["driver"])
    wrapper = Path(request["wrapper"])
    bound_regular(driver, request["driverSha256"], modes={0o500, 0o600})
    bound_regular(wrapper, request["wrapperSha256"], modes={0o500, 0o600})
    repo = driver.parent.parent
    result = subprocess.run(
        ["git", "-C", str(repo), "rev-parse", "HEAD"],
        capture_output=True, text=True, check=False,
    )
    if result.returncode or not SHA40.fullmatch(result.stdout.strip()):
        raise Denied("continuation_successor_head")
    head = result.stdout.strip()
    authenticate_checkout(
        driver, request["driverSha256"], wrapper, request["wrapperSha256"], head)
    if initial_meta_dbfirst_cache:
        if (head == binding.get("controlPlane") or
                request["driverSha256"] == prior["driverSha256"]):
            raise Denied("continuation_successor_not_changed")
        historic_driver = subprocess.run(
            ["git", "-C", str(repo), "show",
             f"{binding['controlPlane']}:scripts/converta-deploy.py"],
            capture_output=True, check=False,
        )
        if (historic_driver.returncode or
                sha256(historic_driver.stdout) != prior["driverSha256"]):
            raise Denied("continuation_original_driver")
        new_cache = meta_dbfirst_cache_manifest(request, journal, binding, original, head)
        old_cache_path = None
    else:
        old_cache_path = Path(continuation_argument(
            original, "--runtime-cache-reconciliation"))
        old_cache_sha = continuation_argument(
            original, "--runtime-cache-reconciliation-sha256")
        historic = json_object(bound_regular(
            old_cache_path, old_cache_sha, modes={0o600}), old_cache_path.name)
        if (historic.get("kind") != RUNTIME_CACHE_KIND or
                historic.get("releaseId") != binding.get("release") or
                historic.get("targetCommit") != binding.get("target") or
                historic.get("transactionRoot") != str(root) or
                historic.get("originalControlPlane") != binding.get("controlPlane") or
                historic.get("continuationDriverSha256") != prior.get("driverSha256")):
            raise Denied("continuation_original_cache_scope")
        if (head == historic.get("continuationControlPlane") or
                request["driverSha256"] == prior["driverSha256"]):
            raise Denied("continuation_successor_not_changed")
        new_cache = dict(historic)
        new_cache["continuationControlPlane"] = head
        new_cache["continuationDriverSha256"] = request["driverSha256"]
    cache_output = Path(request["cacheManifestOutput"])
    request_output = Path(request["finalizeRequestOutput"])
    negative_output = (Path(request["negativeJournalOutput"])
                       if initial_meta_dbfirst_cache else None)
    if (cache_output == request_output or
            (old_cache_path is not None and cache_output == old_cache_path) or
            (negative_output is not None and
             (negative_output in {cache_output, request_output} or
              negative_output.parent != request_output.parent)) or
            cache_output.parent != request_output.parent):
        raise Denied("continuation_output_scope")
    cache_raw = (
        json.dumps(new_cache, sort_keys=True, separators=(",", ":")) + "\n"
    ).encode()
    argv = list(original)
    argv[2] = str(driver)
    if initial_meta_dbfirst_cache:
        argv.extend([
            "--runtime-cache-reconciliation", str(cache_output),
            "--runtime-cache-reconciliation-sha256", sha256(cache_raw),
        ])
    else:
        cache_index = argv.index("--runtime-cache-reconciliation")
        cache_sha_index = argv.index("--runtime-cache-reconciliation-sha256")
        argv[cache_index + 1] = str(cache_output)
        argv[cache_sha_index + 1] = sha256(cache_raw)
    outputs = {
        name: str(root / f"fixed-current-finalize-continuation-attempt-{ordinal:02d}.{name}.private.txt")
        for name in ("stdout", "stderr", "exit")
    }
    next_request = {
        "schemaVersion": 1, "action": "finalize_continuation",
        "attemptOrdinal": ordinal, "lockPath": str(lock_path),
        "transactionRoot": str(root), "driver": str(driver),
        "driverSha256": request["driverSha256"],
        "finalizeArgv": argv, "evidenceOutputs": outputs,
        "recovery": {
            "priorRequest": str(prior_path),
            "priorRequestSha256": request["priorRequestSha256"],
            "negativeJournal": str(journal_path),
            "negativeJournalSha256": request["transactionJournalSha256"],
            "priorEvidence": evidence,
        },
    }
    return new_cache, next_request


def publish_failed_finalize_continuation(request: dict[str, Any]) -> dict[str, Any]:
    cache, next_request = derive_failed_finalize_continuation(request)
    journal_receipt = None
    if "negativeJournalOutput" in request:
        raw = bound_regular(
            Path(request["transactionJournal"]), request["transactionJournalSha256"],
            modes={0o600})
        journal_receipt = publish_raw(Path(request["negativeJournalOutput"]), raw)
    # Writes are exclusive and immutable. If a later publication fails, preserve
    # every earlier artifact as forensic evidence, never overwrite or retry.
    cache_receipt = publish(
        {"finalizeRequestOutput": request["cacheManifestOutput"]}, cache)
    output = publish(request, next_request)
    result = {
        "result": "FIXED_CURRENT_FINALIZE_CONTINUATION_REQUEST_MATERIALIZED",
        "request": output, "cacheReconciliation": cache_receipt,
    }
    if journal_receipt is not None:
        result["negativeJournalAuthority"] = journal_receipt
    return result

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", type=Path, required=True)
    parser.add_argument("--request-sha256", required=True)
    args = parser.parse_args()
    try:
        request = load_request(args.request, args.request_sha256)
        receipt = (publish_failed_finalize_continuation(request)
                   if request["action"] == "materialize_fixed_current_finalize_continuation"
                   else publish_initial_cache_finalize(request)
                   if "cacheManifestOutput" in request
                   else publish(request, derive(request)))
        print(json.dumps(receipt, sort_keys=True, separators=(",", ":")))
        return 0
    except (Denied, OSError, ValueError, subprocess.SubprocessError) as error:
        print(f"FIXED_CURRENT_FINALIZE_REQUEST_DENY:{error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
