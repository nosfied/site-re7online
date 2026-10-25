#!/usr/bin/env python3
"""Preserve one completed retention evidence tree. Sources are never removed."""
import argparse
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import stat
import time

SHA256 = __import__('re').compile(r'^[0-9a-f]{64}$')
BROAD_PATHS = {Path('/'), Path('/tmp'), Path('/var/tmp'), Path('/home'), Path('/opt')}
REPORT = Path(__file__).with_name('operational-retention-report.py')
REPORT_SPEC = importlib.util.spec_from_file_location('operational_retention_report', REPORT)
retention_report = importlib.util.module_from_spec(REPORT_SPEC)
REPORT_SPEC.loader.exec_module(retention_report)


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


def stable_file(path, label='helper'):
    before = path.lstat()
    if path.is_symlink() or not stat.S_ISREG(before.st_mode):
        raise ValueError(f'{label}_not_regular')
    if path.resolve(strict=True) != path:
        raise ValueError(f'{label}_symlink_ancestor')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    digest = hashlib.sha256()
    try:
        opened = os.fstat(fd)
        if (before.st_dev, before.st_ino, before.st_mode, before.st_size,
                before.st_mtime_ns, before.st_ctime_ns) != (
                opened.st_dev, opened.st_ino, opened.st_mode, opened.st_size,
                opened.st_mtime_ns, opened.st_ctime_ns):
            raise ValueError(f'{label}_identity_drift')
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
        raise ValueError(f'{label}_identity_drift')
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


def private_regular(path, uid, gid, label):
    info, _ = stable_file(path, label)
    if info.st_uid != uid or info.st_gid != gid or stat.S_IMODE(info.st_mode) != 0o600:
        raise ValueError(f'{label}_owner_or_mode')
    return info


class SourceWriterExclusion:
    """Hold the cooperative writer lock for the complete observation interval."""
    def __init__(self, path, uid, gid):
        self.path, self.uid, self.gid, self.fd = path, uid, gid, None

    def __enter__(self):
        before = private_regular(self.path, self.uid, self.gid, 'source_writer_lock')
        self.fd = os.open(self.path, os.O_RDWR | os.O_NOFOLLOW)
        opened = os.fstat(self.fd)
        if retention_report.stat_identity(before) != retention_report.stat_identity(opened):
            os.close(self.fd); self.fd = None
            raise ValueError('source_writer_lock_identity_drift')
        try:
            fcntl.flock(self.fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            os.close(self.fd); self.fd = None
            raise ValueError('source_writer_lock_busy') from error
        after = self.path.lstat()
        if retention_report.stat_identity(before) != retention_report.stat_identity(after):
            fcntl.flock(self.fd, fcntl.LOCK_UN)
            os.close(self.fd); self.fd = None
            raise ValueError('source_writer_lock_identity_drift')
        return self

    def __exit__(self, exc_type, exc, tb):
        if self.fd is not None:
            fcntl.flock(self.fd, fcntl.LOCK_UN)
            os.close(self.fd)
            self.fd = None


def entry_index(root, deadline, hash_budget, label):
    entries, digest, observations = retention_report.canonical_tree(
        root, deadline, hash_budget
    )
    retention_report.revalidate_tree(root, observations, deadline, label)
    return entries, digest, observations


def fsync_regular(path):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            raise ValueError('fsync_not_regular')
        os.fsync(fd)
    finally:
        os.close(fd)


def fsync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def fsync_copied_tree(destination, custody):
    files, directories = [], []
    for path in [destination, *destination.rglob('*')]:
        info = path.lstat()
        if stat.S_ISREG(info.st_mode):
            files.append(path)
        elif stat.S_ISDIR(info.st_mode):
            directories.append(path)
        elif not stat.S_ISLNK(info.st_mode):
            raise ValueError('fsync_entry_type')
    for path in sorted(files, key=lambda item: item.as_posix()):
        fsync_regular(path)
    for path in sorted(directories, key=lambda item: (-len(item.parts), item.as_posix())):
        fsync_directory(path)
    fsync_directory(custody)


def validate_contract(source_raw, custody_raw, destination_raw, helper_raw,
                      helper_sha, source_writer_lock_raw, executor_uid, executor_gid,
                      require_source=True):
    source = literal_path(source_raw, 'source')
    custody = literal_path(custody_raw, 'custody')
    destination = literal_path(destination_raw, 'destination')
    helper = literal_path(helper_raw, 'helper')
    source_writer_lock = literal_path(source_writer_lock_raw, 'source_writer_lock')
    private_directory(custody, os.geteuid(), 'custody')
    if destination.parent != custody or destination == custody:
        raise ValueError('destination_outside_custody')
    if destination.exists() or destination.is_symlink():
        raise ValueError('destination_exists')
    if source == destination or source in destination.parents or destination in source.parents:
        raise ValueError('source_destination_overlap')
    if source_writer_lock.parent != source.parent or source_writer_lock == source:
        raise ValueError('source_writer_lock_scope')
    if require_source:
        private_directory(source, executor_uid, 'source')
    validate_helper(helper, helper_sha, executor_uid, executor_gid)
    private_regular(source_writer_lock, executor_uid, executor_gid, 'source_writer_lock')
    return source, custody, destination, helper, source_writer_lock


def collect(args):
    if os.geteuid() != args.executor_uid or os.getegid() != args.executor_gid:
        raise ValueError('collector_executor_identity')
    source, custody, destination, helper, source_writer_lock = validate_contract(
        args.source_root, args.custody_root, args.destination_root, args.helper,
        args.helper_sha256, args.source_writer_lock, args.executor_uid,
        args.executor_gid)
    deadline = time.monotonic() + args.observation_seconds
    hash_budget = [args.max_hash_bytes]
    with SourceWriterExclusion(source_writer_lock, args.executor_uid, args.executor_gid):
        before, before_digest, before_observations = entry_index(
            source, deadline, hash_budget, 'source_before'
        )
        shutil.copytree(source, destination, symlinks=True, copy_function=shutil.copy2)
        destination.chmod(0o700)
        copied, copied_digest, copied_observations = entry_index(
            destination, deadline, hash_budget, 'destination'
        )
        after_source, after_digest, after_observations = entry_index(
            source, deadline, hash_budget, 'source_after'
        )
        retention_report.revalidate_tree(
            source, before_observations, deadline, 'source_full_interval'
        )
        retention_report.revalidate_tree(
            source, after_observations, deadline, 'source_after_final'
        )
        retention_report.revalidate_tree(
            destination, copied_observations, deadline, 'destination_final'
        )
        if before != after_source or before_digest != after_digest:
            raise ValueError('source_drift_during_collection')
        if before != copied or before_digest != copied_digest:
            raise ValueError('copied_tree_mismatch')
        fsync_copied_tree(destination, custody)
        retention_report.revalidate_tree(
            source, before_observations, deadline, 'source_before_success'
        )
        retention_report.revalidate_tree(
            destination, copied_observations, deadline, 'destination_before_success'
        )
        receipt = {
            'schemaVersion': 1, 'result': 'PRESERVED', 'sourcePreserved': True,
            'entryCount': len(before), 'helperSha256': args.helper_sha256,
            'executorUid': args.executor_uid, 'executorGid': args.executor_gid,
            'treeSha256': before_digest,
        }
        raw = (json.dumps(receipt, sort_keys=True) + '\n').encode()
        prepared_receipt = destination / '.collection-receipt.private.json.prepared'
        final_receipt = destination / 'collection-receipt.private.json'
        fd = os.open(prepared_receipt,
                     os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'wb') as out:
            out.write(raw); out.flush()
        fsync_regular(prepared_receipt)
        fsync_directory(destination)
        fsync_directory(custody)
        os.rename(prepared_receipt, final_receipt)
        return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', required=True)
    parser.add_argument('--custody-root', required=True)
    parser.add_argument('--destination-root', required=True)
    parser.add_argument('--helper', required=True)
    parser.add_argument('--helper-sha256', required=True)
    parser.add_argument('--source-writer-lock', required=True)
    parser.add_argument('--executor-uid', required=True, type=int)
    parser.add_argument('--executor-gid', required=True, type=int)
    parser.add_argument('--observation-seconds', type=int, default=300)
    parser.add_argument('--max-hash-bytes', type=int, default=128 * 1024**3)
    parser.add_argument('--validate-only', action='store_true')
    args = parser.parse_args()
    if (args.executor_uid < 0 or args.executor_gid < 0 or
            args.observation_seconds <= 0 or args.max_hash_bytes <= 0):
        parser.error('executor identity and observation budgets must be valid')
    if args.validate_only:
        *_, source_writer_lock = validate_contract(
            args.source_root, args.custody_root, args.destination_root,
            args.helper, args.helper_sha256, args.source_writer_lock,
            args.executor_uid, args.executor_gid)
        with SourceWriterExclusion(source_writer_lock, args.executor_uid,
                                   args.executor_gid):
            pass
        print(json.dumps({'result': 'VALIDATED', 'sourcePreserved': True}))
        return
    result = collect(args)
    print(json.dumps({'result': result['result'], 'entryCount': result['entryCount'],
                      'sourcePreserved': result['sourcePreserved']}))


if __name__ == '__main__':
    raise SystemExit(main())
