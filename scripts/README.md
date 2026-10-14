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

## `operational_preparation_review.py`

Versão futura revisável de preparação local, conectando os cinco gates de retenção.
Reutiliza, por hashes fixos, `capacity_budget.budget`, `saved_reference_capture.observe`
e `third-withdrawal/references.Resolver`; não modifica esses leitores ou preparadores
históricos. Integra o inventário local e gera somente sidecar novo600, em diretório
preexistente do executor700. Nunca copia/builda/compacta artefatos, captura PM2/root,
executa SSH, altera credenciais, instala políticas ou certifica produção.

```bash
python3 -B scripts/operational_preparation_review.py --input /custodia/privada/preparation-input.private.json --input-sha256 SHA256_REVISADO --output /custodia/privada/review-sidecar-novo.private.json --dry-run
python3 -B -m unittest discover -s scripts -p 'test_operational*.py'
sha256sum -c scripts/operational_preparation_review.sha256
```

O input é privado600 do executor, com SHA esperado. Contrato da versão local:

- `localOnly:true`, `generation`, `purpose`, `state`, `responsible`, `owner`,
  `lastReview` e `nextReview` (prazo máximo sete dias).
- `artifacts`: `expected` contém sha256/runtime/dependenciesSha256/contract;
  `existing` contém os mesmos campos, `path` e `dependenciesCapturePath` privado.
  Confere bytes reais e manifesto de dependências. `reusePermitted` permite REUSE;
  cópia proposta exige `justification` e `newCopyAllocatedBytes`; `newLinks` exige
  `linkContractReviewed:true`. Não faz a cópia nem muda contratos selados.
- `capacitySamples`: filesystem/executor(deploy/postgres)/availableBytes/atUtc,
  complete/freshForReview/walAndGrowthReviewed/writeErrors. `budgets` por filesystem
  registra fase/reserveSource e rubricas não sobrepostas canonicalReserveBytes,
  stagingBytes/returnBytes/backupBytes/walGrowthBytes/evidenceBytes. Mantém mínimo
  entre executores por FS; não empresta espaço de outro FS. Dados exportados não
  são medição fresca automática; a revisão da janela precisa renová-los.
- `referenceNodes`, `referenceRoots`, `referenceSources`: path original,
  capturePath privado/hash exato e link quando houver. Grafo transitivo reaproveitado;
  binding ambíguo, hash divergente ou fonte alcançada ausente negam. Sources devem
  incluir manifests/launchers/cwd/saved/fallback/boot/cron/políticas necessários,
  não somente arquivos convenientes. A rotina não descobre raízes omitidas.
- `expectedContext`: uid do usuário PM2 e processes (PID/start ticks/configSha/envSha);
  `contextObservation`: pm2CaptureUid e duas samples completas/processes/incomplete.
  Compara exportações, sem invocar PM2 nem ler ambiente. As capturas deploy/kernel
  autorizadas continuam necessárias; igualdade de fixture não prova estado real.
- `inventoryRoots` locais, limitadas; `materials`: path/kind/neededOnHost e custody
  (locator/indexSha256/contentSha256/ownerAccessible/restoreVerified). Mantém ativos,
  dependências de gerações consumidas e controles/evidências; sem custódia deixa
  UNRESOLVED. ARCHIVABLE_FOR_REVIEW nunca equivale a autorização de retirada.

Resultado LOCAL_PREPARATION_REVIEW_PASS/productionCertified:false/executionAuthorized:false.
O sidecar registra decisões, referências/proveniência, alocação por device e revisão.
Não sobrescreve recibos/sidecars. O plano de cópia deve caber na rubrica de staging.
Capturas/fontes falsas, incompletas ou omitidas não são validadas por um input autoafirmado:
revisão humana e prova produtiva canônica continuam indispensáveis. Estatísticas st_blocks
não comprovam espaço recuperável exclusivo de reflinks/snapshots. Esta versão integra
os gates LOCALMENTE; ligação aos pontos de staging/encerramento API/frontend/auth/banco
é trabalho futuro revisado, em novas gerações. Sem cron ativo.
