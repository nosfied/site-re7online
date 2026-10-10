# Capacidade — ação mínima proposta, NÃO AUTORIZADA / NÃO EXECUTADA

Conclusão atual: **CAPACITY DENY**. O dry-run READ ONLY não demonstra capacidade de commit/ack ou de continuidade do atendimento. Fonte quantitativa: [CAPACITY_REVIEW.json](CAPACITY_REVIEW.json). Não executar cleanup, prune, retenção, exclusão WAL ou alteração de infraestrutura/configuração para satisfazer o gate.

## Margem e limites do orçamento

PGDATA `/var/lib/postgresql/data` e `pg_wal` resolvem no volume Docker `/var/lib/docker/volumes/postgres_wa_agent_pgdata/_data`, no mesmo `/dev/vda1` do ledger `/var/lib/re7/campaign-operations/state.json`. Nenhum tablespace externo, WAL não é symlink para outro disco. `postgres` UID70 e `deploy` UID1000 têm aproximadamente 455–461MiB disponíveis; blocos reservados ao root não entram no orçamento. Inodes: ~6,86 milhões livres. Sem alteração de permissões ou leitura por papel/IP como prova de capacidade.

WAL atual80MiB/5segmentos16MiB; min80MiB, max_wal_size1024MiB **flexível**, checkpoint300s, archive_modeoff, sem slots/replicação observados. `max_slot_wal_keep_size=-1` não causa retenção agora porque não existem slots; isso não garante estado futuro. Não foi encontrada retenção por slot/archive como causa do consumo. PGDATA ~684MiB alocados; a causa dominante legível são **22,9GiB de preparações históricas**, e não WAL.

Duas amostras SQL a 340,443517s de distância: WAL+15.885.063bytes, ~46.660bytes/s (~160,2MiB/h); stats_reset iguais. O espaço líquido **aumentou**6.524.928bytes no intervalo: geração de WAL não é crescimento líquido do filesystem, e amostra curta não limita burst ou operações futuras. Nenhum erro de escrita no log PG delimitado desde15:00UTC/tail1500 ou nos últimos4MiB de cada log PM2 ativo; kernel/outros logs ilegíveis não foram atestados. Ausência de erro não é margem.

Orçamento conservador **proposto para revisão**, sem alterar configuração/gates:

| Parcela | Reserva |
|---|---:|
|Piso da rotina vigente `/usr/local/sbin/re7-converta-backup` (`MIN_FREE_MB=1024`)|1.024MiB|
|Possível expansão do WAL80→1024MiB até seu alvo flexível|944MiB|
|Apply SQL de8alterações lógicas + locks Client/batch/job, índices/TOAST/FPI|64MiB de planejamento|
|Ack/ledger: temporário + rename/fsync e diagnóstico|1MiB de planejamento|
|Total / arredondamento para revisão|2.033MiB / **2GiB**|

Apply:1Outbound,5eventos obrigatórios,1recibo,1counter Campaign; schema atual tem9/6/5índices em Outbound/Event/Campaign, sem triggers custom nessas relações. **O WAL do apply não foi medido nem tem teto64MiB comprovado**; não executar recuperação produtiva ou repetir restore/apply sintético para inventar tal prova. O orçamento é um piso conservador, não certificado absoluto de carga. Ledger atual e payloads são pequenos, mas a escrita exige espaço/inode/fsync reais.

Contra esse piso faltam **1.648.414.720bytes** (disponível483.340.288); contra2GiB faltam1.664.143.360bytes. Mesmo desconsiderando a operação, o livre é menor que o piso1GiB do backup e a expansão potencial944MiB do WAL. Portanto não é necessário supor um pico para negar a capacidade atual. Backup fresco off-host e restauração isolada continuam válidos como provas históricas; não substituem espaço para commit atual.

Cron vigente: snapshot02:40UTC; backups data03:15 e PG03:20, com retenções14dias/7daily+4weekly+3monthly nos próprios subdiretórios. Script de snapshots usa rsync/link-dest e descarta somente `snapshots`, **não `preparations`**. `.data` atual~17,4MiB e backup SQL desta rodada33,3MiB; conteúdos externos do snapshot podem acrescentar dados. Não prometer que piso2GiB cobre todos os picos/backup futuros sem reconferência. Não reduzir retenção nem executar rotina que apaga snapshots às cegas.

## Candidatos concretos e preservação

Cinco cópias físicas independentes, `nlink=1`, cada uma479.460.086bytes/479.465.472bytes alocados, SHA-256 igual **`4c2fb0caf834ce0c2c9e628c82bf80bba669effd68ea521245a936cfc34c6810`**. Localizam-se na preparação consumida:

`/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-campaign-eligibility-scheduled-20261008T174500Z/window/`

Manter no host **`content.private.tar.gz`**. Propor preservação off-host e retirada **somente** destas quatro cópias redundantes, com autorização posterior própria:

1. `backup-bindings-pre-postack-20261008T190208Z/window/content.private.tar.gz`
2. `postack-backup-20261008T190208Z/backup/content.private.tar.gz`
3. `postack-backup-20261008T202538Z/backup/content.private.tar.gz`
4. `backup-bindings-pre-postack-20261008T202538Z/window/content.private.tar.gz`

Projeção de liberação: **1.917.861.888bytes (~1,786GiB)**; livre projetado2.401.202.176bytes (~2,236GiB). Isso não é liberação executada ou garantia contra descritor aberto. Não remover diretórios, manifests, ledger, capturas, releases, tar candidato/retorno, dump fresco, configurações ou scripts; não deduplicar via hardlinks que acoplem gravações futuras de evidências.

As referências diretas desses quatro caminhos em saved/fallback não apareceram; nenhum FD legível os apontou. **143 processos ficaram ilegíveis ao deploy**: não há prova global de ausência de proprietário. A política root instalada também não foi lida integralmente nesta frente. Portanto **não autorizar remoção apenas por estas leituras**.

Sequência necessária antes de qualquer limpeza, para decisão do owner/operador:

1. Leitura root delimitada desses caminhos e seus proprietários/FDs, duas amostras completas; conferir política/manifests vigentes e ausência de referências executáveis ou futuras exigidas. Não usar o observador de sockets para afirmar fatos que ele não fornece sobre arquivos regulares. Nenhuma nova delegação instalada.
2. Transferir um blob de conteúdo idêntico para diretório privado off-host novo, registrar índice para TODOS os caminhos originais com SHA, owner/mode/mtime/inode/nlink/tamanho e validar tar+extração isolada. Preservar journals/manifests que referenciam os caminhos originais. Pelo conteúdo idêntico, um blob+índice conserva as quatro cópias sem4transferências; exigências adicionais do owner podem pedir cópias redundantes separadas.
3. Revisão/autorização específica dessa lista, sem glob. Antes de retirar cada cópia, revalidar hash/metadados/proprietários e arquivo off-host; drift nega. Sem reaproveitar atestado de FD ou permitir arquivo diferente.
4. Após eventual retirada autorizada, medir bytes efetivamente disponíveis aos executores e verificar atendimento/PG/ledger; reconfirmar crescimento/carga/cron e orçamento antes de reavaliar CAPACITY. A liberação projetada não é PASS antecipado.
5. Só depois decidir SQL/ack separadamente. Sem mudança de guard37, tarefa/job, retenção, backup schedule, provider ou releases.

Esta rodada **não transferiu nem removeu esses arquivos**. Sem comandos de exclusão automática. Se referência/proprietário impedir retirar cópia, preservar a negativa e revisar outro destino isolado ou capacidade adicional; não romper o vínculo para ganhar espaço.

## Atualização dcbeea48 — preservação concluída, retirada ainda não executada

Os parágrafos anteriores registram a captura histórica. A leitura root V2 agora completou duas amostras sem proprietários/incompletudes; políticas/manifests/referências identificadas foram conferidos, e blob+índice dos cinco caminhos foram preservados off-host com extração isolada. Ver [resultado completo](STORAGE_PRESERVATION_RESULT.json) e [relatório único](README.md#continuidade-dcbeea48--ambiente-observação-root-e-preservação-off-host). Nenhum arquivo foi excluído.

[Comandos concretos de retirada para revisão](WITHDRAWAL_FOR_REVIEW.txt): somente quatro caminhos, cópia principal e todos os manifests/evidências preservados. Dependem de autorização própria, custódia off-host reconfirmada e observações frescas, sem adaptar bindings. Capacidade continua DENY:475.422.720bytes livres na última leitura;1.917.861.888bytes é liberação projetada. Nenhum apply/ack/abertura decorre da decisão sobre armazenamento.
