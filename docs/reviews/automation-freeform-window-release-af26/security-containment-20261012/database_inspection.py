"""Explicit inspection after uncertain DB commit. No SQL alteration or replay.
Receipt recording and canonical return require a separate explicit operator action.
"""
import argparse,fcntl,hashlib,json,sys
from pathlib import Path
from credential_sequencer import DatabaseDriver,adapter,verify_database_result

def main():
 a=argparse.ArgumentParser();a.add_argument('root');a.add_argument('--action',choices=['inspect','record-verified','record-original','recover-verified','recover-original'],default='inspect');a.add_argument('--future-owner-authorized-recovery',action='store_true');args=a.parse_args()
 root=Path(args.root).resolve();sys.path.insert(0,str(root/'window'));import sequencer
 with (root.parent/'.incident-6683-window.lock').open('a+')as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  if args.action!='inspect'and not args.future_owner_authorized_recovery:raise RuntimeError('explicit_operator_recovery_decision_required')
  s=adapter(sequencer,allow_observed_original_return=args.action=='recover-original')(sequencer.Bridge(root));s.load_plan(require_original=False)
  m=json.loads((root/'window/sequencer-manifest.json').read_text())
  assert all(hashlib.sha256((root/'window'/n).read_bytes()).hexdigest()==h for n,h in m['filesSha256'].items())
  driver=DatabaseDriver();classification=driver.classify(s.plan,s.old_url,s.new_url)
  s.b.privileged('check-present');guard=s.b.guard();assert not guard['open']and guard['generation']==38 and not guard['tasks']
  if args.action=='record-verified':s.boundary.record_verified_observation(lambda:verify_database_result(s.plan,s.old_url,s.new_url,driver))
  elif args.action=='record-original':s.boundary.record_original_observation(lambda:driver.classify(s.plan,s.old_url,s.new_url))
  elif args.action.startswith('recover-'):
   if args.action=='recover-verified':assert classification=='VERIFIED'and s.boundary.may_start_successor()
   else:assert classification=='ORIGINAL_VERIFIED'and s.boundary.may_start_original_return()
   s.baseline=sequencer.sequential(json.loads((root/'window/credential-source-baseline.private.json').read_text()))
   s.recover() # Canonical exit/identity/ownership/start markers; no ALTER path.
  print(json.dumps({'result':classification,'action':args.action,'automaticRetry':False,'sqlReplay':False,'guardRemainsClosed':True}))
if __name__=='__main__':main()
