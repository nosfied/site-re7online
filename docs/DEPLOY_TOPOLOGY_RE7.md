# Topologia de deploy Re7

O site público `re7online.com` é publicado na Vercel. O portal Converta e sua API,
em `converta.re7online.com`, são servidos pela VPS via Nginx e PM2.

## Converta — topologia vigente

- releases imutáveis: `/opt/re7online/releases/<release-id>`;
- API estável: `/opt/re7online/current/api` → release aprovada;
- frontend estável: `/opt/re7online/current/frontend` → release aprovada;
- API: Node v20.20.0, porta 3001;
- frontend: Next direto, `fork_mode`, uma instância, porta 3000;
- worker: release própria e fora do deploy quando não impactado;
- build: único e isolado, Linux x86_64, Node v20.20.0/npm 10.8.2; externo por
  padrão, ou na VPS somente por autorização explícita e capacidade comprovada;
- ordem: API, frontend, smoke GET-only, aceite aplicável, um `pm2 save`.
- definições PM2: estrutura explícita e ambiente privado allowlisted pelo contrato
  versionado; introspecção (`jlist`, dump, `pm2_env` ou `/proc/.../environ`) nunca é
  definição executável;
- candidato e retorno: artefatos-fonte privados, proveniências e identidades de
  release autenticados por hashes externos e distintos, aprovados por
  `validate-pair`; a configuração PM2 pode ser idêntica sob `/current`. A prova em
  daemon isolado compara a identidade lexical do PM2, o symlink e a release física.

A instrução completa e única está em
[DEPLOYMENT_OPERATING_MODEL.md](saas/DEPLOYMENT_OPERATING_MODEL.md). O estado vivo
está em [CURRENT_STATE.md](saas/CURRENT_STATE.md).

## Fronteira Vercel × VPS

- mudanças no site institucional e em `re7online.com`: Vercel;
- mudanças em `converta.re7online.com`, API operacional e WhatsApp Agent: release
  imutável na VPS;
- promover na VPS não publica o site institucional na Vercel.

## Histórico não canônico

Os comandos antigos de `git pull/checkout`, build no checkout/runtime ativo e
`pm2 reload --update-env` foram retirados. O checkout produtivo não é runtime nem
destino de build. `scripts/deploy-normal-release.sh`, o pipeline da PR #190 e
frontend Next em `cluster_mode` são históricos e não utilizáveis.
