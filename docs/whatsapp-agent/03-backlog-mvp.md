# Fase 0 — Backlog MVP (WhatsApp Agent)

## Visão de fases

### Fase 1 — Scaffolding
- criar estrutura básica do serviço
- configuração de ambiente
- endpoints mínimos

### Fase 2 — Webhook Hello World
- webhook receiver funcional
- verificação de token
- log básico de eventos

### Fase 3 — Storage mínimo
- persistência de mensagens e estado
- registro de opt‑out

### Fase 4 — Allowlist
- aceitar apenas números autorizados
- bloquear spam/testes

### Fase 5 — Templates
- envio de template fora da janela
- fallback seguro

### Fase 6 — Handoff
- regras objetivas de transferência
- logging da transferência

### Fase 7 — KB‑first IA
- consulta base de conhecimento antes de IA
- fallback humano quando necessário

## Critérios de aceite
Cada fase precisa:
- passar em testes básicos
- não quebrar os fluxos anteriores
- manter logs de auditoria

## Não‑regressão
Checklist mínimo:
- webhook continua recebendo
- templates funcionam fora da janela
- opt‑out respeitado
- handoff acionado corretamente
