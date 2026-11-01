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

Retenção automática por dependência e orçamento, armazenamento externo de artefatos
com política de ciclo de vida e builder externo são evoluções a avaliar após esta
entrega. Não se altera a arquitetura produtiva durante a retomada da Tendência.

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
