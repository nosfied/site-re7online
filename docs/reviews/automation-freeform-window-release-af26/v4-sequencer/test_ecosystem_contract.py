import copy,json,tempfile,unittest
from pathlib import Path
from ecosystem_contract import source,rendered,generate_mode,validate_all

class ContractTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        self.value={'apps':[{'name':n,'cwd':'/synthetic/'+n,'script':'/synthetic/'+n+'/index.js','watch':False,'env':{'VALUE':'synthetic'},'autorestart':False,'instances':1} for n in ('re7-whatsapp-agent','re7-whatsapp-web-worker','re7-admin-front')]}
        for mode in ('switch','return','return-partial'):
            d=self.root/mode;d.mkdir()
            for variant in ('candidate','return'):(d/(variant+'.config.private.json')).write_text(json.dumps(self.value))
            generate_mode(d)
    def tearDown(self):self.tmp.cleanup()
    def test_all_six_files_pass(self):validate_all(self.root)
    def test_every_field_drift_denies(self):
        for mode in ('switch','return','return-partial'):
            for variant in ('candidate','return'):
                p=self.root/mode/(variant+'.ecosystem.config.cjs');good=p.read_bytes()
                for field,value in [('cwd','/wrong'),('script','/wrong.js'),('env',{'VALUE':'wrong'}),('autorestart',True),('instances',2)]:
                    bad=copy.deepcopy(self.value);bad['apps'][0][field]=value;p.write_bytes(rendered(bad))
                    with self.assertRaisesRegex(RuntimeError,'ecosystem_json_drift'):validate_all(self.root)
                    p.write_bytes(good)
    def test_extra_executable_code_denied(self):
        p=self.root/'switch/candidate.ecosystem.config.cjs';p.write_bytes(p.read_bytes()+b'process.exit(0);')
        with self.assertRaisesRegex(RuntimeError,'ecosystem_json_drift'):validate_all(self.root)
    def test_symlink_denied(self):
        p=self.root/'return/return.ecosystem.config.cjs';raw=p.read_bytes();p.unlink();q=self.root/'foreign';q.write_bytes(raw);p.symlink_to(q)
        with self.assertRaisesRegex(RuntimeError,'ecosystem_missing_or_symlink'):validate_all(self.root)
    def test_duplicate_json_key_denied(self):
        p=self.root/'switch/candidate.config.private.json';p.write_text('{"apps":[],"apps":[]}')
        with self.assertRaisesRegex(RuntimeError,'ecosystem_duplicate_json_key'):source(p)
    def test_generator_never_overwrites(self):
        with self.assertRaises(FileExistsError):generate_mode(self.root/'switch')
if __name__=='__main__':unittest.main()
