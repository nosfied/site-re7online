# Frontend3227: diagnóstico observacional e nova preparação — 11/10/2026

Referência auditada: `d062f2e48a3961970bc040c9f20189345f09c842`. Escopo frontend exclusivamente. **PREPARED FOR RESTRICTED INSTALLATION / PREPARATORY PREFLIGHT REVIEW — NOT DEPLOYED.** A nova composição está conferida e inativa; não é certificado de saída nem PASS do futuro preflight sob bytes ainda não instalados.

## Achados e causa sustentada

1. **Bloqueio de execução:** o helper instalado só produziu `frontend_socket_observation_denied:ownership_observation_incomplete` na recusa original. Stdout vazio, exit1 e timeoutfalse. O diagnóstico do checker apenas encadeou `socket_observer_read_denied`. Não há operação/PID/FD original. **A causa histórica específica permanece desconhecida.** A segunda observação completa permitiu o retorno fa60; não prova o motivo da primeira falha. Frontend3227 não foi iniciado naquela tentativa.
2. **Lacuna de diagnóstico corrigida localmente:** as leituras de identidade, diretório de descritores, readlink, ambiente, cmdline e cwd tinham a mesma recusa genérica. O patch acrescenta etapa, PID, start ticks quando já disponíveis, FD quando aplicável e tipo/errno/strerror original sanitizado. Não serializa caminho da exceção, ambiente, conteúdo, linha de comando, configuração ou credencial. A recusa e exit1 permanecem. O cliente existente já preserva stderr/stdout/exit em arquivo privado600; não foi necessário alterar seu contrato.
3. **Dependência real de privilégio:** deploy não pode sequer lstat a regra em `/etc/sudoers.d` nesta VPS. A negativa errno13 foi preservada e classificada `UNAVAILABLE_TO_DEPLOY`. A instalação futura deverá verificar os bytes/ownership/modos da regra pela sessão sudo do owner. Não foi atribuída integridade atual a essa leitura indisponível.

A diferença entre `R` e `S` continua sendo estado de execução, não identidade. Permanecem negativas de identidade divergente/PID reutilizado, zumbi, executor/proprietário adicional, listener, leitura incompleta e acesso insuficiente. Não há exclusão de processos, novo retry, prazo maior ou flexibilização dos gates. [Patch mínimo](observer-diagnostic.patch); origem SHA93564f78 completa abaixo. O helper original permanece instalado.

## Provas dirigidas e limites

| Prova | Resultado | Alcance |
|---|---|---|
| `test_diagnostic.py` | 15 PASS | Código efetivo do sample e serializer; procfs sintético e injeções declaradas de desaparecimento/PermissionError/ProcessLookupError/FD. Verifica redaction, prazo, drift entre amostras, sucesso inalterado e stderr estruturado chegando ao log privado pelo cliente real. |
| `test_real_proc_race.py` | 6 PASS | Processos/descritores/sockets reais em namespace Linux isolado; barreiras controladas para desaparecimento nas leituras de identidade/environ/cmdline/cwd/FD; contrato efetivo nega sobrevivente real. Não é PM2/Next produtivo nem atestado da VPS. |
| `frontend-socket-observation-proposal/test_preflight_driver.py` | 12 PASS | Regressão diretamente afetada do cliente/contrato e orçamento existente. Primeira execução foi impedida pelo sandbox (EPERM socket); execução permitida fora dessa restrição passou. Fixtures/injeções não foram apresentadas como efeitos root produtivos. |
| Leitura real sob helper antigo | PASS, duas amostras completas | Política já instalada; escopo atual preservado. Não atesta helper/política novos. |
| Composição nova / modo `--proposed-observer` | PASS | Baseline real, configurações, artifacts, permanent binding e controles novos; somente conferência preparatória dos bytes propostos. |
| Checker normal antes da instalação | DENY `window_helper` esperado | Log privado preservado. Gate normal continua exigindo os novos bytes efetivamente instalados; modo de revisão não é usado no stop/exit/start. |
| Futuro preflight integrado com novo helper/política | NOT EXERCISED | Depende de revisão e instalação privilegiada; nenhum certificado preparatório/saída foi inventado. |

Comandos reproduzíveis (somente laboratório):

```bash
python3 -m unittest discover -s docs/reviews/automation-freeform-window-release-af26/frontend3227-observation-diagnostic-20261011 -p test_diagnostic.py -v
unshare -Urnpf --mount-proc python3 docs/reviews/automation-freeform-window-release-af26/frontend3227-observation-diagnostic-20261011/test_real_proc_race.py
python3 -m unittest discover -s docs/reviews/automation-freeform-window-release-af26/frontend-socket-observation-proposal -p test_preflight_driver.py -v
```

As 15+6 provas novas e as12 regressões são distintas. Não foram reexecutadas suítes funcionais, build, browser smokes ou PM2/reboot já aceitos: launcher, bootstrap, tar e mecanismos permanentes não mudaram. Os ensaios Node20/PM2/Next e estilos calculados do artefato exato permanecem os vinculados na [preparação frontend3227](../frontend-3227b2d7-prepared-20261009/README.md). Syntax-check dos novos drivers/installer PASS; nenhum instalador foi executado.

## Estado produtivo e capacidade observados

Captura delimitada `2026-10-11T10:19:36.221787+00:00` → `2026-10-11T10:19:38.618573+00:00` (07:19:36–07:19:38 Fortaleza). SQL READ ONLY/timeouts do leitor já auditado, sem provider/entrypoint. Captura anterior10:07UTC também preservada; nenhuma delas será reutilizada como observação imediata de uma futura janela.

- API preventiva, PID4049504/start ticks2146911015/restart0; worker mínimo afbb PID4049657/ticks2146911319/restart0; fa60 PID4051349/ticks2146939624/restart0. Daemon18676/ticks222727. Baseline nova deriva destes processos e do controle **return** efetivamente ativo, não do candidato abortado.
- API `/opt/re7online/releases/campaign-preventive-a26-20261011T002421Z/apps/whatsapp-agent`; worker `/opt/re7online/releases/worker-minimal-reactive-afbb7455-verified/apps/whatsapp-web-worker`; retorno frontend fa60 corrigido `/opt/re7online/releases/fa60f0f6443f3e0a129dc707021cffdc408af817-front-css-17bd5fb8`.
- Guarda fechada38/tasks{}, sem lock/.uncertain; job suspenso/inventário congelado sem alteração, seis resultados delivered reportados e cinco posições sem Outbound/submissão. Recibo/tarefa arquivada .6 preservados. Não houve apply/ack/retomada.
- Health/DB, supervisor permanente e CSS servido fa60 PASS. Saved/fallback iguais e preservados; cron, crontab e boot inactive/enabled sem alteração; barreira de transição ausente. Atendimento/sessões não foram desconectados nem escritos. Não houve nova confirmação funcional pelo owner nesta auditoria.
- Disponível a deploy no filesystem comum: **2.359.504.896 bytes**, **6.861.133 inodes**; disponível a postgres observado: **2.359.500.800 bytes**. WAL83.886.080bytes, slots0, archiveoff/falhas0, sem tablespace externo. Leitura delimitada dos logs PostgreSQL preservada em privado. Piso operacional reutilizado2.131.755.008bytes +1MiB de preparação foi verificado antes do staging. Nenhum tar/release/dependência duplicado: só controles/scripts/metadados novos. A margem suporta esta preparação, não uma autorização de novos builds/cópias nem garantia indefinida de produção; capacidade/WAL devem ser relidos antes da parada futura.

**Backup:** contrato canônico frontend-only [README](../frontend-3227b2d7-prepared-20261009/README.md) dispensa novo dump/restore SQL quando DB/schema/auth não mudam. A prova anterior de dump/restore/off-host da janela API permanece preservada, com idade registrada; não foi declarada fresca nesta etapa. Baseline real, controles, dumps PM2 saved/fallback e evidências da nova geração foram preservados off-host em arquivo privado hashado, extraído em diretório isolado700 e com os dois manifests revalidados integralmente. Nenhum banco foi restaurado, e nenhum dump PM2 ativo foi escrito.

## Geração concreta e integridade

Novo diretório: `/opt/re7online/backups/converta-persistent/preparations/frontend-3227b2d7-observation-v2-20261011T101500Z`. Não há cópia de nonces/certificados consumidos. `execution-authorized=false`, intents de partida ausentes, journals de candidato/retorno ainda inexistentes. Capturas preparatórias de saída não foram fabricadas. Preparação consumida e diretórios referenciados pela supervisão atual permanecem intactos.

| Artefato | SHA-256 / identidade |
|---|---|
| frontend3227 tar exato reaproveitado | `9b54548e4a7763f5078ae0433aceb43a37567eccd988814dd82f2fab97229319` |
| BUILD_ID / manifesto completo | `8OqIZZxaW7_ogf6h7AVoe` / `32349250b8bd73fe30c37d761d43a47185a2c9b33c9e4715f5a25265dd581f60` |
| Tar resident original | `/opt/re7online/backups/converta-persistent/preparations/frontend-3227b2d7-20261009T220400Z/frontend-3227b2d7.tar.gz` |
| Retorno fa60 / manifesto | `wBXX8kmp5RuCHCYt_ot8X` / `378bb220d02e29e93ccd2edf4d83cb2e903912f5548dc498e28e6a4e914cd1bf` |
| Helper instalado/origem | `93564f78ad2286621b465f713f82ac5d37d031518c92be9110dcf934412af385` |
| Helper diagnóstico proposto | `c885486f0a34c15f6b2a66af311eb151bc66f8d22c9790c35ae729dff1cbad30` |
| Política de janela instalada/origem | `c67cf7327f236b4ad12ce34b7eee22f5251d2720958f7646ecce26a32746e121` |
| Política nova privada | `7a9615f9685cc818d0b4254908d3fea482d056207b8bb81e420ce7367bbfd472` |
| Regra literal existente, esperado; leitura sudo futura obrigatória | `118a54ec6f03c6f8af92a5e9f05d766fda08eea0d2fa79a207ecf588374e8b12` |
| Política permanente instalada e proposta idênticas | `ed28e68f46b768aa667df355121d2e27c0039de87582f9fa787dc127ba440a83` |
| Helper permanente inalterado | `976272ee36d6900111877c02ea6d0b72dc9dad705237c819a18861c47bfaec3d` |
| `scripts.sha256` (18 arquivos) | `6bd3c775e839bf53219c4b88a868bb46fb3da40f788107d91aa05109541310e5` |
| `bindings.sha256` (22 arquivos) | `7c40b7e6ec841b942d12891e03676a7986e8d129b34f109635a55020defd2c95` |
| Instalador proposto, não executado | `91d355597051a84cbbcdf4d9eaf5fd0f9dbb900412f08595dfe074d9d86f7079` |
| Arquivo privado da preparação, validado off-host | `f8cf5732347a3e1010c5d2a2841a4769b08e7dd97e8ab9a1145110c0350540a2` |

Manifesto candidato:23.795arquivos/31symlinks PASS. Retorno:22.868arquivos/31symlinks/13runtime-cachefiles PASS. CSS candidato187.044bytes SHA`1ddf8dca7f9965191239b7aef3b8ce92374ccf637ca421d3ad75a0cc964eab64`, path`static/chunks/64ec3d62bdaa41ef.css`, conferido. Manifests completos e scripts/bindings foram novamente checados após staging; nenhuma reconstrução. [Manifest scripts](prepared-scripts.sha256), [bindings somente hashes/nomes](prepared-bindings.sha256), [gerador](prepare-generation.py), [finalizador](finalize-generation.py), [patch do checker preparatório](preparation-review-mode.patch).

## Próxima decisão e comandos — NÃO EXECUTAR nesta autorização

Mudança privilegiada nova: substituir **somente helper diagnóstico de janela e política de janela**, arquivando ambos. É mudança de bytes root além da simples política; exige revisão/autorização específica. Nenhuma ampliação sudo, DB/backend, helper permanente ou política permanente. A regra literal permanece `/usr/bin/python3 -I -S /usr/local/libexec/re7/frontend-socket-observer.py`.

Após aprovação específica, na sessão sudo de Deifson (senha nunca no chat):

```bash
set -euo pipefail
P=/opt/re7online/backups/converta-persistent/preparations/frontend-3227b2d7-observation-v2-20261011T101500Z
test "$(sha256sum "$P/install-observer-window-policy.sh" | cut -d' ' -f1)" = 91d355597051a84cbbcdf4d9eaf5fd0f9dbb900412f08595dfe074d9d86f7079
bash "$P/install-observer-window-policy.sh"
```

[Instalador integral revisável](install-observer-window-policy.sh): lock exclusivo, dois manifests, checker de proposta, hashes origem/resultado, cadeia root, modos, regra literal, visudo; arquivos antigos arquivados em `/usr/local/libexec/re7/frontend-socket-observer.pre-observation-v2-101500.py` e `/usr/local/libexec/re7/frontend-socket-observer-policy.pre-observation-v2-101500.json`. Depois checker estrito e [preflight preparatório](run-preparatory-preflight.py) existente limitado a3 leituras transientes/45s. Destino histórico existente, instalação parcial, drift, timeout ou recusa interrompem; preservar estado/diagnóstico, sem repetir bloco/alterar bindings. Não existe rollback automático de instalação. Antes de qualquer recuperação privilegiada, inventariar quais bytes ficaram instalados e submeter a ação específica; produção não deve ser parada.

O preflight guarda cada negativa, dados root600 e uma captura preparatória arquivada. **Nunca** usar essa captura como saída. Recusa PermissionError/instalação/binding/sobrevivente não recebe retry para obter PASS. Recusa transiente não implica causa conhecida: só uma leitura nova completa pode permitir continuar; churn persistente nega.

Somente após instalação/preflight aprovados será decidida a janela. [WINDOW-STEPS completo](WINDOW-STEPS.txt) preserva a cadeia canônica: lock → hashes/checker estrito/capacidade e identidade frescas → `before` novo → gate → stop → exited novo → delete → single start candidato → ready30s/30tentativas → identidade/BUILD_ID/CSS HTTP → confirmação owner → checar política permanente existente → supervisão → save/fallback → gatefalse. Nenhuma parada API/worker, nft ou mudança guarda/scheduler/cron/boot/DB/auth. Saída source/candidate/return sempre observação root nova; start-intent nunca repetido.

Retorno selecionado pelo estado real: antes da parada, só abortar; origem parada sem intent candidato exige saída source comprovada; candidato com qualquer intent exige stop e candidate-exited novo, incluindo morte precoce; só então single start-return fa60, readiness/identity/CSS, owner e promoção/save. Sobrevivente, proprietário adicional, listener ou observação incompleta bloqueiam sucessor. Falha do retorno exige preservar diagnóstico e comprovar saída; sem nova partida. Aos15min desde stop, comunicar estado/impedimento; não autoriza bypass/kill. Políticas/bindings daemon/boot divergentes exigem nova revisão, não ajuste automático.

## Pendências objetivas

1. Revisar os novos bytes do helper/política e instalador; autorizar especificamente a instalação. Não executada nesta etapa.
2. Deifson verificar pela sessão sudo a regra/arquivos root e executar o preflight sob novos bytes. A observação atual do helper antigo não substitui esse resultado.
3. Só com esse PASS e nova decisão de janela, reler capacidade/WAL, ledger/inventário, identidades/configurações/dumps/sessões e gates imediatamente antes da parada; baseline drift bloqueia sem adaptação.
4. Confirmação owner após prontidão de layout/sessão/Inbox/CRM/Campanhas antes de promoção/save. Frontend3227 permanece pendente de implantação; API preventiva já implantada/aceite funcional permanece separado.

CSV/Syer, internacional, agrupamento multilote natural, contingênciaAUTO natural e CRA-PR seguem separados. Recuperação .6 encerrada não foi reaberta; históricos e aceites anteriores preservados. Não houve instalação, stop/start/restart, promoção/save, deploy, envio, abertura, retomada ou mudança de configuração produtiva.

## Resultado da instalação autorizada — 11/10/2026

**HELPER/POLICY INSTALLED AND CHECKED / PREPARATORY PREFLIGHT SETUP DENY / NOT DEPLOYED.** Não avançar à janela. O estado “proposta não instalada” acima é histórico da publicação2a9e8f06; os bytes agora estão instalados.

O owner executou o instalador91d35559 publicado. Manifests, composição, hashes origem/resultado/arquivos arquivados, cadeia root/modos, sudoers literal e visudo passaram. Saída confirmou root:root644 helper novo/arquivado, root:root600 políticas nova/arquivada e root:root440 regra inalterada. Conferência posterior por deploy confirmou helper instalado `c885486f0a34c15f6b2a66af311eb151bc66f8d22c9790c35ae729dff1cbad30` e arquivo anterior `93564f78ad2286621b465f713f82ac5d37d031518c92be9110dcf934412af385`. A política nova `7a9615f9685cc818d0b4254908d3fea482d056207b8bb81e420ce7367bbfd472` e a arquivada `c67cf7327f236b4ad12ce34b7eee22f5251d2720958f7646ecce26a32746e121` tiveram igualdade conferida no bloco sudo executado pelo owner; não foi fingida leitura direta do conteúdo root600 por deploy.

**Falha comprovada:** `run-preparatory-preflight.py:10 → preflight.run:133 → folder.mkdir(mode=0o700)` lançou `FileNotFoundError`, pois o pai `receipts-private` não existia na nova preparação. Foi uma omissão de composição do preparador. Nenhuma chamada `attempt`/observação root do novo preflight foi alcançada; não é recusa de ownership e não identifica a causa histórica anterior. Não há recibo de preflight, captura preparatória arquivada nem PASS integrado. `DIAGNOSTIC_HELPER_POLICY_INSTALLED_PREFLIGHT_PASS_GATES_FALSE` **não foi emitido**.

O preparador reaproveitou um driver cujo contrato pressupõe esse diretório. Os12 testes anteriores usam um ambiente que já satisfaz essa pré-condição; não comprovaram o setup da geração vazia. [Reprodução dirigida](test_preflight_setup.py): driver real `run`, raiz nova sem pai, FileNotFoundError e zero chamadas à etapa de observação — **1 PASS**, apenas reprodução local. A primeira tentativa do teste local não importou o cliente canônico; a dependência foi corrigida apenas no teste e o resultado final acima não foi atribuído àquela tentativa. Sem suíte ampla, rebuild ou alteração dos módulos/preparação instalados.

**Estado efetivo pós-falha:** leitura delimitada 10:33:18–10:33:20 UTC /07:33:18–07:33:20 Fortaleza. Checker estrito `CONFIGURATIONS_POLICIES_IDENTITIES_AND_CONTROLS_PASS_GATES_FALSE` PASS; scripts/bindings originais PASS, gatefalse. API4049504/ticks2146911015, worker4049657/ticks2146911319, fa604051349/ticks2146939624 preservados. Supervisor permanente e saved/fallback conferidos, health/DB e CSS fa60 PASS. Guarda fechada38/tasks{}, sem markers, inventário congelado/job suspenso, seis delivered reportados e cinco posições sem Outbound preservados. A auditoria de estado não repetiu o preflight nem o instalador. Política permanente, sudoers, launcher e controles de execução não foram alterados.

Diagnósticos privados pós-instalação e erro informado pelo owner preservados off-host. Uma falha da primeira captura auxiliar (arquivo não transferido devido à restrição DNS do sandbox) foi preservada; segunda captura READ ONLY em arquivo diferente passou. Isso não foi retry do instalador/preflight.

**Interrupção e próximo passo revisável:** nenhuma nova instalação, mkdir operacional, ajuste de binding, start ou observação integrada foi executado depois do DENY. Preparar revisão mínima da inicialização do diretório de recibos: criar uma única vez como deploy700 durante a preparação, validar propriedade/tipo/ausência de symlink, testar geração vazia e diretório divergente. Preservar o erro atual. Depois da revisão, executar exclusivamente o preflight já instalado, sob lock/gatefalse e mesmos bindings, somente mediante decisão de continuação. **Não executar novamente o instalador:** arquivos históricos já existem e a origem instalada já mudou. Não há necessidade demonstrada de trocar helper/política/sudoers para corrigir esse diretório. O preflight integrado segue pendente; a janela frontend3227 não está liberada.

## Preflight concluído após inicialização autorizada — 11/10/2026

**INSTALLED OBSERVER/POLICY VERIFIED / PREPARATORY INTEGRATED PREFLIGHT PASS / FRONTEND WINDOW DECISION PENDING / NOT DEPLOYED.** Este checkpoint supera o bloqueio de setup anterior, cujo erro/relatório/arquivos foram preservados. Não houve repetição do instalador.

Correção local no [preparador canônico](prepare-generation.py): `ensure_receipts_directory` chamado após criar a geração. Cria somente o nome fixo receipts-private com700 via dir_fd; valida lstat sem seguir symlink, tipo diretório, proprietário esperado, modo exato e identidade do descritor aberto. Diretório existente válido e seus recibos são preservados; divergência nega sem chmod/chown/substituição. A função foi exercitada diretamente, carregada por AST sem executar o restante do preparador: [7 provas dirigidas PASS](test_receipts_directory.py), geração vazia; existente válido/recibo íntegro; arquivo; symlink válido; symlink pendente; comparação de proprietário divergente; modos755/770/600. A negativa de proprietário usa UID esperado distinto com metadados reais, sem chown/sudo no laboratório. Não se atribuiu a esta correção nenhuma prova funcional antiga.

Na VPS foi usado o [driver de continuação](continue-preparatory-preflight.py), SHA`290d3469b6963f50a92668580a4ca724f44f6b4220daf398d7244999b66e07e6`, fora dos scripts/controles vinculados. Sob lock exclusivo: hashes dos dois manifests, arquivos, checker estrito, helper instalado/arquivado e metadados root, gatefalse e ausência de intents/captura arquivada conferidos. Criado apenas receipts-private, deploy UID1000/mode700. **Uma única invocação** de run-preparatory-preflight.py; orçamento interno existente intacto (até3 tentativas transientes/45s). A chamada concreta passou na **primeira tentativa**, elapsed0,927s, duas amostras root completas, classificação COMPLETE_CURRENT_OBSERVATION, zero negativas nesta invocação. O erro de setup anterior continua no relatório/evidência privada e não é apagado por esse contador.

Tempos: continuação 10:39:31–10:39:33 UTC /07:39:31–07:39:33 Fortaleza. Fonte da prova é o recibo real, stdout/stderr/exit e snapshot do reader root instalado. O cliente/contrato validaram boot/daemon/política/árvore/owners/freshness/integridade, com os hashes efetivos **helper c885486f…cbad30 e política7a9615f9…fd472**, completos acima. Exit0/timeoutfalse, duas amostras; captura arquivada em `source-tree.preparatory.private.json`, SHA`224c84978c85f6716938b6d7c2ba7e8f79b3d2c652f5f910e62820f4a36114ff`. A captura operacional source-tree.private.json foi retirada apenas pelo rename de arquivamento já previsto pelo wrapper; nenhuma captura consumida foi reutilizada.

Scripts/bindings produtivos **inalterados**: `6bd3c775e839bf53219c4b88a868bb46fb3da40f788107d91aa05109541310e5` / `7c40b7e6ec841b942d12891e03676a7986e8d129b34f109635a55020defd2c95`. Helper/política/sudoers/supervisão permanente/controles não foram alterados nesta continuação. A correção do preparador fica publicada para próximas gerações; não se executou o gerador completo sobre a preparação existente.

Cópia off-host da preparação+recibos/captura, SHA`1787bf1eb1a23dd460bd6a36bf35302607587a6134f8efb4ef45e37009f631ea`, conteúdo/manifests/recibo/captura verificados. Logs da continuação e leitura pós-preflight também preservados em privado. A cópia anterior f8cf5732 e erro de setup permanecem. Configurações, nonces, dumps e JSON root não estão no Git.

Leitura pós-preflight: 10:39:49–10:39:51UTC /07:39:49–07:39:51Fortaleza: API4049504/ticks2146911015/restart0; worker4049657/ticks2146911319/restart0; fa604051349/ticks2146939624/restart0. Supervisor permanente, saved/fallback, health/DB/CSS e controles preservados. Guarda fechada38/tasks{}, sem markers; inventário/job suspenso, seis resultados delivered reportados e cinco posições sem Outbound mantidos. Sessões não foram desconectadas; nenhum envio/claim/configuração mudou. Sem stop/start/restart, abertura, retomada, nova recuperação ou deploy.

**Próxima decisão:** janela frontend3227 pelo WINDOW-STEPS publicado, tar/provas existentes, retorno fa60. **Não instalar novamente helper/política.** Antes da futura parada exige lock, reconferência imediata de capacidade/identidades/controles/manifest/bindings e observação `before` nova; gates de saída também terão observações novas. O preflight preparatório não é certificado de saída nem autorização de janela. Confirmação owner de layout/sessão/telas permanece obrigatória antes de promoção/save/fallback. API funcional, CSV/Syer, internacionais, multilote/AUTO naturais e CRA-PR seguem frentes separadas.
