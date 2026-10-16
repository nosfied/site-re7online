"""Exact admission CLI on complete package. Clock/root/dump/OS observations injected."""
import datetime,importlib.util,json,os,shutil,sys,tempfile
from pathlib import Path
from unittest.mock import patch
P=Path(sys.argv[1]).resolve();sys.path[:0]=[str(P/'window'),str(P/'switch')]
import admit_gates as a,csv_contract as c,sequencer,pre_install as pi
cases=[]
for scenario in ('complete','bad_compiled_proof','missing_scope','wrong_root','wrong_review','expired_root'):
    with tempfile.TemporaryDirectory()as tmp:
        p=Path(tmp)/P.name;shutil.copytree(P,p);w=p/'window';i=w/'owner-evidence';i.mkdir(mode=0o700);q=Path(tmp)/'admission'
        r=c.read(w/'backup-compatibility.private.json');started=datetime.datetime.fromisoformat(r['startedUtc'])
        class Clock(datetime.datetime):
            @classmethod
            def now(cls,tz=None):return started+datetime.timedelta(seconds=601 if scenario=='expired_root'else 60)
        c.write(i/'root.private.json',{'result':'CSV_ROOT_SOURCE_PASS','files':[{'path':'/usr/local/libexec/re7/incident-6683-window-policy.json','sha256':c.POLICY_SOURCE},{'path':'/usr/local/libexec/re7/incident-6683-window-control.py','sha256':'8de358fd60c6e7c880166651b45d7ebd60c8f9b102759ff7f7628796fda1b212'},{'path':'/etc/sudoers.d/re7-incident-6683-window','sha256':'62b5a2ac1d56b013f6db4bb8180b0637b985786214f4bc3ce0e5f8d3f7c5111a'}],'mutation':False,'capturedUtc':started.isoformat()})
        c.write(i/'backup-result.private.json',r);c.write(i/'lab-current.private.json',{'result':'CERTIFIED_LAB_RETAINED_STOPPED_CONFIRMED','temporaryDatabaseRemoved':False,'proofSha256':c.sha(w/'original-restore-proof.private.json')})
        c.write(i/'custody-ack.private.json',{'result':'OFFHOST_CUSTODY_VERIFIED','dumpSha256':r['dumpSha256'],'receiptSha256':c.sha(i/'backup-result.private.json'),'labObservedSha256':c.sha(i/'lab-current.private.json')})
        c.write(w/'csv-known-imports.private.json',{'reviewedAgainstAuditAndKnownActivity':scenario!='missing_scope','operations':[]})
        if scenario=='bad_compiled_proof':
            f=w/'csv-compiled-proof.private.json';v=c.read(f);v['replayedWrites']=1;f.write_text(json.dumps(v))
        if scenario=='wrong_root':
            f=i/'root.private.json';v=c.read(f);v['files'][0]['sha256']='0'*64;f.write_text(json.dumps(v))
        review=c.sha(p/'preparation-review.sha256')if scenario!='wrong_review'else'0'*64
        class B:
            def __init__(self,p):pass
            def privileged(self,action):return json.dumps({'policySha256':c.sha(w/'privileged-policy.private.json'),'phase':None,'sourceProcessesAlive':True})if action=='inspect'else'{}'
        real_sha=c.sha
        def filesha(f):return r['dumpSha256']if str(f)==r['remoteDirectory']+'/database.dump'else real_sha(f)
        # Full concrete checker is exercised separately. The only mutated fixture
        # values here are deliberate negative inputs or OS/authority observations.
        if scenario in ('complete','expired_root'):
            with patch.object(pi,'check',lambda root,live:None),patch.object(pi,'check_current',lambda p:{}),patch.object(pi,'sha',filesha),patch.object(pi.datetime,'datetime',Clock):
                try:assert pi.verify(p)=='PRE_A_FRESH_SOURCE_CAPACITY_ROOT_RPO_CUSTODY_PASS';assert scenario=='complete'
                except RuntimeError:assert scenario=='expired_root'
            cases.append('pre_A_'+scenario)
        with patch.object(a,'check',lambda root,live:None),patch.object(a,'check_current',lambda p:{'OSObservationsInjected':True}),patch.object(a,'sha',filesha),patch.object(a.datetime,'datetime',Clock),patch.object(sequencer,'Bridge',B):
            try:a.admit(p,i,q,review,'1'*40);assert scenario=='complete'
            except RuntimeError:assert scenario!='complete';assert not q.exists()
        cases.append(scenario)
print(json.dumps({'result':'CSV_EXACT_ADMISSION_LOCAL_PASS','caseCount':len(cases),'cases':cases,'authorityAndOSFactsSynthetic':True,'productionGatesAdmitted':False}))
