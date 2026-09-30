# Incidente produtivo — gravação própria de automação rejeitada após 91230f88

**INCIDENT OPEN IN PRODUCTION. Correção LOCAL VALIDATED / NOT DEPLOYED, publicada somente para revisão.** Prioridade sobre as frentes pendentes. Não confundir saúde de processo com recuperação do fluxo.

## Início e escopo comprovado

O código causal é `91230f8884faaab7adfc5cbc4a49967dee91a89a`. Entrou na release de 29/09: API ba66c241 às 23:55:31 UTC; worker mínimo bf5+f06+912 às 23:55:57 UTC (20:55 em Fortaleza). Esse é o início provável de exposição, não o horário comprovado do primeiro atendimento afetado. Primeiro conflito observado de Syer: 30/09 00:12:49.415 UTC; último no levantamento: 00:34:00.947 UTC. Owner relatou repetição da pergunta de consentimento após respostas 1/2 no WhatsApp real.

Inventário somente leitura dos dez tenants em 30/09 01:11:24 UTC (29/09 22:11 Fortaleza), eventos/runtime após 29/09 23:55 UTC e logs estruturados acessíveis da API/worker. Nenhuma mensagem provocada. Critérios de transporte conferidos em `resolveConfiguredWhatsappTenantMode`, `resolveEffectiveWhatsappOutboundTransport`, `hybridInboundDedupe` e `docs/saas/whatsapp-transport-policy.md`. O documento `docs/whatsapp/transports.md` contém histórico Sprint88C anterior ao WEB_SESSION atual: não usá-lo para negar o caminho hoje implantado.

| Classificação | Tenant(s) | Transporte configurado e evidência |
| --- | --- | --- |
| Afetado comprovado | syer-rodrigues | HYBRID; 16 inbounds WEB com claim/completion, 16 duplicatas Meta descartadas, 16 stale_write_skipped no worker. Runtime observado BOT/NONE, sem nó/flow, chatbotActive=false. Caso autorizado e reprodução integrada confirmam a auto-invalidação. Não afirmar que cada log representa um cliente diferente. |
| Conflito explicado por transição humana, sem prova desta regressão | tendencia-modas | CLOUD_ONLY; 1 inbound/outbound e 1 conflito. Rodízio às 00:00:43.497; `conversation.routed_human`, motivo `no_automation_reply_configured`, às 43.517; aviso ao cliente enviado; conflito às 45.049. Runtime HUMAN/IN_PROGRESS preservado. Não classificar esse conflito como o loop de consentimento. |
| Potencialmente afetados pelo caminho WEB, sem execução demonstrada nesta janela | secult-pe, lab-websession | WEB_ONLY; zero conflitos. SECULT teve 42 checks de inatividade com handoff skipped; isso não comprova execução/avanço do chatbot. |
| Potencialmente afetados se a execução usar WEB, sem ocorrência observada | cra-pr, demo-converta | HYBRID; nenhum inbound/runtime atualizado/conflito na janela. Demo tem primário Meta explícito; coexistência não prova que todo envio use WEB. |
| Sem evidência de ocorrência; caminho produtivo não exercitado na janela | demo-prefeitura, justa-advocacia, re7online | CLOUD_ONLY; zero execuções/conflitos observados. Não equivale a prova de imunidade universal. |
| Sem transporte configurado / sem ocorrência | loadtest-prefeitura | NONE; nenhum processamento observado. |

Todos os tenants foram inventariados. **Recuperação produtiva dos caminhos: não verificada**, pois o fix não foi implantado. Logs de conflito não incluem sempre a identidade da conversa/requestId; agregados e estado final não reconstituem todas as intervenções passadas. Evidências privadas permanecem fora do Git.

## Executor, atividade e persistência

- WEB_SESSION inbound: o worker mínimo executa `ingestWebSessionInboundMessage`/chatbot/consentimento; `createWebSessionTextOutboundMessage` chama o controle do worker. Após aceitação, grava OutboundMessage/Event e `markWebSessionOutboundActivity`; o runtime é concluído por `persistWebSessionRuntimeState`.
- META_CLOUD inbound: a API executa `receiveWebhook`, fluxo/IA/handoff. `sendPassiveOutboundText` escolhe o transporte existente. Meta direto usa `sendOutboundText` e `persistOutboundMessage`; não executa a escrita de atividade WEB. `persistOutboundConversation`/`upsertConversationSafe` → storage Postgres persiste o runtime.
- HYBRID/coexistência: o claim lógico elege um executor do inbound; a entrega duplicada do outro transporte é descartada. Executor inbound e transporte outbound não são necessariamente iguais. API/Meta pode enviar por WEB e alcançar a mesma escrita de atividade. No caso Syer o vencedor observado foi WEB, executado pelo worker mínimo.
- Storage JSON/Postgres e shadow multicanal são dimensões distintas do transporte. A projeção de identidade Meta usa SQL sem atualizar updatedAt; não é a escrita WEB causadora do loop, mas precisa respeitar a proteção explícita de transporte/conta adicionada pelo fix.

## Causa e correção delimitada

912 adicionou o token otimista com updatedAt para impedir conclusão automática obsoleta sobre intervenção humana. No WEB, o próprio outbound aceito atualizava updatedAt antes da conclusão. Sem recibo dessa escrita, o CAS rejeitava o avanço; o inbound seguinte encontrava chatbotActive=false e iniciava novamente o consentimento. As provas anteriores criavam o outbound sem exercitar esta atualização real, portanto não cobriam o ciclo integrado.

O fix conserva updatedAt e aplica:

1. Token vinculado a clientId/waId, canal/provider/conta, inbound ID/data, versão, controle humano e snapshot independente de answers/ciclo. Não usa releitura para renovar autorização; o snapshot JSON é clonado, e sua igualdade é exigida mesmo se timestamp/versão não mudarem.
2. A escrita própria de atividade realiza UPDATE condicional e recebe o token resultante dessa exata escrita. Só então avança o token compartilhado pela execução. Nenhum lock/transação fica aberto durante provider.
3. Conflito invalida o token da execução. Outbound aceito continua durável; a atividade pode ser registrada monotonamente, sem restaurar modo/status/assignee/departamento/fila/ciclo/transporte. Resultado atrasado não substitui lastOutbound mais recente. Na projeção Conversation, o envio automático com token atualiza atividade sem sobrescrever identidade concorrente; o OutboundMessage mantém o transporte efetivo.
4. Falha da escrita de atividade depois de OutboundMessage aceito invalida a conclusão e gera `automation.runtime.activity_write_failed`; não converte a aceitação conhecida em rejeição nem repete envio. Se o DB falhar antes de conseguir registrar o outbound, não há promessa de persistência impossível/recuperação automática.
5. API passa explicitamente o token do estado em cada envio passivo que será seguido de persistência. A projeção própria de identidade Meta pós-persistência também usa CAS e retorna seu recibo; conflito nessa etapa não sobrescreve identidade humana/conta nova. O caminho legado sem token mantém seu tratamento anterior.

Não muda fluxo, distribuição, permissões BOT, configuração de tenant, transporte escolhido, scheduler, schema ou migration. Não faz reenvio nem reparo retrospectivo de runtime. Resposta automática já submetida não é cancelada; coordenação de resposta tardia continua uma limitação separada, assim como a frente maior pendente. O fix protege persistência; não amplia o contrato de intervenção/envio.

## Provas locais e limites

- Reprodução integrada **antes** do fix, worker mínimo 912 em Node20.20.0: primeiro consentimento enviado/registrado e `chatbotNodeId=null`, assertion esperava `consent`; falha causal reproduzida.
- `automationOwnActivity.test.ts`: 15 PASS na API em Node20.20.0. Consentimento 1/2 (aceitação persiste consentimento; recusa segue ramo existente, sem inventar registro declined), avanço de nós, múltiplos outbounds, handoff real com departamento/fila válidos, claim, transferência, CLOSED/CSAT, reentrada, inbound/ciclo novos, transporte/conta, atividade mais recente, erro na gravação de atividade após SENT. Prisma real local e fetch simulado que recusa qualquer outro endpoint.
- Caso API/IA integra gerador real com brain simulado, funções reais extraídas do controller, sendPassive/WEB e builder/storage Postgres. Meta direto usa adaptador de provider simulado e persistOutboundMessage real; quota/credenciais/auditoria comercial são stubs sintéticos, não provas de integração externa. Após o ajuste da projeção Meta, reexecutado somente esse caso com Meta/WEB, intervenção durante provider e barreira entre persistência e projeção de identidade: PASS. Os outros 14 casos permanecem sobre as mesmas fontes compartilhadas finais.
- Worker mínimo: 14 PASS/1 skip explícito do caso exclusivo da API, em Node20.20.0, **tanto fontes como os 93 compilados**. Reexecuções dos mesmos casos, não somar como casos distintos. Nenhuma sessão/app produtiva iniciada.
- Regressões diretamente afetadas: `automationPersistence.test.ts`, `webSessionInbound.test.ts`, `webSessionOutboundService.test.ts`: **89 PASS**, incluindo 18 de CAS Meta/WEB e isolamento. Mock passou a representar seleção de clientId/waId, igualdade JSON e OR/lte; nenhuma assertion/cobertura de lifecycle/CSAT removida.
- Backend build tipado PASS. Worker build da receita --noCheck PASS; --noEmit comparado à base mínima com mesmas dependências: **13 diagnósticos, saída integral idêntica**. Tipagem integral do worker não aprovada; sem correção incidental. Frontend não alterado, sem rebuild/smoke repetido.
- [Patch, receita e manifesto do worker mínimo](../reviews/runtime-self-write-backport/README.md). Quatro fontes/compilados alterados; 93→93; dependências/Prisma/schema inalterados. API recebe ainda o delta específico do webhook. Não substituir pelo worker completo.

Rastros privados: `local-evidence/runtime-self-write-incident/`, com inventário, correlação, reprodução antes/depois, outputs de tipos, builds, hashes e teste dos compilados. Falhas intermediárias de fixture (FK de cleanup, fila obrigatória e expectativa incorreta de registro declined) foram corrigidas localmente; não são evidência de PASS do código anterior.

## Contenção/retorno preparado, não executado

**Opção mais estreita para o caso comprovado WEB:** voltar somente ao worker mínimo bf5+f06 do pacote 042e386a. API/frontend podem permanecer ba66. Recupera o caminho sem o CAS912 no worker, mas reintroduz a possibilidade de conclusão automática obsoleta e distribuição durante automação nesse artefato; não corrige eventual caminho API→WEB. Não recomendar isso como retorno sem risco ou sem impacto de sessão.

**Retorno compatível abrangente já disponível:** API/frontend a3d16d4b + worker mínimo bf5+f06/042e386a, pelo `return.ecosystem.config.cjs` da preparação `automation-20260929T220203Z`. Mantém escritores de configuração compatíveis, banco e auth atuais. Retira o acompanhamento Automação e reintroduz os defeitos corrigidos em912; a chave Syer continua armazenada, mas binários anteriores não a interpretam. Voltar binários não equivale a revogar pelo setter. Nenhum retorno a escritores pré-f06.

Sequência para decisão de janela, reaproveitando plano 3e7c0a84 e comandos da release: conferir hashes/configs de retorno e estado imediato; preservar DB/auth/configs atuais; fechar admissões de campanhas pelo mecanismo com geração atual e comprovar drain específico; conter entradas da API e controlar supervisão/cron; parar individualmente os processos necessários (API também precisa ficar contida enquanto worker indisponível); confirmar saída do antigo/wrapper/descendentes, sockets, backends e locks antes de um único sucessor; iniciar o par compatível escolhido sem logout/restauração; validar sessões e atendimento; retirar contenção e restaurar guard/scheduler/boot/saved ao estado autorizado. Ausência de tarefas não é drain do worker; PM2 pode terminar trabalho pendente. Sem kill adicional, remoção de lock, replay ou restore sobre DB/auth novos.

Antes da parada: abortar por divergência de artefato, auth/ownership, tarefas incertas, retorno ausente ou terceiro ativo. Depois: não iniciar sucessor com sobrevivente; manter contenção e escalar; priorizar retorno compatível quando for possível provar saída. Impacto alcança WEB_SESSION de outros tenants e API durante contenção; frontend só precisa trocar no retorno abrangente. A janela anterior e seu aceite de risco não são permissão implícita para executar este retorno agora. Preferência: revisão imediata do fix dirigido e publicação controlada autorizada, evitando retirar as proteções912. Nenhuma duração garantida.

## Estado produtivo preservado e próximo gate

Releitura em 30/09 01:35:30 UTC: mesmos PIDs/artefatos ba66/minimal912, Node20.20.0, frontend BUILD_ID preservado; guarda OPEN geração7, sem fault/tarefas; scheduler habilitado, fila/grupos/leases/sending/agendamentos zero nessa leitura; sessões 3 connected/1 disconnected/1 pending, 4 auth records. São observações, não prova de drain ou recuperação. Nenhum deploy/restart/rollback/configuração/fluxo/transporte foi alterado; somente Syer continua com a chave ligada.

Próximo gate: auditoria deste commit e autorização da publicação controlada API + worker mínimo corrigido. Após implantação, comprovar avanço **e persistência** em interação/conteúdo autorizados nos caminhos afetados, sem replay cego da conversa antiga. Health não encerra o incidente. Campanhas/CRA aguardam validação funcional do owner; SECULT encerrada/aceita; DB-only encerrada; inatividade Guia pausada; 6683 CLOSED.
