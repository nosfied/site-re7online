# Result report ao arquiteto — Demo, campanhas dinâmicas e atalho CRM

**READ-ONLY AUDIT / FUNCTIONAL DEFECT CONFIRMED / NO REMEDIATION EXECUTED.** 08/10/2026, fuso Fortaleza. API e worker mínimo reativoafbb, frontendfa60 corrigido. Nenhuma alteração de campanha, guarda, scheduler, configuração, contato, histórico ou processo. Nenhum replay, reenvio, limpeza de tarefa ou provider provocado. Consultas limitadas com transação READ ONLY/statement_timeout10s; logs específicos limitados a15s. Evidências completas, números e identificadores de anonimização permanecem privados.

## 1. Limitação CRM para posterior adição ao backlog

Owner confirmou ADMIN do Demo e que a conversa final1777 apareceu ao selecionar **Automação**. A chave de acompanhamento estátrue; runtimeBOT, chatbotativo/nóconsent, sem responsável/departamento/fila. Ausência emTODAS é prevista e não constitui defeito de autorização.

Há limitação separada do atalho **CRM → Abrir conversa**: `src/app/app/crm/page.tsx:2075` navega para `/app/inbox?conversation=<identidade>`. O efeito em `src/app/app/inbox/page.tsx:5144` procura o alvo somente no array de conversas já carregado; não resolve diretamente o detalhe nem muda o filtro. A busca emTODAS excluiBOT (`page.tsx:3940/5112`). Portanto, uma conversaBOT autorizada pode não abrir pelo atalho até carregarAutomação. Evidência do mecanismo por leitura do código; o owner confirmou acesso pelo filtro, **não foi executado um novo teste navegacional do atalho**. Registrar para revisão futura de backlog, sem ampliar visibilidade, RBAC ou trazerBOT paraTODAS. Nenhuma correção implementada nesta investigação.

## 2. Duas campanhas efetivamente investigadas

| Campo | Campanha teste out.13 | Campanha teste out.14 |
|---|---|---|
| Controlador | `1d7be01c-7545-493d-9be2-e14de005ac5c` | `44a209f2-fad6-4de5-8521-cd8ab07ae7b0` |
| Conjunto | `5a92945c-d235-47bd-b9c7-eb00f6a7d98a` | `df8e7e5b-75dd-4381-93c9-488ec114744c` |
| Filtro salvo | DYNAMIC_CRM_FILTER/NURTURE, labelNutrir | DYNAMIC_CRM_FILTER/FOLLOW_UP |
| Horário salvo | 08/10 07:49Fortaleza/10:49UTC | 08/10 07:53Fortaleza/10:53UTC |
| Estado observado | controlador sending/conjunto running | scheduled; jobqueued/attempt0 |
| Snapshot/filhos | snapshot6/filho único de6 | sem snapshot/filho no recorte |
| Resultado | sentCount1, segunda aceitação sem Outbound local | nenhuma submissão iniciada |

Filho out.13 `09f1a742-d42d-4325-9b36-cf8e57650e9a`, nome “Campanha teste out.13 — 01/01”, sending6/sent1/blocked0. Não confundir esse filho com a segunda campanha. Job materializadorcompleted/attempt1; job do filhoqueued/attempt1/failureReasonoperational_suspension e lease liberado. Conjunto/filho/link ainda não consolidados como terminal. Esses estados são persistidos, não somente uma tela sem atualização.

## 3. Divergência seis candidatos versus um contato operacional

Banco contém seisLeads com statusNURTURE: **um contato não excluído, final9614, e cinco Leads anonimizados** (`anon:subject:…`) com Contact.operationallyExcludedAt desde setembro. A listaCRM omite anonimizados/excluídos por padrão (`crmContactsReadModel.ts:283/885/970`), portanto o relato de um contato operacional é consistente com os dados.

Snapshot `campaign.dynamic_batch_snapshot.created` de out.13 às07:49:08,131: matchedCount6, eligibleCount6, blockedCount0, chunkCount1. `campaignRunner.ts:568` consulta Leads por tenant/status apenas; não aplica nesse ponto as mesmas restrições de anonimização/exclusão usadas pelo CRM. `normalizeCampaignRunRecipientWaId` (`:125`) remove caracteres não numéricos e, quando normalizeCrmWhatsappIdentity retorna null, aceita os dígitos como fallback. A seleção (`:591`) verifica apenas string não vazia/deduplicação/variável. Assim um marcadoranon se transforma em pseudo-destinatário numérico.

**Não é ausência global de checagem de exclusão:** o runner revalida loadOperationallyExcludedWaIds (`:1408`) antes do provider. Porém recebe as identidades já convertidas; a associação com os marcadores originais foi perdida. A prova produtiva mostra que não bloqueou o segundo pseudo-destinatário. Corrigir apenas a contagem da tela não resolveria o problema.

## 4. Linha do resultado e fechamento conservador

1. 07:49:08,459: submit_started para final9614; 07:49:09,049 provider_accepted; OutboundSENT às07:49:09,138; campaign.message.sent07:49:09,165. Uma submissão/Outbound local. SENT não equivale a recebimento confirmado pelo owner nesta rodada.
2. 07:49:10,250: segunda submissão, comprimento **7dígitos**, obtida de um dos cinco marcadoresanon. Correspondência exata entre os dígitos do marcador e metadados da submissão conferida nas evidências privadas. **Não é o número original da pessoa anonimizada**; é transformação inválida do marcador.
3. 07:49:11,151: provider_accepted dessa segunda chamada, com Meta messageId preservado privado; não há Outbound local correspondente. Log `campaign.result.persistence_pending`, providerAcceptedtrue/retryAllowedfalse.
4. 07:49:11,186: guarda global fecha automaticamente, geração33→**34**, motivo **unfinished_child_requires_review**. Permanece uma tarefa provider/phasepersisting para o segundo messageId, sem limpeza executada.
5. 07:49:18,009: webhook Meta retorna **failed/131026 Message undeliverable**. 07:49:18,028: `webhook.status.orphaned`, reasonoutbound_message_not_found. A aceitação inicial não comprovava entrega; a falha posterior é conhecida, mas não reconciliada ao Outbound ausente.

O catch de `campaignRunner.ts:1923` com pendingAcceptance preserva tarefa/impede retry e registra apenas result.persistence_pending, sem errooriginal. A materializaçãoCRM (`:1742`) ocorre depois deprovider_accepted e antes de persistOutboundMessage (`:1766`); seu resolvedor valida telefone (`campaignOutboundConversation.ts:90` → `crmContactUpsert.ts:313/201`). Número de7dígitos é incompatível com essa validação. **Esse é o caminho concreto suspeito da exceção, mas a exceção original não foi registrada: não declarar invalid_phone como erro produtivo capturado.** A causa exata da falha de persistência exige reprodução local dirigida ou evidência adicional; não foi feito replay produtivo.

## 5. Por que out.14 não executou e alcance operacional

Scheduler permanece habilitado, API3153929online/restart0; não foi parado pelo deploy frontend. **Guarda global closed/generation34, uma tarefa provider pendente**. Não existe lease de execução de campanha ainda ativo no recorte: o lease do tenant tem jobIdnull/expiresAt passado. Assim a out.14 não espera somente um job atualmente em execução; sua tentativa0 permanece retida também pela admissão fechada. Respeitar o bloqueio é correto, embora a origem seja o defeito anterior.

A guarda é global, não exclusiva deDemo: fechamento impede novas admissões também em outros tenants. Esta auditoria comprovou o casoDemo; não inventaria nem declara que outros tenants tentaram enviar depois do fechamento. Não se reabre por timeout, não se remove tarefa e não se reenvia o segundo resultado. Reabrir sem corrigir seleção e reconciliar a aceitação poderia permitir os quatro marcadores restantes do snapshot imutável.

## 6. Encaminhamento proposto ao arquiteto

- Prioridade: revisar correção local compartilhada de elegibilidade/identidade **antes do snapshot e antes do provider**, reutilizando contratos CRM, exclusão e anonimização existentes. Nunca tornar anon/hash em telefone nem aceitar dígitos residuais por fallback. Preservar público dinâmico, isolamento, variáveis e snapshot imutável; auditar também o materializador individual.
- Reproduzir localmente seisLeads (cinco anon/excluídos, um válido), confirmar1elegível e nenhum provider para marcadores. Reproduzir falha pós-aceitação/persistência separadamente e preservar a causa do erro com sanitização.
- Preparar reconciliação **separada**, dry-run e plano concreto para snapshot/job/controlador/tarefa/provider_accepted + failed131026 órfão; não executar reenvio nem apagar locks/tarefas para forçar terminal. Nenhuma autorização de reparo decorre desta auditoria.
- Só depois avaliar retomada por mecanismoCAS vigente e geração atual. Não retomar fila nesta rodada. A out.14 pode permanecer aguardando enquanto a decisão segura não for concluída.
- LimitaçãoCRM é uma frentefrontend separada para posterior backlog; não misturar com o defeito de seleção da campanha.

Nenhum patch funcional, build, teste provider, deploy ou saneamento executado. Aceites anteriores avulso/CRMestático/CSVindividual/agendamento/dinâmica controlada permanecem com seus limites; um filtro sem registrosanon não validou essa negativa. Agrupamento natural, contingênciaAUTO e CRA-PR não encerrados. Reparo de setembroCLOSED, históricos intactos.
