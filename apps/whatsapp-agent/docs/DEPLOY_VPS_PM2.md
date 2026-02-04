# Deploy em VPS com PM2

## 1) Pré-requisitos
- Ubuntu/Debian com acesso root/sudo
- Node.js 20+ e npm
- PM2 global

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git
sudo npm install -g pm2
```

## 2) Estrutura no servidor

```bash
sudo mkdir -p /opt/re7online
sudo chown -R $USER:$USER /opt/re7online
cd /opt/re7online
```

## 3) Copiar código
Opção A (git):

```bash
git clone <repo-url> site-re7online
cd site-re7online/apps/whatsapp-agent
```

Opção B (rsync): sincronizar apenas `apps/whatsapp-agent`.

## 4) Build

```bash
npm ci
npm run build
```

## 5) Configurar .env
Crie `apps/whatsapp-agent/.env` com variáveis essenciais:
- `PORT=3001`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `META_APP_SECRET` (recomendado)
- `WHATSAPP_SANDBOX`, `WHATSAPP_SANDBOX_TO` (se sandbox)
- `WHATSAPP_AI_ENABLED`, `OPENAI_API_KEY` (se IA ativa)

Nunca versionar `.env`.

## 6) Subir com PM2

```bash
npm run pm2:start
pm2 save
pm2 startup
```

Comando de atualização:

```bash
npm run build
npm run pm2:reload
```

## 7) Operação

```bash
pm2 status
pm2 logs re7-whatsapp-agent
pm2 restart re7-whatsapp-agent
```

## Futuro: replicar para clientes
- Mesmo código, outro subdomínio (ex.: `api.cliente.com`)
- Outro `.env` por cliente (tokens/phone ID/verify token isolados)
- Storage isolado por pasta `.data/` de cada instância
- Recomendação próxima fase: adicionar `WORKSPACE_ID` para multi-tenant nativo
