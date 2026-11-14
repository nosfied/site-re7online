# Estado canônico do Converta

## Estado vigente — 13/11/2026: Inbox fa10f4f5 ativa, builder sucesso encerrado

**DEPLOYED_RETENTION_INCOMPLETE (fotografia terminal da transação produtiva) / BUILDER_FA10_SANITIZED / PRODUCTION HEALTHY, conforme último report.** API e frontend: `immutable-fa10f4f5-external-20261112T233820Z`, target `fa10f4f59c9a05328e536dd25a1668c3ba25939e`, BUILD_ID `4j3t9N75vsvYu9t3DoFq4`; worker `immutable-e2e7f17a-20261022T005110Z`. O record anterior `a838bd33` é **histórico e retorno da API**, não release viva. O frontend anterior `b8d284b6` é retorno imediato.

Journal terminal da implantação SHA-256 `45579306a46dbd79a963b9176531673124147e8a7e667eaef72fec7591bf11e5`; `saveCount=1`; dump `3a7566603da04a5bd2ac929b0c9c8993ea5aa587e596d23d8d97c113687eb64a`; marker `ef3cb8edde127f4de841f49f5a329e74fde4a7d34b5fe787463b20d7228fcf5d`; receipt retirement VPS `f12d8260d27f1bc041afddfe8badc0b46cd9f9a8b0a9a732f71b2ebd6a8fa18b` com **zero comandos e zero remoções**. Lock canônico liberado; três PM2 online, health local/público e guarda aberta na geração 47 na última observação. VPS: `7.080.562.688 B` e `8.743.987` inodes livres no último checkpoint informado — não é medição atual.

Builder descartável desta release terminou `SANITIZED/CLOSURE_RECORDED`: receipt `4b4f1a295e5c24acad2d03a8b816925ec46efb790db6ceddbece1c898f93ca7d`; lifecycle `b28caeaf78e0ce006736f8721a8a6ed2a855de8330f7b0934d5654c0b77d69e0`; raiz ausente, worktree ausente no Git; ganho físico atribuído `2.508.197.888 B` e 75.640 inodes com a raiz. **Não repetir deploy, save, marker ou retirada desse builder.** Permanece separada a geração falha `211724Z`, ~78.295.040 B, e as retenções históricas a838 v1/v2 protegidas; não declarar recuperação nem autorização para elas.

O lote excepcional fechado dos cinco runtimes pré-contrato terminou em
`TERMINAL_SANITIZED / DO_NOT_REPEAT`: receipt
`3fcb72eaebb343c233d417102749f7bdd0fe1b93e1bd243384ba1e6c27c1fa06`,
journal `1fb2c129e86e4f33cfa310ec4461ff0592287b50102067f63738fd116e805c94`,
5/5 comandos concluídos e ausência física verificada. O saldo passou de
`7.087.513.600 B` e `8.743.902` inodes livres para `12.142.841.856 B` e
`8.924.606`; recuperação medida de **5.055.328.256 B e 180.704 inodes**.
Produção, retornos, worker e `.data` externo foram preservados. A custódia
integral no ThinkPad, archive `e806a178…a739`, índice `43e84827…cd5` e receipt
de preservação `f9151e22…31c2` permanecem evidência recuperável e não entram em
limpeza. A autorização foi específica para os cinco caminhos e não constitui
política genérica para releases legadas.

O controle excepcional efetivamente executado foi o commit isolado
`fc58a1f3f320bfa1827af5cf4fdb6ce021d5346b`, árvore
`a18513473953272fe5011faa29a1d43a211323fa`, consumidor SHA-256
`a0cf7090…ec4c9`, helper `aedc012b…57a` e instalador `4d363aa0…f8f4`.
Ele permanece evidência histórica fechada, não control plane geral. As condições
de eventual reaproveitamento metodológico estão na política de capacidade.

A autoridade consolidada de capacidade, classes, recibos terminais, pendências e futura preferência por build externo é [CAPACITY_INVENTORY_AND_EXTERNAL_RELEASE_STANDARD_2026-11-13.md](CAPACITY_INVENTORY_AND_EXTERNAL_RELEASE_STANDARD_2026-11-13.md). O fluxo executável não mudou e continua sujeito ao runbook e aos princípios fundamentais. Os parágrafos a seguir são **fotografias históricas**, superadas por esta seção quando discutem API ativa, frontend ativo, dump e espaço atuais.

---

**DEPLOYED_RETENTION_INCOMPLETE / API A838BD33 ACTIVE / PRODUCTION HEALTHY**

## Estado vigente — API-only a838bd33 ativa, retenção externa incompleta

A reconciliação direta de 12/11/2026 confirmou a API em
`immutable-a838bd33-external-20261110T130618Z`, target
`a838bd33ea00ea49be52d61e025a36320a4154c1`. O frontend continua em
`immutable-b8d284b6-vps-20261108T132846Z`, BUILD_ID
`zguwjBfQne4CTh6dLIlfq`, e o worker `immutable-e2e7f17a-20261022T005110Z`
foi preservado. Os retornos imediatos são `b8d284b6` para a API e `36b94c6d`
para o frontend. O dump PM2 vigente é
`67006b026e108d7ab1cb728624e0eb790434227dda5d9117193fcfd835be2171`.

A implantação API-only foi aceita e finalizada com um `pm2 save`, mas permanece
`DEPLOYED_RETENTION_INCOMPLETE` por dívida no builder externo. O worktree v2
retém 1.027.608.576 bytes em `PRESERVED_RETENTION_DEBT` até 10/12/2026 às
20:59:59 de Fortaleza; faltam o inventário detalhado original autenticado e a
cobertura privilegiada de processos para o caminho exato. O worktree v1 retém
671.199.232 bytes, tem lifecycle `FAILED` e exige auditoria dirigida própria.
Esses escopos são independentes. Os dois runtimes v2 foram retirados de forma
terminal, com 982.900.736 bytes recuperados; não repetir essa retirada.
O backlog não bloqueante vigente é `EXTERNAL_BUILDER_RETENTION_DEBT`; a antiga
classificação `PREEXISTING_BATCH_ELIGIBILITY_N_PLUS_ONE` foi superada pela API
a838bd33 e permanece apenas no histórico.

A fotografia histórica de capacidade registrou na VPS 8.168.931.328 bytes e
8.778.841 inodes livres, com 91% de ocupação. No builder, registrou
198.923.218.944 bytes e 28.009.941 inodes livres; o cache npm compartilhado
ocupava 4.378.787.840 bytes. Esses valores não são reservas atuais.

A guarda de campanhas está aberta na geração 47, com zero tarefas e `fault=null`.
O grafo vigente é `b41713ac…d156`, o estado operacional `e239d8dc…20a` e o
marker `50039ed6…ecad`. O registro verificável é
[CAMPAIGN_MULTIBATCH_ELIGIBILITY_A838BD33_2026-11-11_DEPLOYED_RETENTION_INCOMPLETE.json](releases/CAMPAIGN_MULTIBATCH_ELIGIBILITY_A838BD33_2026-11-11_DEPLOYED_RETENTION_INCOMPLETE.json).

A auditoria de transição E0 encerrou a árvore histórica órfã com um único
`SIGTERM` dirigido à busca; `sort` e shell saíram naturalmente. Seleções, três
processos produtivos, dump, health, guarda e locks foram preservados. Registro:
[CONVERTA_E0_HISTORICAL_AUDIT_PROCESS_TERMINATION_2026-11-12.json](releases/CONVERTA_E0_HISTORICAL_AUDIT_PROCESS_TERMINATION_2026-11-12.json).

`nextBuildBlocked=true` no registro ativo é um gate de coordenação da geração
externa e dos escopos equivalentes, não um flag global do runtime. Uma geração
independente continua condicionada à admissão canônica, lifecycle novo,
reservation root própria e capacidade suficiente; as dívidas v1/v2 permanecem
preservadas e não podem ser apagadas ou ignoradas.

## Histórico — resultado por destinatário b8d284b6 concluído

O Codex local reportou em 08/11/2026 o fechamento `DEPLOYED_SANITIZED` de
`immutable-b8d284b6-vps-20261108T132846Z`, target
`b8d284b6b2e269e6d284dfaaadda0e79a4685572`. API e frontend estão saudáveis,
com BUILD_ID `zguwjBfQne4CTh6dLIlfq` no frontend. O worker
`e2e7f17a` foi preservado e `36b94c6d` é o retorno autenticado dos dois
componentes. O dump do único `pm2 save` tem SHA-256 `2fca8bcc84f897cc1f3df37996f55d92a661ddb3279009090babba6395e2d695`.

A reconciliação anterior ao preflight retirou somente o papel histórico de
`785bde80` da lista de rollbacks, preservando sua release e o overlay privado.
Após o aceite técnico, a finalização confirmou a ausência dos três derivados
selados e removeu o lock de deploy pelo procedimento canônico. A alocação
selada era 2.010.021.888 bytes, e a variação líquida observada foi de
2.001.498.112 bytes. O saldo final foi de 9.507.028.992 bytes e 8.813.126 inodes.
As custódias de controle ficaram fora da retirada 3/3.

A guarda estava fechada na geração 45 na fotografia do deploy. A operação
normal foi restabelecida posteriormente na geração 47, com zero tarefas e
ledger sem falha. O plano histórico `afaf9831…` foi aplicado e a tarefa foi
arquivada. Consulte o [fechamento da nov.03](CAMPAIGN_OPERATIONS_READINESS.md#campanha-teste-nov03--resultado-de-submissão-desconhecido).
Os hashes e a origem das evidências do deploy constam no
[registro terminal](releases/CAMPAIGN_RECIPIENT_RESULT_B8D284B6_2026-11-08_DEPLOYED_SANITIZED.json).

## Histórico — continuidade de campanhas 36b94c6d concluída

Fonte: execução canônica e recaptura somente leitura do Codex local em
07–08/11/2026.

A release API+frontend `immutable-36b94c6d-vps-20261107T165118Z`, target
`36b94c6da7a1f3e07d4a123d0629b35bea48b014`, está `DEPLOYED_SANITIZED`.
API e frontend apontam para a release, health local/público passou, e o worker
`e2e7f17a` foi preservado sem restart. A release anterior `17cc77a8` permanece
como retorno autenticado de API e frontend.
Os caminhos estáveis são `/opt/re7online/current/api` e
`/opt/re7online/current/frontend`; o frontend permanece `fork_mode`, BUILD_ID
`jftfT1w1Kx9ULQ1MRA5eL`.

A continuação autenticada da finalização executou um único `pm2 save`, validou o
dump `9101b1c995f07ebb4032a362812d601cee453e5884f513222b4efcf8a2ada398`,
criou o marker, retirou 3/3 derivados e encerrou o lock canônico. O journal
terminal é `12d8db1f…5562b`, o receipt de retenção é `ea418a0f…b3fd` e o
journal `ATTEMPT → RESULT → VERIFIED` é `9e5e2449…2768`. Registro:
[CAMPAIGN_UNCERTAIN_CONTINUATION_36B94C6D_2026-11-08_DEPLOYED_SANITIZED.json](releases/CAMPAIGN_UNCERTAIN_CONTINUATION_36B94C6D_2026-11-08_DEPLOYED_SANITIZED.json).

Não repetir build, instalação, ativação, save ou retenção dessa geração. O saldo
terminal medido foi 10.834.006.016 bytes e 8.847.872 inodes. A intenção selada
registrava 2.009.645.056 bytes alocados nos três derivados; o receipt não mede
bytes, mas comprova 3/3 e a ausência dos caminhos. A variação de `df` entre os
checkpoints pré e pós-finalização foi 2.017.529.856 bytes. São fontes e métricas
distintas, não um ledger aritmético, e o saldo não é capacidade reservada. O
índice autenticado contém 34.381 entradas:
30.953 arquivos, 3.387 diretórios e 41 symlinks.

A fotografia terminal confirmou API e frontend físicos em `36b94c6d`, worker
`e2e7f17a`, retorno `17cc77a8`, health local `ok=true/db=ok`, health público
HTTP 200 e lock canônico ausente.

### Custódia de controle sucessora — SANITIZED

A custódia `36b-runtime-cache-finalize-control-c7896c3d-v1` encerrou em
`SANITIZED / CLOSURE_RECORDED` pelo consumidor integrado no merge
`def461d550ff7d43115ed87ba2cd8153470e603e`. O lifecycle original
`557bea22…3000`, o receipt de materialização `3ec9ce42…9082` e o contrato
`e90ee680…0f66` permanecem preservados; o lifecycle terminal é
`4cc1bdbd…304b`.

O request schema 2 `400fd075…fdd0` vinculou exclusivamente as duas cópias
privadas às autoridades rastreadas no commit `c7896c3d…acdc`. Os receipts
individuais são `79059ea7…f1b3` para o driver e `b4b48ced…8a01` para o wrapper;
o receipt da operação é `0a0966ba…8aa` e o receipt terminal
`6a247a42…2b94` registra `TERMINAL_SUCCESS`. As autoridades preservadas mantêm
os hashes `28eeb2f3…2f98` e `c87300a0…e930`, em arquivos privados `0600`.

O worktree `/opt/re7online/deploy-control/c7896c3dd0a3` está ausente do disco e
do registro Git. Entre as leituras imediatamente anterior e posterior ao consumo,
o saldo passou de 10.713.362.432 para 10.791.366.656 bytes e os inodes livres de
8.847.843 para 8.851.504: variações observadas de 78.004.224 bytes e 3.661
inodes. A alocação original de 77.492.224 bytes e a leitura posterior do worktree
de 77.647.872 bytes continuam métricas históricas distintas, não um ledger
aritmético. O fechamento da custódia é separado e posterior à retenção 3/3 da
release; nenhum efeito da release foi repetido.

### Validação funcional posterior — criação integral e incidente de execução

No tenant Demo, a campanha `5d1e71b1-d2a4-497a-9c2d-25761d94416c`
(`Campanha teste nov.02`) foi criada com 963 destinatários persistidos. Isso valida
a correção de criação integral desta release: não houve o corte anterior em 25.

A execução posterior processou somente as três primeiras posições. Depois do
cancelamento, o plano pós-cancelamento
`0ba2823978c148ad6d144a7cc311cd00858a8660a36734b4edbf28431bac933a`
foi aplicado uma única vez, o receipt
`272cb403-94cd-42ef-9187-e31e09d73246` foi verificado e a tarefa vinculada ao hash
`ffbfc9afc11515d45ff7bba6453dbde822bd084b67688e0193612edc9a898040`
foi arquivada. A campanha permaneceu `cancelled`, com `sentCount=2`, sem reenvio;
o plano anterior `bddc415429edd96e5e20333de12fddc3fd765866b61222d5bf3da1bb53837fde`
é histórico e não consumível após a mudança de estado.

### Continuidade posterior — campanha teste nov.03

Em 08/11/2026, o Codex local relatou uma aplicação de `afaf9831…`, receipt
verificado e uma execução de `ack-task`. A guarda passou de fechada na geração
45 para fechada e sem tarefas na geração 46. Após inventário global somente
leitura, uma abertura por CAS restabeleceu a operação normal na geração 47.

O scheduler encerrou o único job reclamável como `cancelled` pelo motivo
`campaign_status_cancelled`, sem lease remanescente ou chamada adicional à Meta.
A campanha permaneceu `cancelled`, com `sentCount=587`. Permaneceram 588
intenções, 587 aceites e 587 outbounds. O ordinal 588 segue com resultado
`unknown`, sem retry, e as 374 posições posteriores seguem fora da execução.
As evidências constam no [registro operacional](CAMPAIGN_OPERATIONS_READINESS.md#campanha-teste-nov03--resultado-de-submissão-desconhecido) e no
[estado estruturado](CURRENT_STATE.json).

## Continuidade de 30/10/2026 — recuperação concluída; Tendência inerte

Fonte: relato do owner/Codex local, sem nova inspeção da VPS pelo editor. O lote
mínimo concluiu 3/3 e não deve ser repetido; recibos e saldo histórico estão no
[lifecycle](DEPLOY_ARTIFACT_LIFECYCLE.md#recuperação-mínima-de-30102026--completed).
A sanitização global do acervo ainda não terminou.

A release Tendência `immutable-059ea95a-vps-20261030T122714Z` teve build único e
instalação inerte verificada. A retenção prepare negou por fingerprint PM2 ausente;
não houve preflight/ativação. Reutilizar o pacote e a release, renovar somente a
fotografia operacional e validar o contrato do consumidor. Identidades, hashes e
retomada estão na [frente Tendência](backlog/TENDENCIA_HANDOFF_PERSISTENCE_P00_2026-10-30.md).
Naquela fotografia histórica, a produção relatada era API 754281d3 / frontend
aa9527cc / worker e2e7. Ela não descreve a seleção vigente.

A revisão de prevenção e a lacuna da admissão estão no
[plano de convergência P00-D](backlog/DEPLOY_PREPARATION_PREFLIGHT_CONVERGENCE_2026-10-29.md).
As regras de retomada estão no runbook existente; não há segundo procedimento
executável criado por esta atualização.

## Control plane de recuperação de capacidade

O repositório contém `scripts/capacity-recovery.py`, com fases separadas de
auditoria, preparação e execução autorizada. O escopo cobre o cache literal
`/home/deploy/.npm/_cacache`, runtimes derivados autenticados sob `build-output` e
classes fechadas de archives individuais de preparação. A execução relatada de
30/10 e os lotes `automation`/`hybrid-b9` são terminais; suas retiradas não devem
ser repetidas.
O `execute` recaptura referências operacionais ao vivo somente depois dos locks;
o cache exige allowlist canônica de grupo e modo próprio não gravável por
grupo/outros.
O inventário transacional reconhece os formatos canônicos fixed-current e
frontend-only, preserva como não terminais os layouts legados com referências e
nega qualquer diretório sem classificação fechada.
Consulte [CAPACITY_RECOVERY_POLICY.md](CAPACITY_RECOVERY_POLICY.md).

A fase `audit` produtiva do perfil fechado `ef7db111-deploy-control` também está
encerrada. O plano `d9aadc3614bd1ef592f55db4ad113b677d83fe3a472d8bb88bb271703b7a3d31`
terminou DENY, exit 2, com zero efeitos: duas árvores somaram 602.820.608 bytes
qualificados e duas negaram identidade interna porque continham arquivos
graváveis pelo grupo. A enumeração dirigida registrou quatro folhas Prisma em
`0775` e 1.119 folhas `.next` em `0664`, sem outro tipo de incompatibilidade.
Custódia, plano e diagnóstico são terminais; não repetir audit, não normalizar
permissões e não tratar os dois candidatos qualificados como autorização. Detalhes
e hashes estão na [política](CAPACITY_RECOVERY_POLICY.md#audit-produtivo-ef7-terminal--01112026).

A tentativa de 01/11 do lote fechado de três archives terminou por sinal antes de
plano ou efeito. A correção de cardinalidade foi integrada pelo merge
`b66fc5fd0178b4dcd87e5aa4618d3a955efaa204`; não foi executada em produção.
O ensaio complementar com subprocesso real comprovou que `SIGTERM` é registrado
pelo supervisor, mas pode deixar o registro SQLite privado no pai da telemetria;
esse resíduo é limitado e deve ser preservado/classificado por caminho literal,
não presumido como limpo pelo contexto Python.
O escopo 3/3, a telemetria preservada e a proibição de repetição estão no
[plano P00 de sanitização](backlog/PROJECT_SANITATION_AND_RETENTION_P00_2026-10-30.md).

A tentativa posterior sob o merge de control plane
`c0146133f5c2e03cce8623876c61cfe320de0c5b`, custódia
`p00-capacity-three-archives-c0146133-v1`, também é terminal e irrepetível.
O supervisor autenticou o cgroup de 256 MiB e encerrou em
`AUDIT_MEMORY_MAX`: `scopeMemoryPeakBytes=268435456`, `exitCode=-9`, escopo
vazio/encerrado e nenhum plano ou efeito. O primeiro archive concluiu 7.056
membros; o segundo chegou a `before_authority_compare`, sem progresso de membro
persistido, e o terceiro não iniciou. `memory.stat`, consumo individual dos PIDs
do escopo e progresso interno no intervalo final não foram coletados, portanto a
composição do OOM produtivo não é declarada. Request, terminal e telemetrias
permanecem na custódia; produção, dump, guarda e locks ficaram preservados.

O ensaio local dirigido mostrou a lacuna do orçamento, sem atribuir retroativamente
a causa produtiva: 180 MiB físicos aconselhados como frios, sem residência inicial
medida, autenticados pelo mesmo percurso, levaram
o cgroup exatamente a 256 MiB com aproximadamente 249 MiB em `file`, enquanto o
RSS observado permaneceu perto de 31 MiB; o kernel local conseguiu reclaim e o
ensaio passou. Payload esparso de 200 MiB e 3.000 arquivos/192 MiB descompactados
também passaram com picos do cgroup de aproximadamente 33/28 MiB. Assim, cardinalidade,
payload lógico e RSS isolados não explicam o evento; nova operação exige orçamento
com residência inicial e recuperação medidas, além de regressão de `memory.stat`, não replay do
request `2b1d438d...`.

A entrega local complementar preserva essa negativa e acrescenta observabilidade
limitada no supervisor/executor. O perfil sintético 3/3 reutilizou
458.973.184 bytes apenas como escala física declarada do lote — não como volume
descompactado produtivo — e seus archives somaram 459.113.917 bytes lógicos. A
qualificação única reutilizou a fixture e capturou sua residência imediatamente
antes do lançamento: zero de 224.144 páginas residentes, sem lacunas e sem
hashing/leitura intermediária. O autenticador 3/3 concluiu em 4,146 s no teto de
512 MiB: `oom/oom_kill/high=0`, `max=1508`, `file=515.809.280`,
`anon=19.091.456`, `kernel=1.880.064`, dirty/writeback/shmem zero e RSS somado
30.838.784 bytes. As alocações anônimas e o RSS permaneceram estáveis enquanto
`file` dominou a pressão. O cgroup desapareceu após o término, sem amostra direta
de decaimento posterior.

Não há fundamento para a fórmula pico + 128 MiB: 128 MiB era orçamento de disco
da custódia. A conclusão vigente é
`SYNTHETIC_PROFILE_512_MIB_QUALIFIED / VPS_OPERATIONAL_BUDGET_NOT_APPROVED`.
O perfil sintético frio foi qualificado; ele não prova o volume descompactado
produtivo nem explica a composição do OOM anterior. Código, regressões e essa
qualificação são somente entrega local/em revisão; nenhum novo `audit`, `prepare`
ou `execute` foi executado na VPS. Resultado, terminal, telemetria do supervisor
e plano: `1601d3ea7a357046bb3b38f24f2ea765e5f7fd33cdff3771e65bde9956e6d337`,
`2a2a4d2e20080d2de1d2a6050f636fa0d5cdff96bca2be820c4b84805f1390f0`,
`cf0357ff48713f39372f1c3616edb2c2e92b9a01a281776411f844a78e494548` e
`cc496bdb21ca7aa808fc2ed2ef875dc6eae249c26964a0583f6374c04ef3f2a5`.

A auditoria única seguinte, já terminal e irrepetível, usou o merge
`3950b67c01c10f9a3db84a06f51d45b023d9e527`, custódia
`p00-capacity-three-archives-3950b67c-v1` e request
`1d0ad4d9dae5e21bb65ea2c7150b3ddc36570e804a9c07cb83022676aa92d762`.
O scope de 512 MiB terminou em `AUDIT_MEMORY_MAX`, com pico
`536870912`, `oom=1`, `oom_kill=2`, sinal 9, encerramento confirmado, plano
ausente e zero efeitos. Terminal `9cca7e1bc6f8176f2c97e1bff941e887a4483bc997db6983c9b0b8b7ff3f3034`;
telemetrias `3240fb4dc6cdc141269e23cb0d9d568926354c7606a4977ac0d684165db22064`
e `ab4f7caa183003c9ec9148f8b3b36e6e4053e93aacc4f87af50c78663c2035f1`.
Produção, PM2, dump, guarda e locks permaneceram iguais.

O código integrado tinha um loop reproduzível para membro tar normalizado `.`:
`_authority_leaf()` subia de `root.parent` até `/` e continuava quando
`parent == current`. A correção local mínima trata `.`, `./.` e `./` como o
diretório raiz autenticado, sem subir, prova confinamento de descendentes e
mantém tipos não diretório, escapes, raiz `/`, material protegido e duplicatas
normalizadas em negativa. A reprodução anterior expirou no limite local de cinco
segundos; a regressão corrigida termina, preserva autoridade e produz digest
determinístico. Os registros históricos do 9f4 não contêm a linha de listagem ou
o comando de criação que provariam o membro `.`, portanto a causa produtiva
permanece hipótese e não conclusão.

A correção foi integrada pelo merge
`916f8d6b4e8696c821c40eec910dbca39449a319`, com árvore
`38fd61326d494a1d312a723653bfaee10d92a12d` idêntica ao HEAD testado
`e75c48280c1e56bd96e497e59acc21107a45bf31` e CI `41343829157` 4/4 PASS.
A auditoria única posterior, custódia
`p00-capacity-three-archives-916f8d6b-v1` e request
`113abf0a6f770d6353abfc1fb7479134e599b329f572d0fdd409fe3819f73c15`,
terminou antes da classificação dos candidatos com
`FILE_SHA256:operational-state.schema2.private.json`. O arquivo materializado
teve SHA-256 `fd2c68d8d0889cc55799695f55225495b4c6cf2136f3a151b93fd0e731ed0d96`,
mas o request conservou o SHA anterior `6641d581af300cd81f13ba3febffef377e4f78feb40ede7d82d886994953ea6c`.
Logo, esta foi uma negativa de binding da entrada operacional, não resultado de
nenhum dos três candidates.

O scope terminou confirmado, exit code 2, sem OOM, timeout, plano, `prepare`,
`execute` ou efeito. Terminal
`4ab144e806a8ea8ec43d013f40a6479c9d95bd557917ce51493697b3d944bdec`,
telemetrias do executor e supervisor
`7235a80d617eaa1aa25df8828798a26c2ddb657083fc3bd2a71ea9dd75ed24b5`
e `d41fde756979d9b340243d39bef0439a263b18613575fa1bc4be6abffc86596e`;
índice privado
`d2902c27a570e4a9e7d69e3278eb4ad2b3180b1a576b6fc2930a7b0a8130ce6f`.
PM2 antes/depois permaneceu byte-idêntico em
`99a4cae95105dde9391e3be83bd5cdc2f5d771a03cd972e84e37a02efcf8c308`;
current, dump, health local/público, guarda e locks permaneceram iguais. Os três
archives e as três autoridades seguem presentes. A custódia e o request são
terminais e não podem ser reutilizados.

A montagem corrigida foi consumida uma única vez na custódia
`p00-capacity-three-archives-916f8d6b-v2`. A fotografia final
`7c719d20…` foi autenticada antes da geração do request
`4cfaab66…`; a conferência integral dos bindings ficou selada em
`d53ca8c…`. O audit terminou `P00_CAPACITY_RECOVERY_AUDIT_PASS`, exit 0,
3/3 qualificados, `458.973.184` bytes/3 inodes, plano `502cc4b7…`, sem efeitos.
O cgroup atingiu 512 MiB sob reclaim, mas registrou zero OOM/kill; RSS pico do
filho 57.942.016 bytes e duração 165,185 s. A comparação posterior
`e5327224…` comprova PM2, current, dump, health, guarda e locks preservados; os
três candidatos continuam presentes. Índice `5b2635c2…`. `prepare`, `execute` e
exclusão não foram executados nem autorizados por este resultado.

O plano PASS `502cc4b7…` foi reutilizado byte-exatamente no `prepare` contido;
outro `audit` ou `prepare` é proibido. Intenção, comandos e manifesto resultantes
estão selados na custódia operacional e não são regenerados nem reescritos por
esta revisão. Nenhum `execute` produtivo foi executado ou autorizado por este
registro.

A extensão local subsequente, também somente para revisão, aplica a mesma
contenção de 512 MiB agregados, swap zero e prazo monotônico ao `execute`. A
intenção, autorização, comandos, locks e executor não são reescritos. O
supervisor autentica o journal/receipt produzidos pelo executor depois do
encerramento: três efeitos e receipt íntegro resultam em reconciliação completa;
drift antes do primeiro `ATTEMPT` comprova zero efeitos; interrupção após um
efeito resulta em `RECOVERY_PENDING`, sem replay nem receipt fabricado. Os testes
usam somente caminhos sintéticos e preservam um sentinela externo ao scope. Isso
não constitui autorização ou execução produtiva.

O `execute` autorizado posteriormente foi consumido uma única vez na custódia
`p00-capacity-three-archives-4e85ff75-execute-v1`. A contenção passou com 512
MiB, swap zero e encerramento confirmado, mas a recaptura sob locks negou antes
do primeiro efeito com
`EXECUTE_RECAPTURE_DENY:DISPOSITION_MANIFEST_FIXED_BINDING`. Receipt
`0e9631f8668abca9ce4f0be5278f66b33170b23768ba26efd2cd3bb9380b75ea`,
journal `9a2762bc291ed2230c9c324296623a72e7839b1052f03679f9b67eabed2c4cf4`
e terminal `63da187595ce756a77dd6dcc1b1062476c7b4cc956191287ada0def821a4df2a`
comprovam `FAILED_RECONCILED`, zero `ATTEMPT`, zero `VERIFIED` e zero bytes
recuperados. Os três archives permanecem presentes; saúde local continuou
`ok=true`, `db=ok`; capacidade observada após o encerramento foi
`8.388.939.776` bytes e `8.727.643` inodes disponíveis. A autorização foi
consumida e a operação é terminal: não repetir `audit`, `prepare` ou `execute`.
Não houve fechamento bem-sucedido que autorizasse avançar ao inventário ou a
outra retirada nesta janela.

O diagnóstico posterior separou caminho de conteúdo. Plano e intenção preservam
o mesmo manifesto em
`p00-capacity-three-archives-916f8d6b-v2/control/config/capacity-recovery/closed-preparation-manifest-disposition.v1.json`,
SHA-256 `b2b5bff4adeec32f12e9f32e0487a75f85fa334a3273931c88b62338b6d9f78d`.
O `prepare` consumado usou o executor físico desse mesmo control root. Já o
`execute` usou bytes idênticos do executor, SHA-256 `fa323125…`, relocados para
`p00-capacity-three-archives-4e85ff75-execute-v1/control/scripts`; seu `ROOT`
passou a ser o novo `control` e o caminho calculado do manifesto passou a apontar
para a custódia de execute, onde o arquivo não existia. Portanto a divergência
comprovada é de caminho; não houve divergência do SHA selado. A mesma falha já
havia sido antecipada pela materialização `prepare-v1`: copiar executor e
manifesto para um novo `ROOT` conservou os bytes, mas não o caminho absoluto
selado no plano. `prepare-v2` evitou-a usando o control root original; a
materialização de execute repetiu o padrão inválido.

A correção mínima em revisão mantém o audit preso ao manifesto fixo do próprio
control root. Somente `prepare`/`execute` podem reabrir o caminho e SHA
byte-exatos já autenticados na observação do plano, exigindo ainda o SHA
compilado, o mesmo sufixo canônico e confinamento à raiz de preparações. Plano,
intenção, manifesto, autorização e receipt históricos não são editados nem
reutilizados. Regressão sintética percorre roots físicos distintos de audit,
prepare e execute; drift de caminho, SHA ou confinamento continua `DENY`.

O PR #306 foi integrado no merge
`04a9650da1f827e93262873b8813aa50f9dde4b7`; o HEAD testado
`42e4dee8321e970af22e1a38f0105258c3e9c756` e o merge possuem a mesma árvore
`f22c60bacd76c0372faceff4b6ff88f66422e5b6`. A operação sucessora preservou o
plano PASS `502cc4b7…` e a tentativa anterior como terminal, selou intenção
`b3b1e7f745b6f32f0d8233ac585a69fe5be0fc57ac4964a0f4f8c6cd6e872ec0`,
comandos `725ecbdc…` e autorização `2330c848…`, e executou uma única vez na
custódia `p00-capacity-three-archives-04a9650d-prepare-successor-v1`.

O fechamento é `COMPLETED_RECONCILED`: 3 `ATTEMPT`, 3 `RESULT` e 3 `VERIFIED`,
sem `DENY`, com os três archives ausentes e as três autoridades preservadas.
Receipt `6662af796b38018af5285f552fc80090ed4fdfd29f27143bad8fdb255cbc0646`,
journal `b13da490e5dc1452ad1901cb3e84f4e2fa35514f2f2742f6b96d8201221f8744`
e terminal `2445581590eae2ad59fe09ea4c8ac055c500d8d749d4b117022d8e80a69e2ec8`
registram ganho físico de `458.964.992` bytes. O receipt mediu
`8.846.487.552` bytes disponíveis; depois de persistidas todas as evidências, a
observação final foi `8.846.467.072` bytes e `8.727.609` inodes disponíveis.
PM2, dump, grafo, API, frontend, worker, health e locks permaneceram
inalterados. Esse lote é terminal e irrepetível; nenhuma retirada adicional foi
autorizada.

A extensão mínima seguinte está implementada e ensaiada somente em checkout
isolado: `audit` roda em escopo transitório cgroup v2 do `systemd --user`, com
memória agregada, swap zero e prazo monotônico; impossibilidade de aplicar ou
autenticar a contenção nega antes do executor. Casos locais normal, OOM real,
timeout com descendente resistente, cadeia Python/Node/helper e sentinela externo
passaram. `prepare`/`execute` não mudaram. Os 256 MiB do ensaio não são orçamento
produtivo, e nenhuma nova tentativa produtiva está autorizada por esse resultado.
O fechamento revisado autentica `telemetry_started` antes de afirmar execução,
limita toda espera e publica `RECOVERY_PENDING` se não confirmar escopo vazio e
launcher encerrado. O ensaio afetado confirmou timeout com descendente resistente
e sentinela externo preservado; isso continua sem autorizar operação produtiva.

Esta seção preserva uma entrada histórica de continuidade. A topologia operacional
está no [modelo de implantação](DEPLOYMENT_OPERATING_MODEL.md), e o fechamento
ativo está no [registro 17cc77a8](releases/CAMPAIGN_RECIPIENT_CONTINUITY_17CC77A8_2026-11-05_DEPLOYED_SANITIZED.json).
O [registro aa9527](releases/CONSENT_VISIBILITY_FRONTEND_AA9527_2026-10-29_DEPLOYED_SANITIZED.json)
permanece histórico; não substitui o estado vigente.

## Fechamento frontend aa9527 — 29/10/2026

Fonte: relatório operacional e aceite visual encaminhados pelo owner; o editor
documental não realizou inspeção independente da VPS.

A release frontend `immutable-aa9527cc-vps-20261029T222733Z`, target
`aa9527cc39ae24efcd8c2bb6e653a8e04655009b`, BUILD_ID
`lHKJnVlp6Onz0FpycKR_Z`, terminou `DEPLOYED_SANITIZED`. O owner validou na
interface a pergunta e as respostas positiva e negativa de consentimento no filtro
Automação, sem regressão nos demais filtros. API `754281d3` e worker `e2e7`
permaneceram preservados.

A finalização executou exatamente um `pm2 save`, sem restart, e validou o dump
`c7ace2d4d8c8d7edf7ab39e6195bbb9f2318720c6e1e0c08f7f52a149b9f141b`.
Marker: `79e761dbfa404f8a932661550aba7d2a4ab3f1e08815dbefdc3018a3a059634c`;
estado transacional: `9c86b6ebfa6308ee4ea00ef3bbc412c70b60513239cf7dc2cc3a02fc79cb2989`;
recibo final: `c80e37abc9448ed1edf78eec40f420cb1ac595c0ee470964bed84fe139e74a23`.
A retenção concluiu 3/3, sem retry, e deixou zero derivados; recibo
`5693ae8ba680e7ac411a8eb8647916d641d77870bd95e96a8ba4b064df7a64ba`.
Guarda aberta na geração 41, tarefas zero e sem fault; health local/público
`ok=true`, `db=ok`.

## Correção P00 de configuração WhatsApp Meta — API implantada

O incidente observado após troca de release não foi falha de resolução do tenant:
PostgreSQL resolveu e persistiu o inbound, mas o gate reativo ainda dependia da
presença de `<api-runtime>/.data/tenants.json`. A API 0fdec implantou a autoridade
DB-first tenant-scoped depois dos backfills e gates selecionados de Tendência,
Justa e CRA. O fechamento está concluído e não deve ser reaberto. Contrato detalhado em
[WhatsApp Meta tenant runtime DB-first](WHATSAPP_META_TENANT_RUNTIME.md).

O produtor versionado substituiu o piso estático por admissão derivada
do contrato, preservando todos os custos, 4 GiB de reserva e margem igual ao
envelope de evidência de falha. Overrides P00 históricos continuam evidência, mas
não dispensam esse gate. A geração `immutable-911a9708-vps-20261102T221325Z`
usou essa política no build produtivo concluído e verificado; a amostragem registra
o menor saldo observado, sem alegar captura de todo pico temporário.

## Campanha integral — 911a9708 DEPLOYED_SANITIZED

O merge `911a970838233ae92e00a45ef371f619511d8602` contém a correção API/frontend
do corte em 25 destinatários. A geração
`immutable-911a9708-vps-20261102T221325Z` concluiu build único, instalação
inerte, ativação API+frontend e retenção 3/3 em `DEPLOYED_SANITIZED`. O worker
`immutable-e2e7f17a-20261022T005110Z` foi preservado, houve exatamente um
`pm2 save` e os três derivados foram verificados ausentes. Pacote, release
instalada e retornos permanecem preservados. Build, instalação, ativação e
retenção são terminais e não podem ser repetidos.

O fechamento recuperou fisicamente 2.008.760.320 bytes: o saldo passou de
7.397.990.400 para 9.406.750.720 bytes, com 8.757.707 inodes disponíveis no
checkpoint terminal. Receipt `96ddd2f657bd7ea78841d4f81e696c51fa5ea34dcb7e2e702d3e2100704c90fc`,
journal de comandos `925e40c84db1cad6f2987ccc12240051acc8119bac27900399140551e451a1a0`
e journal transacional `ed3f9576550d535121c23e581675daa2849fc2ad68671ec05e8b1460ef6e7946`.
O [registro verificável](releases/CAMPAIGN_AUDIENCE_INTEGRAL_911A9708_2026-11-02_DEPLOYED_SANITIZED.json)
contém os demais bindings.

A correção vale para novas criações de rascunho. `Campanha teste nov.01`
continua preservada com os 25 destinatários originalmente persistidos; reparo,
envio e agendamento permanecem pendentes e não foram efeitos do deploy. Esta
janela comprovou o lifecycle preventivo do produtor de releases. A adoção do
adapter de `preparations` não ocorreu e continua uma frente separada.

### Continuidade local — confirmação de criação e páginas de destinatários

Uma leitura produtiva posterior, exclusivamente read-only, confirmou que a
tentativa com resposta perdida não criou campanha/seed adicional no tenant Demo.
Isso não prova qual camada encerrou a resposta: não houve erro correlato nos logs
PM2 disponíveis e o access log do proxy permaneceu fora da permissão operacional.
O código implantado, porém, ainda combinava timeout comum de 10 s com duas
resoluções integrais e consultas de elegibilidade por contato.

Em checkout isolado está em validação uma correção que reaproveita o read model
em lote e a disciplina de páginas do CRM: tentativa pendente preserva em sessão,
sob chave tenant/usuário, payload e
request id, trata perda de transporte/502/504 como resultado incerto e é
reconciliada antes de nova prévia; o binding transacional cobre todo o conteúdo
aceito. Busca server-side percorre o conjunto inteiro e `Carregar mais` acumula
páginas sem duplicação na prévia e no detalhe. A campanha histórica de 25
destinatários permanece inalterada. Estado: `LOCAL / NOT MERGED / NOT DEPLOYED`;
não autoriza reparo, envio ou agendamento.

## Histórico superado — API 0fdec / frontend b96

Fonte: relatório do Codex local encaminhado pelo owner, com hashes das evidências
privadas; o editor documental não realizou nova inspeção independente da VPS.

Na observação histórica, a API estava na release `immutable-0fdec8b0-vps-20261028T224726Z`; o frontend estava
na `immutable-b96eb779-vps-20261028T025159Z`, target
`b96eb779f4ce091a79cf67e97bcd25be255e1af3`, BUILD_ID
`jRFzvE9WaHEtDCwGbV-EH`. A identidade de processo da API foi recapturada na
auditoria privada de 29/10; frontend: `873615/33441329`, restart 12. Worker preservado:
`2233/17758`, restart 0, release `immutable-e2e7f17a-20261022T005110Z`.
Health local/público: HTTP 200, `ok=true`, `db=ok`. Guarda aberta na geração
41, tarefas zero e sem fault.

O fechamento API-only 0fdec terminou `DEPLOYED_SANITIZED`, com `saveCount=1` e
retenção 3/3. Dump
`f630586b3f66041114cc7ddfa92c7bf3974440ffaa50964cdbaa58875172942a`, marker
`3ed8c45c84b03ebcc197ae37fa96adbee3ef541d5c2a9d15a046f6a3e09d580e`, journal
`ca7bd35a3ec9b3f247fdfc1bb496221ed5db04656caf301833c5aa5d92321778` e recibo de
retenção `7d69a118303bf75ed7385d7a72769137fe77c721776ea3beb212389845117e4f`.
O overlay `api-runtime/.data` foi preservado como `PRIVATE_DATA_NEVER_RETIRE /
ACTIVE_DEPENDENCY`; os três derivados foram retirados e não há dívida da geração.
Frontend b96 e worker e2e7 foram preservados e os locks terminaram livres.

O fechamento b96 terminou `DEPLOYED_SANITIZED`, com aceite técnico/visual integral,
um `pm2 save` e retenção 3/3. Dump
`67c31a1fbd95178a27be2fb248ab3c039352f3ae16c612a780096b6294d2285f`,
marker `8b11c06a10407d0157c055d32ffb91df9e283154b8a23f346212683bdc4daf92`,
journal `6392fc63f21074964c57dcc9140a1ac7ba47b46f43f987568bc40f99bc33b42a`,
recibo `44ef85e0607fd779f65b7611fb1ab2b5621129000ab0ea565b097e4a034321ee`
e recibo de retenção
`ce071492975ff08fcb1930364d22e94bcb45695ccb21ee5d545e87153f2ad1cf`.
Não houve chamada Meta, restart adicional na finalização ou alteração da guarda.

## Aceite visual de Campanhas/Rascunho — 27/10/2026

Relato manual do owner na interface produtiva da release 708f: todos os itens do
roteiro dirigido passaram. Os campos Nome do rascunho e Modelo aprovado ficaram
alinhados; a prévia substitui as instruções principais, as orientações permanecem
recolhíveis e não houve overflow. Um novo rascunho permaneceu vinculado ao ID
retornado, sem reutilizar visualmente a campanha anterior. As apresentações
“Descartada” e “Cancelada” respeitaram o lifecycle persistido e o alerta de resultado
incerto ficou separado. Nenhum envio ou agendamento integrou este aceite.

Estado: **CAMPAIGN_DRAFT_AND_TERMINAL_PRESENTATION_ACCEPTED**. A correção permanece
aceita e não exige repetição de build, deploy, save, IMAGE ou VIDEO.

## Homologação de agendamento estático — 27/10/2026

Auditoria somente leitura relatada pelo owner para a campanha
`Campanha teste out.36` no tenant Demo: agendamento para 20h35 no horário de
Fortaleza, equivalente a `2026-10-27T23:35:00Z`. A campanha estática terminou
`completed`; iniciou às 20:35:24.413 e encerrou às 20:35:29.085. Houve um job
`campaign`, `attempt=1`, dois outbounds e exatamente dois destinatários distintos,
finais 9614 e 7784. Cada destinatário teve uma submissão e um provider message id;
os dois resultados terminaram `read`, com CRM, conversa e
`campaign.recipient.contact_bootstrap_ready` confirmados. Zero retry, duplicidade,
incerteza, lease, job reclamável ou pendência de persistência. Guarda aberta na
geração 41, tarefas zero e sem fault; health local/público após redirecionamento:
ok=true/db=ok.

A API manteve o contrato por fase: em `scheduled`, audiência ainda pendente em
`draftReview.recipients`; em `completed`, os destinatários processados migram para
`messagesMetaStatus`. A interface 708f mostrava nominalmente apenas
`draftReview.recipients` no bloco exclusivo de rascunho, criando uma lacuna visual
sem perda de dados. O primeiro candidato manteve a audiência visível também após
a conclusão, mas o owner rejeitou essa duplicação durante o aceite: campanhas já
processadas possuem a fonte “Situação real por mensagem”. A correção revisada mostra
o resumo somente em rascunho/agendada; depois do processamento, permanece apenas a
situação real por mensagem. Nome/modelo/datas continuam no topo, o texto explicativo
da fila do tenant foi removido e status cru em inglês permanece proibido. Estado:
**DEPLOYED_VISUALLY_ACCEPTED_B96**. Rascunhos e agendadas exibem o resumo; concluídas
mantêm somente “Situação real por mensagem”. A prova de agendamento não precisa ser
repetida.

Evidências privadas: 24 arquivos; índice SHA-256
`0b0079d064e343ba8727f11113aba600e1398896877d671e07a657446f8a39a8`.
O coletor terminou com código 134 somente no teardown posterior à serialização, sem
nova consulta; o snapshot foi produzido em transação READ ONLY / REPEATABLE READ e
permanece válido no escopo registrado. Não repetir envio para obter a mesma prova.

## Continuidade canônica

A rota fixed-current versionada aceita `api` ou `api,frontend`: o pacote segue
completo, mas impacto backend-only promove/reinicia somente API e prova frontend/worker
preservados. O fluxo completo mantém promoção API→frontend, aceite, um save e retirada
da mesma geração. O preflight exige modos privados corretos, pai do receipt
físico `0700` e evidência integral; o dump PM2 6.0.14 aceita suas representações
autenticadas no topo ou em `pm2_env`. Não repetir a ativação, o save nem a retirada
b96. A release 708f permanece dependência de API e retorno do frontend; `a959` e
`f160` são referências históricas, não estado ativo.

## Homologação manual posterior — 26/10/2026

Fonte: relatório do Codex local encaminhado pelo owner, sem nova inspeção da VPS
pelo editor. Uma campanha de vídeo no Demo para um destinatário controlado: um
upload, um job, uma submissão e uma aceitação Meta; campanha/job completed,
tentativa 1. CRM vinculado, webhook sent seguido de read, sem falha, pendência,
reconciliação ou retry. Telefone e IDs privados não são publicados.

Ao final: guarda fechada na geração 40, tarefas zero, drained=true, sem ledger fault,
zero jobs ativos/vencidos reclamáveis e resultados pendentes. Health local/público
ok=true/db=ok. Mídia e campanha preservadas. O hash anterior do ledger não identifica
este estado posterior; o novo hash do ledger não foi fornecido.

Índice privado da janela:
`d0e8cb9eee4977bdb2225413db5b738232788ffa450300c0f52e803bc2c3466f`.
Estado histórico: **SEND_ACCEPTED_GUARD_CLOSED**. IMAGE e agendamento foram validados
posteriormente; nenhum desses testes precisa ser repetido. A guarda está aberta na
geração 41 para uso normal, sem repetir CAS, vídeo, build, deploy ou save.

## Templates de Utilidade — leitura local

Uma consulta PostgreSQL local e `READ ONLY`, sem chamada Meta ou sincronização,
confirmou no tenant `demo-converta`:

| Template | Header | Estado local | Categoria/idioma | Identidade Meta | Template / solicitação / evento |
| --- | --- | --- | --- | --- | --- |
| `justa_confirmacao_agendamento_imagem_v1` | IMAGE | `pending` | UTILITY / pt_BR | presente | 1 / 1 / 1 |
| `justa_preparo_atendimento_video_v1` | VIDEO | `pending` | UTILITY / pt_BR | presente | 1 / 1 / 1 |

As duas solicitações estão em `submitted_to_meta`; as mídias estão `ready` e
possuem handle, sem que o valor seja publicado. `pending` significa submissão
confirmada e aprovação ainda pendente. Esta leitura não prova aprovação remota.

A homologação anterior de `video_previdencia_teste_20261024_v2` permanece como
submissão aceita com aprovação `PENDING`. A tentativa anterior
`video_previdencia_teste_20261024` permanece `failed`; sua causalidade histórica
continua `NOT_PROVEN`.

## Capacidade e retenção

A retirada sucessora da geração histórica b96 encerrou em `SANITIZED` em
03/11/2026. O consumidor `_canonical_retirement_closure()` autenticou os dois elos
da cadeia, com closure normalizada
`73feb66a4ebecfc27bcf54b17f407d2486afdc9857124d044b7d1a03df4e5154`.
Três efeitos anteriores foram reconhecidos e somente a release
`/opt/re7online/releases/immutable-b96eb779-vps-20261028T025159Z` foi retirada nesta
execução. Receipt `15aa21e258fd2fea42ff6ca49041d581d644b049e55db0864821fe0b038629a6`,
journal `a129f919897d87cdb9b21ba6098e39a09df65940421f4203613301b420afa0b7`
e review terminal `4b1c5a2bc32b22418e2761b35b3b4bce9ca07628a10e9bb4ce74a21f9599c7b4`.
A autorização `b5d0b0037eb23a84828ac9445f285deeea65dd8fc6a1b39ff534992a9104a8c1`
foi consumida e não pode ser reapresentada.

O ganho físico medido foi `988.491.776 bytes`: o saldo passou de
`9.268.555.776` para `10.257.047.552 bytes`, ficando `593.371.136 bytes` acima
do gate de build de `9.663.676.416 bytes`. Isso remove somente o bloqueio de
capacidade observado; não autoriza o pacote da campanha, que ainda exige recaptura
e autorização próprias. Produção 911a, PM2, dump, pacote, manifesto, índice,
contrato e lifecycle b96 foram preservados. O sentinel do lock permaneceu físico,
autenticado e livre em `64769:803457`, `deploy:deploy 0600`, SHA-256
`d7cf1d3c2596891ad8208fd6fdd2c8b4ca2028738a51217bc30dfaec8fe99535`.
O [registro verificável](releases/B96_GENERATION_RETIREMENT_2026-11-03_SANITIZED.json)
torna esse lote terminal e proibido de replay. A cadeia
`d7de / 3630 / ec2 / ef7 / a62 / 5c339` continua aberta e separada.

### Campanha 785bde80 — DEPLOYED_SANITIZED

A geração `immutable-785bde80-vps-20261103T103429Z`, target
`785bde80cb8bacbbf6375337dd169247738ab0f9`, concluiu build único, verificação,
instalação inerte, ativação API+frontend e retenção 3/3. O estado terminal é
`DEPLOYED_SANITIZED`, com um único `pm2 save`, worker `e2e7f17a` preservado e
lock canônico ausente. A closure canônica autenticou intent, receipt, journal e
review; o lote é terminal e irrepetível.

O primeiro `generation-retirement prepare` negou antes de
intenção ou efeito porque a montagem manual da custódia copiou três controles e
omitiu `preparation_artifact_lifecycle.py`, apesar de a dependência já integrar as
listas do admission controller e do materializador. Essa v1 e o stderr
`329742ea8998292d2142e0c3d55c2cbb49588b889e4f716de4b53c261f62735f`
permanecem históricos; a montagem manual é desvio e não pode ser repetida.

A custódia sucessora materializou executor e dependência lado a lado, autenticou
novamente os bytes e concluiu uma única preparação. Intenção
`860d67cb7b8467b1117b9bca64c14dd2cc8a2aec42178cd59df94c2bf433eb0c`,
comandos `c5da1a12868dbd9b2e3ebcc7c1fe727ddf494b773938566238e63637aafd3635`
e review `6d0502d050f97e7fafd28586e13d3bff4ef0aebec1974475664558dfc4d9cc8e`
estão selados. Os três comandos alcançam somente worktree, runtime API e runtime
frontend derivados; release instalada, pacote, retornos e worker permanecem
preservados. Não repetir build, instalação ou `prepare`, e não consumir retenção
fora do `finalize` posterior ao aceite.

O sentinel físico deixado pela retirada b96 continua no inode `64769:803457`,
vinculado à intenção terminal b96. A extensão local em revisão autentica essa
closure pelo validador canônico, mantém o mesmo inode sob `flock`, transfere a
janela ao protocolo fixed-current e restaura os bytes originais no mesmo inode se
a adoção falhar antes de efeitos. Ela ainda não foi instalada nem executada na
VPS. Próximas custódias devem ser produzidas pelo materializador integrado e
reabertas integralmente antes da selagem.

A primeira janela de ativação do pacote v2 chegou a `AWAITING_ACCEPTANCE`, com API e
frontend `785bde80` saudáveis e worker preservado, mas a montagem inline do aceite
corrompeu o literal UTF-8 antes de criar `acceptance.private.txt`. Não houve save,
marker ou retenção; o rollback canônico restaurou API/frontend `911a9708`, terminou
`ROLLED_BACK`, removeu o lock terminal e preservou release instalada, intenção e os
três derivados. Journal `b017180c596ba8849bed747cd30b860c917b98e594f08dd17f9ea990787bc992`;
essa transação é terminal e não pode ser reutilizada. O aceite 911a preservado prova
os 21 bytes UTF-8 e SHA `1427ff7dd23e5a1059295fa400bc9f5d9def1c7d8395ff54a2cb3c47d238de7a`,
mas não preserva seu comando produtor. Nova janela exige pacote sucessor e transporte
autenticado pelo materializador versionado, ensaiado até o leitor real antes da VPS.
Essa exigência foi satisfeita pelo pacote sucessor v3. A janela v3 materializou o
aceite autenticado, finalizou pelo wrapper versionado e consumiu somente os três
derivados selados. Receipt `6de66f2a73b84d43096f4d3d030f68a8f3a4ea9ee41a2585e211556b97c65708`,
journal `27b85250c0b9cb9c11c3c3b114d014a2832d0c0010b159419ab2fbf7e03c2c6f`
e review `a364fe7221625d034be3ad7d9c3c44acbd3a8432e5cda2cbdd53a6e3482d2140`
preservam o fechamento. A tentativa v2 continua `ROLLED_BACK`, não foi reescrita
nem se torna consumível pelo sucesso posterior.

Historicamente, a retenção frontend-only inicial da b96 concluiu 3/3 em
`DEPLOYED_SANITIZED` e registrou 12.402.286.592 bytes disponíveis. Esse checkpoint
não é capacidade atual nem inclui a retirada sucessora acima. Também há bloqueio diante
de review não terminal ou quando criaria uma segunda candidata. Retenção incompleta
não pode permanecer como tarefa informal: bloqueia a próxima geração até reconciliação.

O encerramento obrigatório por geração está implementado no produtor e na
ferramenta versionada `scripts/generation-retirement.py`. Novo build exige 12 GiB
livres, ausência de dívida e no máximo uma candidata ainda não instalada. Em
27/10/2026, o gate global aceitou as quatro reviews regularizadas (`123ba`,
`a959`, `d436` e `f160`): não há dívida de retenção bloqueando o próximo build.
Essa conclusão não substitui a medição fresca de capacidade obrigatória. O lote
histórico de dez caminhos terminou 10/10, recuperou 6.942.289.920 bytes e deixou
13.416.599.552 bytes livres; produção permaneceu inalterada e o lock ficou livre.
Esses números são o recibo daquela execução, não uma medição fresca de capacidade.
O finalize API + frontend exige a intenção condicional completa e encerra em
`DEPLOYED_SANITIZED` ou `DEPLOYED_RETENTION_INCOMPLETE`. `SANITIZED` nunca decorre
de retirada parcial. O frontend-only aplica a mesma finalização e não repete save,
restart ou retirada ao retomar. Parcial só é reconciliado por intent/receipt/journal
anteriores autenticados, com cadeia cumulativa em qualquer número de retomadas; nova
autorização cobre apenas os remanescentes. As raízes
vêm da política versionada `config/deploy-artifact-roots.json`, não do snapshot
operacional. O produtor valida repo, output e raiz de releases contra essa política
antes de criar a saída ou executar npm. A candidata `123ba` era a única geração
`LEGACY_PRE_CONTRACT` conhecida: não possuía review v1 nem contrato original. Sua
regularização concluída usou o descriptor fechado versionado, duas leituras estáveis
apenas dos caminhos literais e o bootstrap sem inventário global. Separadamente,
`a959` era a única geração `LEGACY_V1_PRESERVE_NO_CONTRACT`: sua
review v1 existente não pode ser fabricada nem substituída pelo bootstrap. O fluxo
fechado autentica também a release instalada ativa e o receipt/journal do lote
`10/10` que já retirou os três derivados. A ausência só vira `SANITIZED` após a
validação literal dos dez ordinais e a confirmação de que os caminhos não
reapareceram. O bootstrap publica somente contrato e recibo; o `prepare
--legacy-review-sha256` subsequente gera zero comandos, migra a review v1 para v2
`SANITIZED` e permite o gate global sem `execute`. A release ativa permanece fora
de toda intenção destrutiva.

A regularização operacional da `a959` foi concluída em review v2 `SANITIZED` e
não deve ser reaberta. A regularização conjunta de `d436` e `f160` também foi
concluída em 27/10/2026, sem `execute` e sem exclusões: `d436` permaneceu
`ROLLBACK_DEPENDENCY`, com ordinais históricos `2/6/7`, e `f160` permaneceu
`ACTIVE_DEPENDENCY`, com ordinais `3/8/9`. Os dois `prepare` produziram arquivos
de comandos vazios e reviews v2 `SANITIZED`; somente depois, um único gate global
retornou `PASS` para quatro reviews. `123ba`, `a959`, `d436` e `f160` estão
definitivamente regularizadas; não são pendências nem autorização para repetir os
bootstraps.

Evidências autenticadas da regularização conjunta:

- contratos `d436`/`f160`: `317cf901e06e9f76b211fa046dce537bb8fa9df0643cc1ae34350ac332c6ddbc`
  e `a0f224b7c05b792ec978915351544791e648f7b52c5f14d5f16cb1bf80798bdc`;
- recibos de bootstrap: `d7e776b72bf6351b05df6abf4dc3985a1ff995f4d1ed25cebb99f89889e66bc1`
  e `561b29c39275f0509fb87de91c693952a295dff3c498727b55a036f7173f6ac8`;
- intents sem comandos: `0cf61ee0f983f33c2c4441aeaee4efcccccf9bf2eee1bf85e99576fcc87e9e0b`
  e `1c510a43d0471fac954c70a10b42e0d26d2693ddbaab5e3675cf2a1e4e2246e7`;
- reviews v2: `3e3bf9d15ad97997f92f6689fcd044f969c1b76194183bdb7075fb87355d43e2`
  e `8f2deb17acc9305ebd27b1dc98431068af3d5891bb6df0bac81f40761e2b74a6`;
- gate global: `3f3bf713765fa27446bccf8ce3dbbfebada370fb643743591fbaf9f9c7c59bfc`;
  recibo conjunto: `212b736c4cb17ea1c6fbe259548f1a475d7c7dcca4f3951f2a2826c5615221d7`.

A medição ao final registrou 15.083.352.064 bytes livres e 8.939.625 inodes
livres. Produção, PM2 e guarda permaneceram inalterados; ambos os locks canônicos
foram confirmados livres.

A regularização revelou estado mutável legado em `api-runtime/.data` dentro da
release instalada `a959`. O cache de frontend não referenciado foi retirado na
janela autorizada, mas o bootstrap parou em `RELEASE_DENY:release_index_inventory`
antes de publicar contrato. `.data` foi preservado integralmente. O contrato
versionado passa a reconhecê-lo somente para a identidade fechada da `a959` como
`PRIVATE_DATA_NEVER_RETIRE/ACTIVE_DEPENDENCY`, sem relaxar pacote, índice ou outras
releases. Na `f160`, `frontend-runtime/.next/cache` tem natureza diferente:
`EPHEMERAL_RUNTIME_CACHE/ACTIVE_DEPENDENCY`, proibido no pacote/índice e removível
somente junto com a release-pai quando ela deixar as funções ativa e de retorno.

A fotografia somente leitura de capacidade está em
[VPS_CAPACITY_AUDIT_2026-10-24.md](VPS_CAPACITY_AUDIT_2026-10-24.md). Ela classifica
candidatos para revisão, mas não autoriza remoção, arquivamento, retenção, alteração
de cron ou execução de scripts. Nenhum arquivo ou serviço foi alterado na auditoria.

A fotografia global de 26/10/2026 está em
[VPS_CAPACITY_AUDIT_2026-10-26.md](VPS_CAPACITY_AUDIT_2026-10-26.md). Ela registra
6,45 GB em outputs, 4,09 GB em worktrees, 29,94 GB em releases e 13,48 GB em
preparações, sem inferir que tudo seja removível. O ganho seguro imediato é zero; a
intenção condicionada permanece `NOT_AUTHORIZED`. PR #240 e a candidata `123ba7bd`
foram superados pela correção de apresentação terminal e continuam preservados.
A regularização contratual da geração foi concluída; não existe retirada pendente.

## Release rejeitada ef3a retirada — 28/10/2026

A geração `immutable-ef3a2128-vps-20261028T001820Z` terminou `SANITIZED`.
Foram retirados exatamente quatro caminhos literais: release instalada, worktree e
runtimes derivados de API/frontend; staging já estava `SANITIZED`. A execução
concluiu 4/4 comandos, sem retry ou falha, recuperou 2.995.449.856 bytes e 106.570
inodes e deixou 13.597.659.136 bytes livres. Recibo
`9369b666359c9840e7546612843f0026c4fc9472a9edf68591370e52771ece30`,
journal `35bfedcffc58d01454251a8fcfd54b22906b2a23762fb5e1bde8807c14775dd4`
e review `e3f2533863eac885a35b7b5a8871098ccba6b0442d36f1d69ea228085980086a`.
Pacote, manifesto, índice, contrato e lifecycle permanecem preservados. Produção
continuou em 708f; worker, PM2, guarda e serviços não foram alterados. Não repetir
a preparação nem a retirada da ef3a.

## Rota operacional

### Lifecycle preventivo de preparações volumosas — rota canônica integrada, não instalada

A admissão schema 2, o adapter `operational_preparers_v3.py` e o review terminal
de `generation-retirement.py` agora compartilham o contrato fechado
`preparationArtifacts`. A transição ensaiada é admissão → `OPEN` antes da cópia →
`SANITIZED` ou `RETENTION_DEBT`; reuso é verificado antes de nova alocação e
interrupção preserva dívida nominal. A custódia inclui as dependências executáveis
pinadas e o teste chama o entrypoint copiado fora do checkout. Pelo procedimento
canônico, API/frontend devem usar `deploy-preparation-admission.py
--run-preparation`, que autentica custódia, report, contrato e input e executa o
produtor materializado a partir dos bytes já autenticados. A correção local de
04/11 retirou a mutação API/frontend do CLI do produtor: a admissão carrega os
bytes copiados e chama o entrypoint interno; chamada direta, mesmo com FD e pipe
montados pelo chamador, nega antes da alocação. Isso ainda não constitui adoção
comprovada nos
fluxos produtivos. A cobertura
permanece limitada à `reservationRoot`, não a produtores históricos ou ao
filesystem inteiro. A implementação não foi instalada nem executada na VPS e não
altera recuperações ou déficits históricos.

O grafo sucessor passa a poder registrar `immediateRollbackReleases` por
componente. Uma ativação completa estabelece os dois bindings; uma ativação
parcial exige previamente os dois bindings autenticados e só atualiza o componente
selecionado. Grafo legado precisa passar pela reconciliação autenticada existente;
o retorno ausente não é inferido da seleção ativa. A
lista histórica `rollbackReleases` não é reduzida pela ativação: papéis antigos só
saem por reconciliação autenticada. Se o binding por componente já existe e a
lista contém qualquer papel além dos dois retornos imediatos, a próxima ativação
nega antes de efeitos com `rollback_role_reconciliation_required`. A reconciliação
autenticada precisa encerrar o papel substituído antes de uma segunda ativação
parcial; até lá, o retorno do componente não alterado e o papel histórico anterior
permanecem protegidos. A reconciliação
de um pai privado pode retirar somente o papel operacional antigo porque o próprio
pai continua protegido em `privateDataParents`. Assim, o inventário não é
confundido com o retorno imediato, a lista não cresce por ativações sucessivas e
nenhuma referência desconhecida desaparece por omissão. Mudança local e ensaiada;
ainda não implantada.

### Reconciliação dos papéis de releases — versionada, não operacional

O checkout isolado contém uma reconciliação não destrutiva do grafo de releases e
a proteção do pai de dados privados. Ela separa inventário histórico de proteção
operacional, preserva arestas sem fechamento autenticado e impede `prepare` ou
`execute` de retirar uma release com `api-runtime/.data`. O ensaio cobre
condicionalmente `708f`/`d436`/`f160`, preserva `0fdec`/`a959`, ativos e rollbacks
imediatos e autentica a projeção schema 2 no consumidor. O potencial de
2.965.995.520 bytes não foi recapturado nem recuperado. Nenhum grafo produtivo foi
alterado e nenhuma retirada foi autorizada.

Atualização terminal de 02/11/2026: d436 foi posteriormente fechado em
`SANITIZED`, validado por `_canonical_retirement_closure()` e não pode ser
reaberto. Receipt `b638b25a20823acfbc0797c0bdca037edf95e9d214578022c0c1d703c503ed5c`,
journal `525ab03b5b414a90bc6e8703597f1c7d7953cbfa192a9e17cd00225dfeba975c`
e review `11a301e4b266994eac124e54eadd0ae5178002a4e1f5d50f59672b948e4ffb52`.
O ganho líquido medido foi `988.528.640 bytes`; a capacidade passou para
`9.756.708.864 bytes`. Produção, PM2, dump e grafos permaneceram inalterados.
f160 foi executada posteriormente por autorização v4. O único comando histórico
removeu a release; o cache `WITH_PARENT_RELEASE_ONLY` desapareceu com o pai e não
entrou em `removedPaths`. O receipt parcial
`36d0d69fbb22a920fcbd7e6c38bceae0ab0532368943e174c537900cf9aeb26b`, o journal
`905737bfb83042f6e0d98c37a4576adb5819e9cd45ebe074ba5ea1b0568648d2`, a autorização
consumida e a cópia da review parcial
`610d43815c145dea7c57308e8d25f07bd604b88120b45cc638288611f513e690` permanecem
byte-exatos.

O fechamento sucessor foi concluído sem nova retirada. Intent
`371c585f59f550be44575bcbc3d9101d5383d491b98b41d4ba5185e152890d3a`, autorização
de caminhos vazios `a8080e4a92cde71dd1b0bc1219ea4a4ac04ff28b5c3795198ef16955ebf7bc90`,
receipt `cf89aee59cd499a421b71321b79619e0c9f7c57e8449db640ee67e37c566e3a8` e journal
vazio `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` formam a
segunda ligação da cadeia. O receipt terminal é `SANITIZED`: conserva
`completedCommands=1` e `removedPaths` somente com a release-pai, registra o cache
somente em `subordinateAbsences` e tem `attemptedCommands=0` nesta fase. A review
terminal é `4663caa1a25594a5868cf4257d56a1f8a3063d179498066247ba0c9aac654816`.
`_canonical_retirement_closure()` aceitou a cadeia; a evidência sanitizada dessa
validação é `1739c4956d2aa1558648a7563dc176a2ca3482d526304561caa7a29c6ceb02f8`.

O fechamento adicionou zero ganho de armazenamento: nenhum comando destrutivo novo
foi emitido ou executado. O ganho líquido já medido permanece `988.590.080 bytes`
para f160 e `1.977.118.720 bytes` no conjunto d436+f160. As duas retiradas são
terminais e irrepetíveis. A integração preventiva do lifecycle com os produtores
reais de preparações volumosas continua pendente; o fechamento não a declara
instalada nem globalmente aplicada.

A primeira materialização operacional foi interrompida antes de qualquer escrita:
a ativação frontend `aa9527cc` usa o formato frontend-only do control plane
`9441de5a569219d38303c711d82c45870e8755cc`, não o journal fixed-current. A
cadeia original preservada é completa: executor
`36d3d623620fc5557a689270842cc5aba9322b8c8b7e026e6163fde01057ba99`,
selection intent `6cce115f61e32e9f0675e894d1b1996d7f55bd92816919934eb826a206583fad`,
activation intent `a48886eaee0ec2325aa29e05be0955d2f80486d378a2caff127e1c6546421f9f`,
estado anterior `f1340234a0207e36a3f5205b098b37fa8eb4c2f25046b7f8a4a57a5008ad44c0`,
aceite `c90b66aefb98dc842e2a2f4f6929de8744cc4e3f2a1e422be70eb2db3f20a694`,
receipt final `c80e37abc9448ed1edf78eec40f420cb1ac595c0ee470964bed84fe139e74a23` e
estado terminal `9c86b6ebfa6308ee4ea00ef3bbc412c70b60513239cf7dc2cc3a02fc79cb2989`.
O leitor fechado desse formato e o consumidor independente da projeção foram
preparados e ensaiados localmente. O consumidor preserva receipts legados, aceita
explicitamente `FIXED_CURRENT` e reabre todos os bindings de `FRONTEND_ONLY_V1`
antes de derivar as proteções. Ambos ainda dependem de revisão e integração antes
de qualquer operação. O pacote v2 anterior permanece não consumível e não deve ser
reapresentado.

A única instrução executável vigente é o [runbook canônico](DEPLOY_RUNBOOK.md).
O modelo é build once / promote the same artifact, com release imutável, seleção
API→frontend, worker apenas quando impactado, três amostras de readiness, smoke
GET-only, aceite e um único `pm2 save`.

Build no checkout/runtime ativo, `deploy-normal-release.sh`, Deploy V2, PR #190,
Next em `cluster_mode` e executores temporários em `/tmp` são históricos e
obsoletos. Instruções históricas de cron ou retenção descrevem o estado de sua época;
não autorizam instalação, reativação, alteração ou limpeza atual.

## Reabertura geral confirmada — 26/10/2026

Relatório do Codex local encaminhado pelo owner: CAS único da geração lida 40 para
41, open=true, tarefas 0, sem ledger fault. Disponibilidade administrativa autenticada
confirmada; zero jobs reclamáveis, campanhas vencidas, controladores recuperáveis,
jobs queued/running/needs_review, submissões/aceitações pendentes e incertezas antes
e depois. O scheduler não executou trabalho histórico. Health local/público ok=true,
db=ok. Não houve build, deploy, restart, save ou envio de teste nessa abertura.

Recibo/disponibilidade SHA-256:
`a89c999d631df355fdbd3d5be13bd62283d404ff574296309006e09671b9bff3`.
Índice privado: `12f127ffad54a27a3f27ac1e1d43ca95335182472d3cc551717d6dab3bbad501`.
Fonte documental: relatório operacional, sem nova inspeção independente pelo editor.
Estado **GENERAL_OPERATIONS_OPEN**; manter aberta para uso normal, sem repetir
abertura ou fechar por fim de homologação. Proteções canônicas permanecem ativas.

## Homologação IMAGE concluída — 26/10/2026

Relato do Codex local encaminhado pelo owner: campanha `Campanha teste out.27`,
template `imagem_previdenciario`, completed, uma imagem armazenada/vinculada,
upload Meta confirmed em uma tentativa e um job concluído. O escopo efetivamente
executado incluiu **dois destinatários**, diferente do roteiro inicialmente proposto
de um: duas aceitações Meta, uma por destinatário, sem retry ou duplicidade.
CRM confirmado para ambos; webhooks correlacionados read para um e delivered para
outro. Telefones e IDs privados não publicados. Sem falhas, incertezas ou pendências
globais. Guarda aberta na geração 41, íntegra, sem tarefas; health local/público
ok=true/db=ok. Mídia, campanha e evidências preservadas, sem build/deploy/restart/save.

Índice final privado:
`0b98ed13f0c4ca1c71a424c4ed8c3de02f2c02c20e59248aab506d280d21a0ae`.
Aceite IMAGE e VIDEO controlados: PASS. Não repetir os testes nem reabrir a guarda.
Agendamento/multilote e aceites específicos não são inferidos desses resultados;
preparar o próximo escopo conforme [roteiro](CAMPAIGN_OPERATIONS_READINESS.md).
