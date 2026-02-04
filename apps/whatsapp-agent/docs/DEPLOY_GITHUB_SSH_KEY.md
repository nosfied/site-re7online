# Deploy key GitHub (SSH) para VPS

## 1) Gerar chave no VPS
No servidor, dentro do repo:

```bash
bash apps/whatsapp-agent/scripts/print-deploy-key.sh
```

O script gera (se nao existir):
- `~/.ssh/re7online_github_deploy`
- `~/.ssh/re7online_github_deploy.pub`

E imprime apenas a chave publica.

## 2) Cadastrar no GitHub
No repositório `nosfied/site-re7online`:
- Settings
- Deploy keys
- Add deploy key
- Cole a chave publica impressa
- Preferir **read-only** (nao marcar write access, salvo necessidade explicita)

## 3) Testar conexao SSH

```bash
ssh -T git@github.com
```

Se necessario, force a chave dedicada com `~/.ssh/config`.

## 4) Clonar via SSH

```bash
git clone git@github.com:nosfied/site-re7online.git /opt/re7online/site-re7online
```

Depois execute o deploy:

```bash
bash /opt/re7online/site-re7online/apps/whatsapp-agent/scripts/deploy-vps.sh
```
