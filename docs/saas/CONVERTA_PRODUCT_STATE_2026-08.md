# Converta Product State - 2026-08

Status: fotografia documental do produto em agosto de 2026. Este documento nao altera runtime, configuracao, dados ou comportamento operacional.

## Visao geral

O Converta e um SaaS multitenant de atendimento omnichannel para operacoes B2B e B2G. A unidade operacional principal continua sendo `Conversation`, com suporte a Inbox humano, CRM operacional, campanhas com rascunho e envio explicito, catalogo de modelos Meta, mensagens prontas, auditoria por eventos e controles LGPD.

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

O Support Hub aceita texto e imagem inbound do solicitante, limitado a uma imagem PNG, JPEG/JPG ou WebP por envio, com legenda opcional. As imagens ficam fora do Git e fora do banco, em storage interno configurado por `SUPPORT_ATTACHMENT_ROOT`; a mensagem continua vinculada a `InboundMessage` e a timeline permanece baseada em `Conversation`. O frontend recebe apenas uma referencia opaca e o arquivo e servido por endpoint autenticado com cache privado. O envio de imagem do suporte para o cliente ainda nao faz parte do MVP; o operador responde por texto no Inbox.

## Training Center

O Training Center em `/app/training` fornece uma base autenticada de aprendizagem para todos os perfis do app. Ele reutiliza a sessao do Converta e publica catalogo global de videos MP4 e PDFs cadastrados pela equipe interna da plataforma.

O console interno `/admin/training` administra criacao, edicao, publicacao, despublicacao, ordenacao, upload, substituicao de arquivo, preview e exclusao. A fonte canonica do catalogo e `TrainingContent`; arquivos grandes ficam fora do Git, em storage local configurado por `TRAINING_CONTENT_ROOT` ou mecanismo operacional equivalente. O backend serve conteudo apenas por `contentId`, nao expoe `storageKey`, bloqueia traversal, paths absolutos e escape por symlink, e entrega MP4 com suporte a range e PDF inline/download.

## CRM operacional

O CRM atual e um read model seguro de contatos/leads por tenant. Ele exibe dados minimizados e operacionais, como nome exibivel, identificador seguro, canal, classificacao, empresa quando houver, ultima conversa, status da conversa, ultima atualizacao, bloqueio de envio ativo e origem importada.

O CRM operacional:

- usa sempre o tenant da sessao;
- exige capability `crm`;
- nao aceita `clientId` arbitrario vindo da UI;
- oculta registros anonimizados por padrao;
- permite edicao segura de dados basicos ja autorizados;
- permite alterar status entre situacoes ativas configuradas no tenant;
- permite bloquear/liberar envio ativo via eventos de opt-out;
- nao executa hard delete pela tela operacional.

## Campanhas

O centro de campanhas suporta:

- previa de audiencia CRM sem criar campanha;
- filtros por busca, canal, status CRM, conversa existente e bloqueio ativo;
- bloqueio de contatos sem WhatsApp valido, canal nao suportado, duplicados, opt-out e anonimizados;
- rascunho com `Campaign.status = draft`;
- envio explicito separado da criacao do rascunho;
- mapeamento de variaveis por destinatario;
- envio imediato manual mantido como compatibilidade/fluxo avancado;
- ponte com Inbox para conversa existente;
- bootstrap operacional minimo de conversa/CRM para numero inedito somente apos sucesso do envio Meta.

Criar rascunho nao envia mensagem. Envio real exige acao explicita do operador.

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

## LGPD e anonimizacao

Anonimizacao nao e hard delete. Ela remove dados pessoais da operacao visivel, minimiza conteudo e impede reidratacao automatica. O CRM oculta registros anonimizados por padrao e campanhas bloqueiam esses contatos com motivo `anonymized_contact`.

Inbound e upserts multicanal possuem guarda para nao restaurar dados antigos de identidades anonimizadas. Eventos de seguranca e privacidade usam payload sanitizado.

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

Limite da evidencia: o smoke das rotas reais autenticadas ficou pendente no
ambiente local. `/app/chatbot` parou no boundary de carregamento/auth/API local
e `/admin/tenants/:tenantId/chatbot` parou no gate de login administrativo.
Status: BLOCKED BY ROUTE SMOKE GAP; sem push e sem deploy nesta etapa.

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
- Bloqueio automatico por limite de consumo existe como helper, mas nao esta conectado aos fluxos reais.
- Relatorio administrativo amplo de anonimizados permanece P2.
- Alguns identificadores tecnicos ainda existem por exigencia de modelo atual, com minimizacao operacional.
- Evidencias visuais para licitacoes ainda precisam ser capturadas quando houver roteiro e ambiente controlado.
- Disponibilidade de canal depende de configuracao, permissao e revisao do provedor.

## Proximos passos recomendados

- Criar pacote de screenshots sanitizados para licitacoes.
- Criar runbook de ativacao de politica de consumo por tenant.
- Evoluir relatorio administrativo restrito para auditoria LGPD.
- Planejar conciliacao financeira Meta quando houver fonte oficial automatizada.
- Consolidar matriz de evidencias por edital antes de cada proposta.
