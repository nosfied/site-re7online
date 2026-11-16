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
        if set(value) != required_continuation or value.get("schemaVersion") != 1:
            raise Denied("continuation_request_schema")
        for name in ("transactionRoot", "transactionJournal", "priorRequest",
                     "lockPath", "driver", "wrapper", "cacheManifestOutput",
                     "finalizeRequestOutput"):
            absolute(value.get(name), f"continuation_request_path:{name}")
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
    if (set(value) != required or value.get("schemaVersion") != 1 or
            value.get("action") != "materialize_fixed_current_finalize_request"):
        raise Denied("request_schema")
    for name in ("transactionRoot", "transactionJournal", "acceptance", "lockPath",
                 "driver", "wrapper", "finalizeRequestOutput"):
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
    if (manifest.get("schemaVersion") != 1 or manifest.get("kind") != RUNTIME_CACHE_KIND or
            authority_names not in ({"acceptanceJournal"}, {"negativeJournal"})):
        raise Denied("runtime_cache_schema")
    bound = journal["binding"]
    retirement = bound["generationRetirement"]
    if (manifest.get("releaseId") != bound["release"] or
            manifest.get("targetCommit") != bound["target"] or
            manifest.get("transactionRoot") != bound["transactionRoot"] or
            manifest.get("originalControlPlane") != bound["controlPlane"] or
            manifest.get("retirementIntentSha256") != retirement["intentSha256"] or
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


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", type=Path, required=True)
    parser.add_argument("--request-sha256", required=True)
    args = parser.parse_args()
    try:
        request = load_request(args.request, args.request_sha256)
        print(json.dumps(publish(request, derive(request)), sort_keys=True,
                         separators=(",", ":")))
        return 0
    except (Denied, OSError, ValueError, subprocess.SubprocessError) as error:
        print(f"FIXED_CURRENT_FINALIZE_REQUEST_DENY:{error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
