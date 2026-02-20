# AUDIT_REPORT.md — FASE 2 / ETAPA 1

Data: 2026-02-19
Branch: audit/fase2
Base: main @ 40d410e

## 1) Escopo
### Commits (últimos 15)
```
40d410e chore(e2e): make e2e script more idempotent and debuggable
8836e42 fix(e2e): remove count_templates_by_window and validate attendant template via admin json
a499032 fix(e2e): avoid false negative on attendant inbound + stricter direction filter
e1e1517 fix(e2e): robust handoff template check + rid event check without bash expansion
df1365b fix(e2e): close attendant window in reset and validate notify template by env
9368701 fix(e2e): deterministic demo run without attendant inbound
e870e17 fix(e2e): deterministic demo+handoff without time travel (RID/createdAt scoped)
df8d5e8 feat(admin-debug): reset conversation endpoint
4fa96c3 fix(e2e): relax attendant-open anchor to avoid createdAt race
f5bb168 fix(e2e): anchor attendant open validation by schedule2 RID_OPEN timestamp
dabfb92 fix(e2e): attendant open validation anchored by schedule2 timestamp
3ce9185 fix(handoff): fallback template on window-closed error; test: attendant open validation by schedule ts
a12583f fix(handoff): attendant template params + window gate
20dba9a fix(e2e): deterministic followup check by schedule timestamp
108c2cd fix(e2e): remove exits from run_once + robust repeat + polling
```

### Arquivos diretamente afetados
- `apps/whatsapp-agent/scripts/e2e-demo.sh`
- `apps/whatsapp-agent/scripts/reset-e2e-state.mjs`
- `apps/whatsapp-agent/src/whatsapp/webhook.controller.ts`
- `apps/whatsapp-agent/src/http/routes.ts`
- `apps/whatsapp-agent/src/storage/jsonFileStorage.ts`
- `apps/whatsapp-agent/src/storage/storage.ts`

## 2) Risk Matrix (0–3)
| Área/Arquivo | Risco | Motivo |
|---|---:|---|
| `src/whatsapp/webhook.controller.ts` (handoff notify) | 2 | altera decisão TEXT/TEMPLATE e fallback em janela fechada; pode impactar entregas do atendente |
| `src/http/routes.ts` (admin debug reset) | 2 | endpoint admin com efeito destrutivo em conversas; falta feature flag explícita |
| `src/storage/jsonFileStorage.ts` | 1 | deleteConversation adicionado; impacto controlado |
| `scripts/e2e-demo.sh` | 1 | só tooling, mas influencia validações e percepção de saúde |
| `scripts/reset-e2e-state.mjs` | 2 | altera estado local; risco de uso indevido em prod se usado manualmente |

## 3) Resumo dos diffs críticos
### a12583f — handoff params + window gate
- Adicionou `windowState`, `chosenChannel` nos logs de handoff.
- Gate: `windowOpen => TEXT`, `windowClosed => TEMPLATE`.
- Adicionou params com fallback `"-"` para template re7_atendente_manual_v1.
**Risco:** baixo-médio; muda roteamento do handoff.
**Validação:** e2e-demo + /admin/messages do atendente para template/text.

### 3ce9185 — fallback para TEMPLATE em erro de janela
- Se `sendText` falhar com erro de janela fechada, faz fallback para template.
**Risco:** médio; pode enviar template em condições de race.
**Validação:** simular janela fechada (reset) e confirmar template enviado.

### df8d5e8 — reset conversation admin
- Endpoint `POST /admin/debug/reset-conversation` (token).
- Storage: `deleteConversation(waId)`.
**Risco:** médio; endpoint admin sem flag; potencial abuso se token vazar.
**Validação:** confirmar token obrigatório e logs em `admin.debug.reset_conversation`.

## 4) Auditoria dirigida (fluxos / idempotência)
### Envio de template (fallback janela fechada)
- `sendTemplate` centralizado em `src/services/outboundTemplateService.ts`.
- Handoff usa `notifyAttendantDemoScheduled` em `webhook.controller.ts`.
- Fallback: se TEXT falhar por janela fechada, envia TEMPLATE.

### Gate de janela
- `isWindowOpen` usa `state.window.isOpen` e `expiresAt`.
- Reset e2e agora força `window.isOpen=false` + `expiresAt=1970` para atendente.

### Idempotência / duplicidade
- Idempotência inbound: `jsonFileStorage.findByMessageId` é usado antes de salvar.
- Outbound: persistência usa `messageId` para evitar duplicação.
- Risco: handoff notificar duplicado se `lastHandoffDemoScheduledKey` não for estável.

### Time-travel
- Debug closewindow via `#debug closewindow` no webhook (admin + env DISABLE_DEBUG_COMMANDS).
- E2E atual evita “timestamp retroativo”.

## 5) Admin debug — segurança
- `/admin/debug/reset-conversation` protegido por `X-Admin-Token`.
- **Não há flag DISABLE_DEBUG_COMMANDS para esse endpoint**.
- Recomendo guardrail: exigir `env.DISABLE_DEBUG_COMMANDS === false` ou `env.NODE_ENV !== "production"`.

## 6) Storage (jsonFileStorage) — formato e sujeira E2E
### Formato
- `.data/whatsapp-events.json`: array de `StoredRecord` (NormalizedMessage + status + allowlist + meta).
- `.data/conversations.json`: array de `ConversationState` (waId, window, intent, lead/demo/handoff etc.).

### Sujeira E2E
- E2E escreve `wamid.e2e.*` em events.
- `reset-e2e-state.mjs` remove `wamid.e2e.*` e zera campos relevantes.

### Recomendações
- Namespace E2E: manter prefixo `wamid.e2e.*`.
- TTL opcional: job simples que limpa eventos `wamid.e2e.*` mais antigos que X dias.

## 7) Recommended Incremental Fixes
1) **Guardrail admin debug**
   - Bloquear `POST /admin/debug/reset-conversation` se `DISABLE_DEBUG_COMMANDS=true`.
   - Justificativa: endpoint destrutivo.

2) **Reforçar handoff idempotência**
   - Verificar se `lastHandoffDemoScheduledKey` impede duplicação.
   - Se não, considerar aplicar `if (key === lastKey) return`.

3) **E2E TTL opcional**
   - Script `cleanup-e2e-events.sh` removendo `wamid.e2e.*` antigo.

## 8) Validation Plan
### Local (repo)
- `bash -n apps/whatsapp-agent/scripts/e2e-demo.sh`
- `node apps/whatsapp-agent/scripts/reset-e2e-state.mjs --lead <lead> --attendant <att> --events`

### VPS
- `pm2 flush 0`
- `bash scripts/e2e-demo.sh <lead> --repeat 3 --range 1h`
- `/admin/messages?waId=<attendant>` para template do handoff

---

## Appendix — Paths principais
- `apps/whatsapp-agent/src/whatsapp/webhook.controller.ts`
- `apps/whatsapp-agent/src/http/routes.ts`
- `apps/whatsapp-agent/src/storage/jsonFileStorage.ts`
- `apps/whatsapp-agent/scripts/e2e-demo.sh`
- `apps/whatsapp-agent/scripts/reset-e2e-state.mjs`

## Applied Fixes (audit/fase2)
1) **Guardrail admin debug reset**
   - Bloqueia `/admin/debug/reset-conversation` quando `DISABLE_DEBUG_COMMANDS=true` ou `ENV=production` sem `ALLOW_ADMIN_DEBUG_IN_PROD=true`.
   - Loga `admin.debug.blocked` com motivo.
   - **ENV source confirmed:** o guardrail agora usa `process.env.NODE_ENV` (env.ENV não é fonte confiável de produção).

2) **Idempotência handoff notify**
   - Dedup baseado em `notifyKey` determinístico (lead+attendant+messageId+templateName).
   - Loga `handoff.notify_dedup` quando pula envio duplicado.

3) **TTL opcional para eventos E2E**
   - Script manual `scripts/cleanup-e2e-events.mjs` remove apenas `wamid.e2e.*` mais antigos que TTL (default 7 dias).
