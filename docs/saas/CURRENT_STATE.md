# Estado canônico do Converta

**TECHNICALLY DEPLOYED / PRODUCTION HEALTHY / META FUNCTIONAL ACCEPTANCE PENDING**

Esta é a entrada vigente de continuidade. A topologia operacional está definida
exclusivamente no [modelo de implantação](DEPLOYMENT_OPERATING_MODEL.md), e a
evidência sanitizada está no
[registro estruturado](releases/TEMPLATE_CAMPAIGN_MEDIA_2026-10-21_DEPLOYED.json).

## Produção viva — observação de 21/10/2026

- Target: `e2e7f17ac8fb9d0bdf7f73cf75455611101919b0`.
- Release: `immutable-e2e7f17a-20261022T005110Z`.
- API: `/opt/re7online/current/api`, entry SHA-256
  `304ef14eb3db321a4380af768534750ac0a6823438bdae6fb3cb265b5d11bff1`.
- Frontend: `/opt/re7online/current/frontend`, BUILD_ID
  `Tf6lBfPzPD-98Tt1mNRox`, Next direto em `fork_mode`, uma instância.
- Worker: runtime da mesma release, entry SHA-256
  `7d19a9b80da847de0d9234b7738dd919d86ffb3f3a495b6415b2de585a665afd`.
- Dump PM2: `398df404299f80658e45a593d910249e24adbe51f4d48942595b4e58544c2de6`,
  `deploy:deploy`, arquivo regular, modo `0600`, salvo exatamente uma vez.
- Retorno anterior preservado pelo dump
  `46be827b038f32175036ff547ca1c4ff1914146f6403b76efdebb740a4bf2d66`
  e pelas definições e symlinks capturados.
- Marker `DEPLOYED`:
  `26de23163d3ae5ca0b53703ee6462477649100dcc7278373c546583df3e98a1a`.
- Finalização: 21/10/2026, 22:42:06 America/Fortaleza.

PIDs são observações datadas, não identidades duráveis: API `2004819` (start ticks
`2241718959`), frontend `2005040` (`2241722491`) e worker `2005263`
(`2241726284`). Revalidá-los antes de qualquer futura mutação.

## Suporte técnico a mídia

O suporte a headers `IMAGE` e `VIDEO` em templates e campanhas está tecnicamente
implantado. API, frontend e worker executam o mesmo target. A migration
`20261021150000_add_template_campaign_media` foi persistida exatamente uma vez;
61/61 migrations foram confirmadas, sem pendência. O primeiro processo Prisma recebeu
`SIGABRT` depois da persistência; a verificação restrita posterior encerrou com código
zero e não repetiu a alteração do schema.

O backup PostgreSQL anterior à migration tem SHA-256
`dd7337b7468d15849053541b0eb83a42d8a5c23356c8ed54424444ce678c6a28`.
`TEMPLATE_MEDIA_ROOT` é `/opt/re7online/content/template-campaign-media`, pertence a
`deploy:deploy`, usa modo `0700` e fica fora da release imutável.

API local/pública, Login, Inbox, CRM, Templates e Campanhas responderam HTTP 200.
O smoke foi exclusivamente GET/read-only. Não houve chamada à Meta, criação ou
submissão de template, campanha, importação ou envio.

A implantação técnica está concluída e a produção está saudável. A homologação
funcional com a Meta e a liberação comercial/operacional para CRA-PR e demais clientes
continuam **PENDENTES** e exigem autorização separada.

A dívida `PREEXISTING_BATCH_ELIGIBILITY_N_PLUS_ONE` permanece no
[backlog independente](backlog/CAMPAIGN_SET_BASED_ELIGIBILITY_2026-10-21.md) e não
invalida a implantação técnica.

## Rota operacional

Build externo Linux x86_64 com Node v20.20.0/npm 10.8.2, release imutável em
`/opt/re7online/releases`, seleção pelos caminhos estáveis na ordem
API→frontend→worker quando impactado e um único `pm2 save` depois dos gates e do
aceite técnico.

`deploy-normal-release.sh`, build na VPS, checkout produtivo como runtime, Deploy V2,
PR #190 e frontend Next em `cluster_mode` são históricos/obsoletos e não são gates de
uma próxima release.
