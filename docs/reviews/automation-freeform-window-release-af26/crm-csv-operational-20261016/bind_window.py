"""Explicit new namespace from fresh canonical READ ONLY capture; no remote effects.
Never edits the input template, copies runtimes or admits gates.
"""
import argparse,base64,datetime,hashlib,importlib.util,json,os,re,shutil,sys
from pathlib import Path
HERE=Path(__file__).resolve().parent
def load(n,p):
    s=importlib.util.spec_from_file_location(n,p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
def bind(template,capture,event,known,out):
    os.umask(0o077);template=Path(template).absolute();out=Path(out).absolute();sys.path[:0]=[str(template/'window'),str(template/'switch')]
    import csv_contract as c
    c.check(template,live=False)
    require=c.require;read=c.read;sha=c.sha
    require(re.fullmatch(r'incident-csv-window-[a-zA-Z0-9-]+',out.name)is not None and not out.exists()and not out.is_symlink(),'new_window_namespace_required')
    s=out.parent.lstat();require(s.st_uid==os.getuid()and s.st_mode&0o777==0o700 and not out.parent.is_symlink(),'private_output_parent')
    v=read(Path(capture));e=read(Path(event));k=read(Path(known));now=datetime.datetime.now(datetime.timezone.utc)
    require(0<=(now-datetime.datetime.fromisoformat(v['capturedUtc'])).total_seconds()<600,'source_capture_stale')
    source=read(template/'window/source.profile.private.json');require(v['sourceProfile']==source and v['newCipherVerified']is True and v['healthDb']is True and v['productionMutation']is False,'source_or_epoch_drift')
    require(v['deployCron']==(template/'window/deploy.crontab.before').read_text()and v['systemCron']==(template/'window/re7-converta-backup.before').read_text(),'scheduled_sources_drift')
    require(v['minimumAvailableBytes']>=read(template/'window/csv-contract.private.json')['minimumCapacityBytes'],'capacity_below_budget')
    require(set(v['identities'])=={a['name']for a in source['apps']} and all(type(x['pid'])is int and str(x['ticks']).isdigit()for x in v['identities'].values()),'identities_incomplete')
    require(v['immutable']==[x for x in read(template/'window/csv-contract.private.json')['immutable']if x['path']!=v['cipherReceipt']['path']],'immutable_source_drift')
    require(e['path']=='/opt/re7online/site-re7online/apps/whatsapp-agent/src/events/eventRetentionPolicy.ts'and e['beforeSha256']=='b22246be4ede437d647c2a7cfc7492c823bea072de9d22fa09fe75fb6be2e659'and e['targetSha256']==sha(template/'window/eventRetentionPolicy.ts')and e['uid']==os.getuid()and type(e['mode'])is int,'event_source_binding')
    from csv_boundary import event_consumers
    event_consumers(e)
    require(k['reviewedAgainstAuditAndKnownActivity']is True and type(k['operations'])is list,'known_activity_inventory_required')
    require(os.statvfs(out.parent).f_bavail*os.statvfs(out.parent).f_frsize>=64*1024**2,'control_staging_capacity')
    shutil.copytree(template,out,symlinks=False);w=out/'window';old=read(w/'csv-contract.private.json')['remotePreparation'];remote='/opt/re7online/backups/converta-persistent/preparations/'+out.name
    def replace_json(p,value):p.write_text(json.dumps(value,sort_keys=True)+'\n');p.chmod(0o600)
    oldpolicy=sha(w/'privileged-policy.private.json')
    for f in out.rglob('*'):
        if f.is_file()and f.suffix in ('.py','.cjs','.sh'):f.write_bytes(f.read_bytes().replace(old.encode(),remote.encode()))
    replace_json(w/'initial.private.json',v['initial'])
    for mode in ('switch','return','return-partial','return-before-commit'):replace_json(out/mode/'baseline.private.json',v['functional'])
    for n,sv in zip(('saved-dump.pm2.private.json','saved-dump.pm2.bak.private.json'),v['saved']):replace_json(w/n,sv['content'])
    policy=read(w/'privileged-policy.private.json');policy.update(preparation=remote,sourceProcesses=v['identities'],pm2Daemon=v['pm2Daemon']);replace_json(w/'privileged-policy.private.json',policy);(w/'privileged-policy.sha256').write_text(sha(w/'privileged-policy.private.json')+'\n')
    f=out/'install-api-window-policy.sh';f.write_text(f.read_text().replace(oldpolicy,sha(w/'privileged-policy.private.json')).replace('pre-csv-coordinated-v1-20261016','pre-'+out.name))
    contract=read(w/'csv-contract.private.json');contract['remotePreparation']=remote;replace_json(w/'csv-contract.private.json',contract)
    replace_json(w/'event-consumer-binding.private.json',e);replace_json(w/'csv-known-imports.private.json',k)
    replace_json(w/'binding-status.private.json',{'state':'WINDOW_BOUND','captureSha256':sha(capture),'capturedUtc':v['capturedUtc'],'freshRootAndBackupAdmissionRequired':True,'executionAuthorized':False})
    m=load('csv_composer_for_binding',HERE/'compose.py');m.REMOTE=remote;m.seal(out)
    # Complete concrete checker against exact new bytes; no fixture substitute.
    c.check(out,live=False)
    return {'result':'CSV_WINDOW_BOUND_NOT_ADMITTED','reviewSha256':sha(out/'preparation-review.sha256'),'policySha256':sha(w/'privileged-policy.private.json'),'installerSha256':sha(out/'install-api-window-policy.sh'),'backupRenewed':False}
if __name__=='__main__':
    a=argparse.ArgumentParser()
    for n in ('template','capture','event','known','out'):a.add_argument('--'+n,required=True)
    v=a.parse_args();print(json.dumps(bind(v.template,v.capture,v.event,v.known,v.out),sort_keys=True))
