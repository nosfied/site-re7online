#!/usr/bin/env python3
"""Prepare or execute deterministic retirement for one build generation."""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import fcntl
import hashlib
import json
import marshal
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
# Execute the authenticated bytes without reopening the dependency or writing bytecode.
exec(compile(_preparation_raw, str(_preparation_path), "exec"), preparation_lifecycle.__dict__)

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
FAILED_BUILD_WORKTREE_BINDING = {
    "schemaVersion": 1,
    "kind": "FAILED_BUILD_WORKTREE_A838BD33",
    "generationId": "immutable-a838bd33-vps-20261109T202533Z",
    "releaseId": "immutable-a838bd33-vps-20261109T202533Z",
    "targetCommit": "a838bd33ea00ea49be52d61e025a36320a4154c1",
    "targetTree": "438b737c96c8e42da61cdc14e84694a4afe9dde4",
    "worktreePath": "/opt/re7online/build-worktrees/immutable-a838bd33-vps-20261109T202533Z-source",
    "contract": {
        "path": "/opt/re7online/build-output/immutable-a838bd33-vps-20261109T202533Z-producer/generation-artifacts.private.json",
        "sha256": "ace7b547f92ce75a9b03a913693d543ca72601261fd2c57aaa1e73b4f4101e02",
    },
    "lifecycle": {
        "path": "/opt/re7online/build-output/immutable-a838bd33-vps-20261109T202533Z-producer/generation-lifecycle.private.json",
        "sha256": "4388c11fad23111704feadbe81f73056dc8819433ed10b500c6fad0f6b860af0",
    },
    "capacityContract": {
        "path": "/opt/re7online/backups/converta-persistent/preparations/campaign-multibatch-setbased-a838bd33-build-a838bd33-v1/evidence/capacity-contract.private.json",
        "sha256": "2fbfc0b702598f2522300ecf2a0fae69f4ccf06446d9d85d6994fb0ab35b7a06",
    },
    "packagePath": "/opt/re7online/build-output/immutable-a838bd33-vps-20261109T202533Z-producer/immutable-a838bd33-vps-20261109T202533Z.tar.xz",
    "absentArtifactPaths": [
        "/opt/re7online/build-output/immutable-a838bd33-vps-20261109T202533Z-producer/immutable-a838bd33-vps-20261109T202533Z.tar.xz",
        "/opt/re7online/build-output/immutable-a838bd33-vps-20261109T202533Z-producer/immutable-a838bd33-vps-20261109T202533Z/manifest.json",
        "/opt/re7online/build-output/immutable-a838bd33-vps-20261109T202533Z-producer/immutable-a838bd33-vps-20261109T202533Z/index.sha256",
        "/opt/re7online/build-output/immutable-a838bd33-vps-20261109T202533Z-producer/immutable-a838bd33-vps-20261109T202533Z/api-runtime",
        "/opt/re7online/build-output/immutable-a838bd33-vps-20261109T202533Z-producer/immutable-a838bd33-vps-20261109T202533Z/frontend-runtime",
        "/opt/re7online/releases/immutable-a838bd33-vps-20261109T202533Z",
    ],
    "ignoredPaths": ["apps/whatsapp-agent/node_modules/", "node_modules/"],
}
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
    "canonicalVerifierSha256": "3bc9a6ba5eec9e36090bcfc8bace1b3986bda5c45c5feb67483ff1defd1ae309",
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
    "canonicalVerifierSha256": "3bc9a6ba5eec9e36090bcfc8bace1b3986bda5c45c5feb67483ff1defd1ae309",
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
    "canonicalVerifierSha256": "3bc9a6ba5eec9e36090bcfc8bace1b3986bda5c45c5feb67483ff1defd1ae309",
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

# Closed qualification boundary for the five pre-contract runtimes from the
# af26 -> 879 -> b9 -> afbb lineage.  Unlike modern releases, these trees do
# not have package/index/DEPLOYED triplets.  Their authority is the preserved
# executable manifest plus the immutable, per-transition manifests below.
# Qualification derives current evidence only; it never fabricates a
# historical marker or grants destructive authority.
LEGACY_PRECONTRACT_FIVE_BATCH = {
    "schemaVersion": 1,
    "batchId": "p00-precontract-five-runtimes-20261113-v1",
    "sourceInventorySha256":
        "4c83d13f7ad11e2576378528c4bfec40e4599e7df2ff11663cf1d5d223a7b3b0",
    "sourceGraph": {
        "path": "/opt/re7online/backups/converta-persistent/deploy-transactions/"
                "immutable-fa10f4f5-external-20261112T233820Z-api-frontend-88a5e8b7-v1-once/"
                "generation-release-graph.final.private.json",
        "sha256": "7b9ea5fe44f0a280d314a463aaff9b4e13413071cf42e1177fc4e0756505cb41",
    },
    "externalDataTarget": "/opt/re7online/site-re7online/apps/whatsapp-agent/.data",
    "af26Manifest": {
        "path": "/opt/re7online/backups/converta-persistent/preparations/"
                "immutable-708f018c-vps-20261027T152109Z-fixed-current-bd83b8b5-v2/"
                "control-plane/docs/reviews/automation-freeform-window-release-af26/"
                "executables-manifest.json",
        "sha256": "017c8d678f885026a574ee0b241c9cd156b015ea0b978b53714196ab53364989",
    },
    "r879": {
        "manifest": {
            "path": "/opt/re7online/backups/converta-persistent/preparations/"
                    "incident-6683-879cb1fa/manifest.private.json",
            "sha256": "742f00bfd5c599230de775a8d5e623e1589bfd175380d01ab88fa6304c118c0b",
        },
        "sourceManifest": {
            "path": "/opt/re7online/backups/converta-persistent/preparations/"
                    "incident-6683-879cb1fa/api-src.sha256",
            "sha256": "e7a92bf07f996f0776e64893e35e8368a630a3d5c2457baa7e6a243c9b5693ca",
        },
        "compiledManifest": {
            "path": "/opt/re7online/backups/converta-persistent/preparations/"
                    "incident-6683-879cb1fa/api-dist.sha256",
            "sha256": "2aefa4e68320b3ee4e41e4443c93694db6c9daf66f79300522640a0c121c4928",
        },
        "archive": {
            "path": "/opt/re7online/backups/converta-persistent/preparations/"
                    "incident-6683-879cb1fa/api-src-dist.tar",
            "sha256": "91524e85e42fc50b8b98abab4468710286a31bf551a08bd800738fb3221a0f61",
        },
    },
    "b9Manifest": {
        "path": "/opt/re7online/backups/converta-persistent/preparations/"
                "incident-6683-v4-hybrid-b9-capture-20261005T143500Z/window/"
                "release-manifest.private.json",
        "sha256": "9bee0449146946ffc1e445bc5b826d5c842f3e05f044d2f3076450d99e329edd",
    },
    "afbbManifest": {
        "path": "/opt/re7online/backups/converta-persistent/preparations/"
                "incident-6683-v4-reactive-afbb7455-20261006T010000Z/window/"
                "release-manifest.private.json",
        "sha256": "b275d1221f5d483ddcc04ab4316ba6aa82552cba583cc00f6661cfe44a1158a2",
    },
    "releases": (
        {"releaseId": "af26f48a9c309b24ec4d23cfa97cc1e407c09d98-api",
         "targetCommit": "af26f48a9c309b24ec4d23cfa97cc1e407c09d98",
         "installedReleasePath": "/opt/re7online/releases/"
                                 "af26f48a9c309b24ec4d23cfa97cc1e407c09d98-api",
         "component": "api", "authority": "AF26_EXECUTABLE_MANIFEST",
         "device": 64769, "inode": 2968201, "allocatedBytes": 1000439808},
        {"releaseId": "af26f48a9c309b24ec4d23cfa97cc1e407c09d98-front",
         "targetCommit": "af26f48a9c309b24ec4d23cfa97cc1e407c09d98",
         "installedReleasePath": "/opt/re7online/releases/"
                                 "af26f48a9c309b24ec4d23cfa97cc1e407c09d98-front",
         "component": "frontend", "authority": "AF26_EXECUTABLE_MANIFEST",
         "device": 64769, "inode": 4504637, "allocatedBytes": 1001848832},
        {"releaseId": "879cb1faa88493cd78dd789b71f85043d6c8ff9c-api",
         "targetCommit": "879cb1faa88493cd78dd789b71f85043d6c8ff9c",
         "installedReleasePath": "/opt/re7online/releases/"
                                 "879cb1faa88493cd78dd789b71f85043d6c8ff9c-api",
         "component": "api", "authority": "R879_FULL_SOURCE_COMPILED_MANIFESTS",
         "device": 64769, "inode": 4980737, "allocatedBytes": 1017536512},
        {"releaseId": "b9b58177880e729854580def1180f3edb2fb83e8-api",
         "targetCommit": "b9b58177880e729854580def1180f3edb2fb83e8",
         "installedReleasePath": "/opt/re7online/releases/"
                                 "b9b58177880e729854580def1180f3edb2fb83e8-api",
         "component": "api", "authority": "B9_EXACT_LINEAGE_DELTA",
         "device": 64769, "inode": 5505040, "allocatedBytes": 1017683968},
        {"releaseId": "afbb7455f320793e05a25875e8a5f13f98cabf90-api",
         "targetCommit": "afbb7455f320793e05a25875e8a5f13f98cabf90",
         "installedReleasePath": "/opt/re7online/releases/"
                                 "afbb7455f320793e05a25875e8a5f13f98cabf90-api",
         "component": "api", "authority": "AFBB_EXACT_LINEAGE_DELTA",
         "device": 64769, "inode": 5565834, "allocatedBytes": 1017860096},
    ),
}


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
    optional = {"privateDataOverlay", "worktreeResidueReconciliation"}
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
    if "worktreeResidueReconciliation" in value:
        validate_residue_proof(value)


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


def _validate_ancestors(path: Path, owner_uid: int, predicate: str, *,
                        shared_repository_gid: int | None = None) -> list[Path]:
    shared_ancestors = []
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
            if (shared_repository_gid is None or mode != 0o775 or
                    (info.st_uid, info.st_gid) != (owner_uid, shared_repository_gid)):
                deny(predicate)
            shared_ancestors.append(current)
        if current == current.parent:
            break
        current = current.parent
    return shared_ancestors


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


def authenticate_policy_root(policy: dict[str, Any], key: str, *,
                             preserve_builder_repository: bool = False) -> list[Path]:
    raw_entries = policy["definitions"][key] if key == "evidence" else [policy["definitions"][key]]
    authenticated = []
    for entry in raw_entries:
        path = Path(entry["path"])
        resolved = _protected_directory(path, f"root_policy_directory:{key}")
        info = resolved.lstat()
        mode = stat.S_IMODE(info.st_mode)
        # Builder preservation only observes the checkout's directory identity.
        # The exception cannot make it a parent of any protected artifact root.
        shared_checkout = preserve_builder_repository and key == "repository" and mode == 0o775
        if (info.st_uid != entry["ownerUid"] or info.st_gid != entry["groupGid"] or
                f"0{mode:03o}" not in entry["allowedModes"] or (mode & 0o022 and not shared_checkout)):
            deny(f"root_policy_identity:{key}")
        shared_ancestors = _validate_ancestors(
            resolved.parent, entry["ownerUid"], f"root_policy_ancestor:{key}",
            shared_repository_gid=entry["groupGid"] if shared_checkout else None,
        )
        if shared_checkout:
            roots = policy["canonicalRoots"]
            protected = [value for name, value in roots.items() if name not in {"repository", "evidence"}]
            protected.extend(roots["evidence"])
            shared_paths = [resolved, *shared_ancestors]
            if any(Path(value).resolve().is_relative_to(parent)
                   for value in protected for parent in shared_paths):
                deny("builder_preservation_repository_overlap")
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


def _git_output(arguments: list[str], predicate: str) -> str:
    result = subprocess.run(arguments, text=True, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE)
    if result.returncode:
        deny(predicate)
    return result.stdout


def _git_worktree_registration(repository: Path, worktree: Path) -> dict[str, str] | None:
    raw = _git_output(["/usr/bin/git", "-C", str(repository), "worktree", "list",
                       "--porcelain"], "failed_build_worktree_git_registry")
    matches = []
    for block in raw.strip().split("\n\n") if raw.strip() else []:
        fields = {}
        for line in block.splitlines():
            key, _, value = line.partition(" ")
            fields[key] = value
        if fields.get("worktree") == str(worktree):
            matches.append(fields)
    if len(matches) > 1:
        deny("failed_build_worktree_git_registry")
    return matches[0] if matches else None


def authenticate_failed_build_worktree_disposition(
        contract: dict[str, Any], lifecycle: dict[str, Any], operational: dict[str, Any],
        contract_path: Path, contract_sha256: str,
        lifecycle_path: Path, lifecycle_sha256: str) -> dict[str, Any] | None:
    """Authenticate the one failed build whose package never existed.

    This is a closed exception for the a838 capacity denial.  It proves that
    the only present retirable artifact is the registered Git worktree and
    that its only ignored content is the two npm dependency directories.
    Output evidence, custody and the npm cache are deliberately outside this
    disposition.
    """
    binding = FAILED_BUILD_WORKTREE_BINDING
    identity_fields = (
        contract.get("generationId"), contract.get("releaseId"),
        contract.get("targetCommit"),
    )
    expected_identity = (
        binding["generationId"], binding["releaseId"], binding["targetCommit"],
    )
    worktrees = [item for item in contract.get("artifacts", [])
                 if isinstance(item, dict) and item.get("class") == "DERIVED_WORKTREE"]
    mentions_closed_scope = (identity_fields == expected_identity or
                             any(item.get("path") == binding["worktreePath"]
                                 for item in worktrees))
    if not mentions_closed_scope:
        return None
    if (identity_fields != expected_identity or len(worktrees) != 1 or
            worktrees[0].get("path") != binding["worktreePath"] or
            contract_path != Path(binding["contract"]["path"]) or
            contract_sha256 != binding["contract"]["sha256"] or
            lifecycle_path != Path(binding["lifecycle"]["path"]) or
            lifecycle_sha256 != binding["lifecycle"]["sha256"]):
        deny("failed_build_worktree_binding")
    if (lifecycle.get("generationId") != binding["generationId"] or
            lifecycle.get("targetCommit") != binding["targetCommit"] or
            lifecycle.get("state") != "FAILED" or
            lifecycle.get("dispositionState") != "RETENTION_DEBT" or
            lifecycle.get("failureClass") != "Denied" or
            lifecycle.get("artifactContract") != str(contract_path) or
            lifecycle.get("package") != binding["packagePath"] or
            lifecycle.get("capacity", {}).get("contractSha256") !=
            binding["capacityContract"]["sha256"]):
        deny("failed_build_worktree_lifecycle")
    capacity_path = Path(binding["capacityContract"]["path"])
    capacity_raw, _ = stable_private(capacity_path, binding["capacityContract"]["sha256"])
    capacity = object_json(capacity_raw, "failed-build-capacity-contract")
    if (capacity.get("targetCommit") != binding["targetCommit"] or
            capacity.get("releaseId") != binding["releaseId"] or
            capacity.get("contractId") != "campaign-multibatch-setbased-a838bd33-v1"):
        deny("failed_build_worktree_capacity_contract")
    capacity_artifacts = [item for item in contract["artifacts"]
                          if item.get("path") == str(capacity_path)]
    if (len(capacity_artifacts) != 1 or
            capacity_artifacts[0].get("class") != "EVIDENCE_PRESERVE" or
            capacity_artifacts[0].get("digest") != {
                "sha256": binding["capacityContract"]["sha256"]}):
        deny("failed_build_worktree_capacity_binding")
    absent = set(binding["absentArtifactPaths"])
    contract_paths = {item.get("path") for item in contract["artifacts"]}
    if not absent.issubset(contract_paths):
        deny("failed_build_worktree_absent_scope")
    for raw_path in absent:
        path = Path(raw_path)
        if path.exists() or path.is_symlink():
            deny(f"failed_build_worktree_expected_absence:{path.name}")
    worktree = Path(binding["worktreePath"])
    repository = Path(operational["gitRepository"])
    if (path_referenced(str(worktree), operational) or worktree.is_symlink() or
            not worktree.is_dir()):
        deny("failed_build_worktree_live_or_missing")
    registration = _git_worktree_registration(repository, worktree)
    if (registration is None or registration.get("HEAD") != binding["targetCommit"] or
            "detached" not in registration):
        deny("failed_build_worktree_git_registry")
    head = _git_output(["/usr/bin/git", "-C", str(worktree), "rev-parse", "HEAD"],
                       "failed_build_worktree_head").strip()
    tree = _git_output(["/usr/bin/git", "-C", str(worktree), "show", "-s",
                        "--format=%T", "HEAD"], "failed_build_worktree_tree").strip()
    if head != binding["targetCommit"] or tree != binding["targetTree"]:
        deny("failed_build_worktree_git_identity")
    status = _git_output(["/usr/bin/git", "-C", str(worktree), "status",
                          "--porcelain=v1", "--untracked-files=all"],
                         "failed_build_worktree_status")
    if status:
        deny("failed_build_worktree_checkout_dirty")
    ignored_raw = _git_output(["/usr/bin/git", "-C", str(worktree), "status",
                               "--porcelain=v1", "--ignored=matching"],
                              "failed_build_worktree_ignored")
    ignored = sorted(line[3:] for line in ignored_raw.splitlines()
                     if line.startswith("!! "))
    if (ignored != sorted(binding["ignoredPaths"]) or
            len(ignored_raw.splitlines()) != len(ignored)):
        deny("failed_build_worktree_ignored_scope")
    authenticate_artifact(worktrees[0])
    return {
        "schemaVersion": binding["schemaVersion"], "kind": binding["kind"],
        "generationId": binding["generationId"], "targetCommit": binding["targetCommit"],
        "targetTree": binding["targetTree"], "worktreePath": binding["worktreePath"],
        "contractSha256": binding["contract"]["sha256"],
        "lifecycleSha256": binding["lifecycle"]["sha256"],
        "capacityContractSha256": binding["capacityContract"]["sha256"],
        "absentArtifactPaths": sorted(absent),
        "ignoredPaths": sorted(binding["ignoredPaths"]),
        "destructiveScope": [binding["worktreePath"]],
    }


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


BYTECODE_RESIDUE = "scripts/__pycache__/preparation_artifact_lifecycle.cpython-312.pyc"
BYTECODE_DIRECTORY = "scripts/__pycache__"
INVENTORY_KEYS = {"path", "type", "mode", "size", "mtimeNs", "link", "device", "inode",
                  "allocatedBytes", "uid", "gid", "nlink", "sha256"}


def worktree_inventory(root: Path) -> dict[str, Any]:
    """Record contents and metadata without following directory symlinks."""
    records = []
    for path in sorted([root, *root.rglob("*")], key=lambda item: os.fsencode(item.as_posix())):
        before = path.lstat()
        kind = ("symlink" if stat.S_ISLNK(before.st_mode) else
                "directory" if stat.S_ISDIR(before.st_mode) else
                "regular" if stat.S_ISREG(before.st_mode) else "other")
        if kind == "other":
            deny("residue_inventory_type")
        sha = None
        if kind == "regular":
            fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
            with os.fdopen(fd, "rb") as stream:
                opened = os.fstat(stream.fileno())
                if (opened.st_dev, opened.st_ino, opened.st_mode) != (before.st_dev, before.st_ino, before.st_mode):
                    deny("residue_inventory_race")
                hasher = hashlib.sha256()
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    hasher.update(chunk)
                sha = hasher.hexdigest()
        after = path.lstat()
        if ((before.st_dev, before.st_ino, before.st_mode, before.st_size, before.st_mtime_ns,
             before.st_ctime_ns, before.st_nlink) !=
                (after.st_dev, after.st_ino, after.st_mode, after.st_size, after.st_mtime_ns,
                 after.st_ctime_ns, after.st_nlink)):
            deny("residue_inventory_race")
        records.append({
            "path": "." if path == root else path.relative_to(root).as_posix(),
            "type": kind, "mode": stat.S_IMODE(before.st_mode), "size": before.st_size,
            "mtimeNs": before.st_mtime_ns, "link": os.readlink(path) if kind == "symlink" else None,
            "device": before.st_dev, "inode": before.st_ino, "allocatedBytes": before.st_blocks * 512,
            "uid": before.st_uid, "gid": before.st_gid, "nlink": before.st_nlink, "sha256": sha,
        })
    return {"schemaVersion": 1, "root": str(root), "entries": records}


def inventory_metrics(inventory: dict[str, Any]) -> dict[str, Any]:
    if (set(inventory) != {"schemaVersion", "root", "entries"} or inventory["schemaVersion"] != 1 or
            not isinstance(inventory["root"], str) or not Path(inventory["root"]).is_absolute() or
            not isinstance(inventory["entries"], list)):
        deny("residue_inventory_schema")
    structure = hashlib.sha256()
    unique = set()
    seen_paths = set()
    total = {"sizeBytes": 0, "allocatedBytes": 0, "inodes": 0}
    entries = inventory["entries"]
    if any(not isinstance(item, dict) or set(item) != INVENTORY_KEYS or
           not isinstance(item["path"], str) for item in entries):
        deny("residue_inventory_entry")
    ordered = sorted(entries, key=lambda item: os.fsencode(
        Path(inventory["root"]).name + ("" if item["path"] == "." else "/" + item["path"])))
    if entries != ordered:
        deny("residue_inventory_order")
    for item in entries:
        relative = item["path"]
        if (relative in seen_paths or (relative != "." and
                (not relative or Path(relative).is_absolute() or ".." in Path(relative).parts or
                 str(Path(relative)) != relative)) or
                item["type"] not in {"regular", "directory", "symlink"} or
                any(type(item[key]) is not int or item[key] < 0 for key in
                    ("mode", "size", "mtimeNs", "device", "inode", "allocatedBytes", "uid", "gid", "nlink")) or
                (item["type"] == "regular" and not SHA256.fullmatch(str(item["sha256"]))) or
                (item["type"] != "regular" and item["sha256"] is not None) or
                (item["type"] == "symlink" and not isinstance(item["link"], str)) or
                (item["type"] != "symlink" and item["link"] is not None)):
            deny("residue_inventory_entry")
        seen_paths.add(relative)
        structure.update(canonical({key: item[key] for key in
                                    ("path", "type", "mode", "size", "mtimeNs", "link")}))
        identity = item["device"], item["inode"]
        if identity not in unique:
            unique.add(identity)
            total["sizeBytes"] += item["size"]
            total["allocatedBytes"] += item["allocatedBytes"]
            total["inodes"] += 1
    if not entries or entries[0]["path"] != "." or entries[0]["type"] != "directory":
        deny("residue_inventory_root")
    return {**total, "structuralSha256": structure.hexdigest()}


def residue_delta(baseline: dict[str, Any], observed: dict[str, Any], *, present: bool) -> list[dict[str, Any]]:
    inventory_metrics(baseline); inventory_metrics(observed)
    if baseline["root"] != observed["root"]:
        deny("residue_inventory_root")
    source = {item["path"]: item for item in baseline["entries"]}
    current = {item["path"]: item for item in observed["entries"]}
    additions = {BYTECODE_DIRECTORY, BYTECODE_RESIDUE} if present else set()
    if (set(current) != set(source) | additions or
            BYTECODE_DIRECTORY in source or BYTECODE_RESIDUE in source):
        deny("residue_inventory_delta_scope")
    for path, item in source.items():
        ignored = {"size", "mtimeNs", "allocatedBytes", "nlink"} if path == "scripts" else set()
        if ({key: value for key, value in item.items() if key not in ignored} !=
                {key: value for key, value in current[path].items() if key not in ignored}):
            deny(f"residue_inventory_delta:{path}")
    if "scripts" not in source or source["scripts"]["type"] != "directory":
        deny("residue_inventory_parent")
    if current["scripts"]["nlink"] != source["scripts"]["nlink"] + int(present):
        deny("residue_inventory_parent_links")
    if present:
        directory, residue = current[BYTECODE_DIRECTORY], current[BYTECODE_RESIDUE]
        owner = current["scripts"]
        if (directory["type"] != "directory" or residue["type"] != "regular" or
                residue["nlink"] != 1 or residue["size"] > 1024 * 1024 or
                any(item["uid"] != owner["uid"] or item["gid"] != owner["gid"] or item["mode"] & 0o022
                    for item in (directory, residue))):
            deny("residue_identity")
    changed = {"scripts"} | additions
    return [item for item in observed["entries"] if item["path"] in changed]


def restore_residue_inventory(baseline: dict[str, Any], delta: Any, *, present: bool) -> dict[str, Any]:
    if (not isinstance(delta, list) or
            any(not isinstance(item, dict) or "path" not in item for item in delta)):
        deny("residue_inventory_delta")
    expected = {"scripts", BYTECODE_DIRECTORY, BYTECODE_RESIDUE} if present else {"scripts"}
    if len(delta) != len(expected) or {item["path"] for item in delta} != expected:
        deny("residue_inventory_delta")
    entries = {item["path"]: item for item in baseline["entries"]}
    entries.update({item["path"]: item for item in delta})
    restored = {**baseline, "entries": sorted(entries.values(), key=lambda item: os.fsencode(
        Path(baseline["root"]).name + ("" if item["path"] == "." else "/" + item["path"])))}
    residue_delta(baseline, restored, present=present)
    return restored


def residue_commands(worktree: str) -> list[list[str]]:
    root = Path(worktree)
    return [["/usr/bin/rm", "--", str(root / BYTECODE_RESIDUE)],
            ["/usr/bin/rmdir", "--", str(root / BYTECODE_DIRECTORY)]]


def validate_residue_sources(request: dict[str, Any], sources: dict[str, str]) -> tuple[dict[str, Any], dict[str, Any]]:
    required = {"schemaVersion", "contract", "lifecycle", "baseline", "denial",
                "operationalState", "rootPolicy", "deploymentLock", "residueSha256"}
    if (set(request) != required or request["schemaVersion"] != 1 or
            set(sources) != {"contract", "lifecycle", "baseline", "denial"} or
            not SHA256.fullmatch(str(request["residueSha256"])) or
            not Path(str(request["deploymentLock"])).is_absolute()):
        deny("residue_request_schema")
    documents = {}
    for key, encoded in sources.items():
        try:
            raw = base64.b64decode(encoded, validate=True)
        except (ValueError, TypeError):
            deny("residue_source_encoding")
        binding = request[key]
        if (not isinstance(binding, dict) or set(binding) != {"path", "sha256"} or
                not Path(str(binding["path"])).is_absolute() or digest_bytes(raw) != binding["sha256"]):
            deny("residue_source_binding")
        documents[key] = raw
    contract = object_json(documents["contract"], "residue-contract")
    if "worktreeResidueReconciliation" in contract:
        deny("residue_nested_successor")
    validate_contract(contract)
    lifecycle = object_json(documents["lifecycle"], "residue-lifecycle")
    if (not re.fullmatch(r"immutable-[0-9a-f]{8}-external-[0-9]{8}T[0-9]{6}Z", str(contract["releaseId"])) or
            not re.fullmatch(r"[0-9a-f]{40}", str(contract["targetCommit"])) or
            not contract["releaseId"].startswith(f"immutable-{contract['targetCommit'][:8]}-external-") or
            contract["generationId"] != contract["releaseId"] or
            contract["state"] != "COMPLETE" or lifecycle.get("state") != "COMPLETE" or
            lifecycle.get("generationId") != contract["generationId"] or
            lifecycle.get("targetCommit") != contract["targetCommit"]):
        deny("residue_generation")
    worktrees = [item for item in contract["artifacts"] if item["class"] == "DERIVED_WORKTREE"]
    if len(worktrees) != 1:
        deny("residue_worktree_scope")
    worktree = worktrees[0]
    baseline = object_json(documents["baseline"], "residue-baseline")
    if (baseline.get("root") != worktree["path"] or
            any(worktree.get(key) != value for key, value in inventory_metrics(baseline).items()) or
            worktree.get("observedIdentity") !=
            {key: baseline["entries"][0][key] for key in ("device", "inode")}):
        deny("residue_baseline_contract")
    predicate = f"artifact_drift:{worktree['path']}:sizeBytes".encode()
    if predicate not in documents["denial"]:
        deny("residue_denial_binding")
    return contract, baseline


def validate_residue_proof(successor: dict[str, Any]) -> None:
    proof = successor["worktreeResidueReconciliation"]
    if not isinstance(proof, dict) or set(proof) != {"intent", "authorization", "events", "receipt", "afterDelta"}:
        deny("residue_proof_schema")
    intent, auth, receipt = proof["intent"], proof["authorization"], proof["receipt"]
    original, baseline = validate_residue_sources(intent["request"], intent["sources"])
    before = restore_residue_inventory(baseline, intent["beforeDelta"], present=True)
    after = restore_residue_inventory(baseline, proof["afterDelta"], present=False)
    worktree = baseline["root"]
    commands = residue_commands(worktree)
    if next(item["sha256"] for item in before["entries"] if item["path"] == BYTECODE_RESIDUE) != intent["request"]["residueSha256"]:
        deny("residue_proof_bytecode")
    if (intent.get("schemaVersion") != 1 or intent.get("state") != "SEALED_FOR_EXPLICIT_AUTHORIZATION" or
            intent.get("commands") != commands or
            auth.get("schemaVersion") != 1 or auth.get("decision") != "AUTHORIZE_ONCE" or
            auth.get("intentSha256") != digest_bytes(canonical(intent)) or
            auth.get("approvedPaths") != [command[-1] for command in commands] or
            not isinstance(auth.get("owner"), str) or not auth["owner"].strip()):
        deny("residue_proof_authorization")
    events = proof["events"]
    if not isinstance(events, list) or len(events) != 6:
        deny("residue_proof_journal")
    for index, argv in enumerate(commands, 1):
        attempt, result, verified = events[(index - 1) * 3:index * 3]
        if (attempt != {"event": "ATTEMPT", "ordinal": index, "path": argv[-1], "argv": argv} or
                not isinstance(result, dict) or
                set(result) != {"event", "ordinal", "exitCode", "stdoutSha256", "stderrSha256"} or
                result.get("event") != "RESULT" or result.get("ordinal") != index or
                type(result.get("exitCode")) is not int or result["exitCode"] != 0 or
                any(not SHA256.fullmatch(str(result[key])) for key in ("stdoutSha256", "stderrSha256")) or
                verified != {"event": "VERIFIED", "ordinal": index, "absent": True}):
            deny("residue_proof_journal")
    metrics = inventory_metrics(after)
    changed = [{**item, **metrics} if item["class"] == "DERIVED_WORKTREE" else item
               for item in original["artifacts"]]
    if ({key: value for key, value in successor.items() if key != "worktreeResidueReconciliation"} !=
            {**original, "artifacts": changed} or
            receipt != {"schemaVersion": 1, "state": "COMPLETED",
                        "intentSha256": digest_bytes(canonical(intent)),
                        "authorizationSha256": digest_bytes(canonical(auth)),
                        "journalSha256": digest_bytes(b"".join(canonical(event) for event in events)),
                        "beforeInventorySha256": digest_bytes(canonical(before)),
                        "afterInventorySha256": digest_bytes(canonical(after)),
                        "successorArtifactsSha256": digest_bytes(canonical(changed)),
                        "attemptedCommands": 2, "completedCommands": 2, "automaticRetry": False}):
        deny("residue_successor_binding")


def authenticate_residue_request(request_path: Path, expected_sha: str) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, str]]:
    raw, _ = stable_private(request_path, expected_sha)
    request = object_json(raw, "residue-request")
    sources = {}
    for key in ("contract", "lifecycle", "baseline", "denial"):
        _, _, content = _closed_file_binding(request.get(key), f"residue:{key}")
        sources[key] = base64.b64encode(content).decode()
    contract, baseline = validate_residue_sources(request, sources)
    return request, contract, baseline, sources


def residue_policy(request: dict[str, Any]) -> dict[str, Any]:
    binding = request.get("rootPolicy")
    if not isinstance(binding, dict) or set(binding) != {"path", "sha256"}:
        deny("residue_policy_binding")
    raw, _ = stable_policy(Path(str(binding["path"])), binding["sha256"])
    return validate_root_policy(raw, binding["sha256"])


def residue_observation(request: dict[str, Any], contract: dict[str, Any], baseline: dict[str, Any],
                        *, present: bool) -> tuple[dict[str, Any], dict[str, Any]]:
    for key in ("contract", "lifecycle", "baseline", "denial"):
        _closed_file_binding(request[key], f"residue:{key}")
    policy = residue_policy(request)
    _, _, operational_raw = _closed_file_binding(request["operationalState"], "residue:operational")
    operational = object_json(operational_raw, "residue-operational")
    validate_operational(operational, contract, policy)
    validate_artifact_roots(contract, operational, policy)
    worktree = Path(baseline["root"])
    if path_referenced(str(worktree), operational) or _path_has_symlink(worktree, Path(policy["canonicalRoots"]["worktrees"])):
        deny("residue_worktree_referenced")
    for artifact in contract["artifacts"]:
        if artifact["class"] != "DERIVED_WORKTREE":
            authenticate_artifact(artifact)
    observed = worktree_inventory(worktree)
    residue_delta(baseline, observed, present=present)
    if present:
        residue = worktree / BYTECODE_RESIDUE
        fd = os.open(residue, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(fd, "rb") as stream:
            opened = os.fstat(stream.fileno())
            if not stat.S_ISREG(opened.st_mode) or opened.st_size > 1024 * 1024:
                deny("residue_bytecode_binding")
            raw = stream.read(1024 * 1024 + 1)
        source = worktree / "scripts/preparation_artifact_lifecycle.py"
        source_raw = source.read_bytes()
        if (digest_bytes(raw) != request["residueSha256"] or
                digest_bytes(source_raw) != PREPARATION_LIFECYCLE_SHA256 or
                not 16 <= len(raw) <= 1024 * 1024 or raw[:4] != importlib.util.MAGIC_NUMBER):
            deny("residue_bytecode_binding")
        flags = int.from_bytes(raw[4:8], "little")
        source_info = source.lstat()
        if (flags not in {0, 1, 3} or
                (flags == 0 and raw[8:16] !=
                 (int(source_info.st_mtime) & 0xffffffff).to_bytes(4, "little") +
                 (len(source_raw) & 0xffffffff).to_bytes(4, "little")) or
                (flags in {1, 3} and raw[8:16] != importlib.util.source_hash(source_raw))):
            deny("residue_bytecode_header")
        try:
            generated = marshal.loads(raw[16:])
            compiled = compile(source_raw, str(source), "exec", dont_inherit=True, optimize=0)
        except (ValueError, TypeError, EOFError, OverflowError):
            deny("residue_bytecode_content")
        if generated != compiled:
            deny("residue_bytecode_content")
    return observed, capture_fresh_operational(operational)


def prepare_worktree_residue(args: argparse.Namespace) -> None:
    request, contract, baseline, sources = authenticate_residue_request(args.request, args.request_sha256)
    lock = acquire_existing_lock(Path(request["deploymentLock"]))
    try:
        writer = acquire_existing_lock(Path(contract["writerLockPath"]))
        try:
            observed, fresh = residue_observation(request, contract, baseline, present=True)
            _, _, op_raw = _closed_file_binding(request["operationalState"], "residue:operational")
            operational = object_json(op_raw, "residue-operational")
            evidence_destination(args.intent_output, operational)
            intent = {"schemaVersion": 1, "state": "SEALED_FOR_EXPLICIT_AUTHORIZATION",
                      "request": request, "sources": sources, "beforeDelta": residue_delta(baseline, observed, present=True),
                      "commands": residue_commands(baseline["root"]), "freshObservation": fresh}
            write_exclusive(args.intent_output, canonical(intent))
            print(canonical({"result": "WORKTREE_RESIDUE_PREPARED", "intentSha256": digest_bytes(canonical(intent)),
                             "commandCount": 2, "authorizationGranted": False}).decode().strip())
        finally:
            os.close(writer)
    finally:
        os.close(lock)


def execute_worktree_residue(args: argparse.Namespace) -> None:
    intent_raw, _ = stable_private(args.intent, args.intent_sha256)
    auth_raw, _ = stable_private(args.authorization, args.authorization_sha256)
    intent, auth = object_json(intent_raw, "residue-intent"), object_json(auth_raw, "residue-authorization")
    if intent_raw != canonical(intent) or auth_raw != canonical(auth):
        deny("residue_authorization_serialization")
    request, sources = intent["request"], intent["sources"]
    contract, baseline = validate_residue_sources(request, sources)
    commands = residue_commands(baseline["root"])
    if (intent.get("schemaVersion") != 1 or intent.get("state") != "SEALED_FOR_EXPLICIT_AUTHORIZATION" or
            intent.get("commands") != commands or
            set(auth) != {"schemaVersion", "authorizationId", "decision", "intentSha256", "approvedPaths", "owner"} or
            auth.get("schemaVersion") != 1 or auth.get("decision") != "AUTHORIZE_ONCE" or
            auth.get("intentSha256") != args.intent_sha256 or
            auth.get("approvedPaths") != [item[-1] for item in commands] or
            not isinstance(auth.get("owner"), str) or not auth["owner"].strip()):
        deny("residue_authorization")
    if args.receipt_root.exists() or args.receipt_root.is_symlink():
        deny("residue_execution_exists_reconciliation_required")
    lock = acquire_existing_lock(Path(request["deploymentLock"]))
    try:
        writer = acquire_existing_lock(Path(contract["writerLockPath"]))
        try:
            observed, fresh = residue_observation(request, contract, baseline, present=True)
            if observed != restore_residue_inventory(baseline, intent["beforeDelta"], present=True):
                deny("residue_prepare_drift")
            _, _, op_raw = _closed_file_binding(request["operationalState"], "residue:operational")
            operational = object_json(op_raw, "residue-operational")
            evidence_destination(args.receipt_root, operational)
            policy = residue_policy(request)
            outputs = authenticate_policy_root(policy, "outputs")[0]
            _strict_child(args.successor_root, outputs, "residue_successor_destination")
            if (args.successor_root != outputs / f"{contract['releaseId']}-bytecode-successor" or
                    args.successor_root.exists() or args.successor_root.is_symlink()):
                deny("residue_successor_destination")
            if fresh != intent["freshObservation"]:
                deny("residue_operational_drift")
            args.receipt_root.mkdir(mode=0o700)
            journal = args.receipt_root / "command-results.private.jsonl"
            write_exclusive(journal, b"")
            attempted = completed = 0
            try:
                for ordinal, argv in enumerate(commands, 1):
                    append_event(journal, {"event": "ATTEMPT", "ordinal": ordinal, "path": argv[-1], "argv": argv})
                    attempted += 1
                    result = subprocess.run(argv, capture_output=True)
                    append_event(journal, {"event": "RESULT", "ordinal": ordinal, "exitCode": result.returncode,
                                          "stdoutSha256": digest_bytes(result.stdout), "stderrSha256": digest_bytes(result.stderr)})
                    if result.returncode or Path(argv[-1]).exists() or Path(argv[-1]).is_symlink():
                        deny("residue_command_failed")
                    append_event(journal, {"event": "VERIFIED", "ordinal": ordinal, "absent": True})
                    completed += 1
                after, final_fresh = residue_observation(request, contract, baseline, present=False)
                if final_fresh != fresh:
                    deny("residue_operational_drift")
                artifacts = [{**item, **inventory_metrics(after)} if item["class"] == "DERIVED_WORKTREE" else item
                             for item in contract["artifacts"]]
                receipt = {"schemaVersion": 1, "state": "COMPLETED", "intentSha256": args.intent_sha256,
                           "authorizationSha256": args.authorization_sha256,
                           "journalSha256": digest_bytes(journal.read_bytes()),
                           "beforeInventorySha256": digest_bytes(canonical(observed)),
                           "afterInventorySha256": digest_bytes(canonical(after)),
                           "successorArtifactsSha256": digest_bytes(canonical(artifacts)),
                           "attemptedCommands": 2, "completedCommands": 2, "automaticRetry": False}
                proof = {"intent": intent, "authorization": auth, "events": _read_journal(journal.read_bytes()),
                         "receipt": receipt, "afterDelta": residue_delta(baseline, after, present=False)}
                successor = {**contract, "artifacts": artifacts, "worktreeResidueReconciliation": proof}
                validate_contract(successor)
                args.successor_root.mkdir(mode=0o700)
                lifecycle_raw = base64.b64decode(sources["lifecycle"], validate=True)
                write_exclusive(args.successor_root / "generation-lifecycle.private.json", lifecycle_raw)
                successor_raw = canonical(successor)
                write_exclusive(args.successor_root / "generation-artifacts.private.json", successor_raw)
                write_exclusive(args.receipt_root / "execution-receipt.private.json", canonical(receipt))
                print(canonical({"result": "WORKTREE_RESIDUE_RECONCILED",
                                 "successorContractSha256": digest_bytes(successor_raw),
                                 "receiptSha256": digest_bytes(canonical(receipt)),
                                 "attemptedCommands": 2, "completedCommands": 2}).decode().strip())
            except BaseException as error:
                failed = args.receipt_root / "execution-receipt.private.json"
                if not failed.exists():
                    write_exclusive(failed, canonical({"schemaVersion": 1, "state": "QUARANTINED",
                        "intentSha256": args.intent_sha256, "attemptedCommands": attempted,
                        "completedCommands": completed, "failurePredicate": str(error),
                        "journalSha256": digest_bytes(journal.read_bytes()), "automaticRetry": False}))
                raise
        finally:
            os.close(writer)
    finally:
        os.close(lock)


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


def classify(artifact: dict[str, Any], contract: dict[str, Any], operational: dict[str, Any],
             failed_build_worktree: dict[str, Any] | None = None) -> str:
    kind = artifact["class"]
    release = contract["releaseId"]
    path = artifact["path"]
    if kind in PRESERVE_CLASSES:
        return "ACTIVE_DEPENDENCY"
    if kind == F160_CACHE_CLASS:
        return "ACTIVE_DEPENDENCY"
    if failed_build_worktree is not None:
        if path == failed_build_worktree["worktreePath"]:
            if kind != "DERIVED_WORKTREE" or path_referenced(path, operational):
                deny("failed_build_worktree_classification")
            return "RETIREMENT_READY"
        if path in set(failed_build_worktree["absentArtifactPaths"]):
            if kind not in {"DERIVED_OUTPUT_RUNTIME", "RELEASE_RUNTIME"}:
                # Missing PACKAGE_PRESERVE entries were already handled above:
                # they remain preserved evidence of a package that never existed.
                return "ACTIVE_DEPENDENCY"
            return "SANITIZED"
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


def preservation_deadline(value: Any) -> None:
    try:
        expires = dt.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        deny("builder_preservation_expiry")
    if (expires.tzinfo is None or expires.utcoffset() != dt.timedelta(0) or
            expires <= dt.datetime.now(dt.timezone.utc)):
        deny("builder_preservation_expiry")


def preservation_snapshot(request: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    fields = {"schemaVersion", "contract", "lifecycle", "rootPolicy",
              "deploymentLock", "responsible", "expiresAtUtc", "reason"}
    if (set(request) != fields or request.get("schemaVersion") != 1 or
            any(not isinstance(request.get(key), str) or not request[key].strip()
                for key in ("responsible", "reason")) or
            not Path(str(request["deploymentLock"])).is_absolute()):
        deny("builder_preservation_request")
    preservation_deadline(request["expiresAtUtc"])
    _, contract_sha, contract_raw = _closed_file_binding(request["contract"], "preservation:contract")
    _, lifecycle_sha, lifecycle_raw = _closed_file_binding(request["lifecycle"], "preservation:lifecycle")
    contract = object_json(contract_raw, "builder-preservation-contract")
    lifecycle = object_json(lifecycle_raw, "builder-preservation-lifecycle")
    validate_contract(contract)
    if (contract["state"] != "COMPLETE" or
            not re.fullmatch(r"immutable-[0-9a-f]{8}-external-[0-9]{8}T[0-9]{6}Z", contract["releaseId"]) or
            lifecycle.get("state") != "COMPLETE" or lifecycle.get("generationId") != contract["generationId"] or
            lifecycle.get("targetCommit") != contract["targetCommit"]):
        deny("builder_preservation_generation")
    policy = residue_policy(request)
    authenticate_policy_root(policy, "repository", preserve_builder_repository=True)
    for root_name in ("worktrees", "outputs", "releases"):
        authenticate_policy_root(policy, root_name)
    operational = {"canonicalRoots": policy["canonicalRoots"]}
    validate_artifact_roots(contract, operational, policy)
    observed = []
    for artifact in contract["artifacts"]:
        path = Path(artifact["path"])
        if artifact["class"] == "DERIVED_WORKTREE":
            info = path.lstat()
            if (path.is_symlink() or not stat.S_ISDIR(info.st_mode) or
                    artifact["observedIdentity"] != {"device": info.st_dev, "inode": info.st_ino}):
                deny("builder_preservation_worktree_identity")
        else:
            authenticate_artifact(artifact)
        if artifact["class"] in {"DERIVED_WORKTREE", "DERIVED_OUTPUT_RUNTIME"}:
            if not path.is_dir() or path.is_symlink():
                deny("builder_preservation_path")
            info = path.lstat()
            observed.append({"path": str(path), "class": artifact["class"],
                             "identity": {"device": info.st_dev, "inode": info.st_ino},
                             **structural_metrics(path)})
        elif artifact["class"] in DERIVED_CLASSES and not (
                artifact["class"] == "DERIVED_STAGING" and
                artifact.get("removedAtProducerCompletion") is True and
                not path.exists() and not path.is_symlink()):
            deny("builder_preservation_scope")
    if [item["class"] for item in observed] != ["DERIVED_WORKTREE", "DERIVED_OUTPUT_RUNTIME", "DERIVED_OUTPUT_RUNTIME"]:
        deny("builder_preservation_scope")
    review = Path(request["contract"]["path"]).parent / "generation-review.private.json"
    review_sha = digest_bytes(stable_private(review)[0]) if review.exists() or review.is_symlink() else None
    snapshot = {"releaseId": contract["releaseId"], "targetCommit": contract["targetCommit"],
                "contractSha256": contract_sha, "lifecycleSha256": lifecycle_sha,
                "historicalInventoryEquivalence": False, "artifacts": observed,
                "retainedBytes": sum(item["allocatedBytes"] for item in observed),
                "accounting": "CONSERVATIVE_SUM_OF_PER_ROOT_PHYSICAL_BYTES",
                "previousReviewSha256": review_sha}
    return contract, operational, snapshot


def materialize_builder_preservation_lock(args: argparse.Namespace) -> None:
    """Bootstrap only the builder window lock, using the existing writer lock."""
    raw, _ = stable_private(args.request, args.request_sha256)
    request = object_json(raw, "builder-preservation-request")
    _, _, contract_raw = _closed_file_binding(request.get("contract"), "preservation:contract")
    original = object_json(contract_raw, "builder-preservation-contract")
    validate_contract(original)
    writer_path = Path(original["writerLockPath"])
    writer = acquire_existing_lock(writer_path)
    try:
        contract, operational, _ = preservation_snapshot(request)
        policy = residue_policy(request)
        outputs = authenticate_policy_root(policy, "outputs")[0]
        path = Path(request["deploymentLock"])
        parent = outputs.parent
        info = parent.lstat()
        if (path != parent / ".deployment-window.lock" or parent.resolve(strict=True) != parent or
                not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid() or
                info.st_gid != os.getegid() or stat.S_IMODE(info.st_mode) & 0o022 or path == writer_path):
            deny("builder_preservation_lock_path")
        evidence_destination(args.report_output, operational)
        if args.report_output.exists() or args.report_output.is_symlink():
            deny("builder_preservation_lock_report_exists")
        binding = {
            "schemaVersion": 1, "kind": "BUILDER_PRESERVATION_LOCK",
            "generationId": contract["generationId"], "targetCommit": contract["targetCommit"],
            "contractSha256": request["contract"]["sha256"],
            "lifecycleSha256": request["lifecycle"]["sha256"],
            "rootPolicySha256": request["rootPolicy"]["sha256"],
            "path": str(path), "writerLockPath": str(writer_path),
        }
        binding_sha = digest_bytes(canonical(binding))
        expected = (binding_sha + "\n").encode()
        existed = path.exists() or path.is_symlink()
        if existed:
            existing, before = stable_private(path)
            if existing != expected or before.st_nlink != 1:
                deny("builder_preservation_lock_binding")
        # Reuse the versioned exclusive creation, flock and fsync implementation.
        lock = acquire_or_authenticate_lock(path, None, binding_sha)
        try:
            lock_raw, current = stable_private(path)
            opened = os.fstat(lock)
            if (lock_raw != expected or current.st_nlink != 1 or
                    (current.st_dev, current.st_ino) != (opened.st_dev, opened.st_ino) or
                    (current.st_dev, current.st_ino) ==
                    (os.fstat(writer).st_dev, os.fstat(writer).st_ino)):
                deny("builder_preservation_lock_binding")
            report = {"schemaVersion": 1, "result": "BUILDER_PRESERVATION_LOCK_READY",
                      "created": not existed, "requestSha256": args.request_sha256,
                      "binding": binding, "bindingSha256": binding_sha,
                      "identity": {"device": current.st_dev, "inode": current.st_ino},
                      "lockSha256": digest_bytes(lock_raw), "destructiveCommands": 0}
            write_exclusive(args.report_output, canonical(report))
            print(canonical(report).decode().strip())
        finally:
            os.close(lock)
    finally:
        os.close(writer)


def prepare_builder_preservation(args: argparse.Namespace) -> None:
    request_raw, _ = stable_private(args.request, args.request_sha256)
    request = object_json(request_raw, "builder-preservation-request")
    _, _, original_raw = _closed_file_binding(request.get("contract"), "preservation:contract")
    original = object_json(original_raw, "builder-preservation-contract")
    lock = acquire_existing_lock(Path(str(request.get("deploymentLock", ""))))
    try:
        writer = acquire_existing_lock(Path(original["writerLockPath"]))
        try:
            _, operational, snapshot = preservation_snapshot(request)
            evidence_destination(args.intent_output, operational)
            intent = {"schemaVersion": 1, "kind": "PRESERVE_EXTERNAL_BUILDER",
                      "state": "SEALED_FOR_EXPLICIT_AUTHORIZATION", "request": request,
                      "snapshot": snapshot, "commands": []}
            write_exclusive(args.intent_output, canonical(intent))
            print(canonical({"result": "BUILDER_PRESERVATION_PREPARED",
                             "intentSha256": digest_bytes(canonical(intent)), "commands": [],
                             "retainedBytes": snapshot["retainedBytes"]}).decode().strip())
        finally:
            os.close(writer)
    finally:
        os.close(lock)


def record_builder_preservation(args: argparse.Namespace) -> None:
    intent_raw, _ = stable_private(args.intent, args.intent_sha256)
    authorization_raw, _ = stable_private(args.authorization, args.authorization_sha256)
    intent = object_json(intent_raw, "builder-preservation-intent")
    auth = object_json(authorization_raw, "builder-preservation-authorization")
    if (set(intent) != {"schemaVersion", "kind", "state", "request", "snapshot", "commands"} or
            intent["schemaVersion"] != 1 or intent["kind"] != "PRESERVE_EXTERNAL_BUILDER" or
            intent["state"] != "SEALED_FOR_EXPLICIT_AUTHORIZATION" or intent["commands"] != [] or
            set(auth) != {"schemaVersion", "authorizationId", "decision", "intentSha256", "approvedPaths", "owner"} or
            auth.get("schemaVersion") != 1 or auth.get("decision") != "AUTHORIZE_ONCE" or
            auth.get("intentSha256") != args.intent_sha256 or auth.get("approvedPaths") != [] or
            not isinstance(auth.get("owner"), str) or not auth["owner"].strip()):
        deny("builder_preservation_authorization")
    request = intent["request"]
    _, _, original_raw = _closed_file_binding(request["contract"], "preservation:contract")
    original = object_json(original_raw, "builder-preservation-contract")
    lock = acquire_existing_lock(Path(request["deploymentLock"]))
    try:
        writer = acquire_existing_lock(Path(original["writerLockPath"]))
        try:
            contract, operational, snapshot = preservation_snapshot(request)
            if snapshot != intent["snapshot"]:
                deny("builder_preservation_prepare_drift")
            evidence_destination(args.receipt_root, operational)
            review = Path(request["contract"]["path"]).parent / "generation-review.private.json"
            canonical_review_destination(review, Path(request["contract"]["path"]),
                                         Path(request["lifecycle"]["path"]), residue_policy(request))
            args.receipt_root.mkdir(mode=0o700)
            if snapshot["previousReviewSha256"] is not None:
                prior_raw, _ = stable_private(review, snapshot["previousReviewSha256"])
                write_exclusive(args.receipt_root / "previous-review.private.json", prior_raw)
            journal = args.receipt_root / "preservation-journal.private.jsonl"
            write_exclusive(journal, b"")
            events = [
                {"event": "PRESERVATION_OBSERVED", "intentSha256": args.intent_sha256,
                 "snapshotSha256": digest_bytes(canonical(snapshot))},
                {"event": "PRESERVATION_AUTHORIZED", "authorizationSha256": args.authorization_sha256},
                {"event": "PRESERVATION_RECORDED", "destructiveCommands": 0},
            ]
            for event in events:
                append_event(journal, event)
            receipt = {"schemaVersion": 1, "state": "PRESERVED_RETENTION_DEBT",
                       "intentSha256": args.intent_sha256, "authorizationSha256": args.authorization_sha256,
                       "journalSha256": digest_bytes(journal.read_bytes()),
                       "snapshotSha256": digest_bytes(canonical(snapshot)),
                       "historicalInventoryEquivalence": False, "destructiveCommands": 0,
                       "retainedBytes": snapshot["retainedBytes"], "responsible": request["responsible"],
                       "expiresAtUtc": request["expiresAtUtc"],
                       "preservedPaths": [item["path"] for item in snapshot["artifacts"]]}
            receipt_raw = canonical(receipt)
            write_exclusive(args.receipt_root / "preservation-receipt.private.json", receipt_raw)
            value = {"schemaVersion": 2, "generationId": contract["generationId"],
                     "lifecycleSha256": request["lifecycle"]["sha256"], "state": "PRESERVE_OVERRIDE",
                     "reviewer": auth["owner"], "reason": request["reason"],
                     "evidenceSha256": digest_bytes(receipt_raw), "retainedBytes": snapshot["retainedBytes"],
                     "responsible": request["responsible"], "expiresAtUtc": request["expiresAtUtc"]}
            replace_private(review, canonical(value))
            stable_private(review, digest_bytes(canonical(value)))
            print(canonical({"result": receipt["state"], "receiptSha256": digest_bytes(receipt_raw),
                             "reviewSha256": digest_bytes(canonical(value)), "destructiveCommands": 0}).decode().strip())
        finally:
            os.close(writer)
    finally:
        os.close(lock)


def authenticate_builder_preservation(bindings: dict[str, Any], contract: dict[str, Any],
                                      builder_policy_sha: str) -> dict[str, Any]:
    intent = object_json(bindings["intent"][2], "builder-preservation-intent")
    authorization = object_json(bindings["authorization"][2], "builder-preservation-authorization")
    receipt = object_json(bindings["receipt"][2], "builder-preservation-receipt")
    review = object_json(bindings["review"][2], "builder-preservation-review")
    if (set(intent) != {"schemaVersion", "kind", "state", "request", "snapshot", "commands"} or
            intent["schemaVersion"] != 1 or intent["kind"] != "PRESERVE_EXTERNAL_BUILDER" or
            intent["state"] != "SEALED_FOR_EXPLICIT_AUTHORIZATION" or intent["commands"] != []):
        deny("builder_preservation_intent")
    request, snapshot = intent["request"], intent["snapshot"]
    preservation_deadline(request.get("expiresAtUtc"))
    if (request.get("schemaVersion") != 1 or
            any(not isinstance(request.get(key), str) or not request[key].strip() for key in ("responsible", "reason")) or
            request.get("contract", {}).get("sha256") != bindings["contract"][1] or
            request.get("lifecycle", {}).get("sha256") != bindings["lifecycle"][1] or
            request.get("rootPolicy", {}).get("sha256") != builder_policy_sha or
            snapshot.get("releaseId") != contract["releaseId"] or snapshot.get("targetCommit") != contract["targetCommit"] or
            snapshot.get("contractSha256") != bindings["contract"][1] or
            snapshot.get("lifecycleSha256") != bindings["lifecycle"][1] or
            snapshot.get("historicalInventoryEquivalence") is not False or
            snapshot.get("accounting") != "CONSERVATIVE_SUM_OF_PER_ROOT_PHYSICAL_BYTES"):
        deny("builder_preservation_binding")
    expected = [item for item in contract["artifacts"] if item["class"] in
                {"DERIVED_WORKTREE", "DERIVED_OUTPUT_RUNTIME"}]
    observations = snapshot.get("artifacts")
    if (not isinstance(observations, list) or len(expected) != 3 or len(observations) != 3 or
            [(item.get("path"), item.get("class")) for item in observations] !=
            [(item["path"], item["class"]) for item in expected]):
        deny("builder_preservation_scope")
    for original, observed in zip(expected, observations):
        if (set(observed) != {"path", "class", "identity", "sizeBytes", "allocatedBytes", "inodes", "structuralSha256"} or
                observed["identity"] != original["observedIdentity"] or
                any(type(observed[key]) is not int or observed[key] < 0 for key in ("sizeBytes", "allocatedBytes", "inodes")) or
                not SHA256.fullmatch(str(observed["structuralSha256"]))):
            deny("builder_preservation_snapshot")
        if original["class"] != "DERIVED_WORKTREE" and any(observed[key] != original[key] for key in
                ("sizeBytes", "allocatedBytes", "inodes", "structuralSha256")):
            deny("builder_preservation_runtime_drift")
    retained = sum(item["allocatedBytes"] for item in observations)
    if (set(authorization) != {"schemaVersion", "authorizationId", "decision", "intentSha256", "approvedPaths", "owner"} or
            authorization.get("schemaVersion") != 1 or authorization.get("decision") != "AUTHORIZE_ONCE" or
            authorization.get("intentSha256") != bindings["intent"][1] or authorization.get("approvedPaths") != [] or
            not isinstance(authorization.get("owner"), str) or not authorization["owner"].strip()):
        deny("builder_preservation_authorization")
    paths = [item["path"] for item in observations]
    expected_events = [
        {"event": "PRESERVATION_OBSERVED", "intentSha256": bindings["intent"][1],
         "snapshotSha256": digest_bytes(canonical(snapshot))},
        {"event": "PRESERVATION_AUTHORIZED", "authorizationSha256": bindings["authorization"][1]},
        {"event": "PRESERVATION_RECORDED", "destructiveCommands": 0},
    ]
    if (snapshot.get("retainedBytes") != retained or _read_journal(bindings["journal"][2]) != expected_events or
            receipt != {"schemaVersion": 1, "state": "PRESERVED_RETENTION_DEBT",
                        "intentSha256": bindings["intent"][1], "authorizationSha256": bindings["authorization"][1],
                        "journalSha256": bindings["journal"][1], "snapshotSha256": digest_bytes(canonical(snapshot)),
                        "historicalInventoryEquivalence": False, "destructiveCommands": 0,
                        "retainedBytes": retained, "responsible": request["responsible"],
                        "expiresAtUtc": request["expiresAtUtc"], "preservedPaths": paths} or
            review != {"schemaVersion": 2, "generationId": contract["generationId"],
                       "lifecycleSha256": bindings["lifecycle"][1], "state": "PRESERVE_OVERRIDE",
                       "reviewer": authorization["owner"], "reason": request["reason"],
                       "evidenceSha256": bindings["receipt"][1], "retainedBytes": retained,
                       "responsible": request["responsible"], "expiresAtUtc": request["expiresAtUtc"]}):
        deny("builder_preservation_closure")
    return {"state": "PRESERVED_RETENTION_DEBT", "responsible": request["responsible"],
            "retainedBytes": retained, "expiresAtUtc": request["expiresAtUtc"], "preservedPaths": paths}


def authenticate_disposable_builder_debt(bindings: dict[str, Any], producer_contract: dict[str, Any],
                                          producer_hashes: dict[str, str],
                                          descriptor: Any) -> dict[str, Any]:
    """Authenticate EXPORTED/SUCCESS authority without fabricating a closure."""
    disposable_contract = object_json(bindings["disposableContract"][2],
                                      "disposable-builder-contract")
    disposable_lifecycle = object_json(bindings["disposableLifecycle"][2],
                                       "disposable-builder-lifecycle")
    export_receipt = object_json(bindings["exportReceipt"][2],
                                 "disposable-builder-export-receipt")
    release = producer_contract["releaseId"]
    target = producer_contract["targetCommit"]
    root = disposable_contract.get("disposableRoot")
    custody = disposable_contract.get("custodyRoot")
    root_identity = disposable_lifecycle.get("rootIdentity")
    if (disposable_contract.get("schemaVersion") != 1 or
            disposable_contract.get("generationId") != release or
            disposable_contract.get("targetCommit") != target or
            not isinstance(root, str) or not Path(root).is_absolute() or
            not isinstance(custody, str) or not Path(custody).is_absolute() or
            Path(root) == Path(custody) or Path(root) in Path(custody).parents or
            Path(custody) in Path(root).parents or
            disposable_lifecycle.get("schemaVersion") != 1 or
            disposable_lifecycle.get("generationId") != release or
            disposable_lifecycle.get("targetCommit") != target or
            disposable_lifecycle.get("contractSha256") != bindings["disposableContract"][1] or
            disposable_lifecycle.get("state") != "EXPORTED" or
            disposable_lifecycle.get("event") != "AUTHORITY_EXPORTED" or
            disposable_lifecycle.get("exportReceiptSha256") != bindings["exportReceipt"][1] or
            not isinstance(root_identity, dict) or root_identity.get("path") != root):
        deny("external_handoff_disposable_authority")
    if (export_receipt.get("schemaVersion") != 1 or
            export_receipt.get("kind") != "DISPOSABLE_BUILDER_EXPORT" or
            export_receipt.get("generationId") != release or
            export_receipt.get("contractSha256") != bindings["disposableContract"][1] or
            export_receipt.get("outcome") != "SUCCESS"):
        deny("external_handoff_disposable_export")
    artifacts = export_receipt.get("artifacts")
    if not isinstance(artifacts, list):
        deny("external_handoff_disposable_export")
    by_name = {item.get("name"): item for item in artifacts if isinstance(item, dict)}
    if set(by_name) != {"package", "manifest", "index", "generation-contract", "generation-lifecycle"}:
        deny("external_handoff_disposable_export")
    expected_hashes = {
        "package": producer_hashes["packageSha256"],
        "manifest": producer_hashes["manifestSha256"],
        "index": producer_hashes["indexSha256"],
        "generation-contract": bindings["contract"][1],
        "generation-lifecycle": bindings["lifecycle"][1],
    }
    if any(by_name[name].get("sha256") != expected or
           not isinstance(by_name[name].get("path"), str) or
           not Path(by_name[name]["path"]).is_absolute()
           for name, expected in expected_hashes.items()):
        deny("external_handoff_disposable_export")
    expected_descriptor_fields = {
        "state", "generationId", "targetCommit", "disposableRoot", "rootIdentity",
        "custodyRoot", "retainedBytes", "retainedInodes", "preservedPaths",
    }
    if (not isinstance(descriptor, dict) or set(descriptor) != expected_descriptor_fields or
            descriptor.get("state") != "PENDING_RETENTION_DEBT" or
            descriptor.get("generationId") != release or descriptor.get("targetCommit") != target or
            descriptor.get("disposableRoot") != root or descriptor.get("rootIdentity") != root_identity or
            descriptor.get("custodyRoot") != custody or descriptor.get("preservedPaths") != [root] or
            type(descriptor.get("retainedBytes")) is not int or descriptor["retainedBytes"] < 0 or
            type(descriptor.get("retainedInodes")) is not int or descriptor["retainedInodes"] < 0):
        deny("external_handoff_disposable_debt")
    return {**descriptor, "sourceState": "EXPORTED", "sourceEvent": "AUTHORITY_EXPORTED",
            "exportOutcome": "SUCCESS", "exportReceiptSha256": bindings["exportReceipt"][1],
            "disposableContractSha256": bindings["disposableContract"][1],
            "disposableLifecycleSha256": bindings["disposableLifecycle"][1]}


def authenticate_external_handoff(args: argparse.Namespace, *, verify_payload: bool) -> dict[str, Any]:
    """Verify an inert installation plus completed retirement or explicit external debt."""
    raw, _ = stable_private(args.handoff, args.handoff_sha256)
    handoff = object_json(raw, "external-handoff")
    fields = {"schemaVersion", "builderPolicy", "contract", "lifecycle",
              "intent", "authorization", "receipt", "journal", "installation",
              "packagePath", "canonicalVerifierSha256"}
    disposable_fields = {"schemaVersion", "builderPolicy", "contract", "lifecycle",
                         "disposableContract", "disposableLifecycle", "exportReceipt",
                         "retentionDebt", "installation", "packagePath", "canonicalVerifierSha256"}
    schema = handoff.get("schemaVersion")
    expected_fields = (fields | {"review"} if schema == 2 else
                       disposable_fields if schema == 3 else fields)
    if (schema not in {1, 2, 3} or set(handoff) != expected_fields or
            not SHA256.fullmatch(str(handoff.get("canonicalVerifierSha256", "")))):
        deny("external_handoff_schema")
    policy_raw, _ = stable_policy(args.root_policy, args.root_policy_sha256)
    local_policy = validate_root_policy(policy_raw, args.root_policy_sha256)
    evidence_input(args.handoff, local_policy)
    names = (["builderPolicy", "contract", "lifecycle", "disposableContract",
              "disposableLifecycle", "exportReceipt", "installation"] if schema == 3 else
             ["builderPolicy", "contract", "lifecycle", "intent", "authorization",
              "receipt", "journal", "installation"])
    if schema == 2:
        names.append("review")
    bindings = {key: _closed_file_binding(handoff[key], f"external_handoff:{key}") for key in names}
    _, builder_policy_sha, builder_policy_raw = bindings["builderPolicy"]
    builder = validate_root_policy(builder_policy_raw, builder_policy_sha)["canonicalRoots"]
    contract = object_json(bindings["contract"][2], "external-builder-contract")
    lifecycle = object_json(bindings["lifecycle"][2], "external-builder-lifecycle")
    installation = object_json(bindings["installation"][2], "external-installation")
    validate_contract(contract)
    release, target = contract["releaseId"], contract["targetCommit"]
    if (not isinstance(release, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", release) or
            not isinstance(target, str) or not re.fullmatch(r"[0-9a-f]{40}", target) or
            contract["generationId"] != release or contract["state"] != "COMPLETE" or
            lifecycle.get("schemaVersion") != 1 or lifecycle.get("generationId") != release or
            lifecycle.get("targetCommit") != target or lifecycle.get("state") != "COMPLETE"):
        deny("external_handoff_generation")
    hashes = {key: lifecycle.get(key) for key in ("packageSha256", "manifestSha256", "indexSha256")}
    if any(not isinstance(value, str) or not SHA256.fullmatch(value) for value in hashes.values()):
        deny("external_handoff_producer_hashes")
    outputs = Path(builder["outputs"])
    payload = Path(str(lifecycle.get("releaseRoot", "")))
    _strict_child(payload, outputs, "external_handoff_builder_output")
    origin_package = payload.parent / f"{release}.tar.xz"
    if (payload.name != release or lifecycle.get("package") != str(origin_package) or
            lifecycle.get("artifactContract") != str(payload.parent / "generation-artifacts.private.json") or
            contract["writerLockPath"] != str(outputs / ".generation-build.lock")):
        deny("external_handoff_builder_identity")
    protected = {
        origin_package: ("PACKAGE_PRESERVE", hashes["packageSha256"]),
        payload / "manifest.json": ("PACKAGE_PRESERVE", hashes["manifestSha256"]),
        payload / "index.sha256": ("PACKAGE_PRESERVE", hashes["indexSha256"]),
        payload.parent / "generation-lifecycle.private.json": ("EVIDENCE_PRESERVE", bindings["lifecycle"][1]),
    }
    by_path = {Path(item["path"]): item for item in contract["artifacts"]}
    if any(by_path.get(path, {}).get("class") != kind or
           by_path[path].get("digest") != {"sha256": sha}
           for path, (kind, sha) in protected.items()):
        deny("external_handoff_producer_artifacts")
    runtime = Path(builder["releases"]) / release
    if ([item["path"] for item in contract["artifacts"] if item["class"] == "RELEASE_RUNTIME"] !=
            [str(runtime)] or by_path[runtime].get("digest") != {"indexSha256": hashes["indexSha256"]}):
        deny("external_handoff_builder_runtime")
    worktrees = [item for item in contract["artifacts"] if item["class"] == "DERIVED_WORKTREE"]
    runtimes = {Path(item["path"]) for item in contract["artifacts"]
                if item["class"] == "DERIVED_OUTPUT_RUNTIME"}
    staging = [item for item in contract["artifacts"] if item["class"] == "DERIVED_STAGING"]
    if (len(worktrees) != 1 or worktrees[0].get("digest") != {"gitCommit": target} or
            runtimes != {payload / "api-runtime", payload / "frontend-runtime"} or
            any(by_path[path].get("digest") != {"indexSha256": hashes["indexSha256"]} for path in runtimes) or
            len(staging) != 1 or staging[0].get("state") != "SANITIZED" or
            staging[0].get("removedAtProducerCompletion") is not True or
            staging[0].get("digest") != {"packageSha256": hashes["packageSha256"]} or
            any(item["class"] == "PRIVATE_DATA_NEVER_RETIRE" for item in contract["artifacts"])):
        deny("external_handoff_builder_scope")
    _strict_child(Path(worktrees[0]["path"]), Path(builder["worktrees"]), "external_handoff_builder_worktree")
    _strict_child(Path(staging[0]["path"]), outputs, "external_handoff_builder_staging")
    if Path(staging[0]["path"]).parent != outputs:
        deny("external_handoff_builder_staging")
    external_debt = None
    if schema == 2:
        external_debt = authenticate_builder_preservation(bindings, contract, builder_policy_sha)
    elif schema == 3:
        external_debt = authenticate_disposable_builder_debt(
            bindings, contract, hashes, handoff["retentionDebt"])
    else:
        intent = object_json(bindings["intent"][2], "external-builder-intent")
        auth = object_json(bindings["authorization"][2], "external-builder-authorization")
        receipt = object_json(bindings["receipt"][2], "external-builder-receipt")
        if (intent.get("reconciliation") != {"chain": [], "completed": [], "subordinateAbsences": []} or
                intent.get("legacyMigration") is not None or "failedBuildWorktreeDisposition" in intent or
                (intent.get("generationId"), intent.get("releaseId"), intent.get("targetCommit"),
                 intent.get("contractSha256"), intent.get("lifecycleSha256")) !=
                (release, release, target, bindings["contract"][1], bindings["lifecycle"][1])):
            deny("external_handoff_intent_binding")
        commands = validate_intent(intent, {"canonicalRoots": builder,
                                           "controlPlaneArtifacts": intent.get("controlPlaneArtifacts"),
                                           "gitRepository": builder["repository"]}, builder_policy_sha)
        expected = [(ordinal, item) for ordinal, item in enumerate(contract["artifacts"], 1)
                    if item["class"] in {"DERIVED_WORKTREE", "DERIVED_OUTPUT_RUNTIME"}]
        paths = [item["path"] for _, item in expected]
        if ([(item["ordinal"], item["path"]) for item in commands] !=
                [(ordinal, item["path"]) for ordinal, item in expected] or
                [{key: value for key, value in item.items() if key != "retentionState"}
                 for item in intent["artifacts"]] != contract["artifacts"] or
                [item["allocatedBytes"] for item in commands] != [item["allocatedBytes"] for _, item in expected] or
                intent["executionContract"]["writerLock"] != contract["writerLockPath"]):
            deny("external_handoff_command_scope")
        if (set(auth) != {"schemaVersion", "authorizationId", "decision", "intentSha256", "approvedPaths", "owner"} or
                auth.get("schemaVersion") != 1 or auth.get("decision") != "AUTHORIZE_ONCE" or
                auth.get("intentSha256") != bindings["intent"][1] or auth.get("approvedPaths") != paths or
                not isinstance(auth.get("owner"), str) or not auth["owner"].strip()):
            deny("external_handoff_authorization")
        if (receipt.get("schemaVersion") != 1 or receipt.get("state") != "SANITIZED" or
                receipt.get("intentSha256") != bindings["intent"][1] or
                receipt.get("commandLogSha256") != bindings["journal"][1] or
                receipt.get("remainingDerivedPaths") != [] or receipt.get("removedPaths") != paths or
                receipt.get("attemptedCommands") != len(paths) or receipt.get("completedCommands") != len(paths) or
                receipt.get("failurePredicate", "missing") is not None or receipt.get("automaticRetry") is not False or
                receipt.get("lock") != {"canonicalHeldThroughReceiptFsync": True, "writerHeldThroughReceiptFsync": True}):
            deny("external_handoff_retention_incomplete")
        events = _read_journal(bindings["journal"][2])
        if len(events) != 3 * len(commands):
            deny("external_handoff_journal_scope")
        for offset, command in enumerate(commands):
            attempt, result, verified = events[3 * offset:3 * offset + 3]
            ordinal = command["ordinal"]
            if (attempt != {"event": "ATTEMPT", "ordinal": ordinal, "path": command["path"], "argv": command["argv"]} or
                    set(result) != {"event", "ordinal", "exitCode", "stdoutSha256", "stderrSha256"} or
                    result.get("event") != "RESULT" or result.get("ordinal") != ordinal or
                    any(not SHA256.fullmatch(str(result[key])) for key in ("stdoutSha256", "stderrSha256")) or
                    type(result.get("exitCode")) is not int or result["exitCode"] != 0 or
                    verified != {"event": "VERIFIED", "ordinal": ordinal, "absent": True}):
                deny("external_handoff_journal_order")
    local_releases = authenticate_policy_root(local_policy, "releases")[0]
    installed = local_releases / release
    physical_keys = ROOT_KEYS - {"evidence"}
    source_roots = [Path(builder[key]) for key in physical_keys]
    destination_roots = [Path(local_policy["canonicalRoots"][key]) for key in physical_keys]
    if any(source == destination or source in destination.parents or destination in source.parents
           for source in source_roots for destination in destination_roots):
        deny("external_handoff_host_roots_overlap")
    for path, _, _ in bindings.values():
        evidence_input(path, local_policy)
    if (installation.get("result") != "RELEASE INSTALLED" or
            installation.get("releaseId") != release or installation.get("targetCommit") != target or
            installation.get("releasePath") != str(installed) or
            any(installation.get(key) != value for key, value in hashes.items())):
        deny("external_handoff_installation_binding")
    package = Path(str(handoff["packagePath"]))
    if package.name != origin_package.name:
        deny("external_handoff_package_name")
    evidence_input(package, local_policy)
    stable_external_package(package, hashes["packageSha256"])
    if _path_has_symlink(installed, local_releases):
        deny("external_handoff_installation_path")
    if verify_payload:
        verification = _run_legacy_verifier(
            {"targetCommit": target, "releaseId": release,
             "canonicalVerifierSha256": handoff["canonicalVerifierSha256"],
             "manifest": {"sha256": hashes["manifestSha256"]}, "index": {"sha256": hashes["indexSha256"]}},
            ["--release-root", str(installed)], "external_handoff_installation_verification")
        if any(verification.get(key) != installation.get(key)
               for key in ("apiEntrySha256", "buildId", "indexEntries")):
            deny("external_handoff_installed_payload")
    else:
        stable_regular_hash(installed / "manifest.json", hashes["manifestSha256"], "external_handoff_manifest")
        stable_regular_hash(installed / "index.sha256", hashes["indexSha256"], "external_handoff_index")
    return {"releaseId": release, "targetCommit": target, "installedPath": str(installed),
            "handoffSha256": args.handoff_sha256,
            "builderReceiptSha256": (bindings["receipt"][1] if "receipt" in bindings else
                                      bindings["exportReceipt"][1]),
            "installationSha256": bindings["installation"][1],
            **({"externalRetentionDebt": external_debt} if external_debt is not None else {}), **hashes}


def verify_external_handoff(args: argparse.Namespace) -> None:
    evidence = authenticate_external_handoff(args, verify_payload=True)
    print(canonical({"result": "EXTERNAL_HANDOFF_EVIDENCE_VERIFIED", **evidence}).decode().strip())


def materialize_external_retirement(args: argparse.Namespace) -> None:
    evidence = authenticate_external_handoff(args, verify_payload=True)
    policy_raw, _ = stable_policy(args.root_policy, args.root_policy_sha256)
    policy = validate_root_policy(policy_raw, args.root_policy_sha256)
    outputs = authenticate_policy_root(policy, "outputs")[0]
    release, target = evidence["releaseId"], evidence["targetCommit"]
    directory = outputs / f"{release}-external-import"
    lock = outputs / ".generation-build.lock"
    lifecycle_path = directory / "generation-lifecycle.private.json"
    contract_path = directory / "generation-artifacts.private.json"
    lifecycle = {"schemaVersion": 1, "generationId": release, "targetCommit": target,
                 "state": "COMPLETE", "classification": "PENDING", "dispositionState": "OPEN",
                 "externalHandoff": {"path": str(args.handoff), "sha256": args.handoff_sha256},
                 "externalEvidence": evidence}
    lifecycle_raw = canonical(lifecycle)
    installed = Path(evidence["installedPath"])
    info = installed.lstat()
    identity = {"device": info.st_dev, "inode": info.st_ino}
    metrics = structural_metrics(installed)
    artifact_fields = {"releaseId": release, "targetCommit": target,
                       "initialIdentity": None, "observedIdentity": None}
    contract = {
        "schemaVersion": 1, "generationId": release, "releaseId": release,
        "targetCommit": target, "state": "COMPLETE", "writerLockPath": str(lock),
        "classes": sorted(PRESERVE_CLASSES | DERIVED_CLASSES | {"RELEASE_RUNTIME"}),
        "privateDataPolicy": "PRIVATE_DATA_NEVER_RETIRE",
        "privateDataOverlay": {"path": "api-runtime/.data", "classification": "PRIVATE_DATA_NEVER_RETIRE",
                               "state": "ACTIVE_DEPENDENCY", "retirableOn": "NEVER_AUTOMATIC"},
        "artifacts": [
            {**artifact_fields, "path": str(lifecycle_path), "class": "EVIDENCE_PRESERVE",
             "expectedType": "regular_file", "state": "ACTIVE_DEPENDENCY", "retirableOn": "NEVER_AUTOMATIC",
             "dependencies": ["external_handoff"], "digest": {"sha256": digest_bytes(lifecycle_raw)},
             "sizeBytes": len(lifecycle_raw), "allocatedBytes": 0, "inodes": 1, "structuralSha256": None},
            {**artifact_fields, **metrics, "path": str(installed), "class": "RELEASE_RUNTIME",
             "expectedType": "directory", "state": "CANDIDATE_PENDING_ACTIVATION",
             "retirableOn": "OUTSIDE_ACTIVE_ROLLBACK_TRANSITIVE_GRAPH", "dependencies": ["active_rollback_graph"],
             "initialIdentity": identity, "observedIdentity": identity, "structuralSha256": None,
             "digest": {"indexSha256": evidence["indexSha256"]}},
        ],
    }
    fd = acquire_existing_lock(lock)
    try:
        # The directory and both records are exclusive. A partial generation
        # remains visible to the lifecycle inventory and must be reconciled.
        directory.mkdir(mode=0o700)
        fsync_dir(outputs)
        write_exclusive(lifecycle_path, lifecycle_raw)
        lifecycle_info = lifecycle_path.lstat()
        lifecycle_identity = {"device": lifecycle_info.st_dev, "inode": lifecycle_info.st_ino}
        contract["artifacts"][0].update(
            **structural_metrics(lifecycle_path), initialIdentity=lifecycle_identity,
            observedIdentity=lifecycle_identity)
        contract_raw = canonical(contract)
        write_exclusive(contract_path, contract_raw)
    finally:
        os.close(fd)
    print(canonical({"result": "EXTERNAL_RETIREMENT_MATERIALIZED", "releaseId": release,
                     "contract": str(contract_path), "contractSha256": digest_bytes(contract_raw),
                     "lifecycle": str(lifecycle_path), "lifecycleSha256": digest_bytes(lifecycle_raw)}).decode().strip())


def authenticate_external_projection(contract: dict[str, Any], lifecycle: dict[str, Any],
                                     contract_path: Path, lifecycle_path: Path,
                                     lifecycle_sha: str, args: argparse.Namespace) -> dict[str, Any]:
    binding = lifecycle.get("externalHandoff")
    if not isinstance(binding, dict) or set(binding) != {"path", "sha256"}:
        deny("external_projection_binding")
    evidence = authenticate_external_handoff(argparse.Namespace(
        handoff=Path(str(binding["path"])), handoff_sha256=binding["sha256"],
        root_policy=args.root_policy, root_policy_sha256=args.root_policy_sha256),
        verify_payload=False)
    release, target = evidence["releaseId"], evidence["targetCommit"]
    policy_raw, _ = stable_policy(args.root_policy, args.root_policy_sha256)
    policy = validate_root_policy(policy_raw, args.root_policy_sha256)
    outputs = Path(policy["canonicalRoots"]["outputs"])
    if (lifecycle.get("externalEvidence") != evidence or lifecycle.get("targetCommit") != target or
            contract["releaseId"] != release or contract["targetCommit"] != target or
            contract_path.parent != outputs / f"{release}-external-import" or
            contract["writerLockPath"] != str(outputs / ".generation-build.lock")):
        deny("external_projection_identity")
    expected = [
        (str(lifecycle_path), "EVIDENCE_PRESERVE", {"sha256": lifecycle_sha}),
        (evidence["installedPath"], "RELEASE_RUNTIME", {"indexSha256": evidence["indexSha256"]}),
    ]
    if [(item["path"], item["class"], item["digest"]) for item in contract["artifacts"]] != expected:
        deny("external_projection_scope")
    for artifact in contract["artifacts"]:
        authenticate_artifact(artifact)
    return evidence


def check_external_retirement(args: argparse.Namespace) -> None:
    intent_raw, _ = stable_private(args.intent, args.intent_sha256)
    intent = object_json(intent_raw, "external-projection-intent")
    if intent.get("commands") != [] or intent.get("externalHandoff") is None:
        deny("external_projection_intent")
    evidence = authenticate_external_retirement_intent(args, intent)
    auth_raw, _ = stable_private(args.authorization, args.authorization_sha256)
    authorization = object_json(auth_raw, "external-projection-authorization")
    if (set(authorization) != {"schemaVersion", "authorizationId", "decision", "intentSha256",
                               "approvedPaths", "owner"} or
            authorization.get("schemaVersion") != 1 or authorization.get("decision") != "AUTHORIZE_ONCE" or
            authorization.get("intentSha256") != args.intent_sha256 or authorization.get("approvedPaths") != [] or
            not isinstance(authorization.get("owner"), str) or not authorization["owner"].strip()):
        deny("external_projection_authorization")
    print(canonical({"result": "EXTERNAL_RETIREMENT_READY", "intentSha256": args.intent_sha256,
                     **{key: evidence[key] for key in ("releaseId", "targetCommit", "installedPath",
                                                       "manifestSha256", "indexSha256")}}).decode().strip())


def authenticate_external_retirement_intent(args: argparse.Namespace, intent: dict[str, Any]) -> dict[str, Any]:
    artifacts = intent.get("artifacts")
    if (not isinstance(artifacts, list) or len(artifacts) != 2 or
            any(not isinstance(item, dict) or not isinstance(item.get("path"), str) for item in artifacts)):
        deny("external_projection_intent")
    lifecycle_path = Path(artifacts[0]["path"])
    contract_path = lifecycle_path.parent / "generation-artifacts.private.json"
    contract_raw, _ = stable_private(contract_path, intent["contractSha256"])
    lifecycle_raw, _ = stable_private(lifecycle_path, intent["lifecycleSha256"])
    contract = object_json(contract_raw, "external-projection-contract")
    lifecycle = object_json(lifecycle_raw, "external-projection-lifecycle")
    validate_contract(contract)
    if (intent.get("state") != "SEALED_FOR_EXPLICIT_AUTHORIZATION" or
            intent.get("authorizationGranted") is not False or
            intent.get("rootPolicySha256") != args.root_policy_sha256 or
            intent.get("reviewOutput") != str(lifecycle_path.parent / "generation-review.private.json") or
            intent.get("commandsSha256") != digest_bytes(b"") or
            intent.get("reconciliation") != {"chain": [], "completed": [], "subordinateAbsences": []} or
            not isinstance(intent.get("executionContract"), dict) or
            intent["executionContract"].get("canonicalLock") != str(args.deployment_lock) or
            intent["executionContract"].get("writerLock") != contract["writerLockPath"] or
            any(intent.get(key) != contract.get(key) for key in ("generationId", "releaseId", "targetCommit")) or
            intent.get("externalHandoff") != lifecycle.get("externalHandoff") or
            intent.get("commands") != [] or
            [{key: value for key, value in item.items() if key != "retentionState"} for item in artifacts]
            != contract["artifacts"]):
        deny("external_projection_intent")
    return authenticate_external_projection(contract, lifecycle, contract_path, lifecycle_path,
                                            intent["lifecycleSha256"], args)


def stable_external_package(path: Path, expected_sha: str) -> None:
    try:
        before = path.lstat()
        if (not stat.S_ISREG(before.st_mode) or before.st_uid != os.geteuid() or
                stat.S_IMODE(before.st_mode) & 0o022):
            deny("external_handoff_package_identity")
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(fd, "rb") as stream:
            opened = os.fstat(stream.fileno())
            if not stat.S_ISREG(opened.st_mode):
                deny("external_handoff_package_identity")
            digest = hashlib.sha256()
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(block)
            after = path.lstat()
    except OSError:
        deny("external_handoff_package_read")
    identity = lambda item: (item.st_dev, item.st_ino, item.st_mode, item.st_size,
                             item.st_mtime_ns, item.st_ctime_ns)
    if (identity(before) != identity(opened) or
            identity(before) != identity(after) or digest.hexdigest() != expected_sha):
        deny("external_handoff_package_hash_or_drift")


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


def _historical_file_sha256(path: Path, predicate: str) -> str:
    try:
        before = path.lstat()
        if path.is_symlink() or not stat.S_ISREG(before.st_mode):
            deny(f"{predicate}_identity")
        digest = hashlib.sha256()
        with path.open("rb") as source:
            for block in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(block)
        after = path.lstat()
    except OSError:
        deny(f"{predicate}_read")
    identity = lambda item: (item.st_dev, item.st_ino, item.st_mode, item.st_size,
                             item.st_mtime_ns, item.st_ctime_ns)
    if identity(before) != identity(after):
        deny(f"{predicate}_drift")
    return digest.hexdigest()


def _historical_hash_manifest(raw: bytes, predicate: str) -> dict[str, str]:
    try:
        lines = raw.decode().splitlines()
    except UnicodeDecodeError:
        deny(f"{predicate}_encoding")
    result: dict[str, str] = {}
    for line in lines:
        fields = line.split("  ", 1)
        if (len(fields) != 2 or not SHA256.fullmatch(fields[0]) or
                not fields[1] or Path(fields[1]).is_absolute() or
                ".." in Path(fields[1]).parts or fields[1] in result):
            deny(f"{predicate}_schema")
        result[fields[1]] = fields[0]
    if not result:
        deny(f"{predicate}_empty")
    return result


def _verify_historical_hashes(root: Path, values: dict[str, str], predicate: str) -> None:
    for relative, expected in values.items():
        path = root / relative
        if _historical_file_sha256(path, predicate) != expected:
            deny(f"{predicate}_content")


def _historical_leaf_map(root: Path, predicate: str) -> dict[str, tuple[Any, ...]]:
    """Hash each leaf once; directory metadata is intentionally excluded.

    The lineage proof compares bytes, executable modes and symlink targets.  It
    does not confuse copied directory mtimes with content differences.
    """
    result: dict[str, tuple[Any, ...]] = {}
    digest_cache: dict[tuple[int, int, int, int], str] = {}
    try:
        items = sorted(root.rglob("*"), key=lambda item: os.fsencode(
            item.relative_to(root).as_posix()))
    except OSError:
        deny(f"{predicate}_walk")
    for item in items:
        try:
            info = item.lstat()
        except OSError:
            deny(f"{predicate}_walk")
        relative = item.relative_to(root).as_posix()
        mode = stat.S_IMODE(info.st_mode)
        if stat.S_ISDIR(info.st_mode):
            continue
        if stat.S_ISLNK(info.st_mode):
            result[relative] = ("symlink", mode, os.readlink(item))
        elif stat.S_ISREG(info.st_mode):
            identity = (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns)
            digest = digest_cache.get(identity)
            if digest is None:
                digest = _historical_file_sha256(item, predicate)
                digest_cache[identity] = digest
            result[relative] = ("regular", mode, digest)
        else:
            result[relative] = ("other", mode, info.st_rdev)
    return result


def _historical_manifest_delta(raw: bytes, predicate: str) -> tuple[dict[str, Any], set[str]]:
    value = object_json(raw, predicate)
    files = value.get("apiFiles")
    if not isinstance(files, list) or not files:
        deny(f"{predicate}_schema")
    allowed: set[str] = set()
    for item in files:
        required = {"source", "compiled", "sourceAfterSha256", "sourceBeforeSha256",
                    "compiledSha256"}
        if (not isinstance(item, dict) or set(item) != required or
                not SHA256.fullmatch(str(item.get("sourceAfterSha256", ""))) or
                item.get("sourceBeforeSha256") is not None and
                not SHA256.fullmatch(str(item.get("sourceBeforeSha256", ""))) or
                not SHA256.fullmatch(str(item.get("compiledSha256", "")))):
            deny(f"{predicate}_schema")
        for key in ("source", "compiled"):
            relative = item.get(key)
            if (not isinstance(relative, str) or not relative or Path(relative).is_absolute() or
                    ".." in Path(relative).parts or relative in allowed):
                deny(f"{predicate}_schema")
            allowed.add(relative)
    return value, allowed


def _verify_historical_delta(parent: Path, child: Path, parent_map: dict[str, tuple[Any, ...]],
                             child_map: dict[str, tuple[Any, ...]], raw: bytes,
                             predicate: str) -> dict[str, Any]:
    manifest, allowed = _historical_manifest_delta(raw, predicate)
    observed = {key for key in set(parent_map) | set(child_map)
                if parent_map.get(key) != child_map.get(key)}
    if observed != allowed:
        deny(f"{predicate}_unmanifested_difference")
    for item in manifest["apiFiles"]:
        if (_historical_file_sha256(child / item["source"], predicate) !=
                item["sourceAfterSha256"] or
                _historical_file_sha256(child / item["compiled"], predicate) !=
                item["compiledSha256"]):
            deny(f"{predicate}_after")
        before = item["sourceBeforeSha256"]
        parent_source = parent / item["source"]
        if before is None:
            if parent_source.exists() or parent_source.is_symlink():
                deny(f"{predicate}_before")
        elif _historical_file_sha256(parent_source, predicate) != before:
            deny(f"{predicate}_before")
    return {"manifestSha256": digest_bytes(raw), "changedPaths": len(observed)}


def _historical_external_data_link(release: Path, expected: str, predicate: str) -> dict[str, str]:
    link = release / "apps/whatsapp-agent/.data"
    try:
        info = link.lstat()
        target = os.readlink(link)
    except OSError:
        deny(f"{predicate}_private_data_link")
    if not stat.S_ISLNK(info.st_mode) or target != expected:
        deny(f"{predicate}_private_data_link")
    return {"path": str(link), "target": target, "classification": "EXTERNAL_DATA_PRESERVE"}


def qualify_legacy_precontract_five(args: argparse.Namespace) -> None:
    binding = LEGACY_PRECONTRACT_FIVE_BATCH
    if binding.get("schemaVersion") != 1 or not binding.get("batchId"):
        deny("legacy_precontract_binding")
    if args.inventory_sha256 != binding["sourceInventorySha256"]:
        deny("legacy_precontract_inventory_binding")
    inventory_raw, _ = stable_private(args.inventory, args.inventory_sha256)
    inventory = object_json(inventory_raw, "legacy-precontract-inventory")
    inventory_targets = inventory.get("targets")
    if not isinstance(inventory_targets, dict):
        deny("legacy_precontract_inventory_schema")

    graph_binding = binding["sourceGraph"]
    graph_raw, _ = stable_regular_hash(Path(graph_binding["path"]), graph_binding["sha256"],
                                       "legacy_precontract_graph")
    graph = object_json(graph_raw, "legacy-precontract-graph")
    graph_lists = ("activeReleases", "rollbackReleases", "transitiveReturnReleases",
                   "candidateReleases", "installedVerifiedReleases")
    if any(not isinstance(graph.get(key), list) for key in graph_lists):
        deny("legacy_precontract_graph_schema")
    immediate = graph.get("immediateRollbackReleases", {})
    if not isinstance(immediate, dict):
        deny("legacy_precontract_graph_schema")

    af26_raw, _ = stable_regular_hash(Path(binding["af26Manifest"]["path"]),
                                      binding["af26Manifest"]["sha256"],
                                      "legacy_precontract_af26_manifest")
    af26 = object_json(af26_raw, "legacy-precontract-af26")
    file_hashes = af26.get("fileHashes")
    artifacts = af26.get("artifacts")
    if (not isinstance(file_hashes, dict) or not isinstance(artifacts, dict) or
            not isinstance(file_hashes.get("api"), dict) or
            not isinstance(file_hashes.get("frontend"), dict)):
        deny("legacy_precontract_af26_schema")

    authority_raw: dict[str, bytes] = {}
    authority_bindings: list[dict[str, str]] = [binding["af26Manifest"]]
    for name in ("manifest", "sourceManifest", "compiledManifest", "archive"):
        item = binding["r879"][name]
        raw, _ = stable_regular_hash(Path(item["path"]), item["sha256"],
                                     f"legacy_precontract_r879_{name}")
        authority_raw[f"r879.{name}"] = raw
        authority_bindings.append(item)
    for name in ("b9Manifest", "afbbManifest"):
        item = binding[name]
        raw, _ = stable_regular_hash(Path(item["path"]), item["sha256"],
                                     f"legacy_precontract_{name}")
        authority_raw[name] = raw
        authority_bindings.append(item)
    r879_manifest = object_json(authority_raw["r879.manifest"], "legacy-precontract-r879")
    if (r879_manifest.get("tarSha256") != binding["r879"]["archive"]["sha256"] or
            r879_manifest.get("baselineApi") != binding["releases"][0]["installedReleasePath"] or
            r879_manifest.get("candidateApi") != binding["releases"][2]["installedReleasePath"] or
            r879_manifest.get("unchangedFrontend") != binding["releases"][1]["installedReleasePath"]):
        deny("legacy_precontract_r879_schema")

    descriptors = {item["releaseId"]: item for item in binding["releases"]}
    qualified: list[dict[str, Any]] = []
    protected: list[dict[str, str]] = []
    content_maps: dict[str, dict[str, tuple[Any, ...]]] = {}
    authority_ok: dict[str, bool] = {}

    def attempt(descriptor: dict[str, Any], verifier: Any) -> None:
        release = descriptor["releaseId"]
        path = Path(descriptor["installedReleasePath"])
        try:
            row = inventory_targets.get(str(path))
            if (not isinstance(row, dict) or row.get("present") is not True or
                    row.get("device") != descriptor["device"] or
                    row.get("inode") != descriptor["inode"] or
                    row.get("physicalBytes") != descriptor["allocatedBytes"]):
                deny("inventory_identity")
            info = path.lstat()
            if (not stat.S_ISDIR(info.st_mode) or info.st_dev != descriptor["device"] or
                    info.st_ino != descriptor["inode"] or info.st_uid != os.geteuid() or
                    stat.S_IMODE(info.st_mode) != 0o700):
                deny("runtime_identity")
            if (release not in graph["installedVerifiedReleases"] or
                    any(release in graph[key] for key in graph_lists[:-1]) or
                    release in immediate.values()):
                deny("runtime_referenced")
            evidence = verifier(path)
            metrics = structural_metrics(path)
            if metrics["allocatedBytes"] != descriptor["allocatedBytes"]:
                deny("runtime_allocated_bytes")
            qualified.append({"releaseId": release, "targetCommit": descriptor["targetCommit"],
                              "path": str(path), **metrics, "classification": "RETIREMENT_READY",
                              "component": descriptor["component"],
                              "authority": descriptor["authority"], "authorityEvidence": evidence})
            authority_ok[release] = True
        except Denied as error:
            authority_ok[release] = False
            protected.append({"releaseId": release, "path": str(path),
                              "predicate": str(error)})

    af26_api = binding["releases"][0]
    af26_front = binding["releases"][1]
    r879 = binding["releases"][2]
    b9 = binding["releases"][3]
    afbb_descriptor = binding["releases"][4]

    def verify_af26(path: Path, component: str) -> dict[str, Any]:
        scope = "api" if component == "api" else "frontend"
        prefix = Path("apps/whatsapp-agent/dist") if scope == "api" else Path(".next")
        values = file_hashes[scope]
        if (artifacts.get(scope, {}).get("path") != str(path) or
                artifacts.get(scope, {}).get("fileCount") != len(values)):
            deny(f"af26_{scope}_schema")
        normalized = {}
        for relative, digest in values.items():
            if not isinstance(relative, str) or not SHA256.fullmatch(str(digest)):
                deny(f"af26_{scope}_schema")
            normalized[(prefix / relative).as_posix()] = digest
        _verify_historical_hashes(path, normalized, f"af26_{scope}")
        observed = {relative for relative in _historical_leaf_map(
            path, f"af26_{scope}_inventory") if relative.startswith(prefix.as_posix() + "/")}
        missing = set(normalized) - observed
        extra = observed - set(normalized)
        allowed_cache = (scope == "frontend" and all(
            item.startswith(".next/cache/images/") for item in extra))
        if missing or extra and not allowed_cache:
            deny(f"af26_{scope}_unmanifested_executable")
        return {"manifestSha256": binding["af26Manifest"]["sha256"],
                "verifiedFiles": len(normalized),
                "derivedRuntimeCacheFiles": len(extra)}

    attempt(af26_api, lambda path: {**verify_af26(path, "api"),
        "externalData": _historical_external_data_link(
            path, binding["externalDataTarget"], "af26_api")})
    attempt(af26_front, lambda path: verify_af26(path, "frontend"))

    def verify_879(path: Path) -> dict[str, Any]:
        if not authority_ok.get(af26_api["releaseId"]):
            deny("r879_parent_authority")
        source_values = _historical_hash_manifest(authority_raw["r879.sourceManifest"],
                                                  "r879_source_manifest")
        compiled_values = _historical_hash_manifest(authority_raw["r879.compiledManifest"],
                                                    "r879_compiled_manifest")
        _verify_historical_hashes(path, source_values, "r879_source")
        _verify_historical_hashes(path, compiled_values, "r879_compiled")
        parent = Path(af26_api["installedReleasePath"])
        if str(parent) not in content_maps:
            content_maps[str(parent)] = _historical_leaf_map(parent, "af26_map")
        if str(path) not in content_maps:
            content_maps[str(path)] = _historical_leaf_map(path, "r879_map")
        parent_map = content_maps[str(parent)]
        child_map = content_maps[str(path)]
        current_entries = {key for key in child_map if key.startswith(
            ("apps/whatsapp-agent/src/", "apps/whatsapp-agent/dist/"))}
        if current_entries != set(source_values) | set(compiled_values):
            deny("r879_unmanifested_current")
        current_prefixes = ("apps/whatsapp-agent/src/", "apps/whatsapp-agent/dist/")
        outside = {key for key in set(parent_map) | set(child_map)
                   if parent_map.get(key) != child_map.get(key) and
                   not key.startswith(current_prefixes)}
        preserved = {f"apps/whatsapp-agent/src.af26-preserved/{key.removeprefix('apps/whatsapp-agent/src/')}"
                     for key in parent_map if key.startswith("apps/whatsapp-agent/src/")}
        preserved |= {f"apps/whatsapp-agent/dist.af26-preserved/{key.removeprefix('apps/whatsapp-agent/dist/')}"
                      for key in parent_map if key.startswith("apps/whatsapp-agent/dist/")}
        if outside != preserved:
            deny("r879_unmanifested_difference")
        for relative in preserved:
            if "/src.af26-preserved/" in relative:
                original = relative.replace("/src.af26-preserved/", "/src/", 1)
            else:
                original = relative.replace("/dist.af26-preserved/", "/dist/", 1)
            if child_map.get(relative) != parent_map.get(original):
                deny("r879_preserved_baseline")
        return {"manifestSha256": binding["r879"]["manifest"]["sha256"],
                "sourceManifestSha256": binding["r879"]["sourceManifest"]["sha256"],
                "compiledManifestSha256": binding["r879"]["compiledManifest"]["sha256"],
                "archiveSha256": binding["r879"]["archive"]["sha256"],
                "verifiedFiles": len(source_values) + len(compiled_values),
                "preservedBaselineFiles": len(preserved),
                "externalData": _historical_external_data_link(
                    path, binding["externalDataTarget"], "r879")}

    attempt(r879, verify_879)

    def verify_delta(descriptor: dict[str, Any], parent_descriptor: dict[str, Any],
                     raw_key: str, predicate: str) -> Any:
        def verifier(path: Path) -> dict[str, Any]:
            if not authority_ok.get(parent_descriptor["releaseId"]):
                deny(f"{predicate}_parent_authority")
            parent = Path(parent_descriptor["installedReleasePath"])
            if str(parent) not in content_maps:
                content_maps[str(parent)] = _historical_leaf_map(parent, predicate)
            if str(path) not in content_maps:
                content_maps[str(path)] = _historical_leaf_map(path, predicate)
            parent_map = content_maps[str(parent)]
            child_map = content_maps[str(path)]
            result = _verify_historical_delta(parent, path, parent_map, child_map,
                                              authority_raw[raw_key], predicate)
            result["externalData"] = _historical_external_data_link(
                path, binding["externalDataTarget"], predicate)
            return result
        return verifier

    attempt(b9, verify_delta(b9, r879, "b9Manifest", "b9_lineage"))
    attempt(afbb_descriptor, verify_delta(afbb_descriptor, b9, "afbbManifest", "afbb_lineage"))

    total = sum(item["allocatedBytes"] for item in qualified)
    proof = {"schemaVersion": 1, "kind": "LEGACY_PRECONTRACT_BATCH_QUALIFICATION",
             "batchId": binding["batchId"],
             "sourceInventorySha256": binding["sourceInventorySha256"],
             "sourceGraph": graph_binding, "authorityFiles": authority_bindings,
             "releases": qualified, "protectedReleases": protected,
             "totalAllocatedBytes": total,
             "capacityBudget": {"custodyAndClosureReserveBytes": LEGACY_P00_CUSTODY_RESERVE_BYTES,
                                "grossRecoverableBytes": total,
                                "netRecoverableBytes": max(0, total - LEGACY_P00_CUSTODY_RESERVE_BYTES)},
             "authorizationGranted": False, "executionPermitted": False,
             "destructiveCommands": 0,
             "nextRequiredStep": "CANONICAL_CONTRACT_LIFECYCLE_MATERIALIZATION"}
    write_exclusive(args.proof_output, canonical(proof))
    print(canonical({"result": "LEGACY_PRECONTRACT_BATCH_QUALIFIED",
                     "batchId": binding["batchId"], "qualifiedCount": len(qualified),
                     "protectedCount": len(protected), "totalAllocatedBytes": total,
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
        external = "externalHandoff" in lifecycle
        if external:
            authenticate_external_projection(contract, lifecycle, args.contract, args.lifecycle,
                                             args.lifecycle_sha256, args)
            if (contract["releaseId"] not in operational["candidateReleases"] or
                    contract["releaseId"] not in operational["installedVerifiedReleases"] or
                    contract["releaseId"] in operational["activeReleases"]):
                deny("external_projection_candidate")
        failed_build_worktree = authenticate_failed_build_worktree_disposition(
            contract, lifecycle, operational, args.contract, args.contract_sha256,
            args.lifecycle, args.lifecycle_sha256)
        failed_absent_paths = (set(failed_build_worktree["absentArtifactPaths"])
                               if failed_build_worktree is not None else set())
        classified = []
        commands = []
        for artifact in contract["artifacts"]:
            if (artifact["path"] not in reconciled_paths and
                    artifact["path"] not in failed_absent_paths):
                authenticate_artifact(artifact)
            state = ("SANITIZED" if artifact["path"] in reconciled_paths else
                     classify(artifact, contract, operational, failed_build_worktree))
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
        if "worktreeResidueReconciliation" in contract:
            derived = [item for item in commands if item["class"] in
                       {"DERIVED_WORKTREE", "DERIVED_OUTPUT_RUNTIME"}]
            if (len(commands) != 3 or len(derived) != 3 or
                    [item["class"] for item in commands].count("DERIVED_WORKTREE") != 1 or
                    [item["class"] for item in commands].count("DERIVED_OUTPUT_RUNTIME") != 2):
                deny("residue_successor_command_scope")
            intent["residueSuccessorInputs"] = {
                "contract": {"path": str(args.contract), "sha256": args.contract_sha256},
                "lifecycle": {"path": str(args.lifecycle), "sha256": args.lifecycle_sha256},
            }
        if failed_build_worktree is not None:
            intent["failedBuildWorktreeDisposition"] = failed_build_worktree
        if external:
            if commands:
                deny("external_projection_command_scope")
            intent["externalHandoff"] = lifecycle["externalHandoff"]
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
    optional = {"failedBuildWorktreeDisposition", "externalHandoff", "residueSuccessorInputs"}
    if (not required.issubset(intent) or not set(intent).issubset(required | optional) or
            intent.get("schemaVersion") != 3 or
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
    failed_build_worktree = intent.get("failedBuildWorktreeDisposition")
    if failed_build_worktree is not None:
        if (not isinstance(failed_build_worktree, dict) or
                failed_build_worktree.get("kind") !=
                FAILED_BUILD_WORKTREE_BINDING["kind"] or
                failed_build_worktree.get("destructiveScope") !=
                [failed_build_worktree.get("worktreePath")]):
            deny("intent_failed_build_worktree")
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
    if failed_build_worktree is not None:
        expected_scope = failed_build_worktree["destructiveScope"]
        if ([item["path"] for item in commands] != expected_scope or
                len(commands) != 1 or
                commands[0]["class"] != "DERIVED_WORKTREE"):
            deny("intent_failed_build_worktree_commands")
    if "externalHandoff" in intent and (commands or failed_build_worktree is not None or
            intent["reconciliation"] != {"chain": [], "completed": [], "subordinateAbsences": []}):
        deny("external_projection_command_scope")
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
    successor_inputs = intent.get("residueSuccessorInputs")
    if successor_inputs is not None:
        if not isinstance(successor_inputs, dict) or set(successor_inputs) != {"contract", "lifecycle"}:
            deny("residue_successor_inputs")
        contract_path, contract_sha, _ = _closed_file_binding(successor_inputs["contract"], "residue:successor-contract")
        lifecycle_path, lifecycle_sha, _ = _closed_file_binding(successor_inputs["lifecycle"], "residue:successor-lifecycle")
        if (contract_sha != intent["contractSha256"] or lifecycle_sha != intent["lifecycleSha256"]):
            deny("residue_successor_inputs")
    persisted_contract_raw, _ = stable_private(contract_path, intent["contractSha256"])
    persisted_lifecycle_raw, _ = stable_private(lifecycle_path, intent["lifecycleSha256"])
    persisted_contract = object_json(persisted_contract_raw, "artifact-contract")
    persisted_lifecycle = object_json(persisted_lifecycle_raw, "generation-lifecycle")
    if successor_inputs is not None:
        validate_contract(persisted_contract)
        if ("worktreeResidueReconciliation" not in persisted_contract or
                [{key: value for key, value in item.items() if key != "retentionState"}
                 for item in intent["artifacts"]] != persisted_contract["artifacts"]):
            deny("residue_successor_intent")
    canonical_review_destination(args.review_output, contract_path, lifecycle_path, policy)
    if str(args.review_output) != intent["reviewOutput"]:
        deny("intent_review_output")
    canonical_fd = acquire_or_authenticate_lock(
        args.deployment_lock, getattr(args, "deployment_lock_fd", None), args.intent_sha256)
    writer_fd = acquire_existing_lock(Path(intent["executionContract"]["writerLock"]))
    attempted = completed = 0
    removed: list[str] = []
    external_debt = None
    receipt_state = "DEPLOYED_SANITIZED" if operational["deploymentState"]["state"] == "DEPLOYED" else "SANITIZED"
    try:
        # These observations happen only after both locks and before the first
        # ATTEMPT. A stale prepare snapshot cannot authorize a deletion.
        validate_artifact_roots({"artifacts": intent["artifacts"]}, operational, policy)
        fresh = capture_fresh_operational(operational)
        if "externalHandoff" in intent or "externalHandoff" in persisted_lifecycle:
            if operational["deploymentState"]["state"] != "DEPLOYED":
                deny("external_projection_deployed_required")
            evidence = authenticate_external_retirement_intent(args, intent)
            external_debt = evidence.get("externalRetentionDebt")
            marker_raw, _ = stable_private(Path(evidence["installedPath"]) / "DEPLOYED")
            marker = object_json(marker_raw, "external-projection-marker")
            if (marker.get("release") != evidence["releaseId"] or marker.get("target") != evidence["targetCommit"] or
                    marker.get("accepted") != "ACEITE TÉCNICO PASS" or
                    marker.get("dumpSha256") != fresh["dumpSha256"]):
                deny("external_projection_marker")
        failed_build_worktree = authenticate_failed_build_worktree_disposition(
            persisted_contract, persisted_lifecycle, operational,
            contract_path, intent["contractSha256"],
            lifecycle_path, intent["lifecycleSha256"])
        if failed_build_worktree != intent.get("failedBuildWorktreeDisposition"):
            deny("intent_failed_build_worktree_binding")
        failed_absent_paths = (set(failed_build_worktree["absentArtifactPaths"])
                               if failed_build_worktree is not None else set())
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
            if (artifact["path"] not in reconciled_paths and
                    artifact["path"] not in failed_absent_paths):
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
                state = classify(by_path[item["path"]], execution_contract, operational,
                                 failed_build_worktree)
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
                if (failed_build_worktree is not None and
                        item["path"] == failed_build_worktree["worktreePath"] and
                        _git_worktree_registration(Path(operational["gitRepository"]),
                                                   Path(item["path"])) is not None):
                    deny(f"retirement_worktree_registration_remains:{item['ordinal']}")
                completed += 1; removed.append(item["path"])
                append_event(journal, {"event": "VERIFIED", "ordinal": item["ordinal"], "absent": True})
            removed_set = set(removed) | reconciled_paths
            for artifact in intent["artifacts"]:
                if (artifact["path"] not in removed_set and
                        artifact["path"] not in failed_absent_paths):
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
        if failed_build_worktree is not None:
            worktree_path = failed_build_worktree["worktreePath"]
            worktree = Path(worktree_path)
            repository = Path(operational["gitRepository"])
            if ((worktree.exists() or worktree.is_symlink() or
                    _git_worktree_registration(repository, worktree) is not None) and
                    worktree_path not in remaining):
                remaining.append(worktree_path)
        receipt_state = ("DEPLOYED_SANITIZED" if operational["deploymentState"]["state"] == "DEPLOYED"
                         else "SANITIZED") if not remaining else (
                         "DEPLOYED_RETENTION_INCOMPLETE" if operational["deploymentState"]["state"] == "DEPLOYED"
                         else "RETENTION_INCOMPLETE")
        if external_debt is not None:
            receipt_state = "DEPLOYED_RETENTION_INCOMPLETE"
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
        if external_debt is not None:
            receipt["externalRetentionDebt"] = external_debt
        receipt_raw = canonical(receipt)
        write_exclusive(args.receipt_root / "execution-receipt.private.json", receipt_raw)
        review_terminal = "SANITIZED" if not remaining and external_debt is None else "QUARANTINED"
        review = {"schemaVersion": 2, "generationId": intent["generationId"],
                  "lifecycleSha256": intent["lifecycleSha256"], "state": review_terminal,
                  "reviewer": authorization["owner"],
                  "reason": "external builder custody retained" if external_debt is not None else "derived artifacts retired",
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
B96_TERMINAL_RELEASE = "immutable-b96eb779-vps-20261028T025159Z"


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


def _b96_terminal_release_runtime_proof(value: Any, release: str,
                                        installed: Path) -> None:
    """Authenticate the one historical absence allowed outside graph inventory."""
    if (release != B96_TERMINAL_RELEASE or installed.name != B96_TERMINAL_RELEASE or
            not isinstance(value, dict) or value.get("kind") != "CANONICAL_RETIREMENT" or
            not isinstance(value.get("chain"), list) or len(value["chain"]) != 2):
        deny("release_reconciliation_absent_inventory_identity")
    final = value["chain"][-1]
    if not isinstance(final, dict) or set(final) != {"intent", "receipt", "journal"}:
        deny("release_reconciliation_absent_inventory_identity")
    _, intent_sha, intent_raw = _closed_file_binding(final["intent"], f"{release}:final-intent")
    _, _, receipt_raw = _closed_file_binding(final["receipt"], f"{release}:final-receipt")
    _, journal_sha, journal_raw = _closed_file_binding(final["journal"], f"{release}:final-journal")
    intent = object_json(intent_raw, f"{release}:final-intent")
    receipt = object_json(receipt_raw, f"{release}:final-receipt")
    matches = [command for command in intent.get("commands", [])
               if isinstance(command, dict) and
               command.get("class") == "RELEASE_RUNTIME" and
               command.get("path") == str(installed)]
    if len(matches) != 1:
        deny("release_reconciliation_absent_runtime_effect")
    command = matches[0]
    ordinal = command.get("ordinal")
    expected_argv = ["/usr/bin/rm", "-r", "--", str(installed)]
    events = [event for event in _read_journal(journal_raw)
              if event.get("ordinal") == ordinal]
    expected_events = [
        {"event": "ATTEMPT", "ordinal": ordinal, "path": str(installed),
         "argv": expected_argv},
        {"event": "RESULT", "ordinal": ordinal, "exitCode": 0,
         "stdoutSha256": digest_bytes(b""), "stderrSha256": digest_bytes(b"")},
        {"event": "VERIFIED", "ordinal": ordinal, "absent": True},
    ]
    if (not isinstance(ordinal, int) or command.get("argv") != expected_argv or
            events != expected_events or receipt.get("state") != "SANITIZED" or
            receipt.get("intentSha256") != intent_sha or
            receipt.get("commandLogSha256") != journal_sha or
            str(installed) not in receipt.get("removedPaths", [])):
        deny("release_reconciliation_absent_runtime_effect")
    if installed.exists() or installed.is_symlink():
        deny("release_reconciliation_absent_runtime_reappeared")


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
        inventory_present = release in source["installedVerifiedReleases"]
        if (not isinstance(release, str) or not release or release in seen or
                role not in {"rollbackReleases", "transitiveReturnReleases"} or
                decision not in {"CLOSE_OPERATIONAL_DEPENDENCY", "PRESERVE_PRIVATE_DATA"} or
                installed != release_root / release or release not in source[role] or
                (not inventory_present and release != B96_TERMINAL_RELEASE)):
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
        if not inventory_present:
            if (role != "rollbackReleases" or
                    decision != "CLOSE_OPERATIONAL_DEPENDENCY" or
                    release in source["activeReleases"] or
                    release in source["candidateReleases"] or
                    release in source["transitiveReturnReleases"]):
                deny("release_reconciliation_absent_inventory_identity")
            _b96_terminal_release_runtime_proof(closure, release, installed)
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
    residue_prepare = commands.add_parser("prepare-worktree-residue")
    residue_prepare.add_argument("--request", type=Path, required=True)
    residue_prepare.add_argument("--request-sha256", required=True)
    residue_prepare.add_argument("--intent-output", type=Path, required=True)
    residue_prepare.set_defaults(handler=prepare_worktree_residue)
    residue_execute = commands.add_parser("execute-worktree-residue")
    for name in ("intent", "authorization"):
        residue_execute.add_argument(f"--{name}", type=Path, required=True)
        residue_execute.add_argument(f"--{name}-sha256", required=True)
    residue_execute.add_argument("--receipt-root", type=Path, required=True)
    residue_execute.add_argument("--successor-root", type=Path, required=True)
    residue_execute.set_defaults(handler=execute_worktree_residue)
    handoff_parser = commands.add_parser("verify-external-handoff")
    for name in ("handoff", "root-policy"):
        handoff_parser.add_argument(f"--{name}", type=Path, required=True)
        handoff_parser.add_argument(f"--{name}-sha256", required=True)
    handoff_parser.set_defaults(handler=verify_external_handoff)
    materialize_parser = commands.add_parser("materialize-external-retirement")
    check_parser = commands.add_parser("check-external-retirement")
    for operation_parser, input_name in ((materialize_parser, "handoff"), (check_parser, "intent")):
        for name in (input_name, "root-policy"):
            operation_parser.add_argument(f"--{name}", type=Path, required=True)
            operation_parser.add_argument(f"--{name}-sha256", required=True)
    check_parser.add_argument("--authorization", type=Path, required=True)
    check_parser.add_argument("--authorization-sha256", required=True)
    check_parser.add_argument("--deployment-lock", type=Path, required=True)
    materialize_parser.set_defaults(handler=materialize_external_retirement)
    check_parser.set_defaults(handler=check_external_retirement)
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
    precontract_parser = commands.add_parser("qualify-legacy-precontract-five")
    precontract_parser.add_argument("--inventory", type=Path, required=True)
    precontract_parser.add_argument("--inventory-sha256", required=True)
    precontract_parser.add_argument("--proof-output", type=Path, required=True)
    precontract_parser.set_defaults(handler=qualify_legacy_precontract_five)
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
    preservation_lock = commands.add_parser("materialize-builder-preservation-lock")
    preservation_lock.add_argument("--request", type=Path, required=True)
    preservation_lock.add_argument("--request-sha256", required=True)
    preservation_lock.add_argument("--report-output", type=Path, required=True)
    preservation_lock.set_defaults(handler=materialize_builder_preservation_lock)
    preservation_prepare = commands.add_parser("prepare-builder-preservation")
    preservation_prepare.add_argument("--request", type=Path, required=True)
    preservation_prepare.add_argument("--request-sha256", required=True)
    preservation_prepare.add_argument("--intent-output", type=Path, required=True)
    preservation_prepare.set_defaults(handler=prepare_builder_preservation)
    preservation_record = commands.add_parser("record-builder-preservation")
    for name in ("intent", "authorization"):
        preservation_record.add_argument(f"--{name}", type=Path, required=True)
        preservation_record.add_argument(f"--{name}-sha256", required=True)
    preservation_record.add_argument("--receipt-root", type=Path, required=True)
    preservation_record.set_defaults(handler=record_builder_preservation)
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
