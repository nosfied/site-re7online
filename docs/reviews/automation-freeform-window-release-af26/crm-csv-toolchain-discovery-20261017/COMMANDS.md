# Descoberta remota / análise ELF LOCAL — somente para revisão

O roteiro de002b46a6 NÃO DEVE SER EXECUTADO: exigia readelf remoto apesar do
ENOENT de lançamento já preservado. ENOENT não distingue executável/loader ausente.
Esta correção não instala nem busca alternativa remota. Nenhuma execução VPS
nesta rodada. Aprovação futura separada; deploy SEM sudo; sem retry/fallback.

## Materiais comparados e orçamento ANTES de transferir

- Referência Node produtiva d01614ef…,97.661.912B: somente hash/metadados nas
  custódias R2 aceitas; imagem correspondente não existe entre as fontes pinadas
  examinadas. Node local af8d5d1e… difere, não substitui. PM2/lock/closure26/prova
  completa já disponíveis são reutilizados nos respectivos alcances, não recopiados.
- Só ELF selecionado + ELF dos mapas do daemon no intervalo, deduplicados por SHA.
  Máximo64 objetos,128MiB RAW TOTAL (não128MiB cada),128MiB por leitura de imagem.
  Sem runtime/tree/node_modules. Justificativa, identidade, cadeia/metadados e hash
  por objeto. Se exceder, DENY, sem elevar limite ou escolher arbitrariamente libs.
- Reserva da operação:512MiB remotos e2GiB locais, conferidas antes das cópias.
  São orçamento deste lote, NÃO reservas canônicas deploy/PostgreSQL nem PASS de
  capacidade de janela. Incluem canais/journals e margem; readelf <=1MiB/canal/ELF.
- Apenas metadados/journal (<8MiB pelo export canônico) via SSH; imagens são arquivos
  privados600 em images700. SCP único desse diretório exato; sem glob/runtime inteiro.
  Ingestão canônica byte-exata do journal, hashes individuais e revalidação dos FDs
  das imagens locais antes/depois de análise. Parcial permanece privado em falha.

## Destinos novos

LOCAL material /dev/shm/re7-csv-toolchain-material-20261017-v2;
VPS inativos /dev/shm/re7-csv-toolchain-tools-20261017-v2;
VPS resultados /dev/shm/re7-csv-toolchain-read-20261017-v2 (images/).
LOCAL custódia legítima /home/deifson-oliveira/DEIFSON/re7-private-retention-custody:
 csv-toolchain-discovery-20261017-v2 e csv-toolchain-analysis-20261017-v2;
 diagnósticos csv-toolchain-launcher-20261017-v2-{materialize,collect,receive-analyze}.
Parents privados owner700 existentes; sem criar/reparar parent; novos destinos
exclusivos700/600. Destino existente nega sem sobrescrever nem repetir.

## Ferramentas e confiança

LOCAL /usr/bin/python3 e /usr/bin/readelf; SSH/SCP pelos acessos existentes.
Materialização local confere readelf (cadeia root sem escrita terceiros, ELF,
executável, FD estável), executa --version pelo FD e preserva tool/hash/saída privada.
Ausente/negado/alterado: nega ANTES de transferir. Revalida o MESMO tool na análise.
Manifest e launcher aprovados no Git carregam os mesmos bytes autenticados, sem
hash seguido de import de caminho substituível. Sete fontes; sem novo framework.
Remoto usa apenas Python/leitor/custódia existentes; não invoca readelf, Node, PM2,
CJS, ldd, loader, SQL ou código capturado. Consulta e criação de artefatos inativos
não são instalação/proteção. SCP recebe nomes content-addressed .elf, não scripts.

## 1. Materialização e comprovação LOCAL do analisador — aprovação futura

```bash
(
set -euo pipefail
umask 077
python3 -B -I -S - <<'REVIEWED_LOCAL'
import hashlib,os,stat,sys
from pathlib import Path
p=Path('/home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/tmp/worktrees/re7-campaign-recovery-20260926/docs/reviews/automation-freeform-window-release-af26/crm-csv-toolchain-discovery-20261017')
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
assert hashlib.sha256(raw).hexdigest()=='1ba68f5cb5bc521b95a7035ecd048852c0072e85df08cf4ba18277be64e705e0','reviewed_launcher'
sys.argv=[str(f),str(p),'707726e11f30ada8ef9f80f2fc7b6f84a1a737eca1b614738cf57f99c14f7dfa','materialize']
exec(compile(raw,str(f),'exec'),{'__name__':'__main__','__file__':str(f)})
REVIEWED_LOCAL
)
```

## 2. Coleta remota de bytes sem analisador + custódia — aprovação futura

```bash
(
set -euo pipefail
umask 077
python3 -B -I -S - <<'REVIEWED_LOCAL'
import hashlib,os,stat,sys
from pathlib import Path
p=Path('/home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/tmp/worktrees/re7-campaign-recovery-20260926/docs/reviews/automation-freeform-window-release-af26/crm-csv-toolchain-discovery-20261017')
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
assert hashlib.sha256(raw).hexdigest()=='1ba68f5cb5bc521b95a7035ecd048852c0072e85df08cf4ba18277be64e705e0','reviewed_launcher'
sys.argv=[str(f),str(p),'707726e11f30ada8ef9f80f2fc7b6f84a1a737eca1b614738cf57f99c14f7dfa','collect']
exec(compile(raw,str(f),'exec'),{'__name__':'__main__','__file__':str(f)})
REVIEWED_LOCAL
)
```

## 3. Recepção única dos ELF e análise LOCAL — aprovação futura

```bash
(
set -euo pipefail
umask 077
python3 -B -I -S - <<'REVIEWED_LOCAL'
import hashlib,os,stat,sys
from pathlib import Path
p=Path('/home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/tmp/worktrees/re7-campaign-recovery-20260926/docs/reviews/automation-freeform-window-release-af26/crm-csv-toolchain-discovery-20261017')
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
assert hashlib.sha256(raw).hexdigest()=='1ba68f5cb5bc521b95a7035ecd048852c0072e85df08cf4ba18277be64e705e0','reviewed_launcher'
sys.argv=[str(f),str(p),'707726e11f30ada8ef9f80f2fc7b6f84a1a737eca1b614738cf57f99c14f7dfa','receive-analyze']
exec(compile(raw,str(f),'exec'),{'__name__':'__main__','__file__':str(f)})
REVIEWED_LOCAL
)
```

## Alcance e parada

Coleta conserva a resolução PM2/CLEAN.PATH e a referência d016; boot/pid/ticks/exe/
maps pré/pós são intervalo, não snapshot ou identidade atual derivada de PID antigo.
Revalida hashes, FDs, caminhos e população observada; identidade/drift/leitura negada
nega. Só publica bytes ELF inteiros necessários ao readelf local; não extrai ELF
com parser alternativo. Duplicatas por hash não geram cópia adicional.

Bloco3 usa journal custodiado da MESMA execução/manifest; verifica conjuntos exatos,
nomes SHA/bytes, owner600/nlink1, limites e metadados no FD. SCP parcial preserva o
que chegou e nega sem readelf/retry. Mesmo uma origem DENY pode conservar bytes já
publicados: análise marca sourceComplete=false, nunca reclassifica a origem.
Ausência de objetos publicados nega sem transferência. Raw origin permanece intacto.

readelf LOCAL: --wide --program-headers --dynamic, ferramenta e alvo por FD;
15s/objeto, HARD1MiB por stdout/stderr com temporários anônimos no destino privado.
Nunca executa o ELF capturado ou seu loader, nem ldd. Cada comando preserva argv,
início/fim, código, errno, tamanho/hash e canais pelo private_record existente.
SSH180s, SCP240s. Falha/timeout/destino existente: preservar e parar, sem retry,
reparo, privilégio ou repetição de tentativa. Resposta perdida não vira COMPLETE.

PT_INTERP/NEEDED/RPATH e mapas continuam requerendo reconciliação offline; cargas
futuras e JS transitivo não observado UNKNOWN. Nenhuma certificação integral de
closure/proteção por hash/versão/quantidade. Resultados: descoberta e análise local
NOT_CERTIFIED ou DENY. SQL/ownership, identidades finais, autoridade/proteção futuras
continuam separados. CSV SUSPENSO / NOT DEPLOYED / NOT WINDOW READY.
