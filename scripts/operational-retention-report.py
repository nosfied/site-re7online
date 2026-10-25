"""Local metadata inventory for manual review. No production certificate or apply mode."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import stat
import time


CATALOG_STATES = {'ACTIVE', 'RETURN', 'COMPLETE', 'FAILED', 'SUPERSEDED'}
CATALOG_CUSTODY = {'HOST_REQUIRED', 'NOT_PROVEN', 'VERIFIED_OFF_HOST'}


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


def stat_identity(value):
    return (value.st_dev, value.st_ino, value.st_mode, value.st_nlink,
            value.st_uid, value.st_gid, value.st_size, value.st_mtime_ns,
            value.st_ctime_ns)


def stable_hash(path, deadline, hash_budget):
    before = path.lstat()
    if not stat.S_ISREG(before.st_mode) or path.is_symlink():
        raise ValueError('hash_not_regular')
    if before.st_size > hash_budget[0]:
        raise ValueError('hash_budget_exceeded')
    digest = hashlib.sha256()
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    opened = os.fstat(fd)
    if stat_identity(before) != stat_identity(opened):
        os.close(fd)
        raise ValueError('hash_identity_drift')
    with os.fdopen(fd, 'rb') as source:
        while True:
            if time.monotonic() >= deadline:
                raise TimeoutError('hash_deadline_exceeded')
            chunk = source.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    after = path.lstat()
    if stat_identity(before) != stat_identity(after):
        raise ValueError('hash_identity_drift')
    hash_budget[0] -= before.st_size
    return digest.hexdigest()


def canonical_tree(root, deadline, hash_budget):
    root = Path(os.path.abspath(root))
    if root.resolve() != root or not root.is_dir() or root.is_symlink():
        raise ValueError('comparison_root_not_literal_directory')
    entries, observations = [], {}
    stack = [root]
    while stack:
        if time.monotonic() >= deadline:
            raise TimeoutError('comparison_deadline_exceeded')
        path = stack.pop()
        info = path.lstat()
        relative = '.' if path == root else path.relative_to(root).as_posix()
        item = {'path': relative, 'mode': stat.S_IMODE(info.st_mode)}
        observation = {'identity': stat_identity(info)}
        if stat.S_ISREG(info.st_mode):
            item.update(type='file', size=info.st_size,
                        sha256=stable_hash(path, deadline, hash_budget))
        elif stat.S_ISDIR(info.st_mode):
            item['type'] = 'directory'
        elif stat.S_ISLNK(info.st_mode):
            target = os.readlink(path)
            item.update(type='symlink', target=target)
            observation['target'] = target
        else:
            raise ValueError('comparison_entry_type')
        entries.append(item)
        if stat.S_ISDIR(info.st_mode):
            fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
            try:
                if stat_identity(info) != stat_identity(os.fstat(fd)):
                    raise ValueError('comparison_tree_drift')
                names = sorted(child.name for child in os.scandir(fd))
                observation['children'] = tuple(names)
                stack.extend(path / name for name in reversed(names))
            finally:
                os.close(fd)
        after = path.lstat()
        if stat_identity(info) != stat_identity(after):
            raise ValueError('comparison_tree_drift')
        observations[relative] = observation
    entries.sort(key=lambda item: item['path'])
    raw = json.dumps(entries, sort_keys=True, separators=(',', ':')).encode()
    return entries, hashlib.sha256(raw).hexdigest(), observations


def revalidate_tree(root, observations, deadline, label):
    root = Path(os.path.abspath(root))
    seen, stack = set(), [root]
    try:
        while stack:
            if time.monotonic() >= deadline:
                raise TimeoutError('comparison_deadline_exceeded')
            path = stack.pop()
            relative = '.' if path == root else path.relative_to(root).as_posix()
            expected = observations.get(relative)
            if expected is None:
                raise ValueError(f'comparison_tree_drift:{label}')
            info = path.lstat()
            if stat_identity(info) != expected['identity']:
                raise ValueError(f'comparison_tree_drift:{label}')
            seen.add(relative)
            if stat.S_ISLNK(info.st_mode):
                if os.readlink(path) != expected.get('target'):
                    raise ValueError(f'comparison_tree_drift:{label}')
            elif stat.S_ISDIR(info.st_mode):
                fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
                try:
                    if stat_identity(info) != stat_identity(os.fstat(fd)):
                        raise ValueError(f'comparison_tree_drift:{label}')
                    names = tuple(sorted(child.name for child in os.scandir(fd)))
                finally:
                    os.close(fd)
                if names != expected.get('children'):
                    raise ValueError(f'comparison_tree_drift:{label}')
                stack.extend(path / name for name in reversed(names))
        if seen != set(observations):
            raise ValueError(f'comparison_tree_drift:{label}')
        # Directory identities close the observation interval after descendants
        # have been checked, detecting a late add/remove/rename in their scope.
        for relative, expected in observations.items():
            if 'children' not in expected:
                continue
            path = root if relative == '.' else root / relative
            if stat_identity(path.lstat()) != expected['identity']:
                raise ValueError(f'comparison_tree_drift:{label}')
    except (FileNotFoundError, NotADirectoryError, OSError) as error:
        raise ValueError(f'comparison_tree_drift:{label}') from error


def compare_trees(source, destination, seconds=60, max_hash_bytes=8 * 1024**3):
    deadline = time.monotonic() + seconds
    budget = [max_hash_bytes]
    source_entries, source_digest, source_observations = canonical_tree(
        source, deadline, budget
    )
    destination_entries, destination_digest, destination_observations = canonical_tree(
        destination, deadline, budget
    )
    # Recheck both complete namespaces only after both content reads. This catches,
    # among other changes, a source mutation while destination content was hashed.
    revalidate_tree(source, source_observations, deadline, 'source')
    revalidate_tree(destination, destination_observations, deadline, 'destination')
    source_by_path = {item['path']: item for item in source_entries}
    destination_by_path = {item['path']: item for item in destination_entries}
    source_only = sorted(set(source_by_path) - set(destination_by_path))
    destination_only = sorted(set(destination_by_path) - set(source_by_path))
    common = set(source_by_path) & set(destination_by_path)
    changed = sorted(path for path in common if source_by_path[path] != destination_by_path[path])
    attributes = ('type', 'mode', 'size', 'sha256', 'target')
    difference_counts = {
        attribute: sum(source_by_path[path].get(attribute) != destination_by_path[path].get(attribute)
                       for path in common)
        for attribute in attributes
    }
    return {
        'source': str(Path(source).resolve()),
        'destination': str(Path(destination).resolve()),
        'sourceEntries': len(source_entries),
        'destinationEntries': len(destination_entries),
        'sourceDigest': source_digest,
        'destinationDigest': destination_digest,
        'sourceOnlyCount': len(source_only),
        'destinationOnlyCount': len(destination_only),
        'changedCount': len(changed),
        'differenceCountsByAttribute': difference_counts,
        'firstDifferences': {
            'sourceOnly': source_only[:20],
            'destinationOnly': destination_only[:20],
            'changed': changed[:20],
        },
        'contentAndMetadataEquivalent': not source_only and not destination_only and not changed,
        'sourceContentContainedInDestination': not source_only and not any(
            difference_counts[attribute] for attribute in ('type', 'size', 'sha256', 'target')
        ),
        'withdrawalEligible': False,
        'remainingHashBudgetBytes': budget[0],
    }


def read_private_json(path):
    path = Path(os.path.abspath(path))
    before = path.lstat()
    if (path.is_symlink() or not stat.S_ISREG(before.st_mode) or
            stat.S_IMODE(before.st_mode) != 0o600 or before.st_uid != os.geteuid()):
        raise ValueError('catalog_not_private_regular')
    raw = path.read_bytes()
    after = path.lstat()
    identity = lambda value: (value.st_dev, value.st_ino, value.st_mode, value.st_size,
                              value.st_mtime_ns, value.st_ctime_ns)
    if identity(before) != identity(after):
        raise ValueError('catalog_identity_drift')
    try:
        return json.loads(raw), hashlib.sha256(raw).hexdigest()
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError('catalog_json') from error


def generation_summary(report, catalog):
    if not isinstance(catalog, dict) or set(catalog) != {'schemaVersion', 'generations'}:
        raise ValueError('catalog_schema')
    generations = catalog['generations']
    if catalog['schemaVersion'] != 1 or not isinstance(generations, list):
        raise ValueError('catalog_schema')
    objects = report['objects']
    result, identifiers = [], set()
    fields = {'generationId', 'state', 'roots', 'operationalReferences', 'custodyState'}
    for generation in generations:
        if not isinstance(generation, dict) or set(generation) != fields:
            raise ValueError('catalog_generation_fields')
        identifier = generation['generationId']
        if (not isinstance(identifier, str) or not identifier or identifier in identifiers or
                generation['state'] not in CATALOG_STATES or
                generation['custodyState'] not in CATALOG_CUSTODY or
                not isinstance(generation['roots'], list) or not generation['roots'] or
                not isinstance(generation['operationalReferences'], list) or
                any(not isinstance(item, str) or not item for item in generation['operationalReferences'])):
            raise ValueError('catalog_generation')
        identifiers.add(identifier)
        if any(not isinstance(root, str) or not Path(root).is_absolute()
               for root in generation['roots']):
            raise ValueError('catalog_root')
        roots = [Path(root) for root in generation['roots']]
        if any(root.resolve() != root or not root.is_dir() or root.is_symlink()
               for root in roots):
            raise ValueError('catalog_root')
        matched = []
        for item in objects:
            if any(any(Path(path) == root or Path(path).is_relative_to(root)
                       for root in roots) for path in item['paths']):
                matched.append(item)
        if any(not any(any(Path(path) == root or Path(path).is_relative_to(root)
                           for path in item['paths']) for item in objects)
               for root in roots):
            raise ValueError('catalog_root_not_in_inventory')
        result.append({
            **generation,
            'allocatedBytes': sum(item['allocatedBytes'] for item in matched),
            'objectCount': len(matched),
            'dispositionPending': generation['state'] in {'COMPLETE', 'FAILED', 'SUPERSEDED'} and
                                  generation['custodyState'] == 'NOT_PROVEN',
        })
    return {
        'items': result,
        'pendingAllocatedBytes': sum(item['allocatedBytes'] for item in result
                                     if item['dispositionPending']),
    }


def private_output_directory(path, expected_uid=None):
    """Hold the validated directory FD; never chmod/repair a divergent destination."""
    path = Path(os.path.abspath(path))
    uid = os.geteuid() if expected_uid is None else expected_uid
    if path.resolve() != path:
        raise ValueError('output_parent_symlink')
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        value = os.fstat(fd)
        if value.st_uid != uid or stat.S_IMODE(value.st_mode) != 0o700:
            raise ValueError('output_parent_owner_or_mode')
        current = path.lstat()
        if (value.st_dev, value.st_ino) != (current.st_dev, current.st_ino):
            raise ValueError('output_parent_identity_drift')
        return fd
    except BaseException:
        os.close(fd)
        raise


def ensure_new_output(fd, name):
    try:
        os.stat(name, dir_fd=fd, follow_symlinks=False)
    except FileNotFoundError:
        return
    raise ValueError('output_already_exists')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', action='append', required=True)
    parser.add_argument('--output', required=True, help='new private local JSON report')
    parser.add_argument('--max-entries', type=int, default=100000)
    parser.add_argument('--seconds', type=float, default=30)
    parser.add_argument('--compare-tree', action='append', default=[],
                        metavar='SOURCE::DESTINATION')
    parser.add_argument('--max-hash-bytes', type=int, default=8 * 1024**3)
    parser.add_argument('--generation-catalog', help='private 0600 generation catalog')
    parser.add_argument('--dry-run', action='store_true', required=True)
    args = parser.parse_args()
    if (not 1 <= args.max_entries <= 1000000 or not 0 < args.seconds <= 300 or
            not 0 < args.max_hash_bytes <= 128 * 1024**3):
        parser.error('budget outside reviewed limits')
    output = Path(os.path.abspath(args.output))
    if output.parent.resolve() != output.parent:
        parser.error('output parent must not traverse symlinks')
    # Write after capture, outside the scanned roots, so own report cannot affect inventory.
    roots = [Path(os.path.abspath(r)) for r in args.root]
    if any(output.is_relative_to(r) for r in roots):
        parser.error('output must be outside inventoried roots')
    os.umask(0o077)
    directory = private_output_directory(output.parent)
    try:
        ensure_new_output(directory, output.name)
        report = inventory(roots, args.max_entries, args.seconds)
        comparisons = []
        for pair in args.compare_tree:
            if pair.count('::') != 1:
                parser.error('comparison must be SOURCE::DESTINATION')
            source, destination = pair.split('::')
            comparisons.append(compare_trees(source, destination, args.seconds,
                                              args.max_hash_bytes))
        report['treeComparisons'] = comparisons
        if args.generation_catalog:
            catalog, catalog_sha = read_private_json(args.generation_catalog)
            report['generationCatalogSha256'] = catalog_sha
            report['generationSummary'] = generation_summary(report, catalog)
        else:
            report['generationCatalogSha256'] = None
            report['generationSummary'] = None
        # Recheck path binding and permissions after capture; use the held FD to write.
        check = private_output_directory(output.parent)
        try:
            a, b = os.fstat(directory), os.fstat(check)
            if (a.st_dev, a.st_ino) != (b.st_dev, b.st_ino):
                raise ValueError('output_parent_identity_drift')
        finally:
            os.close(check)
        fd = os.open(output.name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                     0o600, dir_fd=directory)
        with os.fdopen(fd, 'w') as f:
            json.dump(report, f, sort_keys=True)
            f.write('\n')
    finally:
        os.close(directory)
    print(json.dumps({k: report[k] for k in ('mode', 'entries', 'metadataCompleteWithinBudget',
                     'uniqueAllocatedBytes', 'withdrawalAuthorized')}))
    return 0 if report['metadataCompleteWithinBudget'] else 2


if __name__ == '__main__':
    raise SystemExit(main())
