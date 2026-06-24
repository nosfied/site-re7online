# Sprint 75E - Audio Transcription Design

Data: 2026-06-23

Status: design concluido, sem implementacao.

Escopo: projetar o modulo futuro de transcricao de audio do Converta e registrar a fundacao criada nas Sprints 75F, 75G, 75H e 75I. O runtime controlado/manual existe; desde a Sprint 76E, transcricoes `completed` podem ser indexadas manualmente no `SearchIndex` via `npm run search:index-audio`. Ainda nao ha processamento automatico, cron, worker permanente, consumo por IA ou exibicao no Inbox.

Nao houve alteracao de codigo, banco, migration, runtime, canais, IA, chatbot, Inbox ou integracao externa nesta sprint.

## Resumo Executivo

Transcricao de audio e um dos gaps funcionais restantes de maior impacto em editais avancados, especialmente quando o TR exige historico integral pesquisavel, auditoria de atendimento, acessibilidade, ouvidoria ou busca por termos em dialogos.

O Converta ja tem base reaproveitavel:

- `MessageType.AUDIO` no schema;
- normalizacao de audio inbound WhatsApp em `apps/whatsapp-agent/src/domain/whatsapp/normalizeWebhook.ts`;
- metadados de midia em `InboundMessage.rawPayload` e `OutboundMessage.rawPayload`;
- endpoint de download de midia na timeline em `/app/conversation/:waId/messages/:messageId/media`;
- funcao de transcode para envio de audio em `apps/whatsapp-agent/src/media/audioTranscode.ts`;
- timeline do Inbox baseada em `InboundMessage` e `OutboundMessage`;
- CRM timeline com titulo "Audio recebido/enviado";
- LGPD/retencao e eventos de auditoria ja existentes;
- Knowledge Base, IA e Public API como consumidores futuros.

O que nao existe hoje:

- entidade formal de transcricao: **criada na Sprint 75F**;
- job/queue estrutural de transcricao: **criada na Sprint 75F**, sem processamento real;
- shadow pipeline de elegibilidade: **criado na Sprint 75G**, sem download/provider/transcript;
- design de runtime controlado: **criado na Sprint 75H** em `docs/saas/AUDIO_TRANSCRIPTION_CONTROLLED_RUNTIME_DESIGN.md`;
- runtime controlado/manual: **criado na Sprint 75I** com CLI `npm run audio-transcriptions:process`;
- provider de speech-to-text ativo apenas em modo manual/piloto com `--execute` e `OPENAI_API_KEY`;
- download controlado implementado para transcricao manual;
- indice de busca sobre transcript: **criado na Sprint 76E** para transcricoes `completed`, via CLI manual, dry-run default e `--record` opcional;
- UI no Inbox para mostrar transcript;
- permissao/retencao especifica para transcript;
- eventos de auditoria `audio.transcription.*`.

## Auditoria Rapida

| Area | Evidencia atual | Reaproveita? | Gap |
| --- | --- | --- | --- |
| Tipos de mensagem | `MessageType.AUDIO` em Prisma | Sim | Nenhum para classificar audio |
| WhatsApp inbound audio | `normalizeWebhook.ts` extrai `audio.id`, `mime_type`, `sha256` | Sim | Falta job que consome esse media id |
| WhatsApp media download | rota `/app/conversation/:waId/messages/:messageId/media` busca media por `rawPayload` | Sim | Falta modo servidor para download/transcricao com controle de tamanho |
| WhatsApp outbound audio | `send-media` e `audioTranscode.ts` | Parcial | Transcricao deve priorizar inbound, nao envio |
| Telegram | MVP 74F e texto-only; midia/audio bloqueados | Futuro | Audio Telegram fora do MVP de transcricao |
| Webchat | Widget/polling texto-only; audio nao existe | Futuro | Audio Webchat fora do MVP |
| Inbox timeline | junta `InboundMessage`/`OutboundMessage` e gera media download | Sim | Falta exibir transcript/status |
| CRM timeline | reconhece `AUDIO` como interacao | Sim | Falta anexar transcript em evento/mensagem |
| Knowledge Base | CRUD e design runtime | Futuro | Transcript pode virar fonte de contexto, mas nao KB automaticamente |
| IA | config tenant-scoped e evaluation | Futuro | Transcript pode alimentar resumo/classificacao, com flag separada |
| Busca | filtro atual usa lead/waId/ultimo bodyText; busca avancada nao existe | Parcial | Transcript precisa alimentar busca futura |

## Fontes De Audio

### MVP Recomendado

| Canal | Status atual | Decisao 75E |
| --- | --- | --- |
| WhatsApp inbound audio | Existe como midia inbound normalizada | **Dentro do MVP** |
| WhatsApp outbound audio | Existe como envio de midia | Fora do MVP inicial; transcrever resposta enviada agrega pouco |
| Messenger audio | Nao formalizado como audio operacional no Converta | Fora do MVP |
| Instagram audio | Nao formalizado como audio operacional no Converta | Fora do MVP |
| Telegram audio | Canal texto-only; midia/audio fora do escopo 74F | Fora do MVP |
| Webchat audio | Widget texto-only; nao ha upload/audio | Fora do MVP |

Justificativa: WhatsApp e o canal principal, ja possui media id e endpoint de media. Comecar por WhatsApp inbound reduz risco e gera valor imediato para CAC/ouvidoria.

## Arquitetura Alvo

```text
Audio inbound
  -> InboundMessage type=AUDIO
  -> AudioTranscriptionJob pending
  -> download controlado da midia
  -> validacao de tamanho/duracao/mime
  -> provider speech-to-text
  -> AudioTranscription completed/failed
  -> timeline exibe transcript
  -> busca futura indexa transcript
```

### Principios

- Tenant-scoped sempre por `clientId`.
- Nunca confiar apenas em `messageId` sem `clientId`.
- Nao armazenar audio bruto adicional se a midia ja pode ser obtida do provider ou storage controlado.
- Nao mandar audio para provider externo sem feature flag e politica LGPD.
- Transcript e dado pessoal e deve seguir retencao/anonymizacao.
- Falha de transcricao nao pode bloquear webhook, Inbox ou atendimento.

## Entidades Propostas

### AudioTranscription

```text
id
clientId
conversationId
inboundMessageId
outboundMessageId nullable
channel
provider
messageId
status pending|processing|completed|failed|skipped|redacted
language
transcript
confidence
providerName
providerRequestId
durationMs
audioMimeType
audioSizeBytes
startedAt
completedAt
failedAt
failureReason
createdAt
updatedAt
```

Notas:

- `inboundMessageId` deve ser o alvo principal do MVP.
- `outboundMessageId` fica reservado para futuro.
- `transcript` pode ser `Text`/`String` longo.
- `confidence` deve ser opcional; nem todo provider retorna valor comparavel.
- `failureReason` deve ser redigido.

### AudioTranscriptionJob

```text
id
clientId
transcriptionId
status pending|leased|completed|failed|cancelled
runAfter
attemptCount
maxAttempts
leaseUntil
workerId
lastError
createdAt
updatedAt
```

Notas:

- Pode ser dispensado no MVP se a primeira versao usar CLI shadow/manual, mas e recomendado para evitar misturar estado de transcript com estado de processamento.
- Se houver worker futuro, usar lease curto e idempotencia por `clientId + messageId`.

## Feature Flags

| Flag | Default | Uso |
| --- | ---: | --- |
| `audioTranscription` | false | habilita visualizacao do modulo `/app/audio-transcriptions` |
| `audioTranscriptionRuntime` | false | permite processar audio real futuramente |
| `audioTranscriptionShadow` | false | permite calcular elegibilidade sem chamar provider |
| `audioTranscriptionSearch` | false | proposta futura; na 76E a indexacao exige `advancedSearch`, `advancedSearchRuntime` e `audioTranscription` |

Todas devem nascer desligadas por padrao.

## Pipeline Detalhado

### 1. Elegibilidade

Um audio e elegivel se:

- `InboundMessage.clientId` pertence ao tenant;
- `InboundMessage.type=AUDIO`;
- canal permitido no MVP: `whatsapp`;
- existe `mediaId` em `rawPayload`;
- mensagem nao foi anonimizada/removida;
- tenant tem `audioTranscription=true`;
- runtime so processa com `audioTranscriptionRuntime=true`;
- tamanho/duracao/mime dentro dos limites.

### 2. Download Controlado

O download deve:

- reutilizar a logica segura de media ja existente quando possivel;
- usar token/provider do canal sem expor segredo;
- aplicar limite de tamanho;
- aplicar timeout curto;
- validar MIME real;
- descartar arquivo temporario apos envio ao provider;
- registrar evento redigido.

Eventos sugeridos:

- `audio.transcription.download_started`
- `audio.transcription.download_failed`
- `audio.transcription.download_succeeded`

### 3. Transcricao

Primeiro runtime deve ser controlado:

- CLI/manual ou worker desabilitado por default;
- provider configurado por env/secret manager;
- sem chamada externa em shadow;
- sem bloquear webhook;
- falhas persistidas no job/transcription.

Eventos:

- `audio.transcription.started`
- `audio.transcription.completed`
- `audio.transcription.failed`
- `audio.transcription.skipped`

### 4. Armazenamento

Salvar apenas:

- transcript;
- idioma;
- confidence;
- provider redigido;
- metadados tecnicos;
- falha redigida.

Nao salvar:

- audio bruto duplicado;
- payload provider integral;
- token de canal;
- URL temporaria;
- conteudo sensivel desnecessario.

## Inbox E Timeline

### Exibicao

Para `AUDIO` no Inbox:

- estado `Transcricao pendente`;
- estado `Transcrevendo`;
- estado `Transcricao indisponivel`;
- transcript expandivel quando `completed`;
- botao "copiar transcricao" se permitido;
- metadados minimos: idioma/confidence se disponivel.

### Permissoes

- Leitura: usuarios com acesso a conversa/departamento.
- Escrita/reprocessar: supervisor/admin.
- Ocultar/redigir transcript: supervisor/admin.

### Fallback

Se transcricao falhar:

- manter audio acessivel pelo fluxo atual;
- exibir erro seguro;
- permitir reprocessamento se feature habilitada.

## Busca Avancada

Transcricao deve alimentar busca futura, mas nao deve implementar busca nesta sprint.

Modelo recomendado:

```text
ConversationSearchIndex
  sourceType = message_text | audio_transcript | lead_note | kb_article
  sourceId
  clientId
  conversationId
  channel
  text
  createdAt
```

Para o MVP de busca:

- indexar transcript quando `AudioTranscription.status=completed`;
- filtros por tenant, canal, departamento, periodo e contato;
- resultado aponta para conversa + mensagem de audio.

## IA, Knowledge Base E CRM

### IA

Uso futuro:

- resumo de atendimento incluindo audio;
- classificacao de demanda;
- deteccao de assunto/urgencia;
- sugestao de resposta ao atendente;
- handoff quando transcript indicar risco.

Guardrail:

- IA nao deve consumir transcript sem `audioTranscriptionRuntime=true` e flag especifica de consumo IA.

### Knowledge Base

Transcript nao deve virar artigo de KB automaticamente.

Uso adequado:

- recuperar contexto da conversa;
- sugerir lacunas de conhecimento;
- gerar candidato de FAQ apenas com revisao humana.

### CRM Timeline

Transcript pode aparecer como detalhe da interacao de audio:

- titulo continua "Audio recebido";
- corpo pode mostrar snippet da transcricao;
- detalhe abre transcript completo.

## Seguranca, LGPD E Retencao

Transcricao de audio e dado pessoal. Politicas obrigatorias:

- tenant opt-in;
- finalidade documentada;
- retencao alinhada a `RetentionConfig`;
- anonymizacao deve apagar/redigir transcript;
- logs sem transcript completo;
- eventos com metadados, nao conteudo;
- provider externo precisa constar no DPA/contrato;
- suporte a reprocessamento e exclusao.

Riscos:

| Risco | Severidade | Mitigacao |
| --- | --- | --- |
| Envio indevido de audio a provider externo | Alto | flags default false, runtime opt-in, auditoria |
| Vazamento de transcript em logs | Alto | redaction e proibicao de transcript em logger |
| Custo imprevisivel | Medio/alto | limite por tenant, tamanho/duracao, quota |
| Latencia no webhook | Medio | processamento assinc/shadow, nunca inline |
| Erro de transcricao usado como verdade | Medio | confidence, UI com aviso e audio original |
| Retencao divergente do audio original | Alto | integrar com retention/anonymization |

## Configuracoes Futuras

Possivel `TenantOperationalConfig.config.audioTranscription`:

```json
{
  "enabled": false,
  "runtimeEnabled": false,
  "channels": ["whatsapp"],
  "language": "pt-BR",
  "maxDurationSeconds": 300,
  "maxAudioBytes": 10485760,
  "provider": "manual",
  "storeTranscript": true,
  "allowAiConsumption": false,
  "allowSearchIndexing": false
}
```

## Roadmap

### Sprint 75F - Schema + Settings

Status: implementada como fundacao inerte.

- `AudioTranscription` criado;
- `AudioTranscriptionJob` criado;
- feature flags `audioTranscription` e `audioTranscriptionRuntime` criadas com default `false`;
- tela `/app/audio-transcriptions` criada para leitura/diagnostico;
- sem provider externo;
- sem download automatico;
- sem criacao de jobs reais;
- sem runtime.

### Sprint 75G - Shadow Pipeline

Status: implementada como pipeline shadow/manual.

- CLI `npm run audio-transcriptions:shadow`;
- `--tenant` obrigatorio;
- `--limit`, `--message`, `--json`;
- dry-run por padrao;
- `--record` opcional cria `AudioTranscription.status=shadow` e `AudioTranscriptionJob.status=skipped`;
- elegibilidade WhatsApp inbound audio primeiro;
- idempotencia por `clientId + messageId`;
- nao baixa audio;
- nao chama provider;
- nao gera transcript real;
- mede volume/custo estimado por candidatos e razoes de skip.

### Sprint 75H - Controlled Runtime Design

Status: design concluido, sem implementacao.

- documento criado em `docs/saas/AUDIO_TRANSCRIPTION_CONTROLLED_RUNTIME_DESIGN.md`;
- provider MVP recomendado: OpenAI Speech-to-Text;
- runtime futuro por CLI manual `audio-transcriptions:process`;
- `--dry-run` default e `--execute` explicito;
- WhatsApp inbound audio apenas;
- limites iniciais: 15 MB, 5 minutos, baixa concorrencia, limite diario por tenant;
- arquivo temporario em `/tmp/converta/audio-transcriptions`, com limpeza obrigatoria;
- rollback por `audioTranscriptionRuntime=false`;
- sem codigo, banco, provider, download real, transcript real, busca, IA ou alteracao de canais.

### Sprint 75I - Controlled Runtime MVP

Status: implementada como runtime manual/piloto.

- download controlado de audio WhatsApp;
- provider OpenAI Speech-to-Text configurado por `OPENAI_API_KEY`;
- CLI `npm run audio-transcriptions:process`;
- `--dry-run` default;
- `--execute` explicito;
- tenant obrigatorio;
- processamento manual/piloto, sem cron/worker;
- transcript persistido;
- `AudioTranscription.status=processing|completed|failed|skipped`;
- `AudioTranscriptionJob.status=processing|completed|failed`;
- cleanup obrigatorio de arquivo temporario;
- testes com provider mockado;
- sem busca ainda.

### Sprint 75J - Search Integration

- criar indice de busca;
- indexar transcripts completos;
- UI de busca por conversa/mensagem;
- filtros por canal, departamento, periodo e contato.

### Sprint 75K - AI Integration

- consumo de transcript por IA somente com flag dedicada;
- resumo/classificacao;
- evaluation com casos de audio;
- sugestao de FAQ/KB apenas com revisao humana.

## Impacto Nos Editais

| Edital/perfil | Impacto |
| --- | --- |
| Conselheiro Lafaiete/MG | Ajuda historico integral, auditoria e atendimento multissetorial. |
| Aripuana/MT | Ajuda, mas nao resolve gaps maiores de escala/storage/HA. |
| Cabreuva/SP | Diferencial, provavelmente nao bloqueador. |
| Quatro Barras/PR | Diferencial para relatorios e ouvidoria. |
| Sao Jose do Rio Preto/SP | Alto impacto por ser edital-guia avancado com multicanal, auditoria e busca. |

## Veredito

Transcricao de audio deve ser implementada depois de validar explicitamente provider, custo, retencao e limites por tenant no pre-release da Sprint 75I.

MVP recomendado:

1. WhatsApp inbound audio apenas.
2. Shadow/dry-run antes de provider externo.
3. Runtime controlado por CLI, sem cron/worker.
4. Transcript persistido antes de entrar no Inbox.
5. Busca somente em sprint posterior.

Confirmacao: esta sprint nao alterou codigo, banco, runtime, IA, chatbot, canais ou integracoes externas.
