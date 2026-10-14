# Operational Baseline

Status: baseline operacional permanente do Converta.

Ultima atualizacao: 2026-06-27, Sprint 78O - Capacity & Swap Hardening concluida.

Este documento registra a fotografia oficial de producao para comparar futuras mudancas de capacidade, VPS, HA, banco, build, backup e laboratorio de carga. Ele nao altera runtime, banco, infraestrutura ou comportamento funcional.

## Decisao De Fase

```text
Fase I  - Arquitetura e funcionalidades: encerrada
Fase II - Observabilidade, seguranca e laboratorio de carga: encerrada
Fase III - Hardening Operacional: iniciada na 78O
```

## Auditoria De Reaproveitamento

| Area | Ja existe | Reaproveitamento na 78O |
| --- | --- | --- |
| HA/escala | `HIGH_AVAILABILITY_SCALE_DESIGN.md` | fonte para SPOFs, roadmap e capacidade inicial. |
| Observabilidade | `OBSERVABILITY_OPERATIONS_AUDIT.md` | fonte para health, PM2, metricas e alertas. |
| Carga | `LOAD_TEST_RESULTS.md` e `LOAD_TEST_DESIGN.md` | fonte para resultado final do laboratorio v1 e gargalo `inbox-read`. |
| Release | `RELEASE_CHECKLIST.md` | fonte para build sequencial e smoke operacional. |
| Metricas | `/admin/ops/metrics` | snapshot operacional em memoria. |
| Alertas | `/admin/ops/alerts` | snapshot de AlertManager interno. |
| Processo | PM2 | estado de backend/frontend e consumo de memoria. |
| Banco | PostgreSQL Docker local | baseline de versao, tamanho e conexoes. |

Nao foram criados mecanismos paralelos de observabilidade, carga, alerta, PM2, banco ou deploy.

## Ambiente Atual

Baseline inicial coletado em 2026-06-27 12:27 UTC.

```text
host: re7online-api-01
provider/model: DigitalOcean Droplet
OS: Ubuntu 24.04.3 LTS
kernel: 6.8.0-71-generic
virtualization: kvm
uptime: 142 dias
CPU: 2 vCPU
RAM: 1.967 MiB
swap inicial: 0 MiB
swap atual: 2 GiB
swappiness: 10
disco raiz: 58 GiB
uso do disco raiz: 17 GiB / 58 GiB (30%)
```

Load average no baseline:

```text
1m: 2.79
5m: 2.53
15m: 2.14
```

Memoria no baseline:

```text
Mem total:      1.967 MiB
Mem used:         969 MiB
Mem free:         133 MiB
Buff/cache:     1.173 MiB
Mem available:   998 MiB
Swap total:        0 MiB no baseline inicial
```

I/O observado por `vmstat 1 3`:

```text
wa: 0-1%
bi: pico curto de 1016 blocos/s
bo: 0 blocos/s na janela
```

Leitura: nao houve evidencia de I/O wait sustentado no baseline curto da 78O.

## PM2

```text
re7-admin-front
status: online
mode: fork
pid: 3779746
restarts: 526
memoria: ~58 MiB
cpu: ~0.2%

re7-whatsapp-agent
status: online
mode: fork
pid: 4164652
restarts: 573
memoria: ~215 MiB
cpu: variavel no snapshot, ~29.3%
```

Decisao operacional: manter PM2 single instance nesta sprint. PM2 cluster, HA e tuning de processo continuam fora do escopo da 78O.

Validacao pos-swap em 2026-06-27 13:06 UTC:

```text
re7-admin-front: online, ~59.0 MiB
re7-whatsapp-agent: online, ~211.4 MiB
```

## PostgreSQL

```text
container: wa-agent-postgres
status: Up, healthy
porta: 127.0.0.1:5432
versao: PostgreSQL 16.12
tamanho DB atual: 80 MB
conexoes no baseline: 11
```

Decisao operacional: nao alterar PostgreSQL, parametros, indices, queries, volumes ou Docker nesta sprint.

## Runtime

Health publico:

```json
{"ok":true,"db":"ok","uptime":46979}
```

Health pos-swap em 2026-06-27 13:06 UTC:

```json
{"ok":true,"db":"ok","uptime":49271}
```

Metricas internas:

```text
counters: 113
gauges: 17
timings: 162
process.rss: 222.9 MB
heapUsed: 38.3 MB
```

Alertas:

```text
active: 1
source: runtime
severity: ERROR
metadata: errorCount=222, threshold=10
```

Leitura: o alerta ativo e acumulado do laboratorio de carga anterior. Antes de comparar hardenings futuros, registrar baseline ou reiniciar/limpar alertas conforme runbook da sprint.

## Laboratorio De Carga v1

Estado oficial apos 78N.3 final-final:

| Cenario | Resultado |
| --- | --- |
| `health` | PASS ate `vu20` |
| `public-api` | PASS ate `vu20` |
| `search` | PASS ate `vu20` |
| `inbox-detail` | PASS ate `vu10`; `vu20` nao executado por regra de parada |
| `inbox-read` | funcional ate `vu20`, mas p95 `2.085,30 ms` contra threshold `1.500 ms` |

Conclusao:

- o laboratorio de carga v1 esta representativo;
- autenticacao, sessoes, RBAC e fixtures foram estabilizados;
- o primeiro gargalo real medido e `inbox-read` em `20 VUs`;
- a 78O e hardening preventivo da VPS, nao correcao do `inbox-read`.

## Build Operacional

Regra institucional a partir da 78O:

```text
backend build
        then
frontend build
```

Enquanto a VPS permanecer com cerca de 2 GiB de RAM, builds backend/frontend nao devem ser executados em paralelo. O objetivo e reduzir risco de OOM Killer (`137`) durante deploy.

## Swap

Estado atual:

```text
swap: 2 GiB
arquivo: /swapfile
uso no smoke: 780 KiB
swappiness: 10
```

Objetivo da 78O:

```text
reduzir risco de OOM
nao aumentar performance
```

Status de execucao:

- baseline auditado;
- `sudo -n true` com usuario `deploy` retornou `sudo: a password is required`;
- swap aplicado posteriormente com usuario administrativo/root;
- validacao confirmou `/swapfile` ativo, PM2 online e health OK.

Comandos de referencia usados para o hardening:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
swapon --show
free -m
```

Persistencia sugerida:

```text
/swapfile none swap sw 0 0
```

Parametro conservador sugerido:

```bash
sudo sysctl vm.swappiness=10
```

Persistencia sugerida:

```text
vm.swappiness=10
```

Critico: aplicar somente com acesso administrativo consciente, apos confirmar disco livre e rollback (`sudo swapoff /swapfile`) disponivel.

## Headroom Operacional

No baseline da 78O:

| Item | Valor |
| --- | ---: |
| RAM total | 1.967 MiB |
| RAM available | 998 MiB |
| PM2 backend | ~215 MiB |
| PM2 frontend | ~58 MiB |
| Runtime metrics RSS | ~223 MB |
| PostgreSQL DB size | 80 MB |
| Swap | 2 GiB |

Leitura:

- a VPS opera com margem normal em repouso;
- o risco principal nao e saturacao em idle, mas picos de build/deploy/processamento; o swap reduz risco de OOM, nao substitui HA ou aumento real de RAM;
- `inbox-read` deve ser investigado separadamente em 78O.1, sem misturar com swap/capacity.

## Fora Do Escopo Da 78O

A 78O nao altera:

- Inbox;
- Search;
- PM2 Cluster;
- Redis;
- cache;
- Nginx;
- Cloudflare;
- PostgreSQL tuning;
- indices;
- query optimization;
- HA;
- load test;
- regras multitenant;
- runtime funcional.

## Smoke Pos-Hardening

Validacao executada apos aplicacao do swap:

```text
health publico OK
PM2 backend/frontend online
free -h mostra Swap 2.0 GiB
swapon --show mostra /swapfile
swappiness = 10
```

Nao executar carga nesta sprint.

## Proximos Itens

1. Abrir `78O.1 - Inbox Read Query Path Investigation` para investigar p95 `2.085,30 ms` em `20 VUs`.
2. Manter `OPERATIONAL_BASELINE.md` atualizado em toda mudanca de VPS, swap, PM2, PostgreSQL, build, HA ou laboratorio de carga.
3. Continuar build sequencial backend -> frontend enquanto a VPS permanecer nessa classe de memoria.

## Capacidade e retenção operacional

Regra permanente; as fotografias datadas acima continuam históricas. Seguir os
[princípios](CHANGE_POLICY.md#princípios-permanentes-de-retenção-operacional) e o
[procedimento único](../RUNBOOK_WHATSAPP_AGENT.md#retenção-operacional-permanente).

Antes e depois de staging, registrar UTC/Fortaleza, filesystem real de cada raiz,
PGDATA, pg_wal, tablespaces e ledger; bytes disponíveis aos executores deploy e
PostgreSQL, inodes, crescimento observado, slots/retenção/archive de WAL e erros de
escrita recentes. Amostra ausente, concorrente ou incompleta não recebe PASS integral.
Usar mínimo deploy/PostgreSQL quando compartilham filesystem; em filesystems distintos,
validar separadamente cada orçamento, sem somar espaço não intercambiável.

Contabilizar alocação única por (filesystem/device,inode), usando blocos alocados;
hardlinks não multiplicam conteúdo recuperável. Registrar nlink e aliases fora do
escopo: remover um nome com outro link preservado não libera o conteúdo. Symlink é
objeto distinto; não percorrer destino externo. Reflinks, compressão ou snapshots
compartilhados exigem medição própria: st_blocks não prova recuperação exclusiva.

O orçamento identifica fonte/versão da reserva canônica, operação, candidato,
retorno completo, backup/RPO, crescimento/WAL no horizonte da janela e evidências.
Não duplicar rubricas sobrepostas nem reduzir reserva para obter PASS. Piso bancário,
reserva auth, margem de 4GiB do primeiro lote e piso pós-retirada6.468.665.344B são
valores datados de fases/lotes, não um mínimo universal para todas as gerações.

Gatilhos manuais: bloquear novo staging se disponível menos orçamento não preservar
reserva aplicável; revisão imediata se forecast de crescimento/WAL atingir a reserva
antes da próxima revisão semanal, se inodes ameaçarem o orçamento, houver erro de
escrita ou observação incompleta. Cache npm acima de1GiB dispara relatório/revisão,
não prune. Registrar limiar, horizonte, taxa/amostras e responsável por operação;
sem série de crescimento, declarar lacuna e medir antes de atestar folga durável.
Não há cron, alerta automático ou política de exclusão ativados por este documento.
