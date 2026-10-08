# Demo out.13 — elegibilidade e recuperação preparada

**Atualização de execução08/10: DEPLOYED TECHNICALLY / OWNER FUNCTIONAL VALIDATION PENDING.** [Registro e evidência sanitizada](campaign-reconciliation-prepared/operational-composition-20261008/DEPLOYED_2026-10-08.md). APIa26 implantada; mesmo workerafbb e frontendfa60 preservados, closed35/out.14 aguardando. As seções anteriores de preparação/retorno abaixo são históricas; não houve nova reconciliação, abertura ou envio.

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


## Pré-condições restantes concluídas — backup pós-reconciliação, 08/10

**PRECONDITIONS VERIFIED / GATES FALSE / NOT EXECUTED / NOT DEPLOYED.** [Resultado consolidado e hashes completos dos três modos](campaign-reconciliation-prepared/postack-preconditions-result-20261008.json). Última leitura19:13:12Z (16:13:12 Fortaleza), sob lock exclusivo do procedimento. API candidata não iniciada; API/worker afbb e frontend fa60 permanecem efetivos. Nenhuma contenção, parada/partida, reconciliação, acknowledgement, abertura ou envio nesta rodada.

| Requisito | Resultado e alcance |
|---|---|
| Backup pós-reconciliação | PASS: captura19:02:08–19:02:59Z; dump31519208bytes,614 objetos de catálogo; arquivos operacionais, runtime/auth e conteúdo com hashes/readback. Backups anteriores preservados. |
| Restauração isolada | PASS: concluída19:08:24Z, PG16.15/Unix socket sem TCP, sem aplicação/provider;70 tabelas,60 migrations concluídas/seis rollbacks históricos, zero divergência/arquivo de migration ausente. Banco temporário removido e instância encerrada. |
| Integridade pós-ack no restore | PASS: um recibo,1 SENT preservado,1 FAILED131026,4 bloqueados, out.14 scheduled/queued/attempt0 e zero leases. Verificação SQL do dump restaurado, sem nova reconciliação nem reprodução de aceite pelo frontend. |
| Artefatos/bindings | PASS: candidato8820 arquivos/11 symlinks conferidos contra manifesto4fe74088…5263c, worker mínimo completo contra PACKAGE_FILES.sha256, Node20.20.0, bindings atuais/data compartilhados preservados. Sem rebuild/testes funcionais repetidos. |
| Baselines/modos | PASS: contrato real validado nos três modos;27 entradas por scripts.sha256. Provas de backup/restore atualizadas nos três modos; baselines de configuração, sessões/auth e inventário permanecem iguais, sem adaptação para aceitar drift. Manifests/backup/provas anteriores arquivados. |
| Proxy/identidades/controles | PASS: observador existente confirmou identidade/hash do proxy; API/worker/frontend/daemon correspondem à política e configurações atestadas, online/restart0. Cron, crontab, boot inactive/enabled e saved/fallback iguais às capturas. Inspect confirma política7b8ef5c4…04ff1, phase:null, origem viva e barreira ausente. Helper/política/sudoers não alterados. |
| Guarda/fila global | PASS: ledger integral igual ao pós-ack, closed35/tasks:{}; cinco gates exatamente false. Consulta global READ ONLY/timeout retorna apenas out.14: um lote scheduled, um job queued/attempt0, sem lease; controlador/IDs iguais. Nenhuma escrita em out.14. |

Dump SHA-256: `ce2154e91169c159d7708b89a7474c00f21edcf4f92a7b739cd586e5baca6317`. Manifesto do backup: `d3ed4cccd7c924863689d70babeb872b9f081a01a5a837b6cc0a9ec7092dc93e`. Restore vinculado: `3f639e472998ea18524b467808738a173cd2cba4715da0ef506d0afcb19da99a`. Sequencer-manifest atual: `0772cafff15de13597609da4c84b62aefb20e721980969447fc83929a6bb0c9c`.

Armazenamento privado novo: `window/postack-backup-20261008T190208Z` na preparação174500Z existente. Provas/manifests/arquivos substituídos somente no staging foram preservados em `window/backup-bindings-pre-postack-20261008T190208Z`, com manifesto do arquivo histórico. O manifesto do sequenciador continha campos **descritivos herdados** de b9/af26; foram alinhados ao candidato revisado a26, frontend fa60 e worker mínimo reativo afbb. Configurações executáveis, módulos, baselines, política e identidades não mudaram; evidências de validação herdadas foram explicitamente identificadas como históricas.

Diagnóstico preservado: a primeira tentativa local de restore não iniciou o servidor porque o sandbox negou o bind Unix (`Operation not permitted`). A nova tentativa usou outro diretório isolado e o mesmo dump verificado; nenhuma aplicação ou conexão produtiva foi iniciada. Não houve outro bloqueio na conferência final.

Limites: o dump PostgreSQL é consistente internamente; arquivos operacionais/auth/conteúdo e DB não constituem snapshot atômico conjunto. O backup agora contém a reconciliação, mas frescor, estados e exclusividade exigem reconfirmação imediatamente antes de futura janela autorizada. Não foi emitida prova de execução/preflight, intent ou certificado de saída; o sequenciador continua negando `execution_gates_incomplete`. Os cinco gates falsos são controles de execução, não indicação de falha dessas verificações de preparação. Abertura da guarda por CAS continua separada, após inventário global atual. CRM agrupado/execução natural, contingência Auto e aceite CRA-PR permanecem pendentes; reparo setembro CLOSED e históricos intactos.


## Janela autorizada e retorno comprovado — 08/10

**RETURNED TO AFBB / CORRECTIVE API NOT DEPLOYED.** [Resultado sanitizado](campaign-reconciliation-prepared/window-return-result-20261008.json). A preparação174500Z está consumida e preservada; não pode ser reutilizada. Guarda35 fechada/tasks:{}, cinco gates novamente falsos e out.14 intacta. Nenhum envio de teste, reenvio, nova reconciliação/ack, reparo ou restore produtivo.

### Pré-condições e backup imediato

Sob execução exclusiva, conferidos baselines/manifests/bindings, artefatos, helper/política/inspect phase:null, origem online/restart0, proxy e inventário global exato de out.14 aguardando. O backup19:02Z tinha aproximadamente1h20; foi preservado e substituído no staging por captura20:25:38–20:26:28Z. Dump31628847bytes/614 objetos, SHA256 `796d1743ff032fe80e32d7941a9f2f2b7f40884f4a4571b958414173acd96f4a`. Restore isolado20:27:54Z:70 tabelas/60 migrations, zero checksum/arquivo ausente, seis rollbacks históricos; recibo1/SENT1/FAILED1310261/bloqueados4, out.14 aguardando/zero lease. Banco temporário removido, servidor encerrado, TCP/app/provider ausentes. Provas/manifests anteriores arquivados; dump/arquivos continuam não atômicos entre si.

### Falha demonstrada, não falha do artefato funcional

`switch/start:re7-whatsapp-agent/execute` terminou exit1 com **process_config_drift**, em `ops.py::start → config → System.check_config`. A única chamada PM2 iniciou a API **afbb**, PID3608495/ticks2127578452, em vez do candidato. Cwd/script observados eram da afbb; o JSON de destino exigia `campaign-eligibility-recovery-final-reviewed-20261008`. O candidato funcional não foi executado nem chegou a servir tráfego.

Causa rastreada no gerador privado efetivo `prepare-v4-scheduled-final.private.py`: reconstruiu candidate.config/return.config JSON, alterou cwd/script/build da candidata e a configuração do frontend, mas copiou os arquivos `.ecosystem.config.cjs` do modelo anterior sem reconstruí-los desses JSONs. O manifesto atestou os bytes copiados, não a correspondência JSON↔ecosystem. O preflight validava origem real, configurações JSON, arquivos e contratos, porém faltava essa verificação semântica do comando que iniciaria o PM2. A afirmação anterior de composição pronta foi insuficiente; não atribuir a falha ao PM2 nem ao código funcional.

O intent da ida permaneceu completo, sem marcador started, e o sequenciador negou **ambiguous_start_intent_requires_observation**. Não repetimos a partida nem fabricamos started. Observação comprovou a configuração completa da API afbb viva e frontend preservado, com worker ausente. O retorno parcial original esperava a candidata como origem e também não podia avançar.

### Recuperação especificamente autorizada e encerramento

Deifson autorizou expressamente corrigir essa composição e concluir o retorno afbb. Origem antiga do retorno parcial SHA `d95c2b8397c09b01b0db078e2a33823b4c1176172fd0b29449ce1bfd6a681ef7` arquivada; origem afbb observada e integralmente conferida SHA `4d77f8cc9bf939a77c82a7d63503c835fb26b9c3486d7770307c0ddc063df752`. O ecosystem de destino do retorno foi serializado do JSON já atestado, sem alterar o destino. Manifests originais preservados; helper/política/sudoers/nove comandos não mudaram. Não se fez a ida aceitar a divergência.

Retorno parcial executou recover-partial com prova fresca: saída da API afbb divergente e da origem anterior, descendentes/sockets e zero backends/locks antes do sucessor. API afbb de retorno iniciou uma vez; prova V4 fresca confirmou suas conexões e o mesmo worker iniciou uma vez. Frontend não recebeu stop/start.

A finalização encontrou **KeyError:return-partial**: política root oferece switch/return, mas captura consultava targetProcesses[return-partial] e gravava a captura nesse caminho. [Patch mínimo e hashes](campaign-reconciliation-prepared/partial-return-capture-v4-manifest.json), [bytes](campaign-reconciliation-prepared/partial-return-capture-v4.patch): somente lookup/caminho da captura mapeiam return-partial→return, mantendo modo operacional/markers no retorno parcial. Origem0eaedc66…548d9d → resultado `df0ba9bd3ffee691b037c9bfa67cddbb553ffa94a3011ed2f7a36ad331a57d85`. Nenhuma negativa de PID/ticks/daemon/árvore/sockets/guarda/barreira foi relaxada; helper root revalidou integralmente a captura nova no caminho fixo. Captura anterior arquivada e renovada com duas amostras consistentes, tentativas limitadas. Prova real é esta finalização; não atribuir os testes históricos de outro cenário à composição. Aplicação do patch à origem atestada/hash final/sintaxe conferidos isoladamente, sem build/suítes funcionais repetidos.

Um driver privado de finalização teve erro de sintaxe antes de executar qualquer instrução; diagnóstico e original preservados, corrigidos/conferidos antes da transferência seguinte. A retomada executou **somente finish**, sem outra partida ou stop-pair. PM2/fallback salvos antes do unfence; authorize-return e revalidação root passaram.

| Checkpoint confirmado | UTC | Fortaleza |
|---|---|---|
| Contenção aplicada |20:29:29.610|17:29:29|
| Par antigo saiu |20:29:41.046|17:29:41|
| Recusa da identidade da partida de ida |20:29:57.547|17:29:57|
| API divergente saiu no retorno parcial |20:37:35.257|17:37:35|
| API afbb retornada identificada |20:37:37.898|17:37:37|
| Worker retornado identificado |20:37:41.618|17:37:41|
| Barreira retirada |20:42:46.461|17:42:46|
| Controles restaurados/conclusão |20:42:50.236|17:42:50|

Intervalo entre confirmações de contenção/unfence: **796.85s,13min16.85s**. Não chegou ao horizonte15min. Esses checkpoints medem a barreira observada; não garantem inventário integral de todo inbound/outbound/auth em andamento. Evidências privadas completas, fases/intents/provas consumidas e gerações anteriores foram preservados.

### Estado efetivo após retorno

Conferência20:45:41Z PASS: API **afbb7455f320793e05a25875e8a5f13f98cabf90**, PID3610638/ticks2127625883; mesmo worker mínimo reativo afbb, PID3610861/ticks2127626254; frontend fa60 corrigido permanece PID3438948/ticks2120147745. Todos online/restart0. Health HTTP API/worker/frontend e leitura DB passaram; não equivalem a aceite da correção candidata. Sessão/Inbox/CRM/Campanhas confirmadas pelo owner somente em leitura depois do retorno.

Guarda integral e recibo pós-ack preservados. SQL READ ONLY20:48:55Z comprovou recibo1, SENT1, FAILED1310261, quatro bloqueios e out.14 aguardando/zero lease. Inventário global exato permanece um lote scheduled/job queued/attempt0; nenhum outro trabalho ou lease. Quatro ChannelAccounts conectados e cinco registros auth iguais ao baseline. Leitura única limitada dos logs20:50:54Z confirmou quatro contas runtime em open após a retomada, um evento de inicialização do scheduler e zero eventos error no trecho examinado; não é auditoria exaustiva. Scheduler habilitado, guarda fechada impede out.14. Nenhuma configuração de tenant alterada.

Barreira ausente; cron/crontab iniciais restaurados; boot inactive/enabled. Saved/fallback iguais e compatíveis com os três processos efetivos, SHA `cb6b119d75d8d8c8a72f26a02ea9a96df9425fc050ed0dfb9e2b19869bc4b3a0`. Helper/política/sudoers preservados. Gates false; a política/fase e tentativa consumidas não devem ser reemitidas como preparação pronta.

**Pendência concreta:** corrigir o produtor para derivar ecosystems dos mesmos JSONs, validar essa correspondência em TODOS os modos antes de qualquer alteração operacional, integrar o mapeamento de captura parcial e ensaiar a composição exata. A futura preparação exige novas identidades/bindings/política porque API/worker mudaram no retorno. Artefato funcional candidato íntegro/ensaios válidos permanecem reutilizáveis; nenhuma nova tentativa executada. API corretiva/aceite funcional pendentes, guarda não será aberta nesta frente. CRM agrupado/execução natural, Auto e CRA-PR continuam separados; setembro CLOSED e históricos intactos.
