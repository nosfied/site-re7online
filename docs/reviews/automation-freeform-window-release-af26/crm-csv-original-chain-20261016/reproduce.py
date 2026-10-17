"""Reproduce current bytes and affected ORIGINAL proofs, public pinned inputs only."""
import hashlib,importlib.util,json,subprocess,sys,tempfile,unittest
from pathlib import Path
import compose
import test_chain
HERE=Path(__file__).resolve().parent

def inventory(root):return {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest()for p in root.rglob('*')if p.is_file()}

def run(proof=None):
 with tempfile.TemporaryDirectory(prefix='re7-original-reproduction-')as td:
  kit=Path(td)/'kit';plan=compose.write(kit)
  if inventory(kit)!=inventory(HERE/'static-kit'):raise RuntimeError('STATIC_RECOMPOSITION_DIVERGED')
  ref=HERE.parent/'crm-csv-root-authority-b4-20261016/verify_static.py'
  spec=importlib.util.spec_from_file_location('b4_static_verify',ref);v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
  review=hashlib.sha256((kit/'COMPOSITION.json').read_bytes()).hexdigest();static=v.verify(kit,review)
  try:v.verify(kit,review,True)
  except RuntimeError as e:
   if str(e)!='DENY_OPERATIONAL_INPUTS':raise
  else:raise RuntimeError('UNEXPECTED_OPERATIONAL_CERTIFICATION')
  class Result(unittest.TextTestResult):
   def __init__(self,*a,**k):super().__init__(*a,**k);self.passed=[];self.traces={}
   def addSuccess(self,test):
    super().addSuccess(test);name=test.id().split('.')[-1];self.passed.append(name)
    # unittest invokes cleanups BEFORE addSuccess; use the snapshot captured
    # before temporary files are removed, never reread a cleaned lab.
    self.traces[name]=test.l.summary
  result=unittest.TextTestRunner(verbosity=2,resultclass=Result).run(unittest.defaultTestLoader.loadTestsFromTestCase(test_chain.Chain))
  data={'result':'ORIGINAL_CHAIN_LOCAL_VALIDATED'if result.wasSuccessful()else'DENY','base':compose.BASE,
   'compositionSha256':review,'testsRun':result.testsRun,'passed':result.passed,'failures':len(result.failures),'errors':len(result.errors),
   'traces':result.traces,'sourceHashes':{n:hashlib.sha256((HERE/n).read_bytes()).hexdigest()for n in ('lab.py','node_child.py','test_chain.py','delta.py','compose.py','reproduce.py')},
   'recomposition':'EXACT_ALL_BYTES','staticVerifier':static,'operationalCertification':'DENY_OPERATIONAL_INPUTS',
   'externalSimulation':'root query/install/metadata/helper/sudo, namespace admission, /proc/PM2/network/SQL/HTTP, custody-after-exit observation; no callbacks replacing Contract/check_original/restore/certificate/bindings/gates or closure',
   'actual':'Current Context/Loader, Recovery.inspect/recover, Bridge.protocol, delegated main+request/record/proof/execute locks+consumption, Operations/Controls, start gate+factory, db-owner verifier, ScheduledControls, sealed memfd; Node/Python child processes+bootstrap+baseline+validate/open+restore+waiting-work',
   'notExecuted':'VPS, root installation/emission, productive SQL/PM2/start/stop, runtime build, backup or window'}
  if result.wasSuccessful():
   positive=data['traces']['test_complete_original_no_candidate_code']
   if not(positive['receiptExists'] and positive['dataEvidencePreserved'] and positive['bindingEntries']==2 and positive['cronsRestored'] and positive['barrierAbsent'] and not positive['candidateCodeLoaded']):raise RuntimeError('TRACE_RECORDER_INCONSISTENT_WITH_ACCEPTANCE')
  if proof:Path(proof).write_text(json.dumps(data,sort_keys=True,indent=2)+'\n')
  print(json.dumps({k:data[k]for k in ('result','compositionSha256','testsRun','failures','errors')}))
  return 0 if result.wasSuccessful()else 1
if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser();p.add_argument('--proof');a=p.parse_args();sys.exit(run(a.proof))
