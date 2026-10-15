"""Run the exact integrated consumer harness on the NEW operational package.
Only difference: explicit reviewed commit comes from operator CLI, not patched module state.
"""
import hashlib,sys
from pathlib import Path
source=Path(__file__).resolve().parent.parent/'controls-prisma-integration-20261015/test_sequence.py'
assert hashlib.sha256(source.read_bytes()).hexdigest()=='155fe0f7053ea32a0a1f721c1d7291507bfbc1e9559268abdd016a903e54b1e3','reviewed_harness_changed'
sys.path.insert(0,str(source.parent))
s=source.read_text()
a="admission.APPROVAL_COMMIT='f'*40"
assert s.count(a)==1
s=s.replace(a,"decision='--owner-authorized-future-controls:'+ 'f'*40")
a="admission.main(p,inputs,Path(tmp)/'admission','--owner-authorized-future-controls')"
assert s.count(a)==1
s=s.replace(a,"admission.main(p,inputs,Path(tmp)/'admission',decision)")
s=s.replace("x['sha256']=root_policy['policySha256']","x['sha256']='15b91a2a41708a1ef0ee8a499fd51f892298561d0d73dbbfb05ceb3fe285899f'")
exec(compile(s,str(source),'exec'),{'__file__':str(source),'__name__':'__main__'})
