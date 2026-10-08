"""Actual patched sequencer/Bridge; HTTP, PM2 and OS effects are simulated."""
import hashlib,importlib.util,io,json,pathlib,subprocess,sys,tempfile,unittest
from unittest.mock import patch
BASE=pathlib.Path(__file__).resolve().parents[1]/'v4-sequencer'
sys.path.insert(0,str(BASE))
from test_sequencer import FakeBridge
from baseline_contract import capture_operational
ROOT=pathlib.Path(__file__).resolve().parent
TEMP=tempfile.TemporaryDirectory();d=pathlib.Path(TEMP.name);(d/'window').mkdir()
source=BASE/'sequencer.py';m=json.loads((ROOT/'closed-guard-v4-manifest.json').read_text())
assert hashlib.sha256(source.read_bytes()).hexdigest()==m['originSha256']
(d/'window/sequencer.py').write_bytes(source.read_bytes())
subprocess.run(['patch','-p1','-i',str(ROOT/'closed-guard-v4.patch')],cwd=d,check=True,stdout=subprocess.DEVNULL)
assert hashlib.sha256((d/'window/sequencer.py').read_bytes()).hexdigest()==m['resultSha256']
spec=importlib.util.spec_from_file_location('closed_sequencer',d/'window/sequencer.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class ClosedBridge(FakeBridge):
 def __init__(self,root):
  super().__init__(root);self.g['open']=False
  (self.window/'initial.private.json').write_text(json.dumps(capture_operational(self.guard,lambda _: 'ActiveState=inactive\nUnitFileState=enabled\n')))
 def node(self,mode,script):
  if script in ('close.cjs','open.cjs'):
   self.events.append(('node',mode,script));assert not self.g['open']
   if script=='close.cjs':(self.root/mode/'drain-result.json').write_text(json.dumps({'initiallyClosed':True,'generation':self.g['generation']}))
   return ''
  return super().node(mode,script)
 def protocol(self,mode,action):
  if action=='preflight':
   self.events.append(('protocol',mode,action,self.g['generation']));assert not self.g['open'] and self.g['generation']==13;return
  return super().protocol(mode,action)
 def restore_guard(self,config_file):
  cfg=self.expected_config(*config_file);cfg[module.API]['env']['ADMIN_TOKEN']='synthetic'
  response={'available':True,'ledgerFault':None,'tasks':[],'drained':True,'open':self.g['open'],'generation':self.g['generation']}
  with patch.object(self,'expected_config',return_value=cfg),patch.object(module.request,'urlopen',return_value=io.BytesIO(json.dumps(response).encode())):
   return module.Bridge.restore_guard(self,config_file)
class Tests(unittest.TestCase):
 def test_closed_switch_keeps_generation_and_closed(self):
  with tempfile.TemporaryDirectory() as root:
   b=ClosedBridge(root);module.Sequencer(b).run()
   self.assertFalse(b.g['open']);self.assertEqual(b.g['generation'],13)
   events=b.events;close=events.index(('node','switch','close.cjs'));proof=next(i for i,x in enumerate(events) if x[:3]==('protocol','switch','preflight'))
   self.assertLess(close,proof);self.assertEqual(events[proof][3],13)
 def test_partial_return_keeps_closed(self):
  with tempfile.TemporaryDirectory() as root:
   b=ClosedBridge(root);b.fail_action='start:'+module.WORKER
   with self.assertRaises(Exception):module.Sequencer(b).run()
   self.assertFalse(b.g['open']);self.assertEqual(b.live[module.API]['cfg'],b.old[module.API]);self.assertEqual(b.live[module.WORKER]['cfg'],b.old[module.WORKER])
 def test_open_source_retains_old_contract(self):
  with tempfile.TemporaryDirectory() as root:
   b=FakeBridge(root);module.Sequencer(b).run();self.assertTrue(b.g['open']);self.assertEqual(b.g['generation'],15)
 def test_actual_bridge_abort_never_opens_closed_source(self):
  with tempfile.TemporaryDirectory() as root:
   with patch.object(module,'PREPARATIONS',pathlib.Path(root)):
    bridge=module.Bridge(pathlib.Path(root)/'incident-6683-v4-test')
   bridge.expected_config=lambda *_:{module.API:{'env':{'ADMIN_TOKEN':'synthetic'}}}
   responses=[]
   def get(req,timeout):
    responses.append(req.get_method());return io.BytesIO(json.dumps({'available':True,'ledgerFault':None,'tasks':[],'drained':True,'open':False,'generation':35}).encode())
   with patch.object(module,'validate_preparation',return_value={'guard':{'open':False}}),patch.object(module.request,'urlopen',side_effect=get):
    self.assertFalse(bridge.restore_guard(('switch','return.config.private.json'))['open'])
   self.assertEqual(responses,['GET'])
if __name__=='__main__':unittest.main()
