# Sprint 75H - Audio Transcription Controlled Runtime Design

Data: 2026-06-23

Status: design concluido na Sprint 75H; runtime controlado implementado na Sprint 75I.

Escopo: projetar o primeiro runtime controlado de transcricao de audio do Converta. Esta sprint nao cria codigo, migration, provider real, download de midia, transcript real, job automatico, cron, worker, alteracao de Inbox, alteracao de canais, IA ou busca.

## Resumo Executivo

A Sprint 75G provou que o Converta ja consegue localizar audio inbound WhatsApp elegivel e registrar shadow records sem baixar midia, chamar provider STT ou gerar transcript. A Sprint 75H define como sair do shadow para um runtime manual/piloto com controle de custo, LGPD, retencao e rollback.

Decisao recomendada para MVP:

- provider inicial: **OpenAI Speech-to-Text via API**, em modo manual/piloto;
- canal inicial: **WhatsApp inbound audio**;
- execucao inicial: **CLI manual com dry-run default**;
- sem cron, sem worker permanente e sem processamento automatico;
- download temporario com remocao obrigatoria;
- `audioTranscriptionRuntime=false` por padrao e rollback imediato por flag.

Justificativa: o Converta ja usa IA como parte do produto, o fluxo piloto precisa de baixa friccao operacional, e a primeira fase deve validar qualidade PT-BR, custo real por tenant e governanca antes de assumir infraestrutura propria ou cloud STT corporativa.

## Fontes E Premissas De Custo

Custos de STT mudam com frequencia. Antes da Sprint 75I, revisar os precos oficiais novamente e registrar a data da revisao no pre-release.

Fontes consultadas em 2026-06-23:

- OpenAI API pricing: https://openai.com/api/pricing/
- Google Cloud Speech-to-Text pricing: https://cloud.google.com/speech-to-text/pricing
- Amazon Transcribe pricing: https://aws.amazon.com/transcribe/pricing/
- Azure Speech pricing: https://azure.microsoft.com/en-us/pricing/details/speech/

## Comparativo De Providers

| Provider | Custo/controle | Qualidade PT-BR esperada | Latencia | Privacidade/LGPD | Operacao | Veredito |
| --- | --- | --- | --- | --- | --- | --- |
| OpenAI Speech-to-Text | Simples para piloto; precificacao por uso/modelo, revisar no pre-release | Boa para portugues e audios curtos; validar com amostras reais | Baixa/media em arquivo curto | Exige DPA/politica de subprocessador e opt-in do tenant | Menor esforco inicial | **MVP recomendado** |
| Whisper self-hosted | Custo previsivel por infra, mas exige GPU/CPU e operacao | Boa se modelo adequado; varia por hardware | Variavel; pode ser alta em CPU | Maior controle de dados se hospedado no Brasil/infra propria | Alto esforco operacional | Futuro para escala/custo/contratos sensiveis |
| Azure Speech | Precificacao por hora/segundo e opcoes enterprise | Boa; recursos corporativos fortes | Boa | Bom encaixe enterprise/governo com contrato Azure | Medio; exige conta/keys/regiao | Alternativa enterprise |
| Google Speech-to-Text | Precificacao por minuto e batch dinamico barato | Boa; modelos variados | Boa; batch pode ser mais lento | Exige avaliacao de regiao/DPA | Medio | Alternativa para volume/batch |
| AWS Transcribe | Precificacao por segundo, minimo por request e tiers; bom ecossistema | Boa; recursos de PII/redaction | Boa | Bom encaixe AWS/governo; atencao a regiao | Medio | Alternativa para ambientes AWS |

## Decisao Do MVP

Usar OpenAI Speech-to-Text apenas no runtime controlado 75I, com estas condicoes:

- flag `audioTranscription=true` no tenant;
- flag `audioTranscriptionRuntime=true` somente no tenant piloto;
- CLI com `--dry-run` default;
- `--execute` explicito para chamar provider;
- limite baixo por execucao;
- custo maximo por tenant/dia;
- sem retry automatico na primeira versao;
- transcript exibido apenas na tela de transcricoes ou em detalhe controlado, nao ainda na busca.

Nao aprovar para MVP:

- transcrever todos os audios automaticamente;
- usar transcript em IA sem sprint separada;
- indexar transcript em busca sem sprint separada;
- manter arquivo de audio temporario apos processamento;
- logar transcript completo.

## Download Controlado De Midia

Fluxo alvo:

```text
InboundMessage type=AUDIO
  -> validar tenant/feature/elegibilidade
  -> obter media id seguro do rawPayload
  -> baixar audio para diretorio temporario
  -> validar tamanho, mime e duracao
  -> enviar ao provider STT
  -> persistir transcript/metadados
  -> apagar arquivo temporario
```

### Diretorio Temporario

Recomendado:

```text
/tmp/converta/audio-transcriptions/{clientId}/{jobId}/
```

Regras:

- criar diretorio por job;
- permissao restrita ao usuario do processo;
- nome de arquivo gerado internamente, sem usar nome vindo de provider;
- limpar no `finally`;
- job que falhar antes da limpeza deve ser removido por comando de manutencao.

### TTL E Limpeza

| Item | Valor MVP |
| --- | ---: |
| TTL arquivo temporario | 15 minutos |
| Cleanup no fim do job | obrigatorio |
| Cleanup defensivo | comando manual futuro |
| Retencao de audio bruto duplicado | proibida no MVP |

### Limites MVP

| Limite | Valor inicial |
| --- | ---: |
| Tamanho maximo | 15 MB |
| Duracao maxima | 5 minutos |
| Concurrency por processo | 1 |
| Limite por execucao CLI | 5 mensagens |
| Limite por tenant/dia | 30 minutos de audio no piloto |
| Timeout download | 20 segundos |
| Timeout provider | 90 segundos |

Valores devem ficar centralizados em constantes/config runtime, nao espalhados em codigo.

## Runtime Controlado

Comando alvo da Sprint 75I:

```bash
npm run audio-transcriptions:process -- --tenant demo-prefeitura --dry-run --json
npm run audio-transcriptions:process -- --tenant demo-prefeitura --message <messageId> --execute --json
```

Parametros:

| Parametro | Obrigatorio | Comportamento |
| --- | --- | --- |
| `--tenant` | sim | Resolve `Client.clientKey` e aplica isolamento |
| `--message` | nao | Processa uma mensagem especifica |
| `--limit` | nao | Maximo baixo, default 1 no execute e 10 no dry-run |
| `--dry-run` | default | Calcula elegibilidade sem download/provider/persistencia final |
| `--execute` | sim para processamento real | Exige flag runtime e provider configurado |
| `--json` | nao | Saida redigida para smoke/pre-release |

### Guardrails

`--execute` deve bloquear quando:

- `audioTranscription=false`;
- `audioTranscriptionRuntime=false`;
- provider nao configurado;
- mensagem nao pertence ao tenant;
- mensagem nao e `AUDIO`;
- canal diferente de `whatsapp`;
- transcricao ja `completed`;
- audio sem media id;
- tamanho/duracao/mime fora do limite;
- custo diario do tenant excedido.

## Pipeline De Estados

Estados de `AudioTranscription.status`:

| Status | Uso |
| --- | --- |
| `shadow` | Registro criado pela 75G, sem processamento |
| `pending` | Selecionado para processamento manual |
| `processing` | Download/provider em andamento |
| `completed` | Transcript persistido |
| `failed` | Erro redigido, pode permitir reprocessamento |
| `skipped` | Nao elegivel ou bloqueado por regra |

Estados de `AudioTranscriptionJob.status`:

| Status | Uso |
| --- | --- |
| `shadow` | Reservado para execucao sem provider |
| `skipped` | Usado no shadow atual |
| `pending` | Job criado para processamento manual |
| `processing` | Job com lock local/execucao |
| `completed` | Provider retornou transcript e persistencia OK |
| `failed` | Falha controlada |
| `cancelled` | Cancelamento manual/futuro |

Campos futuros a acrescentar quando necessario:

- `durationSeconds`;
- `audioSizeBytes`;
- `providerRequestId`;
- `startedAt`;
- `completedAt`;
- `failedAt`;
- `failureReason`;
- `costUnits` ou `billableSeconds`.

Na 75I, se nao houver migration, esses campos podem começar em `metadata` com plano explicito de normalizacao posterior.

## Persistencia Do Transcript

Persistir:

- `transcript`;
- `language`;
- `confidence`, se provider retornar valor util;
- `provider`;
- `providerRequestId`, se seguro;
- metadados tecnicos redigidos em `metadata`;
- status e erro redigido.

Nao persistir:

- audio bruto;
- URL temporaria;
- token de canal;
- resposta integral do provider;
- transcript em logs;
- IP/user-agent desnecessarios.

## Inbox E Timeline

75I nao precisa alterar a timeline se o objetivo for apenas provar runtime controlado. Se houver UI minima, limitar a `/app/audio-transcriptions`.

Roadmap de exibicao:

| Estado | Exibicao futura no Inbox |
| --- | --- |
| `pending` | "Transcricao pendente" |
| `processing` | "Transcrevendo audio" |
| `completed` | Bloco expandivel com transcript |
| `failed` | "Transcricao indisponivel" com motivo seguro |
| `skipped` | Ocultar por padrao ou mostrar apenas em diagnostico |

O transcript no Inbox deve respeitar as mesmas permissoes da conversa/departamento.

## Busca

Busca fica fora da 75I.

Design futuro:

- criar ou reaproveitar indice `ConversationSearchIndex`;
- indexar apenas `AudioTranscription.status=completed`;
- filtrar por `clientId`, canal, departamento, periodo e conversa;
- resultado aponta para mensagem de audio, nao para texto solto;
- respeitar retencao/anonymizacao.

## IA E Knowledge Base

IA fica fora da 75I.

Uso futuro permitido somente com flag separada:

- resumo de atendimento;
- classificacao de assunto;
- apoio ao CRM;
- sugestao de FAQ com revisao humana.

Transcript nao vira artigo de Knowledge Base automaticamente.

## Seguranca E LGPD

Principios obrigatorios:

- opt-in por tenant;
- finalidade documentada: atendimento, auditoria e busca;
- provider externo documentado em contrato/DPA;
- transcript tratado como dado pessoal;
- audio temporario removido;
- logs sem transcript completo;
- eventos somente com metadados redigidos;
- retencao/anonymizacao deve apagar ou redigir transcript;
- acesso ao transcript vinculado ao acesso a conversa;
- operador deve saber quando transcript foi gerado por IA/STT e pode conter erro.

Eventos:

- `audio.transcription.process_dry_run`
- `audio.transcription.process_started`
- `audio.transcription.download_started`
- `audio.transcription.download_succeeded`
- `audio.transcription.download_failed`
- `audio.transcription.provider_started`
- `audio.transcription.provider_succeeded`
- `audio.transcription.provider_failed`
- `audio.transcription.completed`
- `audio.transcription.failed`
- `audio.transcription.skipped`

Eventos nao devem conter transcript, URL, token, media id bruto ou payload provider.

## Feature Flags E Config

Flags:

| Flag | Default | Uso |
| --- | ---: | --- |
| `audioTranscription` | false | habilita modulo e elegibilidade |
| `audioTranscriptionRuntime` | false | permite processamento real |
| `audioTranscriptionProvider` | false ou ausente | seleciona provider quando houver config segura |

Config operacional futura em `TenantOperationalConfig`:

```json
{
  "audioTranscription": {
    "enabled": false,
    "runtimeEnabled": false,
    "provider": "openai",
    "language": "pt-BR",
    "channels": ["whatsapp"],
    "maxAudioBytes": 15728640,
    "maxDurationSeconds": 300,
    "dailyAudioSecondsLimit": 1800,
    "allowInboxDisplay": false,
    "allowSearchIndexing": false,
    "allowAiConsumption": false
  }
}
```

Na 75I, manter config minima por env/flag se a migracao para `TenantOperationalConfig` aumentar escopo.

## Variaveis De Ambiente Futuras

Nomes sugeridos:

```text
AUDIO_TRANSCRIPTION_PROVIDER=openai
OPENAI_API_KEY=<secret>
AUDIO_TRANSCRIPTION_TMP_DIR=/tmp/converta/audio-transcriptions
AUDIO_TRANSCRIPTION_MAX_BYTES=15728640
AUDIO_TRANSCRIPTION_MAX_SECONDS=300
AUDIO_TRANSCRIPTION_DAILY_SECONDS_LIMIT=1800
```

Nao logar valores.

## Rollback

Rollback funcional:

```text
audioTranscriptionRuntime=false
```

Efeitos:

- CLI `--execute` bloqueia;
- shadow permanece disponivel;
- registros existentes ficam historicos;
- nenhum transcript novo e gerado;
- nao precisa rollback de banco.

Rollback operacional:

- remover/rotacionar provider key;
- apagar arquivos temporarios remanescentes;
- marcar jobs `processing` antigos como `failed` com motivo redigido;
- manter `audioTranscription=true` se quiser preservar leitura do historico.

## Smoke Futuro Da 75I

Pre-release recomendado:

```bash
npm run audio-transcriptions:process -- --tenant demo-prefeitura --json
npm run audio-transcriptions:process -- --tenant demo-prefeitura --message <messageId> --execute --json
```

Validar:

- dry-run nao baixa audio;
- execute bloqueia com `audioTranscriptionRuntime=false`;
- execute baixa audio temporario com runtime ligado;
- arquivo temporario removido;
- provider chamado uma vez;
- transcript persistido;
- logs sem transcript bruto;
- falha provider marca `failed`;
- reprocessamento nao duplica `completed`;
- rollback por flag funciona.

## Roadmap

### Sprint 75I - Controlled Runtime MVP

- provider OpenAI configurado por env;
- CLI `audio-transcriptions:process`;
- WhatsApp inbound audio somente;
- download temporario;
- limites de tamanho/duracao/custo;
- transcript persistido;
- sem cron/worker;
- sem busca;
- sem IA.

### Sprint 75J - Search Integration

- indice de busca;
- transcript pesquisavel;
- filtros por canal/departamento/periodo;
- resultado apontando para mensagem.

### Sprint 75K - AI Integration

- consumo de transcript por IA apenas com flag;
- resumo/classificacao;
- evaluation com casos de audio;
- Knowledge Base apenas como sugestao revisada.

## Riscos

| Risco | Severidade | Mitigacao |
| --- | --- | --- |
| Custo inesperado | Alto | dry-run default, limite por tenant/dia, `--execute`, relatorio de segundos |
| Vazamento de audio/transcript | Alto | temp file com TTL, logs redigidos, sem audio persistido |
| LGPD/provider externo | Alto | opt-in, DPA, finalidade, retencao |
| Latencia no atendimento | Medio | runtime manual, nao inline no webhook |
| Transcript incorreto | Medio | UI com aviso, audio original preservado, confidence opcional |
| Duplicidade de processamento | Medio | idempotencia por `clientId + messageId` e status |
| Falha de limpeza temporaria | Medio | cleanup no finally e comando de manutencao |

## Veredito

A Sprint 75I pode ser aberta somente como runtime controlado/manual, com OpenAI Speech-to-Text como provider inicial, `--dry-run` default, `--execute` explicito, limites baixos, WhatsApp inbound audio apenas e rollback por `audioTranscriptionRuntime=false`.

## Status Pos-Sprint 75I

A Sprint 75I implementou o runtime controlado/manual definido neste documento:

- CLI `npm run audio-transcriptions:process`;
- `--dry-run` default;
- `--execute` explicito;
- tenant obrigatorio;
- WhatsApp inbound audio apenas;
- OpenAI Speech-to-Text como provider MVP;
- `OPENAI_API_KEY` obrigatoria somente para `--execute`;
- download temporario via helper WhatsApp existente;
- cleanup obrigatorio em sucesso e erro;
- persistencia de transcript em `AudioTranscription`;
- persistencia de job em `AudioTranscriptionJob`;
- sem cron;
- sem worker permanente;
- sem processamento automatico;
- sem busca;
- sem IA;
- sem alteracao de canais.

Confirmacao: a Sprint 75H nao alterou codigo, banco, migration, runtime, provider, canais, IA, chatbot, Inbox, busca ou integracao externa. A implementacao operacional ocorreu somente na Sprint 75I, de forma manual/controlada.
