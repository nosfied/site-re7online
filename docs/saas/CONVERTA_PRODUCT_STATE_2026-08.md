# Converta Product State - 2026-08

Status: fotografia documental do produto em agosto de 2026. Este documento nao altera runtime, configuracao, dados ou comportamento operacional.

## Visao geral

O Converta e um SaaS multitenant de atendimento omnichannel para operacoes B2B e B2G. A unidade operacional principal continua sendo `Conversation`, com suporte a Inbox humano, CRM operacional, campanhas com rascunho e envio explicito, catalogo de modelos Meta, mensagens prontas, auditoria por eventos e controles LGPD.

O produto deve ser apresentado como solucao de atendimento, roteamento, chatbot/fluxos, humano assistido, campanhas controladas e evidencia operacional. Nao deve ser apresentado como plataforma de IA generativa ampla quando esse nao for o escopo contratado.

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
- indicacao visual de conversas atribuidas ao operador atual ou a outro responsavel;
- exibicao de outbound de modelo como mensagem na timeline, com badge `Template` e nome do modelo;
- preservacao de isolamento entre tenants.

Conversas removidas da operacao visivel ou anonimizadas nao devem voltar ao Inbox por reidratacao de dados antigos.

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

## RBAC e multitenancy

O produto opera por tenant e capability:

- endpoints usam tenant da sessao;
- permissoes diferenciam ADMIN, SUPERVISOR e AGENT;
- capabilities controlam CRM, campanhas, templates e demais superficies;
- rotas protegidas retornam erro seguro sem sessao;
- payloads operacionais evitam expor identificadores sensiveis em listagens amplas.

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
