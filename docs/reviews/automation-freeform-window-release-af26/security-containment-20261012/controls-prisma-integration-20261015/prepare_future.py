"""Integrate scheduled controls into a COMPLETE LOCAL engineering composition.

Never transfers, installs, rebuilds runtime, renews backup, or authorizes a window.
Original intended namespace/proofs are retained as historical test inputs. CLI
admission is ineligible until a separately reviewed future producer supplies an
authorization; this composition must never overwrite the v13 on the VPS.
"""
import hashlib,importlib.util,json,os,re,shutil,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
MODES=('switch','return','return-partial','return-before-commit')
SOURCE_POLICY='15b91a2a41708a1ef0ee8a499fd51f892298561d0d73dbbfb05ceb3fe285899f'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def write(p,v):p.write_text(json.dumps(v,sort_keys=True,separators=(',',':'))+'\n');p.chmod(0o600)
def once(s,a,b):
 if s.count(a)!=1:raise RuntimeError('future_integration_source_diverged')
 return s.replace(a,b,1)
def manifests(p):
 w=p/'window';names=json.loads((w/'mode-names.private.json').read_text())
 if set(names)!=set(MODES):raise RuntimeError('four_modes_required')
 for m in MODES:
  (p/m/'scripts.sha256').write_text(''.join(sha(p/m/n)+'  '+n+'\n'for n in names[m]))
 write(w/'mode-manifest-v4.json',{'modeFiles':{m:{n:sha(p/m/n)for n in names[m]}for m in MODES},'modeManifests':{m:sha(p/m/'scripts.sha256')for m in MODES}})
 wm=json.loads((w/'sequencer-manifest.json').read_text());wm['filesSha256']={n:sha(w/n)for n in wm['filesSha256']}
 wm['filesSha256']['scheduled_controls.py']=sha(w/'scheduled_controls.py');write(w/'sequencer-manifest.json',wm)
 rows=[]
 for line in(p/'preparation-review.sha256').read_text().splitlines():
  _,name=line.split('  ',1);rows.append(sha(p/name)+'  '+name+'\n')
 (p/'preparation-review.sha256').write_text(''.join(rows))
def verify_files(p):
 p=Path(p);w=p/'window';names=json.loads((w/'mode-names.private.json').read_text());mm=json.loads((w/'mode-manifest-v4.json').read_text())
 if not(set(names)==set(mm['modeFiles'])==set(mm['modeManifests'])==set(MODES)):raise RuntimeError('mode_population_invalid')
 for m in MODES:
  if set(names[m])!=set(mm['modeFiles'][m]):raise RuntimeError('mode_coverage_invalid')
  for line in(p/m/'scripts.sha256').read_text().splitlines():
   h,n=line.split('  ',1)
   if Path(n).name!=n or sha(p/m/n)!=h or mm['modeFiles'][m][n]!=h:raise RuntimeError('mode_hash_drift')
  if sha(p/m/'scripts.sha256')!=mm['modeManifests'][m]:raise RuntimeError('mode_manifest_drift')
 for n,h in json.loads((w/'sequencer-manifest.json').read_text())['filesSha256'].items():
  if Path(n).name!=n or sha(w/n)!=h:raise RuntimeError('window_manifest_drift')
 for line in(p/'preparation-review.sha256').read_text().splitlines():
  h,n=line.split('  ',1)
  if sha(p/n)!=h:raise RuntimeError('review_manifest_drift')
 return {'fourModes':4,'sharedControlsInWindowManifest':True}
def prepare(source,out,recovery_receipt):
 source=Path(source).resolve();out=Path(out).resolve()
 if out.exists()or out==source:raise RuntimeError('new_output_required')
 verify_files(source)
 r=json.loads(Path(recovery_receipt).read_text())
 if r['result']!='RESTRICTED_DEPLOY_CRON_RESTORED' or r['restoredEntries']!=6:raise RuntimeError('consumed_recovery_receipt_required')
 spec=importlib.util.spec_from_file_location('reviewed_delta',HERE.parent/'scheduled-controls-20261015/future_revision.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
 delta=module.changes(source);os.umask(0o077);shutil.copytree(source,out,ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
 for f in out.rglob('*'):
  if f.is_symlink():raise RuntimeError('composition_symlink_denied')
  f.chmod(0o700 if f.is_dir()else 0o600)
 original={str(f.relative_to(source)):sha(f)for f in source.rglob('*')if f.is_file()and '__pycache__'not in f.parts}
 for n,raw in delta.items():
  f=out/n;f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(raw);f.chmod(0o600)
 # Real admission invokes the shared cron predicate itself, in addition to requiring
 # the live chain's new gate. No stale v13 authorization or hardcoded old review hash.
 f=out/'conductor/admit_gates.py';s=f.read_text()
 s=once(s,"def main(p,inputs,output,decision):\n", "APPROVAL_COMMIT=None  # future explicit authorization, absent in this engineering composition\ndef main(p,inputs,output,decision):\n assert type(APPROVAL_COMMIT)is str and len(APPROVAL_COMMIT)==40,'future_window_authorization_absent'\n")
 s=s.replace('--owner-authorized-v13','--owner-authorized-future-controls').replace("'approvedCommit':'9db555431999df4a0345c6d7b85f6a9472251f8c'","'approvedCommit':APPROVAL_COMMIT")
 s=once(s,"  root=root_check(p,i/'root.private.json',i/'root-baseline.private.json')", "  from scheduled_controls import ScheduledControls\n  cron=ScheduledControls(p/'window',lambda args,text=None: b_run(args,text)).verify('before')\n  root=root_check(p,i/'root.private.json',i/'root-baseline.private.json')")
 s=once(s,'def sha(p):',"def b_run(args,text=None):\n return subprocess.check_output(args,input=text,text=True,stderr=subprocess.PIPE,timeout=10)\ndef sha(p):")
 f.write_text(s)
 # New root checker uses exact installed cron BODY plus independently observed
 # canonical before files. Only the three strictly identified generated spool
 # header lines may vary; functional comments and all job bytes remain sealed.
 f=out/'conductor/check_root_capture.py';s=(HERE.parent/'cipher-v13-execution-20261015/check_root_capture.py').read_text()
 s=s.replace("SOURCE='b6a58431c989a36eebdfa9e443118a7e15fbe0229d102cd896f91d3d193f818d'","SOURCE="+repr(SOURCE_POLICY))
 s=s.replace('FRESH_ROOT_WRITER_REFERENCES_SOURCE_B6_PASS','FRESH_ROOT_WRITER_REFERENCES_SOURCE_15B_PASS')
 s=once(s," assert {x['path']:x['sha256']for x in r['cron']}=={x['path']:x['sha256']for x in old['cron']},'scheduled_writer_sources_changed'", " from cron_root_contract import verify_cron_capture\n verify_cron_capture(p,r['cron'],old['cron'])")
 f.write_text(s);shutil.copyfile(HERE/'cron_root_contract.py',out/'conductor/cron_root_contract.py')
 manifests(out);s=(out/'conductor/admit_gates.py').read_text();s=re.sub(r"(?m)^REVIEW='[0-9a-f]{64}'$","REVIEW="+repr(sha(out/'preparation-review.sha256')),s);(out/'conductor/admit_gates.py').write_text(s)
 # Root verifier, conductor and review hash are sealed together outside the
 # historical package manifest to avoid a self-referential REVIEW hash.
 classification={'state':'LOCAL_ENGINEERING_COMPOSITION_NOT_WINDOW_READY','sourceGeneration':source.name,'sourceReviewSha256':sha(source/'preparation-review.sha256'),'reviewSha256':sha(out/'preparation-review.sha256'),'installedSourcePolicy':SOURCE_POLICY,'intendedHistoricalNamespaceRetained':True,'recoveryReceiptSha256':sha(recovery_receipt),'operatorAuthorization':None,'runtimeRebuilt':False,'runtimeCopied':False,'proofsFreshened':False,'blocked':['new namespace/policy/installer with source15b','explicit future owner authorization','fresh RPO/custody/root/writers/SQL-proxy/capacity before execution'],'warning':'NEVER TRANSFER OVER OR EXECUTE THE V13; historical installer retained only as source evidence'}
 write(out/'engineering-state.private.json',classification)
 verify_files(out)
 changed=[n for n,h in original.items()if sha(out/n)!=h]
 after={str(f.relative_to(out)):sha(f)for f in out.rglob('*')if f.is_file()}
 write(out/'composition-index.private.json',{'state':classification['state'],'filesSha256':after,'changedOriginalFiles':changed,'originalSourceUnchanged':all(sha(source/n)==h for n,h in original.items()),'allocatedBytes':sum(f.stat().st_blocks*512 for f in out.rglob('*')if f.is_file())})
 for f in out.rglob('*'):f.chmod(0o700 if f.is_dir()else 0o600)
 print(json.dumps({'result':classification['state'],'reviewSha256':classification['reviewSha256'],'changedFiles':len(changed),'modes':4,'productionEffects':False}))
if __name__=='__main__':prepare(*sys.argv[1:])
