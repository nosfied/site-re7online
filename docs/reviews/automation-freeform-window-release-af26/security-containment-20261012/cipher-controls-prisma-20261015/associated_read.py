"""SELECT supplements for preserved FK-related objects, never a retention executor."""
import json,os,re,subprocess,sys
from pathlib import Path
def main(source,out):
 os.umask(0o077);v=json.loads(Path(source).read_text());q=Path(out);q.mkdir(mode=0o700)
 rows=v['rows'];seeds=[x['metadata']for x in rows if x['category']=='seed'];assert len(seeds)==2,'captured_seed_count_differs'
 client=seeds[0]['clientId'];assert all(s['clientId']==client for s in seeds)
 refs={name:[x['metadata']['id']for x in rows if x['category']==cat]for name,cat in [('conversationId','conversations'),('leadId','leads'),('contactId','contacts')]}
 # IDs come solely from the retained SELECT capture; safe literals, never browser input.
 def lit(s):assert type(s)is str and re.fullmatch(r'[a-zA-Z0-9_:@.+-]{1,160}',s);return "'"+s+"'"
 terms=["j->>'"+key+"' IN("+','.join(map(lit,ids))+")"for key,ids in refs.items()if ids]
 tables=['ContactConsent','Appointment','SatisfactionSurvey','SatisfactionResponse']
 selects=[]
 for table in tables:
  selects.append("SELECT '"+table+"' category,j FROM(SELECT to_jsonb(r) j FROM \""+table+"\" r)q WHERE j->>'clientId'="+lit(client)+" AND("+' OR '.join(terms)+")")
 runtime=[x['metadata']['id']for x in rows if x['category']=='runtime']
 selects.append('SELECT \'ConversationAssignment\' category,j FROM(SELECT to_jsonb(r) j FROM "ConversationAssignment" r)q WHERE j->>\'conversationId\' IN('+','.join(map(lit,runtime))+')')
 fields=['id','clientId','contactId','leadId','conversationId','createdAt','updatedAt','assignedAt','endedAt','releasedAt','closedAt','status','acceptedAt','revokedAt','startsAt','endsAt','sentAt','answeredAt']
 sql="BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;SET LOCAL statement_timeout='10s';SET LOCAL lock_timeout='1s';WITH direct AS("+' UNION ALL '.join(selects)+"),reminders AS(SELECT 'AppointmentReminder' category,to_jsonb(r) j FROM \"AppointmentReminder\" r WHERE r.\"appointmentId\" IN(SELECT j->>'id' FROM direct WHERE category='Appointment')),all_rows AS(SELECT * FROM direct UNION ALL SELECT * FROM reminders)SELECT jsonb_build_object('readOnly',current_setting('transaction_read_only'),'capturedUtc',transaction_timestamp(),'rows',coalesce(jsonb_agg(jsonb_build_object('category',category,'metadata',jsonb_build_object("+','.join("'"+f+"',j->'"+f+"'"for f in fields)+"))), '[]'::jsonb))FROM all_rows;ROLLBACK;"
 (q/'query.private.sql').write_text(sql)
 with(q/'rows.private.json').open('x')as o,(q/'stderr.private').open('x')as e:r=subprocess.run(['docker','exec','-i','wa-agent-postgres','psql','-X','-U','wa_agent','-d','whatsapp_agent','-Atq','-v','ON_ERROR_STOP=1'],input=sql,text=True,stdout=o,stderr=e,timeout=20)
 assert r.returncode==0,'related_select_failed'
 result=json.loads((q/'rows.private.json').read_text());assert result['readOnly']=='on'
 print(json.dumps({'result':'PRESERVED_RELATION_SELECT_PASS','relatedRows':len(result['rows']),'sqlReadOnly':True,'retentionExecuted':False}))
if __name__=='__main__':main(*sys.argv[1:])
