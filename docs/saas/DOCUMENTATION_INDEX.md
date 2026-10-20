# Índice documental vigente

> [!IMPORTANT]
> Comece pelo [estado canônico](CURRENT_STATE.md). A única instrução operacional
> vigente de deploy é o
> [modelo de releases imutáveis](DEPLOYMENT_OPERATING_MODEL.md).

## Estado ativo

- [Estado legível](CURRENT_STATE.md)
- [Estado verificável](CURRENT_STATE.json)
- [Deploy CRM Contacts List Recovery](releases/CRM_CONTACTS_LIST_RECOVERY_2026-10-20_DEPLOYED.json)
- [Topologia de domínios e runtimes](../DEPLOY_TOPOLOGY_RE7.md)
- [Checklist de release](RELEASE_CHECKLIST.md)
- [Política de mudanças](CHANGE_POLICY.md)

## Backlog ativo separado

- [Adequar encerramento e CSAT à janela de 24h](backlog/WHATSAPP_CSAT_24H_WINDOW_2026-10-19.md)
- OBS-1 — preparação concluída; rotação exige janela própria.

## Arquivo histórico

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
