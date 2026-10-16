# Correção R1/R2 — recuperação integrada futura

**LOCAL VALIDATED / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY.**

Base/HEAD `6bcf122ca5e5992769e67c1158208408b9c0b15b`, branch `review/campaign-recovery-20260926`. CSV suspenso. Somente alterações locais; sem VPS, janela, commit/push ou efeitos produtivos. NEWauth+NEWDB+NEWcipher, frontend, crons, guarda38 e out.15 preservados por ausência de intervenção; não são observações produtivas novas.

## Resultado da nova revisão

**R1 e R2 corrigidos no alcance local; recomendação de aceite técnico das correções, sujeita à revisão do owner.** Não há achado residual impeditivo identificado nesse alcance. A certificação operacional de uma geração concreta continua pendente. [Parecer anterior](FINAL_REVIEW.md), [contraprova anterior](FINAL_REVIEW_CHECKS.json) e [42 provas anteriores](PROOFS_SANITIZED.json) permanecem byte a byte; não demonstravam os dois invariantes. Cópia anterior de fontes, documentos e índices em `prior-final-review`, com hashes próprios. Os manifests/recibos/gerações consumidos permanecem intocados.

## R1 — validação do certificado

`Bridge.verify_recovery_exit` chama agora `Operations.certificate('old-exit-confirmed.json', API)`, além dos controles existentes de restore, guarda, árvores/identidades, sockets, DB zero e vínculo do inventário de importações. O consumidor canônico verifica direção, configHash, geração efetiva da guarda e ausência dos processos capturados. Não se substitui isso pela coerência entre dois documentos.

A inspeção ORIGINAL e sua repetição fresca sob lock usam esse mesmo caminho antes de criar intent/autorizar retorno; Operations mantém a validação no uso antes de cada partida. Geração37 contra guarda38 nega `guard_generation_changed`, inclusive quando o inventário foi atualizado para corresponder exatamente ao certificado inválido. Mudança entre inspeção e admissão também nega, sem intent ou partida. Direção/configHash e identidade reaparecida têm negativas dirigidas.

## R2 — checker original canônico

`original_checks.py` é produzido por `future_sources.original_checker` a partir de fonte Git fixada em SOURCE_PROVENANCE. Não reimplementa aproximadamente os predicados. Mantém os corpos de `read`, `read_permission` e os loops completos de imutáveis/quatro modos, com equivalência AST ensaiada. Mantém política/shape/hash, perfis pelo `profile_delta` compartilhado, nomes/planos, manifests/scripts, tipos/UID/modo600/nlink, integridade das referências window/review, contratos de restore e ecossistemas. Usa também o validador canônico de baseline dos quatro modos, inclusive frontend Build ID.

O recorte exclui apenas a admissão live do runtime candidato (`runtime-inventory`, `.env` candidato e arquivos/links executáveis candidatos). Caminho da preparação permanece conferido. A população imutável canônica é mantida integral, não filtrada em tempo de recuperação; deve continuar contendo as dependências originais/compartilhadas aprovadas. O checker não pode inventariar nem eliminar referências para conseguir PASS.

O índice dedicado `original-preparation-review.sha256` pertence exclusivamente a uma versão futura local. Deve enumerar os arquivos selados aplicáveis ao caminho original e metadados compartilhados, incluindo mapas originais, provas, scripts/manifests e dependências. Evita usar um índice cujo alcance obrigue a leitura de bindings/overlay exclusivos do candidato. Ele, o contrato canônico original e o sequencer-manifest exigem pins explícitos novos no contrato de recuperação; faltas/divergências negam. A cobertura mínima do índice é exigida a partir dos arquivos/perfis/provas compartilhados e controles originais pinados; até um índice vazio ou sem mapa original com pin explicitamente renovado nega `original_review_coverage`. Nenhum manifest histórico é editado e não existe fallback para índice vazio ou hash inferido de sidecar não aprovado. Não foi produzida uma geração operacional.

`Contract` invoca esse checker com `live=True`, confere os pins e metadados do contrato/arquivos/código e mantém as verificações próprias de perfis, frontend/guarda38. O original continua exigindo seus controles canônicos, mesmo quando o candidato não está disponível. O start gate repete Contract; Operations continua revalidando certificado, ordem, DB e bindings. `path_bindings`, Event e suas referências versionadas não foram alterados.

## Provas executadas e limites

[32 PASS, nomes e hashes](CORRECTION_PROOFS.json); [saída sanitizada](CORRECTION_TEST_OUTPUT.txt). 20 testes dirigidos novos e12 interfaces existentes afetadas; não repetida a suíte42 completa nem a suíte de prevenção19/28. A checagem estática compartilhada atinge também estados candidatos; por isso foram incluídos os três caminhos de seleção/retorno candidato, além de PRESTOP/ORIGINAL.

Contraprovas: certificado antigo com/sem atualização do inventário; direção/configHash; identidade reaparecida; conteúdo/metadados de referência imutável; alteração da lista imutável; UID/modo/nlink selados; substituição/symlink, ausência, hash e leitura proibida; índice original ausente; mudança de geração antes do intent. Positivas: STOPPED_UNSELECTED→ORIGINAL, PRESTOP sem partida, três estados candidatos. Regressões: consumo, resposta de start perdida, seleção incerta, Event775/binding candidato ausente antes da ida, independência do retorno original (inclusive proibindo qualquer leitura/lstat no runtime externo candidato) e revalidação entre API/worker.

O caso de concorrência no mapa original passa agora a negar mais cedo com `review_hash_drift`, antes do segundo start, em vez de chegar a `original_binding_map_drift`; não houve relaxamento do teste nem remoção do controle no uso. Dois ajustes do ensaio foram feitos durante a implementação: nome de teste selecionado e expectativa desse erro antecipado; a saída final certificada é a dos32 PASS.

Reprodução: `python3 -B docs/reviews/automation-freeform-window-release-af26/crm-csv-integrated-recovery-20261016/reproduce.py`. Copia somente os arquivos declarados e fontes Git com hash para diretório temporário; filho sem Git/local-evidence. Consumidores Recovery/Bridge/Contract/Operations/Sequencer/ScheduledControls, checker original, ecossistemas e baseline são reais. Perfis, arquivos e recibos são sintéticos. Efeitos externos e observações /proc/DB/HTTP/root são simulados; restore válido é autoridade previamente certificada injetada, não restaurada novamente. Falhas de metadados são injeções de lstat/is_symlink, sem chmod/chown. Ancestrais externos Event seguem a simulação755 do ensaio anterior, não são prova produtiva. A admissão/checker da ida candidata segue injetada e não está sendo certificada como pacote produtivo.

## Diff e entrega

[Diff restrito desta correção](CORRECTION_DELTA.patch), [delta integrado contra6bcf](FULL_DELTA.patch), [integrações futuras](consumer_delta.patch) e [índice de hashes](PUBLIC_FILES_SHA256.json). CORRECTION_DELTA exclui a si, índices gerados e arquivos de arquivo; FULL_DELTA exclui a si e a cópia histórica de FULL_DELTA para evitar incorporação recursiva. A cópia histórica permanece no disco, identificada pelo índice, sem reescrever seus bytes.

Código alterado: recovery_bridge.py; recovery_contract.py; future_sources.py. Novo consumidor: original_checks.py. Provas/reprodução: test_recovery.py (fixture estática completa/expectativa antecipada), test_corrections.py, reproduce.py e SOURCE_PROVENANCE.json (duas fontes Git adicionais). Documentação/artefatos: REPORT.md, este relatório, CORRECTION_PROOFS.json, CORRECTION_TEST_OUTPUT.txt, patches e índice; breve atualização de BACKLOG_TECH, RUNBOOK_WHATSAPP_AGENT e DOCUMENTATION_INDEX. recovery.py, recovery_start.py, policy_proposal.py, inputs.py, STATE_MATRIX.md e o trecho real Operations permanecem inalterados.

## Pendências e riscos residuais

A preservação local dos predicados não certifica suas observações produtivas. Antes de qualquer composição futura: produzir e revisar os novos pins/índice original completo, escopo de imutáveis e quatro modos sobre os bytes concretos, dependências originais/reader, perfis/identidades reais, autoridade root e política coerente. Depois, somente com autorização própria, conferir frescor/RPO/capacidade, DB/writers/saída/ownership, crons/supervisão/saved/fallback e fronteiras de liberação. A validação antecipada não elimina concorrência; revalidações no uso permanecem obrigatórias. Resposta perdida/incerto/consumo não autoriza replay; após possível seleção/escrita candidata não há retorno original por hipótese. Retorno pós-unfence continua fora deste fluxo.

Não executados: efeitos PM2/root/HTTP/SQL reais, nova prova de restore, instalação/política, captura VPS, backup ou janela. Nenhuma retomada CSV, Prisma, retenção, .env, credenciais ou permissões produtivas. Segurança externa/risco histórico permanecem OPEN conforme decisões existentes. Parar para revisão.
