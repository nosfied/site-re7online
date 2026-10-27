# Estado canônico do Converta

**DEPLOYED / GENERAL CAMPAIGN OPERATIONS OPEN / IMAGE AND VIDEO ACCEPTANCE PASS / PRODUCTION HEALTHY**

Esta é a entrada vigente de continuidade. A topologia operacional está no
[modelo de implantação](DEPLOYMENT_OPERATING_MODEL.md), e a implantação ativa está
no [registro estruturado](releases/CAMPAIGN_MEDIA_LAYOUT_FRONTEND_2026-10-26_DEPLOYED.json).
Registros anteriores continuam no [índice documental](DOCUMENTATION_INDEX.md) como
histórico e retorno; eles não substituem este estado.

## Implantação frontend vigente relatada em 26/10/2026

Fonte: relatório do Codex local encaminhado pelo owner, com hashes dos recibos
privados. O editor documental não realizou nova inspeção da VPS. O horário exato
de finalização não foi fornecido; não é inventado neste registro.

A topologia atual é deliberadamente mista por componente: API preservada na release
`a959`, frontend promovido isoladamente para `f160` e worker preservado. Não
descrever `f160` como deploy da API.

- API: `immutable-a959129e-vps-20261026T023100Z`, PID 441355,
  start ticks 16603839, restart count 6, entry SHA-256
  `304ef14eb3db321a4380af768534750ac0a6823438bdae6fb3cb265b5d11bff1`.
- Frontend: `immutable-f1602787-vps-20261026T174702Z`, target
  `f16027874e91c86e5f818d0888e6d735b07a6eda`, PID 526037,
  start ticks 19459289, restart count 8, BUILD_ID
  `HYTuoIlZopPMaTrcg6uiv`, `fork_mode`, uma instância.
- Worker: PID 2233, start ticks 17758, restart count 0; preservado.
- Dump final:
  `5aa289dd3b610382af34df64555ac9b9effb7793e07573b73e0057824e3b1095`;
  exatamente um `pm2 save`.
- Validação estrutural:
  `e6d9d30eccb518c1de59f3f7a2dacdcdd44ca10c073d8aca64e3c232f20984d5`.
- Marker:
  `6e7a790fbdb7fbef0d4da3e199822cb5ba125cbb18092f1ab3773bc36c350e9e`.
- Recibo:
  `d807e4b3aee456f3928b5495642e78f8de123b2ab134f3c09750e76474c4ebad`.
- Journal:
  `e10e558bac031bd02bc044d996c404e75dcced8e31d055df4d55a2c36ee3f602`.
- Health da API local/pública: HTTP 200, `ok=true`, `db=ok`;
  frontend local/público: HTTP 200.
- Guarda aberta, geração 41, zero tarefas, sem fault.
- Lock canônico liberado pelo protocolo autenticado; arquivo `deploy:deploy 0600`
  preservado.

O frontend `d436` é o retorno imediato autenticado. A promoção `f160` reiniciou
somente o frontend uma vez; API e worker não reiniciaram. O aceite técnico e visual
confirmou alinhamento dos campos, prévia de mídia no conteúdo principal e orientações
recolhíveis. Nenhum build adicional, chamada Meta, envio, exclusão ou alteração da
guarda ocorreu durante ativação/finalização.

PIDs e contagens são observações datadas, não prova de estado vivo futuro.

## Continuidade canônica de frontend-only

O target funcional `f160` reutilizou a CI do head `ed9ea43` somente após prova de
árvore Git idêntica e zero arquivos diferentes. O pacote foi construído uma vez;
depois, um commit separado de control plane materializou os quatro bindings finais
do executor release-bound. Essa ordem é obrigatória e está no
[runbook](DEPLOY_RUNBOOK.md).

O retorno imediato do frontend é
`immutable-d436239e-vps-20261026T131821Z`. O retorno e os registros `a959`
permanecem preservados. Uma atualização frontend-only futura repete a sequência
documentada com nova release, novos hashes, executor release-bound e transação
exclusiva; não reutiliza o executor de `f160` nem refaz o deploy atual.

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
Estado: **SEND_ACCEPTED_GUARD_CLOSED**. O aceite cobre esse envio de vídeo, não
IMAGE, agendamento, multilote ou uso amplo. Próximo ato: **homologação IMAGE, após reabertura geral executada pelo Codex local**, conforme [roteiro](CAMPAIGN_OPERATIONS_READINESS.md). Guarda aberta na geração 41 para uso normal; não repetir CAS de abertura, vídeo,
build/deploy/save. A abertura e sua evidência estão registradas abaixo.
Homologação IMAGE e demais cenários mantêm seu escopo próprio.

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
Próximo teste de mídia: IMAGE, com escopo e destinatário definidos antes do envio.

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
