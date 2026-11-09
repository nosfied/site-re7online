#!/usr/bin/python3
"""Closed materializer for versioned capacity-recovery audit profiles."""
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
CONSUMER_SHA256 = "8c7494e24ca3754f870df4437d98ea63354ded4a6c60b8a1e2d28b5e13160647"
PM2 = Path("/opt/re7online/backups/converta-persistent/preparations/p00-capacity-recovery-canonical-23315c43-20261030T030504Z/pm2-private/bin/pm2")
PM2_SHA256 = "bbb586713050b21d86aa41bde704a3a4776aa300ddcbd9710e81fa7c0089256d"
NODE = Path("/usr/bin/node")
NODE_VERSION = "v20.20.0"
NODE_SHA256 = "d01614ef369e36eee9ab8d86fbfa93ddf44931010add45e5262a63e3ddda784e"
DUMP = Path("/home/deploy/.pm2/dump.pm2")
GRAPH = CUSTODY / "release-graph.private.json"
POLICY = CUSTODY / "deploy-artifact-roots.json"
MANIFEST = ROOT / "config/capacity-recovery/worker-package-audit-disposition.v1.json"
EF7_MANIFEST = ROOT / "config/capacity-recovery/ef7db111-deploy-control-disposition.v1.json"
HELPER = Path("/usr/local/libexec/re7online/capacity-proc-observer.py")
WORKER_HELPER_SHA256 = "a7f1a0680d19561086923b77162ab3710fbd2c890ccf823aa517d42ccea9a1c2"
WORKER_INSTALLER_SHA256 = "7b92d8b9b34a091a771be97c62cb72387e6bab289cc3ab099247395276ad04db"
EF7_HELPER_SHA256 = "89650e6207cb4524f69ba6d0bdeea8d682b336cdb5424d4bcc7831cb58b57387"
EF7_INSTALLER_SHA256 = "757dc2f20e649a985d36fa5a82b32e2273efeb9ffea9cd62f45757dcf8073785"
CRM_HELPER_SHA256 = "fb83ba7c15fbac564a4bbe0d7d1bfd0d0a8ba2e79231d8b133e67b12a8c86d6f"
CRM_INSTALLER_SHA256 = "4618d34dc0192048a7631d930c03684804daf03cd60fa65d97e8258a3da6ba97"
# Compatibility names retain the proven worker profile for callers/tests that
# invoke helper_binding() without an explicit profile contract.
HELPER_SHA256 = WORKER_HELPER_SHA256
INSTALLER_SHA256 = WORKER_INSTALLER_SHA256
SUDOERS_SHA256 = "a19288231bba38b704692c44fea08c710747fca3c28faacc76423cf5bea13e26"
SUDOERS = Path("/etc/sudoers.d/re7online-capacity-proc-observer")
HELPER_PROOF = CUSTODY / "helper-installation-proof.private.json"
HELPER_INSTALLATION_REPORT = CUSTODY / "helper-installation-report.private.txt"
HELPER_UID = HELPER_GID = SUDOERS_UID = SUDOERS_GID = 0
CANDIDATE = Path("/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-reactive-afbb7455-20261006T010000Z/window/worker-package-audit")
EF7_CANDIDATES = (
    Path("/opt/re7online/deploy-control/ef7db111-prep/node_modules"),
    Path("/opt/re7online/deploy-control/ef7db111-prep/apps/whatsapp-agent/node_modules"),
    Path("/opt/re7online/deploy-control/ef7db111-prep/.next"),
    Path("/opt/re7online/deploy-control/ef7db111-prep/apps/whatsapp-agent/dist"),
)
CRM_CANDIDATES = (
    Path("/opt/re7online/releases/crm-csv-front-ea3d2788-20261016"),
    Path("/opt/re7online/releases/crm-csv-front-return-d41ddd64-20261016"),
)
CRM_SOURCE_GRAPH = Path(
    "/opt/re7online/backups/converta-persistent/deploy-transactions/"
    "immutable-785bde80-vps-20261103T103429Z-api-frontend-ccb8f00c-v3-once/"
    "generation-release-graph.final.private.json")
CRM_SOURCE_GRAPH_SHA256 = "1e9623e4bae272074a73615dfc897f1b268de42fa262583d46dcc701eb4aee59"
CURRENT = Path("/opt/re7online/current")
TRANSACTIONS = Path("/opt/re7online/backups/converta-persistent/deploy-transactions")
DEPLOYMENT_LOCK = Path("/opt/re7online/backups/converta-persistent/.deployment-window.lock")
WRITER_LOCK = Path("/opt/re7online/build-output/.generation-build.lock")
MINIMUM_RECOVERY_BYTES = 365674496
TARGET_AVAILABLE_BYTES = 9663676416
WORKER_PROFILE = "worker-package-audit"
EF7_PROFILE = "ef7db111-deploy-control"
CRM_PROFILE = "inactive-crm-staging"
EF7_MINIMUM_RECOVERY_BYTES = 949141504
CRM_MINIMUM_RECOVERY_BYTES = 1299951616


def profile_contract(profile: str) -> dict[str, Any]:
    if profile == WORKER_PROFILE:
        return {"manifest": MANIFEST, "minimumRecoveryBytes": MINIMUM_RECOVERY_BYTES,
                "installerSha256": WORKER_INSTALLER_SHA256,
                "helperSha256": WORKER_HELPER_SHA256,
                "candidates": [{"class": "CLOSED_PREPARATION_MANIFEST_DISPOSITION",
                                "path": str(CANDIDATE)}]}
    if profile == EF7_PROFILE:
        return {"manifest": EF7_MANIFEST,
                "minimumRecoveryBytes": EF7_MINIMUM_RECOVERY_BYTES,
                "installerSha256": EF7_INSTALLER_SHA256,
                "helperSha256": EF7_HELPER_SHA256,
                "candidates": [{"class": "CLOSED_DEPLOY_CONTROL_DERIVED_TREE",
                                "path": str(path)} for path in EF7_CANDIDATES]}
    if profile == CRM_PROFILE:
        return {"manifest": None,
                "minimumRecoveryBytes": CRM_MINIMUM_RECOVERY_BYTES,
                "installerSha256": CRM_INSTALLER_SHA256,
                "helperSha256": CRM_HELPER_SHA256,
                "sourceGraph": {"path": CRM_SOURCE_GRAPH,
                                "sha256": CRM_SOURCE_GRAPH_SHA256},
                "candidates": [{"class": "CLOSED_INACTIVE_CRM_STAGING_TREE",
                                "path": str(path)} for path in CRM_CANDIDATES]}
    raise RuntimeError("PROFILE_DENY")


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


def helper_binding(installer_sha256: str | None = None,
                   helper_sha256: str | None = None) -> tuple[dict[str, str], str]:
    installer_sha256 = installer_sha256 or INSTALLER_SHA256
    helper_sha256 = helper_sha256 or HELPER_SHA256
    raw, _ = read_stable(HELPER_PROOF, modes={0o600})
    proof = json.loads(raw)
    required = {"schemaVersion", "kind", "installerSha256", "helper", "sudoersSha256"}
    if not isinstance(proof, dict) or set(proof) != required or proof.get("schemaVersion") != 1:
        raise RuntimeError("HELPER_PROOF_SCHEMA")
    helper = proof.get("helper")
    if (proof.get("kind") != "CAPACITY_PROC_OBSERVER_INSTALLATION_PROOF" or
            proof.get("installerSha256") != installer_sha256 or
            proof.get("sudoersSha256") != SUDOERS_SHA256 or
            not isinstance(helper, dict) or set(helper) != {"path", "sha256", "identity"} or
            helper.get("path") != str(HELPER) or helper.get("sha256") != helper_sha256):
        raise RuntimeError("HELPER_PROOF_BINDING")
    info = HELPER.lstat()
    actual = {"device": info.st_dev, "inode": info.st_ino, "uid": info.st_uid,
              "gid": info.st_gid, "mode": f"{stat.S_IMODE(info.st_mode):04o}"}
    if HELPER.is_symlink() or not stat.S_ISREG(info.st_mode) or helper["identity"] != actual:
        raise RuntimeError("HELPER_PROOF_IDENTITY")
    return {"path": str(HELPER), "sha256": helper_sha256}, digest(raw)


def _installation_record(line: str, label: str, path: Path, sha256: str,
                         uid: int, gid: int, mode: str) -> dict[str, int]:
    fields = line.split("|")
    if (len(fields) != 6 or fields[:5] !=
            [label, str(path), sha256, f"{uid}:{gid}", mode]):
        raise RuntimeError("HELPER_INSTALLATION_REPORT_BINDING")
    identity = fields[5].split(":")
    if (len(identity) != 2 or any(not value.isdecimal() for value in identity) or
            any(str(int(value)) != value for value in identity)):
        raise RuntimeError("HELPER_INSTALLATION_REPORT_IDENTITY")
    return {"device": int(identity[0]), "inode": int(identity[1]),
            "uid": uid, "gid": gid, "mode": mode}


def capture_helper_proof(profile: str) -> dict[str, str]:
    if profile != CRM_PROFILE:
        raise RuntimeError("HELPER_PROOF_CAPTURE_PROFILE")
    contract = profile_contract(profile)
    report_raw, report_info = read_stable(HELPER_INSTALLATION_REPORT, modes={0o600})
    if (report_info.st_uid, report_info.st_gid) != (os.geteuid(), os.getegid()):
        raise RuntimeError("HELPER_INSTALLATION_REPORT_OWNER")
    try:
        report = report_raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise RuntimeError("HELPER_INSTALLATION_REPORT_ENCODING") from exc
    lines = report.splitlines()
    if report != "\n".join(lines) + "\n":
        raise RuntimeError("HELPER_INSTALLATION_REPORT_FRAMING")
    if len(lines) == 2 and lines[0].startswith("RECOVERED|"):
        installed_line = lines[0]
    elif len(lines) == 3 and lines[0] == (
            "BEFORE|{path}|{sha256}|{uid}:{gid}|0500|64769:803452".format(
                path=HELPER, sha256=EF7_HELPER_SHA256,
                uid=HELPER_UID, gid=HELPER_GID)) and \
            lines[1].startswith("INSTALLED|"):
        installed_line = lines[1]
    else:
        raise RuntimeError("HELPER_INSTALLATION_REPORT_STATE")
    identity = _installation_record(
        installed_line, installed_line.split("|", 1)[0], HELPER,
        contract["helperSha256"], HELPER_UID, HELPER_GID, "0500")
    preserved = ["PRESERVED", str(SUDOERS), SUDOERS_SHA256,
                 f"{SUDOERS_UID}:{SUDOERS_GID}", "0440"]
    if lines[-1].split("|") != preserved:
        raise RuntimeError("HELPER_INSTALLATION_REPORT_SUDOERS")
    helper_info = HELPER.lstat()
    if (HELPER.is_symlink() or not stat.S_ISREG(helper_info.st_mode) or
            {"device": helper_info.st_dev, "inode": helper_info.st_ino,
             "uid": helper_info.st_uid, "gid": helper_info.st_gid,
             "mode": f"{stat.S_IMODE(helper_info.st_mode):04o}"} != identity):
        raise RuntimeError("HELPER_INSTALLATION_REPORT_HELPER_DRIFT")
    proof = {"schemaVersion": 1,
        "kind": "CAPACITY_PROC_OBSERVER_INSTALLATION_PROOF",
        "installerSha256": contract["installerSha256"],
        "sudoersSha256": SUDOERS_SHA256,
        "helper": {"path": str(HELPER), "sha256": contract["helperSha256"],
                   "identity": identity}}
    consumer = authenticated_consumer()
    proof_sha = write_exclusive(HELPER_PROOF, consumer.canonical(proof))
    binding, checked_sha = helper_binding(
        contract["installerSha256"], contract["helperSha256"])
    if checked_sha != proof_sha:
        raise RuntimeError("HELPER_PROOF_CAPTURE_READBACK")
    return {"helperProofSha256": proof_sha, "reportSha256": digest(report_raw),
            "helperPath": binding["path"], "helperSha256": binding["sha256"]}


def final_readback(consumer: Any, request_path: Path, request_expected: str,
                   helper: dict[str, str]) -> dict[str, Any]:
    request_raw, _ = consumer.stable_regular(request_path, request_expected)
    request = consumer.object_json(request_raw, "AUDIT_REQUEST_JSON")
    consumer.validate_audit_request(request)
    _, policy_sha, _, _ = consumer.load_binding(request["rootPolicy"], "ROOT_POLICY")
    _, operational_sha, operational_raw, _ = consumer.load_binding(
        request["operationalState"], "OPERATIONAL_STATE")
    operational = consumer.validate_operational(operational_raw)
    graph_binding = operational["liveObservations"]["releaseGraph"]
    graph_raw, _ = consumer.stable_regular(
        Path(graph_binding["path"]), graph_binding["sha256"],
        allowed_modes={0o600, 0o644})
    graph = consumer.object_json(graph_raw, "LIVE_RELEASE_GRAPH_JSON")
    if graph.get("schemaVersion") == 3:
        source = graph.get("sourceGraph")
        if (not isinstance(source, dict) or set(source) != {"path", "sha256"} or
                graph != consumer.direct_release_graph_projection(
                    Path(str(source.get("path", ""))), str(source.get("sha256", "")))):
            consumer.deny("LIVE_RELEASE_GRAPH_PROJECTION_DIVERGENCE")
    manifest_binding = request["candidates"][0].get("dispositionManifest")
    manifest_sha = None
    if manifest_binding is not None:
        _, manifest_sha, _, _ = consumer.load_binding(
            manifest_binding, "DISPOSITION_MANIFEST")
    if request["procObserver"] != helper:
        raise RuntimeError("HELPER_READBACK")
    return {"request": request, "requestSha256": digest(request_raw),
            "rootPolicySha256": policy_sha, "operationalStateSha256": operational_sha,
            "manifestSha256": manifest_sha}


def materialize(profile: str = WORKER_PROFILE) -> dict[str, str]:
    contract = profile_contract(profile)
    output_names = ["operational-state.schema2.private.json", "audit-request.private.json",
                    "binding-readback.private.json", "node-proof.private.json"]
    if contract.get("sourceGraph") is not None:
        output_names.append("release-graph.private.json")
    for name in output_names:
        if (CUSTODY / name).exists() or (CUSTODY / name).is_symlink():
            raise RuntimeError("OUTPUT_EXISTS:" + name)
    consumer = authenticated_consumer()
    helper, helper_proof_sha = helper_binding(
        contract["installerSha256"], contract["helperSha256"])
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
    source_graph = contract.get("sourceGraph")
    if source_graph is not None:
        projection = consumer.direct_release_graph_projection(
            Path(source_graph["path"]), source_graph["sha256"])
        write_exclusive(GRAPH, consumer.canonical(projection))
    graph_raw, _ = read_stable(GRAPH, modes={0o600})
    policy_raw, _ = read_stable(POLICY, modes={0o600})
    manifest_path = contract["manifest"]
    manifest_raw = None
    if manifest_path is not None:
        manifest_raw, _ = read_stable(manifest_path, modes={0o600, 0o644})
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
    receipt_path = consumer.LEGACY_EMPTY_TRANSACTION_RECEIPT
    journal_path = consumer.LEGACY_EMPTY_TRANSACTION_JOURNAL
    receipt_present = receipt_path.exists() or receipt_path.is_symlink()
    journal_present = journal_path.exists() or journal_path.is_symlink()
    if receipt_present != journal_present:
        raise RuntimeError("EMPTY_TRANSACTION_DISPOSITION_INCOMPLETE")
    if receipt_present:
        receipt_raw, _ = read_stable(receipt_path, modes={0o600})
        journal_raw, _ = read_stable(journal_path, modes={0o600})
        operational["schemaVersion"] = 3
        operational["legacyEmptyTransactionDisposition"] = {
            "receipt": {"path": str(receipt_path), "sha256": digest(receipt_raw)},
            "journal": {"path": str(journal_path), "sha256": digest(journal_raw)},
        }
    operational_sha = write_exclusive(
        CUSTODY / "operational-state.schema2.private.json", consumer.canonical(operational))
    request = {"schemaVersion": 3, "kind": "CAPACITY_RECOVERY_AUDIT_REQUEST",
        "minimumRecoveryBytes": contract["minimumRecoveryBytes"],
        "targetAvailableBytes": TARGET_AVAILABLE_BYTES,
        "incrementalBatch": True, "rootPolicy": {"path": str(POLICY),
        "sha256": digest(policy_raw)}, "operationalState": {
        "path": str(CUSTODY / "operational-state.schema2.private.json"),
        "sha256": operational_sha}, "procObserver": helper,
        "candidates": [({**candidate, "dispositionManifest": {
            "path": str(manifest_path), "sha256": digest(manifest_raw)}}
            if manifest_path is not None and manifest_raw is not None else candidate)
            for candidate in contract["candidates"]]}
    request_path = CUSTODY / "audit-request.private.json"
    provisional_request_sha = write_exclusive(request_path, consumer.canonical(request))
    checked = final_readback(consumer, request_path, provisional_request_sha, helper)
    request_sha = checked["requestSha256"]
    readback = {"schemaVersion": 1, "operationalStateSha256": operational_sha,
                "requestSha256": request_sha, "nodeProofSha256": node_sha,
                "helper": helper, "helperProofSha256": helper_proof_sha,
                "releaseGraphSha256": digest(graph_raw),
                "sourceGraph": ({"path": str(source_graph["path"]),
                                 "sha256": source_graph["sha256"]}
                                if source_graph is not None else None),
                "manifestSha256": checked["manifestSha256"],
                "rootPolicySha256": checked["rootPolicySha256"],
                "pm2FingerprintSha256": fingerprint}
    write_exclusive(CUSTODY / "binding-readback.private.json", consumer.canonical(readback))
    directory = os.open(CUSTODY, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try: os.fsync(directory)
    finally: os.close(directory)
    return {"operationalStateSha256": operational_sha, "requestSha256": request_sha,
            "nodeProofSha256": node_sha, "pm2FingerprintSha256": fingerprint}


def main(argv: list[str]) -> int:
    if len(argv) == 0:
        selected_profile = WORKER_PROFILE
        action = "materialize"
    elif len(argv) == 2 and argv[0] == "--profile" and \
            argv[1] in {EF7_PROFILE, CRM_PROFILE}:
        selected_profile = argv[1]
        action = "materialize"
    elif len(argv) == 3 and argv[0] == "--capture-helper-proof" and \
            argv[1] == "--profile" and argv[2] == CRM_PROFILE:
        selected_profile = argv[2]
        action = "capture-helper-proof"
    else:
        raise SystemExit("DENY|ARGUMENTS")
    result = (capture_helper_proof(selected_profile)
              if action == "capture-helper-proof" else materialize(selected_profile))
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(os.sys.argv[1:]))
