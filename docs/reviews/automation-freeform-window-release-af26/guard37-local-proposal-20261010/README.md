# Guarda37 — reprodução local e proposta técnica, 10/10/2026

**Continuidade local sobre85:** [implementação, provas e limites](IMPLEMENTATION_20261010.md). A descrição abaixo preserva a proposta/reprodução histórica. Prevenção agora implementada localmente; verificador/recibo .6 ensaiados, mas nenhum apply/ack/recuperação executado.

**INCIDENT REPRODUCED / PREVENTIVE CHANGE PROPOSED / RECOVERY NOT IMPLEMENTED OR EXECUTED.** Continuidade de `309d865362216997a1ec85b9bbfd5ffb97778a7b`. Nenhum acesso novo à VPS, provider real, retry, ack, abertura, instalação, deploy ou alteração de binding frontend nesta rodada. Guarda37/tarefa permanecem sob as evidências da [auditoria anterior](../guard37-provider-audit-20261010/README.md), não reatestadas como estado atual por este ensaio local.

## Evolução dos contratos — não existe uma decisão global única para internacionais

| Data / commit | Evidência e alcance |
|---|---|
|26/08 — `05dc2e39c0bc94415fbf9a1ee5c8761c7a10ddef`|Criação de `crmWhatsappIdentity`: havia fallback `normalizePossibleInternationalPhone`, 8–15 dígitos. Não confundir código inicial com contrato atual.|
|17/09 — [Canonical Identity P1](../../../saas/CANONICAL_IDENTITY_P1_DELIVERY_2026-09-17.md)|Bootstrap outbound de campanhas passou a reutilizar `resolveCrmContactIdentity`; aliases BR e isolamento canônico, sem segundo motor.|
|19/09 — `1f8304f8624e76ba3efc507b9eccd80060447adb`|Removido explicitamente o fallback internacional do resolvedor CRM; restrições de DDD/assinante adicionadas. P1 e [Campaign Import Requirements](../../../saas/CAMPAIGN_IMPORT_REQUIREMENTS.md#phone-normalization-hardening---2026-09-19) registram rejeição de não-Brasil antes de persistir novo Contact/recipient.|
|25/09 — `5e233a139d6315571019a88dc57295a8cb10e8a4`, `3bcf4261…`, `5f87c6aa311487a57b4d1e42b38a05a8b8a9384d`|Correção DDD55 preservou destinos internacionais no test-send; `normalizeCampaignRunRecipientWaId` passou a preservar `+` e fallback de dígitos no runner/materialização dinâmica. Motivo documentado: corrigir BR sem alterar destinos existentes. [Product Map](../../../saas/PRODUCT_MAP_CURRENT.md) e [Product State](../../../saas/CONVERTA_PRODUCT_STATE_2026-08.md), addenda de 25/09, distinguem CSV tipado, que rejeita internacionais não suportados, de CRM/Inbox baseados em identidades armazenadas. Há teste de rota com `+12025550199` e provider simulado.|
|08/10 — `afc3e5a76bab6f9764c49d1d9af6978bdc9449be`|Nova `campaignEligibility` reúne exclusão/anonimização/opt-out e preserva E.164 não55, inclusive entradas sem `+` já armazenadas. Teste unitário verifica essa preservação. O resolvedor CRM continua brasileiro. A admissão não nasceu em 08/10; a centralização herdou a divergência de 25/09.|

Busca dirigida no histórico desses módulos e nos contratos/relatórios pertinentes **não encontrou decisão que revogue a restrição CRM/importação de 19/09** ou autorize resolver/criar identidades CRM internacionais por outra regra. Os addenda de 25/09 sustentam preservação de transporte para identidades existentes, não expansão geral de CRM/CSV. Essa distinção impede tanto rejeitar silenciosamente todos os internacionais quanto restaurar globalmente o antigo fallback para obter PASS.

## Reprodução executada

[Teste preservado](../../../../apps/whatsapp-agent/src/campaigns/campaignGuard37Incident.test.ts), Node **20.20.0**, PostgreSQL16 real isolado, banco **vazio** `re7_guard37_synthetic_20261010`, schema copiado somente do laboratório sintético existente (sem dados). `fetch` substituído por resposta aceita com MetaID sintético; qualquer chamada inesperada é negada. Não importado entrypoint, iniciados timers de scheduler, runner global ou provider real. O teste invoca uma execução específica do runner e os produtores reais de job/lease/ledger; CRM, persistência e cleanup não são mocks.

- Eligibility admite destino UK sintético de 12 dígitos; resolvedor CRM retorna null.
- Enqueue/claim reais: job running, attempt1, lease; no callback do provider confirma intenção SQL e fase `provider_or_uncertain`.
- **Uma submissão / uma aceitação**, erro **real** `Invalid WhatsApp number`, etapa `crm_materialization`, `retryAllowed=false`; nenhum erro CRM injetado.
- **Zero Outbound/Contact/Lead**, segundo destinatário não submetido; tarefa filha `persisting` com referência/pai, pai removido.
- Guard local geração1 aberta → geração2 fechada por `unfinished_child_requires_review`.
- Job volta a `queued`, attempt1, `operational_suspension`, leaseToken/owner/expiry nulos; Campaign continua `sending`.
- **1 teste PASS, 0 FAIL**, 291.133712ms no subteste / 794.034144ms no TAP, execução às20:58:08UTC/17:58:08Fortaleza. [Resultado sanitizado](RESULTS.json). Não houve segundo start ou retry.

Não é uma reprodução integral dos onze destinatários, nem da chegada do webhook real: o caso mínimo usa dois sintéticos para provar o corte antes do próximo. Entrega da posição .6 continua sustentada exclusivamente pelo webhook já armazenado na auditoria. Produção não recebe PASS por este teste. Os seis módulos causais não têm diff funcional entre build `a26dbb0e` e referência `309d8653`; o teste roda source via tsx, não um novo tar compilado. [Hashes da origem e prova](files.sha256).

## Próximos passos revisáveis

1. [Proposta preventiva mínima](PREVENTIVE_PROPOSAL.md): desacoplar durabilidade do resultado aceito da materialização CRM; não ampliar identidade ou liberar execução depois da falha.
2. [Plano específico da posição .6](RECOVERY_POSITION6.md): contrato de recibo accepted/delivered separado; ainda não é apply/ack executável nem autorização de retomar os cinco restantes.
3. Decisão funcional sobre internacionais CRM fica explícita antes de implementar expansão. Sem schema/migration propostos nesta etapa.

Somente teste do incidente e documentação são publicados. Sem build funcional, pacote operacional novo, reconciliação, alteração de dados produtivos ou bindings frontend. Frontend3227 suspenso. CSV/Syer, CRA-PR, multilote e AUTO continuam separados.
