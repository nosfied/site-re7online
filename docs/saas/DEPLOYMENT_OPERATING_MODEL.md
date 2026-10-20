# Modelo operacional de implantação do Converta

**Status: CANÔNICO / IMMUTABLE RELEASE V2 / PRODUÇÃO VIVA**

Este documento é a única rota normal de entrega. O objetivo é permitir releases
pequenas e frequentes sem transformar cada alteração em um projeto de infraestrutura.

## Diagnóstico encerrado em 20/10/2026

A correção funcional da listagem de contatos terminou em `f5028de1`. Depois dela,
17 commits e 4.646 linhas foram acrescentados sem alterar runtime: executores em duas
fases, bindings, nonces, journals, markers e verificadores single-use. A primeira
closure ainda omitiu os produtores de `runtime.private.json` e
`daemon.private.json`. O deploy deixou de falhar pela aplicação e passou a falhar
pela própria instrumentação.

`Deploy V2` e as preparações artifact-bound permanecem como evidência histórica.
Não são gates nem executores da faixa normal.

## Princípios invariáveis

- produção viva e rollback preparado antes do primeiro reload;
- release identificada por commit completo e artefatos construídos fora do runtime;
- apenas os componentes realmente alterados são recarregados;
- worker, banco, schema, credenciais, root e rede ficam intocados na faixa normal;
- autorização humana vincula exatamente o SHA preparado;
- nenhum teste, gate ou script novo é criado durante a janela;
- falha de health restaura os diretórios anteriores e não executa `pm2 save`;
- documentação registra fatos observados; `NOT EXERCISED` nunca vira `PASS`.

## IMMUTABLE_RELEASE — rota padrão

Executor único: `scripts/deploy-immutable-release.py`.

1. CI aprova build, testes e o contrato do executor.
2. Um worktree de controle descartável é criado em `/opt/re7online/deploy-control`,
   destacado no SHA canônico aprovado. O checkout produtivo pode permanecer detached
   e não é atualizado, reconstruído nem usado como mecanismo de entrega.
3. `prepare` roda externamente com Node `20.20.0`, classifica o diff, constrói apenas
   componentes afetados e produz runtimes completos, índice integral, tar
   reprodutível e extração independente. Nenhum build normal ocorre na VPS.
4. `probe-frontend` inicia o runtime frontend integral em porta alternativa, usando
   o mesmo launcher definitivo. Login, Inbox, CRM, asset e três identidades estáveis
   são obrigatórios. A API não recebe probe paralelo sem modo inerte comprovado.
5. O pacote imutável é transferido e extraído numa raiz nova sob
   `/opt/re7online/releases`; hashes e índice são revalidados antes de PM2.
6. `promote` captura dump e definições PM2 completas em uma transação privada 0600,
   seleciona por componente a release integral e termina em `AWAITING_ACCEPTANCE`.
7. Cada componente exige PID/start ticks estáveis, CWD, entrypoint, interpreter,
   SHA, contadores e health. A API também exige propriedade direta de LISTEN:3001.
8. Worker permanece intacto quando não impactado; quando a matriz marca mudança,
   recebe runtime, definição, verificação e retorno próprios.
9. `commit` vincula o aceite ao target, revalida as três identidades e executa
   `pm2 save` exatamente uma vez.
10. `rollback` restaura definições anteriores. Só declara `ROLLED_BACK` após todos
    os comandos, identidades e health passarem; qualquer negativa termina em
    `ROLLBACK_FAILED` e código não zero.

Comandos:

```bash
nvm exec 20.20.0 scripts/deploy-immutable-release.py prepare \
  --repo <worktree-de-controle> --base <base-ref> --target <target-ref> \
  --output <raiz-local-exclusiva>
scripts/deploy-immutable-release.py probe-frontend \
  --release <raiz-local-exclusiva> --pm2 <pm2-cli-local> --port 3100
scripts/deploy-immutable-release.py promote \
  --release <release-extraida> --transaction <transacao-privada-exclusiva>
scripts/deploy-immutable-release.py commit \
  --transaction <transacao-privada-exclusiva> --acceptance <aceite-privado-0600>
```

Não se executa `pull`, `switch`, `checkout`, `npm`, Prisma ou build no checkout
produtivo para uma release normal.

`scripts/deploy-normal-release.sh` está **REPROVADO / HISTÓRICO / NÃO UTILIZÁVEL**:
copiava payload para CWD ativo, validava depois da substituição e podia imprimir
`ROLLED_BACK` mesmo com comandos de retorno falhos.

Uma preparação interrompida nunca é reutilizada nem sobrescrita. Seu diretório é
inventariado e movido, de forma recuperável, para
`/opt/re7online/releases/failed-preparations/` antes de uma nova preparação do
mesmo SHA. A ausência de `manifest.json` e `manifest.sha256` prova que ela não
chegou ao estado `PREPARED_INERT`.

## Classificação de impacto

Código de API em `apps/whatsapp-agent/src` não implica automaticamente mudança no
worker. O worker só é impactado pelos módulos compartilhados que ele realmente
compila: `web-session`, `db.ts`, `channelAccountSecretCrypto.ts`,
`clientFeatures.ts` e `logger.ts`. Dependências, lockfiles, migrations, schema e
caminhos desconhecidos são negados na faixa normal.

## BREAK_GLASS — excepcional

É obrigatório para migration/schema, dependências, credenciais, root/rede/proxy,
worker/drain, contenção de incidente ou mudança que não caiba no executor normal.
Exige janela própria, autorização explícita e runbook específico. Um mecanismo de
incidente não pode voltar a ser requisito das releases comuns.

## Release pendente

A correção da listagem de contatos é `IMMUTABLE_RELEASE`, com base operacional
`b8cc113dc3e27a6818a1074f51c38eaa0e569448`, fonte funcional `f5028de1e530666623dcc95519e744350671cb02`
e componentes API + frontend. Worker, banco, schema, dependências e credenciais não
mudam. Ela permanece `STAGED_INERT / NOT DEPLOYED` até uma execução real registrada.
