# DEPLOY LOG — histórico legado

Este arquivo parou em abril de 2026 e é preservado como histórico incompleto. Ele
não é a fonte vigente de topologia nem um runbook executável.

O deploy ativo está no registro estruturado
[`TEMPLATE_ADMIN_SYNC_ORDERING_2026-10-24_DEPLOYED.json`](saas/releases/TEMPLATE_ADMIN_SYNC_ORDERING_2026-10-24_DEPLOYED.json).
A única instrução operacional vigente é
[`DEPLOYMENT_OPERATING_MODEL.md`](saas/DEPLOYMENT_OPERATING_MODEL.md).

As entradas abaixo mantêm sua redação histórica.

## Registro estruturado vigente — 2026-10-24

- target: `d7de6453aeab6d117e8d79a1dc3a0722875f39cc`
- release: `immutable-d7de6453-vps-20261024T221500Z`
- componentes selecionados: API e frontend; worker preservado no runtime
  `immutable-e2e7f17a-20261022T005110Z`
- BUILD_ID: `PkRjG2UDVfxCmwp-DKMQz`
- readiness: três amostras estáveis por componente; health avaliado depois da
  estabilidade dos listeners
- resultado: `DEPLOYED / PRODUCTION HEALTHY`
- persistência: um único `pm2 save`; dump
  `5d9ae04d6df29856318992638a66deccd29a68719c129be47453d4fd4b757e13`
- migration/SQL/Meta/templates/campanhas/importações/envios durante o deploy: zero
- horário: somente os limites registrados na evidência estruturada; nenhum horário
  novo foi inferido nesta reconciliação
- evidência: [registro sanitizado](saas/releases/TEMPLATE_ADMIN_SYNC_ORDERING_2026-10-24_DEPLOYED.json)

## Registro histórico substituído — 2026-10-22 17:30:39 BRT

- target: `5c339b2eeda52e21249844fc8b71a351d4311f03`
- release: `immutable-5c339b2e-20261022T125717Z`
- control plane: `90f04d8f2e47e0cd87c43bb8c26ff1cf33a1098d`
- componentes selecionados: API e frontend; worker preservado
- readiness: `wait-readiness` versionado, três amostras estáveis por componente
- resultado: `DEPLOYED / PRODUCTION HEALTHY`
- migration/SQL/Meta/templates/campanhas/importações/envios: zero
- evidência: [registro sanitizado](saas/releases/TEMPLATE_MEDIA_UX_HARDENING_2026-10-22_DEPLOYED.json)

## 2026-04-12 18:12 BRT

- branch: flow-executor-quote-hardening
- commit: 2ad5888
- migration: sim
- executado por: deifson
- resultado: ok
- observacoes: deploy Sprint 37 em producao

## 2026-04-12 18:22 BRT

- branch: flow-executor-quote-hardening
- commit: 9ec1e47
- migration: nao
- executado por: deifson
- resultado: ok
- observacoes: correcao do fluxo de templates para evitar registros fantasmas apos falha local de validacao

## 2026-04-12 20:51 BRT

- branch: flow-executor-quote-hardening
- commit: 678d9c7
- migration: nao
- executado por: deifson
- resultado: ok
- observacoes: deploy do RBAC backend da Sprint 38 com enforcement em conversas e CRM

## 2026-04-14 21:31 BRT

- branch: flow-executor-quote-hardening
- commit: 91921ae
- migration: sim
- executado por: deifson
- resultado: ok
- observacoes: deploy das Sprints 39 e 40 com metricas, SLA, relatorios, export CSV, health enriquecido e logs estruturados; agrupamento por atendente ainda dependia do owner atual

## 2026-04-28 14:01 BRT

- branch: flow-executor-quote-hardening
- commit: dbfcbd5
- migration: nao
- executado por: Codex/deploy
- resultado: ok
- observacoes: deploy da retencao de midia outbound local do inbox; backend passou a salvar copia em `.data/media/outbound`, servir local primeiro com fallback Meta, executar `npm run media:cleanup` e manter cron diario as 03:00 no usuario `deploy`; log do cron em `.data/logs/media-cleanup.log`; validado com `/health`, `/app/inbox` HTTP 200 e PM2 online

## 2026-04-30 08:06 BRT

- branch: flow-executor-quote-hardening
- commit: este commit (`git rev-parse --short HEAD` apos checkout/deploy)
- migration: nao
- executado por: Codex/deploy
- resultado: ok
- observacoes: documentacao da auditoria das superficies do `/app`, dependencias de dados e efeitos da retencao LGPD; `/app/reports` passou a avisar ADMIN quando a retencao esta menor que 30 dias; tenant `justa-advocacia` teve `RetentionConfig.retentionDays` ajustado para `90` dias diretamente na VPS para evitar nova limpeza agressiva durante validacao

## 2026-10-24 — Tenant-scoped Meta App ID / release imutável

- target: `a62da468ba1e703139181cecfa88d34f2066ccd1`
- control plane: `5ea7fa45a3693a14bdbf1d9d0a464dd61423b4ad`
- release: `immutable-a62da468-vps-20261024T124726Z`
- componentes: API e frontend; worker preservado
- build: único, Node v20.20.0/npm 10.8.2, worktree isolado na VPS após upgrade de
  RAM e autorização explícita; runtime vivo não foi usado como destino
- ativação: symlinks fixed-current atômicos e restart dos registros PM2 existentes
  sem `--update-env`; API antes do frontend; três amostras e smoke GET-only
- resultado: `DEPLOYED / PRODUCTION HEALTHY`
- BUILD_ID: `UToBpS3nIu9rzbWpDfnDw`
- dump PM2: `fec9b3417d4ea1e34b13840f5e3fea2b70a499220c0af124f039a87d8ce312cc`,
  modo `0600`, um único save depois do aceite
- migration/SQL/Meta/templates/campanhas/importações/envios: zero
- pendência: configurar o App ID somente no tenant autorizado em janela separada;
  nenhum fallback global foi aplicado
- registro: `docs/saas/releases/TENANT_META_APP_ID_2026-10-24_DEPLOYED.json`

## 2026-10-24 — Configuração tenant-scoped do Meta App ID / Converta Demo

- tenant: `demo-converta`
- diagnóstico: uma consulta `GET /debug_token` confirmou o vínculo atual do token
  armazenado com o aplicativo e as permissões necessárias; não recupera o histórico
  original do onboarding
- configuração: um PUT administrativo tenant-scoped, com proveniência
  `embedded_signup` e confirmação explícita de escopo
- verificação: `configured=true`, `source=tenant_app_id`; token, WABA, número,
  demais propriedades e outros tenants preservados
- auditoria: um evento sanitizado, sem App ID
- Meta mutante/upload/sincronização/submissão/campanha/importação/envio: zero
- resultado: `CONFIGURED_VERIFIED / FUNCTIONAL_META_ACCEPTANCE_PENDING`
- registro: `docs/saas/releases/CONVERTA_DEMO_META_APP_ID_2026-10-24_CONFIGURED.json`

## 2026-10-24 — Diagnóstico de upload implantado e homologação de vídeo

- target: `ec2a9fde99b6421a85256f14604bd469879f4f2a`
- release: `immutable-ec2a9fde-vps-20261024T162005Z`
- BUILD_ID: `7yArOSyfllnPiQy_vAS9H`
- componentes: API e frontend; worker preservado
- resultado do deploy: `DEPLOYED / PRODUCTION HEALTHY`
- `pm2 save`: uma execução; dump
  `afd1c1c20483708ac2f51f0ffde09c2affb8d62e4a1426cb233288fda0753e59`
- homologação: `video_previdencia_teste_20261024`, uma submissão Meta
- resultado Meta: negativa determinística em `binary_upload`, HTTP 400, código 100,
  subcódigo 33; solicitação persistida como `failed`
- retry/sync adicional/campanha/importação/envio: zero
- registros:
  `docs/saas/releases/TEMPLATE_MEDIA_UPLOAD_DIAGNOSTICS_2026-10-24_DEPLOYED.json` e
  `docs/saas/releases/CONVERTA_DEMO_VIDEO_TEMPLATE_HOMOLOGATION_2026-10-24.json`

## 2026-10-24 — Atualização isolada da API de upload assinado

- target: `ef7db11179a1be14160e0f7ceec9f01a8aaf0ece`
- release: `immutable-ef7db111-vps-20261024T174000Z`
- componente selecionado: API; frontend e worker preservados
- identidade observada da API: PID `74684`, start ticks `2011482`
- finalização: exatamente um `pm2 save`; dump
  `fd1513febc2c91d4ff0efbf303a44e44991b26265da2759b414b31121d769e88`
- marker `DEPLOYED`:
  `c7e629dea342b98c3b5d25cb651ab3997749ca45fbd98074a9d7eb7bcf375e58`
- journal: `DEPLOYED`; lock canônico liberado
- horário: não acrescentado; esta reconciliação não possui nova observação temporal
- registro:
  `docs/saas/releases/TEMPLATE_MEDIA_UPLOAD_SESSION_SIGNATURE_API_2026-10-24_DEPLOYED.json`

## 2026-10-24 — Homologação manual de vídeo / submissão aceita

- tenant: `demo-converta`
- solicitação: `video_previdencia_teste_20261024_v2`
- API observada: target `ef7db11179a1be14160e0f7ceec9f01a8aaf0ece`, release
  `immutable-ef7db111-vps-20261024T174000Z`
- upload: concluído; mídia `ready`; handle confirmado e não publicado
- persistência: uma solicitação, um evento `template.request.submitted_to_meta`,
  um template e um identificador Meta; duplicidade ausente
- submissão Meta: aceita
- aprovação Meta: não confirmada; estado observado `PENDING`
- falhas históricas: preservadas; causalidade `NOT_PROVEN`
- esta reconciliação: somente evidências locais; zero chamada Meta, sync, upload,
  submissão, envio ou alteração de dados
- registro:
  `docs/saas/releases/CONVERTA_DEMO_VIDEO_TEMPLATE_HOMOLOGATION_ACCEPTED_2026-10-24.json`
