# Operational Scripts

> [!IMPORTANT]
> O procedimento vigente está em [DEPLOY_RUNBOOK.md](../docs/saas/DEPLOY_RUNBOOK.md)
> e o estado ativo em [CURRENT_STATE.md](../docs/saas/CURRENT_STATE.md).
> O padrão autorizado é build na VPS, em worktree e saída isolados, seguido de
> seleção pelos caminhos estáveis e restart dirigido dos registros PM2 existentes.

## `converta-release.py` — produtor build-once

Constrói e verifica uma release imutável de API e frontend no worktree isolado da
VPS. Builder externo é alternativa mediante decisão específica. Expõe somente
`build` e `verify`, exige worktree limpo no target exato, Node `v20.20.0`,
`SOURCE_DATE_EPOCH` explícito, saída nova e os componentes `api,frontend`.

O produtor executa `npm ci`, Prisma generate e cada build exatamente uma vez;
preserva o BUILD_ID produzido e materializa `api-runtime`, `frontend-runtime`,
`manifest.json` e `index.sha256`. Exige extração independente idêntica antes de
publicar o pacote. Builds independentes podem gerar outro BUILD_ID e constituem
outra release. O empacotamento do mesmo payload congelado é reprodutível.

A denylist de dados operacionais não remove diretórios internos de dependências
sob `node_modules`, como `openai/resources/uploads`. Falhas de subprocesso geram
evidência privada, sem publicar conteúdo em stdout ou Git. O produtor não faz
seleção de runtime, PM2, migration, SQL operacional, chamadas Meta ou envios.

## `converta-deploy.py` — histórico, sem requalificação

As tentativas encerradas em 24/10/2026 ficam preservadas como evidência.
Este driver não é a rota vigente de ativação e seus comandos não devem ser
executados como continuação de uma janela nova. A ativação comprovada usa troca
atômica dos symlinks e restart dos registros PM2 existentes sem `--update-env`,
seguindo exclusivamente o [runbook](../docs/saas/DEPLOY_RUNBOOK.md).

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

## `apps/whatsapp-agent/scripts/deploy-vps.sh` — histórico/obsoleto

Este script antigo de checkout/build no runtime ativo não é utilizável para deploy
normal. Isso não proíbe o build isolado na VPS definido no runbook vigente. Os comandos
abaixo permanecem apenas como registro histórico:

```bash
apps/whatsapp-agent/scripts/deploy-vps.sh
```

Para revisar sem alterar o checkout nem executar build/reload:

```bash
apps/whatsapp-agent/scripts/deploy-vps.sh --dry-run origin/flow-executor-quote-hardening
```

O fluxo histórico descrito fazia `git pull --ff-only`, calculava o range e parava em
`REVIEW_REQUIRED=YES` ou `UNKNOWN_RUNTIME_IMPACT=YES`, buildava os runtimes afetados e depois recarregava os processos PM2.
Esses exemplos não são comandos da rota vigente.

## Release por artefato — histórico

O runbook artifact-bound preserva tentativas anteriores e não é a rota normal. A
instrução executável vigente está em
[`docs/saas/DEPLOY_RUNBOOK.md`](../docs/saas/DEPLOY_RUNBOOK.md).
O registro sanitizado da promoção CRM/CSV é conferido por
`scripts/ci/verify-deployment-record.py`. O validador não acessa produção e não
executa PM2, rede, banco ou importação.

## `pm2-definition-control.py`

Constrói e valida descritores PM2 a partir de request e artefato-fonte privados
`0600`. A request escolhe somente um subconjunto da allowlist por componente mantida
no repositório. Estrutura e valores ficam no artefato físico, cujo SHA-256 esperado
vem de um registro autenticado externo. O comando nunca imprime valores de ambiente.

A allowlist schema v2 é separada por papel: `common` vale para candidato e retorno,
`candidate` somente para a nova release e `rollbackCompatibility` somente para
reproduzir uma definição anterior autenticada. Uma chave exclusiva de rollback é
negada no candidato. A fonte continua obrigada a conter exatamente o subconjunto
pedido; compatibilidade não permite inventar uma chave ausente nem filtrar a fonte.

A superfície de runtime da API observada na fonte produtiva e comprovada por
consumidores estáticos está registrada, somente por nomes e classificação, em
[`pm2-api-runtime-env-surface.sanitized.json`](ci/fixtures/pm2-api-runtime-env-surface.sanitized.json).
As 66 chaves reconciliadas são controles ou configurações funcionais usados em
produção e pertencem a `api.common`: o candidato e o retorno podem selecioná-las,
mas cada fonte privada continua obrigada a fornecer exatamente o subconjunto
escolhido. A allowlist não autoriza ambiente integral. Nomes desconhecidos, hooks de
teste, campos estruturais PM2, internos `pm_*` e colisões NFKC/casefold continuam
negados.

```bash
python3 scripts/pm2-definition-control.py build \
  --request /custodia/privada/frontend-candidate.request.private.json \
  --source-artifact /custodia/privada/frontend-candidate.source.private.json \
  --source-sha256 SHA256_AUTENTICADO_DA_FONTE \
  --output /custodia/privada/frontend-candidate.pm2.private.json
python3 scripts/pm2-definition-control.py validate \
  --request /custodia/privada/frontend-candidate.request.private.json \
  --source-artifact /custodia/privada/frontend-candidate.source.private.json \
  --source-sha256 SHA256_AUTENTICADO_DA_FONTE \
  --definition /custodia/privada/frontend-candidate.pm2.private.json
python3 scripts/pm2-definition-control.py validate-pair \
  --candidate-request /custodia/privada/frontend-candidate.request.private.json \
  --candidate-source-artifact /custodia/privada/frontend-candidate.source.private.json \
  --candidate-source-sha256 SHA256_AUTENTICADO_CANDIDATO \
  --candidate-definition /custodia/privada/frontend-candidate.pm2.private.json \
  --rollback-request /custodia/privada/frontend-rollback.request.private.json \
  --rollback-source-artifact /custodia/privada/frontend-rollback.source.private.json \
  --rollback-source-sha256 SHA256_AUTENTICADO_ROLLBACK \
  --rollback-definition /custodia/privada/frontend-rollback.pm2.private.json
```

O rollback usa fonte `authenticated-proven-definition`, com bytes, evidência de
proveniência e identidade imutável de release independentes do candidato. O digest
da configuração não autentica a fonte e pode ser igual entre candidato e retorno
quando a topologia usa o mesmo caminho lexical `/current`. A prova isolada exige que
o PM2 preserve esse caminho lexical e que symlink, processo, BUILD_ID e entrypoint
resolvam estritamente para a release física declarada. Antes de uma futura janela,
executar a prova com PM2 pinado em `PM2_HOME` temporário:

```bash
python3 scripts/ci/verify-pm2-definition-isolated.py --pm2 /caminho/pinado/pm2
```

Essa prova local não autoriza promoção e não substitui os gates produtivos.

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
python3 -B scripts/deploy-preparation-admission.py --run-preparation --materialized-root /custodia/admitida --admission-report /custodia/admitida/admission-report.private.json --admission-report-sha256 SHA_REVISADO --adapter api --producer-input /custodia/privada/api-adapter-input.private.json --producer-input-sha256 SHA_REVISADO --output /custodia/privada/futuras-geracoes
python3 -B scripts/deploy-preparation-admission.py --run-preparation --materialized-root /custodia/admitida --admission-report /custodia/admitida/admission-report.private.json --admission-report-sha256 SHA_REVISADO --adapter frontend --producer-input /custodia/privada/frontend-adapter-input.private.json --producer-input-sha256 SHA_REVISADO --output /custodia/privada/futuras-geracoes
python3 -B scripts/operational_preparers_v3.py --adapter auth --input /custodia/privada/auth-closure-input.private.json --input-sha256 SHA_REVISADO --output /custodia/privada/auth-closure-novo.private.json --local-only
python3 -B scripts/operational_preparers_v3.py --adapter database --input /custodia/privada/db-closure-input.private.json --input-sha256 SHA_REVISADO --output /custodia/privada/db-closure-novo.private.json --local-only
```

Os comandos são contratos de uso em **ambiente local isolado**, não blocos prontos de
janela produtiva. Não existe input produtivo novo selado por esta tarefa. `--output`
é pai privado700 para staging ou arquivo novo em pai700 para encerramento. Recusa antes de copiar registra REFUSED em sidecar próprio no pai; seu nome
impede reutilizar a geração negada. Recusa/parcial: conservar stdout e diretório/intent; não repetir nem modificar input para obter PASS.
Não criar inputs por edição de baselines históricas para fazer capturas coincidir.

API/frontend não invocam mais o produtor copiado diretamente. A ação
`deploy-preparation-admission.py --run-preparation` reabre o report da admissão, o
contrato e o input, autentica o caminho fixo e o SHA do produtor materializado e o
executa pelo mesmo FD aberto com `O_NOFOLLOW`. Assim, `OPEN` e orçamento são
persistidos antes do primeiro `copy`/`tar`. O encerramento continua exclusivamente
em `generation-retirement.py review-preparation`: `SANITIZED` exige ausência dos
artefatos; resíduo ou interrupção permanece `RETENTION_DEBT`. Não há limpeza
automática nem fallback para o checkout.

Input adicional ao coordenador anterior:

- pedido de admissão schema 2 materializa uma árvore `preparation-producer-root`
  com este entrypoint, coordenador, inventário, lifecycle e três dependências
  históricas por caminho/hash fixos. Executar o entrypoint copiado dessa árvore;
  copiar somente o arquivo principal não é suportado.
- a mesma dependência lifecycle autenticada é materializada ao lado do
  `generation-retirement.py` copiado; ambos os entrypoints fixam seu SHA e negam
  ausência ou drift, sem procurar módulos no checkout.
- `preparationArtifactContract` vincula o contrato materializado. Cada item fixa
  `reservationRoot`, path/scope/owner, proteção/autoridade, operação, custo previsto
  positivo e orçamento de bytes/inodes. O lock e a varredura abrangem filhos diretos
  dessa raiz comum; não representam reserva global de todo o filesystem.

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
