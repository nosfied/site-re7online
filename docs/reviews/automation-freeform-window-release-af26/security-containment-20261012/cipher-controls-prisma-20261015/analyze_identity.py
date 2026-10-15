"""Offline split of the retained SELECT by full identities and original cutoff, never suffixes."""
import datetime,json,os,sys
from pathlib import Path
def analyze(rows,prior,output):
 v=json.loads(Path(rows).read_text());p=json.loads(Path(prior).read_text());old=next(x for x in p['tenants']if x['eligible']);dt=lambda s:datetime.datetime.fromisoformat(s).replace(tzinfo=datetime.timezone.utc);cut=dt(old['cutoff']);result=[]
 for seed in [r['metadata']for r in v['rows']if r['category']=='seed']:
  keys={x for x in (seed['waId'],seed['waIdCanonical'])if x};leads={r['metadata']['id']for r in v['rows']if r['category']=='leads'and keys&{r['metadata']['waId'],r['metadata']['waIdCanonical']}};selected=[]
  for r in v['rows']:
   k=r['category'];m=r['metadata'];hit=bool(keys&{m['waId'],m['waIdCanonical']})
   if k=='messages':hit=m['conversationId']==seed['id']or m['waId']in keys
   elif k=='contacts':hit=m['waId']in keys
   elif k=='identities':hit=m['legacyWaId']in keys
   elif k=='notes':hit=m['leadId']in leads
   elif k=='events':hit=(hit or m['conversationId']==seed['id'])and m['eventName']not in ['conversation.deleted','conversation.anonymized','retention.executed','conversation.reactivated_after_retention','privacy.subject.anonymized']
   elif k=='metrics':hit=m['conversationId']==seed['id']
   elif k=='seed':hit=m['id']==seed['id']
   if hit:selected.append(r)
  original=all(seed[k]is None or dt(seed[k])<cut for k in ['createdAt','updatedAt','lastInboundAt','lastOutboundAt'])
  counts={}
  for r in selected:counts[r['category']]=counts.get(r['category'],0)+1
  result.append({'alias':'ORIGINAL'if original else'NEWLY_AGED','seed':seed,'counts':counts,'rows':selected,'eligibleAtPreviousCutoff':original})
 assert sum(x['eligibleAtPreviousCutoff']for x in result)==1,'original_seed_not_uniquely_reconstructed'
 os.umask(0o077)
 with Path(output).open('x')as f:json.dump({'capturedUtc':v['capturedUtc'],'originalCutoff':old['cutoff'],'seeds':result,'noAuthorizationInferred':True},f,indent=2)
 print(json.dumps({'result':'OFFLINE_EXACT_IDENTITY_CLASSIFICATION','originalSeeds':1,'newlyAgedSeeds':len(result)-1,'productionEffects':False}))
if __name__=='__main__':analyze(*sys.argv[1:])
