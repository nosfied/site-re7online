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

### Portal Converta e backend operacional
- `converta.re7online.com`
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
- mudanca em `converta.re7online.com`:
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
https://converta.re7online.com/app/login
```

Assim:
- o site publico continua na Vercel
- o login real acontece no dominio que ja possui acesso ao backend operacional

## Variavel recomendada na Vercel

Se alguma tela hospedada na Vercel precisar falar com o backend do portal/app, configurar em Production:

```text
NEXT_PUBLIC_WHATSAPP_AGENT_BASE_URL=https://converta.re7online.com/agent-api
```

Observacao:
- isso nao substitui a necessidade de manter o fluxo principal do portal no dominio `converta.re7online.com`
- serve para evitar fallback incorreto para `/agent-api` no dominio publico

## Fluxos de deploy

### 0. Higiene Vercel / Git

Projeto Vercel:

```text
site-re7online
prj_Ei43Wm38CyRWK4yaJHsQinQE7Lto
team_I9ssuIuIMESmfBaoSnIkAZ25
```

Repositorio Git conectado:

```text
nosfied/site-re7online
```

O mesmo repositorio tambem contem codigo operacional do Converta servido pela
VPS. Portanto, push Git no repositorio nao significa automaticamente que o site
publico `re7online.com` precisa ser rebuildado na Vercel.

Regra permanente:

- `re7online.com` e `www.re7online.com`: Vercel public site;
- `converta.re7online.com`, `admin.re7online.com` e `api.re7online.com`: VPS;
- deploy Vercel e deploy VPS sao trilhas separadas;
- commits somente de `docs/**`, tooling ops, backend `apps/whatsapp-agent/**`
  ou worker `apps/whatsapp-web-worker/**` nao devem gerar build Vercel quando
  nao alterarem arquivos do artefato Next publico;
- commits em `src/**`, `public/**`, dependencias/config de build raiz,
  `next.config.*` ou `vercel.json` continuam gerando build Vercel;
- `src/app/app/**` e `src/app/admin/**` sao operacionalmente servidos pela VPS,
  mas fazem parte do Next root que a Vercel compila. Por isso permanecem
  classificados como Vercel-relevantes ate existir separacao fisica de apps;
- branches `ops-*`, `repair-*` e docs-only nao devem ser promovidos/redeployados
  para Production casualmente;
- `source=redeploy` em deployment Vercel deve ser tratado como evento explicito
  de deployment, nao como comportamento normal de Preview por Git.

Controle versionado:

```text
vercel.json -> ignoreCommand: bash scripts/vercel-ignore-build.sh
```

Semantica Vercel:

- exit `0`: pular build/deployment;
- exit `1`: continuar build/deployment.

Validacao local:

```bash
bash scripts/test-vercel-ignore-build.sh
bash scripts/vercel-ignore-build.sh <base> <head>
```

Auditoria 2026-09-18:

- previews `4425923`, `a175bce` e `f8ad128` foram criados por `source=git`,
  `target=null`, branch `ops-demo-9614-repair-readiness-20260918`, sem aliases
  de producao;
- production deployment `2e043f67` foi observado como `source=redeploy`,
  `target=production`, com aliases `re7online.com`, `www.re7online.com`,
  `teste.re7online.com` e aliases Vercel do projeto;
- a origem exata do `redeploy` nao foi provada pelas ferramentas disponiveis;
  registrar como `UNKNOWN` se a auditoria Vercel nao expuser ator/mecanismo;
- nao alterar aliases, Production Branch ou dominio sem aprovacao explicita.

### 1. Site publico (`re7online.com`)
Usar quando mudar:
- `src/app/page.tsx`
- `src/app/sistemas/page.tsx`
- componentes do site institucional
- assets do site em `public/`

Passos:
1. commit e push no GitHub
2. abrir o painel da `Vercel` e localizar o deployment gerado para o commit/branch
3. se a mudanca saiu como preview, usar `Promote to Production` no deployment correto
4. confirmar que o commit promovido e o commit esperado
5. validar a URL publica

Exemplo real:
- o commit `e944250` alterava a pagina `/sistemas`
- o deploy/pull na VPS nao alterou `https://re7online.com/sistemas`
- a mudanca ficou visivel somente depois de promover o deployment do commit `e944250` para producao na Vercel

Observacao:
- `git pull` + `pm2 reload` na VPS nao publica alteracoes em `re7online.com`
- a VPS afeta `converta.re7online.com`, `admin.re7online.com` e os backends operacionais
- o site publico `re7online.com` depende de deployment/promocao na Vercel

### 2. Portal Converta / console interno (`converta.re7online.com`)
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

Se o header for da Vercel e o conteudo publico nao refletir o commit esperado, conferir no painel da Vercel se o deployment correto foi promovido para producao.

Validar Nginx da VPS:

```bash
sudo nginx -T | grep -n "server_name\\|location\\|proxy_pass" -A 4 -B 2
```

## Migracao de dominio do Converta

Dominio anterior:

```text
admin.re7online.com
```

Dominio oficial:

```text
converta.re7online.com
```

### DNS

No Cloudflare, criar/apontar:

```text
tipo: A
nome: converta
valor: 64.225.18.191
modo: Proxied ou DNS only, conforme politica atual
```

Enquanto a migracao nao estiver concluida, manter `admin.re7online.com` apontando para a VPS para rollback e redirecionamento.

Se o DNS de `converta.re7online.com` ainda nao estiver propagado, usar `admin.re7online.com` apenas como host SSH operacional para acessar a mesma VPS.

### Nginx / TLS na VPS

Requer acesso root/sudo na VPS:

```bash
sudo cp /etc/nginx/sites-available/admin.re7online.com /etc/nginx/sites-available/converta.re7online.com
sudo sed -i 's/admin\.re7online\.com/converta.re7online.com/g' /etc/nginx/sites-available/converta.re7online.com
sudo ln -s /etc/nginx/sites-available/converta.re7online.com /etc/nginx/sites-enabled/converta.re7online.com
sudo certbot --nginx -d converta.re7online.com
sudo nginx -t
sudo systemctl reload nginx
```

Depois de validar o novo dominio, converter `admin.re7online.com` em redirect 301 para `converta.re7online.com`:

```nginx
server {
    listen 443 ssl;
    server_name admin.re7online.com;

    ssl_certificate /etc/letsencrypt/live/admin.re7online.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/admin.re7online.com/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    return 301 https://converta.re7online.com$request_uri;
}
```

### Validacao

```bash
curl -I -sS https://converta.re7online.com/app/login
curl -I -sS https://converta.re7online.com/agent-api/health
curl -I -sS https://admin.re7online.com/app/login
```

Resultado esperado:
- `converta.re7online.com/app/login` responde pelo frontend do Converta;
- `converta.re7online.com/agent-api/health` responde pelo WhatsApp Agent;
- `admin.re7online.com/app/login` redireciona para o dominio novo, depois da fase de compatibilidade.

## Mapa curto

- `re7online.com` -> `Vercel`
- `converta.re7online.com` -> `VPS`
- `api.re7online.com` -> `VPS`
- `/sistemas` -> `Vercel`
- `/app/login` operacional -> `converta.re7online.com/app/login`
- backend `/agent-api` operacional -> `https://converta.re7online.com/agent-api`

## Decisao operacional atual

Para evitar ambiguidade:
- o site publico apresenta o card do sistema
- o acesso ao sistema direciona para o dominio oficial do Converta

Link oficial atual do card:

```text
https://converta.re7online.com/app/login
```
