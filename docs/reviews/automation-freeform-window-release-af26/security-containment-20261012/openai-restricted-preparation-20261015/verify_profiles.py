"""Read-only private local profile verification. No provider or deployment."""
import argparse,hashlib,json,stat,os
from pathlib import Path
from prepare_restricted import private,private_dir,sha,API,SOURCE_SHA

def verify(p):
 private_dir(p);index=json.loads(private(p/'profiles.sha256.private.json'))
 expected={'source-before.profile.private.json','return-before.profile.private.json','candidate.profile.private.json','return-after.profile.private.json','plan.private.json'}
 assert set(index)==expected,'profile_index_membership'
 raw={n:private(p/n)for n in index}
 assert all(sha(raw[n])==h for n,h in index.items()),'profile_hash_drift'
 assert sha(raw['source-before.profile.private.json'])==SOURCE_SHA,'source_drift'
 assert raw['source-before.profile.private.json']==raw['return-before.profile.private.json'],'before_return_drift'
 assert raw['candidate.profile.private.json']==raw['return-after.profile.private.json'],'after_return_drift'
 source=json.loads(raw['source-before.profile.private.json']);candidate=json.loads(raw['candidate.profile.private.json'])
 old=next(x for x in source['apps']if x['name']==API)['env']['OPENAI_API_KEY'];a=next(x for x in candidate['apps']if x['name']==API)
 assert a['env']['OPENAI_API_KEY']!=old,'replacement_not_distinct'
 a['env']['OPENAI_API_KEY']=old;assert candidate==source,'unrelated_field_changed'
 return {'result':'PRIVATE_PROFILES_VERIFIED_NOT_ACTIVATED','onlyApiOpenaiKeyChanged':True,'beforeAndAfterReturnsVerified':True,'allOtherFieldsPreserved':True,'providerCalled':False}
if __name__=='__main__':
 a=argparse.ArgumentParser();a.add_argument('--profiles',type=Path,required=True);args=a.parse_args()
 try:print(json.dumps(verify(args.profiles),sort_keys=True))
 except Exception:print('{"result":"PRIVATE_PROFILE_VERIFICATION_DENY"}');raise SystemExit(1)
