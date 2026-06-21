# Sprint 75A - Government Ready Review

Data: 2026-06-21

Escopo: revisao consolidada de aderencia B2G apos as trilhas de Knowledge Base, Public API, Scheduling, NPS, Webchat e Telegram.

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

O Converta evoluiu de uma plataforma WhatsApp-first para uma base B2G mais defensavel:

- Knowledge Base ja possui schema/CRUD e design de runtime;
- Public API ja possui API keys, OpenAPI inicial, health autenticado, contatos read-only e conversas read-only;
- Scheduling ja possui schema/CRUD MVP com rollout controlado;
- NPS/Satisfacao ja possui schema/CRUD MVP com rollout controlado;
- Webchat ja possui auditoria e design;
- Telegram ja possui auditoria.

Isso muda a leitura dos gaps: varios itens deixam de ser "nao iniciado" e passam a ser "em trilha controlada", mesmo quando ainda nao atendem funcionalmente.

Ainda assim, para editais que exigem canal Webchat ou Telegram operacional, NPS com disparo automatico/relatorios, OTP, transcricao de audio, busca textual avancada ou storage de grande volume, o produto ainda precisa de implementacao adicional ou declaracao de excecao.

## Aderencia Atual Por Edital

| Edital | Classificacao atual | Aderencia atual | Leitura executiva |
| --- | --- | ---: | --- |
| Conselheiro Lafaiete/MG | ATENDE COM AJUSTE | 78% | Competitivo para WhatsApp, multiatendimento, chatbot, IA, SLA e relatorios; ainda exige ajuste em agendamento operacional completo, envio/relatorio de satisfacao, transcricao/busca e dossie documental. |
| Aripuana/MT | ATENDE COM AJUSTE | 72% | Viavel com proposta tecnica controlada; risco maior em escala, storage de 600 GB, mobile nativo se exigido, multiplos canais e provas de capacidade. |
| Cabreuva/SP | ATENDE COM AJUSTE | 83% | Forte para atendimento WhatsApp, setores, dashboard/SLA e relatorios; API publica, Scheduling MVP e Satisfaction MVP melhoram aderencia. Requer checar se exige Webchat/Telegram/NPS automatizado. |
| Quatro Barras/PR | ATENDE COM AJUSTE | 82% | Boa aderencia para WhatsApp-first municipal, filas, historico, SLA, relatorios e POC; gaps de canais extras permanecem se forem obrigatorios. |
| Sao Jose do Rio Preto/SP | ATENDE COM AJUSTE | 65% | Melhorou com API publica, KB, Scheduling e Satisfaction MVP, mas continua sendo edital-guia avancado; Webchat, Telegram, NPS automatizado, OTP e multiagentes IA podem ser bloqueadores. |

## Comparativo De Evolucao

| Edital | Leitura anterior | Leitura atual | Motivo da mudanca |
| --- | ---: | ---: | --- |
| Conselheiro Lafaiete/MG | 72% B2G / 61% tecnico no BID | 78% | Scheduling e Satisfaction sairam de lacuna absoluta para MVP estrutural; API e KB mais maduras. |
| Aripuana/MT | 76% B2G / 50% tecnico no BID | 72% | Evoluiu em API/Scheduling, mas a ponderacao atual penaliza escala, storage e canais obrigatorios. |
| Cabreuva/SP | 75% | 83% | Public API, Scheduling e Satisfaction reduzem lacunas recorrentes; perfil WhatsApp/SLA continua favoravel. |
| Quatro Barras/PR | 76% | 82% | Mesmo ganho de Cabreuva em documentacao/produto, com baixo risco se WhatsApp-first. |
| Sao Jose do Rio Preto/SP | 55% | 65% | API publica, KB, Scheduling e Satisfaction melhoraram a base; canais Webchat/Telegram e NPS automatizado ainda pesam. |

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
| Public API | ATENDE COM AJUSTE | Alto | API keys, OpenAPI, health, contatos, conversas e mensagens read-only; faltam webhooks/escrita/campanhas. |
| Agendamento | ATENDE COM AJUSTE | Alto | Schema/CRUD MVP; faltam chatbot/IA, lembretes, calendar e API publica. |
| NPS/Satisfacao | ATENDE COM AJUSTE | Alto quando exigido | Schema/CRUD MVP em `/app/satisfaction`; falta disparo automatico/manual por conversa, link publico e relatorio NPS/CSAT. |
| Webchat | NAO ATENDE | Alto quando exigido | Audit/design prontos; falta schema/widget/runtime. |
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
| NPS/Satisfacao funcional | MVP estrutural em producao | Alto em editais com pesquisa pos-atendimento | Pode bloquear se requisito exigir disparo/relatorio completo imediato | Proxima fase: envio manual/automatico e relatorio NPS/CSAT. |
| Webchat funcional | Design concluido | Alto em editais multicanal | Sim, se o canal web for obrigatorio | Precisa widget, sessao, persistencia e inbox. |
| Telegram funcional | Audit concluida | Alto quando exigido | Sim, se Telegram for obrigatorio | Ainda falta design antes de implementar. |
| Public API webhooks/escrita | MVP read-only em producao | Alto se exigir integracao completa | Geralmente nao bloqueia se leitura de contatos/conversas/mensagens bastar; bloqueia se exigir eventos outbound ou escrita | Proxima etapa natural: webhooks outbound. |
| Scheduling runtime/lembretes | MVP estrutural em producao | Alto em Conselheiro | Pode bloquear se exigir agendamento automatico completo | Precisa lembrete/template e uso no chatbot/IA. |
| KB runtime IA/chatbot | CRUD em producao, runtime desenhado | Medio/alto | Nao costuma bloquear participacao; limita demonstracao de IA com base formal | Fazer shadow antes de resposta real. |
| Auditoria formal para cliente | Parcial | Medio/alto | Raramente bloqueia habilitacao, mas fortalece proposta | Criar tela/report de eventos. |
| XLSX nativo | Parcial | Medio | Pode ser ajuste simples se edital exigir Excel literal | CSV/PDF ja reduzem risco. |
| OTP/CPF forte | Nao iniciado | Medio/alto | Sim, se edital exigir autenticacao forte | Precisa modulo especifico. |
| Transcricao audio | Nao iniciado | Medio/alto | Sim, se obrigatorio | Depende de motor de transcricao e politica de custo. |
| Storage/escala 600 GB | Requer infra | Alto em Aripuana | Pode bloquear se nao houver proposta de infra/custo | Tratar como item comercial/infra, nao so codigo. |

## Ordem Otima De Implementacao

### P0 - Melhor retorno imediato para edital

1. **NPS/Satisfacao 72D/72E**: envio manual/automatico e relatorio NPS/CSAT.
2. **Public API 70G**: webhooks outbound, se o edital exigir eventos externos em tempo real.
3. **Scheduling 71D**: lembretes/configuracao e primeiro fluxo de confirmacao manual/template.
4. **Relatorio licitatorio consolidado**: PDF/CSV/XLSX se exigido.

Motivo: alto impacto, escopo controlado, baixo risco comparado a novo canal.

### P1 - Fortalece demonstracao B2G

1. **Knowledge Base runtime shadow**.
2. **Auditoria formal no app**.
3. **B2G POC runbook por edital**.
4. **Dossie API oficial Meta / segurança / LGPD / SLA**.

Motivo: aumenta maturidade e prova, sem abrir novos canais.

### P2 - Canais novos

1. **Webchat 73C/73D/73E**: schema/settings, inbound, outbound.
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
- Scheduling estrutural.

## Itens Que Ainda Podem Bloquear Se Forem Obrigatorios

- Webchat operacional;
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

Aderencia: **76%**.

Pontos fortes:

- WhatsApp Oficial;
- multiatendimento;
- chatbot;
- IA;
- relatorios;
- SLA;
- historico.

Gaps principais:

- satisfacao/NPS funcional;
- agendamento automatico completo;
- transcricao de audio;
- busca textual avancada;
- dossie documental/atestados.

Decisao: participacao e defensavel se o edital permitir entrega/implantacao com ajustes e se a proposta tratar claramente os itens ainda nao funcionais.

### Aripuana/MT

Classificacao: **ATENDE COM AJUSTE**.

Aderencia: **72%**.

Pontos fortes:

- SaaS web;
- WhatsApp Oficial;
- multiatendimento;
- Instagram ja validado em producao;
- relatorios/dashboard;
- campanhas/templates;
- governanca multi-tenant.

Gaps principais:

- escala 400 usuarios e 30 WhatsApps precisa prova;
- 600 GB midia requer plano de storage;
- app mobile nativo pode ser problema se PWA nao bastar;
- Webchat/Telegram/NPS/OTP nao funcionais;
- ambiente EAD nao existe.

Decisao: viavel somente com proposta tecnica conservadora, precificacao de infra e esclarecimentos sobre mobile/storage/garantia.

### Cabreuva/SP

Classificacao: **ATENDE COM AJUSTE**.

Aderencia: **82%**.

Pontos fortes:

- perfil WhatsApp-first favorece o produto;
- setores, SLA, reports e dashboard estao fortes;
- Public API e Scheduling MVP reduzem lacunas.

Gaps principais:

- confirmar exigencia de NPS/Webchat/Telegram;
- auditoria formal cliente;
- XLSX nativo, se exigido.

Decisao: bom alvo para proposta, desde que o TR nao exija canais fora da Meta como obrigatorios.

### Quatro Barras/PR

Classificacao: **ATENDE COM AJUSTE**.

Aderencia: **82%**.

Pontos fortes:

- WhatsApp, atendimento humano, filas, historico e relatorios;
- POC demonstravel;
- profile government e feature flags.

Gaps principais:

- canais extras se obrigatorios;
- NPS funcional;
- relatorio licitatorio fechado por periodo, se exigido.

Decisao: bom alvo para edital WhatsApp/SLA/relatorios; risco sobe se exigir Webchat/Telegram.

### Sao Jose Do Rio Preto/SP

Classificacao: **ATENDE COM AJUSTE**.

Aderencia: **63%**.

Pontos fortes:

- core de atendimento e governanca;
- Public API inicial;
- Knowledge Base estrutural;
- Scheduling estrutural;
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

O Converta esta em estado **Government Ready v0.8** para editais WhatsApp-first e **Government Ready v0.6** para editais multicanal avancados.

Proxima etapa recomendada:

1. concluir NPS/Satisfacao funcional;
2. expandir Public API para conversas;
3. evoluir Scheduling com lembretes;
4. preparar relatorio/dossie licitatorio;
5. so entao iniciar Webchat runtime;
6. desenhar Telegram antes de qualquer implementacao.

Com isso, a versao **Government Ready v1** ficaria bem definida: WhatsApp/Meta forte, API publica demonstravel, agendamento e satisfacao funcionais, KB pronta para IA supervisionada, e canais adicionais com roadmap claro.
