# Politica de anonimização LGPD

Esta nota registra a politica operacional do Converta para exclusao logica, anonimizacao e bloqueio de envio ativo. Ela descreve o comportamento esperado do produto e os limites atuais da implementacao.

## Conceitos

**Soft delete** remove a conversa da operacao visivel por `deletedAt`, preservando identidade e historico para auditoria/retencao. Pode ser reativado por novo contato ou fluxo autorizado quando `anonymizedAt` estiver vazio.

**Anonimizacao** remove a conversa da operacao visivel e minimiza dados pessoais. Ela preenche `anonymizedAt`, tambem marca `deletedAt`, fecha a operacao, redige mensagens, limpa payloads sensiveis e substitui identificadores por marcadores tecnicos ou pseudonimos seguros. Nao e hard delete.

**Opt-out/bloqueio de envio ativo** registra que o contato nao deve receber campanhas, templates ou mensagens iniciadas pela empresa. Nao apaga historico e nao bloqueia atendimento receptivo.

**Hard delete** e remocao fisica do registro. Nao e o comportamento padrao de privacidade do Converta e nao deve ser executado sem decisao explicita, autorizacao e plano de auditoria.

## Politica do produto

- Conversa anonimizada nao deve aparecer no Inbox, Operations Board ou demais superficies operacionais.
- Dados pessoais antigos nao devem ser restaurados apos anonimizacao.
- Novo contato depois de anonimizacao deve iniciar nova operacao minima ou ser bloqueado de forma segura, nunca reidratar a operacao antiga.
- Eventos tecnicos e registros de auditoria podem permanecer quando estiverem sanitizados.
- Campanhas e previas de audiencia devem bloquear contatos anonimizados com motivo `anonymized_contact`.
- `deletedAt` pode ser limpo em reativacao operacional somente quando `anonymizedAt` estiver vazio.
- `anonymizedAt` nunca deve ser limpo automaticamente por inbound, campanha, importacao ou integracao.

## Regras tecnicas

- Inbound multicanal deve verificar identidade anonimizada antes de persistir mensagem ou atualizar conversa.
- Upserts nao devem sobrescrever dados minimizados com nome, telefone, perfil, CRM, fila ou historico antigo.
- APIs publicas e read models externos devem filtrar `deletedAt = null` e `anonymizedAt = null` explicitamente.
- Eventos de bloqueio por recontato anonimo devem usar payload sanitizado, sem telefone completo, nome, `rawPayload`, token ou identificador externo cru.
- Superficies administrativas podem preservar rastreabilidade minima, desde que restritas e sanitizadas.

## Limitacoes atuais

Alguns modelos ainda exigem `waId` obrigatorio e unico. Por isso, a anonimizacao atual usa marcadores tecnicos/pseudonimos, como `anon:<id>` ou valor mascarado com sufixo operacional. Esse comportamento deve ser tratado como minimizacao/anonimizacao operacional, nao como hard delete.

Uma modelagem futura pode criar campos estruturados dedicados em `Contact`/`Lead` para anonimização, mas isso exigiria schema/migration e deve ser avaliado em sprint propria.
