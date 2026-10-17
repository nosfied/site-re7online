"""Sanitized reconciliation from legitimate pinned custody, without new observations."""
import json
from pathlib import Path
import contracts as fixed
import evidence as e

def analyze():
    v=e.recorded();before=v['before'];live=v['live'];profile=v['profile']
    cfg=next(a for a in profile['apps']if a['name']=='re7-admin-front')
    text=v['texts'][('read_text',f"/proc/{live['pid']}/environ")]
    osenv=dict(item.split('=',1)for item in text.split('\0')if '='in item)
    envelope=json.loads(osenv['pm2_env']);fields=[]
    for name in sorted(before['env']):
        fields.append({'name':name,'origin':'saved-dump.front.env; same key/value in serialized OS pm2_env.env and RPC pm2_env.env',
          'savedEqualsEnvelopeApplicationValue':name in envelope['env'] and before['env'][name]==envelope['env'][name],
          'savedEqualsRpcApplicationValue':name in live['pm2_env']['env'] and before['env'][name]==live['pm2_env']['env'][name],
          'osTopLevelComparison':'absent'if name not in osenv else'equal'if str(before['env'][name])==osenv[name]else'different',
          'individualOriginalAssignmentSource':'not established beyond preserved PM2/OS records; no inference from variable name'})
    System,Operations=fixed.config_consumers(v['pathClass']);op=Operations();op.d=System();old=e.source('old_contract')
    old_result='UNEXPECTED_PASS'
    try:old['compare_frontend'](live,before,op)
    except RuntimeError as exc:
        e.require(exc.args==('environment_drift',),'unexpected_old_denial');old_result='DENY_environment_drift'
    new=fixed.compare_frontend(live,before,op,profile)
    e.require(old_result=='DENY_environment_drift' and new['canonicalConfig'],'replay_not_conclusive')
    e.require(cfg['env']==osenv,'original_os_profile_diverged')
    e.require(all(f['savedEqualsEnvelopeApplicationValue'] and f['savedEqualsRpcApplicationValue']for f in fields),'application_projection_diverged')
    sources={}
    for name,(path,digest)in e.SOURCES.items():
        e.source(name);sources[name]={'path':path,'sha256':digest}
    for path in ['crm-csv-staging-20261016/capture_source.py','crm-csv-staging-20261016/bind_window_v2.py','crm-csv-operational-20261016/compose.py','v4-sequencer/sequencer.py','crm-csv-original-recovery-20261016/recover_original.py','preventive-api-frontend3227-prepared-20261010/verification-results.json','crm-csv-original-recovery-20261016/RECOVERY_COMPLETE.md']:
        sources[path]={'path':path,'sha256':e.sha((e.REVIEW/path).read_bytes())}
    return {'result':'INCORRECT_READER_ADAPTATION_DEMONSTRATED_OFFLINE','base':'f54691a6612c43087f8093f14768a5eaa0ff732f',
      'originalBacklog':'docs/BACKLOG_TECH.md#crm--importação-csv-com-resultado-desconhecido-na-interface-e-totais-ambíguos--10102026',
      'newProductionObservation':False,'recordedIntervalUtc':[v['observedStartUtc'],v['observedEndUtc']],
      'privateSources':{'capture':{'bytes':e.CAPTURE.stat().st_size,'sha256':e.CAPTURE_SHA},'acceptedRecoveryArchive':{'bytes':e.ARCHIVE.stat().st_size,'sha256':e.ARCHIVE_SHA},
       'preWindowDump':{'bytes':26270,'sha256':'c9c54c02b9694328a5aeaa4335efb88135f9bd948b4f786c8e9e4e851efd51e3'},
       'originalOsSourceProfile':{'bytes':15179,'sha256':'a062c7020353cb39b0578653ea51475f8e9f9f68a588d1c55eb87cbbd68b6b9e'}},
      'oldAdaptationResult':old_result,'correctedOfflineReplay':'CANONICAL_CONFIGURATION_ACCEPTED_FOR_RECORDED_BYTES_ONLY',
      'originalOsReferenceVariables':len(cfg['env']),'observedOsVariables':len(osenv),'originalOsReferenceExactlyEqualsObserved':cfg['env']==osenv,
      'applicationProjectionVariables':len(before['env']),'applicationProjectionExactlyEqualsEnvelopeAndRpc':before['env']==envelope['env']==live['pm2_env']['env'],
      'embeddedEnvelopePathsMatchRpc':all(envelope[k]==live['pm2_env'][k]for k in ('pm_cwd','pm_exec_path','exec_interpreter')),
      'applicationFieldProvenance':fields,'sourceCodeAndPriorEvidence':sources,
      'operationalDriftDemonstratedInObservedFrontendContract':False,'globalOperationalDriftExcluded':False,
      'priorProductionDenialReceiptUnchanged':True,'priorUninstrumentedDenialCauseStillUnknown':True,
      'freshnessNotRenewed':True,'twoFreshEnvironmentReadsClaimed':False,'operationalCertification':False,
      'notProven':['state after recorded interval','saved/fallback completion of denied collection','route/SQL/ownership','ELF operational closure/protected toolchain','current authority/pins/16 bindings','individual historical assignment of each PM2 variable beyond preserved records']}

if __name__=='__main__':
    try:
        result=analyze();p=Path(__file__).resolve().parent
        (p/'ANALYSIS.json').write_text(json.dumps(result,indent=2)+'\n')
        print(json.dumps({'result':result['result'],'osVariables':result['originalOsReferenceVariables'],'applicationFields':result['applicationProjectionVariables'],'secretValuesPrinted':False,'newObservation':False}))
    except Exception as exc:
        print(json.dumps({'result':'OFFLINE_ANALYSIS_DENY','errorClass':type(exc).__name__,'errno':getattr(exc,'errno',None)}));raise SystemExit(1)
