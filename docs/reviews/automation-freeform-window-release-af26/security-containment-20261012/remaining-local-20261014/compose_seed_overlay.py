"""Offline scoped compiler delta. Never imports the application or reads configuration.

Patch the attested active compiled modules, not the current branch build. A failed
patch leaves a diagnostic staging directory; never retry in that directory.
"""
import argparse
import difflib
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess

REV = 'b2a73dabe377474db625459d89ab5e5b7563ce12'
MODULES = ['campaigns/campaignAcceptedFailureReconciliation',
           'campaigns/campaignRecipientImport', 'campaigns/campaignRunner',
           'campaigns/campaignSeedPrivacy', 'http/routes',
           'privacy/privacyRetentionService']
NEW = 'campaigns/campaignSeedEpoch'
BASE_DIST_SHA256 = '2c806c2233461c71d98d5d782f4b7b549551512e1b376eefe62472db8664b08f'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def private_directory(p):
    for q in [p, *p.parents]:
        if q.is_symlink():
            raise ValueError('output_symlink_denied')
    s = p.stat()
    if not stat.S_ISDIR(s.st_mode) or s.st_uid != os.getuid() or stat.S_IMODE(s.st_mode) != 0o700:
        raise ValueError('output_owner_mode_denied')

def run(root, base, out, node):
    private_directory(out)
    assert not list(out.iterdir()), 'output_not_empty'
    base_index = [(str(p.relative_to(base)), sha(p.read_bytes())) for p in sorted((base/'dist').rglob('*')) if p.is_file() and not p.is_symlink()]
    assert sha(json.dumps(base_index).encode()) == BASE_DIST_SHA256, 'active_base_compiled_drift'
    assert subprocess.check_output([node, '-p', 'process.versions.node'], text=True).strip() == '20.20.0'
    source_prefix = 'apps/whatsapp-agent/src/'
    compiler = root / 'apps/whatsapp-agent/node_modules/typescript/lib/typescript.js'
    def source(revision, name):
        return subprocess.check_output(['git', 'show', f'{revision}:{source_prefix}{name}.ts'], cwd=root, text=True)
    def compile_ts(text):
        js = "const fs=require('fs'),ts=require(process.argv[1]);let s=fs.readFileSync(0,'utf8');process.stdout.write(ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ES2020,esModuleInterop:true}}).outputText)"
        return subprocess.check_output([node, '-e', js, str(compiler)], input=text, text=True)
    changes = []
    for name in MODULES:
        old_src, new_src = source(REV+'^', name), source(REV, name)
        old_js, new_js = compile_ts(old_src), compile_ts(new_src)
        active = base / 'dist' / (name+'.js')
        assert active.is_file() and not active.is_symlink(), 'active_module_missing'
        target = out / 'dist' / (name+'.js')
        target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        target.write_bytes(active.read_bytes()); target.chmod(0o600)
        patch = ''.join(difflib.unified_diff(old_js.splitlines(True), new_js.splitlines(True), fromfile='old', tofile='new', n=3))
        assert patch, 'empty_delta'
        subprocess.run(['patch', '--batch', '--forward', '--fuzz=0', str(target)], input=patch, text=True, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        changes.append({'path':'dist/'+name+'.js', 'baseSha256':sha(active.read_bytes()),
                        'candidateSha256':sha(target.read_bytes()), 'oldSourceSha256':sha(old_src.encode()),
                        'newSourceSha256':sha(new_src.encode()), 'compiledDeltaSha256':sha(patch.encode())})
    new_src = source(REV, NEW)
    target = out / 'dist' / (NEW+'.js')
    assert not (base/'dist'/(NEW+'.js')).exists(), 'new_module_already_in_base'
    target.write_text(compile_ts(new_src)); target.chmod(0o600)
    changes.append({'path':'dist/'+NEW+'.js','candidateSha256':sha(target.read_bytes()),'newSourceSha256':sha(new_src.encode())})
    preserved = []
    changed = {e['path'] for e in changes}
    for p in sorted((base/'dist').rglob('*')):
        if p.is_symlink():
            preserved.append({'path':str(p.relative_to(base)), 'symlinkTarget':os.readlink(p)})
        elif p.is_file() and str(p.relative_to(base)) not in changed:
            preserved.append({'path':str(p.relative_to(base)), 'sha256':sha(p.read_bytes())})
    # Dependency trees and active return are references, never copied/rebuilt.
    assert [(str(p.relative_to(base)), sha(p.read_bytes())) for p in sorted((base/'dist').rglob('*')) if p.is_file() and not p.is_symlink()] == base_index, 'active_base_changed_during_composition'
    manifest = {'result':'LOCAL_SCOPED_SEED_OVERLAY_PASS_NOT_DEPLOYABLE', 'sourceRevision':REV,
                'baseCompiledIndexSha256':BASE_DIST_SHA256,'baseCompiledFiles':len(base_index),
                'node':'20.20.0','compilerSha256':sha(compiler.read_bytes()),'changes':changes,
                'preservedCompiledEntries':len(preserved),'preservedIndexSha256':sha(json.dumps(preserved,sort_keys=True).encode()),
                'dependenciesCopied':False, 'configurationChanged':False, 'workerChanged':False,
                'frontendChanged':False, 'executionAuthorized':False,
                'administrativeRecoveryModule':'campaignAcceptedDeliveryRecovery absent from active base; reviewed source context preserved separately, not introduced into runtime',
                'limits':'Active kernel/config identity proven by dated post-bank capture; fresh final package/config/return bindings still required.'}
    for filename,value in [('manifest.sanitized.json',manifest),('preserved-index.json',preserved),('package.json',{'type':'module','private':True,'description':'Local overlay test metadata; not a replacement application package'})]:
        p=out/filename; p.write_text(json.dumps(value,indent=2)+'\n'); p.chmod(0o600)
    return manifest

if __name__ == '__main__':
    a=argparse.ArgumentParser(); a.add_argument('--root',type=Path,required=True); a.add_argument('--base',type=Path,required=True); a.add_argument('--output',type=Path,required=True); a.add_argument('--node',required=True); args=a.parse_args()
    m=run(args.root.resolve(),args.base.resolve(),args.output.absolute(),args.node)
    print(json.dumps({'result':m['result'],'changedModules':len(m['changes']),'preservedCompiledEntries':m['preservedCompiledEntries']}))
