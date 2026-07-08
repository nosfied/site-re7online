# Xangri-La/RS PE 115/2026 - Matriz De Aderencia

Status usados:

- ATENDE
- ATENDE COM ROTINA OPERACIONAL
- ATENDE COM RESSALVA
- NAO COMPROVADO

## Resultado Executivo

O Converta atende ao nucleo tecnico informado do certame: SaaS WhatsApp oficial, usuarios por tenant, atendimento humano, chatbot, relatorios, logs, LGPD, backup, SLA e integracoes por API/webhooks.

Os pontos com ressalva sao predominantemente comerciais/operacionais: garantia contratual de 5%, treinamento presencial, custos Meta/WhatsApp dentro do valor ofertado e comprovacao documental ME/EPP/habilitacao.

## Matriz

| Requisito | Status | Evidencia no Converta | Observacao/PoC |
| --- | --- | --- | --- |
| SaaS para gestao de mensagens via WhatsApp | ATENDE | `apps/whatsapp-agent/src/whatsapp/webhook.controller.ts`, `whatsapp.client.ts`, `/app/inbox` | Demonstrar recebimento, envio e historico no Inbox. |
| API Oficial Meta/WhatsApp Business | ATENDE | Cloud API, webhooks Meta, templates e ausencia de WhatsApp Web/QR persistente | PoC deve destacar que nao ha uso de API nao oficial. |
| 10 usuarios | ATENDE | `User`, roles, `maxActiveAppUsers`; 83C testou ate 25 usuarios | Configurar tenant com 10 usuarios conforme contrato. |
| Sessoes receptivas ilimitadas | ATENDE COM RESSALVA | Inbound por webhook e Inbox sem limite funcional fixo documentado | Declarar sujeito a limites tecnicos/Meta/infra razoaveis. |
| 6.000 mensagens ativas/mês | ATENDE COM ROTINA OPERACIONAL | Runtime suporta envio/recebimento; custos Meta devem ser precificados | Precificar Meta/WhatsApp no valor ofertado. |
| Chatbot | ATENDE | `/app/chatbot`, `chatbotFlow.ts`, handoff humano | Demonstrar fluxo inicial e transferencia. |
| Atendimento humano | ATENDE | `/app/inbox`, claim, resposta, transferencias e fechamento | Demonstrar operador respondendo conversa. |
| Historico de conversas | ATENDE | `InboundMessage`, `OutboundMessage`, timeline do Inbox | Demonstrar linha do tempo completa. |
| Logs e auditoria | ATENDE | eventos operacionais, audit events, logs seguros | Demonstrar eventos de claim/transfer/close quando necessario. |
| LGPD | ATENDE | RBAC, isolamento multitenant, redaction, retention, logs seguros | Documentar tratamento e retencao. |
| Backup | ATENDE COM ROTINA OPERACIONAL | `backup:postgres`, checksum, restore drill evidence, offsite configuravel | Configurar offsite real para contrato. |
| SLA e disponibilidade | ATENDE COM ROTINA OPERACIONAL | `/health`, `/admin/ops/metrics`, `/admin/ops/alerts`, SLA evidence | Anexar plano SLA e rotina mensal. |
| Suporte critico/normal | ATENDE COM ROTINA OPERACIONAL | Pacotes operacionais 83D-83F e runbooks | Formalizar canais, horarios e tempos na proposta. |
| Manutencao e atualizacao | ATENDE COM ROTINA OPERACIONAL | release checklist, observabilidade, PM2, health, ops docs | Declarar janelas e comunicacao. |
| Integracao por API/webservice | ATENDE | Public API, API keys, webhooks | Demonstrar Public API/webhook controlado. |
| Importacao/exportacao | ATENDE COM RESSALVA | CSV/PDF de relatorios; API para dados operacionais | Importacao especifica depende de layout fornecido. |
| Relatorios | ATENDE | `/app/reports`, CSV/PDF, SLA operacional 84D | Demonstrar volume, tempos, status e exportacao. |
| Treinamento presencial 3 turmas de 5 pessoas | ATENDE COM ROTINA OPERACIONAL | Capacidade operacional/documental, nao codigo | Precificar deslocamento e agenda. |
| Reciclagem mensal remota | ATENDE COM ROTINA OPERACIONAL | Plano operacional | Incluir no contrato/proposta. |
| Garantia contratual 5% | ATENDE COM RESSALVA | Fora do produto | Exige decisao financeira/juridica. |
| Participacao exclusiva ME/EPP | NAO COMPROVADO | Fora do repositorio | Confirmar enquadramento fiscal antes do envio. |

## POC Minima

1. Login no tenant demo.
2. Exibir `/app/inbox`.
3. Receber mensagem WhatsApp via Cloud API ou simular em ambiente controlado.
4. Demonstrar chatbot e handoff.
5. Operador faz claim e responde.
6. Exibir historico/timeline.
7. Exibir relatorios e exportacao CSV/PDF.
8. Exibir usuarios/roles e departamentos, se aplicavel.
9. Exibir health/monitoramento e plano de backup.
