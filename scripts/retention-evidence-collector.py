#!/usr/bin/env python3
"""Preserve one completed retention evidence tree. Sources are never removed."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat

SHA256 = __import__('re').compile(r'^[0-9a-f]{64}$')
BROAD_PATHS = {Path('/'), Path('/tmp'), Path('/var/tmp'), Path('/home'), Path('/opt')}


def literal_path(raw, label):
    if not isinstance(raw, str) or not raw.strip():
        raise ValueError(f'{label}_empty')
    path = Path(raw)
    if not path.is_absolute() or Path(os.path.abspath(raw)) != path or path in BROAD_PATHS:
        raise ValueError(f'{label}_not_narrow_absolute')
    if '..' in path.parts:
        raise ValueError(f'{label}_traversal')
    return path


def private_directory(path, uid, label):
    before = path.lstat()
    if path.is_symlink() or not stat.S_ISDIR(before.st_mode):
        raise ValueError(f'{label}_not_directory')
    if before.st_uid != uid or stat.S_IMODE(before.st_mode) != 0o700:
        raise ValueError(f'{label}_owner_or_mode')
    if path.resolve(strict=True) != path:
        raise ValueError(f'{label}_symlink_ancestor')
    return before


def stable_file(path):
    before = path.lstat()
    if path.is_symlink() or not stat.S_ISREG(before.st_mode):
        raise ValueError('helper_not_regular')
    if path.resolve(strict=True) != path:
        raise ValueError('helper_symlink_ancestor')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    digest = hashlib.sha256()
    try:
        opened = os.fstat(fd)
        if (before.st_dev, before.st_ino, before.st_mode, before.st_size,
                before.st_mtime_ns, before.st_ctime_ns) != (
                opened.st_dev, opened.st_ino, opened.st_mode, opened.st_size,
                opened.st_mtime_ns, opened.st_ctime_ns):
            raise ValueError('helper_identity_drift')
        while True:
            chunk = os.read(fd, 1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    finally:
        os.close(fd)
    after = path.lstat()
    if (before.st_dev, before.st_ino, before.st_mode, before.st_size,
            before.st_mtime_ns, before.st_ctime_ns) != (
            after.st_dev, after.st_ino, after.st_mode, after.st_size,
            after.st_mtime_ns, after.st_ctime_ns):
        raise ValueError('helper_identity_drift')
    return before, digest.hexdigest()


def executor_can_read(path, uid, gid):
    if os.geteuid() == uid and os.getegid() == gid:
        try:
            fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW); os.close(fd)
            return True
        except OSError:
            return False
    if os.geteuid() != 0:
        return False
    read_fd, write_fd = os.pipe()
    pid = os.fork()
    if pid == 0:
        try:
            os.close(read_fd)
            os.setgroups([])
            os.setgid(gid)
            os.setuid(uid)
            fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
            os.close(fd)
            os.write(write_fd, b'1')
        except BaseException:
            try: os.write(write_fd, b'0')
            except OSError: pass
        finally:
            os._exit(0)
    os.close(write_fd)
    result = os.read(read_fd, 1)
    os.close(read_fd)
    _, status = os.waitpid(pid, 0)
    return result == b'1' and os.WIFEXITED(status) and os.WEXITSTATUS(status) == 0


def validate_helper(path, expected_sha, uid, gid):
    if not SHA256.fullmatch(expected_sha or ''):
        raise ValueError('helper_sha256_format')
    info, actual = stable_file(path)
    if info.st_uid != uid or info.st_gid != gid or stat.S_IMODE(info.st_mode) != 0o600:
        raise ValueError('helper_owner_or_mode')
    if actual != expected_sha:
        raise ValueError('helper_sha256')
    if not executor_can_read(path, uid, gid):
        raise ValueError('helper_not_readable_by_executor')
    return actual


def entry_index(root):
    result = []
    for path in [root, *sorted(root.rglob('*'))]:
        rel = '.' if path == root else path.relative_to(root).as_posix()
        info = path.lstat()
        item = {'path': rel, 'mode': stat.S_IMODE(info.st_mode)}
        if stat.S_ISREG(info.st_mode):
            _, digest = stable_file(path)
            item.update(type='file', size=info.st_size, sha256=digest)
        elif stat.S_ISDIR(info.st_mode):
            item['type'] = 'directory'
        elif stat.S_ISLNK(info.st_mode):
            item.update(type='symlink', target=os.readlink(path))
        else:
            raise ValueError('source_entry_type')
        result.append(item)
    return result


def validate_contract(source_raw, custody_raw, destination_raw, helper_raw,
                      helper_sha, executor_uid, executor_gid, require_source=True):
    source = literal_path(source_raw, 'source')
    custody = literal_path(custody_raw, 'custody')
    destination = literal_path(destination_raw, 'destination')
    helper = literal_path(helper_raw, 'helper')
    private_directory(custody, os.geteuid(), 'custody')
    if destination.parent != custody or destination == custody:
        raise ValueError('destination_outside_custody')
    if destination.exists() or destination.is_symlink():
        raise ValueError('destination_exists')
    if source == destination or source in destination.parents or destination in source.parents:
        raise ValueError('source_destination_overlap')
    if require_source:
        private_directory(source, executor_uid, 'source')
    validate_helper(helper, helper_sha, executor_uid, executor_gid)
    return source, custody, destination, helper


def collect(args):
    if os.geteuid() != args.executor_uid or os.getegid() != args.executor_gid:
        raise ValueError('collector_executor_identity')
    source, custody, destination, helper = validate_contract(
        args.source_root, args.custody_root, args.destination_root, args.helper,
        args.helper_sha256, args.executor_uid, args.executor_gid)
    before = entry_index(source)
    try:
        shutil.copytree(source, destination, symlinks=True, copy_function=shutil.copy2)
        destination.chmod(0o700)
        after_source = entry_index(source)
        copied = entry_index(destination)
        if before != after_source:
            raise ValueError('source_drift_during_collection')
        if before != copied:
            raise ValueError('copied_tree_mismatch')
        receipt = {
            'schemaVersion': 1, 'result': 'PRESERVED', 'sourcePreserved': True,
            'entryCount': len(before), 'helperSha256': args.helper_sha256,
            'executorUid': args.executor_uid, 'executorGid': args.executor_gid,
            'treeSha256': hashlib.sha256(json.dumps(before, sort_keys=True,
                separators=(',', ':')).encode()).hexdigest(),
        }
        raw = (json.dumps(receipt, sort_keys=True) + '\n').encode()
        fd = os.open(destination / 'collection-receipt.private.json',
                     os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'wb') as out:
            out.write(raw); out.flush(); os.fsync(out.fileno())
        dirfd = os.open(destination, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try: os.fsync(dirfd)
        finally: os.close(dirfd)
        return receipt
    except BaseException:
        # Deliberately keep both the source and any partial destination for diagnosis.
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', required=True)
    parser.add_argument('--custody-root', required=True)
    parser.add_argument('--destination-root', required=True)
    parser.add_argument('--helper', required=True)
    parser.add_argument('--helper-sha256', required=True)
    parser.add_argument('--executor-uid', required=True, type=int)
    parser.add_argument('--executor-gid', required=True, type=int)
    parser.add_argument('--validate-only', action='store_true')
    args = parser.parse_args()
    if args.executor_uid < 0 or args.executor_gid < 0:
        parser.error('executor identity must be non-negative')
    if args.validate_only:
        validate_contract(args.source_root, args.custody_root, args.destination_root,
                          args.helper, args.helper_sha256, args.executor_uid,
                          args.executor_gid)
        print(json.dumps({'result': 'VALIDATED', 'sourcePreserved': True}))
        return
    result = collect(args)
    print(json.dumps({'result': result['result'], 'entryCount': result['entryCount'],
                      'sourcePreserved': result['sourcePreserved']}))


if __name__ == '__main__':
    raise SystemExit(main())
