# Feature Lifecycle

Status: classificacao atual das funcionalidades do Converta. Este documento nao altera flags nem runtime.

## Estados Oficiais

### experimental

Funcionalidade existe para teste, demo ou validacao controlada. Pode mudar sem promessa comercial ampla.

### beta

Funcionalidade e utilizavel, mas ainda exige monitoramento, validacao operacional ou limites conhecidos.

### stable

Funcionalidade pronta para operacao comercial recorrente, com rotas, persistencia e validacoes basicas.

### deprecated

Funcionalidade mantida por compatibilidade, mas nao deve receber novas dependencias.

## Classificacao Atual

| Feature | Estado | Justificativa | Fonte Principal |
| --- | --- | --- | --- |
| Inbox | stable | Operacao diaria omnichannel, realtime, timeline, filtros e atendimento humano | `/app/inbox`, conversation/message models |
| WhatsApp | stable | Runtime principal completo, onboarding, inbound/outbound, shadow compare | webhook controller, `WaPhoneNumber`, `TenantMetaConfig` |
| Messenger | beta | Inbound/outbound manual funcional, mas depende de Page token e configuracao Meta | passive webhook, channel accounts |
| Instagram | beta | Inbound real e outbound manual human-only funcionam, mas ainda sensivel a Review/capabilities Meta | Instagram Business Login, channel accounts |
| Campaigns | stable | Modulo persistido em DB e feature-gated | `Campaign`, campaign routes |
| Templates | stable | Catalogo persistido e integracao Meta templates | `Template`, `TemplateRequest` |
| Chatbot flows | stable | Fluxos configuraveis persistidos em DB | `ChatbotFlow` |
| AI supervised fallback | beta | Funciona por tenant, mas depende de configuracao e evaluation/replay | `TenantConfig.ai*`, evaluation scripts |
| Dashboard | beta | Disponivel por profile/feature; mais forte para government por default | `/app/dashboard`, feature flags |
| CRM Timeline | stable | Leads, notas, timeline e conversas persistidas | `Lead`, `LeadNote`, `Conversation`, `Message` |
| Departments | stable | Departamentos e filas persistidos, assignment integrado | `Department`, `Queue` |
| Users/RBAC/Auth | stable | Sessao, single-login policy ajustada posteriormente para sessao persistente, reset e users | `User`, `AppAuthSession` |
| LGPD/Retention | stable | RetentionConfig e rotinas de anonimizacao/exclusao operacional | `RetentionConfig`, privacy service |
| Push/PWA | beta | Funcional, com limites por browser/SO e historico de ajustes finos | `PushSubscription`, web push service |
| Reports | stable | Relatorios operacionais e exportacao; depende da qualidade dos dados historicos | reports routes |
| POC/demo | experimental | Seeds e telas/dados para demonstracao | demo scripts |

## Promocao De Estado

Para promover experimental -> beta:

- rota/tela carregando
- sem secrets expostos
- tenant isolation validado
- smoke manual documentado

Para promover beta -> stable:

- uso real validado
- rollback claro
- testes/replay quando aplicavel
- documentacao no indice
- sem dependencias manuais criticas fora do runbook

Para marcar deprecated:

- documentar substituto
- bloquear novas dependencias
- criar plano de remocao ou isolamento

## Observacoes

- Estados de lifecycle nao substituem `Client.features`.
- Um modulo pode estar `stable` e ainda depender de configuracao `beta`, como canais Meta.
- Instagram e Messenger devem permanecer classificados como `beta` enquanto tokens/capabilities Meta forem operados via configuracao sensivel em `channelAccounts`.

