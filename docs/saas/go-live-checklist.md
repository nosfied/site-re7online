# Go-Live Checklist

Use esta lista antes de ativar qualquer cliente em producao.

## Criterios tecnicos obrigatorios

- Tenant configurado e legivel via `GET /admin/tenants/:tenantId`
- `WaPhoneNumber -> Client` confirmado no banco e estavel apos reload
- `tenant.resolved` aponta para o `clientKey` correto em inbound real
- `storage.conversation.write` grava no namespace correto do tenant
- Tenant admin token gerado e testado
- Rotas globais bloqueadas para tenant admin (`403` em `/admin/tenants` e `/admin/clients`)
- Allowlist tenant-scoped revisada e aprovada
- Template manual de handoff configurado e aprovado
- Policy B validado no tenant correto
- Bootstrap nao reverte mapeamento apos `pm2 reload`

## Evidencia forte obrigatoria

Antes de liberar o cliente, confirme evidencias por `/admin/messages`:

```bash
curl -sS "http://127.0.0.1:3001/admin/messages?waId=<WAID>&limit=20&clientKey=<TENANT>" \
  -H "X-Admin-Token: $ADMIN_TOKEN" \
  | jq '.items[] | {direction,type,status,templateName,createdAt,metaMessageId,requestId}'
```

O aceite so deve ser dado se existir evidencia consistente de outbound esperado (texto ou template) no tenant correto.

## Sinais de pronto

- `OUTBOUND TEXT SENT` e/ou `OUTBOUND TEMPLATE SENT` visiveis em `/admin/messages`
- `metaMessageId` presente quando houver envio por template
- Nenhum write do lead real no namespace `default`
- Logs sem `bootstrap.tenant.conflict` inesperado para o numero do cliente ativo
- Fluxo basico do cliente responde no tenant correto sem contaminação de estado

## Liberacao

- Cliente aprovado para operacao
- Responsavel interno da Re7 informado
- Evidencias salvas no ticket / canal operacional
