# Arquitetura atual — Converta / WhatsApp Agent

Este documento começou como a arquitetura do MVP, mas o produto evoluiu. O estado
real atual é uma plataforma SaaS multi-tenant de atendimento digital via WhatsApp
oficial da Meta.

## Visão geral de componentes

Fluxo principal:

Webhook Meta -> Assinatura -> Tenant Resolver -> Normalizer -> Router/Flow Executor
-> Runtime Storage/Postgres -> Outbound Meta -> Logs/Eventos/Métricas

### Componentes

- **Webhook Receiver**: endpoint HTTP para eventos da Meta.
- **Signature Validator**: valida `X-Hub-Signature-256` com `META_APP_SECRET`.
- **Tenant Resolver**: resolve `phone_number_id` para `Client` via `WaPhoneNumber`.
- **Normalizer**: normaliza mensagens, status, mídias e identificadores.
- **Router / Flow Executor**: decide fluxo comercial, chatbot, handoff ou fallback.
- **Runtime Storage**: estado de conversa em Postgres, com legado JSON apenas como compatibilidade.
- **Responder**: envia texto, template e mídia pela WhatsApp Cloud API.
- **Campaign Runner**: executa campanhas assíncronas tenant-scoped.
- **Meta Template Service**: submete/sincroniza templates com a Meta.
- **Realtime Hub**: entrega eventos rápidos do inbox via WebSocket no `/app`,
  mantendo REST como fonte de verdade.
- **Logs/Eventos/Métricas**: auditoria por tenant, status Meta, SLA e relatórios.

## Meta Cloud API — pontos essenciais
- **Verify token**: validação inicial do webhook.
- **Assinatura/segurança**: validar assinatura do payload.
- **Eventos principais**:
  - mensagens recebidas
  - entregas/reads
  - falhas de envio

## Decisão de arquitetura

### Multi-tenant atual

O MVP single-tenant foi superado. O código atual é multi-tenant por:

- `Client.id` / `clientId`
- `Client.clientKey`
- `WaPhoneNumber.phoneNumberId`
- `Department.id` quando há escopo institucional/setorial

As tabelas principais usam escopo por cliente, incluindo conversas, mensagens,
eventos, leads, usuários, departamentos, filas, campanhas, templates, relatórios,
configuração Meta e fluxos de chatbot.

### Superfícies

- `/admin`: console interno da Re7/Reset, token técnico, superadmin, onboarding,
  Embedded Signup, tenants e observabilidade cross-tenant.
- `/app`: produto do cliente, login por usuário real, RBAC e escopo por tenant.

Novas funcionalidades de cliente devem ir para `/app`, não para `/admin`.

### Persistência

PostgreSQL/Prisma é a fonte de verdade operacional. O storage JSON permanece no
código apenas para compatibilidade/transição e não deve orientar novas features.

### Realtime do `/app/inbox`

O inbox usa WebSocket como camada rápida de entrega de eventos, sem substituir REST.

Decisão atual:

- REST continua sendo a fonte de verdade para conversas, timeline, read-state e
  resync.
- WebSocket entrega `message.created` após inbound persistido.
- Polling permanece ativo como fallback e reconciliação.
- O socket fica no nível global do `/app`, não dentro da página do inbox.
- Notificações, som principal/suave e deduplicação são centralizados no frontend.

Detalhamento: `docs/whatsapp-agent/06-realtime-inbox-websocket.md`.

### Produção

- VPS: `/opt/re7online/site-re7online/apps/whatsapp-agent`
- PM2: `re7-whatsapp-agent`
- Porta backend: `3001`
- Deploy manual rastreado por branch/commit conforme runbook.

## Diretriz atual

Manter integração 100% oficial com WhatsApp Cloud API, respeitando janela de 24h,
templates aprovados, webhooks assinados e status reais da Meta. Não usar WhatsApp
Web, scraping ou automação por navegador.
