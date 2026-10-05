# Runbook Re7

## Continuação do aceite dirigido b9 — atendimento humano

[Registro final do mesmo ciclo](../reviews/automation-freeform-window-release-af26/HYBRID_B9_CONTROLLED_VALIDATION_2026-10-05.md#continuação-do-mesmo-ciclo--atendimento-humano-confirmado): claim humano/protocolo WEB_SESSION e resposta Inbox Meta persistidos/recebidos, responsável/setor/ciclo/janela preservados. PASS/OWNER CONFIRMED para este caso avulso, sem campanha adicional, configuração ou deploy. Retomar validação owner de CRM/CSV com público/conteúdo explicitamente indicado; não extrapolar ao CRA ou reparar históricos.

## Aceite dirigido b9 — retorno Meta → Web em 05/10

[Prova controlada e limites](../reviews/automation-freeform-window-release-af26/HYBRID_B9_CONTROLLED_VALIDATION_2026-10-05.md): campanha avulsa demo-converta final4366/data_exame → resposta Web na mesma Conversation/runtime em Atendimento Geral/Fila Geral, janela aberta somente por inbound, sem menu nem duplicação CRM. Inbox confirmada pelo owner; claim/protocolo não exercitados. O runtime histórico isolado permaneceu intacto. Não estender este PASS às outras modalidades/transportes, concorrência, CRA ou saneamento. Sem nova janela ou configuração.

## b9/V4 — implantação técnica concluída em 05/10

[Registro de execução e pendências](../reviews/automation-freeform-window-release-af26/HYBRID_B9_CAPTURE_DEPLOYED_2026-10-05.md): API b9/worker mínimo b9 ativos, frontend af26 preservado. Sequenciador único concluiu sem retorno; renovação explícita da captura passou antes da retirada nft. Guarda aberta geração29, scheduler preservado, cron/crontab/boot inactive-enabled e saved/fallback compatíveis; sessão Inbox/CRM owner PASS. DEPLOYED TECHNICALLY / OWNER VALIDATION PENDING. A preparação 143500 está consumida; não repetir intents/starts. Retorno API879/workeraf26 exige política/provas atuais e mantém DB/auth. Relatórios abaixo preservam os estados anteriores, superados por este registro.

## b9/V4 — composição final preparada em 05/10

[Relatório único e comandos executáveis](../reviews/automation-freeform-window-release-af26/HYBRID_B9_CAPTURE_COMPOSITION_PREPARED_2026-10-05.md). Diretório novo `incident-6683-v4-hybrid-b9-capture-20261005T143500Z`: três modos/25 arquivos, logger privado e recaptura antes de unfence, helper e nove comandos inalterados. Backup fresco/restore isolado PASS, gates falsos, política não instalada. Contingência fresca agora cria seus próprios gates falsos e nega execução antes de qualquer ação root enquanto não habilitados após inspect. Comandos incluem restauração explícita do crontab de deploy antes de gerar essa contingência. Reconfirmar bindings/identidades e decisão antes de instalar somente a política; não reutilizar a janela consumida. Sem nova contenção/troca; produção continua API879/workeraf26/frontendaf26.

## Diagnóstico e captura V4 — revisão local de 05/10

[Delta revisável e reprodução](../reviews/automation-freeform-window-release-af26/CAPTURE_RENEWAL_LOCAL_2026-10-05.md): captura privada completa de ações root e renovação limitada antes de unfence, no switch/return/return-partial. Duas leituras consistentes e mesma identidade/árvore, sem comparar R/S; arquivar cada captura anterior. Helper revalida antes de retirar nft; somente recusa reconhecida em sockets/FDs antes da exclusão admite recaptura limitada, nunca repetir start ou erro parcial desconhecido. Atualizar hash do sequenciador somente em preparação nova após revisão; helper e nove comandos sudo inalterados. LOCAL VALIDATED / NOT DEPLOYED, não executar preparação consumida.

## b9/V4 — retorno de 05/10/2026

[Registro efetivo e limites](../reviews/automation-freeform-window-release-af26/HYBRID_B9_V4_RETURN_2026-10-05.md): b9 não foi liberado ao tráfego. API 879/worker mínimo af26 restaurados, frontend af26 preservado; guarda aberta geração 27, cron/boot/saved/fallback e barreira restaurados. Pacote consumido não pode ser reexecutado. O helper permanece nos bytes d7 autorizados. O comparador de captura exige inventário exato, que mudou durante recuperação de sessões; a conclusão assistida preservou originais e obteve captura atual estável sob a mesma identidade antes do gate root. Antes de outra janela, ensaiar renovação explícita dessa captura, identidade sem depender de R/S e captura privada de stderr das ações root. Não confundir protocolo unfence (saved/fallback) com retirada nft, nem retorno assistido com recuperação automática. Sem bypass, novo start para testar ou restore produtivo.

## Janela af26 de 02/10/2026 — retorno compatível

A tentativa de troca af26 **não implantou o candidato**. O registro sanitizado da contenção, do bloqueio por prova expirada, do retorno `return-partial` e do estado final está em [WINDOW_RETURN_2026-10-02.md](../reviews/automation-freeform-window-release-af26/WINDOW_RETURN_2026-10-02.md). API b66, worker mínimo b66 e frontend ba66 permaneceram como releases efetivas ao encerramento. Guarda, cron e supervisão voltaram ao estado inicial; Inbox e CRM foram conferidos pelo owner.

**Gate para a próxima janela:** corrigir no pacote auditado a identidade de processo baseada em PID/tempo de início (estado Linux `R/S` é transitório) e permitir nova prova expirada por nonce/arquivo novo, sem sobrescrever ou apagar provas anteriores. O reparo de emergência foi restrito ao verificador privado de retorno; não torna o procedimento original de switch apto a nova tentativa. Reconfirmar executor único, releases, tarefas, backup fresco e restauração isolada. Não reutilizar certificados ou marcadores desta janela e não usar espera arbitrária como prova de drain.

A [correção local dos quatro modos](../reviews/automation-freeform-window-release-af26/OPERATIONAL_PROTOCOL_FIX_2026-10-02.md) passou ensaio com relógio controlado e permanece **NOT DEPLOYED**. O procedimento da próxima janela deve usar a versão revisada de `OWNER-STEPS.txt`: cada `record` exige o nonce novo da requisição atual; prova expirada gera arquivo novo após reconferir as pré-condições. Se já existir `stop-start` ou `start-intent`, não renovar a ação para repeti-la; escolher o retorno parcial compatível e comprovar novamente a barreira de saída. O lock de janela serializa comandos no host, mas não substitui confirmação de topologia e executor único. A leitura produtiva agregada da janela anterior não prova ausência de resultados externos incertos.

## Rotacao de token

Rotacione o token administrativo de um tenant somente com `ADMIN_TOKEN` (superadmin). O endpoint resolve o tenant pelo `clientKey` no path e nunca usa `X-Client-Key`.

Exemplo:

```bash
cd /opt/re7online/site-re7online/apps/whatsapp-agent
export ADMIN_TOKEN="$(rg --no-line-number '^ADMIN_TOKEN=' .env | tail -n1 | sed -E 's/^ADMIN_TOKEN=\"?([^\"]+)\"?/\1/')"

curl -sS -X POST "http://127.0.0.1:3001/admin/clients/re7online/rotate-token" \
  -H "X-Admin-Token: $ADMIN_TOKEN" | jq
```

Guarde o `adminToken` retornado em local seguro. O token antigo deixa de ser valido imediatamente.

## API Contract (Quota + Summary)

Este bloco consolida o contrato operacional para frontend e operacao SaaS do `whatsapp-agent`.

### 1) TenantConfig via `PUT /admin/tenants/:tenantId`

Campos de quota suportados por tenant:

- `quotaMonthlyConversations`: `number` (`>= 0`)
- `quotaWarnAtPct`: `number` (`0..1`)
- `quotaBlockedReplyText`: `string` nao vazia
- `quotaExcludeWaIds`: `string[]` (somente digitos)

Placeholders em `quotaBlockedReplyText`:

- `{tenantName}`
- `{period}`
- `{used}`
- `{limit}`
- `{attendantWaidMasked}`

Semantica de `quotaExcludeWaIds`:

- waIds nessa lista **nao consomem** quota mensal (`used`).
- waIds nessa lista **nao sofrem** hard cap (nao bloqueia).
- Eventos desses waIds logam `quota.excluded` (waId mascarado).

Exemplo de update:

```bash
curl -sS -X PUT "http://127.0.0.1:3001/admin/tenants/re7online" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  --data-binary '{
    "quotaMonthlyConversations": 200,
    "quotaWarnAtPct": 0.8,
    "quotaBlockedReplyText": "Plano em limite ({used}/{limit}) no periodo {period}.",
    "quotaExcludeWaIds": ["558499049614", "558494786787"]
  }'
```

### 2) `GET /admin/tenants/summary?range=1h|24h|7d|30d`

Resposta inclui `quota` por tenant:

```json
{
  "quota": {
    "period": "2026-03",
    "limit": 200,
    "used": 6,
    "pct": 0.03,
    "warnAtPct": 0.8,
    "warning": false
  }
}
```

Regra de calculo de `quota.used` (mes UTC):

- `usedAll = COUNT(DISTINCT waId)` inbound no mes UTC por `clientId` com `allowlistHit=true`.
- `usedExcluded = COUNT(DISTINCT waId)` inbound no mes UTC por `clientId` com `allowlistHit=true` onde `waId` esta na uniao de `quotaExcludeWaIds` dos tenants conhecidos.
- `used = max(0, usedAll - usedExcluded)`.

### 3) Checklist Front dev

Endpoints por role:

- **Superadmin (`ADMIN_TOKEN`)**
  - `GET /admin/tenants`
  - `GET /admin/tenants/:tenantId`
  - `PUT /admin/tenants/:tenantId`
  - `GET /admin/tenants/summary`
  - `GET /admin/messages?clientKey=...`
- **Tenant admin (`Client.adminToken`)**
  - tenant-scoped (`/admin/messages`, `/admin/metrics`, etc.)
  - rotas globais (`/admin/tenants`, `/admin/clients`) retornam `403`

Recomendacoes de dashboard:

- Listar tenants com:
  - `tenantId`, `clientKey`, `name`
  - `counts.inbound.received`
  - `counts.outbound.sent_text`, `sent_template`, `failed`
  - `lastMessageAt`
  - `quota.{period,limit,used,pct,warnAtPct,warning}`
- Sempre enviar `clientKey` em endpoints tenant-scoped no front/admin tooling.
