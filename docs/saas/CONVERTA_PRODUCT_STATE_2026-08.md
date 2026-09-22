# Converta Product State - 2026-08

Status: fotografia documental do produto em agosto de 2026. Este documento nao altera runtime, configuracao, dados ou comportamento operacional.

## Visao geral

O Converta e um SaaS multitenant de atendimento omnichannel para operacoes B2B e B2G. A unidade operacional principal continua sendo `Conversation`, com suporte a Inbox humano, CRM operacional, campanhas com rascunho e envio explicito, catalogo de modelos Meta, mensagens prontas, auditoria por eventos e controles LGPD.

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
Variable-template test sends require explicit variable values when the test
number is not an existing campaign recipient and stop before provider call or
aggregate mutation when incomplete. CRM campaign relationship/history is
actual-send evidence only; draft, seed, import, test-send and scheduled-not-run
records are not shown as contact campaign history.

Campaign execution truth + CRM UX follow-up, 2026-09-22: DEPLOYED /
PRODUCTION TECHNICAL SMOKE PARTIAL at
`31a65a2bc6a74d7dd8fc5d5086133735155c64d4`. Campaign CSV import now persists only campaign-owned audience
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
with row data. Production deploy used FF-only from
`07971ca6f1a6d1942978274f58599574629359a3`, persistent backup
`/opt/re7online/backups/converta-persistent/postgres/20260922-212530.dump`,
backend/frontend builds, and reload only of agent/admin-front with worker
preserved. Health and public app routes passed; authenticated owner UI smoke and
real execution materialization were NOT EXERCISED from Codex. No schema,
migration, provider call or real campaign send occurred. Name uniqueness remains
WATCH at application level.

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
