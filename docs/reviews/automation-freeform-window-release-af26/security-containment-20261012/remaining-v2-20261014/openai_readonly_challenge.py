"""Proposed future one-shot GET /v1/models. No secret/header/body serialization.
Does NOT attest an api_key_id from HTTP200. Requires issuer correlation afterward.
Not executed during local preparation. No environment key/proxy inheritance.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import ssl
import stat
import urllib.error
import urllib.request
import uuid

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):raise ValueError('issuer_redirect_denied')
def run(source,expected,out,authorized=False,opener=None):
    if not authorized:raise ValueError('explicit_readonly_challenge_authorization_required')
    from importlib.util import spec_from_file_location,module_from_spec
    root=Path(__file__).resolve().parents[5];spec=spec_from_file_location('private_output',root/'scripts/operational-retention-report.py');m=module_from_spec(spec);spec.loader.exec_module(m)
    directory=m.private_output_directory(out)
    try:
        for name in ['challenge.intent.private.json','challenge.receipt.private.json']:m.ensure_new_output(directory,name)
        p=Path(source)
        if p.resolve()!=p or p.is_symlink():raise ValueError('private_source_symlink_denied')
        st=p.stat()
        if not stat.S_ISREG(st.st_mode)or st.st_uid!=os.getuid()or stat.S_IMODE(st.st_mode)!=0o600:raise ValueError('private_source_owner_mode_denied')
        raw=p.read_bytes()
        if hashlib.sha256(raw).hexdigest()!=expected:raise ValueError('source_hash_drift')
        value=json.loads(raw);api=next(a for a in value['apps']if a['name']=='re7-whatsapp-agent');key=api['env']['OPENAI_API_KEY']
        if not isinstance(key,str)or not key:raise ValueError('legitimate_key_absent')
        nonce=str(uuid.uuid4());start=datetime.datetime.now(datetime.timezone.utc).isoformat()
        def write(name,value):
            fd=os.open(name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=directory)
            with os.fdopen(fd,'w')as f:json.dump(value,f);f.write('\n');f.flush();os.fsync(f.fileno())
        write('challenge.intent.private.json',{'atUtc':start,'clientRequestId':nonce,'sourceSha256':expected,'method':'GET','issuer':'api.openai.com','path':'/v1/models'})
        request=urllib.request.Request('https://api.openai.com/v1/models',method='GET',headers={'Authorization':'Bearer '+key,'X-Client-Request-Id':nonce})
        opener=opener or urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect(),urllib.request.HTTPSHandler(context=ssl.create_default_context()))
        try:
            with opener.open(request,timeout=10)as response:
                status=response.status;headers=response.headers;response.read(32768) # discard bounded public model metadata
            result='READONLY_AUTHENTICATION_CAPTURED_RECORD_BINDING_PENDING'
        except urllib.error.HTTPError as e:
            status=e.code;headers=e.headers;result='READONLY_CHALLENGE_HTTP_DENY_BINDING_UNKNOWN'
        except Exception as e:
            status=None;headers={};result='READONLY_CHALLENGE_UNCERTAIN_NO_RETRY'
        receipt={'result':result,'startedAtUtc':start,'finishedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'clientRequestId':nonce,'httpStatus':status,
                 'requestId':headers.get('x-request-id'),'reportedOrganization':headers.get('openai-organization'),'reportedProject':headers.get('openai-project'),
                 'apiKeyIdAttested':False,'requestSecretOrHeadersSerialized':False,'responseBodySerialized':False,'messagesGenerated':0,'revocationAuthorized':False}
        write('challenge.receipt.private.json',receipt)
        return {'result':result,'httpStatus':status,'requestIdPresent':bool(receipt['requestId']),'apiKeyIdAttested':False,'revocationAuthorized':False}
    finally:os.close(directory)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--source-sha256',required=True);p.add_argument('--output',required=True);p.add_argument('--owner-authorized-readonly-challenge',action='store_true');a=p.parse_args()
    try:print(json.dumps(run(a.source,a.source_sha256,a.output,a.owner_authorized_readonly_challenge)))
    except Exception as e:print(json.dumps({'result':'CHALLENGE_DENY','errorClass':type(e).__name__,'automaticRetry':False}));raise SystemExit(1)
