#!/usr/bin/env python3
"""Assemble pinned minimal-worker overlays; never start an application.
Arguments: baseline.tar.gz compiled-build-root compiled-API-test.js empty-output-dir
Requires Python >=3.12. Uses adjacent public manifests, no private configuration.
"""
import hashlib
import json
from pathlib import Path
import shutil
import sys
import tarfile


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def require(value, reason):
    if not value:
        raise RuntimeError(reason)


def main():
    require(len(sys.argv) == 5, "arguments_required")
    archive, build, test, out = map(lambda value: Path(value).resolve(), sys.argv[1:])
    docs = Path(__file__).resolve().parent
    manifest = json.loads((docs / "worker-reactive-transport-20261005.manifest.json").read_text())
    require(not out.exists(), "output_must_not_exist")
    require(sha(archive) == manifest["baseTarSha256"], "base_tar_hash")
    require(sha(test) == manifest["compiledTestSha256"], "compiled_test_hash")
    with tarfile.open(archive) as tar:
        tar.extractall(out, filter="data")
    for entry in manifest["changedCompiled"]:
        relative = Path(entry["path"])
        require(not relative.is_absolute() and ".." not in relative.parts, "manifest_path")
        target, candidate = out / relative, build / relative
        before = sha(target) if target.is_file() else None
        require(before == entry["beforeSha256"], "compiled_origin_hash")
        require(sha(candidate) == entry["afterSha256"], "compiled_candidate_hash")
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(candidate, target)
    relative = "apps/whatsapp-web-worker/dist/whatsapp-agent/src/whatsapp/reactiveOutboundPolicy.test.js"
    shutil.copy2(test, out / relative)
    expected_files = docs / "worker-reactive-transport-20261005.files.sha256"
    for line in expected_files.read_text().splitlines():
        digest, relative = line.split("  ", 1)
        require(sha(out / relative) == digest, "complete_package_file_hash")
    for line in (docs / "worker-reactive-transport-20261005.symlinks.txt").read_text().splitlines():
        relative, target = line.split("\t")
        link = out / relative
        require(link.is_symlink() and str(link.readlink()) == target and link.exists()
                and link.resolve().is_relative_to(out), "package_symlink")
    shutil.copy2(expected_files, out / "PACKAGE_FILES.sha256")
    require(sha(out / "PACKAGE_FILES.sha256") == manifest["manifestSha256"], "manifest_hash")
    print("PINNED_MINIMAL_WORKER_ASSEMBLY_PASS")


if __name__ == "__main__":
    main()
