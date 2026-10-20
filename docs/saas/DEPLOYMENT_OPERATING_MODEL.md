# Modelo operacional de implantação do Converta

**Status: CANÔNICO / NORMAL RELEASE V1 / PRODUÇÃO VIVA**

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

## NORMAL_RELEASE — rota padrão

Executor único: `scripts/deploy-normal-release.sh`.

1. CI aprova build, testes e o contrato do executor.
2. Um worktree de controle descartável é criado em `/opt/re7online/deploy-control`,
   destacado no SHA canônico aprovado. O checkout produtivo pode permanecer detached
   e não é atualizado, reconstruído nem usado como mecanismo de entrega.
3. `plan <base> <target>` classifica o diff sem mutação.
4. `prepare <base> <target>` cria worktree isolada. Para a API executa exatamente
   `npm ci --include=dev`, `npm run db:generate` e `npm run build`; depois
   constrói o frontend e sela manifesto e hashes em `/opt/re7online/releases`.
   PM2, banco e produção não são tocados.
5. O owner autoriza o SHA completo em `DEPLOY_APPROVED_SHA`.
6. `activate <release-dir>` adquire lock exclusivo, captura PM2/dump privados e
   descobre os diretórios vivos pela configuração atual do PM2.
7. A API é trocada, recarregada e validada; depois o frontend é validado em
   `http://127.0.0.1:3000/app/login`.
8. Qualquer negativa restaura os diretórios anteriores e recarrega somente os
   componentes já alterados. O worker nunca é recarregado.
9. Com ambos saudáveis e worker preservado, `pm2 save` ocorre exatamente uma vez.

Comandos:

```bash
git -C /opt/re7online/site-re7online fetch origin review/campaign-recovery-20260926
git -C /opt/re7online/site-re7online worktree add --detach \
  /opt/re7online/deploy-control/<sha-canônico-curto> <sha-canônico-completo>
cd /opt/re7online/deploy-control/<sha-canônico-curto>
scripts/deploy-normal-release.sh plan <base-ref> <target-ref>
scripts/deploy-normal-release.sh prepare <base-ref> <target-ref>
DEPLOY_APPROVED_SHA=<sha-completo> scripts/deploy-normal-release.sh activate <release-dir>
```

Não se executa `pull`, `switch` ou `checkout` no checkout produtivo para uma
release normal. O executor deriva seu repositório de controle do próprio caminho;
`WORKDIR` só é usado explicitamente em testes ou recuperação supervisionada.

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

A correção da listagem de contatos é `NORMAL_RELEASE`, com base operacional
`b8cc113dc3e27a6818a1074f51c38eaa0e569448`, fonte funcional `f5028de1e530666623dcc95519e744350671cb02`
e componentes API + frontend. Worker, banco, schema, dependências e credenciais não
mudam. Ela permanece `STAGED_INERT / NOT DEPLOYED` até uma execução real registrada.
