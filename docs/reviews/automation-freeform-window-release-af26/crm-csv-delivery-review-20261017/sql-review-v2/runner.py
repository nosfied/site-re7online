"""Bounded SQL review step; existing route contract, Capture and canonical classifier.
No production entrypoint at import. Transport supplies authenticated BLOBS.
"""
import ast,base64,hashlib,json,os,stat,subprocess
from pathlib import Path

JOURNAL_LIMIT=96*1024*1024
OUTPUT_LIMITS={'identity':65536,'ownership':4*1024*1024,'imports':32*1024*1024}
INSPECT=['/usr/bin/docker','inspect','--format','{"Id":{{json .Id}},"State":{"Running":{{json .State.Running}}},"Image":{{json .Image}},"NetworkSettings":{{json .NetworkSettings}}}','wa-agent-postgres']

# load, Capture and diagnostic primitives are composed from exact accepted ASTs.
def bounded_command(cap,ident,argv,*,input=None,timeout=25):
    limit=OUTPUT_LIMITS.get(ident,1024*1024)
    start=cap.lib['utc']();code=None;out=err=b'';error=None
    try:
        r=subprocess.run(argv,input=input,capture_output=True,timeout=timeout,
                         env={'PATH':'/usr/bin:/bin','HOME':'/home/deploy','LANG':'C'})
        code,out,err=r.returncode,r.stdout,r.stderr
    except subprocess.TimeoutExpired as e:out,err=e.stdout or b'',e.stderr or b'';error=e
    except OSError as e:error=e;err=type(e).__name__.encode()
    exceeded=len(out)>limit or len(err)>65536
    # An exceeded channel is explicitly partial; never claim full custody of discarded bytes.
    cap.bytes(ident,argv,start,cap.lib['utc'](),code,out[:limit],err[:65536],error)
    cap.event('sql_command_limits',id=ident,stdoutLimit=limit,stderrLimit=65536,
              observedStdoutBytes=len(out),observedStderrBytes=len(err),
              observedStdoutSha256=hashlib.sha256(out).hexdigest(),observedStderrSha256=hashlib.sha256(err).hexdigest(),
              prefixOnly=exceeded,stdinBytes=len(input or b''),stdinSha256=hashlib.sha256(input or b'').hexdigest())
    if exceeded:raise DiagnosticDenied(ident,'OUTPUT_LIMIT_PARTIAL_PRESERVED')
    if error is not None:raise DiagnosticDenied(ident,'SQL_OR_CHANNEL_TIMEOUT_OR_OS_FAILURE')
    if code!=0:raise DiagnosticDenied(ident,'SQL_OR_CHANNEL_EXIT_DENIED')
    return out

def route_client(cap,expected,stage):
    row=json.loads(bounded_command(cap,stage+'-route',INSPECT))
    cap.lib['require'](row==expected['route'],'sql_route_changed')
    # Reuse the exact System.db_container method over the preserved docker response.
    c=load('contracts.py')
    class BytesPath:
        def __init__(self,*a):pass
        def read_bytes(self):return BLOBS['ops.source']
    c['config_consumers'].__globals__['Path']=BytesPath
    System,_=c['config_consumers']();system=System()
    system.run=lambda args:json.dumps([row])if args==['docker','inspect','wa-agent-postgres']else (_ for _ in ()).throw(RuntimeError('unexpected_argv'))
    system.db_container()
    cid=row['Id']
    path=bounded_command(cap,stage+'-client-path',['/usr/bin/docker','exec',cid,'/bin/sh','-c','command -v psql'])
    version=bounded_command(cap,stage+'-client-version',['/usr/bin/docker','exec',cid,'psql','--version'])
    cap.lib['require'](path==base64.b64decode(expected['clientPathBase64'],validate=True)and
                       version==base64.b64decode(expected['clientVersionBase64'],validate=True),'sql_client_changed')
    cap.event('SQL_CHANNEL_REVALIDATED',stage=stage,containerIdSha256=hashlib.sha256(cid.encode()).hexdigest())
    return cid

def sql_argv(cid):
    argv=['/usr/bin/docker','exec','-i']
    for e in ('PGHOST=','PGHOSTADDR=','PGPORT=5432','PGSERVICE=','PGSERVICEFILE=/dev/null','PGPASSFILE=/dev/null','PGPASSWORD=','PGOPTIONS=','PGCONNECT_TIMEOUT=3'):argv+=['-e',e]
    # Docker NAME= creates an empty variable; it does not unset it. libpq treats
    # empty PGSERVICE as a requested service. The already observed /bin/sh does
    # the removal before exec; no new tool, credential, endpoint or SQL is used.
    # Clear inherited libpq selectors/session/TLS settings; retain the explicit
    # PGHOST/HOSTADDR/PORT, service/pass files, password, options and timeout above.
    unset=('PGSERVICE PGDATABASE PGUSER PGAPPNAME PGCLIENTENCODING PGDATESTYLE PGTZ '
           'PGGEQO PGTARGETSESSIONATTRS PGLOADBALANCEHOSTS PGSSLMODE PGREQUIRESSL '
           'PGSSLCOMPRESSION PGSSLCERT PGSSLKEY PGSSLROOTCERT PGSSLCRL PGSSLCRLDIR '
           'PGSSLSNI PGREQUIREPEER PGSSLMINPROTOCOLVERSION PGSSLMAXPROTOCOLVERSION '
           'PGGSSENCMODE PGKRBSRVNAME PGGSSLIB PGCHANNELBINDING PGSYSCONFDIR '
           'PGLOCALEDIR PGREQUIREAUTH PGSSLNEGOTIATION')
    return argv+[cid,'/bin/sh','-c','unset '+unset+'; exec psql "$@"','psql',
                 '-X','-w','-U','wa_agent','-d','whatsapp_agent','-Atq','-v','ON_ERROR_STOP=1']

def identity(cap,raw):
    rows=[json.loads(x)for x in raw.splitlines()if x.strip()]
    cap.lib['require'](len(rows)==4,'sql_identity_shape')
    first=rows[0]
    cap.lib['require'](first['database']=='whatsapp_agent'and first['sessionRole']=='wa_agent'and first['effectiveRole']=='wa_agent'and first['transactionReadOnly']=='on','sql_identity_mismatch')
    cap.lib['require'](int(first['serverVersion'])//10000==16 and rows[1]['systemIdentifier'],'sql_server_frontier')
    cap.event('SQL_IDENTITY_OBSERVED',allClientBackendsVisible=rows[3]['allClientBackendsVisible'],ownership='UNKNOWN')

def ownership(cap,raw):
    value=json.loads(raw)
    cap.lib['require'](type(value['backends'])is list and type(value['advisoryLocks'])is int and value['advisoryLocks']>=0,'sql_ownership_shape')
    cap.event('SQL_BACKENDS_OBSERVED',backends=len(value['backends']),advisoryLocks=value['advisoryLocks'],ownership='UNKNOWN',zeroRequired=False)

def imports(cap,raw):
    rows=json.loads(raw)['rows'];cap.lib['require'](type(rows)is list,'sql_imports_shape')
    if len(rows)>=100001:
        cap.event('IMPORTS_POSSIBLY_TRUNCATED_DENY',rows=len(rows),sentinel=100001)
        raise DiagnosticDenied('imports','IMPORTS_POSSIBLY_TRUNCATED_100001')
    tree=ast.parse(BLOBS['capture_imports.source'])
    f=next(n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name=='classify')
    scope={'require':cap.lib['require'],'json':json,'hashlib':hashlib}
    exec(compile(ast.fix_missing_locations(ast.Module(body=[f],type_ignores=[])),'<canonical classify only>','exec'),scope)
    ops=scope['classify'](rows);counts={}
    for op in ops:counts[op['state']]=counts.get(op['state'],0)+1
    # Raw tenant/id rows stay private; no duplicate per-operation payload in the journal.
    cap.event('IMPORTS_CLASSIFIED_PRIVATE_AUDIT_ONLY',auditRows=len(rows),operations=len(ops),states=counts,
              classificationSha256=hashlib.sha256(json.dumps(ops,sort_keys=True).encode()).hexdigest(),
              knownActivityScopeComplete=False,executorExitCertified=False,ownership='UNKNOWN')

def run(q,action):
    if action!='collect':raise RuntimeError('select_review_action_denied')
    cap=Capture(q);ok=False
    cap.event('begin',manifestSha256=MANIFEST_SHA,action='three_sql_selects_only',atomicSnapshot=False)
    try:
        expected=json.loads(BLOBS['channel.private.json'])
        cap.event('PINNED_CHANNEL_SOURCE',captureSha256=expected['captureSha256'],sourceIntervalUtc=expected['intervalUtc'])
        cid=checked(cap,'before-identity','SQL_ROUTE_OR_CLIENT_CHANGED',lambda:route_client(cap,expected,'before-identity'))
        for kind,next_stage,validator in (
            ('identity','after-identity-before-ownership',identity),
            ('ownership','after-ownership-before-imports',ownership),
            ('imports','after-imports',imports)):
            raw=bounded_command(cap,kind,sql_argv(cid),input=BLOBS[kind+'.sql'])
            checked(cap,kind+'-validation','SQL_RESULT_IDENTITY_PRIVILEGE_OR_SCHEMA_DENIED',lambda validator=validator,raw=raw:validator(cap,raw))
            cid=checked(cap,next_stage,'SQL_ROUTE_OR_CLIENT_CHANGED',lambda next_stage=next_stage:route_client(cap,expected,next_stage))
        cap.event('end',result='THREE_READONLY_SQLS_PRESERVED',ownership='UNKNOWN',scopeComplete=False);ok=True
    except Exception as e:
        cap.event('end',result='DENY_NO_RETRY',errorClass=type(e).__name__,errno=getattr(e,'errno',None),
                  denialStage=e.stage if isinstance(e,DiagnosticDenied)else None,
                  denialReason=e.reason if isinstance(e,DiagnosticDenied)else 'SQL_REVIEW_UNCLASSIFIED_DENY',ownership='UNKNOWN')
    return ok,None

def load(name):
    scope = {'__name__': 'library_only', '__file__': '<verified ' + name + '>'}
    exec(compile(BLOBS[name], scope['__file__'], 'exec'), scope)
    return scope

class Capture:

    def __init__(self, q):
        self.q = q
        self.lib = load('read_package.py')
        self.record = load('privileged_output.source')['private_record']

    def event(self, event, **data):
        self.record(self.q, self.lib['JOURNAL'], {'event': event, 'utc': self.lib['utc'](), **data})

    def bytes(self, ident, argv, start, end, code, out, err, error=None):
        row = {'id': ident, 'argv': argv, 'startedUtc': start, 'finishedUtc': end, 'exitCode': code, 'errorClass': None if error is None else type(error).__name__, 'errno': getattr(error, 'errno', None)}
        for key, raw in [('stdout', out), ('stderr', err)]:
            self.lib['write_artifact'](self.q / (ident + '.' + key + '.private'), raw)
            row.update({key + 'Bytes': len(raw), key + 'Sha256': self.lib['sha'](raw), key + 'Base64': base64.b64encode(raw).decode()})
        self.event('command', **row)

    def command(self, ident, argv, *, input=None, pass_fds=(), timeout=25):
        start = self.lib['utc']()
        code = None
        out = err = b''
        error = None
        try:
            r = subprocess.run(argv, input=input, pass_fds=pass_fds, capture_output=True, timeout=timeout, env={'PATH': '/usr/bin:/bin', 'HOME': '/home/deploy', 'LANG': 'C'})
            code, out, err = (r.returncode, r.stdout, r.stderr)
        except subprocess.TimeoutExpired as e:
            out, err = (e.stdout or b'', e.stderr or b'')
            error = e
        except OSError as e:
            error = e
            err = type(e).__name__.encode()
        self.bytes(ident, argv, start, self.lib['utc'](), code, out, err, error)
        self.event('command_input', id=ident, bytes=len(input or b''), sha256=self.lib['sha'](input or b''))
        self.lib['require'](code == 0 and error is None, 'command_denied:' + ident)
        return out

    def observe(self, ident, fn):
        start = self.lib['utc']()
        try:
            value = fn()
        except Exception as e:
            self.bytes(ident, ['library', ident], start, self.lib['utc'](), 1, b'', type(e).__name__.encode(), e)
            raise
        raw = json.dumps(value, sort_keys=True).encode()
        self.bytes(ident, ['library', ident], start, self.lib['utc'](), 0, raw, b'')
        return value

class DiagnosticDenied(RuntimeError):

    def __init__(self, stage, reason):
        super().__init__(reason)
        self.stage = stage
        self.reason = reason

def checked(cap, stage, reason, fn, allowed=None, preserve_exception=False):
    cap.event('verification_begin', stage=stage, denyReason=reason)
    try:
        value = cap.observe(stage, fn)
    except DiagnosticDenied as e:
        cap.event('verification_denied', stage=stage, reason=e.reason, originStage=e.stage)
        raise
    except Exception as e:
        if allowed and type(e) is RuntimeError and (len(e.args) == 1) and (type(e.args[0]) is str):
            reason = allowed.get(e.args[0], reason)
        cap.event('verification_denied', stage=stage, reason=reason, errorClass=type(e).__name__, errno=getattr(e, 'errno', None))
        if preserve_exception:
            raise
        raise DiagnosticDenied(stage, reason) from None
    cap.event('verification_pass', stage=stage)
    return value
