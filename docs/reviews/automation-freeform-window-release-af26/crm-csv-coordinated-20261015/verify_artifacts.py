"""Verify concrete archives and optionally restore only to a fresh private LOCAL directory."""
import argparse,hashlib,json,os,posixpath,stat,tarfile
from pathlib import Path
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def verify(generation,restore=None,auxiliary_only=False):
 out=Path(generation).resolve();rest=Path(restore).resolve()if restore else None
 release=json.loads(Path(__file__).with_name('ARTIFACTS_SANITIZED.json').read_text());reviewed={**release['artifacts'],**release.get('auxiliaryArtifacts',{})}
 if rest:
  s=rest.lstat();assert stat.S_ISDIR(s.st_mode)and s.st_uid==os.getuid()and stat.S_IMODE(s.st_mode)==0o700 and not rest.is_symlink()and not list(rest.iterdir()),'private_empty_restore_required'
 result={}
 plans=[('events-control-policy-overlay','.tar')]if auxiliary_only else [('api-candidate','.tar'),('frontend-candidate','.tar.gz'),('frontend-compatible-return','.tar.gz'),('events-control-policy-overlay','.tar')]
 for name,extension in plans:
  manifest=json.loads((out/(name+'.manifest.private.json')).read_text());artifact=out/(name+extension)
  assert sha(artifact)==reviewed[name]['sha256'],'reviewed_archive_hash_drift'
  if 'tarSha256'in manifest:assert sha(artifact)==manifest['tarSha256'],'archive_hash_drift'
  expected={r['path']:r for r in manifest['files']};assert len(expected)==len(manifest['files'])
  with tarfile.open(artifact)as t:
   members=t.getmembers();assert len(members)==len(expected)and {m.name for m in members}==set(expected),'archive_membership_drift'
   for m in members:
    assert not Path(m.name).is_absolute()and'..'not in Path(m.name).parts
    row=expected[m.name]
    if 'target'in row:
     assert m.issym()and m.linkname==row['target']and not m.linkname.startswith('/')
     target=posixpath.normpath(posixpath.join(posixpath.dirname(m.name),m.linkname));assert not target.startswith('../')and target in expected,'link_outside_artifact'
    else:
     assert m.isfile()and hashlib.sha256(t.extractfile(m).read()).hexdigest()==row['sha256'],'member_hash_or_type_drift'
   if rest:
    target=rest/name;target.mkdir(mode=0o700);t.extractall(target,filter='data')
    for rel,row in expected.items():
     p=target/rel
     if 'target'in row:assert p.is_symlink()and os.readlink(p)==row['target']
     else:assert p.is_file()and not p.is_symlink()and sha(p)==row['sha256'],'restored_content_drift'
  result[name]={'files':len(expected),'archiveSha256':sha(artifact),'restoreVerified':bool(rest)}
 print(json.dumps({'result':'EXACT_ARCHIVE_AND_LOCAL_RESTORE_PASS' if rest else 'EXACT_ARCHIVE_PASS','artifacts':result,'noApplicationStarted':True}))
if __name__=='__main__':
 a=argparse.ArgumentParser();a.add_argument('--generation',required=True);a.add_argument('--local-restore');a.add_argument('--auxiliary-only',action='store_true');v=a.parse_args();verify(v.generation,v.local_restore,v.auxiliary_only)
