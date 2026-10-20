#!/usr/bin/env python3
"""Regression cases for structured PM2/socket ownership evidence."""

from __future__ import annotations

import importlib.util
from pathlib import Path

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    "verify_deployment_record", HERE / "verify-deployment-record.py"
)
assert SPEC and SPEC.loader
validator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validator)


def expect_pass(observed: dict, label: str) -> None:
    validator.verify_socket_owner(observed, label)


def expect_deny(observed: dict, label: str) -> None:
    try:
        validator.verify_socket_owner(observed, label)
    except SystemExit as exc:
        if "DEPLOYMENT_RECORD_INVALID" not in str(exc):
            raise
    else:
        raise AssertionError(f"{label} unexpectedly passed")


expect_pass({
    "pid": 4100,
    "socketOwnerPid": 4100,
    "socketOwnerRelation": "DIRECT",
    "socketOwnerChain": [4100],
}, "DIRECT")

expect_pass({
    "pid": 4200,
    "socketOwnerPid": 4202,
    "socketOwnerRelation": "DESCENDANT",
    "socketOwnerChain": [4202, 4201, 4200],
}, "DESCENDANT")

expect_deny({
    "pid": 4300,
    "socketOwnerPid": 4302,
    "socketOwnerRelation": "DESCENDANT",
    "socketOwnerChain": [4301, 4300],
}, "INVALID_CHAIN")

# A daemon-owned socket does not terminate at the PM2 application PID and is denied.
expect_deny({
    "pid": 4400,
    "socketOwnerPid": 99,
    "socketOwnerRelation": "DIRECT",
    "socketOwnerChain": [99],
}, "PM2_DAEMON_OWNER")

print("DEPLOYMENT_SOCKET_RELATIONS_OK: DIRECT and DESCENDANT pass; invalid and daemon ownership deny")
