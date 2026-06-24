# Sprint 76A - Advanced Search Design

Data: 2026-06-24

Status: design tecnico/funcional. Nao houve alteracao de codigo, banco, migration, indice, provider externo, runtime, canais, chatbot, IA ou frontend operacional na Sprint 76A.

Atualizacao Sprint 76B: fundacao formal criada com `SearchIndex`, feature flags `advancedSearch=false` e `advancedSearchRuntime=false`, API diagnostica `GET /app/search` e tela `/app/search`. A etapa continua sem indexacao automatica, sem runtime de busca, sem alteracao de Inbox, IA ou canais.

Atualizacao Sprint 76C: criado indexador shadow manual `npm run search:index-shadow`, com `--tenant`, `--source`, `--limit`, `--record` e `--json`. O comando trabalha em dry-run por padrao, exige `advancedSearch=true`, exige `advancedSearchRuntime=false`, cobre apenas `Conversation`, `InboundMessage` e `OutboundMessage`, e nao altera Inbox, IA, canais ou runtime de busca.

## Objetivo

Projetar a busca unificada do Converta antes de qualquer implementacao.

O objetivo do modulo e permitir pesquisa tenant-scoped em contatos, leads, conversas, mensagens, eventos operacionais, Knowledge Base, campanhas, agendamentos e transcricoes de audio, com filtros e paginacao, sem criar dependencia operacional inicial em Elasticsearch/OpenSearch ou busca semantica.

## Resumo Executivo

O Converta ja possui dados pesquisaveis e filtros pontuais em varios modulos, mas ainda nao possui uma busca avancada unificada.

Estado atual:

- Inbox possui filtros e busca operacional limitada sobre conversas/listas.
- Knowledge Base possui busca local por campos de artigo.
- Relatorios possuem filtros por periodo, canal, setor e status.
- Public API expoe leitura de contatos, conversas e mensagens, mas nao endpoint de busca global.
- Audio Transcription ja possui fundacao e runtime controlado, mas transcricoes ainda nao alimentam busca.

Recomendacao para MVP:

- criar uma camada de indice proprio no PostgreSQL;
- usar `clientId` como fronteira obrigatoria;
- indexar somente texto normalizado e seguro;
- usar filtros estruturados para canal, periodo, departamento, atendente, status e tipo de fonte;
- iniciar com busca textual simples e paginacao;
- adiar busca semantica, embeddings e OpenSearch para fase posterior.

## Auditoria De Fontes

| Fonte | Estado atual | Pode ser pesquisado hoje? | Precisa de indexacao? | Observacao |
| --- | --- | --- | --- | --- |
| Contact | Existe e e tenant-scoped | Parcialmente, por telas/API especificas | Sim | Nome, telefone, canal e identidades devem entrar no indice com redaction adequada. |
| Lead | Existe e e tenant-scoped | Parcialmente no CRM/timeline | Sim | Status, notas e campos de qualificacao exigem selecao cuidadosa para nao indexar dado sensivel indevido. |
| Conversation | Existe com indices por tenant/canal/status | Parcialmente por filtros do Inbox | Sim | Deve ser documento agregador para abrir resultado diretamente na conversa. |
| InboundMessage | Existe e alimenta timeline real | Nao como busca unificada | Sim | Indexar texto normalizado; nunca `rawPayload`, token ou payload de provider. |
| OutboundMessage | Existe e alimenta timeline real | Nao como busca unificada | Sim | Indexar texto seguro e labels de template quando aplicavel. |
| Event | Existe para auditoria/eventos | Parcialmente por logs/relatorios internos | Parcial | Indexar apenas metadados redigidos, `eventName`, `requestId` e referencias seguras. |
| Knowledge Base | Existe com collections/articles | Sim, localmente no modulo KB | Sim, para busca unificada | Apenas artigos `published`; `draft` e `archived` ficam fora do runtime de busca. |
| Campaign | Existe | Parcialmente por listas/filtros | Parcial | Indexar nome, status e metadados operacionais; nao indexar payloads brutos. |
| Scheduling | Existe com services/resources/appointments/reminders | Parcialmente por CRUD | Sim | Indexar servico, recurso, compromisso e status quando `scheduling=true`. |
| AudioTranscription | Existe desde 75F/75I | Ainda nao integrado | Sim, futuramente | Apenas transcricoes `completed`; `shadow`, `failed` e `skipped` ficam fora da busca textual. |
| Public API | Existe para leitura de dados | Nao e fonte primaria | Futuro endpoint | A API deve consumir a busca depois que o modulo interno estiver estabilizado. |

## Casos De Uso

| Caso | MVP | Observacao |
| --- | --- | --- |
| Telefone | Sim | Normalizar variantes e usar filtro exato/parcial. |
| Nome | Sim | Busca textual e trigram futuramente para erros de digitacao. |
| Mensagem | Sim | Buscar em inbound/outbound normalizados. |
| Protocolo/requestId | Sim | Busca exata por `requestId`/identificador operacional. |
| Departamento | Sim | Filtro estruturado. |
| Atendente | Sim | Filtro estruturado por usuario atribuido quando aplicavel. |
| Tags/status | Parcial | Depende da padronizacao por modulo. |
| Canal | Sim | WhatsApp, Messenger, Instagram, Webchat e Telegram. |
| Periodo | Sim | Obrigatorio para consultas amplas em mensagens. |
| Transcript de audio | Futuro | Entra na fase 76E, somente transcricoes completas. |
| Artigo KB | Futuro no MVP expandido | Indexar apenas artigos publicados. |

## Escopo Do MVP

O MVP deve entregar:

- busca textual simples;
- filtros combinados;
- paginacao por cursor;
- isolamento por tenant;
- RBAC e escopo de departamento;
- resultados com tipo de fonte, resumo, data e link de abertura;
- observabilidade basica de latencia e quantidade de resultados.

Fora do MVP:

- busca semantica;
- embeddings;
- reranking por IA;
- Elasticsearch/OpenSearch;
- busca em anexos binarios;
- busca em audio antes de transcricao concluida;
- busca publica via API antes de estabilizar o modulo interno.

## Arquitetura Avaliada

| Opcao | Vantagens | Riscos | Decisao |
| --- | --- | --- | --- |
| PostgreSQL full text | Usa stack atual, menor custo operacional, bom para MVP | Requer desenho de indices e backfill cuidadoso | Recomendado para MVP. |
| `pg_trgm` | Bom para nome, telefone e erros de digitacao | Exige extensao/migration e tuning | Recomendado como complemento, nao como primeira dependencia obrigatoria. |
| Tabela dedicada de indice | Permite unificar fontes diferentes e redigir campos | Requer backfill e sincronizacao | Recomendado. |
| Elasticsearch/OpenSearch | Melhor para grande escala e relevancia avancada | Mais custo, operacao, HA e governanca | Futuro, se volume/edital exigir. |
| Busca semantica/vector | Bom para IA e KB | Custo, privacidade, avaliacao e explicabilidade | Futuro, apos busca textual confiavel. |

## Modelo Alvo Recomendado

Criar futuramente uma tabela dedicada, por exemplo `SearchDocument`, com campos conceituais:

- `clientId`;
- `sourceType`;
- `sourceId`;
- `conversationId`;
- `contactId`;
- `leadId`;
- `departmentId`;
- `assignedUserId`;
- `channel`;
- `title`;
- `snippet`;
- `text`;
- `searchVector`;
- `occurredAt`;
- `createdAt`;
- `updatedAt`.

Regras:

- nunca armazenar `rawPayload`;
- nunca armazenar token, ciphertext, media URL completa ou provider payload;
- redigir snippets quando a fonte tiver risco de dados sensiveis;
- manter `clientId` em todos os indices;
- permitir rebuild/backfill idempotente.

## Multi-Tenant, RBAC E LGPD

Regras obrigatorias:

- toda consulta filtra por `clientId`;
- operador ve apenas dados permitidos pelo papel e, se aplicavel, pelo departamento;
- admin interno nao mistura conteudo de tenants;
- resultados de busca devem respeitar retencao e anonimizacao;
- logs de busca nao devem registrar termos sensiveis em claro quando houver risco operacional;
- exportacao de resultados exige permissao especifica se for criada.

## Inbox

A busca no Inbox deve ter dois niveis:

1. Busca rapida na lista atual, para uso operacional imediato.
2. Busca avancada historica, com filtros e paginacao.

Resultado recomendado:

- abrir conversa;
- destacar mensagem encontrada quando houver anchor segura;
- preservar posicao da timeline;
- evitar recarregamento pesado quando o resultado ja estiver em cache.

## Knowledge Base

Integracao futura:

- indexar somente artigos `published`;
- excluir `draft` e `archived`;
- permitir filtros por collection, tag e status;
- manter KB como fonte de conhecimento e tambem como resultado pesquisavel;
- nao substituir lookup IA/chatbot pelo modulo de busca textual sem feature flag especifica.

## Audio Transcription

Integracao futura:

- indexar somente `AudioTranscription.status=completed`;
- nao indexar `shadow`, `pending`, `processing`, `failed` ou `skipped`;
- respeitar politica de retencao e LGPD do audio original;
- permitir filtro `sourceType=audio_transcription`;
- abrir resultado na conversa original;
- manter transcricao fora do prompt de IA ate a fase propria.

## IA

Uso futuro:

- resumir resultados;
- sugerir classificacao;
- montar contexto supervisionado;
- ajudar operador a localizar historico.

Fora do MVP:

- busca semantica;
- resposta automatica baseada em busca;
- consumo por chatbot;
- ranking por LLM.

Qualquer uso de IA deve passar por feature flags e evaluation/replay antes de producao.

## Performance E Observabilidade

Limites recomendados:

- `limit` maximo inicial: 50 resultados;
- termo minimo: 2 ou 3 caracteres, conforme fonte;
- exigir periodo em buscas amplas de mensagem;
- cursor pagination;
- timeout curto para consultas interativas;
- backfill em lotes;
- metricas p50/p95/max por fonte e tenant;
- evento redigido `search.query.performed`;
- evento redigido `search.query.denied`;
- evento redigido `search.index.backfill_completed`.

## Roadmap

| Sprint | Objetivo | Observacao |
| --- | --- | --- |
| 76B - Search Schema + Settings | Criar schema/flags/configuracao do indice | Concluida como fundacao diagnostica, sem runtime de busca. |
| 76C - Search Shadow | Backfill dry-run/record e comparacao com fontes | Concluida para Conversation, InboundMessage e OutboundMessage, sem runtime. |
| 76D - Search Runtime MVP | Busca textual interna no `/app` | Inbox/CRM primeiro. |
| 76E - Search + Audio | Indexar transcricoes concluidas | Depende de 75K/piloto real. |
| 76F - Search + IA | Consumo supervisionado por IA | Depende de evaluation/replay. |

## Riscos

| Risco | Classificacao | Mitigacao |
| --- | --- | --- |
| Vazamento cross-tenant | Alto | `clientId` obrigatorio em indice, query e testes. |
| Indexar dados sensiveis demais | Alto | Lista positiva de campos, redaction e exclusao de payload bruto. |
| Lentidao em mensagens de alto volume | Medio/alto | Indice dedicado, periodo obrigatorio, paginacao e observabilidade. |
| Resultado inconsistente com timeline | Medio | Backfill idempotente e shadow antes do runtime. |
| Escopo virar busca semantica prematura | Medio | MVP textual e sem provider externo. |
| LGPD/retencao | Alto | Respeitar anonimizacao, delete e politica de retencao no indice. |

## Recomendacao

Implementar a busca em fases, com PostgreSQL full text e tabela dedicada de indice tenant-scoped.

O menor proximo passo seguro e a Sprint 76B:

- criar flags e schema do indice;
- nao expor busca ao usuario final;
- preparar backfill;
- manter tudo desligado por padrao.

## Confirmacao De Escopo

Esta sprint nao implementou busca, indice, endpoint, provider externo, migration, tela ou alteracao de runtime.

O entregavel e apenas o desenho tecnico para evitar retrabalho na implementacao futura.
