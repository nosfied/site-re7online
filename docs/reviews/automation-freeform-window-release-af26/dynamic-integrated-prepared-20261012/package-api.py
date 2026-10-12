"""Produce an allowlisted overlay on the attested active API, never export branch dist."""
import hashlib,json,subprocess,tarfile,sys
from pathlib import Path
repo,compiled,attested,out=[Path(x).resolve() for x in sys.argv[1:]]
assert not out.exists();out.mkdir(mode=0o700)
modules=['campaigns/campaignEligibility','campaigns/campaignRecipientResultTruth','http/routes','campaigns/campaignExecutionPresentation']
files=[]
for module in modules:
 for kind,ext in [('src','ts'),('dist','js')]:
  rel=f'{kind}/{module}.{ext}';target=repo/'apps/whatsapp-agent'/rel if kind=='src' else compiled/f'{module}.js'
  origin=None
  if module!='campaigns/campaignExecutionPresentation':
   raw=subprocess.check_output(['git','-C',str(repo),'show','20788059:apps/whatsapp-agent/'+rel]) if kind=='src' else (attested/rel).read_bytes()
   origin=hashlib.sha256(raw).hexdigest()
  files.append({'path':rel,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'bytes':target.stat().st_size,'originSha256':origin})
with tarfile.open(out/'api-overlay.tar','w') as tar:
 for f in files:
  p=repo/'apps/whatsapp-agent'/f['path'] if f['path'].startswith('src/') else compiled/f['path'].removeprefix('dist/')
  tar.add(p,arcname='apps/whatsapp-agent/'+f['path'])
manifest={'baseRelease':'campaign-result-truth-2ed9dccc-20261011T184000Z','baseSource':'207880593e6f32a1628df0a15df2b1fa80b49e4e','node':'20.20.0','files':files,'tarSha256':hashlib.sha256((out/'api-overlay.tar').read_bytes()).hexdigest(),'tarBytes':(out/'api-overlay.tar').stat().st_size,'unchanged':['acceptedResult','webhook','worker-afbb','schema','dependencies','auth'],'notDeployed':True}
(out/'overlay-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'tarSha256':manifest['tarSha256'],'bytes':manifest['tarBytes'],'files':len(files),'runtime':[x['path']for x in files if x['path'].startswith('dist/')]}))
