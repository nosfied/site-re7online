# Política canônica de recuperação mínima de capacidade

Esta política define o único fluxo normal para qualificar e retirar resíduos de
capacidade fora do encerramento obrigatório de uma geração. A implementação é
`scripts/capacity-recovery.py`; executores privados, comandos improvisados e
adaptações de `generation-retirement.py` para cache npm são proibidos. Execuções
longas usam exclusivamente `scripts/capacity-recovery-supervisor.py`, que chama o
executor irmão sem shell, preserva canais e código de saída e registra a última
fotografia de memória do cgroup e o pico RSS do processo filho via
`RUSAGE_CHILDREN` após término normal ou por sinal.

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

Plano e intenção são schemas fechados. Caminho, classe, device/inode,
owner/group/mode, métricas físicas, hashes das fontes e comando fazem parte do
binding. A fotografia operacional schema 2 exige fontes de recaptura ao vivo;
fotografia anterior sem essas fontes é negada. O único comando destrutivo
admitido é:

```text
/usr/bin/rm -r -- <caminho-autenticado>
```

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
de tamanho, sem reter archive, folha ou lista integral em memória. Duplicidades,
escapes, links e tipos inseguros continuam fail-closed.

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

Esta classe existe somente para a disposição fechada
`p00-closed-preparations-20261031-v2-three-archives`. O executor autentica caminho e SHA-256 do
manifesto versionado; exige exatamente os três archives candidatos, sem mistura com outra
classe, e nega campo, caminho, autoridade ou registro histórico alternativo.
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

Arquivos regulares da autoridade são comparados por conteúdo e tamanho. O modo
observado do arquivo físico é autenticado na relação, mas não precisa reproduzir o
modo armazenado no tar; ambos são registrados. Drift de owner, device, inode,
modo, conteúdo ou destino físico continua negando.

O único efeito possível neste manifesto é `/usr/bin/unlink -- <archive>` para
cada um dos três caminhos literais. Nunca há `rmdir`, `rm -r`, glob, shell ou
exclusão da preparação inteira. Cada efeito recebe `ATTEMPT`, `RESULT` e
`VERIFIED`; falha intermediária fecha o receipt parcial e não repete efeitos
concluídos automaticamente.

Um plano `P00_CAPACITY_RECOVERY_AUDIT_DENY` é gravado integralmente, mas a
invocação termina com exit code não zero. A existência do plano negado não é
sucesso do processo.

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
