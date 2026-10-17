"""Fresh pre-A evidence; called before the first privileged policy write."""
import datetime,sys
from pathlib import Path
from csv_contract import check,read,sha,require,POLICY_SOURCE
from check_current import check_current
def verify(p):
    p=Path(p);check(p,live=True);w=p/'window';i=w/'owner-evidence';root=read(i/'root.private.json');r=read(i/'backup-result.private.json');ack=read(i/'custody-ack.private.json');lab=read(i/'lab-current.private.json')
    now=datetime.datetime.now(datetime.timezone.utc)
    for at,limit in [(root['capturedUtc'],600),(r['startedUtc'],3600)]:require(0<=(now-datetime.datetime.fromisoformat(at)).total_seconds()<limit,'pre_A_evidence_expired')
    require(root['result']=='CSV_ROOT_SOURCE_PASS'and root['mutation']is False and len(root['files'])==3 and any(f['path']=='/usr/local/libexec/re7/incident-6683-window-policy.json'and f['sha256']==POLICY_SOURCE for f in root['files']),'root_source_evidence')
    require(r==read(w/'backup-compatibility.private.json')and r['backupLockHeld']is True and r['result']=='FRESH_READONLY_BACKUP_PASS','actual_backup_binding')
    require(ack['result']=='OFFHOST_CUSTODY_VERIFIED'and ack['receiptSha256']==sha(i/'backup-result.private.json')and ack['dumpSha256']==r['dumpSha256']and ack['labObservedSha256']==sha(i/'lab-current.private.json'),'custody_bytes_or_lab_binding')
    require(lab['result']=='CERTIFIED_LAB_RETAINED_STOPPED_CONFIRMED'and lab['temporaryDatabaseRemoved']is False and lab['proofSha256']==sha(w/'original-restore-proof.private.json'),'retained_lab')
    require(sha(Path(r['remoteDirectory'])/'database.dump')==r['dumpSha256'],'remote_backup_integrity')
    check_current(p);return 'PRE_A_FRESH_SOURCE_CAPACITY_ROOT_RPO_CUSTODY_PASS'
if __name__=='__main__':print(verify(Path(sys.argv[1])))
