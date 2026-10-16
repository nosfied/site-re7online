"""Canonical delegated consumer with separately sealed .data binding location.
The consumed generation is unchanged; all Operations predicates remain in force.
"""
import hashlib,json,os,sys
from pathlib import Path
P=Path('/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-csv-staged-v2-20261016T094000Z')
Q=P.parent/'csv-original-recovery-20261016T111200Z'
MODE='return-before-commit'
def configure():
 sys.path[:0]=[str(P/'window'),str(P/MODE)]
 import ops
 if getattr(ops.System,'original_recovery_binding_adapter',False):return
 original=ops.System.validate_bindings
 def validate(self,window,config):
  ops.require(Path(window)==P/'window','unexpected_binding_window')
  for n,h in [('data-contract.private.json','af63ea83a4b43309da14a6764f3ab48d340231877562c3652e1327a9496975f6'),('path-bindings.private.json','6f2258f4ddbfbd4c474538906323d78d279310c6e5b86b9142d46b265ff37f23')]:
   ops.require(hashlib.sha256((Q/n).read_bytes()).hexdigest()==h,'recovery_data_contract_drift')
  c=json.loads((Q/'data-contract.private.json').read_text())
  ops.require(hashlib.sha256((P/'window/source.profile.private.json').read_bytes()).hexdigest()==c['sourceProfileSha256'],'data_source_profile_drift')
  ops.require(json.loads((Q/'path-bindings.private.json').read_text())==c['bindings'],'data_binding_map_drift')
  for f in c['absent']:ops.require(not os.path.lexists(f),'previously_absent_data_path_changed')
  original(self,Q,config)
 ops.System.validate_bindings=validate
 ops.System.original_recovery_binding_adapter=True
if __name__=='__main__':
 os.umask(0o077);configure();import delegated
 args=sys.argv[1:]
 delegated.ops.require(len(args) in (3,4)and args[0]in ('request','record','execute')and args[2]==str(P/MODE),'original_dispatch_only')
 delegated.ops.require(args[1]in ('recover-partial','start:re7-whatsapp-agent','start:re7-whatsapp-web-worker','unfence','verify-unfenced','restore-controls'),'recovery_action_only')
 with delegated.operation_lock(P/MODE):delegated.main()
