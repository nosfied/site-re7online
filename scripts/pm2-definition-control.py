#!/usr/bin/env python3
"""Build and validate PM2 application definitions without trusting PM2 introspection.

The input is a private, versioned request.  Structural PM2 fields and application
environment values have separate namespaces.  No environment value is printed.
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
from typing import Any


SCHEMA_VERSION = 1
SHA256 = re.compile(r"^[0-9a-f]{64}$")
ENV_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
TOP_LEVEL_KEYS = {
    "schemaVersion", "scope", "role", "component", "source", "structure", "applicationEnv"
}
SOURCE_KEYS = {"kind", "identitySha256"}
APPLICATION_ENV_KEYS = {"allowlist", "values"}
REQUIRED_STRUCTURE_KEYS = {
    "name", "script", "args", "cwd", "interpreter", "exec_mode", "instances",
    "namespace", "autorestart", "restart_delay", "kill_timeout", "listen_timeout",
    "wait_ready", "node_args",
}
OPTIONAL_STRUCTURE_KEYS = {"out_file", "error_file", "log_file", "merge_logs", "watch"}
STRUCTURE_KEYS = REQUIRED_STRUCTURE_KEYS | OPTIONAL_STRUCTURE_KEYS


class Denied(ValueError):
    pass


def deny(reason: str) -> None:
    raise Denied(reason)


def canonical(value: Any) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode()


def digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def configuration_identity(request: dict[str, Any]) -> str:
    return digest(canonical({
        "component": request["component"],
        "scope": request["scope"],
        "structure": request["structure"],
        "applicationEnv": request["applicationEnv"],
    }))


def normalized_key(value: str) -> str:
    folded = unicodedata.normalize("NFKC", value).casefold()
    return "".join(character for character in folded if character.isalnum())


FORBIDDEN_ENV_KEYS = {
    normalized_key(value)
    for value in (
        *STRUCTURE_KEYS,
        "env", "pm_exec_path", "pm_cwd", "PM2_HOME", "NODE_APP_INSTANCE",
        "pm_id", "pm_pid_path", "pm_err_log_path", "pm_out_log_path", "pm_log_path",
        "status", "restart_time", "unstable_restarts", "created_at", "pm_uptime",
    )
}


def validate_exact_keys(value: Any, expected: set[str], label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        deny(f"{label}_not_object")
    actual = set(value)
    if actual != expected:
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


def validate_application_env(value: Any) -> tuple[list[str], dict[str, str]]:
    env = validate_exact_keys(value, APPLICATION_ENV_KEYS, "application_env")
    allowlist = validate_string_list(env["allowlist"], "application_env_allowlist")
    values = env["values"]
    if not isinstance(values, dict):
        deny("application_env_values_not_object")
    if len({normalized_key(key) for key in allowlist}) != len(allowlist):
        deny("application_env_allowlist_normalized_duplicate")
    if set(allowlist) != set(values):
        deny("application_env_allowlist_mismatch")
    for key in allowlist:
        normalized = normalized_key(key)
        if normalized in FORBIDDEN_ENV_KEYS or normalized.startswith("pm"):
            deny(f"application_env_structural_collision:{key}")
        if not ENV_NAME.fullmatch(key):
            deny("application_env_key_invalid")
        if not isinstance(values[key], str):
            deny(f"application_env_value_not_string:{key}")
    return sorted(allowlist), values


def validate_request(value: Any) -> dict[str, Any]:
    request = validate_exact_keys(value, TOP_LEVEL_KEYS, "request")
    if request["schemaVersion"] != SCHEMA_VERSION:
        deny("schema_version")
    if request["scope"] not in {"production", "isolated-test"}:
        deny("scope")
    if request["role"] not in {"candidate", "rollback"}:
        deny("role")
    if request["component"] not in {"api", "frontend", "worker"}:
        deny("component")
    source = validate_exact_keys(request["source"], SOURCE_KEYS, "source")
    expected_kind = "authenticated-proven-definition" if request["role"] == "rollback" else "canonical-private-config"
    if source["kind"] != expected_kind:
        deny("source_kind")
    if not isinstance(source["identitySha256"], str) or not SHA256.fullmatch(source["identitySha256"]):
        deny("source_identity_sha256")
    validate_structure(request["structure"], request["component"], request["scope"])
    validate_application_env(request["applicationEnv"])
    if source["identitySha256"] != configuration_identity(request):
        deny("source_identity_mismatch")
    return request


def render_definition(request: dict[str, Any]) -> dict[str, Any]:
    validate_request(request)
    structure = request["structure"]
    _, values = validate_application_env(request["applicationEnv"])
    app = {key: structure[key] for key in sorted(structure)}
    app["env"] = {key: values[key] for key in sorted(values)}
    return {"apps": [app]}


def read_private_json(path: Path) -> tuple[dict[str, Any], bytes]:
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
        after = os.fstat(fd)
        if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) != (
            after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns
        ):
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
    return value, raw


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


def load_request(path: Path) -> dict[str, Any]:
    value, _ = read_private_json(path)
    return validate_request(value)


def validate_definition(request: dict[str, Any], value: Any) -> bytes:
    expected = canonical(render_definition(request))
    if not isinstance(value, dict) or canonical(value) != expected:
        deny("definition_not_canonical")
    return expected


def command_build(args: argparse.Namespace) -> dict[str, Any]:
    request = load_request(args.request)
    raw = canonical(render_definition(request))
    write_private_exclusive(args.output, raw)
    return {
        "result": "PM2_DEFINITION_BUILT",
        "schemaVersion": SCHEMA_VERSION,
        "role": request["role"],
        "component": request["component"],
        "definitionSha256": digest(raw),
        "applicationEnvKeys": sorted(request["applicationEnv"]["allowlist"]),
    }


def command_validate(args: argparse.Namespace) -> dict[str, Any]:
    request = load_request(args.request)
    definition, raw = read_private_json(args.definition)
    expected = validate_definition(request, definition)
    if raw != expected:
        deny("definition_serialization")
    return {
        "result": "PM2_DEFINITION_VALID",
        "schemaVersion": SCHEMA_VERSION,
        "role": request["role"],
        "component": request["component"],
        "definitionSha256": digest(raw),
        "applicationEnvKeys": sorted(request["applicationEnv"]["allowlist"]),
    }


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser()
    commands = value.add_subparsers(dest="command", required=True)
    for name, function in (("build", command_build), ("validate", command_validate)):
        command = commands.add_parser(name)
        command.add_argument("--request", type=Path, required=True)
        command.add_argument("--definition", type=Path) if name == "validate" else command.add_argument("--output", type=Path, required=True)
        command.set_defaults(function=function)
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
