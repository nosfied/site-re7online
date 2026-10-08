# Demo out.13 — elegibilidade e recuperação preparada

Estado: **LOCAL VALIDATED / RECOVERY PREPARED / NOT DEPLOYED**. Nenhuma reconciliação, liberação de guarda, remoção de tarefa, submissão ou alteração de dados produtivos foi executada. API/worker afbb e frontend fa60 preservados. Reparo de setembro CLOSED e quatro registros históricos intocados.

## Contratos e causa

Reutilizados `DYNAMIC_CRM_FILTER_CAMPAIGN_SCHEDULING.md` (snapshot imutável e reavaliação na execução), `CAMPAIGN_IMPORT_REQUIREMENTS.md`, `CAMPAIGN_RESULT_TRUTH_CANONICAL_RECONCILIATION_2026-09-18.md`, o ledger de `campaignOperations` e o procedimento V4. Status operacional e submissão aceita não equivalem a entrega.

A seleção dinâmica filtrava situação CRM, mas não aplicava integralmente a elegibilidade operacional. A extração de dígitos de marcadores anonimizados criou pseudo-destinatários. Seis Leads NURTURE correspondiam ao filtro: um válido e cinco marcadores/excluídos. A submissão do segundo destino foi aceita pela Meta; depois houve falha de persistência. O webhook correlacionado informa **failed/131026**, sem Outbound correspondente. A exceção produtiva original não foi registrada e permanece **causa desconhecida**. A suspensão de segurança deixou tarefa `persisting` e guarda fechada.

Separadamente, o caminho real de materialização CRM de número inválido reproduz `CrmContactUpsertError: invalid_phone / Invalid WhatsApp number`. Uma injeção após aceitação reproduz a retenção da tarefa e o fence contra segunda submissão. Nenhuma dessas provas identifica retrospectivamente a exceção produtiva ausente.

## Delta e três modalidades

- **Avulsa/manual:** `dedupeCampaignRecipients` → `createScopedCampaign` → runner; público direto, execução imediata ou futura.
- **Audiência CRM:** `resolveCampaignDraftRecipientsFromLeadIds` / `createScopedCampaignDraft`, `sendScopedCampaignDraft`, `scheduleScopedCampaignDraft`; público estático ou dinâmico, inclusive os dois materializadores de snapshot/lote.
- **Importação CSV:** `buildCampaignImportRecipientsFromCsv` e preview/import → rascunho scoped → send/schedule → mesmo runner.

Não são modalidades de transporte. Campanhas/templates continuam Meta-only. `campaignEligibility` reaproveita candidatos/normalização existentes e é compartilhado por CRM, estimativa, importação, materialização e execução. Marcadores são recusados **antes** de extrair dígitos. Snapshot antigo permanece intacto; posição/messageId não são renumerados. Uma consulta parametrizada, scoped por tenant, reconhece dígitos de marcadores históricos exclusivamente para **negar**, nunca para unir identidades.

Exclusão, opt-out, canal, tenant e identidade vencedora são verificados novamente na fronteira anterior ao provider, depois da preparação assíncrona. Ambiguidade ou mudança de identidade nega. Os fences de intenção/aceitação precedem essa decisão: um pseudo-destinatário já aceito não se torna elegível para retry. Sem lock durante provider, nova janela ou nova exceção RBAC.

`campaignFailureDiagnostic` preserva classe/mensagem sanitizadas, etapa de persistência no logger existente; remove tokens, URLs e valores sensíveis antes do truncamento. Resultado aceito permanece protegido mesmo quando CRM/outbound/usage falham.

## Provas executadas

**33 casos distintos aprovados**, sem somar reexecuções como novos casos:

| Escopo | Casos | Execução e limites |
|---|---:|---|
| Elegibilidade + reconciliação + importação existente | 13 | Compilados finais, Node 20.20.0, PostgreSQL sintético real; provider simulado |
| Runner: exclusão, opt-out, seis Leads, snapshot antigo | 4 | Compilados finais Node 20.20.0; dez casos não selecionados |
| Runner: falha pós-aceitação e fence | 1 | Compilado final Node 20.20.0; treze não selecionados; falha injetada |
| Guardas operacionais existentes | 15 | Node 20.20.0 + TSX, código fonte, processos/filesystem reais; não é harness compilado |

Build TypeScript da API: PASS, sem diagnósticos. CLI offline executada em banco sintético: recibo já aplicado reconhecido. Reconciliação SQL, replay antes/depois do acknowledgement, hash/IDs divergentes, task hash divergente e preservação de snapshot/CRM/envio válido comprovados. Nenhum scheduler/provider real iniciado. Erros iniciais de fixture/harness foram corrigidos; a suíte operacional usa seu harness fonte, não se atribui PASS à tentativa compilada incompatível.

Normalização compartilhada preserva E.164 internacional de 8–15 dígitos e aliases Brasil aprovados. O contrato histórico do importador/CRM é Brasil-only e não foi expandido; não se declara criação CRM internacional ponta a ponta validada. Opt-out ou intervenção posteriores à última leitura e anteriores à chamada são limite temporal existente: não há transação mantida durante provider.

## Leitura produtiva e IDs de reconciliação

Dry-run SQL versionado: [consulta somente leitura](DEMO_DYNAMIC_13_RECOVERY_DRY_RUN_2026-10-08.sql), timeout 10s / lock 1s. **8/8 verificações PASS** em 08/10/2026 14:02:30Z (11:02:30 Fortaleza). Números completos, IDs Meta, task e dados de contato permanecem privados.

| Vínculo | ID |
|---|---|
| Tenant demo-converta | 10a98bf4-1587-43e8-83d4-e3a48c5d79d9 |
| Controlador out.13 | 1d7be01c-7545-493d-9be2-e14de005ac5c |
| Campanha filha | 09f1a742-d42d-4325-9b36-cf8e57650e9a |
| Lote | 5a92945c-d235-47bd-b9c7-eb00f6a7d98a |
| Job | e271fb78-976c-4a85-a554-dbb98a93a24e |
| Execução | f28106be-0e56-49e4-928e-0ea527b2a22a |
| Aceitação Meta | 4b61e65c-e9e6-4ac8-9f8c-99fa4995086a |
| Webhook orphan failed/131026 | ec58e561-111a-41dc-9805-5830ffbba2bc |
| Outbound válido SENT | cfe85d33-24c8-4ba1-9288-bc9b93fca89e |
| Snapshot imutável | 45c465c9-e44b-4a48-9447-6170e01ba8d5 |

Guarda **closed, geração 34, uma tarefa persisting**, sem lease ativo observado. Fila global limitada a 201 linhas retornou somente dois jobs: out.13 acima, attempt1/operational_suspension; out.14 `21c5b452-1eed-4229-a3dc-78aea84733fb`, attempt0. Controlador out.14 `44a209f2-fad6-4de5-8521-cd8ab07ae7b0`, lote `df8e7e5b-75dd-4381-93c9-488ec114744c`. Não havia outros queued/running/paused no snapshot de todos os tenants. Isso não certifica uma futura liberação. Scheduler não alterado; esta rodada não repetiu a validação de health/PM2 ao vivo. O estado de configuração saved é evidência distinta de identidade efetiva.

## Recuperação concreta, ainda não autorizada para execução

1. Revisar este delta; reconfirmar guarda/generation34, tarefa/hash, exclusividade, leases e IDs. Backup fresco DB e ledger por runbook, preservando anteriores. Drift nega; não adaptar bindings para obter PASS.
2. Executar o CLI offline em `dry-run` com bindings privados exatos; conservar planHash. O CLI não inicia aplicação, scheduler ou provider. A consulta SQL versionada é auxiliar; não autoriza saneamento.
3. Após autorização específica, `apply-sql` exige planHash e `--execute-authorized`: transação serializable, locks Client→Batch→Job, correlação execução/aceitação/webhook/snapshot. Resultado: **um SENT preservado, um FAILED/131026, quatro bloqueados antes do provider**. Filho/controlador/lote/job ficam terminal failed, sem retry. Não atualizar snapshot, Lead, Contact, conversa, runtime ou atribuição; não fabricar conta/phoneNumberId nem cobrança.
4. Verificar recibo durável e estados terminais. Somente então `ack-task`, com taskHash e ator, arquiva **a tarefa completa** no histórico auditado e a reconhece como resolvida por CAS. Não apaga tarefa pendente para obter drain. Guarda continua fechada; se geração34 permanecer, acknowledgement produz35. Recibo/replay idempotente evita segunda operação. SQL e ledger não são transação única: falha intermediária deixa guarda fechada e permite retomada pelo recibo, sem reenvio.
5. Preparar publicação controlada API pelo V4 existente, com worker mínimo coordenado e frontend preservado. V4 exige drain; por isso reconciliação/ack precedem a janela. Retorno compatível à API afbb, preservando DB/auth e recibos. Nenhuma janela foi montada/aberta nesta etapa.
6. Antes de liberar guarda, **nova** consulta global de todos os tenants e geração atual. out.13 não pode continuar executável; out.14 deve ter filtro FOLLOW_UP reavaliado pelo código corrigido, destino/template/opt-out/identidades e número atual de elegíveis conferidos. A estimativa anterior de um contato não fixa o público futuro. Outros novos jobs exigem decisão explícita. Abertura somente por CAS autorizado, jamais por timeout.

CLI: `apps/whatsapp-agent/scripts/reconcile-campaign-accepted-failure.ts`; modos `dry-run`, `apply-sql`, `ack-task`, com arquivo `--bindings=` privado. Escritas negadas sem `--execute-authorized`; apply requer `--plan-hash=`, acknowledgement requer `--task-hash=` e `--actor=`. Hashes/ator serão capturados da leitura fresca, não são placeholders para copiar contra produção agora.

## Componentes e pendências

**API:** elegibilidade, runner/materialização, callback final, diagnóstico e ferramenta offline; sem schema/migration/dependências novas. **Worker mínimo:** nenhum backport funcional necessário. Grafo atestado do entrypoint tem 83 módulos relativos, sem ausência: runner/operations/readmodel/outboundTemplateService não são executados por ele. `campaignRecipientImport` é alcançado somente pelo parser CSV/constants usados no CRM; essas funções não mudaram. Primitivas de `crmWhatsappIdentity` usadas pelo worker não mudaram. Não substituir o importador histórico pelo da árvore completa da API. Tar reativo existente `8b67292578090a2f564e4a9bf399b002e667bba723c936859fc438aa1221f5c8` preservado, sem rebuild. **Frontend:** nenhum delta.

CRM → conversa BOT é backlog separado: contato pode existir enquanto conversa só é acessível pelo filtro Automação. Futuro atalho deve reutilizar autorização de detalhe/filtro; não tornar BOT parte de TODAS nem atribuir/consumir capacidade por leitura. ADMIN/SUPERVISOR dependem da chave e tenant; AGENT não ganha exceção. Não implementado aqui.

Avulso, CRM estático/imediato, CSV individual/imediato e provas controladas já aceitas mantidos com seus limites. Agrupamento aguarda execução natural autorizada, contingência AUTO por indisponibilidade e aceite CRA-PR separados. Esta recuperação não encerra esses aceites.

## Reprodução isolada

Usar PostgreSQL vazio com schema vigente, `DATABASE_URL` exclusivamente sintética e Node 20.20.0; nunca carregar env de produção. Os testes criam fixtures e simulam fetch/provider. A suíte operacional já fornece drivers de processos/filesystem. A partir da raiz:

```bash
npm --prefix apps/whatsapp-agent run build
node --test apps/whatsapp-agent/dist/campaigns/campaignEligibility.test.js apps/whatsapp-agent/dist/campaigns/campaignAcceptedFailureReconciliation.test.js apps/whatsapp-agent/dist/campaigns/campaignRecipientImport.test.js
node --test --test-name-pattern='operationally excluded|opt-out block|dynamic six Leads|old pseudo snapshot|accepted provider failure' apps/whatsapp-agent/dist/campaigns/campaignRunner.test.js
node --import ./apps/whatsapp-agent/node_modules/tsx/dist/loader.mjs --test apps/whatsapp-agent/src/campaigns/campaignOperations.test.ts
```

`node` acima deve apontar para 20.20.0. As negativas requerem PostgreSQL real; ausência de banco não constitui PASS. Builds/outputs e evidências privadas não são versionados. Manifesto versionado contém hashes de origem/resultado e compilados; não é pacote de implantação nem autorização de saneamento.

## Complemento final — read model, recibo e preparação offline (08/10)

**API/CLI STAGED VERIFIED / RECONCILIATION REVIEWED / NOT DEPLOYED.** [Composição, provas e limites](campaign-reconciliation-prepared/README.md), [comandos em ordem](campaign-reconciliation-prepared/OWNER-STEPS.txt) e [manifesto de fontes/compilados/backup](campaign-reconciliation-prepared/artifact-manifest.json). Este complemento prevalece sobre a descrição anterior de CLI com três modos: `verify-receipt` acrescenta leitura explícita antes do acknowledgement.

O teste real PostgreSQL/Node20 estendido usa os builders efetivos de detalhe, controlador, lote e lista, incluindo paginação apenas do controlador. Todos conservam **1 SENT + 1 FAILED/131026 + 4 bloqueados, zero pendentes**, após replay. Nenhum contador é incrementado pelo recibo. Read model compartilhado preserva estágio Meta distinto da submissão. Receipt agora vincula o Outbound recuperado exato e o mesmo Meta messageId da aceitação/webhook; acknowledgement nega ID divergente, bloqueio ausente ou estado não terminal. Provider timestamp e erros originais permanecem no rawPayload, sem novo envio/replay de webhook.

Build API final PASS. Um caso integrado existente foi estendido, não somado como caso necessariamente novo aos33 anteriores. Novas provas operacionais:4 simulações de sequenciador/Bridge com efeitos externos simulados,6 casos de classificação e1 integração PostgreSQL do producer/consumer de fila (5 verificações). Não atribuir essas simulações a PM2/nft reais. Generator de baseline teve sintaxe conferida; main pós-ack não executado.

Preparação nova na VPS: `campaign-eligibility-reconciliation-20261008T150000Z`; API final inativa `campaign-eligibility-recovery-final-reviewed-20261008`,8820 arquivos/11symlinks. Overlay SHA256 `241187ccf3e4543575ac5466537d351162d04e0e4fc10a8bfc0b2552b7c4d91e`; CLI `a66fb312b3a0ffd32281ed00b8f6ddc84750e7e6eab9d346fdf6e6ea24e9a7bb`; manifesto completo privado `4fe74088465073e07269329a0c14267427c61173e04b65e85f7d847bd5b5263c`. Final dry-run exato na VPS PASS: alreadyApplied=false,1/1/4,providerCalls=0,guardWrites=0; planHash `bbf9226d6c284a792164f885c8798ffde5be853b964678846f39745a124863f0`. Plano anterior ao complemento não deve ser reutilizado.

Backup fresco14:58:31Z; dump SHA256 `231179c6970a1e41ac8d4d94408542267ac8a0034c73a7b23a943827b826e007`,31160314bytes. Restore isolado terminou15:05:23Z com70 tabelas/60 migrations concluídas, seis rollbacks históricos, zero divergência de checksum. Sem aplicação/provider, banco temporário removido e PG isolado parado. Backup não autoriza restore sobre produção; frescor e mudanças pós-SQL devem ser avaliados antes da janela.

Identidades vivas lidas: API afbb PID3153929/ticks2107666112; worker mínimo reativo PID3154150/ticks2107666513; frontend fa60 corrigido PID3438948/ticks2120147745, restartCount0 em todos. Worker PACKAGE_FILES.sha256 conferido, sem rebuild/start. Helper/sudoers preservados. Guarda permanece closed34/tasks1, dois jobs observados (out.13/out.14); nenhuma reconciliação, acknowledgement, abertura, deploy ou processo candidato iniciado.

**Dependência concreta antes do V4:** após recibo+ack autorizados, capturar tasks:{} vazio/geração atual e inventário global imutável de out.14 aguardando; gerar baseline/política/manifests novos. Patches versionados preservam a guarda inicialmente fechada em sucesso/aborto/retorno e negam trabalho desconhecido/lease/drift, mantendo todas as barreiras de proprietários/DB. Não usar a janela consumida nem executar o V4 antigo, que pressupunha abertura. Helper permanece igual; política fresca requer instalação restrita de Deifson com bytes a revisar após captura. **WINDOW NOT READY / POLICY NOT INSTALLED**; isso não impede a revisão da reconciliação/API preparada, mas impede declarar a troca pronta hoje. Ordem: dry-run → SQL autorizado → verificar recibo → ack fechado → V4 → fila global → decisão CAS separada. Out.14 e qualquer novo trabalho em outros tenants exigem conferência atual antes da abertura.

## Execução autorizada — reconciliação e acknowledgement, 08/10

**RECONCILED / ACKNOWLEDGED / GUARD CLOSED. API NOT DEPLOYED / V4 PREPARATION BLOCKED.** [Resultado e hashes sanitizados](campaign-reconciliation-prepared/execution-result-20261008.json). Autorização owner exclusivamente para SQL, acknowledgement e preparação; nenhum stop/start/restart, contenção, instalação privilegiada, abertura ou provider. Execução única sob o mesmo lock global de janelas e lock de reconciliação; ações sequenciais com checkpoints.

### Gates e backup

Guarda closed34/tasks1, taskHash e IDs exatos, zero lease ativo ou expirado ainda vinculado, fontes/compilados/CLI e identidades afbb/fa60 conferidos antes da escrita. Dry-run fresco17:02:46Z retornou exatamente o planHash revisado `bbf9226d6c284a792164f885c8798ffde5be853b964678846f39745a124863f0`; providerCalls0/guardWrites0. Não houve adaptação de binding ou nova submissão.

Para frescor, novo backup pré-reconciliação criado às17:00:27Z (14:00:27 Fortaleza), preservando o anterior: dump31331720bytes, SHA256 `a37f8d4f2cd805686c65096e2652c2d483425ed831067cfbc47887acd366dafd`, catálogos e arquivos operacionais/runtime/conteúdo com readback. Restore isolado terminou17:01:57Z:70 tabelas/60 migrations concluídas, seis rollbacks históricos, zero checksum/migration ausente; banco temporário removido/PG isolado encerrado. Nenhuma app/provider no restore. Backup é anterior à reconciliação; para janela futura avaliar frescor/capturar estados atuais, sem retornar o DB a esse dump.

### SQL, recibo e leitura

SQL aplicada17:03:09Z (14:03:09 Fortaleza), dentro dos limites serializable/15s do CLI revisado. Recibo durável `431e03cc-88f1-42f0-a100-5160a3a74418`; Outbound reconciliado `234ab978-bf43-4335-b1f8-61c8f533e46e`. Verificação17:03:10Z confirmou mesmo Meta messageId entre aceitação, webhook failed131026, Outbound, evento de falha e recibo; estados terminais, quatro bloqueios e ausência de retry. Meta ID completo permanece privado; seu hash consta no resultado.

Builders efetivos da **candidata exata ainda inativa**, contra DB produtivo somente leitura, comprovaram detalhe filho/controlador, lote e lista:6 resultados,1 submissão válida preservada,1 FAILED131026,4 bloqueados,0 pendentes. Outbound válido continua SENT; read model mostra seu estágio posterior DELIVERED. Isso não altera o contrato SENT≠entrega. A API afbb viva não foi trocada: suas fórmulas antigas de apresentação ainda podem divergir até implantação do delta de consolidação. Não se declara correção da interface produtiva nesta etapa.

A primeira asserção do driver de leitura exigia indevidamente totalSent1 e recusou porque havia totalDelivered1. SQL não foi repetida; acknowledgement aguardou diagnóstico. Preservados stdout/stderr/exitCode e driver original. Driver corrigido verifica progress.sentCount1, SENT persistido pelo recibo e uma única linha entre sent/delivered/read; nenhuma alteração de binding, status ou dado para obter PASS. Segunda leitura PASS. Essa recusa era do verificador administrativo, não falha nova de provider ou SQL.

### Acknowledgement e estado final

Após verificação de totais/receipt e correspondência do taskHash, acknowledgement17:05:34Z arquivou a tarefa **integral** no audit com receiptId. CAS: geração34→35, guarda permanece fechada e tasks:{} vazio. Recibo revalidado17:05:36Z; não houve replay do envio nem remoção manual de tarefa. Históricos, snapshot e CRM não foram reescritos. Gates offline foram novamente fechados.

Conferência17:12:34Z: API afbb PID3153929/ticks2107666112, worker mínimo afbb PID3154150/ticks2107666513, frontend fa60 PID3438948/ticks2120147745; todos online, restartCount0 e mesma identidade/cwd/script. Cron/boot/deploy-cron conferidos por igualdade, helper preservado, nenhuma contenção executada. Out.14 na observação pós-ack: job `21c5b452-1eed-4229-a3dc-78aea84733fb`,queued/attempt0/sem lease; lote `df8e7e5b-75dd-4381-93c9-488ec114744c`,scheduled; controlador `44a209f2-fad6-4de5-8521-cd8ab07ae7b0`,scheduled. Era o único trabalho não terminal observado globalmente. Guarda fechada mantém esse trabalho aguardando; nenhuma abertura autorizada/executada.

### Bloqueio concreto da preparação V4

Nova composição parcial preservada em `incident-6683-v4-campaign-eligibility-postack-20261008T170600Z`; modos/configurações próprios, origem atestada e patches conferidos, sem copiar proofs/nonces/certificados/intents. Todos os gates false. A captura real foi corretamente interrompida por **waiting_group_not_inactive**, mas revelou erro do classificador proposto: exige grupo `queued`; o contrato efetivo usa lote `scheduled` enquanto seu job aguarda `queued`. Evidência: `routes.ts` agenda CampaignExecutionBatch com status scheduled e cria job queued; `campaignExecutionQueue.ts` aceita lote scheduled/running ao selecionar jobs. Out.14 contém exatamente esse estado, não um executor running disfarçado.

Os seis testes locais anteriores e a integração de fila usavam fixture de lote queued; portanto NÃO comprovavam compatibilidade com o estado real do produtor. Essa limitação foi reconhecida, sem reatribuir PASS. A tentativa de emitir política também negou por manifesto/baselines inexistentes, pois a etapa anterior não certificou a fila. **Não foi emitida ou instalada política; não há baseline completo/manifests finais/prontidão de janela.** Estado observado foi preservado como não certificado, sem adaptar o binding nem relaxar o gate.

Menor próximo delta para revisão: alinhar somente a classificação de lote aguardando ao status scheduled produzido pelo contrato e ensaiar producer→SQL→consumer com esse estado; queued inválido, running/needs_review/blocked desconhecidos, leases ou mudança do inventário continuam negando. Depois gerar bindings/baselines/manifests/política em preparação nova, sob identidade atual, mantendo guarda fechada e gates falsos. Os manifests anteriores tinham26 arquivos; incluir waiting-work acrescenta o27º (corrige o rótulo anterior de26). Não requer rebuild funcional, novo helper ou sudo ampliado. Sem esse delta revisado, a janela segue bloqueada.

Este relatório encerra a etapa SQL/ack autorizada; não autoriza deploy, instalação de política, abertura CAS ou out.14. CRM→BOT separado, frentes funcionais CRA-PR/agrupamento/AUTO e reparo setembro CLOSED preservados.

## Classificação corrigida e preparação pós-ack concluída — 08/10

**POST-ACK PREPARED FOR REVIEW / POLICY NOT INSTALLED / NOT DEPLOYED.** [Manifesto completo](campaign-reconciliation-prepared/postack-preparation-manifest.json), [provas](campaign-reconciliation-prepared/waiting-scheduled-proof.json) e [comandos de instalação/futura execução/retorno](campaign-reconciliation-prepared/POST_ACK_OWNER_STEPS.txt). O bloqueio anterior é histórico e foi preservado; não houve outra reconciliação, rebuild, instalação privilegiada, contenção, parada ou abertura.

Causa do gate: o classificador esperava lote queued, mas o produtor real `routes.ts::scheduleScopedCampaignDraft` (37784, lote37899) grava scheduled e enfileira por `enqueueCampaignExecutionJob`; schema PostgreSQL fornece job queued/attempt0. O consumidor real `campaignExecutionQueue.ts::claimNextCampaignExecutionJobAdmitted` aceita batch scheduled/running ao adquirir; scheduled não significa execução ativa. Menor correção: lote scheduled e job queued/attempt0/sem lease, inventário global exatamente igual ao aprovado. Nenhuma SQL/status de out.14 mudou. Lote queued/running/desconhecido, attempt alterado, lease atual ou expirado ainda vinculado e drift continuam negando. A classificação NÃO é certificado de drain/saída/ausência de provider.

**Prova nova aplicável:** sete casos unitários negativos/sintéticos PASS e uma integração com oito verificações em Node20.20.0/PostgreSQL16 isolado. O positivo chama as funções reais compiladas de seed/agendamento (loader só expõe exports após hash), persiste scheduled→queued/attempt0/no lease e passa pelo SQL e módulo final preparation-bindings. O consumidor compilado real não adquire antes do horário; ao adquirir no banco sintético, torna job/lote running, attempt1/lease1 e o gate nega. Nenhum estado scheduled/queued positivo foi inventado na fixture. Desconhecido/outro tenant, terminal histórico, lease expirado ainda vinculado e estados negativos são injeções explícitas no SQL sintético. Não houve HTTP/RBAC/UI nem scheduler/provider real; chamadas provider0; ledger de teste isolado e servidor encerrado. Reutilizadas provas funcionais/operacionais anteriores; sem somar verificações como casos novos necessariamente distintos.

**Preparação efetiva:** `/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-campaign-eligibility-scheduled-20261008T174500Z`. Identificador nominal; captura/política foram geradas17:38:55Z, horário real no manifesto. Inventário global fresco contém apenas out.14: lote scheduled, job queued/attempt0, zero lease. Baselines completos dos três modos, cada scripts.sha256 com27 arquivos, passaram pelo contrato real. Captura SHA `1353256ae39a599982b60a800cbcc3ceba00b03a2527c59195ee2fb0b4e2686c`; sequencer-manifest SHA `638c8caa108af349093252b42bdf6ce09982c64ee9039eae26f3debf972549e9`. Política concreta SHA `7b8ef5c45edc237a144ec4718753ad53ec53609fc3ecdb5be39484127f604ff1`, NÃO instalada. Helper SHA `8de358fd60c6e7c880166651b45d7ebd60c8f9b102759ff7f7628796fda1b212` e nove comandos sudo preservados.

Candidato API a26 inativo:8820 arquivos/11symlinks conferidos pelo manifesto atestado. Schema/lock/dependências/auth/data compartilhados preservados; worker mínimo reativo afbb PACKAGE_FILES conferido, sem novo patch/rebuild. Retorno API afbb; frontend fa60 intacto. O frontend atual é launcher cluster_mode: nova preparação confere tracked config publicado com PM2 e pm2_env serializado, registra ambiente inicial completo no binding do processo preservado; não altera checker, cfg produtiva ou lançamento. Templates históricos af26 geraram duas recusas preparatórias antes da política; gerações/diagnósticos íntegros, nova composição usou a identidade já documentada desde antes do ack. Ligação .data da nova API foi explicitamente fixada ao mesmo alvo da origem.

Conferência final real (somente leitura) validou os contratos, manifests, os mesmos PIDs/ticks online/restart0, bindings de data, worker, proxy e saved/fallback/cron/boot. Uma asserção administrativa inicial comparou baseline resumido tasks0 com ledger tasks:{}; diagnóstico preservado, correção apenas do driver privado, exigindo ledger integral idêntico ao pós-ack. O sequenciador final negou `execution_gates_incomplete` com os cinco gates falsos, antes de inspect/prova/efeito operacional. Backup pré-SQL17:00/restore17:01 reutilizado; hash `a37f8d4f2cd805686c65096e2652c2d483425ed831067cfbc47887acd366dafd`; será reconfirmado por frescor/estado na futura janela. Não se declara snapshot pós-SQL nem restore produtivo.

Guarda35 fechada/tasks:{}; out.14 não alterada; API/worker afbb e frontend fa60 continuam efetivos. Instalação/inspect root da política nova e futura janela aguardam revisão/autorização próprias; decisão de abrir guarda por CAS permanece separada após conferência global. CRM→BOT separado, agrupamento natural/AUTO/CRA-PR pendentes e reparo de setembro CLOSED mantidos.

### Coerência do consumidor de retorno pós-unfence

A montagem final encontrou duas dependências do contrato antigo no gerador de retorno: extração da SQL embutida/contagens escalares e limite26. O [patch atestado](campaign-reconciliation-prepared/waiting-return-v4.patch) usa a SQL e noWork efetivos do mesmo módulo, em transação READ ONLY com timeout, copia o inventário esperado e waiting-work.cjs e exige27 arquivos. Nenhuma identidade/certificado/nonce/ausência de worker foi relaxada. Origem f015ee55 e resultado bbca3061 completos no manifesto do patch. Quatro verificações dirigidas PASS: função real alterada + Node20 real/classificador/captura do agendamento isolado; somente leitura Docker simulada. Lease/running/desconhecido negam. Geração integral pós-unfence não foi executada nesta preparação e não recebe PASS por essas quatro verificações. Demais provas do retorno foram reutilizadas, sem reatribuição. O manifesto final incorpora esses bytes.

## Instalação exclusiva da política — 08/10

**POLICY_ONLY_INSTALLED_BASELINES_INSPECT_PASS_GATES_FALSE / NOT DEPLOYED.** [Resultado sanitizado](campaign-reconciliation-prepared/policy-installation-result-20261008.json). Deifson executou somente o bloco A autorizado de26d1d95e na sua sessão sudo. Não foi solicitada/capturada senha. Horário exato da instalação não informado; conferência independente concluída18:50:38Z (15:50:38 Fortaleza).

Política instalada SHA256 `7b8ef5c45edc237a144ec4718753ad53ec53609fc3ecdb5be39484127f604ff1`, root:root0600. Anterior SHA256 `00912bf4e0f44d88b0c9c639ba8a3d7dd773b317ea24f9df35dbef4e4e06add9` preservada em `/usr/local/libexec/re7/incident-6683-window-policy.pre-campaign-eligibility-scheduled-174500.json`, root:root0600. Hashes instalado/arquivado e sudoers foram conferidos na saída privilegiada fornecida pelo owner; não se afirma leitura direta do arquivo0600 como deploy. Helper inalterado8de358fd…a1b212, root:root0644; sudoers inalterado root:root0440; cadeia root-owned sem symlink/escrita indevida exibida, visudo antes/depois PASS. Três manifests de27 arquivos PASS.

Conferência própria somente leitura, sob lock global: contratos/baselines/hash/paths, mesmo worker mínimo, helper e proxy, identidades PM2/proc e daemon, sessões/auth/configurações, cron/deploy-cron/boot e saved/fallback iguais aos bindings. `Bridge.privileged('inspect')` reconheceu exatamente o hash novo, **phase:null/sourceProcessesAlive:true**; stdout/stderr ficam no logger privado. Gates exigidos por igualdade exata: ownerAuthorized=false/preflightReviewed=false/artifactsVerified=false/restoreVerified=false/discrepanciesResolved=false. Nenhuma autorização de janela foi herdada da instalação.

SQL de inventário global READ ONLY/timeout conferiu o mesmo out.14: job queued/attempt0, lote scheduled, zero lease; sem trabalho desconhecido/drift. Guarda integral permanece pós-ack35 fechada/tasks:{}; recibo/tarefa/históricos intactos. API/worker afbb e frontend fa60, PIDs/ticks e reinícios preservados. Backup/dump a37f8d4f…6dafd íntegro e prova de restore mantida; ele é pré-SQL de17:00 e não foi repetido. Frescor/estados para futura janela não são automaticamente atestados por esta instalação.

Nenhuma reconciliação/ack, prova de parada/start, contenção, restart/deploy, envio, reparo ou abertura executados. A política instalada não abre janela por si. Uma futura troca e eventual abertura CAS continuam decisões separadas; CRM→BOT, agrupamento natural/AUTO/CRA-PR e setembro CLOSED preservados.
