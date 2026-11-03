#!/usr/bin/env python3
"""Materialize the fixed-current technical-acceptance bytes from a sealed request."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import stat
import sys
from pathlib import Path
from typing import Any


SHA256 = re.compile(r"^[0-9a-f]{64}$")
ACCEPTANCE = "ACEITE TÉCNICO PASS\n".encode("utf-8")


class Denied(RuntimeError):
    pass


def sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def stable_regular(path: Path, *, modes: set[int]) -> tuple[bytes, os.stat_result]:
    try:
        fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    except OSError as error:
        raise Denied(f"file_open:{path.name}") from error
    try:
        before = os.fstat(fd)
        if (not stat.S_ISREG(before.st_mode) or stat.S_IMODE(before.st_mode) not in modes or
                (before.st_uid, before.st_gid) != (os.geteuid(), os.getegid())):
            raise Denied(f"file_identity:{path.name}")
        blocks: list[bytes] = []
        while True:
            block = os.read(fd, 1024 * 1024)
            if not block:
                break
            blocks.append(block)
        after = os.fstat(fd)
    finally:
        os.close(fd)
    identity = lambda value: (value.st_dev, value.st_ino, value.st_mode, value.st_uid,
                              value.st_gid, value.st_size, value.st_mtime_ns, value.st_ctime_ns)
    raw = b"".join(blocks)
    if identity(before) != identity(after) or len(raw) != before.st_size:
        raise Denied(f"file_changed:{path.name}")
    return raw, after


def load_json(path: Path, *, modes: set[int]) -> tuple[dict[str, Any], bytes]:
    raw, _ = stable_regular(path, modes=modes)
    try:
        value = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise Denied(f"json:{path.name}") from error
    if not isinstance(value, dict):
        raise Denied(f"json_object:{path.name}")
    return value, raw


def load_request(path: Path, expected_sha256: str) -> dict[str, Any]:
    if not SHA256.fullmatch(expected_sha256):
        raise Denied("request_sha256_format")
    value, raw = load_json(path, modes={0o600})
    if sha256(raw) != expected_sha256:
        raise Denied("request_sha256")
    required = {
        "schemaVersion", "action", "transactionRoot", "transactionJournal",
        "acceptanceOutput", "acceptancePayload", "acceptancePayloadSha256",
        "driver", "driverSha256", "binding",
    }
    if (set(value) != required or value.get("schemaVersion") != 1 or
            value.get("action") != "materialize_fixed_current_acceptance"):
        raise Denied("request_schema")
    for name in ("transactionRoot", "transactionJournal", "acceptanceOutput",
                 "acceptancePayload", "driver"):
        candidate = value.get(name)
        if not isinstance(candidate, str) or not Path(candidate).is_absolute():
            raise Denied(f"request_path:{name}")
    for name in ("acceptancePayloadSha256", "driverSha256"):
        if not SHA256.fullmatch(str(value.get(name, ""))):
            raise Denied(f"request_sha256:{name}")
    binding = value.get("binding")
    if (not isinstance(binding, dict) or set(binding) !=
            {"release", "target", "controlPlane", "components"} or
            not all(isinstance(binding.get(name), str)
                    for name in ("release", "target", "controlPlane")) or
            binding.get("components") not in (["api"], ["api", "frontend"])):
        raise Denied("request_binding")
    root = Path(value["transactionRoot"])
    if (Path(value["transactionJournal"]) != root / "transaction.v1.private.json" or
            Path(value["acceptanceOutput"]) != root / "acceptance.private.txt"):
        raise Denied("request_transaction_paths")
    return value


def authenticate_transaction(request: dict[str, Any]) -> None:
    root = Path(request["transactionRoot"])
    try:
        root_info = root.lstat()
    except OSError as error:
        raise Denied("transaction_root") from error
    if (root.is_symlink() or not root.is_dir() or
            (root_info.st_uid, root_info.st_gid, stat.S_IMODE(root_info.st_mode)) !=
            (os.geteuid(), os.getegid(), 0o700)):
        raise Denied("transaction_root_identity")
    journal, _ = load_json(Path(request["transactionJournal"]), modes={0o600})
    binding = request["binding"]
    observed = journal.get("binding")
    if (journal.get("schemaVersion") != 1 or journal.get("state") != "AWAITING_ACCEPTANCE" or
            journal.get("saveCount") != 0 or journal.get("deployedMarkerCreated") is not False or
            not isinstance(observed, dict) or
            any(observed.get(name) != binding[name]
                for name in ("release", "target", "controlPlane", "components")) or
            journal.get("activationProgress") != binding["components"]):
        raise Denied("transaction_not_awaiting_bound_acceptance")


def materialize(request: dict[str, Any]) -> dict[str, Any]:
    payload, _ = stable_regular(Path(request["acceptancePayload"]), modes={0o600})
    if payload != ACCEPTANCE or sha256(payload) != request["acceptancePayloadSha256"]:
        raise Denied("acceptance_payload")
    driver, _ = stable_regular(Path(request["driver"]), modes={0o500, 0o600})
    if sha256(driver) != request["driverSha256"]:
        raise Denied("driver_sha256")
    authenticate_transaction(request)
    output = Path(request["acceptanceOutput"])
    try:
        fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                     getattr(os, "O_NOFOLLOW", 0), 0o600)
    except OSError as error:
        raise Denied("acceptance_output") from error
    try:
        opened = os.fstat(fd)
        if ((opened.st_uid, opened.st_gid, stat.S_IMODE(opened.st_mode)) !=
                (os.geteuid(), os.getegid(), 0o600) or not stat.S_ISREG(opened.st_mode)):
            raise Denied("acceptance_output_identity")
        written = 0
        while written < len(payload):
            written += os.write(fd, payload[written:])
        os.fsync(fd)
    finally:
        os.close(fd)
    parent = os.open(output.parent, os.O_RDONLY | os.O_DIRECTORY |
                     getattr(os, "O_NOFOLLOW", 0))
    try:
        os.fsync(parent)
    finally:
        os.close(parent)
    readback, info = stable_regular(output, modes={0o600})
    if readback != payload:
        raise Denied("acceptance_readback")
    return {
        "result": "FIXED_CURRENT_ACCEPTANCE_MATERIALIZED",
        "path": str(output), "sha256": sha256(readback), "size": len(readback),
        "device": info.st_dev, "inode": info.st_ino, "mode": "0600",
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--request", type=Path, required=True)
    parser.add_argument("--request-sha256", required=True)
    args = parser.parse_args()
    try:
        result = materialize(load_request(args.request, args.request_sha256))
        print(json.dumps(result, sort_keys=True, separators=(",", ":")))
        return 0
    except (Denied, OSError, ValueError) as error:
        print(f"FIXED_CURRENT_ACCEPTANCE_DENY:{error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
