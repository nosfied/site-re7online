# Índice documental vigente

> [!IMPORTANT]
> Comece pelo [estado canônico](CURRENT_STATE.md) e pelo
> [modelo operacional](DEPLOYMENT_OPERATING_MODEL.md). A produção está saudável na
> versão anterior; a correção de contatos está staged, não implantada.

## Estado e continuidade

- [Estado canônico legível](CURRENT_STATE.md)
- [Estado canônico verificável](CURRENT_STATE.json)
- [Registro do retorno seguro](releases/FRONTEND_SAFE_RETURN_2026-10-19_DEPLOYED.json)
- [Release funcional ativa](releases/CRM_CSV_TERMINAL_REENTRY_2026-10-18_DEPLOYED.json)
- [Modelo operacional — Normal Release V1](DEPLOYMENT_OPERATING_MODEL.md)
- [Política de mudanças](CHANGE_POLICY.md)
- [Mapa vigente do produto](PRODUCT_MAP_CURRENT_2026-10-19.md)

## Próxima release normal

- [Análise funcional da listagem CRM](CRM_CONTACTS_LIST_RECOVERY_2026-10-19.md)
- [Manifesto normal vigente](releases/CRM_CONTACTS_LIST_RECOVERY_2026-10-20_NORMAL_RELEASE.json)
- Executor: `scripts/deploy-normal-release.sh`.
- Estado: `STAGED_INERT / NOT DEPLOYED`.

## Backlog ativo

- [Adequar encerramento e CSAT à janela de 24h](backlog/WHATSAPP_CSAT_24H_WINDOW_2026-10-19.md)
  — prioridade alta; `CONFIRMED GAP / NOT FIXED`.
- OBS-1 — preparação concluída, rotação em janela separada fora do expediente protegido.

## BREAK_GLASS e arquivo técnico

- [Padrão excepcional por artefato](ARTIFACT_RELEASE_ENGINEERING_STANDARD.md)
- [Runbook excepcional por artefato](ARTIFACT_RELEASE_RUNBOOK.md)
- [Contrato Deploy V2 histórico](DEPLOY_V2_ADAPTER_CONTRACT.md)
- [Plano de convergência de branches](BRANCH_CONVERGENCE_PLAN_2026-10-18.md)

Preparações, rehearsals e verificadores single-use anteriores são evidência histórica.
Não autorizam repetição e não são dependências de `NORMAL_RELEASE`.
