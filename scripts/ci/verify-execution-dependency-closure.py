#!/usr/bin/env python3
"""Deny incomplete or stale executable closure for the CRM release window."""
import argparse, hashlib, importlib.util, json, tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
PUBLIC=ROOT/'docs/saas/releases/CRM_CONTACTS_LIST_RECOVERY_2026-10-19_EXECUTION_CLOSURE.json'
OLD='/opt/re7online/backups/converta-persistent/preparations/frontend-contacts-list-f5028de1-canonical-20261019T225126Z'
NEW='/opt/re7online/backups/converta-persistent/preparations/crm-contacts-list-f5028de1-artifact-bound-20261019T234809Z'
REQUIRED={'apiVerifier','apiCandidateDefinition','apiReturnDefinition','frontendChecker','frontendCandidateControl','frontendCandidateDefinition','transactionalExecutor','selectPlan','rollbackPlan','permanentPolicy','returnControl','returnDefinition','frontendLauncher','socketObservationClient','socketObservationContract','permanentObserverHelper','permanentObservationClient','pythonInterpreter','nodeInterpreter','pm2Cli','apiCandidateEntrypoint','frontendCandidateEntrypoint'}

def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()

def validate(record, private=None):
 deps=record['staticDependencies']; roles=[x['role'] for x in deps]
 assert len(roles)==len(set(roles)) and set(roles)==REQUIRED, 'dependency_closure_roles'
 assert all(len(x['sha256'])==64 for x in deps), 'dependency_hash'
 assert all((not x['path'].startswith(OLD)) or x.get('oldRootJustification') in {'durableReturn','canonicalLauncher','canonicalReturnObservation'} for x in deps), 'old_root_unjustified'
 assert record['preparationRoot']==NEW and record['safeDumpSha256']=='a99667587ccee0ee884ed31aa304c714e276e86f6db86ba418238171508a2cf0'
 destinations=record['singleUseDestinations']; assert len({x['path'] for x in destinations})==len(destinations)
 assert all(x['initialState']=='ABSENT' for x in destinations)
 if private:
  private=Path(private)
  for dep in deps:
   if dep['path'].startswith('/'):
    if not dep['path'].startswith(NEW): continue
    p=private/Path(dep['path']).relative_to(NEW)
   else: p=private/dep['path']
   assert p.is_file() and not p.is_symlink() and sha(p)==dep['sha256'], 'private_hash:'+dep['role']
  checker=private/'frontend-check.py'; text=checker.read_text()
  assert "P = Path('"+NEW+"')" in text
  assert "RETURN_P = Path('"+OLD+"')" in text
  assert "return 'candidate-v2' if label == 'candidate' else label" in text
  assert "control_path(label)" in text and "config_path(label)" in text
  forbidden=['candidate.run.private.json','candidate.tracked.config.cjs','candidate.readiness.private.jsonl','candidate-tree.private.json']
  assert not any(("'"+x+"'") in text for x in forbidden), 'stale_candidate_binding'
 return {'dependencies':len(deps),'executables':sum(bool(x['executable']) for x in deps),'singleUseDestinations':len(destinations)}

def dry_run(private):
 checker=Path(private)/'frontend-check.py';spec=importlib.util.spec_from_file_location('artifact_checker',checker);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
 with tempfile.TemporaryDirectory(prefix='frontend-check-artifact-') as td:
  p=Path(td)/'new';r=Path(td)/'return';rel=Path(td)/'release';p.mkdir();r.mkdir();(rel/'.next').mkdir(parents=True)
  entry=rel/'next';entry.write_text('fixture');(rel/'.next/BUILD_ID').write_text('fixture-build');launcher=r/'launcher.cjs';launcher.write_text('launcher')
  nonce='n'*64;journal=p/'candidate-v2.startup.private.jsonl';control={'nonce':nonce,'release':str(rel),'entry':str(entry),'entrySha256':sha(entry),'buildId':'fixture-build','journal':str(journal),'preExisting':{}}
  (p/'candidate-v2.run.private.json').write_text(json.dumps(control));(p/'candidate-v2.tracked.config.cjs').write_text('module.exports = {};\n')
  journal.write_text('\n'.join(json.dumps(x) for x in ({'event':'parent','nonce':nonce,'pid':101,'ticks':'1001','group':101},{'event':'application_identity','nonce':nonce,'pid':102,'ticks':'1002','group':101},{'event':'application_released','nonce':nonce}))+'\n')
  (p/'runtime.private.json').write_text('{"processes":[]}');(p/'daemon.private.json').write_text('{"pid":100,"ticks":"1000"}');pidfile=p/'pm2.pid';pidfile.write_text('100')
  row={'name':m.FRONT,'pid':101,'pm2_env':{'status':'online','pm_cwd':str(rel),'pm_exec_path':str(launcher),'restart_time':0,'watch':False,'RE7_FRONT_RUN':nonce}}
  m.P=p;m.RETURN_P=r;m.LAUNCHER=launcher;m.TARGET=str(rel);m.PM_PID=pidfile;m.rows=lambda timeout=3:[row]
  m.proc=lambda pid,require_alive=True:{'pid':pid,'ticks':{100:'1000',101:'1001',102:'1002'}[pid],'parent':0,'state':'S','group':101}
  assert m.tracked_live('candidate')[0]==control
  assert m.control_path('return')==r/'return.run.private.json'
  dependency=Path(private).parent/'evidence/canonical-dependencies/permanent_observation_client.py'
  m.PERMANENT_CLIENT=dependency
  module=m.load_bound_module('frontend_permanent_client_fixture',dependency,'34dae9ac861aeb89c6787871a27dd244ca931ca1038163423efd9af2996cb374')
  assert callable(module.read)
 return 'FRONTEND_CHECKER_ARTIFACT_BOUND_DRY_RUN_PASS'

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--manifest',type=Path,default=PUBLIC);ap.add_argument('--private-root',type=Path);a=ap.parse_args();record=json.loads(a.manifest.read_text());result=validate(record,a.private_root)
 if a.private_root: result['dryRun']=dry_run(a.private_root)
 result.update(result='EXECUTION_DEPENDENCY_CLOSURE_PASS',pm2RealInvocations=0)
 print(json.dumps(result,sort_keys=True))
if __name__=='__main__':main()
