# Runbook Re7 - Operacao SaaS do WhatsApp Agent

Este runbook padroniza o processo interno da Re7 para onboarding e ativacao de clientes no WhatsApp Agent em ambiente multi-tenant.

## 1. Pre-Onboarding

- Validar o formulario de onboarding completo com o cliente
- Confirmar escopo comercial, numero de WhatsApp e responsaveis
- Definir tenantId e clientKey padronizados
- Definir allowlist inicial de teste
- Confirmar template de handoff manual e idioma padrao

Comando de referencia para onboarding do tenant:

```bash
cd /opt/re7online/site-re7online/apps/whatsapp-agent
./scripts/onboard-tenant.ts \
  --tenant cliente-demo \
  --name "Cliente Demo" \
  --client-key cliente-demo \
  --allowlist 558494786787 \
  --handoff-attendant-waid 558499049614 \
  --manual-handoff-template re7_atendente_manual_v1
```

## 2. Meta Setup

- Confirmar Business Manager, WABA e App ID
- Validar webhook e credenciais Meta
- Confirmar que o Phone Number ID do cliente esta correto
- Garantir que o numero esta associado ao client correto no banco
- Validar templates aprovados no Meta

Validacao operacional minima:

```bash
curl -sS "http://127.0.0.1:3001/admin/tenants/cliente-demo" \
  -H "X-Admin-Token: $ADMIN_TOKEN" | jq
```

## 3. Plataforma Re7

- Criar / atualizar tenant config por admin API
- Confirmar allowlist, idioma, handoff e template manual
- Confirmar que o mapeamento `WaPhoneNumber -> Client` esta correto
- Garantir que o bootstrap nao reverte mappings apos reload

Validacao de tenant config:

```bash
curl -sS "http://127.0.0.1:3001/admin/tenants/cliente-demo" \
  -H "X-Admin-Token: $ADMIN_TOKEN" | jq '.tenant'
```

## 4. Validacao Tecnica

- Resetar conversa de teste do lead validado
- Executar fluxo controlado de inbound
- Validar `tenant.resolved`, `storage.conversation.write` e isolamento por `clientKey`
- Validar Policy B com evidencia forte via `/admin/messages`

Comando oficial para Policy B:

```bash
./scripts/outbound-policyB-prod-check-wrapper.sh \
  --to 558494786787 \
  --intent pricing \
  --range 1h \
  --tenant cliente-demo \
  --temp-allowlist
```

## 5. Go-Live

- Remover allowlists temporarias de teste
- Confirmar templates e handoff em producao
- Validar um inbound real no tenant correto
- Registrar evidencias de aceite tecnico
- Formalizar handoff interno para operacao e suporte

Comando de conferencia final:

```bash
curl -sS "http://127.0.0.1:3001/admin/messages?waId=558494786787&limit=20&clientKey=cliente-demo" \
  -H "X-Admin-Token: $ADMIN_TOKEN" | jq
```
