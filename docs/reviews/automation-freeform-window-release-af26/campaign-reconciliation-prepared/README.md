# Revisão final e preparação offline — 08/10/2026

**POST-ACK PREPARED FOR REVIEW / POLICY NOT INSTALLED / NOT DEPLOYED.** SQL e acknowledgement já concluídos conforme registro anterior. Guarda35 fechada; todos os gates de execução continuam falsos. [Manifesto completo dos três modos](postack-preparation-manifest.json), [prova do agendamento real](waiting-scheduled-proof.json) e [comandos concretos para revisão](POST_ACK_OWNER_STEPS.txt). A autorização desta rodada não inclui instalar política, executar janela ou abrir a guarda.

O [manifesto](artifact-manifest.json) fixa fontes/compilados sobre API afbb e parent afc3e5a7, CLI, overlay, schema/lock e backup. [OWNER-STEPS.txt](OWNER-STEPS.txt) separa comandos de leitura e futuras escritas, retorno e decisão CAS. Não copiar esse roteiro como um único script de execução.

## Consolidação e acknowledgement

O detalhe efetivo já cruza destinatários, Outbound, seed e eventos de bloqueio. Esse resolvedor foi reutilizado no lote e no controlador. Lista de reconciliação usa vínculos explícitos do recibo; paginação que só contém o controlador também encontra o filho. Contagens são substituídas por resultados atuais, nunca incrementadas pelo recibo/replay. Campanha filha, controlador, lote e lista apresentam **6 destinos: 1 SENT, 1 FAILED/131026, 4 bloqueados, 0 pendentes**. SENT persistido não significa entrega; o estágio Meta recebido continua sendo apresentado separadamente.

`verify-receipt` é leitura. `ack-task` exige a mesma prova: receiptId/bindings/planHash, Outbound reconciliado exato, aceitação e webhook failed131026 com o mesmo Meta messageId, provenance no rawPayload, evento failed com sem retry e estados terminais do filho/controlador/job/lote/vínculo. Outbound SENT original é obrigatório. IDs divergentes, bloqueio ausente ou vínculo não terminal negam o acknowledgement. O status do provider conserva seu timestamp/erros originais; createdAt do Outbound recuperado representa a aceitação auditada, não uma nova submissão ou horário inventado de entrega. O ledger é reconhecido somente depois do recibo SQL; uma falha entre as duas fases mantém guarda fechada.

## Provas deste complemento

| Prova | Resultado | Escopo real |
|---|---|---|
| Build API final | PASS | TypeScript, sem diagnósticos; delta compilado em overlay |
| Reconciliação/read models | PASS, 1 caso integrado estendido | Compilados finais Node20.20.0 + PostgreSQL real sintético; campanha/controlador/lote/lista, paginação, replay, correlação e negativas de acknowledgement |
| Guarda inicialmente fechada | PASS, 4 casos | Sequenciador e Bridge efetivos com patch; HTTP/PM2/nft/systemd simulados, sem operação produtiva |
| Classificador de trabalho aguardando, corrigido | PASS, 7 casos | Node20.20.0; negativos sintéticos, sem atribuir fixtures ao produtor |
| Agendamento → PostgreSQL → SQL de inventário → V4 | PASS, 1 integração / 8 verificações | Produtor compilado real, consulta real e consumidor real; scheduled/queued/attempt0/sem lease; claim devido cria running/lease e nega o gate |
| CLI empacotado na VPS | PASS | dry-run final somente leitura, alreadyApplied=false, providerCalls=0/guardWrites=0 |
| Backup/restore | PASS | dump fresco, PG16 isolado sem TCP, sem app/provider, temporário removido |

Os 33 casos anteriormente aprovados foram reutilizados; o caso estendido não é contado como novo caso necessariamente distinto. Erros iniciais de harness ficaram privados, não foram convertidos em PASS. O produtor de baselines foi agora executado somente leitura após o ack. Os contratos completos dos três modos e os arquivos reais passaram. Instalação da política/inspect e gates imediatos da futura janela continuam pendentes; não recebem PASS por esse staging.

### Reprodução dirigida, somente em banco sintético

`node` deve ser o20.20.0 já preservado, DATABASE_URL deve apontar para schema vigente em PostgreSQL isolado. Não carregar env produtivo. Build final já existe; não reconstruir para repetir revisão.

```bash
node --test apps/whatsapp-agent/dist/campaigns/campaignAcceptedFailureReconciliation.test.js
python3 docs/reviews/automation-freeform-window-release-af26/campaign-reconciliation-prepared/test_closed_guard.py
node docs/reviews/automation-freeform-window-release-af26/campaign-reconciliation-prepared/test_waiting_work.cjs
NODE_ENV=test node --experimental-loader ./docs/reviews/automation-freeform-window-release-af26/campaign-reconciliation-prepared/producer-export-loader.mjs docs/reviews/automation-freeform-window-release-af26/campaign-reconciliation-prepared/test_waiting_postgres.mjs
```

O último driver exige localhost e nome de banco `re7_waiting_contract_*`, vazio/sintético. Chama a função real de agendamento compilada; o loader só acrescenta exports de teste após conferir o hash, sem alterar o corpo/imports. O consumidor real só opera o ledger sintético. Estados negativos são deliberadamente injetados no banco sintético; o positivo scheduled/queued nunca é escrito pela fixture. Sem providers/scheduler. A SQL é a mesma exportada pelo preparation-bindings final. Não equivale a prova HTTP/RBAC/interface. O primeiro testa funções reais de read model; não faz HTTP autenticado nem aceite visual. `test_closed_guard.py` confere hashes antes/depois de aplicar o patch sobre o sequenciador versionado. Manifestos dos outros patches fixam origem/resultado e módulo adicional; scripts.sha256 cobre este complemento sanitizado, não substitui os manifests privados da janela.

## API e backup preparados

Preparação: `/opt/re7online/backups/converta-persistent/preparations/campaign-eligibility-reconciliation-20261008T150000Z`.
API inativa: `/opt/re7online/releases/campaign-eligibility-recovery-final-reviewed-20261008/apps/whatsapp-agent`.
8.820 arquivos, 11 symlinks; fontes/compilados, env preservado, schema/lock iguais e runtime Node20.20.0 conferidos. Não importar o entrypoint como smoke: iniciaria aplicação. Nenhum processo candidato foi iniciado. API atual afbb é a release de retorno, com DB/auth atuais. Worker mínimo atual: PACKAGE_FILES.sha256 conferido, sem rebuild/backport. Frontend corrigido fa60 preservado.

Backup fresco capturado 08/10 14:58:31Z (11:58:31 Fortaleza); dump31.160.314bytes, hash no manifesto. Restore terminou15:05:23Z:70 tabelas,60 migrations concluídas, seis rollbacks históricos, zero divergência de checksum. Banco temporário removido/servidor isolado encerrado. Arquivos operacionais/auth e DB não são um snapshot atômico entre si. Frescor e estados precisam ser reconfirmados antes da execução; alterações posteriores à reconciliação ficam preservadas. **Rollback é de binários, nunca restore do dump sobre dados novos.**

## Limites do V4 e ordem imposta

O V4 antigo exigia admissão inicialmente aberta e reabria ao terminar. Isso é incompatível com esta recuperação. O patch conserva a intenção inicialmente fechada, aceita geração sem incremento ao fechamento idempotente e mantém esse estado em aborto/retorno/sucesso. Não altera nonce, validade de provas, identidade, observer, contenção ou certificados de saída.

A consulta histórica também tratava jobs terminais como trabalho pendente. `waiting-work.cjs` distingue históricos terminais de trabalho não terminal e exige inventário exato de filas inativas, sem lease atual **ou expirado ainda vinculado**. Out.14 fica aguardando sob guarda fechada; não é descartado para obter drain. Cliente/trabalho desconhecido ou drift negam. As barreiras de saída, sockets, DB/backends/advisory locks continuam obrigatórias. SQL de fila não demonstra saída de processo nem inexistência de envio em andamento.

Sequência revisada: dry-run fresco → SQL autorizado → receipt verificável → acknowledgement com guarda fechada → captura global/bindings frescos → política restrita/preflight V4 → troca API com o mesmo worker → verificação global → decisão separada de abertura por CAS. A preparação não pode fixar honestamente a geração/estado pós-ack antes de sua execução. A etapa SQL/ack já terminou: guarda **closed35/tasks:{}**. Captura global, baselines e política pós-ack foram emitidos em preparação nova, com out.14 intacta. A instalação restrita da política ainda depende de revisão/autorização e Deifson; helper/sudoers não mudam. O estado é PREPARED FOR REVIEW, sem janela liberada.

As execuções anteriores e o primeiro candidato inativo ficam preservados. Evidências privadas, números completos, Meta IDs, configurações, dump, tar e logs não são versionados. Exceção produtiva pós-aceitação original segue causa desconhecida; a correção evita retry e preserva diagnósticos futuros. CRM→BOT, agrupamento natural, contingência AUTO e aceite CRA-PR continuam separados; não reabrir setembro CLOSED.

## Fechamento da classificação operacional

O contrato efetivo é lote `scheduled`, job `queued`, attempt0 e ausência de lease. `routes.ts::scheduleScopedCampaignDraft` cria esse lote e chama o enqueue, cujos defaults PostgreSQL são queued/attempt0. O consumidor `campaignExecutionQueue.ts::claimNextCampaignExecutionJobAdmitted` aceita lote scheduled para adquirir trabalho e o torna running com lease. O V4 só aceita o primeiro estado e a correspondência exata com a captura revisada. Attempt já incrementado, lote queued/running/desconhecido, execução ativa, lease atual ou expirado ainda vinculado e drift global negam. Não há mudança no SQL, scheduler, status persistido ou out.14.

A preparação final é `incident-6683-v4-campaign-eligibility-scheduled-20261008T174500Z` (nome identificador; horários reais estão no manifesto). Três manifests de27 arquivos conferidos, baselines operacionais/funcionais/sequenciador completos, candidato8820 arquivos/11 symlinks íntegros e worker atual conferido. API candidata a26; retorno afbb; mesmo worker mínimo reativo e frontend fa60 preservados.

O template histórico ainda descrevia frontend af26 direto. As duas composições recusadas antes da emissão da política foram preservadas. A final usa o tracked config publicado da geração fa60 ativa: igualdade da configuração PM2 e do `pm2_env` serializado do processo em cluster_mode; o binding do frontend preservado registra seu ambiente inicial completo observado. O checker não mudou, nem foi removido qualquer campo/negativa. Esse binding de observação não é usado para iniciar o frontend. A `.data` da API candidata está vinculada explicitamente ao mesmo alvo atestado da API ativa.

A conferência final separa baseline resumido (tasks0) do ledger real (tasks:{}), exigindo o ledger integral igual ao pós-ack preservado. A primeira asserção administrativa comparou essas representações indevidamente; seu diagnóstico foi preservado e nenhuma barreira operacional foi alterada. Guarda fechada35, saved/fallback/cron/boot preservados; eligible nega execution_gates_incomplete antes de emitir prova. Não houve instalação/inspect da nova política, stop/start, contenção, SQL de reconciliação, abertura, rebuild ou provider. Backup/restore17:00/17:01 reaproveitado é pré-SQL; frescor e estados serão reconfirmados em futura janela, nunca restore produtivo.

### Coerência do consumidor de retorno pós-unfence

A montagem final encontrou duas dependências do contrato antigo no gerador de retorno: extração da SQL embutida/contagens escalares e limite26. O [patch atestado](waiting-return-v4.patch) usa a SQL e noWork efetivos do mesmo módulo, em transação READ ONLY com timeout, copia o inventário esperado e waiting-work.cjs e exige27 arquivos. Nenhuma identidade/certificado/nonce/ausência de worker foi relaxada. Origem f015ee55 e resultado bbca3061 completos no manifesto do patch. Quatro verificações dirigidas PASS: função real alterada + Node20 real/classificador/captura do agendamento isolado; somente leitura Docker simulada. Lease/running/desconhecido negam. Geração integral pós-unfence não foi executada nesta preparação e não recebe PASS por essas quatro verificações. Demais provas do retorno foram reutilizadas, sem reatribuição. O manifesto final incorpora esses bytes.

Reprodução dirigida do adaptador: `python3 test_waiting_return.py ATTESTED_ORIGINAL_TEMPLATE PRODUCER_CAPTURE NODE20`, executado a partir deste diretório. Use o original privado f015ee55… preservado e o waiting-work.private.json gerado pelo teste PostgreSQL isolado. Os argumentos são entradas de laboratório, não credenciais/configuração produtiva. O teste aplica o patch com hashes, mantém o leitor/classificador reais e simula apenas a resposta da leitura Docker. Não invoca main nem efeitos de janela.
