# Sprint 75D - Government Ready Reassessment Pos-Telegram MVP

Data: 2026-06-23

Escopo: reavaliacao consolidada de aderencia B2G apos o Telegram deixar de ser apenas fundacao/shadow/inbound e passar a ter MVP operacional com inbound texto e outbound humano controlado pelo Inbox.

Nao houve alteracao de codigo, banco, migration, runtime, canais, chatbot, IA ou frontend operacional nesta sprint. Este documento apenas atualiza a leitura de prontidao.

## Fontes Usadas

Este review consolida o estado atual documentado em:

- `docs/saas/B2G_READINESS_AUDIT.md`;
- `docs/saas/BID_READINESS_MATRIX.md`;
- `docs/saas/KNOWLEDGE_BASE_AUDIT.md`;
- `docs/saas/KNOWLEDGE_BASE_MVP_DESIGN.md`;
- `docs/saas/KNOWLEDGE_BASE_RUNTIME_INTEGRATION_DESIGN.md`;
- `docs/saas/PUBLIC_API_AUDIT.md`;
- `docs/saas/PUBLIC_API_DESIGN.md`;
- `docs/saas/PUBLIC_API_WEBHOOKS_DESIGN.md`;
- `docs/saas/PUBLIC_API_WEBHOOKS_CONTROLLED_DISPATCH_DESIGN.md`;
- `docs/saas/public-api/openapi.yaml`;
- `docs/saas/SCHEDULING_AUDIT.md`;
- `docs/saas/SCHEDULING_DESIGN.md`;
- `docs/saas/SCHEDULING_REMINDERS_CONFIRMATION_DESIGN.md`;
- `docs/saas/SCHEDULING_REMINDER_CONTROLLED_SEND_DESIGN.md`;
- `docs/saas/NPS_SATISFACTION_AUDIT.md`;
- `docs/saas/NPS_SATISFACTION_DESIGN.md`;
- `docs/saas/WEBCHAT_AUDIT.md`;
- `docs/saas/WEBCHAT_DESIGN.md`;
- `docs/saas/WEBCHAT_RUNTIME_DESIGN.md`;
- `docs/saas/TELEGRAM_AUDIT.md`;
- `docs/saas/TELEGRAM_DESIGN.md`;
- `docs/saas/AUDIO_TRANSCRIPTION_DESIGN.md`;
- `docs/saas/AUDIO_TRANSCRIPTION_CONTROLLED_RUNTIME_DESIGN.md`;
- `docs/saas/AUDIO_TRANSCRIPTION_REAL_MEDIA_PILOT_DESIGN.md`;
- `docs/saas/ADVANCED_SEARCH_DESIGN.md`;
- `docs/saas/MFA_OTP_DESIGN.md`;
- `docs/saas/CHANNELS_GOVERNANCE.md`;
- `docs/saas/PRODUCT_MAP_CURRENT.md`.

Observacao importante: Conselheiro Lafaiete/MG e Aripuana/MT possuem auditoria baseada nos PDFs enviados. Cabreuva/SP, Quatro Barras/PR e Sao Jose do Rio Preto/SP seguem leitura por requisitos recorrentes do Grupo A e pelo edital-guia avancado, pois os TRs completos nao estao versionados no repositorio.

## Criterio De Pontuacao

- **ATENDE** = requisito operacional ou demonstravel sem desenvolvimento central adicional.
- **ATENDE COM AJUSTE** = existe base operacional/estrutural, mas falta automacao, relatorio, configuracao fina, escala ou prova documental.
- **NAO ATENDE** = nao existe implementacao operacional suficiente.

Percentual final considera aderencia tecnica, documentacao disponivel, risco de habilitacao e risco de demonstracao.

## Resumo Executivo

O Converta evoluiu desde a revisao 75C porque o Telegram passou a ter ciclo minimo operacional:

- bot configuravel por tenant em `/app/telegram`;
- token criptografado em `ChannelAccountSecret`;
- webhook shadow e inbound texto;
- `Conversation channel=telegram`;
- `InboundMessage channel=telegram`;
- resposta humana pelo Inbox;
- envio texto-only por Telegram Bot API `sendMessage`;
- `OutboundMessage channel=telegram provider=telegram`;
- eventos redigidos de inbound/outbound;
- rollback por `telegram`, `telegramInbound` e `telegramOutbound`.

Com isso, o produto deixa de ter Telegram como gap arquitetural absoluto. Telegram ainda nao e um canal avancado completo, mas ja e demonstravel como atendimento humano 1:1, texto apenas.

Estado consolidado atual:

- Knowledge Base: schema/CRUD em producao, runtime ainda desenhado;
- Public API: API keys, OpenAPI, health, contatos, conversas e mensagens read-only em producao; webhooks com cadastro, segredo criptografado/rotacao, shadow/manual e dispatch HTTP controlado por CLI/flags, ainda sem dispatch automatico;
- Scheduling: schema/CRUD, lembretes manuais, scheduler shadow e envio controlado WhatsApp por CLI, ainda sem scheduler automatico;
- NPS/Satisfacao: schema/CRUD MVP em producao, sem disparo/link/relatorio operacional completo;
- Webchat: MVP operacional com widget minimo e atendimento humano E2E por polling;
- Telegram: MVP operacional texto-only com inbound e outbound humano controlado;
- Meta channels: WhatsApp, Messenger e Instagram operacionais.

## Aderencia Consolidada

| Dimensao | Revisao 75C | Revisao 75D | Evolucao |
| --- | ---: | ---: | ---: |
| Editais WhatsApp-first municipais | 88% | 89% | +1 pp |
| Editais com integracao/API e POC | 83% | 85% | +2 pp |
| Editais multicanal avancados | 75% | 79% | +4 pp |
| Aderencia consolidada ponderada | 84% | 86% | +2 pp |

Leitura executiva: a evolucao principal esta em editais multicanal, porque agora a demonstracao pode cobrir Meta + Webchat + Telegram. A aderencia ainda nao chega a plena para editais avancados por causa de MFA/OTP operacional, transcricao, busca avancada, NPS operacional completo, escala/HA e provas documentais.

## Aderencia Atual Por Edital

| Edital | Classificacao atual | Aderencia 75C | Aderencia 75D | Evolucao | Leitura executiva |
| --- | --- | ---: | ---: | ---: | --- |
| Conselheiro Lafaiete/MG | ATENDE COM AJUSTE | 83% | 84% | +1 pp | Competitivo para WhatsApp, multiatendimento, chatbot, IA, SLA, relatorios, API, agendamento estrutural, Webchat e Telegram texto. Ainda faltam NPS funcional, transcricao/busca e dossie documental. |
| Aripuana/MT | ATENDE COM AJUSTE | 77% | 79% | +2 pp | Telegram reduz risco multicanal, mas escala, storage 600 GB, prova de 400 usuarios, 30 numeros WhatsApp, HA e possivel mobile nativo seguem sensiveis. |
| Cabreuva/SP | ATENDE COM AJUSTE | 88% | 89% | +1 pp | Forte para atendimento WhatsApp, setores, dashboard/SLA, relatorios, API read-only, POC, Webchat e Telegram texto se exigido. |
| Quatro Barras/PR | ATENDE COM AJUSTE | 87% | 88% | +1 pp | Bom alvo para WhatsApp/SLA/relatorios/POC. Webchat e Telegram reduzem risco multicanal; NPS automatico ainda e condicional. |
| Sao Jose do Rio Preto/SP | ATENDE COM AJUSTE | 79% | 82% | +3 pp | Maior ganho relativo, pois o edital-guia avancado valoriza multicanal. Telegram texto humano melhora a leitura, mas ainda pode bloquear por MFA/OTP operacional, NPS automatico, transcricao, busca avancada, escala e multiagentes IA formais. |

## Impacto Especifico Do Telegram

| Item | Antes da 74F | Depois da 74F | Impacto |
| --- | --- | --- | --- |
| Configuracao por tenant | Existia | Mantida | Base governada. |
| Token criptografado | Existia | Mantido | Reduz risco de seguranca. |
| Webhook shadow | Existia | Mantido | Ajuda diagnostico. |
| Inbound texto | Existia desde 74E | Mantido | Telegram ja aparecia no Inbox. |
| Outbound humano | Nao existia | Existe, texto-only via `sendMessage` | Fecha o ciclo minimo do canal. |
| Timeline | Inbound | Inbound + outbound | Torna canal demonstravel em POC. |
| Midia/grupos | Nao existia | Ainda nao existe | Continua gap se TR exigir. |
| Automacao/IA | Nao existia | Ainda nao existe | Fora do MVP por seguranca. |

Conclusao: Telegram deixa de ser bloqueador arquitetural quando o edital exige canal Telegram basico de atendimento humano texto. Continua bloqueador parcial quando o TR exige midia, grupos, bot automatizado, registro operacional completo de webhook ou recursos de moderacao/administracao especificos do Telegram.

## Matriz Consolidada De Requisitos

| Requisito | Status atual | Impacto em edital | Observacao |
| --- | --- | --- | --- |
| WhatsApp Oficial / Meta Cloud API | ATENDE | Alto | Core operacional. |
| Messenger | ATENDE | Medio/alto | Inbound/outbound humano operacional. |
| Instagram | ATENDE | Medio/alto | Inbound/outbound humano operacional apos app Meta publicado. |
| Webchat | ATENDE COM AJUSTE | Alto quando exigido | MVP operacional: widget JS, sessao, inbound, Inbox, outbound humano e polling. Falta camada avancada de UX, roteamento, identidade e realtime. |
| Telegram | ATENDE COM AJUSTE | Medio/alto quando exigido | MVP operacional texto-only com inbound e outbound humano. Falta midia, grupos, registro/teste operacional de webhook e automacao. |
| Inbox multiatendente | ATENDE | Alto | `/app/inbox`, atribuicao, timeline e realtime. |
| Handoff humano | ATENDE | Alto | Fluxos de atendimento humano e fila existem. |
| Filas/setores | ATENDE | Alto | `Department`, `Queue`, filtros e atribuicao. |
| Usuarios/RBAC | ATENDE COM AJUSTE | Medio/alto | Roles existem; permissoes granulares podem ser exigidas. |
| Historico integral | ATENDE | Alto | Conversas/mensagens/timeline persistidas. |
| CRM/timeline | ATENDE | Medio/alto | Funcional; pode exigir nomenclatura B2G. |
| Chatbot | ATENDE | Alto | Fluxos configuraveis por tenant. |
| IA supervisionada | ATENDE COM AJUSTE | Medio/alto | Config DB-first; multiagentes formais ainda nao. |
| Base de conhecimento | ATENDE COM AJUSTE | Medio/alto | Schema/CRUD em producao; runtime IA/chatbot ainda desenhado, nao ligado. |
| Public API | ATENDE COM AJUSTE | Alto | API keys, OpenAPI, health, contatos, conversas e mensagens read-only; webhooks com infraestrutura, segredo criptografado e dispatch controlado, sem eventos automaticos. |
| Agendamento | ATENDE COM AJUSTE | Alto | Schema/CRUD, lembretes manuais, scheduler shadow e envio controlado WhatsApp por CLI; falta automacao segura de lembretes e integracoes. |
| NPS/Satisfacao | ATENDE COM AJUSTE | Alto quando exigido | Schema/CRUD em `/app/satisfaction`; falta disparo/link publico/relatorio NPS/CSAT. |
| Relatorios | ATENDE | Alto | Reports operacionais e export. |
| Dashboard | ATENDE COM AJUSTE | Medio | Operacional; nao e BI completo. |
| SLA | ATENDE | Alto | `SLAConfig`, metricas e reports. |
| Exportacao CSV/PDF | ATENDE COM AJUSTE | Medio | CSV/PDF existem; XLSX nativo pode ser exigido. |
| LGPD/retencao | ATENDE | Alto | Retencao/anonymizacao/documentacao. |
| Auditoria/logs | ATENDE COM AJUSTE | Medio/alto | Eventos/logs existem; falta tela/relatorio formal de auditoria para cliente. |
| POC/demo | ATENDE | Alto | `demo-prefeitura`, scripts e documentos existem. Webchat e Telegram podem entrar na POC. |
| OTP/MFA | ATENDE COM AJUSTE | Medio/alto | Sprint 77A desenha MFA/TOTP, Sprint 77B cria schema/settings/enrollment e Sprint 77C adiciona verificacao TOTP shadow para usuarios internos. Ainda nao ha enforcement no login, recovery codes reais nem OTP cidadao. |
| Transcricao de audio | ATENDE COM AJUSTE | Medio/alto | Design 75E, fundacao 75F, shadow pipeline 75G, runtime design 75H, runtime controlado 75I e piloto real 75J desenhado. CLI processa WhatsApp inbound audio manualmente com OpenAI STT, `--dry-run` default, `--execute` explicito e cleanup temporario. Sprint 76E indexa transcricoes `completed` no SearchIndex. Ainda sem audio real validado, cron/worker, IA ou exibicao no Inbox. |
| Busca textual avancada em dialogos | ATENDE COM AJUSTE | Medio | Design 76A, fundacao 76B, shadow 76C, runtime MVP 76D e audio indexing 76E criados: `SearchIndex`, flags, CLI `search:index-shadow`, `search:index-audio` e busca textual simples em `/app/search`. Ainda sem indexacao automatica, Inbox integrado, IA, busca semantica ou fontes ampliadas. |
| Storage 600 GB midia | ATENDE COM AJUSTE | Alto em Aripuana | Requer contrato/plano de infra, custo e backup. |
| HA/carga/observabilidade | ATENDE COM AJUSTE | Alto em editais grandes | Produto opera, mas faltam evidencias formais de carga, HA e runbooks de incidentes. |

## Gaps Que Deixaram De Ser Bloqueadores

| Gap anterior | Status 75D | Observacao |
| --- | --- | --- |
| Webchat inexistente | Nao e mais bloqueador absoluto | MVP operacional E2E por polling. |
| Telegram inexistente ou apenas configuracao | Nao e mais bloqueador arquitetural | Inbound + outbound humano texto-only. |
| API publica apenas conceitual | Nao e mais bloqueador para leitura | Contacts, conversations e messages read-only com API key e OpenAPI. |
| Webhooks publicos sem governanca | Nao e mais bloqueador de infraestrutura | Endpoint, segredo criptografado, rotacao, shadow e dispatch controlado existem; automatico ainda nao. |
| Agendamento inexistente | Nao e mais bloqueador estrutural | CRUD, reminders, shadow e envio controlado existem; scheduler automatico ainda nao. |
| NPS inexistente | Nao e mais bloqueador estrutural | CRUD existe; operacionalizacao ainda falta. |

## Gaps Que Continuam Bloqueadores

### A. Gaps Funcionais

| Gap | Status | Impacto | Proxima acao |
| --- | --- | --- | --- |
| Transcricao de audio | Runtime controlado/manual criado; piloto real desenhado | Medio/alto quando TR exige acessibilidade/registro integral | Proxima etapa: Sprint 75K com 1 a 3 audios reais controlados; busca/exibicao no Inbox somente depois. |
| Busca avancada | Shadow criado, sem runtime | Medio/alto para auditoria e ouvidoria | Proxima etapa: Sprint 76D com busca interna controlada, se shadow estiver consistente. |
| MFA operador / OTP cidadao | MFA estrutural criado com validacao TOTP shadow; OTP cidadao nao implementado | Alto se edital exigir autenticacao reforcada | Proxima etapa: 77D runtime MFA com desafio de login. OTP cidadao deve ser sprint separada se TR exigir. |
| NPS refinado | Estrutural | Alto quando pesquisa pos-atendimento e exigida | Disparo, link publico, coleta externa e relatorio NPS/CSAT. |
| Scheduling refinado | Parcial operacional | Alto em editais com agenda/lembrete | Scheduler controlado, confirmacao/cancelamento e relatorio. |
| Telegram avancado | Texto-only | Medio se TR exigir midia/grupos | Midia/grupos somente se edital exigir. |
| Multiagentes IA formais | Parcial | Alto em editais com 3 agentes IA ou roteamento especializado | Separar agentes/perfis por dominio, com evaluation. |

### B. Gaps Operacionais

| Gap | Status | Impacto | Proxima acao |
| --- | --- | --- | --- |
| Escala/carga | Evidencia parcial | Alto em Aripuana/Rio Preto | Benchmark de 400 usuarios, 30 numeros WhatsApp e filas concorrentes. |
| Storage | Precisa plano | Alto se TR exigir 600 GB midia | Definir storage, backup, retencao, custo e SLA. |
| Observabilidade | Parcial | Medio/alto | Dashboards de erro, latencia, fila, webhook e provider. |
| HA | Parcial | Alto em contrato publico | Desenhar redundancia, backup/restore e RTO/RPO. |
| Carga de canais | Parcial | Alto em multicanal | Teste de webhook/inbox por canal e limites por tenant. |
| Push subscription warning | Divida pequena | Baixo/medio | Hardening de dados invalidos de pushSubscription. |

### C. Gaps Licitatorios/Documentais

| Gap | Status | Impacto | Proxima acao |
| --- | --- | --- | --- |
| Atestados | Fora do codigo | Alto | Separar atestado tecnico aplicavel por objeto. |
| Certidoes | Fora do codigo | Alto | Validar fiscal/trabalhista/estadual/municipal antes de proposta. |
| Comprovacao operacional | Parcial | Alto | Runbook de POC, prints, URLs, logs e evidencias por requisito. |
| Prova de API oficial Meta/BSP | Parcial | Alto quando exigido | Dossie Meta: WhatsApp oficial, Instagram Business Login e app publicado. |
| Matriz edital-item | Parcial | Alto | Criar planilha/matriz por edital alvo. |
| Proposta de infraestrutura | Parcial | Alto em Aripuana/Rio Preto | Custo mensal, storage, backup, HA e limites. |

## Leitura Por Edital

### Conselheiro Lafaiete/MG

Classificacao: **ATENDE COM AJUSTE**.

Aderencia 75D: **84%**.

Pontos fortes:

- WhatsApp Oficial;
- multiatendimento;
- chatbot;
- IA supervisionada;
- relatorios;
- SLA;
- API publica read-only;
- agendamento estrutural;
- NPS estrutural;
- Webchat MVP demonstravel;
- Telegram texto humano demonstravel;
- historico/timeline.

Gaps principais:

- satisfacao/NPS funcional com disparo e relatorio;
- agendamento automatico completo;
- transcricao de audio;
- busca textual avancada;
- dossie documental/atestados.

Decisao: participacao defensavel se o edital permitir implantacao com ajustes e se a proposta tratar claramente os itens ainda nao funcionais.

### Aripuana/MT

Classificacao: **ATENDE COM AJUSTE**.

Aderencia 75D: **79%**.

Pontos fortes:

- SaaS web;
- WhatsApp Oficial;
- multiatendimento;
- Instagram ja validado em producao;
- Webchat MVP demonstravel;
- Telegram texto humano demonstravel;
- relatorios/dashboard;
- campanhas/templates;
- governanca multi-tenant;
- API publica read-only completa.

Gaps principais:

- escala 400 usuarios e 30 WhatsApps precisa prova;
- 600 GB midia requer plano de storage;
- app mobile nativo pode ser problema se PWA nao bastar;
- MFA/OTP sem enforcement; Sprint 77B criou schema/settings/enrollment e Sprint 77C validacao TOTP shadow, mas ainda nao ha desafio de login ou OTP cidadao;
- ambiente EAD nao existe;
- HA/carga/documentacao operacional.

Decisao: viavel somente com proposta tecnica conservadora, precificacao de infra e esclarecimentos sobre mobile/storage/garantia.

### Cabreuva/SP

Classificacao: **ATENDE COM AJUSTE**.

Aderencia 75D: **89%**.

Pontos fortes:

- perfil WhatsApp-first favorece o produto;
- setores, SLA, reports e dashboard estao fortes;
- Public API read-only completa;
- Scheduling MVP e NPS MVP reduzem lacunas;
- Webchat MVP cobre requisito de chat web basico;
- Telegram texto cobre multicanal basico, se exigido.

Gaps principais:

- NPS funcional se a pesquisa pos-atendimento for requisito operacional imediato;
- auditoria formal cliente;
- XLSX nativo, se exigido;
- transcricao/busca, se edital pedir recurso avancado.

Decisao: bom alvo para proposta. O risco tecnico central fica em requisitos especificos de NPS, auditoria e exportacao.

### Quatro Barras/PR

Classificacao: **ATENDE COM AJUSTE**.

Aderencia 75D: **88%**.

Pontos fortes:

- WhatsApp, atendimento humano, filas, historico e relatorios;
- POC demonstravel;
- Public API demonstravel;
- Webchat MVP demonstravel;
- Telegram texto demonstravel;
- profile government e feature flags.

Gaps principais:

- NPS funcional;
- relatorio licitatorio fechado por periodo;
- transcricao/busca se exigidas.

Decisao: bom alvo para edital WhatsApp/SLA/relatorios; risco sobe apenas se exigir NPS completo, transcricao, busca avancada ou carga formal.

### Sao Jose Do Rio Preto/SP

Classificacao: **ATENDE COM AJUSTE**.

Aderencia 75D: **82%**.

Pontos fortes:

- core de atendimento e governanca;
- WhatsApp, Messenger, Instagram, Webchat e Telegram em MVP operacional;
- Public API read-only completa;
- webhooks publicos com dispatch controlado;
- Knowledge Base estrutural;
- Scheduling estrutural;
- NPS estrutural;
- POC multicanal demonstravel.

Gaps principais:

- NPS funcional;
- multiagentes IA formais;
- MFA/OTP: schema/settings e verificacao TOTP shadow prontos para usuarios internos; sem runtime/enforcement e sem OTP cidadao;
- API publica com webhooks automaticos/escrita, se exigido;
- transcricao/busca avancada;
- escala/HA/documentacao operacional;
- Telegram avancado se exigir midia/grupos.

Decisao: continua como edital-guia avancado. A distancia caiu com Webchat + Telegram, mas ainda requer hardening funcional e operacional antes de afirmar aderencia plena.

## Proximos 5 Gaps Por Prioridade

| Prioridade | Gap | Tipo | Motivo |
| --- | --- | --- | --- |
| 1 | NPS/Satisfacao funcional | Funcional | Alto impacto em editais e clientes privados; escopo incremental sobre modulo ja criado. |
| 2 | Busca avancada em conversas | Funcional | Alto valor para CAC/ouvidoria, auditoria e prova documental; runtime 76D ja demonstra busca textual simples, mas falta ampliar fontes e integrar melhor a experiencia operacional. |
| 3 | Escala/observabilidade/HA | Operacional | Necessario para Aripuana/Rio Preto e contratos maiores. |
| 4 | MFA operador / OTP cidadao | Funcional | MFA interno tem fundacao estrutural e verificacao TOTP shadow; ainda pode bloquear quando edital exige enforcement real ou OTP cidadao. |
| 5 | Dossie licitatorio/atestados/certidoes | Documental | Sem isso, aderencia tecnica nao vira habilitacao real. |

Itens seguintes:

- Scheduling refinado com scheduler controlado e confirmacao;
- transcricao de audio com politica LGPD/custo;
- auditoria formal cliente;
- Telegram midia/grupos somente se edital exigir.

## Top 5 Investimentos Recomendados

1. **NPS operacional**: disparo por encerramento, link publico, resposta anonima/identificada e dashboard NPS/CSAT.
2. **Busca avancada + transcricao**: shadow/backfill de busca por texto/canal/contato/setor/periodo e, depois, indexacao de transcricoes concluidas.
3. **Observabilidade/escala**: benchmark, dashboards de latencia, provider errors, filas, storage e plano HA/RTO/RPO.
4. **MFA/OTP**: concluir runtime MFA para usuarios internos; tratar OTP cidadao em sprint separada quando edital exigir.
5. **Pacote de habilitacao**: matriz edital-item, evidencias, prints, runbook de POC, certidoes e atestados.

## Recomendacao Final

O Converta esta em estado **Government Ready v0.89** para editais WhatsApp-first e **Government Ready v0.79** para editais multicanal avancados.

O marco da 75D e claro: o produto ja cobre MVP operacional dos canais principais exigiveis em B2G moderno:

```text
WhatsApp   OK
Messenger  OK
Instagram  OK
Webchat    OK
Telegram   OK
```

A partir daqui, a prioridade deixa de ser abrir canais e passa a ser:

- fechar fluxos funcionais de alta recorrencia;
- provar escala/observabilidade;
- preparar documentacao de habilitacao;
- transformar POC em pacote licitatorio reproduzivel.
