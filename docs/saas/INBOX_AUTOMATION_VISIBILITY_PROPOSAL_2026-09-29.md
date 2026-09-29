# Acompanhamento da automação na Inbox — proposta, 29/09/2026

## Escopo vigente — decisão do owner e implementação local

O direcionamento final substitui **tanto a matriz departamental quanto a alternativa ADMIN-only** abaixo. Com `allowAutomationConversationsInInbox=true`, SUPERVISOR/ADMIN autenticados do próprio tenant acompanham BOT somente no filtro Automação, sem exigir vínculo departamental. AGENT não recebe exceção. Default false; gestão ADMIN. O campo departmentId não é usado como autorização desta leitura, portanto não há marcador de destino nem nova regra departamental. As regras de departamento/capacidade continuam valendo nas intervenções explícitas existentes.

**LOCAL VALIDATED / NOT DEPLOYED**, conforme [implementação e evidências](INBOX_AUTOMATION_LOCAL_2026-09-29.md). A correção 91230f88 permanece separada. A demanda maior de intervenção coordenada com resposta automática em andamento continua pendente; esta chave não cancela envios nem altera esse contrato. Campanhas/CRA aguardam validação funcional do owner; SECULT encerrada.

Os registros a seguir são histórico da proposta/auditoria, superados apenas onde conflitarem com o escopo vigente.

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

- Backend `http/routes.ts`: `conversationListItemIsAutomation`, `shouldUserSeeConversationInInbox`, `shouldUserSeeConversationDetail`, `hasConversationDepartmentAccess`, listagem/contagens, detalhe, timeline e mídia. A projeção humana atualmente elimina BOT antes do filtro. Criar decisão condicional comum de leitura de automação, sem redefinir BOT como trabalho humano. Aplicar também por ID e antes de entregar mensagens/anexos.
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

Contratos a reutilizar: `http/routes.ts::hasConversationDepartmentAccess` e resolvedor canônico de vínculos para escopo; `conversation/conversation.service.ts::shouldAutoReply` para controle BOT/HUMAN (não autorização de leitura); `inbox/messageVisibility.ts` para privacidade; `realtime/agentReadAccess.ts` para leitura por evento; claim existente para intervenção explícita. Nenhum desses contratos, isoladamente, transforma contexto de fluxo em destino confirmado. O antigo filtro BOT e o atual Automação são apresentação, não fonte de autorização.

## Verificação do contrato departamental — etapa local sobre 91230f88

**BLOCKED BEFORE IMPLEMENTATION: decisão de escopo de leitura BOT, não impedimento técnico do helper de vínculos.** Nenhum código/configuração alterado; nenhuma nova consulta produtiva. Esta conclusão distingue contrato vigente de condição proposta e não cria marcador de confirmação.

### O que já está comprovado

- `http/routes.ts::loadAppDepartmentAccess` (32433) usa `users/departmentMemberships.ts::getUserDepartmentMemberships`, com memberships ativos, departamento não explicitamente inativo e compatibilidade com vínculo legado. `hasConversationDepartmentAccess` (32512) compara departamento e mantém a exceção do responsável atual. Não consulta proveniência nem confirmação do destino.
- `inbox/messageVisibility.ts::shouldUserSeeConversationInInbox` primeiro exige `shouldProjectConversationToHumanInbox`, depois aplica papel, responsabilidade, política shared/assignee_only_after_assignment e departamento. BOT puro não satisfaz a projeção apenas por ter departamento. Isso comprova o escopo humano existente, não uma autorização prévia de leitura BOT. Exceções e campos inconsistentes não devem ser usados como contrato da nova chave.
- A arquitetura Postgres-first identifica runtime/Conversation como fonte oficial do estado operacional (`docs/ARCHITECTURE_POSTGRES_RUNTIME_STATE.md`), mas não define que todo contexto departamental de automação seja domínio de leitura de AGENT/SUPERVISOR.
- Portanto “destino confirmado” é uma restrição da proposta, não requisito já codificado no resolvedor. Não se deve exigir novo marcador por suposta obrigação do contrato atual.

### Origem do campo em cada caminho

| Caminho | Escrita observada | O que comprova e o que não comprova |
| --- | --- | --- |
| Meta/IA | `whatsapp/webhook.controller.ts::upsertConversationSafe` (~1596) resolve departamento também pela presença de status; `resolveRuntimeDepartmentId` (~1143) usa `bootstrap/defaultOperationalDepartment.ts::resolveOperationalDepartmentId` | Pode persistir departamento padrão mesmo sem escolha de destino humano. O resolvedor valida tenant/atividade ou devolve fallback; não afirma autorização de acompanhamento BOT |
| Meta/chatbot e WEB_SESSION/chatbot | `chatbot/chatbotFlow.ts::mergeFlowMetadata` (1249, escrita 1309) copia departmentId/queueId de metadados; chamado em cadeia de nós (1603), captura (1924) e opções (1976/2079) | O campo pode representar contexto intermediário enquanto o fluxo continua. Não equivale necessariamente a handoff ou a concessão de leitura |
| WEB_SESSION | `web-session/webSessionInbound.ts::ensureWebSessionRuntimeState` (~1073) distingue destino humano por departamento+fila e sinais humanos; novo BOT evita o destino padrão. Depois o chatbot pode fornecer contexto | Preserva semântica diferente do fallback Meta; ausência de fallback inicial não torna todo departamento posterior um destino confirmado |
| Handoff humano | `chatbot/departmentAwareHandoff.ts::resolveDepartmentAwareHandoff`, chamado em Meta (~5726) e WEB_SESSION (~3160), resolve tenant, departamento ativo, fila e horário | Sustenta roteamento humano. Exigir handoff para acompanhar BOT excluiria justamente a automação antes da transferência; não é solução silenciosa para este requisito |

Não foi encontrada definição que torne o departamento padrão ou o metadado intermediário uma concessão de acompanhamento. Também não há distinção universal da origem apenas pelos campos atuais. Comparar ID com departamento padrão não resolve: um destino legítimo pode ser justamente o padrão. Inferir pelo nó atual também não resolve contexto herdado de opções anteriores. Não construir uma segunda interpretação de memberships, nem backfill ou marcador novo nesta etapa.

### Decisão concreta e menor alternativa

Para liberar leitura departamental de AGENT/SUPERVISOR, falta definir **se o departamento atualmente persistido delimita também o acompanhamento BOT, inclusive quando veio de fallback ou metadado intermediário**. Aceitar essa regra seria uma decisão explícita de produto sobre a nova permissão; permitiria reutilizar os campos e resolvedores existentes sem marcador, com validação do departamento no mesmo tenant e vínculos atuais. Não é conclusão já comprovada pelos contratos humanos.

**Menor alternativa conservadora:** primeira versão do acompanhamento somente para ADMIN do próprio tenant, com chave default false; AGENT/SUPERVISOR não recebem a nova exceção enquanto essa semântica não estiver definida. Sem novo schema/marcador, sem atribuição ou mudança de lifecycle. Essa alternativa é apresentada para decisão, não foi implementada. Se forem exigidos agentes já nesta versão, decidir a regra do parágrafo anterior antes de iniciar o delta.

Após essa definição, implementação ainda terá de unificar lista/contagem/detalhe/mensagens/mídia/eventos BOT, preservar management_only e privacidade, negar mutações concedidas apenas pela chave e manter revogação. O caminho realtime amplo de SUPERVISOR não serve como autorização. Respostas automáticas em andamento continuam limitação material separada; a nova leitura não interrompe provider.

Sem testes/builds repetidos, pois a etapa foi de leitura de contratos. Não atribuir as evidências de 91230f88 à funcionalidade BOT inexistente. Worker mínimo permanece intacto, nenhum delta BOT gerado. SECULT encerrada; campanhas/CRA aguardam validação funcional do owner.
