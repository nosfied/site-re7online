"""Offline publication indices only. Never runs a collector or modifies prior packages."""
import hashlib,json,os
from pathlib import Path
P=Path(__file__).resolve().parent;root=next(p for p in P.parents if (p/'.git').exists());review=P.parent
h=lambda b:hashlib.sha256(b).hexdigest()
files={}
def add(name,source,bootstrap=False):
    raw=source.read_bytes();src=str(source.relative_to(root))if source.is_relative_to(root)else str(source)
    files[name]={'source':src,'relativeSource':os.path.relpath(source,P),'bytes':len(raw),'sha256':h(raw),'bootstrap':bootstrap}
for n in ('launch.py','driver.py','runner.py'):add(n,P/n,True)
add('node_snapshot.cjs',review/'crm-csv-three-gaps-executable-20261017/node_snapshot.cjs',True)
old=review/'crm-csv-three-gaps-procedure-20261017'
for n in ('contracts.py','pm2_rpc_fd.cjs','identity.sql','ownership.sql','imports.sql'):add(n,old/n,n=='contracts.py')
add('ops.source',review/'crm-csv-review-publication-20261016/code-sources/ops.py.c84a5e059cbc.source')
add('capture_imports.source',review/'crm-csv-operational-20261016/capture_imports.py')
for n in ('read_package.py','privileged_output.source'):add(n,review/'crm-csv-r2-directed-20261017'/n,True)
closure=json.loads((old/'CLOSURE.json').read_bytes())
for n,digest in closure['files'].items():
    source=Path('/tmp/re7-b4-toolchain-20261016/node_modules')/n
    assert h(source.read_bytes())==digest
    add('rpc/node_modules/'+n,source)
manifest={'base':'99c2198d80c61d8904cae56fbb4d093258e236d2','scope':'inactive diagnostic only; not installed phase authority','files':files,
 'closureProvenance':{'path':str((old/'CLOSURE.json').relative_to(root)),'sha256':h((old/'CLOSURE.json').read_bytes())}}
raw=(json.dumps(manifest,sort_keys=True,indent=2)+'\n').encode();(P/'MANIFEST.json').write_bytes(raw)
launch=h((P/'launch.py').read_bytes());digest=h(raw)
header='''# Roteiro final único — SOMENTE PARA REVISÃO

Somente blocos1/2 estão condicionalmente autorizados pelo owner, após publicação
do delta mínimo e provas aprovadas. Deploy, sem sudo; sem root observer. Bloco3 não autorizado.
Falha/timeout/destino existente/drift: preservar, parar, sem retry ou reparo.
Os dois destinos remotos e a custódia são exclusivos; o sufixo -sql é reservado
à decisão separada de SELECT. Não reutilizar ações antigas nem materiais consumidos.

A autoridade dos hashes abaixo é a revisão destes bytes pelo owner; não são pins
produtivos, instalação de autoridade nem autorização de SELECT. O launcher é lido
uma vez com FD/no-follow/metadata pré/pós, comparado ao literal e compilado dos mesmos
bytes. O manifest autenticado ancora fontes e closure26. O bootstrap remoto recebe
uma única fotografia de bytes, verifica o mesmo manifest e compila essa fotografia.

## 1. Materialização LOCAL inativa

No ThinkPad, checkout canônico. Não precisa rede. Reutiliza closure26 local já pinada,
sem npm/build. Cria somente /dev/shm/re7-csv-three-gaps-material-noelf-20261017-v1, owner700. Todas as fontes têm procedência em MANIFEST.json.
Se faltar fonte: DENY, sem download/fallback; journal canônico preservado.
'''
body=header
for title,action in [(None,'materialize'),('2. Transferência única + gates1–3 + custódia','collect'),('3. SELECT — APENAS APÓS AUTORIZAÇÃO ESPECÍFICA','select-owner-authorized')]:
    if title:body+='\n## '+title+'\n\n'
    if action=='collect':body+='Executar uma vez somente após publicar as provas e confirmar o delta funcional exclusivo. O único SSH envia os bytes\ninativos, coleta e devolve o envelope inclusive em DENY. Não há segunda conexão\npara tentar recuperar resposta perdida. A cópia privada local preserva stdout/stderr\nparciais e registra falha de custódia; a origem remota fica intacta.\n\n'
    if action.startswith('select'):body+='Este bloco NÃO faz parte da autorização de gates1–3. Exige custódia anterior PASS\ne nova decisão explícita. Revalida gates1–3 em destinos -sql novos antes de qualquer\nconexão. Mudança nega. Não é certificado de saída/ownership, não chama observer root.\n\n'
    body+='''```bash
(
set -euo pipefail
umask 077
python3 -B -I -S - <<'REVIEWED_LOCAL'
import hashlib,os,stat,sys
from pathlib import Path
p=Path('''+repr(str(P))+''')
f=p/'launch.py'
for q in (f,*f.parents):assert not q.is_symlink(),'launcher_symlink'
def meta(s):return tuple(getattr(s,'st_'+k)for k in ('dev','ino','mode','uid','gid','nlink','size','mtime_ns','ctime_ns'))
s=f.lstat();assert stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_size<65536,'launcher_metadata'
fd=os.open(f,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
try:
 assert meta(os.fstat(fd))==meta(s),'launcher_replaced'
 raw=os.read(fd,65536)
 assert meta(os.fstat(fd))==meta(s) and meta(f.lstat())==meta(s),'launcher_changed'
finally:os.close(fd)
assert hashlib.sha256(raw).hexdigest()=='''+repr(launch)+''','reviewed_launcher'
sys.argv=[str(f),str(p),'''+repr(digest)+','+repr(action)+''']
exec(compile(raw,str(f),'exec'),{'__name__':'__main__','__file__':str(f)})
REVIEWED_LOCAL
)
```
'''
body+='''
## Gates, dados privados e parada

1. Fontes/closure: manifesto literal, arquivos estáveis/no-follow, 26 membros exatos.
   O cliente Node resolve só esses bytes em memória de memfd selado; nenhum require
   de arquivo transferido por caminho. Hash/cadeia Node e FD da imagem são preservados.
   ELF/closure operacional NÃO CONFERIDA: não executar readelf nem alternativa;
   não há PASS de toolchain. Proteção instalada continua requisito separado.
2. RPC: um FD para daemon existente, SO_PEERCRED/ticks/PID e socket antes/depois;
   uma chamada getMonitorData. Não usa PM2 CLI/API/connect/respawn. Configuração
   usa Operations.config/System.check_config reais, extraídos sem executar ops.main.
   Frontend é comparado ao dump pré-janela (env completo), não ao env da sessão SSH.
   Saved/fallback preservam todos os campos, apenas axm_monitor pode divergir.
3. Rota: System.db_container real, ID/IP/publicação iguais ao binding histórico;
   URL dos dois consumidores deve corresponder a host/porta/database/role. Docker
   inspect exclui Config.Env; cliente por ID literal, psql path/versão16 registrados.
   Imagem observada vinculada ao mesmo ID canônico; sem alegar imagem pristine.
4. SELECT: só bloco3 separado; três SQLs byte-exatos, READ ONLY/timeouts/ROLLBACK.
   Rota revalidada antes/depois de cada consulta. Identidade/versão/read_only são
   conferidos; classify canônico é extraído dos mesmos bytes, sem capture().
   Falta de atribuição de backends/locks mantém UNKNOWN. Não elevar privilégios.

Destinos remotos novos: /dev/shm/re7-csv-three-gaps-executable-tools-noelf-20261017-v1
 e /dev/shm/re7-csv-three-gaps-executable-read-noelf-20261017-v1 (mais sufixo -sql no bloco3).
Custódia LOCAL: /home/deifson-oliveira/DEIFSON/re7-private-retention-custody/
 csv-three-gaps-executable-noelf-20261017-v1 (mais sufixo -sql no bloco3).
A materialização/launcher também preserva canais e falhas diretamente na custódia
LOCAL, em csv-three-gaps-launcher-noelf-20261017-v1-{materialize,collect,select-owner-authorized}.
Sem writer canônico íntegro ou parent legítimo, parar antes de qualquer ação: não
fabricar journal ou corrigir o destino. Nesse caso só haverá o erro sanitizado do
bootstrap; nenhuma coleta será iniciada.
Não criar/ajustar parents privados automaticamente. O journal original de cada
comando contém argv, início/fim, código, errno, tamanhos/hashes e bytesBase64 dos
canais; envelope exportado e stdin-fonte são ancorados ao manifest. Custódia usa
private_record original, preserva raw antes de validar e nunca promove DENY antigo.

Coletas são intervalos, não snapshot atômico. Ausência/drift de PID histórico nega;
não descobre substitutos. Produção, NEWauth+NEWDB+NEWcipher, crons, guarda38 e out.15
permanecem intocados. Não instala bibliotecas, políticas, helpers ou permissões.
'''
(P/'COMMANDS.md').write_text(body)
print(json.dumps({'manifestSha256':digest,'launcherSha256':launch,'files':len(files),'sourceBytes':sum(x['bytes']for x in files.values())}))
