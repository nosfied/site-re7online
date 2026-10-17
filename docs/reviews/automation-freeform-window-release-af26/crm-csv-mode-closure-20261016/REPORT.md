# B4 — resolução autenticada por modo e consumidores Node

Base: `7ab912bf885b0b7e78fc723bcc1c1555170f259e`.
**LOCAL VALIDATED no alcance abaixo / INTEGRATION BLOCKED / REVIEW PENDING /
NOT DEPLOYED / NOT WINDOW READY. CSV SUSPENSO.**

Nenhuma VPS, instalação, emissão de autoridade, backup ou geração operacional.
Fontes aceitas, gerações consumidas, recibos e materiais privados preservados.
NEWauth+NEWDB+NEWcipher, ambos os crons, frontend, guarda38 e out.15 não foram
observados novamente nem alterados. Não há certificado produtivo novo.

## Resultado por lacuna

| Lacuna B4 | Delta e prova | Estado |
|---|---|---|
| recovery_bridge.verify_recovery_exit: import ops implícito | `code_mode` explícito; Loader autentica o modo. `mode` continua indicando o namespace do certificado existente. ORIGINAL usa código ORIGINAL e a prova histórica switch, sem mapear ops globalmente para switch. Mesmo restore/guard/certificate/old_absent/db_zero/exit_and_imports. | Código resolvido; certificados produtivos não renovados. |
| sequencer.Bridge.app_matches: switch fixo | Todos os callers passam modo. Operations é construído em root/mode; worker_capture_observation também resolve o modo explicitamente. Configuração usa os mesmos Operations.config e System.check_config. | Dependência de código resolvida. **Independência de diretórios inteiros NÃO fechada**, abaixo. |
| check_current: ops e require mutáveis | Ops switch explícito somente neste diagnóstico de quatro modos. Corpo SQL/noWork/baseline/proofs extraído do checker aceito para current-sql.cjs; child_transport e bootstrap autenticam seus bytes, imports e filho restore_contract. | Cadeia SQL dos quatro modos comprovada com dados sintéticos e transporte real; observações do host não certificadas. |
| node_bootstrap: node:assert/strict | Só o literal `node:assert/strict` é acrescentado; `assert/strict` sem prefixo e `node:module` continuam negados. waiting-work e frozen reais executados. | Resolvido localmente. |

O consumo de proofs revelou outra forma já canônica: `/usr/bin/python3 -B -I -S
<window/restore_contract.py> <modo>`. O transporte reconhece exatamente esse prefixo,
assim como a forma direta baseline já aceita. Não libera flags arbitrárias, Python
por caminho não declarado ou fallback. O mesmo filho precisa constar como entry e
na cobertura transitiva autenticada. Não foi criado parser/checker alternativo.

## Vínculo e ordem

1. A futura instalação revisada protege bootstrap, reader, bibliotecas e helper.
   Aqui só existem fontes propostas; nenhuma autoridade instalada é presumida.
2. Context consulta a autoridade e valida os mesmos pins/B2. Loader executa os bytes
   do snapshot, nunca um segundo import por caminho. `mode_module(mode)` requer
   entry `inspect` explícita, usa o MESMO Context, refaz snapshot e autentica todos
   os imports transitivos antes da execução. Não cria binding nem permit.
3. Quando existe permit, a seleção de modo reutiliza **o mesmo mapeamento** de
   `Context.start_mode`; sua finalidade explícita `closure` permite a observação
   após unfence. O default de partida permanece `start` e nega depois de unfence.
   ORIGINAL/CANDIDATE/expiração/troca de identidade continuam conferidos. Esse
   carregamento de biblioteca não autoriza intent ou partida.
4. Sem permit, inspeção/PRESTOP não fabricam autoridade de partida. R3 continua
   admitindo ida por âncora/execução/gates próprios, sem permit de recuperação.
5. Para check_current: entry Python autenticada → child_transport (Context + E1) →
   Node bootstrap → current-sql snapshot → preparation-bindings → waiting-work →
   frozen → filho Python bootstrap → restore_contract canônico nos quatro modos.
   A chamada de docker mantém BEGIN READ ONLY, statement_timeout8000 e ROLLBACK.
6. Revalidação no uso e nas fronteiras dos filhos preservada. B1 diagnóstico,
   B2 correlação, gates/certificados/seleção/intents exclusivos/consumo/replay
   não foram substituídos. B3 PM2 não foi alterado.

## ORIGINAL: limite que não foi escondido

O Loader e Bridge.app_matches funcionaram com **switch, return e return-partial
inteiramente ausentes**, carregando código ORIGINAL concreto e verificando a
configuração de um processo local. Nenhum overlay foi necessário.

Isso NÃO prova Recovery.inspect/recover completos sem esses diretórios. O contrato
R2 aceito exige explicitamente configs/plan selados dos quatro modos, cobertura do
review original, source/target profiles e outros controles. A classificação
STOPPED_UNSELECTED conserva a prova `switch/old-exit-confirmed.json`. Esses dados
são diferentes de código executável candidato. A prova negativa através de
Recovery.inspect/Loader mantém a negação quando faltam os inputs; não se suprimiu
R2, não se relocou certificado, não se criou classificador paralelo nem defaults.

Assim, a lacuna 2 está **parcialmente aberta no requisito de diretórios inteiros
absentes**. Antes de alegar esse fechamento será necessário revisar explicitamente
o layout canônico desses dados/provas e sua cobertura imutável — ou esclarecer
que os diretórios de evidência permanecem enquanto o código candidato está ausente.
Este incremento não toma essa decisão e não prepara uma janela.

## Provas executadas e simulações

[PROOFS.json](PROOFS.json): **21 provas dirigidas PASS**; recomposição exata de todos
os bytes; verificador estático B4 PASS e certificação operacional DENY esperada.
As execuções intermediárias detectaram anchors de transformação, um root switch
remanescente no construtor e a forma Python com flags; foram corrigidos antes da
prova final. O sandbox negou spawnSync com EPERM; subprocessos locais foram
executados com permissão de execução fora dele, sem rede ou VPS.

Reais: Context, validação/snapshot/Loader, imports transitivos, bootstrap Python,
VM Node/checkedRequire, processos locais Node→Python, Operations.config e
System.check_config sobre /proc do próprio laboratório; preparation-bindings,
waiting-work/closed/frozen e quatro restore_contract completos. SQL é uma resposta
sintética coerente: nenhum PostgreSQL ou SELECT produtivo foi executado.

Simulados: root/owner/sudo/consulta e metadados das bibliotecas protegidas;
população PM2; guard global lido via fixture; docker/SQL e evidências restore
sintéticas. A prova isolada de verify_recovery_exit troca SOMENTE observadores de
restore/guard/saída/DB por callbacks e para na ausência da prova Event: **não é**
um certificado de saída ou uma recuperação completa. O checker check_current
completo foi exercitado na negativa de inputs ausentes antes de comandos do host;
não se afirma PASS do host com mocks. Nenhum start/contain/stop foi executado.

Cobertura: modo inválido/divergente e entry ausente; leitura negada; adulteração
entre snapshot e novo uso; mesmos bytes conferidos após substituição; troca e
expiração da autoridade; leitura após unfence sem autorizar partida; R3 default,
consumo e PRESTOP; imports não declarados; waiting-work real; SQL quatro modos e
adulteração do binding negada **antes de docker**. As demais provas canônicas
aceitas não foram repetidas sem alteração. A prova PM2 completa B4 é reutilizada
com hash em [LAUNCH_INVENTORY.json](LAUNCH_INVENTORY.json).

## Composição e procedência

Fonte editável deste delta: [integration.py](integration.py). [compose.py](compose.py)
reutiliza o compositor B4 obtido do Git no SHA-base exato, confere seus bytes e
aplica o delta ANTES do scanner. Reutiliza todas as transformações B2/R3/B3/B1
na ordem aceita. Os objetos são cópias derivadas, não novas fontes de autoridade.

[COMPOSITION.json](static-kit/COMPOSITION.json): **123 caminhos / 57 conteúdos /
354.862 bytes únicos**. Cópia pequena necessária para congelar a composição concreta;
sem runtime, build, tar, perfis privados ou hardlinks/symlinks. Instalação futura
reutiliza install_static.py/verify_static.py B4 por referência versionada, sem
executar o instalador nesta rodada. Manifests identificam origens/hashes e entries
que deverão existir no futuro manifest de fase. Nada foi fabricado para PASS.

O scanner normaliza referências relativas Node como `../switch/...` para o mesmo
alvo declarado. O DAG de selagem eager permanece acíclico. Imports tardios e
back-calls já inventariados podem formar ciclo de chamadas; o Context coleta
snapshots com conjunto visited. Isso não é um ciclo de hashes/selagem e não
substitui validate_dag canônico. Dependências de chamada/entries são listadas
explicitamente, sem transformar diagnóstico quatro-modos em pré-requisito ORIGINAL.

**57 grupos de inputs operacionais ausentes** seguem em
[MISSING_INPUTS.json](static-kit/MISSING_INPUTS.json):32 dados por modo,20 grupos de
observação/contrato e5 owner/root/toolchain. Permanecem separados: inputs atuais,
toolchain protegido, instalação estática e autoridade específica de fase. Os cinco
entries inspect dos ops/current-sql e o entry do restore são requisitos de proposta,
não um manifest produtivo preenchido. Não foi emitido permit.

Composição SHA256: `93c774b95ab99ec6cd1a2c7f0a143f566dc514eb814b09ab2421171df0995fe3`.
[CONSUMER_DELTA.patch](CONSUMER_DELTA.patch) mostra somente a diferença dos arquivos
lógicos B4→nova composição. FULL_DELTA.patch representa a entrega em relação à
base, excluindo a si próprio e MANIFEST.sha256 para evitar autorreferência.
ALLOWLIST.json delimita a publicação; MANIFEST.sha256 cobre a entrega exceto si.

Reprodução local, usando apenas arquivos entregues/referências Git públicas:

```bash
python3 -B docs/reviews/automation-freeform-window-release-af26/crm-csv-mode-closure-20261016/reproduce.py
```

## Conferência de publicação

Branch review/campaign-recovery-20260926 no SHA-base e remoto sem avanço.
vercel.json mantém deploymentEnabled=false e o único workflow versionado só
aceita push/PR em main/develop; hooks executáveis locais ausentes. Nenhuma
configuração foi alterada. Allowlist sanitizada: três checkpoints e esta pasta.

`diff --check` integral aponta whitespace na representação dos patches (linhas de
contexto vazias) e nas três cópias exatas já aceitas de root_store,
canonical_renew_proofs e preparation-bindings (hashes3ee5dc72/4427aa5e/edf775c1).
Os bytes históricos foram preservados, não normalizados para esconder avisos.
Excluindo esses cinco artefatos de representação/cópia, a conferência é limpa;
não há whitespace novo no código editável/documentação. Consumer patch aplica
exatamente123 caminhos; FULL patch aplica exatamente sua allowlist declarada.

## Pendências e decisão

Aceite para revisão local dos deltas concretos; **sem certificação operacional**.
Lacuna de layout ORIGINAL acima continua aberta. Não preencher root,16 bindings,
pins de fase, perfis, observações ou permits para contornar a negativa. Instalação
futura e observações atuais requerem autorização própria. CSV continua suspenso;
nenhum comando de operação é entregue para executar nesta publicação.

Owner: Deifson. Revisão16/10/2026; próxima21/10 ou mudança, conforme runbook.
