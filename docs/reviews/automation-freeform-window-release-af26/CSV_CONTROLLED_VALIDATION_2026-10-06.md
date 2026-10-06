# Importação CSV — ciclo controlado demo, 06/10/2026

**CSV INDIVIDUAL/IMEDIATO: CONTROLLED CASE PASS / OWNER RECEIPT CONFIRMED.** API `afbb7455f320793e05a25875e8a5f13f98cabf90`, worker mínimo reativo correspondente, frontend af26 preservado. Esta rodada não implantou código nem alterou configuração, sessão ou dados históricos. Owner importou/revisou/enviou pela interface e realizou as interações no próprio celular/Inbox. Codex acompanhou somente por leituras limitadas; sem scripts de envio, replays, reparos, desconexão ou novas suítes/builds.

## Baseline e rascunho

Tenant demo-converta; destinatário sob controle do owner, final6787; template `data_exame`, approved, UTILITY/pt_BR, categoria permitida. Em11:23:16 Fortaleza, mesmos PIDs/start ticks de API/worker/frontend afbb/af26, todos sem reinícios. Seleção **Meta explícita**, HYBRID disponível com Meta/Web habilitados e identidades compatíveis; Web connected. Não foi selecionado Auto nem provocada indisponibilidade.

Baseline11:23:41 e resolvedor compilado de candidatos aprovados: nenhum Conversation/runtime/Contact/Lead/Inbound atual nos aliases12/13 e nacionais consultados. Não havia atendimento ativo ou janela legítima aberta registrada. Isso não afirma inexistência de qualquer história externa à base consultada; não houve anonimização/reparo nesta rodada. Históricos dos outros casos permaneceram intactos.

A prévia somente leitura inicial, antes do CSV preenchido, identificou variável obrigatória ausente; não gerou envio ou cadastro. Owner preencheu/mapeou o CSV pela interface. Rascunho `Campanha teste out.9`, ID `816eaae0-e7a4-4cbb-a542-3fca73a6262c`, criado11:34:29.667, conferido11:36:28.510 antes do envio: origem efetiva **recipient_import:csv**, um destinatário efetivo pertencente aos aliases autorizados, statusdraft/sentCount0/scheduledAtnull, categoria permitida, nenhuma exclusão/opt-out, readyToImport1, sem variável ausente e um parâmetro preenchido. Retorno salvo **Atendimento Geral / Fila Geral**, ativos e do próprio tenant. O resumo de importação created1 significa novo na audiência; o contrato posterga criação CRM até execução, não demonstra sozinho Contact/Lead criado nesse instante.

## Linha temporal e matriz

Horários Fortaleza (UTC−3), 06/10/2026. Números completos, contas, IDs de provider, conteúdo e configurações permanecem privados.

| Cenário | Resultado | Evidência |
|---|---|---|
| CSV individual/imediato | PASS | Um destinatário, sem agrupamento, scheduledAtnull; job elegível11:38:03.678, completed11:38:04.690; campanha completed1/1 às11:38:04.669. |
| Template exclusivamente Meta | PASS | submit_started11:38:03.958 → provider_accepted11:38:04.491 → Outbound `b6858d4d-2a14-4a1f-accf-7ad0c808b88c` Meta/SENT/data_exame às11:38:04.602. Owner confirmou chegada no celular separadamente. |
| Campanha não abre janela | PASS | Antes da resposta, zero inbound; Conversation e runtime com lastInboundAt/expiry nulos, windowIsOpenfalse. Materialização11:38:13 criou um conjunto canônico, HUMAN/WAITING e retorno humano correto. |
| Inbound legítimo abre janela | PASS | Às11:43:17, inbound `38bd2580-00d1-4440-946e-50c82bb0670e` WEB_SESSION vencedor; Meta duplicado deduplicado11:43:19.303. Mesma chave canônica, janela até07/10 11:43:17, um inbound persistido. |
| Retorno ao setor/fila sem menu | PASS | Mesma Conversation `36825764-e30b-41cc-bb04-f720e80188d3` e runtime `140e399f-8cbc-4f28-8910-af563245a24e`; HUMAN/WAITING, Atendimento Geral/Fila Geral, responsávelnulo, flow/nónulos. Nenhum novo outbound automático; owner confirmou ausência de menu. |
| Assumir | PASS | Às11:46:41.139, ADMIN do próprio tenant atribuído, HUMAN/IN_PROGRESS/handoffACTIVE; setor/fila/janela preservados. Owner confirmou “Conversa assumida. Ela foi movida para Em atendimento.” |
| Protocolo | PASS | Outbound `9e67311e-262e-4aab-b640-7a35f450e06a` Meta/SENT11:46:42.016, notice.sent11:46:42.102. `PROTOCOL_NOTICE / explicit / meta / HYBRID`; owner confirmou recebimento. |
| Resposta humana | PASS | Outbound `6b864970-05e6-4e52-8f25-42ccbeb6d926` Meta/SENT11:48:35.703, aceitação provider registrada; `INTERACTIVE_REPLY / explicit / meta / HYBRID`. Uma nova submissão registrada; recebimento confirmado pelo owner. |
| Identidade/ciclo/responsável | PASS neste caso | Desde materialização: mesmos IDs de Conversation/runtime/Contact/Lead, todos1/1/1/1; nenhum novo duplicado após inbound/claim/resposta. Ciclo `f2dacdbb-d584-4c0c-bbb1-7eb4ed7d931c`, originado no inbound, preservado no atendimento. Último inbound/expiry não renovados pelo protocolo/resposta humana. |

Leitura final11:49:40.925: HUMAN/IN_PROGRESS, mesmo responsável/assignedAt, departamento/fila/ciclo/janela; um inbound e três outbounds do ciclo (template, protocolo, resposta). A criação inicial de um Contact/Lead/Conversation/runtime é esperada para esse baseline vazio e não é duplicação. SENT/aceitação do provider não equivalem a entrega: os três recebimentos são relatos separados do owner; não se atribui PASS de DELIVERED/READ concorrente a este caso.

## Defeito visual reproduzido — OPEN separado

Owner informou toast “Envio iniciado / 1 destinatários elegíveis foram aceitos para processamento”, seguido de “Envio agendado / Sem horário definido” e detalhes sem atualização em tempo real. Persistência demonstra execução imediata completed1/1. Reproduz o mesmo defeito do [aceite CRM](CRM_AUDIENCE_CONTROLLED_VALIDATION_2026-10-06.md#defeito-visual-separado--open-sem-correção-incidental): estado inicial scheduled sem scheduledAt e polling de detalhes condicionado a sending, em `src/app/app/campaigns/page.tsx`; ramo CSV usa criação/importação `POST /app/campaigns/drafts/csv`, com fonte recipient_import:csv, e envio do rascunho existente. Não é prova de agendamento futuro. Nenhuma correção funcional/UI incidental foi feita.

## Limites e publicação

**NOT EXERCISED:** CSV agrupado, múltiplos destinatários, agendamento, audiência dinâmica, fallback HYBRID/AUTO por desconexão, seleções explícitas alternativas, META_CLOUD puro, claim backend com janela fechada e corridas humanas/status atrasados. Não se encerra aceite específico CRA-PR. Ciclo avulso e Audiência CRM controlados permanecem registrados separadamente; a limitação de resposta automática já submetida não foi exercitada. SECULT/DB-only encerradas, inatividade no Guia pausada; quatro históricos e reparo de setembro CLOSED preservados.

Dados completos e capturas permanecem em `local-evidence/csv-acceptance-afbb-20261006/` e na preparação privada da VPS, fora do Git. Publicação somente documental na branch review/campaign-recovery-20260926, excluída de deploy em vercel.json; CI push somente main/develop. Nenhum novo deploy/restart/migration ou restore produtivo nesta validação.
