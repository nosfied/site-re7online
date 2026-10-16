"""Real complete capture/profile inputs; ONLY freshness/OS facts are synthetic."""
import copy,datetime,importlib.util,json,os,sys,tempfile
from pathlib import Path
P=Path(sys.argv[1]).resolve();HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[3]
sys.path[:0]=[str(HERE),str(P/'window'),str(P/'switch')]
import bind_window
capture=json.loads((ROOT/'local-evidence/openai-operational-20261015/capture-v3.private.json').read_text())
capture['capturedUtc']=datetime.datetime.now(datetime.timezone.utc).isoformat()
event={'path':'/opt/re7online/site-re7online/apps/whatsapp-agent/src/events/eventRetentionPolicy.ts','uid':os.getuid(),'mode':0o644,'beforeSha256':'b22246be4ede437d647c2a7cfc7492c823bea072de9d22fa09fe75fb6be2e659','targetSha256':'03791f05f68575a86bbeddd491a619adeddecf7102ed8d3000df51ceb217aad4'}
event.update(referenceScanComplete=True,unknownConsumers=[],consumers=[{'path':'/opt/re7online/site-re7online/apps/whatsapp-agent/scripts/'+n,'uid':os.getuid(),'mode':0o644,'sha256':'a'*64,'importsCanonicalPolicy':True}for n in ('events-retention.ts','storage-report.ts')])
cases=[]
for scenario in ('complete','stale','low_capacity','source_drift','event_drift','scope_missing','consumer_incomplete'):
    with tempfile.TemporaryDirectory()as tmp:
        d=Path(tmp);d.chmod(0o700);v=copy.deepcopy(capture);e=copy.deepcopy(event);k={'reviewedAgainstAuditAndKnownActivity':True,'operations':[]}
        if scenario=='stale':v['capturedUtc']='2020-01-01T00:00:00+00:00'
        if scenario=='low_capacity':v['minimumAvailableBytes']=0
        if scenario=='source_drift':v['sourceProfile']['apps'][0]['cwd']+='changed'
        if scenario=='consumer_incomplete':e['referenceScanComplete']=False
        if scenario=='event_drift':e['beforeSha256']='0'*64
        if scenario=='scope_missing':k['reviewedAgainstAuditAndKnownActivity']=False
        for n,value in [('capture',v),('event',e),('known',k)]:
            f=d/(n+'.private.json');f.write_text(json.dumps(value));f.chmod(0o600)
        out=d/'incident-csv-window-synthetic-test'
        try:
            r=bind_window.bind(P,d/'capture.private.json',d/'event.private.json',d/'known.private.json',out)
            assert scenario=='complete'and r['result']=='CSV_WINDOW_BOUND_NOT_ADMITTED'
            assert (out/'execution-authorized').read_text().strip()=='false'
        except RuntimeError:
            assert scenario!='complete';assert not out.exists(),'DENY must precede copy'
        cases.append(scenario)
print(json.dumps({'result':'CSV_EXPLICIT_BINDING_LOCAL_PASS','caseCount':len(cases),'cases':cases,'freshnessIsSynthetic':True,'currentProductionReadinessCertified':False}))
