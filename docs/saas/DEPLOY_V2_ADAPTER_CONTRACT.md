# Contrato do adaptador operacional Deploy V2

**Status: CANÔNICO / BUILT-IN ADAPTER LOCALMENTE VALIDADO / NÃO EXECUTADO**

O executor [`scripts/deploy-v2.py`](../../scripts/deploy-v2.py) controla autorização,
ordem, journal, decisão e rollback. O adaptador permanente
[`scripts/deploy-v2-pm2-adapter.py`](../../scripts/deploy-v2-pm2-adapter.py) contém a
implementação fixa das operações PM2, `/proc`, socket, HTTP, supervisão e dump.

Bindings são somente dados. Eles nunca transportam comandos executáveis, `actions`,
`argv`, executáveis por ação ou destinos single-use. O executor autentica por SHA-256
manifesto, executor, adaptador, binding, aceite separado e autorização, lê os mesmos
bytes com `O_NOFOLLOW` e os copia para a raiz exclusiva da execução.

## Binding estático schema v2

O binding contém somente:

- nomes exatos dos processos API, frontend e worker;
- raiz de staging e configurações candidatas autenticadas;
- cwd, entrypoint e SHA-256 da API candidata;
- cwd, launcher, BUILD_ID, controle e hashes do frontend candidato;
- URLs allowlisted e porta de health;
- SHA-256 durável do entrypoint do worker;
- helper de supervisão e hashes esperados do helper e da política;
- modo de aceite `GET_ONLY_TENANT_SCOPED_OR_OWNER_MANUAL` e proibição de POST.

São negadas recursivamente as chaves `actions`, `argv`, `commands`, `destinations` e
`executableSha256`. PID, start ticks, dump, retorno, relatório, snapshot, journal de
execução e timestamps nascem somente no `capture` dentro da raiz exclusiva.

## Operações internas fixas

| Operação | Pós-condição |
| --- | --- |
| `capture` | Captura os três processos, `/proc`, socket, dump e retorno 0600, definições de rollback, controle, BUILD_ID e política; cria destinos exclusivos. |
| `select-api` | Faz substituição direcionada da API pela configuração candidata autenticada. |
| `verify-api` | Executa três amostras de PID/ticks/cwd/entrypoint, SHA, socket 3001 e health local/público. |
| `select-frontend` | Faz substituição direcionada do frontend pela configuração candidata autenticada. |
| `verify-frontend` | Executa três amostras, confere launcher, controle, BUILD_ID e HTTP/assets. |
| `enable-supervision` | Revalida helper/política pelo helper autorizado e ativa a supervisão somente depois do frontend aprovado. |
| `verify-worker` | Exige igualdade integral com a identidade capturada e SHA do entrypoint. |
| `rollback-all` | Retorna frontend e API pelas definições capturadas e confirma suas identidades; não salva dump. |
| `save-once` | Exige aceite separado autenticado, com zero POST/import/retry, e executa `pm2 save` uma vez. |

O adaptador não aceita uma operação desconhecida e não oferece avaliação de shell ou
plano genérico.

## Aceite tenant-scoped separado

O aceite não pertence ao binding. Seu registro privado autenticado declara somente o
modo (`AUTOMATED_GET_ONLY` ou `OWNER_MANUAL_AUTHENTICATED`), decisão e contadores zero
de POST CSV, importação e retry. Token, cookie, UUID e tenant ID não são persistidos no
binding ou no Git. Quando não existe sessão automatizável, o checkpoint humano
autenticado é permitido, mas continua obrigatório antes de `save-once`.

## Captura e retorno

`capture` cria atomicamente, na raiz exclusiva, snapshot, relatório por ação, retorno
do dump modo 0600 e definições de rollback dos três processos. Ele registra somente
campos PM2 allowlisted e nunca enumera ambiente. A política root é validada pelo
helper autorizado; o adaptador não lê seus bytes por privilégio próprio.

Seleção é considerada possivelmente parcial. Qualquer negativa depois da primeira
seleção chama o único `rollback-all`, preserva o worker e proíbe `save-once`. Replay da
raiz, da ação ou do marcador de save é negado.

## Provas

`scripts/ci/verify-deploy-v2-executor.py` usa superfícies falsas distintas e
realistas para PM2, `/proc`, socket, HTTP, helper e dump. Ela cobre sucesso, negativa
em cada fase, replay, worker preservado, rollback integral e save único depois do
aceite. Nenhum PM2, sudo, root ou serviço real é invocado.

O adaptador está pronto para receber um binding privado schema v2 em uma futura
janela autorizada. Esta validação local não autoriza promoção nem preenche o binding
da release atual.
