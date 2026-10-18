# Plano de convergência segura de branches — 18/10/2026

Status: `PREPARED / NO MERGE EXECUTED / PRODUCTION UNCHANGED`.

## Snapshot auditado

| Campo | Valor |
| --- | --- |
| Linha operacional | `review/campaign-recovery-20260926` em `2a3f901a0e878b8aa2f308730f40ce6dda435447` |
| `main` | `b1692623ef1c7ae2ca076934a532efa1eb0f3264` |
| Merge-base | `36c91e5fcd943289bf60d223ae0269a3cf3ed242` |
| Operacional à frente de `main` | 1.182 commits |
| Operacional atrás de `main` | 124 commits |
| Estado | `diverged` |

Essas contagens são um snapshot; mudam quando novos commits são publicados. A
comparação inversa mostrou oito caminhos no diff líquido de `main` contra a linha
operacional:

- `vercel.json`;
- `scripts/vercel-ignore-build.sh`;
- `scripts/test-vercel-ignore-build.sh`;
- `docs/saas/VERCEL_PRODUCTION_LINEAGE_AUDIT_2026-09-19.md`;
- `docs/BACKLOG_TECH.md`;
- `docs/DEPLOY_TOPOLOGY_RE7.md`;
- `docs/saas/DOCUMENTATION_INDEX.md`;
- `scripts/README.md`.

Isso não prova que os 124 commits alteraram somente esses arquivos; descreve apenas
o diff líquido entre os dois tips auditados.

## Decisão

Não fazer merge direto, rebase destrutivo, force-push ou substituição de `main`.
`main` continua sendo a linha de produção do site público na Vercel; a branch de
review continua sendo a linha operacional documentada do Converta/VPS. Produção não
é identificada por nenhuma das duas branches sem evidência atual do runtime.

## Fase 1 — integração inerte

Após CI verde da linha operacional, criar uma branch nova a partir do seu HEAD, sem
mover `main` nem a branch operacional.

1. Importar de `main` os três controles Vercel e o registro de linhagem pelos bytes
   revisados, mantendo seus testes.
2. Reconciliar manualmente os quatro documentos sobrepostos. Não substituir o estado
   canônico atual por versões históricas de `main`.
3. Confirmar que essa fase não altera `src/**`, `public/**`, API, worker, Prisma,
   lockfiles, runtime manifests ou artefatos implantados.
4. Publicar a linha somente como integração revisável; nenhum deploy decorre dela.

## Fase 2 — gates de integração

- `git diff --check` e inventário exato dos caminhos alterados;
- CI completa da linha operacional;
- teste do classificador Vercel e do deploy impact matrix;
- build frontend e backend com os lockfiles versionados;
- validadores de estado, release e implantação;
- prova de que worker, migrations, tenants, RBAC, credenciais e rollback não mudaram;
- revisão dos conflitos documentais, preservando cronologia sem restaurar instruções
  superadas.

Qualquer caminho runtime inesperado interrompe a fase. Não resolver conflito aceitando
uma branch inteira.

## Fase 3 — decisão sobre `main`

Somente após a integração inerte passar, auditar separadamente a superfície pública
que a Vercel construiria a partir do futuro `main`: páginas, assets, manifest, rotas
públicas e política de ignored build. A promoção para `main` pode disparar produção
Vercel e, portanto, exige autorização própria, deployment/rollback fixados e smoke
público. Até essa decisão, a divergência permanece controlada.

Se autorizada, a convergência deve ocorrer por PR e merge não destrutivo, preservando
as duas histórias. Se a equivalência pública não for comprovada, manter as linhas
separadas e registrar o bloqueio; não forçar a unificação por aparência de limpeza.

## Fora de escopo

- nenhum merge, cherry-pick, rebase ou criação de branch nesta preparação;
- nenhum deploy Vercel ou VPS;
- nenhum PM2, POST, importação, SQL ou migration;
- nenhuma limpeza de staging, rollback ou evidência histórica;
- nenhuma reabertura da frente ELF ou do Guided Builder.
