# CRA-PR PE 90004/2026 - Aderencia Tecnica

Status: auditoria documental baseada no estado do repositorio em `c4b1cc3 Sprint 85F protocol continuation link`.

Legenda:

- atende;
- atende com configuracao;
- atende parcialmente;
- depende de Meta/cliente;
- depende de documentacao;
- risco comercial.

## Matriz De Aderencia

| # | Requisito | Status | Evidencia/observacao |
| ---: | --- | --- | --- |
| 1 | Plataforma SaaS/web em nuvem | atende | Next app, backend WhatsApp Agent, deploy/runbooks. |
| 2 | WhatsApp oficial / Meta Cloud API | atende | Webhook Meta, Cloud API, templates, assinatura e docs. |
| 3 | Operacao regular Meta/vinculo equivalente | depende de documentacao | Implementado tecnicamente; exige comprovacao comercial/documental. |
| 4 | Atendimento multicanal centralizado | atende | Inbox centraliza WhatsApp, Instagram, Messenger e Webchat. |
| 5 | WhatsApp | atende | Inbound/outbound, templates, midia, timeline. |
| 6 | Instagram Direct | atende | Inbound/outbound manual human-only validado em docs Meta. |
| 7 | Facebook Messenger | atende | Inbound/outbound manual via channelAccounts. |
| 8 | Site institucional / Webchat / widget | atende | `/webchat/v1`, widget publico e Webchat RE7. |
| 9 | Identificacao do canal de origem | atende | `Conversation.channel` e filtros/relatorios por canal. |
| 10 | Historico completo | atende | `Conversation`, `InboundMessage`, `OutboundMessage`, timeline. |
| 11 | Encaminhamento para setores | atende | departamentos, filas e handoff. |
| 12 | Situacao do atendimento | atende | runtime status e SLA operacional. |
| 13 | Chatbot por menus | atende | `ChatbotFlow` e Webchat intake profissional. |
| 14 | Botoes | atende com configuracao | Webchat tem opcoes clicaveis; WhatsApp depende formato Meta/template. |
| 15 | Listas | atende parcialmente | Estrutura de menus existe; listas nativas WhatsApp exigem validacao operacional. |
| 16 | Arvore de decisao | atende | Fluxos com nos, opcoes e roteamento. |
| 17 | Palavras-chave para acionamento | atende parcialmente | Triggers/intencoes existem em fluxos; catalogo amplo deve ser configurado. |
| 18 | Respostas automaticas configuradas | atende | Bot por conteudo previamente configurado. |
| 19 | Sem dependencia de IA generativa | atende | Nucleo do fluxo e por menus; IA nao e requisito principal. |
| 20 | Atendimento humano/transferencia | atende | claim, transfer, release, handoff. |
| 21 | Filas/setores/grupos | atende | `Department`, `Queue`, runtime state. |
| 22 | Atendente responsavel | atende | `assignedUserId`, `assignedAt`, Inbox. |
| 23 | Registro de interacoes | atende | timeline e eventos operacionais. |
| 24 | Continuidade por protocolo | atende | Sprint 85D/85F. |
| 25 | Protocolo CVT no Webchat e Inbox | atende | `buildConversationProtocol`, Webchat e Inbox. |
| 26 | Lookup seguro por protocolo | atende | Busca tenant-scoped com prova de posse. |
| 27 | Anti-enumeracao | atende | Resposta generica para protocolo invalido/outro tenant/confirmacao incorreta. |
| 28 | Confirmacao por e-mail/telefone | atende | Prova de posse antes de exibir status. |
| 29 | Vinculo operacional de continuidade | atende | `ConversationRuntimeState.answers.protocolContinuation`. |
| 30 | Auditoria/rastreabilidade | atende | eventos, protocolo, runtime e logs redigidos. |
| 31 | Disparo ativo em lote WhatsApp | atende parcialmente | `Campaign`, templates e outbound existem; volume/operacao CRA-PR exigem validacao. |
| 32 | Templates/HSM oficiais | atende | `Template`, `TemplateRequest`, fallback por janela. |
| 33 | Apoio a criacao/submissao templates | depende de documentacao | Produto apoia gestao; processo de acompanhamento deve ser descrito. |
| 34 | Classificacao de templates Meta | depende de Meta/cliente | Depende de categoria e aprovacao Meta. |
| 35 | Bloqueio WhatsApp Web/API nao oficial | atende | Arquitetura usa Cloud API; declarar expressamente. |
| 36 | Importacao XLSX/CSV | atende parcialmente | Exige evidenciar fluxo de importacao final. |
| 37 | Importacao via API propria | atende parcialmente | Public API existe; escrita/importacao por API deve ser confirmada. |
| 38 | Segmentacao de listas | atende parcialmente | Campanhas/recipients existem; segmentacao avancada precisa configuracao/evidencia. |
| 39 | Higienizacao/deduplicacao | atende parcialmente | Dedupe deve ser comprovado para listas de disparo. |
| 40 | Variaveis personalizadas | atende com configuracao | Templates aceitam parametros; mapeamento depende da lista. |
| 41 | Arquivos/imagens/PDFs/links/midias | atende com configuracao | Atendimento suporta midia; campanha depende template/politica Meta. |
| 42 | Agendamento de lotes | atende parcialmente | Nao prometer sem validar agenda operacional de campanhas. |
| 43 | Mensagem-teste antes do disparo | atende parcialmente | Smokes existem; acao formal no fluxo deve ser validada. |
| 44 | Cancelamento/pausa de lotes | atende parcialmente | Cancelamento existe; pausa explicita nao comprovada. |
| 45 | Status das mensagens | atende | `OutboundMessage`, `messagesMetaStatus`, falhas/status Meta. |
| 46 | Exportacao CSV/XLSX/PDF | atende parcialmente | CSV forte; PDF em relatorios especificos; XLSX/XML nao comprovado. |
| 47 | Opt-out/descadastro | atende parcialmente | Precisa formalizar bloqueio/descadastro para campanhas. |
| 48 | Registro de descadastro | atende parcialmente | Exige evidencia/processo especifico. |
| 49 | Monitoramento limites/qualidade Meta | depende de Meta/cliente | Status e falhas existem; quality/limites dependem Meta/console. |
| 50 | Relatorio consumo mensal | atende parcialmente | Metricas existem; consolidar relatorio de faturamento. |
| 51 | Faturamento por aceitas/enviadas | risco comercial | Definicao precisa ser esclarecida no edital/contrato. |
| 52 | Disponibilidade 99,5% | depende de documentacao | Health, alertas e SLA evidence existem; compromisso e operacional. |
| 53 | Operacao 24x7 salvo manutencao | depende de documentacao | Procedimento operacional e comunicacao precisam constar. |
| 54 | Controle de acesso por usuario | atende | App users e sessoes. |
| 55 | Perfis de permissao | atende | RBAC. |
| 56 | Autenticacao segura | atende | Login/sessoes/RBAC. |
| 57 | Logs e auditoria | atende | Logger com redaction e eventos. |
| 58 | Criptografia em transito | atende com configuracao | HTTPS em producao. |
| 59 | Interface administrativa gestores | atende | `/app` e `/admin`. |
| 60 | Configuracao fluxos, usuarios, setores, filas e permissoes | atende | UIs/APIs existentes. |
| 61 | Horario de atendimento | atende parcialmente | Deve ser configurado/documentado para CRA-PR. |
| 62 | Nao atribuir fora do expediente | atende parcialmente | Exige regra operacional/configuracao. |
| 63 | Encerramento automatico sem resposta | atende parcialmente | Status/close existem; auto-close precisa evidencia. |
| 64 | Mensagens feriados/sazonais | atende com configuracao | Configuravel via fluxos/mensagens. |
| 65 | API/webhook/integracoes futuras | atende parcialmente | Public API/webhooks existem; escopo de escrita e integracao deve ser delimitado. |
| 66 | Integracao ERP/e-mail | depende de terceiro | Possivel via API/webhook, nao pronta para sistema especifico. |
| 67 | Historico durante vigencia | atende | Persistencia e timeline. |
| 68 | Exportacao historicos/contatos/relatorios | atende parcialmente | Historicos/relatorios sim; contatos e formatos XLSX/XML precisam confirmar. |
| 69 | Indicadores gerenciais | atende parcialmente | Volume, status, canal, fila, usuario, SLA; etiquetas/lotes/leitura/falhas parcialmente. |
| 70 | Usabilidade/acessibilidade | atende parcialmente | UI web responsiva; sem laudo formal. |
| 71 | Suporte remoto horario comercial | depende de documentacao | Plano SLA neste pacote. |
| 72 | Chamados/acompanhamento suporte | atende parcialmente | Webchat/protocolo interno; processo externo deve ser descrito. |
| 73 | SLA alta/media/baixa | depende de documentacao | Plano SLA neste pacote. |
| 74 | Treinamento remoto | depende de documentacao | Plano de implantacao inclui treinamento. |
| 75 | Material de apoio | depende de documentacao | Preparar anexos/prints se participar. |
| 76 | Boas praticas WhatsApp Business Platform | depende de documentacao | Incluir em treinamento e proposta tecnica. |
| 77 | Ate 30 usuarios/atendentes | atende com configuracao | Evidencia de 25 usuarios e bootstrap com limite 60. |
| 78 | 2.000 conversas receptivas/mes | atende com ressalva | Load lab sustenta; teste especifico mensal nao executado. |
| 79 | 10.000 mensagens ativas/mes | atende parcialmente | Campanhas existem; volume exige validacao e custo Meta. |
| 80 | Implantacao em 30 dias | atende com configuracao | Plano de implantacao neste pacote. |
| 81 | Titularidade ativos CRA-PR | depende de Meta/cliente | Tratar em contrato/esclarecimento. |

## Pontos Fortes

- WhatsApp oficial e ausencia de WhatsApp Web/API nao oficial.
- Instagram Direct e Facebook Messenger operacionais em modo humano.
- Webchat/widget com fluxo profissional RE7.
- Protocolo CVT exibido no Webchat e no Inbox.
- Continuidade por protocolo com prova de posse e anti-enumeracao.
- Inbox multicanal com historico, filas, responsavel e status.
- Relatorios operacionais e SLA.
- RBAC, logs redigidos, tenant isolation e governanca por capabilities.

## Ressalvas Principais

- opt-out/descadastro formal para disparos;
- relatorio de consumo/faturamento por mensagens aceitas/enviadas;
- validacao de 10.000 mensagens ativas/mes;
- monitoramento de qualidade/limites Meta;
- titularidade e transferencia de ativos Meta;
- formatos XLSX/XML se forem exigidos literalmente.

