"""Restricted ONE-SHOT deploy-crontab recovery, for review. No root mutation/jobs.

Reads sealed v13 only. Does not execute A/B, alter gates or reset its history.
No rollback/retry on uncertain crontab installation: inspect the preserved receipt.
"""
import argparse, datetime, fcntl, hashlib, json, os, stat, subprocess, sys, time
from pathlib import Path
from scheduled_controls import SYSTEM_CRON, private_bytes, require

P=Path('/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-security-cipher-restore-v13-20261015T100500Z')
POLICY='15b91a2a41708a1ef0ee8a499fd51f892298561d0d73dbbfb05ceb3fe285899f'
REVIEW='a7b17b6a2218876b325da3b24e97b5264b7e19c5dc8adc3bb7d58c51dd6fc095'
GATES={'ownerAuthorized','preflightReviewed','artifactsVerified','restoreVerified','discrepanciesResolved'}
def sha(raw):return hashlib.sha256(raw).hexdigest()
def closed_gates(value):
    require(type(value)is dict and set(value)==GATES and all(x is False for x in value.values()),'execution_gate_drift')
def record(path,value):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    try:
        with os.fdopen(fd,'w')as f:json.dump(value,f,sort_keys=True);f.flush();os.fsync(f.fileno())
    except BaseException:raise

def restricted_delta(before,current):
    a=before.splitlines(keepends=True);b=current.splitlines(keepends=True)
    require(len(a)==len(b)==29,'cron_line_population_drift')
    changed=[i for i in range(len(a))if a[i]!=b[i]]
    require(changed==[0,24,25,26,27,28],'cron_not_the_six_approved_entries')
    for i in changed:
        require(not a[i].lstrip().startswith(b'#') and a[i].split(None,5)[:5] in
                [b'15 3 * * *'.split(),b'0 3 * * *'.split(),b'30 3 * * *'.split(),b'20 3 * * *'.split(),b'0 4 * * *'.split()], 'cron_schedule_not_approved')
        require(b[i].startswith(b'#') and a[i].strip() in b[i], 'cron_entry_not_preserved')
    return changed

class Host:
    def run(self,args,text=None):
        return subprocess.check_output(args,input=text,text=True,stderr=subprocess.PIPE,timeout=30)
    def observe(self,plan):
        # Check the exact concrete package before importing its operational readers.
        require(sha(private_bytes(P/'preparation-review.sha256'))==REVIEW,'review_manifest_drift')
        r=subprocess.run(['/usr/bin/python3','-B',str(P/'verify-package.py')],capture_output=True,timeout=30)
        require(r.returncode==0,'concrete_package_denied')
        sys.path[:0]=[str(P/'window'),str(P/'switch')]
        from sequencer import Bridge
        b=Bridge(P);v=json.loads(b.privileged('inspect'));b.privileged('check-absent')
        require(v['policySha256']==POLICY and v['phase'] is None and v['sourceProcessesAlive'],'policy_or_phase_drift')
        require((P/'execution-authorized').read_text().strip()=='false','execution_gate_drift')
        closed_gates(json.loads(private_bytes(P/'window/execution-gates.private.json')))
        require(not any((P/'window/seal-current').iterdir()),'cipher_seal_already_present')
        source=json.loads((P/'window/privileged-policy.private.json').read_text())['sourceProcesses']
        apps=b.apps();require(set(apps)==set(source),'process_population_drift')
        cfg=b.expected_config('switch','return.config.private.json')
        for name,v in source.items():
            require(apps[name]['pid']==v['pid'] and b.identity(v['pid'])['ticks']==v['ticks'] and b.app_matches(name,cfg),'protected_identity_drift')
        g=b.guard();require(not g['open'] and g['generation']==38 and not g['tasks'] and not g.get('ledgerFault'),'guard38_drift')
        for item in plan['files']:
            f=Path(item['path']);st=f.lstat()
            require(stat.S_ISREG(st.st_mode) and not f.is_symlink() and st.st_uid==item['uid'] and stat.S_IMODE(st.st_mode)==item['mode'] and sha(f.read_bytes())==item['sha256'],'consumer_file_drift')
        for name in ('dump.pm2','dump.pm2.bak'):
            live=Path('/home/deploy/.pm2')/name
            require(json.loads(private_bytes(live))==json.loads(private_bytes(P/'window'/('saved-'+name+'.private.json'))),'saved_fallback_drift')
        system=self.run(['cat',SYSTEM_CRON]).encode()
        require(sha(system)==plan['systemBeforeSha256'],'system_cron_drift')
        require(self.run(['systemctl','show','pm2-deploy.service','--property=ActiveState,UnitFileState'])==json.loads((P/'window/initial.private.json').read_text())['supervision'],'supervision_drift')
        from urllib.request import urlopen
        with urlopen('http://127.0.0.1:3001/health',timeout=5)as f:h=json.load(f)
        require(h['ok'] and h['db']=='ok','health_db_denied')
        return {'guard38Closed':True,'protectedIdentitiesMatch':True,'NEWauthNEWDBSealedProfilesUnchanged':True,'systemCronBefore':True,'savedFallback600':True,'gatesFalse':True,'healthDb':'ok'}

def perform(plan,plan_hash,q,host,apply):
    before=bytes.fromhex(plan['beforeHex']);expected=bytes.fromhex(plan['currentHex'])
    require(sha(before)==plan['beforeSha256'] and sha(expected)==plan['currentSha256'],'plan_content_hash_drift')
    require(sha(before)==sha(private_bytes(P/'window/deploy.crontab.before')) and sha(expected)==sha(private_bytes(P/'window/deploy.crontab.window')),'canonical_cron_sources_drift')
    changed=restricted_delta(before,expected)
    pre=host.observe(plan);current=host.run(['crontab','-l']).encode()
    require(current==expected,'current_crontab_CAS_denied')
    # No manual catch-up and avoid installing at/adjacent to any of the five distinct due minutes.
    now=datetime.datetime.now(datetime.timezone.utc);minute=now.hour*60+now.minute
    require(all(min(abs(minute-m),1440-abs(minute-m))>2 for m in [180,195,200,210,240]),'scheduled_minute_proximity_denied')
    record(q/'before.private.json',{'utc':now.isoformat(),'planSha256':plan_hash,'crontabHex':current.hex(),'checks':pre})
    if not apply:
        record(q/'check.receipt.private.json',{'result':'RESTRICTED_CRON_CHECK_PASS_NO_APPLY','entries':6,'planSha256':plan_hash})
        return {'result':'RESTRICTED_CRON_CHECK_PASS_NO_APPLY','entries':6}
    # Reconfirm immediately before intent; no expansion of scope or regeneration of the input.
    require(host.run(['crontab','-l']).encode()==expected,'last_crontab_CAS_denied')
    record(q/'restore.intent.private.json',{'planSha256':plan_hash,'beforeSha256':sha(before),'currentSha256':sha(expected),'changedLines':[i+1 for i in changed],'automaticRetry':False})
    error=None
    try:host.run(['crontab','-'],before.decode())
    except BaseException as ex:error=type(ex).__name__
    # Inspect even when install fails/times out; never install a second time or auto-rollback.
    try:
        after=host.run(['crontab','-l']).encode()
        observed='RESTORED'if after==before else'UNCHANGED'if after==expected else'UNKNOWN'
        record(q/'after.private.json',{'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'crontabHex':after.hex(),'sha256':sha(after),'classification':observed,'installErrorClass':error})
        post=host.observe(plan)
        require(error is None and observed=='RESTORED','cron_install_uncertain_no_retry')
        require(host.run(['crontab','-l']).encode()==before,'postcheck_crontab_drift')
        result={'result':'RESTRICTED_DEPLOY_CRON_RESTORED','planSha256':plan_hash,'restoredEntries':6,'checks':post,'jobsExecutedManually':False,'automaticRetry':False}
        record(q/'restore.receipt.private.json',result);return result
    except BaseException as ex:
        record(q/'partial.private.json',{'result':'DENY_PARTIAL_OR_UNCERTAIN','errorClass':type(ex).__name__,'detailPrivate':str(ex),'installErrorClass':error,'automaticRetry':False})
        raise

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--plan',required=True);ap.add_argument('--plan-sha256',required=True);ap.add_argument('--evidence-dir',required=True)
    group=ap.add_mutually_exclusive_group(required=True);group.add_argument('--check',action='store_true');group.add_argument('--owner-authorized-restore',action='store_true');group.add_argument('--inspect',action='store_true');args=ap.parse_args()
    os.umask(0o077);require(os.getuid()!=0,'run_as_deploy_not_root')
    raw=private_bytes(args.plan);require(sha(raw)==args.plan_sha256,'plan_hash_denied');plan=json.loads(raw)
    require(plan['schema']==1 and plan['operation']=='RESTORE_ONLY_SIX_ORIGINALLY_ACTIVE_DEPLOY_ENTRIES','plan_scope_denied')
    q=Path(args.evidence_dir);require(q.parent.resolve()==Path(args.plan).parent.resolve(),'evidence_namespace_denied')
    # Single evidence namespace is fixed in input; consumed intent blocks any new evidence directory replay.
    key='inspectionEvidenceDirectory'if args.inspect else'evidenceDirectory'if args.owner_authorized_restore else'checkEvidenceDirectory'
    require(q.name==plan[key],'fixed_evidence_directory_required')
    parent=q.parent.lstat();require(stat.S_ISDIR(parent.st_mode)and parent.st_uid==os.getuid()and stat.S_IMODE(parent.st_mode)==0o700 and not q.parent.is_symlink(),'private_output_parent_denied')
    q.mkdir(mode=0o700) # exists/symlink is a denial, never overwritten
    lock=P.parent/'.incident-6683-window.lock'
    fd=os.open(lock,os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600)
    try:
        st=os.fstat(fd);require(stat.S_ISREG(st.st_mode)and st.st_uid==os.getuid()and stat.S_IMODE(st.st_mode)==0o600,'canonical_lock_denied')
        fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        if args.inspect:
            h=Host();current=h.run(['crontab','-l']).encode()
            classification='RESTORED'if sha(current)==plan['beforeSha256']else'UNCHANGED'if sha(current)==plan['currentSha256']else'UNKNOWN'
            record(q/'current.private.json',{'crontabHex':current.hex(),'classification':classification,'utc':datetime.datetime.now(datetime.timezone.utc).isoformat()})
            checks=h.observe(plan)
            result={'result':'READ_ONLY_CRON_INSPECTION','classification':classification,'checks':checks,'automaticRetry':False}
            record(q/'inspection.private.json',result)
        else:result=perform(plan,args.plan_sha256,q,Host(),args.owner_authorized_restore)
        print(json.dumps(result))
    except BaseException as ex:
        record(q/'denial.private.json',{'result':'DENY','errorClass':type(ex).__name__,'detailPrivate':str(ex),'automaticRetry':False})
        print(json.dumps({'result':'DENY','errorClass':type(ex).__name__,'automaticRetry':False}));raise SystemExit(1)
    finally:os.close(fd)

if __name__=='__main__':main()
