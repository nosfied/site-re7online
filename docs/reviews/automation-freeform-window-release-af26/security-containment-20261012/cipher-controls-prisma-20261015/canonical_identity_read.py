"""Canonical identity candidates, SELECT neighborhood only; never authorizes subject mutation."""
import hashlib,json,os,re,subprocess,sys
from pathlib import Path
APP=Path('/opt/re7online/site-re7online/apps/whatsapp-agent')
FIELDS=['id','clientId','tenantId','conversationId','contactId','contactChannelIdentityId','leadId','channel','provider','channelAccountId','waId','waIdCanonical','legacyWaId','externalUserHash','createdAt','updatedAt','lastInboundAt','lastOutboundAt','closedAt','deletedAt','anonymizedAt','status','mode','assignedUserId','assignedAt','handoffStatus','eventName']
def main(source,out):
 os.umask(0o077);q=Path(out);q.mkdir(mode=0o700);v=json.loads(Path(source).read_text());seeds=[x['metadata']for x in v['rows']if x['category']=='seed'];assert len(seeds)==2
 module=APP/'dist/crm/crmWhatsappIdentity.js';dependency=APP/'dist/utils/waid.js'
 text=module.read_text();requires=re.findall(r'require\([\'"]([^\'"]+)',text);assert set(requires)<={'node:crypto','../utils/waid.js'},'pure_helper_dependencies_changed'
 assert not re.findall(r'require\(',dependency.read_text()),'pure_normalizer_imports_changed'
 sources={str(p):hashlib.sha256(p.read_bytes()).hexdigest()for p in (module,dependency)}
 for p in (module,dependency):(q/(p.name+'.private')).write_bytes(p.read_bytes())
 code="const fs=require('fs'),m=require(process.argv[1]),v=JSON.parse(fs.readFileSync(0,'utf8')); const keys=m.buildCrmWhatsappIdentityCandidates(v.flatMap(s=>[s.waId,s.waIdCanonical,s.legacyWaId]));process.stdout.write(JSON.stringify({keys,hashes:[...new Set([...v.map(s=>s.externalUserHash).filter(Boolean),...keys.map(m.buildCrmWhatsappExternalUserHash)])]}));"
 r=subprocess.run(['node','-e',code,str(module)],input=json.dumps(seeds),text=True,capture_output=True,timeout=5);assert r.returncode==0,'pure_identity_helper_failed';keys=json.loads(r.stdout);(q/'candidates.private.json').write_text(r.stdout)
 def literal(s):assert isinstance(s,str)and '\x00'not in s;return "'"+s.replace("'","''")+"'"
 def arr(xs):return 'ARRAY['+','.join(map(literal,xs))+']::text[]'
 client=seeds[0]['clientId'];key=arr(keys['keys']);hashes=arr(keys['hashes']);rows=[]
 for table,field in [('Conversation','clientId'),('ConversationRuntimeState','clientId'),('Contact','clientId'),('ContactChannelIdentity','clientId'),('Lead','tenantId'),('InboundMessage','clientId'),('OutboundMessage','clientId'),('Event','clientId')]:
  rows.append("SELECT '"+table+"' category,j FROM(SELECT to_jsonb(r)j FROM \""+table+"\" r)q WHERE j->>'"+field+"'="+literal(client)+" AND(j->>'waId'=ANY("+key+")OR j->>'waIdCanonical'=ANY("+key+")OR j->>'legacyWaId'=ANY("+key+")OR j->>'externalUserHash'=ANY("+hashes+"))")
 sql="BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;SET LOCAL statement_timeout='15s';SET LOCAL lock_timeout='1s';WITH found AS("+' UNION ALL '.join(rows)+")SELECT jsonb_build_object('readOnly',current_setting('transaction_read_only'),'capturedUtc',transaction_timestamp(),'rows',coalesce(jsonb_agg(jsonb_build_object('category',category,'metadata',jsonb_build_object("+','.join("'"+f+"',j->'"+f+"'"for f in FIELDS)+"))),'[]'::jsonb))FROM found;ROLLBACK;"
 (q/'query.private.sql').write_text(sql)
 with(q/'rows.private.json').open('x')as o,(q/'stderr.private').open('x')as e:r=subprocess.run(['docker','exec','-i','wa-agent-postgres','psql','-X','-U','wa_agent','-d','whatsapp_agent','-Atq','-v','ON_ERROR_STOP=1'],input=sql,text=True,stdout=o,stderr=e,timeout=20)
 assert r.returncode==0,'canonical_neighbor_select_failed'
 z=json.loads((q/'rows.private.json').read_text());assert z['readOnly']=='on'
 counts={}
 for r in z['rows']:counts[r['category']]=counts.get(r['category'],0)+1
 (q/'receipt.private.json').write_text(json.dumps({'result':'CANONICAL_IDENTITY_NEIGHBORHOOD_SELECT_PASS','capturedUtc':z['capturedUtc'],'helperSources':sources,'counts':counts,'authorizesAnonymization':False}))
 print(json.dumps({'result':'CANONICAL_IDENTITY_NEIGHBORHOOD_SELECT_PASS','counts':counts,'retentionExecuted':False}))
if __name__=='__main__':main(*sys.argv[1:])
