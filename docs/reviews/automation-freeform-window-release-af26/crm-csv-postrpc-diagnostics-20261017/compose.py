"""Offline derivation from the consumed no-ELF package. Does not execute a collector."""
import ast,hashlib,json,subprocess
from pathlib import Path
P=Path(__file__).resolve().parent;ROOT=next(x for x in P.parents if(x/'.git').exists())
BASE='9afc2197e4bbc58a6f6a7ae0d9f94d92189ad3a2';OLD='docs/reviews/automation-freeform-window-release-af26/crm-csv-three-gaps-noelf-20261017/'
REPLACE={
 'crm-csv-three-gaps-noelf-20261017':'crm-csv-postrpc-diagnostics-20261017',
 're7-csv-three-gaps-material-noelf-20261017-v1':'re7-csv-postrpc-material-20261017-v1',
 're7-csv-three-gaps-executable-tools-noelf-20261017-v1':'re7-csv-postrpc-tools-20261017-v1',
 're7-csv-three-gaps-executable-read-noelf-20261017-v1':'re7-csv-postrpc-read-20261017-v1',
 'csv-three-gaps-executable-noelf-20261017-v1':'csv-postrpc-diagnostics-20261017-v1',
 'csv-three-gaps-launcher-noelf-20261017-v1':'csv-postrpc-launcher-20261017-v1',
}
def source(n):
 b=subprocess.check_output(['git','show',BASE+':'+OLD+n],cwd=ROOT);assert b==(ROOT/OLD/n).read_bytes();return b

def main():
 index={}
 for n in('launch.py','driver.py','runner.py','seal.py','lab.py','test_blocks.py'):
  b=source(n);index[n]={'commit':BASE,'path':OLD+n,'sha256':hashlib.sha256(b).hexdigest()};s=b.decode()
  if n=='runner.py':
   start=s.index('def frontend(');end=s.index('\nINSPECT=',start)
   s=s[:start]+(P/'frontier.source').read_text()+s[end:]
   s=s.replace("cap.event('end',result='DENY_NO_RETRY',errorClass=type(e).__name__,errno=getattr(e,'errno',None),ownership='UNKNOWN')", "cap.event('end',result='DENY_NO_RETRY',errorClass=type(e).__name__,errno=getattr(e,'errno',None),ownership='UNKNOWN',denialStage=e.stage if isinstance(e,DiagnosticDenied)else None,denialReason=e.reason if isinstance(e,DiagnosticDenied)else None)")
  else:
   for a,v in REPLACE.items():s=s.replace(a,v)
  if n=='seal.py':
   s=s.replace('99c2198d80c61d8904cae56fbb4d093258e236d2','4f5bb477ece1cd605c1ad94a0af78a3ed7019292')
   s=s.replace('Somente blocos1/2 estão condicionalmente autorizados pelo owner, após publicação\ndo delta mínimo e provas aprovadas. Deploy, sem sudo; sem root observer. Bloco3 não autorizado.', 'Somente preparação/ensaios LOCAIS autorizados. Nenhum bloco remoto está autorizado.\nFutura coleta exige decisão expressa do owner. Sem sudo/root observer/SELECT.')
   s=s.replace('Executar uma vez somente após publicar as provas e confirmar o delta funcional exclusivo.', 'Não executar remotamente nesta etapa; somente laboratório e futura revisão.')
  if n=='lab.py':
   s=s.replace("    class LabPath(pathlib.PosixPath):", "    peer_calls=0;replacements=[]\n    class LabPath(pathlib.PosixPath):")
   point='    class LabSocket(realsocket):'
   helper="""        def lstat(self,*a,**kw):
            s=super().lstat(*a,**kw)
            if CASE=='socket-atime'and peer_calls>=2 and str(self)==str(fake/'home/deploy/.pm2/rpc.sock'):
                values=list(s);values[7]+=2
                return os.stat_result(values,{'st_atime':s.st_atime+2,'st_atime_ns':s.st_atime_ns+2000000000,'st_mtime':s.st_mtime,'st_mtime_ns':s.st_mtime_ns,'st_ctime':s.st_ctime,'st_ctime_ns':s.st_ctime_ns})
            return s
"""
   assert point in s;s=s.replace(point,helper+point)
   s=s.replace("        def getsockopt(self,level,opt,*args):\n", "        def getsockopt(self,level,opt,*args):\n            nonlocal peer_calls\n")
   key="                return struct.pack('3i',18677 if CASE=='peer-wrong'else 18676,os.getuid(),gid)"
   new="""                peer_calls+=1
                if peer_calls==2:
                    endpoint=fake/'home/deploy/.pm2/rpc.sock'
                    if CASE=='socket-replaced':
                        endpoint.unlink();replacement=realsocket(socket.AF_UNIX);replacement.bind(str(endpoint));replacements.append(replacement)
                    if CASE=='pid-changed':(fake/'home/deploy/.pm2/pm2.pid').write_bytes(b'18677\\n')
                    if CASE=='identity-absent':(fake/'proc/936386/stat').unlink()
                    if CASE=='ticks-changed':
                        p=fake/'proc/936386/stat';p.write_bytes(p.read_bytes().replace(b'2193413108',b'2193413109'))
                    ref=fake/'opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-csv-staged-v2-20261016T094000Z/window/saved-dump.pm2.private.json'
                    if CASE=='reference-hash':ref.write_bytes(ref.read_bytes()+b' ')
                    if CASE=='reference-absent':ref.unlink()
                    if CASE=='canonical-env':(fake/'proc/936386/environ').write_bytes(b'DATABASE_URL=SYNTHETIC_PRIVATE_MARKER\\0')
                return struct.pack('3i',18677 if CASE=='peer-wrong'else 18676,os.getuid(),gid)"""
   assert key in s;s=s.replace(key,new)
  if n=='test_blocks.py':
   s=s.replace("'--ro-bind','/','/','--ro-bind'","'--ro-bind','/','/','--bind',str(r/'fs'),str(r/'fs'),'--ro-bind'")
   s=s.replace("('valid','snapshot-substitution')","('valid','snapshot-substitution','socket-atime')")
   # Extend the established complete-chain harness, no verifier replacements.
   s=s.replace("self.assertFalse(records[-1].get('gatePass',False))", "self.assertFalse(records[-1].get('gatePass',False))\n                        expected_denials={'socket-replaced':('postrpc-socket-metadata','POSTRPC_SOCKET_METADATA_DRIFT'),'pid-changed':('postrpc-pid-content','POSTRPC_PID_CONTENT_DRIFT'),'identity-absent':('application-0-present','APPLICATION_IDENTITY_ABSENT'),'ticks-changed':('application-0-ticks','APPLICATION_START_TICKS_DRIFT'),'reference-hash':('saved-reference-hash','HISTORICAL_HASH_DRIFT'),'reference-absent':('saved-reference-read','HISTORICAL_READ_UNSTABLE'),'canonical-env':('pair-config-0','CANONICAL_ENVIRONMENT_DRIFT')}\n                        if case in expected_denials:\n                            final=rows[-1];self.assertEqual((final['denialStage'],final['denialReason']),expected_denials[case],[(x.get('event'),x.get('stage'),x.get('reason'),x.get('errorClass'),x.get('errno'),x.get('id'))for x in rows[-8:]]);self.assertNotIn('db-route',names)\n                            self.assertTrue(any(x['event']=='verification_denied'and x.get('reason')==expected_denials[case][1]for x in rows))\n                            for x in rows:\n                                if x['event']=='verification_denied':self.assertNotIn('SYNTHETIC_PRIVATE_MARKER',json.dumps(x))")
   # Do not rerun the unaffected old ingress/closure/timeout suite; retain it as reference.
   start=s.index('    def test_literal_complete(');end=s.index('\nRESULTS=[]',start)
   s=s[:start]+"""    def test_valid(self):RESULTS.append(self.exercise())
    def test_atime_only(self):RESULTS.append(self.exercise('socket-atime'))
    def test_socket_replaced(self):RESULTS.append(self.exercise('socket-replaced'))
    def test_pid_changed(self):RESULTS.append(self.exercise('pid-changed'))
    def test_identity_absent(self):RESULTS.append(self.exercise('identity-absent'))
    def test_ticks_changed(self):RESULTS.append(self.exercise('ticks-changed'))
    def test_reference_hash(self):RESULTS.append(self.exercise('reference-hash'))
    def test_reference_absent(self):RESULTS.append(self.exercise('reference-absent'))
    def test_canonical_environment(self):RESULTS.append(self.exercise('canonical-env'))
"""+s[end:]
  (P/n).write_text(s)
 (P/'SOURCE_INDEX.json').write_text(json.dumps({'base':'4f5bb477ece1cd605c1ad94a0af78a3ed7019292','sources':index,'frontierSha256':hashlib.sha256((P/'frontier.source').read_bytes()).hexdigest(),'noOperationalAuthorization':True},sort_keys=True,indent=2)+'\n')
 # All non-frontier runtime functions/constants are exact accepted bodies.
 before=ast.parse(source('runner.py'));after=ast.parse((P/'runner.py').read_bytes())
 for n in before.body:
  if isinstance(n,(ast.FunctionDef,ast.ClassDef))and n.name not in('frontend','run'):
   peer=next(x for x in after.body if isinstance(x,type(n))and x.name==n.name);assert ast.dump(n)==ast.dump(peer),n.name
 print('PINNED_DERIVATION_NON_FRONTIER_CONSUMERS_UNCHANGED')
if __name__=='__main__':main()
