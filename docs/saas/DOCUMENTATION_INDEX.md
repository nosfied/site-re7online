# Índice documental vigente

> [!IMPORTANT]
> A release viva inclui a correção isolada do frontend para reentrada terminal CSV,
> promovida e verificada em 18/10/2026. Comece por [CURRENT_STATE.md](CURRENT_STATE.md)
> e [CURRENT_STATE.json](CURRENT_STATE.json). O registro ativo é
> [CRM_CSV_TERMINAL_REENTRY_2026-10-18_DEPLOYED.json](releases/CRM_CSV_TERMINAL_REENTRY_2026-10-18_DEPLOYED.json).
> A alteração operacional posterior é a
> [rotação OBS-2](releases/OBS2_OAUTH_STATE_SECRET_ROTATION_2026-10-18_DEPLOYED.json).

## Estado e continuidade

- [Estado canônico legível](CURRENT_STATE.md)
- [Estado canônico verificável](CURRENT_STATE.json)
- [Registro ativo da implantação](releases/CRM_CSV_TERMINAL_REENTRY_2026-10-18_DEPLOYED.json)
- [Registro operacional ativo — rotação OBS-2](releases/OBS2_OAUTH_STATE_SECRET_ROTATION_2026-10-18_DEPLOYED.json)
- [Preparação OBS-1 — janela obrigatória, sem mudança](releases/OBS1_META_APP_SECRET_ROTATION_2026-10-19_PREPARED.json)
- [Manifesto da correção frontend](releases/CRM_CSV_TERMINAL_REENTRY_2026-10-18.json)
- [Contrato da operação CSV](CRM_CSV_IMPORT_OPERATION_CONTRACT.md)
- [Runbook de operação](../RUNBOOK_WHATSAPP_AGENT.md)
- [Política de mudanças](CHANGE_POLICY.md)
- [Checklist de release](RELEASE_CHECKLIST.md)
- [Baseline operacional](OPERATIONAL_BASELINE.md)
- [Mapa vigente do produto — 19/10](PRODUCT_MAP_CURRENT_2026-10-19.md)

## Backlog ativo

- [Listagem CRM após importação CSV](CRM_CONTACTS_LIST_RECOVERY_2026-10-19.md)
  — causa confirmada em código; candidato validado localmente, release viva inalterada.
- [Adequar encerramento e pesquisa CSAT à janela de 24h do WhatsApp](backlog/WHATSAPP_CSAT_24H_WINDOW_2026-10-19.md)
  — prioridade alta; todos os tenants e transportes WhatsApp; `CONFIRMED GAP / NOT FIXED`.

## Situação vigente

- Frontend: `DEPLOYED / VERIFIED`; API e worker preservados.
- Reentrada terminal: `LIVE VERIFIED`; modal encerrado, página 1 carregada e filtros preservados.
- Recuperação positiva durável: `LIVE VERIFIED`; a referência foi corretamente consumida e
  não foi repetida. Totais da operação não registrados permanecem sem inferência.
- Histórico de 993 linhas: `LEGACY_UNCORRELATED / NOT CLAIMED`.
- Janela: zero POST CSV, importação, SQL e migration.
- Credenciais: OBS-2 `CONTINGENCY CLOSED / SAFE POST-ROTATION RETURN READY`;
  OBS-1 `PREPARED / SCHEDULED WINDOW REQUIRED / NO CHANGE`; reset e restart ficam
  negados de segunda a sexta-feira, 08:00–17:00 em Fortaleza.

## Governança

- [Padrão de engenharia de release por artefato](ARTIFACT_RELEASE_ENGINEERING_STANDARD.md)
- [Runbook de release por artefato](ARTIFACT_RELEASE_RUNBOOK.md)
- [Plano de convergência de branches](BRANCH_CONVERGENCE_PLAN_2026-10-18.md)

## Arquivo histórico — não executar

Os documentos abaixo preservam decisões e provas datadas. Eles não substituem o
estado vigente nem autorizam repetir comandos, janelas ou ações consumidas.

- [Registro da composição-base anterior](releases/CRM_CSV_UX_PHONE_NORMALIZATION_2026-10-18_DEPLOYED.json)
- [Manifesto da composição-base anterior](releases/CRM_CSV_UX_PHONE_NORMALIZATION_2026-10-18.json)
- [Handoff consumido da composição-base](releases/CRM_CSV_UX_PHONE_NORMALIZATION_2026-10-18_HANDOFF.md)
- [Registro da implantação de 17/10](releases/CRM_CSV_RECOVERY_2026-10-17_DEPLOYED.json)
- [Arquivo de revisões operacionais](../reviews/automation-freeform-window-release-af26/)
- [Mapa anterior do produto — histórico extenso, não executar](PRODUCT_MAP_CURRENT.md)
- [Inventário documental amplo](DOCUMENTATION_INVENTORY.md)
