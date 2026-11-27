#!/usr/bin/env python3
"""Authenticated in-process invocation of the canonical persistence gate."""

from __future__ import annotations

import hashlib
import importlib.util
from pathlib import Path
from typing import Any, Callable


def enforce(binding: Any, phase: str, deny: Callable[[str], None], *, base: Path) -> dict[str, Any]:
    if (not isinstance(binding, dict) or set(binding) != {"request", "requestSha256"} or
            not isinstance(binding.get("request"), str) or
            not isinstance(binding.get("requestSha256"), str)):
        deny("durable_persistence_binding")
    request = Path(binding["request"])
    if not request.is_absolute():
        deny("durable_persistence_binding")
    gate_path = base / "durable-runtime-persistence-gate.py"
    try:
        gate_raw = gate_path.read_bytes()
    except OSError:
        deny("durable_persistence_gate_missing")
    spec = importlib.util.spec_from_file_location(
        "converta_durable_runtime_persistence_gate", gate_path)
    if spec is None or spec.loader is None:
        deny("durable_persistence_gate_load")
    gate = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(gate)
    try:
        value = gate.private_json(request, binding["requestSha256"])
        report = gate.validate(value, phase)
    except (gate.Denied, OSError, ValueError) as error:
        deny(f"durable_persistence:{error}")
    if (report.get("result") != "PASS" or report.get("phase") != phase or
            report.get("enforcementState") != "CANONICALLY_ENFORCED"):
        deny("durable_persistence_report")
    report["gateSha256"] = hashlib.sha256(gate_raw).hexdigest()
    report["requestSha256"] = binding["requestSha256"]
    return report


def resolve_cutover_authorization(
    request: dict[str, Any], admission: dict[str, Any] | None,
    candidate_identity: dict[str, str], transaction_root: Path,
    deny: Callable[[str], None], *, base: Path,
) -> tuple[Path, str]:
    gate_path = base / "durable-runtime-persistence-gate.py"
    spec = importlib.util.spec_from_file_location(
        "converta_durable_runtime_persistence_gate_resolver", gate_path)
    if spec is None or spec.loader is None:
        deny("authorization_relocation_gate_load")
    gate = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(gate)
    try:
        path, sha256, _ = gate.resolve_cutover_authorization(
            request, admission=admission, candidate_identity=candidate_identity,
            transaction_root=transaction_root)
    except (gate.Denied, OSError, ValueError) as error:
        deny(f"durable_persistence:{error}")
    return path, sha256
