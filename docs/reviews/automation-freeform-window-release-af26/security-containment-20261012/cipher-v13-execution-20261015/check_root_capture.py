"""Read-only acceptance of fresh owner root capture against approved writer audit."""
import datetime,hashlib,json,os,stat,sys
from pathlib import Path
SOURCE='b6a58431c989a36eebdfa9e443118a7e15fbe0229d102cd896f91d3d193f818d'
POLICY='/usr/local/libexec/re7/incident-6683-window-policy.json'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def check(p,capture,baseline):
 p=Path(p);f=Path(capture);s=f.lstat();assert stat.S_ISREG(s.st_mode)and not f.is_symlink()and s.st_uid==os.getuid()and stat.S_IMODE(s.st_mode)==0o600
 r=json.loads(f.read_text());old=json.loads(Path(baseline).read_text());v=json.loads((p/'window/writer-consumers.private.json').read_text())
 assert sha(baseline)==v['sourceRootEvidenceSha256'],'approved_root_reference_drift'
 assert r['result']=='WRITER_ROOT_REFERENCE_READ'and not r['incomplete']and r['mutations']==0,'root_observation_incomplete'
 age=(datetime.datetime.now(datetime.timezone.utc)-datetime.datetime.fromisoformat(r['atUtc'])).total_seconds();assert 0<=age<600,'root_observation_expired'
 a={x['path']:x for x in old['files']};b={x['path']:x for x in r['files']};assert set(a)==set(b),'root_file_population_drift'
 for n,e in b.items():
  assert (e['uid'],e['gid'],e['mode'])==(a[n]['uid'],a[n]['gid'],a[n]['mode'])and e['uid']==0 and not(e['mode']&0o022),'root_file_metadata_drift'
  assert e['sha256']==(SOURCE if n==POLICY else a[n]['sha256']),'root_file_hash_drift'
 expected={x['path']:(x['uid'],x['mode'])for x in old['chain']};current={x['path']:(x['uid'],x['mode'])for x in r['chain']};assert current==expected and all(uid==0 and not(mode&0o022)for uid,mode in current.values()),'root_chain_drift'
 assert {x['path']:x['sha256']for x in r['cron']}=={x['path']:x['sha256']for x in old['cron']},'scheduled_writer_sources_changed'
 known={(x['pid'],x['ticks'])for x in old['processes']if not x.get('noUserspaceWriter')}
 unexpected=[x for x in r['processes']if 'node'in x['comm'].lower()and(x['pid'],x['ticks'])not in known]
 assert not unexpected,'unknown_node_writer_identity'
 assert v['knownCipherWriters']==['re7-whatsapp-agent','re7-whatsapp-web-worker']and v['unknownScheduledCipherWriters']==[],'writer_contract_drift'
 return {'result':'FRESH_ROOT_WRITER_REFERENCES_SOURCE_B6_PASS','captureSha256':sha(capture),'baselineSha256':sha(baseline),'capturedUtc':r['atUtc'],'files':len(b),'cronReferences':len(r['cron']),'incomplete':0,'unknownNodeWriters':0,'noMutation':True}
if __name__=='__main__':print(json.dumps(check(*sys.argv[1:]),sort_keys=True))
