# Fase 0 — Compliance e Janelas de Mensagens

## Regras essenciais (WhatsApp / Meta)
- **Janela de 24h**: após a última mensagem do usuário, o bot pode responder livremente por 24 horas.  
- **Fora da janela**: é obrigatório usar **template aprovado** pela Meta.  

## Posicionamento do bot
- **B2C especializado**: o bot não deve se apresentar como “assistente geral”.
- Deve operar com **escopo limitado** (vendas, suporte básico, agendamento, financeiro).

## Consentimento, opt‑out e limites
Checklist mínimo:
- informar claramente que o contato ocorre via WhatsApp  
- oferecer **opt‑out** explícito (ex.: “Digite SAIR para encerrar”)  
- registrar opt‑out e bloquear novas mensagens automáticas  
- respeitar termos e políticas da Meta  

## Limites do bot
- não coletar dados sensíveis além do necessário  
- não prometer ações que o sistema não executa  
- evitar linguagem que simule humano sem aviso  

## Resultado esperado na Fase 0
Checklist de compliance e regras de janela para orientar templates, automações e handoff.

## Política de fallback automático (Policy A)
Quando a janela 24h estiver **fechada**, o agente **não envia texto livre**.
Com `OUTBOUND_TEMPLATE_FALLBACK=true`, o envio de template aprovado é **automático**.
Com `OUTBOUND_TEMPLATE_FALLBACK=false`, o agente apenas registra `outbound.needs_template`.
