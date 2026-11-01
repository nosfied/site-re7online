# Ciclo de vida dos artefatos de implantação

## Recuperação mínima de capacidade fora da geração

`scripts/capacity-recovery.py` é o control plane versionado para manutenção do
cache npm, runtimes derivados de output já comprovados e archives derivados
individuais de preparações fechadas. Suas fases `audit`,
`prepare` e `execute`, classes fechadas, fontes preservadas e protocolo durável
estão em [CAPACITY_RECOVERY_POLICY.md](CAPACITY_RECOVERY_POLICY.md). O cache npm
não flexibiliza ancestrais de `generation-retirement.py`; usa exclusivamente a
classe `NPM_CACHE_MAINTENANCE`, cujo pai canônico é `deploy:deploy 0775`.
O próprio `_cacache` aceita somente `deploy:deploy 0700/0750/0755`, o grupo
canônico não pode conter principal além de `deploy`, e `node .../npm-cli.js` é
atividade npm. Após adquirir ambos os locks, `execute` recaptura ao vivo current,
PM2, dump, transações não terminais e grafo antes do primeiro `ATTEMPT`.
Em `/proc`, UID e start ticks autenticam o PID; inspeção integral é obrigatória
para `deploy`, enquanto limitação esperada de outro UID é apenas registrada.
Quando essa inspeção exige privilégio, somente o observador root read-only de
[CAPACITY_RECOVERY_POLICY.md](CAPACITY_RECOVERY_POLICY.md) pode ser usado; decisão,
locks, journal e retirada permanecem no control plane executado por `deploy`.
O scanner transacional autentica tanto `transaction.v1.private.json` quanto
`window-state.private.json`; layouts pré-canônicos só entram por classificadores
fechados e layouts desconhecidos continuam fail-closed. Janelas abertas contribuem
suas referências privadas para o conjunto protegido.

A classe `CLOSED_PREPARATION_DERIVED_ARCHIVE` não retira diretórios. Ela exige
registro versionado ou duplicata autoritativa, identidade estável e ausência de
material protegido, e produz somente `unlink` literal. Um lote incremental pode
ficar abaixo do alvo global, mas precisa satisfazer seu mínimo próprio e registrar
no receipt a medição física anterior/posterior; projeção nunca equivale a ganho.

Worktrees, staging, releases, preparações, transações, evidências e logs só são
retiráveis quando uma classe versionada futura autenticar seu fechamento. A lista
de política não transforma esses caminhos em candidatos implícitos.

## Contrato obrigatório por geração (implementado)

Cada execução de `scripts/converta-release.py build` publica, desde `BUILDING` e
até `COMPLETE` ou `FAILED`, `generation-artifacts.private.json`. Cada entrada
contém caminho absoluto literal, release/target, tipo, device/inode inicial e
observado, bytes aparentes/alocados, inodes, fingerprint estrutural, hash
pertinente, classe, evento de retirada e dependências.

As classes são fechadas: `PACKAGE_PRESERVE` (tar.xz, manifest e index),
`EVIDENCE_PRESERVE` (lifecycle, capacidade, logs, recibos e provas),
`RELEASE_RUNTIME`, `DERIVED_WORKTREE`, `DERIVED_OUTPUT_RUNTIME`,
`DERIVED_STAGING` e `PRIVATE_DATA_NEVER_RETIRE`. Preparações guardam contratos,
hashes e recibos; nunca duplicam runtimes completos. Releases são preservadas
enquanto integrarem os grafos active, rollback ou retorno transitivo.

Dados mutáveis tenant-scoped são proibidos dentro de releases imutáveis. Em
particular, `tenants.json`, estado operacional e fontes de backfill devem residir
em armazenamento persistente autenticado fora de `releases`; trocar release não
pode alterar a autoridade de configuração.

Os estados de revisão v2 são `ACTIVE_DEPENDENCY`, `ROLLBACK_DEPENDENCY`,
`CANDIDATE_PENDING_ACTIVATION`, `RETIREMENT_READY`, `SANITIZED`, `QUARANTINED`
e `PRESERVE_OVERRIDE`. Review v1 `SANITIZED` continua válido; v1 `PRESERVE` é
`RETENTION_DEBT` e bloqueia o próximo build. `PRESERVE_OVERRIDE` exige razão,
bytes retidos, responsável e expiração UTC futura; expiração bloqueia. Também
bloqueiam novo build `RETIREMENT_READY`, `QUARANTINED`, uma candidata pendente
que faria nascer a segunda candidata, menos de 12 GiB livres ou lifecycle não
terminal.

`scripts/generation-retirement.py` possui `prepare`, `execute` e o bootstrap
fechado `bootstrap-legacy`:

- `prepare` lê o contrato da própria geração, lifecycle terminal e fotografia
  operacional autenticada; verifica composição/identidade, referências
  current/PM2 live/dump, grafo de releases, control plane copiado e writer lock;
  produz intenção condicional com todos os caminhos derivados, inclusive outputs
  ainda pendentes que só podem ficar elegíveis após `DEPLOYED`; uma
  `RELEASE_RUNTIME` só entra na intenção quando já está
  `RETIREMENT_READY`, fora de active, rollback, retorno transitivo e candidatas;
  todos os comandos são literais, sem glob, force ou prune;
- `execute` exige intenção e autorização externas autenticadas, mantém lock
  canônico e writer lock, recaptura `current`, PM2 live, dump e grafo sob esses
  locks antes do primeiro `ATTEMPT`, para na primeira falha, verifica ausência
  após cada retirada e publica recibo/review com fsync; se um rollback terminal
  removeu o nome canônico do lock, a execução autônoma cria-o exclusivamente em
  `0600`, vincula seu conteúdo ao SHA da intenção, faz `fsync` e adquire `flock`;
  o arquivo permanece após o fechamento, livre de `flock`; existência insegura,
  identidade divergente ou holder concorrente continuam negando;
- conclusão posterior a deploy é `DEPLOYED_SANITIZED`; parcial é
  `DEPLOYED_RETENTION_INCOMPLETE`, não desfaz o deploy aprovado e bloqueia o
  próximo build. Não há retry automático.

### Contrato de conclusão sem dívida operacional

Uma geração não termina em `DEPLOYED` isolado. Na mesma frente, deve alcançar
`DEPLOYED_SANITIZED` ou registrar `DEPLOYED_RETENTION_INCOMPLETE` como bloqueio
explícito. Antes de pedir autorização, o preflight reabre todos os insumos privados
com os modos exigidos pelo consumidor e comprova que o pai físico do receipt existe
como diretório `deploy:deploy 0700`, sem symlink, enquanto o receipt final não existe.
Permissão do checkout não substitui permissão da cópia privada consumida.

Uma seleção fixed-current parcial não reduz o payload: pacote, manifesto e índice
continuam API+frontend. O marker lista os componentes promovidos; release não selecionada,
frontend/worker vivos e seus symlinks permanecem dependências protegidas até nova janela.

A execução da retirada preserva e sincroniza stdout, stderr e exit code integrais,
além de seus hashes; somente o digest não é diagnóstico suficiente. Uma negativa
nova só admite outra janela após regressão que reproduza o predicado nominal. Não se
refaz build, save, ativação ou comando já comprovado. Enquanto a review não for
terminal, o piso de 12 GiB e a proibição de segunda candidata impedem que novas
gerações acumulem custo de disco e processamento.

Uma release instalada rejeitada ou superada não é resíduo derivado: ela permanece
`RELEASE_RUNTIME`. Quando a fotografia autenticada comprovar que está fora de
`current`, PM2 live/dump e dos grafos active, rollback, retorno transitivo e
candidatas, o `prepare` inclui seu caminho literal sob a raiz canônica
`releases`. O `execute` recaptura essas provas sob os dois locks antes do
`ATTEMPT`; qualquer retorno ao grafo protegido impede o comando. O campo legado
`remainingDerivedPaths` do recibo conserva o nome por compatibilidade, mas
representa todos os caminhos retiráveis, inclusive `RELEASE_RUNTIME`.

### Preflight de invocação antes de consumir autorização

A tentativa só começa depois de validar, sem chamar `prepare`:

1. health local e o endpoint público canônico
   `https://converta.re7online.com/agent-api/health`, ambos HTTP 200 e JSON
   `ok=true`/`db="ok"`; host administrativo e health do frontend não substituem
   esse endpoint;
2. igualdade literal entre os diretórios-pai de `--contract`, `--lifecycle` e
   `--review-output`, todos no output canônico da geração; cópias privadas são
   apenas evidência e nunca argumentos canônicos;
3. modos, owner, tipo físico, ausência de symlink, hashes e raízes exigidos pelo
   consumidor real;
4. fotografia fresca de current, PM2 live/dump e grafos active, rollback, retorno
   transitivo e candidatas;
5. conjunto esperado de classes e caminhos da intenção. Uma release rejeitada fora
   dos grafos exige `RELEASE_RUNTIME` literal; staging já `SANITIZED` não volta.

Falha em qualquer item termina antes de `prepare` e não consome a tentativa
destrutiva. Não se adapta argumento após a chamada nem se reutiliza intenção
incompleta. Depois da retirada, receipt, journal, review, capacidade e ausência de
cada caminho são registrados no estado canônico antes de iniciar outra geração.

Na geração `immutable-708f018c-vps-20261027T152109Z`, a retirada autônoma V2
concluiu os ordinais `8/9/10`: worktree e runtimes derivados de API/frontend foram
removidos, a release instalada permaneceu ativa e a review terminou `SANITIZED`.
Recibo `e839ee8bd051db5cc92bcd15c65b4b791a023b95bfbf5166d4c91d8a686c96dd`,
journal `68faff9672cbf1102b1dc22e6c6b77fa30ca389292192b72a431f87d5d119f7b`
e review `42ecdc22360b701157f36599e84af7e532bfb7a9970d4e6eafe667fac8461d73`
fecharam a geração com 13.813.510.144 bytes livres. Não repetir essa retirada.

O fechamento frontend-only `immutable-b96eb779-vps-20261028T025159Z` concluiu
`DEPLOYED_SANITIZED`, um save e retirada 3/3, sem Meta, restart adicional ou mudança
da guarda. A capacidade final foi 12.402.286.592 bytes (aprox. 11,55 GiB), abaixo
do piso de build de 12 GiB (12.884.901.888 bytes): novo build fica bloqueado, mas
auditorias e homologações sem build continuam permitidas. O fechamento por
transferência de lock usa somente o wrapper versionado do modo:
`scripts/frontend-finalization-continuation.py` ou
`scripts/fixed-current-finalization-continuation.py`. O protocolo compartilhado
autentica o lock existente no FD 9, mantém o `flock` até receipt/journal/fsync e
proíbe pré-criação de stdout/stderr. No fixed-current, o mesmo FD é repassado ao
retirement por `--deployment-lock-fd 9`; o driver não remove o inode enquanto o
lock externo estiver ativo. Wrappers inline/improvisados não são evidência
operacional válida.

`immutable-123ba7bd-vps-20261026T200100Z` é a única geração conhecida anterior
ao contrato: `LEGACY_PRE_CONTRACT`, não uma review v1 `PRESERVE`. Seu bootstrap
aceita exclusivamente o descriptor versionado
`config/legacy-generation-123ba7bd.json`, autenticado por SHA-256 externo. Sob o
writer lock ele autentica lifecycle/pacote/manifest/index, executa o verificador
canônico do pacote, confirma HEAD, ausência de instalação e referências, e faz
duas leituras estáveis somente do output e worktree literais. Materializa contrato,
review v2 e recibo privados, sem autorização ou comando destrutivo. Contrato,
lifecycle e a única review canônica permanecem irmãos no output da geração;
`prepare` e `execute` atualizam essa mesma review. Intent, comandos, receipts e
journals permanecem na raiz privada de evidências. Qualquer outra
release, target, caminho ou hash é `DENY`. Depois disso, e em etapa separada,
`prepare` consome o contrato normalmente. Gerações posteriores já nascem com
contrato e nunca usam esse bootstrap.

`immutable-a959129e-vps-20261026T023100Z` é a única exceção conhecida no estado
distinto `LEGACY_V1_PRESERVE_NO_CONTRACT`: lifecycle e review v1 `PRESERVE`
existem e são autenticados, a release está instalada e ativa, mas o contrato não
foi publicado. O subcomando fechado `bootstrap-legacy-a959-v1-preserve` aceita
somente `config/legacy-generation-a959129e-v1-preserve.json`. Ele autentica os
hashes da review, lifecycle, pacote, manifest, index e marker, além da igualdade
entre pacote e release ativa verificados. Worktree e runtimes derivados já estão
ausentes por efeito do lote `10/10` concluído; o bootstrap não os recria nem os
reobserva globalmente. Ele autentica o receipt e o journal preservados, exige a
sequência literal de três eventos e o ordinal exato de cada um dos dez comandos,
e aceita `SANITIZED` para os três derivados da `a959` somente com essa cadeia e
com ausência atual. Então materializa somente o contrato e o recibo de bootstrap.
A forma sanitizada autenticada do journal é fechada: `ATTEMPT` contém somente
`event/kind/ordinal/path/result`; `RESULT` contém esses cinco campos mais
`exitCode/inspectionPath/inspectionSha256/worktreeRegistration`; `VERIFIED`
retorna aos cinco campos e exige `result=PASS`. Os três eventos repetem o `kind`,
ordinal e caminho literais do comando; não existe campo `absent` nesse contrato.
A review v1 não é substituída, renomeada ou regravada nessa fase. A migração
ocorre depois pelo `prepare --legacy-review-sha256`, que produz intenção sem
comandos e review v2 `SANITIZED`; não há etapa `execute`. A release instalada
permanece `ACTIVE_DEPENDENCY`, fora de qualquer comando.

A `a959` introduziu o contrato comprovado do overlay literal `api-runtime/.data`.
Gerações do fluxo atual registram obrigatoriamente a mesma política e o campo fechado
`privateDataOverlay` no contrato autenticado, sem
binding por release: pacote e índice nunca contêm `.data`; somente a release instalada
pode apresentar esse diretório físico, confinado, com owner/group da release e sem
escrita por grupo/outros. Na verificação do pacote e do release-root inerte, a ausência
do overlay é válida e deve permanecer ausente nas duas observações; sua aparição entre
as leituras é `DENY` sem acessar campos de identidade física inexistentes. O modo `0755` é válido porque concede apenas leitura/travessia
a grupo/outros. Symlink, escape, identidade insegura ou qualquer adição externa é
`DENY`. A projeção estrutural exclui somente o subtree, permitindo mudança interna
entre preflight e finalize, e o overlay não gera comando isolado de retenção. O
preflight registra a projeção antes da seleção; finalize a revalida antes do único
save. O binding fechado da `a959` continua somente para seu bootstrap histórico.
Dados mutáveis futuros devem migrar para persistência externa à release; este contrato
não autoriza essa migração nem relaxa a verificação do pacote.
Um contrato sem `privateDataOverlay` é negado, ainda que possua
`privateDataPolicy`. A única reconciliação é a continuação da transação `0fdec` já
aberta: manifesto privado vincula release, target, contrato original, intenção,
transação, aceite, `saveCount=0` e identidade do diretório, e somente `finalize`
pode consumi-lo. O manifesto não altera lifecycle nem cria autorização reutilizável.

Portanto, `123ba` e `a959` não compartilham bootstrap: a primeira é
`LEGACY_PRE_CONTRACT` sem review; a segunda já tem review v1, não pode fabricá-la
e exige prova adicional da release ativa. Nenhuma geração futura pode usar essas
exceções.

As duas antigas dívidas v1 do mesmo lote `10/10` têm descriptors fechados e não
reutilizam os bindings da `a959`. O subcomando
`bootstrap-legacy-batch-v1-preserve` aceita somente `d436` com ordinais `2/6/7`
e release `ROLLBACK_DEPENDENCY`, ou `f160` com ordinais `3/8/9` e release
`ACTIVE_DEPENDENCY`. Em ambos os casos, receipt e journal completos são
autenticados pelos hashes canônicos, os três derivados precisam continuar
ausentes e o bootstrap não enumera outras gerações. Cada `prepare` gera zero
comandos e migra sua review v1 para v2 `SANITIZED`; o gate global roda uma única
vez, somente depois das duas migrações. Esse procedimento foi concluído uma única
vez em 27/10/2026: ambos os `prepare` geraram zero comandos, as reviews v2 ficaram
`SANITIZED` e o gate global aceitou quatro reviews. Portanto, `d436/f160` não são
mais dívidas operacionais e o bootstrap não deve ser repetido.

Os hashes finais são: contratos `d436/f160`
`317cf901e06e9f76b211fa046dce537bb8fa9df0643cc1ae34350ac332c6ddbc` /
`a0f224b7c05b792ec978915351544791e648f7b52c5f14d5f16cb1bf80798bdc`;
reviews v2 `3e3bf9d15ad97997f92f6689fcd044f969c1b76194183bdb7075fb87355d43e2` /
`8f2deb17acc9305ebd27b1dc98431068af3d5891bb6df0bac81f40761e2b74a6`;
gate global `3f3bf713765fa27446bccf8ce3dbbfebada370fb643743591fbaf9f9c7c59bfc`.
Junto com as regularizações anteriores de `123ba` e `a959`, isso encerra todas as
dívidas legadas conhecidas. A política continua fail-closed: qualquer nova dívida
volta a bloquear o build.

Exclusivamente na release instalada `f160`, o caminho literal
`frontend-runtime/.next/cache` é `EPHEMERAL_RUNTIME_CACHE/ACTIVE_DEPENDENCY`.
Ele é proibido no pacote e no índice, excluído somente da projeção estrutural da
release instalada e autenticado como diretório físico confinado, sem symlink,
escape ou escrita por grupo/outros. Seu conteúdo pode mudar sem mascarar drift
nas entradas imutáveis. O cache nunca recebe comando isolado neste fluxo: só é
removível com a release-pai quando ela deixar de ser ativa e de integrar a cadeia
de retorno.

A publicação do bootstrap é retomável sem sobrescrita: contrato e review são
calculados deterministicamente e cada arquivo existente precisa ser regular,
privado e byte-exatamente igual. O recibo é publicado por último. As duas leituras
estruturais ignoram somente esses destinos autenticados, de modo que uma falha após
contrato ou review pode ser retomada sem converter conteúdo divergente em sucesso.

Uma retirada parcial nunca transforma ausência em sucesso por inferência. Uma nova
preparação exige o intent, receipt e journal anteriores com SHA-256 externos; confere
intent/generation, ordinais, `ATTEMPT`, `RESULT` zero, `VERIFIED`, path, argv e a
identidade original. A nova autorização contém somente os caminhos remanescentes.
Cada intenção reconciliada preserva cumulativamente todos os elos
intent/receipt/journal e associa cada ordinal e identidade ao elo que comprovou sua
retirada. Assim, uma segunda ou terceira falha parcial continua sem repetir comandos
concluídos; cadeia truncada, duplicada ou inconsistente é `DENY`.

`SANITIZED` só é publicado após recomputar o contrato inteiro e confirmar que
todos os derivados estão ausentes. Retirar somente o worktree enquanto outputs
continuam pendentes termina em `RETENTION_INCOMPLETE` e review `QUARANTINED`.
A mesma autorização pré-deploy cobre a lista literal completa; a execução
pós-aceite recalcula a elegibilidade, sem ampliar o escopo autorizado.

O estado operacional v2 declara raízes observadas, mas a autoridade é a política
versionada e autenticada `config/deploy-artifact-roots.json`. Caminho, owner, group,
modo e ancestrais devem coincidir com essa política; redefinição no JSON operacional
é `DENY`. Ela fixa raízes canônicas para checkout,
`build-worktrees`, `build-output`, releases, staging e uma lista fechada de raízes
de evidências. Cada classe
destrutiva deve ser descendente estrita da raiz correspondente. Raiz em si,
checkout canônico, caminho externo, sobreposição não declarada, symlink e ancestral
por symlink são `DENY`. A única composição admitida é uma raiz de evidências como
descendente de `build-output`, pois lifecycle/review são preservados ao lado da
geração e nunca integram um comando destrutivo. Mudança de `current`, fingerprint sanitizado do PM2, dump ou
grafo entre preparação e execução também nega antes do primeiro `ATTEMPT`.

O hash, o schema fechado e todas as declarações da política são sempre
autenticados. Isso não implica exigir antecipadamente a existência física de uma
raiz opcional que não participa da operação. `staging` é autenticada fisicamente
somente se existir `DERIVED_STAGING` ainda não `SANITIZED` que possa originar um
comando. Nesse caso a checagem ocorre antes do lock/comando e exige diretório real,
sem symlink, owner/group/modo autorizados e ancestrais seguros. Staging ausente sem
artefato destrutível, ou staging já `SANITIZED` e removido pelo produtor, é válido;
não se cria a raiz histórica para passar no gate. A extração independente histórica
já removida pode estar confinada a `staging` ou `build-output`; artefato ainda
presente ou destrutível continua restrito exclusivamente a `staging`. A raiz de evidências participa
sempre e aceita os modos canônicos `0700` e `0750`, ambos sem escrita por
grupo/outros.

O produtor recebe a mesma política autenticada: `--repo` deve ser descendente estrito
de `build-worktrees`, `--output` descendente estrito de `build-output` e
`--installed-releases-root` deve ser exatamente a raiz `releases`. Essas três
fronteiras, seus owners, modos e ancestrais são conferidos antes de criar a saída, o
lock de geração ou executar npm. Caminho externo, raiz redefinida ou symlink é `DENY`.
Staging e outras raízes de retenção não utilizadas não integram esse gate pré-build.

A instalação inerte usa exclusivamente `converta-release.py install`. A rota
normal extrai o pacote sob seu próprio `releaseId`, autentica a raiz `0755`,
verifica o payload e promove por rename no mesmo filesystem. Uma raiz
`.installing` preservada só pode ser retomada por manifesto privado `0600`
vinculado a pacote/target/release, caminho final e identidade física completa; o
modo do pacote é materializado sem trocar o inode antes da promoção. Extração
manual com remoção do primeiro componente, chmod ad hoc ou nome físico divergente
não produz `RELEASE_RUNTIME` válido. A admissão agregada exige a prova
`installation-route-qualified` antes do build.

Uma review v1 `PRESERVE` verdadeira só pode ser migrada sem inventário global
quando `prepare` recebe `--legacy-review-sha256` igual aos bytes preservados e
generation/lifecycle coincidem. Esse caminho não se aplica à `123ba`, que não
possuía contrato nem review. Para `a959`, ele só fica disponível após o bootstrap
fechado materializar o contrato sem modificar a review original.

Worktree só fica pronto depois de pacote verificado, control plane copiado e
ausência de escritor. Output runtime só fica pronto depois da instalação
verificada ou superação formal da candidata. Staging só fica pronto depois de
promoção/rollback terminal. Package, manifest, index, evidências e dados privados
nunca entram nos comandos.

### Lote de dez caminhos concluído em 26/10/2026

O lote `retention-recent-generations-qualification-20261026T213341Z-v3` foi
relatado como `COMPLETED`: 10/10 comandos, 6.942.289.920 bytes recuperados e
13.416.599.552 bytes livres ao final. Recibo
`19ba46c4948e3ff1821b8b44e51fed1edf635b9b7ddd3421064dab7ee2250c74`, log
`e8f593acb2801e88dbbfffb3a679b4775916491c3e2281e24a45ebf3f0e6c985`,
amostra A `11f70b7c7b6d27f8a55bae36aa17b081ece70e8511f414da14b1f56d83661612`
e amostra B `94fda2c48e65e43de46d6cedc121d4b32f46339301306f452218bb8a013ea6a8`.
Produção permaneceu inalterada e o lock foi liberado sem remover seu arquivo.
Esse registro é histórico e não autoriza repetição.

Esta é a fonte canônica para capacidade, classificação e encerramento de gerações
de build. Ela não autoriza exclusão. A ativação continua regida pelo
[runbook de deploy](DEPLOY_RUNBOOK.md), e dados, backups e mídias seguem contratos
próprios.

## Contrato antes do build

`scripts/converta-release.py build` exige `--capacity-contract` apontando para um
JSON privado, regular, `0600`, do mesmo owner do processo. O contrato é fechado e
vinculado a `targetCommit` e `releaseId`. Ele declara:

- crescimento máximo do worktree durante instalação e compilação;
- tamanho do payload de runtime;
- pico temporário de tar e compressão;
- extração independente de verificação;
- evidência privada de falha;
- reserva operacional em bytes;
- pico e reserva de inodes.

O produtor mede bytes e inodes disponíveis no filesystem no início e soma todas as
parcelas, de forma conservadora. Repositório, saída e `filesystemPath` precisam
estar no mesmo device. Reserva insuficiente resulta em `capacity_bytes` ou
`capacity_inodes` antes da criação da saída e antes do primeiro `npm`.

Somente a recuperação nominal `P00_TENANT_ISOLATION_RECOVERY` admite dispensar o
piso estático de 12 GiB. O produtor exige `--p00-static-floor-override` e seu
SHA-256 externo. O JSON privado `0600` tem schema fechado com `schemaVersion`,
`targetCommit`, `releaseId`, `capacityContractSha256`, `reason`, `responsible`,
`issuedAtUtc` e `expiresAtUtc`; a vigência máxima é seis horas. Symlink, campo
extra, modo inseguro, hash/binding divergente ou expiração negam. O documento vira
`EVIDENCE_PRESERVE` e integra o lifecycle. A exceção não muda `requiredBytes`,
inodes ou checkpoints e não autoriza build ou ativação.

Exemplo estrutural, com valores a serem medidos e revisados para cada geração:

```json
{
  "schemaVersion": 1,
  "contractId": "capacity-immutable-example",
  "capturedAtUtc": "2026-10-25T00:00:00Z",
  "targetCommit": "0000000000000000000000000000000000000000",
  "releaseId": "immutable-example",
  "filesystemPath": "/opt/re7online",
  "buildWorkspaceGrowthBytes": 1,
  "runtimePayloadBytes": 1,
  "packageTemporaryBytes": 1,
  "independentVerificationBytes": 1,
  "failureEvidenceBytes": 1,
  "operationalReserveBytes": 1,
  "peakInodes": 1,
  "operationalReserveInodes": 1
}
```

Os valores mínimos do exemplo mostram apenas tipos e não constituem orçamento
produtivo. Todos os orçamentos precisam ser positivos, medidos e revisados.

Depois que a reserva passa, o produtor mantém
`generation-lifecycle.private.json`, modo `0600`, fora do pacote. O estado é
`BUILDING`, `FAILED` ou `COMPLETE`; conclusão e falha ficam com classificação
`PENDING` até a revisão pós-janela. O registro contém somente identidades, caminhos,
hashes e capacidade, sem ambiente ou segredo. `FAILED`, `COMPLETE` ou uma geração
substituída exigem classificação imediata como host obrigatório, custódia off-host
verificada ou pendência. Substituição nunca equivale a autorização para retirar.

`PENDING_RETENTION_REVIEW` é parte do encerramento do deploy, não backlog eventual.
Enquanto uma geração anterior estiver nesse estado, não iniciar novo build que crie
cópias dispensáveis sem justificativa operacional registrada e novo orçamento de
coexistência/pico. Depois do aceite, preservar release ativa, retorno imediato,
pacote, manifesto, índice e evidências; worktree e payload redundante só podem sair
em lote separado, autenticado, comparado e explicitamente autorizado.

## Preservação de evidências de execução

A coleta usa `scripts/retention-evidence-collector.py`; `--validate-only` verifica
o contrato antes da janela. Ela exige raiz de origem literal e específica, destino novo diretamente sob custódia privada `0700` e helper
regular `0600`, pertencente ao UID/GID executor, legível por esse UID e autenticado
por SHA-256 externo. Caminho vazio, `/tmp`, raiz ampla, sobreposição, symlink, hash,
owner, modo ou legibilidade divergente negam antes da cópia.

`--source-writer-lock` é obrigatório e aponta para arquivo regular privado `0600`,
irmão da raiz de origem. A origem deve estar encerrada; todo produtor capaz de
escrevê-la precisa participar desse lock cooperativo. O coletor mantém `flock`
exclusivo e não bloqueante desde a primeira observação até a publicação do recibo.
Lock ocupado nega antes da cópia. A árvore é observada e revalidada com o mesmo
contrato do comparador: identidade e composição da raiz e de cada diretório,
identidade dos arquivos, tipos, modos, tamanhos, hashes e symlinks. Uma varredura
comum ainda não é snapshot atômico; o lock e a exclusão comprovada de todos os
escritores são condições da coleta, e a revalidação detecta drift observado.

O coletor nunca remove a origem nem uma cópia parcial. Falha mantém os temporários
para diagnóstico; encerramento posterior requer intenção nova. O diretório de origem
não pode ser reduzido a uma variável implícita: origem, custódia e destino absolutos
devem ser passados separadamente. A validação do helper antecede qualquer janela que
dependa dele; não se altera owner ou modo e não se executa a coleta inteira como root
para contornar acesso do UID executor. A coleta efetiva exige que o próprio processo
tenha o UID/GID executor. Antes de publicar `PRESERVED`, arquivos copiados e
diretórios da árvore são sincronizados, seguidos do diretório de custódia; o recibo
preparado também é sincronizado e só então recebe o nome final por rename sem
substituição. Os nomes reservado e preparado do recibo não podem existir na origem;
arquivo regular ou symlink com qualquer deles nega antes da cópia. Depois da
publicação, o diretório que contém o recibo é sincronizado novamente antes de
retornar `PRESERVED`. Falha desse último `fsync` resulta em
`PRESERVATION_INDETERMINATE`, registra que o recibo foi publicado sem durabilidade
confirmada e proíbe retry automático; o recibo e todos os artefatos permanecem.
Falha de cópia ou revalidação também nega a conclusão e preserva origem e cópia
parcial.

O coletor auxiliar exato usado na tentativa local negada de 25/10/2026 permanece
somente como evidência do incidente e **não pode ser reutilizado**. Publicar este
código versionado não comprova que uma futura janela deixou de usar o fluxo antigo:
a intenção deve autenticar o helper versionado, seus argumentos e seu SHA-256, e a
execução deve registrar essa identidade antes de abrir a janela.

## Relatório pós-janela

`scripts/operational-retention-report.py` continua sem modo de aplicação. Além do
inventário por inode, ele aceita:

- catálogo privado `0600` de gerações, com estado, raízes, referências operacionais
  e custódia;
- comparações literais `SOURCE::DESTINATION`;
- orçamento explícito de bytes para hashing.

A comparação inclui caminho relativo, tipo, modo, tamanho, SHA-256 de arquivo e
destino textual de symlink, incluindo tipo e modo da própria raiz. Origem e destino
são revalidados integralmente depois das duas leituras; adição, remoção, substituição,
renomeação, leitura incompleta ou drift de identidade negam a prova. Diferenças
estáveis são separadas por atributo.

A execução exige exclusão de escritores para ambas as árvores durante todo o
intervalo: nenhum build, extração, promoção, cache runtime, processo com escrita ou
limpeza pode alcançar as raízes comparadas. A varredura comum não é snapshot atômico;
a revalidação detecta drift observado, mas não substitui filesystem snapshot nem
isolamento de escritores. O relatório calcula espaço pendente por geração, mas mantém
`withdrawalEligible=false`: decisão, allowlist literal, revalidação e autorização
continuam externas.

## Método de capacidade e encerramento por geração

Este método aplica os princípios existentes de retenção e a regra antiespiral da
[política de mudanças](CHANGE_POLICY.md#regra-de-encerramento-e-antiespiral).
Uma negativa preserva a produção; ela não autoriza outra cadeia de cópias, novo
framework ou repetição automática. Reutilizar bytes e provas cuja validade ainda
possa ser demonstrada.

| Momento | Registro e decisão obrigatórios |
| --- | --- |
| Antes de nova cópia, build ou compactação | Medição atual de bytes/inodes por filesystem e executor; artefatos compatíveis reutilizáveis; resíduos anteriores classificados; justificativa de cada nova cópia; pico de coexistência e reserva operacional preservada |
| Depois do build, com sucesso ou falha | Inventário dos resíduos por geração: dependências, compilados, runtime copiado, pacote, extrações, staging e diagnósticos; finalidade, responsável e decisão para cada categoria |
| Antes de iniciar outra geração volumosa | Revisar a pendência anterior; não criar outra cópia dispensável com classificação pendente. Necessidade operacional concreta de coexistência deve estar justificada e caber no orçamento medido |
| Antes de retirada autorizada | Vincular os inventários atuais às provas autenticadas anteriores; verificar as referências operacionais, o retorno compatível e os componentes protegidos sob o lock vigente |
| Depois de cada comando | Registrar tentativa durável, exit code, estado remanescente e registro Git quando aplicável; resultado parcial impede o comando seguinte |
| Encerramento | Ausências e identidades operacionais conferidas, capacidade/inodes antes e depois, recibo com durabilidade confirmada e evidências sob custódia verificável |

A reserva não é um percentual escolhido para obter PASS nem o saldo de uma medição
antiga. Ela deve cobrir a operação, retornos, banco/WAL, crescimento no horizonte da
janela e evidências segundo os contratos vigentes. Contar blocos únicos; não somar
duas vezes subdiretórios, hardlinks ou cópias compartilhadas. Renomear no mesmo
filesystem não recupera espaço.

Separar executáveis operacionais e retorno compatível de dependências regeneráveis
e payloads redundantes. Manifestos, pacotes e diagnósticos não precisam acompanhar
automaticamente todas as cópias de runtime na VPS. Conteúdo único depende de decisão
de preservação e custódia; nenhum dado de tenant, mídia, banco ou backup entra na
retenção de executáveis por extensão desta regra. Nenhuma remoção é autorizada por
idade, nome ou tamanho.

### Diagnóstico dirigido, teste do executor e evidência proporcional

Antes de pedir autenticação ao operador, revisar o procedimento inteiro e ensaiar o
executor real, substituindo somente as operações externas necessárias. Validar os
destinos novos, ancestrais, UID/GID efetivos, legibilidade dos auxiliares, hashes,
argumentos, lock, limites medidos, traps e publicação do recibo. Um teste com
identidade simulada não comprova acesso sob o UID real.

Uma recusa deve registrar fase, predicado e identidade suficiente para diagnóstico
dirigido. Erro de permissão, alvo ausente, processo encerrado e identidade incerta
são estados distintos; não remover negativas para fabricar cobertura completa.
Confirmar o término de processos e a identidade dos objetos com mecanismos adequados
à superfície observada. Caminho no host não substitui resolução no namespace do
processo. Detalhes sensíveis permanecem somente na evidência privada.

Separar os orçamentos de indexação, observação e revalidação, com verificação de
prazo também ao fim de cada fase. Pré-indexar relações reutilizadas, em vez de
repercorrer todo o inventário a cada consulta. Após uma recusa, preservar a tentativa
e investigar o ponto exato; não repetir toda a coleta apenas para obter diagnóstico
que deveria ter sido registrado.

Testar também falha parcial de remoção, falha da amostra e falha de durabilidade
tanto no sucesso como no caminho de erro. Em Bash, funções chamadas em condicionais
não devem depender apenas de `set -e`: operações críticas precisam verificar seus
retornos explicitamente. Nenhuma falha de `fsync` pode ser convertida em sucesso,
republicação automática ou repetição da retirada.

Manter preparação de código, testes e análises volumosas fora da VPS quando
possível. Levar ao host produtivo somente auxiliares e evidências necessários, com
orçamento explícito; não copiar payloads de aplicação para diagnosticar um auxiliar.
Medir o crescimento das próprias preparações e evidências do saneamento. Reutilizar
artefatos autenticados quando aplicável, sem excluir automaticamente originais ou
cópias parciais. Custódia deve ser durável e acessível ao responsável; armazenamento
temporário não a comprova.

### Controles implementados e limites de implantação

| Controle | Situação comprovada pelo código versionado |
| --- | --- |
| Contrato privado de capacidade, pico e reserva | Exigido por `converta-release.py build`, antes da saída e do primeiro npm |
| Registro de geração | Sidecar com BUILDING/COMPLETE/FAILED; classificação permanece PENDING até revisão |
| Impedir automaticamente nova geração por retenção pendente anterior | Implementado para outputs de gerações pelo `converta-release.py::require_generation_reviews`; não cobre arquivos volumosos de preparações fora do output canônico |
| Impedir automaticamente ultrapassagem do orçamento ao longo de todas as fases | Não comprovado pelo preflight inicial; medir nas fronteiras de cópia e registrar desvios continua necessário |
| Retirada e retenção por idade | Não há exclusão automática introduzida por este método |
| Instalação dos controles na VPS | Precisa de atestação do executável efetivamente usado e seu hash; merge ou documentação não comprovam ativação |

A extensão futura dos controles deve reutilizar o produtor e os registros existentes,
com teste de negativa antes da alocação volumosa. Não introduzir outro launcher,
cron ou framework de limpeza para substituir a correção desse fluxo.

A lacuna remanescente é específica: archives volumosos em
`backups/converta-persistent/preparations` não nascem sob o lifecycle/review das
gerações. A correção de cardinalidade do `capacity-recovery.py` limita a memória da
qualificação, mas não cria owner, orçamento ou evento de retirada para esses
arquivos. Essa extensão permanece próxima frente e não integra esta revisão.

O registro temporário de nomes é retirado quando o contexto Python termina de modo
recuperável. Um `SIGTERM` pode impedir `__exit__`: o supervisor ainda sela sinal,
exit code e RSS, enquanto o diretório privado `.capacity-name-registry-*` pode
permanecer na custódia da fase. Ele deve entrar no inventário terminal pelo caminho
e identidade exatos e só pode ser retirado após classificação canônica; não há
varredura ou limpeza automática da raiz de custódia.

O supervisor integrado após o PR #300 aplica contenção somente ao `audit`, por
escopo transitório autenticado do `systemd --user`: memória agregada do cgroup,
swap zero e prazo monotônico. Essa fronteira protege os serviços vivos sem usar
RSS como limite e sem sinalizar por nome; Python, Node/PM2 CLI e helper descendentes
herdam o mesmo escopo, enquanto o daemon PM2 existente permanece externo. Falha em
aplicar ou autenticar a contenção nega antes do executor. O mecanismo não muda o
lifecycle, a retirada nem os protocolos de `prepare`/`execute`, e não converte
resíduo temporário após sinal em artefato automaticamente removível.

## Inventário histórico anterior aos lotes de 25/10/2026

Esta fotografia e suas classificações precedem as retiradas relatadas abaixo; não
representam a ocupação nem a lista de caminhos presentes após o encerramento final.

Leitura limitada, sem exclusão ou mutação. O filesystem tinha 82.086.711.296 bytes,
70.972.801.024 usados e 11.097.133.056 disponíveis; 1.620.730 inodes usados. A
fotografia detalhada privada foi preservada fora do Git.

| Raiz | Gerações observadas | Alocado | Classificação na auditoria |
| --- | --- | ---: | --- |
| `/opt/re7online/releases` | 52 entradas de primeira ordem, incluindo releases/runtimes, incoming, staging e `failed-preparations` | 28.691.599.360 B na medição ampla anterior | ativa, retornos, históricos e pendências misturados; nenhuma retirada ampla |
| `/opt/re7online/build-output` | `a62da468` principal/repack, `ec2a9fde`, `ef7db111`, `3630e16`, `d7de6453` e três logs privados | 5.830.348.800 B | payloads redundantes e pacotes/evidências a separar |
| `/opt/re7online/build-worktrees` | `a62da468`, `3630e16`, `d7de6453` | 3.069.857.792 B | todos têm conteúdo ignorado; revisão pendente |
| `/opt/re7online/release-sources` | `freeform-window-af26`, `freeform-window-af26-cumulative-20261002` | 2.009.829.376 B | histórico com referências transitivas; preservar |
| `/opt/re7online/deploy-control` | `3870`, `3a87`, `5ea7`, `6e10`, `6f0d`, `7e96`, `90f0`, `b61e`, `ef7db111-prep` | 1.612.713.984 B | controles antigos e um worktree com artefatos ignorados; revisão pendente |
| `/opt/re7online/staging` | ausente | 0 B | nenhum staging nesta raiz |
| `releases/failed-preparations` | Prisma ausente, heap OOM, `a62da468` sem uploads da dependência | 1.728.606.208 B | evidências e conteúdo único ainda sem custódia completa |

O inventário nominal de `releases` inclui as famílias históricas `b66`, `ba66`,
`879`, `af26`, `afbb`, `b9`, `9f4c`, `fa60`, campanhas preventiva/dinâmica/result
truth/eligibility, CRM CSV/Contacts, segurança, worker, `normal-f5028`,
`immutable-f5028`, `c085`, `5c339`, `e2e7`, `a62da468` externo e VPS, `ec2a9fde`,
`ef7db111`, `3630e16` e `d7de6453`. Nome, idade e tamanho não classificaram nenhuma
delas como dispensável.

Lista fechada das entradas de primeira ordem observadas (prefixos `.incoming` e
`.staging` mantidos):

```text
releases:
  .DEPLOYED.immutable-ec2a9fde-vps-20261024T162005Z.tmp
  .incoming-immutable-5c339b2e-20261022T125717Z.tar.xz
  .incoming-immutable-5c339b2e-20261022T125717Z.tar.xz.sha256
  .incoming-immutable-a62da468-20261024T112857Z.tar.xz
  .incoming-immutable-c085e53f-20261021T094952Z
  .staging-immutable-ec2a9fde-vps-20261024T162005Z-20261024T164600Z
  3227b2d752110873f0eff4ee5253a6f06ca51549-front
  879cb1faa88493cd78dd789b71f85043d6c8ff9c-api
  9f4cbe0f9a4e891f09bb2f41e88eccec388172da-front
  af26f48a9c309b24ec4d23cfa97cc1e407c09d98-api
  af26f48a9c309b24ec4d23cfa97cc1e407c09d98-front
  afbb7455f320793e05a25875e8a5f13f98cabf90-api
  b66bb89aca9112277463b7d2adbee0b9e7831157-api
  b9b58177880e729854580def1180f3edb2fb83e8-api
  ba66c24112ccb10f2dfdcced54350f513d399bc6
  campaign-dynamic-5b3cf3af-20261012T170000Z
  campaign-dynamic-compatible-return-5b3cf3af-20261012T170000Z
  campaign-eligibility-recovery-final-reviewed-20261008
  campaign-preventive-a26-20261011T002421Z
  campaign-result-truth-2ed9dccc-20261011T184000Z
  credential-rotation-obs2-20261018T190417Z
  crm-contacts-list-recovery-f5028de1-20261019T201659Z
  crm-csv-24e5857f-20261016
  crm-csv-front-ea3d2788-20261016
  crm-csv-front-return-d41ddd64-20261016
  crm-csv-recovery-d7d37c4f-20261017T233455Z
  crm-csv-recovery-d7d37c4f-20261017T233455Z-r2
  crm-csv-terminal-reentry-b8cc113d-20261018T143000Z
  crm-csv-ux-phone-normalization-36dacbc8-20261018T122527Z
  crm-csv-ux-phone-normalization-36dacbc8-20261018T122527Z-r2
  fa60f0f6443f3e0a129dc707021cffdc408af817-front
  fa60f0f6443f3e0a129dc707021cffdc408af817-front-css-17bd5fb8
  frontend-dynamic-5b3cf3af-20261012T170000Z
  immutable-3630e16-vps-20261024T195842Z
  immutable-5c339b2e-20261022T125717Z
  immutable-a62da468-20261024T112857Z
  immutable-a62da468-vps-20261024T124726Z
  immutable-c085e53f-20261021T094952Z
  immutable-d7de6453-vps-20261024T221500Z
  immutable-e2e7f17a-20261022T005110Z
  immutable-ec2a9fde-vps-20261024T162005Z
  immutable-ef7db111-vps-20261024T174000Z
  immutable-f5028de1-20261020T181603Z
  incoming
  normal-f5028de1e530
  security-epoch-v3-36f51ebe-20261015T001500Z
  worker-bf5f1d76-f06d49cb-91230f88-b66bb89a
  worker-bf5f1d76-f06d49cb-91230f88-b66bb89a-af26-window
  worker-minimal-hybrid-b9b58177-20261004
  worker-minimal-hybrid-b9b58177-verified-v3
  worker-minimal-reactive-afbb7455-verified
failed-preparations:
  immutable-a62da468-vps-20261024T124726Z-missing-openai-uploads-preserved
  normal-f5028de1e530-20261020T145324Z-missing-prisma-generate
  normal-f5028de1e530-20261020T160000Z-node-heap-oom
build-output:
  immutable-a62da468-vps-20261024T124726Z
  immutable-a62da468-vps-20261024T124726Z-repacked-uploads-fix
  immutable-ec2a9fde-vps-20261024T162005Z
  immutable-ef7db111-vps-20261024T174000Z-producer
  immutable-3630e16-vps-20261024T195842Z-producer
  immutable-d7de6453-vps-20261024T221500Z-producer
build-worktrees:
  immutable-a62da468-vps-20261024T124726Z-source
  immutable-3630e16-vps-20261024T195842Z-source
  immutable-d7de6453-vps-20261024T221500Z-source
release-sources:
  freeform-window-af26
  freeform-window-af26-cumulative-20261002
deploy-control:
  3870e6d140af  3a87c7e095fa  5ea7fa45a369  6e10975e5f28
  6f0d741581da  7e968da706c3  90f04d8f2e47  b61e42035c0d
  ef7db111-prep
```

### Referências vigentes reconstruídas

- API e frontend vivos e `/current` usam
  `immutable-d7de6453-vps-20261024T221500Z`.
- O worker vivo usa `immutable-e2e7f17a-20261022T005110Z`.
- O retorno imediato da API é `immutable-3630e16-vps-20261024T195842Z`; o retorno
  do frontend é `immutable-ec2a9fde-vps-20261024T162005Z`. A cadeia transitiva
  `ef7db111`, `a62da468-vps` e `5c339b2e` permanece protegida.
- PM2 live e dump salvo apontam para os mesmos caminhos estáveis/worker físico. O
  dump regular `0600` tinha SHA-256
  `5d9ae04d6df29856318992638a66deccd29a68719c129be47453d4fd4b757e13`.
- `pm2-deploy.service` está ativo e usa `pm2 resurrect`; Nginx não referencia uma
  geração física. Nenhum lock de implantação estava mantido no instante da leitura.
- API local/pública respondeu `ok=true`, `db=ok`; Login local/público, Inbox e CRM
  responderam HTTP 200. Nenhum endpoint de sincronização foi usado.

Relatórios e transações históricas foram preservados como evidência. Uma referência
textual histórica não converte, por si, um payload executável em dependência ativa.

### Classificação de custódia

| Classe | Escopo comprovado nesta auditoria | Condição |
| --- | --- | --- |
| Preservar | release viva `d7de6453`, worker `e2e7f17a`, retornos `3630e16` e `ec2a9fde`, cadeia transitiva de retorno, PM2 live/saved, configurações privadas, PostgreSQL/volumes, mídias, dados de tenants, backups, journals e evidências | dependência operacional ou custódia/restauração ainda necessária |
| Arquivar | preparações falhas, worktrees com conteúdo ignorado, controles antigos e outputs substituídos fora do primeiro lote | somente após inventário de conteúdo único, destino off-host durável e ensaio de restauração; nenhuma movimentação foi autorizada |
| Remover após autorização | exclusivamente os quatro runtimes duplicados do primeiro lote abaixo | equivalência integral, ausência de referência operacional e revalidação imediatamente antes da retirada |

`node_modules` duplicado não exige custódia integral por padrão quando seu payload
instalado equivalente permanece autenticado; qualquer byte único detectado volta para
“Arquivar” ou “Preservar”. Manifestos históricos nunca são alterados para refletir a
retirada de uma cópia redundante.

## Primeiro lote — preparação histórica e execução relatada

A preparação abaixo é histórica; o resultado posterior está no encerramento desta
seção. Os comandos não devem ser repetidos.

Os quatro caminhos abaixo contêm runtimes cujo conteúdo de origem está integralmente
contido na release instalada de `ec2a9fde`. Isso não significa igualdade irrestrita:
os stagings diferem nos modos, e o frontend instalado contém seis entradas adicionais
de cache runtime. Os wrappers, pacote, manifesto, índice e demais evidências ficam
preservados:

| Caminho literal | Alocado | Referências | Prova | Decisão proposta |
| --- | ---: | --- | --- | --- |
| `/opt/re7online/build-output/immutable-ec2a9fde-vps-20261024T162005Z/immutable-ec2a9fde-vps-20261024T162005Z/api-runtime` | 337.059.840 B | nenhuma referência live/saved/boot/Nginx/cron/helper | 8.197 entradas; conteúdo e metadados iguais à release instalada | remover após autorização |
| `/opt/re7online/build-output/immutable-ec2a9fde-vps-20261024T162005Z/immutable-ec2a9fde-vps-20261024T162005Z/frontend-runtime` | 645.025.792 B | nenhuma referência operacional | 26.149 entradas; todas contidas na release instalada; seis entradas adicionais nela são cache de imagem criado em runtime | remover após autorização |
| `/opt/re7online/releases/.staging-immutable-ec2a9fde-vps-20261024T162005Z-20261024T164600Z/immutable-ec2a9fde-vps-20261024T162005Z/api-runtime` | 337.059.840 B | staging já promovido; nenhuma referência operacional | conteúdo das 8.197 entradas integralmente contido; zero divergência de tipo/tamanho/SHA/symlink e 8.187 diferenças de modo explicitadas | remover após autorização |
| `/opt/re7online/releases/.staging-immutable-ec2a9fde-vps-20261024T162005Z-20261024T164600Z/immutable-ec2a9fde-vps-20261024T162005Z/frontend-runtime` | 645.025.792 B | staging já promovido; nenhuma referência operacional | conteúdo das 26.149 entradas integralmente contido; zero divergência de tipo/tamanho/SHA/symlink, 26.118 diferenças de modo e seis caches adicionais no destino vivo | remover após autorização |

Potencial literal: **1.964.171.264 bytes alocados**. A release instalada de retorno,
o pacote de transporte, seus hashes e os quatro arquivos de metadados soltos ficam
intactos. Os worktrees não entram: `tracked-clean` não cobre `.next`, `node_modules`
e `dist` ignorados, cuja classificação ainda está pendente.

Comandos históricos do lote, sem curingas — **não repetir**:

```bash
rm -r -- /opt/re7online/build-output/immutable-ec2a9fde-vps-20261024T162005Z/immutable-ec2a9fde-vps-20261024T162005Z/api-runtime
rm -r -- /opt/re7online/build-output/immutable-ec2a9fde-vps-20261024T162005Z/immutable-ec2a9fde-vps-20261024T162005Z/frontend-runtime
rm -r -- /opt/re7online/releases/.staging-immutable-ec2a9fde-vps-20261024T162005Z-20261024T164600Z/immutable-ec2a9fde-vps-20261024T162005Z/api-runtime
rm -r -- /opt/re7online/releases/.staging-immutable-ec2a9fde-vps-20261024T162005Z-20261024T164600Z/immutable-ec2a9fde-vps-20261024T162005Z/frontend-runtime
```

Antes: revalidar ausência de build/npm e descritores/CWD/mapas nos quatro caminhos,
grafo live/saved/current/boot, pacote/manifest/index, lock, espaço/inodes, PIDs/start
ticks/restart counts, dump/marker e GETs seguros. Depois: exigir ausência literal
dos quatro caminhos, preservação dos wrappers e metadados, ganho compatível,
identidades e hashes inalterados e os mesmos GETs. Parar na primeira divergência ou
falha; nenhuma alternativa, força ou prune.


### Encerramento relatado pelo operador

**EXECUTADO INTEGRALMENTE / VERIFICAÇÕES PASS, conforme relatório do usuário.**

Lote: `retention-ec2a9fde-redundant-runtimes-20261025`. O usuário informou execução
sequencial dos quatro comandos com exit code 0, ausência dos quatro caminhos,
zero repetição automática, nenhuma expansão de escopo e nenhuma execução parcial.
O horário exato não foi informado. Esta atualização documental não equivale a
leitura independente do recibo privado ou da VPS.

| Medida | Resultado informado |
| --- | ---: |
| Recuperação prevista | 1.964.171.264 bytes |
| Recuperação efetivamente medida | 1.964.130.304 bytes |
| Diferença entre previsão e medição | 40.960 bytes |
| Inodes recuperados | 68.696 |
| Recuperação somada ao lote anterior de cache/worktree | 3.405.754.368 bytes |

A diferença de 40.960 bytes fica registrada sem atribuição causal não demonstrada.
O total acumulado é a soma dos ganhos relatados nos dois lotes, não uma medição
atual de espaço disponível.

API (PID 118102, start ticks 3652796), frontend (PID 118502, ticks 3663031) e worker
(PID 2233, ticks 17758) foram informados como preservados; health local/público e
smokes GET-only passaram. Dump PM2, marker ativo, release instalada de retorno,
pacote, manifesto e índice permaneceram preservados, conforme relato. Os restart
counts posteriores não foram reapresentados no relatório.

O operador informou nenhuma alteração de restart, `pm2 save`, deploy, serviço,
cron, backup, dado ou chamada Meta. A existência de recibo privado e manifesto de
execução foi relatada, mas seus conteúdos não foram acessados nesta atualização.

**Pendências históricas deste primeiro registro (respondidas posteriormente pelo
operador; ver consolidação abaixo):** confirmar liberação do lock canônico e custódia
durável privada do recibo, manifesto e diagnósticos. Os caminhos de evidência
informados pelo operador eram temporários; sua existência não prova custódia durável.
Não liberar lock pertencente a outra operação e não repetir os comandos consumidos.

### Preparação histórica — outputs ef7db111 e 3630e16

O escopo abaixo preserva a preparação original, sem autorizar repetição. A execução
posterior foi relatada pelo operador e consta na consolidação abaixo.

| Origem a conferir | Destino preservado a conferir |
| --- | --- |
| `/opt/re7online/build-output/immutable-ef7db111-vps-20261024T174000Z-producer/immutable-ef7db111-vps-20261024T174000Z` | `/opt/re7online/releases/immutable-ef7db111-vps-20261024T174000Z` |
| `/opt/re7online/build-output/immutable-3630e16-vps-20261024T195842Z-producer/immutable-3630e16-vps-20261024T195842Z` | `/opt/re7online/releases/immutable-3630e16-vps-20261024T195842Z` |

Os caminhos compostos acima são alvos de descoberta baseados no layout do produtor;
sua existência, identidade e ausência de symlinks precisam ser verificadas no host.
Comparar separadamente `api-runtime` e `frontend-runtime`, sem incluir pacote,
metadados, logs ou wrappers como candidatos de remoção. A coincidência já relatada
de manifesto/índice não substitui comparação integral atual.

Aplicar o comparador corrigido, exclusão de escritores nas duas árvores, orçamento
de leitura e revalidação de estabilidade. Provar referências e dependências em duas
amostras frescas, contar blocos únicos e explicitar diferenças de modo/cache.
Preservar a release de retorno imediato da API `3630e16` e a cadeia transitiva
`ef7db111`. Produzir lista literal e ganho comprovado para revisão separada.
Qualquer lacuna, mudança ou ambiguidade mantém a classificação pendente.

## Auditoria das duas entradas de `backup-data.sh`

O crontab do usuário `deploy` contém duas linhas byte-equivalentes para 03:15. Ambas
chamam `apps/whatsapp-agent/scripts/backup-data.sh` e escrevem no mesmo log. O script
usa o mesmo `flock`, de modo que uma execução tende a trabalhar e a outra encerra
como `already running`; isso não justifica manter a duplicidade e não prova que ela
seja inofensiva em toda condição de agendamento.

Correção proposta para uma janela própria: preservar cópia autenticada do crontab,
remover exatamente uma das duas linhas idênticas, validar que reste uma ocorrência e
observar o próximo ciclo. Não alterar o script nem executar backup para testar. A
retenção destrutiva de 14 dias existente no script é um contrato separado e não pode
ser acionada por esta auditoria. Nenhuma alteração de cron foi feita nesta etapa.


## Consolidação autorizada — continuidade de 25/10/2026

Fonte: relatórios fornecidos pelo usuário e publicação documental expressamente
autorizada nesta continuidade. Não houve acesso independente à VPS ou aos conteúdos
dos recibos privados pelo autor desta atualização. Nenhum conteúdo privado desses
recibos, ambiente ou dado de tenant é reproduzido aqui.

### Lotes concluídos, conforme relatos

| Lote | Ganho observado por df (bytes) | Inodes liberados |
| --- | ---: | ---: |
| Cache npm, worktree interrompido e sidecar | 1.441.624.064 | 41.100 |
| Runtimes duplicados output/staging ec2a9fde | 1.964.130.304 | 68.696 |
| Outputs ef7db111 e 3630e16, intenção v2 | 1.964.113.920 | 68.683 |
| Worktrees 3630e16 e d7de6453 | 2.047.791.104 | 75.704 |
| **Acumulado observado** | **7.417.659.392** | **254.183** |

As variações de `df` incluem atividade concorrente do filesystem; não equivalem à
soma exata dos blocos dos candidatos nem constituem medição atual de espaço livre.
No lote dos worktrees, os candidatos alocavam 2.046.787.584 bytes. A diferença para
o ganho observado fica explícita, sem atribuição causal independente.

O lote ef7db111/3630e16 foi relatado em 25/10, 10:55:46–10:58:21 America/Fortaleza.
As remoções dos worktrees foram iniciadas em 25/10, 14:40:03 e 14:40:39 UTC,
respectivamente. O operador confirmou ausência dos caminhos e registros Git,
execução sequencial sem força, retry ou expansão, preservação das identidades de
API/frontend/worker, dump e marker, e health local/público aprovado. Nenhum restart,
deploy, `pm2 save`, alteração de cron ou chamada Meta foi relatado.

A custódia durável privada do lote ec2a9fde foi confirmada pelo operador com 19
arquivos e hashes iguais aos originais. Para ef7db111/3630e16 foram confirmados 69/69
arquivos. Para os worktrees foram informados recibo final e prova de encerramento
do lock na custódia durável. Diretórios `0700` e arquivos `0600`; conteúdo privado
não publicado. Essa confirmação é atribuída ao operador, não a uma nova leitura
local do autor.

### Bloqueio vigente reconciliado

A última janela dirigida d7de6453 sustenta o uso de
`/opt/re7online/backups/converta-persistent/.deployment-window.lock`, com `flock`
exclusivo e não bloqueante por descritor mantido desde as amostras frescas até a
inspeção final e o `fsync` do recibo. O arquivo permanece preservado; a posse se
encerra pelo fechamento do próprio descritor, sem liberar lock alheio.

`deploy.lock` pertence ao driver/helper histórico e não comprova exclusão mútua com
o procedimento dirigido vigente. O operador confirmou o lock vigente livre e
preservado após os últimos lotes. É uma observação datada, que não dispensa nova
aquisição e verificação em operações futuras.

### Pendência separada: output d7de6453

Os dois runtimes do output d7de6453 permaneceram intactos e pendentes. A listagem
somente leitura do pacote preservado retornou exit 0, stderr vazio e 34.352 membros,
correspondendo às 34.349 entradas indexadas mais raiz, manifesto e índice, sem
duplicatas. A listagem demonstra legibilidade e membros, sem substituir prova
byte a byte após extração independente. A recusa anterior e o estado `NOT_PROVEN`
da captura interrompida permanecem históricos. A release ativa não integra limpeza.

### Preparação histórica a62da468 e preparações falhas — anterior à execução

Duas amostras integrais e estáveis, segundo o operador, comprovaram igualdade entre
o payload original e a preparação preservada por falta de uploads. Frente ao
payload corrigido autenticado, o original apresentou zero entradas removidas ou
alteradas: o corrigido acrescenta 66 entradas (59 arquivos e sete diretórios),
503.154 bytes aparentes. Assim, o payload original não apresentou conteúdo de
arquivo exclusivo na comparação informada. Isso não autoriza apagar pacote,
metadados ou diagnósticos.

Os acréscimos incluem módulos de uploads e outras dependências; a classificação foi
baseada em conteúdo, não no nome da falha. O pacote corrigido passou, conforme
relato, em SHA-256, `xz -t` e `tar -tJf`, com 34.351 membros correspondentes às
34.348 entradas do índice mais raiz e dois metadados. A release VPS inclui nove
caminhos gerados em runtime sob dados/cache e foi preservada integralmente.

| Candidato identificado | Blocos recuperáveis informados |
| --- | ---: |
| API do output original a62da468 | 336.887.808 bytes |
| Frontend do output original a62da468 | 644.460.544 bytes |
| API da preparação missing-openai-uploads | 336.887.808 bytes |
| Frontend da preparação missing-openai-uploads | 644.460.544 bytes |
| Worktree a62da468 | 1.023.070.208 bytes |
| Worktree source da falha missing-prisma-generate | 351.805.440 bytes |
| Worktree source da falha node-heap-oom | 389.021.696 bytes |
| **Potencial informado, ainda não executado** | **3.726.594.048 bytes** |

O operador não encontrou hardlinks cruzados entre esses sete candidatos. O
subdiretório `releases/failed-preparations` não foi contado novamente no total de
`releases`.

Worktree a62da468: tracked/untracked limpos, 30.917 ignorados, 41 symlinks internos
válidos, sem configuração privada, dados, backups, logs ou evidências únicas
identificados. API compilada equivalente; frontend com bytes/tamanhos
correspondentes, 1.119 diferenças somente de modo e quatro entradas de cache
exclusivas. As falhas antigas tiveram dependências/compilados separados de seus
inventários diagnósticos externos; não foram identificados arquivos regulares em
`residue` nem cores, dados ou configuração privada dentro dos worktrees.

Duas amostras privilegiadas relatadas cobriram 147 processos, 11 namespaces de
montagem e dois de rede, sem erros ou referências aos caminhos auditados. A leitura
estática de 317 arquivos encontrou apenas os três registros administrativos Git de
worktree. Essas observações não substituem as verificações frescas da futura janela.

Permanecem protegidos: releases externa e VPS, pacotes original/corrigido/externo,
manifests, índices, logs, inventários, configurações v1/v2, transações históricas,
retornos e evidências. Os sete caminhos são candidatos, não um lote autorizado.

Antes de retirada: confirmar custódia durável dos diagnósticos e evidências que
foram informados como temporários, fechar intenção e comandos literais, preservando
o comparador e o controle vigente de concorrência, duas amostras frescas e autorização
específica. Worktrees somente por `git worktree remove`, sem força; runtimes somente
por seus caminhos literais, sem remover os diretórios documentais pais. Parar na
primeira falha e inspecionar sem replay. Nenhuma nova exclusão está autorizada por
este documento.

## Encerramento relatado do lote a62da468 — 25/10/2026

Fonte: relatório final fornecido pelo usuário nesta continuidade. O autor desta
atualização não acessou a VPS nem os recibos privados. Este registro documenta uma
execução passada; não autoriza repetição dos comandos históricos.

Lote `retention-a62da468-failed-preparations-ready-v7-20261025`, informado como
COMPLETED: sete comandos tentados, concluídos e verificados, sete caminhos removidos,
zero falhas, sem retry automático, força, prune ou expansão. O operador informou o
lock mantido até a inspeção final e o fsync do recibo, depois livre, sem remover seu
arquivo nem liberar lock alheio. Nenhuma alteração de serviço foi relatada. O resumo
final não reapresentou PIDs/start ticks ou saídas de health; não se atribui a esta
atualização uma nova verificação dessas superfícies.

| Medida | Antes | Depois |
| --- | ---: | ---: |
| Bytes usados | 65.170.415.616 | 61.442.281.472 |
| Bytes disponíveis | 16.899.518.464 | 20.627.652.608 |
| Inodes usados | 1.407.977 | 1.278.864 |

Ganho observado neste lote: **3.728.134.144 bytes** e **129.113 inodes**. O potencial
anterior era 3.726.594.048 bytes; a diferença de 1.540.096 bytes fica registrada sem
atribuição causal independente. Variação líquida de filesystem inclui outras
atividades e não equivale necessariamente aos blocos dos candidatos.

Somados aos quatro lotes anteriores relatados: **11.145.793.536 bytes** e
**383.296 inodes** recuperados. A soma não representa crescimento ou limpeza somente
de um dia. O saldo de 20.627.652.608 bytes é a medição pós-lote informada, não
capacidade atual certificada para uma operação futura.

Recibo, log de comandos e duas amostras foram informados com hashes finais. A
custódia durável das evidências finais deste lote ainda não foi confirmada nesta
conversa. Confirmar pelo procedimento de preservação já versionado, reutilizando
origens encerradas e destino novo, sem copiar novamente payloads e sem remover
originais ou parciais. Esta pendência não altera o relato de execução dos sete
comandos e não autoriza repeti-los.

As tentativas anteriores negadas permanecem encerradas e preservadas. O incidente
local e as limitações de recuperação de conteúdo não versionado continuam sob
tratamento próprio; o sucesso desta limpeza não comprova sua recuperação. Outputs
e releases fora dos sete caminhos, inclusive os runtimes d7de6453 pendentes, seguem
sem autorização adicional de retirada.

## Encerramento aa9527 — 29/10/2026

A geração `immutable-aa9527cc-vps-20261029T222733Z` terminou
`DEPLOYED_SANITIZED`. Frontend aa9527 ficou ativo; API 754281d3 e worker e2e7
foram preservados. O owner aceitou a visibilidade de consentimento positivo e
negativo no filtro Automação, sem regressão nos demais filtros.

A finalização executou um único `pm2 save`, publicou marker
`79e761dbfa404f8a932661550aba7d2a4ab3f1e08815dbefdc3018a3a059634c` e
validou o dump `c7ace2d4d8c8d7edf7ab39e6195bbb9f2318720c6e1e0c08f7f52a149b9f141b`.
Retenção: 3/3, zero remanescentes, sem retry; recibo
`5693ae8ba680e7ac411a8eb8647916d641d77870bd95e96a8ba4b064df7a64ba`
e log `af4a7b0f7290c5b1ecee07c9085d749bd7b40211005f932693d94738f2cdf2df`.
Não repetir build, instalação, ativação, save ou retirada desta geração.



## Recuperação mínima de 30/10/2026 — COMPLETED

Fonte: relato operacional do owner/Codex local; o editor não reinspecionou a VPS.
O lote do cache npm e runtimes derivados d7de concluiu 3/3, com os três caminhos
verificados ausentes. Não repetir auditoria, prepare ou retirada desse lote.

| Evidência | SHA-256 |
| --- | --- |
| Plano PASS reutilizado | `23a3d7968457131f623c160bfe8e95e52ef3636061b6ad88771d793751a07833` |
| Intenção | `c765121c7c38c8b8774214b3c721d79e2483a22a9ee0c05c3b270a226485a7e1` |
| Comandos | `5d55ee88992feb3a8ed23fdd5621d8675210b641119f635ee15f02346e451015` |
| Autorização consumida | `eb2196d8ab2243d131a716b4df99c3dd95511f9f155d13296a526c4211894a48` |
| Receipt COMPLETED | `97a121df8fab427ada569652c7d9f45ee04fe4d9a5c93c032daa65dfd1b817f8` |
| Journal | `9baa07a07f14bdc00e2c62d1374547dd41e8ed534d6968ed554d346e596dc338` |

Controle integrado pelo PR #288, merge
`9b2169d4e74c0d1c7ae5fb363f31ea753112b326`; ferramenta
`d9ad6327c9dec5a7aafd3a0da9bf2c9cdc484c82089bf75b14781ce59dd27fda`.
Saldo informado após o lote: 9.672.007.680 bytes. É uma medição histórica daquele
checkpoint, não capacidade atual reservada. O valor de recuperação qualificada do
plano não deve ser apresentado como medição independente do ganho líquido final.

A geração Tendência foi depois construída/instalada inertemente e consumiu espaço;
seu estado está no [registro da frente](backlog/TENDENCIA_HANDOFF_PERSISTENCE_P00_2026-10-30.md).
O acervo maior de preparações/releases continua sem saneamento global concluído.

## Tendência fa63994a — DEPLOYED_SANITIZED

Fonte: relato final do owner/Codex local em 30/10/2026; sem reinspeção da VPS
pelo editor documental.

A release `immutable-fa63994a-vps-20261030T153352Z` foi construída uma única vez.
A perda do transporte SSH não provocou rebuild: o produtor sobrevivente concluiu a
compressão e publicou o lifecycle `COMPLETE`. Após aceite integral do owner, a
transação executou um único save e fechou com retenção 3/3.

| Evidência | SHA-256 |
| --- | --- |
| Pacote | `c397b392ced3c3e676b028adb3cc1002c35f3baab4c62a199e0585e82644ca11` |
| Manifesto | `dd3fdf37f6182f616a6c0dc3ec49d35f0e7a60adb489630e9e77ab505f073f3d` |
| Índice | `b347956578e1652b4de104d031620a050860b57af2f238ffdc632b3848ab35e7` |
| Dump final | `440c5ed4631ff8715a33af0938bd032dff86451f0f79039273d067234d28b280` |
| Marker | `99bdae5577e9f205ae030ed46770224e1dde6795b6a97fd3967fa3be24d50614` |
| Retention receipt | `d7c7630bb4ca7b9a9ee47fdb3fb45e726af0832120229faabaee9636657ac7fc` |
| Journal final | `cfb74cd7ad5c58bceaae1ca5b8b9f93d4186ad4c2592f4b9bf9039f0becf2f2c` |

O lock canônico foi removido e os três caminhos derivados foram verificados
ausentes. O saldo final relatado de 8.012.804.096 bytes é histórico. Não repetir
build, instalação, preflight, ativação, save ou retenção.

A próxima classificação de artefatos segue
[PROJECT_SANITATION_AND_RETENTION_P00_2026-10-30.md](backlog/PROJECT_SANITATION_AND_RETENTION_P00_2026-10-30.md).
Ela separa ativo, rollback, evidência, dado único, derivado e duplicado; idade ou
tamanho isolados não autorizam retirada.
