# Terceiro lote — consumido, retirada parcial e recusa observacional

**CONSUMED / PARTIAL DENY / NOT CERTIFIED.** Autorização do owner para os23 literais
publicados em5f6afb48; geração retention-third-files-final-20261014T050000Z,
driver e1380546/input77503f96/certifier79ebff3e originais. Uma chamada B, sem replay,
sem alterar input/bindings/helpers/políticas. Fonte: diagnósticos e sidecar próprios,
[resultado sanitizado](THIRD_WITHDRAWAL_RESULT.sanitized.json) e
[ciclo de vida](THIRD_LIFECYCLE.sanitized.json).

## Resultado e causa comprovada

A0: hashes off-host do manifesto d50c06e1, tar d34fd3a2 e índice v2 eb2b7f05 PASS;
prova de extração reutilizada. A1: POST_READ_COMPLETE,23 presentes,drift0,
owners0/incomplete0,sem intent/recibo, mínimo deploy/PG10.529.071.104B.

B retirou **20 arquivos /8.130.785.280B alocados** e negou antes do21º.
Intent11:03:13.688UTC (08:03:13.688Fortaleza); parcial11:11:19.845UTC
(08:11:19.845Fortaleza), intervalo486,157s. Este intervalo não inclui todo o preflight
inicial; duração total de B não foi capturada pelo bloco do owner.

Motivo registrado: ObservationDenied em root_owner_or_incomplete; observação com
**zero owners e uma incompletude**: PID529658, etapa stat_before, leitura de
`/proc/529658/stat`, FileNotFoundError/errno2, sem start ticks ou FD disponíveis.
Não é evidência de arquivo em uso. É evidência de leitura incompleta, corretamente
recusada pelo contrato. Origem/identidade desse processo e circunstância histórica
específica não foram provadas; não atribuir a SSH, SQL, serviço ou executor por
semelhança temporal. Não foi ignorado processo nem relaxada negativa/retry.

C passou às11:11:39.353UTC/08:11:39.353Fortaleza:3 presentes,drift0,
owners0/incomplete0, mínimo18.661.822.464B. A observação posterior completa não apaga
a negativa anterior nem autoriza completar B. **Sem recibo WITHDRAWAL_COMPLETE; o
certificador não foi executado pela condição B/C, não há certificado exato de23.**
Intent/journal20/parcial/DENY preservados; geração consumida não pode ser reexecutada.

## Três remanescentes — manter, não executar retirada

- `/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-hybrid-b9-capture-20261005T143500Z/window/worker-minimal-b9-v3.tar.gz`
- `/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-hybrid-b9b58177-absent-20261005T121000Z/window/worker-minimal-b9-v3.tar.gz`
- `/opt/re7online/backups/converta-persistent/preparations/automation-20260929T220203Z/content.private.tar.gz`

685.793.280B alocados permanecem nesses três. A autorização desta execução única não
permite replay/manual unlink. Próximo passo de retenção, se solicitado: preparação
nova exclusiva destes três, observação revisável e decisão própria. Nenhum novo
comando de exclusão foi criado. Não classificar como WITHDRAWAL_COMPLETE.

## Capacidade e preservação

Aumento líquido A1→C8.132.751.360B; difere da alocação retirada por atividade normal
concorrente/metadados. O número8.130.785.280B vem dos20 inodes únicos,nlink1,journal
exato e ausência constatada; não é soma de tamanhos aparentes de dependências.

Reconferência11:22:51/53UTC,08:22:51/53Fortaleza: mínimo deploy/PostgreSQL
**18.659.729.408B**, ambas amostras acima do piso deste lote6.468.665.344B.
CAPACITY PASS para o contrato de retirada, não orçamento universal de cifragem.
WAL80MiB nas duas amostras,slots0,archiveoff,HBA preservado; healthok/DBok;
nenhum erro de escrita nos padrões storage-write/PANIC do container PG em30min.
Essa consulta não certifica ausência de qualquer erro de aplicação.

C/reader atual confirmaram11 principais por hash/owner/modo,109 links protegidos,
API410272/worker410428/frontend188897/daemon18676, NEWauth+NEWDB, dumps600,
cron/boot/supervisão,gatesfalse,guarda38 fechada sem marker/tarefa. Leituras SQL
READ ONLY delimitadas com timeouts e read models canônicos: out.15Cancelada,
seis entregas reportadas/cinco não enviadas,pending0/failed0,sem duplicação.
CRM/usage/disposição/Outbounds foram lidos por fingerprints/counters, sem mutação;
isto não prova igualdade de todo o DB durante atividade concorrente. Owner confirmou
sessão/Inbox/CRM/Campanhas somente em leitura. Nenhum envio/restart/rotação/abertura.

## Custódia e classificação

89 arquivos de execução/diagnósticos/leituras/base atual/instruções de segurança em
custódia privada permanente do owner: retention-third-execution-20261014T105622Z,
dirs700/files600; manifesto0df05c1859e4ec086085f70b0ae3ba419ff8f0d30c7e41de5503083a3bcf959f
conferido. Uma réplica física off-host; cópias na mesma máquina não são backups
independentes. Custódia dos10 conteúdos/34 originais e extração anteriores intactas.
Nenhum manifest histórico reescrito; índice/sidecar de retirada próprios.

-20 retirados: conteúdo e metadados já arquivados, não reconstruir no host por rotina.
-3 restantes/11 principais/ativos/retornos/dependências: HOST_REQUIRED, sem novas exclusões.
-Controles/manifests/journals/intent/parcial/diagnósticos: preservar host e evidências off-host.

Responsável Deifson; revisão local/operacional14/10,próxima21/10 ou antes após mudança.
Adapters futuros não foram instalados/acionados; nenhum cron/prune/limpeza automática.
Segurança externa/cifragem **OPEN**: [preparação retomada](../SECURITY_REMAINING_PREPARATION_2026-10-14.md).
