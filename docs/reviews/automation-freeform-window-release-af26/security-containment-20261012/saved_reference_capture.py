"""Preparation only: copy the actual saved bytes, never an inherited generation's dump."""
import hashlib
import os
from pathlib import Path
import stat


def observe(path):
    path = Path(path)
    for part in (path, *path.parents):
        if part.is_symlink():
            raise RuntimeError('saved_capture_symlink')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_uid != os.getuid():
            raise RuntimeError('saved_capture_type_or_owner')
        if stat.S_IMODE(before.st_mode) not in (0o600, 0o664):
            raise RuntimeError('saved_capture_permissions')
        with os.fdopen(fd, 'rb', closefd=False) as stream:
            raw = stream.read()
        after = os.fstat(fd)
        current = path.stat(follow_symlinks=False)
        stamp = lambda s: (s.st_dev, s.st_ino, s.st_uid, s.st_gid, s.st_mode,
                           s.st_size, s.st_mtime_ns, s.st_ctime_ns)
        if stamp(before) != stamp(after) or stamp(after) != stamp(current):
            raise RuntimeError('saved_capture_concurrent_change')
        return raw, stamp(after)
    finally:
        os.close(fd)


def capture_pair(sources, destinations):
    if len(sources) != 2 or len(destinations) != 2:
        raise RuntimeError('saved_capture_pair_required')
    first = [observe(p) for p in sources]
    if first != [observe(p) for p in sources]:
        raise RuntimeError('saved_capture_observations_changed')
    for dest in destinations:
        dest = Path(dest)
        if os.path.lexists(dest) or dest.parent.is_symlink():
            raise RuntimeError('saved_capture_destination_exists_or_symlink')
    for (raw, _), dest in zip(first, destinations):
        fd = os.open(dest, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'wb') as stream:
            stream.write(raw)
        if Path(dest).read_bytes() != raw:
            raise RuntimeError('saved_capture_written_bytes_drift')
    return [hashlib.sha256(raw).hexdigest() for raw, _ in first]
