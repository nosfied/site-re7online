"""One fail-closed restore proof contract, used by Python and Node consumers.
Does not restore, remove a lab, contact PostgreSQL, or attest current lab liveness.
"""
import hashlib,json,os,re,stat,sys
from pathlib import Path
MODES=('switch','return','return-partial','return-before-commit')
def require(v,reason):
 if not v:raise RuntimeError('restore_contract:'+reason)
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def private(p):
 p=Path(p);s=p.lstat()
 require(stat.S_ISREG(s.st_mode)and not p.is_symlink()and s.st_nlink==1 and s.st_uid==os.getuid()and stat.S_IMODE(s.st_mode)==0o600,'type_owner_mode')
 return json.loads(p.read_text())
def hashvalue(v):return type(v)is str and re.fullmatch('[a-f0-9]{64}',v)is not None
def validate(mode):
 mode=Path(mode);w=mode.parent/'window'
 require(mode.name in MODES,'mode')
 binding=private(mode/'proof-bindings.private.json');manifest=private(mode/'backup-manifest.json');r=private(w/'restore-result.json');contract=private(w/'restore-contract.private.json')
 require(sha(mode/'backup-manifest.json')==binding['backupManifestSha256']and sha(w/'restore-result.json')==binding['restoreResultSha256'],'binding_hash')
 require(sha(w/'restore-contract.private.json')==binding['restoreContractSha256'],'contract_hash')
 require(contract['version']==1 and contract['scope']=='ISOLATED_RESTORE_EVIDENCE_NOT_FRESH_RPO','schema')
 original=private(w/'original-restore-proof.private.json')
 require(sha(w/'original-restore-proof.private.json')==contract['originalProofSha256'],'original_proof_hash')
 require(contract['evidenceState']in ('REMOVED_AFTER_VALID_RESTORE','CERTIFIED_RETAINED_STOPPED'),'lab_state')
 require(r['result']=='PASS'and original['result']=='PASS','result')
 require(original['isolatedLocalOnly']is True and original['applicationStarted']is False and original['providerCalls']==0 and original['productionWrites']==0,'isolation')
 require(original['converted']==10 and original['opaquePreserved']==1 and original['historicalFields']==147 and original['v2Independent']is True and original['replayAdditionalEvents']==0,'cipher_restore_boundary')
 require(original['schemaTables']==70 and original['migrationRows']==66 and original['migrationChecksumMismatches']==[],'migration_frontier')
 require(contract['ownershipAclRestored']is False and original['ownershipAclRestored']is False,'ownership_scope')
 # No inference of removal from a truthy value; retained/stopped is independently certified.
 removed=r['temporaryDatabaseRemoved'];retained=r['databaseRetainedStoppedForEvidence']
 require(type(removed)is bool and type(retained)is bool and removed!=retained,'lab_state_flags')
 require((removed and contract['evidenceState']=='REMOVED_AFTER_VALID_RESTORE')or(retained and r['snapshotCertified']is True and contract['evidenceState']=='CERTIFIED_RETAINED_STOPPED'),'lab_state_certificate')
 require(r['isolatedLocalOnly']is True and r['applicationStarted']is False and r['providerCalls']==0 and r['migrationChecksumMismatches']==[],'restore_controls')
 dump=manifest['files']['database.dump']
 require(hashvalue(dump['sha256'])and type(dump['bytes'])is int and dump['bytes']>0 and manifest['catalogObjects']>0,'dump_identity')
 require((dump['sha256'],dump['bytes'],manifest['catalogObjects'])==(binding['dumpSha256'],binding['dumpBytes'],binding['catalogObjects']),'dump_binding')
 require((r['dumpSha256'],r['dumpBytes'])==(dump['sha256'],dump['bytes']),'restore_dump_binding')
 require(contract['currentBackupManifestSha256']==sha(mode/'backup-manifest.json')and contract['currentDumpSha256']==dump['sha256'],'current_backup_contract')
 require(hashvalue(contract['schemaFrontierSha256'])and contract['schemaFrontierSha256']==r['schemaDigest'],'schema_frontier')
 require(contract['tooling']==r['tooling']and contract['tooling']=='pg_dump/pg_restore16.12; Node20.20.0; existing isolated restore PG16','tooling')
 require(r['proofMode']=='REUSED_ISOLATED_RESTORE_EQUAL_TOOLING_SCHEMA_FRONTIER'and r['restoreExecutedForThisCapture']is False,'proof_reuse_explicit')
 require(r['originalRestoreProofSha256']==contract['originalProofSha256']and r['reusedOriginalProof']==original and r['originalCertifiedDumpSha256']==original['dumpSha256'],'original_provenance')
 evidence=private(w/'backup-compatibility.private.json')
 require(sha(w/'backup-compatibility.private.json')==contract['compatibilityEvidenceSha256'],'compatibility_evidence_hash')
 require(evidence['result']=='FRESH_READONLY_BACKUP_PASS'and evidence['backupLockHeld']is True and evidence['newCipherPlanGenerated']is False,'backup_capture')
 require((evidence['schemaDigest'],evidence['dumpSha256'],evidence['dumpBytes'])==(contract['schemaFrontierSha256'],dump['sha256'],dump['bytes']),'compatibility_boundary')
 return {'result':'RESTORE_CONTRACT_PASS','mode':mode.name,'labState':contract['evidenceState'],'freshRpoCertified':False,'restoreExecutedForCurrentDump':False,'ownershipAclRestored':False}
if __name__=='__main__':
 try:print(json.dumps(validate(sys.argv[1]),sort_keys=True))
 except Exception as e:
  print(json.dumps({'result':'DENY','errorClass':type(e).__name__}),file=sys.stderr);sys.exit(1)
