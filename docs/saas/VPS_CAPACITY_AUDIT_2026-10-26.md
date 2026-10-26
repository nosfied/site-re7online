# Auditoria de capacidade da VPS — 26/10/2026

Leitura somente de metadados. A coleta não seguiu symlinks, deduplicou hardlinks
por `device/inode` dentro de cada raiz e marcou blocos compartilhados entre grupos.
O lock canônico existente foi adquirido por `flock -n` somente durante a fotografia,
sem criar ou remover o arquivo. As sete raízes permaneceram estáveis; zero erro de
leitura. Este documento não autoriza retenção.

## Totais por raiz

| Raiz | Aparente | Alocado | Inodes | Entradas de primeiro nível |
| --- | ---: | ---: | ---: | ---: |
| `/opt/re7online/releases` | 27.406.989.698 B | 29.941.972.992 B | 1.004.844 | 58 |
| `/opt/re7online/build-output` | 6.009.917.898 B | 6.449.451.008 B | 171.814 | 15 |
| `/opt/re7online/build-worktrees` | 3.759.889.804 B | 4.094.980.096 B | 151.441 | 4 |
| `/opt/re7online/backups/converta-persistent/preparations` | 13.571.586.162 B | 13.483.298.816 B | 35.967 | 148 |
| `/opt/re7online/backups/converta-persistent/deploy-preparations` | 1.495.964 B | 1.990.656 B | 178 | 11 |
| `/opt/re7online/backups/converta-persistent/deploy-transactions` | 132.197.574 B | 132.751.360 B | 251 | 7 |
| `/home/deploy/.npm/_cacache` | 352.872.831 B | 356.741.120 B | 3.234 | 3 |

Há 174.112.768 B de blocos compartilhados entre grupos de `preparations` e
44.417.024 B entre grupos de `build-worktrees`; portanto, somas ingênuas de linhas
não são estimativa de recuperação. Evidências privadas foram contadas apenas por
identidade/tamanho e continuam preservadas.

## Gerações recentes

| Geração / caminho | Aparente | Alocado | Inodes | Classe |
| --- | ---: | ---: | ---: | --- |
| output `a959129e` | 1.048.783.986 B | 1.136.685.056 B | 34.358 | retenção condicionada dos runtimes; pacote/índice/manifesto preservados |
| worktree `a959129e` | 939.867.568 B | 1.023.635.456 B | 37.856 | `RETENTION_CANDIDATE`, condicionado |
| release `a959129e` | 900.804.379 B | 988.766.208 B | 34.392 | `PRESERVE`, API viva |
| extração interrompida `.immutable-a959…extracting.436891` | 900.682.751 B | 988.573.696 B | 34.355 | `RETENTION_CANDIDATE`, condicionado |
| output `d436239e` | 1.048.752.131 B | 1.136.648.192 B | 34.358 | retenção condicionada dos runtimes; metadados preservados |
| worktree `d436239e` | 939.927.275 B | 1.023.692.800 B | 37.857 | `RETENTION_CANDIDATE`, condicionado |
| release `d436239e` | 900.681.320 B | 988.577.792 B | 34.355 | `RETURN_CHAIN`, retorno imediato do frontend |
| output `f1602787` | 1.048.796.222 B | 1.136.701.440 B | 34.358 | retenção condicionada dos runtimes; metadados preservados |
| worktree `f1602787` | 940.030.144 B | 1.023.807.488 B | 37.863 | `RETENTION_CANDIDATE`, condicionado |
| release `f1602787` | 900.744.018 B | 988.647.424 B | 34.365 | `PRESERVE`, frontend vivo |
| output `123ba7bd` | 1.048.801.649 B | 1.136.693.248 B | 34.357 | `PRESERVE`, candidata não instalada |
| worktree `123ba7bd` | 940.060.721 B | 1.023.840.256 B | 37.864 | `PRESERVE`, candidata não instalada |

O output de cada geração recente contém runtimes API/frontend, pacote comprimido,
manifesto e índice. A candidata `123ba7bd` não possui release instalada e permanece
integralmente preservada. Os stagings vazios de `d436239e` e `f1602787` ocupam
4.096 B cada; não entram no lote proposto.

## Acervo histórico

A enumeração cobriu todas as 58 entradas de `releases`, 15 de `build-output`, quatro
worktrees, 148 preparações, 11 deploy-preparations e sete transações. Entre os maiores
itens históricos estão a release viva do worker `e2e7f17a` (1.378.865.152 B), releases
legadas de aproximadamente 0,64–1,02 GB e preparações com até 2.003.935.232 B.
Esses itens ficam `PRESERVE` ou `ARCHIVE`: nome, idade e tamanho não provam
dispensabilidade; conteúdo único, retorno e custódia ainda não foram excluídos.

Referências frescas confirmaram `/current/api` em `a959129e`, `/current/frontend`
em `f1602787`, worker em `e2e7f17a`, PM2 6.0.14 com três processos online, dump
preservado e health local válido. A fotografia comum não oferece cobertura completa
de namespaces/descritores/mapas; por isso o ganho seguro imediato é **zero**.

## Queda de capacidade

O saldo caiu 13.776.875.520 B entre a medição pós-limpeza e a medição informada
pós-preparação. A coexistência atual dos caminhos das quatro gerações recentes soma
12.596.277.248 B alocados (91,43% da queda): `a959` 4.137.660.416 B, `d436`
3.148.922.880 B, `f160` 3.149.160.448 B e `123ba` 2.160.533.504 B. Isso explica
quantitativamente a maior parte do saldo, mas não prova que todos esses blocos foram
criados no intervalo. Restam 1.180.598.272 B sem atribuição causal exata porque não
existe baseline por raiz comparável; o cache npm atual (356.741.120 B) é apenas um
limite superior de possível contribuição, não uma causalidade demonstrada.

## Intenção de retenção — `NOT_AUTHORIZED`

Ganho condicionado máximo do lote: **7.006.203.904 B**. Ganho seguro imediato:
**0 B**. Antes de qualquer comando, o lote exige comparador autenticado, equivalência
integral/contensão, inventário de ignorados nos worktrees, ausência de conteúdo único,
duas amostras privilegiadas frescas de CWD/FD/maps/namespaces/escritores, referências
live/saved/current/boot/rollback, lock mantido até inspeção final e recibo com fsync.

Comandos literais propostos, ainda não autorizados:

```bash
git -C /opt/re7online/site-re7online worktree remove /opt/re7online/build-worktrees/immutable-a959129e-vps-20261026T023100Z-source
git -C /opt/re7online/site-re7online worktree remove /opt/re7online/build-worktrees/immutable-d436239e-vps-20261026T131821Z-source
git -C /opt/re7online/site-re7online worktree remove /opt/re7online/build-worktrees/immutable-f1602787-vps-20261026T174702Z-source
rm -r -- /opt/re7online/build-output/immutable-a959129e-vps-20261026T023100Z-producer/immutable-a959129e-vps-20261026T023100Z/api-runtime
rm -r -- /opt/re7online/build-output/immutable-a959129e-vps-20261026T023100Z-producer/immutable-a959129e-vps-20261026T023100Z/frontend-runtime
rm -r -- /opt/re7online/build-output/immutable-d436239e-vps-20261026T131821Z-producer/immutable-d436239e-vps-20261026T131821Z/api-runtime
rm -r -- /opt/re7online/build-output/immutable-d436239e-vps-20261026T131821Z-producer/immutable-d436239e-vps-20261026T131821Z/frontend-runtime
rm -r -- /opt/re7online/build-output/immutable-f1602787-vps-20261026T174702Z-producer/immutable-f1602787-vps-20261026T174702Z/api-runtime
rm -r -- /opt/re7online/build-output/immutable-f1602787-vps-20261026T174702Z-producer/immutable-f1602787-vps-20261026T174702Z/frontend-runtime
rm -r -- /opt/re7online/releases/.immutable-a959129e-vps-20261026T023100Z.extracting.436891
```

Parar na primeira falha, sem força, prune, glob, alternativa ou retry. Após cada
comando, registrar tentativa/exit code/estado restante; ao final, confirmar caminhos,
espaço/inodes, processos, dump, markers, health e todos os objetos preservados.
Rollback de exclusão não existe: qualquer conteúdo único ou cobertura ambígua retira
o caminho da intenção antes da autorização.

Devem permanecer: releases vivas, worker, retornos imediatos e transitivos, candidata
`123ba`, pacotes/manifests/índices, dump/markers, configurações, bancos, uploads,
mídias, backups, journals, recibos e evidências. PR #240 e sua preparação ficam
preservados como histórico superado, sem merge, ativação ou limpeza implícita.
