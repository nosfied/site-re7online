# Estado canônico do Converta

**DEPLOYED / PRODUCTION HEALTHY**

Esta é a entrada vigente de continuidade. A topologia operacional está definida
exclusivamente no [modelo de implantação](DEPLOYMENT_OPERATING_MODEL.md), e a
evidência sanitizada está no
[registro estruturado](releases/CRM_CONTACTS_CURSOR_READ_MODEL_2026-10-21_DEPLOYED.json).

## Produção viva — observação de 21/10/2026

- Target: `c085e53f752a9b31fa7dd6d03896da07e3f159e3`.
- Release: `immutable-c085e53f-20261021T094952Z`.
- API: `/opt/re7online/current/api`, entry SHA-256
  `304ef14eb3db321a4380af768534750ac0a6823438bdae6fb3cb265b5d11bff1`.
- Frontend: `/opt/re7online/current/frontend`, BUILD_ID
  `nU1xG2ZoXQXicAagrcjtp`, Next direto em `fork_mode`, uma instância.
- Worker: preservado, sem ativação ou reinicialização nesta janela.
- Dump PM2: `46be827b038f32175036ff547ca1c4ff1914146f6403b76efdebb740a4bf2d66`,
  arquivo regular, modo `0600`, salvo exatamente uma vez.
- Rollback preservado:
  `ba18a647d15fdc176ce72a81b229ae1c0a821d69196c989ca78c12aeac65a0e2`.
- Janela: 21/10/2026, 07:11:57–07:24:54 America/Fortaleza.

PIDs são observações datadas, não identidades duráveis: API `1887618` (start ticks
`2236191937`), frontend `1887719` (`2236192803`) e worker `936540`
(`2193413523`). Revalidá-los antes de qualquer futura mutação.

## Funcionalidade implantada

A lista CRM usa paginação keyset em `updatedAt DESC, createdAt DESC, id ASC`, cursor
vinculado ao tenant, filtros, limite e visibilidade, enriquecimento somente dos IDs da
página e read model set based. Vínculos diretos de contato têm prioridade; fallback
legado ocorre somente sem vínculo direto. Lifecycle, exclusão, anonimização, conversa
e opt-out são conjuntos tenant scoped. Totais exatos, página vazia após cursor,
ordenação externa, histórico de navegação, overlay por tokens e carga independente de
status estão implantados sem migration ou índice novo.

Health local/público, Login, Inbox, CRM e asset `_next` responderam HTTP 200. O
aceite manual tenant scoped foi PASS e o smoke foi GET-only. Não houve POST funcional,
SQL, migration, importação, campanha ou envio. RBAC e isolamento multitenant foram
preservados.

## Rota operacional

Build externo Linux x86_64 com Node v20.20.0/npm 10.8.2, release imutável em
`/opt/re7online/releases`, seleção API→frontend pelos caminhos estáveis e um único
`pm2 save` depois dos gates. O worker só entra quando a matriz comprovar impacto.

`deploy-normal-release.sh`, build na VPS, checkout produtivo como runtime, Deploy V2,
PR #190 e frontend Next em `cluster_mode` são históricos/obsoletos e não são gates de
uma próxima release.
