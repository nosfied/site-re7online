# Fase 0 — Visão de Produto (Agente Re7)

## Proposta do produto
O **Agente Re7** é um agente de WhatsApp para atendimento e geração de demanda usando a Meta Cloud API.  
Ele deve funcionar tanto para **uso interno** da Re7Online quanto como **produto de revenda** para clientes (white‑label opcional no futuro).

## Objetivos e intenções principais
O agente deve priorizar intenções claras, com fluxos curtos e foco em conversão/eficiência:

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
- **Revenda**: mensalidade + setup + templates aprovados.  

## Resultado esperado na Fase 0
Definição clara de **uso**, **escopo**, **intenção** e **gatilhos de handoff** para orientar o MVP técnico.
