# CSV — integração local do adaptador frontend

Base `774234198bb2b6cc87d23e34e5cf37227ecb32e6`. **Reconciliação frontend aceita localmente no alcance revisado; integração afetada LOCAL VALIDATED / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY. CSV SUSPENSO.** A [reconciliação e procedência existentes](../crm-csv-frontend-reconciliation-20261017/REPORT.md) permanecem a referência; não se reabre a investigação.

## Fonte editável e integração

A `frontier.source` anterior foi entregue em um índice de integridade junto ao pacote posteriormente consumido. Para não invalidar esse histórico, o delta fica em `scripts/crm_csv_diagnostic/editable_sources.py`, fonte editável futura **do mesmo diagnóstico**. `source_inputs()` reutiliza o leitor FD/no-follow/estabilidade aprovado, lê/verifica os snapshots pinados e retorna bytes apenas em memória. Não é launcher, coletor, autoridade, checker ou compositor operacional novo; não tem CLI, efeitos remotos ou emissão de pacote.

O retorno associa o adaptador aceito `contracts.py` (SHA53de3ac7…) à fronteira existente, com somente duas mudanças explícitas:

1. `compare_frontend(..., before, op, profiles)`: passa o objeto já obtido de `historical('source.profile.private.json', 'profile-reference')`, após stable_file/hash/JSON. Não reconstrói fonte por RPC, dump, kernel ou sessão; não altera HISTORY/digest, não filtra campos e não troca referências para obter PASS.
2. Tradução estática de `frontend_application_environment_drift` para `FRONTEND_APPLICATION_ENVIRONMENT_DRIFT`, preservando o diagnóstico canônico por Capture/private_record e as negativas anteriores.

[DELTA.patch](DELTA.patch) mostra essas mudanças na fronteira em memória; [SOURCE_INDEX.json](SOURCE_INDEX.json) associa origem, leitor e adaptador aos seus hashes. Os bytes conferidos do adaptador são os fornecidos ao `load('contracts.py')` do consumidor existente. Perfil OS completo e projeção PM2 completa continuam separados conforme a correção aceita, com System/Operations e comparação saved intactos. Não há nova lógica de comparação nesta fonte.

Nenhum runner, compose/seal, pacote, manifest, referência, receipt ou intent histórico é editado. O `compose.py` consumido não deve ser reexecutado: uma eventual composição futura deverá usar esta entrada editável e terá sua própria revisão/certificação/autorização, fora deste incremento. A confiança dos pins aqui é a revisão versionada desses bytes; não se afirma autoridade root instalada.

## Validação afetada — quatro testes

[test_integration.py](test_integration.py) conecta os bytes retornados por source_inputs aos consumidores existentes apenas em memória, sem gerar runner em disco. Executa a função frontend inteira, incluindo consumers/load, leitura/hash/JSON da referência, Operations.config/System.check_config, perfil OS e projeção distintos, saved/fallback e conferências finais do fluxo no caso sintético válido.

- Válido: perfil OS com PATH de launcher/envelope e projeção PM2 diferente; GATE2 somente após comparações canônicas e saved/fallback.
- Source.profile adulterado **depois de fixar o hash da fixture**: DENY profile-reference-hash/HISTORICAL_HASH_DRIFT antes do comparador.
- Ambiente OS alterado com fonte autenticada intacta: DENY frontend-contract/CANONICAL_ENVIRONMENT_DRIFT.
- Projeção PM2 alterada com ambiente OS intacto: DENY frontend-contract/FRONTEND_APPLICATION_ENVIRONMENT_DRIFT.

Reais: código consumidor existente, adaptador aceito, extração pinada dos métodos System/Operations, leituras de arquivos/FDs e hash, inode/metadata de socket local, memfd selado, Capture/private_record e comparações. Simulados: SO_PEERCRED/identidades produtivas por fixtures, `/proc`, resposta RPC e execução de Node/processos. Sem SSH, Node/PM2 CLI/daemon, SQL ou efeitos produtivos. Os hashes de referência das fixtures são definidos antes das injeções negativas; não são bindings operacionais nem substituições das referências publicadas. Nenhum verificador foi trocado por PASS.

O sandbox inicialmente negou bind de socket local; o mesmo teste foi executado com a permissão local necessária, sem mudança de código para obter aprovação. [PROOFS.json](PROOFS.json) registra os quatro testes finais e hashes. Reutilizadas as onze contraprovas da reconciliação, nove provas anteriores dos blocos literais, duas de stat e a prova PM2 cluster no alcance válido; sem repetição dessas suítes, build ou análise privada nova.

Reprodução local focada:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 docs/reviews/automation-freeform-window-release-af26/crm-csv-diagnostic-integration-20261017/test_integration.py
```

Exige somente permissão local para socket descartável; não usa VPS/sudo. O teste declara as fronteiras simuladas e não certifica observação produtiva, root, SQL ou toolchain.

## Checkpoints e sequência

Antes de adaptar uma representação, consultar o contrato do consumidor e as provas anteriores, identificar a origem/camada dos dados e demonstrar equivalência; dump/projeção PM2 não equivale ao ambiente OS. A causa do erro de adaptação já está explicada na reconciliação; ambos DENYs originais e suas custódias permanecem intactos, sem PASS retroativo ou atribuição retrospectiva a atime.

A correção funcional CSV (operação/ledger/GET, timeout/reentrada/totais e RBAC) é distinta das condições de implantação. Seus testes válidos não provam configuração atual, ownership ou prontidão de janela; este incremento de diagnóstico também não implanta a correção funcional.

Pendências: saved/fallback e identidades finais produtivos não alcançados na coleta consumida; rota/container/cliente SQL e identidade/ownership SQL; closure ELF operacional/toolchain protegido; observações/16 vínculos e autoridade atuais. Nenhuma foi recertificada aqui. **Próximo passo concreto: revisão direta deste delta de fonte; depois, em escopo próprio, reconciliar os requisitos já documentados de toolchain protegido e SQL/ownership, sem reabrir a investigação frontend ou presumir autorização de coleta.**

NEWauth+NEWDB+NEWcipher, produção, ambos crons, guarda38 fechada e out.15 CLOSED preservados, sem nova observação ou ação mutável. Sem coleta, SELECT, instalação, restart, renovação, backup ou pacote operacional. Branch de revisão com deploymentEnabled=false; CI versionado somente main/develop, sem alteração de configuração. Responsável Deifson; revisão21/10/2026 ou mudança. Encerrar após publicação sanitizada.
