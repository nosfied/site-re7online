# Meta App ID tenant scope — 2026-10-22

## Estado

Resolvido localmente, não implantado.

## Incidente

O envio de template com mídia dependia de `META_APP_ID` global. O censo produtivo
encontrou tenants com proveniências incompatíveis, tornando inseguro habilitar esse
fallback para toda a plataforma. A ausência do App ID também era detectada depois do
registro `submitting`, embora nenhum efeito externo tivesse ocorrido.

## Correção

- App ID canônico tenant-scoped em `TenantMetaConfig.rawPayload.appId`;
- Embedded Signup como produtor, preservando o payload anterior;
- operação administrativa estreita, auditada, idempotente e protegida por CAS;
- fallback global fail-closed e condicionado à topologia explícita single/shared app;
- validação local completa antes de `submitting`;
- resultado externo incerto encaminhado à reconciliação, sem retry cego.

Reparo por SQL manual ou edição direta de JSON não é canônico; tenants existentes
devem usar a operação administrativa autenticada.

## Homologação pendente

Regularizar somente o tenant autorizado, confirmar os demais inalterados e executar
submissão controlada em ambiente de homologação. Comprovar segregação, auditoria sem
o identificador completo e ausência de fallback global.
