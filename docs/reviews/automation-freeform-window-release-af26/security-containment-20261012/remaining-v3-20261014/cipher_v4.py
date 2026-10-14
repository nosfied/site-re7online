"""Local V4 adapter: same canonical start/exit/ownership protocol, cipher boundary.
No production CLI; operator inspection never applies SQL or starts a process.
"""
import hashlib,json,os,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from credential_boundary import CredentialBoundary,VERIFIED

API='re7-whatsapp-agent';WORKER='re7-whatsapp-web-worker';FRONT='re7-admin-front'
MODES=('switch','return','return-partial','return-before-commit')
KEYS=('CHANNEL_ACCOUNT_SECRET_KEY','MFA_SECRET_ENCRYPTION_KEY','WEBHOOK_SECRET_ENCRYPTION_KEY')
PRESERVE=('APP_AUTH_SECRET','ADMIN_TOKEN','WHATSAPP_WEB_WORKER_CONTROL_TOKEN','DATABASE_URL')
def load_seal(bridge):
    window=bridge.window;file=window/'cipher-hook.private.json'
    boundary=CredentialBoundary(window)
    hook=boundary.safe_read(file);manifest=boundary.safe_read(window/'cipher-adapter-manifest.private.json')
    for name,sha in manifest['filesSha256'].items():
        target=window/name
        if target.parent!=window or hashlib.sha256(target.read_bytes()).hexdigest()!=sha:raise RuntimeError('cipher_adapter_manifest_drift')
    if hook['kind']!='channel_cipher_with_opaque_historical_disposition' or hook['guardGeneration']!=38:raise RuntimeError('cipher_hook_scope_drift')
    planfile=window/'channel-plan.private.json';plan=boundary.safe_read(planfile)
    from cipher_verify import digest
    if digest(plan)!=hook['planHash']:raise RuntimeError('cipher_plan_drift')
    for mode in MODES:
        for name,sha in manifest['modeFiles'][mode].items():
            p=bridge.root/mode/name
            if Path(name).name!=name or p.resolve()!=p.absolute()or hashlib.sha256(p.read_bytes()).hexdigest()!=sha:raise RuntimeError('cipher_mode_manifest_drift')
            boundary.safe_read(p) if name.endswith('.json')else None
    old=bridge.expected_config('switch','return.config.private.json')
    target=bridge.expected_config('switch','candidate.config.private.json')
    for mode in MODES:
        cfg=bridge.expected_config(mode,'candidate.config.private.json')
        for name in (API,WORKER):
            source=old[name]['env'];new=target[name]['env'];actual=cfg[name]['env']
            if any(actual.get(k)!=source.get(k) or new.get(k)!=source.get(k)for k in PRESERVE):raise RuntimeError('newauth_newdb_drift')
            for key in KEYS:
                if key in source:
                    if not new.get(key)or new[key]==source[key]:raise RuntimeError('cipher_substitute_missing_or_unchanged')
                    if actual.get(key)!=(source[key]if mode=='return-before-commit'else new[key]):raise RuntimeError('cipher_return_epoch_drift')
        if cfg[FRONT]!=old[FRONT]:raise RuntimeError('frontend_configuration_drift')
        # Same dedicated epoch/grant in every successor, including original-cipher return.
        for key in ['CAMPAIGN_SEED_WRITE_EPOCH','CAMPAIGN_SEED_SECRET','CAMPAIGN_SEED_HISTORICAL_SECRET','CAMPAIGN_SEED_HISTORICAL_POLICY_FILE','CAMPAIGN_SEED_HISTORICAL_POLICY_SHA256']:
            if cfg[API]['env'].get(key)!=target[API]['env'].get(key):raise RuntimeError('seed_reader_return_drift')
    return hook,plan,CredentialBoundary(window,hashlib.sha256(file.read_bytes()).hexdigest())

def adapter(module,driver,consumers):
    class CipherSequencer(module.Sequencer):
        def load_cipher(self):
            self.hook,self.plan,self.boundary=load_seal(self.b)
        def eligible(self):
            super().eligible();self.load_cipher()
            if self.hook.get('executionAuthorized')is not True:raise RuntimeError('cipher_execution_not_authorized')
            consumers.verify('before')
            if driver.classify(self.plan,self.hook['planHash'])!='ORIGINAL_VERIFIED':raise RuntimeError('cipher_original_not_proven')
            if os.path.lexists(self.b.window/'credential-commit.intent.private.json'):raise RuntimeError('cipher_consumed_inspect_only')
        def start_pair(self,mode):
            if self.hook.get('executionAuthorized')is not True:raise RuntimeError('cipher_execution_not_authorized')
            if mode not in MODES:raise RuntimeError('cipher_mode_denied')
            if mode=='switch':
                def before():
                    self.verify_stopped(mode);self.b.privileged('check-present');consumers.verify('contained')
                    g=self.b.guard()
                    if g['open']or g['generation']!=38 or g['tasks']or g.get('ledgerFault'):raise RuntimeError('guard38_drift')
                    if driver.classify(self.plan,self.hook['planHash'])!='ORIGINAL_VERIFIED':raise RuntimeError('cipher_original_drift')
                def verify():
                    if driver.classify(self.plan,self.hook['planHash'])!='VERIFIED':raise RuntimeError('cipher_receipt_sql_not_verified')
                    return VERIFIED
                self.boundary.execute(before,lambda:driver.apply(self.plan,self.hook['planHash'],self.b.window/'channel-apply.private.sql',self.hook['sqlSha256']),verify)
            elif mode=='return-before-commit':
                if os.path.lexists(self.b.window/'credential-commit.intent.private.json')and not self.boundary.may_start_original_return():raise RuntimeError('cipher_intent_uncertain_no_original_return')
                if driver.classify(self.plan,self.hook['planHash'])!='ORIGINAL_VERIFIED':raise RuntimeError('cipher_original_return_denied')
            elif not self.boundary.may_start_successor()or driver.classify(self.plan,self.hook['planHash'])!='VERIFIED':raise RuntimeError('cipher_uncertain_no_successor')
            consumers.install('before'if mode=='return-before-commit'else'after',self.boundary,mode)
            super().start_pair(mode)
        def recover(self):
            # No mutation/automatic decision after an unverified commit intent.
            if os.path.lexists(self.b.window/'credential-commit.intent.private.json'):
                if self.boundary.may_start_successor():
                    if driver.classify(self.plan,self.hook['planHash'])!='VERIFIED':raise RuntimeError('cipher_verified_state_drift')
                    return super().recover()
                if not self.boundary.may_start_original_return():raise RuntimeError('cipher_uncertain_inspection_and_explicit_decision_required')
            if driver.classify(self.plan,self.hook['planHash'])!='ORIGINAL_VERIFIED':raise RuntimeError('cipher_original_not_proven')
            observed=super().recovery_mode()
            if observed=='prestop':return super().recover()
            if observed!='return-partial':raise RuntimeError('cipher_precommit_recovery_state_denied')
            mode='return-before-commit';self.mode=mode;self.b.privileged('check-present')
            self.action(mode,'recover-partial');self.verify_stopped(mode);self.start_pair(mode);self.finish(mode)
    return CipherSequencer
