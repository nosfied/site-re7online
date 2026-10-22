# Índice documental vigente

> [!IMPORTANT]
> Comece pelo [estado canônico](CURRENT_STATE.md). A única instrução operacional
> vigente de deploy é o
> [modelo de releases imutáveis](DEPLOYMENT_OPERATING_MODEL.md).

## Estado ativo

- [Estado legível](CURRENT_STATE.md)
- [Estado verificável](CURRENT_STATE.json)
- [Reativação do hardening de mídia com readiness versionado](releases/TEMPLATE_MEDIA_UX_HARDENING_2026-10-22_DEPLOYED.json)
- [Topologia de domínios e runtimes](../DEPLOY_TOPOLOGY_RE7.md)
- [Checklist de release](RELEASE_CHECKLIST.md)
- [Controle de definições PM2 e incidente de contaminação](PM2_DEFINITION_CONTAMINATION_INCIDENT_2026-10-22.md)
- [Política de mudanças](CHANGE_POLICY.md)

## Evidência funcional entregue

- [Suporte a mídia em templates e campanhas](META_TEMPLATE_MEDIA_SUPPORT.md)
  — tecnicamente implantado; homologação Meta e liberação aos clientes pendentes.
- [Redesenho set based do read model de contatos](CRM_CONTACTS_READ_MODEL_REDESIGN_2026-10-20.md)
  — implantado e verificado em 21/10/2026.
- [Paginação por cursor e overlay de processamento do CRM](backlog/CRM_CONTACTS_CURSOR_PAGINATION_AND_LOADING_OVERLAY_2026-10-20.md)
  — implementação entregue; contexto inicial preservado como histórico.

## Backlog ativo separado

- [Adequar encerramento e CSAT à janela de 24h](backlog/WHATSAPP_CSAT_24H_WINDOW_2026-10-19.md)
- [Elegibilidade set based de campanhas](backlog/CAMPAIGN_SET_BASED_ELIGIBILITY_2026-10-21.md)
  — `PREEXISTING_BATCH_ELIGIBILITY_N_PLUS_ONE`; não bloqueia o deploy técnico.
- OBS-1 — preparação concluída; rotação exige janela própria.

## Arquivo histórico

- [Deploy técnico inicial de mídia em templates e campanhas](releases/TEMPLATE_CAMPAIGN_MEDIA_2026-10-21_DEPLOYED.json)
  — release substituída, preservada como evidência da migration e do storage persistente.
- [Deploy CRM Contacts Cursor/Read Model](releases/CRM_CONTACTS_CURSOR_READ_MODEL_2026-10-21_DEPLOYED.json)
  — release substituída, preservada como evidência funcional da lista CRM.
- [Deploy anterior da recuperação da lista](releases/CRM_CONTACTS_LIST_RECOVERY_2026-10-20_DEPLOYED.json)
  — release substituída, preservada como evidência.
- [Log Markdown legado](../DEPLOY_LOG.md) — incompleto após abril de 2026; arquivo,
  não instrução operacional.
- [Manifesto da preparação normal reprovada](releases/CRM_CONTACTS_LIST_RECOVERY_2026-10-20_NORMAL_RELEASE.json)
  — estado na criação, não estado produtivo.
- [Análise funcional da correção](CRM_CONTACTS_LIST_RECOVERY_2026-10-19.md)
  — evidência local anterior ao deploy.
- [Padrão artifact-bound](ARTIFACT_RELEASE_ENGINEERING_STANDARD.md),
  [runbook artifact-bound](ARTIFACT_RELEASE_RUNBOOK.md) e
  [Deploy V2](DEPLOY_V2_ADAPTER_CONTRACT.md) — tentativas históricas/break-glass,
  não gates atuais.
- Preparações, rehearsals, controles e verificadores single-use de 19–20/10 são
  preservados como evidência e não podem ser executados novamente.

O checkout produtivo, build na VPS, `deploy-normal-release.sh`, PR #190 e Next em
`cluster_mode` estão obsoletos. Nenhum documento histórico prevalece sobre o
modelo operacional canônico.
