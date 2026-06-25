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

### 78K - Load Test

- plano e scripts de carga;
- cenarios Inbox/Public API/Search/Webchat/Telegram;
- baseline atual;
- limites seguros por VPS.

### 78L - Scale Runtime

- health live/ready/admin;
- externalizar media/storage;
- fila/worker;
- preparar multi-node;
- reduzir dependencia de disco local.

### 78M - HA Runtime

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
