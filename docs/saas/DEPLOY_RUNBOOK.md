# Runbook canônico de deploy

Este documento permanece limitado a 340 linhas pelo validador obrigatório do job
`Repository contracts`; mudanças que excedam o teto devem extrair detalhes para a
documentação operacional especializada, não ampliar silenciosamente o limite.

Esta é a única instrução executável vigente para releases normais do Converta e aplica
os [princípios fundamentais](WORKING_PRINCIPLES.md). Arquitetura e razões dos gates
ficam no [modelo operacional](DEPLOYMENT_OPERATING_MODEL.md).

As fases preservam a nomenclatura de estado `preflight`, `activate`, `finalize`,
`rollback` e `status`; seus resultados nominais são `PREFLIGHT PASS`,
`AWAITING_ACCEPTANCE`, `DEPLOYED`, `DENIED_BEFORE_MUTATION` e `ROLLED_BACK`.

## Pré-requisitos

- target e control plane aprovados em CI;
- release imutável de API/frontend selada por `scripts/converta-release.py`;
- build único na VPS em worktree Linux x86_64 isolado, Node v20.20.0, com capacidade conferida; esse local de build já está autorizado pelo owner;
- builder externo somente como alternativa decidida separadamente; a autorização da janela de ativação continua obrigatória;
- pacote, manifesto, índice, BUILD_ID e entrypoint integralmente verificados;
- release extraída em destino novo sob `/opt/re7online/releases`;
- configuração privada e retorno autenticados, dump anterior e symlinks capturados;
- PM2 6.0.14, worker fora do impacto, lock global livre e autorização da janela;
- migration/SQL classificados antes da janela.
- contrato privado de capacidade revisado conforme [ciclo de vida dos artefatos](DEPLOY_ARTIFACT_LIFECYCLE.md), incluindo pico temporário e reserva operacional.
- recuperação extraordinária segue a [política canônica](CAPACITY_RECOVERY_POLICY.md), `scripts/capacity-recovery.py` e o supervisor durável `scripts/capacity-recovery-supervisor.py`; archives são lidos em streaming, `TarFile.members` é liberado por membro e duplicidades usam registro binário privado com cache/disco limitados; cada fase preserva telemetria JSONL limitada de memória e progresso, sem conteúdo ou credenciais. A correção de cardinalidade ensaiada localmente não autoriza repetir a tentativa produtiva interrompida.

Nunca construir no runtime ativo, reconstruir durante ativação, importar ambiente do
shell, derivar definição executável de introspecção, usar `--update-env`, executar
`pm2 flush` ou repetir automaticamente uma tentativa negada.

Antes de consumir uma tentativa, consultar exclusivamente o health público da API em
`https://converta.re7online.com/agent-api/health`: exigir HTTP 200, JSON, `ok=true`
e `db="ok"`. Host administrativo ou `/health` do frontend não comprova a API.

## Preparação e retomada sem reiniciar a geração

A automação integral das fronteiras permanece aberta no [P00-D](backlog/DEPLOY_PREPARATION_PREFLIGHT_CONVERGENCE_2026-10-29.md); a documentação não a declara entregue.

| Fronteira | Prova antes da próxima fase | Retomada |
| --- | --- | --- |
| Admissão → materialização | schema completo aceito pelo consumidor; hashes/modos/identidades | corrigir origem; publicar destino novo |
| Produtor → instalação | mesmo pacote, índice, manifesto e target | reutilizar pacote; sem segundo build |
| Fotografia → retenção prepare | contrato/lifecycle, raízes e observações current/PM2/dump/grafo válidas | nova custódia apenas do estado volátil |
| Plano PASS → capacity prepare | artefato estável e inspeção fresca completa e segura | reabrir plano original; contadores são evidência |
| Intenção → execute | autorização delimitada e recaptura sob locks | preservar parciais; continuar só remanescentes |
| Ativação → fechamento | health/identidade/aceite, um save e retenção | retomar journal sem repetir efeitos |

`observations.pm2` exige exatamente `path`, `sha256` e `fingerprintSha256`. O SHA autentica o executável; o fingerprint vem de jlist pela projeção `_pm2_fingerprint()` do consumidor, nunca do hash do binário/dump/JSON bruto. Recapturar também current/dump/grafo e preservar a fotografia negada. Antes de retenção prepare, confrontar a fotografia inteira com `generation-retirement.py::validate_operational()`. A admissão deve ser corrigida/testada contra o consumidor real antes da próxima geração normal; fixtures sem blocos obrigatórios não qualificam a fronteira.

Negativa de schema exige correção e regressão; fotografia vencida exige leitura dirigida; mudança real exige requalificação; capacidade exige separar orçamento/reserva de meta adicional; efeito parcial exige journal/receipt. Retomada após causa corrigida é registrada; retry cego, edição de prova para forçar PASS e repetição de efeitos concluídos são proibidos.

## Build once

### Gate de dívida e encerramento da geração

Antes de criar a saída, o produtor exige pelo menos 12 GiB livres, todos os
lifecycles anteriores terminais e reviews sem dívida. Excepcionalmente, documento
privado P00, fechado, temporário e ligado a target/release/hash do capacity contract
pode dispensar somente esse piso; orçamento real, pico, verificação, evidência,
reserva, inodes e checkpoints continuam obrigatórios. Ele não autoriza build nem
ativação. Candidata pendente, dívida ou review v1 `PRESERVE` continuam bloqueando.

Antes mesmo do lock de build, a política versionada autenticada deve provar
`--repo` dentro de `build-worktrees`, `--output` estritamente dentro de
`build-output` e `--installed-releases-root` idêntico a `releases`. Não ajustar as
raízes pelo comando operacional; divergência, caminho externo ou symlink nega antes
de criar output ou iniciar npm.

Esse gate pré-build autentica integralmente o hash, schema e conteúdo da política,
mas exige existência física somente das três raízes que participam do build:
`build-worktrees`, `build-output` e `releases`. Raízes opcionais não são criadas
para satisfazer a política. Em particular, a ausência de `/opt/re7online/staging`
é válida enquanto não houver `DERIVED_STAGING` pendente capaz de originar comando.
Um staging já `SANITIZED` e comprovadamente removido pelo produtor também não
reativa essa exigência histórica.

O build publica `generation-artifacts.private.json`; antes de `generation-retirement.py prepare`, `deploy-preparation-admission.py` autentica pedido/provas privados, inclusive `installation-route-qualified`, agrega negativas e só materializa atomicamente `0700`/`0600` com `copied=true`; execute com `-B`/`PYTHONDONTWRITEBYTECODE=1`, instale inertemente apenas por `converta-release.py install` (recuperação somente por manifesto privado vinculado), permita reuso byte-exato e negue extração manual, ausência, lock, symlink, owner/mode/hash ou prova divergente.
Depois da verificação do pacote, execute `scripts/generation-retirement.py prepare` com o contrato,
lifecycle e fotografia operacional autenticados. A intenção resultante e seu
hash integram a autorização de ativação; o executor frontend-only autentica ambos
antes de selecionar o symlink. A preparação contém somente metadados, comandos e
hashes, nunca cópia de runtime; `RELEASE_RUNTIME` só entra quando já estiver `RETIREMENT_READY` fora de todos os grafos protegidos.

Exceção única e fechada: `immutable-123ba7bd-vps-20261026T200100Z` foi produzida
antes desse contrato e está classificada como `LEGACY_PRE_CONTRACT`; ela nunca
teve review v1 `PRESERVE`. Autentique por SHA externo o descriptor versionado
`config/legacy-generation-123ba7bd.json` e execute uma única vez
`generation-retirement.py bootstrap-legacy`. O comando observa somente output e
worktree declarados, materializa contrato/review/recibo sem autorização e termina
em `LEGACY_CONTRACT_MATERIALIZED`. Só uma etapa posterior executa `prepare`.
Antes de consumir uma tentativa, contrato, lifecycle e review devem ter o mesmo pai
canônico `<generation-output>`; cópias privadas servem somente como evidência.
Bootstrap, prepare e execute usam a review canônica; arquivos idênticos já publicados
são reutilizados, enquanto o recibo privado é sempre a última publicação.
Não aplicar o bootstrap a outra geração; builds atuais já publicam contrato desde
`BUILDING`.

Há uma segunda exceção, também fechada e não generalizável:
`immutable-a959129e-vps-20261026T023100Z` possui lifecycle e review v1
`PRESERVE`, mas não possui contrato. Seu estado de origem é
`LEGACY_V1_PRESERVE_NO_CONTRACT`. Somente o descriptor autenticado
`config/legacy-generation-a959129e-v1-preserve.json` pode ser usado com
`bootstrap-legacy-a959-v1-preserve`. Esse bootstrap autentica lifecycle, review,
pacote, manifest, index, marker e a release instalada ativa. Os três derivados da
`a959` já foram retirados pelos ordinais `1`, `4` e `5` do lote autenticado
`10/10`; por isso, o bootstrap exige também o receipt e o journal exatos desse
lote, valida literalmente `ATTEMPT(PENDING)` →
`RESULT(COMMAND_EXITED_ZERO, exitCode=0)` → `VERIFIED(result=PASS)`
para todos os dez ordinais e confirma que os três caminhos não reapareceram. Só
então publica o contrato com esses derivados em `SANITIZED` e o recibo privado,
sem inventário global ou recriação de caminho. A review v1 permanece
byte-exatamente preservada. Depois, o `prepare` canônico deve receber
`--legacy-review-sha256`: ele gera zero comandos, migra a review para v2
`SANITIZED` e libera o gate global sem `execute`. A release instalada ativa é
`RELEASE_RUNTIME/ACTIVE_DEPENDENCY` e nunca integra comando destrutivo. O
bootstrap da `123ba` não serve para a `a959`, nem o da `a959` serve para qualquer
terceira geração.

O procedimento legado de `d436/f160` com descriptors fechados e ordinais `2/6/7` (rollback) e `3/8/9` (ativa) foi concluído em 27/10/2026: dois prepares sem comandos, reviews v2 `SANITIZED` e um único gate global `PASS`. Não repetir os bootstraps nem tratá-los como etapa vigente do próximo build.
Em `f160`, somente o cache literal documentado é overlay efêmero; pacote/índice seguem estritos e sua retirada isolada é proibida.
O contrato produzido por gerações atuais deve declarar byte-exatamente `privateDataOverlay` para reservar somente o caminho literal `api-runtime/.data` como `PRIVATE_DATA_NEVER_RETIRE/ACTIVE_DEPENDENCY` na release instalada. `privateDataPolicy` sozinho não habilita overlay. Pacote e índice continuam estritos; o driver autentica contrato/hash, confinamento, diretório físico, owner/group da release, modo sem escrita por grupo/outros e ausência de symlink antes da ativação. Na verificação do pacote ou release-root inerte, o overlay pode estar ausente; as duas observações devem concordar sobre a presença, e a identidade física só é comparada quando presente. A projeção estrutural exclui somente esse subtree: drift externo é `DENY`, conteúdo interno mutável é permitido e o overlay nunca origina comando isolado de retenção. O binding legado da `a959` permanece apenas para seu bootstrap histórico; não é copiado para gerações atuais. Não mover ou indexar `.data`; dados mutáveis futuros devem migrar para persistência externa à release.

A release `0fdec` foi produzida antes do campo explícito. Sua única continuação admitida exige manifesto privado autenticado, fechado à release/target, SHA do contrato original, intenção de retenção e transação já aberta, além da identidade física do overlay e do estado `FAILED/recoveryAction=finalize`, aceite existente e `saveCount=0`. O manifesto é aceito somente por `finalize`: não autoriza preflight, ativação, outra transação ou outra geração.

No fluxo fixed-current, o `preflight` aceita somente `--components api` ou `--components api,frontend` e exige `--generation-retirement-*` e manifesto privado do runtime, sem bindings PM2/`validate-pair`. O payload permanece API+frontend integralmente verificado; no modo API-only, frontend e worker são dependências preservadas. Após aceite, `pm2 save`, dump validado,
marker `DEPLOYED` e health final, o próprio `finalize` executa uma única vez
`generation-retirement.py execute`. Sucesso encerra em `DEPLOYED_SANITIZED`. Na retirada autônoma pós-rollback terminal, `execute` cria o `deploy.lock` ausente por `O_CREAT|O_EXCL|O_NOFOLLOW`, `0600`, binding à intenção, `fsync` e `flock`; existente continua autenticado, ocupado nega e o arquivo criado permanece físico/livre após o recibo.
Falha de retirada não reverte o deploy aprovado: encerra em
`DEPLOYED_RETENTION_INCOMPLETE`, preserva parciais e bloqueia qualquer novo build
até reconciliação. Os cinco comandos públicos do driver permanecem inalterados.
Não usar retry, force, prune, glob ou caminhos alternativos.
Retomadas sucessivas encadeiam cumulativamente os hashes dos intents, receipts e
journals anteriores; cada nova autorização contém somente caminhos ainda pendentes.

Na preparação ou execução da retenção, qualquer `DERIVED_STAGING` ainda pendente
ativa a validação física sob demanda da raiz staging antes do lock e de qualquer
comando: diretório real, sem symlink, identidade e modo autorizados e ancestrais
seguros. Ausência ou identidade divergente é `DENY`. As raízes de evidência são
sempre autenticadas porque recebem intenção/recibo; a raiz persistente canônica
admite `deploy:deploy` em `0700` ou `0750`, nunca escrita por grupo/outros.

O fluxo frontend-only usa o mesmo executor release-bound nas fases `activate` e
`finalize`. Depois do aceite, `finalize` revalida o trio, executa um único `pm2 save`,
valida o dump, publica `DEPLOYED` e chama a retenção exatamente uma vez. Retomada usa
as evidências duráveis: não repete save, restart nem comando de retirada. O estado
terminal também é `DEPLOYED_SANITIZED` ou `DEPLOYED_RETENTION_INCOMPLETE`.

Para uma ativação frontend-only, a ordem canônica é obrigatória: produzir uma
única vez o artefato funcional; obter os hashes finais do pacote e o BUILD_ID;
materializar, em uma alteração separada de control plane, o executor
release-bound a partir do executor versionado homologado; revisar e integrar
esse control plane; preparar a transação exclusiva; e somente então solicitar a
autorização da janela. A ausência do executor da nova release antes do build não
é bloqueio, porque seus bindings dependem da identidade final do artefato. Não
antecipar bindings com valores estimados nem reutilizar um executor vinculado a
outra geração. O commit de control plane que materializa os quatro bindings
(`TARGET`, `RELEASE`, `EXPECTED_PACKAGE` e `RETURN_RELEASE`) é posterior ao
target funcional por desenho; isso não muda o target do runtime nem autoriza novo
build.

Quando o merge apenas integra um head já aprovado, a CI pode ser transferida ao
merge somente com prova Git de igualdade exata das árvores e zero arquivos
diferentes. Preservar SHA das duas árvores, head testado, merge e run da CI. Qualquer
diferença de árvore exige CI própria do target resultante; não criar commit vazio
apenas para fabricar execução.

```bash
TARGET=<sha-completo>
RELEASE=immutable-<sha-curto>-<timestamp-utc>
EPOCH=$(git show -s --format=%ct "$TARGET")
python3 scripts/converta-release.py build \
  --repo "$PWD" --target "$TARGET" --release-id "$RELEASE" \
  --components api,frontend --output <saida-exclusiva> \
  --source-date-epoch "$EPOCH" \
  --capacity-contract <capacity-contract.private.json> \
  --root-policy config/deploy-artifact-roots.json \
  --root-policy-sha256 <sha256-autenticado>
python3 scripts/converta-release.py verify \
  --package <saida-exclusiva>/$RELEASE.tar.xz \
  --target "$TARGET" --release-id "$RELEASE" --components api,frontend
```

`RELEASE BUILT` e `RELEASE VERIFIED` são obrigatórios. Diagnosticar primeiro
`failure-evidence.private`; seu conteúdo não vai para stdout ou Git. Rebuild cria
nova release. Retry reutiliza o mesmo pacote autenticado.

O produtor nega antes do primeiro `npm` quando a soma do crescimento do worktree,
payload, temporários de pacote, extração de verificação, evidência e reserva excede
bytes ou inodes disponíveis. Ao fim, revisar `generation-lifecycle.private.json` e
classificar imediatamente a geração; `PENDING` não autoriza outra cópia nem retirada.

O produtor exclui uploads/dados operacionais da aplicação, mas preserva dependências
sob `node_modules`, inclusive diretórios internos chamados `uploads`. O índice fechado
e a extração independente comprovam que não há cache, segredo, worker ou arquivo
adicional.


### Extração e verificação sob a máscara operacional

O produtor é arquivo regular, legível, não symlink e autenticado por SHA-256;
invocá-lo explicitamente por `python3`. Bit executável não é requisito.
Manter `umask 077` nas evidências privadas. Ao extrair o pacote já autenticado
para staging exclusivo, usar `tar --same-permissions -xJf "$PACKAGE" -C "$stage"`.
A opção preserva os modos do pacote; não autentica os bytes. Executar a verificação
canônica integral do release-root antes da instalação inerte e da seleção.
Não corrigir divergência com `chmod -R`, ignorar modos ou reconstruir o pacote.

Em 26/10, a extração comum sob UID deploy/umask 077 produziu raízes 0700 em vez de
0755. O verificador negou antes da seleção. O produtor já isolava sua própria umask;
isso não protegia o tar externo. O ensaio deve executar o bloco completo de
verificação do pacote → extração → verificação integral → instalação inerte,
na máscara operacional e, quando disponível, no UID executor. Simulação de política
de permissões sob root não deve ser apresentada como ensaio sob UID deploy.

Uma recusa preserva staging e transação. Nova tentativa usa destino novo e mesmo
pacote autenticado, após diagnóstico/correção e autorização aplicável; não faz limpeza.

## Preflight (`preflight`)

1. Adquirir o lock e confirmar ausência de outra janela.
2. Revalidar pacote/release, target, BUILD_ID, entrypoint, symlinks e retornos; autenticar o contrato do overlay literal `api-runtime/.data` e sua projeção antes de qualquer seleção.
3. Reabrir cada insumo privado e validar tipo, symlink, hash, owner/group e modo exigido pelo driver; modo do checkout não substitui o da cópia privada. Antes da autorização, exigir pai físico do receipt `deploy:deploy 0700` e receipt ausente.
4. Capturar PID, start ticks, CWD, script, argumentos, sockets e restart count do trio. Em `/proc/<pid>/stat`, separar pela última `) ` e usar o campo 20 da cauda; tokenizar o registro inteiro não serve quando o nome contém espaços.
5. Confirmar health, espaço/inodes, zero trabalho impeditivo e migration.
6. Criar evidência/destinos exclusivos e executar o preflight com exatamente os argumentos da ativação; só `PREFLIGHT PASS` autoriza pedir a frase do owner.
7. Autenticar o executor versionado; bloco inline/efêmero não é procedimento. Não executar `pm2 save` no preflight.

Bindings privados são obrigatórios somente quando a janela cria, substitui ou
executa uma definição PM2, ou altera ambiente/argumentos. Eles não são pré-requisito
para ativação API+frontend ou frontend-only que reinicia os registros PM2 existentes
sem `--update-env`. Nesse fluxo, o executor autentica pacote, release e control plane;
captura CWD/script lexicais e hash do ambiente permitido antes da troca; exige os
mesmos valores depois do restart; e chama `wait-existing-readiness` com release,
entrypoint e, no frontend, BUILD_ID autenticados. A introspecção serve apenas para provar
preservação e nunca para gerar configuração executável.

`scripts/pm2-binding-materialize.py` e `validate-pair` ficam restritos ao primeiro
caso. Não materializar bindings para satisfazer uma janela que apenas reutiliza o
registro existente. Um marker operacional `DEPLOYED` na release de retorno também
não participa da observação frontend-only.

O executor deve chamar o observador versionado com `--report`, redirecionar stdout e
stderr para arquivos privados exclusivos e sincronizar esses três artefatos antes de
qualquer decisão de retorno. Em falha, deve conservar literalmente `reason`,
`sampleCount` e `samples`. Relatório ausente, inválido ou não durável é
`READINESS_OBSERVABILITY_DEFECT`; nunca pode ser convertido em causa operacional
genérica.

## Escopo de ativação conforme a matriz de impacto

A matriz é vinculante: `config/deploy-artifact-roots.json` e `config/legacy-generation-*.json` são control plane `no_runtime`;
qualquer outro `config/` permanece desconhecido. Para impacto somente frontend:

1. preservar o symlink e o processo da API, sem restart;
2. capturar antes e depois PID, start ticks, restart count, CWD/script físicos, entrypoint e health da API;
3. promover e reiniciar somente o frontend, aplicando integralmente os gates de readiness, BUILD_ID e smoke previstos abaixo;
4. preservar o worker byte-operacionalmente;
5. em negativa posterior à seleção, retornar somente o frontend ao destino autenticado.

Qualquer divergência na API ou no worker nega a janela. O escopo reduzido não dispensa
lock, verificação integral do pacote/release, capacidade, evidência durável, aceite ou
a regra de um único `pm2 save`. O deploy não altera a guarda de campanhas: seu estado
e geração são lidos dinamicamente e preservados, salvo autorização operacional separada.

Para impacto API+frontend, seguir a sequência completa; para impacto API-only, executar somente os itens 1–3, comprovar frontend/worker inalterados e então os smokes GET-only do item 6.

## Ativação fixed-current

1. Promover atomicamente `/opt/re7online/current/api` ao runtime candidato.
2. Reiniciar `re7-whatsapp-agent` pelo registro PM2 existente, sem `--update-env`.
3. Exigir três amostras consecutivas com PID/start ticks estáveis, symlink correto, um listener 3001 DIRECT ou DESCENDANT, sem restart novo; então health local/público.
4. Só após API PASS, promover `/opt/re7online/current/frontend` atomicamente.
5. Reiniciar `re7-admin-front` pelo registro existente, sem `--update-env`.
6. Exigir três amostras estáveis, listener 3000, BUILD_ID, Login, Inbox, CRM e asset. Não acessar Modelos/Campanhas no smoke sem autorização Meta: suas leituras podem disparar sincronização de templates.
7. Provar os componentes fora do escopo byte-operacionalmente preservados e parar em aceite técnico.

O driver implementa a sequência sem `pm2 delete/start` ou `--update-env`; manifesto e journal selam nomes, retornos, PM2/allowlist, identidades e hash do ambiente permitido.

A ausência transitória do listener permite polling limitado; listener estrangeiro,
PID instável, restart, identidade/hash/BUILD_ID divergente ou health inválido nega a
janela. Preserve o primeiro erro de startup. Não ampliar timeout antes de diagnosticá-lo.

Toda negativa deve persistir o predicado nominal interno produzido pelo observador e
seu relatório sanitizado, além do rótulo da etapa externa. `sampleCount=0` não prova
timeout nem falha do processo: pode significar negativa anterior à leitura do socket,
como identidade lexical/física, symlink, interpreter, entrypoint ou BUILD_ID. Um rótulo
genérico como `readiness_failed_before_first_stable_sample` não basta para corrigir ou
autorizar nova tentativa. Primeiro identificar o predicado interno exato nas evidências
já preservadas, sem repetir a ativação.

## Aceite, persistência e retorno

Após `ACEITE TÉCNICO PASS`, revalidar o trio sem restart, executar `pm2 save`
exatamente uma vez, conferir dump regular `0600` e hash, criar `DEPLOYED` somente
depois do dump e liberar o lock. O marker registra `components=["api"]` quando somente a API foi selecionada; o frontend continua fisicamente vinculado à release anterior.

Antes do save, qualquer negativa restaura em ordem inversa somente os componentes
selecionados aos symlinks anteriores, reinicia seus registros existentes sem atualização de ambiente e comprova
identidades, sockets, health e worker. Só então declarar `ROLLED_BACK`; zero save e
zero retry. Depois do save, usar a evidência transacional para completar dump, marker,
lock e journal sem segundo save. O registro durável da execução do save prevalece
sobre journal ainda não reconciliado; preservar o histórico e registrar saveCount=1.
Uma negativa pré-save por hash, transcrição ou evidência incompatível consome somente
a tentativa daquela etapa e não prova mutação. Após um save confirmado, corrigir
exclusivamente o reconciliador/validador comprovadamente defeituoso é continuação da
mesma finalização, mediante autorização explícita, nunca retry da ativação e nunca
motivo para novo `pm2 save`.

Após transferência, continuar somente pelo wrapper versionado do modo:
`scripts/frontend-finalization-continuation.py` ou `scripts/fixed-current-finalization-continuation.py`. O protocolo único abre o lock existente sem `O_CREAT`/symlink, exige `deploy:deploy 0600`, mantém `flock` exclusivo no FD 9 herdável e define `RE7_DEPLOYMENT_LOCK_HELD=1`; após finalize terminal autenticado e evidências sincronizadas, o wrapper remove o nome canônico ainda sob o mesmo `flock` e sincroniza o diretório, permitindo a próxima criação exclusiva sem confundir arquivo livre com holder ativo; FD ou variável isolados não concedem autoridade.
No fixed-current, o driver reconfirma device/inode, owner/group, modo, herdabilidade e ocupação antes do save, preserva o inode e repassa o FD ao retirement com `--deployment-lock-fd 9`/`pass_fds=(9,)`. O wrapper libera após stdout, stderr, exit code, receipt, journal e diretórios sincronizados; saídas usam diretamente `O_EXCL|O_NOFOLLOW`, sem pré-criação.
O pedido autentica transação/driver/aceite; wrappers inline, republicar aceite, `preflight`, `activate`/restart e segundo save com `saveCount=1` são proibidos.

Validar os três registros por identidade e ambiente permitido, preservando os
valores brutos. No PM2 6.0.14, campos/aliases e variáveis permitidas podem ficar no
topo do registro ou em `pm2_env`; consultar ambos sem inventar outros defaults:

- ambiente permitido: propriedade presente no topo prevalece inclusive para `false`, `0`, vazio ou `null`; usar `pm2_env` só quando ausente, sem ampliar chaves, e negar divergência real;
- `instances` ausente/nulo no processo vivo e ausente/nulo no dump são equivalentes, sem normalização; esse é o caso comprovado do worker;
- `instances=1` no processo vivo e ausente/nulo no dump pode equivaler ao default 1 somente em `fork_mode`, com exatamente um processo vivo e todos os demais campos equivalentes; esse é o caso comprovado de API/frontend.

Não confundir campo com processo ausente, editar o dump ou repetir o save. Campo
ausente nas duas representações continua ausente; divergência real continua `DENY`.
A prova PM2 6.0.14 é reutilizável e coberta por regressão.

Falha antes de qualquer seleção é `DENIED_BEFORE_MUTATION`, não `ROLLED_BACK`.
Depois de mutação, só declarar retorno após verificá-lo. Falha de retorno ou de
publicação durável do recibo mantém o lock com controlador/detentor autenticável;
não declarar sucesso nem liberar exclusão por ausência de recibo. O handoff não
expira por prazo nem encerra por token inválido/EOF. Liberar somente pelo protocolo
privado após comprovar PID, start ticks e FD; nunca remover o arquivo do lock.

Um GET não garante ausência de efeito: `/app/campaigns/availability` só ocorre após readiness/health; não chama Meta, mas a autenticação pode atualizar a sessão. Modelos/Campanhas seguem roteiro próprio. Tentativas históricas, Deploy V2, `deploy-normal-release.sh` e executores em `/tmp` não são rotas.

## Admissão agregada e selagem integral — obrigatória

Antes de worktree/output/npm, validar conjuntamente target/tree/CI, impacto, migration, reviews, grafo, PM2, health, guarda, locks, capacidade, inodes, ancestrais, parciais, instalador inerte canônico e control plane privado com `copied=true`. `converta-release.py install` é a única rota: recuperação exige manifesto vinculado a pacote/target/release/path/device/inode/owner/group/mode, sem rebuild/reextração; pacote é `deploy:deploy 0644` e raiz instalada `0755`. Antes da selagem, avaliar e testar todos os predicados de uma vez; guarda vazia significa `open=true`, geração esperada, `(.tasks | length)==0` e `fault=null`, sem fixar `[]` contra o schema `{}`. Reportar todas as divergências antes de executar; reuso autenticado não repete build, extração, instalação nem `generation-retirement prepare`.
