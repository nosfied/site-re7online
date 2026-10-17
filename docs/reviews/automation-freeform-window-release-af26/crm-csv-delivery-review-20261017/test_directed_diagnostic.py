"""Focused literal-block integration; local network namespace only, no VPS."""
import hashlib,json,sys,unittest
from pathlib import Path
P=Path(__file__).resolve().parent
sys.path.insert(0,str(P/'directed-diagnostic'))
import lab
source=P.parent/'crm-csv-postrpc-diagnostics-20261017/test_blocks.py'
raw=source.read_bytes();assert hashlib.sha256(raw).hexdigest()=='3f991c066e6b8ea82691d18a9f29bf36f3fec1c039e548cc26bed57efa2ea572'
s=raw.decode();s=s[:s.index('RESULTS=[]')]
s=s.replace("P=Path(__file__).resolve().parent", "P=Path(__file__).resolve().parent/'directed-diagnostic'")
replacements={
're7-csv-postrpc-material-20261017-v1':'re7-csv-directed-material-20261017-v1',
'csv-postrpc-launcher-20261017-v1':'csv-directed-launcher-20261017-v1',
'csv-postrpc-diagnostics-20261017-v1':'csv-directed-diagnostic-20261017-v1'}
for a,b in replacements.items():s=s.replace(a,b)
s=s.replace("'--uid','0','--gid','0'","'--uid','1000','--gid','1000'")
s=s.replace("(P/'COMMANDS.md')", "(P.parent/'DIRECTED_COMMANDS_FOR_REVIEW.md')")
s=s.replace("if case in ('peer-wrong','bundle-tampered','source-tampered')", "if case in ('peer-wrong','bundle-tampered','source-tampered')")
s=s.replace("                        if sql:", "                        self.assertTrue({'saved-full-dump.pm2','saved-full-dump.pm2.bak','controls-executor','controls-deploy-cron','controls-system-cron','controls-supervision','controls-initial.private.json'}<={x.get('id')for x in rows})\n                        self.assertTrue(any(x['event']=='CONTROLS_OBSERVED_NOT_CERTIFIED'for x in rows))\n                        if sql:")
s=s.replace("                        expected_denials=", "                        if case=='control-denied':self.assertEqual((rows[-1]['denialStage'],rows[-1]['denialReason']),('controls-deploy-cron','DEPLOY_CRON_READ_FAILED'));self.assertFalse(any(x.get('event')=='CONTROLS_OBSERVED_NOT_CERTIFIED'for x in rows))\n                        expected_denials=")
ns={'__name__':'focused_harness','__file__':str(Path(__file__).resolve()),'RESULTS':[]}
exec(compile(s,'<accepted block harness, paths adapted>','exec'),ns)
class Focused(unittest.TestCase):
    def test_changed_paths_adapter_controls_and_custody(self):RESULTS.append(ns['Blocks']().exercise('valid'))
    def test_source_integrity_before_remote(self):RESULTS.append(ns['Blocks']().exercise('source-tampered'))
    def test_partial_transfer_preserved(self):RESULTS.append(ns['Blocks']().exercise('partial-transfer'))
    def test_peer_negative_still_blocks(self):RESULTS.append(ns['Blocks']().exercise('peer-wrong'))
    def test_controls_access_denied_preserved(self):RESULTS.append(ns['Blocks']().exercise('control-denied'))
RESULTS=[]
if __name__=='__main__':
    result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Focused))
    if result.wasSuccessful():(P/'DIRECTED_PROOFS.json').write_text(json.dumps({'tests':result.testsRun,'result':'FOCUSED_LOCAL_VALIDATED_NOT_OPERATIONAL','cases':RESULTS,'real':'published Bash, launcher/manifest authentication, source materialization, actual Node/closure26 RPC client over local socket, sealed FDs, concrete configuration consumers and corrected frontend adapter, filesystem reads and canonical private_record/export/ingest','simulated':'SSH shim, /proc identities/SO_PEERCRED projection and expected fixture hashes, Docker/psql-path/version, crontab/systemctl outputs; user/network/filesystem namespace, no VPS or SQL','unaffectedReused':'frontend reconciliation/integration negatives, R1/R2, recovery/authority, PM2 cluster proof, M1; no rerun','noOperationalCertification':True},indent=2)+'\n')
    raise SystemExit(0 if result.wasSuccessful()else 1)
