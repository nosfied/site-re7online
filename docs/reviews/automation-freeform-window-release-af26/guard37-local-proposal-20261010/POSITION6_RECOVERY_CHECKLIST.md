# Posição .6 — checklist único para qualquer recuperação/ack futuro

**LOCAL A/B/C VERIFIED; OPERATIONAL DRY-RUN PASS / CAPACITY DENY / BLOCKED FOR PRODUCTIVE APPLY/ACK.** [Implementação aprovada somente para revisão local](../position6-recovery-implementation-20261010/README.md); [decisão histórica exata](../../../saas/POSITION6_HISTORICAL_CRM_DISPOSITION_2026-10-10.md). Atualizado pela [auditoria produtiva READ ONLY atual](../position6-current-audit-20261010/README.md), continuidade de400b8b4b. Fontes/hash em [PROVENANCE.json](../position6-current-audit-20261010/PROVENANCE.json); [estado/fences](../position6-current-audit-20261010/STATE.json). A tabela anterior de400b permanece no histórico Git; provas sintéticas e capturas antigas não foram convertidas em estado atual.

## Revisão operacional restante — 23:05–23:11UTC / 20:05–20:11Fortaleza

[Relatório atualizado](../position6-operational-preparation-20261010/README.md): drivers sanitizados/reversíveis e receita/grafo disponibilizados, hashes preparados íntegros. Capacidade **DENY**, PGDATA/WAL/ledger no mesmo disco com455–461MiB executáveis, abaixo do piso1GiB da rotina vigente. Orçamento proposto2.033MiB, déficit1.648.414.720bytes; não é hard bound do apply/carga. Reutilizados backup/restore/CLI/provas válidas, sem rebuild ou nova execução SQL/ack. Estado atual guarda37/tarefa/job/ref/hash/protegidos/processos/staging mantidos.

Ação mínima proposta: preservar off-host conteúdo/metadados e retirar futuramente quatro cópias idênticas antigas, liberando estimados1,786GiB; **nenhuma remoção autorizada/executada**. Referências/proprietários não inteiramente observados (143PIDs ilegíveis/política root): leitura privilegiada específica e revisão/decisão antes de cleanup. Não limpar WAL/leases/tarefa nem modificar retenção. SQL/ack continuam bloqueados; backup antigo não cobre writes posteriores automaticamente. Frontend3227/prevençõesAPI preservados/pendentes.

## Pré-condições operacionais atuais — 10/10, 22:43–22:56 UTC

**READ ONLY / BACKUP-RESTORE / PRODUCTIVE DRY-RUN PASS; NOT APPLIED / NOT ACKNOWLEDGED.** [Resultado consolidado](../position6-operational-preparation-20261010/README.md). Esta seção atualiza a condição operacional; as capturas e provas locais/históricas abaixo continuam datadas, sem substituir fonte ausente.

| Requisito atual | Resultado / limite |
|---|---|
|Fences/ref/hash/processos|Closed37/provider-persisting/ref/taskHash, parent ausente; ledger consistente antes/depois, lock/.uncertain ausentes. APIa26/workerafbb/frontendfa60/daemon mesmos PID/start ticks/restart0. Não é drain nem certificado de callback vivo|
|Fontes/protegidos|Input original SHA d5d8dba7…19b, sem syntheticProofPolicy; seed/snapshot/log/JSON/aceitação/SENT/DELIVERED e conta originais verificados pelos hashes aprovados. Cinco Outbounds e quatro coleções WebCRM íntegros; .6 sem Outbound/usage/recibo e .7–.11 sem submissão observada|
|Backup/restore|Dump fresco 22:47UTC, c25cd5ef…903c; PostgreSQL local16.15, 70 tabelas e hashes protegidos verificados, banco temporário removido. SQL+FS não atômicos; dump privado fora da VPS por capacidade limitada|
|Pacote/dry-run|CLI exato de c2623d97, Node20.20.0/Prisma6.19.2. Tar09172dde…715; PASS22:53:47–48UTC, planHash7949aebe48874a811c0d1ef794496133818f982172a2452fdb538a2d0fc61011. Plano6submitted/6DELIVERED reportados/5pending; são totais previstos, não apply|
|Inventário global|Dez tenants: demo queued/attempt1/suspensão sem lease; running; lease de tenant expirado e 17 jobs terminais com lease expirado ainda ligado. Preservados; não limpar nem retomar|
|Capacidade/frescor|~478MB livres na VPS. Pacote temporário em /dev/shm, perdido em reboot. Antes de mutação, rever margem disco/WAL, hashes, identidades, fontes e frescor; dry-run não atesta capacidade de commit|
|SQL/recibo/ack|Continuam NÃO EXECUTADOS/NÃO AUTORIZADOS. Comandos separados concretos no relatório. Timeout/commit incerto exige inspeção READ ONLY SQL+ledger+recibo sem repetição automática. Normal CRM obrigatório, exceção somente .6|

Frontend3227/prevenções API preservados e pendentes de implantação; guarda fechada/job suspenso, sem nova política ou abertura.

| Requisito | Estado nesta rodada e condição restante |
|---|---|
|Estado/fences atuais|**COMPROVADO NOS INSTANTES LIDOS**: SQL21:45:52.853UTC e complementos21:51/21:52UTC em10/10; ledger igual antes/depois, closed37, provider/persisting/ref/hash exatos, parent ausente, lock/.uncertain ausentes. APIa26/workerafbb/frontendfa60/daemon vivos, ticks/boot conferidos. Não é drain ou prova de heap/fetch em voo; repetir fences no dry-run futuro|
|Conta original e identidade|**COMPROVADO**: conta efetiva .6 em log original sending/sent e JSON original raw.senderPhoneNumberId; destinatário igual ao seed de execução decriptado/aceitação/JSON.to. Internacional final3736. Conta/número completos privados, hashes publicados. Identidade Web histórica não autoriza conversão em Meta|
|Seed/componentes/template/retorno|**COMPROVADO**: seed filho7cdbc3c9… e snapshot originala3429d22… com .6/componentes iguais; templateId/idioma originais, Atendimento Geral/Fila Geral do seed. Batch.snapshotEventId/hash ainda nulos; não inventado vínculo ou prova de encaminhamento|
|Corpo e retorno bruto|**AUSENTE NAS FONTES INSPECIONADAS**: JSON.text=null, corpo renderizado só seria calculado após CRM. TemplateRequest original hashado não atesta versão efetivamente lida no envio. Return conhecido:response.ok/MetaID/Event; HTTP bruto/código numérico não preservados. DECISÃO APROVADA somente para .6: bodyTextnull com proveniência explícita; não reconstruir do template atual/vizinhos|
|Resultado durável|**AUSÊNCIA SQL COMPROVADA**: zero .6 Outbound por internal/Meta/externalID, zero Message genérica; aceitação e SENT/DELIVERED armazenados, nenhum READ/FAILED/contradição observado por MetaID. Cinco Outbounds anteriores idênticos por hash completo; cinco posteriores sem submissão observada. Recibo de recuperação ainda não existe|
|CRM obrigatório ou disposição aprovada|**DISPOSIÇÃO APROVADA / IMPLEMENTADA LOCALMENTE**: exceção histórica estritamente por tenant/child/run/message/MetaID/taskHash, preservar Web/CRM/runtime, registrar CRM não materializado/retorno não aplicado, sem suporte internacional ou janela fabricada. Event de disposição aprovado foi implementado/verificado localmente; é obrigatório antes de avaliar encerramento produtivo. Prevenção normal mantém CRM obrigatório e suspensão|
|Usage e evento de resultado|**IMPLEMENTADOS/VERIFICADOS EM POSTGRESQL SINTÉTICO; PENDENTES PRODUTIVOS**: zero meta.usage.* .6 e nenhum campaign.message.sent/failed .6. Persistir/verificar fatos obrigatórios com conta/tempos/pricing originais (utility/PMP/billable), sem inventar débito monetário/category de template atual. Status provider não equivale a confirmação humana|
|Read models/totais reais|**BASELINE CONFIRMADA / PÓS-APPLY NÃO EXERCITADO**: childsentCount5,total11; controllersentCount0,total11; conjunto soma filhos. Há6aceitações/5Outbounds/5pendentes não submetidos,244exclusões distintas. Futuro plano deve provar6submitted/6delivered reportados/5pending, sem incremento/replay ou soma controller+filho; manter sending/running/queued|
|Recibo durável/idempotência|**PENDENTE PRODUTIVO**: Event específico com plan/evidence/result/task/source hashes, OutboundId/MetaID/ref exatos, disposiçãoCRM, cinco preservados/cinco pendentes. Provas offline anteriores reutilizáveis; nenhum recibo criado, ackEligible=false continua. Replay compatível sem gravações extras, mismatch nega|
|Contrato próprio de ack|**CONTRATO C IMPLEMENTADO LOCALMENTE / FOR INDEPENDENT REVIEW**: accepted-delivered com disposição histórica explícita e persistências completas. Ack aceito usa razão própria, arquivamento canônico e verificador completo. WrapperFAILED131026 preservado; regressão PostgreSQL PASS. Nenhum chamado produtivo|
|Job/guarda/pendentes|**PRESERVADOS**: queued/attempt1/operational_suspension sem lease, batchrunning; dez tenants auditados com leases expirados ainda vinculados incluídos. Ack não autoriza .7–.11, terminalização, limpeza ou abertura. Disposição do job é decisão independente antes de eventual abertura|

Sequência mínima proposta: decisãoCRM/corpo → implementação local específica SQL/recibo e verificação → revisão própria do ack de sucesso → eventual autorização deapply/verificação/ack, mantendo guarda fechada → decisão separada do job restante. Nenhuma mutação dessa sequência está autorizada nesta etapa.

Sem CLIapply/recovery SQL executado, ack, provider, reenvio, abertura, política ou deploy. Frontend3227 **PENDING / NOT DEPLOYED**, sem alteração de baseline36/bindings/pacote. CSV/Syer, suporte internacional, CRA-PR, multilote/AUTO e reparo setembroCLOSED separados.

## Fechamento local A/B/C desta rodada

29 novas provas + 1 regressão FAILED131026 + noEmit PASS. Recibo versão2 e eventos completos, billing unknown_window explícito sem inventar cobrança, 6 DELIVERED reportados / 5 pending nos leitores reais, sem duplicar controller+filho. Cinco anteriores e WebCRM protegidos por hashes; .7–.11 sem submissão. Replay SQL/ack; rollback real SQL; EIO de archive injetado separadamente. São provas sintéticas, não preenchimento de fontes produtivas.

Antes de qualquer apply/ack produtivo: revisão independente dos bytes/contrato C, autorização própria, execução exclusiva, backup/frescor/restore e leitura atual completa de ledger/ref/hash/lock/.uncertain/job/lease/global/fontes/CRM/status. Captura anterior não é atestado atual. Drift ou webhook novo nega; não substituir fontes ou bindings. SQL/ledger não atômicos: falha incerta exige inspeção, não retry automático.

Disposição do job restante, abertura global e suporte internacional continuam decisões separadas. Frontend3227 preservado/pendente.

## Continuidade dcbeea48 — requisito de capacidade/preservação

Capture corrigido nega DB externo herdado sem fonte API original;6provas dirigidas e nova leitura READ ONLY preservadas. Duas amostras root completas sobre cinco arquivos, zero owners/incompletudes; políticas/manifests atuais no escopo identificado conferidos. Blob idêntico+índice completo off-host e extração isolada PASS. Ver [relatório único](../position6-operational-preparation-20261010/README.md) e [comandos futuros](../position6-operational-preparation-20261010/WITHDRAWAL_FOR_REVIEW.txt).

**Capacidade ainda DENY / NO WITHDRAWAL / NO APPLY / NO ACK**. Autorizar retirada é decisão própria; atualizar owners/referências/margem antes de qualquer operação. Backup/restore anterior reutilizado, não frescor indefinido. Guard37/task/job, cinco Outbounds/WebCRM e .7–.11 preservados; nenhum requisito produtivo de recibo/disposição/usage/totais/ack considerado satisfeito por estes checks.


## Pós-retirada autorizada — 10/10,23:51–23:58UTC / 20:51–20:58Fortaleza

Quatro redundantes retirados uma vez; main/off-host e evidências preservados. CAPACITY PASS pelo piso de planejamento observado: mínimo2.399.555.584bytes para postgres/deploy, piso2.131.755.008, margem267.800.576bytes; WAL80MiB, amostra curta não certifica picos. [Relatório único](../position6-operational-preparation-20261010/README.md) e resultado/hash das evidências. Duas amostras root completas posteriores, zero owners/incomplete; SQL/ledger/identidades e cinco Outbounds intactos, .6 ainda ausente/.7–.11 sem nova submissão observada. Owner confirmou Inbox/CRM. Backup/restore/dry-run/testes preservados sem repetição; reconfirmar frescor e margem antes de eventual mutação. **Apply SQL, recibo produtivo, ack e abertura continuam não autorizados/não executados; guarda37/tarefa/job suspenso preservados.** Esta linha resolve o impedimento de capacidade na leitura, não os requisitos restantes de autorização/recuperação.
