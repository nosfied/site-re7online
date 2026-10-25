# Auditoria de capacidade da VPS — 24/10/2026

**AUDITORIA INICIAL SOMENTE LEITURA / LOTE PEQUENO EXECUTADO E VERIFICADO CONFORME RELATO DO OPERADOR**

A fotografia inicial e a preparação abaixo são históricas. Após autorização explícita
do usuário, o operador informou a conclusão do lote; o resultado está registrado
na seção de encerramento. Não há autorização para novas exclusões.

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

## Inventário inicial resumido e candidatos

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

## Preparação histórica do lote pequeno

Na preparação, nenhuma ação havia sido executada. O lote então proposto continha somente:

1. cache npm `/home/deploy/.npm/_cacache` — 406.303.215 bytes lógicos;
2. worktree interrompido
   `/opt/re7online/build-worktrees/immutable-ec2a9fde-vps-20261024T161807Z-source`
   — 1.023.291.392 bytes alocados;
3. sidecar vazio
   `/opt/re7online/build-output/immutable-ec2a9fde-vps-20261024T161807Z` — um
   bloco de diretório de 4 KiB e zero bytes de conteúdo.

Estimativa máxima: aproximadamente 1,34 GiB. Antes de executar, exigir nova leitura,
lista literal, hashes/índice do que será preservado, autorização própria e verificação
posterior. O lote não inclui release, pacote autenticado, backup, log corrente,
mídia, PostgreSQL, Docker, configuração privada ou evidência de retorno.

### Revalidação específica do lote

Leitura de `2026-10-25T00:09:47Z`:

- nenhum processo `npm` estava ativo;
- nenhum processo Node tinha CWD no cache, worktree ou sidecar;
- nenhum CWD, descritor aberto ou mapa de memória de processo apontava para os
  três caminhos;
- os symlinks `/opt/re7online/current/api` e
  `/opt/re7online/current/frontend` apontavam para a release ativa `d7de6453`;
- a busca dirigida em `/current`, dump PM2, configurações privadas e transações
  não encontrou referência ao worktree nem ao sidecar;
- o worktree é detached no commit
  `ec2a9fde99b6421a85256f14604bd469879f4f2a`, sem alteração tracked ou untracked;
- o worktree contém **30.917 arquivos ignorados**, distribuídos em `.next`,
  `node_modules`, `apps/whatsapp-agent/node_modules`,
  `apps/whatsapp-agent/dist` e `next-env.d.ts`. São dependências e produtos do
  build interrompido, não fonte única;
- não foi encontrado log npm no intervalo da tentativa nem evidência nomeada
  `20261024T161807Z` fora do sidecar vazio. Por isso, o registro sanitizado deste
  documento preserva explicitamente caminho, commit, estado Git e inventário dos
  ignorados antes que uma remoção seja autorizada.

### Comandos históricos do lote — não repetir

Os três comandos abaixo foram posteriormente executados conforme o relato de
encerramento. São preservados como evidência, não como instrução para repetição.
Não contêm curingas, `--force` ou prune global:

```bash
rm -r -- /home/deploy/.npm/_cacache
git -C /opt/re7online/site-re7online worktree remove /opt/re7online/build-worktrees/immutable-ec2a9fde-vps-20261024T161807Z-source
rmdir -- /opt/re7online/build-output/immutable-ec2a9fde-vps-20261024T161807Z
```

`git worktree remove` é obrigatório para manter o registro Git coerente. Se ele
negar a remoção sem `--force`, o lote deve parar; não substituir por `rm`, não usar
`--force` e não executar `git worktree prune`.

### Baseline e verificações antes/depois

Baseline somente leitura coletada antes da proposta:

| Item | Valor esperado antes e depois |
| --- | --- |
| API | PID `118102`, start ticks `3652796`, restart count `5`, online |
| Frontend | PID `118502`, start ticks `3663031`, restart count `3`, online |
| Worker | PID `2233`, start ticks `17758`, restart count `0`, online |
| Dump PM2 | `5d9ae04d6df29856318992638a66deccd29a68719c129be47453d4fd4b757e13`, modo `0600` |
| Marker `DEPLOYED` | `1d2be9be3fd5e257700257988bb4cd946dac0f7cb47b6b3a4f861facedd7c543`, modo `0600` |
| API local/pública | HTTP 200, `ok=true`, `db=ok` |
| Frontend | Login local/público, Inbox e CRM públicos HTTP 200 |
| Disco/inodes | 9.759.088.640 bytes disponíveis; 8.692.907 inodes disponíveis |

Antes de qualquer remoção futura: repetir espaço/inodes, ausência de build/npm,
estado Git e ignorados, referências operacionais, processos, hashes e os GETs acima.
Depois: exigir ausência literal dos três caminhos, ausência do worktree no registro
Git, aumento compatível de espaço/inodes, identidades/restart counts idênticos,
hashes idênticos e os mesmos GETs. Não consultar Modelos ou Campanhas nesta
verificação para evitar qualquer superfície que possa iniciar sincronização.


## Encerramento do lote autorizado

**EXECUTADO / VERIFICAÇÕES POSTERIORES PASS, conforme relato do operador.**

Fonte: relatório de execução fornecido pelo usuário nesta continuidade, após
autorização explícita limitada aos três caminhos. O horário exato da execução não
foi informado. Este registro documental não representa nova execução nem
verificação independente da VPS pelo autor desta atualização.

| Comando histórico | Resultado informado |
| --- | --- |
| `rm -r -- /home/deploy/.npm/_cacache` | exit code 0 |
| `git -C /opt/re7online/site-re7online worktree remove /opt/re7online/build-worktrees/immutable-ec2a9fde-vps-20261024T161807Z-source` | exit code 0 |
| `rmdir -- /opt/re7online/build-output/immutable-ec2a9fde-vps-20261024T161807Z` | exit code 0 |

Execução sequencial, sem falhas ou remoção parcial. Os três caminhos ficaram
ausentes e o worktree deixou de constar em `git worktree list`.

| Medida | Antes da execução | Depois da execução |
| --- | ---: | ---: |
| Espaço usado (bytes) | 72.311.345.152 | 70.869.721.088 |
| Espaço disponível (bytes) | 9.758.588.928 | 11.200.212.992 |
| Inodes usados | 1.661.781 | 1.620.681 |
| Uso do filesystem | 89% | 87% |

Ganho real informado: **1.441.624.064 bytes (aproximadamente 1,34 GiB)** e
**41.100 inodes**. A baseline imediatamente anterior à execução é distinta da
fotografia da preparação; as medições originais permanecem preservadas acima.

| Processo | PID preservado | Start ticks preservados | Restart count preservado |
| --- | ---: | ---: | ---: |
| Worker | 2233 | 17758 | 0 |
| Frontend | 118502 | 3663031 | 3 |
| API | 118102 | 3652796 | 5 |

Todos permaneceram online. Hashes informados como inalterados:

- Dump PM2: `5d9ae04d6df29856318992638a66deccd29a68719c129be47453d4fd4b757e13`.
- Marker `DEPLOYED`: `1d2be9be3fd5e257700257988bb4cd946dac0f7cb47b6b3a4f861facedd7c543`.

Health da API local e pública: `ok=true`, `db=ok`. Login local e público,
Inbox e CRM: HTTP 200. Modelos e Campanhas ficaram fora dos smokes previstos.

O operador informou zero restart, `pm2 save`, alteração de serviço, cron, backup,
dado ou chamada Meta. Backups e outputs adicionais continuam preservados; esta
conclusão não autoriza outro lote. A cópia off-host em `/tmp` observada na auditoria
não comprova custódia durável para justificar futuras exclusões.

## Continuação da classificação: backups e outputs

O total de backups permanece em 15.671.709.696 bytes. A leitura por hashes provou
duplicidade de conteúdo, sem autorizar exclusão:

| Grupo byte-idêntico | Cópias | Redundância física comprovada | Decisão |
| --- | ---: | ---: | --- |
| `automation-20260929T220203Z` / `runtime-fix-20260930T020103Z`, `content.private.tar.gz` | 2 | 461.711.466 bytes | preservar; janelas e manifests distintos |
| frontend `fa60f0f6` original / observado | 2 | 174.112.557 bytes | preservar; dependência histórica não encerrada |
| `worker-minimal-b9-v3.tar.gz` em três preparações | 3 | 224.070.718 bytes | preservar; três incidentes referenciam o payload |
| `audited-metadata.private.json` das duas janelas de retenção | 2 | 44.402.289 bytes | preservar; evidência de duas execuções |

São 904.297.030 bytes redundantes comprovados (aprox. 862 MiB). Tamanho igual sem
hash não foi classificado como duplicata. Um arquivo privado de remoções não pôde
ser lido pelo usuário `deploy`; ele permanece preservado e não foi contornado com
sudo.

A cópia off-host de manutenção continua presente em
`/tmp/converta-vps-maintenance-20261024T122126Z`. O dump PostgreSQL e o arquivo de
dados persistentes somam 573.459.123 bytes e seus hashes locais coincidem com os
sidecars autenticados na VPS. Essa custódia cobre apenas o snapshot de manutenção;
não cobre as demais preparações, snapshots ou outputs.

Nos outputs substituídos, manifesto e índice de `d7de6453`, `ef7db111`, `3630e16`
e `ec2a9fde` coincidem byte a byte com as respectivas releases. Eles permanecem
dependências da release ativa ou da cadeia de retorno, e não há cópia off-host
comprovada de seus pacotes. O output `a62da468` não coincide com a release instalada
porque houve repack posterior; ele não é duplicata comprovada. Assim, nenhum backup
ou output adicional entrou no lote pequeno.

## Cron, retenção e scripts

Foram inventariadas seis entradas não comentadas no crontab do usuário e o arquivo
`/etc/cron.d/re7-converta-backup`; nenhum conteúdo sensível foi publicado e nenhum
cron foi alterado. Nomes de scripts não foram tratados como garantia de leitura:
nenhum “dry-run” foi executado. O script de backup encontrado foi apenas hashado.
Os caminhos antigos de cleanup não existem no checkout produtivo atual.

Este documento não autoriza `prune`, `pm2 flush`, retenção, limpeza de mídia,
alteração de cron, remoção de worktree ou cache.
