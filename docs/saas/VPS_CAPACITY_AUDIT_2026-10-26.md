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

> Estado posterior: o lote v3 abaixo foi executado e concluído. Esta seção é a
> fotografia histórica anterior à autorização e seus comandos não devem ser
> repetidos.

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

## Encerramento do lote v3 — `COMPLETED`

O relato final autenticado registra 10 comandos tentados, concluídos e verificados,
sem retry, glob, força ou prune. Ganho observado: **6.942.289.920 bytes**; espaço
livre final: **13.416.599.552 bytes**. Recibo SHA-256
`19ba46c4948e3ff1821b8b44e51fed1edf635b9b7ddd3421064dab7ee2250c74`; log
`e8f593acb2801e88dbbfffb3a679b4775916491c3e2281e24a45ebf3f0e6c985`;
amostras `11f70b7c7b6d27f8a55bae36aa17b081ece70e8511f414da14b1f56d83661612`
e `94fda2c48e65e43de46d6cedc121d4b32f46339301306f452218bb8a013ea6a8`.
Produção permaneceu inalterada e o lock ficou livre, com seu arquivo preservado.

Devem permanecer: releases vivas, worker, retornos imediatos e transitivos, candidata
`123ba`, pacotes/manifests/índices, dump/markers, configurações, bancos, uploads,
mídias, backups, journals, recibos e evidências. PR #240 e sua preparação ficam
preservados como histórico superado, sem merge, ativação ou limpeza implícita.

## Reconciliação integral somente leitura — 02/11/2026

Esta seção atualiza a fotografia de 26/10 sem substituir seus recibos. A coleta
começou por `df`/`statfs` e aprofundou somente as maiores raízes. Foram reutilizados
os inventários, manifests, relações, receipts e classificações posteriores; não houve
hash integral de payload, extração, cópia, build, manutenção de banco ou retirada.

### Balanço dos filesystems

| Filesystem | Tipo | Total | Usado | Disponível | Uso | Inodes usados/livres |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `/dev/vda1` em `/` | ext4 | 82.086.711.296 B | 73.247.272.960 B | 8.822.661.120 B | 90% | 1.627.204 / 8.727.484 |
| `/dev/vda15` em `/boot` | ext4 | 923.156.480 B | 122.159.104 B | 736.354.304 B | 15% | sem pressão observada |
| `/dev/vda14` em `/boot/efi` | vfat | 109.395.456 B | 6.399.488 B | 102.995.968 B | 6% | não aplicável ao orçamento P00 |

Os `tmpfs` de `/run`, `/dev/shm` e `/run/user/1000` não pertencem ao orçamento
persistente. `statfs` registrou 2.158.066 blocos livres e 2.153.970 disponíveis de
4.096 B: 16.777.216 B estão fora de `bavail` por reserva/contabilidade do filesystem.
A partição possui 84.824.538.624 B, 2.737.827.328 B acima do total utilizável do
ext4; essa diferença é formatação/metadados, não arquivo recuperável.

O overlay Docker está no mesmo `/dev/vda1` e não foi somado como filesystem
independente. O Docker mantém uma imagem de aproximadamente 435,5 MB, um container
ativo com camada gravável de aproximadamente 40,04 MB e um volume PostgreSQL de
1.530.802.176 B físicos. A imagem aparece como reclaimable no resumo do Docker,
mas é dependência do container ativo e não está qualificada para retirada. Não há
build cache. A varredura `lsof +L1` visível ao usuário `deploy` encontrou zero
arquivos apagados abertos; ela não prova ausência em processos inacessíveis de
outros UIDs.

### Ocupação reconciliada por domínio

| Domínio | Bytes físicos atuais | Classificação |
| --- | ---: | --- |
| releases instaladas | 34.887.024.640 | protegidas pelo grafo autenticado |
| preparações | 13.135.405.056 | mistas; conteúdo privado/evidência e resíduos ainda não qualificados |
| `deploy-control` | 2.779.156.480 | control planes e cópias autenticadas; revisão de lifecycle pendente |
| `build-output` | 2.775.187.456 | pacotes/manifests/índices preservados; runtimes já sanitizados onde autorizado |
| checkout canônico | 2.717.020.160 | fonte de verdade Git protegida |
| `release-sources` | 2.009.833.472 | fontes/retornos referenciados, protegidos |
| volume PostgreSQL Docker | 1.530.802.176 | dados persistentes compartilhados |
| snapshots Converta | 1.135.624.192 | backup/evidência, sem disposição qualificada |
| conteúdo tenant-scoped | 569.446.400 | mídias persistentes protegidas |
| backups PostgreSQL Converta | 546.844.672 | backup, sem disposição qualificada |
| manutenção Converta | 574.103.552 | evidência/recuperação, sem disposição qualificada |
| PM2 | 410.230.784 | 405.860.352 B são logs; política de rotação ainda precisa de ato próprio |
| cache npm `_cacache` | 341.782.528 | classe canônica existente, mas sem qualificação vigente nesta fotografia |
| transações de deploy | 136.298.496 | journals/receipts; preservar contratos abertos e evidência terminal |
| worktrees de build | 75.276.288 | único worktree legado, sem contrato de retirada |

O somatório das raízes mensuradas e dos componentes Docker conhecidos é
64.335.919.648 B. A diferença para `df used` é 8.911.353.312 B e inclui sistema
operacional, outras raízes/backups, itens sem permissão de leitura, contabilidade do
filesystem e possíveis blocos compartilhados/hardlinks. Ela permanece
**não atribuída**, em vez de ser distribuída artificialmente. A auditoria de 26/10
já provou 174.112.768 B compartilhados entre grupos de preparações e 44.417.024 B
entre grupos de worktrees; por isso totais de subárvores não são somados como ganho
recuperável sem medição pós-efeito.

### Aplicação e cadeia de retorno

| Papel | Release | Bytes físicos |
| --- | --- | ---: |
| API ativa | `immutable-fa63994a-vps-20261030T153352Z` | 988.852.224 |
| frontend ativo | `immutable-aa9527cc-vps-20261029T222733Z` | 989.552.640 |
| worker ativo | `immutable-e2e7f17a-20261022T005110Z` | 1.378.865.152 |
| rollback API | `immutable-754281d3-vps-20261029T174145Z` | 988.798.976 |
| rollback frontend | `immutable-b96eb779-vps-20261028T033840Z` | 988.815.360 |

Ativos somam 3.357.270.016 B e retornos imediatos 1.977.614.336 B. Os outros
29.552.140.288 B são releases históricas/transitivas. A classificação autenticada
do grafo alcança 60/60 diretórios físicos por ativo, rollback imediato, transação
legada/aberta ou dependência transitiva; portanto o ganho atualmente qualificado em
releases é **zero**. As arestas não podem ser removidas para fabricar capacidade.

Os 18 `build-output` remanescentes concentram pacotes, manifests, índices e
evidências que continuam fontes de verdade. O único worktree remanescente,
`whatsapp-meta-backfill-7339b143-source`, ocupa aproximadamente 75,27 MB e não tem
retirement contract. Nenhum dos dois grupos está qualificado por esta auditoria.

### Dados persistentes e tenants

O catálogo PostgreSQL, consultado em transação `READ ONLY / REPEATABLE READ`,
registrou 1.422.040.087 B para o banco e 1.410.957.312 B em relações de usuário:
478.650.368 B de heap/TOAST e 932.306.944 B de índices. A relação `Event` domina
com 1.280.942.080 B (400.384.000 B de heap e 880.558.080 B de índices), seguida
por `OutboundMessage` (42.369.024 B), `ChannelAccountSecret` (30.400.512 B) e
`InboundMessage` (29.663.232 B). O diretório físico separa aproximadamente
1.445.462.016 B em `base` e 83.894.272 B em `pg_wal`; diferenças para o catálogo
são esperadas por WAL e metadados físicos.

Essas tabelas são compartilhadas. Não existe prova de alocação física por tenant,
logo nenhum byte foi atribuído a tenant individual e nenhum conteúdo privado foi
lido ou publicado. Sessões, conversas e estado operacional permanecem no banco ou
nos overlays protegidos; não foi inventada uma categoria física separada.

O conteúdo persistente soma 569.446.400 B: 543.809.536 B em
`web-session-media`, 25.522.176 B em `template-campaign-media` e aproximadamente
114 KB em attachments/training. O overlay `.data` da API ativa ocupa 45.056 B e o
do rollback 32.768 B. Todos são tenant-scoped ou dependências privadas e ficam
`PRESERVE`.

### Crescimento reconciliado desde 26/10

Após o lote v3, o receipt registrou 13.416.599.552 B disponíveis; agora existem
8.822.661.120 B. O crescimento líquido de uso foi **4.593.938.432 B**.

| Parcela comparável | Variação líquida |
| --- | ---: |
| releases | +5.933.625.344 B |
| `build-output` | -791.683.072 B |
| worktrees | -948.568.064 B |
| preparações | -347.893.760 B |
| transações | +3.547.136 B |
| cache npm | -14.905.344 B |
| fora das raízes comparáveis | +759.816.192 B |
| **saldo** | **+4.593.938.432 B** |

Os lotes terminais posteriores retiraram 375.603.200 B (`automation`),
224.071.680 B (`hybrid-b9`) e 458.964.992 B (lote 3/3), totalizando
1.058.639.872 B. Esses caminhos não são candidatos e não podem ser reabertos.
Com esse offset explícito, o crescimento bruto inferido dentro de `preparations`
foi de aproximadamente 710.746.112 B. Uma reconciliação de entradas e saídas dá
7.407.734.784 B brutos (releases 5.933.625.344; preparações 710.746.112;
transações 3.547.136; residual 759.816.192), compensados por 2.813.796.352 B de
retiradas/contrações. Isso é contabilidade entre checkpoints, não atribuição por
`mtime`; datas isoladas não foram usadas como prova causal.

### Plano proporcional por impacto

| Classe | Volume conhecido | Estado/impedimento | Menor próximo ato |
| --- | ---: | --- | --- |
| produção + rollback imediato | 5.334.884.352 B | protegido | nenhum |
| releases transitivas/históricas | 29.552.140.288 B | 60/60 alcançadas pelo grafo | fechar referências somente por lifecycle real; não cortar arestas |
| dados/DB/mídias/overlays | pelo menos 2.100.326.400 B | tenant-scoped/compartilhado | preservar; manutenção DB é frente distinta |
| `worker-package-audit` | 365.674.496 B | 1.023 diretórios internos `0775`; identidade nega | `KEEP_PRESERVED`, sem chmod/chown |
| `runtime-fix` worker return | 95.993.856 B | falta record scope/evidência exata | qualificação documental específica, se priorizada |
| `runtime-fix` API/frontend | 276.844.544 B | material protegido real | `KEEP_PROTECTED` |
| dois archives `night` | 205.082.624 B | autoridades ausentes | preservar até autoridade comprovada |
| frontend 3227 | 184.074.240 B | ancestral `0775` e sem qualificação | preservar; não normalizar permissão |
| cache npm | 341.782.528 B | control plane suporta a classe; falta operação fresca autorizada | audit canônico separado |
| logs PM2 | 405.860.352 B | sem receipt/política de rotação aplicada | definir e testar rotação, sem truncamento ad hoc |
| `deploy-control/ef7db111-prep` | 1.023.299.584 B | custódia/control root sem disposição terminal provada | classificar por artefato e autoridade |

O potencial listado não é ganho qualificado e não deve ser somado como autorização.
Nesta fotografia, **recuperável comprovado e autorizado = 0 B**. O acúmulo é
produzido principalmente por gerações imutáveis protegidas pelo grafo, preparações
históricas sem disposição consumível, materializações do control plane, logs PM2 e
cache de build. A extensão preventiva de lifecycle já foi implementada e ensaiada
no adapter/reservation root, mas ainda não está integrada às rotas reais que criam
todas as preparações; essa é a lacuna concreta que permite novas alocações sem
`OPEN → SANITIZED|RETENTION_DEBT` verificável.

Fotografia nominal: `P00_VPS_CAPACITY_READ_ONLY_RECONCILED`. Nenhuma ação de
retirada, manutenção, permissão, restart ou banco foi autorizada por esta seção.
