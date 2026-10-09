# Matriz consolidada — validações restantes, 09/10/2026

**CONSOLIDATION COMPLETE / NO NEW PRODUCTIVE VALIDATION.** Owner confirmou o aceite dos cenários executados em ad690ee1. Apenas auditoria documental/código e proposta nesta rodada; sem nova consulta produtiva, polling, build, testes, envio, configuração, reparo, deploy ou implementação. Última composição registrada: API a26dbb0e, worker mínimo reativo afbb, frontend fa60 corrigido. Isso é referência das leituras já publicadas, não nova atestação de estado ao vivo.

Backlog contém checkpoints históricos com títulos NOT DEPLOYED/PENDING que foram superados por registros posteriores. A matriz usa o resultado mais recente por cenário sem apagar as tentativas, alterar aceites ou tratar uma versão antiga como confirmação atual.

## Aceites concluídos — não repetir

| Caso e versão do aceite | Resultado comprovado | Limite e fonte |
|---|---|---|
| Avulso controlado demo, b9 | Campanha → resposta híbrida na Conversation/runtime canônica → Atendimento Geral/Fila Geral → claim/protocolo/resposta humana recebidos | Caso controlado, não todas as contas/transportes; preservado no [registro afbb](../REACTIVE_AFBB_DEPLOYED_2026-10-06.md) como aceite anterior separado |
| Audiência CRM estática/imediata out.8, afbb | Template Meta, janela não fabricada, inbound Web canônico, setor, claim/protocolo e resposta Meta, identidade/ciclo preservados | Meta explícita, não fallback AUTO nem META_CLOUD puro; [relatório CRM](../CRM_AUDIENCE_CONTROLLED_VALIDATION_2026-10-06.md) |
| CSV individual/imediato out.9, afbb | Prévia/um destinatário e ciclo humano híbrido sem duplicação nova; recebimentos confirmados | Não agrupamento, múltiplos destinatários ou agendamento CSV; [CSV](../CSV_CONTROLLED_VALIDATION_2026-10-06.md) |
| Agendamento real estático out.10, afbb/frontend9f | Horário salvo/exibido, nenhuma submissão anterior no recorte, scheduler natural/única Meta, terminal e recebimento | Janela já aberta no baseline; escolha AUTO pelo owner não torna template uma prova de contingência; [resultado agendamento](../CRM_AUDIENCE_CONTROLLED_VALIDATION_2026-10-06.md#agendamento-real-individual--resultado-de-07102026) |
| CRM dinâmico out.11, afbb/frontend9f | Estimativa0→1 antes de execução, snapshot único com contato incluído após agendamento, variável24/06/2027, Meta/entrega/recebimento, janela não renovada pelo template | Um filho, sem retorno humano deste ciclo; [resultado dinâmico](../DYNAMIC_CRM_AND_AUTO_ACCEPTANCE_PREPARATION_2026-10-07.md#execução-dinâmica-controlada--07102026) |
| Out.14 após correção elegibilidade, a26 | Um elegível4366, variável22/01/2027, snapshot e submissão Meta únicos, agregado completed, DELIVERED e recebimento; CAS35→36 único autorizado | Não reproduz em produção os seis marcadores de out.13 nem multilote; [registro](../campaign-reconciliation-prepared/operational-composition-20261008/OUT14_CAS_EXECUTION_2026-10-08.md) |
| Out.13 reconciliada | Read models/recibo:1 SENT preservado,1 FAILED131026 e4 bloqueados, ack histórico, sem reenvio | Não é campanha nova nem reparo geral; [reconciliação](../DEMO_DYNAMIC_ELIGIBILITY_RECOVERY_LOCAL_2026-10-08.md) |
| Frontend fa60:composer/reset/polling/conjunto/troca | Aceite explícito owner; campo preservado em polling ativo, conjunto único, filho acessível, troca out.13 sem mistura e descarte local | [ad690ee1](../frontend-read-acceptance-20261009/README.md); ausência de erro nesta sequência não prova toda corrida |

SENT/submissão aceita, webhook DELIVERED/READ e confirmação do owner permanecem evidências distintas. Aceites de demo não se transferem ao CRA-PR.

## Provas locais reutilizáveis — sem reexecução por rotina

| Propriedade | Prova existente e seu alcance | Situação produtiva |
|---|---|---|
| 12:40Fortaleza→15:40UTC | Parser civil/formatação e payloads dos handlers no smoke isolado do tar em Node20, timezoneFortaleza | Não houve nova submissão produtiva; owner dispensou repeti-la |
| Pool/leitura/seleção frontend | 13 smokes horário/conjuntos;7 leituras:lista grande/detalhe lento/falha parcial, máximo2 complementares, versão/sessão/resposta antiga | Recorte real lista/detalhe200 compatível; máximo2 suplementar não medido em produção |
| Filhos1/vários e nomes iguais | Vínculos explícitos preservados, não dedupe por nome; contratos/navegador com APIs simuladas | Um filho produtivo aceito; vários filhos não |
| Agrupamento/snapshot/variáveis | 3.001 candidatos e filhos1000/1000/1000/1; runner/provider simulados e read models, exclusões/consolidação | Não equivalem a campanha produtiva multilote |
| AUTO/intenção/submissão única | Resolvido por intenção, auditoria do motivo, alternativas só por indisponibilidade comprovada, negativas de seleção explícita/desabilitado/expiração/resultado ambíguo/concorrência | Campanhas Meta-only já aceitas não validam fallback reativo |
| Inbound e fences/status atrasados | Barreira integrada/provider simulado, updatedAt de atividade, intervenção humana e status webhook; preservação de owner/ciclo/conta/janela | Corrida não deve ser provocada em produção |
| Anonimização/elegibilidade | Seis Leads reproduzidos, só válido elegível; snapshots antigos e guard antes de provider; reconciliação idempotente/read model | Correção previne novas submissões indevidas; histórico não saneado automaticamente |
| PM2/retorno/reboot | Provas isoladas reais com boot/permissão/nft distinguindo injeção/simulação | Não provocar kill/reboot para ampliar aceite |

Fontes: [horário/conjuntos e leituras](../CAMPAIGN_SCHEDULE_AND_GROUPS_LOCAL_2026-10-07.md), [pacote exato/CSS/Node20](../FRONTEND_FA60F0F6_PREPARED_2026-10-07.md), [agrupamento](../GROUPED_CAMPAIGN_ACCEPTANCE_PREPARATION_2026-10-07.md), [contingência](../REACTIVE_TRANSPORT_CONTINGENCY_LOCAL_2026-10-05.md), [incidente6683 local](../INCIDENT_6683_LOCAL_2026-10-03.md).

## Ocorrência natural / decisão independente necessária

| Pendente | Evento que permite acompanhar | Coleta mínima e condição de parada |
|---|---|---|
| Multilote CSV/CRM | Tenant indica conjunto real autorizado com mais de um filho | IDs explícitos/batch/chunkIndex, população canônica única, variáveis nas fronteiras, sequência/jobs/leases, uma submissão por identidade e agregado por filho/conjunto. Não obter1001 celulares ou forçar flag para fabricar teste. [Decisão owner](../GROUPED_CAMPAIGN_ACCEPTANCE_PREPARATION_2026-10-07.md#decisão-do-owner--acompanhamento-natural) |
| Contingência reativa HYBRID/AUTO | Indisponibilidade natural comprovada, janela legítima aberta, mesma conta/identidade e resposta única indicada pelo owner | Revalidar seleção/transportes e elegibilidade; decisão/motivo/uma submissão, sem retry após resultado ambíguo. Não desconectar sessão compartilhada, mudar tenant ou afetar outros |
| Status tardio durante intervenção humana | Inbound/claim/transferência humana real seguido de DELIVERED/READ relacionado | Timestamps/eventos/mesmo Meta ID, owner/departamento/ciclo/transportes e janela persistidos. Não replay ou corrida fabricada |
| META_CLOUD puro / outros vencedores dedupe | Caso natural conhecido no caminho ainda não exercitado | Correlacionar executor/provider/Conversation/runtime e saída persistida. Ausência de tráfego é NOT EXERCISED, não PASS |
| CRA-PR | Tenant define seus próprios casos/template/destinatários/horário/custo e autoriza aceite | [Checklist próprio](../../../bids/2026/cra-pr/UTILITY_CAMPAIGN_ACCEPTANCE_CHECKLIST.md); consulta07/10 sem campanhas no CRA foi pontual, não ausência histórica garantida nem estado ao vivo hoje. Dados demo não encerram CRA |

## Possível sem envio ou mutação — disponível, não executado novamente

- Quando existir caso indicado, consultar por IDs o detalhe/lista/read models e comparar snapshots, jobs, eventos, status de provider e totais. Consultas delimitadas, sem polling indefinido.
- Uma captura de rede somente leitura pode medir exatamente requisições e concorrência suplementar. Não capturar/publicar cookies/tokens/HAR privado nem confundir timer normal com releitura de todos os filhos. Não é requisito para repetir aceites já concluídos.
- Auditoria de seleção/destino/template/eligibilidade ou de contrato RBAC via código não precisa de envio. Provar claim backend com janela fechada é tentativa mutável: manter prova local; não acionar por API nesta etapa.
- Revisão de UX pode usar os contratos/detalhes históricos e componentes já carregados. Não precisa criar outra campanha nem abrir painel em vários tenants.

AUTO normal reativo (sem indisponibilidade) também não consta como aceite produtivo nos relatórios consultados. Para comprová-lo é necessário um envio novo, explicitamente indicado pelo owner com janela legítima: não está autorizado nem proposto como próxima ação nesta etapa.

## Somente o próximo passo necessário

**Revisão da proposta de UX com o arquiteto**, em [diagnóstico separado](UX_SET_BATCH_PROPOSAL.md), escolhendo a apresentação das informações exclusivas dos lotes antes de qualquer implementação. Não há próximo envio técnico necessário. Multilote/AUTO continuam aguardando caso natural informado; nenhum acompanhamento contínuo foi iniciado. CRA-PR permanece frente própria. Históricos/quatro registros/setembroCLOSED preservados.
