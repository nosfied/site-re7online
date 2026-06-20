# Knowledge Base Audit

Sprint 69 - auditoria de base de conhecimento, IA, chatbot, prompts, respostas, FAQ, catalogos, qualification, intents e documentos.

Fonte primaria: codigo e documentacao existentes no repositorio. Nenhuma alteracao funcional foi feita.

## Resumo Executivo

O Converta ainda nao possui um modulo formal de Knowledge Base com artigos, colecoes, versionamento, busca e fontes por tenant.

Existe, porem, uma base forte e reaproveitavel para criar esse modulo:

- IA tenant-scoped com configuracao DB-first;
- prompts, contexto, topicos permitidos/bloqueados e mensagens por tenant;
- catalogo de intencoes configuravel;
- qualification schema com slots, semantic aliases e CRM mapping;
- chatbot flows estruturados;
- evaluation/replay para transformar erro real em regressao;
- base minima legada `knowledge.base.ts`;
- playbook de parametrizacao por tenant.

Classificacao geral: **PARCIAL**.

## Mapa Consolidado

| Area | Existe | Legado | Reaproveitavel | Pode virar KB formal |
| --- | --- | --- | --- | --- |
| IA runtime | Sim | Parcial | Sim | Sim, como consumidor da KB |
| Chatbot flows | Sim | Nao | Sim | Sim, como roteador/entrada estruturada |
| Prompts | Sim | Parcial | Sim | Sim, como instrucoes por colecao/tenant |
| Respostas aprovadas | Parcial | Sim | Sim | Sim, como artigos/answers |
| FAQ | Nao formal | Sim, conceitual | Sim | Sim |
| Catalogo de intencoes | Sim | Nao | Sim | Sim, como taxonomy/intents da KB |
| Qualification | Sim | Nao | Sim | Sim, como captura guiada vinculada a artigos |
| Documentos | Parcial | Sim | Sim | Sim, como fontes/anexos |
| Evaluation/replay | Sim | Nao | Sim | Sim, como controle de qualidade da KB |

## 1. IA

### O que existe

Arquivos principais:

- `apps/whatsapp-agent/src/agent/openai.brain.ts`
- `apps/whatsapp-agent/src/ai/ai.interface.ts`
- `apps/whatsapp-agent/src/ai/mock.ai.ts`
- `apps/whatsapp-agent/src/config/tenantOperationalConfig.ts`
- `src/app/admin/tenants/[tenantId]/chatbot/page.tsx`

Capacidades existentes:

- chamada OpenAI via `OpenAIBrain`;
- prompt de sistema global/env;
- prompt de usuario com contexto de negocio, intent, estado, historico e mensagem atual;
- timeout e limite de tokens;
- sanitizacao de resposta;
- configuracao DB-first por tenant para IA assistida;
- limites por conversa;
- topicos permitidos e bloqueados;
- fallback/handoff configuravel.

### O que e legado

- `openai.brain.ts` ainda tem um `DEFAULT_SYSTEM_PROMPT` generico;
- a base de conhecimento global/minima nao e tenant-aware;
- parte do fluxo antigo de demo/orcamento ainda convive com a camada nova.

### O que e reaproveitavel

- interface de brain;
- construcao de prompt com contexto;
- controles de timeout/tokens;
- configuracao por tenant em `TenantOperationalConfig`;
- playbook de parametrizacao;
- evaluation/replay.

### Como pode virar KB formal

A IA deve deixar de depender apenas de contexto/prompts e passar a consultar uma fonte formal:

```text
Mensagem
  -> intent/qualification
  -> busca KB por tenant
  -> resposta baseada em artigo/fonte
  -> fallback IA/humano
```

## 2. Chatbot

### O que existe

Arquivos principais:

- `apps/whatsapp-agent/src/chatbot/chatbotFlow.ts`
- `apps/whatsapp-agent/src/chatbot/intentClassifier.ts`
- `src/app/app/chatbot/page.tsx`
- `src/app/admin/tenants/[tenantId]/chatbot/page.tsx`
- rotas `/app/chatbot/flows` e `/app/chatbot/settings` em `apps/whatsapp-agent/src/http/routes.ts`

Modelo atual:

- `ChatbotFlowDefinition`
- nodes `menu`, `text`, `handoff`;
- `context` e `tags` por node/opcao;
- validacao de JSON;
- auto-advance controlado;
- handoff estruturado;
- UI para flows no app/admin conforme permissao.

### O que e legado

- classificador hardcoded previdenciario em `intentClassifier.ts`;
- fluxos antigos de demo/orcamento em `flowExecutor.ts`/`conversation.service.ts`.

### O que e reaproveitavel

- estrutura de fluxo;
- validacao;
- context/tags;
- handoff;
- UI de JSON;
- permissao por tenant;
- feature `chatbot`;
- logs e eventos.

### Como pode virar KB formal

Chatbot flows podem referenciar artigos da KB:

```json
{
  "type": "text",
  "text": "Vou te explicar.",
  "knowledgeArticleKey": "endereco_showroom"
}
```

Ou usar nodes como entrada para pesquisa:

```json
{
  "type": "menu",
  "options": [
    { "label": "Endereço", "knowledgeTag": "location" }
  ]
}
```

## 3. Prompts

### O que existe

Configuracoes DB-first em `TenantOperationalConfig.config.aiAssistantConfig`:

- `aiBusinessContext`
- `aiAssistantSystemPrompt`
- `aiAssistantGreetingMessage`
- `aiAssistantFallbackMessage`
- `aiAssistantHandoffPrompt`
- `aiAssistantAllowedTopics`
- `aiAssistantSecondaryTopics`
- `aiAssistantBlockedTerms`
- `aiAssistantHandoffKeywords`
- `aiAssistantMaxReplies`
- `aiAssistantProfile`

UI interna:

- `src/app/admin/tenants/[tenantId]/chatbot/page.tsx`

### O que e legado

- prompt default em env/global;
- algumas instrucoes antigas vivem em fluxos e docs.

### O que e reaproveitavel

- normalizacao;
- DB-first/fallback;
- UI de configuracao;
- presets de segmento;
- validacao de configuracao minima;
- redaction no backfill/documentacao.

### Como pode virar KB formal

Prompts devem funcionar como politica da KB:

- tom de voz;
- limites;
- regras de resposta;
- instrucoes por tenant;
- instrucoes por colecao/artigo.

Nao devem substituir o conteudo fonte.

## 4. Respostas

### O que existe

Respostas existem espalhadas em:

- chatbot flows (`text`, `handoff.text`, `handoffSummary`);
- catalogo de intencoes (`response`, `nextQuestion`);
- prompts/mensagens de fallback/handoff/greeting;
- fluxos legados de demo/orcamento;
- templates oficiais Meta.

### O que e legado

- respostas hardcoded em `conversation.service.ts`;
- respostas em `flowExecutor.ts`;
- base minima em `knowledge.base.ts`.

### O que e reaproveitavel

- estrutura de resposta aprovada do catalogo de intencoes;
- mensagens por tenant;
- templates;
- handoff summary;
- tags/context.

### Como pode virar KB formal

Criar entidade de resposta/artigo:

- pergunta/titulo;
- resposta aprovada;
- tags;
- intents relacionados;
- status;
- versionamento;
- revisao;
- fonte;
- tenant;
- ultima atualizacao.

## 5. FAQ

### O que existe

Nao ha modulo formal de FAQ.

Existe mencao conceitual em:

- `docs/whatsapp-agent/00-visao-produto.md`
- `docs/whatsapp-agent/03-backlog-mvp.md`
- `docs/saas/B2G_READINESS_AUDIT.md`

### O que e legado

- backlog MVP mencionava "Suporte/FAQ";
- `knowledge.base.ts` e uma semente muito pequena.

### O que e reaproveitavel

- KB formal pode expor uma visao FAQ;
- catalogo de intencoes pode mapear perguntas recorrentes;
- IA/config pode limitar respostas por tema.

### Como pode virar KB formal

FAQ deve ser uma visualizacao da Knowledge Base:

```text
KnowledgeArticle
  type = faq
  question
  approvedAnswer
  tags
  intents
```

## 6. Catalogos

### O que existe

Existe catalogo de intencoes da IA:

- tipo: `AiAssistantIntentCatalogItem`;
- storage: `TenantOperationalConfig.config.aiIntentQualification.aiAssistantIntentCatalog`;
- UI JSON no console interno;
- normalizacao em `tenantConfig.ts`/`tenantOperationalConfig.ts`.

Campos observados na UI/exemplos:

- `key`
- `title`
- `topics`
- `response`
- `nextQuestion`
- `leadTemp`
- `priority`
- `tags`
- `preQualification`
- `handoff`

### O que e legado

- `intentClassifier.ts` possui catalogo hardcoded previdenciario;
- fluxos antigos possuem intents implícitas.

### O que e reaproveitavel

- taxonomy inicial para KB;
- tags;
- topics;
- resposta aprovada;
- CRM/prioridade;
- handoff;
- perguntas de continuidade.

### Como pode virar KB formal

Criar relacionamento:

```text
IntentCatalogItem
  -> KnowledgeArticle[]
  -> QualificationSchema
  -> CRM mapping
```

O catalogo deixaria de ser apenas JSON livre e passaria a apontar para conteudo versionado.

## 7. Qualification

### O que existe

Arquivo principal:

- `apps/whatsapp-agent/src/agent/qualification.ts`

Estrutura:

- `AiQualificationSchema`
- `AiQualificationSlot`
- slots obrigatorios/condicionais;
- tipos `text`, `enum`, `boolean`;
- allowed values;
- perguntas;
- hints;
- semantic aliases;
- CRM mapping;
- handoff rules;
- outcomes;
- continuation comercial;
- confirmacao semantica;
- reset por tempo.

### O que e legado

Nao e legado. E uma base atual e relevante.

### O que e reaproveitavel

Muito alto.

Reaproveitar para:

- conduzir perguntas baseadas em artigo;
- preencher CRM;
- coletar dados antes de resposta humana;
- personalizar resposta por tenant;
- validar ambiguidades;
- transformar erros reais em dataset.

### Como pode virar KB formal

Cada artigo/intencao pode opcionalmente exigir slots:

```text
Artigo: catalogo_atacado
  requiredSlots:
    - tipo_cliente
    - cidade
  responseWhenComplete
  handoffWhen
```

## 8. Intents

### O que existe

Existem duas camadas:

1. classificador hardcoded previdenciario:
   - `apps/whatsapp-agent/src/chatbot/intentClassifier.ts`
2. catalogo configuravel por tenant:
   - `aiAssistantIntentCatalog`

### O que e legado

O classificador previdenciario hardcoded deve ser tratado como legado ou especifico de tenant antigo. Ele nao deve ser usado como base generica B2G.

### O que e reaproveitavel

Reaproveitar:

- estrutura de score/confidence;
- target node;
- matched terms;
- tags;
- conflicted intents;
- mapeamento para flow context.

Nao reaproveitar:

- termos previdenciarios como default global.

### Como pode virar KB formal

Intents devem virar taxonomia por tenant:

- intent key;
- aliases;
- synonyms;
- priority;
- related articles;
- default answer;
- handoff behavior;
- qualification schema.

## 9. Documentos

### O que existe

Documentacao relevante:

- `docs/saas/automation-ai-tenant-playbook.md`
- `docs/saas/GAP_REUSE_AUDIT.md`
- `docs/saas/B2G_READINESS_AUDIT.md`
- `docs/saas/bid-package/07-ia.md`
- `docs/whatsapp-agent/00-visao-produto.md`
- `docs/whatsapp-agent/03-backlog-mvp.md`

Arquivos de conhecimento:

- `apps/whatsapp-agent/src/knowledge/knowledge.base.ts`
- `apps/whatsapp-agent/src/knowledge/re7.seed.md`

### O que e legado

- docs antigas do MVP;
- `knowledge.base.ts` global;
- `re7.seed.md`;
- termos de fluxos antigos que nao sao tenant-scoped.

### O que e reaproveitavel

- playbook de parametrizacao;
- bid package de IA;
- auditoria de gaps;
- metodologia evaluation/replay;
- textos de produto para orientar taxonomia.

### Como pode virar KB formal

Criar pipeline:

```text
Documento/FAQ/Manual
  -> revisão humana
  -> artigo KB
  -> tags/intents
  -> versionamento
  -> uso pela IA/chatbot
  -> avaliação/replay
```

## Evaluation E Replay

### O que existe

Arquivos:

- `apps/whatsapp-agent/src/evaluation/evaluationDataset.generated.json`
- `apps/whatsapp-agent/src/evaluation/evaluationReplay.ts`
- `apps/whatsapp-agent/src/evaluation/evaluationScoring.ts`
- `apps/whatsapp-agent/src/evaluation/conversationExport.ts`
- `apps/whatsapp-agent/scripts/evaluation-replay.ts`
- `apps/whatsapp-agent/scripts/evaluation-export-conversation.ts`
- `apps/whatsapp-agent/scripts/evaluation-validate-candidate.ts`
- `apps/whatsapp-agent/scripts/evaluation-import-candidate.ts`

### Relevancia para KB

Essencial.

Ao formalizar Knowledge Base, cada falha real deve virar:

- caso exportado;
- expectativa revisada;
- teste de regressao;
- criterio de nao regressao para prompts/artigos.

## O Que Ja Existe Para Uma KB Formal

| Componente necessario | Estado atual | Reuso |
| --- | --- | --- |
| Tenant config | Existe | Alto |
| Prompts por tenant | Existe | Alto |
| Topicos permitidos/bloqueados | Existe | Alto |
| Catalogo de intencoes | Existe | Alto |
| Qualification schema | Existe | Alto |
| Flow context/tags | Existe | Alto |
| Chatbot flow | Existe | Alto |
| Evaluation/replay | Existe | Alto |
| UI admin para IA | Existe | Medio/alto |
| Base global minima | Existe, legado | Medio |
| Artigos KB por tenant | Nao existe | Criar |
| Colecoes/categorias KB | Nao existe | Criar |
| Versionamento/aprovacao | Nao existe | Criar |
| Busca full-text/semantica | Nao existe | Criar |
| Fontes/anexos | Nao existe | Criar |
| Feedback de resposta | Nao existe | Criar |

## O Que Nao Deve Ser Feito

- Nao transformar `knowledge.base.ts` em fonte oficial multi-tenant.
- Nao usar catalogo previdenciario hardcoded como default global.
- Nao liberar IA sem contexto e topicos por tenant.
- Nao colocar documentos longos diretamente em prompt.
- Nao misturar conhecimento de tenants diferentes.
- Nao criar KB sem evaluation/replay.

## Modelo Alvo Recomendado

### Fase 1 - KB Formal MVP

Criar:

- `KnowledgeCollection`
- `KnowledgeArticle`
- `KnowledgeArticleVersion` ou versionamento simples no artigo;
- status: `draft`, `approved`, `archived`;
- campos:
  - tenant/clientId;
  - title;
  - question;
  - approvedAnswer;
  - tags;
  - intentKeys;
  - sourceType;
  - sourceUrl/sourceNote;
  - updatedBy;
  - approvedAt.

### Fase 2 - Integracao Com IA

- buscar artigos aprovados por intent/topico;
- compor prompt com trechos pequenos;
- registrar artigo usado no evento/resposta;
- fallback para humano quando nao houver artigo.

### Fase 3 - Integracao Com Chatbot

- nodes podem apontar para artigo;
- menu pode filtrar por tag/colecao;
- handoff pode incluir artigo sugerido.

### Fase 4 - Qualidade

- exportar conversa ruim;
- revisar expectativa;
- importar dataset;
- rodar replay;
- ajustar artigo/prompt;
- impedir regressao.

## Priorizacao

| Item | Risco | Esforco | Prioridade |
| --- | --- | --- | --- |
| Model KB + CRUD admin interno | Medio | Medio | P1 |
| Article lookup por intent/topico | Medio | Medio | P1 |
| Uso no prompt IA | Medio/alto | Medio | P1 |
| Referencia de artigo em eventos | Baixo | Baixo/medio | P1 |
| UI cliente em `/app` | Medio | Medio | P2 |
| Busca semantica/embeddings | Medio/alto | Alto | P3 |
| Importacao de PDFs/documentos | Alto | Alto | P3 |

## Sprint Recomendada

**Sprint 69B - Knowledge Base MVP Design**

Escopo seguro:

1. desenhar schema Prisma para `KnowledgeCollection` e `KnowledgeArticle`;
2. definir status e versionamento minimo;
3. definir busca inicial por tags/intents sem embeddings;
4. definir como a IA consome apenas artigos aprovados;
5. definir eventos de auditoria de artigo usado;
6. definir UX interna no `/admin`;
7. nao implementar importacao de PDF nem embeddings ainda.

## Veredito

O Converta nao possui Knowledge Base formal pronta, mas possui uma base de IA/configuracao/intent/qualification madura o suficiente para implementar uma KB por tenant sem retrabalho estrutural.

O melhor caminho e transformar o conhecimento hoje espalhado em prompts, catalogos, flows e docs em artigos aprovados, versionados e auditaveis por tenant.

