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
