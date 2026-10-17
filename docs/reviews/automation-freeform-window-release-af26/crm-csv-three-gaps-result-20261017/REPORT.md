# Resultado — blocos1/2 consumidos, diagnóstico preservado

**CONSUMED / DENY_NO_RETRY / NOT WINDOW READY. CSV SUSPENSO.**
Autorização executada: blocos1 e2 de COMMANDS.md em
`63752b5f2b6e1d2e1718d6337b79b7f1e39d6f4f`, sem alteração dos bytes revisados.
Uma materialização LOCAL e uma transferência/coleta SSH como deploy, **sem sudo**.
Bloco3/SELECT não autorizado nem invocado; nenhum observador root.

## Resultado objetivo

| Etapa | Resultado efetivo |
|---|---|
|HEAD/branch, hashes,39 fontes e destinos locais|PASS antes dos efeitos; remoto Git igual ao SHA autorizado|
|Bloco1 materialização|exit0, MATERIALIZED_INACTIVE_NO_REMOTE|
|Disponibilização inativa remota|39 arquivos escritos, hashes/tamanhos iguais ao manifest revisado|
|Gate1 fontes/closure|GATE1_VERIFIED_SNAPSHOT; fonte/closure26 conferida|
|Imagem Node|observada por cadeia/hash; hash igual à referência revisada|
|Imagem Docker|observada por cadeia/hash; não houve execução de docker inspect|
|Observação ELF complementar|DENY ao tentar iniciar `/usr/bin/readelf`|
|Gate2 RPC/configuração canônica|NÃO ALCANÇADO; nenhuma getMonitorData|
|Gate3 rota/container/cliente psql|NÃO ALCANÇADO; nenhum inspect/exec/psql|
|Gate4 SELECT|NÃO AUTORIZADO / NÃO EXECUTADO|
|Exportação/custódia|envelope de DENY preservado, byte-exato e ingerido por private_record; gatePass=false|
|Ownership/certificação|UNKNOWN / nenhuma certificação operacional|

A tentativa de criação de processo com argv literal
`/usr/bin/readelf --wide --program-headers --dynamic /usr/bin/node`
registrou **FileNotFoundError, errno2**, sem código de saída do executável
(exitCode=null). O wrapper encerrou o gate e a execução remota em DENY.
Não houve timeout nem divergência comprovada de Node/Docker nesta tentativa.

ENOENT comprova a falha de lançamento desse argv; isoladamente não distingue
caminho executável ausente de carregador necessário ausente. Não foi coletado
metadata de readelf que permita resolver essa distinção. Não se presume falta de
permissão, falha do daemon, configuração divergente ou erro de rota. Nenhuma busca
por alternativa, instalação, fallback ou reparo foi feita.

O laboratório anterior tinha readelf disponível; seus11 PASS não comprovavam a
presença desse executável na VPS. Esta descoberta é um limite de disponibilidade
do toolchain diagnóstico, não uma autorização para instalar algo ou repetir collect.
A composição/contratos não foram modificados para obter PASS.

## Intervalos registrados

- Launcher de materialização LOCAL:17/10,12:33:58.225982–12:33:58.275416 UTC
  (09:33:58 em Fortaleza), exit0.
- Transporte único:12:34:11.433783–12:34:16.199464 UTC
  (09:34:11–09:34:16 Fortaleza), exit1, sem erro de transporte/timeout registrado.
  O exit1 corresponde ao gate remoto negado; chegou envelope JSON válido.
- Journal remoto:12:34:15.090166–12:34:15.986413 UTC
  (09:34:15 Fortaleza), encerrado em DENY_NO_RETRY.
- Recibo de custódia:12:34:16.249456 UTC (09:34:16 Fortaleza).

São horários dos respectivos registros, sem alegar sincronização perfeita dos
relógios ou snapshot atômico. Não representam duração de parada ou medição HTTP;
nenhuma parada/contenção foi realizada.

## Fatos novos efetivamente observados

A imagem acessível de `/usr/bin/node` tinha97.661.912B, ownerUID0/modo0755 e SHA256
`d01614ef369e36eee9ab8d86fbfa93ddf44931010add45e5262a63e3ddda784e`, igual ao pin
histórico revisado. A imagem de `/usr/bin/docker` tinha44.015.908B, ownerUID0/modo0755
e SHA256 `4fd41ecac3ec0f8a6067f8da79cbce516ed0572d1081e4767db764c84d32257b`.
A resolução de ambos correspondeu ao caminho solicitado. São observações dos
arquivos/cadeias nesses intervalos, não certificação da closure dinâmica ou prova
sobre executáveis efetivamente consumidos por processos atuais.

Não houve observação nova de boot, daemon/trio, configurações live/saved, campos
frontend, conta/database/role, cliente psql, proxy ou backends. Os PIDs, perfis,
certificados e demais fatos anteriores continuam históricos nos seus horários;
nenhum deles foi promovido a identidade atual ou alterado.

## Integridade, proveniência e custódia

[RESULT_SANITIZED.json](RESULT_SANITIZED.json) registra gates, horários e limites.
[SOURCE_INDEX.json](SOURCE_INDEX.json) contém hashes/tamanhos dos inputs públicos e
13 artefatos privados locais, com nomes por alias e sem seus conteúdos. Os inputs
foram comparados aos blobs do commit autorizado. O manifest runtime permaneceu
`3b3990e8fdfa5087064745ce3e2ddd9d7e704d080e21096e6b30d9e44a0439ba`.

| Material | Bytes | SHA256 |
|---|---:|---|
|Bundle enviado, sem segredos|225.209|`9a758e511dec9a96d6e8ebaf9d56d9b8635211582b42d5fc9633e6c89064e264`|
|SSH stdout/envelope privado|26.980|`d4adfdcee54fcc83ad9e60dcf950172d9e12905cbe2602bc87c7d603a2676618`|
|SSH stderr|0|`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`|
|Journal remoto/cópia original off-host|19.788|`a443d6831f82e5874bc733495d821469505b4d598b18456c5ce99b0955563039`|
|Journal local de transporte+ingestão|57.515|`296d7031d1e10ae45970620aa55ca101d01888565c56e550cc9c06a4c84df2d8`|
|Recibo local|359|`888e8eb9720b04e9a7ae260ab5461ccf045ff503c497c26a55658072e4adee46`|

Saída sanitizada do bloco2: `CUSTODY_PRESERVED_DENY_NO_RETRY` seguida de
`LAUNCHER_DENY_PRIVATE_DIAGNOSTIC_PRESERVED_NO_RETRY`.
Recibo canônico: **THREE_GAPS_CUSTODY_PRESERVED_NOT_CERTIFIED**, gatePass=false,
sourceBytes19788, ownershipUNKNOWN e atomicSnapshot=false.

A análise LOCAL confirmou: bytes decodificados do envelope idênticos à cópia
original; comprimento/hash/metadata correspondentes; cada stdout/stderr de comando
com len/hash correto; linhas ingeridas pelo private_record iguais às linhas da
origem, sem alteração. A tentativa readelf preservou stdout vazio e17B de stderr
(classe do erro). Há somente três comandos observacionais registrados: node-chain,
docker-chain e node-elf; não há pm2-rpc, db-route, sql-client-path/version ou SELECT.

Destinos preservados, sem sobrescrita:

- LOCAL tmpfs: `/dev/shm/re7-csv-three-gaps-material-20261017-v1`;
- VPS: `/dev/shm/re7-csv-three-gaps-executable-tools-20261017-v1` e
  `/dev/shm/re7-csv-three-gaps-executable-read-20261017-v1`;
- custódia ThinkPad documentada: `csv-three-gaps-executable-20261017-v1` e
  `csv-three-gaps-launcher-20261017-v1-materialize`/`…-collect`.

Os arquivos privados locais indexados são owner1000, modo0600, nlink1. O inventário
do tmpfs LOCAL foi conferido no namespace da execução; a ausência desse mount no
sandbox de análise não foi tratada como perda/ausência real do material. Nenhuma
repetição remota foi necessária para analisar ou preservar a origem.

Custódia bem-sucedida de um DENY **não** certifica gates restantes, ownership,
configuração ou preparação. Brutos, crons, ambientes, políticas, journals privados
e dados de tenants não fazem parte desta publicação.

## Pendências reais e encerramento

1. A observação ELF prevista não ocorreu: rever primeiro a dependência indisponível
   e sua procedência, somente mediante novo escopo. Não instalar readelf para corrigir
   descoberta nem usar ferramenta alternativa automaticamente.
2. RPC/configuração frontend e rota/container/cliente seguem sem conferência atual
   por este roteiro. Qualquer complementação precisa novo roteiro/destinos e revisão;
   os blocos1/2 e seus destinos estão consumidos e não devem ser repetidos.
3. SELECT permanece decisão separada, sem autorização nesta rodada. Ownership exige
   atribuição canônica própria; conta/role/container não a substituem. Nenhum permit,
   pin, perfil, binding ou observação operacional foi fabricado.
4. Instalação/autoridade/execução CSV continuam suspensas. Não foram reexecutados
   testes, builds, backup/RPO, coletas anteriores, PM2 CLI, observador root ou resets.

Preservados código e provas aceitas, configurações produtivas, NEWauth+NEWDB+
NEWcipher, frontend, ambos os crons, guarda38/out.15 e históricos consumidos: nenhum
comando de alteração desses controles foi executado. Não se reivindica uma nova
conferência health/UI/crons/guarda, que não integrou o trecho alcançado.

Publicação restrita ao resultado sanitizado, índices e três checkpoints. O índice
da entrega anterior continua histórico e íntegro em63752b5f; os novos checkpoints
não são motivo para reescrever seus hashes. Vercel/CI são reconferidos para o push
de revisão; nenhuma configuração é modificada. Segurança externa/aceitação de risco
e revisão21/10 continuam separadas. Esta rodada encerra sem retry ou correção.
