# Fase 0 — Arquitetura MVP (Meta Cloud API)

## Visão geral de componentes
Fluxo básico:

Webhook Receiver → Router → Responder → Storage → Logs

### Componentes
- **Webhook Receiver**: endpoint HTTP para eventos da Meta.
- **Router**: identifica intenção e decide fluxo.
- **Responder**: envia mensagens via Cloud API.
- **Storage**: guarda sessões, estados e consentimento.
- **Logs**: auditoria e métricas.

## Meta Cloud API — pontos essenciais
- **Verify token**: validação inicial do webhook.
- **Assinatura/segurança**: validar assinatura do payload.
- **Eventos principais**:
  - mensagens recebidas
  - entregas/reads
  - falhas de envio

## Decisão de arquitetura
### Single‑tenant agora
O MVP atende um único número/conta por vez.

### Caminho claro para multi‑tenant
Quando avançar:
- separar tenant_id por cliente
- tabelas isoladas ou schema por tenant
- roteamento por número de telefone

## Resultado esperado na Fase 0
Mapa de componentes e requisitos mínimos para iniciar o MVP na Meta Cloud API.
