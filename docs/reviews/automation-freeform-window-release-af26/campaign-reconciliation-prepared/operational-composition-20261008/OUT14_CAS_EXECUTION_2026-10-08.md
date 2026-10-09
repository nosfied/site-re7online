# Out.14 — abertura autorizada e execução natural comprovada

**GUARD OPEN36 / OUT.14 COMPLETED / META ACCEPTED / DELIVERED / OWNER RECEIPT CONFIRMED.** API `a26dbb0ed39f9484bbbb71c5e7c753d561f07b93`, mesmo worker mínimo reativo afbb e frontend fa60 corrigido preservados. Nenhum deploy, restart, reenvio, reconciliação, acknowledgement, reparo histórico ou alteração de campanha/configuração nesta execução. A única mutação operacional iniciada pelo executor foi a chamada autorizada ao setter da guarda; o scheduler e o provider executaram o trabalho natural subsequente.

## Pré-condições e abertura

Owner autorizou o procedimento de `e457c640`. Sob flock exclusivo, leitura fresca em **08/10 22:03:16 Fortaleza / 09/10 01:03:16Z** confirmou os dez tenants persistidos e a mesma população/configuração/inventário da auditoria anterior: apenas out.14 aguardando, scheduled/queued/attempt0, sem lease; dois rascunhos de re7online sem execução. Um elegível final4366, Follow-up, sem anonimização/exclusão/opt-out; estimativa, rascunho e seleção do materializador corrigido concordantes na identidade, não apenas na contagem. Template data_exame aprovado/permitido, variável22/01/2027 e Atendimento Geral/Fila Geral. Identidades e configurações dos componentes preservadas; guarda fechada35, coleção tasks válida e vazia, sem fault, cinco gates de janela falsos.

A chamada única `POST /admin/ops/campaign-execution`, usando o ADMIN_TOKEN legítimo da configuração ativa, submeteu `{open:true,generation:35,reason:"owner-reviewed-out14-after-reconciliation-closed35"}`. Intenção O_EXCL, baseline, request/result e diagnóstico permaneceram privados. **HTTP200 / CAS35→36 confirmado às 22:04:10.988 Fortaleza / 01:04:10.988Z.** GET posterior confirmou open36; nenhum retry ou ajuste automático de geração. Não se editou o ledger diretamente. A preparação V4 consumida não foi reexecutada e seus gates permaneceram falsos.

## Correlação da execução natural

| Etapa | Horário Fortaleza, 08/10 | Evidência |
|---|---|---|
| Snapshot dinâmico | 22:04:20.173 | `ef4166cc-53ff-460e-b049-af3a44b89dae`: matched1/eligible1/blocked0/chunks1 |
| Início da campanha filha | 22:04:20.392 | evento campaign.scheduled.started |
| Resolução de Conversation | 22:04:20.507 | resolvedor canônico existente; Conversation `8dd94507-f721-4015-b6e5-e5693748c1a5` |
| Submissão iniciada | 22:04:20.636 | `ca743087-af56-4fc1-88c4-621274db1494`, única |
| Aceitação Meta | 22:04:21.516 | `edfa602b-6a35-45ff-bfd5-bcbe8ab16627`, mesmo Meta messageId e messageId do Outbound |
| Persistência SENT | 22:04:21.609 | `314be07e-73e8-49c4-979d-31c238d871bc`; único Outbound |
| Lote concluído | 22:04:21.691 | conjunto completed; controlador e job filho completed/attempt1 |
| Entrega | 22:06:18 | rawPayload Meta/read model delivered, observação posterior22:06:23 |
| Confirmação owner | nesta rodada | confirmou recebimento no final4366 com22/01/2027; não foi solicitada resposta ou claim |

Controlador `44a209f2-fad6-4de5-8521-cd8ab07ae7b0`, lote `df8e7e5b-75dd-4381-93c9-488ec114744c`, filha `2ee0c590-69fa-4ecd-91f8-3633e7824c18`. Outbound `57dc3467-aa24-4777-a457-e0175af4beb4`, provider meta, data_exame, componentes com22/01/2027 e destino salvo preservados. O Meta messageId completo e números completos ficam somente nas evidências privadas. Uma ocorrência submit_started, uma provider_accepted e um Outbound correlacionados; não houve segunda submissão pelo executor.

Duas leituras limitadas com consultas read-only e builders reais da API ativa, sem chamar provider: às22:05:42 ainda SENT; às22:06:23 DELIVERED. A mudança não foi presumida por SENT nem pela conclusão do job. No read model `totalSent=0,totalDelivered=1`: categorias de status atual, enquanto o progresso de submissão continua sentCount1. READ não observado.

## Resultado consolidado e preservações

- Campanha/controlador/lote: **1 destinatário / sentCount1 / blocked0 / failed0 / pending0 / completedChunks1**. Meta summary entregue1, falha0. Conjunto completed; ambos jobs completed/attempt1. Tokens de lease terminais permanecem nos registros históricos, com expiresAt=finishedAt; não representam lease ativo nem foram limpos.
- Fila global: zero jobs não terminais nas duas leituras; conferência posterior zero leases ativos. Esta é observação pontual, não impede novos trabalhos autorizados após a abertura global.
- Out.13: recibo durável `431e03cc-88f1-42f0-a100-5160a3a74418` intacto, **1 SENT válido / 1 FAILED com mesmo Meta messageId e131026 / 4 bloqueados**. Nenhuma nova reconciliação ou ack.
- API PID3625739/ticks2128115907; worker3625960/ticks2128116272; frontend3438948/ticks2120147745. Mesmas identidades, zero reinícios. Guarda open36/tasks0, cinco gates de janela falsos, boot inactive/enabled. Saved e fallback permanecem iguais ao hash `4fbb51fa592dd4beee0651828d535d077edd97de591f70267dd705fb19bbb57f`. Nenhum comando de cron, boot, scheduler, nft ou supervisão foi executado nesta rodada.

[Resultado e hashes das evidências privadas](out14-cas-execution.sanitized.json). Apenas metadados sanitizados são publicados; configurações, tokens, payloads completos, números, logs e evidências permanecem fora do Git.

## Limites e backlog

Esta execução comprova o caminho dinâmico com **um elegível e um lote**, execução natural após abertura, submissão Meta e resultado consolidado com entrega/recebimento. Não reproduz os seis candidatos anonimizados da out.13, não prova agrupamento com vários lotes, indisponibilidade AUTO ou aceite CRA-PR. Não houve novo inbound, claim ou resposta humana neste caso; não se declara aceite dessas etapas. Dois runtimes históricos permanecem preservados, sem fusão ou reparo. Reparação de setembro permanece CLOSED, demais históricos e frentes encerradas preservados. Observação encerrada após as duas leituras limitadas; novos casos exigem evidência natural ou interação indicada pelo owner.
