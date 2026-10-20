# Estado canônico do Converta

**DEPLOYED / FIXED CURRENT RUNTIME ESTABLISHED / PRODUCTION HEALTHY**

Esta é a entrada vigente de continuidade. A topologia operacional está definida
exclusivamente no [modelo de implantação](DEPLOYMENT_OPERATING_MODEL.md), e a
evidência sanitizada está no
[registro estruturado](releases/CRM_CONTACTS_LIST_RECOVERY_2026-10-20_DEPLOYED.json).

## Produção viva — observação de 20/10/2026

- Target funcional: `f5028de1e530666623dcc95519e744350671cb02`.
- Release: `immutable-f5028de1-20261020T181603Z`.
- API: `/opt/re7online/current/api`, entry SHA-256
  `304ef14eb3db321a4380af768534750ac0a6823438bdae6fb3cb265b5d11bff1`.
- Frontend: `/opt/re7online/current/frontend`, BUILD_ID
  `tWMOJcXoyjKezPbKzVD_i`, Next direto em `fork_mode`, uma instância.
- Worker: preservado, fora desta promoção.
- Dump PM2: `ba18a647d15fdc176ce72a81b229ae1c0a821d69196c989ca78c12aeac65a0e2`,
  arquivo regular, modo `0600`.
- Retorno anterior: dump
  `a99667587ccee0ee884ed31aa304c714e276e86f6db86ba418238171508a2cf0` e
  definições completas privadas capturadas antes da seleção.
- Janela: 20/10/2026, aproximadamente 15:53–15:57 America/Fortaleza.

PIDs são observações datadas, não identidades duráveis: API `1763306`, frontend
`1763532` e worker `936540`. Revalidá-los antes de qualquer futura mutação.

## Resultado funcional e limites

Health local/público, Login, Inbox, CRM e asset `_next` responderam HTTP 200. O
smoke foi GET/read-only; não houve POST funcional, SQL, migration, importação,
campanha ou envio. O isolamento multitenant e o RBAC existentes foram preservados.

## Rota operacional

Build externo Linux x86_64 com Node v20.20.0/npm 10.8.2, release imutável em
`/opt/re7online/releases`, seleção API→frontend pelos caminhos estáveis e um único
`pm2 save` após os gates. O worker só entra quando a matriz comprovar impacto.

`deploy-normal-release.sh`, build na VPS, checkout produtivo como runtime, Deploy
V2, PR #190 e frontend Next em `cluster_mode` são históricos/obsoletos e não são
gates de uma próxima release.
