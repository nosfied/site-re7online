"""Fresh canonical exit/fence + DB exclusivity. No process/role mutation here."""
import hashlib,json,importlib.util,sys
from pathlib import Path

def coverage(b):
 folder=b.root/'switch';certificate=folder/'old-exit-confirmed.json'
 if not certificate.is_file()or certificate.is_symlink():raise RuntimeError('exit_certificate_missing')
 if set(b.apps())!={'re7-admin-front'}:raise RuntimeError('uncontained_pm2_writer')
 guard=b.guard()
 if guard['open']or guard['generation']!=38 or guard['tasks']or guard.get('ledgerFault'):raise RuntimeError('guard38_drift')
 b.privileged('check-present')
 sys.path.insert(0,str(folder));spec=importlib.util.spec_from_file_location('locked_scope_ops',folder/'ops.py');ops=importlib.util.module_from_spec(spec);spec.loader.exec_module(ops)
 owner=ops.System().db_zero()
 if owner!={'otherClientBackends':0,'advisoryLocks':0}:raise RuntimeError('writer_or_advisory_owner_uncontained')
 specfile=b.window/'writer-consumers.private.json';v=json.loads(specfile.read_text())
 if v.get('knownCipherWriters')!=['re7-whatsapp-agent','re7-whatsapp-web-worker']or v.get('unknownScheduledCipherWriters')!=[]:raise RuntimeError('writer_coverage_unknown')
 for e in v['immutable']:
  p=Path(e['path']);s=p.lstat()
  if p.is_symlink()or s.st_uid!=e['uid']or hashlib.sha256(p.read_bytes()).hexdigest()!=e['sha256']:raise RuntimeError('writer_source_reference_drift')
 proof={'allWritersExited':True,'dbOwnershipProven':True,'fenceActive':True,'approvedRenewal':True,'unknownWriters':[],'observationIncomplete':[],'guardGeneration':38,'authDb':'NEWauth+NEWDB','certificateHashes':{'exit':hashlib.sha256(certificate.read_bytes()).hexdigest(),'consumers':hashlib.sha256(specfile.read_bytes()).hexdigest()},'dbObservation':owner}
 from locked_plan import write_once
 write_once(b.window/'seal-current','coverage.private.json',proof)
 return proof
