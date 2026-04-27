## Re7Online / Reset Online — Monorepo

Monorepo da Re7Online/Reset Online.

O repositório contém:

- site institucional da Re7Online, construído com Next.js (App Router), TypeScript e Tailwind;
- frontend do Converta em `/app`;
- console interno em `/admin`;
- backend do WhatsApp Agent/Converta em `apps/whatsapp-agent`.

O **Converta** é o SaaS de atendimento digital via WhatsApp oficial da Meta, com
inbox, campanhas, templates, chatbot, atendimento humano, usuários, departamentos,
relatórios, SLA, multi-tenant e integração direta com WhatsApp Cloud API.

Superfícies:

- `/admin`: console interno da Re7/Reset, onboarding, tenants, Embedded Signup e observabilidade.
- `/app`: produto do cliente, com autenticação por usuário real e escopo por tenant.

## Pré-requisitos

- Node.js 20+
- npm 9+

## Instalação

```bash
npm install
```

## Desenvolvimento

```bash
npm run dev
```

Abra http://localhost:3000

## Build

```bash
npm run build
```

Backend do Converta:

```bash
cd apps/whatsapp-agent
npm run build
```

## Deploy

- Vercel: importe o repositório e use o comando padrão de build (`npm run build`).
- Outros ambientes: execute `npm run build` e sirva a pasta `.next` com `npm run start`.

## Deploy (Vercel + Cloudflare)

### Vercel
1) Importe o repositório no Vercel.
2) Selecione a branch `main` (produção) ou `fix/ci-tailwind-postcss` (preview).
3) Em **Domains**, adicione `teste.re7online.com`.

### Cloudflare (DNS)
Crie um registro CNAME:
- **Name**: `teste`
- **Target**: `cname.vercel-dns.com`
- **Proxy**: DNS only (recomendado inicialmente)

Depois, volte na Vercel e clique em **Verify**.

Checklist rápido:
- Acessar https://teste.re7online.com
- Verificar responsivo (mobile/desktop)
- Testar CTA/WhatsApp
- Conferir carregamento dos assets

## CI / Build

Validação local (ambiente limpo):

```bash
npm ci
npm run lint
npm run build
```

## Fluxo de branches

- `main`: produção
- `develop`: integração
- `feature/*`: novas funcionalidades (ex.: `feature/hero-foto`)

## Scripts

```bash
npm run dev
npm run lint
npm run build
npm run start
```

## Documentação

- Visão do produto: `docs/whatsapp-agent/00-visao-produto.md`
- Arquitetura atual: `docs/whatsapp-agent/02-arquitetura-mvp-meta-cloud.md`
- Separação `/admin` vs `/app`: `docs/ADR-004-separacao-admin-app.md`
- Runbook operacional: `docs/RUNBOOK_WHATSAPP_AGENT.md`
