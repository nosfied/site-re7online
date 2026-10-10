# Guarda37 — auditoria somente leitura da tarefa provider, 10/10/2026

**CAUSE IDENTIFIED / ACCEPTANCE AND DELIVERED WEBHOOK OBSERVED / LOCAL OUTBOUND MISSING / NO RECOVERY EXECUTED.** Tarefa de **demo-converta / Campanha teste out.15**, não Syer/CSV e não out.13. O sexto envio foi aceito pela Meta; a materialização CRM lançou `Invalid WhatsApp number` depois da aceitação. O outbound SQL não foi criado, a limpeza filha não aconteceu e o término do runner fechou a guarda. Nenhum retry/reenvio é seguro ou autorizado por esta auditoria.

## Captura, método e limites

- Ledger efetivo `/var/lib/re7/campaign-operations/state.json`: duas capturas em 10/10 **20:42:35.338–20:42:35.706 UTC /17:42:35 Fortaleza**, mesmo SHA-256 **a072223faacd2681a25696d422e6b67947c88ac6b9634d97382af4536580aacf**, leitura estável por inode/mtime antes/depois. Lock `state.json.lock` e `.uncertain` ausentes nas duas observações. Recaptura posterior no fechamento do rastreio manteve o mesmo hash e ausência; nada foi removido/expirado. Isso é consistência observada, não atomicidade entre filesystem e banco nem certificado futuro de drain.
- PostgreSQL: transação **READ ONLY / RepeatableRead**, snapshot 20:43:39.993 UTC / 17:43:39.993 Fortaleza; segunda consulta restrita aos IDs vinculados em outra transação READ ONLY. statement_timeout 8s, lock_timeout 1s, timeout total 30s/20s, maxWait 5s. [Consultas e limites](READ_ONLY_QUERIES.sql). Não houve resultado truncado nos limites aplicados; 53 eventos da campanha e 8 eventos associados aos IDs Meta, com sobreposição por ID que não é somada como novos eventos.
- Schema efetivo confirmado por `information_schema` e schema do Prisma instalado. **Não existe tabela CampaignMessage** nesse banco: `messageId=campaign.<id>.<posição>` é a chave correlacionadora de OutboundMessage/Event e da projeção UI. Campaign/CampaignExecutionBatch/links/jobs/tenant leases são tabelas distintas. Não presumimos vínculo relacional de Meta messageId nem taskId em jobs.
- Ferramentas: leitura de arquivos/PM2 e cliente Prisma direto com URL do processo ativo, sem registrar credencial no relatório. Não importados index/entrypoint, runner, scheduler, provider ou módulo de recuperação. Mesmo `campaignOperationsStatus()` não foi invocado: ele cria/adquire lock para leitura. Código apenas copiado/lido como bytes. SQL não acionou efeitos de negócio.
- Logs PM2: recorte máximo 20MB por arquivo, filtrado pelos IDs da campanha/tarefa. Ambos eram menores que o limite; arquivos atuais completos examinados (out 1.868.021 bytes, err 45.528 bytes), sem alegar cobertura de rotações anteriores. Diagnóstico original preservado privadamente; nesta ocorrência há erro registrado, diferentemente de out.13. Nenhuma consulta à Meta.

## IDs correlacionados (sem destinatários, credenciais ou nonce de instância)

| Entidade | ID / observação |
|---|---|
| Tenant | `10a98bf4-1587-43e8-83d4-e3a48c5d79d9` → `demo-converta`, confirmado em Client |
| Tarefa filha | `7d9902c0-4946-4250-8205-400e41be0941`, kind provider, phase **persisting**, geração de admissão 36 |
| Pai do ledger | `6d8785c6-f600-4e77-a686-7aa9cda74268`, já ausente no ledger |
| Build/instância | build `a26dbb0ed39f9484bbbb71c5e7c753d561f07b93`; PID 3625739 / ticks 2128115907 / boot correspondente. Sufixo aleatório mantido privado |
| Hash exato da tarefa | `c91588a21bd6fbc8e85598e30b907f193388751dfadea56d9483c0bca9a9b979` — digest informativo, não autorização de ack |
| Controlador | `b019039e-0a89-4a42-9f33-c214323b888f` — Campanha teste out.15 |
| Campanha filha | `94b5805b-5c6d-4c89-b047-959209261c21` — Campanha teste out.15 —01/01, template data_exame |
| Lote | `d473aec1-8ffa-40b9-8bab-e6819153ae4c`, DYNAMIC_CRM_FILTER, um filho / 11 destinatários |
| Link | `6c896fcd-d55c-4cf8-9aab-ca976413cc90`, chunkIndex 1, recipientCount 11 |
| Job do filho | `1eb96f7f-50ae-4d5e-9124-411923945efb`, queued, attempt 1, operational_suspension, sem leaseToken/owner/expiry |
| Job materializador | `4865b05d-0969-465d-b112-873474f804fb`, completed, attempt 1; lease expirado retido como metadado |
| Run | `03856c7c-c390-419a-b2f3-758dd669e394` |
| Chave interna do sexto envio | `campaign.94b5805b-5c6d-4c89-b047-959209261c21.6` — mesma referência da tarefa |
| Evento de intenção | `96f7b2c3-adc2-47f5-ac1c-5d8ba66b3d85` |
| Evento de aceitação | `a0cdb650-c6f9-4741-85d6-c3b9099e9008` |
| Webhooks órfãos | sent `0938c7ee-500b-4877-a0b1-beceec2e5766`; delivered `64cebb0f-4d48-4c6b-9bf2-02e6f2ed69d4` |
| Hash do Meta messageId correlacionado | `46979b261213be225ced7ed54a51223e0739b209cd5da761d8787a4478874823` — ID completo só na evidência privada |

## Linha do tempo — 10/10/2026

| UTC | Fortaleza | Evidência |
|---|---|---|
|15:40:00.000|12:40:00.000|eligibleAt do lote dinâmico |
|15:40:24.152|12:40:24.152|effectiveStartedAt; materialização executada pelo scheduler/queue |
|15:40:24.805–24.842|12:40:24.805–24.842|Filho/link/seed/job persistidos com 11 destinatários |
|15:40:25.080|12:40:25.080|Log campaign.runner.started |
|15:40:26.865–33.746|12:40:26.865–33.746|Posições 1–5: aceitações; cinco OutboundSENT e contagem do filho5 |
|15:40:34.940|12:40:34.940|startedAt da tarefa provider filha; admissão na geração36 |
|15:40:34.964|12:40:34.964|submit_started do sexto; intenção durável antes de submit |
|15:40:35.479|12:40:35.479|Log outbound.template.sent com Meta messageId |
|15:40:35.501|12:40:35.501|Evento durável campaign.message.provider_accepted, chave .6 |
|15:40:35.516|12:40:35.516|Log campaign.result.persistence_pending: crm_materialization / Error / Invalid WhatsApp number /providerAccepted=true / retryAllowed=false |
|15:40:35.536–35.541|12:40:35.536–35.541|Job filho requeued por operational_suspension; liberação do lease vinculado |
|15:40:35.559|12:40:35.559|Audit uncertain_close, unfinished_child_requires_review, geração37; pai removido, filha retida |
|15:40:44.443|12:40:44.443|Webhook órfão sent para o mesmo Meta messageId, outbound_message_not_found |
|15:40:44.528|12:40:44.528|Webhook órfão delivered para o mesmo Meta messageId, outbound_message_not_found |

Os horários dos webhooks acima são createdAt dos eventos internos de processamento, não uma inferência do instante exato de entrega física. Há **entrega reportada no webhook armazenado**, sem confirmação humana de recebimento e sem nova consulta ao provider. A transição persisting não tem timestamp próprio no ledger: é posicionada pela ordem do código e dos eventos, não por um timestamp inventado.

## Causa e sequência no artefato efetivamente ativo

API efetiva `campaign-eligibility-recovery-final-reviewed-20261008/apps/whatsapp-agent`, PID 3625739 / ticks 2128115907 / restart 0. [Hashes completos dos módulos lidos](ACTIVE_CODE_HASHES.json). Evidência direta do log identifica a exceção e a etapa. Código ativo revela a incompatibilidade:

1. `campaignTask("runner")` admite o pai antes da primeira await. `campaignProviderAttempt` admite filha intent e grava referência tenant/campanha/messageId.
2. `intent()` persiste submit_started. O ledger grava provider_or_uncertain antes de chamar submit, no committed callback; não manter o lock ao aguardar o provider.
3. `sendTemplate` revalida elegibilidade e submete pela Meta. Response.ok/extratoMetaID produzem retorno aceito; também há auditoria outbound do storage/runtime anterior ao retorno. Essa auditoria de submissão não é o OutboundMessage SQL da campanha.
4. A filha passa a **persisting**; runner recebe result.ok, marca pendingAcceptance e grava provider_accepted, antes de materializar CRM.
5. `campaignEligibility.normalizeCampaignRecipientIdentity` preserva E.164 internacional não55. O sexto destino é internacional +44 / 12 dígitos (número completo privado), admitido por esse contrato; não é marcador anonimizado.
6. `ensureCampaignOutboundCrmAttemptMaterialization` → `ensureCampaignOutboundCrmBootstrap` → `resolveCrmContactIdentity` → `normalizeCrmContactInput` → `normalizeCrmWhatsappIdentity`. O último normaliza **somente Brasil**; parseBrazilSubscriber rejeita esse formato, e `normalizeCrmContactInput` lança `Invalid WhatsApp number`. Isso ocorre dentro da materialização CRM, antes do OutboundMessage SQL/uso/evento sent e antes de `attempt.persisted()`.
7. Catch do runner preserva aceitação, registra erro sanitizado e marca operationallySuspended, sem retry e sem transformar aceitação em rejeição. Finally suspende o job; `campaignTask` termina o pai via done. Como a filha provider ainda existe, done fecha e incrementa para 37, registra uncertain_close e remove somente o pai. Não há persistência concluída nem limpeza da filha.

**Comprovado:** aceitação, delivered órfão, erro original, faseCRM, incompatibilidade de validação no caminho ativo, OutboundSQL ausente, tarefa retida/fechamento. **Lacuna:** não há stacktrace da exceção original; o ponto interno exato é sustentado pela única cadeia correspondente do código, formato observado e mensagem registrada, não por uma pilha capturada. Não foram feitos teste local novo, provider probe ou replay para fabricar comprovação.

O processo API correspondente **segue vivo** com boot/ticks exatos; isso não significa que a promessa do sexto envio continua em voo. O audit e o finally demonstram término do pai; a tarefa filha é resíduo durável de persistência incompleta. Não inspecionamos heap/stack de Node nem rotulamos tarefa pendente como operação de rede atual.

## Resultado durável e projeção

- Posições 1–5: cinco OutboundMessageSENT, metaStatus.lastStatusdelivered persistido nos cinco. IDs/outbounds completos privados; nenhuma contagem repetida por sobreposição das consultas.
- Posição 6: acceptedEvent + dois status órfãos sent/delivered; **zero OutboundMessage** correlacionado, nenhum evento campaign.message.sent/failed para .6 e nenhum recibo accepted_failure.reconciled desta campanha. Não classificá-la comoFAILED/131026: não há esse erro para este caso.
- Posições 7–11: nenhuma intenção/submissão encontrada no recorte completo da campanha, nenhuma aceitação/outbound. São 5 pendentes não submetidos pelas evidências, não 5 falhas de provider. Não foram bloqueados/reprocessados por esta auditoria.
- Filho: status sending, total 11 / sent 5 / blocked 0; job queued attempt 1 sem lease; link scheduled; lote running. Controlador: sending / sent 0 / blocked 244 e lote blocked 244, contagem de exclusões da audiência distinta das 11 materializadas. Não somar 244 a 11 para inventar status do sexto envio nem duplicar controlador/filho.
- O read model efetivo em dist/http/routes.js monta resultados por OutboundMessage + bloqueios, não inclui automaticamente provider_accepted/webhookórfão como outbound. O agregado usa filhos para progress: 11/5/0/0, pending 6; o blockedCount do lote tem 244 de exclusões de audiência. Essa projeção pode representar sexto aceito como ainda pendente por ausência local. **Não houve consulta autenticada à UI ou relato novo do owner nesta auditoria**; é conclusão sobre o consumidor real, não screenshot/aceite UI.

## Inventário global e impacto

[Snapshot agregado dos 10 tenants](GLOBAL_INVENTORY.json), sem detalhes de outros clientes:

- demo-converta: **1 job não terminal queued**, batch_chunk, attempt 1/sem lease, eligibleAt vencido; **1 lote running**; **2 Campaign sending** são controlador+filho da mesma execução, não duas execuções independentes.
- Lease de tenant demo: 1 registro expirado em 15:40:35.539 UTC / 12:40:35.539 Fortaleza, jobId=null. Sem lease de tenant vigente nesse snapshot.
- Jobs terminais com campos de lease expirados ainda retidos:17 (8 completed batch_chunk, 7 completed campaign, 1 completed test_send, 1 blocked batch_chunk). Metadados retidos pelo contrato de fim/materialização não provam 17 executores ativos; não foram removidos, expirados ou reclassificados como drain.
- re7online: 2 rascunhos, nenhum job/lote não terminal encontrado. Nos outros 8 tenants, nenhum job/lote/lease não terminal ou agendamento pendente encontrado no snapshot. Leases terminais/expirados também foram incluídos, sem exclusão permissiva.

Guarda compartilhada fechada 37 nega admissões de campanhas/scheduler/claim de jobs e mutações abrangidas pelos endpoints; alcance é global aos 10 tenants. Scheduler pode continuar tendo seu timer sem adquirir trabalho novo. **Não é guarda da Inbox nem prova de atendimento indisponível**; API/worker/frontend vivos e nenhuma indisponibilidade de atendimento foi demonstrada. Não testamos envios/claims humanos. Inventário não é certificado de drain e não autoriza abertura.

## Contrato de recuperação e menor próximo passo revisável

Auditoria estática, sem executar `dryRunAcceptedFailure`, `applyAcceptedFailure`, `verifyAcceptedFailureReceipt` ou ack:

- `acknowledgeReconciledCampaignTask` exige guarda fechada/geração exata, apenas uma tarefa provider persisting, referência JSON exata, hash canônico da tarefa, ausência de fault e ator/recibo. Arquiva a tarefa no audit e não abre a guarda. A existência de phase persisting **não** prova que as demais pré-condições estão satisfeitas.
- O consumidor `acknowledgeAcceptedFailure` exige recibo durável que corresponda ao Outbound reconciliado, mesmo Meta messageId/eventos/estados terminais; o contrato atual é específico a 1 SENT + 1 FAILED/131026 + 4 bloqueados e à posição**.2**, conforme out.13. Aqui temos 5 SENT + aceitação/entrega da **.6** + 5 pendentes; recibo correspondente não existe. Não reutilizar por semelhança nem chamar ack só porque há webhook delivered.
- Código atual já recusa nova submissão quando acha provider_accepted sem Outbound local. Isso não saneia o resultado, não autoriza retomar queued e pode produzir outro estado se for invocado. Nada foi invocado.

**Próximo passo mínimo para revisão:** reproduzir localmente a divergência entre elegibilidade internacional e bootstrap CRM com provider sintético/submissão única; definir delta mínimo reutilizando resolvedores e preservação dos aliases aprovados, sem descartar números internacionais válidos. Em frente de recuperação separada, preparar plano e recibo específico de **aceitação/entrega sem Outbound** para .6, preservando os 5 outbounds e 5 não submetidos, com vínculos/hashes/CAS/fences de concorrência e dry-run exclusivamente local/SQL read-only antes de qualquer autorização produtiva. Não reutilizar o plano deFAILED131026. Nenhuma implementação, reconciliação/ack, abertura ou correção de dados foi feita nesta etapa.

A release frontend 3227 permanece impedida por baseline 36 ≠ guarda 37/tarefa; políticas anteriores e execution-authorized=false preservados. Resolver contrato operacional antes de propor nova composição; não adaptar bindings desta preparação para fazer PASS. CSV/Syer permanece separado; CRA-PR/multilote/AUTO mantêm aceites próprios.

A [continuidade local](../guard37-local-proposal-20261010/README.md) reproduziu a falha sem injeção CRM e separou contratos internacionais, prevenção e recuperação .6; nenhuma ação produtiva foi executada.
