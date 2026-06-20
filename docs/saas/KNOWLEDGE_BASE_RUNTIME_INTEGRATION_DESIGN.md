# Knowledge Base Runtime Integration Design

Sprint 69D - desenho tecnico e funcional para integrar futuramente a Knowledge Base ao runtime de IA/chatbot.

Status: documento de design. Nao altera runtime, banco, APIs, canais ou comportamento em producao.

## 1. Contexto

A Sprint 69C criou a Knowledge Base formal do Converta:

- tabelas `KnowledgeBaseCollection` e `KnowledgeBaseArticle`;
- CRUD tenant-scoped em `/app/knowledge-base`;
- feature flag `knowledgeBase`, desligada por padrao;
- status de artigo `draft`, `published`, `archived`;
- runtime de IA, chatbot, WhatsApp, Messenger e Instagram ainda sem consumo da KB.

Esta sprint define como a KB deve entrar no runtime em fases futuras, com shadow mode antes de qualquer resposta real ao cliente.

## 2. Objetivos Da Integracao

1. Aumentar precisao das respostas da IA com conteudo aprovado.
2. Reduzir alucinacao e respostas fora do contexto do tenant.
3. Reaproveitar respostas oficiais em IA, chatbot e atendimento humano.
4. Manter isolamento multi-tenant.
5. Registrar evidencia de qual artigo sustentou cada resposta.
6. Permitir rollback por flag/tenant sem deploy.

## 3. Principios Obrigatorios

- **Tenant-scoped sempre**: todo lookup usa `clientId` do tenant resolvido.
- **Apenas publicado**: `draft` e `archived` nunca entram no runtime.
- **Sem canal global**: KB nao pode ser compartilhada entre tenants.
- **Shadow antes de resposta real**: primeiro calcular e medir, depois habilitar resposta.
- **Redaction em logs**: logs carregam IDs, keys, scores e contagens, nunca corpo completo do artigo.
- **IA supervisionada**: KB orienta a resposta, mas nao elimina handoff.
- **Rollback simples**: desligar `knowledgeBaseRuntime`, `knowledgeBaseShadow` ou `knowledgeBaseAnswering`.

## 4. Lookup Tenant-Scoped

### Entrada

O lookup deve receber:

| Campo | Origem | Observacao |
| --- | --- | --- |
| `clientId` | tenant resolvido | obrigatorio |
| `channel` | conversa atual | `whatsapp`, `instagram`, `messenger`, futuro `webchat` |
| `conversationId` | runtime/timeline | usado apenas para auditoria |
| `inboundText` | mensagem atual | truncado antes de processamento |
| `intentKey` | classificador atual | opcional |
| `qualificationSlots` | flow/IA | opcional |
| `tags` | contexto/intent/flow | opcional |
| `collectionKey` | flow ou config | opcional |
| `profile` | business/government | opcional |

### Query Base

A consulta minima deve aplicar:

```text
where:
  clientId = tenant.clientId
  status = "published"
  collection.status = "active" ou collectionId null
```

`draft` e `archived` ficam fora mesmo se houver match textual forte.

### Filtros

Ordem recomendada:

1. `intentKeys` contem `intentKey`;
2. `tags` contem tag derivada do contexto;
3. `collection.key` quando flow indicar uma colecao;
4. busca textual simples em `title`, `question`, `summary`, `body`;
5. filtros futuros por canal/scope/visibility.

### Resultado

Retornar no maximo 3 artigos elegiveis:

```ts
type KnowledgeLookupResult = {
  matched: boolean;
  articles: Array<{
    id: string;
    key: string;
    title: string;
    collectionKey: string | null;
    status: "published";
    tags: string[];
    intentKeys: string[];
    score: number;
    reason: "intent" | "tag" | "collection" | "text";
    excerpt: string;
  }>;
  noMatchReason?: "disabled" | "no_published_article" | "low_confidence" | "runtime_flag_off";
};
```

O `excerpt` deve ser truncado e usado apenas em contexto controlado. Logs nao devem gravar `body` completo.

## 5. Elegibilidade

| Status | Entra no runtime? | Motivo |
| --- | --- | --- |
| `draft` | nao | conteudo ainda nao aprovado |
| `published` | sim | conteudo liberado para consumo |
| `archived` | nao | conteudo retirado de uso |

### Visibilidade

Campo atual: `visibility = internal | operator | public`.

Uso recomendado:

| Visibility | Uso runtime futuro |
| --- | --- |
| `internal` | pode orientar operador/IA em shadow; nao deve ser citado literalmente ao cliente sem regra |
| `operator` | apropriado para sugestao ao atendente e suporte de resposta |
| `public` | elegivel para resposta direta ao cliente quando `knowledgeBaseAnswering=true` |

Na primeira fase de runtime real, recomenda-se permitir resposta direta apenas com `visibility = public`.

## 6. Integracao Futura Com IA

### Pipeline Recomendado

```text
Mensagem inbound
  -> tenant resolution
  -> automation flags / chatbot / intent classifier
  -> qualification context
  -> KB lookup tenant-scoped
  -> prompt builder com artigos elegiveis
  -> IA supervisionada
  -> validacao de confianca
  -> resposta, fallback ou handoff
```

### Como Artigos Entram No Prompt

Incluir bloco curto e delimitado:

```text
CONHECIMENTO APROVADO DO TENANT:
1. [kb:horario-atendimento] Horario de atendimento
   Resumo: ...
   Resposta aprovada: ...

Regras:
- responda somente com base no conhecimento acima e no contexto do tenant;
- se a pergunta extrapolar o conhecimento aprovado, use fallback/handoff;
- nao invente dados ausentes.
```

### Limites

| Limite | Valor inicial recomendado |
| --- | ---: |
| artigos por lookup | 3 |
| caracteres por artigo | 1200 |
| caracteres totais KB no prompt | 3000 |
| score minimo para resposta direta | 0.75 |
| score minimo para shadow/mensuracao | 0.45 |

### Prioridade Entre Fontes

| Fonte | Papel | Prioridade |
| --- | --- | --- |
| Chatbot flow ativo | conduzir fluxo deterministico | 1 |
| Qualification schema | coletar campos e contexto | 2 |
| KB publicada | responder assunto recorrente aprovado | 3 |
| Prompt/contexto do tenant | tom, limites e politicas | 4 |
| Fallback IA | ultima opcao supervisionada | 5 |
| Handoff humano | baixa confianca/fora de escopo | obrigatorio quando necessario |

KB nao deve interromper fluxo deterministico ativo sem flag especifica.

## 7. Integracao Futura Com Chatbot

### Uso Em `answer_slot`

Fase futura pode permitir node/slot apontar para artigo:

```json
{
  "type": "answer_slot",
  "knowledgeArticleKey": "endereco-loja",
  "fallbackText": "Vou direcionar para a equipe confirmar essa informacao."
}
```

Regras:

- o artigo precisa pertencer ao mesmo `clientId`;
- `status` precisa ser `published`;
- se artigo nao existir ou estiver arquivado, usar `fallbackText` ou handoff;
- nao substituir nodes atuais automaticamente.

### Fallback Supervisionado

Se o lookup nao encontrar artigo confiavel:

1. manter comportamento atual do flow;
2. se o flow exigir resposta e nao houver resposta segura, encaminhar para humano;
3. registrar `kb.lookup.no_match`.

### Nao Substituir Flows Atuais Sem Flag

O primeiro uso de KB no chatbot deve ser atras de flag por tenant:

- `knowledgeBaseRuntime=true`;
- `knowledgeBaseChatbotReferences=true` em sprint futura;
- sem alterar `ChatbotFlow.definition` existente por migration automatica.

## 8. Shadow Mode

### Objetivo

Medir o que a KB teria respondido sem alterar a resposta enviada ao cliente.

### Fluxo

```text
Runtime atual gera resposta normal
KB lookup calcula candidatos
Shadow compara:
  - houve artigo?
  - artigo e compativel com intent?
  - resposta atual diverge do artigo?
Log redigido
Cliente recebe resposta atual, nao a resposta KB
```

### Eventos

`kb.shadow.match` quando:

- artigo publicado encontrado;
- intent/tags/contexto compatíveis;
- resposta atual parece alinhada ao artigo.

`kb.shadow.mismatch` quando:

- artigo publicado encontrado;
- resposta atual parece contradizer ou ignorar artigo;
- ou a IA atual caiu em fallback quando havia artigo de alta confianca.

Nao registrar corpo completo do artigo nem texto privado do cliente. Usar hashes/excertos truncados quando necessario.

## 9. Eventos E Auditoria

Eventos recomendados em `Event`:

| Evento | Quando ocorre | Payload seguro |
| --- | --- | --- |
| `kb.lookup.performed` | lookup executado | `clientId`, `conversationId`, `channel`, `matchedCount`, `topArticleKey`, `score` |
| `kb.lookup.no_match` | nenhum artigo elegivel | `clientId`, `reason`, `intentKey`, `tagCount` |
| `kb.shadow.match` | shadow alinhado | `articleKey`, `score`, `reason` |
| `kb.shadow.mismatch` | shadow divergiu | `articleKey`, `score`, `mismatchType` |
| `kb.answer.used` | futuro envio real baseado na KB | `articleId`, `articleKey`, `version`, `conversationId` |

Campos proibidos em log/evento:

- `body` completo do artigo;
- texto completo da mensagem do cliente;
- dados pessoais;
- tokens/canais/secrets;
- payload bruto de Meta/WhatsApp.

## 10. Evaluation E Replay

### Novos Casos

Criar fixtures com:

1. artigo publicado responde pergunta recorrente;
2. artigo em rascunho nao pode ser usado;
3. artigo arquivado nao pode ser usado;
4. tenant A nao acessa artigo do tenant B;
5. pergunta fora da KB leva a fallback/handoff;
6. artigo `public` pode sustentar resposta;
7. artigo `internal` so aparece em shadow/sugestao, nao em resposta direta.

### Criterios

| Resultado | Condicao |
| --- | --- |
| PASS | artigo correto selecionado, sem vazamento, resposta/fallback esperado |
| PARTIAL | artigo correto em baixa confianca ou fallback aceitavel |
| FAIL | artigo errado, tenant errado, uso de draft/archived, alucinacao ou resposta direta sem flag |

### Dataset

Nao misturar fixtures KB com conversas reais sem revisao. O fluxo segue:

```text
erro real -> export conversation -> revisar expectation -> importar dataset -> replay PASS antes do deploy
```

## 11. Feature Flags E Rollback

Flags propostas:

| Flag | Default | Uso |
| --- | --- | --- |
| `knowledgeBase` | false | mostra CRUD no `/app` |
| `knowledgeBaseRuntime` | false | permite lookup no runtime |
| `knowledgeBaseShadow` | false | calcula shadow sem responder |
| `knowledgeBaseAnswering` | false | permite resposta real baseada em KB |
| `knowledgeBaseChatbotReferences` | false | permite flow apontar para artigos |

Ordem segura:

1. `knowledgeBase=true` em tenant piloto;
2. criar/publicar artigos;
3. `knowledgeBaseRuntime=true`;
4. `knowledgeBaseShadow=true`;
5. coletar eventos;
6. adicionar replay cases;
7. `knowledgeBaseAnswering=true` apenas em tenant piloto e com artigos `public`;
8. expandir gradualmente.

Rollback:

- desligar `knowledgeBaseAnswering`;
- desligar `knowledgeBaseShadow`;
- desligar `knowledgeBaseRuntime`;
- manter CRUD ativo se necessario;
- em incidente de conteudo, arquivar artigo.

## 12. Ordem Recomendada De Implementacao

### Sprint 69E - KB Lookup Service + Shadow

Implementar:

- service `knowledgeBaseLookup`;
- query tenant-scoped;
- shadow sem alterar resposta;
- eventos redigidos;
- testes de isolamento/status;
- sem resposta real.

### Sprint 69F - Evaluation KB Dataset

Implementar:

- fixtures KB;
- replay com artigos mockados ou seed controlado;
- criterios PASS/PARTIAL/FAIL;
- casos de vazamento entre tenants.

### Sprint 69G - IA KB Shadow Prompt Builder

Implementar:

- prompt builder com artigos truncados;
- metrica de match/mismatch;
- sem envio real.

### Sprint 69H - KB Answering Piloto

Implementar:

- `knowledgeBaseAnswering`;
- apenas tenant piloto;
- apenas `visibility=public`;
- limite de confianca;
- fallback/handoff obrigatorio.

### Sprint 69I - Chatbot References

Implementar:

- nodes/slots apontando para artigo;
- validacao no editor;
- fallback por artigo ausente/arquivado.

## 13. Riscos

| Risco | Severidade | Mitigacao |
| --- | --- | --- |
| Artigo errado sustentar resposta | Alta | shadow, score minimo, replay, public only |
| Vazamento entre tenants | Critica | `clientId` obrigatorio em lookup e testes |
| Uso de rascunho | Alta | query fixa `status=published` |
| Resposta direta com artigo interno | Alta | `visibility=public` para answering |
| Prompt grande/caro | Media | top 3 artigos e limite de caracteres |
| Logs com dados sensiveis | Alta | payload redigido e sem body completo |
| Quebra de flows existentes | Alta | KB nao substitui flow sem flag |
| Baixa qualidade por busca textual simples | Media | shadow e avaliacao antes de answering |

## 14. Criterio Para Ativar Resposta Real

Antes de `knowledgeBaseAnswering=true`, exigir:

- tenant piloto com artigos revisados;
- pelo menos 10 casos replay KB PASS;
- shadow sem mismatch critico em janela real;
- plano de rollback por flag;
- operador/supervisor ciente;
- artigos de resposta direta com `visibility=public`;
- nenhum evento de vazamento tenant/status.

## 15. Veredito

A KB deve entrar no runtime de forma progressiva:

1. lookup tenant-scoped;
2. shadow mode;
3. evaluation/replay;
4. resposta real apenas em piloto;
5. chatbot references depois.

Nao ha base tecnica para ligar resposta KB diretamente apos a 69C. O proximo passo correto e implementar lookup + shadow, sem alterar a resposta enviada ao cliente.
