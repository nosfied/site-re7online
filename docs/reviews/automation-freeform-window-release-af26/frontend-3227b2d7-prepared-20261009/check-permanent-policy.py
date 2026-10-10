"""Fresh permanent read for the live new control, no install/start/promotion."""
import importlib.util,json,sys
from pathlib import Path
P=Path('/opt/re7online/backups/converta-persistent/preparations/frontend-3227b2d7-20261009T220400Z')
sys.path.insert(0,str(P));import permanent_observation_client
s=importlib.util.spec_from_file_location('g',P/'frontend-check.py');g=importlib.util.module_from_spec(s);s.loader.exec_module(g)
front=[r for r in g.rows() if r['name']==g.FRONT];assert len(front)==1
control=Path(front[0]['pm2_env']['RE7_FRONT_CONTROL'])
assert control in [P/'candidate.run.private.json',P/'return.run.private.json'],'unexpected_control'
run=json.loads(control.read_text());value=permanent_observation_client.read(P,run)
assert len(value['samples'])==2
print('PERMANENT_POLICY_LIVE_READ_PASS_NO_PROMOTION')
