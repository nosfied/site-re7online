# Índice documental vigente

> [!IMPORTANT]
> A release viva é `CRM CSV UX e normalização de telefone`, promovida e verificada
> em 18/10/2026. Comece por [CURRENT_STATE.md](CURRENT_STATE.md) e
> [CURRENT_STATE.json](CURRENT_STATE.json). O registro ativo é
> [CRM_CSV_UX_PHONE_NORMALIZATION_2026-10-18_DEPLOYED.json](releases/CRM_CSV_UX_PHONE_NORMALIZATION_2026-10-18_DEPLOYED.json).

## Estado e continuidade

- [Estado canônico legível](CURRENT_STATE.md)
- [Estado canônico verificável](CURRENT_STATE.json)
- [Registro ativo da implantação](releases/CRM_CSV_UX_PHONE_NORMALIZATION_2026-10-18_DEPLOYED.json)
- [Manifesto de origem](releases/CRM_CSV_UX_PHONE_NORMALIZATION_2026-10-18.json)
- [Revisão funcional vigente](CRM_CSV_UX_REVIEW_2026-10-18.md)
- [Contrato da operação CSV](CRM_CSV_IMPORT_OPERATION_CONTRACT.md)
- [Runbook de operação](../RUNBOOK_WHATSAPP_AGENT.md)
- [Política de mudanças](CHANGE_POLICY.md)
- [Checklist de release](RELEASE_CHECKLIST.md)
- [Baseline operacional](OPERATIONAL_BASELINE.md)
- [Mapa atual do produto](PRODUCT_MAP_CURRENT.md)

## Situação vigente

- API e frontend candidatos: `DEPLOYED / VERIFIED`; worker preservado.
- Isolamento negativo multi-tenant: `LIVE VERIFIED`.
- Recuperação positiva durável: adiada até a primeira importação legítima e
  observada apenas por GET.
- Histórico de 993 linhas: `LEGACY_UNCORRELATED / NOT CLAIMED`.
- Janela: zero POST CSV, importação, SQL e migration. Um POST automático da Inbox
  foi observado e classificado separadamente.
- Próximos atos: avaliação sanitizada das credenciais potencialmente expostas e
  nova prévia manual no tenant Demo, sem confirmar a importação.
- Incidente de inspeção ampla: `RECORDED_PRIVATELY / VALUES NOT VERSIONED /
  ROTATION ASSESSMENT PENDING`.

## Governança

- [Padrão de engenharia de release por artefato](ARTIFACT_RELEASE_ENGINEERING_STANDARD.md)
- [Runbook de release por artefato](ARTIFACT_RELEASE_RUNBOOK.md)
- [Plano de convergência de branches](BRANCH_CONVERGENCE_PLAN_2026-10-18.md)

## Arquivo histórico — não executar

Os documentos abaixo preservam decisões e provas datadas. Eles não substituem o
estado vigente nem autorizam repetir comandos, janelas ou ações consumidas.

- [Handoff consumido desta release](releases/CRM_CSV_UX_PHONE_NORMALIZATION_2026-10-18_HANDOFF.md)
- [Registro da implantação anterior](releases/CRM_CSV_RECOVERY_2026-10-17_DEPLOYED.json)
- [Manifesto da implantação anterior](releases/CRM_CSV_RECOVERY_2026-10-17.json)
- [Arquivo de revisões operacionais](../reviews/automation-freeform-window-release-af26/)
- [Inventário documental amplo](DOCUMENTATION_INVENTORY.md)

Entradas históricas podem conter estados superados. Antes de qualquer ação, use
somente `CURRENT_STATE`, o deployment record ativo e os controles canônicos acima.
