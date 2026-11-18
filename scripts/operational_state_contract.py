#!/usr/bin/env python3
"""Pure structural contract shared by deploy admission and retirement."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
from typing import Any, Callable, NoReturn


SHA256 = re.compile(r"[0-9a-f]{64}")
ROOT_KEYS = {"repository", "worktrees", "outputs", "releases", "staging", "evidence"}
POLICY_ENTRY_KEYS = {"path", "ownerUid", "groupGid", "allowedModes"}

Deny = Callable[[str], NoReturn]


def validate_root_policy(raw: bytes, expected_sha256: str, deny: Deny) -> dict[str, Any]:
    """Validate policy bytes without observing any filesystem object."""
    if hashlib.sha256(raw).hexdigest() != expected_sha256:
        deny("root_policy_hash")
    try:
        policy = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError):
        deny("json_invalid:root-policy")
    if not isinstance(policy, dict):
        deny("json_object:root-policy")
    if set(policy) != {"schemaVersion", "canonicalRoots"} or policy.get("schemaVersion") != 1:
        deny("root_policy_schema")
    roots = policy.get("canonicalRoots")
    if not isinstance(roots, dict) or set(roots) != ROOT_KEYS:
        deny("root_policy_schema")
    entries: dict[str, Any] = {}
    definitions: dict[str, Any] = {}
    for key in ROOT_KEYS:
        raw_entries = roots[key] if key == "evidence" else [roots[key]]
        if not isinstance(raw_entries, list) or not raw_entries:
            deny(f"root_policy_entry:{key}")
        parsed = []
        parsed_definitions = []
        for entry in raw_entries:
            if not isinstance(entry, dict) or set(entry) != POLICY_ENTRY_KEYS:
                deny(f"root_policy_entry:{key}")
            path = Path(str(entry.get("path", "")))
            modes = entry.get("allowedModes")
            if (not path.is_absolute() or ".." in path.parts or
                    not isinstance(entry.get("ownerUid"), int) or entry["ownerUid"] < 0 or
                    not isinstance(entry.get("groupGid"), int) or entry["groupGid"] < 0 or
                    not isinstance(modes, list) or not modes or
                    any(not isinstance(mode, str) or not re.fullmatch(r"0[0-7]{3}", mode)
                        for mode in modes)):
                deny(f"root_policy_entry:{key}")
            if Path(os.path.normpath(str(path))) != path:
                deny(f"root_policy_entry:{key}")
            parsed.append(str(path))
            parsed_definitions.append(entry)
        entries[key] = parsed if key == "evidence" else parsed[0]
        definitions[key] = parsed_definitions if key == "evidence" else parsed_definitions[0]
    return {"schemaVersion": 1, "canonicalRoots": entries,
            "definitions": definitions, "sha256": expected_sha256}


def validate_operational_structure(value: dict[str, Any], contract: dict[str, Any],
                                   policy: dict[str, Any], deny: Deny) -> None:
    """Validate only schema and lexical bindings; never read the filesystem."""
    required = {"schemaVersion", "generationId", "releaseId", "targetCommit", "gitRepository",
                "currentPaths", "pm2LivePaths", "pm2DumpPaths", "activeReleases",
                "rollbackReleases", "transitiveReturnReleases", "candidateReleases",
                "installedVerifiedReleases", "supersededCandidates", "controlPlaneArtifacts",
                "dependencies", "deploymentState", "canonicalRoots", "observations"}
    optional = {"immediateRollbackReleases"}
    if (frozenset(value) not in {frozenset(required), frozenset(required | optional)} or
            value.get("schemaVersion") != 2):
        deny("operational_state_schema")
    for key in ("generationId", "releaseId", "targetCommit"):
        if value.get(key) != contract[key]:
            deny(f"operational_state_identity:{key}")
    for key in ("currentPaths", "pm2LivePaths", "pm2DumpPaths", "activeReleases",
                "rollbackReleases", "transitiveReturnReleases", "candidateReleases",
                "installedVerifiedReleases", "supersededCandidates", "dependencies"):
        if not isinstance(value.get(key), list) or any(not isinstance(item, str) for item in value[key]):
            deny(f"operational_state_list:{key}")
    immediate = value.get("immediateRollbackReleases")
    if immediate is not None and (not isinstance(immediate, dict) or
                                  set(immediate) not in ({"api", "frontend"},
                                                         {"api", "frontend", "worker"}) or
                                  any(not isinstance(item, str) or not item
                                      for item in immediate.values()) or
                                  any(item not in value["rollbackReleases"]
                                      for item in immediate.values())):
        deny("operational_state_immediate_rollbacks")
    if not Path(str(value.get("gitRepository", ""))).is_absolute():
        deny("operational_git_repository")
    roots = value.get("canonicalRoots")
    if not isinstance(roots, dict) or set(roots) != ROOT_KEYS:
        deny("canonical_roots_schema")
    if roots != policy["canonicalRoots"]:
        deny("canonical_roots_policy_mismatch")
    if (not isinstance(roots["evidence"], list) or not roots["evidence"] or
            any(not isinstance(item, str) for item in roots["evidence"])):
        deny("canonical_root:evidence")
    controls = value.get("controlPlaneArtifacts")
    if not isinstance(controls, list) or not controls:
        deny("operational_control_plane")
    for item in controls:
        if (not isinstance(item, dict) or set(item) != {"path", "sha256", "copied"} or
                not Path(str(item["path"])).is_absolute() or
                not SHA256.fullmatch(str(item["sha256"])) or item["copied"] is not True):
            deny("operational_control_plane")
    deployment = value.get("deploymentState")
    if (not isinstance(deployment, dict) or set(deployment) != {"state"} or
            not isinstance(deployment["state"], str)):
        deny("operational_deployment_state")
    observations = value.get("observations")
    observation_keys = {"currentLinks", "pm2", "dump", "releaseGraph"}
    if (not isinstance(observations, dict) or
            set(observations) not in {frozenset(observation_keys),
                                     frozenset(observation_keys | {"dependencies"})}):
        deny("operational_observations")
    links = observations.get("currentLinks")
    if not isinstance(links, list) or any(
            not isinstance(item, dict) or set(item) != {"path", "target"} or
            not Path(str(item["path"])).is_absolute() or
            not Path(str(item["target"])).is_absolute() for item in links):
        deny("operational_current_links")
    pm2 = observations.get("pm2")
    if (not isinstance(pm2, dict) or set(pm2) != {"path", "sha256", "fingerprintSha256"} or
            not Path(str(pm2.get("path", ""))).is_absolute() or
            not SHA256.fullmatch(str(pm2.get("sha256", ""))) or
            not SHA256.fullmatch(str(pm2.get("fingerprintSha256", "")))):
        deny("operational_pm2_observation")
    for label in ("dump", "releaseGraph"):
        item = observations.get(label)
        if (not isinstance(item, dict) or set(item) != {"path", "sha256"} or
                not Path(str(item.get("path", ""))).is_absolute() or
                not SHA256.fullmatch(str(item.get("sha256", "")))):
            deny(f"operational_{label}_observation")
    dependency_observation = observations.get("dependencies")
    if dependency_observation is not None and (
            not isinstance(dependency_observation, dict) or
            set(dependency_observation) != {"path", "sha256"} or
            not Path(str(dependency_observation.get("path", ""))).is_absolute() or
            not SHA256.fullmatch(str(dependency_observation.get("sha256", "")))):
        deny("operational_dependencies_observation")
