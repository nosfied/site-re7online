"""Offline derived review inventory from composed code and existing private custody.
No phase authority, owner approval, system operation or collection is issued here.
"""
import base64,contextlib,hashlib,json,os,tempfile
from pathlib import Path
from scripts.crm_csv_delivery.prepare_review import reader
from scripts.crm_csv_predecessor import pre_authority
ROOT=Path(__file__).resolve().parents[2]
D=ROOT/'docs/reviews/automation-freeform-window-release-af26/crm-csv-delivery-review-20261017'
PACKAGE=D/'legacy-integrated-static'
REVIEW_SHA='8d2a8e5126ef53668dfedfb0d563c75bbab85e08c17cfe4b3d9b20631dbfc0c8'
SOURCE=Path('/home/deifson-oliveira/DEIFSON/re7-private-retention-custody/csv-sql-read-20261017-v2/capture.private.jsonl')
SOURCE_SHA='e41c5dc714d5cabdadedc5f88c12d1ea63f26ba1c9fd34df411f01fcdb3ac01e'
DEST=SOURCE.parent.parent/'csv-known-imports-review-20261017-v1'
sha=lambda b:hashlib.sha256(b).hexdigest()
encode=lambda v:(json.dumps(v,sort_keys=True,indent=2)+'\n').encode()

def composed_inputs():
 lib=reader();raw,_=lib['stable_file'](PACKAGE/'CODE_COMPOSITION.json')
 lib['require'](sha(raw)==REVIEW_SHA,'composed_review_hash')
 plan=json.loads(raw);index_raw,_=lib['stable_file'](PACKAGE/'CODE_OBJECTS.json')
 delivery_raw,_=lib['stable_file'](PACKAGE/'DELIVERY.json');delivery=json.loads(delivery_raw)
 lib['require'](delivery['codeObjectsSha256']==sha(index_raw)and delivery['compositionSha256']==sha(raw),'composed_index_binding')
 index=json.loads(index_raw);lib['require'](set(index['objects'])=={row['sha256']for row in plan['files'].values()},'composed_object_population')
 objects={}
 for digest,row in index['objects'].items():
  b,_=lib['stable_file'](ROOT/row['source']);lib['require'](sha(b)==digest and len(b)==row['bytes'],'composed_object_drift');objects[digest]=b
 for name,row in plan['files'].items():lib['require'](row['sha256']in objects and len(objects[row['sha256']])==row['bytes'],'composed_file_binding')
 return raw,plan,objects

@contextlib.contextmanager
def composed_loader():
 raw,plan,objects=composed_inputs()
 # Disposable code-only laboratory tree for the EXISTING Review and Loader.
 # No operational data/metadata, profile, permit, binding or installed root is created.
 with tempfile.TemporaryDirectory(prefix='re7-static-import-review-')as td:
  root=Path(td)
  for name,row in plan['files'].items():
   f=root/name;f.parent.mkdir(parents=True,exist_ok=True);f.write_bytes(objects[row['sha256']])
  (root/'COMPOSITION.json').write_bytes(raw)
  runtime=objects[plan['files']['review/pre_authority.py']['sha256']]
  read_raw=objects[plan['files']['review/reader.py']['sha256']]
  readlib=pre_authority.compile_library('composed_review_reader',read_raw)
  review=pre_authority.compile_library('composed_review_runtime',runtime)
  review.REVIEW_READ=readlib.read;review.RUNTIME_RAW=runtime;review.READER_RAW=read_raw
  view=review.Review(root,REVIEW_SHA)
  loader=view.loader('window/pre_install.py') # snapshot only; never execute pre_install
  yield loader,root,plan

def captured_rows():
 lib=reader();raw,m=lib['stable_file'](SOURCE)
 lib['require'](sha(raw)==SOURCE_SHA and m['uid']==os.getuid()and m['mode']&0o777==0o600,'source_custody')
 records=[json.loads(x)for x in raw.splitlines()]
 selected=[x for x in records if x.get('event')=='command'and x.get('id')=='imports']
 lib['require'](len(selected)==1 and selected[0]['exitCode']==0,'imports_source_command')
 cmd=selected[0];payload=base64.b64decode(cmd['stdoutBase64'],validate=True)
 lib['require'](len(payload)==cmd['stdoutBytes']and sha(payload)==cmd['stdoutSha256'],'imports_source_bytes')
 return json.loads(payload)['rows'],payload,cmd

def derive():
 lib=reader();rows,payload,command=captured_rows()
 with composed_loader()as(loader,root,plan):
  classifier=loader.local_module(root/'window/capture_imports.py')
  gate=loader.local_module(root/'window/csv_boundary.py')
  operations=classifier.classify(rows);keys=gate.imports(operations)
  lib['require'](len(keys)==20 and len(rows)==1784,'derived_expected_population')
  pairs=[(x['source'],x['sha256'])for op in operations for x in op['evidence']]
  expected=[('Event:'+str(row['id']),sha(json.dumps(row,sort_keys=True).encode()))for row in rows]
  lib['require'](sorted(pairs)==sorted(expected),'derived_evidence_loss')
  loader.authority.revalidate()
 value={'kind':'DERIVED_AUDIT_REVIEW_DRAFT_NOT_OPERATIONAL_SCOPE','compositionSha256':REVIEW_SHA,
        'classifierSha256':plan['files']['window/capture_imports.py']['sha256'],
        'sourceCapture':str(SOURCE),'sourceCaptureSha256':SOURCE_SHA,
        'command':'imports','commandStartedUtc':command['startedUtc'],'commandFinishedUtc':command['finishedUtc'],
        'importsResponseFile':'imports-response.private.json','importsResponseSha256':sha(payload),
        'importsResponseBytes':len(payload),'auditRows':len(rows),'operations':operations,
        'ownerReviewed':False,'reviewedAgainstAuditAndKnownActivity':False,'knownActivityScopeComplete':False,
        'scopeComplete':False,'observationComplete':False,'underFence':False,'executorExitCertified':False,
        'ownershipComplete':False,'phaseAuthorityIssued':False,'preparedForReviewOnly':True}
 inventory=encode(value)
 # Full original SELECT response is preserved once, plus every Event:id/hash in the
 # review inventory. No CSV/message/contact data beyond that already captured SELECT.
 folder=lib['new_directory'](DEST)
 writer_raw,_=lib['stable_file'](D.parent/'crm-csv-r2-directed-20261017/privileged_output.source')
 lib['require'](sha(writer_raw)=='93a114516a19b6d0acee5d2d810f298d856efd22c6905452d81651db65e3271a','canonical_writer')
 writer=pre_authority.compile_library('canonical_private_writer',writer_raw)
 writer.private_record(folder,'privileged-output.private.jsonl',{'event':'derived_inventory_begin','utc':lib['utc'](),'sourceCaptureSha256':SOURCE_SHA,'compositionSha256':REVIEW_SHA})
 lib['write_artifact'](folder/'imports-response.private.json',payload)
 lib['write_artifact'](folder/'inventory.private.json',inventory)
 for name,raw in [('imports-response.private.json',payload),('inventory.private.json',inventory)]:
  preserved,_=lib['stable_file'](folder/name);lib['require'](preserved==raw,'derived_custody_bytes')
 result={'result':'DERIVED_PRIVATE_20_OPERATION_REVIEW_INVENTORY_NOT_APPROVED','compositionSha256':REVIEW_SHA,
         'sourceCaptureSha256':SOURCE_SHA,'operations':len(operations),'auditRows':len(rows),
         'evidencePairsPreserved':len(pairs),'inventorySha256':sha(inventory),'inventoryBytes':len(inventory),
         'importsResponseSha256':sha(payload),'importsResponseBytes':len(payload),'byteExact':True,
         'ownerReviewed':False,'knownActivityScopeComplete':False,'executorExitCertified':False,
         'ownershipComplete':False,'operationalScopeIssued':False,'privateDirectoryName':DEST.name}
 writer.private_record(folder,'privileged-output.private.jsonl',dict(event='derived_inventory_end',utc=lib['utc'](),**result))
 return result

if __name__=='__main__':
 os.umask(0o077)
 result=derive();print(json.dumps(result,sort_keys=True))
