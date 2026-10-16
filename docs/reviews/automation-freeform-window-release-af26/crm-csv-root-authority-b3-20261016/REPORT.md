# B3 — consumo imutável do ecosystem pelo PM2

**LOCAL VALIDATED no limite de consumo ensaiado / FECHAMENTO CONDICIONADO A B4 / INTEGRATION BLOCKED / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY. CSV SUSPENSO.**

Base `1ad3507bea96dc2c5aa12debdabf1c7e70ece733`, branch `review/campaign-recovery-20260926`. Consultados runbook, backlog, índice, política de mudanças, checklist e relatórios autoridade/R3/B2/B1. Nenhum AGENTS.md aplicável localizado no checkout/ancestrais. Apenas fontes futuras e checkpoints locais; nenhum arquivo histórico/selado foi modificado. Sem VPS, emissão, instalação, daemon PM2, geração operacional, rebuild ou janela.

## Caminho real e contraprova

A fonte completa de Operations/System está versionada em `crm-csv-review-publication-20261016/code-sources/ops.py.c84a5e059cbc.source`, SHA256 `c84a5e059cbc75ee8114bbb36f90f92d7de7516f4433de4680cc46b592ae6d3e`. Não foi necessário reconstruir código privado. A transformação B2 autenticava os módulos e inseria `Context.start_mode` antes das precondições e do efeito; o efeito ainda era:

```python
# Operations.start, depois de gates/certificados/ownership e intent exclusivo
self.d.start(self.root, name)
# System.start
self.apps()  # não ressuscitar daemon ausente por observação implícita
self.run([PM, 'start', str(root / 'candidate.ecosystem.config.cjs'), '--only', name])
```

O PM2 6.0.14 resolve esse caminho em `_startJson`, lê o arquivo e chama `Common.parseConfig(data, file)`. Para `.config.cjs`, o parser ignora `data` e executa `require.resolve` / `delete require.cache` / `require(confPath)`. Portanto, outro hash imediatamente antes da chamada não vincula os bytes executados. A contraprova usa a classe System original concreta, seu run/transporte e os trechos originais do PM2: a substituição no intervalo produz um canário sintético pela execução do CJS alterado. Não houve daemon ou processo da aplicação.

Os trechos públicos foram extraídos do pacote npm **6.0.14**, após conferir `dist.integrity` SHA512 do tarball. URL, gitHead, intervalos, hashes do original e da entrega e licença estão em [SOURCE_PROVENANCE.json](SOURCE_PROVENANCE.json). Nenhuma dependência npm foi instalada. A evidência é sobre essa versão, sem nova observação do PM2 produtivo.

## Menor delta e cadeia de confiança

[Integração](integration.py) é uma transformação pura **posterior à integração B2**:

1. `System.run` aceita `pass_fds`, mantendo CLEAN, subprocess.check_output e o transporte dos filhos.
2. `System.start` mantém `self.apps()` e delega somente o transporte da configuração a [pm2_input.start](pm2_input.py).
3. `Operations.start` não muda: comparação AST comprova identidade do método antes/depois de B3. Gates, restore, certificados, geração, ownership, seleção, intent, metadados e verificações pós-partida permanecem nos consumidores canônicos.
4. O parser de `ecosystem_contract.source` é extraído para `source_bytes` em fonte futura. `source(path)` conserva os predicados de arquivo/symlink e o mesmo parser. Não há schema alternativo, defaults ou execução do CJS; duplicatas, JSON inválido, Unicode inválido e shape continuam negando. A transformação é ancorada e nega fonte inesperada.

O bootstrap/Loader de B1/B2 continua sendo a entrada. O manifest aprovado deve declarar `ops → pm2_input → ecosystem_contract`, além do DAG de dados `pm2_input → CJS → JSON + ecosystem_contract`. Não há aresta inversa. `pm2_input` é código da preparação autenticado pelo Loader, não import de sys.path nem nova biblioteca root implicitamente confiável. `Context.snapshot(CJS)` exige entrada autorizada e valida bytes/metadados e dependências transitivas. O parser carregado pelo Loader precisa corresponder aos mesmos bytes incluídos nesse snapshot. Ausência, leitura negada ou divergência propagam DENY antes do subprocess PM2.

O CJS deve ser **exatamente** `rendered(source_bytes(JSON))`. Esse contrato já proíbe lógica adicional e `require()`; não existem dependências CJS executáveis legitimamente aceitas que possam ficar fora da cobertura. A serialização literal vem do mesmo renderer canônico e preserva integralmente apps, env, cwd, script, interpreter e supervisão. Somente API ou worker podem ser selecionados, com o mesmo `--only`; frontend continua fora da partida deste consumidor.

O payload JSON é escrito em `memfd_create(MFD_ALLOW_SEALING|MFD_CLOEXEC)`, com tratamento de escrita curta, rewind e os quatro seals WRITE/GROW/SHRINK/SEAL. `F_GET_SEALS` confirma o estado. O FD é passado exclusivamente ao subprocess por `pass_fds`, sem secret argv/env, arquivo temporário em disco ou protocolo stdin por chunks. O FD fecha em sucesso ou exceção; perda de resposta não repete a partida e não cria complete.

`Context.start_mode` é revalidado imediatamente antes de invocar o PM2, depois de preparar o FD. Mantém a distinção R3: switch usa autoridade estática/execução/seleção canônicas, sem permit de recuperação; ORIGINAL exige permit ORIGINAL e seus próprios artefatos; return/return-partial exigem CANDIDATE. PRESTOP não invoca start. Emissão, consulta, consumo e fechamento não foram alterados.

## Fronteira do descritor e condição B4

O caminho proposto é `/usr/local/libexec/re7/pm2-input.json/FD`. O prefixo fixo é uma **futura** ligação root-owned para `/proc/self/fd`, com ancestrais root-owned sem escrita group/other. O consumidor confere cadeia, tipo, owner e destino literal; não cria nem corrige nada. O PM2 6.0.14 reconhece `.json` no prefixo e lê o descritor herdado, imutável. Um FD simples `/proc/self/fd/N` não é reconhecido como config pelo CLI; `pm2 start -` também foi descartado porque o CLI processa apenas o primeiro chunk de stdin. Não foram adicionados symlinks a preparações seladas nem um spool de segredo.

**B4 permanece aberto e condiciona o fechamento operacional de B3**:

- revisar/provisionar essa ligação estática e conferir a cadeia real; hoje ela não foi instalada;
- atestar Linux/procfs, herança do FD pelo executable/shebang/Node reais, PM2 6.0.14 e seu parser;
- vincular executable PM2, Node, CLI e dependências transitivas ao pacote/instalador revisados, incluindo normalização e IPC posteriores ao parser;
- incluir helper novo, parser transformado, JSON/CJS e dependências nos quatro manifests/provas e seus índices na ordem canônica antes da instalação da âncora;
- materializar perfis/bindings/identidades/root atuais e certificar o pacote concreto. Evidências históricas não substituem isso.

Não há instalação implementada neste delta nem declaração de que o toolchain produtivo esteja certificado. O alias não é um novo privilégio sudo, assinatura, chave, serviço ou autoridade: sua proteção depende da mesma instalação root revisada, ainda pendente de B4. Root autorizado continua sendo parte da raiz de confiança. Mudança por root após conferência não é um adversário coberto pelo modelo existente.

## Provas executadas e simulações

[TEST_OUTPUT.txt](TEST_OUTPUT.txt), [PROOFS.json](PROOFS.json) e [inventário](LAUNCH_INVENTORY.json): **25 PASS**, 18 provas diretas + 7 regressões canônicas afetadas. Reprodução:

```bash
python3 -B docs/reviews/automation-freeform-window-release-af26/crm-csv-root-authority-b3-20261016/reproduce.py
```

O reproducer verifica hashes/procedência e monta diretório isolado apenas com fontes entregues e referências Git pinadas, sem local-evidence, segredo, binding produtivo ou acesso operacional. Não é entrypoint de preparação/instalação. Node local v22.13.0; execução Node20/PM2 completo não alegada.

| Prova | Consumidor real / fronteira | Simulação/limite |
| --- | --- | --- |
| Substituição antiga | System.start/run completos + parser CJS PM2 original; canário é executado | Processo PM2 substituído por harness Node que executa os trechos reais; nenhum daemon |
| Substituição depois da selagem | Context/Loader/System, memfd Linux real, FD herdado e `fs.readFileSync`/parser PM2 reais; conteúdo > chunk de pipe preservado | Root/ancestros do alias e daemon-presence simulados |
| Ida conectada API→worker | Operations.start canônico + start gate/intents + System completo novo + parser PM2; ordem e negativa de replay | Aparição/identidade dos processos, DB e HTTP pelo Driver sintético; sem serviço real |
| ORIGINAL independente | switch/return/partial ausentes; Loader/snapshot/System/parser usam apenas o modo original | Emissão e transporte root simulados; permit exato/Context reais |
| Recuperações candidatas | System/parser nos modos return e partial com permit específico | Nenhum start de aplicação |
| Integridade/dependências | CJS com require extra, JSON fora do DAG, parser ausente, leitura negada: DENY | Arquivos sintéticos locais |
| Autoridade/FD | Mudança de política após seal, expiração antes do worker, alias/owner inadequados: DENY; FD fecha | Root, relógio e metadados externos explicitamente simulados |
| Imutabilidade | `write` e `ftruncate` no FD selado negam pelo kernel | Não prova root/processo produtivo |
| Resposta perdida | exceção do transporte fecha FD e não repete PM2 | Timeout simulado, sem alegar rollback ou complete |
| Regressões | ORIGINAL/checker/certificados/controles/replay; PRESTOP sem start; CANDIDATE; resposta perdida; Event775/binding antes dos efeitos; R3 ida sem permit | Consumidores canônicos sobre fixtures aceitas; efeitos externos continuam simulados |

`pm2_boundary.cjs` executa os trechos PM2 sem mudar o código de leitura/parser. Para no argumento recebido por `Common.verifyConfs`, cuja normalização é substituída por captura. `js-yaml` é stub que nega (ramo não usado). **verifyConfs, restante de `_startJson`, IPC, daemon e processos não são provas reais**. Não é um mock que reimplementa o algoritmo de leitura. Os bytes originais estão entregues e pinados; o harness apenas conecta e interrompe a execução nessa fronteira. A contraprova e a correção usam o mesmo consumidor.

A primeira tentativa da suíte teve 22 PASS e um erro de harness por transportar JSON sintético grande em argv (ARG_MAX). Foi corrigido o ensaio para usar System/caminho real, sem mudar o contrato para obter PASS. Depois da ampliação da matriz e da prova conectada, 25 PASS. Provas anteriores aceitas foram reutilizadas; nenhuma suíte ampla/runtime/build foi repetida.

## Entrega, preservação e próximos limites

[ALLOWLIST.json](ALLOWLIST.json) delimita os arquivos. [MANIFEST.sha256](MANIFEST.sha256) indexa todos os arquivos deste incremento, inclusive o patch, exceto a si próprio. [FULL_DELTA.patch](FULL_DELTA.patch) representa os arquivos novos e os três checkpoints; **exclui o próprio patch e MANIFEST.sha256** para evitar ciclo. Os patches usam contexto zero; conferir/aplicar offline com `git apply --unidiff-zero` (nunca em geração histórica). Fontes editáveis são `pm2_input.py` e `integration.py`; vendor é evidência externa imutável, não código funcional novo.

Somente os checkpoints atuais de backlog/runbook/índice foram acrescentados; relatórios B1/B2/R3/autoridade, fontes históricas, gerações, manifests e intents consumidos continuam byte a byte sem diff. Materiais privados/não rastreados existentes foram preservados, fora da allowlist. NEWauth+NEWDB+NEWcipher, crons, guarda38 e out.15 não foram observados nem alterados nesta tarefa.

Antes do push: HEAD/remoto base iguais; Vercel `deploymentEnabled=false` para esta branch; único workflow CI em main/develop, sem ação aplicável a este push. Não houve mudança de configuração ou workflow manual. Commit/push autorizado publica somente revisão local, não instalação.

**Próxima dependência: revisão de B3 e B4, sem execução automática. INTEGRATION BLOCKED / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY.**
