"""Derive only readelf separation + exclusive destinations from the accepted package."""
import ast,hashlib,json,subprocess
from pathlib import Path
P=Path(__file__).resolve().parent;ROOT=next(p for p in P.parents if(p/'.git').exists())
COMMIT='63752b5f2b6e1d2e1718d6337b79b7f1e39d6f4f'
OLD='docs/reviews/automation-freeform-window-release-af26/crm-csv-three-gaps-executable-20261017/'
RENAMES={
 'crm-csv-three-gaps-executable-20261017':'crm-csv-three-gaps-noelf-20261017',
 're7-csv-three-gaps-material-20261017-v1':'re7-csv-three-gaps-material-noelf-20261017-v1',
 're7-csv-three-gaps-executable-tools-20261017-v1':'re7-csv-three-gaps-executable-tools-noelf-20261017-v1',
 're7-csv-three-gaps-executable-read-20261017-v1':'re7-csv-three-gaps-executable-read-noelf-20261017-v1',
 'csv-three-gaps-executable-20261017-v1':'csv-three-gaps-executable-noelf-20261017-v1',
 'csv-three-gaps-launcher-20261017-v1':'csv-three-gaps-launcher-noelf-20261017-v1',
}
REMOVED="        cap.command('node-elf',['/usr/bin/readelf','--wide','--program-headers','--dynamic','/usr/bin/node'])\n"
ADDED="        cap.event('ELF_OPERATIONAL_CLOSURE_NOT_CHECKED',elfChecked=False,operationalToolchainCertified=False)\n"
def source(n):
 raw=subprocess.check_output(['git','show',COMMIT+':'+OLD+n],cwd=ROOT)
 assert raw==(ROOT/OLD/n).read_bytes(),'historical_source_changed'
 return raw
def destinations(s):
 for old,new in RENAMES.items():s=s.replace(old,new)
 return s

def main():
 sources={}
 for n in ('launch.py','driver.py','runner.py','seal.py','lab.py','test_blocks.py'):
  raw=source(n);sources[n]={'path':OLD+n,'commit':COMMIT,'sha256':hashlib.sha256(raw).hexdigest()}
  s=raw.decode()
  if n=='runner.py':
   assert s.count(REMOVED)==1;s=s.replace(REMOVED,ADDED)
  else:s=destinations(s)
  if n=='seal.py':
   s=s.replace("for n in ('launch.py','driver.py','runner.py','node_snapshot.cjs'):add(n,P/n,True)","for n in ('launch.py','driver.py','runner.py'):add(n,P/n,True)\nadd('node_snapshot.cjs',review/'crm-csv-three-gaps-executable-20261017/node_snapshot.cjs',True)")
   s=s.replace('9101b4f245a7ceb2bc769cb8a1388d7a179472f6','99c2198d80c61d8904cae56fbb4d093258e236d2')
   s=s.replace('Nenhuma execução remota autorizada nesta entrega. Deploy, sem sudo; sem root observer.', 'Somente blocos1/2 estão condicionalmente autorizados pelo owner, após publicação\ndo delta mínimo e provas aprovadas. Deploy, sem sudo; sem root observer. Bloco3 não autorizado.')
   s=s.replace('Executar somente após aprovação futura deste roteiro.', 'Executar uma vez somente após publicar as provas e confirmar o delta funcional exclusivo.')
   s=s.replace('de arquivo transferido por caminho. Node ELF/DT_NEEDED são observados via cadeia\n   e readelf; proteção do toolchain instalado continua requisito operacional separado.', 'de arquivo transferido por caminho. Hash/cadeia Node e FD da imagem são preservados.\n   ELF/closure operacional NÃO CONFERIDA: não executar readelf nem alternativa;\n   não há PASS de toolchain. Proteção instalada continua requisito separado.')
  if n=='lab.py':
   old="        if args[:2]==['/usr/bin/readelf','--wide']:args=[*args[:-1],NODE]"
   assert old in s
   s=s.replace(old,"        if args[0]=='/usr/bin/readelf':\n            (ROOT/'readelf-called').write_text('UNEXPECTED_CALL')\n            raise FileNotFoundError(2,'readelf unavailable in laboratory')")
  if n=='test_blocks.py':
   s=s.replace("'--bind',str(r/'shm'),'/dev/shm'", "'--ro-bind','/dev/null','/usr/bin/readelf','--bind',str(r/'shm'),'/dev/shm'")
   s=s.replace('self.exercise(sql=True)','self.exercise(sql=False)')
   s=s.replace("self.assertFalse(any(x.get('id')in('identity','ownership','imports')for x in rows))", "self.assertFalse(any(x.get('id')in('node-elf','identity','ownership','imports')for x in rows))\n                        elf=[x for x in rows if x['event']=='ELF_OPERATIONAL_CLOSURE_NOT_CHECKED']\n                        self.assertEqual(len(elf),1);self.assertIs(elf[0]['elfChecked'],False);self.assertIs(elf[0]['operationalToolchainCertified'],False)\n                        self.assertTrue({'pm2-rpc','frontend-contract','db-route','sql-client-path','sql-client-version'}<={x.get('id')for x in rows})")
   s=s.replace("'sqlTransportSynthetic':sql}","'sqlTransportSynthetic':sql,'readelfUnavailable':True,'readelfCalled':False,'operationalElfClosureCertified':False}")
   s=s.replace("finally:\n                    if server:","finally:\n                    self.assertFalse((r/'readelf-called').exists())\n                    if server:")
  (P/n).write_text(s)
 assert (P/'runner.py').read_bytes()==source('runner.py').replace(REMOVED.encode(),ADDED.encode())
 for n in ('launch.py','driver.py'):assert(P/n).read_text()==destinations(source(n).decode())
 proof={'base':'99c2198d80c61d8904cae56fbb4d093258e236d2','derivedFrom':COMMIT,'functionalDeltaExclusive':True,
        'runnerChange':'exactly one readelf command replaced by explicit unverified ELF event','operationalConstantsUnchanged':True,
        'driverAndLaunchChanges':'exclusive destinations/package name only','newOperationalAuthorities':False,'sourceFiles':sources}
 (P/'DELTA_SCOPE.json').write_text(json.dumps(proof,indent=2,sort_keys=True)+'\n')
 print('EXCLUSIVE_FUNCTIONAL_DELTA_AND_PRESERVED_CONTROLS_CONFIRMED')
if __name__=='__main__':main()
