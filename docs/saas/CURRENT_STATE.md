# Estado canônico do Converta

**DEPLOYED / PRODUCTION HEALTHY / VIDEO SUBMISSION ACCEPTED / META APPROVAL PENDING**

Esta é a entrada vigente de continuidade. A topologia operacional está definida
no [modelo de implantação](DEPLOYMENT_OPERATING_MODEL.md), e a evidência
sanitizada está no
[registro estruturado](releases/TEMPLATE_MEDIA_UPLOAD_DIAGNOSTICS_2026-10-24_DEPLOYED.json).
A configuração tenant-scoped posterior está no
[registro operacional](releases/CONVERTA_DEMO_META_APP_ID_2026-10-24_CONFIGURED.json).
A atualização isolada posterior da API está no
[registro de componente](releases/TEMPLATE_MEDIA_UPLOAD_SESSION_SIGNATURE_API_2026-10-24_DEPLOYED.json),
e a observação manual mais recente da homologação está no
[registro de submissão aceita](releases/CONVERTA_DEMO_VIDEO_TEMPLATE_HOMOLOGATION_ACCEPTED_2026-10-24.json).

## Produção viva — observação de 24/10/2026

- Último deploy conjunto de API/frontend: target
  `ec2a9fde99b6421a85256f14604bd469879f4f2a`, release
  `immutable-ec2a9fde-vps-20261024T162005Z`.
- API ativa após atualização isolada: target
  `ef7db11179a1be14160e0f7ceec9f01a8aaf0ece`, release
  `immutable-ef7db111-vps-20261024T174000Z`, PID observado `74684`, start ticks
  `2011482`.
- Frontend e worker foram preservados. O registro do deploy conjunto continua como
  baseline do frontend; o registro isolado da API identifica a seleção atual desse
  componente.
- Control plane: `5ea7fa45a3693a14bdbf1d9d0a464dd61423b4ad`.
- API: `/opt/re7online/current/api`. O entry SHA-256
  `304ef14eb3db321a4380af768534750ac0a6823438bdae6fb3cb265b5d11bff1`
  pertence ao último registro estruturado conjunto; esta reconciliação não atribui
  esse hash à seleção isolada posterior.
- Frontend: `/opt/re7online/current/frontend`, BUILD_ID
  `7yArOSyfllnPiQy_vAS9H`, Next direto em `fork_mode`, uma instância.
- Worker preservado no runtime `immutable-e2e7f17a-20261022T005110Z`, sem seleção
  ou restart.
- Dump PM2 final: `fd1513febc2c91d4ff0efbf303a44e44991b26265da2759b414b31121d769e88`,
  persistido por exatamente um `pm2 save` na atualização isolada da API.
- O dump `afd1c1c20483708ac2f51f0ffde09c2affb8d62e4a1426cb233288fda0753e59`
  permanece como baseline do último registro conjunto de API/frontend; não representa
  o dump final posterior à seleção isolada da API.
- Retorno anterior preservado pelo dump
  `fec9b3417d4ea1e34b13840f5e3fea2b70a499220c0af124f039a87d8ce312cc`
  e pelos symlinks e registros PM2 capturados.
- Marker `DEPLOYED`:
  `c7e629dea342b98c3b5d25cb651ab3997749ca45fbd98074a9d7eb7bcf375e58`.
- Journal final: `DEPLOYED`; lock canônico liberado.

PIDs são observações datadas: API `74684` (start ticks `2011482`), frontend
`56230` (`1533470`) e worker `2233` (`17758`). Release, hashes, BUILD_ID e dump
são as identidades duráveis; revalidar os PIDs antes de outra mutação.

## Build, ativação e limites

Após o upgrade de RAM, o owner autorizou um build único na VPS em worktree isolado,
fora do runtime ativo, com Node v20.20.0/npm 10.8.2. Os serviços produtivos não
foram parados para o build. O payload compilado foi congelado e verificado como
release imutável; nenhum build ocorreu durante a ativação.

A primeira embalagem omitiu um módulo válido porque o produtor confundiu o segmento
`uploads` interno de `node_modules/openai` com dados operacionais. A correção limita
essa denylist aos caminhos da aplicação, mantém uploads reais proibidos e possui
regressão. O payload compilado existente foi reutilizado, sem novo `npm`, Prisma ou
build. Pacote, manifesto e índice corrigidos foram autenticados; a preparação
incompleta e as duas tentativas encerradas pelo driver permanecem como histórico.

A ativação comprovada usou o fluxo simples dirigido sobre a topologia fixed-current:
troca atômica dos symlinks, restart dos registros PM2 existentes sem `--update-env`,
API antes do frontend, três amostras estáveis e smoke GET-only. O ambiente privado
completo já armazenado pelo PM2 foi preservado. API local/pública retornou HTTP 200,
`ok=true` e `db="ok"`; Login, Inbox, CRM, Modelos, Campanhas e asset retornaram
HTTP 200. O aceite técnico antecedeu o único `pm2 save` e o marker.

Não houve migration, SQL, mudança de tenant/RBAC, template, campanha, importação
ou envio durante o deploy. Em janela posterior e separada, o token já armazenado
no tenant Converta Demo foi inspecionado uma vez por `GET /debug_token`; a Meta
confirmou o vínculo atual token/aplicativo e as permissões necessárias. Isso não
recupera nem reconstrói o histórico original do onboarding.

O App ID confirmado foi gravado uma vez pela operação administrativa tenant-scoped,
com proveniência `embedded_signup` e confirmação explícita de escopo. O GET posterior
retornou `configured=true` e `source=tenant_app_id`. Token, WABA, número, demais
propriedades e todos os outros tenants permaneceram inalterados. Não houve fallback
global, upload, sincronização, submissão ou envio. A homologação funcional Meta e a
liberação comercial continuam **PENDENTES**.

Em 24/10/2026, a correção de diagnóstico de upload foi implantada no target
`ec2a9fde99b6421a85256f14604bd469879f4f2a`. Uma tentativa de homologação
explicitamente autorizada criou e aprovou internamente
`video_previdencia_teste_20261024`, preservando `video_previdencia` como histórico
`failed`, e submeteu à Meta exatamente uma vez. A Meta negou o envio dos bytes em
`binary_upload`: HTTP 400, código 100, subcódigo 33, `GraphMethodException`. A nova
solicitação foi persistida como `failed`; não houve retry, sincronização adicional,
campanha ou mensagem. O resultado sanitizado está no
[registro de homologação](releases/CONVERTA_DEMO_VIDEO_TEMPLATE_HOMOLOGATION_2026-10-24.json).
Submissão recusada não equivale a template criado ou aprovado pela Meta.

Em observação manual posterior e somente de leitura, a solicitação
`video_previdencia_teste_20261024_v2`, no tenant `demo-converta`, estava em
`submitted_to_meta` sob a API `ef7db11179a1be14160e0f7ceec9f01a8aaf0ece`.
O upload estava concluído, a mídia estava `ready` e o handle estava confirmado,
sem ser publicado. Havia exatamente uma solicitação, um evento
`template.request.submitted_to_meta`, um template e um identificador Meta, sem
duplicidade. A submissão foi aceita; o estado observado do template era `PENDING`,
portanto a aprovação pela Meta ainda não foi confirmada. Nenhum sync ou nova chamada
à Meta foi feito para esta reconciliação. As falhas anteriores permanecem preservadas
e sua causalidade histórica é `NOT_PROVEN`.

## Rota operacional

O modelo vigente é build once / promote the same artifact em worktree isolado e
com capacidade comprovada. Por decisão vigente do owner após o upgrade, o padrão
é build na VPS, com capacidade aferida e isolamento do runtime vivo. Builder externo
é alternativa mediante decisão específica. Essa decisão de build já está autorizada;
cada janela de ativação continua exigindo autorização própria.
Releases permanecem imutáveis em `/opt/re7online/releases`; seleção usa os caminhos
estáveis API→frontend, worker apenas quando impactado, readiness em três amostras,
smoke GET-only, aceite e um único `pm2 save`.

Build no checkout/runtime ativo, `deploy-normal-release.sh`, Deploy V2, PR #190,
Next em `cluster_mode` e executores temporários em `/tmp` são históricos/obsoletos.
As tentativas anteriores com `converta-deploy.py` são evidência desta janela e não
instruções para sua repetição.

A dívida `PREEXISTING_BATCH_ELIGIBILITY_N_PLUS_ONE` permanece no
[backlog independente](backlog/CAMPAIGN_SET_BASED_ELIGIBILITY_2026-10-21.md) e não
invalida esta implantação.
