# Revisão final e preparação offline — 08/10/2026

**API/CLI STAGED VERIFIED / RECONCILIATION REVIEWED / NOT DEPLOYED.** Escritas, janela e abertura estão desabilitadas. A preparação offline está concreta na VPS; o V4 depende da observação pós-acknowledgement e ainda não está autorizado/pronto para executar.

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
| Classificador de trabalho aguardando | PASS, 6 casos | Node20.20.0, fixtures sintéticas; tipos, desconhecidos, lease e drift |
| Producer/consumer de fila V4 | PASS, 1 integração / 5 verificações | Query real PostgreSQL sintético + módulo final preparation-bindings, arquivo esperado real; conhecido/tenant desconhecido/histórico terminal/lease expirado ainda vinculado/running |
| CLI empacotado na VPS | PASS | dry-run final somente leitura, alreadyApplied=false, providerCalls=0/guardWrites=0 |
| Backup/restore | PASS | dump fresco, PG16 isolado sem TCP, sem app/provider, temporário removido |

Os 33 casos anteriormente aprovados foram reutilizados; o caso estendido não é contado como novo caso necessariamente distinto. Erros iniciais de harness ficaram privados, não foram convertidos em PASS. `prepare-baselines-closed.patch` teve sintaxe conferida; seu main produtivo não foi executado porque exige a tarefa já reconhecida. O pacote completo da futura janela ainda requer bindings/política pós-ack, não recebe PASS operacional por simulação.

### Reprodução dirigida, somente em banco sintético

`node` deve ser o20.20.0 já preservado, DATABASE_URL deve apontar para schema vigente em PostgreSQL isolado. Não carregar env produtivo. Build final já existe; não reconstruir para repetir revisão.

```bash
node --test apps/whatsapp-agent/dist/campaigns/campaignAcceptedFailureReconciliation.test.js
python3 docs/reviews/automation-freeform-window-release-af26/campaign-reconciliation-prepared/test_closed_guard.py
node docs/reviews/automation-freeform-window-release-af26/campaign-reconciliation-prepared/test_waiting_work.cjs
node docs/reviews/automation-freeform-window-release-af26/campaign-reconciliation-prepared/test_waiting_postgres.mjs
```

O último driver exige localhost e nome de banco `re7_waiting_contract_*`, vazio/sintético. Cria fixtures SQL, não providers/scheduler. O primeiro testa funções reais de read model; não faz HTTP autenticado nem aceite visual. `test_closed_guard.py` confere hashes antes/depois de aplicar o patch sobre o sequenciador versionado. Manifestos dos outros patches fixam origem/resultado e módulo adicional; scripts.sha256 cobre este complemento sanitizado, não substitui os manifests privados da janela.

## API e backup preparados

Preparação: `/opt/re7online/backups/converta-persistent/preparations/campaign-eligibility-reconciliation-20261008T150000Z`.
API inativa: `/opt/re7online/releases/campaign-eligibility-recovery-final-reviewed-20261008/apps/whatsapp-agent`.
8.820 arquivos, 11 symlinks; fontes/compilados, env preservado, schema/lock iguais e runtime Node20.20.0 conferidos. Não importar o entrypoint como smoke: iniciaria aplicação. Nenhum processo candidato foi iniciado. API atual afbb é a release de retorno, com DB/auth atuais. Worker mínimo atual: PACKAGE_FILES.sha256 conferido, sem rebuild/backport. Frontend corrigido fa60 preservado.

Backup fresco capturado 08/10 14:58:31Z (11:58:31 Fortaleza); dump31.160.314bytes, hash no manifesto. Restore terminou15:05:23Z:70 tabelas,60 migrations concluídas, seis rollbacks históricos, zero divergência de checksum. Banco temporário removido/servidor isolado encerrado. Arquivos operacionais/auth e DB não são um snapshot atômico entre si. Frescor e estados precisam ser reconfirmados antes da execução; alterações posteriores à reconciliação ficam preservadas. **Rollback é de binários, nunca restore do dump sobre dados novos.**

## Limites do V4 e ordem imposta

O V4 antigo exigia admissão inicialmente aberta e reabria ao terminar. Isso é incompatível com esta recuperação. O patch conserva a intenção inicialmente fechada, aceita geração sem incremento ao fechamento idempotente e mantém esse estado em aborto/retorno/sucesso. Não altera nonce, validade de provas, identidade, observer, contenção ou certificados de saída.

A consulta histórica também tratava jobs terminais como trabalho pendente. `waiting-work.cjs` distingue históricos terminais de trabalho não terminal e exige inventário exato de filas inativas, sem lease atual **ou expirado ainda vinculado**. Out.14 fica aguardando sob guarda fechada; não é descartado para obter drain. Cliente/trabalho desconhecido ou drift negam. As barreiras de saída, sockets, DB/backends/advisory locks continuam obrigatórias. SQL de fila não demonstra saída de processo nem inexistência de envio em andamento.

Sequência revisada: dry-run fresco → SQL autorizado → receipt verificável → acknowledgement com guarda fechada → captura global/bindings frescos → política restrita/preflight V4 → troca API com o mesmo worker → verificação global → decisão separada de abertura por CAS. A preparação não pode fixar honestamente a geração/estado pós-ack antes de sua execução. Hoje a guarda continua **closed34/tasks1**. Captura de trabalho e baseline pós-ack são negados nessa condição. A instalação da política futura depende de Deifson, com bytes/hashes a publicar após essa captura; helper/sudoers não mudam. Não se declara PREPARED FOR WINDOW com essa dependência ainda pendente.

As execuções anteriores e o primeiro candidato inativo ficam preservados. Evidências privadas, números completos, Meta IDs, configurações, dump, tar e logs não são versionados. Exceção produtiva pós-aceitação original segue causa desconhecida; a correção evita retry e preserva diagnósticos futuros. CRM→BOT, agrupamento natural, contingência AUTO e aceite CRA-PR continuam separados; não reabrir setembro CLOSED.
