# SECULT — divergência percebida na Inbox, final1215

**READ ONLY AUDIT / CURRENT OPERATION IN_PROGRESS / UI CAUSE NOT YET CONFIRMED.** Tenant secult-pe; não alterar atendimento, responsável, CRM, janela ou históricos. A janela bancária17h15 e seus gatesfalse permanecem separados.

Captura consistente SQL REPEATABLE READ READ ONLY13/10,16:25:15UTC /13:25:15Fortaleza. Um Contact ativo, uma Conversation e um runtime para a identidade completa correlacionada do contato indicado; não houve deduplicação por sufixo. Runtime HUMAN/IN_PROGRESS/handoffACTIVE, assignedUserId e assignedTo coerentes, chatbotActivefalse, closedAtnull. Conversation não excluída/anonimizada. Nenhum segundo atendimento encontrado no escopo completo de identidade do tenant.

Segunda leitura delimitada16:27:48UTC /13:27:48Fortaleza confirmou uma atribuição13/10,13:10:59.666UTC /10:10:59.666Fortaleza, destinatário SUPERVISOR ativo. Evento conversation.transferred às13:10:59.716UTC registra IN_PROGRESS e o mesmo responsável. Lead possui statusNEW e não foi atualizado por esta auditoria. Conteúdo das mensagens, senhas, tokens e ambiente não foram consultados/publicados. Somente metadados operacionais, rótulos e referências necessários.

O compilado routes.js efetivo SHA41f7f15814d7f45429d489e81588a76f2383a3acd01c54813335418a11bec715 corresponde aos manifests da API dinâmica/retorno compatível já publicada. Contrato lista: loadInboxConversationStatesFromDb lê runtime por clientId+identidades completas; serializeConversationOperationalFields promove WAITING atribuído para IN_PROGRESS. FiltroWAITING compara status operacional. Não executar entrypoint, provider ou código de recuperação.

Frontend: getConversationModeLabel usa HUMAN ou handoffactive/pending para o rótulo “Atendimento humano”; getConversationStatusLabelForItem separa o status operacional. Para a linha observada, resultado esperado é “Atendimento humano • Em atendimento”. O nome do modo sozinho não prova atendimento assumido. O LeadNEW é situação CRM separada; configuração DB crmBusinessStatusesnull, fallbackJSON não auditado e não usado para inferir o rótulo visual.

Há mecanismo explícito de preservação de seleção: mergeConversationsPreservingStableOrder mantém preserveMissingIdentities mesmo quando a API filtrada deixa de devolver a conversa. Uma conversa selecionada pode permanecer visível fora do filtro; isso é hipótese compatível com o relato, não prova da causa histórica. A atualização do detalhe aplica payload operacional próprio. Não houve captura da resposta HTTP do navegador nem screenshot desta ocorrência.

Foi solicitado ao owner recarregar somente em leitura e localizar “Aguardando atendimento” (cabeçalho, lista/filtro ou CRM). Essa informação/resposta efetiva será necessária se a divergência persistir. Não declarar bug de persistência, cache ou CRM comprovado; não reparar o banco por aparência. Menor próximo passo: correlacionar o elemento e seu payload/status sem ações mutáveis.

Limites operacionais preservados: primeira consulta chegou ao SQL mas o leitor falhou no decode do JSON multiline; captura posterior corrigiu apenas a leitura do output, sem alterar dados. Uma tentativa posterior recusou DNS e foi preservada. Leitura inicial de rótulos CRM não encaminhou stdin e gerou zero bytes, nunca considerada PASS; leitura completa subsequente com docker exec-i retornou statusesnull. Capturas privadas600/diretório700, consultas com statement/lock timeout; nenhum envio, claim, transferência, alteração de status/configuração ou restart.

## Continuidade — relato de Assumir na sexta e estado visual esclarecido

Owner confirmou que os rótulos ficaram corretos após a atribuição de hoje. O estado visual anterior “Atendimento humano / Aguardando atendimento” é compatível com encaminhamento para fila humana sem responsável; não prova atendimento efetivamente assumido.

Leitura histórica adicional somente leitura, identidades completas/clientId restrito:21eventos e8Outbounds desta conversa, todos os8sourcebot. Na sexta09/10,23:09:58Fortaleza, a conversa foi criada por inbound Web; às23:12:17–20 o bot enviou encaminhamento, protocolo, posição1 da fila e aviso de ausência de atendente/próximo expediente. Departamento Dúvidas Gerais-SECULT/PE possui seg-sex08h–17h, regras criadas/sem alteração desde19/08; mensagem e horário23h12 sustentam a condição fora do expediente. Nenhuma exceção departamental encontrada nesta consulta; não inferir calendário/expediente da segunda12/10 a partir disso. Protocolo e sourcebot são prova de ação automática, não de Assumir por Anna.

Histórico de atribuições desta identidade: uma linha, hoje13/10,10:10:59.666Fortaleza, fromUserIdnull→Mirella; evento conversation.transferred correspondente às10:10:59.716, estadoIN_PROGRESS. Registro é atribuição/transferência, não evento conversation.assigned. Não há conversation.assigned nem atribuição a Anna no escopo consultado. Usuária Anna existe/ativa no tenant, mas isso não prova ação. Nenhuma resposta humana observada nos8Outbounds. Ausência de registro não comprova que nunca houve clique/tentativa ou interação fora do Converta; não concluir perda de atribuição ou imputar erro à equipe sem horário/protocolo/evidência adicional.

Conclusão: bot encaminhou para atendimento humano fora do expediente e fila aguardava atribuição; atribuição efetiva comprovada hoje, rótulos agora coerentes. Alegação de Assumir por Anna na sexta permanece não confirmada. Menor continuação, se a equipe sustentar a ação: obter horário/protocolo da tentativa e correlacionar sem repetir atendimento, alterar estado ou reenviar. Mensagem para o grupo foi apenas redigida para encaminhamento pelo owner; nenhum envio por ferramenta.

Uma consulta histórica inicial foi recusada por campoisActive inexistente em Queue; diagnóstico preservado, SQLREADONLY sem efeito. Após conferir schema, consulta completa chegou a exit0 e aos dados acima. Não foi introduzido default para o campo nem feita mutação/repair.

## Janela de24h — conferência13/10,14:30Fortaleza

Leitura READ ONLY atual17:30:18UTC: lastInboundAt10/10,02:12:15UTC = sexta09/10,23:12:15Fortaleza; windowExpiresAt11/10,02:12:15UTC = sábado10/10,23:12:15Fortaleza. Nenhum inbound posterior no histórico dessa identidade. IN_PROGRESS/atribuição13/10 permanece. Últimos inboundsproviderweb_session/semphoneNumberId: não houve consulta à Meta nem certificação de sua sessão/conta. Distinguir prazo registrado no Converta de observação remota da Business Platform.

windowIsOpentrue está persistido, mas não significa prazo vigente: helper canônico isInboxFreeformWindowOpen requer booleantrue e expiresAt válido maior que now. Prazo observado já expirou. Assumir/transferir, protocolo, mensagens do bot e horário de expediente não renovaram o timestamp. Nenhuma alteração para tornar a janela aberta.

A [política oficial WhatsApp Business Platform](https://whatsappbusiness.com/policy/), seção2, estabelece janela24h reiniciada por mensagem do usuário; fora dela, mensagens pela API exigem templates aprovados. Template enviado pela empresa, por si só, não é inbound do cliente. Não confundir atendimento ainda aberto com possibilidade de texto livre pela Meta, nem apresentar Web como contingência autorizada ou garantia de janela Meta. Mensagem para o grupo apenas sugerida; nenhum envio/provider/alteração de modalidade.

A consulta preliminar usou receivedAt, inexistente em InboundMessage, e foi negada; original/diagnóstico preservados. Consulta final usou createdAt do schema efetivo; o horário canônico da mensagem veio de runtime.lastInboundAt, não foi substituído pelo horário de persistência. Não houve mutação.
