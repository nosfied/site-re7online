# Estado canônico do Converta

Este é o ponto de entrada vigente para decisões e continuidade. Relatórios datados
são evidência histórica apenas no alcance e horário que declaram. A identidade ativa
está no [registro sanitizado da implantação](releases/CRM_CSV_TERMINAL_REENTRY_2026-10-18_DEPLOYED.json).

## Release viva

A correção isolada do frontend para reentrada terminal da importação CSV e preservação
dos filtros foi promovida e verificada em 18/10/2026, às 15:21:18 em Fortaleza
(18:21:18 UTC), sobre a composição `CRM CSV UX e normalização de telefone`.

- API preservada: `api-runtime/dist/index.js`, SHA-256
  `304ef14eb3db321a4380af768534750ac0a6823438bdae6fb3cb265b5d11bff1`.
- Frontend ativo: BUILD_ID `2nrVvTyK7pcyD_oMa_fOv`.
- PM2: dump vigente SHA-256
  `33e3d65e78b4e4bd27349a06e28ff125551535085e0721281f3848dece5590d1`;
  retorno anterior preservado com SHA-256
  `f6276a42ee8644088a5917ad0366f64ceba2b8d5441b8b46e52de9998303f7b5`.
- API e worker permaneceram sem alteração.

Na observação final de `2026-10-18T18:21:18.971249+00:00`, os PIDs eram API
`1328029`, frontend `1362964` e worker `936540`. PIDs são observações datadas;
as identidades duráveis são o hash do entrypoint da API, o BUILD_ID do frontend
e os hashes do dump e retorno.

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

1. Tratar rotações somente em janela separadamente autorizada.
2. Não repetir a referência terminal consumida; futuras recuperações legítimas
   continuam exclusivamente por GET, sem repetir o POST.

Os campos verificáveis estão em [`CURRENT_STATE.json`](CURRENT_STATE.json). A CI
valida este arquivo, o manifesto de origem e o registro ativo da implantação.

## Branches

`review/campaign-recovery-20260926` é a linha operacional. `main` continua a linha
do site público Vercel. Force-push, rebase destrutivo e merge cego permanecem
proibidos; o [plano de convergência](BRANCH_CONVERGENCE_PLAN_2026-10-18.md) é uma
atividade separada e não identifica produção por si só.
