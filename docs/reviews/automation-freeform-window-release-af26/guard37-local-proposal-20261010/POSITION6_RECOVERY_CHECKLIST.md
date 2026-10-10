# Posição .6 — checklist único para qualquer recuperação/ack futuro

**BLOCKED FOR APPLY/ACK.** Sem apply, ack ou execução produtiva. Este checklist consolida as pendências; as descrições de [proveniência e IDs históricos](RECOVERY_POSITION6.md) continuam preservadas. Evidências sintéticas de testes não preenchem campos produtivos ausentes. Nenhum item abaixo recebe PASS atual por integridade de captura antiga.

| Requisito | Evidência/lacuna e condição para revisão |
|---|---|
|Estado/fences atuais|Guarda37, tarefa provider/persisting com ref/hash/instance/build e captura consistente; lock/.uncertain/fault, exclusividade/job/lease e ausência de executor em voo. Nenhuma nova leitura atual nesta etapa|
|Conta original e identidade|Aceitação+orphans históricos sustentam mesmo MetaID, mas conta efetiva .6 e destino canônico precisam fonte original exata; não inferir pelos cinco vizinhos ou tenant atual. CRM internacional permanece sem suporte aprovado|
|Conteúdo/seed/rendering/retorno|Fixar seed efetivo do filho .6 e componentes, corpo, template/idioma e destino originais por fonte/hash; batch snapshotId/hash estavam nulos. Não usar configuração/template atual nem fixture|
|Resultado durável|.6 historicamente sem Outbound; futuro plano deve vincular registro exato a acceptance/orphan sent/delivered e timestamps distintos. READ tardio/contradição/status monotônico exigem inventário atual. Preservar cinco anteriores; nenhuma submissão adicional|
|CRM obrigatório ou disposição aprovada|Novo patch não amplia identidade nem dispensa CRM. Decisão explícita sobre pendência internacional e limites de Conversation/runtime/fences, sem janela fabricada. Ausência de erro em fixture não resolve essa lacuna|
|Usage e evento de resultado|Provar persistências requeridas e pendências, account/meta usage e vínculo ao Outbound antes de cleanup; recibo transport_result_only não substitui conclusão|
|Read models/totais reais|Verificar filho/conjunto/lote: cinco preservados + .6 recuperado conhecido + cinco pendentes, sem incremento no replay/contagem dupla; manter queued/running/suspensão. Esta rodada não executou apply nem provou read model pós-apply produtivo|
|Recibo durável/idempotência|Event específico, plan/evidence/result/task hashes, fontes, Outbound/MetaID exatos; replay compatível zero gravações extras, mismatch nega. Verificador ensaiado localmente, receipt produtivo não criado, ackEligible=false|
|Contrato próprio de ack|Revisão independente do escopo/razão de sucesso e pré-condições completas. Ack genérico e wrapper FAILED131026 não mudaram e não são receita para .6; nenhuma chamada autorizada nesta etapa|
|Job/guarda/pendentes|Decisão separada sobre cinco restantes e inventário global antes de eventual abertura. Recuperar resultado não autoriza retomar job, terminalizar campanha/lote, reenviar ou abrir guarda|

Nenhum CLI apply, transação de recuperação ou política foram adicionados. Frontend3227 pode ser tratado independentemente conforme revisão de contrato anterior; seu pacote/controles permanecem inalterados. CSV/Syer, suporte internacional, CRA-PR, multilote/AUTO mantêm suas frentes.
