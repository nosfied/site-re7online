# b9 — validação controlada do retorno híbrido, 05/10/2026

**CICLO CONTROLADO COMPLETO PASS / OWNER CONFIRMED.** API b9/worker mínimo b9 tecnicamente implantados conforme [registro da janela](HYBRID_B9_CAPTURE_DEPLOYED_2026-10-05.md). Este resultado comprova somente o caso abaixo; não encerra todas as validações de af26/b9, Campanhas/CRA ou o saneamento histórico.

## Caso e baseline

Owner indicou `demo-converta`, número sob seu controle final **4366** e template `data_exame` aprovado (`pt_BR`, UTILITY). Leitura restrita antes do envio, às 15:39:59 UTC (12:39:59 Fortaleza): nenhum inbound registrado, Conversation, Contact ou Lead nos aliases consultados. Candidatos foram obtidos do resolvedor CRM compilado b9, sem nova normalização. Havia **um runtime histórico isolado**, de 22/09, com janela expirada em 23/09, sem responsável/departamento/fila; ele foi registrado e preservado. Não houve anonimização, reparo, alteração de transporte/configuração ou reenvio para preparar o teste. Por isso o caso não equivale a identidade sem qualquer runtime preexistente.

Template aprovado, setor Atendimento Geral ativo e Fila Geral pertencente ao setor conferidos. Web Session habilitado/connected e override outbound `meta` observados; nenhuma configuração alterada para fazer o teste passar. A classificação híbrida nesta prova decorre dos providers efetivamente persistidos, não de presumir transporte pela modalidade da campanha.

## Correlação

Owner enviou pelo fluxo normal a campanha avulsa **Campanha teste out.7**, ID `8adb1117-9983-48c2-9786-10947c91c1a2`, um destinatário/data_exame. Seed confirmou `human_department`, **Atendimento Geral / Fila Geral**.

| Marco | UTC / Fortaleza | Evidência |
| --- | --- | --- |
| Campanha/seed persistidos | 15:44:00 / 12:44:00 | campanha completed, 1 destinatário/1 enviado; seed com destino humano |
| submit_started | 15:44:01.121 / 12:44:01.121 | evento existente de início de submissão |
| Provider aceitou | 15:44:02.095 / 12:44:02.095 | campaign.message.provider_accepted; não significa entrega |
| Outbound persistido | 15:44:02.203 / 12:44:02.203 | ID `fdbf7238-c28a-4279-b3a3-1e778832dadd`, Meta/data_exame/SENT |
| Materialização da campanha | 15:45:31.917 / 12:45:31.917 | Conversation `8dd94507-f721-4015-b6e5-e5693748c1a5`, runtime `cefee9a4-a269-4e88-922b-2049e13ce44c` |
| Resposta nova do owner | 15:50:18 / 12:50:18 | “ok”; owner relata ausência de menu automático |
| Inbound persistido | 15:50:19.101 / 12:50:19.101 | ID `6d03111d-a07a-449b-b3a0-f0f7f7c24ae5`, provider web_session, identificador Web |
| Meta correspondente deduplicado | 15:50:19.944 / 12:50:19.944 | whatsapp.meta.inbound.duplicate |
| Snapshot após inbound | 15:52:53 / 12:52:53 | mesmos IDs/identidade vencedora, destino humano e janela legítima |

Antes da resposta: Conversation e runtime da campanha **HUMAN/WAITING**, Atendimento Geral/Fila Geral, sem responsável; `windowIsOpen=false`, `lastInboundAt=null`, sem nó/flow ativo. A submissão e materialização não abriram janela nem inventaram inbound. O runtime histórico permaneceu com seu timestamp antigo/expirado, sem ser saneado.

Depois da resposta: **mesma Conversation e mesmo runtime**; o inbound persistido usa a chave vencedora da Conversation. Ambos abriram janela pelo timestamp recebido **15:50:18 UTC**, com expiração **06/10 15:50:18 UTC**. `HUMAN/WAITING`, departamento/fila, ausência de responsável, flow/nó nulos preservados. Provider corrente passou de Meta para Web conforme o inbound, sem trocar a Conversation/ciclo por uma conversa nova de chatbot. Owner confirmou que nenhum menu automático apareceu.

Comparação integral dos snapshots privados: **um Contact e uma Lead com os mesmos IDs antes/depois do inbound**; uma Conversation; dois runtimes antes/depois do inbound (o histórico mais o da campanha), sem runtime adicional pela resposta. Runtime histórico permaneceu integralmente igual. Nenhum outbound adicional foi observado após a resposta no snapshot correlacionado. Não se declara saneamento/fusão do runtime antigo.

Executor: inbound persistido WEB_SESSION/identificador Web e dedupe Meta comprovados no banco; o caminho de execução implantado correspondente é o worker mínimo. Busca dirigida pelo ID lógico nos logs stdout da API/worker não encontrou linhas, portanto não há correlação independente por linha de log/PID desta mensagem. Isso não é usado como prova de inexistência de execução. Números completos, account IDs, provider message IDs e snapshots ficam privados, fora do Git.

## Confirmação funcional e matriz

Após a conferência técnica, owner confirmou **“sim.”** à verificação na Inbox: resposta visível em Atendimento Geral/Fila Geral, sem aviso de janela fechada e botão Assumir disponível. Na primeira fase, claim e envio humano ainda não haviam sido exercitados. A continuação autorizada abaixo os comprova neste mesmo caso, sem nova campanha; disponibilidade do botão, isoladamente, não foi usada como prova do handler.

| Cenário | Resultado / limite |
| --- | --- |
| Campanha Meta sem inbound mantém janela fechada/lastInboundAt nulo na Conversation/runtime novos | PASS neste caso |
| Resposta Web converge à mesma Conversation/runtime | PASS |
| Destino Atendimento Geral/Fila Geral preservado, sem menu automático | PASS + confirmação owner |
| Inbound legítimo abre janela de 24h | PASS |
| Contact/Lead não duplicados pela resposta; histórico intacto | PASS |
| Inbox/setor/resposta/aviso removido/Assumir disponível | PASS + confirmação owner |
| Claim backend antes do provider com janela fechada | NOT EXERCISED |
| Assumir/protocolo após inbound | PASS na continuação autorizada; recebimento confirmado pelo owner |
| Resposta humana Inbox, persistência e recebimento | PASS; provider Meta observado, sem presumir Web |
| META_CLOUD puro, Web vencedor antes da campanha, direção inversa/concorrência | NOT EXERCISED produtivamente nesta prova; testes locais preservados |
| DELIVERED/READ atrasados durante intervenção humana / janela expirada em envio | NOT EXERCISED nesta prova; não provocar corrida produtiva |
| Identidade sem runtime preexistente / outras modalidades de campanha | NOT EXERCISED nesta prova |

Nenhuma nova janela, restart/deploy, fixture produtiva, reparo dos quatro históricos, mudança de configuração ou mensagem enviada pelo executor. Consultas READ ONLY com timeout; observação encerrada após o caso conhecido. Validação restante exige indicação do owner ou caso natural, sem polling indefinido. Campanhas/CRA continuam aguardando seu aceite específico; SECULT encerrada, inatividade no Guia pausada e reparo de setembro CLOSED.

## Continuação do mesmo ciclo — atendimento humano confirmado

Sem campanha nova, deploy/restart, troca de transporte ou ajuste de configuração. Owner executou Assumir uma vez e relatou: **“Conversa assumida. Ela foi movida para Em atendimento.”** Também confirmou no celular o aviso de protocolo. O conteúdo integral ficou no relato/evidência privada; não é necessário publicá-lo.

Leitura dirigida às **14:09:21 Fortaleza (17:09:21 UTC)** confirmou:

- Mesmo runtime `cefee9a4-a269-4e88-922b-2049e13ce44c`, **HUMAN/IN_PROGRESS**, handoff **ACTIVE**; responsável AGENT do próprio tenant atribuído às **13:58:58.844 Fortaleza**.
- Atendimento Geral/Fila Geral preservados, janela legítima ainda aberta pelo inbound das 12:50:18, sem renovação do timestamp de inbound por claim/protocolo.
- Aviso outbound `874565f1-67a0-4715-8232-5bdc0b0319b0`, **WEB_SESSION/TEXT/SENT**, às **13:58:59.489 Fortaleza**. Evento `conversation.protocol.notice.sent` às 13:58:59.627, status SENT e protocolo esperado correspondente ao informado pelo owner. SENT é submissão aceita; recebimento no celular é a confirmação funcional adicional, não inferência de entrega pelo banco.

Owner enviou uma resposta curta pela Inbox e confirmou: **“sim. enviada. chegou ao celular normalmente.”** Snapshot às **14:11:59 Fortaleza** e correlação complementar demonstraram:

- Outbound `00c0e1b2-5a4a-4eb9-9d09-55d71bb7cbe5`, **Meta/TEXT/SENT**, persistido às **14:10:55.972 Fortaleza**; eventos Meta associados têm origem **inbox_text**. Portanto não declarar que a resposta humana utilizou Web: o transporte efetivo foi Meta, com override Meta já observado no preflight. Não houve mudança de configuração nesta validação.
- Mesma chave vencedora, Conversation/runtime, responsável, modo/estado humano, departamento/fila e janela. Ciclo ativo `80eeb65c-41e5-40ca-b848-a7e726c1134c` é o mesmo do aviso de protocolo.
- Um único outbound adicional no snapshot em relação ao claim; uma Conversation/um Contact/uma Lead com os mesmos IDs. Dois runtimes permanecem (histórico isolado e ativo da campanha), sem terceiro runtime. Todos os campos previamente capturados do histórico continuam iguais.
- A coleção histórica `Message` consultada não possui linhas neste caso. A prova de persistência do envio usa **OutboundMessage**, atividade/eventos e runtime; não se afirma gravação em Message nem uma FK de outbound para Conversation inexistente no modelo. A associação é comprovada por tenant/chave vencedora/runtime/ciclo e origem/request do envio.

A primeira comparação local do runtime antigo recusou diferenças de schema entre snapshots (campos handoffStatus/assignedAt foram acrescentados ao segundo extrator). O comparador foi corrigido para conferir todos os campos efetivamente presentes no snapshot anterior; dados produtivos não foram alterados. Tentativa e extratores anteriores preservados como evidência privada. Não se confundiu essa recusa do verificador com falha funcional ou se apagou o histórico para obter PASS.

**Aceite registrado somente deste ciclo:** campanha avulsa Meta → inbound Web na mesma identidade → Atendimento Geral/Fila Geral → claim humano/protocolo Web → resposta humana Inbox Meta recebida. Não declara validação de todas as modalidades, transporte Meta puro inbound, resposta humana Web sem override, concorrência com status atrasados ou claim negado antes do provider quando fechado. A conversa permanece em atendimento; não foi fechada/anonimizada como limpeza de teste.

### Próxima pendência prioritária: Campanhas/CRA-PR

Reaproveitar as provas locais já publicadas para **Audiência CRM** (seleção estática/filtro/snapshot dinâmico, execução imediata/agendamento) e **Importação CSV** (simples/conjunto, imediato/agendado), sem repeti-las por rotina. A modalidade **Envio manual avulso** tem este ciclo produtivo específico confirmado; CRM/CSV ainda **OWNER FUNCTIONAL VALIDATION PENDING**. Não estender o aceite demo-converta ao CRA-PR nem a todas as variantes.

Antes do próximo envio, owner deve indicar modalidade, público/conteúdo e destinatários sob seu controle. Conferir seed/snapshot/variáveis/destino/limites/fila, correlacionar a execução e o resultado, e somente então acompanhar resposta/atendimento nos casos autorizados. Não criar campanha, alterar cadastro ou enviar por iniciativa própria. Os quatro históricos continuam em diagnóstico/tratamento separado, sem reparar ou fundir nesta rodada; setembro CLOSED, SECULT encerrada e inatividade no Guia pausada.
