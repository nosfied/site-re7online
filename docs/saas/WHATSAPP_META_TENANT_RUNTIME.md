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

## Migração e aposentadoria do JSON

A ordem obrigatória para uma futura intervenção produtiva é:

1. auditar e autenticar a fonte externa;
2. executar backfill em `--dry-run` com caminho absoluto e SHA-256 esperado;
3. validar integralmente todos os Clients, contas Meta, mapeamentos de telefone e
   deltas antes da primeira escrita;
4. executar todos os tenants selecionados em uma única transação PostgreSQL, com
   locks em ordem determinística; qualquer falha reverte todos os tenants;
5. executar `tenants-json:retirement:check` por tenant ativo;
6. somente então produzir build;
7. ativar após autorização explícita.

O backfill preserva blocos DB não relacionados, é idempotente e nega antes de
escrever qualquer tenant JSON sem `Client`, conta Meta ou mapeamento de telefone.
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
