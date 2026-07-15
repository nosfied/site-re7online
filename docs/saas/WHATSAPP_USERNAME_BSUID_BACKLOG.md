# WhatsApp Username / BSUID Backlog

Status: backlog estrategico. Nao implementar antes do fechamento das frentes Xangri-La/CRA-PR.

## Contexto

A Meta comunicou rollout gradual de WhatsApp usernames. Novos contatos poderao iniciar conversas sem expor telefone por padrao.

No estado atual, o runtime principal de WhatsApp do Converta ainda usa `waId`/telefone como identidade obrigatoria. Ao mesmo tempo, a arquitetura multicanal ja possui base para identidades sem telefone via `ContactChannelIdentity`, `externalUserHash`, `externalUserRef` e `channelAccountId`.

Usernames da RE7ONLINE/Converta ja foram reservados no ambiente Meta/WhatsApp.

## Auditoria Resumida

- `Contact`, `Conversation`, `InboundMessage`, `OutboundMessage`, `ConversationRuntimeState` e `Lead` ainda exigem `waId`.
- `normalizeWaId` assume digitos e pode quebrar com username/BSUID alfanumerico.
- Campanhas/outbound continuam exigindo telefone explicito.
- Protocol lookup pode ficar sem prova de posse se a conversa nao tiver telefone/e-mail.
- Opt-out futuro deve considerar identidade de canal, nao apenas telefone.
- Caminho recomendado: `waId` sintetico `whatsapp:<hash>`, reaproveitando o padrao ja usado em Instagram/Telegram.

## Diretriz

Nao implementar antes de fechar Xangri-La/CRA-PR.

Classificacao:

- Urgencia para Xangri-La: baixa.
- Importancia estrategica: alta.
- Implementacao: apos licitacoes em andamento.
- Migration: nao necessaria para compatibilidade inicial; provavel para solucao definitiva.

## Sprint Futura Sugerida

### Sprint 87A - WhatsApp Username / BSUID Compatibility

Escopo inicial:

1. Criar fixtures de webhook WhatsApp sem telefone.
2. Criar resolvedor `resolveWhatsAppContactIdentity`.
3. Detectar `phone` vs `username`/`BSUID`.
4. Gerar `waId` sintetico `whatsapp:<hash>` quando nao houver telefone.
5. Persistir `externalUserHash`, `externalUserRef` e `channelAccountId`.
6. Ajustar Inbox/UI para exibir nome, username ou fallback seguro, nao hash sintetico.
7. Ajustar Public API e relatorios para separar `contactIdentifier` de `phone`.
8. Manter campanhas exigindo telefone explicito.
9. Ajustar protocol lookup para nao revelar status quando nao houver prova de posse.
10. Considerar opt-out por identidade de canal em sprint posterior.

## Regras De Implementacao

- Preservar multitenancy e RBAC.
- Nao quebrar conversas WhatsApp baseadas em telefone.
- Nao tratar BSUID numerico como telefone automaticamente.
- Nao expor username/BSUID bruto em logs.
- Nao alterar campanhas para envio sem telefone nesta fase.
- Nao expor historico ou status de protocolo sem prova de posse.

## Pendencias Para Planejamento

- Confirmar payload final Meta para username/BSUID em webhook WhatsApp.
- Definir formato exato do `externalUserRef` criptografado.
- Definir se `Contact.phone` sera criado futuramente ou se `Lead.phone` permanece como dado opcional.
- Definir politica de opt-out por identidade de canal.
- Definir migracao futura para separar identidade primaria de telefone exibivel.
