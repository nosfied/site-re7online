## Re7Online — Site institucional

Landing page institucional da Re7Online, construída com Next.js (App Router), TypeScript e Tailwind.

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
