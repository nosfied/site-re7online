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

## Release por artefato

Quando o runtime ativo for uma composição autenticada, e não um checkout Git
integral, não usar o fluxo `deploy-vps.sh` como substituto. O contrato de build
off-host, seleção PM2, provas nomeadas e rollback está em
[`docs/saas/ARTIFACT_RELEASE_RUNBOOK.md`](../docs/saas/ARTIFACT_RELEASE_RUNBOOK.md).
O registro sanitizado da promoção CRM/CSV é conferido por
`scripts/ci/verify-deployment-record.py`. O validador não acessa produção e não
executa PM2, rede, banco ou importação.

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

## `operational_preparers_v3.py`

**Conexão concluída aos adapters futuros, validada LOCALMENTE — não instalada na VPS.**
Versão nova, separada dos preparadores históricos. Importa o coordenador de7bd069e7
por hash fixo, sem reescrever esse arquivo ou os componentes reutilizados.

Entrypoints `prepare_api`/`prepare_frontend`: lock local exclusivo, gate completo,
sidecar `before.private.json`, intent próprio de operações e novo gate antes de cada
copy/build/tar. Fontes, orçamento, identidade ou referências incompletos negam antes
da primeira cópia. Drift entre operações preserva a geração parcial e bloqueia a
próxima operação. Geração existente não é reutilizada. REUSE impede cópia/build/tar
redundantes. CLI permite só copiar arquivos compilados aprovados e empacotar nomes
literais locais; não possui runner funcional de build. A fronteira Python de build
foi ensaiada com hook sintético (negativa impede sua chamada), sem build funcional.
Nenhum entrypoint/PM2/provider/scheduler/SSH ou sequenciador é importado/executado.

Entrypoints `close_auth`/`close_database`: gate de capturas/coordenador, leitura do
journal canônico e sidecar novo de encerramento. CONSUMED exige `complete`, geração38
e ausência de falha posterior; banco exige recibo VERIFIED/NEWDB sem reativação OLDDB
com planHash exato. Dependências alcançadas, launcher consumido e evidências seguem
HOST_REQUIRED; histórico com custódia/restore comprovados pode ser ARCHIVABLE_FOR_REVIEW.
Sem custódia fica UNRESOLVED. Não autoriza retorno, retirada, ALTER ROLE ou reexecução.
Estados REFUSED/SUPERSEDED exigem disposição explícita; não são sucesso de rotação.

```bash
sha256sum -c scripts/operational_preparers_v3.sha256
python3 -B -m unittest discover -s scripts -p test_operational_preparers_v3.py
python3 -B scripts/operational_preparers_v3.py --adapter api --input /custodia/privada/api-adapter-input.private.json --input-sha256 SHA_REVISADO --output /custodia/privada/futuras-geracoes --local-only
python3 -B scripts/operational_preparers_v3.py --adapter frontend --input /custodia/privada/frontend-adapter-input.private.json --input-sha256 SHA_REVISADO --output /custodia/privada/futuras-geracoes --local-only
python3 -B scripts/operational_preparers_v3.py --adapter auth --input /custodia/privada/auth-closure-input.private.json --input-sha256 SHA_REVISADO --output /custodia/privada/auth-closure-novo.private.json --local-only
python3 -B scripts/operational_preparers_v3.py --adapter database --input /custodia/privada/db-closure-input.private.json --input-sha256 SHA_REVISADO --output /custodia/privada/db-closure-novo.private.json --local-only
```

Os comandos são contratos de uso em **ambiente local isolado**, não blocos prontos de
janela produtiva. Não existe input produtivo novo selado por esta tarefa. `--output`
é pai privado700 para staging ou arquivo novo em pai700 para encerramento. Recusa antes de copiar registra REFUSED em sidecar próprio no pai; seu nome
impede reutilizar a geração negada. Recusa/parcial: conservar stdout e diretório/intent; não repetir nem modificar input para obter PASS.
Não criar inputs por edição de baselines históricas para fazer capturas coincidir.

Input adicional ao coordenador anterior:

- `review`: input do coordenador (estado READY/REVIEW para preparar, CONSUMED/
  REFUSED/SUPERSEDED para encerrar), fontes originais/dependências/runtime e revisão.
- `captureBindings` contém exatamente `contextObservation` e `capacitySamples`:
  cada entrada fixa capturePath/sha256/valuePointer/timePointer. Ponteiros JSON
  selecionam fatos dos exports canônicos existentes; os campos correspondentes
  fornecidos em `review` são substituídos pelos bytes capturados, sem adaptação para
  PASS. É preciso haver as duas observações completas/identidades no export original;
  se o reader não as registrou, não inventar nem duplicar uma observação.
- `maxCaptureAgeSeconds`: limite explícito até3600s, verificado contra relógio atual
  antes de cada operação. Timestamp ISO com timezone ou epoch original. Campo
  ausente, hash/proprietário/modo divergente, futuro ou vencido nega. Contexto/frescor
  de fixtures não é certificado produtivo; CLI rejeita relógio sintético.
- `savedFallback`: dois exports privados600 com role saved/fallback, capturePath e
  hash. Os mesmos hashes precisam integrar raízes/fontes originais do grafo nos
  caminhos canônicos dump.pm2/dump.pm2.bak. Leitor reutilizado observa cada fonte
  duas vezes; o adapter não invoca PM2 de root e não copia config para console.
- `operations`: kind copy/build/tar, name único, artifactIndex no plano de reuso,
  reason, allocatedBudgetBytes, e linkContractReviewed se houver novos links.
  Copy fixa source/sourceSha256/target literal; tar fixa members/memberSha256/target
  literais. A cópia densa é orçada antes do primeiro efeito, inclusive fonte sparse.
  Reuso de compilado não autoriza nova cópia sem justificativa/contrato.
- `closure`: generationPath da fase (nome igual ao review.generation), journal
  com capturePath/hash/originalPath exato window/sequencer.journal.jsonl; banco
  inclui databaseReceipt com originalPath da mesma fase e expectedPlanSha256. Journal/recibo de fase concluída podem ser históricos para
  classificar aquela fase; contexto/capacidade/referências exigem capturas atuais.

Registro posterior mede alocação local incluindo evidências, nega orçamento excedido
e preserva parcial. Não equivale a medição posterior deploy/PostgreSQL: executá-la
pelo procedimento canônico quando uma geração remota futura for autorizada. Bases
reais permanecem externas/privadas; importação de seu formato/hash não atesta presença
atual. Logs, controles, segredos, tenants e terceiros não entram em allowlist aqui.
