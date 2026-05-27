# Visão de Produto — Converta / WhatsApp Agent

## Proposta do produto
O **Converta** é a plataforma SaaS da Re7Online/Reset Online para atendimento
digital via WhatsApp oficial da Meta.

O produto nasceu como **Agente Re7 / WhatsApp Agent** para uso interno e revenda,
mas hoje cobre uma operação SaaS mais ampla: CRM conversacional, atendimento
humano, chatbot, campanhas, templates, inbox, governança por cliente, relatórios,
SLA e operação multi-tenant.

## Focos estratégicos

O produto atende dois focos simultâneos:

1. **Mercado privado**
   - empresas atendidas pela Re7/Reset
   - campanhas e atendimento via WhatsApp oficial
   - substituição de listas manuais e atendimento disperso
   - cobrança SaaS, setup e custos Meta

2. **Mercado público/licitações**
   - atendimento institucional por WhatsApp oficial
   - multi-secretarias/departamentos
   - RBAC, SLA, relatórios e governança
   - POC/demonstração com aderência a editais

Nenhum dos dois focos deve ser descartado em decisões de produto.

## Objetivos e intenções principais
O Converta deve priorizar fluxos claros, auditáveis e operáveis:

1) **Vendas**  
   - qualificação rápida  
   - apresentação de oferta  
   - direcionamento para diagnóstico/agenda  

2) **Suporte/FAQ**  
   - respostas rápidas  
   - encaminhamento para humano se necessário  

3) **Agendamento**  
   - coleta de dados  
   - confirmação de horário  
   - entrega de instruções  

4) **Financeiro**  
   - status de pagamento  
   - emissão/segunda via  
   - encaminhamento para atendente  

5) **Governança operacional**
   - usuários por tenant
   - departamentos e filas
   - relatórios e SLA
   - auditoria por usuário real no `/app`

6) **Campanhas e templates**
   - envio por template aprovado
   - observabilidade de status Meta
   - dedupe e execução assíncrona
   - reutilização de campanhas

## Regras de handoff (gatilhos)
O bot deve transferir para humano (handoff) quando:

- cliente solicitar falar com pessoa/atendente  
- intenção não reconhecida após 2 tentativas  
- assunto sensível (reclamação grave, dados pessoais, cobrança complexa)  
- cliente ficar preso em loop (detectar repetição)  
- fora do escopo (ex.: suporte técnico avançado)  
- pedido explícito de cancelamento/encerramento  

## Produto e monetização (resumo)
- **Interno**: reduz tempo operacional e aumenta conversão.  
- **Privado/SaaS**: mensalidade + setup + templates aprovados + custos Meta.
- **Público/licitações**: POC, operação institucional, SLA, relatórios e governança.

## Superfícies do produto

- `/admin`: console interno da Re7/Reset para tenants, onboarding, Embedded Signup,
  suporte e observabilidade global.
- `/app`: portal do cliente para inbox, campanhas, templates, usuários,
  departamentos, relatórios e chatbot.

Novas funcionalidades de cliente devem ser entregues no `/app`, com autenticação
por usuário real e escopo por `clientId`/`departmentId` quando aplicável.

## Estado atual

O produto já superou a Fase 0. O estado real inclui multi-tenant, Postgres/Prisma,
WhatsApp Cloud API oficial, campanhas, templates, inbox, handoff humano, mídia,
áudio com transcode, RBAC, departamentos, relatórios, SLA e chatbot configurável.
