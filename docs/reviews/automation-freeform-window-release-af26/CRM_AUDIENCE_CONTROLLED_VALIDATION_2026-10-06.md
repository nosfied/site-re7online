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
