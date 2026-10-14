"""Read-only object-generation observation. No PID, including self, is excluded."""
import ctypes
import errno
import os
import stat
import time
from pathlib import Path


def birth_ns(path):
    # Linux statx ABI: timestamps begin at byte64; btime is the second timestamp.
    libc = ctypes.CDLL(None, use_errno=True)
    buf = ctypes.create_string_buffer(256)
    fn = getattr(libc, 'statx', None)
    if fn is None:
        return None
    fn.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_uint, ctypes.c_void_p]
    fn.restype = ctypes.c_int
    if fn(-100, os.fsencode(path), 0, 0x800, buf) != 0:
        e = ctypes.get_errno()
        if e in (errno.ENOSYS, errno.EOPNOTSUPP, errno.EINVAL):
            return None
        raise OSError(e, os.strerror(e))
    mask = ctypes.c_uint.from_buffer(buf, 0).value
    if not mask & 0x800:
        return None
    return ctypes.c_int64.from_buffer(buf, 80).value * 10**9 + ctypes.c_uint32.from_buffer(buf, 88).value


def object_meta(path):
    s = os.stat(path)
    b = birth_ns(path)
    a = os.stat(path)
    if (s.st_dev, s.st_ino, s.st_mode, s.st_nlink, s.st_ctime_ns) != (a.st_dev, a.st_ino, a.st_mode, a.st_nlink, a.st_ctime_ns):
        raise AssertionError('object_changed_during_observation')
    return {'dev': s.st_dev, 'ino': s.st_ino, 'mode': s.st_mode,
            'nlink': s.st_nlink, 'birthNs': b, 'ctimeNs': s.st_ctime_ns}


def classify(original, current, target, paths):
    """A different generation requires positive evidence, never just changed ctime."""
    clean = target.removesuffix(' (deleted)')
    if clean in paths or target.endswith(' (deleted)') or current['nlink'] == 0:
        return 'owner'
    if stat.S_IFMT(original['mode']) != stat.S_IFMT(current['mode']):
        return 'reused_type'
    old, new = original.get('birthNs'), current.get('birthNs')
    if old is not None and new is not None and new > old:
        return 'reused_birth'
    return 'owner'  # Unknown generation is never permission to ignore a holder.


def observe(entries, proc=Path('/proc')):
    keys = {(e['dev'], e['ino']): e for e in entries}
    paths = {e['path'] for e in entries}
    owners, incomplete, reused = [], [], []
    def check(q, field, target, current, fd=None):
        info = dict(q, stage=field, target=target)
        if fd is not None:
            info['fd'] = fd
        if target.removesuffix(' (deleted)') in paths:
            owners.append(info)
        elif (current['dev'], current['ino']) in keys:
            kind = classify(keys[(current['dev'], current['ino'])], current, target, paths)
            info.update(classification=kind, observed=current)
            (owners if kind == 'owner' else reused).append(info)
    for p in proc.iterdir():
        if not p.name.isdigit():
            continue
        q = {'pid': int(p.name), 'ticks': None}
        stage, fd = 'stat_before', None
        try:
            s = (p/'stat').read_text().rsplit(')', 1)[1].split()
            q['ticks'] = s[19]
            for field in ('cwd', 'exe'):
                stage = field
                try:
                    target = os.readlink(p/field)
                    check(q, field, target, object_meta(p/field))
                except FileNotFoundError:
                    if s[0] != 'Z' and (p/'cmdline').read_bytes():
                        raise
            stage = 'fd_list'
            with os.scandir(p/'fd') as ds:
                for f in ds:
                    stage, fd = 'fd', f.name
                    try:
                        target = os.readlink(f.path)
                        current = object_meta(f.path)
                        if os.readlink(f.path) != target:
                            raise AssertionError('fd_target_changed')
                        check(q, stage, target, current, fd)
                    except (OSError, AssertionError) as e:
                        incomplete.append(dict(q, stage=stage, fd=fd, errorClass=type(e).__name__, errno=getattr(e, 'errno', None), reason=str(e)))
            stage, fd = 'maps', None
            for line in (p/'maps').read_text().splitlines():
                fields = line.split(None, 5)
                if len(fields) < 5:
                    raise AssertionError('map_shape')
                major, minor = fields[3].split(':')
                key = (os.makedev(int(major, 16), int(minor, 16)), int(fields[4]))
                target = fields[5] if len(fields) > 5 else ''
                if target.removesuffix(' (deleted)') in paths:
                    owners.append(dict(q, stage='mapping', target=target))
                elif key in keys:
                    # Reuse requires evidence from that mapped object, not an arbitrary path.
                    link = p/'map_files'/fields[0]
                    current = object_meta(link)
                    if (current['dev'], current['ino']) != key:
                        raise AssertionError('mapping_identity_changed')
                    check(q, 'mapping', os.readlink(link), current)
            stage = 'stat_after'
            if (p/'stat').read_text().rsplit(')', 1)[1].split()[19] != q['ticks']:
                raise AssertionError('process_identity_changed')
        except (OSError, AssertionError, ValueError) as e:
            incomplete.append(dict(q, stage=stage, fd=fd, errorClass=type(e).__name__, errno=getattr(e, 'errno', None), reason=str(e)))
    return {'at': time.time(), 'owners': owners, 'incomplete': incomplete, 'reusedObjects': reused}
