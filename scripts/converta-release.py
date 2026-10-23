#!/usr/bin/env python3
"""Build and verify deterministic immutable Converta releases off-host."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import io
import json
import lzma
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
from typing import Any, Iterable


SHA40 = re.compile(r"[0-9a-f]{40}")
SHA256 = re.compile(r"[0-9a-f]{64}")
RELEASE_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}")
COMPONENTS = ("api", "frontend")
RUNTIMES = ("api-runtime", "frontend-runtime")
MANIFEST_FIELDS = {
    "schemaVersion", "producer", "releaseId", "targetCommit", "components",
    "sourceDateEpoch", "builtAt", "toolchain", "runtimes", "indexSha256",
    "reproducibility",
}


class Denied(RuntimeError):
    pass


def deny(predicate: str) -> None:
    raise Denied(predicate)


def canonical_json(value: Any) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True) + "\n").encode()


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def stable_bytes(path: Path) -> tuple[bytes, os.stat_result]:
    try:
        before = path.lstat()
        if not stat.S_ISREG(before.st_mode) or path.is_symlink():
            deny(f"not_regular:{path.name}")
        with path.open("rb") as handle:
            value = handle.read()
        after = path.lstat()
    except OSError:
        deny(f"read_failed:{path.name}")
    identity = lambda value: (value.st_dev, value.st_ino, value.st_mode, value.st_size,
                              value.st_mtime_ns, value.st_ctime_ns)
    if identity(before) != identity(after) or len(value) != after.st_size:
        deny(f"changed_during_read:{path.name}")
    return value, after


def read_build_id(path: Path) -> str:
    raw, _ = stable_bytes(path)
    try:
        text = raw.decode("ascii")
    except UnicodeDecodeError:
        deny("frontend_build_id_encoding")
    if text.endswith("\n"):
        text = text[:-1]
    if not text or "\n" in text or "\r" in text or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", text):
        deny("frontend_build_id_format")
    return text


def json_object(raw: bytes, label: str) -> dict[str, Any]:
    try:
        value = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError):
        deny(f"json_invalid:{label}")
    if not isinstance(value, dict):
        deny(f"json_object:{label}")
    return value


def run(command: list[str], cwd: Path, env: dict[str, str]) -> str:
    result = subprocess.run(command, cwd=cwd, env=env, text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    if result.returncode:
        deny(f"command_failed:{command[0]}:{result.returncode}")
    return result.stdout.strip()


def build_environment() -> dict[str, str]:
    allowed = {
        "PATH", "HOME", "USER", "LOGNAME", "TMPDIR", "XDG_CACHE_HOME",
        "npm_config_cache", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY",
        "http_proxy", "https_proxy", "no_proxy", "SSL_CERT_FILE", "SSL_CERT_DIR",
    }
    return {name: value for name, value in os.environ.items() if name in allowed}


def ensure_clean_repo(repo: Path, target: str) -> None:
    if not repo.is_absolute() or not repo.is_dir():
        deny("repo_absolute_directory")
    head = run(["git", "rev-parse", "HEAD"], repo, os.environ.copy())
    if head != target:
        deny("target_head_mismatch")
    status = run(["git", "status", "--porcelain", "--untracked-files=normal"], repo, os.environ.copy())
    if status:
        deny("worktree_not_clean")


def toolchain(repo: Path, env: dict[str, str]) -> dict[str, str]:
    node = run(["node", "--version"], repo, env)
    npm = run(["npm", "--version"], repo, env)
    if node != "v20.20.0":
        deny(f"node_version:{node}")
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", npm):
        deny("npm_version")
    return {"node": node, "npm": npm}


def forbidden(relative: PurePosixPath) -> bool:
    lowered = [part.casefold() for part in relative.parts]
    name = lowered[-1] if lowered else ""
    if any(part in {".git", ".cache", "cache", "coverage", "logs", "log", "evidence",
                    "evidences", "uploads", "upload", "worker", "worker-runtime",
                    "whatsapp-web-worker"} for part in lowered):
        return True
    if name == ".env" or name.startswith(".env.") or name.endswith(".log"):
        return True
    if name.endswith((".tar", ".tar.xz", ".tmp")):
        return True
    return False


def copy_entry(source: Path, destination: Path, relative: PurePosixPath) -> None:
    if forbidden(relative):
        return
    info = source.lstat()
    if stat.S_ISLNK(info.st_mode):
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.symlink_to(os.readlink(source))
    elif stat.S_ISDIR(info.st_mode):
        destination.mkdir(parents=True, exist_ok=True)
        for child in sorted(source.iterdir(), key=lambda item: item.name):
            copy_entry(child, destination / child.name, relative / child.name)
    elif stat.S_ISREG(info.st_mode):
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination, follow_symlinks=False)
        os.chmod(destination, 0o755 if info.st_mode & 0o111 else 0o644)
    else:
        deny(f"source_entry_type:{relative.as_posix()}")


def copy_allowlist(source_root: Path, destination: Path, names: Iterable[str]) -> None:
    destination.mkdir(mode=0o755)
    for name in names:
        source = source_root / name
        if not source.exists() and not source.is_symlink():
            if name in {"public", "next.config.js", "next.config.mjs", "next.config.ts"}:
                continue
            deny(f"runtime_source_missing:{name}")
        copy_entry(source, destination / name, PurePosixPath(name))


def normalize_tree(root: Path, epoch: int) -> None:
    paths = [root, *sorted(root.rglob("*"), key=lambda item: item.as_posix())]
    for path in paths:
        info = path.lstat()
        if stat.S_ISLNK(info.st_mode):
            continue
        if stat.S_ISDIR(info.st_mode):
            os.chmod(path, 0o755)
        elif stat.S_ISREG(info.st_mode):
            os.chmod(path, 0o755 if info.st_mode & 0o111 else 0o644)
        else:
            deny(f"release_entry_type:{path.relative_to(root)}")
        os.utime(path, (epoch, epoch), follow_symlinks=False)


def inside(child: Path, parent: Path) -> bool:
    return child == parent or parent in child.parents


def scan_runtime(release_root: Path) -> list[dict[str, Any]]:
    resolved_root = release_root.resolve(strict=True)
    entries: list[dict[str, Any]] = []
    for runtime_name in RUNTIMES:
        root = release_root / runtime_name
        if not root.is_dir() or root.is_symlink():
            deny(f"release_runtime_missing:{runtime_name}")
        for path in [root, *sorted(root.rglob("*"), key=lambda item: item.as_posix())]:
            relative = path.relative_to(release_root)
            if forbidden(PurePosixPath(relative.as_posix())):
                deny(f"forbidden_release_entry:{relative.as_posix()}")
            info = path.lstat()
            item: dict[str, Any] = {"path": relative.as_posix(), "mode": stat.S_IMODE(info.st_mode)}
            if stat.S_ISREG(info.st_mode):
                raw, stable = stable_bytes(path)
                item.update(type="file", size=stable.st_size, sha256=sha256_bytes(raw))
            elif stat.S_ISDIR(info.st_mode):
                item["type"] = "directory"
            elif stat.S_ISLNK(info.st_mode):
                item.update(type="symlink", target=os.readlink(path))
                try:
                    resolved = path.resolve(strict=True)
                except OSError:
                    deny(f"release_symlink_broken:{relative.as_posix()}")
                if not inside(resolved, resolved_root):
                    deny(f"release_symlink_escape:{relative.as_posix()}")
            else:
                deny(f"release_entry_type:{relative.as_posix()}")
            entries.append(item)
    return entries


def validate_index(release_root: Path, raw: bytes) -> tuple[str, int]:
    index = json_object(raw, "index.sha256")
    if set(index) != {"schemaVersion", "scope", "entries"}:
        deny("release_index_fields")
    if index["schemaVersion"] != 1 or index["scope"] != list(RUNTIMES):
        deny("release_index_schema")
    entries = index["entries"]
    if not isinstance(entries, list):
        deny("release_index_entries")
    paths: set[str] = set()
    for entry in entries:
        if not isinstance(entry, dict) or not isinstance(entry.get("path"), str):
            deny("release_index_entry")
        relative = PurePosixPath(entry["path"])
        if relative.is_absolute() or not relative.parts or any(part in {"", ".", ".."} for part in relative.parts):
            deny("release_index_path")
        if relative.parts[0] not in RUNTIMES or entry["path"] in paths:
            deny("release_index_scope")
        paths.add(entry["path"])
        kind = entry.get("type")
        allowed = {"path", "type", "mode"}
        if kind == "file":
            allowed |= {"size", "sha256"}
            if not isinstance(entry.get("size"), int) or entry["size"] < 0 or not SHA256.fullmatch(str(entry.get("sha256", ""))):
                deny("release_index_file")
        elif kind == "symlink":
            allowed.add("target")
            if not isinstance(entry.get("target"), str):
                deny("release_index_symlink")
        elif kind != "directory":
            deny("release_index_type")
        if set(entry) != allowed or not isinstance(entry.get("mode"), int):
            deny("release_index_entry_fields")
    observed = scan_runtime(release_root)
    if observed != entries:
        expected_by_path = {entry["path"]: entry for entry in entries}
        actual_by_path = {entry["path"]: entry for entry in observed}
        if set(expected_by_path) != set(actual_by_path):
            deny("release_index_inventory")
        mismatch = next(path for path in expected_by_path if expected_by_path[path] != actual_by_path[path])
        deny(f"release_index_mismatch:{mismatch}")
    return sha256_bytes(raw), len(entries)


def validate_manifest(release_root: Path, expected_target: str, expected_release: str) -> dict[str, Any]:
    manifest_raw, _ = stable_bytes(release_root / "manifest.json")
    index_raw, _ = stable_bytes(release_root / "index.sha256")
    manifest = json_object(manifest_raw, "manifest.json")
    if set(manifest) != MANIFEST_FIELDS or manifest.get("schemaVersion") != 1:
        deny("release_manifest_schema")
    if manifest.get("producer") != {"name": "converta-release.py", "formatVersion": 1}:
        deny("release_manifest_producer")
    if manifest.get("releaseId") != expected_release or manifest.get("targetCommit") != expected_target:
        deny("release_manifest_identity")
    if manifest.get("components") != list(COMPONENTS):
        deny("release_manifest_components")
    epoch = manifest.get("sourceDateEpoch")
    if not isinstance(epoch, int) or epoch < 0:
        deny("release_manifest_epoch")
    expected_time = dt.datetime.fromtimestamp(epoch, dt.timezone.utc).isoformat().replace("+00:00", "Z")
    if manifest.get("builtAt") != expected_time:
        deny("release_manifest_time")
    tools = manifest.get("toolchain")
    if not isinstance(tools, dict) or set(tools) != {"node", "npm"} or tools.get("node") != "v20.20.0":
        deny("release_manifest_toolchain")
    reproducibility = manifest.get("reproducibility")
    if reproducibility != {"deterministic": True, "nonReproducibleFields": []}:
        deny("release_manifest_reproducibility")
    index_sha, entry_count = validate_index(release_root, index_raw)
    if manifest.get("indexSha256") != index_sha:
        deny("release_manifest_index")
    runtimes = manifest.get("runtimes")
    if not isinstance(runtimes, dict) or set(runtimes) != set(COMPONENTS):
        deny("release_manifest_runtimes")
    api = runtimes["api"]
    frontend = runtimes["frontend"]
    if not isinstance(api, dict) or set(api) != {"entrypoint", "entrySha256"}:
        deny("release_manifest_api")
    if api.get("entrypoint") != "api-runtime/dist/index.js" or not SHA256.fullmatch(str(api.get("entrySha256", ""))):
        deny("release_manifest_api")
    entry_raw, _ = stable_bytes(release_root / api["entrypoint"])
    if sha256_bytes(entry_raw) != api["entrySha256"]:
        deny("release_api_entrypoint")
    if not isinstance(frontend, dict) or set(frontend) != {"buildId"}:
        deny("release_manifest_frontend")
    build_id = read_build_id(release_root / "frontend-runtime/.next/BUILD_ID")
    if not build_id or frontend.get("buildId") != build_id:
        deny("release_frontend_build_id")
    return {"manifestSha256": sha256_bytes(manifest_raw), "indexSha256": index_sha,
            "indexEntries": entry_count, "buildId": build_id,
            "apiEntrySha256": api["entrySha256"]}


def tar_filter(epoch: int):
    def normalize(member: tarfile.TarInfo) -> tarfile.TarInfo:
        member.uid = member.gid = 0
        member.uname = member.gname = ""
        member.mtime = epoch
        member.pax_headers = {}
        return member
    return normalize


def write_tar(release_root: Path, tar_path: Path, epoch: int) -> str:
    if tar_path.exists():
        deny("tar_destination_exists")
    with tarfile.open(tar_path, "w", format=tarfile.PAX_FORMAT, dereference=False) as archive:
        archive.add(release_root, arcname=release_root.name, recursive=True,
                    filter=tar_filter(epoch))
    with tar_path.open("rb") as handle:
        os.fsync(handle.fileno())
    return sha256_bytes(stable_bytes(tar_path)[0])


def compress_tar(tar_path: Path, package_path: Path) -> str:
    temporary = package_path.with_name(f".{package_path.name}.{os.getpid()}.tmp")
    if package_path.exists() or temporary.exists():
        deny("package_destination_exists")
    with tar_path.open("rb") as source, lzma.open(temporary, "wb", preset=9) as compressed:
        shutil.copyfileobj(source, compressed, length=1024 * 1024)
    with temporary.open("rb") as handle:
        os.fsync(handle.fileno())
    try:
        with lzma.open(temporary, "rb") as handle:
            while handle.read(1024 * 1024):
                pass
        with tarfile.open(temporary, "r:xz") as archive:
            archive.getmembers()
    except (OSError, EOFError, lzma.LZMAError, tarfile.TarError):
        deny("package_integrity")
    for command, predicate in ((["xz", "-t", "--", str(temporary)], "package_xz_test"),
                               (["tar", "-tJf", str(temporary)], "package_tar_test")):
        result = subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if result.returncode:
            deny(predicate)
    os.replace(temporary, package_path)
    directory_fd = os.open(package_path.parent, os.O_DIRECTORY)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)
    return sha256_bytes(stable_bytes(package_path)[0])


def write_package(release_root: Path, package_path: Path, epoch: int) -> dict[str, str]:
    tar_path = package_path.with_name(f".{package_path.name}.{os.getpid()}.tar.tmp")
    if tar_path.exists():
        deny("tar_destination_exists")
    try:
        tar_sha = write_tar(release_root, tar_path, epoch)
        package_sha = compress_tar(tar_path, package_path)
    finally:
        if tar_path.exists():
            tar_path.unlink()
    return {"tarSha256": tar_sha, "packageSha256": package_sha}


def safe_extract(package: Path, destination: Path, expected_release: str) -> Path:
    if not package.is_file() or package.is_symlink():
        deny("package_missing")
    package_raw, _ = stable_bytes(package)
    try:
        with tarfile.open(fileobj=io.BytesIO(package_raw), mode="r:xz") as archive:
            members = archive.getmembers()
            if not members:
                deny("package_empty")
            for member in members:
                relative = PurePosixPath(member.name)
                if relative.is_absolute() or not relative.parts or relative.parts[0] != expected_release or any(part in {"", ".", ".."} for part in relative.parts):
                    deny("package_path")
                if member.isdev() or member.isfifo() or member.islnk():
                    deny("package_entry_type")
                if member.issym():
                    logical = PurePosixPath(member.name).parent / member.linkname
                    normalized = Path("/") / logical
                    normalized = Path(os.path.normpath(normalized.as_posix()))
                    if not normalized.parts or len(normalized.parts) < 2 or normalized.parts[1] != expected_release:
                        deny("package_symlink_escape")
            archive.extractall(destination, filter="data")
    except Denied:
        raise
    except (OSError, EOFError, lzma.LZMAError, tarfile.TarError):
        deny("package_integrity")
    root = destination / expected_release
    if not root.is_dir() or root.is_symlink():
        deny("package_release_root")
    return root


def verify_root(root: Path, target: str, release_id: str) -> dict[str, Any]:
    if not root.is_absolute() or not root.is_dir() or root.is_symlink():
        deny("release_root")
    if root.name != release_id:
        deny("release_directory_identity")
    allowed = {"manifest.json", "index.sha256", *RUNTIMES}
    if {entry.name for entry in root.iterdir()} != allowed:
        deny("release_root_inventory")
    return validate_manifest(root, target, release_id)


def build(args: argparse.Namespace) -> None:
    if not args.output.is_absolute():
        deny("output_absolute")
    repo = args.repo.resolve(strict=True)
    ensure_clean_repo(repo, args.target)
    if args.components != ",".join(COMPONENTS):
        deny("components")
    if args.output.exists():
        deny("output_exists")
    args.output.mkdir(mode=0o755, parents=False)
    env = build_environment()
    env.update(SOURCE_DATE_EPOCH=str(args.source_date_epoch), TZ="UTC", LANG="C.UTF-8",
               LC_ALL="C.UTF-8", CI="1", NEXT_TELEMETRY_DISABLED="1")
    tools = toolchain(repo, env)
    run(["npm", "ci"], repo, env)
    api_source = repo / "apps/whatsapp-agent"
    run(["npm", "ci", "--include=dev"], api_source, env)
    run(["npm", "run", "db:generate"], api_source, env)
    run(["npm", "run", "build"], api_source, env)
    run(["npm", "run", "build"], repo, env)

    release_root = args.output / args.release_id
    release_root.mkdir(mode=0o755)
    copy_allowlist(api_source, release_root / "api-runtime",
                   ("dist", "node_modules", "package.json", "package-lock.json"))
    copy_allowlist(repo, release_root / "frontend-runtime",
                   (".next", "node_modules", "public", "package.json", "package-lock.json",
                    "next.config.js", "next.config.mjs", "next.config.ts"))
    ensure_clean_repo(repo, args.target)
    normalize_tree(release_root, args.source_date_epoch)
    entries = scan_runtime(release_root)
    index_raw = canonical_json({"schemaVersion": 1, "scope": list(RUNTIMES), "entries": entries})
    (release_root / "index.sha256").write_bytes(index_raw)
    entry_raw, _ = stable_bytes(release_root / "api-runtime/dist/index.js")
    build_id = read_build_id(release_root / "frontend-runtime/.next/BUILD_ID")
    timestamp = dt.datetime.fromtimestamp(args.source_date_epoch, dt.timezone.utc).isoformat().replace("+00:00", "Z")
    manifest = {
        "schemaVersion": 1,
        "producer": {"name": "converta-release.py", "formatVersion": 1},
        "releaseId": args.release_id,
        "targetCommit": args.target,
        "components": list(COMPONENTS),
        "sourceDateEpoch": args.source_date_epoch,
        "builtAt": timestamp,
        "toolchain": tools,
        "runtimes": {
            "api": {"entrypoint": "api-runtime/dist/index.js", "entrySha256": sha256_bytes(entry_raw)},
            "frontend": {"buildId": build_id},
        },
        "indexSha256": sha256_bytes(index_raw),
        "reproducibility": {"deterministic": True, "nonReproducibleFields": []},
    }
    (release_root / "manifest.json").write_bytes(canonical_json(manifest))
    normalize_tree(release_root, args.source_date_epoch)
    verified = verify_root(release_root, args.target, args.release_id)
    package = args.output / f"{args.release_id}.tar.xz"
    package_identity = write_package(release_root, package, args.source_date_epoch)
    with tempfile.TemporaryDirectory(prefix="converta-release-extract-", dir=args.output.parent) as temporary:
        extracted = safe_extract(package, Path(temporary), args.release_id)
        extracted_verified = verify_root(extracted, args.target, args.release_id)
        if extracted_verified != verified or canonical_json(scan_runtime(extracted)) != canonical_json(scan_runtime(release_root)):
            deny("independent_extraction_mismatch")
    print(canonical_json({"result": "RELEASE BUILT", "releaseId": args.release_id,
                          "targetCommit": args.target, "package": str(package),
                          **package_identity, **verified}).decode().strip())


def verify(args: argparse.Namespace) -> None:
    if args.components != ",".join(COMPONENTS):
        deny("components")
    if bool(args.release_root) == bool(args.package):
        deny("verify_source")
    if args.release_root:
        result = verify_root(args.release_root.resolve(strict=True), args.target, args.release_id)
    else:
        with tempfile.TemporaryDirectory(prefix="converta-release-verify-") as temporary:
            root = safe_extract(args.package.resolve(strict=True), Path(temporary), args.release_id)
            result = verify_root(root, args.target, args.release_id)
    print(canonical_json({"result": "RELEASE VERIFIED", "releaseId": args.release_id,
                          "targetCommit": args.target, **result}).decode().strip())


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    commands = root.add_subparsers(dest="command", required=True)
    build_parser = commands.add_parser("build")
    build_parser.add_argument("--repo", type=Path, required=True)
    build_parser.add_argument("--target", required=True)
    build_parser.add_argument("--release-id", required=True)
    build_parser.add_argument("--components", required=True)
    build_parser.add_argument("--output", type=Path, required=True)
    build_parser.add_argument("--source-date-epoch", type=int, required=True)
    build_parser.set_defaults(handler=build)
    verify_parser = commands.add_parser("verify")
    source = verify_parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--release-root", type=Path)
    source.add_argument("--package", type=Path)
    verify_parser.add_argument("--target", required=True)
    verify_parser.add_argument("--release-id", required=True)
    verify_parser.add_argument("--components", required=True)
    verify_parser.set_defaults(handler=verify)
    return root


def main() -> int:
    args = parser().parse_args()
    if not SHA40.fullmatch(args.target):
        deny("target_format")
    if not RELEASE_ID.fullmatch(args.release_id):
        deny("release_id_format")
    if getattr(args, "source_date_epoch", 0) < 0:
        deny("source_date_epoch")
    try:
        # Extraction and creation must not inherit an operator-specific umask;
        # relevant modes are authenticated by the index itself.
        previous_umask = os.umask(0o022)
        try:
            args.handler(args)
        finally:
            os.umask(previous_umask)
        return 0
    except Denied as error:
        print(f"RELEASE_DENY:{error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
