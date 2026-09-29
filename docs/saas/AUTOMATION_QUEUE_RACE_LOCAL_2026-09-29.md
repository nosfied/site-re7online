# Automação × rodízio — correção local de 29/09/2026

Estado: **LOCAL VALIDATED / NOT DEPLOYED**, com limites abaixo. Publicação autorizada somente para revisão, sem deploy. Não é aceite de uma política de intervenção durante envio automático. Base documental `95c09a71` (API funcional `a3d16d4b`). Nenhuma leitura ou alteração produtiva adicional foi necessária nesta etapa.

## Evidência e diagnóstico

A auditoria produtiva anterior observou Tendência em Meta/IA: reentrada BOT/NONE/WAITING, distribuição registrada pelo rodízio, resposta automática e retorno ao estado sem responsável. Em Syer, WEB_SESSION/chatbot permanecia BOT/NONE com status nulo, fora da seleção WAITING. As políticas de visibilidade diferem, mas isso sozinho não explica o defeito. A reprodução sintética preservada demonstrou visibilidade não → sim → não usando as funções existentes. Não houve captura dos frames do navegador produtivo; o encadeamento causal é sustentado pelos registros anteriores e pela reprodução, sem atribuir ao cliente os testes sintéticos.

`persistConversationWindow` tenta distribuição após inbound; WAITING não significa necessariamente atendimento humano. `applyBalancedQueueAssignment` aceitava BOT/WAITING. Depois, `upsertConversationSafe` persistia o estado capturado antes da atribuição. Os trechos causais já existiam antes da permissão SECULT. Não se estabeleceu relação com a divergência DELIVERED/READ separada.

## Delta local

- `queue/assignmentPolicy.ts`: distribuição exige controle humano (`mode=HUMAN` ou `handoffStatus=ACTIVE`) além das condições existentes. BOT/PENDING ainda aguarda confirmação segundo `shouldAutoReply`/`handleHandoff`; não equivale a handoff aceito. HUMAN/PENDING e BOT/ACTIVE permanecem elegíveis. Atualização condicional impede sobrescrever claim/transferência concorrente; sem aplicação, não avança cursor nem registra atribuição. Seleção, capacidade, presença e ordem dos locks não foram redesenhadas.
- `conversation/runtimeWriteFence.ts`: compara revisão e campos de controle observados, com tenant e identidade, em atualização atômica do runtime. Compara também os campos quando o timestamp coincide. Não mantém lock durante processamento/provider, não usa o lock do JSON de configuração, não reenvia nem reaplica cegamente um estado rejeitado.
- `conversation/conversation.types.ts`, `storage/storage.ts`, `storage/dualWriteStorage.ts`: transportam o token observado; gravação condicional propaga erros, sem fallback incondicional. A proteção do adaptador é **postgres-only**, configuração observada anteriormente nos artefatos produtivos. JSON/híbrido não foi redesenhado nem recebeu essa garantia.
- `whatsapp/webhook.controller.ts`: rejeita conclusão obsoleta, recupera estado atual e renova o token após escritas próprias de reentrada/ciclo. Resultado outbound já aceito permanece no registro durável existente.
- `web-session/webSessionInbound.ts`: captura revisão e condiciona persistência; conflito na conclusão do fluxo encerra o processamento antes de aplicar notificações/atribuição decorrentes do estado obsoleto.
- Testes: `queue/assignmentPolicy.test.ts`, `conversation/automationPersistence.test.ts`, `web-session/webSessionInbound.test.ts`. O mock WEB_SESSION passou a modelar o método Prisma condicional; assertions existentes preservadas.

## Validação executada

Somente DB local isolado e fixtures sintéticas, sem aplicação produtiva, sessão ou provider. Banco de testes já existente, não restaurado de produção.

| Evidência | Resultado e alcance |
| --- | --- |
| Rodízio | 24 PASS: BOT/WAITING, handoffs transitórios legítimos, tenant incorreto e claim concorrente antes da escrita |
| Persistência automática | 13 PASS: funções reais extraídas dos módulos Meta/IA e WEB_SESSION; barreiras antes da conclusão, claim/handoff/fechamento/novo inbound, isolamento e resultado aceito preservado |
| Regressão afetada conjunta | 115 PASS, 0 falhas/skip: rodízio, persistência, dualWriteStorage e WEB_SESSION; comando incluiu também conversation.service.test.ts |
| Refinamento final | Os 13 testes de persistência foram executados novamente com alteração humana mantendo o mesmo timestamp. PASS. A suíte 115 antecede somente esse refinamento do teste; código de implementação inalterado |
| Backend | `npm run build --prefix apps/whatsapp-agent`: PASS, TypeScript normal |
| Worker mínimo em Node v20.20.0 | 15 PASS / 22 excluídos intencionalmente por seleção de nomes; não equivalem a 37 executados nem a toda a suíte |
| Worker build/tipos | Build `tsc --noCheck` PASS. Checagem `tsc -p tsconfig.json --noEmit --noCheck false`: 13 diagnósticos preexistentes, logs da base/delta byte a byte iguais. Não há aprovação integral de tipos |

Comando da regressão (variáveis locais sintéticas omitidas):

```sh
apps/whatsapp-agent/node_modules/.bin/tsx --test   apps/whatsapp-agent/src/queue/assignmentPolicy.test.ts   apps/whatsapp-agent/src/conversation/automationPersistence.test.ts   apps/whatsapp-agent/src/storage/dualWriteStorage.test.ts   apps/whatsapp-agent/src/web-session/webSessionInbound.test.ts   apps/whatsapp-agent/src/conversation/conversation.service.test.ts
```

Os testes de persistência usam as funções reais com DB e barreiras; não são replay integral de webhooks/providers nem smoke produtivo. Nenhuma mudança frontend, portanto sem build/smoke visual novo. Evidências privadas: `local-evidence/automation-queue-fix-20260929/`; reprodução anterior preservada em `local-evidence/inbox-automation-audit-20260929/`. Não publicar essas pastas.

## Impacto por artefato

API: runtime, fila e persistência Meta/WEB_SESSION acima. Worker produtivo é o mínimo sobre `bf5f1d76` + cinco fontes de `f06d49cb` (pacote revisado `042e386a`), não a árvore inteira da API. Aplicação isolada do delta a essa base produziu 93 compilados contra 92: somente três alterados (`assignmentPolicy`, `dualWriteStorage`, `webSessionInbound`) e um helper novo; nenhum removido. Fontes/interfaces adicionais são apagadas na compilação. Manifesto e patch privados preservados. Não foi incorporado o conjunto adicional de módulos do worker completo. Frontend: nenhuma alteração. Sem schema/migration/configuração de tenant.

## Limite material: resposta automática já em processamento

A correção de persistência não é autorização de envio. Em Meta, `shouldSendOutbound` verifica geração inbound/lastInboundAt; não demonstra bloqueio por toda intervenção humana, e há I/O antes da submissão. Em WEB_SESSION, os controles de transporte não demonstram uma barreira comum entre claim e admissão do outbound automático. Há caminho para resposta tardia: esta lacuna preexistente não foi corrigida incidentalmente.

Decisão necessária antes de ampliar escopo: definir o tratamento de resposta ainda não submetida quando ocorre intervenção humana, e de chamada já submetida/aceita. Proposta delimitada: validar controle atual antes de admitir a resposta; registrar resultado já aceito sem retry; explicitar no handoff eventual chamada ainda em andamento. Uma releitura isolada não torna atômicos claim e submissão. Se for exigida exclusão estrita, o mecanismo de coordenação precisa de revisão própria. Não afirmar cancelamento de provider nem zero resposta tardia.

Chamadas auxiliares WEB_SESSION também podem ter sua persistência recusada após transição concorrente: o registro outbound permanece, mas o teste não comprova todos os efeitos de notificações/transporte. A garantia aqui é não sobrescrever o controle humano nos caminhos testados. Preservados contratos ativos, lifecycle, HUMAN/WAITING e privacidade.

SECULT DEPLOYED / CLIENT ACCEPTED conforme owner; campanhas/CRA aguardam validação funcional do owner; inatividade no Guia pausada; DB-only encerrada; 6683 CLOSED. [Proposta BOT separada](INBOX_AUTOMATION_VISIBILITY_PROPOSAL_2026-09-29.md).

## Revisão para publicação — 29/09/2026

Comparação protegida: `updatedAt`, `version`, `mode`, `handoffStatus`, `assignedUserId`, `assignedAt`, `departmentId`, `queueId`, `status`, `closedAt`, `lastInboundAt`, sempre com clientId/waId. A atualização condicional aplica o documento inteiro somente se essas observações permanecem válidas; conflito não protege apenas assignedUserId, mas impede toda a escrita antiga, inclusive answers. Ciclo é armazenado em `answers.operationalProtocol`/`lastClosedServiceCycle` por `conversation/serviceCycle.ts`; sua proteção depende da revisão (`version`/`updatedAt`), não de comparação independente do JSON. Escrita que alterasse somente answers, preservando artificialmente ambas as revisões, não está coberta. Não se declara proteção contra escritores que violem esse protocolo.

Em conflito, Meta retorna o estado relido; WEB_SESSION retorna false e a conclusão de fluxo evita efeitos posteriores do estado obsoleto. Nenhum retry do documento antigo. Erro de banco propaga pelo helper (e chega ao tratamento existente do chamador); não vira conflito bem-sucedido nem fallback incondicional. Resultado já aceito permanece nos mecanismos duráveis existentes; falha simultânea desses mecanismos não recebe promessa de persistência impossível. O patch não muda retries de transporte.

Cobertura adicional necessária nesta revisão: transferência muda modo/status/departamento/fila e responsável com timestamp coincidente; troca de ciclo modifica answers e incrementa version; falha injetada confirma propagação e uma única tentativa. Comparação de toda a linha após conclusão atrasada comprova ausência de restauração dos campos novos nos dois caminhos. **18/18 PASS** na suíte ampliada, substituindo a contagem de 13 para esta versão do arquivo. Primeira execução detectou FK da fixture sem departamento real; corrigida com departamento/fila sintéticos, sem alteração de implementação. Os 115 históricos, a reexecução anterior dos 13 e os 15 selecionados do worker têm sobreposição; não somar como testes distintos. Builds anteriores e comparação de tipagem do worker pertencem à mesma implementação, inalterada nesta revisão; novos casos executados apenas na API local. Build backend repetido para conferir a tipagem dos casos adicionados (publication-build.log).

### Ordem do envio e intervenção: referências exatas

- Meta `whatsapp/webhook.controller.ts`: `shouldSendOutbound` (~656) verifica geração inbound, não claim. `sendOutboundText` (~714) verifica guard, aguarda usage/credenciais e chama `sendTextMessage` (~767). No processamento final (~8201), `sendPromise` inicia envio e somente o callback de sucesso (~8226) chama `persistOutboundConversation`, que usa `upsertConversationSafe`. A ramificação template chama seu transportador diretamente: uma proposta futura não pode cobrir só texto.
- WEB_SESSION `web-session/webSessionInbound.ts`: chatbot chama `createWebSessionTextOutboundMessage` (~3191); `webSessionOutboundService.ts` chama `callWorkerSendText` (~573), antes da conclusão protegida em `persistWebSessionRuntimeState` (~3304). Outras respostas usam `sendWebSessionBotText` (~1489).
- Intervenção: `app/routes.ts`, rota `/app/conversation/:waId/claim`, persiste HUMAN/ACTIVE/IN_PROGRESS; não participa de barreira atômica com esses pontos de submissão.

**Já submetido antes da intervenção:** preservar resultado/aceitação; não prometer cancelamento ou reenvio. A conclusão protegida impede restaurar o runtime antigo, não desfaz mensagem.

**Ainda não submetido quando controle muda:** a validação atual pode não detectar a intervenção; esta é lacuna material. Menor melhoria proposta, NÃO implementada: verificar tenant/controle/revisão atual imediatamente antes de cada admissão automática (texto/template/WEB_SESSION), descartar resposta obsoleta e manter registro do motivo. Há janela entre releitura e submissão; isso reduz risco mas não garante exclusão estrita. Uma garantia estrita exige coordenação com claim/handoff e contabilização de chamadas já admitidas, a revisar separadamente. Não manter transação de banco aberta durante provider nem alterar silenciosamente o contrato.
