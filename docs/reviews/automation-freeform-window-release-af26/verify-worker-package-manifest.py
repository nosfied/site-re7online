#!/usr/bin/env python3
"""Create or check a complete file manifest for an isolated worker package."""
from __future__ import annotations

import hashlib
import sys
from pathlib import Path

MANIFEST = "PACKAGE_FILES.sha256"
LINKS = "PACKAGE_SYMLINKS.txt"


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def rows(root: Path) -> tuple[list[str], list[str]]:
    files: list[str] = []
    links: list[str] = []
    for path in sorted(root.rglob("*")):
        relative = path.relative_to(root).as_posix()
        if relative == MANIFEST:
            continue
        if path.is_symlink():
            if not path.resolve().is_relative_to(root):
                raise ValueError(f"escaping_symlink:{relative}")
            links.append(f"{relative}\t{path.readlink()}")
        elif path.is_file():
            files.append(f"{digest(path)}  {relative}")
    return files, links


def main() -> None:
    command, arg = sys.argv[1:3]
    root = Path(arg).resolve(strict=True)
    if command == "write":
        _, links = rows(root)
        (root / LINKS).write_text("\n".join(links) + "\n")
        files, _ = rows(root)
        (root / MANIFEST).write_text("\n".join(files) + "\n")
    elif command != "verify":
        raise SystemExit("usage: manifest.py write|verify package_dir")
    files, links = rows(root)
    expected = (root / MANIFEST).read_text().splitlines()
    if files != expected or (root / LINKS).read_text().splitlines() != links:
        raise SystemExit("PACKAGE_MANIFEST_MISMATCH")
    print(f"PACKAGE_MANIFEST_PASS files={len(files)} symlinks={len(links)}")
    print(f"manifest_sha256={digest(root / MANIFEST)}")


if __name__ == "__main__":
    main()
