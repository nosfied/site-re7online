"""Focused future reader interfaces; real launcher/FD/custody in an isolated lab.
Historical cmdline/context stay private. No network, PM2, Docker, SQL or sudo.
"""
import base64
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

HERE=Path(__file__).resolve().parent

def module(name,path):
    s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m

c=module('correction',HERE/'correction.py')
b=module('prior_lab',HERE.parent/'crm-csv-r2-directed-20261017/test_directed.py')
CUSTODY=b.CUSTODY
RAW=c.compose()
m=type('Future',(),{})()
ns={'__name__':'future_library','__file__':'<future reader>'};exec(compile(RAW,'<future reader>','exec'),ns);m.__dict__.update(ns)
b.m=m
PRIVATE_CONTEXT=CUSTODY/'crm-csv-staging-20261016/capture-context-v2.private.json'
GAP=CUSTODY/'csv-r2-gap-diagnostic-20261017-v1/gap-capture.private.jsonl'
assert hashlib.sha256(GAP.read_bytes()).hexdigest()=='d19f335f38531d2cc14a40fffe9946eb1d0630a2aa1161ae9a0c94b512f3ecaf'
assert hashlib.sha256(PRIVATE_CONTEXT.read_bytes()).hexdigest()==m.FRONTEND_REFERENCE_SHA
ROWS=[json.loads(x)for x in GAP.read_text().splitlines()]
FRONT=next(r for r in ROWS if r.get('label')=='frontend')
PROXY=next(r for r in ROWS if r.get('label')=='proxy')
FRONT_RAW=base64.b64decode(FRONT['cmdlineBase64'])
PROXY_RAW=base64.b64decode(PROXY['cmdlineBase64'])


class ReaderCorrection(b.Launcher):
    # Only methods explicitly named below are loaded; old suites aren't rerun.
    def setUp(self):
        self.sourceTmp=tempfile.TemporaryDirectory(prefix='re7-future-source-')
        b.SOURCE=Path(self.sourceTmp.name)/'read_package.py';b.SOURCE.write_bytes(RAW)
        super().setUp()
        self.history=[]
        for name in ('csv-r1r2-read-20261016-v1','csv-r1r2-complement-read-20261017-v1',
                     'csv-r1r2-deploy-complement-read-20261017-v1','csv-r2-directed-read-20261017-v1',
                     'csv-r2-gap-diagnostic-20261017-v1'):
            self.history.extend((p,b.snapshot(p))for p in sorted((CUSTODY/name).iterdir()))
        # The prior fixture is reused; only affected representations/identity and
        # immutable reference are replaced. Actual preserved bytes, not guesses.
        (self.tools/'read_package.py').write_bytes(RAW)
        local_package=self.lab/'home'/b.HERE.relative_to('/home')
        (local_package/'read_package.py').write_bytes(RAW)
        b.exclusive(self.tools/'frontend-reference.private.json',PRIVATE_CONTEXT.read_bytes())
        (self.lab/'proc/188897/cmdline').write_bytes(FRONT_RAW)
        (self.lab/'proc/188897/environ').write_bytes(b'PM2_HOME=/home/deploy/.pm2\0')
        (self.lab/'proc/177517/cmdline').write_bytes(PROXY_RAW)
        statfile=self.lab/'proc/177517/stat';statfile.write_text(statfile.read_text().replace('888\n','96580070\n'))
        # UID0 metadata is an explicit user-namespace simulation, mapped only to
        # host UID1000; capabilities dropped, no privilege over host resources.
        self.base[1:1]=['--unshare-user','--uid','0','--gid','0']
        self.blocks=[x.replace(c.BASE_SHA,hashlib.sha256(RAW).hexdigest())for x in self.blocks]
        # Both sides use the SAME reference path in the lab. This is a local
        # transport adaptation, not a published/ready operational command.
        self.blocks=[x.replace('R='+str(b.HERE),'R='+b.TOOL)for x in self.blocks]
    def tearDown(self):
        for p,s in self.history:self.assertEqual(b.snapshot(p),s)
        super().tearDown();self.sourceTmp.cleanup()
    def inventory(self):
        raw=(self.lab/'remote'/Path(m.REMOTE).name/m.JOURNAL).read_bytes()
        records=[json.loads(x)for x in raw.splitlines()]
        return json.loads(base64.b64decode(records[1]['stdoutBase64'])),raw
    def deny_chain(self,reason):
        r=self.action('collect');self.assertNotEqual(r.returncode,0,r.stderr.decode())
        inventory,raw=self.inventory();self.assertTrue(any(x.get('reason')==reason for x in inventory['errors']),inventory['errors'])
        r=self.action('custody');self.assertNotEqual(r.returncode,0,r.stderr.decode())
        dest=self.custody_root/Path(m.LOCAL).name
        self.assertEqual((dest/'complement-capture.private.jsonl').read_bytes(),raw)
        self.assertEqual(json.loads((dest/'sequencer.journal.jsonl').read_text())['event'],'R2_DIRECTED_CUSTODY_DENY')
        return inventory
    def test_real_representations_complete_launcher_and_custody_deny_script_only(self):
        v=self.deny_chain('canonical_frontend_configuration_proof_missing')
        self.assertEqual(len(v['errors']),1);by={x['label']:x['value']for x in v['targets']}
        f=by['process-frontend'];self.assertFalse(f['scriptMarkerConfirmed'])
        self.assertEqual(f['cmdlineSha256'],FRONT['cmdlineSha256']);self.assertEqual(f['scriptCertification'],m.FRONTEND_SCRIPT_UNKNOWN)
        self.assertEqual(f['representation']['provenance']['sourceSha256'],m.FRONTEND_REFERENCE_SHA)
        self.assertEqual(by['sql-proxy']['flags'],['-use-listen-fd'])
        self.assertTrue(by['interval-checks']['listenerFdRelationsConfirmed'])
        self.assertEqual(by['interval-checks']['frontendScriptCertification'],m.FRONTEND_SCRIPT_UNKNOWN)
        self.assertEqual(v['result'],'DIRECTED_INVENTORY_DENY')
        with self.assertRaisesRegex(RuntimeError,'directed_inventory_denied'):m.validate_directed_inventory(v,PRIVATE_CONTEXT)
        self.assertFalse(v['atomicSnapshot']);self.assertFalse(v['operationalCertification'])
        self.assertNotIn('UNSELECTED_SENTINEL',json.dumps(v))
    def test_frontend_title_tamper(self):
        (self.lab/'proc/188897/cmdline').write_bytes(FRONT_RAW+b'x')
        self.deny_chain('frontend_representation_drift')
    def test_reference_tamper(self):
        with (self.tools/'frontend-reference.private.json').open('ab')as f:f.write(b' ')
        self.deny_chain('frontend_reference_integrity')
    def test_frontend_ticks_divergence(self):
        p=self.lab/'proc/188897/stat';p.write_text(p.read_text().replace('2161347676','2161347677'))
        self.deny_chain('historical_candidate_ticks_drift')
    def test_api_marker_still_required(self):
        (self.lab/'proc/936386/cmdline').write_bytes(b'node synthetic-no-marker\0')
        self.deny_chain('process_script_unconfirmed')
    def test_worker_database_still_required(self):
        (self.lab/'proc/936540/environ').write_bytes(b'PM2_HOME=/home/deploy/.pm2\0')
        self.deny_chain('database_channel_missing')
    def test_proxy_ticks_divergence(self):
        p=self.lab/'proc/177517/stat';p.write_text(p.read_text().replace('96580070','96580071'))
        self.deny_chain('proxy_candidate_identity_changed')
    def probe(self,code,reason):
        prefix="import hashlib,json,os\nfrom pathlib import Path\np=Path("+repr(b.TOOL)+")\nraw=(p/'read_package.py').read_bytes()\nassert hashlib.sha256(raw).hexdigest()=="+repr(hashlib.sha256(RAW).hexdigest())+"\nlib={'__name__':'authenticated_lab_library','__file__':str(p/'read_package.py')}\nexec(compile(raw,str(p/'read_package.py'),'exec'),lib)\nref=p/'frontend-reference.private.json'\n"
        suffix="\nexcept RuntimeError as e:\n assert str(e)=="+repr(reason)+",str(e)\n print('EXPECTED_DENY')\nelse:raise AssertionError('negative_not_detected')\n"
        driver=prefix+"try:\n"+''.join(' '+x+'\n'for x in code.splitlines())+suffix
        r=self.run_ns(['/usr/bin/python3','-B','-I','-S','-'],driver.encode())
        self.assertEqual(r.returncode,0,r.stderr.decode());self.assertEqual(r.stdout.strip(),b'EXPECTED_DENY')
    def test_frontend_concurrent_title_change_at_use(self):
        self.probe("""read=lib['read_at'];done=False
def change(fd,name,limit):
 global done
 value=read(fd,name,limit)
 if name=='cmdline' and not done:
  done=True;Path('/proc/188897/cmdline').write_bytes(value+b'x')
 return value
lib['read_at']=change
lib['process']('frontend',lib['HISTORICAL_CANDIDATES']['frontend'],Path('/proc'),{},ref)""",'frontend_representation_changed')
    def test_proxy_concurrent_identity_change_at_use(self):
        self.probe("""read=lib['read_at'];done=False
def change(fd,name,limit):
 global done
 value=read(fd,name,limit)
 if name=='cmdline' and not done:
  done=True;p=Path('/proc/177517/stat');p.write_text(p.read_text().replace('96580070','96580071'))
 return value
lib['read_at']=change
lib['proxy_channel'](Path('/proc'))""",'proxy_identity_changed')
    def test_frontend_interval_revalidates_representation(self):
        self.probe("""v=lib['directed_inventory'](Path('/proc'),ref)
p=Path('/proc/188897/cmdline');p.write_bytes(p.read_bytes()+b'x')
lib['interval_checks'](v['targets'],Path('/proc'),ref)""",'frontend_interval_representation_changed')
    def test_proxy_interval_revalidates_representation(self):
        self.probe("""v=lib['directed_inventory'](Path('/proc'),ref)
p=Path('/proc/177517/cmdline');p.write_bytes(p.read_bytes().replace(b'-container-port\\0'+b'5432',b'-container-port\\0'+b'5433'))
lib['interval_checks'](v['targets'],Path('/proc'),ref)""",'proxy_interval_changed')
    def test_proxy_scheduler_state_is_not_identity_drift(self):
        prefix="import hashlib\nfrom pathlib import Path\np=Path("+repr(b.TOOL)+");raw=(p/'read_package.py').read_bytes()\nassert hashlib.sha256(raw).hexdigest()=="+repr(hashlib.sha256(RAW).hexdigest())+"\nlib={'__name__':'authenticated_lab_library','__file__':str(p/'read_package.py')}\nexec(compile(raw,str(p/'read_package.py'),'exec'),lib)\nref=p/'frontend-reference.private.json'\n"
        code="v=lib['directed_inventory'](Path('/proc'),ref)\np=Path('/proc/177517/stat');p.write_text(p.read_text().replace(' S ',' R '))\nr=lib['interval_checks'](v['targets'],Path('/proc'),ref)\nassert r['frontendScriptCertification']['decision']=='DENY'\nprint('OBSERVATION_RECHECK_ONLY')\n"
        r=self.run_ns(['/usr/bin/python3','-B','-I','-S','-'],(prefix+code).encode())
        self.assertEqual(r.returncode,0,r.stderr.decode());self.assertEqual(r.stdout.strip(),b'OBSERVATION_RECHECK_ONLY')
    def test_complete_validator_cannot_promote_unknown(self):
        self.probe("""v=lib['directed_inventory'](Path('/proc'),ref)
v['result']='DIRECTED_INVENTORY_COMPLETE';v['errors']=[]
lib['validate_directed_inventory'](v,ref)""",'canonical_frontend_configuration_proof_missing')
    def test_reference_read_denied(self):
        b.exclusive(self.lab/'denied',b'',0o000)
        self.base+=['--ro-bind',str(self.lab/'denied'),b.TOOL+'/frontend-reference.private.json']
        self.assertNotEqual(self.action('collect').returncode,0)
        v,_=self.inventory();self.assertTrue(any(e['errorClass']=='PermissionError'and e['errno']==13 for e in v['errors']))
        self.assertNotEqual(self.action('custody').returncode,0)


class Interfaces(unittest.TestCase):
    def test_proxy_actual_and_no_unitary(self):
        values,flags=m.proxy_arguments(PROXY_RAW);self.assertEqual(flags,['-use-listen-fd']);self.assertEqual(len(values),5)
        values2,flags=m.proxy_arguments(PROXY_RAW.replace(b'-use-listen-fd\0',b''))
        self.assertEqual(values,values2);self.assertFalse(flags)
    def test_proxy_format_counterexamples(self):
        args=PROXY_RAW[:-1].split(b'\0')
        mutations={
          'duplicate_unitary':args+[b'-use-listen-fd'],
          'duplicate_valued':args+[b'-proto',b'tcp'],
          'unknown':args[:-1]+[b'-other'],
          'missing_value':[b'/usr/bin/docker-proxy',b'-proto'],
          'option_as_value':[b'/usr/bin/docker-proxy',b'-proto',b'-host-ip'],
          'missing_pair':args[:-3]+args[-1:],
          'extra_token':args+[b'garbage'],
          'empty_value':[b'/usr/bin/docker-proxy',b'-proto',b''],
          'wrong_executable':[b'/other/proxy']+args[1:],
        }
        for name,a in mutations.items():
            with self.subTest(name=name),self.assertRaises(RuntimeError):m.proxy_arguments(b'\0'.join(a)+b'\0')
        duplicate_pair=list(args);duplicate_pair[3]=b'-proto'
        for a in (duplicate_pair,args[:-3]+[b'-use-listen-fd',b'-use-listen-fd']):
            with self.assertRaisesRegex(RuntimeError,'proxy_flag_duplicate'):
                m.proxy_arguments(b'\0'.join(a)+b'\0')
        for raw in (PROXY_RAW[:-1],PROXY_RAW+b'\0',b'x'*16385):
            with self.assertRaises(RuntimeError):m.proxy_arguments(raw)
        for old,new in ((b'tcp\0',b'udp\0'),(b'5432\0',b'9999\0')):
            with self.assertRaisesRegex(RuntimeError,'proxy_endpoint_changed'):m.proxy_arguments(PROXY_RAW.replace(old,new))
    def row(self):
        r={'cmdlineSha256':FRONT['cmdlineSha256'],'scriptMarkerConfirmed':False,'selectedEnvironment':{},
           'scriptCertification':dict(m.FRONTEND_SCRIPT_UNKNOWN),
           'representation':{'state':'HISTORICAL_MATCH','cmdlineSha256':FRONT['cmdlineSha256'],'provenance':dict(m.FRONTEND_REFERENCE_PROVENANCE)}}
        return r
    def test_reference_and_validator_no_forged_certification(self):
        row=self.row();m.validate_frontend_observation(row,PRIVATE_CONTEXT)
        for key,value in [('scriptMarkerConfirmed',True),('scriptCertification',{'state':'VERIFIED'}),('cmdlineSha256','0'*64)]:
            changed=copy.deepcopy(row);changed[key]=value
            with self.subTest(key=key),self.assertRaises(RuntimeError):m.validate_frontend_observation(changed,PRIVATE_CONTEXT)
        with self.assertRaisesRegex(RuntimeError,'canonical_frontend_configuration_proof_missing'):m.validate_frontend_certification(row)
        with self.assertRaisesRegex(RuntimeError,'canonical_frontend_configuration_proof_missing'):m.validate_frontend_certification({'scriptCertification':{'state':'VERIFIED'}})
    def test_actual_environment_marker_does_not_certify_configuration(self):
        row=self.row();row['selectedEnvironment']['pm_exec_path']=m.HISTORICAL_CANDIDATES['frontend']['script']
        row['scriptMarkerConfirmed']=True
        m.validate_frontend_observation(row,PRIVATE_CONTEXT)
        with self.assertRaisesRegex(RuntimeError,'canonical_frontend_configuration_proof_missing'):
            m.validate_frontend_certification(row)
    def test_reference_replacement_between_lstat_and_open(self):
        with tempfile.TemporaryDirectory()as d:
            p=Path(d)/'reference';b.exclusive(p,PRIVATE_CONTEXT.read_bytes())
            real=m.os.open;changed=False
            def substitute(path,*args,**kwargs):
                nonlocal changed
                if str(path)==str(p)and not changed:
                    changed=True;p.unlink();b.exclusive(p,PRIVATE_CONTEXT.read_bytes())
                return real(path,*args,**kwargs)
            with patch.object(m.os,'open',side_effect=substitute):
                with self.assertRaisesRegex(RuntimeError,'file_replaced_before_open'):m.frontend_reference(p)
    def test_absent_reference_denies(self):
        with self.assertRaisesRegex(RuntimeError,'frontend_reference_required'):
            m.frontend_reference(None)
        with tempfile.TemporaryDirectory()as d:
            with self.assertRaises(FileNotFoundError):m.frontend_reference(Path(d)/'absent')
    def test_source_integrity_and_import_has_no_entrypoint(self):
        self.assertEqual(hashlib.sha256(c.BASE.read_bytes()).hexdigest(),c.BASE_SHA)
        self.assertNotIn('System.check_config',c.compose().decode())
        with patch.object(m.subprocess,'run',side_effect=AssertionError('unexpected effect')):
            scope={'__name__':'library','__file__':'<future>'};exec(compile(RAW,'<future>','exec'),scope)
        with tempfile.TemporaryDirectory()as d:
            p=Path(d)/'bad';p.write_bytes(c.BASE.read_bytes()+b' ')
            with patch.object(c,'BASE',p):
                with self.assertRaisesRegex(RuntimeError,'consumed_reader_source_integrity'):c.compose()


if __name__=='__main__':
    suite=unittest.TestSuite()
    names=[n for n in ReaderCorrection.__dict__ if n.startswith('test_')]
    suite.addTests(ReaderCorrection(n)for n in names)
    suite.addTests(unittest.defaultTestLoader.loadTestsFromTestCase(Interfaces))
    result=unittest.TextTestRunner(verbosity=2).run(suite)
    if result.wasSuccessful():print(json.dumps({'result':'LOCAL_CORRECTION_VALIDATED_FRONTEND_SCRIPT_DENY','tests':result.testsRun,'futureReaderSha256':hashlib.sha256(RAW).hexdigest(),'remoteExecuted':False,'privateBytesPublished':False}))
    raise SystemExit(not result.wasSuccessful())
