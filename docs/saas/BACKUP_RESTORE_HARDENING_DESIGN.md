# Sprint 78J - Backup & Restore Hardening Design

Data: 2026-06-25

Escopo: auditoria e desenho de hardening de backup/restore do Converta, sem codigo, banco, migration, cron novo, alteracao de infraestrutura ou restore real.

## Resumo Executivo

A Sprint 78J confirma que ja existe uma rotina de backup local da pasta `.data`, mas o backup do PostgreSQL operacional ainda depende de dumps manuais/pre-release e nao de rotina diaria formal. Tambem nao ha copia offsite, criptografia formal, checksum, restore drill periodico ou RPO/RTO medido.

Estado atual:

- backup `.data` diario por cron as 03:15;
- retencao local de `.data` por 14 dias;
- media cleanup diario as 03:00;
- retention global diario as 03:30;
- dumps SQL manuais antigos e dumps pre-release em `backups/`;
- PostgreSQL operacional em Docker local;
- `.env`, Nginx, certificados e PM2 nao entram em backup formal documentado;
- backups ficam na mesma VPS.

Classificacao: **ATENDE COM AJUSTE** para operacao controlada; **NAO ATENDE plenamente** para contratos com RPO/RTO formal ate haver backup offsite e restore drill.

## Confirmacao De Nao Alteracao Funcional

Esta sprint nao:

- altera codigo;
- altera banco;
- cria migration;
- altera cron;
- altera infraestrutura;
- executa restore real;
- altera PM2, Docker, Nginx, certificados ou DNS;
- copia secrets;
- envia backup para destino externo.

## Auditoria Dos Backups Atuais

### Scripts

| Script | Funcao atual | Observacao |
| --- | --- | --- |
| `apps/whatsapp-agent/scripts/backup-data.sh` | compacta `.data` em `.backups/YYYYMMDD-HHMMSS.tar.gz` | usa lock com `flock`; aplica retencao local de 14 dias. |
| `apps/whatsapp-agent/scripts/restore-data.sh` | restaura `.data` a partir de `.tar.gz` | exige confirmacao `RESTORE`; move `.data` atual para `.data.pre-restore.*`. |

### Cron Atual

Na VPS, usuario `deploy`:

```text
0 3 * * * media cleanup
15 3 * * * backup-data.sh
30 3 * * * retention:run
```

### Diretorios E Tamanhos Observados

```text
.backups  53 MB
backups   11 MB
.data     12 MB
```

### Backups `.data`

Observado:

- arquivos diarios `.backups/20260610-031501.tar.gz` ate `.backups/20260625-031501.tar.gz`;
- tamanho recente aproximado: 1.4 MB a 1.65 MB;
- `.backups/backup-cron.log` existe;
- `.backups/.backup.lock` existe e tem tamanho 0, esperado para lock.

### Dumps De Banco

Observado:

- dumps SQL antigos na raiz `backup_2026-04-*.sql`;
- dumps em `backups/`;
- alguns dumps pre-release de 2026-06-21 com tamanho 0 antes de um dump valido de ~4.8 MB.

Conclusao: existe pratica de dump antes de migration/pre-release, mas nao ha evidencia de cron diario de PostgreSQL nem validacao automatica de tamanho/checksum.

### Configuracoes

Existem na VPS:

- `.env`;
- `ecosystem.config.cjs`;
- Nginx sites enabled:
  - `admin.re7online.com`;
  - `api.re7online.com`;
  - `converta.re7online.com`;
  - `default`.

Gaps:

- `.env` nao deve ser versionado, mas precisa backup criptografado;
- Nginx e Certbot precisam inventario e copia segura;
- PM2/ecosystem precisa estar em repo e snapshot de `pm2 save` quando aplicavel;
- certificados nao devem ser copiados sem politica de seguranca.

## O Que Ja Existe

| Item | Status |
| --- | --- |
| Backup `.data` diario | Existe |
| Retencao local `.data` | Existe, 14 dias |
| Lock de backup `.data` | Existe |
| Restore `.data` com confirmacao | Existe |
| Dumps DB manuais/pre-release | Existe parcialmente |
| Cron media cleanup | Existe |
| Cron retention | Existe |
| Runbook de deploy com `pg_dump` antes de migration | Existe |
| Backup offsite | Nao evidenciado |
| Restore drill periodico | Nao evidenciado |
| Backup `.env` criptografado | Nao evidenciado |
| Backup Nginx/Certbot formal | Nao evidenciado |
| Backup do volume Docker completo | Nao evidenciado |
| PITR/WAL archiving | Nao evidenciado |

## O Que Pode Ser Reaproveitado

- `backup-data.sh` como base para backup de arquivos locais;
- `restore-data.sh` como base para restore de `.data`;
- runbook com `pg_dump` antes de migrations;
- diretorio `backups/` para dumps controlados;
- cron atual como modelo, sem alterar nesta sprint;
- dashboard/alert engine para futuros alertas de backup antigo/falho;
- checks de health/replay/smoke para validar restore.

## O Que Falta

| Gap | Risco |
| --- | --- |
| Backup diario do PostgreSQL | Alto |
| Copia offsite | Alto |
| Checksum/tamanho minimo | Alto |
| Restore drill periodico | Alto |
| RPO/RTO medidos | Alto |
| Backup criptografado de `.env` | Alto |
| Inventario Nginx/Certbot/PM2 | Medio/alto |
| Politica de descarte seguro | Medio |
| Alertas de backup antigo/falho | Medio/alto |
| Documentacao de responsavel e frequencia | Medio |

## Inventario Alvo

| Componente | Backup atual | Backup alvo |
| --- | --- | --- |
| PostgreSQL | dumps manuais/pre-release | `pg_dump` diario + checksum + offsite; PITR futuro. |
| `.data` | tar diario local por 14 dias | manter local + copiar offsite. |
| Midia/upload | dentro de `.data` quando local | object storage futuro + politica de backup/retencao. |
| Training Center | `TRAINING_CONTENT_ROOT`, quando configurado localmente | incluir no backup de arquivos operacionais ou migrar para object storage com retencao. |
| Support Hub attachments | `SUPPORT_ATTACHMENT_ROOT`, quando configurado localmente | incluir no backup de arquivos operacionais e aplicar retencao alinhada a `Conversation`/suporte; nao reutilizar storage de treinamento. |
| `.env` | nao formal | copia criptografada e acesso restrito. |
| Nginx | nao formal | export de sites available/enabled e configs relevantes. |
| PM2/ecosystem | `ecosystem.config.cjs` no repo | `pm2 save`/dump documentado e ecosystem versionado. |
| Certificados | Certbot local | preferir reemissao via Certbot; backup apenas se politica permitir. |
| Scripts/runbooks | repo Git | repo + release checklist. |
| Logs operacionais | locais | retencao e export futuro, sem PII. |

## RPO/RTO

### Estimativa Atual

| Item | Estimativa |
| --- | --- |
| RPO `.data` | ate 24h, porque backup diario existe. |
| RPO PostgreSQL | indefinido, porque nao ha cron DB diario evidenciado. |
| RTO `.data` | 1-2h se backup local estiver integro. |
| RTO PostgreSQL | indefinido sem restore drill recente. |
| Risco principal | perda da VPS pode levar junto dados e backups locais. |

### Metas Iniciais

| Nivel | RPO alvo | RTO alvo | Requisitos |
| --- | --- | --- | --- |
| Curto prazo | 24h | 4h | dump DB diario + `.data` diario + offsite + restore drill mensal. |
| B2G medio | 4h | 2h | backups mais frequentes, checksum, runbook testado. |
| B2G critico | 15min-1h | < 1h | PITR/WAL, replica/failover e monitor externo. |

## Banco De Dados

### Backup Logico

MVP recomendado:

```text
pg_dump custom format
checksum SHA256
tamanho minimo esperado
retencao local curta
upload offsite
log redigido
```

Politica:

- diario no minimo;
- antes de qualquer migration;
- antes de sprint com schema;
- nunca enviar dump por chat;
- nunca versionar dump no Git;
- validar que o dump nao tem tamanho 0.

### Backup Fisico Futuro

Fase posterior:

- backup base do diretorio de dados;
- cuidado com consistencia do Postgres;
- preferir ferramenta propria ou Postgres gerenciado.

### PITR Futuro

Para contratos com SLA forte:

- habilitar WAL archiving;
- manter backup base + WAL;
- testar restore point-in-time;
- documentar janela de retencao.

### Validacao De Integridade

Checks minimos:

- arquivo existe;
- tamanho > minimo definido;
- checksum gerado;
- `pg_restore --list` funciona para custom format;
- restore em banco isolado pelo menos mensalmente;
- contagens basicas de tabelas criticas.

## Arquivos E Configuracoes

### `.data` E Midia

Manter:

- `backup-data.sh`;
- retencao local de 14 dias;
- lock para evitar concorrencia.

Adicionar futuramente:

- checksum;
- offsite;
- alerta se backup nao gerado;
- alerta se backup muito pequeno;
- inventario de conteudo.

### `.env`

Regra:

- nunca versionar;
- backup criptografado;
- acesso restrito;
- rotacao quando houver suspeita de vazamento.

Modelo:

```text
.env
  -> encrypt
  -> offsite restricted bucket
  -> checksum
  -> access log
```

### Nginx

Backup alvo:

- `/etc/nginx/sites-available`;
- `/etc/nginx/sites-enabled` como inventario de symlinks;
- `nginx -T` redigido quando seguro;
- docs de dominios.

### PM2

Backup alvo:

- `ecosystem.config.cjs` ja versionado;
- `pm2 save` quando usado;
- lista de processos;
- comando de recriacao.

### Certificados

Preferencia:

- reemitir via Certbot e DNS correto.

Se backup for exigido:

- criptografar;
- restringir acesso;
- documentar expiracao/renovacao;
- nao expor private keys.

## Offsite Backup

Opcoes:

| Opcao | Pros | Contras | Recomendacao |
| --- | --- | --- | --- |
| Object Storage S3-compatible | duravel, barato, versionavel | exige credenciais e script | recomendado. |
| Segundo servidor | simples se ja existir | tambem exige hardening | aceitavel curto prazo. |
| Drive manual | facil | pouco confiavel e nao auditavel | nao recomendado para producao. |
| Postgres gerenciado com backup | reduz operacao | custo e migracao | recomendado para B2G maior. |

Requisitos:

- criptografia em repouso;
- credenciais fora do Git;
- retencao configurada;
- versionamento/lifecycle;
- checksum;
- teste de download;
- alerta de falha.

## Runbook De Restore Alvo

### Preparacao

1. declarar incidente;
2. congelar deploys;
3. selecionar backup validado;
4. registrar RPO estimado;
5. preparar ambiente isolado ou host de recuperacao.

### Restore DB

1. parar backend/PM2 se for restore em producao;
2. criar banco alvo limpo;
3. restaurar dump;
4. rodar `prisma migrate status`;
5. validar contagens basicas;
6. validar indices/migrations.

### Restore Arquivos

1. restaurar `.data`;
2. restaurar media se aplicavel;
3. restaurar `.env` criptografado/descriptografado em ambiente seguro;
4. restaurar Nginx/PM2/config quando necessario;
5. validar permissoes.

### Subida

1. `prisma generate`;
2. build sequencial se necessario;
3. iniciar PM2;
4. validar `/health`;
5. validar `/app/login`;
6. validar `/app/inbox`;
7. validar Public API health;
8. validar replay/smoke read-only;
9. registrar RTO real.

## Sprint 78K - Restore Validation MVP

Sem tocar producao como alvo de restore.

Escopo futuro:

- criar banco temporario isolado;
- restaurar ultimo dump valido;
- validar `prisma migrate status`;
- rodar contagens;
- validar `.data` tar com listagem;
- medir tempo;
- gerar relatorio;
- nao apontar PM2/producao para o banco restaurado.

## Seguranca

Regras:

- dumps podem conter PII e mensagens;
- `.env` contem secrets;
- backups devem ser criptografados antes de sair da VPS;
- acesso deve ser minimo e auditavel;
- descarte deve apagar local temporario;
- logs nao devem imprimir segredo, URL assinada ou conteudo de dump;
- chaves de backup devem ter rotacao.

## Alertas Futuros

Eventos/alertas recomendados:

- `backup.not_created`;
- `backup.too_old`;
- `backup.too_small`;
- `backup.checksum_failed`;
- `backup.offsite_upload_failed`;
- `backup.restore_validation_failed`;
- `backup.restore_validation_stale`.

Thresholds iniciais:

| Alerta | Condicao |
| --- | --- |
| backup antigo | ultimo DB backup > 24h |
| backup `.data` antigo | ultimo tar > 24h |
| backup muito pequeno | tamanho < baseline minimo |
| offsite falhou | upload sem sucesso |
| restore nao validado | ultimo drill > 30 dias |

## Roadmap

### 78K - Backup Restore Validation MVP

- inventariar ultimo backup;
- validar tamanho/checksum;
- restaurar DB em ambiente isolado;
- listar `.data` tar;
- medir RTO tecnico;
- documentar resultado.

Status: executado na Sprint 78K e documentado em `docs/saas/BACKUP_RESTORE_VALIDATION.md`. O restore tecnico em banco temporario funcionou, mas o dump valido mais recente esta atrasado contra o schema atual, com 9 migrations pendentes. A proxima etapa deve criar backup PostgreSQL diario atual antes de offsite/HA.

### Decisao Arquitetural 2026-06

```text
Restore:
VALIDADO

Backup PostgreSQL:
AINDA NAO ATENDE
```

Motivo:

- existe restore funcional;
- o dump validado na 78K estava defasado contra o schema atual;
- nao havia evidencia de dump PostgreSQL diario atualizado;
- checksum, rejeicao automatica de dump invalido, manifest e validacao pos-backup ainda nao eram obrigatorios;
- copia offsite ainda precisa sprint propria.

Decisao: Alta Disponibilidade e Load Test ficam temporariamente abaixo da prioridade de Backup Hardening ate o backup PostgreSQL virar ponto de recuperacao confiavel.

### 78L - PostgreSQL Backup Hardening

Status: implementado no repo como rotina de backup PostgreSQL verificavel, sem alterar restore e sem alterar infraestrutura.

Artefatos:

- `apps/whatsapp-agent/scripts/backup-postgres.sh`;
- `npm run backup:postgres`;
- `apps/whatsapp-agent/scripts/cron-setup.txt` atualizado com linha de cron recomendada.

O que foi reaproveitado:

- padrao operacional de `backup-data.sh`;
- diretorio `backups/`;
- Postgres local em Docker `wa-agent-postgres`;
- `pg_dump` em formato custom;
- `pg_restore --list` como validacao leve pos-backup;
- cron atual como referencia, sem editar crontab de producao nesta etapa.

O que foi criado/corrigido:

- dump PostgreSQL em formato custom `.dump`;
- checksum SHA-256 ao lado do dump;
- manifest JSONL em `backups/postgres/manifest.jsonl`;
- rejeicao de dump vazio, abaixo do tamanho minimo ou invalido;
- validacao por `pg_restore --list`;
- quantidade minima de objetos antes de promover o arquivo final;
- lock para evitar concorrencia;
- retencao local parametrizavel;
- logs padronizados com eventos:
  - `backup.started`;
  - `backup.success`;
  - `backup.failed`;
  - `backup.invalid`;
  - `backup.skipped`.

Variaveis operacionais:

| Variavel | Default | Uso |
| --- | --- | --- |
| `POSTGRES_BACKUP_DIR` | `apps/whatsapp-agent/backups/postgres` | destino dos dumps. |
| `POSTGRES_BACKUP_RETENTION_DAYS` | `14` | retencao local. |
| `POSTGRES_BACKUP_MIN_BYTES` | `1024` | tamanho minimo aceitavel. |
| `POSTGRES_BACKUP_MIN_OBJECTS` | `50` | minimo de objetos em `pg_restore --list`. |
| `POSTGRES_BACKUP_MODE` | `auto` | `auto`, `docker` ou `local`. |
| `POSTGRES_BACKUP_DOCKER_CONTAINER` | `wa-agent-postgres` | container PostgreSQL em producao. |
| `POSTGRES_BACKUP_DB_NAME` | `whatsapp_agent` | banco alvo em modo Docker. |
| `POSTGRES_BACKUP_DB_USER` | `wa_agent` | usuario em modo Docker. |

Cron recomendado:

```text
20 3 * * * cd /opt/re7online/site-re7online/apps/whatsapp-agent && npm run backup:postgres >> /opt/re7online/site-re7online/apps/whatsapp-agent/backups/postgres/postgres-backup-cron.log 2>&1
```

O que ainda falta:

- ativar cron em producao depois do pre-release;
- configurar destino offsite real em producao;
- alerta persistente/externo se backup falhar ou envelhecer;
- executar restore drill recorrente usando o dump diario atual;
- backup criptografado de `.env`, Nginx, PM2 e inventario de certificados.

### 83E - Backup Offsite & Restore Drill Evidence

Status: implementado como hardening operacional minimo, sem schema, sem credenciais reais e sem fornecedor obrigatorio.

Artefatos:

- `apps/whatsapp-agent/scripts/backup-postgres.sh`;
- `npm run backup:postgres`;
- `npm run backup:evidence`;
- `apps/whatsapp-agent/src/ops/backupEvidence.ts`.

O que foi adicionado:

- destino offsite opcional por `POSTGRES_BACKUP_OFFSITE_TARGET`;
- suporte a destino montado/local (`file://` ou caminho), `rclone:<remote:path>` e `scp:<usuario@host:/caminho>`;
- campos `offsiteStatus` e `offsiteTarget` no manifest JSONL;
- falha explicita `backup.offsite_upload_failed` quando offsite configurado falha;
- avaliacao operacional de backup ausente, antigo, sem checksum, pequeno, sem objeto ou sem offsite;
- registro JSONL de restore drill sem restaurar sobre producao e com redaction de dados sensiveis.

Variaveis adicionais:

| Variavel | Default | Uso |
| --- | --- | --- |
| `POSTGRES_BACKUP_OFFSITE_TARGET` | vazio | destino offsite opcional. Quando vazio, backup continua local e registra `offsiteStatus=not_configured`. |

Comandos operacionais:

```bash
npm run backup:postgres
npm run backup:evidence -- status --manifest backups/postgres/manifest.jsonl --require-offsite
npm run backup:evidence -- restore-drill --backup-file backups/postgres/<arquivo>.dump --sha256-file backups/postgres/<arquivo>.dump.sha256 --restored-into restore_validation_<data>
```

Limites:

- nao configura credenciais reais;
- nao contrata servico externo;
- nao cria persistencia no banco;
- nao substitui alerta externo/persistente;
- nao executa restore automaticamente.

### 78M - Load Test Design

- desenhar carga por Inbox, Public API, Search, Webchat e Telegram;
- definir baseline e limites.

### 78N - Capacity/Swap Hardening

- avaliar swap;
- builds sequenciais;
- separar build de runtime;
- definir limites de memoria.

### 78O - HA Runtime Plan

- load balancer;
- segunda instancia;
- storage externo;
- Postgres gerenciado/replica;
- failover.

## Result Report

- Auditoria dos backups atuais concluida.
- RPO/RTO definidos.
- Runbook de restore desenhado.
- Offsite backup desenhado.
- Riscos identificados.
- Roadmap definido.
- Nenhuma alteracao funcional ou de infraestrutura foi realizada.
