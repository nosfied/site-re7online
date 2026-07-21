# Torres/RS - Matriz De Aderência Técnica

## Critério De Classificação

- **Atende**: recurso existente no Converta Platform.
- **Atende por configuração/operação**: recurso suportado, dependente de configuração, implantação ou rotina operacional.
- **Parcial**: recurso atendido em parte ou exige redação cuidadosa.
- **Não prometer**: não assumir como disponível sem desenvolvimento ou contratação externa.

## Matriz

| Requisito | Aderência | Evidência/observação |
| --- | --- | --- |
| SaaS web em nuvem | Atende | Converta opera como plataforma SaaS web com backend, frontend, banco PostgreSQL, healthcheck e operação em nuvem. |
| Atendimento Chatbot Omni Channel | Atende | Inbox centralizado, Webchat, WhatsApp oficial e canais Meta disponíveis conforme configuração. |
| WhatsApp oficial | Atende | Uso de WhatsApp Business Platform / Meta Cloud API, sem WhatsApp Web como base operacional. |
| Chatbot automatizado | Atende | Fluxos, menus, perguntas, roteamento e handoff humano configuráveis por tenant. |
| Menus, submenus e intents | Atende | Fluxos podem capturar intenção e direcionar para filas/departamentos. |
| NLP/roteamento | Parcial | Redigir como classificação/roteamento assistido por regras, menus e intents. Não prometer IA generativa ampla. |
| Atendimento humano | Atende | Inbox, claim, resposta, responsável, histórico, status operacional e handoff. |
| Departamentos/setores | Atende | Departamentos e filas por tenant. |
| Filas | Atende | Conversas podem ser direcionadas para filas operacionais. |
| 15 operadores adicionais | Atende por configuração | Criar usuários e permissões conforme limite contratado e tenant. |
| Controle de acesso | Atende | Login, usuários, RBAC e isolamento multitenant. |
| Relatórios | Atende | Relatórios por período, canais, atendimentos e indicadores operacionais/SLA. |
| Logs e auditoria | Atende | Eventos operacionais, logs com redaction e histórico de atendimento. |
| Protocolo de atendimento | Atende | Protocolo CVT exibido no Webchat/Inbox quando fluxo operacional usa protocolo. |
| SLA/disponibilidade 99,5% | Atende por operação | Health, métricas, alertas e rotina operacional. Formalizar exceções de terceiros. |
| Backup diário | Atende por operação | Rotinas documentadas de backup, restore e evidência operacional. |
| LGPD | Atende | RBAC, multitenancy, logs seguros, redaction e minimização operacional. |
| Implantação até 10 dias úteis | Atende por operação | Viável com cooperação do contratante e ativos Meta disponíveis em tempo hábil. |
| Treinamento presencial mínimo 4h | Atende por operação | Deve ser planejado e precificado para Torres/RS. |
| API/Webhook | Atende | Public API, webhooks e integrações controladas. |
| Identidade visual | Atende por configuração | Ajustes de textos, fluxos e canais do tenant. Não prometer redesign amplo. |
| IA generativa ampla | Não prometer | Fora do recorte seguro. Usar linguagem de chatbot, menus, intents e roteamento. |
| Canais não disponíveis no Converta | Não prometer | Limitar proposta aos canais realmente disponíveis/ativáveis. |

## Pontos De Atenção Para A Proposta

- Não usar termos que sugiram WhatsApp Web, QR-Code persistente ou API não oficial.
- Não prometer automação livre em Instagram/Messenger; quando citados, tratar como atendimento humano centralizado, se estiverem no escopo.
- Vincular implantação em 10 dias úteis à entrega tempestiva de informações, número, usuários, fluxos e aprovações necessárias.
- Declarar que custos e indisponibilidades de provedores externos seguem regras próprias da Meta/WhatsApp Business Platform.
