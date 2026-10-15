"""Real Operations/Node proof consumer against full private candidate copies.
Only system effects (processes, kernel, DB transport) are substituted.
No operational CLI, production configuration, SQL apply or start is run.
"""
import copy,hashlib,importlib.util,json,os,shutil,subprocess,sys,tempfile
from pathlib import Path
from unittest.mock import patch
P=Path(sys.argv[1]).resolve();HERE=Path(__file__).resolve().parent
sys.path[:0]=[str(P/'window'),str(P/'switch')]
import restore_contract as contract
from credential_boundary import CredentialBoundary,VERIFIED
import cipher_start_gate
import sequencer

def load(name,p):
 spec=importlib.util.spec_from_file_location(name,p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
# Reuse process simulator, never its simplified fixture/config constructors.
os.environ['AF26_V4_PACKAGE']=str(P)
fixture=load('old_process_simulator',HERE.parent.parent/'v4-tests/test-package-set.py')
PLAN=Path('local-evidence/cipher-snapshot-vps-20261014/channel-plan/channel-plan.private.json').resolve()
fullplan=json.loads(PLAN.read_text());assert len(fullplan['changes'])==10
cases=[]
def write(p,v):p.write_text(json.dumps(v));p.chmod(0o600)
def rebind(p):
 w=p/'window';c=json.loads((w/'restore-contract.private.json').read_text());c['currentBackupManifestSha256']=contract.sha(p/'switch/backup-manifest.json');write(w/'restore-contract.private.json',c)
 for mode in contract.MODES:
  f=p/mode/'proof-bindings.private.json';b=json.loads(f.read_text());b['restoreResultSha256']=contract.sha(w/'restore-result.json');b['restoreContractSha256']=contract.sha(w/'restore-contract.private.json');write(f,b)
def mutate(p,kind):
 w=p/'window';r=json.loads((w/'restore-result.json').read_text());c=json.loads((w/'restore-contract.private.json').read_text())
 if kind=='removed_valid':r['temporaryDatabaseRemoved']=True;r['databaseRetainedStoppedForEvidence']=False;c['evidenceState']='REMOVED_AFTER_VALID_RESTORE'
 elif kind=='missing':(w/'restore-result.json').unlink();return
 elif kind=='invalid':r['result']='DENY'
 elif kind=='schema':r['schemaDigest']='0'*64
 elif kind=='tooling':r['tooling']='unknown'
 elif kind=='lab_running':c['evidenceState']='RUNNING'
 elif kind=='migration':r['migrationChecksumMismatches']=['divergence']
 elif kind=='proof':r['reusedOriginalProof']['converted']=9
 elif kind=='mode_permission':(w/'restore-result.json').chmod(0o644);return
 elif kind=='type':(w/'restore-result.json').unlink();(w/'restore-result.json').mkdir();return
 elif kind=='symlink':(w/'restore-result.json').unlink();(w/'restore-result.json').symlink_to(w/'original-restore-proof.private.json');return
 elif kind=='binding_hash':r['providerCalls']=1;write(w/'restore-result.json',r);return
 elif kind=='absent_field':del r['temporaryDatabaseRemoved']
 elif kind=='bool_type':r['temporaryDatabaseRemoved']='false'
 write(w/'restore-result.json',r);write(w/'restore-contract.private.json',c);rebind(p)

def driver_for(op):
 class Sim(fixture.Fake):
  def guard(self):return {'version':1,'open':False,'tasks':{},'generation':38,'audit':[]}
 sim=Sim({'apps':list(op.source.values())})
 return sim

def boundary(p,classification):
 w=p/'window';h=hashlib.sha256(PLAN.read_bytes()).hexdigest();b=CredentialBoundary(w,h)
 b.write(w/'credential-commit.intent.private.json',{'planSha256':h})
 if classification=='ORIGINAL_VERIFIED':b.record_original_observation(lambda:'ORIGINAL_VERIFIED')
 elif classification=='VERIFIED':b.record_verified_observation(lambda:VERIFIED)
 class DBReads:
  def __init__(self,bridge):pass
  def prior(self):return fullplan,h,b
  def classify(self,*args):return classification
  def verify_current_verified(self,*args):
   if classification!='VERIFIED':raise RuntimeError('current_new_cipher_unproven')
   return 'VERIFIED_CURRENT_NEW_EPOCH'
 return DBReads

for kind in ('retained_valid','removed_valid','missing','invalid','schema','tooling','lab_running','migration','proof','mode_permission','type','symlink','binding_hash','absent_field','bool_type'):
 for mode in contract.MODES:
  with tempfile.TemporaryDirectory()as tmp:
   p=Path(tmp)/P.name;shutil.copytree(P,p)
   if kind!='retained_valid':mutate(p,kind)
   ops=load('concrete_ops',p/mode/'ops.py');op=ops.Operations(p/mode,None);sim=driver_for(op);op.d=sim
   valid=kind in ('retained_valid','removed_valid')
   # Same proof used by checker/preflight/Node. Do not call a parallel predicate.
   outcomes=[]
   for call in (lambda:contract.validate(p/mode),lambda:subprocess.run(['node','-e',"require(process.argv[1]).proofs(process.argv[2])",str(p/mode/'preparation-bindings.cjs'),str(p/mode)],capture_output=True,timeout=10,check=True)):
    try:call();outcomes.append(True)
    except (RuntimeError,KeyError,FileNotFoundError,IsADirectoryError,subprocess.CalledProcessError):outcomes.append(False)
   assert outcomes==[valid,valid],(kind,mode,'proof consumer diverged')
   if valid:
    if mode!='switch':
     # Derive prior exit from a real stop in this copy (different simulated process set).
     prev=ops.Operations(p/'switch',None);prev.d=driver_for(prev)
     prev.d.live={};prev.d.proc={};prev.d.sockets=set();prev.d.pid=500
     for cfg in prev.source.values():prev.d.add(cfg)
     prev.stop()
    op.stop(recovery=(mode in ('return-partial','return-before-commit')))
    assert [s for s in sim.calls if isinstance(s,str)and s.startswith('delete:')]==['delete:'+ops.API,'delete:'+ops.WORKER]
    classification='ORIGINAL_VERIFIED'if mode=='return-before-commit'else'VERIFIED'
    reads=boundary(p,classification)
    with patch.object(cipher_start_gate,'Driver',reads),patch.object(sequencer,'PREPARATIONS',p.parent):
     op.start(ops.API);op.start(ops.WORKER)
    assert set(sim.live)==ops.NAMES
   else:
    try:op.stop();raise AssertionError('invalid stop accepted')
    except (RuntimeError,KeyError,FileNotFoundError,IsADirectoryError):pass
    assert not any(s.startswith('delete:')for s in sim.calls if isinstance(s,str))
    try:op.start(ops.API);raise AssertionError('invalid start accepted')
    except (RuntimeError,KeyError,FileNotFoundError,IsADirectoryError):pass
    assert not any(s.startswith('start:')for s in sim.calls if isinstance(s,str))
   cases.append({'mode':mode,'restore':kind,'accepted':valid})
# Actual start authorization: uncertain/contradictory epoch cannot create a start intent.
for mode,classification in [('switch','UNCERTAIN'),('return','ORIGINAL_VERIFIED'),('return-before-commit','VERIFIED')]:
 with tempfile.TemporaryDirectory()as tmp:
  p=Path(tmp)/P.name;shutil.copytree(P,p);ops=load('epoch_ops',p/mode/'ops.py');op=ops.Operations(p/mode,None);op.d=driver_for(op);reads=boundary(p,classification)
  with patch.object(cipher_start_gate,'Driver',reads),patch.object(sequencer,'PREPARATIONS',p.parent):
   try:op.start(ops.API);raise AssertionError('wrong epoch accepted')
   except RuntimeError:pass
  assert not(p/mode/('start-intent-'+ops.API+'.json')).exists()
  cases.append({'mode':mode,'boundary':classification,'accepted':False})
# Permission ownership check without chown: lstat observation altered only for targeted file.
with tempfile.TemporaryDirectory()as tmp:
 p=Path(tmp)/P.name;shutil.copytree(P,p);original=Path.lstat;target=p/'window/restore-result.json'
 def observed(path,*args,**kw):
  v=original(path,*args,**kw)
  if path==target:
   a=list(v);a[4]=v.st_uid+1;return os.stat_result(a)
  return v
 with patch.object(Path,'lstat',observed):
  try:contract.validate(p/'switch');raise AssertionError('owner accepted')
  except RuntimeError:pass
 cases.append({'restore':'owner_divergence','accepted':False})
print(json.dumps({'result':'CONCRETE_OPERATIONS_RESTORE_PASS','cases':cases,'caseCount':len(cases),'fullCandidate':True,'productionEffects':False},sort_keys=True))
