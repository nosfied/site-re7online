# Revisão final — correções necessárias antes do aceite

**LOCAL VALIDATED / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY.**
Decisão: **CORREÇÕES LOCAIS NECESSÁRIAS**. Os42 testes existentes permanecem válidos no alcance documentado; não demonstram os invariantes ausentes abaixo. Nenhuma correção de implementação foi feita nesta revisão.

Base/HEAD conferido: `6bcf122ca5e5992769e67c1158208408b9c0b15b`, branch `review/campaign-recovery-20260926`; index vazio. Auditados diff rastreado completo,17 arquivos novos originais do incremento, transformações e fontes declaradas. Fora do incremento, arquivos privados/não rastreados preexistentes foram preservados. Nenhum acesso VPS ou efeito produtivo.

## Achados

### R1 — Média, impeditiva de aceite: certificado não recebe a validação canônica

`recovery_bridge.py:Bridge.verify_recovery_exit` (42–51) chama restore/guard, old_absent sobre stop-start, DB zero e exit_and_imports com hash do certificado. Não chama `Operations.certificate` nem confere os campos de direção, configHash e geração do old-exit-confirmed. `Sequencer.verify_stopped` usado na inspeção verifica existência do arquivo/população/frontend; não supre a validação de conteúdo.

Contraprova sintética dirigida, sem repetir a suíte: manter saída simulada e inventário coerente com o hash, mudar geração do certificado para37. A nova inspeção retorna STOPPED_UNSELECTED com opção ORIGINAL. Sobre os MESMOS arquivos/driver, `Operations.certificate` rejeita guard_generation_changed. Isso demonstra divergência de contrato, não uma falha produtiva observada nem prova de partida indevida em produção.

Correção necessária: usar a validação canônica correspondente à fronteira/modo ao admitir o certificado e antes dos efeitos. Cobrir geração/direção/configHash divergentes, inclusive inventário com hash consistente, sem substituir provas por booleans. O certificado novo gerado depois na recuperação não legitima retroativamente uma classificação inicial baseada em certificado inválido.

### R2 — Média, impeditiva de aceite: checker independente não preserva todo o contrato original aplicável

`recovery_contract.py:Contract.__init__` (54–82) valida conteúdo por hash, mas não preserva a verificação de tipo/owner/modo/nlink de arquivos selados do checker canônico. Também não define/valida um conjunto de referências imutáveis originais equivalente ao anteriormente exigido por `csv_contract.check(live=True)`. `Bridge.verify_original_artifact_and_bindings` (62–67) cobre entrypoints, mapa e fonte Event; isso não substitui todas as referências canônicas aplicáveis.

Fundamento: o produtor CSV versionado deriva o checker de openai_contract.check, que exige referências imutáveis não vazias, tipo/owner/modo/hash dessas referências e read_permission nos arquivos selados dos modos/window. A recuperação original comprovada chamava esse checker. A nova recuperação o contorna para evitar requisitos do candidato, mas ainda precisa preservar, de forma delimitada, os invariantes do original. Os testes injetam checker/admissão não afetados e não provam essa equivalência.

Correção necessária: definir o recorte original e reutilizar seus predicados canônicos, sem dependência de runtime candidato e sem introduzir hardening novo em path_bindings. Provar negativa para referências originais divergentes e metadados inválidos. Este achado é estático; não houve chmod/chown, alteração de referência produtiva ou nova execução de suíte para demonstrá-lo.

## O que foi confirmado

- Matriz/CLI concordam nos caminhos nominais: PRESTOP→PRESTOP sem start; STOPPED_UNSELECTED→ORIGINAL/return-before-commit; seleção comprovada→CANDIDATE/return ou return-partial.
- PRESTOP não alcança start_pair. Recuperação consumida, start/seleção incertos ou identidade frontal/original divergente negam execução nas condições cobertas. Intent permanece em falhas/resposta perdida, sem replay automático ou falso recibo de conclusão.
- ORIGINAL não invoca overlay nem lê executáveis/bindings externos candidatos. Ainda exige definições seladas dos quatro modos/perfil alvo como metadados compartilhados; “independência” não significa ausência desses metadados.
- profile_delta preserva env e worker/frontend em relação ao perfil fonte pinado. Isso preserva estruturalmente as credenciais fornecidas; não é observação nova dos valores produtivos NEWauth+NEWDB+NEWcipher.
- Prevenção pré-parada e path_bindings publicados em6bcf permanecem byte a byte; revalidação no uso e mecanismo de mapa original separado permanecem. Nenhuma geração/manifests/recibos/intents consumidos alterados.
- Proposta de política muda apenas targetProcesses.return e mantém schema/ações existentes. Ela não é política instalada nem remove do helper as ações switch já existentes; limitação de fluxo original também depende do dispatcher e dos gates canônicos.
- Código, provas42, patches e índice estavam íntegros antes desta revisão. consumer_delta corresponde às transformações. FULL_DELTA anterior representa a entrega revisada original; sua identificação está registrada em FINAL_REVIEW_CHECKS.json.

## Provas e riscos residuais

Não repetida a suíte42 nem a suíte pré-parada19/28. Executada apenas a contraprova nova R1 por lacuna técnica específica, com arquivos temporários sintéticos e processos/DB/root simulados em memória. Nenhuma manipulação de processos reais. Resultado sanitizado e inventário em FINAL_REVIEW_CHECKS.json. O resultado R1 não reescreve nem invalida os testes antigos; demonstra caso não coberto.

Continuam não exercitados: operações reais de root/PM2/HTTP/SQL, restore novo, transportes e delegação completos sobre uma geração operacional, autoridade real de captura/permissões, frescor/RPO/capacidade, validação funcional de tenant/reader/provider e aceite humano pós-janela. As identidades e controles simulados não são provas produtivas.

Após correções locais/revisão: futura composição completa exige inventário original compatível e dependências compartilhadas/reader histórico, perfis/identidades reais, quatro modos/dispatchers/manifests/checkers coerentes, política/recibo root correspondentes, crons/supervisão/saved/fallback e provas de saída/DB completas. Provas perecíveis somente na sequência separadamente autorizada; nenhuma renovação ou composição foi feita aqui. Incerto/pós-unfence continua exigindo decisão/futura fronteira própria, sem replay.

## Arquivos efetivamente alterados

Contra a base: docs/BACKLOG_TECH.md, docs/RUNBOOK_WHATSAPP_AGENT.md e docs/saas/DOCUMENTATION_INDEX.md. Somente documentação de incremento/cronologia/revisão, sem conteúdo funcional fora do escopo.

Novos neste diretório: recovery.py; recovery_contract.py; recovery_bridge.py; recovery_start.py; policy_proposal.py; future_sources.py; inputs.py; reproduce.py; test_recovery.py; reference_sources/operations_recovery_original.py; SOURCE_PROVENANCE.json; STATE_MATRIX.md; REPORT.md; PROOFS_SANITIZED.json; consumer_delta.patch; PUBLIC_FILES_SHA256.json; FULL_DELTA.patch. Nesta revisão foram acrescentados FINAL_REVIEW.md e FINAL_REVIEW_CHECKS.json; somente documentação/índice/diff foram consolidados. Código e PROOFS_SANITIZED.json anteriores preservados.

CSV segue suspenso, recuperação consumida intocada, guarda38 fechada/out.15 CLOSED e produção preservadas. Sem commit/push, VPS, instalação, janela ou avanço operacional. Segurança externa continua OPEN/adiamento do owner. Parar para revisão/correção local autorizada.
