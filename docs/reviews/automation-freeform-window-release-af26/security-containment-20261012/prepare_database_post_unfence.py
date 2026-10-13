"""Fresh canonical return after VERIFIED DB commit. No ALTER, no policy installation.
Adapts the existing 28-file generator to the current 29-file frozen inventory profile.
"""
from pathlib import Path
import hashlib,json,sys,types

def render(source):
 old="require(len(names) == 28 and {'privileged_output.py', 'ecosystem_contract.py', 'waiting-work.cjs'} <= set(names)"
 if source.count(old)!=1:raise RuntimeError('fresh_return_generator_source_drift')
 source=source.replace(old,"require(len(names) == 29 and {'privileged_output.py', 'ecosystem_contract.py', 'waiting-work.cjs', 'waiting-work-frozen.cjs'} <= set(names)")
 old="'recover-partial.py', 'restore-controls.py', 'waiting-work.cjs', 'start-one.py',"
 if source.count(old)!=1:raise RuntimeError('fresh_return_static_profile_drift')
 return source.replace(old,"'recover-partial.py', 'restore-controls.py', 'waiting-work.cjs', 'waiting-work-frozen.cjs', 'start-one.py',")

def main(original,destination):
 original=Path(original).resolve();w=original/'window';sys.path.insert(0,str(w))
 from credential_boundary import CredentialBoundary
 from credential_sequencer import DatabaseDriver
 m=json.loads((w/'sequencer-manifest.json').read_text())
 assert all(hashlib.sha256((w/n).read_bytes()).hexdigest()==h for n,h in m['filesSha256'].items())
 planfile=w/'credential-hook.private.json';plan=json.loads(planfile.read_text());boundary=CredentialBoundary(w,hashlib.sha256(planfile.read_bytes()).hexdigest());assert boundary.may_start_successor(),'fresh_return_requires_verified_database_receipt'
 source=json.loads((original/'switch/return.config.private.json').read_text());target=json.loads((original/'return/candidate.config.private.json').read_text());a=next(x['env']for x in source['apps']if x['name']=='re7-whatsapp-agent');b=next(x['env']for x in target['apps']if x['name']=='re7-whatsapp-agent')
 assert DatabaseDriver().classify(plan,a['DATABASE_URL'],b['DATABASE_URL'])=='VERIFIED'
 for name in ['re7-whatsapp-agent','re7-whatsapp-web-worker']:
  e=next(x['env']for x in target['apps']if x['name']==name);assert e['DATABASE_URL']==b['DATABASE_URL']
  for k in ['APP_AUTH_SECRET','ADMIN_TOKEN','WHATSAPP_WEB_WORKER_CONTROL_TOKEN']:assert e.get(k)==next(x['env']for x in source['apps']if x['name']==name).get(k)
 p=w/'prepare_post_unfence_return.py';s=render(p.read_text());module=types.ModuleType('fresh_database_return');module.__file__=str(p);sys.path.insert(0,str(w));exec(compile(s,str(p),'exec'),module.__dict__);module.main(str(original),str(destination))
 # Exact role/receipt evidence accompanies the fresh canonical policy, not a new SQL hook.
 d=Path(destination)/'window'
 for n in ['credential-hook.private.json','credential-commit.receipt.private.json','credential-commit.intent.private.json','consumer-activation.receipt.private.json']:
  out=d/('prior-'+n)
  with out.open('xb')as f:f.write((w/n).read_bytes())
  out.chmod(0o600)
 print('FRESH_DATABASE_RETURN_NEWDB_NEWAUTH_NO_ALTER_NO_INSTALL')
if __name__=='__main__':
 assert len(sys.argv)==3
 main(sys.argv[1],sys.argv[2])
