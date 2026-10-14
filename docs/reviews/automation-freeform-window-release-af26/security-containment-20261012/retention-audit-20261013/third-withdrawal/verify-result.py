"""Future read-only certificate: exact receipt, journal, post observation and plan."""
import argparse,json,hashlib,os,re,stat
from pathlib import Path

def read(path):
 p=Path(path);s=p.lstat();assert stat.S_ISREG(s.st_mode)and not p.is_symlink(),'receipt_type'
 assert s.st_uid==0 and stat.S_IMODE(s.st_mode)==0o600,'root_receipt_owner_mode'
 return p.read_bytes()
def verify(plan,plan_sha,receipt,journal,post):
 assert receipt['result']=='WITHDRAWAL_COMPLETE'and receipt['planSha256']==plan_sha,'exact_receipt_denied'
 expected={q['path']for q in plan['entries']};assert len(expected)==len(plan['entries'])and receipt['removedCount']==len(expected),'receipt_count_denied'
 assert len(journal)==len(expected)and len({q['path']for q in journal})==len(journal)and {q['path']for q in journal}==expected,'journal_membership_denied'
 assert post['result']=='POST_READ_COMPLETE'and post['remainingEntries']==0 and post['nonDirectoryMetadataDrift']==0 and post['receiptExists']and post['capacityPass'],'post_denied'
 o=post['observation'];assert o['at']>=receipt['finishedAt']and not o['owners']and not o['incomplete'],'fresh_complete_observation_denied'
 assert post['minimumAvailableBytes']>=plan['requiredPostFreeBytes'],'capacity_denied'
 assert all(not os.path.lexists(p)for p in expected),'literal_path_still_exists'
 return {'result':'THIRD_WITHDRAWAL_CERTIFIED','removedFiles':len(expected),'planSha256':plan_sha,'minimumAvailableBytes':post['minimumAvailableBytes'],'noNewMutation':True}
if __name__=='__main__':
 a=argparse.ArgumentParser();a.add_argument('--plan',required=True);a.add_argument('--plan-sha256',required=True);v=a.parse_args();p=Path(v.plan);raw=p.read_bytes();assert hashlib.sha256(raw).hexdigest()==v.plan_sha256,'input_hash_drift';plan=json.loads(raw);d=p.parent
 posts=[q for q in d.iterdir()if re.fullmatch(r'post-[0-9]+\.private\.json',q.name)];assert posts,'post_receipt_absent';post=max(posts,key=lambda q:int(q.name.split('-')[1].split('.')[0]))
 result=verify(plan,v.plan_sha256,json.loads(read(d/'withdrawal.receipt.private.json')),[json.loads(q)for q in read(d/'removals.private.jsonl').splitlines()],json.loads(read(post)));print(json.dumps(result))
