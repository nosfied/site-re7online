# Converta Product State - 2026-08

## Incidente prioritário 91230f88 — correção local para revisão, 29/09/2026

**INCIDENT OPEN IN PRODUCTION / FIX LOCAL VALIDATED / NOT DEPLOYED.** [Matriz de todos os tenants, causa, testes e retorno compatível](AUTOMATION_RUNTIME_SELF_WRITE_INCIDENT_2026-09-29.md). Syer: escrita própria de atividade outbound invalidava updatedAt e impedia persistir avanço. Tendência: conflito correlacionado com encaminhamento humano legítimo; não atribuído ao loop. Demais tenants inventariados, sem prova de ocorrência no período observado.

Fix mantém CAS e reconhece apenas a escrita própria condicional; protege tenant/identidade, ciclo, inbound e transições humanas. API inclui projeção de identidade Meta condicional; worker exclusivamente mínimo bf5+f06+912 com patch específico de quatro fontes. 15 casos integrados API; caso Meta/IA revalidado após projeção; 14 aplicáveis no worker Node20.20.0, também nos compilados; 89 regressões afetadas PASS, sem somar reexecuções. Backend tipado PASS; worker --noCheck PASS e 13 diagnósticos --noEmit idênticos à base, sem aprovação integral de tipos.

Publicação somente para auditoria; nenhum restart, alteração da guarda/scheduler, fluxo, transporte ou runtime produtivo. Retornos estreito/abrangente e riscos estão no incidente, sem execução autorizada nesta etapa. Recuperação exige avanço persistido após publicação controlada, não health. Chave Automação permanece ligada somente em Syer; sua validação não equivale a CRA. Resposta automática tardia e frente maior pendente continuam separadas. Campanhas/CRA aguardam owner; SECULT e DB-only encerradas; inatividade Guia pausada;6683 CLOSED.


## Syer — acompanhamento ativado, validação parcial; regressão de consentimento separada

**ACTIVATED IN SYER / FUNCTIONAL VALIDATION PARTIAL.** [Setter/auditoria, verificações e limitações](SYER_AUTOMATION_ACTIVATION_2026-09-29.md). Tenant canônico `syer-rodrigues`, confirmado pelo owner; sequência ADMIN true→false→true, estado final ligado somente nele. Owner relatou leitura por papel e filtro SUPERVISOR zerado na revogação; anexos restritos, novos eventos realtime e intervenções reais não receberam PASS produtivo. Nenhum atendimento assumido/encaminhado; leitura preservou fingerprint de controle. Demais tenants não ativados. Não equivale a aceite CRA-PR.

**Regressão a corrigir separadamente:** no WEB_SESSION, atividade do próprio outbound altera updatedAt e invalida o token91230f88; persistência do avanço do chatbot é rejeitada e o consentimento reinicia. Código/logs/estado do caso autorizado + reprodução sintética em DB local confirmaram o mecanismo. Não corrigir removendo proteção humana nem trocar pelo worker completo; requer ajuste dirigido e cobertura do outbound simulado/conflitos nos artefatos API/worker mínimo. Nenhuma correção ou deploy nesta etapa. Limitação de resposta automática tardia permanece distinta. Campanhas/CRA aguardam owner; SECULT encerrada; inatividade Guia pausada;6683 CLOSED.

## Release Automação implantada — 29/09/2026, Fortaleza

**DEPLOYED / AUTOMATION NOT ACTIVATED.** [Execução, versões, backup, retorno e limites](AUTOMATION_ROLLOUT_2026-09-29.md). API/frontend ba66c241 (funcional d06a92b8); worker exclusivamente mínimo bf5+f06+backport91230f88. Correção912 separada do acompanhamento BOT. `allowAutomationConversationsInInbox` permanece false/ausente em todos; nenhum tenant ativado. Owner confirmou sessão, Inbox, CRM e configurações em leitura; não equivale a aceite funcional de Automação. Contenção de 3min20; processos antigos/sockets ausentes e barreira DB/locks zero antes do sucessor. Sessões preservaram 3 connected / 1 disconnected / 1 pending; risco residual inbound/outbound/auth não é eliminado por essa contagem. Guarda reaberta na geração 7, scheduler preservado e dois ciclos naturais observados; crons/boot/saved/fallback restaurados com referências compatíveis. Registros anteriores de NOT DEPLOYED permanecem históricos, superados apenas quanto ao deploy técnico por esta entrada.

Escritores compatíveis e retorno a3/minimal-f06 preservados; rollback não restaura DB/auth antigos nem autoriza dois proprietários. Respostas automáticas em andamento seguem limitação separada, sem promessa de cancelamento. Campanhas/CRA aguardam validação funcional do owner; ativação/aceite BOT posteriores; SECULT encerrada/aceita; inatividade no Guia pausada; DB-only encerrada; 6683 CLOSED.

## Acompanhamento BOT — implementação local

LOCAL VALIDATED / NOT DEPLOYED: SUPERVISOR/ADMIN do próprio tenant, opt-in ADMIN/default false, somente filtro Automação; não compõe TODAS nem concede ações. [Provas, privacidade, revogação e artefatos](INBOX_AUTOMATION_LOCAL_2026-09-29.md). Nenhum delta BOT no worker mínimo; coordenação de respostas em andamento permanece demanda separada. Campanhas/CRA owner pending; SECULT encerrada; inatividade no Guia pausada.

## Frentes locais separadas — automação, 29/09/2026

[Correção automação × rodízio](AUTOMATION_QUEUE_RACE_LOCAL_2026-09-29.md): LOCAL VALIDATED / NOT DEPLOYED, código destinado somente à revisão; bloqueia distribuição indevida e persistência obsoleta nos caminhos validados. Resposta automática tardia após intervenção permanece lacuna de contrato, sem promessa de cancelamento. [Acompanhamento BOT](INBOX_AUTOMATION_VISIBILITY_PROPOSAL_2026-09-29.md): somente proposta, reutilizando Inbox/Automação; gestão ADMIN e escopos a revisar. Campanhas/CRA aguardam validação funcional do owner; inatividade no Guia pausada.

## Fechamento SECULT — confirmação do owner em 29/09/2026

**DEPLOYED / CLIENT ACCEPTED.** Deifson informou: “SECULT aprovou. Já está
utilizando a nova atualização.” Ativação e uso registrados conforme esse relato;
não foram informados horário, executor da ativação ou casos específicos exercitados.
A confirmação do cliente é distinta das verificações técnicas e testes locais.
A pendência de ativação registrada na janela anterior fica superada pelo relato,
sem reescrever sua evidência histórica ou afirmar nova leitura técnica da chave.
Permanecem os limites de shutdown, tipagem e rollback documentados; escritores
compatíveis são necessários para preservar a garantia de concorrência.
Campanhas/CRA aguardam validação funcional do owner; inatividade no Guia pausada;
DB-only encerrada/aceita; 6683 CLOSED. Telegram e DELIVERED/READ separados.


## Estado vigente — janela SECULT de 29/09/2026

**Código implantado; ativação SECULT e aceite funcional pendentes.** API/frontend
`a3d16d4b`, worker mínimo `bf5f1d76` + cinco fontes `f06d49cb` (pacote `042e386a`).
[Fechamento técnico, backup, horários, limites e retorno](SECULT_ROLLOUT_2026-09-29.md).
Campanhas reabertas (geração 5), scheduler observado; Inbox/CRM confirmados pelo
owner. Chave permanece desligada em todos os tenants: falta sessão legítima ou
grant de suporte existente para o setter SECULT. Sem contorno de RBAC/SQL.
Compatibilidade de API/worker/scripts deve ser mantida; retorno a escritores antigos
perde a garantia concorrente. Primeira interrupção autorizada não comprova drain
retroativo do worker. Campanhas/CRA aguardam validação funcional do owner; DB-only
encerrada, inatividade no Guia pausada, 6683 CLOSED. Registros abaixo preservam
o escopo e o estado histórico de cada etapa.


> Atualização local 29/09 — [alternativa mínima e parada do worker](SECULT_DEPLOY_PLAN_2026-09-29.md):
> base bf5f1d76 reproduz o bundle alcançável; backport de cinco fontes f06 recomendado
> para revisão. G1/G2 continuam abertos. 45+30 testes PASS; quatro reproduções mostram
> shutdown inseguro, não drain aprovado. Proposta de correção separada não implementada.
> Rollback antigo perde garantia de concorrência; revogar em código SECULT exige
> escritores compatíveis. Produção intacta, SECULT não ativada; campanhas/CRA aguardam owner.


## SECULT — preparação de implantação a3d16d4b — 29/09/2026

**PREFLIGHT READ-ONLY / ARTEFATOS LOCAIS / NOT DEPLOYED.** API/frontend efetivos
e8ebd776; 2.020 hashes conferidos. Worker: checkout 5ee2de6b, mas módulos compartilhados
compilados mais antigos; 21 módulos alcançáveis diferentes/novos no candidato,
incluindo fila operacional, origem CRM e normalização além da dependência SECULT.
**Gate material:** revisar delta adicional do worker e comprovar parada/retorno
WEB_SESSION antes de aprovar janela. Guarda de campanhas não drena todo o worker.
Três WEB_SESSION conectadas; fila/agendamentos vazios são fotografia, não quiescência.
Chave ausente nos dez tenants; nenhuma ativação. Builds isolados API/frontend/worker
passaram, sem converter --noCheck em aprovação de tipos ou aceite produtivo.
[Plano único: versões, delta, artefatos, backup, sequência, retorno e gates](SECULT_DEPLOY_PLAN_2026-09-29.md).
Backup fresco e restauração desse dump ficam para janela autorizada; não realizados
agora. Implantação de todos os escritores compatíveis precede ativação separada
somente secult-pe. Rollback legado perde garantia, exige revogação/exclusão de
escritores antigos. Campanhas/CRA aguardam owner; DB-only encerrada, Guia inatividade
pausado, 6683 CLOSED. Sem commit/push/deploy/restart/cron/admissão nesta preparação.


## SECULT — decisão departamental aplicada localmente — 29/09/2026

**LOCAL VALIDATED / NOT DEPLOYED.** Owner definiu vínculo departamental atual
obrigatório ao departamento do snapshot do encerramento. Perda efetiva do vínculo
revoga consulta; departamento ausente/inativo não concede exceção. Helper único
reutiliza resolvedor canônico com fallback legado, sem estender dispensa de assignee
atual ao responsável histórico. Lista, contagens, detalhe, timeline, mídia e realtime
cobertos; ativos e SUPERVISOR/ADMIN preservados. Mesma Inbox/filtro/histórico.

Código final: **31/31 testes afetados PASS**, build TypeScript backend PASS e smoke
AGENT autenticado com revogação do vínculo e remoção automática do painel/lista.
UI usa polling existente, com atraso visual e sem promessa de revogação instantânea
do conteúdo já exibido. Novas consultas/entregas são negadas. Duas correções anteriores
revalidadas na suíte. As 112 provas/smoke anteriores ficam como histórico, sem
reatribuição integral ao delta; limites de tipagem frontend/worker preservados.
[Decisão, provas e limites](SECULT_OWN_CLOSED_LOCAL_2026-09-28.md). Sem commit/push/deploy/ativação.
API/worker/scripts compatíveis exigidos antes de ativar; rollback a escritores
antigos perde a garantia. Campanhas/CRA aguardam owner; DB-only encerrada, inatividade
no Guia pausada; 6683 CLOSED. A pendência departamental abaixo foi resolvida por esta
nova decisão; registros anteriores preservados como histórico.


## SECULT — revisão local de 48e0fc2a — 29/09/2026

**CORREÇÕES LOCAIS VALIDADAS / NOT DEPLOYED; decisão departamental pendente.**
Falha isolada da nova permissão nega CLOSED sem derrubar os caminhos ativos da
Inbox; erros gerais continuam propagados. Realtime separa invalidação por conversa
e por tenant: handoff de B preserva mensagem pendente de A; transferência/reentrada
na própria conversa e revogação continuam protegidas. Reprodução: 3 falhas em seis
casos antes; 6/6 depois. Regressões afetadas 25/25 e build TypeScript backend PASS.
As 112 provas e smoke anteriores permanecem históricas, sem reatribuição integral
ao delta. UI/worker não alterados nem novamente validados nesta revisão.

Não foi encontrado contrato explícito estendendo a exceção departamental do assignee
atual ao responsável histórico. A afirmação documental anterior foi corrigida;
regra não alterada silenciosamente. Owner deve definir se perda de vínculo revoga
consulta própria CLOSED antes de preparar deploy. [Detalhes, referências e evidências](SECULT_OWN_CLOSED_LOCAL_2026-09-28.md).
API/worker/scripts compatíveis continuam necessários; rollback para escritores
antigos perde garantia de revogação. Campanhas/CRA aguardam owner; DB-only encerrada,
inatividade no Guia pausada; 6683 CLOSED. Sem commit/push/deploy ou ativação.
Os registros anteriores abaixo descrevem as respectivas etapas históricas.


## SECULT — funcionalidade local sobre f06d49cb — 28/09/2026

**LOCAL VALIDATED / NOT DEPLOYED.** Consulta AGENT de sua conversa atualmente CLOSED,
chave `allowAgentOwnClosedConversations=false` por default, gestão SUPERVISOR/ADMIN
na página Inbox existente. Snapshot comprova o responsável do encerramento atual;
sem arquivo por ciclo, nova categoria ou permissão operacional. Dependência de
persistência continua em commit separado. Entrega local de 28/09 preservada;
publicação exclusivamente para revisão autorizada em 29/09, sem deploy/ativação.

Provas: HTTP/DB/socket **10/10**, persistência com setter real **37/37**, regressões
**65/65**; builds backend/frontend PASS. Worker build --noCheck PASS; tipagem estrita
mantém 13 erros preexistentes. Tsc frontend amplo mantém 22 diagnósticos idênticos à
base. Smoke autenticado confirma configuração, Encerradas, consulta, controles
bloqueados e revogação do painel. [Implementação, matriz e limites](SECULT_OWN_CLOSED_LOCAL_2026-09-28.md).

API, worker e scripts precisam ser compatíveis antes da ativação; retorno a escritores
antigos perde a garantia de revogação. Campanhas/CRA aguardam validação funcional do
owner; DB-only encerrada/aceita, inatividade no Guia pausada, 6683 CLOSED. Sem produção.
Revisão de publicação: 22 arquivos; comparação completa das 40 linhas dos 22
diagnósticos frontend idêntica à base f06d49cb, mesmas dependências/compilador,
zero diagnóstico novo. Código validado sem mudanças; 112 provas e smoke reutilizados.
CI push restrito a main/develop; Vercel desabilitado na branch de revisão.
Os registros anteriores abaixo preservam o estado histórico de cada etapa.


## Persistência compartilhada — dependência local separada — 28/09/2026

**LOCAL VALIDATED / NOT DEPLOYED.** [Implementação, provas e limites](SECULT_CLOSED_CONFIG_CONCURRENCY_PROPOSAL_2026-09-28.md).
34 escritores substitutivos migrados para lock transacional + leitura/transformação
atual; criação concorrente sem sobrescrita e no-op de linha ausente protegidos.
Rodízio decide após releitura sob lock; sem alteração de algoritmo, autorização
WEB_SESSION ou identidade híbrida. Sem schema/migration ou configuração SECULT.

Validação: **185/185** na suíte afetada e **22/22** do worker simulado; builds de
backend/worker e typecheck dos três scripts PASS. Build worker canônico usa
--noCheck; não representa typecheck integral. Evidências privadas preservadas.
Implementação local encerrada; publicação somente para revisão autorizada depois,
sem deploy/produção. Revisão adicional: worker estrito falha com 13 diagnósticos
idênticos ao parent; tipagem integral NÃO APROVADA, sem correção alheia. Backend e
scripts alterados checados. Rodízio conserva corpo de decisão/selector e ordem
advisory → config → runtime. P2002 preexistente propaga HTTP 400 com código/mensagem
Prisma após rollback, sem retry. Retorno a escritores antigos elimina a garantia;
rollback futuro, especialmente após SECULT, exige tratamento explícito da permissão.

SECULT continua **NOT IMPLEMENTED / NOT DEPLOYED**, aguardando revisão desta
validação e implementação funcional própria. O bloqueio por persistência está
tratado localmente, sem declarar garantia em produção. API, worker WEB_SESSION
(escritor via fontes compartilhadas) e scripts precisam usar a correção para essa
garantia valer; escritor antigo ainda pode restaurar JSON obsoleto. Rollout separado.

Pendência preexistente separada: `/admin/tenants` com update vazio preserva config,
mas disputa de criação pode retornar P2002; rota não alterada, sem perda de dados
no teste. Não confundir com criação segura do novo helper. Campanhas/CRA aguardam
retorno funcional do owner; DB-only aceita; Guia inatividade pausado; 6683 CLOSED.

O registro SECULT abaixo é o histórico da parada/proposta anterior, preservado;
“não implementado/validado” naquele registro não é o estado atual desta dependência.

## SECULT — consulta AGENT de CLOSED — 28/09/2026

Delimitação técnica posterior: [proposta compartilhada de persistência](SECULT_CLOSED_CONFIG_CONCURRENCY_PROPOSAL_2026-09-28.md).
Inventário: 35 pontos/9 arquivos, sendo 34 substitutivos e um create-only seguro.
Proposta: helper transacional com lock da linha de configuração e transformação
do JSON fresco; migrar 34 escritores, sem alterar decisões de domínio. Sem nova
tabela/migration. Ainda não implementado/validado; SECULT mantém o bloqueio.
Reprodução anterior íntegra; nenhuma mudança produtiva ou de prioridade CRA.

**BLOCKED BEFORE IMPLEMENTATION / NOT DEPLOYED.** Frente prioritária; Guia
inatividade pausado. Requisito: allowAgentOwnClosedConversations=false por default,
gestão SUPERVISOR/ADMIN na configuração Inbox existente, consulta da conversa
atualmente CLOSED pelo responsável comprovado em CompletedServiceSnapshot.
Sem nova tela/categoria, arquivo ou segmentação de mensagens por ciclo; histórico
e privacidade existentes preservados. Reentrada remove somente essa exceção;
nenhuma permissão operacional, alteração de distribuição/lifecycle ou ampliação
de inboxVisibilityPolicy ADMIN-only.

Impedimento local reproduzido em PostgreSQL isolado, dados sintéticos e duas
conexões: saveAgentSignatureSettings leu config com chave true; outra conexão
confirmou false; o upsert do salvador real restaurou true com o JSON antigo.
Os salvadores atuais substituem o documento inteiro; não há proteção concorrente
reutilizável nesse caminho. Escritores de rodízio e WEB_SESSION também compartilham
o JSON. Proteger apenas o novo setter não resolve; é necessário tratar a escrita
concorrente das chaves compartilhadas, preservando as decisões de distribuição.

Aplicada a parada exigida por ampliação material. Próximo passo depende de
delimitar essa proteção como pré-requisito local, sem mudar armazenamento aprovado
nem aceitar revogação insegura. Nenhum código funcional alterado; reprodução
confirma falha existente, não PASS da funcionalidade. Evidências privadas em
local-evidence/secult-own-closed-20260928/RESULT_REPORT.md; sem produção, providers,
envio, build/smoke, commit/push/deploy. Realtime amplo e divergência lista/detalhe
registrados separadamente, sem alegar resolução. DB-only permanece aceita;
campanhas/CRA implantadas aguardam validação funcional de Deifson. 6683 CLOSED.


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
[Registro único, backup, rollback e limitações](CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md#deploy-técnico-da-correção-de-flows-db-only--28092026).
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
[Escopo, evidências e limitações](../BACKLOG_TECH.md#db-only-chatbot-flow-writes--2026-09-28).


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


Status: fotografia documental do produto em agosto de 2026. Este documento nao altera runtime, configuracao, dados ou comportamento operacional.

## Visao geral

O Converta e um SaaS multitenant de atendimento omnichannel para operacoes B2B e B2G. A unidade operacional principal continua sendo `Conversation`, com suporte a Inbox humano, CRM operacional, campanhas com rascunho e envio explicito, catalogo de modelos Meta, mensagens prontas, auditoria por eventos e controles LGPD.

Atualizacao local de 2026-09-25: a divisao de audiencia CRM em rascunhos esta
LOCAL PARTIAL IMPLEMENTATION / FOCUSED TEST VALIDATED / NOT DEPLOYED / OWNER UI
PENDING. Quando a audiencia CRM escolhida ultrapassa a capacidade de 1.000
destinatarios por campanha, o app oferece uma etapa explicita para preparar a
divisao. O backend resolve novamente a audiencia completa do mesmo tenant, com
ordenacao deterministica, deduplicacao, elegibilidade atual e teto de analise de
5.000; nao usa os 25 itens da pagina de previa como conjunto final. A
confirmacao cria somente rascunhos estaticos numerados (`Nome — 01/03`, etc.),
preservando modelo, mapeamentos, variaveis por destinatario e destino de
retorno. Nao ha envio, agendamento, Outbound, Conversation, Runtime ou provider
call. Filtros dinamicos podem ser convertidos explicitamente para selecao
estatica no momento da divisao; novos contatos futuros nao entram
automaticamente nesses rascunhos. Se a audiencia mudar entre previa e
confirmacao, a criacao e bloqueada para nova revisao. Filtros de
pos-processamento ainda nao suportados para divisao completa bloqueiam com
mensagem controlada em vez de truncar silenciosamente. Auditoria posterior
classificou isto como preparacao parcial, nao como controle completo de lotes
CRA: falta identidade duravel de conjunto, snapshot dinamico dividido em lotes,
coordenacao de throughput por tenant, acoes/progresso agregados e recuperacao
de falha parcial. A solucao minima coerente provavelmente exige novo dominio
persistido `CampaignBatch`/`CampaignGroup`, reutilizando os `Campaign` filhos e
o runner atual por chunk.

Decisao explicita do owner em 2026-09-25: nunca executar mais de uma campanha
simultaneamente para o mesmo tenant. Isso inclui campanhas avulsas, lotes,
envios imediatos e agendados; tenants diferentes podem executar
independentemente. Atualizacao local de 2026-09-26: a frente de lotes/fila esta
BACKEND CORE + GROUP UI INTEGRATED LOCALLY / FOCUSED VALIDATED / NOT DEPLOYED /
OWNER UI PENDING.
Foram adicionados modelos aditivos de batch, vinculo de filho, job e lease por
tenant; `Campaign` permanece o lote executavel. Enviar agora, agendamento e
retomada passam a enfileirar jobs; o runner atual so inicia apos claim do tenant
e renova/verifica lease antes de tentativa de provider. Test-send usa job/lease
tecnico duravel e bloqueia quando ha execucao ativa ou incerta do tenant.
Complemento local de 2026-09-26: chunks passam a entrar na fila com sequencia
deterministica e o runner revalida a posse da lease depois do retorno do
provider. Resultado aceito simulado apos perda de posse e preservado de forma
idempotente; o executor para antes do proximo destinatario. Execucao
CRM dinamica agendada com 3.001 elegiveis gerou snapshot unico e quatro chunks
sequenciais. CSV agrupado com 3.001 elegiveis gerou quatro chunks, preservou
variaveis por destinatario e excluiu bloqueio posterior antes do provider.
Validacao local: campaignExecutionQueue 8/8 PASS, campaignRunner 10/10 PASS,
campaignsFeatureRoutes 125/125 PASS antes da UI e 125/125 PASS apos expor
`executionBatch` no detalhe, backend build PASS, campaignsPageContract 29/29
PASS, frontend build PASS e git diff --check PASS. `prisma migrate deploy`
passou em banco local isolado e Prisma Client leu as novas tabelas. A UI local
do detalhe de campanha agora mostra resumo do conjunto, lotes numerados,
progresso agregado/por lote, estado da fila do tenant, horarios solicitados e
inicio efetivo, e motivo de revisao/bloqueio. Smoke tecnico autenticado por API
em portas isoladas confirmou SUPERVISOR/ADMIN lendo o lote de 3.001/4 chunks e
AGENT recebendo 403; evidencia sanitizada fica fora do Git em
`local-evidence/20260926-batch-ui-smoke/`. Chrome headless/CDP validou
	visualmente o detalhe do conjunto em desktop e tela estreita: SUPERVISOR/ADMIN
	viram conjunto, quatro chunks, fila do tenant e progresso; AGENT recebeu tela
	restrita sem detalhe de lote. Complemento CDP local clicou `Pausar conjunto`,
	`Retomar conjunto` e `Cancelar conjunto` e confirmou persistencia no DB local:
	jobs pausados=4, retomados em fila=4 e cancelados=4. Test-send ocupado ficou
	sem novo Outbound enquanto o tenant estava ocupado, mas o toast visual por
	clique segue inconclusivo porque o input controlado nao atualizou no script.
	Ainda nao foram exercitados visualmente: confirmacao de criacao agrupada
	CRM/CSV e toast de test-send ocupado por clique de UI. Nao ha deploy, migration de producao,
	validacao visual do owner ou aceite CRA.

Auditoria de contrato em 2026-09-26: o baseline funcional de producao
`5ee2de6...` ja cria `Conversation`/`ConversationRuntimeState` para campanha
quando o webhook Meta confirma `DELIVERED`/`READ`, sem inbound humano
(`lastInboundAt=null`). O lote local de campanhas em lotes nao introduziu essa
rota, mas a divergencia deve ser decidida antes de promover a frente se o
principio canonico continuar sendo que tentativa outbound de campanha nao cria
conversa operacional.

Atualizacao de 2026-09-19: Contacts/Campaigns receberam acabamento UX e
hardening de telefone/importacao com OWNER PASS / DEPLOYED / PRODUCTION
NON-DESTRUCTIVE VALIDATED.
A regra permanente passa a ser: NO NEW CONTACT/RECIPIENT PHONE MAY BE PERSISTED
WITHOUT CANONICAL NORMALIZATION + VALIDATION. Criacao manual de Contact, Contact
CSV e Campaign CSV reutilizam a identidade WhatsApp canonica, rejeitam telefones
invalidos antes de persistir e preservam equivalencia brasileira 12/13 digitos.
Contacts CSV tambem suporta `Situação no CRM`, validada contra status CRM
existentes no mesmo tenant; valor invalido bloqueia a linha e valor em branco
preserva/defaulta pela semantica canonica de CRM. Isto nao declara limpeza
historica de dados invalidos.

Atualizacao local de 2026-09-20: o lote completo de UX/integridade do Contacts
CSV esta OWNER PASS / LOCAL VALIDATED / NOT DEPLOYED. O modal local
usa prévia antes da importação, nao mostra confirmacao inicial, trava ações
duplicadas durante prévia/importação/relatorio, oferece cancelar/resetar,
traduz operações para portugues e usa cards/tabelas/badges no padrao Campaign
CSV. Telefones completos aparecem apenas na evidencia autenticada da prévia e
relatorio de importação de Contacts; regras externas de mascaramento nao foram
alteradas. A validade da previa fica presa ao mapeamento exato de colunas; se
telefone, nome ou `Situação no CRM` muda, a previa fica stale, a importacao e
bloqueada e o operador precisa atualizar a previa.

Atualizacao local de 2026-09-21: CRM owner-fails hardening esta LOCAL VALIDATED
/ NOT DEPLOYED. Importacao CSV de Contacts grava proveniencia individual por
contato usando o evento de auditoria existente; `Origem` segue sem novo campo
persistido e usa a primeira evidencia confiavel: manual continua manual mesmo
apos CSV posterior, CSV criado mostra `Importação CSV`, e legado sem evidencia
permanece `Não identificado`. O detalhe/historico de atendimento no CRM preserva
conversas historicas, mas so mostra acao de abrir na Inbox quando a conversa e
projetavel pela politica canonica da Inbox humana. O modal CSV usa `Cancelar`
antes do processamento e `Fechar` apos o resumo concluido, sem a duplicidade
Fechar/Cancelar.

Atualizacao local de 2026-09-22: Campaign CSV readiness/UX esta LOCAL FIX
PREPARED / NOT DEPLOYED. Campanhas CSV passam a mapear `Contato` obrigatorio e
`Campo 1` a `Campo 10` opcionais, com variaveis do modelo visiveis somente
para campos genericos ja mapeados. A tela separa mapeamento de colunas CSV do
preenchimento das variaveis da mensagem, adiciona copia de erros/bloqueios da
previa e mostra identificadores WhatsApp completos apenas em contexto
autenticado de detalhe/rascunho. Seeds estaticas de CSV com
`componentsByWaId` completo e `templateVariableMappings` vazio sao prontas para
envio/agendamento sem reparo de banco; campanhas dinamicas por filtro CRM
continuam exigindo mapeamentos canonicos.

Atualizacao de 2026-09-23: Contacts CSV inspection + Campaign Detail UX
esta DEPLOYED / PRODUCTION HEALTH VALIDATED / OWNER UI VALIDATION PENDING no
head `9cfb0d439ed3acd8447659cb033519fa3507b3b3`. Contacts CSV passa a inspecionar arquivo
valido antes do mapeamento de telefone, exibindo headers arbitrarios para
selecao explicita quando nao houver alias seguro. A falta de coluna `Telefone`
nao e mais erro generico de previa; previa/importacao exigem telefone mapeado e
telefones invalidos continuam como erro por linha. O detalhe de campanha exibe
motivos operacionais conhecidos em PT-BR e diferencia `Atualizar detalhe` (`↺`)
de `Nova campanha com filtrados` (`＋`). Health de producao passou; smoke UI
autenticado com owner ficou pendente porque o gate nao reutilizou nem fabricou
sessao de autenticacao.

Atualizacao local de 2026-09-23: Campaign reuse contract + owner-facing error
normalization esta LOCAL FIX PREPARED / NOT DEPLOYED. O reuso de campanha passa
a significar reconstrucao maxima do composer original com base no `draftSeed`
persistido: manual permanece manual, audiencia CRM estatica permanece CRM,
filtro dinamico e CSV sao restaurados quando possivel, e subconjuntos filtrados
sao congelados explicitamente quando a origem original nao pode ser preservada
sem inventar evidencia historica. Erros/toasts de campanha passam a mapear
codigo de erro antes de mensagem bruta, mantendo `template_variables_required`
separado de `no_eligible_recipients` e traduzindo motivos conhecidos para
PT-BR.

Complemento local de 2026-09-24: a previa de reuso para audiencia CRM estatica
deve hidratar os contatos atuais pelos `leadIds` persistidos antes de exibir
`Situacao no CRM` e elegibilidade, preservando a selecao original sem reconstruir
por filtros. Quando filtros estaticos antigos nao foram armazenados no seed,
eles nao devem ser inferidos a partir dos destinatarios; somente filtros
dinamicos persistidos sao restauraveis. Status: LOCAL FIX PREPARED / NOT
DEPLOYED.

Validacao local complementar de 2026-09-24: bloqueio posterior ao reuso foi
testado com provider simulado. Destinatario que participou da campanha original
e depois recebeu opt-out fica inelegivel no reaproveitamento sem ampliar a
selecao; bloqueio aplicado apos a previa e antes do envio e bloqueio aplicado
apos agendamento sao revalidados antes do provider. O destinatario bloqueado
fica com provider calls 0, novos Outbound/Conversation/Runtime 0 e sem nova
participacao no historico da campanha reaproveitada; a campanha original
permanece preservada. Audiencia mista envia somente elegiveis, e todos
bloqueados preserva `no_eligible_recipients`. `Situacao no CRM` nao e bloqueio
de envio por si so. A hidratacao atual usa detalhe CRM por `leadId` selecionado;
nao ha endpoint batch por `leadIds` para essa tela nesta etapa.

Correcao pontual pos-revisao `be4f2d51`, 2026-09-24: a hidratacao da previa de
reuso abre a composicao imediatamente, mostra carregamento explicito, usa
concorrencia limitada para os detalhes CRM e bloqueia uso da previa enquanto a
hidratacao esta incompleta. Erros 404, 401/403 e rede/consulta sao rotulados de
forma distinta e permanecem inelegiveis; "Sem situacao" fica restrito a consulta
bem-sucedida sem Situacao CRM cadastrada. Respostas obsoletas apos cancelamento,
reset ou outro reaproveitamento nao podem alterar aba, painel, modal, toast ou
previa. Status: LOCAL FIX PREPARED / NOT DEPLOYED / OWNER UI PENDING.
Validacao comportamental local: `campaignReusePreview.test.ts` 6/6 PASS com CRM
simulado para sucesso sem Situacao, 404/auth/rede, reuso A seguido de B,
cancelamento/reset durante carregamento, limite de 4 consultas simultaneas e
preservacao da selecao/bloqueio atual; contrato da pagina 25/25 PASS; frontend
build PASS.

Deploy de producao, 2026-09-24: a correcao de hidratacao da previa de
reaproveitamento foi implantada no head funcional
`1ea1fef7556e161a9cf938dbbf23442fdfd1e1f6`, a partir de
`b1a528a00d63b5dc3fea6c9ff45f9273e23f4294`, com backup persistente
`/opt/re7online/backups/converta-persistent/postgres/campaign-reuse-preview-1ea1fef-20260924T200821Z/20260924-200822.dump`
(`sha256=3d87e903c379e63e7ccd60ea3c0f583fd7ac3929a4f6f0d8e8965f1148f5124c`,
581 objetos). Build frontend passou; somente `re7-admin-front` foi recarregado,
com `re7-whatsapp-agent` e worker preservados. Health, `/app/campaigns`,
`/app/crm` e `/app/inbox` passaram. Smoke autenticado especifico de
`Campanha teste set.27` ficou NOT EXERCISED por ausencia de sessao legitima no
terminal de deploy. Status: DEPLOYED / PRODUCTION HEALTH VALIDATED / OWNER UI
PENDING.

Refinamento local de 2026-09-25: P2 Guided Builder permanece pausado enquanto
o detalhe/reaproveitamento de campanhas recebe ajuste pontual. A previa de
audiencia CRM separa filtros e contadores; o detalhe remove o card redundante
de situacao, mostra a badge de estado ao lado de atualizar, agrupa
enviar/agendar/descartar separadamente do teste, remove o bloco visual de
Mapeamento de variaveis fora do composer, limita a tabela de destinatarios do
rascunho a uma area rolavel e evita timestamp relativo neste contexto. "Situacao
real por mensagem" aparece somente com evidencia real de resultado/provider.
Teste com numero nao exige mais preenchimento duplicado de variaveis na UI: o
backend continua resolvendo variaveis por parametros explicitos, componentes do
seed ou parametros fixos, e bloqueia externo insuficiente com
`campaign_test_variables_required`. Reaproveitar uma campanha de listagem que
nao traz `draftSeed` agora carrega o detalhe completo antes de decidir o modo,
evitando fallback silencioso para manual. Filtros estaticos historicos ausentes
do seed continuam nao recuperaveis e a tela nao inventa origem atual/historica
quando a API nao fornece essa evidencia. Validacao local: contratos de pagina e
reuso 32/32 PASS, rotas backend focadas 2/2 PASS, build frontend PASS e build
backend PASS. Smoke autenticado local em navegador real, 2026-09-25, usou
backend `3047`, frontend `3048`, tenant `campaign-refinement-local`, providers
simulados e banco local `127.0.0.1:55432/re7_contacts_campaigns_ux_test`:
desktop e tela estreita confirmaram agrupamento de acoes, progresso abaixo,
teste separado apenas com numero, tabela de rascunho rolavel, ausencia de
timestamp relativo/bloco de variaveis no detalhe, situacao real por mensagem
oculta quando so ha fallback de seed, carregamento de detalhe antes do modo de
reuso e ausencia de fallback manual silencioso. Evidencias locais:
`.codex/evidence/campaign-refinement-2026-09-25/`. Status: LOCAL FIX PREPARED
/ NOT DEPLOYED / OWNER UI PENDING.

Complemento local de revisao `efbcc62`, 2026-09-25: a protecao de
reaproveitamento agora comeca antes do primeiro `getAppCampaign`, impedindo que
resposta ou erro tardio de uma campanha anterior altere campanha selecionada,
formulario, modo, aba, modal ou toast apos outro reuso ou cancelamento. O texto
de rascunho deixou de declarar prontidao de envio apenas por `status=draft`.
Falha real de historico permanece visivel, e seed sem historico individual
passa a ser marcado por `missing_individual_history`, sem depender de
correspondencia textual; em campanha concluida esse caso aparece como
inconsistencia historica, nao como falha comprovada do provider. `pricingBillable`
indefinido nao conta como evidencia de resultado. Validacao local neste
complemento:
campanhas page/reuse 32/32 PASS e rotas backend focadas 3/3 PASS no banco local.
Frontend build PASS, backend build PASS e smoke autenticado local em
frontend `3068` / backend `3067` PASS para texto neutro de rascunho, secao de
resultado oculta para rascunho/seed-only sem execucao, reuso sem fallback manual
silencioso e tabela de rascunho rolavel. Evidencias:
`.codex/evidence/campaign-review-efbcc62-2026-09-25/`. Status: LOCAL FIX
PREPARED / NOT DEPLOYED / OWNER UI PENDING.

Deploy de producao, 2026-09-25: o refinamento de campanhas foi implantado no
head funcional `d172b0e65a5237d835acd6ef5ece7ee50af5d241`, por fast-forward a
partir de `1ea1fef7556e161a9cf938dbbf23442fdfd1e1f6`, apos backup persistente
`/opt/re7online/backups/converta-persistent/snapshots/20260925T102510Z`
(`database.dump` sha256
`33003b892ae5b4f8d0228177017aa7c3c68707b910c36b7da6eb39affc070c13`,
22.330.663 bytes, 581 objetos, `SHA256SUMS` verificado). Builds backend e
frontend passaram. Foram recarregados apenas `re7-whatsapp-agent` e
`re7-admin-front`; `re7-whatsapp-web-worker` foi preservado apos confirmar que
`routes.ts`/testes alterados nao entram no grafo de compilacao do worker.
Health/db e rotas `/app/campaigns`, `/app/crm`, `/app/inbox` passaram. Smoke
autenticado especifico de detalhe/reaproveitamento ficou NOT EXERCISED por
ausencia de sessao legitima/caso disponivel no terminal de deploy. Nenhum
rascunho, agendamento, teste, envio, opt-out, provider call, schema ou migration
foi executado na validacao. Status: DEPLOYED / PRODUCTION HEALTH VALIDATED /
OWNER UI PENDING.

Atualizacao local de 2026-09-25: o owner confirmou PASS visual dos refinamentos
implantados em `d172b0e65a...`; a pendencia restante e o teste de campanha com
variaveis. O backend agora reutiliza os resolvedores existentes de seed,
mapeamento de variaveis, componentes por destinatario, opt-out e exclusao
operacional: se o numero digitado pertence a audiencia, usa seus dados; se for
externo, usa uma amostra deterministica do primeiro destinatario elegivel com
dados completos; se nao houver amostra, bloqueia antes do provider com
`campaign_test_variables_required`. A UI mantem somente o campo de numero e
informa que o teste usa dados de um destinatario da campanha, mas envia somente
ao numero informado. O mesmo lote local remove o bloco visual duplicado do
detalhe de rascunho (`Solicitados`, `Aceitos`, `Bloqueados`, `Duplicados` e
chips tecnicos de motivo), mantendo os contadores principais da campanha,
tabela de destinatarios, elegibilidade e validacoes backend. Status: LOCAL FIX
PREPARED / NOT DEPLOYED / OWNER UI PENDING.

Complemento local de 2026-09-25: o test-send reusa a prontidao canonica do
rascunho antes de escolher a amostra. Se o numero informado pertence a audiencia
original, inclusive por alias 12/13 digitos, a mensagem usa os dados atuais do
proprio destinatario; se esse destinatario conhecido estiver sem variavel
obrigatoria, bloqueia antes do provider em vez de usar outra pessoa como
amostra. Para numero externo, candidatos incompletos podem ser pulados ate a
primeira amostra elegivel completa. Validacao local focada passou para audiencia
CRM estatica, filtro CRM dinamico, alias, destino exato e campanha preservada.
Status: LOCAL VALIDATED / NOT DEPLOYED / OWNER UI PENDING.

Deploy de producao em 2026-09-25: o lote test-send com amostra + limpeza do
detalhe de rascunho foi implantado no head funcional
`aba600989eda77f6cb1258256f5aa0ba2f40ba03`, a partir de
`d172b0e65a5237d835acd6ef5ece7ee50af5d241`, apos backup persistente
`/opt/re7online/backups/converta-persistent/snapshots/20260925T130420Z`
(`database.dump` 22.377.789 bytes, SHA256
`1ed097a1ded0c14c0e75dc97ba6af1ba3ccadf985080bc612ff3cd4db0df3bb5`,
581 objetos no manifest). Builds backend/frontend passaram; PM2 recarregou
somente `re7-whatsapp-agent` e `re7-admin-front`, preservando o worker.
Health/db e rotas `/app/campaigns`, `/app/crm`, `/app/inbox`, `/app/login`
passaram. Smoke autenticado especifico do detalhe de rascunho ficou NOT
EXERCISED por ausencia de sessao legitima no shell; OWNER UI PENDING. A
validacao nao clicou em enviar teste, nao criou rascunho, nao agendou, nao
enviou campanha, nao alterou opt-out e nao chamou provider real. Schema
UNCHANGED; migration NONE. Status: DEPLOYED / PRODUCTION HEALTH VALIDATED /
OWNER UI PENDING.

Owner validation on 2026-09-25 confirmed PASS for the deployed test-send sample
and draft-detail cleanup lot at `aba600989eda77f6cb1258256f5aa0ba2f40ba03`.

Local follow-up on 2026-09-25: campaign test-send accepts valid Brazilian
national numbers with DDD and without `55` by reusing the canonical CRM
WhatsApp identity normalizer before provider dispatch. Existing full
international inputs, 12/13 aliases, destination opt-out/exclusion checks and
sample-selection rules remain unchanged; incomplete/ambiguous national input
receives a specific validation message and zero provider calls. `/app/settings/crm`
now follows the department-style expandable administrative row pattern, keeps
`Situação no CRM` separate from active-send blocking, and preserves editing,
save and tenant permissions. Campaign light-theme select/options and the
`Envio manual` label use theme-aware classes. Follow-up smoke diagnosed the
previous CRM load error as local environment configuration: the test process was
missing the legacy `.data/tenants.json` entry required by `/app/crm/settings`.
After restoring a minimal ignored local entry for the test tenant, the endpoint
returned 200 with `configSource.crmBusinessStatuses=db`; browser smoke validated
mouse/keyboard expansion, save persistence after reload, abandoning unsaved
edits by reload, desktop/narrow and light/dark. Focused backend coverage also
confirms BR national number without `55`, full `55` form, international
destination preservation, incomplete/ambiguous rejection and alias opt-out
blocking with provider mocked. Status: LOCAL VALIDATED / NOT DEPLOYED /
OWNER UI PENDING.

Pre-deploy review correction on 2026-09-25: the shared CRM WhatsApp identity
parser now treats `55` as Brazilian country code only for 12/13-digit BR
international inputs, preserving national numbers whose DDD is `55`.
`55 99140-0002` and `55 55 99140-0002` converge to the same canonical
destination, selected-recipient data remains correct, and opt-out/alias checks
block both forms before provider. Focused normalizer and campaign route tests
plus backend build passed. Status: LOCAL VALIDATED / NOT DEPLOYED.

Focused local audit on 2026-09-25 extended the same `55` guarantee beyond
test-send: ordinary campaign execution now normalizes CSV/import recipients,
CRM static/dynamic selections, reused campaign recipients and scheduled runs
before opt-out and provider dispatch. DDD `55`, another Brazilian DDD and their
full `55` forms converge without duplicates; alias opt-out/exclusion blocks
before provider. CSV/import still rejects unsupported international input as a
controlled row error with zero provider calls. CRM/Inbox ordinary template
sends use existing conversation/contact identities and are not arbitrary
typed-phone surfaces. Provider calls were simulated only. Status:
LOCAL VALIDATED / NOT DEPLOYED.

Review follow-up on 2026-09-25: the campaign runner now keeps recipient
variables attached to the original entry while normalizing destinations. A
static seed keyed by national DDD `55` sends to the full canonical destination
with that recipient's own components, and national/full duplicate forms collapse
to one provider call without mixing variables. Focused runner and route tests
plus backend build passed with provider mocked. Status:
LOCAL VALIDATED / NOT DEPLOYED.

Production deploy on 2026-09-25: the normalization/settings/contrast lot was
deployed at functional head `5ee2de6b8878aefa733a6fbe1b7f1553fd78ae2e`, by
FF-only from `aba600989eda77f6cb1258256f5aa0ba2f40ba03`, after persistent
backup `/opt/re7online/backups/converta-persistent/snapshots/20260925T161546Z`
(`database/database.dump`, 22,438,545 bytes, SHA256
`a7812cccd56a5f398ee7664aea44591b933997d74fc8199bc1a9ea6c2a5a2860`, 581
manifest objects). Backend and frontend production builds passed; only
`re7-whatsapp-agent` and `re7-admin-front` were reloaded, while
`re7-whatsapp-web-worker` and `.data/` were preserved. Health/db and
unauthenticated reachability for campaigns, CRM, Inbox, CRM settings and login
passed. Authenticated read-only UI smoke was NOT EXERCISED due absence of a
legitimate shell session; OWNER UI PENDING. No test-send click, draft creation,
scheduling, send, CRM settings save, provider call, schema change or migration
was performed. The backup retention cleanup permission issue remains recorded
as an operational follow-up and did not invalidate the new backup. Status:
DEPLOYED / PRODUCTION HEALTH VALIDATED / OWNER UI PENDING.

Owner validation on 2026-09-25: the owner confirmed PASS for the deployed
phone-normalization, recipient-variable preservation, expandable CRM settings
layout and campaign contrast lot. Status is now DEPLOYED / OWNER VALIDATED /
CLOSED at functional head `5ee2de6b8878aefa733a6fbe1b7f1553fd78ae2e`. This is
product-owner validation only, not formal CRA contractual acceptance. The
old-snapshot backup-retention permission issue remains separate, and the
transient Prisma reload error recovered with health/db OK.

Campaign audience size audit on 2026-09-25, published behavior before the local
batch backend: a CRM filter matching 3,000 contacts does not automatically mean
3,000 selected recipients. Static CRM preview uses a paginated
`/app/campaigns/audience-preview` response (`limit=25` in the UI);
the draft action persists only the eligible Lead IDs present in that preview
response and backend draft creation rejects more than 1,000 explicit Lead IDs.
Dynamic CRM-filter campaigns store the filter, not recipients; when a scheduled
dynamic campaign executes, the runner reads up to 1,001 current matches and
fails explicitly with `dynamic_match_limit_exceeded` if the match set exceeds
1,000 before any provider call. There is no automatic batching. Product gap:
the UI should make the 1,000-recipient limit and dynamic overflow consequence
clearer before draft/schedule; static filters from legacy persisted seeds remain
limited by what was actually stored.

Atualizacao de 2026-09-23: Zero-eligible campaign + CRM eligibility
counts esta DEPLOYED / PRODUCTION HEALTH VALIDATED / READ-ONLY DOMAIN
VALIDATED / OWNER UI PENDING no head
`b8166b1cafea08f183646976a28b5649550729cd`. Campanhas manuais imediatas
param antes de criar campanha quando todos os destinatarios solicitados estao
bloqueados antes do provider; nesse caso nao ha Campaign, Outbound, Runtime ou
provider call. Requisicoes mistas seguem para os elegiveis e preservam
evidencia de bloqueio. Historico de campanha no contato deixa de incluir
bloqueios pre-provider por opt-out/envio ativo, preservando eventos auditaveis
da campanha e tentativas reais de provider. Contagens de CRM settings e preparo
de destinatarios passam a usar a mesma projecao elegivel da preparacao de
campanha, excluindo anonimizados, opt-out/envio ativo, removidos da operacao e
identidades invalidas. O toast de reaproveitamento e o alinhamento dos campos
nome/modelo receberam polimento. Validacao read-only de producao confirmou
health/db OK, paginas `/app/campaigns`, `/app/crm`, `/app/settings/crm` e
`/app/inbox` respondendo, tenant Demo com `rawLeadTotal=251` e
`totalEligible=4` pela projecao de campanha, bloqueio pre-provider `****6787`
sem evidencia outbound para o mesmo campaign/waId, tentativa real FAILED
`****9614` preservada como historico e evidencia delivered preservada.

Atualizacao de 2026-09-20: Data Subject Privacy / LGPD contact-centric
anonymization esta OWNER PASS / LOCAL VALIDATED / CLEAN DELIVERY DEPLOYED / PRODUCTION HEALTH VALIDATED. A tela de
Privacidade passa a permitir buscar e selecionar um titular no CRM autenticado,
gerar previa sem mutacao e executar anonimizacao por titular somente com
confirmacao forte. A capacidade parte de `Contact.id` quando disponivel e usa
`Lead.id` como fallback para sujeitos Lead-only com `contactId = null`, sempre
no mesmo tenant, sem criar Contact artificial e sem usar telefone cru como chave
de mutacao. A implementacao bloqueia identidade ambigua, reutiliza as primitivas
existentes de `privacyRetentionService.ts` e registra auditoria sanitizada sem
PII. Nao houve schema, migration, hard delete, provider call, envio real ou
deploy inicial de codigo funcional.

Deploy de producao: o HEAD limpo
`2527eb6cd01261c2825e2127191c1e3edcf88692` foi aplicado por fast-forward apos
backup persistente. Builds backend/frontend passaram, health retornou
`ok`/`db=ok`, e nao houve anonimização real, provider call, envio real nem
materializacao de Contact durante a validacao. Smoke visual autenticado ficou
nao exercido por falta de credencial app valida em producao; sessao legada
ADMIN de `demo-prefeitura` foi rejeitada como expirada pela politica runtime.
As contagens de Contact, Lead, ContactChannelIdentity, Conversation e
OutboundMessage permaneceram estaveis.

Owner UX addition/correction local: Contacts recebeu atalho compacto
`Privacidade` com icone de cadeado na linha do contato (`Abrir contato /
Privacidade / Retirar da operação`). O atalho nao anonimiza diretamente e nao
depende de conversa; quando a linha ainda nao tem `Contact.id`, a tela de
Privacidade usa `Lead.id` como alvo governado, preservando a mesma previa e a
mesma confirmacao `ANONIMIZAR TITULAR`. A busca de titular em Privacidade inclui
contatos operacionalmente excluidos e Lead-only sem reexibi-los na lista
operacional normal do CRM. Invariante permanente: exclusao operacional nao
remove o titular da descoberta de governanca LGPD.

Invalid phone UX mapping esta OWNER PASS / LOCAL VALIDATED / NOT DEPLOYED: o
erro canonico `invalid_phone` passa a exibir `Informe um número de WhatsApp
válido com código do país 55 e DDD.` sem alterar backend, normalizador canonico,
CSV, campanhas ou regras de persistencia.

CRM post-deploy hardening, 2026-09-20: LOCAL VALIDATED / NOT DEPLOYED. A origem
do contato passa a ser uma categoria de proveniencia derivada somente de
evidencia canonica ja existente, sem novo campo persistido: `Cadastro manual`,
`Importação CSV`, `Campanha / audiência`, `Atendimento / conversa`,
`Integração / sistema` ou `Não identificado` quando registros legados nao tem
prova confiavel. A importacao CSV de contatos mantem `Fechar` apos o relatorio,
mas deixa de mostrar `Cancelar importação` depois do processamento. No CRM, a
contagem/historico de conversas permanece preservada, mas a acao de abrir Inbox
usa apenas conversa projetavel pela politica canonica
`shouldProjectConversationToHumanInbox(...)`; conversas historicas BOT-only ou
sem destino humano completo nao sao transformadas em falso atalho de Inbox.
Nao houve schema, migration, provider call, envio real, criacao de conversa ou
mutacao de runtime.

Follow-up Lead-only operational exclusion: DEPLOYED / PRODUCTION HEALTH
VALIDATED / REAL LEAD-ONLY E2E NOT EXERCISED. A acao operacional `Retirar da
operação` passou a resolver identidade canonica de Lead-only e materializar
`Contact` apenas nessa acao explicita, apos o guard de conversa ativa.
Conflitos de identidade sao bloqueados, CCI canonico e reutilizado/criado sem
duplicidade, reativacao usa o mesmo `Contact`, campanhas e importacoes
respeitam a exclusao operacional, e o evento de auditoria
`crm.contact.materialized_for_operational_exclusion` define a origem como
`Integração / sistema`. Privacidade permanece preservada e separada: o fluxo
LGPD Lead-only nao cria `Contact`. Producao esta em
`fa7744ac01292f78e094302e932a4d2bd73cb9c9` com health/db OK apos reload
somente do backend; o E2E real nao foi executado porque nao havia fixture
Lead-only com identidade WhatsApp valida e comprovadamente seguro para mutacao
no Demo. Divida separada: 2 expectativas de masking em
`crmConversationStartRoutes.test.ts` falham igual no base `fa507507`.

O produto deve ser apresentado como solucao de atendimento, roteamento, chatbot/fluxos, humano assistido, campanhas controladas e evidencia operacional. Nao deve ser apresentado como plataforma de IA generativa ampla quando esse nao for o escopo contratado.

O baseline funcional estavel de agosto de 2026 consolida hardenings de Inbox, filas, Web Session, read-state, presenca de agentes e politicas de visibilidade. O tenant `secult-pe` opera no mesmo codigo SaaS multitenant publicado em producao; nao existe fork, build exclusivo, frontend exclusivo ou deploy especifico para SECULT-PE. Depois de novo frontend publicado, um reload normal do navegador carrega a versao atual.

## Canais

| Canal | Estado operacional | Observacao |
| --- | --- | --- |
| WhatsApp Oficial/Meta | principal | Suporta inbound, outbound em janela, modelos aprovados, campanhas e ledger Meta. |
| Instagram | controlado | Inbound operacional suportado com guarda de destino e bloqueio de eventos ambiguos. |
| Messenger | controlado | Inbound suportado conforme adaptadores e configuracao do tenant. |
| Webchat | disponivel | Canal proprio para atendimento receptivo e persistencia multicanal. |
| API/Webhook | disponivel por contrato | Integracao tecnica conforme escopo e configuracao do tenant. |

A disponibilidade final depende da configuracao do tenant, permissao do canal e credenciais operacionais autorizadas.

### Readiness Meta/WhatsApp

O estado saudavel minimo de WhatsApp por tenant usa a arquitetura atual:

- `Client` ativo;
- `TenantMetaConfig.businessToken` presente;
- `TenantMetaConfig.phoneNumberId` presente;
- `WaPhoneNumber.phoneNumberId` correspondente ao mesmo `Client`;
- token valido e webhook entregue pela Meta ao Converta.

`ChannelAccount` nao e requisito WhatsApp no modelo atual. Para
Instagram/Messenger, `ChannelAccount`, aliases e secrets continuam sendo a base
principal. `businessId` e `businessPortfolioId` sao metadata recomendada, mas
nao bloqueiam sozinhos a prontidao WhatsApp.

## Inbox

O Inbox concentra conversas operacionais por tenant. O fluxo atual inclui:

- listagem de conversas por canal e estado operacional;
- selecao e timeline da conversa;
- assumir conversa conforme RBAC, fila, departamento e modo humano;
- resposta livre quando a janela do canal permite;
- envio de modelo aprovado pelo WhatsApp quando a janela livre esta fechada;
- uso de mensagens prontas ativas quando permitido;
- assinatura opcional do atendente em mensagens humanas de texto e mensagens prontas, desativada por padrao e configurada por tenant;
- indicacao visual de conversas atribuidas ao operador atual ou a outro responsavel;
- exibicao de outbound de modelo como mensagem na timeline, com badge `Template` e nome do modelo;
- preservacao de isolamento entre tenants.

Conversas removidas da operacao visivel ou anonimizadas nao devem voltar ao Inbox por reidratacao de dados antigos.

### Visibilidade do Inbox

A politica de visibilidade fica em `TenantOperationalConfig.config.inboxVisibilityPolicy`.

Valores atuais:

- `shared`: comportamento legado por setor/membership.
- `assignee_only_after_assignment`: visibilidade individual depois da atribuicao.

O default e `shared`.

Em `assignee_only_after_assignment`, a regra para AGENT e:

- `WAITING` sem responsavel e com membership no setor: visivel.
- atribuido ao proprio agente: visivel.
- atribuido a outro agente: oculto.
- atribuicao direta ao proprio agente fora de membership: visivel conforme governanca operacional.
- `CLOSED`: oculto para AGENT, inclusive com participacao propria.

Auditoria de 2026-09-13 confirmou que esta politica e somente de
projecao/visibilidade de Inbox. Ela nao cria conversa, nao muda handoff,
fila/capacidade, presenca, claim, transferencia, envio, fechamento, atribuicao
automatica nem RBAC canonico; ambos os modos continuam validos. A restricao de
AGENT para conversa `CLOSED` permanece mais forte e preservada.

SUPERVISOR visualiza por escopo de departments dos memberships ativos. ADMIN visualiza tenant-wide. A participacao historica em conversa fechada usa evidencias estruturadas como `ConversationAssignment` e historico de assignment/runtime, sem inferencia por texto.

Desde `93cd0e06`, conversas `CLOSED` tambem nao podem ser assumidas por nenhum
papel. O backend rejeita a tentativa com `conversation_closed` antes de avaliar
elegibilidade ou limite de atendimentos ativos, evitando falso diagnostico de
capacidade para uma acao que ja e invalida por ciclo encerrado.

A visibilidade e independente de autorizacao, notificacao e read-state. Ela decide projecao no Inbox, mas nao concede permissao de operacao por si so.

### Read-state, notificacao e realtime

O read-state do Inbox e hibrido:

- conversa sem responsavel (`assignedUserId=null`): read-state compartilhado.
- conversa atribuida: read-state direcionado ao `assignedUserId`.

A notificacao segue a mesma distincao operacional:

- conversa atribuida: direcionada ao responsavel.
- conversa sem responsavel: compartilhada para a audiencia elegivel da fila/setor.
- transferencia para usuario: direcionada ao novo responsavel.
- devolucao para fila ou transferencia de setor sem responsavel: compartilhada enquanto `assignedUserId=null`.

O read model e scope-aware para evitar residuos de escopos antigos, aliases legados e pisca-pisca de badge/dot entre conversas diferentes. Eventos `read_state.updated` fazem merge incremental no frontend, sem substituir o mapa inteiro por payload parcial. Mark-read e mark-unread sao idempotentes nos caminhos homologados.

O realtime do Inbox segue paridade com `GET /app/conversations`: eventos ambiguos de `message.created` falham fechado ate reconciliacao canonica, mensagens `management_only` nao entram em timeline/preview humano, perda de visibilidade remove item do cache, e conversas anonimizadas/deletadas sao removidas sem depender de F5.

## Support Hub

O Support Hub permite que ADMIN e SUPERVISOR abram suporte com a equipe da plataforma sem criar `SupportTicket`, `Case`, fila paralela ou timeline paralela. A unidade continua sendo `Conversation`, criada no tenant de suporte configurado por `PLATFORM_SUPPORT_TENANT_KEY`.

O frontend nunca envia tenant destino, `clientId`, WABA ou identificador de canal. O backend resolve tenant origem e usuario pela sessao, valida RBAC, resolve o tenant de suporte configurado e cria ou retoma uma conversa ativa por tenant origem + usuario. Conversas encerradas permanecem historicas e uma nova abertura cria nova `Conversation`.

A identidade do solicitante no tenant de suporte e sintetica e deterministica, baseada em hash interno. O rotulo operacional pode exibir nome amigavel do tenant e usuario solicitante, mas nao transporta telefone, email, CRM, token, SID, IP ou payload sensivel do tenant origem.

O atendimento da equipe da plataforma ocorre no Inbox normal do tenant de suporte, com chatbot, handoff, fila, protocolo e eventos ja existentes. O canal `support` pode usar um flow dedicado via `TenantOperationalConfig.config.supportChannel.chatbotFlowId`; sem flow dedicado valido, a conversa cai no modo humano e nao usa automaticamente o `entryPoint` geral do tenant.

Auditoria read-only de 2026-09-15 confirmou que active non-entrypoint flows sao
alvos validos de execucao explicita: Support Hub e destino automatizado de
retorno de campanha resolvem por id explicito, exigem `isActive=true` e nao
exigem `entryPoint=true`. O `entryPoint` segue sendo apenas o seletor padrao de
novas conversas do tenant. O modelo atualizado e: MULTI-ACTIVE RUNTIME COM UM
ENTRYPOINT PADRAO. UX e invariantes de dominio adicionais ficam em backlog P2.

O Support Hub aceita texto e imagem inbound do solicitante, limitado a uma imagem PNG, JPEG/JPG ou WebP por envio, com legenda opcional. As imagens ficam fora do Git e fora do banco, em storage interno configurado por `SUPPORT_ATTACHMENT_ROOT`; a mensagem continua vinculada a `InboundMessage` e a timeline permanece baseada em `Conversation`. O frontend recebe apenas uma referencia opaca e o arquivo e servido por endpoint autenticado com cache privado. O envio de imagem do suporte para o cliente ainda nao faz parte do MVP; o operador responde por texto no Inbox.

## Training Center

O Training Center em `/app/training` fornece uma base autenticada de aprendizagem para todos os perfis do app. Ele reutiliza a sessao do Converta e publica catalogo global de videos MP4 e PDFs cadastrados pela equipe interna da plataforma.

O console interno `/admin/training` administra criacao, edicao, publicacao, despublicacao, ordenacao, upload, substituicao de arquivo, preview e exclusao. A fonte canonica do catalogo e `TrainingContent`; arquivos grandes ficam fora do Git, em storage local configurado por `TRAINING_CONTENT_ROOT` ou mecanismo operacional equivalente. O backend serve conteudo apenas por `contentId`, nao expoe `storageKey`, bloqueia traversal, paths absolutos e escape por symlink, e entrega MP4 com suporte a range e PDF inline/download.

## CRM operacional

O CRM atual e um read model seguro de contatos/leads por tenant. Ele exibe dados minimizados e operacionais, como nome exibivel, identificador seguro, canal, classificacao, empresa quando houver, ultima conversa operacional abrivel no Inbox, contagem/historico de conversas, status da conversa, ultima atualizacao, bloqueio de envio ativo e origem/proveniencia derivada de evidencia canonica.

O CRM operacional:

- usa sempre o tenant da sessao;
- exige capability `crm`;
- nao aceita `clientId` arbitrario vindo da UI;
- oculta registros anonimizados por padrao;
- permite edicao segura de dados basicos ja autorizados;
- permite alterar status entre situacoes ativas configuradas no tenant;
- permite bloquear/liberar envio ativo via eventos de opt-out;
- nao executa hard delete pela tela operacional.

Origem do contato significa como o registro CRM/operacional entrou na base,
nao o status CRM nem o canal atual. O valor e derivado de eventos/fonte ja
persistidos e, para legados sem evidencia confiavel, deve permanecer
`Não identificado`. Historico de conversa e preservado, mas a acao primaria
`Abrir conversa` so aponta para Inbox quando a conversa passa pela politica
canonica de projecao humana; conversas historicas nao projetaveis continuam
como evidencia de historico, sem ficarem visiveis na Inbox por esse motivo.

Importacao CRA implementada localmente para campanhas CSV: campanha/contatos
com `Situação no CRM` reutilizam a identidade canonica do CRM. Quando o import
encontra contato existente, atualiza o registro canonico, nunca cria duplicata;
quando nome/status vierem em branco, os valores existentes sao preservados.
Situacao valida atualiza `Lead.status`; situacao desconhecida/ambigua bloqueia
a linha e aparece no relatorio. O lote corretivo de 2026-09-17 unificou a
resolucao de identidade entre preview/upsert, tornou CRM/status/seed atomicos
por linha, corrigiu a ordem de vencedor duplicado, exigiu `campaigns` + `crm` e
protegeu o CSV contra formulas. Status: IMPLEMENTED / TEST VALIDATED /
PRINCIPLES AUDIT PASS / OWNER APPROVED LOCAL / DEPLOYED / PRODUCTION
NON-DESTRUCTIVE VALIDATED em `cad9489c`. A revalidacao local do owner passou;
import real e aceite CRA/customer permanecem pendentes.

Contacts campaign relationship view: CANONICALLY INTEGRATED / TEST VALIDATED /
OWNER PASS / PRODUCTION DEPLOY PENDING / CRA CAMPAIGN-CRM FOLLOW-UP. A area de Contacts/CRM agora
expoe uma projecao read-only de campanha por contato a partir de fontes
canonicas ja persistidas (`Campaign`, `OutboundMessage` e eventos de campanha),
sem criar historico sombra dentro de `Contact`, sem schema/migration e sem
reescrever campanha/billing/opt-out. A lista mostra resumo compacto de
campanhas para a pagina atual e o detalhe carrega historico recente sob demanda,
same-tenant, sem N+1 por linha. A UX mostra apenas status operacional, sem preco
ou custo. Validacao local: `crmCapabilityRoutes.test.ts` 19/19 PASS em
`re7_queue_domain_test_20260917`, backend build PASS, frontend build PASS e
`git diff --check` PASS. Owner review, producao e aceite CRA permanecem
pendentes.

Contacts + Campaigns UX refinement, 2026-09-19: IMPLEMENTED LOCAL / OWNER
PASS / NO DEPLOY. Contacts now follows a row-driven administrative
pattern: clickable rows open contact detail, actions are compact, authorized
same-tenant CRM users see the full normalized phone number, redundant summary
fields were removed, active-send block uses an ON/OFF switch backed by
canonical opt-out events, and related campaign history is grouped under one
expandable section. Final owner rule: Delete remains only on the Contact list
row; Contact detail has close/back, edit, save/cancel as applicable and no
delete action. Campaigns removed the redundant top counter panel, moved
counts into tabs, made rows open details, right-aligned compact actions,
normalized detail counters to avoid duplicate `Enviadas`, and removed the
technical provider/persistence note. Campaign detail now adds view-only filters
by result status, CRM Situation and name/phone, copy of filtered rows and new
campaign prefill from filtered current canonical contacts through the existing
composer. Rows without current reusable contact are excluded explicitly.
Dynamic CRM-filter scheduled campaigns are now OWNER PASS / LOCAL VALIDATED /
NOT DEPLOYED and documented separately in
`docs/saas/DYNAMIC_CRM_FILTER_CAMPAIGN_SCHEDULING.md`. Static campaigns remain
unchanged; dynamic schedule-time stores only the CRM Situation filter and
execution-time creates one immutable snapshot. No schema, campaign history,
opt-out semantics, operational queue abstraction, financial UX or real send
changed.

## Campanhas

O centro de campanhas suporta:

- previa de audiencia CRM sem criar campanha;
- filtros por busca, canal, status CRM e conversa existente;
- bloqueio de contatos sem WhatsApp valido, canal nao suportado, duplicados, opt-out e anonimizados;
- rascunho com `Campaign.status = draft`;
- envio explicito separado da criacao do rascunho;
- mapeamento de variaveis por destinatario;
- envio imediato manual mantido como compatibilidade/fluxo avancado;
- ponte com Inbox para conversa existente;
- bootstrap operacional minimo de conversa/CRM para numero inedito somente em
  execucao efetiva de campanha, depois do preflight e da tentativa de envio;
  preview, rascunho, agendamento e descarte nao materializam contato CRM.

Criar rascunho nao envia mensagem. Envio real exige acao explicita do operador.

Campaign flow integrity review, 2026-09-21: IMPLEMENTED LOCAL / VALIDATED /
NOT DEPLOYED. Campaign CSV no longer maps business variables from arbitrary raw
headers; the operator maps `Contato`, `Campo 1`, `Campo 2` and `Campo 3`, and
template variables can only point to those generic fields. Generic fields do not
update CRM name or CRM situation. Authenticated CSV preview/report shows full
normalized WhatsApp identifiers, ready/blocked/error rows in the same table, and
copy/export evidence. Campaign names are unique per tenant by trim,
case-insensitive and whitespace-normalized comparison. Reopened drafts, send,
schedule and scheduled execution use the persisted seed as canonical truth.
Variable-template test sends use the target recipient's own campaign values
when that number belongs to the audience, or an authorized deterministic sample
from the campaign seed for external test numbers. They stop before provider
call or aggregate mutation when neither the campaign nor an eligible sample has
complete data. CRM campaign relationship/history is actual-send evidence only;
draft, seed, import, test-send and scheduled-not-run records are not shown as
contact campaign history.

Campaign execution truth + CRM UX follow-up, 2026-09-22: LOCAL FIX PREPARED /
NOT DEPLOYED. Campaign CSV import now persists only campaign-owned audience
seed/components before execution; it does not create/update Contact, Lead,
ContactChannelIdentity or CRM situation in preview/draft/schedule/discard
paths. CRM/contact bootstrap is deferred to eligible runtime execution after
send preflight and an actual provider request; provider-returned `FAILED`
attempts materialize/reuse Contact/CCI/Lead as campaign evidence without
creating a new Conversation/RuntimeState, while pre-provider blocks do not.
CRM-filter preview is eligible-only with
full authenticated identifiers and no separate "Envio ativo" selector. Result
filters and CSV mapping controls were corrected for dark theme readability,
reuse restores known campaign modality/destination/mappings, never-sent drafts
stay out of contact campaign history, and Contacts CSV preview headers align
with row data. No production validation is claimed.

Atualizacao local de contrato, 2026-09-15: novas campanhas nao dependem de
default operacional implicito ou nomeado como destino canonico das respostas. O
rascunho/importacao/envio grava `returnDestination` no seed da campanha:
atendimento humano exige setor + fila concretos (fila unica resolvida
internamente, zero fila bloqueia, multiplas filas exigem selecao) ou fluxo
automatizado exige `ChatbotFlow` ativo do mesmo tenant. Campanhas antigas sem esse
seed continuam compativeis pelo fallback legado. Inicio direto de conversa pelo
CRM usa o setor principal valido do usuario iniciador e bloqueia antes do
provider quando ele nao existe.

CRA campaign follow-up reconciliation, 2026-09-16: the approved outbound return
destination delivery is CLOSED / DEPLOYED / OWNER APPROVED / PROD
NON-DESTRUCTIVE VALIDATED at `452d5826db42cc1b574eeff8fd8e0d038cd3491f` and
must not absorb new requirements. Recipient B controlled Utility validation,
opt-out E2E and reports/exports/billing Phase E are completed on Demo product
evidence; CRA customer acceptance remains separate. The current CRA order is:
campaign/CRM import/upsert/report with `Situação no CRM`, contacts campaign
relationship view owner pass/production gate, final reports/export/billing
package with CRA-approved scope and unit price, then acceptance package. The CRM import front is IMPLEMENTED /
TEST VALIDATED / PRINCIPLES AUDIT PASS / OWNER APPROVED LOCAL / DEPLOYED / PRODUCTION NON-DESTRUCTIVE VALIDATED and is not only an optional
column: it is tenant-scoped CRM upsert. Existing contacts update instead of
duplicating; valid imported name may update the record; blank cells preserve
current data; valid resolved `Situação no CRM` updates `Lead.status`; repeated
identities inside the file do not create duplicate contacts; unknown/ambiguous
situations are reported truthfully in preview/import and never auto-created. A
detailed downloadable CSV import result report is exposed for operator evidence.
History is preserved: initial implementation and owner PARTIAL PASS were
followed by a four-P1 principles block; the 2026-09-17 corrective batch and
principles re-audit passed, owner revalidation passed, and canonical integration
was prepared, followed by FF-only production deployment at `cad9489c` and
non-destructive validation. No real production import was executed; this is not
E4 customer evidence. The authorized untracked Web Session `.data/` directory
was preserved intact and its worker was not reloaded.
Sequential canonical identity resolution is
retained as P2 performance hardening; internal result labels remain P3 UX.
Marketing template media support is P2 / PRODUCT + META CAPABILITY, covering
MARKETING category, IMAGE/VIDEO headers, Meta media/example lifecycle, preview,
variables, supported buttons, approval/rejection status/reason, approved send
path and official Marketing pricing. It is not part of the current Utility
controlled campaign unless contract evidence triggers owner promotion.

CRA-PR update, 2026-09-15: Utility/campaign readiness audit is closed and
contract acceptance is open. Production has `campaigns=true` and
`templates=true` for `cra-pr`, but no CRA templates, template requests,
campaigns, campaign billing events or opt-out campaign events were present in
the read-only snapshot, and no approved CRA Utility copy was found. No Meta
template submission or real Meta outbound is authorized without approved
customer copy and explicit owner approval covering template, recipients, send
window, expected cost, campaign name and number of messages. Instagram Direct,
Facebook Messenger and Website/Webchat remain contract-required but
customer-deferred with delivery window pending for this phase.

Demo contract validation update, 2026-09-15: `demo-converta` is the multitenant
behavioral mirror for generic CRA capability validation, not a CRA clone. Phase
A is docs/evidence planning only: Demo is ACTIVE/business, Meta Cloud is
configured, one Utility template is approved, campaigns are zero and campaign
billing/opt-out evidence is zero. No CRA data was used and no real outbound was
sent. Canonical plan:
`docs/bids/2026/cra-pr/DEMO_CONTRACT_VALIDATION_PLAN.md`.
Phase B owner gate is prepared without real Meta outbound: approved Demo
Utility template `data_exame` (`pt_BR`, one `{{1}}` date variable) is suitable
for Demo/RE7 test data only, local pre-send checks pass 13/13, and a controlled
2-message gate previously used R$ 0,64 as central planning reference, now paused
until billing-unit reconciliation. The old HUMAN
waiting-on-customer 1h auto-close interpretation is SUPERSEDED / NOT REQUIRED;
human conversations may remain open under attendant control. The real lifecycle
front is BOT/FLOW abandonment, already validated for `resetAfterMinutes`, stale
pending question reset and Web Session inactivity handoff, with only residual
cross-provider and Guided lifecycle-policy hardening in P2.
Phase C controlled Utility gate is prepared without real Meta outbound: owner
authorized the known Demo/RE7 recipient finals `9614` and `6787`; production
read-back confirms Demo ACTIVE/business, campaigns/templates enabled, Meta
config present, Web Session connected, `data_exame` still approved, migrations
up to date, both recipients outside 24h, no active opt-out found, final unique
targets 2 and BRL cost paused for billing-unit reconciliation. Real send remains
blocked until explicit approval of this exact final preview and validated
billing unit.
Guided Builder - BOT inactivity policy UX is now tracked as P2 / UX + PRODUCT
CLARIFICATION / OPEN: future Guided UI must explain `resetAfterMinutes` and
`inactivityPolicy.timeoutMinutes/action=HANDOFF` as independent business
choices, after auditing real production values/defaults. This remains separate
from HUMAN auto-close, which is not required.
Phase C controlled Utility send, 2026-09-15: owner authorized exactly 2 Demo
Utility messages, but execution produced PRODUCT ISSUE FOUND / STOP. Meta
accepted 1 `data_exame` template for `****9614`; the campaign runner then
failed with `default_operational_department_missing` before persisting
OutboundMessage, billing ledger or report rows, and `****6787` was not sent.
Owner confirmed real receipt for `****9614`; Meta message id plus `sent` and
`delivered` webhook events were later recovered, but they remained orphaned
because no local OutboundMessage existed to correlate. Billing/report evidence
must not be synthesized from this gap. Local generic repair is tested: validate
operational defaults before Meta, persist submit/accepted idempotency events,
stop retry with reconciliation evidence when acceptance exists without outbound,
and record orphan status events without billing. The generic repair was deployed
on 2026-09-15 with an FF-only production update to `b8c8f616`, reloading only
`re7-whatsapp-agent`; health/db, migrations status and non-destructive bundle
smoke passed. No new real send occurred; `****9614` is a hard no-resend and
`****6787` requires a fresh owner gate. Recipient A reconciliation audit on
2026-09-15 found enough evidence for a constrained repair; after explicit owner
approval and backup, production reconciliation created exactly one local
outbound for A, created one idempotent delivered Utility billing event from the
recovered Meta webhook, set `sentCount=1`, and preserved campaign
`status=failed`. A was never resent. Billing-unit audit confirmed `R$ 0,32`
comes from the internal central planning premise `R$ 3.200,00 / 10.000`, not
from Meta, a tenant override, or a final CRA proposal found in the repo. A's
ledger remains correct as delivered Utility eligibility/count, but final CRA BRL
contract unit is NOT PROVEN. Meta official narrow rate proof for the controlled
Demo Utility validation was completed on 2026-09-15 from WhatsApp Business
Platform Pricing / Meta Developers: Brazil, Utility, BRL, effective 2026-07-01,
tier 0-250,000, rate R$ 0,0350/message. Historical B preflight on 2026-09-15
stopped before Meta because `demo-converta` did not yet provide an active
generic human destination. That block was later superseded by owner-approved
Demo destination configuration and the completed B controlled Utility send on
2026-09-16. Generic Meta pricing source-of-truth implementation moved to P2
FinOps hardening.
Recipient B-only explicit human return gate on 2026-09-16 stopped before
campaign creation with NO REAL SEND: B `****6787` still passed template,
authorization, canonical dedupe, opt-out and outside-24h checks, but Demo did
not provide a single non-arbitrary human destination with concrete queue. Active
`Setor Teste` has zero queues, inactive `Atendimento Geral` has queues and
other active queued departments are thematic. That read-only block was
superseded later on 2026-09-16 by explicit owner selection of the existing Demo
destination by IDs.
Recipient B-only final destination configuration later on 2026-09-16 prepared
the final send gate with NO REAL SEND. Owner selected existing Demo
`Atendimento Geral` (`cmsiwk1o100014sdzl5cqd2ki`) + `Fila Geral`
(`cmsiyb2k200n94sdpu5khkee0`) explicitly for this campaign; product routing is
by persisted tenant-scoped IDs, not by name. Backup was validated, campaign
`bb1d30e2-3a98-471a-9531-1f5e5d76a214` was created as B-only draft with
`totalRecipients=1`, `sentCount=0`, `blockedCount=0`, explicit HUMAN return
destination and zero OutboundMessage rows. Final owner send approval was later
granted for exactly one B message.
Recipient B controlled Utility send on 2026-09-16 is COMPLETED as Demo
product capability validation. Exactly one Meta Utility call was made for B
`****6787`; Meta accepted it, webhooks show sent=1 and delivered=1, read=0 and
failed=0, billing created exactly one `billing.active_message.delivered`, and
campaign `bb1d30e2-3a98-471a-9531-1f5e5d76a214` ended `completed` with
`sentCount=1`. A was not resent. This does not close CRA real campaign
acceptance or CRA contractual unit price. Opt-out E2E and
report/export/billing evidence remain separate open gates. See
`docs/saas/META_PRICING_SOURCE_OF_TRUTH.md`.

## Modelos Meta

O centro de modelos permite:

- catalogo de modelos Meta do tenant;
- solicitacao interna de novo modelo pelo tenant;
- revisao interna pela Re7online antes de submissao Meta;
- submissao Meta apenas por fluxo administrativo;
- sincronizacao de status do provedor;
- controle local ativo/inativo sem alterar a aprovacao Meta;
- preview estilo WhatsApp/Meta;
- destaque de categoria solicitada, categoria efetiva e recategorizacao quando disponivel.

Modelos inativos localmente permanecem no historico, mas nao ficam disponiveis para campanhas ou envio pelo Inbox.

## Mensagens prontas

Mensagens prontas sao textos operacionais configurados por tenant. Elas nao sao modelos Meta e nao devem ser apresentadas como equivalentes a template aprovado.

O fluxo atual permite:

- gestao por ADMIN/SUPERVISOR;
- listagem apenas de mensagens ativas para agentes;
- busca e insercao no campo do Inbox;
- envio explicito apenas quando a janela do canal permitir;
- bloqueio quando a conversa estiver fechada, anonima, removida da operacao, em opt-out ou em canal incompatavel.

Quando a assinatura do atendente esta ativa em `TenantOperationalConfig.config.agentSignature`, o texto enviado ao cliente inclui o nome profissional do operador no inicio da mensagem pronta. O conteudo armazenado da mensagem pronta nao e alterado.

## Opt-out e bloqueio de envio ativo

O controle operacional de opt-out usa `Event` como registro auditavel:

- `contact.opt_out.recorded` para bloqueio ativo;
- `contact.opt_out.revoked` para liberacao operacional;
- `campaign.recipient.opt_out_blocked` quando campanha bloqueia destinatario.

O bloqueio impede campanhas, modelos e envios iniciados pela empresa. Ele nao equivale a anonimizacao e nao remove historico.

CRA/Demo opt-out gate, 2026-09-16: CURRENT ACTIVE CONTRACT FRONT / OWNER GATE
READY / NO MUTATION. Auditoria de codigo e producao confirmou que o estado
canonico e `Event` por `clientId` + `waIdCanonical`; campanhas bloqueiam antes
de chamada Meta, Inbox template/manual ativo e respostas prontas tambem bloqueiam
opt-out ativo, CRM expõe `activeOptOut` e exports de campanha mostram `opt_out`.
Reversao existe via evento `contact.opt_out.revoked`. Demo read-back: `data_exame`
approved; `atualizacao_protocolo` e `lembrete_vencimento_anuidade` Utility
`PENDING` na Meta; B `****6787` recomendado para o E2E controlado; A `****9614`
deve ser preservado por ser caso historico de reconciliacao. Proximo passo
requer aprovacao explicita do owner para criar opt-out canonico, rodar uma
campanha bloqueada com Meta calls 0 e opcionalmente reverter.

CRA/Demo opt-out E2E execution, 2026-09-16: COMPLETED / DEMO PRODUCT CAPABILITY
VALIDATED. Owner autorizou apenas B `****6787`. `recordContactOptOut` criou
`contact.opt_out.recorded` `88361d0f-89df-41fc-852b-ce84cbb43cc4`; campanha
`d260bdc6-326f-4487-8d15-21c2a98dd741` bloqueou antes da Meta com
`campaign.recipient.opt_out_blocked` `80d6ca1d-94f2-4465-81b7-74888c1d0edc`,
`blockedCount=1`, `sentCount=0`, Meta calls=0, mensagens reais=0, outbound=0 e
billing=0. `revokeContactOptOut` criou `contact.opt_out.revoked`
`a5b58132-79fe-49dd-8aff-49fb78bf4566`, restaurando B elegivel e preservando o
  historico. A `****9614` ficou intocado.

CRA/Demo reports/exports/billing Phase E, 2026-09-16: COMPLETED FOR DEMO
PRODUCT CAPABILITY / CRA ACCEPTANCE STILL SEPARATE. No send, opt-out mutation
or ledger mutation occurred. Product routes audited include campaign CSV export,
operational reports with CSV and formatted PDF/print path, Meta usage report
CSV and active-message billing report CSV. Production read-only evidence
confirmed A `failed`/reconciled with one billing event, B `completed`/delivered
with one billing event, and opt-out blocked with zero outbound/billing. CRA and
Demo both have `campaigns`/`reports` enabled. Native XLSX is not claimed; CSV or
open-equivalent satisfies the clarified contract path. CRA final BRL contract
unit and CRA customer package remain pending. Next front: CRM import/upsert/
report with optional `Situacao no CRM`.

## LGPD e anonimizacao

Anonimizacao nao e hard delete. Ela remove dados pessoais da operacao visivel, minimiza conteudo e impede reidratacao automatica. O CRM oculta registros anonimizados por padrao e campanhas bloqueiam esses contatos com motivo `anonymized_contact`.

Inbound e upserts multicanal possuem guarda para nao restaurar dados antigos de identidades anonimizadas. Eventos de seguranca e privacidade usam payload sanitizado.

A anonimizacao por titular, OWNER PASS / LOCAL VALIDATED / CLEAN DELIVERY DEPLOYED / PRODUCTION HEALTH VALIDATED,
expande a operacao para casos sem conversa: o operador ADMIN seleciona um
titular canonico do CRM por Contact ou Lead-only, revisa a previa de impacto e confirma
`ANONIMIZAR TITULAR`. A orquestracao cobre Contact, ContactChannelIdentity,
Lead, LeadNote, conversas relacionadas, runtime state, mensagens/eventos
operacionais e preserva historico apenas de forma minimizada.

Atualizacao P1 de 2026-09-21: a execucao real de anonimizacao por titular em
producao deve ficar suspensa ate deploy da correcao de atomicidade. O incidente
Demo `****6787` mostrou mutacao parcial quando a conversa foi anonimizada antes
da transacao do titular e a etapa de CCI falhou por colisao de
`externalUserHash`. A correcao local preparada move toda a mutacao DB do titular
para uma unica transacao Prisma, usa hash anonimo deterministico por CCI e deixa
cleanup de runtime apenas apos commit. Preview/busca seguem disponiveis; nenhum
repair real de `****6787` foi executado neste lote local.

A mesma correcao local inclui desvinculacao de relacionamento com campanhas:
`campaign.seed.saved` preserva a campanha e agregados, mas remove do seed
privado apenas os `leadIds`, destinatario, `recipientRefs` e componentes do
titular anonimizado. Destinatarios nao relacionados permanecem. Eventos de
bloqueio de importacao por destinatario tambem perdem o recipient bruto quando
for o titular. Isso impede que um re-cadastro do mesmo telefone volte a exibir
campanhas historicas daquele titular.

Lista operacional de CRM e descoberta de Privacidade sao superficies distintas:
contatos com `operationallyExcludedAt` podem ficar fora da operacao normal, mas
continuam localizaveis em Privacidade para previa/anonymizacao enquanto o grafo
ainda for identificavel. Reentrada cria/usa novo ciclo operacional e nao
desanonimiza historico previamente minimizado.

## Ledger e controle de custo Meta

O produto possui base de controle estimativo de uso Meta:

- ledger por outbound em `OutboundMessage`;
- eventos `meta.usage.estimated` e `meta.usage.updated`;
- resumo mensal por tenant;
- thresholds/alertas por politica configurada;
- preview de custo antes de campanha ou envio de modelo no Inbox;
- relatorio mensal JSON/CSV agregado e sanitizado.

O relatorio e estimativo e nao substitui demonstrativo oficial da Meta.

## Relatorios e evidencias

Superficies atuais:

- exportacao CSV de campanhas;
- workspace `/app/reports` organizado em abas internas de visao geral, conversas, SLA, atendentes, acessos/sessoes e exportacoes, mantendo filtros globais separados dos filtros locais de sessoes;
- impressao/PDF gerencial em `/app/reports`, com cabecalho, filtros aplicados, resumo executivo, conversas, SLA, atendentes e resumo de acessos/sessoes, preservando CSV como exportacao detalhada;
- relatorio `Acessos/Sessoes` baseado em `AppAuthSession`, com filtros por periodo, usuario, perfil, status e export CSV sanitizado;
- relatorio de atividade dos atendentes baseado em mensagens outbound humanas com autoria persistida no momento do envio;
- relatorio de conversas atribuidas por atendente baseado em distribuicao operacional de `ConversationRuntimeState`/`ConversationAssignment`;
- relatorio de uso Meta mensal JSON/CSV;
- eventos auditaveis de campanhas, templates, opt-out, ledger e privacidade;
- read models operacionais de CRM e Inbox.

`Acessos/Sessoes` e auditoria operacional de autenticacao. Nao e controle de ponto, jornada ou presenca laboral. A fonte primaria e `AppAuthSession`; `Event` registra trilha complementar `auth.*` para login, logout, renovacao, expiracao e revogacoes futuras. Sessoes possuem TTL absoluto de 12 horas, sem sliding expiration. `lastSeenAt` permanece apenas como ultima atividade observada. Sessoes vencidas sem `revokedAt` podem ser exibidas como expiradas sem inventar logout.

Auth robustness P1, 2026-09-20: CLOSED / DEPLOYED / PRODUCTION HEALTH
VALIDATED em `8f15eedf4eb11dd8f0bea4f1dd79bb50cae3be9e`. Token assinado com
`clientId` malformado agora falha antes de Prisma com `401 invalid_token`; o
servidor HTTP tambem contem rejeicoes inesperadas de `handleRequest` e devolve
500 generico sem expor stack, mensagem Prisma, token, PII ou segredo. O deploy
foi backend-only, com reload apenas de `re7-whatsapp-agent`; admin-front e
web-worker foram preservados. O smoke de producao usou sessao real existente e
token claramente invalido, sem reproduzir token assinado malformado; health
`ok/db=ok`, sem `unhandledRejection` e sem `P2023` apos o smoke.

Atividade dos atendentes e distribuicao operacional sao conceitos separados. Mensagens por atendente contam apenas outbound humano com `rawPayload.actor.userId`; bot, automacao, campanha e historico sem ator ficam fora. Conversas atribuidas por atendente medem ownership/distribuicao e nao devem ser apresentadas como produtividade individual.

Fechamentos por atendente e SLA por responsavel permanecem P2 enquanto nao houver snapshot confiavel do responsavel no momento do fechamento ou do evento de SLA. O produto nao deve inferir esses indicadores a partir do responsavel atual.

Relatorios amplos de auditoria LGPD ou pack visual com screenshots devem ser tratados como proximo passo documental, nao como funcionalidade implicita.

## Distribuicao de fila

A distribuicao balanceada usa os modelos operacionais existentes: `Conversation`, `ConversationRuntimeState`, `ConversationAssignment`, usuarios ativos, setor e `TenantOperationalConfig.config.queueAssignmentPolicy`.

O padrao permanece manual quando a policy esta ausente ou desativada. A configuracao fica em `/app/settings/queue`, e deve ser ativada por tenant somente com decisao operacional, smoke controlado e acompanhamento. A UI nao aceita `clientId` arbitrario vindo do frontend.

Policies disponiveis:

- `manual`: a conversa permanece `WAITING` e compartilhada ate acao humana, como assumir ou transferir.
- `round_robin`: distribuicao sequencial entre candidatos elegiveis.
- `least_active`: seleciona o candidato elegivel com menor carga ativa.

A entrada canonica de fila cobre handoff do chatbot, transferencia de setor, devolucao para fila e handoff por inatividade quando ha destino valido e o setor esta aberto. A atribuicao automatica preserva atomicidade com lock por tenant + department; capacidade, atribuicao e ponteiro de round-robin permanecem no escopo protegido.

O modo de presenca da fila separa intencao explicita do agente e heartbeat:

- `FRESH`: exige `available=true` e heartbeat recente dentro do TTL;
- `AVAILABLE`: exige `available=true`, mas heartbeat stale isolado nao remove o
  candidato;
- `IGNORE`: nao usa disponibilidade/heartbeat como criterio de elegibilidade.

Quando a politica exige presenca (`FRESH` ou `AVAILABLE`), o candidato precisa
atender aos criterios:

- tenant correto;
- usuario ativo;
- role elegivel;
- membership ativo no department;
- abaixo da capacidade configurada;
- `available=true`, exceto em `IGNORE`.

O heartbeat de disponibilidade roda a cada 10 segundos e o TTL efetivo e 30
segundos. `available=true` representa intencao do agente receber novos
auto-assignments. Em `FRESH`, disponibilidade efetiva exige `available=true`
mais heartbeat recente. Em `AVAILABLE`, a intencao explicita continua elegivel
mesmo se a aba ficou sem heartbeat recente; `available=false` remove o agente
do pool. Se nao houver candidato, a conversa permanece `WAITING` e
compartilhada.

Disponibilidade nao remove atribuicoes existentes e nao bloqueia transferencia manual explicita autorizada. Transferencia manual continua sendo decisao humana autoritativa conforme governanca operacional.

Horarios de funcionamento continuam prevalecendo sobre disponibilidade. Um department fechado nao passa a autoatribuir apenas porque um agente esta online. Em `CLOSED + QUEUE_FOR_NEXT_OPEN`, a conversa fica em fila compartilhada, sem responsavel, aguardando proximo expediente ou acao operacional. Nao existe rebalance automatico geral de backlog na abertura.

Incidente SECULT-PE de 2026-08-31: a auditoria de 41 atribuicoes automaticas
nao confirmou bug de algoritmo. A distribuicao observada refletiu elegibilidade,
setor, presenca online e limite de atendimentos ativos, em um dia com alteracao
operacional de `least_active` para `round_robin` e intervalo manual sem
autoatribuicao. Mesmo quando o escopo esta como "Organizacao inteira", a
distribuicao continua respeitando o setor da conversa quando ja existe
direcionamento previo. O ajuste requerido foi de clareza UX e foi deployado em
`c91671e9`.

Validacao organica SECULT em 2026-09-10, apos aplicar `presenceMode=AVAILABLE`
em 2026-09-09 11:38:31 -03, observou 30 auto-assignments, 11 agentes distintos,
Maria Helena participando com 1 auto-assignment, `no_eligible=0` e zero exclusoes
por heartbeat stale isolado. A elegibilidade funcional esta REAL VALIDATED. A
distribuicao/fairness permanece em WATCH para volume maior; nao ha bug de
algoritmo comprovado.

## Presenca da equipe

O dashboard `/app/dashboard` possui a secao "Presenca da equipe", baseada em
`AgentAvailability`.

Contrato:

- online efetivo: `available=true` com heartbeat fresco;
- TTL operacional: 30000ms;
- ADMIN ve o tenant inteiro;
- SUPERVISOR ve usuarios dos seus departamentos;
- AGENT nao acessa a secao;
- exibe online/offline, departamento, conversas ativas e contadores de resumo;
- carga ativa considera conversas `IN_PROGRESS` e `WAITING` atribuidas;
- refresh reaproveita o dashboard existente de 15s e realtime, sem novo polling
  de alta frequencia.

Status: DEPLOYED em `adaf1b4f`; smoke visual humano ainda pendente se nao houver
evidencia explicita.

## Chatbot, consentimento e inatividade

### Guided Builder

Em 2026-09-10 o patch local de Guided Builder foi reconciliado sobre o HEAD
canonico `fec3a489` em worktree isolado. O objetivo do recurso e oferecer um
wizard operacional para usuarios de negocio sobre a mesma definicao real de
fluxo usada pelo modo avancado.

Contrato validado em codigo:

- Guided e Advanced compartilham `ChatbotFlow.definition` como unica fonte de
  verdade.
- O modo guiado nao cria modelo paralelo, schema novo ou campos persistidos de
  wizard.
- Objetivos suportados nesta reconciliacao: handoff humano direto, menu,
  consentimento, captura, mensagem de texto e modo personalizado/avancado.
- O resolvedor de proxima acao aponta lacunas estruturais sem reescrever flows
  existentes ao abrir o editor.
- Syer-style direct handoff e CRA-style complex consent/menu flow sao
  interpretados sem reset obrigatorio e com metadados avancados preservados.

Validacao tecnica: `ChatbotFlowBuilder.test.ts` 22/22 PASS, frontend build PASS
e `git diff --check` PASS.

Smoke local de 2026-09-10: desktop, tablet e mobile foram capturados com um
harness temporario nao versionado renderizando o `ChatbotFlowBuilder` real. O
fluxo novo, o handoff direto estilo Syer e o fluxo complexo consentimento/menu
estilo CRA ficaram visualmente coerentes, sem reset destrutivo e sem corrupcao
da definicao avancada.

Smoke autenticado de rotas reais em 2026-09-10: em worktree isolado com banco
Postgres efemero, 58 migrations aplicadas, `demo:seed`, sessao real obtida por
`/auth/login` e token admin local, `/app/chatbot` carregou no App shell real e
`/admin/tenants/demo-prefeitura/chatbot` carregou no Admin shell real. O teste
exercitou abertura de fluxo existente, alternancia Guided/Advanced sobre o
mesmo JSON, edicao Advanced -> Guided, edicao Guided -> Advanced, save local e
reload persistido. Temas claro/escuro, desktop/tablet/mobile e foco por teclado
passaram sem overflow horizontal.

Status: REAL VALIDATED em smoke autenticado local e publicado pelo rollout
frontend-only encerrado em `9b5bdb34`. Sem mutation de flow em producao e sem
tenant real alterado pela validacao.

Atualizacao local de 2026-09-11: o redesign evoluiu para Guided Builder 2.1
business-first. A criacao de novo fluxo agora parte de modelos de negocio
(`atendimento institucional com menu`, `encaminhamento direto`, `coleta antes
do atendimento`, `mensagem informativa` ou `avancado`), faz perguntas curtas,
permite submenus em estrutura CRA-like, gera uma definicao real de
`ChatbotFlow.definition`, apresenta preview/checklist e aplica ao rascunho
apenas por acao explicita. Submenus sao gerados como nodes reais `type=menu`,
com navegacao opcional `9 - Voltar ao Menu Anterior` e
`0 - Voltar ao Menu Principal`, sem criar tipo novo de runtime.

O passo de horario foi restringido ao contrato atualmente suportado: horario
humano pertence ao cadastro de departamentos; sem horario salvo, a regra de
dominio atual continua `NO_SCHEDULE`/aberto. "Aplicar ao rascunho" deixa claro
que nao salva no backend e agora mostra feedback de sucesso, erro ou ausencia
de alteracao. Fluxos existentes nao sao reconstruidos ao abrir: o modo guiado
mostra landing separada com Revisar jornada, Editar etapas simples e Abrir modo
avancado. A edicao simples lista menus/submenus hierarquicamente e permite abrir
opcoes como Registro sem expor JSON. O estado visual de Assistente guiado versus
Modo avancado e exclusivo, e o rascunho de novo fluxo e limpo apos criacao
bem-sucedida em `/app` e `/admin`.

O patch preserva `ChatbotFlow.definition` como unica fonte de verdade, nao cria
shadow model, nao altera runtime, schema, migration, save payload ou semantica
de flows. Status: GUIDED BUILDER 2.1 / DEPLOYED / PRODUCTION READ-ONLY
VALIDATED. Validacao tecnica local: `ChatbotFlowBuilder.test.ts` 32/32 PASS,
frontend build PASS e `git diff --check` PASS.

Incidente P1 de 2026-09-11: a tentativa de criar um segundo fluxo guiado para
Syer Rodrigues podia apresentar `JSON invalido` no cliente. A mensagem vinha do
parse local do rascunho antes do backend. A auditoria apontou estado transiente
stale do builder de novo fluxo depois de uma criacao anterior, nao problema no
tenant real ou na API. O fix mantem a mesma definicao `ChatbotFlow.definition`,
cria defaults frescos para cada sessao do wizard e remonta o builder de novo
fluxo apos `create` bem-sucedido em `/app` e `/admin`. Fixture Syer-like local
validou primeira, segunda e terceira criacoes sequenciais com JSON valido.
Validacao real em 2026-09-11 na producao `96220ea4`: a UI admin do tenant
`syer-rodrigues` criou dois fluxos guiados de teste inativos em sequencia, sem
`JSON invalido`; a abertura de um terceiro novo fluxo iniciou limpa e sem
salvar. O fluxo ativo real preservou o mesmo hash de definition. Status: REAL
VALIDATED / CLOSED.

Incidente P1 de 2026-09-11: a criacao de um novo fluxo podia enviar
`entryPoint=true` por default a partir dos formularios de `/app/chatbot` e
`/admin/tenants/:tenantId/chatbot`, fazendo o backend executar corretamente uma
troca explicita de entrada principal que nao havia sido pretendida pelo
operador. O contrato do produto agora e: novo fluxo nasce sem ser entrada
principal; promover um fluxo para entrada principal exige acao explicita. O
backend preserva a semantica de `entryPoint=true` como troca intencional, e a
UI passa a usar default compartilhado `false` tanto na abertura quanto no reset
apos criacao. Nao ha hardcode de tenant, schema, migration ou mudanca de
runtime.

Auditoria `CHATBOT FLOW ACTIVE vs ENTRYPOINT SEMANTICS` de 2026-09-15: `Ativo`
significa elegivel a execucao por id explicito ou continuidade de runtime;
`Entrada principal` significa flow padrao para novas conversas. Active
non-entrypoint e executavel hoje via Support Hub (`supportChannel.chatbotFlowId`)
e runtime existente `flow=chatbot:<id>`, mas nao ha seletor geral por campanha,
departamento, intent, link, QR/referral, Webchat embed ou flow-to-flow. Resultado:
P2 UX CLARIFICATION + P2 DOMAIN HARDENING; sem P1 porque producao nao mostrou
entrypoint duplicado nem inactive entrypoint.

Incidente de processo em 2026-09-11: o primeiro resultado local do Guided
Builder 2.2 foi invalidado. O HEAD de producao estava atual; o problema foi a
selecao local de worktree/bundle/servidor, contaminada por uma linha antiga e
divergente do Guided Builder aprovado em producao. O owner viu UI antiga no
ambiente local, logo aquele resultado deixou de ser evidencia valida para
produto. Nao houve impacto em producao porque nada foi commitado, enviado ou
deployado a partir dessa baseline incorreta.

Regra adotada: trabalho de UX deve primeiro reproduzir localmente a versao de
producao aprovada antes de receber novos deltas. A reconstrucao correta foi
feita em `/tmp/re7-guided-22-current`, a partir do HEAD canonico
`bf5f1d76`, com backend local isolado, frontend em `3022`, `demo:seed` e
login real. Para evitar CORS em desenvolvimento, o frontend deve usar
`/agent-api` relativo via rewrite local. O 2.2 foi reaplicado de forma
cirurgica sobre essa base, adicionando
cancelamento/exclusao de opcoes do wizard, cancelamento de submenu em criacao,
confirmacao destrutiva, limpeza de submenus aninhados ao trocar destino, botao
inferior "Voltar ao nivel anterior", tons por nivel, copy unificada de
encaminhamento humano, fluxo Setor -> Fila condicional e explicacoes para
mensagem versus pergunta. A complementacao 2.2 tambem cobre exclusao de submenu
simples ja criado, preservacao de estruturas compartilhadas/avancadas no modo
avancado e texto livre com emoji digitado pelo usuario no wizard, preview e JSON
gerado. Validacao tecnica: `ChatbotFlowBuilder.test.ts` 37/37 PASS, frontend
build PASS e `git diff --check` PASS. Status:
GUIDED BUILDER 2.2 / DEPLOYED / PRODUCT OWNER REAL VALIDATION. A entrega
frontend-only foi publicada em producao no commit `db34d83c`, sem backend,
worker, schema ou migration. Permanece em PRODUCT OWNER REAL VALIDATION ate os
testes reais em producao.

Guided Builder 2.3 entrou em refinamento local em 2026-09-11 a partir do
feedback real do owner. O foco e simplificar a criacao de fluxo e tornar a
edicao de menus mais controlada: o wizard nao pergunta mais "Ativo" ou
"Entrada principal" na criacao; o modelo institucional com menu comeca por
consentimento; opcoes e destinos sao editados ja na primeira tela do menu
principal; os submenus usam o mesmo padrao de linhas expansivas com uma opcao
aberta por vez; os niveis recebem bordas/tons e marcadores hierarquicos; os
resultados de acao usam toast global; e a UI restaura foco/scroll ao voltar,
cancelar ou remover itens. Status: GUIDED BUILDER 2.3 / DEPLOYED / OWNER
APPROVED LOCAL / PRODUCTION REAL VALIDATION. A aprovacao local final do owner
foi aplicada sobre worktree limpa baseada no HEAD canonico atual antes de
commit/push/deploy; a validacao real em producao permanece aberta ate exercicio
humano em tenant real apos deploy.
Sem mudanca de ChatbotFlow.definition, backend, worker, schema ou migration.

Recuperacao/integridade 2026-09-12: a worktree temporaria em `/tmp` foi removida
apos reboot da maquina local, e a primeira reaplicacao pos-reboot exibiu uma
versao antiga. A recuperacao correta foi reconstruida a partir dos patches da
sessao Codex, sem mutar producao, sem commit, sem push e sem deploy. A checagem
de integridade comparou a versao local recuperada contra o HEAD canonico de
producao/origin antes da entrega final aprovada.
O ajuste final aprovado pelo owner remove a abertura automatica do proximo item
apos exclusao de opcao, submenu/linha aninhada ou registro editavel; apos a
remocao, os irmaos permanecem colapsados e o foco retorna ao contexto pai ou a
secao atual. A entrega final e frontend-only, sem tenant hardcode, migration,
schema ou reload de backend/worker.

O flow SECULT/Demo homologado usa:

```json
{
  "inactivityPolicy": {
    "action": "HANDOFF",
    "timeoutMinutes": 60,
    "resetAfterMinutes": 1440
  }
}
```

A precedencia funcional e:

- consentimento pendente ou invalido: handoff por inatividade e ignorado, a conversa permanece em BOT e o skip registra `reason=consent_pending`.
- consentimento recusado: caminho terminal, sem handoff automatico.
- consentimento aceito com destino aberto: handoff humano canonico e balancer preservados.
- consentimento aceito com setor fechado e `QUEUE_FOR_NEXT_OPEN`: `WAITING` compartilhado com department/queue validos, sem autoassign enquanto fechado.
- sem destino valido: nao criar estado `WAITING`/`HUMAN`/`ACTIVE` invalido; permanece BOT e registra handoff skipped.

Auditoria/E2E local de 2026-09-14 sobre lifecycle de inatividade:
a interpretacao anterior de `WAITING_FOR_CUSTOMER 60m` como auto-close de
atendimento humano foi SUPERSEDED / NOT PRODUCT REQUIREMENT. Conversas HUMAN
continuam sob controle humano e nao devem expirar por inatividade generica. A
frente correta e abandono de automacao iniciada pelo cidadao, documentada em
`docs/saas/INACTIVITY_AUTOMATION_LIFECYCLE_AUDIT_2026-09-14.md`. Em contexto
BOT, `WAITING_USER` significa automacao aguardando input do usuario; o runtime
persistido possui `chatbotRuntime.lastInteractionAt`, reset inline por
`resetAfterMinutes` no proximo inbound e handoff de inatividade por
`timeoutMinutes/action=HANDOFF` no `chatbotInactivityProcessor`. O E2E local
confirmou reset de menu/submenu/captura sem HUMAN/CLOSED, handoff unico para
HUMAN/WAITING com department/queue concretos, protocolo e posicao na fila, e
sem duplicidade na segunda varredura. Gap restante: politica de limpeza de
`flowContext` em reset stale, copy/UX de timeout e paridade provider-independent
do processor, sem criar scheduler paralelo e sem auto-close HUMAN.

## Web Session

WEB_SESSION opera com worker hospedado, auth state persistente e lifecycle tenant-scoped de `ChannelAccount`. O fluxo operacional contempla `QR_REQUIRED`, pairing, reconnect, persistencia de auth, incidentes terminais e recuperaveis, e observabilidade de disconnect com campos brutos sanitizados.

Durante pairing canonico, outbound pode ser bloqueado temporariamente. O valor anterior e preservado em `ChannelAccount.metadata.webSession.prePairingOutboundEnabled` e restaurado apos `CONNECTED` quando aplicavel. O snapshot transitorio deve ser consumido depois da restauracao bem-sucedida.

Alertas de disconnect usam exclusivamente `TenantOperationalConfig.config.webSessionAlertEmails` como fonte de destinatarios. ADMIN, SUPERVISOR, AGENT ou usuarios do app nao sao fallback. Sem recipient configurado, nenhum email e enviado, mas o incidente/log permanece registrado. Incidente terminal alerta imediatamente; incidente recuperavel usa grace de 3 minutos; reconnect antes do grace cancela o alerta; dedup garante um alerta por incidente.

Detalhes tecnicos do transporte estao em `docs/whatsapp/web-session.md`.

## Mail transacional e alertas por e-mail

O envio transacional usa camada canonica em
`apps/whatsapp-agent/src/mail/canonicalMail.ts`.

A camada canonica e dona de:

- selecao de provider;
- leitura de `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` e `SMTP_FROM`;
- TLS/secure, incluindo portas 465 e 2465;
- timeouts de transporte SMTP;
- envio por Resend HTTPS API quando `SMTP_HOST=smtp.resend.com`;
- resultado normalizado `DELIVERED`, `RETRYABLE_TRANSPORT_FAILURE` ou
  `PERMANENT_FAILURE`;
- sanitizacao de erro sem token, senha, API key ou Authorization.

Os callers de negocio continuam donos de destinatarios, assunto, corpo,
tenant/contexto, dedupe e retry:

- password reset;
- convite/first access, que reaproveita password reset;
- Web Session disconnect alert;
- template-review alert;
- PostgreSQL backup alert.

Historico preservado: password reset e convites funcionavam porque usavam o
fallback Resend HTTPS API quando o host era `smtp.resend.com`. O alerta de Web
Session falhou historicamente porque interpretava SMTP de forma independente e
tentou `smtp.resend.com:2465` sem TLS, resultando em `Greeting never received`.
Esse drift foi eliminado sem alterar templates, tokens, destinatarios ou
politicas de retry/dedupe dos casos de negocio.

## Build e worker

O processo de deploy deve seguir `docs/whatsapp-agent/ops/DEPLOY_VPS_PM2.md`.

O `re7-whatsapp-web-worker` incorpora codigo compartilhado de `apps/whatsapp-agent/src`. Quando um modulo compartilhado usado direta ou indiretamente pelo worker muda, o deploy precisa:

1. buildar `apps/whatsapp-agent`;
2. buildar `apps/whatsapp-web-worker`;
3. validar que o dist do worker esta atualizado;
4. reloadar o worker quando o artefato mudar.

Essa regra existe para evitar artefato stale em runtime, especialmente em caminhos compartilhados de fila, Web Session, chatbot e inbound.

## RBAC e multitenancy

O produto opera por tenant e capability:

- endpoints usam tenant da sessao;
- permissoes diferenciam ADMIN, SUPERVISOR e AGENT;
- capabilities controlam CRM, campanhas, templates e demais superficies;
- rotas protegidas retornam erro seguro sem sessao;
- payloads operacionais evitam expor identificadores sensiveis em listagens amplas.

Configuracao administrativa de filas:

- ADMIN: leitura e escrita.
- SUPERVISOR: leitura.
- AGENT: sem acesso administrativo.

SUPERVISOR preserva as operacoes autorizadas no Inbox e demais superficies operacionais, sem receber permissao de escrita para politica de filas.

Configuracoes delegadas ao ADMIN do tenant podem ser ajustadas via UX quando expostas pelo produto, como politica de fila, modo `manual`/`round_robin`/`least_active`, escopo, `requireOnline`, capacidade, `includeSupervisors` e politica de visibilidade do Inbox. Isso nao exige Codex, deploy ou alteracao por tenant quando a funcionalidade ja esta publicada.

Configuracoes internas de plataforma, como `TenantOperationalConfig.config.webSessionAlertEmails`, pertencem ao console interno RE7ONLINE e nao devem ser tratadas como configuracao operacional do app cliente sem decisao futura de produto.

Users Management 2.0 deployed, 2026-09-14: `/app/users` e a superficie tenant-side
canonica para gestao de usuarios. Usuarios inativos permanecem visiveis em
administracao, aparecem em `Todos` e `Inativos`, desaparecem de `Ativos`, nao
contam como assento ativo e podem ser reativados no mesmo registro quando RBAC
permite. O contador "usuarios ativos" usa a mesma semantica de enforcement:
`User.count({ clientId, isActive: true })`, com limite vindo de
`TenantOperationalConfig.config.runtimeLimits.maxActiveAppUsers`, fallback
`tenants.json.maxActiveAppUsers`, fallback final 5. Ajustes finais de owner:
regiao de filtros visualmente separada, botao explicito expandir/recolher,
coluna direita fixa para a acao expansiva, hierarquia tonal entre header e corpo
expandido, botao Salvar preenchido, e contrato de draft nao salvo: recolher,
trocar linha ou alterar filtro descarta alteracoes locais. Projecoes de lista,
filtros e assentos derivam somente do estado persistido; `userDrafts` nao pode
contaminar `Todos/Ativos/Inativos` nem contador antes de Save. Status:
owner-approved, deployed em
`5ad40c10eda77076bc2a069e432663ac2271f0a8` e production non-destructive
validated; health, `/app/users`, `/app/settings/users`, backend start e dados
read-only de usuarios por tenant passaram no smoke.

Departments Management UX 2.0 deployed, 2026-09-14: `/app/settings/departments`
mantem o contrato operacional atual de setores, horarios e excecoes, mas passa
a apresentar cada setor como linha recolhivel alinhada ao padrao aprovado em
Users Management 2.0 e Guided Builder. O estado fechado mostra somente resumo
persistido (nome, slug, ativo/inativo, horarios/excecoes); o corpo expandido
concentra edicao de nome/status, horario regular, excecoes e Save preenchido.
Um setor aberto por vez; expandir inicializa draft a partir do persistido;
recolher, trocar setor ou alterar filtros descarta edicoes nao salvas e limpa
editores internos de horario/excecao. O refinamento compartilhado com Users
Management 2.0 fixa a acao expansiva em coluna direita
`minmax(0,1fr)_auto`, permitindo quebra do resumo sem deslocar o botao circular
para baixo. Nao altera semantica de filas, roteamento, autoassign, capacidade,
presenca, Inbox visibility, RBAC, schema ou migracao. Status: owner-approved,
deployed em `5c051f83df6bc99aa998985ba93301e601e502df` e production
non-destructive validated; health, `/app/users`, `/app/settings/departments`,
estrutura right-anchor no codigo em producao e tenants representativos ACTIVE
passaram no smoke sem mutacao.

Padrao compartilhado de linhas administrativas expansivas, 2026-09-14: Guided
Builder, Users e Departments usam o padrao aprovado quando a tela pede edicao em
linha: linha fechada compacta, corpo de detalhe expansivo, controle circular de
expandir/recolher, coluna direita fixa para a acao, conteudo esquerdo podendo
quebrar linha sem deslocar o controle, header visualmente distinto do corpo, uma
linha aberta por vez quando aplicavel, recolher/trocar/filtro descartando draft
local nao salvo, e filtros/contadores globais derivados apenas do estado
persistido. O padrao nao deve ser imposto a telas sem justificativa de produto.

Regra canonica de desativacao de usuario, 2026-09-14: CLOSED / DEPLOYED /
OWNER APPROVED / PRODUCTION NON-DESTRUCTIVE VALIDATED. Um usuario nao pode ser desativado enquanto houver
conversas HUMAN operacionalmente ativas atribuidas a ele. Predicado aplicado:
mesmo tenant, `ConversationRuntimeState.assignedUserId` igual ao usuario,
`closedAt=null`, `status IN (WAITING, IN_PROGRESS)` e `mode` nulo ou diferente
de `BOT`. `WAITING` sem atribuicao, `CLOSED`, outro tenant e BOT nao bloqueiam.
Antes de aceitar a desativacao, os atendimentos ativos atribuidos devem ser
transferidos/reatribuidos a outro atendente elegivel ou encerrados corretamente
pelo ciclo existente. A propria desativacao nao fecha, transfere, remove
atribuicao, troca fila ou altera estado de conversa silenciosamente; bloqueia
com `user_has_active_conversations` e mensagem acionavel. Backend guard aplicado
em `/app/users/:id` e `/admin/users/:id`; UI tenant-side mostra a mensagem
especifica e preserva filtros/contador/usuario ativo quando a tentativa e
rejeitada. Backend e autoritativo e a validacao frontend e apenas feedback de
UX. Validacao local owner-approved: backend focado 1/1 PASS, frontend 7/7 PASS,
builds PASS; suite completa `campaignsFeatureRoutes` 109/110 PASS com timeout
pre-existente nao relacionado em `meta inbound clears active chatbot runtime
when persisted flow is inactive`, mantido como WATCH separado. Sem
schema/migration. Entrega em producao FF-only em
`c40c44dc205b2324a9197322334141c5e7f079f0`, com backup PostgreSQL persistente
`20260914-175614.dump`, reload apenas de `re7-whatsapp-agent` e
`re7-admin-front`, worker preservado, health ok/db ok, `/app/users` 200,
`/app/settings/users` 200, API sem auth 401 e tenants representativos ACTIVE em
consulta somente leitura.

## Marcos recentes confirmados

Commits relevantes do baseline homologado:

- `67bc092fa587fa599262d927396eac7c3e50a605`: worker mailer runtime dependency for Web Session alerts.
- `afdcfb94a5cfc4fcbb98bd78b57d5f3215009799`: Web Session disconnect observability.
- `2f82db80092427c7dbb5c82192eb18da3de2f84f`: inactivity handoff hardening.
- `0bc31bad837af8f09e5af16282908205da4d7a17`: consent precedence in inactivity handoff.
- `3f0f4819585d340e6359d365d853e0158abbe9ca`: read-state/cache cleanup.
- `42eef3209b27c060ea6f2334ca1e6a542a4eeba6`: Inbox visibility policy.
- `96e8c8646e95035a743db526e40b57fdef0de36b`: queue balancer volatile presence lookup.
- `4ecaf12aa2c6f8d7da86b6807fc756606e12541b`: agent availability heartbeat lifecycle.
- `893ba7d876b195d0c93fce8dbf1932eb355e0605`: agent availability heartbeat for queue balancing.
- `1ed1b2d37ab2e8bd57fbc856ed1f48fca1afacdb`: atomic balanced queue assignment.

## Limites conhecidos

- Ledger Meta ainda e estimativo e nao conciliacao financeira definitiva.
- Handoff humano deve resolver fila concreta. Incidente Syer `****9614`
  comprovou que `departmentId` com `queueId=null` ativa handoff no runtime, mas
  nao projeta na Inbox humana por violar o invariant setor+fila. A correcao
  local resolve a unica fila existente no runtime e faz o Guided Builder exigir
  fila concreta, bloqueando setores sem fila ou ambiguidade de multiplas filas.
  Em 2026-09-12, o atendimento pre-fix `****9614` foi fechado como incidente:
  backup fresco, precondicoes conferidas, mutacao unica de
  `ConversationRuntimeState.queueId` para `Fila Geral`, sem alterar mensagens,
  historico, protocolo, ciclo, responsavel ou fechamento. A Inbox passou a
  projetar o atendimento exatamente uma vez pela regra canonica.
- Guided Builder 2.4 local reforca essa regra no UX: o usuario escolhe o setor
  como conceito de negocio; a fila operacional fica oculta quando o setor possui
  exatamente uma fila e e resolvida internamente para `queueId` concreto. Setor
  sem fila bloqueia com "Este setor ainda nao esta preparado para receber
  atendimentos."; somente setor com 2+ filas mostra seletor "Fila" como excecao
  operacional. Auditoria local encontrou 24 setores sem fila, 56 com uma fila e
  5 com multiplas filas; os 5 casos foram `default` interno/Re7 Demo e fixtures
  automatizadas `campaigns-feature-*`, sem uso ativo em flow/runtime que dependa
  de multiplas filas no mesmo setor. Fluxos existentes com `queueId=null`
  recebem aviso sem mutacao automatica.
- Perguntas guiadas exigem pergunta, tipo de resposta e proximo comportamento
  definido apos a resposta capturada. O limite local e 3 perguntas consecutivas.
  Branching condicional por valor capturado permanece PRODUCT GAP: o runtime
  atual suporta captura sequencial, mas nao predicados por resposta.
- Micro-ajuste final de owner validation: apos escolher "Encaminhar para
  atendimento humano", o Guided Builder nao mostra mais o bloco redundante
  "Escolha o setor que recebera o atendimento."; o campo `Setor` aparece
  diretamente. Status final apos entrega: CLOSED / DEPLOYED / OWNER APPROVED
  LOCAL / PRODUCTION NON-DESTRUCTIVE VALIDATED em
  `ca34e123c72de2e96f0dcff27b4e17f29e5b630b`. A entrega foi frontend-only,
  com 54/54 testes PASS, build PASS, sem schema/migration, sem reload de
  backend/worker, rotas saudaveis e hashes de `ChatbotFlow.definition`
  preservados no smoke de producao. Backlog da entrega: HANDOFF QUEUE CONTRACT
  = CLOSED / REAL VALIDATED; QUESTION CONDITIONAL BRANCHING = PRODUCT GAP /
  OPEN; SYER ****9614 = CLOSED.
- Current execution backlog, 2026-09-15: P0 = none. P1 ativo = none.
  Watch/external ops: abandoned automation / BOT flow lifecycle com E2E local
  validado e decisoes de produto ainda abertas; Demo channel continuity
  separado por transporte. O incidente Meta externo de 2026-09-14 permanece
  preservado como historico, mas a evidencia atual de producao para
  `demo-converta` e `meta:readiness` `WARN` sem `FAIL`/`WAITING_EXTERNAL`;
  Web Session `****5328` esta `CONNECTED` apos reemparelhamento em
  2026-09-14 16:31Z, com QR_REQUIRED historico em 2026-09-13 22:40:23Z por
  `auth_clear`. CRA/SECULT business-hours audit fechado
  como docs-only: mecanismo runtime por departamento ja existe; SECULT preserva
  `OPEN`/`CLOSED` com `QUEUE_FOR_NEXT_OPEN`; em 2026-09-15 CRA foi configurado
  operacionalmente sem patch de runtime: timezone `America/Sao_Paulo`, 6/6
  departamentos Mon-Fri 09:00-17:00, fins de semana fechados,
  `QUEUE_FOR_NEXT_OPEN` preservado, resolver e fluxo validado dentro/fora de
  expediente. Em 2026-09-15 foi criada a matriz contratual canonica CRA-PR em
  `docs/bids/2026/cra-pr/CONTRACT_ADHERENCE_MATRIX.md`: 52 requisitos mapeados,
  14 CLOSED / REAL VALIDATED, 1 CLOSED / CUSTOMER VALIDATED, 15 IMPLEMENTED /
  NEEDS CRA VALIDATION, 5 CONFIG PENDING, 1 CUSTOMER ACTION PENDING, 4 EXTERNAL
  META DEPENDENCY, 1 PRODUCT GAP, 9 DOCUMENTATION/EVIDENCE GAP e 2 NOT REQUIRED.
  A matriz confirma que active flow visibility e business hours nao devem ser
  reabertos; lacunas principais sao canais IG/FB/Webchat, Utility
  templates/campaigns em aceite contratual aberto, opt-out,
  reporting/billing e pacote documental de aceite.
  P2 ativo = branching condicional por resposta
  capturada, melhorias de contexto em relatorios, semantica de unlink/remocao
  Meta Cloud, hardening de suporte interno auditado, cross-provider inactivity
  handoff hardening, Guided Builder lifecycle-policy exposure e resumo completo
  da revisao final guiada. Performance de Inbox/CPU permanece WATCH, nao frente
  ativa.
- CRA admin chatbot settings, 2026-09-13: incidente operacional identificado
  como dependencia indevida de `.data/tenants.json` em
  `/admin/chatbot/settings`. CRA esta no banco como `Client` DB-backed; a rota
  resolve settings por `TenantOperationalConfig`/defaults com tenant efetivo em
  memoria, sem criar entrada artificial em `tenants.json`, preservando suporte
  legado. Validacao em producao no commit
  `69bedc38396b8f837a236b0af4a5446397919403`: settings 200, resources 6
  departamentos / 6 filas, flows 1, health ok/db ok e `tenants.json` ausente.
  A UI admin hidrata flows/recursos mesmo se settings falhar parcialmente e nao
  mantem badge "Carregando" depois do fim do loading. Status: CLOSED / REAL
  VALIDATED.
- Guided Builder review UX backlog, 2026-09-13: a etapa final de revisao ainda
  pode resumir apenas o caminho humano destacado em fluxos com varias opcoes.
  O item aberto e exibir todas as opcoes principais, caminhos de submenu e
  destinos de mensagem/pergunta/handoff em uma jornada legivel, preservando
  estruturas avancadas sem fingir interpretacao completa. Sem mudar runtime ou
  formato de `ChatbotFlow.definition` antes de novo contrato de UX.
- CRA active flow tenant visibility audit, 2026-09-15: owner report says the
  active CRA production flow executes correctly but is not visible in
  `/app/chatbot` for tenant admins. Code audit found no Guided/Advanced,
  active, entrypoint, owner or source filter in the tenant app list; both admin
  and app list by `clientId`, while `/app` additionally enforces app feature
  `chatbot` and ADMIN/SUPERVISOR access. Production evidence proved CRA
  `features.chatbot=true`, 8 active CRA ADMIN/SUPERVISOR users, one active
  entrypoint flow `cmtkhhxtq002p4spns3fp0yux`, runtime entrypoint resolution and
  admin API all aligned to definition hash
  `d7026abdbcfd00e05cb6b9121bfad1f63fab7a9506e2b88e8f8d5b701ad7bac4`. Real CRA
  ADMIN Eduardo reproduced the UI absence; nginx shows Eduardo's
  `/agent-api/app/chatbot/flows` request returned 200 while
  `/agent-api/app/chatbot/settings` returned 404. Root cause: app page
  `Promise.all()` aborts flow hydration when settings 404s, and the app
  settings route still required legacy `.data/tenants.json` for CRA even though
  CRA is DB-backed. Runtime commit `363ce3ab` reuses the admin DB-backed
  settings fallback for the tenant app settings route and makes `/app/chatbot`
  hydrate flows/settings/resources independently, so a settings failure is shown
  as settings-specific state instead of hiding the returned flow list. Status:
  CLOSED / DEPLOYED / CUSTOMER VALIDATED.
  Production delivery on 2026-09-15 used persistent PostgreSQL backup
  `pre-cra-flow-visibility-20260915-133330.dump`, reloaded only
  `re7-admin-front` and `re7-whatsapp-agent`, preserved
  `re7-whatsapp-web-worker`, and preserved the CRA flow definition hash
  `d7026abdbcfd00e05cb6b9121bfad1f63fab7a9506e2b88e8f8d5b701ad7bac4`.
  Customer CRA ADMIN Eduardo confirmed after the production fix that the active
  flow is visible in tenant `/app/chatbot` and can be opened from `Fluxos
  cadastrados`. Validation levels: LOCAL OWNER PASS, SERVER-SIDE PRODUCTION
  PASS, CUSTOMER CRA ADMIN PASS. Do not recreate or mutate the CRA flow.
- Suporte interno multitenant ja existe com grant temporario, sessao de suporte,
  auditoria e banner de modo suporte; evolucoes futuras devem focar menor
  privilegio/evidencia operacional. Usuarios x departamentos M2M tambem ja
  existe via `UserDepartmentMembership`, UI de usuarios e uso no RBAC/assignment.
- Bloqueio automatico por limite de consumo existe como helper, mas nao esta conectado aos fluxos reais.
- Relatorio administrativo amplo de anonimizados permanece P2.
- Alguns identificadores tecnicos ainda existem por exigencia de modelo atual, com minimizacao operacional.
- Evidencias visuais para licitacoes ainda precisam ser capturadas quando houver roteiro e ambiente controlado.
- Disponibilidade de canal depende de configuracao, permissao e revisao do provedor.

## Proximos passos recomendados

- Auditar Dashboard Syer com trace de API/browser antes de classificar como bug.
- Endurecer abandoned automation / BOT flow lifecycle sem auto-close HUMAN,
  agora partindo do E2E local validado e das decisoes abertas sobre
  `flowContext`, copy/UX de timeout e paridade de providers.
- Monitorar CRA apos configuracao operacional de horarios de departamento
  validada em producao, sem tratar como P1 de runtime.
- Especificar branching condicional por resposta capturada como novo recurso de
  runtime, nao como correcao do Guided Builder.
- Criar pacote de screenshots sanitizados para licitacoes quando houver roteiro.
- Planejar conciliacao financeira Meta quando houver fonte oficial automatizada.
- Consolidar matriz de evidencias por edital antes de cada proposta.

## Canonical Identity P1 delivery - 2026-09-17

Meta inbound/capture and campaign CRM bootstrap now reuse the established
tenant-scoped canonical resolver. A clean delivery passed 119 focused tests,
backend build, focused lint and diff validation. Status: DEPLOYED / PRODUCTION
NON-DESTRUCTIVE VALIDATED at production HEAD `ed329ec8` on 2026-09-17. The
production backend build, targeted agent reload, health/DB and read-only
module/route checks passed. Schema and migrations are unchanged; exact pre/post
snapshots prove no Demo `****6787` Contact/Lead record was modified. A real
post-deploy identity event remains unexercised.

Operational Queue is CLOSED / DEPLOYED / PRODUCTION RECONCILED / SMOKE PASS.
The nullable explicit relation, composite
tenant/department FK, atomic lifecycle and Department-only Campaign/Guided UX
passed local focused validation and production rollout on 2026-09-18. The
complete production reconciliation of 54 departments is recorded in
`docs/saas/OPERATIONAL_QUEUE_PRODUCTION_MAPPING_AUDIT_2026-09-17.md`: 34
exactly-one mappings are auto-safe, 8 inactive rows are null-allowed, 7
multi-queue mappings are resolved by audit and the final 5 active blockers have
owner decisions. Production advanced by FF-only to
`b166bcac8bf443d34ba7f3821016b6bae8069728`; backup
`/opt/re7online/backups/operational-queue-rollout-20260918-104054` passed;
migration `20260917213000_add_department_operational_queue` applied; first
reconciliation resolved 44 explicit mappings and 2 owner-approved internal
queues; second run was idempotent. Post-verify: 54 departments, 44 active
resolved, 0 active unresolved, 8 inactive null-allowed, 2 inactive with queue
and 0 cross-tenant/department links. Backend/frontend builds, targeted PM2
reload and HTTP smoke passed. The owner decision package is
`docs/saas/OPERATIONAL_QUEUE_OWNER_DECISION_PACKAGE_2026-09-17.md`. Campaign UX
remains owner PASS; `****6787` repair remains separate.

Campaign UX / result truth integration (2026-09-18): INTEGRATED LOCAL / OWNER
REVALIDATION PENDING / NO DEPLOY. The approved Campaign UX delta has been
recovered onto the current Operational Queue baseline. Customer campaign
destination remains Department-only; Queue is resolved internally from
`Department.operationalQueueId`. Campaigns and the Inbox template shortcut no
longer expose price/cost/tariff/Meta-rate estimates to the customer UX.
Lifecycle tabs now map to persisted states (`Enviando`, `Agendadas`,
`Concluídas`), the progress/detail modal observes backend state and can be
closed without cancelling execution, and recipient detail surfaces persisted
blocked/skipped/pending/opt-out result truth. The final local detail audit for
`Campanha teste set.2` confirmed the repeated recipient line was caused by
projection plus seed fallback, not a duplicate provider attempt. Detail now
reconciles one current outcome per intended recipient when possible, exposes
the full phone to authenticated campaign-detail users while preserving
draft/review masking, and treats mixed delivered/blocked evidence as partial
delivery. The `****9614` non-send is closed at root-cause level: two same-tenant
Contact candidates and one Lead caused a pre-provider `identity_conflict`.
This is historical campaign-bootstrap residue predating Identity P1; current
creation paths did not reproduce an active bypass. The recipient remains
blocked until separately authorized data repair. Canonical counters are total
2, delivered 1, blocked 1, pending 0 and technical failures 0. Canonical
integration validation: UI contract 9/9 PASS,
`campaignsFeatureRoutes.test.ts` 115/115 PASS, backend/frontend builds
PASS and `git diff --check` PASS. No schema/migration, production deploy, real
Meta send or `****6787` mutation occurred.

Campaign composer lifecycle (2026-09-18): IMPLEMENTED LOCAL / OWNER REVIEW
PENDING / NO DEPLOY. Composition remains client-transient until explicit draft
save or execution. One dirty-state contract and one reset clear all unsaved
name/template/variables/recipients, CRM and CSV previews, destination and
errors on discard or Campaign-tab abandonment. Explicit drafts and campaigns
that are scheduled, sending or completed remain persisted; closing progress
does not cancel execution. Preview has no server residue, while CRM upserts
from explicit CSV draft creation remain canonical. No schema/migration.

Campaign Result Truth canonical 12/13 corrective (2026-09-18): P1 VALIDATED
LOCAL AND READ-ONLY / OWNER REVIEW READY / NO DEPLOY. The original synthetic
test passed but omitted the actual 13-digit seed versus 12-digit historical
outbound shape. Production validation therefore exposed a false duplicate
`****6787` failure and stopped at the hard gate. The corrective is projection
only and reuses `buildCrmWhatsappIdentityCandidates`; historical campaign,
outbound, event and billing rows are untouched. Read-only replay of campaign
`0fb54d61-9f71-42ab-b89d-78ddb23bb694` returns 2 rows, delivered 1, blocked 1,
pending 0, technical failures 0 and `Entrega parcial`. Campaign backend
118/118 and complementary 56/56 plus 72/72 matrices pass. Schema unchanged,
migration none, no real send, no identity repair and no deploy.

CRM origin + full Contacts CSV + campaign block guards (2026-09-23): DEPLOYED /
PRODUCTION HEALTH VALIDATED / OWNER UI VALIDATION PENDING. Production head
`2a652e693a4bce5cfaa7e0a1fa5ef667537f154a` was fast-forwarded from
`31a65a2bc6a74d7dd8fc5d5086133735155c64d4` after PostgreSQL backup
`/opt/re7online/backups/postgres/pre-crm-origin-csv-campaign-guards-2a652e69-20260923T004417Z.dump`
(`21677788` bytes, sha256
`99d2bbccd613dada93d27c19ee6d05a3f941cbe5a311d759036a10cb9f4688aa`,
`596` objects). Backend/frontend builds and production health passed; only
`re7-whatsapp-agent` and `re7-admin-front` were reloaded, with
`re7-whatsapp-web-worker` preserved. CRM read model origin remains a canonical
event-derived projection: manual, CSV, campaign/audience, conversation/inbound,
system and legacy unknown stay distinct. Contacts CSV import supports optional
company, city, email and service/interest columns in addition to phone, name
and CRM situation; blank or unmapped optional fields preserve existing data.
`NEW` is mandatory and active, but it does not create campaign ineligibility by
itself. Campaign manual/CSV and Inbox template paths preserve pre-provider
active-send/opt-out blocking and display non-technical reasons. No schema,
migration, smoke provider call or real campaign send occurred. Authenticated
owner UI, real post-deploy CSV import, real post-deploy blocked campaign
evidence and real new inbound-origin evidence remain not exercised until a
separately authorized natural validation path exists.

P1 campaign delivery truth + alias-safe blocking (2026-09-23): LOCAL FIX
VALIDATED / NOT DEPLOYED. Campaign CSV phone mapping now keeps arbitrary headers
and requires explicit operator mapping when no safe phone alias is found, instead
of guessing the first column. Opt-out/active-send blocking is alias-safe across
Brazilian 12/13 digit WhatsApp identities. Provider accepted/submitted is only
submission evidence; delivered/read webhook evidence is required before
operational Conversation/Runtime creation or reactivation and before treating a
recipient as delivered in the UI. Reaction-only Meta webhooks are ignored as
non-content events. `Campaign.sentCount` remains a legacy submitted/accepted
counter, not delivered/read/final success truth. Real `****6683` controlled
repair was executed in production on 2026-09-24: only false operational
projection rows were deleted (`ConversationRuntimeState
38012577-8dbb-43d5-8bdd-2ef8ba541038` and `Conversation
9a07b043-6657-4dc3-9e7f-2b904caf939c`). Campaign
`ad354ce4-35dc-4fca-85e5-3108cc9a2332`, Outbound
`b5193677-2f28-41ea-879f-1dfebdfe08d9`, Event references, billing/meta usage,
Contact, Lead and CCI were preserved; failure evidence `131026` / `Message
undeliverable` remains campaign history.

Campaign RBAC/active-send authorization update on 2026-09-24 is DEPLOYED /
PRODUCTION HEALTH VALIDATED / OWNER VALIDATED / CLOSED at functional production
head `b1a528a00d63b5dc3fea6c9ff45f9273e23f4294`. The
audit found Campaign navigation had the `campaigns` feature flag but no
explicit `minRole`; the local patch adds SUPERVISOR/ADMIN gating in navigation,
direct `/app/campaigns` hydration and backend app campaign routes. AGENT direct
access shows a controlled no-permission state without protected campaign data
loading, and backend routes deny non-manager app roles before body parsing,
mutation or provider execution. Opt-out/revoke routes were audited and
preserved for CRM contact opt-out behavior. Local validation passed with
`campaignsFeatureRoutes.test.ts` 121/121, `campaignsPageContract.test.ts`
24/24, browser smoke on isolated local ports `3039`/`3000`, backend/frontend
builds PASS, `campaignRunner.test.ts` 7/7, `campaignRecipientImport.test.ts`
7/7 and `tenantConfig.test.ts` 3/3. The only loading failures during this
closure were sandbox IPC `tsx` failures and passed after approved local rerun.
The 2026-09-24 local complement added valid SUPERVISOR/ADMIN fixtures for CSV
preview/draft, CRM draft, manual immediate create, send, schedule, resume and
test-send with simulated provider calls; AGENT negatives still assert no
mutation and no provider call. Production deployment moved by FF-only from
`957f19caced77693188a387bb7f7840a24092c67` after backup
`/opt/re7online/backups/converta-persistent/postgres/campaign-rbac-b1a528a-20260924T143728Z/20260924-143729.dump`
(sha256 `215049ecb9aafdb6bd1e209b5a2f414b0ef8b0247447ec5719207de039a9ef58`,
581 objects). Backend/frontend builds and health passed; only
`re7-whatsapp-agent` and `re7-admin-front` were reloaded, worker preserved.
Smoke covered health and route reachability without POST, provider call or real
send. Legitimate role sessions were not available, so production AGENT 403 and
SUPERVISOR/ADMIN read smoke are NOT EXERCISED in automated smoke. Owner later
declared "validação passou"; that owner acceptance closes RBAC and is distinct
from the earlier technical smoke evidence.

Next P2 confirmed: Guided Builder BOT inactivity policy UX. Audit found the
runtime already supports and persists `ChatbotFlow.definition.inactivityPolicy`
with `resetAfterMinutes`, `timeoutMinutes` and `action`; inline reset restarts
BOT flow on later inbound, while `timeoutMinutes/action=HANDOFF` is handled by
the background processor for BOT runtimes only. Current Guided UI only surfaces
reset in review text and does not clearly configure/explain automatic handoff.
Minimal next implementation is UX-only over existing fields, with no
schema/runtime/provider change and no HUMAN auto-close. CRA business hours
remain CONFIGURED / OPERATIONALLY VALIDATED and are not reopened.


### Preflight do alvo — 2026-09-26 (somente leitura)

Produção `5ee2de6b`; candidato `2ecfc91a`: **NOT DEPLOYED / OWNER UI PENDING**.
[Preflight único, condições de parada e recuperação](CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md) atualizado após `66b9cf2b`: portas 3000/3001 alcançáveis externamente, rewrite público do frontend e risco PM2 resurrect confirmados. Leituras privilegiadas de Nginx/firewall negadas; comandos exatos para o operador constam no preflight.

Recomendação: não avançar à migration; preparar e ensaiar guarda de admissão/drain e artefato de recuperação do atendimento com campanhas fechadas, em tarefa separada. Código atual não comprova quiescência de test-send/runners, nem retorno seletivo seguro. A estimativa preliminar de 30–60 min não constitui janela proposta para aprovação. Sem promessa de inbound/retries; sem REVOKE do papel compartilhado. Migration/drift/ensaio anteriores não repetidos; nenhuma alteração de runtime. Owner PASS anterior preservado, 6683 CLOSED, CRA pendente e DELIVERED/READ → HUMAN/WAITING separados.


### Guarda operacional e recuperação — implementação local 2026-09-26

Base `2b5697b6`, sem commit/push/deploy. Guarda persistente fechada por padrão,
controle superadmin e drain durável integram as entradas de campanha e a fila
existente; suspensão administrativa preserva intenção, snapshot e aceites.
Pause/cancel em execução, RBAC e exclusividade preservados; Inbox outbound não
foi bloqueado. Worktree de recuperação separado em `5ee2de6b` com campanhas
permanentemente fechadas e Client privado, sem dependência das tabelas novas
para atendimento. [Resultados exatos e limites do ensaio](CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md#resultados-comprovados-do-ensaio-local): execução 40/40, rotas 44/44 + caso final 1/1; guarda final 8/8;
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

[Registro operacional e limites](CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md#migration-aditiva-aplicada-com-recovery-fechada--27092026).
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

[Estado e limites comprovados](CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md#candidato-ativado-com-campanhas-fechadas--27092026).
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

[Registro auditado e limites](CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md#liberação-controlada-concluída--campanhas-abertas-e-scheduler-habilitado).
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
