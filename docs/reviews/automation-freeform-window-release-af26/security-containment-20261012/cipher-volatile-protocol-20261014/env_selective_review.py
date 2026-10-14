"""Pure proposal renderer: no file application, dotenv execution or credential output.
Unknown variables, comments and non-selected lines remain byte-identical.
"""
import hashlib,re
ALLOWED_API={'ADMIN_TOKEN','APP_AUTH_SECRET','DATABASE_URL','WHATSAPP_WEB_WORKER_CONTROL_TOKEN'}
ALLOWED_WORKER=ALLOWED_API-{'ADMIN_TOKEN'}
ASSIGN=re.compile(r'^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=')
def propose(original,expected_hash,replacements,consumer,source_receipt_verified):
 if hashlib.sha256(original).hexdigest()!=expected_hash:raise RuntimeError('env_source_CAS_denied')
 if not source_receipt_verified:raise RuntimeError('current_sealed_source_unproven')
 allowed={'legacy-api':ALLOWED_API,'legacy-worker':ALLOWED_WORKER}.get(consumer)
 if allowed is None or not replacements or not set(replacements)<=allowed:raise RuntimeError('env_scope_denied')
 text=original.decode('utf8');lines=text.splitlines(keepends=True);seen={};changed=[]
 for i,line in enumerate(lines):
  m=ASSIGN.match(line)
  if m:
   key=m.group(1);seen.setdefault(key,[]).append(i)
 for key,value in replacements.items():
  if len(seen.get(key,[]))!=1:raise RuntimeError('env_assignment_missing_or_duplicate')
  # dotenv double-quoted syntax can reinterpret escapes; reject ambiguous values.
  if not isinstance(value,str) or any(c in value for c in '\\"\r\n\x00'):raise RuntimeError('env_value_encoding_denied')
  i=seen[key][0];end='\r\n'if lines[i].endswith('\r\n')else '\n'if lines[i].endswith('\n')else ''
  prefix='export ' if lines[i].startswith('export ')else ''
  lines[i]=prefix+key+'="'+value+'"'+end;changed.append(key)
 return ''.join(lines).encode(),{'consumer':consumer,'changedVariables':sorted(changed),'applyAuthorized':False,'restartPerformed':False,'effects':'Next dotenv consumers may regain SQL access. Review cron/tools separately before activation.'}
