# Persistência durável de runtime entre releases

**Estado:** `PROVISION_CONTRACT_LOCAL_VALIDATED / CUTOVER_CONTRACT_QUALIFIED / NOT_DEPLOYED / OWNER_REVIEW_REQUIRED`.

**Baseline composto autenticado:** branch `review/campaign-recovery-20260926`,
HEAD `6a5839e7078fde0926829e542da69852118c1ca6`, árvore
`38baff99c1208497b956c742c593b0c8c44b2561`; Frentes A+B e contratos dos
PRs #436–#443, #445 e #446 integrados, sem efeito produtivo nesta qualificação.

Este contrato especializa o modelo de releases imutáveis. Código, pacote e cache
continuam pertencendo à release; estado operacional necessário à continuidade
fica em raiz persistente autenticada, fora de `releases`. O primeiro consumidor é
`INBOX_READ_STATE_V1`; a regra não reclassifica outras superfícies sem prova.

## Inventário dirigido

| Superfície | Escritor/leitor | Persistência | Local observado | Destino correto | Gate |
| --- | --- | --- | --- | --- | --- |
| Inbox read-state (`shared`/`assigned`) | `readStateStore.ts` | necessária | `process.cwd()/.data/app-read-state` | raiz privada externa indicada por `INBOX_READ_STATE_ROOT` | qualification, preflight, acceptance e retirement |
| `.next/cache/images` | Next.js / finalize | descartável, mas autenticado no finalize | release frontend | permanece release-local | manifesto de cache V2 já integrado |
| mídia/sessões/runtime em PostgreSQL | consumidores existentes | necessária | roots externos ou PostgreSQL | manter autoridade atual | gates existentes; sem delta nesta frente |
| demais entradas de `.data` | escritores ainda não delimitados | inconclusiva | release API | preservar como `ACTIVE_DEPENDENCY` | negar retirada até classificação específica |

O defeito comprovado é apenas o read-state: a transição 41D → CB3721D4 deixou
20 chaves/aliases fora da projeção ativa. Os bytes históricos permanecem
preservados; isso não autoriza copiá-los.

## Contrato técnico

- Em produção, `INBOX_READ_STATE_ROOT` é obrigatório, absoluto e externo ao CWD
  da release. Ausência, symlink, owner divergente ou modo diferente de `0700`
  falha fechado; não existe fallback para `.data`.
- O layout continua tenant-scoped e separa `shared` de
  `assigned/<assignedUserId>`. Arquivos são `0600`, diretórios `0700` e writes
  continuam atômicos e serializados por destino. Escritores reais e reconciliação
  disputam o mesmo lock de filesystem derivado do destino; a fila em memória é
  apenas ordenação local, não autoridade de exclusão.
- Os três escritores efetivos (`markInboxConversationRead`,
  `markInboxConversationUnread` e `markInboxConversationUnreadFromActivity`) e
  o reconciliador passam pelo mesmo lock. A autoridade do lock contém target,
  boot ID, PID, start ticks e nonce; lock ativo nega, lock órfão só é recuperado
  após readback físico e prova de processo ausente/reutilizado, e autoridade
  malformada ou desconhecida permanece preservada e negada.
- Publicação de estado, receipts e aggregate receipt sincroniza o arquivo antes
  do rename/publicação e sincroniza o diretório após a troca de nome. Journal
  append-only sincroniza o arquivo e, em sua criação, o diretório. Assim,
  `VERIFIED` não depende apenas do page cache.
- Restart, candidata e rollback recebem a mesma raiz pelo ambiente PM2
  autenticado. A raiz não integra intents de retirement da release.

## Reconciliação única

O executor `readStateReconciliation.ts` recebe request privado autenticado por
SHA-256, roots com identidade física, fontes confinadas, tenant, scope e destino
derivado do layout canônico. As exclusões vêm de autoridade privada de
anonimização autenticada; journal e receipt ficam confinados à custódia. Ele:

1. autentica cada fonte e adquire lock exclusivo;
2. escolhe o maior `lastReadAt` válido por chave;
3. preserva `manuallyUnread` somente se sua observação não for anterior ao maior
   timestamp; ordenação ausente/ambígua é negativa;
4. exclui explicitamente chaves já anonimizadas;
5. usa compare-and-swap pelo hash anterior do destino;
6. registra `ATTEMPT → VERIFIED` em journal append-only e receipt exclusivo;
   retomadas antes/depois de rename e journal reconciliam o hash físico, e replay
   somente retorna `REPLAY_VERIFIED` após readback do destino.

Falha parcial preserva journal e destino. Não há rollback por cópia antiga: a
continuação autentica request, journal e hash do destino. Nenhuma reconciliação
produtiva foi executada por esta entrega.

## Gates recorrentes

`scripts/durable-runtime-persistence-gate.py` é o controle versionado isolado para
qualification, admission, preflight, activation, acceptance, finalize e retirement.
O schema 3 da admissão e o schema 4 do runtime manifest vinculam a mesma autoridade
privada; os consumidores reais invocam o gate antes dos respectivos efeitos.
Na fronteira de admissão, V1/V2 não podem mais materializar uma geração: só
reabrem um destino já existente quando o operador fornece o SHA-256 explícito do
`admission-report.private.json` selado e geração, release, target e caminho
operacional coincidem com as autoridades imutáveis 41D/CB3721D4. O predicado
`request:legacy_schema_new_generation` nega
uma nova emissão antes de qualquer diretório; API nova exige V3 + autoridade V2.
A rota V3 `frontend` continua válida sem autoridade de read-state.

- **Qualification:** classifica superfície, prova raiz externa e vincula plano de
  reconciliação.
- **Admission em builder externo:** o schema V4 não executa `lstat()` remoto por
  aproximação. Ele exige uma autoridade portátil `ROOT_PROVISIONED_VERIFIED`
  produzida por `read-state-cutover-authority.py` após autenticar, na VPS, plano,
  intent, `AUTHORIZE_ONCE`, journal, receipt e readback físico. A autoridade
  vincula operation ID, SHA de toda a cadeia e device/inode/UID/GID/`0700`; um
  receipt copiado isoladamente não é autoridade. Qualification/admission podem
  consumir essa projeção privada byte-exata, tanto no rollback sem reconciliação
  quanto no primeiro cutover com o bloco V3 integral em `PENDING`; ela não dispensa
  a leitura física nas fases produtivas nem altera a transição posterior para
  `VERIFIED`.
- **Fronteira temporal do primeiro cutover:** qualification/admission usam o
  schema V5. `runner` e `candidateStorage` ficam vinculados ao target e à
  geração por `path`, `relativePath` e estado tipado `PENDING_BUILD_VERIFY`;
  placeholders de SHA são proibidos. O build-once autenticado consome esse
  mesmo request e publica no manifesto schema 2 a autoridade compilada
  `CONVERTA_DURABLE_READ_STATE_COMPILED_AUTHORITY_V1`, contendo os hashes físicos
  dos dois módulos. `verify` reabre o request, o manifesto e os bytes do pacote;
  `install` repete a mesma verificação no destino inerte. O runtime manifest
  schema 5 vincula simultaneamente o request V5 de admission e o request V3
  derivado para preflight. O driver aceita a derivação somente quando target,
  geração, raiz, cutover, autorização, rollback e hashes compilados concordam.
  Preflight e fases posteriores nunca aceitam `PENDING_BUILD_VERIFY`.
- **Portabilidade fechada da autorização V3:** o Gate V5 preserva o caminho
  ThinkPad originalmente autenticado; nenhum consumidor o substitui por
  convenção. O request V3 pode acrescentar somente
  `authorizationRelocation`, vinculado a
  `CONVERTA_CUTOVER_AUTHORIZATION_RELOCATION_V1`. Essa autoridade privada
  autentica o campo único `reconciliation.authorization`, candidato, target,
  operação, transaction root, Gate V5, receipt de transporte e a identidade
  física completa da cópia VPS (`device`, `inode`, UID/GID, `0600`, `nlink=1` e
  SHA). Gate, derivação temporal, snapshot seal e readback reabrem a mesma
  autoridade; troca de arquivo, transação ou candidato nega. Sem relocation, os
  schemas históricos continuam usando literalmente o caminho selado.
- **Preflight:** autentica device/inode, uid/gid, `0700`, ancestrais e raízes
  candidatas/rollback; receipt de reconciliação é validado semanticamente por
  operação, tenant, scope e destino quando declarado.
- **Acceptance:** exige a mesma raiz e readback verificado de continuidade,
  aliases, scopes e isolamento.
- **Retirement:** nega se `unreconciledReleaseDependencies` não estiver vazio.

O gate não altera receipts históricos de 41D/CB3721D4: schemas 1–3 continuam
autenticáveis somente como autoridades históricas previamente seladas, sem receber retroativamente o estado
`CANONICALLY_ENFORCED`. Produção continua com a dívida conhecida até autorização
de provisionamento, reconciliação e deploy.

## Provisionamento físico separado do cutover

O provisionamento da raiz vazia não concede autoridade para inventariar,
reconciliar ou ativar. `read-state-cutover-authority.py` possui um plano mínimo
versionado que autentica somente root literal, UID/GID e `0700`, ancestrais,
executor/comandos fechados e destinos privados de lock, journal e receipt.
`prepare-provision` publica `PROVISION_INTENT_PREPARED` com
`automaticExecution=false`; `provision` somente pode executar após
`CONVERTA_DURABLE_READ_STATE_PROVISION_AUTHORIZE_ONCE_V1` byte-exato.

A execução futura registra cada comando como `ATTEMPT → RESULT`, permite
retomada apenas por readback físico compatível e encerra em
`ROOT_PROVISIONED_VERIFIED`. Replay idêntico reautentica o receipt e a raiz;
replay divergente, symlink, ancestor/owner/mode divergente, preexistência sem
journal ou concorrência negam. O plano administrativo de cutover V2 referencia
obrigatoriamente esse receipt e a mesma identidade física. Somente a autoridade
posterior do cutover contém tenants, scopes, fontes, exclusões 34/34 e rollback.
Para a topologia de builder externo, a ação
`materialize-external-admission-authority` publica, dentro da mesma custódia
privada, somente a projeção terminal derivada dessa cadeia. A projeção não cria a
raiz, não altera o receipt e não pode ser usada em `preflight` ou fases seguintes:
essas fases reabrem a raiz na VPS e exigem identidade física igual à registrada.
Ela registra a identidade da custódia de origem e o SHA do próprio pedido de
materialização. O transporte para a custódia do builder preserva os bytes; o
pedido privado P00-D fixa o SHA do destino recebido, do pedido produtor, do
`AUTHORIZE_ONCE`, do receipt e do materializador. Coerência interna de um JSON
não referenciado por esse pedido autenticado não concede autoridade.
O fluxo V1 do #446 permanece disponível exclusivamente para autoridades já
seladas; a separação não cria lifecycle alternativo nem autoriza efeitos.

## Contrato de cutover no driver canônico

### Inventário transversal de caminhos entre hosts

| Fronteira | Caminho de origem | Consumo permitido na VPS |
| --- | --- | --- |
| Gate V5 → Gate V3 | `reconciliation.authorization` do builder | somente como `source` imutável da relocation; nunca aberto na VPS |
| Gate V3 → runtime manifest V6 | binding `authorizationRelocation` | autoridade privada por path/SHA, vinculada à transação |
| preflight → snapshot seal | `destination` da relocation | reabertura física `0600`, SHA e inode antes de ler e antes de selar |
| aggregate → cutover/rollback | SHA da autorização V3 e receipts derivados | mesmo destino autenticado; nenhuma volta ao caminho do builder |
| acceptance/finalize/retirement | binding `durablePersistence` do runtime | gate revalida relocation e raiz física em cada fase |

Os demais paths absolutos do Gate V5 (raízes da release, raiz persistente,
manifest/receipt/seal e artefatos compilados) já pertencem ao host consumidor ou
são derivados por produtores explicitamente autenticados. Não existe remapeador
genérico: qualquer outro campo apontando para o ThinkPad é negativa P00-D.

O gate isolado não elimina a janela entre a última escrita da CB3721D4 e a
reconciliação. A CB é histórica, grava no próprio CWD e não disputa o lock da
raiz externa. Portanto a ativação da primeira API durável deve negar enquanto o
driver canônico não executar a seguinte seção journaled sob o lock global de
deploy:

1. autenticar CB ativa, candidata, inventário aprovado, fontes 41D/CB,
   autoridade privada das exclusões 34/34 e roots/custódia;
2. parar somente a API CB e provar ausência do PID/start ticks; frontend e
   worker ED74 continuam fora da mutação;
3. com todos os escritores CB excluídos, recapturar identidade e SHA das fontes,
   materializar os requests finais pelo runner autenticado e executar a
   reconciliação agregada; a autorização administrativa anterior limita
   byte-exatamente tenant, scope, destino, source path/release e anonimização;
4. exigir aggregate receipt `VERIFIED` por readback de todos os destinos e
   executar novamente o gate `activation` com a mesma autoridade;
5. trocar o symlink da API, iniciar a candidata apontada para a raiz externa e
   exigir readiness; somente então seguir a promoção normal do frontend.

### Papéis temporais do primeiro cutover

As quatro autoridades abaixo não são intercambiáveis nem podem antecipar o
resultado umas das outras:

**A. Grafo operacional histórico vigente.** CB3721D4 permanece selecionada em
API/frontend, ED74 permanece selecionado no worker e 41D permanece o rollback
imediato da última ativação concluída. Portanto,
`immediateRollbackReleases=41D`; `rollbackReleases` continua protegendo 41D e a
semântica histórica é preservada byte por byte.

**B. Plano da transição futura.** O runtime manifest schema 6 declara
`predecessorReleases=CB3721D4`, `candidate=A+B` e
`runtimeManifest.rollbackReleases=#444`. Esses papéis autenticam a transação
futura e não reescrevem o grafo histórico antes de qualquer efeito.

**C. Journal da operação em curso.** Somente o journal registra os efeitos
efetivamente observados de quiesce, fotografia final, aggregate, promoção,
rollback e compromisso durável. Um plano ou preflight não pode publicar esses
efeitos como concluídos.

**D. Grafo operacional sucessor.** Somente depois dos efeitos comprovados e da
publicação pela autoridade canônica posterior o grafo sucessor passa a registrar
os novos papéis operacionais. A transação futura nunca é requisito retroativo do
produtor do grafo histórico.

O journal registra separadamente `previous.releases` e
`previous.durableRollbackReleases`. Antes do aggregate verificado, uma negativa
pode recuperar a CB com a configuração original. Depois de
`AGGREGATE_VERIFIED`, qualquer recuperação usa #444 e `INBOX_READ_STATE_ROOT`,
impedindo reintrodução de um writer release-local. Esse estado ainda não é o
commit: a fronteira irrevogável é registrada em `durableCommit` somente depois
de a API candidata ser promovida e passar readiness, com boundary
`CANDIDATE_API_HEALTHY`. Falha de candidata/frontend ou rollback retomado nunca
restaura CB/41D após essa fronteira; componentes já restaurados são autenticados
e não reiniciados novamente.

A extensão local do driver usa
`CONVERTA_DURABLE_RUNTIME_PERSISTENCE_GATE_V3`: o request privado mantém o
aggregate em `PENDING`, mas já sela a autorização administrativa, os caminhos
de saída, runner, módulo e ambiente de storage da candidata, além da atestação
de rollback compatível. Depois do quiesce, o runner publica de forma exclusiva
requests, inventário, manifesto e `FINAL_SNAPSHOT_SEAL`; o driver apenas
autentica o readback e registra seus hashes no journal. Qualification,
admission e preflight aceitam somente essa pendência autenticada; activation e
fases posteriores exigem o receipt físico exato, seus receipts individuais e o
readback dos destinos. V1/V2 permanecem inalterados.

A fronteira de commit do cutover é **a candidata API saudável após o symlink ter
sido promovido, com aggregate receipt já `VERIFIED`**. Contrato temporal de
recuperação: antes de `AGGREGATE_VERIFIED`, CB somente quando segura; de
`AGGREGATE_VERIFIED` até `CANDIDATE_API_HEALTHY`, #444 sem retorno release-local;
depois de `CANDIDATE_API_HEALTHY`, somente rollback durável.
`AGGREGATE_VERIFIED` não é o compromisso irrevogável. O aggregate receipt já
publicado é replay-safe e não autoriza duplicar reconciliação. Depois do
compromisso, rollback da API só é seguro para release que consuma a mesma raiz
externa. A promoção substitui
a API pela definição PM2 candidata autenticada somente depois de `pm2 stop`,
prova de ausência do PID/start ticks antigo e aggregate verificado. O journal registra
`QUIESCE_ATTEMPT → QUIESCED → SNAPSHOT_SEALING → SNAPSHOT_SEALED → RECONCILING → AGGREGATE_VERIFIED`; retomada após
perda abrupta adota apenas o próprio lock autenticado e reconcilia receipts, sem
segunda mutação cega. Não criar outro controlador.

## Rollback da primeira transição

| Alternativa | Resultado | Custo/risco |
| --- | --- | --- |
| release mínima derivada da CB, apenas compatível com a raiz durável | **recomendada** para o primeiro cutover | exige geração canônica adicional; mantém dados e reversibilidade |
| rollback por componente, mantendo API durável e retornando somente frontend à CB | possível somente se a falha não envolver API/contrato | exige qualificação explícita do perfil misto |
| CB/41D histórica como rollback integral | degradado | volta a gravar no CWD, bifurca estado após o retorno e pode repetir o indicador verde |

Depois que existir uma release anterior já durável, ela passa a ser o rollback
normal. Nenhuma release histórica será modificada. Aceitar rollback degradado
é decisão explícita do Owner, não inferência do runbook.

A release mínima derivada da CB deve trazer `readStateStore.js` compatível com
`INBOX_READ_STATE_ROOT`. A autoridade privada
`CONVERTA_DURABLE_READ_STATE_ROLLBACK_COMPATIBILITY_V1` sela release, manifest,
index, entrypoint, módulo de storage e raiz literal; o driver recusa CB/41D
históricas sem essa atestação. O driver também executa o módulo autenticado para
provar `resolveInboxReadStateRoot()` e aplica o binding fechado somente ao
iniciar candidata ou rollback compatível; a CB anterior permanece CWD-local e
sem `INBOX_READ_STATE_ROOT`. Esta definição não cria nem autoriza a geração.

## Backup, restore e autoridade do inventário

A menor extensão do backup P1 é adicionar a raiz literal
`/opt/re7online/runtime-data/inbox-read-state` ao snapshot composto existente,
em subtree própria, preservando diretórios `0700`, arquivos `0600`, owner/group,
layout tenant/scope e SHA256SUMS. O restore deve ocorrer primeiro em raiz isolada,
autenticar manifesto, modos, identidade e hashes e somente então produzir uma
intenção separada de promoção. Isso requer alteração versionada da rotina e
contrato P1, instalação autorizada e validação do cron; não autoriza backup
manual nem presume o readback do primeiro cron já pendente.

O inventário administrativo privado enumera cada tenant/scope/destino, source
path/release e autoridade de anonimização; ele não fixa antecipadamente o hash
de uma fonte ainda viva. Depois da exclusão comprovada dos writers, o runner
autenticado deriva somente os hashes desse conjunto fechado e publica o
inventário físico, requests, manifesto e receipt de selagem. Qualquer omissão,
ampliação ou path divergente nega. As exclusões vêm de autoridade separada
derivada dos receipts privados 34/34; não podem ser inferidas de ausência, do
banco atual ou do próprio manifesto.

## Provas locais adicionais

- concorrência: segundo escritor recebe `inbox_read_state_write_conflict`;
- interrupção abrupta: processo morto por `SIGKILL` deixa autoridade que é
  autenticada e recuperada uma única vez pelo próximo escritor;
- lock desconhecido: negativa sem remoção ou substituição;
- interrupções após `ATTEMPT`, destino e `VERIFIED`: retomada sem segunda
  mutação de destino;
- replay agregado: readback de receipts e destinos; adulteração, omissão,
  expansão e drift continuam negativas.
