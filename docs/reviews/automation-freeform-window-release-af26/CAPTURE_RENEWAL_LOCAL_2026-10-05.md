# V4 — diagnóstico privilegiado e renovação de captura, 05/10/2026

**LOCAL VALIDATED / PUBLISHED FOR REVIEW / NOT DEPLOYED.** Delta operacional sobre `ac9112c1398a399f05de81ad3bbbec0b2a030f50`, após o [retorno comprovado](HYBRID_B9_V4_RETURN_2026-10-05.md). Sem nova preparação remota, helper instalado, política substituída, janela, parada ou mudança funcional de b9. Produção permanece nas últimas versões confirmadas API 879/worker mínimo af26/frontend af26.

## Diagnóstico disponível da tentativa anterior

A leitura dirigida confirmou: `execution.stderr.private.log` contém somente o erro final `window_failed_recovery_blocked`; não há `protocol-output.private.jsonl` nem stderr persistido do primeiro `privileged('unfence')`. A auditoria root tem modo 0600 e não é legível por deploy; seu código grava apenas UTC/ação/resultado/hash da política, sem razão ou traceback. Não se pediu sudo adicional para tentar reconstruir informação que esse formato não guarda. **Causa da primeira recusa continua desconhecida.** A recusa do retorno tem evidência distinta: diagnóstico root efetivo `worker_capture_sockets_drift`, nove sockets capturados versus 18 do mesmo worker. Isso não é atribuído retroativamente à primeira falha.

## Alteração mínima

`Bridge.privileged()` usa o módulo comum `privileged_output.py`, que captura stdout e stderr como bytes completos (inclusive stderr em sucesso), exit code, tamanhos e SHA-256 de **cada uma das nove ações e a chamada literal do observador**. `privileged-output.private.jsonl` é append-only, modo 0600, com streams em Base64 para preservar bytes sem truncamento; rejeita symlink, proprietário incorreto, hardlink e permissões abertas. O journal recebe somente ação, UTC, exit code, tamanhos, hashes e razão de uma lista explícita, sem streams ou texto bruto. Falha ao iniciar o subprocesso registra exitCode=null — não inventa um código de saída. Nenhuma chamada literal sudo foi ampliada.

`finish()` preserva o protocolo/nonces/saved/fallback, executa authorize-switch/authorize-return e chama `renewed_unfence()` **depois** dessa autorização. O pré-unfence original continua sendo verificado. A renovação repete os gates de guarda/barreira, controle HTTP, conjunto exato PM2, marcadores de início, identidade de API/worker/frontend e daemon; confere script/cwd/hash da release. Cada observação verifica PID/start ticks, árvore sem zumbi, UID/PGID/SID e lê os FDs completos. Alternância R/S não compõe identidade nem igualdade da árvore. PID substituto, daemon divergente, release errada, árvore alterada em relação à captura anterior ou leitura incompleta negam.

Duas observações consecutivas devem coincidir: captura normalizada, geração da guarda e identidade da API. Drift de geração nega imediatamente. Só depois é arquivada a captura anterior por nome novo com tempo/ns e hash e criado, com O_EXCL/0600, o novo `worker-before-unfence.private.json`. Os bytes anteriores são preservados; não se apagam provas, intents, certificados ou fases. A diferença permitida durante renovação é somente inventário de sockets, pertencentes à mesma árvore confirmada.

Há no máximo **três pares de observações por recaptura**, sem espera fixa certificando estabilidade. Churn persistente encerra com `worker_capture_unstable_after_3_attempts`. O helper inalterado revalida integralmente o arquivo novo antes de excluir nft. Se ele negar especificamente sockets/FDs em `validate_live_capture`, comprovadamente antes de qualquer exclusão, `renewed_unfence` pode recapturar e reapresentar a ação, no máximo três vezes. Isso limita o trecho renovado a nove pares/18 observações e três chamadas root de unfence; o pré-unfence inicial é um trecho anterior limitado a três pares. Erro desconhecido, árvore/identidade divergente ou falha potencialmente parcial não é repetido. Esgotamento root termina `unfence_capture_unstable_after_3_attempts`. **Nenhum start/stop/protocolo consumido é repetido.**

O helper `8de358fd…a1b212`, sua política/schema e as nove chamadas sudo não mudam. O delta afeta o sequenciador, seu módulo de diagnóstico, a instrumentação da leitura do proxy e o template de retorno; uma preparação futura deverá incorporar seu hash novo, usar bindings/política/provas próprios e preservar a tentativa consumida. Nenhuma instalação/preparação foi realizada nesta revisão. A observação continua pontual; não oferece atomicidade do /proc nem garantia temporal superior ao V4 anterior.

O gerador de retorno também usa o logger para check-absent e o observador. O patch sanitizado `privileged-observer-output.patch` integra a chamada efetiva `System.proxy_socket_inventory` dos modos ao mesmo logger, preservando `env=CLEAN` e timeout de dez segundos. A classe delegada rejeita `args[0] == sudo`; os ramos sudo genéricos históricos de Controls não são a rota do sequenciador e não foram liberados. A chamada do proxy é o único sudo direto restante alcançável fora do Bridge e do template.

Integração futura: aplicar esse patch com fuzz=0 em cópias de cada modo sobre o hash de origem atestado; copiar `privileged_output.py` para window e para switch/return/return-partial; adicionar sua entrada a scripts.sha256 (25 arquivos, não fingir que continuam 24), e atualizar sequencer-manifest. O template fixa os novos hashes normalizados de ops antes/depois do adaptador de worker ausente e copia o logger para o retorno novo. O adaptador de ausência permanece byte a byte igual; a recomposição por hashes foi testada localmente. Nenhum arquivo privado foi alterado na VPS. Logs do observador também ficam privados e seus inventários não entram no journal público.

## Provas desta versão

| Grupo | Resultado e alcance |
| --- | --- |
| `test_capture_refresh.py` | **13/13 PASS**, injeção determinística: nove ações em sucesso/falha com streams completos >16 KiB e bytes não UTF-8; journal sem conteúdo; observador em sucesso/falha/timeout com streams parciais e rejeição de argumentos extras; spawn failure; R/S vs zumbi/ticks; arquivos anteriores preservados; limite de churn; leitura incompleta; drift de geração; erro desconhecido sem retry e recusa pré-delete limitada |
| `test_sequencer.py` | **23/23 PASS**, regressão de ordem, guarda, ida/retorno e falhas com driver controlado; atualizado para renovar antes de unfence. Não equivale a nft/systemd reais |
| `test_absent_worker_mode.py` | **4/4 PASS** reexecutados sobre ops com diagnóstico e adaptador de ausência aplicados; guard/certificado/retorno por injeção, sem atribuir esse grupo a processos reais |
| `test_capture_refresh_pm2.py` | **25 verificações PASS/negação esperada**, Node **20.20.0**, PM2 **6.0.14** reais. Switch, return, return-partial; abertura/fechamento de TCP local; churn entre observações e no instante anterior ao validador root; recaptura/transiente; substituição real do PID; filho inesperado e descendente real sobrevivendo à saída do worker; sem sucessor nesse cenário negativo |

O driver real chama `privileged.act`, `target_processes_live`, `guard_closed` e `validate_live_capture` efetivos. Apenas efeitos nft/fases foram simulados, com contagem de exclusões; nenhum sudoers/helper produtivo foi usado. Um mismatch de ticks adicional é explicitamente injetado; a substituição por PID distinto também foi exercitada realmente. O teste de descendente sobrevivente usa término abrupto **somente do Node sintético isolado**, para gerar a negativa; não é procedimento de parada produtiva. O frontend do laboratório permaneceu vivo. Apps sintéticos usam só loopback; sem DB, auth, sessão ou provider real. As verificações não são 25 testes de suíte distintos nem validação funcional b9.

O `System` usado vem do pacote operacional privado preservado (arquivo hash b20e4c3a…0bcc2c). Seus métodos run/identity/tree foram comparados por AST, somente leitura, com os bytes da preparação consumida na VPS: três hashes idênticos registrados no [manifesto](v4-sequencer/capture-refresh-manifest.json). Não foram usados processos Python com env fabricado em lugar de PM2. O primeiro ensaio encontrou EPERM de socket no sandbox e não contou como PASS; o ensaio aprovado foi executado fora desse bloqueio. Uma expectativa de teste foi ajustada porque o gate anterior corretamente recusou a identidade; isso não relaxou código de autorização. Os resultados finais estão [versionados e sanitizados](v4-sequencer/capture-refresh-real-results.sanitized.json).

## Reprodução e hashes

Na raiz do worktree, com o pacote de laboratório já preservado:

```bash
python3 -m unittest discover -s docs/reviews/automation-freeform-window-release-af26/v4-sequencer -p test_capture_refresh.py
python3 -m unittest discover -s docs/reviews/automation-freeform-window-release-af26/v4-sequencer -p test_sequencer.py
python3 docs/reviews/automation-freeform-window-release-af26/v4-sequencer/test_absent_worker_mode.py local-evidence/capture-refresh-20261005/adapter-source
python3 docs/reviews/automation-freeform-window-release-af26/v4-sequencer/test_capture_refresh_pm2.py /tmp/re7-pm2-lab/node /tmp/re7-pm2-lab/pm2/bin/pm2 local-evidence/af26-v4-preparation-20261003/switch
```

O fixture adapter-source foi produzido do ops/delegated atestado aplicando somente o patch de diagnóstico ao ops (ops.orig.py/delegated.orig.py); o teste aplica o adaptador de ausência. Não contém configurações ou dados reais.

O terceiro argumento do driver identifica as fontes privadas existentes, não configurações/dados produtivos. São copiados apenas ops.py/db_owner_set_gate.py/db_owner_set_observer.py para diretório temporário isolado; hashes e versões são declarados. PM2_HOME exclusivo, apps e arquivos sintéticos; cleanup encerra somente o daemon desse laboratório. Esses arquivos privados completos não foram publicados. Revisores sem o pacote operacional podem executar os testes de injeção pelo Git e usar seu pacote atestado no driver, conferindo os métodos no manifesto.

O [manifesto completo do delta](v4-sequencer/capture-refresh-manifest.json) fixa origem/resultado, testes, resultado sanitizado, helper inalterado e tar funcional. Não repetir builds funcionais: API b9 e tar worker SHA `236c1d502df5767eb7cde726ce0d7ae7c6e8200489cac4d09a417b08d98c0e98` não foram alterados ou reconstruídos. Provas consumidas, logs privados, .data e dados históricos permaneceram fora do Git.

**Próximo passo:** revisão independente deste delta e integração em preparação operacional nova antes de qualquer futura janela. Esta publicação não executa troca nem autoriza reuso da tentativa anterior. b9 continua NOT DEPLOYED; aceite funcional/Campanhas/CRA pendentes, SECULT encerrada e reparo de setembro CLOSED.
