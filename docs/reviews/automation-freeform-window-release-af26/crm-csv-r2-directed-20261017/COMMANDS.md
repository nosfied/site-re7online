# R2 dirigido — roteiro para revisão, NÃO EXECUTAR nesta etapa

Basefa72aeba3a985570207afc95d8de1766d24bfb67. Somente futura autorização específica.
CSV SUSPENSO / NOT DEPLOYED / NOT WINDOW READY. Sem sudo, PM2 CLI, Node/CJS,
script capturado, Docker CLI ou SQL. Nenhuma tentativa anterior é retomada.

## Escopo exato

Um subprocesso `/usr/bin/python3 -B -I -S - directed` recebe os bytes aprovados.
Lê boot_id duas vezes,64B cada, no início/fim do NOVO intervalo para ancorar /proc;
isso é necessário e não redata as18 observações antigas nem repete os seis comandos.
Alvos fixos candidatos: daemon18676, API936386, worker936540, frontend188897,
seu filho188910 e proxy177517, derivados das custódias e da recuperação aceita.
Nenhum PID é certificado antes da leitura nova. PID desaparecido/ticks/boot/parentesco,
configuração divergente ou acesso negado registram DENY/errno; não escalar, descobrir
substituto ou reparar automaticamente. Houve 3 intervalos anteriores, não atômicos.

A única releitura dentre os18 alvos antigos será `/home/deploy/.pm2/pm2.pid`,64B,
para ligar o daemon observado ao arquivo canônico de HOME neste NOVO intervalo.
Valor diferente nega, sem seguir o PID substituto. Metadados/links são revalidados
ao fim do intervalo; não recaptura política/helper/cron/Event/dumps. Justificativa:
o PID histórico isolado não prova o apontamento atual do daemon.

/proc: stat, cwd/exe magic links intencionais, imagem executável já aberta para hash,
cmdline limitado, environ apenas nos3 apps (limite256KiB, filtro nominal; nunca persiste
ambiente bruto ou senha), fd links para inodes socket, filho frontend e tcp/tcp6 da
namespace do daemon filtrados por3000/3001/8787/5432. Não lê conteúdo de sockets/pipes.
Configuração armazenada privadamente: NODE_ENV, PM2_HOME, portas e marcadores PM2
quando disponíveis; DATABASE_URL é convertido em canal/role/banco/sslmode e presença
de senha. ADMIN_TOKEN, JWT, cifras e credenciais externas NÃO são capturados.

Caminho PM2 canônico: `/home/deploy/.npm-global/bin/pm2`, links/ancestrais/target
metadados/hash, package.json adjacente (JSON parse, não require) e `/usr/bin/node`.
Há limite de16 links/128 componentes,8MiB por arquivo estático (Node/imagens256MiB),
sem execução nem closure R4 completa. Negativa de acesso é evidência preservada.
Dados SQL futuros: configuração API/worker + alvo TCP docker-proxy; NÃO determina
container atual, server identity, privilégios ou conectividade. O SELECT posterior
exige aprovação e canal/procedimento conferidos; não chamar capture_imports.capture.

## Destinos novos

- Ferramentas: `/dev/shm/re7-csv-r2-directed-tools-20261017-v1`.
- Coleta: `/dev/shm/re7-csv-r2-directed-read-20261017-v1`.
- Custódia: `/home/deifson-oliveira/DEIFSON/re7-private-retention-custody/csv-r2-directed-read-20261017-v1`.

Nenhum pode existir; criação exclusiva700/arquivos600 pelo dono. Sem chmod/chown,
limpeza, sobrescrita ou retry. O pai da custódia é o existente owner700. private_record
canônico permanece o escritor; não há novo escritor de journal. Arquivos inativos
não são bibliotecas instaladas, política ou autoridade. Preservar todos os históricos.

## 0 — LOCAL: conferir origem privada, somente leitura

```bash
(
set -euo pipefail
umask 077
R=/home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/tmp/worktrees/re7-campaign-recovery-20260926/docs/reviews/automation-freeform-window-release-af26/crm-csv-r2-directed-20261017
python3 -B -I -S - "$R" <<'REVIEWED_READER'
import hashlib,os,stat,sys
from pathlib import Path
p=Path(sys.argv[1]);d=p.lstat()
assert stat.S_ISDIR(d.st_mode) and not p.is_symlink() and d.st_uid==os.getuid(),'tools_directory'
if str(p)=='/dev/shm/re7-csv-r2-directed-tools-20261017-v1':
 assert stat.S_IMODE(d.st_mode)==0o700,'private_tools_directory'
for q in p.parents:
 assert not q.is_symlink(),'tools_ancestor_symlink'
raws={}
for n,h in [('read_package.py','66f337fbe47d69ae02902f38f6b0e474241222c90967580d9c569dce21796691'),('privileged_output.source','93a114516a19b6d0acee5d2d810f298d856efd22c6905452d81651db65e3271a')]:
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

Esperado ORIGINAL_DENY_REFERENCE_VERIFIED_NO_WRITE. Os outros dois conjuntos privados
permanecem preservados; suas referências/hashes estão no relatório. Sem origem válida,
parar antes de qualquer transferência. Esse bloco não escreve na custódia antiga.

## 1a — VPS/deploy: criar destino de ferramentas uma vez, SEM sudo

```bash
(
set -euo pipefail
umask 077
T=/dev/shm/re7-csv-r2-directed-tools-20261017-v1
test ! -e "$T" && test ! -L "$T"
mkdir -m 700 "$T"
test "$(stat -c %u "$T")" = "$(id -u)"
test "$(stat -c %a "$T")" = 700
)

```

## 1b — LOCAL: transferir somente os dois arquivos inativos uma vez

```bash
(
set -euo pipefail
R=/home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/tmp/worktrees/re7-campaign-recovery-20260926/docs/reviews/automation-freeform-window-release-af26/crm-csv-r2-directed-20261017
test "$(sha256sum "$R/read_package.py" | cut -d' ' -f1)" = 66f337fbe47d69ae02902f38f6b0e474241222c90967580d9c569dce21796691
test "$(sha256sum "$R/privileged_output.source" | cut -d' ' -f1)" = 93a114516a19b6d0acee5d2d810f298d856efd22c6905452d81651db65e3271a
scp -B -o StrictHostKeyChecking=yes "$R/read_package.py" "$R/privileged_output.source" deploy@admin.re7online.com:/dev/shm/re7-csv-r2-directed-tools-20261017-v1/
)

```

## 2 — VPS/deploy: coleta única, SEM sudo

```bash
(
set -euo pipefail
umask 077
R=/dev/shm/re7-csv-r2-directed-tools-20261017-v1
python3 -B -I -S - "$R" <<'REVIEWED_READER'
import hashlib,os,stat,sys
from pathlib import Path
p=Path(sys.argv[1]);d=p.lstat()
assert stat.S_ISDIR(d.st_mode) and not p.is_symlink() and d.st_uid==os.getuid(),'tools_directory'
if str(p)=='/dev/shm/re7-csv-r2-directed-tools-20261017-v1':
 assert stat.S_IMODE(d.st_mode)==0o700,'private_tools_directory'
for q in p.parents:
 assert not q.is_symlink(),'tools_ancestor_symlink'
raws={}
for n,h in [('read_package.py','66f337fbe47d69ae02902f38f6b0e474241222c90967580d9c569dce21796691'),('privileged_output.source','93a114516a19b6d0acee5d2d810f298d856efd22c6905452d81651db65e3271a')]:
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

## 3 — LOCAL: exportação e ingestão privadas únicas, inclusive diante de DENY

```bash
(
set -euo pipefail
umask 077
R=/home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/tmp/worktrees/re7-campaign-recovery-20260926/docs/reviews/automation-freeform-window-release-af26/crm-csv-r2-directed-20261017
python3 -B -I -S - "$R" <<'REVIEWED_READER'
import hashlib,os,stat,sys
from pathlib import Path
p=Path(sys.argv[1]);d=p.lstat()
assert stat.S_ISDIR(d.st_mode) and not p.is_symlink() and d.st_uid==os.getuid(),'tools_directory'
if str(p)=='/dev/shm/re7-csv-r2-directed-tools-20261017-v1':
 assert stat.S_IMODE(d.st_mode)==0o700,'private_tools_directory'
for q in p.parents:
 assert not q.is_symlink(),'tools_ancestor_symlink'
raws={}
for n,h in [('read_package.py','66f337fbe47d69ae02902f38f6b0e474241222c90967580d9c569dce21796691'),('privileged_output.source','93a114516a19b6d0acee5d2d810f298d856efd22c6905452d81651db65e3271a')]:
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

O exportador por SSH BatchMode/StrictHostKeyChecking recebe os mesmos bytes do
reader por stdin; stdout/stderr completos ficam privados. Transferência verifica
source/len/hash/owner600/nlink1; preserva raw antes de validar/ingerir. Sucesso possível:
R2_DIRECTED_CUSTODY_COMPLETE_NOT_CERTIFIED, certificação operacional false; nunca
altera os DENYs ou torna a primeira coleta completa. Custódia DENY preserva raw quando
possível; se não houver journal legível ou destino válido, registrar erro sem alegar
custódia. Não repetir coleta/exportação ao falhar, não executar R3/SQL, reparar,
instalar/emissão/backup/conter/start/stop. Este roteiro termina em análise local.
