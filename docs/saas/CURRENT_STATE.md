# Estado canônico do Converta

**DEPLOYED_SANITIZED / CONSENT VISIBILITY ACCEPTED / PRODUCTION HEALTHY**

## Estado vigente — Tendência concluída e sanitização P00 liberada

Fonte: relatório final do owner/Codex local; este editor não reinspecionou a VPS.

A release API-only `immutable-fa63994a-vps-20261030T153352Z`, target
`fa63994acd5655bd499a328679a0f8c11e0740e2`, está
`DEPLOYED_SANITIZED`. O owner confirmou PASS no teste do final `9614`:
confirmação de encaminhamento, estado humano, fila/Inbox, ausência de reentrada da
IA e frontend. Frontend `aa9527cc` e worker `e2e7f17a` foram preservados.

A finalização executou um único `pm2 save`, validou o dump
`440c5ed4631ff8715a33af0938bd032dff86451f0f79039273d067234d28b280`,
criou o marker, retirou 3/3 derivados e removeu o lock canônico. Registro:
[TENDENCIA_HANDOFF_FA63994A_2026-10-30_DEPLOYED_SANITIZED.json](releases/TENDENCIA_HANDOFF_FA63994A_2026-10-30_DEPLOYED_SANITIZED.json).

Não repetir qualquer fase dessa geração. O saldo final relatado foi
8.012.804.096 bytes; é checkpoint histórico, não capacidade reservada. A prioridade
vigente é o [plano P00 de sanitização e retenção](backlog/PROJECT_SANITATION_AND_RETENTION_P00_2026-10-30.md),
com limpeza classificada de VPS, preparações, releases, outputs, worktrees,
branches e PRs, seguida da prevenção permanente de novo acúmulo.

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
Produção relatada permanece API 754281d3 / frontend aa9527cc / worker e2e7.

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

Esta é a entrada vigente de continuidade. A topologia operacional está no
[modelo de implantação](DEPLOYMENT_OPERATING_MODEL.md), e o fechamento ativo está
no [registro aa9527](releases/CONSENT_VISIBILITY_FRONTEND_AA9527_2026-10-29_DEPLOYED_SANITIZED.json).
Registros anteriores permanecem no [índice documental](DOCUMENTATION_INDEX.md) como
histórico e retorno; eles não substituem este estado.

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

O control plane admite autorização P00 privada e temporária que dispensa
exclusivamente o piso estático de 12 GiB, sem relaxar capacity contract, reserva,
inodes ou checkpoints. Ela não autoriza build, deploy ou ativação por si só.

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

A geração b96 está encerrada em `DEPLOYED_SANITIZED`, sem dívida atual: a retenção
concluiu 3/3. A medição final registrou 12.402.286.592 bytes (aprox. 11,55 GiB),
abaixo do piso de 12 GiB (12.884.901.888 bytes). Novo build permanece bloqueado;
auditorias e homologações que não constroem artefatos continuam permitidas. Também
há bloqueio diante
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
