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
