"""Affected contracts only. Real canonical methods; fixture OS and pinned recorded bytes."""
import ast,copy,hashlib,json,tempfile,unittest
from pathlib import Path
import contracts as fixed
import evidence as e
OLD=e.source('old_contract');PRESERVED=e.source('preserved_environment')
RESULTS=[]

class Synthetic(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='re7-front-reconcile-');self.root=Path(self.tmp.name)
        self.before={'name':'re7-admin-front','pm_cwd':'/synthetic/front','pm_exec_path':'/synthetic/launcher.cjs','exec_interpreter':'/synthetic/node',
         'args':[],'node_args':[],'namespace':'default','exec_mode':'cluster_mode','watch':False,'autorestart':True,'stop_exit_codes':0,
         'env':{'APP_SETTING':'SYNTHETIC_APPLICATION','NODE_ENV':'production','PATH':'/synthetic/app-path'},'axm_monitor':{}}
        self.live={'pid':123,'pm2_env':{**copy.deepcopy(self.before),'status':'online','restart_time':0}}
        self.osenv={'PATH':'/synthetic/daemon-path','OS_ONLY':'SYNTHETIC_OS','pm2_env':json.dumps(self.before,sort_keys=True)}
        self.profile={'apps':[{'name':self.before['name'],'cwd':self.before['pm_cwd'],'script':self.before['pm_exec_path'],'interpreter':self.before['exec_interpreter'],'env':copy.deepcopy(self.osenv)}]}
        proc=self.root/'123';proc.mkdir();(proc/'cwd').symlink_to(self.before['pm_cwd']);(proc/'exe').symlink_to(self.before['exec_interpreter'])
        self.envfile=proc/'environ';self.write_env(self.osenv);(proc/'stat').write_text('123 (lab) S '+'0 '*18+'12345\n')
        root=self.root
        class FixturePath:
            def __new__(cls,*args):
                path=Path(*args)
                if path.parts[:2]!=('/','proc'):raise RuntimeError('unmapped_fixture_path')
                return root.joinpath(*path.parts[2:])
        System,Operations=fixed.config_consumers(FixturePath);self.op=Operations();self.op.d=System()
    def tearDown(self):self.tmp.cleanup()
    def write_env(self,values):self.envfile.write_bytes(b''.join((k+'='+v).encode()+b'\0'for k,v in values.items()))
    def check(self,profile=None):return fixed.compare_frontend(self.live,self.before,self.op,self.profile if profile is None else profile)
    def test_projection_denies_original_os_profile_passes(self):
        with self.assertRaisesRegex(RuntimeError,'^environment_drift$'):OLD['compare_frontend'](self.live,self.before,self.op)
        self.assertTrue(self.check()['canonicalConfig'])
        self.assertTrue(fixed.frontend_expected(self.before,self.profile)['env']==self.osenv)
    def test_existing_capture_uses_two_real_fixture_reads_not_pm2_projection(self):
        calls=[]
        def read(path):calls.append(path);return self.envfile.read_bytes()
        result=PRESERVED['capture'](self.live,read)
        self.assertTrue(result==self.osenv);self.assertEqual(len(calls),2)
        with self.assertRaisesRegex(RuntimeError,'^environment_drift$'):self.op.d.check_config(self.live,OLD['frontend_expected'](self.before))
    def test_every_os_environment_field_remains_required_at_consumption(self):
        for field in self.osenv:
            for kind in ('missing','changed'):
                values=dict(self.osenv)
                if kind=='missing':del values[field]
                else:values[field]='SYNTHETIC_CHANGED'
                self.write_env(values)
                with self.subTest(field=field,kind=kind),self.assertRaisesRegex(RuntimeError,'^environment_drift$'):self.check()
        self.write_env(self.osenv)
    def test_no_fallback_missing_duplicate_or_wrong_source(self):
        for profile in (None,{}, {'apps':[]},{'apps':self.profile['apps']*2}):
            with self.subTest(kind=type(profile).__name__),self.assertRaises(RuntimeError):fixed.frontend_expected(self.before,profile)
        wrong=copy.deepcopy(self.profile);wrong['apps'][0]['env']=dict(self.before['env'])
        with self.assertRaisesRegex(RuntimeError,'^environment_drift$'):self.check(wrong)
    def test_reference_paths_remain_bound(self):
        for field in ('cwd','script','interpreter'):
            profile=copy.deepcopy(self.profile);profile['apps'][0][field]='SYNTHETIC_OTHER'
            with self.subTest(field=field),self.assertRaisesRegex(RuntimeError,'^frontend_source_profile_paths$'):self.check(profile)
    def test_all_application_projection_fields_retained_separately(self):
        original=copy.deepcopy(self.live)
        for key in self.before['env']:
            for kind in ('missing','changed'):
                self.live=copy.deepcopy(original)
                if kind=='missing':del self.live['pm2_env']['env'][key]
                else:self.live['pm2_env']['env'][key]='SYNTHETIC_CHANGED'
                with self.subTest(field=key,kind=kind),self.assertRaisesRegex(RuntimeError,'^frontend_application_environment_drift$'):self.check()
        self.live=original
    def test_ten_live_fields_status_watch_cwd_exe_identity_remain_mandatory(self):
        original=copy.deepcopy(self.live)
        for field in fixed.LIVE_FIELDS:
            self.live=copy.deepcopy(original);del self.live['pm2_env'][field]
            with self.subTest(field=field),self.assertRaises(RuntimeError):self.check()
        self.live=copy.deepcopy(original);self.live['pm2_env']['status']='stopped'
        with self.assertRaisesRegex(RuntimeError,'^process_not_stable$'):self.check()
        self.live=original
        for name in ('cwd','exe'):
            path=self.root/'123'/name;target=path.readlink();path.unlink();path.symlink_to('/synthetic/other')
            with self.subTest(field=name),self.assertRaises(RuntimeError):self.check()
            path.unlink();path.symlink_to(target)
        (self.root/'123/stat').unlink()
        with self.assertRaisesRegex(RuntimeError,'^process_missing$'):self.check()
    def test_concurrent_change_between_config_calls_is_not_captured_away(self):
        self.check();self.write_env({**self.osenv,'OS_ONLY':'SYNTHETIC_CHANGED'})
        with self.assertRaisesRegex(RuntimeError,'^environment_drift$'):self.check()
    def test_saved_contract_unchanged_and_full_environment_preserved(self):
        current=copy.deepcopy(self.before);current['axm_monitor']={'metric':1}
        self.assertTrue(fixed.compare_saved(current,self.before)['environmentEqual'])
        current['env']['APP_SETTING']='SYNTHETIC_CHANGED'
        with self.assertRaisesRegex(RuntimeError,'^saved_contract_changed$'):fixed.compare_saved(current,self.before)

class Recorded(unittest.TestCase):
    def test_pinned_actual_observations_old_denies_correct_reference_passes(self):
        v=e.recorded();System,Operations=fixed.config_consumers(v['pathClass']);op=Operations();op.d=System()
        with self.assertRaisesRegex(RuntimeError,'^environment_drift$'):OLD['compare_frontend'](v['live'],v['before'],op)
        self.assertTrue(fixed.compare_frontend(v['live'],v['before'],op,v['profile'])['canonicalConfig'])
        with self.assertRaisesRegex(RuntimeError,'^unobserved_read_denied$'):v['pathClass']('/proc/999999/environ').read_text()
        # One observed environment read is replayed, never represented as two fresh reads.
    def test_only_two_contract_functions_changed(self):
        old=ast.parse((e.REVIEW/e.SOURCES['old_contract'][0]).read_bytes());new=ast.parse(Path(fixed.__file__).read_bytes())
        functions=lambda tree:{n.name:ast.dump(n,include_attributes=False)for n in tree.body if isinstance(n,ast.FunctionDef)}
        a,b=functions(old),functions(new)
        self.assertEqual(set(a),set(b));self.assertEqual({n for n in a if a[n]!=b[n]},{'frontend_expected','compare_frontend'})
        self.assertTrue(OLD['LIVE_FIELDS']==fixed.LIVE_FIELDS and OLD['OPS_SHA']==fixed.OPS_SHA)

if __name__=='__main__':
    result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromModule(__import__('__main__')))
    if result.wasSuccessful():
        p=Path(__file__).resolve().parent
        (p/'PROOFS.json').write_text(json.dumps({'result':'OFFLINE_RECONCILIATION_LOCAL_VALIDATED','tests':result.testsRun,'contractsSha256':e.sha((p/'contracts.py').read_bytes()),'testsSha256':e.sha(Path(__file__).read_bytes()),'evidenceLoaderSha256':e.sha((p/'evidence.py').read_bytes()),'realConsumers':'Pinned System.identity/check_config, Operations.config, original preservation capture and compare_saved','externalEffects':'None; /proc mapped to real synthetic files or exact recorded custody observations; no production execution','historicalPm2ProofReused':'preventive-api-frontend3227-prepared-20261010/verification-results.json pm2Environment','noNewOperationalPackage':True},indent=2)+'\n')
    raise SystemExit(0 if result.wasSuccessful()else 1)
