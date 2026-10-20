# Contrato do adaptador operacional Deploy V2

**Status: CANÔNICO / DUAS FASES LOCALMENTE VALIDADAS / NÃO EXECUTADO**

O executor [`scripts/deploy-v2.py`](../../scripts/deploy-v2.py) separa promoção e
aceite. O adaptador permanente
[`scripts/deploy-v2-pm2-adapter.py`](../../scripts/deploy-v2-pm2-adapter.py) contém
as operações fixas de PM2, `/proc`, socket, HTTP, supervisão, retorno e dump. O
binding schema v2 contém somente dados estáticos; nunca contém comandos.

## Binding e captura

O binding declara nomes dos três processos, staging, configurações candidatas,
identidades de arquivo, health, worker e helper/política. São negadas recursivamente
as chaves `actions`, `argv`, `commands`, `destinations` e
`executableSha256`. PID, ticks, dump, retorno e destinos nascem no `capture`.

`capture` lê uma allowlist fechada de campos PM2 e cria, em custódia privada 0600:

- snapshot dos três processos e retorno byte-exato do dump;
- definições executáveis de retorno para API, frontend e worker;
- `exec_interpreter` convertido explicitamente em `interpreter` e incluído no
  fingerprint integral do retorno;
- ambiente privado necessário à execução, inclusive `RE7_FRONT_CONTROL` e
  `RE7_FRONT_RUN`, sem registrar seus valores em stdout ou no journal sanitizado;
- caminhos de logs e políticas PM2 relevantes, preservados no retorno;
- fingerprints da configuração privada para conferir o retorno sem publicá-la.

## Promoção, checkpoint e resume

`--promote` executa `capture`, seleção e verificação da API, seleção e verificação
do frontend, ativação da supervisão, verificação do worker e `checkpoint`. Ele
termina obrigatoriamente em `AWAITING_ACCEPTANCE`; não recebe aceite e não executa
`pm2 save`.

O checkpoint persiste um `executionId` novo, os hashes autenticados e as identidades
observadas de API e frontend: PID, start ticks, BUILD_ID, controle e nonce. O aceite
schema v2 é criado depois da seleção e precisa vincular exatamente executionId,
estado da execução, hashes, PID/ticks dos dois candidatos e BUILD_ID. Um aceite
anterior à seleção não possui esses dados e é inválido.

`--resume` exige uma nova autorização com prazo, vinculada ao checkpoint e ao hash
do aceite. Antes de salvar, reexecuta integralmente `verify-api`,
`verify-frontend`, `verify-supervision` e `verify-worker`. Qualquer identidade viva
divergente ou aceite stale nega e chama `rollback-all` com as definições privadas
capturadas.

## Identidade frontend ativa

`verify-frontend` lê somente os campos allowlisted `RE7_FRONT_CONTROL` e
`RE7_FRONT_RUN`. Ele exige:

- controle vivo igual ao controle candidato autenticado;
- nonce vivo igual ao nonce do controle;
- launcher, release, entrypoint, SHA e BUILD_ID coerentes;
- journal legítimo com o mesmo nonce;
- marker ausente antes da ativação e válido depois dela.

`enable-supervision` cria o marker somente depois da validação do journal real.
`verify-supervision` e `save-once` exigem marker, journal e identidade vivos.

## Save transacional

`save-once` revalida aceite e estado vivo, persiste `PREPARED`, executa exatamente
um `pm2 save`, lê o novo dump e compara fingerprints integrais dos três processos.
Na captura, após o save e após restauração, o dump precisa ser arquivo regular e o
modo real medido por `fstat` precisa ser `0600`; o relatório registra essa medição.
Somente depois grava a identidade do dump e `COMMITTED`. Se uma falha ocorrer após
o retorno bem-sucedido do PM2 e antes do commit, o adaptador restaura atomicamente o
dump anterior autenticado e registra `ABORTED_DUMP_RESTORED`; então o executor
retorna os runtimes. Depois de `COMMITTED`, uma falha apenas na escrita de evidência
não provoca retorno dos runtimes, evitando dump candidato com runtime anterior.

## Operações fixas e provas

`capture`, `select-api`, `verify-api`, `select-frontend`, `verify-frontend`,
`enable-supervision`, `verify-supervision`, `verify-worker`, `checkpoint`,
`rollback-all` e `save-once` são as únicas operações. Relatórios são separados por
fase (`promote`, `resume` e rollback), impedindo replay e permitindo as
revalidações previstas.

As fixtures em `scripts/ci/verify-deploy-v2-executor.py` usam superfícies falsas
separadas para PM2, `/proc`, socket, HTTP, helper e dump. Elas comprovam aceite
pós-seleção, identidade frontend ativa, retorno com configuração privada completa,
worker preservado, save único e restauração do dump numa falha imediatamente após
o save. Nenhum PM2, sudo, root ou serviço real é invocado.
