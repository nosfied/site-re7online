"""Validate/extract preserved content into a NEW isolated root only; no production restore."""
import argparse,json,hashlib,os,tarfile
from pathlib import Path

def digest(p):
 h=hashlib.sha256()
 with open(p,'rb')as f:
  for b in iter(lambda:f.read(1048576),b''):h.update(b)
 return h.hexdigest()
def run(archive,index,archive_sha,index_sha,root):
 assert digest(archive)==archive_sha and digest(index)==index_sha,'custody_hash_drift'
 v=json.loads(Path(index).read_text());names={'blobs/'+o['sha256']:o['sha256']for o in v['objects']}
 root=Path(root);assert not os.path.lexists(root),'isolated_root_exists';root.mkdir(mode=0o700)
 count=0
 with tarfile.open(archive,'r:')as tar:
  members=tar.getmembers();assert len(members)==len(names)and {m.name for m in members}==set(names),'tar_membership_drift'
  for m in members:
   assert m.isreg()and m.name in names,'tar_type_denied'
   originals=[q for q in v['originals']if q['sha256']==names[m.name]]
   assert originals,'tar_provenance_missing'
   if 'mode'in originals[0]:
    assert any((m.uid,m.gid,m.mode,m.size)==(q['uid'],q['gid'],q['mode']&0o7777,q['size'])for q in originals),'tar_metadata_drift'
   # Never tar.extract()/follow archive paths. No links, traversal or original-path writes.
   out=root/names[m.name];h=hashlib.sha256();fd=os.open(out,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
   with os.fdopen(fd,'wb')as f,tar.extractfile(m)as source:
    for b in iter(lambda:source.read(1048576),b''):h.update(b);f.write(b)
    f.flush();os.fsync(f.fileno())
   assert h.hexdigest()==names[m.name],'extracted_hash_drift';count+=1
 assert all((root/q['sha256']).is_file() for q in v['originals']),'original_content_missing'
 return {'result':'ISOLATED_EXTRACTION_PASS','objects':count,'originalPathsIndexed':len(v['originals']),'productionRestore':False,'metadataInIndex':True}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--archive',required=True);p.add_argument('--index',required=True);p.add_argument('--archive-sha256',required=True);p.add_argument('--index-sha256',required=True);p.add_argument('--isolated-root',required=True);a=p.parse_args();os.umask(0o077);print(json.dumps(run(a.archive,a.index,a.archive_sha256,a.index_sha256,a.isolated_root)))
