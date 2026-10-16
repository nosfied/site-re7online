# B2 — continuidade da execução e cadeias locais conectadas

**B2 FECHADO LOCALMENTE no alcance abaixo. INTEGRATION BLOCKED / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY. CSV SUSPENSO.**

Base `6273b4d31fb0203882ad3800da6c9d4b2988a4a4`, branch `review/campaign-recovery-20260926`. As entregas anteriores são preservadas. B1, B3 e B4 permanecem abertos; esta prova não é autoridade instalada, pacote operacional ou janela pronta.

## Lacuna reproduzida e controles anteriores

O Context A de R3 fixa E1 em `_forward_execution`. O transporte antigo encaminha apenas `(anchorHash, permitHash)`. No teste `test_before_context_gap_reaches_child_import_and_request`:

1. A consulta a autoridade sintética, valida a preparação e fixa E1.
2. O transporte real constrói o comando de filho após conferir o snapshot.
3. Um hook de concorrência altera o intent para E2 **depois** da construção do comando e **antes** do subprocesso.
4. O Python filho inicia de verdade, consulta novamente root e cria Context B com a mesma âncora/permit. A correlação antiga coincide. B importa o delegated concreto e grava um request, apesar de A esperar E1.

Os bindings antigos do request/proof verificam root, direção, configuração, geração, nonce, prazo e consumo. Nenhum desses campos liga o intent global E1; identidade estática consistente não detecta sua alteração. A detectaria o drift na próxima revalidação própria. Um Context novo perde essa memória. O permit de recuperação já liga execução e continua sendo exigido somente na recuperação.

A execução da contraprova também expôs uma falha independente: o bootstrap antigo retornava o objeto módulo e seu entrypoint tentava serializá-lo como JSON, após o código do filho já ter rodado. O diagnóstico concreto é `TypeError ... not JSON serializable`; ele **não** constitui controle de execução. O teste exige import/request existentes antes dessa falha; não afirma protocolo antigo completo. O pipeline novo elimina essa falha de interface retornando None após a execução Python, preservando o stdout do entrypoint.

## Vínculo mínimo implementado

As fontes futuras editáveis estão **neste diretório**. Reutilizam-se `verified_loader.py`, `root_store.py`, `root_extension.py` e demais fontes publicadas, sem alteração de seus bytes. `SOURCE_DELTA.patch` compara somente cinco bibliotecas futuras com seus predecessores; `SOURCE_PROVENANCE.json` fixa a procedência.

- **Context:** `correlation()` fornece `{authority: [anchorHash, permitHash], executionSha256: E}`. `execution_hash()` fixa o primeiro intent existente e não aceita troca/remoção posterior. Ausência durante inspeção inicial permanece explícita; `start_mode('switch')` continua negando execução ausente. Não há permit de recuperação na ida.
- **Bootstrap Python:** cria Context por consulta root independente; `accept_correlation` compara identidade e execução correntes **antes de criar o Loader**, compilar ou importar código da preparação. O envelope do pai é uma obrigação de igualdade, não fonte de autoridade. A carga continua restrita aos mesmos bytes/hash/dependências autenticados.
- **Transporte Python/Node:** `child_transport.command` revalida o snapshot e envia o envelope completo. Não usa env para autoridade. `bootstrap` mantém a exigência de correlação para escopo forward; inspeção/PRESTOP não emitem permit.
- **Node:** a primeira chamada node-snapshot já recebe a correlação esperada antes da carga Python. Toda atualização de snapshot e todo filho Python levam o mesmo envelope. Uma comparação só depois de obter/carregar um snapshot novo seria tardia; não é a solução adotada.
- **Delegated:** `bindings()` acrescenta `executionIntentSha256` usando o Context autenticado. Os consumidores originais de igualdade integral em request/record/proof passam a verificar também esse campo, inclusive quando um pai novo foi criado após E2. Não se reescrevem request/proof históricos para PASS: ausência/divergência do campo nega renovação/record/execute quando houver nova execução.
- **Revalidação:** o Context mantém E1 em cada uso; troca de autoridade também continua negando. A decisão específica ORIGINAL/CANDIDATE, perfil, prazo e fase do permit permanecem independentes da ida e sem renovação implícita.

A origem da comparação é o pai lançado/carregado pelo caminho root autenticado existente; o filho consulta root outra vez. Um argumento de digest sozinho não autoriza execução. O modelo já declarado não isola um deploy malicioso de todas as capacidades OS que ele possua: não há nova assinatura, serviço ou privilégio. B1/B4 continuam condições obrigatórias antes de alegar esse caminho instalado/confiável na VPS.

## Cadeias executadas em processos reais

### Bridge.protocol → delegated request/record/execute

O Bridge usa seu corpo real de `protocol` e `run`. O transporte gera o comando real, stdin/stdout/pipes são preservados, e três processos `/usr/bin/python3 -I -S` executam bootstrap e o delegated completo, no mesmo ensaio, sobre a mesma fixture. A ação escolhida é **preflight**, que percorre request, nonce, prova, record, lock, execute, restore injetado, validação dos dois crons e rename de consumo.

`test_real_delegated_three_processes_and_consumption` comprova três PIDs distintos com PPID do pai de teste, execução concluída, request ligado ao hash do intent e proof consumido. A repetição do protocolo nega `completed_action_cannot_renew`, sem novo execute/renovação. Isso não é execução de start/stop produtivos nem prova de todos os efeitos de cada ação delegated.

### Bridge.node → Node bootstrap → Python bootstrap → baseline real

`Bridge.node('switch','close.cjs')` chama seu transporte real. O `close.cjs` da fixture é um wrapper declarado que chama o **execution-check.cjs real**; não executa o fechamento HTTP real do produto. O Node roda o launcher CommonJS real, consulta snapshots através de novos processos Python, e o execution-check chama um novo Python bootstrap que executa o **baseline_contract.py real**, incluindo o ecosystem validator real sobre perfis/baselines completos sintéticos. Não se devolve uma resposta baseline simulada.

`test_real_node_python_baseline_chain` exige PID do Node filho do pai e PID do baseline filho daquele Node, além de sucesso do bootstrap/baseline. `PROCESS_EVIDENCE.json` conserva eventos sanitizados e PID/PPID efetivos. Não são apenas testes dos elos separadamente.

## Negativas e continuidade

- **E1→E2 entre comando do pai e bootstrap filho:** nega `authority_execution_changed`, sem Loader, import do delegated ou request.
- **E1→E2 no Node, imediatamente antes do Python baseline:** Python consulta root, compara E1/E2 e nega antes do Loader do baseline. O processo existe; o código de baseline não é carregado/executado.
- **Context novo após E2:** record nega `owner_request_generation_or_configuration_drift`; execute nega `owner_proof_generation_or_configuration_drift`. Request/proof de E1 ficam preservados, sem consumo falso.
- **Troca de âncora entre pai/filho:** nega `bootstrap_authority_replaced`, sem import.
- **Permit expira somente no filho:** relógio root sintético avança após a construção do comando. A revalidação no Loader nega `authority_permit_expired`, sem import.
- **Filho não declarado:** transporte nega; chamada direta ao bootstrap também consulta root e nega a entrada não declarada, sem executar seu canário.
- **Resposta root perdida:** filho nega antes de importar; não consulta para renovar/emite permit.
- **Resposta de execute perdida:** o processo real conclui execute e consome o proof; somente a resposta é perdida por hook no pai. Protocolo para, registra a fase e não repete execute ou declara complete.
- **R3 e recuperações:** ida sem permit, negativa antes do efeito após troca, seleção obrigatória, resposta de start perdida; ORIGINAL/CANDIDATE/PRESTOP, expiração/troca API-worker e replay continuam cobertos pelas regressões diretamente afetadas.

## O que foi simulado e o que não foi

**Reais:** processos locais Python/Node, `/usr/bin/python3 -I -S`, Bridge.run/protocol/node, stdin/stdout, leitor/Context/Loader, transações de arquivo da fixture, delegated completo (funções request/record/proof/execute, nonce, locks e consumo), execution-check e baseline/ecosystem. Não houve monkeypatch de subprocess que devolvesse um resultado inventado; os hooks lançam o comando real, podendo injetar concorrência ou perder a resposta depois dele.

**Simulações explícitas:** UID/modos/cadeias root no `trusted_library`, canal sudo/root e bundle de autoridade em arquivo sintético, relógio apenas no teste de expiração; caminhos fixos dos launchers e namespace de preparação mapeados para temporário; `/usr/bin/node` mapeado para o Node instalado localmente. A leitura FD/compilação e os hashes dos arquivos de biblioteca são reais. O shim consulta um bundle sintético, não instala/aciona helper/sudoers nem emite autoridade real.

System guard/cron/PM2/SQL/HTTP são o driver declarado da fixture. Não se consulta nenhum recurso produtivo. O restore é a autoridade anterior injetada explicitamente como nas provas aceitas, sem afirmar restore novo. Para exercitar preflight, a classe System é substituída pelo driver; as funções canônicas request/record/proof/execute, os verificadores baseline e os controles ScheduledControls permanecem concretos. A instrumentação de import usa `lab_record` separado, sem substituir `delegated.record`.

A fixture inclui os módulos db_owner reais para satisfazer os imports concretos de Operations, mas não executa SQL/observação DB reais. Não foram ensaiados PM2 ou todos os efeitos do delegated start em subprocessos: R3/recuperações continuam nos seus ensaios focados com OS simulado. Essa distinção não fica escondida pela contagem de testes.

## Reprodução e evidências

```bash
python3 -B docs/reviews/automation-freeform-window-release-af26/crm-csv-root-authority-b2-20261016/reproduce.py
```

**24 PASS finais:**14 casos de processos/continuidade e10 regressões afetadas de R3/recuperação. As suítes28/33/32/42 inteiras não foram repetidas. O harness isola os arquivos entregues e as referências versionadas com hashes; o subprocesso da suíte não tem fallback Git/local-evidence. Nenhum build foi feito.

O Node→Python encontrou EPERM no sandbox. A mesma suíte passou fora dele; o teste não foi alterado para simular esse transporte. Rodadas adicionais foram justificadas por correções do harness e novas contraprovas/evidência PID/PPID, não repetição por rotina. O primeiro harness usou um nome de auditoria que sombreava `record`; foi corrigido para alias separado antes da prova final. O primeiro ensaio de expiração negava no pai; a versão final expira somente no filho. Essas ocorrências ficam registradas em PROOFS.json, sem reescrever provas antigas.

`TEST_OUTPUT.txt` fixa os24 resultados. `PROCESS_EVIDENCE.json` contém12 casos com subprocessos lançados; duas negativas param no pai sem subprocesso. Os dez testes reaproveitados continuam com suas provas de contrato e OS simulado declaradas. Não há falsos recibos de complete em nenhum caso.

## Bloqueios e critério de avanço

**B2 fechado somente no laboratório e nos dois caminhos especificados, com continuidade de execução.**

- **B1 permanece:** canal inicial ainda não ligado à custódia/diagnóstico privado canônico byte-exato. O canal sudo foi simulado neste laboratório, como autorizado, não certificado operacionalmente.
- **B3 permanece:** PM2 reabre ecosystem CJS em outro processo; nenhum efeito PM2 foi executado ou solução nova acrescentada.
- **B4 permanece:** não há instalador/pacote concreto nem fechamento transitivo operacional dos quatro modos, root/pins/namespaces atuais. A fixture completa não é essa certificação.

A futura certificação precisa materializar os vínculos reais e os bloqueios restantes, com autorização própria. Não ampliar a conclusão local para autoridade root instalada ou prontidão de janela. NEWauth+NEWDB+NEWcipher, produção, frontend, ambos crons, guarda38, out.15, configurações, credenciais e gerações/intents consumidos não foram acessados ou alterados.

`FULL_DELTA.patch` representa o incremento e checkpoints contra o SHA-base, excluindo a si próprio, MANIFEST e ALLOWLIST; MANIFEST fixa os bytes finais. SOURCE_DELTA apresenta somente mudanças nas cinco fontes futuras. Responsável operacional Deifson; revisão21/10 ou antes após mudanças.

**INTEGRATION BLOCKED / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY. CSV SUSPENSO.**
