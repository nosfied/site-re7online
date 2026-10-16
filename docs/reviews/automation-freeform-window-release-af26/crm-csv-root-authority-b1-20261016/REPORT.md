# B1 — consulta inicial ligada ao diagnóstico privado canônico

**B1 FECHADO LOCALMENTE no alcance ensaiado. INTEGRATION BLOCKED / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY. CSV SUSPENSO.**

Base `305c1cd08c5ddc7a2b30c5a79e4a830d3a836943`, branch `review/campaign-recovery-20260926`. Consultados os checkpoints do runbook/backlog/índice, política de mudanças, checklist e relatórios autoridade/R3/B2. Nenhum AGENTS.md aplicável foi localizado no checkout/ancestrais consultados. Históricos e provas aceitas permanecem intactos. Sem VPS, instalação, emissão real, pacote operacional, backup ou janela.

## Transporte e falhas encontrados antes da edição

A fonte canônica completa está disponível e versionada em `v4-sequencer/privileged_output.py`; seu hash e o renderizador já existente estão em SOURCE_PROVENANCE.json. Não foi necessário reconstruir um contrato a partir de resumo nem consultar fonte privada ausente.

O transporte existente `run_privileged`:

1. aceita somente argv literal do helper/observer e ação allowlisted;
2. captura stdout/stderr como **bytes**, sem check=True nem decodificação precoce;
3. em TimeoutExpired conserva os bytes parciais; em OSError conserva a informação de falha privadamente;
4. grava bytes integrais em base64 em `privileged-output.private.jsonl` com tamanhos, hashes e exit code;
5. grava somente resumo sanitizado em `sequencer.journal.jsonl`;
6. usa `private_record`: O_NOFOLLOW, arquivo regular, owner atual, nlink1, nenhum bit077, criação600, append/flush/fsync;
7. nega code diferente de0, inclusive code None, com erro fixo sem stdout/stderr na exceção; não faz retry.

Antes de B1, `authority.fixed_query` usava outro subprocess capture direto, ignorando esse transporte. A ação já estava registrada no renderizador futuro, mas o bootstrap inicial ainda não fornecia o destino canônico antes de conhecer a preparação autenticada. B2 havia simulado esse canal root e não eliminava essa lacuna.

## Delta e origem do destino

O bootstrap futuro carrega `privileged_output` como biblioteca protegida, **antes** de authority e antes de qualquer código da preparação. O módulo é executado como deploy, não importado pelo helper root. A cópia entregue é o render da fonte canônica com **somente** a inclusão já existente de `inspect-recovery-authority` em ACTIONS; corpo, bytes privados, permissões e tratamento de falha não foram reimplementados.

`fixed_query(window)` chama esse `run_privileged` com timeout15 e ambiente fixo. O argv inicial passa a usar `sudo`, exatamente como exige o allowlist canônico; PATH é fixado em `/usr/sbin:/usr/bin:/sbin:/bin`. O helper continua em caminho absoluto fixo e é conferido por `protected_bytes`. Não há comando sudo alternativo, processo de emissão ou fallback de consulta.

A entrada do bootstrap passa a exigir:

```text
python|node-snapshot ENTRY --diagnostic-window WINDOW [--authority-correlation ENVELOPE -- ...]
```

Esta é uma **interface futura**, não comando de instalação ou autorização operacional. O lançamento inicial revisado deve informar seu `window` existente; os filhos Python/Node o encaminham explicitamente a partir de `context.root/window`. Não é um arquivo de pins nem uma autoridade nova.

Antes de a resposta ser conhecida, WINDOW serve somente à custódia: a rotina canônica grava ali sob seus controles de arquivo privados. Em seguida, Context valida a resposta root de forma independente e exige que WINDOW seja exatamente `root autenticado/window`, antes de Loader/import. Uma rota diferente pode receber o registro privado da tentativa, mas nunca aprova a preparação. Não se calcula nenhum pin, perfil ou permissão a partir dessa entrada.

Não foi inventado contrato adicional de modo dos diretórios. Valem os checks canônicos do escritor e a igualdade da rota com a preparação autenticada. O diretório deve existir: código não o cria nem usa outro destino. A futura composição precisa preparar/revisar essa rota e instalar as bibliotecas protegidas; isso permanece B4, sem suposição de instalação atual.

## Validação e diagnóstico da negativa

O fluxo padrão de Context exige a rota; consulta sem rota não cai no capture antigo. Na captura bem-sucedida, todos os bytes já estão no coletor canônico antes de parse/validação ou import.

- Resposta vazia, JSON malformado, bytes inválidos ou autoridade inconsistente: registra `authority_query_denied` com estágio e motivo estáticos **no mesmo sequencer.journal.jsonl**, pelo mesmo `private_record`, e lança `authority_query_denied` sem encadear conteúdo sensível da exceção.
- Transporte perdido/não zero/OSError: o coletor canônico conserva o que foi recebido, nega e não repete; Context registra a negativa sanitizada.
- Troca de identidade em revalidação e divergência da correlação do pai: registram motivos fixos `authority_replaced`/`bootstrap_authority_replaced` no journal existente e negam antes da carga.
- Rota divergente: `authority_diagnostic_window_mismatch`; não há import.
- Escritor/diretório indisponível: nega. Se nem o journal puder ser gravado, `authority_diagnostic_failed`; **não se alega custódia concluída**, não se cria diretório e não há destino alternativo.

Nenhum novo arquivo/coletor de diagnóstico operacional foi criado. O evento semântico é um resumo no journal já existente, sem payload ou mensagem arbitrária da exceção. As facilidades de injeção de query usadas pelos ensaios aceitos continuam explícitas e não são uma entrada CLI/env: quando usadas sem rota, não alegam exercer o transporte/custódia produtivos. O bootstrap normal sempre exige a rota e usa o fluxo canônico.

O pin E1 de B2, permit de recuperação, revalidações, regras de ida R3, classificações e contratos de modo não foram modificados. Consultas frescas nas fronteiras de Loader continuam existindo: são verificações somente leitura, não retries após falha nem replay de operação.

## Contraprovas executadas

**19 testes focados PASS:15 de diagnóstico inicial e4 cadeias/interfaces B2 diretamente afetadas.** Suítes anteriores não foram repetidas integralmente; nenhum build foi feito.

| Caso | Prova |
| --- | --- |
| Resposta válida | registro canônico existe antes do Loader; conteúdo só é importado após validação; cada releitura de frescor é capturada |
| Resposta ausente com exit0 | DENY de validação, zero import, uma chamada |
| Binário/UTF-8 inválido e JSON malformado | comparação byte-exata incluindo NUL/0xff no privado; nada desses conteúdos no journal/erro público |
| Exit9 | stdout/stderr privados preservados; nenhuma tentativa adicional |
| Resposta completa perdida | subprocesso real retorna bytes; hook perde a resposta com TimeoutExpired; code None nega apesar de payload válido |
| Timeout parcial real | helper local escreve bytes e demora; prazo de laboratório encurtado para0,15s produz TimeoutExpired real; bytes parciais e hashes conferidos |
| Executável indisponível | OSError real, informação privada, erro público estático, sem import/retry |
| Política viva divergente | captura preservada, negativa de validação no journal, sem import |
| Identidade trocada entre leituras | segunda captura preservada e negativa de identidade registrada |
| Correlação de pai divergente | bootstrap nega e registra antes do Loader |
| Rota ausente/divergente | ausência nega antes da consulta; divergência nega antes do import |
| Arquivo privado symlink | O_NOFOLLOW nega sem escrever no alvo; sem fallback |
| Diretório privado ausente | nega sem criação, sem import ou custódia fictícia |

Os quatro casos conectados reutilizam os **consumidores concretos** de B2:

- Bridge.protocol → três subprocessos delegated request/record/execute, prova consumida e sem replay;
- Bridge.node → Node → bootstrap Python → baseline/ecosystem reais;
- mudança de execução entre comando e filho, negando antes do Loader/import;
- autoridade trocada entre pai e filho, negando antes do import.

Desta vez cada bootstrap filho usa `fixed_query` e `run_privileged` canônicos, não um callback que devolve diretamente o bundle. O ponto sudo é mapeado, após o allowlist real, para um **processo Python local real** que só lê a fixture e escreve sua resposta. A consulta root não é emissão. PID/PPID dos processos conectados são preservados na evidência sanitizada.

## Transporte real versus simulações

**Reais:** subprocess.run/stdin/stdout, timeout e OSError, run_privileged/private_record sem alteração de corpo, validação Context/bootstrap, arquivos append600 e fsync, comparação de bytes/hashes, Bridge e cadeias Python/Node/baseline. Nenhum resultado de transporte foi fabricado para substituir o baseline ou execute.

**Simulados:** existência/metadata do helper e bibliotecas root, sudo/autoridade root como endpoint local, perfis/processos/SQL/HTTP/PM2/crons e restore anterior conforme fixtures B2. O timeout do laboratório é encurtado no mapeamento do endpoint, após comprovar o valor15 solicitado pelo código; não altera o timeout futuro. A perda de resposta é injetada depois da execução real. O driver proíbe efeitos externos não previstos.

O sandbox devolveu EPERM no Node→Python. A mesma suíte passou fora do sandbox, sem trocar esse elo por mock. A primeira rodada também detectou falta do novo argumento na rota Python; foi corrigida antes da prova final. A prova positiva passou a distinguir as releituras de frescor dos retries, que não existem. Esses fatos estão em PROOFS.json; provas antigas não foram reescritas.

`DIAGNOSTIC_EVIDENCE.json` publica **somente** tamanhos, hashes, códigos, resumos e eventos/PIDs sintéticos. Não publica os arquivos privados brutos/base64. No caso da rota divergente, o teste verifica diretamente o journal no outro diretório privado sintético; o resumo principal da evidência é do window correto. Nada foi coletado da VPS.

## Reprodução, arquivos e bloqueios

```bash
python3 -B docs/reviews/automation-freeform-window-release-af26/crm-csv-root-authority-b1-20261016/reproduce.py
```

Fontes futuras editáveis deste delta: authority.py, bootstrap.py, child_transport.py, node_bootstrap.cjs e o render canônico privileged_output.py. `SOURCE_DELTA.patch` mostra suas diferenças; `SOURCE_PROVENANCE.json` fixa fonte e renderizador. lab_shim.py/lab_root_reply.py/test_diagnostics.py/reproduce.py são exclusivamente laboratório/reprodução.

A reprodução reutiliza os índices/excertos públicos já aceitos e fontes Git por SHA/hash; a árvore isolada da suíte não possui fallback Git/local-evidence. Somente o fixture de B2 recebe a biblioteca diagnóstica e o endpoint local, sem modificar corpos Bridge/delegated/baseline. TEST_OUTPUT/PROOFS registram os19 resultados e os hashes finais.

**B1 fechado localmente; B2 preservado no alcance declarado. B3 e B4 continuam abertos:** releitura separada do ecosystem pelo PM2; instalador/pacote concreto, fechamento transitivo real dos quatro modos e bindings/pins operacionais atuais. Nenhum deles foi implementado ou certificado aqui. A instalação futura precisa preservar a fonte canônica e sua origem protegida; este relatório não é prova de root/sudo reais.

FULL_DELTA representa este incremento/checkpoints contra a base, excluindo a si próprio, MANIFEST e ALLOWLIST. MANIFEST fixa os bytes entregues. Os relatórios, código, manifests, recibos e gerações anteriores continuam intactos; materiais privados/demais trabalhos ficam fora da publicação. NEWauth+NEWDB+NEWcipher, frontend, ambos crons, guarda38, out.15 e produção não foram acessados ou alterados. Revisão operacional21/10 ou antes após mudança; owner Deifson.

**INTEGRATION BLOCKED / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY. CSV suspenso.**
