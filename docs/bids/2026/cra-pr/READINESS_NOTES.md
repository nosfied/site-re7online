# CRA-PR Readiness Notes

## Acompanhamento de automação — evidência local, sem aceite produtivo

[Implementação e validação local](../../../saas/INBOX_AUTOMATION_LOCAL_2026-09-29.md): chave default false gerenciada por ADMIN, acompanhamento SUPERVISOR/ADMIN do tenant no filtro Automação, fora de TODAS. LOCAL VALIDATED / NOT DEPLOYED. Não comprova aceite CRA nem cancela respostas automáticas em andamento. Campanhas/CRA continuam aguardando validação funcional do owner. Correção DB-only aceita e SECULT encerrada permanecem separadas.

## 28/09/2026 — fronteira da validação local SECULT

A consulta AGENT de CLOSED recebeu validação local separada, ainda NOT DEPLOYED;
ver [evidências e limites](../../../saas/SECULT_OWN_CLOSED_LOCAL_2026-09-28.md).
Não altera aceite CRA: campanhas/lotes aguardam retorno funcional do owner.
DB-only permanece encerrada e aceita; inatividade no Guia pausada; 6683 CLOSED.
Publicação SECULT para revisão autorizada em 29/09 sobre f06d49cb, sem deploy;
112 provas locais reutilizadas, sem ampliar a evidência de aceite CRA.
Nenhuma ativação produtiva, provider ou envio foi realizado nesta frente.


## Atualização produtiva — flows DB-only — 28/09/2026

**DEPLOYED / CLIENT ACCEPTED — correção de flows DB-only.** Backend/frontend
`e8ebd776` implantados por procedimento controlado, com backup fresco restaurado
em DB local isolado, fechamento/drain e reabertura geração 3. Campanhas abertas,
scheduler observado em dois ciclos; worker/sessões e dados preservados. Owner
confirmou sessão, Inbox, CRM e leitura de flows. Na validação técnica, não foram
gravados fluxos reais nem provocados envios. Em 28/09/2026, Eduardo confirmou:
“Funcionou, obrigado Deifson” (relato encaminhado pelo owner). Aceite funcional
restrito à correção de gravação DB-only implantada em `e8ebd776`; não identifica
operações ou modos exercitados e não comprova as quatro combinações Guia/Avançado.
Não constitui aceite global CRA nem validação integral de lotes.
[Registro único, backup, rollback e limitações](../../../saas/CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md#deploy-técnico-da-correção-de-flows-db-only--28092026).
Os estados LOCAL VALIDATED / NOT DEPLOYED abaixo são históricos da publicação
para revisão. Quatro PASS locais preservados: Guia criar/editar e Avançado
criar/editar. Avisos React key e Next/workspace separados, sem correção incidental.
6683 CLOSED; Telegram e DELIVERED/READ permanecem separados.


## Gravação de flows DB-only — 2026-09-28

Publicação para revisão autorizada em 28/09/2026, exclusivamente na branch
`review/campaign-recovery-20260926`, sem deploy. Os registros “sem commit/push”
abaixo descrevem a etapa local anterior. Código testado conferido por SHA-256;
apenas esta nota documental foi acrescentada para publicação. Quatro PASS
preservados: Guia criar/editar e Avançado criar/editar. Status continua
**LOCAL VALIDATED / NOT DEPLOYED**; aviso React key permanece separado.
Auto-deploy desabilitado para esta branch em `vercel.json`; workflow CI com
push restrito a main/develop. Evidências privadas e estado operacional excluídos.


**LOCAL VALIDATED / NOT DEPLOYED**, base `01989157` contendo `a1cc380e`.
Correção separada da visibilidade encerrada em `363ce3ab`: POST/PUT passam a
reutilizar fallback por Client, mantendo RBAC, precedência de flags DB,
isolamento, defaults e transações. Erro de leitura/configuração não libera
gravação. Mensagens seguras e rascunho literal preservado após falha.

Provas: rotas focadas 7/7; regressão de rotas chatbot 14/14; unitários afetados
164/164; builds backend/frontend PASS. Smoke autenticado sintético: Guia criar,
Guia editar (incluindo menu), Avançado criar e Avançado editar — quatro PASS,
cada um com falha controlada, ausência de escrita, conteúdo preservado,
salvar/recarregar/reabrir e conferência dos quatro campos persistidos.

Sem commit/push/deploy, consulta produtiva, migration, provider ou envio.
Sem aceite CRA. Visibilidade anterior e 6683 continuam CLOSED; Telegram,
DELIVERED/READ e validação de lotes permanecem separados.
[Escopo, evidências e limitações](../../../BACKLOG_TECH.md#db-only-chatbot-flow-writes--2026-09-28).


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

## Atualizacao de recuperacao e fechamento local — 2026-09-26

Status: TECHNICAL LOCAL VALIDATED / OWNER VALIDATION PENDING / NOT DEPLOYED.
Esta atualizacao substitui, para o smoke tecnico local, as lacunas visuais
registradas anteriormente; preserva o historico e nao representa aceite CRA.

- CRM estatico: selecao/filtro, previa e confirmacao clicados na UI; 3.001
  destinatarios persistidos em quatro filhos (1.000 / 1.000 / 1.000 / 1).
- CRM dinamico: estimativa e confirmacao de agendamento exercitadas na UI;
  zero filhos antes da execucao. Uma etapa do processador com relogio local
  controlado criou o snapshot de 3.001 destinatarios/quatro filhos, sem envio.
- CSV: upload, mapeamento, previa e confirmacao pela UI; um unico conjunto,
  3.001 destinatarios/quatro filhos. A UI trata a resposta agrupada; timeout
  especifico e chave de idempotencia reutilizada protegem a repeticao local.
- Acoes agregadas: agendamento atomico dos quatro lotes, reload, pausa,
  retomada e cancelamento confirmados no DB. Nenhum outbound foi criado.
- Test-send ocupado: clique real com input React preenchido, mensagem PT-BR,
  zero chamadas adicionais ao provider simulado, zero outbound e zero job novo.
- Corrigidos limites de parametros SQL em consultas de identidades CRM/CSV e
  exclusao operacional; a previa de campanha deixa de limitar a contagem a
  janela inicial de 800 contatos. Leitura de audiencia limitada a 5.000.
- Evidencias locais: `local-evidence/recovery/result-summary.json`, capturas e
  logs no worktree persistente `tmp/worktrees/re7-campaign-recovery-20260926`.
  Capturas antigas que estavam somente em `/tmp` nao sobreviveram ao reboot;
  seus resultados historicos foram recuperados do registro da sessao.
- Resultado historico da primeira retomada: builds PASS, suites 41/41 e 43/43;
  a suite ampla entao falhou nos bancos divergentes. Essas falhas foram diagnosticadas
  e fechadas na auditoria acima. O drift residual de defaults/indices continua documentado.
- Sem commit, push, deploy, banco de producao ou provider real. Guided Builder
  permanece pausado. Owner validation, aceite CRA e ensaio controlado de
  rollout/rollback da migration continuam pendentes.


Status: notas de prontidao para avaliacao contratual. Usar junto ao edital,
termo de referencia, matriz contratual canonica e decisoes ja registradas.

Documento canonico de aderencia requisito-a-requisito:

```text
docs/bids/2026/cra-pr/CONTRACT_ADHERENCE_MATRIX.md
```

## Auditoria Contratual Consolidada - 2026-09-15

Auditoria somente leitura de producao confirmou:

- tenant `cra-pr` ACTIVE, profile `government`;
- limite contratual configurado: `maxActiveAppUsers=30`;
- usuarios: 18 ativos, 0 inativos; 3 ADMIN, 5 SUPERVISOR, 10 AGENT;
- departamentos/filas: 6 departamentos ativos e 6 filas;
- horarios: 6/6 departamentos com Mon-Fri 09:00-17:00,
  `America/Sao_Paulo`; fins de semana fechados por ausencia de janela;
- active flow: `cmtkhhxtq002p4spns3fp0yux`, active=true, entryPoint=true,
  31 nos, start `consent`, hash
  `d7026abdbcfd00e05cb6b9121bfad1f63fab7a9506e2b88e8f8d5b701ad7bac4`;
- Flow visibility: CLOSED / CUSTOMER VALIDATED;
- Meta Cloud: operational=true, phoneStatus=CONNECTED, objectAccess=true;
- Web Session: `****5595`, CONNECTED, auth material configured;
- Webchat CRA: nao configurado;
- Instagram/Facebook CRA: contratados, mas ainda sem configuracao/validacao CRA
  registrada;
- Templates/campaigns CRA: nenhum template/campanha configurado no snapshot;
- CSAT e close: evidencias de snapshots e pesquisas respondidas em producao.

Scorecard contratual da matriz:

```text
TOTAL REQUIREMENTS: 52
CLOSED / REAL VALIDATED: 14
CLOSED / CUSTOMER VALIDATED: 1
IMPLEMENTED / NEEDS CRA VALIDATION: 15
CONTRACT ACCEPTANCE OPEN: 2
CONFIG PENDING: 0
CUSTOMER ACTION PENDING: 0
CONTRACT REQUIRED / CUSTOMER-DEFERRED / DELIVERY WINDOW PENDING: 4
EXTERNAL META DEPENDENCY: 4
PRODUCT GAP: 1
DOCUMENTATION/EVIDENCE GAP: 9
NOT REQUIRED BY CONTRACT: 2
```

Pendencias criticas para prontidao contratual:

1. Obter copia Utility CRA aprovada e validar campanha controlada.
2. Evidenciar opt-out auditavel e bloqueio em campanha.
3. Gerar pacote de relatorios/exportacoes/billing com dados CRA redigidos.
4. Validar com owner a importacao de campanha como upsert CRM seguro, com
   coluna opcional `Situação no CRM`, sem duplicar contatos e com relatorio
   detalhado. Implementacao local, auditoria de principios, testes focados e
   revalidacao do owner passaram; deploy de producao e evidencia CRA/customer
   ainda dependem de gate controlado e dado aprovado.
5. Implementar/validar visao campanha-contato dentro de Contacts/CRM, sem
   modelo sombra, para rastreabilidade e evidencia de aceite.
6. Fechar pacote documental: SLA/suporte, treinamento, LGPD/seguranca,
   backup/restore e comprovacao Meta oficial.
7. Instagram, Facebook Messenger e Webchat/site seguem contratados, mas estao
   CUSTOMER-DEFERRED / DELIVERY WINDOW PENDING e nao bloqueiam a frente atual.

Atualizacao local de 2026-09-25: a divisao de audiencia CRM em rascunhos foi
implementada localmente como melhoria operacional parcial de preparacao, ainda
NOT DEPLOYED / OWNER UI PENDING e sem aceite formal CRA. Quando a audiencia CRM
escolhida excede 1.000 destinatarios, o backend pode calcular a audiencia
completa do mesmo tenant ate o teto de analise de 5.000, apresentar total,
quantidade de rascunhos e distribuicao, e criar rascunhos estaticos numerados
sem envio/agendamento. O comportamento evita truncamento silencioso da previa
paginada, preserva modelo/mapeamentos/destino de retorno e bloqueia a criacao
se a audiencia mudar antes da confirmacao. Filtros dinamicos exigem conversao
explicita para selecao estatica; contatos futuros nao entram automaticamente
nesses rascunhos. Filtros completos ainda nao suportados para divisao
(conversa/origem/cidade) devem refinar ou bloquear a operacao com mensagem
controlada. Auditoria CRA posterior concluiu que isto nao e suficiente para a
operacao contratual de campanhas em lotes acima de 3.000 com agendamento: falta
modelo duravel de conjunto de lotes, snapshot dinamico dividido em chunks,
coordenacao de envio por tenant/transporte, progresso/acoes agregadas e
recuperacao/idempotencia concorrente. Proxima frente recomendada: desenhar e
implementar `CampaignBatch`/`CampaignGroup` ou dominio equivalente com schema
controlado, mantendo `Campaign` como lote filho e reaproveitando o runner,
delivery truth, billing, opt-out e identidade existentes.

Decisao adicional do owner em 2026-09-25: a operacao CRA-ready nao deve executar
duas campanhas simultaneamente para o mesmo tenant. Atualizacao local de
2026-09-26: a frente de lotes/fila esta BACKEND CORE + GROUP UI INTEGRATED
LOCALLY / FOCUSED VALIDATED / NOT DEPLOYED / OWNER UI PENDING / sem aceite formal CRA. A fila
duravel por tenant foi implementada localmente com migration aditiva,
batch/chunk/job/lease, claim transacional e bloqueio atomico de test-send
durante execucao ativa ou incerta do tenant. A validacao tecnica local cobriu
exclusividade por tenant, independencia entre tenants, job running com lease
expirado ainda bloqueando o tenant, test-send expirado bloqueando ate release
explicito, estado `needs_review` com motivo auditavel para liberar fila sem
reenviar resultado incerto, invalidacao do token do executor antigo apos
`needs_review`, ordem deterministica de chunks por `chunkIndex`, split de 3.000
em tres rascunhos com vinculo batch/chunk, ciclo
pause/resume/cancel/test-send e revalidacao de opt-out agendado. Complemento
backend integrado: campanha CRM dinamica agendada com 3.001 elegiveis criou um
snapshot unico e quatro chunks sequenciais; CSV agrupado com 3.001 elegiveis
criou quatro chunks, preservou variaveis por destinatario e excluiu bloqueio
posterior antes do provider; resultado aceito apos perda de lease foi preservado
sem avancar para o proximo destinatario. `campaignExecutionQueue` 8/8,
`campaignRunner` 10/10, `campaignsFeatureRoutes` 125/125, backend build e
`git diff --check` passaram. `prisma migrate deploy` passou em banco local
isolado e Prisma Client leu as tabelas novas. Complemento UI local: detalhe de
campanha mostra conjunto, lotes numerados, progresso agregado/por lote, fila do
tenant, horario solicitado/inicio efetivo e motivos operacionais. Validacao
focada depois da UI: `campaignsPageContract.test.ts` 29/29, frontend build,
backend build, `campaignsFeatureRoutes.test.ts` 125/125 e `git diff --check`
passaram. Smoke tecnico autenticado por API confirmou SUPERVISOR/ADMIN lendo o
fixture 3.001/4 chunks e AGENT 403. Chrome headless/CDP validou visualmente
	detalhe do conjunto em desktop/tela estreita com fixture futura
	`batch-visual-20260926`: SUPERVISOR/ADMIN viram conjunto, quatro chunks, fila do
	tenant e progresso; AGENT viu restricao de campanhas sem detalhe de lote.
	Complemento CDP clicou pause/resume/cancel agregado e confirmou persistencia
	local: jobs pausados=4, retomados em fila=4, cancelados=4. Test-send ocupado
	foi bloqueado sem novo Outbound, mas o toast visual por clique segue
	inconclusivo porque o input controlado nao atualizou no script. Nao ha OWNER UI
	validation. Lacunas para readiness contratual: confirmacao visual completa de
	criacao agrupada CRM/CSV, toast de test-send ocupado clicado pela UI, deploy e rollout/rollback com migration em ambiente
	controlado. Portanto a frente nao deve ser classificada como aceita formalmente
para CRA enquanto essas evidencias operacionais nao existirem.

Auditoria de contrato em 2026-09-26: producao `5ee2de6...` ja materializa
`Conversation`/`ConversationRuntimeState` quando webhook Meta marca campanha
como `DELIVERED`/`READ`, mesmo sem inbound (`lastInboundAt=null`). A frente de
lotes nao introduziu esse comportamento, mas ha conflito potencial com o
principio "tentativa de campanha nao e conversa operacional" caso ele se aplique
a qualquer tentativa outbound-only. Requer decisao owner/arquitetura antes de
publicar lotes como frente operacional; nao reabrir o reparo `6683`.

Nao reabrir:

- CRA active flow visibility: CLOSED / CUSTOMER VALIDATED.
- CRA business hours: CONFIGURED / OPERATIONALLY VALIDATED.
- Outbound return destination aprovado: CLOSED / DEPLOYED / OWNER APPROVED /
  PROD NON-DESTRUCTIVE VALIDATED em
  `452d5826db42cc1b574eeff8fd8e0d038cd3491f`; novas pendencias de importacao
  CRM e Marketing media nao entram nessa entrega.

Follow-up de 2026-09-16:

- Campaign/CRM import `Situação no CRM`: IMPLEMENTED / TEST VALIDATED /
  PRINCIPLES AUDIT PASS / OWNER APPROVED LOCAL / DEPLOYED / PRODUCTION
  NON-DESTRUCTIVE VALIDATED em `cad9489c`. A frente e upsert CRM tenant-scoped, nao apenas
  coluna nova. Contato existente e atualizado, nunca duplicado; nome importado
  valido pode atualizar contato existente; celulas em branco preservam dados
  atuais; status CRM importado valido atualiza `Lead.status`; desconhecidos ou
  ambiguos aparecem no preview/import e nunca criam status silenciosamente;
  duplicados no arquivo nao criam contatos duplicados; relatorio detalhado e
  baixavel pelo operador esta exposto na importacao CSV de campanhas. CRA real
  ainda nao foi importado.
  Historico preservado: implementacao inicial; owner PARTIAL PASS; auditoria de principios bloqueada
  por quatro P1 em 2026-09-17; lote corretivo local passou com identidade
  canonica unica, commit atomico por linha, ordem deterministica de duplicados,
  capability CRM e CSV protegido contra formulas; reauditoria PASS; revalidacao
  do owner PASS; integracao canonica preparada; deploy FF-only e smoke
  nao destrutivo de producao PASS. Nenhum import real ou envio foi executado e
  o aceite CRA continua pendente. A excecao operacional autorizada
  `apps/whatsapp-web-worker/.data/` permaneceu intacta e o worker nao foi
  recarregado. P2 residual:
  resolucao canonica sequencial por linha para posterior hardening de escala.
- Contacts campaign relationship view: CANONICALLY INTEGRATED / TEST VALIDATED /
  OWNER PASS / PRODUCTION DEPLOY PENDING / CRA CAMPAIGN-CRM FOLLOW-UP. Contacts/CRM mostra
  resumo de campanhas por contato na lista e historico recente no detalhe,
  usando `Campaign`, `OutboundMessage` e eventos canonicos ja persistidos.
  Nao cria historico sombra dentro de Contact, nao altera schema/migration,
  nao reescreve campanha/billing/opt-out, consulta same-tenant e evita N+1 por
  linha com projecao agregada por pagina mais detalhe sob demanda. A UX nao
  mostra preco/custo. Validacao local: `crmCapabilityRoutes.test.ts` 19/19
  PASS, backend build PASS, frontend build PASS, diff check PASS. Owner review,
  deploy e aceite CRA ainda pendentes.
- Contacts + Campaigns UX refinement, 2026-09-19: IMPLEMENTED LOCAL / OWNER
  PASS / NO DEPLOY. Refinamento visual/operacional apenas: linhas
  clicaveis, acoes compactas, telefone completo no CRM autenticado same-tenant,
  remocao de metadados duplicados, switch de bloqueio de envio ativo, campanhas
  relacionadas agrupadas, Delete somente na linha da lista de Contacts sem acao
  de Delete dentro do detalhe, contadores de campanhas em abas, linha de campanha
  abrindo detalhe, acoes a direita, taxonomia unica de contadores e remocao de
  nota tecnica. O detalhe de campanha agora filtra resultados por status,
  Situacao CRM same-tenant e busca nome/telefone, copia filtrados e pode
  iniciar rascunho a partir dos contatos canonicos atuais filtrados; linhas
  historicas sem contato atual reutilizavel sao excluidas com contagem
  explicita. Campanhas agendadas dinamicas por filtro CRM seguem OWNER PASS /
  LOCAL VALIDATED / NOT DEPLOYED em
  `docs/saas/DYNAMIC_CRM_FILTER_CAMPAIGN_SCHEDULING.md`: o agendamento salva
	  apenas o filtro de Situacao CRM e a execucao cria snapshot imutavel. Nao
	  altera schema, opt-out, result truth, composer cleanup, Operational Queue,
	  historico, financeiro ou envio real.
- Contacts/Campaigns phone/import finishing, 2026-09-19: OWNER PASS / DEPLOYED /
  PRODUCTION NON-DESTRUCTIVE VALIDATED. Delete de Contact com conversa ativa permanece
  bloqueado pela lista com toast fechavel; o detalhe nao repete o bloco de aviso
  de conversa ativa; `Abrir campanha` abre o detalhe exato da campanha. Contact
  CSV preview/confirm agora mostra totais e erros por linha. Invariante
  permanente: NO NEW CONTACT/RECIPIENT PHONE MAY BE PERSISTED WITHOUT CANONICAL
  NORMALIZATION + VALIDATION. Isso fortalece a prontidao de import/result-truth,
  mas nao muda aceite formal CRA sem execucao CRA aprovada. Contacts CSV agora
  suporta `Situação no CRM` localmente, validada contra status CRM existentes no
  mesmo tenant; status invalido bloqueia a linha e valor em branco preserva ou
  aplica default pela semantica canonica. Validacao produtiva usou apenas preview
  e leitura no `demo-converta`, sem send real, provider call, billing ou mutacao
  inesperada de Contact/Lead/Campaign/Outbound.
- Contacts CSV complete UX/data-integrity lot, 2026-09-20: OWNER PASS / LOCAL
  VALIDATED / NOT DEPLOYED. O fluxo de importacao de Contacts segue a linguagem
  visual/operacional de Campaign CSV, mantem telefone completo apenas na evidencia
  autenticada de preview/relatorio, e a validade da previa fica presa ao
  mapeamento exato de `Telefone`, `Nome` e `Situação no CRM`. Se o mapeamento
  muda, a previa antiga permanece visivel como stale, `Confirmar importacao`
  fica bloqueado e o operador precisa executar `Atualizar previa`; nao ha caminho
  de importacao com preview stale.
- Meta Marketing template media support: P2 / PRODUCT + META CAPABILITY.
  Inclui categoria MARKETING, headers IMAGE/VIDEO, exemplos/midia Meta,
  upload/handle, preview, variaveis, botoes suportados, submissao, status,
  motivo de rejeicao, envio aprovado e fonte oficial de preco Marketing. Nao faz
  parte da campanha Utility atual; promover somente se evidencia contratual
  exigir decisao do owner.

Follow-up de 2026-09-18, result truth/identidade de campanha Demo:

- `Campanha teste set.2` terminou com um destinatario entregue (`****6787`) e
  um bloqueado antes do provider (`****9614`); nao houve terceira tentativa.
- `****9614` tinha dois Contacts canonicos same-tenant e um Lead. O resolver
  atual retornou `identity_conflict` de forma fail-closed, sem OutboundMessage
  ou chamada Meta. O segundo Contact veio do bootstrap historico de campanha
  anterior ao Identity P1.
- Classificacao: HISTORICAL DUPLICATE RESIDUE; ACTIVE PRODUCT BUG = NO; NEW
  BYPASS FOUND = NO. Sem reparo, o destinatario continuaria bloqueado hoje.
- Reparacao transacional foi apenas preparada em dry-run e exige autorizacao
  separada do owner; nao inclui reenvio nem reescrita historica.
- Contadores: total 2, entregue 1, bloqueado 1, pendente 0, falhas tecnicas 0;
  campanha apresentada como entrega parcial.
- Evidencia: `docs/saas/DEMO_9614_CAMPAIGN_IDENTITY_CLOSURE_2026-09-18.md`.

Follow-up de 2026-09-18, ciclo de composicao de campanha:

- IMPLEMENTED LOCAL / OWNER REVIEW PENDING / NO DEPLOY;
- composicao nao salva e transitoria e volta limpa apos descarte/troca de aba;
- previa CRM/CSV nao cria Campaign nem contato;
- criar rascunho e o commit explicito; importacao CSV confirmada pode persistir
  upsert CRM canonico, que nao e revertido silenciosamente;
- rascunhos intencionais e campanhas agendadas, em envio ou concluidas nao sao
  removidos pela limpeza do compositor;
- sem schema/migration, envio real, provider call ou reparo de `****9614`.
- gate local: contratos do compositor/pagina 18/18 PASS, backend Campaign
  115/115 PASS, importacao/CRM 23/23 PASS, builds e lint focado PASS; smoke
  autenticado confirmou descarte/reentrada limpos, cancelamento CSV sem estado
  residual e preservacao do rascunho salvo. Revisao visual do owner pendente.

Nota Demo Phase C, 2026-09-15: a campanha controlada em `demo-converta`
`d9874c03-10e8-4061-a92e-6caa7b3001c3` encontrou bug generico de
preflight/persistencia apos Meta. `****9614` foi aceito pela Meta e confirmado
recebido pelo owner; webhooks `sent`/`delivered` foram recuperados, mas sem
OutboundMessage/ledger/report local. `****6787` nao foi tentado. A correcao
generica local foi testada, mas nao implantada; nao ha novo envio autorizado
sem novo gate.

## Enquadramento

O Converta deve ser apresentado como SaaS de atendimento omnichannel com foco em WhatsApp Oficial/Meta, Inbox humano, CRM operacional, campanhas controladas, modelos Utility, opt-out, LGPD e relatorios.

O caso CRA-PR e estrategico por exigir combinacao de atendimento receptivo, volume ativo controlado e governanca de custo Meta.

## Premissas conhecidas

- 30 atendentes.
- 1 numero WhatsApp.
- Volume receptivo estimado de 2.000 conversas/mensagens por mes, conforme premissa do processo.
- Volume ativo estimado de 10.000 por mes.
- Uso Utility-only para envios ativos.
- Sem campanha de marketing como posicionamento tecnico.
- Opt-out operacional ja suportado por eventos e bloqueio de envio ativo.
- Contatos anonimizados ficam ocultos no CRM e bloqueados em campanha.

## Aderencia atual

- Inbox humano com claim e controle operacional.
- Templates aprovados para janela fechada e envio ativo.
- Campanhas com previa, rascunho e envio explicito.
- CRM operacional por tenant.
- Mensagens prontas separadas de modelos Meta.
- Relatorio mensal Meta estimativo em JSON/CSV.
- Ledger por outbound e eventos de acompanhamento.
- RBAC e tenant isolation.
- Politica LGPD documentada.
- Anonimizacao LGPD por titular esta OWNER PASS / CLEAN DELIVERY DEPLOYED /
  PRODUCTION HEALTH VALIDATED: busca Contact canonico ou Lead-only do mesmo tenant no CRM, gera
  previa sem mutacao, exige confirmacao forte e preserva auditoria sanitizada.
  O atalho `Privacidade` em Contacts apenas preseleciona o titular; exclusao
  operacional do CRM nao remove o titular da descoberta de governanca.
  O deploy de producao nao executou anonimização real nem provider call; smoke
  visual autenticado ficou pendente por falta de credencial app valida. Nao
  substitui o pacote contratual CRA de retencao/exportacao/eliminacao ate
  validacao e evidencia especificas.

## Estado operacional atual - 2026-09-04

Base de producao documentada nesta consolidacao:

```text
c308198aa97ea6a4233761eac9da9cbc945cbed6
```

### CRA Demo Flow V1

Flow de validacao:

```text
CRA-PR - Atendimento Institucional (Demo)
cmtg2g15t003d4sjghwhina8b
```

Estado persistido observado:

- active: true;
- entryPoint: true;
- nodes: 31;
- start: `consent`.

Validacao real por WhatsApp:

```text
oi
-> consent/LGPD UMA VEZ

consent
-> Menu Principal UMA VEZ

1
-> Registro UMA VEZ

1
-> Pessoa Fisica UMA VEZ
```

Resultado operacional:

- fresh service cycle: PASS;
- stale human state did not block reentry;
- hybrid exactly-once: PASS;
- no duplicate reply;
- active HUMAN control conversation remained HUMAN;
- health: PASS;
- SECULT remained CONNECTED.

Status:

```text
CRA DEMO FLOW:
READY FOR CUSTOMER VALIDATION

FLOW/RUNTIME COHERENCE:
CLOSED / REAL VALIDATED

HYBRID EXACTLY-ONCE:
CLOSED / REAL VALIDATED

CLOSED HUMAN REENTRY:
CLOSED / REAL VALIDATED
```

### CRA real tenant rollout state - 2026-09-04

Estado observado e homologado em producao:

- tenant: `cra-pr`;
- status: ACTIVE;
- departments: 6;
- queues: 6;
- users: 18 active total;
- role split: 3 ADMIN, 5 SUPERVISOR, 10 AGENT;
- active department memberships: 18;
- RBAC and tenant isolation: PASS by provisioning validation.

Flow publicado:

```text
CRA-PR - Atendimento Institucional
cmtkhhxtq002p4spns3fp0yux
```

Estado do flow:

- active: true;
- entryPoint: true;
- nodes: 31;
- start: `consent`;
- destination remap: PASS.

Configuracao operacional:

- CSAT: ENABLED;
- WhatsApp Web feature: ENABLED;
- Browser Push feature: ENABLED;
- Web Session: CONNECTED;
- Meta: READY / Graph validation PASS;
- coexistence: PASS;
- configured mode: HYBRID;
- hybrid exactly-once: PASS;
- invites: 18 sent, 0 final failures;
- first invite batch hit Resend 429 after 17 sends, and the final user was
  retried successfully;
- active accounts: do not assume activation count without current login
  evidence;
- department hours: CONFIGURED / OPERATIONALLY VALIDATED;
- configured schedule: `America/Sao_Paulo`, Monday-Friday 09:00-17:00,
  weekends closed, no exceptions;
- training: Wednesday 2026-09-09.
- Instagram/Facebook/Web: contracted but not activated initially.

Validacao real do tenant CRA-PR:

- approved flow -> consent -> menu -> handoff: PASS;
- human Inbox: PASS;
- human outbound/inbound: PASS;
- normal close: PASS;
- `CompletedServiceSnapshot`: exactly 1;
- CSAT score -> responded: PASS;
- optional comment in the same response: PASS;
- Browser Push background: REAL VALIDATED;
- Web Session CONNECTED after validation;
- Meta READY with Graph validation PASS;
- HYBRID real operational validation: PASS.

Status:

```text
CRA-PR REAL HYBRID OPERATIONAL VALIDATION:
CLOSED / PASS

CRA-PR READY FOR TRAINING 2026-09-09:
YES

CRA-PR DEPARTMENT HOURS:
CONFIGURED / OPERATIONALLY VALIDATED
```

### CRA admin chatbot settings - 2026-09-13

Incidente fechado em producao no commit
`69bedc38396b8f837a236b0af4a5446397919403`.

O tenant `cra-pr` e DB-backed em `Client` e nao possui entrada legada em
`.data/tenants.json`. `/admin/chatbot/settings` agora resolve esse caso por
`Client` + `TenantOperationalConfig` + defaults seguros em memoria, preservando
fallback legado para tenants que ainda dependem de `tenants.json` e sem criar
entrada artificial para CRA.

Smoke de producao:

- `/admin/chatbot/settings?clientKey=cra-pr`: 200;
- resources: 6 departamentos / 6 filas;
- flows: 1;
- health: ok/db ok;
- `.data/tenants.json`: ausente.

Status:

```text
CRA ADMIN CHATBOT SETTINGS:
CLOSED / REAL VALIDATED
```

### CRA active flow visibility - 2026-09-15

Owner report: the active CRA production chatbot flow executes correctly, but
tenant admins do not see it in `/app/chatbot`.

Audit status: `CLOSED / DEPLOYED / CUSTOMER VALIDATED`.

Local code audit shows tenant `/app/chatbot/flows` and internal
`/admin/chatbot/flows?clientKey=cra-pr` both list `ChatbotFlow` by `clientId`;
the tenant app additionally enforces feature `chatbot` and ADMIN/SUPERVISOR
role. Production DB/runtime/admin API evidence on 2026-09-15 proved one active
CRA entrypoint flow `cmtkhhxtq002p4spns3fp0yux`, owned by CRA, with
`features.chatbot=true`, and returned by admin API. Real CRA ADMIN Eduardo then
reproduced the UI absence; nginx shows `/agent-api/app/chatbot/flows` returned
200 for the app session while `/agent-api/app/chatbot/settings` returned 404.
Because the app page loaded flows/settings/resources through one `Promise.all()`,
the settings 404 prevented `hydrateFlows()` and the flow never reached UI state.
Runtime commit `363ce3ab` reuses the admin DB-backed settings fallback for
tenant app settings and hydrates flows/settings/resources independently.
Production delivery on 2026-09-15 used persistent backup
`pre-cra-flow-visibility-20260915-133330.dump`, reloaded only
`re7-admin-front` and `re7-whatsapp-agent`, preserved
`re7-whatsapp-web-worker`, and confirmed CRA settings/flows server-side with the
same active definition hash
`d7026abdbcfd00e05cb6b9121bfad1f63fab7a9506e2b88e8f8d5b701ad7bac4`. No flow
recreation, ownership change, definition mutation, entrypoint change or status
change occurred. Eduardo, CRA ADMIN, confirmed after the production fix that the
active flow is visible in tenant `/app/chatbot` and can be opened from
`Fluxos cadastrados`. Validation levels: LOCAL OWNER PASS, SERVER-SIDE
PRODUCTION PASS, CUSTOMER CRA ADMIN PASS.

ADMIN CHATBOT LOADING/BADGE:
CLOSED / REAL VALIDATED

Administradores CRA podem configurar horarios dos departamentos em:

```text
/app/settings/departments
```

Diretriz operacional: `demo-converta` e espelho comportamental para validacao
final antes do onboarding CRA-PR. Isso permite validar capacidades/politicas
genericas primeiro, mas nunca autoriza copiar dados ou ativos operacionais do
Demo para CRA-PR: WABA, phoneNumberId, token, Web Session auth, numero,
PushSubscription, usuarios, conversas, contatos, runtime, mensagens,
protocolos, ledgers e campanhas permanecem tenant-scoped.

### Escala CRA

O fluxo V1 esta pronto para apresentacao funcional ao cliente, mas a prova de
30 atendentes simultaneos ainda nao foi concluida.

```text
CRA 30-AGENT SCALE READINESS:
PARTIAL / OPEN
```

## Custo Meta e risco

O volume ativo mensal exige controle de categoria, aprovacao e acompanhamento de consumo. O Converta possui ledger, preview, resumo e relatorio mensal estimativo.

O custo Meta deve ser tratado como risco operacional/comercial controlado, nao como valor definitivo. A politica de preco depende de categoria, pais, entrega e regra vigente do provedor.

## Utility campaign readiness - 2026-09-15

A frente atual aprovada e preparar a primeira campanha real controlada com
template Utility, sem submissao Meta e sem envio Meta real antes de copia CRA
aprovada e aprovacao explicita do owner.

Snapshot somente leitura de producao em 2026-09-15:

- `cra-pr` ACTIVE, profile `government`;
- `campaigns=true` e `templates=true`;
- Meta/WhatsApp configurado com token presente, phone `****7308`, WABA
  `****4194` e business `****8327`;
- templates CRA: 0;
- pedidos de template CRA: 0;
- copia Utility CRA aprovada encontrada no repositorio/snapshot: nao;
- campanhas CRA: 0;
- eventos CRA de uso Meta campanha/billing/opt-out: 0.

Contrato operacional:

- primeiro passo: obter texto/copia Utility final aprovado por CRA/owner;
- segundo passo: criar/submeter/aprovar um template Utility CRA;
- terceiro passo: validar importacao/lista pequena, dedupe, variaveis e opt-out;
- quarto passo: criar rascunho e somente depois obter aprovacao para envio
  real controlado;
- nenhum envio real pode ocorrer sem aprovacao cobrindo template, destinatarios,
  janela, custo esperado, nome da campanha e quantidade de mensagens.

Checklist canonico:

```text
docs/bids/2026/cra-pr/UTILITY_CAMPAIGN_ACCEPTANCE_CHECKLIST.md
```

Status:

```text
CRA-PR UTILITY CAMPAIGN:
LOCAL / CONTRACT ACCEPTANCE OPEN

UTILITY READINESS AUDIT:
CLOSED

REAL SEND:
NOT EXECUTED

OWNER APPROVAL FOR REAL SEND:
REQUIRED

CRA APPROVED COPY:
NOT FOUND / CUSTOMER INPUT REQUIRED
```

Gate local de 2026-09-15:

- banco local seguro: `re7_cra_contract_test2` em `127.0.0.1:5432`, usuario
  `re7test`, sem uso de producao;
- migrations Prisma oficiais aplicadas: 58/58;
- regressao DB-backed focada de campanha/import/runner: 5/5 PASS;
- billing/preview/lifecycle unitario: 5/5 PASS;
- suite ampla `campaignsFeatureRoutes.test.ts`: 111/112 PASS, com timeout no
  teste de runtime de chatbot inativo, fora da frente Utility/campaign.

## Demo contract validation mirror - 2026-09-15

`demo-converta` foi classificado como tenant de homologacao comportamental
multitenant, nao como copia CRA. A Fase A ficou documentada em:

```text
docs/bids/2026/cra-pr/DEMO_CONTRACT_VALIDATION_PLAN.md
```

Snapshot Demo somente leitura:

- ACTIVE, profile `business`;
- campanhas, templates, CRM, Inbox, chatbot, reports, training, dashboard e
  satisfaction habilitados;
- Meta Cloud configurada com token presente;
- 1 template Utility aprovado;
- 0 campanhas;
- 0 eventos de billing/opt-out de campanha;
- 15 departamentos, 19 filas, 4 fluxos e 50 linhas de horario.

Resultado da Fase A:

- 36/52 requisitos podem ser validados no Demo como mecanica generica de
  produto;
- 19 ja possuem validacao de produto aproveitavel;
- 8 capacidades de ambiente/Demo foram validadas por leitura nesta rodada;
- 12 exigem evidencia especifica CRA;
- 4 canais seguem customer-deferred;
- 1 permanece como product gap/decisao de dominio;
- nenhum dado CRA foi usado no Demo;
- nenhuma submissao Meta e nenhum envio real foram executados.

## Gates recomendados antes de assinatura

1. Confirmar conteudo do primeiro modelo Utility CRA.
2. Submeter/obter aprovacao Meta do modelo Utility.
3. Definir lista pequena, quantidade de mensagens e janela de envio.
4. Validar importacao, variaveis, dedupe e opt-out antes de envio.
5. Obter aprovacao explicita do owner para template, destinatarios, janela,
   custo esperado, nome da campanha e quantidade.
6. Validar relatorio mensal com amostra controlada.
7. Formalizar treinamento e matriz de usuarios.
8. Preparar roteiro de smoke sem envio em massa.

## Limites e proximos passos

- Bloqueio automatico por limite ainda nao deve ser ativado sem runbook.
- Relatorio Meta e estimativo e nao substitui demonstrativo oficial do provedor.
- A modelagem dedicada de opt-out pode ser evolucao futura se o contrato avancar.
- Evidencias visuais devem ser capturadas em ambiente sanitizado.
- Regras de retencao e privacidade devem constar no onboarding operacional.
- Correcao reafirmada em 2026-09-15: a regra waiting-on-customer 1h como
  auto-close de atendimento humano foi superada e nao e requisito atual. HUMAN
  pode permanecer aberto indefinidamente sob controle do atendente. A frente
  correta e BOT/FLOW lifecycle: `resetAfterMinutes`, stale pending question reset e
  inactivity handoff ja validados; cross-provider hardening e exposicao de
  lifecycle policy no Guided seguem P2.

## Demo Phase B owner gate - 2026-09-15

Sem envio real.

- Template Demo aprovado: `data_exame`, Utility, `pt_BR`, variavel `{{1}}`
  Data, Meta id mascarado.
- Suitability: adequado para homologacao Demo com dados de teste; nao e copia
  CRA nem deve ser usado como copy CRA.
- Testes locais de precheck: 13/13 PASS para import CSV, dedupe,
  missing-variable safe failure, opt-out antes de outbound, lifecycle e billing
  idempotente.
- Scheduling: implementado, precisa validacao Demo controlada.
- Pause: implementado para `sending -> paused`, precisa validacao Demo
  controlada; `scheduled -> paused` nao e transicao valida, usar cancelamento
  antes do inicio.
- Cancel: implementado para draft/scheduled/sending/paused, precisa evidencia
  Demo controlada.
- Custo de gate: PAUSED FOR BILLING UNIT RECONCILIATION. A referencia anterior
  R$ 0,32 por mensagem veio da premissa central interna R$ 3.200,00/mes para
  10.000 mensagens ativas; nao e preco Meta e nao foi provada como unidade
  contratual final CRA no pacote atual.
- Phase C gate em 2026-09-15: owner autorizou os destinatarios Demo/RE7 por
  finais `9614` e `6787`; preflight PASS; template `data_exame` segue
  approved; ambos fora de 24h; nenhum opt-out ativo encontrado; `6787` possui
  historico duplicado de provider mas dedupe reduz a um alvo final; final unique
  targets = 2; custo referencial anterior R$ 0,64 agora fica suspenso ate
  reconciliacao da unidade de billing. REAL SEND = NO ate aprovacao explicita
  deste envio exato apos preview final e unidade de billing validada.
- Phase C send autorizado em 2026-09-15: execucao real parou com ISSUE. Meta
  aceitou 1 Utility `data_exame` para `****9614`, mas o runner falhou com
  `default_operational_department_missing` antes de persistir OutboundMessage,
  ledger e relatorio; `****6787` nao foi enviado. Campanha Demo
  `d9874c03-10e8-4061-a92e-6caa7b3001c3` ficou `failed`. Evidencia real:
  accepted=1, delivered webhook recuperado=1, read=0 observado, ledger local
  billable=0, total local R$ 0,00. Auditoria de Recipient A em 2026-09-15
  documentou reparo restrito possivel e o owner aprovou a reconciliacao em
  producao: foi criado um OutboundMessage local para A com o Meta id recuperado,
  aplicado billing delivered idempotente, ajustado `sentCount=1` e preservado
  `status=failed`. A nao foi reenviado; B ainda nao havia sido tentado naquele
  momento e depois foi enviado apenas pela campanha B-only aprovada em
  2026-09-16. O ledger de A esta
  correto como elegibilidade/contagem delivered Utility fora de 24h, mas o
  valor R$ 0,32 e classificado como referencia central de planejamento ainda nao
  provada como unidade final CRA.
- Meta pricing narrow gate, 2026-09-15: fonte oficial WhatsApp Business
  Platform Pricing / Meta Developers prova Brazil Utility BRL R$ 0,0350 por
  mensagem entregue, efetivo em 2026-07-01, tier 0-250.000. O preflight
  historico de B em 2026-09-15 parou antes da Meta porque o Demo ainda nao tinha
  destino humano generico ativo; esse bloqueio foi superado por configuracao de
  destino explicito aprovada pelo owner e pelo envio controlado B concluido em
  2026-09-16. Unidade contratual CRA permanece separada e NOT PROVEN; FinOps
  generico fica P2.
- Recipient B-only explicit human return gate, 2026-09-16: READ-ONLY PRE-SEND
  GATE / SUPERSEDED BY FINAL DESTINATION CONFIGURATION / NO REAL SEND. Nova validacao
  confirmou `demo-converta` ativo, template `data_exame` Utility `pt_BR`
  approved, B `****6787` autorizado e normalizado para um unico alvo, sem
  opt-out ativo, fora de 24h por 5d23h e sem outbound `data_exame` previo para
  B. A inventory de destino humano encontrou multiplos departamentos/fila
  ativos do mesmo tenant e nenhum destino generico inequívoco com fila:
  `Setor Teste` esta ativo mas tem zero filas; `Atendimento Geral` tem filas,
  mas esta inativo; os demais candidatos ativos sao setores tematicos. Per
  regra do owner, nao houve escolha por nome, fallback escondido, campanha nova
  ou chamada Meta nessa passagem read-only. Esse bloqueio foi superado depois em
  2026-09-16 quando o owner selecionou explicitamente o destino Demo existente
  por IDs.
- Recipient B-only destination configured, 2026-09-16: FINAL SEND GATE
  PREPARED / NO REAL SEND. Owner selecionou explicitamente para esta campanha o
  destino generico Demo existente `Atendimento Geral`
  (`cmsiwk1o100014sdzl5cqd2ki`) + `Fila Geral`
  (`cmsiyb2k200n94sdpu5khkee0`). O roteamento fica persistido por IDs do mesmo
  tenant; nao ha regra de produto por nome. Read-back confirmou departamento
  ativo, fila vinculada, sem fluxos ativos referenciando esses IDs, sem
  conversas abertas no setor, 3 memberships, B `****6787` fora de 24h, sem
  opt-out e sem outbound `data_exame` anterior. Backup persistente:
  `/opt/re7online/backups/demo-b-destination-gate-20260916/pre-demo-b-destination-gate-20260916T130703Z.dump`,
  20M, 593 objetos, SHA256
  `0b4a2d4006ccfa1c9a589a5926f277edae64d8fa5924985045708d5b8102f50d`.
  Campanha draft `bb1d30e2-3a98-471a-9531-1f5e5d76a214` criada B-only com
  destino humano explicito, `sentCount=0` e zero chamada Meta. Esse estado
  preparado foi superado pelo envio controlado B aprovado pelo owner abaixo.
- Recipient B controlled Utility send, 2026-09-16: COMPLETED / DEMO PRODUCT
  CAPABILITY VALIDATION / NOT CRA REAL CAMPAIGN. Owner autorizou exatamente uma
  chamada Meta para B `****6787`. Resultado: Meta accepted, webhook sent=1,
  delivered=1, read=0, failed=0; OutboundMessage local
  `076910ef-ce6f-43d6-bfc2-2f30c4b41930`; campaign
  `bb1d30e2-3a98-471a-9531-1f5e5d76a214` completed com `sentCount=1`;
  `billing.active_message.delivered` count=1; duplicate billing=NO; A external
  sends neste run=0. Evidencia sanitizada criada em
  `docs/bids/2026/cra-pr/evidence/demo-contract-validation/PHASE_C_RECIPIENT_B_CONTROLLED_UTILITY_RESULT_2026-09-16.md`
  e `.csv`. Opt-out E2E foi concluido depois no Demo; preco contratual CRA
  segue NOT PROVEN.
- Opt-out E2E preparation, 2026-09-16: READY FOR OWNER GATE / NO MUTATION / NO
  REAL META SEND. Opt-out canonico atual e event-sourced em `Event`, por
  `contact.opt_out.recorded`/`contact.opt_out.revoked`, escopado por `clientId`
  + `waIdCanonical`; bloqueio de campanha usa
  `campaign.recipient.opt_out_blocked`. Runner bloqueia antes da Meta; envio
  manual ativo/template e resposta pronta tambem bloqueiam opt-out ativo; export
  mostra `opt_out`. Testes focados 130/130 PASS. Novos templates Utility
  `atualizacao_protocolo` e `lembrete_vencimento_anuidade` estao `PENDING` na
  Meta; `data_exame` permanece approved. Recomendado para o futuro E2E:
  B `****6787`. A `****9614` deve ser preservado como evidencia historica de
  reconciliacao. Aprovacao do owner ainda e obrigatoria antes de qualquer
  mutacao de opt-out, campanha bloqueada ou reversao.
- Opt-out E2E execution, 2026-09-16: COMPLETED / DEMO PRODUCT CAPABILITY
  VALIDATED / NOT CRA CUSTOMER SAMPLE. Owner autorizou apenas B `****6787`.
  Evento canonico `contact.opt_out.recorded`
  `88361d0f-89df-41fc-852b-ce84cbb43cc4`; campanha controlada
  `d260bdc6-326f-4487-8d15-21c2a98dd741` bloqueou antes da Meta com
  `campaign.recipient.opt_out_blocked`
  `80d6ca1d-94f2-4465-81b7-74888c1d0edc`; `sentCount=0`,
  `blockedCount=1`, Meta calls=0, mensagens reais=0, OutboundMessage=0,
  billing=0. Reversao canonica `contact.opt_out.revoked`
  `a5b58132-79fe-49dd-8aff-49fb78bf4566` restaurou B elegivel e preservou
  historico. A `****9614` ficou intocado.
- Reports/exports/billing Phase E, 2026-09-16: COMPLETED FOR DEMO PRODUCT
  CAPABILITY / CRA ACCEPTANCE STILL SEPARATE. Sem envio real, sem mutacao de
  opt-out e sem mutacao de ledger. Auditoria confirmou que exportacao pode ser
  CSV/XLSX ou equivalente aberto e que billing ativo e Utility fora de 24h
  efetivamente entregue. Rotas reais auditadas: campanha CSV, reports CSV/PDF
  gerencial, Meta usage CSV, receptive sessions CSV e active-message billing
  CSV. Read-only em producao: A segue `failed`/reconciled com 1 outbound e 1
  `billing.active_message.delivered`; B segue `completed`/delivered com 1
  billing event; opt-out tem `blockedCount=1`, 0 outbound e 0 billing.
  `demo-converta` e `cra-pr` estao ativos com `campaigns` e `reports`.
  Evidencia:
  `docs/bids/2026/cra-pr/evidence/demo-contract-validation/PHASE_E_REPORTS_EXPORTS_BILLING_2026-09-16.md`
  e `.csv`. XLSX nativo nao e prometido; preco contratual CRA em BRL segue NOT
  PROVEN. Proximo front: CRM import/upsert/report com `Situacao no CRM`.
- Pendencias imediatas pre-treinamento: acompanhar primeiro login/ativacao de
  usuarios, especialmente 3 admins TI. Horarios dos departamentos CRA foram
  configurados e validados em producao em 2026-09-15.
- Horarios CRA nao permanecem P1 de runtime apos auditoria canonical de
  2026-09-14. A capability tecnica existe e foi comparada com SECULT sem
  mudanca de codigo; em 2026-09-15 a configuracao operacional foi aplicada:
  `America/Sao_Paulo`, Mon-Fri 09:00-17:00, fim de semana fechado,
  `QUEUE_FOR_NEXT_OPEN` preservado e resolver validado dentro/fora do
  expediente.
- Pendencias contratuais/produto separadas: ciclo receptivo logico para
  mensuracao, template Utility fora de 24h entregue, ledger Meta apos
  2026-10-01, relatorio mensal contratual e alinhamento formal para
  Instagram/Facebook/site contratados mas nao ativados inicialmente.

- Canonical Identity P1, 2026-09-17: DEPLOYED / PRODUCTION NON-DESTRUCTIVE
  VALIDATED. Producao avancou por FF-only de `cad9489c` para `ed329ec8`; 119
  testes focados, build backend em producao, reload apenas do agente,
  health/DB e smokes read-only passaram. Sem schema, migration, backfill ou
  mutacao de `****6787`; snapshots pre/pos dos dois Contacts e Leads historicos
  foram identicos. Evento real de identidade pos-deploy ainda nao exercitado.
- Queue operacional: CLOSED / DEPLOYED / PRODUCTION RECONCILED / SMOKE PASS.
  Relacao explicita, FK composta, lifecycle atomico e UX apenas por Setor foram
  validados localmente e implantados em producao em 2026-09-18. A auditoria
  completa dos 54 departamentos e as 5 decisoes finais do owner estao documentadas em
  `docs/saas/OPERATIONAL_QUEUE_PRODUCTION_MAPPING_AUDIT_2026-09-17.md` e
  `docs/saas/OPERATIONAL_QUEUE_OWNER_DECISION_PACKAGE_2026-09-17.md`.
  Producao avancou por FF-only para
  `b166bcac8bf443d34ba7f3821016b6bae8069728`, aplicou a migration
  `20260917213000_add_department_operational_queue`, reconciliou 44 mapeamentos
  explicitos, criou/vinculou 2 filas internas aprovadas e terminou com 0
  departamento ativo sem fila operacional. Campaign UX permanece owner PASS; nao
  houve envio real nem mutacao de `****6787`.

## Campaign UX / result truth integration - 2026-09-18

Status: INTEGRATED LOCAL / OWNER REVALIDATION PENDING / NO DEPLOY.

The owner-approved Campaign UX/result-truth delta was recovered and reapplied on
the canonical Operational Queue baseline. Campaign return destination remains
Department-only in the customer UI, while the backend resolves and persists the
exact internal operational queue through `Department.operationalQueueId`. The
customer Campaigns and Inbox template shortcut no longer show price, cost,
tariff, Meta rate or estimated financial totals. Campaign list/detail now uses
persisted lifecycle/result truth: `Enviando`, `Agendadas`, `Concluídas`,
closeable progress/detail modal, recipient-level blocked/skipped/pending/opt-out
states and business-readable reasons.

Validation completed locally: `campaignsPageContract.test.ts` 6/6 PASS,
`campaignsFeatureRoutes.test.ts` 114/114 PASS on safe local DB
`re7_queue_rollout_validate_20260918`, backend build PASS, frontend build PASS
and `git diff --check` PASS. No production deploy, no real Meta send, no
schema/migration and no Demo `****6787` repair/mutation occurred.

## Campaign Result Truth canonical 12/13 corrective - 2026-09-18

Status: P1 VALIDATED LOCAL AND READ-ONLY / OWNER REVIEW READY / NO DEPLOY.

The initial synthetic fixture passed but did not reproduce the real production
shape. Demo seed `****6787` used 13 digits and its delivered historical outbound
used 12 digits, so literal reconciliation created an incorrect fallback row.
The hard gate stopped validation. The corrective reuses
`buildCrmWhatsappIdentityCandidates`, preserves every historical attempt and
does not add schema or migration. A read-only replay against the actual campaign
records now yields 2 visible rows, delivered 1, blocked 1, pending 0, technical
failures 0 and `Entrega parcial`. No CRA send, provider call, identity repair,
production mutation or deploy occurred. Validation: 118/118 + 56/56 + 72/72
PASS.

## Campaign flow integrity review - 2026-09-21

Status: IMPLEMENTED LOCAL / VALIDATED / NO DEPLOY.

The campaign creation flow now uses a clearer and auditable CSV mapping model:
`Contato` plus `Campo 1`, `Campo 2` and `Campo 3`. Template variables may only
use those generic fields. Generic fields are campaign-only and do not change CRM
name or CRM situation. Authenticated preview/report shows full normalized
WhatsApp identifiers and combines ready, blocked and error rows in the same
table, with copy/export evidence. Campaign name uniqueness is enforced inside
the same tenant with trim/case/whitespace normalization.

Persisted campaign seed is the truth for draft reopen, explicit send,
scheduling and runner execution. Test-send for variable templates requires
explicit variable values when the test number is not a saved recipient and
stops before provider call or aggregate mutation when incomplete. CRM campaign
history remains actual-send-only: drafts, imports, test sends and scheduled
campaigns not yet run are not shown as contact campaign history. This improves
CRA operator evidence and traceability, but is not a real send and not formal
CRA acceptance.

## Campaign flow follow-up CSV readiness - 2026-09-22

Status: LOCAL FIX PREPARED / NOT DEPLOYED.

Owner production validation found the Campaign CSV composer still confusing and
one persisted static CSV seed shape blocked send/schedule incorrectly. The
local correction keeps `Contato` as the required recipient column and expands
generic campaign-only value fields to `Campo 1` through `Campo 10`. Unmapped
generic fields no longer appear as template-variable sources. The UI separates
CSV column mapping from message-variable mapping, adds copyable preview
errors/blocks and keeps authenticated draft/detail recipient identifiers
unmasked for operational evidence.

The readiness correction is code-based, not a DB repair: static CSV campaign
seeds with complete per-recipient `componentsByWaId` and empty
`templateVariableMappings` are now valid for send/schedule, including the
observed Demo `Campanha teste set.9`
(`a1e01fb2-09f2-4be1-a180-3679a3ba008f`) shape. Dynamic CRM-filter campaigns
still require canonical template-variable mappings. No production DB mutation,
provider call, real send, schema change, migration, commit, push or deploy was
performed in this local pass.

## Campaign execution truth + CRM UX follow-up - 2026-09-22

Status: LOCAL FIX PREPARED / NOT DEPLOYED.

Campaign CSV preview, draft creation, scheduling and discard now persist only
campaign-owned private seed/components; they do not create Contact, Lead,
ContactChannelIdentity or CRM situation changes. Contact/Lead/CCI bootstrap is
deferred until an eligible campaign recipient reaches effective execution after
send preflight and provider attempt. Blocked-before-send, discarded and
never-sent campaigns therefore do not create CRM contacts or appear as contact
campaign history.

CRM-filter preview now shows only eligible recipients, removes the
operator-facing "Envio ativo" selector, hides blocked recipients from
count/table, and displays full authenticated identifiers. Result filters and
CSV mapping selects were corrected for dark theme readability. Campaign reuse
restores available modality, destination and variable mappings; CSV reuse still
requires reloading the source file. Contacts CSV preview header alignment was
corrected. No production DB mutation, schema change, migration, provider call,
real send, commit, push or deploy was performed in this local pass.

Local follow-up, 2026-09-24: campaign reuse preview hydration must preserve the
historical selected `leadIds` while refreshing current same-tenant CRM status
and eligibility for those contacts. Historical static filters are not claimed
when absent from `draftSeed`; dynamic CRM status is restorable only when
persisted as `dynamicFilter.crmBusinessStatusId`. Status: LOCAL FIX PREPARED /
NOT DEPLOYED.

Local validation complement, 2026-09-24: later opt-out/active-send blocking was
validated for reuse preview, post-preview send, scheduled execution and mixed
audiences with simulated providers. Blocked recipients produce zero new
provider call, OutboundMessage, Conversation or RuntimeState for the reused
campaign and do not gain new contact campaign-history participation, while the
original campaign history remains intact. Mixed audiences still send eligible
recipients; all-blocked audiences keep the zero-eligible contract. CRM
Situation is descriptive and not treated as an active-send block. Static
filters not stored in `draftSeed` remain unrecoverable; the current UI
hydration uses exact CRM detail reads per persisted `leadId`.

Review follow-up for `be4f2d51`, 2026-09-24: reuse preview hydration now opens
the composer immediately with an explicit loading state, limits concurrent CRM
detail reads and prevents incomplete previews from being used. Missing contact,
permission/session and network/query failures remain ineligible with distinct
labels; "Sem situacao" is reserved for successful CRM detail reads without a
stored CRM Situation. Stale responses after cancel/reset/another reuse cannot
change the composer, modal, preview or toast. Status remains LOCAL FIX PREPARED
/ NOT DEPLOYED / OWNER UI PENDING.
Local behavioral tests passed: `campaignReusePreview.test.ts` 6/6,
`campaignsPageContract.test.ts` 25/25 and frontend build PASS. No production
access, provider call, real send, schema change or migration was performed.

Production deploy on 2026-09-24 advanced the functional head from
`b1a528a00d63b5dc3fea6c9ff45f9273e23f4294` to
`1ea1fef7556e161a9cf938dbbf23442fdfd1e1f6` after persistent PostgreSQL backup
`/opt/re7online/backups/converta-persistent/postgres/campaign-reuse-preview-1ea1fef-20260924T200821Z/20260924-200822.dump`
(`sha256=3d87e903c379e63e7ccd60ea3c0f583fd7ac3929a4f6f0d8e8965f1148f5124c`,
581 objects). Frontend build passed and only `re7-admin-front` was reloaded;
`re7-whatsapp-agent` and `re7-whatsapp-web-worker` were preserved. Health and
basic `/app/campaigns`, `/app/crm`, `/app/inbox` route checks passed.
Authenticated owner reuse validation remains pending; no draft, schedule, send,
provider call, schema change or migration was performed by the deploy smoke.
Status: DEPLOYED / PRODUCTION HEALTH VALIDATED / OWNER UI PENDING.

Local product refinement, 2026-09-25: campaign detail/reuse UX received a
non-deployed local correction. The detail view removes redundant status and
mapping visuals, groups operational actions apart from test-send, shows result
message status only when real data exists, and keeps draft recipients in a
bounded scroll table with only data actually exposed by the API. Test-send in
the UI now asks only for the destination number; backend behavior remains the
source of truth for variable resolution and still blocks insufficient external
tests. Reuse now fetches the full campaign detail before deciding the composer
mode when the list item is incomplete, avoiding an incorrect manual fallback.
Static filters absent from historical seeds remain a known limitation. Local
validation: campaign page/reuse contracts 32/32 PASS, backend focused campaign
routes 2/2 PASS, frontend/backend builds PASS. Authenticated local browser
smoke on 2026-09-25 covered desktop and narrow viewport with local tenant
`campaign-refinement-local`, simulated providers and evidence in
`.codex/evidence/campaign-refinement-2026-09-25/`. No production access,
provider call, real send, schema or migration. Status: LOCAL FIX PREPARED / NOT
DEPLOYED / OWNER UI PENDING; not CRA formal acceptance.

Review follow-up `efbcc62`, 2026-09-25: the local reuse correction now guards
stale responses before the initial detail fetch, neutralizes draft readiness
language and replaces text-matching of missing individual history with the
structured `missing_individual_history` marker. Genuine failed/blocked
historical evidence remains visible; completed rows with missing individual
history appear as historical inconsistency rather than proven provider failure;
and `pricingBillable` only counts when the API returns a boolean. Validation in
this complement: campaign page/reuse
contracts 32/32 PASS and focused backend campaign routes 3/3 PASS against the
local dedicated DB; frontend/backend builds PASS; authenticated local smoke on
frontend `3068` / backend `3067` PASS for neutral draft copy, hidden
draft/seed-only placeholder section, reuse without silent manual fallback and
bounded draft table. Evidence: `.codex/evidence/campaign-review-efbcc62-2026-09-25/`. Status:
LOCAL FIX PREPARED / NOT DEPLOYED / OWNER UI PENDING; not CRA formal acceptance.

Production deployment on 2026-09-25 advanced the campaign refinement functional
head from `1ea1fef7556e161a9cf938dbbf23442fdfd1e1f6` to
`d172b0e65a5237d835acd6ef5ece7ee50af5d241` after persistent backup snapshot
`/opt/re7online/backups/converta-persistent/snapshots/20260925T102510Z`
(`database.dump` sha256
`33003b892ae5b4f8d0228177017aa7c3c68707b910c36b7da6eb39affc070c13`,
22,330,663 bytes, 581 objects, checksum verified). Backend and frontend builds
passed; `re7-whatsapp-agent` and `re7-admin-front` were reloaded, and the web
worker was preserved after confirming the changed route/test files are not in
its compile graph. Health/db and basic `/app/campaigns`, `/app/crm`,
`/app/inbox` route checks passed. The deploy smoke did not create drafts,
schedule, test-send, send campaigns, change opt-out, call providers, change
schema or run migrations. Authenticated CRA/owner UI validation remains pending;
this is production health validation, not CRA formal acceptance.

Owner feedback after this deployment: visual campaign refinements passed. The
remaining local follow-up is campaign test-send with automatic campaign sample
data. The authorized contract is tenant-scoped and non-mutating for campaign
participation: use the typed destination only, reuse existing seed/component
resolution, choose the first eligible complete campaign recipient as sample for
external destinations, block before provider if no complete sample exists, and
revalidate destination opt-out/exclusion including aliases. The same local lot
removes the duplicated draft-detail summary block and its technical reason
chips while preserving campaign counters, recipient review and eligibility
truth. Status: LOCAL FIX PREPARED / NOT DEPLOYED / OWNER UI PENDING; not CRA
formal acceptance.

Follow-up on 2026-09-25: the campaign test-send sample resolver was corrected
locally to prioritize the typed destination after CRM mapping readiness is
rebuilt. A destination that belongs to the campaign audience, including 12/13
digit aliases, uses its own current recipient values; an incomplete known
recipient blocks before provider rather than using another recipient's data.
External test numbers still use the first eligible complete sample and may skip
incomplete candidates. Focused local coverage passed for static CRM audience,
dynamic CRM filter, alias matching, exact destination, zero provider call on
incomplete known recipient, and unchanged draft campaign status. Status: LOCAL
VALIDATED / NOT DEPLOYED / OWNER UI PENDING; not CRA formal acceptance.

Production deploy on 2026-09-25: the test-send sample + draft-detail cleanup
lot was deployed to functional head
`aba600989eda77f6cb1258256f5aa0ba2f40ba03` from
`d172b0e65a5237d835acd6ef5ece7ee50af5d241` after persistent backup
`/opt/re7online/backups/converta-persistent/snapshots/20260925T130420Z`
(`database.dump`, 22,377,789 bytes, SHA256
`1ed097a1ded0c14c0e75dc97ba6af1ba3ccadf985080bc612ff3cd4db0df3bb5`,
581 manifest objects). Backend/frontend builds passed; only
`re7-whatsapp-agent` and `re7-admin-front` were reloaded, and the worker was
preserved. Health/db and basic campaigns/CRM/Inbox/Login routes passed. The
deploy smoke did not click test-send, create drafts, schedule, send campaigns,
change opt-out or call providers. Authenticated draft-detail UI inspection was
NOT EXERCISED from the deploy shell; OWNER UI PENDING. Status:
DEPLOYED / PRODUCTION HEALTH VALIDATED / OWNER UI PENDING; not CRA formal
acceptance.

Owner validation on 2026-09-25 confirmed PASS for the deployed test-send sample
and draft-detail cleanup lot at `aba600989eda77f6cb1258256f5aa0ba2f40ba03`;
this records product owner acceptance, not CRA formal acceptance.

Local follow-up on 2026-09-25: test-send now accepts valid Brazilian national
numbers with DDD and no `55` through the existing canonical CRM WhatsApp
normalizer, preserving full international numbers, 12/13 aliases and
destination block checks. Invalid or ambiguous national input blocks before
provider with a specific PT-BR message. CRM settings were reorganized into the
same expandable-row pattern used by Departments, with `Situação no CRM`
clearly separated from active-send blocking. Campaign light-theme select/options
and manual-send label contrast were corrected. Focused local tests/builds
passed. Follow-up smoke diagnosed the CRM load error as local environment
configuration: `/app/crm/settings` needed the legacy `.data/tenants.json` entry
for the test tenant. A minimal ignored local entry restored endpoint 200 with
DB-backed CRM statuses, and browser smoke validated mouse/keyboard
expand/collapse, save persistence, abandoning unsaved edits, desktop/narrow and
light/dark. Backend coverage includes BR national input without `55`, full `55`,
international preservation, incomplete rejection and alias opt-out blocking with
provider mocked. Status: LOCAL VALIDATED / NOT DEPLOYED / OWNER UI PENDING; not
CRA formal acceptance.

Pre-deploy review correction on 2026-09-25: DDD `55` national input is now
distinguished from Brazilian country code `55` by the canonical CRM WhatsApp
identity parser. National `55 99140-0002` and full `55 55 99140-0002` converge
to the same destination, selected-recipient data remains correct, and
opt-out/alias blocking is enforced for both forms before provider. Focused
normalizer and campaign route tests plus backend build passed. Status:
LOCAL VALIDATED / NOT DEPLOYED; not CRA formal acceptance.

Focused local audit on 2026-09-25 covered ordinary campaign sends in addition
to test-send. CSV/import, CRM static/dynamic selections, reused recipients and
scheduled execution normalize Brazilian DDD `55` and full `55` forms before
opt-out and provider dispatch, preserve other Brazilian DDDs, avoid duplicate
destinations and block alias opt-out/exclusion before provider. CSV/import
continues to reject unsupported international input with controlled validation
and zero provider calls; CRM/Inbox template sends are identity/conversation
backed and not free-form phone entry points. Provider calls were simulated only.
Status: LOCAL VALIDATED / NOT DEPLOYED; not CRA formal acceptance.

Review follow-up on 2026-09-25: the ordinary campaign runner now preserves
recipient-specific variables while normalizing DDD `55` inputs. A seed keyed by
`55991400002` sends to `5555991400002` with that recipient's own variables;
national/full duplicate forms produce one send and no variable mixing. Focused
runner and route tests plus backend build passed with provider mocked. Status:
LOCAL VALIDATED / NOT DEPLOYED; not CRA formal acceptance.

Production deploy on 2026-09-25: the normalization/settings/contrast lot was
deployed to functional head `5ee2de6b8878aefa733a6fbe1b7f1553fd78ae2e` from
`aba600989eda77f6cb1258256f5aa0ba2f40ba03` after persistent backup
`/opt/re7online/backups/converta-persistent/snapshots/20260925T161546Z`
(`database/database.dump`, 22,438,545 bytes, SHA256
`a7812cccd56a5f398ee7664aea44591b933997d74fc8199bc1a9ea6c2a5a2860`, 581
manifest objects). Backend/frontend production builds passed; only
`re7-whatsapp-agent` and `re7-admin-front` were reloaded, preserving
`re7-whatsapp-web-worker` and `.data/`. Health/db and unauthenticated route
reachability for campaigns, CRM, Inbox, CRM settings and login passed.
Authenticated owner UI smoke was NOT EXERCISED due no legitimate shell session,
so OWNER UI remains pending. No test-send, draft creation, schedule, send, CRM
settings save, provider call, schema change or migration was executed. The
known backup retention cleanup permission issue remains separate from the valid
new backup. Status: DEPLOYED / PRODUCTION HEALTH VALIDATED / OWNER UI PENDING;
not CRA formal acceptance.

Owner validation on 2026-09-25: owner confirmed PASS for the deployed
normalization/settings/contrast lot. Status is now DEPLOYED / OWNER VALIDATED /
CLOSED at functional head `5ee2de6b8878aefa733a6fbe1b7f1553fd78ae2e`; this is
product-owner validation, not CRA formal contractual acceptance. The
old-snapshot backup-retention permission issue remains a separate operational
follow-up, and the transient Prisma reload error recovered with health/db OK.

Audience >1,000 audit on 2026-09-25: if a CRM filter finds 3,000 contacts, the
static-audience path does not silently select all 3,000. The UI preview is
paginated (`limit=25`) and the static draft stores only the eligible Lead IDs in
the current preview response; backend creation rejects more than 1,000 explicit
selected Lead IDs. Dynamic CRM-filter campaigns keep the filter until
execution; if current matches exceed 1,000, the runner fails with
`dynamic_match_limit_exceeded` before provider calls instead of truncating or
batching. Readiness gap: add explicit operator-facing preflight/UX copy for the
1,000-recipient limit and dynamic overflow before treating large-audience
campaigns as fully transparent to operators.

## CRM origin + Contacts CSV + campaign block guards - 2026-09-23

Status: DEPLOYED / PRODUCTION HEALTH VALIDATED / OWNER UI VALIDATION PENDING /
NOT CRA FORMAL ACCEPTANCE.

The product follow-up records inbound-created contacts/leads as
`Atendimento / conversa` through existing CRM provenance events, while keeping
manual, CSV, campaign/audience, system and unknown legacy origins separate.
Contacts CSV now supports all editable CRM import fields: phone required;
name, CRM situation, company, city, email and service/interest optional. Blank
or unmapped optional cells preserve existing data, and preview lists which
fields will change. CRM `NEW` is mandatory and active, but does not create
campaign ineligibility by itself. Campaign manual/CSV block guards and Inbox
template active-send guard continue before provider calls; the customer UI no
longer shows billing notices in Campaigns/Inbox. Production deploy reached
`2a652e693a4bce5cfaa7e0a1fa5ef667537f154a` with backend/frontend builds and
health PASS, no schema/migration, no smoke provider call and no real campaign
send. Authenticated owner UI, real post-deploy CSV import and real CRA campaign
evidence remain not exercised. This improves CRA readiness for import/upsert,
opt-out and operator traceability, but does not replace the controlled CRA run.

## P1 campaign delivery truth + alias-safe blocking - 2026-09-23

Local-only corrective gate completed for campaign delivery truth and send
blocking. Campaign CSV import now supports arbitrary phone headers through
explicit operator mapping when no safe alias is detected, without unsafe
first-column guessing. Opt-out/active-send blocking is evaluated across
Brazilian 12/13 digit identity aliases with latest event wins. Provider
accepted/submitted is submission evidence only; delivered/read callback evidence
is required before Inbox Conversation/Runtime materialization and before
classifying a recipient as delivered/read in customer UX. Meta reaction-only
webhooks are suppressed as non-content events. `Campaign.sentCount` remains
legacy submitted/accepted count, not delivered/read/final success evidence.
Real `****6683` controlled repair was executed in production on 2026-09-24 for
campaign `ad354ce4-35dc-4fca-85e5-3108cc9a2332`: only false operational
projection rows were deleted (`ConversationRuntimeState
38012577-8dbb-43d5-8bdd-2ef8ba541038` and `Conversation
9a07b043-6657-4dc3-9e7f-2b904caf939c`). Campaign, Outbound, Event,
billing/meta usage, Contact, Lead and CCI were preserved, including failed Meta
evidence `131026`.

Campaign RBAC/active-send authorization update on 2026-09-24 is DEPLOYED /
PRODUCTION HEALTH VALIDATED / OWNER VALIDATED / CLOSED at functional production
head `b1a528a00d63b5dc3fea6c9ff45f9273e23f4294`. The
audit found Campaign navigation had the `campaigns` feature flag but lacked an
explicit `minRole`; the local patch adds SUPERVISOR/ADMIN gating in navigation,
direct page hydration and backend app campaign routes. AGENT has no Campaign
navigation or app campaign API access, direct Campaign URL is denied without
protected data loading, and SUPERVISOR/ADMIN remain authorized through the
existing tenant, session, feature and capability layers. Opt-out/revoke routes
were audited and preserved for CRM consumers. Local validation: backend campaign
feature suite 121/121 PASS on the dedicated local DB; frontend campaign
contract 24/24 PASS; isolated local browser smoke on ports `3039`/`3000`
confirmed AGENT restricted UX/no protected campaign hydration and
SUPERVISOR/ADMIN campaign loading; backend/frontend builds PASS. Required
regression evidence remains green through `campaignRunner.test.ts` 7/7,
`campaignRecipientImport.test.ts` 7/7 and `tenantConfig.test.ts` 3/3. This
was complemented locally on 2026-09-24 with valid SUPERVISOR/ADMIN fixtures for
CSV preview/draft, CRM draft, manual immediate create, send, schedule, resume
and test-send using simulated provider calls; AGENT negative coverage still
proves no mutation and no provider call. This
strengthens CRA campaign operator-readiness evidence but does not claim OWNER UI
VALIDATED or a new CRA formal acceptance run. Production deploy was FF-only
from `957f19caced77693188a387bb7f7840a24092c67` after PostgreSQL backup
`/opt/re7online/backups/converta-persistent/postgres/campaign-rbac-b1a528a-20260924T143728Z/20260924-143729.dump`
(sha256 `215049ecb9aafdb6bd1e209b5a2f414b0ef8b0247447ec5719207de039a9ef58`,
581 objects), backend/frontend builds passed, only agent/admin-front were
reloaded, worker was preserved, and no POST mutation, real send or provider
call was executed. Role-specific production smoke remains NOT EXERCISED due to
absence of legitimate role sessions during automated smoke. Owner later
declared "validação passou"; that owner statement closes the RBAC front without
inventing additional technical evidence.

Next P2 for product hardening is Guided Builder BOT inactivity policy UX:
runtime already supports `resetAfterMinutes` and
`timeoutMinutes/action=HANDOFF`, but the Guided UI must show current values,
let the operator choose/clear them consciously and summarize practical behavior
in review. This should be implemented over existing fields only, with no
schema/runtime/provider change, no HUMAN auto-close and no reopening of CRA
business hours, which remain CONFIGURED / OPERATIONALLY VALIDATED.


### Preflight do alvo — 2026-09-26 (somente leitura)

Produção `5ee2de6b`; candidato `2ecfc91a`: **NOT DEPLOYED / OWNER UI PENDING**.
[Preflight único, condições de parada e recuperação](../../../saas/CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md) atualizado após `66b9cf2b`: portas 3000/3001 alcançáveis externamente, rewrite público do frontend e risco PM2 resurrect confirmados. Leituras privilegiadas de Nginx/firewall negadas; comandos exatos para o operador constam no preflight.

Recomendação: não avançar à migration; preparar e ensaiar guarda de admissão/drain e artefato de recuperação do atendimento com campanhas fechadas, em tarefa separada. Código atual não comprova quiescência de test-send/runners, nem retorno seletivo seguro. A estimativa preliminar de 30–60 min não constitui janela proposta para aprovação. Sem promessa de inbound/retries; sem REVOKE do papel compartilhado. Migration/drift/ensaio anteriores não repetidos; nenhuma alteração de runtime. Owner PASS anterior preservado, 6683 CLOSED, CRA pendente e DELIVERED/READ → HUMAN/WAITING separados.


### Guarda operacional e recuperação — implementação local 2026-09-26

Base `2b5697b6`, sem commit/push/deploy. Guarda persistente fechada por padrão,
controle superadmin e drain durável integram as entradas de campanha e a fila
existente; suspensão administrativa preserva intenção, snapshot e aceites.
Pause/cancel em execução, RBAC e exclusividade preservados; Inbox outbound não
foi bloqueado. Worktree de recuperação separado em `5ee2de6b` com campanhas
permanentemente fechadas e Client privado, sem dependência das tabelas novas
para atendimento. [Resultados exatos e limites do ensaio](../../../saas/CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md#resultados-comprovados-do-ensaio-local): execução 40/40, rotas 44/44 + caso final 1/1; guarda final 8/8;
atendimento antigo 4/4 sem fila e 5/5 com fila; retorno entre artefatos 1/1;
ambos builds backend PASS. Subconjuntos não são soma de casos únicos.

LOCAL IMPLEMENTED / TECHNICALLY VALIDATED / NOT DEPLOYED / OWNER UI PENDING.
Primeira instalação ainda exige acesso/inventário operacional, decisão sobre
interrupção da API antiga e reconciliação de chamadas sem observabilidade;
a guarda nova não fornece prova retroativa. Sem promessa de inbound/retries,
sem nova migration ou mudança de privilégios. Owner PASS anterior preservado,
aceite CRA pendente, Guided Builder pausado, 6683 CLOSED e DELIVERED/READ →
HUMAN/WAITING separados, sem mudança funcional desses contratos.


### Publicação dos artefatos de guarda e recuperação — 2026-09-26

NOT DEPLOYED / OWNER UI PENDING. Candidato em `review/campaign-recovery-20260926`
(parent `2b5697b6`, histórico funcional `2ecfc91a` preservado); recuperação separada
em `review/campaign-service-recovery-20260926`, commit `e6a12bc9f4ae77ada191f7bdc7d835ee704d5bac`,
parent direto `5ee2de6b`, atendimento funcional com campanhas fechadas em código.
Guarda candidata exige host único declarado e identidade local compatível; não
coordena hosts nem substitui inventário. 11/11 testes da guarda e build candidato
PASS; demais resultados anteriores preservados no preflight único
`docs/saas/CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md`; procedimento/configuração em
`docs/RUNBOOK_WHATSAPP_AGENT.md`, seção de publicação dos dois artefatos.
Backups e estado privado permanecem locais; branches excluídas de auto-deploy.
Primeira transição, acessos operacionais, janela/impacto, owner UI e CRA pendentes.
Sem quiescência retroativa. Histórico owner PASS preservado, 6683 CLOSED,
Guided Builder pausado e DELIVERED/READ → HUMAN/WAITING separado.


### Correções incrementais da guarda — 2026-09-26

Sobre 889a1c7c/e6a12bc9: consentimento opt-out/revoke preservado com política e
RBAC existentes nos dois artefatos; aceite conhecido alcança SQL apesar de
contenção/EIO do ledger. Pendência compartilhada .uncertain impede abertura,
novos envios e drain; recuperação permanece permanentemente fechada. Nenhum
retry cego ou limpeza de lock/tarefa por timeout. Se SQL e filesystem falham,
a resposta pode ficar só em memória: coordenação/durabilidade não são prometidas.
Resultados afetados: guarda 15/15, runner 11/11, rotas candidatas 5/5; recuperação
consentimento 1/1 e fechamento 2/2; CRM 4/4 em cada artefato; ambos builds PASS.
Detalhes sem duplicar relatório: preflight `docs/saas/CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md`
e procedimento em `docs/RUNBOOK_WHATSAPP_AGENT.md` (seção de consentimento/aceite).
Histórico/evidências preservados. NOT DEPLOYED / OWNER UI PENDING; primeira
transição, owner UI/CRA e incertezas antigas pendentes. 6683 CLOSED; divergência
DELIVERED/READ → HUMAN/WAITING separada, sem quiescência retroativa.


### Preparação documental da primeira transição — 2026-09-26

Candidato funcional a1cc380e e recovery 03f930e5 preservados; nenhum teste/build,
implementação ou migration repetido. HEAD alvo 5ee2de6b e unit PM2 reconfirmados
somente por leitura. Novas saídas privilegiadas não localizadas; tentativas
sudo -n continuam exigindo senha. Configuração efetiva Nginx/IPv4/IPv6 e inventário
completo de supervisores NÃO estão confirmados. Gate G0 pendente.
Procedimento futuro e pedido preciso ao operador no runbook, seção “Primeira
transição — plano condicionado às evidências do operador”; consolidação no
preflight único `docs/saas/CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md`.
Recomendação: parada explícita da API antiga, recovery fechada para atendimento,
depois candidato fechado. Owner decide interrupção/incerteza (A) e abertura (B)
separadamente; backup fresco/restore e validação de atendimento são gates.
NOT DEPLOYED / OWNER UI PENDING; primeira transição e CRA pendentes. Sem prova
retroativa de drain, sem promessa inbound/retry. 6683 CLOSED, histórico owner
PASS preservado e DELIVERED/READ → HUMAN/WAITING separado. Nenhuma operação mutável.


### Consolidação G0 do owner — 27/09/2026

Evidências de Nginx/rede/DigitalOcean/systemd/cron recebidas e atribuídas ao owner,
sem repetir coleta nem inventar hashes/arquivos das saídas originais. A pendência
histórica de reenvio dessas saídas está superada. Leituras dirigidas de scripts e
metadados identificaram rotinas destrutivas de retenção e um PM2 root adicional;
saved/fallback/user units root ainda precisam de leitura privilegiada específica.
G0 parcialmente fechado: não presumir inventário completo ou disco=memória Nginx.
Plano exato de contenção central API, suspensão/restauração de cron, prevenção de
resurrect e reversão no RUNBOOK_WHATSAPP_AGENT, complemento executivo 27/09;
matriz observado/proposto/pendente no preflight único. Backup duplicado/.bak Nginx
são higiene separada, sem correção incidental. Backup fresco+restore isolado,
responsáveis e decisões A (primeira parada/incerteza) e B (abrir campanhas)
continuam gates. Recuperação fechada → migration aditiva → candidato fechado →
validação de atendimento; sem dump sobre produção como rollback automático.
Candidato a1cc380e/recovery 03f930e5 inalterados; nenhuma suíte/build/migration ou
implementação repetida. NOT DEPLOYED / OWNER UI PENDING, sem aceite CRA, sem
quiescência retroativa ou garantia inbound/retries. 6683 CLOSED; contratos prévios,
HUMAN/WAITING, worker/sessões e DELIVERED/READ separado preservados.


### Migration aditiva com recovery fechada — 27/09/2026

[Registro operacional e limites](../../../saas/CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md#migration-aditiva-aplicada-com-recovery-fechada--27092026).
Após 87335585, backup persistente fresco verificado e somente migration da fila
aplicada via Prisma em 3,238 s: 59→60 concluídas, checksum/catálogo/status conferidos.
Recovery 03f930e5 ATIVA, campanhas permanentemente fechadas; frontend/worker
preservados. Owner confirmou Inbox/CRM demo pós-DDL, sem envio provocado.
Configuração candidata limpa .config.cjs resolvida pelo PM2 isoladamente, sem start;
artefatos inválidos preservados. Dump fresco não restaurado: reutilizado ensaio
do dump anterior identificado no preflight. Sem alteração de drift histórico.
STOP: candidato a1cc380e NOT DEPLOYED / OWNER UI PENDING; ativação fechada e abertura
exigem decisões separadas, CRA pendente. Não inferir quiescência retroativa ou
validar todos os tenants/webhooks por health/demo. Telegram separado/não validado;
6683 CLOSED, owner PASS anterior e divergência DELIVERED/READ preservados.


### Candidato implantado fechado — 27/09/2026

[Estado e limites comprovados](../../../saas/CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md#candidato-ativado-com-campanhas-fechadas--27092026).
Backend e frontend a1cc380e ativos; worker 5ee2de6b preservado, recovery 03f930e5
disponível para retorno. Frontend compilado isoladamente uma vez; troca sequencial
sob contenção 2min09s, crons/boot e saved/fallback seguros restaurados. Health,
guarda fechada e BUILD_ID servido conferidos; owner confirmou telas/sessão/detalhe.
Grupo de execução não comprovado (DB sem grupos); nenhum fixture/envio produtivo.
Às 22:27:39: zero jobs/grupos/leases/agendamentos/sending. Guarda fechada e scheduler
desabilitado permanecem; abrir guarda pode admitir envio manual mesmo sem timer.
**DEPLOYED / CAMPAIGNS CLOSED / SCHEDULER DISABLED**, sem aceite CRA ou validação
completa de lotes/owner UI. Abertura e habilitação do scheduler exigem decisões
separadas e nova leitura do estado. Sem quiescência retroativa/inbound garantido.
6683 CLOSED, Telegram/materialização separados, histórico owner PASS preservado.


### Liberação controlada — 27/09/2026

[Registro auditado e limites](../../../saas/CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md#liberação-controlada-concluída--campanhas-abertas-e-scheduler-habilitado).
Após 84e92930 e autorização explícita, somente API a1cc380e reiniciada para habilitar
scheduler com guarda fechada; atendimento confirmado pelo owner. Fila novamente
vazia antes do POST superadmin: abertura 22:43:42.139, geração 0→1, motivo auditado.
Duas varreduras reais consecutivas observadas com intervalo 60s, sem trabalho
pendente/envio observado; nenhum fixture ou envio provocado. Frontend/worker
preservados, saved/fallback/configuração persistente e crons/boot conferidos.
**CAMPAIGNS OPEN / SCHEDULER ENABLED**; lotes completos/validação funcional e CRA
continuam pendentes. Restart com guarda aberta não ensaiado, incertezas antigas
não encerradas. Próxima validação owner exige audiência/destinatários controlados
e revisão de template/variáveis antes de qualquer envio. 6683 CLOSED, Telegram e
DELIVERED/READ separados; histórico owner PASS preservado.
