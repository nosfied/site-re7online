import importlib.util,sys,json
from pathlib import Path
H=Path(__file__).resolve().parent;R=H.parents[3];p=R/'local-evidence/crm-csv-staging-20261016/incident-6683-v4-csv-staged-v2-20261016T094000Z';sys.path[:0]=[str(p/'window'),str(p/'switch')]
from sequencer import Bridge
base=Path('/opt/re7online/backups/converta-persistent/preparations')
assert Bridge(base/p.name).root==base/p.name
try:Bridge(base/'incident-csv-window-staged-20261016T092610Z');raise AssertionError('wrong prefix accepted')
except RuntimeError as e:assert str(e)=='preparation_path_denied'
print(json.dumps({'result':'ACTUAL_BRIDGE_CANONICAL_NAME_PASS','cases':2,'productionEffects':False}))
