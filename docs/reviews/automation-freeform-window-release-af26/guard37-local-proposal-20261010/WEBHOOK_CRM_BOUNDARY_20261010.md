# Guarda37 — fronteira Outbound/status durável antes de CRM

**LOCAL FIX VERIFIED / FOR REVIEW / NOT DEPLOYED.** Revisão independente de162edc79. Sem SSH ou nova leitura produtiva, provider real, envio, apply SQL, ack, abertura, instalação, política ou janela. Frontend3227/tar/controles inalterados; internacionais/CSV/Syer continuam separados.

## Achado reproduzido

O controller real `receiveWebhook → correlateOutboundMetaStatuses` encontrava o Outbound antecipado da campanha e decidia DELIVERED/READ pelo contrato monotônico, mas chamava `ensureCampaignOutboundConversation` **antes** do update SQL do status. Para o internacional sintético já aceito, o resolvedor CRM efetivo lançava `Invalid WhatsApp number`; o catch externo registrava o erro e o Outbound permanecia sem metaStatus. `webhook.status.received` existia, mas o read model não recebia a verdade conhecida. Isso é uma lacuna nova exposta pela durabilidade antecipada, não prova de falha de entrega ou permissão para ampliar CRM.

Reprodução na origem162 com os mesmos módulos reais: três FAIL esperados por ausência de metaStatus, nos momentos antes/durante/depois da falha CRM. O log inicial com fixture herdando jobs de outro ensaio foi preservado, mas **não usado como prova integral**; a reprodução conclusiva usou banco novo e fixture corrigida. Nenhuma consulta ao provider. Os cinco registros e cinco pendentes produtivos não foram lidos ou alterados.

## Menor ajuste e contratos preservados

Apenas para status de Outbound com campaignId:

```text
webhook recebido/tenant resolvido
→ localizar Outbound e manter vínculo de conta/MetaID
→ transação SQL curta: row lock, releitura, shouldApplyProviderStatus
→ persistir metaStatus conhecido e estado/error do Outbound
→ materialização CRM/Conversation pelo caminho e fences existentes
→ enriquecimento Outbound condicionado à captura JSON ainda vigente
→ usage/billing/realtime já existentes
```

`campaignProviderStatusPersistence.ts` usa o `shouldApplyProviderStatus` e `parseProviderStatusTimestamp` existentes. Sob lock da mesma linha revalida tenant/id/MetaID, phoneNumberId exato e conta/canal/provider quando presentes. Mismatch nega. Linhas legadas null mantêm a limitação documentada em162; não viram evidência de conta ausente. Callback SQL tem maxWait5s/timeout10s; lock não atravessa CRM, provider ou advisory lock de identidade. Sem nova tabela, migration, normalização, resolvedor paralelo ou alteração do shared persistOutboundMessage.

A releitura serializa status concorrentes e evita que uma observação anterior vença um READ novo. Enriquecimento posterior usa CAS do rawPayload completo capturado após a persistência: se outro webhook mudou o JSON, o antigo não o sobrescreve nem publica usage/realtime antigo. Não há loop de retry, segunda submissão ou modificação da guarda. Se esse CAS recusar, o status já está durável; o enriquecimento específico fica não comprovado, não é fabricado como sucesso.

Se a materialização lança erro: persistir Event idempotente `webhook.campaign.crm_pending` vinculado ao tenant/Outbound/MetaID/campanha/run/status/timestamp, com erro sanitizado, `providerStatusDurable=true`, `materialized=false`, `retryAllowed=false`. Não suprimir a pendência como CRM opcional. O controller para os demais side effects desse status; não produz sucesso de materialização, janela, cleanup de tarefa, ack ou continuidade. `deliveryConversationPending` e evidência de submissão permanecem. Os eventos repetidos do mesmo status/instante reutilizam a chave existente, sem criar outra submissão. A recuperação da pendência não está implementada.

O runner de162 permanece inalterado: erro CRM retém provider persisting, suspensão queued/operational_suspension e guarda fechada. A pendência CRM do webhook é separada da tarefa do runner, sem tentar arquivá-la. Sem caso internacional artificialmente resolvido ou Conversation/runtime criado. Status durável não equivale a sucesso global de todas as persistências.

Contratos consultados: [Result Truth canônico](../../../saas/CAMPAIGN_RESULT_TRUTH_CANONICAL_RECONCILIATION_2026-09-18.md), [Importação/elegibilidade e delivery truth](../../../saas/CAMPAIGN_IMPORT_REQUIREMENTS.md), [Identity P1](../../../saas/CANONICAL_IDENTITY_P1_DELIVERY_2026-09-17.md), `campaignDeliveryTruth.ts`, `campaignOutboundConversation.ts` e sua transação/fences de versão runtime+updatedAt da Conversation. Nenhum deles autoriza internacionais CRM nem interpretar acceptance como delivery.

Alcance API: três modalidades continuam convergindo no mesmo runner e Outbound; o status Meta entra neste controller comum. Fonte do worker mínimo executa WebSession inbound/receipts e não importa este controller ou módulo novo; não foi feito backport, rebuild ou pacote. Isso é rastreio de fonte, não nova atestação dos bytes ativos. Non-campaign status conserva o fluxo anterior; sua concorrência global não foi redesenhada nesta correção.

## Provas desta rodada, separadas das dez anteriores

Node **20.20.0**, PostgreSQL16 **real isolado**, banco novo `re7_guard37_webhook_20261010`, schema sintético sem dados produtivos. `receiveWebhook`, CRM, persistência, job/lease/ledger e fences são efetivos. Apenas provider/fetch simulado e barreiras temporais de teste; nenhum entrypoint/scheduler global ou rede real. Testes fixam timestamp provider e protegem hostname/port/banco/cwd.

| Cenário novo | Resultado e limite |
|---|---|
|DELIVERED/READ antes da falha CRM do runner|PASS: Outbound SQL criado, webhook executado antes de o create retornar ao runner; status relido sem downgrade; CRM real rejeita internacional|
|Durante pendência CRM|PASS: runner pausado na entrada da transação de bootstrap, controller recebe status; callback CRM não é substituído, erro ocorre após liberar. Não é injeção de erro nem alegação de transação SQL CRM já em voo|
|Após falha CRM|PASS: job já suspenso/guarda fechada/tarefa persisting; controller grava status e pendência separada|
|Corrida DELIVERED/READ e isolamento|PASS: DELIVERED segura enriquecimento, READ real grava, primeiro CAS não sobrescreve; mismatch tenant/conta/MetaID nega no SQL helper; uma linha e janela preservadas|
|Ciclo humano BR mais novo|PASS: controller DELIVERED/READ real preserva responsável, departamento/fila, versão/ciclo, status humano e inbound/janela; retorno antigo não reaplicado|

Nos três internacionais: **uma submissão/aceitação/Outbound**, READ final após DELIVERED; replay DELIVERED mais antigo não rebaixa; **zero Contact/Lead/Conversation/runtime**; filha persisting, guarda fechada, job queued operacionalmente suspenso e ausência de campaign.message.sent. Disposal da fixture altera somente jobs/leases sintéticos após as assertions, não cleanup operacional atribuível ao produto.

**5 novos PASS /0 FAIL**,1416.902057ms. Reexecutadas somente duas regressões diretamente afetadas: webhook concorrente à verificação accepted (1PASS,834.282312ms) e fence de entrega atrasada (1PASS/13SKIP,632.187151ms). **7 provas executadas nesta rodada**; as outras oito das dez anteriores são reutilizadas no escopo original, sem atribuir-lhes cobertura do novo caso. API noEmit com Node20 PASS. Não houve build ou ensaio de novo tar compilado.

[Prova, hashes e resultados](WEBHOOK_BOUNDARY_MANIFEST.json); teste publicado `campaignAcceptedWebhookCrmBoundary.test.ts`. Logs completos ficam privados. A recusa da primeira fixture e o typecheck raiz acidental fora do escopo foram preservados, sem atribuir PASS ao frontend.

## Limites e recuperação .6

Uma falha SQL anterior à gravação do status, erro posterior na persistência do próprio Event de pendência, status órfão sem Outbound ou CAS de enriquecimento recusado não recebem sucesso integral. `webhook.status.received`/diagnósticos existentes conservam evidência para revisão; não se implementa recuperação automática. Usage/billing/eventos ainda não concluídos continuam pendentes e não autorizam ack. Nenhum replay produtivo ou consulta atual feita.

[Checklist único da posição .6](POSITION6_RECOVERY_CHECKLIST.md) é a referência atual de pendências: proveniência real da conta/conteúdo, resultado, CRM/disposição aprovada, usage/evento, totais e contrato específico de ack. Fixtures locais demonstram algoritmo, nunca substituem essas fontes. `campaignAcceptedDeliveryReview` continua somente leitor/recibo offline, ackEligible=false, sem apply. Guard37/tarefa/job e cinco existentes/cinco pendentes preservados segundo a evidência histórica, não reatestados agora.

Próximo passo: revisão dos bytes da fronteira e checklist. Frontend3227 permanece preservado como frente separada, sem política/preparação ou janela novas.
