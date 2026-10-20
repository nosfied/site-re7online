# Deploy em VPS com PM2

> [!WARNING]
> O antigo fluxo `git pull → build no checkout vivo → reload` foi retirado. Ele não
> possui rollback integral e não é rota de produção.

O procedimento canônico está em
[`docs/saas/DEPLOYMENT_OPERATING_MODEL.md`](../../saas/DEPLOYMENT_OPERATING_MODEL.md)
e é executado por `scripts/deploy-normal-release.sh`.

## Planejar sem efeito

```bash
git -C /opt/re7online/site-re7online fetch origin review/campaign-recovery-20260926
git -C /opt/re7online/site-re7online worktree add --detach \
  /opt/re7online/deploy-control/<sha-canônico-curto> <sha-canônico-completo>
cd /opt/re7online/deploy-control/<sha-canônico-curto>
scripts/deploy-normal-release.sh plan <base-ref> <target-ref>
```

O checkout produtivo pode permanecer detached. Ele não recebe `pull`, `switch` ou
`checkout`; o worktree de controle fica preso ao SHA canônico aprovado.

## Preparar sem tocar PM2

```bash
scripts/deploy-normal-release.sh prepare <base-ref> <target-ref>
```

A preparação da API espelha o CI: `npm ci --include=dev`, depois
`npm run db:generate` e somente então `npm run build`. Se uma preparação for
interrompida antes dos manifests, preserve seu inventário e mova o diretório para
`/opt/re7online/releases/failed-preparations/`; nunca reutilize o payload parcial.

## Ativar o SHA aprovado

```bash
DEPLOY_APPROVED_SHA=<sha-completo> \
  scripts/deploy-normal-release.sh activate /opt/re7online/releases/normal-<sha-curto>
```

O executor resolve o PM2 mesmo em shell SSH não interativo, consultando o PATH e,
em seguida, `~/.npm-global/bin`, `~/.local/bin` e `/usr/local/bin`. Não é
necessário editar perfil de shell nem exportar PATH manualmente.

A faixa normal recusa migration/schema, dependências, worker, credenciais,
root/rede e impacto desconhecido. Esses casos usam `BREAK_GLASS` em janela própria.
O healthcheck frontend canônico é `http://127.0.0.1:3000/app/login`.

O caminho legado `apps/whatsapp-agent/scripts/deploy-vps.sh` aceita somente
`--dry-run`; qualquer tentativa de mutação termina com erro e direciona ao executor
canônico.
