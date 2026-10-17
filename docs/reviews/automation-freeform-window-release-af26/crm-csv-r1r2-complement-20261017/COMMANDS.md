# Complementação R1/R2 — roteiro novo PARA REVISÃO, NÃO EXECUTAR

**Nenhuma coleta está autorizada nesta etapa.** CSV SUSPENSO / NOT DEPLOYED /
NOT WINDOW READY. Este roteiro não repete nem completa retroativamente a tentativa
original consumida. A aprovação futura deverá cobrir esta complementação específica.

## Destinos novos e vínculo imutável

| Uso | Destino |
|---|---|
| Ferramentas inativas | `/dev/shm/re7-csv-r1r2-complement-tools-20261017-v1` |
| Coleta complementar | `/dev/shm/re7-csv-r1r2-complement-read-20261017-v1` |
| Custódia local nova | `/home/deifson-oliveira/DEIFSON/re7-private-retention-custody/csv-r1r2-complement-read-20261017-v1` |

Os destinos novos não podem existir. Criação exclusiva700; evidências600; mesmo
contrato privado do roteiro anterior; não chmod/chown, criar pai recursivo,
limpar, sobrescrever ou retomar parcialmente. Pai local existente owner700 e sem
symlinks. A origem local consumida permanece somente leitura em
`csv-r1r2-read-20261016-v1/original-capture.private.jsonl`, SHA
`931c9c39a6332ab4bea8a57869767c78a57eecce164ecd006346e85f44983529`,87.778B.
Não transferir esse original à VPS, não reescrever seus journals DENY.

Os bytes novos começam por declarar a referência ORIGIN (hash/tamanho, reader e
stdout antigos, horários originais e18 observações). Na custódia, verify_origin
confere os bytes efetivamente preservados e o estado DENY. Essa referência não é
uma prova atual de processos nem autorização produtiva. Nenhuma linha faltante
é inventada; nenhuma antiga recebe timestamp novo.

## 0 — precondição LOCAL, somente leitura, após aprovação futura

Confere a origem privada existente, sem criar destinos ou alterar seu recibo:

```bash
(
set -euo pipefail
umask 077
R=/home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/tmp/worktrees/re7-campaign-recovery-20260926/docs/reviews/automation-freeform-window-release-af26/crm-csv-r1r2-complement-20261017
python3 -B -I -S - "$R" <<'REVIEWED_READER'
import hashlib,os,stat,sys
from pathlib import Path
p=Path(sys.argv[1]);d=p.lstat()
assert stat.S_ISDIR(d.st_mode) and not p.is_symlink() and d.st_uid==os.getuid(),'tools_directory'
if str(p)=='/dev/shm/re7-csv-r1r2-complement-tools-20261017-v1':
 assert stat.S_IMODE(d.st_mode)==0o700,'private_tools_directory'
for q in p.parents:
 assert not q.is_symlink(),'tools_ancestor_symlink'
raws={}
for n,h in [('read_package.py','cdfb33b281d69db2e3eba9ea6c7a71eb1ee575a5864f13d8729bcc24a80e5d47'),('privileged_output.source','93a114516a19b6d0acee5d2d810f298d856efd22c6905452d81651db65e3271a')]:
 f=p/n;s=f.lstat()
 assert stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_uid==os.getuid(),'tools_file'
 fd=os.open(f,os.O_RDONLY|os.O_NOFOLLOW)
 with os.fdopen(fd,'rb') as stream:
  t=os.fstat(stream.fileno());assert (t.st_dev,t.st_ino)==(s.st_dev,s.st_ino),'tools_replaced'
  raw=stream.read()
 assert hashlib.sha256(raw).hexdigest()==h,'reviewed_bytes'
 raws[n]=raw
raw=raws['read_package.py']
sys.argv=[str(p/'read_package.py'),'check-origin']
exec(compile(raw,str(p/'read_package.py'),'exec'),{'__name__':'__main__','__file__':str(p/'read_package.py'),'APPROVED_RAW':raw})
REVIEWED_READER
)

```

Esperado ORIGINAL_DENY_REFERENCE_VERIFIED_NO_WRITE. Falha ou divergência: parar.
A segunda conferência dessa mesma origem antes da transferência é uma
**revalidação local** necessária, não captura produtiva ou atualização de época.

## 1 — disponibilizar dois arquivos inativos, uma vez, após aprovação futura

Na sessão deploy da VPS, criar somente o novo diretório de ferramentas:

```bash
(
set -euo pipefail
umask 077
T=/dev/shm/re7-csv-r1r2-complement-tools-20261017-v1
test ! -e "$T" && test ! -L "$T"
mkdir -m 700 "$T"
test "$(stat -c %u "$T")" = "$(id -u)"
test "$(stat -c %a "$T")" = 700
)

```

No terminal LOCAL ThinkPad, conferir hashes e transferir uma vez:

```bash
(
set -euo pipefail
R=/home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/tmp/worktrees/re7-campaign-recovery-20260926/docs/reviews/automation-freeform-window-release-af26/crm-csv-r1r2-complement-20261017
test "$(sha256sum "$R/read_package.py" | cut -d' ' -f1)" = cdfb33b281d69db2e3eba9ea6c7a71eb1ee575a5864f13d8729bcc24a80e5d47
test "$(sha256sum "$R/privileged_output.source" | cut -d' ' -f1)" = 93a114516a19b6d0acee5d2d810f298d856efd22c6905452d81651db65e3271a
scp -B -o StrictHostKeyChecking=yes "$R/read_package.py" "$R/privileged_output.source" deploy@admin.re7online.com:/dev/shm/re7-csv-r1r2-complement-tools-20261017-v1/
)

```

Falha/timeout/parcial: parar e preservar; não repetir scp ou reutilizar destino.
Nenhum arquivo é instalado em libexec/sudoers. Nenhum source da geração anterior
é editado. O módulo canônico permanece93a11451… byte-exato.

## 2 — coleta complementar única na sessão real do owner

Somente após aprovação, o owner autentica **na mesma janela/TTY que executará o
bloco**, sem senha pelo chat. Não usar o terminal interno da ferramenta ou tentar
aproveitar ticket de outro TTY.

```bash
sudo -v
```

Depois, bloco único; sem espera/retry de sudo dentro do reader:

```bash
(
set -euo pipefail
umask 077
R=/dev/shm/re7-csv-r1r2-complement-tools-20261017-v1
python3 -B -I -S - "$R" <<'REVIEWED_READER'
import hashlib,os,stat,sys
from pathlib import Path
p=Path(sys.argv[1]);d=p.lstat()
assert stat.S_ISDIR(d.st_mode) and not p.is_symlink() and d.st_uid==os.getuid(),'tools_directory'
if str(p)=='/dev/shm/re7-csv-r1r2-complement-tools-20261017-v1':
 assert stat.S_IMODE(d.st_mode)==0o700,'private_tools_directory'
for q in p.parents:
 assert not q.is_symlink(),'tools_ancestor_symlink'
raws={}
for n,h in [('read_package.py','cdfb33b281d69db2e3eba9ea6c7a71eb1ee575a5864f13d8729bcc24a80e5d47'),('privileged_output.source','93a114516a19b6d0acee5d2d810f298d856efd22c6905452d81651db65e3271a')]:
 f=p/n;s=f.lstat()
 assert stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_uid==os.getuid(),'tools_file'
 fd=os.open(f,os.O_RDONLY|os.O_NOFOLLOW)
 with os.fdopen(fd,'rb') as stream:
  t=os.fstat(stream.fileno());assert (t.st_dev,t.st_ino)==(s.st_dev,s.st_ino),'tools_replaced'
  raw=stream.read()
 assert hashlib.sha256(raw).hexdigest()==h,'reviewed_bytes'
 raws[n]=raw
raw=raws['read_package.py']
sys.argv=[str(p/'read_package.py'),'collect']
exec(compile(raw,str(p/'read_package.py'),'exec'),{'__name__':'__main__','__file__':str(p/'read_package.py'),'APPROVED_RAW':raw})
REVIEWED_READER
)

```

Escopo remoto exato: boot_id, depois crontab-l deploy, systemctl-show supervisão,
ps com metadados sem args/env, ss-ltnp e descoberta command-v node/pm2 sem executar
PM2. Os cinco argv finais são idênticos ao roteiro anterior. Ausência de resolução
no PATH é registrada como NOT_RESOLVED_IN_FIXED_PATH, sem fechar R4.
O root reader só observa `/proc/sys/kernel/random/boot_id`, por pais/FDs no-follow,
**uma única os.read de64 bytes escolhida antes da leitura** e UUID canônico
minúsculo8-4-4-4-12 + newline (37B). Sem leitura grande inicial, fallback ou retries.
Validação de tamanho/hash/formato também no consumidor e na custódia.

Não relê helper, política, sudoers, bibliotecas, alias, saved/fallback, Event ou
cron de sistema. As18 observações anteriores são reutilizadas **como históricas**
na referência local. Não lê SQL/ownership nem fecha toolchain transitivo.
Qualquer releitura remota adicional fica fora do roteiro e exige justificativa/
revisão prévia; nenhuma foi acrescentada. Os comandos novos têm seus próprios
UTCs e não formam snapshot atômico com as18 observações de01:22UTC17/10.

## 3 — transferência e ingestão privadas únicas no ThinkPad

Inclusive diante de DENY, após a coleta terminar, para preservar quando possível:

```bash
(
set -euo pipefail
umask 077
R=/home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/tmp/worktrees/re7-campaign-recovery-20260926/docs/reviews/automation-freeform-window-release-af26/crm-csv-r1r2-complement-20261017
python3 -B -I -S - "$R" <<'REVIEWED_READER'
import hashlib,os,stat,sys
from pathlib import Path
p=Path(sys.argv[1]);d=p.lstat()
assert stat.S_ISDIR(d.st_mode) and not p.is_symlink() and d.st_uid==os.getuid(),'tools_directory'
if str(p)=='/dev/shm/re7-csv-r1r2-complement-tools-20261017-v1':
 assert stat.S_IMODE(d.st_mode)==0o700,'private_tools_directory'
for q in p.parents:
 assert not q.is_symlink(),'tools_ancestor_symlink'
raws={}
for n,h in [('read_package.py','cdfb33b281d69db2e3eba9ea6c7a71eb1ee575a5864f13d8729bcc24a80e5d47'),('privileged_output.source','93a114516a19b6d0acee5d2d810f298d856efd22c6905452d81651db65e3271a')]:
 f=p/n;s=f.lstat()
 assert stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_uid==os.getuid(),'tools_file'
 fd=os.open(f,os.O_RDONLY|os.O_NOFOLLOW)
 with os.fdopen(fd,'rb') as stream:
  t=os.fstat(stream.fileno());assert (t.st_dev,t.st_ino)==(s.st_dev,s.st_ino),'tools_replaced'
  raw=stream.read()
 assert hashlib.sha256(raw).hexdigest()==h,'reviewed_bytes'
 raws[n]=raw
raw=raws['read_package.py']
sys.argv=[str(p/'read_package.py'),'custody']
exec(compile(raw,str(p/'read_package.py'),'exec'),{'__name__':'__main__','__file__':str(p/'read_package.py'),'APPROVED_RAW':raw})
REVIEWED_READER
)

```

Mesmo SSH BatchMode/StrictHostKeyChecking e exportador por stdin dos bytes
aprovados; não root, não helper, não instalação. Saídas/erros integrais privados,
tamanhos/hashes/argv/resultado e errno numérico pertinente. Recibos usam
private_record canônico sem ampliar run_privileged. Exportador exige arquivo
regular/nlink1/owner600 e estabilidade do mesmo FD; destino novo700. Bytes
originais da **complementação** preservados em complement-capture.private.jsonl;
validação dos canais e seis resultados antes da ingestão.

Sucesso possível apenas da complementação:
R1R2_COMPLEMENT_CUSTODY_COMPLETE_NOT_CERTIFIED; contém ORIGIN, hash da nova coleta,
originalCollectionCompleted=false e atomicSnapshot=false. Nunca declara a coleta
original completa ou altera R1R2_CUSTODY_DENY. Falha, truncamento, erro, divergência
ou destino existente: preservar sem sobrescrever/repetir; nenhum COMPLETE.
Se nem o journal puder ser escrito, somente erro estático com classe/errno,
sem alegar custódia. Fonte e destinos consumidos permanecem preservados.

## Limites e fases separadas

Não é certificado root de instalação, RPO, janela ou população ativa. Os18 dados
antigos continuam com hashes, horários e limites originais, inclusive Event775 e
ausências. Coletar boot_id agora não prova a identidade de boot daquela observação
antiga: ela não foi obtida. Não eliminar essa incerteza por correlação temporal.

Nenhuma instalação/âncora/permit/backup/parada/SQL/env/reparo autorizado. Os16
bindings não são preenchidos. R3/R4 e eventual nova época operacional dependem de
revisão própria, não de um COMPLETE de diagnóstico. Não usar qualquer comando
ou intent de instalação/recuperação consumido.
