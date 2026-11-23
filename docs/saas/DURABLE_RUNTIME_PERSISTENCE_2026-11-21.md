# Persistência durável de runtime entre releases

**Estado:** `DURABILITY_LOCAL_VALIDATED / CUTOVER_CONTRACT_QUALIFIED / NOT_DEPLOYED / OWNER_REVIEW_REQUIRED`.

**Baseline composto autenticado:** branch `review/campaign-recovery-20260926`,
HEAD `b8f45210665d9657b607ab91355c3f646f9079d9`, árvore
`e333b74a074cd8e934aba40b38da5af02f9f5af8`; PRs #440/#441 integrados,
sem efeito produtivo nesta qualificação.

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

## Contrato de cutover no driver canônico

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
sido promovido, com aggregate receipt já `VERIFIED`**. Antes dela, falha retoma
CB no symlink original; o aggregate receipt eventualmente já publicado é
replay-safe e não autoriza duplicar reconciliação. Depois dela, rollback da API
só é seguro para release que consuma a mesma raiz externa. A promoção substitui
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
