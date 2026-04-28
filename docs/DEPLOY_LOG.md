# DEPLOY LOG

Registro minimo dos deploys manuais do `whatsapp-agent`.

Preencher a cada deploy:
- branch
- commit real (`git rev-parse --short HEAD`)
- horario
- migration
- executado por
- resultado
- observacoes

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
