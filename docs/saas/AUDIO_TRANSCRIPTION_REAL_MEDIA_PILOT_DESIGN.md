# Sprint 75J - Audio Transcription Real Media Pilot Design

Data: 2026-06-24

Status: design concluido, sem implementacao.

Escopo: desenhar o primeiro piloto com midia real controlada para transcricao de audio. Esta sprint nao processa audio real, nao altera codigo, nao altera banco, nao chama provider, nao muda runtime, nao cria busca, nao liga IA e nao altera canais.

## Resumo Executivo

A Sprint 75I colocou em producao o runtime controlado de transcricao, mas o smoke usou `mediaId` sintetico e validou falha controlada de download. A Sprint 75J define como executar o primeiro piloto com audio real de forma segura, auditavel e limitada.

Decisao:

- tenant piloto recomendado: `demo-prefeitura`;
- canal: WhatsApp inbound audio;
- execucao: CLI manual `audio-transcriptions:process`;
- provider: OpenAI Speech-to-Text ja configurado;
- quantidade inicial: ate 3 audios reais;
- duracao maxima por audio: 60 segundos no primeiro piloto;
- orcamento maximo inicial: baixo e controlado, com revisao manual antes de ampliar;
- rollback: `audioTranscriptionRuntime=false` imediatamente apos o teste.

## Plano Do Piloto

| Item | Definicao inicial |
| --- | --- |
| Tenant piloto | `demo-prefeitura` |
| Perfil | ambiente demonstrativo/controlado |
| Usuarios autorizados | operador tecnico/admin responsavel pelo teste e um aprovador interno |
| Canal | WhatsApp inbound |
| Tipo de audio | fala clara em portugues brasileiro, sem dados sensiveis reais |
| Quantidade maxima | 3 audios no primeiro ciclo |
| Duracao maxima por audio | 60 segundos |
| Tamanho maximo | respeitar limite tecnico do runtime, preferir audios curtos |
| Janela de teste | curta, monitorada, sem automacao |
| Execucao | uma mensagem por vez com `--message` |
| Runtime apos teste | desligar `audioTranscriptionRuntime=false` |

Audios proibidos no piloto:

- documentos pessoais;
- saude, dados bancarios, dados de crianca/adolescente ou informacao juridica sensivel;
- audio de cidadao real sem consentimento;
- audio de terceiros nao participantes do teste.

## LGPD

### Consentimento E Finalidade

Antes de usar audio real:

- registrar finalidade: validar transcricao para atendimento, auditoria e acessibilidade;
- usar preferencialmente audio produzido pela equipe interna;
- quando houver audio de terceiro, obter consentimento claro e registravel;
- informar que o audio sera enviado a provider externo de STT.

### Retencao

| Dado | Retencao piloto |
| --- | --- |
| Arquivo temporario de audio | removido ao final do job |
| Transcript | manter apenas no tenant piloto enquanto durar validacao |
| Job/error metadata | manter para auditoria tecnica |
| Logs | sem transcript/audio bruto |

### Descarte

Apos o piloto:

- revisar transcripts gerados;
- apagar/redigir transcripts se contiverem dado sensivel;
- manter apenas metricas agregadas para decisao tecnica;
- garantir `audioTranscriptionRuntime=false`.

### Acesso

- apenas usuarios com acesso administrativo/supervisor ao tenant piloto;
- nao expor transcript em relatorios publicos;
- nao usar transcript em IA, busca ou Knowledge Base nesta etapa.

## Midia

Origem permitida:

- mensagem inbound WhatsApp `MessageType.AUDIO` ja persistida no tenant piloto;
- mensagem criada por usuario interno para teste;
- `messageId` informado explicitamente no CLI.

Fluxo:

```text
audio inbound controlado
  -> localizar InboundMessage por clientId + messageId
  -> dry-run
  -> habilitar runtime
  -> execute manual
  -> download temporario
  -> OpenAI STT
  -> persistir AudioTranscription/AudioTranscriptionJob
  -> cleanup temporario
  -> desligar runtime
```

Diretorio temporario:

```text
/tmp/converta/audio-transcriptions/{clientId}/...
```

Obrigatorio:

- confirmar cleanup apos cada execucao;
- nao copiar audio para outro diretorio;
- nao anexar audio ao report;
- nao imprimir media id, URL ou token.

## Procedimento Operacional

### Pre-check

```bash
npm run audio-transcriptions:process -- --tenant demo-prefeitura --message <messageId> --json
```

Validar:

- `wouldProcess=1`;
- `dryRun=true`;
- nenhuma transcricao criada;
- mensagem pertence ao tenant correto;
- audio e curto e autorizado.

### Execute

Antes:

- habilitar `audioTranscription=true`;
- habilitar `audioTranscriptionRuntime=true` somente no tenant piloto;
- confirmar `OPENAI_API_KEY` presente sem expor valor.

Comando:

```bash
npm run audio-transcriptions:process -- --tenant demo-prefeitura --message <messageId> --execute --json
```

Depois:

- registrar status `completed` ou `failed`;
- confirmar `AudioTranscriptionJob.startedAt/finishedAt/error`;
- confirmar arquivo temporario removido;
- desligar `audioTranscriptionRuntime=false`;
- revisar logs para confirmar ausencia de transcript/audio/token.

## Criterios De Sucesso

| Criterio | Sucesso |
| --- | --- |
| Dry-run | Identifica audio elegivel sem download/provider/persistencia |
| Execute | Processa apenas o `messageId` informado |
| Cleanup | Nao sobra arquivo temporario |
| Persistencia | `AudioTranscription.status=completed` ou `failed` controlado |
| Transcript | Texto util quando `completed`; `null` quando `failed` |
| Logs | Sem transcript completo, URL, token, media id bruto ou audio |
| Rollback | `audioTranscriptionRuntime=false` bloqueia novo execute |
| Custo | Dentro do limite definido para o piloto |

Precisao minima qualitativa:

- portugues compreensivel;
- nomes proprios podem falhar sem bloquear piloto;
- transcript vazio em audio inaudivel deve ser tratado como falha controlada;
- transcript parcial deve ser marcado no report como aceitavel apenas se a mensagem principal estiver compreensivel.

## Inbox

Na 75J nao ha alteracao de Inbox.

Comportamento desejado futuro:

- transcript aparece primeiro em `/app/audio-transcriptions`;
- Inbox exibe apenas depois de sprint propria;
- se falhar, mostrar "Transcricao indisponivel" futuramente;
- se transcript parcial, indicar baixa confianca/validacao humana.

## Custos

O custo por minuto deve ser confirmado na pagina oficial do provider antes do piloto:

- https://openai.com/api/pricing/

Limites operacionais do piloto:

| Limite | Valor |
| --- | ---: |
| Audios por ciclo | 3 |
| Duracao por audio | 60 segundos |
| Duracao total inicial | ate 3 minutos |
| Execucao simultanea | 1 |
| Limite por tenant/dia | manter abaixo de 30 minutos |
| Ampliaçao | somente apos report do primeiro ciclo |

Nao aprovar ampliacao sem:

- custo observado;
- taxa de sucesso;
- revisao LGPD;
- confirmacao de que logs seguem redigidos.

## Seguranca

Regras:

- nao logar transcript completo;
- nao logar media URL;
- nao logar token WhatsApp ou OpenAI;
- nao salvar audio bruto;
- nao enviar audio fora do provider aprovado;
- nao processar lote sem `--message` no primeiro piloto;
- nao ligar cron/worker;
- nao manter runtime ligado apos teste.

Eventos permitidos:

- `audio.transcription.process_started`;
- `audio.transcription.download_started`;
- `audio.transcription.download_succeeded`;
- `audio.transcription.download_failed`;
- `audio.transcription.provider_started`;
- `audio.transcription.provider_succeeded`;
- `audio.transcription.provider_failed`;
- `audio.transcription.completed`;
- `audio.transcription.failed`.

Todos com metadados redigidos.

## Rollback

Rollback imediato:

```text
audioTranscriptionRuntime=false
```

Rollback ampliado:

- remover/rotacionar `OPENAI_API_KEY` se houver suspeita operacional;
- apagar temporarios em `/tmp/converta/audio-transcriptions`;
- marcar jobs `processing` antigos como `failed` com motivo redigido;
- manter `audioTranscription=true` apenas se quiser visualizar historico;
- se necessario, redigir/apagar transcript do piloto.

## Roadmap

### Sprint 75K - Real Media Pilot

- executar 1 a 3 audios reais controlados;
- revisar transcript;
- medir custo/latencia;
- validar cleanup/logs;
- manter runtime desligado ao final.

### Sprint 75L - Search Integration

- indexar `AudioTranscription.status=completed`;
- busca por conversa/mensagem;
- filtros por canal, periodo, setor e contato;
- sem IA.

### Sprint 75M - AI Integration

- consumo de transcript por IA somente com flag;
- resumo/classificacao;
- evaluation com casos reais aprovados;
- Knowledge Base apenas como sugestao revisada.

## Veredito

O Converta esta pronto para um piloto real pequeno e controlado de transcricao, desde que:

- audio seja autorizado e sem dado sensivel;
- `messageId` seja explicito;
- runtime seja ligado apenas durante a janela;
- custo seja monitorado;
- transcript e logs sejam revisados;
- rollback por flag seja executado ao fim.

Confirmacao: esta sprint nao alterou codigo, banco, runtime, provider, canais, IA, chatbot, Inbox, busca ou integracao externa.
