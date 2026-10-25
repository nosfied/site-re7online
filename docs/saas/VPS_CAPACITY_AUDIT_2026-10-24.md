# Auditoria de capacidade da VPS — 24/10/2026

**READ ONLY / NENHUMA LIMPEZA AUTORIZADA / PRODUÇÃO INALTERADA**

Fotografia coletada em `2026-10-24T20:49:05-03:00`. As medições usam leituras
limitadas. Dois totais amplos excederam o limite de 25 segundos; os subdiretórios
foram medidos separadamente. Nenhum script de retenção ou backup foi executado.

## Capacidade

| Recurso | Observação |
| --- | --- |
| Disco raiz | 77 GiB, 68 GiB usados, 9,1 GiB disponíveis, 89% |
| Inodes | 1.661.781 usados de 10.354.688; 17% |
| RAM | 3,8 GiB total; 2,7 GiB disponível |
| Cache recuperável | cerca de 2,8 GiB em buff/cache; `Cached` 2,0 GiB e `SReclaimable` 744 MiB |
| Memória livre estrita | 266 MiB; não representa sozinha a capacidade disponível |
| Swap | 2,0 GiB total; 137 MiB usados |
| Pressão de memória | PSI de 10/60/300 segundos igual a 0,00 |
| OOM no dia | nenhum evento encontrado no kernel |
| PostgreSQL | container original saudável; volume ativo de aproximadamente 1,25 GB |
| Arquivos removidos abertos | zero |
| Docker | um container e um volume ativos; zero bytes recuperáveis de container/volume |
| Conteúdo persistente | aproximadamente 513 MiB; preservar |
| Backups persistentes | pelo menos 14,6 GiB medidos; preservar até classificação por dependência e custódia |

RSS/PSS observado: worker 341/319 MiB, frontend 159/131 MiB e API 127/95 MiB.
O cache do kernel é recuperável sob pressão; não deve ser somado à memória privada
dos processos como consumo irrecuperável. Não há fundamento para `drop_caches`,
`swapoff` ou parada de serviço.

## Referências protegidas

Preservar sem condicionamento por idade:

- release ativa de API/frontend
  `immutable-d7de6453-vps-20261024T221500Z` (aprox. 943 MiB);
- retorno imediato da API
  `immutable-3630e16-vps-20261024T195842Z` (aprox. 943 MiB);
- retorno imediato do frontend
  `immutable-ec2a9fde-vps-20261024T162005Z` (aprox. 943 MiB);
- runtime vivo do worker
  `immutable-e2e7f17a-20261022T005110Z` (aprox. 1,28 GiB);
- retornos transitivos `immutable-ef7db111-vps-20261024T174000Z`,
  `immutable-a62da468-vps-20261024T124726Z` e
  `immutable-5c339b2e-20261022T125717Z`;
- dump PM2 vigente, dump de retorno, configurações privadas, journals e evidências
  autenticadas;
- PostgreSQL, volume `postgres_wa_agent_pgdata`, mídias persistentes, sessões e
  dados de todos os tenants;
- backups PostgreSQL e de manutenção até prova de custódia e restauração;
- pacote, manifesto e índice da release ativa.

A busca sanitizada encontrou referências privadas para todas as releases acima.
Contagem de referência não prova necessidade sozinha; confirma que nenhuma delas
pode entrar em limpeza sem reconstruir o grafo de retorno.

## Inventário resumido e candidatos

| Disposição | Caminho/escopo | Alocado | Função e referências verificadas | Motivo | Recuperável estimado | Risco |
| --- | --- | ---: | --- | --- | ---: | --- |
| Preservar | release ativa `immutable-d7de6453-vps-20261024T221500Z` | 943 MiB | API/frontend vivos, pacote e marker | runtime atual | 0 | crítico |
| Preservar | retornos API/frontend e cadeia transitiva | ~4,7 GiB | dumps, journals e preparações referenciam a cadeia | retorno componente a componente | 0 | crítico |
| Preservar | release do worker `immutable-e2e7f17a-20261022T005110Z` | 1,28 GiB | CWD e entrypoint vivos | worker não integrou o deploy | 0 | crítico |
| Preservar | `content`, PostgreSQL e volume Docker | ~1,76 GiB | storage e banco ativos | dados de tenants e mídia | 0 | crítico |
| Preservar | configurações/dumps/evidências privadas | ~681 MiB em 2.943 arquivos protegidos | autenticação e retorno | não há substituto comprovado | 0 | alto |
| Arquivar | três preparações falhas preservadas | 1,61 GiB | evidência de Prisma ausente, OOM e payload incompleto | não são runtimes; exigem custódia verificável | até 1,61 GiB após arquivo off-host | médio |
| Arquivar | outputs de builds substituídos, excluído o pacote ativo | ~4,48 GiB | payloads e pacotes de releases anteriores | releases e hashes existem, mas retorno deve ser testado antes | a medir após deduplicação | alto |
| Arquivar | logs PM2 numerados | 119 MiB | não são os arquivos correntes; podem conter diagnóstico | só após índice, hash e política de retenção aprovada | até 119 MiB | médio |
| Revisar para remoção | cache npm `~/.npm/_cacache` | 398 MiB | cache reconstruível, fora de runtime/dump | nenhuma referência operacional observada | até 398 MiB | baixo |
| Revisar para remoção | worktree limpo do build interrompido `immutable-ec2a9fde-vps-20261024T161807Z-source` | 976 MiB | HEAD `ec2a9fde`, tracked e untracked limpos; não é release ativa | tentativa substituída pelo build `162005Z` | até 976 MiB | médio |
| Preservar por ora | demais worktrees de build | ~2,86 GiB | vinculados ao ativo ou a retornos | referência suficiente para negar remoção automática | 0 nesta revisão | médio |
| Preservar por ora | `releases/incoming` | 263 MiB+ | contém pacote e checksums históricos | cobertura por release/backup não foi provada integralmente | 0 nesta revisão | médio |
| Preservar | logs PM2 correntes | 233 MiB | arquivos abertos dos processos vivos | diagnóstico ativo | 0 | alto |
| Preservar | imagem Docker | 416 MiB | imagem do único container PostgreSQL ativo | `docker system df` marca cache aparente, mas a imagem está em uso | 0 | crítico |

Tamanho igual, idade ou nome parecido não foram usados como prova de inutilidade.
`docker system df` mostrou a imagem como “reclaimable”, mas ela é a imagem do
container PostgreSQL ativo e foi classificada como **preservar**.

## Lote pequeno proposto para revisão

Nenhuma ação foi executada. Um lote futuro e separado pode conter somente:

1. cache npm `~/.npm/_cacache` — até 398 MiB;
2. worktree limpo `immutable-ec2a9fde-vps-20261024T161807Z-source` — até 976 MiB,
   removido apenas por `git worktree remove`, depois de confirmar novamente que
   não há processo, CWD, symlink, dump, journal, pacote ou configuração apontando
   para ele;
3. sidecar vazio da saída `immutable-ec2a9fde-vps-20261024T161807Z` — 4 KiB,
   somente junto da evidência correspondente.

Estimativa máxima: aproximadamente 1,34 GiB. Antes de executar, exigir nova leitura,
lista literal, hashes/índice do que será preservado, autorização própria e verificação
posterior. O lote não inclui release, pacote autenticado, backup, log corrente,
mídia, PostgreSQL, Docker, configuração privada ou evidência de retorno.

## Cron, retenção e scripts

Foram inventariadas seis entradas não comentadas no crontab do usuário e o arquivo
`/etc/cron.d/re7-converta-backup`; nenhum conteúdo sensível foi publicado e nenhum
cron foi alterado. Nomes de scripts não foram tratados como garantia de leitura:
nenhum “dry-run” foi executado. O script de backup encontrado foi apenas hashado.
Os caminhos antigos de cleanup não existem no checkout produtivo atual.

Este documento não autoriza `prune`, `pm2 flush`, retenção, limpeza de mídia,
alteração de cron, remoção de worktree ou cache.
