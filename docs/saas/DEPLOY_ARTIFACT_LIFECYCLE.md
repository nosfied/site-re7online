# Ciclo de vida dos artefatos de implantação

Esta é a fonte canônica para capacidade, classificação e encerramento de gerações
de build. Ela não autoriza exclusão. A ativação continua regida pelo
[runbook de deploy](DEPLOY_RUNBOOK.md), e dados, backups e mídias seguem contratos
próprios.

## Contrato antes do build

`scripts/converta-release.py build` exige `--capacity-contract` apontando para um
JSON privado, regular, `0600`, do mesmo owner do processo. O contrato é fechado e
vinculado a `targetCommit` e `releaseId`. Ele declara:

- crescimento máximo do worktree durante instalação e compilação;
- tamanho do payload de runtime;
- pico temporário de tar e compressão;
- extração independente de verificação;
- evidência privada de falha;
- reserva operacional em bytes;
- pico e reserva de inodes.

O produtor mede bytes e inodes disponíveis no filesystem no início e soma todas as
parcelas, de forma conservadora. Repositório, saída e `filesystemPath` precisam
estar no mesmo device. Reserva insuficiente resulta em `capacity_bytes` ou
`capacity_inodes` antes da criação da saída e antes do primeiro `npm`.

Exemplo estrutural, com valores a serem medidos e revisados para cada geração:

```json
{
  "schemaVersion": 1,
  "contractId": "capacity-immutable-example",
  "capturedAtUtc": "2026-10-25T00:00:00Z",
  "targetCommit": "0000000000000000000000000000000000000000",
  "releaseId": "immutable-example",
  "filesystemPath": "/opt/re7online",
  "buildWorkspaceGrowthBytes": 1,
  "runtimePayloadBytes": 1,
  "packageTemporaryBytes": 1,
  "independentVerificationBytes": 1,
  "failureEvidenceBytes": 1,
  "operationalReserveBytes": 1,
  "peakInodes": 1,
  "operationalReserveInodes": 1
}
```

Os valores mínimos do exemplo mostram apenas tipos e não constituem orçamento
produtivo. Todos os orçamentos precisam ser positivos, medidos e revisados.

Depois que a reserva passa, o produtor mantém
`generation-lifecycle.private.json`, modo `0600`, fora do pacote. O estado é
`BUILDING`, `FAILED` ou `COMPLETE`; conclusão e falha ficam com classificação
`PENDING` até a revisão pós-janela. O registro contém somente identidades, caminhos,
hashes e capacidade, sem ambiente ou segredo. `FAILED`, `COMPLETE` ou uma geração
substituída exigem classificação imediata como host obrigatório, custódia off-host
verificada ou pendência. Substituição nunca equivale a autorização para retirar.

## Relatório pós-janela

`scripts/operational-retention-report.py` continua sem modo de aplicação. Além do
inventário por inode, ele aceita:

- catálogo privado `0600` de gerações, com estado, raízes, referências operacionais
  e custódia;
- comparações literais `SOURCE::DESTINATION`;
- orçamento explícito de bytes para hashing.

A comparação inclui caminho relativo, tipo, modo, tamanho, SHA-256 de arquivo e
destino textual de symlink, incluindo tipo e modo da própria raiz. Origem e destino
são revalidados integralmente depois das duas leituras; adição, remoção, substituição,
renomeação, leitura incompleta ou drift de identidade negam a prova. Diferenças
estáveis são separadas por atributo.

A execução exige exclusão de escritores para ambas as árvores durante todo o
intervalo: nenhum build, extração, promoção, cache runtime, processo com escrita ou
limpeza pode alcançar as raízes comparadas. A varredura comum não é snapshot atômico;
a revalidação detecta drift observado, mas não substitui filesystem snapshot nem
isolamento de escritores. O relatório calcula espaço pendente por geração, mas mantém
`withdrawalEligible=false`: decisão, allowlist literal, revalidação e autorização
continuam externas.

## Inventário consolidado de 25/10/2026

Leitura limitada, sem exclusão ou mutação. O filesystem tinha 82.086.711.296 bytes,
70.972.801.024 usados e 11.097.133.056 disponíveis; 1.620.730 inodes usados. A
fotografia detalhada privada foi preservada fora do Git.

| Raiz | Gerações observadas | Alocado | Classificação atual |
| --- | --- | ---: | --- |
| `/opt/re7online/releases` | 52 entradas de primeira ordem, incluindo releases/runtimes, incoming, staging e `failed-preparations` | 28.691.599.360 B na medição ampla anterior | ativa, retornos, históricos e pendências misturados; nenhuma retirada ampla |
| `/opt/re7online/build-output` | `a62da468` principal/repack, `ec2a9fde`, `ef7db111`, `3630e16`, `d7de6453` e três logs privados | 5.830.348.800 B | payloads redundantes e pacotes/evidências a separar |
| `/opt/re7online/build-worktrees` | `a62da468`, `3630e16`, `d7de6453` | 3.069.857.792 B | todos têm conteúdo ignorado; revisão pendente |
| `/opt/re7online/release-sources` | `freeform-window-af26`, `freeform-window-af26-cumulative-20261002` | 2.009.829.376 B | histórico com referências transitivas; preservar |
| `/opt/re7online/deploy-control` | `3870`, `3a87`, `5ea7`, `6e10`, `6f0d`, `7e96`, `90f0`, `b61e`, `ef7db111-prep` | 1.612.713.984 B | controles antigos e um worktree com artefatos ignorados; revisão pendente |
| `/opt/re7online/staging` | ausente | 0 B | nenhum staging nesta raiz |
| `releases/failed-preparations` | Prisma ausente, heap OOM, `a62da468` sem uploads da dependência | 1.728.606.208 B | evidências e conteúdo único ainda sem custódia completa |

O inventário nominal de `releases` inclui as famílias históricas `b66`, `ba66`,
`879`, `af26`, `afbb`, `b9`, `9f4c`, `fa60`, campanhas preventiva/dinâmica/result
truth/eligibility, CRM CSV/Contacts, segurança, worker, `normal-f5028`,
`immutable-f5028`, `c085`, `5c339`, `e2e7`, `a62da468` externo e VPS, `ec2a9fde`,
`ef7db111`, `3630e16` e `d7de6453`. Nome, idade e tamanho não classificaram nenhuma
delas como dispensável.

Lista fechada das entradas de primeira ordem observadas (prefixos `.incoming` e
`.staging` mantidos):

```text
releases:
  .DEPLOYED.immutable-ec2a9fde-vps-20261024T162005Z.tmp
  .incoming-immutable-5c339b2e-20261022T125717Z.tar.xz
  .incoming-immutable-5c339b2e-20261022T125717Z.tar.xz.sha256
  .incoming-immutable-a62da468-20261024T112857Z.tar.xz
  .incoming-immutable-c085e53f-20261021T094952Z
  .staging-immutable-ec2a9fde-vps-20261024T162005Z-20261024T164600Z
  3227b2d752110873f0eff4ee5253a6f06ca51549-front
  879cb1faa88493cd78dd789b71f85043d6c8ff9c-api
  9f4cbe0f9a4e891f09bb2f41e88eccec388172da-front
  af26f48a9c309b24ec4d23cfa97cc1e407c09d98-api
  af26f48a9c309b24ec4d23cfa97cc1e407c09d98-front
  afbb7455f320793e05a25875e8a5f13f98cabf90-api
  b66bb89aca9112277463b7d2adbee0b9e7831157-api
  b9b58177880e729854580def1180f3edb2fb83e8-api
  ba66c24112ccb10f2dfdcced54350f513d399bc6
  campaign-dynamic-5b3cf3af-20261012T170000Z
  campaign-dynamic-compatible-return-5b3cf3af-20261012T170000Z
  campaign-eligibility-recovery-final-reviewed-20261008
  campaign-preventive-a26-20261011T002421Z
  campaign-result-truth-2ed9dccc-20261011T184000Z
  credential-rotation-obs2-20261018T190417Z
  crm-contacts-list-recovery-f5028de1-20261019T201659Z
  crm-csv-24e5857f-20261016
  crm-csv-front-ea3d2788-20261016
  crm-csv-front-return-d41ddd64-20261016
  crm-csv-recovery-d7d37c4f-20261017T233455Z
  crm-csv-recovery-d7d37c4f-20261017T233455Z-r2
  crm-csv-terminal-reentry-b8cc113d-20261018T143000Z
  crm-csv-ux-phone-normalization-36dacbc8-20261018T122527Z
  crm-csv-ux-phone-normalization-36dacbc8-20261018T122527Z-r2
  fa60f0f6443f3e0a129dc707021cffdc408af817-front
  fa60f0f6443f3e0a129dc707021cffdc408af817-front-css-17bd5fb8
  frontend-dynamic-5b3cf3af-20261012T170000Z
  immutable-3630e16-vps-20261024T195842Z
  immutable-5c339b2e-20261022T125717Z
  immutable-a62da468-20261024T112857Z
  immutable-a62da468-vps-20261024T124726Z
  immutable-c085e53f-20261021T094952Z
  immutable-d7de6453-vps-20261024T221500Z
  immutable-e2e7f17a-20261022T005110Z
  immutable-ec2a9fde-vps-20261024T162005Z
  immutable-ef7db111-vps-20261024T174000Z
  immutable-f5028de1-20261020T181603Z
  incoming
  normal-f5028de1e530
  security-epoch-v3-36f51ebe-20261015T001500Z
  worker-bf5f1d76-f06d49cb-91230f88-b66bb89a
  worker-bf5f1d76-f06d49cb-91230f88-b66bb89a-af26-window
  worker-minimal-hybrid-b9b58177-20261004
  worker-minimal-hybrid-b9b58177-verified-v3
  worker-minimal-reactive-afbb7455-verified
failed-preparations:
  immutable-a62da468-vps-20261024T124726Z-missing-openai-uploads-preserved
  normal-f5028de1e530-20261020T145324Z-missing-prisma-generate
  normal-f5028de1e530-20261020T160000Z-node-heap-oom
build-output:
  immutable-a62da468-vps-20261024T124726Z
  immutable-a62da468-vps-20261024T124726Z-repacked-uploads-fix
  immutable-ec2a9fde-vps-20261024T162005Z
  immutable-ef7db111-vps-20261024T174000Z-producer
  immutable-3630e16-vps-20261024T195842Z-producer
  immutable-d7de6453-vps-20261024T221500Z-producer
build-worktrees:
  immutable-a62da468-vps-20261024T124726Z-source
  immutable-3630e16-vps-20261024T195842Z-source
  immutable-d7de6453-vps-20261024T221500Z-source
release-sources:
  freeform-window-af26
  freeform-window-af26-cumulative-20261002
deploy-control:
  3870e6d140af  3a87c7e095fa  5ea7fa45a369  6e10975e5f28
  6f0d741581da  7e968da706c3  90f04d8f2e47  b61e42035c0d
  ef7db111-prep
```

### Referências vigentes reconstruídas

- API e frontend vivos e `/current` usam
  `immutable-d7de6453-vps-20261024T221500Z`.
- O worker vivo usa `immutable-e2e7f17a-20261022T005110Z`.
- O retorno imediato da API é `immutable-3630e16-vps-20261024T195842Z`; o retorno
  do frontend é `immutable-ec2a9fde-vps-20261024T162005Z`. A cadeia transitiva
  `ef7db111`, `a62da468-vps` e `5c339b2e` permanece protegida.
- PM2 live e dump salvo apontam para os mesmos caminhos estáveis/worker físico. O
  dump regular `0600` tinha SHA-256
  `5d9ae04d6df29856318992638a66deccd29a68719c129be47453d4fd4b757e13`.
- `pm2-deploy.service` está ativo e usa `pm2 resurrect`; Nginx não referencia uma
  geração física. Nenhum lock de implantação estava mantido no instante da leitura.
- API local/pública respondeu `ok=true`, `db=ok`; Login local/público, Inbox e CRM
  responderam HTTP 200. Nenhum endpoint de sincronização foi usado.

Relatórios e transações históricas foram preservados como evidência. Uma referência
textual histórica não converte, por si, um payload executável em dependência ativa.

### Classificação de custódia

| Classe | Escopo comprovado nesta auditoria | Condição |
| --- | --- | --- |
| Preservar | release viva `d7de6453`, worker `e2e7f17a`, retornos `3630e16` e `ec2a9fde`, cadeia transitiva de retorno, PM2 live/saved, configurações privadas, PostgreSQL/volumes, mídias, dados de tenants, backups, journals e evidências | dependência operacional ou custódia/restauração ainda necessária |
| Arquivar | preparações falhas, worktrees com conteúdo ignorado, controles antigos e outputs substituídos fora do primeiro lote | somente após inventário de conteúdo único, destino off-host durável e ensaio de restauração; nenhuma movimentação foi autorizada |
| Remover após autorização | exclusivamente os quatro runtimes duplicados do primeiro lote abaixo | equivalência integral, ausência de referência operacional e revalidação imediatamente antes da retirada |

`node_modules` duplicado não exige custódia integral por padrão quando seu payload
instalado equivalente permanece autenticado; qualquer byte único detectado volta para
“Arquivar” ou “Preservar”. Manifestos históricos nunca são alterados para refletir a
retirada de uma cópia redundante.

## Primeiro lote — preparação histórica e execução relatada

A preparação abaixo é histórica; o resultado posterior está no encerramento desta
seção. Os comandos não devem ser repetidos.

Os quatro caminhos abaixo contêm runtimes cujo conteúdo de origem está integralmente
contido na release instalada de `ec2a9fde`. Isso não significa igualdade irrestrita:
os stagings diferem nos modos, e o frontend instalado contém seis entradas adicionais
de cache runtime. Os wrappers, pacote, manifesto, índice e demais evidências ficam
preservados:

| Caminho literal | Alocado | Referências | Prova | Decisão proposta |
| --- | ---: | --- | --- | --- |
| `/opt/re7online/build-output/immutable-ec2a9fde-vps-20261024T162005Z/immutable-ec2a9fde-vps-20261024T162005Z/api-runtime` | 337.059.840 B | nenhuma referência live/saved/boot/Nginx/cron/helper | 8.197 entradas; conteúdo e metadados iguais à release instalada | remover após autorização |
| `/opt/re7online/build-output/immutable-ec2a9fde-vps-20261024T162005Z/immutable-ec2a9fde-vps-20261024T162005Z/frontend-runtime` | 645.025.792 B | nenhuma referência operacional | 26.149 entradas; todas contidas na release instalada; seis entradas adicionais nela são cache de imagem criado em runtime | remover após autorização |
| `/opt/re7online/releases/.staging-immutable-ec2a9fde-vps-20261024T162005Z-20261024T164600Z/immutable-ec2a9fde-vps-20261024T162005Z/api-runtime` | 337.059.840 B | staging já promovido; nenhuma referência operacional | conteúdo das 8.197 entradas integralmente contido; zero divergência de tipo/tamanho/SHA/symlink e 8.187 diferenças de modo explicitadas | remover após autorização |
| `/opt/re7online/releases/.staging-immutable-ec2a9fde-vps-20261024T162005Z-20261024T164600Z/immutable-ec2a9fde-vps-20261024T162005Z/frontend-runtime` | 645.025.792 B | staging já promovido; nenhuma referência operacional | conteúdo das 26.149 entradas integralmente contido; zero divergência de tipo/tamanho/SHA/symlink, 26.118 diferenças de modo e seis caches adicionais no destino vivo | remover após autorização |

Potencial literal: **1.964.171.264 bytes alocados**. A release instalada de retorno,
o pacote de transporte, seus hashes e os quatro arquivos de metadados soltos ficam
intactos. Os worktrees não entram: `tracked-clean` não cobre `.next`, `node_modules`
e `dist` ignorados, cuja classificação ainda está pendente.

Comandos históricos do lote, sem curingas — **não repetir**:

```bash
rm -r -- /opt/re7online/build-output/immutable-ec2a9fde-vps-20261024T162005Z/immutable-ec2a9fde-vps-20261024T162005Z/api-runtime
rm -r -- /opt/re7online/build-output/immutable-ec2a9fde-vps-20261024T162005Z/immutable-ec2a9fde-vps-20261024T162005Z/frontend-runtime
rm -r -- /opt/re7online/releases/.staging-immutable-ec2a9fde-vps-20261024T162005Z-20261024T164600Z/immutable-ec2a9fde-vps-20261024T162005Z/api-runtime
rm -r -- /opt/re7online/releases/.staging-immutable-ec2a9fde-vps-20261024T162005Z-20261024T164600Z/immutable-ec2a9fde-vps-20261024T162005Z/frontend-runtime
```

Antes: revalidar ausência de build/npm e descritores/CWD/mapas nos quatro caminhos,
grafo live/saved/current/boot, pacote/manifest/index, lock, espaço/inodes, PIDs/start
ticks/restart counts, dump/marker e GETs seguros. Depois: exigir ausência literal
dos quatro caminhos, preservação dos wrappers e metadados, ganho compatível,
identidades e hashes inalterados e os mesmos GETs. Parar na primeira divergência ou
falha; nenhuma alternativa, força ou prune.


### Encerramento relatado pelo operador

**EXECUTADO INTEGRALMENTE / VERIFICAÇÕES PASS, conforme relatório do usuário.**

Lote: `retention-ec2a9fde-redundant-runtimes-20261025`. O usuário informou execução
sequencial dos quatro comandos com exit code 0, ausência dos quatro caminhos,
zero repetição automática, nenhuma expansão de escopo e nenhuma execução parcial.
O horário exato não foi informado. Esta atualização documental não equivale a
leitura independente do recibo privado ou da VPS.

| Medida | Resultado informado |
| --- | ---: |
| Recuperação prevista | 1.964.171.264 bytes |
| Recuperação efetivamente medida | 1.964.130.304 bytes |
| Diferença entre previsão e medição | 40.960 bytes |
| Inodes recuperados | 68.696 |
| Recuperação somada ao lote anterior de cache/worktree | 3.405.754.368 bytes |

A diferença de 40.960 bytes fica registrada sem atribuição causal não demonstrada.
O total acumulado é a soma dos ganhos relatados nos dois lotes, não uma medição
atual de espaço disponível.

API (PID 118102, start ticks 3652796), frontend (PID 118502, ticks 3663031) e worker
(PID 2233, ticks 17758) foram informados como preservados; health local/público e
smokes GET-only passaram. Dump PM2, marker ativo, release instalada de retorno,
pacote, manifesto e índice permaneceram preservados, conforme relato. Os restart
counts posteriores não foram reapresentados no relatório.

O operador informou nenhuma alteração de restart, `pm2 save`, deploy, serviço,
cron, backup, dado ou chamada Meta. A existência de recibo privado e manifesto de
execução foi relatada, mas seus conteúdos não foram acessados nesta atualização.

**Pendências de encerramento:** confirmar liberação do lock canônico e custódia
durável privada do recibo, manifesto e diagnósticos. Os caminhos de evidência
informados pelo operador eram temporários; sua existência não prova custódia durável.
Não liberar lock pertencente a outra operação e não repetir os comandos consumidos.

### Próxima revisão autorizada — outputs ef7db111 e 3630e16

Escopo somente de comparação e preparação; nenhuma nova exclusão foi autorizada.

| Origem a conferir | Destino preservado a conferir |
| --- | --- |
| `/opt/re7online/build-output/immutable-ef7db111-vps-20261024T174000Z-producer/immutable-ef7db111-vps-20261024T174000Z` | `/opt/re7online/releases/immutable-ef7db111-vps-20261024T174000Z` |
| `/opt/re7online/build-output/immutable-3630e16-vps-20261024T195842Z-producer/immutable-3630e16-vps-20261024T195842Z` | `/opt/re7online/releases/immutable-3630e16-vps-20261024T195842Z` |

Os caminhos compostos acima são alvos de descoberta baseados no layout do produtor;
sua existência, identidade e ausência de symlinks precisam ser verificadas no host.
Comparar separadamente `api-runtime` e `frontend-runtime`, sem incluir pacote,
metadados, logs ou wrappers como candidatos de remoção. A coincidência já relatada
de manifesto/índice não substitui comparação integral atual.

Aplicar o comparador corrigido, exclusão de escritores nas duas árvores, orçamento
de leitura e revalidação de estabilidade. Provar referências e dependências em duas
amostras frescas, contar blocos únicos e explicitar diferenças de modo/cache.
Preservar a release de retorno imediato da API `3630e16` e a cadeia transitiva
`ef7db111`. Produzir lista literal e ganho comprovado para revisão separada.
Qualquer lacuna, mudança ou ambiguidade mantém a classificação pendente.

## Auditoria das duas entradas de `backup-data.sh`

O crontab do usuário `deploy` contém duas linhas byte-equivalentes para 03:15. Ambas
chamam `apps/whatsapp-agent/scripts/backup-data.sh` e escrevem no mesmo log. O script
usa o mesmo `flock`, de modo que uma execução tende a trabalhar e a outra encerra
como `already running`; isso não justifica manter a duplicidade e não prova que ela
seja inofensiva em toda condição de agendamento.

Correção proposta para uma janela própria: preservar cópia autenticada do crontab,
remover exatamente uma das duas linhas idênticas, validar que reste uma ocorrência e
observar o próximo ciclo. Não alterar o script nem executar backup para testar. A
retenção destrutiva de 14 dias existente no script é um contrato separado e não pode
ser acionada por esta auditoria. Nenhuma alteração de cron foi feita nesta etapa.
