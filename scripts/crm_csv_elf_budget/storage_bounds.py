"""Future ELF discovery storage guards; delegates all persistent writes to canonical writers.
No entrypoint, transport, destinations, authority or production operations.
"""
import base64
import fcntl
import io
import json
import os
from pathlib import Path
import resource
import selectors
import signal
import time
import stat
import subprocess
import tempfile

MiB = 1024**2
TERMINAL = 64*1024
TEXT_LIMIT = 16*1024
ROLES = {
    'tools': (MiB, 32),
    'remote': (142*MiB, 384),
    'material': (16*MiB, 32),
    'custody': (64*MiB, 32),
    'analysis': (454*MiB, 384),
    'launcher': (4*MiB, 16),
}

def need(ok, reason):
    if not ok:
        raise RuntimeError(reason)

class Guard:
    def __init__(self, roots):
        self.roots = {Path(k): v for k, v in roots.items()}
        need(bool(self.roots), 'storage_roots_missing')
        for p, role in self.roots.items():
            need(p.is_absolute() and role in ROLES, 'storage_root_contract')
            need(not any(other != p and other in p.parents for other in self.roots), 'storage_roots_overlap')

    def locate(self, path):
        path = Path(path)
        choices = [(root, role) for root, role in self.roots.items() if root in path.parents]
        need(len(choices) == 1, 'storage_destination_undeclared')
        root, role = choices[0]
        rel = path.relative_to(root)
        need(len(rel.parts) <= 2 and '..' not in rel.parts, 'storage_depth')
        return root, role, rel

    def _scan(self, fd, depth=0):
        total = count = 0
        for name in os.listdir(fd):
            s = os.stat(name, dir_fd=fd, follow_symlinks=False)
            count += 1
            need(s.st_uid == os.getuid(), 'storage_owner')
            if stat.S_ISDIR(s.st_mode):
                need(depth == 0 and stat.S_IMODE(s.st_mode) == 0o700, 'storage_directory')
                child = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
                try:
                    need(os.fstat(child).st_ino == s.st_ino, 'storage_directory_replaced')
                    t, n = self._scan(child, depth+1)
                    total += t
                    count += n
                finally:
                    os.close(child)
            else:
                need(stat.S_ISREG(s.st_mode) and s.st_nlink == 1 and stat.S_IMODE(s.st_mode) == 0o600, 'storage_file')
                total += s.st_size
        return total, count

    def call(self, path, growth, action, *, terminal=False, file_limit=None):
        root, role, rel = self.locate(path)
        need(type(growth) is int and growth >= 0, 'storage_growth')
        for p in (root, *root.parents):
            need(not p.is_symlink(), 'storage_root_symlink')
        fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX)
            s = os.fstat(fd)
            need(s.st_uid == os.getuid() and stat.S_IMODE(s.st_mode) == 0o700, 'storage_root_permissions')
            t, count = self._scan(fd)
            cap, files = ROLES[role]
            # Anonymous analyzer/transport files: 2 MiB analysis, 13 MiB custody.
            # These reservations are never available to persistent writes.
            anonymous = 2*MiB if role in ('analysis', 'material') else 13*MiB if role == 'custody' else 0
            limit = cap - anonymous - (0 if terminal else TERMINAL)
            try:Path(path).lstat(); added_entry=0
            except FileNotFoundError:added_entry=1
            need(t+growth <= limit and count+added_entry <= files, 'storage_total_exceeded')
            if file_limit is not None:
                try:
                    old = Path(path).lstat()
                    need(stat.S_ISREG(old.st_mode), 'storage_append_type')
                    size = old.st_size
                except FileNotFoundError:
                    size = 0
                need(size+growth <= file_limit - (0 if terminal else TERMINAL), 'storage_journal_exceeded')
            # Canonical writer retains O_EXCL/O_NOFOLLOW/metadata checks/fsync.
            return action()
        finally:
            os.close(fd)

    def artifact(self, original):
        def write(path, raw):
            _, role, rel = self.locate(path)
            image = len(rel.parts) == 2 and rel.parts[0] == 'images'
            need(len(raw) <= (128*MiB if image else 12*MiB if role == 'custody' else 2*MiB if role == 'analysis' else 6*MiB), 'storage_artifact_exceeded')
            return self.call(path, len(raw), lambda: original(path, raw))
        return write

    def record(self, original):
        def write(folder, name, row):
            _, role, _ = self.locate(Path(folder)/name)
            # Reserve is exclusively a bounded terminal failure/receipt, not arbitrary data.
            terminal = row.get('event') in ('end', 'remote_end', 'materialize_end', 'reviewed_local_launcher') or name == 'sequencer.journal.jsonl'
            data = (json.dumps(row, sort_keys=True)+'\n').encode()
            need(len(data) <= (TERMINAL if terminal else 20*MiB if role == 'custody' else 3*MiB), 'storage_record_exceeded')
            journal = 192*MiB if role == 'analysis' else 48*MiB if role == 'custody' else 8*MiB if role in ('remote', 'material') else 4*MiB
            return self.call(Path(folder)/name, len(data), lambda: original(folder, name, row), terminal=terminal, file_limit=journal)
        return write

class LimitedText(io.StringIO):
    """Only static launcher output; reject before an unbounded accumulation."""
    def write(self, text):
        need(len(self.getvalue().encode())+len(text.encode()) <= TEXT_LIMIT, 'launcher_channel_exceeded')
        return super().write(text)

class ChannelLimitExceeded(subprocess.TimeoutExpired):
    """Captured prefixes are incomplete; static diagnostic, never complete."""


def bounded_run(argv, *, channel_limit=MiB, stderr_limit=None, temporary_dir, file_limit=None, **kw):
    """Bounded anonymous channels written by the parent; RLIMIT for SCP leaf.
    No communicate/capture_output accumulation or disk write before its bound.
    """
    limits = (channel_limit, channel_limit if stderr_limit is None else stderr_limit)
    need(all(type(x) is int and 0 < x <= 12*MiB for x in limits), 'channel_limit')
    need(not set(kw).intersection(('stdout','stderr','capture_output','preexec_fn','start_new_session')), 'bounded_run_interface')
    payload=kw.pop('input', None); timeout=kw.pop('timeout'); check=kw.pop('check', False)
    need(not check, 'bounded_run_check')
    hard = channel_limit if file_limit is None else file_limit
    need(type(hard) is int and hard > 0, 'child_file_limit')
    def bounds():
        resource.setrlimit(resource.RLIMIT_FSIZE, (hard, hard))
    with tempfile.TemporaryFile(dir=temporary_dir,buffering=0) as a, tempfile.TemporaryFile(dir=temporary_dir,buffering=0) as b:
        proc=subprocess.Popen(argv, stdin=subprocess.PIPE if payload is not None else subprocess.DEVNULL,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, preexec_fn=bounds,
                              start_new_session=True, **kw)
        start=time.monotonic(); exceeded=False; timedout=False; sizes=[0,0]; offset=0
        execution_error=None
        try:
            with selectors.DefaultSelector() as poll:
                for index, stream in enumerate((proc.stdout,proc.stderr)):
                    os.set_blocking(stream.fileno(),False);poll.register(stream,selectors.EVENT_READ,index)
                if payload is not None:
                    os.set_blocking(proc.stdin.fileno(),False)
                    if payload:poll.register(proc.stdin,selectors.EVENT_WRITE,2)
                    else:proc.stdin.close()
                while poll.get_map():
                    if time.monotonic()-start >= timeout:
                        timedout=True;break
                    for key,_ in poll.select(min(.05,max(0,timeout-(time.monotonic()-start)))):
                        if key.data==2:
                            try:offset+=os.write(key.fd,payload[offset:offset+65536])
                            except BrokenPipeError:offset=len(payload)
                            if offset==len(payload):poll.unregister(key.fileobj);key.fileobj.close()
                            continue
                        index=key.data;chunk=os.read(key.fd,min(65536,limits[index]-sizes[index]+1))
                        if not chunk:poll.unregister(key.fileobj);key.fileobj.close();continue
                        take=min(len(chunk),limits[index]-sizes[index]);written=(a,b)[index].write(chunk[:take])
                        if written!=take:raise OSError(28,'channel_temporary_short_write')
                        sizes[index]+=take
                        if take<len(chunk):exceeded=True;break
                    if exceeded:break
        except OSError as e:execution_error=e
        if timedout or exceeded or execution_error is not None:
            try:os.killpg(proc.pid,signal.SIGKILL)
            except ProcessLookupError:pass
        try:code=proc.wait(timeout=max(.01,timeout-(time.monotonic()-start)))
        except subprocess.TimeoutExpired:
            timedout=True
            try:os.killpg(proc.pid,signal.SIGKILL)
            except ProcessLookupError:pass
            code=proc.wait()
        for stream in (proc.stdin,proc.stdout,proc.stderr):
            if stream is not None and not stream.closed:stream.close()
        a.seek(0);b.seek(0);out=a.read(limits[0]);err=b.read(limits[1])
    if execution_error is not None:
        execution_error.stdout,execution_error.stderr=out,err
        raise execution_error
    if timedout or exceeded:
        # Prefixes plus size/overflow are diagnosable; never assert complete channels.
        e=(ChannelLimitExceeded if exceeded else subprocess.TimeoutExpired)(argv,timeout,output=out,stderr=err)
        e.storageLimitExceeded=exceeded
        raise e
    return subprocess.CompletedProcess(argv,code,out,err)

def receive_images(refs, incoming, driver, cap):
    """Exact nonrecursive SCP operands, serial, unique leaf; no glob/tree/retry.
    Parent/file guards and canonical custody remain in the existing receiver.
    """
    need(0 < len(refs) <= 64 and sum(x['bytes'] for x in refs) <= 128*MiB, 'transfer_set_budget')
    lib = cap.lib
    lib['new_directory'](incoming)
    deadline=time.monotonic()+240
    for index, row in enumerate(refs):
        name = row['sha256']+'.elf'
        need(len(row['sha256']) == 64 and all(c in '0123456789abcdef' for c in row['sha256']) and type(row['bytes']) is int and row['bytes'] > 0, 'transfer_reference')
        path = incoming/name
        need(not path.exists() and not path.is_symlink(), 'transfer_destination_exists')
        argv = ['scp', '-p', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', driver['HOST']+':'+driver['OUTPUT']+'/images/'+name, str(path)]
        remaining=deadline-time.monotonic();need(remaining>0,'image_transfer_deadline')
        start = lib['utc']();code = None;out = err = b'';error = None
        try:
            # Max image bytes written by this child = exact sealed reference size.
            # Channels <=1 MiB. No -r; remote cannot create another received tree.
            r = bounded_run(argv, temporary_dir=cap.q, channel_limit=16*1024, file_limit=row['bytes'], timeout=remaining, check=False)
            code, out, err = r.returncode, r.stdout, r.stderr
        except (OSError, subprocess.TimeoutExpired) as e:
            error=e;out=getattr(e,'stdout',None) or b'';err=getattr(e,'stderr',None) or b''
        cap.bytes('image-transfer-'+str(index), argv, start, lib['utc'](), code, out, err, error)
        need(code == 0 and error is None, 'image_transfer_partial')
        raw, m = lib['stable_file'](path, row['bytes'])
        need(len(raw) == row['bytes'] and lib['sha'](raw) == row['sha256'], 'image_transfer_integrity')


def plan():
    """Independent of observed capacity. Integer byte bounds, then planning margin.
    Pools include channels AND Base64 journal copies, never just image payload.
    Allocation allowances are conditional planning, not an FS quota/certificate.
    """
    remote=sum(ROLES[x][0] for x in ('tools','remote'))
    local=sum(ROLES[x][0] for x in ('material','custody','analysis'))+3*ROLES['launcher'][0]
    def estimate(payload, allowance):
        base=payload+allowance
        margin=(base+3)//4
        unit=64*MiB
        proposal=((base+margin+unit-1)//unit)*unit
        return dict(payloadBytes=payload,allocationAllowanceBytes=allowance,safetyMarginBytes=margin,
                    roundingBytes=proposal-base-margin,proposedOperationBytes=proposal)
    return {'remote':estimate(remote,2*MiB),'localIfShared':estimate(local,14*MiB),
            'roleLimits':{k:{'bytes':v[0],'entries':v[1]} for k,v in ROLES.items()},
            'observedAvailableUsedAsInput':False,'canonicalReserveIncluded':False}
