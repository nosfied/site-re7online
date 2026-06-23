# Sprint 75C - Government Ready Reassessment Pos-Webchat MVP

Data: 2026-06-22

Escopo: reavaliacao consolidada de aderencia B2G apos o Webchat deixar de ser apenas desenho/configuracao e passar a ter MVP visual e operacional demonstravel.

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
- `docs/saas/PRODUCT_MAP_CURRENT.md`.

Observacao importante: Conselheiro Lafaiete/MG e Aripuana/MT possuem auditoria baseada nos PDFs enviados. Cabreuva/SP, Quatro Barras/PR e Sao Jose do Rio Preto/SP seguem leitura por requisitos recorrentes do Grupo A e pelo edital-guia avancado, pois os TRs completos nao estao versionados no repositorio.

## Criterio De Pontuacao

Para esta revisao:

- **ATENDE** = requisito operacional ou demonstravel sem desenvolvimento central adicional;
- **ATENDE COM AJUSTE** = existe base operacional/estrutural, mas falta automacao, relatorio, configuracao fina, escala ou prova documental;
- **NAO ATENDE** = nao existe implementacao operacional suficiente.

Percentual final considera aderencia tecnica, documentacao disponivel, risco de habilitacao e risco de demonstracao.

## Resumo Executivo

O Converta esta em estado mais forte que a revisao 75B porque o Webchat agora possui ciclo minimo demonstravel:

- site/configuracao por tenant;
- dominio permitido;
- sessao publica;
- inbound do visitante;
- conversa no Inbox/timeline;
- outbound humano pelo operador;
- polling publico para o visitante;
- widget JS minimo embutivel.

Isso remove Webchat da categoria de gap operacional absoluto. Ele ainda nao e um modulo avancado completo, mas ja pode ser demonstrado em POC como canal web basico.

Estado consolidado atual:

- Knowledge Base: schema/CRUD em producao, runtime ainda desenhado;
- Public API: API keys, OpenAPI, health, contatos, conversas e mensagens read-only em producao; infraestrutura de webhooks com cadastro, segredo criptografado/rotacao, shadow/manual e dispatch HTTP controlado por CLI/flags, ainda sem dispatch automatico;
- Scheduling: schema/CRUD, lembretes manuais, scheduler shadow e envio controlado WhatsApp por CLI, ainda sem scheduler automatico;
- NPS/Satisfacao: schema/CRUD MVP em producao, sem disparo/link/relatorio operacional completo;
- Webchat: MVP operacional com widget minimo e atendimento humano E2E por polling;
- Telegram: auditado, desenhado e com schema/settings em `/app/telegram`; ainda sem webhook, inbound ou outbound.

Aderencia consolidada estimada:

| Dimensao | Revisao anterior | Revisao atual | Evolucao |
| --- | ---: | ---: | ---: |
| Editais WhatsApp-first municipais | 85% | 88% | +3 pp |
| Editais com integracao/API e POC | 80% | 83% | +3 pp |
| Editais multicanal avancados | 70% | 75% | +5 pp |
| Aderencia consolidada ponderada | 80% | 84% | +4 pp |

## Aderencia Atual Por Edital

| Edital | Classificacao atual | Aderencia 75B | Aderencia 75C | Evolucao | Leitura executiva |
| --- | --- | ---: | ---: | ---: | --- |
| Conselheiro Lafaiete/MG | ATENDE COM AJUSTE | 81% | 83% | +2 pp | Competitivo para WhatsApp, multiatendimento, chatbot, IA, SLA, relatorios, API e agendamento estrutural. Webchat agora e demonstravel, mas ainda faltam NPS funcional, envio real de lembretes, transcricao/busca e dossie documental. |
| Aripuana/MT | ATENDE COM AJUSTE | 74% | 77% | +3 pp | Webchat MVP melhora aderencia multicanal, mas escala, storage 600 GB, prova de 400 usuarios, 30 numeros WhatsApp e possivel mobile nativo seguem sensiveis. |
| Cabreuva/SP | ATENDE COM AJUSTE | 86% | 88% | +2 pp | Forte para atendimento WhatsApp, setores, dashboard/SLA, relatorios, API read-only e POC. Webchat deixou de ser lacuna se o TR aceitar MVP com polling. |
| Quatro Barras/PR | ATENDE COM AJUSTE | 85% | 87% | +2 pp | Bom alvo para WhatsApp/SLA/relatorios/POC. Webchat MVP reduz risco em requisito de chat web; Telegram e NPS automatico seguem condicionais. |
| Sao Jose do Rio Preto/SP | ATENDE COM AJUSTE | 73% | 78% | +5 pp | Maior ganho relativo, pois o edital-guia avancado valoriza multicanal. Ainda pode bloquear por Telegram, OTP, NPS automatico, transcricao, busca avancada e multiagentes IA formais. |

## Impacto Dos Modulos Recentes

| Modulo | Estado atual | Impacto B2G | Limite atual |
| --- | --- | --- | --- |
| Webchat MVP | Operacional e demonstravel | Alto para editais multicanal e POC | Widget minimo, polling simples, sem roteamento avancado, sem IA/chatbot e sem refinamento visual completo |
| Public API | Read-only completa para contatos, conversas e mensagens; webhooks infra + segredo criptografado + shadow MVP | Alto para integracoes e transparencias tecnicas | Sem dispatch automatico de webhooks, sem escrita e sem envio por API |
| Scheduling | CRUD + reminders manuais + shadow + envio controlado | Medio/alto para editais com agendamento | Envio real existe apenas como CLI piloto, sem cron/scheduler automatico, sem chatbot/IA, sem Google Calendar e sem API publica |
| NPS/Satisfacao | CRUD estrutural | Medio/alto quando pesquisa pos-atendimento e exigida | Sem disparo por encerramento, link publico, coleta externa e relatorio NPS/CSAT completo |
| Knowledge Base | CRUD e desenho runtime | Medio/alto para IA e CAC | IA/chatbot ainda nao consome KB |

## Matriz Consolidada De Requisitos

| Requisito | Status atual | Impacto em edital | Observacao |
| --- | --- | --- | --- |
| WhatsApp Oficial / Meta Cloud API | ATENDE | Alto | Core operacional. |
| Inbox multiatendente | ATENDE | Alto | `/app/inbox`, atribuicao, timeline e realtime. |
| Handoff humano | ATENDE | Alto | Fluxos de atendimento humano e fila existem. |
| Filas/setores | ATENDE | Alto | `Department`, `Queue`, filtros e atribuicao. |
| Usuarios/RBAC | ATENDE COM AJUSTE | Medio/alto | Roles existem; permissoes granulares podem ser exigidas. |
| Historico integral | ATENDE | Alto | Conversas/mensagens/timeline persistidas. |
| CRM/timeline | ATENDE | Medio/alto | Funcional; pode exigir nomenclatura B2G. |
| Chatbot | ATENDE | Alto | Fluxos configuraveis por tenant. |
| IA supervisionada | ATENDE COM AJUSTE | Medio/alto | Config DB-first; multiagentes formais ainda nao. |
| Base de conhecimento | ATENDE COM AJUSTE | Medio/alto | Schema/CRUD em producao; runtime IA/chatbot ainda desenhado, nao ligado. |
| Public API | ATENDE COM AJUSTE | Alto | API keys, OpenAPI, health, contatos, conversas e mensagens read-only; webhooks possuem cadastro, segredo criptografado, rotacao e shadow/manual, mas faltam dispatch outbound e escrita controlada. |
| Agendamento | ATENDE COM AJUSTE | Alto | Schema/CRUD, lembretes manuais, scheduler shadow e envio controlado WhatsApp por CLI; falta automacao segura de lembretes e integracoes. |
| NPS/Satisfacao | ATENDE COM AJUSTE | Alto quando exigido | Schema/CRUD em `/app/satisfaction`; falta disparo/link publico/relatorio NPS/CSAT. |
| Webchat | ATENDE COM AJUSTE | Alto quando exigido | MVP operacional: widget JS, sessao, inbound, Inbox, outbound humano e polling. Falta camada avancada de UX, roteamento, identidade e realtime. |
| Telegram | NAO ATENDE | Alto quando exigido | Schema/settings e token criptografado prontos; faltam webhook shadow, adapter, inbound e outbound Bot API. |
| Relatorios | ATENDE | Alto | Reports operacionais e export. |
| Dashboard | ATENDE COM AJUSTE | Medio | Operacional; nao e BI completo. |
| SLA | ATENDE | Alto | `SLAConfig`, metricas e reports. |
| Exportacao CSV/PDF | ATENDE COM AJUSTE | Medio | CSV/PDF existem; XLSX nativo pode ser exigido. |
| LGPD/retencao | ATENDE | Alto | Retencao/anonymizacao/documentacao. |
| Auditoria/logs | ATENDE COM AJUSTE | Medio/alto | Eventos/logs existem; falta tela/relatorio formal de auditoria para cliente. |
| POC/demo | ATENDE | Alto | `demo-prefeitura`, scripts e documentos existem. Webchat agora pode entrar na POC. |
| OTP/MFA cidadao | NAO ATENDE | Medio/alto | Nao ha modulo licitatorio de OTP. |
| Transcricao de audio | NAO ATENDE | Medio/alto | Nao implementado. |
| Busca textual avancada em dialogos | NAO ATENDE | Medio | Nao formalizada como modulo. |
| Storage 600 GB midia | ATENDE COM AJUSTE | Alto em Aripuana | Requer contrato/plano de infra, custo e backup. |
| App mobile nativo | ATENDE COM AJUSTE | Alto em Aripuana se literal | PWA/mobile web existe; app de loja exigiria ajuste. |

## Gaps Que Deixaram De Ser Bloqueadores

| Gap anterior | Status apos 73J | Observacao |
| --- | --- | --- |
| Webchat como canal inexistente | Nao e mais bloqueador absoluto | Existe MVP com widget, sessao, inbound, outbound humano e polling. |
| Chat web demonstravel em POC | Atendivel com ajuste | Requer configurar tenant/site/dominio e usar widget minimo. |
| Canal web no Inbox | Atende em MVP | Mensagem webchat cria conversa e aparece na timeline. |
| Resposta humana no Webchat | Atende em MVP | Operador responde e visitante consulta por polling. |

## Bloqueadores Reais Restantes

| Gap | Status | Impacto | Bloqueia participacao? | Proxima acao |
| --- | --- | --- | --- | --- |
| Telegram funcional | Schema/settings concluido, runtime nao implementado | Alto quando exigido | Sim, se obrigatorio | Proxima etapa: webhook shadow antes de inbound/outbound. |
| NPS funcional completo | Parcial estrutural | Alto quando exigido | Pode bloquear se TR exigir pesquisa operacional | Sprint 72D: disparo manual/por encerramento, link publico e relatorio. |
| Agendamento com envio real | Piloto controlado | Alto em editais com lembrete | Pode bloquear se automatizacao for obrigatoria | Proximo passo: UI manual e/ou scheduler controlado com flags. |
| OTP/MFA cidadao | Nao implementado | Medio/alto | Sim, se exigido | Sprint especifica de autenticacao/validacao. |
| Transcricao de audio | Nao implementado | Medio/alto | Sim, se exigida | Design de transcricao, custo e LGPD antes de implementar. |
| Busca avancada em dialogos | Nao formalizada | Medio | Pode bloquear se literal | Criar busca indexada por conversa/mensagem. |
| API webhooks/escrita | Webhooks com cadastro, rotacao, shadow/manual e dispatch controlado por CLI, sem eventos automaticos | Medio/alto | Ainda pode bloquear se exigir integracao ativa automatica em tempo real | Proxima etapa: retry/dead letter UI e coupling shadow com eventos reais. |
| Auditoria formal para cliente | Parcial | Medio | Normalmente nao bloqueia, mas fortalece habilitacao | Tela/report de eventos por usuario/conversa. |
| Escala/storage 600 GB | Infra/comercial | Alto em Aripuana | Pode bloquear sem proposta de infra | Plano de capacidade, backup e custo. |

## Ordem Otima Dos Proximos Desenvolvimentos

### P0 - Maior ganho com menor risco

1. **NPS/Satisfacao funcional**: link publico, disparo por encerramento e relatorio NPS/CSAT.
2. **Scheduling controlled send**: envio real de lembretes por tenant, template obrigatorio e rollback por flag.
3. **B2G POC runbook pos-Webchat**: roteiro demonstrando WhatsApp, API, Scheduling, NPS estrutural e Webchat E2E.
4. **Relatorio/auditoria licitatoria**: eventos por usuario/conversa, exportacao e dossie de rastreabilidade.

### P1 - Integracao e maturidade

1. **Public API webhooks hardening pos-MVP**: retry manual, dead letter UI e shadow a partir de eventos reais antes de qualquer dispatch automatico.
2. **Knowledge Base runtime shadow**.
3. **Webchat refinamento**: identificacao, roteamento, acessibilidade e UI mais polida.
4. **XLSX nativo**, se edital exigir Excel literal.

### P2 - Canais e requisitos avancados

1. **Telegram**: webhook shadow, inbound e outbound.
2. **OTP/MFA cidadao**.
3. **Transcricao de audio**.
4. **Busca textual avancada**.
5. **App mobile nativo**, somente se um edital alvo exigir loja.

## Itens Que Ja Nao Sao Bloqueadores Para Participacao

Estes itens ja podem ser tratados como atendidos ou atendiveis com configuracao/documentacao, nao como desenvolvimento central:

- WhatsApp Oficial / API Meta;
- inbox multiatendente;
- atendimento humano;
- setores/filas;
- usuarios e papeis basicos;
- historico/timeline;
- CRM operacional;
- chatbot configuravel;
- IA supervisionada tenant-scoped;
- SLA e metricas;
- relatorios operacionais;
- dashboard operacional;
- LGPD/retencao;
- POC/demo controlada;
- Public API autenticada e documentada;
- contatos, conversas e mensagens read-only via Public API;
- Knowledge Base estrutural;
- Scheduling estrutural;
- NPS/Satisfacao estrutural;
- Webchat MVP operacional com widget minimo.

## Leitura Por Edital

### Conselheiro Lafaiete/MG

Classificacao: **ATENDE COM AJUSTE**.

Aderencia atual: **83%**.

Pontos fortes:

- WhatsApp Oficial;
- multiatendimento;
- chatbot;
- IA;
- relatorios;
- SLA;
- API publica read-only;
- agendamento estrutural;
- NPS estrutural;
- Webchat MVP demonstravel;
- historico.

Gaps principais:

- satisfacao/NPS funcional com disparo e relatorio;
- agendamento automatico completo com envio real;
- transcricao de audio;
- busca textual avancada;
- dossie documental/atestados.

Decisao: participacao defensavel se o edital permitir implantacao com ajustes e se a proposta tratar claramente os itens ainda nao funcionais.

### Aripuana/MT

Classificacao: **ATENDE COM AJUSTE**.

Aderencia atual: **77%**.

Pontos fortes:

- SaaS web;
- WhatsApp Oficial;
- multiatendimento;
- Instagram ja validado em producao;
- Webchat MVP demonstravel;
- relatorios/dashboard;
- campanhas/templates;
- governanca multi-tenant;
- API publica read-only completa.

Gaps principais:

- escala 400 usuarios e 30 WhatsApps precisa prova;
- 600 GB midia requer plano de storage;
- app mobile nativo pode ser problema se PWA nao bastar;
- Telegram, NPS automatico e OTP nao funcionais;
- ambiente EAD nao existe.

Decisao: viavel somente com proposta tecnica conservadora, precificacao de infra e esclarecimentos sobre mobile/storage/garantia.

### Cabreuva/SP

Classificacao: **ATENDE COM AJUSTE**.

Aderencia atual: **88%**.

Pontos fortes:

- perfil WhatsApp-first favorece o produto;
- setores, SLA, reports e dashboard estao fortes;
- Public API read-only completa;
- Scheduling MVP e NPS MVP reduzem lacunas;
- Webchat MVP cobre requisito de chat web basico, se exigido.

Gaps principais:

- confirmar se Telegram e obrigatorio;
- NPS funcional se a pesquisa pos-atendimento for requisito operacional imediato;
- auditoria formal cliente;
- XLSX nativo, se exigido.

Decisao: bom alvo para proposta, desde que o TR nao exija Telegram ou recursos avancados de Webchat como obrigatorios.

### Quatro Barras/PR

Classificacao: **ATENDE COM AJUSTE**.

Aderencia atual: **87%**.

Pontos fortes:

- WhatsApp, atendimento humano, filas, historico e relatorios;
- POC demonstravel;
- Public API demonstravel;
- Webchat MVP demonstravel;
- profile government e feature flags.

Gaps principais:

- Telegram se obrigatorio;
- NPS funcional;
- relatorio licitatorio fechado por periodo, se exigido.

Decisao: bom alvo para edital WhatsApp/SLA/relatorios; risco sobe apenas se exigir Telegram, NPS completo ou transcricao/busca avancada.

### Sao Jose Do Rio Preto/SP

Classificacao: **ATENDE COM AJUSTE**.

Aderencia atual: **78%**.

Pontos fortes:

- core de atendimento e governanca;
- Public API read-only completa;
- Knowledge Base estrutural;
- Scheduling estrutural;
- NPS estrutural;
- Webchat E2E humano minimo por widget;
- Instagram/Messenger/WhatsApp operacionais.

Gaps principais:

- Telegram operacional;
- NPS funcional;
- multiagentes IA formais;
- OTP;
- API publica com webhooks/escrita, se exigido;
- transcricao/busca avancada;
- escalabilidade documental.

Decisao: ainda e edital-guia avancado, mas a distancia caiu. Com NPS funcional, Scheduling send e webhooks Public API, o Converta se aproxima de Government Ready v1 para esse perfil.

## Recomendacao Final

O Converta esta em estado **Government Ready v0.88** para editais WhatsApp-first e **Government Ready v0.75** para editais multicanal avancados.

Proximos 5 gaps prioritarios:

1. NPS/Satisfacao funcional com disparo, link publico e relatorio;
2. Scheduling com envio controlado de lembretes;
3. Public API webhooks outbound;
4. Webchat refinado para POC/editais: identidade, roteamento e acessibilidade;
5. Telegram webhook shadow, antes de adapter runtime completo.

Com isso, a versao **Government Ready v1** fica bem definida: WhatsApp/Meta forte, API publica demonstravel, agendamento e satisfacao funcionais, KB pronta para IA supervisionada, Webchat E2E humano e Telegram com fundacao administrativa e roadmap tecnico claro.
