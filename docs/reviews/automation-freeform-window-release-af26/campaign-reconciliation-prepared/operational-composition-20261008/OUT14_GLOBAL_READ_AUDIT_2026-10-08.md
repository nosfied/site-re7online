# Owner confirmado; out.14 e fila global — somente leitura

**DEPLOYED TECHNICALLY / OWNER SCREENS READ PASS / FUNCTIONAL EXECUTION PENDING. GUARDA FECHADA35 / OPENING REVIEW REQUIRED.** Owner confirmou sessão/Inbox/CRM/Campanhas após a implantação. Essa confirmação não comprova envio/execução da correção nem autoriza abertura. APIa26dbb0e, mesmo workerafbb e frontendfa60 preservados; nenhuma parada, provider, reconciliação, acknowledgement, reprocessamento ou alteração de campanha/configuração.

## Público atual e plano salvo

Consulta PostgreSQL09/10/2026 **00:42:25Z = 08/10/2026 21:42:25 Fortaleza**, transação RepeatableRead/read-only, statement timeout10s/timeout transação45s. Limites de inventário/audiência1000 negam excesso; sem truncamento nesta consulta.

- Tenant demo-converta `10a98bf4-1587-43e8-83d4-e3a48c5d79d9`; controlador out.14 `44a209f2-fad6-4de5-8521-cd8ab07ae7b0`, lote `df8e7e5b-75dd-4381-93c9-488ec114744c`, job `21c5b452-1eed-4229-a3dc-78aea84733fb`.
- Modo `DYNAMIC_CRM_FILTER`; situação **FOLLOW_UP / Follow-up**, ativa/campaignEligible na configuração DB do próprio tenant. Não é o filtro NURTURE/Nutrir da out.13 reconciliada.
- **1 Lead correspondente / 1 elegível, final4366 / 0 bloqueados / 0 duplicados removidos.** Não anonimizado, não excluído, sem opt-out ativo e identidade WhatsApp válida no resolvedor existente. Valores/IDs e números completos ficam apenas na evidência privada.
- Estimativa pelo `buildCampaignAudiencePreviewPayload`, resolução dinâmica do rascunho e seleção do materializador corrigido concordam na mesma população canônica; não apenas na contagem. Componentes gerados contêm a variável obrigatória1 = **22/01/2027**. Sem variável faltante ou mudança do valor.
- Template **data_exame / pt_BR / approved / UTILITY**, mesma tenant/templateId; categoria permitida pela política DB. Meta habilitada para roteamento, credencial configurada pela origem tenant_meta e phoneNumberId igual ao registrado para Demo. Isso não testa validade remota do token nem status online da Meta: nenhum provider foi consultado. Campanhas/templates continuam Meta-only, independentemente da rota Web da conversa.
- Destino salvo e revalidado pelo resolvedor: **human_department → Atendimento Geral / Fila Geral**, departamento ativo/fila pertencente ao próprio departamento/tenant. Não foi alterado.
- Controlador/lote scheduled, job queued, attempt0, leaseToken/leaseOwner/leaseExpiresAt nulos, sem início/conclusão. Horários Campaign.scheduledAt = Batch.eligibleAt = Job.eligibleAt = **08/10/2026 10:53Z / 07:53 Fortaleza**, já vencidos. Não se mudou o horário. `totalRecipients=0/chunkCount=0` ainda são o estado anterior à materialização dinâmica.
- Nenhum snapshot, Outbound ou evento submit_started/provider_accepted ligado à out.14 na consulta. Após eventual abertura, o scheduler poderá reclamá-la no próximo tick natural e resolver o filtro daquele momento; não existe audiência congelada por esta auditoria.

## Identidade e janela históricas

Há **1 Contact, 1 Lead, 1 Conversation** para os aliases consultados. O resolvedor de campanha selecionou exatamente a Conversation existente e sua chave vencedora; sem ambiguidade. Há **2 registros de runtime anteriores**, não dois executores novos: um legado sem canal/conta/status, criado22/09 e atualizado25/09; um runtime WhatsApp/Web, criado05/10, correspondente à chave vencedora e ao atendimento existente. Uma única correspondência runtime↔winningWaId. Não foram fundidos, apagados ou reparados.

O runtime selecionado está WAITING, sem responsável, em Atendimento Geral/Fila Geral. Sua última janela legítima já expirou (lastInbound05/10, windowExpires06/10), assim como a do legado. Os flags históricos windowIsOpen=true **não autorizam janela livre**; o contrato efetivo também exige inbound válido e prazo futuro. Esta auditoria não assume, envia texto ou altera janela/ciclo. Os inbounds e os dados de histórico permanecem preservados.

## Inventário global de todos os tenants

| Tenant | Jobs aguardando | Lotes scheduled | Rascunhos | Leases ativos |
|---|---:|---:|---:|---:|
| cra-pr | 0 | 0 | 0 | 0 |
| demo-converta | 1 | 1 | 0 | 0 |
| demo-prefeitura | 0 | 0 | 0 | 0 |
| justa-advocacia | 0 | 0 | 0 | 0 |
| lab-websession | 0 | 0 | 0 | 0 |
| loadtest-prefeitura | 0 | 0 | 0 | 0 |
| re7online | 0 | 0 | 2 | 0 |
| secult-pe | 0 | 0 | 0 | 0 |
| syer-rodrigues | 0 | 0 | 0 | 0 |
| tendencia-modas | 0 | 0 | 0 | 0 |

Resultado: somente out.14 despachável após abertura global; nenhum job running/paused/outro estado desconhecido observado. re7online tem dois rascunhos sem job/lote agendado: não são execução pendente e esta auditoria não os envia. Existe uma linha histórica de lease no Demo com jobId nulo e expiresAt08/10 10:49Z, já vencida; **zero leases ativos ou pendentes** segundo o consumidor real. Não foi removida.

O inventário passou pelo `preparation-bindings.noWork`/classificador V4 efetivo, que aceita trabalho aguardando scheduled→queued/attempt0/sem lease; não foi usado status inventado. Campo/status inesperado continua negando. O snapshot abrange os dez Clients persistidos, inclusive os nove sem job. Não há promessa sobre novos trabalhos criados depois desta leitura.

## Método e limites da comparação

Reutilizados [contrato de filtro dinâmico](../../../../saas/DYNAMIC_CRM_FILTER_CAMPAIGN_SCHEDULING.md), [importação/identidade](../../../../saas/CAMPAIGN_IMPORT_REQUIREMENTS.md) e [Result Truth](../../../../saas/CAMPAIGN_RESULT_TRUTH_CANONICAL_RECONCILIATION_2026-09-18.md). As descrições históricas de implantação desses documentos não substituem o estado efetivo desta release.

Compilados da API efetivamente ativa em Node20.20.0. Reutilizados `campaignRecipientEligibility`, normalização/candidatos existentes, preview CRM, resolvedores de destino/status/categoria/credenciais/Conversation. Para funções internas, o parser já empacotado extraiu os bytes das declarações reais, sem importar/startar o entrypoint HTTP/scheduler/runner. A seleção de `resolveDynamicCampaignRecipientsForBatch` foi executada **somente até a fronteira anterior a await persistEvent**; o retorno de auditoria inclui elegíveis/bloqueios/variáveis. O snapshot e os consumidores que gravam lotes/jobs **não foram executados**. Não se atribui PASS de materialização durável ou envio a esse resultado.

PostgreSQL impôs READ ONLY; wrapper adicional nega mutadores de modelos e transações/escritas de helpers. Providers não invocados; nenhum contato/runtime/evento criado. Conta/credencial foi conferida em uma segunda transação read-only00:46Z, não uma observação atômica com a seleção. GET autenticado da guarda00:48:37Z comprovou available/drained, generation35/tasks vazias/ledgerFault=false e binding single-host válido, recoveryOnly=false. Identidades/gates falsos/guarda preservados depois das consultas. Reaproveitadas provas anteriores; sem rebuild ou suíte repetida.

Hashes dos compilados/trechos executados, observadores, capturas privadas e resultado: [evidência sanitizada](out14-global-read-result.sanitized.json). Scripts, configurações, tokens, números completos, conteúdos e capturas privadas não estão versionados.

## Próxima decisão

[Procedimento CAS para revisão](OUT14-CAS-OPEN-FOR-REVIEW.txt), **não executado**. Abertura tem alcance global; a população hoje observada é final4366/Follow-up/data_exame/22/01/2027, e out.14 já venceu o horário. Requer revisão/autorização e reconfirmação fresca dos dez tenants/geração35 antes do POST. Mudança de público/template/destino/fila/identidade ou geração interrompe, sem adaptar automaticamente o plano.

Guarda closed35/out.14 intacta. Recibo e reconciliação concluída preservados. Aceite funcional da nova prevenção, agrupamento natural, contingência Auto e CRA-PR continuam separados; aceites anteriores preservados, reparo de setembro CLOSED e históricos intocados.
