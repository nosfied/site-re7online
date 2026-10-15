"""Offline restricted profile preparation; never calls issuer, PM2 or deployment helpers."""
import argparse,copy,datetime,hashlib,hmac,importlib.util,json,os,stat
from pathlib import Path
SOURCE_SHA='dffb3c6f8b5be260b42b4668a6dbae36d15df431cf29668f55ec43ea10f80724'
ADAPTER_SHA='def69035e838bc4209b283daea412160dfa13389b87497a53453986c7ed3315c'
API='re7-whatsapp-agent'
def sha(b):return hashlib.sha256(b).hexdigest()
def encoded(v):return(json.dumps(v,sort_keys=True,indent=2)+'\n').encode()
def private(p):
 s=p.lstat();assert stat.S_ISREG(s.st_mode)and not p.is_symlink()and s.st_nlink==1 and s.st_uid==os.getuid()and stat.S_IMODE(s.st_mode)==0o600,'private_input_invalid'
 return p.read_bytes()
def private_dir(p):
 s=p.lstat();assert stat.S_ISDIR(s.st_mode)and not p.is_symlink()and s.st_uid==os.getuid()and stat.S_IMODE(s.st_mode)==0o700,'private_directory_invalid'
def prepare(source_raw,owner,key_raw,adapter):
 assert sha(source_raw)==SOURCE_SHA,'attested_source_profile_drift'
 item=next(x for x in owner['items']if x['slot']=='OPENAI_API_KEY');context=item['ownerConfirmedIssuanceContext'];record=item['confirmedNewIssuance']
 assert record['originalCreationCopyAttestedByOwner']is True,'original_value_provenance_missing'
 assert record['organizationId']==context['organizationId']and record['projectId']==context['projectId'],'approved_project_mismatch'
 assert record['projectRelationship']=='SAME_ID_RENAMED'and record['previousDefaultProjectId']==record['projectId'],'project_change_requires_resource_billing_limits_review'
 assert record['permissions'].strip().lower()=='all','changed_permissions_require_endpoint_review'
 assert record['custodiedFileSha256']==sha(key_raw),'registered_value_changed'
 value=key_raw.decode().strip();assert len(value)>=16 and not any(x.isspace()for x in value),'private_value_format'
 checked=datetime.datetime.fromisoformat(record['recordCheckedUtc']);assert checked.tzinfo,'record_check_timezone_missing'
 if record.get('creationPrecision')=='date_only':
  assert record.get('createdUtc')is None and record.get('creationTimezone')is None,'invented_issuance_time'
  assert datetime.date.fromisoformat(record['createdDate'])<=checked.date(),'issuance_date_invalid'
 else:
  created=datetime.datetime.fromisoformat(record['createdUtc']);assert created.tzinfo and created<=checked+datetime.timedelta(minutes=5),'issuance_timestamp_invalid'
 assert record['keyId']and not record['keyId'].startswith('sk-'),'key_record_id_invalid'
 source=json.loads(source_raw);assert [x['name']for x in source['apps']if x['env'].get('OPENAI_API_KEY')]==[API],'configured_consumers_drift'
 issuance=encoded({'projectId':record['projectId'],'api_key':{'id':record['keyId'],'value':value}});observed=encoded({'projectId':record['projectId'],'api_key':{'id':record['keyId']},'revoked':False})
 provenance={'issuanceKind':'original-console-creation-custody','configuration':{'sha256':sha(source_raw),'source':'attested post-cipher v14 profile'},'issuance':{'sha256':sha(issuance),'source':'assembled from original value custody and explicit owner creation-copy attestation; not issuer API response'},'projectRecord':{'sha256':sha(observed),'source':'separately read console record reported privately by owner; no remote API verification'}}
 plan,candidate,after=adapter.plan(source_raw,issuance,observed,provenance,context['projectId'])
 restored=copy.deepcopy(candidate);api=next(x for x in restored['apps']if x['name']==API);old=next(x for x in source['apps']if x['name']==API)['env']['OPENAI_API_KEY'];assert not hmac.compare_digest(value,old)
 api['env']['OPENAI_API_KEY']=old;assert restored==source,'non_openai_field_changed';assert candidate==after
 plan.update(registeredMetadataSha256=sha(encoded(record)),onlyChangedRuntimeVariable='OPENAI_API_KEY',configuredConsumers=[API],protectedAllOtherFields=True,projectRelationship='SAME_ID_RENAMED',bindingEvidence='original value custody + owner attestation + console metadata; not provider authentication',oldConfiguredRecordBindingStillUnproven=True,activationAuthorized=False,providerCalled=False)
 return plan,candidate,after

def main(source,custody,out):
 os.umask(0o077);d=Path(custody);private_dir(d);out=Path(out);private_dir(out.parent);assert not out.exists()and not out.is_symlink(),'output_exists_no_replay'
 source_raw=private(Path(source));owner=json.loads(private(d/'OWNER_ACTIONS.private.json'));item=next(x for x in owner['items']if x['slot']=='OPENAI_API_KEY');key_raw=private(d/item['futureSecretCustodyFile'])
 path=Path(__file__).parent.parent/'remaining-v3-20261014/openai_substitute.py';assert sha(path.read_bytes())==ADAPTER_SHA,'canonical_adapter_drift';spec=importlib.util.spec_from_file_location('canonical_openai',path);adapter=importlib.util.module_from_spec(spec);spec.loader.exec_module(adapter)
 plan,candidate,after=prepare(source_raw,owner,key_raw,adapter)
 # All validation precedes creating an output directory or copying profiles.
 out.mkdir(mode=0o700)
 files={'source-before.profile.private.json':source_raw,'return-before.profile.private.json':source_raw,'candidate.profile.private.json':encoded(candidate),'return-after.profile.private.json':encoded(after),'plan.private.json':encoded(plan)}
 for name,raw in files.items():
  fd=os.open(out/name,os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_WRONLY,0o600)
  with os.fdopen(fd,'wb')as f:f.write(raw);f.flush();os.fsync(f.fileno())
 index={n:sha(raw)for n,raw in files.items()};(out/'profiles.sha256.private.json').write_bytes(encoded(index));assert all(sha(private(out/n))==h for n,h in index.items())
 result={'result':'RESTRICTED_OPENAI_PROFILES_PREPARED_NOT_ACTIVATED','configuredConsumers':[API],'onlyChangedVariable':'OPENAI_API_KEY','allOtherFieldsPreserved':True,'projectMatchesApproved':True,'projectRelationship':'SAME_ID_RENAMED','candidateEqualsPostActivationReturn':True,'issuerAuthenticationPerformed':False,'executionAuthorized':False,'sourceProfileSha256':sha(source_raw),'profilesIndexSha256':sha((out/'profiles.sha256.private.json').read_bytes())}
 (out/'result.sanitized.json').write_bytes(encoded(result));print(json.dumps(result,sort_keys=True))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--source-profile',required=True);p.add_argument('--custody',required=True);p.add_argument('--out',required=True);a=p.parse_args()
 try:main(a.source_profile,a.custody,a.out)
 except Exception as e:print(json.dumps({'result':'RESTRICTED_PREPARATION_DENY','errorClass':type(e).__name__,'reason':str(e)if isinstance(e,AssertionError)else'private_evidence_invalid','noProductionAction':True}));raise SystemExit(1)
