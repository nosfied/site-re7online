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


def component_identity(release_root: Path, release_id: str, target: str,
                       producer: Path, component: str,
                       deployed_marker_sha256: str | None = None) -> tuple[dict[str, Any], dict[str, Any]]:
    command = [sys.executable, str(producer), "verify", "--release-root", str(release_root),
               "--target", target, "--release-id", release_id, "--components", "api,frontend"]
    if deployed_marker_sha256 is not None:
        command.extend(("--deployed-marker-sha256", deployed_marker_sha256))
    first = run_json(command, "release_verify_before")
    if first.get("result") != "RELEASE VERIFIED":
        deny("release_verify_result")

    manifest_raw = stable_regular(release_root / "manifest.json", private=False)
    index_raw = stable_regular(release_root / "index.sha256", private=False)
    manifest = json_object(manifest_raw, "manifest")
    index = json_object(index_raw, "index")
    if manifest.get("releaseId") != release_id or manifest.get("targetCommit") != target:
        deny("release_manifest_identity")
    if manifest.get("indexSha256") != digest(index_raw):
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
    if component != "frontend":
        deny("component_not_supported")
    build_raw = stable_regular(runtime / ".next/BUILD_ID", private=False)
    try:
        build_id = build_raw.decode("ascii").rstrip("\n")
    except UnicodeDecodeError:
        deny("frontend_build_id_encoding")
    if not build_id or any(character.isspace() for character in build_id):
        deny("frontend_build_id")

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
        "frontendBuildId": build_id,
        "producerVerification": first,
    }
    return evidence, {"runtime": runtime, "manifest": manifest}


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
    if args.role not in ROLES or not SHA40.fullmatch(args.target):
        deny("argument_identity")
    marker = args.release_root / "DEPLOYED"
    if args.deployed_marker_sha256 is not None:
        expected_digest(args.deployed_marker_sha256, "deployed_marker_sha256")
        if args.role != "rollback":
            deny("candidate_operational_marker_forbidden")
    if (marker.exists() or marker.is_symlink()) and args.deployed_marker_sha256 is None:
        deny("deployed_marker_sha256_required")
    for label, path in (("release_root", args.release_root), ("producer", args.producer),
                        ("control", args.control), ("template_request", args.template_request),
                        ("template_source", args.template_source), ("output", args.output)):
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
    request_raw = stable_regular(args.template_request, private=True)
    source_raw = stable_regular(args.template_source, private=True)
    if digest(request_raw) != expected_digest(args.template_request_sha256, "template_request_sha256"):
        deny("template_request_sha256_mismatch")
    if digest(source_raw) != expected_digest(args.template_source_sha256, "template_source_sha256"):
        deny("template_source_sha256_mismatch")
    request = json_object(request_raw, "template_request")
    source = json_object(source_raw, "template_source")
    if request.get("role") != args.role or request.get("component") != "frontend":
        deny("template_request_identity")
    if source.get("role") != args.role or source.get("component") != "frontend":
        deny("template_source_identity")

    with tempfile.TemporaryDirectory(prefix="pm2-binding-validate-") as temporary:
        probe = Path(temporary) / "definition.json"
        run_json([sys.executable, str(args.control), "build", "--request", str(args.template_request),
                  "--source-artifact", str(args.template_source), "--source-sha256", args.template_source_sha256,
                  "--output", str(probe)], "template_binding_validation")

    release_evidence, release = component_identity(
        args.release_root.resolve(strict=True), args.release_id, args.target,
        args.producer, "frontend", args.deployed_marker_sha256)
    definition = source.get("definition")
    if not isinstance(definition, dict) or not isinstance(definition.get("apps"), list) or len(definition["apps"]) != 1:
        deny("template_definition")
    app = definition["apps"][0]
    cwd = Path(str(app.get("cwd", "")))
    script = Path(str(app.get("script", "")))
    try:
        relative_entry = script.relative_to(cwd)
    except ValueError:
        deny("frontend_entry_outside_cwd")
    if not relative_entry.parts or ".." in PurePosixPath(relative_entry.as_posix()).parts:
        deny("frontend_entry_relative")
    entry_raw = stable_regular(release["runtime"] / relative_entry, private=False)
    release_identity = {
        "releaseId": args.release_id,
        "releaseManifestSha256": release_evidence["releaseManifestSha256"],
        "componentTreeSha256": release_evidence["componentTreeSha256"],
        "frontendBuildId": release_evidence["frontendBuildId"],
        "frontendEntrySha256": digest(entry_raw),
    }
    provenance = {
        **release_evidence,
        "role": args.role,
        "templateRequestSha256": digest(request_raw),
        "templateSourceSha256": digest(source_raw),
        "producerSha256": digest(producer_raw),
        "controlSha256": digest(control_raw),
        "releaseIdentity": release_identity,
        "definitionSha256": digest(canonical(definition)),
        "derivation": "authenticated-definition-rebound-to-verified-release",
        "pm2IntrospectionUsed": False,
    }
    evidence_raw = canonical(provenance)
    rebound = {
        "schemaVersion": 1,
        "role": args.role,
        "component": "frontend",
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
    value.add_argument("--target", required=True)
    value.add_argument("--release-id", required=True)
    value.add_argument("--release-root", type=Path, required=True)
    value.add_argument("--deployed-marker-sha256")
    value.add_argument("--producer", type=Path, required=True)
    value.add_argument("--producer-sha256", required=True)
    value.add_argument("--control", type=Path, required=True)
    value.add_argument("--control-sha256", required=True)
    value.add_argument("--template-request", type=Path, required=True)
    value.add_argument("--template-request-sha256", required=True)
    value.add_argument("--template-source", type=Path, required=True)
    value.add_argument("--template-source-sha256", required=True)
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
