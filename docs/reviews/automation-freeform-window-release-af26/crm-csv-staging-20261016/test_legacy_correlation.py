"""Canonical legacy wire IDs, tenant isolation and actual private metadata; no imports."""
import importlib.util,json,sys
from pathlib import Path
H=Path(__file__).resolve().parent;R=H.parents[3]
sys.path.insert(0,str(H.parent/'crm-csv-operational-20261016'))
s=importlib.util.spec_from_file_location('csv_legacy_reader_v2',H/'capture_imports_v2.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
op='11111111-1111-4111-8111-111111111111'
def row(event,request,tenant='synthetic-a',status=None):return {'id':event,'event':event,'request':request,'tenant':tenant,'status':status,'operation':None}
summary=row('crm.contact.import.summary','crm.contact.import.summary:'+op)
created=row('crm.contact.created','crm.contact.created:lead-id:'+op+':0123456789abcdef')
assert len(m.classify([summary,created]))==1 and m.classify([summary,created])[0]['state']=='COMPLETED'
other=dict(summary,tenant='synthetic-b');assert any(r['state']=='UNKNOWN'for r in m.classify([other,created]))
assert m.classify([created])[0]['state']=='UNKNOWN'
assert m.classify([summary,dict(summary,id='duplicate'),created])[0]['state']=='UNKNOWN'
bad=dict(created,request=created['request']+'extra');assert any(r['state']=='UNKNOWN'for r in m.classify([summary,bad]))
assert m.classify([row('crm.contact.import.summary',op)])[0]['state']=='UNKNOWN'
actual=json.loads((R/'local-evidence/crm-csv-staging-20261016/capture-vps.private.json').read_text())['importAudit']['rows']
result=m.classify(actual);assert len(result)==20 and all(r['state']=='COMPLETED'for r in result)
print(json.dumps({'result':'LEGACY_CSV_CANONICAL_CORRELATION_PASS','syntheticCases':6,'actualEventRows':len(actual),'actualOperations':len(result),'actualUnknown':sum(r['state']=='UNKNOWN'for r in result),'productionWrites':0,'unobservedLiveActivityProvenAbsent':False}))
