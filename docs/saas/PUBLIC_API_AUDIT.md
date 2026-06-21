# Sprint 70A - Public API Audit

Data: 2026-06-20

Escopo: auditoria documental baseada no codigo atual. Documento atualizado apos as Sprints 70C/70D para refletir a API publica inicial.

## Resumo executivo

O Converta possui uma base robusta de APIs internas para o aplicativo, console administrativo, webhooks Meta e realtime do inbox. Essa base e suficiente para operar o produto e pode ser reaproveitada para desenhar uma API publica.

Ja existe uma API publica inicial de integracao externa. O estado atual e **PARCIAL**:

- existe API REST interna tenant-scoped em `/app/*`;
- existe API administrativa em `/admin/*`;
- existe webhook inbound Meta em `/webhook`;
- existe WebSocket autenticado para realtime em `/app/realtime`;
- existe namespace publico versionado `/public-api/v1`;
- existe contrato OpenAPI inicial em `docs/saas/public-api/openapi.yaml`;
- existe modelo de API key/scopes por integracao externa;
- existe `GET /public-api/v1/health`;
- existe leitura basica de contatos em `GET /public-api/v1/contacts` e `GET /public-api/v1/contacts/{id}`;
- existe leitura resumida de conversas em `GET /public-api/v1/conversations` e `GET /public-api/v1/conversations/{id}`;
- nao foi encontrado webhook outbound para sistemas de clientes;
- nao ha escrita publica, mensagens, campanhas ou webhooks outbound no contrato publico atual.

Recomendacao: nao expor `/app` nem `/admin` como API publica. O caminho correto e criar uma camada publica versionada, com autenticacao propria, scopes, rate limit, OpenAPI e DTOs estaveis, reaproveitando os services e contratos internos com adaptadores.

## Evidencias principais

| Area | Evidencia | Observacao |
| --- | --- | --- |
| Rotas HTTP centrais | `apps/whatsapp-agent/src/http/routes.ts` | Router unico com `/auth`, `/app`, `/admin`, `/webhook`, Instagram OAuth e modulos operacionais |
| Cliente app | `src/lib/appClientApi.ts` | Contrato interno usado pelo frontend `/app` |
| Cliente admin | `src/lib/whatsappAdminApi.ts` | Contrato interno usado pelo console `/admin` |
| Auth app | `apps/whatsapp-agent/src/auth/appSessionService.ts` | Sessao autenticada para usuarios do tenant |
| Auth admin | `apps/whatsapp-agent/src/http/routes.ts` | `x-admin-token` ou Bearer com `ADMIN_TOKEN`/`Client.adminToken` |
| Realtime | `apps/whatsapp-agent/src/realtime/websocket.ts` | WebSocket autenticado em `/app/realtime` e `/agent-api/app/realtime` |
| Webhook Meta | `apps/whatsapp-agent/src/http/routes.ts`, `apps/whatsapp-agent/src/http/metaWebhookPassive.ts` | Recebimento externo Meta, com assinatura em producao |
| Docs existentes | `docs/saas/GAP_REUSE_AUDIT.md`, `docs/saas/bid-package/12-integracoes.md` | Documentam gap de API publica e integracoes |
| OpenAPI/Swagger | `docs/saas/public-api/openapi.yaml` | Contrato inicial para health, contacts read-only e conversations read-only |

## Superficies de API existentes

| Superficie | Status | Uso atual | Pode virar API publica? | Observacao |
| --- | --- | --- | --- | --- |
| `/health` | ATENDE | Health operacional | Sim, como health publico/controlado | Ja e simples e estavel |
| `/auth/*` | PARCIAL | Login/logout/reset do app | Nao diretamente | Autenticacao de usuario final, nao de integracao externa |
| `/app/*` | PARCIAL | API principal do produto logado | Sim, por adaptador | Nao deve ser exposta diretamente como contrato publico |
| `/admin/*` | PARCIAL | Console interno, suporte, governanca | Nao diretamente | Escopo privilegiado; risco alto de exposicao |
| `/webhook` | ATENDE | Inbound Meta | Nao como API publica geral | E endpoint de fornecedor, nao API para cliente |
| `/meta/instagram/oauth/callback` | ATENDE | OAuth Instagram Business Login | Nao | Fluxo especifico Meta/OAuth |
| `/app/realtime` | PARCIAL | Realtime do inbox | Nao inicialmente | Pode orientar eventos futuros, mas hoje e app-only |
| `/api/debug/embedded-signup` | NAO ATENDE | Debug Next.js | Nao | Nao e superficie publica de produto |

## Inventario das APIs internas

### App API

Classificacao: **PARCIAL**

As rotas `/app/*` sao tenant-scoped e autenticadas por sessao do usuario. Elas cobrem boa parte do dominio operacional:

- conversas, lista, detalhe, timeline e leitura;
- envio manual e envio de midia;
- assumir, devolver, transferir e finalizar atendimento;
- usuarios e departamentos;
- chatbot e automacao;
- Knowledge Base;
- relatorios e exportacao;
- dashboard;
- campanhas;
- templates;
- CRM settings, status, notas e destinatarios;
- privacidade/LGPD;
- push/realtime/presenca;
- conexao Instagram Business.

Potencial de reaproveitamento: alto. A API publica deve reaproveitar services e DTOs internos quando fizer sentido, mas precisa de fronteira propria.

Risco de expor diretamente: alto. As rotas foram desenhadas para o frontend logado, nao para terceiros. Elas carregam permissoes, mensagens, PII, operacoes Meta e regras de UI.

### Admin API

Classificacao: **PARCIAL**

As rotas `/admin/*` permitem suporte, auditoria, gestao de tenants, canais, templates, campanhas, usuarios, relatorios e configuracoes. A autenticacao aceita `ADMIN_TOKEN` global ou `Client.adminToken`.

Potencial de reaproveitamento: medio. Pode orientar operacoes internas e onboarding, mas nao deve ser exposta como API publica.

Risco de expor diretamente: muito alto. Inclui operacoes privilegiadas, canais, configuracoes, tokens redigidos e governanca multi-tenant.

### Webhooks

Classificacao: **PARCIAL**

Existe webhook inbound robusto para Meta:

- WhatsApp Cloud API;
- Messenger;
- Instagram;
- validacao de assinatura quando configurada;
- tenant resolution multicanal;
- persistencia inbound e eventos realtime.

Nao foi encontrado webhook outbound para clientes, por exemplo:

- `conversation.created`;
- `message.created`;
- `handoff.requested`;
- `conversation.closed`;
- `lead.updated`;
- `campaign.completed`.

Para editais que pedem "API de integracao", o webhook Meta ajuda a comprovar maturidade tecnica, mas nao substitui uma API publica para sistemas externos.

### Realtime

Classificacao: **PARCIAL**

O WebSocket `/app/realtime` e autenticado por token de sessao do app e serve o inbox. E operacional, mas nao e um contrato publico para terceiros.

Pode ser reaproveitado conceitualmente para eventos de API publica, mas a recomendacao e criar webhooks outbound assinados antes de expor realtime externo.

## Autenticacao e seguranca

| Item | Status | Evidencia | Gap |
| --- | --- | --- | --- |
| Sessao app | ATENDE | `AppAuthSession`, `validateAppSessionFromRequest` | Serve usuarios, nao integracoes |
| Admin token | PARCIAL | `ADMIN_TOKEN`, `Client.adminToken`, `x-admin-token` | Nao tem scopes finos, rotacao por integracao ou rate limit publico |
| Meta webhook signature | ATENDE | Assinatura Meta em producao | Especifico para fornecedor Meta |
| API keys publicas | NAO ATENDE | Nao encontrado model/rota propria | Criar chaves hash, scopes, status e auditoria |
| OAuth para terceiros | NAO ATENDE | Nao encontrado fluxo de developer OAuth | Nao necessario para MVP, mas pode ser futuro |
| Rate limit por integracao | PARCIAL | Existe infraestrutura HTTP/rate limit geral | Falta quota/rate por API key |
| Idempotencia | NAO ATENDE | Nao encontrado contrato publico | Necessario antes de endpoints de escrita |
| Redacao de secrets | ATENDE | Padrao de redaction e secrets criptografados em canais | Manter no desenho publico |

## OpenAPI / Swagger

Classificacao: **ATENDE PARCIALMENTE**

Existe OpenAPI inicial em `docs/saas/public-api/openapi.yaml`, cobrindo auth Bearer, health autenticado e leitura de contatos. Ainda falta guia humano de integracao, exemplos, changelog e expansao para conversas/mensagens/webhooks.

Para licitacoes e integracoes profissionais, o Converta deve criar:

- documentacao humana com exemplos;
- politica de autenticacao;
- convencao de erros;
- changelog de API.

## Integracoes suportadas hoje

| Integracao | Status | Observacao |
| --- | --- | --- |
| WhatsApp Oficial / Meta Cloud API | ATENDE | Canal principal operacional |
| Messenger | ATENDE | Inbound/outbound operacional, com governanca de channel accounts |
| Instagram Direct | ATENDE | Inbound e outbound manual human-only apos Business Login |
| Meta Embedded Signup / Business Login | ATENDE | Fluxos de conexao Meta/Instagram |
| Push/PWA | ATENDE PARCIALMENTE | Notificacoes do app, nao API publica |
| Webhooks de saida para cliente | NAO ATENDE | Nao encontrado |
| API publica REST | NAO ATENDE formalmente | Existe base interna reaproveitavel |
| Telegram | NAO ATENDE | Nao encontrado canal implementado |
| Webchat | NAO ATENDE | Nao encontrado canal implementado |

## Endpoints internos reaproveitaveis

| Dominio | Reaproveitamento | Classificacao | Esforco para API publica |
| --- | --- | --- | --- |
| Conversas - listagem e detalhe | Alto | PARCIAL | Medio |
| Timeline/mensagens | Alto | PARCIAL | Medio |
| Leads/CRM status/notas | Alto | PARCIAL | Medio |
| Relatorios/exportacao | Alto | PARCIAL | Baixo/medio |
| Departamentos/usuarios | Medio | PARCIAL | Medio |
| Knowledge Base | Alto | PARCIAL | Medio |
| Campanhas/templates | Medio | PARCIAL | Alto, por politica Meta e risco operacional |
| Envio de mensagens | Medio | PARCIAL | Alto; exige idempotencia, scopes, janela Meta e rate limit |
| Webhooks outbound | Baixo hoje | NAO ATENDE | Medio/alto |
| Admin/tenant settings | Baixo para publico | PARCIAL | Alto; manter interno |

## Matriz de aderencia

| Requisito de API publica | Classificacao | Aderencia | Evidencia | Gap principal |
| --- | --- | ---: | --- | --- |
| API REST existente | PARCIAL | 55% | `/app/*`, `/admin/*` | Falta camada publica versionada |
| API publica versionada | ATENDE PARCIALMENTE | 72% | `/public-api/v1` | Expandir contrato para mensagens/webhooks/escrita controlada |
| Autenticacao para integracao | ATENDE | 90% | `PublicApiKey`, hash-only, scopes e revoke | Refinar tela/rotação/expiração |
| Webhooks inbound | ATENDE | 90% | `/webhook` Meta | Inbound e fornecedor-especifico |
| Webhooks outbound | NAO ATENDE | 0% | Nao encontrado | Criar eventos assinados |
| OpenAPI/Swagger | ATENDE PARCIALMENTE | 72% | `docs/saas/public-api/openapi.yaml` | Adicionar examples/changelog e futuros endpoints |
| Rate limit publico | ATENDE PARCIALMENTE | 70% | Rate limit basico por API key | Evoluir para quotas por plano e janelas configuraveis |
| Auditoria por integracao | ATENDE PARCIALMENTE | 70% | Eventos `api.request`, `api.denied`, `api.rate_limited` | Tela/relatorio de auditoria publico |
| Multi-tenant isolation | ATENDE PARCIALMENTE | 80% | Client/session/RBAC existentes | Formalizar no middleware publico |
| LGPD/PII controls | PARCIAL | 60% | Retencao, anonimizar, redaction | Definir minimizacao por endpoint |
| Idempotencia | NAO ATENDE | 0% | Nao encontrado contrato | Obrigatorio para escrita |
| Documentacao de integracao | PARCIAL | 40% | bid package/docs saas | Falta guia developer |

Aderencia consolidada estimada para "API publica": **58%**.

Interpretação:

- Para edital que aceita API interna/sistema integravel de forma generica: **ATENDE PARCIALMENTE**.
- Para edital que exige API publica documentada, OpenAPI, chaves de acesso e leitura basica de contatos: **ATENDE PARCIALMENTE** no formato atual.
- Para edital que exige webhooks outbound, conversas, mensagens, campanhas ou escrita por API: **NAO ATENDE** no formato atual.

## Riscos

| Risco | Severidade | Descricao | Mitigacao |
| --- | --- | --- | --- |
| Vazamento de PII | Alto | Conversas, leads e midias contem dados pessoais | DTO publico minimo, scopes, auditoria e redaction |
| Vazamento cross-tenant | Alto | API publica mal isolada pode expor dados de outro tenant | Middleware por `clientId`, testes de isolamento e API keys tenant-scoped |
| Abuso de envio Meta | Alto | Endpoints de envio podem violar janela/politica Meta | Comecar read-only; escrita em sprint separada |
| Custo e volume | Medio/alto | Terceiros podem gerar chamadas em excesso | Rate limit por chave, quotas e bloqueio |
| Quebra do app interno | Medio | Reusar rotas internas diretamente cria acoplamento | Criar camada publica separada |
| Falta de versionamento | Medio | Mudancas internas quebram integracoes | `/public-api/v1`, changelog e deprecation policy |
| Auditoria insuficiente | Medio | Licitacoes podem exigir rastreabilidade | `PublicApiRequestLog` ou evento equivalente |

## MVP recomendado

### Sprint 70B - Public API Design

Sem runtime novo ainda:

- definir namespace `/public-api/v1`;
- definir modelo de autenticacao por API key;
- definir scopes iniciais;
- definir erro padrao;
- definir OpenAPI inicial;
- definir politica LGPD/PII;
- definir rate limit e auditoria.

Modelos sugeridos:

- `PublicApiKey`
  - `id`
  - `clientId`
  - `name`
  - `keyHash`
  - `scopes`
  - `status`
  - `expiresAt`
  - `lastUsedAt`
  - `createdBy`
  - timestamps
- `PublicApiRequestLog` ou eventos equivalentes
  - `clientId`
  - `apiKeyId`
  - `method`
  - `path`
  - `statusCode`
  - `durationMs`
  - `requestId`
  - timestamps

### Sprint 70C - Public API Schema + API Keys

Escopo seguro:

- model `PublicApiKey`;
- API key tenant-scoped;
- rate limit;
- audit log;
- middleware de autenticacao;
- `GET /public-api/v1/health`.

Nao incluir contatos, conversas, mensagens nem envio neste primeiro passo.

### Sprint 70D - Public API OpenAPI + Contacts Read MVP

Escopo seguro:

- `GET /public-api/v1/contacts`;
- `GET /public-api/v1/contacts/{id}`;
- OpenAPI inicial em `docs/saas/public-api/openapi.yaml`;
- DTO publico minimo, com telefone mascarado e sem mensagens/notas internas.

Ficam fora da 70D:

- conversations;
- messages;
- campaigns;
- escrita publica;
- webhooks outbound.

### Sprint 70E - Public API Conversations Read MVP

Escopo seguro:

- `GET /public-api/v1/conversations`;
- `GET /public-api/v1/conversations/{id}`;
- OpenAPI atualizado em `docs/saas/public-api/openapi.yaml`;
- DTO publico resumido, sem mensagens, payloads, tokens ou identificadores sensiveis;
- scopes `read + conversations`;
- auditoria `api.conversations.listed` e `api.conversation.read` via `api.request`.

Ficam fora da 70E:

- messages;
- campaigns;
- escrita publica;
- envio por canal;
- webhooks outbound.

### Sprint 70F - Webhooks outbound

Eventos recomendados:

- `conversation.created`;
- `conversation.updated`;
- `message.created`;
- `handoff.requested`;
- `conversation.closed`;
- `lead.updated`.

Obrigatorio:

- assinatura HMAC;
- retry com backoff;
- dead-letter/status;
- tela de configuracao por tenant;
- redaction de payload quando aplicavel.

### Sprint 70F - Escrita controlada

Somente apos read-only e webhooks:

- atualizar lead/status/notas;
- criar comentario/nota CRM;
- eventualmente enviar mensagem manual via API com forte controle.

Envio de mensagens deve exigir:

- scope especifico;
- idempotency key;
- validacao da janela/canal;
- rate limit por canal;
- auditoria completa;
- politica Meta documentada.

## Decisao de produto

O Converta deve posicionar a API publica como **MVP read-only em evolucao** apos 70D.

Para licitacoes:

- se o requisito for "possuir integracoes com API oficial Meta": **ATENDE**;
- se o requisito for "possuir API para integracao externa documentada com leitura de contatos": **ATENDE PARCIALMENTE**;
- se o requisito exigir conversas, mensagens, webhooks de saida, escrita ou automacoes via API: **NAO ATENDE** hoje.

## Conclusao

Existe fundacao tecnica suficiente para uma API publica profissional, e a camada publica propria ja existe para health autenticado e leitura basica de contatos. Ela ainda nao deve ser declarada como API completa de integracao operacional, porque conversas, mensagens, escrita e webhooks outbound seguem fora do contrato publico.

Proxima sprint recomendada: **Sprint 70E - Public API Conversations Read Design/MVP**, mantendo leitura antes de qualquer escrita.
