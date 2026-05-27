# Roteiro de POC controlada - Converta

Este roteiro e para demonstracao em banca/licitação. A POC deve ser previsivel:
nao depende de WhatsApp real, entrada externa ou dados variaveis.

## Preparacao

Seed do ambiente demo:

```bash
cd apps/whatsapp-agent
npm run demo:seed
```

Tenant criado:

- `demo-prefeitura`
- nome: `Prefeitura Municipal Demo`
- retencao LGPD: 365 dias, para nao limpar o cenario de apresentacao
- sem `WaPhoneNumber` real e sem configuracao Meta, para evitar inbound externo

Usuarios:

| Perfil | Email | Senha |
| --- | --- | --- |
| ADMIN | `admin@demo-prefeitura.local` | `Demo@2026` |
| SUPERVISOR | `supervisor@demo-prefeitura.local` | `Demo@2026` |
| AGENT Saude | `agente_saude@demo-prefeitura.local` | `Demo@2026` |
| AGENT Educacao | `agente_educacao@demo-prefeitura.local` | `Demo@2026` |
| AGENT Assistencia Social | `agente_social@demo-prefeitura.local` | `Demo@2026` |

Setores:

- Atendimento Geral
- Saude
- Educacao
- Assistencia Social

## Dados simulados

O seed cria 24 conversas com historico realista:

- 5 `WAITING`
- 5 `IN_PROGRESS`
- 5 `WAITING_USER`
- 5 `CLOSED`
- 1 caso com SLA violado
- 1 caso de transferencia entre setores
- 1 conversa longa com mais de 20 mensagens
- casos adicionais para busca, filtros e navegacao

Cada conversa possui:

- lead/CRM com nome, telefone, cidade e servico;
- mensagens inbound/outbound;
- runtime humano com setor/fila;
- metricas para relatorios;
- eventos `demo.conversation.seeded`.

## Chatbot demo

Fluxo ativo:

- nome: `Atendimento Previdenciario`
- entrada: `Ola! Como podemos ajudar?`
- opcoes:
  - Aposentadoria
  - Revisao de beneficio
  - Auxilio-doenca
  - Falar com atendente
- saida: handoff para atendimento humano

## Funcoes de simulacao

Simular nova mensagem em conversa existente:

```bash
cd apps/whatsapp-agent
npm run demo:seed -- --simulate-inbound 558498880001 "Nova mensagem simulada para a banca."
```

Simular handoff para humano:

```bash
cd apps/whatsapp-agent
npm run demo:seed -- --simulate-handoff 558498880001
```

Observacao: estes comandos alteram o banco e sao previsiveis. Eles nao chamam
WhatsApp real e nao dependem de webhooks externos.

## Roteiro de apresentacao

1. Acessar `/app/login`.
2. Entrar como `admin@demo-prefeitura.local`.
3. Abrir `/app/inbox`.
4. Mostrar a lista de conversas e os filtros:
   - Todas
   - Aguardando
   - Em atendimento
   - Aguardando cliente
   - Finalizadas
   - Minhas
   - Nao atribuidas
5. Abrir conversa de Saude e mostrar:
   - timeline;
   - CRM;
   - setor;
   - responsavel;
   - checks/status das mensagens.
6. Mostrar conversa longa para demonstrar estabilidade de timeline.
7. Mostrar transferencia entre setores.
8. Mostrar chatbot em `/app/chatbot`:
   - fluxo ativo;
   - JSON formatado;
   - handoff.
9. Mostrar relatorios em `/app/reports`:
   - atendimentos por setor;
   - tempos de resposta;
   - SLA.
10. Mostrar LGPD em `/app/settings/privacy`:
    - excluir da operacao;
    - anonimizar com confirmacao forte;
    - retencao configuravel.

## Validacao antes da banca

Checklist:

- `npm run demo:seed` executou sem erro;
- `/app/inbox` carrega sem depender de webhook;
- conversas aparecem imediatamente;
- filtros possuem contadores coerentes;
- conversa longa abre sem tela vazia;
- relatorios exibem dados;
- chatbot demo esta ativo;
- LGPD visivel para ADMIN;
- tenant demo nao possui numero real configurado.

## Observacoes operacionais

- A POC e uma simulacao controlada, nao um teste de WhatsApp real.
- Para repetir a apresentacao, rode `npm run demo:seed` novamente.
- O seed limpa e recria apenas dados operacionais do tenant `demo-prefeitura`.
- Para mudar senha, use `DEMO_TENANT_PASSWORD` ao executar o seed.
