# Politica de anonimizacao LGPD

Esta nota registra a politica operacional do Converta para exclusao logica, anonimizacao e bloqueio de envio ativo. Ela descreve o comportamento esperado do produto e os limites atuais da implementacao.

## Conceitos

**Soft delete** remove a conversa da operacao visivel por `deletedAt`, preservando identidade e historico para auditoria/retencao. Pode ser reativado por novo contato ou fluxo autorizado quando `anonymizedAt` estiver vazio.

**Anonimizacao** remove a conversa da operacao visivel e minimiza dados pessoais. Ela preenche `anonymizedAt`, tambem marca `deletedAt`, fecha a operacao, redige mensagens, limpa payloads sensiveis e substitui identificadores por marcadores tecnicos ou pseudonimos seguros. Nao e hard delete.

**Anonimizacao por titular** parte de um `Contact` canonico do mesmo tenant quando ele existe, ou de `Lead.id` quando o sujeito ainda e Lead-only com `contactId = null`, e orquestra as primitivas existentes de privacidade para minimizar o grafo associado. Ela cobre contato quando houver, identidades de canal, leads, notas, conversas associadas, estado de runtime, mensagens outbound/inbound e eventos operacionais sanitizaveis. A previa nao altera dados; a execucao exige confirmacao forte `ANONIMIZAR TITULAR`.

**Opt-out/bloqueio de envio ativo** registra que o contato nao deve receber campanhas, templates ou mensagens iniciadas pela empresa. Nao apaga historico e nao bloqueia atendimento receptivo.

**Exclusao operacional de contato/CRM** remove ou oculta o registro da operacao conforme contrato de CRM. Ela nao equivale a anonimizacao LGPD e nao deve ser usada como resposta ao direito do titular quando a finalidade exigir minimizacao irreversivel do grafo pessoal.

Na entrega limpa de anonimizacao por titular, suporte Lead-only em Privacidade
nao materializa `Contact`. A materializacao de `Contact` para permitir
`Retirar da operação` em linhas Lead-only e frente operacional separada, pois
cria/atualiza registros de CRM e altera elegibilidade operacional.

**Hard delete** e remocao fisica do registro. Nao e o comportamento padrao de privacidade do Converta e nao deve ser executado sem decisao explicita, autorizacao e plano de auditoria.

## Politica do produto

- Conversa anonimizada nao deve aparecer no Inbox, Operations Board ou demais superficies operacionais.
- Dados pessoais antigos nao devem ser restaurados apos anonimizacao.
- Novo contato depois de anonimizacao deve iniciar nova operacao minima ou ser bloqueado de forma segura, nunca reidratar a operacao antiga.
- Eventos tecnicos e registros de auditoria podem permanecer quando estiverem sanitizados.
- Campanhas e previas de audiencia devem bloquear contatos anonimizados com motivo `anonymized_contact`.
- CRM operacional deve ocultar contatos/leads anonimizados por padrao.
- Anonimizacao por titular deve ser tenant-scoped, iniciada por titular selecionado no CRM autenticado e bloqueada quando a identidade for ambigua. O atalho de Contacts pode partir de `Contact.id` ou de `Lead.id`; quando `Contact.id` nao existe, o `Lead.id` e alvo governado diretamente, sem criar Contact artificial, sem telefone cru como chave de mutacao e sem depender de conversa existente.
- Exclusao operacional (`operationallyExcludedAt`) nao remove o titular da descoberta de governanca de privacidade. A lista operacional normal do CRM pode ocultar contatos excluidos, mas a busca de Privacidade deve continuar encontrando o titular pelo grafo Contact/Lead do mesmo tenant enquanto ainda houver dados identificaveis.
- Eventos de anonimizacao por titular devem registrar metadados sanitizados, contagens e ids internos necessarios, sem nome, telefone, conteudo de nota ou payload bruto.
- `deletedAt` pode ser limpo em reativacao operacional somente quando `anonymizedAt` estiver vazio.
- `anonymizedAt` nunca deve ser limpo automaticamente por inbound, campanha, importacao ou integracao.

## Recontato apos anonimizacao

Quando houver nova mensagem ou tentativa de contato ativo relacionada a identidade previamente anonimizada:

- o sistema nao deve restaurar nome, empresa, cidade, telefone, perfil, historico ou CRM antigo;
- inbound multicanal deve bloquear reidratacao da conversa antiga;
- campanha ou envio ativo nao deve reutilizar registro anonimizado para elegibilidade;
- se uma nova operacao minima for permitida, ela deve nascer sem dados pessoais antigos e sem vinculo de historico reidratado.

Soft delete sem `anonymizedAt` e diferente de anonimizacao. Registros apenas removidos da operacao visivel podem ser reabertos por fluxo autorizado. Registros anonimizados nao devem ser reabertos automaticamente.

## Regras tecnicas

- Inbound multicanal deve verificar identidade anonimizada antes de persistir mensagem ou atualizar conversa.
- Upserts nao devem sobrescrever dados minimizados com nome, telefone, perfil, CRM, fila ou historico antigo.
- APIs publicas e read models externos devem filtrar `deletedAt = null` e `anonymizedAt = null` explicitamente.
- Eventos de bloqueio por recontato anonimo devem usar payload sanitizado, sem identificador integral, nome, conteudo bruto, credencial ou identificador externo cru.
- Superficies administrativas podem preservar rastreabilidade minima, desde que restritas e sanitizadas.

## CRM e campanhas

- CRM operacional nao lista anonimizados por padrao.
- Detalhe CRM de registro anonimizado deve retornar erro seguro ou estado indisponivel.
- Visibilidade operacional do CRM nao e visibilidade de governanca de Privacidade: contato excluido da operacao pode continuar pesquisavel em `/app/settings/privacy` para previa e anonimizacao por titular.
- Previa de audiencia e campanha devem bloquear anonimizado com `anonymized_contact`.
- Opt-out continua sendo outro conceito: bloqueia envio ativo, mas nao minimiza historico por si so.
- Soft delete sem anonimizacao nao deve ser tratado como anonimizado.

## Eventos e minimizacao

Eventos de auditoria podem registrar que uma identidade anonimizada foi vista ou bloqueada. Esses eventos devem conter apenas metadados sanitizados, como tenant, motivo, tipo de canal e marcadores minimos.

Mensagens minimizadas, payloads tecnicos e historico operacional antigo nao devem ser usados para reconstruir dados pessoais.

## Limitacoes atuais

Alguns modelos ainda exigem `waId` obrigatorio e unico. Por isso, a anonimizacao atual usa marcadores tecnicos/pseudonimos, como `anon:<id>` ou valor mascarado com sufixo operacional. Esse comportamento deve ser tratado como minimizacao/anonimizacao operacional, nao como hard delete.

Uma modelagem futura pode criar campos estruturados dedicados em `Contact`/`Lead` para anonimizacao, mas isso exigiria schema/migration e deve ser avaliado em sprint propria.

Relatorio administrativo amplo de anonimizados permanece P2 e deve ser restrito, sanitizado e justificado por finalidade de auditoria.
