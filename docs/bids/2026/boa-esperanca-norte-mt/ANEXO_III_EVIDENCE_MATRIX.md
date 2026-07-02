# Boa Esperanca do Norte/MT - Matriz Anexo III

Fonte: Anexo III do Edital da Concorrencia Eletronica no 001/2026.

Taxonomia:

- **Atende**: existe evidencia objetiva no produto/codigo/documentacao.
- **Atende com demonstracao**: existe capacidade real, mas deve ser comprovada por POC, parametrizacao ou artefato operacional.
- **Parcial**: existe base tecnica, mas falta prova E2E especifica ou compromisso operacional.
- **Nao comprovado**: nao foi localizada evidencia objetiva suficiente.

## Resumo

| Status | Qtde |
| --- | ---: |
| Atende | 70 |
| Atende com demonstracao | 14 |
| Parcial | 10 |
| Nao comprovado | 3 |
| Total | 97 |

## Matriz Dos 97 Criterios

| # | Criterio | Status | Evidencia Converta | Roteiro de demonstracao |
| ---: | --- | --- | --- | --- |
| 1 | Arquitetura WEB totalmente acessivel por navegador | Atende | Next.js App em `/app/*`, login web e painel administrativo | Abrir `/app/login`, Dashboard, Inbox e Relatorios via navegador. |
| 2 | Ambiente de computacao em nuvem ou equivalente | Atende com demonstracao | Operacao SaaS documentada em `HIGH_AVAILABILITY_SCALE_DESIGN.md`, `OPERATIONAL_BASELINE.md` | Mostrar topologia SaaS, health publico e PM2/DB como evidencia operacional. |
| 3 | Arquitetura orientada a servicos ou equivalente | Atende | Backend `apps/whatsapp-agent`, Public API, webhooks, modulos de metrics/logging | Apresentar diagrama tecnico e rotas `/public-api/v1/*`, `/admin/ops/*`. |
| 4 | Escalabilidade horizontal da infraestrutura | Parcial | Design HA/scale existe; runtime atual e VPS single-node | Apresentar roadmap HA e explicar que o contrato atual comporta volumetria prevista com capacidade atual e hardening. |
| 5 | Operacao continua com disponibilidade adequada para servicos publicos | Atende com demonstracao | `/health`, `/admin/ops/metrics`, `/admin/ops/alerts`, SLA evidence | Demonstrar health, alertas e registro mensal de SLA. |
| 6 | Expansao de funcionalidades sem substituicao da plataforma | Atende | Arquitetura Converta Platform, capabilities e feature packs | Mostrar `MARKET_PROFILE_ARCHITECTURE.md` e capabilities. |
| 7 | Arquitetura modular para inclusao de novos recursos | Atende | Modulos WhatsApp, Webchat, KB, Public API, Search, Reports, SLA | Demonstrar menus/capabilities e repositorio modular. |
| 8 | Evolucao sem interrupcao total da operacao | Atende com demonstracao | Release checklist, PM2 reload, build sequencial | Mostrar `RELEASE_CHECKLIST.md` e estrategia de deploy controlado. |
| 9 | Operacao simultanea de multiplos usuarios administrativos | Atende | `User`, roles, sessoes, teste `simae25UsersAcceptance.test.ts` | Mostrar usuarios ADMIN/SUPERVISOR/AGENT e acesso simultaneo. |
| 10 | Expansao futura do ecossistema digital institucional | Atende | Public API, webhooks, capabilities, KB e integrations design | Mostrar API keys, webhooks e roadmap de integracoes. |
| 11 | Criacao completa da identidade institucional do assistente virtual | Atende com demonstracao | Chatbot settings, tenant config, prompts e fluxos | Configurar saudacao e linguagem institucional da Camara no ambiente demo. |
| 12 | Configuracao personalizada da mensagem inicial | Atende | `/app/chatbot`, `ChatbotFlow`, tenant automation settings | Editar saudacao inicial no painel. |
| 13 | Multiplos padroes de comunicacao institucional | Atende | Fluxos, templates, KB articles e tenant config | Mostrar diferentes fluxos/temas e mensagens por setor. |
| 14 | Parametrizacao da linguagem utilizada pelo assistente | Atende com demonstracao | `tenantOperationalConfig`, IA assistant config, chatbot settings | Demonstrar perfil de atendimento institucional e tom de resposta. |
| 15 | Edicao dinamica das mensagens institucionais pelo painel | Atende | `/app/chatbot`, `/app/knowledge-base` | Editar texto de fluxo ou artigo KB durante POC. |
| 16 | Padronizacao da comunicacao institucional | Atende | Templates, flows e KB por tenant | Mostrar mensagens oficiais e respostas baseadas em artigos. |
| 17 | Adaptacao do assistente conforme identidade publica | Atende com demonstracao | Government profile/capabilities, tenant config | Exibir configuracao visual/textual institucional. |
| 18 | Alterar parametros operacionais sem fornecedor | Atende | Painel app/admin para chatbot, KB, users, departments, SLA/reports | Administrador altera fluxo/artigo/departamento no painel. |
| 19 | Edicao da comunicacao institucional autonoma pela equipe | Atende | `/app/chatbot`, `/app/knowledge-base` com RBAC | Usuario ADMIN/SUPERVISOR edita conteudo. |
| 20 | Evolucao continua da identidade comunicacional | Atende | Fluxos e artigos versionaveis/editaveis | Criar novo conteudo e publicar. |
| 21 | Criacao ilimitada de fluxos automatizados | Parcial | `ChatbotFlow` sem limite funcional documentado, mas sem garantia contratual de ilimitado absoluto | Declarar limites operacionais razoaveis e demonstrar criacao de fluxo. |
| 22 | Fluxos condicionais baseados em regras | Atende | Chatbot flow definitions e condicionais/intents | Demonstrar bifurcacao por opcao/intencao. |
| 23 | Decisoes automatizadas dentro dos fluxos | Atende | Flow executor/qualification/handoff | Mostrar triagem automatica para setor. |
| 24 | Alteracao de fluxos sem programacao | Atende | Tela `/app/chatbot` | Editar fluxo em POC. |
| 25 | Multiplos niveis hierarquicos de atendimento | Atende | ADMIN/SUPERVISOR/AGENT, departments/queues | Mostrar roles e permissoes. |
| 26 | Fluxos especificos para diferentes servicos institucionais | Atende | Chatbot flows por tenant | Criar fluxo para Protocolo, Ouvidoria, Diario Oficial. |
| 27 | Reorganizacao dos fluxos sem impacto na operacao | Atende com demonstracao | Edicao no painel; deploy nao necessario | Ajustar ordem/opcoes em ambiente demo. |
| 28 | Fluxos hibridos entre automatizado e humano | Atende | Handoff humano, claim/release, transferencias | Mostrar bot transferindo para atendente. |
| 29 | Encaminhamento automatizado para setores especificos | Atende | Departments/queues no runtime state | Direcionar demanda para setor da Camara. |
| 30 | Atualizacao dinamica dos fluxos conforme mudancas | Atende | CRUD de chatbot flows | Editar fluxo e salvar sem codigo. |
| 31 | Base de conhecimento institucional estruturada | Atende | `KnowledgeBaseCollection`, `KnowledgeBaseArticle`, `/app/knowledge-base` | Criar colecao e artigo institucional. |
| 32 | Atualizacao continua da base de conhecimento | Atende | CRUD KB e publish/archive | Atualizar artigo e republicar. |
| 33 | Organizacao por temas institucionais | Atende | Collections, tags, intentKeys | Mostrar colecoes por temas. |
| 34 | Inclusao autonoma de novos conteudos | Atende | `/app/knowledge-base/articles` | Criar artigo sem fornecedor. |
| 35 | Uso da base para respostas automatizadas | Parcial | KB existe; uso direto no runtime precisa demonstracao controlada | Preparar POC com pergunta consultando artigo KB ou simular resposta vinculada a fonte. |
| 36 | Atualizacao da base pela equipe administrativa | Atende | RBAC + tela KB | Admin cria/edita artigo. |
| 37 | Expansao da base sem limitacao estrutural | Atende com demonstracao | Model tenant-scoped sem limite pequeno hardcoded | Mostrar arquitetura e declarar limites operacionais de armazenamento. |
| 38 | Reorganizacao das categorias da base | Atende | Collections editaveis e article collectionId | Mover/reclassificar artigo em colecao. |
| 39 | Aprimoramento continuo das respostas do assistente | Atende com demonstracao | KB, IA config, intent catalog, evaluation/replay | Mostrar ciclo: editar conteudo -> testar resposta. |
| 40 | Adaptacao da KB conforme novas demandas | Atende | CRUD KB por tenant | Criar nova pergunta frequente durante POC. |
| 41 | Envio de dados coletados para sistemas externos | Parcial | Public API/webhooks existem; envio a sistema externo dentro do fluxo ainda deve ser simulado | Demonstrar webhook/API externa mock recebendo payload. |
| 42 | Atualizacao automatica de registros em sistemas administrativos | Nao comprovado | Sem integracao real com sistema administrativo da Camara | Apresentar como integracao futura dependente de API do orgao. |
| 43 | Integracao com sistema de protocolo institucional | Parcial | Protocolo interno Converta e Public API; sem conector real do sistema da Camara | Simular chamada externa para protocolo via API mock. |
| 44 | Integracao com gestao documental | Parcial | Public API/webhooks; documentos/midia persistidos | Demonstrar export/API, sem declarar conector real. |
| 45 | Integracao com atendimento ao cidadao | Atende com demonstracao | Inbox, Public API, webhooks, handoff | Demonstrar fluxo externo simulado. |
| 46 | Integracao com cadastro institucional | Parcial | API externa possivel; sem conector real | Simular consulta de cadastro em API mock. |
| 47 | Multiplos sistemas institucionais simultaneamente | Parcial | Webhooks/API keys suportam multiplos endpoints; sem E2E com sistemas reais | Mostrar varios webhooks configurados ou plano de integracao. |
| 48 | Integracao com APIs externas | Atende | Public API, webhooks e clients de providers | Demonstrar chamada a API externa simulada. |
| 49 | Consumir APIs para dados institucionais | Parcial | Padrao tecnico existe; fluxo consumindo API precisa POC | Preparar endpoint mock de Diario/Portal e resposta no bot. |
| 50 | Envio de requisicoes para sistemas administrativos via API | Parcial | Webhook dispatch/API patterns | Simular POST para API externa. |
| 51 | Receber respostas estruturadas de APIs externas | Parcial | Public API e service patterns; sem fluxo pronto especifico | Simular API retornando JSON e exibir resposta. |
| 52 | Uso de APIs dentro dos fluxos automatizados | Parcial | Nao comprovado como funcionalidade generica do flow builder | Demonstrar simulacao assistida ou tratar como ajuste de produto. |
| 53 | Integracao com diferentes padroes de APIs | Atende com demonstracao | REST/HTTP, webhooks, HMAC, OpenAPI | Apresentar OpenAPI e webhook signature. |
| 54 | Atualizacao automatica por APIs | Nao comprovado | Nao ha conector generico comprovado para atualizar sistemas externos | Nao prometer sem sprint adicional. |
| 55 | Integracao com novos servicos digitais no futuro | Atende | Arquitetura modular, Public API, capabilities | Apresentar arquitetura. |
| 56 | Expansao do numero de integracoes com APIs | Atende | WebhookEndpoint por tenant, API keys/scopes | Mostrar tela API keys/webhooks. |
| 57 | APIs para automacao de processos administrativos | Parcial | API/webhooks existem; automacao administrativa especifica depende do sistema alvo | Simular fluxo em POC. |
| 58 | Autenticacao segura entre sistemas integrados | Atende | API keys, scopes, webhook secret/signature | Mostrar API key scopes e assinatura webhook. |
| 59 | Controle de acesso para usuarios administrativos | Atende | RBAC ADMIN/SUPERVISOR/AGENT, MFA foundation | Mostrar users/roles e bloqueios. |
| 60 | Logs de integracao entre sistemas | Atende | Webhook deliveries/attempts, Public API audit, logger | Mostrar delivery log/API audit. |
| 61 | Monitoramento das integracoes realizadas | Atende | Metrics, alerts, webhook deliveries | Mostrar `/admin/ops/metrics` e entregas webhook. |
| 62 | Protecao contra acessos nao autorizados | Atende | Auth, RBAC, capability enforcement, MFA, rate limits | Demonstrar bloqueio por perfil/capability. |
| 63 | Historico de interacoes na plataforma | Atende | Timeline, inbound/outbound, events | Abrir conversa e timeline. |
| 64 | Rastreabilidade das integracoes | Atende | Webhook attempts, logs, requestId/correlationId | Mostrar logs/entregas. |
| 65 | Auditoria das interacoes | Atende | Events, logs redigidos, timeline | Mostrar auditabilidade no dossie tecnico. |
| 66 | Historico das solicitacoes dos usuarios | Atende | Conversation, Message, protocol, reports | Buscar conversa/protocolo. |
| 67 | Boas praticas de seguranca da informacao | Atende | LGPD, RBAC, redaction, MFA, backup, health | Apresentar pacote de seguranca. |
| 68 | Planejamento tecnico de implantacao | Atende com demonstracao | Pacotes SIMAE equivalentes e este pack | Apresentar cronograma de implantacao Boa Esperanca. |
| 69 | Definicao do escopo inicial do atendimento | Atende com demonstracao | POC script e plano de implantacao | Validar servicos iniciais com a Camara. |
| 70 | Identificacao dos servicos institucionais | Atende com demonstracao | KB/flows configuraveis | Levantar Ouvidoria, e-SIC, Diario, Protocolo, Portal. |
| 71 | Definicao da estrutura inicial de menus e fluxos | Atende | Chatbot flow plan | Mostrar fluxo inicial da POC. |
| 72 | Identificacao dos setores administrativos | Atende | Departments/queues | Criar setores no demo. |
| 73 | Levantamento de necessidades de integracao | Atende com demonstracao | Plano de integracoes e POC API externa | Apresentar checklist de APIs do orgao. |
| 74 | Configuracao da infraestrutura tecnologica | Atende | SaaS/VPS/PM2/DB/runbooks | Apresentar baseline operacional. |
| 75 | Parametrizacao completa antes da operacao | Atende com demonstracao | Tenant config/capabilities/runbook | Mostrar checklist pre-go-live. |
| 76 | Testes operacionais da solucao | Atende | Load lab, acceptance tests, replay | Apresentar testes 78N/83C e smoke. |
| 77 | Validacao institucional antes da producao | Atende com demonstracao | Checklists de aceite | Usar POC + termo de aceite. |
| 78 | Treinamento tecnico para servidores | Atende com demonstracao | `TRAINING_16H_PLAN.md` | Apresentar plano 16h. |
| 79 | Treinamento aborda funcionamento geral | Atende | Plano 16h | Mostrar modulo 1. |
| 80 | Treinamento inclui painel administrativo | Atende | Plano 16h | Mostrar modulo admin. |
| 81 | Treinamento inclui monitoramento dos atendimentos | Atende | Plano 16h + Dashboard/Inbox | Mostrar modulo monitoramento. |
| 82 | Treinamento inclui relatorios e indicadores | Atende | Plano 16h + Reports | Mostrar modulo relatorios. |
| 83 | Treinamento inclui fluxos automatizados | Atende | Plano 16h + Chatbot | Mostrar modulo chatbot. |
| 84 | Treinamento inclui boas praticas de atendimento digital | Atende | Plano 16h | Mostrar modulo boas praticas/LGPD. |
| 85 | Fornece material de apoio | Atende com demonstracao | Este pack + docs/bid-package | Anexar manuais e guia rapido. |
| 86 | Garante autonomia operacional da equipe | Atende com demonstracao | KB/chatbot/users/reports editaveis | Demonstrar edicao por usuario do tenant. |
| 87 | Disponivel para duvidas apos treinamento | Atende com demonstracao | `SUPPORT_SLA_PLAN.md` | Apresentar canal de suporte. |
| 88 | Suporte tecnico especializado na vigencia | Atende com demonstracao | `SUPPORT_SLA_PLAN.md`, ops docs | Apresentar plano e equipe. |
| 89 | Registro formal de chamados | Parcial | Incident log existe; ferramenta de chamado/status contratual deve ser definida | Apresentar canal formal e registro em incident log. |
| 90 | Acompanhamento do status das solicitacoes | Parcial | Incident/maintenance status existe; portal de chamados externo nao comprovado | Definir processo/canal com status por protocolo de suporte. |
| 91 | Classificacao de incidentes por impacto | Atende | Operational incidents severity/status | Mostrar `/admin/ops/incidents`. |
| 92 | Atendimento remoto para analise de incidentes | Atende com demonstracao | Plano de suporte remoto | Apresentar procedimento. |
| 93 | Manutencao preventiva quinzenal presencial | Nao comprovado | TR corrigido fala em remota mensal; Anexo III fala em quinzenal presencial | Pedir esclarecimento/impugnar divergencia ou assumir custo operacional se necessario. |
| 94 | Manutencao corretiva para falhas | Atende | Support/SLA plan, incident log | Apresentar processo de corretiva. |
| 95 | Monitoramento tecnico do funcionamento | Atende | `/health`, metrics, alerts, dashboard ops | Demonstrar admin ops. |
| 96 | Registro das atividades de manutencao | Atende | `/admin/ops/maintenances` | Registrar manutencao teste. |
| 97 | Funcionamento durante toda a vigencia | Atende com demonstracao | SaaS, SLA, backup, monitoring, release checklist | Apresentar operacao continua e plano SLA. |

## Itens Criticos Para A POC

1. Preparar pergunta/resposta com fonte da Base de Conhecimento.
2. Preparar API externa simulada para demonstrar consulta ou envio de dados.
3. Preparar Webchat embed no portal institucional demonstrativo.
4. Preparar fluxo de atendimento com handoff, departamento e relatorio.
5. Preparar evidencias de suporte/chamado/status e manutencao.
