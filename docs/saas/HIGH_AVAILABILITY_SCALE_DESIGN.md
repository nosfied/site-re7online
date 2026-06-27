# Sprint 78I - High Availability & Scale Design

Data: 2026-06-25

Escopo: auditoria e desenho de alta disponibilidade e escala do Converta, sem codigo, banco, Docker novo, Kubernetes, Terraform, infraestrutura nova ou alteracao funcional.

## Resumo Executivo

O Converta esta operacionalmente maduro para uso controlado em VPS unica, mas ainda nao possui alta disponibilidade real. A arquitetura atual tem boa disciplina de deploy, PM2, health, metricas, dashboard operacional, alert engine, cron de backup e PostgreSQL em Docker local. Para contratos maiores, os principais riscos sao:

- VPS unica;
- PostgreSQL unico no mesmo host;
- disco local como ponto de falha;
- frontend e backend no mesmo host;
- build no mesmo host de producao;
- sem replica, failover, storage externo formal ou restore drill periodico;
- sem prova de carga para 400 usuarios simultaneos, 30 numeros WhatsApp e alto volume multicanal.

Classificacao atual: **ATENDE COM AJUSTE** para contratos pequenos/medios e **NAO ATENDE plenamente** para contratos com HA/SLA forte sem evolucao de infraestrutura.

## Confirmacao De Nao Alteracao Funcional

Esta sprint nao:

- altera codigo;
- altera banco;
- cria migration;
- cria Docker/Kubernetes/Terraform;
- cria servidor, fila, storage ou replica;
- altera PM2, Nginx, DNS, certificados ou deploy;
- altera runtime de canais, login, IA, chatbot, Public API, Webchat, Telegram, Scheduling, Search, Audio ou MFA.

## Auditoria Da Arquitetura Atual

### Evidencias De VPS

Ambiente auditado:

```text
host: re7online-api-01
kernel: Ubuntu Linux 6.8
CPU: 2 vCPU
RAM: 1.9 GiB
swap: 0
disco raiz: 58 GB
uso do disco raiz: 15 GB / 58 GB, 26%
```

Processos PM2:

```text
re7-admin-front     online, fork mode, porta 3000
re7-whatsapp-agent  online, fork mode, porta 3001
```

Banco:

```text
container: wa-agent-postgres
imagem: postgres:16-alpine
porta: 127.0.0.1:5432
restart: unless-stopped
volume: /var/lib/docker/volumes/postgres_wa_agent_pgdata/_data
```

Cron do usuario `deploy`:

```text
03:00 media cleanup
03:15 backup-data.sh
03:30 retention:run
```

### Arquivos Reaproveitados

| Area | Evidencia |
| --- | --- |
| PM2 | `apps/whatsapp-agent/ecosystem.config.cjs` |
| Deploy | `docs/RUNBOOK_WHATSAPP_AGENT.md`, `docs/DEPLOY_TOPOLOGY_RE7.md` |
| Backup/restore | `apps/whatsapp-agent/scripts/backup-data.sh`, `apps/whatsapp-agent/scripts/restore-data.sh`, runbook com `pg_dump` |
| Health | `apps/whatsapp-agent/src/http/health.route.ts` |
| Observabilidade | `/admin/ops`, `/admin/ops/metrics`, `/admin/ops/alerts` |
| Feature flags | `Client.features` e rollout por tenant |
| Retencao | `retention:run`, media cleanup e logs locais |

## Arquitetura Atual

```text
Usuarios / Webhooks / Public API
        |
        v
Cloudflare DNS / Proxy
        |
        v
Nginx na VPS
        |
        +--> Next.js operacional / PM2 / porta 3000
        |
        +--> WhatsApp Agent / PM2 / porta 3001
                 |
                 +--> PostgreSQL Docker local / 127.0.0.1:5432
                 |
                 +--> volume Docker local postgres_wa_agent_pgdata
                 |
                 +--> .data / media / backups locais
                 |
                 +--> providers externos: Meta, Telegram, OpenAI, Webhooks pilotos
```

Dominios documentados:

- `converta.re7online.com` na VPS;
- `api.re7online.com` na VPS;
- `admin.re7online.com` historico/operacional na VPS;
- `re7online.com` na Vercel para site publico.

Certificados e DNS:

- Cloudflare para DNS/proxy;
- Nginx e Certbot documentados em runbooks;
- sem automacao IaC para recriar Nginx/TLS/DNS.

## O Que Ja Existe

| Item | Status | Reaproveitamento |
| --- | --- | --- |
| PM2 autorestart | Existe | manter como camada de processo no single-node. |
| Health | Existe | base para readiness/liveness futuro. |
| Metrics/dashboard | Existe | base para capacity e alerting. |
| Alert engine | Existe | base para detectar degradacao local. |
| Deploy manual controlado | Existe | manter ate blue/green. |
| Feature flags | Existe | rollback funcional por modulo. |
| Backup cron | Existe | base para 78J. |
| PostgreSQL Docker local | Existe | base atual, mas SPOF alto. |
| Docker | Existe para banco | nao ha orquestracao multi-container da app. |

## SPOFs

| SPOF | Risco | Impacto | Observacao |
| --- | --- | --- | --- |
| VPS unica | ALTO | queda total do Converta operacional | frontend, backend e banco dependem do mesmo host. |
| PostgreSQL unico local | ALTO | indisponibilidade/perda de dados se host/volume falhar | sem replica/PITR/failover documentado. |
| Disco local | ALTO | perda de DB/media/backups locais | backups ficam no mesmo host se nao houver copia externa. |
| Volume Docker do Postgres | ALTO | falha/corrupcao de volume afeta DB | precisa backup externo e restore drill. |
| Nginx unico | ALTO | dominios operacionais indisponiveis | sem load balancer externo documentado. |
| Build na VPS de producao | MEDIO/ALTO | risco de memoria/CPU durante deploy | host tem 1.9 GiB RAM e sem swap; builds sequenciais sao regra pratica. |
| PM2 fork single instance | MEDIO | processo reinicia, mas sem redundancia | backend fica indisponivel durante falha prolongada. |
| Sem swap | MEDIO | build ou pico pode causar OOM | ja houve cuidado operacional com build sequencial. |
| Backups locais | MEDIO/ALTO | backup pode sumir junto com VPS | precisa offsite. |
| DNS/Cloudflare | MEDIO | roteamento externo indisponivel se config falhar | depende de controle manual. |
| Certificados TLS | MEDIO | expiracao/erro de renew afeta acesso | Certbot documentado, mas sem alerta dedicado. |
| Upload/media local | MEDIO/ALTO | escala e HA exigem storage compartilhado | requisito 600 GB depende de storage externo. |
| WebSocket/realtime single-node | MEDIO | horizontal exige sticky/session ou pub-sub | hoje single-node simplifica. |
| Cron local | MEDIO | se VPS cair, backups/retencao param | precisa scheduler externo ou node secundario futuro. |

## Melhorias Por Tipo

### Reaproveitaveis Sem Reescrever Produto

- PM2 e runbooks atuais;
- health/metrics/alerts internos;
- feature flags;
- scripts de backup/restore;
- replay/smoke/shadow;
- deploy por commit fixo;
- PostgreSQL atual como fonte primaria ate migracao controlada.

### Exigem Codigo

- health split: `/health/live`, `/health/ready`, `/admin/ops/health`;
- app mais stateless para multiplas instancias;
- externalizacao de upload/media para object storage;
- fila duravel para jobs e providers;
- cache compartilhado ou invalidador para multi-node;
- pub/sub para realtime multi-node;
- metricas persistentes/historicas;
- readiness por dependencia;
- graceful shutdown mais formal se necessario.

### Exigem Infraestrutura

- segunda VPS ou app node adicional;
- load balancer;
- PostgreSQL gerenciado ou replica;
- backup externo/offsite;
- object storage para media;
- monitor externo de uptime;
- DNS/Cloudflare runbook com failover;
- opcional: managed Redis/queue;
- opcional: storage de logs/metricas externo.

## Escalabilidade Proposta

### Backend Horizontal

Modelo alvo:

```text
Load Balancer
   |
   +--> Backend A
   +--> Backend B
   |
Shared Postgres
Shared Object Storage
Shared Queue/PubSub
```

Premissas:

- HTTP REST deve ser stateless;
- sessoes devem continuar por JWT/AppAuthSession no DB;
- uploads/media nao podem depender do disco local;
- WebSocket/realtime precisa sticky session ou pub/sub;
- jobs/CLIs devem virar workers idempotentes antes de automaticos.

### Sticky Session

Curto prazo:

- usar sticky para WebSocket/realtime se houver mais de um backend;
- manter polling como fallback;
- documentar que Webchat hoje usa polling, mais facil de escalar.

Medio prazo:

- pub/sub para eventos realtime;
- remover dependencia de conexao local unica.

### Storage Compartilhado

Necessario para:

- midia inbound/outbound;
- transcricoes/audio temporario se virar runtime;
- anexos futuros;
- requisito de 600 GB.

Recomendacao:

- object storage S3-compatible;
- lifecycle por retencao LGPD;
- backup/versionamento conforme contrato;
- URLs assinadas ou proxy seguro.

### Fila E Workers

Necessario para:

- webhooks automaticos;
- scheduling automatico;
- audio transcription;
- search indexing;
- campanhas em escala;
- retries de provider.

Modelo recomendado:

- iniciar com fila gerenciada ou Redis/queue simples;
- jobs idempotentes;
- DLQ;
- limites por tenant;
- observabilidade por job.

### Cache

Uso recomendado:

- cache compartilhado para configuracoes de canal se multi-node;
- rate limit distribuido;
- dedupe cross-node;
- nao usar cache como fonte autoritativa.

## Banco De Dados

Estado atual:

- PostgreSQL 16 em Docker local;
- volume Docker local;
- backup cron local;
- sem replica/PITR/failover documentado.

### Backup

Curto prazo:

- manter backup diario;
- copiar backup para storage externo;
- criptografar backup;
- registrar tamanho/checksum;
- alertar falha de backup.

### Restore

Definir restore drill mensal:

1. criar banco temporario;
2. restaurar ultimo backup;
3. rodar `prisma migrate status`;
4. rodar queries de contagem principais;
5. rodar smoke read-only;
6. registrar RTO real.

### PITR

Para contratos maiores:

- ativar WAL archiving;
- manter backups base + WAL;
- definir janela de recuperacao;
- testar restore point-in-time.

### Replica E Failover

Opcoes:

| Opcao | Pros | Contras | Uso recomendado |
| --- | --- | --- | --- |
| Postgres local + backup externo | barato, simples | sem HA real | curto prazo. |
| Postgres gerenciado | backup/PITR/replica mais simples | custo e migracao | recomendacao para contrato publico maior. |
| Replica self-managed | controle | operacao complexa | somente com runbook forte. |

## Deploy

### Atual

- manual;
- `git pull`/checkout na VPS;
- Prisma validate/generate/migrate quando necessario;
- build na VPS;
- PM2 reload;
- health/smoke/replay.

Pontos fortes:

- rastreavel por commit;
- disciplinado;
- baixo risco de automacao excessiva.

Gaps:

- build consome recursos da producao;
- rollback manual;
- sem blue/green;
- sem canary;
- sem artefato prebuild imutavel.

### Blue/Green

Modelo futuro:

- duas portas/processos: blue e green;
- build/start no ambiente inativo;
- health/readiness;
- troca Nginx;
- rollback alterando proxy.

Beneficio: reduz downtime e risco de reload quebrado.

### Rolling

Viavel quando houver duas instancias backend:

- atualizar uma instancia;
- validar health;
- atualizar a outra.

### Canary

Fase posterior:

- porcentagem pequena de trafego;
- exige load balancer/regras;
- util para API e Webchat.

## Capacity Planning Inicial

Capacidade atual observada:

```text
CPU: 2 vCPU
RAM: 1.9 GiB
swap: 0
disco: 58 GB
backend PM2 max_memory_restart: 300 MB
frontend PM2: processo Next local
PostgreSQL: mesmo host
```

Implicacoes:

- builds devem continuar sequenciais;
- sem swap aumenta risco de OOM;
- 600 GB de midia nao cabe no disco atual;
- Postgres + frontend + backend competem por RAM/CPU;
- 400 usuarios simultaneos precisam prova de carga antes de promessa contratual.

### Dimensoes A Medir

| Dimensao | Medir |
| --- | --- |
| CPU | uso medio/p95 por webhook, inbox, search e API publica. |
| Memoria | RSS backend, Next, Postgres e build. |
| Disco | crescimento DB, media, logs, backups. |
| Conexoes DB | conexoes ativas por modulo e pico. |
| Usuarios simultaneos | login/inbox/search/realtime. |
| Throughput | webhooks/min, mensagens/min, Public API req/min. |
| Latencia | p50/p95/p99 por rota/modulo. |
| Providers | Meta/Telegram/OpenAI latency/failure. |

### Tamanhos Recomendados Por Fase

| Fase | Infra minima sugerida |
| --- | --- |
| Atual controlado | 2 vCPU, 2 GB RAM, Postgres local, backups externos obrigatorios. |
| Piloto B2G medio | 2 app nodes ou 1 app node maior, Postgres gerenciado, object storage. |
| Aripuana/Rio Preto | load balancer, 2+ app nodes, Postgres gerenciado com PITR, object storage 600 GB, fila/worker. |

## Plano De Load Test

Sem implementar agora.

### Cenarios

| Area | Cenario |
| --- | --- |
| Inbox | 50/100/200/400 usuarios abrindo conversas, alternando timeline e enviando mensagens. |
| Public API | contacts/conversations/messages read-only com API keys e rate limit. |
| Search | busca textual com filtros e paginas em `SearchIndex`. |
| Webhooks | dispatch controlado e, futuramente, automatico com 2xx/4xx/timeout. |
| Scheduling | listagem, reminders, shadow/send controlado. |
| Webchat | sessoes, inbound, polling e outbound humano. |
| Telegram | inbound webhook e outbound texto. |

### Metricas De Sucesso

- p95 API < 800 ms para leitura simples;
- p95 Inbox detalhe < 300 ms quando cacheado e < 1000 ms sem cache;
- erro 5xx < 1%;
- CPU sustentada < 70%;
- RAM com margem > 25%;
- DB sem saturar conexoes;
- sem perda/duplicidade de mensagens.

## Disaster Recovery

### RPO/RTO Propostos

| Nivel | RPO | RTO | Uso |
| --- | --- | --- | --- |
| Atual formalizado | 24h | 4-8h | contratos pequenos sem SLA forte. |
| B2G medio | 1h | 2-4h | exige backup externo e restore drill. |
| B2G critico | 15min | < 1h | exige PITR, replica/failover e runbook treinado. |

### Runbook Futuro De DR

1. declarar incidente;
2. congelar deploys;
3. identificar ultimo backup valido;
4. restaurar em host limpo;
5. validar schema/migrations;
6. validar health/readiness;
7. validar login/inbox/webhook;
8. apontar DNS/load balancer;
9. registrar RTO/RPO real;
10. executar postmortem.

## Roadmap

### 78J - Backup & Restore

- inventario de dados;
- backup DB + `.data` + media;
- copia externa;
- checksum;
- restore drill;
- RPO/RTO medido.

Status: design concluido na Sprint 78J em `docs/saas/BACKUP_RESTORE_HARDENING_DESIGN.md`. A auditoria confirmou backup `.data` diario local, mas backup PostgreSQL diario/offsite e restore drill ainda precisam nascer.

### 78K - Backup Restore Validation MVP

- validar restore em banco temporario;
- medir RTO tecnico inicial;
- identificar defasagem de dump.

Status: executado na Sprint 78K em `docs/saas/BACKUP_RESTORE_VALIDATION.md`.

### 78L - PostgreSQL Backup Hardening

- criar backup PostgreSQL verificavel;
- checksum;
- manifest;
- validacao `pg_restore --list`;
- rejeicao de dump invalido.

Status: implementado na Sprint 78L.

### 78M - Load Test Design

- plano e scripts de carga;
- cenarios Inbox/Public API/Search/Webchat/Telegram;
- baseline atual;
- limites seguros por VPS.

Status: design concluido em `docs/saas/LOAD_TEST_DESIGN.md`. k6 e recomendado como ferramenta MVP, com carga real primeiro em staging/ambiente isolado.

### 78N - Load Test MVP

- scripts k6;
- health/login/public-api/search/inbox-read;
- primeira execucao controlada ate 50 VUs;
- relatorio de resultados.

Status: executado parcialmente na Sprint 78N em `docs/saas/LOAD_TEST_RESULTS.md`. O cenario `health` rodou com 5/10/20/50 VUs por 30s, 0% erro HTTP, PM2 online e memoria estavel. Os cenarios autenticados dependem de credenciais/tokens de teste e devem ser a proxima etapa.

Atualizacao 78N.1: o caminho publico real foi testado externamente ate 20 VUs. `health`, `search` e `inbox list-only` ficaram sem erro HTTP; `login` e `public-api` acionaram protecoes de taxa/sessao. A proxima etapa recomendada e criar fixtures autenticadas adequadas antes de qualquer tuning ou HA.

Atualizacao 78N.3: com `loadtest-prefeitura` e fixtures completas, `health` e `public-api` passaram em `vu5`, mas `login` gerou 91,72% de erro HTTP e acionou alerta interno `runtime:error_rate`. O teste foi abortado conforme regra. O achado nao indica ainda saturacao de CPU/RAM/DB; indica que o plano de carga autenticada deve separar login/setup de sessao do loop principal antes de usar os resultados para decidir capacidade, swap ou HA.

Atualizacao 78N.3 re-run: apos a 78N.4, o login saiu do loop principal. `health vu5` e `public-api vu5` passaram com 0% erro, PM2/RAM/health estaveis. `search vu5` falhou com 41,37% de erro por `401 session_replaced` em token da fixture, acionando `runtime:error_rate`. O achado ainda nao indica saturacao de infraestrutura; indica que as sessoes/tokens de carga precisam ser isolados por VU antes de usar o benchmark para decidir HA ou capacidade.

Atualizacao 78N.5: as fixtures de carga foram ajustadas para respeitar sessao exclusiva por usuario: usuarios de carga app e usuarios de login agora sao separados, `APP_TOKENS_JSON` deve ter pelo menos um token por VU e os cenarios Search/Inbox falham cedo se o pool estiver insuficiente. A decisao de HA continua dependente de uma nova execucao limpa da 78N.3.

Atualizacao 78N.3 re-run final: `health`, `public-api`, `search` e `inbox-read` passaram em `vu5` com 0% erro. A execucao parou em `inbox-detail vu5` por `403 Conversa fora do seu departamento` para tokens de usuarios fora do departamento da conversa fixture. O achado ainda nao indica necessidade de HA; indica ajuste de fixture/ownership antes de medir capacidade.

### 78O - Capacity/Swap Hardening

- baseline operacional registrado em `docs/saas/OPERATIONAL_BASELINE.md`;
- VPS atual: DigitalOcean Droplet, 2 vCPU, 1.967 MiB RAM, 0 MiB swap, disco raiz 58 GiB com 30% de uso;
- PostgreSQL 16.12 em Docker local, DB atual ~80 MB e 11 conexoes no baseline;
- PM2 single instance: frontend ~58 MiB, backend ~215 MiB;
- health publico OK e `/admin/ops/metrics` respondendo;
- build sequencial backend -> frontend formalizado como regra operacional enquanto a VPS permanecer nessa classe de memoria;
- swap aplicado com acesso administrativo: `/swapfile` de 2 GiB, `swappiness=10`, PM2 online e health OK.

Observacao 78N.3: `Capacity/Swap Hardening` continua importante para build/deploy e estabilidade da VPS, mas o primeiro bloqueador do benchmark externo autenticado foi o cenario de login sob repeticao. A decisao de capacidade nao deve ser tomada com base na 78N.3 ate a estrategia de autenticacao estar corrigida.

Observacao 78N.3 re-run: mesmo com login corrigido, a decisao de capacidade ainda nao deve ser tomada porque o teste parou em erro artificial de sessao (`session_replaced`) no Search. A 78O/Capacity-Swap permanece como hardening preventivo da VPS, nao como resposta a saturacao medida.

Observacao 78N.3 final-final: o laboratorio de carga v1 foi encerrado. `health`, `public-api` e `search` passaram ate `vu20`; `inbox-read` passou funcionalmente em `vu20` com 0% erro, mas cruzou p95 `2.085,30 ms` contra threshold `1.500 ms`. Esse gargalo deve ser tratado em investigacao propria de query path; nao faz parte da 78O.

Observacao 78O.1: a auditoria de query path do Inbox confirma que o primeiro gargalo medido e especifico da composicao da listagem. A causa provavel combina overfetch `limit * 10 + 1`, N+1 em runtime state por conversa candidata, filtros/contadores/ordenacao em memoria e queries inbound/outbound com `OR` por `waIdCanonical/waId`. Nao ha indicio de necessidade imediata de PM2 cluster, Nginx tuning, Postgres global tuning ou HA para explicar esse p95.

Observacao 78O.2: o primeiro hardening do Inbox atua no app, nao na infraestrutura: instrumentacao por etapa e batch de runtime state Webchat. A necessidade de indice, tuning Postgres ou HA deve ser reavaliada somente apos nova medicao de `inbox-read vu5/vu10/vu20`.

### 78P - Authenticated Load Test MVP

- scripts k6;
- Login, Public API, Search e Inbox read;
- relatorio de p95/p99/erro/CPU/memoria.

### 78Q - Scale Runtime

- health live/ready/admin;
- externalizar media/storage;
- fila/worker;
- preparar multi-node;
- reduzir dependencia de disco local.

### 78R - HA Runtime

- blue/green ou rolling deploy;
- load balancer;
- Postgres gerenciado/replica;
- failover documentado;
- monitor externo.

## Resultado Da Auditoria

| Pergunta | Resposta |
| --- | --- |
| O que ja existe? | VPS operacional, PM2, Postgres Docker, health, metrics, dashboard, alerts internos, cron de backup/retencao/media cleanup, runbooks e deploy controlado. |
| O que pode ser reaproveitado? | PM2, health, metrics, alert engine, scripts de backup/restore, feature flags, replay/smoke/shadow e runbooks. |
| Onde estao os SPOFs? | VPS unica, Postgres local, volume Docker, disco local, Nginx/TLS, build na producao, cron local, media local e DNS manual. |
| Quais melhorias exigem codigo? | health split, stateless/multi-node, storage compartilhado, fila, pub/sub, cache distribuido e metricas historicas. |
| Quais exigem infra? | segunda instancia, load balancer, Postgres gerenciado/replica, object storage, backup externo, monitor externo e possivel fila gerenciada. |

## Result Report

- Auditoria da arquitetura atual concluida.
- SPOFs identificados e classificados.
- Roadmap de HA definido.
- Roadmap de escala definido.
- Capacity planning inicial definido.
- Disaster recovery definido.
- Nenhuma alteracao funcional foi realizada.
