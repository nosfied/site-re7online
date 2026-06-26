# Sprint 78N.2C - Load Test Tenant Bootstrap

Data: 2026-06-26

Escopo: criar e preparar o tenant tecnico `loadtest-prefeitura` para testes de carga autenticados, sem executar carga, tuning, swap, HA ou alterar `demo-prefeitura`.

## Resumo Executivo

A Sprint 78N.2 validou fixtures autenticadas, mas o tenant `demo-prefeitura` bloqueou o smoke completo por restricoes legitimas:

- limite de usuarios ativos;
- Webchat habilitado apenas nele;
- uso principal como ambiente de demonstracao.

A 78N.2C cria um caminho idempotente para preparar `loadtest-prefeitura` como tenant tecnico de engenharia.

## Auditoria

| Area | Existe | Reaproveitamento |
| --- | --- | --- |
| Bootstrap atual | `scripts/onboard-tenant.ts`, `Client`, `/admin/tenants` | Referencia para criacao de tenant, mas focado em WhatsApp/telefone real. |
| Features | `Client.features` e `getFeatures` | Usado para `webchat`, `webchatOutbound`, `advancedSearch`, `advancedSearchRuntime`. |
| Quotas de usuarios | `maxActiveAppUsers` no contrato de tenant config | Usado para permitir usuarios temporarios sem alterar limite global. |
| Departamentos/filas | `Department` e `Queue` tenant-scoped | Criados minimamente para RBAC/Inbox. |
| API Keys | `/app/api-keys` | Criadas apenas pela fixture, nao pelo bootstrap. |
| Webchat | `WebchatSite`, `WebchatSettings`, runtime session/messages | Bootstrap habilita feature; fixture cria site/sessao/conversa. |
| Search | `SearchIndex` e `search:index-shadow` | Bootstrap habilita runtime; fixture/indexador cria dados. |
| Public API | API keys tenant-scoped e scopes | Nenhuma alteracao global; fixture cria keys temporarias. |
| Scheduling | modulo existe | Mantido desligado no tenant tecnico inicial. |

## O Que Sera Configurado

Script:

```bash
cd apps/whatsapp-agent
npm run load-test:tenant:bootstrap -- bootstrap --tenant loadtest-prefeitura --max-users 60 --execute --json
```

Para preparacao de fixtures com `search:index-shadow --record`, usar temporariamente:

```bash
npm run load-test:tenant:bootstrap -- bootstrap --tenant loadtest-prefeitura --max-users 60 --advanced-search-runtime false --execute --json
```

Ao final da preparacao, religar para a carga externa futura:

```bash
npm run load-test:tenant:bootstrap -- bootstrap --tenant loadtest-prefeitura --max-users 60 --advanced-search-runtime true --execute --json
```

Dry-run:

```bash
npm run load-test:tenant:bootstrap -- bootstrap --tenant loadtest-prefeitura --max-users 60 --json
```

Status:

```bash
npm run load-test:tenant:bootstrap -- status --tenant loadtest-prefeitura --json
```

Configura:

- `Client` `loadtest-prefeitura`;
- `profile=government`;
- `status=ACTIVE`;
- `features` minimas:
  - `webchat=true`;
  - `webchatOutbound=true`;
  - `advancedSearch=true`;
- `advancedSearchRuntime=true` para carga;
- `advancedSearchRuntime=false` temporariamente para `search:index-shadow --record`;
- features fora do escopo desligadas:
  - `scheduling=false`;
  - `webhooks=false`;
  - `audioTranscription=false`;
  - `mfa=false`;
  - `telegram=false`;
- `TenantOperationalConfig` com limites operacionais e template manual minimo;
- departamentos/filas tecnicas;
- template minimo `loadtest_manual_handoff_v1`;
- `maxActiveAppUsers=60` no contrato de tenant config usado pelo limite de usuarios.

## O Que Nao Sera Alterado

- `demo-prefeitura`;
- `re7online`;
- rate limits globais;
- regras de negocio;
- PM2;
- Nginx;
- Cloudflare;
- Postgres schema;
- migrations;
- usuarios permanentes de carga;
- API keys permanentes;
- Webchat site fixture;
- SearchIndex fixture.

## Checklist De Validacao

Antes da fixture:

```text
- tenant existe;
- profile=government;
- webchat=true;
- webchatOutbound=true;
- advancedSearch=true;
- advancedSearchRuntime=true;
- maxActiveAppUsers=60;
- departamentos/filas criados;
- nenhum usuario temporario criado pelo bootstrap;
- nenhuma API key criada pelo bootstrap.
```

Validacoes funcionais sem carga:

```text
- /app/login segue funcionando;
- load-test:fixtures status retorna prepared=false;
- load-test:fixtures prepare pode criar usuarios temporarios;
- search:index-shadow aceita o tenant;
- Webchat fixture pode criar conversa quando prepare for executado na 78N.2D.
```

## Cleanup E Reset

O bootstrap nao cria recursos temporarios de carga. O cleanup da 78N.2D/78N.3 deve cobrir:

- usuarios temporarios via `load-test:fixtures cleanup`;
- API keys temporarias;
- site Webchat temporario;
- `fixtures.env`;
- `fixtures-manifest.json`;
- SearchIndex fixture, se uma sprint futura adicionar reset dedicado.

Reset completo do tenant tecnico deve ser uma acao operacional separada, nunca aplicada a `demo-prefeitura`.

## Guardrails

- `--execute` e obrigatorio para aplicar.
- Sem `--execute`, o script apenas reporta plano e estado atual.
- `--advanced-search-runtime true|false` controla explicitamente se busca operacional fica ligada.
- Se o guardrail de escrita do contrato de tenant config bloquear `maxActiveAppUsers`, o bootstrap deve parar antes de ser considerado pronto.
- Nao executar carga nesta sprint.

## Resultado Esperado

```text
loadtest-prefeitura pronto para 78N.2D
demo-prefeitura intacto
sem carga executada
sem tuning
sem alteracao estrutural
```

## Result Report

- Bootstrap script definido.
- Features minimas definidas.
- Quota de 60 usuarios temporarios definida.
- RBAC base via departamentos/filas preparado.
- Checklist e cleanup definidos.
- Nenhuma carga foi executada.
