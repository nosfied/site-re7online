# Posição .6 — auditoria produtiva READ ONLY e decisão de recuperação

Continuidade de `400b8b4bcf3fac2d1d5261b549febfd5a494f0eb`. **READ ONLY COMPLETED / RECOVERY FOR REVIEW / NOT APPLIED / NOT ACKNOWLEDGED.** Prevenção e fronteira webhook/CRM anteriores continuam somente locais/publicadas, sem deploy. [Checklist único atualizado](../guard37-local-proposal-20261010/POSITION6_RECOVERY_CHECKLIST.md). Nenhum binding frontend foi alterado.

## Resultado atual e limites

SQL principal em **10/10/2026 21:45:52.853 UTC / 18:45:52.853 Fortaleza**; complementos em21:51:22.564 e21:52:30.642UTC /18:51:22.564 e18:52:30.642Fortaleza. Ledger observado antes/depois de cada consulta, mesma SHA-256 `a072223faacd2681a25696d422e6b67947c88ac6b9634d97382af4536580aacf`; stat consistente em cada leitura. **Fechada37**, uma tarefa provider/persisting, parent ausente, lock/.uncertain ausentes nos instantes lidos. O fechamento permanece registrado no audit; ausência de arquivo .uncertain não remove esse histórico.

Tarefa `7d9902c0-4946-4250-8205-400e41be0941`, hash canônico `c91588a21bd6fbc8e85598e30b907f193388751dfadea56d9483c0bca9a9b979`, admissão36, parent `6d8785c6-f600-4e77-a686-7aa9cda74268`, ref exata tenant/child/message .6. Instance privado corresponde à API ainda viva; boot e ticks conferidos. APIa26 PID3625739/ticks2128115907, worker mínimoafbb PID3625960/ticks2128116272, frontendfa60 PID3438948/ticks2120147745: online, restart_count0. Daemon18676/ticks222727. [Estado e hashes das cinco linhas preservadas](STATE.json).

Isso **não é** captura atômica filesystem+DB, certificado de drain, leitura do heap, prova de ausência de fetch em voo ou teste funcional de telas. API viva não significa runner ainda executando a tarefa; a tarefa persisting e o job suspenso são os fatos duráveis. A guarda fecha campanhas globalmente, sem significar atendimento indisponível. Nenhum estado foi expirado/limpo.

## Vínculos e fontes originais

Tenant demo-converta `10a98bf4-1587-43e8-83d4-e3a48c5d79d9`; out.15 controller `b019039e-0a89-4a42-9f33-c214323b888f`, child `94b5805b-5c6d-4c89-b047-959209261c21`; batch `d473aec1-8ffa-40b9-8bab-e6819153ae4c`, link `6c896fcd-d55c-4cf8-9aab-ca976413cc90`; job `1eb96f7f-50ae-4d5e-9124-411923945efb`, run `03856c7c-c390-419a-b2f3-758dd669e394`; message `campaign.94b5805b-5c6d-4c89-b047-959209261c21.6`. Números completos, MetaID e arquivos permanecem privados.

| Campo | Fonte original e conclusão |
|---|---|
|Conta efetiva|**Comprovada**, não tenant atual: `outbound.template.sending`/`sent`, linhas4326/4328 do log ativo; mesmo `resolvedPhoneNumberId` do registro original JSON `raw.senderPhoneNumberId`. Hashes em [PROVENANCE.json](PROVENANCE.json)|
|Destinatário .6|**Comprovado** por seed original de execução decriptado + acceptance.waId + JSON.to; internacional final3736/12dígitos. Não inferido dos vizinhos|
|Seed/componentes|Event `7cdbc3c9-3cce-4429-8aa9-1524636a561c`; 11 posições, componente específico .6 presente. Decoder compilado ativo puro auditado, SHA `d63ef69c5d47119863e1356ef101dd42f830f4d851a317418551603405c627b8`; chave só no ambiente privado, nunca publicada|
|Snapshot dinâmico|Event original `a3429d22-11b2-490b-abc3-67c2fe436875`, payload controller/tenant explícitos:255matched,11eligible,244blocked,1chunk. .6/componentes iguais ao seed filho. **Batch.snapshotEventId/hash continuam nulos**; não fabricado vínculo persistido|
|Template/idioma|`data_exame` / `pt_BR` no envio/JSON original; templateId do seed coincide com Event original `template.request.submitted_to_meta`. Não consultado provider|
|Retorno|Seed original `human_department`, Atendimento Geral `cmsiwk1o100014sdzl5cqd2ki`, Fila Geral `cmsiyb2k200n94sdpu5khkee0`. **Configuração original**, não prova de encaminhamento executado|
|Corpo renderizado|**Não preservado nas fontes inspecionadas**: JSON.text=null, logs não contêm corpo; runner ativo renderiza somente depois do CRM que falhou. TemplateRequest original existe e foi hashado, mas conteúdo solicitado não é versão atestada do `templateForRendering` lido no envio. Não usar template atual nem cinco corpos vizinhos|
|Retorno provider|`response.ok` → MetaID extraído → JSON original → acceptance durável. Mesmo MetaID nos dois orphans. **Resposta HTTP bruta/código numérico não preservados nas fontes inspecionadas**; não inventar200 ou payload bruto|

Registro JSON original: `timestamp=15:40:35.454Z`, status `sent`, text=null, template/idioma/run/request/account/MetaID originais. Arquivo e linha de logs tiveram stat estável dentro das leituras21:50:31.706–31.747UTC. Arquivos mutáveis hashados não se tornam imutáveis por terem hash. [Manifesto de capturas privadas e bytes ativos](SOURCE_MANIFEST.json).

## Linha do tempo e resultado conhecido

Todos os horários abaixo em10/10/2026; Fortaleza=UTC−03.

| Evidência | UTC | Fortaleza |
|---|---|---|
|Snapshot original / seed filho|15:40:24.733 /24.831|12:40:24.733 /24.831|
|Tarefa provider / submit_started|15:40:34.940 /34.964|12:40:34.940 /34.964|
|Log sending|15:40:34.994|12:40:34.994|
|JSON retorno OK / atividade outbound runtime|15:40:35.454 /35.471|12:40:35.454 /35.471|
|Log sent|15:40:35.479|12:40:35.479|
|acceptedAt / Event provider_accepted.createdAt|15:40:35.500 /35.501|12:40:35.500 /35.501|
|Fechamento audit uncertain_close37|15:40:35.559|12:40:35.559|
|Timestamp do provider SENT e DELIVERED|15:40:43.000|12:40:43.000|
|Processamento orphan SENT / DELIVERED|15:40:44.443 /44.528|12:40:44.443 /44.528|

Os três Events correlacionados por MetaID são **uma aceitação + dois webhooks**, não três webhooks. Hash MetaID `46979b261213be225ced7ed54a51223e0739b209cd5da761d8787a4478874823`. Ambos orphans reason `outbound_message_not_found`. Nenhum READ/FAILED/contradição encontrado no recorte por IDs exatos; status DELIVERED é informação do provider, **não confirmação humana**. Pricing armazenado:utility/PMP/billable=true; não é prova de valor monetário debitado.

Zero Outbound .6 por messageId/MetaID/externalMessageId, zero Message genérica correlacionada, zero meta.usage.* .6 e nenhum campaign.message.sent/failed .6 no recorte. Cinco Outbounds .1–.5 SENT/raw.metaStatus.delivered permanecem **idênticos, hashes completos iguais à captura anterior**. .7–.11:zero Outbound e zero submit_started/provider_accepted observados. Não se afirma ausência absoluta fora das fontes retidas.

Existem Contact/Lead/Conversation/runtime internacionais **Web históricos de29/08**, um de cada. Não criados pelo envio .6. Runtime atualizado em15:40:35.471 somente pela atividade outbound; último inbound29/08, expiresAt30/08, flagwindowIsOpen=true antiga **não certifica janela vigente**. Não corrigido histórico. Esses registros e sua conta Web não autorizam retag Meta, merge, nova identidade internacional ou aplicação do retorno humano.

Job child **queued, attempt1, operational_suspension, sem lease**; batchrunning, controller/childsending. Counters persistidos:childsentCount5,total11; controllersentCount0,total11. Conjunto usa filhos no read model: 0 do controller não é zero envios. Há 5 resultados SQL e 6 aceitações: dos 6 ainda sem Outbound no público de 11, um é .6 aceito/entregue conhecido e cinco não têm submissão observada; não executado read model pós-apply. 244exclusões de audiência não são quatro bloqueios deout.13 nem as cinco pendências deout.15.

## Inventário global

[Agregado delimitado](GLOBAL_INVENTORY.json):dez tenants; demo tem1jobqueued vencido sem lease,1batchrunning vencido,2Campaignsending(controller/filho). re7online tem2drafts; demais sem jobs/lotes/campanhas não terminais nesse filtro. Incluídos17jobs terminais com metadados de lease expirados (8completedbatch_chunk,7completedcampaign,1completedtest_send,1blockedbatch_chunk); tenantleasedemo expirado e jobIdnull. **Não constitui drain** e não autoriza limpeza/abertura.

## Proposta concreta de disposição CRM deste resultado histórico

**DECISÃO FUNCIONAL NECESSÁRIA / NÃO APROVADA / NÃO IMPLEMENTADA POR ESTA AUDITORIA.** Menor escopo proposto: disposição excepcional somente para tenant/child/run/message/MetaID/taskHash acima, com actor/justificativa/proveniência duráveis. Reconhecer resultado de transporte aceito/entregue e registrar separadamente **CRM não materializado por identidade internacional fora do contrato aprovado**.

1. Preservar Contact/Lead/Conversation/runtime Web existentes integralmente, sem criar/retag Meta, atribuir responsável/setor/fila, fabricar inbound/janela, fundir aliases ou ampliar resolvedor internacional. Retorno original fica como intenção **não executada**.
2. Aprovar explicitamente `bodyText:null` com pendência de corpo renderizado e hashes do seed/componentes/template/idioma; não inventar texto a partir da solicitação antiga. Se decisão exigir corpo efetivo, continuar bloqueado até uma fonte original válida existir.
3. Event específico de disposição histórica, com scope exato, ausência CRM, referências/hash das fontes, actor/decisão e restrição de não continuidade. Nome proposto `campaign.crm.historical_disposition`, no schema Event existente; **não** registrar sucesso de materialização ou cleanup. Esta disposição substituiria a obrigação CRM **somente neste resultado histórico e após aprovação expressa**.
4. Encerramento de tarefa só poderá ser considerado quando Outbound verificado, status conhecido, usage/eventos obrigatórios, totais reais e recibo completo estiverem duráveis **e** essa disposição estiver aprovada/verificável. Recibo atual `transport_result_only/ackEligible=false` permanece insuficiente. Não antecipar persisted() nem tornar CRM opcional na prevenção normal.

Sem essa decisão, preservar tarefa37. Aprovar exceção histórica não altera suporte internacional, importação, aliases BR, opt-out, anonimização ou fences de atendimento.

## Plano mínimo revisável — mutações separadas, nenhuma autorizada aqui

**A. Persistência SQL.** Implementar CLI/verificador específico sobre contratos existentes, após revisão da disposição acima. Dry-run fresco, backup/frescor, guarda/task/hash/reference/global/lease atuais e todas as fontes originais sob hashes exatos. Transação limitadaSERIALIZABLE, lock order canônica e timeouts; mismatch aborta, sem adaptar binding. Criar somente missingOutbound .6 `(clientId,messageId)` com conta original/MetaID/destinatário/template/idioma/componentes/retorno e proveniência; statusSENT de aceitação, raw.metaStatusDELIVERED pelo helper monotônico/timestamp original. `createdAt` reconstruído da acceptance.createdAt15:40:35.501, identificado como tal: não é submit_started nem prova de Outbound antigo. Preservar tempos do JSON/log/webhooks separadamente. Nenhum provider/webhook replay/CRM write.

Persistir eventos de resultado + usage/billing exigidos pelo contrato Meta, usando pricing/timestamp/account originais: distinguir estimativa/entrega de débito monetário desconhecido. Não fabricar templateCategory de configuração atual; provider reportautility, qualquer categoria estimada indisponível deve ser explícita, não inferida. Incluir disposiçãoCRM aprovada e reciboEvent específico, complan/evidence/task/result hashes, OutboundId/MetaID/ref exatos e inventário das cinco linhas/fivepending. Falha SQL rollback; nada de retry da submissão.

**B. Verificação do recibo e read models.** Releitura tenant→child/link/batch→controller, Outbound/MetaID/receipt/usage/disposição e hashes. Preservar cinco linhas completas; replay compatível retorna alreadyApplied sem novos eventos/incrementos, conflito de unicidade não é sucesso. Provar6submitted/6delivered reportados/5pending, 244exclusões separadas; fixar counters a partir de resultados, não `+=1`; não contar controller+child duas vezes. Manter sending/running/queued e cinco destinos sem submissão. Verificações offline anteriores são reutilizáveis, **não comprovam** esse apply/recibo produtivo inexistente.

**C. Eventual ack.** Requer contrato/verificador próprio de accepted-delivered com disposiçãoCRM histórica aprovada, receipt/result/taskHash/ref exatos e todas as persistências deA/B. Ack genérico atual registra `durable_failed_result_no_retry`; wrapperFAILED131026 não se aplica. Uma revisão específica deve resolver essa semântica antes de implementação/autorização. Arquivar tarefa completa e histórico, sem abertura/retry; eventual nova geração fechada será a observada do setter/ack, não presumida.

**D. Job restante.** Decisão independente:seguir suspenso e guarda fechada é o padrão. Ack não autoriza continuar .7–.11, terminalizar lote/campanha ou limpar leases. Antes de qualquer abertura futura, definir disposição canônica explícita desse job e captura global fresca; sóack+open permitiria execução dos cinco restantes e está fora deste plano.

Próximo passo concreto: revisar/aprovar ou rejeitar a disposição históricaCRM e corpo desconhecido; então autorizar implementação local do planoA/B e contratoC, **sem apply/ack até revisão própria**. Nenhuma decisão sobre execução restante é implícita.

## Ferramentas e preservação

PrismaClient direto, três transaçõesRepeatableRead/READ ONLY; statement_timeout8s, lock_timeout1s, maxWait5s, timeout20–30s, reader45s/SSH65s. take+1 nega truncamento; consultas sobre schema real (não existe CampaignMessage). SQL equivalente delimitado em [READ_ONLY_QUERIES.sql](READ_ONLY_QUERIES.sql). Nenhum index/entrypoint/scheduler/runner/provider/recovery script importado/executado; único módulo aplicativo importado foi decoder puro de seed, dependências auditadas. Não chamado campaignOperationsStatus(), que usa lock. PM2jlist somente após provar daemon existente. Leituras de logs≤20MB/arquivo/≤20arquivos/≤100MB,total; JSON≤25MB; consistência stat exigida. Nenhuma truncagem/erro dos readers capturados; outputs originaisprivados, stderrvazio.

Frontend3227 **PENDING / NOT DEPLOYED**, pacote/build/provas/bindings anteriores preservados. API/worker/frontendfa60 não sofreram stop/start/restart. Nenhuma suíte/build repetida; CSV/Syer, internacionais, CRA-PR, multilote/AUTO e reparo setembroCLOSED seguem separados. Documentação publicada contém somente fatos/IDs internos/hashes e proposta; não contém telefones completos, MetaID bruto, configs, nonces, tokens, auth ou logs.

Históricos de manifests anteriores à atualização documental do checklist foram preservados como `files.pre-current-400b8b4b.sha256` e `webhook-boundary.pre-current-400b8b4b.sha256`. Hashes novos cobrem o documento atualizado; hashes dos testes/código anteriores não mudaram.
