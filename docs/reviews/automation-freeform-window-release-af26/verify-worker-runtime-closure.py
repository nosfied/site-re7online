#!/usr/bin/env python3
"""Check the compiled minimum worker package before archiving or after extraction.

This scans every application JS file, including literal dynamic imports. External
packages are shipped whole; startup and scenario tests must exercise their
conditional paths separately.
"""
from __future__ import annotations

import hashlib
import re
import sys
from pathlib import Path

IMPORT = re.compile(
    r"(?:\b(?:import|export)\s+(?:[^;\n]*?\s+from\s*)?|\brequire\s*\(|\bimport\s*\()\s*['\"]([^'\"]+)['\"]"
)
CALL = re.compile(r"\b(?:import|require)\s*\(\s*([^\s])")
ENTRY = "apps/whatsapp-web-worker/dist/whatsapp-web-worker/src/index.js"


def main() -> None:
    root = Path(sys.argv[1]).resolve(strict=True)
    app = root / "apps/whatsapp-web-worker"
    dist = app / "dist"
    if not (root / ENTRY).is_file():
        raise SystemExit("entrypoint_missing")
    missing: list[str] = []
    bare: set[str] = set()
    dynamic = 0
    imports = 0
    files = list(dist.rglob("*.js"))
    for file in files:
        source = file.read_text(errors="replace")
        for call in CALL.finditer(source):
            if call.group(1) not in "'\"":
                missing.append(f"nonliteral_dynamic_import:{file.relative_to(root)}")
        for specifier in IMPORT.findall(source):
            imports += 1
            if specifier.startswith("."):
                target = (file.parent / specifier).resolve()
                if not target.is_file() and not target.with_suffix(".js").is_file():
                    missing.append(f"missing_relative:{file.relative_to(root)}:{specifier}")
            elif not specifier.startswith("node:"):
                package = specifier.split("/")
                name = "/".join(package[:2]) if specifier.startswith("@") else package[0]
                bare.add(name)
                if not (app / "node_modules" / name / "package.json").is_file():
                    missing.append(f"missing_package:{name}")
            if f'import("{specifier}")' in source or f"import('{specifier}')" in source:
                dynamic += 1
    root_package = root / "package.json"
    if not root_package.is_file():
        missing.append("root_package_missing")
    for link in root.rglob("*"):
        if link.is_symlink() and not link.resolve().is_relative_to(root):
            missing.append(f"escaping_symlink:{link.relative_to(root)}")
    if missing:
        for issue in missing:
            print(issue, file=sys.stderr)
        raise SystemExit(1)
    print(f"CLOSURE_PASS files={len(files)} imports={imports} literal_dynamic={dynamic} external_packages={len(bare)}")
    print("entry_sha256=" + hashlib.sha256((root / ENTRY).read_bytes()).hexdigest())


if __name__ == "__main__":
    main()
