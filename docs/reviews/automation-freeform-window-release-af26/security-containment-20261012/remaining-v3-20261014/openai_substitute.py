"""Offline future substitution plan. No issuer call, creation or revocation.
Old-key issuer identity is not a prerequisite for preparing a known substitute.
"""
import copy,hashlib,hmac,json
PRESERVE=('APP_AUTH_SECRET','ADMIN_TOKEN','WHATSAPP_WEB_WORKER_CONTROL_TOKEN','DATABASE_URL')
def sha(b):return hashlib.sha256(b).hexdigest()
def plan(source_raw,issuance_raw,record_raw,provenance,project_id):
    if not project_id:raise ValueError('known_project_id_required')
    for role,raw in [('configuration',source_raw),('issuance',issuance_raw),('projectRecord',record_raw)]:
        if provenance.get(role,{}).get('sha256')!=sha(raw)or not provenance[role].get('source'):raise ValueError('private_provenance_hash_required')
    if provenance.get('issuanceKind')not in ('original-console-creation-custody','original-service-account-response'):raise ValueError('known_substitute_issuance_required')
    source=json.loads(source_raw);issuance=json.loads(issuance_raw);record=json.loads(record_raw)
    new=issuance['api_key'];value=new.get('value')
    if issuance['projectId']!=project_id or record['projectId']!=project_id or new['id']!=record['api_key']['id']or record.get('revoked')is not False:raise ValueError('substitute_project_record_mismatch')
    if not isinstance(value,str)or len(value)<16:raise ValueError('substitute_complete_value_missing')
    api=next(a for a in source['apps']if a['name']=='re7-whatsapp-agent');old=api['env']['OPENAI_API_KEY']
    if hmac.compare_digest(old,value):raise ValueError('substitute_must_be_distinct')
    candidate=copy.deepcopy(source);consumers=[]
    for app in candidate['apps']:
        configured=app.get('env',{}).get('OPENAI_API_KEY')
        if configured:
            if not hmac.compare_digest(configured,old):raise ValueError('configured_consumer_key_diverges_inventory')
            consumers.append(app['name']);app['env']['OPENAI_API_KEY']=value
    # All post-activation returns keep the known substitute. No revoke authority
    # is inferred from replacing a secret in these consumers.
    result={'kind':'known_openai_substitute','knownProjectId':project_id,'knownKeyId':new['id'],'issuanceSha256':sha(issuance_raw),'recordSha256':sha(record_raw),'sourceConfigSha256':sha(source_raw),'configuredConsumers':consumers,'oldRecordBindingRequiredForSubstitution':False,'oldRevocationAuthorized':False,'messagesGenerated':0,'executionAuthorized':False,'savedFallbackMustUseSubstitute':True}
    return result,candidate,copy.deepcopy(candidate)
