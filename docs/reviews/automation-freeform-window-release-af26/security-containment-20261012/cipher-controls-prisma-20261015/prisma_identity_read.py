"""Only SELECT in repeatable-read; private metadata, no bodies or secrets, no Prisma import."""
import datetime,hashlib,json,os,subprocess,sys,uuid
from pathlib import Path
SOURCE='/opt/re7online/site-re7online/apps/whatsapp-agent/src/privacy/privacyRetentionService.ts'
SOURCE_HASH='33d36d97e189442baa65a357544ef274d6ac31ce5cdf5a7b0ccd21cb72c14740'
def query(client):
 uuid.UUID(client)
 ctes=f'''WITH seed AS (SELECT c.*,r."retentionDays",transaction_timestamp()-make_interval(days=>r."retentionDays") cutoff FROM "Conversation" c JOIN "RetentionConfig" r ON r."clientId"=c."clientId" WHERE c."clientId"='{client}' AND c."deletedAt" IS NULL AND c."createdAt"<transaction_timestamp()-make_interval(days=>r."retentionDays") AND c."updatedAt"<transaction_timestamp()-make_interval(days=>r."retentionDays") AND (c."lastInboundAt" IS NULL OR c."lastInboundAt"<transaction_timestamp()-make_interval(days=>r."retentionDays")) AND (c."lastOutboundAt" IS NULL OR c."lastOutboundAt"<transaction_timestamp()-make_interval(days=>r."retentionDays"))), keys AS (SELECT DISTINCT v FROM seed,unnest(ARRAY["waId","waIdCanonical"])v WHERE v IS NOT NULL AND v<>''), lead_scope AS (SELECT l.* FROM "Lead" l WHERE l."tenantId"::text='{client}' AND (l."waId" IN(SELECT v FROM keys) OR l."waIdCanonical" IN(SELECT v FROM keys))), cci_scope AS (SELECT i.* FROM "ContactChannelIdentity" i WHERE i."clientId"::text='{client}' AND i."legacyWaId" IN(SELECT v FROM keys)), contact_scope AS (SELECT c.* FROM "Contact" c WHERE c."clientId"='{client}' AND (c."waId" IN(SELECT v FROM keys) OR c.id IN(SELECT "contactId" FROM cci_scope))), related_cci AS (SELECT i.* FROM "ContactChannelIdentity" i WHERE i."clientId"::text='{client}' AND (i.id IN(SELECT id FROM cci_scope) OR i."contactId" IN(SELECT id FROM contact_scope))), related_lead AS (SELECT l.* FROM "Lead" l WHERE l."tenantId"::text='{client}' AND (l.id IN(SELECT id FROM lead_scope) OR l."contactChannelIdentityId" IN(SELECT id FROM related_cci))), related_keys AS (SELECT v FROM keys UNION SELECT "waId" FROM related_lead UNION SELECT "waIdCanonical" FROM related_lead UNION SELECT "legacyWaId" FROM related_cci UNION SELECT "waId" FROM contact_scope), conv_scope AS (SELECT c.* FROM "Conversation" c WHERE c."clientId"='{client}' AND (c.id IN(SELECT id FROM seed) OR c."waId" IN(SELECT v FROM related_keys) OR c."waIdCanonical" IN(SELECT v FROM related_keys) OR c."externalUserHash" IN(SELECT "externalUserHash" FROM related_cci)))'''
 exact='(r."waId" IN(SELECT v FROM keys) OR r."waIdCanonical" IN(SELECT v FROM keys))'
 related='(r."waId" IN(SELECT v FROM related_keys) OR r."waIdCanonical" IN(SELECT v FROM related_keys))'
 specs=[('seed','SELECT to_jsonb(s) AS j,true affected FROM seed s'),
 ('conversations',f'''SELECT to_jsonb(r) j,(r.id IN(SELECT id FROM seed) OR {exact}) affected FROM conv_scope r'''),
 ('runtime',f'''SELECT to_jsonb(r) j,{exact} affected FROM "ConversationRuntimeState" r WHERE r."clientId"::text='{client}' AND {related}'''),
 ('messages',f'''SELECT to_jsonb(r) j,(r."conversationId"::text IN(SELECT id::text FROM seed) OR r."waId" IN(SELECT v FROM keys)) affected FROM "Message" r JOIN "Conversation" c ON c.id=r."conversationId" WHERE c."clientId"='{client}' AND (r."conversationId"::text IN(SELECT id::text FROM conv_scope) OR r."waId" IN(SELECT v FROM related_keys))'''),
 ('inbound',f'''SELECT to_jsonb(r) j,{exact} affected FROM "InboundMessage" r WHERE r."clientId"='{client}' AND {related}'''),
 ('outbound',f'''SELECT to_jsonb(r) j,{exact} affected FROM "OutboundMessage" r WHERE r."clientId"='{client}' AND {related}'''),
 ('contacts','SELECT to_jsonb(r) j,r."waId" IN(SELECT v FROM keys) affected FROM contact_scope r'),
 ('identities','SELECT to_jsonb(r) j,r.id IN(SELECT id FROM cci_scope) affected FROM related_cci r'),
 ('leads','SELECT to_jsonb(r) j,r.id IN(SELECT id FROM lead_scope) affected FROM related_lead r'),
 ('notes',f'''SELECT to_jsonb(r) j,r."leadId" IN(SELECT id FROM lead_scope) affected FROM "LeadNote" r WHERE r."tenantId"::text='{client}' AND r."leadId" IN(SELECT id FROM related_lead)'''),
 ('events',f'''SELECT to_jsonb(r) j,(r."eventName" NOT IN('conversation.deleted','conversation.anonymized','retention.executed','conversation.reactivated_after_retention','privacy.subject.anonymized') AND(r."conversationId"::text IN(SELECT id::text FROM seed) OR {exact})) affected FROM "Event" r WHERE r."clientId"='{client}' AND(r."conversationId"::text IN(SELECT id::text FROM conv_scope) OR {related})'''),
 ('metrics',f'''SELECT to_jsonb(r) j,false affected FROM "ConversationMetrics" r WHERE r."clientId"::text='{client}' AND r."conversationId"::text IN(SELECT id::text FROM conv_scope)''')]
 fields=['id','clientId','tenantId','conversationId','contactId','contactChannelIdentityId','leadId','channel','provider','channelAccountId','waId','waIdCanonical','legacyWaId','externalUserHash','createdAt','updatedAt','firstSeenAt','lastSeenAt','lastInboundAt','lastOutboundAt','closedAt','deletedAt','anonymizedAt','operationallyExcludedAt','status','mode','assignedUserId','assignedAt','departmentId','queueId','handoffStatus','eventName','retentionDays','cutoff']
 projection=','.join("'"+k+"',j->'"+k+"'"for k in fields)
 unions=["SELECT '"+name+"' category,jsonb_build_object("+projection+",'affectedByCurrentSelectors',affected) item FROM ("+s+") q"for name,s in specs]
 return "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL statement_timeout='20s'; SET LOCAL lock_timeout='1s'; "+ctes+", rows AS("+' UNION ALL '.join(unions)+") SELECT jsonb_build_object('readOnly',current_setting('transaction_read_only'),'capturedUtc',transaction_timestamp(),'rows',coalesce(jsonb_agg(jsonb_build_object('category',category,'metadata',item) ORDER BY category,item->>'id'),'[]'::jsonb)) FROM rows; ROLLBACK;"
def main(q,client):
 os.umask(0o077);q=Path(q);q.mkdir(mode=0o700)
 assert hashlib.sha256(Path(SOURCE).read_bytes()).hexdigest()==SOURCE_HASH,'effective_source_drift'
 sql=query(client);(q/'query.private.sql').write_text(sql)
 with(q/'rows.private.json').open('x')as o,(q/'stderr.private').open('x')as e:r=subprocess.run(['docker','exec','-i','wa-agent-postgres','psql','-X','-U','wa_agent','-d','whatsapp_agent','-Atq','-v','ON_ERROR_STOP=1'],input=sql,text=True,stdout=o,stderr=e,timeout=30)
 assert r.returncode==0,'readonly_query_failed'
 v=json.loads((q/'rows.private.json').read_text());assert v['readOnly']=='on'
 assert sum(x['category']=='seed'for x in v['rows'])==1,'seed_population_drift'
 summary={}
 for x in v['rows']:
  k=x['category'];s=summary.setdefault(k,{'related':0,'currentSelectorAffected':0});s['related']+=1;s['currentSelectorAffected']+=int(x['metadata']['affectedByCurrentSelectors'] is True)
 (q/'receipt.private.json').write_text(json.dumps({'result':'IDENTITY_SCOPE_SELECT_COMPLETE','capturedUtc':v['capturedUtc'],'sourceSha256':SOURCE_HASH,'querySha256':hashlib.sha256(sql.encode()).hexdigest(),'rowsSha256':hashlib.sha256((q/'rows.private.json').read_bytes()).hexdigest(),'summary':summary,'retentionExecuted':False,'scope':'exact runtime waId selectors plus Contact/CCI/Lead explicit relationship neighborhood; no inferred authority'}))
 print(json.dumps({'result':'IDENTITY_SCOPE_SELECT_COMPLETE','summary':summary,'sqlReadOnly':True,'retentionExecuted':False}))
if __name__=='__main__':main(*sys.argv[1:])
