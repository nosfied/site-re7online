# Proposta de schema para persistencia multicanal

Status: proposta tecnica, sem migration aplicada.

Sprint: 65W - Multichannel Persistence Schema Proposal.

## Objetivo

Preparar a evolucao do Converta para persistir conversas de WhatsApp, Messenger e Instagram de forma multitenant, auditavel e compativel com o WhatsApp legado.

Esta proposta nao altera runtime, webhook, Prisma, banco, inbox ou outbound. Ela documenta o desenho recomendado para uma migration futura.

## 1. Estado atual

Os modelos relevantes hoje ainda foram desenhados com WhatsApp como identidade principal.

### WaPhoneNumber

Representa a conta/canal WhatsApp do tenant.

Campos relevantes:

- `clientId`
- `phoneNumberId`
- `display`

Constraint relevante:

- `phoneNumberId` unico global.

Papel atual:

- Funciona como identificador da conta WhatsApp/Meta que recebe webhooks.
- Nao modela Messenger Page, Instagram account ou outros canais.

### Contact

Representa contato por tenant, amarrado a WhatsApp.

Campos relevantes:

- `clientId`
- `waId`
- `name`

Constraint relevante:

- `@@unique([clientId, waId])`

Problema:

- Nao suporta mais de uma identidade por contato.
- Nao distingue `waId`, PSID Messenger, Instagram scoped user id ou futuras identidades.

### Conversation

Conversa historica/operacional usada pelo inbox e metricas.

Campos relevantes:

- `clientId`
- `departmentId`
- `waId`
- `waIdCanonical`
- `phoneNumberId`
- `windowIsOpen`
- `windowExpiresAt`
- `lastInboundAt`
- `lastOutboundAt`
- `deletedAt`
- `anonymizedAt`
- `historyVisibleAfter`

Constraints/indices relevantes:

- `@@unique([clientId, waId])`
- `@@index([clientId, waId])`
- `@@index([clientId, waIdCanonical])`
- indices por `closedAt`, `deletedAt`, `departmentId`, `firstAssignedAt`.

Problema:

- `waId` ainda e a identidade primaria real.
- `phoneNumberId` e um campo de conta WhatsApp, nao um canal generico.
- Uma mesma pessoa em Messenger e WhatsApp poderia colidir conceitualmente se for forcada dentro de `waId`.

### Message

Tabela generica vinculada a `Conversation`.

Campos relevantes:

- `conversationId`
- `direction`
- `messageId`
- `waId`
- `type`
- `bodyText`
- `metaMessageId`

Constraints/indices relevantes:

- `@@unique([direction, messageId])`
- indices por `requestId` e `messageId`.

Problema:

- Ainda possui `waId`.
- O `messageId` unico por direcao pode nao ser suficiente para ids de provedores/canais diferentes.

### InboundMessage

Tabela de inbound bruto/normalizado.

Campos relevantes:

- `clientId`
- `phoneNumberId`
- `waId`
- `waIdCanonical`
- `messageId`
- `bodyText`
- `rawPayload`

Constraints/indices relevantes:

- `@@unique([clientId, messageId])`
- `@@index([clientId, waIdCanonical, createdAt])`

Problema:

- Idempotencia depende de `messageId` por tenant, sem canal/provedor/conta.
- `phoneNumberId` e WhatsApp-specific.
- `waIdCanonical` nao cobre PSID/Instagram user id.

### OutboundMessage

Tabela de outbound enviado pela aplicacao.

Campos relevantes:

- `clientId`
- `phoneNumberId`
- `waId`
- `waIdCanonical`
- `messageId`
- `metaMessageId`
- `status`
- `rawPayload`

Constraints/indices relevantes:

- `@@unique([clientId, messageId])`
- indices por `messageId`, `requestId`, `clientId + waIdCanonical + createdAt`.

Problema:

- Ainda assume WhatsApp.
- Para Messenger/Instagram, a idempotencia e status devem considerar canal, conta e provider.

### Event

Tabela de eventos operacionais/auditoria.

Campos relevantes:

- `clientId`
- `conversationId`
- `waId`
- `waIdCanonical`
- `messageId`
- `eventName`
- `payloadJson`

Constraints/indices relevantes:

- `@@unique([clientId, eventName, requestId])`
- `@@index([clientId, eventName, createdAt])`
- `@@index([clientId, waIdCanonical, createdAt])`

Problema:

- Eventos usam `waId` para identidade.
- Payload pode carregar contexto de canal, mas sem campos indexaveis.

### ConversationRuntimeState

Estado operacional principal da conversa.

Campos relevantes:

- `clientId`
- `waId`
- `waIdCanonical`
- `conversationKey`
- `handoffStatus`
- `answers`
- `mode`
- `status`
- `assignedUserId`
- `departmentId`
- `queueId`

Constraints/indices relevantes:

- `@@unique([clientId, waId])`
- `@@index([clientId, waId])`
- `@@index([clientId, waIdCanonical])`
- `@@index([clientId, status])`
- indices por assignment/queue/status.

Problema:

- Runtime e unico por `clientId + waId`.
- `conversationKey` existe, mas ainda nao e a chave soberana multicanal no banco.

### Lead

CRM operacional do lead.

Campos relevantes:

- `tenantId`
- `waId`
- `waIdCanonical`
- `name`
- `phone`
- `city`
- `service`
- `email`
- `company`
- `status`

Constraints/indices relevantes:

- `@@unique([tenantId, waId])`
- `@@index([tenantId, waIdCanonical])`

Problema:

- Um lead e identificado por WhatsApp.
- Nao ha identidade de canal para Messenger/Instagram.

### LeadNote

Notas do CRM.

Campos relevantes:

- `leadId`
- `tenantId`
- `body`
- `createdAt`

Indices:

- `@@index([leadId, createdAt])`
- `@@index([tenantId, createdAt])`

Problema:

- Depende de `Lead`, que hoje e WhatsApp-centric.

## 2. Problema atual

O core ainda depende fortemente de `waId` como identidade primaria. Isso funciona para WhatsApp, mas nao e correto para canais Meta adicionais.

Problemas principais:

- `waId` representa telefone WhatsApp, nao PSID Messenger nem Instagram scoped user id.
- `phoneNumberId` representa uma conta WhatsApp, nao uma Page Messenger ou conta Instagram.
- Constraints como `clientId + waId` e `tenantId + waId` impedem modelagem limpa por canal.
- `messageId` unico por tenant pode colidir entre canais/provedores.
- `waIdCanonical` nao deve receber identificadores de outros canais.
- Forcar PSID/Instagram id em `waId` aumentaria risco LGPD e risco de mistura de identidade.

## 3. Modelo alvo proposto

### Opcao A - campos multicanal nos modelos existentes

Adicionar campos nullable aos modelos operacionais:

- `channel`
- `provider`
- `channelAccountId`
- `externalUserHash`
- `externalUserRef`
- `legacyWaId`

Aplicar nos modelos:

- `Conversation`
- `ConversationRuntimeState`
- `InboundMessage`
- `OutboundMessage`
- `Message`, se continuar sendo usado como timeline unificada
- `Event`
- `Lead`, se o CRM continuar 1 lead por identidade operacional

Vantagens:

- Menor mudanca no runtime atual.
- Preserva queries e relacoes atuais.
- Permite dual-write incremental.

Riscos:

- Pode deixar modelos grandes e com duas formas de identidade por tempo prolongado.
- Exige disciplina para nao misturar `waId` e identidade multicanal.

### Opcao B - ContactChannelIdentity

Criar um novo modelo para identidades de canal:

```prisma
model ContactChannelIdentity {
  id                    String   @id @default(cuid())
  tenantId              String   @db.Uuid
  contactId             String?
  channel               String
  provider              String
  channelAccountId      String
  externalUserHash      String
  externalUserEncrypted String?
  legacyWaId            String?
  displayName           String?
  firstSeenAt           DateTime @default(now())
  lastSeenAt            DateTime?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  client  Client   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  contact Contact? @relation(fields: [contactId], references: [id], onDelete: SetNull)

  @@unique([tenantId, channel, provider, channelAccountId, externalUserHash])
  @@index([tenantId, contactId])
  @@index([tenantId, channel, provider, channelAccountId])
  @@index([tenantId, lastSeenAt])
}
```

Vantagens:

- Separa pessoa/CRM de identidade de canal.
- Permite uma pessoa ter WhatsApp, Messenger e Instagram sem merge automatico.
- Ajuda LGPD: pode anonimizar identificadores por canal.

Riscos:

- Exige adaptar queries de inbox/CRM quando a leitura multicanal for ativada.
- Exige estrategia clara para `Contact` atual, que hoje tambem e WhatsApp-centric.

## 4. Recomendacao

Recomendacao: abordagem hibrida incremental.

1. Manter `waId` legado para WhatsApp.
2. Adicionar campos multicanal nullable nos modelos operacionais.
3. Criar `ContactChannelIdentity` como fonte limpa de identidade por canal.
4. Nao fazer merge automatico de contatos entre canais.
5. Usar `externalUserHash` para indices e `externalUserEncrypted/ref` apenas se for indispensavel responder pelo provider.

Motivo:

- Preserva estabilidade do WhatsApp.
- Permite ativacao gradual por feature flag.
- Evita colocar PSID/Instagram user id dentro de `waId`.
- Cria caminho profissional para inbox omnichannel sem reescrever tudo de uma vez.

## 5. Campos propostos por modelo

### Conversation

Adicionar nullable:

- `channel String?`
- `provider String?`
- `channelAccountId String?`
- `externalUserHash String?`
- `externalUserRef String?`
- `legacyWaId String?`

Indices:

- `@@index([clientId, channel, provider, channelAccountId, externalUserHash])`
- `@@index([clientId, channel, updatedAt])`
- `@@index([clientId, channel, closedAt])`
- `@@index([clientId, channel, deletedAt])`

Constraint futura, depois de backfill:

- `@@unique([clientId, channel, provider, channelAccountId, externalUserHash])`

Observacao:

- Nao remover `@@unique([clientId, waId])` nesta fase.

### ConversationRuntimeState

Adicionar nullable:

- `channel String?`
- `provider String?`
- `channelAccountId String?`
- `externalUserHash String?`
- `externalUserRef String?`
- `legacyWaId String?`

Indices:

- `@@index([clientId, channel, provider, channelAccountId, externalUserHash])`
- `@@index([clientId, channel, status])`
- `@@index([clientId, channel, assignedUserId, status])`
- `@@index([clientId, channel, queueId, status])`

Constraint futura:

- `@@unique([clientId, channel, provider, channelAccountId, externalUserHash])`

Observacao:

- `conversationKey` pode continuar existindo, mas nao deve conter identificador externo puro para novos canais.

### InboundMessage

Adicionar nullable:

- `channel String?`
- `provider String?`
- `channelAccountId String?`
- `externalUserHash String?`
- `externalMessageId String?`
- `legacyWaId String?`

Indices:

- `@@index([clientId, channel, provider, channelAccountId, externalUserHash, createdAt])`
- `@@index([clientId, channel, externalMessageId])`

Constraint futura de idempotencia:

- `@@unique([clientId, provider, channel, channelAccountId, externalMessageId])`

Observacao:

- Manter `@@unique([clientId, messageId])` para WhatsApp legado durante compatibilidade.

### OutboundMessage

Adicionar nullable:

- `channel String?`
- `provider String?`
- `channelAccountId String?`
- `externalUserHash String?`
- `externalMessageId String?`
- `legacyWaId String?`

Indices:

- `@@index([clientId, channel, provider, channelAccountId, externalUserHash, createdAt])`
- `@@index([clientId, channel, externalMessageId])`
- `@@index([clientId, channel, status, createdAt])`

Constraint futura:

- `@@unique([clientId, provider, channel, channelAccountId, externalMessageId])`

### Message

Se `Message` continuar como timeline unificada, adicionar:

- `channel String?`
- `provider String?`
- `channelAccountId String?`
- `externalUserHash String?`
- `externalMessageId String?`
- `legacyWaId String?`

Constraint futura:

- `@@unique([direction, provider, channel, channelAccountId, externalMessageId])`

### Event

Adicionar nullable:

- `channel String?`
- `provider String?`
- `channelAccountId String?`
- `externalUserHash String?`
- `externalMessageId String?`

Indices:

- `@@index([clientId, channel, provider, channelAccountId, createdAt])`
- `@@index([clientId, channel, eventName, createdAt])`
- `@@index([clientId, channel, externalUserHash, createdAt])`

Observacao:

- Eventos LGPD criticos continuam imutaveis.
- Eventos nao devem armazenar external user id puro em payload.

### Lead

Adicionar nullable:

- `channel String?`
- `provider String?`
- `channelAccountId String?`
- `externalUserHash String?`
- `legacyWaId String?`
- `contactChannelIdentityId String?`

Indices:

- `@@index([tenantId, channel, provider, channelAccountId, externalUserHash])`
- `@@index([tenantId, channel, createdAt])`
- `@@index([tenantId, contactChannelIdentityId])`

Constraint futura:

- `@@unique([tenantId, channel, provider, channelAccountId, externalUserHash])`

Observacao:

- Manter `@@unique([tenantId, waId])` durante compatibilidade WhatsApp.

### Contact

Manter inicialmente.

Mudanca futura opcional:

- Tornar `waId` nullable somente em fase posterior, se `ContactChannelIdentity` assumir identidade primaria.

Nao recomendado nesta migration inicial:

- Remover `waId`.
- Fazer merge automatico entre contatos de canais diferentes.

### ContactChannelIdentity

Criar novo modelo conforme Opcao B.

Campos importantes:

- `tenantId`
- `contactId?`
- `channel`
- `provider`
- `channelAccountId`
- `externalUserHash`
- `externalUserEncrypted?` ou `externalUserRef?`
- `legacyWaId?`
- timestamps.

Constraint:

- `@@unique([tenantId, channel, provider, channelAccountId, externalUserHash])`

## 6. Backward compatibility

WhatsApp deve continuar funcionando como hoje.

Regras:

- `waId` permanece obrigatorio para caminhos WhatsApp atuais enquanto o runtime legado existir.
- Campos novos devem ser nullable na primeira migration.
- `legacyWaId` recebe o `waId` para WhatsApp.
- `channel=whatsapp`.
- `provider=meta`.
- `channelAccountId=phoneNumberId`.
- `externalUserHash=hash(waId)`.

Backfill WhatsApp deve ser opcional e reversivel.

Nao fazer:

- Remover constraints antigas na primeira fase.
- Alterar leitura do inbox imediatamente.
- Usar campos novos para Messenger antes de feature flag e dual-write.

## 7. Estrategia de migration

### Fase A - campos nullable e indices nao destrutivos

Adicionar campos multicanal nullable aos modelos operacionais.

Adicionar `ContactChannelIdentity`.

Criar indices nao destrutivos.

Nao alterar runtime.

### Fase B - backfill WhatsApp

Popular registros existentes:

- `channel=whatsapp`
- `provider=meta`
- `channelAccountId=phoneNumberId`
- `externalUserHash=hash(waId ou waIdCanonical)`
- `legacyWaId=waId`

Criar `ContactChannelIdentity` para contatos/leads/conversas WhatsApp quando seguro.

### Fase C - dual-write WhatsApp

Manter escrita legada e preencher campos multicanal novos em todo inbound/outbound WhatsApp.

Validar que leituras antigas e novas batem.

### Fase D - read compatibility

Adicionar helpers de leitura por identidade multicanal.

Manter fallback para `waId`.

Nao mudar UI ainda.

### Fase E - inbox read multichannel

Somente depois dos testes:

- Listar conversas por `tenantId + channel + status + updatedAt`.
- Exibir canal na UI.
- Preservar filtros legados.

### Fase F - ativacao Messenger controlada

Somente com:

- preflight OK;
- migration aplicada;
- dual-write testado;
- outbound ainda bloqueado se `outboundEnabled=false`.

Persistir primeiro inbound Messenger com feature flag por tenant/canal.

### Fase G - constraints fortes

Depois de estabilidade:

- Avaliar tornar campos multicanal obrigatorios para registros novos.
- Avaliar remover dependencias de `waId` fora do WhatsApp.
- Nunca remover compatibilidade WhatsApp sem migration propria.

## 8. Riscos

Riscos tecnicos:

- Quebrar `@@unique([clientId, waId])` ou `@@unique([tenantId, waId])`.
- Duplicar conversa quando o mesmo contato chega por canal diferente.
- Misturar PSID/Instagram id em campos WhatsApp.
- Criar `conversationKey` com identificador externo puro.
- Idempotencia incorreta entre canais por `messageId`.
- Queries de inbox ficarem lentas sem indices por canal/status/updatedAt.

Riscos de seguranca/LGPD:

- Expor PSID/Instagram user id em logs ou payloads.
- Guardar raw payload com identificadores externos sem retencao.
- Nao anonimizar `externalUserEncrypted/ref`.
- Vincular automaticamente identidades entre canais sem base legal/operacional.

Riscos operacionais:

- Retention/LGPD precisa cobrir novos campos.
- Evaluation/replay e export anonymized precisam reconhecer novos campos.
- Relatorios e storage report precisam medir novos indices/modelos.
- Campanhas/outbound nao devem assumir que todo canal suporta template ou janela WhatsApp.

## 9. Impactos por subsistema

### Retention/LGPD

Atualizar o servico central de privacidade para:

- anonimizar `externalUserHash` quando aplicavel;
- apagar/redigir `externalUserEncrypted/ref`;
- preservar eventos criticos;
- limpar raw payloads de canais Meta;
- atualizar `ContactChannelIdentity`.

### Evaluation/replay

Datasets devem continuar declarativos por `tenantKey`.

Adicionar futuramente:

- `channel`;
- `provider`;
- `channelAccountId` fake;
- `externalUserHash` fake.

### Export anonimizador

Export de conversas reais deve remover:

- `externalUserRef`;
- PSID/Instagram id;
- channel raw payload;
- links e ids externos.

### Storage report

Adicionar metricas futuras:

- volume por canal;
- volume por channelAccountId;
- contagem de ContactChannelIdentity;
- eventos por canal.

## 10. Criterios de pronto para migration

Antes de qualquer migration real:

- backup do Postgres validado;
- migration testada local/staging;
- rollback documentado;
- backfill WhatsApp com amostra conferida;
- `npm run evaluation:replay` PASS;
- testes de qualification/controlled assistant PASS;
- smoke WhatsApp E2E PASS;
- storage report antes/depois;
- preflight Messenger continua bloqueando runtime real ate feature flag;
- retention/LGPD atualizado para novos campos;
- logs sem PII confirmados;
- plano de rollback sem `DROP COLUMN`;
- deploy em janela controlada.

## 11. Pseudo migration sugerida

Exemplo conceitual, nao aplicar:

```prisma
model ContactChannelIdentity {
  id                    String   @id @default(cuid())
  tenantId              String   @db.Uuid
  contactId             String?
  channel               String
  provider              String
  channelAccountId      String
  externalUserHash      String
  externalUserEncrypted String?
  legacyWaId            String?
  displayName           String?
  firstSeenAt           DateTime @default(now())
  lastSeenAt            DateTime?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  client  Client   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  contact Contact? @relation(fields: [contactId], references: [id], onDelete: SetNull)

  @@unique([tenantId, channel, provider, channelAccountId, externalUserHash])
  @@index([tenantId, contactId])
  @@index([tenantId, channel, provider, channelAccountId])
  @@index([tenantId, lastSeenAt])
}
```

Campos conceituais a adicionar nos modelos operacionais:

```prisma
channel          String?
provider         String?
channelAccountId String?
externalUserHash String?
externalUserRef  String?
legacyWaId       String?
```

Indice conceitual:

```prisma
@@index([clientId, channel, provider, channelAccountId, externalUserHash])
```

Unique futuro, apenas apos backfill e validacao:

```prisma
@@unique([clientId, channel, provider, channelAccountId, externalUserHash])
```

## 12. Decisao final desta proposta

Escolha recomendada:

- abordagem hibrida;
- campos multicanal nullable nos modelos operacionais;
- `ContactChannelIdentity` para identidade limpa por canal;
- `waId` preservado para WhatsApp;
- nenhum merge automatico entre canais;
- nenhuma persistencia Messenger antes da migration, backfill e feature flag.

Esta sprint e apenas proposta. Nenhuma migration deve ser aplicada a partir deste documento sem uma sprint dedicada de implementacao, testes e rollback.
