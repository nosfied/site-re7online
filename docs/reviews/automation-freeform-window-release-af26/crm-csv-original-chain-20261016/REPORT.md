# CRM/CSV — cadeia ORIGINAL completa sobre a composição atual

Base: `d999ad969e66aa020a06593faba334a30d5eb292`.
**ORIGINAL CHAIN LOCAL VALIDATED / REVIEW PENDING / NOT DEPLOYED /
NOT WINDOW READY. CSV SUSPENSO.**

A cadeia ORIGINAL está comprovada no laboratório, mantendo o layout e todos os
verificadores R1/R2. Não houve VPS, instalação, emissão real, backup, SQL produtivo,
processos produtivos ou janela. A preservação de NEWauth+NEWDB+NEWcipher, frontend,
crons, guarda38 e out.15 decorre da ausência de intervenção; não é observação nova.
Inputs atuais, toolchain protegido e autoridade instalada continuam pendentes.

## Resultado e diferença entre código e evidência

`Recovery.inspect()` classificou STOPPED_UNSELECTED com opção exclusiva ORIGINAL.
`recover('ORIGINAL')` terminou com CSV_ORIGINAL_PAIR_RESTORED no laboratório,
API→worker uma vez, ambos os crons/supervisão restaurados, saved/fallback600
conferidos, gates falsos e barreira ausente. PRESTOP restaurou controles sem partida
nem permit de recuperação. Replay negado. [28 provas](PROOFS.json).

Foram retirados da fixture os módulos Python de switch/return/return-partial e o
runtime aplicativo candidato. Não foram retirados os diretórios, os planos,
configurações JSON, baselines, proofs/backup manifests, scripts/manifests de dados,
CJS de ecossistema nem `switch/old-exit-confirmed.json`/stop-start/inventário de
importações. O checker compara o CJS desses modos com a serialização JSON canônica;
não o executa. O nome `candidate.ecosystem.config.cjs` em ORIGINAL significa o alvo
do retorno ORIGINAL (par original), não a seleção da API CSV.

Os manifests sintéticos são criados uma vez, antes de Context: nos três modos não
usados contêm os dados exigidos; em ORIGINAL contêm também o código real completo.
O índice original continua não vazio e completo para seu escopo canônico. Todos
os dados obrigatórios R2, os imutáveis originais/compartilhados e os treze módulos
comuns exigidos por Contract continuam cobertos. Não se filtra um índice aprovado,
não se remove cobertura em tempo de recuperação e nenhum histórico é reescrito.
Esse é o uso do índice ORIGINAL dedicado já previsto por R2, não um novo layout.

O antigo requisito de ausência dos diretórios inteiros não é a independência
exigida nesta rodada: os diretórios permanecem como custódia de dados/execução.
A independência comprovada é de **código executável candidato**. O kit estático
completo continua incluindo fontes futuras dos quatro modos; a closure/fixture
ORIGINAL não as inclui nem importa/executa.

## Achado concreto e menor delta

A composição anterior passou na inspeção, mas negou na primeira partida ORIGINAL:
`DelegatedSystem.run() got an unexpected keyword argument 'pass_fds'`.
O caminho real era:

`Recovery.recover → Sequencer.start_pair → Bridge.protocol → delegated.main →
Operations.start → System.start → pm2_input.start → DelegatedSystem.run`.

O B3 já usa FD selado e System.run aceita pass_fds. O override delegado ainda tinha
assinatura anterior. A contraprova usa a composição anterior concreta, chega ao
ponto exato, deixa intent/proof consumido e não chega ao efeito PM2 de partida.

[delta.py](delta.py) muda somente o override delegado: recebe `*, pass_fds=()` e
repassa `pass_fds=pass_fds` ao super. A proibição de sudo permanece antes do
transporte. Os quatro delegated são deduplicados nos mesmos bytes; nenhuma ação,
permissão, gate, código funcional, classifier, parser ou autoridade foi alterada.
`CONSUMER_DELTA.patch` é o diff lógico exato contra a composição anterior.

## Consumidores concretos e fronteiras simuladas

| Segmento | Execução concreta | Simulação delimitada |
|---|---|---|
| Entrada e autoridade | Context/revalidate/correlation/snapshot, Loader com bytes conferidos, factory build e Recovery.inspect/recover | resposta root/clock/UID/cadeias protegidas; namespace produtivo mapeado para a única raiz temporária |
| R1/R2 | Contract, check_original, imutáveis/metadados/hashes, baseline/ecosystem, restore_contract completo, referências dos quatro modos, certificado geração/direção/configHash/identidades e exit_and_imports | dados e recibos sintéticos; restore não foi executado de novo |
| ORIGINAL/start | recovery_start.authorize_original_start e build reais, original_bindings/path_bindings com mapa não vazio e dois .data reais, gates/intents/consumo, ownership e db_owner_set_gate.verify | /proc, observador socket/proxy, docker/SQL e estado PM2 sintéticos |
| Delegação | Bridge.protocol e run reais; child_transport, Context/Loader, main/request/record/proof/execute, nonces, operation_lock e rename de consumo reais | filhos Python delegated despachados em processo pelo simulador de subprocess, sem fingir novos PIDs; root/helper/sudo são fronteiras simuladas |
| Partida | Operations/System.start/pm2_input, parser canônico e memfd Linux com os quatro seals, repasse efetivo do mesmo FD até a fronteira PM2 | PM2 recebe/consome o JSON do FD no simulador e altera população sintética; não há daemon ou API/worker de laboratório novos |
| Pré-liberação | Sequencer.verify_started/pre_unfence/worker_capture_observation/capture_worker_before_unfence reais, comparações duplas e registro privado | dados /proc/FD/sessão/HTTP worker e helper root sintéticos |
| Node/encerramento | Bridge.node, bootstrap/VM Node, execution-check, Python bootstrap/baseline/restore, validate.cjs/open.cjs, preparation-bindings/waiting-work; processos Node e Python filhos reais | fetch GET/SQL/PM2/guard respondidos exclusivamente por fixtures; POST não permitido no simulador; guard fechado preservado |
| Controles finais | DelegatedControls, ScheduledControls, save/fallback verificáveis na fixture, verify_recovery_closure, reset e verify_recovery_gates_false, recibo final | escritas PM2/save/cron/systemd/nft são efeitos no estado/arquivos sintéticos; captura pós-saída de custódia é efeito simulado |

Não há callback que devolva aprovação em lugar de Contract, check_original,
restore, certificado, bindings, gate de partida, configuração, ownership ou
encerramento. Apenas os pontos listados de namespace/observação/efeito externo
são substituídos. O corpo real System.check_config confere cwd/interpreter/env
através do /proc sintético. A conferência de propriedade root e a autenticidade do
observador privilegiado não são apresentadas como provadas por esses dados.

## Instrumentação e negativas

Loader registra cada caminho solicitado; audit hook registra cada exec Python da
preparação; VM Node e filhos Python têm registro próprio. Todos negam tentativa de
executar um caminho switch/return/return-partial. O caso positivo exige registros
Python e Node reais, nenhum código candidato, dados preservados e chamadas aos
verificadores canônicos. Contagens e caminhos sanitizados estão em
[LAUNCH_INVENTORY.json](LAUNCH_INVENTORY.json) e PROOFS.json; os perfis, bindings,
queries/respondidos, autoridade, dumps e recibos sintéticos brutos não são publicados.

Negativas dirigidas: evidência de saída ausente; dados/restore adulterados ou
faltantes; certificado37 versus guarda38 mesmo com inventário coerente; direção
ou hash de inventário divergentes; identidade antiga reaparecida; seleção incerta
e confirmada; início candidato sem confirmação; Event admitido pelo código novo;
execução/autoridade trocadas; permit vencido; resposta root perdida; gate falso;
mapa original ausente/adulterado; troca real do symlink .data após API e antes de
worker; código ORIGINAL substituído; resposta de partida ou unfence perdida;
consumo/replay. PRESTOP não parte. A negação depois do intent mantém consumo e
não publica certificado completo nem repete start automaticamente.

Os ensaios intermediários apontaram expectativas de erro incorretas nos testes
(import_exit_binding e hash de plano), corrigidas sem tocar verificadores. A coleta
de traces também relia arquivos após o cleanup do unittest; foi corrigida para
usar o snapshot anterior ao cleanup, com um gate próprio de consistência antes de
publicar a prova. Isso justificou a repetição focada da suíte desta cadeia. Nenhuma
suíte ampla anterior, rebuild, backup ou prova PM2 completa foi repetida.

## Composição, procedência e reprodução

[compose.py](compose.py) reutiliza a composição anterior fixada em Git e o compositor
B4 na ordem aceita; acrescenta apenas o delta delegado antes do scanner. Fontes,
transforms, imports, dependências e ordem de selagem são novamente inventariados.
123 caminhos,57 conteúdos,354.897B únicos; a cópia pequena congela os bytes completos
para revisão/reprodução e não contém runtimes ou dados operacionais. Não houve
nova geração operacional. O DAG eager continua acíclico; imports tardios mantêm a
cobertura canônica e não são tratados como ciclos de hashes.

Composição SHA256:
`f9a0a44a83073739ad3bcddfdbd697eb5723c89a88d31a0c68519a87005307df`.

O verificador estático B4 aceita os bytes e nega certificação operacional com
DENY_OPERATIONAL_INPUTS. Os57 grupos de inputs operacionais continuam ausentes.
Instalador, protected bootstrap, parser e transporte PM2 aceitos são reutilizados;
a prova PM2 completa B4 continua válida para o caminho inalterado. Esta prova nova
fecha o elo delegado de FD, sem alegar um novo ensaio CLI/daemon PM2.

O laboratório reutiliza o preparador Fixture publicado e o produtor sintético de
restore/closure da rodada anterior, com fontes Git/hashes conferidos. Os trechos
originalmente privados indispensáveis já eram sanitizados e publicados, com
procedência no SOURCE_PROVENANCE anterior; nenhuma fonte privada nova foi lida ou
publicada. As fontes editáveis novas são delta.py e os arquivos de laboratório;
os objetos do kit são derivados. [SOURCE_PROVENANCE.json](SOURCE_PROVENANCE.json)
identifica referências e versões locais de ferramentas.

```bash
python3 -B docs/reviews/automation-freeform-window-release-af26/crm-csv-original-chain-20261016/reproduce.py
```

Somente arquivos entregues/referências públicas fixadas; fixtures temporárias,
sem local-evidence. A suíte cobre esta cadeia ORIGINAL e suas interfaces, não
recertifica a ida ou os outros retornos completos. FULL_DELTA exclui a si e o índice
de hashes; ALLOWLIST delimita a publicação. Não há comandos de janela.

## Conferência de publicação

Branch/base/remoto conferidos. deploymentEnabled=false para a branch; único
workflow versionado aceita push/PR somente main/develop; hooks locais executáveis
ausentes. Nenhuma configuração foi modificada. O patch de consumidores aplica
exatamente os123 caminhos da composição anterior para a nova.

Whitespace herdado é mantido em três objetos aceitos (root_store,
canonical_renew_proofs e preparation-bindings). Os patches têm também linhas de
contexto vazias, representadas por espaço. Esses avisos do diff integral são
explicitados em PUBLICATION_CHECKS; código editável/documentação devem passar
separadamente. Não se normalizam bytes aceitos para ocultar os avisos.

## Pendências e estado final

A independência executável ORIGINAL está fechada **localmente nesse alcance**.
Não há outro elo candidato aberto na cadeia exercitada. Continuam indispensáveis
os dados/evidências canônicos: ausência de qualquer um nega, não autoriza fallback.

Permanecem separados os inputs atuais e16 vínculos, configuração/identidades,
observações root/SQL/proxy/crons/supervisão, integridade e instalação do toolchain
protegido, instalação estática e autoridade específica de fase pelo owner. Nada
foi preenchido para obter certificação operacional ou autorização de janela.
Históricos/instalações/recuperações consumidas e trabalhos privados preservados.

Deifson; revisão16/10/2026; próxima21/10 ou antes de mudança. CSV SUSPENSO.
