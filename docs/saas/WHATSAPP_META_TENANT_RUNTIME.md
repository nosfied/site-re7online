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
| WhatsApp Meta | DB-first tenant-scoped | preservada antes do gate reativo | `automationEnabled` + config DB completa | `outboundEnabled` + credencial DB-first | preservado |
| WhatsApp Web Session | contrato existente | inalterada | inalterada | inalterado | preservado |
| Messenger Meta | contrato existente do canal | inalterada | inalterada | inalterado | preservado |
| Instagram Meta | contrato existente do canal | inalterada | inalterada | inalterado | preservado |
| Campanhas WhatsApp | executor de campanhas | não aplicável | não usa o gate reativo novo | contrato existente | preservado |

Os gates `automationEnabled`, `outboundEnabled`, `aiEnabled` e
`inboundPersistenceEnabled` são independentes. Configuração DB incompleta mantém a
persistência do inbound e bloqueia resposta com predicado nominal tenant-scoped;
ela nunca seleciona outro tenant.

## Migração e aposentadoria do JSON

A ordem obrigatória para uma futura intervenção produtiva é:

1. auditar e autenticar a fonte externa;
2. executar backfill em `--dry-run` com caminho absoluto e SHA-256 esperado;
3. executar o backfill sob os locks/transações existentes;
4. executar `tenants-json:retirement:check` por tenant ativo;
5. somente então produzir build;
6. ativar após autorização explícita.

O backfill preserva blocos DB não relacionados, é idempotente e nega qualquer
tenant JSON sem `Client`. Rollback para código antigo é estruturalmente seguro:
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
