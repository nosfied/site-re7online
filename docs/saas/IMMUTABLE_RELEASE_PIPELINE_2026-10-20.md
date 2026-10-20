# Pipeline canônico de release imutável — 20/10/2026

**Estado:** LOCAL/OFFHOST VERIFIED / NOT DEPLOYED / PRODUCTION UNCHANGED

## Decisão

A mudança de 25–29/09 foi uma migração operacional incompleta. O PM2 saiu do
checkout e passou a selecionar releases versionadas, mas o controle e a documentação
continuaram descrevendo build e substituição dentro do checkout vivo.

| Período | Fonte/runtime | Seleção | Retorno | Classificação |
| --- | --- | --- | --- | --- |
| Agosto | checkout operacional mutável | pull/build/restart no mesmo CWD | checkout anterior implícito | histórico |
| 01–25/09 | checkout, depois detached | matriz de impacto + restart | ainda dependente do checkout | transição |
| 26–29/09 | releases completas versionadas | definição PM2 explícita por componente | definição anterior preservada | mecanismo comprovado recuperado |
| Modelo final | build externo Node 20.20.0 + runtime integral | CWD/entrypoint da release no PM2 | definição completa capturada 0600 | canônico |

`scripts/deploy-normal-release.sh` está reprovado: copiava `dist`/`.next` para o
CWD ativo, validava somente depois da substituição e seu trap podia imprimir
`ROLLED_BACK` após comandos de retorno malsucedidos.

## Contrato implementado

- `prepare`: somente fora da VPS; classifica o diff, constrói componentes afetados,
  gera runtime integral, índice, manifesto, tar reprodutível e extração independente.
- `probe-frontend`: inicia o runtime real em porta alternativa com PM2 local isolado,
  exigindo três amostras de PID/start ticks, zero reinícios, BUILD_ID e HTTP 200 para
  Login, Inbox, CRM e asset do build.
- `promote`: captura dump e definições completas; seleciona API, worker se impactado,
  e frontend. Termina em `AWAITING_ACCEPTANCE`; não salva PM2.
- O estado persistente `.data` da API permanece fora do pacote e é vinculado por
  symlink explícito ao diretório vivo observado antes da seleção; nenhum dado é
  copiado para a release.
- `commit`: vincula o aceite ao target, revalida as identidades e executa `pm2 save`
  exatamente uma vez.
- `rollback`: restaura definições anteriores. Só grava `ROLLED_BACK` após comandos,
  identidade e health aprovados; caso contrário grava `ROLLBACK_FAILED` e falha.

A API paralela está fechada por `NO_PROVEN_SIDE_EFFECT_FREE_MODE`. Para liberar esse
gate será necessário demonstrar um modo sem consumers, jobs, campanhas, importações,
webhooks ou qualquer efeito externo. A implantação não improvisa esse modo.

## Prova off-host executada

Release de prova funcional:

- base: `b8cc113dc3e27a6818a1074f51c38eaa0e569448`;
- target: `f5028de1e530666623dcc95519e744350671cb02`;
- Node: `v20.20.0`;
- npm: `10.8.2`;
- BUILD_ID: `4_mYfHiKUSdi8hzp7cjxV`;
- pacote: SHA-256 `a7843d30c47c1bfb43662e8019d566283749efc0eb3fd67f30a82e6d749e5fb8`;
- componentes: API e frontend; worker preservado;
- resultado: `PREPARED_INERT` e `FRONTEND_CANDIDATE_REAL_PASS`.

As fixtures cobrem promoção simulada, retorno com ambiente privado e interpreter,
payload de origem somente leitura, falha de seleção, health, rollback, replay de save
e ausência de falsos `DEPLOYED`/`ROLLED_BACK`. PM2 real de produção não foi usado.

## Comandos futuros

Preparação externa:

```bash
source "$HOME/.nvm/nvm.sh"
nvm exec 20.20.0 python3 scripts/deploy-immutable-release.py prepare \
  --repo <worktree-canônico-limpo> \
  --base <commit-base-completo> \
  --target <commit-alvo-completo> \
  --output <raiz-local-exclusiva>
nvm exec 20.20.0 python3 scripts/deploy-immutable-release.py probe-frontend \
  --release <raiz-local-exclusiva> \
  --pm2 <pm2-cli-local-autenticado> \
  --port 3100
```

Após transferência autenticada e extração em raiz nova, promoção:

```bash
python3 scripts/deploy-immutable-release.py promote \
  --release <release-extraída> \
  --transaction <raiz-privada-exclusiva-0600>
```

Depois do aceite vinculado ao target:

```bash
python3 scripts/deploy-immutable-release.py commit \
  --transaction <raiz-privada-exclusiva-0600> \
  --acceptance <aceite-privado-0600>
```

Retorno explícito:

```bash
python3 scripts/deploy-immutable-release.py rollback \
  --transaction <raiz-privada-exclusiva-0600>
```

## Limites ainda não comprovados

- API em paralelo: negada até existir modo inerte comprovado.
- Worker impactado: implementado e coberto pelo contrato da matriz, mas esta prova
  real construiu uma release sem impacto no worker.
- Promoção, rollback e `pm2 save` foram exercitados somente por superfícies PM2
  simuladas; nenhuma janela produtiva foi aberta.
- O smoke autenticado tenant-scoped continua sendo gate humano/GET-only após seleção.
