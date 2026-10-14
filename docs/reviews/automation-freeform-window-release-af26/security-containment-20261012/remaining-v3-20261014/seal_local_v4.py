"""New local review generation. Gates false; no install/apply/start CLI."""
import copy,hashlib,importlib.util,json,os,shutil,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[5];HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'docs/reviews/automation-freeform-window-release-af26/v4-sequencer'))
from ecosystem_contract import generate_mode
from cipher_v4 import API,WORKER,FRONT,MODES,KEYS,load_seal
from cipher_verify import verification_sql
from cipher_sql import guard_empty_families
spec=importlib.util.spec_from_file_location('retention',ROOT/'scripts/operational_preparers_v3.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);c=m.c

def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def write(p,v):
    with p.open('x')as f:json.dump(v,f,indent=2);f.write('\n')
    p.chmod(0o600)
def seal(out):
    out=Path(out).absolute();fd=c.reporter.private_output_directory(out)
    try:
        c.require(not list(out.iterdir()),'generation_not_empty')
        runtime=ROOT/'local-evidence/security-v3-runtime-20261014';artifact=runtime/'api-seed-epoch-v3.tar';c.require(sha(artifact)=='36f51ebef7bf74f6efc90088254b1a806f427ee4f614ce9e0802b37d281a80cb','runtime_revision_drift')
        source=ROOT/'local-evidence/retention-third-authorized-20261014T105622Z/current-postbank-source.config.private.json';c.require(sha(source)=='bce14f1895c53c0e378e558c9d78dd560b66d7450d1176265251e290833d4d33','source_configuration_drift')
        original=json.loads(source.read_text());old={a['name']:a for a in original['apps']}
        policy=ROOT/'local-evidence/security-v3-epoch-proof-20261014/historical-policy.proposed.private.json';c.require(sha(policy)=='95eda044e469fe458d07fbdf5ec416aea7861873550f7db2ec1c7f0127d43d62','policy_proposal_drift')
        plan_dir=ROOT/'local-evidence/security-channel-plan-final-review-20261014';plan=json.loads((plan_dir/'channel-plan.private.json').read_text());sql=plan_dir/'channel-apply.tenant-receipts-final.review-only.private.sql';c.require(sha(sql)=='e1aa19b468a59f078edf49fd995f525c5ed6f17f6a82228bb0b3eb2bc239dbcf','reviewed_sql_source_drift')
        from cipher_verify import digest
        ph=digest(plan);c.require(ph=='4abcbeb2b3136d823803d32a86b4271a4fba99eb6382574d0ec3edadad7916e0','cipher_plan_drift')
        readonly,_=verification_sql(plan,ph)
        # Existing proposal keys are reused; no newly generated secret/issuer call.
        proposed=json.loads((ROOT/'local-evidence/security-containment-20261012/package-v2/new-values.private.json').read_text());dedicated=json.loads((ROOT/'local-evidence/security-remaining-composition-v3-20261014/seed-write-key.proposed.private.json').read_text())['CAMPAIGN_SEED_SECRET'];escrow=json.loads((ROOT/'local-evidence/security-remaining-composition-v3-20261014/seed-historical-escrow.private.json').read_text())
        historical=escrow['CAMPAIGN_SEED_HISTORICAL_SECRET']
        # Budget before copying bulky SQL. No captured production capacity is fresh.
        v=os.statvfs(out);c.require(v.f_bavail*v.f_frsize>=8776581120,'local_budget_denied')
        window=out/'window';window.mkdir(mode=0o700)
        generation='/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-security-cipher-v3-review-20261014'
        target=copy.deepcopy(old);before=copy.deepcopy(old)
        for cfg in (target,before):
            cfg[API]['cwd']='/opt/re7online/releases/security-epoch-v3-review-20261014/apps/whatsapp-agent';cfg[API]['script']=cfg[API]['cwd']+'/dist/index.js'
            cfg[API]['env'].update(CAMPAIGN_BUILD_ID='seed-epoch-v3-36f51ebef7bf',CAMPAIGN_SEED_WRITE_EPOCH='seed-dedicated-20261014',CAMPAIGN_SEED_SECRET=dedicated,CAMPAIGN_SEED_HISTORICAL_SECRET=historical,CAMPAIGN_SEED_HISTORICAL_POLICY_FILE=generation+'/window/historical-population.private.json',CAMPAIGN_SEED_HISTORICAL_POLICY_SHA256=sha(policy))
        for name in (API,WORKER):
            for key in KEYS:
                if key in target[name]['env']:target[name]['env'][key]=proposed[key]
        consumer_before=[];consumer_after=[]
        for phase,cfg in [('before',before),('after',target)]:
            name='consumers-'+phase+'.config.private.json';write(window/name,{'apps':list(cfg.values())});(consumer_before if phase=='before'else consumer_after).append({'name':name,'sha256':sha(window/name)})
        for mode in MODES:
            folder=out/mode;folder.mkdir(mode=0o700);cfg=copy.deepcopy(before if mode=='return-before-commit'else target)
            if mode!='switch':cfg[API]['cwd']='/opt/re7online/releases/security-epoch-v3-compatible-review-20261014/apps/whatsapp-agent';cfg[API]['script']=cfg[API]['cwd']+'/dist/index.js'
            write(folder/'candidate.config.private.json',{'apps':list(cfg.values())});write(folder/'return.config.private.json',{'apps':list(old.values())});generate_mode(folder)
            write(folder/'execution-authorized.json',{'executionAuthorized':False})
        for src,name in [(plan_dir/'channel-plan.private.json','channel-plan.private.json'),(sql,'channel-apply.private.sql'),(policy,'historical-population.private.json')]:
            shutil.copyfile(src,window/name);(window/name).chmod(0o600)
        guarded=window/'channel-apply.private.sql';guarded.write_text(guard_empty_families(guarded.read_text()));guarded.chmod(0o600)
        f=window/'cipher-readonly.private.sql';f.write_text(readonly);f.chmod(0o600)
        for src,name in [(HERE/n,n)for n in ['cipher_v4.py','cipher_verify.py','cipher_consumers.py','cipher_sql.py']]+[(HERE.parent/'credential_boundary.py','credential_boundary.py'),(HERE.parent/'database_consumers.py','database_consumers.py'),(HERE.parent/'remaining-v2-20261014/channel_transaction.py','channel_transaction.py')]:
            shutil.copyfile(src,window/name);(window/name).chmod(0o600)
        canonical=ROOT/'local-evidence/database-authorized-window-20261013T200200Z/final-generation-extracted/incident-6683-v4-security-database-final-v4-20261013T140000Z/window/sequencer.py'
        write(window/'canonical-v4-reference.private.json',{'source':str(canonical),'sha256':sha(canonical),'reuse':'closed-baseline V4 protocol; source generation consumed, never execute it','newRootPolicyAndFreshOperationalBaselineRequired':True})
        consumers={'immutable':[{'path':str(source),'uid':os.getuid(),'mode':0o600,'sha256':sha(source)}],'before':consumer_before,'after':consumer_after,'modeBindings':{mode:sha(out/mode/'candidate.config.private.json')for mode in MODES}};write(window/'cipher-consumers.private.json',consumers)
        hook={'kind':'channel_cipher_with_opaque_historical_disposition','guardGeneration':38,'planHash':ph,'sqlSha256':sha(window/'channel-apply.private.sql'),'readonlySqlSha256':sha(f),'consumerPlanSha256':sha(window/'cipher-consumers.private.json'),'executionAuthorized':False};write(window/'cipher-hook.private.json',hook)
        manifest={'filesSha256':{p.name:sha(p)for p in window.iterdir()if p.is_file()},'modeFiles':{mode:{p.name:sha(p)for p in(out/mode).iterdir()if p.is_file()}for mode in MODES}}
        write(window/'cipher-adapter-manifest.private.json',manifest)
        write(window/'execution-gates.private.json',{k:False for k in ['ownerAuthorized','preflightReviewed','artifactsVerified','restoreVerified','discrepanciesResolved']})
        class Bridge:
            def __init__(self):self.root=out;self.window=window
            def expected_config(self,mode,name):return {a['name']:a for a in json.loads((out/mode/name).read_text())['apps']}
        load_seal(Bridge())
        result={'result':'FOUR_MODE_LOCAL_CIPHER_V4_REVIEW_PACKAGE_SEALED','artifactSha256':sha(artifact),'adapterManifestSha256':sha(window/'cipher-adapter-manifest.private.json'),'hookSha256':sha(window/'cipher-hook.private.json'),'planHash':ph,'sqlSha256':hook['sqlSha256'],'readonlySqlSha256':sha(f),'policyProposalSha256':sha(policy),'modes':list(MODES),'fiveGatesFalse':True,'executionAuthorized':False,'freshProductionBaselineRequired':True,'windowReady':False,'newAuthNewDbPreserved':True,'frontendUnchanged':True,'opaqueRetained':1,'convertedPlanned':10,'openaiSubstitutionIndependentAndNotIncluded':True}
        allocated=c.reporter.inventory([str(out)])['uniqueAllocatedBytes'];result['allocatedPackageBytes']=allocated
        write(out/'lifecycle.private.json',{'state':'REVIEW','responsible':'Deifson Oliveira','lastReview':'2026-10-14','nextReview':'2026-10-21','allocatedBytes':allocated,'custodyPending':True,'copyJustification':'separate immutable SQL and READ ONLY verify payloads for new per-mode-sealed review; artifact reused by hash, not recopied','dependencies':['NEWauth+NEWDB source configuration','attested dependency tree','immutable runtime artifact','historical escrow'],'classification':{'onHost':'only after approved inactive staging','archivable':'local rejected/intermediate drafts; no historical manifest edits'},'executionAuthorized':False})
        write(out/'result.sanitized.json',result);print(json.dumps(result))
    finally:os.close(fd)
if __name__=='__main__':seal(sys.argv[1])
