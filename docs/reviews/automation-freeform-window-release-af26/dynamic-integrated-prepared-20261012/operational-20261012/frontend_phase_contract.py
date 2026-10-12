"""Explicit API -> frontend baseline boundary. Never authorizes a process action.

Canonical frontend baseline slots may be renewed only in the NEW preparation,
with originals preserved and exact V4 completion/start certificates. No old36
preparation, policy, daemon binding or window capture is modified.
"""
import json

def require(ok,reason):
 if not ok:raise RuntimeError(reason)

def validate(before,after,complete,starts,expected,matches):
 require(complete.get('event')=='complete' and complete.get('mode')=='switch' and complete.get('guardGeneration')==38,'frontend_phase_api_not_complete')
 require(before['guard']==after['guard'] and after['guard']['open'] is False and after['guard']['generation']==38 and type(after['guard']['tasks'])is dict and not after['guard']['tasks'],'frontend_phase_guard_drift')
 for key in ['bootId','daemon','activeControl','activeRun','activeChild','activeManifestSha256','backupCronSha256','crontab','boot']:
  # State R/S is an execution state, not incarnation identity.
  b=before[key];a=after[key]
  if key=='daemon':b={k:v for k,v in b.items()if k!='state'};a={k:v for k,v in a.items()if k!='state'}
  require(b==a,'frontend_phase_preserved_drift:'+key)
 require(set(matches)=={'re7-whatsapp-agent','re7-whatsapp-web-worker','re7-admin-front'} and all(v is True for v in matches.values()),'frontend_phase_configuration_drift')
 names={'re7-whatsapp-agent','re7-whatsapp-web-worker','re7-admin-front'}
 require(len(after['runtime'])==3 and {a['name']for a in after['runtime']}==names,'frontend_phase_process_set')
 for name in ['re7-whatsapp-agent','re7-whatsapp-web-worker']:
  row=next(a for a in after['runtime']if a['name']==name);m=starts[name]
  require(type(m.get('pid'))is int and row['pid']==m['pid'] and type(m.get('identity'))is dict and m['identity'].get('state')not in ['Z','X','x',None] and str(m['identity']['ticks'])==str(row['startTicks']),'frontend_phase_start_certificate:'+name)
  require(row['pm2_env']['pm_cwd']==expected[name]['cwd'] and row['pm2_env']['pm_exec_path']==expected[name]['script'],'frontend_phase_target:'+name)
 b=next(a for a in before['runtime']if a['name']=='re7-admin-front');a=next(a for a in after['runtime']if a['name']=='re7-admin-front')
 require(a['pid']==b['pid'] and a['startTicks']==b['startTicks'],'frontend_phase_frontend_changed')
 require(type(after['saved'])is list and type(after['fallback'])is list and after['saved']==after['fallback'],'frontend_phase_saved_fallback')
 for name in names:
  rows=[a for a in after['saved']if a['name']==name];require(len(rows)==1,'frontend_phase_saved_process_set')
  require(rows[0]['pm_cwd']==expected[name]['cwd'] and rows[0]['pm_exec_path']==expected[name]['script'],'frontend_phase_saved_target:'+name)
 return True
