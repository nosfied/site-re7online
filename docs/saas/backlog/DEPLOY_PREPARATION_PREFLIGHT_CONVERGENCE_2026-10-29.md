# Plano P00 — convergência da preparação de deploy

**Status:** P00 / BLOQUEADOR / IMPLEMENTAÇÃO EM REVISÃO  
**Data de abertura:** 29/10/2026  
**Atualização:** admissão agregada e materialização atômica do control plane implementadas em PR próprio; ciclo do lock resolvido pelo PR #275 / merge `3d7604800ee62ef236a7985f7279306f4085a307`  
**Autoridade:** [princípios fundamentais de trabalho](../WORKING_PRINCIPLES.md)

Este plano registra uma dívida operacional evidenciada durante a preparação da
release `immutable-754281d3-vps-20261029T174145Z`. Ele não autoriza mutação,
ativação, exclusão ou nova execução na VPS. O único runbook executável continua
sendo o [runbook canônico](../DEPLOY_RUNBOOK.md).

## Problema comprovado

A mesma preparação alcançou gates previsíveis em invocações sucessivas:

1. política materializada como `0664`, embora o consumidor aceite somente
   `0600` ou `0644`;
2. fotografia operacional com `controlPlaneArtifacts[].copied=false`, embora o
   schema exija cópias autenticadas e `copied=true`;
3. `activate` negado por `global_lock_active`: o fluxo anterior preservou
   `deploy.lock` regular `0600` e livre de `flock`, enquanto a aquisição seguinte
   ainda tratava a mera existência física como ocupação ativa.

As negativas preservaram produção, mas consumiram tempo humano, capacidade de
disco, execuções de CI e autorizações. A causa processual é a ausência de uma
admissão integral que valide todos os requisitos antes de invocar `prepare`.
Tratar cada predicado isoladamente viola os princípios de evitar retrabalho,
auditar antes de alterar e não transferir ao owner o custo de falhas previsíveis.

O item 3 foi corrigido de forma versionada pelo PR #275: finalizações terminais
agora liberam o nome canônico ainda sob o mesmo `flock`, e o lock legado pode ser
reconciliado somente por ação fechada e autenticada. Essa entrega não encerra os
itens 1 e 2 nem substitui a admissão integral restante.

## Estado que deve ser reutilizado

Não repetir nem substituir provas ainda válidas:

- target `754281d321b254bef9ee13cdb46595ea868703a7`;
- release `immutable-754281d3-vps-20261029T174145Z`;
- pacote SHA-256
  `2e640995821cfdfbe16cd03044ee81824ad6d432be2fb4043ab8913d44beaa61`;
- tar SHA-256
  `a23bd230ef875a7c4e3a3dbfad0b121070b71e6e80351e8e641ea16c4852bf7a`;
- manifesto SHA-256
  `b906710db105a6eaec7a3e2d5055bd61cc18d335410d1a07ca30bde54220bb61`;
- índice SHA-256
  `5cbab62779fea56f6692ca2074ed4f562c1d07ac968cb9308238ec0305c0d3a1`;
- release inerte instalada e verificada;
- produção ativa em API `0fdec`, frontend `b96` e worker preservado.

São proibidos novo produtor, npm, build, extração ou reinstalação para substituir
esses artefatos.

## Objetivo

Transformar a preparação em uma operação convergente: uma única admissão
somente leitura deve enumerar e validar todos os requisitos do
`generation-retirement.py prepare` e do preflight fixed-current API-only antes
de qualquer um deles ser invocado.

## Frentes obrigatórias

### P00-A — admissão integral do estado existente

Produzir uma matriz estruturada, autenticada e sem mutação produtiva que cubra,
no mínimo:

- identidade do merge, árvore, CI, target, pacote e release instalada;
- modos, owner/group, hashes, symlinks e ancestrais de todos os insumos;
- schema integral do contrato, lifecycle e fotografia operacional;
- raízes canônicas e política autenticada;
- cópias privadas do control plane e `copied=true`;
- destinos de intenção, comandos, review, transação e receipt;
- existência e identidade dos pais privados;
- locks de deployment e writer;
- grafo de releases, `current`, PM2 live, dump e rollbacks;
- runtime manifest, PM2 6.0.14, readiness, listeners e health;
- espaço e inodes atuais, sem repetir o build;
- ausência de artefatos parciais que tornem a próxima escrita não exclusiva.

Qualquer divergência encerra a admissão antes de `prepare`. A matriz deve relatar
todos os campos inválidos detectáveis na mesma leitura; não apenas o primeiro.

### P00-B — materialização canônica do control plane

Implementar solução versionada, preferencialmente estendendo o control plane
existente em vez de criar wrapper temporário, que:

- materialize custódia privada `0700`;
- copie exclusivamente os artefatos exigidos com `O_EXCL|O_NOFOLLOW`;
- grave arquivos `deploy:deploy 0600`, com `fsync`;
- autentique bytes e SHA-256 antes e depois;
- publique a fotografia operacional somente após a segunda observação estável;
- registre literalmente `copied=true`;
- não importe Python gerando `__pycache__`; execuções usam `-B` e
  `PYTHONDONTWRITEBYTECODE=1`;
- seja idempotente por verificação exata, nunca por sobrescrita silenciosa.

#### Protocolo do lock — resolvido pelo PR #275

O merge `3d7604800ee62ef236a7985f7279306f4085a307` incorporou o protocolo
versionado: mantém FD 9 e `flock` durante o fechamento, autentica o estado
terminal, remove o nome canônico sob o mesmo lock e sincroniza o diretório.
Também incorporou a ação fechada `release_terminal_lock`, vinculada aos hashes
do journal e do lock, para reconciliar exclusivamente o resíduo legado atual.

Essa frente não deve ser reimplementada. A admissão restante apenas consome e
valida esse contrato, negando lock ocupado, identidade divergente ou estado não
terminal. Remoção, renomeação ou substituição manual continuam proibidas.

### P00-C — consumo condicionado

`prepare` e preflight API-only só podem ser executados quando vinculados à prova
de admissão integral. Para a release atual:

- no máximo uma nova invocação de `prepare`;
- se passar, no máximo um preflight API-only;
- parada obrigatória antes de `activate`;
- nenhuma ampliação silenciosa da autorização;
- nenhuma repetição de build, extração ou verificação já comprovada.

### P00-D — regressões e documentação

Adicionar regressões que comprovem:

- `0664` é detectado na admissão, antes do consumidor;
- `copied=false`, cópia ausente, hash divergente, symlink, owner ou modo inválido
  são agregados no relatório e impedem `prepare`;
- nenhum destino parcial é publicado quando a admissão nega;
- o caminho válido materializa as três cópias, gera fotografia v2 aceita e alcança
  `PREFLIGHT_PASS` sem ativar;
- as regressões já incorporadas pelo PR #275 permanecem obrigatórias: estado
  terminal libera o nome canônico; estado não terminal, digest divergente ou lock
  ocupado preservam o lock e negam;
- a suíte convergente integra, sem duplicar ou substituir, o contrato do #275 e
  comprova que a admissão restante não reintroduz `global_lock_active` falso;
- frontend, worker, tenants, campanhas, Meta, guarda e dump permanecem intactos;
- pacote/release existentes são reutilizados e o contador de build permanece zero.

Atualizar, no mesmo conjunto versionado, testes, runbook, modelo operacional,
lifecycle, estado canônico e validadores documentais. A documentação não pode
declarar o procedimento incorporado antes dessas fontes concordarem.

## Implementação versionada da admissão

`scripts/deploy-preparation-admission.py` consome um pedido privado autenticado e
valida, em uma única passagem, o conjunto fechado de checks e provas exigido antes
de `prepare`. Divergências são agregadas e retornadas juntas; nenhuma cópia
consumível é publicada na negativa.

No caminho válido, as três fontes autenticadas
(`generation-retirement.py`, `converta-release.py` e
`deploy-artifact-roots.json`) são reabertas sem seguir symlink, copiadas em
`0600` para uma raiz parcial `0700`, reobservadas por hash e publicadas junto
da fotografia operacional com `copied=true` por um único rename da raiz. A
publicação exige destino final ausente, pai físico privado, `fsync` de arquivos
e diretórios e execução Python com bytecode desabilitado. Destino existente nunca
é sobrescrito ou tratado como sucesso idempotente implícito.

A CI reproduz modo `0664`, cópia/hash divergente, symlink, lock ocupado,
assertion/check ausente, identidade operacional divergente e destino parcial,
comprovando negativa agregada e ausência da raiz consumível.

## Definição de pronto

A dívida só pode ser encerrada quando:

1. a admissão integral passa em CI e em fixture que reproduz as duas negativas;
2. uma execução válida atravessa materialização, `prepare` e preflight sem
   correções intermediárias;
3. falhas conhecidas são detectadas antes da primeira escrita consumível;
4. nenhuma prova, build, upload, restart, save ou envio já concluído é repetido;
5. custos de disco, inodes, Actions e tempo humano são registrados;
6. produção viva e isolamento multitenant têm regressões negativas;
7. o runbook contém uma sequência única, sem etapas implícitas;
8. o estado canônico marca explicitamente o que não deve ser repetido.

## Ordem de execução

1. concluir a auditoria e a implementação versionada dos itens ainda pendentes
   em P00-A/P00-B, reutilizando sem reimplementar o protocolo do lock do #275;
2. aprovar CI e revisão;
3. preparar a retomada da `754281d3` reutilizando todos os artefatos existentes;
4. obter autorização específica;
5. executar uma única vez e parar antes da ativação;
6. após aceite e fechamento, retirar somente resíduos previamente selados;
7. registrar custos e encerrar esta dívida.

Até a definição de pronto, nenhuma nova geração não emergencial deve usar o fluxo
incompleto. Uma urgência P00 não dispensa a admissão integral; apenas permite a
exceção de capacidade já autenticada, sem relaxar os demais gates.

- O reuso idempotente byte-exato do destino é permitido somente após reabrir e autenticar o inventário completo; qualquer arquivo extra, modo divergente ou byte divergente resulta em `DENY`, sem sobrescrita.
