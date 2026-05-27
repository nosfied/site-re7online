# Instagram Readiness

Este documento resume a prontidao arquitetural do Converta para Instagram, sem ativar runtime real nesta fase.

## Estado Atual

O Converta ja possui base multicanal para:

- `channel=whatsapp`
- `channel=messenger`
- `channel=instagram`
- `provider=meta`

O inbox ja exibe filtros:

- Todos
- WhatsApp
- Instagram
- Facebook/Messenger

Instagram ainda nao esta ativo para persistencia, runtime, IA, handoff ou outbound.

## Reuso da Infraestrutura Messenger

Instagram deve reutilizar os mesmos blocos estruturais ja validados para Messenger:

- `TenantChannelAccount`
- `channelAccounts` por tenant
- webhook Meta assinado
- tenant resolution por `provider + channel + channelAccountId`
- observed events
- runtime gates
- readiness/preflight
- inbox omnichannel
- redaction de identificadores externos
- token tenant-scoped

## Diferencas Esperadas

Instagram exigira adapter proprio para payloads IG e validacao das permissoes Meta aplicaveis. O canal nao deve assumir PSID Messenger nem reutilizar chaves de conversa Messenger.

Campos esperados:

- `channel=instagram`
- `provider=meta`
- `channelAccountId` da conta Instagram/pagina vinculada, conforme payload Meta
- `externalUserHash` derivado do ID externo
- `externalUserRef` criptografado quando outbound for habilitado futuramente

## Fases Recomendadas

1. Instagram passive adapter.
2. Smoke webhook com payload controlado.
3. Tenant resolution passiva.
4. Observed events.
5. Inbound persistence MVP.
6. Inbox read-only validado.
7. Manual outbound MVP, somente apos permissao e token corretos.
8. App Review/compliance especifico para Instagram.

## Gates Obrigatorios

Antes de qualquer persistencia Instagram:

- `enabled=true`
- `runtimeEnabled=true`
- `inboundPersistenceEnabled=true`
- `status=connected`
- token configurado quando necessario
- webhook assinado validado
- tenant/page/account resolvido sem ambiguidade

Antes de qualquer outbound Instagram:

- `outboundEnabled=true`
- token valido e tenant-scoped
- `externalUserRef` criptografado disponivel
- UI indicando claramente canal Instagram
- logs sem token, ID puro, raw payload ou texto sensivel

## Nao Fazer Ainda

- Nao ativar Instagram em producao.
- Nao persistir Instagram sem adapter especifico.
- Nao enviar outbound Instagram.
- Nao usar token Messenger para Instagram.
- Nao misturar identidade Instagram com Messenger.
- Nao fazer merge automatico de contatos entre canais.

## Checklist Futuro

- Confirmar permissoes Meta exigidas para Instagram Messaging.
- Criar adapter passivo Instagram.
- Criar fixtures sem PII.
- Validar payload real/controlado.
- Adicionar testes de tenant/account mismatch.
- Validar inbox com filtro Instagram vazio e depois com inbound real.
- Preparar pacote de App Review complementar.
