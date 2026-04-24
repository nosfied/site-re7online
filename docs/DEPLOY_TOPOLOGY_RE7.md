# Deploy Topology Re7

Documento operacional para evitar erro de deploy entre Vercel, VPS e dominios publicos.

## Estado atual

### Dominio publico
- `re7online.com`
- publicado na `Vercel`
- DNS na Cloudflare apontando para:
  - tipo: `A`
  - nome: `re7online.com`
  - valor: `76.76.21.21`
  - modo: `Proxied`

### Portal admin e backend operacional
- `admin.re7online.com`
- `api.re7online.com`
- publicados na `VPS`
- servidos por:
  - `nginx`
  - `pm2`
  - frontend Next em `127.0.0.1:3000`
  - backend WhatsApp Agent em `127.0.0.1:3001`

## Regra pratica

- mudanca em `re7online.com/...`:
  - deploy na `Vercel`
- mudanca em `admin.re7online.com`:
  - deploy na `VPS`
- mudanca em `api.re7online.com`:
  - deploy na `VPS`
- mudanca no `whatsapp-agent`:
  - deploy na `VPS`

## Caso especifico: `/sistemas`

### Objetivo
- a pagina publica `/sistemas` existe no dominio publico
- ela funciona como hub de acesso aos sistemas Re7
- hoje contem o card do `Converta`

### Importante
- `/sistemas` deve ser tratado como rota do site publico
- logo, o deploy correto e na `Vercel`
- subir isso na VPS nao publica a rota em `re7online.com`

### Arquivos envolvidos
- `src/app/sistemas/page.tsx`
- `public/images/converta-logo-dark.png`
- `public/images/converta-logo-light.png`

## Caso especifico: login do portal

### Descoberta operacional
Quando o frontend do site publico tentou usar `/app/login` diretamente em `re7online.com`, o login falhou com `404`.

Causa:
- o frontend usa `NEXT_PUBLIC_WHATSAPP_AGENT_BASE_URL`
- sem essa variavel, o fallback e `"/agent-api"`
- no dominio publico isso vira:
  - `https://re7online.com/agent-api`
- esse endpoint nao existe no site publico

### Solucao adotada
O botao `Acessar sistema` em `/sistemas` foi ajustado para abrir:

```text
https://admin.re7online.com/app/login
```

Assim:
- o site publico continua na Vercel
- o login real acontece no dominio que ja possui acesso ao backend operacional

## Variavel recomendada na Vercel

Se alguma tela hospedada na Vercel precisar falar com o backend do portal/app, configurar em Production:

```text
NEXT_PUBLIC_WHATSAPP_AGENT_BASE_URL=https://admin.re7online.com/agent-api
```

Observacao:
- isso nao substitui a necessidade de manter o fluxo principal do portal no dominio `admin.re7online.com`
- serve para evitar fallback incorreto para `/agent-api` no dominio publico

## Fluxos de deploy

### 1. Site publico (`re7online.com`)
Usar quando mudar:
- `src/app/page.tsx`
- `src/app/sistemas/page.tsx`
- componentes do site institucional
- assets do site em `public/`

Passos:
1. commit e push no GitHub
2. promover a versao na `Vercel`
3. validar a URL publica

### 2. Portal/admin (`admin.re7online.com`)
Usar quando mudar:
- `src/app/app/**`
- `src/app/admin/**`
- `src/lib/appClientApi.ts`
- `src/lib/whatsappAdminApi.ts`
- frontend operacional servido pela VPS

Passos basicos na VPS:

```bash
cd /opt/re7online/site-re7online
git fetch origin
git checkout <commit>
git rev-parse --short HEAD

npm run build

pm2 restart re7-admin-front --update-env

sleep 3
pm2 status
```

### 3. API / WhatsApp Agent (`api.re7online.com` e `re7-whatsapp-agent`)
Usar quando mudar:
- `apps/whatsapp-agent/**`
- backend, webhook, auth, inbox API, media, chatbot, campanhas

Passos basicos na VPS:

```bash
cd /opt/re7online/site-re7online
git fetch origin
git checkout <commit>
git rev-parse --short HEAD

cd /opt/re7online/site-re7online/apps/whatsapp-agent
npm run build

pm2 restart re7-whatsapp-agent --update-env

sleep 3
pm2 status
curl -sS http://127.0.0.1:3001/health
```

## Diagnostico rapido

### Rota existe localmente no servidor mas nao existe no dominio publico
Exemplo:
- `http://127.0.0.1:3000/sistemas` -> `200`
- `https://re7online.com/sistemas` -> `404`

Interpretacao:
- o problema nao e do Next local
- o problema esta no alvo publico do dominio
- no caso atual, `re7online.com` esta na `Vercel`

### Comandos uteis

Validar o que o frontend local da VPS serve:

```bash
curl -I -sS http://127.0.0.1:3000/sistemas
```

Validar o que o dominio publico entrega:

```bash
curl -I -sS https://re7online.com/sistemas
```

Se vier header da Vercel, como:
- `x-vercel-cache`
- `x-vercel-id`

entao a resposta publica esta vindo da Vercel, nao da VPS.

Validar Nginx da VPS:

```bash
sudo nginx -T | grep -n "server_name\\|location\\|proxy_pass" -A 4 -B 2
```

## Mapa curto

- `re7online.com` -> `Vercel`
- `admin.re7online.com` -> `VPS`
- `api.re7online.com` -> `VPS`
- `/sistemas` -> `Vercel`
- `/app/login` operacional -> `admin.re7online.com/app/login`
- backend `/agent-api` operacional -> `https://admin.re7online.com/agent-api`

## Decisao operacional atual

Para evitar ambiguidade:
- o site publico apresenta o card do sistema
- o acesso ao sistema direciona para o dominio admin

Link oficial atual do card:

```text
https://admin.re7online.com/app/login
```
