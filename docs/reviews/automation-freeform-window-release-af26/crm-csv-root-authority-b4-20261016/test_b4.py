"""Directed static composition / actual disposable filesystem installation proofs.
Root UID/chain trust is simulated. visudo syntax check and filesystem effects
are real in the lab. No helper/phase is executed.
"""
import copy
import hashlib
import json
import os
from pathlib import Path
import stat
import tempfile
import unittest
from unittest.mock import patch
import compose_static as c
import install_static as i


class LabFS(i.Filesystem):
    def __init__(self,root):self.root=Path(root);self.uid=os.getuid();self.fail=None;self.validations=0
    def path(self,p):
        p=Path(p)
        if p.is_relative_to(self.root):return p
        return self.root/str(p).lstrip('/')
    def chain(self,p):
        # Real lab path directories/permissions; root ownership and external
        # ancestors (/tmp etc) substituted, NOT certified as protected roots.
        for parent in self.path(p).parents:
            if parent==self.root.parent:break
            s=parent.lstat();i.require(stat.S_ISDIR(s.st_mode)and s.st_uid==self.uid and not s.st_mode&0o022,'lab_chain')
    def put(self,p,raw,mode=0o600):
        if self.fail and Path(p).name.startswith(self.fail):raise OSError('synthetic interrupted install')
        return super().put(p,raw,mode)
    def visudo(self,p):
        self.validations+=1
        return super().visudo(p) # real visudo -cf on a lab file only


class B4Tests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.plan,cls.objects=c.compose()
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.lab=Path(self.temp.name);self.kit=self.lab/'kit';self.kit.mkdir();(self.kit/'objects').mkdir()
        self.plan=copy.deepcopy(self.__class__.plan)
        for key,raw in self.objects.items():(self.kit/'objects'/(key+'.source')).write_bytes(raw)
        (self.kit/'COMPOSITION.json').write_bytes(c.encoded(self.plan));self.review=i.sha((self.kit/'COMPOSITION.json').read_bytes())
        self.fs=LabFS(self.lab/'root');self.fs.root.mkdir(mode=0o700)
        for p in (i.LIB,Path('/etc/sudoers.d'),i.JOURNAL):self.fs.path(p).mkdir(parents=True,mode=0o755)
        # Declare synthetic fixture directory metadata before the subject runs.
        for directory in self.fs.root.rglob('*'):
            if directory.is_dir():os.chmod(directory,0o755)
        # No productive permissions change.
        self.fs.path(i.LOCK).write_bytes(b'');os.chmod(self.fs.path(i.LOCK),0o600)
        self.prior={str(p):self.fs.state(p)for p in [*(p for p,_ in i.TARGETS.values()),i.ALIAS]}
    def install(self):
        raw=i.canonical(self.prior)
        with patch.object(i.os,'geteuid',lambda:0):
            return i.install(self.kit,self.review,raw,i.sha(raw),owner_action=True,fs=self.fs)
    def untouched(self):
        self.assertFalse(any(self.fs.path(p).exists()for p,_ in i.TARGETS.values()))
    def test_dedup_and_all_four_modes(self):
        self.assertEqual(set(c.MODES),{'switch','return','return-partial','return-before-commit'})
        self.assertGreater(self.plan['paths'],self.plan['uniqueContents'])
        for mode in c.MODES:
            for n in ('ops.py','delegated.py','execution-check.cjs','pm2_input.py','ecosystem_contract.py'):
                self.assertIn(mode+'/'+n,self.plan['files'])
    def test_real_node_loader_rejects_existing_builtin_gap(self):
        import shutil,subprocess
        boot=c.REVIEW/'crm-csv-root-authority-b1-20261016/node_bootstrap.cjs'
        row=self.plan['files']['return-before-commit/waiting-work-frozen.cjs']
        raw=self.objects[row['sha256']]
        import base64
        name='return-before-commit/waiting-work-frozen.cjs'
        snap={'root':'/synthetic/preparation','identity':['synthetic-anchor',None],
              'correlation':{'authority':['synthetic-anchor',None],'executionSha256':None},'entry':name,
              'manifest':{'files':{name:{'language':'commonjs','sha256':i.sha(raw)}},'imports':{}},
              'files':{name:base64.b64encode(raw).decode()}}
        code='const b=require('+json.dumps(str(boot))+');try {b.run('+json.dumps(name)+',["--diagnostic-window","/synthetic/preparation/window"],()=>JSON.stringify('+json.dumps(snap)+'));process.exit(9)}catch(e){process.stdout.write(e.message)}'
        value=subprocess.check_output([shutil.which('node'),'-e',code],text=True)
        self.assertEqual(value,'node_import_undeclared:node:assert/strict')

    def test_exact_accepted_protected_bytes(self):
        for dest,folder,name in [('authority.py','crm-csv-root-authority-b1-20261016','authority.py'),
                                 ('recovery-launch.py','crm-csv-root-authority-b1-20261016','bootstrap.py')]:
            row=self.plan['files']['protected/'+dest]
            self.assertEqual(self.objects[row['sha256']],c.pinned(c.REVIEW/folder/name))
    def test_code_only_never_claims_operational_certification(self):
        self.assertFalse(self.plan['operationallyCertified']);self.assertFalse(self.plan['executionAuthorized'])
        self.assertEqual(self.plan['certification'],'DENY_INTEGRATION_AND_OPERATIONAL_INPUTS')
        for mode in c.MODES:
            self.assertNotIn(mode+'/candidate.config.private.json',self.plan['files'])
            self.assertTrue(any(x['name']==mode+'/candidate.config.private.json'for x in self.plan['missingInputs']))
        self.assertNotIn('window/recovery_binding.py',self.plan['files'])
    def test_dag_cycle_and_unknown_dependency_denied(self):
        with self.assertRaisesRegex(RuntimeError,'cycle'):c.topo({'a':{'b'},'b':{'a'}})
        with self.assertRaisesRegex(RuntimeError,'missing'):c.topo({'a':{'unknown'}})
        self.assertFalse(self.plan['cycles'])
        self.assertTrue(self.plan['transitiveImportCycles']) # inventory only: not a canonical hash-cycle predicate
    def test_unresolved_consumers_are_not_hidden(self):
        missing=[x for x in self.plan['missingInputs']if x['kind']=='import']
        self.assertTrue(any(x['owner']=='window/recovery_bridge.py'and x['name']=='ops'for x in missing))
        self.assertEqual(len(self.plan['integrationBlocks']),4)
    def test_real_lab_install_fixed_targets_alias_receipt_no_authority(self):
        result=self.install();self.assertEqual(result['result'],'STATIC_INSTALL_COMPLETE')
        self.assertEqual(self.fs.validations,2);self.assertEqual(os.readlink(self.fs.path(i.ALIAS)),'/proc/self/fd')
        folder=self.fs.path(i.JOURNAL/self.review)
        self.assertTrue((folder/'intent.private.json').is_file());self.assertTrue((folder/'receipt.private.json').is_file())
        self.assertFalse(result['authorityIssued']);self.assertFalse(result['phasePolicyInstalled'])
        self.assertFalse(any(p.name=='permit.json'for p in self.fs.root.rglob('*')))
        for n,(p,mode)in i.TARGETS.items():
            self.assertEqual(stat.S_IMODE(self.fs.path(p).stat().st_mode),mode)
    def test_repeat_static_install_denied(self):
        self.install()
        with self.assertRaisesRegex(RuntimeError,'prior_drift|consumed'):self.install()
    def test_payload_tamper_denies_before_mutation(self):
        row=self.plan['files']['protected/authority.py'];(self.kit/row['object']).write_bytes(b'tampered')
        with self.assertRaisesRegex(RuntimeError,'payload_hash'):self.install()
        self.untouched()
    def test_manifest_review_hash_tamper_denied(self):
        (self.kit/'COMPOSITION.json').write_bytes(b'{}')
        with self.assertRaisesRegex(RuntimeError,'review_hash'):self.install()
        self.untouched()
    def test_absent_dependency_denies_before_mutation(self):
        row=self.plan['files']['protected/root_store.py'];(self.kit/row['object']).unlink()
        with self.assertRaises(FileNotFoundError):self.install()
        self.untouched()
    def test_prior_drift_denied_before_mutation(self):
        self.fs.path(i.LIB/'authority.py').write_bytes(b'changed source')
        with self.assertRaisesRegex(RuntimeError,'prior_drift'):self.install()
        self.assertFalse(self.fs.path(i.LIB/'recovery-launch.py').exists())
    def test_unsafe_lab_parent_denies_no_auto_repair(self):
        parent=self.fs.path(i.LIB);os.chmod(parent,0o775)
        with self.assertRaisesRegex(RuntimeError,'lab_chain'):self.install()
        self.assertEqual(stat.S_IMODE(parent.stat().st_mode),0o775);self.untouched()
    def test_wrong_alias_denies_before_mutation(self):
        os.symlink('/tmp',self.fs.path(i.ALIAS));self.prior[str(i.ALIAS)]=self.fs.state(i.ALIAS)
        with self.assertRaisesRegex(RuntimeError,'alias_conflict'):self.install()
        self.untouched()
    def test_partial_retains_intent_without_receipt_no_retry(self):
        self.fs.fail='.child_transport.py.b4-'
        with self.assertRaises(OSError):self.install()
        folder=self.fs.path(i.JOURNAL/self.review)
        self.assertTrue((folder/'intent.private.json').exists());self.assertFalse((folder/'receipt.private.json').exists())
        self.assertEqual(i.inspect(self.kit,self.review,self.fs)['result'],'STATIC_INSTALL_INCOMPLETE')
        self.fs.fail=None
        with self.assertRaisesRegex(RuntimeError,'prior_drift|consumed'):self.install()
    def test_readonly_verifier_denies_operational_and_checks_integrity(self):
        import verify_static
        value=verify_static.verify(self.kit,self.review)
        self.assertFalse(value['executionAuthorized'])
        with self.assertRaisesRegex(RuntimeError,'DENY_INTEGRATION_AND_OPERATIONAL_INPUTS'):
            verify_static.verify(self.kit,self.review,True)
        row=self.plan['files']['switch/ops.py'];(self.kit/row['object']).write_bytes(b'changed')
        with self.assertRaisesRegex(RuntimeError,'object_hash'):verify_static.verify(self.kit,self.review)

    def test_canonical_checker_missing_contract_denies_before_effect(self):
        import types
        row=self.plan['files']['window/csv_contract.py'];m=types.ModuleType('canonical_negative')
        exec(compile(self.objects[row['sha256']],'canonical-csv-contract','exec'),m.__dict__)
        with self.assertRaises(FileNotFoundError):m.check(self.kit,live=False)
        self.untouched()

    def test_query_only_sudoers_no_owner_emission_privilege(self):
        row=self.plan['files']['protected/re7-incident-6683-window'];text=self.objects[row['sha256']].decode()
        self.assertIn('inspect-recovery-authority',text);self.assertNotIn('issue',text);self.assertNotIn('install',text)

if __name__=='__main__':unittest.main(verbosity=2)
