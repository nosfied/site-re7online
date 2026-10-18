# Estado canônico do Converta

Este é o ponto de entrada vigente para decisões e continuidade. Relatórios datados
são evidência histórica no alcance e horário que declaram. A identidade ativa está no
[registro sanitizado da implantação](releases/CRM_CSV_UX_PHONE_NORMALIZATION_2026-10-18_DEPLOYED.json).

## Release viva

`CRM CSV UX e normalização de telefone` foi promovida e verificada em
18/10/2026, às 10:26:09 em Fortaleza (13:26:09 UTC).

- API: `api-runtime/dist/index.js`, SHA-256
  `304ef14eb3db321a4380af768534750ac0a6823438bdae6fb3cb265b5d11bff1`.
- Frontend: BUILD_ID `Ebyc7UWY8nwjFyA5Zjyfj`.
- PM2: dump vigente SHA-256
  `f6276a42ee8644088a5917ad0366f64ceba2b8d5441b8b46e52de9998303f7b5`;
  retorno anterior preservado com SHA-256
  `521f941394c451891f661d06abf00cfd3cf90153dd5678b979293d2a12cd73e2`.
- Worker: preservado sem alteração.

Na observação final de `2026-10-18T13:26:09.249088+00:00`, os PIDs eram API
`1328029`, frontend `1329631` e worker `936540`. PIDs são observações datadas e
devem ser revalidados depois de qualquer reinício. As identidades duráveis são o
hash do entrypoint da API, o BUILD_ID do frontend e os hashes do dump e retorno.

## Resultado e limites

- A API passou três amostras consecutivas de identidade, estabilidade, posse do
  socket LISTEN/3001 e health local/público.
- O frontend passou três amostras, controle imutável, BUILD_ID, login, Inbox, CRM
  e assets.
- Isolamento negativo entre tenants: `LIVE VERIFIED`; GET de operação inexistente
  e prova cruzada reutilizada retornaram `HTTP 200 + UNKNOWN` sem progresso,
  resumo, total ou metadados cruzados.
- Recuperação positiva durável: `LIVE DEFERRED` até a primeira importação legítima.
- As ocorrências históricas de 993 linhas são `LEGACY_UNCORRELATED / NOT CLAIMED`.
- A janela executou zero POST CSV, importação, SQL ou migration.
- O smoke da Inbox gerou um único POST automático para
  `/agent-api/app/inbox/events`; ele é tráfego da Inbox e não POST CSV.
- A inspeção ampla de ambiente está registrada somente como
  `RECORDED_PRIVATELY / VALUES NOT VERSIONED / ROTATION ASSESSMENT PENDING`.

## Próximos atos

1. Fazer avaliação sanitizada das credenciais potencialmente expostas, mantendo
   nomes sensíveis e valores fora do Git.
2. Gerar nova prévia manual no tenant Demo, sem confirmar a importação.

Nenhum POST deve ser criado apenas para testar recuperação. O caminho positivo vivo
será observado por GET após a primeira importação legítima.

Os campos verificáveis estão em [`CURRENT_STATE.json`](CURRENT_STATE.json). A CI
valida este arquivo, o manifesto de origem e o registro ativo da implantação.

## Branches

`review/campaign-recovery-20260926` é a linha operacional. `main` continua a linha
do site público Vercel. Force-push, rebase destrutivo e merge cego permanecem
proibidos; o [plano de convergência](BRANCH_CONVERGENCE_PLAN_2026-10-18.md) é uma
atividade separada e não identifica produção por si só.
