# Índice documental vigente

> [!IMPORTANT]
> Comece pelo [estado canônico](CURRENT_STATE.md). A única instrução operacional
> executável de deploy é o [runbook canônico](DEPLOY_RUNBOOK.md). O
> [modelo de releases imutáveis](DEPLOYMENT_OPERATING_MODEL.md) define arquitetura
> e princípios, sem substituir o runbook.

## Estado ativo

- [Estado legível](CURRENT_STATE.md)
- [Estado verificável](CURRENT_STATE.json)
- [Runbook canônico de deploy](DEPLOY_RUNBOOK.md) — única instrução executável vigente
- [Modelo de implantação por release imutável](DEPLOYMENT_OPERATING_MODEL.md) — inclui
  o produtor `scripts/converta-release.py`, o build na VPS e a fronteira com a ativação
- [Disponibilidade e admissão de mídia de campanhas: deploy a959](releases/CAMPAIGN_AVAILABILITY_MEDIA_ADMISSION_2026-10-26_DEPLOYED.json)
  — API/frontend ativos relatados em 26/10; guarda fechada, um save, worker preservado e lock livre.
- [Deploy da coerência de sincronização e ordenação de templates](releases/TEMPLATE_ADMIN_SYNC_ORDERING_2026-10-24_DEPLOYED.json)
  — registro histórico no target `d7de6453`, preservado como retorno de API/frontend.
- [Auditoria de capacidade da VPS](VPS_CAPACITY_AUDIT_2026-10-24.md)
  — fotografia inicial, lote histórico executado e custódia ainda pendente.
- [Ciclo de vida dos artefatos de implantação](DEPLOY_ARTIFACT_LIFECYCLE.md): capacidade, encerramento por geração, diagnóstico dirigido e retiradas históricas relatadas.
  — contrato de capacidade/classificação, inventário consolidado e novo lote pequeno
  proposto; não autoriza limpeza.
- [Configuração do Meta App ID do Converta Demo](releases/CONVERTA_DEMO_META_APP_ID_2026-10-24_CONFIGURED.json)
  — vínculo atual token/aplicativo confirmado e configuração tenant-scoped concluída;
  homologação funcional Meta permanece pendente.
- [Tentativa de homologação do vídeo no Converta Demo](releases/CONVERTA_DEMO_VIDEO_TEMPLATE_HOMOLOGATION_2026-10-24.json)
  — histórico `failed` preservado; causalidade histórica `NOT_PROVEN`.
- [Homologação manual do vídeo: submissão aceita](releases/CONVERTA_DEMO_VIDEO_TEMPLATE_HOMOLOGATION_ACCEPTED_2026-10-24.json)
  — upload concluído e submissão única aceita; estado observado `PENDING`, sem
  confirmação de aprovação pela Meta.
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

- [Disponibilidade, mídia e homologação de campanhas](CAMPAIGN_OPERATIONS_READINESS.md)
  — VIDEO manual PASS; inventário global concluído e reabertura geral autorizada pelo owner,
  pendente de execução/confirmação pelo Codex local. IMAGE e demais cenários seguem separados.
- [Adequar encerramento e CSAT à janela de 24h](backlog/WHATSAPP_CSAT_24H_WINDOW_2026-10-19.md)
- [Elegibilidade set based de campanhas](backlog/CAMPAIGN_SET_BASED_ELIGIBILITY_2026-10-21.md)
  — `PREEXISTING_BATCH_ELIGIBILITY_N_PLUS_ONE`; não bloqueia o deploy técnico.
- [Gates de capacidade e revisão de gerações](BUILD_CAPACITY_GATES.md)
  — produtor preparado; checkpoints entre fases e revisão de gerações registradas, sem exclusão automática ou instalação produtiva presumida.
- OBS-1 — preparação concluída; rotação exige janela própria.

## Arquivo histórico

- [Deploy do diagnóstico de upload de mídia](releases/TEMPLATE_MEDIA_UPLOAD_DIAGNOSTICS_2026-10-24_DEPLOYED.json)
  — baseline conjunto substituído pelo target `d7de6453`, preservado como retorno.
- [Atualização isolada da API de upload assinado](releases/TEMPLATE_MEDIA_UPLOAD_SESSION_SIGNATURE_API_2026-10-24_DEPLOYED.json)
  — seleção de API substituída, preservada na cadeia de retorno.
- [Reativação anterior do hardening de mídia](releases/TEMPLATE_MEDIA_UX_HARDENING_2026-10-22_DEPLOYED.json)
  — release substituída, preservada como retorno e evidência.
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

O checkout/runtime ativo como destino de build, `deploy-normal-release.sh`, PR #190
e Next em `cluster_mode` estão obsoletos. O padrão autorizado é build isolado na
VPS, com capacidade conferida; builder externo é alternativa mediante decisão
específica. Nenhum
documento histórico prevalece sobre o modelo operacional canônico.
