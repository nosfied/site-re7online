# Audiência CRM — ciclo controlado em demo, 06/10/2026

**CONTROLLED CASE PASS / OWNER RECEIPT CONFIRMED.** API `afbb7455f320793e05a25875e8a5f13f98cabf90`, worker mínimo reativo correspondente e frontend af26 preservados. Esta rodada foi somente leitura pelo Codex; o owner executou campanha, resposta, Assumir e resposta humana pela interface/celular. Não houve deploy, alteração de configuração, reparo histórico, replay ou envio por script. Nenhum teste/build foi repetido.

## Escopo e baseline

Tenant demo-converta; destinatário sob controle do owner, final9614; template `data_exame` aprovado UTILITY/pt_BR e permitido. Baseline privado capturado antes do envio; consultas limitadas e somente leitura. Configuração observada: HYBRID com Meta e Web habilitados, **seleção explícita Meta**, não Auto; sessão Web conectada e identidade híbrida compatível. Preview CRM confirmou um destinatário elegível, sem opt-out/anonimização; owner confirmou ausência de inbound nas últimas24h. Configuração preservada.

Campanha `Campanha teste out.8`, ID `e1bc03a4-50cd-46ef-8722-a5179d73a23a`: Audiência CRM, origem `crm_audience_preview`, seleção `STATIC_RECIPIENTS`, execução imediata (`scheduledAt:null`), um destinatário. Rascunho e destino Atendimento Geral/Fila Geral conferidos **antes do envio**. Não cobre audiência dinâmica, CSV ou agendamento.

Conversation canônica `e42b1d43-b83d-4e6b-8498-85d476f18d63`; runtime ativo `c6e2156b-9e21-4632-ade3-d61f9939262a`; ciclo humano `175dbee3-6d57-4142-a5a1-aaf8381152eb`. Baseline/final: 1Conversation, 2runtimes, 2Contacts e 2Leads. Duplicidades/histórico anteriores permanecem preservados; **não houve novas identidades**, não se afirma saneamento ou histórico sem duplicidades. Runtime histórico isolado permaneceu intacto.

## Linha temporal e evidência

Horários Fortaleza (UTC−3), 06/10. Identificadores de provider, números completos, mensagens e snapshots operacionais ficam somente nas evidências privadas.

| Cenário | Resultado | Transporte e evidência |
|---|---|---|
| Envio imediato CRM | PASS | Submissão iniciada10:34:43.165; provider aceitou10:34:43.854; outbound `8ce66034-6fda-4c94-ae26-83d694853100` criado10:34:43.915, Meta/SENT/template data_exame; campanha completed1/1 às10:34:43.954. Owner confirmou chegada ao celular. |
| Campanha não fabrica inbound/janela | PASS | Antes da resposta, Conversation.lastInboundAt nulo e janela fechada; timestamps históricos do runtime não renovados e janela efetiva expirada. Não confundir flag histórica true com janela válida. |
| Resposta legítima híbrida | PASS | Inbound10:46:17, registro `ba8ddc90-ed7a-41f2-9673-9487915ad728`, WEB_SESSION vencedor; Meta duplicado deduplicado. Mesma Conversation/runtime; somente1inbound novo. Janela até07/10 10:46:17. |
| Retorno humano/setor | PASS | HUMAN/WAITING, Atendimento Geral/Fila Geral, sem responsável e sem fluxo/nó reiniciado; sem menu/outbound automático novo. |
| Assumir explícito | PASS | Às11:06:27.207, ADMIN do mesmo tenant atribuído, HUMAN/IN_PROGRESS/handoffACTIVE; setor/fila/janela/ciclo preservados. Owner confirmou toast “Conversa assumida. Ela foi movida para Em atendimento.” |
| Protocolo | PASS | Outbound `a80f776c-8d8b-47e2-a00b-29dad801b8ab`, Meta/SENT às11:06:28.288; evento notice.sent11:06:28.356, mesmo ciclo. `PROTOCOL_NOTICE / explicit / meta / HYBRID`. Owner confirmou recebimento. |
| Resposta humana Inbox | PASS | Outbound `8605b9b3-8869-4019-bccb-20e50890b439`, Meta/SENT às11:09:57.499. `INTERACTIVE_REPLY / explicit / meta / HYBRID`; uma submissão/registro novo, responsável e janela preservados. Owner confirmou recebimento no celular. |
| Novas duplicações | PASS neste caso | Conjuntos de IDs de Conversation/runtime/Contact/Lead iguais ao baseline; mesmo ciclo e runtime histórico intacto. |

Leitura final às11:12:39. SENT e presença de identificação de aceitação do provider foram observados; recebimento é confirmação **separada do owner**, não inferência de SENT nem alegação de DELIVERED/READ por webhook. A consulta auxiliar por igualdade direta de requestId/messageId não encontrou vínculos Message para os três outbounds (0); ela não demonstra ausência de mensagens nem é usada como prova de associação. Associação neste relatório usa inbound persistido, identidade canônica, runtime/ciclo e snapshots correlacionados.

## Limites e próximos aceites

**NOT EXERCISED nesta rodada:** claim backend com janela fechada antes do provider; audiência dinâmica; CSV; agendamento; contingência Auto por indisponibilidade/desconexão; META_CLOUD puro; status atrasados concorrentes com intervenção; aceite específico CRA-PR. Não provocar corrida produtiva. As provas locais existentes permanecem separadas. Seleção Meta explícita explica protocolo/resposta Meta mesmo com inbound Web: este caso não valida fallback Auto.

O aceite é do ciclo controlado **Audiência CRM estática/imediata → campanha Meta → resposta Web canônica → setor correto → atendimento humano Meta**, conforme ações e recebimentos relatados pelo owner. Não constitui aceite global de Campanhas/CRA. Os quatro históricos permanecem intactos, reparo de setembro CLOSED; SECULT/DB-only encerradas e inatividade no Guia pausada.

## Defeito visual separado — OPEN, sem correção incidental

Owner observou “Envio agendado / Sem horário definido” após envio imediato e detalhes sem atualização durante/final do envio. Persistência comprova scheduledAt nulo, job elegível imediatamente, completed1/1 e recebimento confirmado: não houve agendamento futuro real.

Referências: `apps/whatsapp-agent/src/http/routes.ts`, handler de envio imediato CRM, persiste inicialmente status scheduled e scheduledAt null; `src/app/app/campaigns/page.tsx` envio do rascunho mantém selectedCampaign com resposta inicial, apresentação de scheduled usa os textos acima, e polling de detalhes exige status sending. O frontend af26 ativo não difere desses trechos na árvore examinada. A condição inicial impede observar o progresso sem nova leitura/refresh. Registrar correção futura de semântica visual e atualização dos detalhes; não mudar scheduler/execução para esconder o defeito. Nenhum código funcional foi alterado nesta rodada.

## Publicação e privacidade

Somente este relatório e atualizações canônicas são versionados. Evidências completas ficam em `local-evidence/crm-acceptance-afbb-20261006/` e na preparação privada da VPS, fora do Git. Branch review/campaign-recovery-20260926 excluída do deploy em vercel.json; CI push restrito a main/develop. Publicação documental não é deploy.


## Preparação separada — agendamento real individual, 07/10/2026

**PREPARATION READ-ONLY COMPLETE / SCHEDULED EXECUTION NOT EXERCISED.** Não altera o aceite estático/imediato acima nem constitui aceite de agendamento. APIafbb/worker mínimo reativo/frontend9f confirmados em leitura às10:26:16 Fortaleza, mesmas identidades e restart0; guarda aberta33, tasks{}, schedulerDisabledfalse. Nenhum deploy/start/alteração operacional, criação/agendamento/envio de campanha ou reparo nesta preparação.

### Contratos e mecanismo reaproveitados

Consultados [Composer Lifecycle](../../saas/CAMPAIGN_COMPOSER_LIFECYCLE.md), [agendamento estático/dinâmico](../../saas/DYNAMIC_CRM_FILTER_CAMPAIGN_SCHEDULING.md), [Result Truth](../../saas/CAMPAIGN_RESULT_TRUTH_CANONICAL_RECONCILIATION_2026-09-18.md), checklistCRA, backlog, aceites avulso/CRM/CSV e relatório frontend9f. Os status/versões antigos nesses contratos são evidência histórica; versão produtiva atual é a composição afbb/worker mínimo reativo/9f. Reutilizadas provas locais de lifecycle (data futura UTC), fila (eligibleAt/lease/idempotência), Result Truth por identidade canônica e apresentação/polling59 testes/10 cenários isolados; nenhuma suíte/build repetido nesta preparação.

Menor modalidade: **Audiência CRM / Destinatários fixos / um destinatário**, rascunho novo individual sem executionBatch, seguido de Agendar no detalhe. A seção manual avulsa do frontend é “Envio imediato manual (avançado)”/“Enviar agora”; não é o caminho de agendamento. CRM reaproveita contato elegível e não exige importação CSV ou audiência dinâmica. `handleCreateDraftFromAudience` salva leadIds explícitos; `handleScheduleDraftCampaign` envia ISO UTC a POST `/app/campaigns/:id/schedule`. `normalizeScheduledAt` nega passado; `scheduleScopedCampaignDraft` exige tenant, draft, template/variáveis, destino e elegibilidade/opt-out. Grava Campaign.scheduledAt e campaign.scheduled com o mesmo instante. Não iniciar/enviar rascunho para provar agendamento.

`processDueScheduledCampaignsAdmitted` seleciona scheduledAt<=now e enfileira com eligibleAt igual ao instante e idempotencyKey `scheduled:<id>`; execução deixa campaign.scheduled.started. Intervalo nominal do scheduler60s, não garantia de execução pontual: observar atraso/fila e não clicar Enviar agora ou repetir Agendar para forçar. O frontend9f mantém agendados datados na aba Agendadas e usa polling existente3s para scheduled/sending até terminal, com invalidação por seleção/sessão; não prometer atualização instantânea.

### Pré-condições efetivamente conferidas

Owner indicou `Campanha teste out.10`, final9614 e `data_exame`; horário proposto07/10/2026 10:30 Fortaleza = `2026-10-07T13:30:00.000Z`. Esse horário ainda era futuro na última leitura10:26:54; **só usar se continuar futuro após revisar o rascunho e deixar margem para a observação anterior ao disparo**. Se a margem acabar, solicitar novo horário ao owner; não converter automaticamente para envio imediato nem inventar outra data.

Tenant `demo-converta`/Converta Demo ACTIVE; template data_exame approved/UTILITY/pt_BR, categoriaUTILITY permitida. Resolvedores compilados efetivos às10:24:12: HYBRID com Meta/Web habilitados, seleçãoMeta explícita preservada, template ready/meta/hybrid_template, identidade híbrida sem conflito e números canônicos correspondentes. Há dois telefones Meta cadastrados; IDs completos/associação efetiva e configurações ficam no baseline privado, não confundir contagem com seleção de conta. Web consta connected. Nenhuma mudança para Auto necessária.

Às10:25:26, resolvedor real de prévia CRM com busca9614 retornou total1/eligible1/blocked0, sem truncamento; filtro de opt-out: zero bloqueios. A audiência final salva deve ser conferida novamente por ID antes de agendar. Destino Atendimento Geral ativo, escolher **Atendimento Geral / Fila Geral**; também existe Fila principal, que não é a escolhida.

Baseline às10:24:45: uma Conversation correspondente, dois runtimes/dois Contacts/dois Leads preexistentes no recorte pesquisado; não zerar/fundir/anonimizar ou interpretar esses totais como novas duplicações. O resolvedor CRM retorna uma identidade elegível para a seleção. Último inbound legítimo06/10 10:46:17 Fortaleza, janela até07/10 10:46:17. Portanto às10:30 a janela estará legitimamente aberta: a prova pode demonstrar **lastInboundAt e expiry preservados**, mas não envio partindo de janela fechada. Nenhum encerramento de atendimento ou alteração de timestamp para fabricar o baseline. Às10:26:54 não existia campanha com o nome proposto; somente um rascunho novo criado pelo owner poderá ser usado.

### Roteiro do owner — ações futuras, não executadas nesta preparação

1. Na sessão autorizada de demo-converta: Campanhas → Criar campanha → configurar nome Campanha teste out.10, modelo data_exame e preencher/mapear variáveis obrigatórias. Selecionar retorno Atendimento Geral/Fila Geral.
2. Audiência CRM → Destinatários fixos → Busca9614, canalWhatsApp, excluir opt-out, atualizar prévia. Prosseguir apenas se houver um destinatário elegível sob seu controle, sem conjunto/agrupamento. Criar rascunho com audiência uma vez. Informar o nome/toast para conferência somente leitura do ID, seed, conta/destino, variáveis e população salva. Não clicar Enviar agora.
3. Após essa conferência, no detalhe do rascunho → Agendar envio. Navegador deve estar no fusoFortaleza/UTC−3: o input datetime-local usa o fuso do navegador e new Date(...).toISOString(), não fixa o fuso do tenant. Para o horário proposto, preencher07/10/2026 10:30 e conferir a mesma data/hora exibida. Agendar uma vez apenas se ainda futuro com margem; informar toast e horário mostrado. Sem reuso de campanha concluída.
4. Manter o detalhe aberto até o terminal, sem Enviar agora/reenvio/replay. Codex acompanha com leituras delimitadas abaixo. Relatar rótulos/status e recebimento no celular separadamente. Não responder nem assumir/transferir enquanto se confere a preservação da janela; este aceite não requer novo atendimento humano.

### Matriz da futura observação limitada

| Cenário | Estado nesta preparação | Evidência necessária depois das ações do owner |
| --- | --- | --- |
| Persistência/UI do horário | NOT EXERCISED | Campaign.scheduledAt + campaign.scheduled + seed e horário exibido; 10:30UTC−3 equivale13:30Z, revalidar no horário efetivamente escolhido |
| Nenhuma submissão anterior | NOT EXERCISED | snapshot após agendar e antes de T: zero submit_started/provider_accepted/Outbound deste ID; depois correlacionar todos os timestamps, não confundir campanha antiga do mesmo contato |
| Scheduler/submissão única Meta | NOT EXERCISED | campaign.scheduled.started, job/eligibleAt/lease/idempotência, submit_started→provider_accepted e um Outbound providerMeta correlacionados ao novo ID; sem trigger manual |
| Atualização até terminal/Result Truth | NOT EXERCISED | relato/UI versus status/contadores/recipient result atuais; completed/jobcompleted ou SENT provam processamento/submissão, não entrega; DELIVERED/READ por webhook e recebimento relatado são evidências distintas; blocked/FAILED não são sent |
| Janela/inbound preservados | NOT EXERCISED | comparar IDs e lastInboundAt/windowExpiresAt com baseline imediatamente anterior; zero inbound novo até a conferência; caso já aberto não prova criação desde janela fechada |

Coletas antes deT, após o tick natural e no terminal, com timeout/limites e eventos exclusivamente da nova campanha; sem polling indefinido. Falha/ambiguidade deve ser registrada e delimitada, sem retry ou reparo para obter PASS. Dados completos/evidências ficam privados na preparação frontend9f/scheduled-validation, fora do Git. Esta campanha individual/estática não encerra agrupamento, audiência dinâmica, Auto, retorno híbrido novo ou CRA-PR; aceites anteriores permanecem separados.
