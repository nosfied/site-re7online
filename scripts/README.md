# Operational Scripts

## `deploy-impact-matrix.sh`

Calcula o impacto de runtime de um range Git:

```bash
scripts/deploy-impact-matrix.sh <base> <head>
scripts/deploy-impact-matrix.sh <base>..<head>
```

O script e somente leitura. Ele nao faz build, reload, deploy, migration ou
alteracao de banco.

Use antes de publicar na VPS para decidir quais artefatos precisam ser
buildados e quais processos PM2 precisam ser recarregados:

- `BACKEND_*`: `re7-whatsapp-agent`
- `WORKER_*`: `re7-whatsapp-web-worker`
- `FRONTEND_*`: `re7-admin-front`

Mudancas em `apps/whatsapp-agent/src/**` sao tratadas de forma conservadora
como impacto em backend e worker, porque o worker transpila modulos do backend
para `apps/whatsapp-web-worker/dist/whatsapp-agent/src`.

Se `REVIEW_REQUIRED=YES`, pare o deploy e classifique o caminho alterado antes
de prosseguir.

## `apps/whatsapp-agent/scripts/deploy-vps.sh`

O deploy da VPS consome a matriz automaticamente:

```bash
apps/whatsapp-agent/scripts/deploy-vps.sh
```

Para revisar sem alterar o checkout nem executar build/reload:

```bash
apps/whatsapp-agent/scripts/deploy-vps.sh --dry-run origin/flow-executor-quote-hardening
```

O deploy integrado faz `git pull --ff-only`, calcula o range publicado, para em
`REVIEW_REQUIRED=YES` ou `UNKNOWN_RUNTIME_IMPACT=YES`, builda todos os runtimes
afetados e somente depois recarrega os processos PM2 correspondentes.

## `operational-retention-report.py`

Rotina LOCAL PARA REVISÃO vinculada ao [runbook canônico](../docs/RUNBOOK_WHATSAPP_AGENT.md#retenção-operacional-permanente). Não instalada na VPS/cron. Não tem apply, subprocess, SQL, provider, PM2 ou exclusão. Inventaria metadados de raízes locais explícitas, sem ler conteúdo nem seguir symlinks; conta blocos únicos por device/inode, registra hardlinks externos e limites. Tamanho igual sugere revisão, não igualdade de hash ou autorização de retirada. Reflinks e snapshots exigem medição própria.

```bash
python3 -B scripts/operational-retention-report.py --root /caminho/local/captura-isolada --output /caminho/privado/relatorio-novo.json --max-entries 100000 --seconds 30 --dry-run
python3 -B -m unittest discover -s scripts -p test_operational_retention_report.py
```

Output deve ser novo, fora das raízes, em diretório privado preexistente; modo600/umask077. Não apontar a fontes com segredos sem captura autorizada e custódia adequada: nomes/metadados também são privados. Stdout contém apenas contagens. Exit2 indica limite/incompletude; erro nega a geração do relatório. Não sobrescreve evidência. Nenhum PASS produtivo deriva deste inventário: capacidade/SQL/WAL/owners/grafo/custódia dependem dos leitores canônicos. Consumir relatórios em revisão semanal/pós-janela, registrar lacunas e completar as provas antes de preparar allowlist/driver.
