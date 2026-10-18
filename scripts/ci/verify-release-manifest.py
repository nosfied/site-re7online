#!/usr/bin/env python3
"""Verify a release surface against Git without building or touching production."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def require(condition: bool, reason: str) -> None:
    if not condition:
        raise SystemExit(f"RELEASE_MANIFEST_INVALID: {reason}")


def git_output(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True).strip()


def manifest_blob(commit: str, path_text: str) -> str:
    return git_output("rev-parse", f"{commit}:{path_text}")


def blob_size(blob_sha: str) -> int:
    return int(git_output("cat-file", "-s", blob_sha))


def main() -> None:
    require(len(sys.argv) == 2, "usage: verify-release-manifest.py MANIFEST")
    manifest_path = (ROOT / sys.argv[1]).resolve()
    require(manifest_path.is_relative_to(ROOT), "manifest outside repository")
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    require(data.get("schemaVersion") == 1, "schemaVersion")
    require(data.get("deploymentOrder") == ["api", "frontend"], "deployment order")
    require(data.get("migrationRequired") is False, "migration must remain excluded")
    require(data.get("workerChanged") is False, "worker must remain excluded")
    require(data.get("automaticReplayForbidden") is True, "replay guard")

    candidate_commit = str(data.get("candidateCommit", "")).strip()
    require(bool(candidate_commit), "candidateCommit")
    try:
        git_output("cat-file", "-e", f"{candidate_commit}^{{commit}}")
    except subprocess.CalledProcessError:
        require(False, f"candidate commit unavailable: {candidate_commit}")

    runtime = data.get("runtimeFiles", {})
    require(set(runtime) == {"api", "frontend"}, "runtime roles")
    entries = runtime["api"] + runtime["frontend"] + data.get("validationFiles", [])
    require(entries, "empty release")
    paths = [entry.get("path") for entry in entries]
    require(len(paths) == len(set(paths)), "duplicate path")

    for entry in entries:
        path_text = entry.get("path", "")
        path = (ROOT / path_text).resolve()
        require(path.is_relative_to(ROOT), f"path outside repository: {path_text}")
        try:
            blob_sha = manifest_blob(candidate_commit, path_text)
        except subprocess.CalledProcessError:
            require(False, f"missing path at candidate commit: {path_text}")
        require(blob_size(blob_sha) == entry.get("bytes"), f"byte drift at candidate commit: {path_text}")
        require(blob_sha == entry.get("gitBlobSha"), f"blob drift at candidate commit: {path_text}")

    forbidden_prefixes = ("apps/whatsapp-agent/prisma/", "apps/whatsapp-web-worker/")
    for path_text in paths:
        require(not path_text.startswith(forbidden_prefixes),
                f"excluded runtime surface: {path_text}")
    print(f"RELEASE_MANIFEST_OK: {len(entries)} pinned files at {candidate_commit[:12]}; api then frontend")


if __name__ == "__main__":
    main()
