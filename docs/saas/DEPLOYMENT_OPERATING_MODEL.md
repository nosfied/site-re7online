# Modelo operacional canônico de implantação do Converta

**Status: CANÔNICO / API+FRONTEND 41D / WORKER ED74 / BUILDER DURÁVEL PRODUTIVO COM CLOSURE**

Este modelo deriva dos [princípios fundamentais de trabalho](WORKING_PRINCIPLES.md),
define a arquitetura e os princípios vigentes para sua aplicação à implantação.
A única instrução executável permanece o [runbook](DEPLOY_RUNBOOK.md). O estado
produtivo reconciliado em 20/11/2026 está em [CURRENT_STATE.md](CURRENT_STATE.md)
e no registro ativo
[META_DBFIRST_41D70B53_2026-11-20_DEPLOYED_RETENTION_INCOMPLETE_BUILDER_SANITIZED.json](releases/META_DBFIRST_41D70B53_2026-11-20_DEPLOYED_RETENTION_INCOMPLETE_BUILDER_SANITIZED.json),
com recibos e limites de inferência em
[CAPACITY_INVENTORY_AND_EXTERNAL_RELEASE_STANDARD_2026-11-13.md](CAPACITY_INVENTORY_AND_EXTERNAL_RELEASE_STANDARD_2026-11-13.md).

**Fotografia de fechamento, sem nova coleta:** API/frontend 41D e worker ED74
estão selecionados; BUILD_ID `xj_9UjisQqYxu-19xA1TT`, um `pm2 save`, marker
`DEPLOYED` e lock liberado. O builder 41D encerrou
`SANITIZED/CLOSURE_RECORDED` com receipt legítimo. O retirement da VPS teve zero
comandos, mas o staging autenticado permanece `EVIDENCE_REQUIRED/RETAIN`; por
isso o deploy continua `DEPLOYED_RETENTION_INCOMPLETE`, não
`DEPLOYED_SANITIZED`.

**Fechamento do padrão em 18/11/2026:** os PRs #417–#420 integraram política de
raiz durável, schema compartilhado admissão→retirement e observador privilegiado
durável. Uma geração sintética real percorreu `open`, export, negativa por
referência ativa, `prepare`, autorização e `execute` até receipt terminal, sem
efeito produtivo. A 41D comprovou depois a primeira release produtiva conjunta e
seu fechamento real. Continua aberta apenas a prova de reboot com geração ainda
aberta e retomada, além de replay real não exercitado; não são lacunas de
arquitetura.

**Incidente histórico 3/3 de 15/11/2026:** a primeira tentativa de promover `ed74c483` terminou em
rollback canônico verificado. API/frontend `fa10f4f5` e worker `e2e7f17a` foram
restaurados, `saveCount=0` e a transação é terminal. A candidata permanece
instalada e inativa, reutilizável apenas por nova transação. PRs #404/#405
corrigiram respectivamente o escopo do handoff e a identidade real dos logs PM2;
eles não converteram o journal terminal em autorização. Uma transação posterior,
independente e autenticada concluiu a promoção atualmente registrada.

**Posicionamento arquitetural vigente:** builder externo descartável é o caminho
normal de produção de novas gerações, comprovado em API-only, API+frontend e no
pacote API+frontend+worker `ed74c483`. A autorização continua sendo por fase:
documentação não autoriza build, transferência ou ativação. Build isolado na VPS
é fallback excepcional sujeito a decisão e orçamento próprios, não uma segunda
rota normal nem motivo para reconstruir geração equivalente.

**Princípio operacional:** build uma vez, transferir uma vez, instalar
inertemente, validar fronteiras/retornos/cache, ativar só os componentes
impactados, aceitar e salvar uma vez, encerrar lifecycle com recibo. A cadeia
`producer → installer → driver → wrapper → finalize → retirement` deve passar
em ensaio integrado representativo antes da primeira mutação, incluindo cache
Next gerado durante execução. O lifecycle durável integrado é o controlador
vigente; não criar mecanismo paralelo nem fazer experimentos no runtime ativo.

## Topologia canônica

- O build ocorre uma única vez em worktree Linux `x86_64` isolado no builder
  externo. Antes de `open`, o próprio ambiente chamador prova `PATH`, executáveis,
  Node `v20.20.0`, npm `10.8.2` e herança por subprocessos. O produtor canônico é
  `scripts/converta-release.py`; ativação nunca constrói artefatos.
- A admissão é derivada do contrato: todos os custos, reserva e uma margem igual ao
  envelope de evidência de falha. Não há piso estático independente. Documentos
  históricos `P00_TENANT_ISOLATION_RECOVERY` permanecem evidência autenticável da
  geração, mas não dispensam o gate derivado, inodes, checkpoints, lifecycle ou
  retenção, nem autorizam build ou ativação.
- API, frontend e, quando selecionado pela matriz, worker são artefatos completos,
  versionados e validados por índice, manifesto, extração independente e SHA-256.
- Releases são imutáveis e residem em `/opt/re7online/releases/<release-id>`.
- O PM2 aponta somente para `/opt/re7online/current/api`,
  `/opt/re7online/current/frontend` e, no perfil 3/3, para
  `/opt/re7online/current/worker`.
- Cada caminho estável é um symlink trocado atomicamente para a release aprovada.
  `/proc/<pid>/cwd` resolve o symlink e mostra o destino físico.
- A API usa `/usr/bin/node` e o entrypoint integral da release.
- O frontend usa `/usr/bin/node`, `node_modules/next/dist/bin/next`, argumentos
  `start -p 3000`, `fork_mode` e uma instância. Next não roda em `cluster_mode`.
- O worker fica fora do deploy normal quando a matriz de impacto não o altera. Quando
  impactado, ele usa o mesmo target imutável e é selecionado depois de API e frontend.

## Sequência de promoção

Cada build é uma geração com contrato de artefatos versionado. A promoção não
termina em `DEPLOYED`: depois do health final e da persistência validada, a mesma
janela encerra os derivados já autorizados da geração. O estado operacional final
é `DEPLOYED_SANITIZED`; o `finalize` canônico API + frontend executa esse
encerramento antes de liberar a janela. Se a retirada falhar, o serviço continua implantado, mas
o estado passa a `DEPLOYED_RETENTION_INCOMPLETE` e o produtor nega a próxima
geração.

O mesmo limite vale ao frontend-only: o executor versionado possui `activate` e
`finalize`; após o único save e o marker, ele executa a retenção uma vez e retoma por
receipt autenticado, sem segundo save, restart ou retirada repetida.
Quando uma transferência encerra o holder anterior, a entrada permitida é somente
o wrapper versionado do modo: `scripts/frontend-finalization-continuation.py` no
frontend-only ou `scripts/fixed-current-finalization-continuation.py` no
fixed-current. O protocolo é único: lock existente regular `0600`, FD 9 herdável
com `flock` exclusivo e `RE7_DEPLOYMENT_LOCK_HELD=1`. No fixed-current, o driver
autentica o FD antes do save, preserva o inode e o repassa ao retirement; o wrapper
retém o lock até o fsync integral e, somente após estado terminal autenticado, remove
o nome canônico ainda sob o mesmo `flock` e sincroniza o diretório. Um lock terminal
legado somente pode ser liberado pelo mesmo wrapper, com journal e SHA externos
vinculados; remoção manual é proibida. stdout/stderr/exit são criados diretamente com
exclusividade. Wrappers inline ou improvisados são proibidos.

O driver fixed-current aceita somente os escopos ordenados `api`, `api,frontend`
e `api,frontend,worker`. O pacote e o índice permanecem API+frontend nos dois
primeiros; o terceiro sela os três runtimes no mesmo pacote. No escopo API-only, somente
`current/api` é promovido e `re7-whatsapp-agent` reiniciado; frontend e worker são
dependências preservadas, reautenticadas antes/depois, incluídas na validação do dump
e nunca selecionadas ou reiniciadas. No perfil 3/3, a ordem autenticada é API,
frontend e worker; antes do worker novo, o registro anterior é removido e uma única
definição PM2 autenticada é iniciada, sem `--update-env`, seguida de três amostras
estáveis de PID/start ticks, CWD físico, entrypoint e hash. Uma falha reverte em
ordem inversa e reutiliza a definição de retorno autenticada. Entre `pm2 delete` e
o `start` válido, ausência do worker é estado intermediário autenticado, não sucesso:
o journal restaura uma única definição limpa, sem `PWD` herdado, e retoma sem
duplicar worker ou repetir efeitos concluídos. O marker registra os componentes.

O produtor registra obrigatoriamente no contrato da geração o único overlay operacional admitido,
`api-runtime/.data`, como `PRIVATE_DATA_NEVER_RETIRE/ACTIVE_DEPENDENCY`. O preflight
autentica contrato, raiz física, confinamento, owner/group e modo `0755` (leitura e
travessia para grupo/outros, sem escrita); pacote e índice jamais contêm o overlay.
O conteúdo interno pode mudar sem mascarar qualquer drift fora desse subtree. Essa
compatibilidade não substitui a migração futura dos dados para persistência externa.
`privateDataPolicy` sem a declaração fechada `privateDataOverlay` é `DENY`. A única
compatibilidade anterior é a continuação `finalize` da transação `0fdec` já aberta,
por manifesto privado autenticado e vinculado ao contrato, intenção, transação,
aceite, `saveCount=0` e identidade física observada; ela não pode iniciar preflight.

O encerramento é determinístico e limitado ao contrato daquela geração. Ele não
refaz inventário global nem comparação entre todas as releases. Package,
manifest, index, evidências, releases no grafo active/rollback/transitive-return e
qualquer `PRIVATE_DATA_NEVER_RETIRE` são invariavelmente preservados.

1. Produzir e validar um único pacote imutável no builder autorizado com
   `converta-release.py build|verify`. Na alternativa externa, transferir uma cópia
   do mesmo pacote, reconferir os hashes na VPS e verificar antes de instalar.
2. Instalar com `converta-release.py install` em raiz nova e verificar a release
   inerte. Para origem externa, [qualificar o vínculo entre os hosts](backlog/DEPLOY_PREPARATION_PREFLIGHT_CONVERGENCE_2026-10-29.md#build-externo-e-qualificação-entre-hosts)
   antes do preflight. O veredito de instalação cobre apenas a integridade local.
3. Adquirir o lock global e capturar dump PM2 e definições completas de retorno em
   arquivos privados `0600`.
4. Criar symlinks temporários e promovê-los por rename atômico somente para os
   componentes do escopo. Reiniciar por nome somente os registros PM2 existentes e
   autenticados, sem `--update-env`, preservando os demais e toda configuração privada.
5. Selecionar primeiro a API. Exigir três amostras estáveis, identidade, CWD físico
   da release, entrypoint/hash, Node, socket 3001 e health local/público.
6. Selecionar o frontend em `fork_mode`. Exigir três amostras estáveis, BUILD_ID,
   socket 3000, Login, Inbox, CRM e asset `_next`.
7. Confirmar o worker inalterado ou, quando impactado, selecioná-lo na mesma release e
   provar identidade e estabilidade. Executar somente smoke GET/read-only. Aceite
   autenticado tenant-scoped é gate humano separado quando não houver sessão
   automatizável autorizada.
8. Executar `pm2 save` exatamente uma vez, somente depois dos gates e do aceite
   aplicável. Conferir dump regular, modo real `0600` e SHA-256.
9. Criar o marker `DEPLOYED` apenas depois da validação do dump.

### Fronteira entre produção e ativação

`converta-release.py` oferece `build`, `verify` e `install`. O build exige worktree
limpo no target, toolchain previamente autenticada, saída exclusiva e
`SOURCE_DATE_EPOCH`; executa Prisma antes da API, frontend uma vez e, no perfil
3/3, npm/Prisma/build do worker uma vez, selando os componentes completos. Seu
`index.sha256` usa exatamente o schema v1 conferido por `converta-deploy.py`, e o pacote só é publicado após
fechamento, teste xz/tar, extração independente e comparação integral.
O repositório de build deve ser descendente estrito da raiz `build-worktrees` da
política versionada autenticada; uma raiz redefinida no snapshot ou um checkout
externo são negados antes do primeiro npm.

O manifesto registra target, release, componentes, toolchain, BUILD_ID, hashes dos
entrypoints API/worker, índice e campos determinísticos. Caches, `.env`, Git, logs,
evidências, uploads e symlinks externos são negados. O produtor não
possui rede produtiva, PM2, banco, Meta, configuração privada ou seleção de runtime;
essas responsabilidades pertencem à operação de ativação após autorização.

O precedente `fa10f4f5` autentica Node `v20.20.0`/npm `10.8.2` e export receipt
`012103fd…a6bb`. Em `ed74c483`, a primeira geração falhou antes da toolchain porque
o shell herdou Node 22; suas evidências foram preservadas e a sucessora independente
repetiu a prova de ambiente antes de `open`, construiu/verificou 3/3 e chegou a
`EXPORTED/AUTHORITY_EXPORTED`, receipt `c7e97d09…6cbb`. Nenhum desses fatos equivale
a upload, instalação ou deploy.

O modelo é **build once / promote the same artifact**. Builds Next independentes
podem produzir BUILD_ID diferente sem invalidar o produtor; apenas um build é
designado canônico. O empacotamento do mesmo payload congelado é byte a byte
reprodutível, e o SHA-256 do `.tar.xz` identifica o transporte. Transferência,
extração, retry e ativação reutilizam esse mesmo pacote. Reconstruir, mesmo no mesmo
commit, produz outra release com novo BUILD_ID, manifesto, índice e hashes.

### Readiness depois da seleção PM2

`online` no PM2 comprova que o processo foi iniciado; não comprova que a aplicação
já abriu seu socket. O fluxo dirigido exige três amostras consecutivas estáveis
após o restart do registro existente. O observador versionado
`scripts/pm2-definition-control.py wait-readiness`, quando utilizado, fixa prazo monotônico de 30
segundos e polling de no máximo 500 ms; seu uso não reautoriza o
driver histórico de seleção.

Cada amostra vincula PID, start ticks, identidade imutável da release, symlink
`/opt/re7online/current/<componente>`, listener IPv4 ou IPv6 e cadeia de propriedade
do socket. O proprietário precisa ser o PID PM2 (`DIRECT`) ou descendente contínuo
dele (`DESCENDANT`); daemon/ancestral, listener estrangeiro e múltiplos listeners
são negativas nominais. Mudança de PID reinicia a contagem de estabilidade dentro
do mesmo prazo. Ausência temporária do listener apenas continua o polling.

Health local e público são consultados somente depois das três amostras de socket.
O prazo expirado produz `READINESS_TIMEOUT:<component>:<port>` e obriga o retorno
pelas definições autenticadas, sem `pm2 save`, marker `DEPLOYED` ou segunda tentativa.
Os tempos monotônicos, total de amostras e resets de estabilidade são persistidos
sem ambiente ou segredos. API e frontend usam prazo de 30 segundos.

Uma negativa com zero amostras deve conservar a causa interna exata anterior ao socket;
o coordenador não pode substituí-la apenas por uma classificação genérica. Diagnóstico
posterior lê a evidência da tentativa encerrada e não reexecuta seleção/restart.

A integração do observador pertence a executor versionado, persistido e autenticado.
Bash inline não pode controlar janela: ele perde identidade revisável, linhas, comando
falho e, como comprovado na tentativa d436 de 26/10, pode descartar o relatório nominal.
O contrato mínimo é relatório `--report` mais stdout/stderr privados e duráveis; a
ausência de qualquer um em falha resulta em `READINESS_OBSERVABILITY_DEFECT`.

O observador versionado pode ser usado sem duplicar sua lógica. As duas tentativas
do driver encerradas em 24/10 permanecem como evidência histórica. O
`scripts/converta-deploy.py` vigente foi alinhado ao procedimento comprovado: usa os
registros PM2 existentes, caminhos fixed-current, restart sem `--update-env` e
readiness versionado com relatório durável. Não executa `pm2 delete/start` nem exige
bindings de definição para essa ativação.

## Definições PM2

**Metadados de introspecção do PM2 nunca são uma definição executável.** Saídas de
`jlist`, dumps, `pm2_env`, `pm2_env.env` e `/proc/<pid>/environ` servem somente para
observar o estado. Elas não podem ser espalhadas em um descritor de aplicação.

Toda definição nova usa o contrato versionado de
[`scripts/pm2-definition-control.py`](../../scripts/pm2-definition-control.py):

- `name`, `script`, `args`, `cwd`, `interpreter`, `exec_mode`, `instances`,
  `namespace`, políticas de restart/ready, `node_args` e logs são estrutura
  explícita;
- a request escolhe somente um subconjunto da allowlist por componente versionada
  no repositório; estrutura e valores vêm do artefato-fonte privado canônico e nunca
  entram em relatório ou stdout. O worker é a exceção mais restritiva: como sua
  definição é substituída por `delete/start`, o request deve selecionar o conjunto
  funcional completo de 17 nomes, sem omissão ou acréscimo;
- a allowlist separa `common`, `candidate` e `rollbackCompatibility` por componente.
  Compatibilidade de retorno não autoriza uso no candidato nem em releases futuras;
  inventário sanitizado dos nomes presentes nas duas fontes é gate obrigatório antes
  de alterar a allowlist;
- chaves estruturais, internas `pm_*`, `PM2_HOME` e `NODE_APP_INSTANCE` são negadas
  no namespace de ambiente após normalização segura de nome;
- o SHA-256 dos bytes de cada artefato-fonte é confrontado com um hash autenticado
  externamente. O digest da configuração não é autenticação da fonte;
- candidato e retorno são construídos separadamente e `validate-pair` exige papéis,
  requests, arquivos-fonte, proveniências e identidades imutáveis de release
  criptograficamente distintos. A definição PM2 pode ser idêntica entre os papéis
  quando usa `/opt/re7online/current/<componente>`; a seleção da release é provada
  pelo manifesto, hash da árvore, BUILD_ID ou hash do entrypoint e destino resolvido
  do symlink. O retorno parte da última fonte autenticada e comprovada, nunca do
  candidato nem de introspecção;
- antes da janela, ambos precisam iniciar em `PM2_HOME` isolado e portas alternativas.
  A prova compara o arquivo pretendido, o descritor carregado, o processo real,
  socket/health, BUILD_ID, serialização e restauração do retorno. A prova mantém
  `pm_cwd`/`pm_exec_path` lexicais sob `/current`, valida `realpath(__filename)` e
  `/proc/<pid>/cwd` dentro da release esperada e trata `/proc/<pid>/exe` somente como
  identidade do interpretador;
- somente definições privadas regulares `0600`, criadas em destinos novos, podem ser
  consumidas.

Os precedentes são cumulativos: PR #199 separou estrutura/ambiente/proveniência;
#200 fechou allowlists por papel; #207 autenticou manifesto privado e fontes; #231
materializou bindings; #233 dispensou bindings quando não há substituição de
definição; #401 acrescentou o worker e rollback. O gate sucessor cobre a dependência
que #401 não exercitou: produtor real de fixture, projeção privada, materializador,
`validate-pair` e preflight do consumidor no mesmo teste. Um perfil não pode ser
admitido se qualquer produtor exigido pelo consumidor estiver ausente.

Os logs possuem duas identidades: `out_file`/`error_file`/`merge_logs` pertencem à
definição canônica; `pm_out_log_path`/`pm_err_log_path` pertencem à identidade
runtime. Para PM2 `6.0.14`, com `merge_logs=false`, o sufixo final `.log` ou
`-<número>.log` vira `-<pm_id>.log`; sem `.log` e `/dev/null` não mudam. Com
`merge_logs=true`, o caminho efetivo deve ser idêntico ao configurado. Qualquer outra
alteração nega o gate.

Para o frontend, `fork_mode`, uma instância, launcher explícito e argumentos
estruturais `start -p <porta>` são obrigatórios. `env.args` é sempre uma colisão e
nega a preparação antes de qualquer processo. O scope `production` fixa a porta
`3000`; o scope `isolated-test` nega as portas produtivas `3000` e `3001`.

O socket é válido quando pertence ao PID PM2 ou a um descendente comprovado por
uma cadeia contínua de PPIDs. Um socket pertencente ao daemon PM2 não comprova a
identidade do frontend. Igualdade direta entre PID PM2 e socket também não pode ser
exigida quando o launcher comprovado cria descendente legítimo.

O registro estruturado representa essa prova com `socketOwnerRelation` (`DIRECT`
ou `DESCENDANT`) e `socketOwnerChain`, ordenada do proprietário do socket até o PID
do processo de aplicação registrado pelo PM2. A cadeia nunca termina no daemon PM2.

## Retorno

Antes do primeiro efeito, preservar as definições PM2 completas, incluindo cwd,
script, interpreter, argumentos, ambiente, controle/run frontend e políticas de
log. Em negativa:

1. restaurar as definições anteriores de frontend e API;
2. restaurar ou remover os symlinks conforme o snapshot inicial;
3. validar identidades, sockets, health e worker;
4. não executar `pm2 save` nem tentar novamente.

`ROLLED_BACK` só pode ser declarado depois da restauração comprovada. Falha em
qualquer comando de retorno mantém a execução em falha.

## Mecanismos obsoletos

Os itens abaixo são históricos e **não utilizáveis**:

- build dentro do checkout/runtime ativo ou concorrente sem capacidade comprovada;
- checkout produtivo como runtime ou destino de build/cópia;
- `scripts/deploy-normal-release.sh` e seu fluxo de cópia para o runtime ativo;
- pipeline experimental da PR #190;
- frontend Next em `cluster_mode`;
- gate que exige socket diretamente no PID PM2 sem considerar launcher/descendência;
- observador ou executor de ativação temporário em `/tmp`, inclusive polling de
  socket com amostra única logo após `pm2 start`;
- Deploy V2, controles single-use e preparações de incidente como rota normal.
- Preparações volumosas sem `preparationArtifacts` autenticado e lifecycle `OPEN`
  antes da alocação quando usam o adapter versionado. Schema legado continua
  compatível. A fronteira de equivalência é o scope; reservas abrangem somente a
  `reservationRoot` comum sob o lock do adapter. Produtores históricos/manuais não
  são tecnicamente interceptados por esse contrato.

## Histórico de produção — observação de 28/10/2026 (superada)

Naquela observação histórica, a produção usava a topologia abaixo. Outra fotografia
histórica posterior registrou API 754281d3 / frontend aa9527cc / worker e2e7;
consulte CURRENT_STATE.json e o registro ativo para as identidades atuais.

- API: target `708f018cb853a06fd6f0f1d5d920b8b35d8fb06a`, release
  `immutable-708f018c-vps-20261027T152109Z`;
- frontend: target `b96eb779f4ce091a79cf67e97bcd25be255e1af3`, release
  `immutable-b96eb779-vps-20261028T025159Z`, BUILD_ID
  `jRFzvE9WaHEtDCwGbV-EH`;
- worker: processo anterior preservado, sem restart.

O registro operacional ativo do frontend é
[`CONSENT_VISIBILITY_FRONTEND_AA9527_2026-10-29_DEPLOYED_SANITIZED.json`](releases/CONSENT_VISIBILITY_FRONTEND_AA9527_2026-10-29_DEPLOYED_SANITIZED.json).
O registro histórico que autenticava a API e a implantação técnica de mídia era
[`FIXED_CURRENT_708F_2026-10-27_DEPLOYED_SANITIZED.json`](releases/FIXED_CURRENT_708F_2026-10-27_DEPLOYED_SANITIZED.json).
Não se deve forçar um único release ID sobre componentes que foram promovidos em
janelas diferentes.

O frontend b96 foi aceito técnica e visualmente e encerrou em
`DEPLOYED_SANITIZED`, com um único `pm2 save`, retenção 3/3 e lock liberado pelo
protocolo privado. O dump final é
`67c31a1fbd95178a27be2fb248ab3c039352f3ae16c612a780096b6294d2285f`.
A omissão de `instances` no dump tem duas regras distintas: API/frontend
vivos com `instances=1` equivalem à omissão somente no PM2 6.0.14 autenticado,
`fork_mode` singleton e com os demais campos idênticos; worker ausente/nulo nos
dois lados é comparado sem normalização.

Para o ambiente permitido, o comparador PM2 6.0.14 decide por presença, não por
truthiness: a chave existente no topo do registro prevalece, inclusive quando vale
`false`, `0`, string vazia ou `null`; `pm2_env` é consultado somente quando a chave
está ausente no topo. A regra vale igualmente para API, frontend e worker, não amplia
o conjunto fechado de variáveis e mantém qualquer divergência real como `DENY`.

A guarda de campanhas permanece aberta na geração 41, sem tarefas ou fault. IMAGE,
VIDEO e agendamento passaram; não há repetição pendente. Multilote e aceites específicos
permanecem frentes separadas. Fonte: relatório do Codex local encaminhado pelo owner;
não é inspeção viva feita pelo editor documental.

## Histórico e retorno — observação de 24/10/2026

O registro estruturado vigente é
[`TEMPLATE_ADMIN_SYNC_ORDERING_2026-10-24_DEPLOYED.json`](releases/TEMPLATE_ADMIN_SYNC_ORDERING_2026-10-24_DEPLOYED.json).
O target `d7de6453aeab6d117e8d79a1dc3a0722875f39cc` roda na release
`immutable-d7de6453-vps-20261024T221500Z`; API e frontend usam `/current`, e o
worker anterior foi preservado. O BUILD_ID é `PkRjG2UDVfxCmwp-DKMQz`. O build único
ocorreu na VPS em worktree isolado por decisão explícita posterior ao upgrade de RAM.
A ativação usou troca atômica dos symlinks e restart dos registros existentes sem
atualização de ambiente. O dump final é
`5d9ae04d6df29856318992638a66deccd29a68719c129be47453d4fd4b757e13`.

A API e todas as telas previstas passaram em smoke GET-only; houve um único
`pm2 save` depois do aceite. Nenhuma migration, SQL, chamada Meta ou envio ocorreu.
A configuração tenant-scoped de Meta App ID permanece pendente em janela própria.

## Registro operacional histórico da API — superado por 911a9708

Na observação encerrada em 30/10, a API ativa da Tendência era autenticada por [TENDENCIA_HANDOFF_FA63994A_2026-10-30_DEPLOYED_SANITIZED.json](releases/TENDENCIA_HANDOFF_FA63994A_2026-10-30_DEPLOYED_SANITIZED.json); frontend aa9527cc e worker e2e7f17a permaneciam selecionados por componente. Esse registro histórico é owner-relayed e não substitui as provas privadas da VPS.

O fechamento posterior API+frontend da campanha integral está autenticado por
[`CAMPAIGN_AUDIENCE_INTEGRAL_911A9708_2026-11-02_DEPLOYED_SANITIZED.json`](releases/CAMPAIGN_AUDIENCE_INTEGRAL_911A9708_2026-11-02_DEPLOYED_SANITIZED.json).
A release 911a9708 substituiu API e frontend, preservou o worker e terminou com
retenção 3/3; agora é o retorno autenticado da geração 785bde80.

O fechamento anterior está documentado em
[`CAMPAIGN_UNCERTAIN_CONTINUATION_36B94C6D_2026-11-08_DEPLOYED_SANITIZED.json`](releases/CAMPAIGN_UNCERTAIN_CONTINUATION_36B94C6D_2026-11-08_DEPLOYED_SANITIZED.json).
A release 36b94c6d ativou API+frontend, preservou worker e retorno 17cc77a8,
executou um único `pm2 save` e encerrou retenção 3/3. A custódia de controle sucessora encerrou em `SANITIZED` em etapa própria. A posição 3
da campanha nov.02 foi reconciliada pelo plano pós-cancelamento `0ba28239…`, o
receipt foi verificado e a tarefa arquivada sem reenvio. A nov.03 permanece
cancelada, com o ordinal 588 em `unknown`. O plano `afaf9831…` foi aplicado
e a tarefa arquivada. A reabertura geral foi executada por CAS separado e a
guarda está aberta na geração 47. O [registro de campanhas](CAMPAIGN_OPERATIONS_READINESS.md#campanha-teste-nov03--resultado-de-submissão-desconhecido)
documenta os efeitos de cada etapa.
