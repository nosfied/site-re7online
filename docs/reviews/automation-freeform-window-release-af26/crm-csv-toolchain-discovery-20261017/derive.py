import ast,hashlib,json
from pathlib import Path
root=next(p for p in Path(__file__).resolve().parents if (p/'.git').exists());review=root/'docs/reviews/automation-freeform-window-release-af26';p=review/'crm-csv-toolchain-discovery-20261017';old=review/'crm-csv-three-gaps-executable-20261017'
h=lambda b:hashlib.sha256(b).hexdigest()
# Recorded inputs are versioned sources; derivations are explicit replacements only.
transforms={}
for name in ('launch.py','driver.py'):
 raw=(old/name).read_bytes();text=raw.decode()
 swaps=[('crm-csv-three-gaps-executable-20261017','crm-csv-toolchain-discovery-20261017'),('re7-csv-three-gaps-material-20261017-v1','re7-csv-toolchain-material-20261017-v1'),('re7-csv-three-gaps-executable-tools-20261017-v1','re7-csv-toolchain-tools-20261017-v1'),('re7-csv-three-gaps-executable-read-20261017-v1','re7-csv-toolchain-read-20261017-v1'),('csv-three-gaps-executable-20261017-v1','csv-toolchain-discovery-20261017-v1'),('csv-three-gaps-launcher-20261017-v1-','csv-toolchain-launcher-20261017-v1-'),('THREE_GAPS_','TOOLCHAIN_DISCOVERY_')]
 for a,b in swaps:text=text.replace(a,b)
 if name=='launch.py':text=text.replace("('materialize','collect','select-owner-authorized')","('materialize','collect')")
 else:
  text=text.replace("    if action=='select-owner-authorized':return transport('select')\n",'')
  text=text.replace("def remote(action):\n","def remote(action):\n    if action!='collect':raise RuntimeError('discovery_collect_only')\n")
  # Delete unused SELECT authorization branch; no reserved SQL path in new CLI.
  a=text.index("        if action=='select':");b=text.index("        cmd=",a);text=text[:a]+text[b:]
 (p/name).write_text(text)
 transforms[name]={'source':str((old/name).relative_to(root)),'sha256':h(raw),'replacements':swaps,'restriction':'collect/materialize only; no SELECT entry'}
raw=(old/'runner.py').read_bytes();tree=ast.parse(raw)
nodes=[n for n in tree.body if isinstance(n,(ast.FunctionDef,ast.ClassDef)) and n.name in ('load','Capture')]
snippet='import base64,json,subprocess\n'+''.join(ast.get_source_segment(raw.decode(),n)+'\n\n' for n in nodes)
(p/'capture.source').write_text(snippet.rstrip()+'\n')
transforms['capture.source']={'source':str((old/'runner.py').relative_to(root)),'sha256':h(raw),'extraction':['load','Capture'],'method':'exact AST source segments, standard imports only'}
(p/'PROVENANCE.json').write_text(json.dumps({'base':'6e93e40902cde2f5cb43bf210a8dc2389c75411e','derivations':transforms,'unchanged':['canonical read_package.py','privileged_output.source'],'historicalEvidence':'R2 directed Node d016 and PM2 bbb586; no historical PID reused as current'},indent=2)+'\n')
