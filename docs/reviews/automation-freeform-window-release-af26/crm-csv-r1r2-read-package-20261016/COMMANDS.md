# Roteiro único R1/R2 — para aprovação posterior

**NÃO EXECUTAR NESTA RODADA. CSV SUSPENSO / NOT DEPLOYED / NOT WINDOW READY.**
Substitui apenas os blocos R1/R2 de coleta bruta da reconciliação anterior. Não é
roteiro A/B, geração operacional, instalação estática, âncora, permit ou certificado
atual. SQL/ownership e closure transitiva do toolchain serão dirigidos pelo resultado.

## Destinos e limites

| Uso | Destino literal |
|---|---|
| Ferramentas inativas VPS | `/dev/shm/re7-csv-r1r2-tools-20261016-v1` |
| Coleta deploy VPS | `/dev/shm/re7-csv-r1r2-read-20261016-v1` |
| Custódia ThinkPad | `/home/deifson-oliveira/DEIFSON/re7-private-retention-custody/csv-r1r2-read-20261016-v1` |

Novos diretórios700, arquivos de evidência600, owner executor, sem symlink;
nenhum destino pode preexistir. O pai local da custódia **já deve existir** e ser
owner700, segundo o procedimento privado documentado. Se não cumprir, parar;
este roteiro não cria recursivamente ou corrige esse pai. Ferramentas são fontes
públicas em diretório privado; o launcher exige owner atual, regular/nlink1 e hashes literais dos bytes. Fontes públicas do worktree não
precisam ser chmod para este leitor: a autoridade vem do hash revisado e dos
mesmos bytes carregados. O diretório remoto de ferramentas deve ser700. Não há
chmod/chown.

Cada etapa é única. Falha/timeout/parcial: preservar, não repetir nem sobrescrever.
A etapa de custódia deve ser feita uma vez para preservar também uma coleta DENY,
se houver arquivo; não transforma a coleta em sucesso. Sem arquivo, o SSH falha e
os bytes/erro dessa transferência permanecem privadamente no destino local.
Nada é removido automaticamente; tmpfs exige transferência pronta pelo owner.

## 0 — conferir fontes LOCALMENTE e disponibilizar dois arquivos inativos

Primeiro, revisão dos hashes literais abaixo e da allowlist publicada. **Futura
sessão deploy da VPS**, somente criação do novo diretório privado de ferramentas:

```bash
(
set -euo pipefail
umask 077
T=/dev/shm/re7-csv-r1r2-tools-20261016-v1
test ! -e "$T" && test ! -L "$T"
mkdir -m 700 "$T"
test "$(stat -c %u "$T")" = "$(id -u)"
test "$(stat -c %a "$T")" = 700
)
```

**Terminal LOCAL do ThinkPad**; transferência única dos dois arquivos de código
para o diretório acabado de criar, sem instalar helper/biblioteca/alias na VPS.
Falha/interrupção preserva os arquivos parciais e bloqueia a etapa1; não repetir scp.

```bash
(
set -euo pipefail
R=/home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/tmp/worktrees/re7-campaign-recovery-20260926/docs/reviews/automation-freeform-window-release-af26/crm-csv-r1r2-read-package-20261016
test "$(sha256sum "$R/read_package.py" | cut -d' ' -f1)" = d01961f5388fc49b65130ac4beace468327ac3faae22d3bb6a6599005d3a73e8
test "$(sha256sum "$R/privileged_output.source" | cut -d' ' -f1)" = 93a114516a19b6d0acee5d2d810f298d856efd22c6905452d81651db65e3271a
scp -B -o StrictHostKeyChecking=yes "$R/read_package.py" "$R/privileged_output.source" deploy@admin.re7online.com:/dev/shm/re7-csv-r1r2-tools-20261016-v1/
)
```

## 1 — única coleta, futura sessão deploy/sudo da VPS

Owner autentica `sudo -v` na sessão que executará a coleta. O subprocesso usa
sudo-n, sem prompt, sem delegação nova e sem retry. Se o cache não for válido,
registra falha e termina. Não executar via sessão diferente esperando aproveitar
um ticket ligado a outro TTY.

```bash
sudo -v
```

Depois, executar **uma vez**:

```bash
(
set -euo pipefail
umask 077
R=/dev/shm/re7-csv-r1r2-tools-20261016-v1
python3 -B -I -S - "$R" <<'REVIEWED_READER'
import hashlib,os,stat,sys
from pathlib import Path
p=Path(sys.argv[1]);d=p.lstat()
assert stat.S_ISDIR(d.st_mode) and not p.is_symlink() and d.st_uid==os.getuid(),'tools_directory'
if str(p)=='/dev/shm/re7-csv-r1r2-tools-20261016-v1':
 assert stat.S_IMODE(d.st_mode)==0o700,'private_tools_directory'
for q in p.parents:
 assert not q.is_symlink(),'tools_ancestor_symlink'
raws={}
for n,h in [('read_package.py','d01961f5388fc49b65130ac4beace468327ac3faae22d3bb6a6599005d3a73e8'),('privileged_output.source','93a114516a19b6d0acee5d2d810f298d856efd22c6905452d81651db65e3271a')]:
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

Só o resumo aparece no terminal. Não enviar conteúdo de política, recibo ou
journals ao chat. `R1R2_RAW_COLLECTION_COMPLETE_NOT_CERTIFIED` significa seis
comandos concluídos e evidências legíveis; alvos ausentes/tipos inesperados são
observações, **não** aprovação de instalação ou da ida. As negativas mantêm os
registros anteriores. Se o journal não puder ser escrito, não há alegação de
custódia: permanece o material já criado, mais erro estático no terminal.

## 2 — transferência privada, conferência e ingestão, terminal LOCAL ThinkPad

Não depende dos resultados de SQL/toolchain. O script cria exclusivamente o
destino local fixado e chama uma vez SSH autenticado, BatchMode e
StrictHostKeyChecking=yes. Não aceita host key nova nem solicita segredo.
O stdout remoto não passa pelo terminal: fica em `transfer.stdout.private`.
O único código remoto dessa etapa é o mesmo reader aprovado, via stdin, ação
`export` somente leitura, sem sudo, helper, bootstrap ou import de preparação.

```bash
(
set -euo pipefail
umask 077
R=/home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/tmp/worktrees/re7-campaign-recovery-20260926/docs/reviews/automation-freeform-window-release-af26/crm-csv-r1r2-read-package-20261016
python3 -B -I -S - "$R" <<'REVIEWED_READER'
import hashlib,os,stat,sys
from pathlib import Path
p=Path(sys.argv[1]);d=p.lstat()
assert stat.S_ISDIR(d.st_mode) and not p.is_symlink() and d.st_uid==os.getuid(),'tools_directory'
if str(p)=='/dev/shm/re7-csv-r1r2-tools-20261016-v1':
 assert stat.S_IMODE(d.st_mode)==0o700,'private_tools_directory'
for q in p.parents:
 assert not q.is_symlink(),'tools_ancestor_symlink'
raws={}
for n,h in [('read_package.py','d01961f5388fc49b65130ac4beace468327ac3faae22d3bb6a6599005d3a73e8'),('privileged_output.source','93a114516a19b6d0acee5d2d810f298d856efd22c6905452d81651db65e3271a')]:
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

O exportador abre o journal remoto com O_NOFOLLOW, verifica regular/nlink1,
owner600 e estabilidade dev/inode/metadados através do mesmo FD. Lê bytes uma vez;
exporta envelope com tamanho/hash/metadados e base64. O transferidor preserva
stdout/stderr integrais, códigos e hashes; confere envelope e mantém
`original-capture.private.jsonl` exatamente igual ao original remoto. Em seguida
confere IDs/argv, stdin do reader, stdout/stderr por tamanho/hash, cobertura dos19
caminhos, terminal e resultado de cada comando. Somente então chama o
**private_record canônico** para ingerir cada registro e publicar o recibo local
`R1R2_CUSTODY_COMPLETE_NOT_CERTIFIED` em `sequencer.journal.jsonl`.

Uma resposta perdida, exit nãozero, base64/JSON inválido, truncamento, hash/tamanho
incorreto ou terminal incompleto impede COMPLETE. O diretório local passa a estar
consumido até mesmo em DENY; não fazer segunda transferência para o mesmo destino,
limpar ou retomar parcialmente. Não se apaga a coleta remota.

## Correspondência e alcance

O índice `TARGETS.json` fixa dez alvos propostos (nove arquivos + alias) contra a
composição f9a0a44a…; hashes propostos são **comparandos**, não observação atual.
O reader também cobre nove fontes/controles auxiliares; total19 caminhos:
política atual, cron de sistema, lock, diretório de recibos de instalação, PID do
daemon, saved/fallback, boot e Event. O alias é lstat/readlink, nunca seguido.
Cada pai é aberto como diretório por FD e sem seguir symlinks; cada regular é
lido por FD com comparação de metadados pré/pós (limite8MiB/arquivo). Dump/saved
fornecem somente hash/metadados, sem exportar ambientes. Tipo inesperado é
registrado e não seguido. Pai symlink, permissão negada, erro ou troca detectada
negam a coleta. Ausência é FileNotFoundError explícito, com ancestral quando útil;
não é fabricada a partir de PermissionError.

| ID | Comando/consumo | Conteúdo privado e limitação |
|---|---|---|
| root-inventory | sudo-n python-I-S stdin dos bytes aprovados |19 caminhos, metadados/cadeias, conteúdo só da allowlist CONTENT; root/sudo reais apenas no uso futuro |
| deploy-cron | crontab -l |cron deploy integral; nenhuma instalação/job |
| supervision | systemctl show pm2-deploy.service ActiveState,UnitFileState |estado, não start/enable |
| process-discovery | ps pid/ppid/uid/lstart/comm |não captura environ/args; não atesta trio efetivo |
| listener-discovery | ss -ltnp |donos podem estar ocultos ao deploy; não atesta ownership completo |
| tool-path-discovery | shell command-v node/pm2 |resolvido ou NOT_RESOLVED_IN_FIXED_PATH; não executa PM2 nem certifica toolchain |

Cada resultado no journal identifica argv, UTC início/fim, stdin tamanho/hash,
exitCode/errorClass, accepted e canais stdout/stderr em base64+tamanho+hash.
O mapa físico é explícito: todos esses resultados estão nas linhas
`r1r2_command` de `privileged-output.private.jsonl`; não existem stdout/stderr
soltos sem vínculo. O wrapper de transferência tem dois arquivos integrais
separados e seus tamanhos/hashes no registro `r1r2_transport`. A cópia original
nunca é reescrita pela ingestão; o novo journal apenas recebe os objetos originais.

**Não é snapshot atômico.** FDs reduzem substituição por caminho e comparações
negam divergências detectáveis, mas cada alvo/comando tem seu intervalo próprio.
A ausência vale no instante observado. Não se prova ausência de mudança entre
comandos, identidade completa API/worker/frontend, estado dos segredos, geração,
guarda/out.15 atuais, propriedade de sockets/SQL, frescor de RPO ou prontidão de
instalação. Esses controles permanecem obrigatórios nas etapas correspondentes.
Não há invocação de inspect consumido, PM2, retenção, R0 ou preparador mutável.

## Diagnóstico reutilizado e separação de fases

`privileged_output.source` é cópia byte-exata da fonte versionada
`v4-sequencer/privileged_output.py`, hash 93a114516a19b6d0acee5d2d810f298d856efd22c6905452d81651db65e3271a.
Usa-se só `private_record`; `run_privileged`, seu allowlist e o código operacional
não foram alterados. Não há novo escritor de journal; `write_artifact` limita-se
à cópia exclusiva dos bytes transportados. Eventos R1/R2 são evidências desta
conferência, não autoridade ou schema de política. A cópia do módulo é pinada
antes de carregar; conteúdo capturado jamais é importado/executado.

Próximas fases, fora desta aprovação: análise local R3/R4 dirigida → revisão dos
inputs/bytes → eventual instalação estática → âncora → decisão/emissão específica
quando cabível → janela. Nenhum pin, binding, permit, perfil ou observação atual
é fabricado. Nenhuma prova perecível/backup é renovada antecipadamente.
