"""Offline proposals only. Reuse dated source captures; never certify live state.
Does not stage/install a file on VPS. Current canonical assembly remains mandatory.
"""
import copy,json,os,hashlib,sys
from pathlib import Path
from snapshot_capture import write,digest,private_directory,require
ROOT=Path.cwd();HERE=Path(__file__).resolve().parent
T=ROOT/'local-evidence/database-authorized-window-20261013T200200Z/final-generation-extracted/incident-6683-v4-security-database-final-v4-20261013T140000Z'
P='/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-security-cipher-snapshot-review-20261014'
OLD='9c7b44d58c96d0aa1dd9f6b7d790d810407e3ea364b01a748473c06928efff4c'

def prepare(out,package):
 out=private_directory(out);require(not list(out.iterdir()),'proposal_not_empty');package=private_directory(package)
 result=json.loads((package/'result.sanitized.json').read_text());require(result['fiveGatesFalse']and not result['executionAuthorized']and not result['windowReady'],'local_review_scope_denied')
 src=ROOT/'local-evidence/security-cipher-operational-20261014T180000Z/capture.private.json';capture=json.loads(src.read_text());samples=capture['contextObservation']['samples'];require(len(samples)==2 and all(s['complete']and not s['incomplete']for s in samples)and samples[0]['processes']==samples[1]['processes'],'dated_source_incomplete')
 require(digest(T/'window/privileged-policy.private.json')==OLD,'policy_source_drift')
 policy=copy.deepcopy(json.loads((T/'window/privileged-policy.private.json').read_text()));policy['preparation']=P
 policy['sourceProcesses']={n:{'pid':v['pid'],'ticks':v['ticks']}for n,v in samples[0]['processes'].items()}
 configs={mode:{a['name']:a for a in json.loads((package/mode/'candidate.config.private.json').read_text())['apps']}for mode in ['switch','return']}
 for mode in configs:
  for name in ['re7-whatsapp-agent','re7-whatsapp-web-worker']:
   cfg=configs[mode][name];entry=policy['targetProcesses'][mode][name];entry.update(cwd=cfg['cwd'],script=cfg['script'])
   if name=='re7-whatsapp-agent':entry['sha256']=digest(ROOT/'local-evidence/security-v3-runtime-20261014/candidate/dist/index.js')
 write(out/'privileged-policy.proposed.private.json',policy);new=digest(out/'privileged-policy.proposed.private.json')
 text=(T/'install-api-window-policy.sh').read_text();prior='093a04831663d5d348ea4d5546d3aedb7f37ba2d5b76a17352aef65e447310b7'
 text=text.replace(str(T.name),P.rsplit('/',1)[1]).replace('pre-security-database-final-v4-20261013T140000Z','pre-cipher-snapshot-review-20261014')
 text=text.replace(OLD,new).replace(prior,OLD).replace('for mode in switch return return-partial;','for mode in switch return return-partial return-before-commit;')
 # Retain canonical strict ecosystem/baseline gates. Never replace them with a
 # fabricated PASS from the local snapshot: absent assembly/certificates DENY.
 text=text.replace('python3 "$P/verify-package.py"', 'test -f "$P/window/sequencer-manifest.json"\npython3 "$P/verify-package.py"',1)
 file=out/'install-api-window-policy.PROPOSAL.sh';file.write_text(text);file.chmod(0o600)
 statement={'state':'OFFLINE_PROPOSALS_NOT_INSTALLABLE_NOT_AUTHORIZED','policySha256':new,'installerProposalSha256':digest(file),'sourcePolicySha256':OLD,'sourceCaptureSha256':digest(src),'sourceCaptureAtUtc':capture['atUtc'],'helperUnchanged':True,'sudoersUnchanged':True,'requiresCanonicalOperationalAssembly':True,'requiresFreshAuthorizedProductionSnapshot':True,'requiresFreshBackupLockMetadata':True,'requiresFreshSavedFallbackAndBaseline':True,'requiresFreshCasAndCapacityRpo':True,'consumedCertificatesReused':False,'currentSourceCertified':False,'pm2DaemonAndCronReferences':'dated canonical policy only; mandatory fresh equality checks','fourModes':result['modes'],'productionExecutionCommandsReleased':False}
 write(out/'proposal.sanitized.json',statement);print(json.dumps(statement))
if __name__=='__main__':prepare(sys.argv[1],sys.argv[2])
