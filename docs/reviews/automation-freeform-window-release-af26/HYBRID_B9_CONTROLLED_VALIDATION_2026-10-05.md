# b9 — validação controlada do retorno híbrido, 05/10/2026

**CENÁRIO CONTROLADO PASS / OWNER CONFIRMED.** API b9/worker mínimo b9 tecnicamente implantados conforme [registro da janela](HYBRID_B9_CAPTURE_DEPLOYED_2026-10-05.md). Este resultado comprova somente o caso abaixo; não encerra todas as validações de af26/b9, Campanhas/CRA ou o saneamento histórico.

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

Após a conferência técnica, owner confirmou **“sim.”** à verificação na Inbox: resposta visível em Atendimento Geral/Fila Geral, sem aviso de janela fechada e botão Assumir disponível. **Não foi solicitado/executado claim ou envio operacional pela validação.** Disponibilidade do botão não comprova o handler de claim nem envio de protocolo.

| Cenário | Resultado / limite |
| --- | --- |
| Campanha Meta sem inbound mantém janela fechada/lastInboundAt nulo na Conversation/runtime novos | PASS neste caso |
| Resposta Web converge à mesma Conversation/runtime | PASS |
| Destino Atendimento Geral/Fila Geral preservado, sem menu automático | PASS + confirmação owner |
| Inbound legítimo abre janela de 24h | PASS |
| Contact/Lead não duplicados pela resposta; histórico intacto | PASS |
| Inbox/setor/resposta/aviso removido/Assumir disponível | PASS + confirmação owner |
| Claim backend antes do provider com janela fechada | NOT EXERCISED |
| Assumir/protocolo após inbound | NOT EXERCISED |
| META_CLOUD puro, Web vencedor antes da campanha, direção inversa/concorrência | NOT EXERCISED produtivamente nesta prova; testes locais preservados |
| DELIVERED/READ atrasados durante intervenção humana / janela expirada em envio | NOT EXERCISED nesta prova; não provocar corrida produtiva |
| Identidade sem runtime preexistente / outras modalidades de campanha | NOT EXERCISED nesta prova |

Nenhuma nova janela, restart/deploy, fixture produtiva, reparo dos quatro históricos, mudança de configuração ou mensagem enviada pelo executor. Consultas READ ONLY com timeout; observação encerrada após o caso conhecido. Validação restante exige indicação do owner ou caso natural, sem polling indefinido. Campanhas/CRA continuam aguardando seu aceite específico; SECULT encerrada, inatividade no Guia pausada e reparo de setembro CLOSED.
