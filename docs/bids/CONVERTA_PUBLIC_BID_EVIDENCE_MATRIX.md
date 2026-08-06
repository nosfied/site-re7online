# Converta Public Bid Evidence Matrix

Status: matriz reutilizavel para propostas, diligencias e PoCs. Usar sempre com validacao do edital especifico.

| Requisito comum de edital | Evidencia Converta | Funcionalidade/endereco | Status | Observacao | Gap/risco |
| --- | --- | --- | --- | --- | --- |
| API Oficial WhatsApp/Meta | Uso de canal WhatsApp oficial com modelos aprovados e webhooks | Inbox, templates, campanhas | Aderente condicionado | Depende de configuracao autorizada do tenant | Disponibilidade do provedor e aprovacao Meta |
| Modelos aprovados | Catalogo de modelos, solicitacao interna, revisao e submissao administrativa | `/app/templates`, `/admin/templates/manage` | Aderente | Tenant nao submete diretamente sem revisao | Tempo de aprovacao Meta |
| Envio ativo | Campanhas com rascunho, previa e envio explicito | `/app/campaigns` | Aderente | Bloqueios de opt-out, anonimizado e elegibilidade | Custo e politica Meta por categoria |
| Atendimento receptivo | Inbox multicanal com timeline, claim e resposta | `/app/inbox` | Aderente | Janela livre respeitada por canal | Canal depende de permissao/configuracao |
| Atendimento humano | Assumir conversa, modo humano e filas/departamentos | Inbox | Aderente | Preserva responsavel e estado operacional | Treinamento operacional necessario |
| Chatbot/fluxos | Automacao por fluxos, menus, intents e roteamento | Bot/automacoes do tenant | Aderente conforme escopo | Evitar promessa de IA generativa ampla | Parametrizacao por tenant |
| CRM operacional | Contatos/leads, status, busca, filtros e detalhe | `/app/crm`, `/app/settings/crm` | Aderente | CRM oculta anonimizados por padrao | Relatorio admin amplo de anonimizados e P2 |
| Campanhas | Previa CRM, draft, variaveis e envio explicito | `/app/campaigns` | Aderente | Criacao de rascunho nao envia | Requer modelos aprovados |
| Opt-out | Registro por evento e bloqueio de envio ativo | CRM, campanhas, eventos | Aderente operacional | Reversao por evento quando autorizada | Tabela dedicada pode ser evolucao futura |
| LGPD/anonimizacao | Minimiza dados, oculta da operacao e bloqueia reidratacao | Politica LGPD, guards inbound | Aderente operacional | Nao e hard delete | Relatorio restrito futuro pode fortalecer auditoria |
| Relatorios | CSV de campanhas e relatorios Meta agregados | Campanhas, uso Meta JSON/CSV | Aderente | Dados sanitizados | Customizacoes por edital podem ser necessarias |
| Controle de custo Meta | Ledger, resumo, preview e relatorio mensal | Uso Meta | Aderente estimativo | Nao substitui demonstrativo oficial Meta | Bloqueio automatico ainda nao ativado |
| Usuarios/RBAC | ADMIN, SUPERVISOR, AGENT e capabilities | App/admin/backend | Aderente | Acesso por tenant e perfil | Matriz formal por edital deve ser anexada |
| Multitenancy | Tenant da sessao em endpoints app | Backend app routes | Aderente | Sem `clientId` arbitrario na UI operacional | Validar tenant antes de PoC |
| Auditoria por Event | Eventos para templates, campanhas, opt-out, privacidade e ledger | Event store | Aderente | Payload sanitizado | Consultas especificas podem requerer relatorio |
| Exportacao CSV | Campanhas e uso Meta mensal | Campanhas, uso Meta | Aderente | Sem dados pessoais desnecessarios | Layout pode variar por edital |
| Janela 24h WhatsApp | Texto livre bloqueado quando fechado; modelo aprovado disponivel | Inbox | Aderente | Orientacao operacional explicita | Politica Meta pode mudar |
| Mensagens prontas | Textos operacionais por tenant | `/app/templates`, `/app/inbox` | Aderente | Nao sao modelos Meta | So funcionam dentro das regras do canal |
| Modelos no Inbox | Envio de modelo aprovado na conversa | `/app/inbox` | Aderente | Acao explicita e auditavel | Exige modelo aprovado/ativo |
| Bloqueio de anonimizado | CRM oculta; campanhas bloqueiam `anonymized_contact` | CRM, campanhas | Aderente | Nao reidrata dados antigos | Administracao restrita pode ser evolucao |
| Controles de tenant | Capabilities, configuracao operacional e canais | Config/admin | Aderente | Ativacao controlada | Mudancas exigem autorizacao |
