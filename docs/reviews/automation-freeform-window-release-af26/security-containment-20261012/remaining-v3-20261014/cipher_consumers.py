"""Separate seal for pre/post cipher consumers; no PM2/container/service action."""
import hashlib,json,os,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
from database_consumers import safe_file
class CipherConsumers:
    def __init__(self,window,plan_hash):self.window=Path(window);self.plan_hash=plan_hash
    def verify(self,phase):
        if phase not in ('before','contained'):raise RuntimeError('cipher_consumer_phase_denied')
        p=self.window/'cipher-consumers.private.json';safe_file(p,os.getuid(),0o600)
        if hashlib.sha256(p.read_bytes()).hexdigest()!=self.plan_hash:raise RuntimeError('cipher_consumers_seal_drift')
        v=json.loads(p.read_text())
        for e in v['immutable']:
            safe_file(e['path'],e['uid'],e['mode'])
            if hashlib.sha256(Path(e['path']).read_bytes()).hexdigest()!=e['sha256']:raise RuntimeError('cipher_consumer_reference_drift')
        for group in ('before','after'):
            for e in v[group]:
                p=self.window/e['name']
                if p.parent!=self.window:raise RuntimeError('cipher_consumer_path_denied')
                safe_file(p,os.getuid(),0o600)
                if hashlib.sha256(p.read_bytes()).hexdigest()!=e['sha256']:raise RuntimeError('cipher_consumer_bytes_drift')
        for mode,expected in v['modeBindings'].items():
            if mode not in ('switch','return','return-partial','return-before-commit'):raise RuntimeError('cipher_consumer_mode_denied')
            p=self.window.parent/mode/'candidate.config.private.json';safe_file(p,os.getuid(),0o600)
            if hashlib.sha256(p.read_bytes()).hexdigest()!=expected:raise RuntimeError('cipher_mode_consumer_binding_drift')
        return v
    def install(self,phase,boundary,mode):
        if phase not in ('before','after'):raise RuntimeError('cipher_consumer_phase_denied')
        v=self.verify('contained')
        if mode not in v['modeBindings']or (phase=='before')!=(mode=='return-before-commit'):raise RuntimeError('cipher_consumer_mode_phase_drift')
        if phase=='after'and not boundary.may_start_successor():raise RuntimeError('cipher_consumer_activation_requires_verified')
        if phase=='before'and os.path.lexists(self.window/'credential-commit.intent.private.json')and not boundary.may_start_original_return():raise RuntimeError('cipher_consumer_original_requires_inspection')
        # Activate only the sealed configuration profile. Mode launchers read their
        # corresponding profiles; this receipt grants no stop/start/SQL authority.
        receipt={'phase':phase,'mode':mode,'modeConfigSha256':v['modeBindings'][mode],'consumerPlanSha256':self.plan_hash,'consumerHashes':{e['name']:e['sha256']for e in v[phase]},'noContainerRecreation':True}
        name=self.window/('cipher-consumer-'+phase+'-'+mode+'.receipt.private.json')
        if os.path.lexists(name):
            if boundary.safe_read(name)!=receipt:raise RuntimeError('cipher_consumer_receipt_drift')
            return receipt
        boundary.write(name,receipt);return receipt
