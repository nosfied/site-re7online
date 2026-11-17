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



def continuation_argument(argv: list[str], flag: str) -> str:
    if argv.count(flag) != 1:
        raise Denied(f"continuation_prior_argv:{flag}")
    index = argv.index(flag)
    if index + 1 >= len(argv):
        raise Denied(f"continuation_prior_argv:{flag}")
    return argv[index + 1]


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
    if prior_action == "finalize":
        expected_keys = base_keys
        ordinal, required_save = 2, 0
        evidence_predicate = b"control_plane_succession_script:deploy"
    elif prior_action == "finalize_continuation":
        expected_keys = base_keys | {"attemptOrdinal", "evidenceOutputs", "recovery"}
        # ED74 post-save continuation is the direct ordinal-02 successor.
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
    binding = journal.get("binding")
    if not isinstance(binding, dict):
        raise Denied("continuation_journal_binding")
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
    if exit_bytes != b"2\n" or evidence_predicate not in stderr:
        raise Denied("continuation_prior_failure_evidence")

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
    if (head == historic.get("continuationControlPlane") or
            request["driverSha256"] == prior["driverSha256"]):
        raise Denied("continuation_successor_not_changed")
    new_cache = dict(historic)
    new_cache["continuationControlPlane"] = head
    new_cache["continuationDriverSha256"] = request["driverSha256"]
    cache_output = Path(request["cacheManifestOutput"])
    request_output = Path(request["finalizeRequestOutput"])
    if (cache_output == request_output or
            cache_output == old_cache_path or
            cache_output.parent != request_output.parent):
        raise Denied("continuation_output_scope")
    cache_raw = (
        json.dumps(new_cache, sort_keys=True, separators=(",", ":")) + "\n"
    ).encode()
    argv = list(original)
    argv[2] = str(driver)
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
    # Both writes are exclusive and immutable. If the second fails, preserve
    # the first artifact as forensic evidence, never overwrite or retry.
    cache_receipt = publish(
        {"finalizeRequestOutput": request["cacheManifestOutput"]}, cache)
    output = publish(request, next_request)
    return {
        "result": "FIXED_CURRENT_FINALIZE_CONTINUATION_REQUEST_MATERIALIZED",
        "request": output, "cacheReconciliation": cache_receipt,
    }

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", type=Path, required=True)
    parser.add_argument("--request-sha256", required=True)
    args = parser.parse_args()
    try:
        request = load_request(args.request, args.request_sha256)
        receipt = (publish_failed_finalize_continuation(request)
                   if request["action"] == "materialize_fixed_current_finalize_continuation"
                   else publish(request, derive(request)))
        print(json.dumps(receipt, sort_keys=True, separators=(",", ":")))
        return 0
    except (Denied, OSError, ValueError, subprocess.SubprocessError) as error:
        print(f"FIXED_CURRENT_FINALIZE_REQUEST_DENY:{error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
