# Arquitetura Do Converta

## Visao Geral

O Converta e composto por frontend web, backend operacional, banco de dados PostgreSQL, integracoes Meta e servicos auxiliares de automacao, relatorios, retencao e notificacoes.

Arquitetura logica:

```text
Usuario/Operador
  |
  v
Frontend Converta (/app)
  |
  v
Backend WhatsApp Agent / APIs
  |
  +--> PostgreSQL / Prisma
  +--> Meta Cloud API / Webhooks
  +--> WebSocket / Realtime Inbox
  +--> Jobs de retencao e manutencao
  +--> Servicos de IA, quando habilitados
```

## Componentes

| Componente | Funcao |
| --- | --- |
| Frontend web | Interface do operador, gestor e console interno |
| Backend operacional | Webhooks, APIs, autenticacao, envio e persistencia |
| PostgreSQL | Fonte de dados operacional multi-tenant |
| Prisma | Camada de acesso a dados |
| PM2 | Gerenciamento de processos Node.js |
| Nginx | Proxy reverso e terminacao publica do portal/API |
| WebSocket | Atualizacao em tempo real do inbox |
| Meta APIs | WhatsApp, Messenger e Instagram |
| Jobs/Cron | Retencao, limpeza de midia local e rotinas operacionais |

## Persistencia

O banco PostgreSQL armazena:

- clientes/tenants;
- usuarios;
- sessoes;
- canais e contas tecnicas;
- conversas;
- mensagens inbound/outbound;
- eventos;
- leads;
- notas;
- campanhas;
- templates;
- configuracoes operacionais;
- parametros de LGPD/retencao.

## Runtime De Canais

| Canal | Entrada | Saida | Resolucao de tenant |
| --- | --- | --- | --- |
| WhatsApp | Webhook Meta | Cloud API Meta | `WaPhoneNumber` / `TenantMetaConfig` |
| Messenger | Webhook Meta | Page/Messenger API | `ChannelAccount`/aliases/token |
| Instagram | Webhook Meta | Instagram Business Login API | `ChannelAccount`/aliases/token |

## Realtime

O inbox utiliza atualizacoes em tempo real para:

- chegada de novas mensagens;
- atualizacao da lista de conversas;
- atualizacao da timeline;
- status de envio;
- notificacoes ao operador.

## Escalabilidade

A arquitetura suporta evolucao para:

- separacao entre frontend, backend e banco;
- banco gerenciado;
- storage de objetos para midias;
- multiplas instancias do backend;
- fila assíncrona para processamento pesado;
- observabilidade centralizada;
- replicas/read scaling quando necessario.

## Observacao Para Editais

O ambiente produtivo ofertado deve ser dimensionado de acordo com o edital. Exigencias como 400 usuarios simultaneos, 30 numeros WhatsApp, 5 Instagrams ou 600 GB de midia exigem arquitetura dimensionada e testada para esse volume.

