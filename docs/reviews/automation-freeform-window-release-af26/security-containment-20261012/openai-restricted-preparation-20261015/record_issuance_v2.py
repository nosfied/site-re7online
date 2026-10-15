"""Owner-local metadata intake. No credential creation, provider call or activation."""
import argparse,copy,datetime,getpass,hashlib,json,os,stat,uuid
from pathlib import Path

def sha(raw):return hashlib.sha256(raw).hexdigest()
def private_file(path):
 s=path.lstat();assert stat.S_ISREG(s.st_mode)and not path.is_symlink()and s.st_nlink==1 and s.st_uid==os.getuid()and stat.S_IMODE(s.st_mode)==0o600,'private_file_owner_mode_type'
 return path.read_bytes()
def write_once(p,raw):
 fd=os.open(p,os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_WRONLY,0o600)
 with os.fdopen(fd,'wb')as f:f.write(raw);f.flush();os.fsync(f.fileno())
def encode(v):return(json.dumps(v,sort_keys=True,indent=2)+'\n').encode()
def parse_creation(created):
 import re
 match=re.fullmatch(r'(\d{1,2}) de out\.? de (\d{4})',created.strip(),re.IGNORECASE)
 if match:created=f'{match[2]}-10-{int(match[1]):02d}'
 if re.fullmatch(r'\d{4}-\d{2}-\d{2}',created):
  day=datetime.date.fromisoformat(created)
  assert day<=datetime.datetime.now(datetime.timezone.utc).date(),'issuance_date_in_future'
  return {'createdDate':day.isoformat(),'createdUtc':None,'creationPrecision':'date_only','creationTimezone':None}
 when=datetime.datetime.fromisoformat(created.replace('Z','+00:00'))
 assert when.tzinfo is not None,'issuance_timezone_missing'
 assert when<=datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(minutes=5),'issuance_time_in_future'
 return {'createdUtc':when.astimezone(datetime.timezone.utc).isoformat(),'creationPrecision':'timestamp_with_timezone'}
def collect(custody,ask=getpass.getpass):
 os.umask(0o077);d=Path(custody);s=d.lstat();assert stat.S_ISDIR(s.st_mode)and not d.is_symlink()and s.st_uid==os.getuid()and stat.S_IMODE(s.st_mode)==0o700,'private_directory_owner_mode'
 owner=d/'OWNER_ACTIONS.private.json';before=private_file(owner);v=json.loads(before);item=next(x for x in v['items']if x['slot']=='OPENAI_API_KEY');approved=item['ownerConfirmedIssuanceContext']
 key=d/item['futureSecretCustodyFile'];raw=private_file(key);assert len(raw.strip())>=16 and not any(c in raw.strip()for c in b' \t\r\n'),'custodied_value_format'
 def field(prompt):
  x=ask(prompt).strip();assert x and not x.startswith('sk-')and '\n'not in x and '\r'not in x,'missing_or_secret_in_metadata';return x
 name=field('Nome exato da nova chave no console (oculto): ')
 keyid=field('Key ID da nova chave, nunca o valor sk- (oculto): ')
 created=field('Criacao exibida: data AAAA-MM-DD ou timestamp com fuso (oculto): ')
 creation=parse_creation(created)
 permissions=field('Permissoes exatas: All / Restricted / Read Only (oculto): ')
 org=field('Organization ID do registro no console (oculto): ')
 project=field('Project ID atual Converta no console (oculto): ')
 previous=field('Project ID do mesmo projeto antes chamado Default (oculto): ')
 assert org==approved['organizationId']and project==approved['projectId'],'approved_organization_project_mismatch'
 assert field('O valor guardado foi copiado da emissao DESTE registro? Digite CONFIRMO (oculto): ')=='CONFIRMO','original_creation_copy_not_attested'
 now=datetime.datetime.now(datetime.timezone.utc).isoformat();relation='SAME_ID_RENAMED'if previous==project else'DIFFERENT_PROJECT'
 record={'name':name,'keyId':keyid,**creation,'permissions':permissions,'organizationName':approved['organizationName'],'organizationId':org,'projectName':approved['projectName'],'projectId':project,'previousDefaultProjectId':previous,'projectRelationship':relation,'recordCheckedUtc':now,'originalCreationCopyAttestedByOwner':True,'custodiedValueFile':key.name,'custodiedFileSha256':sha(raw),'evidenceMethod':'owner attests original creation copy and separately reads console record; no provider introspection','providerCallExecuted':False,'activationAuthorized':False,'oldRevocationAuthorized':False}
 token=uuid.uuid4().hex;receipt=d/('OPENAI_ISSUANCE_REGISTRATION.'+token+'.private.json');write_once(receipt,encode(record))
 write_once(d/('OWNER_ACTIONS.before-issuance-'+token+'.private.json'),before)
 item['confirmedNewIssuance']=record;item['newCredentialCreated']=True;item['newCredentialCreatedEvidence']='owner confirmation and private custody; not an API creation by agent'
 expected=copy.deepcopy(v);entry=next(x for x in expected['items']if x['slot']=='OPENAI_API_KEY');entry.pop('confirmedNewIssuance');entry.pop('newCredentialCreatedEvidence');entry['newCredentialCreated']=next(x for x in json.loads(before)['items']if x['slot']=='OPENAI_API_KEY')['newCredentialCreated'];assert expected==json.loads(before),'unrelated_field_change'
 assert private_file(owner)==before,'concurrent_owner_file_change'
 tmp=d/('OWNER_ACTIONS.update-issuance-'+token+'.tmp');write_once(tmp,encode(v));os.replace(tmp,owner)
 write_once(d/('OWNER_ACTIONS.update-issuance-'+token+'.receipt.private.json'),encode({'beforeSha256':sha(before),'afterSha256':sha(private_file(owner)),'issuanceRecord':receipt.name,'issuanceRecordSha256':sha(private_file(receipt)),'priorIndexPreserved':True,'otherFieldsPreserved':True}))
 return{'result':'PRIVATE_ISSUANCE_METADATA_RECORDED','projectMatchesApprovedContext':True,'projectRelationship':relation,'issuanceTimePrecision':creation['creationPrecision'],'permissionReviewRequired':permissions.lower()!='all','identifiersPrinted':False,'credentialValuePrinted':False,'activationExecuted':False,'revocationExecuted':False}
if __name__=='__main__':
 a=argparse.ArgumentParser();a.add_argument('--custody',type=Path,required=True);args=a.parse_args()
 fd=os.open('/dev/tty',os.O_RDONLY);assert os.isatty(fd);os.close(fd)
 try:print(json.dumps(collect(args.custody),sort_keys=True))
 except Exception as e:print(json.dumps({'result':'METADATA_REGISTRATION_DENY','errorClass':type(e).__name__,'reason':str(e)if isinstance(e,AssertionError)else'check_metadata_format_without_sharing_values','noProviderOrProductionAction':True}));raise SystemExit(1)
