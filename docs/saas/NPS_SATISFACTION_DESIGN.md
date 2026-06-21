# Sprint 72B - NPS / Satisfaction Design

Data: 2026-06-21

Escopo: desenho funcional e tecnico do modulo de NPS/CSAT/Satisfacao. Nao houve migration, alteracao de banco, runtime, canais, chatbot, IA, API publica ou frontend operacional.

## Objetivo

Projetar o primeiro modulo formal de satisfacao do Converta, cobrindo:

- pesquisa pos-atendimento;
- CSAT 1-5 como MVP;
- NPS 0-10 como modo adicional;
- comentario opcional;
- vinculacao com conversa, contato, lead, operador e setor;
- relatorios e dashboards futuros;
- auditoria;
- rollout por feature flag.

O modulo deve nascer multi-tenant, desligado por padrao e sem envio automatico inicial.

## Principios

1. **Tenant scope obrigatorio**: toda pesquisa e resposta precisa carregar `clientId`.
2. **CSAT antes de NPS**: CSAT 1-5 e mais simples para CAC, ouvidoria e atendimento operacional. NPS entra como tipo adicional quando exigido por edital ou cliente.
3. **Uma resposta valida por pesquisa**: evitar inflar indicadores por reenvio ou multiplas respostas.
4. **Sem envio proativo irregular**: fora da janela Meta, usar template aprovado.
5. **Fechamento nao dispara automaticamente no MVP**: primeiro criar estrutura, depois envio manual, depois automacao pos-fechamento.
6. **Auditoria redigida**: eventos registram metadados, nao comentario bruto em logs.
7. **Rollback por feature flag**: `satisfaction=false` por padrao no lancamento.

## Entidades Alvo

### SatisfactionSurvey

Representa a pesquisa enviada ou preparada para uma conversa.

| Campo | Tipo | Observacao |
| --- | --- | --- |
| `id` | string | cuid/uuid |
| `clientId` | uuid | tenant scope obrigatorio |
| `conversationId` | uuid/null | conversa de origem |
| `contactId` | uuid/null | contato avaliante, quando existir |
| `leadId` | string/null | lead vinculado, quando existir |
| `departmentId` | string/null | setor responsavel no momento do fechamento |
| `assignedUserId` | string/null | atendente responsavel no momento do fechamento |
| `channel` | string | whatsapp/instagram/messenger/webchat/futuro |
| `type` | csat/nps | tipo da pesquisa |
| `status` | draft/pending/sent/responded/expired/cancelled |
| `questionText` | string | pergunta exibida |
| `commentEnabled` | boolean | permite comentario opcional |
| `sentAt` | datetime/null | envio efetivo |
| `answeredAt` | datetime/null | primeira resposta valida |
| `expiresAt` | datetime/null | expiracao |
| `source` | app/inbox/automation/public_api/import |
| `templateName` | string/null | template Meta usado, se aplicavel |
| `templateLang` | string/null | idioma do template |
| `requestId` | string/null | idempotencia |
| `metadata` | json | dados seguros e extensoes futuras |
| `createdAt/updatedAt` | datetime | auditoria tecnica |

Indices recomendados:

- `(clientId, status, createdAt)`;
- `(clientId, type, createdAt)`;
- `(clientId, conversationId)`;
- `(clientId, contactId)`;
- `(clientId, departmentId, createdAt)`;
- `(clientId, assignedUserId, createdAt)`.

### SatisfactionQuestion

Representa perguntas reutilizaveis/configuraveis por tenant.

| Campo | Tipo | Observacao |
| --- | --- | --- |
| `id` | string | cuid/uuid |
| `clientId` | uuid | tenant scope obrigatorio |
| `key` | string | chave unica por tenant |
| `type` | csat/nps | escala da pergunta |
| `title` | string | nome interno |
| `questionText` | string | texto enviado ao cliente/cidadao |
| `commentPrompt` | string/null | pergunta opcional de comentario |
| `commentEnabled` | boolean | se aceita comentario |
| `status` | active/inactive/archived | controle operacional |
| `metadata` | json | regras futuras |
| `createdAt/updatedAt` | datetime | auditoria tecnica |

Regras:

- MVP pode criar uma pergunta padrao por tenant.
- Perguntas arquivadas nao devem ser usadas em novas pesquisas.
- Alterar pergunta nao deve reescrever surveys ja enviados.

### SatisfactionResponse

Representa a resposta recebida.

| Campo | Tipo | Observacao |
| --- | --- | --- |
| `id` | string | cuid/uuid |
| `clientId` | uuid | tenant scope obrigatorio |
| `surveyId` | string | pesquisa |
| `conversationId` | uuid/null | redundancia util para consulta/report |
| `contactId` | uuid/null | contato |
| `leadId` | string/null | lead |
| `score` | int | 1-5 para CSAT, 0-10 para NPS |
| `comment` | text/null | comentario opcional |
| `category` | promoter/passive/detractor/null | apenas NPS ou classificacao derivada |
| `source` | link/channel/app/import/public_api |
| `respondedAt` | datetime | data da resposta |
| `metadata` | json | dados seguros |
| `createdAt/updatedAt` | datetime | auditoria tecnica |

Constraints recomendadas:

- unico por `(clientId, surveyId)`;
- indice `(clientId, respondedAt)`;
- indice `(clientId, score, respondedAt)`;
- indice `(clientId, conversationId)`.

## Tenant Scope

Todas as entidades devem carregar `clientId`.

Regras obrigatorias:

- todas as queries filtram por `clientId`;
- nenhuma rota do `/app` aceita `clientId` do body;
- API publica futura resolve tenant pela API key;
- admin interno pode diagnosticar por tenant, mas conteudo operacional pertence ao `/app`;
- eventos de auditoria registram `clientId`.

## Relacoes Com Modulos Existentes

| Modulo | Relacao |
| --- | --- |
| `Conversation` | origem principal da pesquisa pos-atendimento |
| `ConversationMetrics` | correlacao com SLA, primeira resposta e resolucao |
| `Contact` | pessoa/cidadao/cliente avaliante |
| `Lead` | contexto comercial/cadastral vinculado |
| `User` | atendente responsavel no fechamento |
| `Department` | setor/fila avaliada |
| `Event` | auditoria de envio, resposta, expiracao e erro |
| `Template` | envio por WhatsApp/Meta fora da janela |
| `Campaign` | nao deve ser motor principal, mas pode reaproveitar conceitos de entrega |
| `Reports` | destino natural para indicadores agregados |
| `Dashboard` | cards executivos futuros |
| `CRM Timeline` | exibicao contextual da avaliacao na conversa/lead |
| `Public API` | exposicao futura de indicadores/respostas, read-only primeiro |

## Feature Flag E RBAC

Feature flag futura:

```text
satisfaction
```

Default:

```text
business=false
government=false
```

Habilitar por tenant via `Client.features`.

RBAC sugerido:

| Papel | Permissao |
| --- | --- |
| ADMIN | configurar perguntas, visualizar relatorios e gerenciar pesquisas |
| SUPERVISOR | visualizar relatorios, criar/enviar pesquisa manual e acompanhar respostas |
| AGENT | visualizar resposta da propria conversa, sem configurar modulo |
| INTERNAL_ADMIN | diagnostico e suporte tecnico, sem misturar conteudo entre tenants |

## Fluxos Funcionais

### Encerramento

1. Conversa e finalizada no inbox.
2. `Conversation.closedAt` e `ConversationMetrics` sao atualizados.
3. Em fase futura, o sistema verifica se `satisfaction` e `satisfactionAutomation` estao habilitados.
4. Se habilitado, cria survey pendente vinculada a conversa.
5. Se nao habilitado, nada muda no fluxo atual.

MVP nao deve disparar automaticamente.

### Pesquisa Manual

1. Supervisor abre conversa finalizada.
2. Clica em enviar pesquisa de satisfacao.
3. Sistema cria `SatisfactionSurvey`.
4. Se canal permite resposta na janela aberta, envia mensagem simples.
5. Se janela fechada no WhatsApp/Meta, exige template aprovado.
6. Evento `survey.sent` e registrado.

### Resposta

1. Cliente/cidadao responde por link seguro ou pelo proprio canal, conforme fase implementada.
2. Sistema valida survey, tenant e expiracao.
3. Persiste `SatisfactionResponse`.
4. Atualiza survey para `responded`.
5. Registra evento `survey.responded`.
6. Opcionalmente exibe resposta na timeline.

### Reabertura Opcional

Reabertura por baixa nota deve ser fase posterior.

Regra sugerida:

- CSAT 1-2 ou NPS 0-6 pode criar alerta interno;
- nunca reabrir conversa automaticamente sem configuracao explicita;
- se reabrir, registrar evento e respeitar atribuicao/fila.

## Metricas

### CSAT

Formula MVP:

```text
media CSAT = soma(score 1-5) / quantidade de respostas
```

Indicadores:

- media geral;
- distribuicao 1-5;
- percentual de notas 4-5;
- percentual de notas 1-2;
- taxa de resposta.

### NPS

Escala:

```text
0-6 detratores
7-8 neutros/passivos
9-10 promotores
```

Formula:

```text
NPS = % promotores - % detratores
```

Indicadores:

- NPS geral;
- promotores/neutros/detratores;
- NPS por canal;
- NPS por setor;
- NPS por periodo.

### Taxa De Resposta

Formula:

```text
taxa de resposta = surveys respondidas / surveys enviadas
```

Separar:

- enviadas;
- respondidas;
- expiradas;
- canceladas;
- pendentes.

## Relatorios E Dashboard

### Reports

Adicionar futuramente em `/app/reports`:

- filtro por periodo;
- canal;
- setor;
- atendente;
- tipo de pesquisa;
- CSV/PDF com indicadores agregados;
- colunas de resposta sem expor dados excessivos.

### Dashboard

Cards sugeridos:

- CSAT medio;
- NPS;
- taxa de resposta;
- total de respostas;
- detratores/baixas notas;
- evolucao temporal.

### CRM Timeline

Exibir:

- nota recebida;
- comentario opcional;
- data;
- tipo de pesquisa;
- sem mostrar metadados internos.

## Eventos E Auditoria

Eventos recomendados:

```text
survey.created
survey.sent
survey.send_failed
survey.responded
survey.expired
survey.cancelled
survey.reopened_conversation
```

Payload redigido:

```json
{
  "surveyId": "...",
  "conversationId": "...",
  "type": "csat",
  "channel": "whatsapp",
  "status": "sent"
}
```

Nao logar:

- comentario bruto;
- token de link publico;
- conteudo de mensagem;
- dados sensiveis desnecessarios.

## Integracao Com Canais

### WhatsApp

- janela aberta: mensagem simples pode ser suficiente;
- janela fechada: usar template aprovado;
- resposta direta por numero deve ser interpretada apenas se houver survey pendente e contexto claro.

### Messenger/Instagram

- com janela ativa, mensagem simples;
- fora da janela, respeitar politicas Meta;
- nao implementar envio automatico antes de validar politicas/capabilities.

### Link Seguro

Alternativa recomendada para MVP controlado:

- gerar token opaco com expiracao;
- pagina publica simples para responder nota/comentario;
- token nao exposto em logs;
- uma resposta por survey.

## Feature Flags Futuras

| Flag | Default | Uso |
| --- | --- | --- |
| `satisfaction` | false | Exibe modulo e permite CRUD/manual |
| `satisfactionManualSend` | false | Permite envio manual por conversa |
| `satisfactionAutoAfterClose` | false | Disparo automatico apos fechamento |
| `satisfactionPublicLink` | false | Permite formulario publico por token |
| `satisfactionReports` | false | Exibe cards/relatorios agregados |

## Classificacao: Reaproveita, Migra, Novo

| Item | Classificacao | Observacao |
| --- | --- | --- |
| `Conversation.closedAt` | Reaproveita | Gatilho natural de pesquisa |
| `ConversationMetrics` | Reaproveita | Correlacao com SLA/tempo |
| `Event` | Reaproveita | Auditoria redigida |
| `Template` | Reaproveita | Convites fora de janela Meta |
| Reports/Dashboard | Reaproveita | Destino de indicadores |
| CRM Timeline | Reaproveita | Exibicao contextual |
| `Campaign` | Reaproveita parcialmente | Nao deve ser motor principal |
| `SatisfactionSurvey` | Novo | Entidade formal de pesquisa |
| `SatisfactionQuestion` | Novo | Perguntas reutilizaveis |
| `SatisfactionResponse` | Novo | Resposta/nota/comentario |
| Feature flag `satisfaction` | Novo | Rollout controlado |
| Formulario publico por token | Novo | Melhor para MVP seguro |

## Roadmap Recomendado

### Sprint 72C - Satisfaction Schema + App CRUD MVP

Implementar estrutura sem envio automatico:

- models aditivos;
- migration;
- feature flag `satisfaction=false`;
- CRUD de perguntas/configuracao em `/app/satisfaction`;
- listagem de surveys/respostas;
- sem disparo por canal.

### Sprint 72D - Manual Survey Send + Response Capture

Implementar fluxo controlado:

- envio manual a partir de conversa finalizada;
- token/link seguro ou resposta no canal;
- captura de nota/comentario;
- eventos;
- sem automacao pos-fechamento.

### Sprint 72E - Satisfaction Reports

Adicionar indicadores:

- CSAT;
- NPS;
- taxa de resposta;
- filtros por periodo/canal/setor/atendente;
- CSV/PDF.

### Sprint 72F - Post-Close Automation

Depois de validar:

- disparo automatico apos encerramento;
- template Meta quando necessario;
- expiracao automatica;
- alerta de baixa nota.

## Riscos E Mitigacoes

| Risco | Severidade | Mitigacao |
| --- | --- | --- |
| Envio fora de politica Meta | Alto | template aprovado ou link dentro de janela valida |
| Expor comentario sensivel em logs | Alto | redaction e eventos sem comentario bruto |
| Vazamento cross-tenant | Alto | `clientId` em todas entidades e queries |
| Multipla resposta inflar indicador | Medio | constraint unica por survey |
| Confundir CSAT e NPS | Medio | tipos separados e UI clara |
| Baixa taxa de resposta | Medio | pergunta curta, expiracao e canal adequado |
| Reabrir conversa indevidamente | Medio | reabertura apenas por flag/regra explicita |
| Relatorio enviesado por testes | Medio | filtros e exclusao futura de contatos internos |

## Criterios De Sucesso Do MVP

- feature desligada por padrao;
- entidades tenant-scoped;
- nenhuma automacao em canais no primeiro deploy;
- pesquisas e respostas auditaveis;
- CSAT 1-5 funcional;
- NPS 0-10 previsto sem aumentar escopo inicial;
- reports preparados para fase posterior;
- rollback por flag.

## Recomendacao Final

A proxima sprint correta e **Sprint 72C - Satisfaction Schema + App CRUD MVP**.

Recorte recomendado:

- criar `SatisfactionQuestion`, `SatisfactionSurvey` e `SatisfactionResponse`;
- adicionar feature flag `satisfaction=false`;
- criar tela simples `/app/satisfaction`;
- permitir configurar perguntas e visualizar pesquisas/respostas;
- nao enviar pesquisa automaticamente;
- nao alterar WhatsApp, Messenger, Instagram, IA, chatbot, follow-up ou API publica.
