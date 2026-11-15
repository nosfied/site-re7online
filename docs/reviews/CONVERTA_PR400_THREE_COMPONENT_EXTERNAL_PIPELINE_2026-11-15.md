# CONVERTA — PR #400 | Pipeline externo API + frontend + worker

**Estado:** `THREE_COMPONENT_EXTERNAL_PIPELINE_READY_FOR_REVIEW`  
**Target funcional:** `ed74c483b35c6cfebbdaa1a0a16e233101c46dd4`  
**Árvore do target:** `f0f037cf908cbca59265bd73c6efbe926ea2636e`

## Diagnóstico e autoridades reutilizadas

A matriz anterior classificava as mudanças de campanha como API-only. Isso era
insuficiente: `apps/whatsapp-web-worker` transpila/importa
`webSessionInbound.ts`, que alcança `channels/inboundConversationIdentity.ts` e a
correlação de campanha alterada pelo target. Portanto, API e worker poderiam
executar contratos diferentes após uma promoção parcial.

A correção reutiliza o produtor, índice, manifesto, instalador, driver
fixed-current, controle PM2, lifecycle descartável, retirement, locks, journals e
receipts já usados pela geração externa `fa10f4f5`. A conclusão autenticada dessa
geração está em
`docs/saas/releases/INBOX_FA10F4F5_2026-11-13_DEPLOYED_RETENTION_INCOMPLETE_BUILDER_SANITIZED.json`;
o worker de retorno preservado é `immutable-e2e7f17a-20261022T005110Z`.

## Mudança mínima

- `deploy-impact-matrix.sh` inclui as dependências compartilhadas transitivas do
  worker.
- `converta-release.py` mantém o payload API+frontend e acrescenta apenas o perfil
  fechado `api,frontend,worker`, com `worker-runtime` no mesmo manifesto, índice,
  pacote, verificação e instalação inerte.
- `converta-deploy.py` mantém os perfis anteriores e acrescenta o conjunto ordenado
  3/3. O manifesto privado schema 2 vincula as definições PM2 candidata e rollback
  do worker; schema 1 continua byte-semanticamente vigente para os perfis antigos.
- `pm2-definition-control.py` autentica um único worker estável por PID/start ticks,
  symlink, CWD físico, interpretador e hash do entrypoint. O allowlist cobre somente
  variáveis efetivamente consumidas; `PWD` não é transportado.
- `generation-retirement.py` aceita somente os conjuntos integrais
  `api-runtime,frontend-runtime` e
  `api-runtime,frontend-runtime,worker-runtime` no handoff externo.

Nenhuma persistência de tenant integra o pacote. `.data`, sessões, credenciais,
mídias, banco, filas e volumes continuam externos e protegidos.

## PM2, ativação e rollback

A ordem comprovada pelo teste integrado é API → frontend → worker. API e frontend
passam pelos gates existentes. Na fronteira do worker, o driver remove o registro
PM2 anterior e só então inicia a definição candidata autenticada, sem
`--update-env`; em seguida exige cardinalidade um e três amostras estáveis. Assim,
worker antigo e novo não capturam jobs simultaneamente.

Se qualquer fronteira negar, somente componentes já tentados são revertidos, em
ordem inversa. A falha do worker restaura primeiro sua definição de rollback e
depois frontend e API. As definições candidata e retorno precisam ser produzidas
pelo materializador canônico, ter origem privada autenticada e passar juntas por
`validate-pair`. A variável histórica `PWD` não é allowlisted; `cwd` e entrypoint
são os caminhos estáveis autenticados. O único `pm2 save` continua reservado à
finalização depois do aceite; esta revisão não o executou.

## Capacidade

Medições somente leitura em 15/11/2026:

| Host | Livre | Inodes livres |
|---|---:|---:|
| builder | 165.437.706.240 B | 27.528.665 |
| VPS | 31.692.140.544 B | 9.599.588 |

A geração `fa10f4f5` observou pico de 3.445.936.128 B/109.686 inodes. O runtime
worker vigente mede aproximadamente 392.118.272 B. Como esses números não são um
gate homologado 3/3, a admissão proposta usa envelope conservador:

- workspace/build: 2.684.354.560 B;
- payload dos três runtimes: 1.879.048.192 B;
- empacotamento temporário: 805.306.368 B;
- verificação independente: 1.879.048.192 B;
- evidência de falha: 536.870.912 B;
- reserva operacional: 4.294.967.296 B;
- contrato no builder: 12.079.595.520 B;
- gate antes da alocação, com margem adicional de falha: 12.616.466.432 B e
  1.000.000 inodes.

Na VPS, o gate proposto é 10.737.418.240 B e 1.000.000 inodes antes da
transferência, cobrindo pacote, readback, staging, release candidata, verificação,
evidências e retorno preservado. Os valores livres observados atendem aos gates,
mas devem ser recapturados na futura autorização de build/transferência.

## Regressões e critérios de aceite

Foram acrescentados ensaios do contrato real produtor-consumidor:

- build sintético único, manifesto/índice e instalação inerte 3/3;
- recusa de escopo/artefato divergente;
- ativação API → frontend → worker e ausência de sobreposição;
- falha no worker com rollback worker → frontend → API;
- identidade e estabilidade do worker;
- preservação dos perfis API-only e API+frontend;
- classificação transitiva correta do worker.

Uma futura janela ainda exige: `buildCount=1`, `uploadCount=1`, `saveCount<=1`,
health API/frontend, readiness worker, smokes GET-only, aceite funcional da Inbox e
das campanhas, dump PM2 autenticado e rollback independente dos três componentes.

## Sanitização

A geração nasce com raiz descartável, cache npm isolado, custódia externa e plano
de retirement. O pacote, manifesto, índice e evidências são exportados antes de
qualquer retirada. Após aceite/finalização, staging, worktree e raiz do builder são
retirados somente pelo lifecycle e receipts canônicos. Releases ativa e de retorno,
persistências e evidências protegidas ficam fora dos efeitos. O resultado-alvo é
`DEPLOYED_SANITIZED`; qualquer dívida real encerra explicitamente em
`DEPLOYED_RETENTION_INCOMPLETE`.

## Limites desta revisão

Não houve build produtivo, upload, instalação, ativação, restart, `pm2 save`,
alteração de sessão, banco ou exclusão. A próxima ação é revisar e integrar esta
extensão; somente depois disso pode existir autorização separada para materializar
uma geração externa 3/3.

## Continuidade PM2 sucessora após a instalação inerte

A execução real expôs uma lacuna que a homologação original não atravessava: os
testes do PR #401 entregavam bindings worker prontos ao consumidor. A cadeia real
parou antes do preflight porque `pm2-binding-materialize.py` aceitava somente
frontend e os requests worker pediam 16 nomes que não correspondiam ao ambiente
funcional comprovado.

Cronologia preventiva consolidada: impacto transitivo do worker → perfil 3/3;
pipeline antes limitado a API/frontend → produtor/instalador 3/3; falha entre
`pm2 delete` e `start` → rollback retomável; Node 22 herdado → toolchain 20.20.0
validada no produtor antes de `open`; materializador frontend-only → projeção worker;
requests 16 campos incorretos → allowlist fechada de 17 campos; fontes ausentes →
artefatos históricos candidato/retorno autenticados. Cada correção agora é coberta
pelo teste integrado fonte → projeção → materializador → `validate-pair` → preflight.

Os precedentes usados são PRs #199 (isolamento estrutural), #200 (allowlist por
papel), #207 (manifesto privado), #231 (materialização), #233 (dispensa somente
quando não há substituição) e #401 (pipeline/rollback 3/3). A release instalada e
os efeitos anteriores permanecem intactos; a continuação usa control plane sucessor
e manifesto privado schema 3, sem rebuild, reupload ou reinstalação.

## Resultado produtivo e fronteira de retomada

A primeira ativação 3/3 não concluiu: a identidade do worker após `start` foi
negada porque o comparador esperava campos de configuração de log que o `jlist`
real do PM2 6.0.14 não reproduz. O rollback canônico posterior restaurou API e
frontend `fa10f4f5` e worker `e2e7f17a`. O journal terminal `ROLLED_BACK` tem
SHA-256 `adb85d3d828c7a012ef7c00ef4695c31b3001d0d07ea9626d80cb2360072763f`,
`saveCount=0`; essa transação não pode ser reaberta.

O PR #405 passou a reutilizar
`pm2-definition-control.py::validate_runtime_log_paths()` na identificação do
worker e preservou estritos PID/start ticks, runtime, ambiente e cardinalidade.
Pacote, release instalada, manifesto, índice, bindings e retornos continuam
reutilizáveis em uma **nova** transação, sem rebuild/upload/install.

### Matriz de reutilização

| Evidência | Fonte | Decisão |
| --- | --- | --- |
| pacote/manifesto/índice 3/3 e installation receipt | geração `ed74c483` exportada e instalada | preservar e reabrir por hash |
| fontes, requests e bindings PM2 | sucessão autenticada do PR #403 | preservar; novos destinos somente se o contrato exigir |
| escopo do handoff | PR #404 | reutilizar consumidor corrigido |
| normalização de logs PM2 real | PRs #199 e #405 | reutilizar a única função canônica |
| journal terminal do incidente | receipt `ROLLED_BACK` | preservar; jamais reutilizar como transação |
| retornos `fa10f4f5`/`e2e7f17a` | seleção física restaurada | preservar e recapturar identidade volátil |

### Estado da requalificação isolada

A CI existente executa produtor → pacote → instalação e um drill com PM2 6.0.14
real em `verify-disposable-builder-lifecycle.py`; também prova definições
candidata/retorno no PM2 real por `verify-pm2-definition-isolated.py`. O teste do
driver cobre 3/3, falha entre delete/start, rollback inverso, interrupção/retomada,
destinos exclusivos, continuidade de journal/control plane e `jlist` realista,
mas usa `FakeHost`. Não há ainda um único ensaio que conecte o driver real ao PM2
real. Essa é uma limitação crítica e mantém
`EXTERNAL_PIPELINE_REQUALIFICATION_BLOCKED`; não se presume homologação somando
ensaios separados.

A menor correção é estender o verificador isolado existente — sem novo pipeline —
para fornecer ao driver suas interfaces reais e executar os mesmos cenários contra
um `PM2_HOME` temporário com PM2 6.0.14 pinado. O gate deve negar PID/start ticks,
runtime, ambiente ou logs divergentes e comprovar ausência de daemon/processos ao
terminar. Só então o owner poderá revisar uma nova transação com release
`immutable-ed74c483-external-20261115T162015Z`, target `ed74c483…`, control plane
corretivo autenticado, novos journal/receipt roots ausentes, retornos atuais e
rollback worker → frontend → API. Esta reconciliação não executou efeito produtivo.

Em 15/11, a repetição local das provas existentes usou PM2 6.0.14 pinado,
`PM2_HOME` temporário e o `umask 0022` exigido pelas identidades canônicas:
`verify-pm2-definition-isolated.py` terminou em
`PM2_SOURCE_PROVENANCE_AND_ROLLBACK_PASS` e
`verify-disposable-builder-lifecycle.py` em
`DISPOSABLE_BUILDER_PM2_LIFECYCLE_PASS`; os 82 testes do driver também passaram.
O host local executava Node v22.13.0, enquanto a CI fixa Node 20.20.0. Essa
diferença não invalida a prova do formato PM2, mas impede tratá-la como substituta
da CI e reforça que o ensaio integrado ausente deve rodar com a toolchain pinada.
