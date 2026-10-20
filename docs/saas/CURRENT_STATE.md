# Estado canônico do Converta

Este é o ponto de entrada vigente. A produção continua saudável na release anterior;
a correção da listagem de contatos continua pronta, mas ainda não implantada.

## Produção viva

- API: entrypoint SHA-256 `304ef14eb3db321a4380af768534750ac0a6823438bdae6fb3cb265b5d11bff1`.
- Frontend: BUILD_ID `2nrVvTyK7pcyD_oMa_fOv`, retorno seguro reiniciável.
- Worker: preservado.
- Dump PM2 seguro: `a99667587ccee0ee884ed31aa304c714e276e86f6db86ba418238171508a2cf0`.
- Dump anterior: `20bb96ce1b79c8c358960ba18edee676b147a8343955a88784b48349f128cc4e`.

PIDs anteriores são observações históricas e devem ser revalidados antes de qualquer
mutação. O registro operacional continua em
[`FRONTEND_SAFE_RETURN_2026-10-19_DEPLOYED.json`](releases/FRONTEND_SAFE_RETURN_2026-10-19_DEPLOYED.json).

## Correção da listagem de contatos

- fonte funcional: `f5028de1e530666623dcc95519e744350671cb02`;
- base operacional: `b8cc113dc3e27a6818a1074f51c38eaa0e569448`;
- componentes: API + frontend;
- worker, banco, schema, dependências e credenciais: sem alteração;
- estado: `STAGED_INERT / NOT DEPLOYED`.

O manifesto vigente é
[`CRM_CONTACTS_LIST_RECOVERY_2026-10-20_NORMAL_RELEASE.json`](releases/CRM_CONTACTS_LIST_RECOVERY_2026-10-20_NORMAL_RELEASE.json).

## Método de implantação

O executor canônico da faixa normal é `scripts/deploy-normal-release.sh`, com três
atos claros: `plan`, `prepare` inerte e `activate` mediante autorização do SHA exato.
Ele constrói fora do runtime, troca somente API/frontend, valida health, preserva o
worker e restaura automaticamente os artefatos anteriores antes de qualquer
`pm2 save` se houver falha.

`Deploy V2`, bindings, nonces, journals, markers e closures single-use foram
reclassificados como históricos da tentativa de 19–20/10. Não são dependências da
rota normal. O fluxo artifact-bound permanece disponível somente como `BREAK_GLASS`.

## Próximos atos

1. Rodar `plan` da base operacional ao commit de entrega aprovado e exigir impacto
   somente em API + frontend.
2. Rodar `prepare` e registrar a raiz inerte e o SHA completo, sem tocar PM2.
3. Autorizar esse SHA e executar `activate`; registrar health, worker preservado,
   `pm2 save` único e o resultado funcional GET-only.

OBS-1 continua separado: `PREPARED / SCHEDULED WINDOW REQUIRED / NO CHANGE`.
Nenhum segredo é versionado.
