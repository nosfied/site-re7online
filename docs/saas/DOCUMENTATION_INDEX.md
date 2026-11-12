# Índice documental vigente

> [!IMPORTANT]
> Comece pelos [princípios fundamentais de trabalho](WORKING_PRINCIPLES.md) e pelo
> [estado canônico](CURRENT_STATE.md). A única instrução operacional executável de
> deploy é o [runbook canônico](DEPLOY_RUNBOOK.md). O
> [modelo de releases imutáveis](DEPLOYMENT_OPERATING_MODEL.md) aplica os princípios
> à arquitetura, sem substituir o runbook.

## Estado ativo

- [Princípios fundamentais de trabalho](WORKING_PRINCIPLES.md) — autoridade superior
  para decisões: multitenancy, não retrabalho, código/estado verdade, auditoria,
  documentação, preservação do que funciona e proteção da produção viva.
- [Estado legível](CURRENT_STATE.md)
- [Estado verificável](CURRENT_STATE.json)
- [Sequência consolidada e revisão documental de 26/10](PRODUCT_MAP_CURRENT_2026-10-19.md)
  — mapa existente atualizado: concluído, próximas homologações, correções e manutenção.
- [Runbook canônico de deploy](DEPLOY_RUNBOOK.md) — única instrução executável vigente
- [Modelo de implantação por release imutável](DEPLOYMENT_OPERATING_MODEL.md) — inclui
  o produtor `scripts/converta-release.py`, o build na VPS e a fronteira com a ativação
- [Elegibilidade multilote a838bd33 ativa com retenção externa incompleta](releases/CAMPAIGN_MULTIBATCH_ELIGIBILITY_A838BD33_2026-11-11_DEPLOYED_RETENTION_INCOMPLETE.json)
  — API ativa em `immutable-a838bd33-external-20261110T130618Z`, frontend
  `b8d284b6` e worker `e2e7f17a` preservados; a dívida externa v1/v2 permanece
  separada da finalização produtiva e bloqueia novo build até disposição própria.
- [Encerramento dirigido da árvore histórica da auditoria E0](releases/CONVERTA_E0_HISTORICAL_AUDIT_PROCESS_TERMINATION_2026-11-12.json)
  — reidentificação integral, um `SIGTERM` dirigido à busca, saída natural de
  `sort` e shell e pós-check produtivo sem alterações.
- [E1.1 — admissão de geração independente em builder descartável](../reviews/CONVERTA_E1_1_DISPOSABLE_BUILDER_ADMISSION_2026-11-12.md)
- [E1.2-A — lifecycle completo do builder descartável](../reviews/CONVERTA_E1_2A_DISPOSABLE_BUILDER_LIFECYCLE_2026-11-12.md)
  — parecer `ADMISSION_PARTIAL`: independência e capacidade preliminar
  comprovadas; target da Inbox e lifecycle terminal da raiz inteira ainda
  pendentes, sem iniciar build ou E1.2.
- [E1.4-R1 — reconciliação do contrato de cache e recuperação dirigida](../reviews/CONVERTA_E1_4_R1_CACHE_CONTRACT_RECOVERY_2026-11-12.md)
  — impede novas gerações com cache físico incompatível antes da alocação e
  preserva a geração falha; a disposição autenticada do único bytecode continua
  pendente de complemento versionado e autorização própria.
- [Fechamento frontend b96 implantado e sanitizado](releases/CAMPAIGN_AUDIENCE_PRESENTATION_FRONTEND_B96_2026-10-28_DEPLOYED_SANITIZED.json)
  — frontend histórico substituído por aa9527; aceite visual, save e retirada 3/3 preservados.
- [Revisão da reconciliação não destrutiva b96](releases/B96_RELEASE_GRAPH_RECONCILIATION_REVIEW_2026-11-03.json)
  — pacote histórico de revisão dos bindings b96 → aa952 → 911a, preservado sem
  reuso depois da reconciliação concluída.
- [Retirada terminal da geração b96](releases/B96_GENERATION_RETIREMENT_2026-11-03_SANITIZED.json)
  — closure canônica 2/2, autorização consumida, uma retirada nova, três efeitos
  históricos reconhecidos e 988.491.776 bytes fisicamente recuperados.
- [Release fixed-current 708f implantada e sanitizada](releases/FIXED_CURRENT_708F_2026-10-27_DEPLOYED_SANITIZED.json)
- [Release API-only fixed-current 0fdec implantada e sanitizada](releases/FIXED_CURRENT_0FDEC_2026-10-29_DEPLOYED_SANITIZED.json)
  — API histórica substituída por 754281d3; registro preservado da promoção API-only.
- [Continuidade de campanhas 17cc77a8 implantada e sanitizada](releases/CAMPAIGN_RECIPIENT_CONTINUITY_17CC77A8_2026-11-05_DEPLOYED_SANITIZED.json)
  — API+frontend ativos, worker preservado, save único e retenção 3/3. O escopo
  de campanha contido no registro é a fotografia histórica do fechamento; a
  continuidade vigente está em `CAMPAIGN_OPERATIONS_READINESS.md`: nov.02
  reconciliada e nov.03 cancelada com ordinal 588 ainda incerto.
- [Resultado por destinatário b8d284b6 implantado e sanitizado](releases/CAMPAIGN_RECIPIENT_RESULT_B8D284B6_2026-11-08_DEPLOYED_SANITIZED.json)
  — fechamento histórico API + frontend; hoje preservado como frontend ativo e
  retorno imediato da API a838bd33.
- [Continuação de resultado incerto 36b94c6d implantada e sanitizada](releases/CAMPAIGN_UNCERTAIN_CONTINUATION_36B94C6D_2026-11-08_DEPLOYED_SANITIZED.json)
  — fechamento anterior de API+frontend, retorno 17cc77a8, worker preservado, save único
  e retenção 3/3. A custódia `deploy-control`, separada da retenção da release,
  também encerrou posteriormente em `SANITIZED` com receipts próprios.
- [Recuperação de rascunhos 785bde80 implantada e sanitizada](releases/CAMPAIGN_DRAFT_RECOVERY_785BDE80_2026-11-03_DEPLOYED_SANITIZED.json)
  — registro histórico da release anterior, agora retorno autenticado de 17cc77a8.
- [Campanha integral 911a9708 implantada e sanitizada](releases/CAMPAIGN_AUDIENCE_INTEGRAL_911A9708_2026-11-02_DEPLOYED_SANITIZED.json)
  — release anterior preservada como retorno; seu fechamento permanece terminal.
- [Layout de mídia em campanhas: deploy frontend f160](releases/CAMPAIGN_MEDIA_LAYOUT_FRONTEND_2026-10-26_DEPLOYED.json)
  — registro histórico do frontend anterior, preservado como retorno.
- [Disponibilidade e admissão de mídia de campanhas: deploy a959](releases/CAMPAIGN_AVAILABILITY_MEDIA_ADMISSION_2026-10-26_DEPLOYED.json)
  — registro histórico da API anterior e evidência funcional.
- [Deploy da coerência de sincronização e ordenação de templates](releases/TEMPLATE_ADMIN_SYNC_ORDERING_2026-10-24_DEPLOYED.json)
  — registro histórico no target `d7de6453`, preservado como retorno de API/frontend.
- [Auditoria de capacidade da VPS](VPS_CAPACITY_AUDIT_2026-10-24.md)
  — fotografia inicial, lote histórico executado e custódia ainda pendente.
- [Ciclo de vida dos artefatos de implantação](DEPLOY_ARTIFACT_LIFECYCLE.md): capacidade, encerramento por geração, diagnóstico dirigido e retiradas históricas relatadas.
  — contrato de capacidade/classificação, inventário consolidado e novo lote pequeno
  proposto; não autoriza limpeza.
- [Política canônica de recuperação mínima de capacidade](CAPACITY_RECOVERY_POLICY.md)
  — `audit`, `prepare` e `execute` contidos e fail-closed; inclui archives fechados,
  checkpoint 3/3 terminal, audit ef7 DENY sem efeitos e consolidação das
  falhas/regressões de 01/11.
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

- [Loop de handoff da Tendência — persistência P00](backlog/TENDENCIA_HANDOFF_PERSISTENCE_P00_2026-10-30.md)
  — encerrado em DEPLOYED_SANITIZED, aceite do owner PASS e repetição de qualquer fase proibida.
- [Plano P00 de sanitização, retenção e higiene do projeto](backlog/PROJECT_SANITATION_AND_RETENTION_P00_2026-10-30.md)
  — prioridade vigente: recuperar orçamento de disco, classificar preparações/releases e reconciliar Git sem perda de trabalho.
- [Plano P00 de convergência da preparação de deploy](backlog/DEPLOY_PREPARATION_PREFLIGHT_CONVERGENCE_2026-10-29.md)
  — inclui revisão de 30/10, referências profissionais e P00-D aberto: contrato real entre materializador e consumidor; não declara a dívida integralmente encerrada.
- [Disponibilidade, mídia e homologação de campanhas](CAMPAIGN_OPERATIONS_READINESS.md)
  — IMAGE e VIDEO manuais PASS; inventário global concluído e reabertura geral autorizada pelo owner,
  executada pelo Codex local na geração 41. Agendamento/multilote e aceites específicos seguem separados.
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
VPS, com capacidade conferida. Builder externo é alternativa mediante decisão
específica e [qualificação entre hosts](backlog/DEPLOY_PREPARATION_PREFLIGHT_CONVERGENCE_2026-10-29.md#build-externo-e-qualificação-entre-hosts).
Os precedentes históricos e os limites do piloto estão reunidos nessa seção.
- [Fechamento frontend aa9527 — consentimento visível e retenção sanitizada](releases/CONSENT_VISIBILITY_FRONTEND_AA9527_2026-10-29_DEPLOYED_SANITIZED.json)
- [Fechamento API 754281d3 — DB-first e retenção sanitizada](releases/P00_DB_FIRST_API_754281D3_2026-10-29_DEPLOYED_SANITIZED.json)
- [Registro ativo API-only da Tendência — fa63994a](releases/TENDENCIA_HANDOFF_FA63994A_2026-10-30_DEPLOYED_SANITIZED.json)
  — DEPLOYED_SANITIZED; frontend aa9527cc e worker e2e7f17a preservados.


## Continuidade operacional consolidada — 01/11/2026

- [Procedimento qualificado e lições da recuperação de capacidade](CAPACITY_RECOVERY_POLICY.md#continuidade-qualificada-em-01112026--leitura-obrigatória-antes-de-nova-frente)
  — reuso, selagem, contenção, bindings entre roots, memória e reconciliação de efeitos.
- [Convergência: entregas encerradas e dívida restante](backlog/DEPLOY_PREPARATION_PREFLIGHT_CONVERGENCE_2026-10-29.md#consolidação-de-01112026--não-reabrir-entregas-qualificadas)
  — não reimplementar controles resolvidos; P00-D não é encerrado pelo lote 3/3.
- [Capacidade e impedimentos após o lote 3/3](backlog/PROJECT_SANITATION_AND_RETENTION_P00_2026-10-30.md#decisão-consolidada-após-o-fechamento-33--01112026)
  — saldo histórico, déficit e candidatos pendentes; não autoriza retirada.
- [Lifecycle de preparações volumosas: implementação versionada, não instalada](DEPLOY_ARTIFACT_LIFECYCLE.md#extensão-preventiva-versionada--preparações-volumosas-01112026)
  — contrato preventivo e aceite; não confundir proposta com rotina instalada.

O lote 3/3 registrado no PR #307 está COMPLETED_RECONCILED e é irrepetível.
A consolidação não muda os princípios, não cria outro runbook e não autoriza
operação produtiva. O [estado canônico](CURRENT_STATE.md) e seu JSON continuam
sendo a entrada de continuidade, com histórico separado das próximas ações.
