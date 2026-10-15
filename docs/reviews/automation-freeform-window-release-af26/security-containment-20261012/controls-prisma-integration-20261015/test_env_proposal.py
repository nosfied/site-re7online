"""Concrete sealed profile and privately captured dotenv; no runtime import or SQL."""
import contextlib,hashlib,io,json,tempfile
from pathlib import Path
from propose_env import main
E=Path('local-evidence/controls-prisma-integration-20261015')
original=E/'re7-prisma-policy-readonly-20261015T130000Z/source-.env.private'
profile=E/'engineering-composition/incident-6683-v4-security-cipher-restore-v13-20261015T100500Z/switch/return.config.private.json'
h=hashlib.sha256(profile.read_bytes()).hexdigest();before=original.read_bytes()
with tempfile.TemporaryDirectory()as tmp:
 out=Path(tmp)/'proposal'
 try:main(original,profile,'0'*64,out);raise AssertionError('bad hash accepted')
 except RuntimeError as ex:assert str(ex)=='sealed_profile_hash_drift'and not out.exists()
 with contextlib.redirect_stdout(io.StringIO()):main(original,profile,h,out)
 for name,selected in [('auth-only',{'ADMIN_TOKEN','APP_AUTH_SECRET','WHATSAPP_WEB_WORKER_CONTROL_TOKEN'}),('database-only',{'DATABASE_URL'})]:
  after=(out/(name+'.env.private')).read_bytes();a=before.splitlines(True);b=after.splitlines(True);assert len(a)==len(b)
  changed=[]
  for old,new in zip(a,b):
   if old!=new:changed.append(new.split(b'=',1)[0].decode())
  assert set(changed)==selected
 assert original.read_bytes()==before
 try:main(original,profile,h,out);raise AssertionError('overwrite accepted')
 except RuntimeError as ex:assert str(ex)=='new_private_destination_required'
print(json.dumps({'result':'SELECTIVE_ENV_PROPOSAL_LOCAL_PASS','cases':4,'originalUnchanged':True,'applyAuthorized':False,'secretsPrinted':False}))
