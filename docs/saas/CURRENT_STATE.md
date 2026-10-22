# Estado canônico do Converta

**DEPLOYED / PRODUCTION HEALTHY / META FUNCTIONAL ACCEPTANCE PENDING**

Esta é a entrada vigente de continuidade. A topologia operacional está definida
exclusivamente no [modelo de implantação](DEPLOYMENT_OPERATING_MODEL.md), e a
evidência sanitizada está no
[registro estruturado](releases/TEMPLATE_MEDIA_UX_HARDENING_2026-10-22_DEPLOYED.json).

## Produção viva — observação de 22/10/2026

- Target da aplicação: `5c339b2eeda52e21249844fc8b71a351d4311f03`.
- Release: `immutable-5c339b2e-20261022T125717Z`.
- Control plane versionado: `90f04d8f2e47e0cd87c43bb8c26ff1cf33a1098d`.
- API: `/opt/re7online/current/api`, entry SHA-256
  `304ef14eb3db321a4380af768534750ac0a6823438bdae6fb3cb265b5d11bff1`.
- Frontend: `/opt/re7online/current/frontend`, BUILD_ID
  `9nXekPSOrJsLjOlofmaPI`, Next direto em `fork_mode`, uma instância.
- Worker preservado no runtime anterior, sem seleção ou restart.
- Dump PM2: `41830f80657ace643b42818865de810cb2c0bae3e77027b752004c1db06cfeb5`,
  `deploy:deploy`, arquivo regular, modo `0600`, salvo exatamente uma vez.
- Retorno anterior preservado pelo dump
  `398df404299f80658e45a593d910249e24adbe51f4d48942595b4e58544c2de6`
  e pelas definições autenticadas e symlinks capturados.
- Marker `DEPLOYED`:
  `1a930d012bc8db9d6144192b6c8d7fd6820d7a6e5bf2cc1f7a3d8f2c9c6fe231`.
- Finalização: 22/10/2026, 17:30:39 America/Fortaleza.

PIDs são observações datadas, não identidades duráveis: API `2160744` (start ticks
`2248483396`), frontend `2160988` (`2248491338`) e worker `2005263`
(`2241726284`). Revalidá-los antes de qualquer futura mutação.

## Readiness e limites da janela

API e frontend foram admitidos pelo comando versionado
`scripts/pm2-definition-control.py wait-readiness`, com prazo monotônico de 30
segundos, polling máximo de 500 ms e três amostras consecutivas. PID, start ticks,
symlink, identidade da release e socket `DIRECT` permaneceram estáveis; health local
e público foi consultado somente depois da estabilidade do listener.

API local/pública, Login, Inbox, CRM, Modelos, Campanhas e asset responderam HTTP
200. O smoke foi exclusivamente GET/read-only e recebeu aceite técnico explícito.
Não houve migration, SQL, chamada à Meta, criação ou submissão de template,
campanha, importação ou envio. A classificação de schema desta implantação é
`NOT_APPLICABLE_NO_SCHEMA_CHANGE`.

O suporte a mídia continua tecnicamente implantado. A homologação funcional com a
Meta e a liberação comercial/operacional para clientes continuam **PENDENTES** e
exigem autorização separada. A migration aditiva da implantação anterior permanece
registrada; ela não foi executada novamente nesta janela.

A dívida `PREEXISTING_BATCH_ELIGIBILITY_N_PLUS_ONE` permanece no
[backlog independente](backlog/CAMPAIGN_SET_BASED_ELIGIBILITY_2026-10-21.md) e não
invalida esta implantação técnica.

## Rota operacional

Build externo Linux x86_64 com Node v20.20.0/npm 10.8.2, release imutável em
`/opt/re7online/releases`, seleção pelos caminhos estáveis na ordem
API→frontend→worker quando impactado, readiness versionado e um único `pm2 save`
depois dos gates e do aceite técnico.

`deploy-normal-release.sh`, build na VPS, checkout produtivo como runtime, Deploy V2,
PR #190, frontend Next em `cluster_mode` e executor temporário em `/tmp` são
históricos/obsoletos e não são gates de uma próxima release.
