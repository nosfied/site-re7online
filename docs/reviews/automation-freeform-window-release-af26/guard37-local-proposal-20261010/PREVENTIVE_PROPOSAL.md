# Delta preventivo proposto — durabilidade antes de CRM

**Revisão posterior de162:** [fronteira webhook/CRM corrigida e provas novas](WEBHOOK_CRM_BOUNDARY_20261010.md); [checklist único .6](POSITION6_RECOVERY_CHECKLIST.md). Históricos abaixo preservados; sem apply/ack/deploy.

**Continuidade local sobre85:** [implementação, provas e limites](IMPLEMENTATION_20261010.md). A descrição abaixo preserva a proposta/reprodução histórica. Prevenção agora implementada localmente; verificador/recibo .6 ensaiados, mas nenhum apply/ack/recuperação executado.

**PROPOSTA PARA REVISÃO; NÃO IMPLEMENTADO.** São duas decisões separadas.

## 1. Proteger resultado aceito sem redefinir identidade

Hoje: `provider_accepted → CRM → Outbound → usage → sent → persisted()`. O evento accepted já é durável, mas o read model e a deduplicação precisam do Outbound; a falha CRM interrompe antes dele. Proposta mínima no ramo do runner, usando `persistOutboundMessage` e estruturas JSON existentes:

```text
provider result conhecido
  → persistir provider_accepted (existente)
  → montar payload com resolvedRecipient e snapshots originais (sem criar CRM)
  → persistir Outbound com mesmo tenant/messageId/MetaID e status SENT de submissão
  → ler e conferir o resultado durável exato
  → materializar CRM pelo resolvedor existente
  → usage / evento sent / cleanup já existentes
```

A ausência de `conversationOutcome` não impede o primeiro Outbound: atualmente `rawPayload.conversationId` é null e `previousConversationId` já vem de `resolvedRecipient`. Isso permite deslocar a persistência sem fabricar Conversation/runtime, responsável, departamento, inbound ou janela. Marcar a materialização pendente no JSON/evento existente, separada de falha do provider. SENT continua significando submissão, nunca confirmação humana/entrega. Não mover limpeza da tarefa antes da conclusão das persistências requeridas.

Se CRM falhar: preservar Outbound e evento accepted, registrar a causa, continuar **negando novos destinatários**, requeue por suspensão, reter filha `persisting` e fechar guarda como hoje. Não tornar CRM opcional silenciosamente nem chamar `persisted()` só porque houve Outbound. Este delta previne o buraco de resultado do incidente; não promete eliminar toda necessidade de revisão pós-aceitação.

`persistOutboundMessage` retorna false tanto ao atualizar existente quanto em P2002: não interpretar false como prova de resultado compatível. Ler registro tenant/messageId e exigir mesmo MetaID, destino/conta/transporte/snapshot. Divergência bloqueia. Em replay/persistência concorrente, não rebaixar estado delivered/read/failure mais recente; usar contrato existente de status monotônico. Nunca ressubmeter para preencher Outbound. A verificação exata e preservação de estado precisam de testes antes de implementar/promover este rearranjo.

Falha SQL antes do Outbound continua sustentada por acceptedEvent/ledger; falha de gravar acceptedEvent é outra fronteira e exige manter a resposta conhecida/task/fence, sem retry. Não se introduz garantia impossível de atomicidade com a rede. Nenhum lock transacional/advisory durante provider.

Alcance inicial provável: API `campaignRunner` (execução das três modalidades e agendamento); worker mínimo não executa scheduler de campanha. Confirmar imports afetados antes de empacotar futura correção. Não mudar shared `persistOutboundMessage` globalmente por rotina.

## 2. Decidir o suporte internacional

- **Não aprovado nesta rodada:** ampliar `normalizeCrmWhatsappIdentity`/resolvedor CRM para internacionais. Impactaria manual/API/CSV/Inbound, evidências de conta/hash, aliases, ambiguidade e opt-out. Exige decisão de domínio e cobertura dirigida antes de implementação; não basta regex E.164.
- **Também não aplicar silenciosamente:** remover internacionais de campaignEligibility. Contraria a preservação documentada do envio para identidades existentes. Se o contrato final continuar BR-only para materialização, o produto precisa classificar explicitamente a incompatibilidade no preview/estimativa/materialização e imediatamente antes do provider, pelo resolvedor compartilhado, com motivo visível. Isso é decisão funcional revisável, não fallback para obter PASS.
- Manter candidatos BR12/13 já aprovados, tenant/conta, anonimização antes de extrair dígitos, exclusão e opt-out. Nenhum resolvedor paralelo, criação por ID bruto, bypass ou alteração do snapshot histórico.

## Cobertura requerida para o delta futuro

Esta rodada prova a falha **atual**; não atribui PASS ao desenho proposto. Antes de implementação final: Outbound durável após CRM falhar; erro SQL após aceitação; retorno existente compatível/incompatível; webhook durante persistência e status atrasado; aliases12/13, tenant/conta, opt-out/anonimização; nenhuma submissão extra; falha mantém job/guarda/tarefa; três modalidades. Reutilizar provas não afetadas. Sem migration prevista; qualquer necessidade de schema exige nova decisão explícita antes de implementar.
