# Sprint 78N - Load Test MVP Results

Data: 2026-06-25

Escopo: primeiro teste de carga controlado do Converta, com scripts k6, sem alteracao de codigo de negocio, sem banco, sem HA, sem swap, sem tuning e sem carga pesada em producao.

## Resumo Executivo

A Sprint 78N criou a primeira suite k6 do Converta e executou um teste real minimo no cenario `health`, respeitando o limite maximo de 50 usuarios virtuais.

Atualizacao 78N.3: a primeira execucao externa completa com fixtures autenticadas foi iniciada em 2026-06-26 usando o tenant tecnico `loadtest-prefeitura`, pelo caminho publico `https://converta.re7online.com/agent-api`. A execucao foi abortada ainda em `vu5`, conforme regra da sprint, porque o cenario `login` gerou 91,72% de erro HTTP e acionou o alerta interno `runtime:error_rate`. `health` e `public-api` passaram em `vu5`; `search`, `inbox-read`, `inbox-detail`, `vu10`, `vu20` e `vu50` nao foram considerados conclusivos porque a regra de parada foi acionada.

Atualizacao 78N.3 re-run: apos a 78N.4 remover login do loop principal, a carga externa foi repetida com `APP_TOKENS_JSON`. `health vu5` e `public-api vu5` passaram com 0% erro. `search vu5` falhou com 41,37% de erro HTTP e acionou novamente `runtime:error_rate`; a verificacao posterior mostrou resposta `401 session_replaced` para token de app, enquanto os demais tokens respondiam 200. A parada ocorreu corretamente antes de `inbox-read`, `inbox-detail`, `vu10`, `vu20` e `vu50`. A leitura atual e que o proximo bloqueador e estrategia de sessoes/tokens das fixtures autenticadas, nao CPU, RAM, PM2, DB ou TLS.

Resultado principal:

- scripts k6 criados para `health`, `login`, `public-api`, `search` e `inbox-read`;
- execucao externa local foi bloqueada pelo sandbox de rede do ambiente do agente;
- execucao controlada na VPS foi feita com k6 temporario em `/tmp`, contra `http://127.0.0.1:3001/health`;
- nenhum erro HTTP no cenario `health`;
- PM2 permaneceu online;
- memoria permaneceu estavel;
- primeiro sinal de gargalo observado: variabilidade de latencia/DB health em perfil intermediario, com p95 de 581 ms em 20 VUs.
- na primeira 78N.3, o primeiro bloqueador real do teste autenticado foi protecao/fluxo de login sob repeticao, nao CPU, RAM, DB ou Nginx;
- na 78N.3 re-run, com login fora do loop, o primeiro bloqueador passou a ser `session_replaced` em token de app usado no cenario `search`.

Importante: este resultado **nao e benchmark contratual**. Ele mede health local no host alvo, com gerador de carga rodando na mesma VPS. Serve como smoke de carga e validacao de ferramenta, nao como prova de capacidade para 400 usuarios simultaneos.

Atualizacao 78N.3: o teste externo autenticado tambem **ainda nao e benchmark contratual**, porque foi interrompido por criterio de seguranca antes de completar os perfis 5/10/20 VUs. Ele e valido como achado operacional: o fluxo de login/rate limit precisa ser tratado no plano de carga antes de medir capacidade geral.

Atualizacao 78N.3 re-run: o teste continua **nao sendo benchmark contratual**, porque parou em `search vu5` por erro de sessao/token. Ele ja valida que health e Public API passam em baixa carga externa, mas ainda nao mede Inbox ou Search sob perfis 10/20 VUs.

## Confirmacao De Escopo

Esta sprint nao:

- alterou runtime de canais;
- alterou login;
- alterou banco;
- criou migration;
- criou HA;
- configurou swap;
- fez tuning;
- executou campanhas;
- executou upload;
- executou envio real;
- executou carga acima de 50 VUs;
- instalou k6 no sistema da VPS.

O k6 foi baixado temporariamente em `/tmp` para execucao controlada e pode ser removido sem impacto.

## Auditoria Previa

### Reaproveitado

| Area | Reaproveitamento |
| --- | --- |
| Runtime Metrics | `request_count`, `request_duration`, `route_duration`, `module_duration`, `db_duration`, `dependency_duration`, memoria, CPU e uptime. |
| Dashboard | `/admin/ops` e `/admin/ops/metrics` para snapshot antes/depois. |
| AlertManager | `/admin/ops/alerts` para contagem de alertas antes/depois. |
| Health | `/health` como primeiro alvo seguro. |
| PM2 | `pm2 jlist` para status, memoria e CPU dos processos. |
| VPS | dados de CPU/RAM/swap/disco ja auditados na 78I e confirmados antes da carga. |

### O Que Foi Medido

- latencia k6 do endpoint health;
- p90/p95;
- throughput;
- error rate;
- PM2 antes/depois;
- memoria do sistema antes/depois;
- alertas internos antes/depois;
- health final.

### O Que Nao Foi Alterado

- negocio;
- schema;
- indices;
- flags de tenant;
- PM2;
- Nginx;
- Postgres;
- cron;
- swap;
- parametros Node/Postgres.

## Scripts Criados

Diretorio:

```text
load-tests/k6/
```

Arquivos:

| Script | Objetivo | Status |
| --- | --- | --- |
| `health.js` | carga simples em `/health` | executado. |
| `login.js` | login com `LOGIN_EMAIL`/`LOGIN_PASSWORD` | criado, nao executado por falta de credenciais de teste explicitas. |
| `public-api.js` | Public API health/contacts/conversations com `PUBLIC_API_KEY` | criado, nao executado por falta de API key de teste explicita. |
| `search.js` | `/app/search?q=...` com `APP_JWT` | criado, nao executado por falta de JWT de teste explicito. |
| `inbox-read.js` | `/app/conversations` e detalhe/timeline opcional | criado, nao executado por falta de JWT/conversationId de teste explicitos. |
| `run-load-profile.sh` | runner seguro com perfis `vu5`, `vu10`, `vu20`, `vu50` | validado. |

Perfis permitidos:

```text
vu5
vu10
vu20
vu50
```

## Tentativa Externa Local

O k6 foi baixado em `/tmp` no ambiente local do agente:

```text
k6 v2.0.0
```

Tentativa:

```text
PROFILE=vu5
DURATION=1m
API_BASE_URL=https://converta.re7online.com/agent-api
```

Resultado:

```text
falhou antes de atingir o Converta
motivo: sandbox local bloqueou DNS UDP para o processo k6
erro: lookup converta.re7online.com on 127.0.0.53:53: socket: operation not permitted
```

Conclusao: a falha nao indica problema do Converta. Indica que este ambiente local nao e adequado como gerador de carga externo.

## Execucao Controlada Na VPS

Para obter uma primeira medicao real, foi executado k6 temporario em `/tmp` na VPS, apontando para o backend local:

```text
API_BASE_URL=http://127.0.0.1:3001
cenario=health
duracao=30s por perfil
VUs=5, 10, 20, 50
```

Limites:

- nao passa por DNS/Cloudflare;
- nao mede Nginx/TLS;
- gerador e alvo competem pela mesma CPU/RAM;
- mede principalmente backend + health DB + Postgres local.

## Resultados k6

| Perfil | Requests | Erro | Avg | P90 | P95 | Max | Status |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `vu5` | 150 | 0% | 30.90 ms | 140.20 ms | 154.89 ms | 304.11 ms | OK |
| `vu10` | 300 | 0% | 24.23 ms | 17.27 ms | 156.00 ms | 465.60 ms | OK |
| `vu20` | 560 | 0% | 97.45 ms | 310.94 ms | 581.63 ms | 673.52 ms | OK com ajuste |
| `vu50` | 1464 | 0% | 39.13 ms | 97.12 ms | 253.88 ms | 359.84 ms | OK |

Observacao:

- O perfil `vu20` cruzou o threshold conservador de `p95<500ms`.
- Como `vu50` voltou a p95 menor, o resultado sugere variabilidade de ambiente/DB/processo e nao saturacao linear clara.
- Nao houve erro HTTP.

## PM2 E Memoria

Antes:

```text
re7-admin-front     online  ~64.8 MB
re7-whatsapp-agent  online  ~158.9 MB
memoria livre       562 MB
memoria disponivel  1053 MB
swap                0
```

Depois:

```text
re7-admin-front     online  ~65.0 MB
re7-whatsapp-agent  online  ~160.1 MB
memoria livre       564 MB
memoria disponivel  1064 MB
swap                0
```

Conclusao: nao houve crescimento relevante de memoria no smoke `health`.

## Alertas

Antes:

```text
active: 1
resolved: 0
acknowledged: 0
total: 1
```

Depois:

```text
active: 1
resolved: 0
acknowledged: 0
total: 1
```

O alerta ativo ja existia antes do teste:

```text
source: runtime
message: HTTP error count is above the internal threshold
errorCount: 16
threshold: 10
```

Conclusao: o teste `health` nao criou novo alerta persistente. O alerta preexistente deve ser tratado em hardening de alertas/limpeza de estado, nao como falha do load test.

## Gargalos Observados

| Area | Leitura |
| --- | --- |
| CPU | PM2 mostrou CPU variavel no backend, mas sem queda ou restart. Como k6 rodou na mesma VPS, CPU do gerador contamina a leitura. |
| RAM | Estavel. Swap continua ausente. |
| DB | Health depende de `select 1`; p95 de 581 ms em `vu20` sugere variabilidade de DB/event loop, mas sem erro. |
| Search | Nao medido nesta sprint por falta de JWT/tenant de teste explicito. |
| Public API | Script criado, nao medido por falta de API key de teste explicita. |
| Inbox | Script criado, nao medido por falta de JWT/conversa de teste explicitos. |
| Nginx | Nao medido, porque o teste real usou `127.0.0.1:3001`. |

## Respostas Aos Criterios

### VPS suporta?

Para `health` local ate 50 VUs por 30s: **sim**, com 0% erro.

Para Inbox/Public API/Search e 400 usuarios simultaneos: **ainda nao comprovado**.

### Primeiro gargalo?

Ainda nao ha gargalo conclusivo. O primeiro sinal e variabilidade de latencia no health/DB em `vu20`.

### Swap resolveria?

Nao e possivel afirmar pelo teste `health`, porque RAM ficou estavel. Swap continua recomendado para reduzir risco de OOM em build/picos, nao como solucao de latencia.

### PM2?

PM2 permaneceu online. Nao houve restart. Single instance continua SPOF, mas nao foi gargalo neste smoke.

### Postgres?

Possivel fonte de variabilidade porque health mede DB. Precisa proxima rodada com metricas DB mais ricas para confirmar.

### Search?

Nao medido. Precisa JWT/tenant piloto e `SearchIndex` populado.

## Limitacoes

1. O gerador de carga rodou na mesma VPS no teste bem-sucedido.
2. O teste mediu apenas `health`.
3. Nao mediu Nginx/TLS/Cloudflare.
4. Nao mediu login real, Public API, Search ou Inbox por falta de credenciais/tokens de teste explicitos.
5. Nao houve p99 historico persistente.
6. Resultados nao servem como prova comercial de escala.

## Proxima Execucao Recomendada

Para concluir a 78N em nivel mais forte:

1. provisionar uma maquina geradora externa com k6;
2. criar credenciais de teste:
   - usuario app teste;
   - `APP_JWT` ou fluxo de login com MFA desativado;
   - `PUBLIC_API_KEY` read-only;
   - `CONVERSATION_ID` de tenant demo;
   - `SEARCH_QUERY` com indices existentes;
3. rodar `vu5`, `vu10`, `vu20`, `vu50` para:
   - health;
   - Public API;
   - Search;
   - Inbox read;
4. coletar `/admin/ops/metrics` e `/admin/ops/alerts` antes/depois;
5. gerar relatorio comparativo.

## Result Report

- Scripts k6 criados.
- Perfis 5/10/20/50 definidos e travados.
- k6 temporario validado.
- Tentativa externa local bloqueada por DNS do sandbox.
- Teste real `health` executado na VPS com 5/10/20/50 VUs.
- 0% erro HTTP nos perfis executados.
- P95 max observado: 581.63 ms em `vu20`.
- PM2 permaneceu online.
- Memoria permaneceu estavel.
- Nenhuma alteracao estrutural foi realizada.

---

# Sprint 78N.1 - External Load Test Validation

Data: 2026-06-25

Escopo: validacao externa leve pelo caminho publico real:

```text
k6 local
↓
Cloudflare/TLS/Nginx
↓
/agent-api
↓
PM2 backend
↓
PostgreSQL local
```

Nao houve tuning, swap, HA, alteracao estrutural, migration ou mudanca de runtime.

## Auditoria Previa

| Item | Resultado |
| --- | --- |
| Tenant de teste | `demo-prefeitura` ativo |
| Credencial documentada | `admin@demo-prefeitura.local` existe, mas a senha publica documentada nao confere mais com o hash atual |
| Usuario de carga | criado temporariamente no tenant demo, depois desativado |
| API key Public API | criada temporariamente com escopos read-only e depois revogada |
| Feature `advancedSearchRuntime` | ja estava habilitada no tenant demo |
| SearchIndex | 17 registros no tenant demo |
| Conversas demo | 29 conversas no tenant demo |
| Runtime Metrics | disponivel em `/admin/ops/metrics` |
| AlertManager | disponivel em `/admin/ops/alerts` |

Credenciais temporarias nao foram gravadas em arquivo versionado. Ao final do teste:

```text
API key temporaria: revogada
Sessoes do usuario temporario: removidas
Usuario temporario: desativado
```

## Execucao

Perfis executados:

```text
vu5
vu10
vu20
```

Duração por combinacao:

```text
30s
```

Cenarios:

```text
health
login
public-api
search
inbox-read
```

## Resultados Externos

### Health

| Perfil | Reqs | Erro HTTP | Avg | p95 | Max | Resultado |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 5 VUs | 130 | 0.00% | 159.3 ms | 358.0 ms | 441.3 ms | OK |
| 10 VUs | 257 | 0.00% | 178.4 ms | 507.3 ms | 590.6 ms | Threshold p95 local de 500 ms cruzado |
| 20 VUs | 506 | 0.00% | 180.5 ms | 432.2 ms | 556.6 ms | OK |

Leitura: o caminho publico adiciona latencia relevante em relacao ao backend local. Mesmo assim, `health` ficou sem erro HTTP nos tres perfis.

### Login

| Perfil | Reqs | Erro HTTP | Avg | p95 | Max | Resultado |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 5 VUs | 128 | 90.63% | 181.0 ms | 485.3 ms | 805.4 ms | Rate limit/session policy acionada |
| 10 VUs | 260 | 95.38% | 180.2 ms | 359.6 ms | 1055.3 ms | Rate limit/session policy acionada |
| 20 VUs | 522 | 100.00% | 152.4 ms | 322.3 ms | 511.1 ms | Rate limit/session policy acionada |

Leitura: o endpoint de login nao deve ser testado como login repetido do mesmo usuario em alta frequencia. O primeiro gargalo funcional foi protecao de autenticacao/sessao, nao CPU ou DB.

### Public API

| Perfil | Reqs | Erro HTTP | Avg | p95 | Max | Resultado |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 5 VUs | 264 | 54.55% | 239.4 ms | 632.4 ms | 903.3 ms | Rate limit acionado |
| 10 VUs | 519 | 88.44% | 250.8 ms | 673.1 ms | 919.9 ms | Rate limit acionado |
| 20 VUs | 960 | 93.75% | 296.2 ms | 713.5 ms | 829.9 ms | Rate limit acionado |

Leitura: a Public API funcionou externamente com API key temporaria, mas o perfil usado excedeu o rate limit atual. Para benchmark de throughput, a proxima rodada precisa calibrar `sleep`, janelas e limites de teste, sem desativar protecoes em producao.

### Search

Rerun executado com JWT novo, porque o cenario `login` invalida sessoes anteriores do mesmo usuario.

| Perfil | Reqs | Erro HTTP | Avg | p95 | Max | Resultado |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 5 VUs | 125 | 0.00% | 200.4 ms | 575.0 ms | 637.6 ms | OK |
| 10 VUs | 250 | 0.00% | 206.1 ms | 552.2 ms | 629.0 ms | OK |
| 20 VUs | 495 | 0.00% | 228.2 ms | 620.9 ms | 740.7 ms | OK |

Leitura: Search MVP suportou 5/10/20 VUs externos sem erro, com p95 entre 552 ms e 621 ms.

### Inbox Read

O usuario temporario `SUPERVISOR` acessou a listagem com 200, mas nao tinha conversa visivel para detalhe/timeline. Um teste com usuario temporario `ADMIN` criado direto no banco retornou 500 na listagem, indicando metadados incompletos do usuario criado fora do fluxo normal. Por isso, a medicao valida desta sprint ficou limitada a **Inbox list-only**.

| Perfil | Reqs | Erro HTTP | Avg | p95 | Max | Resultado |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 5 VUs | 120 | 0.00% | 243.8 ms | 612.1 ms | 674.5 ms | OK |
| 10 VUs | 250 | 0.00% | 207.3 ms | 507.8 ms | 596.0 ms | OK |
| 20 VUs | 487 | 0.00% | 241.4 ms | 632.4 ms | 801.1 ms | OK |

Leitura: listagem do Inbox pelo caminho publico suportou 5/10/20 VUs sem erro. Detalhe/timeline ainda exigem usuario de teste seedado pelo fluxo correto.

## Snapshot Operacional Pos-Teste

Health:

```text
ok: true
db: ok
```

Métricas internas:

```text
/admin/ops/metrics: 200
counters: 205
gauges: 17
timings: 243
```

Alertas:

```text
/admin/ops/alerts: 200
activeAlerts: 1
```

PM2:

```text
re7-whatsapp-agent  online  ~180 MB
re7-admin-front     online  ~63 MB
```

Memoria:

```text
total: 1967 MB
used: 951 MB
free: 193 MB
available: 1016 MB
swap: 0
```

Disco:

```text
/dev/vda1  58G  15G used  43G available  27%
```

## Comparativo Local x Externo

| Cenario | Local 78N | Externo 78N.1 | Leitura |
| --- | --- | --- | --- |
| Health 5 VUs | p95 154.9 ms | p95 358.0 ms | caminho publico adiciona latencia |
| Health 10 VUs | p95 156.0 ms | p95 507.3 ms | Nginx/TLS/Cloudflare + rede elevam p95 |
| Health 20 VUs | p95 581.6 ms | p95 432.2 ms | variabilidade continua; local tambem era contaminado pelo gerador na VPS |
| Search | nao medido | p95 575-621 ms, 0% erro | MVP funcional externamente |
| Inbox list | nao medido | p95 508-632 ms, 0% erro | listagem funcional externamente |
| Public API | nao medido | rate limit acionado | protecao atual e primeiro limite observado |
| Login | nao medido | rate limit/session policy acionada | teste precisa modelo com usuarios distintos |

## Respostas Da Sprint 78N.1

### Cloudflare influencia?

Sim. O caminho publico elevou p95 de `health` em relacao ao backend local, especialmente em 5/10 VUs.

### Nginx/TLS influencia?

Sim, como parte do caminho publico. A medicao nao separa Cloudflare, TLS e Nginx individualmente, mas confirma que o caminho completo tem custo adicional.

### PM2 influencia?

PM2 permaneceu online e sem restart. Nao foi gargalo conclusivo nesta carga leve.

### Primeiro gargalo?

O primeiro gargalo real observado foi **controle de taxa/sessao**, nao saturacao de CPU/DB:

- Login repetido do mesmo usuario aciona protecao de autenticacao/sessao.
- Public API aciona rate limit com os perfis usados.

Entre rotas de leitura autenticada que passaram, p95 ficou na faixa de ~500-630 ms.

### VPS suporta esta carga leve externa?

Para `health`, `search` e `inbox list-only` ate 20 VUs: **sim**, com 0% erro HTTP.

Para login repetido e Public API no perfil executado: **nao como benchmark bruto**, porque protecoes funcionais sao acionadas antes de saturacao tecnica.

## Limitacoes

1. Nao foi executado acima de 20 VUs.
2. Login usou um unico usuario temporario; isso nao representa usuarios distintos.
3. Public API usou uma unica API key temporaria; rate limit foi acionado.
4. Inbox detalhe/timeline nao foram validados porque o usuario temporario criado direto no banco nao tinha contexto completo para esse fluxo.
5. Nao houve p99 no summary export atual do k6 v2.0.0; foram registrados avg, p90, p95 e max.
6. Nao houve tuning, portanto os resultados representam o estado atual.

## Proxima Execucao Recomendada

Sprint sugerida: **78N.2 - Authenticated Load Test Fixtures**.

Escopo:

1. Criar fixture oficial de carga no tenant demo pelo fluxo da aplicacao.
2. Gerar 5-20 usuarios de teste distintos.
3. Criar API keys separadas por perfil de teste ou calibrar rate limit.
4. Garantir conversa visivel para detalhe/timeline.
5. Rodar:
   - login com usuarios distintos;
   - Public API com limites calibrados;
   - Inbox list/detail/timeline;
   - Search.

Status posterior: a Sprint 78N.2 implementou essas fixtures em `apps/whatsapp-agent/scripts/load-test-fixtures.mjs` e documentou o uso em `docs/saas/LOAD_TEST_FIXTURES.md`. A proxima execucao de carga autenticada deve usar `load-tests/k6/results/fixtures.env` gerado pelo `prepare` e executar `cleanup` ao final.

Atualizacao 78N.2D: a preparacao passa a usar o tenant tecnico `loadtest-prefeitura`. O fluxo esperado e: status do tenant, bootstrap temporario com `advancedSearchRuntime=false`, `load-test:fixtures prepare`, `search:index-shadow --record`, bootstrap final com `advancedSearchRuntime=true`. Nenhuma carga deve ser executada nesta etapa.

Atualizacao 78N.2E: antes da 78N.3, corrigir o bloqueio `claim_failed:500` observado no Webchat fixture. A proxima carga externa so deve iniciar depois de validar inbound Webchat, claim, outbound humano, timeline completa e cleanup sem erro.

## Result Report 78N.1

- Scripts k6 funcionaram pelo dominio publico.
- Credenciais temporarias foram criadas apenas no tenant demo.
- API key temporaria foi revogada.
- Usuario temporario foi desativado.
- `health`, `search` e `inbox list-only` passaram ate 20 VUs sem erro.
- `login` e `public-api` acionaram protecoes de taxa/sessao.
- PM2 permaneceu online.
- Health/DB permaneceram OK.
- Nenhuma alteracao estrutural foi realizada.

## Execucao 78N.3 - External Load Test Full Run

Data: 2026-06-26.

Escopo executado:

- tenant: `loadtest-prefeitura`;
- fixtures: `prepared=true`;
- usuarios temporarios ativos: 20;
- API keys ativas: 20;
- Webchat fixture: inbound + claim + outbound + timeline validado;
- SearchIndex: 19 registros;
- caminho: Cloudflare/TLS -> Nginx -> PM2 -> Backend -> PostgreSQL;
- duracao por cenario: 30s;
- perfil iniciado: `vu5`.

Baseline antes da carga:

| Item | Resultado |
| --- | --- |
| Health publico | OK, DB OK |
| PM2 backend | online |
| Memoria | 1.967 MiB total, 1.056 MiB available |
| Swap | 0 MiB |
| Alertas ativos | 0 |
| `demo-prefeitura` | preservado |

Resultados executados:

| Cenario | Perfil | Status | HTTP reqs | Error rate | p95 | Max | Observacao |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| `health` | `vu5` | PASS | 150 | 0,00% | 12,81 ms | 24,71 ms | Health e DB OK. |
| `login` | `vu5` | FAIL | 145 | 91,72% | 385,23 ms | 674,17 ms | Apenas 12/145 logins retornaram token; protecao/fluxo de login acionou erro alto. |
| `public-api` | `vu5` | PASS | 345 | 0,00% | 478,92 ms | 737,10 ms | Public API health, contacts e conversations OK. |
| `search` | `vu5` | ABORTADO | n/a | n/a | n/a | n/a | Iniciado por poucos segundos, interrompido quando o erro alto de login foi reconhecido. |
| `inbox-read` | `vu5` | NAO EXECUTADO | n/a | n/a | n/a | n/a | Regra de parada acionada. |
| `inbox-detail` | `vu5` | NAO EXECUTADO | n/a | n/a | n/a | n/a | Regra de parada acionada. |
| Demais perfis | `vu10`/`vu20`/`vu50` | NAO EXECUTADO | n/a | n/a | n/a | n/a | Regra de parada acionada em `vu5`. |

Snapshot depois da carga:

| Item | Resultado |
| --- | --- |
| PM2 backend | online |
| Memoria backend PM2 | 163,6 MiB |
| Memoria sistema | 1.967 MiB total, 1.010 MiB available |
| Swap | 0 MiB |
| Alertas ativos | 1 |
| Alerta | `runtime:error_rate`, `ERROR`, `errorCount=135`, `threshold=10` |

Interpretacao:

- O primeiro bloqueador da 78N.3 nao foi saturacao de CPU/RAM/DB.
- O primeiro bloqueador foi erro alto no cenario `login`, compatível com protecao/rate limit/fluxo de autenticacao sob repeticao.
- `public-api` passou em `vu5` com 0% erro usando API keys distribuidas.
- `health` passou em `vu5` com latencia baixa.
- A suite de fixtures esta pronta, mas o plano de login precisa evitar transformar protecao de seguranca em falso gargalo de performance.

Decisao:

Nao avancar para `vu10`, `vu20` ou `vu50` enquanto `login` nao tiver um desenho de carga compativel com a politica de seguranca.

Proxima sprint recomendada:

**78N.4 - Auth/Login Load Strategy Hardening**.

Objetivo: definir e implementar uma estrategia segura para medir sessoes autenticadas sem enfraquecer rate limit global, por exemplo:

- login setup separado do loop de carga;
- reuse controlado de token por VU;
- renovacao de token com baixa frequencia;
- medicao separada de `auth/login` como cenario de seguranca, nao como throughput principal;
- thresholds especificos para 401/429/lockout quando esperados.

## Atualizacao 78N.4 - Auth/Login Load Strategy Hardening

Data: 2026-06-26.

Achado tratado:

- a 78N.3 colocou `/auth/login` no loop principal de carga;
- isso acionou protecao/rate limit em `vu5`;
- o resultado media seguranca de autenticacao, nao capacidade das rotas autenticadas.

Mudancas de estrategia:

| Area | Antes | Depois |
| --- | --- | --- |
| `fixtures.env` | JSON sem quoting shell, exigia parser auxiliar | valores com quoting shell seguro, carregaveis por `source` |
| Rotas autenticadas | podiam fazer login no setup quando nao havia token | usam `APP_TOKENS_JSON` pre-obtido pelo `prepare` |
| `/auth/login` | podia ser executado em `vu5+` | bloqueado pelo runner para `vu5`, `vu10`, `vu20`, `vu50` |
| Login load | misturado ao plano principal | cenario separado, `PROFILE=vu1`, `SLEEP_SECONDS>=5` |
| Rate limits | risco de falso gargalo | preservados; nao houve relaxamento global |

Status:

- nenhuma regra de autenticacao foi alterada;
- MFA, rate limit, JWT e login permanecem intactos;
- cenarios `search`, `inbox-read` e `inbox-detail` continuam usando tokens no loop, sem chamar `/auth/login`;
- `public-api` continua usando API keys distribuidas;
- a proxima repeticao da 78N.3 deve usar login apenas como smoke/protecao separado.

## Re-run 78N.3 Pos-78N.4

Data: 2026-06-26.

Escopo executado:

- tenant: `loadtest-prefeitura`;
- fixtures: `prepared=true`;
- usuarios temporarios ativos: 20;
- API keys ativas: 20;
- `APP_TOKENS_JSON`: presente;
- SearchIndex: 22 registros;
- login: fora do loop principal;
- caminho: Cloudflare/TLS -> Nginx -> PM2 -> Backend -> PostgreSQL;
- duracao por cenario: 30s;
- perfil iniciado: `vu5`.

Baseline limpo antes da carga:

| Item | Resultado |
| --- | --- |
| Health publico | OK, DB OK |
| PM2 backend | online, ~127,9 MiB |
| PM2 frontend | online, ~58,7 MiB |
| Memoria | 1.967 MiB total, ~1.074 MiB available |
| Swap | 0 MiB |
| Alertas ativos | 0 |
| `demo-prefeitura` | preservado |

Resultados executados:

| Cenario | Perfil | Status | HTTP reqs | Error rate | Avg | p95 | p99 | Max | Observacao |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `health` | `vu5` | PASS | 150 | 0,00% | 29,07 ms | 170,09 ms | n/a | 363,03 ms | Health e DB OK. |
| `public-api` | `vu5` | PASS | 300 | 0,00% | 174,74 ms | 609,86 ms | n/a | 1.728,76 ms | Public API com API keys distribuidas OK. |
| `search` | `vu5` | FAIL | 145 | 41,37% | 49,98 ms | 259,28 ms | n/a | 454,51 ms | 60 checks falharam; investigacao apontou `401 session_replaced` em token de app. |
| `inbox-read` | `vu5` | NAO EXECUTADO | n/a | n/a | n/a | n/a | n/a | n/a | Regra de parada acionada em `search`. |
| `inbox-detail` | `vu5` | NAO EXECUTADO | n/a | n/a | n/a | n/a | n/a | n/a | Regra de parada acionada em `search`. |
| Demais perfis | `vu10`/`vu20`/`vu50` | NAO EXECUTADO | n/a | n/a | n/a | n/a | n/a | n/a | Regra de parada acionada em `vu5`. |

Snapshot depois da parada:

| Item | Resultado |
| --- | --- |
| Health publico | OK, DB OK |
| PM2 backend | online, ~136,9 MiB |
| PM2 frontend | online, ~58,9 MiB |
| Memoria | 1.967 MiB total, ~1.005 MiB available |
| Swap | 0 MiB |
| Alertas ativos | 1 |
| Alerta | `runtime:error_rate`, `ERROR`, `errorCount=60`, `threshold=10` |

Verificacao posterior do Search com os tokens da fixture:

| Token | Status | Leitura |
| --- | ---: | --- |
| 1 | 401 | `session_replaced`: sessao encerrada por novo login em outro dispositivo. |
| 2 | 200 | Search OK. |
| 3 | 200 | Search OK. |
| 4 | 200 | Search OK. |

Interpretacao:

- `health` e `public-api` estao saudaveis em `vu5` pelo caminho externo completo.
- O AlertManager funcionou e abriu `runtime:error_rate` quando o limiar foi cruzado.
- PM2, RAM e health permaneceram estaveis; nao houve sinal de saturacao de infraestrutura.
- O bloqueador atual e a estrategia de sessoes das fixtures autenticadas: `search` reutilizou tokens que podem ser invalidados por politica de sessao unica ou por quantidade insuficiente de sessoes validas para o perfil.
- A 78N.3 re-run nao justifica tuning, swap emergencial, HA ou alteracao de rate limit.
- O `p99` nao foi emitido pelo summary k6 atual; a proxima reexecucao deve ajustar `summaryTrendStats`/output antes do teste completo.

Decisao:

Nao avancar para `vu10`, `vu20`, `vu50` ou cenarios Inbox enquanto `search vu5` nao estiver livre de `session_replaced` artificial.

Proxima sprint recomendada:

**78N.5 - Auth Session Fixture Strategy Hardening**.

Objetivo:

- garantir uma sessao valida por VU para cenarios autenticados;
- evitar que o `prepare` ou o reuso de usuarios substitua sessoes ativas durante o teste;
- manter login fora do loop principal;
- nao enfraquecer rate limits globais nem regras de sessao;
- repetir a 78N.3 somente depois de `search vu5` passar com 0% erro de autenticacao.

## Atualizacao 78N.5 - Auth Session Fixture Strategy Hardening

Data: 2026-06-26.

Auditoria:

- `AppAuthSession` usa sessao exclusiva por usuario;
- novo login do mesmo usuario revoga sessoes anteriores com `revokeReason=replaced_by_new_login`;
- a validacao de request traduz essa revogacao para `session_replaced`;
- a fixture anterior gerava poucos tokens ADMIN/SUPERVISOR para os VUs e colocava os mesmos usuarios no pool de `LOGIN_USERS_JSON`;
- o smoke isolado de `login` podia substituir o token ADMIN usado por `APP_TOKENS_JSON`.

Mudancas:

| Area | Antes | Depois |
| --- | --- | --- |
| Usuarios de carga app | ADMIN + poucos SUPERVISOR | `--users` cria usuarios ADMIN/SUPERVISOR suficientes para os VUs |
| Usuarios de login | todos os usuarios temporarios | `--login-users` cria usuarios AGENT separados, exclusivos para `/auth/login` |
| `APP_TOKENS_JSON` | podia ter menos tokens que VUs | passa a ter 1 token por usuario app |
| `LOGIN_USERS_JSON` | podia revogar tokens de app | nao compartilha usuarios com `APP_TOKENS_JSON` |
| k6 Search/Inbox | aceitava pool menor que VUs | falha cedo se tokens < VUs do perfil |
| Criacao de usuarios | criacao administrativa em sequencia rapida podia bater rate limit | `--admin-delay-ms`, default `3000`, respeita a protecao real |
| Geracao de tokens | logins em sequencia rapida podiam bater rate limit | `--auth-delay-ms`, default `6000`, respeita a protecao real |

Resultado esperado:

- `PROFILE=vu5` deve usar 5 sessoes app distintas;
- `PROFILE=vu20` deve usar 20 sessoes app distintas quando `--users 20`;
- `login vu1` continua testando protecao de autenticacao sem invalidar tokens de Search/Inbox;
- nenhuma regra de login, JWT, MFA, rate limit ou sessao foi alterada.

Proxima validacao:

- rodar `prepare` novamente no tenant `loadtest-prefeitura`;
- confirmar `appTokenCount >= VUs` no `status`;
- executar `login vu1` e depois validar que `search vu5` continua com 0% `session_replaced`;
- repetir a 78N.3 somente depois de `search vu5`, `inbox-read vu5` e `inbox-detail vu5` passarem com 0% erro de autenticacao.

## Re-run Final 78N.3 Pos-78N.5

Data: 2026-06-26.

Escopo executado:

- tenant: `loadtest-prefeitura`;
- fixtures: `prepared=true`;
- `appUsers=20`;
- `loginUsers=2`;
- `appTokenCount=20`;
- SearchIndex: populado via `search:index-shadow --record`;
- login: fora do loop principal;
- caminho: Cloudflare/TLS -> Nginx -> PM2 -> Backend -> PostgreSQL;
- duracao por cenario: 30s;
- perfil executado: `vu5`;
- `vu10`, `vu20` e `vu50`: nao executados por regra de parada.

Baseline:

| Item | Resultado |
| --- | --- |
| Health publico | OK, DB OK |
| Alertas ativos | 0 |
| PM2 backend | online, ~164,8 MiB |
| PM2 frontend | online, ~59,5 MiB |
| Memoria | 1.967 MiB total, ~1.054 MiB available |
| Swap | 0 MiB |

Resultados `vu5`:

| Cenario | Status | HTTP reqs | Error rate | Avg | p90 | p95 | Max | Leitura |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `health` | PASS | 150 | 0,00% | 27,93 ms | 77,98 ms | 177,25 ms | 241,37 ms | Health/DB OK. |
| `public-api` | PASS | 381 | 0,00% | 66,39 ms | 87,62 ms | 295,35 ms | 468,57 ms | API keys distribuidas OK. |
| `search` | PASS | 145 | 0,00% | 36,31 ms | 52,71 ms | 88,94 ms | 399,94 ms | `session_replaced` eliminado. |
| `inbox-read` | PASS | 117 | 0,00% | 315,00 ms | 546,57 ms | 768,28 ms | 863,38 ms | Listagem OK. |
| `inbox-detail` | FAIL | 252 | 80,15% | 99,34 ms | 151,97 ms | 495,75 ms | 632,09 ms | Falha por RBAC/departamento da fixture. |

Diagnostico do `inbox-detail`:

| Token | Detail | Timeline | Leitura |
| --- | ---: | ---: | --- |
| 1 | 200 | 200 | usuario com acesso a conversa fixture. |
| 2 | 403 | 403 | `Conversa fora do seu departamento.` |
| 3 | 403 | 403 | `Conversa fora do seu departamento.` |
| 4 | 403 | 403 | `Conversa fora do seu departamento.` |
| 5 | 403 | 403 | `Conversa fora do seu departamento.` |

Snapshot pos-parada:

| Item | Resultado |
| --- | --- |
| Health publico | OK, DB OK |
| PM2 backend | online, ~172,5 MiB |
| PM2 frontend | online, ~59,6 MiB |
| Memoria | 1.967 MiB total, ~1.040 MiB available |
| Swap | 0 MiB |
| Alertas ativos | 1 |
| Alerta | `runtime:error_rate`, `ERROR`, `errorCount=205`, `threshold=10` |

Interpretacao:

- A 78N.5 resolveu o problema de sessao: `search vu5` passou com 0% erro e sem `session_replaced`.
- `health`, `public-api`, `search` e `inbox-read` estao saudaveis em `vu5` pelo caminho externo completo.
- PM2, RAM e health permaneceram estaveis; nao ha sinal de saturacao de VPS, DB ou TLS neste recorte.
- O primeiro bloqueador real agora e o `inbox-detail`: os tokens distribuidos pertencem a usuarios de departamentos diferentes da conversa fixture.
- O resultado mede controle de acesso/fixture de Inbox Detail, nao performance.

Decisao:

Nao avancar para `vu10`, `vu20` ou `vu50` ate a fixture de Inbox Detail garantir acesso legitimo de todos os VUs ao mesmo detalhe/timeline, ou ate o teste usar conversas distribuidas por departamento/usuario.

Proxima sprint recomendada:

**78N.6 - Inbox Detail Fixture Ownership Hardening**.

Objetivo:

- auditar regra de acesso do detalhe/timeline (`departamento`, `claim`, `ownership`);
- garantir que os usuarios de `APP_TOKENS_JSON` usados no cenario `inbox-detail` tenham acesso legitimo a conversa fixture;
- evitar bypass de RBAC;
- preferir criar conversa por departamento ou alinhar todos os usuarios de carga ao departamento da fixture;
- repetir `inbox-detail vu5` antes de qualquer `vu10/20`.

## Atualizacao 78N.6 - Inbox Detail Fixture Ownership Hardening

Data: 2026-06-26.

Auditoria:

- o endpoint `/app/conversation/:id` e `/timeline` carrega `departmentAccess` do usuario autenticado e valida o departamento da conversa;
- o `claim` e o `send` Webchat ja estavam usando o fallback correto de `ConversationRuntimeState`;
- a fixture criava uma unica conversa Webchat usando o usuario ADMIN;
- o k6 usava o mesmo `CONVERSATION_ID` para todos os VUs;
- o token 1 acessava porque era ADMIN;
- os tokens 2-5 recebiam 403 porque eram SUPERVISOR em departamento diferente do departamento operacional da conversa Webchat.

Respostas obrigatorias:

| Pergunta | Resposta |
| --- | --- |
| Por que token 1 acessa? | Porque token 1 pertence ao usuario ADMIN da fixture, que passa pela regra de acesso administrativo. |
| Por que tokens 2-5 recebem 403? | Porque pertencem a usuarios SUPERVISOR cujo `departmentId` nao correspondia ao `departmentId` da conversa Webchat fixture. |
| A conversa fixture pertence a qual departamento? | Ao departamento operacional resolvido pelo runtime Webchat/Inbox para a conversa criada no prepare. A 78N.6 passa a registrar esse `departmentId` em `inboxDetail.departmentId`. |
| Os usuarios dos tokens estao em quais departamentos? | Antes da 78N.6, os supervisores ficavam no primeiro departamento ativo retornado pelo admin; isso podia divergir do departamento da conversa. |
| O k6 esta escolhendo a mesma conversa para todos? | Sim. Antes da 78N.6, `inbox-detail` usava apenas `CONVERSATION_ID` global. |
| Menor correcao fiel ao modelo real | Alinhar os usuarios SUPERVISOR de carga ao departamento real da conversa fixture via endpoint administrativo e emitir `INBOX_DETAIL_CONVERSATIONS_JSON` para selecao por VU/token. |

Mudancas:

- `load-test-fixtures.mjs` busca o detalhe da conversa Webchat apos criar inbound/claim/outbound;
- extrai o `departmentId` real da conversa;
- atualiza usuarios SUPERVISOR de carga para esse departamento pelo endpoint `/admin/users/:id`;
- remove o ADMIN do pool de carga; o ADMIN fica apenas em `FIXTURE_ADMIN_JSON` para prepare/cleanup;
- grava `inboxDetail` no manifest;
- grava `INBOX_DETAIL_CONVERSATIONS_JSON` no `fixtures.env`;
- `inbox-detail.js` passa a escolher a conversa via matriz por VU/token, mantendo `CONVERSATION_ID` como fallback.

O que nao foi alterado:

- RBAC;
- ACL;
- regra de departamento;
- autenticacao;
- MFA;
- rate limit;
- endpoint de Inbox;
- runtime de canais.

Validacao esperada na VPS:

```text
prepare/status:
prepared=true
appUsers>=20
appTokenCount>=20
inboxDetail presente

inbox-detail vu1: PASS
inbox-detail vu5: PASS
403 departamento: 0
401/session_replaced: 0
```

Decisao:

Se `inbox-detail vu5` passar limpo, repetir a 78N.3 final-final com `health`, `public-api`, `search`, `inbox-read` e `inbox-detail` em `vu5 -> vu10 -> vu20`.

### Pre-release VPS 78N.6

Data: 2026-06-27.

Host: `/opt/re7online/site-re7online`.

Validacoes executadas:

| Item | Resultado |
| --- | --- |
| `git pull` | OK, fast-forward ate `73a2ef6` |
| `prisma validate` | OK |
| `prisma generate` | OK |
| `prisma migrate status` | OK, schema atualizado |
| `node --check scripts/load-test-fixtures.mjs` | OK |
| `k6 inspect inbox-detail.js` | OK usando `/tmp/k6` |
| `cleanup` fixture anterior | OK |
| `prepare --users 20 --login-users 2 --api-keys 20` | OK |

Fixture nova:

| Campo | Resultado |
| --- | --- |
| `runId` | `78n2-mqvmakbh` |
| `prepared` | true |
| `appUsers` | 20 |
| `loginUsers` | 2 |
| `appTokenCount` | 20 |
| `apiKeys` | 20 |
| `conversationId` | `webchat:eb97ff1e397901c24d65311703e8e5cb` |
| `inboxDetail.departmentId` | `cmqv1x7ji008l4sqyqs0raioe` |
| `inboxDetail.appUsersAligned` | 20 |
| `INBOX_DETAIL_CONVERSATIONS_JSON` | presente |

Smokes:

| Cenario | Perfil | Status | HTTP reqs | Error rate | Avg | p90 | p95 | Max | Checks |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `inbox-detail` | `vu1` | PASS | 52 | 0,00% | 91,70 ms | 184,64 ms | 296,95 ms | 486,99 ms | 52/52 |
| `inbox-detail` | `vu5` | PASS | 230 | 0,00% | 164,73 ms | 296,61 ms | 449,97 ms | 710,79 ms | 230/230 |

Confirmacoes:

- `403 Conversa fora do seu departamento`: 0;
- `401/session_replaced`: 0;
- detail/timeline: 100% 200;
- health publico: OK, DB OK;
- memoria: 1.967 MiB total, ~1.062 MiB available, 0 swap;
- `runtime:error_rate` continuou ativo como alerta acumulado das falhas anteriores do laboratorio, nao como novo erro do smoke 78N.6.

Decisao:

78N.6 atende ao criterio de encerramento. A proxima rodada pode ser a 78N.3 final-final, com `health`, `public-api`, `search`, `inbox-read` e `inbox-detail` em `vu5 -> vu10 -> vu20`, mantendo login fora do loop principal.

## 78N.3 Final-Final - External Load Test Full Run

Data: 2026-06-27.

Escopo:

- tenant: `loadtest-prefeitura`;
- fixture: `78n2-mqwazjt2`;
- `appUsers=20`;
- `loginUsers=2`;
- `appTokenCount=20`;
- `apiKeys=20`;
- `inboxDetail.appUsersAligned=20`;
- SearchIndex populado via `search:index-shadow --record`;
- login fora do loop principal;
- caminho: Cloudflare/TLS -> Nginx -> PM2 -> Backend -> PostgreSQL;
- duracao por cenario: 30s;
- perfis: `vu5`, `vu10`, `vu20`;
- `vu50`: nao executado.

Baseline:

| Item | Resultado |
| --- | --- |
| Health publico | OK, DB OK |
| PM2 backend | online, ~210 MiB |
| PM2 frontend | online, ~58 MiB |
| Memoria | 1.967 MiB total, ~946 MiB available |
| Swap | 0 MiB |
| Alertas ativos | `runtime:error_rate` acumulado de execucoes anteriores, `errorCount=222` |

Resultados:

| Cenario | Perfil | Status | HTTP reqs | Error rate | Avg | p90 | p95 | Max | Checks |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `health` | `vu5` | PASS | 150 | 0,00% | 9,80 ms | 10,47 ms | 13,01 ms | 120,33 ms | 300/300 |
| `public-api` | `vu5` | PASS | 369 | 0,00% | 76,58 ms | 183,31 ms | 415,58 ms | 802,43 ms | 492/492 |
| `search` | `vu5` | PASS | 123 | 0,00% | 242,52 ms | 683,27 ms | 778,56 ms | 1.215,22 ms | 246/246 |
| `inbox-read` | `vu5` | PASS | 86 | 0,00% | 827,62 ms | 1.044,00 ms | 1.190,15 ms | 1.359,65 ms | 172/172 |
| `inbox-detail` | `vu5` | PASS | 204 | 0,00% | 269,87 ms | 651,37 ms | 720,69 ms | 902,14 ms | 204/204 |
| `health` | `vu10` | PASS | 300 | 0,00% | 28,61 ms | 46,15 ms | 219,37 ms | 274,93 ms | 600/600 |
| `public-api` | `vu10` | PASS | 639 | 0,00% | 152,86 ms | 478,98 ms | 568,55 ms | 725,96 ms | 852/852 |
| `search` | `vu10` | PASS | 284 | 0,00% | 68,84 ms | 143,96 ms | 466,84 ms | 615,14 ms | 568/568 |
| `inbox-read` | `vu10` | PASS | 166 | 0,00% | 879,59 ms | 1.128,43 ms | 1.164,78 ms | 1.242,50 ms | 332/332 |
| `inbox-detail` | `vu10` | PASS | 320 | 0,00% | 478,59 ms | 828,32 ms | 886,04 ms | 978,84 ms | 320/320 |
| `health` | `vu20` | PASS | 600 | 0,00% | 17,11 ms | 48,71 ms | 97,55 ms | 230,42 ms | 1.200/1.200 |
| `public-api` | `vu20` | PASS | 1.098 | 0,00% | 222,96 ms | 475,33 ms | 548,75 ms | 769,87 ms | 1.464/1.464 |
| `search` | `vu20` | PASS | 574 | 0,00% | 59,46 ms | 119,91 ms | 358,73 ms | 618,06 ms | 1.148/1.148 |
| `inbox-read` | `vu20` | FAIL LATENCIA | 278 | 0,00% | 1.231,17 ms | 1.723,71 ms | 2.085,30 ms | 2.385,33 ms | 556/556 |
| `inbox-detail` | `vu20` | INTERROMPIDO | n/a | n/a | n/a | n/a | n/a | n/a | Regra de parada apos `inbox-read vu20`. |

Snapshot pos-parada:

| Item | Resultado |
| --- | --- |
| Health publico | OK, DB OK |
| PM2 backend | online, ~213 MiB |
| PM2 frontend | online, ~58 MiB |
| Memoria | 1.967 MiB total, ~991 MiB available |
| Swap | 0 MiB |
| Alertas ativos | mesmo `runtime:error_rate` acumulado, `errorCount=222` |

Interpretacao:

- O laboratorio de carga v1 esta representativo: nao houve `session_replaced`, nao houve `403` de departamento, nao houve erro de Public API, Search ou Inbox Detail ate `vu10`.
- A plataforma passou `health`, `public-api` e `search` ate `vu20` com 0% erro e p95 dentro dos thresholds.
- `inbox-read` passou funcionalmente ate `vu20`, mas cruzou o threshold de latencia: p95 `2.085,30 ms` contra limite `1.500 ms`.
- O primeiro gargalo real medido e a listagem do Inbox sob `20 VUs`, provavelmente relacionado a consulta/materializacao da lista/timeline operacional e volume de conversas historicas do tenant tecnico.
- Nao ha evidencia nesta rodada de saturacao de PM2, queda de health, erro HTTP, problema de RBAC, problema de sessao, problema de rate limit ou falha de API keys.
- Como a VPS ainda opera com `1.9 GiB RAM` e `0 swap`, a 78O continua recomendada como hardening preventivo, mas o primeiro foco tecnico de performance deve incluir `inbox-read`/query path.

Decisao:

- Encerrar a fase de ajuste metodologico do laboratorio de carga v1.
- Nao executar `vu50`.
- Abrir **78O - Capacity & Swap Hardening** como hardening preventivo.
- Abrir item tecnico posterior para investigar/otimizar `inbox-read` antes de tratar resultados como benchmark contratual para 20+ VUs.

## 78O.1 - Inbox Read Query Path Investigation

Status: auditoria concluida em `docs/saas/INBOX_QUERY_PATH_AUDIT.md`.

Conclusao diagnostica:

- o gargalo de `inbox-read vu20` nao foi erro HTTP, autenticacao, sessao, RBAC, PM2, Search ou Public API;
- o caminho de listagem monta uma visao operacional rica antes do `limit` final;
- para `limit=20`, o endpoint busca ate 201 conversas candidatas e ate 402 inbound/outbound;
- ha N+1 confirmado na resolucao de `ConversationRuntimeState`/runtime state por conversa candidata;
- filtros de departamento, visibilidade, contadores, unread, last message e ordenacao final acontecem em memoria;
- indices foram levantados apenas como diagnostico, sem migration.

Nenhuma otimizacao foi aplicada nesta sprint. A proxima etapa recomendada e `78O.2 - Inbox Read Performance Hardening`, iniciando por instrumentacao por etapa antes de mudar query path.

## 78O.2 - Inbox Read Performance Hardening

Status: implementacao local concluida, aguardando pre-release/deploy controlado para medicao externa antes/depois.

Mudancas:

- instrumentacao interna por etapa para `GET /app/conversations`;
- metricas `inbox.list.duration`, `inbox.list.query_count` e `inbox.list.response_bytes`;
- batch de `ConversationRuntimeState` para candidatos Webchat;
- fallback individual preservado;
- sem cache, Redis, tuning global, indice ou migration.

Baseline usado:

```text
inbox-read vu20
p95: 2.085,30 ms
erro HTTP: 0%
```

Medicao pos-mudanca pendente:

```text
inbox-read vu5
inbox-read vu10
inbox-read vu20
```

Coletar junto:

- `/admin/ops/metrics` filtrando `inbox.list.duration`;
- `inbox.list.query_count`;
- `inbox.list.response_bytes`;
- PM2/RAM/health/alerts.

O resultado so deve ser considerado conclusivo apos rodar no tenant tecnico `loadtest-prefeitura`.
