"""Local-only capsule producer from actual read evidence, no credential values or VPS actions."""
import datetime,hashlib,json,os,sys
from pathlib import Path
from restore_deploy_cron import restricted_delta, POLICY, REVIEW
HERE=Path(__file__).resolve().parent

def digest(raw):return hashlib.sha256(raw).hexdigest()
def main():
    source=Path(sys.argv[1]); evidence=Path(sys.argv[2]);output=Path(sys.argv[3]);os.umask(0o077)
    if output.exists():raise RuntimeError('new_capsule_required')
    a=json.loads((evidence/'re7-scheduled-audit-20261015T104000Z/audit.private.json').read_text())
    env=json.loads((evidence/'env-compatibility.private.json').read_text());meta=json.loads((evidence/'env-metadata.private.json').read_text())
    before=(source/'window/deploy.crontab.before').read_bytes();current=(evidence/'re7-scheduled-audit-20261015T104000Z/crontab.stdout.private').read_bytes()
    assert current==(source/'window/deploy.crontab.window').read_bytes()
    assert digest((source/'preparation-review.sha256').read_bytes())==REVIEW
    changed=restricted_delta(before,current)
    system=(evidence/'re7-scheduled-audit-20261015T104000Z/system_cron.stdout.private').read_bytes()
    assert system==(source/'window/re7-converta-backup.before').read_bytes()
    files=[{k:v[k]for k in ('path','sha256','uid','mode')}for v in a['files']]
    dependencies=json.loads((evidence/'consumer-dependencies.private.json').read_text())
    assert dependencies['mutation'] is False and len(dependencies['files'])==6
    files += [{k:v[k]for k in ('path','sha256','uid','mode')}for v in dependencies['files']]
    files += [{'path':'/opt/re7online/site-re7online/apps/whatsapp-agent/.env','sha256':env['dotenvSha256'],'uid':meta['uid'],'mode':int(meta['modeOctal'],8)},
              {'path':'/usr/local/libexec/re7/incident-6683-window-control.py','sha256':'8de358fd60c6e7c880166651b45d7ebd60c8f9b102759ff7f7628796fda1b212','uid':0,'mode':0o644}]
    plan={'schema':1,'operation':'RESTORE_ONLY_SIX_ORIGINALLY_ACTIVE_DEPLOY_ENTRIES','capturedUtc':a['utc'],
          'preparedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'installedPolicySha256':POLICY,'reviewSha256':REVIEW,
          'beforeSha256':digest(before),'currentSha256':digest(current),'systemBeforeSha256':digest(system),
          'beforeHex':before.hex(),'currentHex':current.hex(),'changedLines':[x+1 for x in changed],
          'files':files,'evidenceDirectory':'apply-private','checkEvidenceDirectory':'check-private','inspectionEvidenceDirectory':'inspection-private',
          'databaseDotenvCompatibleWithNEWDB':env['database']['samePassword'],
          'dotenvUpdateAuthorized':False,'cipherWindowAuthorized':False,'jobsExecutedManually':False}
    output.mkdir(mode=0o700)
    (output/'recovery-plan.private.json').write_text(json.dumps(plan,sort_keys=True,indent=2)+'\n')
    for n in ('restore_deploy_cron.py','scheduled_controls.py'):(output/n).write_bytes((HERE/n).read_bytes())
    entries={f.name:digest(f.read_bytes())for f in output.iterdir()if f.is_file()}
    (output/'FILES.sha256').write_text(''.join(h+'  '+n+'\n'for n,h in sorted(entries.items())))
    (output/'lifecycle.private.json').write_text(json.dumps({'purpose':'restricted deploy scheduled-control restoration only','state':'PREPARED_NOT_APPLIED_NOT_TRANSFERRED','owner':'Deifson','dependencies':['v13 read-only controls and current NEWauth+NEWDB profiles','installed policy15b/helper8de'],'copiesJustification':'small independent recovery driver/input; no runtime/archive/database duplication','custodyRequired':True,'nextReview':'2026-10-21','retireOnlyAfter':'verified recovery receipt and private custody; no historical manifest edits'},indent=2))
    for f in output.iterdir():f.chmod(0o600)
    print(json.dumps({'result':'RESTRICTED_CRON_CAPSULE_LOCAL_FOR_REVIEW','planSha256':entries['recovery-plan.private.json'],'files':entries,'manifestSha256':digest((output/'FILES.sha256').read_bytes()),'productionEffects':False}))
if __name__=='__main__':main()
