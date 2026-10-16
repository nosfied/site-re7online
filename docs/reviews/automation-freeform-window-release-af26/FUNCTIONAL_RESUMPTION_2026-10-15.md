# Retomada funcional — prioridade e próximo trabalho local

**Complemento de entrega coordenada:** [três artefatos concretos sobre runtime ativo atestado, total operationalStatus corrigido, custódia e roteiro](crm-csv-coordinated-20261015/REPORT.md). LOCAL VALIDATED / NOT DEPLOYED / NOT WINDOW READY; política/perfis/bindings e provas frescas somente com janela definida. Retorno conserva API ledger/GET e frontend com assets em união; nenhuma retomada de Prisma/rotações externas/limpeza.


**Atualização15/10 — CSV LOCAL VALIDATED / FOR REVIEW / NOT DEPLOYED:** [entrega,67 provas e limites](crm-csv-operation-20261015/REPORT.md), [contrato canônico](../../saas/CRM_CSV_IMPORT_OPERATION_CONTRACT.md). A auditoria abaixo registra o diagnóstico anterior; a implementação agora reutiliza Event para admissão/progresso/terminal por operação e tenant, sem migration, recupera timeout sem replay e distingue total/filtro/página. Revisão Chrome local com API/PG reais concluída no complemento do relatório: timeout/recarga/terminal/filtros/página, correção da lista recuperada e comparação22 erros idênticos à base. Próximo trabalho concreto: revisão do owner, orçamento dos recibos/contagens e plano seletivo API/frontend coordenado. Não repetir Prisma42, suites/builds válidos, reimportação histórica ou fases operacionais concluídas.


**Segurança externa: ROTAÇÕES ADIADAS POR ACEITAÇÃO DO OWNER.** [Aceite explícito da matriz b1d41b33 e revisão21/10](security-containment-20261012/exposure-scope-20261015/OWNER_ACCEPTANCE_2026-10-15.md). P0/A/B e resets continuam suspensos; pacotes/evidências preservados. Não renovar backup apenas para essa preparação. A decisão libera o foco de engenharia funcional, sem declarar segurança encerrada.

## Prioridade canônica

O [backlog técnico](../../BACKLOG_TECH.md) mantém a frente de **campanhas/CRM e aceite Utility/CRA**, com a ordem de aceite Utility/campanha → opt-out → relatórios/exportações/billing → acceptance pack. Itens WATCH e fases concluídas não voltam à fila sem fato novo. O aceite operacional CRA continua dependente de autorização própria; guarda38 fechada não autoriza envio ou nova campanha controlada.

Dentro dessa frente, o próximo trabalho de engenharia executável localmente é o defeito aberto **“CRM — importação CSV com resultado desconhecido na interface e totais ambíguos —10/10/2026”**. É feedback real de uso, independente das rotações adiadas e do aceite com envio. Não reabrir polling de campanhas já corrigido, out.15 ou o incidente Arlindo/SECULT encerrado.

## Próxima entrega concreta: contrato de resultado da importação CRM

A leitura delimitada do código atual confirma:

- `src/app/app/crm/page.tsx`, `runConfirm`: resposta perdida cai no erro genérico “Não foi possível importar o CSV.” e libera o estado loading; não demonstra falha/cancelamento da operação no servidor.
- `src/lib/appClientApi.ts`, `confirmAppCrmContactCsvImport`: POST `/app/crm/contacts/import/confirm`, payload atual csvText/mapping, usando o request canônico e seu timeout padrão.
- `apps/whatsapp-agent/src/http/routes.ts`: rotas inspect/preview/confirm com escopo do tenant, capability e RBAC; confirmação chama `confirmCrmContactCsvImport`.
- `apps/whatsapp-agent/src/crm/crmContactUpsert.ts`: consumidor efetivo a auditar junto aos recibos/eventos existentes. O estado desta entrega ainda não prova um mecanismo durável de recuperação por operação.

O primeiro incremento é fechar a correlação por operação/tenant e a fonte durável de conclusão existente. Entregar proposta mínima e, dentro do escopo local já registrado no backlog, implementação para distinguir **em processamento / conclusão comprovada / falha comprovada / resultado desconhecido**, recuperando o resumo correto após timeout/reentrada, sem retry cego. Se faltar contrato de persistência, registrar o gap antes de ampliar schema; não criar migration por inferência. Aumentar só o timeout não resolve.

Critérios de aceite já canônicos: fixture sintética993/880/82/31; novos/atualizados/sem alterações reconciliados; amostra200 explicitada; timeout e resposta tardia sem duplicação; resultado parcial/rollback não presumidos; RBAC e outro tenant negados. Totais/listas/paginação precisam usar a mesma entidade/predicados de CRM, com tratamento explícito de excluídos/anonimizados. Nenhum CSV real de tenant será reimportado para testar.

## Reuso da correção Prisma concluída

[Correção Prisma](security-containment-20261012/cipher-v14-final-20261015/PRISMA_LOCAL.md): **LOCAL VALIDATED / NOT DEPLOYED**,42 testes distintos +typecheck PASS, laboratório encerrado. Não repetir suíte, restore ou build sem alteração que justifique.

Reutilizar o delta `privacyRetentionService.ts`/`conversationRetention.ts`, suas provas e contratos como invariantes de não regressão: proteção humano/fila/handoff, alvos por conversa, preservação de identidade compartilhada e relacionados ambíguos, CAS/concorrência e prévia sem escrita. Contact/CCI/Lead não são removidos por essa retenção de conversa: não transpor seu predicado para contagem de contatos nem tratar conversa anonimizada como autorização de anonimizar todo titular. Operação explícita por titular mantém contrato separado.

Antes de qualquer proposta futura de implantação seletiva, delimitar o delta frente à API NEWauth+NEWDB+NEWcipher e seus consumidores; a existência das42 provas não autoriza substituir o runtime ativo por fontes antigas. Isso é preparação de revisão, não bloqueio para auditar/corrigir CSV localmente. Retenção continua sem execução: nem `retention:run`, nem `--dry-run`, nem `.env`/NEWDB para reabilitar o cron. Políticas dos tenants preservadas.

## Estado e limites

O checkpoint inicial abaixo foi sucedido pela implementação CSV local e provas vinculadas acima. O defeito permanece sem correção produtiva/aceite visual. Nenhum deploy, SQL produtivo, acesso à VPS, `.env`, reativação de retenção, mensagem ou abertura da guarda. Não foi gerada nova preparação de janela, backup ou execução dos pacotes externos. NEWauth+NEWDB+NEWcipher/reader, ambos crons, produção e out.15 CLOSED preservados. Próxima entrega local: contrato/delta CSV e provas dirigidas para revisão, separado de eventual autorização produtiva.
