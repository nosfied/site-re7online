#!/usr/bin/env python3
"""Prepare or execute deterministic retirement for one build generation."""

from __future__ import annotations

import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
from typing import Any

import importlib.util

PREPARATION_LIFECYCLE_SHA256 = "36669ef654cb2f136d2072bd40f7ec96c7f9020a280c6402001d6dd0269178e9"
_preparation_path = Path(__file__).resolve().parent / "preparation_artifact_lifecycle.py"
try:
    _preparation_raw = _preparation_path.read_bytes()
except OSError as error:
    raise RuntimeError("preparation_lifecycle_dependency_missing") from error
if hashlib.sha256(_preparation_raw).hexdigest() != PREPARATION_LIFECYCLE_SHA256:
    raise RuntimeError("preparation_lifecycle_dependency_drift")
_preparation_spec = importlib.util.spec_from_file_location(
    "preparation_artifact_lifecycle", _preparation_path)
preparation_lifecycle = importlib.util.module_from_spec(_preparation_spec)
_preparation_spec.loader.exec_module(preparation_lifecycle)

SHA256 = re.compile(r"[0-9a-f]{64}")
FIXED_CURRENT_LOCK_PREFIX = b"CONVERTA_FIXED_CURRENT_V1:"
TERMINAL_DEPLOYMENT = {"DEPLOYED", "ROLLED_BACK", "SUPERSEDED"}
TERMINAL_RELEASE_JOURNAL = {
    "DEPLOYED", "DEPLOYED_SANITIZED",
    "ROLLED_BACK", "ROLLED_BACK_TECHNICAL_REJECTION",
    "COMPLETED", "SANITIZED", "RECONCILED",
}
PRESERVE_CLASSES = {"PACKAGE_PRESERVE", "EVIDENCE_PRESERVE", "PRIVATE_DATA_NEVER_RETIRE"}
F160_CACHE_CLASS = "EPHEMERAL_RUNTIME_CACHE"
DERIVED_CLASSES = {"DERIVED_WORKTREE", "DERIVED_OUTPUT_RUNTIME", "DERIVED_STAGING"}
RETIRABLE_CLASSES = DERIVED_CLASSES | {"RELEASE_RUNTIME"}
ARTIFACT_STATES = {"ACTIVE_DEPENDENCY", "ROLLBACK_DEPENDENCY", "CANDIDATE_PENDING_ACTIVATION",
                   "RETIREMENT_READY", "SANITIZED", "QUARANTINED", "PRESERVE_OVERRIDE"}
ROOT_KEYS = {"repository", "worktrees", "outputs", "releases", "staging", "evidence"}
POLICY_ENTRY_KEYS = {"path", "ownerUid", "groupGid", "allowedModes"}
A959_RETENTION_EVENT_SCHEMAS = {
    "ATTEMPT": frozenset({"event", "kind", "ordinal", "path", "result"}),
    "RESULT": frozenset({"event", "exitCode", "inspectionPath", "inspectionSha256", "kind",
                         "ordinal", "path", "result", "worktreeRegistration"}),
    "VERIFIED": frozenset({"event", "kind", "ordinal", "path", "result"}),
}
A959_RETENTION_COMMAND_KINDS = (
    "git_worktree_remove", "git_worktree_remove", "git_worktree_remove",
    "rm", "rm", "rm", "rm", "rm", "rm", "rm",
)
LEGACY_123BA_BINDING = {
    "schemaVersion": 1,
    "sourceState": "LEGACY_PRE_CONTRACT",
    "releaseId": "immutable-123ba7bd-vps-20261026T200100Z",
    "targetCommit": "123ba7bd78b2568ee982bf8590840de029a80072",
    "supersededPullRequest": 240,
    "outputPath": "/opt/re7online/build-output/immutable-123ba7bd-vps-20261026T200100Z-producer",
    "worktreePath": "/opt/re7online/build-worktrees/immutable-123ba7bd-vps-20261026T200100Z-source",
    "installedReleasePath": "/opt/re7online/releases/immutable-123ba7bd-vps-20261026T200100Z",
    "lifecycle": {
        "path": "/opt/re7online/build-output/immutable-123ba7bd-vps-20261026T200100Z-producer/generation-lifecycle.private.json",
        "sha256": "99fe6d231cd646ce442ecf6b26fe9cbba4745448a7d4e74944a0b965f561482d",
    },
    "package": {
        "path": "/opt/re7online/build-output/immutable-123ba7bd-vps-20261026T200100Z-producer/immutable-123ba7bd-vps-20261026T200100Z.tar.xz",
        "sha256": "dbe0925e79eb492b566812a0b257fc8adf50479d2b9c56b399f3de463f23097e",
    },
    "manifest": {
        "path": "/opt/re7online/build-output/immutable-123ba7bd-vps-20261026T200100Z-producer/immutable-123ba7bd-vps-20261026T200100Z/manifest.json",
        "sha256": "d3334a7754853566d24acadfc9991eec02ae9e163d14dc87759a5c9a3d2f79ef",
    },
    "index": {
        "path": "/opt/re7online/build-output/immutable-123ba7bd-vps-20261026T200100Z-producer/immutable-123ba7bd-vps-20261026T200100Z/index.sha256",
        "sha256": "a91323272cdcd3a91c207a18a953f11f93e346cf3bde1f976e3229829fa0e69b",
    },
    "canonicalVerifierSha256": "8e2135f3ac66b7bc2548ccf6f7b56d257c35f1c2c12ada779d2bedc0834532ec",
    "contractOutput": "/opt/re7online/build-output/immutable-123ba7bd-vps-20261026T200100Z-producer/generation-artifacts.private.json",
    "reviewOutput": "/opt/re7online/build-output/immutable-123ba7bd-vps-20261026T200100Z-producer/generation-review.private.json",
    "receiptOutput": "/opt/re7online/backups/converta-persistent/preparations/immutable-123ba7bd-vps-20261026T200100Z-legacy-bootstrap/bootstrap-receipt.private.json",
}
LEGACY_A959_V1_PRESERVE_BINDING = {
    "schemaVersion": 1,
    "sourceState": "LEGACY_V1_PRESERVE_NO_CONTRACT",
    "releaseId": "immutable-a959129e-vps-20261026T023100Z",
    "targetCommit": "a959129e39a07c52881fb7f5cbf21a7f6f1a80ff",
    "outputPath": "/opt/re7online/build-output/immutable-a959129e-vps-20261026T023100Z-producer",
    "worktreePath": "/opt/re7online/build-worktrees/immutable-a959129e-vps-20261026T023100Z-source",
    "installedReleasePath": "/opt/re7online/releases/immutable-a959129e-vps-20261026T023100Z",
    "privateDataOverlay": {
        "path": "/opt/re7online/releases/immutable-a959129e-vps-20261026T023100Z/api-runtime/.data",
        "classification": "PRIVATE_DATA_NEVER_RETIRE",
        "state": "ACTIVE_DEPENDENCY",
    },
    "lifecycle": {
        "path": "/opt/re7online/build-output/immutable-a959129e-vps-20261026T023100Z-producer/generation-lifecycle.private.json",
        "sha256": "b585d6cab251b8578cf808a080fe3794c5debef7408929562408fbc9c1c2498a",
    },
    "review": {
        "path": "/opt/re7online/build-output/immutable-a959129e-vps-20261026T023100Z-producer/generation-review.private.json",
        "sha256": "6c550cdf53d8bffa55886e8a998638646cb869cc29e7615b65e3c4455134e98b",
    },
    "package": {
        "path": "/opt/re7online/build-output/immutable-a959129e-vps-20261026T023100Z-producer/immutable-a959129e-vps-20261026T023100Z.tar.xz",
        "sha256": "dd3057637d90df996663d8a602067e971d2038b6d285d2fed203e59471c273b0",
    },
    "manifest": {
        "path": "/opt/re7online/build-output/immutable-a959129e-vps-20261026T023100Z-producer/immutable-a959129e-vps-20261026T023100Z/manifest.json",
        "sha256": "6b93078b51e6e1067e62b872885c65ff48ef74732f6a4bd4f28ca8500875820b",
    },
    "index": {
        "path": "/opt/re7online/build-output/immutable-a959129e-vps-20261026T023100Z-producer/immutable-a959129e-vps-20261026T023100Z/index.sha256",
        "sha256": "6ccb64900cf13a954b7885d57c450443022e3f59db404eb262513bc4f9a46570",
    },
    "deployedMarker": {
        "path": "/opt/re7online/releases/immutable-a959129e-vps-20261026T023100Z/DEPLOYED",
        "sha256": "9da2428b15f8eb8b307603556fffb0ef75536829109e4be282ce03caa19cdb80",
    },
    "priorRetention": {
        "batchId": "retention-recent-generations-qualification-20261026T213341Z-v3",
        "receiptSha256": "19ba46c4948e3ff1821b8b44e51fed1edf635b9b7ddd3421064dab7ee2250c74",
        "journalSha256": "e8f593acb2801e88dbbfffb3a679b4775916491c3e2281e24a45ebf3f0e6c985",
        "sampleASha256": "11f70b7c7b6d27f8a55bae36aa17b081ece70e8511f414da14b1f56d83661612",
        "sampleBSha256": "94fda2c48e65e43de46d6cedc121d4b32f46339301306f452218bb8a013ea6a8",
        "removedPaths": [
            "/opt/re7online/build-worktrees/immutable-a959129e-vps-20261026T023100Z-source",
            "/opt/re7online/build-worktrees/immutable-d436239e-vps-20261026T131821Z-source",
            "/opt/re7online/build-worktrees/immutable-f1602787-vps-20261026T174702Z-source",
            "/opt/re7online/build-output/immutable-a959129e-vps-20261026T023100Z-producer/immutable-a959129e-vps-20261026T023100Z/api-runtime",
            "/opt/re7online/build-output/immutable-a959129e-vps-20261026T023100Z-producer/immutable-a959129e-vps-20261026T023100Z/frontend-runtime",
            "/opt/re7online/build-output/immutable-d436239e-vps-20261026T131821Z-producer/immutable-d436239e-vps-20261026T131821Z/api-runtime",
            "/opt/re7online/build-output/immutable-d436239e-vps-20261026T131821Z-producer/immutable-d436239e-vps-20261026T131821Z/frontend-runtime",
            "/opt/re7online/build-output/immutable-f1602787-vps-20261026T174702Z-producer/immutable-f1602787-vps-20261026T174702Z/api-runtime",
            "/opt/re7online/build-output/immutable-f1602787-vps-20261026T174702Z-producer/immutable-f1602787-vps-20261026T174702Z/frontend-runtime",
            "/opt/re7online/releases/.immutable-a959129e-vps-20261026T023100Z.extracting.436891",
        ],
        "a959Ordinals": {
            "1": "/opt/re7online/build-worktrees/immutable-a959129e-vps-20261026T023100Z-source",
            "4": "/opt/re7online/build-output/immutable-a959129e-vps-20261026T023100Z-producer/immutable-a959129e-vps-20261026T023100Z/api-runtime",
            "5": "/opt/re7online/build-output/immutable-a959129e-vps-20261026T023100Z-producer/immutable-a959129e-vps-20261026T023100Z/frontend-runtime",
        },
    },
    "canonicalVerifierSha256": "8e2135f3ac66b7bc2548ccf6f7b56d257c35f1c2c12ada779d2bedc0834532ec",
    "contractOutput": "/opt/re7online/build-output/immutable-a959129e-vps-20261026T023100Z-producer/generation-artifacts.private.json",
    "receiptOutput": "/opt/re7online/backups/converta-persistent/preparations/immutable-a959129e-vps-20261026T023100Z-legacy-v1-bootstrap/bootstrap-receipt.private.json",
}
LEGACY_RETENTION_BATCH = {
    "batchId": "retention-recent-generations-qualification-20261026T213341Z-v3",
    "receiptSha256": "19ba46c4948e3ff1821b8b44e51fed1edf635b9b7ddd3421064dab7ee2250c74",
    "journalSha256": "e8f593acb2801e88dbbfffb3a679b4775916491c3e2281e24a45ebf3f0e6c985",
    "sampleASha256": "11f70b7c7b6d27f8a55bae36aa17b081ece70e8511f414da14b1f56d83661612",
    "sampleBSha256": "94fda2c48e65e43de46d6cedc121d4b32f46339301306f452218bb8a013ea6a8",
    "removedPaths": LEGACY_A959_V1_PRESERVE_BINDING["priorRetention"]["removedPaths"],
}
LEGACY_D436_F160_BINDINGS = {
    "immutable-d436239e-vps-20261026T131821Z": {
        "descriptorSha256": "0628da3e9592b30a55f0c515e856d3aad618d48be9534ed35669499dbd8ed964", "role": "ROLLBACK_DEPENDENCY",
        "targetCommit": "d436239e13764b65642b37a4310082acd3a6a485", "ordinals": (2, 6, 7),
    },
    "immutable-f1602787-vps-20261026T174702Z": {
        "descriptorSha256": "12b59f97dd337ff32a48b979063dd5fecce432483945024a34bc9cdd4db05023", "role": "ACTIVE_DEPENDENCY",
        "targetCommit": "f16027874e91c86e5f818d0888e6d735b07a6eda", "ordinals": (3, 8, 9),
        "overlayPath": "/opt/re7online/releases/immutable-f1602787-vps-20261026T174702Z/frontend-runtime/.next/cache",
    },
}

# Closed historical batch.  These hashes authenticate the original private
# custody; the derived closure below is evidence of one completed historical
# effect, never an authorization to remove either member again.
LEGACY_D7_WORKTREE_BATCH = {
    "schemaVersion": 1,
    "batchId": "retention-3630e16-d7de6453-worktrees-20261025",
    "sourceFormat": "LEGACY_WORKTREE_BATCH_V3",
    "intentSha256": "3042455be0f8d0900245c4e63844d5814589ae44e5b2cb3f30057ec609f4bf48",
    "commandsSha256": "5d7d6e85d0d850d11b8a612817f1f2a2867acfc8362d9736878d1e5ac9b541e4",
    "receiptSha256": "a5afecb03bdce97e03fde35597f9f92ef30a70055cbc9d1e763d1655ef431f72",
    "lockProofSha256": "1793b9a3d91842d4431339bc9b951f09de4133938a128e3f806e4931516b9679",
    "finalManifestSha256": "23adcdac759beecf7370ea9c1aea3b8f909a1db2cba6f9daa8458216b857ec02",
    "members": (
        {
            "index": 1,
            "path": "/opt/re7online/build-worktrees/immutable-3630e16-vps-20261024T195842Z-source",
            "head": "3630e16dfc946ab8ef97fb73780075a736f38a63",
            "allocatedBytes": 1023369216,
        },
        {
            "index": 2,
            "path": "/opt/re7online/build-worktrees/immutable-d7de6453-vps-20261024T221500Z-source",
            "head": "d7de6453aeab6d117e8d79a1dc3a0722875f39cc",
            "allocatedBytes": 1023418368,
        },
    ),
    "derivedReleaseId": "immutable-d7de6453-vps-20261024T221500Z",
    "lockPath": "/opt/re7online/backups/converta-persistent/.deployment-window.lock",
}

# Closed qualification boundary for the pre-contract releases that are still
# installed only as historical inventory.  This command derives evidence; it
# never creates a retirement intent or grants destructive authority.
LEGACY_P00_INSTALLED_BATCH = {
    "schemaVersion": 1,
    "batchId": "p00-legacy-installed-releases-20261107-v1",
    "canonicalVerifierSha256": "8e2135f3ac66b7bc2548ccf6f7b56d257c35f1c2c12ada779d2bedc0834532ec",
    "sourceGraph": {
        "path": "/opt/re7online/backups/converta-persistent/deploy-transactions/"
                "immutable-17cc77a8-vps-20261104T141039Z-api-frontend-c206959c-v3-once/"
                "generation-release-graph.final.private.json",
        "sha256": "ceff32cf664d14382b0209a30ac556012c2cd2a484d5039d04fa2f1c14f47224",
    },
    "releases": (
        {
            "releaseId": "immutable-ec2a9fde-vps-20261024T162005Z",
            "targetCommit": "ec2a9fde99b6421a85256f14604bd469879f4f2a",
            "installedReleasePath": "/opt/re7online/releases/immutable-ec2a9fde-vps-20261024T162005Z",
            "package": {"path": "/opt/re7online/build-output/immutable-ec2a9fde-vps-20261024T162005Z/immutable-ec2a9fde-vps-20261024T162005Z.tar.xz", "sha256": "a8715c8dcb2a3e654f486cd6d8ed53fb5ef33caf44a6ad90f6e41fd33d73b4ad"},
            "manifestSha256": "b9aa1c5301c68dd3184978a8bc2b3dfa817e365302f69abe0a3b0725a93cf5e6",
            "indexSha256": "22b790da2c65793180cfded42825b654f24f07b2e7f4fd63ce618802566b4241",
            "deployedMarkerSha256": "0894eb7cfb9561682feeca4917063c52fa5d3cf5be00e378eac10d9c00a7c0a2",
            "runtimeCacheOverlay": True,
        },
        {
            "releaseId": "immutable-ef7db111-vps-20261024T174000Z",
            "targetCommit": "ef7db11179a1be14160e0f7ceec9f01a8aaf0ece",
            "installedReleasePath": "/opt/re7online/releases/immutable-ef7db111-vps-20261024T174000Z",
            "package": {"path": "/opt/re7online/build-output/immutable-ef7db111-vps-20261024T174000Z-producer/immutable-ef7db111-vps-20261024T174000Z.tar.xz", "sha256": "c5bb0b94a5e96d45b8f3946871c4bb8f33fe042d70d490b6a5606438bbab351c"},
            "manifestSha256": "f6660e61f19ad7e5231badbd409160ef9b8f5e02545ea81a3e20d936e26b97aa",
            "indexSha256": "9f8ffc1e60bca006e6bf7f6cfc7006a44f9a5fef23124692d39d621eb403bb74",
            "deployedMarkerSha256": "c7e629dea342b98c3b5d25cb651ab3997749ca45fbd98074a9d7eb7bcf375e58",
            "runtimeCacheOverlay": False,
        },
        {
            "releaseId": "immutable-3630e16-vps-20261024T195842Z",
            "targetCommit": "3630e16dfc946ab8ef97fb73780075a736f38a63",
            "installedReleasePath": "/opt/re7online/releases/immutable-3630e16-vps-20261024T195842Z",
            "package": {"path": "/opt/re7online/build-output/immutable-3630e16-vps-20261024T195842Z-producer/immutable-3630e16-vps-20261024T195842Z.tar.xz", "sha256": "346246ce283148173ae294254b2caf7072779cc80f7faff15d8f78067d56fc18"},
            "manifestSha256": "ec677da80c98ef90a707eca009ef24a32bf5292707ff28c0e192ca2767aa218e",
            "indexSha256": "92a62cc53e28a72fa457f7bdd3f31e7ec86024740fc54081e05c66bd78727952",
            "deployedMarkerSha256": "cfc2569a4db46aac4f30e0ccaef715b7912c0867043a15c54d9389c99dd55722",
            "runtimeCacheOverlay": False,
        },
        {
            "releaseId": "immutable-d7de6453-vps-20261024T221500Z",
            "targetCommit": "d7de6453aeab6d117e8d79a1dc3a0722875f39cc",
            "installedReleasePath": "/opt/re7online/releases/immutable-d7de6453-vps-20261024T221500Z",
            "package": {"path": "/opt/re7online/build-output/immutable-d7de6453-vps-20261024T221500Z-producer/immutable-d7de6453-vps-20261024T221500Z.tar.xz", "sha256": "b75500e62c1333ba917ff7aa22720387b01597910cf24e84f7af6a9ae1e1a519"},
            "manifestSha256": "dcc3c1a42f2b639f82fd1a24ef9e9991ae65e31b5023ba2ff92ac71142c285d6",
            "indexSha256": "fcd7a0befd0977a4140deec9ef25621c421e2c70d4a95bc3075d4457d716b6f4",
            "deployedMarkerSha256": "1d2be9be3fd5e257700257988bb4cd946dac0f7cb47b6b3a4f861facedd7c543",
            "runtimeCacheOverlay": True,
        },
    ),
    "chainEvidence": (
        {"path": "/opt/re7online/backups/converta-persistent/deploy-preparations/immutable-ec2a9fde-vps-20261024T162005Z-20261024T165500Z/preflight.private.json", "sha256": "23ef53b2d1148a15c4547076402ca7804574137ef3312d10fbc6a43cff23b82e", "expected": {"candidateRelease": "immutable-ec2a9fde-vps-20261024T162005Z", "components": ["api", "frontend"], "target": "ec2a9fde99b6421a85256f14604bd469879f4f2a", "previousLinks": {"api": "/opt/re7online/releases/immutable-a62da468-vps-20261024T124726Z/api-runtime", "frontend": "/opt/re7online/releases/immutable-a62da468-vps-20261024T124726Z/frontend-runtime"}}},
        {"path": "/opt/re7online/backups/converta-persistent/deploy-preparations/immutable-ec2a9fde-vps-20261024T162005Z-20261024T165500Z/activation.private.json", "sha256": "45808ec524e086d9b3b333346d80b24ad1a78e5b2cf86a835fa230e8a09d511f", "expected": {"state": "DEPLOYED"}},
        {"path": "/opt/re7online/backups/converta-persistent/deploy-preparations/immutable-ef7db111-vps-20261024T174000Z-20261024T180933Z/preflight.private.json", "sha256": "c39675efcf559059b66f33bf45711e08ec22647afe9dc9e4e121cdc7024510f0", "expected": {"release": "immutable-ef7db111-vps-20261024T174000Z", "target": "ef7db11179a1be14160e0f7ceec9f01a8aaf0ece", "candidateApi": "/opt/re7online/releases/immutable-ef7db111-vps-20261024T174000Z/api-runtime", "rollbackApi": "/opt/re7online/releases/immutable-ec2a9fde-vps-20261024T162005Z/api-runtime", "frontendPreserved": "/opt/re7online/releases/immutable-ec2a9fde-vps-20261024T162005Z/frontend-runtime"}},
        {"path": "/opt/re7online/backups/converta-persistent/deploy-preparations/immutable-ef7db111-vps-20261024T174000Z-20261024T180933Z/activation.private.json", "sha256": "f8073f00dfc0eb990f33e872f1941de02b7f62d348baed1be02aa14a4a4bb8d2", "expected": {"state": "DEPLOYED"}},
        {"path": "/opt/re7online/backups/converta-persistent/deploy-preparations/immutable-3630e16-vps-20261024T195842Z-20261024T202748Z/preflight.private.json", "sha256": "0ec171428e7d79bc4d75f37f4f11f2283ffcd44cb473df34ae6b313c1eac597b", "expected": {"release": "immutable-3630e16-vps-20261024T195842Z", "target": "3630e16dfc946ab8ef97fb73780075a736f38a63", "components": ["api"], "candidateApi": "/opt/re7online/releases/immutable-3630e16-vps-20261024T195842Z/api-runtime", "rollbackApi": "/opt/re7online/releases/immutable-ef7db111-vps-20261024T174000Z/api-runtime", "frontendPreserved": "/opt/re7online/releases/immutable-ec2a9fde-vps-20261024T162005Z/frontend-runtime"}},
        {"path": "/opt/re7online/backups/converta-persistent/deploy-preparations/immutable-3630e16-vps-20261024T195842Z-20261024T202748Z/activation.private.json", "sha256": "1da6cc4b3b8e8ca7b871ec4bffdd8583cebcbd4d58b44ff9705c7563f7df339a", "expected": {"state": "DEPLOYED"}},
        {"path": "/opt/re7online/backups/converta-persistent/deploy-preparations/immutable-d7de6453-vps-20261024T221500Z-20261024T223600Z/preflight.private.json", "sha256": "c8730148e03a847bbd4a0c86a0e381a0a47ec6891de93272e035be3056da029e", "expected": {"release": "immutable-d7de6453-vps-20261024T221500Z", "target": "d7de6453aeab6d117e8d79a1dc3a0722875f39cc", "components": ["api", "frontend"], "candidateApi": "/opt/re7online/releases/immutable-d7de6453-vps-20261024T221500Z/api-runtime", "candidateFrontend": "/opt/re7online/releases/immutable-d7de6453-vps-20261024T221500Z/frontend-runtime", "rollbackApi": "/opt/re7online/releases/immutable-3630e16-vps-20261024T195842Z/api-runtime", "rollbackFrontend": "/opt/re7online/releases/immutable-ec2a9fde-vps-20261024T162005Z/frontend-runtime"}},
        {"path": "/opt/re7online/backups/converta-persistent/deploy-preparations/immutable-d7de6453-vps-20261024T221500Z-20261024T223600Z/activation.private.json", "sha256": "a119f6231837653c7eeb23922f84ce6da30712972492bb7631665e15d43479af", "expected": {"state": "DEPLOYED"}},
        {"path": "/opt/re7online/backups/converta-persistent/deploy-preparations/immutable-a959129e-vps-20261026T023100Z-activation-v7-20261026/finalization-receipt.private.json", "sha256": "3567a10a165af03377ce912ed44f7628646a33cdfb33c70ffc597f926f353dc8", "expected": {"state": "DEPLOYED"}},
        {"path": "/opt/re7online/backups/converta-persistent/deploy-preparations/immutable-a959129e-vps-20261026T023100Z-activation-v7-20261026/window-state.private.json", "sha256": "991d549a1bc7f93b88cd1b51e1fdafaef13162555e20eac2b2471566e0804240", "expected": {"state": "DEPLOYED"}},
        {"path": "/opt/re7online/backups/converta-persistent/preparations/p00-legacy-installed-releases-20261107-v1/evidence/CAMPAIGN_AVAILABILITY_MEDIA_ADMISSION_2026-10-26_DEPLOYED.json", "sha256": "c0d702aabd0e3caa1d8044671de07bd1f355985fd34b3d6bb457c146a708abb6", "expected": {"rollback": {"previousApiReleaseId": "immutable-d7de6453-vps-20261024T221500Z", "previousFrontendReleaseId": "immutable-d7de6453-vps-20261024T221500Z"}, "receiptSha256": "3567a10a165af03377ce912ed44f7628646a33cdfb33c70ffc597f926f353dc8", "journalSha256": "991d549a1bc7f93b88cd1b51e1fdafaef13162555e20eac2b2471566e0804240"}},
    ),
}
LEGACY_P00_CUSTODY_RESERVE_BYTES = 16 * 1024 * 1024


class Denied(RuntimeError):
    pass


def deny(predicate: str) -> None:
    raise Denied(predicate)


def canonical(value: Any) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()


def digest_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def stable_private(path: Path, expected_sha: str | None = None) -> tuple[bytes, os.stat_result]:
    if not path.is_absolute() or not SHA256.fullmatch(expected_sha or "0" * 64):
        deny("authenticated_input")
    try:
        before = path.lstat()
        if (path.is_symlink() or not stat.S_ISREG(before.st_mode) or
                before.st_uid != os.geteuid() or stat.S_IMODE(before.st_mode) != 0o600):
            deny(f"private_identity:{path.name}")
        value = path.read_bytes()
        after = path.lstat()
    except OSError:
        deny(f"private_read:{path.name}")
    identity = lambda item: (item.st_dev, item.st_ino, item.st_mode, item.st_size,
                             item.st_mtime_ns, item.st_ctime_ns)
    if identity(before) != identity(after) or len(value) != after.st_size:
        deny(f"private_changed:{path.name}")
    if expected_sha is not None and digest_bytes(value) != expected_sha:
        deny(f"private_hash:{path.name}")
    return value, after


def stable_policy(path: Path, expected_sha: str) -> tuple[bytes, os.stat_result]:
    if not path.is_absolute() or not SHA256.fullmatch(expected_sha):
        deny("root_policy_authenticated_input")
    try:
        before = path.lstat(); value = path.read_bytes(); after = path.lstat()
    except OSError:
        deny("root_policy_read")
    identity = lambda item: (item.st_dev, item.st_ino, item.st_mode, item.st_size,
                             item.st_mtime_ns, item.st_ctime_ns)
    if (path.is_symlink() or not stat.S_ISREG(before.st_mode) or before.st_uid != os.geteuid() or
            stat.S_IMODE(before.st_mode) not in {0o600, 0o644} or identity(before) != identity(after) or
            len(value) != after.st_size or digest_bytes(value) != expected_sha):
        deny("root_policy_identity")
    return value, after


def stable_regular_hash(path: Path, expected_sha: str, predicate: str) -> tuple[bytes, os.stat_result]:
    if not path.is_absolute() or not SHA256.fullmatch(expected_sha):
        deny(f"{predicate}_authenticated_input")
    try:
        before = path.lstat()
        if (path.is_symlink() or not stat.S_ISREG(before.st_mode) or before.st_uid != os.geteuid() or
                stat.S_IMODE(before.st_mode) & 0o022):
            deny(f"{predicate}_identity")
        value = path.read_bytes()
        after = path.lstat()
    except OSError:
        deny(f"{predicate}_read")
    identity = lambda item: (item.st_dev, item.st_ino, item.st_mode, item.st_size,
                             item.st_mtime_ns, item.st_ctime_ns)
    if (identity(before) != identity(after) or len(value) != after.st_size or
            digest_bytes(value) != expected_sha):
        deny(f"{predicate}_hash_or_drift")
    return value, after


def object_json(raw: bytes, label: str) -> dict[str, Any]:
    try:
        value = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError):
        deny(f"json_invalid:{label}")
    if not isinstance(value, dict):
        deny(f"json_object:{label}")
    return value


def write_exclusive(path: Path, value: bytes) -> None:
    if not path.is_absolute() or path.exists() or path.is_symlink():
        deny(f"destination_exists:{path.name}")
    path.parent.mkdir(mode=0o700, parents=False, exist_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        offset = 0
        while offset < len(value):
            count = os.write(fd, value[offset:])
            if count <= 0:
                deny("short_write")
            offset += count
        os.fsync(fd)
    finally:
        os.close(fd)
    fsync_dir(path.parent)


def write_or_verify_exact(path: Path, value: bytes, predicate: str) -> bool:
    """Publish once, or prove an earlier publication is byte-identical."""
    if path.exists() or path.is_symlink():
        existing, _ = stable_private(path)
        if existing != value:
            deny(f"{predicate}_divergent")
        return False
    write_exclusive(path, value)
    return True


def replace_private(path: Path, value: bytes) -> None:
    temporary = path.with_name(f".{path.name}.{os.getpid()}.partial")
    if temporary.exists() or temporary.is_symlink():
        deny("temporary_exists")
    if path.exists() or path.is_symlink():
        old, _ = stable_private(path)
        previous = path.with_name(f"{path.name}.previous.{digest_bytes(old)}")
        if not previous.exists() and not previous.is_symlink():
            os.link(path, previous, follow_symlinks=False)
            fsync_dir(path.parent)
    write_exclusive(temporary, value)
    os.replace(temporary, path)
    fsync_dir(path.parent)


def fsync_dir(path: Path) -> None:
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def acquire_existing_lock(path: Path):
    before = path.lstat()
    if (path.is_symlink() or not stat.S_ISREG(before.st_mode) or before.st_uid != os.geteuid() or
            stat.S_IMODE(before.st_mode) != 0o600):
        deny(f"lock_identity:{path.name}")
    fd = os.open(path, os.O_RDWR | os.O_NOFOLLOW | os.O_CLOEXEC)
    opened = os.fstat(fd)
    if (before.st_dev, before.st_ino) != (opened.st_dev, opened.st_ino):
        os.close(fd); deny(f"lock_changed:{path.name}")
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(fd); deny(f"lock_busy:{path.name}")
    if os.pread(fd, len(FIXED_CURRENT_LOCK_PREFIX), 0).startswith(
            FIXED_CURRENT_LOCK_PREFIX):
        os.close(fd); deny(f"lock_bound_fixed_current:{path.name}")
    return fd


def acquire_or_authenticate_lock(path: Path, inherited_fd: int | None,
                                 creation_binding: str | None = None):
    if inherited_fd is None:
        if not path.exists() and not path.is_symlink():
            if not isinstance(creation_binding, str) or not SHA256.fullmatch(creation_binding):
                deny("lock_creation_binding")
            path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            flags = os.O_RDWR | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
            try:
                fd = os.open(path, flags, 0o600)
            except FileExistsError:
                deny(f"lock_creation_race:{path.name}")
            try:
                value = (creation_binding + "\n").encode()
                if os.write(fd, value) != len(value):
                    deny(f"lock_short_write:{path.name}")
                os.fsync(fd)
                opened = os.fstat(fd)
                if (not stat.S_ISREG(opened.st_mode) or opened.st_uid != os.geteuid() or
                        opened.st_gid != os.getegid() or stat.S_IMODE(opened.st_mode) != 0o600):
                    deny(f"lock_identity:{path.name}")
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                fsync_dir(path.parent)
                return fd
            except Exception:
                os.close(fd)
                raise
        return acquire_existing_lock(path)
    try:
        before = path.lstat()
        fd = os.dup(inherited_fd)
        opened = os.fstat(fd)
        target = Path(f"/proc/self/fd/{fd}").resolve(strict=True)
    except OSError:
        deny("inherited_lock_identity")
    if (path.is_symlink() or not stat.S_ISREG(before.st_mode) or target != path or
            (before.st_dev, before.st_ino) != (opened.st_dev, opened.st_ino)):
        os.close(fd); deny("inherited_lock_identity")
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(fd); deny("inherited_lock_not_held")
    return fd


def validate_contract(value: dict[str, Any]) -> None:
    required = {"schemaVersion", "generationId", "releaseId", "targetCommit", "state",
                "writerLockPath", "classes", "artifacts", "privateDataPolicy"}
    optional = {"privateDataOverlay"}
    if (not required.issubset(value) or not set(value).issubset(required | optional) or
            value.get("schemaVersion") != 1 or value.get("state") not in {"COMPLETE", "FAILED"}):
        deny("artifact_contract_schema")
    if value.get("privateDataPolicy") != "PRIVATE_DATA_NEVER_RETIRE":
        deny("artifact_contract_private_data")
    overlay = value.get("privateDataOverlay")
    if overlay is not None and overlay != {
        "path": "api-runtime/.data", "classification": "PRIVATE_DATA_NEVER_RETIRE",
        "state": "ACTIVE_DEPENDENCY", "retirableOn": "NEVER_AUTOMATIC",
    }:
        deny("artifact_contract_private_data_overlay")
    is_f160 = (value["releaseId"] == "immutable-f1602787-vps-20261026T174702Z" and
               value["targetCommit"] ==
               LEGACY_D436_F160_BINDINGS[value["releaseId"]]["targetCommit"])
    expected_classes = PRESERVE_CLASSES | DERIVED_CLASSES | {"RELEASE_RUNTIME"}
    if is_f160:
        expected_classes.add(F160_CACHE_CLASS)
    if value.get("classes") != sorted(expected_classes):
        deny("artifact_contract_classes")
    if not Path(str(value.get("writerLockPath", ""))).is_absolute():
        deny("artifact_contract_writer_lock")
    if not isinstance(value.get("artifacts"), list) or not value["artifacts"]:
        deny("artifact_contract_artifacts")
    paths = set()
    authenticated_retention_paths: set[str] = set()
    a959_overlay_paths: set[str] = set()
    f160_cache_paths: set[str] = set()
    retention_binding = None
    if (value["releaseId"] == LEGACY_A959_V1_PRESERVE_BINDING["releaseId"] and
            value["targetCommit"] == LEGACY_A959_V1_PRESERVE_BINDING["targetCommit"]):
        retention_binding = LEGACY_A959_V1_PRESERVE_BINDING["priorRetention"]
        retention_binding = {**retention_binding,
                             "ordinals": tuple(int(item) for item in retention_binding["a959Ordinals"])}
    elif value["releaseId"] in LEGACY_D436_F160_BINDINGS:
        candidate = LEGACY_D436_F160_BINDINGS[value["releaseId"]]
        if value["targetCommit"] == candidate["targetCommit"]:
            retention_binding = {**LEGACY_RETENTION_BATCH, "ordinals": candidate["ordinals"]}
    retention_expected_by_path = ({retention_binding["removedPaths"][ordinal - 1]: ordinal
                                   for ordinal in retention_binding["ordinals"]}
                                  if retention_binding else {})
    for artifact in value["artifacts"]:
        required_entry = {"path", "releaseId", "targetCommit", "expectedType", "initialIdentity", "observedIdentity",
                          "sizeBytes", "allocatedBytes", "inodes", "digest", "class", "state",
                          "retirableOn", "dependencies", "structuralSha256"}
        optional = {"removedAtProducerCompletion", "removedByAuthenticatedRetention"}
        if (not isinstance(artifact, dict) or not required_entry.issubset(artifact) or
                not set(artifact).issubset(required_entry | optional)):
            deny("artifact_contract_entry")
        path = Path(str(artifact.get("path", "")))
        if (not path.is_absolute() or str(path) in paths or artifact.get("releaseId") != value["releaseId"] or
                artifact.get("targetCommit") != value["targetCommit"]):
            deny("artifact_contract_path")
        paths.add(str(path))
        if artifact.get("class") not in expected_classes:
            deny("artifact_contract_class")
        if (value["releaseId"] == LEGACY_A959_V1_PRESERVE_BINDING["releaseId"] and
                value["targetCommit"] == LEGACY_A959_V1_PRESERVE_BINDING["targetCommit"] and
                (str(path) == LEGACY_A959_V1_PRESERVE_BINDING["privateDataOverlay"]["path"] or
                 artifact.get("class") == "PRIVATE_DATA_NEVER_RETIRE")):
            if (str(path) != LEGACY_A959_V1_PRESERVE_BINDING["privateDataOverlay"]["path"] or
                    artifact.get("class") != "PRIVATE_DATA_NEVER_RETIRE" or
                    artifact.get("state") != "ACTIVE_DEPENDENCY" or
                    artifact.get("retirableOn") != "NEVER_AUTOMATIC" or
                    artifact.get("expectedType") != "directory" or
                    artifact.get("initialIdentity") is None or
                    artifact.get("observedIdentity") is None or
                    artifact.get("structuralSha256") is not None):
                deny("artifact_contract_a959_private_data_overlay")
            a959_overlay_paths.add(str(path))
        f160 = LEGACY_D436_F160_BINDINGS["immutable-f1602787-vps-20261026T174702Z"]
        if (value["releaseId"] == "immutable-f1602787-vps-20261026T174702Z" and
                value["targetCommit"] == f160["targetCommit"] and
                (str(path) == f160["overlayPath"] or artifact.get("class") == "EPHEMERAL_RUNTIME_CACHE")):
            if (str(path) != f160["overlayPath"] or artifact.get("class") != "EPHEMERAL_RUNTIME_CACHE" or
                    artifact.get("state") != "ACTIVE_DEPENDENCY" or
                    artifact.get("retirableOn") != "WITH_PARENT_RELEASE_ONLY" or
                    artifact.get("expectedType") != "directory" or
                    artifact.get("initialIdentity") is None or
                    artifact.get("observedIdentity") is None or
                    artifact.get("structuralSha256") is not None):
                deny("artifact_contract_f160_runtime_cache_overlay")
            f160_cache_paths.add(str(path))
        if (artifact.get("state") not in ARTIFACT_STATES or
                not isinstance(artifact.get("retirableOn"), str) or not artifact["retirableOn"] or
                not isinstance(artifact.get("dependencies"), list) or
                any(not isinstance(item, str) or not item for item in artifact["dependencies"])):
            deny("artifact_contract_policy")
        for identity_name in ("initialIdentity", "observedIdentity"):
            identity = artifact.get(identity_name)
            if identity is not None and (not isinstance(identity, dict) or set(identity) != {"device", "inode"} or
                                         any(not isinstance(identity.get(key), int) or identity[key] < 0
                                             for key in ("device", "inode"))):
                deny("artifact_contract_identity")
        for field in ("sizeBytes", "allocatedBytes", "inodes"):
            if not isinstance(artifact.get(field), int) or artifact[field] < 0:
                deny("artifact_contract_metrics")
        structural = artifact.get("structuralSha256")
        if structural is not None and not SHA256.fullmatch(str(structural)):
            deny("artifact_contract_structural_digest")
        retention = artifact.get("removedByAuthenticatedRetention")
        if retention is not None:
            expected_retention = {"batchId", "receiptSha256", "journalSha256", "ordinal"}
            expected_ordinal = retention_expected_by_path.get(str(path))
            expected_class = "DERIVED_WORKTREE" if expected_ordinal in {1, 2, 3} else "DERIVED_OUTPUT_RUNTIME"
            if (retention_binding is None or
                    set(retention) != expected_retention or expected_ordinal is None or
                    retention != {"batchId": retention_binding["batchId"],
                                  "receiptSha256": retention_binding["receiptSha256"],
                                  "journalSha256": retention_binding["journalSha256"],
                                  "ordinal": expected_ordinal} or
                    artifact["class"] != expected_class or artifact.get("state") != "SANITIZED"):
                deny("artifact_contract_authenticated_retention")
            authenticated_retention_paths.add(str(path))
    if (authenticated_retention_paths and
            authenticated_retention_paths != set(retention_expected_by_path)):
        deny("artifact_contract_authenticated_retention_scope")
    if (value["releaseId"] == LEGACY_A959_V1_PRESERVE_BINDING["releaseId"] and
            value["targetCommit"] == LEGACY_A959_V1_PRESERVE_BINDING["targetCommit"] and
            a959_overlay_paths != {LEGACY_A959_V1_PRESERVE_BINDING["privateDataOverlay"]["path"]}):
        deny("artifact_contract_a959_private_data_overlay")
    if (value["releaseId"] == "immutable-f1602787-vps-20261026T174702Z" and
            value["targetCommit"] == LEGACY_D436_F160_BINDINGS[value["releaseId"]]["targetCommit"] and
            f160_cache_paths != {LEGACY_D436_F160_BINDINGS[value["releaseId"]]["overlayPath"]}):
        deny("artifact_contract_f160_runtime_cache_overlay")


def _strict_child(path: Path, root: Path, predicate: str) -> None:
    if (not path.is_absolute() or ".." in path.parts or
            Path(os.path.normpath(str(path))) != path or
            any(ord(character) < 32 for character in str(path)) or
            path == root or root not in path.parents):
        deny(predicate)


def _protected_directory(path: Path, predicate: str) -> Path:
    if not path.is_absolute():
        deny(predicate)
    try:
        info = path.lstat()
        resolved = path.resolve(strict=True)
    except OSError:
        deny(predicate)
    if path.is_symlink() or not stat.S_ISDIR(info.st_mode) or resolved != path:
        deny(predicate)
    return resolved


def _validate_ancestors(path: Path, owner_uid: int, predicate: str) -> None:
    current = path
    while True:
        try:
            info = current.lstat()
        except OSError:
            deny(predicate)
        if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
            deny(predicate)
        mode = stat.S_IMODE(info.st_mode)
        # A root-owned sticky directory (normally /tmp) is the only writable
        # ancestor accepted by synthetic/offline fixtures.
        writable = mode & 0o022
        if writable and not (mode & stat.S_ISVTX):
            deny(predicate)
        if current == current.parent:
            break
        current = current.parent


def validate_root_policy(raw: bytes, expected_sha256: str) -> dict[str, Any]:
    if digest_bytes(raw) != expected_sha256:
        deny("root_policy_hash")
    policy = object_json(raw, "root-policy")
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
                    any(not isinstance(mode, str) or not re.fullmatch(r"0[0-7]{3}", mode) for mode in modes)):
                deny(f"root_policy_entry:{key}")
            if Path(os.path.normpath(str(path))) != path:
                deny(f"root_policy_entry:{key}")
            parsed.append(str(path))
            parsed_definitions.append(entry)
        entries[key] = parsed if key == "evidence" else parsed[0]
        definitions[key] = parsed_definitions if key == "evidence" else parsed_definitions[0]
    return {"schemaVersion": 1, "canonicalRoots": entries,
            "definitions": definitions, "sha256": expected_sha256}


def authenticate_policy_root(policy: dict[str, Any], key: str) -> list[Path]:
    raw_entries = policy["definitions"][key] if key == "evidence" else [policy["definitions"][key]]
    authenticated = []
    for entry in raw_entries:
        path = Path(entry["path"])
        resolved = _protected_directory(path, f"root_policy_directory:{key}")
        info = resolved.lstat()
        mode = stat.S_IMODE(info.st_mode)
        if (info.st_uid != entry["ownerUid"] or info.st_gid != entry["groupGid"] or
                f"0{mode:03o}" not in entry["allowedModes"] or mode & 0o022):
            deny(f"root_policy_identity:{key}")
        _validate_ancestors(resolved.parent, entry["ownerUid"], f"root_policy_ancestor:{key}")
        authenticated.append(resolved)
    return authenticated


def validate_operational(value: dict[str, Any], contract: dict[str, Any], policy: dict[str, Any]) -> None:
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
                                  set(immediate) != {"api", "frontend"} or
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
    resolved_roots = {key: authenticate_policy_root(policy, key)[0]
                      for key in ("repository", "worktrees", "outputs", "releases")}
    resolved_roots["staging"] = Path(roots["staging"])
    evidence_roots = authenticate_policy_root(policy, "evidence")
    if len(set(evidence_roots)) != len(evidence_roots):
        deny("canonical_root:evidence_duplicate")
    if resolved_roots["repository"] != Path(value["gitRepository"]):
        deny("canonical_repository_identity")
    compared_roots = {**resolved_roots, **{f"evidence[{index}]": path
                      for index, path in enumerate(evidence_roots)}}
    for first, first_path in compared_roots.items():
        for second, second_path in compared_roots.items():
            if first >= second:
                continue
            if first_path in second_path.parents or second_path in first_path.parents:
                if ((first == "outputs" and second.startswith("evidence[") or
                     second == "outputs" and first.startswith("evidence[")) and
                        resolved_roots["outputs"] in
                        (second_path if second.startswith("evidence[") else first_path).parents):
                    continue
                deny(f"canonical_roots_overlap:{first}:{second}")
    controls = value.get("controlPlaneArtifacts")
    if not isinstance(controls, list) or not controls:
        deny("operational_control_plane")
    for item in controls:
        if (not isinstance(item, dict) or set(item) != {"path", "sha256", "copied"} or
                not Path(str(item["path"])).is_absolute() or not SHA256.fullmatch(str(item["sha256"])) or
                item["copied"] is not True):
            deny("operational_control_plane")
        path = Path(item["path"])
        try:
            info = path.lstat()
            if path.is_symlink() or not stat.S_ISREG(info.st_mode) or digest_bytes(path.read_bytes()) != item["sha256"]:
                deny("operational_control_plane_hash")
        except OSError:
            deny("operational_control_plane_hash")
    deployment = value.get("deploymentState")
    if not isinstance(deployment, dict) or set(deployment) != {"state"} or not isinstance(deployment["state"], str):
        deny("operational_deployment_state")
    observations = value.get("observations")
    observation_keys = {"currentLinks", "pm2", "dump", "releaseGraph"}
    if (not isinstance(observations, dict) or
            set(observations) not in {frozenset(observation_keys),
                                     frozenset(observation_keys | {"dependencies"})}):
        deny("operational_observations")
    links = observations.get("currentLinks")
    if not isinstance(links, list) or any(not isinstance(item, dict) or set(item) != {"path", "target"}
                                          or not Path(str(item["path"])).is_absolute()
                                          or not Path(str(item["target"])).is_absolute() for item in links):
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
    if dependency_observation is not None:
        if (not isinstance(dependency_observation, dict) or
                set(dependency_observation) != {"path", "sha256"} or
                not Path(str(dependency_observation.get("path", ""))).is_absolute() or
                not SHA256.fullmatch(str(dependency_observation.get("sha256", "")))):
            deny("operational_dependencies_observation")


def _path_has_symlink(path: Path, root: Path) -> bool:
    current = path
    while current != root:
        try:
            if current.is_symlink():
                return True
        except OSError:
            return True
        current = current.parent
    return root.is_symlink()


def validate_artifact_roots(contract: dict[str, Any], operational: dict[str, Any],
                            policy: dict[str, Any]) -> None:
    roots = {key: Path(value) for key, value in operational["canonicalRoots"].items()
             if key != "evidence"}
    class_root = {
        "DERIVED_WORKTREE": roots["worktrees"],
        "DERIVED_OUTPUT_RUNTIME": roots["outputs"],
        "DERIVED_STAGING": roots["staging"],
        "RELEASE_RUNTIME": roots["releases"],
    }
    staging_root_required = any(
        artifact.get("class") == "DERIVED_STAGING" and not (
            artifact.get("state") == "SANITIZED" and
            artifact.get("removedAtProducerCompletion") is True and
            not Path(str(artifact.get("path", ""))).exists() and
            not Path(str(artifact.get("path", ""))).is_symlink()
        )
        for artifact in contract["artifacts"]
    )
    if staging_root_required:
        authenticate_policy_root(policy, "staging")
    for artifact in contract["artifacts"]:
        kind = artifact["class"]
        if kind not in class_root:
            continue
        path = Path(artifact["path"])
        root = class_root[kind]
        staging_already_removed = (kind == "DERIVED_STAGING" and
                                   artifact.get("state") == "SANITIZED" and
                                   artifact.get("removedAtProducerCompletion") is True and
                                   not path.exists() and not path.is_symlink())
        if staging_already_removed:
            # The producer's independent verification extraction historically
            # lived directly below build-output and was removed before contract
            # publication. It is evidence only: no command may target it.
            allowed_roots = (roots["staging"], roots["outputs"])
            if not any(path != candidate and candidate in path.parents
                       for candidate in allowed_roots):
                deny(f"artifact_outside_canonical_root:{kind}")
        else:
            _strict_child(path, root, f"artifact_outside_canonical_root:{kind}")
            if _path_has_symlink(path, root):
                deny(f"artifact_unsafe_ancestor:{kind}")
        if kind == "DERIVED_WORKTREE" and path == roots["repository"]:
            deny("canonical_checkout_not_retirable")


def _pm2_fingerprint(rows: Any) -> str:
    if not isinstance(rows, list):
        deny("fresh_pm2_shape")
    projected = []
    for row in rows:
        if not isinstance(row, dict):
            deny("fresh_pm2_row")
        env = row.get("pm2_env") if isinstance(row.get("pm2_env"), dict) else {}
        projected.append({key: row.get(key, env.get(key)) for key in
                          ("name", "pid", "status", "restart_time", "pm_cwd", "pm_exec_path",
                           "exec_mode", "instances", "args", "node_args", "namespace",
                           "out_file", "error_file")})
    return digest_bytes(canonical(sorted(projected, key=lambda item: str(item.get("name")))))


def capture_fresh_operational(operational: dict[str, Any]) -> dict[str, Any]:
    observations = operational["observations"]
    links = []
    for item in observations["currentLinks"]:
        path = Path(item["path"])
        try:
            observed_target = path.resolve(strict=True)
            if not path.is_symlink() or observed_target != Path(item["target"]).resolve(strict=True):
                deny(f"fresh_current_changed:{path.name}")
        except OSError:
            deny(f"fresh_current_changed:{path.name}")
        links.append({"path": str(path), "target": str(observed_target)})
    pm2 = observations["pm2"]
    pm2_path = Path(pm2["path"])
    try:
        fd = os.open(pm2_path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
        info = os.fstat(fd)
        chunks = []
        while True:
            block = os.read(fd, 1024 * 1024)
            if not block:
                break
            chunks.append(block)
        raw = b"".join(chunks)
    except OSError:
        deny("fresh_pm2_binary")
    try:
        if not stat.S_ISREG(info.st_mode) or digest_bytes(raw) != pm2["sha256"]:
            deny("fresh_pm2_binary")
        # Invoke the already-authenticated inode, not the mutable pathname.
        result = subprocess.run([f"/proc/self/fd/{fd}", "jlist"], text=True,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                timeout=30, pass_fds=(fd,))
    finally:
        os.close(fd)
    if result.returncode:
        deny("fresh_pm2_jlist")
    try:
        rows = json.loads(result.stdout)
    except json.JSONDecodeError:
        deny("fresh_pm2_jlist")
    fingerprint = _pm2_fingerprint(rows)
    if fingerprint != pm2["fingerprintSha256"]:
        deny("fresh_pm2_changed")
    captured = {"currentLinks": links, "pm2FingerprintSha256": fingerprint}
    for label in ("dump", "releaseGraph"):
        item = observations[label]
        raw, _ = stable_private(Path(item["path"]), item["sha256"])
        captured[f"{label}Sha256"] = digest_bytes(raw)
        if label == "releaseGraph":
            graph = object_json(raw, "release-graph")
            expected = {key: operational[key] for key in ("activeReleases", "rollbackReleases",
                        "transitiveReturnReleases", "candidateReleases", "installedVerifiedReleases",
                        "supersededCandidates")}
            if "immediateRollbackReleases" in operational:
                expected["immediateRollbackReleases"] = operational["immediateRollbackReleases"]
            if graph != expected:
                deny("fresh_release_graph_changed")
    dependency_observation = observations.get("dependencies")
    if dependency_observation is not None:
        raw, _ = stable_private(Path(dependency_observation["path"]),
                                dependency_observation["sha256"])
        snapshot = object_json(raw, "dependencies-snapshot")
        if (set(snapshot) != {"schemaVersion", "dependencies"} or
                snapshot.get("schemaVersion") != 1 or
                snapshot.get("dependencies") != operational["dependencies"]):
            deny("fresh_dependencies_changed")
        captured["dependenciesSha256"] = digest_bytes(raw)
    return captured


def known_references(operational: dict[str, Any]) -> set[str]:
    return set(operational["currentPaths"] + operational["pm2LivePaths"] +
               operational["pm2DumpPaths"] + operational["dependencies"])


def path_referenced(path: str, operational: dict[str, Any]) -> bool:
    candidate = os.path.normpath(path)
    for raw in known_references(operational):
        reference = os.path.normpath(raw)
        try:
            common = os.path.commonpath((candidate, reference))
        except ValueError:
            continue
        if common in {candidate, reference}:
            return True
    return False


def authenticate_artifact(artifact: dict[str, Any]) -> None:
    path = Path(artifact["path"])
    if not path.exists() and not path.is_symlink():
        if (artifact.get("removedAtProducerCompletion") is True or
                artifact.get("removedByAuthenticatedRetention") is not None or
                artifact["class"] in {"EVIDENCE_PRESERVE", "RELEASE_RUNTIME"}):
            return
        deny(f"artifact_missing:{path}")
    info = path.lstat()
    if path.is_symlink():
        deny(f"artifact_symlink:{path}")
    expected_type = artifact["expectedType"]
    if ((expected_type == "directory" and not stat.S_ISDIR(info.st_mode)) or
            (expected_type == "regular_file" and not stat.S_ISREG(info.st_mode))):
        deny(f"artifact_type:{path}")
    expected = artifact.get("observedIdentity")
    if expected is not None and (info.st_dev, info.st_ino) != (expected.get("device"), expected.get("inode")):
        deny(f"artifact_identity:{path}")
    if artifact.get("structuralSha256") is not None:
        a959_binding = LEGACY_A959_V1_PRESERVE_BINDING
        is_a959_installed_runtime = (
            artifact.get("releaseId") == a959_binding["releaseId"] and
            artifact.get("targetCommit") == a959_binding["targetCommit"] and
            artifact.get("class") == "RELEASE_RUNTIME" and
            path == Path(a959_binding["installedReleasePath"])
        )
        is_f160_installed_runtime = (
            artifact.get("releaseId") == "immutable-f1602787-vps-20261026T174702Z" and
            artifact.get("targetCommit") == LEGACY_D436_F160_BINDINGS[artifact["releaseId"]]["targetCommit"] and
            artifact.get("class") == "RELEASE_RUNTIME" and
            path == Path(LEGACY_D436_F160_BINDINGS[artifact["releaseId"]].get(
                "installedReleasePath",
                "/opt/re7online/releases/immutable-f1602787-vps-20261026T174702Z"))
        )
        observed = (_legacy_structural_metrics(
            path, {Path(a959_binding["privateDataOverlay"]["path"])}
        ) if is_a959_installed_runtime else _legacy_structural_metrics(
            path, {Path(LEGACY_D436_F160_BINDINGS[artifact["releaseId"]]["overlayPath"])}
        ) if is_f160_installed_runtime else structural_metrics(path))
        for field in ("sizeBytes", "allocatedBytes", "inodes", "structuralSha256"):
            if observed[field] != artifact.get(field):
                deny(f"artifact_drift:{path}:{field}")
    digest = artifact.get("digest")
    if artifact["class"] == "PRIVATE_DATA_NEVER_RETIRE":
        expected_digest = {"policy", "scope", "ownerUid", "groupGid", "mode"}
        if (not isinstance(digest, dict) or set(digest) != expected_digest or
                digest.get("policy") != "PRIVATE_DATA_NEVER_RETIRE" or
                digest.get("scope") != "ROOT_IDENTITY_ONLY" or
                (info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)) !=
                (digest.get("ownerUid"), digest.get("groupGid"), digest.get("mode"))):
            deny(f"artifact_private_data_identity:{path}")
        release_root = Path(artifact["path"]).parents[1]
        try:
            release_info = release_root.lstat()
            resolved_root = path.resolve(strict=True)
        except OSError:
            deny(f"artifact_private_data_identity:{path}")
        if ((info.st_uid, info.st_gid) != (release_info.st_uid, release_info.st_gid) or
                stat.S_IMODE(info.st_mode) & 0o022 or resolved_root != path):
            deny(f"artifact_private_data_identity:{path}")
        for item in path.rglob("*"):
            try:
                item_info = item.lstat()
                item_resolved = item.resolve(strict=True)
            except OSError:
                deny(f"artifact_private_data_read:{path}")
            if (stat.S_ISLNK(item_info.st_mode) or
                    not (stat.S_ISDIR(item_info.st_mode) or stat.S_ISREG(item_info.st_mode)) or
                    not (item_resolved == resolved_root or resolved_root in item_resolved.parents)):
                deny(f"artifact_private_data_symlink:{path}")
    if artifact["class"] == "EPHEMERAL_RUNTIME_CACHE":
        expected_digest = {"policy", "scope", "ownerUid", "groupGid", "mode"}
        if (not isinstance(digest, dict) or set(digest) != expected_digest or
                digest.get("policy") != "EPHEMERAL_RUNTIME_CACHE" or
                digest.get("scope") != "ROOT_IDENTITY_ONLY" or
                (info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)) !=
                (digest.get("ownerUid"), digest.get("groupGid"), digest.get("mode")) or
                stat.S_IMODE(info.st_mode) & 0o022):
            deny(f"artifact_runtime_cache_identity:{path}")
        resolved_root = path.resolve(strict=True)
        for item in path.rglob("*"):
            item_info = item.lstat(); item_resolved = item.resolve(strict=True)
            if (stat.S_ISLNK(item_info.st_mode) or
                    not (stat.S_ISDIR(item_info.st_mode) or stat.S_ISREG(item_info.st_mode)) or
                    not (item_resolved == resolved_root or resolved_root in item_resolved.parents)):
                deny(f"artifact_runtime_cache_symlink:{path}")
    if stat.S_ISREG(info.st_mode) and isinstance(digest, dict) and digest.get("sha256"):
        if digest_bytes(path.read_bytes()) != digest["sha256"]:
            deny(f"artifact_hash:{path}")


def structural_metrics(path: Path) -> dict[str, Any]:
    root = path.lstat()
    items = [path]
    if stat.S_ISDIR(root.st_mode):
        items.extend(path.rglob("*"))
    seen: set[tuple[int, int]] = set()
    size = allocated = inodes = 0
    structure = hashlib.sha256()
    for item in sorted(items, key=lambda candidate: os.fsencode(str(candidate.relative_to(path.parent)))):
        info = item.lstat()
        identity = (info.st_dev, info.st_ino)
        relative = "." if item == path else item.relative_to(path).as_posix()
        kind = "symlink" if stat.S_ISLNK(info.st_mode) else "directory" if stat.S_ISDIR(info.st_mode) else "regular" if stat.S_ISREG(info.st_mode) else "other"
        link = os.readlink(item) if kind == "symlink" else None
        structure.update(canonical({"path": relative, "type": kind,
                                    "mode": stat.S_IMODE(info.st_mode), "size": info.st_size,
                                    "mtimeNs": info.st_mtime_ns, "link": link}))
        if identity in seen:
            continue
        seen.add(identity)
        size += info.st_size; allocated += info.st_blocks * 512; inodes += 1
    return {"sizeBytes": size, "allocatedBytes": allocated, "inodes": inodes,
            "structuralSha256": structure.hexdigest()}


def outside_artifacts(destination: Path, artifacts: list[dict[str, Any]]) -> None:
    try:
        resolved = destination.parent.resolve(strict=True) / destination.name
    except OSError:
        deny(f"evidence_destination_parent:{destination.name}")
    for artifact in artifacts:
        source = Path(artifact["path"])
        try:
            resolved.relative_to(source)
        except ValueError:
            continue
        deny(f"evidence_destination_inside_artifact:{destination.name}")


def evidence_destination(destination: Path, operational: dict[str, Any]) -> None:
    for raw in operational["canonicalRoots"]["evidence"]:
        root = Path(raw)
        try:
            _strict_child(destination, root, f"evidence_destination_root:{destination.name}")
        except Denied:
            continue
        if _path_has_symlink(destination.parent, root):
            deny(f"evidence_destination_unsafe:{destination.name}")
        try:
            parent = destination.parent.lstat()
        except FileNotFoundError:
            deny(f"evidence_destination_parent_missing:{destination.name}")
        if (destination.parent.is_symlink() or not stat.S_ISDIR(parent.st_mode) or
                parent.st_uid != os.geteuid() or parent.st_gid != os.getegid() or
                stat.S_IMODE(parent.st_mode) not in {0o700, 0o750}):
            deny(f"evidence_destination_parent_identity:{destination.name}")
        if destination.exists() or destination.is_symlink():
            deny(f"evidence_destination_exists:{destination.name}")
        return
    deny(f"evidence_destination_root:{destination.name}")


def evidence_input(path: Path, operational: dict[str, Any]) -> None:
    for raw in operational["canonicalRoots"]["evidence"]:
        root = Path(raw)
        try:
            _strict_child(path, root, f"evidence_input_root:{path.name}")
        except Denied:
            continue
        if _path_has_symlink(path.parent, root) or path.is_symlink():
            deny(f"evidence_input_unsafe:{path.name}")
        try:
            parent = path.parent.lstat()
        except FileNotFoundError:
            deny(f"evidence_input_parent_missing:{path.name}")
        if (not stat.S_ISDIR(parent.st_mode) or parent.st_uid != os.geteuid() or
                parent.st_gid != os.getegid() or
                stat.S_IMODE(parent.st_mode) not in {0o700, 0o750}):
            deny(f"evidence_input_parent_identity:{path.name}")
        if not path.is_file():
            deny(f"evidence_input_missing:{path.name}")
        return
    deny(f"evidence_input_root:{path.name}")


def canonical_review_destination(review: Path, contract: Path, lifecycle: Path,
                                 policy: dict[str, Any]) -> None:
    outputs_root = authenticate_policy_root(policy, "outputs")[0]
    if (contract.name != "generation-artifacts.private.json" or
            lifecycle.name != "generation-lifecycle.private.json" or
            contract.parent != lifecycle.parent or
            review != contract.parent / "generation-review.private.json"):
        deny("generation_review_destination")
    _strict_child(review, outputs_root, "generation_review_output_root")
    if _path_has_symlink(review.parent, outputs_root):
        deny("generation_review_unsafe_ancestor")
    definition = policy["definitions"]["outputs"]
    current = review.parent
    while current != outputs_root:
        try:
            info = current.lstat()
        except OSError:
            deny("generation_review_unsafe_ancestor")
        if (current.is_symlink() or not stat.S_ISDIR(info.st_mode) or
                info.st_uid != definition["ownerUid"] or info.st_gid != definition["groupGid"] or
                stat.S_IMODE(info.st_mode) & 0o022):
            deny("generation_review_unsafe_ancestor")
        current = current.parent
    if review.exists() or review.is_symlink():
        stable_private(review)


def classify(artifact: dict[str, Any], contract: dict[str, Any], operational: dict[str, Any]) -> str:
    kind = artifact["class"]
    release = contract["releaseId"]
    path = artifact["path"]
    if kind in PRESERVE_CLASSES:
        return "ACTIVE_DEPENDENCY"
    if kind == F160_CACHE_CLASS:
        return "ACTIVE_DEPENDENCY"
    if kind == "RELEASE_RUNTIME":
        if release_runtime_private_dependency(artifact, contract):
            return "ACTIVE_DEPENDENCY"
        if release in operational["activeReleases"]:
            return "ACTIVE_DEPENDENCY"
        if release in operational["rollbackReleases"] or release in operational["transitiveReturnReleases"]:
            return "ROLLBACK_DEPENDENCY"
        if release in operational["candidateReleases"]:
            return "CANDIDATE_PENDING_ACTIVATION"
        if path_referenced(path, operational):
            return "ACTIVE_DEPENDENCY"
        return "RETIREMENT_READY"
    if artifact.get("removedByAuthenticatedRetention") is not None:
        path = Path(path)
        if path.exists() or path.is_symlink():
            deny(f"authenticated_retention_path_reappeared:{path}")
        return "SANITIZED"
    if artifact.get("removedAtProducerCompletion") is True and not Path(path).exists():
        return "SANITIZED"
    if path_referenced(path, operational):
        return "ACTIVE_DEPENDENCY"
    if kind == "DERIVED_WORKTREE":
        package_ok = any(item["class"] == "PACKAGE_PRESERVE" and item.get("digest") for item in contract["artifacts"])
        controls_ok = all(item["copied"] for item in operational["controlPlaneArtifacts"])
        return "RETIREMENT_READY" if package_ok and controls_ok else "ACTIVE_DEPENDENCY"
    if kind == "DERIVED_OUTPUT_RUNTIME":
        if release in operational["installedVerifiedReleases"] or release in operational["supersededCandidates"]:
            return "RETIREMENT_READY"
        return "CANDIDATE_PENDING_ACTIVATION"
    if kind == "DERIVED_STAGING":
        return "RETIREMENT_READY" if operational["deploymentState"]["state"] in TERMINAL_DEPLOYMENT else "ACTIVE_DEPENDENCY"
    deny("artifact_classification")


def _strict_descendant(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
    except ValueError:
        return False
    return path != parent


def release_runtime_private_dependency(artifact: dict[str, Any],
                                       contract: dict[str, Any]) -> bool:
    """Fail closed when a release directory owns mutable private data.

    The contract may explicitly enumerate the overlay (legacy a959), while an
    older contract may only carry the policy and acquire api-runtime/.data at
    runtime (0fdec).  Both cases protect the parent.  A symlink, unreadable
    path, or mismatched classification is deliberately treated as ambiguous
    private data and therefore protected.
    """
    if artifact.get("class") != "RELEASE_RUNTIME":
        return False
    release_root = Path(str(artifact.get("path", "")))
    if not release_root.is_absolute():
        return True
    private_children = []
    for child in contract.get("artifacts", []):
        if child.get("class") != "PRIVATE_DATA_NEVER_RETIRE":
            continue
        child_path = Path(str(child.get("path", "")))
        if not child_path.is_absolute() or not _strict_descendant(child_path, release_root):
            return True
        private_children.append(child_path)
    if private_children:
        return True
    canonical_overlay = release_root / "api-runtime" / ".data"
    try:
        canonical_overlay.lstat()
    except FileNotFoundError:
        return False
    except OSError:
        return True
    # Presence is enough to protect the parent; the exact type is authenticated
    # by the PRIVATE_DATA_NEVER_RETIRE artifact when one exists.
    return True


def review_state(states: list[str]) -> str:
    if "RETIREMENT_READY" in states:
        return "RETIREMENT_READY"
    if "QUARANTINED" in states:
        return "QUARANTINED"
    if "CANDIDATE_PENDING_ACTIVATION" in states:
        return "CANDIDATE_PENDING_ACTIVATION"
    if "ROLLBACK_DEPENDENCY" in states:
        return "ROLLBACK_DEPENDENCY"
    if "ACTIVE_DEPENDENCY" in states:
        return "ACTIVE_DEPENDENCY"
    return "SANITIZED"


def command_for(artifact: dict[str, Any], operational: dict[str, Any]) -> tuple[list[str], str]:
    path = artifact["path"]
    if artifact["class"] == "DERIVED_WORKTREE":
        command = ["/usr/bin/git", "-C", operational["gitRepository"], "worktree", "remove", path]
    else:
        command = ["/usr/bin/rm", "-r", "--", path]
    return command, " ".join(command)


def _read_journal(raw: bytes) -> list[dict[str, Any]]:
    events = []
    for line in raw.splitlines():
        try:
            event = json.loads(line)
        except (UnicodeDecodeError, json.JSONDecodeError):
            deny("reconciliation_journal_invalid")
        if not isinstance(event, dict):
            deny("reconciliation_journal_invalid")
        events.append(event)
    return events


def _f160_subordinate_parent(artifact: dict[str, Any], artifacts: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Return the one closed parent binding for the historical f160 cache."""
    binding = LEGACY_D436_F160_BINDINGS["immutable-f1602787-vps-20261026T174702Z"]
    if (artifact.get("releaseId") != "immutable-f1602787-vps-20261026T174702Z" or
            artifact.get("targetCommit") != binding["targetCommit"] or
            artifact.get("class") != F160_CACHE_CLASS or
            artifact.get("retirableOn") != "WITH_PARENT_RELEASE_ONLY" or
            artifact.get("path") != binding["overlayPath"]):
        return None
    parents = [item for item in artifacts if
               item.get("releaseId") == artifact.get("releaseId") and
               item.get("targetCommit") == artifact.get("targetCommit") and
               item.get("class") == "RELEASE_RUNTIME"]
    if len(parents) != 1:
        deny("reconciliation_subordinate_parent")
    parent = parents[0]
    child_path = Path(artifact["path"])
    parent_path = Path(parent["path"])
    if child_path == parent_path or parent_path not in child_path.parents:
        deny("reconciliation_subordinate_confinement")
    return parent


def _reconciliation_absent_paths(value: dict[str, Any]) -> set[str]:
    return ({item["path"] for item in value["completed"]} |
            {item["path"] for item in value.get("subordinateAbsences", [])})


def _receipt_subordinate_absences(value: dict[str, Any]) -> list[dict[str, str]]:
    return [{"path": item["path"], "parentPath": item["parentPath"],
             "retirableOn": item["retirableOn"]}
            for item in value.get("subordinateAbsences", [])]


def validate_reconciliation(value: Any, artifacts: Any, *, require_absent: bool) -> dict[str, Any]:
    if (not isinstance(value, dict) or
            set(value) not in ({"chain", "completed"},
                               {"chain", "completed", "subordinateAbsences"})):
        deny("reconciliation_schema")
    chain = value.get("chain")
    completed = value.get("completed")
    subordinate = value.get("subordinateAbsences", [])
    if (not isinstance(chain, list) or not isinstance(completed, list) or
            not isinstance(subordinate, list)):
        deny("reconciliation_schema")
    links: list[dict[str, str]] = []
    for link in chain:
        if (not isinstance(link, dict) or
                set(link) != {"intentSha256", "receiptSha256", "journalSha256"} or
                any(not SHA256.fullmatch(str(link.get(key, ""))) for key in link)):
            deny("reconciliation_chain")
        if link in links:
            deny("reconciliation_chain_duplicate")
        links.append(link)
    if not isinstance(artifacts, list):
        deny("reconciliation_artifacts")
    by_path = {item.get("path"): (ordinal, item) for ordinal, item in enumerate(artifacts, 1)
               if isinstance(item, dict) and isinstance(item.get("path"), str)}
    if len(by_path) != len(artifacts):
        deny("reconciliation_artifacts")
    seen_paths: set[str] = set()
    normalized = []
    expected_keys = {"ordinal", "path", "observedIdentity",
                     "intentSha256", "receiptSha256", "journalSha256"}
    for item in completed:
        if not isinstance(item, dict) or set(item) != expected_keys:
            deny("reconciliation_completed")
        path = item.get("path")
        binding = {key: item.get(key) for key in
                   ("intentSha256", "receiptSha256", "journalSha256")}
        artifact_entry = by_path.get(path)
        if (path in seen_paths or artifact_entry is None or binding not in links or
                item.get("ordinal") != artifact_entry[0] or
                artifact_entry[1].get("class") not in RETIRABLE_CLASSES or
                item.get("observedIdentity") != artifact_entry[1].get("observedIdentity")):
            deny("reconciliation_completed_identity")
        if require_absent and (Path(path).exists() or Path(path).is_symlink()):
            deny("reconciliation_removed_identity")
        seen_paths.add(path)
        normalized.append(item)
    if completed and not chain:
        deny("reconciliation_chain_missing")
    normalized_subordinate = []
    subordinate_paths: set[str] = set()
    subordinate_keys = {"ordinal", "path", "parentPath", "retirableOn", "observedIdentity",
                        "intentSha256", "receiptSha256", "journalSha256"}
    completed_by_path = {item["path"]: item for item in normalized}
    artifact_list = list(artifacts)
    for item in subordinate:
        if not isinstance(item, dict) or set(item) != subordinate_keys:
            deny("reconciliation_subordinate")
        path = item.get("path")
        artifact_entry = by_path.get(path)
        artifact = artifact_entry[1] if artifact_entry else None
        parent = _f160_subordinate_parent(artifact, artifact_list) if artifact else None
        parent_completion = completed_by_path.get(item.get("parentPath"))
        binding = {key: item.get(key) for key in
                   ("intentSha256", "receiptSha256", "journalSha256")}
        if (path in subordinate_paths or artifact_entry is None or parent is None or
                item.get("ordinal") != artifact_entry[0] or
                item.get("parentPath") != parent.get("path") or
                item.get("retirableOn") != "WITH_PARENT_RELEASE_ONLY" or
                item.get("observedIdentity") != artifact.get("observedIdentity") or
                parent_completion is None or binding not in links or
                any(parent_completion.get(key) != expected for key, expected in binding.items())):
            deny("reconciliation_subordinate_identity")
        if require_absent and any(Path(candidate).exists() or Path(candidate).is_symlink()
                                  for candidate in (path, item["parentPath"])):
            deny("reconciliation_subordinate_present")
        subordinate_paths.add(path)
        normalized_subordinate.append(item)
    if subordinate and not chain:
        deny("reconciliation_chain_missing")
    return {"chain": links, "completed": normalized,
            "subordinateAbsences": normalized_subordinate}


def authenticate_reconciliation(args: argparse.Namespace, contract: dict[str, Any],
                                policy_sha256: str) -> dict[str, Any]:
    supplied = [args.prior_intent, args.prior_intent_sha256, args.prior_receipt,
                args.prior_receipt_sha256, args.prior_journal, args.prior_journal_sha256]
    if not any(supplied):
        return {"chain": [], "completed": [], "subordinateAbsences": []}
    if not all(supplied):
        deny("reconciliation_binding_incomplete")
    prior_intent_raw, _ = stable_private(args.prior_intent, args.prior_intent_sha256)
    prior_receipt_raw, _ = stable_private(args.prior_receipt, args.prior_receipt_sha256)
    prior_journal_raw, _ = stable_private(args.prior_journal, args.prior_journal_sha256)
    prior_intent = object_json(prior_intent_raw, "prior-intent")
    prior_receipt = object_json(prior_receipt_raw, "prior-receipt")
    if (prior_intent.get("generationId") != contract["generationId"] or
            prior_intent.get("releaseId") != contract["releaseId"] or
            prior_intent.get("targetCommit") != contract["targetCommit"] or
            prior_intent.get("contractSha256") != args.contract_sha256 or
            prior_intent.get("rootPolicySha256") != policy_sha256):
        deny("reconciliation_intent_identity")
    if (prior_receipt.get("intentSha256") != args.prior_intent_sha256 or
            prior_receipt.get("commandLogSha256") != args.prior_journal_sha256 or
            prior_receipt.get("state") not in {"QUARANTINED", "RETENTION_INCOMPLETE",
                                               "DEPLOYED_RETENTION_INCOMPLETE", "SANITIZED",
                                               "DEPLOYED_SANITIZED"}):
        deny("reconciliation_receipt_identity")
    inherited = validate_reconciliation(prior_intent.get("reconciliation"),
                                        prior_intent.get("artifacts", []), require_absent=True)
    inherited_paths = [item["path"] for item in inherited["completed"]]
    prior_commands = {item.get("ordinal"): item for item in prior_intent.get("commands", [])
                      if isinstance(item, dict) and isinstance(item.get("ordinal"), int)}
    artifacts = {item["path"]: item for item in contract["artifacts"]}
    progress: dict[int, list[dict[str, Any]]] = {}
    for event in _read_journal(prior_journal_raw):
        ordinal = event.get("ordinal")
        if not isinstance(ordinal, int) or ordinal not in prior_commands:
            deny("reconciliation_journal_ordinal")
        progress.setdefault(ordinal, []).append(event)
    link = {"intentSha256": args.prior_intent_sha256,
            "receiptSha256": args.prior_receipt_sha256,
            "journalSha256": args.prior_journal_sha256}
    completed = []
    for ordinal, events in sorted(progress.items()):
        command = prior_commands[ordinal]
        if not events or events[0] != {"event": "ATTEMPT", "ordinal": ordinal,
                                      "path": command["path"], "argv": command["argv"]}:
            deny("reconciliation_attempt_identity")
        results = [item for item in events if item.get("event") == "RESULT"]
        verified = [item for item in events if item.get("event") == "VERIFIED"]
        if not results or results[-1].get("exitCode") != 0 or not verified or verified[-1] != {
                "event": "VERIFIED", "ordinal": ordinal, "absent": True}:
            continue
        path = command["path"]
        artifact = artifacts.get(path)
        prior_artifact = next((item for item in prior_intent.get("artifacts", [])
                               if item.get("path") == path), None)
        if (artifact is None or prior_artifact is None or
                artifact.get("observedIdentity") != prior_artifact.get("observedIdentity") or
                Path(path).exists() or Path(path).is_symlink()):
            deny("reconciliation_removed_identity")
        if path in inherited_paths:
            deny("reconciliation_duplicate_completion")
        completed.append({"ordinal": ordinal, "path": path,
                          "observedIdentity": artifact.get("observedIdentity"), **link})
    aggregate = inherited["completed"] + completed
    if ([item["path"] for item in aggregate] != prior_receipt.get("removedPaths") or
            len(aggregate) != prior_receipt.get("completedCommands")):
        deny("reconciliation_receipt_progress")
    if prior_receipt.get("subordinateAbsences", []) != _receipt_subordinate_absences(inherited):
        deny("reconciliation_receipt_subordinate")
    subordinate = list(inherited["subordinateAbsences"])
    subordinate_paths = {item["path"] for item in subordinate}
    completed_by_path = {item["path"]: item for item in aggregate}
    for ordinal, artifact in enumerate(contract["artifacts"], 1):
        if artifact["path"] in subordinate_paths:
            continue
        parent = _f160_subordinate_parent(artifact, contract["artifacts"])
        if parent is None:
            continue
        parent_completion = completed_by_path.get(parent["path"])
        if parent_completion is None:
            continue
        if any(Path(candidate).exists() or Path(candidate).is_symlink()
               for candidate in (artifact["path"], parent["path"])):
            deny("reconciliation_subordinate_present")
        subordinate.append({
            "ordinal": ordinal, "path": artifact["path"], "parentPath": parent["path"],
            "retirableOn": "WITH_PARENT_RELEASE_ONLY",
            "observedIdentity": artifact.get("observedIdentity"),
            "intentSha256": parent_completion["intentSha256"],
            "receiptSha256": parent_completion["receiptSha256"],
            "journalSha256": parent_completion["journalSha256"],
        })
    return {"chain": inherited["chain"] + [link], "completed": aggregate,
            "subordinateAbsences": subordinate}


def canonical_release_verifier() -> Path:
    return Path(__file__).resolve().with_name("converta-release.py")


def validate_legacy_descriptor(raw: bytes, expected_sha256: str) -> dict[str, Any]:
    if digest_bytes(raw) != expected_sha256:
        deny("legacy_descriptor_hash")
    descriptor = object_json(raw, "legacy-descriptor")
    if descriptor != LEGACY_123BA_BINDING:
        deny("legacy_descriptor_binding")
    return descriptor


def validate_a959_legacy_descriptor(raw: bytes, expected_sha256: str) -> dict[str, Any]:
    if digest_bytes(raw) != expected_sha256:
        deny("legacy_a959_descriptor_hash")
    descriptor = object_json(raw, "legacy-a959-descriptor")
    if descriptor != LEGACY_A959_V1_PRESERVE_BINDING:
        deny("legacy_a959_descriptor_binding")
    return descriptor


def validate_batch_legacy_descriptor(raw: bytes, expected_sha256: str) -> dict[str, Any]:
    if digest_bytes(raw) != expected_sha256:
        deny("legacy_batch_descriptor_hash")
    descriptor = object_json(raw, "legacy-batch-descriptor")
    release_id = descriptor.get("releaseId")
    binding = LEGACY_D436_F160_BINDINGS.get(release_id)
    if binding is None or expected_sha256 != binding["descriptorSha256"]:
        deny("legacy_batch_descriptor_binding")
    expected_paths = LEGACY_RETENTION_BATCH["removedPaths"]
    expected_ordinals = {str(ordinal): expected_paths[ordinal - 1]
                         for ordinal in binding["ordinals"]}
    expected_overlay = ({"path": binding["overlayPath"],
                         "classification": "EPHEMERAL_RUNTIME_CACHE",
                         "state": "ACTIVE_DEPENDENCY",
                         "retirableOn": "WITH_PARENT_RELEASE_ONLY"}
                        if binding.get("overlayPath") else None)
    required = {"schemaVersion", "sourceState", "releaseId", "targetCommit",
                "operationalRole", "outputPath", "worktreePath", "installedReleasePath",
                "lifecycle", "review", "package", "manifest", "index", "deployedMarker",
                "priorRetention", "canonicalVerifierSha256", "contractOutput", "receiptOutput"}
    if expected_overlay is not None:
        required.add("runtimeCacheOverlay")
    if (set(descriptor) != required or descriptor.get("schemaVersion") != 1 or
            descriptor.get("sourceState") != "LEGACY_V1_PRESERVE_BATCH_MEMBER_NO_CONTRACT" or
            descriptor.get("targetCommit") != binding["targetCommit"] or
            descriptor.get("operationalRole") != binding["role"] or
            descriptor.get("runtimeCacheOverlay") != expected_overlay):
        deny("legacy_batch_descriptor_binding")
    prior = descriptor.get("priorRetention")
    if (not isinstance(prior, dict) or
            prior != {**LEGACY_RETENTION_BATCH, "generationOrdinals": expected_ordinals}):
        deny("legacy_batch_descriptor_retention_binding")
    release_path = binding.get("installedReleasePath", f"/opt/re7online/releases/{release_id}")
    output_path = binding.get("outputPath", f"/opt/re7online/build-output/{release_id}-producer")
    worktree_path = binding.get("worktreePath", f"/opt/re7online/build-worktrees/{release_id}-source")
    if (descriptor["installedReleasePath"] != release_path or
            descriptor["outputPath"] != output_path or
            descriptor["worktreePath"] != worktree_path or
            descriptor["contractOutput"] != f"{output_path}/generation-artifacts.private.json" or
            descriptor["review"]["path"] != f"{output_path}/generation-review.private.json" or
            descriptor["lifecycle"]["path"] != f"{output_path}/generation-lifecycle.private.json"):
        deny("legacy_batch_descriptor_path_binding")
    return descriptor


def _legacy_worktree_command(member: dict[str, Any]) -> str:
    return ("git -C /opt/re7online/site-re7online worktree remove " +
            str(member["path"]))


def _legacy_manifest_entries(raw: bytes) -> dict[str, str]:
    try:
        lines = raw.decode().splitlines()
    except UnicodeDecodeError:
        deny("legacy_d7_worktree_manifest_encoding")
    entries: dict[str, str] = {}
    for line in lines:
        match = re.fullmatch(r"([0-9a-f]{64})  \./([^/]+)", line)
        if match is None or match.group(2) in entries:
            deny("legacy_d7_worktree_manifest_schema")
        entries[match.group(2)] = match.group(1)
    return entries


def validate_legacy_d7_worktree_closure(value: Any) -> dict[str, Any]:
    binding = LEGACY_D7_WORKTREE_BATCH
    required = {"schemaVersion", "kind", "sourceFormat", "batchId", "releaseId",
                "targetCommit", "batchMembers", "effect", "originals", "journalFormat",
                "retirementAuthorizationGranted", "destructiveCommands"}
    if (not isinstance(value, dict) or set(value) != required or
            value.get("schemaVersion") != 1 or
            value.get("kind") != "LEGACY_D7_WORKTREE_CLOSURE" or
            value.get("sourceFormat") != binding["sourceFormat"] or
            value.get("batchId") != binding["batchId"] or
            value.get("releaseId") != binding["derivedReleaseId"] or
            value.get("targetCommit") != binding["members"][1]["head"] or
            value.get("journalFormat") != "EMBEDDED_RECEIPT_COMMANDS_NO_JSONL" or
            value.get("retirementAuthorizationGranted") is not False or
            value.get("destructiveCommands") != 0):
        deny("legacy_d7_worktree_closure_schema")
    expected_members = [{"index": member["index"], "path": member["path"],
                         "head": member["head"]} for member in binding["members"]]
    if value.get("batchMembers") != expected_members:
        deny("legacy_d7_worktree_closure_members")
    d7 = binding["members"][1]
    expected_effect = {"index": 2, "path": d7["path"], "head": d7["head"],
                       "class": "DERIVED_WORKTREE", "exitCode": 0,
                       "pathAbsent": True, "worktreeRegistrationAbsent": True}
    if value.get("effect") != expected_effect:
        deny("legacy_d7_worktree_closure_effect")
    originals = value.get("originals")
    expected_hashes = {
        "intent": binding["intentSha256"], "commands": binding["commandsSha256"],
        "receipt": binding["receiptSha256"], "lockProof": binding["lockProofSha256"],
        "finalManifest": binding["finalManifestSha256"],
    }
    if (not isinstance(originals, dict) or set(originals) != set(expected_hashes) or
            any(not isinstance(originals.get(name), dict) or
                set(originals[name]) != {"path", "sha256"} or
                not Path(str(originals[name].get("path", ""))).is_absolute() or
                originals[name].get("sha256") != expected
                for name, expected in expected_hashes.items())):
        deny("legacy_d7_worktree_closure_originals")
    return value


def derive_legacy_d7_worktree_closure(args: argparse.Namespace) -> None:
    binding = LEGACY_D7_WORKTREE_BATCH
    paths = {
        "intent": args.batch_intent,
        "commands": args.commands,
        "receipt": args.receipt,
        "lockProof": args.lock_proof,
        "finalManifest": args.final_manifest,
    }
    hashes = {
        "intent": binding["intentSha256"], "commands": binding["commandsSha256"],
        "receipt": binding["receiptSha256"], "lockProof": binding["lockProofSha256"],
        "finalManifest": binding["finalManifestSha256"],
    }
    raw = {name: stable_private(path, hashes[name])[0] for name, path in paths.items()}
    intent = object_json(raw["intent"], "legacy-d7-worktree-intent")
    receipt = object_json(raw["receipt"], "legacy-d7-worktree-receipt")
    lock = object_json(raw["lockProof"], "legacy-d7-worktree-lock")
    members = list(binding["members"])
    expected_commands = [_legacy_worktree_command(member) for member in members]
    try:
        literal_commands = raw["commands"].decode().splitlines()
    except UnicodeDecodeError:
        deny("legacy_d7_worktree_commands_encoding")
    if literal_commands != expected_commands:
        deny("legacy_d7_worktree_commands_identity")
    candidates = intent.get("provenCandidates")
    if (intent.get("schemaVersion") != 3 or intent.get("batchId") != binding["batchId"] or
            intent.get("state") != "READY_FOR_EXPLICIT_AUTHORIZATION" or
            intent.get("totalProvenAllocatedBytes") !=
            sum(member["allocatedBytes"] for member in members) or
            not isinstance(candidates, list) or len(candidates) != len(members)):
        deny("legacy_d7_worktree_intent_identity")
    for candidate, member, command in zip(candidates, members, expected_commands):
        if (not isinstance(candidate, dict) or candidate.get("path") != member["path"] or
                candidate.get("head") != member["head"] or
                candidate.get("allocatedBytes") != member["allocatedBytes"] or
                candidate.get("command") != command or
                candidate.get("classification") !=
                "TRACKED_GIT_OBJECTS_PRESERVED_IGNORED_CONTENT_REGENERABLE_OR_AUTHENTICATED_COPY"):
            deny("legacy_d7_worktree_intent_member")
    receipt_commands = receipt.get("commands")
    if (receipt.get("schemaVersion") != 3 or receipt.get("batchId") != binding["batchId"] or
            receipt.get("state") != "COMPLETED" or
            receipt.get("intentSha256") != binding["intentSha256"] or
            receipt.get("automaticRetry") is not False or
            receipt.get("partialExecution") is not False or
            not isinstance(receipt_commands, list) or len(receipt_commands) != len(members)):
        deny("legacy_d7_worktree_receipt_identity")
    for result, member, command in zip(receipt_commands, members, expected_commands):
        if (not isinstance(result, dict) or result.get("index") != member["index"] or
                result.get("command") != command or type(result.get("exitCode")) is not int or
                result.get("exitCode") != 0 or result.get("pathAbsent") is not True or
                result.get("worktreeRegistrationAbsent") is not True):
            deny("legacy_d7_worktree_receipt_effect")
    after = receipt.get("after")
    if (not isinstance(after, dict) or after.get("bothPathsAbsent") is not True or
            after.get("bothWorktreeRegistrationsAbsent") is not True or
            after.get("sealedCandidateAllocatedBytes") !=
            sum(member["allocatedBytes"] for member in members)):
        deny("legacy_d7_worktree_receipt_completion")
    if (lock.get("schemaVersion") != 1 or lock.get("state") != "FREE" or
            lock.get("lockPath") != binding["lockPath"] or
            lock.get("lockFilePreserved") is not True or
            lock.get("postReleaseNonblockingProbeExit") != 0 or
            lock.get("releaseMethod") != "CLOSE_OWN_FD"):
        deny("legacy_d7_worktree_lock_identity")
    manifest = _legacy_manifest_entries(raw["finalManifest"])
    if (manifest.get(paths["receipt"].name) != binding["receiptSha256"] or
            manifest.get(paths["lockProof"].name) != binding["lockProofSha256"]):
        deny("legacy_d7_worktree_manifest_binding")
    d7 = members[1]
    closure = {
        "schemaVersion": 1, "kind": "LEGACY_D7_WORKTREE_CLOSURE",
        "sourceFormat": binding["sourceFormat"], "batchId": binding["batchId"],
        "releaseId": binding["derivedReleaseId"], "targetCommit": d7["head"],
        "batchMembers": [{"index": member["index"], "path": member["path"],
                          "head": member["head"]} for member in members],
        "effect": {"index": 2, "path": d7["path"], "head": d7["head"],
                   "class": "DERIVED_WORKTREE", "exitCode": 0,
                   "pathAbsent": True, "worktreeRegistrationAbsent": True},
        "originals": {name: {"path": str(paths[name]), "sha256": hashes[name]}
                      for name in paths},
        "journalFormat": "EMBEDDED_RECEIPT_COMMANDS_NO_JSONL",
        "retirementAuthorizationGranted": False, "destructiveCommands": 0,
    }
    validate_legacy_d7_worktree_closure(closure)
    closure_raw = canonical(closure)
    write_exclusive(args.closure_output, closure_raw)
    print(canonical({"result": "LEGACY_D7_WORKTREE_CLOSURE_AUTHENTICATED",
                     "closureSha256": digest_bytes(closure_raw),
                     "historicalEffectsAuthenticated": 1,
                     "destructiveCommands": 0}).decode().strip())


def _expected_json_subset(observed: Any, expected: Any) -> bool:
    if isinstance(expected, dict):
        return (isinstance(observed, dict) and
                all(key in observed and _expected_json_subset(observed[key], value)
                    for key, value in expected.items()))
    return observed == expected


def qualify_legacy_p00_installed_batch(args: argparse.Namespace) -> None:
    """Authenticate the closed pre-contract batch without granting removal.

    This is deliberately a qualification boundary, not a bootstrap shortcut.
    The output may support a later canonical contract/lifecycle materialization,
    but cannot be passed to ``prepare`` as either of those artifacts.
    """
    binding = LEGACY_P00_INSTALLED_BATCH
    if binding.get("schemaVersion") != 1 or not binding.get("batchId"):
        deny("legacy_p00_batch_binding")
    graph_binding = binding.get("sourceGraph")
    if (not isinstance(graph_binding, dict) or set(graph_binding) != {"path", "sha256"} or
            not SHA256.fullmatch(str(graph_binding.get("sha256", "")))):
        deny("legacy_p00_graph_binding")
    graph_raw, _ = stable_regular_hash(Path(graph_binding["path"]), graph_binding["sha256"],
                                       "legacy_p00_graph")
    graph = object_json(graph_raw, "legacy-p00-source-graph")
    graph_lists = ("activeReleases", "rollbackReleases", "transitiveReturnReleases",
                   "candidateReleases", "installedVerifiedReleases")
    if any(not isinstance(graph.get(key), list) for key in graph_lists):
        deny("legacy_p00_graph_schema")
    immediate = graph.get("immediateRollbackReleases", {})
    if not isinstance(immediate, dict):
        deny("legacy_p00_graph_schema")

    evidence_results = []
    for index, evidence in enumerate(binding.get("chainEvidence", ())):
        if (not isinstance(evidence, dict) or set(evidence) != {"path", "sha256", "expected"} or
                not isinstance(evidence["expected"], dict)):
            deny("legacy_p00_chain_binding")
        raw, _ = stable_regular_hash(Path(evidence["path"]), evidence["sha256"],
                                     f"legacy_p00_chain_{index}")
        value = object_json(raw, f"legacy-p00-chain-{index}")
        if not _expected_json_subset(value, evidence["expected"]):
            deny(f"legacy_p00_chain_divergence:{index}")
        evidence_results.append({"path": evidence["path"], "sha256": evidence["sha256"]})

    verifier_sha = binding.get("canonicalVerifierSha256")
    if not SHA256.fullmatch(str(verifier_sha or "")):
        deny("legacy_p00_verifier_binding")
    release_results = []
    seen = set()
    for item in binding.get("releases", ()):
        required = {"releaseId", "targetCommit", "installedReleasePath", "package",
                    "manifestSha256", "indexSha256", "deployedMarkerSha256",
                    "runtimeCacheOverlay"}
        if not isinstance(item, dict) or set(item) != required:
            deny("legacy_p00_release_binding")
        release = item["releaseId"]
        installed = Path(item["installedReleasePath"])
        if release in seen or installed.name != release:
            deny("legacy_p00_release_binding")
        seen.add(release)
        if (release not in graph["installedVerifiedReleases"] or
                any(release in graph[key] for key in graph_lists[:-1]) or
                release in immediate.values()):
            deny(f"legacy_p00_release_referenced:{release}")
        try:
            (installed / "api-runtime/.data").lstat()
        except FileNotFoundError:
            pass
        except OSError:
            deny(f"legacy_p00_private_data_ambiguous:{release}")
        else:
            deny(f"legacy_p00_private_data_present:{release}")
        package = item["package"]
        if (not isinstance(package, dict) or set(package) != {"path", "sha256"} or
                not SHA256.fullmatch(str(package.get("sha256", "")))):
            deny("legacy_p00_package_binding")
        stable_regular_hash(Path(package["path"]), package["sha256"], "legacy_p00_package")
        stable_regular_hash(installed / "manifest.json", item["manifestSha256"],
                            "legacy_p00_manifest")
        stable_regular_hash(installed / "index.sha256", item["indexSha256"],
                            "legacy_p00_index")
        stable_regular_hash(installed / "DEPLOYED", item["deployedMarkerSha256"],
                            "legacy_p00_marker")
        descriptor = {
            "releaseId": release, "targetCommit": item["targetCommit"],
            "installedReleasePath": str(installed), "package": package,
            "manifest": {"path": str(installed / "manifest.json"),
                         "sha256": item["manifestSha256"]},
            "index": {"path": str(installed / "index.sha256"),
                      "sha256": item["indexSha256"]},
            "deployedMarker": {"path": str(installed / "DEPLOYED"),
                               "sha256": item["deployedMarkerSha256"]},
            "canonicalVerifierSha256": verifier_sha,
            "p00RuntimeCacheOverlay": item["runtimeCacheOverlay"],
        }
        package_result = _run_legacy_package_verifier(descriptor)
        installed_result = _run_legacy_installed_verifier(descriptor)
        comparable = ("apiEntrySha256", "buildId", "indexEntries")
        if any(package_result.get(key) != installed_result.get(key) for key in comparable):
            deny(f"legacy_p00_package_installed_mismatch:{release}")
        if bool(installed_result.get("runtimeCacheOverlay")) != item["runtimeCacheOverlay"]:
            deny(f"legacy_p00_cache_classification:{release}")
        metrics = structural_metrics(installed)
        artifact = {"path": str(installed), "releaseId": release,
                    "targetCommit": item["targetCommit"], "class": "RELEASE_RUNTIME"}
        operational = {key: graph[key] for key in graph_lists}
        operational.update({"currentPaths": [], "pm2LivePaths": [], "pm2DumpPaths": [],
                            "dependencies": []})
        if classify(artifact, {"releaseId": release, "artifacts": [artifact]}, operational) != \
                "RETIREMENT_READY":
            deny(f"legacy_p00_classification:{release}")
        release_results.append({"releaseId": release, "targetCommit": item["targetCommit"],
                                "path": str(installed), **metrics,
                                "classification": "RETIREMENT_READY",
                                "packageSha256": package["sha256"],
                                "manifestSha256": item["manifestSha256"],
                                "indexSha256": item["indexSha256"],
                                "deployedMarkerSha256": item["deployedMarkerSha256"],
                                "runtimeCacheOverlay": installed_result.get("runtimeCacheOverlay")})
    if not release_results:
        deny("legacy_p00_empty_batch")
    total_allocated = sum(item["allocatedBytes"] for item in release_results)
    extraction_peak = max(item["allocatedBytes"] for item in release_results)
    proof = {"schemaVersion": 1, "kind": "LEGACY_P00_INSTALLED_BATCH_QUALIFICATION",
             "batchId": binding["batchId"], "sourceGraph": graph_binding,
             "canonicalVerifierSha256": verifier_sha, "chainEvidence": evidence_results,
             "releases": release_results,
             "totalAllocatedBytes": total_allocated,
             "capacityBudget": {
                 "packageExtractionPeakBytes": extraction_peak,
                 "custodyAndClosureReserveBytes": LEGACY_P00_CUSTODY_RESERVE_BYTES,
                 "grossRecoverableBytes": total_allocated,
                 "netRecoverableBytes": total_allocated - LEGACY_P00_CUSTODY_RESERVE_BYTES,
             },
             "authorizationGranted": False, "executionPermitted": False,
             "destructiveCommands": 0,
             "nextRequiredStep": "CANONICAL_CONTRACT_LIFECYCLE_MATERIALIZATION"}
    write_exclusive(args.proof_output, canonical(proof))
    print(canonical({"result": "LEGACY_P00_INSTALLED_BATCH_QUALIFIED",
                     "batchId": binding["batchId"],
                     "releaseCount": len(release_results),
                     "totalAllocatedBytes": proof["totalAllocatedBytes"],
                     "proofSha256": digest_bytes(canonical(proof)),
                     "authorizationGranted": False, "executionPermitted": False}).decode().strip())


def _legacy_tree_root(path: Path, root: Path, policy: dict[str, Any], key: str) -> None:
    _strict_child(path, root, f"legacy_path_outside_root:{key}")
    if _path_has_symlink(path, root):
        deny(f"legacy_path_symlink:{key}")
    try:
        info = path.lstat()
    except OSError:
        deny(f"legacy_path_missing:{key}")
    definition = policy["definitions"][key]
    if (not stat.S_ISDIR(info.st_mode) or info.st_uid != definition["ownerUid"] or
            info.st_gid != definition["groupGid"]):
        deny(f"legacy_path_identity:{key}")


def _legacy_structural_metrics(path: Path, ignored: set[Path]) -> dict[str, Any]:
    root = path.lstat()
    items = [path]
    if stat.S_ISDIR(root.st_mode):
        items.extend(path.rglob("*"))
    normalized_ancestors = {parent for destination in ignored for parent in destination.parents
                            if parent == path or path in parent.parents}
    seen: set[tuple[int, int]] = set()
    size = allocated = inodes = 0
    structure = hashlib.sha256()
    for item in sorted(items, key=lambda candidate: os.fsencode(str(candidate.relative_to(path.parent)))):
        if item in ignored or any(destination in item.parents for destination in ignored):
            continue
        info = item.lstat()
        identity = (info.st_dev, info.st_ino)
        relative = "." if item == path else item.relative_to(path).as_posix()
        kind = ("symlink" if stat.S_ISLNK(info.st_mode) else "directory" if stat.S_ISDIR(info.st_mode)
                else "regular" if stat.S_ISREG(info.st_mode) else "other")
        link = os.readlink(item) if kind == "symlink" else None
        mutable_directory = item in normalized_ancestors and kind == "directory"
        structure.update(canonical({"path": relative, "type": kind,
                                    "mode": stat.S_IMODE(info.st_mode),
                                    "size": None if mutable_directory else info.st_size,
                                    "mtimeNs": None if mutable_directory else info.st_mtime_ns,
                                    "link": link}))
        if identity in seen:
            continue
        seen.add(identity)
        if not mutable_directory:
            size += info.st_size
            allocated += info.st_blocks * 512
        inodes += 1
    return {"sizeBytes": size, "allocatedBytes": allocated, "inodes": inodes,
            "structuralSha256": structure.hexdigest()}


def _tree_observation(path: Path, label: str, ignored: set[Path] | None = None) -> dict[str, Any]:
    ignored = ignored or set()
    try:
        before = path.lstat()
        metrics = _legacy_structural_metrics(path, ignored)
        after = path.lstat()
    except OSError:
        deny(f"legacy_tree_read:{label}")
    identity = ((lambda item: (item.st_dev, item.st_ino, item.st_mode)) if ignored else
                (lambda item: (item.st_dev, item.st_ino, item.st_mode, item.st_size,
                               item.st_mtime_ns, item.st_ctime_ns)))
    if identity(before) != identity(after):
        deny(f"legacy_tree_drift:{label}")
    return {"identity": {"device": after.st_dev, "inode": after.st_ino}, **metrics}


def _legacy_artifact(path: Path, descriptor: dict[str, Any], artifact_class: str,
                     state: str, digest: dict[str, str]) -> dict[str, Any]:
    info = path.lstat()
    metrics = structural_metrics(path)
    return {
        "path": str(path), "releaseId": descriptor["releaseId"],
        "targetCommit": descriptor["targetCommit"],
        "expectedType": "directory" if stat.S_ISDIR(info.st_mode) else "regular_file",
        "initialIdentity": {"device": info.st_dev, "inode": info.st_ino},
        "observedIdentity": {"device": info.st_dev, "inode": info.st_ino},
        **metrics, "digest": digest, "class": artifact_class, "state": state,
        "retirableOn": ("NEVER_AUTOMATIC" if artifact_class in PRESERVE_CLASSES
                         else "LEGACY_PRE_CONTRACT_SUPERSEDED"),
        "dependencies": (["legacy_bootstrap_authenticated"] if artifact_class in PRESERVE_CLASSES
                         else ["package_verified", "superseded_not_installed"]),
    }


def _run_legacy_package_verifier(descriptor: dict[str, Any]) -> dict[str, Any]:
    return _run_legacy_verifier(descriptor, ["--package", descriptor["package"]["path"]],
                                "legacy_package_verification")


def _run_legacy_installed_verifier(descriptor: dict[str, Any]) -> dict[str, Any]:
    overlay_flag = (["--legacy-a959-private-data-overlay"]
                    if descriptor["releaseId"] == LEGACY_A959_V1_PRESERVE_BINDING["releaseId"] else
                    ["--legacy-f160-runtime-cache-overlay"]
                    if descriptor["releaseId"] == "immutable-f1602787-vps-20261026T174702Z" else [])
    if descriptor.get("p00RuntimeCacheOverlay") is True:
        overlay_flag = ["--legacy-p00-runtime-cache-overlay"]
    return _run_legacy_verifier(
        descriptor,
        ["--release-root", descriptor["installedReleasePath"],
         "--deployed-marker-sha256", descriptor["deployedMarker"]["sha256"], *overlay_flag],
        "legacy_installed_release_verification",
    )


def _run_legacy_verifier(descriptor: dict[str, Any], source: list[str], predicate: str) -> dict[str, Any]:
    verifier = canonical_release_verifier()
    try:
        before = verifier.lstat()
        fd = os.open(verifier, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
        opened = os.fstat(fd)
        chunks = []
        while True:
            block = os.read(fd, 1024 * 1024)
            if not block:
                break
            chunks.append(block)
        raw = b"".join(chunks)
        os.lseek(fd, 0, os.SEEK_SET)
    except OSError:
        deny("legacy_verifier_identity")
    if (verifier.is_symlink() or not stat.S_ISREG(before.st_mode) or
            (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) !=
            (opened.st_dev, opened.st_ino, opened.st_size, opened.st_mtime_ns, opened.st_ctime_ns) or
            digest_bytes(raw) != descriptor["canonicalVerifierSha256"]):
        os.close(fd)
        deny("legacy_verifier_identity")
    command = [sys.executable, f"/proc/self/fd/{fd}", "verify", *source,
               "--target", descriptor["targetCommit"],
               "--release-id", descriptor["releaseId"],
               "--components", "api,frontend"]
    try:
        try:
            result = subprocess.run(command, text=True, stdout=subprocess.PIPE,
                                    stderr=subprocess.PIPE, timeout=180, pass_fds=(fd,))
        except (OSError, subprocess.TimeoutExpired):
            deny(predicate)
    finally:
        os.close(fd)
    if result.returncode:
        nominal = next((line for line in result.stderr.splitlines()
                        if line.startswith("RELEASE_DENY:")), None)
        deny(f"{predicate}:{nominal}" if nominal else predicate)
    try:
        verified = json.loads(result.stdout)
    except json.JSONDecodeError:
        deny(predicate)
    if (not isinstance(verified, dict) or verified.get("result") != "RELEASE VERIFIED" or
            verified.get("releaseId") != descriptor["releaseId"] or
            verified.get("targetCommit") != descriptor["targetCommit"] or
            verified.get("manifestSha256") != descriptor["manifest"]["sha256"] or
            verified.get("indexSha256") != descriptor["index"]["sha256"]):
        deny(f"{predicate}_identity")
    return {"stdoutSha256": digest_bytes(result.stdout.encode()),
            "stderrSha256": digest_bytes(result.stderr.encode()),
            "apiEntrySha256": verified.get("apiEntrySha256"),
            "buildId": verified.get("buildId"),
            "indexEntries": verified.get("indexEntries"),
            "privateDataOverlay": verified.get("privateDataOverlay"),
            "runtimeCacheOverlay": verified.get("runtimeCacheOverlay")}


def _legacy_reference_absence(descriptor: dict[str, Any], operational: dict[str, Any]) -> None:
    release = descriptor["releaseId"]
    protected_lists = ("activeReleases", "rollbackReleases", "transitiveReturnReleases",
                       "candidateReleases", "installedVerifiedReleases")
    if any(release in operational[key] for key in protected_lists):
        deny("legacy_release_referenced")
    if operational["supersededCandidates"] != [release]:
        deny("legacy_release_not_uniquely_superseded")
    forbidden = (release, descriptor["outputPath"], descriptor["worktreePath"])
    path_lists = ("currentPaths", "pm2LivePaths", "pm2DumpPaths", "dependencies")
    if any(any(token in value for token in forbidden)
           for key in path_lists for value in operational[key]):
        deny("legacy_runtime_reference")
    if any(any(token in str(item[field]) for token in forbidden)
           for item in operational["observations"]["currentLinks"]
           for field in ("path", "target")):
        deny("legacy_current_reference")


def _legacy_a959_active_reference(descriptor: dict[str, Any], operational: dict[str, Any]) -> None:
    release = descriptor["releaseId"]
    installed = descriptor["installedReleasePath"]
    if (release not in operational["activeReleases"] or
            release not in operational["installedVerifiedReleases"] or
            release in operational["supersededCandidates"]):
        deny("legacy_a959_active_release_graph")
    for key in ("currentPaths", "pm2LivePaths", "pm2DumpPaths"):
        if not any(installed in value for value in operational[key]):
            deny(f"legacy_a959_active_reference:{key}")
    if not any(installed in str(item["target"])
               for item in operational["observations"]["currentLinks"]):
        deny("legacy_a959_current_reference")
    derived = (descriptor["outputPath"], descriptor["worktreePath"])
    for key in ("currentPaths", "pm2LivePaths", "pm2DumpPaths", "dependencies"):
        if any(any(path in value for path in derived) for value in operational[key]):
            deny("legacy_a959_derived_reference")


def _legacy_batch_operational_reference(descriptor: dict[str, Any], operational: dict[str, Any]) -> None:
    release = descriptor["releaseId"]
    installed = descriptor["installedReleasePath"]
    role = descriptor["operationalRole"]
    required_graph = "activeReleases" if role == "ACTIVE_DEPENDENCY" else "rollbackReleases"
    if (release not in operational[required_graph] or
            release not in operational["installedVerifiedReleases"] or
            release in operational["supersededCandidates"]):
        deny("legacy_batch_operational_role")
    if role == "ACTIVE_DEPENDENCY":
        for key in ("currentPaths", "pm2LivePaths", "pm2DumpPaths"):
            if not any(installed in value for value in operational[key]):
                deny(f"legacy_batch_active_reference:{key}")
        if not any(installed in str(item["target"])
                   for item in operational["observations"]["currentLinks"]):
            deny("legacy_batch_active_current_reference")
    forbidden = (descriptor["outputPath"], descriptor["worktreePath"])
    for key in ("currentPaths", "pm2LivePaths", "pm2DumpPaths", "dependencies"):
        if any(any(path in value for path in forbidden) for value in operational[key]):
            deny("legacy_batch_derived_reference")


def _authenticate_a959_prior_retention(args: argparse.Namespace, descriptor: dict[str, Any],
                                        operational: dict[str, Any]) -> dict[str, dict[str, Any]]:
    expected = descriptor["priorRetention"]
    if (args.retention_receipt_sha256 != expected["receiptSha256"] or
            args.retention_journal_sha256 != expected["journalSha256"]):
        deny("legacy_a959_retention_external_hash")
    evidence_input(args.retention_receipt, operational)
    evidence_input(args.retention_journal, operational)
    receipt_raw, _ = stable_private(args.retention_receipt, args.retention_receipt_sha256)
    journal_raw, _ = stable_private(args.retention_journal, args.retention_journal_sha256)
    receipt = object_json(receipt_raw, "legacy-a959-retention-receipt")
    required_receipt = {
        "state": "COMPLETED", "failurePredicate": None, "attemptedCommands": 10,
        "completedCommands": 10, "removedPaths": 10, "automaticRetry": False,
        "pathExpansion": False, "forceUsed": False, "pruneUsed": False,
        "commandLogSha256": expected["journalSha256"],
    }
    if any(receipt.get(key) != value for key, value in required_receipt.items()):
        deny("legacy_a959_retention_receipt_contract")
    samples = receipt.get("freshSamples")
    if (not isinstance(samples, dict) or samples.get("aSha256") != expected["sampleASha256"] or
            samples.get("bSha256") != expected["sampleBSha256"]):
        deny("legacy_a959_retention_samples")
    lock = receipt.get("lock")
    if (not isinstance(lock, dict) or lock.get("acquired") is not True or
            lock.get("heldThroughFinalInspection") is not True or
            lock.get("heldThroughReceiptFsync") is not True or lock.get("unlink") is not False or
            lock.get("foreignLockReleased") is not False):
        deny("legacy_a959_retention_lock")

    events = _read_journal(journal_raw)
    if len(events) != 30:
        deny("legacy_a959_retention_event_count")
    removed_paths = expected["removedPaths"]
    for ordinal in range(1, 11):
        attempt, result, verified = events[(ordinal - 1) * 3:ordinal * 3]
        expected_path = removed_paths[ordinal - 1]
        expected_kind = A959_RETENTION_COMMAND_KINDS[ordinal - 1]
        common = {"ordinal": ordinal, "path": expected_path, "kind": expected_kind}
        if (set(attempt) != A959_RETENTION_EVENT_SCHEMAS["ATTEMPT"] or
                attempt.get("event") != "ATTEMPT" or attempt.get("result") != "PENDING" or
                any(attempt.get(key) != value for key, value in common.items())):
            deny(f"legacy_a959_retention_attempt:{ordinal}")
        expected_registration = "ABSENT" if expected_kind == "git_worktree_remove" else "NOT_APPLICABLE"
        if (set(result) != A959_RETENTION_EVENT_SCHEMAS["RESULT"] or
                result.get("event") != "RESULT" or result.get("result") != "COMMAND_EXITED_ZERO" or
                any(result.get(key) != value for key, value in common.items()) or
                type(result.get("exitCode")) is not int or result["exitCode"] != 0 or
                result.get("worktreeRegistration") != expected_registration or
                not isinstance(result.get("inspectionPath"), str) or not result["inspectionPath"] or
                not isinstance(result.get("inspectionSha256"), str) or
                SHA256.fullmatch(result["inspectionSha256"]) is None):
            deny(f"legacy_a959_retention_result:{ordinal}")
        if (set(verified) != A959_RETENTION_EVENT_SCHEMAS["VERIFIED"] or
                verified.get("event") != "VERIFIED" or verified.get("result") != "PASS" or
                any(verified.get(key) != value for key, value in common.items())):
            deny(f"legacy_a959_retention_verified:{ordinal}")
    proven = {}
    for raw_ordinal, path in expected["a959Ordinals"].items():
        ordinal = int(raw_ordinal)
        if removed_paths[ordinal - 1] != path:
            deny("legacy_a959_retention_descriptor_ordinal")
        candidate = Path(path)
        if candidate.exists() or candidate.is_symlink():
            deny(f"legacy_a959_retention_path_reappeared:{ordinal}")
        proven[path] = {"batchId": expected["batchId"],
                        "receiptSha256": expected["receiptSha256"],
                        "journalSha256": expected["journalSha256"], "ordinal": ordinal}
    return proven


def _authenticate_batch_prior_retention(args: argparse.Namespace, descriptor: dict[str, Any],
                                        operational: dict[str, Any]) -> dict[str, dict[str, Any]]:
    expected = descriptor["priorRetention"]
    if (args.retention_receipt_sha256 != expected["receiptSha256"] or
            args.retention_journal_sha256 != expected["journalSha256"]):
        deny("legacy_batch_retention_external_hash")
    evidence_input(args.retention_receipt, operational)
    evidence_input(args.retention_journal, operational)
    receipt_raw, _ = stable_private(args.retention_receipt, args.retention_receipt_sha256)
    journal_raw, _ = stable_private(args.retention_journal, args.retention_journal_sha256)
    receipt = object_json(receipt_raw, "legacy-batch-retention-receipt")
    required_receipt = {
        "state": "COMPLETED", "failurePredicate": None, "attemptedCommands": 10,
        "completedCommands": 10, "removedPaths": 10, "automaticRetry": False,
        "pathExpansion": False, "forceUsed": False, "pruneUsed": False,
        "commandLogSha256": expected["journalSha256"],
    }
    if any(receipt.get(key) != value for key, value in required_receipt.items()):
        deny("legacy_batch_retention_receipt_contract")
    samples = receipt.get("freshSamples")
    lock = receipt.get("lock")
    if (not isinstance(samples, dict) or samples != {
            "aSha256": expected["sampleASha256"], "bSha256": expected["sampleBSha256"]} or
            not isinstance(lock, dict) or lock.get("acquired") is not True or
            lock.get("heldThroughFinalInspection") is not True or
            lock.get("heldThroughReceiptFsync") is not True or lock.get("unlink") is not False or
            lock.get("foreignLockReleased") is not False):
        deny("legacy_batch_retention_receipt_evidence")
    events = _read_journal(journal_raw)
    if len(events) != 30:
        deny("legacy_batch_retention_event_count")
    removed_paths = expected["removedPaths"]
    for ordinal in range(1, 11):
        attempt, result, verified = events[(ordinal - 1) * 3:ordinal * 3]
        common = {"ordinal": ordinal, "path": removed_paths[ordinal - 1],
                  "kind": A959_RETENTION_COMMAND_KINDS[ordinal - 1]}
        if (set(attempt) != A959_RETENTION_EVENT_SCHEMAS["ATTEMPT"] or
                attempt.get("event") != "ATTEMPT" or attempt.get("result") != "PENDING" or
                any(attempt.get(key) != value for key, value in common.items())):
            deny(f"legacy_batch_retention_attempt:{ordinal}")
        expected_registration = ("ABSENT" if common["kind"] == "git_worktree_remove"
                                 else "NOT_APPLICABLE")
        if (set(result) != A959_RETENTION_EVENT_SCHEMAS["RESULT"] or
                result.get("event") != "RESULT" or result.get("result") != "COMMAND_EXITED_ZERO" or
                any(result.get(key) != value for key, value in common.items()) or
                result.get("exitCode") != 0 or
                result.get("worktreeRegistration") != expected_registration or
                not isinstance(result.get("inspectionPath"), str) or not result["inspectionPath"] or
                not isinstance(result.get("inspectionSha256"), str) or
                SHA256.fullmatch(result["inspectionSha256"]) is None):
            deny(f"legacy_batch_retention_result:{ordinal}")
        if (set(verified) != A959_RETENTION_EVENT_SCHEMAS["VERIFIED"] or
                verified.get("event") != "VERIFIED" or verified.get("result") != "PASS" or
                any(verified.get(key) != value for key, value in common.items())):
            deny(f"legacy_batch_retention_verified:{ordinal}")
    proven = {}
    for raw_ordinal, path in expected["generationOrdinals"].items():
        ordinal = int(raw_ordinal)
        if removed_paths[ordinal - 1] != path:
            deny("legacy_batch_retention_descriptor_ordinal")
        candidate = Path(path)
        if candidate.exists() or candidate.is_symlink():
            deny(f"legacy_batch_retention_path_reappeared:{ordinal}")
        proven[path] = {"batchId": expected["batchId"],
                        "receiptSha256": expected["receiptSha256"],
                        "journalSha256": expected["journalSha256"], "ordinal": ordinal}
    return proven


def _authenticated_retired_artifact(path: Path, descriptor: dict[str, Any], artifact_class: str,
                                    evidence: dict[str, Any], digest: dict[str, str]) -> dict[str, Any]:
    if path.exists() or path.is_symlink():
        deny(f"legacy_a959_retention_path_reappeared:{evidence['ordinal']}")
    return {
        "path": str(path), "releaseId": descriptor["releaseId"],
        "targetCommit": descriptor["targetCommit"], "expectedType": "directory",
        "initialIdentity": None, "observedIdentity": None, "sizeBytes": 0,
        "allocatedBytes": 0, "inodes": 0, "structuralSha256": None, "digest": digest,
        "class": artifact_class, "state": "SANITIZED",
        "retirableOn": "AUTHENTICATED_PRIOR_RETENTION_COMPLETED",
        "dependencies": ["prior_retention_receipt_authenticated",
                         "prior_retention_journal_authenticated"],
        "removedByAuthenticatedRetention": evidence,
    }


def _a959_private_data_artifact(descriptor: dict[str, Any],
                                installed_verification: dict[str, Any]) -> dict[str, Any]:
    binding = descriptor["privateDataOverlay"]
    path = Path(binding["path"])
    installed = Path(descriptor["installedReleasePath"])
    expected_relative = Path("api-runtime/.data")
    if (path != installed / expected_relative or binding != {
            "path": str(installed / expected_relative),
            "classification": "PRIVATE_DATA_NEVER_RETIRE",
            "state": "ACTIVE_DEPENDENCY",
    }):
        deny("legacy_a959_private_data_binding")
    observed = installed_verification.get("privateDataOverlay")
    required = {"path", "classification", "state", "rootIdentity", "ownerUid", "groupGid",
                "mode", "observedEntries"}
    if (not isinstance(observed, dict) or set(observed) != required or
            observed.get("path") != expected_relative.as_posix() or
            observed.get("classification") != "PRIVATE_DATA_NEVER_RETIRE" or
            observed.get("state") != "ACTIVE_DEPENDENCY"):
        deny("legacy_a959_private_data_verification")
    identity = observed.get("rootIdentity")
    if (not isinstance(identity, dict) or set(identity) != {"device", "inode"} or
            any(not isinstance(identity.get(key), int) or identity[key] < 0
                for key in ("device", "inode")) or
            any(not isinstance(observed.get(key), int) or observed[key] < 0
                for key in ("ownerUid", "groupGid", "mode", "observedEntries"))):
        deny("legacy_a959_private_data_verification")
    try:
        info = path.lstat()
        installed_info = installed.lstat()
        resolved = path.resolve(strict=True)
    except OSError:
        deny("legacy_a959_private_data_identity")
    if (path.is_symlink() or not stat.S_ISDIR(info.st_mode) or resolved != path or
            (info.st_dev, info.st_ino) != (identity["device"], identity["inode"]) or
            (info.st_uid, info.st_gid) != (installed_info.st_uid, installed_info.st_gid) or
            stat.S_IMODE(info.st_mode) & 0o022):
        deny("legacy_a959_private_data_identity")
    return {
        "path": str(path), "releaseId": descriptor["releaseId"],
        "targetCommit": descriptor["targetCommit"], "expectedType": "directory",
        "initialIdentity": identity, "observedIdentity": identity,
        "sizeBytes": info.st_size, "allocatedBytes": info.st_blocks * 512, "inodes": 1,
        "structuralSha256": None,
        "digest": {"policy": "PRIVATE_DATA_NEVER_RETIRE", "scope": "ROOT_IDENTITY_ONLY",
                   "ownerUid": info.st_uid, "groupGid": info.st_gid,
                   "mode": stat.S_IMODE(info.st_mode)},
        "class": "PRIVATE_DATA_NEVER_RETIRE", "state": "ACTIVE_DEPENDENCY",
        "retirableOn": "NEVER_AUTOMATIC",
        "dependencies": ["legacy_a959_installed_overlay_verified", "active_release_preserved"],
    }


def _f160_runtime_cache_artifact(descriptor: dict[str, Any],
                                 installed_verification: dict[str, Any]) -> dict[str, Any]:
    binding = descriptor["runtimeCacheOverlay"]
    path = Path(binding["path"])
    installed = Path(descriptor["installedReleasePath"])
    expected_relative = Path("frontend-runtime/.next/cache")
    if (path != installed / expected_relative or binding != {
            "path": str(installed / expected_relative),
            "classification": "EPHEMERAL_RUNTIME_CACHE", "state": "ACTIVE_DEPENDENCY",
            "retirableOn": "WITH_PARENT_RELEASE_ONLY"}):
        deny("legacy_f160_runtime_cache_binding")
    observed = installed_verification.get("runtimeCacheOverlay")
    required = {"path", "classification", "state", "rootIdentity", "ownerUid", "groupGid",
                "mode", "observedEntries"}
    if (not isinstance(observed, dict) or set(observed) != required or
            observed.get("path") != expected_relative.as_posix() or
            observed.get("classification") != "EPHEMERAL_RUNTIME_CACHE" or
            observed.get("state") != "ACTIVE_DEPENDENCY"):
        deny("legacy_f160_runtime_cache_verification")
    identity = observed.get("rootIdentity")
    if (not isinstance(identity, dict) or set(identity) != {"device", "inode"} or
            any(type(identity.get(key)) is not int or identity[key] < 0
                for key in ("device", "inode"))):
        deny("legacy_f160_runtime_cache_verification")
    try:
        info = path.lstat(); installed_info = installed.lstat(); resolved = path.resolve(strict=True)
    except OSError:
        deny("legacy_f160_runtime_cache_identity")
    if (path.is_symlink() or not stat.S_ISDIR(info.st_mode) or resolved != path or
            (info.st_dev, info.st_ino) != (identity["device"], identity["inode"]) or
            (info.st_uid, info.st_gid) != (installed_info.st_uid, installed_info.st_gid) or
            stat.S_IMODE(info.st_mode) & 0o022):
        deny("legacy_f160_runtime_cache_identity")
    return {
        "path": str(path), "releaseId": descriptor["releaseId"],
        "targetCommit": descriptor["targetCommit"], "expectedType": "directory",
        "initialIdentity": identity, "observedIdentity": identity,
        "sizeBytes": info.st_size, "allocatedBytes": info.st_blocks * 512, "inodes": 1,
        "structuralSha256": None,
        "digest": {"policy": "EPHEMERAL_RUNTIME_CACHE", "scope": "ROOT_IDENTITY_ONLY",
                   "ownerUid": info.st_uid, "groupGid": info.st_gid,
                   "mode": stat.S_IMODE(info.st_mode)},
        "class": "EPHEMERAL_RUNTIME_CACHE", "state": "ACTIVE_DEPENDENCY",
        "retirableOn": "WITH_PARENT_RELEASE_ONLY",
        "dependencies": ["legacy_f160_installed_overlay_verified", "active_release_preserved"],
    }


def _legacy_contract_is_fully_sanitized(contract: dict[str, Any],
                                         classified: list[dict[str, Any]]) -> bool:
    if (contract.get("releaseId") == LEGACY_A959_V1_PRESERVE_BINDING["releaseId"] and
            contract.get("targetCommit") == LEGACY_A959_V1_PRESERVE_BINDING["targetCommit"]):
        retention = LEGACY_A959_V1_PRESERVE_BINDING["priorRetention"]
        expected_by_path = {path: int(ordinal)
                            for ordinal, path in retention["a959Ordinals"].items()}
    elif (contract.get("releaseId") in LEGACY_D436_F160_BINDINGS and
          contract.get("targetCommit") ==
          LEGACY_D436_F160_BINDINGS[contract["releaseId"]]["targetCommit"]):
        binding = LEGACY_D436_F160_BINDINGS[contract["releaseId"]]
        retention = LEGACY_RETENTION_BATCH
        expected_by_path = {retention["removedPaths"][ordinal - 1]: ordinal
                            for ordinal in binding["ordinals"]}
    else:
        return False
    derived = [item for item in classified if item["class"] in DERIVED_CLASSES]
    return (set(item["path"] for item in derived) == set(expected_by_path) and
            all(item.get("retentionState") == "SANITIZED" and
                item.get("removedByAuthenticatedRetention") == {
                    "batchId": retention["batchId"],
                    "receiptSha256": retention["receiptSha256"],
                    "journalSha256": retention["journalSha256"],
                    "ordinal": expected_by_path[item["path"]],
                } for item in derived))


def bootstrap_legacy_a959_v1_preserve(args: argparse.Namespace) -> None:
    descriptor_raw, _ = stable_policy(args.descriptor, args.descriptor_sha256)
    policy_raw, _ = stable_policy(args.root_policy, args.root_policy_sha256)
    operational_raw, _ = stable_private(args.operational_state, args.operational_state_sha256)
    descriptor = validate_a959_legacy_descriptor(descriptor_raw, args.descriptor_sha256)
    policy = validate_root_policy(policy_raw, args.root_policy_sha256)
    operational = object_json(operational_raw, "operational-state")
    identity = {"generationId": descriptor["releaseId"], "releaseId": descriptor["releaseId"],
                "targetCommit": descriptor["targetCommit"]}
    validate_operational(operational, identity, policy)
    _legacy_a959_active_reference(descriptor, operational)

    outputs_root = authenticate_policy_root(policy, "outputs")[0]
    worktrees_root = authenticate_policy_root(policy, "worktrees")[0]
    releases_root = authenticate_policy_root(policy, "releases")[0]
    authenticate_policy_root(policy, "evidence")
    output = Path(descriptor["outputPath"])
    worktree = Path(descriptor["worktreePath"])
    installed = Path(descriptor["installedReleasePath"])
    _legacy_tree_root(output, outputs_root, policy, "outputs")
    _legacy_tree_root(installed, releases_root, policy, "releases")
    _strict_child(worktree, worktrees_root, "legacy_a959_worktree_outside_root")
    if (_path_has_symlink(worktree.parent, worktrees_root) or worktree.exists() or
            worktree.is_symlink()):
        deny("legacy_a959_worktree_not_retired")

    lifecycle_path = Path(descriptor["lifecycle"]["path"])
    review_path = Path(descriptor["review"]["path"])
    contract_output = Path(descriptor["contractOutput"])
    receipt_output = Path(descriptor["receiptOutput"])
    if (contract_output != output / "generation-artifacts.private.json" or
            lifecycle_path != output / "generation-lifecycle.private.json" or
            review_path != output / "generation-review.private.json"):
        deny("legacy_a959_destination_binding")
    canonical_review_destination(review_path, contract_output, lifecycle_path, policy)
    evidence_destination(receipt_output, operational)

    writer_lock = outputs_root / ".generation-build.lock"
    writer_fd = acquire_existing_lock(writer_lock)
    try:
        retired = _authenticate_a959_prior_retention(args, descriptor, operational)
        lifecycle_raw, _ = stable_regular_hash(lifecycle_path, descriptor["lifecycle"]["sha256"],
                                               "legacy_a959_lifecycle")
        lifecycle = object_json(lifecycle_raw, "legacy-a959-lifecycle")
        if (lifecycle.get("schemaVersion") != 1 or
                lifecycle.get("generationId") != descriptor["releaseId"] or
                lifecycle.get("targetCommit") != descriptor["targetCommit"] or
                lifecycle.get("state") != "COMPLETE"):
            deny("legacy_a959_lifecycle_identity")
        review_raw, review_info = stable_private(review_path, descriptor["review"]["sha256"])
        review = object_json(review_raw, "legacy-a959-review")
        expected_review = {"schemaVersion", "generationId", "lifecycleSha256", "reviewer",
                           "reason", "evidenceSha256", "decision"}
        if (set(review) != expected_review or review.get("schemaVersion") != 1 or
                review.get("generationId") != descriptor["releaseId"] or
                review.get("lifecycleSha256") != descriptor["lifecycle"]["sha256"] or
                review.get("decision") != "PRESERVE"):
            deny("legacy_a959_review_identity")
        for name in ("package", "manifest", "index", "deployedMarker"):
            stable_regular_hash(Path(descriptor[name]["path"]), descriptor[name]["sha256"],
                                f"legacy_a959_{name}")
        package_verification = _run_legacy_package_verifier(descriptor)
        installed_verification = _run_legacy_installed_verifier(descriptor)
        comparable = ("apiEntrySha256", "buildId", "indexEntries")
        if any(package_verification.get(field) != installed_verification.get(field)
               for field in comparable):
            deny("legacy_a959_package_installed_mismatch")
        private_data_artifact = _a959_private_data_artifact(descriptor, installed_verification)
        private_data_path = Path(descriptor["privateDataOverlay"]["path"])
        fresh = capture_fresh_operational(operational)
        ignored = {contract_output}
        observation_a = {"output": _tree_observation(output, "a959-output", ignored),
                         "installed": _tree_observation(
                             installed, "a959-installed", {private_data_path}),
                         "absentDerived": sorted(retired)}
        release_root = output / descriptor["releaseId"]
        installed_info = installed.lstat()
        installed_artifact = {
            "path": str(installed), "releaseId": descriptor["releaseId"],
            "targetCommit": descriptor["targetCommit"], "expectedType": "directory",
            "initialIdentity": {"device": installed_info.st_dev, "inode": installed_info.st_ino},
            "observedIdentity": {"device": installed_info.st_dev, "inode": installed_info.st_ino},
            **_legacy_structural_metrics(installed, {private_data_path}),
            "digest": {"manifestSha256": descriptor["manifest"]["sha256"],
                       "indexSha256": descriptor["index"]["sha256"],
                       "operationalMarkerSha256": descriptor["deployedMarker"]["sha256"]},
            "class": "RELEASE_RUNTIME", "state": "ACTIVE_DEPENDENCY",
            "retirableOn": "LEGACY_PRE_CONTRACT_SUPERSEDED",
            "dependencies": ["package_verified", "superseded_not_installed"],
        }
        artifacts = [
            _legacy_artifact(Path(descriptor["package"]["path"]), descriptor, "PACKAGE_PRESERVE",
                             "ACTIVE_DEPENDENCY", {"sha256": descriptor["package"]["sha256"]}),
            _legacy_artifact(Path(descriptor["manifest"]["path"]), descriptor, "PACKAGE_PRESERVE",
                             "ACTIVE_DEPENDENCY", {"sha256": descriptor["manifest"]["sha256"]}),
            _legacy_artifact(Path(descriptor["index"]["path"]), descriptor, "PACKAGE_PRESERVE",
                             "ACTIVE_DEPENDENCY", {"sha256": descriptor["index"]["sha256"]}),
            _legacy_artifact(lifecycle_path, descriptor, "EVIDENCE_PRESERVE", "ACTIVE_DEPENDENCY",
                             {"sha256": descriptor["lifecycle"]["sha256"]}),
            installed_artifact,
            private_data_artifact,
            _authenticated_retired_artifact(worktree, descriptor, "DERIVED_WORKTREE",
                                            retired[str(worktree)],
                                            {"gitCommit": descriptor["targetCommit"]}),
            _authenticated_retired_artifact(
                release_root / "api-runtime", descriptor, "DERIVED_OUTPUT_RUNTIME",
                retired[str(release_root / "api-runtime")],
                {"indexSha256": descriptor["index"]["sha256"]}),
            _authenticated_retired_artifact(
                release_root / "frontend-runtime", descriptor, "DERIVED_OUTPUT_RUNTIME",
                retired[str(release_root / "frontend-runtime")],
                {"indexSha256": descriptor["index"]["sha256"]}),
        ]
        for artifact in artifacts:
            if artifact["class"] in PRESERVE_CLASSES:
                artifact["retirableOn"] = "NEVER_AUTOMATIC"
                artifact["dependencies"] = ["legacy_a959_bootstrap_authenticated"]
            elif artifact["class"] == "RELEASE_RUNTIME":
                artifact["retirableOn"] = "NEVER_WHILE_OPERATIONALLY_REFERENCED"
                artifact["dependencies"] = ["installed_release_verified", "active_release_preserved"]
            elif artifact.get("removedByAuthenticatedRetention") is None:
                artifact["retirableOn"] = "LEGACY_V1_PRESERVE_CONTRACT_MATERIALIZED"
                artifact["dependencies"] = ["package_verified", "installed_release_verified",
                                              "active_release_excluded_from_retirement"]
        observation_b = {"output": _tree_observation(output, "a959-output", ignored),
                         "installed": _tree_observation(
                             installed, "a959-installed", {private_data_path}),
                         "absentDerived": sorted(retired)}
        if observation_a != observation_b:
            deny("legacy_a959_tree_drift_between_samples")
        if capture_fresh_operational(operational) != fresh:
            deny("legacy_a959_operational_drift")
        review_after, after_info = stable_private(review_path, descriptor["review"]["sha256"])
        if (review_after != review_raw or
                (review_info.st_dev, review_info.st_ino) != (after_info.st_dev, after_info.st_ino)):
            deny("legacy_a959_review_changed")

        contract = {"schemaVersion": 1, "generationId": descriptor["releaseId"],
                    "releaseId": descriptor["releaseId"], "targetCommit": descriptor["targetCommit"],
                    "state": "COMPLETE", "writerLockPath": str(writer_lock),
                    "classes": sorted(PRESERVE_CLASSES | DERIVED_CLASSES | {"RELEASE_RUNTIME"}),
                    "artifacts": artifacts, "privateDataPolicy": "PRIVATE_DATA_NEVER_RETIRE"}
        validate_contract(contract)
        contract_raw = canonical(contract)
        receipt = {"schemaVersion": 1, "state": "LEGACY_CONTRACT_MATERIALIZED",
                   "sourceState": "LEGACY_V1_PRESERVE_NO_CONTRACT",
                   "scope": "CONTRACT_PATHS_ONLY_NO_GLOBAL_SCAN", "releaseId": descriptor["releaseId"],
                   "targetCommit": descriptor["targetCommit"], "descriptorSha256": args.descriptor_sha256,
                   "rootPolicySha256": args.root_policy_sha256,
                   "operationalStateSha256": args.operational_state_sha256,
                   "contractSha256": digest_bytes(contract_raw),
                   "preservedReviewSha256": descriptor["review"]["sha256"],
                   "priorRetentionReceiptSha256": descriptor["priorRetention"]["receiptSha256"],
                   "priorRetentionJournalSha256": descriptor["priorRetention"]["journalSha256"],
                   "packageVerification": package_verification,
                   "installedVerification": installed_verification,
                   "observations": [observation_a, observation_b], "authorizationGranted": False,
                   "executionPermitted": False, "destructiveCommands": 0, "globalInventory": False}
        receipt_raw = canonical(receipt)
        write_or_verify_exact(contract_output, contract_raw, "legacy_a959_contract")
        # The v1 review is authenticated input. Bootstrap never rewrites it.
        stable_private(review_path, descriptor["review"]["sha256"])
        write_or_verify_exact(receipt_output, receipt_raw, "legacy_a959_receipt")
        print(canonical({"result": "LEGACY_CONTRACT_MATERIALIZED",
                         "contractSha256": receipt["contractSha256"],
                         "reviewSha256": receipt["preservedReviewSha256"],
                         "receiptSha256": digest_bytes(receipt_raw), "authorizationGranted": False,
                         "executionPermitted": False}).decode().strip())
    finally:
        os.close(writer_fd)


def bootstrap_legacy_batch_v1_preserve(args: argparse.Namespace) -> None:
    descriptor_raw, _ = stable_policy(args.descriptor, args.descriptor_sha256)
    policy_raw, _ = stable_policy(args.root_policy, args.root_policy_sha256)
    operational_raw, _ = stable_private(args.operational_state, args.operational_state_sha256)
    descriptor = validate_batch_legacy_descriptor(descriptor_raw, args.descriptor_sha256)
    policy = validate_root_policy(policy_raw, args.root_policy_sha256)
    operational = object_json(operational_raw, "operational-state")
    identity = {"generationId": descriptor["releaseId"], "releaseId": descriptor["releaseId"],
                "targetCommit": descriptor["targetCommit"]}
    validate_operational(operational, identity, policy)
    _legacy_batch_operational_reference(descriptor, operational)

    outputs_root = authenticate_policy_root(policy, "outputs")[0]
    worktrees_root = authenticate_policy_root(policy, "worktrees")[0]
    releases_root = authenticate_policy_root(policy, "releases")[0]
    authenticate_policy_root(policy, "evidence")
    output = Path(descriptor["outputPath"])
    worktree = Path(descriptor["worktreePath"])
    installed = Path(descriptor["installedReleasePath"])
    _legacy_tree_root(output, outputs_root, policy, "outputs")
    _legacy_tree_root(installed, releases_root, policy, "releases")
    _strict_child(worktree, worktrees_root, "legacy_batch_worktree_outside_root")
    if (_path_has_symlink(worktree.parent, worktrees_root) or worktree.exists() or
            worktree.is_symlink()):
        deny("legacy_batch_worktree_not_retired")

    lifecycle_path = Path(descriptor["lifecycle"]["path"])
    review_path = Path(descriptor["review"]["path"])
    contract_output = Path(descriptor["contractOutput"])
    receipt_output = Path(descriptor["receiptOutput"])
    if (contract_output != output / "generation-artifacts.private.json" or
            lifecycle_path != output / "generation-lifecycle.private.json" or
            review_path != output / "generation-review.private.json"):
        deny("legacy_batch_destination_binding")
    canonical_review_destination(review_path, contract_output, lifecycle_path, policy)
    evidence_destination(receipt_output, operational)

    writer_fd = acquire_existing_lock(outputs_root / ".generation-build.lock")
    try:
        retired = _authenticate_batch_prior_retention(args, descriptor, operational)
        lifecycle_raw, _ = stable_regular_hash(lifecycle_path, descriptor["lifecycle"]["sha256"],
                                               "legacy_batch_lifecycle")
        lifecycle = object_json(lifecycle_raw, "legacy-batch-lifecycle")
        if (lifecycle.get("schemaVersion") != 1 or
                lifecycle.get("generationId") != descriptor["releaseId"] or
                lifecycle.get("targetCommit") != descriptor["targetCommit"] or
                lifecycle.get("state") != "COMPLETE"):
            deny("legacy_batch_lifecycle_identity")
        review_raw, review_info = stable_private(review_path, descriptor["review"]["sha256"])
        review = object_json(review_raw, "legacy-batch-review")
        if (set(review) != {"schemaVersion", "generationId", "lifecycleSha256", "reviewer",
                           "reason", "evidenceSha256", "decision"} or
                review.get("schemaVersion") != 1 or
                review.get("generationId") != descriptor["releaseId"] or
                review.get("lifecycleSha256") != descriptor["lifecycle"]["sha256"] or
                review.get("decision") != "PRESERVE"):
            deny("legacy_batch_review_identity")
        for name in ("package", "manifest", "index", "deployedMarker"):
            stable_regular_hash(Path(descriptor[name]["path"]), descriptor[name]["sha256"],
                                f"legacy_batch_{name}")
        package_verification = _run_legacy_package_verifier(descriptor)
        installed_verification = _run_legacy_installed_verifier(descriptor)
        if any(package_verification.get(field) != installed_verification.get(field)
               for field in ("apiEntrySha256", "buildId", "indexEntries")):
            deny("legacy_batch_package_installed_mismatch")
        cache_artifact = (_f160_runtime_cache_artifact(descriptor, installed_verification)
                          if "runtimeCacheOverlay" in descriptor else None)
        ignored_installed = ({Path(descriptor["runtimeCacheOverlay"]["path"])}
                             if cache_artifact else set())
        fresh = capture_fresh_operational(operational)
        ignored_output = {contract_output}
        observation_a = {"output": _tree_observation(output, "legacy-batch-output", ignored_output),
                         "installed": _tree_observation(installed, "legacy-batch-installed",
                                                        ignored_installed),
                         "absentDerived": sorted(retired)}
        installed_info = installed.lstat()
        installed_artifact = {
            "path": str(installed), "releaseId": descriptor["releaseId"],
            "targetCommit": descriptor["targetCommit"], "expectedType": "directory",
            "initialIdentity": {"device": installed_info.st_dev, "inode": installed_info.st_ino},
            "observedIdentity": {"device": installed_info.st_dev, "inode": installed_info.st_ino},
            **_legacy_structural_metrics(installed, ignored_installed),
            "digest": {"manifestSha256": descriptor["manifest"]["sha256"],
                       "indexSha256": descriptor["index"]["sha256"],
                       "operationalMarkerSha256": descriptor["deployedMarker"]["sha256"]},
            "class": "RELEASE_RUNTIME", "state": descriptor["operationalRole"],
            "retirableOn": "NEVER_WHILE_OPERATIONALLY_REFERENCED",
            "dependencies": ["installed_release_verified", "operational_role_preserved"],
        }
        release_root = output / descriptor["releaseId"]
        artifacts = [
            _legacy_artifact(Path(descriptor["package"]["path"]), descriptor, "PACKAGE_PRESERVE",
                             "ACTIVE_DEPENDENCY", {"sha256": descriptor["package"]["sha256"]}),
            _legacy_artifact(Path(descriptor["manifest"]["path"]), descriptor, "PACKAGE_PRESERVE",
                             "ACTIVE_DEPENDENCY", {"sha256": descriptor["manifest"]["sha256"]}),
            _legacy_artifact(Path(descriptor["index"]["path"]), descriptor, "PACKAGE_PRESERVE",
                             "ACTIVE_DEPENDENCY", {"sha256": descriptor["index"]["sha256"]}),
            _legacy_artifact(lifecycle_path, descriptor, "EVIDENCE_PRESERVE", "ACTIVE_DEPENDENCY",
                             {"sha256": descriptor["lifecycle"]["sha256"]}),
            installed_artifact,
            _authenticated_retired_artifact(worktree, descriptor, "DERIVED_WORKTREE",
                                            retired[str(worktree)],
                                            {"gitCommit": descriptor["targetCommit"]}),
            _authenticated_retired_artifact(
                release_root / "api-runtime", descriptor, "DERIVED_OUTPUT_RUNTIME",
                retired[str(release_root / "api-runtime")],
                {"indexSha256": descriptor["index"]["sha256"]}),
            _authenticated_retired_artifact(
                release_root / "frontend-runtime", descriptor, "DERIVED_OUTPUT_RUNTIME",
                retired[str(release_root / "frontend-runtime")],
                {"indexSha256": descriptor["index"]["sha256"]}),
        ]
        if cache_artifact:
            artifacts.insert(5, cache_artifact)
        for artifact in artifacts:
            if artifact["class"] in {"PACKAGE_PRESERVE", "EVIDENCE_PRESERVE"}:
                artifact["retirableOn"] = "NEVER_AUTOMATIC"
                artifact["dependencies"] = ["legacy_batch_bootstrap_authenticated"]
        observation_b = {"output": _tree_observation(output, "legacy-batch-output", ignored_output),
                         "installed": _tree_observation(installed, "legacy-batch-installed",
                                                        ignored_installed),
                         "absentDerived": sorted(retired)}
        if observation_a != observation_b:
            deny("legacy_batch_tree_drift_between_samples")
        if capture_fresh_operational(operational) != fresh:
            deny("legacy_batch_operational_drift")
        review_after, after_info = stable_private(review_path, descriptor["review"]["sha256"])
        if (review_after != review_raw or
                (review_info.st_dev, review_info.st_ino) != (after_info.st_dev, after_info.st_ino)):
            deny("legacy_batch_review_changed")
        contract = {"schemaVersion": 1, "generationId": descriptor["releaseId"],
                    "releaseId": descriptor["releaseId"], "targetCommit": descriptor["targetCommit"],
                    "state": "COMPLETE", "writerLockPath": str(outputs_root / ".generation-build.lock"),
                    "classes": sorted(PRESERVE_CLASSES | DERIVED_CLASSES | {"RELEASE_RUNTIME"} |
                                      ({F160_CACHE_CLASS} if cache_artifact else set())),
                    "artifacts": artifacts, "privateDataPolicy": "PRIVATE_DATA_NEVER_RETIRE"}
        validate_contract(contract)
        contract_raw = canonical(contract)
        receipt = {"schemaVersion": 1, "state": "LEGACY_CONTRACT_MATERIALIZED",
                   "sourceState": descriptor["sourceState"],
                   "scope": "CONTRACT_PATHS_ONLY_NO_GLOBAL_SCAN", "releaseId": descriptor["releaseId"],
                   "targetCommit": descriptor["targetCommit"], "descriptorSha256": args.descriptor_sha256,
                   "rootPolicySha256": args.root_policy_sha256,
                   "operationalStateSha256": args.operational_state_sha256,
                   "contractSha256": digest_bytes(contract_raw),
                   "preservedReviewSha256": descriptor["review"]["sha256"],
                   "priorRetentionReceiptSha256": descriptor["priorRetention"]["receiptSha256"],
                   "priorRetentionJournalSha256": descriptor["priorRetention"]["journalSha256"],
                   "packageVerification": package_verification,
                   "installedVerification": installed_verification,
                   "observations": [observation_a, observation_b], "authorizationGranted": False,
                   "executionPermitted": False, "destructiveCommands": 0, "globalInventory": False}
        receipt_raw = canonical(receipt)
        write_or_verify_exact(contract_output, contract_raw, "legacy_batch_contract")
        stable_private(review_path, descriptor["review"]["sha256"])
        write_or_verify_exact(receipt_output, receipt_raw, "legacy_batch_receipt")
        print(canonical({"result": "LEGACY_CONTRACT_MATERIALIZED",
                         "contractSha256": receipt["contractSha256"],
                         "reviewSha256": receipt["preservedReviewSha256"],
                         "receiptSha256": digest_bytes(receipt_raw), "authorizationGranted": False,
                         "executionPermitted": False}).decode().strip())
    finally:
        os.close(writer_fd)


def bootstrap_legacy(args: argparse.Namespace) -> None:
    if not args.reviewer.strip() or not args.reason.strip():
        deny("legacy_review_identity")
    descriptor_raw, _ = stable_policy(args.descriptor, args.descriptor_sha256)
    policy_raw, _ = stable_policy(args.root_policy, args.root_policy_sha256)
    operational_raw, _ = stable_private(args.operational_state, args.operational_state_sha256)
    descriptor = validate_legacy_descriptor(descriptor_raw, args.descriptor_sha256)
    policy = validate_root_policy(policy_raw, args.root_policy_sha256)
    operational = object_json(operational_raw, "operational-state")
    identity = {"generationId": descriptor["releaseId"], "releaseId": descriptor["releaseId"],
                "targetCommit": descriptor["targetCommit"]}
    validate_operational(operational, identity, policy)
    _legacy_reference_absence(descriptor, operational)

    outputs_root = authenticate_policy_root(policy, "outputs")[0]
    worktrees_root = authenticate_policy_root(policy, "worktrees")[0]
    releases_root = authenticate_policy_root(policy, "releases")[0]
    authenticate_policy_root(policy, "evidence")
    output = Path(descriptor["outputPath"])
    worktree = Path(descriptor["worktreePath"])
    installed = Path(descriptor["installedReleasePath"])
    _legacy_tree_root(output, outputs_root, policy, "outputs")
    _legacy_tree_root(worktree, worktrees_root, policy, "worktrees")
    _strict_child(installed, releases_root, "legacy_installed_release_path")
    if installed.exists() or installed.is_symlink():
        deny("legacy_release_installed")

    contract_output = Path(descriptor["contractOutput"])
    review_output = Path(descriptor["reviewOutput"])
    receipt_output = Path(descriptor["receiptOutput"])
    if contract_output != output / "generation-artifacts.private.json" or \
            review_output != output / "generation-review.private.json":
        deny("legacy_destination_binding")
    canonical_review_destination(review_output, contract_output,
                                 Path(descriptor["lifecycle"]["path"]), policy)
    evidence_destination(receipt_output, operational)

    writer_lock = outputs_root / ".generation-build.lock"
    writer_fd = acquire_existing_lock(writer_lock)
    try:
        if installed.exists() or installed.is_symlink():
            deny("legacy_release_installed")
        lifecycle_raw, _ = stable_regular_hash(Path(descriptor["lifecycle"]["path"]),
                                               descriptor["lifecycle"]["sha256"], "legacy_lifecycle")
        lifecycle = object_json(lifecycle_raw, "legacy-lifecycle")
        if (lifecycle.get("schemaVersion") != 1 or lifecycle.get("generationId") != descriptor["releaseId"] or
                lifecycle.get("targetCommit") != descriptor["targetCommit"] or
                lifecycle.get("state") != "COMPLETE"):
            deny("legacy_lifecycle_identity")
        stable_regular_hash(Path(descriptor["package"]["path"]), descriptor["package"]["sha256"],
                            "legacy_package")
        stable_regular_hash(Path(descriptor["manifest"]["path"]), descriptor["manifest"]["sha256"],
                            "legacy_manifest")
        stable_regular_hash(Path(descriptor["index"]["path"]), descriptor["index"]["sha256"],
                            "legacy_index")
        verification = _run_legacy_package_verifier(descriptor)
        try:
            head = subprocess.run(["/usr/bin/git", "-C", str(worktree), "rev-parse", "HEAD"],
                                  text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                  timeout=30, check=False)
        except (OSError, subprocess.TimeoutExpired):
            deny("legacy_worktree_head")
        if head.returncode or head.stdout.strip() != descriptor["targetCommit"]:
            deny("legacy_worktree_head")
        fresh = capture_fresh_operational(operational)
        ignored_bootstrap_outputs = {contract_output, review_output}
        observation_a = {"output": _tree_observation(output, "output", ignored_bootstrap_outputs),
                         "worktree": _tree_observation(worktree, "worktree")}

        release_root = output / descriptor["releaseId"]
        api = release_root / "api-runtime"
        frontend = release_root / "frontend-runtime"
        artifacts = [
            _legacy_artifact(Path(descriptor["package"]["path"]), descriptor, "PACKAGE_PRESERVE",
                             "ACTIVE_DEPENDENCY", {"sha256": descriptor["package"]["sha256"]}),
            _legacy_artifact(Path(descriptor["manifest"]["path"]), descriptor, "PACKAGE_PRESERVE",
                             "ACTIVE_DEPENDENCY", {"sha256": descriptor["manifest"]["sha256"]}),
            _legacy_artifact(Path(descriptor["index"]["path"]), descriptor, "PACKAGE_PRESERVE",
                             "ACTIVE_DEPENDENCY", {"sha256": descriptor["index"]["sha256"]}),
            _legacy_artifact(Path(descriptor["lifecycle"]["path"]), descriptor, "EVIDENCE_PRESERVE",
                             "ACTIVE_DEPENDENCY", {"sha256": descriptor["lifecycle"]["sha256"]}),
            _legacy_artifact(worktree, descriptor, "DERIVED_WORKTREE", "RETIREMENT_READY",
                             {"gitCommit": descriptor["targetCommit"]}),
            _legacy_artifact(api, descriptor, "DERIVED_OUTPUT_RUNTIME", "RETIREMENT_READY",
                             {"indexSha256": descriptor["index"]["sha256"]}),
            _legacy_artifact(frontend, descriptor, "DERIVED_OUTPUT_RUNTIME", "RETIREMENT_READY",
                             {"indexSha256": descriptor["index"]["sha256"]}),
        ]
        observation_b = {"output": _tree_observation(output, "output", ignored_bootstrap_outputs),
                         "worktree": _tree_observation(worktree, "worktree")}
        if observation_a != observation_b:
            deny("legacy_tree_drift_between_samples")
        if capture_fresh_operational(operational) != fresh:
            deny("legacy_operational_drift")
        if installed.exists() or installed.is_symlink():
            deny("legacy_release_installed")

        contract = {"schemaVersion": 1, "generationId": descriptor["releaseId"],
                    "releaseId": descriptor["releaseId"], "targetCommit": descriptor["targetCommit"],
                    "state": "COMPLETE", "writerLockPath": str(writer_lock),
                    "classes": sorted(PRESERVE_CLASSES | DERIVED_CLASSES | {"RELEASE_RUNTIME"}),
                    "artifacts": artifacts, "privateDataPolicy": "PRIVATE_DATA_NEVER_RETIRE"}
        validate_contract(contract)
        contract_raw = canonical(contract)
        review = {"schemaVersion": 2, "generationId": descriptor["releaseId"],
                  "lifecycleSha256": descriptor["lifecycle"]["sha256"],
                  "state": "RETIREMENT_READY", "reviewer": args.reviewer,
                  "reason": args.reason, "evidenceSha256": digest_bytes(contract_raw)}
        review_raw = canonical(review)
        receipt = {"schemaVersion": 1, "state": "LEGACY_CONTRACT_MATERIALIZED",
                   "sourceState": "LEGACY_PRE_CONTRACT", "scope": "CONTRACT_PATHS_ONLY_NO_GLOBAL_SCAN",
                   "releaseId": descriptor["releaseId"], "targetCommit": descriptor["targetCommit"],
                   "descriptorSha256": args.descriptor_sha256,
                   "rootPolicySha256": args.root_policy_sha256,
                   "operationalStateSha256": args.operational_state_sha256,
                   "contractSha256": digest_bytes(contract_raw), "reviewSha256": digest_bytes(review_raw),
                   "verification": verification, "observations": [observation_a, observation_b],
                   "authorizationGranted": False, "executionPermitted": False,
                   "destructiveCommands": 0, "globalInventory": False}
        receipt_raw = canonical(receipt)
        write_or_verify_exact(contract_output, contract_raw, "legacy_contract")
        write_or_verify_exact(review_output, review_raw, "legacy_review")
        write_or_verify_exact(receipt_output, receipt_raw, "legacy_receipt")
        print(canonical({"result": "LEGACY_CONTRACT_MATERIALIZED",
                         "contractSha256": receipt["contractSha256"],
                         "reviewSha256": receipt["reviewSha256"],
                         "receiptSha256": digest_bytes(receipt_raw),
                         "authorizationGranted": False, "executionPermitted": False}).decode().strip())
    finally:
        os.close(writer_fd)


def prepare(args: argparse.Namespace) -> None:
    contract_raw, _ = stable_private(args.contract, args.contract_sha256)
    lifecycle_raw, _ = stable_private(args.lifecycle, args.lifecycle_sha256)
    operational_raw, _ = stable_private(args.operational_state, args.operational_state_sha256)
    policy_raw, _ = stable_policy(args.root_policy, args.root_policy_sha256)
    contract = object_json(contract_raw, "artifact-contract")
    lifecycle = object_json(lifecycle_raw, "generation-lifecycle")
    operational = object_json(operational_raw, "operational-state")
    policy = validate_root_policy(policy_raw, args.root_policy_sha256)
    validate_contract(contract); validate_operational(operational, contract, policy)
    validate_artifact_roots(contract, operational, policy)
    canonical_review_destination(args.review_output, args.contract, args.lifecycle, policy)
    reconciliation = authenticate_reconciliation(args, contract, args.root_policy_sha256)
    reconciled_paths = _reconciliation_absent_paths(reconciliation)
    legacy_migration = None
    if args.review_output.exists() or args.review_output.is_symlink():
        existing_raw, _ = stable_private(args.review_output)
        existing = object_json(existing_raw, "generation-review")
        if existing.get("schemaVersion") == 1 and existing.get("decision") == "PRESERVE":
            if not args.legacy_review_sha256 or digest_bytes(existing_raw) != args.legacy_review_sha256:
                deny("legacy_migration_binding_required")
            expected = {"schemaVersion", "generationId", "lifecycleSha256", "reviewer",
                        "reason", "evidenceSha256", "decision"}
            if (set(existing) != expected or existing.get("generationId") != contract["generationId"] or
                    existing.get("lifecycleSha256") != args.lifecycle_sha256):
                deny("legacy_migration_identity")
            legacy_migration = {"fromSchemaVersion": 1, "fromDecision": "PRESERVE",
                                "reviewSha256": args.legacy_review_sha256,
                                "scope": "CONTRACT_PATHS_ONLY_NO_GLOBAL_SCAN"}
    elif args.legacy_review_sha256:
        deny("legacy_migration_review_missing")
    for destination in (args.intent_output, args.commands_output):
        outside_artifacts(destination, contract["artifacts"])
        evidence_destination(destination, operational)
    if (lifecycle.get("generationId") != contract["generationId"] or
            lifecycle.get("state") not in {"COMPLETE", "FAILED"}):
        deny("lifecycle_not_terminal")
    writer_fd = acquire_existing_lock(Path(contract["writerLockPath"]))
    try:
        fresh = capture_fresh_operational(operational)
        classified = []
        commands = []
        for artifact in contract["artifacts"]:
            if artifact["path"] not in reconciled_paths:
                authenticate_artifact(artifact)
            state = "SANITIZED" if artifact["path"] in reconciled_paths else classify(artifact, contract, operational)
            if (artifact["class"] == "RELEASE_RUNTIME" and
                    state in {"ACTIVE_DEPENDENCY", "ROLLBACK_DEPENDENCY"} and
                    not Path(artifact["path"]).is_dir()):
                deny("protected_release_missing")
            item = {**artifact, "retentionState": state}
            classified.append(item)
            # Derived artifacts remain conditionally authorized because their
            # eligibility is re-evaluated under both locks at execution time.
            # An installed release is narrower: it enters the authorization only
            # when prepare proves it is already outside every protected graph.
            command_required = (
                artifact["class"] in DERIVED_CLASSES and state != "SANITIZED"
            ) or (
                artifact["class"] == "RELEASE_RUNTIME" and state == "RETIREMENT_READY"
            )
            if command_required and artifact["path"] not in reconciled_paths:
                command, text = command_for(artifact, operational)
                original_ordinal = next(index for index, item in enumerate(contract["artifacts"], 1)
                                        if item["path"] == artifact["path"])
                commands.append({"ordinal": original_ordinal, "path": artifact["path"],
                                 "class": artifact["class"], "argv": command, "literal": text,
                                 "allocatedBytes": artifact["allocatedBytes"],
                                 "eligibilityAtPrepare": state})
        state = ("SANITIZED" if _legacy_contract_is_fully_sanitized(contract, classified)
                 else review_state([item["retentionState"] for item in classified]))
        intent = {
            "schemaVersion": 3, "generationId": contract["generationId"],
            "releaseId": contract["releaseId"], "targetCommit": contract["targetCommit"],
            "state": "SEALED_FOR_EXPLICIT_AUTHORIZATION", "authorizationGranted": False,
            "contractSha256": args.contract_sha256, "lifecycleSha256": args.lifecycle_sha256,
            "operationalStateSha256": args.operational_state_sha256,
            "rootPolicySha256": args.root_policy_sha256,
            "reviewOutput": str(args.review_output),
            "canonicalRoots": operational["canonicalRoots"],
            "controlPlaneArtifacts": operational["controlPlaneArtifacts"],
            "freshObservation": fresh,
            "legacyMigration": legacy_migration,
            "reconciliation": reconciliation,
            "artifacts": classified, "commands": commands,
            "executionContract": {"canonicalLock": str(args.deployment_lock),
                                  "writerLock": contract["writerLockPath"],
                                  "attemptBeforeCommand": True, "stopOnFirstFailure": True,
                                  "automaticRetry": False, "force": False, "prune": False,
                                  "globExpansion": False, "receiptFsync": True},
        }
        intent_raw = canonical(intent)
        commands_raw = ("\n".join(command["literal"] for command in commands) + ("\n" if commands else "")).encode()
        write_exclusive(args.commands_output, commands_raw)
        intent["commandsSha256"] = digest_bytes(commands_raw)
        intent_raw = canonical(intent)
        write_exclusive(args.intent_output, intent_raw)
        review = {"schemaVersion": 2, "generationId": contract["generationId"],
                  "lifecycleSha256": args.lifecycle_sha256, "state": state,
                  "reviewer": args.reviewer, "reason": args.reason,
                  "evidenceSha256": digest_bytes(intent_raw)}
        replace_private(args.review_output, canonical(review))
        print(canonical({"result": "GENERATION_RETIREMENT_PREPARED", "state": state,
                         "intentSha256": digest_bytes(intent_raw),
                         "commandsSha256": digest_bytes(commands_raw),
                         "commandCount": len(commands)}).decode().strip())
    finally:
        os.close(writer_fd)


def append_event(path: Path, value: dict[str, Any]) -> None:
    encoded = canonical(value)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_APPEND | os.O_NOFOLLOW, 0o600)
    try:
        write = os.write(fd, encoded)
        if write != len(encoded):
            deny("journal_short_write")
        os.fsync(fd)
    finally:
        os.close(fd)
    fsync_dir(path.parent)


def review_preparation(args: argparse.Namespace) -> None:
    """Close only the preparation lifecycle record; never remove an artifact."""
    evidence_raw, _ = stable_private(args.evidence, args.evidence_sha256)
    if digest_bytes(evidence_raw) != args.evidence_sha256:
        deny("preparation_review_evidence")
    result = preparation_lifecycle.close_lifecycle(
        args.preparation_lifecycle, args.preparation_lifecycle_sha256,
        args.state, args.evidence_sha256, args.reviewer, args.reason)
    print(canonical({"result": "PREPARATION_LIFECYCLE_REVIEWED",
                     "state": result["state"],
                     "lifecycleSha256": digest_bytes(
                         args.preparation_lifecycle.read_bytes())}).decode().strip())


def validate_intent(intent: dict[str, Any], operational: dict[str, Any], policy_sha256: str) -> list[dict[str, Any]]:
    required = {"schemaVersion", "generationId", "releaseId", "targetCommit", "state",
                "authorizationGranted", "contractSha256", "lifecycleSha256",
                "operationalStateSha256", "artifacts", "commands", "commandsSha256",
                "executionContract", "canonicalRoots", "controlPlaneArtifacts", "freshObservation",
                "rootPolicySha256", "reviewOutput", "reconciliation"}
    required.add("legacyMigration")
    if (set(intent) != required or intent.get("schemaVersion") != 3 or
            intent.get("state") != "SEALED_FOR_EXPLICIT_AUTHORIZATION" or
            intent.get("authorizationGranted") is not False):
        deny("intent_schema")
    if intent.get("rootPolicySha256") != policy_sha256:
        deny("intent_root_policy")
    if intent.get("canonicalRoots") != operational.get("canonicalRoots"):
        deny("intent_canonical_roots")
    if intent.get("controlPlaneArtifacts") != operational.get("controlPlaneArtifacts"):
        deny("intent_control_plane")
    if not Path(str(intent.get("reviewOutput", ""))).is_absolute():
        deny("intent_review_output")
    execution = intent.get("executionContract")
    expected_execution = {"canonicalLock", "writerLock", "attemptBeforeCommand",
                          "stopOnFirstFailure", "automaticRetry", "force", "prune",
                          "globExpansion", "receiptFsync"}
    if (not isinstance(execution, dict) or set(execution) != expected_execution or
            execution.get("attemptBeforeCommand") is not True or
            execution.get("stopOnFirstFailure") is not True or
            execution.get("automaticRetry") is not False or execution.get("force") is not False or
            execution.get("prune") is not False or execution.get("globExpansion") is not False or
            execution.get("receiptFsync") is not True):
        deny("intent_execution_contract")
    artifacts = intent.get("artifacts")
    commands = intent.get("commands")
    if not isinstance(artifacts, list) or not isinstance(commands, list):
        deny("intent_content")
    by_path = {item.get("path"): item for item in artifacts if isinstance(item, dict)}
    if len(by_path) != len(artifacts):
        deny("intent_artifacts")
    validate_reconciliation(intent.get("reconciliation"), artifacts, require_absent=True)
    literals = []
    previous_ordinal = 0
    for item in commands:
        if not isinstance(item, dict) or set(item) != {"ordinal", "path", "class", "argv", "literal", "allocatedBytes", "eligibilityAtPrepare"}:
            deny("intent_command")
        artifact = by_path.get(item["path"])
        if (not isinstance(item["ordinal"], int) or item["ordinal"] <= previous_ordinal or not artifact or
                artifact.get("class") not in RETIRABLE_CLASSES or item["class"] != artifact["class"]):
            deny("intent_command_scope")
        previous_ordinal = item["ordinal"]
        if item.get("eligibilityAtPrepare") != artifact.get("retentionState"):
            deny("intent_command_eligibility")
        if (item["class"] == "RELEASE_RUNTIME" and
                item.get("eligibilityAtPrepare") != "RETIREMENT_READY"):
            deny("intent_release_runtime_not_retirement_ready")
        expected, literal = command_for(artifact, operational)
        if item["argv"] != expected or item["literal"] != literal:
            deny("intent_command_literal")
        literals.append(literal)
    commands_raw = ("\n".join(literals) + ("\n" if literals else "")).encode()
    if digest_bytes(commands_raw) != intent.get("commandsSha256"):
        deny("intent_commands_hash")
    return commands


def execute(args: argparse.Namespace) -> None:
    intent_raw, _ = stable_private(args.intent, args.intent_sha256)
    authorization_raw, _ = stable_private(args.authorization, args.authorization_sha256)
    operational_raw, _ = stable_private(args.operational_state, args.operational_state_sha256)
    policy_raw, _ = stable_policy(args.root_policy, args.root_policy_sha256)
    intent = object_json(intent_raw, "intent")
    authorization = object_json(authorization_raw, "authorization")
    operational = object_json(operational_raw, "operational-state")
    contract_identity = {
        "generationId": intent.get("generationId"),
        "releaseId": intent.get("releaseId"),
        "targetCommit": intent.get("targetCommit"),
    }
    policy = validate_root_policy(policy_raw, args.root_policy_sha256)
    validate_operational(operational, contract_identity, policy)
    required_auth = {"schemaVersion", "authorizationId", "decision", "intentSha256", "approvedPaths", "owner"}
    if (set(authorization) != required_auth or authorization.get("schemaVersion") != 1 or
            authorization.get("decision") != "AUTHORIZE_ONCE" or
            authorization.get("intentSha256") != args.intent_sha256 or
            not isinstance(authorization.get("owner"), str) or not authorization["owner"].strip()):
        deny("authorization_invalid")
    commands = validate_intent(intent, operational, args.root_policy_sha256)
    if not isinstance(commands, list) or authorization.get("approvedPaths") != [item["path"] for item in commands]:
        deny("authorization_scope")
    validate_artifact_roots({"artifacts": intent["artifacts"]}, operational, policy)
    lifecycle_artifacts = [item for item in intent["artifacts"]
                           if Path(item["path"]).name == "generation-lifecycle.private.json"]
    if len(lifecycle_artifacts) != 1:
        deny("intent_lifecycle_artifact")
    lifecycle_path = Path(lifecycle_artifacts[0]["path"])
    contract_path = lifecycle_path.parent / "generation-artifacts.private.json"
    stable_private(contract_path, intent["contractSha256"])
    stable_private(lifecycle_path, intent["lifecycleSha256"])
    canonical_review_destination(args.review_output, contract_path, lifecycle_path, policy)
    if str(args.review_output) != intent["reviewOutput"]:
        deny("intent_review_output")
    canonical_fd = acquire_or_authenticate_lock(
        args.deployment_lock, getattr(args, "deployment_lock_fd", None), args.intent_sha256)
    writer_fd = acquire_existing_lock(Path(intent["executionContract"]["writerLock"]))
    attempted = completed = 0
    removed: list[str] = []
    receipt_state = "DEPLOYED_SANITIZED" if operational["deploymentState"]["state"] == "DEPLOYED" else "SANITIZED"
    try:
        # These observations happen only after both locks and before the first
        # ATTEMPT. A stale prepare snapshot cannot authorize a deletion.
        validate_artifact_roots({"artifacts": intent["artifacts"]}, operational, policy)
        fresh = capture_fresh_operational(operational)
        if operational["deploymentState"]["state"] == "DEPLOYED":
            release = intent["releaseId"]
            if (release not in operational["activeReleases"] or
                    release not in operational["installedVerifiedReleases"] or
                    not any(release in Path(item["target"]).parts
                            for item in operational["observations"]["currentLinks"])):
                deny("fresh_deployed_release_graph")
        reconciliation = validate_reconciliation(
            intent["reconciliation"], intent["artifacts"], require_absent=True)
        reconciled_paths = _reconciliation_absent_paths(reconciliation)
        for artifact in intent["artifacts"]:
            if artifact["path"] not in reconciled_paths:
                authenticate_artifact(artifact)
            elif Path(artifact["path"]).exists() or Path(artifact["path"]).is_symlink():
                deny("reconciled_path_reappeared")
        evidence_destination(args.receipt_root, operational)
        args.receipt_root.mkdir(mode=0o700, parents=False)
        journal = args.receipt_root / "command-results.private.jsonl"
        # The canonical closure binds a journal even when a successor contains
        # zero destructive commands.  Materialize the empty evidence durably;
        # append_event() will extend this same inode for ordinary executions.
        write_exclusive(journal, b"")
        try:
            fresh_before_attempt = capture_fresh_operational(operational)
            if fresh_before_attempt != fresh:
                deny("fresh_operational_changed_before_attempt")
            by_path = {item["path"]: item for item in intent["artifacts"]}
            execution_contract = {**contract_identity, "artifacts": intent["artifacts"]}
            executable = []
            for item in commands:
                state = classify(by_path[item["path"]], execution_contract, operational)
                if item["class"] == "RELEASE_RUNTIME" and state != "RETIREMENT_READY":
                    deny("release_runtime_no_longer_retirable")
                if state == "RETIREMENT_READY":
                    executable.append(item)
            for item in executable:
                attempted += 1
                append_event(journal, {"event": "ATTEMPT", "ordinal": item["ordinal"],
                                       "path": item["path"], "argv": item["argv"]})
                result = subprocess.run(item["argv"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                append_event(journal, {"event": "RESULT", "ordinal": item["ordinal"],
                                       "exitCode": result.returncode,
                                       "stdoutSha256": digest_bytes(result.stdout),
                                       "stderrSha256": digest_bytes(result.stderr)})
                if result.returncode:
                    deny(f"retirement_command:{item['ordinal']}:exit_{result.returncode}")
                if Path(item["path"]).exists() or Path(item["path"]).is_symlink():
                    deny(f"retirement_path_remains:{item['ordinal']}")
                completed += 1; removed.append(item["path"])
                append_event(journal, {"event": "VERIFIED", "ordinal": item["ordinal"], "absent": True})
            removed_set = set(removed) | reconciled_paths
            for artifact in intent["artifacts"]:
                if artifact["path"] not in removed_set:
                    authenticate_artifact(artifact)
            fresh_final = capture_fresh_operational(operational)
            if fresh_final != fresh_before_attempt:
                deny("fresh_operational_changed_during_retirement")
        except BaseException as error:
            receipt_state = "DEPLOYED_RETENTION_INCOMPLETE" if operational["deploymentState"]["state"] == "DEPLOYED" else "QUARANTINED"
            all_removed = [item["path"] for item in reconciliation["completed"]] + removed
            receipt = {"schemaVersion": 1, "state": receipt_state,
                       "failurePredicate": str(error), "attemptedCommands": attempted,
                       "completedCommands": len(all_removed), "removedPaths": all_removed,
                       "intentSha256": args.intent_sha256, "automaticRetry": False,
                       "commandLogSha256": digest_bytes(journal.read_bytes()) if journal.exists() else digest_bytes(b""),
                       "freshObservation": fresh}
            subordinate_absences = _receipt_subordinate_absences(reconciliation)
            if subordinate_absences:
                receipt["subordinateAbsences"] = subordinate_absences
            write_exclusive(args.receipt_root / "execution-receipt.private.json", canonical(receipt))
            review = {"schemaVersion": 2, "generationId": intent["generationId"],
                      "lifecycleSha256": intent["lifecycleSha256"], "state": "QUARANTINED",
                      "reviewer": authorization["owner"], "reason": "partial retirement requires review",
                      "evidenceSha256": digest_bytes(canonical(receipt))}
            replace_private(args.review_output, canonical(review))
            raise
        # Recompute every retirable path in the generation contract. A successful
        # subset is retention-incomplete, never SANITIZED.
        remaining = []
        authorized_paths = {item["path"] for item in commands}
        for artifact in intent["artifacts"]:
            if artifact["path"] in authorized_paths:
                path = Path(artifact["path"])
                if path.exists() or path.is_symlink():
                    remaining.append(artifact["path"])
        receipt_state = ("DEPLOYED_SANITIZED" if operational["deploymentState"]["state"] == "DEPLOYED"
                         else "SANITIZED") if not remaining else (
                         "DEPLOYED_RETENTION_INCOMPLETE" if operational["deploymentState"]["state"] == "DEPLOYED"
                         else "RETENTION_INCOMPLETE")
        journal_sha = digest_bytes(journal.read_bytes()) if journal.exists() else digest_bytes(b"")
        all_removed = [item["path"] for item in reconciliation["completed"]] + removed
        receipt = {"schemaVersion": 1, "state": receipt_state, "failurePredicate": None,
                   "attemptedCommands": attempted, "completedCommands": len(all_removed),
                   "removedPaths": all_removed, "intentSha256": args.intent_sha256,
                   "commandLogSha256": journal_sha, "automaticRetry": False,
                   "remainingDerivedPaths": remaining, "freshObservation": fresh,
                   "lock": {"canonicalHeldThroughReceiptFsync": True,
                            "writerHeldThroughReceiptFsync": True}}
        subordinate_absences = _receipt_subordinate_absences(reconciliation)
        if subordinate_absences:
            receipt["subordinateAbsences"] = subordinate_absences
        receipt_raw = canonical(receipt)
        write_exclusive(args.receipt_root / "execution-receipt.private.json", receipt_raw)
        review_terminal = "SANITIZED" if not remaining else "QUARANTINED"
        review = {"schemaVersion": 2, "generationId": intent["generationId"],
                  "lifecycleSha256": intent["lifecycleSha256"], "state": review_terminal,
                  "reviewer": authorization["owner"], "reason": "derived artifacts retired",
                  "evidenceSha256": digest_bytes(receipt_raw)}
        replace_private(args.review_output, canonical(review))
        fsync_dir(args.receipt_root)
        print(canonical({"result": receipt_state, "receiptSha256": digest_bytes(receipt_raw),
                         "removedPaths": len(removed), "remainingDerivedPaths": len(remaining)}).decode().strip())
    finally:
        os.close(writer_fd); os.close(canonical_fd)


RICH_GRAPH_KEYS = {
    "activeReleases", "rollbackReleases", "transitiveReturnReleases",
    "candidateReleases", "installedVerifiedReleases", "supersededCandidates",
}
RICH_GRAPH_OPTIONAL_KEYS = {"immediateRollbackReleases"}
RECONCILIATION_TERMINAL_RECEIPTS = {"SANITIZED", "DEPLOYED_SANITIZED"}
RECONCILIATION_INCOMPLETE_RECEIPTS = {
    "QUARANTINED", "RETENTION_INCOMPLETE", "DEPLOYED_RETENTION_INCOMPLETE",
}


def _closed_file_binding(value: Any, label: str) -> tuple[Path, str, bytes]:
    if (not isinstance(value, dict) or set(value) != {"path", "sha256"} or
            not isinstance(value.get("path"), str) or
            not Path(value["path"]).is_absolute() or
            not SHA256.fullmatch(str(value.get("sha256", "")))):
        deny(f"release_reconciliation_binding:{label}")
    path = Path(value["path"])
    raw, _ = stable_private(path, value["sha256"])
    return path, value["sha256"], raw


def _rich_graph(value: Any, label: str) -> dict[str, Any]:
    if (not isinstance(value, dict) or
            frozenset(value) not in {frozenset(RICH_GRAPH_KEYS),
                               frozenset(RICH_GRAPH_KEYS | RICH_GRAPH_OPTIONAL_KEYS)} or
            any(not isinstance(value.get(key), list) or
                any(not isinstance(item, str) or not item for item in value[key]) or
                len(value[key]) != len(set(value[key])) for key in RICH_GRAPH_KEYS)):
        deny(f"release_reconciliation_graph:{label}")
    result = {key: sorted(value[key]) for key in RICH_GRAPH_KEYS}
    immediate = value.get("immediateRollbackReleases")
    if immediate is not None:
        if (not isinstance(immediate, dict) or set(immediate) != {"api", "frontend"} or
                any(not isinstance(item, str) or not item or
                    item not in result["rollbackReleases"] for item in immediate.values())):
            deny(f"release_reconciliation_graph:{label}")
        result["immediateRollbackReleases"] = dict(sorted(immediate.items()))
    return result


def _release_is_live(release: str, installed: Path, operational: dict[str, Any]) -> bool:
    tokens = (release, str(installed))
    for key in ("currentPaths", "pm2LivePaths", "pm2DumpPaths", "dependencies"):
        values = operational.get(key)
        if not isinstance(values, list):
            deny("release_reconciliation_operational_schema")
        if any(any(token in value for token in tokens) for value in values
               if isinstance(value, str)):
            return True
    return False


def _fixed_current_activation_evidence(
        evidence: Any, component: str,
        source: dict[str, list[str]]) -> tuple[str, str, dict[str, Any]]:
    if (not isinstance(evidence, dict) or
            set(evidence) != {"runtimeManifest", "transactionJournal"}):
        deny("release_reconciliation_activation_schema")
    manifest_path, manifest_sha, manifest_raw = _closed_file_binding(
        evidence["runtimeManifest"], f"activation:{component}:manifest")
    journal_path, journal_sha, journal_raw = _closed_file_binding(
        evidence["transactionJournal"], f"activation:{component}:journal")
    manifest = object_json(manifest_raw, f"activation:{component}:manifest")
    journal = object_json(journal_raw, f"activation:{component}:journal")
    binding = journal.get("binding")
    components = journal.get("components",
                             binding.get("components") if isinstance(binding, dict) else None)
    candidate = binding.get("release") if isinstance(binding, dict) else None
    rollback = manifest.get("rollbackReleases")
    previous = journal.get("previous", {}).get("releases")
    selections = journal.get("preflight", {}).get("selections")
    if (not isinstance(binding, dict) or
            binding.get("runtimeManifestSha256") != manifest_sha or
            not isinstance(components, list) or component not in components or
            any(item not in {"api", "frontend"} for item in components) or
            len(components) != len(set(components)) or
            not isinstance(candidate, str) or candidate not in source["activeReleases"] or
            not isinstance(rollback, dict) or not isinstance(previous, dict) or
            not isinstance(selections, dict) or set(selections) != {"api", "frontend"}):
        deny("release_reconciliation_activation_identity")
    selected = selections.get(component)
    release = selected.get("releaseId") if isinstance(selected, dict) else None
    if not isinstance(release, str) or release not in source["installedVerifiedReleases"]:
        deny("release_reconciliation_component_coverage")
    definition = rollback.get(component)
    if (not isinstance(definition, dict) or definition.get("releaseId") != release or
            previous.get(component) != release):
        deny("release_reconciliation_immediate_rollback_identity")
    return candidate, release, {
        "kind": "FIXED_CURRENT",
        "runtimeManifest": {"path": str(manifest_path), "sha256": manifest_sha},
        "transactionJournal": {"path": str(journal_path), "sha256": journal_sha},
        "selectedRelease": candidate, "immediateRollback": release}


def _frontend_only_activation_evidence(
        evidence: Any, source: dict[str, list[str]],
        release_root: Path) -> tuple[str, str, dict[str, Any]]:
    expected = {"kind", "executor", "selectionIntent", "activationIntent",
                "awaitingAcceptanceState", "technicalAcceptance",
                "finalizationReceipt", "finalWindowState"}
    if (not isinstance(evidence, dict) or set(evidence) != expected or
            evidence.get("kind") != "FRONTEND_ONLY_V1"):
        deny("release_reconciliation_frontend_activation_schema")
    bindings: dict[str, dict[str, str]] = {}
    values: dict[str, Any] = {}
    for key in expected - {"kind", "executor"}:
        path, sha256, raw = _closed_file_binding(
            evidence[key], f"activation:frontend:{key}")
        bindings[key] = {"path": str(path), "sha256": sha256}
        values[key] = object_json(raw, f"activation:frontend:{key}")
    executor_path, executor_sha, _ = _closed_file_binding(
        evidence["executor"], "activation:frontend:executor")
    bindings["executor"] = {"path": str(executor_path), "sha256": executor_sha}

    selection = values["selectionIntent"]
    activation = values["activationIntent"]
    awaiting = values["awaitingAcceptanceState"]
    acceptance = values["technicalAcceptance"]
    finalization = values["finalizationReceipt"]
    final_window = values["finalWindowState"]
    selected = activation.get("release")
    rollback = activation.get("rollbackRelease")
    target_commit = activation.get("target")
    transaction_root = Path(str(activation.get("transactionRoot", "")))
    selected_runtime = Path(str(selection.get("target", "")))
    rollback_runtime = Path(str(selection.get("expectedCurrent", "")))
    if (not isinstance(selected, str) or selected not in source["activeReleases"] or
            not isinstance(rollback, str) or rollback not in source["rollbackReleases"] or
            selected not in source["installedVerifiedReleases"] or
            rollback not in source["installedVerifiedReleases"] or
            not isinstance(target_commit, str) or not target_commit or
            not transaction_root.is_absolute() or
            selection != {"frontend": "candidate",
                          "expectedCurrent": str(rollback_runtime),
                          "target": str(selected_runtime)} or
            selected_runtime != release_root / selected / "frontend-runtime" or
            rollback_runtime != release_root / rollback / "frontend-runtime"):
        deny("release_reconciliation_frontend_selection_identity")
    transaction_paths = [Path(bindings[key]["path"]) for key in
                         ("selectionIntent", "awaitingAcceptanceState",
                          "technicalAcceptance", "finalizationReceipt", "finalWindowState")]
    activation_path = Path(bindings["activationIntent"]["path"])
    if (any(path.parent != transaction_root for path in transaction_paths) or
            activation_path.parent != executor_path.parent or
            activation_path.name != "activation-intent.private.json" or
            Path(bindings["finalWindowState"]["path"]).name != "window-state.private.json" or
            Path(bindings["selectionIntent"]["path"]).name != "selection-intent.private.json" or
            Path(bindings["technicalAcceptance"]["path"]).name !=
            "technical-acceptance.private.json" or
            Path(bindings["finalizationReceipt"]["path"]).name !=
            "frontend-finalization-receipt.private.json" or
            Path(bindings["awaitingAcceptanceState"]["path"]).name !=
            f"window-state.private.json.previous.{bindings['awaitingAcceptanceState']['sha256']}"):
        deny("release_reconciliation_frontend_transaction_identity")
    if (activation.get("schemaVersion") != 1 or
            activation.get("state") != "SEALED_AWAITING_EXPLICIT_ACTIVATION_AUTHORIZATION" or
            activation.get("activationExecuted") is not False or
            activation.get("authorizationReady") is not True or
            activation.get("automaticRetry") is not False or
            activation.get("deployedMarkerBeforeAcceptance") is not False or
            activation.get("saveCountBeforeAcceptance") != 0 or
            activation.get("retirementReceiptAbsent") is not True or
            activation.get("executorSha256") != executor_sha):
        deny("release_reconciliation_frontend_activation_identity")
    if (awaiting.get("state") != "AWAITING_ACCEPTANCE" or
            awaiting.get("release") != selected or awaiting.get("target") != target_commit or
            awaiting.get("buildId") != activation.get("buildId") or
            awaiting.get("saveCount") != 0 or awaiting.get("acceptance") is not False or
            awaiting.get("deployedMarker") is not False):
        deny("release_reconciliation_frontend_awaiting_identity")
    if (acceptance != {"accepted": True,
                       "acceptedAt": acceptance.get("acceptedAt"),
                       "decision": "TECHNICAL_ACCEPTANCE_PASS",
                       "ownerDecision": "TECHNICAL_ACCEPTANCE_GRANTED",
                       "release": selected, "schemaVersion": 1,
                       "scope": "frontend-only technical acceptance",
                       "source": "owner_confirmation_in_active_window",
                       "target": target_commit} or
            not isinstance(acceptance.get("acceptedAt"), str) or
            not acceptance["acceptedAt"]):
        deny("release_reconciliation_frontend_acceptance_identity")
    final_common = {"state": "DEPLOYED_SANITIZED", "saveCount": 1,
                    "dumpSha256": finalization.get("dumpSha256"),
                    "retirementReceiptSha256": finalization.get("retirementReceiptSha256"),
                    "restartCountDuringFinalize": 0}
    if (finalization != final_common or
            not SHA256.fullmatch(str(finalization.get("dumpSha256", ""))) or
            not SHA256.fullmatch(str(finalization.get("retirementReceiptSha256", ""))) or
            final_window != {**final_common, "acceptance": True, "deployedMarker": True}):
        deny("release_reconciliation_frontend_finalization_identity")
    return selected, rollback, {"kind": "FRONTEND_ONLY_V1", **bindings,
                                "selectedRelease": selected,
                                "immediateRollback": rollback}


def _activation_selection(value: Any, source: dict[str, list[str]],
                          release_root: Path) -> tuple[dict[str, str], dict[str, Any]]:
    if not isinstance(value, dict) or set(value) != {"api", "frontend"}:
        deny("release_reconciliation_activation_schema")
    immediate: dict[str, str] = {}
    normalized: dict[str, Any] = {}
    for component in ("api", "frontend"):
        evidence = value.get(component)
        if (component == "frontend" and isinstance(evidence, dict) and
                evidence.get("kind") == "FRONTEND_ONLY_V1"):
            candidate, release, normalized_evidence = _frontend_only_activation_evidence(
                evidence, source, release_root)
        else:
            candidate, release, normalized_evidence = _fixed_current_activation_evidence(
                evidence, component, source)
        if candidate not in source["activeReleases"]:
            deny("release_reconciliation_active_selection")
        immediate[component] = release
        normalized[component] = normalized_evidence
    return immediate, normalized


def _canonical_retirement_closure(value: Any, release: str, target: str,
                                  contract_sha: str, lifecycle_sha: str,
                                  review: dict[str, Any]) -> dict[str, Any]:
    if (not isinstance(value, dict) or set(value) != {"kind", "chain"} or
            value.get("kind") != "CANONICAL_RETIREMENT" or
            not isinstance(value.get("chain"), list) or not value["chain"]):
        deny("release_reconciliation_canonical_schema")
    normalized = []
    previous_link = None
    final_receipt = None
    for item in value["chain"]:
        if not isinstance(item, dict) or set(item) != {"intent", "receipt", "journal"}:
            deny("release_reconciliation_canonical_schema")
        intent_path, intent_sha, intent_raw = _closed_file_binding(
            item["intent"], f"{release}:intent")
        receipt_path, receipt_sha, receipt_raw = _closed_file_binding(
            item["receipt"], f"{release}:receipt")
        journal_path, journal_sha, journal_raw = _closed_file_binding(
            item["journal"], f"{release}:journal")
        intent = object_json(intent_raw, f"{release}:intent")
        receipt = object_json(receipt_raw, f"{release}:receipt")
        if (intent.get("generationId") != release or intent.get("releaseId") != release or
                intent.get("targetCommit") != target or
                intent.get("contractSha256") != contract_sha or
                intent.get("lifecycleSha256") != lifecycle_sha):
            deny("release_reconciliation_intent_identity")
        inherited = validate_reconciliation(intent.get("reconciliation"),
                                            intent.get("artifacts"), require_absent=True)
        if previous_link is not None and previous_link not in inherited["chain"]:
            deny("release_reconciliation_chain")
        if (receipt.get("intentSha256") != intent_sha or
                receipt.get("commandLogSha256") != journal_sha or
                receipt.get("state") not in
                RECONCILIATION_TERMINAL_RECEIPTS | RECONCILIATION_INCOMPLETE_RECEIPTS):
            deny("release_reconciliation_receipt_identity")
        commands = {entry.get("ordinal"): entry for entry in intent.get("commands", [])
                    if isinstance(entry, dict) and isinstance(entry.get("ordinal"), int)}
        progress: dict[int, list[dict[str, Any]]] = {}
        for event in _read_journal(journal_raw):
            ordinal = event.get("ordinal")
            if ordinal not in commands:
                deny("release_reconciliation_journal_ordinal")
            progress.setdefault(ordinal, []).append(event)
        completed_paths = [entry["path"] for entry in inherited["completed"]]
        attempts = 0
        for ordinal, events in sorted(progress.items()):
            command = commands[ordinal]
            if not events or events[0] != {"event": "ATTEMPT", "ordinal": ordinal,
                                          "path": command["path"], "argv": command["argv"]}:
                deny("release_reconciliation_attempt_identity")
            attempts += 1
            results = [event for event in events if event.get("event") == "RESULT"]
            verified = [event for event in events if event.get("event") == "VERIFIED"]
            if results and results[-1].get("exitCode") == 0 and verified and verified[-1] == {
                    "event": "VERIFIED", "ordinal": ordinal, "absent": True}:
                completed_paths.append(command["path"])
        if (receipt.get("attemptedCommands") != attempts or
                receipt.get("completedCommands") != len(completed_paths) or
                receipt.get("removedPaths") != completed_paths or
                receipt.get("subordinateAbsences", []) !=
                _receipt_subordinate_absences(inherited)):
            deny("release_reconciliation_receipt_progress")
        previous_link = {"intentSha256": intent_sha, "receiptSha256": receipt_sha,
                         "journalSha256": journal_sha}
        final_receipt = receipt
        normalized.append({"intent": {"path": str(intent_path), "sha256": intent_sha},
                           "receipt": {"path": str(receipt_path), "sha256": receipt_sha},
                           "journal": {"path": str(journal_path), "sha256": journal_sha}})
    if (final_receipt is None or
            final_receipt.get("state") not in RECONCILIATION_TERMINAL_RECEIPTS or
            review.get("evidenceSha256") != normalized[-1]["receipt"]["sha256"]):
        deny("release_reconciliation_closure_incomplete")
    return {"kind": "CANONICAL_RETIREMENT", "chain": normalized}


def _legacy_batch_closure(value: Any, release: str, target: str,
                          contract_path: Path, contract_sha: str,
                          lifecycle_sha: str, review: dict[str, Any],
                          operational: dict[str, Any]) -> dict[str, Any]:
    expected = {"kind", "descriptor", "bootstrapReceipt", "priorRetentionReceipt",
                "priorRetentionJournal", "intent"}
    if (not isinstance(value, dict) or set(value) != expected or
            value.get("kind") != "LEGACY_BATCH"):
        deny("release_reconciliation_legacy_schema")
    descriptor_path, descriptor_sha, descriptor_raw = _closed_file_binding(
        value["descriptor"], f"{release}:legacy-descriptor")
    descriptor = validate_batch_legacy_descriptor(descriptor_raw, descriptor_sha)
    if (descriptor.get("releaseId") != release or descriptor.get("targetCommit") != target or
            descriptor.get("contractOutput") != str(contract_path) or
            descriptor.get("lifecycle", {}).get("sha256") != lifecycle_sha):
        deny("release_reconciliation_legacy_identity")
    bootstrap_path, bootstrap_sha, bootstrap_raw = _closed_file_binding(
        value["bootstrapReceipt"], f"{release}:legacy-bootstrap-receipt")
    bootstrap = object_json(bootstrap_raw, f"{release}:legacy-bootstrap-receipt")
    prior_receipt_path, prior_receipt_sha, _ = _closed_file_binding(
        value["priorRetentionReceipt"], f"{release}:legacy-prior-receipt")
    prior_journal_path, prior_journal_sha, _ = _closed_file_binding(
        value["priorRetentionJournal"], f"{release}:legacy-prior-journal")
    prior = descriptor["priorRetention"]
    if (bootstrap.get("state") != "LEGACY_CONTRACT_MATERIALIZED" or
            bootstrap.get("releaseId") != release or bootstrap.get("targetCommit") != target or
            bootstrap.get("contractSha256") != contract_sha or
            bootstrap.get("preservedReviewSha256") != descriptor["review"]["sha256"] or
            bootstrap.get("priorRetentionReceiptSha256") != prior_receipt_sha or
            bootstrap.get("priorRetentionJournalSha256") != prior_journal_sha or
            prior_receipt_sha != prior["receiptSha256"] or
            prior_journal_sha != prior["journalSha256"]):
        deny("release_reconciliation_legacy_bootstrap_identity")
    legacy_args = argparse.Namespace(
        retention_receipt=prior_receipt_path, retention_receipt_sha256=prior_receipt_sha,
        retention_journal=prior_journal_path, retention_journal_sha256=prior_journal_sha)
    _authenticate_batch_prior_retention(legacy_args, descriptor, operational)
    intent_path, intent_sha, intent_raw = _closed_file_binding(value["intent"], f"{release}:intent")
    intent = object_json(intent_raw, f"{release}:intent")
    migration = intent.get("legacyMigration")
    if (intent.get("generationId") != release or intent.get("releaseId") != release or
            intent.get("targetCommit") != target or intent.get("contractSha256") != contract_sha or
            intent.get("lifecycleSha256") != lifecycle_sha or
            not isinstance(migration, dict) or
            migration.get("reviewSha256") != descriptor["review"]["sha256"] or
            review.get("evidenceSha256") != intent_sha):
        deny("release_reconciliation_legacy_intent_identity")
    return {"kind": "LEGACY_BATCH",
            "descriptor": {"path": str(descriptor_path), "sha256": descriptor_sha},
            "bootstrapReceipt": {"path": str(bootstrap_path), "sha256": bootstrap_sha},
            "priorRetentionReceipt": {"path": str(prior_receipt_path),
                                       "sha256": prior_receipt_sha},
            "priorRetentionJournal": {"path": str(prior_journal_path),
                                       "sha256": prior_journal_sha},
            "intent": {"path": str(intent_path), "sha256": intent_sha}}


def reconcile_release_graph(args: argparse.Namespace) -> None:
    outputs = (args.graph_output, args.projection_output, args.receipt_output)
    if (len(set(outputs)) != len(outputs) or
            any(not path.is_absolute() or path.exists() or path.is_symlink()
                for path in outputs)):
        deny("release_reconciliation_output_identity")
    request_raw, _ = stable_private(args.request, args.request_sha256)
    request = object_json(request_raw, "release-reconciliation-request")
    required = {"schemaVersion", "reconciliationId", "releaseRoot", "sourceGraph",
                "operationalState", "activationEvidence", "entries"}
    if (set(request) != required or request.get("schemaVersion") != 2 or
            not isinstance(request.get("reconciliationId"), str) or
            not request["reconciliationId"].strip() or
            not isinstance(request.get("entries"), list) or not request["entries"]):
        deny("release_reconciliation_request_schema")
    release_root = Path(str(request.get("releaseRoot", "")))
    if not release_root.is_absolute() or release_root != Path(os.path.normpath(str(release_root))):
        deny("release_reconciliation_release_root")
    source_path, source_sha, source_raw = _closed_file_binding(
        request["sourceGraph"], "source-graph")
    source = _rich_graph(object_json(source_raw, "release-reconciliation-source"), "source")
    operational_path, operational_sha, operational_raw = _closed_file_binding(
        request["operationalState"], "operational-state")
    operational = object_json(operational_raw, "release-reconciliation-operational")
    observations = operational.get("observations")
    if (not isinstance(observations, dict) or
            observations.get("releaseGraph") != {"path": str(source_path), "sha256": source_sha}):
        deny("release_reconciliation_source_graph_binding")
    immediate_rollbacks, activation_evidence = _activation_selection(
        request["activationEvidence"], source, release_root)
    if any(release not in source["rollbackReleases"] for release in immediate_rollbacks.values()):
        deny("release_reconciliation_immediate_rollback_role")
    successor = {
        key: (dict(value) if key == "immediateRollbackReleases" else list(value))
        for key, value in source.items()
    }
    results = []
    private_parents: set[str] = set()
    seen: set[str] = set()
    for entry in request["entries"]:
        expected = {"releaseId", "installedReleasePath", "expectedRole", "decision",
                    "contract", "lifecycle", "review", "closure"}
        if not isinstance(entry, dict) or set(entry) != expected:
            deny("release_reconciliation_entry_schema")
        release = entry.get("releaseId")
        role = entry.get("expectedRole")
        decision = entry.get("decision")
        installed = Path(str(entry.get("installedReleasePath", "")))
        if (not isinstance(release, str) or not release or release in seen or
                role not in {"rollbackReleases", "transitiveReturnReleases"} or
                decision not in {"CLOSE_OPERATIONAL_DEPENDENCY", "PRESERVE_PRIVATE_DATA"} or
                installed != release_root / release or release not in source[role] or
                release not in source["installedVerifiedReleases"]):
            deny("release_reconciliation_entry_identity")
        seen.add(release)
        contract_path, contract_sha, contract_raw = _closed_file_binding(
            entry["contract"], f"{release}:contract")
        contract = object_json(contract_raw, f"{release}:contract")
        validate_contract(contract)
        if contract.get("releaseId") != release:
            deny("release_reconciliation_contract_identity")
        _, lifecycle_sha, lifecycle_raw = _closed_file_binding(entry["lifecycle"], f"{release}:lifecycle")
        lifecycle = object_json(lifecycle_raw, f"{release}:lifecycle")
        if (lifecycle.get("generationId") != release or
                lifecycle.get("state") not in {"COMPLETE", "FAILED"}):
            deny("release_reconciliation_lifecycle_identity")
        _, review_sha, review_raw = _closed_file_binding(entry["review"], f"{release}:review")
        review = object_json(review_raw, f"{release}:review")
        if (review.get("schemaVersion") != 2 or review.get("generationId") != release or
                review.get("state") != "SANITIZED" or
                review.get("lifecycleSha256") != lifecycle_sha):
            deny("release_reconciliation_review_identity")
        closure = entry.get("closure")
        if not isinstance(closure, dict):
            deny("release_reconciliation_closure_schema")
        if closure.get("kind") == "CANONICAL_RETIREMENT":
            normalized_closure = _canonical_retirement_closure(
                closure, release, contract["targetCommit"], contract_sha,
                lifecycle_sha, review)
        elif closure.get("kind") == "LEGACY_BATCH":
            normalized_closure = _legacy_batch_closure(
                closure, release, contract["targetCommit"], contract_path,
                contract_sha, lifecycle_sha, review, operational)
        else:
            deny("release_reconciliation_closure_schema")
        release_artifacts = [item for item in contract["artifacts"]
                             if item.get("class") == "RELEASE_RUNTIME" and
                             item.get("path") == str(installed)]
        if len(release_artifacts) != 1:
            deny("release_reconciliation_release_artifact")
        private = release_runtime_private_dependency(release_artifacts[0], contract)
        live = _release_is_live(release, installed, operational)
        if (decision == "CLOSE_OPERATIONAL_DEPENDENCY" and
                release in immediate_rollbacks.values()):
            deny("release_reconciliation_immediate_rollback_close")
        if decision == "CLOSE_OPERATIONAL_DEPENDENCY" and (private or live):
            deny("release_reconciliation_dependency_still_open")
        if decision == "PRESERVE_PRIVATE_DATA":
            if not private:
                deny("release_reconciliation_private_data_missing")
            private_parents.add(str(installed))
            successor[role] = [item for item in successor[role] if item != release]
            result = "PRESERVED_PRIVATE_DATA"
        else:
            successor[role] = [item for item in successor[role] if item != release]
            result = "HISTORICAL_EVIDENCE_ONLY"
        results.append({"releaseId": release, "priorRole": role, "result": result,
                        "contract": {"path": str(contract_path), "sha256": contract_sha},
                        "lifecycleSha256": lifecycle_sha,
                        "reviewSha256": review_sha,
                        "closure": normalized_closure})
    successor = _rich_graph(successor, "successor")
    graph_raw = canonical(successor)
    write_exclusive(args.graph_output, graph_raw)
    graph_sha = digest_bytes(graph_raw)
    protected_releases = sorted(set(successor["activeReleases"] + successor["rollbackReleases"] +
                                    successor["transitiveReturnReleases"] +
                                    successor["candidateReleases"]))
    referenced_inventory = {
        str(release_root / release)
        for release in successor["installedVerifiedReleases"]
        if _release_is_live(release, release_root / release, operational)
    }
    protected_paths = sorted({str(release_root / item) for item in protected_releases} |
                             private_parents | referenced_inventory |
                             {str(release_root / item) for item in immediate_rollbacks.values()})
    inventory_paths = sorted(str(release_root / item)
                             for item in successor["installedVerifiedReleases"])
    receipt = {"schemaVersion": 2, "state": "RECONCILED_NO_EFFECT",
               "reconciliationId": request["reconciliationId"],
               "requestSha256": args.request_sha256,
               "releaseRoot": str(release_root),
               "sourceGraph": {"path": str(source_path), "sha256": source_sha},
               "operationalState": {"path": str(operational_path), "sha256": operational_sha},
               "successorGraph": {"path": str(args.graph_output), "sha256": graph_sha},
               "privateDataParents": sorted(private_parents),
               "activationEvidence": activation_evidence,
               "results": results,
               "originalsModified": False, "destructiveCommands": 0,
               "freshRecaptureRequiredBeforeRetirement": True}
    receipt_raw = canonical(receipt)
    write_exclusive(args.receipt_output, receipt_raw)
    projection = {"schemaVersion": 2,
                  "sourceGraph": {"path": str(source_path), "sha256": source_sha},
                  "successorGraph": {"path": str(args.graph_output), "sha256": graph_sha},
                  "reconciliationReceipt": {"path": str(args.receipt_output),
                                             "sha256": digest_bytes(receipt_raw)},
                  "protectedGraphPaths": protected_paths,
                  "inventoryPaths": inventory_paths}
    projection_raw = canonical(projection)
    write_exclusive(args.projection_output, projection_raw)
    print(canonical({"result": "RELEASE_GRAPH_RECONCILED_NO_EFFECT",
                     "graphSha256": graph_sha,
                     "projectionSha256": digest_bytes(projection_raw),
                     "receiptSha256": digest_bytes(receipt_raw)}).decode().strip())


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    commands = root.add_subparsers(dest="command", required=True)
    bootstrap_parser = commands.add_parser("bootstrap-legacy")
    bootstrap_parser.add_argument("--descriptor", type=Path, required=True)
    bootstrap_parser.add_argument("--descriptor-sha256", required=True)
    bootstrap_parser.add_argument("--root-policy", type=Path, required=True)
    bootstrap_parser.add_argument("--root-policy-sha256", required=True)
    bootstrap_parser.add_argument("--operational-state", type=Path, required=True)
    bootstrap_parser.add_argument("--operational-state-sha256", required=True)
    bootstrap_parser.add_argument("--reviewer", required=True)
    bootstrap_parser.add_argument("--reason", required=True)
    bootstrap_parser.set_defaults(handler=bootstrap_legacy)
    a959_parser = commands.add_parser("bootstrap-legacy-a959-v1-preserve")
    a959_parser.add_argument("--descriptor", type=Path, required=True)
    a959_parser.add_argument("--descriptor-sha256", required=True)
    a959_parser.add_argument("--root-policy", type=Path, required=True)
    a959_parser.add_argument("--root-policy-sha256", required=True)
    a959_parser.add_argument("--operational-state", type=Path, required=True)
    a959_parser.add_argument("--operational-state-sha256", required=True)
    a959_parser.add_argument("--retention-receipt", type=Path, required=True)
    a959_parser.add_argument("--retention-receipt-sha256", required=True)
    a959_parser.add_argument("--retention-journal", type=Path, required=True)
    a959_parser.add_argument("--retention-journal-sha256", required=True)
    a959_parser.set_defaults(handler=bootstrap_legacy_a959_v1_preserve)
    batch_parser = commands.add_parser("bootstrap-legacy-batch-v1-preserve")
    batch_parser.add_argument("--descriptor", type=Path, required=True)
    batch_parser.add_argument("--descriptor-sha256", required=True)
    batch_parser.add_argument("--root-policy", type=Path, required=True)
    batch_parser.add_argument("--root-policy-sha256", required=True)
    batch_parser.add_argument("--operational-state", type=Path, required=True)
    batch_parser.add_argument("--operational-state-sha256", required=True)
    batch_parser.add_argument("--retention-receipt", type=Path, required=True)
    batch_parser.add_argument("--retention-receipt-sha256", required=True)
    batch_parser.add_argument("--retention-journal", type=Path, required=True)
    batch_parser.add_argument("--retention-journal-sha256", required=True)
    batch_parser.set_defaults(handler=bootstrap_legacy_batch_v1_preserve)
    d7_worktree_parser = commands.add_parser("derive-legacy-d7-worktree-closure")
    d7_worktree_parser.add_argument("--batch-intent", type=Path, required=True)
    d7_worktree_parser.add_argument("--commands", type=Path, required=True)
    d7_worktree_parser.add_argument("--receipt", type=Path, required=True)
    d7_worktree_parser.add_argument("--lock-proof", type=Path, required=True)
    d7_worktree_parser.add_argument("--final-manifest", type=Path, required=True)
    d7_worktree_parser.add_argument("--closure-output", type=Path, required=True)
    d7_worktree_parser.set_defaults(handler=derive_legacy_d7_worktree_closure)
    p00_batch_parser = commands.add_parser("qualify-legacy-p00-installed-batch")
    p00_batch_parser.add_argument("--proof-output", type=Path, required=True)
    p00_batch_parser.set_defaults(handler=qualify_legacy_p00_installed_batch)
    reconciliation_parser = commands.add_parser("reconcile-release-graph")
    reconciliation_parser.add_argument("--request", type=Path, required=True)
    reconciliation_parser.add_argument("--request-sha256", required=True)
    reconciliation_parser.add_argument("--graph-output", type=Path, required=True)
    reconciliation_parser.add_argument("--projection-output", type=Path, required=True)
    reconciliation_parser.add_argument("--receipt-output", type=Path, required=True)
    reconciliation_parser.set_defaults(handler=reconcile_release_graph)
    prepare_parser = commands.add_parser("prepare")
    for name in ("contract", "lifecycle", "operational-state"):
        prepare_parser.add_argument(f"--{name}", type=Path, required=True)
        prepare_parser.add_argument(f"--{name}-sha256", required=True)
    prepare_parser.add_argument("--root-policy", type=Path, required=True)
    prepare_parser.add_argument("--root-policy-sha256", required=True)
    prepare_parser.add_argument("--deployment-lock", type=Path, required=True)
    prepare_parser.add_argument("--intent-output", type=Path, required=True)
    prepare_parser.add_argument("--commands-output", type=Path, required=True)
    prepare_parser.add_argument("--review-output", type=Path, required=True)
    prepare_parser.add_argument("--reviewer", required=True)
    prepare_parser.add_argument("--reason", required=True)
    prepare_parser.add_argument("--legacy-review-sha256")
    for name in ("prior-intent", "prior-receipt", "prior-journal"):
        prepare_parser.add_argument(f"--{name}", type=Path)
        prepare_parser.add_argument(f"--{name}-sha256")
    prepare_parser.set_defaults(handler=prepare)
    preparation_parser = commands.add_parser("review-preparation")
    preparation_parser.add_argument("--preparation-lifecycle", type=Path, required=True)
    preparation_parser.add_argument("--preparation-lifecycle-sha256", required=True)
    preparation_parser.add_argument("--evidence", type=Path, required=True)
    preparation_parser.add_argument("--evidence-sha256", required=True)
    preparation_parser.add_argument("--state", choices=("SANITIZED", "RETENTION_DEBT"), required=True)
    preparation_parser.add_argument("--reviewer", required=True)
    preparation_parser.add_argument("--reason", required=True)
    preparation_parser.set_defaults(handler=review_preparation)
    execute_parser = commands.add_parser("execute")
    for name in ("intent", "authorization", "operational-state"):
        execute_parser.add_argument(f"--{name}", type=Path, required=True)
        execute_parser.add_argument(f"--{name}-sha256", required=True)
    execute_parser.add_argument("--root-policy", type=Path, required=True)
    execute_parser.add_argument("--root-policy-sha256", required=True)
    execute_parser.add_argument("--deployment-lock", type=Path, required=True)
    execute_parser.add_argument("--deployment-lock-fd", type=int)
    execute_parser.add_argument("--receipt-root", type=Path, required=True)
    execute_parser.add_argument("--review-output", type=Path, required=True)
    execute_parser.set_defaults(handler=execute)
    return root


def main() -> int:
    try:
        args = parser().parse_args()
        args.handler(args)
        return 0
    except Denied as error:
        print(f"GENERATION_RETIREMENT_DENY:{error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
