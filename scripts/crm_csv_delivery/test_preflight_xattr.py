"""New xattr interface only. Real local ACL fixtures/getfacl/FDs/custody.
SSH and target namespace simulated; no production observation or ACL decoding.
"""
import base64,contextlib,errno,hashlib,io,json,os,re,shlex,subprocess,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from scripts.crm_csv_delivery import preflight_xattr as p
ROOT=p.ROOT;PROOFS=[]

def source_module():
 driver=p.transport();b=driver['boundary']();lib=b['libraries']()[0]
 raw,_=lib['stable_file'](p.SOURCE);assert hashlib.sha256(raw).hexdigest()==p.SOURCE_SHA
 ns={'meta':lib['meta']};exec(compile(raw,'<reviewed xattr source>','exec'),ns);return ns

def block():
 text=(ROOT/'docs/reviews/automation-freeform-window-release-af26/crm-csv-delivery-review-20261017/REMEDIATION_FOR_REVIEW.md').read_text()
 blocks=re.findall(r'```bash\n(.*?)```',text,re.S)
 return next(b for b in blocks if "<<'REVIEWED_EVENT_XATTR_PREFLIGHT'" in b)

class Xattr(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  for tool in ['/usr/bin/getfacl','/usr/bin/setfacl']:
   if not Path(tool).is_file() or not os.access(tool,os.X_OK):raise RuntimeError('required laboratory ACL tool unavailable')
  cls.version=subprocess.check_output(['/usr/bin/getfacl','--version'],text=True).strip()
 def exercise(self,case='base',literal_source=None):
  with tempfile.TemporaryDirectory() as td:
   tmp=Path(td);fs=tmp/'fs';fs.mkdir();path=fs;old=os.umask(0)
   try:
    for part in 'opt/re7online/site-re7online/apps/whatsapp-agent/src/events'.split('/'):
     path=path/part;path.mkdir(mode=0o775)
   finally:os.umask(old)
   targets=[fs/str(x).lstrip('/') for x in source_module()['TARGETS']]
   if case=='extended':
    for x in targets:subprocess.run(['/usr/bin/setfacl','-m','u:12345:rwx,d:u:12345:rwx',str(x)],check=True)
   if case=='symlink':
    x=targets[-1];x.rename(x.with_name('old-events'));x.symlink_to('old-events',target_is_directory=True)
   priv=tmp/'custody';priv.mkdir(mode=0o700);dest=priv/'new'
   original_open=os.open;original_lstat=os.lstat;original_get=os.getxattr;real_run=subprocess.run
   calls=[];observations=[];raw_reads=[];getfacl_checks=[]
   def opening(path,*args,**kwargs):return original_open(fs if str(path)=='/' else path,*args,**kwargs)
   def lstat(path,*args,**kwargs):return original_lstat(fs if str(path)=='/' else path,*args,**kwargs)
   def get(fd,name):
    self.assertIsInstance(fd,int);self.assertIn(name,('system.posix_acl_access','system.posix_acl_default'))
    if case=='denied':raise PermissionError(errno.EACCES,'synthetic denied boundary')
    if case=='unsupported':raise OSError(errno.EOPNOTSUPP,'synthetic unsupported boundary')
    if case=='other':raise OSError(errno.EIO,'synthetic IO boundary')
    if case=='swap' and not raw_reads:
     x=targets[-1];x.rename(x.with_name('old-events'));x.mkdir(mode=0o775)
    # Real kernel read and independent getfacl on the same held FD, no binary decoder.
    try:raw=original_get(fd,name)
    except OSError as e:
     raw_reads.append((name,e.errno,None));raise
    raw_reads.append((name,None,raw))
    text=real_run(['/usr/bin/getfacl','-cpn','--','/proc/self/fd/'+str(fd)],pass_fds=(fd,),capture_output=True,check=True).stdout
    getfacl_checks.append(hashlib.sha256(text).hexdigest())
    if case=='extended':
     self.assertIn(b'user:12345:rwx',text);self.assertIn(b'default:user:12345:rwx',text)
    return raw
   def ssh(argv,**kwargs):
    calls.append(argv);self.assertEqual(argv[0],'/usr/bin/ssh');self.assertNotIn('sudo',' '.join(argv))
    if case=='lost':raise subprocess.TimeoutExpired(argv,25,output=b'{"partial":')
    args=shlex.split(argv[-1]);self.assertEqual(args[:5],['/usr/bin/python3','-B','-I','-S','-c'])
    out=io.StringIO();scope={'__name__':'__main__'}
    with patch('os.open',side_effect=opening),patch('os.lstat',side_effect=lstat),patch('os.getxattr',side_effect=get),contextlib.redirect_stdout(out):
     try:exec(compile(args[5],'<exact generated remote program>','exec'),scope)
     except SystemExit as e:code=e.code
    v=json.loads(out.getvalue());observations.append(v)
    return subprocess.CompletedProcess(argv,code,out.getvalue().encode(),b'')
   source=re.search(r"<<'REVIEWED_EVENT_XATTR_PREFLIGHT'\n(.*?)\nREVIEWED_EVENT_XATTR_PREFLIGHT",block(),re.S).group(1)
   if literal_source is not None:self.assertEqual(literal_source.strip(),source.strip());source=literal_source
   def trace(frame,event,arg):
    if event=='call' and frame.f_code.co_name=='execute' and frame.f_code.co_filename==str(ROOT/'scripts/crm_csv_delivery/preflight_xattr.py'):frame.f_globals['CUSTODY']=dest
    return trace
   prior=sys.gettrace();out=io.StringIO()
   with patch('subprocess.run',side_effect=ssh),contextlib.redirect_stdout(out):
    try:
     sys.settrace(trace);exec(compile(source,'<literal xattr launcher>','exec'),{'__name__':'__main__'})
    except SystemExit as e:code=e.code
    finally:sys.settrace(prior)
   self.assertEqual(len(calls),1)
   j=json.loads((dest/'privileged-output.private.jsonl').read_text());stdout=(dest/'csv-event-preflight.stdout.private').read_bytes()
   self.assertEqual(base64.b64decode(j['stdoutBase64']),stdout);self.assertEqual(j['stdoutSha256'],hashlib.sha256(stdout).hexdigest())
   receipt=json.loads((dest/'sequencer.journal.jsonl').read_text());self.assertFalse(receipt['applicationAuthorized'])
   v=observations[0] if observations else None
   if case=='extended':
    got=[a for row in v['observations'] for a in row['attributes']]
    self.assertEqual([base64.b64decode(a['bytesBase64']) for a in got],[b for _,_,b in raw_reads])
    self.assertTrue(all(a['state']=='PRESENT' for a in got));self.assertEqual(len(getfacl_checks),10)
   if case=='base':
    self.assertEqual(len(raw_reads),10);self.assertTrue(all(e==errno.ENODATA for _,e,_ in raw_reads))
    # Independent real getfacl representation of all base-only fixtures.
    for x in targets:
     text=real_run(['/usr/bin/getfacl','-cpn','--',str(x)],capture_output=True,check=True).stdout
     self.assertIn(b'user::rwx',text);self.assertNotIn(b'default:',text);self.assertNotIn(b'mask:',text)
   PROOFS.append({'case':case,'exit':code,'realXattrCalls':len(raw_reads),'realGetfaclComparisons':len(getfacl_checks)+(5 if case=='base' else 0),'rawAclPublished':False})
   return code,v
 def test_base_and_absence_real(self):
  code,v=self.exercise();self.assertEqual(code,0);self.assertTrue(all(not a['absenceConfirmed'] for row in v['observations'] for a in row['attributes']))
 def test_extended_default_real(self):
  code,v=self.exercise('extended');self.assertEqual(code,0);self.assertFalse(v['aclInterpretationComplete']);self.assertTrue(v['aclChangeBlocked'])
 def test_denial_not_absence(self):
  code,v=self.exercise('denied');self.assertEqual(code,1);self.assertEqual(v['observations'][0]['attributes'][0]['state'],'ACCESS_DENIED')
 def test_unsupported_not_absence(self):
  code,v=self.exercise('unsupported');self.assertEqual(code,1);self.assertEqual(v['observations'][0]['attributes'][0]['state'],'NOT_SUPPORTED')
 def test_generic_error_not_absence(self):
  code,v=self.exercise('other');self.assertEqual(code,1);self.assertEqual(v['observations'][0]['attributes'][0]['state'],'OTHER_ERROR')
 def test_substitution_real(self):
  code,v=self.exercise('swap');self.assertEqual(code,1);self.assertEqual(v['denialStage'],'revalidation')
 def test_symlink_real(self):
  code,v=self.exercise('symlink');self.assertEqual(code,1);self.assertEqual(v['observations'],[])
 def test_response_lost_custody(self):
  code,v=self.exercise('lost');self.assertEqual(code,1);self.assertIsNone(v)
 def test_real_unsupported_syscall(self):
  ns=source_module();fd=os.open('/proc/sys/kernel/random/boot_id',os.O_RDONLY|os.O_NOFOLLOW)
  try:row=ns['attribute'](fd,'system.posix_acl_access')
  finally:os.close(fd)
  self.assertEqual(row['state'],'NOT_SUPPORTED');PROOFS.append({'case':'local procfs real getxattr unsupported','errno':row['errno'],'result':'NOT_SUPPORTED, not absence'})
 def test_real_access_denial(self):
  ns=source_module()
  with tempfile.TemporaryDirectory() as td:
   x=Path(td)/'denied';old=os.umask(0)
   try:x.mkdir(mode=0)
   finally:os.umask(old)
   with self.assertRaises(PermissionError):os.open(x,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
  PROOFS.append({'case':'real directory access denial on fixture','result':'EACCES; separate injected xattr denial verifies classification'})
 def test_source_pin_and_no_child_commands(self):
  ns=p.transport();reader=ns['boundary']()['libraries']()[0]['stable_file'](ns['boundary']()['REVIEW']/'crm-csv-r2-directed-20261017/read_package.py')[0]
  with self.assertRaisesRegex(AssertionError,'source_digest'):ns['program'](p.SOURCE.read_bytes()+b'\n',reader)
  text=p.SOURCE.read_text();self.assertNotIn('subprocess',text);self.assertNotIn('getfacl',text);self.assertNotIn('setxattr',text)
  PROOFS.append({'case':'pin adulteration and zero remote child tool launch','result':'DENY before SSH; source stdlib/read-only'})
 def test_full_bash_block(self):
  with tempfile.TemporaryDirectory() as td:
   shim=Path(td)/'python3';fd=os.open(shim,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o700)
   code="import sys;from scripts.crm_csv_delivery.test_preflight_xattr import Xattr; c,v=Xattr().exercise(literal_source=sys.stdin.read());assert c==0"
   with os.fdopen(fd,'w') as f:f.write('#!/bin/bash\nexec /usr/bin/python3 -B -c '+shlex.quote(code)+'\n')
   env=dict(os.environ,PATH=td+':/usr/bin:/bin',PYTHONDONTWRITEBYTECODE='1')
   v=subprocess.run(['/bin/bash','-c',block()],cwd=ROOT,env=env,capture_output=True,timeout=15);self.assertEqual(v.returncode,0,v.stderr.decode())
  PROOFS.append({'case':'literal full shell/heredoc/authenticated Python/FD/transport/custody','result':'PASS; SSH and target namespace/destination simulated only'})

if __name__=='__main__':
 suite=unittest.defaultTestLoader.loadTestsFromTestCase(Xattr);result=unittest.TextTestRunner(verbosity=2).run(suite)
 if result.wasSuccessful():
  out={'result':'LOCAL_VALIDATED_REVIEW_PENDING_NOT_OPERATIONALLY_CERTIFIED','tests':result.testsRun,'cases':PROOFS,'labTools':{'getfacl':Xattr.version,'setfacl':'preinstalled, used only to create synthetic ACL fixtures'},'real':'Linux FD getxattr on base/access/default ACL fixtures; independent getfacl text and byte-exact kernel values; no ACL decoder; real procfs unsupported; real directory EACCES; shell and canonical custody','simulated':'SSH, deploy namespace/destination, xattr EACCES/EOPNOTSUPP/EIO injection and response loss; no VPS or writer exclusion','applicationAuthorized':False}
  (ROOT/'docs/reviews/automation-freeform-window-release-af26/crm-csv-delivery-review-20261017/XATTR_PROOFS.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
 raise SystemExit(0 if result.wasSuccessful() else 1)
