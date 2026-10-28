# WhatsApp Meta tenant runtime DB-first

## Incidente de 22/10 e autoridade

O incidente de 22/10 teve uma causa de configuração, não de resolução de tenant.
O webhook resolveu corretamente o `phone_number_id` em PostgreSQL e persistiu o
inbound, mas condicionou a automação à presença do tenant em
`<api-runtime>/.data/tenants.json`. Depois da troca de release, esse JSON não foi
carregado e o runtime registrou `reply.skipped: tenant_config_missing`.

PostgreSQL é a autoridade do runtime WhatsApp Meta. `Client` identifica o tenant,
`WaPhoneNumber` resolve o número, `TenantMetaConfig` mantém credenciais Meta,
`ChannelAccount` separa canal/provedor e seus gates, e
`TenantOperationalConfig` guarda a configuração operacional. Não existe fallback
para tenant default quando o telefone já foi resolvido pelo banco.

`tenants.json` é apenas fonte temporária de migração autenticada. Ele não é fonte
persistente dentro de uma release, não deve ser copiado entre releases e não
autoriza o runtime.

## Matriz preservada

| Fluxo | Identidade/configuração | Persistência inbound | Automação | Outbound | Humano/CRM |
| --- | --- | --- | --- | --- | --- |
| WhatsApp Meta | DB-first tenant-scoped | controlada por `inboundPersistenceEnabled` | `automationEnabled` + config DB completa | predicado reativo completo + credencial DB-first | humano explícito e CRM preservados |
| WhatsApp Web Session | contrato existente | inalterada | inalterada | inalterado | preservado |
| Messenger Meta | contrato existente do canal | inalterada | inalterada | inalterado | preservado |
| Instagram Meta | contrato existente do canal | inalterada | inalterada | inalterado | preservado |
| Campanhas WhatsApp | executor de campanhas | não aplicável | não usa o gate reativo novo | contrato existente | preservado |

Todo outbound reativo Meta, inclusive texto, resposta de quota, janela fechada e
fallback de template, passa por um único predicado antes de qualquer consulta de
quota ou envio: runtime DB pronto, `ChannelAccount.enabled`, `runtimeEnabled`,
`automationEnabled` e `outboundEnabled`. Campanhas e ações humanas explícitas não
usam esse gate reativo.

Os gates são independentes fora desse predicado composto:

- `inboundPersistenceEnabled=true` mantém a persistência do inbound mesmo com
  automação, outbound e AI desligados;
- `inboundPersistenceEnabled=false` nega a nova persistência operacional do
  inbound Meta. Isso não altera status ou webhooks de mensagens já existentes;
- `aiEnabled=false` não exige `aiAssistantConfig` e não bloqueia chatbot,
  persistência, CRM ou atendimento humano;
- `aiEnabled=true` exige o bloco de AI e seus dois toggles booleanos válidos;
- `handoffEnabled` governa somente handoffs automáticos (fallback de AI, nó de
  chatbot/fluxo e roteamento automático sem resposta). Atendimento humano já
  ativo, persistência CRM e ações explícitas de agentes permanecem válidos.

Configuração DB incompleta com persistência habilitada mantém o inbound e bloqueia
resposta com predicado nominal tenant-scoped; ela nunca seleciona outro tenant.

## Participação Meta

Esta migração não transforma requisitos Meta em obrigação global para todo
`Client` ativo. A participação Meta é comprovada por uma conta
`whatsapp/meta`, `WaPhoneNumber`, `TenantMetaConfig` ou por
`metaPhoneNumberId` na fonte autenticada.

- quando a fonte declara `metaPhoneNumberId`, o telefone e a conta Meta (ID ou
  alias) devem corresponder exatamente;
- sem identidade Meta na fonte e sem evidência Meta no banco, um tenant
  Web Session-only é válido e não precisa desses artefatos;
- sem identidade Meta na fonte, mas com qualquer evidência Meta no banco, o
  backfill nega como ambíguo antes da primeira escrita;
- o retirement check exige configuração operacional e identidade completa
  apenas de tenants com participação Meta comprovada.

Um lote misto Meta + Web Session continua integralmente pré-validado e é
aplicado em uma única transação PostgreSQL com locks determinísticos. Qualquer
inconsistência deixa todos os tenants inalterados.

## Migração e aposentadoria do JSON

A ordem obrigatória para uma futura intervenção produtiva é:

1. auditar e autenticar a fonte externa;
2. preparar e revisar um plano tenant-scoped explícito de `ChannelAccount`;
3. executar `channel-accounts:backfill --dry-run` com caminho absoluto e SHA-256 esperado;
4. materializar `ChannelAccount` para todos os participantes Meta em uma única
   transação, com locks de `Client` em ordem determinística;
5. executar `channel-accounts:shadow:compare` contra a mesma fonte autenticada;
6. executar `tenant-config:backfill --dry-run`;
7. materializar `TenantOperationalConfig` em uma única transação atômica;
8. executar `tenants-json:retirement:check` por tenant participante Meta;
9. somente então produzir build e ativar após autorização explícita.

Nenhuma flag operacional de `ChannelAccount` recebe default durante a migração.
Os sete booleanos de runtime devem estar presentes na fonte autenticada. Um
`metaPhoneNumberId` sem contrato completo resulta em
`CHANNEL_ACCOUNT_PLAN_INCOMPLETE`. `cra-pr` não pertence à fonte histórica dos
oito tenants e permanece `CRA_CHANNEL_ACCOUNT_SOURCE_UNRESOLVED` até existir um
plano próprio autenticado; sua configuração nunca é fabricada por inferência.

O backfill preserva blocos DB não relacionados, é idempotente e nega antes de
escrever qualquer tenant sem `Client` ou com participação Meta incompleta ou
ambígua. Tenants exclusivamente Web Session não precisam de conta Meta.
O relatório é sanitizado e não publica números completos. Rollback para código
antigo é estruturalmente seguro:
campos JSON adicionais em `TenantOperationalConfig.config` são ignorados pelo
código que não os conhece.

Nenhum segredo, token ou payload bruto deve aparecer nos relatórios. A fonte de
migração não fica dentro do checkout nem da release e não pode ser symlink ou
gravável por grupo/outros.

## Exceção de capacidade P00

Uma urgência P00 não elimina o contrato de capacidade. Deve-se preferir builder
externo. Se um build local for indispensável para restaurar isolamento tenant,
somente o piso estático de 12 GiB pode receber autorização temporária, selada e
com expiração; orçamento real de coexistência/pico, reserva operacional, inodes,
evidências e encerramento/retenção da geração continuam obrigatórios.
