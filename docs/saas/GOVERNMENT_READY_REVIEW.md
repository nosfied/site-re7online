# Sprint 75B - Government Ready Reassessment

Data: 2026-06-21

Escopo: reavaliacao consolidada de aderencia B2G apos as entregas de Knowledge Base, Public API read-only, Scheduling, NPS/Satisfacao, Webchat schema/settings, runtime design, inbound, outbound humano controlado, polling publico e widget minimo.

Nao houve alteracao de codigo, banco, migration, runtime, canais, chatbot, IA ou frontend operacional.

## Fontes Usadas

Este review consolida o estado atual documentado em:

- `docs/saas/B2G_READINESS_AUDIT.md`;
- `docs/saas/BID_READINESS_MATRIX.md`;
- `docs/saas/KNOWLEDGE_BASE_AUDIT.md`;
- `docs/saas/KNOWLEDGE_BASE_MVP_DESIGN.md`;
- `docs/saas/KNOWLEDGE_BASE_RUNTIME_INTEGRATION_DESIGN.md`;
- `docs/saas/PUBLIC_API_AUDIT.md`;
- `docs/saas/PUBLIC_API_DESIGN.md`;
- `docs/saas/SCHEDULING_AUDIT.md`;
- `docs/saas/SCHEDULING_DESIGN.md`;
- `docs/saas/NPS_SATISFACTION_AUDIT.md`;
- `docs/saas/NPS_SATISFACTION_DESIGN.md`;
- `docs/saas/WEBCHAT_AUDIT.md`;
- `docs/saas/WEBCHAT_DESIGN.md`;
- `docs/saas/WEBCHAT_RUNTIME_DESIGN.md`;
- `docs/saas/TELEGRAM_AUDIT.md`;
- `docs/saas/PRODUCT_MAP_CURRENT.md`.

Observacao importante: Conselheiro Lafaiete/MG e Aripuana/MT possuem auditoria baseada nos PDFs enviados. Cabreuva/SP, Quatro Barras/PR e Sao Jose do Rio Preto/SP seguem leitura por requisitos recorrentes do Grupo A e pelo edital-guia avancado, pois os TRs completos nao estao versionados no repositorio.

## Criterio De Pontuacao

Para esta revisao:

- **ATENDE** = 100%;
- **ATENDE COM AJUSTE** = 60%;
- **NAO ATENDE** = 0%.

A classificacao final considera aderencia tecnica, documentacao disponivel e risco de habilitacao/demonstracao.

## Resumo Executivo

O Converta evoluiu de uma plataforma WhatsApp-first para uma base B2G mais defensavel e demonstravel:

- Knowledge Base ja possui schema/CRUD e design de runtime;
- Public API ja possui API keys, OpenAPI, health autenticado, contatos, conversas e mensagens read-only;
- Scheduling ja possui schema/CRUD MVP, lembretes manuais, scheduler shadow e design de envio controlado;
- NPS/Satisfacao ja possui schema/CRUD MVP com rollout controlado;
- Webchat ja possui schema/settings MVP, runtime design, bootstrap de sessao publica, inbound texto no Inbox, outbound humano controlado persistido, polling publico seguro e widget JS minimo embutivel;
- Telegram ja possui auditoria.

Isso muda a leitura dos gaps: Knowledge Base, Public API, Scheduling, NPS e Webchat deixam de ser lacunas absolutas. Ainda ha diferenca entre "base pronta" e "funcionalidade operacional completa", mas o risco de proposta caiu porque agora existe estrutura demonstravel e roadmap tecnico consistente.

Ainda assim, para editais que exigem Webchat operacional, Telegram operacional, NPS com disparo/relatorio completo, agendamento com envio real, OTP, transcricao de audio, busca textual avancada ou storage de grande volume, o produto ainda precisa de implementacao adicional ou declaracao de excecao.

## Aderencia Atual Por Edital

| Edital | Classificacao atual | Aderencia atual | Leitura executiva |
| --- | --- | ---: | --- |
| Conselheiro Lafaiete/MG | ATENDE COM AJUSTE | 81% | Competitivo para WhatsApp, multiatendimento, chatbot, IA, SLA, relatorios e agendamento estrutural; ainda exige ajuste em envio real de lembretes, NPS operacional/relatorio, transcricao/busca e dossie documental. |
| Aripuana/MT | ATENDE COM AJUSTE | 74% | Viavel com proposta tecnica controlada; API read-only completa e modulos estruturais ajudam, mas escala, storage 600 GB, mobile nativo se literal, Webchat/Telegram e provas de capacidade seguem sensiveis. |
| Cabreuva/SP | ATENDE COM AJUSTE | 86% | Forte para atendimento WhatsApp, setores, dashboard/SLA, relatorios e integracao read-only; risco fica concentrado em Webchat/Telegram/NPS automatico se forem obrigatorios. |
| Quatro Barras/PR | ATENDE COM AJUSTE | 85% | Boa aderencia para WhatsApp-first municipal, filas, historico, SLA, relatorios, POC e API demonstravel; canais extras permanecem condicionais. |
| Sao Jose do Rio Preto/SP | ATENDE COM AJUSTE | 73% | Melhorou com API publica completa em leitura, KB, Scheduling, Satisfaction e Webchat com E2E humano minimo por widget, mas continua sendo edital-guia avancado; Telegram operacional, NPS automatico, OTP e multiagentes IA ainda podem bloquear. |

## Comparativo De Evolucao

| Edital | Leitura anterior | Leitura atual | Motivo da mudanca |
| --- | ---: | ---: | --- |
| Conselheiro Lafaiete/MG | 78% na 75A | 81% | Scheduling ganhou lembretes manuais/shadow e design de envio; NPS ja tem MVP estrutural; API publica ficou mais completa. |
| Aripuana/MT | 72% na 75A | 74% | API com mensagens read-only e Webchat melhor governado reduzem risco tecnico, mas escala/storage/mobile ainda limitam a nota. |
| Cabreuva/SP | 83% na 75A | 86% | Public API read-only completa e modulos B2G estruturais fortalecem demonstracao; perfil WhatsApp/SLA continua favoravel. |
| Quatro Barras/PR | 82% na 75A | 85% | Ganho semelhante a Cabreuva, principalmente em integracao, agendamento estrutural e NPS estrutural. |
| Sao Jose do Rio Preto/SP | 65% na 75A | 73% | Evoluiu em API, Scheduling, NPS e Webchat com inbound/outbound humano, polling publico e widget minimo; o edital-guia continua exigindo canais e automacoes ainda nao operacionais. |

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
| Public API | ATENDE COM AJUSTE | Alto | API keys, OpenAPI, health, contatos, conversas e mensagens read-only; faltam webhooks outbound, escrita controlada e campanhas. |
| Agendamento | ATENDE COM AJUSTE | Alto | Schema/CRUD MVP, CRUD manual de lembretes, scheduler shadow de elegibilidade e design de envio controlado; faltam envio real de lembretes, chatbot/IA, calendar e API publica. |
| NPS/Satisfacao | ATENDE COM AJUSTE | Alto quando exigido | Schema/CRUD MVP em `/app/satisfaction`; falta disparo automatico/manual por conversa, link publico e relatorio NPS/CSAT. |
| Webchat | ATENDE COM AJUSTE | Alto quando exigido | Schema/settings MVP, session bootstrap, inbound texto no Inbox, outbound humano controlado persistido, polling publico seguro e widget JS minimo embutivel; faltam refinamento visual, roteamento/identificacao e pacote de implantacao por edital. |
| Telegram | NAO ATENDE | Alto quando exigido | Audit pronto; falta design/schema/adapter/Bot API. |
| Relatorios | ATENDE | Alto | Reports operacionais e export. |
| Dashboard | ATENDE COM AJUSTE | Medio | Operacional; nao e BI completo. |
| SLA | ATENDE | Alto | `SLAConfig`, metricas e reports. |
| Exportacao CSV/PDF | ATENDE COM AJUSTE | Medio | CSV/PDF existem em reports; XLSX nativo pode ser exigido. |
| LGPD/retencao | ATENDE | Alto | Retencao/anonymizacao/documentacao. |
| Auditoria/logs | ATENDE COM AJUSTE | Medio/alto | Eventos/logs existem; falta tela/relatorio formal de auditoria para cliente. |
| POC/demo | ATENDE | Alto | `demo-prefeitura` e scripts/documentos existem; roteiros por edital ainda devem ser fechados. |
| OTP/MFA cidadao | NAO ATENDE | Medio/alto | Nao ha modulo licitatorio de OTP. |
| Transcricao de audio | NAO ATENDE | Medio/alto | Nao implementado. |
| Busca textual avancada em dialogos | NAO ATENDE | Medio | Nao formalizada como modulo. |
| Storage 600 GB midia | ATENDE COM AJUSTE | Alto em Aripuana | Requer contrato/plano de infra, custo e backup. |
| App mobile nativo | ATENDE COM AJUSTE | Alto em Aripuana se literal | PWA/mobile web existe; app de loja exigiria ajuste. |

## Gaps Restantes E Impacto

| Gap | Status | Impacto | Bloqueia participacao? | Observacao |
| --- | --- | --- | --- | --- |
| NPS/Satisfacao funcional | MVP estrutural em producao | Alto em editais com pesquisa pos-atendimento | Pode bloquear se requisito exigir disparo/relatorio completo imediato | Proxima fase: disparo manual/automatico por encerramento e relatorio NPS/CSAT. |
| Webchat funcional | Schema/settings + session bootstrap + inbound no Inbox + outbound humano persistido + polling publico + widget minimo | Alto em editais multicanal | Menos provavel; pode bloquear se exigir recursos avancados de widget, roteamento ou identidade | Precisa refinar UX, identificacao, roteamento e pacote de implantacao. |
| Telegram funcional | Audit concluida | Alto quando exigido | Sim, se Telegram for obrigatorio | Ainda falta design antes de implementar. |
| Public API webhooks/escrita | MVP read-only completo em producao | Alto se exigir integracao completa | Geralmente nao bloqueia se leitura de contatos/conversas/mensagens bastar; bloqueia se exigir eventos outbound ou escrita | Proxima etapa natural: webhooks outbound. |
| Scheduling runtime/lembretes | MVP estrutural + lembretes manuais + scheduler shadow | Alto em Conselheiro | Pode bloquear se exigir agendamento automatico completo | Proxima fase: envio controlado por tenant. |
| KB runtime IA/chatbot | CRUD em producao, runtime desenhado | Medio/alto | Nao costuma bloquear participacao; limita demonstracao de IA com base formal | Fazer shadow antes de resposta real. |
| Auditoria formal para cliente | Parcial | Medio/alto | Raramente bloqueia habilitacao, mas fortalece proposta | Criar tela/report de eventos. |
| XLSX nativo | Parcial | Medio | Pode ser ajuste simples se edital exigir Excel literal | CSV/PDF ja reduzem risco. |
| OTP/CPF forte | Nao iniciado | Medio/alto | Sim, se edital exigir autenticacao forte | Precisa modulo especifico. |
| Transcricao audio | Nao iniciado | Medio/alto | Sim, se obrigatorio | Depende de motor de transcricao e politica de custo. |
| Storage/escala 600 GB | Requer infra | Alto em Aripuana | Pode bloquear se nao houver proposta de infra/custo | Tratar como item comercial/infra, nao so codigo. |

## Ordem Otima De Implementacao

### P0 - Melhor retorno imediato para edital

1. **NPS/Satisfacao 72D/72E**: disparo por encerramento, link publico e relatorio NPS/CSAT.
2. **Scheduling 71H**: envio controlado de lembretes por tenant, com template e rollback.
3. **Public API 70G**: webhooks outbound, se o edital exigir eventos externos em tempo real.
4. **Relatorio licitatorio consolidado**: PDF/CSV/XLSX se exigido.

Motivo: alto impacto, escopo controlado, baixo risco comparado a novo canal.

### P1 - Fortalece demonstracao B2G

1. **Knowledge Base runtime shadow**.
2. **Auditoria formal no app**.
3. **B2G POC runbook por edital**.
4. **Dossie API oficial Meta / segurança / LGPD / SLA**.

Motivo: aumenta maturidade e prova, sem abrir novos canais.

### P2 - Canais novos

1. **Webchat 73K**: refinamento do widget, identificacao e roteamento.
2. **Telegram 74B/74C/74D/74E**: design, config, inbound, outbound.

Motivo: alto impacto, mas alto risco. Devem vir depois dos modulos menores que aumentam aderencia rapidamente.

### P3 - Requisitos avancados e condicionais

1. OTP/MFA cidadao.
2. Transcricao de audio.
3. Busca avancada em dialogos.
4. Ambiente EAD.
5. App mobile nativo, se edital exigir loja.

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
- Public API basica autenticada;
- contatos via Public API;
- conversas e mensagens read-only via Public API;
- Knowledge Base estrutural;
- Scheduling estrutural;
- NPS/Satisfacao estrutural;
- Webchat schema/settings, session bootstrap, inbound texto no Inbox, outbound humano controlado, polling publico e widget minimo.

## Itens Que Ainda Podem Bloquear Se Forem Obrigatorios

- Webchat avancado com roteamento/identificacao, se o edital exigir alem do widget minimo;
- Telegram operacional;
- NPS funcional com disparo/resposta/relatorio;
- agendamento automatico completo com lembretes;
- API publica com webhooks outbound ou escrita operacional;
- OTP;
- transcricao de audio;
- busca textual avancada no historico;
- prova de escala 400 usuarios/30 WhatsApp/5 Instagram;
- storage 600 GB com backup e custo;
- app mobile nativo de loja;
- atestados tecnicos compativeis e documentos fiscais/contabeis.

## Leitura Por Edital

### Conselheiro Lafaiete/MG

Classificacao: **ATENDE COM AJUSTE**.

Aderencia atual: **81%**.

Pontos fortes:

- WhatsApp Oficial;
- multiatendimento;
- chatbot;
- IA;
- relatorios;
- SLA;
- API publica read-only;
- agendamento estrutural;
- NPS estrutural.
- historico.

Gaps principais:

- satisfacao/NPS funcional com disparo e relatorio;
- agendamento automatico completo com envio real;
- transcricao de audio;
- busca textual avancada;
- dossie documental/atestados.

Decisao: participacao e defensavel se o edital permitir entrega/implantacao com ajustes e se a proposta tratar claramente os itens ainda nao funcionais.

### Aripuana/MT

Classificacao: **ATENDE COM AJUSTE**.

Aderencia atual: **74%**.

Pontos fortes:

- SaaS web;
- WhatsApp Oficial;
- multiatendimento;
- Instagram ja validado em producao;
- relatorios/dashboard;
- campanhas/templates;
- governanca multi-tenant;
- API publica read-only completa.

Gaps principais:

- escala 400 usuarios e 30 WhatsApps precisa prova;
- 600 GB midia requer plano de storage;
- app mobile nativo pode ser problema se PWA nao bastar;
- Webchat avancado, Telegram, NPS automatico e OTP nao funcionais;
- ambiente EAD nao existe.

Decisao: viavel somente com proposta tecnica conservadora, precificacao de infra e esclarecimentos sobre mobile/storage/garantia.

### Cabreuva/SP

Classificacao: **ATENDE COM AJUSTE**.

Aderencia atual: **86%**.

Pontos fortes:

- perfil WhatsApp-first favorece o produto;
- setores, SLA, reports e dashboard estao fortes;
- Public API read-only completa, Scheduling MVP e NPS MVP reduzem lacunas.

Gaps principais:

- confirmar exigencia de NPS/Webchat/Telegram;
- auditoria formal cliente;
- XLSX nativo, se exigido.

Decisao: bom alvo para proposta, desde que o TR nao exija canais fora da Meta como obrigatorios.

### Quatro Barras/PR

Classificacao: **ATENDE COM AJUSTE**.

Aderencia atual: **85%**.

Pontos fortes:

- WhatsApp, atendimento humano, filas, historico e relatorios;
- POC demonstravel;
- Public API demonstravel;
- profile government e feature flags.

Gaps principais:

- canais extras se obrigatorios;
- NPS funcional;
- relatorio licitatorio fechado por periodo, se exigido.

Decisao: bom alvo para edital WhatsApp/SLA/relatorios; risco sobe se exigir Webchat/Telegram.

### Sao Jose Do Rio Preto/SP

Classificacao: **ATENDE COM AJUSTE**.

Aderencia atual: **69%**.

Pontos fortes:

- core de atendimento e governanca;
- Public API read-only completa;
- Knowledge Base estrutural;
- Scheduling estrutural;
- NPS estrutural;
- Webchat session bootstrap, inbound texto no Inbox e outbound humano controlado;
- Instagram/Messenger/WhatsApp operacionais.

Gaps principais:

- Webchat;
- Telegram;
- NPS funcional;
- multiagentes IA formais;
- OTP;
- API publica completa;
- transcricao/busca avancada;
- escalabilidade documental.

Decisao: ainda nao e o melhor primeiro alvo se o edital exigir a pilha completa. Deve ser tratado como guia avancado para roadmap.

## Recomendacao Final

O Converta esta em estado **Government Ready v0.85** para editais WhatsApp-first e **Government Ready v0.68** para editais multicanal avancados.

Proxima etapa recomendada:

1. concluir NPS/Satisfacao funcional com disparo, link publico e relatorio;
2. evoluir Scheduling para envio controlado de lembretes;
3. adicionar webhooks outbound na Public API se o edital exigir eventos em tempo real;
4. preparar relatorio/dossie licitatorio com evidencias de API, LGPD, SLA e Meta Oficial;
5. continuar Webchat runtime em fases pequenas: polling e widget minimo;
6. desenhar Telegram antes de qualquer implementacao.

Com isso, a versao **Government Ready v1** ficaria bem definida: WhatsApp/Meta forte, API publica demonstravel, agendamento e satisfacao funcionais, KB pronta para IA supervisionada, Webchat em E2E humano e Telegram com roadmap claro.
