# Acompanhamento da automação na Inbox — proposta, 29/09/2026

**PROPOSTA / NÃO IMPLEMENTADA.** Independente da [correção automação × rodízio](AUTOMATION_QUEUE_RACE_LOCAL_2026-09-29.md). Nenhuma chave ativada ou configuração alterada. Não tornar BOT visível para esconder o defeito de distribuição.

## Reaproveitamento e configuração

O filtro antigo BOT aparece em `5dd2624c`; o filtro dedicado AUTOMATION foi introduzido em `d3526d02`. `35c5e595` removeu o atalho BOT redundante, preservando Automação. Hoje `src/lib/inboxConversationFilters.ts` e `src/app/app/inbox/page.tsx` já contêm filtro, classificação e apresentação Automação. Reutilizar esses componentes e a Inbox, sem nova tela/categoria/histórico.

Propor `allowAutomationConversationsInInbox`, default false, em TenantOperationalConfig, gerenciada somente por ADMIN em `/app/settings/inbox`. Texto: **“Exibir conversas em automação na Inbox”**. Ajuda: “Permite acompanhar conversas em fluxo ou IA dentro do seu escopo de acesso. Visualizar não assume nem interrompe a automação.” Setter específico usando o helper transacional existente; não ampliar permissões sobre outros campos nem conceder gestão a SUPERVISOR/AGENT. Falha de resolução nega somente a exceção, sem mascarar falhas gerais.

## Matriz proposta de leitura (chave ligada)

| Papel | BOT com departamento | BOT sem departamento | Gestão da chave |
| --- | --- | --- | --- |
| ADMIN | Dentro do próprio tenant, escopo administrativo existente | Sim, escopo administrativo do tenant | Sim |
| SUPERVISOR | Destino confirmado + vínculo departamental atual válido, resolvedor canônico | Não | Não |
| AGENT | Destino confirmado + vínculo departamental atual válido, resolvedor canônico | Não | Não |
| Outro tenant/departamento não autorizado | Não | Não | Não |

Chave ausente/desligada preserva comportamento atual. Não inferir acesso global pela ausência de departamento. Não usar participação histórica como acesso; preservar o tratamento canônico de departamentos inativos/legados, cliente/usuário ativo e grants existentes. A exceção de responsável atual não deve virar acesso global a BOT. Caso seja necessário supervisor triar BOT sem departamento, isso exige definição explícita distinta; não está incluído nesta proposta.

O acompanhamento seria por departamento, não atribuição automática. Esse escopo proposto precisa de aprovação; não deduzir que a política humana assignee_only_after_assignment autoriza todos os BOT do tenant. Histórico e conteúdos continuam sujeitos às regras de privacidade existentes; consentimento/NPS/management_only não se tornam públicos por ativar a chave.

## Caminhos mínimos e riscos concretos

- Backend `app/routes.ts`: `conversationListItemIsAutomation`, `shouldUserSeeConversationInInbox`, `shouldUserSeeConversationDetail`, `hasConversationDepartmentAccess`, listagem/contagens, detalhe, timeline e mídia. A projeção humana atualmente elimina BOT antes do filtro. Criar decisão condicional comum de leitura de automação, sem redefinir BOT como trabalho humano. Aplicar também por ID e antes de entregar mensagens/anexos.
- Frontend `inbox/page.tsx`: `isAutomationQueueConversation`, `buildConversationFetchOptions`, filtro AUTOMATION e handlers de atualização. Reutilizar badge/lista e revalidação existentes; impedir que humanInboxVisible=false remova uma conversa cuja leitura BOT é autorizada. Não mudar capacidade, atribuição, fila, status, SLA ou handoff por renderizar/consultar. Revisar marcação de leitura para não produzir efeitos operacionais novos por mera visualização.
- `inbox/messageVisibility.ts`, Meta `whatsapp/webhook.controller.ts` e `web-session/webSessionInbound.ts`: Meta emite inbound com humanInboxVisible=true, enquanto WEB_SESSION calcula projeção e usa management_only. É inconsistência preexistente; não prova, sozinha, inserção visível de cada evento. Para a nova leitura, distinguir autorização para acompanhamento de sinalização de trabalho humano, preservando conteúdos de gestão restritos. Não basta trocar false por true.
- `realtime/agentReadAccess.ts` e `realtime/hub.ts`: AGENT tem autorização atualizada e invalidação por conversa/tenant. SUPERVISOR recebe eventos do tenant sem o mesmo filtro departamental por evento. Preexistente, mas não se pode adicionar BOT ao canal amplo e vazar outros departamentos. A entrega de eventos BOT deve usar a decisão comum para AGENT/SUPERVISOR; ADMIN permanece no próprio tenant. Não reformular todo realtime humano neste chamado; registrar o caminho amplo preexistente separadamente.
- Revogação: negar novas leituras/entregas e usar invalidação/revalidação existentes. Não prometer apagar conteúdo já recebido nem remoção visual instantânea.

## Acompanhar não é intervir

A UI já tem “Assumir conversa”; `/app/conversation/:waId/claim` já valida elegibilidade, capacidade e departamento e transita para HUMAN/ACTIVE/IN_PROGRESS. Existem transferência/liberação e envio humano. A chave de leitura não pode ser condição suficiente para autorizar essas mutações, nem liberar CLOSED.

Proposta: acompanhamento inicialmente sem efeito operacional. Intervenção explícita reutiliza claim, com indicação de que assumirá o controle; exige os controles existentes e destino válido. Para BOT sem departamento, definir destino autorizado antes de permitir intervenção, sem atribuir destino por mera consulta. Não conceder novos poderes de transferência/envio a SUPERVISOR/AGENT pelo setter de leitura.

Há lacuna preexistente na concorrência entre intervenção humana e resposta automática já em andamento, documentada no relatório da correção. Antes de prometer “interromper automação”, revisar admissão da resposta e tratamento do que já foi submetido. Resposta aceita não pode ser desfeita; preservar resultado e não reenviar incerteza. O atual guard inbound não demonstra exclusão de todos os claims humanos. A chave BOT não resolve esse contrato.

## Validação proposta

1. Chave ligada/desligada/ausente/falha; setter ADMIN e negativas SUPERVISOR/AGENT; revogação concorrente usando helper existente.
2. Matriz de papéis × departamento próprio/outro/ausente/inativo × dois tenants em lista, contagens, filtro, detalhe direto, timeline, mídia e socket já aberto.
3. Meta/IA e WEB_SESSION/chatbot com a mesma decisão de leitura, preservando conteúdos restritos de gestão e isolando eventos concorrentes de conversas distintas.
4. Consultar BOT não altera responsável, cursor, capacidade, fila, status, SLA ou lifecycle. Nenhuma necessidade de fixture produtiva.
5. Claim/transferência/reentrada, elegibilidade, departamento e CLOSED mantêm controles; barreiras de resposta pendente após definição do contrato de intervenção. Não usar sucesso de visualização como prova de interrupção do provider.
6. Smoke autenticado no filtro Automação existente; regressões de ativos e SECULT concluídos. Aceite real CRA separado, sem disparos artificiais.

Decisões para revisão: aprovar matriz de acompanhamento e definir o contrato de intervenção/resposta em voo. API e frontend serão afetados; worker precisará produzir eventos/visibilidade coerentes nos caminhos WEB_SESSION, sempre sobre a base mínima rastreável. Não atualizar worker completo por conveniência.

Campanhas/CRA continuam aguardando validação funcional do owner; inatividade no Guia pausada. SECULT aceita conforme relato de Deifson; DB-only encerrada; 6683 CLOSED. Nenhuma implementação da chave nesta etapa.

## Semântica departamental — condição de segurança da proposta

`whatsapp/webhook.controller.ts::upsertConversationSafe` resolve departamento também quando há status, mesmo BOT/WAITING (~1596). `resolveRuntimeDepartmentId` delega a `bootstrap/defaultOperationalDepartment.ts::resolveOperationalDepartmentId`, que pode devolver o departamento operacional padrão para valor ausente/inativo/legado. Portanto **departmentId preenchido não comprova destino escolhido/confirmado de handoff**. No WEB_SESSION, `handoffDecision.departmentId` é aplicado durante decisão/transição de handoff; antes disso, estado pode transportar contexto intermediário do fluxo. Não há, nesta auditoria, evidência de marcador comum de proveniência que torne todos esses valores autorização departamental de leitura BOT.

Consequência para a matriz: SUPERVISOR/AGENT dependem de destino operacional confirmado e vínculo válido, não apenas de field não nulo. Sem prova suficiente, negar a nova exceção a esses papéis; não inferir destino nem conceder acesso com base no fallback. ADMIN continua proposta no próprio tenant, inclusive BOT sem departamento; nada disso está implantado. Antes de implementar leitura departamental, revisar se um sinal existente de roteamento confirmado basta; se não, apresentar mudança mínima de representação para decisão, sem adicionar infraestrutura nesta etapa.

Contratos a reutilizar: `app/routes.ts::hasConversationDepartmentAccess` e resolvedor canônico de vínculos para escopo; `conversation/conversation.service.ts::shouldAutoReply` para controle BOT/HUMAN (não autorização de leitura); `inbox/messageVisibility.ts` para privacidade; `realtime/agentReadAccess.ts` para leitura por evento; claim existente para intervenção explícita. Nenhum desses contratos, isoladamente, transforma contexto de fluxo em destino confirmado. O antigo filtro BOT e o atual Automação são apresentação, não fonte de autorização.
