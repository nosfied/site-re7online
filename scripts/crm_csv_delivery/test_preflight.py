"""Only new Event preflight interfaces: real local FD/getfacl/custody; SSH mocked.
No VPS, chmod, ACL mutation, SQL, application or service effects.
"""
import base64,contextlib,hashlib,io,json,os,re,shlex,subprocess,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from scripts.crm_csv_delivery import preflight as p
ROOT=p.ROOT;PROOFS=[]

def literal():
 text=(ROOT/'docs/reviews/automation-freeform-window-release-af26/crm-csv-delivery-review-20261017/REMEDIATION_FOR_REVIEW.md').read_text()
 blocks=re.findall(r'```bash\n(.*?)```',text,re.S);assert len(blocks)==1
 return re.search(r"<<'REVIEWED_EVENT_PREFLIGHT'\n(.*?)\nREVIEWED_EVENT_PREFLIGHT",blocks[0],re.S).group(1)

class Preflight(unittest.TestCase):
 def exercise(self,case='valid',source_override=None):
  with tempfile.TemporaryDirectory() as td:
   tmp=Path(td);fs=tmp/'fs';fs.mkdir();old=os.umask(0)
   try:(fs/'opt/re7online/site-re7online/apps/whatsapp-agent/src/events').mkdir(parents=True,mode=0o775)
   finally:os.umask(old)
   if case=='symlink':
    x=fs/'opt/re7online/site-re7online/apps/whatsapp-agent/src';x.rename(x.with_name('old-src'));x.symlink_to('old-src',target_is_directory=True)
   priv=tmp/'custody';priv.mkdir(mode=0o700);dest=priv/'new'
   real_open=os.open;real_lstat=os.lstat;real_stat=os.stat;calls=[];remote=[]
   def open_local(path,*args,**kwargs):
    if str(path)=='/':path=fs
    return real_open(path,*args,**kwargs)
   def lstat_local(path,*args,**kwargs):
    if str(path)=='/usr/bin/getfacl' and case=='missing-tool':raise FileNotFoundError(2,'synthetic missing tool')
    return real_lstat(fs if str(path)=='/' else path,*args,**kwargs)
   def stat_local(path,*args,**kwargs):
    if str(path)=='src' and kwargs.get('dir_fd') is not None and case=='read-denied':raise PermissionError(13,'synthetic denied')
    return real_stat(path,*args,**kwargs)
   def ssh(argv,**kwargs):
    calls.append(argv);self.assertEqual(argv[0],'/usr/bin/ssh');self.assertNotIn('sudo',' '.join(argv));self.assertEqual(kwargs['timeout'],25)
    if case=='lost':raise subprocess.TimeoutExpired(argv,25,output=b'{"partial":')
    code=shlex.split(argv[-1]);self.assertEqual(code[:4],['/usr/bin/python3','-B','-I','-S']);body=code[5]
    ns={'__name__':'__main__'};out=io.StringIO();exitcode=None
    with patch('os.open',side_effect=open_local),patch('os.lstat',side_effect=lstat_local),patch('os.stat',side_effect=stat_local),patch('os.geteuid',return_value=0 if case=='root' else os.geteuid()),contextlib.redirect_stdout(out):
     # Same program with collect wrapper; only external namespace/tool failures simulated.
     if case in ('swap','invalid-acl','tool-timeout','extended-acl'):
      body=body.replace("raise SystemExit(s['collect']())", "HOOK(s);raise SystemExit(s['collect']())")
      def hook(s):
       original=s['bounded'];n=[0]
       def bounded(argv,fds):
        n[0]+=1
        if n[0]==2:
         if case=='swap':
          x=fs/'opt/re7online/site-re7online/apps/whatsapp-agent/src/events';x.rename(x.with_name('old'));x.mkdir(mode=0o775)
         if case=='invalid-acl':return 0,b'not an acl\n',b''
         if case=='extended-acl':return 0,b'user::rwx\nuser:1234:rwx\ngroup::rwx\nmask::rwx\nother::r-x\ndefault:user::rwx\n',b''
         if case=='tool-timeout':
          e=s['ToolFailure']('acl_tool_timeout');e.channels=(b'partial ACL',b'');raise e
        return original(argv,fds)
       s['bounded']=bounded
      ns['HOOK']=hook
     try:exec(compile(body,'<exact remote program with simulated filesystem boundary>','exec'),ns)
     except SystemExit as e:exitcode=e.code
    remote.append(json.loads(out.getvalue()));return subprocess.CompletedProcess(argv,exitcode,out.getvalue().encode(),b'')
   source=literal();self.assertIn("sys.exit(ns['execute']())",source)
   # Substitute only the external custody destination at function entry; verified code bytes unchanged.
   import sys
   def trace(frame,event,arg):
    if event=='call' and frame.f_code.co_name=='execute' and frame.f_code.co_filename==str(ROOT/'scripts/crm_csv_delivery/preflight.py'):
     frame.f_globals['CUSTODY']=dest
    return trace
   if source_override is not None:
    self.assertEqual(source_override.strip(),source.strip());source=source_override
   out=io.StringIO();prior=sys.gettrace()
   with patch('subprocess.run',side_effect=ssh),contextlib.redirect_stdout(out):
    try:
     sys.settrace(trace);exec(compile(source,'<published literal launcher>','exec'),{'__name__':'__main__'})
    except SystemExit as e:code=e.code
    finally:sys.settrace(prior)
   self.assertEqual(len(calls),1)
   journal=json.loads((dest/'privileged-output.private.jsonl').read_text());raw=(dest/'csv-event-preflight.stdout.private').read_bytes()
   self.assertEqual(base64.b64decode(journal['stdoutBase64']),raw);self.assertEqual(hashlib.sha256(raw).hexdigest(),journal['stdoutSha256'])
   self.assertFalse(json.loads((dest/'sequencer.journal.jsonl').read_text())['applicationAuthorized'])
   PROOFS.append({'case':case,'exit':code,'transport':'SSH simulated once; literal Python launcher and verified driver; custody local real','remoteResult':None if not remote else remote[0]['result']})
   return code,None if not remote else remote[0]
 def test_valid_literal(self):
  code,v=self.exercise();self.assertEqual(code,0);self.assertEqual(len(v['observations']),5);self.assertEqual(len(v['commands']),6);self.assertFalse(v['writersExcluded']);self.assertFalse(v['applicationAuthorized'])
 def test_missing_tool_before_targets(self):
  code,v=self.exercise('missing-tool');self.assertEqual(code,1);self.assertEqual(v['denialStage'],'tool-preflight');self.assertEqual(v['observations'],[])
 def test_denied_read(self):
  code,v=self.exercise('read-denied');self.assertEqual(code,1);self.assertEqual(v['errno'],13)
 def test_replacement(self):
  code,v=self.exercise('swap');self.assertEqual(code,1);self.assertEqual(v['denialStage'],'revalidation')
 def test_invalid_acl(self):
  code,v=self.exercise('invalid-acl');self.assertEqual(code,1);self.assertEqual(v['denialReason'],'acl_format')
 def test_extended_acl_observed_no_authorization(self):
  code,v=self.exercise('extended-acl');self.assertEqual(code,0);self.assertTrue(v['observations'][0]['extendedOrDefaultAcl']);self.assertFalse(v['applicationAuthorized'])
 def test_tool_partial_timeout(self):
  code,v=self.exercise('tool-timeout');self.assertEqual(code,1);self.assertEqual(base64.b64decode(v['commands'][-1]['stdoutBase64']),b'partial ACL')
 def test_transport_lost(self):
  code,v=self.exercise('lost');self.assertEqual(code,1);self.assertIsNone(v)
 def test_symlink_denied(self):
  code,v=self.exercise('symlink');self.assertEqual(code,1);self.assertEqual(v['denialReason'],'chain_directory_required');self.assertEqual(v['observations'],[])
 def test_privileged_executor_denied(self):
  code,v=self.exercise('root');self.assertEqual(code,1);self.assertEqual(v['denialStage'],'executor');self.assertEqual(v['commands'],[])
 def test_full_shell_block(self):
  # Actual bash/heredoc/python process; local Python shim supplies only test instrumentation.
  with tempfile.TemporaryDirectory() as td:
   shim=Path(td)/'python3'
   shim.write_text('#!/bin/bash\nexec /usr/bin/python3 -B -c '+shlex.quote("import sys;from scripts.crm_csv_delivery.test_preflight import Preflight; c,v=Preflight().exercise(source_override=sys.stdin.read());assert c==0")+'\n')
   # Create executable shim directly, without chmod or changing an existing permission.
   raw=shim.read_bytes();shim.unlink();fd=os.open(shim,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o700)
   with os.fdopen(fd,'wb') as f:f.write(raw)
   text=(ROOT/'docs/reviews/automation-freeform-window-release-af26/crm-csv-delivery-review-20261017/REMEDIATION_FOR_REVIEW.md').read_text()
   block=re.findall(r'```bash\n(.*?)```',text,re.S)[0]
   env=dict(os.environ,PATH=td+':/usr/bin:/bin',PYTHONDONTWRITEBYTECODE='1')
   r=subprocess.run(['/bin/bash','-c',block],cwd=ROOT,env=env,capture_output=True,timeout=15)
   self.assertEqual(r.returncode,0,r.stderr.decode());PROOFS.append({'case':'literal full bash/heredoc/Python/custody','result':'PASS','simulated':'only SSH, target namespace and local custody destination; shim injects these at Python entry, no validator replaced'})
 def test_bounded_real_child_excess(self):
  b=p.boundary();lib=b['libraries']()[0];ns={'meta':lib['meta']};exec(compile(p.SOURCE.read_bytes(),'<collector>','exec'),ns)
  fd=os.open('/usr/bin/python3',os.O_RDONLY)
  try:
   with self.assertRaisesRegex(ns['ToolFailure'],'acl_tool_output_limit'):
    ns['bounded'](['python3','-c','import os;os.write(1,b"x"*131073)'],(fd,))
  finally:os.close(fd)
  PROOFS.append({'case':'real child output over131072B','result':'DENY with retained bounded partial, child reaped'})
 def test_existing_destination_no_transport(self):
  with tempfile.TemporaryDirectory() as td:
   root=Path(td);d=root/'private';d.mkdir(mode=0o700)
   with patch.object(p,'CUSTODY',d),patch('subprocess.run') as run:
    with self.assertRaises(FileExistsError):p.execute()
   run.assert_not_called();PROOFS.append({'case':'existing custody destination','result':'DENY before SSH; no overwrite'})
 def test_pins(self):
  b=p.boundary();reader,_=b['libraries']()[0]['stable_file'](b['REVIEW']/'crm-csv-r2-directed-20261017/read_package.py')
  source=p.SOURCE.read_bytes()
  with self.assertRaisesRegex(AssertionError,'source_digest'):p.program(source+b'\n',reader)
  with self.assertRaisesRegex(AssertionError,'reader_digest'):p.program(source,reader+b'\n')
  PROOFS.append({'case':'source and reader adulteration','result':'DENY before SSH'})

if __name__=='__main__':
 suite=unittest.defaultTestLoader.loadTestsFromTestCase(Preflight);r=unittest.TextTestRunner(verbosity=2).run(suite)
 if r.wasSuccessful():
  path=ROOT/'docs/reviews/automation-freeform-window-release-af26/crm-csv-delivery-review-20261017/PREFLIGHT_PROOFS.json'
  path.write_text(json.dumps({'result':'LOCAL_VALIDATED_NOT_OPERATIONALLY_CERTIFIED','tests':r.testsRun,'cases':PROOFS,'real':'local getfacl2.3.2 via inherited FDs, kernel stat/open/read, canonical source loading/Capture/private_record','simulated':'SSH/deploy namespace, access denial, races, ACL variants and timeout; no VPS or writer exclusion; destination redirected only for local custody','productionExecuted':False},ensure_ascii=False,indent=2)+'\n')
 raise SystemExit(0 if r.wasSuccessful() else 1)
