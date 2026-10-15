"""Verify inactive local assembly without substituting production captures or bindings."""
import ast,hashlib,json,os,stat,subprocess,sys
from pathlib import Path
P=Path(sys.argv[1]);S=Path(sys.argv[2]);W=P/'window';sys.path.insert(0,str(W))
from ecosystem_contract import validate_all
from locked_v4 import verify_configs
class LocalFiles:
 def expected_config(self,m,n):return {a['name']:a for a in json.loads((P/m/n).read_text())['apps']}
validate_all(P,('switch','return','return-partial','return-before-commit'));verify_configs(LocalFiles())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
for n,h in json.loads((W/'sequencer-manifest.json').read_text())['filesSha256'].items():
 p=W/n;s=p.lstat();assert p.parent==W and stat.S_ISREG(s.st_mode)and s.st_nlink==1 and s.st_uid==os.getuid()and stat.S_IMODE(s.st_mode)==0o600 and sha(p)==h
 if n.endswith('.py'):ast.parse(p.read_text())
mm=json.loads((W/'mode-manifest-v4.json').read_text())
for m,h in mm['modeManifests'].items():
 assert sha(P/m/'scripts.sha256')==h
 for n,h in mm['modeFiles'][m].items():assert sha(P/m/n)==h
 subprocess.run(['sha256sum','--status','-c','scripts.sha256'],cwd=P/m,check=True)
assert sha(W/'historical-population.private.json')=='95eda044e469fe458d07fbdf5ec416aea7861873550f7db2ec1c7f0127d43d62'
for name in ('runtime-inventory.private.json',):assert (P/name).read_bytes()==(S/name).read_bytes()
for name in ('source.config.private.json','approved-scope.private.json','historical-population.private.json','writer-consumers.private.json','backup-manifest.private.json','restore-result.json','locked_driver.py','locked_v4.py','locked_phase.py','cipher_start_gate.py','credential_boundary.py'):
 assert (W/name).read_bytes()==(S/'window'/name).read_bytes(),name+'_unaffected_bytes_drift'
assert (P/'execution-authorized').read_text().strip()=='false' and all(x is False for x in json.loads((W/'execution-gates.private.json').read_text()).values())
assert not any((W/'seal-current').iterdir()) and not (W/'recovery.intent.private.json').exists()
subprocess.run(['bash','-n',str(P/'install-api-window-policy.sh')],check=True)
subprocess.run(['sha256sum','--status','-c','preparation-review.sha256'],cwd=P,check=True)
print(json.dumps({'result':'LOCAL_FOUR_MODE_RECOVERY_PACKAGE_PASS','generation':P.name,'sourceGenerationPreserved':True,'runtimeGrantScopeSnapshotRestoreUnchanged':True,'fiveGatesFalse':True,'productionConnections':0,'productionFilesWritten':False,'newPolicyInstalled':False}))
