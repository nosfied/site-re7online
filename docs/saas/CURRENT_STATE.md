# Estado canônico do Converta

**DEPLOYED / PRODUCTION HEALTHY / TENANT META APP ID CONFIGURATION PENDING**

Esta é a entrada vigente de continuidade. A topologia operacional está definida
no [modelo de implantação](DEPLOYMENT_OPERATING_MODEL.md), e a evidência
sanitizada está no
[registro estruturado](releases/TENANT_META_APP_ID_2026-10-24_DEPLOYED.json).

## Produção viva — observação de 24/10/2026

- Target da aplicação: `a62da468ba1e703139181cecfa88d34f2066ccd1`.
- Release: `immutable-a62da468-vps-20261024T124726Z`.
- Control plane: `5ea7fa45a3693a14bdbf1d9d0a464dd61423b4ad`.
- API: `/opt/re7online/current/api`, entry SHA-256
  `304ef14eb3db321a4380af768534750ac0a6823438bdae6fb3cb265b5d11bff1`.
- Frontend: `/opt/re7online/current/frontend`, BUILD_ID
  `UToBpS3nIu9rzbWpDfnDw`, Next direto em `fork_mode`, uma instância.
- Worker preservado no runtime `immutable-e2e7f17a-20261022T005110Z`, sem seleção
  ou restart.
- Dump PM2: `fec9b3417d4ea1e34b13840f5e3fea2b70a499220c0af124f039a87d8ce312cc`,
  `deploy:deploy`, arquivo regular, modo `0600`, salvo exatamente uma vez.
- Retorno anterior preservado pelo dump
  `41830f80657ace643b42818865de810cb2c0bae3e77027b752004c1db06cfeb5`
  e pelos symlinks e registros PM2 capturados.
- Marker `DEPLOYED`:
  `85cb006e15f68e3afe701c5c92b6f55864c5359c2d3bcde864b8c0900547416b`.

PIDs são observações datadas: API `29766` (start ticks `519561`), frontend
`29844` (`520267`) e worker `2233` (`17758`). Release, hashes, BUILD_ID e dump
são as identidades duráveis; revalidar os PIDs antes de outra mutação.

## Build, ativação e limites

Após o upgrade de RAM, o owner autorizou um build único na VPS em worktree isolado,
fora do runtime ativo, com Node v20.20.0/npm 10.8.2. Os serviços produtivos não
foram parados para o build. O payload compilado foi congelado e verificado como
release imutável; nenhum build ocorreu durante a ativação.

A primeira embalagem omitiu um módulo válido porque o produtor confundiu o segmento
`uploads` interno de `node_modules/openai` com dados operacionais. A correção limita
essa denylist aos caminhos da aplicação, mantém uploads reais proibidos e possui
regressão. O payload compilado existente foi reutilizado, sem novo `npm`, Prisma ou
build. Pacote, manifesto e índice corrigidos foram autenticados; a preparação
incompleta e as duas tentativas encerradas pelo driver permanecem como histórico.

A ativação comprovada usou o fluxo simples dirigido sobre a topologia fixed-current:
troca atômica dos symlinks, restart dos registros PM2 existentes sem `--update-env`,
API antes do frontend, três amostras estáveis e smoke GET-only. O ambiente privado
completo já armazenado pelo PM2 foi preservado. API local/pública retornou HTTP 200,
`ok=true` e `db="ok"`; Login, Inbox, CRM, Modelos, Campanhas e asset retornaram
HTTP 200. O aceite técnico antecedeu o único `pm2 save` e o marker.

Não houve migration, SQL, mudança de tenant/RBAC, chamada à Meta, template,
campanha, importação ou envio. O mecanismo tenant-scoped de Meta App ID está
tecnicamente implantado, mas a configuração do tenant Converta Demo continua
**PENDENTE** e exige janela separada. Não usar fallback global.

## Rota operacional

O modelo vigente é build once / promote the same artifact em worktree isolado e
com capacidade comprovada. O builder externo continua preferencial; build na VPS
exige decisão explícita do owner, capacidade aferida e isolamento do runtime vivo.
Releases permanecem imutáveis em `/opt/re7online/releases`; seleção usa os caminhos
estáveis API→frontend, worker apenas quando impactado, readiness em três amostras,
smoke GET-only, aceite e um único `pm2 save`.

Build no checkout/runtime ativo, `deploy-normal-release.sh`, Deploy V2, PR #190,
Next em `cluster_mode` e executores temporários em `/tmp` são históricos/obsoletos.
As tentativas anteriores com `converta-deploy.py` são evidência desta janela e não
instruções para sua repetição.

A dívida `PREEXISTING_BATCH_ELIGIBILITY_N_PLUS_ONE` permanece no
[backlog independente](backlog/CAMPAIGN_SET_BASED_ELIGIBILITY_2026-10-21.md) e não
invalida esta implantação.
