"""Local metadata inventory for manual review. No production certificate or apply mode."""
import argparse
import datetime
import json
import os
from pathlib import Path
import stat
import time


def inventory(roots, max_entries=100000, seconds=30):
    started = time.monotonic()
    objects, errors, symlinks, seen_dirs = {}, [], [], set()
    stack = []
    for root in roots:
        p = Path(os.path.abspath(root))
        # Deny traversal via symbolic ancestors as well as symbolic roots.
        if p.resolve() != p or not p.is_dir() or p.is_symlink():
            raise ValueError('root_not_literal_directory')
        stack.append(p)
    entries = 0
    while stack:
        if entries >= max_entries or time.monotonic() - started >= seconds:
            errors.append({'stage': 'budget', 'errorClass': 'InventoryLimit'})
            break
        p = stack.pop()
        try:
            before = p.lstat()
            key = (before.st_dev, before.st_ino)
            if stat.S_ISLNK(before.st_mode):
                symlinks.append({'path': str(p), 'target': os.readlink(p),
                                 'destinationTraversed': False})
            item = objects.setdefault(key, {
                'device': key[0], 'inode': key[1], 'allocatedBytes': before.st_blocks * 512,
                'apparentBytes': before.st_size, 'mode': stat.S_IMODE(before.st_mode),
                'type': stat.S_IFMT(before.st_mode), 'uid': before.st_uid,
                'gid': before.st_gid, 'nlink': before.st_nlink, 'paths': [],
                'mtimeNs': before.st_mtime_ns, 'ctimeNs': before.st_ctime_ns})
            if str(p) not in item['paths']:
                item['paths'].append(str(p))
            if stat.S_ISDIR(before.st_mode) and key not in seen_dirs:
                seen_dirs.add(key)
                fd = os.open(p, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
                try:
                    opened = os.fstat(fd)
                    if (opened.st_dev, opened.st_ino) != key:
                        raise ValueError('directory_identity_drift')
                    with os.scandir(fd) as children:
                        for child in children:
                            stack.append(p / child.name)
                            if len(stack) + entries > max_entries:
                                raise ValueError('entry_budget_exceeded')
                finally:
                    os.close(fd)
            after = p.lstat()
            if (before.st_dev, before.st_ino, before.st_mode, before.st_mtime_ns,
                before.st_ctime_ns) != (after.st_dev, after.st_ino, after.st_mode,
                                       after.st_mtime_ns, after.st_ctime_ns):
                errors.append({'path': str(p), 'stage': 'consistency', 'errorClass': 'Drift'})
            entries += 1
        except (OSError, ValueError) as e:
            errors.append({'path': str(p), 'stage': 'metadata',
                           'errorClass': type(e).__name__, 'errno': getattr(e, 'errno', None)})
    grouped = {}
    for item in objects.values():
        if item['type'] == stat.S_IFREG:
            grouped.setdefault(item['apparentBytes'], []).append(item)
    candidates = [{'apparentBytes': size, 'objects': [i['paths'] for i in items],
                   'reason': 'same_size_only_hash_compatibility_references_and_custody_required',
                   'withdrawalEligible': False}
                  for size, items in sorted(grouped.items(), reverse=True)
                  if size >= 1024 * 1024 and len(items) > 1]
    return {
        'schemaVersion': 1, 'atUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'mode': 'LOCAL_READ_ONLY_DRY_RUN', 'entries': entries,
        'metadataCompleteWithinBudget': not errors,
        'uniqueAllocatedBytes': sum(i['allocatedBytes'] for i in objects.values()),
        'objects': list(objects.values()), 'symlinks': symlinks, 'errors': errors,
        'externalHardlinks': [i['paths'] for i in objects.values()
                              if i['type'] == stat.S_IFREG and i['nlink'] > len(i['paths'])],
        'reviewCandidates': candidates, 'recoverableBytes': None,
        'capacityPass': None, 'withdrawalAuthorized': False,
        'limits': ['metadata walk is not an atomic snapshot or ownership observation',
                   'no content hashing or transitive production reference resolution',
                   'no SQL/WAL/deploy/PostgreSQL capacity measurement',
                   'shared extents/reflinks require filesystem-specific accounting'],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', action='append', required=True)
    parser.add_argument('--output', required=True, help='new private local JSON report')
    parser.add_argument('--max-entries', type=int, default=100000)
    parser.add_argument('--seconds', type=float, default=30)
    parser.add_argument('--dry-run', action='store_true', required=True)
    args = parser.parse_args()
    if not 1 <= args.max_entries <= 1000000 or not 0 < args.seconds <= 60:
        parser.error('budget outside reviewed limits')
    output = Path(os.path.abspath(args.output))
    if output.parent.resolve() != output.parent:
        parser.error('output parent must not traverse symlinks')
    # Write after capture, outside the scanned roots, so own report cannot affect inventory.
    roots = [Path(os.path.abspath(r)) for r in args.root]
    if any(output.is_relative_to(r) for r in roots):
        parser.error('output must be outside inventoried roots')
    os.umask(0o077)
    report = inventory(roots, args.max_entries, args.seconds)
    fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as f:
        json.dump(report, f, sort_keys=True)
        f.write('\n')
    print(json.dumps({k: report[k] for k in ('mode', 'entries', 'metadataCompleteWithinBudget',
                     'uniqueAllocatedBytes', 'withdrawalAuthorized')}))
    return 0 if report['metadataCompleteWithinBudget'] else 2


if __name__ == '__main__':
    raise SystemExit(main())
