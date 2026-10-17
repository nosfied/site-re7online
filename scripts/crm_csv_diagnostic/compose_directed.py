"""Offline derivation only; exclusive new review directory, never runs a collector.
Run from canonical repository root only. Existing output denies without overwrite.
"""
def compose():
 from pathlib import Path
 import hashlib,json,os,importlib.util,re
 root=Path.cwd(); rv=root/'docs/reviews/automation-freeform-window-release-af26'; d=rv/'crm-csv-delivery-review-20261017'; old=rv/'crm-csv-postrpc-diagnostics-20261017'; out=d/'directed-diagnostic'
 out.mkdir(exist_ok=False)
 editable=root/'scripts/crm_csv_diagnostic/editable_sources.py';raw=editable.read_bytes();assert hashlib.sha256(raw).hexdigest()=='9fc6baad650fdb0ad4bc7c356276e957f454ad19ac595c33f116b6b748455f60','editable_source_digest'
 ns={'__name__':'reviewed_editable_library','__file__':str(editable)};exec(compile(raw,str(editable),'exec'),ns);inputs=ns['source_inputs']()
 h=lambda b:hashlib.sha256(b).hexdigest()
 manifest=json.loads((old/'MANIFEST.json').read_bytes()); assert h((old/'MANIFEST.json').read_bytes())=='85cbcb315d6081e33aefa79036c435c270e868445c1625b27ce99319af5ee617'
 # Accepted origin bytes, derived only in this new inactive review directory.
 for name in ('launch.py','driver.py','runner.py'):
  entry=manifest['files'][name]; raw=(old/name).read_bytes(); assert h(raw)==entry['sha256']; s=raw.decode()
  if name=='runner.py':
   start=s.index('# Inline diagnostic integration;'); end=s.index('\nINSPECT=',start)
   s=s[:start]+inputs['frontier.source'].decode()+s[end:]
   # Only collect is exposed in the future package; no SQL payloads or SELECT action.
   a=s.index('\ndef selects('); b=s.index('\ndef run(',a); s=s[:a]+s[b:]
   s=s.replace("        if action=='select':selects(cap,row)","        controls(cap)")
   s=s.replace("result='GATES_1_3_PASS'if action=='collect'else'SELECTS_PRESERVED'","result='GATES_1_3_AND_CONTROLS_OBSERVED'")
   s=s.replace("    cap=Capture(q);ok=False", "    if action!='collect':raise RuntimeError('collect_only')\n    cap=Capture(q);ok=False")
  if name=='driver.py':
   a=s.index("        if action=='select':"); b=s.index("        cmd=",a);s=s[:a]+s[b:]
   s=s.replace("    if action=='select-owner-authorized':return transport('select')\n",'')
  if name=='launch.py':
   s=s.replace("root.parent/'crm-csv-r2-directed-20261017/privileged_output.source'", "root.parents[1]/'crm-csv-r2-directed-20261017/privileged_output.source'")
   s=s.replace("('materialize','collect','select-owner-authorized')","('materialize','collect')")
  replacements={
  'crm-csv-postrpc-diagnostics-20261017': 'crm-csv-delivery-review-20261017/directed-diagnostic',
  're7-csv-postrpc-material-20261017-v1':'re7-csv-directed-material-20261017-v1',
  're7-csv-postrpc-tools-20261017-v1':'re7-csv-directed-tools-20261017-v1',
  're7-csv-postrpc-read-20261017-v1':'re7-csv-directed-read-20261017-v1',
  'csv-postrpc-diagnostics-20261017-v1':'csv-directed-diagnostic-20261017-v1',
  'csv-postrpc-launcher-20261017-v1':'csv-directed-launcher-20261017-v1'}
  for a,b in replacements.items():s=s.replace(a,b)
  (out/name).write_text(s)
 # Inline observation using the existing Capture and stable_file; no new collector/writer.
 controls='''\ndef controls(cap):
     # Observations only; no classification from inactive/enabled, no root helper call.
     checked(cap,'controls-executor','CONTROL_EXECUTOR_DENIED',lambda:{'uid':os.getuid(),'gid':os.getgid()})
     guard(cap,'controls-nonroot','CONTROL_EXECUTOR_PRIVILEGED',lambda:os.getuid()==1000)
     checked(cap,'controls-deploy-cron','DEPLOY_CRON_READ_FAILED',lambda:cap.command('deploy-cron',['/usr/bin/crontab','-l']).decode())
     checked(cap,'controls-system-cron','SYSTEM_CRON_READ_FAILED',lambda:private_file_observation(Path('/etc/cron.d/re7-converta-backup'),cap.lib))
     checked(cap,'controls-supervision','SUPERVISION_READ_FAILED',lambda:cap.command('supervision',['/usr/bin/systemctl','show','pm2-deploy.service','--property=ActiveState,UnitFileState']).decode())
     for name in ('deploy.crontab.before','re7-converta-backup.before','supervision.before','execution-gates.private.json'):
         checked(cap,'controls-'+name,'CONTROL_FILE_READ_FAILED',lambda name=name:private_file_observation(P/name,cap.lib))
     checked(cap,'controls-authorization','AUTHORIZATION_READ_FAILED',lambda:private_file_observation(P.parent/'execution-authorized',cap.lib))
     cap.event('CONTROLS_OBSERVED_NOT_CERTIFIED',bothCronsSeparatelyObserved=True,supervisionInterpretation='compare original bytes offline; inactive/enabled alone is not failure',rootPolicyCertified=False,guardCertified=False,barrierCertified=False)
 '''
 controls='\n'.join(line[1:] if line.startswith(' ') else line for line in controls.split('\n'))
 # Canonical supervision reference is initial.private.json, corrected below before sealing.
 p=out/'runner.py';s=p.read_text();pos=s.index('\ndef run(');s=s[:pos]+controls+s[pos:];p.write_text(s)
 # Update manifest refs; no copying closure/runtime or private data.
 files={}
 for name,entry in manifest['files'].items():
  if name in ('identity.sql','ownership.sql','imports.sql','capture_imports.source'):continue
  entry=dict(entry)
  if name in ('launch.py','driver.py','runner.py'): source=out/name
  elif name=='contracts.py':source=rv/'crm-csv-frontend-reconciliation-20261017/contracts.py'
  else:source=Path(entry['source']);source=source if source.is_absolute()else root/source
  raw=source.read_bytes()
  if name not in ('launch.py','driver.py','runner.py','contracts.py'):assert len(raw)==entry['bytes'] and h(raw)==entry['sha256'],name
  entry.update(source=str(source.relative_to(root))if source.is_relative_to(root)else str(source),relativeSource=os.path.relpath(source,out),bytes=len(raw),sha256=h(raw))
  files[name]=entry
 manifest.update(base='8bf0fa8e04cb7ed4d19c1c920c90713d4c2533ee',scope='review-only directed diagnostic, no SELECT or operational authority',files=files)
 (out/'MANIFEST.json').write_text(json.dumps(manifest,indent=2,sort_keys=True)+'\n')
 p=out/'runner.py';s=p.read_text().replace("'supervision.before'","'initial.private.json'")
 s=s.replace("        value,m=lib['stable_file'](Path('/home/deploy/.pm2')/name)\n", "        value,m=lib['stable_file'](Path('/home/deploy/.pm2')/name)\n        cap.observe('saved-full-'+name,lambda:{'metadata':m,'bytes':len(value),'sha256':lib['sha'](value),'bytesBase64':base64.b64encode(value).decode()})\n")
 s=s.replace("        row=route(cap,apps)","        row=checked(cap,'route-client','ROUTE_OR_POSTGRES_CLIENT_DENIED',lambda:route(cap,apps))")
 p.write_text(s)
 v=json.loads((out/'MANIFEST.json').read_text());v['files']['runner.py'].update(bytes=len(p.read_bytes()),sha256=h(p.read_bytes()));(out/'MANIFEST.json').write_text(json.dumps(v,indent=2,sort_keys=True)+'\n')

if __name__=='__main__':compose()
