# Incidente de contaminação de definição PM2 — 22/10/2026

Status: **RESOLVED / DEPLOYED**. O control plane corrigido e o readiness versionado
foram usados na implantação registrada em
[`TEMPLATE_MEDIA_UX_HARDENING_2026-10-22_DEPLOYED.json`](releases/TEMPLATE_MEDIA_UX_HARDENING_2026-10-22_DEPLOYED.json).

## Escopo e evidência

A auditoria usou somente os arquivos privados preservados da transação negada. Não
houve leitura de valores de ambiente neste registro. A captura que originou as
definições tem SHA-256
`5feb5e166718daf82f84856fbe572032a2acc34329174fc8cc9b0b5d1b1832da`.

O target pretendido era `5c339b2eeda52e21249844fc8b71a351d4311f03`, na
release já validada `immutable-5c339b2e-20261022T125717Z`. A negativa observada foi
`frontend_not_healthy_within_30s`. O artefato de aplicação não foi a causa.

## Causa confirmada

A função privada `definition(row)` compôs candidato e retorno pelo mesmo caminho:

1. leu de `pm2_env` os campos `pm_exec_path`, `pm_cwd`, `exec_interpreter`, `args`,
   `instances`, `exec_mode`, `autorestart`, `watch`, `merge_logs`,
   `pm_out_log_path` e `pm_err_log_path`;
2. leu **todas** as entradas de `/proc/<pid>/environ`;
3. atribuiu esse mapa integral a `apps[0].env`.

`jlist` foi o transporte para os campos de `pm2_env` enumerados acima.
`pm2_env.env` não foi lido diretamente pela função, e nenhum campo do dump foi usado
para compor o descritor; o dump foi apenas copiado como retorno. A contaminação veio
da cópia integral do ambiente do processo, que continha metadados injetados pelo PM2.

O ambiente vivo continha a chave estrutural `args`, com valor do tipo string. Embora
o topo do arquivo também tivesse o `args` pretendido, o PM2 carregou a colisão de
namespace e o Next tentou resolver um caminho terminado em `start,-p,3000`. O retorno
capturado pela mesma função recebeu a mesma contaminação. A recuperação só foi
possível com a definição autenticada do deploy anterior, que não continha `env.args`.

O validador anterior comparava o intent estrutural no topo do JSON. Ele não:

- negava chaves PM2 dentro de `env`;
- aplicava allowlist ao ambiente;
- comparava a definição carregada em `jlist` com o intent;
- comparava CWD, executável, argumentos e socket do processo real;
- iniciava candidato e retorno em daemon isolado antes da janela.

A fixture sanitizada está em
[`pm2-definition-contamination.sanitized.json`](../../scripts/ci/fixtures/pm2-definition-contamination.sanitized.json).
Ela registra somente nomes de campos e tipos, sem valores de configuração.

## Correção

[`pm2-definition-control.py`](../../scripts/pm2-definition-control.py) introduz um
contrato v2 com configuração, proveniência e identidade runtime separadas:

- a request privada declara somente escopo, papel, componente, tipo de fonte e um
  subconjunto da allowlist versionada pelo repositório;
- a configuração PM2 completa vem de outro arquivo físico privado, regular, `0600`
  e aberto com `O_NOFOLLOW`; o SHA-256 esperado dos bytes desse arquivo é fornecido
  pelo registro autenticado externo;
- `requestSha256`, `sourceArtifactSha256` e `configurationSha256` têm significados
  distintos. O antigo `identitySha256` era somente digest da configuração
  autodeclarada e não autenticava a fonte;
- `validate-pair` exige papéis, arquivos-fonte, hashes de fonte, evidências de
  proveniência, requests e identidades de release distintos, além de compatibilidade
  operacional. As configurações PM2 podem ser byte a byte iguais quando ambas usam
  `/opt/re7online/current/<componente>`; nesse caso, a identidade imutável da release
  (`releaseId`, manifesto, árvore e BUILD_ID/hash do entrypoint) distingue candidato
  e retorno;
- o ambiente privado usa somente um subconjunto da allowlist específica por
  componente mantida em `scripts/pm2-definition-env-allowlist.v1.json`;
- normalização Unicode NFKC e comparação sem distinção de caixa;
- negativa de estrutura, internos `pm_*`, `PM2_HOME`, `NODE_APP_INSTANCE`, objetos
  aninhados, campos PM2 adicionais, symlink, modo diferente de `0600` e alteração
  do arquivo durante a leitura;
- candidato com fonte `canonical-private-config` e rollback com fonte
  `authenticated-proven-definition`, ambos autenticados pelos bytes reais.

O executor grava somente destino inexistente, faz `fsync` e publica o arquivo por
link atômico. O stdout contém nomes das chaves preservadas e hashes, nunca seus
valores.

## Prova isolada

Com Node `v20.20.0`, npm `10.8.2` e PM2 `6.0.14`, a prova real em `PM2_HOME`
temporário confirmou:

- fixture contaminada negada antes da criação do daemon;
- candidato e retorno separados em `fork_mode`, uma instância, usando a mesma
  definição PM2 lexical sob `current/frontend` e releases físicas distintas;
- `args` estrutural preservado no arquivo, em `jlist`, no processo de fixture e no
  dump isolado;
- a identidade lexical carregada pelo PM2 (`pm_cwd` e `pm_exec_path`) permaneceu no
  caminho estável, enquanto `realpath(__filename)` e `/proc/<pid>/cwd` apontaram
  estritamente para a release física esperada; `/proc/<pid>/exe` foi validado
  separadamente como o interpretador Node;
- symlink, destino textual, destino resolvido e inode permaneceram estáveis nas três
  amostras; BUILD_ID e SHA-256 do entrypoint corresponderam ao manifesto da release;
- socket `DIRECT`, três amostras HTTP e PID/start ticks corretos;
- `save`, encerramento do daemon e `resurrect` isolados preservaram a semântica;
- retorno substituiu o candidato e recuperou seu socket/health;
- definição canônica de logs e caminho runtime foram validados separadamente. No
  PM2 `6.0.14`, `merge_logs=false` substitui o sufixo final `.log` ou
  `-<número>.log` por `-<pm_id>.log`; caminho sem `.log` e `/dev/null` ficam
  inalterados. Com `merge_logs=true`, o caminho efetivo é literalmente o configurado;
- daemon e portas temporários foram encerrados;
- PM2 produtivo não foi acessado.

Os testes unitários cobrem origem compartilhada, troca de papel, hash da request
usado como falso hash da fonte, symlink, modo e corrida de leitura; colisões em
campos estruturais; e caminhos de log com diretório, basename, extensão, `pm_id` ou
sufixo divergente.

Caracterização isolada da transformação de logs, sem conteúdo de log:

| configuração-base | `merge_logs` | `pm_id` | caminho efetivo |
|---|---:|---:|---|
| `alpha.log` | `false` | `0` | `alpha-0.log` |
| `beta.log` | `false` | `1` | `beta-1.log` |
| `gamma` | `false` | `2` | `gamma` |
| `delta.log` | `true` | `3` | `delta.log` |
| `/dev/null` | `false` ou `true` | `5`/`6` | `/dev/null` |
| `frontend-2026.log` | `false` | `0` | `frontend-0.log` |
| `frontend-0.log` | `false` | `1` | `frontend-1.log` |
| `frontend-2026.log` | `true` | `2` | `frontend-2026.log` |
| `frontend-0.log` | `true` | `3` | `frontend-0.log` |

## Disposição

A release `immutable-5c339b2e-20261022T125717Z` continua reutilizável sem rebuild:
o pacote já havia passado suas validações e a falha ocorreu somente na composição da
definição PM2. Qualquer nova janela precisa obter os hashes autenticados das duas
fontes antes da composição, executar `build`, `validate` e `validate-pair`, e concluir
a prova isolada antes do primeiro efeito. Este relatório não autoriza retry.

## Reconciliação sanitizada da superfície de ambiente

A janela posterior foi encerrada antes do primeiro efeito porque a allowlist v1 não
representava doze nomes observados nas fontes privadas. Somente nomes, tipos e hashes
dos artefatos foram usados; nenhum valor foi copiado ou versionado. A matriz
auditável está em
[`pm2-production-env-surface.sanitized.json`](../../scripts/ci/fixtures/pm2-production-env-surface.sanitized.json).

| Componente | Chave | Consumidor comprovado | Classificação | Escopo |
|---|---|---|---|---|
| API | `ADMIN_TOKEN` | `src/config/env.ts` | aplicação | `common` |
| API | `CAMPAIGN_OPERATIONS_FILE` | `src/campaigns/campaignOperations.ts` | aplicação | `common` |
| API | `CAMPAIGN_OPERATIONS_HOST_ID` | `src/campaigns/campaignOperations.ts` | aplicação | `common` |
| API | `CAMPAIGN_OPERATIONS_TOPOLOGY` | `src/campaigns/campaignOperations.ts` | aplicação | `common` |
| API | `CHANNEL_ACCOUNT_SECRET_KEY` | `src/channels/channelAccountSecretCrypto.ts` | aplicação | `common` |
| API | `META_INSTAGRAM_BUSINESS_LOGIN_APP_SECRET` | `src/meta/instagramBusinessLogin.service.ts` | aplicação | `common` |
| API | `META_INSTAGRAM_BUSINESS_LOGIN_STATE_SECRET` | `src/meta/instagramBusinessLogin.service.ts` | aplicação | `common` |
| API | `MFA_SECRET_ENCRYPTION_KEY` | `src/auth/mfaService.ts` | aplicação | `common` |
| API | `WEBHOOK_SECRET_ENCRYPTION_KEY` | `src/publicApi/publicApiWebhookService.ts` | aplicação | `common` |
| Frontend | `NEXT_TELEMETRY_DISABLED` | runtime Next.js | framework | `common` |
| Frontend | `RE7_FRONT_CONTROL` | checker/launcher histórico | controle operacional legado | `rollbackCompatibility` |
| Frontend | `RE7_FRONT_RUN` | checker/launcher histórico | controle operacional legado | `rollbackCompatibility` |

Não existe consumidor de `RE7_FRONT_CONTROL` ou `RE7_FRONT_RUN` na aplicação Next.
Eles podem reproduzir byte a byte uma definição anterior autenticada, mas são
negados em candidato. A allowlist é o conjunto máximo seguro de **nomes**; cada
request escolhe um subconjunto. `rollbackCompatibility` não autoriza uso futuro nem
promoção do campo para `common`.

O schema v2 da allowlist separa `common`, `candidate` e
`rollbackCompatibility` por componente. O rollback só pode selecionar uma chave de
compatibilidade quando ela também existe na fonte física autenticada; a igualdade
serial entre fonte e definição continua obrigatória. Assim, rollback fiel não é
obtido por filtragem. Campos estruturais, internos PM2 e colisões Unicode continuam
negados para todos os papéis.

Antes de qualquer alteração futura na allowlist, o inventário sanitizado de nomes
das fontes candidatas e de retorno é gate obrigatório. Divergência de nome ou papel
interrompe a preparação antes do PM2.

### Reconciliação da superfície funcional da API

O bootstrap privado posterior encontrou 66 nomes adicionais presentes na definição
produtiva e consumidos pelo código da API. A análise estática individual está em
[`pm2-api-runtime-env-surface.sanitized.json`](../../scripts/ci/fixtures/pm2-api-runtime-env-surface.sanitized.json).
Ela registra consumidor, finalidade, aplicabilidade, obrigatoriedade condicional,
ciclo de vida e papel sem incluir valores ou seus digests.

Todos os 66 nomes possuem consumidor de produção comprovado. Eles foram admitidos
em `api.common`, inclusive controles fail-closed, compatibilidade de dados históricos
e flags de transição ainda lidas pela release. Nenhum nome desse conjunto é hook de
teste, campo estrutural PM2 ou variável desconhecida. Essa decisão não permite copiar
o ambiente completo: a request continua selecionando um subconjunto fechado, a fonte
privada continua byte-autenticada e nomes não listados continuam negados. Controles
exclusivos do frontend histórico permanecem em `rollbackCompatibility` e continuam
proibidos no candidato.
