# API preventiva — aceite discriminado, 11/10/2026

**ACEITAÇÃO/WEBHOOK: ACEITOS NO ALCANCE DAS PROVAS REVISADAS E DOS BYTES ATIVOS. RESULT TRUTH: PASS NOS DETALHES, PENDÊNCIA ESPECÍFICA NA LISTAGEM.** API permanece DEPLOYED TECHNICALLY; não afirmar aceite integral de todas as apresentações. Frontend3227 concluído/owner confirmou telas; recuperação.6 e setembro CLOSED preservados.

Referência inicial `d7b89f6c51073be5c356381095dd75b8012f1780`. Nenhum envio, webhook sintético/replay produtivo, abertura, retomada, alteração de dados/configuração, instalação ou restart. Não houve build ou repetição de testes: provas existentes reutilizadas no seu alcance original.

## Contratos e matriz de aceite

Consultados: [prevenção/ordem original](../guard37-local-proposal-20261010/PREVENTIVE_PROPOSAL.md), [implementação e dez provas locais](../guard37-local-proposal-20261010/IMPLEMENTATION_20261010.md), [fronteira webhook/CRM e cinco provas novas](../guard37-local-proposal-20261010/WEBHOOK_CRM_BOUNDARY_20261010.md), [Result Truth canônico](../../../saas/CAMPAIGN_RESULT_TRUTH_CANONICAL_RECONCILIATION_2026-09-18.md), [composição restrita da API](README.md), [resultados dos nove testes compilados](verification-results.json), [proveniência/hash por arquivo](api-overlay-manifest.json), [implantação API](EXECUTION_2026-10-11.md) e [frontend3227 concluído](../frontend3227-observation-diagnostic-20261011/EXECUTION_2026-10-11.md).

| Critério | Resultado aceito | Prova existente / vínculo aos bytes | Evidência produtiva e limite |
|---|---|---|---|
|1. Aceitação durável/verificada antes de CRM; falha CRM suspende, sem segundo envio|**PASS / ACEITO por revisão e ensaio isolado**|Runner + campaignAcceptedResult. Dez provas locais documentam falha CRM internacional, SQL pós-aceitação, existente compatível/incompatível, unicidade, tenant/conta/aliases e nenhuma submissão adicional. Ensaio compilado exato Node20 inclui uma prova accepted diretamente afetada; não atribuir esse caso à suíte inteira.|Hashes atuais iguais aos compilados empacotados/ensaiados. Guarda38/job suspenso e resultado histórico durável preservados. **Falha CRM pós-deploy desta API: NOT EXERCISED**; guarda fechada e ausência de novos eventos aceitos impedem tratar recuperação histórica como execução do novo runner. Não é necessário provocar falha para aceitar o contrato demonstrado.|
|2. DELIVERED/READ monotônicos antes de CRM; pendência separada, tenant/conta/ciclo humano preservados|**PASS / ACEITO por revisão e ensaio isolado**|Controller real + campaignProviderStatusPersistence. Cinco provas novas: antes/durante/depois da falha CRM, corrida DELIVERED/READ/isolamento, ciclo humano BR. Duas regressões afetadas documentadas separadamente; compilado exato reaplicou cinco provas boundary. SQL usa row lock/releitura/contrato monotônico; enriquecimento CAS não sobrescreve READ/intervenção recente.|Hashes atuais iguais. Os status históricos de out.15 estão duráveis, mas antecedem esta implantação/foram reconciliados. **Webhook concorrente à falha CRM após deploy: NOT EXERCISED**. Nenhum status foi reenviado para fabricar cobertura. Pendência CRM não equivale a materialização, janela, cleanup ou continuidade.|
|3. Result Truth distingue aceitação, entrega reportada e posições ainda sem submissão|**PASS detalhe filho/conjunto; FAIL de correspondência na projeção da LISTA; aceite integral limitado**|routes + campaignRecipientResultTruth. Três provas compiladas Node20: público conhecido pending em sending/scheduled, falha explícita preservada, fallback terminal/aliases. Ensaios anteriores usam read models reais de filho/controlador/conjunto. A prova anterior da lista só fazia assert.ok; não atestava seus contadores.|Leitores efetivos implantados, em transação READ ONLY: detalhe filho/controlador11 posições =6delivered+5pending, zero failed; agregado não duplica. Lista filho tem6delivered/progress.pending5, mas metaSummary.pending0; controlador na lista tem contadores próprios0enviados/244bloqueados/pending0 e sem6entregas. Interface geral já confirmada; conferência específica de contadores solicitada, sem resposta nova registrada nesta publicação. Nenhuma confirmação humana de entrega dos seis foi fabricada.|

**Aceitação SENT** é resultado aceito/submetido; `metaStatus=delivered` é entrega reportada pelo provider; não equivale a READ ou confirmação humana. Os seis Outbounds continuam SQL SENT e o Result Truth corretamente extrai delivered do rawPayload. As cinco posições futuras têm `pending/awaiting_processing`, não FAILED nem aceitação implícita.

As modalidades manual/avulsa, Audiência CRM estática/dinâmica e CSV imediato/agendado convergem no runner/controller comuns documentados; o aceite deste delta não representa novos ciclos de envio em todas as variantes. Worker mínimo não importa estes módulos e permanece funcionalmente inalterado. Internacional CRM continua restrito; disposição histórica é exclusiva de.6, não CRM opcional no fluxo normal.

## Bytes ativos reconfirmados

Leitura SHA dos seis módulos runtime e Node atual `20.20.0`, sem compilação. Fonte/compilado e revisão por arquivo constam do manifesto ligado acima; a composição final original conferiu264 módulos idênticos. A leitura atual confirma os seis do delta, não reexecuta aquela comparação inteira.

| Compilado efetivamente ativo | SHA-256 igual ao manifesto ensaiado |
|---|---|
|campaignRunner.js|`d88cdc241f28b786212580d01e389b2842d36ab2e17f9ede3f0a1fd8800bae12`|
|campaignAcceptedResult.js|`ea6ae7fd49c9eb20af6ed0cb31ce14fcd53997fc527c0231ff514e837152f0dc`|
|webhook.controller.js|`60d7c09b4a04cc940bb8a8bb884f544b088cc4d3edd55170bdb01d07920894bf`|
|campaignProviderStatusPersistence.js|`639e7fa2aa7ae21cd09285e60e12c2f38f7dee114e9f9101662ab66ce7511d0e`|
|http/routes.js|`d762c4457ee4b94df4d7f98f39034d71d4df5e3cb58f834b221b05306f39ae7b`|
|campaignRecipientResultTruth.js|`43a23008d5ccf86cfe880b91edce3030d1fbc66deee2d17b4cc68aea6136bfe2`|

API `/opt/re7online/releases/campaign-preventive-a26-20261011T002421Z/apps/whatsapp-agent`, PID4049504/ticks2146911015/restart0. Worker afbb PID4049657/ticks2146911319/restart0; frontend3227 PID4121573/ticks2150012070/restart0. BUILD_ID frontend e CSS já comprovados na implantação/confirmados na leitura de preservação; não foram reconstruídos ou reapresentados como novo ensaio funcional.

## Leitura produtiva de out.15/.6 e preservação

Captura **11:21:04–11:21:07UTC /08:21:04–08:21:07Fortaleza**, snapshot PostgreSQL11:21:05UTC, `transaction_read_only=on`, RepeatableRead, statement_timeout8s/lock_timeout1s, transaction timeout30s, processo60s/limites de linhas. Tenant e campaign/parent/MetaID por IDs explícitos. Leitor canônico remove DATABASE_URL/decoder/auth herdados e exige fontes legítimas da API. Falta de configuração nega, sem fallback. Consultas/modelos auditados; import de routes executa somente os leitores exportados. Singleton Prisma do processo administrativo apontou para a transação READ ONLY; nenhum HTTP autenticado foi forjado nem entrypoint/scheduler/runner/provider executado. Guards auxiliares impedem fetch/provider e setInterval no processo leitor. Nenhum binding da release foi editado.

A primeira captura foi negada por erro42883 UUID=text na consulta auxiliar de duplicação, após as leituras; transação READ ONLY encerrada e diagnóstico preservado. Corrigido somente o cast do parâmetro do driver; nova captura própria, sem adaptação de dado/contrato. Um canal SSH posterior não executou o leitor nem criou saída; foi encerrado e a próxima leitura usou saída distinta com noclobber, sem perda de diagnóstico ou ação mutante.

- Seis Outbounds únicos por tenant/messageId, posições.1–.6; nenhum Outbound, submit_started ou provider_accepted observado em.7–.11. Sem agrupamento por nome/telefone.
- Uma disposição CRM histórica e um recibo reconciliado. Tarefa completa arquivada no audit, razão própria `durable_accepted_delivered_historical_crm_disposition_no_retry`, hash canônico e referência iguais ao recibo SQL; geração38, guardRemainsClosed=true, retryAllowed=false, jobContinuationAuthorized=false.
- Guarda fechada38/tasks{}, ledger hash igual antes/depois, amostras consistentes e sem lock/.uncertain. Recuperação.6 não reexecutada.
- Filho sending, conjunto running, job queued sem lease atual e suspenso pelo inventário; job completed histórico mantém seus campos de lease expirado conforme a baseline, sem limpeza. Não é certificado de drain nem permissão de retomada.
- Nova preservação **11:22:12–11:22:14UTC /08:22:12–08:22:14Fortaleza**: leitor vigente conferiu guarda, inventário global congelado, recibo, seis linhas/identidades/dumps/cron/boot/health/DB/CSS/supervisão/barreira ausente. Comparação integral do inventário e linhas com o fechamento frontend anterior PASS. CRM Web/fences/disposição não foram escritos ou reclassificados.
- Contagem limitada de eventos aceitação/sent/webhook recebido/crm_pending desde a partida atual da API: zero. Portanto ausência de novo caso preventivo natural é demonstrada, não confundida com PASS produtivo de corrida.

Evidências originais, query inicial recusada, query corrigida, captura completa e preservação off-host privadas: arquivo hash `3d424fc685a58801764a6ca3b710a4ca026caab17ab4b0d5e54038d418418347`, conteúdo revalidado; capture-v3 SHA`bd4e747fbca4471bfd3a3c303e551d6f765a4fb24c105e5a206a6d652572764a`; preservação atual SHA`6e1a26e0a8754149eeb66102d4d433d076ef01f77c992b74ff7ded13c089063b`. Logs, ambiente, números completos, seeds e credenciais não estão publicados.

## Pendência concreta e menor próximo passo

**P2 — consistência do resumo da listagem de conjuntos.** `buildCampaignListPayload` monta resultados dos Outbounds ligados ao filho, mas sua promoção ao controlador usa exclusivamente Event `campaign.accepted_failure.reconciled` e o vínculo bindings.parentCampaignId. Recibo.6 é `campaign.accepted_delivery.reconciled` e não passa por esse ramo. Além disso, a lista usa contadores persistidos do controlador, não `executionBatch.progress`; metaSummary do filho conta só Outbounds e não cinco pending do público conhecido. `buildCampaignDetailPayload` já usa o read model canônico do conjunto/filho e passa.

Frontend ativo usa `campaignRelationReads.merge` para conservar executionBatch, não substituir todos os contadores da lista pelo detalhe. A tabela lê campaign.sentCount/totalRecipients. Abrir detalhe pode substituir a linha temporariamente; novo polling da lista pode devolver os contadores próprios. Impacto comprovado é divergência dos payloads e possibilidade de apresentação inconsistente; não foi alegada uma observação visual específica ainda não confirmada. Resultados/recibo/CRM/scheduler não precisam de reparo por esse achado.

Próximo passo mínimo revisável: correção local exclusivamente do read model de lista para reutilizar agregação canônica por vínculos explícitos e normalizar os campos de resumo apresentados, sem somar controlador+filhos, evento paralelo ou editar counters históricos. Provas dirigidas necessárias: lista/filho/conjunto6delivered+5pending, uma e várias relações, replay/idempotência da projeção, coexistência de recibos FAILED131026 e delivered, tenant isolado e preservação de resultado explícito; conferir apresentação durante novo polling com APIs simuladas. **Não implementado nem autorizado por esta auditoria; sem novo build/deploy nesta tarefa.**

Confirmação específica pedida ao owner: leitura de out.15 e lote por ID para distinguir os contadores de detalhe/lista. Sua resposta não corrigirá nem fará PASS do payload divergente. Os critérios1/2 não ficam em um genérico aceite pendente: estão aceitos no alcance revisado acima; observação natural futura é complementar, sem necessidade de fabricar falha. Result Truth integral depende somente da revisão/correção desta lacuna concreta, além da conferência visual específica quando disponível.

CSV/Syer, internacionais, CRA-PR, multilote/AUTO naturais e cinco posições sem submissão/job suspenso continuam separados. Frontend3227 concluído, recuperação.6 e setembro CLOSED não foram reabertos.
