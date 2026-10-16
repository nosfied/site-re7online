"""Compose NEW private templates from certified controls. No build/extraction/VPS."""
import argparse,copy,hashlib,importlib.util,json,os,shutil
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[3]
BASE=HERE.parent/'security-containment-20261012/openai-operational-20261015'
GEN='incident-csv-operational-review-v3-20261016'
REMOTE='/opt/re7online/backups/converta-persistent/preparations/'+GEN
TARGET='/opt/re7online/releases/crm-csv-24e5857f-20261016/apps/whatsapp-agent'
MODES=('switch','return','return-partial','return-before-commit')
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def put(p,v):
    with Path(p).open('x')as f:json.dump(v,f,sort_keys=True);f.write('\n')
    Path(p).chmod(0o600)
def load(n,p):
    s=importlib.util.spec_from_file_location(n,p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
def seal(p):
    w=p/'window';names=json.loads((w/'mode-names.private.json').read_text())
    for mode in MODES:
        (p/mode/'scripts.sha256').write_text(''.join(sha(p/mode/n)+'  '+n+'\n'for n in names[mode]))
    for f in (w/'mode-manifest-v4.json',w/'sequencer-manifest.json'):
        if f.exists():f.unlink() # New unpublished template only, never historical input.
    put(w/'mode-manifest-v4.json',{'modeFiles':{m:{n:sha(p/m/n)for n in names[m]}for m in MODES},'modeManifests':{m:sha(p/m/'scripts.sha256')for m in MODES}})
    put(w/'sequencer-manifest.json',{'preparation':REMOTE,'status':'TEMPLATE_PENDING_WINDOW_BINDINGS','filesSha256':{f.name:sha(f)for f in w.iterdir()if f.is_file()and f.name not in ('sequencer-manifest.json','execution-gates.private.json')}})
    (p/'preparation-review.sha256').write_text(''.join(sha(f)+'  '+str(f.relative_to(p))+'\n'for f in sorted(p.rglob('*'))if f.is_file()and f.name not in ('preparation-review.sha256','execution-authorized','execution-gates.private.json')))
def compose(out):
    os.umask(0o077);out=Path(out).absolute();assert out.name==GEN and not out.exists()
    src=ROOT/'local-evidence/openai-operational-20261015/incident-6683-v4-security-openai-v4-20261015T203000Z'
    material=ROOT/'local-evidence/crm-csv-coordinated-20261015'
    review=load('csv_retention',ROOT/'scripts/operational_preparation_review.py')
    assert sha(src/'window/source.profile.private.json')=='aa63ea74d3a7bb315ba11124842bd02c05cf0cc60215a056eee47ab87782275d'
    originals={str(f.relative_to(src)):sha(f)for m in MODES for f in(src/m).iterdir()if f.is_file()}
    names=json.loads((src/'window/mode-names.private.json').read_text())
    budget=sum((src/m/n).stat().st_size for m in MODES for n in names[m])+16*1024**2
    assert os.statvfs(out.parent).f_bavail*os.statvfs(out.parent).f_frsize>budget+64*1024**2
    decision=review.reuse_decision({'expected':{'sha256':sha(material/'api-candidate.tar'),'dependenciesSha256':sha(material/'api-candidate.manifest.private.json'),'runtime':'post-cipher-v14','contract':'csv-ledger-GET-v1'},'existing':[],'reusePermitted':True,'newCopyAllocatedBytes':budget,'justification':'new path-bound operational controls and profiles only; certified runtime archives and restores reused without copy/build/tar','newLinks':False})
    source=json.loads((src/'window/source.profile.private.json').read_text());target=copy.deepcopy(source)
    a=next(a for a in target['apps']if a['name']=='re7-whatsapp-agent');a['cwd']=TARGET;a['script']=TARGET+'/dist/index.js'
    boundary=load('csv_boundary_composer',HERE/'csv_boundary.py');boundary.profile_delta(source,target,TARGET)
    out.mkdir(mode=0o700);w=out/'window';w.mkdir(mode=0o700)
    old='/opt/re7online/backups/converta-persistent/preparations/'+src.name
    shared=['sequencer.py','baseline_contract.py','ecosystem_contract.py','privileged_output.py','scheduled_controls.py','restore_contract.py','restore-result.json','restore-contract.private.json','original-restore-proof.private.json','backup-compatibility.private.json','backup-manifest.private.json','automation-fence.nft','privileged.py','closure-verified.private.json','waiting-work.private.json','frontend-build-env.private.json','db-owner-bindings.private.json','initial.private.json','deploy.crontab.before','deploy.crontab.window','re7-converta-backup.before','re7-converta-backup.window','saved-dump.pm2.private.json','saved-dump.pm2.bak.private.json']
    for n in shared:
        raw=(src/'window'/n).read_bytes()
        if n.endswith('.py'):raw=raw.replace(old.encode(),REMOTE.encode())
        (w/n).write_bytes(raw)
    put(w/'mode-names.private.json',names);put(w/'source.profile.private.json',source);put(w/'target.profile.private.json',target)
    for mode in MODES:
        d=out/mode;d.mkdir(mode=0o700)
        for n in names[mode]:
            if n.endswith('ecosystem.config.cjs'):continue
            raw=(src/mode/n).read_bytes()
            if n.endswith(('.py','.cjs')):raw=raw.replace(old.encode(),REMOTE.encode()).replace(b'from openai_start_gate import authorize_start',b'from csv_start_gate import authorize_start')
            (d/n).write_bytes(raw)
        for n,v in [('candidate.config.private.json',source if mode=='return-before-commit'else target),('return.config.private.json',source if mode in ('switch','return-before-commit')else target)]:
            (d/n).write_text(json.dumps(v,sort_keys=True)+'\n')
        load('csv_ecosystem',w/'ecosystem_contract.py').generate_mode(d)
    shutil.copyfile(HERE/'csv_boundary.py',w/'csv_boundary.py')
    contract=(BASE/'openai_contract.py').read_text();start=contract.index('def profiles(');end=contract.index('def check(',start)
    contract=contract[:start]+"def profiles(before,after):\n from csv_boundary import profile_delta\n profile_delta(before,after,'"+TARGET+"')\n"+contract[end:]
    contract=contract[:contract.index('def selected(')]
    contract=contract.replace('openai-contract','csv-contract').replace(" and c['models']=={'responses':'gpt-4.1-mini','audio':'gpt-4o-mini-transcribe'}",'').replace('OPENAI_FOUR_MODE_CONTRACT_PASS','CSV_FOUR_MODE_CONTRACT_PASS')
    contract=contract.replace(" if live:\n  require(str(p)"," if live:\n  require(read(w/'binding-status.private.json')['state']=='WINDOW_BOUND','window_binding_required')\n  require(str(p)")
    (w/'csv_contract.py').write_text(contract)
    (w/'csv_start_gate.py').write_text("from pathlib import Path\nfrom csv_contract import check\nfrom csv_boundary import stage_boundary\ndef authorize_start(d):\n d=Path(d);check(d.parent,live=True);stage_boundary(d.parent,d.name)\n")
    check=(BASE/'check_current.py').read_text().replace('openai_contract','csv_contract').replace('openai-contract','csv-contract').replace('OPENAI_CANONICAL_CURRENT_PASS','CSV_CANONICAL_CURRENT_PASS')
    check=check.replace(" g=b.guard();", " from csv_boundary import event_consumers,event_policy\n event=read(p/'window/event-consumer-binding.private.json');event_consumers(event,live=True)\n if phase=='after':event_policy(event['path'],event['targetSha256'])\n g=b.guard();")
    (w/'check_current.py').write_text(check)
    shutil.copyfile(HERE/'csv_cli.py',w/'csv_cli.py')
    shutil.copyfile(HERE/'capture_imports.py',w/'capture_imports.py')
    shutil.copyfile(HERE/'event_overlay.py',w/'event_overlay.py')
    shutil.copyfile(HERE/'admit_gates.py',w/'admit_gates.py')
    shutil.copyfile(HERE/'pre_install.py',w/'pre_install.py')
    (w/'root_readonly.py').write_text((BASE/'root_readonly.py').read_text().replace('OPENAI_ROOT_SOURCE_PASS','CSV_ROOT_SOURCE_PASS'))
    shutil.copyfile(BASE/'capture_readonly.py',out/'capture-source-readonly.py')
    # Pure updates producer reused; its historic apply CLI is never copied/invoked.
    original=(BASE.parent/'cipher-v13-execution-20261015/renew_proofs.py').read_text()
    (w/'canonical_renew_proofs.py').write_text(original[:original.index('def apply(')])
    (out/'refresh_proofs.py').write_text((BASE/'refresh_proofs.py').read_text().replace('openai_contract','csv_contract').replace('openai-execution','csv-execution').replace('OPENAI_FOUR_BACKUP_BINDINGS_REFRESHED','CSV_FOUR_BACKUP_BINDINGS_REFRESHED'))
    shutil.copyfile(HERE/'bind_window.py',out/'bind_window.py')
    shutil.copyfile(HERE/'compose.py',out/'compose.py')
    shutil.copyfile(HERE/'capture_phase.py',out/'capture_phase.py')
    proof=json.loads((HERE.parent/'crm-csv-coordinated-20261015/COMPILED_PROOF_SANITIZED.json').read_text())
    put(w/'csv-compiled-proof.private.json',proof)
    shutil.copyfile(ROOT/'apps/whatsapp-agent/src/events/eventRetentionPolicy.ts',w/'eventRetentionPolicy.ts')
    policy=json.loads((src/'window/privileged-policy.private.json').read_text());policy['preparation']=REMOTE
    manifest=json.loads((material/'api-candidate.manifest.private.json').read_text());entry=next(e for e in manifest['files']if e['path']=='dist/index.js')
    for mode in ('switch','return'):
        policy['targetProcesses'][mode]['re7-whatsapp-agent']={'cwd':TARGET,'script':TARGET+'/dist/index.js','sha256':entry['sha256']}
    put(w/'privileged-policy.private.json',policy);(w/'privileged-policy.sha256').write_text(sha(w/'privileged-policy.private.json')+'\n')
    prior=json.loads((src/'window/openai-contract.private.json').read_text())
    put(w/'csv-contract.private.json',{'sourcePolicySha256':prior['sourcePolicySha256'],'sourceProfileSha256':sha(w/'source.profile.private.json'),'targetProfileSha256':sha(w/'target.profile.private.json'),'remotePreparation':REMOTE,'immutable':prior['immutable'],'minimumCapacityBytes':11235700736})
    inv={'runtimeRoot':TARGET,'files':manifest['files'],'links':manifest['sharedLinks'],'artifactSha256':sha(material/'api-candidate.tar')};put(out/'runtime-inventory.private.json',inv)
    put(w/'execution-gates.private.json',{k:False for k in ('ownerAuthorized','preflightReviewed','artifactsVerified','restoreVerified','discrepanciesResolved')});(out/'execution-authorized').write_text('false\n')
    # Deliberately blocks installation until a NEW, reviewed window-bound namespace exists.
    put(w/'binding-status.private.json',{'state':'TEMPLATE_NOT_ADMITTED','historicalIdentitiesOnly':True,'pending':['fresh source identities/root/SQL/proxy/capacity/WAL','backup RPO/custody and compatible retained restore','scoped CSV audit and exact Event source consumer metadata','post-API actual successors for frontend binding'],'executionAuthorized':False})
    (out/'verify-package.py').write_text("from pathlib import Path\nimport sys,json\np=Path(__file__).resolve().parent;sys.path[:0]=[str(p/'window'),str(p/'switch')]\nfrom csv_contract import check,read,require\nv=check(p,live='--offline'not in sys.argv)\nif '--offline'not in sys.argv:require(read(p/'window/binding-status.private.json')['state']=='WINDOW_BOUND','window_binding_required')\nprint(json.dumps(v))\n")
    installer=(src/'install-api-window-policy.sh').read_text().replace(old,REMOTE).replace('pre-security-openai-v4-20261015T203000Z','pre-csv-coordinated-v1-20261016')
    installer=installer.replace(sha(src/'window/privileged-policy.private.json'),sha(w/'privileged-policy.private.json'))
    installer=installer.replace('python3 "$P/verify-package.py"','python3 "$P/verify-package.py"\npython3 -B "$P/window/pre_install.py" "$P"',1)
    (out/'install-api-window-policy.sh').write_text(installer)
    # Full real frontend consumers are composed now; no old binding/intent is
    # imported as authority. Their fresh bindings follow the certified API pair.
    front=ROOT/'local-evidence/dynamic-integrated-20261012/authorized-window-20261012T180000Z/deployed-final/frontend-dynamic-5b3cf3af-20261012T170000Z'
    fd=out/'frontend';fd.mkdir(mode=0o700)
    frontremote=REMOTE+'/frontend';frontold='/opt/re7online/backups/converta-persistent/preparations/'+front.name
    code=[f for f in front.iterdir()if f.is_file()and f.suffix in ('.py','.cjs')and '.config.'not in f.name]
    for f in code:
        (fd/f.name).write_bytes(f.read_bytes().replace(frontold.encode(),frontremote.encode()).replace(b'/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-dynamic-5b3cf3af-20261012T170000Z',REMOTE.encode()))
    f=fd/'frontend-check.py';text=f.read_text();text=text.replace("TARGET = '/opt/re7online/releases/frontend-dynamic-5b3cf3af-20261012T170000Z'","TARGET = '/opt/re7online/releases/crm-csv-front-ea3d2788-20261016'\nRETURN = '/opt/re7online/releases/crm-csv-front-return-d41ddd64-20261016'")
    oldreturn="next(x['pm_cwd'] for x in json.loads((P/'runtime.private.json').read_text())['processes'] if x['name']==FRONT)"
    assert text.count(oldreturn)==1;text=text.replace(oldreturn,'RETURN');f.write_text(text)
    # A historical root socket certificate must never rescue a new incomplete read.
    text=f.read_text();anchor="        if str(error) != 'socket_owner_observation_incomplete' or not SOURCE_ROOT_OBSERVATION.exists():\n            raise\n        return root_source_socket_observation(captured, remaining, daemon)"
    assert text.count(anchor)==1;text=text.replace(anchor,'        raise # new-generation incomplete ownership always denies; no legacy certificate fallback')
    f.write_text(text)
    frontbase={'apps':[copy.deepcopy(next(a for a in source['apps']if a['name']=='re7-admin-front'))]}
    originalbase=json.loads((front/'active-base.config.private.cjs').read_text().split('module.exports = ',1)[1].rstrip(';\n'))
    frontbase['apps'][0].pop('stop_exit_codes',None);frontbase['apps'][0]['args']=originalbase['apps'][0]['args']
    (fd/'active-base.config.private.cjs').write_text('module.exports = '+json.dumps(frontbase)+';\n')
    for label,release in [('candidate','/opt/re7online/releases/crm-csv-front-ea3d2788-20261016'),('return','/opt/re7online/releases/crm-csv-front-return-d41ddd64-20261016')]:
        config=copy.deepcopy(frontbase);config['apps'][0]['cwd']=release;config['apps'][0]['script']=release+'/node_modules/next/dist/bin/next'
        (fd/(label+'.ecosystem.config.cjs')).write_text('module.exports = '+json.dumps(config)+';\n')
    phase=HERE.parent/'dynamic-integrated-prepared-20261012/operational-20261012/frontend_phase_contract.py'
    shutil.copyfile(phase,fd/'frontend_phase_contract.py')
    shutil.copyfile(HERE/'bind_frontend.py',fd/'bind_frontend.py')
    shutil.copyfile(HERE/'install_frontend_policy.py',fd/'install_frontend_policy.py')
    for n in ('observer-policy.private.json','permanent-policy.proposed.private.json'):
        if(front/n).exists():shutil.copyfile(front/n,fd/(n+'.template'))
    sb=json.loads((front/'socket-observer-binding.private.json').read_text());pb=json.loads((front/'permanent-observer-binding.private.json').read_text())
    put(fd/'root-sources.private.json',{'window':{'policySha256':sha(front/'observer-policy.private.json'),'helperSha256':sb['helperSha256'],'sudoersSha256':'118a54ec6f03c6f8af92a5e9f05d766fda08eea0d2fa79a207ecf588374e8b12'},'permanent':{'policySha256':sha(front/'permanent-policy.proposed.private.json'),'helperSha256':pb['helperSha256'],'sudoersSha256':'2b3131648860b84dc3f131604347aaf400475b67c234378e791cf5cf454eda39'},'freshRootCheckRequired':True})
    put(fd/'binding-status.private.json',{'state':'POST_API_IDENTITIES_REQUIRED','frontendCandidateRelease':'/opt/re7online/releases/crm-csv-front-ea3d2788-20261016','frontendReturnRelease':'/opt/re7online/releases/crm-csv-front-return-d41ddd64-20261016','candidateBuildId':'K6S0K4-fyO768V9W5GS7g','preservedBackend':TARGET,'futureBindings':['API/worker started certificates','phase live/saved/fallback','source active control/run/child','socket observer policy','new launcher control nonce and entry hash','permanent observer binding'],'executionAuthorized':False})
    put(out/'lifecycle.private.json',{'state':'COMPOSED_LOCAL_NOT_WINDOW_BOUND','responsible':'Deifson Oliveira','lastReview':'2026-10-16','nextReview':'2026-10-21','copyReview':decision,'budgetBytes':budget,'purpose':'CSV API/frontend control templates; no runtime rebuild','sourceFilesPreserved':all(sha(src/n)==h for n,h in originals.items()),'retained':['active runtimes','compatible backend candidate on frontend return','crons/restore/receipts/manifests'],'archiveAfterClosure':['operational controls and evidence in owner custody'],'productionEffects':False})
    for f in out.rglob('*'):f.chmod(0o700 if f.is_dir()else 0o600)
    seal(out)
    return {'result':'CSV_OPERATIONAL_TEMPLATES_COMPOSED','reviewSha256':sha(out/'preparation-review.sha256'),'policyTemplateSha256':sha(w/'privileged-policy.private.json'),'installerTemplateSha256':sha(out/'install-api-window-policy.sh'),'windowBound':False,'runtimeBuilds':0,'productionEffects':False}
if __name__=='__main__':
    a=argparse.ArgumentParser();a.add_argument('--out',required=True);v=a.parse_args();print(json.dumps(compose(v.out),sort_keys=True))
