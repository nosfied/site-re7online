#!/usr/bin/env python3
"""Canonical, fail-closed capacity recovery control plane.

The tool deliberately keeps npm-cache maintenance separate from generation
retirement.  It never discovers destructive paths during execute: audit emits a
closed plan, prepare re-authenticates it, and execute consumes only an exact
intent plus an exact AUTHORIZE_ONCE document.
"""

from __future__ import annotations

import argparse
import fcntl
import grp
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import stat
import subprocess
import sys
from typing import Any, Iterable

SHA256 = re.compile(r"^[0-9a-f]{64}$")
NPM_CACHE = Path("/home/deploy/.npm/_cacache")
NPM_PARENT = Path("/home/deploy/.npm")
LITERAL_RM = ("/usr/bin/rm", "-r", "--")
CLASSES = {"NPM_CACHE_MAINTENANCE", "DERIVED_OUTPUT_RUNTIME"}
AUDIT_REQUEST_KEYS = {
    "schemaVersion", "kind", "minimumRecoveryBytes", "targetAvailableBytes",
    "rootPolicy", "operationalState", "candidates",
}
COMMON_CANDIDATE_KEYS = {"class", "path"}
NPM_CANDIDATE_KEYS = COMMON_CANDIDATE_KEYS | {"expectedDeployGroupPrincipals"}
OUTPUT_CANDIDATE_KEYS = COMMON_CANDIDATE_KEYS | {
    "runtimeRelativePath", "releaseRoot", "contract", "package", "manifest", "index",
}
OPERATIONAL_KEYS = {
    "schemaVersion", "currentPaths", "pm2LivePaths", "pm2DumpPaths",
    "openTransactionPaths", "protectedGraphPaths", "deploymentLock", "writerLock",
}


class Denied(RuntimeError):
    pass


def deny(predicate: str) -> None:
    raise Denied(predicate)


def canonical(value: Any) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()


def digest_bytes(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def valid_sha(value: Any) -> bool:
    return isinstance(value, str) and SHA256.fullmatch(value) is not None


def normalized_absolute(value: Any, predicate: str) -> Path:
    if not isinstance(value, str):
        deny(predicate)
    path = Path(value)
    if (not path.is_absolute() or ".." in path.parts or
            Path(os.path.normpath(str(path))) != path or
            any(ord(character) < 32 for character in str(path))):
        deny(predicate)
    return path


def stat_identity(info: os.stat_result) -> dict[str, Any]:
    return {
        "device": info.st_dev, "inode": info.st_ino, "uid": info.st_uid,
        "gid": info.st_gid, "mode": f"0{stat.S_IMODE(info.st_mode):03o}",
        "type": ("directory" if stat.S_ISDIR(info.st_mode) else
                 "regular" if stat.S_ISREG(info.st_mode) else
                 "symlink" if stat.S_ISLNK(info.st_mode) else "other"),
        "size": info.st_size, "mtimeNs": info.st_mtime_ns, "ctimeNs": info.st_ctime_ns,
    }


def stable_regular(path: Path, expected_sha: str, *, private: bool = True,
                   allowed_modes: set[int] | None = None) -> tuple[bytes, dict[str, Any]]:
    if not valid_sha(expected_sha):
        deny(f"FILE_SHA_SCHEMA:{path.name}")
    try:
        before = path.lstat()
        if path.is_symlink() or not stat.S_ISREG(before.st_mode):
            deny(f"FILE_TYPE:{path}")
        mode = stat.S_IMODE(before.st_mode)
        if allowed_modes is not None and (mode not in allowed_modes or
                                          before.st_uid != os.geteuid() or before.st_gid != os.getegid()):
            deny(f"FILE_MODE_IDENTITY:{path}")
        if private and allowed_modes is None and (mode & 0o077 or before.st_uid != os.geteuid() or before.st_gid != os.getegid()):
            deny(f"FILE_PRIVATE_IDENTITY:{path}")
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
        try:
            opened = os.fstat(fd)
            blocks: list[bytes] = []
            while block := os.read(fd, 1024 * 1024):
                blocks.append(block)
            after = os.fstat(fd)
        finally:
            os.close(fd)
        current = path.lstat()
    except OSError:
        deny(f"FILE_READ:{path}")
    identities = [(item.st_dev, item.st_ino, item.st_mode, item.st_size,
                   item.st_mtime_ns, item.st_ctime_ns) for item in (before, opened, after, current)]
    if len(set(identities)) != 1:
        deny(f"FILE_CHANGED:{path}")
    raw = b"".join(blocks)
    if digest_bytes(raw) != expected_sha:
        deny(f"FILE_SHA256:{path}")
    return raw, stat_identity(current)


def object_json(raw: bytes, predicate: str) -> dict[str, Any]:
    try:
        value = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError):
        deny(predicate)
    if not isinstance(value, dict):
        deny(predicate)
    return value


def write_exclusive(path: Path, raw: bytes, mode: int = 0o600) -> None:
    if not path.is_absolute() or path.parent.is_symlink():
        deny(f"OUTPUT_PATH:{path}")
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    try:
        os.write(fd, raw)
        os.fsync(fd)
    finally:
        os.close(fd)
    directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def physical_usage(paths: Iterable[Path]) -> dict[str, dict[str, int]]:
    """Count allocated blocks and inodes once, including hard links only once."""
    seen: set[tuple[int, int]] = set()
    result: dict[str, dict[str, int]] = {}
    for root in paths:
        allocated = 0
        inodes = 0
        stack = [root]
        while stack:
            path = stack.pop()
            try:
                info = path.lstat()
            except OSError:
                deny(f"PATH_READ:{path}")
            key = (info.st_dev, info.st_ino)
            if key not in seen:
                seen.add(key)
                allocated += info.st_blocks * 512
                inodes += 1
            if stat.S_ISDIR(info.st_mode) and not stat.S_ISLNK(info.st_mode):
                try:
                    with os.scandir(path) as entries:
                        stack.extend(Path(entry.path) for entry in entries)
                except OSError:
                    deny(f"PATH_WALK:{path}")
        result[str(root)] = {"allocatedBytes": allocated, "inodes": inodes}
    return result


def _proc_targets() -> tuple[list[tuple[int, str, str]], list[dict[str, Any]], bool]:
    targets: list[tuple[int, str, str]] = []
    writers: list[dict[str, Any]] = []
    complete = True
    for proc in Path("/proc").iterdir():
        if not proc.name.isdigit() or int(proc.name) == os.getpid():
            continue
        pid = int(proc.name)
        try:
            command_parts = (proc / "cmdline").read_bytes().split(b"\0")
            command = " ".join(item.decode(errors="replace") for item in command_parts if item)
            executable = Path(command_parts[0].decode(errors="replace")).name if command_parts and command_parts[0] else ""
            if executable in {"npm", "npx"} or "next build" in command or ("converta-release.py" in command and " build" in command):
                writers.append({"pid": pid, "commandSha256": digest_bytes(command.encode())})
            for leaf in ("cwd", "root", "exe"):
                try:
                    targets.append((pid, leaf, os.path.realpath(proc / leaf)))
                except OSError:
                    pass
            try:
                for fd in (proc / "fd").iterdir():
                    try:
                        targets.append((pid, f"fd/{fd.name}", os.path.realpath(fd)))
                    except OSError:
                        pass
            except OSError:
                pass
            try:
                for line in (proc / "maps").read_text(errors="replace").splitlines():
                    if "/" in line:
                        targets.append((pid, "maps", line.split(None, 5)[-1]))
            except OSError:
                pass
        except PermissionError:
            complete = False
        except FileNotFoundError:
            continue
    return targets, writers, complete


def path_overlap(left: str, right: str) -> bool:
    try:
        common = os.path.commonpath((os.path.normpath(left), os.path.normpath(right)))
    except ValueError:
        return False
    return common in {os.path.normpath(left), os.path.normpath(right)}


def deploy_identity() -> tuple[int, int]:
    try:
        user = pwd.getpwnam("deploy")
        group = grp.getgrnam("deploy")
    except KeyError:
        deny("DEPLOY_IDENTITY_MISSING")
    if user.pw_gid != group.gr_gid:
        deny("DEPLOY_PRIMARY_GROUP")
    return user.pw_uid, group.gr_gid


def deploy_group_principals() -> list[str]:
    _, gid = deploy_identity()
    group = grp.getgrgid(gid)
    members = set(group.gr_mem)
    members.update(entry.pw_name for entry in pwd.getpwall() if entry.pw_gid == gid)
    return sorted(members)


def physical_directory(path: Path, predicate: str) -> os.stat_result:
    try:
        info = path.lstat()
    except OSError:
        deny(predicate)
    if path.is_symlink() or not stat.S_ISDIR(info.st_mode) or path.resolve(strict=True) != path:
        deny(predicate)
    return info


def validate_operational(raw: bytes) -> dict[str, Any]:
    value = object_json(raw, "OPERATIONAL_STATE_JSON")
    if set(value) != OPERATIONAL_KEYS or value.get("schemaVersion") != 1:
        deny("OPERATIONAL_STATE_SCHEMA")
    for key in ("currentPaths", "pm2LivePaths", "pm2DumpPaths", "openTransactionPaths", "protectedGraphPaths"):
        items = value.get(key)
        if not isinstance(items, list) or any(not isinstance(item, str) for item in items):
            deny(f"OPERATIONAL_STATE_{key}")
        value[key] = [str(normalized_absolute(item, f"OPERATIONAL_STATE_{key}")) for item in items]
    for key in ("deploymentLock", "writerLock"):
        value[key] = str(normalized_absolute(value.get(key), f"OPERATIONAL_STATE_{key}"))
    return value


def load_binding(value: Any, label: str) -> tuple[Path, str, bytes, dict[str, Any]]:
    if not isinstance(value, dict) or set(value) != {"path", "sha256"}:
        deny(f"{label}_BINDING")
    path = normalized_absolute(value.get("path"), f"{label}_PATH")
    expected = value.get("sha256")
    raw, _ = stable_regular(path, expected)
    return path, expected, raw, object_json(raw, f"{label}_JSON")


def root_policy(value: Any) -> tuple[dict[str, Any], Path, str]:
    path, expected, _, policy = load_binding(value, "ROOT_POLICY")
    if set(policy) != {"schemaVersion", "canonicalRoots"} or policy.get("schemaVersion") != 1:
        deny("ROOT_POLICY_SCHEMA")
    roots = policy.get("canonicalRoots")
    if not isinstance(roots, dict) or "outputs" not in roots:
        deny("ROOT_POLICY_OUTPUTS")
    output = roots["outputs"]
    if (not isinstance(output, dict) or set(output) != {"path", "ownerUid", "groupGid", "allowedModes"} or
            not isinstance(output.get("allowedModes"), list)):
        deny("ROOT_POLICY_OUTPUTS")
    return policy, path, expected


def validate_lock_free(path: Path) -> dict[str, Any]:
    try:
        before = path.lstat()
        if (path.is_symlink() or not stat.S_ISREG(before.st_mode) or
                stat.S_IMODE(before.st_mode) != 0o600 or
                before.st_uid != os.geteuid() or before.st_gid != os.getegid()):
            deny(f"LOCK_IDENTITY:{path}")
        fd = os.open(path, os.O_RDWR | os.O_NOFOLLOW)
        opened = os.fstat(fd)
        if (before.st_dev, before.st_ino) != (opened.st_dev, opened.st_ino):
            deny(f"LOCK_CHANGED:{path}")
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            fcntl.flock(fd, fcntl.LOCK_UN)
        except BlockingIOError:
            deny(f"LOCK_BUSY:{path}")
        finally:
            os.close(fd)
    except OSError:
        deny(f"LOCK_OPEN:{path}")
    return stat_identity(before)


def authenticate_npm(candidate: dict[str, Any], process_data: tuple[list[tuple[int, str, str]], list[dict[str, Any]], bool]) -> dict[str, Any]:
    if set(candidate) != NPM_CANDIDATE_KEYS:
        deny("NPM_CACHE_SCHEMA")
    path = normalized_absolute(candidate.get("path"), "NPM_CACHE_PATH")
    if path != NPM_CACHE or path.parent != NPM_PARENT:
        deny("NPM_CACHE_PATH")
    uid, gid = deploy_identity()
    parent = physical_directory(NPM_PARENT, "NPM_CACHE_PARENT")
    root = physical_directory(path, "NPM_CACHE_IDENTITY")
    if (parent.st_uid, parent.st_gid, stat.S_IMODE(parent.st_mode)) != (uid, gid, 0o775):
        deny("NPM_CACHE_PARENT_IDENTITY")
    if (root.st_uid, root.st_gid) != (uid, gid):
        deny("NPM_CACHE_OWNER")
    expected_principals = candidate.get("expectedDeployGroupPrincipals")
    if (not isinstance(expected_principals, list) or not expected_principals or
            any(not isinstance(item, str) or not item for item in expected_principals) or
            expected_principals != sorted(set(expected_principals))):
        deny("NPM_CACHE_GROUP_PLAN")
    actual_principals = deploy_group_principals()
    if actual_principals != expected_principals:
        deny("NPM_CACHE_GROUP_PRINCIPAL_UNEXPECTED")
    targets, writers, complete = process_data
    if writers:
        deny("NPM_OR_BUILD_ACTIVE")
    references = [{"pid": pid, "source": source} for pid, source, target in targets
                  if path_overlap(str(path), target)]
    if references:
        deny("NPM_CACHE_REFERENCED")
    if not complete:
        deny("PROCESS_REFERENCE_SCAN_INCOMPLETE")
    return {"class": candidate["class"], "path": str(path),
            "identity": stat_identity(root), "parentIdentity": stat_identity(parent),
            "deployGroupPrincipals": actual_principals, "references": []}


def artifact_for(contract: dict[str, Any], path: Path, cls: str) -> dict[str, Any]:
    matches = [item for item in contract.get("artifacts", [])
               if isinstance(item, dict) and item.get("path") == str(path) and item.get("class") == cls]
    if len(matches) != 1:
        deny(f"CONTRACT_ARTIFACT:{cls}:{path}")
    return matches[0]


def _entry_mode(entry: dict[str, Any]) -> int:
    value = entry.get("mode")
    if isinstance(value, int):
        return value
    if isinstance(value, str) and re.fullmatch(r"0[0-7]{3}", value):
        return int(value, 8)
    deny("INDEX_MODE")


def compare_index(runtime: Path, release_root: Path, relative: str,
                  index: dict[str, Any], allowed_release_extras: set[str]) -> dict[str, Any]:
    entries = index.get("entries")
    if not isinstance(entries, list):
        deny("INDEX_ENTRIES")
    selected: dict[str, dict[str, Any]] = {}
    for entry in entries:
        if not isinstance(entry, dict) or not isinstance(entry.get("path"), str):
            deny("INDEX_ENTRY")
        name = entry["path"]
        if name == relative or name.startswith(relative + "/"):
            selected[name] = entry
    if relative not in selected:
        deny("INDEX_RUNTIME_ROOT")
    errors: list[str] = []
    checked_files = 0
    for name, entry in selected.items():
        suffix = Path(name).relative_to(relative)
        for label, base in (("output", runtime), ("release", release_root / relative)):
            target = base / suffix
            try:
                info = target.lstat()
            except OSError:
                errors.append(f"{label}:missing:{name}")
                continue
            actual_type = "directory" if stat.S_ISDIR(info.st_mode) else "file" if stat.S_ISREG(info.st_mode) else "other"
            if actual_type != entry.get("type") or stat.S_IMODE(info.st_mode) != _entry_mode(entry):
                errors.append(f"{label}:identity:{name}")
                continue
            if actual_type == "file":
                checked_files += 1
                if info.st_size != entry.get("size") or sha256(target) != entry.get("sha256"):
                    errors.append(f"{label}:content:{name}")
    expected_suffixes = {Path(name).relative_to(relative).as_posix() for name in selected}
    expected_suffixes.discard(".")
    for label, base in (("output", runtime), ("release", release_root / relative)):
        observed = set()
        for item in base.rglob("*"):
            suffix = item.relative_to(base).as_posix()
            if label == "release" and any(suffix == allowed or suffix.startswith(allowed + "/")
                                           for allowed in allowed_release_extras):
                continue
            observed.add(suffix)
        if observed != expected_suffixes:
            errors.append(f"{label}:entry_set")
    if errors:
        deny("DERIVED_OUTPUT_EQUIVALENCE_INCOMPLETE:" + errors[0])
    return {"indexEntryCount": len(selected), "checkedFileObservations": checked_files,
            "allowedReleaseExtras": sorted(allowed_release_extras)}


def authenticate_output(candidate: dict[str, Any], policy: dict[str, Any], operational: dict[str, Any],
                        process_data: tuple[list[tuple[int, str, str]], list[dict[str, Any]], bool]) -> dict[str, Any]:
    if set(candidate) != OUTPUT_CANDIDATE_KEYS:
        deny("DERIVED_OUTPUT_SCHEMA")
    path = normalized_absolute(candidate.get("path"), "DERIVED_OUTPUT_PATH")
    relative = candidate.get("runtimeRelativePath")
    if relative not in {"api-runtime", "frontend-runtime"}:
        deny("DERIVED_OUTPUT_RUNTIME_RELATIVE")
    output_def = policy["canonicalRoots"]["outputs"]
    output_root = Path(output_def["path"])
    if path == output_root or output_root not in path.parents:
        deny("DERIVED_OUTPUT_OUTSIDE_ROOT")
    current = path
    while current != output_root:
        info = physical_directory(current, "DERIVED_OUTPUT_ANCESTOR")
        if (info.st_uid, info.st_gid) != (output_def["ownerUid"], output_def["groupGid"]) or stat.S_IMODE(info.st_mode) & 0o022:
            deny("DERIVED_OUTPUT_ANCESTOR")
        current = current.parent
    output_root_info = physical_directory(output_root, "DERIVED_OUTPUT_ROOT")
    if ((output_root_info.st_uid, output_root_info.st_gid) !=
            (output_def["ownerUid"], output_def["groupGid"]) or
            f"0{stat.S_IMODE(output_root_info.st_mode):03o}" not in output_def["allowedModes"] or
            stat.S_IMODE(output_root_info.st_mode) & 0o022):
        deny("DERIVED_OUTPUT_ROOT_IDENTITY")
    references = (operational["currentPaths"] + operational["pm2LivePaths"] +
                  operational["pm2DumpPaths"] + operational["openTransactionPaths"] +
                  operational["protectedGraphPaths"])
    if any(path_overlap(str(path), item) for item in references):
        deny("DERIVED_OUTPUT_REFERENCED_OR_PROTECTED")
    targets, _, complete = process_data
    if any(path_overlap(str(path), target) for _, _, target in targets):
        deny("DERIVED_OUTPUT_PROCESS_REFERENCE")
    if not complete:
        deny("PROCESS_REFERENCE_SCAN_INCOMPLETE")
    bindings = {}
    for label in ("contract", "package", "manifest", "index"):
        item = candidate[label]
        if not isinstance(item, dict) or set(item) != {"path", "sha256"}:
            deny(f"DERIVED_OUTPUT_{label.upper()}_BINDING")
        item_path = normalized_absolute(item.get("path"), f"DERIVED_OUTPUT_{label.upper()}_PATH")
        modes = {0o600} if label == "contract" else {0o600, 0o644}
        raw, identity = stable_regular(item_path, item.get("sha256"), allowed_modes=modes)
        bindings[label] = (item_path, raw, identity)
    contract = object_json(bindings["contract"][1], "DERIVED_OUTPUT_CONTRACT_JSON")
    manifest = object_json(bindings["manifest"][1], "DERIVED_OUTPUT_MANIFEST_JSON")
    index = object_json(bindings["index"][1], "DERIVED_OUTPUT_INDEX_JSON")
    release_root = normalized_absolute(candidate.get("releaseRoot"), "DERIVED_OUTPUT_RELEASE_ROOT")
    physical_directory(release_root, "DERIVED_OUTPUT_RELEASE_ROOT")
    output_artifact = artifact_for(contract, path, "DERIVED_OUTPUT_RUNTIME")
    release_artifact = artifact_for(contract, release_root, "RELEASE_RUNTIME")
    package_artifact = artifact_for(contract, bindings["package"][0], "PACKAGE_PRESERVE")
    manifest_artifact = artifact_for(contract, bindings["manifest"][0], "PACKAGE_PRESERVE")
    index_artifact = artifact_for(contract, bindings["index"][0], "PACKAGE_PRESERVE")
    release_id = contract.get("releaseId")
    target = contract.get("targetCommit")
    linked_artifacts = (output_artifact, release_artifact, package_artifact,
                        manifest_artifact, index_artifact)
    if (not isinstance(release_id, str) or not isinstance(target, str) or
            output_artifact.get("releaseId") != release_id or release_artifact.get("releaseId") != release_id or
            package_artifact.get("releaseId") != release_id or
            manifest_artifact.get("releaseId") != release_id or index_artifact.get("releaseId") != release_id):
        deny("DERIVED_OUTPUT_CONTRACT_LINK")
    if any(item.get("targetCommit") != target for item in linked_artifacts):
        deny("DERIVED_OUTPUT_CONTRACT_TARGET_LINK")
    for label, artifact in (("package", package_artifact), ("manifest", manifest_artifact),
                            ("index", index_artifact)):
        if artifact.get("digest") != {"sha256": candidate[label]["sha256"]}:
            deny("DERIVED_OUTPUT_CONTRACT_DIGEST_LINK")
    if manifest.get("releaseId") != release_id or manifest.get("targetCommit") != target:
        deny("DERIVED_OUTPUT_MANIFEST_LINK")
    allowed: set[str] = set()
    overlay = contract.get("privateDataOverlay")
    if isinstance(overlay, dict) and overlay.get("path", "").startswith(relative + "/"):
        allowed.add(str(Path(overlay["path"]).relative_to(relative)))
    for artifact in contract.get("artifacts", []):
        if (isinstance(artifact, dict) and artifact.get("class") == "EPHEMERAL_RUNTIME_CACHE" and
                isinstance(artifact.get("path"), str)):
            artifact_path = Path(artifact["path"])
            release_runtime = release_root / relative
            if release_runtime in artifact_path.parents:
                allowed.add(artifact_path.relative_to(release_runtime).as_posix())
    equivalence = compare_index(path, release_root, relative, index, allowed)
    return {"class": candidate["class"], "path": str(path), "identity": stat_identity(path.lstat()),
            "releaseId": release_id, "targetCommit": target, "releaseRoot": str(release_root),
            "runtimeRelativePath": relative,
            "bindings": {label: {"path": str(value[0]), "sha256": candidate[label]["sha256"]}
                         for label, value in bindings.items()}, "equivalence": equivalence}


def validate_candidate(candidate: Any, policy: dict[str, Any], operational: dict[str, Any],
                       process_data: tuple[list[tuple[int, str, str]], list[dict[str, Any]], bool]) -> dict[str, Any]:
    if not isinstance(candidate, dict) or candidate.get("class") not in CLASSES:
        deny("CANDIDATE_CLASS")
    if candidate["class"] == "NPM_CACHE_MAINTENANCE":
        return authenticate_npm(candidate, process_data)
    return authenticate_output(candidate, policy, operational, process_data)


def validate_audit_request(value: dict[str, Any]) -> None:
    if set(value) != AUDIT_REQUEST_KEYS or value.get("schemaVersion") != 1 or value.get("kind") != "CAPACITY_RECOVERY_AUDIT_REQUEST":
        deny("AUDIT_REQUEST_SCHEMA")
    for key in ("minimumRecoveryBytes", "targetAvailableBytes"):
        if not isinstance(value.get(key), int) or value[key] <= 0:
            deny(f"AUDIT_REQUEST_{key}")
    if not isinstance(value.get("candidates"), list) or not value["candidates"]:
        deny("AUDIT_REQUEST_CANDIDATES")


def audit_request(request: Path, request_sha: str, plan_output: Path) -> dict[str, Any]:
    raw, _ = stable_regular(request, request_sha)
    value = object_json(raw, "AUDIT_REQUEST_JSON")
    validate_audit_request(value)
    policy, policy_path, policy_sha = root_policy(value["rootPolicy"])
    op_path, op_sha, op_raw, _ = load_binding(value["operationalState"], "OPERATIONAL_STATE")
    operational = validate_operational(op_raw)
    process_data = _proc_targets()
    observations: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    seen_paths: set[str] = set()
    for ordinal, candidate in enumerate(value["candidates"], 1):
        try:
            observed = validate_candidate(candidate, policy, operational, process_data)
            if observed["path"] in seen_paths:
                deny("CANDIDATE_DUPLICATE")
            seen_paths.add(observed["path"])
            observations.append({"ordinal": ordinal, "source": candidate, "observation": observed})
        except Denied as exc:
            errors.append({"ordinal": ordinal, "predicate": str(exc)})
    qualified_paths = [Path(item["observation"]["path"]) for item in observations]
    usage = physical_usage(qualified_paths) if qualified_paths else {}
    total = 0
    inodes = 0
    for item in observations:
        measured = usage[item["observation"]["path"]]
        item["observation"]["physical"] = measured
        total += measured["allocatedBytes"]
        inodes += measured["inodes"]
    filesystem = os.statvfs(policy["canonicalRoots"]["outputs"]["path"])
    available_before = filesystem.f_bavail * filesystem.f_frsize
    projected = available_before + total
    if total < value["minimumRecoveryBytes"]:
        errors.append({"ordinal": 0, "predicate": "MINIMUM_RECOVERY_NOT_MET"})
    if projected < value["targetAvailableBytes"]:
        errors.append({"ordinal": 0, "predicate": "TARGET_AVAILABLE_NOT_MET"})
    state = "P00_CAPACITY_RECOVERY_AUDIT_PASS" if not errors else "P00_CAPACITY_RECOVERY_AUDIT_DENY"
    plan = {
        "schemaVersion": 1, "kind": "CAPACITY_RECOVERY_PLAN", "state": state,
        "requestSha256": request_sha, "minimumRecoveryBytes": value["minimumRecoveryBytes"],
        "targetAvailableBytes": value["targetAvailableBytes"], "qualifiedBytes": total,
        "qualifiedInodes": inodes, "availableBytesBefore": available_before,
        "projectedAvailableBytes": projected, "minimumRecoverySatisfied": total >= value["minimumRecoveryBytes"],
        "targetAvailableSatisfied": projected >= value["targetAvailableBytes"],
        "classificationPolicy": {
            "sourcesOfTruth": "EVIDENCE_PRESERVE",
            "derivedCandidates": sorted(CLASSES),
            "unclassified": "NOT_QUALIFIED",
        },
        "rootPolicy": {"path": str(policy_path), "sha256": policy_sha},
        "operationalState": {"path": str(op_path), "sha256": op_sha},
        "deploymentLock": operational["deploymentLock"], "writerLock": operational["writerLock"],
        "candidates": observations, "errors": errors,
        "commands": [[*LITERAL_RM, item["observation"]["path"]] for item in observations],
        "automaticExecutionPermitted": False,
    }
    write_exclusive(plan_output, canonical(plan))
    return plan


def revalidate_plan(plan: dict[str, Any], *, check_locks: bool = True) -> tuple[list[dict[str, Any]], list[str]]:
    required = {"schemaVersion", "kind", "state", "requestSha256", "minimumRecoveryBytes",
                "targetAvailableBytes", "qualifiedBytes", "qualifiedInodes", "availableBytesBefore",
                "projectedAvailableBytes", "minimumRecoverySatisfied", "targetAvailableSatisfied",
                "classificationPolicy", "rootPolicy",
                "operationalState", "deploymentLock", "writerLock", "candidates", "errors",
                "commands", "automaticExecutionPermitted"}
    if set(plan) != required or plan.get("schemaVersion") != 1 or plan.get("kind") != "CAPACITY_RECOVERY_PLAN" or plan.get("state") != "P00_CAPACITY_RECOVERY_AUDIT_PASS" or plan.get("errors") != [] or plan.get("automaticExecutionPermitted") is not False:
        deny("PLAN_SCHEMA_OR_STATE")
    policy, _, _ = root_policy(plan["rootPolicy"])
    _, _, op_raw, _ = load_binding(plan["operationalState"], "OPERATIONAL_STATE")
    operational = validate_operational(op_raw)
    errors: list[str] = []
    refreshed: list[dict[str, Any]] = []
    priors: list[dict[str, Any]] = []
    process_data = _proc_targets()
    for item in plan.get("candidates", []):
        try:
            source = item["source"]
            observed = validate_candidate(source, policy, operational, process_data)
            prior = item["observation"]
            refreshed.append(observed)
            priors.append(prior)
        except (Denied, KeyError, TypeError) as exc:
            errors.append(str(exc))
    if refreshed:
        usage = physical_usage(Path(item["path"]) for item in refreshed)
        for observed, prior in zip(refreshed, priors):
            observed["physical"] = usage[observed["path"]]
            if observed != prior:
                errors.append(f"CANDIDATE_CHANGED:{observed['path']}")
    if check_locks:
        for lock in (Path(plan["deploymentLock"]), Path(plan["writerLock"])):
            try:
                validate_lock_free(lock)
            except Denied as exc:
                errors.append(str(exc))
    expected_commands = [[*LITERAL_RM, item["path"]] for item in refreshed]
    if expected_commands != plan.get("commands"):
        errors.append("PLAN_COMMANDS_DIVERGED")
    return refreshed, sorted(set(errors))


def prepare_plan(plan_path: Path, plan_sha: str, intent_output: Path,
                 commands_output: Path, manifest_output: Path) -> dict[str, Any]:
    raw, _ = stable_regular(plan_path, plan_sha)
    plan = object_json(raw, "PLAN_JSON")
    refreshed, errors = revalidate_plan(plan)
    if errors:
        result = {"state": "CAPACITY_RECOVERY_PREPARE_DENY", "errors": errors}
        print(json.dumps(result, sort_keys=True))
        raise SystemExit(2)
    commands_raw = b"".join((" ".join(command) + "\n").encode() for command in plan["commands"])
    intent = {
        "schemaVersion": 1, "kind": "CAPACITY_RECOVERY_INTENT",
        "state": "SEALED_FOR_EXPLICIT_AUTHORIZATION", "plan": {"path": str(plan_path), "sha256": plan_sha},
        "operationalState": plan["operationalState"], "rootPolicy": plan["rootPolicy"],
        "deploymentLock": plan["deploymentLock"], "writerLock": plan["writerLock"],
        "minimumRecoveryBytes": plan["minimumRecoveryBytes"], "expectedRecoveryBytes": plan["qualifiedBytes"],
        "expectedRecoveryInodes": plan["qualifiedInodes"], "candidates": refreshed,
        "commands": plan["commands"], "commandsSha256": digest_bytes(commands_raw),
        "automaticRetry": False, "forceAllowed": False, "pruneAllowed": False, "pathExpansionAllowed": False,
    }
    intent_raw = canonical(intent)
    manifest = {
        "schemaVersion": 1, "kind": "CAPACITY_RECOVERY_SEAL_MANIFEST",
        "planSha256": plan_sha, "intentSha256": digest_bytes(intent_raw),
        "commandsSha256": digest_bytes(commands_raw), "state": "SEALED_FOR_EXPLICIT_AUTHORIZATION",
    }
    write_exclusive(commands_output, commands_raw)
    write_exclusive(intent_output, intent_raw)
    write_exclusive(manifest_output, canonical(manifest))
    return manifest


def acquire_lock(path: Path) -> int:
    info = path.lstat()
    if (path.is_symlink() or not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600 or
            info.st_uid != os.geteuid() or info.st_gid != os.getegid()):
        deny(f"LOCK_IDENTITY:{path}")
    fd = os.open(path, os.O_RDWR | os.O_NOFOLLOW)
    opened = os.fstat(fd)
    if (info.st_dev, info.st_ino) != (opened.st_dev, opened.st_ino):
        os.close(fd); deny(f"LOCK_CHANGED:{path}")
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(fd); deny(f"LOCK_BUSY:{path}")
    return fd


def append_event(journal: Path, event: dict[str, Any]) -> None:
    fd = os.open(journal, os.O_WRONLY | os.O_APPEND | os.O_NOFOLLOW)
    try:
        os.write(fd, canonical(event)); os.fsync(fd)
    finally:
        os.close(fd)


def fsync_directory(path: Path) -> None:
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def validate_authorization(value: dict[str, Any], intent_sha: str,
                           commands_sha: str, paths: list[str]) -> None:
    required = {"schemaVersion", "kind", "authorization", "intentSha256", "commandsSha256", "paths"}
    if (set(value) != required or value.get("schemaVersion") != 1 or
            value.get("kind") != "CAPACITY_RECOVERY_AUTHORIZATION" or
            value.get("authorization") != "AUTHORIZE_ONCE" or
            value.get("intentSha256") != intent_sha or value.get("commandsSha256") != commands_sha or
            value.get("paths") != paths):
        deny("AUTHORIZATION_DIVERGED")


def execute_intent(intent_path: Path, intent_sha: str, authorization_path: Path,
                   authorization_sha: str, receipt_root: Path) -> dict[str, Any]:
    intent_raw, _ = stable_regular(intent_path, intent_sha)
    intent = object_json(intent_raw, "INTENT_JSON")
    required = {"schemaVersion", "kind", "state", "plan", "operationalState", "rootPolicy",
                "deploymentLock", "writerLock", "minimumRecoveryBytes", "expectedRecoveryBytes",
                "expectedRecoveryInodes", "candidates", "commands", "commandsSha256", "automaticRetry",
                "forceAllowed", "pruneAllowed", "pathExpansionAllowed"}
    if (set(intent) != required or intent.get("schemaVersion") != 1 or
            intent.get("kind") != "CAPACITY_RECOVERY_INTENT" or
            intent.get("state") != "SEALED_FOR_EXPLICIT_AUTHORIZATION" or
            any(intent.get(key) is not False for key in ("automaticRetry", "forceAllowed", "pruneAllowed", "pathExpansionAllowed"))):
        deny("INTENT_SCHEMA_OR_STATE")
    commands_raw = b"".join((" ".join(command) + "\n").encode() for command in intent["commands"])
    if digest_bytes(commands_raw) != intent["commandsSha256"]:
        deny("INTENT_COMMANDS_SHA256")
    paths = [item["path"] for item in intent["candidates"]]
    auth_raw, _ = stable_regular(authorization_path, authorization_sha)
    validate_authorization(object_json(auth_raw, "AUTHORIZATION_JSON"), intent_sha,
                           intent["commandsSha256"], paths)
    if receipt_root.exists() or receipt_root.is_symlink():
        deny("RECEIPT_ROOT_EXISTS")
    parent = receipt_root.parent
    parent_info = parent.lstat()
    if (parent.is_symlink() or not stat.S_ISDIR(parent_info.st_mode) or
            parent_info.st_uid != os.geteuid() or parent_info.st_gid != os.getegid() or
            stat.S_IMODE(parent_info.st_mode) & 0o022):
        deny("RECEIPT_PARENT_IDENTITY")
    os.mkdir(receipt_root, 0o700)
    journal = receipt_root / "command-journal.private.jsonl"
    write_exclusive(journal, b"")
    held: list[int] = []
    attempted = 0; completed = 0; removed: list[str] = []
    failure: str | None = None
    try:
        for lock_path in (Path(intent["deploymentLock"]), Path(intent["writerLock"])):
            held.append(acquire_lock(lock_path))
        # The plan itself is re-opened and every candidate is recaptured immediately
        # before the first durable ATTEMPT.
        plan_path = Path(intent["plan"]["path"])
        plan_raw, _ = stable_regular(plan_path, intent["plan"]["sha256"])
        refreshed, errors = revalidate_plan(object_json(plan_raw, "PLAN_JSON"), check_locks=False)
        if errors or refreshed != intent["candidates"]:
            deny("EXECUTE_RECAPTURE_DENY:" + (errors[0] if errors else "CANDIDATE_CHANGED"))
        pre_attempt = {"event": "RECAPTURE_PASS", "intentSha256": intent_sha,
                       "commandsSha256": intent["commandsSha256"], "candidates": refreshed}
        write_exclusive(receipt_root / "pre-attempt-recapture.private.json", canonical(pre_attempt))
        for ordinal, (command, candidate) in enumerate(zip(intent["commands"], intent["candidates"]), 1):
            expected = [*LITERAL_RM, candidate["path"]]
            if command != expected:
                deny("COMMAND_LITERAL_DIVERGED")
            append_event(journal, {"event": "ATTEMPT", "ordinal": ordinal,
                                   "path": candidate["path"], "argv": command})
            attempted += 1
            stdout = receipt_root / f"command-{ordinal}.stdout.private.txt"
            stderr = receipt_root / f"command-{ordinal}.stderr.private.txt"
            out_fd = os.open(stdout, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            try:
                err_fd = os.open(stderr, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            except Exception:
                os.close(out_fd); raise
            try:
                result = subprocess.run(command, stdout=out_fd, stderr=err_fd, check=False)
                os.fsync(out_fd); os.fsync(err_fd)
            finally:
                os.close(out_fd); os.close(err_fd)
            append_event(journal, {"event": "RESULT", "ordinal": ordinal,
                                   "path": candidate["path"], "exitCode": result.returncode,
                                   "stdoutSha256": sha256(stdout), "stderrSha256": sha256(stderr)})
            if result.returncode != 0:
                deny(f"COMMAND_FAILED:{ordinal}:{result.returncode}")
            path = Path(candidate["path"])
            fsync_directory(path.parent)
            if path.exists() or path.is_symlink():
                deny(f"VERIFICATION_PRESENT:{ordinal}")
            completed += 1; removed.append(candidate["path"])
            append_event(journal, {"event": "VERIFIED", "ordinal": ordinal,
                                   "path": candidate["path"], "result": "ABSENT"})
    except (Denied, OSError) as exc:
        failure = str(exc)
        append_event(journal, {"event": "DENY", "predicate": failure,
                               "attemptedCommands": attempted, "completedCommands": completed})
    receipt = {"schemaVersion": 1, "kind": "CAPACITY_RECOVERY_RECEIPT",
               "state": "COMPLETED" if failure is None else "FAILED",
               "failurePredicate": failure, "intentSha256": intent_sha,
               "authorizationSha256": authorization_sha,
               "commandsSha256": intent["commandsSha256"], "attemptedCommands": attempted,
               "completedCommands": completed, "removedPaths": removed,
               "automaticRetry": False, "forceUsed": False, "pruneUsed": False,
               "pathExpansion": False, "journalSha256": sha256(journal)}
    receipt_path = receipt_root / "execution-receipt.private.json"
    write_exclusive(receipt_path, canonical(receipt))
    write_exclusive(receipt_root / "execution-receipt.sha256",
                    f"{sha256(receipt_path)}  {receipt_path}\n".encode())
    fsync_directory(receipt_root)
    for fd in reversed(held):
        try:
            fcntl.flock(fd, fcntl.LOCK_UN)
        finally:
            os.close(fd)
    if failure is not None:
        raise SystemExit(1)
    return receipt


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    actions = parser.add_subparsers(dest="action", required=True)
    audit = actions.add_parser("audit")
    audit.add_argument("--request", type=Path, required=True)
    audit.add_argument("--request-sha256", required=True)
    audit.add_argument("--plan-output", type=Path, required=True)
    prepare = actions.add_parser("prepare")
    prepare.add_argument("--plan", type=Path, required=True)
    prepare.add_argument("--plan-sha256", required=True)
    prepare.add_argument("--intent-output", type=Path, required=True)
    prepare.add_argument("--commands-output", type=Path, required=True)
    prepare.add_argument("--manifest-output", type=Path, required=True)
    execute = actions.add_parser("execute")
    execute.add_argument("--intent", type=Path, required=True)
    execute.add_argument("--intent-sha256", required=True)
    execute.add_argument("--authorization", type=Path, required=True)
    execute.add_argument("--authorization-sha256", required=True)
    execute.add_argument("--receipt-root", type=Path, required=True)
    return parser.parse_args()


def main() -> None:
    os.umask(0o077)
    args = parse_args()
    try:
        if args.action == "audit":
            result = audit_request(args.request, args.request_sha256, args.plan_output)
        elif args.action == "prepare":
            result = prepare_plan(args.plan, args.plan_sha256, args.intent_output,
                                  args.commands_output, args.manifest_output)
        else:
            result = execute_intent(args.intent, args.intent_sha256, args.authorization,
                                    args.authorization_sha256, args.receipt_root)
        print(json.dumps(result, sort_keys=True))
    except Denied as exc:
        print(json.dumps({"state": "CAPACITY_RECOVERY_DENY", "predicate": str(exc)}, sort_keys=True))
        raise SystemExit(2)


if __name__ == "__main__":
    main()
