# Audiência dinâmica: continuidade out.13 → out.14 → out.15

**AUDIENCE NOT ACCEPTED / LOCAL CORRECTIONS VALIDATED / NOT DEPLOYED.** Base auditada `207880593e6f32a1628df0a15df2b1fa80b49e4e`, branch de revisão. Leituras produtivas delimitadas; nenhuma submissão, replay, alteração de dados, abertura, retomada ou controle de processo produtivo. A confirmação de lista/detalhe/polling aceita Result Truth no alcance dos resultados conhecidos; não aceita a legitimidade da audiência.

## Conclusão sustentada

Os 11 vieram de **Novo / NEW**, salvo desde o primeiro seed da out.15, e não de Nutrir nem de Follow-up. O snapshot encontrou 255 Leads NEW; o predicado de campanha selecionou 11 identidades e bloqueou 244. Os mesmos 255 IDs já eram NEW no backup de 08/10, anterior à criação da out.15. Não há evidência de que o público cresceu de uma pessoa para 11 após o agendamento.

Os 11 correspondem ao filtro persistido, por identidade completa e aliases brasileiros aprovados. **Sete têm Contact PROVISIONAL**, enquanto o leitor CRM canônico exclui Contact não ACTIVE da operação. O materializador não consultava lifecycle: defeito reproduzido, distinto dos marcadores anonimizados da out.13. Apenas quatro passam o contrato operacional existente nessa composição: três ACTIVE e um Lead legado sem Contact. Esses quatro não constituem autorização de quatro destinatários para o teste individual.

Nenhum dos 11 coincide com o destinatário válido original da out.13 ou da out.14. A intenção do owner era uma pessoa; portanto a audiência histórica não recebeu aceite. O owner não recorda filtro/estimativa. Não existe captura da estimativa original: não é possível decidir por que NEW foi escolhido, nem atribuir ao bug local de prévia a escolha histórica.

## Campanhas diferentes e sequência original

Tenant `demo-converta`, ID `10a98bf4-1587-43e8-83d4-e3a48c5d79d9`. IDs provêm das linhas/eventos originais, não de nomes ou sufixos.

| Caso | Controlador / filho / lote | Filtro e população | Horários UTC / Fortaleza |
|---|---|---|---|
| out.13 | `1d7be01c-7545-493d-9be2-e14de005ac5c` / `09f1a742-d42d-4325-9b36-cf8e57650e9a` / `5a92945c-d235-47bd-b9c7-eb00f6a7d98a` | NURTURE/Nutrir; 6 selecionados: um válido e cinco anonimizados/excluídos | criação08/10 10:40:25.473 /07:40:25.473; previsto10:49 /07:49; snapshot10:49:08.131 /07:49:08.131 |
| out.14 | `44a209f2-fad6-4de5-8521-cd8ab07ae7b0` / `2ee0c590-69fa-4ecd-91f8-3633e7824c18` / `df8e7e5b-75dd-4381-93c9-488ec114744c` | FOLLOW_UP/Follow-up; um elegível | criação08/10 10:44:18.141 /07:44:18.141; previsto10:53 /07:53; snapshot09/10 01:04:20.173 /08/10 22:04:20.173 após abertura autorizada |
| out.15 | `b019039e-0a89-4a42-9f33-c214323b888f` / `94b5805b-5c6d-4c89-b047-959209261c21` / `d473aec1-8ffa-40b9-8bab-e6819153ae4c` | NEW/Novo; 255 correspondências, 11 selecionados, 244 bloqueados | criação09/10 15:51:00.131 /12:51:00.131; previsto10/10 15:40 /12:40; snapshot15:40:24.733 /12:40:24.733 |

Duas gravações de seed por criação preservam o mesmo filtro em cada campanha; não demonstram alterações entre Nutrir, Follow-up e Novo na mesma campanha. out.15: seeds `c98fe3a5-a24d-4fed-ba80-fe20f28e35d4` e `4d5006e3-bdf8-4aeb-a456-f3c3b8733c7d` às15:51:00.154/.359UTC; evento de agendamento `b9e2a423-a0c2-454d-9821-8144b81659b8` às.372 confirma NEW. Snapshot `a3429d22-11b2-490b-abc3-67c2fe436875`; seed do filho `7cdbc3c9-3cce-4429-8aa9-1524636a561c` às15:40:24.831 preserva exatamente as 11 identidades, ordem e componentes.

Template `data_exame`, parâmetro out.15 `24/06/2028`; out.13 `21/01/2027`, out.14 `22/01/2027`. Destino salvo Atendimento Geral/Fila Geral em todos, IDs `cmsiwk1o100014sdzl5cqd2ki` / `cmsiyb2k200n94sdpu5khkee0`. Nenhum desses destinos restringe a audiência a um contato.

A correção implantada após out.13 rejeita marcadores antes de extrair dígitos. Na out.15 isso funcionou: **240 anonymized_contact +3 non_whatsapp_channel +1 operationally_excluded_contact**. Não se trata de repetição da mesma falha dos cinco pseudo-destinatários. out.13 permanece reconciliada: um SENT, um FAILED/131026 e quatro bloqueados; out.14 permanece concluída com recebimento confirmado.

## Proveniência de cada posição

Números completos, aliases, linhas e componentes permanecem exclusivamente na evidência privada. [AUDIENCE_PROVENANCE.json](AUDIENCE_PROVENANCE.json) publica IDs, hashes das referências, fontes e limites por posição. A origem abaixo é a origem demonstrável do registro, não inferência de consentimento.

| Posição | Lead exato | Criação UTC | Fonte original correlacionada | Contact no backup | Critério operacional |
|---|---|---|---|---|---|
| .1 | `cmuws9t0403pz4sl5cu9dppu8` | 2026-10-06T14:38:04.564Z | campanha 816eaae0-e7a4-4cbb-a542-3fca73a6262c | ACTIVE | ACTIVE_CONTACT_ELIGIBLE |
| .2 | `cmuybtgt90mu84sl50cxx53nr` | 2026-10-07T16:33:00.765Z | inbound 966214df-4207-4a94-9a2d-024b3b5b1e56 | NO_CONTACT_LEGACY | LEGACY_MISSING_CONTACT_ALLOWED |
| .3 | `cmta3em4w009z4s3ownao2xu6` | 2026-08-26T12:51:20.336Z | inbound 369bc1c2-3c64-40c2-81d8-5ac412a83d2e | PROVISIONAL | INELIGIBLE_PROVISIONAL |
| .4 | `cmur1p6d00xbk4smrgol5abr8` | 2026-10-02T14:15:21.204Z | campanha fa6c1419-3938-4266-902b-ea5085fe2e22 | ACTIVE | ACTIVE_CONTACT_ELIGIBLE |
| .5 | `cmur1p1nk0xay4smrvic75lo7` | 2026-10-02T14:15:15.104Z | campanha fa6c1419-3938-4266-902b-ea5085fe2e22 | ACTIVE | ACTIVE_CONTACT_ELIGIBLE |
| .6 | `cmtdnrwpm004f4s7dv099zziv` | 2026-08-29T00:44:51.418Z | inbound 9b8ee78e-c375-4b9b-bf7e-e5a7016abcfb | PROVISIONAL | INELIGIBLE_PROVISIONAL |
| .7 | `cmtap93na02nh4s8l6tawitw6` | 2026-08-26T23:02:54.646Z | inbound 591bc3e4-1970-41aa-a836-e0443ad4727d | PROVISIONAL | INELIGIBLE_PROVISIONAL |
| .8 | `cmtai721c010h4s8lm2n476zi` | 2026-08-26T19:45:21.936Z | inbound 440801cb-0727-4780-9abc-f23a39eaea05 | PROVISIONAL | INELIGIBLE_PROVISIONAL |
| .9 | `cmtaloe3p01rj4s8l4ttszc86` | 2026-08-26T21:22:49.573Z | inbound 8274a422-cbab-474b-bf78-24cf7b0280ea | PROVISIONAL | INELIGIBLE_PROVISIONAL |
| .10 | `cmtafhcdw00av4s8lu0xdosmx` | 2026-08-26T18:29:23.060Z | inbound 0631100b-d628-459a-937c-077cce65235e | PROVISIONAL | INELIGIBLE_PROVISIONAL |
| .11 | `cmt8sfqw500gv4sag0x3vb7lo` | 2026-08-25T14:56:31.205Z | inbound d36d2067-f24d-4a57-ab25-76c4c2176e36 | PROVISIONAL | INELIGIBLE_PROVISIONAL |

Todos têm status NEW no backup verificado de08/10 14:58:31.420UTC /11:58:31.420Fortaleza e no leitor atual. Snapshot conserva identidades, não lifecycle/LeadID elegível. O mapeamento encontrou um único Lead por identidade completa no tenant, sem duplicação entre os aliases dos 11. .1/.4/.5 provêm de bootstrap de campanhas anteriores; .2 e .3/.6–.11 têm inbound original identificado. .3 possui também associação CRM de05/10, sem mudar sua criação original em agosto.

**Limites temporais:** .1–.5 têm atualizações posteriores ao snapshot; backup, seed original e duas âncoras corroboram a associação, mas não existe histórico completo de cada edição de status/lifecycle entre âncoras. .6–.11 mantêm atualização anterior ao snapshot, corroborando diretamente o estado histórico. Em .2 não havia Contact no backup; o Contact ACTIVE atual foi criado em10/10 15:40:28.810UTC, depois do snapshot. Não usamos esse ACTIVE posterior como prova de elegibilidade anterior: o contrato CRM admite Lead legado sem Contact. Ausência de opt-out registrado não comprova autorização humana ou consentimento.

**.3 e .6 foram submetidos antes da suspensão apesar de PROVISIONAL.** Seus resultados conhecidos continuam preservados. .7–.11 são PROVISIONAL e não têm submissão observada. Esta auditoria não modifica o snapshot, bloqueia linhas históricas, subtrai resultados nem decide a disposição do job.

A identidade internacional da .6 e a divergência entre normalizador E.164 de campanha e resolvedor CRM brasileiro continuam uma frente separada. O patch não amplia suporte internacional nem altera resolvedores globais. Não afirmamos paridade universal para um futuro Contact internacional ACTIVE.

## Contratos, predicados e pontos de decisão

- [CRM canônico](../../../../apps/whatsapp-agent/src/crm/crmContactsReadModel.ts): `buildCrmContactsReadModel` considera `!contact || isOperationalContactLifecycle(contact.lifecycle)`; `getOperationalCrmContactByLeadId` nega Contact não operacional. [Lifecycle](../../../../apps/whatsapp-agent/src/contacts/contactLifecycle.ts) já define ACTIVE como único operacional.
- [Prévia](../../../../apps/whatsapp-agent/src/campaigns/campaignAudiencePreview.ts) usa o leitor CRM operacional, mantendo filtros/tenant e opt-out.
- [Runner](../../../../apps/whatsapp-agent/src/campaigns/campaignRunner.ts): os dois materializadores dinâmicos consultam Leads por status e passam no shared `campaignRecipientEligibility`; o mesmo gate volta a executar imediatamente antes do provider. Snapshot é imutável. Variante agrupada analisa até5000; variante legada standalone até1000, com negativas de overflow, não truncamento.
- [Eligibility](../../../../apps/whatsapp-agent/src/campaigns/campaignEligibility.ts) já verificava identidade, anonimização, exclusão, canal e opt-out, mas não lifecycle dos Contacts encontrados pelos candidatos existentes.
- [Composer](../../../../src/app/app/campaigns/page.tsx): editar filtro/modalidade não invalidava a prévia nem sua geração; a tela podia conservar a estimativa de outro filtro e aceitar resposta atrasada. O seed dinâmico persiste só o filtro, não a população da estimativa; recipientCount/summary0 inicial é placeholder, não uma prova da estimativa mostrada.

Leitura atual real em12/10 **11:58:36.256UTC /08:58:36.256Fortaleza**: NEW prévia4elegíveis/analyzed193, CRM7visíveis (quatroWhatsApp e trêsoutros canais); Nutrir1 e Follow-up1. `analyzed` é projeção do leitor pós-filtragem, não matched255 histórico. Esta leitura não reconstrói a tela original. Ledger consistente antes/depois, queryexit0, API/worker/frontend preservados. Não houve chamada ao provider, import de entrypoint, scheduler ou recuperação.

## Menor delta local

1. Gate compartilhado seleciona lifecycle na consulta Contact existente e reaproveita `isOperationalContactLifecycle`. Contact não ACTIVE recebe `provisional_contact`, após exclusão e antes do opt-out. Sem nova consulta, normalização, regra de nono dígito ou limite artificial de um destinatário. O label existente dos bloqueios recebe “Contato pendente de consentimento”.
2. Edição humana do filtro/modalidade invalida a geração existente da prévia, limpa estimativa/erro/página e loading. Reuso/reset programáticos mantêm seus limites explícitos e seleções restauradas. Sem novo timer/cache/estado de execução. Estimativa zero continua permitida para agendamento dinâmico após prévia válida.

São três arquivos de produto: Eligibility, label de routes e composer. A elegibilidade compartilhada cobre Audiência CRM estática/dinâmica e revalidação do runner usado pelas três modalidades; manual e CSV mantêm seu contrato já existente de importação/lifecycle. **Não se atribui uma suíte nova de todas as modalidades a esta prova dirigida.** Worker mínimo não executa esse grafo de campanha; sem backport, alteração de worker, dependências, schema ou migration. Aceitação antes do CRM, webhook/status monotônico e Result Truth permanecem intactos.

## Provas novas, distintas das reutilizadas

| Prova | Resultado e alcance |
|---|---|
| PostgreSQL sintético, leitor CRM/prévia + materializador real compilado Node20 | PASS:255matched →4elegíveis/251bloqueados;7PROVISIONAL+240anon+3canal+1excluído. Igualdade de identidades preview→snapshot, isolamento, aliases BR e gate de snapshot antigo. Hook existente interrompe depois do snapshot: zero filhos/Outbounds/provider; não prova envio ou recuperação |
| Mesma composição com Eligibility ativo original hash conferido | FAIL esperado determinístico:11 em vez de4. Apenas o módulo original foi substituído no laboratório; prova da omissão de lifecycle |
| Chrome, frontend3227 exato original + APIs simuladas | Defeito reproduzido: estimativa FOLLOW_UP retida ao selecionar NEW e resposta atrasada aceita. Não prova que ocorreu na criação da out.15 |
| Chrome, novo build local Node20, APIs simuladas | Seis PASS: invalidação, nova estimativa11sem cap1, resposta antiga ignorada, payload salvo corresponde ao filtro, troca de modo, zero válido agendável. POSTs somente rascunho/agendamento sintéticos; zero send/claim/pause/resume/provider |
| Compilação API + build frontend Node20.20.0 | PASS exit0; CSS/HTML/JS e estilos calculados PASS. Nenhum pacote operacional preparado ou copiado |

A primeira fixture local sem evento controller tomou caminho legado diferente e falhou; não recebe PASS. Foi corrigida para a cadeia real batch/controller e o defeito foi reprovado deterministicamente. Logs originais preservados. Receita de build local inicialmente sem tailwind.config.js falhou no detector de estilos; build final reutiliza o arquivo original atestado e passou. Diagnósticos de sandbox/receita também preservados; não equivalem a defeito produtivo novo.

Provas anteriores de aliases, privacidade, opt-out, RBAC, Result Truth, horários e worker são reutilizadas com seus limites; não foram executadas novamente nem atribuídas ao novo cenário. [PATCH_MANIFEST.json](PATCH_MANIFEST.json) fixa fontes, compilados originais/novos, build local e tar3227 original preservado. [minimal.patch](minimal.patch) contém somente o delta de produto, sem contexto (`git apply --unidiff-zero --check` sobre a base auditada antes de aplicar). [RESULTS.json](RESULTS.json) separa resultados de laboratório e produção; [PRIVATE_EVIDENCE_SHA256.json](PRIVATE_EVIDENCE_SHA256.json) conserva hashes, não conteúdo privado.

## Reprodução e leituras

Teste dirigido: `apps/whatsapp-agent/src/campaigns/campaignAudienceLifecycleParity.test.ts`. Usar PostgreSQL exclusivamente local com banco cujo nome começa `re7_dynamic_parity_`, schema sintético e `DATABASE_URL`127.0.0.1; a prova nega outra origem. Compilar pela tsconfig da API e executar em Node20.20.0 o teste compilado com `--test`. O suporte de teste isola ledger/guarda local. Não usar DB produtivo nem entrypoint.

Browser: `node tests/browser/campaignDynamicAudienceBoundary.mjs http://127.0.0.1:PORTA_LOCAL`, com o build local servido pelo Next em127.0.0.1 e Chrome/CDP isolado. O driver intercepta APIs, usa ADMIN sintético e captura estilos/rede; o terceiro argumento `before` seleciona a reprodução negativa. Consultar os parâmetros reais no driver antes de executar. Esses comandos não são roteiro de implantação.

Leitores `query-*.cjs` publicados são os bytes das consultas desta auditoria, ligados por hash às evidências privadas. Usam READ ONLY/RepeatableRead/timeouts/limites e IDs explícitos. O capturador vigente recebe o código por stdin, remove credenciais herdadas e usa a configuração legítima da API; saída integral fica privada. Não executar consultas diretamente com configs improvisadas. Primeira conexão SSH incompleta teve saída vazia, não PASS; leitura posterior limitada foi preservada sem alteração produtiva. Consultas originais não certificam drain nem estado futuro.

## Estado preservado e menor próximo passo

API Result Truth sobre preventiva `2ed9dccc`, routes.js ativo `0118b7d3…`; workerafbb e frontend3227/BUILD_ID `8OqIZZxaW7_ogf6h7AVoe` continuam ativos. Guarda fechada38/tasks{}, sem lock/.uncertain; ledger `9e1a9799…` igual nas capturas. Job `1eb96f7f-50ae-4d5e-9124-411923945efb` queued/attempt1/operational_suspension/semlease, lote running; recibo/disposição histórica.6 intactos, seis Outbounds SENT com delivered reportado e cinco posições sem submissão. [Registro de implantação](../result-truth-api-prepared-20261011/DEPLOYMENT_2026-10-11.md) conserva aceite dos contadores, com esta ressalva vinculada.

**“Enviando” deriva do status persistido sending. Não significa executor ativo, fila liberada, público aceito nem permissão de retomada.** Mostrar suspensão operacional de forma explícita exige revisão UX separada; não alteramos status para resolver apresentação.

Próximo passo: revisão destes dois deltas locais e decisão separada sobre a audiência/disposição do job congelado. Não retomar as cinco posições automaticamente após eventual correção. Histórico e snapshot não devem ser reconstruídos para obter um destinatário. Não há autorização nesta tarefa para deploy, abertura, nova reconciliação ou reenvio. Recuperação.6/setembro CLOSED e frontend3227 concluído; CSV/Syer, suporte internacional, CRA-PR, multilote e contingência AUTO naturais permanecem separados.
