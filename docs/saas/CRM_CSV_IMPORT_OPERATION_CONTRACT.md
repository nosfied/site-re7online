# Importação CSV CRM: operação, recuperação e contagens

Estado: **LOCAL VALIDATED / FOR REVIEW / NOT DEPLOYED**, 15/10/2026. [Entrega e provas](../reviews/automation-freeform-window-release-af26/crm-csv-operation-20261015/REPORT.md). Complementa os contratos existentes de identidade, upsert, auditoria, exclusão operacional e anonimização; não altera retenção por conversa ou operação explícita por titular.

## Lacuna auditada e persistência

O consumidor anterior só emitia o resumo ao final; não havia admissão durável por operação nem resultado de linha atômico com a gravação. O timeout HTTP de 10s podia perder a resposta sem cancelar o trabalho. O evento final isolado não demonstrava ausência de commit parcial e não permitia recuperar progresso com segurança.

A correção reutiliza Event e sua unicidade clientId/eventName/requestId, sem schema ou migration. Cinco eventos de controle registram started, classified, row, finished e uncertain. A admissão utiliza lock transacional por tenant. A linha e seu resultado/auditoria são gravados na mesma transação. O resumo e o terminal são gravados juntos. Eventos legados não são reconstruídos nem correlacionados por telefone/horário. Os cinco nomes exatos passam à classificação CRITICAL no código local para não serem removidos automaticamente pelo compactador operacional; o evento summary mantém sua classificação anterior. Esta proposta não executa retenção nem modifica políticas produtivas dos tenants.

O recibo de recuperação guarda contadores e até 200 motivos/números de linha, sem copiar nome, telefone ou CSV. O hash da entrada vincula conteúdo e mapping; não é proteção para publicação de dados. O corpo original não fica no localStorage: somente UUID, com chave por Base URL, tenant e usuário. O registro de auditoria canônico de criação de contato permanece preservado.

## Admissão e consulta

- POST /app/crm/contacts/import/confirm exige operationId UUIDv4, CSV e mapping. Gerar e preservar a referência antes do envio.
- GET /app/crm/contacts/import/operations/:operationId consulta apenas o tenant autenticado. Mesmos capability, tenant ativo e RBAC supervisor/admin da importação. Agentes não recebem acesso ao resumo. Operação não observada, inclusive de outro tenant, devolve UNKNOWN sem dados.
- Mesmo UUID e mesma entrada: consulta o estado, sem repetir linhas. Mesmo UUID com entrada divergente: 409. Outra operação não encerrada no tenant: 409 com sua referência. Concorrência na admissão: 409, sem replay automático.
- COMPLETED: resumo terminal durável, inclusive se a resposta do commit se perder. Significa processamento encerrado, não que todas as linhas eram válidas/sucesso.
- FAILED: validação recusada antes de classificação/gravação de linhas, comprovada e registrada. Não usado para exceção genérica ou timeout.
- PROCESSING: admissão/progresso observado recentemente; não é heartbeat ou garantia de liveness. Após 120s sem evidência nova, ou incerteza explícita, UNKNOWN.
- UNKNOWN: resultado não comprovado. Pode haver commits parciais ou totais. Não presume rollback, não retoma, não reenfileira e não libera nova operação automaticamente.

Reentrada consulta o mesmo UUID e recupera o resumo. Respostas antigas não substituem terminal nem progresso maior. Polling GET a cada 2s, limitado por ciclo; consulta manual disponível. Fechar acompanhamento não cancela o servidor. Uma operação não resolvida exige inspeção/decisão explícita futura, fora desta correção. Não existe endpoint de apagar intent ou retomar lote parcial. A referência só pode ser descartada pelo fluxo normal após terminal.

## Reconciliação

Linhas são registros de dados interpretados pelo parser canônico, excluindo cabeçalho, não número de quebras de linha físicas. Categorias da classificação são exclusivas: elegíveis, telefone inválido, situação inválida, duplicadas no arquivo, excluídas, provisórias e conflito de identidade. Elegíveis = novos + existentes; existentes = atualizações previstas + sem alterações previstas. Prévia é observação, não promessa de resultado sob concorrência.

No processamento concluído, resultados reais distinguem novos, atualizados, sem alterações, rejeições revalidadas e falhas. Mudança de exclusão/identidade após classificação pode mover uma linha inicialmente elegível para rejeitada; o resumo usa os contadores reais. Nunca somar subtotal existentes novamente. Em parcial UNKNOWN, mostrar classificação e resultados de linhas efetivamente registrados, sem fabricar resumo terminal.

Prova sintética: 993 = 880 elegíveis + 82 inválidas + 31 duplicadas; 880 = 879 novos + 1 atualizado; uma nova importação explicitamente distinta reconhece 880 sem alterações. A prévia identifica amostra de até 200 linhas elegíveis e não limita a execução a essa amostra.

## Total, filtro e página

A entidade de listagem é a projeção CRM de Lead, com os mesmos predicados de identidade, exclusão e anonimização dos itens. Não é a contagem bruta de Contact, de mensagens ou de conversas. Uma conversa anonimizada não implica anonimizar todo o titular.

A resposta distingue totals.tenantVisible (total no escopo operacional permitido, ativo ou excluído), totals.filtered e totals.pageCount. Filtros de busca não reduzem o primeiro; RBAC e escopo operacional o restringem. Para agente o escopo é ativo, sem contagem extra de excluídos. Anonimizados permanecem ocultos pelo contrato atual. Uma página vazia preserva o total filtrado correto.

A projeção percorre lotes de 500 candidatos no mesmo snapshot RepeatableRead, sem tratar o prefixo de até 4.000 como universo. Timeout de transação 15s; erros não publicam total parcial como exato. O custo de consultas exatas para bases maiores exige avaliação antes de implantação; 4.105 registros sintéticos não certificam carga produtiva.

## Revisão e implantação futura

API e interface exigem revisão coordenada: clientes antigos sem operationId passam a receber 400. Não há compatibilidade implícita para replay de POST legado. Orçar armazenamento dos recibos por linha e revisar sua disposição antes de uma política futura de expurgo. Não adicionar cron automático.

Ensaios locais incluem PostgreSQL real isolado, HTTP autenticado sintético, cliente HTTP com AbortController e [revisão Chrome com API real](../reviews/automation-freeform-window-release-af26/crm-csv-operation-20261015/BROWSER_REVIEW.md). Não incluem implantação, CSV real ou reparo histórico. O plano seletivo de compatibilidade com API ativa NEWauth+NEWDB+NEWcipher permanece gate futuro. [Runbook](../RUNBOOK_WHATSAPP_AGENT.md) e [backlog](../BACKLOG_TECH.md) mantêm limites operacionais.

## Complemento de revisão de navegador

Ao recuperar COMPLETED por GET, aplicar o mesmo reconhecimento de conclusão do POST e atualizar a lista uma vez por operação; falha na lista não altera o terminal. Exibir a referência e distinguir operation_not_observed de falha/ausência comprovada de gravações. Fechar/reabrir e recarregar não submetem CSV. UNKNOWN não permite preparar outra importação automaticamente.

A [matriz de publicação coordenada](../reviews/automation-freeform-window-release-af26/crm-csv-operation-20261015/COORDINATED_PUBLICATION.md) é obrigatória: API nova integral antes do frontend novo, sem tráfego misto para API antiga. Abas antigas sem UUID recebem400 sem gravação e requerem recarga explícita; não exige logout. Interface nova/API antiga é combinação proibida, pois a API antiga pode ignorar o UUID. Não existe handshake ou controle de rollout implantado por esta correção. Retorno deve preservar o contrato ou suspender confirmações.
