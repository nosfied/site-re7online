# SQL corrigido v2 — ÚNICA ENTRADA VIGENTE PARA REVISÃO

O roteiro `SQL_COMMANDS_FOR_REVIEW.md`/sql-review/v1 está **CONSUMED/DENY**;
não repetir seus blocos. Bytes/manifests/diagnósticos históricos permanecem intactos.
Esta v2 não foi executada na VPS e exige autorização própria dos dois blocos.


Basec5b6dbc4acbd09d609a0bc71beb1f925b6bcb91e. Nenhum acesso à VPS ou SELECT
produtivo autorizado nesta preparação. Não executar os blocos sem autorização própria.
M1 e diagnósticos anteriores consumidos; ELF PAUSADO. Sem sudo/role alternativo/retry.

## Canal e fonte de autoridade

A revisão do owner dos hashes literais autentica o mesmo launcher FD/no-follow/metadados
pré/pós, que autentica o manifest e os bytes carregados em memória. Não são autoridade
produtiva instalada, permit ou autorização de execução. Não usar hash/argumento isolado
como aprovação. channel.private.json é derivado **somente em memória** da custódia
legítima owner0700/arquivo600 csv-directed-diagnostic-20261017-v1/capture.private.jsonl:499893B,
SHAf6873eb97f5a70709675ad16b8b4879ff1a1953dc58464c704a80e735b5af8d5.
A fonte tem terminal GATES_1_3_AND_CONTROLS_OBSERVED; são conferidos bytes/hash/código
dos registros db-route/sql-client-path/sql-client-version antes da derivação.
O derivado contém só rota/container/cliente e procedência, sem trio/env/saved/controles.
Seu tamanho/hash esperado está no manifest; seus bytes ficam privados, fora do Git.
Nenhum novo perfil, pin de fase, autoridade ou identidade SQL é fabricado.

12 entradas reutilizam leitor/driver/launcher/Capture/private_record do diagnóstico
aceito. Runner usa exatamente os ASTs load/Capture/DiagnosticDenied/checked anteriores,
System.db_container extraído do ops.source pinado e classify extraído do
capture_imports.source pinado, **sem executar capture() ou CLI operacional**.
Não usa PM2/Node/RPC, não consulta trio, saved/fallback, crons ou root observers.

## 1. Materialização LOCAL inativa — uma vez

Confere a custódia pinada e fontes locais; cria somente o material inativo e o journal
canônico nos destinos novos abaixo. Qualquer falta/drift/destino existente impede SSH.

```bash
(
set -euo pipefail
umask 077
python3 -B -I -S - <<'REVIEWED_LOCAL'
import hashlib,os,stat,sys
from pathlib import Path
p=Path('/home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/tmp/worktrees/re7-campaign-recovery-20260926/docs/reviews/automation-freeform-window-release-af26/crm-csv-delivery-review-20261017/sql-review-v2')
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
assert hashlib.sha256(raw).hexdigest()=='7f555f78b6feeead7cbd556a6700c810cd67c8119e4a3f8b39accc54ce87e22d','reviewed_launcher'
sys.argv=[str(f),str(p),'7a41154b7922f8975353768ee2a77da8459b51ba6034cd30d8844ec0c7173116','materialize']
exec(compile(raw,str(f),'exec'),{'__name__':'__main__','__file__':str(f)})
REVIEWED_LOCAL
)
```

## 2. Transferência única + três SELECTs + custódia — decisão futura separada

Somente depois do bloco1 PASS e da autorização expressa desse roteiro SQL.

```bash
(
set -euo pipefail
umask 077
python3 -B -I -S - <<'REVIEWED_LOCAL'
import hashlib,os,stat,sys
from pathlib import Path
p=Path('/home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/tmp/worktrees/re7-campaign-recovery-20260926/docs/reviews/automation-freeform-window-release-af26/crm-csv-delivery-review-20261017/sql-review-v2')
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
assert hashlib.sha256(raw).hexdigest()=='7f555f78b6feeead7cbd556a6700c810cd67c8119e4a3f8b39accc54ce87e22d','reviewed_launcher'
sys.argv=[str(f),str(p),'7a41154b7922f8975353768ee2a77da8459b51ba6034cd30d8844ec0c7173116','collect']
exec(compile(raw,str(f),'exec'),{'__name__':'__main__','__file__':str(f)})
REVIEWED_LOCAL
)
```

## Ordem literal e predicados de parada

1. Fontes:manifest revisado,12 entradas exatas e canal privado derivado com hash pinado.
2. Antes de identity:docker inspect formatado existente→igualdade integral da rota
   preservada→System.db_container canônico→psql command-v e --version byte-exatos.
3. identity.sql UMA VEZ, depois validar os quatro resultados:database whatsapp_agent,
   session/effectiveRole wa_agent, transaction_read_only on, server major16 e system ID
   não vazio. Identificador do cluster é observação inicial, não comparação com um pin
   inexistente. O SQL também preserva owners/SELECT rights/visibilidade; acesso negado
   a pg_control_system nega, sem grant/role/sudo/fallback.
4. Revalidar canal:after-identity é também before-ownership. ownership.sql UMA VEZ;
   validar formato/lista de backends e advisoryLocks>=0, **sem exigir zero**.
5. Revalidar canal:after-ownership é também before-imports. imports.sql UMA VEZ;
   com100001 linhas, negar IMPORTS_POSSIBLY_TRUNCATED_100001 antes da classificação.
   Não declarar truncamento exato:100001 é sentinela de possível truncamento. Até100000,
   classify canônico mantém correlação tenant+operação e UNKNOWN quando faltar prova.
6. Revalidar canal after-imports. Terminal THREE_READONLY_SQLS_PRESERVED só se todas as
   consultas/validações/fronteiras passarem. Em qualquer falha, nenhum próximo SQL ou
   leitura de fronteira adicional; preservar erro/parcial e encerrar sem retry.
7. Transferir o envelope na **mesma conexão SSH** e ingerir com private_record. Canais
   com argv/início/fim/exit/errno/tamanho/SHA/Base64, stdin SQL com tamanho/SHA; journals
   e IDs/tenants ficam privados. Resposta perdida preserva parcial local, sem reconectar.

São quatro revalidações de canal, cada uma com três comandos, mais três SQLs no caso
válido:15 subprocessos dirigidos, sem inventário geral. Os SQLs são os três arquivos
existentes pinados; não foram reescritos, concatenados a SQL auxiliar ou substituídos.
Cada um preserva BEGIN READ ONLY, timeout, ROLLBACK. psql recebe -X -w -Atq
-v ON_ERROR_STOP=1, role/database literais e nove atribuições Docker PG* preservadas. `/bin/sh` remove
PGSERVICE (vazio não é ausente) e ajustes herdados pela lista literal de `sql_argv`
antes de `exec psql "$@"`, conforme fonte aceita c5b6dbc4;
sem senha/env legado, prompt, troca de role ou observador root. SQL identity usa
statement_timeout5000/lock_timeout1000ms; ownership10000ms; imports15000ms. Processo25s,
SSH180s. Em erro ON_ERROR_STOP pode impedir alcançar o ROLLBACK textual; a conexão é
encerrada, revertendo a transação READ ONLY; não executar ROLLBACK adicional/retry.

Etapas negativas identificáveis:before-identity / fronteiras seguintes com
SQL_ROUTE_OR_CLIENT_CHANGED; consulta com SQL_OR_CHANNEL_EXIT_DENIED (inclui privilégio),
SQL_OR_CHANNEL_TIMEOUT_OR_OS_FAILURE ou OUTPUT_LIMIT_PARTIAL_PRESERVED;
identity-validation/ownership-validation/imports-validation com motivo estático de
schema/identidade; imports com IMPORTS_POSSIBLY_TRUNCATED_100001. Detalhes SQLSTATE,
IDs, stderr e conteúdo ficam só no journal privado, nunca em erro público arbitrário.

## Limites de saída, parcial e custódia

A prova real100001 gerou journal16675395B:8MiB herdados seriam insuficientes. Mantém-se
o leitor estável original e formato export canônico, selecionando **96MiB antes da
leitura somente do nome de journal**. Outros arquivos mantêm8MiB (bundle4MiB). Isso não
é fallback após falha nem ampliação silenciosa do leitor histórico; só esta derivação.
Stdout registrado:identity64KiB, ownership4MiB, imports32MiB; demais comandos1MiB cada,
stderr64KiB por comando. Se exceder, guardar apenas prefixos explicitamente marcados,
quantidades e hashes do observado, negar e não afirmar custódia integral dos bytes
fora do limite. Cada saída é capturada pelo subprocess.run herdado ANTES desse teste:
esses limites são de registro, **não teto de memória ou RAM** do filho/controlador.
Timeout não é limite de volume. Classificação grava apenas contagens/hash do resultado;
linhas de origem completas até o limite ficam privadas e permitem reconstrução offline.
Não duplica lista de100000 operações no journal. Nenhum limite SQL foi reduzido para PASS.

Teto planejado dos canais base64 registrados:12 comandos de canal×(1MiB+64KiB),
mais stdout SQL(64KiB+4MiB+32MiB) e stderr3×64KiB ≈49,0MiB brutos; Base64≈65,3MiB,
mais JSON/metadata/resumos, dentro de96MiB para o conjunto fixo (sem duplicar classificação).
O journal é lido com limite explícito; crescimento/metadados divergentes negam. Esse
cálculo não certifica capacidade/tmpfs/RAM. Transporte/envelope e ingestão acrescentam
cópias/Base64: não apresentar96MiB como pico total de disco/memória. Uma futura execução
continua sujeita às reservas/capacidade canônicas; sem renovar backup nesta preparação.

## Destinos exclusivos

- Material LOCAL:/dev/shm/re7-csv-sql-material-20261017-v2
- Fontes inativas remotas:/dev/shm/re7-csv-sql-tools-20261017-v2
- Evidência remota:/dev/shm/re7-csv-sql-read-20261017-v2
- Custódia LOCAL:/home/deifson-oliveira/DEIFSON/re7-private-retention-custody/csv-sql-read-20261017-v2
- Canais LOCAL do launcher:no mesmo parent, csv-sql-launcher-20261017-v2-materialize e -collect.

Parent privado legítimo preexistente0700, destinos exclusivos0700/arquivos0600.
Ausente/adulterado/inacessível/existente nega sem mkdir reparador, overwrite ou limpeza.
Os destinos consumidos anteriores e os seus DENYs não são reutilizados/reclassificados.

## Alcance da conclusão

Rota/container/cliente são reconfirmados em torno dos SQLs, sem exigir leituras do trio
ou rotação. As três transações têm instantes diferentes e não são snapshot atômico;
a igualdade de rota não exclui mudanças internas não representadas nesses campos.
pg_stat_activity/lista de locks não atribui todos os sockets/processos: **ownership
completo permanece UNKNOWN**, mesmo com resultado vazio; nenhuma prova de saída ou
knownActivityScope completo é emitida. Resultados parciais de visibilidade permanecem
explícitos, sem elevação de privilégio. A consulta não presume ausência de importação
conhecida fora do audit, não reimporta CSV e não lê mensagens/CSVs adicionais.

Produção multitenant, NEWauth+NEWDB+NEWcipher, ambos crons, guarda38 fechada e out.15
CLOSED preservados. Sem instalação/backup/reparo/serviço/retention/env/credencial ou
janela. M1 CONSUMIDO; ELF PAUSADO. Próximo ato é revisão/decisão separada destes blocos,
não sua execução nesta rodada. LOCAL VALIDATED / NOT DEPLOYED / NOT WINDOW READY.
