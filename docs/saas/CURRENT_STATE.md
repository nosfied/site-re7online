# Estado canônico do Converta

Este é o ponto de entrada vigente para decisões e continuidade. Relatórios datados
são evidência histórica apenas no alcance e horário que declaram. A identidade da
release está no [registro sanitizado da implantação](releases/CRM_CSV_TERMINAL_REENTRY_2026-10-18_DEPLOYED.json)
e a alteração operacional posterior está no
[registro da rotação OBS-2](releases/OBS2_OAUTH_STATE_SECRET_ROTATION_2026-10-18_DEPLOYED.json).
A preparação sanitizada, ainda sem mudança produtiva, está no
[registro OBS-1](releases/OBS1_META_APP_SECRET_ROTATION_2026-10-19_PREPARED.json).

## Release viva

A correção isolada do frontend para reentrada terminal da importação CSV e preservação
dos filtros foi promovida e verificada em 18/10/2026, às 15:21:18 em Fortaleza
(18:21:18 UTC), sobre a composição `CRM CSV UX e normalização de telefone`.

- API preservada: `api-runtime/dist/index.js`, SHA-256
  `304ef14eb3db321a4380af768534750ac0a6823438bdae6fb3cb265b5d11bff1`.
- Frontend ativo: BUILD_ID `2nrVvTyK7pcyD_oMa_fOv`.
- PM2 após a rotação OBS-2: dump vigente SHA-256
  `20bb96ce1b79c8c358960ba18edee676b147a8343955a88784b48349f128cc4e`;
  retorno operacional pós-OBS-2 com o mesmo SHA-256, criado atomicamente em
  `dump.pm2.obs2-post-rotation-20261018T193258Z.rollback`, modo `0600`.
- API e worker permaneceram sem alteração.

Na observação final de `2026-10-18T19:34:37.825579+00:00`, os PIDs eram API
`1377194`, frontend `1362964` e worker `936540`. PIDs são observações datadas;
as identidades duráveis são o hash do entrypoint da API, o BUILD_ID do frontend
e os hashes do dump e retorno.

## Rotação OBS-2

O segredo HMAC local do estado OAuth foi rotacionado isoladamente e verificado.
A categoria anterior “observabilidade” descrevia o canal da exposição, não o tipo
da credencial. A API passou três amostras, propriedade direta do socket `3001`,
health local/público e início de um novo estado OAuth sem concluir autorização no
provedor. Frontend e worker permaneceram com suas identidades anteriores.

Estados OAuth emitidos antes da rotação foram invalidados; eventual login Meta em
andamento deve ser reiniciado. A contingência encerrou após o prazo e uma nova
conferência de estabilidade. A cópia explícita do valor anterior foi destruída e os
artefatos conhecidos que continham o ambiente anterior foram removidos por caminho
exato após registro privado. O rollback pré-rotação foi classificado como
`NON_EXECUTABLE_EXPOSED_SECRET` antes da remoção. OBS-1 permanece
`PENDING / UNTOUCHED` e não foi acessada nem alterada nesta janela.

## Preparação OBS-1 e proteção do expediente

OBS-1 é o segredo do aplicativo compartilhado do Instagram Business Login. O valor
teve exposição confirmada em saída operacional, sem evidência observada de exploração
externa. Deve ser tratado como potencialmente comprometido e rotacionado em prazo curto,
mas a rotação não será executada durante o uso regular dos clientes.

De segunda a sexta-feira, entre 08:00 e 17:00 em `America/Fortaleza`, ficam negados
reset no provedor, restart da API, seleção PM2 e `pm2 save` relacionados à OBS-1.
A janela exige autorização expressa, aviso operacional, identificação manual do
aplicativo correto e canal de captura sem eco. Frontend, worker, banco e contatos
ficam fora do delta.

O reset no provedor pode invalidar imediatamente o segredo anterior. Por isso, o
retorno não pode depender desse valor: eventual falha será corrigida para frente com
o novo segredo ou com outro reset no provedor. A indisponibilidade potencial alcança
todos os tenants que usam o aplicativo Meta compartilhado, sobretudo novas conexões
e reconexões OAuth durante o corte. A operação cotidiana com tokens já persistidos
deve ser preservada, mas precisa de verificação viva após a rotação.

O estado atual é `PREPARED / SCHEDULED WINDOW REQUIRED / NO CHANGE`. App ID esperado,
verificador e canal seguro estão prontos; login/2FA no navegador habitual e confirmação
manual do aplicativo ainda são necessários. Nenhum segredo foi acessado ou redefinido.

## Resultado e limites

- O frontend passou três amostras de identidade e estabilidade, controle imutável,
  nonce, journal, BUILD_ID, login, Inbox, CRM e treze assets públicos.
- No tenant Demo, a reentrada recuperou `COMPLETED`, removeu somente a referência
  local da sessão, não abriu o modal e carregou a página 1 pelo caminho canônico,
  preservando os filtros ativos.
- A lista exibiu 966 contatos no escopo, 965 encontrados e 50 na página. Esses
  números pertencem à lista e não são tratados como totais persistidos da operação.
- O painel de rede registrou 25 requisições e zero chamadas a `contacts/import`.
  A janela executou zero POST CSV, importação, SQL ou migration.
- A recuperação positiva durável está `LIVE VERIFIED`: o GET reconheceu `COMPLETED`,
  a referência exata do tenant/usuário Demo foi consumida, a página 1 voltou pelo
  caminho canônico com filtros preservados e saída/reentrada não reabriu o modal.
  A prova não foi repetida porque seu consumo é o resultado correto. Os totais
  persistidos da operação não constam da evidência preservada e não são inferidos.
- As ocorrências históricas de 993 linhas continuam `LEGACY_UNCORRELATED / NOT CLAIMED`.
- A rotação das credenciais avaliadas permanece uma janela separada.

## Próximos atos

1. Preparar a fase 1 inerte da convergência de branches, sem mover `main`, sem deploy e sem tocar em runtime.
2. Confirmar manualmente o aplicativo Meta correto no navegador habitual, parando antes de revelar ou redefinir o segredo.
3. Agendar e autorizar a rotação OBS-1 fora de segunda a sexta-feira, 08:00–17:00, com aviso operacional e retorno por recuperação progressiva.
4. Revalidar o retorno pós-OBS-2 somente antes de uma futura operação que dependa dele.

Os campos verificáveis estão em [`CURRENT_STATE.json`](CURRENT_STATE.json). A CI
valida este arquivo, o manifesto de origem e o registro ativo da implantação.

## Branches

`review/campaign-recovery-20260926` é a linha operacional. `main` continua a linha
do site público Vercel. Force-push, rebase destrutivo e merge cego permanecem
proibidos; o [plano de convergência](BRANCH_CONVERGENCE_PLAN_2026-10-18.md) é uma
atividade separada e não identifica produção por si só.
