# DEPLOY LOG — histórico legado

Este arquivo parou em abril de 2026 e é preservado como histórico incompleto. Ele
não é a fonte vigente de topologia nem um runbook executável.

O deploy ativo está no registro estruturado
[`TEMPLATE_MEDIA_UX_HARDENING_2026-10-22_DEPLOYED.json`](saas/releases/TEMPLATE_MEDIA_UX_HARDENING_2026-10-22_DEPLOYED.json).
A única instrução operacional vigente é
[`DEPLOYMENT_OPERATING_MODEL.md`](saas/DEPLOYMENT_OPERATING_MODEL.md).

As entradas abaixo mantêm sua redação histórica.

## Registro estruturado vigente — 2026-10-22 17:30:39 BRT

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
