"""Recompose exact public kit and run only affected proofs. No private fallback."""
import hashlib,importlib.util,json,subprocess,sys,tempfile,unittest
from pathlib import Path
import compose
import test_closure
HERE=Path(__file__).resolve().parent

def hashes(root):return {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest()for p in root.rglob('*')if p.is_file()}

def run(proof=None):
    with tempfile.TemporaryDirectory(prefix='re7-mode-closure-reproduce-')as td:
        out=Path(td)/'kit';plan=compose.write(out)
        if hashes(out)!=hashes(HERE/'static-kit'):raise RuntimeError('COMPOSED_BYTES_DIVERGE')
        spec=importlib.util.spec_from_file_location('b4_static_verifier',compose.REVIEW/'crm-csv-root-authority-b4-20261016/verify_static.py')
        verifier=importlib.util.module_from_spec(spec);spec.loader.exec_module(verifier)
        review=hashlib.sha256((out/'COMPOSITION.json').read_bytes()).hexdigest()
        verified=verifier.verify(out,review)
        try:verifier.verify(out,review,True)
        except RuntimeError as e:
            if str(e)!='DENY_INTEGRATION_AND_OPERATIONAL_INPUTS':raise
        else:raise RuntimeError('unexpected_operational_certification')
        class Result(unittest.TextTestResult):
            def __init__(self,*a,**k):super().__init__(*a,**k);self.passed=[]
            def addSuccess(self,test):super().addSuccess(test);self.passed.append(test.id().split('.')[-1])
        r=unittest.TextTestRunner(verbosity=2,resultclass=Result).run(unittest.defaultTestLoader.loadTestsFromTestCase(test_closure.Tests))
        data={'result':'LOCAL_VALIDATED_IN_DECLARED_SCOPE'if r.wasSuccessful()else'DENY','base':compose.BASE,
            'compositionSha256':review,'testSourceSha256':hashlib.sha256((HERE/'test_closure.py').read_bytes()).hexdigest(),
            'testsRun':r.testsRun,'passed':r.passed,'errors':len(r.errors),'failures':len(r.failures),
            'recomposition':'EXACT_ALL_BYTES','staticVerification':verified,
            'actual':'Python Context/snapshot/Loader/bootstrap, Node VM/checkedRequire, canonical Operations.config + System.check_config over local /proc, preparation-bindings/waiting-work/restore_contract over synthetic data; real local subprocesses',
            'simulated':'root metadata/installation/query/sudo, productive SQL/docker/guard/PM2 population, exit/restore/DB observers in verify_recovery_exit method test only',
            'notProved':'full recovery with missing candidate DATA directories; productive admission/stop/start/recovery; current inputs; installed toolchain/authority',
            'pm2Proof':'reused B4 PM2_LAB_PROOF.json unchanged; no B3 System.start/pm2_input/ecosystem changes'}
        if proof:Path(proof).write_text(json.dumps(data,sort_keys=True,indent=2)+'\n')
        print(json.dumps({k:data[k]for k in ('result','compositionSha256','testsRun','errors','failures')}))
        return 0 if r.wasSuccessful()else 1
if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser();p.add_argument('--proof');a=p.parse_args();sys.exit(run(a.proof))
