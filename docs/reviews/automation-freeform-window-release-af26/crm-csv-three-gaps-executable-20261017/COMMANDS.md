# Roteiro final único — SOMENTE PARA REVISÃO

Nenhuma execução remota autorizada nesta entrega. Deploy, sem sudo; sem root observer.
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
sem npm/build. Cria somente /dev/shm/re7-csv-three-gaps-material-20261017-v1, owner700. Todas as fontes têm procedência em MANIFEST.json.
Se faltar fonte: DENY, sem download/fallback; journal canônico preservado.
```bash
(
set -euo pipefail
umask 077
python3 -B -I -S - <<'REVIEWED_LOCAL'
import hashlib,os,stat,sys
from pathlib import Path
p=Path('/home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/tmp/worktrees/re7-campaign-recovery-20260926/docs/reviews/automation-freeform-window-release-af26/crm-csv-three-gaps-executable-20261017')
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
assert hashlib.sha256(raw).hexdigest()=='5922f70646b6e20969abaccad0e834742127822e812012dc75144ffb67805bc4','reviewed_launcher'
sys.argv=[str(f),str(p),'3b3990e8fdfa5087064745ce3e2ddd9d7e704d080e21096e6b30d9e44a0439ba','materialize']
exec(compile(raw,str(f),'exec'),{'__name__':'__main__','__file__':str(f)})
REVIEWED_LOCAL
)
```

## 2. Transferência única + gates1–3 + custódia

Executar somente após aprovação futura deste roteiro. O único SSH envia os bytes
inativos, coleta e devolve o envelope inclusive em DENY. Não há segunda conexão
para tentar recuperar resposta perdida. A cópia privada local preserva stdout/stderr
parciais e registra falha de custódia; a origem remota fica intacta.

```bash
(
set -euo pipefail
umask 077
python3 -B -I -S - <<'REVIEWED_LOCAL'
import hashlib,os,stat,sys
from pathlib import Path
p=Path('/home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/tmp/worktrees/re7-campaign-recovery-20260926/docs/reviews/automation-freeform-window-release-af26/crm-csv-three-gaps-executable-20261017')
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
assert hashlib.sha256(raw).hexdigest()=='5922f70646b6e20969abaccad0e834742127822e812012dc75144ffb67805bc4','reviewed_launcher'
sys.argv=[str(f),str(p),'3b3990e8fdfa5087064745ce3e2ddd9d7e704d080e21096e6b30d9e44a0439ba','collect']
exec(compile(raw,str(f),'exec'),{'__name__':'__main__','__file__':str(f)})
REVIEWED_LOCAL
)
```

## 3. SELECT — APENAS APÓS AUTORIZAÇÃO ESPECÍFICA

Este bloco NÃO faz parte da autorização de gates1–3. Exige custódia anterior PASS
e nova decisão explícita. Revalida gates1–3 em destinos -sql novos antes de qualquer
conexão. Mudança nega. Não é certificado de saída/ownership, não chama observer root.

```bash
(
set -euo pipefail
umask 077
python3 -B -I -S - <<'REVIEWED_LOCAL'
import hashlib,os,stat,sys
from pathlib import Path
p=Path('/home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/tmp/worktrees/re7-campaign-recovery-20260926/docs/reviews/automation-freeform-window-release-af26/crm-csv-three-gaps-executable-20261017')
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
assert hashlib.sha256(raw).hexdigest()=='5922f70646b6e20969abaccad0e834742127822e812012dc75144ffb67805bc4','reviewed_launcher'
sys.argv=[str(f),str(p),'3b3990e8fdfa5087064745ce3e2ddd9d7e704d080e21096e6b30d9e44a0439ba','select-owner-authorized']
exec(compile(raw,str(f),'exec'),{'__name__':'__main__','__file__':str(f)})
REVIEWED_LOCAL
)
```

## Gates, dados privados e parada

1. Fontes/closure: manifesto literal, arquivos estáveis/no-follow, 26 membros exatos.
   O cliente Node resolve só esses bytes em memória de memfd selado; nenhum require
   de arquivo transferido por caminho. Node ELF/DT_NEEDED são observados via cadeia
   e readelf; proteção do toolchain instalado continua requisito operacional separado.
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

Destinos remotos novos: /dev/shm/re7-csv-three-gaps-executable-tools-20261017-v1
 e /dev/shm/re7-csv-three-gaps-executable-read-20261017-v1 (mais sufixo -sql no bloco3).
Custódia LOCAL: /home/deifson-oliveira/DEIFSON/re7-private-retention-custody/
 csv-three-gaps-executable-20261017-v1 (mais sufixo -sql no bloco3).
A materialização/launcher também preserva canais e falhas diretamente na custódia
LOCAL, em csv-three-gaps-launcher-20261017-v1-{materialize,collect,select-owner-authorized}.
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
