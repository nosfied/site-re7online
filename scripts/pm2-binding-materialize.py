#!/usr/bin/env python3
"""Materialize a PM2 binding from a proven definition and a verified release.

This command never reads PM2 state.  It reuses the exact definition contained in
an authenticated source artifact, binds it to an independently verified immutable
release, and writes a new request/source/definition/evidence set exclusively.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import sys
import tempfile
from typing import Any

SHA256 = re.compile(r"^[0-9a-f]{64}$")
SHA40 = re.compile(r"^[0-9a-f]{40}$")
ROLES = {"candidate", "rollback"}
COMPONENTS = {"api", "frontend", "worker"}
API_PROCESS = "re7-whatsapp-agent"
API_ENTRY = PurePosixPath("dist/index.js")
API_ORIGIN_KIND = "CONVERTA_PM2_API_SOURCE_ORIGIN_V1"
API_ORIGIN_KEYS = {
    "schemaVersion", "kind", "processName", "canonicalConfig", "rotation",
    "functionalOverlay", "persistentRoot",
}
FILE_BINDING_KEYS = {"path", "sha256"}
WORKER_PROCESS = "re7-whatsapp-web-worker"
WORKER_STABLE_ROOT = Path("/opt/re7online/current/worker")
WORKER_LEGACY_APP_KEYS = {
    "name", "script", "args", "cwd", "interpreter", "exec_mode", "instances",
    "autorestart", "out_file", "error_file", "merge_logs", "watch", "env",
}
WORKER_LEGACY_ENV_METADATA = {
    "HOME", "LANG", "PATH", "PM2_HOME", "PM2_JSON_PROCESSING", "PM2_USAGE",
    "PWD", "USER", "re7-whatsapp-web-worker", "unique_id",
}


class Denied(RuntimeError):
    pass


def deny(reason: str) -> None:
    raise Denied(reason)


def canonical(value: Any) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True) + "\n").encode()


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def expected_digest(value: str, label: str) -> str:
    if not SHA256.fullmatch(value):
        deny(f"{label}_invalid")
    return value


def stable_regular(path: Path, *, private: bool) -> bytes:
    flags = os.O_RDONLY | os.O_CLOEXEC | getattr(os, "O_NOFOLLOW", 0)
    try:
        fd = os.open(path, flags)
    except OSError as error:
        deny(f"read_failed:{path.name}:{error.errno}")
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode):
            deny(f"not_regular:{path.name}")
        if private and (stat.S_IMODE(before.st_mode) != 0o600 or before.st_uid != os.geteuid()):
            deny(f"private_identity:{path.name}")
        chunks = []
        while True:
            chunk = os.read(fd, 1024 * 1024)
            if not chunk:
                break
            chunks.append(chunk)
        after = os.fstat(fd)
        identity = lambda item: (item.st_dev, item.st_ino, item.st_mode, item.st_size,
                                 item.st_mtime_ns, item.st_ctime_ns)
        if identity(before) != identity(after):
            deny(f"changed_during_read:{path.name}")
        raw = b"".join(chunks)
        if len(raw) != after.st_size:
            deny(f"short_read:{path.name}")
        return raw
    finally:
        os.close(fd)


def json_object(raw: bytes, label: str) -> dict[str, Any]:
    try:
        value = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError):
        deny(f"invalid_json:{label}")
    if not isinstance(value, dict):
        deny(f"not_object:{label}")
    return value


def run_json(command: list[str], label: str) -> dict[str, Any]:
    completed = subprocess.run(command, text=True, capture_output=True, timeout=180)
    if completed.returncode != 0:
        deny(f"{label}_failed:{completed.returncode}")
    try:
        value = json.loads(completed.stdout)
    except json.JSONDecodeError:
        deny(f"{label}_invalid_output")
    if not isinstance(value, dict):
        deny(f"{label}_invalid_output")
    return value


def exact_object(value: Any, keys: set[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != keys:
        deny(f"{label}_shape")
    return value


def file_binding(value: Any, label: str, *, private: bool) -> tuple[Path, bytes, dict[str, Any]]:
    binding = exact_object(value, FILE_BINDING_KEYS, label)
    path = Path(str(binding.get("path", "")))
    if not path.is_absolute():
        deny(f"{label}_path")
    raw = stable_regular(path, private=private)
    if digest(raw) != expected_digest(str(binding.get("sha256", "")), f"{label}_sha256"):
        deny(f"{label}_sha256_mismatch")
    return path, raw, json_object(raw, label)


def load_cjs_configuration(node: Path, path: Path) -> dict[str, Any]:
    if not node.is_absolute():
        deny("api_node_not_absolute")
    program = (
        "const value=require(process.argv[1]);"
        "if(!value||typeof value!=='object'||Array.isArray(value))process.exit(41);"
        "process.stdout.write(JSON.stringify(value));"
    )
    completed = subprocess.run(
        [str(node), "-e", program, str(path)], text=True, capture_output=True, timeout=30,
        env={**os.environ, "NODE_OPTIONS": "--no-deprecation"},
    )
    if completed.returncode != 0:
        deny(f"api_configuration_load_failed:{completed.returncode}")
    try:
        value = json.loads(completed.stdout)
    except json.JSONDecodeError:
        deny("api_configuration_load_invalid")
    if not isinstance(value, dict):
        deny("api_configuration_load_invalid")
    return value


def pm2_row(pm2: Path, pm2_home: Path | None, process_name: str) -> dict[str, Any]:
    if not pm2.is_absolute():
        deny("api_pm2_not_absolute")
    environment = dict(os.environ)
    if pm2_home is not None:
        if not pm2_home.is_absolute():
            deny("api_pm2_home_not_absolute")
        environment["PM2_HOME"] = str(pm2_home)
    version = subprocess.run(
        [str(pm2), "--version"], text=True, capture_output=True, timeout=30, env=environment)
    if version.returncode != 0 or version.stdout.strip() != "6.0.14":
        deny("api_pm2_version")
    observed = subprocess.run(
        [str(pm2), "jlist"], text=True, capture_output=True, timeout=30, env=environment)
    if observed.returncode != 0:
        deny(f"api_pm2_jlist_failed:{observed.returncode}")
    try:
        rows = json.loads(observed.stdout)
    except json.JSONDecodeError:
        deny("api_pm2_jlist_invalid")
    matches = [row for row in rows if isinstance(row, dict) and row.get("name") == process_name]
    if len(matches) != 1 or not isinstance(matches[0].get("pm2_env"), dict):
        deny("api_pm2_process_identity")
    return matches[0]


def project_api_source(args: argparse.Namespace) -> tuple[bytes, dict[str, Any], dict[str, Any]]:
    origin_raw = stable_regular(args.api_origin, private=True)
    if digest(origin_raw) != expected_digest(args.api_origin_sha256, "api_origin_sha256"):
        deny("api_origin_sha256_mismatch")
    origin = exact_object(json_object(origin_raw, "api_origin"), API_ORIGIN_KEYS, "api_origin")
    if (origin.get("schemaVersion") != 1 or origin.get("kind") != API_ORIGIN_KIND or
            origin.get("processName") != API_PROCESS or
            origin.get("persistentRoot") != str(args.persistent_root)):
        deny("api_origin_identity")
    if not args.persistent_root.is_absolute():
        deny("api_persistent_root")

    config_binding = exact_object(
        origin["canonicalConfig"], FILE_BINDING_KEYS, "api_canonical_config")
    config_path = Path(str(config_binding.get("path", "")))
    if not config_path.is_absolute():
        deny("api_canonical_config_path")
    config_raw = stable_regular(config_path, private=True)
    if digest(config_raw) != expected_digest(
            str(config_binding.get("sha256", "")), "api_canonical_config_sha256"):
        deny("api_canonical_config_sha256_mismatch")
    rotation = exact_object(origin["rotation"], {"preparation", "execution", "closure"},
                            "api_rotation")
    preparation_path, _, preparation = file_binding(
        rotation["preparation"], "api_rotation_preparation", private=True)
    execution_path, _, execution = file_binding(
        rotation["execution"], "api_rotation_execution", private=True)
    closure_path, _, closure = file_binding(
        rotation["closure"], "api_rotation_closure", private=True)
    if (preparation.get("result") != "OBS2_PRIVATE_DEFINITIONS_READY" or
            preparation.get("files", {}).get("candidate") != str(config_path) or
            preparation.get("onlyObs2Differs") is not True or
            preparation.get("obs1Unchanged") is not True or
            preparation.get("productionChanged") is not False):
        deny("api_rotation_preparation_authority")
    final_checks = execution.get("finalChecks")
    if (execution.get("result") != "OBS2_PREVIOUS_VALUE_DESTROYED" or
            execution.get("state") != "API_STABLE" or not isinstance(final_checks, dict) or
            not final_checks or not all(value is True for value in final_checks.values())):
        deny("api_rotation_execution_authority")
    removed = {
        item.get("path") for item in closure.get("inventory", []) if isinstance(item, dict) and
        item.get("finalDisposition") == "REMOVED"
    }
    if (closure.get("result") != "OBS2_PREVIOUS_VALUE_DESTROYED" or
            closure.get("activeDefinitionsReferenceCurrentObs2") is not True or
            str(config_path) in removed):
        deny("api_rotation_closure_authority")

    overlay = exact_object(origin["functionalOverlay"],
                           {"deploymentRecord", "environment"}, "api_functional_overlay")
    record_path, _, record = file_binding(
        overlay["deploymentRecord"], "api_overlay_deployment_record", private=False)
    overlay_environment = exact_object(
        overlay["environment"], {"TEMPLATE_MEDIA_ROOT"}, "api_overlay_environment")
    media_root = overlay_environment["TEMPLATE_MEDIA_ROOT"]
    if (record.get("schemaVersion") != 5 or record.get("status") != "DEPLOYED_VERIFIED" or
            record.get("persistentStorage", {}).get("templateMediaRoot") != media_root or
            media_root != "/opt/re7online/content/template-campaign-media"):
        deny("api_overlay_authority")

    configuration = load_cjs_configuration(args.node, config_path)
    apps = configuration.get("apps")
    if not isinstance(apps, list):
        deny("api_configuration_apps")
    matches = [app for app in apps if isinstance(app, dict) and app.get("name") == API_PROCESS]
    if len(matches) != 1:
        deny("api_configuration_process_identity")
    original = matches[0]
    environment = original.get("env")
    if not isinstance(environment, dict) or not all(isinstance(k, str) and isinstance(v, str)
                                                    for k, v in environment.items()):
        deny("api_configuration_environment")
    if "INBOX_READ_STATE_ROOT" in environment or "TEMPLATE_MEDIA_ROOT" in environment:
        deny("api_configuration_unexpected_overlay")
    try:
        source_entry = Path(str(original.get("script", ""))).relative_to(
            Path(str(original.get("cwd", ""))))
    except ValueError:
        deny("api_configuration_entry_outside_cwd")
    if PurePosixPath(source_entry.as_posix()) != API_ENTRY:
        deny("api_configuration_entry")
    stable_root = Path(str(original.get("cwd", "")))
    interpreter = Path(str(original.get("interpreter", "")))
    if (not stable_root.is_absolute() or not interpreter.is_absolute() or
            original.get("exec_mode") not in {"fork", "fork_mode"} or
            original.get("instances") != 1 or original.get("autorestart") is not True or
            original.get("args") != [] or original.get("node_args") != [] or
            original.get("watch") is not False):
        deny("api_configuration_structure")

    allowlist_path = args.control.with_name("pm2-definition-env-allowlist.v1.json")
    allowlist = json_object(stable_regular(allowlist_path, private=False), "api_allowlist")
    api_roles = allowlist.get("components", {}).get("api", {})
    allowed = set(api_roles.get("common", [])) | set(api_roles.get("candidate", [])) | set(
        api_roles.get("rollbackCompatibility", []))
    if not allowed or "INBOX_READ_STATE_ROOT" not in allowed or "TEMPLATE_MEDIA_ROOT" not in allowed:
        deny("api_allowlist_identity")
    if set(environment) - allowed:
        deny("api_configuration_environment_allowlist")
    if not isinstance(original.get("out_file"), str) or not isinstance(
            original.get("error_file"), str):
        deny("api_configuration_log_paths")
    selected_environment = {key: environment[key] for key in sorted(set(environment) & allowed)}
    selected_environment["TEMPLATE_MEDIA_ROOT"] = media_root
    selected_environment["INBOX_READ_STATE_ROOT"] = str(args.persistent_root)

    row = pm2_row(args.pm2, args.pm2_home, API_PROCESS)
    loaded = row["pm2_env"]
    live_environment = loaded.get("env")
    if not isinstance(live_environment, dict):
        deny("api_pm2_environment")
    expected_live = {key: value for key, value in selected_environment.items()
                     if key != "INBOX_READ_STATE_ROOT"}
    observed_live = {key: str(value) for key, value in live_environment.items() if key in allowed}
    if expected_live != observed_live or "INBOX_READ_STATE_ROOT" in live_environment:
        deny("api_pm2_functional_environment_drift")
    if (loaded.get("pm_cwd") != str(original.get("cwd")) or
            loaded.get("pm_exec_path") != str(original.get("script")) or
            loaded.get("exec_interpreter") != original.get("interpreter") or
            loaded.get("exec_mode") != "fork_mode" or
            int(loaded.get("instances") or 1) != 1 or loaded.get("namespace") != "default" or
            loaded.get("autorestart") is not True or int(loaded.get("kill_timeout")) != 1600 or
            int(loaded.get("listen_timeout")) != 3000 or
            bool(loaded.get("wait_ready", False)) is not False or
            bool(loaded.get("merge_logs", False)) is not True):
        deny("api_pm2_structure_drift")

    definition = {"apps": [{
        "name": API_PROCESS, "script": str(stable_root / API_ENTRY), "args": [],
        "cwd": str(stable_root), "interpreter": str(interpreter),
        "exec_mode": "fork_mode", "instances": 1, "namespace": "default",
        "autorestart": True, "restart_delay": 0, "kill_timeout": 1600,
        "listen_timeout": 3000, "wait_ready": False, "node_args": [],
        "out_file": original.get("out_file"), "error_file": original.get("error_file"),
        "merge_logs": True, "watch": False, "env": selected_environment,
    }]}
    request = {
        "schemaVersion": 2, "scope": args.scope, "role": args.role, "component": "api",
        "sourceKind": ("canonical-private-config" if args.role == "candidate" else
                       "authenticated-proven-definition"),
        "environmentKeys": sorted(selected_environment),
    }
    evidence = {
        "originSha256": digest(origin_raw),
        "canonicalConfigSha256": digest(config_raw),
        "canonicalConfigIdentity": physical_identity(config_path),
        "rotationAuthorities": {
            "preparation": {"path": str(preparation_path), "sha256": rotation["preparation"]["sha256"]},
            "execution": {"path": str(execution_path), "sha256": rotation["execution"]["sha256"]},
            "closure": {"path": str(closure_path), "sha256": rotation["closure"]["sha256"]},
        },
        "functionalOverlayAuthority": {"path": str(record_path),
                                         "sha256": overlay["deploymentRecord"]["sha256"]},
        "pm2Version": "6.0.14", "pm2ComparisonOnly": True,
        "observedFunctionalEnvironmentKeys": sorted(observed_live),
        "absentOptionalEnvironmentKeys": sorted((allowed - set(selected_environment))),
    }
    return canonical(request), definition, evidence


def component_identity(release_root: Path, release_id: str, target: str,
                       producer: Path, component: str,
                       deployed_marker_sha256: str | None = None) -> tuple[dict[str, Any], dict[str, Any]]:
    manifest_path = release_root / "manifest.json"
    legacy_worker = component == "worker" and not manifest_path.exists()
    if legacy_worker:
        manifest_path = release_root / "release-manifest.json"
    manifest_raw = stable_regular(manifest_path, private=False)
    manifest = json_object(manifest_raw, "manifest")
    components = manifest.get("components")
    if components not in (["api", "frontend"], ["api", "frontend", "worker"]):
        deny("release_manifest_components")
    if component not in components:
        deny("release_component_missing")
    command = None
    if legacy_worker:
        if deployed_marker_sha256 is None:
            deny("legacy_worker_deployed_marker_required")
        first = {"result": "LEGACY_RELEASE_AUTHORITY_VERIFIED", "releaseId": release_id,
                 "targetCommit": target}
        index_path = release_root / "release-index.json"
    else:
        command = [sys.executable, str(producer), "verify", "--release-root", str(release_root),
                   "--target", target, "--release-id", release_id,
                   "--components", ",".join(components)]
        if deployed_marker_sha256 is not None:
            command.extend(("--deployed-marker-sha256", deployed_marker_sha256))
        first = run_json(command, "release_verify_before")
        if first.get("result") != "RELEASE VERIFIED":
            deny("release_verify_result")
        index_path = release_root / "index.sha256"

    index_raw = stable_regular(index_path, private=False)
    index = json_object(index_raw, "index")
    if manifest.get("releaseId") != release_id or manifest.get("targetCommit") != target:
        deny("release_manifest_identity")
    declared_index = manifest.get("runtimeIndexSha256") if legacy_worker else manifest.get("indexSha256")
    if declared_index != digest(index_raw):
        deny("release_index_digest")
    entries = index.get("entries")
    prefix = f"{component}-runtime/"
    if not isinstance(entries, list):
        deny("release_index_entries")
    selected = [item for item in entries if isinstance(item, dict) and
                isinstance(item.get("path"), str) and
                (item["path"] == f"{component}-runtime" or item["path"].startswith(prefix))]
    if not selected:
        deny("component_index_empty")
    tree = {"schemaVersion": 1, "component": component, "entries": selected}
    runtime = release_root / f"{component}-runtime"
    build_id = None
    if component == "frontend":
        build_raw = stable_regular(runtime / ".next/BUILD_ID", private=False)
        try:
            build_id = build_raw.decode("ascii").rstrip("\n")
        except UnicodeDecodeError:
            deny("frontend_build_id_encoding")
        if not build_id or any(character.isspace() for character in build_id):
            deny("frontend_build_id")

    if legacy_worker:
        relative = "worker-runtime/dist/whatsapp-web-worker/src/index.js"
        matches = [item for item in selected if item.get("path") == relative]
        entry = release_root / relative
        if (len(matches) != 1 or matches[0].get("type") != "file" or
                matches[0].get("sha256") != digest(stable_regular(entry, private=False)) or
                manifest.get("workerEntrypoint") != relative or
                manifest.get("workerEntrypointSha256") != matches[0].get("sha256")):
            deny("legacy_worker_entry_identity")
        second = first
    else:
        assert command is not None
        second = run_json(command, "release_verify_after")
        if first != second:
            deny("release_verification_drift")
    evidence = {
        "schemaVersion": 1,
        "releaseId": release_id,
        "targetCommit": target,
        "component": component,
        "releaseManifestSha256": digest(manifest_raw),
        "releaseIndexSha256": digest(index_raw),
        "componentTreeSha256": digest(canonical(tree)),
        "producerVerification": first,
        "releaseAuthorityKind": "legacy-enumerated-release" if legacy_worker else "immutable-release-v2",
        "releaseManifestName": manifest_path.name,
        "releaseIndexName": index_path.name,
    }
    if build_id is not None:
        evidence["frontendBuildId"] = build_id
    return evidence, {"runtime": runtime, "manifest": manifest}


def physical_identity(path: Path) -> dict[str, int | str]:
    info = path.lstat()
    return {
        "device": info.st_dev, "inode": info.st_ino, "uid": info.st_uid,
        "gid": info.st_gid, "mode": f"{stat.S_IMODE(info.st_mode):04o}",
    }


def physical_identity_literal(value: dict[str, int | str]) -> str:
    return (f"{value['device']}:{value['inode']}:{value['uid']}:{value['gid']}:"
            f"{value['mode']}")


def project_legacy_worker(raw_source: dict[str, Any], request: dict[str, Any],
                          runtime: Path) -> tuple[dict[str, Any], Path]:
    if set(raw_source) != {"apps"} or not isinstance(raw_source["apps"], list) or len(raw_source["apps"]) != 1:
        deny("legacy_worker_source_shape")
    original = raw_source["apps"][0]
    if not isinstance(original, dict) or set(original) != WORKER_LEGACY_APP_KEYS:
        deny("legacy_worker_app_shape")
    if original.get("name") != WORKER_PROCESS or original.get("args") != []:
        deny("legacy_worker_process_identity")
    if original.get("interpreter") != "/usr/bin/node" or original.get("exec_mode") != "fork_mode":
        deny("legacy_worker_runtime_identity")
    if original.get("instances") != 1 or original.get("autorestart") is not True:
        deny("legacy_worker_cardinality")
    if type(original.get("merge_logs")) is not bool or type(original.get("watch")) is not bool:
        deny("legacy_worker_log_identity")
    cwd = Path(str(original.get("cwd", "")))
    script = Path(str(original.get("script", "")))
    try:
        relative_entry = script.relative_to(cwd)
    except ValueError:
        deny("worker_entry_outside_cwd")
    if not relative_entry.parts or ".." in PurePosixPath(relative_entry.as_posix()).parts:
        deny("worker_entry_relative")
    stable_regular(runtime / relative_entry, private=False)
    environment = original.get("env")
    if not isinstance(environment, dict):
        deny("legacy_worker_environment")
    requested = request.get("environmentKeys")
    if set(environment) != set(requested) | WORKER_LEGACY_ENV_METADATA:
        deny("legacy_worker_environment_coverage")
    if not all(isinstance(environment[key], str) for key in requested):
        deny("legacy_worker_environment_value")
    projected = {
        "name": WORKER_PROCESS,
        "script": str(WORKER_STABLE_ROOT / relative_entry),
        "args": [],
        "cwd": str(WORKER_STABLE_ROOT),
        "interpreter": "/usr/bin/node",
        "exec_mode": "fork_mode",
        "instances": 1,
        "namespace": "default",
        "autorestart": True,
        # These are the authenticated PM2 6.0.14 defaults used when the
        # historical files omitted the fields. They are explicit in the
        # successor definition so validation and rollback are deterministic.
        "restart_delay": 0,
        "kill_timeout": 1600,
        "listen_timeout": 3000,
        "wait_ready": False,
        "node_args": [],
        "out_file": original["out_file"],
        "error_file": original["error_file"],
        "merge_logs": original["merge_logs"],
        "watch": original["watch"],
        "env": {key: environment[key] for key in requested},
    }
    return {"apps": [projected]}, relative_entry


def write_exclusive(path: Path, raw: bytes) -> None:
    if path.exists() or path.is_symlink():
        deny(f"output_exists:{path.name}")
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600)
    try:
        with os.fdopen(fd, "wb", closefd=False) as handle:
            handle.write(raw)
            handle.flush()
            os.fsync(fd)
    finally:
        os.close(fd)


def materialize(args: argparse.Namespace) -> dict[str, Any]:
    component = args.component
    if args.role not in ROLES or component not in COMPONENTS or not SHA40.fullmatch(args.target):
        deny("argument_identity")
    marker = args.release_root / "DEPLOYED"
    if args.deployed_marker_sha256 is not None:
        expected_digest(args.deployed_marker_sha256, "deployed_marker_sha256")
        if args.role != "rollback":
            deny("candidate_operational_marker_forbidden")
        if not marker.is_file() or marker.is_symlink() or digest(stable_regular(marker, private=False)) != args.deployed_marker_sha256:
            deny("deployed_marker_sha256_mismatch")
    if (marker.exists() or marker.is_symlink()) and args.deployed_marker_sha256 is None:
        deny("deployed_marker_sha256_required")
    path_inputs = [("release_root", args.release_root), ("producer", args.producer),
                   ("control", args.control), ("output", args.output)]
    if component == "api":
        path_inputs.append(("api_origin", getattr(args, "api_origin", None)))
    else:
        path_inputs.extend((("template_request", args.template_request),
                            ("template_source", args.template_source)))
    for label, path in path_inputs:
        if not isinstance(path, Path):
            deny(f"{label}_required")
        if not path.is_absolute():
            deny(f"{label}_not_absolute")
    output_parent = args.output.parent
    parent_info = output_parent.lstat()
    if (not stat.S_ISDIR(parent_info.st_mode) or output_parent.is_symlink() or
            parent_info.st_uid != os.geteuid() or stat.S_IMODE(parent_info.st_mode) & 0o022):
        deny("output_parent_identity")
    producer_raw = stable_regular(args.producer, private=False)
    control_raw = stable_regular(args.control, private=False)
    if digest(producer_raw) != expected_digest(args.producer_sha256, "producer_sha256"):
        deny("producer_sha256_mismatch")
    if digest(control_raw) != expected_digest(args.control_sha256, "control_sha256"):
        deny("control_sha256_mismatch")
    api_evidence: dict[str, Any] | None = None
    if component == "api":
        if any(getattr(args, name, None) is None for name in
               ("api_origin_sha256", "persistent_root", "node", "pm2")):
            deny("api_arguments_required")
        request_raw, definition, api_evidence = project_api_source(args)
        request = json_object(request_raw, "api_request")
        source: dict[str, Any] = {}
        source_identity = api_evidence["canonicalConfigIdentity"]
        legacy_worker = False
    else:
        request_raw = stable_regular(args.template_request, private=True)
        source_raw = stable_regular(args.template_source, private=True)
        if digest(request_raw) != expected_digest(args.template_request_sha256, "template_request_sha256"):
            deny("template_request_sha256_mismatch")
        if digest(source_raw) != expected_digest(args.template_source_sha256, "template_source_sha256"):
            deny("template_source_sha256_mismatch")
        source_identity = physical_identity(args.template_source)
        if component == "worker":
            if (not isinstance(args.template_source_identity, str) or
                    args.template_source_identity != physical_identity_literal(source_identity)):
                deny("template_source_physical_identity")
        elif args.template_source_identity is not None:
            deny("template_source_identity_unexpected")
        request = json_object(request_raw, "template_request")
        source = json_object(source_raw, "template_source")
        legacy_worker = component == "worker" and set(source) == {"apps"}
        if not legacy_worker:
            if source.get("role") != args.role or source.get("component") != component:
                deny("template_source_identity")
            with tempfile.TemporaryDirectory(prefix="pm2-binding-validate-") as temporary:
                probe = Path(temporary) / "definition.json"
                run_json([sys.executable, str(args.control), "build", "--request", str(args.template_request),
                          "--source-artifact", str(args.template_source), "--source-sha256", args.template_source_sha256,
                          "--output", str(probe)], "template_binding_validation")
    if request.get("role") != args.role or request.get("component") != component:
        deny("template_request_identity")

    release_evidence, release = component_identity(
        args.release_root.resolve(strict=True), args.release_id, args.target,
        args.producer, component, args.deployed_marker_sha256)
    if component == "api":
        relative_entry = Path(API_ENTRY.as_posix())
    elif legacy_worker:
        definition, relative_entry = project_legacy_worker(source, request, release["runtime"])
    else:
        definition = source.get("definition")
        relative_entry = None
    if not isinstance(definition, dict) or not isinstance(definition.get("apps"), list) or len(definition["apps"]) != 1:
        deny("template_definition")
    app = definition["apps"][0]
    if relative_entry is None:
        cwd = Path(str(app.get("cwd", "")))
        script = Path(str(app.get("script", "")))
        try:
            relative_entry = script.relative_to(cwd)
        except ValueError:
            deny(f"{component}_entry_outside_cwd")
        if not relative_entry.parts or ".." in PurePosixPath(relative_entry.as_posix()).parts:
            deny(f"{component}_entry_relative")
    entry_raw = stable_regular(release["runtime"] / relative_entry, private=False)
    release_identity = {
        "releaseId": args.release_id,
        "releaseManifestSha256": release_evidence["releaseManifestSha256"],
        "componentTreeSha256": release_evidence["componentTreeSha256"],
    }
    if component == "frontend":
        release_identity.update({
            "frontendBuildId": release_evidence["frontendBuildId"],
            "frontendEntrySha256": digest(entry_raw),
        })
    elif component == "api":
        release_identity["apiEntrySha256"] = digest(entry_raw)
    else:
        release_identity["workerEntrySha256"] = digest(entry_raw)
    provenance: dict[str, Any] = {
        **release_evidence,
        "role": args.role,
        "producerSha256": digest(producer_raw),
        "controlSha256": digest(control_raw),
        "releaseIdentity": release_identity,
        "definitionSha256": digest(canonical(definition)),
        "templateSourceIdentity": source_identity,
    }
    if component == "api":
        assert api_evidence is not None
        provenance.update(api_evidence)
        provenance.update({
            "apiOriginSha256": digest(stable_regular(args.api_origin, private=True)),
            "derivation": "authenticated-api-config-projected-and-compared-to-pm2-6.0.14",
            "pm2IntrospectionUsed": True,
            "pm2IntrospectionPurpose": "comparison-only",
        })
    else:
        provenance.update({
            "templateRequestSha256": digest(request_raw),
            "templateSourceSha256": digest(source_raw),
            "derivation": ("authenticated-legacy-worker-projection-rebound-to-verified-release"
                           if legacy_worker else "authenticated-definition-rebound-to-verified-release"),
            "pm2IntrospectionUsed": False,
        })
    evidence_raw = canonical(provenance)
    rebound = {
        "schemaVersion": 1,
        "role": args.role,
        "component": component,
        "sourceKind": request["sourceKind"],
        "provenance": {
            "authority": "new-release-config" if args.role == "candidate" else "proven-production-definition",
            "evidenceSha256": digest(evidence_raw),
        },
        "releaseIdentity": release_identity,
        "definition": definition,
    }

    args.output.mkdir(mode=0o700)
    if stat.S_IMODE(args.output.stat().st_mode) != 0o700:
        deny("output_directory_mode")
    parent_fd = os.open(output_parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(parent_fd)
    finally:
        os.close(parent_fd)
    write_exclusive(args.output / "request.private.json", request_raw)
    write_exclusive(args.output / "binding-evidence.private.json", evidence_raw)
    source_path = args.output / "source.private.json"
    write_exclusive(source_path, canonical(rebound))
    definition_path = args.output / "definition.private.json"
    built = run_json([sys.executable, str(args.control), "build",
                      "--request", str(args.output / "request.private.json"),
                      "--source-artifact", str(source_path),
                      "--source-sha256", digest(canonical(rebound)),
                      "--output", str(definition_path)], "rebound_binding_build")
    directory_fd = os.open(args.output, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)
    return {
        "result": "PM2_BINDING_MATERIALIZED",
        "role": args.role,
        "component": component,
        "releaseId": args.release_id,
        "requestSha256": digest(request_raw),
        "sourceSha256": digest(canonical(rebound)),
        "definitionSha256": digest(canonical(definition)),
        "evidenceSha256": digest(evidence_raw),
        "controlResult": built.get("result"),
    }


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser(description=__doc__)
    value.add_argument("--role", required=True)
    value.add_argument("--component", choices=sorted(COMPONENTS), default="frontend")
    value.add_argument("--target", required=True)
    value.add_argument("--release-id", required=True)
    value.add_argument("--release-root", type=Path, required=True)
    value.add_argument("--deployed-marker-sha256")
    value.add_argument("--producer", type=Path, required=True)
    value.add_argument("--producer-sha256", required=True)
    value.add_argument("--control", type=Path, required=True)
    value.add_argument("--control-sha256", required=True)
    value.add_argument("--template-request", type=Path)
    value.add_argument("--template-request-sha256")
    value.add_argument("--template-source", type=Path)
    value.add_argument("--template-source-sha256")
    value.add_argument("--template-source-identity",
                       help="closed worker source identity: device:inode:uid:gid:mode")
    value.add_argument("--api-origin", type=Path)
    value.add_argument("--api-origin-sha256")
    value.add_argument("--persistent-root", type=Path)
    value.add_argument("--scope", choices=("production", "isolated-test"), default="production")
    value.add_argument("--node", type=Path, default=Path("/usr/bin/node"))
    value.add_argument("--pm2", type=Path)
    value.add_argument("--pm2-home", type=Path)
    value.add_argument("--output", type=Path, required=True)
    return value


def main() -> int:
    try:
        result = materialize(parser().parse_args())
    except (Denied, OSError, KeyError, TypeError, subprocess.TimeoutExpired) as error:
        print(f"PM2_BINDING_DENY:{error}", file=sys.stderr)
        return 2
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
