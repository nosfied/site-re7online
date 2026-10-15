"""Approved renewal phase. Full CAS in one fenced/attributed DB connection.
Never updates refused input; intent prevents another invocation after any result.
"""
import copy,datetime,hashlib,json,os,signal,time
from pathlib import Path
from locked_plan import scope_check as previous_scope,LOCK_SQL,READ_SQL,private_directory,write_once,digest

def timestamp_view(v):
 value=copy.deepcopy(v)
 for group in ('rows','accounts'):
  for row in value[group]:
   for field in ('createdAt','updatedAt'):
    if field in row:
     stamp=datetime.datetime.fromisoformat(row[field].replace('Z','+00:00'))
     if stamp.tzinfo is None:stamp=stamp.replace(tzinfo=datetime.timezone.utc)
     row[field]=stamp.astimezone(datetime.timezone.utc).isoformat(timespec='microseconds')
 return value

def scope_check(approved,current):
 # Compare timestamp INSTANTS with full microsecond precision, not transport formatting.
 # Source/plan bytes are not edited; SQL CAS still compares complete original records.
 approved=timestamp_view(approved);current=timestamp_view(current)
 previous_scope(approved,current)
 old={r['id']:r for r in approved['rows']}
 for row in current['rows']:
  # The approved renewal applies only to Baileys, not other token families.
  if row['secretKind']!='baileysAuthState.v1' and row!=old[row['id']]:raise RuntimeError('non_baileys_source_drift')
 return True

def run(query,approved,proof,out,phase_id,make_plan,render_body,budget=30):
 p=private_directory(out)
 if budget<=0 or budget>30:raise RuntimeError('deadline_budget_denied')
 if any(os.path.lexists(p/n)for n in ['source.private.json','plan.private.json','intent.private.json','outcome.private.json']):raise RuntimeError('seal_phase_consumed_inspect_only')
 for k in ('allWritersExited','dbOwnershipProven','fenceActive','approvedRenewal'):
  if proof.get(k)is not True:raise RuntimeError('writer_exit_or_authorization_missing')
 if proof.get('unknownWriters') or proof.get('observationIncomplete') or proof.get('guardGeneration')!=38 or proof.get('authDb')!='NEWauth+NEWDB':raise RuntimeError('writer_coverage_denied')
 if not proof.get('certificateHashes') or not phase_id or '/'in phase_id:raise RuntimeError('phase_provenance_incomplete')
 start=time.monotonic();commit_issued=False;intent=False;prior=signal.getsignal(signal.SIGALRM)
 def deadline(*_):raise TimeoutError('locked_phase_deadline')
 signal.signal(signal.SIGALRM,deadline);signal.setitimer(signal.ITIMER_REAL,budget)
 try:
  query(LOCK_SQL);current=json.loads(query(READ_SQL));scope_check(approved,current)
  source=write_once(p,'source.private.json',current);plan=make_plan(current);h=write_once(p,'plan.private.json',plan)
  if len(plan['changes'])!=10 or len(plan['retained'])!=1 or plan['inventoryCount']!=11:raise RuntimeError('final_plan_population_drift')
  write_once(p,'intent.private.json',{'phaseId':phase_id,'scopeHash':digest(approved),'sourceHash':source,'planHash':h,'proofHash':digest(proof),'automaticReplay':False});intent=True
  query(render_body(plan,h));commit_issued=True;query('COMMIT;')
  write_once(p,'outcome.private.json',{'state':'COMMIT_RESPONSE_OBSERVED_VERIFY_REQUIRED','planHash':h,'elapsedSeconds':time.monotonic()-start})
  return plan,h
 except BaseException:
  state='COMMIT_UNCERTAIN'if commit_issued else'PRECOMMIT_DENY'
  if not commit_issued:
   try:query('ROLLBACK;')
   except BaseException:state='ROLLBACK_UNCERTAIN'
  # Original return is NOT authorized by this diagnostic. Classification required.
  if not os.path.lexists(p/'outcome.private.json'):write_once(p,'outcome.private.json',{'state':state,'intentWritten':intent,'replayAuthorized':False})
  raise RuntimeError(state+'_INSPECT_ONLY')from None
 finally:signal.setitimer(signal.ITIMER_REAL,0);signal.signal(signal.SIGALRM,prior)
