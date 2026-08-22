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

## WhatsApp Web Worker — shared source dependency

O `apps/whatsapp-web-worker` compila parte do codigo de `apps/whatsapp-agent/src`
no proprio artefato. O `tsconfig.json` do worker inclui:

- `apps/whatsapp-agent/src/channels/channelAccountSecretCrypto.ts`
- `apps/whatsapp-agent/src/db.ts`
- `apps/whatsapp-agent/src/features/clientFeatures.ts`
- `apps/whatsapp-agent/src/logger/logger.ts`
- `apps/whatsapp-agent/src/web-session/**/*.ts`
- imports transitivos usados por esses modulos

Regra operacional: se qualquer arquivo de `apps/whatsapp-agent/src` usado direta
ou indiretamente pelo worker mudar, nao trate a alteracao como apenas
`re7-whatsapp-agent`. Execute tambem:

```bash
npm --prefix apps/whatsapp-agent run build
npm --prefix apps/whatsapp-web-worker run build
pm2 reload re7-whatsapp-web-worker
```

Quando o artefato efetivo do worker mudar, o reload do
`re7-whatsapp-web-worker` e obrigatorio. Um incidente real mostrou que uma
mudanca em codigo compartilhado de fila ficou correta em
`apps/whatsapp-agent/dist`, mas stale em
`apps/whatsapp-web-worker/dist/whatsapp-agent/src/...` ate o worker ser
rebuildado e recarregado.

Checklist minimo de deploy:

1. Conferir `git status` e `git diff --name-only`.
2. Identificar arquivos alterados.
3. Verificar se o worker importa esses arquivos direta ou indiretamente.
4. Rodar build backend quando houver alteracao em `apps/whatsapp-agent`.
5. Rodar build worker quando houver dependencia compartilhada.
6. Confirmar que o `dist` do worker foi atualizado.
7. Recarregar somente os servicos afetados no PM2.
8. Confirmar health API/DB/agent-api.
9. Confirmar canais Web Session esperados como `CONNECTED`.
10. Confirmar ausencia de novo `QR_REQUIRED` ou 401 apos reload.

## Futuro: replicar para clientes
- Mesmo código, outro subdomínio (ex.: `api.cliente.com`)
- Outro `.env` por cliente (tokens/phone ID/verify token isolados)
- Storage isolado por pasta `.data/` de cada instância
- Recomendação próxima fase: adicionar `WORKSPACE_ID` para multi-tenant nativo
