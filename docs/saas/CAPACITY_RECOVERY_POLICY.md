# Política canônica de recuperação mínima de capacidade

Esta política define o único fluxo normal para qualificar e retirar resíduos de
capacidade fora do encerramento obrigatório de uma geração. A implementação é
`scripts/capacity-recovery.py`; executores privados, comandos improvisados e
adaptações de `generation-retirement.py` para cache npm são proibidos. Execuções
longas usam exclusivamente `scripts/capacity-recovery-supervisor.py`, que chama o
executor irmão sem shell e preserva canais e código de saída. Na fase `audit`, o
supervisor exige um escopo transitório do `systemd --user` em cgroup v2 antes de
executar `audit`, `prepare` ou `execute`. `MemoryMax`, `MemorySwapMax=0`, `OOMPolicy=kill` e
`memory.oom.group=1` limitam a memória agregada do Python, Node/PM2 CLI, helper e
demais descendentes da fase; RSS continua evidência, não mecanismo de limite.
`RuntimeMaxSec` usa relógio monotônico e encerra somente o control group desse
escopo. O daemon PM2 e os serviços já existentes ficam fora dele. Ausência do
escopo, limites divergentes ou impossibilidade de autenticá-lo negam antes do
executor. No `execute`, o supervisor contém o executor sem assumir autoridade
sobre locks, journal ou efeitos: esses contratos continuam pertencendo
exclusivamente a `capacity-recovery.py`.

## Estados e separação de autoridade

O fluxo possui três fases independentes:

1. `audit` é somente leitura sobre os artefatos produtivos. Autentica pedido,
   política de raízes e fotografia operacional, mede blocos físicos e inodes sem
   contar hard links duas vezes, classifica candidatos e publica plano fechado.
2. `prepare` reabre o plano pelo SHA-256 externo, recaptura todos os candidatos,
   agrega negativas previsíveis e, sem remover nada, publica intenção, comandos
   literais e manifesto em `SEALED_FOR_EXPLICIT_AUTHORIZATION`.
3. `execute` exige intenção e autorização privada `AUTHORIZE_ONCE`, ambas por
   SHA-256 externo. Depois de adquirir os dois locks canônicos, recaptura ao vivo
   os symlinks `current`, `pm2 jlist` por binário autenticado, dump, transações
   não terminais e grafo protegido imediatamente antes do primeiro `ATTEMPT`.
   Referência surgida depois de `prepare` resulta em negativa. Só então executa
   sequencialmente e publica
   `ATTEMPT → RESULT → VERIFIED` com `fsync`. A primeira falha encerra o lote;
   não há retry automático.

Cada fase exige `--telemetry-output` para um JSONL privado criado com
`O_EXCL|O_NOFOLLOW`. Cada evento é sincronizado individualmente e contém somente
fase, candidato, contador de membros, relógio monotônico, RSS atual/pico e, quando
legíveis, `memory.current`, `memory.peak` e `memory.events`. O supervisor mantém
um segundo JSONL e recaptura os contadores e `childRssPeakBytes` após o filho
terminar normalmente ou por sinal;
nenhum dos dois registros contém conteúdo de arquivo, ambiente ou credencial.

O orçamento do `audit` é sempre explícito: `--memory-max-bytes` aceita somente o
intervalo fechado de 128 a 512 MiB e `--timeout-seconds`, 10 a 1.800 segundos.
Esses limites são bordas admitidas pelo supervisor, não autorização operacional.
Em especial, os 256 MiB usados no ensaio local não constituem orçamento
produtivo. O consumidor interno autentica novamente o nome e o caminho do cgroup,
`memory.max`, `memory.swap.max` e `memory.oom.group` antes de substituir seu
processo pelo executor canônico. Excesso de memória e prazo publicam
o predicado nominal da fase, como `AUDIT_MEMORY_MAX`, `PREPARE_TIMEOUT` ou
`EXECUTE_MEMORY_MAX`; não há retry automático.
Um fail-safe do supervisor atua somente sobre o nome exato da unidade criada por
ele e nunca procura ou sinaliza processo por nome.

O fechamento distingue três estados de execução. `EXECUTOR_NOT_STARTED` exige
falha anterior ao launcher ou negativa explícita do bootstrap contido;
`EXECUTOR_STARTED` exige o primeiro evento privado e estável
`telemetry_started`; qualquer outra combinação após o lançamento é
`EXECUTOR_STATE_INCONCLUSIVE`. Exceção, sinal, timeout ou saída do launcher com
descendentes ainda no escopo inicia encerramento somente da unidade exata. A
confirmação exige unidade inativa/failed (ou ausente), cgroup ausente/vazio e
launcher encerrado. A espera é limitada; falha de `systemctl`, membro remanescente
ou identidade ilegível produz `AUDIT_RECOVERY_PENDING`, preserva unidade,
tentativas e evidências e não declara término. Somente depois da confirmação o
supervisor pode limpar o estado transitório da unidade.

Depois de um `execute` iniciado, código de saída ou sinal nunca provam ausência
de efeitos. O supervisor reabre, sem reparar, o journal e o receipt originais do
executor. Journal autenticado sem `ATTEMPT` prova zero efeitos; receipt
autenticado reconcilia `FAILED` ou `COMPLETED`; qualquer `ATTEMPT` sem receipt
íntegro, contagens divergentes ou encerramento de scope não confirmado termina
em `RECOVERY_PENDING`. O supervisor não fabrica receipt, não repete comando e
não transforma fechamento parcial em `COMPLETED`.

O lote 3/3 selado em `502cc4b7…` consumiu uma única autorização depois do merge
do PR #305. A recaptura sob locks negou nominalmente
`DISPOSITION_MANIFEST_FIXED_BINDING` antes do primeiro `ATTEMPT`; receipt
`0e9631f8…`, journal `9a2762bc…` e terminal `63da1875…` comprovam zero efeitos e
mantêm os três candidatos presentes. Essa execução é terminal e irrepetível. A
negativa não autoriza adaptar o manifesto, regenerar intenção, repetir fases ou
prosseguir para outro lote na mesma janela.

`DISPOSITION_MANIFEST_FIXED_BINDING` distingue dois contratos. No `audit`, o
request continua obrigado ao manifesto fixo calculado pelo `ROOT` do executor.
Nas recapturas de `prepare` e `execute`, a autoridade é o binding de caminho e
SHA já autenticado na observação do plano, e não uma nova cópia relativa ao
`ROOT` do consumidor relocável. A reabertura exige igualdade byte-exata com esse
binding selado, SHA compilado, sufixo canônico e confinamento à raiz de
preparações; caminho fornecido livremente pelo chamador continua proibido. Essa
distinção evita que relocar bytes idênticos do executor torne impossível consumir
um plano válido sem afrouxar a allowlist ou editar artefatos históricos.

O contrato corrigido foi exercido pela operação sucessora da custódia
`p00-capacity-three-archives-04a9650d-prepare-successor-v1`. Ela reutilizou o
plano PASS `502cc4b7…`, preservou como terminal a autorização/receipt anteriores
e consumiu somente a nova autorização `2330c848…`, vinculada à intenção
`b3b1e7f7…` e aos mesmos comandos `725ecbdc…`. O resultado foi
`COMPLETED_RECONCILED`, 3/3 efeitos, receipt `6662af79…`, journal `b13da490…` e
ganho físico medido de `458.964.992` bytes, com autoridades e produção
preservadas. A operação não pode ser repetida e não concede autorização para
outro lote.

Plano e intenção são schemas fechados. Caminho, classe, device/inode,
owner/group/mode, métricas físicas, hashes das fontes e comando fazem parte do
binding. A fotografia operacional schema 2 exige fontes de recaptura ao vivo;
fotografia anterior sem essas fontes é negada. Os comandos destrutivos são fechados por classe. `NPM_CACHE_MAINTENANCE` e
`DERIVED_OUTPUT_RUNTIME` usam `/usr/bin/rm -r -- <caminho-autenticado>`.
`CLOSED_PREPARATION_DERIVED_ARCHIVE` e o manifesto produtivo fechado 3/3 usam
somente `/usr/bin/unlink -- <arquivo-autenticado>`. A existência de código
histórico para outros tipos não autoriza seus efeitos neste lote.

Glob, expansão, `force`, `prune`, caminho alternativo e descoberta destrutiva em
`execute` são negados.

O schema 3 admite `incrementalBatch=true`: o lote ainda precisa satisfazer
`minimumRecoveryBytes`, mas pode terminar abaixo de `targetAvailableBytes`. O alvo
continua registrado e `targetAvailableSatisfied=false`; somente a medição posterior
do receipt conta como capacidade recuperada. Isso permite lotes pequenos sem
converter ganho estimado em saldo real nem ampliar candidatos silenciosamente.

Archives da disposição fechada são autenticados por FD `O_NOFOLLOW`: uma primeira
passagem calcula SHA-256 em blocos e uma segunda passagem usa tar streaming
`r|gz`. A identidade é conferida antes e depois de ambas. Folhas do tar e da
autoridade são hasheadas em blocos; a relação usa digest incremental com framing
de tamanho, sem reter conteúdo de archive ou folha em memória. O Python 3.12
acrescenta cada `TarInfo` a `TarFile.members` mesmo em `r|gz`; por isso o executor
libera explicitamente essa lista depois de processar cada membro admitido. Hardlink
e qualquer tipo que pudesse depender de membro anterior continuam negados.

Os nomes normalizados não ficam em um `set` de RAM. O registro exato usa SQLite da
biblioteca padrão, chave primária `BLOB` e comparação binária, sem case folding ou
normalização Unicode adicional. Sua área é criada exclusivamente como diretório
privado `0700`, o banco como `0600`, e ambos são retirados com `fsync` em sucesso
ou falha recuperável que percorra o contexto Python. O cache é limitado a 1 MiB.
`PRAGMA max_page_count` limita o arquivo
principal do banco a 64 MiB; isso não é apresentado como quota agregada do
diretório. O executor mede separadamente os blocos do banco e dos auxiliares
conhecidos a cada progresso e no flush final, nega arquivo desconhecido e também
nega se a soma física observada ultrapassar 64 MiB. Com `journal_mode=OFF`, o
ensaio não criou journal, WAL, SHM ou outro temporário. Espaço insuficiente,
`SQLITE_FULL`, falha de armazenamento ou resíduo não removível resultam em
negativa nominal. Telemetria de progresso ocorre a cada
4.096 membros, no máximo 256 vezes por candidato, e inclui somente contador,
memória e bytes temporários. Duplicidades, escapes, links, tipos inseguros e
material protegido continuam fail-closed.

O encerramento do processo por `SIGTERM` não executa necessariamente o
`ExactNameRegistry.__exit__`. O ensaio local com filho e supervisor reais confirmou
que o supervisor encaminha o sinal e persiste `signal_received`, `after_child`,
`exitCode=-15`, sinal e pico RSS, mas deixa a área privada já criada sob o pai da
telemetria. No caso dirigido, ela permaneceu como um único diretório físico
`.capacity-name-registry-<32-hex>` `0700`, contendo somente `names.sqlite3` `0600`:
4.096 nomes e 8.192 bytes lógicos/físicos. O limite estrutural continua sendo o
banco principal de 64 MiB e os auxiliares conhecidos medidos; não é promessa de
remoção por sinal nem quota agregada independente do filesystem. O resíduo integra
a custódia terminal da fase: preservar terminal/telemetria, comprovar ausência do
filho e classificar o caminho literal e sua identidade no procedimento canônico de
resíduos antes de qualquer retirada. Não há limpeza automática ampla, glob ou
alteração genérica do tratamento de sinais nas fases destrutivas.

### Tentativa interrompida de 01/11/2026 e limite desta revisão

A operação vinculada ao merge `9e25104660642ce72bfe289e41320a6d12c804bd`
terminou por sinal antes de produzir plano semântico. Custódia preservada:
`p00-capacity-three-archives-9e251046-20261101T132910Z`. Os hashes externos do
request, das duas telemetrias e do marcador terminal permanecem no índice privado
da custódia e não foram recalculados nesta revisão local. O supervisor registrou
`exitCode=-15`, pico RSS do
filho de `1.288.294.400` bytes, pico do cgroup de `1.976.967.168` bytes e zero
evento OOM. Plano, `prepare`, `execute` e `unlink` não existiram. Essa tentativa é
terminal e não pode ser repetida.

### Contenção local validada após a integração do PR #300

O patch baseado em `b66fc5fd0178b4dcd87e5aa4618d3a955efaa204`
exercitou localmente o supervisor real em escopo transitório: Python, Node e o
helper sintético permaneceram no mesmo cgroup; o caso normal terminou com pico do
escopo de 34.140.160 bytes. O excesso real sob 128 MiB terminou com
`Result=oom-kill`, `AUDIT_MEMORY_MAX` e pico de 132.980.736 bytes. Um descendente
que ignorou `SIGTERM` terminou por prazo de 10 segundos mais a graça fechada de 5
segundos, com `Result=timeout` e `AUDIT_TIMEOUT`; um sentinela externo continuou
vivo. O teste representativo do autenticador real com 30.000/60.000 membros foi
revalidado. Esses resultados são ensaio local, não execução produtiva nem
aprovação do orçamento da próxima auditoria.

Um término não recuperável ainda pode deixar o registro SQLite privado na
custódia. A contenção limita a memória e a duração, mas não autoriza limpeza
automática: o resíduo continua limitado pelo contrato do registro, deve ser
identificado literalmente e tratado pelo procedimento de custódia já existente.

### Tentativa terminal c0146133-v1 e diagnóstico dirigido

A única auditoria da custódia
`p00-capacity-three-archives-c0146133-v1`, request SHA-256
`2b1d438d71af5d22dfb0c253b8595656f1ab27b59d4a910062fa07b767272f7e`,
autenticou o escopo e terminou em `AUDIT_MEMORY_MAX`. O terminal SHA-256
`b62a630b4ca092b7f58a2d6d5ddcecab58deec0b559acf4925813a62d4ebd9f5`
registra `exitCode=-9`, `signal=9`, pico do cgroup de 268.435.456 bytes,
`oom=1`, `oom_kill=2`, `oom_group_kill=1` e encerramento confirmado. Não houve
plano, `prepare`, `execute` ou efeito. Telemetrias do executor e supervisor:
`51008da92a34eff0257043068bde0fffaa2c578885b3a8737a47989d3cfb9e73`
e `f2c8ce4a8d4c8a485e1a338f491b8f44b34a22d7ec18731895c59f47730335d7`.

O primeiro archive concluiu 7.056 membros com último RSS amostrado de 34.066.432
bytes. O segundo teve o hash concluído e publicou `before_authority_compare` em
23,255 s; não houve `tar_scan_progress` para ele. O supervisor publicou o OOM em
50,451 s. O intervalo de aproximadamente 27,2 s não contém amostra de progresso,
`memory.stat`, PIDs/RSS individuais nem eventos do kernel. O valor 268.435.456 é
`memory.peak`/`MemoryMax` do cgroup; 277.770.240 é `ru_maxrss` reportado por
`RUSAGE_CHILDREN` depois de `wait()` e não deve ser interpretado como a mesma
medida nem como RSS instantâneo do executor.

Ensaios locais sintéticos, sem bytes produtivos, confrontaram o percurso real do
autenticador sob cgroup v2 de 256 MiB. Um payload esparso de 200 MiB passou com
pico do cgroup de 32.919.552 bytes; 3.000 arquivos regulares totalizando 192 MiB
descompactados antes do marco de 4.096 membros passaram com 27.844.608 bytes.
Um payload físico incompressível de 180 MiB já aquecido passou com 24.137.728
bytes. Depois de `POSIX_FADV_DONTNEED`, o mesmo caso aconselhado como frio atingiu
exatamente
268.435.456 bytes: máximos amostrados de `file=248.836.096`, `anon=19.587.072`,
`kernel=1.081.344` e RSS do processo de 31.260.672 bytes; houve reclaim local e
conclusão. O retorno de `POSIX_FADV_DONTNEED` não comprovou sozinho a residência
anterior ou posterior das páginas; esse ensaio demonstra pressão de cache, não
uma leitura fria autenticada nem a composição do OOM produtivo, cujo
`memory.stat` não foi coletado.

Antes de nova autorização, a regressão necessária deve executar autoridade e
archive físicos com residência inicial medida no cgroup real, amostrar
`memory.stat` e PIDs durante toda a passagem e avaliar pico, eventos, recuperação
e progresso conjuntamente. Eventual margem obrigatória precisa ter fundamento
versionado ou medido; não é derivada de orçamento de disco.
Elevar apenas `RLIMIT_AS`, contar nomes ou observar RSS não cobre esse caso. O
request e a custódia c014 são terminais e não podem ser repetidos.

Essa regressão foi materializada localmente, ainda sem operação produtiva. O
supervisor passa a publicar, no JSONL já limitado, amostras periódicas de
`memory.current`, `memory.peak`, `memory.events`, componentes selecionados de
`memory.stat`, PID/start ticks/UIDs/RSS do escopo e correlação sanitizada com o
último evento do executor. São no máximo 1.802 amostras, uma por segundo, e 32
PIDs por amostra; truncagem ou leitura indisponível tornam-se lacunas nominais.
O executor também emite progresso temporal, limitado aos mesmos 256 eventos por
candidato, durante hash, payload e comparação da autoridade, sem nomes ou
conteúdo.

O perfil dirigido criou três archives e autoridades exclusivamente sintéticos.
Os tamanhos das três folhas somam 458.973.184 bytes porque reutilizam apenas a
escala física declarada do lote original; isso **não** comprova o volume
descompactado dos archives produtivos. Os archives sintéticos somaram
459.113.917 bytes lógicos. Pelo supervisor/cgroup real, com
`MemoryMax=536870912`, a qualificação única reutilizou esses arquivos sem
recriá-los. Imediatamente antes do lançamento, após `fsync`,
`POSIX_FADV_DONTNEED` e `mincore`, os seis arquivos registraram zero de 224.144
páginas residentes e nenhuma lacuna. Não houve hashing ou leitura dos arquivos
entre essa captura e o supervisor. O autenticador completo passou os três
candidatos em 4,146 s e atingiu o teto. Na última amostra viva, tomada no mesmo
instante, `file=515.809.280`, `anon=19.091.456`, `kernel=1.880.064`, `shmem=0`,
dirty/writeback zero e RSS somado de 30.838.784 bytes. `high`, `oom` e
`oom_kill` permaneceram zero; o contador terminal `max=1508` comprova pressão e
reclaim suficiente para concluir, não OOM. O cgroup desapareceu após o término,
portanto não existe amostra direta de decaimento posterior. Cache `file` limpo é
potencialmente recuperável, mas não é presumido integralmente recuperável.

Não existe fundamento canônico ou medido para exigir 128 MiB acima do pico; os
128 MiB anteriores eram orçamento **de disco da custódia**, não margem de
memória. A conclusão corrigida é
`SYNTHETIC_PROFILE_512_MIB_QUALIFIED / VPS_OPERATIONAL_BUDGET_NOT_APPROVED`.
Ela qualifica somente o perfil sintético frio: não qualifica replay produtivo,
pois a equivalência de volume descompactado não foi provada e a composição do
OOM produtivo permanece desconhecida. Evidências: resultado
`1601d3ea7a357046bb3b38f24f2ea765e5f7fd33cdff3771e65bde9956e6d337`, terminal
`2a2a4d2e20080d2de1d2a6050f636fa0d5cdff96bca2be820c4b84805f1390f0`,
telemetria do supervisor
`cf0357ff48713f39372f1c3616edb2c2e92b9a01a281776411f844a78e494548` e plano
`cc496bdb21ca7aa808fc2ed2ef875dc6eae249c26964a0583f6374c04ef3f2a5`.
O próximo ato é revisão desta entrega; qualquer operação na VPS continua
dependente de autorização separada e de orçamento representativo do volume
produtivo desconhecido.

### Tentativa terminal 3950b67c-v1 e membro raiz da autoridade

A única auditoria posterior, control plane
`3950b67c01c10f9a3db84a06f51d45b023d9e527`, custódia
`p00-capacity-three-archives-3950b67c-v1` e request SHA-256
`1d0ad4d9dae5e21bb65ea2c7150b3ddc36570e804a9c07cb83022676aa92d762`,
também é terminal e não autoriza replay. O scope de 512 MiB terminou em
`AUDIT_MEMORY_MAX`: pico do cgroup `536870912`, `oom=1`, `oom_kill=2`,
`exitCode=-9`, sinal 9 e encerramento confirmado. Não houve plano, `prepare`,
`execute` ou efeito. Terminal `9cca7e1bc6f8176f2c97e1bff941e887a4483bc997db6983c9b0b8b7ff3f3034`,
telemetrias do executor e supervisor
`3240fb4dc6cdc141269e23cb0d9d568926354c7606a4977ac0d684165db22064`
e `ab4f7caa183003c9ec9148f8b3b36e6e4053e93aacc4f87af50c78663c2035f1`.

A última amostra viva, no segundo archive e na fase
`before_authority_compare`, registrou `memory.current=534433792`,
`anon=531619840`, `file=393216`, `kernel=2195456` e RSS do único processo
`543903744`. O contador `max=37` não é usado isoladamente: houve OOM nominal.
O primeiro archive concluiu 7.056 membros; o segundo não publicou resultado de
candidato e o terceiro não iniciou.

O diagnóstico local encontrou um defeito independente e reproduzível: o membro
tar normalizado `.` fazia `_authority_leaf()` começar em `root.parent`; quando
todos os ancestrais eram identidades admitidas, o percurso alcançava `/`, cujo
pai é ele próprio, e não terminava. A versão anterior foi reproduzida pelo
autenticador real em subprocesso limitado a cinco segundos e terminou por
timeout. O contrato corrigido admite `.`, `./.` e `./` somente como diretório que
representa a própria raiz autenticada, sem percorrer seus pais. Outros tipos,
escapes, raiz `/` e duplicatas após normalização continuam negados. Descendentes
provam confinamento antes de cada subida e negam antes de `parent == current`.

Os registros versionados do frontend 9f4 preservam hash, tamanho, 22.784
arquivos, 31 symlinks e a afirmação histórica `tar -tzf PASS`, mas não preservam
o comando de criação nem a linha de listagem do membro raiz. Assim, o defeito
está comprovado localmente; sua ocorrência no archive produtivo permanece
hipótese compatível com a última fase, não fato atribuído. Nenhum archive
produtivo foi relido para fechar essa lacuna.

### Tentativa terminal 916f8d6b-v1

O guard do membro raiz foi integrado pelo merge
`916f8d6b4e8696c821c40eec910dbca39449a319`, com árvore idêntica ao HEAD
testado e CI `41343829157` 4/4 PASS. A operação única seguinte usou custódia
`p00-capacity-three-archives-916f8d6b-v1` e request
`113abf0a6f770d6353abfc1fb7479134e599b329f572d0fdd409fe3819f73c15`.
O executor negou em 0,386 s com exit code 2 e
`FILE_SHA256:operational-state.schema2.private.json`: o estado operacional
materializado tinha SHA-256
`fd2c68d8d0889cc55799695f55225495b4c6cf2136f3a151b93fd0e731ed0d96`,
enquanto o request ainda vinculava o SHA anterior
`6641d581af300cd81f13ba3febffef377e4f78feb40ede7d82d886994953ea6c`.

Não houve avaliação por candidato, plano, `prepare`, `execute` ou efeito. O
scope terminou confirmado, sem OOM ou timeout; pico do cgroup 17.289.216 bytes,
pico RSS do filho 28.717.056 bytes. Terminal
`4ab144e806a8ea8ec43d013f40a6479c9d95bd557917ce51493697b3d944bdec`,
telemetrias `7235a80d617eaa1aa25df8828798a26c2ddb657083fc3bd2a71ea9dd75ed24b5`
e `d41fde756979d9b340243d39bef0439a263b18613575fa1bc4be6abffc86596e`,
índice `d2902c27a570e4a9e7d69e3278eb4ad2b3180b1a576b6fc2930a7b0a8130ce6f`.
A negativa comprova que caminho e SHA do estado operacional formam um binding
único: atualizar um exige atualizar atomicamente o outro antes do lançamento.
Essa custódia e esse request são terminais e proibidos para replay.

### Auditoria corrigida 916f8d6b-v2

A causa da v1 foi confirmada na montagem: um template do request anterior teve
os caminhos atualizados, mas conservou o SHA antigo da fotografia operacional.
Não houve defeito do consumidor. Na custódia exclusiva
`p00-capacity-three-archives-916f8d6b-v2`, a fotografia foi finalizada primeiro,
reaberta por leitura estável e autenticada em
`7c719d20eb94a7df6c2e6ac92eacfb38407eebc97d7a9c3f2158dc92039dbda5`.
Só então o request foi gerado do zero, reaberto e conferido campo a campo; seu
SHA final é `4cfaab66119ea9f06c96e26781d40fc5be158442a7ac0baa4386326b5b4c1c6e`
e a conferência selada é
`d53ca8c9094f7c249614de2db5c3d50ff8747b90a37d543c6ed9bf85e948a863`.
Nenhum insumo selado foi reescrito depois da conferência e nenhum payload foi
relido para montar os bindings.

O único `audit` terminou em 165,185 s, exit code 0, scope encerrado e estado
`P00_CAPACITY_RECOVERY_AUDIT_PASS`. O plano
`502cc4b7213f9db745ceb88bf3df13adcfeab27a1f243313962d6c97ca53abf5`
qualificou 3/3, `458.973.184` bytes e três inodes, sem referências ou writers;
`errors=[]`. O espaço observado foi `8.391.720.960` bytes e a projeção
`8.850.694.144`: o mínimo incremental passou e o alvo agregado não passou, como
esperado. A contenção chegou a `536.870.912` bytes, com 3.729 eventos `max`, mas
zero `oom`, `oom_kill` e `oom_group_kill`; RSS pico do filho 57.942.016 bytes.
Terminal `f4792439ba120732af502a7d49763a7cea12e084b7e022bb86e87da9f75ea03d`,
telemetrias `2454a7f595cd7accf59338424f65f26eb8df939e942a7853f63ad3309dfe8312`
e `7b1fdd1e4d9fb036ec91a328bb4576c76b06918a3eb183a2577ba95b314211f3`,
índice `5b2635c2e410de18a3847fcc84c41c9b672a865c31a3e981c7c8dc2f114c170d`.
Produção permaneceu inalterada, comprovada por
`e53272249a28b9d7d152c401b8f063f0967f8a89b079278ee028ec428ad86631`;
os três archives e suas autoridades continuam presentes. Esta etapa parou antes
de `prepare`/`execute` e não autoriza exclusão.

O plano PASS acima é a entrada imutável da próxima fase; outro `audit` é
proibido. A extensão local seguinte reutiliza no `prepare` a mesma contenção já
validada (`MemoryMax=536870912`, swap zero, prazo monotônico e encerramento do
scope confirmado), sem alterar elegibilidade, locks, journals ou `execute`.
Também corrige somente a autenticação do primeiro evento da telemetria: o arquivo
produtivo tinha 102.129 bytes, enquanto o leitor anterior lia 65.537 bytes e
rejeitava o arquivo inteiro por exceder 64 KiB. O novo leitor limita a primeira
linha a 64 KiB, autentica `telemetry_started` e não rejeita eventos posteriores.
A evidência original permanece imutável. Esta seção descreve patch local em
revisão; não registra `prepare` produtivo executado.

O escopo continua fechado nos três archives
`worker-reactive-afbb7455.tar.gz`, `frontend-9f4cbe0f-v2.tar.gz` e
`frontend-fa60-css-corrected.tar.gz`, total físico declarado de `458.973.184`
bytes. O ensaio local desta revisão usou autoridades sintéticas equivalentes e
30.000/60.000 membros, incluindo 318/634 nomes longos, 8/15 arquivos regulares
com conteúdo e autoridade físicos, 3/6 symlinks admitidos e os diretórios
restantes. Sob `RLIMIT_AS=256 MiB`, a implementação anterior reteve
30.000/60.000 objetos em `TarFile.members`; a implementação corrigida reteve no
máximo um, com RSS pico observado de 34.459.648/34.459.648 bytes. Depois do commit
final do registro, 30.000/60.000 nomes distintos e o mesmo número de verificações
de unicidade produziram bancos de 602.112/1.163.264 bytes lógicos e físicos. Os
valores foram medidos antes do cleanup, com `page_count=147/284`,
`page_size=4096`, `max_page_count=16384`, cache de 1.024 KiB e somente o arquivo
principal presente. O limite efetivo do banco foi 67.108.864 bytes. O limite de
256 MiB é hipótese de ensaio,
não orçamento produtivo aprovado. Este parágrafo registra controle implementado e
ensaiado localmente; nenhuma nova operação produtiva foi executada ou autorizada.

### Identidade do candidato e observação de processos

A identidade comparável do candidato inclui todos os campos da observação, exceto
`processScan`. Contadores e detalhes de uma varredura são evidência fresca de cada
fase; não são atributos imutáveis do artefato. Tanto `prepare` quanto `execute`
validam novamente a completude, referências e escritores antes dessa comparação.
Nenhuma referência real, varredura incompleta ou escritor é dispensado pela projeção.
Caminhos, identidades, métricas físicas, bindings e equivalência continuam comparados.

O `prepare` negado conserva na saída privada a observação atual e os nomes dos
campos que divergiram. A recaptura de `execute` é persistida, inclusive quando nega,
antes de qualquer `ATTEMPT`. Planos PASS existentes permanecem imutáveis e podem
ser reabertos pelo hash original; sua reutilização exige toda a revalidação fresca,
sem repetir a auditoria somente para igualar contadores.

### Formatos transacionais autenticados

A recaptura reconhece de forma fechada os dois formatos canônicos vigentes:
`transaction.v1.private.json`, do fixed-current/API-only, e
`window-state.private.json`, do frontend-only. O segundo exige estado conhecido e
`saveCount` coerente; janelas não terminais protegem todas as referências absolutas
dos JSON privados da transação. A presença simultânea dos dois formatos é ambígua e
nega.

Os layouts pré-canônicos observados antes dessa convergência possuem classificadores
fechados: rollback com os três sentinelas byte-exatos, transação antiga com os quatro
JSON de identidade/retorno tratada sempre como não terminal e protegida, e preflight
vazio cujo nome segue o formato autenticado. Diretório vazio com outro nome, estado
desconhecido, sentinela divergente, JSON inválido/symlink ou qualquer layout não
classificado resulta em `LIVE_TRANSACTION_LAYOUT_UNKNOWN` ou negativa mais
específica. Nenhum diretório é ignorado por idade ou ausência de journal novo.

## Classes removíveis

### `NPM_CACHE_MAINTENANCE`

Admite exclusivamente `/home/deploy/.npm/_cacache`, com pai literal
`/home/deploy/.npm`. Nesta classe, e somente nela, `deploy:deploy 0775` é a
identidade canônica do pai. O cache deve ser diretório físico, não symlink, com
device/inode e owner/group autenticados e modo fechado `0700`, `0750` ou `0755`;
escrita por grupo ou outros é sempre negada.

O grupo `deploy` deve conter canonicamente apenas o principal `deploy`; o pedido
não pode fornecer ou ampliar essa allowlist. Membro suplementar ou usuário com
GID primário inesperado nega. Também negam: processo `npm`/build ativo, inclusive
`node .../npm-cli.js`, CWD, FD, mapa de memória ou outra referência sob o cache e
qualquer varredura `/proc` incompleta de processo pertencente a `deploy`.
Cada PID é vinculado ao UID autenticado em `status` e aos `start ticks` lidos
antes/depois. Para processos, “referência” significa alvo literal igual ao candidato
ou localizado abaixo dele; ancestrais genéricos como `root=/`, `cwd=/` ou
`cwd=/home/deploy` não provam uso do descendente e não negam. CWD, executável, FD,
mapa ou argumento no próprio candidato ou abaixo dele continuam negando. Para
`NPM_CACHE_MAINTENANCE`, a mesma contenção direcional vale para referências
operacionais: um HOME, root ou diretório ancestral genérico não prova uso do cache.
A sobreposição bidirecional permanece obrigatória para referências operacionais da
classe `DERIVED_OUTPUT_RUNTIME`, onde um caminho ancestral pode proteger todo o
output. `cmdline` vazio, isoladamente, nunca torna um processo dispensável:
processos de usuário nessa condição ainda têm `cwd`, `root`, `exe`, FDs e mapas
integralmente inspecionados. Uma thread de kernel só é ignorada após autenticar UIDs
root, o bit `PF_KTHREAD`, PID/start ticks e flags estáveis; desaparecimento durante
a coleta só é classificado como processo encerrado após confirmar a ausência do
diretório do PID. `ENOENT` em `stat`, revalidação sem cmdline ou revalidação final,
com o PID ainda presente ou de ausência inconclusiva, permanece falha nominal e
mantém a coleta incompleta.
O fechamento de um FD entre a enumeração e o `readlink` é registrado como transiente e aceito somente
com PID/start ticks estáveis. Qualquer outra falha de leitura de referência de
processo `deploy` mantém a varredura incompleta e passa a ser contada nominalmente.
Limitação esperada em processo de outro UID não bloqueia, mas qualquer comando
npm/build ou referência legível desse processo continua negando. Essa regra não é
compartilhada com ancestrais de `generation-retirement.py`.

Quando a varredura de um processo `deploy` permanece incompleta, o plano negado
preserva junto ao predicado somente o diagnóstico sanitizado necessário: PID,
start ticks, quatro UIDs, operação, errno e nome do errno. Cmdline, ambiente,
alvos de FD e credenciais não integram esse diagnóstico. Fechamento transitório de
FD é registrado separadamente; permissão negada, mudança de identidade ou outra
leitura realmente incompleta continuam fail-closed.

### Observador privilegiado de `/proc`

Quando a política de montagem de `/proc` impede `deploy` de inspecionar até seus
próprios processos, o schema 2 do pedido deve vincular por SHA-256 o observador
versionado `scripts/capacity-proc-observer.py`. Ele não decide elegibilidade e não
remove arquivos: aceita apenas a operação literal `collect`, recebe pela entrada
padrão uma lista fechada de candidatos e devolve na saída padrão evidência
sanitizada. Não aceita comando, módulo, executável, caminho de saída ou argumento
de descoberta fornecido pelo operador.

O próprio helper aceita somente o cache literal `/home/deploy/.npm/_cacache`,
runtimes `api-runtime`/`frontend-runtime` no layout fechado
`/opt/re7online/build-output/<release>-producer/<release>/<runtime>`, os basenames
fechados da classe `CLOSED_PREPARATION_DERIVED_ARCHIVE` e os três caminhos
literais do manifesto versionado
`config/capacity-recovery/closed-preparation-manifest-disposition.v1.json`.
`/`, raízes, ancestrais genéricos, outros descendentes e caminhos externos são
negados antes da varredura.

A instalação proposta é imutável para `deploy`:

- `/usr/local/libexec/re7online` — `root:root 0755`;
- `/usr/local/libexec/re7online/capacity-proc-observer.py` — `root:root 0500`;
- `/etc/sudoers.d/re7online-capacity-proc-observer` — `root:root 0440`.

A única regra sudoers é versionada em
`config/sudoers/re7online-capacity-proc-observer` e permite somente:

```text
/usr/bin/python3 -I -B -E -s /usr/local/libexec/re7online/capacity-proc-observer.py collect
```

O consumidor executa essa linha literalmente com `sudo -n --`, autentica antes e
depois o arquivo e todos os ancestrais root-controlled, e confere no retorno o SHA,
device/inode, nonce, SHA do request, candidatos, fase, PID/start ticks do consumidor
e limites de tempo e volume. JSON reapresentado ou fornecido à parte não é aceito.
Falha, timeout, identidade alterada, truncagem que represente incompletude ou
referência real continuam negando.

`audit` e `prepare` coletam evidência própria. Em `execute`, a coleta ocorre outra
vez somente depois da aquisição dos dois locks canônicos e antes do primeiro
`ATTEMPT`, junto à recaptura das demais fontes vivas. O processo privilegiado não
executa `capacity-recovery.py`, não recebe o lock e jamais possui autoridade de
retirada.

### `DERIVED_OUTPUT_RUNTIME`

Admite somente descendente estrito da raiz `outputs` da política versionada.
Todos os ancestrais entre a raiz e o runtime devem ser diretórios físicos,
confinados, com owner/group canônicos e sem escrita por grupo/outros.

Contrato da geração, pacote, manifesto e índice são reabertos com `O_NOFOLLOW`,
leitura estável e SHA-256 externo. O runtime do output é comparado entrada por
entrada com a release instalada preservada: tipo, modo, tamanho e SHA-256, além
do conjunto integral de caminhos. Somente overlays explicitamente declarados no
contrato podem existir apenas na release.

Referência por `current`, PM2 live/dump, transação aberta, grafo protegido ou
processo nega o candidato. Pacote, manifesto, índice e release instalada nunca
entram no comando da classe.

### `CLOSED_PREPARATION_DERIVED_ARCHIVE`

Admite somente os arquivos literais `api-frontend-return.private.tar.gz` e
`worker-return.private.tar.gz`, como filhos diretos de uma preparação física, e
`worker-minimal-b9-v3.tar.gz` no subdiretório literal `window`. Todos ficam sob
`/opt/re7online/backups/converta-persistent/preparations`. Diretórios, outros
basenames, symlinks, hardlinks, escapes e ancestrais graváveis por grupo/outros são
negados. O arquivo exige owner/group canônicos, modo privado, device/inode, tamanho,
blocos, SHA-256 e `nlink=1` estáveis em todas as fases.

A prova fechada é o registro versionado autenticado da preparação, que vincula
literalmente basename, bytes, SHA-256 e a verificação histórica por `tar -tzf`, ou
uma cópia autoritativa byte-idêntica que permanece preservada.
`worker-minimal-b9-v3.tar.gz` aceita exclusivamente a segunda forma,
`proof.kind=DUPLICATE_COPY`; registro versionado nunca o autoriza. Arquivos ou
membros de archive classificados como `content`,
DB, runtime-data, configuração privada, `.data`, uploads tenant-scoped, credenciais
ou evidência são negados. A listagem do tar é inspecionada sem extração.

O observador privilegiado aceita apenas esses layouts fechados. A
recaptura de referências continua ocorrendo em `audit`, `prepare` e, novamente sob
os locks, em `execute`. O único efeito é
`/usr/bin/unlink -- <arquivo-autenticado>`; não há `rm -r`, glob ou exclusão do
diretório da preparação. Journal e receipt registram a medição física anterior e
posterior, e o diretório-pai recebe `fsync` após a ausência comprovada.

### `CLOSED_PREPARATION_MANIFEST_DISPOSITION`

Esta classe aceita somente disposições registradas em código por caminho, SHA-256,
`dispositionId` e cardinalidade. Permanecem fechadas e independentes:

- `p00-closed-preparations-20261031-v2-three-archives`, terminal, com exatamente
  os três archives já concluídos e seu manifesto byte-intacto;
- `p00-worker-package-audit-afbb7455-v1`, ainda não executada, com exatamente a
  árvore literal `worker-package-audit`, autoridade física literal
  `worker-minimal-reactive-afbb7455-verified`, `PACKAGE_FILES.sha256` e
  `PACKAGE_SYMLINKS.txt` vinculados pelos hashes versionados.

Manifesto alternativo, mistura entre disposições, caminho adicional ou binding
de SHA divergente negam antes da qualificação. O executor autentica caminho e
SHA-256 do manifesto versionado e nega campo, caminho, autoridade ou registro
histórico alternativo.
Cada fase reabre o manifesto, os registros, candidatos e autoridades e recaptura
as fontes vivas e as referências de processos.

O manifesto schema 2 fixa separadamente a identidade dos ancestrais do candidato
e da raiz física de autoridade. Raízes de autoridade podem pertencer a
`root:root` ou `deploy:deploy`; device, inode, UID, GID e modo devem coincidir com
o manifesto e permanecer iguais em `audit`, `prepare` e `execute`. Todos os três
candidatos exigem autoridade física presente; `ABSENT` é schema inválido. Symlink
não substitui a raiz física declarada.

Ancestrais dos candidatos podem conservar owners históricos `root:root` ou
`deploy:deploy`. Todos devem ser diretórios físicos, no device esperado e não
graváveis por grupo ou outros; são enumerados no manifesto e autenticados em
todas as fases. Escrita por grupo/outros continua sendo bloqueio material, ainda
que o modo observado esteja registrado.

Os três archives são relacionados integralmente sem extração: nomes duplicados,
escapes, links perigosos, devices, FIFO e tipos desconhecidos negam. O manifesto
produtivo não admite `protectedMemberExceptions`; a proteção global de `.env.*`,
`uploads` e demais materiais privados permanece sem exceção.

O autenticador possui suporte técnico ensaiado para a entrada fechada
`ENUMERATED_TREE`, sem alterar o manifesto terminal 3/3. A árvore exige
`PACKAGE_FILES.sha256` e autentica `PACKAGE_SYMLINKS.txt` como uma das folhas
regulares antes de interpretar sua relação. Arquivos e links declarados precisam
coincidir exatamente com a árvore candidata; cada link é confrontado por
`lstat/readlink/lstat`, sem seguir o destino, e com o link correspondente na
autoridade. Links extras, ausentes, duplicados, divergentes, escapes ou substituição
de tipo negam. Um overlay adicional na autoridade não entra na relação nem nos
efeitos. Folhas usam hashing em blocos e a relação usa digest incremental; não se
retêm payloads ou a relação completa em memória.

O manifesto específico de `worker-package-audit` fecha caminho, autoridade,
identidades históricas, bytes físicos registrados e hashes das duas relações. O
observador privilegiado admite somente esse novo caminho literal, além dos
literais anteriores; não recebe raiz ou caminho livre. Isso habilita uma futura
qualificação única pelo `audit` canônico contido, mas não a substitui: identidade,
equivalência folha a folha, referências vivas, capacidade e locks serão recapturados
nessa fase. Nenhum `prepare`, autorização ou efeito é criado por esta habilitação.
O manifesto terminal 3/3 permanece byte-exato.

A montagem operacional dessa qualificação reutiliza o procedimento comprovado em
`p00-capacity-three-archives-916f8d6b-v2` e na retirada sucessora concluída:
finaliza a fotografia, autentica seus bytes, constrói um request novo, reabre cada
binding e só então sela o SHA do request. A serialização do fingerprint PM2 é a
mesma função canônica do consumidor (ordenação por `name`, fallback de
`pm2_env` e newline final). O PM2 é invocado pelo arquivo original autenticado e
por FD; o Node fechado é `/usr/bin/node` `v20.20.0`, não um caminho NVM.

Para o helper `root:root 0500`, o materializador não tenta ler seus bytes como
`deploy`. Ele consome a prova privada produzida pelo instalador autenticado, fixa
SHA do instalador e do sudoers, e confronta por `lstat` caminho, SHA declarado,
device, inode, UID, GID e modo. Prova ausente, pertencente a outro helper ou com
identidade divergente nega. O único delta em relação ao lote 3/3 é o contrato
fechado de `worker-package-audit`: um candidato `ENUMERATED_TREE`, seu manifesto
específico e o helper cuja allowlist contém apenas esse caminho adicional. Não há
fallback para checkout, caminho livre ou reaproveitamento de fotografia/request.

O materializador versionado
`scripts/capacity-recovery-worker-package-materialize.py` deriva `ROOT` de sua
própria custódia, autentica por SHA o consumidor copiado e reutiliza dele
`canonical()`, `_pm2_projection()` e os validadores de binding. A regressão
executa ambos fora do checkout e chama `audit_request()` real: fotografia,
recaptura de current/PM2/dump/grafo/transações e autenticação da árvore sintética
permanecem reais; somente a invocação sudo do observador `/proc` é substituída
por sua fronteira sintética. O teste produz plano PASS e também nega fingerprint
adulterado, troca do consumidor, drift entre fotografia/request e o readback
pré-selagem, manifesto, prova e identidade do helper. Isso é controle
implementado e ensaiado localmente; não é auditoria produtiva, autorização ou
renovação das tentativas v1/v2/v3 preservadas.

Arquivos regulares da autoridade são comparados por conteúdo e tamanho. O modo
observado do arquivo físico é autenticado na relação, mas não precisa reproduzir o
modo armazenado no tar; ambos são registrados. Drift de owner, device, inode,
modo, conteúdo ou destino físico continua negando.

No manifesto terminal 3/3, o único efeito é `/usr/bin/unlink -- <archive>`.
Na disposição `worker-package-audit`, os únicos efeitos possíveis são `unlink`
literal de cada folha candidata declarada e `rmdir` literal em pós-ordem, somente
de diretórios candidatos vazios. A autoridade e seu overlay `.data` nunca entram
nos efeitos. Nunca há `rm -r`, glob, shell ou exclusão da preparação inteira.
Cada efeito recebe `ATTEMPT`, `RESULT` e
`VERIFIED`; falha intermediária fecha o receipt parcial e não repete efeitos
concluídos automaticamente.

Um plano `P00_CAPACITY_RECOVERY_AUDIT_DENY` é gravado integralmente, mas a
invocação termina com exit code não zero. A existência do plano negado não é
sucesso do processo.

### `CLOSED_DEPLOY_CONTROL_DERIVED_TREE`

Esta classe é uma disposição legada fechada para **quatro e somente quatro**
árvores ignoradas do worktree histórico `ef7db111-prep`: os dois
`node_modules`, `.next` e `apps/whatsapp-agent/dist` enumerados no manifesto
`ef7db111-deploy-control-disposition.v1.json`. A raiz do worktree, `.git`, o
registro administrativo do worktree, commit, lockfiles, fontes, documentação e
controles rastreados permanecem fora dos efeitos. A raiz inteira de
`deploy-control`, outro worktree, descendente livre ou quinto caminho são
negados pelo schema, pelo manifesto e pelo observador privilegiado.

O manifesto fixa caminho, identidade da raiz, bytes físicos, commit, gitdir,
digest do arquivo `.git`, conjunto preservado e a proveniência rastreada de cada
árvore. O consumidor exige HEAD byte-exato, worktree registrado, estado Git
limpo inclusive para não rastreados, candidato ignorado e todas as fontes
preservadas presentes. O modo histórico `0775` da raiz e do gitdir só é aceito
para `deploy:deploy` quando o grupo `deploy` contém exclusivamente `deploy`;
outros ancestrais e todas as árvores candidatas continuam sem escrita por grupo
ou outros.

Cada folha é enumerada sem seguir links. Arquivos são lidos por FD com
`O_NOFOLLOW`, hash incremental e identidade antes/depois. Symlinks precisam ser
relativos e confinados à própria árvore. Hardlinks são admitidos somente quando
todos os links do inode estão dentro dos quatro candidatos; link externo,
device diferente, tipo inseguro, drift ou material privado (`.env`, chaves,
dumps, DB, sessões, `.data`, runtime-data ou tenant-data) negam. Nomes de módulos
como `openai/resources/uploads`, `db` ou `media` não são privados por nome
isolado; a negativa depende do predicado fechado acima.

Os efeitos são somente `unlink --` literal por folha e `rmdir --` literal em
pós-ordem. `audit`, `prepare` e `execute` reabrem o manifesto, Git, identidades,
conteúdo e referências; `execute` faz a recaptura final sob os locks antes do
primeiro `ATTEMPT`. Journal e receipt existentes continuam sendo a única prova
de efeito. Interrupção fecha resultado parcial verificável e nunca repete efeito
automaticamente. O aumento limitado dos tetos de journal/receipt do supervisor
acomoda a cardinalidade aproximada de 34 mil efeitos; não amplia candidatos nem
o orçamento de custódia.

A regressão materializa consumidor e manifesto fora do checkout, atravessa
`audit → prepare → execute` com fixture Git representativa, preserva fonte e
controles e cobre CWD, FD, maps, drift, symlink, hardlink externo, material
protegido e interrupção parcial. Isto qualifica o código para revisão; não é
auditoria produtiva, autorização ou retirada.

O inventário preservado pelo PR documental #313 sustenta raízes, bytes,
cardinalidade (2.326/21.808/31, 710/6.934/10, 284/1.650/0 e 58/483/0) e ausência
nominal de payload privado. Ele não contém a relação completa de destinos dos 41
symlinks nem prova individual de owner/modo/nlink de todas as folhas. Portanto
esses predicados permanecem verificações obrigatórias da futura fase `audit` e
podem negar o lote; a implementação não converte a classificação documental em
elegibilidade presumida.

## Fontes de verdade preservadas

Sempre preservar:

- Git e documentação versionada;
- banco, dados, mídias, credenciais e configurações tenant-scoped;
- releases ativas;
- um rollback imediato autenticado por componente e todo retorno transitivo ainda
  exigido pelo grafo;
- pacote, manifesto e índice das releases preservadas;
- dump PM2 e configuração operacional vigente;
- contratos, markers e recibos compactos necessários para provar decisões e
  efeitos anteriores.

## Material reconstruível ou retirável após fechamento

Podem ser considerados, nunca presumidos:

- cache npm pela classe específica acima;
- worktrees, `build-output` e staging encerrados;
- releases além do rollback, quando fora de todo grafo protegido;
- preparações negadas antes de mutação;
- transações terminais antigas;
- evidência bruta já consolidada em recibo/índice suficiente;
- logs antigos sob política explícita de rotação.

Worktree, staging, release, preparação, transação, evidência ou log não pertence
automaticamente às duas classes desta ferramenta. Até existir classe versionada
com prova fechada, permanece `NOT_QUALIFIED` e requer evolução separada do
control plane.

## Recibo e fechamento parcial

O receipt root deve ser novo, privado e estar sob pai seguro. Cada stdout/stderr,
journal e recibo é criado com exclusividade, modo `0600` e `fsync`; o diretório é
sincronizado antes da liberação dos locks. O recibo registra contadores, caminhos
efetivamente ausentes e hashes da intenção/autorização/journal.

Uma falha produz fechamento terminal parcial e preserva todos os efeitos já
comprovados. Não existe retry ou retomada automática. Uma operação futura sobre
o estado remanescente exige nova auditoria, preparação e autorização; nunca se
reutiliza `AUTHORIZE_ONCE` consumida nem o mesmo receipt root.


## Continuidade qualificada em 01/11/2026 — leitura obrigatória antes de nova frente

Esta seção consolida o procedimento exercido, não autoriza reproduzir os caminhos,
requests ou autorizações históricos. Princípios continuam superiores ao runbook.
O comando executável de uma nova operação deve ser materializado pelo mecanismo
canônico, com os argumentos da versão autenticada; exemplos históricos não são
templates consumíveis.

### Sequência que funcionou

1. Identificar o último checkpoint válido e a diferença em relação ao código,
   layout, dados e ambiente atuais. Reutilizar provas e bytes ainda válidos.
2. Validar localmente a transição completa dos consumidores reais, inclusive
   localizações físicas distintas de audit, prepare e execute.
3. Finalizar a fotografia operacional antes de gerar seu binding no request.
   Reabrir os pequenos insumos por identidade/hash/modo e selar o request por
   último. Reescrita posterior invalida a selagem; não transportar hashes de
   templates antigos.
4. Autenticar executor, supervisor, helper, manifesto, registros e ambiente
   Node/PM2. Derivar os bindings de manifesto e registros da raiz histórica
   autenticada pelo plano, conforme o contrato fechado acima.
5. Usar o supervisor versionado nas três fases, com contenção efetiva de memória
   agregada, swap, prazo e encerramento restrito à unidade exata. Leituras caras
   também consomem recursos produtivos.
6. Audit publica plano; prepare revalida e sela intenção/comandos; execute consome
   autorização própria e recaptura referências sob locks antes do primeiro efeito.
   Revalidar não significa produzir outra auditoria para substituir uma prova válida.
7. Após efeito, reconciliar journal e receipt, confirmar ausências, autoridades e
   produção preservadas, medir ganho e custo da custódia e registrar terminalidade.

O lote encerrado usou 512 MiB, swap zero, prazo de 1.800 s, graça de 5 s e
orçamento de custódia de 128 MiB em disco. São condições daquela operação,
não defaults aprovados para qualquer futura carga. A memória disponível do host
era uma observação, não reserva garantida. Ganho previsto de 458.973.184 bytes
não substitui ganho medido de 458.964.992 bytes. O receipt
`6662af796b38018af5285f552fc80090ed4fdfd29f27143bad8fdb255cbc0646`
encerra o lote 3/3; não voltar a inventariar ou tentar remover seus caminhos.

### Falhas que a próxima preparação precisa detectar

| Falha real | Controle/regressão existente a reutilizar |
| --- | --- |
| Streaming conservava nomes e TarInfo | Digest incremental, registro exato em disco limitado e liberação de TarFile.members; regressões de cardinalidade |
| Membro raiz iniciava subida fora da autoridade | Tratamento explícito de diretório raiz, confinamento antes de subir e término obrigatório antes do ponto fixo parent == current |
| Fixture de poucos bytes declarada representativa de toda memória | Separar cardinalidade, maior folha, volume e leitura física fria; relatar cobertura e lacunas |
| Monitoramento confundido com proteção | cgroup agregado e prazo reais, testes de OOM/timeout e sentinela externo |
| Cache confundido com heap | Amostras correlacionadas de memory.stat, PIDs/RSS e eventos; não somar máximos de instantes diferentes |
| Request conservou hash de fotografia anterior | Fotografia final → readback estável → bindings conferidos → request selado |
| Executor idêntico relocado mudou ROOT | Binding histórico caminho+SHA do plano e regressão completa entre roots distintos |
| Telemetria maior que 64 KiB tornou início inconclusivo | Autenticar somente a primeira linha limitada, não rejeitar pelo volume total do JSONL |
| Processo encerrou, mas efeitos não estavam reconciliados | Diferenciar término do scope, início do executor e estado dos efeitos; não inferir sucesso ou zero efeitos pelo exit code |
| Nova coleta repetia prova suficiente | Predicado, efeitos, provas válidas e menor próxima ação após cada negativa |
| Árvore enumerada continha links internos legítimos, mas o autenticador aceitava só arquivos regulares | `PACKAGE_SYMLINKS.txt` autenticado antes da interpretação, conjunto exato de tipos e `lstat/readlink/lstat`; suporte ensaiado não equivale a qualificação |

O loop de raiz é defeito reproduzido e corrigido. A presença do membro raiz no
archive produtivo não foi demonstrada pelos registros históricos; não converter
essa hipótese em causalidade provada. O OOM produtivo mais recente registrou
memória anônima dominante; o perfil sintético dominado por cache não o explica.
Atingir memory.max ou aumentar seu contador não equivale isoladamente a OOM.

Uma execução parcial/negada é terminal. Preservar seu recibo e sua autorização
consumida. Qualquer sucessão precisa ser explicitamente delimitada pelo contrato,
sem sobrescrita, replay automático ou ampliação silenciosa. Distinguir o escopo
autorizado pelo owner do documento técnico de uso único: o documento consumido
nunca volta a ser usado.
