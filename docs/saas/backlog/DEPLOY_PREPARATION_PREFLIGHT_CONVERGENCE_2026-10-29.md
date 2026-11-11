# Plano P00 — convergência da preparação de deploy

**Status:** P00 / PARCIALMENTE IMPLEMENTADO / PREVENÇÃO E2E AINDA ABERTA  
**Data de abertura:** 29/10/2026  
**Atualização de 30/10/2026:** convergência ainda aberta; nova lacuna confirmada entre admissão e schema de observações do consumidor. Entregas #275/#277/#278/#285/#287/#288 são preservadas; não comprovam fechamento integral da dívida.

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


## Extensão P00-C — instalação inerte canônica

A negativa `RELEASE_DENY:release_directory_identity` da geração
`immutable-aa9527cc-vps-20261029T222733Z` comprovou que a admissão também
precisa qualificar a rota de instalação antes do build. Extração manual em uma
raiz `.installing` com `--strip-components` não é uma rota canônica.

`converta-release.py install` passa a ser a única rota normal: extrai sob o nome
de release preservado pelo pacote, autentica owner/group e modo `0755`, verifica
a árvore, promove por rename no mesmo filesystem e sincroniza o diretório. Uma
extração já preservada somente pode ser recuperada por manifesto privado `0600`
vinculado ao target, release, pacote, caminho final, device/inode, owner/group e
modo `0700`; após verificar o conteúdo, o instalador materializa o modo do pacote,
preserva o inode e promove atomicamente. Não há rebuild nem extração repetida.

A asserção fechada `installation-route-qualified` é obrigatória no gate agregado.
Assim, ausência da rota, extração ad hoc ou identidade de raiz incompatível negam
antes da criação de worktree/output.


## Revisão de 30/10 — causas e ações verificáveis

Fonte operacional: relato do owner/Codex local, sem inspeção independente da VPS
pelo editor. Revisão do código na base `9b2169d4e74c0d1c7ae5fb363f31ea753112b326`.

| Ocorrência | Causa no procedimento | Resultado e prevenção |
| --- | --- | --- |
| /proc inacessível a deploy | privilégio de leitura insuficiente e diagnóstico incompleto | #285: observador restrito; ausência/erro/identidade continuam fail-closed |
| Symlink válido negado | comparador diferente do schema já aceito pelo produtor | #287: paridade e regressão com inventário real do produtor |
| Todos os candidatos mudaram entre fases | contadores de processos comparados como identidade do artefato | #288: projeção estável, recaptura fresca e testes audit → prepare → execute |
| Meta adicional impediu lote seguro | objetivo de recuperação confundido com orçamento real | decisão explícita de alvo; orçamento e reserva preservados |
| Retenção 059ea negada por PM2 | admissão materializou snapshot sem fingerprint exigido pelo consumidor | P00-D abaixo permanece aberto; não repetir build/instalação |

### P00-D — contrato real entre materializador e consumidor (ABERTO)

`deploy-preparation-admission.py::validate_request()` verifica a identidade geral
do template; não valida integralmente `observations`. Sua fixture positiva atual
nem contém esse bloco. Já `generation-retirement.py::validate_operational()`
exige `observations.pm2={path,sha256,fingerprintSha256}`. A admissão pode passar
e o consumidor negar um documento produzido por ela. Isso é uma lacuna de
integração, não uma necessidade de ampliar a exceção de capacidade.

Responsabilidade de implementação: Codex executor; revisão: mantenedor do control
plane; decisão operacional: owner, dentro do escopo já concedido. Prazo de aceite:
antes da próxima geração normal, reutilizando a release inerte 059ea nesta recuperação.

Entrega mínima necessária:

1. Reutilizar o contrato/validador do consumidor autenticado, separando sua checagem
   pura de schema das observações frescas e das verificações que dependem de arquivos
   já materializados. Evitar uma segunda definição manual divergente do schema.
2. Materializador produz snapshot completo e valida seu resultado antes de publicar
   o destino consumível. Falta de qualquer campo obrigatório deve negar na admissão,
   agregando todos os defeitos previsíveis, sem adivinhar hashes ou fingerprints.
3. Fixture de integração gera os arquivos pelo materializador real e chama o
   consumidor real com raízes/contrato válidos em ambiente isolado. Testar falta,
   formato inválido e drift do fingerprint, além de modos, hashes, copied e raízes.
4. Provar materialização → retenção prepare → preflight com APIs/PM2 simulados e
   sem seleção, rede produtiva, envio ou exclusão fora dos temporários. Complementar
   com ensaio no ambiente compatível quando a prova depender de permissões reais.
5. Manter diagnóstico privado completo no sucesso e na negativa, com campo exato,
   estado dos efeitos e checkpoint reutilizável. CI deve executar essas transições.

O item só termina com código, regressão de fronteira, CI, runbook e aplicação
operacional coerentes. Esta atualização documental não implementa nem encerra P00-D.

### Organização e medição do trabalho

- Princípios: autoridade em WORKING_PRINCIPLES; comandos: somente DEPLOY_RUNBOOK.
- Estado atual: CURRENT_STATE; incidente/ação ainda aberta: este plano; recibos:
  lifecycle e evidência privada. Histórico não concorre como instrução atual.
- Cada retomada registra fase inicial/final, tempo ativo/espera, predicado, versão
  do controle, provas reutilizadas e bytes/inodes criados/retirados.
- Medir tentativas produtivas negadas por defeitos já conhecidos (meta zero), builds
  por release (um), gerações com fechamento/recibo e volume retido por classe.
- Após merge de um PR, revisar branch/worktree e PRs superados contra commits únicos,
  alterações locais, dependências e retenção. Fechar/excluir só o que estiver
  qualificado; não usar idade, prune ou force como classificação.
- Mudança apenas documental pode otimizar a CI por impacto; os contratos de
  documentação e links continuam obrigatórios. Isso é evolução pendente, não
  autorização para ignorar checks atuais.

### Referências profissionais e aplicação ao Converta

- [DORA — Deployment automation](https://dora.dev/capabilities/deployment-automation/):
  processo versionado, pacote separado da configuração e mesmo mecanismo ensaiado
  antes de produção. Aplicação: testar o materializador junto com seus consumidores,
  reutilizar o pacote e reduzir intervenção manual entre fases comprovadas.
- [Google SRE — Postmortem culture](https://sre.google/workbook/postmortem-culture/):
  converter causas em ações acompanháveis. Aplicação: cada falha acima tem controle,
  responsável por papel e critério de aceite; contagem de relatórios não é melhoria.
- [SLSA 1.2 — Verifying artifacts](https://slsa.dev/spec/v1.2/verifying-artifacts):
  verificar proveniência e identidade esperada do artefato. Aplicação: manter o vínculo
  target/pacote/builder/hashes; não declarar conformidade SLSA, assinaturas ou níveis
  que o Converta ainda não implementou.

Retenção automática por dependência e orçamento e armazenamento externo de artefatos
com política de ciclo de vida continuam como evoluções a avaliar.

## Build externo e qualificação entre hosts

O build externo é uma alternativa mediante decisão específica. É útil quando
a capacidade ou o custo de preparação na VPS torna preferível produzir o pacote
em outro host. A rota normal de build na VPS continua regida pelo
[modelo operacional](../DEPLOYMENT_OPERATING_MODEL.md). A implantação em produção
segue o [runbook](../DEPLOY_RUNBOOK.md).

| Precedente | O que deu certo | Limite da prova |
| --- | --- | --- |
| [Frontend 3227b2d7, 09–11/10](../../reviews/automation-freeform-window-release-af26/frontend-3227b2d7-prepared-20261009/README.md) | Build Node 20.20.0 reutilizado, tar com 23.795 arquivos e 31 symlinks, 16 cenários de navegador na extração. [Execução](../../reviews/automation-freeform-window-release-af26/frontend3227-observation-diagnostic-20261011/EXECUTION_2026-10-11.md) com aceite de UI e 46,122 s entre solicitação de parada e prontidão técnica. | Fluxo histórico frontend-only com política própria. |
| [API Result Truth 2ed9dccc, 11/10](../../reviews/automation-freeform-window-release-af26/result-truth-api-prepared-20261011/README.md) | Base compilada reaproveitada, overlay conferido em staging e [implantação técnica concluída](../../reviews/automation-freeform-window-release-af26/result-truth-api-prepared-20261011/DEPLOYMENT_2026-10-11.md). O intervalo de contenção foi 37,824 s. | Overlay e controles históricos. Contenção é uma medição distinta da indisponibilidade percebida. |
| Piloto a838bd33, 10/11 | Pacote imutável v2 construído no builder, verificado e instalado inertemente na VPS. 34.381 entradas, verificação em aproximadamente 74,6 s e instalação em 106,3 s. | A preparação ocorreu sem troca de runtime. O preflight atual segue bloqueado e a duração do futuro corte ainda precisa ser medida. |

### Evidência do piloto a838bd33

- Release `immutable-a838bd33-external-20261110T130618Z`, target
  `a838bd33ea00ea49be52d61e025a36320a4154c1`, árvore
  `438b737c96c8e42da61cdc14e84694a4afe9dde4` e BUILD_ID `y6yGEaAGGr5oZe93llTWD`.
- SHA-256 do pacote `99b8ef1d6e056cc6846d6c85731bc41c53dfe251657ead62a12305d5b65ffacb`,
  manifesto `389a1c9ead3fabab8e28b035cc0741bb090835fdb930aec6cf90b9a2afd477c3` e
  índice `490f96946172d0248647bba16fd51248fca13098a85b156b28aecc4843980af2`.
- A VPS alocou 148.201.472 B para o pacote e 989.118.464 B para a release instalada.
  Verificação e instalação foram sequenciais. O staging de verificação foi
  retirado antes da instalação e o staging desta virou a release por rename.
  O pós-check registrou 8.289.509.376 B livres, 8.779.108 inodes livres e zero
  staging ou transferência parcial residual. São medições da janela, sujeitas a
  recaptura para novas escritas.
- O lifecycle v2 `38a32f22f63c6b6b03e210e3e92a448b9abbf178bff39ca1a4a8543271c9b47f`
  e o contrato `5e91a5d9c95b0845cc48a75e8a8f1473722c13901d1f058805f5fd70cb9faa8a`
  vinculam as raízes e o writer lock do builder externo. A primeira tentativa
  externa parou com `EPERM` no esbuild e mantém sua própria dívida no builder.
- A decisão `DENY_BEFORE_PREFLIGHT / EXTERNAL_RETENTION_HANDOFF_UNSUPPORTED` foi
  registrada antes de abrir transação. O consumidor local exigiria uma raiz
  canônica da VPS para `RELEASE_RUNTIME`, com a negativa
  `artifact_outside_canonical_root:RELEASE_RUNTIME`. `RELEASE VERIFIED` e
  `RELEASE INSTALLED` comprovam a integridade local da v2. A disposição dos
  derivados no builder é uma prova separada.

### Critérios para tornar a rota reutilizável

1. Decidir a rota na admissão, antes de alocar. Conferir se os consumidores de
   preflight e finalização aceitam o vínculo previsto antes do primeiro build
   ou upload. Quando o suporte estiver pendente, limitar um eventual piloto à
   preparação inerte e registrar esse limite antes da alocação. Conferir
   ferramenta, versão, target e árvore, bytes e inodes em cada host. Na VPS,
   dimensionar pacote, maior extração simultânea, margem para falha/evidência
   e reserva operacional. Recapturar os gates antes de escrever.
2. Reusar o pacote já verificado da mesma geração quando íntegro e elegível.
   Copiar para destino exclusivo, conferir SHA e executar `verify --package` e
   `install` sequencialmente. Registrar o pico e comprovar a disposição dos
   temporários antes de avançar. Para a v2 instalada, retomar da prova existente
   após conferir novamente sua identidade.
3. Qualificar um vínculo versionado entre o contrato, lifecycle e política de
   raízes originais do builder, a identidade do pacote transportado e a release
   física instalada. Preservar os documentos originais. Cada host autentica e
   dispõe somente de caminhos e locks próprios. Vincular receipt e journal da
   disposição no builder quando aplicáveis. Dívida ou prova ausente impede
   declarar `SANITIZED`. A VPS opera apenas com o escopo local autenticado.
4. Ensaiar admissão, preparo, preflight, ativação simulada, aceite e fechamento
   com duas raízes distintas. Cobrir negativa por troca de pacote ou hash,
   falta de prova, caminho do outro host e interrupção depois de possível efeito.
   Conferir que a rota local existente continua passando e que a retomada usa
   journal e receipt existentes.
5. Com a rota qualificada e `PREFLIGHT PASS`, reservar a troca API-only deste
   piloto para janela explicitamente autorizada após as 17h de Fortaleza.
   Preservar frontend, worker, retorno autenticado e produção das 08h às 17h.
   Conferir prontidão local e pública e aceite GET-only antes da finalização.
   Registrar separadamente os tempos de preparação, de parada até prontidão,
   o pico de disco, o saldo e a disposição por host. Promover a rota a
   procedimento normal externo somente depois de comprovar esse fechamento.

### Conferência de evidências antes do preflight

`generation-retirement.py verify-external-handoff` valida a passagem em leitura.
Recebe `--handoff`, `--handoff-sha256`, `--root-policy` e
`--root-policy-sha256`. O handoff privado schema 1 vincula por caminho e SHA-256
as cópias do `builderPolicy`, `contract`, `lifecycle`, `intent`,
`authorization`, `receipt`, `journal` e do stdout integral de `install` em
`installation`. `packagePath` identifica o pacote local em custódia e
`canonicalVerifierSha256` fixa o verificador do control plane aprovado.
Os hashes esperados devem vir da custódia autenticada de cada host.

O perfil inicial exige uma única retirada concluída dos três derivados do builder,
com os três comandos registrados no journal. A prova é comparada com os caminhos
originais, sem consultar esses caminhos a partir da VPS. O verificador relê
o SHA do pacote por streaming e confere a instalação inerte já existente.
`EXTERNAL_HANDOFF_EVIDENCE_VERIFIED` encerra apenas essa conferência.

1. Com a prova real do builder em custódia, usar `materialize-external-retirement`
   com os mesmos argumentos do verificador. A projeção exclusiva no output
   canônico local contém lifecycle e contrato novos, com a release instalada e
   a referência à evidência original. Nenhum caminho remoto se torna alvo local.
2. Rodar o `prepare` canônico com fotografia fresca que vincule a release como
   candidata e instalada verificada. A intenção precisa ter zero comandos.
   A autorização local usa `AUTHORIZE_ONCE` com `approvedPaths=[]` e o SHA
   dessa intenção. A autorização de ativação pertence à janela de produção.
3. O driver reabre a intenção, a autorização e a prova externa no preflight,
   antes de trocar a API e antes do primeiro save. O fechamento relê a prova
   sob os locks canônicos e exige grafo ativo, marker e dump correspondentes.
   O receipt local registra zero comandos e o frontend preservado mantém a
   sua release no grafo ativo, inclusive quando compartilha o retorno da API.

O ensaio usa prova sintética de retirada no builder, build e instalação reais
em duas raízes descartáveis e execução real da retenção local sem comandos. A
troca API-only e a checagem antes do save são exercitadas com PM2 simulado.
O piloto depende do receipt e do journal reais do builder. A tentativa de
preparação v1 parou antes da intenção porque a importação Python criou
`scripts/__pycache__/preparation_artifact_lifecycle.cpython-312.pyc` no worktree
selado. O consumidor executa agora os bytes da dependência já autenticados em
memória, sem reabertura pelo loader ou gravação de cache. A regressão executa
`--help` em processo isolado e confere a igualdade do inventário e dos bytes
dos controles copiados. Invocações operacionais Python devem usar `-B`.

O resíduo preexistente exige prova específica da única diferença e disposição
autorizada. Preservar contrato, inventário e negativa originais. A retirada do
bytecode pode alterar metadados de diretórios ancestrais, portanto deve-se
reautenticar o inventário completo e tratar eventuais diferenças por sucessor
vinculado ao original antes do novo prepare. A correção preventiva não autentica
a retirada anterior nem autoriza substituir hashes para aceitar drift. Preservar a
instalação inerte até a conclusão desse gate e do preflight na VPS.

### Preservação autorizada do builder sem baseline histórico

Quando não existe inventário anterior detalhado, a alternativa implementada é
preservar os três derivados e registrar a dívida; não apagar o resíduo nem
reconstruir o baseline. O contrato e o lifecycle originais permanecem intactos.
A rota destrutiva abaixo continua exigindo a prova histórica completa.

No builder, criar uma custódia exclusiva e um request privado schema 1 com
`contract`, `lifecycle` e `rootPolicy` como pares `path`/`sha256`, o
`deploymentLock` existente, `responsible`, `expiresAtUtc` futuro em UTC e `reason`.
Usar os caminhos reais e hashes da geração v2; não substituir documentos originais.
O consumidor autentica as raízes e a identidade original do worktree, mede seu
estado atual e exige que os dois runtimes continuem idênticos ao contrato.
A medida `retainedBytes` soma conservadoramente os blocos físicos por raiz;
`historicalInventoryEquivalence=false` declara a ausência da equivalência histórica.

```sh
python3 -B scripts/generation-retirement.py prepare-builder-preservation \
  --request <request> --request-sha256 <sha> --intent-output <intenção>
python3 -B scripts/generation-retirement.py record-builder-preservation \
  --intent <intenção> --intent-sha256 <sha> \
  --authorization <autorização> --authorization-sha256 <sha> \
  --receipt-root <destino-exclusivo>
```

Entre os comandos, revisar a intenção de zero comandos e vincular uma autorização
schema 1 `AUTHORIZE_ONCE`, com `authorizationId`, `owner`, `intentSha256` e
`approvedPaths=[]`. O registro revalida a captura sob os dois locks existentes,
arquiva a review anterior quando presente e emite receipt e journal privados.
A nova review `PRESERVE_OVERRIDE` vincula responsável, bytes, prazo e receipt.
Os originais, o worktree com o bytecode e os dois runtimes não são retirados.
Divergência ou destino de receipt já existente encerra a execução; não há retry.

Copiar para custódia privada na VPS as provas originais e os novos intent,
autorização, receipt, journal e review, autenticando cada SHA. O handoff schema 2
mantém os campos do schema 1 e acrescenta o binding `review`. Ele exige a cadeia
`PRESERVATION_OBSERVED → PRESERVATION_AUTHORIZED → PRESERVATION_RECORDED`,
zero comandos destrutivos, responsável e prazo futuro. A verificação do pacote e
da instalação permanece integral e independente da preservação.

Prosseguir com `verify-external-handoff`, `materialize-external-retirement` e
`prepare` locais existentes. A intenção e a autorização locais também têm zero
comandos e `approvedPaths=[]`. O driver reabre a prova no preflight, antes da
ativação e antes do save; o fechamento usa a continuação canônica e seu lock herdado.
O resultado esperado é `DEPLOYED_RETENTION_INCOMPLETE`, `saveCount=1`, receipt
local com `externalRetentionDebt` e review `QUARANTINED`, nunca `SANITIZED`.
A dívida continua sujeita a disposição própria; o prazo não autoriza exclusão.

A regressão integrada exercita produtor, pacote, instalação, provas, projeção,
preflight, ativação API-only, aceite, continuação de finalização e retenção reais
em raízes descartáveis, com PM2 e processos simulados. Verifica o exit code do
executor real, um único save, liberação terminal do lock e frontend/worker
preservados. O marker novo `DEPLOYED` usa `0600`, conforme o verificador.
Isso qualifica o código; somente evidências produtivas comprovam a entrega na VPS.

### Disposição do bytecode e contrato sucessor

O consumidor existente oferece `prepare-worktree-residue` e
`execute-worktree-residue`. O perfil inicial abrange gerações externas com nome
`immutable-<prefixo-do-target>-external-<timestamp-UTC>` e é limitado a
`scripts/__pycache__/preparation_artifact_lifecycle.cpython-312.pyc` e ao
diretório vazio que o contém. Reutiliza política de raízes, locks, observação
operacional fresca, autorização, journal e autenticação de artefatos do
`generation-retirement.py`.

O request privado schema 1 vincula `contract`, `lifecycle`, `baseline`,
`denial`, `operationalState` e `rootPolicy` por caminho absoluto e SHA-256.
`deploymentLock` identifica o lock existente e `residueSha256` fixa o bytecode
relatado. O stderr/diagnóstico original precisa conter o predicado exato de drift.
Os bindings completos vêm da custódia operacional.

O `baseline` é o inventário detalhado anterior, schema 1, com `root` e
`entries`. Cada entrada contém `path`, `type`, `mode`, `size`, `mtimeNs`,
`link`, `device`, `inode`, `allocatedBytes`, `uid`, `gid`, `nlink` e
`sha256`. Os registros são ordenados como no produtor. Os hashes de conteúdo
são SHA-256 para arquivos regulares e null para outros tipos. A reconstrução de
blocos, inodes, tamanho e hash estrutural precisa coincidir com o artefato original.
Esse inventário não pode ser fabricado a partir do worktree já alterado. Ausência
de prova anterior detalhada encerra a preparação antes da intenção.

No piloto a838bd33, o operador relatou em 10/11 a busca somente leitura nas
custódias v1/v2, evidências, outputs e JSONs associados em /tmp, sem localizar o
baseline anterior. O produtor desta geração registrou métricas e hash estrutural
agregados. Seu índice detalhado cobre os runtimes do pacote. O novo perfil exige
uma prova que essa produção não materializou. A negativa permanece
`PRIOR_DETAILED_WORKTREE_INVENTORY_NOT_FOUND`.

Uma nova busca nesse mesmo escopo depende de indicação concreta de outra custódia
ou backup. Este perfil só pode retomar a geração quando houver uma prova anterior
autenticável. Uma futura rota de reconciliação ou preservação com evidências
atuais exige contrato e autorização próprios. O planejamento do próximo produtor
deve incluir a emissão e custódia do baseline antes de qualquer controle importar
módulos do worktree.

A fixture de testes localiza o cache pelo `cache_from_source()` do Python que a
executa e posiciona o bytecode sintético no caminho produtivo congelado. Assim,
Python 3.14 pode exercitar o ensaio sem ampliar o perfil operacional 3.12.

`prepare-worktree-residue --request <request> --request-sha256 <sha> --intent-output <intenção>`
enumera o worktree inteiro sob os dois locks, compara os conteúdos e metadados
com o baseline, valida o bytecode contra a fonte autenticada e sela somente
`/usr/bin/rm -- <worktree>/scripts/__pycache__/preparation_artifact_lifecycle.cpython-312.pyc`
e `/usr/bin/rmdir -- <worktree>/scripts/__pycache__`. Além dessas duas entradas,
somente os metadados do diretório `scripts` podem diferir. Conteúdo extra,
modificação em outro caminho, referência operacional e binding divergente negam.

A autorização usa o schema canônico com `AUTHORIZE_ONCE`, SHA da intenção e
`approvedPaths` contendo exatamente arquivo e diretório, nessa ordem. Intenção
e autorização usam a serialização canônica JSON do consumidor.
`execute-worktree-residue --intent <intenção> --intent-sha256 <sha> --authorization <autorização> --authorization-sha256 <sha> --receipt-root <custódia-nova> --successor-root <outputs>/<release>-bytecode-successor`
recaptura as provas sob locks antes do primeiro efeito e registra cada comando
por `ATTEMPT → RESULT → VERIFIED`.

Após a retirada, o consumidor enumera novamente o worktree completo e publica o
contrato sucessor e uma cópia byte-exata do lifecycle na nova raiz. O contrato
original permanece intacto. Somente as métricas do worktree mudam. O sucessor
carrega a prova portátil `worktreeResidueReconciliation`, vinculando originais,
inventário, negativa, intenção, autorização, journal e receipt. O `prepare`
normal revalida essa prova e exige exatamente worktree, API runtime e frontend
runtime. O executor reabre os arquivos do sucessor pelos bindings selados.

Falha após efeito fecha `QUARANTINED`, preserva o journal e impede repetição.
Uma custódia de execução existente exige reconciliação própria. O receipt desta
disposição tem dois comandos e é distinto do receipt posterior da retirada 3/3.
A implementação e os testes isolados não comprovam a disponibilidade do baseline
original no builder nem substituem sua autorização de retirada.

## Fechamento da janela fa63994a e dívida remanescente

A janela terminou em `DEPLOYED_SANITIZED`, mas não prova que o procedimento normal
está livre de intervenção. As negativas e retomadas desta execução devem reduzir o
próximo fluxo, não virar precedentes manuais.

| Fronteira | Defeito observado | Aceite preventivo antes da próxima geração normal |
| --- | --- | --- |
| Capacidade | meta adicional bloqueou lote seguro por 4.067.328 bytes | orçamento obrigatório e meta adicional são campos e decisões distintas |
| Audit → prepare | `processScan` volátil entrou na identidade integral | comparação usa projeção estável; observação fresca permanece fail-closed |
| Índice → runtime | symlink válido foi classificado como `other` | produtor e consumidor usam a mesma semântica, com regressão de target/mode/escape |
| Snapshot → retention | faltou `pm2.fingerprintSha256` | materializador chama o validador real do consumidor antes de publicar |
| Rollback → retirement | executor exigiu lock fisicamente ausente/existente em fases incompatíveis | teste integrado cobre criação, aquisição, fechamento e remoção terminal |
| Package → publish | transporte SSH caiu após compressão | observar lifecycle/processo; retomar pacote existente; rebuild é último recurso |
| Handoff → outbound | `ok=false` descartado sem causa nominal | evento sanitizado obrigatório e teste aceite → envio real |
| Módulos → fluxo | CI 4/4 não cobriu contratos entre ferramentas | fixture atravessa admissão → materialização → prepare → preflight → fechamento |

### Regra de não patinação

Após uma negativa, o executor registra apenas quatro informações: predicado,
efeitos já ocorridos, provas ainda reutilizáveis e menor ação corretiva. A próxima
execução começa no último checkpoint válido. Não se repete leitura cara, build,
compressão, instalação, ativação, save ou retirada apenas para descobrir qual campo
mudou.

A autorização acompanha o escopo e os efeitos já aprovados; não deve ser pedida
novamente por cada etapa interna. Nova autorização é necessária somente para ampliar
escopo, privilégio ou efeito produtivo.

### Entregas bloqueadoras

Antes de outra geração normal:

1. implementar e testar a integração do schema P00-D com o consumidor real;
2. corrigir o ciclo autônomo do lock criado por `generation-retirement`, garantindo
   remoção terminal sob o mesmo `flock`;
3. decidir o PR #291 como melhoria de retomada, sem reabrir a release concluída;
4. executar a fixture ponta a ponta sem correção intermediária;
5. manter o [plano P00 de sanitização](PROJECT_SANITATION_AND_RETENTION_P00_2026-10-30.md)
   acima do backlog de novos builds enquanto o orçamento de disco não estiver
   satisfeito.

A documentação deste PR registra o contrato; seu fechamento operacional depende de
código, regressões, CI e uma execução normal sem adaptação. Portanto, não declarar
esta dívida concluída apenas porque a Tendência foi entregue.


## Consolidação de 01/11/2026 — não reabrir entregas qualificadas

A recuperação incremental 3/3 terminou em COMPLETED_RECONCILED. O sucesso
qualifica aquele percurso de recuperação, não encerra P00-D nem comprova que
todo deploy normal dispensa intervenção. A memória operacional do incidente e a
sequência exercida estão na [política de capacidade](../CAPACITY_RECOVERY_POLICY.md#continuidade-qualificada-em-01112026--leitura-obrigatória-antes-de-nova-frente).

| Entrega | Estado a preservar |
| --- | --- |
| #288, automation, hybrid-b9 e fa63994a | Terminais; preservar provas e não reexecutar |
| #300 a #302 | Cardinalidade, contenção e observabilidade integradas; ensaios sintéticos não equivalem automaticamente ao percurso produtivo |
| #303 | Guard do membro raiz integrado; defeito reproduzido, atribuição ao OOM histórico não comprovada |
| #304 e #305 | Prepare e execute contidos; efeitos/journals pertencem ao executor |
| #306 | Binding selado preservado entre roots; regressão completa e consumo sucessor comprovado |
| #307 | Fechamento 3/3 publicado; receipt 6662af79…, ganho medido e proibição de replay |

Antes de encaminhar nova ação, comparar o caminho que funcionou com a diferença
atual: versão/árvore/CI, origem e destino físico dos controles, bindings, schema,
ambiente, volume e recursos. Um hash de código igual não garante semântica igual
quando a localização física integra o contrato. Ensaio de módulos isolados não
substitui a transição completa antes da VPS.

P00-D (schema/fingerprint materializador → consumidor) e lifecycle de preparações
permanecem abertos até prova própria. Revisar itens antigos contra código integrado
antes de classificá-los como pendência: não reimplementar protocolos resolvidos.
Não criar um novo checklist ou executor concorrente para esta consolidação.
