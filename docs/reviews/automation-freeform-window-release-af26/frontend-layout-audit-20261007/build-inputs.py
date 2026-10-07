"""Extract complete frontend inputs, verify lock/configs, reuse preserved dependencies.
No install, rebuild of backend/worker, env import or production access.
Usage: python3 build-inputs.py REPO REV PRESERVED_BUILD NEW_BUILD
Then use Node20 next build --webpack in the new directory with allowlisted env.
"""
import hashlib, json, shutil, subprocess, sys, tarfile
from pathlib import Path
repo, revision, origin, out = map(Path, [sys.argv[1],sys.argv[2],sys.argv[3],sys.argv[4]])
revision=str(revision);assert not out.exists(), 'new_build_required'
files=['src','public','next.config.ts','postcss.config.mjs','tailwind.config.js','package.json','package-lock.json','tsconfig.json']
raw=subprocess.check_output(['git','-C',str(repo),'archive',revision,*files]);out.mkdir()
import io
with tarfile.open(fileobj=io.BytesIO(raw)) as tar:tar.extractall(out,filter='data')
for name in files:
 assert (out/name).exists(), 'build_input_missing:'+name
for name in ['package.json','package-lock.json']:
 assert (out/name).read_bytes()==(origin/name).read_bytes(), 'dependency_drift:'+name
assert json.loads((origin/'node_modules/next/package.json').read_text())['version']=='16.1.5'
shutil.copytree(origin/'node_modules',out/'node_modules',symlinks=True,copy_function=shutil.copy2)
manifest={name:hashlib.sha256((out/name).read_bytes()).hexdigest() for name in files if (out/name).is_file()}
(out/'build-inputs.json').write_text(json.dumps({'revision':revision,'files':manifest},indent=2))
print('COMPLETE_BUILD_INPUTS_PASS')
