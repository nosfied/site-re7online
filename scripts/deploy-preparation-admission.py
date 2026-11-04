#!/usr/bin/env python3
"""Aggregate deploy-preparation admission and atomically materialize private control-plane copies."""

from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
from typing import Any
import importlib.util

PREPARATION_LIFECYCLE_SHA256 = "a67fb3361c17372896241469683104cb2e3bab3e892b8bf32127882612ad0f2a"
_lifecycle_path = Path(__file__).resolve().parent / "preparation_artifact_lifecycle.py"
try:
    _lifecycle_raw = _lifecycle_path.read_bytes()
except OSError as error:
    raise RuntimeError("preparation_lifecycle_dependency_missing") from error
if hashlib.sha256(_lifecycle_raw).hexdigest() != PREPARATION_LIFECYCLE_SHA256:
    raise RuntimeError("preparation_lifecycle_dependency_drift")
_lifecycle_spec = importlib.util.spec_from_file_location(
    "preparation_artifact_lifecycle", _lifecycle_path)
preparation_lifecycle = importlib.util.module_from_spec(_lifecycle_spec)
_lifecycle_spec.loader.exec_module(preparation_lifecycle)

SHA256 = re.compile(r"[0-9a-f]{64}")
CONTROL_ROLES = {
    "generation-retirement": "generation-retirement.py",
    "converta-release": "converta-release.py",
    "root-policy": "deploy-artifact-roots.json",
}
PREPARATION_PRODUCER_ROLES = {
    "preparation-producer": "scripts/operational_preparers_v3.py",
    "preparation-review": "scripts/operational_preparation_review.py",
    "preparation-inventory": "scripts/operational-retention-report.py",
    "preparation-lifecycle": "scripts/preparation_artifact_lifecycle.py",
    "capacity-dependency": "docs/reviews/automation-freeform-window-release-af26/dynamic-integrated-prepared-20261012/capacity_budget.py",
    "capture-dependency": "docs/reviews/automation-freeform-window-release-af26/security-containment-20261012/saved_reference_capture.py",
    "reference-dependency": "docs/reviews/automation-freeform-window-release-af26/security-containment-20261012/retention-audit-20261013/third-withdrawal/references.py",
}
REQUIRED_CHECKS = {
    "contract", "lifecycle", "review-output", "intent-output", "commands-output",
    "transaction-root", "receipt-root", "deployment-lock", "writer-lock",
    "worktree-root", "output-root", "releases-root", "evidence-root",
    "pm2-dump", "release-graph",
}
REQUIRED_ASSERTIONS = {
    "target-qualified", "ci-qualified", "impact-classified", "migration-reviewed",
    "generation-gate", "release-graph-authenticated", "pm2-live-authenticated",
    "pm2-dump-authenticated", "health-local", "health-public",
    "capacity-budget", "inode-budget", "ancestors-authenticated",
    "installation-route-qualified", "no-partial-output",
}
REQUEST_KEYS = {
    "schemaVersion", "generationId", "releaseId", "targetCommit", "finalRoot",
    "operationalStateTemplate", "operationalStateOutputName",
    "controlPlaneArtifacts", "checks", "assertions",
}
REQUEST_V2_KEYS = REQUEST_KEYS | {"preparationArtifacts", "preparationReservationRoot",
                                  "preparationProducerArtifacts"}


def canonical(value: Any) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def valid_sha(value: Any) -> bool:
    return isinstance(value, str) and SHA256.fullmatch(value) is not None


def identity(info: os.stat_result) -> tuple[int, int, int, int, int, int]:
    return (info.st_dev, info.st_ino, info.st_mode, info.st_size,
            info.st_mtime_ns, info.st_ctime_ns)


def normalized_absolute(value: Any) -> Path | None:
    if not isinstance(value, str):
        return None
    path = Path(value)
    if not path.is_absolute() or Path(os.path.abspath(path)) != path:
        return None
    return path


def stable_regular(path: Path, allowed_modes: set[int], expected_sha: str | None,
                   errors: list[str], label: str) -> tuple[bytes, os.stat_result] | None:
    try:
        before = path.lstat()
        if path.is_symlink() or not stat.S_ISREG(before.st_mode):
            errors.append(f"{label}:type")
            return None
        mode = stat.S_IMODE(before.st_mode)
        if before.st_uid != os.geteuid() or before.st_gid != os.getegid():
            errors.append(f"{label}:owner")
        if mode not in allowed_modes or mode & 0o022:
            errors.append(f"{label}:mode:0{mode:o}")
        fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
        try:
            opened = os.fstat(fd)
            chunks: list[bytes] = []
            while chunk := os.read(fd, 1024 * 1024):
                chunks.append(chunk)
            raw = b"".join(chunks)
            after = os.fstat(fd)
        finally:
            os.close(fd)
        current = path.lstat()
        if identity(before) != identity(opened) or identity(opened) != identity(after) or identity(after) != identity(current):
            errors.append(f"{label}:changed")
        if len(raw) != current.st_size:
            errors.append(f"{label}:size")
        if expected_sha is not None and digest(raw) != expected_sha:
            errors.append(f"{label}:sha256")
        return raw, current
    except OSError:
        errors.append(f"{label}:missing")
        return None


def path_is_physical(path: Path) -> bool:
    try:
        return path.resolve(strict=False) == path
    except OSError:
        return False


def inspect_check(item: Any, errors: list[str]) -> None:
    if not isinstance(item, dict):
        errors.append("check:schema")
        return
    allowed = {"name", "expectation", "path", "sha256", "allowedModes",
               "ownerUid", "groupGid", "allowAbsent"}
    if set(item) - allowed:
        errors.append(f"check:{item.get('name', 'unknown')}:schema")
        return
    name = item.get("name")
    expectation = item.get("expectation")
    path = normalized_absolute(item.get("path"))
    if not isinstance(name, str) or not name or path is None:
        errors.append(f"check:{name or 'unknown'}:identity")
        return
    if not path_is_physical(path):
        errors.append(f"check:{name}:symlink")
        return
    if expectation == "absent":
        if path.exists() or path.is_symlink():
            errors.append(f"check:{name}:present")
        return
    if expectation == "regular":
        modes = item.get("allowedModes")
        if (not isinstance(modes, list) or not modes or
                any(not isinstance(mode, int) for mode in modes)):
            errors.append(f"check:{name}:modes")
            return
        expected = item.get("sha256")
        if expected is not None and not valid_sha(expected):
            errors.append(f"check:{name}:sha256_schema")
            return
        observed = stable_regular(path, set(modes), expected, errors, f"check:{name}")
        if observed is not None:
            info = observed[1]
            if item.get("ownerUid") is not None and info.st_uid != item["ownerUid"]:
                errors.append(f"check:{name}:expected_owner")
            if item.get("groupGid") is not None and info.st_gid != item["groupGid"]:
                errors.append(f"check:{name}:expected_group")
        return
    if expectation == "directory":
        try:
            info = path.lstat()
            mode = stat.S_IMODE(info.st_mode)
            modes = item.get("allowedModes")
            if (path.is_symlink() or not stat.S_ISDIR(info.st_mode) or
                    not isinstance(modes, list) or mode not in modes or mode & 0o022):
                errors.append(f"check:{name}:directory_identity")
            if item.get("ownerUid") is not None and info.st_uid != item["ownerUid"]:
                errors.append(f"check:{name}:expected_owner")
            if item.get("groupGid") is not None and info.st_gid != item["groupGid"]:
                errors.append(f"check:{name}:expected_group")
        except OSError:
            errors.append(f"check:{name}:missing")
        return
    if expectation == "lock_free":
        if not path.exists() and item.get("allowAbsent") is True:
            return
        try:
            info = path.lstat()
            mode = stat.S_IMODE(info.st_mode)
            if path.is_symlink() or not stat.S_ISREG(info.st_mode) or mode != 0o600:
                errors.append(f"check:{name}:lock_identity")
                return
            fd = os.open(path, os.O_RDWR | getattr(os, "O_NOFOLLOW", 0))
            try:
                try:
                    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    errors.append(f"check:{name}:lock_busy")
                    return
                finally:
                    try:
                        fcntl.flock(fd, fcntl.LOCK_UN)
                    except OSError:
                        pass
            finally:
                os.close(fd)
        except OSError:
            errors.append(f"check:{name}:lock_open")
        return
    errors.append(f"check:{name}:expectation")


def validate_assertions(items: Any, errors: list[str]) -> None:
    if not isinstance(items, list):
        errors.append("assertions:schema")
        return
    names: set[str] = set()
    for item in items:
        if (not isinstance(item, dict) or
                set(item) != {"name", "passed", "evidencePath", "evidenceSha256"} or
                not isinstance(item.get("name"), str)):
            errors.append("assertion:schema")
            continue
        name = item["name"]
        if name in names:
            errors.append(f"assertion:{name}:duplicate")
        names.add(name)
        if item.get("passed") is not True:
            errors.append(f"assertion:{name}:failed")
        evidence_path = normalized_absolute(item.get("evidencePath"))
        evidence_sha = item.get("evidenceSha256")
        if evidence_path is None or not valid_sha(evidence_sha):
            errors.append(f"assertion:{name}:evidence_schema")
        elif not path_is_physical(evidence_path):
            errors.append(f"assertion:{name}:evidence_symlink")
        else:
            stable_regular(evidence_path, {0o600}, evidence_sha, errors,
                           f"assertion:{name}:evidence")
    for name in sorted(REQUIRED_ASSERTIONS - names):
        errors.append(f"assertion:{name}:missing")
    for name in sorted(names - REQUIRED_ASSERTIONS):
        errors.append(f"assertion:{name}:unknown")


def validate_controls(items: Any, errors: list[str]) -> dict[str, tuple[Path, bytes, str]]:
    result: dict[str, tuple[Path, bytes, str]] = {}
    if not isinstance(items, list):
        errors.append("control:schema")
        return result
    roles: set[str] = set()
    for item in items:
        if (not isinstance(item, dict) or
                set(item) != {"role", "sourcePath", "sourceSha256"}):
            errors.append("control:schema")
            continue
        role = item.get("role")
        path = normalized_absolute(item.get("sourcePath"))
        expected = item.get("sourceSha256")
        if role not in CONTROL_ROLES or path is None or not valid_sha(expected):
            errors.append(f"control:{role or 'unknown'}:identity")
            continue
        if role in roles:
            errors.append(f"control:{role}:duplicate")
            continue
        roles.add(role)
        if path.name != CONTROL_ROLES[role]:
            errors.append(f"control:{role}:basename")
        if not path_is_physical(path):
            errors.append(f"control:{role}:symlink")
            continue
        observed = stable_regular(path, {0o600, 0o644}, expected, errors, f"control:{role}")
        if observed is not None:
            result[role] = (path, observed[0], expected)
    for role in sorted(set(CONTROL_ROLES) - roles):
        errors.append(f"control:{role}:missing")
    return result


def validate_preparation_producer(items: Any, errors: list[str]) -> dict[str, tuple[Path, bytes, str]]:
    result: dict[str, tuple[Path, bytes, str]] = {}
    if not isinstance(items, list):
        errors.append("preparationProducer:schema")
        return result
    for item in items:
        if not isinstance(item, dict) or set(item) != {"role", "sourcePath", "sourceSha256"}:
            errors.append("preparationProducer:schema")
            continue
        role = item.get("role"); source = normalized_absolute(item.get("sourcePath"))
        expected = item.get("sourceSha256")
        if role not in PREPARATION_PRODUCER_ROLES or source is None or not valid_sha(expected):
            errors.append(f"preparationProducer:{role or 'unknown'}:identity")
            continue
        if role in result:
            errors.append(f"preparationProducer:{role}:duplicate")
            continue
        expected_suffix = Path(PREPARATION_PRODUCER_ROLES[role])
        if tuple(source.parts[-len(expected_suffix.parts):]) != expected_suffix.parts:
            errors.append(f"preparationProducer:{role}:path")
        observed = stable_regular(source, {0o600, 0o644, 0o755}, expected, errors,
                                  f"preparationProducer:{role}")
        if observed is not None:
            result[role] = (source, observed[0], expected)
    for role in sorted(set(PREPARATION_PRODUCER_ROLES) - set(result)):
        errors.append(f"preparationProducer:{role}:missing")
    return result


def validate_request(value: Any) -> tuple[
        list[str], dict[str, tuple[Path, bytes, str]],
        tuple[Path, bytes, str] | None, dict[str, tuple[Path, bytes, str]]]:
    errors: list[str] = []
    if not isinstance(value, dict) or value.get("schemaVersion") not in {1, 2}:
        return ["request:schema"], {}, None, {}
    expected_keys = REQUEST_KEYS if value["schemaVersion"] == 1 else REQUEST_V2_KEYS
    if set(value) != expected_keys:
        return ["request:schema"], {}, None, {}
    for key in ("generationId", "releaseId", "targetCommit"):
        if not isinstance(value.get(key), str) or not value[key]:
            errors.append(f"request:{key}")
    if not re.fullmatch(r"[0-9a-f]{40}", str(value.get("targetCommit", ""))):
        errors.append("request:targetCommit")
    final_root = normalized_absolute(value.get("finalRoot"))
    if final_root is None:
        errors.append("request:finalRoot")
    elif not path_is_physical(final_root.parent):
        errors.append("request:finalRoot_parent_symlink")
    output_name = value.get("operationalStateOutputName")
    if output_name != "operational-state.private.json":
        errors.append("request:operational_output")
    controls = validate_controls(value.get("controlPlaneArtifacts"), errors)
    template = value.get("operationalStateTemplate")
    template_info: tuple[Path, bytes, str] | None = None
    if (not isinstance(template, dict) or set(template) != {"path", "sha256"} or
            normalized_absolute(template.get("path")) is None or not valid_sha(template.get("sha256"))):
        errors.append("operational_template:schema")
    else:
        observed = stable_regular(normalized_absolute(template["path"]), {0o600},
                                  template["sha256"], errors, "operational_template")
        if observed is not None:
            template_info = (normalized_absolute(template["path"]), observed[0], template["sha256"])
            try:
                operational = json.loads(observed[0])
                if (not isinstance(operational, dict) or operational.get("schemaVersion") != 2 or
                        operational.get("generationId") != value.get("generationId") or
                        operational.get("releaseId") != value.get("releaseId") or
                        operational.get("targetCommit") != value.get("targetCommit") or
                        not isinstance(operational.get("controlPlaneArtifacts"), list)):
                    errors.append("operational_template:identity")
            except (UnicodeDecodeError, json.JSONDecodeError):
                errors.append("operational_template:json")
    checks = value.get("checks")
    names: set[str] = set()
    if not isinstance(checks, list):
        errors.append("checks:schema")
    else:
        for item in checks:
            if isinstance(item, dict) and isinstance(item.get("name"), str):
                if item["name"] in names:
                    errors.append(f"check:{item['name']}:duplicate")
                names.add(item["name"])
            inspect_check(item, errors)
        for name in sorted(REQUIRED_CHECKS - names):
            errors.append(f"check:{name}:missing")
        for name in sorted(names - REQUIRED_CHECKS):
            errors.append(f"check:{name}:unknown")
    validate_assertions(value.get("assertions"), errors)
    producer: dict[str, tuple[Path, bytes, str]] = {}
    if value["schemaVersion"] == 2:
        try:
            preparation_lifecycle.validate_artifacts(value["preparationArtifacts"])
        except (ValueError, KeyError, TypeError) as error:
            errors.append(f"preparationArtifacts:{error}")
        reservation_root = normalized_absolute(value.get("preparationReservationRoot"))
        if reservation_root is None or not path_is_physical(reservation_root):
            errors.append("preparationReservationRoot:identity")
        producer = validate_preparation_producer(value.get("preparationProducerArtifacts"), errors)
    return sorted(set(errors)), controls, template_info, producer


def write_exclusive(path: Path, raw: bytes, mode: int = 0o600) -> None:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                 getattr(os, "O_NOFOLLOW", 0), mode)
    try:
        view = memoryview(raw)
        while view:
            written = os.write(fd, view)
            if written <= 0:
                raise OSError("short_write")
            view = view[written:]
        os.fsync(fd)
    finally:
        os.close(fd)


def fsync_dir(path: Path) -> None:
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | getattr(os, "O_NOFOLLOW", 0))
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def expected_materialization(
        value: dict[str, Any],
        controls: dict[str, tuple[Path, bytes, str]],
        template_raw: bytes,
        producer: dict[str, tuple[Path, bytes, str]] | None = None) -> tuple[dict[str, bytes], dict[str, Any]]:
    final_root = Path(value["finalRoot"])
    control_projection = []
    payloads: dict[str, bytes] = {}
    for role in ("generation-retirement", "converta-release", "root-policy"):
        filename = CONTROL_ROLES[role]
        _, raw, expected = controls[role]
        payloads[filename] = raw
        control_projection.append({
            "path": str(final_root / filename),
            "sha256": expected,
            "copied": True,
        })
    # Required by the copied generation-retirement entrypoint in both admission
    # schemas. Its bytes are pinned by this admission and by the consumer.
    payloads["preparation_artifact_lifecycle.py"] = _lifecycle_raw
    operational = json.loads(template_raw)
    operational["controlPlaneArtifacts"] = control_projection
    operational_raw = canonical(operational)
    payloads[value["operationalStateOutputName"]] = operational_raw
    preparation_contract = None
    if value["schemaVersion"] == 2:
        preparation_contract = {
            "schemaVersion": 1,
            "generationId": value["generationId"],
            "reservationRoot": value["preparationReservationRoot"],
            "preparationArtifacts": value["preparationArtifacts"],
        }
        preparation_raw = canonical(preparation_contract)
        payloads["preparation-artifacts.contract.private.json"] = preparation_raw
        for role, relative in PREPARATION_PRODUCER_ROLES.items():
            payloads[f"preparation-producer-root/{relative}"] = producer[role][1]
    report = {
        "schemaVersion": 1,
        "result": "P00_AGGREGATE_ADMISSION_PASS",
        "generationId": value["generationId"],
        "releaseId": value["releaseId"],
        "targetCommit": value["targetCommit"],
        "controlPlaneArtifacts": control_projection,
        "operationalStatePath": str(
            final_root / value["operationalStateOutputName"]),
        "operationalStateSha256": digest(operational_raw),
        "consumableMaterialized": True,
        "automaticRetry": False,
        "preparationRuntimeDependencies": [{
            "consumer": "generation-retirement",
            "path": str(final_root / "preparation_artifact_lifecycle.py"),
            "sha256": PREPARATION_LIFECYCLE_SHA256,
            "copied": True,
        }],
    }
    if preparation_contract is not None:
        report["preparationArtifactContract"] = {
            "path": str(final_root / "preparation-artifacts.contract.private.json"),
            "sha256": digest(payloads["preparation-artifacts.contract.private.json"]),
        }
        report["preparationProducer"] = [{"role": role,
            "path": str(final_root / "preparation-producer-root" / relative),
            "sha256": producer[role][2], "copied": True}
            for role, relative in PREPARATION_PRODUCER_ROLES.items()]
    payloads["admission-report.private.json"] = canonical(report)
    return payloads, report


def verify_existing_root(root: Path, payloads: dict[str, bytes]) -> None:
    errors: list[str] = []
    try:
        info = root.lstat()
        if (root.is_symlink() or not stat.S_ISDIR(info.st_mode) or
                info.st_uid != os.geteuid() or info.st_gid != os.getegid() or
                stat.S_IMODE(info.st_mode) != 0o700):
            raise RuntimeError("existing_destination_identity")
        actual_files = {str(item.relative_to(root)) for item in root.rglob("*") if item.is_file()}
        actual_dirs = {str(item.relative_to(root)) for item in root.rglob("*") if item.is_dir()}
        expected_dirs = {str(parent) for name in payloads for parent in Path(name).parents
                         if str(parent) != "."}
        if actual_files != set(payloads) or actual_dirs != expected_dirs:
            raise RuntimeError("existing_destination_inventory")
        for relative in expected_dirs:
            directory = root / relative; observed = directory.lstat()
            if (directory.is_symlink() or not stat.S_ISDIR(observed.st_mode) or
                    observed.st_uid != os.geteuid() or observed.st_gid != os.getegid() or
                    stat.S_IMODE(observed.st_mode) != 0o700):
                raise RuntimeError("existing_destination_directory_identity")
    except OSError as error:
        raise RuntimeError("existing_destination_identity") from error
    for name, raw in payloads.items():
        observed = stable_regular(root / name, {0o600}, digest(raw), errors,
                                  f"existing:{name}")
        if observed is not None and observed[0] != raw:
            errors.append(f"existing:{name}:bytes")
    if errors:
        raise RuntimeError("existing_destination_drift:" + ",".join(sorted(set(errors))))


def reobserve_inputs(
        controls: dict[str, tuple[Path, bytes, str]],
        template_info: tuple[Path, bytes, str],
        producer: dict[str, tuple[Path, bytes, str]] | None = None) -> bytes:
    errors: list[str] = []
    for role, (path, original_raw, expected) in controls.items():
        observed = stable_regular(path, {0o600, 0o644}, expected, errors,
                                  f"reobserve:control:{role}")
        if observed is not None and observed[0] != original_raw:
            errors.append(f"reobserve:control:{role}:bytes")
    template_path, template_raw, template_sha = template_info
    observed = stable_regular(template_path, {0o600}, template_sha, errors,
                              "reobserve:operational_template")
    if observed is not None and observed[0] != template_raw:
        errors.append("reobserve:operational_template:bytes")
    for role, (path, original_raw, expected) in (producer or {}).items():
        observed = stable_regular(path, {0o600, 0o644, 0o755}, expected, errors,
                                  f"reobserve:preparationProducer:{role}")
        if observed is not None and observed[0] != original_raw:
            errors.append(f"reobserve:preparationProducer:{role}:bytes")
    if errors:
        raise RuntimeError("input_reobservation:" + ",".join(sorted(set(errors))))
    return template_raw


def materialize(value: dict[str, Any],
                controls: dict[str, tuple[Path, bytes, str]],
                template_info: tuple[Path, bytes, str],
                producer: dict[str, tuple[Path, bytes, str]] | None = None) -> dict[str, Any]:
    final_root = Path(value["finalRoot"])
    parent = final_root.parent
    info = parent.lstat()
    if (parent.is_symlink() or not stat.S_ISDIR(info.st_mode) or
            info.st_uid != os.geteuid() or info.st_gid != os.getegid() or
            stat.S_IMODE(info.st_mode) & 0o022):
        raise RuntimeError("final_root_parent_identity")
    template_raw = reobserve_inputs(controls, template_info, producer)
    payloads, report = expected_materialization(value, controls, template_raw, producer)
    if final_root.exists() or final_root.is_symlink():
        verify_existing_root(final_root, payloads)
        reused = dict(report)
        reused["result"] = "P00_AGGREGATE_ADMISSION_REUSED"
        reused["reusedExactDestination"] = True
        return reused
    partial = parent / f".{final_root.name}.partial.{os.getpid()}"
    if partial.exists() or partial.is_symlink():
        raise RuntimeError("partial_root_exists")
    os.mkdir(partial, 0o700)
    created: list[Path] = []
    created_directories: set[Path] = set()
    try:
        for name, raw in payloads.items():
            destination = partial / name
            current = partial
            for component in Path(name).parts[:-1]:
                current = current / component
                if not current.exists():
                    os.mkdir(current, 0o700)
                    created_directories.add(current)
            write_exclusive(destination, raw)
            created.append(destination)
        verify_errors: list[str] = []
        for name, raw in payloads.items():
            observed = stable_regular(partial / name, {0o600}, digest(raw),
                                      verify_errors, f"output:{name}")
            if observed is not None and observed[0] != raw:
                verify_errors.append(f"output:{name}:bytes")
        if verify_errors:
            raise RuntimeError("output_verification:" +
                               ",".join(sorted(set(verify_errors))))
        fsync_dir(partial)
        os.rename(partial, final_root)
        fsync_dir(parent)
        verify_existing_root(final_root, payloads)
        return report
    except Exception:
        for path in reversed(created):
            try:
                path.unlink()
            except OSError:
                pass
        for directory in sorted(created_directories, key=lambda item: len(item.parts), reverse=True):
            try:
                directory.rmdir()
            except OSError:
                pass
        try:
            partial.rmdir()
        except OSError:
            pass
        raise


def run_materialized_preparation(args: argparse.Namespace) -> int:
    """Invoke only the producer authenticated and copied by this admission."""
    errors: list[str] = []
    root = normalized_absolute(args.materialized_root)
    report_path = normalized_absolute(args.admission_report)
    input_path = normalized_absolute(args.producer_input)
    output = normalized_absolute(args.output)
    if (root is None or report_path != root / "admission-report.private.json" or
            input_path is None or output is None or args.adapter not in {"api", "frontend"} or
            not valid_sha(args.admission_report_sha256) or
            not valid_sha(args.producer_input_sha256)):
        raise RuntimeError("preparation_run_binding")
    root_info = root.lstat()
    if (root.is_symlink() or not stat.S_ISDIR(root_info.st_mode) or
            root_info.st_uid != os.geteuid() or root_info.st_gid != os.getegid() or
            stat.S_IMODE(root_info.st_mode) != 0o700):
        raise RuntimeError("preparation_run_root_identity")
    observed_report = stable_regular(report_path, {0o600}, args.admission_report_sha256,
                                     errors, "preparation_run_report")
    observed_input = stable_regular(input_path, {0o600}, args.producer_input_sha256,
                                    errors, "preparation_run_input")
    if errors or observed_report is None or observed_input is None:
        raise RuntimeError("preparation_run_readback:" + ",".join(sorted(set(errors))))
    try:
        report = json.loads(observed_report[0]); producer_input = json.loads(observed_input[0])
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RuntimeError("preparation_run_json") from error
    if (report.get("result") not in {"P00_AGGREGATE_ADMISSION_PASS",
                                     "P00_AGGREGATE_ADMISSION_REUSED"} or
            report.get("consumableMaterialized") is not True or
            not isinstance(report.get("preparationProducer"), list) or
            not isinstance(report.get("preparationArtifactContract"), dict)):
        raise RuntimeError("preparation_run_report_contract")
    expected_contract = report["preparationArtifactContract"]
    if producer_input.get("preparationArtifactContract") != expected_contract:
        raise RuntimeError("preparation_run_contract_binding")
    contract_path = normalized_absolute(expected_contract.get("path"))
    if (contract_path != root / "preparation-artifacts.contract.private.json" or
            not valid_sha(expected_contract.get("sha256"))):
        raise RuntimeError("preparation_run_contract_location")
    contract_observed = stable_regular(contract_path, {0o600}, expected_contract["sha256"],
                                       errors, "preparation_run_contract")
    if errors or contract_observed is None:
        raise RuntimeError("preparation_run_contract_readback:" +
                           ",".join(sorted(set(errors))))
    contract = json.loads(contract_observed[0])
    if contract.get("reservationRoot") != str(output):
        raise RuntimeError("preparation_run_reservation_root")
    relative = PREPARATION_PRODUCER_ROLES["preparation-producer"]
    producer_path = root / "preparation-producer-root" / relative
    matches = [item for item in report["preparationProducer"]
               if isinstance(item, dict) and item.get("role") == "preparation-producer"]
    if (len(matches) != 1 or matches[0].get("path") != str(producer_path) or
            not valid_sha(matches[0].get("sha256")) or matches[0].get("copied") is not True):
        raise RuntimeError("preparation_run_producer_binding")
    producer_observed = stable_regular(producer_path, {0o600}, matches[0]["sha256"],
                                       errors, "preparation_run_producer")
    if errors or producer_observed is None:
        raise RuntimeError("preparation_run_producer_readback:" +
                           ",".join(sorted(set(errors))))
    fd = os.open(producer_path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        opened = os.fstat(fd)
        if (identity(opened) != identity(producer_observed[1]) or
                identity(opened) != identity(producer_path.lstat())):
            raise RuntimeError("preparation_run_producer_identity")
        fd_digest = hashlib.sha256()
        while chunk := os.read(fd, 1024 * 1024):
            fd_digest.update(chunk)
        if fd_digest.hexdigest() != matches[0]["sha256"]:
            raise RuntimeError("preparation_run_producer_fd_hash")
        os.lseek(fd, 0, os.SEEK_SET)
        namespace: dict[str, Any] = {
            "__file__": str(producer_path),
            "__name__": "admitted_operational_preparation_producer",
            "__package__": None,
        }
        exec(compile(producer_observed[0], str(producer_path), "exec"), namespace)
        entrypoint = namespace.get("run_admitted_preparation")
        if not callable(entrypoint):
            raise RuntimeError("preparation_run_entrypoint_missing")
        if (identity(os.fstat(fd)) != identity(opened) or
                identity(producer_path.lstat()) != identity(opened)):
            raise RuntimeError("preparation_run_producer_changed")
        result = entrypoint(
            args.adapter, producer_input, str(report_path),
            args.admission_report_sha256, args.producer_input_sha256, str(output))
        print(json.dumps(result, sort_keys=True))
    finally:
        os.close(fd)
    return 0

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--request")
    parser.add_argument("--request-sha256")
    parser.add_argument("--run-preparation", action="store_true")
    parser.add_argument("--materialized-root")
    parser.add_argument("--admission-report")
    parser.add_argument("--admission-report-sha256")
    parser.add_argument("--producer-input")
    parser.add_argument("--producer-input-sha256")
    parser.add_argument("--adapter", choices=("api", "frontend"))
    parser.add_argument("--output")
    args = parser.parse_args()
    os.umask(0o077)
    if args.run_preparation:
        try:
            return run_materialized_preparation(args)
        except Exception as error:
            print(canonical({"result": "P00_PREPARATION_PRODUCER_DENY",
                             "errors": [str(error)], "automaticRetry": False}).decode(), end="")
            return 2
    request_path = normalized_absolute(args.request)
    bootstrap_errors: list[str] = []
    if request_path is None or not valid_sha(args.request_sha256):
        print(canonical({"result": "P00_AGGREGATE_ADMISSION_DENY",
                         "errors": ["request:authenticated_input"],
                         "consumableMaterialized": False}).decode(), end="")
        return 2
    observed = stable_regular(request_path, {0o600}, args.request_sha256,
                              bootstrap_errors, "request")
    if observed is None:
        print(canonical({"result": "P00_AGGREGATE_ADMISSION_DENY",
                         "errors": sorted(set(bootstrap_errors)),
                         "consumableMaterialized": False}).decode(), end="")
        return 2
    try:
        value = json.loads(observed[0])
    except (UnicodeDecodeError, json.JSONDecodeError):
        print(canonical({"result": "P00_AGGREGATE_ADMISSION_DENY",
                         "errors": ["request:json"],
                         "consumableMaterialized": False}).decode(), end="")
        return 2
    errors, controls, template_info, producer = validate_request(value)
    if errors:
        print(canonical({"result": "P00_AGGREGATE_ADMISSION_DENY",
                         "errors": errors, "consumableMaterialized": False,
                         "automaticRetry": False}).decode(), end="")
        return 2
    try:
        if template_info is None:
            raise RuntimeError("operational_template_unavailable")
        report = materialize(value, controls, template_info, producer)
    except Exception as error:
        print(canonical({"result": "P00_AGGREGATE_ADMISSION_DENY",
                         "errors": [f"materialization:{error}"],
                         "consumableMaterialized": False,
                         "automaticRetry": False}).decode(), end="")
        return 2
    print(canonical(report).decode(), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
