# Estado canônico do Converta

Este é o ponto de entrada vigente. A identidade funcional continua sendo a release
terminal-reentry; a alteração operacional mais recente é o retorno seguro e
permanentemente supervisionado do frontend.

## Produção viva

- API: entrypoint SHA-256 `304ef14eb3db321a4380af768534750ac0a6823438bdae6fb3cb265b5d11bff1`.
- Frontend: BUILD_ID `2nrVvTyK7pcyD_oMa_fOv`, retorno seguro reiniciável.
- Worker: preservado.
- Dump PM2 seguro: `a99667587ccee0ee884ed31aa304c714e276e86f6db86ba418238171508a2cf0`.
- Dump anterior preservado: `20bb96ce1b79c8c358960ba18edee676b147a8343955a88784b48349f128cc4e`.

Os últimos PIDs reportados após o rollback da FASE 2 foram API `1601629`, frontend
`1601491` e worker `936540`. Não existe timestamp comum preservado para essa leitura;
portanto eles são referência histórica, não identidade de execução. Revalidar antes
de qualquer mutação.

O registro operacional sanitizado é
[`FRONTEND_SAFE_RETURN_2026-10-19_DEPLOYED.json`](releases/FRONTEND_SAFE_RETURN_2026-10-19_DEPLOYED.json).

## CSV

A importação CSV, isolamento negativo e recuperação terminal permanecem
`DEPLOYED / LIVE VERIFIED`. O histórico de 993 linhas permanece
`LEGACY_UNCORRELATED / NOT CLAIMED`.

## Correção da listagem de contatos

A correção está construída, autenticada e staged inertemente, mas **não foi
implantada**. API e frontend candidatos foram devolvidos nas tentativas anteriores.

Ela foi reclassificada corretamente como `NORMAL_RELEASE`: não altera banco, schema,
worker, credenciais, root ou rede. O manifesto de dados está em
[`CRM_CONTACTS_LIST_RECOVERY_2026-10-19_DEPLOY_V2.json`](releases/CRM_CONTACTS_LIST_RECOVERY_2026-10-19_DEPLOY_V2.json).

## Método de implantação

O [modelo operacional](DEPLOYMENT_OPERATING_MODEL.md) passa a ter duas faixas:

- `NORMAL_RELEASE`, padrão simples, estável e orientado por manifesto;
- `BREAK_GLASS`, somente para migration, credencial, root/rede, worker/drain ou incidente.

O runbook por artefato permanece como mecanismo excepcional. Ensaios single-use da
release de contatos são evidência histórica e não são gates ativos de novas releases.

## Próximos atos

1. Implementar e autenticar o adaptador produtivo para o PM2/launcher supervisionado.
2. Ensaiar esse adaptador somente leitura contra um snapshot fresco e sanitizado.
3. Abrir uma única janela autorizada para promover e verificar a correção já staged.

O núcleo estável `scripts/deploy-v2.py` e suas fixtures de sucesso/rollback já estão
versionados. Ele ainda não autoriza promoção sem o adaptador produtivo autenticado.

OBS-1 continua separado: `PREPARED / SCHEDULED WINDOW REQUIRED / NO CHANGE`, fora do
expediente protegido. Nenhum segredo é versionado.

