#!/usr/bin/env python3
"""Directed, synthetic cold-read profile for the real archive authenticator.

This is intentionally not a production executor.  It creates only caller-owned
synthetic files, applies POSIX_FADV_DONTNEED to those files, and runs the
integrated authenticator inside the integrated audit supervisor/cgroup.
"""

from __future__ import annotations

import argparse
import ctypes
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import tarfile
import time
from types import SimpleNamespace


def load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def identity(path: Path) -> dict[str, object]:
    info = path.lstat()
    return {"device": info.st_dev, "inode": info.st_ino, "nlink": info.st_nlink,
            "uid": info.st_uid, "gid": info.st_gid,
            "mode": f"0{stat.S_IMODE(info.st_mode):03o}"}


def make_fixture(root: Path, sizes: list[int]) -> tuple[Path, list[dict[str, object]]]:
    authority = root / "authority"
    authority.mkdir(parents=True, mode=0o755)
    entries: list[dict[str, object]] = []
    for ordinal, size in enumerate(sizes, 1):
        leaf = authority / f"candidate-{ordinal}.bin"
        with leaf.open("xb") as output:
            remaining = size
            while remaining:
                block = os.urandom(min(1024 * 1024, remaining))
                output.write(block)
                remaining -= len(block)
        leaf.chmod(0o644)
        archive = root / f"candidate-{ordinal}.tar.gz"
        with tarfile.open(archive, "x:gz", compresslevel=1) as output:
            output.add(leaf, arcname=leaf.name)
        archive.chmod(0o600)
        entries.append({"path": str(archive), "sha256": sha256(archive),
                        "identity": identity(archive), "authority": str(authority),
                        "authorityState": "PRESENT", "protectedMemberExceptions": []})
    authority_info = authority.stat()
    authority_identity = {"device": authority_info.st_dev, "inode": authority_info.st_ino,
                          "uid": authority_info.st_uid, "gid": authority_info.st_gid,
                          "mode": f"0{stat.S_IMODE(authority_info.st_mode):03o}"}
    for entry in entries:
        entry["authorityIdentity"] = authority_identity
    metadata = root / "fixture.json"
    metadata.write_text(json.dumps({"entries": entries, "sizes": sizes},
                                   sort_keys=True) + "\n")
    metadata.chmod(0o600)
    return metadata, entries


def resident_pages(fd: int, size: int) -> tuple[int | None, int, str | None]:
    page_size = os.sysconf("SC_PAGE_SIZE")
    page_count = (size + page_size - 1) // page_size
    if page_count == 0:
        return 0, 0, None
    libc = ctypes.CDLL(None, use_errno=True)
    libc.mmap.restype = ctypes.c_void_p
    address = libc.mmap(None, size, 0, 1, fd, 0)  # PROT_NONE, MAP_SHARED
    failed = ctypes.c_void_p(-1).value
    if address == failed:
        return None, page_count, f"MMAP_ERRNO_{ctypes.get_errno()}"
    vector = (ctypes.c_ubyte * page_count)()
    try:
        if libc.mincore(ctypes.c_void_p(address), size, vector) != 0:
            return None, page_count, f"MINCORE_ERRNO_{ctypes.get_errno()}"
        return sum(1 for value in vector if value & 1), page_count, None
    finally:
        libc.munmap(ctypes.c_void_p(address), size)


def evict_own_files(entries: list[dict[str, object]]) -> dict[str, object]:
    gaps: list[str] = []
    paths = [Path(str(entry["path"])) for entry in entries]
    authority = Path(str(entries[0]["authority"]))
    paths.extend(authority / f"candidate-{ordinal}.bin"
                 for ordinal in range(1, len(entries) + 1))
    observations: list[dict[str, object]] = []
    for path in paths:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
        try:
            info = os.fstat(fd)
            before, pages, before_gap = resident_pages(fd, info.st_size)
            os.fsync(fd)
            os.posix_fadvise(fd, 0, 0, os.POSIX_FADV_DONTNEED)
            after, after_pages, after_gap = resident_pages(fd, info.st_size)
            if pages != after_pages:
                gaps.append(f"{path.name}:PAGE_COUNT_CHANGED")
            for stage, gap in (("before", before_gap), ("after", after_gap)):
                if gap is not None:
                    gaps.append(f"{path.name}:{stage}:{gap}")
            observations.append({"name": path.name, "bytes": info.st_size,
                                 "totalPages": pages, "residentPagesBefore": before,
                                 "residentPagesAfter": after})
        except (AttributeError, OSError) as error:
            gaps.append(f"{path.name}:{type(error).__name__}")
        finally:
            os.close(fd)
    return {"gaps": gaps, "files": observations,
            "totalPages": sum(int(item["totalPages"]) for item in observations),
            "residentPagesBefore": sum(int(item["residentPagesBefore"] or 0)
                                       for item in observations),
            "residentPagesAfter": sum(int(item["residentPagesAfter"] or 0)
                                      for item in observations),
            "capturedMonotonicNs": time.monotonic_ns()}


def child_source(path: Path) -> None:
    path.write_text(r'''from __future__ import annotations
import importlib.util,json,os,sys
from pathlib import Path
def load(path,name):
 spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
supervisor=load(Path(sys.argv[1]),"profile_supervisor_child")
executor=load(Path(sys.argv[2]),"profile_executor_child")
unit=sys.argv[3];memory=int(sys.argv[4]);containment=Path(sys.argv[5]);telemetry=Path(sys.argv[6]);plan=Path(sys.argv[7]);fixture=Path(sys.argv[8])
relative,projection=supervisor.verify_contained_cgroup(unit,memory)
fd=supervisor.exclusive(containment)
try:os.write(fd,supervisor.canonical({"schemaVersion":1,"state":"PASS","unit":unit,"cgroup":relative,**projection}));os.fsync(fd)
finally:os.close(fd)
data=json.loads(fixture.read_text());executor._TELEMETRY=executor.Telemetry(telemetry);results=[]
try:
 for entry in data["entries"]:results.append(executor._authenticate_disposition_archive(Path(entry["path"]),entry,{"versionedEnvExample":{"sha256":"0"*64}}))
finally:executor._TELEMETRY.close();executor._TELEMETRY=None
fd=supervisor.exclusive(plan)
try:os.write(fd,supervisor.canonical({"schemaVersion":1,"state":"PASS","results":results}));os.fsync(fd)
finally:os.close(fd)
''')
    path.chmod(0o700)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--fixture-root", type=Path)
    parser.add_argument("--executor", type=Path, required=True)
    parser.add_argument("--supervisor", type=Path, required=True)
    parser.add_argument("--memory-max-bytes", type=int, required=True)
    parser.add_argument("--timeout-seconds", type=int, default=900)
    parser.add_argument("--sizes", default="111230976,173621248,174120960")
    parser.add_argument("--verify-cold-existing", action="store_true")
    args = parser.parse_args()
    fixture_root = args.fixture_root or args.root
    if args.verify_cold_existing:
        if not fixture_root.is_dir() or fixture_root.is_symlink():
            raise SystemExit("existing synthetic fixture root is required")
    else:
        args.root.mkdir(mode=0o700)
    sizes = [int(value) for value in args.sizes.split(",")]
    if len(sizes) != 3 or any(value <= 0 for value in sizes):
        raise SystemExit("exactly three positive sizes are required")
    if args.verify_cold_existing:
        metadata = fixture_root / "fixture.json"
        fixture = json.loads(metadata.read_text())
        entries = fixture["entries"]
        cold = evict_own_files(entries)
        result = {"schemaVersion": 1, "state": "PASS" if not cold["gaps"] else "GAP",
                  "syntheticOnly": True, "coldPreparation": cold}
        output = args.root / "cold-preparation-verification.json"
        output.write_text(json.dumps(result, sort_keys=True) + "\n")
        print(json.dumps(result, sort_keys=True))
        return
    if args.fixture_root is not None:
        if not fixture_root.is_dir() or fixture_root.is_symlink():
            raise SystemExit("existing synthetic fixture root is required")
        metadata = fixture_root / "fixture.json"
        fixture = json.loads(metadata.read_text())
        entries = fixture["entries"]
        sizes = fixture["sizes"]
        if len(entries) != 3 or len(sizes) != 3:
            raise SystemExit("existing synthetic fixture must contain exactly three candidates")
    else:
        metadata, entries = make_fixture(args.root, sizes)
    cold = evict_own_files(entries)
    if cold["gaps"] or cold["residentPagesAfter"] != 0:
        result = {
            "schemaVersion": 1, "state": "COLD_PRECONDITION_NOT_MET",
            "exitCode": 78, "syntheticOnly": True, "coldPreparation": cold,
            "supervisorStarted": False,
        }
        (args.root / "profile-result.json").write_text(
            json.dumps(result, sort_keys=True) + "\n")
        print(json.dumps(result, sort_keys=True))
        raise SystemExit(78)
    child = args.root / "contained-child.py"
    child_source(child)
    supervisor = load(args.supervisor, "profile_supervisor_parent")
    outputs = {name: args.root / name for name in (
        "stdout", "stderr", "terminal.json", "executor.jsonl", "supervisor.jsonl",
        "containment.json", "plan.json")}
    run_args = SimpleNamespace(
        action="audit", request=args.root / "unused-request",
        request_sha256="0" * 64, plan_output=outputs["plan.json"],
        telemetry_output=outputs["executor.jsonl"],
        containment_output=outputs["containment.json"],
        memory_max_bytes=args.memory_max_bytes, timeout_seconds=args.timeout_seconds,
        terminal_output=outputs["terminal.json"])
    original_scope_argv = supervisor.systemd_scope_argv
    def profile_scope_argv(namespace, unit):
        base = original_scope_argv(namespace, unit)
        executable = base.index(str(supervisor.PYTHON), 5)
        return [*base[:executable], str(supervisor.PYTHON), "-B", str(child),
                str(args.supervisor), str(args.executor), unit,
                str(args.memory_max_bytes), str(outputs["containment.json"]),
                str(outputs["executor.jsonl"]), str(outputs["plan.json"]), str(metadata)]
    supervisor.systemd_scope_argv = profile_scope_argv
    fds = {name: os.open(outputs[name], os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                         os.O_NOFOLLOW | os.O_CLOEXEC, 0o600)
           for name in ("stdout", "stderr", "supervisor.jsonl")}
    try:
        code = supervisor.run_contained_audit(
            run_args, fds["stdout"], fds["stderr"], fds["supervisor.jsonl"])
    finally:
        for fd in fds.values():
            os.close(fd)
    terminal = json.loads(outputs["terminal.json"].read_text())
    report = {
        "schemaVersion": 1, "state": "PASS" if code == 0 else "DENY",
        "exitCode": code, "syntheticOnly": True,
        "coldPreparation": cold,
        "candidateCount": 3,
        "sourceBatchDeclaredPhysicalBytes": sum(sizes),
        "syntheticPayloadLogicalBytes": sum(sizes),
        "syntheticArchiveLogicalBytes": sum(
            Path(str(entry["path"])).stat().st_size for entry in entries),
        "syntheticArchivePhysicalBytes": sum(
            Path(str(entry["path"])).stat().st_blocks * 512 for entry in entries),
        "memoryMaxBytes": args.memory_max_bytes,
        "scopeMemoryPeakBytes": terminal.get("scopeMemoryPeakBytes"),
        "elapsedMonotonicNs": terminal.get("elapsedMonotonicNs"),
        "resourceSampleCount": terminal.get("resourceSampleCount"),
        "terminalReason": terminal.get("reason"),
    }
    (args.root / "profile-result.json").write_text(json.dumps(report, sort_keys=True) + "\n")
    print(json.dumps(report, sort_keys=True))
    raise SystemExit(code)


if __name__ == "__main__":
    main()
