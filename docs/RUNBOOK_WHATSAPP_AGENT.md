# RUNBOOK OPERACIONAL — WhatsApp Agent

## Inicio efetivo e ensaio operacional local — 2026-09-26

Status: LOCAL ROLLOUT / SUSPENDED ROLLBACK REHEARSED; NOT DEPLOYED / OWNER UI PENDING.
Base `fedef1e1965aa6a1e53222426c6b55424e2d83fa`, branch
`review/campaign-recovery-20260926`; historico e owner PASS anteriores preservados.

- `effectiveStartedAt` passa a ser preenchido somente quando nulo, sob lock do
  grupo; materializacao/recuperacao preservam o valor. `job.startedAt` continua
  informando o claim do lote/tentativa, ja exposto pela API/UI. Nenhum ajuste visual.
- Testes focados: os dois casos reproduziram a sobrescrita e passaram apos a
  correcao (2/2); fila afetada 8/8; build backend PASS. Sem repetir suites amplas,
  build frontend ou smokes anteriores.
- Cluster PostgreSQL local separado, `127.0.0.1:55434/re7_rollout_local`, com
  ambiente limpo e provider em memoria. Base `6d664d0b`: 59 migrations e tres
  campanhas antigas; migrate deploy aplicou apenas a fila, totalizando 60.
  Campanhas antigas preservadas; checksum da migration conferido com Prisma.
- Falha injetada apos migration/antes da ativacao: runtime sem permissao de
  campanhas e admissao fechada; zero jobs criados. Banco migrado foi mantido.
- Codigo novo processou fila; pausa drenou uma chamada com aceite conhecido.
  Morte de outro processo apos submissao, antes da resposta local, deixou uma
  pendencia explicitamente marcada needs_review. Snapshot sem filhos sobreviveu
  a interrupcao e alteracao do CRM.
- Rollback ensaiado **com processamento suspenso**, ingresso HTTP em manutencao
  e papel runtime sem privilegios nas tabelas. Runner real de `6d664d0b` recebeu
  permission denied; zero provider. Jobs, leases, snapshots, resultados e demais
  registros permaneceram iguais no intervalo do rollback. Health nao foi usado
  como prova de rollback funcional; o backend antigo nao e uma alternativa de envio.
- Retorno exclusivo ao novo codigo: dois grupos completos, quatro aceites
  conhecidos, uma submissao incerta ainda retida e zero duplicacoes entre cinco
  submissoes simuladas. Todos os jobs/eventos anteriores e o inicio original dos
  grupos foram preservados. Admissao permaneceu fechada ao final do ensaio.
- Drift: 16 objetos do inventario anterior identicos antes/depois; diff somente
  leitura igual ao ja registrado, sem diferenca nas tabelas de fila. Nao impede
  este rollout aditivo, desde que defaults/indices/constraints sejam preservados.
  Nenhuma correcao incidental de drift, down migration, reset ou limpeza de filas.

Procedimento, condicoes de parada e limites: RUNBOOK_WHATSAPP_AGENT.md, secao
"Ensaio operacional local da fila — procedimento executado". Evidencias preservadas
em `local-evidence/recovery/rollout-local/`, incluindo tres dumps e manifestos.
Pendencias para decisao: validar cercas/permissoes e parada de todas as instancias
no ambiente alvo, reconciliacao de pendencias incertas, owner UI e aceite CRA.
Nao houve deploy, banco/provider de producao ou envio real. DELIVERED/READ →
Conversation/HUMAN/WAITING continua separado; reparo 6683 CLOSED.

## Correcoes da revisao Git 109c9f15 — 2026-09-26

Status: LOCAL REVIEW FIXES VALIDATED / NOT DEPLOYED / OWNER UI PENDING.
Base desta correcao: `109c9f1544003750d29930bd7b10ce6a4cf50c03`, branch
`review/campaign-recovery-20260926`. Historico `6d664d0b` e owner PASS do lote
anterior preservados; esta nota nao concede aceite CRA nem prontidao para deploy.

- CSV: grupo, filhos, seeds e resultado idempotente na mesma transacao; falha
  no segundo filho deixa zero registros. Retries concorrentes produzem um unico
  conjunto. Chave vinculada ao tenant/operacao/hash do payload; conflito = 409.
- Estados: locks de grupo preservam pausa/cancelamento/needs_review; falha
  impeditiva bloqueia os proximos lotes, inclusive rejeicao recebida apos pausa.
  Cancelado nao vira completed. Dinamica sem filhos pode pausar/retomar.
- Fila: tenants ocupados excluidos antes do limite; um candidato por tenant,
  ate 20 por consulta (teto 100), rechecado sob lock. Caso com 25 jobs antigos de
  A nao impede B; exclusividade e continuidade contra avulsa/test-send mantidas.
- Dinamica: recuperacao reutiliza o snapshot persistido, mesmo com CRM alterado;
  filhos e enqueue sao atomicos. Recuperacao do intervalo legado filhos/sem jobs
  nao duplica filhos nem snapshot. Apenas controlador sem provider recupera lease.
- UI/API: Enviar conjunto agora exige confirmacao e RBAC, entra na mesma fila,
  e retry nao duplica jobs. Agendamento futuro permanece sem antecipacao.

Validacao final: 13/13 focados novos; suites afetadas de campanhas **198/198**
(fila 8, runner 10, revisao 11, rotas 128, importacao 7, exclusao 5, UI 29),
compostas por 188 casos fora do runner e sua repeticao final 10/10; Webchat 17/17.
Builds backend/frontend PASS. Smoke visual de confirmar/recusar envio agregado,
pausa, retomada e cancelamento PASS; zero outbound/provider. Nao houve repeticao
da bateria visual anterior. Evidencia local: `local-evidence/recovery/review-fixes/`.

A primeira suite teve interrupcao SIGKILL do runner durante diagnostico de I/O
JSON; as demais suites passaram. A repeticao isolada revelou dois testes longos
com relogio congelado emitindo leases vencidas. Fixture corrigida para tempo
atual, sem reduzir audiencia, assertions ou concorrencia; runner final 10/10.
O build expos tipagem incorreta da nova fixture CSV e filtro startsWith sobre
UUID no Webchat, ja presente na base. Corrigidos TemplateContext e intervalo UUID
equivalente; quatro testes de protocolo e limites SQL locais validados. O mock
da auditoria compartilhada foi isolado (antes tentava gravar tenant_a no DB real).
O registro historico de build PASS nao substitui esta nova evidencia compilada.

Schema/SQL migration sem alteracao; DB local `re7_recovery_audit` com 60 migrations
concluidas e zero pendentes. Nenhum migrate adicional, db push/reset ou correcao
de drift historico. Continuam pendentes ensaio operacional de rollout/rollback,
owner UI, aceite CRA e drift residual inventariado no runbook. CI de push apenas
main/develop; bloqueio Vercel da branch de revisao preservado. Sem deploy/DB de
producao/provider real. DELIVERED/READ → Conversation/HUMAN/WAITING continua
separada e sem alteracao funcional; reparo 6683 CLOSED.

## Persistencia para revisao Git — 2026-09-26

Status desta frente: TECHNICAL LOCAL VALIDATED / NOT DEPLOYED / OWNER UI PENDING.
Branch dedicada `review/campaign-recovery-20260926`, com parent/base `6d664d0b9ffcf52f5315bfeca96f0622f4d25792`.
A base de reconstrucao foi `5d925973`; os 80 acrescimos documentais de `6d664d0b`
foram conferidos e seu historico permanece ancestral. O owner PASS do lote anterior
(normalizacao/settings/contraste, head funcional `5ee2de6b`) continua OWNER VALIDATED / CLOSED;
nao se estende automaticamente a esta frente de lotes/fila.

Delta e fontes foram arquivados antes da troca de branch. Reaplicacao sobre `6d664d0b`
restaurou os mesmos 23 arquivos, com hashes conferidos; nao houve conflito funcional,
reset/clean ou alteracao da branch original. Implementacao, testes, schema/migration,
os quatro docs e este runbook compoem o escopo; .data, evidencias, dumps, arquivos
compactados, credenciais e fixtures de ambiente ficam fora do Git.

As 18 anotacoes UUID correspondem a tipos SQL ja existentes, sem ALTER TYPE novo.
O inventario por objeto e impacto do drift residual anterior esta no
`docs/RUNBOOK_WHATSAPP_AGENT.md`, secao "Drift historico residual — revisao da fila".
Nenhum desses defaults, indices ou nomes foi corrigido nesta frente.

Validacao preservada: fila/runner/rotas 144/144, apoio 41/41 e rechecagem dos casos
falhos 4/4; builds e Prisma validados anteriormente. Sem repeticao de testes/builds
porque esta persistencia nao muda comportamento funcional. Staging e whitespace
sao conferidos separadamente. CI versionada: push apenas main/develop; PR apenas
com destino main/develop. `vercel.json` bloqueia auto-deploy somente desta branch
via git.deploymentEnabled=false para seu nome exato; demais branches inalteradas.
Push de revisao nao autoriza merge, deploy, producao DB, provider ou envio real.

Pendencias: ensaio operacional de rollout/rollback, drift residual anterior,
owner UI e aceite CRA. Divergencia DELIVERED/READ → Conversation/HUMAN/WAITING
permanece separada e sem alteracao funcional. Reparo 6683 continua CLOSED.

## Objetivo
Padronizar o fluxo manual-controlado do `apps/whatsapp-agent` no modelo atual:

`LOCAL -> VALIDACAO LOCAL -> COMMIT/PUSH -> VPS -> VALIDACAO POS-DEPLOY`

Este runbook reflete o estado real atual do projeto:
- ambiente local funcional para backend, frontend e banco
- validacao real no `/app/login` e `/app/inbox`
- deploy manual na VPS
- rastreabilidade minima por branch, commit, horario e resultado

Runbooks complementares:
- `docs/onboarding.md`
- `docs/saas/runbook-re7.md`
- `docs/whatsapp-agent/05-env-and-smoke-test.md`
- `docs/whatsapp-agent/ops/DEPLOY_VPS_PM2.md`

## Principios operacionais
- Producao nao deve mais ser usada como ambiente principal de descoberta de bug.
- Todo patch deve passar por validacao local real antes da VPS.
- O deploy continua manual, mas deve ser rastreavel.
- Nao ha obrigatoriedade de PR formal ou CI/CD complexo neste momento.
- O commit exato que foi validado localmente deve ser o mesmo commit levado para a VPS.

## Fluxo padrao
1. Desenvolver e validar localmente.
2. Rodar build local.
3. Registrar o commit.
4. Fazer `push` da branch de trabalho.
5. Atualizar a VPS manualmente.
6. Validar health e fluxo funcional minimo na VPS.
7. Registrar o deploy.

## Pre-requisitos locais
- Repositorio local clonado
- PostgreSQL local funcional
- `.env` local configurado em `apps/whatsapp-agent/.env`
- backend local funcional
- frontend local funcional

Portas atuais de referencia:
- backend local: `http://127.0.0.1:3002`
- frontend local: `http://localhost:3000`

## Fluxo local

### 1) Backend local
```bash
cd /home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/apps/whatsapp-agent
npm ci --include=dev
npm run db:generate
npm run build
npm run dev
```

### 2) Frontend local
Em outro terminal:

```bash
cd /home/deifson-oliveira/DEIFSON/re7online-site/re7online-site
PORT=3000 NEXT_PUBLIC_WHATSAPP_AGENT_BASE_URL=http://127.0.0.1:3002 npm run dev
```

### 3) Validacao funcional local minima
Validar no navegador:
- `http://localhost:3000/app/login`
- `http://localhost:3000/app/inbox`

Checklist local minimo:
- login no `/app/login`
- inbox carregando
- fluxo do patch sendo validado localmente
- quando aplicavel, confirmar no banco o estado persistido
- quando o patch afetar realtime/inbox:
  - confirmar WebSocket `101 Switching Protocols` em `/agent-api/app/realtime`
    ou `/app/realtime`
  - validar ponto verde, som principal, som suave e fallback por polling
  - validar que trocar conversa nao recarrega nem desloca a lista lateral

Exemplo ja validado no estado atual:
- Sprint 37 validada localmente
- `CLOSED` persistindo com `closedAt` confirmado no banco

### 4) Build local final
```bash
cd /home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/apps/whatsapp-agent
npm run build

cd /home/deifson-oliveira/DEIFSON/re7online-site/re7online-site
npm run build
```

### 5) Commit e push
```bash
cd /home/deifson-oliveira/DEIFSON/re7online-site/re7online-site
git status
git add <arquivos>
git commit -m "<mensagem>"
git push origin flow-executor-quote-hardening
git rev-parse --short HEAD
```

Branch de trabalho atual:
- `flow-executor-quote-hardening`

### Deploy com commit fixo (recomendado)
Depois do `push` local, capture o commit exato validado:

```bash
cd /home/deifson-oliveira/DEIFSON/re7online-site/re7online-site
git rev-parse HEAD
git rev-parse --short HEAD
```

Na VPS, prefira deployar o commit exato:

```bash
cd /opt/re7online/site-re7online
git fetch origin
git checkout <commit_hash>
git rev-parse --short HEAD
```

Uso recomendado:
- branch continua sendo a referencia de trabalho
- commit exato passa a ser a referencia de deploy
- isso evita subir codigo diferente do que foi validado localmente

## Fluxo de deploy sem migration

### 1) Atualizar codigo na VPS
```bash
cd /opt/re7online/site-re7online
git fetch origin
git checkout flow-executor-quote-hardening
git pull --ff-only origin flow-executor-quote-hardening
git rev-parse --short HEAD
```

### 2) Reinstalar dependencias e rebuildar
```bash
cd /opt/re7online/site-re7online/apps/whatsapp-agent
npm ci --include=dev
npm run db:generate
npm run build
```

### 3) Reiniciar o processo
```bash
pm2 restart re7-whatsapp-agent --update-env
```

### 4) Validar rapidamente
```bash
curl -sS http://127.0.0.1:3001/health
pm2 status
lsof -i :3001
pm2 logs re7-whatsapp-agent --lines 50
```

## Fluxo de deploy com migration
Use este fluxo quando o patch incluir migration Prisma nova.

### 1) Atualizar codigo na VPS
```bash
cd /opt/re7online/site-re7online
git fetch origin
git checkout flow-executor-quote-hardening
git pull --ff-only origin flow-executor-quote-hardening
git rev-parse --short HEAD
```

### 2) Reinstalar dependencias, generate e migration
```bash
cd /opt/re7online/site-re7online/apps/whatsapp-agent
npm ci --include=dev
npm run db:generate
pg_dump -U wa_agent whatsapp_agent > backup_$(date +%F_%H%M).sql
npm run db:deploy
npm run build
```

### Backup antes de migration (obrigatorio em producao)
Antes de rodar `db:deploy`, gerar backup do banco:

```bash
cd /opt/re7online/site-re7online/apps/whatsapp-agent
pg_dump -U wa_agent whatsapp_agent > backup_$(date +%F_%H%M).sql
```

Objetivo:
- ter um ponto de recuperacao minimo antes de migration
- aumentar a seguranca operacional sem burocracia extra

### 3) Reiniciar o processo
```bash
pm2 restart re7-whatsapp-agent --update-env
```

### 4) Validar rapidamente
```bash
curl -sS http://127.0.0.1:3001/health
pm2 status
lsof -i :3001
pm2 logs re7-whatsapp-agent --lines 50
```

## Checklist pre-deploy
- patch validado localmente
- `/app/login` validado localmente
- `/app/inbox` validado localmente quando o patch afetar atendimento
- backend local buildando
- frontend local buildando quando houver alteracao em `src/`
- commit criado
- commit enviado para `origin`
- commit identificado (`git rev-parse --short HEAD`)
- definido se o patch tem migration ou nao

## Checklist pos-deploy
- `curl -sS http://127.0.0.1:3001/health`
- `pm2 logs re7-whatsapp-agent --lines 50`
- processo `re7-whatsapp-agent` ativo no PM2
- porta `3001` ativa
- sem processo duplicado escutando a mesma porta
- commit da VPS confere com o commit validado localmente
- smoke funcional minimo do patch em producao

Checks adicionais uteis:
```bash
pm2 status
curl -sS http://127.0.0.1:3001/admin/health -H "X-Admin-Token: $ADMIN_TOKEN"
lsof -i :3001
```

Quando o patch afetar realtime/inbox, validar tambem no navegador:
- `/app/inbox` abre sem erro;
- socket aparece como `101 Switching Protocols`;
- inbound em conversa nao ativa atualiza lista, ponto verde e som principal;
- inbound na conversa aberta atualiza timeline e toca som suave;
- polling continua atualizando estado se o socket cair.

## Retencao de midia local

Midias outbound enviadas pelo `/app/inbox` sao cacheadas localmente em
`apps/whatsapp-agent/.data/media/outbound/` para permitir reabertura,
download e reproducao futura sem depender apenas da URL temporaria da Meta.

Limpeza manual:

```bash
cd /opt/re7online/site-re7online/apps/whatsapp-agent
MEDIA_LOCAL_RETENTION_DAYS=7 npm run media:cleanup
```

Cron recomendado:

```cron
0 3 * * * cd /opt/re7online/site-re7online/apps/whatsapp-agent && MEDIA_LOCAL_RETENTION_DAYS=7 npm run media:cleanup >> /opt/re7online/site-re7online/apps/whatsapp-agent/.data/logs/media-cleanup.log 2>&1
```

Na VPS `converta.re7online.com`, essa entrada ja foi instalada no crontab do usuario
`deploy` em 2026-04-28, no commit `dbfcbd5`.

Verificacao:

```bash
crontab -l | grep media:cleanup
tail -n 50 /opt/re7online/site-re7online/apps/whatsapp-agent/.data/logs/media-cleanup.log
```

Reativar somente se a VPS/usuario `deploy` forem recriados, se o crontab for
removido, ou se a pasta de producao mudar.

Detalhes: `docs/whatsapp-agent/ops/MEDIA_RETENTION.md`.

## Retencao LGPD automatica

A retencao LGPD remove conversas antigas da operacao por soft delete e
anonimizacao, conforme `RetentionConfig.retentionDays` de cada tenant. A rotina
nao deve apagar fisicamente mensagens, eventos, metricas, leads ou contacts.

Execucao manual global, para todos os tenants existentes no banco no momento da
execucao:

```bash
cd /opt/re7online/site-re7online/apps/whatsapp-agent
npm run retention:run
```

Execucao manual limitada a um tenant especifico, quando necessario:

```bash
cd /opt/re7online/site-re7online/apps/whatsapp-agent
npm run retention:run -- --client-key justa-advocacia
```

Cron global instalado na VPS `converta.re7online.com`, no usuario `deploy`, em
2026-05-02. Ele roda para todos os tenants existentes no momento da execucao:

```cron
30 3 * * * cd /opt/re7online/site-re7online/apps/whatsapp-agent && npm run retention:run >> /opt/re7online/site-re7online/apps/whatsapp-agent/.data/logs/retention-global.log 2>&1
```

Verificacao:

```bash
crontab -l | grep retention
tail -n 50 /opt/re7online/site-re7online/apps/whatsapp-agent/.data/logs/retention-global.log
```

Reativar somente se a VPS/usuario `deploy` forem recriados, se o crontab for
removido, ou se a pasta de producao mudar. Para novos tenants, nao e necessario
criar nova linha de cron: a execucao global ja inclui todos os tenants com
`RetentionConfig` no banco, criando configuracao default de 90 dias quando ela
ainda nao existir.

Antes de usar retencao curta em producao, validar `RetentionConfig.retentionDays`
na tela `/app/settings/privacy`. Valores baixos, como 1 a 7 dias, podem retirar
conversas ativas da operacao.

## Retencao operacional de eventos

A tabela `Event` concentra auditoria e sinais operacionais. A limpeza de eventos
deve ser conservadora: medir primeiro, executar somente dry-run e apagar apenas
eventos classificados como `NOISE` quando o resultado for seguro.

Relatorio de armazenamento:

```bash
cd /opt/re7online/site-re7online/apps/whatsapp-agent
npm run --silent storage:report -- --json --include-events
```

Dry-run seguro, sem mutacao:

```bash
cd /opt/re7online/site-re7online/apps/whatsapp-agent
npm run --silent events:retention -- \
  --dry-run \
  --json \
  --include-noise \
  --noise-only \
  --days 30
```

Executar limpeza real somente se:

- `critical` for `0`;
- `operational` for `0`;
- `affectedEventNames` contiver apenas eventos descartaveis;
- health e DB estiverem OK;
- nao houver deploy instavel ou investigacao em andamento.

Limpeza real de ruido:

```bash
cd /opt/re7online/site-re7online/apps/whatsapp-agent
npm run --silent events:retention -- \
  --json \
  --include-noise \
  --noise-only \
  --days 30
```

Nao executar limpeza operacional sem decisao explicita. O script exige
`--confirm-operational` para execucao real com eventos `OPERATIONAL`; esta flag
nao deve ser usada em rotina comum.

Primeira execucao real segura registrada em 2026-07-13:

- HEAD de producao: `880420a`;
- `Event.rows` antes: `65193`;
- candidatos `NOISE`: `12912`;
- `critical`: `0`;
- `operational`: `0`;
- removidos: `12912`;
- eventos removidos:
  - `webhook.status.received`: `8555`;
  - `allowlist.check`: `4357`;
- `Event.rows` depois: `52281`;
- health final: OK;
- DB final: OK;
- PM2 final: `re7-admin-front` e `re7-whatsapp-agent` online.

A reducao fisica em disco pode nao aparecer imediatamente em `totalSize`, pois
depende de autovacuum/VACUUM do PostgreSQL.

Gatilho recomendado: repetir apenas a cada 7 a 14 dias, sempre seguindo a ordem
`storage:report`, dry-run `noise-only`, decisao explicita e execucao real
somente se os criterios acima continuarem seguros.

## Registro minimo do deploy
Registrar preferencialmente em:
- `docs/DEPLOY_LOG.md`

Registrar no minimo:

- branch:
- commit:
- horario:
- houve migration? `sim` / `nao`
- quem executou:
- validacao local: `ok` / `falhou`
- validacao pos-deploy: `ok` / `falhou`
- observacoes:

Exemplo:

```md
Deploy WhatsApp Agent
- branch: flow-executor-quote-hardening
- commit: abc1234
- horario: 2026-04-12 14:35 BRT
- migration: nao
- validacao local: ok (/app/login, /app/inbox)
- validacao pos-deploy: ok (/health, smoke do patch)
- observacoes: sem erro no PM2
```

## Rollback
Rollback minimo operacional:
1. identificar o commit anterior estavel
2. fazer checkout desse commit na VPS
3. reinstalar dependencias
4. rodar `db:generate`
5. rebuildar
6. reiniciar PM2
7. validar `/health`

Comandos:
```bash
cd /opt/re7online/site-re7online
git log --oneline -n 10
git checkout <commit_anterior>

cd /opt/re7online/site-re7online/apps/whatsapp-agent
npm ci --include=dev
npm run db:generate
npm run build
pm2 restart re7-whatsapp-agent --update-env
curl -sS http://127.0.0.1:3001/health
pm2 logs re7-whatsapp-agent --lines 50
```

Observacao:
- rollback de codigo nao reverte automaticamente migration destrutiva
- se o patch tiver migration sensivel, avaliar impacto antes do deploy

## Campanhas - fila por tenant e execucao incerta

Quando a fila duravel de campanhas por tenant estiver habilitada, uma execucao
`running` com resultado incerto nao deve ser liberada apenas por expiracao de
lease. O tenant permanece bloqueado para novas campanhas/test-send ate:

1. o runner finalizar o job normalmente; ou
2. uma revisao operacional classificar o job como `needs_review`, registrando
   motivo auditavel e liberando a lease sem reenviar automaticamente o trabalho.

Esse procedimento preserva a regra de nao executar duas campanhas simultaneas
para o mesmo tenant e evita reenvio automatico quando o processo caiu durante ou
logo apos uma chamada ao provider. Antes de classificar `needs_review`, conferir
logs, OutboundMessage/resultados ja persistidos, eventos tecnicos, estado do
provider quando disponivel e ausencia de runner ativo com posse valida. Apos a
classificacao, a campanha deve aparecer como "Revisao operacional" na lista,
com o motivo do bloqueio. A retomada/reexecucao deve ser decidida por gate
operacional separado, nunca por retry automatico cego.

Se o provider retornar sucesso/aceite e o executor perder a lease antes de
continuar, preservar primeiro a evidencia ja recebida de forma idempotente
(`OutboundMessage`, eventos e contadores aplicaveis) e impedir novas chamadas
do executor antigo. O proximo job do tenant so deve iniciar depois que o estado
do job atual estiver terminal ou classificado para revisao operacional. Nao
reenviar destinatario aceito apenas porque a lease expirou ou mudou de token.

Validacao local de integracao UI/API em 2026-09-26: o detalhe de campanha passa
a carregar `executionBatch` para exibir conjunto, chunks numerados, progresso
agregado/por lote, fila do tenant, horarios e motivos operacionais. Evidencia
tecnica: `campaignExecutionQueue` 8/8, `campaignRunner` 10/10,
`campaignsFeatureRoutes` 125/125, `campaignsPageContract` 29/29, backend build,
frontend build e `git diff --check` passaram. Smoke autenticado por API em
portas isoladas confirmou SUPERVISOR/ADMIN lendo um conjunto local de
3.001 destinatarios / quatro chunks e AGENT recebendo 403; a evidencia
sanitizada fica em `local-evidence/20260926-batch-ui-smoke/` e nao deve ser
versionada. Smoke visual estrito permanece pendente quando nao houver
	automacao disponivel; nesta frente foi possivel usar Chrome headless/CDP para
	validar detalhe do conjunto em desktop/tela estreita, SUPERVISOR/ADMIN
	autorizados e AGENT restrito. Complemento local tambem clicou pause/resume/cancel
	agregado e confirmou persistencia no DB local. Isso nao substitui smoke visual
	completo de criacao agrupada CRM/CSV nem toast de test-send ocupado por clique
	de UI. Em validacoes locais, evitar subir o processador de agendamento
com fixtures cujo `eligibleAt` ja venceu, pois ele pode consumir a fila local
antes do smoke visual.

## Observacoes praticas
- Compare link pode continuar sendo usado para revisao rapida, mas nao substitui o registro do commit exato deployado.
- O repositorio da VPS continua em:
  - `/opt/re7online/site-re7online`
- O backend principal continua em:
  - `/opt/re7online/site-re7online/apps/whatsapp-agent`
- Processo PM2 de producao:
  - `re7-whatsapp-agent`
- Health real da VPS:
  - `http://127.0.0.1:3001/health`

## Resumo operacional
- descubra bug localmente
- corrija localmente
- valide localmente
- build local
- commit + push
- deploy manual na VPS
- valide `/health` e o fluxo afetado
- registre branch, commit, horario e resultado

## Recuperacao local apos reboot — campanhas em lotes, 2026-09-26

O worktree de desenvolvimento em `/tmp` foi perdido. O delta foi reconstruido
por edicoes registradas na sessao e deve permanecer em caminho persistente:
`tmp/worktrees/re7-campaign-recovery-20260926`, dentro do checkout principal.
Nao confiar em `/tmp` para preservar codigo, banco, fixtures ou evidencias.
O checkout principal e o trabalho pausado de Guided Builder foram preservados.

A validacao local usou frontend 127.0.0.1:3062, API 127.0.0.1:3008 e PostgreSQL
127.0.0.1:55432. O harness local bloqueia fetch externo e nao inicia scheduler
periodico. Para snapshot dinamico, executar apenas um job de materializacao
com relogio de teste; verificar zero outbound e zero chamadas externas antes
de liberar qualquer etapa seguinte. Nao copiar configuracao sintetica para
producao. Scripts, fixture e dados locais nao devem ser versionados.

Para retomar, usar `start-api.sh` e `start-front.sh` em `local-evidence/recovery/`.
O banco correto e `re7_recovery_audit`, criado por migrations no PostgreSQL local
127.0.0.1:55432. As copias `re7_recovery_smoke` e `re7_recovery_regression` foram
preservadas como evidencias do erro de setup; nao sao baseline de schema nem destino
para o Client alinhado. Nao usar schema.test/compat, db push, reset ou SQL manual.
Em outro banco local vazio, executar `DATABASE_URL=<URL_LOCAL_ISOLADA> npm --prefix
apps/whatsapp-agent run db:deploy`, seguido de db:generate. Conferir todos os
checksums de `_prisma_migrations` e o schema incorporado no Client antes dos testes.
Os defaults/indices historicos listados no diff de auditoria nao foram removidos.
O migrate deploy valida a migration; ensaio operacional de rollout/rollback e separado.

Fechamento: os quatro fluxos UI/DB passaram (CRM estatico/dinamico, CSV,
agendamento/pausa/retomada/cancelamento agregado, test-send ocupado). Consultar
`RESULT_REPORT.md` e `result-summary.json` no diretorio local de evidencias.
O delta continua sem commit/push/deploy. Owner validation, aceite CRA, ensaio
operacional de rollout/rollback e decisao sobre materializacao DELIVERED/READ permanecem
pendentes. Manter o reparo 6683 encerrado e webhook/runtime preservados.

## Auditoria da recuperacao — 2026-09-26

Status tecnico: PRONTO PARA COMMIT DE REVISAO / NOT DEPLOYED / OWNER VALIDATION PENDING.
Esta nota atualiza o fechamento local abaixo; nao declara prontidao para deploy ou aceite CRA.

- Worktree persistente: `/home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/tmp/worktrees/re7-campaign-recovery-20260926`. HEAD detached `5d9259739754816d570470a30d52eb7eb53541bc`;
  referencia do ultimo HEAD anterior `6d664d0b9ffcf52f5315bfeca96f0622f4d25792`
  (branch original `zero-eligible-crm-eligibility-20260923`). Nao houve novo commit.
- Integridade: SHA-256 do patch e tar original conferidos; ambos coincidiam com
  o codigo no inicio desta auditoria. Replay independente das edicoes historicas
  confirmou migration, fila, runner e testes. API/UI e consultas CRM receberam
  as correcoes posteriores discriminadas em `local-evidence/recovery/audit/`.
  Nao existe snapshot integral do filesystem anterior: DB e capturas perdidos
  nao sao declarados recuperados byte a byte. Comportamentos criticos foram testados.
- Falhas fechadas: `CompletedServiceSnapshot.clientId` text versus cast SQL uuid;
  joins Client.id/WaPhoneNumber.clientId e Conversation.id/ConversationMetrics.conversationId
  com uuid/text na copia parcialmente criada. Banco novo `re7_recovery_audit`,
  127.0.0.1:55432, criado exclusivamente por `prisma migrate deploy`, corrigiu o ambiente.
  A fixture de agendamento ja teve o `idempotencyKey` obrigatorio reposto na retomada.
  Nenhuma assertion removida ou relaxada; concorrencia preservada.
- Schema: 18 anotacoes `@db.Uuid` alinhadas aos tipos das migrations existentes;
  Prisma Client 6.19.2 regenerado e semanticamente correspondente. SQL da fila intacto.
  Diff somente leitura ainda registra defaults, indices e nomes historicos;
  nao foi aplicado e nao ha diferenca de tipos ou estrutura da fila nesse diff.
- Migration validada: registro anterior de 60 migrations PASS recuperado; novo
  `migrate deploy` 60/60 PASS necessario porque o DB de teste recuperado havia
  sido substituido por schemas divergentes. Checksums de 60 SQLs iguais ao ledger.
  "Ensaio pendente" dizia respeito a rollout/rollback operacional, nao a falha
  da migration. Nao foi usado db push, reset ou SQL manual nesta auditoria.
- Testes finais: casos anteriormente falhos 4/4; fila 8/8 + runner 10/10 + rotas
  126/126 = 144/144; importacao/exclusao/contratos UI 41/41; zero skips/falhas.
  Backend build e prisma validate/generate PASS. Build frontend anterior preservado
  porque UI nao mudou nesta auditoria. Os quatro smokes aprovados nao foram repetidos.
- Contratos: 3.001 → quatro lotes, snapshot unico, variaveis CRM/CSV, isolamento por
  tenant/exclusividade, scheduler concorrente, retomada, aceite apos perda de lease
  e bloqueios antes do provider cobertos. Provider apenas simulado nos testes.
- Pendencias efetivas: rollout/rollback operacional, drift residual historico de
  defaults/indices, owner validation, aceite CRA e decisao de dominio DELIVERED/READ →
  Conversation/HUMAN/WAITING. Divergencia de dominio permanece separada e sem alteracao
  funcional; 6683 segue encerrado. Sem commit/push/deploy, producao DB ou envio real.

## Drift historico residual — revisao da fila

Inventario do diff somente leitura entre o DB criado pelas 60 migrations e o
schema alinhado. Todos os objetos abaixo sao anteriores a
`20260925143000_add_campaign_execution_queue`. O diff nao foi executado.
Nao ha ALTER TYPE nem diferenca nas quatro tabelas de batch/job/lease.

| Objeto existente no SQL | Diferenca no schema / impacto de aplicar o diff incidentalmente |
|---|---|
| Client.id — DEFAULT gen_random_uuid() | @default(uuid()) gera UUID pelo Prisma; remover default SQL prejudicaria inserts SQL que omitem id. Default preservado. |
| WaPhoneNumber.id — DEFAULT gen_random_uuid() | Mesmo caso; default SQL preservado. |
| Contact.id — DEFAULT gen_random_uuid() | Mesmo caso; default SQL preservado. |
| Conversation.id — DEFAULT gen_random_uuid() | Mesmo caso; default SQL preservado. |
| Message.id — DEFAULT gen_random_uuid() | Mesmo caso; default SQL preservado. |
| Event.id — DEFAULT gen_random_uuid() | Mesmo caso; default SQL preservado. |
| InboundMessage.id — DEFAULT gen_random_uuid() | Mesmo caso; default SQL preservado. |
| OutboundMessage.id — DEFAULT gen_random_uuid() | Mesmo caso; default SQL preservado. |
| AgentAvailability.updatedAt — DEFAULT CURRENT_TIMESTAMP | Schema usa @updatedAt, sem default SQL declarado; retirar default mudaria inserts externos ao Prisma. Preservado. |
| ChatbotFlow.updatedAt — DEFAULT CURRENT_TIMESTAMP | Mesmo caso; default SQL preservado. |
| DepartmentBusinessHour.updatedAt — DEFAULT CURRENT_TIMESTAMP | Mesmo caso; default SQL preservado. |
| UserDepartmentMembership.updatedAt — DEFAULT CURRENT_TIMESTAMP | Mesmo caso; default SQL preservado. |
| SearchIndex_searchVector_idx — GIN(searchVector) | Indice SQL adicional, sobre coluna tsvector; removê-lo poderia degradar busca textual. Preservado. |
| WebhookEndpoint_clientId_signingSecretKeyVersion_idx | Indice SQL adicional; removê-lo poderia degradar consultas por tenant/versao de chave. Preservado. |
| Department_operationalQueue_fkey | Nome do SQL difere do inferido Department_clientId_id_operationalQueueId_fkey; renomeacao de catalogo, sem mudar relacao. Preservado. |
| CompletedServiceSnapshot_clientId_departmentId_assignedUserId_c | Nome SQL difere de CompletedServiceSnapshot_clientId_departmentId_assignedUser_idx; renomeacao de catalogo, sem mudar colunas. Preservado. |

As 18 anotacoes @db.Uuid apenas alinham o Client aos tipos preexistentes:
`20260215133500_fix_uuid_ids` ja define Client.id, WaPhoneNumber.id/clientId,
Contact.id/clientId, Conversation.id/clientId, Message.id/conversationId,
Event.id/clientId, InboundMessage.id/clientId e OutboundMessage.id/clientId (15 campos).
`20260412233000_add_sla_and_conversation_metrics` define
ConversationMetrics.clientId/conversationId e SLAConfig.clientId (3 campos).
A migration da fila permanece byte a byte igual a validada; nenhuma migration
historica foi editada. Defaults SQL e geracao UUID no Prisma sao aspectos distintos.

Evidencias locais nao versionadas: `local-evidence/recovery/audit/schema-db-diff.sql`,
`db-uuid-columns.tsv`, `migration-checksums.json` e `validated-source-hashes.json`.
Backup pre-Git: `local-evidence/recovery/git-review/`, incluindo os deltas contra
5d925973 e 6d664d0b, tar dos fontes, hashes e referencia de stash mantida.

## Operacao dos conjuntos apos revisao 109c9f15

- Retry CSV: conservar requestId e payload; 409 exige revisar a operacao, nunca
  trocar a chave automaticamente para contornar conflito. Resultado legado sem
  fingerprint tambem exige revisao. Falha transacional pode repetir a mesma chave.
- Pausa aguarda fim da chamada em andamento; nao retomar enquanto existir job
  running/needs_review ou falha impeditiva. Cancelamento em voo exige revisao
  operacional; resultado aceito permanece auditado e nao autoriza reenvio.
- Falha de snapshot/filhos: manter o evento criptografado e a chave de segredo;
  controlador expirado e recuperado no proximo tick. Snapshot ilegivel bloqueia
  a materializacao; nao consultar CRM novamente para substituir a audiencia.
- Envio imediato nao antecipa conjuntos futuros, nao usa provider direto e
  respeita conjunto ativo/lease do tenant. Pausa libera outros trabalhos quando
  nao ha chamada em andamento; conjunto ativo mantem continuidade dos lotes.
- Rollback operacional ainda nao ensaiado: antes de qualquer publicacao futura,
  registrar jobs/leases e aceites, interromper admissao e tratar chamadas em voo.
  Nao reverter schema ou limpar filas/snapshots para reexecutar envios aceitos.

## Ensaio operacional local da fila — procedimento executado

Esta secao substitui a pendencia de **ensaio local**, preservando os registros
anteriores. Nao atesta rollback funcional com envio nem valida a infraestrutura
de producao. O codigo antigo usado foi `6d664d0b` (anterior a fila); o novo foi
`fedef1e1` com a correcao de inicio efetivo desta revisao.

### Preparacao e isolamento

Executado no worktree persistente
`/home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/tmp/worktrees/re7-campaign-recovery-20260926`.
Cluster exclusivo PostgreSQL 16, TCP somente 127.0.0.1:55434, DB
`re7_rollout_local`; socket curto `/tmp/re7-rollout-socket-20260926`.
O primeiro caminho de socket excedia 107 bytes e foi corrigido antes da criacao
do banco; os logs dessa tentativa foram preservados. Nenhum DB anterior foi usado
como destino de restore/reset. Dados do ensaio permanecem preservados.

O harness versionado `apps/whatsapp-agent/scripts/campaign-rollout-rehearsal.ts`
recusa outro host/porta/DB, parametros extras de URL, usuario ou cwd. Exige
`LOCAL_CAMPAIGN_REHEARSAL=synthetic-only`; usa segredo/credenciais falsos, respostas
em memoria e bloqueio de fetch/HTTP externo. O launcher usa ambiente sem variaveis
herdadas, exceto PATH. O papel `rollout_runtime` nao e owner/superuser nem herda
permissoes; `rollout_owner` e exclusivo da administracao deste cluster sintetico.

Para repetir, usar outro worktree/diretorio de evidencias novo e uma instancia
local livre na porta reservada; **nao apagar o ensaio existente**. Com dependencias
ja instaladas no worktree, preparar o equivalente aos comandos abaixo:

```bash
task_worktree="$PWD"
task_evidence="$task_worktree/local-evidence/recovery/rollout-local"
# Exigir destino inexistente e porta livre; abortar se ja houver PG_VERSION/DB.
mkdir -p "$task_evidence/old-source" "$task_evidence/runtime" /tmp/re7-rollout-socket-20260926
git archive 6d664d0b apps/whatsapp-agent/src apps/whatsapp-agent/prisma | tar -x -C "$task_evidence/old-source"
ln -s "$task_worktree/apps/whatsapp-agent/node_modules" "$task_evidence/old-source/apps/whatsapp-agent/node_modules"
/usr/lib/postgresql/16/bin/initdb -D "$task_evidence/pgdata" --username=rollout_owner --auth=trust --encoding=UTF8 --no-locale
/usr/lib/postgresql/16/bin/pg_ctl -D "$task_evidence/pgdata" -l "$task_evidence/postgres.log" -o '-p 55434 -h 127.0.0.1 -k /tmp/re7-rollout-socket-20260926' start
createdb -h 127.0.0.1 -p 55434 -U rollout_owner re7_rollout_local
env -i PATH="$PATH" DATABASE_URL=postgresql://rollout_owner@127.0.0.1:55434/re7_rollout_local "$task_worktree/apps/whatsapp-agent/node_modules/.bin/prisma" migrate deploy --schema "$task_evidence/old-source/apps/whatsapp-agent/prisma/schema.prisma"
rehearse_phase() {
  (cd "$task_evidence/runtime" && env -i PATH="$PATH" DATABASE_URL="postgresql://$2@127.0.0.1:55434/re7_rollout_local" LOCAL_CAMPAIGN_REHEARSAL=synthetic-only ENABLE_TENANTS_JSON_FALLBACK=false "$task_worktree/apps/whatsapp-agent/node_modules/.bin/tsx" "$task_worktree/apps/whatsapp-agent/scripts/campaign-rollout-rehearsal.ts" "$1")
}
rehearse_phase seed-base rollout_owner
pg_dump -h 127.0.0.1 -p 55434 -U rollout_owner -Fc -f "$task_evidence/base-before-migration.dump" re7_rollout_local
env -i PATH="$PATH" DATABASE_URL=postgresql://rollout_owner@127.0.0.1:55434/re7_rollout_local "$task_worktree/apps/whatsapp-agent/node_modules/.bin/prisma" migrate deploy --schema "$task_worktree/apps/whatsapp-agent/prisma/schema.prisma"
rehearse_phase after-migration rollout_owner
```

### Sequencia de falha, suspensao e recuperacao

Cada fase deve gravar log proprio. Interromper imediatamente diante de resultado
inesperado; nao prosseguir para grant/resume se uma assert falhar. As saidas 72/73
abaixo sao falhas deliberadas, verificadas pelo operador, nao erros a ignorar.

1. `startup-fault rollout_runtime`: saida **72** esperada apos comprovar que o
   runtime ainda nao pode consultar Campaign. Migration permanece aplicada; tres
   campanhas antigas iguais, zero jobs. Falha de startup nao autoriza ativar o
   runner antigo sobre o schema novo.
2. `grant rollout_owner`, depois `drain rollout_runtime`: liberar somente o
   runtime novo. Processar fila real com provider em memoria. Fechar ingresso
   para todas as rotas, exceto health, pausar conjunto e aguardar retorno da
   chamada em voo; um aceite conhecido permanece auditado. Interromper controlador
   dinamico apos persistir snapshot, pausar e alterar o CRM de teste.
3. `uncertain-crash rollout_runtime`: saida **73** esperada, terminando realmente
   o processo apos submissao simulada e antes da resposta. O ledger do provider
   e uma evidencia externa simulada, nao um aceite inventado no Event local.
4. `fence rollout_owner`: marcar o job incerto via operacao needs_review, sem
   reenfileirar. Revogar privilegios de tabelas/sequences do runtime e preservar
   `rollback-preserved.json`; gerar `suspended-before-rollback.dump` com pg_dump.
   Em ambiente alvo: fechar ingresso em todas as instancias, desabilitar
   `CAMPAIGN_SCHEDULE_PROCESSOR_DISABLED=true`, parar workers/instancias e
   confirmar inexistencia de conexoes/sessoes antigas antes de trocar versao.
5. `old-probe rollout_runtime`: importar e invocar o runner real de `6d664d0b`;
   a consulta e negada pelo DB. `verify-fence rollout_owner` compara todas as
   campanhas, grupos, jobs, leases, eventos e outbound ao manifesto suspenso.
   Resultado observado: igualdade integral e zero chamadas de provider.
6. Confirmar processo antigo encerrado e zero conexoes `rollout_runtime` em
   pg_stat_activity. Somente entao `grant rollout_owner` e
   `resume-new rollout_runtime`. O controlador espera sua lease real expirar;
   o snapshot anterior e reutilizado, sem apagar jobs, eventos ou tabelas.
   Retomar apenas grupos sem incerteza; o grupo needs_review continua bloqueado.
7. `verify-final rollout_runtime`: conferir quatro aceites conhecidos, uma
   pendencia incerta, inicio original de todos os grupos e cinco rotas HTTP em
   503, sem alteracao de estado. Gerar `after-return-new.dump`. Reabertura de
   admissao nao foi automatizada nem executada neste ensaio.

**Limite do rollback:** processamento de campanhas fica SUSPENSO. O ensaio usou
manutencao de toda a API, exceto a passagem de health, e revogacao de acesso do
runtime a todas as tabelas. Nao se declara disponibilidade funcional do backend
antigo. Apenas desligar o scheduler e insuficiente: envio manual/API pode existir.
Se o runtime alvo for owner/superuser, compartilhar credenciais privilegiadas ou
possuir outro caminho de ingresso/provider sem bloqueio, **parar o rollout** ate
haver cerca equivalente comprovada. Nao executar down migration/drop/reset nem
restaurar dump anterior sobre aceites posteriores. Dumps servem para preservacao
forense/recuperacao isolada, nunca para apagar historico e liberar reenvio.

**Condicoes de parada:** migration falha/checksum divergente; perda das campanhas
antigas; entrada de campanha durante manutencao; processo/conexao antiga viva;
provider real acessivel; quebra de exclusividade; snapshot ilegivel; resultado
incerto; duplicacao; divergencia de IDs/payloads no intervalo suspenso. Manter
admissao fechada, salvar evidencias e investigar. Resultado incerto exige
reconciliacao operacional com fonte autorizada; nunca converter em queued por
expiracao da lease. A unica recuperacao automatica ensaiada e a do controlador
sem chamada a provider, preservando o snapshot.

### Drift: decisao por objeto e evidencia

O inventario anterior permanece a referencia; o SQL de diff **nao foi aplicado**.
`drift-before.json` e `drift-after.json` sao identicos nos 16 objetos abaixo.
`drift-readonly.sql` coincide integralmente com o diff historico; nao ha diferenca
nas quatro tabelas da fila. A migration aplicada foi exclusivamente aditiva.

| Objetos historicos | Impedem este rollout? | Evidencia/condicao |
|---|---|---|
| Client.id, WaPhoneNumber.id, Contact.id, Conversation.id, Message.id, Event.id, InboundMessage.id, OutboundMessage.id | Nao | Oito defaults SQL gen_random_uuid preservados; IDs/FKs UUID aceitos no seed antigo e no processamento novo. Nao remover defaults para alinhar diff. |
| AgentAvailability.updatedAt, ChatbotFlow.updatedAt, DepartmentBusinessHour.updatedAt, UserDepartmentMembership.updatedAt | Nao | Quatro defaults CURRENT_TIMESTAMP intactos; nova migration nao toca essas tabelas. Prisma @updatedAt continua compativel com defaults SQL. |
| SearchIndex_searchVector_idx | Nao | GIN existente preservado no catalogo; fila nao exige sua remocao. |
| WebhookEndpoint_clientId_signingSecretKeyVersion_idx | Nao | Indice adicional preservado, sem alteracao de consulta/estrutura. |
| Department_operationalQueue_fkey | Nao | Definicao relacional identica; diferenca e o nome inferido pelo schema. |
| CompletedServiceSnapshot_clientId_departmentId_assignedUserId_c | Nao | Colunas/definicao identicas; diferenca e o nome inferido do indice. |

Essa conclusao vale para o rollout aditivo ensaiado sobre as 59 migrations
anteriores, mantendo o catalogo existente. Nao autoriza aplicar o diff de drift,
nem presume que um banco alvo desconhecido tenha o mesmo catalogo. Conferencia
somente leitura do alvo e das permissoes/rotas de operacao permanece uma condicao
para eventual decisao de implantacao, fora do escopo local autorizado.

### Resultados e limites comprovados

- Migrations 59 → 60 via Prisma; tres campanhas antigas preservadas.
- Falha de startup 72; falha em voo 73; nenhum estado apagado para recuperar.
- Admissao 503, rollback antigo sem acesso a Campaign e sem provider.
- Retorno novo: dois grupos completos, cinco submissoes unicas simuladas,
  quatro aceites locais conhecidos e uma pendencia needs_review retida.
- Snapshot/variavel original preservados apesar da mudanca no CRM; IDs de jobs
  e eventos anteriores preservados; inicios efetivos dos grupos inalterados.
- 2/2 testes de horario/recuperacao, 8/8 fila e build backend PASS. UI ja usa
  job.startedAt por lote; nenhum smoke visual/build frontend repetido.
- Limites: uma instancia/cluster local, provider simulado, sem prova de capacidade,
  HA, fences de producao, entrega real ou rollback com processamento ativo.
  Owner UI e aceite CRA continuam pendentes; NOT DEPLOYED. Divergencia
  DELIVERED/READ → HUMAN/WAITING separada; 6683 CLOSED.


### Preflight do alvo — 2026-09-26 (somente leitura)

Produção `5ee2de6b`; candidato `2ecfc91a`: **NOT DEPLOYED / OWNER UI PENDING**.
[Preflight único, condições de parada e recuperação](saas/CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md) atualizado após `66b9cf2b`: portas 3000/3001 alcançáveis externamente, rewrite público do frontend e risco PM2 resurrect confirmados. Leituras privilegiadas de Nginx/firewall negadas; comandos exatos para o operador constam no preflight.

Recomendação: não avançar à migration; preparar e ensaiar guarda de admissão/drain e artefato de recuperação do atendimento com campanhas fechadas, em tarefa separada. Código atual não comprova quiescência de test-send/runners, nem retorno seletivo seguro. A estimativa preliminar de 30–60 min não constitui janela proposta para aprovação. Sem promessa de inbound/retries; sem REVOKE do papel compartilhado. Migration/drift/ensaio anteriores não repetidos; nenhuma alteração de runtime. Owner PASS anterior preservado, 6683 CLOSED, CRA pendente e DELIVERED/READ → HUMAN/WAITING separados.


## Guarda operacional de campanhas — implementação local, 2026-09-26

Base `2b5697b6`, sem commit/push/deploy. A leitura remota anterior está no
[preflight único](saas/CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md); não houve nova
consulta a produção nesta implementação. NOT DEPLOYED / OWNER UI PENDING.

### Configuração e autorização

`CAMPAIGN_OPERATIONS_FILE` deve ser um caminho absoluto persistente no volume
local de `.data`, **o mesmo arquivo** para todas as instâncias e diretórios de
release/recuperação. Ausência da variável, arquivo inválido, erro de leitura ou
lock indisponível fecham campanhas. Arquivo inexistente começa fechado. Não usar
um arquivo por release nem storage efêmero. Implementação para processos no mesmo
host/filesystem local Linux (identidade de boot + início do processo em `/proc`); não foi validada para NFS ou múltiplos hosts. Configurar
`CAMPAIGN_BUILD_ID` com a identificação do artefato; na ausência é exposto o SHA256
do módulo da guarda (não uma alegação de hash do release completo).

Reutiliza a persistência JSON/rename da convenção de armazenamento local e o
superadmin operacional existente. Manutenções em memória não são usadas como
fence. Escrita usa lock exclusivo por mkdir, fsync do arquivo, rename e fsync do
diretório. Nenhum timeout remove lock abandonado ou tarefa. Não há nova fila,
tabela, migration, mudança de papel SQL nem bloqueio do outbound genérico Inbox.

API autenticada existente: `GET /admin/ops/campaign-execution` retorna estado,
geração, instância/build, tarefas/fases e últimas ações auditadas. POST no mesmo
path recebe `{ "open": false, "generation": <geração lida>, "reason": "motivo" }`.
Abertura usa `open:true`, geração atual e motivo obrigatório; exige ausência de
pendências. Token tenant e usuários app (inclusive supervisor/admin tenant) não
controlam esse endpoint. A identidade operacional segue o token superadmin já
existente, não inventa identidade pessoal quando o token é compartilhado.

O registro é metadado de execução, não prova de entrega: intents, aceites,
OutboundMessage e eventos de domínio continuam sendo a evidência. Diagnóstico
não inclui telefone, payload, variáveis ou credenciais; referências técnicas
permitem correlacionar tenant/campanha/messageId para revisão autorizada.

### Fechamento e drain

Admissão de mutações app/admin/public-api ocorre antes da pré-validação assíncrona.
Scheduler, claim e runner desacoplado têm registros próprios. Uma resposta HTTP
concluída não apaga o runner; a finalização do scheduler não confunde esse filho
ativo com erro. Antes da invocação de outbound de campanha, registra intento e
serializa a invocação com o fechamento. Se fechar durante persistência do intento,
provider não é invocado; o intento fica pendente para revisão conservadora.

Chamada já iniciada pode concluir e gravar aceitação/resultado. Pendência de
provider/persistência não é liberada por timeout. Falha/crash mantém registro;
restart com registros de executor encerrado fecha admissão, não zera evidência.
`drained=true` exige estado fechado legível e nenhum trabalho pendente no arquivo
compartilhado. Isso só cobre executores instrumentados e o arquivo configurado:
não prova drain de código antigo, outro host ou arquivo de configuração divergente.

Suspensão administrativa devolve o job à fila existente sem mudar a intenção
sending/running da campanha/grupo. Pausa/cancelamento do usuário continuam com
RBAC e precedem o requeue: job não é reaberto se o usuário interrompeu a campanha.
As rotas de pause/cancel continuam disponíveis com a guarda fechada. Abertura
explícita permite o scheduler existente retomar com snapshot/intents/aceites
preservados; nenhum contador é usado como autorização para reenvio cego.

Se houver tarefa/lock abandonado, NÃO apagar arquivo, expirar lease nem trocar
por um arquivo vazio para abrir. Manter fechado, preservar cópia/hash e estado
SQL, identificar o processo/geração e correlacionar intent/aceite/resultado.
A reconciliação requer decisão operacional e evidência externa quando aplicável;
não há endpoint de “limpar pendências” ou reconciliação automática nesta entrega.
O ensaio não transforma submissão incerta em entregue/não entregue.

### Artefato de recuperação do atendimento

Worktree separado `tmp/worktrees/re7-campaign-service-recovery-20260926`, detached
em `5ee2de6b`, com guarda compilada permanentemente fechada: nem variável de
ambiente, arquivo aberto ou POST superadmin liberam campanhas. Rotas de mutação,
scheduler e runner interno são impedidos; atendimento não é cercado pelo guard.
Client Prisma privado gerado do schema desse SHA; nenhuma migration executada.
Não compartilhar o Client gerado entre versões. Worker, módulos de sessão e
transportes não foram alterados. Patch/hashes locais preservam as diferenças do
artefato; não houve commit do worktree de recuperação.

Em recuperação futura: manter arquivo/generation fechado, confirmar ausência de
executor anterior e respawn, iniciar apenas artefato identificado, verificar
atendimento por critérios funcionais e conservar tabelas novas/jobs/snapshots/
aceites. Nunca executar down migration/restore destrutivo para fazer o antigo
funcionar. Retorno ao candidato mantém o mesmo fence fechado; abrir explicitamente
só após diagnóstico sem pendências e revisão de incertezas. Resultado de health
isolado não aceita recuperação de atendimento.

### Primeira instalação: condição ainda externa ao ensaio

O SHA hoje vivo não tem instrumentação. Instalar a guarda por restart NÃO prova
retroativamente que a API antiga terminou chamadas. Antes de qualquer janela,
operador deve conferir Nginx efetivo, portas diretas/IPv4/IPv6, frontend/aliases e
PM2 saved state/boot conforme comandos do preflight. Bloquear admissão antiga em
todas as entradas exige autorização própria; scheduler antigo continua sendo
fonte interna até cessar o processo. Não usar REVOKE, pm2 kill ou reload all.

É necessária decisão explícita do owner sobre a primeira troca de API e sobre
chamadas potencialmente incertas. Preservar logs/intents/resultados e marco da
transição; comprovar que não resta processo antigo ou mecanismo que o ressuscite.
Onde o código antigo não permite demonstrar término, classificar a pendência para
reconciliação, não presumir quiescência por status sending=0 ou espera. Subir o
artefato guardado inicialmente fechado pode recuperar atendimento, mas não apaga
a incerteza anterior. Não avançar à migration/abertura enquanto houver essa lacuna.

API parada afeta Inbox/CRM/autenticação/realtime/webhooks; worker/sessões devem
ficar preservados, mas callbacks dependentes da API degradam. Não há promessa de
preservação integral de inbound, retry/replay ou risco zero. Esta primeira
transição, acesso privilegiado, janela/aceitação de impacto, owner UI e CRA não
foram autorizados/exercidos por esta tarefa local.


Validação final e resultados exatos, sem duplicar o relatório:
[ensaios da guarda e recuperação](saas/CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md#resultados-comprovados-do-ensaio-local).
Para repetir apenas um caso relevante, usar env limpo com DATABASE_URL do DB
sintético, NODE_ENV=test, segredos fictícios, loader tsx e
`--import ./apps/whatsapp-agent/scripts/campaign-guard-local-isolation.mjs`.
As quatro suítes afetadas abrem arquivos temporários exclusivos pela API real
na fixture `campaignOperationsTestSupport.ts`; não existe bypass de produção.
O teste de retorno usa `CAMPAIGN_RECOVERY_WORKTREE` apontando para o worktree
separado e chama o probe estritamente local `campaign-guard-recovery-probe.ts`.
Não reutilizar esses nomes/URLs de teste em produção nem inferir que um arquivo
local fechado protege outro processo com configuração diferente.


## Publicação dos dois artefatos para revisão — 2026-09-26

NOT DEPLOYED / OWNER UI PENDING. Esta seção sucede o estado local sem commit
registrado acima; não substitui nem apaga os ensaios ou encerramentos anteriores.

- Candidato: `review/campaign-recovery-20260926`, parent documental `2b5697b6`,
  preserva candidato funcional `2ecfc91a` e histórico owner PASS. Guarda/drain,
  integração à fila existente e testes; não é autorização de deploy ou aceite CRA.
- Recuperação: `review/campaign-service-recovery-20260926`, commit `e6a12bc9f4ae77ada191f7bdc7d835ee704d5bac`,
  parent direto `5ee2de6b8878aefa733a6fbe1b7f1553fd78ae2e`. Atendimento antigo com
  campanhas permanentemente fechadas em código. Não misturar sua implementação
  com o candidato nem voltar ao runner original desprotegido.
  [Procedimento do artefato](https://github.com/nosfied/site-re7online/blob/e6a12bc9f4ae77ada191f7bdc7d835ee704d5bac/docs/CAMPAIGN_SERVICE_RECOVERY_REVIEW.md).

### Configuração e limite efetivamente imposto

`CAMPAIGN_OPERATIONS_FILE` é absoluto, persistente, fora do release, idêntico em
TODAS as instâncias/versões do mesmo host. Proposta a provisionar no alvo:
`/var/lib/re7/campaign-operations/state.json`; não foi configurada remotamente.
Não usar caminho por release nem arquivos separados. Exigir filesystem local
Linux, sem NFS, hostnames/container namespaces com visão divergente de /proc ou
múltiplos hosts. Abertura exige `CAMPAIGN_OPERATIONS_TOPOLOGY=single-host` e
`CAMPAIGN_OPERATIONS_HOST_ID` igual à identidade local de `/etc/machine-id`.
Não publicar o valor dessa identidade. Estado aberto fica vinculado a esse host.
Configuração ausente, identidade divergente ou topologia diferente fecha a leitura
operacional e impede nova admissão/provider; POST open é recusado se configuração
não validada. Ledger legado sem vínculo exige abertura explícita após revisão.
Fechamento/diagnóstico e finalização de trabalho já admitido permanecem disponíveis.

Esse atestado é configuração operacional, não descoberta de hosts: inventário
completo de executores continua obrigatório. Se houver host adicional, arquivo
diferente, filesystem/namespace não validado ou inventário inconclusivo, NÃO
atestar single-host/NÃO abrir. Configuração indevidamente replicada ou inventário
falso não são detectáveis integralmente pelo arquivo. Não há coordenação entre
hosts. A recuperação não pode abrir sob nenhuma topologia/configuração.

Diretório privado 0700/arquivo 0600 são criados com esses modos; diretórios já
existentes não têm permissões reparadas. Antes de provisionar, verificar dono,
ancestrais, ausência de symlinks e ausência de escrita por terceiros. Não alterar
permissões compartilhadas. Mesmo UID/root continua capaz de modificar estado;
o arquivo não é proteção contra runtime/host comprometido. Controle via backend
exige superadmin; tenant-admin é recusado, audit usa o ator técnico do mecanismo
existente, sem inventar identificação pessoal para token compartilhado.

Arquivo ausente inicia fechado; ilegível/corrompido recusa operação e não comprova
drain. Lock exclusivo por mkdir, temp 0600, fsync/rename/fsync serializam alterações
no filesystem validado. Colisão recusa operação, sem espera/retry que abra janela.
Crash pode deixar lock/temp; não apagar nem expirar automaticamente. Restart e
resurrect preservam ledger de trabalho incerto; identidade boot/processo impede
confundir reutilização de PID com executor vivo. Investigar pendências correlacionando
intents/aceites/resultados SQL. Não inferir entrega nem reenviar por timeout.

Primeira transição permanece pendente e não há quiescência retroativa. Necessários:
verificações privilegiadas de entradas/supervisores, provisionamento privado do
estado/mesma configuração, decisão owner sobre janela/impacto e tratamento de
chamadas antigas incertas. Recuperação do atendimento mantém campanhas suspensas;
health sozinho não aceita rollback. Sem promessa de preservação inbound/retries.
6683 CLOSED; DELIVERED/READ → HUMAN/WAITING separado; owner UI/CRA pendentes.

### Publicação Git e evidências

Backups anteriores intactos; novos patches, arquivos e hashes em
`local-evidence/recovery/guard-publication/` (fora do Git). Staging explícito exclui
estado operacional, .data, dumps, evidências, credenciais e configurações privadas.
Ambos `vercel.json` recusam auto-deploy para os dois nomes exatos de branches
([semântica oficial](https://vercel.com/docs/project-configuration/git-configuration)).
Único workflow nas duas árvores: CI em push main/develop e PR para main/develop,
sem job de implantação. Scripts VPS são manuais, não invocados pelo workflow.
Nenhum merge/force/deploy. Leitura do projeto/lista Vercel antes do push não mostrou
implantação das branches de revisão; consulta detalhada get_project indisponível
por incompatibilidade de schema do connector, sem alteração de configuração.

Resultados incrementais e evidências anteriores ficam no preflight único.
Para o probe de recuperação commitada, informar `CAMPAIGN_RECOVERY_EXPECTED_SHA`
com SHA completo e `CAMPAIGN_RECOVERY_WORKTREE`; o script exige HEAD exato e
ancestralidade em 5ee2de6b. Provider/rede externos continuam bloqueados pelo
launcher sintético. Não repetir suítes completas sem alteração pertinente.
