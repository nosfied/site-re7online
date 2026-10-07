# Agrupamento — auditoria e roteiro mínimo, 07/10/2026

**AUDIT / PREPARATION ONLY — NOT EXERCISED IN PRODUCTION.** Referências da composição atual: API/worker mínimo afbb, frontend9f. Nesta rodada houve somente leitura de contratos, fontes e provas existentes; nenhuma nova leitura produtiva, criação, importação, envio, configuração, build ou teste. Identidades, históricos e aceites anteriores preservados.

## Variante pendente e mínimo real

Pendente: criação pela interface e execução produtiva de um conjunto estático com mais de um filho, snapshot confirmado, variáveis por destinatário, execução sequencial pela fila do tenant e resultado agregado consistente com cada filho. Modalidade recomendada: **Importação CSV, imediata**, para controlar explicitamente público/variáveis e manter audiência dinâmica e agendamento separados. CRM estático agrupado constitui outra origem a validar; manual/avulso não fornece agrupamento nesta interface.

`campaignCsvBatch.ts::createCsvCampaignBatch` divide acceptedRows em blocos fixos de1.000. `routes.ts` cria conjunto para CSV acima de1.000 elegíveis (ou flag grouped explícita no backend); `page.tsx::handleCreateDraftFromCsv` não envia flag nem tamanho customizado e confirma conjunto apenas quando ceil(eligible/1000)>1. O split CRM também usa CAMPAIGN_DRAFT_RECIPIENT_LIMIT=1000, e sua opção aparece acima de1.000. Um conjunto forçado de um filho não comprova transição entre lotes; não usar API/script para contornar a interface.

**Mínimo completo:1.001 identidades canônicas únicas elegíveis, dois filhos1.000+1, até1.001 submissões Meta, uma por destinatário se todos continuarem elegíveis e forem aceitos.** Menos envios por bloqueio/falha não comprova execução completa dos dois lotes. Importar1.001 linhas repetindo um celular não serve: o contrato consolida duplicatas/aliases antes do split. Não usar números inventados, contatos de terceiros sem autorização, opt-outs ou bloqueios artificiais para reduzir envio. Com os poucos celulares dos aceites anteriores, falta um público controlado autorizado de tamanho suficiente; nenhum teste produtivo está pronto para execução.

## Componentes/contratos consultados

- `docs/saas/CAMPAIGN_IMPORT_REQUIREMENTS.md`: prévia, first valid occurrence, identidade canônica tenant-scoped, campos ausentes preservados, opt-out/erros reais e relatório de importação.
- `CAMPAIGN_COMPOSER_LIFECYCLE.md`, `DYNAMIC_CRM_FILTER_CAMPAIGN_SCHEDULING.md`, Result Truth canônico e checklist Utility CRA-PR: rascunho separado de envio, público estático versus snapshot dinâmico, submissão distinta de entrega.
- `campaignCsvBatch.ts`: plano validado único, transaction/idempotency fingerprint, vínculos batch/chunkIndex, seed privado e variáveis por filho, returnDestination comum. Criação agrupada adia upsert CRM até execução; não apresentar persistência do rascunho como conclusão do upsert.
- `routes.ts`: criação CSV agrupada, split CRM, ações execution-batches e payload de detalhe. `campaignExecutionQueue.ts`/`campaignRunner.ts`: fila exclusiva por tenant, continuidade/ordem chunkIndex, revalidação de identidade/opt-out, ownership/fences, agregado serializado. Nenhuma mudança de status/scheduler proposta.
- `page.tsx`: confirmação de distribuição, Conjunto de campanhas, progressos agregado/filhos, ações do conjunto e polling existente.

Provas reutilizadas, sem reexecução: backlog recuperação26/09 registra smoke UI de3.001 elegíveis em quatro filhos1.000/1.000/1.000/1 (CRM estático, dinâmico e CSV; sem outbound); ações agregadas e recarga verificadas no banco. `campaignBatchReview.test.ts` preserva seeds/variáveis; `campaignRunner.test.ts` cobre snapshot dinâmico3.001 e CSV3.001 com bloqueio posterior de um destinatário:3.000 submissões únicas simuladas, valores nas fronteiras e filhos completed/sentCount/blockedCount coerentes. Providers simulados; não são aceite produtivo. Avulso, CRM estático/imediato, CSV individual/imediato e agendamento individual já aceitos não exercitaram a transição entre filhos.

## Roteiro pela interface — condicionado ao público autorizado

1. Owner define e autoriza1.001 destinatários únicos sob controle/consentimento adequado. Conferir por leitura tenant demo-converta, conta Meta, template aprovado/permitido (data_exame se permanecer adequado), elegibilidade/opt-out, aliases e registros existentes. Registrar baseline privado. Janela fechada não é requisito de agrupamento; se aberta, não afirmar prova de abertura a partir de fechamento.
2. Campanhas → Importação CSV: arquivo de1.001 registros únicos, coluna Contato e variável exigida pelo template. Mapear e gerar prévia; exigir1.001 elegíveis após deduplicação, sem linhas ambíguas ou variáveis faltantes. Preferir omitir campos CRM desnecessários para preservar históricos; conferir alterações propostas. Conferir variáveis distintas nas fronteiras1/1000/1001, sem expor dados no relatório público.
3. Escolher Atendimento Geral/Fila Geral e confirmar criação de conjunto com dois lotes1.000+1. **Não enviar ainda.** Conferir um batchId, dois campaignIds/vínculos chunkIndex1/2, união de seeds exatamente igual à prévia, interseção vazia, variáveis/destino preservados. Nome numerado isoladamente não prova associação.
4. Após conferência e autorização da execução, owner usa Enviar agora pela interface do conjunto. Não agendar, não usar Test-send nem reenviar. Confirmar jobs ligados ao mesmo batch, lote2 iniciado somente após lote1 terminal/liberação, sem execução paralela do tenant. Em falha/resultado incerto, preservar diagnóstico e parar acompanhamento; nenhum retry para fabricar PASS.
5. Detalhe: acompanhar progresso de filhos e conjunto até terminal. Conciliar total1.001 com aceitos/bloqueados/falhas conforme contrato, sem somar entrega a submissão. Agregado deve corresponder aos filhos, não só ao filho aberto. Correlacionar outbounds/tentativas únicos por destinatário, Result Truth e recebimento confirmado separadamente pelo owner. Verificar destino nas seeds; eventual resposta/atendimento é ação adicional explícita, não necessária para provar split.

## Limites e próxima ação

Não propor envio em massa aos clientes para cumprir um aceite técnico. Sem1.001 destinatários autorizados, manter agrupamento produtivo NOT EXERCISED e reutilizar a prova isolada já existente; não mudar chunkSize/configuração nem implantar código para reduzir o limiar. Uma rodada apenas de prévia/criação (zero envios) pode comprovar composição se houver público autorizado, mas não execução entre lotes. Pausa/retomada/cancelamento, falha/parcial, agrupamento CRM, audiência dinâmica, contingência Auto e CRA-PR permanecem separados. Nenhuma campanha foi preparada ou enviada nesta auditoria.


## Consulta dirigida CRA-PR — 07/10, 10:57:11 Fortaleza

Tenant exato `cra-pr`, Conselho Regional de Administração do Paraná, ACTIVE. Auditoria PostgreSQL somente leitura, statement_timeout10s/lock_timeout2s e timeout externo18s, sem mensagens ou mutações. Dados completos da consulta ficam privados.

| Registro atual | Resultado |
|---|---|
| Campaign | 0 |
| CampaignExecutionBatch / vínculos de filhos | 0 / 0 |
| CampaignExecutionJob | 0 |
| Eventos `campaign.%` | 0 |
| Outbounds existentes | 769TEXT e1AUDIO, todos WEB_SESSION/SENT; nenhum TEMPLATE ou Meta na agregação |

Não há evidência persistida atual de campanha enviada pela CRA-PR neste sistema, e **não atende à verificação de agrupamento**: nenhum conjunto, filho ou execução entre lotes para correlacionar. Mensagens de atendimento/automação Web não são campanhas e não provam agrupamento. Os registros de outbound disponíveis vão de04/09 a07/10; não afirmar que nunca houve campanha fora desta base, em outro sistema ou em históricos eventualmente removidos. Não houve pesquisa em arquivos externos/backups nem auditoria geral de retenção. Aceite CRA-PR e agrupamento permanecem pendentes; nenhuma necessidade de repetir envio foi criada por esta consulta.


## Decisão do owner — acompanhamento natural

Aguardar execução natural autorizada pelo próprio tenant. Não obter1.001 destinatários nem provocar envio para encerrar aceite técnico. Quando o owner indicar um caso concreto, consultar baseline/snapshot, batchId e filhos, ordem dos lotes, variáveis, destinatários canônicos únicos, submissões e consolidação por filho/conjunto. Separar recebimento de aceitação do provider e registrar exclusões/falhas. Qualquer ajuste exige evidência e auditoria prévia; não mudar limite/configuração por conveniência. Até lá, agrupamento produtivo permanece NOT EXERCISED.
