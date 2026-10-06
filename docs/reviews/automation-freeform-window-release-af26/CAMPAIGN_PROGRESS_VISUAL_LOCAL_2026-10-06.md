# Campanhas — fila imediata e atualização dos detalhes, 06/10/2026

**LOCAL VALIDATED / FOR REVIEW / NOT DEPLOYED.** Base examinada: `09795916e73d6cec61717f147ec81939b5cf6867`, branch `review/campaign-recovery-20260926`. Delta exclusivamente frontend, testes e documentação. Nenhum envio, conexão produtiva, reparo, alteração de tenant, scheduler/job/status persistido, schema, migration ou restart nesta etapa.

## Desenho e versões reconciliados

Consultados os contratos [Composer Lifecycle](../../saas/CAMPAIGN_COMPOSER_LIFECYCLE.md), [Result Truth](../../saas/CAMPAIGN_RESULT_TRUTH_CANONICAL_RECONCILIATION_2026-09-18.md), [Import Requirements](../../saas/CAMPAIGN_IMPORT_REQUIREMENTS.md), [Dynamic CRM Scheduling](../../saas/DYNAMIC_CRM_FILTER_CAMPAIGN_SCHEDULING.md), backlog, handlers e os aceites CRM `7709b49a`/CSV `09795916`. O texto histórico do lifecycle sobre cadastro CRM no rascunho CSV não substitui o contrato posterior de bootstrap na execução, comprovado pelo aceite CSV; esta correção não muda essa fronteira.

A composição produtiva registrada é API `afbb7455f320793e05a25875e8a5f13f98cabf90`, worker mínimo reativo correspondente e frontend af26. A comparação Git de `af26f48a` até a base nos arquivos `src/app/app/campaigns/page.tsx` e `src/lib/appUxLabels.ts` é vazia: a apresentação auditada corresponde à fonte do frontend implantado. Não houve nova investigação produtiva; reutilizadas as evidências dos aceites.

Histórico de todos os refs para a página, textos e polling, e worktree `review/campaign-service-recovery-20260926`, examinados sem encontrar uma correção pronta deste defeito. Alterações preexistentes do worktree principal e evidências privadas foram preservadas. Reutilizados os leitores `listAppCampaigns`/`getAppCampaign`, projeção de resultado, labels, timer e invalidação por geração já usados nas prévias; sem websocket, cache ou máquina de estados novos.

## Causa demonstrada e contrato preservado

`apps/whatsapp-agent/src/http/routes.ts`, envio imediato de rascunho (`sendScopedCampaignDraft`, bloco `status: "scheduled", scheduledAt: null`), enfileira job com `eligibleAt: new Date()`. Retomada também usa scheduled/null; envio manual pode usar scheduled/data atual. Agendamento futuro usa `scheduledAt` e elegibilidade datados. `scheduled` é um estado de execução persistido compartilhado: **null indica envio imediato em fila, não um agendamento futuro sem horário**. A resposta inicial pode continuar scheduled mesmo que o processamento já tenha avançado no servidor.

Modalidades existentes: manual/avulso (`manual_campaign_send`), Audiência CRM (`crm_audience_preview`, rascunho/preview/split) e Importação CSV (`recipient_import:csv`, rascunho CSV). Todas desembocam nos leitores e apresentação comuns. Público dinâmico, agrupamento e agendamento conservam seus contratos/handlers.

A página aplicava a scheduled/null o banner “Envio agendado / Sem horário definido”. Ambos os timers (3s e 2,5s) exigiam sending, portanto a resposta inicial scheduled impedia observar a transição e o resultado sem atualização manual. O leitor do timer também podia aplicar um detalhe atrasado após trocar a seleção.

## Menor correção

- Helper de apresentação `campaignPresentation.ts`: scheduled/null → “Na fila de envio”, banner “Envio imediato na fila”; fila imediata entra na aba/contagem visual Enviando. Status persistido e autorização de ações continuam originais. Agendamento com data mantém Agendadas e data/horário formatados. A simples passagem do relógio não inventa sending.
- Um único timer existente de 3s observa scheduled e sending, atualiza detalhe e lista pelos leitores atuais, sem ticks sobrepostos. Inclui futuros agendamentos para observar sua entrada em processamento. Cessa quando não há campanhas pendentes na lista/detalhe. Não promete atualização instantânea: intervalo, rede e resposta do servidor determinam latência.
- Geração de leitura, última requisição e vínculo à sessão/ID impedem que respostas antigas substituam outra campanha. Seleção invalida detalhe, preservando a lista do tenant; mudança de sessão/desmontagem invalidam ambas. Snapshot só é apresentado quando corresponde ao ID selecionado. Erros de leitura preservam o detalhe atual; não iniciam ações de envio.
- Projeção existente continua distinguindo entrega, falha, bloqueio e entrega parcial. SENT não vira recebimento. Labels dos lotes agrupados permanecem originais, pois não possuem scheduledAt; não inferir fila imediata nesses lotes.

Não há incompatibilidade que exija alteração backend. Endpoints autenticados, tenant da sessão, RBAC, ações e três modalidades mantidos. API/worker/frontend produtivos permanecem como antes; eventual implantação desta revisão exige somente frontend, em etapa separada.

## Validação dos bytes finais

| Verificação | Resultado e alcance |
| --- | --- |
| Node 20.20.0, testes focados | **59/59 PASS**: 12 casos novos de apresentação/geração + regressões de contratos da página, Result Truth, drafts, lifecycle e reuse preview. Três origens imediatas, relógio controlado para futuro, terminais/parcial, sessão/seleção. Não equivale a repetir envios das modalidades. |
| Navegador | **10/10 PASS** sobre página Next real, Chrome e snapshot agent-browser: fila inicial/lista sem esperar polling; sending; conclusão e parada do timer; data futura; entrada do agendamento em sending; falha terminal; parcial; resposta A atrasada com B selecionada; erro de leitura; desmontagem. Polling com relógio controlado, autenticação e APIs sintéticas. Sem backend/provider; requests externos bloqueados e zero ação operacional de campanha. Não é aceite produtivo nem prova de autorização backend. |
| Build frontend | **PASS**, Next 16.1.5/webpack, Node 20.20.0, cópia isolada das fontes/configurações finais incluindo Tailwind, mesmas dependências, sem configuração produtiva. Avisos existentes de múltiplos lockfiles/Browserslist não foram corrigidos incidentalmente. |
| Tipagem integral | `tsc --noEmit --incremental false`: **22 diagnósticos preexistentes, saída integral byte a byte igual à base** com as mesmas dependências/comando. Nenhum erro novo; não declarar tipagem integral aprovada. |
| Lint | Helper, teste e contratos: PASS. Página: mesmos três achados da base (unused sent e dois react/no-unescaped-entities), com linhas deslocadas; não declarar lint global aprovado. |
| Diff/publicação | `git diff --check` PASS; staging explícito, sem evidências/configurações privadas. Branch excluída de deploy em vercel.json; único workflow CI tem push main/develop. Sem merge/deploy. |

Comandos reproduzíveis (Node 20.20.0 disponível no ambiente; dependências existentes):

```bash
node apps/whatsapp-agent/node_modules/tsx/dist/cli.mjs --test src/lib/campaignPresentation.test.ts src/app/app/campaigns/campaignsPageContract.test.ts src/lib/campaignResultEvidence.test.ts src/lib/campaignDrafts.test.ts src/lib/campaignComposerLifecycle.test.ts src/lib/campaignReusePreview.test.ts
npx tsc --noEmit --incremental false
npx eslint src/lib/campaignPresentation.ts src/lib/campaignPresentation.test.ts src/app/app/campaigns/campaignsPageContract.test.ts
```

Smoke em terminal local separado, sem backend/providers:

```bash
NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_WHATSAPP_AGENT_BASE_URL=http://127.0.0.1:3999 npx next dev --webpack -H 127.0.0.1 -p 3078
AGENT_BROWSER_BIN=/caminho/local/do/agent-browser node tests/browser/campaignProgress.mjs http://127.0.0.1:3078
```

O runner requer Chrome em `/usr/bin/google-chrome`, porta CDP 9248 livre e CLI agent-browser. O caminho do CLI é uma dependência local, não credencial. Evidências/logs/screenshots ficam em local-evidence fora do Git. A autenticação sintética não fabrica sessão produtiva. Build realizado em diretório privado isolado; não alterou artefatos ativos. Não repetidos builds/testes backend/worker sem delta.

## Aceites existentes e pendências

| Aceite controlado | Versão e limites preservados |
| --- | --- |
| [Avulso — ciclo demo completo](HYBRID_B9_CONTROLLED_VALIDATION_2026-10-05.md) | b9, 05/10: campanha Meta → inbound Web canônico → Atendimento Geral/Fila Geral → claim/protocolo/resposta humana; recebimentos confirmados pelo owner. Não prova todas as modalidades/transportes. |
| [CRM estático/imediato](CRM_AUDIENCE_CONTROLLED_VALIDATION_2026-10-06.md) | afbb, publicado em `7709b49a`: um destinatário, mesmo ciclo canônico, atendimento/recebimento confirmados. Seleção Meta explícita; não valida Auto. |
| [CSV individual/imediato](CSV_CONTROLLED_VALIDATION_2026-10-06.md) | afbb, publicado em `09795916`: um destinatário, retorno e atendimento confirmados, sem novas duplicações. Não valida agrupamento/agendamento. |

Agrupamento, audiência dinâmica, agendamento produtivo, contingência Auto por indisponibilidade e aceite específico CRA-PR permanecem **PENDING**. Claim backend com janela fechada e status atrasados concorrentes seguem não exercitados produtivamente conforme os relatórios. Este smoke não os encerra. Defeito visual corrigido localmente, ainda presente no frontend produtivo até eventual publicação controlada. Históricos intactos, setembro CLOSED; SECULT/DB-only encerradas e inatividade Guia pausada.
