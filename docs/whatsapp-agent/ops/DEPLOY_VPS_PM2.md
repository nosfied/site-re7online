# Deploy VPS / PM2

> Fonte canônica: [modelo operacional do Converta](../../saas/DEPLOYMENT_OPERATING_MODEL.md).

O PM2 seleciona releases imutáveis exclusivamente por
`/opt/re7online/current/api` e `/opt/re7online/current/frontend`. O build é
externo com Node v20.20.0; a VPS não executa build normal.

A promoção é API→frontend. O frontend executa o Next diretamente em `fork_mode`,
uma instância. O worker permanece intacto quando não houver impacto. Health e smoke
são GET-only, e `pm2 save` ocorre uma vez após todos os gates.

O fluxo antigo `git pull → build no checkout → reload`,
`scripts/deploy-normal-release.sh`, PR #190 e Next em `cluster_mode` são
históricos/obsoletos e não devem ser executados.
