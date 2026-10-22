#!/usr/bin/env python3
"""Build and validate PM2 definitions from authenticated physical sources.

Requests select a repository-owned environment allowlist subset. They never carry
commands, environment values, or a self-declared source digest. The source of each
definition is a separate private file whose byte digest is supplied by an external
authenticated record. No environment value is printed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import stat
import sys
import tempfile
import unicodedata
from pathlib import Path
from typing import Any, Callable

SCHEMA_VERSION = 2
SOURCE_SCHEMA_VERSION = 1
SHA256 = re.compile(r"^[0-9a-f]{64}$")
ENV_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
ALLOWLIST_PATH = Path(__file__).with_name("pm2-definition-env-allowlist.v1.json")
REQUEST_KEYS = {"schemaVersion", "scope", "role", "component", "sourceKind", "environmentKeys"}
SOURCE_KEYS = {
    "schemaVersion", "role", "component", "sourceKind", "provenance",
    "releaseIdentity", "definition",
}
PROVENANCE_KEYS = {"authority", "evidenceSha256"}
RELEASE_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")
RELEASE_COMMON_KEYS = {"releaseId", "releaseManifestSha256", "componentTreeSha256"}
RELEASE_COMPONENT_KEYS = {
    "api": RELEASE_COMMON_KEYS | {"apiEntrySha256"},
    "frontend": RELEASE_COMMON_KEYS | {"frontendBuildId", "frontendEntrySha256"},
    "worker": RELEASE_COMMON_KEYS | {"workerEntrySha256"},
}
REQUIRED_STRUCTURE_KEYS = {
    "name", "script", "args", "cwd", "interpreter", "exec_mode", "instances",
    "namespace", "autorestart", "restart_delay", "kill_timeout", "listen_timeout",
    "wait_ready", "node_args",
}
OPTIONAL_STRUCTURE_KEYS = {"out_file", "error_file", "log_file", "merge_logs", "watch"}
STRUCTURE_KEYS = REQUIRED_STRUCTURE_KEYS | OPTIONAL_STRUCTURE_KEYS
SOURCE_KINDS = {
    "candidate": "canonical-private-config",
    "rollback": "authenticated-proven-definition",
}
SOURCE_AUTHORITIES = {
    "candidate": "new-release-config",
    "rollback": "proven-production-definition",
}


class Denied(ValueError):
    pass


def deny(reason: str) -> None:
    raise Denied(reason)


def canonical(value: Any) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode()


def digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def normalized_key(value: str) -> str:
    folded = unicodedata.normalize("NFKC", value).casefold()
    return "".join(character for character in folded if character.isalnum())


EXPLICITLY_DENIED_PM2_FIELDS = {
    "cron_restart", "max_memory_restart", "min_uptime", "max_restarts",
    "exp_backoff_restart_delay", "instance_var", "increment_var",
    "append_env_to_name", "filter_env",
}
FORBIDDEN_ENV_KEYS = {
    normalized_key(value)
    for value in (
        *STRUCTURE_KEYS,
        *EXPLICITLY_DENIED_PM2_FIELDS,
        "env", "pm_exec_path", "pm_cwd", "PM2_HOME", "NODE_APP_INSTANCE",
        "pm_id", "pm_pid_path", "pm_err_log_path", "pm_out_log_path", "pm_log_path",
        "status", "restart_time", "unstable_restarts", "created_at", "pm_uptime",
    )
}


def validate_exact_keys(value: Any, expected: set[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        deny(f"{label}_not_object")
    if set(value) != expected:
        deny(f"{label}_keys")
    return value


def validate_absolute_path(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value or not Path(value).is_absolute():
        deny(f"{label}_not_absolute")
    return value


def validate_string_list(value: Any, label: str) -> list[str]:
    if not isinstance(value, list) or not all(isinstance(item, str) and item for item in value):
        deny(f"{label}_not_string_array")
    return value


ALLOWLIST_ROLES = {"common", "candidate", "rollbackCompatibility"}


def load_repository_allowlist() -> dict[str, dict[str, set[str]]]:
    try:
        value = json.loads(ALLOWLIST_PATH.read_text())
    except (OSError, json.JSONDecodeError):
        deny("repository_allowlist_unreadable")
    validate_exact_keys(value, {"schemaVersion", "components"}, "repository_allowlist")
    if value["schemaVersion"] != 2:
        deny("repository_allowlist_schema")
    components = validate_exact_keys(
        value["components"], {"api", "frontend", "worker"}, "repository_allowlist_components"
    )
    result: dict[str, dict[str, set[str]]] = {}
    for component, raw_roles in components.items():
        roles = validate_exact_keys(raw_roles, ALLOWLIST_ROLES, f"repository_allowlist_{component}")
        result[component] = {}
        all_keys: list[str] = []
        for role, raw_keys in roles.items():
            keys = validate_string_list(raw_keys, f"repository_allowlist_{component}_{role}")
            if keys != sorted(keys) or len(set(keys)) != len(keys):
                deny(f"repository_allowlist_{component}_{role}_order")
            if len({normalized_key(key) for key in keys}) != len(keys):
                deny(f"repository_allowlist_{component}_{role}_normalized_duplicate")
            for key in keys:
                normalized = normalized_key(key)
                if not ENV_NAME.fullmatch(key) or normalized in FORBIDDEN_ENV_KEYS or normalized.startswith("pm"):
                    deny(f"repository_allowlist_{component}_{role}_unsafe")
            result[component][role] = set(keys)
            all_keys.extend(keys)
        if len({normalized_key(key) for key in all_keys}) != len(all_keys):
            deny(f"repository_allowlist_{component}_cross_role_duplicate")
    return result


def validate_environment_keys(value: Any, component: str, role: str) -> list[str]:
    keys = validate_string_list(value, "environment_keys")
    if keys != sorted(keys) or len(set(keys)) != len(keys):
        deny("environment_keys_order_or_duplicate")
    if len({normalized_key(key) for key in keys}) != len(keys):
        deny("environment_keys_normalized_duplicate")
    component_allowlist = load_repository_allowlist()[component]
    role_scope = "candidate" if role == "candidate" else "rollbackCompatibility"
    allowed = component_allowlist["common"] | component_allowlist[role_scope]
    for key in keys:
        normalized = normalized_key(key)
        if normalized in FORBIDDEN_ENV_KEYS or normalized.startswith("pm"):
            deny(f"application_env_structural_collision:{key}")
        if not ENV_NAME.fullmatch(key):
            deny("environment_key_invalid")
        if key not in allowed:
            if role == "candidate" and key in component_allowlist["rollbackCompatibility"]:
                deny(f"application_env_rollback_only:{key}")
            deny(f"environment_key_not_repository_allowed:{key}")
    return keys


def validate_request(value: Any) -> dict[str, Any]:
    request = validate_exact_keys(value, REQUEST_KEYS, "request")
    if request["schemaVersion"] != SCHEMA_VERSION:
        deny("schema_version")
    if request["scope"] not in {"production", "isolated-test"}:
        deny("scope")
    if request["role"] not in SOURCE_KINDS:
        deny("role")
    if request["component"] not in {"api", "frontend", "worker"}:
        deny("component")
    if request["sourceKind"] != SOURCE_KINDS[request["role"]]:
        deny("source_kind")
    validate_environment_keys(request["environmentKeys"], request["component"], request["role"])
    return request


def validate_structure(value: Any, component: str, scope: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        deny("structure_not_object")
    keys = set(value)
    if not REQUIRED_STRUCTURE_KEYS <= keys or keys - STRUCTURE_KEYS:
        deny("structure_keys")
    for key in ("name", "namespace"):
        if not isinstance(value[key], str) or not value[key]:
            deny(f"structure_{key}")
    for key in ("script", "cwd", "interpreter"):
        validate_absolute_path(value[key], f"structure_{key}")
    validate_string_list(value["args"], "structure_args")
    validate_string_list(value["node_args"], "structure_node_args")
    if value["exec_mode"] != "fork_mode":
        deny("structure_exec_mode")
    if type(value["instances"]) is not int or value["instances"] != 1:
        deny("structure_instances")
    for key in ("autorestart", "wait_ready"):
        if type(value[key]) is not bool:
            deny(f"structure_{key}")
    for key in ("restart_delay", "kill_timeout", "listen_timeout"):
        if type(value[key]) is not int or value[key] < 0:
            deny(f"structure_{key}")
    for key in ("merge_logs", "watch"):
        if key in value and type(value[key]) is not bool:
            deny(f"structure_{key}")
    for key in ("out_file", "error_file", "log_file"):
        if key in value:
            validate_absolute_path(value[key], f"structure_{key}")
    if component == "frontend":
        args = value["args"]
        if len(args) != 3 or args[0] != "start" or args[1] != "-p" or not args[2].isdigit():
            deny("frontend_structural_args")
        if scope == "production" and args[2] != "3000":
            deny("frontend_production_port")
        if scope == "isolated-test" and args[2] in {"3000", "3001"}:
            deny("frontend_isolated_port")
    return value


def validate_definition_shape(value: Any, request: dict[str, Any]) -> dict[str, Any]:
    definition = validate_exact_keys(value, {"apps"}, "definition")
    apps = definition["apps"]
    if not isinstance(apps, list) or len(apps) != 1 or not isinstance(apps[0], dict):
        deny("definition_apps")
    app = apps[0]
    keys = set(app)
    if "env" not in keys or not REQUIRED_STRUCTURE_KEYS <= keys or keys - (STRUCTURE_KEYS | {"env"}):
        deny("structure_keys")
    structure = {key: app[key] for key in keys if key != "env"}
    validate_structure(structure, request["component"], request["scope"])
    env = app["env"]
    if not isinstance(env, dict):
        deny("application_env_values_not_object")
    selected = validate_environment_keys(request["environmentKeys"], request["component"], request["role"])
    if set(env) != set(selected):
        deny("application_env_allowlist_mismatch")
    for key in selected:
        if not isinstance(env[key], str):
            deny(f"application_env_value_not_string:{key}")
    return definition


def validate_source_artifact(value: Any, request: dict[str, Any]) -> dict[str, Any]:
    source = validate_exact_keys(value, SOURCE_KEYS, "source_artifact")
    if source["schemaVersion"] != SOURCE_SCHEMA_VERSION:
        deny("source_artifact_schema")
    for key in ("role", "component", "sourceKind"):
        if source[key] != request[key]:
            deny(f"source_artifact_{key}_mismatch")
    provenance = validate_exact_keys(source["provenance"], PROVENANCE_KEYS, "source_provenance")
    if provenance["authority"] != SOURCE_AUTHORITIES[request["role"]]:
        deny("source_provenance_authority")
    if not isinstance(provenance["evidenceSha256"], str) or not SHA256.fullmatch(provenance["evidenceSha256"]):
        deny("source_provenance_evidence_sha256")
    validate_release_identity(source["releaseIdentity"], request["component"])
    validate_definition_shape(source["definition"], request)
    return source


def validate_release_identity(value: Any, component: str) -> dict[str, Any]:
    identity = validate_exact_keys(value, RELEASE_COMPONENT_KEYS[component], "release_identity")
    if not isinstance(identity["releaseId"], str) or not RELEASE_ID.fullmatch(identity["releaseId"]):
        deny("release_identity_release_id")
    for key in ("releaseManifestSha256", "componentTreeSha256"):
        if not isinstance(identity[key], str) or not SHA256.fullmatch(identity[key]):
            deny(f"release_identity_{key}")
    component_keys = RELEASE_COMPONENT_KEYS[component] - RELEASE_COMMON_KEYS
    if component == "frontend":
        build_id = identity["frontendBuildId"]
        if not isinstance(build_id, str) or not build_id or len(build_id) > 128 or any(character.isspace() for character in build_id):
            deny("release_identity_frontend_build_id")
        digest_keys = component_keys - {"frontendBuildId"}
    else:
        digest_keys = component_keys
    for key in digest_keys:
        if not isinstance(identity[key], str) or not SHA256.fullmatch(identity[key]):
            deny(f"release_identity_{key}")
    return identity


def release_identity_digest(identity: dict[str, Any]) -> str:
    return digest(canonical(identity))


def expected_pm2_log_path(configured: str, merge_logs: bool, pm_id: int) -> str:
    """Return the exact PM2 6.0.14 effective path for a configured log path."""
    validate_absolute_path(configured, "configured_log_path")
    if type(merge_logs) is not bool:
        deny("merge_logs_not_boolean")
    if type(pm_id) is not int or pm_id < 0:
        deny("pm_id_invalid")
    if merge_logs or not configured.endswith(".log"):
        return configured
    return re.sub(r"-[0-9]+\.log$|\.log$", f"-{pm_id}.log", configured)


def validate_runtime_log_paths(app: dict[str, Any], loaded: dict[str, Any]) -> dict[str, str]:
    """Bind effective PM2 log paths to canonical base paths and the observed pm_id."""
    if not isinstance(app, dict) or not isinstance(loaded, dict):
        deny("runtime_log_identity_not_object")
    pm_id = loaded.get("pm_id")
    if type(pm_id) is not int or pm_id < 0:
        deny("runtime_pm_id")
    merge_logs = app.get("merge_logs", False)
    if type(merge_logs) is not bool:
        deny("merge_logs_not_boolean")
    result: dict[str, str] = {}
    for configured_key, runtime_key, label in (
        ("out_file", "pm_out_log_path", "out"),
        ("error_file", "pm_err_log_path", "error"),
    ):
        if configured_key not in app:
            continue
        expected = expected_pm2_log_path(app[configured_key], merge_logs, pm_id)
        observed = loaded.get(runtime_key)
        if observed != expected:
            deny(f"runtime_{label}_log_path")
        result[runtime_key] = expected
    return result


def read_private_json(
    path: Path,
    after_read_hook: Callable[[Path], None] | None = None,
) -> tuple[dict[str, Any], bytes, dict[str, int]]:
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(path, flags)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or stat.S_IMODE(before.st_mode) != 0o600:
            deny("private_file_identity")
        chunks: list[bytes] = []
        while True:
            chunk = os.read(fd, 1024 * 1024)
            if not chunk:
                break
            chunks.append(chunk)
        if after_read_hook is not None:
            after_read_hook(path)
        after = os.fstat(fd)
        before_identity = (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns)
        after_identity = (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns)
        if before_identity != after_identity:
            deny("private_file_changed_during_read")
    finally:
        os.close(fd)
    raw = b"".join(chunks)
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        deny("private_file_invalid_json")
    if not isinstance(value, dict):
        deny("private_file_not_object")
    return value, raw, {"device": before.st_dev, "inode": before.st_ino}


def write_private_exclusive(path: Path, raw: bytes) -> None:
    if not path.parent.is_dir():
        deny("output_parent_missing")
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb", closefd=False) as handle:
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
        os.close(fd)
        fd = -1
        try:
            os.link(temporary, path)
        except FileExistsError:
            deny("output_exists")
        os.unlink(temporary)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if fd >= 0:
            os.close(fd)
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


def expected_sha256(value: Any, label: str) -> str:
    if not isinstance(value, str) or not SHA256.fullmatch(value):
        deny(f"{label}_invalid")
    return value


def load_binding(request_path: Path, source_path: Path, source_sha256: str) -> dict[str, Any]:
    request, request_raw, request_meta = read_private_json(request_path)
    validate_request(request)
    source, source_raw, source_meta = read_private_json(source_path)
    expected = expected_sha256(source_sha256, "source_sha256")
    actual = digest(source_raw)
    if actual != expected:
        deny("source_sha256_mismatch")
    validate_source_artifact(source, request)
    definition = source["definition"]
    definition_raw = canonical(definition)
    return {
        "request": request,
        "requestRaw": request_raw,
        "requestMeta": request_meta,
        "source": source,
        "sourceRaw": source_raw,
        "sourceMeta": source_meta,
        "sourceSha256": actual,
        "definition": definition,
        "definitionRaw": definition_raw,
        "configurationSha256": digest(definition_raw),
    }


def result_for(binding: dict[str, Any], result: str) -> dict[str, Any]:
    request = binding["request"]
    return {
        "result": result,
        "schemaVersion": SCHEMA_VERSION,
        "role": request["role"],
        "component": request["component"],
        "requestSha256": digest(binding["requestRaw"]),
        "sourceArtifactSha256": binding["sourceSha256"],
        "configurationSha256": binding["configurationSha256"],
        "releaseIdentitySha256": release_identity_digest(binding["source"]["releaseIdentity"]),
        "releaseId": binding["source"]["releaseIdentity"]["releaseId"],
        "applicationEnvKeys": request["environmentKeys"],
    }


def command_build(args: argparse.Namespace) -> dict[str, Any]:
    binding = load_binding(args.request, args.source_artifact, args.source_sha256)
    write_private_exclusive(args.output, binding["definitionRaw"])
    return result_for(binding, "PM2_DEFINITION_BUILT")


def command_validate(args: argparse.Namespace) -> dict[str, Any]:
    binding = load_binding(args.request, args.source_artifact, args.source_sha256)
    definition, raw, _ = read_private_json(args.definition)
    validate_definition_shape(definition, binding["request"])
    if raw != binding["definitionRaw"]:
        deny("definition_not_source_exact")
    return result_for(binding, "PM2_DEFINITION_VALID")


def pair_compatibility(candidate: dict[str, Any], rollback: dict[str, Any]) -> None:
    candidate_request = candidate["request"]
    rollback_request = rollback["request"]
    if candidate_request["role"] != "candidate" or rollback_request["role"] != "rollback":
        deny("pair_roles")
    if candidate_request["component"] != rollback_request["component"]:
        deny("pair_component")
    if candidate_request["scope"] != rollback_request["scope"]:
        deny("pair_scope")
    if digest(candidate["requestRaw"]) == digest(rollback["requestRaw"]):
        deny("pair_request_identity_equal")
    if candidate["sourceMeta"] == rollback["sourceMeta"]:
        deny("pair_source_file_equal")
    if candidate["sourceSha256"] == rollback["sourceSha256"]:
        deny("pair_source_digest_equal")
    candidate_provenance = candidate["source"]["provenance"]
    rollback_provenance = rollback["source"]["provenance"]
    if candidate_provenance["evidenceSha256"] == rollback_provenance["evidenceSha256"]:
        deny("pair_provenance_evidence_equal")
    candidate_release = candidate["source"]["releaseIdentity"]
    rollback_release = rollback["source"]["releaseIdentity"]
    if release_identity_digest(candidate_release) == release_identity_digest(rollback_release):
        deny("pair_release_identity_equal")
    candidate_app = candidate["definition"]["apps"][0]
    rollback_app = rollback["definition"]["apps"][0]
    for key in ("name", "namespace", "script", "cwd", "interpreter", "exec_mode", "instances", "args"):
        if candidate_app[key] != rollback_app[key]:
            deny(f"pair_operational_{key}")


def command_validate_pair(args: argparse.Namespace) -> dict[str, Any]:
    candidate = load_binding(args.candidate_request, args.candidate_source_artifact, args.candidate_source_sha256)
    rollback = load_binding(args.rollback_request, args.rollback_source_artifact, args.rollback_source_sha256)
    candidate_definition, candidate_raw, _ = read_private_json(args.candidate_definition)
    rollback_definition, rollback_raw, _ = read_private_json(args.rollback_definition)
    validate_definition_shape(candidate_definition, candidate["request"])
    validate_definition_shape(rollback_definition, rollback["request"])
    if candidate_raw != candidate["definitionRaw"]:
        deny("candidate_definition_not_source_exact")
    if rollback_raw != rollback["definitionRaw"]:
        deny("rollback_definition_not_source_exact")
    pair_compatibility(candidate, rollback)
    return {
        "result": "PM2_DEFINITION_PAIR_VALID",
        "schemaVersion": SCHEMA_VERSION,
        "component": candidate["request"]["component"],
        "candidate": result_for(candidate, "BOUND"),
        "rollback": result_for(rollback, "BOUND"),
        "sourceArtifactsCryptographicallyDistinct": True,
        "releaseIdentitiesDistinct": True,
        "configurationDigestsEqual": candidate["configurationSha256"] == rollback["configurationSha256"],
        "operationalCompatibility": True,
    }


def add_binding_arguments(command: argparse.ArgumentParser, prefix: str = "") -> None:
    option = f"{prefix}-" if prefix else ""
    attribute = f"{prefix.replace('-', '_')}_" if prefix else ""
    command.add_argument(f"--{option}request", dest=f"{attribute}request", type=Path, required=True)
    command.add_argument(f"--{option}source-artifact", dest=f"{attribute}source_artifact", type=Path, required=True)
    command.add_argument(f"--{option}source-sha256", dest=f"{attribute}source_sha256", required=True)


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser()
    commands = value.add_subparsers(dest="command", required=True)
    build = commands.add_parser("build")
    add_binding_arguments(build)
    build.add_argument("--output", type=Path, required=True)
    build.set_defaults(function=command_build)
    validate = commands.add_parser("validate")
    add_binding_arguments(validate)
    validate.add_argument("--definition", type=Path, required=True)
    validate.set_defaults(function=command_validate)
    pair = commands.add_parser("validate-pair")
    add_binding_arguments(pair, "candidate")
    pair.add_argument("--candidate-definition", type=Path, required=True)
    add_binding_arguments(pair, "rollback")
    pair.add_argument("--rollback-definition", type=Path, required=True)
    pair.set_defaults(function=command_validate_pair)
    return value


def main() -> int:
    try:
        args = parser().parse_args()
        result = args.function(args)
    except (Denied, OSError, KeyError, TypeError) as error:
        print(f"PM2_DEFINITION_DENY:{error}", file=sys.stderr)
        return 2
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
