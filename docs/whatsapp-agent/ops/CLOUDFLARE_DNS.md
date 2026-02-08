# Cloudflare DNS para api.re7online.com

## 1) Registro DNS
- Tipo: `A`
- Nome: `api`
- Conteúdo: IP público do VPS
- Proxy: começar com `DNS only`

## 2) Validação inicial
- Aguarde propagação
- Teste:
  - `http://api.re7online.com/health`
  - `https://api.re7online.com/health` (após SSL)

## 3) Migrar para Proxied (opcional)
- Depois de estável, habilite nuvem laranja (proxied)
- Crie regras para não cachear:
  - `/webhook*`
  - `/health*`

Sugestão: Cache Level = Bypass para esses caminhos.
