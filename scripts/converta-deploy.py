#!/usr/bin/env python3
"""Minimal API/frontend deploy coordinator for the proven fixed-current route."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable


SHA40 = re.compile(r"^[0-9a-f]{40}$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")
STATES = {
    "PREFLIGHT_PASS", "ACTIVATING", "AWAITING_ACCEPTANCE", "FINALIZING",
    "DEPLOYED", "ROLLING_BACK", "ROLLED_BACK", "FAILED",
}
COMPONENTS = ("api", "frontend")
STABLE = {
    "api": Path("/opt/re7online/current/api"),
    "frontend": Path("/opt/re7online/current/frontend"),
}
RUNTIME_DIR = {"api": "api-runtime", "frontend": "frontend-runtime"}
PORT = {"api": 3001, "frontend": 3000}
LOCAL_HEALTH = {
    "api": "http://127.0.0.1:3001/health",
    "frontend": "http://127.0.0.1:3000/app/login",
}
PUBLIC_HEALTH = {
    "api": "https://converta.re7online.com/health",
    "frontend": "https://converta.re7online.com/app/login",
}
FRONTEND_GET_PATHS = ("/app/login", "/app/inbox", "/app/crm", "/app/templates", "/app/campaigns")
LOCK = Path("/opt/re7online/backups/converta-persistent/deploy.lock")
PM2_CANDIDATES = (
    Path.home() / ".npm-global/bin/pm2", Path.home() / ".local/bin/pm2",
    Path("/usr/local/bin/pm2"),
)


class Denied(RuntimeError):
    pass


def deny(reason: str) -> None:
    raise Denied(reason)


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def regular_private(path: Path, mode: int = 0o600) -> None:
    try:
        info = path.lstat()
    except FileNotFoundError:
        deny(f"missing_private_file:{path.name}")
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode):
        deny(f"private_file_type:{path.name}")
    if stat.S_IMODE(info.st_mode) != mode:
        deny(f"private_file_mode:{path.name}")


def private_file_identity(path: Path) -> dict[str, int | str]:
    regular_private(path)
    info = path.stat()
    return {
        "sha256": digest(path), "uid": info.st_uid, "gid": info.st_gid,
        "mode": format(stat.S_IMODE(info.st_mode), "04o"),
    }


def private_directory(path: Path) -> None:
    info = path.lstat()
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
        deny(f"private_root_type:{path.name}")
    if stat.S_IMODE(info.st_mode) != 0o700:
        deny(f"private_root_mode:{path.name}")


def read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        deny(f"invalid_json:{path.name}:{type(error).__name__}")
    if not isinstance(value, dict):
        deny(f"json_object_required:{path.name}")
    return value


def atomic_private(path: Path, value: dict[str, Any], *, exclusive: bool = False) -> None:
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    private_directory(path.parent)
    if exclusive and path.exists():
        deny(f"destination_exists:{path.name}")
    raw = (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temp = Path(temporary)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb", closefd=True) as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        if exclusive and path.exists():
            deny(f"destination_exists:{path.name}")
        os.replace(temp, path)
        directory_fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        temp.unlink(missing_ok=True)


def atomic_symlink(link: Path, target: Path) -> None:
    temporary = link.with_name(f".{link.name}.deploy-{os.getpid()}")
    temporary.unlink(missing_ok=True)
    os.symlink(target, temporary)
    os.replace(temporary, link)


def atomic_marker(path: Path, value: dict[str, Any]) -> None:
    if path.exists():
        deny("deployed_marker_exists")
    raw = (json.dumps(value, sort_keys=True, separators=(",", ":")) + "\n").encode()
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temp = Path(temporary)
    try:
        os.fchmod(fd, 0o644)
        with os.fdopen(fd, "wb", closefd=True) as stream:
            stream.write(raw); stream.flush(); os.fsync(stream.fileno())
        if path.exists():
            deny("deployed_marker_exists")
        os.replace(temp, path)
        directory_fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        temp.unlink(missing_ok=True)


def find_digest(value: Any, filename: str) -> str | None:
    if isinstance(value, dict):
        direct = value.get(filename)
        if isinstance(direct, str) and SHA256.fullmatch(direct):
            return direct
        if value.get("path") == filename or value.get("name") == filename:
            for key in ("sha256", "digest", "hash"):
                result = value.get(key)
                if isinstance(result, str) and SHA256.fullmatch(result):
                    return result
        for child in value.values():
            result = find_digest(child, filename)
            if result:
                return result
    elif isinstance(value, list):
        for child in value:
            result = find_digest(child, filename)
            if result:
                return result
    return None


@dataclass(frozen=True)
class Inputs:
    release: str
    target: str
    control_plane: str
    components: tuple[str, ...]
    config_root: Path
    transaction_root: Path

    def binding(self) -> dict[str, Any]:
        return {
            "release": self.release, "target": self.target,
            "controlPlane": self.control_plane, "components": list(self.components),
            "configRoot": str(self.config_root.resolve()),
            "transactionRoot": str(self.transaction_root.resolve()),
        }


class Host:
    """Small host surface; tests replace this object without changing the CLI."""

    def run(self, command: list[str], *, timeout: float = 40) -> subprocess.CompletedProcess[str]:
        return subprocess.run(command, text=True, capture_output=True, timeout=timeout, check=False)

    def get(self, url: str, timeout: float = 10) -> int:
        request = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return int(response.status)

    def pm2_rows(self, pm2: Path) -> list[dict[str, Any]]:
        result = self.run([str(pm2), "jlist"])
        if result.returncode:
            deny("pm2_jlist_failed")
        try:
            rows = json.loads(result.stdout)
        except json.JSONDecodeError:
            deny("pm2_jlist_invalid")
        if not isinstance(rows, list):
            deny("pm2_jlist_shape")
        return rows

    def pm2_mutate(self, pm2: Path, args: list[str]) -> None:
        result = self.run([str(pm2), *args], timeout=60)
        if result.returncode:
            deny(f"pm2_command_failed:{args[0]}")

    def control(self, root: Path, args: list[str]) -> dict[str, Any]:
        result = self.run([sys.executable, str(root / "scripts/pm2-definition-control.py"), *args], timeout=45)
        if result.returncode:
            reason = result.stderr.strip().splitlines()[-1] if result.stderr.strip() else "control_failed"
            deny(reason[:240])
        try:
            value = json.loads(result.stdout)
        except json.JSONDecodeError:
            deny("control_output_invalid")
        if not isinstance(value, dict):
            deny("control_output_shape")
        return value


class Driver:
    def __init__(self, inputs: Inputs, *, host: Host | None = None,
                 repo: Path | None = None, releases: Path = Path("/opt/re7online/releases"),
                 stable: dict[str, Path] | None = None, lock: Path = LOCK,
                 dump: Path | None = None, pm2: Path | None = None,
                 clock: Callable[[], float] = time.time):
        self.inputs = inputs
        self.host = host or Host()
        self.repo = (repo or Path(__file__).resolve().parents[1]).resolve()
        self.releases = releases
        self.stable = stable or STABLE
        self.lock = lock
        self.dump = dump or (Path.home() / ".pm2/dump.pm2")
        self.pm2 = pm2
        self.clock = clock
        self.journal = inputs.transaction_root / "transaction.v1.private.json"
        self.acceptance = inputs.transaction_root / "acceptance.private.txt"
        self.release_root = releases / inputs.release

    def _definition_paths(self, component: str, role: str) -> dict[str, Path]:
        prefix = f"{component}-{role}"
        return {
            "request": self.inputs.config_root / f"{prefix}.request.private.json",
            "source": self.inputs.config_root / f"{prefix}.source.private.json",
            "definition": self.inputs.config_root / f"{prefix}.pm2.private.json",
        }

    def _manifest(self) -> dict[str, Any]:
        path = self.inputs.config_root / "manifest.private.json"
        regular_private(path)
        return read_json(path)

    def _authenticated_config(self) -> dict[str, Any]:
        private_directory(self.inputs.config_root)
        manifest = self._manifest()
        result: dict[str, Any] = {}
        for component in COMPONENTS:
            result[component] = {}
            for role in ("candidate", "rollback"):
                paths = self._definition_paths(component, role)
                hashes: dict[str, str] = {}
                for kind, path in paths.items():
                    regular_private(path)
                    expected = find_digest(manifest, path.name)
                    if expected is None:
                        deny(f"config_manifest_missing:{path.name}")
                    observed = digest(path)
                    if observed != expected:
                        deny(f"config_hash_mismatch:{path.name}")
                    hashes[kind] = observed
                result[component][role] = {"paths": paths, "hashes": hashes}
        return result

    def _resolve_pm2(self) -> Path:
        if self.pm2 is not None:
            candidate = self.pm2
        else:
            candidate = next((path for path in PM2_CANDIDATES if path.is_file()), None)
            if candidate is None:
                deny("pm2_not_found")
        if not candidate.is_absolute() or not candidate.is_file():
            deny("pm2_invalid")
        result = self.host.run([str(candidate), "--version"])
        if result.returncode or result.stdout.strip().splitlines()[-1:] != ["6.0.14"]:
            deny("pm2_version")
        return candidate

    def _control_head(self) -> None:
        result = self.host.run(["git", "-C", str(self.repo), "rev-parse", "HEAD"])
        if result.returncode or result.stdout.strip() != self.inputs.control_plane:
            deny("control_plane_identity")
        status = self.host.run(["git", "-C", str(self.repo), "status", "--porcelain", "--untracked-files=no"])
        if status.returncode or status.stdout.strip():
            deny("control_plane_not_clean")

    def _release(self, config: dict[str, Any]) -> dict[str, Any]:
        if not SHA40.fullmatch(self.inputs.target):
            deny("target_format")
        if self.release_root.parent != self.releases or not self.release_root.is_dir():
            deny("release_missing")
        manifest_path = self.release_root / "manifest.json"
        index_path = self.release_root / "index.sha256"
        if not manifest_path.is_file() or manifest_path.is_symlink():
            deny("release_manifest_missing")
        if not index_path.is_file() or index_path.is_symlink():
            deny("release_index_missing")
        manifest = read_json(manifest_path)
        target = manifest.get("targetCommit", manifest.get("target"))
        if target != self.inputs.target:
            deny("release_target")
        declared_components = manifest.get("components") or manifest.get("payloadComponents")
        if declared_components is not None and sorted(declared_components) != list(COMPONENTS):
            deny("release_components")
        for component in COMPONENTS:
            source = read_json(config[component]["candidate"]["paths"]["source"])
            identity = source.get("releaseIdentity", {})
            if identity.get("releaseId") != self.inputs.release:
                deny(f"release_identity:{component}")
            if identity.get("releaseManifestSha256") != digest(manifest_path):
                deny(f"release_manifest_identity:{component}")
            runtime = self.release_root / RUNTIME_DIR[component]
            if not runtime.is_dir():
                deny(f"release_runtime_missing:{component}")
        return {"manifestSha256": digest(manifest_path), "indexSha256": digest(index_path)}

    def _control_args(self, component: str, role: str) -> list[str]:
        paths = self._definition_paths(component, role)
        return [
            "--request", str(paths["request"]), "--source-artifact", str(paths["source"]),
            "--source-sha256", digest(paths["source"]), "--definition", str(paths["definition"]),
        ]

    def _validate_config(self) -> None:
        for component in COMPONENTS:
            for role in ("candidate", "rollback"):
                self.host.control(self.repo, ["validate", *self._control_args(component, role)])
            candidate = self._definition_paths(component, "candidate")
            rollback = self._definition_paths(component, "rollback")
            self.host.control(self.repo, [
                "validate-pair",
                "--candidate-request", str(candidate["request"]),
                "--candidate-source-artifact", str(candidate["source"]),
                "--candidate-source-sha256", digest(candidate["source"]),
                "--candidate-definition", str(candidate["definition"]),
                "--rollback-request", str(rollback["request"]),
                "--rollback-source-artifact", str(rollback["source"]),
                "--rollback-source-sha256", digest(rollback["source"]),
                "--rollback-definition", str(rollback["definition"]),
            ])

    def _row(self, rows: list[dict[str, Any]], name: str) -> dict[str, Any]:
        matches = [row for row in rows if row.get("name") == name]
        if len(matches) != 1:
            deny(f"process_identity_count:{name}:{len(matches)}")
        row = matches[0]
        env = row.get("pm2_env", {})
        pid = row.get("pid")
        if env.get("status") != "online" or not isinstance(pid, int) or pid <= 0:
            deny(f"process_not_online:{name}")
        return row

    def _ticks(self, pid: int) -> int:
        try:
            text = Path(f"/proc/{pid}/stat").read_text()
            return int(text[text.rfind(")") + 2:].split()[19])
        except (OSError, ValueError, IndexError):
            deny(f"process_ticks:{pid}")

    def _identity(self, row: dict[str, Any]) -> dict[str, Any]:
        env = row["pm2_env"]
        pid = row["pid"]
        return {
            "name": row["name"], "pid": pid, "startTicks": self._ticks(pid),
            "cwd": env.get("pm_cwd"), "script": env.get("pm_exec_path"),
            "restartCount": env.get("restart_time", 0),
        }

    def _worker(self, rows: list[dict[str, Any]]) -> dict[str, Any]:
        return self._identity(self._row(rows, "re7-whatsapp-web-worker"))

    def _process_name(self, component: str, role: str = "candidate") -> str:
        definition = read_json(self._definition_paths(component, role)["definition"])
        apps = definition.get("apps", [])
        if len(apps) != 1 or not isinstance(apps[0].get("name"), str):
            deny(f"definition_name:{component}:{role}")
        return apps[0]["name"]

    def _health(self, *, candidate_asset: bool = False) -> None:
        urls = [LOCAL_HEALTH["api"], PUBLIC_HEALTH["api"]]
        for path in FRONTEND_GET_PATHS:
            urls.extend((f"http://127.0.0.1:3000{path}", f"https://converta.re7online.com{path}"))
        if candidate_asset:
            static_root = self.release_root / "frontend-runtime/.next/static"
            assets = sorted(path for path in static_root.rglob("*")
                            if path.is_file() and not path.is_symlink())
            if not assets:
                deny("frontend_asset_missing")
            asset_path = "/_next/static/" + assets[0].relative_to(static_root).as_posix()
            urls.extend((f"http://127.0.0.1:3000{asset_path}",
                         f"https://converta.re7online.com{asset_path}"))
        for url in urls:
            try:
                status = self.host.get(url)
            except Exception:
                deny("health_request_failed")
            if status != 200:
                deny(f"health_status:{status}")

    def _journal_read(self) -> dict[str, Any]:
        regular_private(self.journal)
        journal = read_json(self.journal)
        if journal.get("schemaVersion") != 1 or journal.get("state") not in STATES:
            deny("transaction_schema")
        if journal.get("binding") != self.inputs.binding():
            deny("transaction_binding")
        return journal

    def _journal_write(self, journal: dict[str, Any], state: str) -> None:
        if state not in STATES:
            deny("transaction_state")
        journal["state"] = state
        journal["updatedAtUnix"] = int(self.clock())
        atomic_private(self.journal, journal)

    def preflight(self) -> None:
        if self.inputs.components != COMPONENTS:
            deny("components_must_be_api_frontend")
        if self.journal.exists():
            deny("transaction_exists")
        if self.inputs.transaction_root.exists():
            private_directory(self.inputs.transaction_root)
            if any(self.inputs.transaction_root.iterdir()):
                deny("transaction_root_not_empty")
        else:
            self.inputs.transaction_root.mkdir(mode=0o700, parents=True)
        self._control_head()
        config = self._authenticated_config()
        release = self._release(config)
        self._validate_config()
        pm2 = self._resolve_pm2()
        rows = self.host.pm2_rows(pm2)
        worker = self._worker(rows)
        for component in COMPONENTS:
            self._identity(self._row(rows, self._process_name(component, "rollback")))
        regular_private(self.dump)
        if shutil.disk_usage(self.inputs.transaction_root).free < 64 * 1024 * 1024:
            deny("insufficient_space")
        self._health()
        journal = {
            "schemaVersion": 1, "state": "PREFLIGHT_PASS", "binding": self.inputs.binding(),
            "preflight": {"release": release, "worker": worker,
                          "dump": private_file_identity(self.dump),
                          "pm2": str(pm2.resolve())},
            "saveCount": 0, "deployedMarkerCreated": False,
            "createdAtUnix": int(self.clock()), "updatedAtUnix": int(self.clock()),
        }
        atomic_private(self.journal, journal, exclusive=True)

    def _acquire_lock(self, journal: dict[str, Any]) -> None:
        self.lock.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
        try:
            fd = os.open(self.lock, flags, 0o600)
        except FileExistsError:
            deny("global_lock_active")
        with os.fdopen(fd, "w") as stream:
            stream.write(hashlib.sha256(json.dumps(journal["binding"], sort_keys=True).encode()).hexdigest() + "\n")
            stream.flush(); os.fsync(stream.fileno())
        journal["lockDigest"] = digest(self.lock)

    def _release_lock(self, journal: dict[str, Any]) -> None:
        regular_private(self.lock)
        if digest(self.lock) != journal.get("lockDigest"):
            deny("global_lock_identity")
        self.lock.unlink()

    def _readiness(self, component: str, role: str) -> dict[str, Any]:
        source = read_json(self._definition_paths(component, role)["source"])
        release_id = source.get("releaseIdentity", {}).get("releaseId")
        if not isinstance(release_id, str):
            deny(f"readiness_release:{component}:{role}")
        release_root = self.releases / release_id / RUNTIME_DIR[component]
        return self.host.control(self.repo, [
            "wait-readiness", *self._control_args(component, role),
            "--pm2", str(self._resolve_pm2()), "--stable-path", str(self.stable[component]),
            "--release-root", str(release_root), "--port", str(PORT[component]),
            "--local-health", LOCAL_HEALTH[component], "--public-health", PUBLIC_HEALTH[component],
            "--deadline-seconds", "30", "--poll-seconds", "0.5",
        ])

    def _select(self, component: str, role: str) -> dict[str, Any]:
        pm2 = self._resolve_pm2()
        name = self._process_name(component, role)
        self.host.pm2_mutate(pm2, ["delete", name])
        self.host.pm2_mutate(pm2, ["start", str(self._definition_paths(component, role)["definition"])])
        return self._readiness(component, role)

    def activate(self) -> None:
        journal = self._journal_read()
        if journal["state"] != "PREFLIGHT_PASS":
            deny("activate_state")
        self._control_head(); self._authenticated_config(); self._validate_config()
        self._acquire_lock(journal)
        try:
            rows = self.host.pm2_rows(self._resolve_pm2())
            previous = {
                "symlinks": {component: os.readlink(self.stable[component]) for component in COMPONENTS},
                "worker": self._worker(rows),
                "processes": {component: self._identity(self._row(rows, self._process_name(component, "rollback"))) for component in COMPONENTS},
                "dump": private_file_identity(self.dump),
            }
            rollback_dump = self.inputs.transaction_root / "rollback.dump.pm2"
            if rollback_dump.exists():
                deny("rollback_dump_exists")
            shutil.copyfile(self.dump, rollback_dump)
            os.chmod(rollback_dump, 0o600)
            with rollback_dump.open("rb") as stream: os.fsync(stream.fileno())
        except Exception:
            self._release_lock(journal)
            raise
        journal["previous"] = previous
        journal["rollbackDumpSha256"] = digest(rollback_dump)
        self._journal_write(journal, "ACTIVATING")
        try:
            readiness: dict[str, Any] = {}
            for component in COMPONENTS:
                atomic_symlink(self.stable[component], self.release_root / RUNTIME_DIR[component])
                readiness[component] = self._select(component, "candidate")
                if component == "frontend":
                    build_id = (self.release_root / "frontend-runtime/.next/BUILD_ID").read_text().strip()
                    source = read_json(self._definition_paths("frontend", "candidate")["source"])
                    if build_id != source.get("releaseIdentity", {}).get("frontendBuildId"):
                        deny("frontend_build_id")
            self._health(candidate_asset=True)
            worker = self._worker(self.host.pm2_rows(self._resolve_pm2()))
            if worker != previous["worker"]:
                deny("worker_changed")
            journal["candidate"] = {"readiness": readiness, "worker": worker}
            self._journal_write(journal, "AWAITING_ACCEPTANCE")
        except Exception as error:
            journal["failure"] = type(error).__name__
            self._journal_write(journal, "ROLLING_BACK")
            self._rollback_internal(journal)
            raise

    def _rollback_internal(self, journal: dict[str, Any]) -> None:
        previous = journal.get("previous", {})
        for component in reversed(COMPONENTS):
            target = previous.get("symlinks", {}).get(component)
            if not isinstance(target, str):
                self._journal_write(journal, "FAILED"); deny(f"rollback_symlink_missing:{component}")
            atomic_symlink(self.stable[component], Path(target))
            self._select(component, "rollback")
        self._health()
        worker = self._worker(self.host.pm2_rows(self._resolve_pm2()))
        if worker != previous.get("worker"):
            self._journal_write(journal, "FAILED"); deny("rollback_worker_changed")
        self._release_lock(journal)
        self._journal_write(journal, "ROLLED_BACK")

    def rollback(self) -> None:
        journal = self._journal_read()
        if journal["state"] not in {"ACTIVATING", "AWAITING_ACCEPTANCE", "FAILED"}:
            deny("rollback_state")
        self._journal_write(journal, "ROLLING_BACK")
        self._rollback_internal(journal)

    def finalize(self) -> None:
        journal = self._journal_read()
        if journal["state"] != "AWAITING_ACCEPTANCE":
            deny("finalize_state")
        regular_private(self.acceptance)
        if self.acceptance.read_text(encoding="utf-8").strip() != "ACEITE TÉCNICO PASS":
            deny("technical_acceptance")
        if journal.get("saveCount") != 0 or journal.get("deployedMarkerCreated") is not False:
            deny("finalize_replay")
        self._control_head(); self._authenticated_config(); self._validate_config()
        final_readiness: dict[str, Any] = {}
        for component in COMPONENTS:
            if self.stable[component].resolve(strict=True) != (self.release_root / RUNTIME_DIR[component]).resolve(strict=True):
                deny(f"finalize_symlink:{component}")
            final_readiness[component] = self._readiness(component, "candidate")
            activated = journal.get("candidate", {}).get("readiness", {}).get(component, {})
            for key in ("pid", "startTicks"):
                if final_readiness[component].get(key) != activated.get(key):
                    deny(f"finalize_identity_changed:{component}:{key}")
        self._health(candidate_asset=True)
        worker = self._worker(self.host.pm2_rows(self._resolve_pm2()))
        if worker != journal.get("previous", {}).get("worker"):
            deny("finalize_worker_changed")
        self._journal_write(journal, "FINALIZING")
        self.host.pm2_mutate(self._resolve_pm2(), ["save"])
        journal["saveCount"] = 1
        final_dump = private_file_identity(self.dump)
        prior_dump = journal.get("preflight", {}).get("dump", {})
        if (final_dump["uid"], final_dump["gid"]) != (prior_dump.get("uid"), prior_dump.get("gid")):
            self._journal_write(journal, "FAILED"); deny("final_dump_owner")
        journal["finalDumpSha256"] = final_dump["sha256"]
        marker = self.release_root / "DEPLOYED"
        if marker.exists():
            self._journal_write(journal, "FAILED"); deny("deployed_marker_exists")
        atomic_marker(marker, {
            "target": self.inputs.target, "controlPlane": self.inputs.control_plane,
            "release": self.inputs.release, "dumpSha256": journal["finalDumpSha256"],
            "accepted": "ACEITE TÉCNICO PASS", "deployedAtUnix": int(self.clock()),
        })
        journal["deployedMarkerCreated"] = True
        journal["deployedMarkerSha256"] = digest(marker)
        self._release_lock(journal)
        self._journal_write(journal, "DEPLOYED")

    def status(self) -> str:
        journal = self._journal_read()
        summary = {
            "state": journal["state"], "release": self.inputs.release,
            "target": self.inputs.target, "controlPlane": self.inputs.control_plane,
            "saveCount": journal.get("saveCount", 0),
            "deployedMarkerCreated": journal.get("deployedMarkerCreated", False),
        }
        return json.dumps(summary, sort_keys=True)


def parse() -> tuple[str, Inputs]:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("preflight", "activate", "finalize", "rollback", "status"))
    parser.add_argument("--release", required=True)
    parser.add_argument("--target", required=True)
    parser.add_argument("--control-plane", required=True)
    parser.add_argument("--components", required=True)
    parser.add_argument("--config-root", type=Path, required=True)
    parser.add_argument("--transaction-root", type=Path, required=True)
    args = parser.parse_args()
    components = tuple(args.components.split(","))
    return args.command, Inputs(args.release, args.target, args.control_plane,
                                components, args.config_root, args.transaction_root)


def main() -> int:
    try:
        command, inputs = parse()
        driver = Driver(inputs)
        if command == "status":
            print(driver.status())
            return 0
        getattr(driver, command)()
    except (Denied, OSError, subprocess.SubprocessError) as error:
        print(f"DEPLOY_DENY:{str(error)[:240]}", file=sys.stderr)
        return 2
    print({"preflight": "PREFLIGHT PASS", "activate": "AWAITING_ACCEPTANCE",
           "finalize": "DEPLOYED", "rollback": "ROLLED_BACK"}[command])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
