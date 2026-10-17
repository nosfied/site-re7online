# B4 — composição estática concreta e instalador futuro

**PREPARED LOCALLY no alcance abaixo / INTEGRATION BLOCKED / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY. CSV SUSPENSO.**

Base `67ce9076c489f025d7a24727eca7ccac093edf30`, branch `review/campaign-recovery-20260926`. HEAD/remoto conferidos iguais antes do incremento. Consultados checkpoints canônicos, política de mudanças, checklist, composição anterior e relatórios autoridade/R3/B2/B1/B3. Nenhum AGENTS.md aplicável localizado no checkout/ancestrais. Históricos, fontes aceitas e materiais privados preservados. Sem VPS, instalação root real, emissão, backup, rebuild de aplicação, geração operacional ou janela.

## Resultado e limite de B4

O [compositor](compose_static.py) reutiliza a seleção/procedência do compositor aceito por meio de `CODE_REVIEW_INDEX.json`, publicado na rodada anterior. Reconstrói os **110 caminhos / 48 conteúdos** anteriores a partir de 105 referências de entrega e cinco referências Git, todas por SHA. Não executa o compositor histórico, não lê seu template privado e não depende de `local-evidence`. A proposta antiga de política não é carregada como autoridade. `window/privileged.py` retido no índice é fonte não instalada: o instalador novo usa exclusivamente os alvos `protected/*`, nunca esse helper antigo como atalho.

A composição final tem **122 caminhos lógicos, 56 conteúdos únicos, 353.374 bytes lógicos únicos**. [COMPOSITION.json](static-kit/COMPOSITION.json) relaciona caminhos, objetos deduplicados, origem, hashes, estágios de transformação, imports, DAG de imports imediatos, chamadas tardias, inputs ausentes e bloqueios. Os bytes concretos estão em `static-kit/objects/*.source`, sem hardlinks/symlinks de preparação. Não foram copiados runtimes de API/frontend/worker. O pequeno repositório de objetos evita quatro cópias das bibliotecas iguais; é código público de revisão, não um pacote executável operacional.

O manifest estático tem SHA256 **`0217eb536c65fd0dd49512eaced4ec2bd3b31c60af193653aa928d15519f8f72`**. Ele é **STATIC_CODE_COMPOSITION_NOT_PHASE_AUTHORITY**: não é o `manifest.json` do Store, nem política do helper. Não contém UID de produção, perfis, JSON/CJS privados, âncora ou permit. Sua certificação é deliberadamente **DENY_INTEGRATION_AND_OPERATIONAL_INPUTS**.

## Ordem integrada e fontes editáveis

1. Composição ACCEPT LOCAL/prevenção/R1/R2 e controles já publicados: mesmo índice-fonte, mesmo conteúdo-base.
2. `integration.py` de B2, que já incorpora R3: recovery, bridge, start gate, sequencer, Operations, delegated e execution-check. Não aplicar novamente a transformação inicial de autoridade ou R3 em cima desses bytes.
3. B1: authority/bootstrap/child_transport/Node bootstrap/diagnóstico nas versões finais aceitas; Store e verified_loader das fontes iniciais aceitas. Mesmo coletor privado canônico em window/modos/root; nenhuma implementação paralela.
4. B3: transporte imutável de System.start, parser canônico por bytes e pm2_input de cada modo. JSON/CJS futuros continuam ausentes; não renderizar de perfis inventados.
5. Extensão de helper/sudoers **já aceita**, com somente a consulta literal de autoridade. Não foram acrescentadas ações de instalação/emissão ao sudoers.

Fontes editáveis deste delta: `compose_static.py`, `install_static.py`, `verify_static.py`, `test_b4.py`, `lab_pm2.py` e `reproduce.py`. As fontes anteriores continuam canônicas em suas publicações; os objetos são saídas compostas imutáveis para revisão, não 56 novas fontes editáveis. A procedência por arquivo e os hashes das transformações estão no manifest; [PROOFS.json](PROOFS.json) fixa os arquivos de engenharia desta rodada.

## Fechamento transitivo: alcançado e recusado

Os quatro modos incluem concretamente Operations/System, delegated, módulos Node, baseline, parser, controles e pm2_input. Bibliotecas protegidas, helper e regra futura também estão materializados. Foram inventariados `Bridge.protocol → delegated`, `Bridge.node → launcher Node → launcher Python → baseline`, os imports dos verificadores e o transporte PM2. O [inventário de lançamentos](LAUNCH_INVENTORY.json) separa código presente, dados ausentes e efeitos não exercitados.

O DAG de **imports imediatos** possui 122 nós e ordem topológica completa. Há um ciclo de **imports/chamadas tardias** inventariado: `Operations → csv_start_gate → recovery_start → recovery → recovery_bridge → csv_cli → recovery`. Isso não é automaticamente um ciclo de hashes: o contrato canônico distingue dependências do manifest de imports tardios e seu snapshot evita recursão por objetos já visitados. Não foi criado um novo predicado que proíba Python por conter imports tardios. Também não se usa esse detalhe para declarar o pacote certificado: o vínculo real dos modos/entradas continua pendente e os bloqueios abaixo não foram omitidos.

**Quatro lacunas de integração impedem certificação; não foram corrigidas silenciosamente nesta composição:**

| Consumidor concreto | Lacuna e consequência | Evidência |
| --- | --- | --- |
| `recovery_bridge.Bridge.verify_recovery_exit` | `import ops` não tem resolução autenticada específica do modo no módulo compartilhado. Mapear globalmente para switch faria ORIGINAL depender do candidato. | AST/manifest: `window/recovery_bridge.py → ops` permanece não resolvido. |
| `sequencer.Bridge.app_matches` | A transformação aceita chama `local_module(self.switch/'ops.py')`. O ramo ORIGINAL precisa revisão explícita para não exigir esse código candidato. Não se inseriu switch na closure original para PASS. | Fonte composta; requisito preservado como gate bloqueado. |
| `check_current.check_current` | `import ops` implícito e subprocess `node -e` que faz require de `switch/preparation-bindings.cjs` fora do bootstrap autenticado. A existência do texto Python autenticado não prova os bytes relidos por esse require. | AST/fonte concreta; sem execução desse checker contra serviços. |
| `node_bootstrap.checkedRequire` | As fontes reais waiting-work usam `node:assert/strict`, ausente do allowlist aceito. Não é uma dependência npm faltante: é builtin Node não autorizado pelo leitor atual. | Contraprova executa o loader Node real com snapshot sintético: `node_import_undeclared:node:assert/strict`. |

O inventário contém **67 pendências**, sem preenchê-las: 32 arquivos de modo (oito por modo), 20 grupos canônicos de observações/contratos, cinco grupos owner/root/toolchain e dez arestas não resolvidas (duas `ops`, oito usos do builtin nos quatro modos). Esses 67 registros não são 67 credenciais ou ações do owner. [MISSING_INPUTS.json](static-kit/MISSING_INPUTS.json) traz os nomes e as fontes exigidas.

Ainda precisam materialização revisada os 16 vínculos de namespace da composição anterior, fonte efetiva da política e referências imutáveis. O template `csv_contract.POLICY_SOURCE=fa113e…` é histórico; o último recibo e2a5… também não é observação atual. Nenhuma constante/binding foi adaptada para PASS. Não se fabrica `recovery_binding.py`: seus antigos três pins passam pelo Context/Store já aceitos, quando a futura autoridade puder ser instalada e observada.

PRESTOP continua sem partida nas fontes aceitas; ORIGINAL conserva sua fonte própria e original_checks. A composição **não certifica** independência operacional completa de ORIGINAL, precisamente pelas arestas acima. As provas locais anteriores permanecem válidas no alcance declarado, mas não suprem esses elos do pacote completo.

## Selagem sem autoridade circular

A ordem proposta reaproveita a canônica, sem emitir os índices operacionais:

1. Folhas de código e bibliotecas protegidas; objeto tem somente hash de seus bytes.
2. Perfis/dados reais e JSON/CJS correspondentes de cada modo, quando autorizados; índices de scripts excluem a si próprios.
3. Referências imutáveis e review **original-only**, separado de mapas/overlay candidatos.
4. Contrato de recuperação sobre perfis/referências/código/review, sem pin de si mesmo.
5. Política de fase a partir das identidades/controles observados, sem embutir hash de âncora ou permit.
6. Manifest de fase com bytes, metadados reais e relações de imports/entradas resolvidas. Deve cobrir as dependências de JSON/CJS/parser e os filhos; não pode ser o manifest estático desta revisão.
7. Âncora aprovada pelo owner: hashes de manifest/contrato/política/perfis. Código não contém pin literal dessa âncora.
8. Instalação estática de autoridade pelo método existente `Store.install_owner_once`, somente com dados aprovados.
9. Em recuperação: classificação fresca, execução correspondente e decisão explícita; `Store.issue_owner_once` emite uma vez o permit específico, com frescor canônico. Permit/intent/recibo não voltam aos índices estáticos nem são criados por consulta.

B4 não instala Store/âncora, não emite permit, não seleciona candidato nem altera perfis/tempos. A consulta continua somente leitura. Não há chave, assinatura, serviço ou autoridade nova.

## Instalador concreto futuro, não executado em destino real

[install_static.py](install_static.py) instala **somente fontes estáticas**. Não é instalador de política de fase, nem emissão de autoridade. Destinos fixos:

- `/usr/local/libexec/re7/{authority,root_store,verified_loader,child_transport,privileged_output}.py`;
- `/usr/local/libexec/re7/recovery-launch.py`, `recovery-node-launch.cjs`, `incident-6683-window-control.py`;
- `/etc/sudoers.d/re7-incident-6683-window`: mesma regra proposta aceita, sem delegação de owner APIs;
- `/usr/local/libexec/re7/pm2-input.json` → `/proc/self/fd`.

Exige owner/euid0, confirmação literal, digest do pacote revisado e digest separado do inventário **atual** dos destinos/pré-condições. O argumento não se torna autoridade por existir: o fornecedor é o owner na instalação revisada, conforme a confiança canônica. Diretórios root protegidos e lock canônico existente são pré-condições, não são corrigidos/criados para PASS. O diretório root de custódia estática também precisa existir; é listado em INSTALL_PLAN.json como dependência futura.

Antes de efeitos: lê todos os payloads, confere hashes/tipos, inventário exato dos destinos, metadados/cadeias e alias; adquire `/var/lib/re7/incident-6683-v4-control.lock`; reconfere estado e executa `visudo -cf` em arquivo de estágio. Depois grava intent exclusivo/backup privado, instala por arquivo temporário exclusivo/rename com fsync e revalida cada origem no uso. Alias conflitante nega, sem reparo. Recibo somente após inspeção de todos os alvos e segunda validação sintática da regra.

Em parcial: preserva intent e backups, não repete, não reverte automaticamente e não declara complete. A função READ ONLY `inspect` permite mostrar alvos satisfeitos/faltantes. O instalador não toca política JSON vigente, fase, gates, processos, perfis, dados, crons, .env ou credenciais. Não executa helper/Store/PM2.

A emissão owner e a instalação da âncora continuam APIs distintas existentes; não foram adicionadas ao helper de consulta. Faltam os inputs reais, portanto não há comando pronto de emissão. [COMMANDS_FOR_REVIEW.txt](COMMANDS_FOR_REVIEW.txt) distingue verificação local executável de chamada futura parametrizada **bloqueada**, e mostra como autenticar os bytes do próprio instalador antes de compilá-los como root; sem hash-then-import de caminho deploy mutável.

O instalador não instala um toolchain PM2/Node novo. Proteger/atestar o toolchain efetivamente escolhido, com suas dependências e a possibilidade de substituição dos seus caminhos, continua condição de certificação. O PM2 usado no laboratório não foi selecionado para produção.

## Evidência B3 ampliada: CLI/toolchain completos reais

[PM2_LAB_PROOF.json](PM2_LAB_PROOF.json) registra **PM2 6.0.14 e Node v22.13.0 reais**, com CLI original/shebang, daemon, parser, normalização, IPC e dois processos Node sintéticos. `PM2_HOME`, HOME, cwd, logs, arquivos de reporte e dump são exclusivos de diretório temporário. Não há porta, HTTP, SQL, provider, segredo ou artefato de aplicação. Isso é isolamento de namespace/ambiente, não alegação de container/network namespace de kernel.

O ensaio usa `pm2_input.sealed_fd` de B3 e passa o FD herdado ao CLI completo com `--only` na ordem API→worker. O CJS de origem é substituído por um `throw` antes do CLI e não é executado. Os filhos comprovam cwd, interpreter e env sintéticos; jlist confirma configuração, população e estado online; save produz dump somente no namespace do laboratório. Kill encerra esse namespace, e saída do daemon/filhos é observada antes de remover o diretório temporário.

**Não foram simulados** PM2, parser, módulos transitivos, IPC, daemon ou filhos nessa prova. **Não foram exercitados nessa prova** Context/consulta root, System/Operations de produção, alias root real, Node20 ou observação produtiva. A integração System/Context→FD permanece a prova B3 aceita; esta prova amplia especificamente o elo FD→CLI→daemon→filhos. Não se declara um ensaio único de toda a janela/recuperação.

O PM2/dependências públicos foram obtidos em `/tmp`, com npmrc vazio separado, registry explícito e scripts de instalação desabilitados. Não houve build de produto. [package-lock.lab.json](package-lock.lab.json) conserva o lock realmente usado (referência `file:../re7-b3-pm2-6.0.14.tgz`, tarball público já pinado em B3). [TOOLCHAIN_FILES.sha256](TOOLCHAIN_FILES.sha256) indexa 4.552 arquivos; symlinks e custos do laboratório estão no resumo próprio. Não se publica node_modules, cache ou runtime.

As primeiras tentativas foram recusadas pela duplicidade de npmrc `/dev/null` e depois pela restrição de sockets do sandbox. Foram corrigidas apenas as condições do laboratório, com autorização da ferramenta para a execução local; nenhum serviço produtivo foi usado. Uma reexecução afetada comprovou adicionalmente a saída do daemon. O Node20 do contexto histórico não foi obtido nem presumido; compatibilidade do Node efetivo permanece gate futuro.

## Provas dirigidas e reprodução

**18 testes focados PASS**, mais a prova PM2 completa acima. [TEST_OUTPUT.txt](TEST_OUTPUT.txt) e [PROOFS.json](PROOFS.json) detalham o alcance. Exercitados compositor/indexador aceitos, transformações reais, verificador READ ONLY, instalador concreto e loader Node real na contraprova. Efeitos externos de produção nunca foram chamados.

No instalador de laboratório, gravação exclusiva, rename, backup, intent/recibo, lock e fsync foram reais em destino temporário; `visudo -cf` foi real sobre a regra de laboratório. **Euid/UID root e ancestrais root externos foram simulados** pelo adaptador explícito. Uma fixture inicial herdou modo775 do umask e negou; a fixture válida passou a declarar seus metadados sintéticos antes do teste. Há contraprova separada que mantém775, exige DENY e comprova ausência de correção automática.

Outras negativas: payload/manifest adulterado, biblioteca ausente, origem divergente, alias incorreto, dependência/ciclo sintéticos, instalação parcial e repetição. O checker canônico `csv_contract.check(live=False)` também foi chamado: nega `window/csv-contract.private.json` ausente antes de efeitos; não foi preenchido para PASS.

`reproduce.py` recompõe em diretório temporário apenas o kit estático e compara **todos os bytes** com a entrega; executa somente os18 testes do delta. Sem Git privado/local-evidence. O PM2 completo é opcional mediante toolchain local explícito; não há download ou instalação implícitos no reproducer. Provas anteriores de prevenção/recuperação/R3/B2/B1/B3, runtime/grant/SQL/restore foram reutilizadas; nenhuma suíte funcional ampla foi repetida.

## Separação final dos requisitos

| Comprovado localmente | Depende de instalação futura | Depende de observação atual |
| --- | --- | --- |
| Bytes concretos/dedup/procedência; quatro modos estáticos; replay/negativas do instalador; visudo sintático; CLI/PM2/IPC/filhos sintéticos | Bibliotecas/alias/helper/regra protegidos; Store/âncora revisados; diretórios/lock/custódia root; toolchain protegido; emissão owner específica quando cabível | PIDs/ticks/árvores/sockets, NEWauth+NEWDB+NEWcipher, root/política/fase, guarda/Event/SQL/proxy, crons/supervisão, saved/fallback, perfis,16 vínculos, capacidade/WAL e RPO/custódia/restore |

Observações atuais, sourcePolicy, bindings, dados JSON/CJS e entradas/escopos de autoridade **não foram fabricados**. As quatro lacunas de integração exigem delta específico revisado; não se deve pedir uma janela para descobri-las. Próxima decisão local recomendada: resolver o carregamento autenticado por modo de `ops` e os caminhos compartilhados, preservando ORIGINAL, antes de certificar o fechamento completo.

Na conferência de publicação, `diff --check` do código novo/documentação passou. A conferência integral registrou quatro avisos herdados: EOF em branco de root_store.py e canonical_renew_proofs.py, espaço final em preparation-bindings.cjs e a repetição dessa linha no patch. Os três objetos são byte a byte iguais às fontes aceitas, com hashes/procedência em PROOFS.json; não foram normalizados para alterar os bytes aprovados. O FULL_DELTA exclui a si próprio e o índice MANIFEST.sha256; usa contexto zero, conferido com `git apply --unidiff-zero --reverse --check`.

Somente três checkpoints canônicos acrescentados; relatórios/gerações/manifests/intents consumidos e todos os arquivos privados permanecem intactos. Segurança externa continua OPEN/adiada conforme aceite; revisão21/10 ou gatilho permanece. Produção, NEWauth+NEWDB+NEWcipher, ambos crons, guarda38 e out.15 não foram acessados nem alterados.

**PREPARED LOCALLY / INTEGRATION BLOCKED / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY.**
