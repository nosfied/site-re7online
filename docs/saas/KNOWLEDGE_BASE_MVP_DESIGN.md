# Knowledge Base MVP Design

Sprint 69B - desenho funcional e tecnico da primeira Knowledge Base oficial do Converta.

Status: documento de design. Nao altera runtime, banco, APIs ou comportamento.

## 1. Visao Geral

A Knowledge Base do Converta deve transformar conhecimento hoje espalhado em prompts, fluxos, catalogos, respostas aprovadas, documentos e regras de qualificacao em uma fonte formal, versionada, auditavel e segregada por tenant.

Objetivo do MVP:

- apoiar respostas de IA com conteudo aprovado;
- reduzir alucinacao;
- padronizar respostas recorrentes;
- reaproveitar conhecimento entre chatbot, IA, CRM e atendimento humano;
- criar base demonstravel para editais B2G;
- manter governanca por tenant.

O MVP nao deve tentar resolver importacao automatica de documentos, embeddings, busca semantica avancada ou webchat. Primeiro deve criar a fonte oficial e sua ligacao basica com IA/chatbot.

## 2. Fontes Da Knowledge Base

| Fonte atual | Onde existe | Uso atual | Destino no MVP |
| --- | --- | --- | --- |
| Prompts e contexto IA | `TenantOperationalConfig.config.aiAssistantConfig` | Orienta tom, limites e respostas | Politica/instrucao da KB por tenant |
| Catalogo de intencoes | `aiIntentQualification.aiAssistantIntentCatalog` | Classifica assuntos e respostas controladas | Taxonomia inicial de artigos |
| Qualification schema | `aiIntentQualification.aiQualification` | Coleta slots e preenche CRM | Perguntas/condicoes vinculadas a artigos |
| Chatbot flows | `ChatbotFlow.definition` | Fluxos estruturados | Pode apontar para artigos aprovados |
| FAQ conceitual | docs e respostas espalhadas | Nao formal | Tipo de artigo `faq` |
| Documentos | docs/manual/anexos externos | Nao formal no produto | Fonte/referencia de artigo |
| CRM context | `flowContext`, `Lead`, `LeadNote` | Contexto operacional | Sinais para selecionar artigo/intent |
| Respostas reutilizaveis | catalogos, flows, prompts | Espalhadas | `body` do artigo publicado |
| `knowledge.base.ts` | legado global | Base minima Re7 | Seed historico, nao fonte oficial |

## 3. Principios Do Modelo

1. **Tenant-first**: nenhum conhecimento deve ser global por padrao.
2. **Aprovado antes de uso**: IA so deve usar artigo aprovado.
3. **Rastreavel**: resposta baseada em artigo deve registrar qual artigo foi usado.
4. **Pequeno antes de semantico**: MVP usa tags/intents/busca textual simples antes de embeddings.
5. **Sem mistura entre tenants**: conhecimento de um tenant nao pode vazar para outro.
6. **Compatibilidade com IA atual**: reaproveitar `aiAssistantConfig`, `aiIntentQualification` e evaluation/replay.
7. **Humano no controle**: artigos devem ser editados/aprovados por usuario autorizado.

## 4. Arquitetura Alvo

```text
Mensagem recebida
  |
  v
Tenant resolution
  |
  v
Chatbot / Intent / Qualification
  |
  v
Knowledge lookup por tenant
  - intentKeys
  - tags
  - texto
  - status published
  |
  v
IA supervisionada ou resposta controlada
  |
  v
Timeline + evento com artigo usado
```

## 5. Entidades Propostas

### 5.1 KnowledgeCollection

Agrupa artigos por contexto.

Campos propostos:

| Campo | Tipo | Observacao |
| --- | --- | --- |
| `id` | string | identificador |
| `clientId` | uuid | tenant scope |
| `key` | string | chave unica por tenant |
| `name` | string | nome exibido |
| `description` | string nullable | descricao |
| `status` | enum | `active`, `archived` |
| `audience` | enum/string | `customer`, `citizen`, `operator`, `internal` |
| `createdAt` | datetime | auditoria |
| `updatedAt` | datetime | auditoria |

Exemplos:

- `atendimento_geral`
- `ouvidoria`
- `cac`
- `produtos`
- `politicas_publicas`
- `faq_institucional`

### 5.2 KnowledgeArticle

Unidade principal de conhecimento.

Campos propostos:

| Campo | Tipo | Observacao |
| --- | --- | --- |
| `id` | string | identificador |
| `clientId` | uuid | tenant scope |
| `collectionId` | string nullable | colecao |
| `key` | string | chave unica por tenant |
| `title` | string | titulo |
| `question` | string nullable | pergunta/FAQ |
| `body` | text | resposta/conteudo aprovado |
| `summary` | string nullable | resumo curto |
| `tags` | json/string[] | tags |
| `intentKeys` | json/string[] | intents relacionados |
| `qualificationSlotKeys` | json/string[] | slots relevantes |
| `sourceType` | enum | `manual`, `document`, `faq`, `flow`, `intent`, `crm` |
| `sourceNote` | string nullable | referencia textual |
| `sourceUrl` | string nullable | link externo/interno |
| `status` | enum | `draft`, `published`, `archived` |
| `version` | int | versao atual |
| `createdByUserId` | string nullable | auditoria |
| `updatedByUserId` | string nullable | auditoria |
| `publishedByUserId` | string nullable | auditoria |
| `publishedAt` | datetime nullable | controle de uso |
| `createdAt` | datetime | auditoria |
| `updatedAt` | datetime | auditoria |

### 5.3 KnowledgeArticleVersion

Opcional no MVP. Pode ser adiado se o artigo tiver `version` e eventos de auditoria.

Se incluido:

| Campo | Tipo | Observacao |
| --- | --- | --- |
| `id` | string | identificador |
| `articleId` | string | artigo |
| `version` | int | numero |
| `snapshot` | json | conteudo versionado |
| `createdByUserId` | string nullable | auditoria |
| `createdAt` | datetime | data |

Recomendacao MVP: **adiar tabela de versoes** e iniciar com `version` + eventos, para reduzir escopo.

### 5.4 KnowledgeUsageEvent

Opcional como tabela dedicada. Pode usar `Event` no MVP.

Evento recomendado:

```json
{
  "eventName": "knowledge.article.used",
  "payload": {
    "articleId": "...",
    "articleKey": "...",
    "source": "ai_assistant",
    "intentKey": "...",
    "confidence": 0.8
  }
}
```

## 6. Permissoes

### Console interno `/admin`

Pode:

- criar colecao;
- criar artigo;
- editar artigo;
- aprovar artigo;
- arquivar artigo;
- vincular intent/tags;
- ver status e auditoria.

Publico:

- equipe Re7/suporte;
- configuradores internos;
- implantacao.

### App do tenant `/app`

MVP inicial pode ser somente leitura ou nao existir ainda.

Fase seguinte:

- ADMIN/SUPERVISOR do tenant pode sugerir artigo;
- ADMIN pode editar rascunho se feature habilitada;
- operador comum nao edita KB.

### Runtime

Pode consumir apenas:

- `status = published`;
- `clientId` do tenant atual;
- colecoes ativas;
- respostas dentro do limite de tamanho.

## 7. Integracao Com IA

### Fluxo MVP

1. Detectar tenant.
2. Resolver `aiAssistantConfig` e `aiIntentQualification`.
3. Detectar intent/tags/qualification.
4. Buscar ate 3 artigos aprovados por:
   - `intentKeys`;
   - `tags`;
   - busca textual simples em titulo/pergunta/resumo.
5. Montar prompt com:
   - contexto do tenant;
   - limites da IA;
   - artigos relevantes curtos;
   - mensagem do usuario.
6. Registrar evento se artigo for usado.
7. Se nao houver artigo confiavel:
   - usar fallback atual;
   - ou recomendar handoff conforme configuracao.

### Regra De Segurança

A IA nao deve receber todos os documentos do tenant. Ela deve receber apenas trechos/artigos relevantes e aprovados.

## 8. Integracao Com Chatbot

### MVP

Sem alterar formato atual de flows no primeiro momento.

Fase seguinte:

- permitir campo opcional em node:

```json
{
  "type": "text",
  "knowledgeArticleKey": "endereco_showroom"
}
```

Ou em option:

```json
{
  "label": "Endereço",
  "next": "endereco",
  "knowledgeTag": "location"
}
```

### Beneficio

O chatbot deixa de duplicar texto em varios nodes e passa a reutilizar resposta aprovada.

## 9. Integracao Com Qualification

Qualification pode usar artigos de duas formas:

1. artigo exige slots antes da resposta final;
2. slot capturado ajuda a escolher artigo/resposta.

Exemplo:

```json
{
  "articleKey": "catalogo_atacado",
  "requiredSlots": ["tipo_cliente", "cidade"],
  "intentKeys": ["catalogo", "atacado"]
}
```

Para o MVP, essa relacao pode ser feita por `qualificationSlotKeys` no artigo, sem criar nova engine.

## 10. Integracao Com CRM

Artigos podem alimentar CRM indiretamente:

- tags de interesse;
- prioridade;
- lead temperature;
- intent;
- proxima pergunta;
- recomendacao de handoff.

No MVP, o artigo nao deve atualizar CRM sozinho. Ele deve apenas fornecer metadata para a camada existente decidir.

## 11. MVP Funcional

### Deve conter

- Colecoes por tenant.
- Artigos por tenant.
- Status `draft`, `published`, `archived`.
- Tags e intent keys.
- Resposta aprovada.
- Fonte/referencia.
- CRUD no console interno.
- Busca simples por tag/intent/texto.
- Consumo futuro pela IA apenas de artigos aprovados.
- Eventos de uso via `Event`.

### Nao deve conter ainda

- importacao automatica de PDF;
- embeddings;
- RAG vetorial;
- web crawler;
- editor rico;
- workflow complexo de aprovacao;
- permissao de edicao ampla no `/app`;
- compartilhamento global entre tenants;
- treinamento automatico de modelo.

## 12. Reutilizacao

| Item existente | Reutilizacao |
| --- | --- |
| `TenantOperationalConfig.aiAssistantConfig` | politica da IA e contexto |
| `aiAssistantIntentCatalog` | taxonomy inicial da KB |
| `aiQualification` | slots e perguntas condicionais |
| `ChatbotFlow` | entrada estruturada e possivel referencia a artigos |
| `Event` | auditoria de uso de artigo no MVP |
| `evaluation/replay` | qualidade e regressao |
| `knowledge.base.ts` | seed historico/manual, nao runtime oficial |
| Admin chatbot UI | padrao visual/UX para nova tela interna |

## 13. Migracao De Conteudo

### Migrar depois, com revisao humana

- respostas do catalogo de intencoes;
- perguntas/respostas de flows;
- mensagens de fallback/handoff;
- documentos de onboarding;
- FAQ do tenant;
- respostas recorrentes validadas em conversas reais.

### Manter legado

- `knowledge.base.ts` ate existir seed formal;
- classificador hardcoded previdenciario ate ser substituido por intents por tenant;
- fluxos demo/orcamento ate deixarem de ser necessarios.

### Nao migrar automaticamente

- prompts longos;
- conversas reais sem revisao;
- documentos inteiros;
- termos de tenants diferentes.

## 14. Riscos

| Risco | Impacto | Mitigacao |
| --- | --- | --- |
| Mistura de conhecimento entre tenants | Alto | `clientId` obrigatorio e testes de isolamento |
| IA usar artigo em rascunho | Alto | runtime filtra apenas `published` |
| Resposta desatualizada | Medio/alto | status/version/updateAt e revisão |
| Conteudo sensivel em artigo | Alto | revisao humana e politica LGPD |
| Prompt muito grande | Medio | limitar artigos e tamanho |
| Duplicacao com flows | Medio | permitir referencia por key em fase posterior |
| RAG/embeddings prematuro | Medio | MVP textual primeiro |
| Falha virar regressao | Medio | evaluation/replay obrigatorio |

## 15. Roadmap

### Sprint 69C - Knowledge Base Schema + Admin CRUD

Objetivo:

- criar models `KnowledgeBaseCollection` e `KnowledgeBaseArticle`;
- migration aditiva;
- rotas tenant-scoped no `/app`;
- tela `/app/knowledge-base` para SUPERVISOR/ADMIN;
- feature flag `knowledgeBase`;
- sem consumo no runtime.

Validacoes:

- Prisma generate/migrate;
- backend/frontend build;
- testes de isolamento por tenant;
- token/dado sensivel nao exposto.

### Sprint 69D - Runtime Integration Design

Objetivo:

- desenhar lookup tenant-scoped;
- definir elegibilidade `published`;
- definir shadow mode;
- definir eventos, replay e flags;
- sem alterar runtime.

### Sprint 69E - KB Lookup + IA Shadow

Objetivo:

- buscar artigos publicados por intent/tag/texto;
- montar resultado de lookup sem alterar resposta final;
- logar shadow redigido;
- validar relevancia.

### Sprint 69F - IA KB-first Controlada

Objetivo:

- IA usa artigos publicados;
- evento `knowledge.article.used`;
- fallback/handoff se nao houver artigo confiavel;
- evaluation/replay obrigatorio.

### Sprint 69G - Chatbot References

Objetivo:

- permitir flow node apontar para artigo;
- reduzir duplicidade de respostas em flows.

### Sprint 69H - App Tenant Suggestions

Objetivo:

- ADMIN/SUPERVISOR do tenant sugere artigos;
- aprovacao continua interna ou por ADMIN conforme regra.

## 16. Sprint Recomendada Para Implementacao

**Sprint 69C - Knowledge Base Schema + Admin CRUD**

Escopo minimo:

1. `KnowledgeBaseCollection`;
2. `KnowledgeBaseArticle`;
3. migration aditiva;
4. rotas `/app/knowledge-base`;
5. tela `/app/knowledge-base`;
6. status `draft/published/archived`;
7. tags e intentKeys;
8. sem runtime IA ainda.

Motivo:

Antes de IA consumir KB, o produto precisa de uma fonte oficial, tenant-scoped e auditavel. Consumir conteudo antes disso so mudaria o problema de lugar.

### Implementacao 69C

A Sprint 69C implementa a primeira estrutura real da Knowledge Base:

- schema aditivo em Prisma;
- CRUD no backend apenas para o tenant autenticado;
- feature flag `knowledgeBase`, com default desligado e rollout por tenant em `Client.features`;
- UI simples no `/app/knowledge-base`;
- controle por RBAC, com escrita restrita a SUPERVISOR/ADMIN;
- sem alteracao em WhatsApp, Messenger, Instagram, IA, chatbot, prompts, intents ou respostas automaticas.

O `/admin` continua reservado para governanca/diagnostico. O conteudo gerenciado pelo cliente nasce no `/app`, mantendo separacao entre console interno Re7online e operacao do tenant.

## 17. Criterio De Sucesso Do MVP

O MVP sera considerado pronto quando:

- cada tenant puder ter artigos aprovados;
- artigos tiverem tags/intents;
- apenas artigos aprovados forem elegiveis para runtime;
- houver auditoria de criacao/edicao/aprovacao;
- evaluation/replay for usado antes de ativar IA KB-first;
- nenhum conhecimento vazar entre tenants.

## Veredito

A Knowledge Base deve nascer como camada formal de conteudo aprovado por tenant. O Converta ja tem maturidade suficiente em IA, intents, qualification, chatbot e evaluation para consumir essa base sem retrabalho, desde que o primeiro passo seja schema/CRUD/auditoria, e nao RAG ou importacao automatica.
