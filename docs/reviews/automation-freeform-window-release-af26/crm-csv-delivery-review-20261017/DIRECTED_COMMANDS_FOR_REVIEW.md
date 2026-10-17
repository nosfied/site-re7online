# Próxima leitura dirigida CSV — SOMENTE PARA REVISÃO

Base8bf0fa8e. M1 COMPLETE/CONSUMIDO; não repetir Event/preflights/manutenção. ELF pausado.
Esta entrega não autoriza executar estes blocos nem qualquer SELECT/ownership.
Executar futuramente como deploy UID1000, SEM sudo, somente após decisão expressa.
Um bloco local de materialização e uma transferência/coleta/custódia. Não repetir
qualquer bloco/destino existente, nem reconectar para recuperar uma resposta perdida.

A revisão pelo owner dos hashes literais abaixo autentica o launcher; ele autentica
MANIFEST.json e os mesmos bytes carregados em memória. Não há autoridade de fase,
permit, perfil ou binding fabricado. Closure26 RPC reaproveitada, não closure ELF.

## 1. Materialização local inativa

```bash
(
set -euo pipefail
umask 077
python3 -B -I -S - <<'REVIEWED_LOCAL'
import hashlib,os,stat,sys
from pathlib import Path
p=Path('/home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/tmp/worktrees/re7-campaign-recovery-20260926/docs/reviews/automation-freeform-window-release-af26/crm-csv-delivery-review-20261017/directed-diagnostic')
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
assert hashlib.sha256(raw).hexdigest()=='5ce13ad8200026175d12e3b61953568c3005d29dfa8a12d6cfd89f2a5312a378','reviewed_launcher'
sys.argv=[str(f),str(p),'1a0ac094b9276b5fdfa09e2716946210e08c73d9f0172548be73d39d8217ffa9','materialize']
exec(compile(raw,str(f),'exec'),{'__name__':'__main__','__file__':str(f)})
REVIEWED_LOCAL
)
```

## 2. Transferência única, gates e custódia

```bash
(
set -euo pipefail
umask 077
python3 -B -I -S - <<'REVIEWED_LOCAL'
import hashlib,os,stat,sys
from pathlib import Path
p=Path('/home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/tmp/worktrees/re7-campaign-recovery-20260926/docs/reviews/automation-freeform-window-release-af26/crm-csv-delivery-review-20261017/directed-diagnostic')
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
assert hashlib.sha256(raw).hexdigest()=='5ce13ad8200026175d12e3b61953568c3005d29dfa8a12d6cfd89f2a5312a378','reviewed_launcher'
sys.argv=[str(f),str(p),'1a0ac094b9276b5fdfa09e2716946210e08c73d9f0172548be73d39d8217ffa9','collect']
exec(compile(raw,str(f),'exec'),{'__name__':'__main__','__file__':str(f)})
REVIEWED_LOCAL
)
```

## Escopo exato e gates esperados

| Gate | Consumidor real / resultado esperado | Negativa e alcance |
| --- | --- | --- |
| Fontes | launch.read→manifest→driver.verify:35 fontes exatas, closure26 RPC, adaptador aceito e ops.source pinado | digest/tamanho/tipo/symlink/substituição/destino existente nega antes do SSH quando local; nenhuma alternativa/download |
| Imagem e daemon | file_chain/hash Node+FD; socket existente, SO_PEERCRED, pm2.pid, boot/PID/ticks antes/depois | falta/drift nega; não usa PM2 CLI/connect/resurrect nem procura novo daemon |
| Trio/configuração | frontend→consumers→Operations.config/System.check_config e compare_frontend aceito | população/PID/ticks/cwd/exe/env/status divergentes negam; source.profile autenticado fornece perfil OS, dump fornece projeção PM2 completa, sem equivalência entre ambos |
| Saved/fallback | stable_file600 owner; compare_saved original para frontend; bytes completos dos dumps preservados privadamente para conferência dos demais membros | leitura/600/contrato frontend divergente nega; não declarar par/supervisão certificados só por esse PASS |
| Rota/cliente | System.db_container via resultado docker inspect limitado, dois DATABASE_URL ativos; command-v psql e versão16 pelo ID observado | ROUTE_OR_POSTGRES_CLIENT_DENIED; não lê Config.Env/.env, não conecta ao banco |
| Controles | crontab-l, arquivo cron sistema, systemctl-show; before de ambos crons, initial.private.json, gates e execution-authorized | cada leitura tem etapa própria; CONTROL_FILE_READ_FAILED/DEPLOY_CRON_READ_FAILED/SYSTEM_CRON_READ_FAILED/SUPERVISION_READ_FAILED; saída é observação, não veredito de restauração |
| Custódia | driver.ingest→private_record canônico:stdout/stderr, códigos/errno, intervalos, tamanhos/hashes/Base64, export byte-exato | parcial/timeout/DENY preservados, sem repetir/reparar. Custódia não promove origem DENY a PASS |

Os PIDs/ticks/boot e referências do runner são expectativas históricas para CAS,
NÃO identidades atuais certificadas. Não substituir constantes após negativa.
Nenhuma amostra sintética vira perfil produtivo. Coleta é intervalo, não snapshot.

Controles: comparar OFFLINE os dois crons com os originais legitimamente preservados
pelo ScheduledControls.verify('before'), separadamente. Supervisão compara exatamente
initial.supervision, sem interpretar inactive/enabled isoladamente. Os novos bytes de
initial/before são observação; autenticar contra custódia histórica antes de usá-los
como referência. Permissões600 das fontes são verificadas na reconciliação canônica;
não corrigir a fonte se leitura/metadata negar. Gates false e authorization false
precisam ser conferidos offline; não há admissão/reset/helper no roteiro. Guarda38,
barreira e política root600 NÃO certificados por esta coleta não privilegiada.

## Destinos exclusivos e limites herdados

- Material local:/dev/shm/re7-csv-directed-material-20261017-v1
- Ferramentas inativas remotas:/dev/shm/re7-csv-directed-tools-20261017-v1
- Resultado privado remoto:/dev/shm/re7-csv-directed-read-20261017-v1
- Custódia local:/home/deifson-oliveira/DEIFSON/re7-private-retention-custody/csv-directed-diagnostic-20261017-v1
- Canais do launcher:mesmo parent privado, csv-directed-launcher-20261017-v1-materialize e -collect.

Parent privado preexistente owner0700; novos destinos exclusivos0700 e arquivos0600.
Nenhum parent é reparado ou criado por conveniência. Bundle≤4MiB, fontes/arquivos≤8MiB,
boot_id leitura única64B, imagens hash streaming≤256MiB, launcher<64KiB; RPC8s,
comandos25s, SSH único180s. Não são teto global de armazenamento/RAM: journals/Base64
adicionam bytes, e subprocess.capture_output não impõe teto de stdout. Nenhuma
certificação de capacidade ou nova exigência ELF é inferida desses limites.
O roteiro preserva o contrato já aceito; timeout limita duração, não volume do filho.
Ausência de ferramenta fixa/permissão nega sem busca/instalação/fallback.

## Resultado e sequência única API→frontend

Depois da futura execução autorizada: reconciliar privadamente identidades/config,
trio completo de saved/fallback e controles com as fontes preservadas. Se DENY,
publicar etapa/motivo específicos e parar; não nova coleta automática. Se as leituras
passarem, o resultado é GATES_1_3_AND_CONTROLS_OBSERVED/CUSTODY_PRESERVED_GATES_PASS_NOT_CERTIFIED,
com ownership UNKNOWN, não prontidão produtiva.

A rota/cliente observados permitem submeter os SELECTs delimitados já existentes à
DECISÃO SEPARADA; não usar banco vazio como condição com produção viva. Atribuição e
saída/ownership completos são provas próprias, posteriores à contenção autorizada.
Com esses dados e demais controles canônicos satisfeitos: materialização final dos
quatro modos/16 vínculos e predecessor e2a5, revisão de política/autoridade específicas,
janela coordenada→R0/root frescos→revisão final→instalação/admissão autorizadas→
saída/ownership/CAS→API24e5857f→validação do contrato UUID/GET→fronteira frontend real→
revisão/decisão separada→frontend candidato. Sem rebuild/staging redundante.
Após seleção, retorno mantém API candidata/ledger/GET e proteção contra replay;
defeito persistente do backend exige outra versão compatível. PRESTOP não parte;
ORIGINAL exige ausência comprovada de seleção/admissão e todos R1/R2. Esta consulta
não executa nenhum desses caminhos ou intents. Não altera tenants/RBAC/credenciais,
crons, serviços, NEWauth+NEWDB+NEWcipher, guarda38 ou out.15 CLOSED.
