#!/usr/bin/python3
"""Closed materializer for the worker-package-audit capacity audit."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CUSTODY = ROOT.parent
CONSUMER = ROOT / "scripts/capacity-recovery.py"
CONSUMER_SHA256 = "ee0a592651039e7fa6f9e3db8848c3e5b78b8549291d005dec5972a961550305"
PM2 = Path("/opt/re7online/backups/converta-persistent/preparations/p00-capacity-recovery-canonical-23315c43-20261030T030504Z/pm2-private/bin/pm2")
PM2_SHA256 = "bbb586713050b21d86aa41bde704a3a4776aa300ddcbd9710e81fa7c0089256d"
NODE = Path("/usr/bin/node")
NODE_VERSION = "v20.20.0"
NODE_SHA256 = "d01614ef369e36eee9ab8d86fbfa93ddf44931010add45e5262a63e3ddda784e"
DUMP = Path("/home/deploy/.pm2/dump.pm2")
GRAPH = CUSTODY / "release-graph.private.json"
POLICY = CUSTODY / "deploy-artifact-roots.json"
MANIFEST = ROOT / "config/capacity-recovery/worker-package-audit-disposition.v1.json"
HELPER = Path("/usr/local/libexec/re7online/capacity-proc-observer.py")
HELPER_SHA256 = "89650e6207cb4524f69ba6d0bdeea8d682b336cdb5424d4bcc7831cb58b57387"
INSTALLER_SHA256 = "7b92d8b9b34a091a771be97c62cb72387e6bab289cc3ab099247395276ad04db"
SUDOERS_SHA256 = "a19288231bba38b704692c44fea08c710747fca3c28faacc76423cf5bea13e26"
HELPER_PROOF = CUSTODY / "helper-installation-proof.private.json"
CANDIDATE = Path("/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-reactive-afbb7455-20261006T010000Z/window/worker-package-audit")
CURRENT = Path("/opt/re7online/current")
TRANSACTIONS = Path("/opt/re7online/backups/converta-persistent/deploy-transactions")
DEPLOYMENT_LOCK = Path("/opt/re7online/backups/converta-persistent/.deployment-window.lock")
WRITER_LOCK = Path("/opt/re7online/build-output/.generation-build.lock")
MINIMUM_RECOVERY_BYTES = 365674496
TARGET_AVAILABLE_BYTES = 9663676416


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def read_stable(path: Path, expected: str | None = None,
                modes: set[int] | None = None) -> tuple[bytes, os.stat_result]:
    before = path.lstat()
    if path.is_symlink() or not stat.S_ISREG(before.st_mode):
        raise RuntimeError("TYPE:" + str(path))
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        opened = os.fstat(fd); blocks = []
        while block := os.read(fd, 1024 * 1024): blocks.append(block)
        after = os.fstat(fd)
    finally: os.close(fd)
    current = path.lstat()
    identities = {(v.st_dev, v.st_ino, v.st_mode, v.st_uid, v.st_gid, v.st_size,
                   v.st_mtime_ns, v.st_ctime_ns, v.st_nlink)
                  for v in (before, opened, after, current)}
    raw = b"".join(blocks)
    if len(identities) != 1 or (modes is not None and stat.S_IMODE(opened.st_mode) not in modes):
        raise RuntimeError("IDENTITY:" + str(path))
    if expected is not None and digest(raw) != expected:
        raise RuntimeError("SHA256:" + str(path))
    return raw, opened


def write_exclusive(path: Path, raw: bytes) -> str:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        view = memoryview(raw)
        while view: view = view[os.write(fd, view):]
        os.fchmod(fd, 0o600); os.fsync(fd)
    finally: os.close(fd)
    reread, _ = read_stable(path, modes={0o600})
    if reread != raw: raise RuntimeError("READBACK:" + str(path))
    return digest(raw)


def authenticated_consumer() -> Any:
    read_stable(CONSUMER, CONSUMER_SHA256, {0o600, 0o644})
    spec = importlib.util.spec_from_file_location("capacity_recovery_materialized", CONSUMER)
    if spec is None or spec.loader is None:
        raise RuntimeError("CONSUMER_IMPORT")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    read_stable(CONSUMER, CONSUMER_SHA256, {0o600, 0o644})
    return module


def open_authenticated(path: Path, expected: str,
                       modes: set[int]) -> tuple[int, bytes, tuple[int, ...]]:
    before = path.lstat()
    if path.is_symlink() or not stat.S_ISREG(before.st_mode):
        raise RuntimeError("TYPE:" + str(path))
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    opened = os.fstat(fd)
    blocks = []
    while block := os.read(fd, 1024 * 1024):
        blocks.append(block)
    after = os.fstat(fd)
    current = path.lstat()
    identity = lambda value: (value.st_dev, value.st_ino, value.st_mode, value.st_uid,
                              value.st_gid, value.st_size, value.st_mtime_ns,
                              value.st_ctime_ns, value.st_nlink)
    identities = {identity(value) for value in (before, opened, after, current)}
    raw = b"".join(blocks)
    if (len(identities) != 1 or stat.S_IMODE(opened.st_mode) not in modes or
            digest(raw) != expected):
        os.close(fd)
        raise RuntimeError("IDENTITY:" + str(path))
    os.lseek(fd, 0, os.SEEK_SET)
    return fd, raw, identity(opened)


def confirm_open_identity(fd: int, path: Path, expected: tuple[int, ...]) -> None:
    current = path.lstat()
    opened = os.fstat(fd)
    identity = lambda value: (value.st_dev, value.st_ino, value.st_mode, value.st_uid,
                              value.st_gid, value.st_size, value.st_mtime_ns,
                              value.st_ctime_ns, value.st_nlink)
    if path.is_symlink() or identity(opened) != expected or identity(current) != expected:
        raise RuntimeError("IDENTITY:" + str(path))


def helper_binding() -> tuple[dict[str, str], str]:
    raw, _ = read_stable(HELPER_PROOF, modes={0o600})
    proof = json.loads(raw)
    required = {"schemaVersion", "kind", "installerSha256", "helper", "sudoersSha256"}
    if not isinstance(proof, dict) or set(proof) != required or proof.get("schemaVersion") != 1:
        raise RuntimeError("HELPER_PROOF_SCHEMA")
    helper = proof.get("helper")
    if (proof.get("kind") != "CAPACITY_PROC_OBSERVER_INSTALLATION_PROOF" or
            proof.get("installerSha256") != INSTALLER_SHA256 or
            proof.get("sudoersSha256") != SUDOERS_SHA256 or
            not isinstance(helper, dict) or set(helper) != {"path", "sha256", "identity"} or
            helper.get("path") != str(HELPER) or helper.get("sha256") != HELPER_SHA256):
        raise RuntimeError("HELPER_PROOF_BINDING")
    info = HELPER.lstat()
    actual = {"device": info.st_dev, "inode": info.st_ino, "uid": info.st_uid,
              "gid": info.st_gid, "mode": f"{stat.S_IMODE(info.st_mode):04o}"}
    if HELPER.is_symlink() or not stat.S_ISREG(info.st_mode) or helper["identity"] != actual:
        raise RuntimeError("HELPER_PROOF_IDENTITY")
    return {"path": str(HELPER), "sha256": HELPER_SHA256}, digest(raw)


def final_readback(consumer: Any, request_path: Path, request_expected: str,
                   helper: dict[str, str]) -> dict[str, Any]:
    request_raw, _ = consumer.stable_regular(request_path, request_expected)
    request = consumer.object_json(request_raw, "AUDIT_REQUEST_JSON")
    consumer.validate_audit_request(request)
    _, policy_sha, _, _ = consumer.load_binding(request["rootPolicy"], "ROOT_POLICY")
    _, operational_sha, operational_raw, _ = consumer.load_binding(
        request["operationalState"], "OPERATIONAL_STATE")
    consumer.validate_operational(operational_raw)
    manifest_binding = request["candidates"][0]["dispositionManifest"]
    _, manifest_sha, _, _ = consumer.load_binding(
        manifest_binding, "DISPOSITION_MANIFEST")
    if request["procObserver"] != helper:
        raise RuntimeError("HELPER_READBACK")
    return {"request": request, "requestSha256": digest(request_raw),
            "rootPolicySha256": policy_sha, "operationalStateSha256": operational_sha,
            "manifestSha256": manifest_sha}


def materialize() -> dict[str, str]:
    for name in ("operational-state.schema2.private.json", "audit-request.private.json",
                 "binding-readback.private.json", "node-proof.private.json"):
        if (CUSTODY / name).exists() or (CUSTODY / name).is_symlink():
            raise RuntimeError("OUTPUT_EXISTS:" + name)
    consumer = authenticated_consumer()
    helper, helper_proof_sha = helper_binding()
    node_raw, node_info = read_stable(NODE, NODE_SHA256, {0o755})
    del node_raw
    version = subprocess.run([str(NODE), "--version"], stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE, text=True, timeout=10, check=True).stdout.strip()
    if version != NODE_VERSION: raise RuntimeError("NODE_VERSION")
    fd, pm2_raw, pm2_identity = open_authenticated(PM2, PM2_SHA256, {0o500, 0o700})
    try:
        proc = subprocess.run([f"/proc/self/fd/{fd}", "jlist"], stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, text=True, timeout=30,
                              check=False, pass_fds=(fd,))
        confirm_open_identity(fd, PM2, pm2_identity)
    finally:
        os.close(fd)
    if proc.returncode or proc.stderr: raise RuntimeError("PM2_JLIST")
    fingerprint = consumer.digest_bytes(
        consumer.canonical(consumer._pm2_projection(json.loads(proc.stdout))))
    dump_raw, _ = read_stable(DUMP, modes={0o600, 0o644})
    graph_raw, _ = read_stable(GRAPH, modes={0o600})
    policy_raw, _ = read_stable(POLICY, modes={0o600})
    manifest_raw, _ = read_stable(MANIFEST, modes={0o600})
    links = []
    for component in ("api", "frontend"):
        link = CURRENT / component
        if not link.is_symlink(): raise RuntimeError("CURRENT_LINK")
        links.append({"path": str(link), "target": str(link.resolve(strict=True))})
    tx = TRANSACTIONS.lstat()
    node_proof = {"schemaVersion": 1, "path": str(NODE), "version": version,
                  "sha256": NODE_SHA256,
                  "identity": {"device": node_info.st_dev, "inode": node_info.st_ino,
                               "uid": node_info.st_uid, "gid": node_info.st_gid,
                               "mode": f"{stat.S_IMODE(node_info.st_mode):04o}"}}
    node_sha = write_exclusive(CUSTODY / "node-proof.private.json", consumer.canonical(node_proof))
    operational = {"schemaVersion": 2, "currentPaths": [], "pm2LivePaths": [],
        "pm2DumpPaths": [], "openTransactionPaths": [], "protectedGraphPaths": [],
        "deploymentLock": str(DEPLOYMENT_LOCK), "writerLock": str(WRITER_LOCK),
        "liveObservations": {"currentLinks": links,
            "pm2": {"path": str(PM2), "sha256": digest(pm2_raw),
                    "fingerprintSha256": fingerprint},
            "dump": {"path": str(DUMP), "sha256": digest(dump_raw)},
            "releaseGraph": {"path": str(GRAPH), "sha256": digest(graph_raw)},
            "transactionsRoot": {"path": str(TRANSACTIONS), "ownerUid": tx.st_uid,
                                 "groupGid": tx.st_gid,
                                 "allowedModes": [f"{stat.S_IMODE(tx.st_mode):04o}"]}}}
    operational_sha = write_exclusive(
        CUSTODY / "operational-state.schema2.private.json", consumer.canonical(operational))
    request = {"schemaVersion": 3, "kind": "CAPACITY_RECOVERY_AUDIT_REQUEST",
        "minimumRecoveryBytes": MINIMUM_RECOVERY_BYTES,
        "targetAvailableBytes": TARGET_AVAILABLE_BYTES,
        "incrementalBatch": True, "rootPolicy": {"path": str(POLICY),
        "sha256": digest(policy_raw)}, "operationalState": {
        "path": str(CUSTODY / "operational-state.schema2.private.json"),
        "sha256": operational_sha}, "procObserver": helper,
        "candidates": [{"class": "CLOSED_PREPARATION_MANIFEST_DISPOSITION",
            "path": str(CANDIDATE), "dispositionManifest": {"path": str(MANIFEST),
            "sha256": digest(manifest_raw)}}]}
    request_path = CUSTODY / "audit-request.private.json"
    provisional_request_sha = write_exclusive(request_path, consumer.canonical(request))
    checked = final_readback(consumer, request_path, provisional_request_sha, helper)
    request_sha = checked["requestSha256"]
    readback = {"schemaVersion": 1, "operationalStateSha256": operational_sha,
                "requestSha256": request_sha, "nodeProofSha256": node_sha,
                "helper": helper, "helperProofSha256": helper_proof_sha,
                "manifestSha256": checked["manifestSha256"],
                "rootPolicySha256": checked["rootPolicySha256"],
                "pm2FingerprintSha256": fingerprint}
    write_exclusive(CUSTODY / "binding-readback.private.json", consumer.canonical(readback))
    directory = os.open(CUSTODY, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try: os.fsync(directory)
    finally: os.close(directory)
    return {"operationalStateSha256": operational_sha, "requestSha256": request_sha,
            "nodeProofSha256": node_sha, "pm2FingerprintSha256": fingerprint}


if __name__ == "__main__":
    if len(os.sys.argv) != 1: raise SystemExit("DENY|ARGUMENTS")
    print(json.dumps(materialize(), sort_keys=True))
