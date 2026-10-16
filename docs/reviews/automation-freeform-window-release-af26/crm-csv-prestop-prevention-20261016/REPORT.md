# CSV — prevenção local: correção da revisão

**LOCAL VALIDATED / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY.**
Base/HEAD `bd82db403e1f4db46525e24d0aef479941af0d74`, branch `review/campaign-recovery-20260926`, reconferidos antes da correção. Alterações locais e arquivos não rastreados preservados. CSV suspenso; recuperação e instalação consumidas. Sem commit/push.

## Achados resolvidos

1. **Equivalência:** o corpo de `path_bindings` reproduz exatamente os statements de `System.validate_bindings` original, assim como `require`. Prova de igualdade AST e matriz diferencial com o mesmo filesystem/config para original, compartilhado e consumidor futuro. Não há mais schema privado adicional, exigência de caminhos absolutos/canônicos, restrição script-dentro-cwd ou cobertura adicional de `.data`. Retorno continua `None`; erros de JSON/leitura/resolução propagam com seus tipos/mensagens originais. Nenhum erro vira PASS.
2. **Reprodução:** nenhuma leitura de `local-evidence` na suíte ou no runner. Três consumidores/dependências vêm de `git show` no SHA base com hash exato. As duas fontes necessárias ausentes do Git são entregues em `reference_sources/`: trecho mínimo literal de `require`/`System.validate_bindings` e checker completo. Procedência, hashes originais, intervalos do trecho e hashes entregues constam em `SOURCE_PROVENANCE.json`. Inspeção integral: somente código, sem valores de credenciais, configurações privadas, registros de tenant ou dados produtivos. Os originais não foram editados.

**Os31 PASS anteriores não provaram equivalência e não resolveram a divergência identificada na revisão.** Seu registro está preservado byte a byte em `PRIOR_PROOFS_SANITIZED.json`; não é contado como prova da correção.

## Semântica preservada e limites

O original lê `json.loads(...read_text())`; por app exige cwd diretório/script arquivo e, somente quando `bindings.get(cwd+'/.data')` é verdadeiro, exige symlink com resolução igual ao valor. Retorna `None`. Assim, mapa sem referência/valor falso, entradas extras, chave duplicada, script externo, aliases de cwd/script, caminho relativo, binding legível via symlink/modo644/hardlink podem ser aceitos pelo predicado original. A matriz confirma essas mesmas decisões; não certifica a aceitação por todo o pacote, que mantém os demais contratos canônicos.

[Hardening separado](HARDENING_FOR_SEPARATE_REVIEW.md) registra sugestões sem implementá-las. O predicado Event não mudou: literal aprovado, todos os pais diretórios sem symlink e sem escrita grupo/mundo; leitura impossível nega. Nenhuma criação/correção de binding ou permissão pelo verificador.

`validate_pre_stop` lê os oito perfis com a mesma construção de mapa usada em `Operations.__init__` e chama `path_bindings`. Não produz bindings nem adiciona um contrato de schema. Leituras/malformed inputs não são convertidos em sucesso. O campo `profiles=8` indica perfis percorridos, não validação completa de schema.

## Integração futura e ordem

- `future_sources.operations`: exige a forma AST exata do método original e substitui-o por chamada ao compartilhado. `Operations.start` e `Controls.unfence` continuam usando `System.validate_bindings` nos pontos originais, antes dos efeitos respectivos.
- `future_sources.event_overlay`: troca somente o loop de pais pelo predicado compartilhado, antes de intent/write; restantes autoridades do overlay preservadas.
- `future_sources.check_current`: pré-checagem no início do checker consumido pelo fluxo existente de pré-instalação/admissão/encerramento.
- `future_sources.csv_cli`: pré-checagem antes dos checks/locks/intents e rechecagem imediatamente antes de `close_then_preflight` → `controls_enter` → `stop-pair`.

São transformações em memória sobre fontes reais. Não há geração operacional, materialização de pacote, perfis/manifests/instaladores novos ou mudança em consumidor histórico. Prévia não elimina concorrência; verificações no uso permanecem. Não se certifica atomicidade global ou estabilidade futura.

## Provas pertinentes

Comando local reproduzível:

```bash
python3 -B docs/reviews/automation-freeform-window-release-af26/crm-csv-prestop-prevention-20261016/reproduce.py
```

**19 métodos PASS, incluindo28 casos diferenciais.** A matriz compara aceitação/rejeição, retorno e tipo/mensagem de exceção nos três consumidores. Inclui válidos/ausentes/JSON inválido/tipos inadequados/destino divergente, erros de leitura, referências omitidas/extras/falsas, relativos, aliases, duplicatas, subset e metadados antes recusados apenas pelo endurecimento. A igualdade AST é prova adicional do corpo, não inferência a partir dos testes de ordem.

O runner cria árvore isolada em temporário com somente os cinco arquivos de código/metadados declarados, os dois trechos entregues e três fontes versionadas de hash conferido. Marca `ISOLATED_DELIVERY`, desabilitando fallback Git no filho; a suíte instala audit hook que nega abertura de qualquer caminho `local-evidence`. Testes próprios comprovam negativa de hash divergente e ausência de fallback quando falta fonte isolada. Não há dependência de `.env`, node_modules, banco, pacote privado ou rede.

| Prova | Consumidor real | Simulação/limite |
| --- | --- | --- |
| Equivalência28 casos + igualdade AST | Trecho literal do método original, compartilhado e método transformado | Filesystem sintético real; EACCES injetado em leitura e stat. Comparação restrita ao método, não ao contrato operacional inteiro |
|775, binding ausente, referência divergente | Corpo completo de `csv_cli.execute` futuro | Bridge/Sequencer e checks não afetados simulados; negativa antes de qualquer chamada de close/contain/stop |
| Drift depois de baseline | Mesmo CLI real | Remoção local do binding; efeitos de controle simulados não alcançados |
| Ordem válida close→contain→stop | Mesmo CLI real | Sentinela no stop; nenhuma parada real |
| Revalidação de bindings | Método futuro original e compartilhado | Binding local desaparece após prévia válida; start/PM2 não executados |
| Revalidação Event | Corpo completo do overlay futuro | Literal rebased à fixture, autoridades antigas de fence/inventário/hash simuladas; alteração de modo observada por stat injetado; sem write |
| Checker | Fonte completa real do checker futuro | Sentinela no próximo check antigo; não certifica admissão completa |
| Somente leitura | Verificador real | Snapshot arquivos/links, bloqueio de flags de escrita/os.chmod; não simula certificação produtiva |

Arquivos, JSON, links e diretório775 internos às fixtures são reais. **Ancestrais externos às fixtures são modelados como diretórios755**; host775/1777 não é prova produtiva. Modos sintéticos definidos apenas na criação via umask temporário; nenhum chmod. Nenhum entrypoint operacional é invocado ao importar os módulos; efeitos operacionais não são exercitados.

## Diff, integridade e revisão

- `consumer_delta.patch`: somente os quatro consumidores futuros; Operations identificado como EXCERPT (trecho mínimo), demais fontes completas. Regenerado das mesmas entradas/transformações; é material de revisão, não instrução para aplicar em geração.
- `FULL_DELTA.patch`: diff cumulativo completo contra a base para os três documentos e todos os arquivos novos deste incremento, incluindo módulos, transformações, testes, fontes/procedência, provas e índice. Não inclui a si próprio.
- `PUBLIC_FILES_SHA256.json`: hashes de todos os demais arquivos do diretório, exceto ele próprio e `FULL_DELTA.patch` para evitar referência circular. O SHA do diff completo é entregue separadamente.
- `PROOFS_SANITIZED.json`: execução isolada, matriz e limites. Fontes versionadas são declaradas por SHA/path/hash; não há cópia histórica editada.

## Pendências preservadas

**Fora deste incremento:** exposição do retorno original no CLI/política, classificação STOPPED_UNSELECTED e recuperação integrada pré/pós-seleção, inclusive parcial. Requerem revisão antes de qualquer futura janela. Sem certificação de stop/start, admissão completa, privilégio, drain ou recuperação produtiva. Sem pacote operacional novo ou prontidão de janela.

Sem VPS/SSH, deploy, instalação, contenção, restart, permissões produtivas, .env, credenciais, schema, guarda, retenção, limpeza ou backup. NEWauth+NEWDB+NEWcipher, ambos crons, frontend, guarda38, out.15 e evidências consumidas intocados. Segurança externa OPEN/adiamento do owner preservados. Parar para revisão.
