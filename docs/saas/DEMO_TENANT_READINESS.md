# Demo Tenant Readiness

Status: documento operacional. Nao altera runtime, banco, tenants, canais ou credenciais.

Tenant padrao recomendado para demonstracoes controladas: `demo-converta`.

## Decisao Da Sprint 87P

A base de demonstracao deve ser generica e multitenant. O tenant `demo-converta` pode ser usado para simular cenarios de apresentacao, inclusive SECULT-PE, mas o core do produto nao deve carregar nomes, dados ou regras especificas de um cliente real.

Nao foi criado provisionador com escrita nesta sprint. A criacao completa de tenant exige decisoes manuais e seguras sobre usuarios, credenciais Meta, numero WhatsApp, modelos aprovados e dados ficticios. O artefato implementado e um checker somente leitura.

## Checker Somente Leitura

Comando:

```bash
cd apps/whatsapp-agent
npm run demo:readiness -- --tenant demo-converta
```

Saida JSON:

```bash
cd apps/whatsapp-agent
npm run demo:readiness -- --tenant demo-converta --json
```

Para diagnostico Meta/WhatsApp reutilizavel em qualquer tenant, use:

```bash
cd apps/whatsapp-agent
npm run meta:readiness -- --tenant <tenant-key>
```

O checker:

- usa somente o tenant informado;
- nao aceita `clientId` externo;
- nao escreve em banco;
- nao imprime token, payload cru, telefone completo, corpo de mensagem ou identificador externo completo;
- mascara identificadores tecnicos com ultimos 4 digitos e tamanho;
- retorna checks `OK`, `INFO`, `WARN`, `PARTIAL`, `WAITING_EXTERNAL` ou `FAIL`;
- pode retornar `WARN` sem impedir build ou deploy.

## Auditoria Da Base Atual

### 1. Criacao de tenant

O tenant principal e `Client`, identificado por `clientKey`, `name`, `status`, `features` e `profile`. Scripts existentes como `apps/whatsapp-agent/scripts/onboard-tenant.ts` indicam que onboarding completo pode envolver tenant, usuario inicial e numero Meta, mas esse fluxo exige dados sensiveis e escrita em banco.

### 2. Features e capabilities

O campo `Client.features` armazena overrides JSON. O produto tambem usa perfil/capability em camadas de aplicacao. Para demo, o checker verifica explicitamente sinais de `crm`, `campaigns`, `templates`, `reports`, `departments` e `chatbot`, mas trata ausencia como `WARN` quando nao ha desativacao explicita.

### 3. TenantOperationalConfig

`TenantOperationalConfig.config` e a area correta para configuracoes operacionais por tenant sem migration, incluindo mensagens prontas, `queueAssignmentPolicy` e `metaUsagePolicy`.

### 4. TenantMetaConfig

`TenantMetaConfig` guarda configuracao Meta do tenant. O checker consulta somente indicadores e IDs mascarados. Nao le `businessToken` nem `rawPayload`.

### 5. WaPhoneNumber

`WaPhoneNumber` vincula numero WhatsApp ao tenant por `clientId` e `phoneNumberId`. O checker valida existencia e mascara identificadores.

### 6. ChannelAccount WhatsApp

`ChannelAccount` e o modelo multicanal para contas de canal. Para WhatsApp, parte do runtime ainda depende de `TenantMetaConfig` e `WaPhoneNumber`. Portanto, ausencia de `ChannelAccount` WhatsApp vira `WARN`, nao falha automatica, se a configuracao Meta minima existir.

O readiness generico Meta/WhatsApp foi extraido para reaproveitamento e o
readiness do demo o consome. Isso evita manter checkers paralelos com criterios
divergentes.

### 7. Usuarios por tenant

Usuarios pertencem ao tenant via `User.clientId`. O readiness espera usuarios ativos cobrindo `ADMIN`, `SUPERVISOR` e `AGENT`.

### 8. Roles

Roles sao usadas para RBAC. Para demo, o minimo recomendado e:

- `ADMIN` para configuracao;
- `SUPERVISOR` para operacao assistida;
- `AGENT` para atendimento.

### 9. Departamentos

Departamentos usam `Department.clientId` e podem alimentar fila, assignment e filtros. O checker valida existencia de departamento ativo e filas vinculadas quando houver.

### 10. Mensagens prontas

Mensagens prontas ficam em `TenantOperationalConfig.config.cannedReplies`, nao em tabela propria. O checker conta total e ativas sem imprimir conteudo.

### 11. queueAssignmentPolicy

`queueAssignmentPolicy` fica em `TenantOperationalConfig.config.queueAssignmentPolicy`. A politica default sem configuracao ativa permanece manual. O checker apenas reporta se esta configurada e se esta habilitada.

### 12. Template sync

Templates Meta ficam em `Template`, tenant-scoped por `clientId`. O checker conta templates e aprovados sem imprimir conteudo.

### 13. CRM/Lead/Contact demo sem PII

CRM usa `Lead` e `Contact`. Para demonstracao, qualquer massa deve ser ficticia, sem telefone real completo e sem dados pessoais reais. O checker conta registros e avisa que a natureza ficticia precisa ser confirmada manualmente.

### 14. Bootstrap scripts existentes

Ha scripts de onboarding, seeds e backfills em `apps/whatsapp-agent/scripts`. A Sprint 87P adiciona apenas `demo-tenant-readiness.ts`, mantendo o padrao existente de scripts fora de `src`.

### 15. Requisitos sensiveis/manuais

Continuam manuais e fora do checker:

- senha de usuario;
- credenciais Meta;
- permissao de canal;
- numero WhatsApp autorizado;
- modelos aprovados;
- dataset ficticio;
- ativacao explicita de politica de fila;
- smoke com envio real.

## Resultado Esperado Para Demo

Um tenant pronto para demonstracao deve ter:

- tenant ativo;
- configuracao Meta minima;
- numero WhatsApp vinculado;
- templates aprovados sincronizados;
- usuarios ativos nos papeis principais;
- departamentos ativos;
- mensagens prontas;
- CRM ficticio;
- politicas opcionais documentadas;
- nenhum dado real sensivel em massa de apresentacao.

## Estado Subsequente Do demo-converta

Estado operacional conhecido apos provisionamento e testes controlados:

- tenant ativo;
- usuarios demo criados;
- leads e conversas de teste/ficticios;
- mensagens prontas configuradas;
- chatbot flow configurado;
- queue assignment configurado para demonstracao;
- `TenantMetaConfig` presente;
- token presente, sem exposicao do valor;
- `WaPhoneNumber` presente;
- WABA presente;
- `ChannelAccount` WhatsApp ausente, sem ser requisito do modelo atual;
- `businessId`/`businessPortfolioId` ausentes, tratados como `WARN`;
- templates ainda dependem de sincronizacao/aprovacao conforme estado Meta.

`demo-converta` e tenant permanente de demonstracao do produto. Ele nao e tenant
oficial SECULT-PE.

Quando o display name ou outro passo depender da Meta, classifique como
pendencia externa/operacional. Nao reexecute onboarding, code exchange ou troca
de numero sem diagnostico e autorizacao explicita.

## Limites

Este readiness nao:

- cria tenant;
- cria usuario;
- cria senha;
- configura Meta;
- importa contatos;
- cria campanha;
- envia mensagem;
- submete template;
- ativa fila automatica;
- altera banco.
