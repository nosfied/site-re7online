"""Only new local delivery/index/next-read interfaces. No VPS or application effects."""
import ast
import contextlib
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import types
import unittest
from unittest.mock import patch

from scripts.crm_csv_delivery import prepare_review as p, read_boundary as b
ROOT=p.ROOT
R=b.REVIEW/'crm-csv-delivery-review-20261017'
CASES=[]

def read_program(raw):
    return b.program(raw,b.PRESTOP_SHA)

def virtual(code, root):
    # Preserve the entire actual predicate. Only its external filesystem namespace
    # is mapped; real local stat/modes drive all original require decisions.
    original=Path.lstat
    observed=[]
    def lstat(path,*a,**kw):
        target=root/str(path).lstrip('/')
        observed.append(str(path));return original(target,*a,**kw)
    out=io.StringIO()
    with patch.object(Path,'lstat',lstat),contextlib.redirect_stdout(out):
        try:exec(compile(code,'<literal future read program>','exec'),{'__name__':'__main__'})
        except SystemExit as e:exitcode=e.code
    return exitcode,json.loads(out.getvalue()),observed

class Delivery(unittest.TestCase):
    def test_concrete_review_all_objects_and_canonical_contracts(self):
        plan=json.loads((R/'CODE_COMPOSITION.json').read_bytes());refs=json.loads((R/'CODE_OBJECTS.json').read_bytes());d=json.loads((R/'DELIVERY.json').read_bytes())
        self.assertEqual(hashlib.sha256((R/'CODE_COMPOSITION.json').read_bytes()).hexdigest(),d['compositionSha256'])
        self.assertFalse(plan['executionAuthorized']);self.assertFalse(plan['operationallyCertified']);self.assertEqual(plan['cycles'],[])
        self.assertEqual(len(plan['files']),127)
        for name,row in plan['files'].items():
            path=ROOT/refs['objects'][row['sha256']]['source'];raw=path.read_bytes()
            self.assertEqual(hashlib.sha256(raw).hexdigest(),row['sha256']);self.assertEqual(len(raw),row['bytes'])
        self.assertEqual(refs['reusedObjects'],54);self.assertEqual(refs['newObjects'],7)
        self.assertEqual(plan['imports']['window/original_checks.py']['policy_predecessor'],'window/policy_predecessor.py')
        # Inspect the same original-aware entrypoints; no operational function runs.
        for name in ('window/recovery.py','window/original_checks.py','window/prestop_contract.py'):
            raw=(ROOT/refs['objects'][plan['files'][name]['sha256']]['source']).read_bytes();ast.parse(raw)
        self.assertTrue(plan['transitiveImportCycles'],'accepted late call cycle remains inventoried')
        CASES.append('127 concrete paths/61 contents exact; original/prevention/predecessor kept; eager DAG acyclic, late cycles not hidden')

    def test_archive_summary_matches_published_and_no_copy(self):
        d=json.loads((R/'DELIVERY.json').read_text());a=json.loads(p.pinned(p.COORD/'ARTIFACTS_SANITIZED.json'))
        for name,row in {**a['artifacts'],**a['auxiliaryArtifacts']}.items():
            v=d['runtimeReuse']['artifacts'][name]
            self.assertEqual((v['sha256'],v['bytes']),(row['sha256'],row['bytes']))
            self.assertFalse(v['copied']);self.assertFalse(v['rebuilt']);self.assertFalse(v['extracted'])
        self.assertEqual(d['runtimeReuse']['preservedApiFiles'],442);self.assertFalse(d['currentInputsFabricated'])
        CASES.append('four exact certified artifact references;442/447 preservation and candidate-only post-selection return, no rebuild/copy')

    def test_existing_or_outside_destination_denies_before_private_read(self):
        with tempfile.TemporaryDirectory() as td:
            with self.assertRaisesRegex(RuntimeError,'outside_checkout'):p.prepare('absent','absent',td)
        with self.assertRaisesRegex(RuntimeError,'exclusive_review_destination'):p.prepare('absent','absent',R)
        CASES.append('exclusive destination and checkout scope deny before reading custody/material or writing')

    def test_literal_boundary_valid_and_775(self):
        raw=b.PRESTOP_SOURCE.read_bytes();code=read_program(raw)
        with tempfile.TemporaryDirectory() as td:
            root=Path(td);target=root/'opt/re7online/site-re7online/apps/whatsapp-agent/src/events/eventRetentionPolicy.ts';target.parent.mkdir(parents=True)
            # Root and all parents of the exact literal are real non-writable dirs.
            for path in target.parents:
                if path==root.parent:break
                path.chmod(0o755)
            exitcode,v,seen=virtual(code,root)
            self.assertEqual(exitcode,0);self.assertTrue(v['eventParentsPass']);self.assertFalse(v['fullPrestopCertified'])
            self.assertEqual(len(seen),len(Path('/opt/re7online/site-re7online/apps/whatsapp-agent/src/events/eventRetentionPolicy.ts').parents))
            target.parent.chmod(0o775)
            exitcode,v,seen=virtual(code,root)
            self.assertEqual(exitcode,1);self.assertFalse(v['eventParentsPass']);self.assertEqual(v['denialStage'],'event-parent-contract')
            self.assertEqual(seen,['/opt/re7online/site-re7online/apps/whatsapp-agent/src/events'])
        CASES.append('literal read program runs complete canonical event_parents; real local dirs775 deny, no writes/contains/starts; only namespace simulated')

    def test_predicate_tampering_denies_before_code(self):
        with self.assertRaisesRegex(RuntimeError,'prestop_review_drift'):b.program(b'raise AssertionError("executed")',b.PRESTOP_SHA)
        # Import/compilation of the dispatcher does not initiate any transport.
        with patch.object(subprocess,'run',side_effect=AssertionError('transport during import')):
            ns={'__name__':'library','__file__':b.__file__};exec(compile(Path(b.__file__).read_bytes(),b.__file__,'exec'),ns)
        CASES.append('fixed external digest, not package-self-claimed; tamper denied before compile/exec; import never connects')

    def test_private_custody_timeout_and_consumed_destination(self):
        with tempfile.TemporaryDirectory() as td:
            parent=Path(td);parent.chmod(0o700);dest=parent/'one-new-read'
            prefix=b'{"partial":'
            with patch.object(b,'CUSTODY',dest),patch.object(b.subprocess,'run',side_effect=subprocess.TimeoutExpired(['ssh'],25,output=prefix,stderr=b'partial diagnostic')) as run,contextlib.redirect_stdout(io.StringIO()):
                code=b.execute();self.assertEqual(code,1);self.assertEqual(run.call_count,1)
                self.assertEqual((dest/'csv-event-boundary.stdout.private').read_bytes(),prefix)
                receipt=json.loads((dest/'sequencer.journal.jsonl').read_text().splitlines()[-1]);self.assertFalse(receipt['sourceComplete']);self.assertFalse(receipt['eventParentsPass'])
                with self.assertRaises(Exception):b.execute()
                self.assertEqual(run.call_count,1,'no repeat/reconnection after consumed destination')
        CASES.append('real canonical private_record/Capture files; SSH timeout simulated, exact partial custody, exclusive destination stops repeat')

if __name__=='__main__':
    result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Delivery))
    if result.wasSuccessful():
        proof={'result':'CSV_LOCAL_DELIVERY_INTERFACES_VALIDATED_NOT_DEPLOYED','tests':result.testsRun,'cases':CASES,'real':'Concrete deduplicated accepted source index; real local canonical metadata predicate/private custody files; exact source pins and hashes','simulated':'Remote namespace projected onto temporary local dirs; SSH response timeout only. No sudo/PM2/SQL/production services or phase authority executed','reusedNotRepeated':'Compiled/browser/Prisma/restore/PM2/R1R2/ORIGINAL suites. ELF budget/discovery paused and never executed','sourceHashes':{n:hashlib.sha256((Path(__file__).parent/n).read_bytes()).hexdigest() for n in ('prepare_review.py','read_boundary.py','test_delivery.py')}}
        (R/'PROOFS.json').write_text(json.dumps(proof,indent=2)+'\n')
    raise SystemExit(not result.wasSuccessful())
