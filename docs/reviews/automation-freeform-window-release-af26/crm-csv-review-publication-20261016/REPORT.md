# Reconciliação e publicação de revisão — recuperação integrada CRM/CSV

**CSV SUSPENSO / NOT DEPLOYED / NOT WINDOW READY.** Código: ACCEPT LOCAL no alcance das provas anteriores. Composição: PREPARED LOCALLY, sem certificação operacional. Base/parent esperado `6bcf122ca5e5992769e67c1158208408b9c0b15b`; branch `review/campaign-recovery-20260926`.

Esta rodada lê e disponibiliza o trabalho existente. Não corrige implementação, não completa bindings/pins, não repete testes e não prepara execução produtiva. Somente documentação de reconciliação, seleção de publicação e cópias deduplicadas de código já existente foram acrescentadas. Não houve VPS/SSH, observação produtiva, backup, instalação, contenção, partida, credenciais, dados ou permissões produtivas.

## 1. Instruções intermediárias e limites

| Solicitação de16/10, Fortaleza | Alcance autorizado e resultado |
| --- | --- |
|11:31:39 — implementar recuperação integrada local sobre6bcf|Classificação STOPPED_UNSELECTED, opção ORIGINAL no CLI e proposta de política; consumidores reais com efeitos simulados;42 testes iniciais. Sem geração operacional/commit.|
|13:55:08 — revisão final|Revisão somente leitura e contraprova dirigida; R1/R2 encontrados.42 PASS não cobriam essas invariantes. Sem corrigir naquela rodada.|
|14:30:09 — corrigir os dois achados|Reutilização do certificado canônico e checker original completo;20 contraprovas novas e12 interfaces afetadas, total32. Sem repetir42.|
|14:45:31 — aceite técnico|Conferência de código, patches, hashes e provas válidas; ACCEPT LOCAL. Nenhum teste repetido ou certificação produtiva.|
|14:53:28 — composição/preparação offline|Kit de código e planos de observação/binding;110 arquivos compostos, reutilização de runtimes;6 provas iniciais +1 negativa adicional. Não é pacote executável de janela. Última entrega15:22:07.|
|Após15:33 — result report|Reconstrução sanitizada da cronologia e índice de176 arquivos. Sem nova implementação.|
|Esta rodada — reconciliar e publicar|Disponibilização mínima para revisão direta na branch existente, sem continuar a implementação. Os checkpoints históricos não foram reescritos como resultados atuais.|

[RESULT REPORT completo](../crm-csv-result-report-20261016/RESULT_REPORT.md), [índice cronológico/176 hashes](../crm-csv-result-report-20261016/RESULT_EVIDENCE_INDEX.json), [composição original](../crm-csv-recovery-precert-20261016/REPORT.md), [aceite local](../crm-csv-integrated-recovery-20261016/local-acceptance-20261016/REVIEW.md).

## 2. R1 — geração e certificado canônico

**Disparador:** `switch/old-exit-confirmed.json` com geração37, guarda efetiva38 e inventário de importações atualizado para apontar ao hash desse certificado inválido.

**Consequência antes da correção:** `Recovery.inspect` podia oferecer ORIGINAL/STOPPED_UNSELECTED, embora `Operations.certificate` negasse `guard_generation_changed`. A consistência entre certificado e inventário não demonstrava compatibilidade com a geração efetiva. Era uma falha local de elegibilidade; nenhuma aplicação produtiva foi feita.

**Funções:** `Bridge.verify_recovery_exit`, chamada por `Contract.original_allowed`; `Recovery.recover` repete a classificação sob dois locks e chama novamente as verificações antes do intent. O consumidor final `Operations.start` conserva seu próprio certificado.

**Correção existente:**

```python
op.restore_proof(); op.guard()
op.certificate('old-exit-confirmed.json', API)
op.old_absent(read(self.root / mode / 'stop-start.json'))
```

A chamada canônica verifica direção/configHash, geração da guarda, árvores/identidades e sockets. DB zero e inventário ligado ao certificado permanecem exigidos.

**Contraprova preservada:** [FINAL_REVIEW_CHECKS.directedCounterexample](../crm-csv-integrated-recovery-20261016/FINAL_REVIEW_CHECKS.json). **Regressões:** `test_previous_generation_consistent_inventory_denied`, `test_old_generation_even_without_inventory_update_denied`, `test_certificate_direction_and_config_denied`, `test_certificate_identity_reappearance_denied`, `test_generation_race_before_intent_denied`. A negativa deve anteceder intent/efeitos de retorno, inclusive quando os dois documentos concordam entre si. [Código final](../crm-csv-integrated-recovery-20261016/recovery_bridge.py), [testes](../crm-csv-integrated-recovery-20261016/test_corrections.py).

## 3. R2 — checker ORIGINAL e integridade

**Disparador:** referências imutáveis ou metadados/arquivos selados divergentes que não eram integralmente cobertos pelo contrato inicial do retorno original. A revisão original identificou estaticamente a lacuna; a correção acrescentou contraprovas concretas.

**Consequência antes da correção:** pins parciais de conteúdo podiam admitir uma preparação que o checker canônico recusaria por controles aplicáveis ausentes. Independência do candidato estava sendo confundida com um recorte incompleto dos controles do original.

**Funções:** `Contract.__init__`, `future_sources.original_checker`, novo `original_checks.check_original`/`read`/`read_permission`; gate `authorize_original_start` repete Contract. `Operations` continua revalidando no uso.

**Correção existente:** transformação explícita da fonte Git pinada `canonical_contract.py`; reutiliza helpers e loops completos de imutáveis/quatro modos. Exige lista não vazia, tipo/UID/modo/hash, arquivos selados regulares/não symlink/nlink1/owner atual/600, ecossistemas, baselines, restore, perfis, planos, scripts/manifests e política/hash. O contrato exige cobertura do `original-preparation-review.sha256`, além do pin desse índice. Índice vazio/incompleto com hash renovado no ensaio também nega. Equivalência dos predicados e loops é verificada por AST.

**Independência exata:** não exige executável/runtime externo, overlay ou mapa exclusivo candidato; continua exigindo os metadados compartilhados dos quatro modos/perfil alvo. `test_original_never_reads_candidate_runtime` proíbe read/lstat nesse runtime e exercita ORIGINAL. Não é uma dispensa geral de arquivos com nome candidate.

**Regressões:** `test_immutable_content_drift_denied`, `test_immutable_metadata_denied`, `test_sealed_metadata_denied`, `test_sealed_owner_and_hardlink_denied`, `test_missing_sealed_file_denied`, `test_sealed_replaced_symlink_denied`, `test_sealed_integrity_denied`, `test_read_failure_denied`, `test_immutable_reference_list_change_denied`, `test_explicitly_pinned_empty_review_denied`, `test_explicitly_pinned_incomplete_review_denied`, `test_original_review_missing_denied`, `test_canonical_checker_reproduced_exactly`, `test_checker_canonical_blocks_unchanged`. [Relatório de correção](../crm-csv-integrated-recovery-20261016/CORRECTION_REPORT.md).

## 4. O que representam110 arquivos

Não são110 implementações novas. São **84 cópias de código nos quatro modos (21 por modo),25 window e1 proposta de política**. Há **48 conteúdos SHA256 distintos**. A proveniência classifica os110 destinos assim:

| Origem declarada | Destinos |
| --- | ---: |
|Template local não consumido, somente código|93|
|Fontes canônicas pinadas|5|
|Transformações da prevenção pré-parada|2|
|Transformações aceitas de CLI/Sequencer/start gate|3|
|Extensão já aceita dos quatro modos no ecossistema|1|
|Módulos aceitos copiados sem alteração, incluindo proposta pura|6|

Dez destinos registram transformação antes/depois; os demais são cópias. Esses números classificam destinos, não autoria ou48 programas independentes.

**Fonte editável canônica local:** `crm-csv-integrated-recovery-20261016/{recovery.py,recovery_contract.py,recovery_bridge.py,recovery_start.py,policy_proposal.py,future_sources.py}`. `original_checks.py` é o consumidor entregue e deve corresponder exatamente à transformação `future_sources.original_checker` da fonte Git pinada; não editar sua cópia no kit. `inputs.py`/`SOURCE_PROVENANCE.json` fixam as fontes de origem. A prevenção pré-parada permanece nos arquivos já versionados em6bcf. `compose_offline.py` é a fonte do empacotamento de código, não do runtime funcional. Fontes canônicas reaproveitadas devem ser alteradas futuramente em versões próprias revisáveis; snapshots do kit não são novas autoridades editáveis.

**Publicação mínima:** não são publicados110 arquivos executáveis em seus quatro diretórios. [CODE_REVIEW_INDEX](CODE_REVIEW_INDEX.json) resolve cada destino por hash para fonte já versionada em commit exato, módulo entregue ou **37 snapshots distintos de código** em `code-sources/`. Onze conteúdos distintos são reutilizados por referência. Os37 snapshots são bytes exatos já existentes, não implementações novas. Mantêm-se os cinco índices/estado do kit original para conferir os114 membros, além do hash do próprio COMPOSITION. Não há perfis, mapas privados, tars, dados ou nova geração operacional.

**Procedência privada indispensável:** o trecho `reference_sources/operations_recovery_original.py` contém somente a classe Operations e Controls.unfence/helpers declarados, não o entrypoint consumido. `SOURCE_PROVENANCE.json` fixa hash da fonte integral, ranges e hash do trecho entregue (`0e577660…`). Não é possível reconstruir a fonte integral privada a partir do trecho, nem isso é exigido pela reprodução32. Os snapshots adicionais derivam do template local não consumido; cada hash antes/depois/origem consta no índice de código e na proveniência original, cujo índice-fonte é ligado à prova Git `921a44a0…`, review `caef0b3c…`. O índice privado completo/perfis não são publicados.

## 5. Consumidores reais, provas reutilizadas e simulações

**32 testes:**20 dirigidos de R1/R2 +12 interfaces existentes. Conectam o CLI transformado `main/inspect/recover`, Recovery/Contract/Bridge, Sequencer, classe canônica Operations (`stop/certificate/start`), Controls.unfence, System.validate_bindings/path_bindings, ScheduledControls, baseline/ecosystem/profile_delta, stage_boundary e checker ORIGINAL. O start gate real autoriza o ramo original, com fábrica ligada ao controlador sintético; não prova materialização operacional de recovery_binding.

Os12 testes de interface incluem PRESTOP sem start; ORIGINAL completo sem overlay; três retornos candidatos; recuperação consumida; start com resposta perdida; Event775 e binding ausente negando a ida antes de efeitos; revalidação do mapa original entre API/worker; seleção incerta e independência do mapa candidato. Os nomes e32 resultados estão em [CORRECTION_PROOFS](../crm-csv-integrated-recovery-20261016/CORRECTION_PROOFS.json).

**Sete provas de composição:** `verify_offline.verify` é real e não importa consumidores. Confere bytes/metadados/membership/AST e estado unbound. `compose_offline.compose` é real no seu recorte: saída existente, parent inadequado e índice-fonte adulterado negam antes de copiar. Foram6 provas iniciais e1 adicional; não são sete testes operacionais de recuperação. Nenhum Operations/PM2/root/SQL foi executado por elas.

**Simulado:** processos/ticks/árvores/sockets, root/fence, PM2, systemd, cron, SQL/admissões, HTTP/health, captura worker, saved/fallback e perfis. Restore é uma autoridade positiva/negativa injetada, não um restore novo. Metadados negativos usam lstat/is_symlink injetados; ancestrais externos Event são modelados755, o775 interno é sintético. `csv_contract.check` da ida candidata e `check_current` são stubs no harness funcional; o checker ORIGINAL acrescentado em R2 é real. Não alegar certificação da admissão completa candidata pelos32 testes.

**Ainda não comprovado:** efeito real dos comandos, runtime/identidades e credenciais atuais, política instalada, fase fenced, saída/DB ownership atuais, contenção/unfence, health e reconexões produtivas, capacidade/RPO/custódia atuais, retorno pós-unfence e futura cadeia operacional integral. Nenhuma nova leitura produtiva foi feita nesta rodada.

## 6. Dependências e achados ainda abertos

1. **Root:** código conserva POLICY_SOURCE `fa113e…`; último recibo histórico é `e2a5ffab…/complete`. Nenhum é certificado atual. Captura/checker/pré-instalação/política/installer CAS e manifests futuros precisam concordar com fonte efetivamente observada e revisada. Não houve substituição de hashes.
2. **16 vínculos:** quatro arquivos em cada modo (`switch`, `return`, `return-partial`, `return-before-commit`): `ops.py`, `execution-check.cjs`, `delegated.py`, `read-state.py`. Contêm namespace do template não consumido. `BINDING_PLAN.pendingNamespaceRenderings` enumera todos; não são16 arquivos de credenciais e não estão resolvidos. Nenhum namespace operacional novo foi preenchido.
3. **Pins de fase:** `RECOVERY_CONTRACT_SHA256`, `INSTALLED_POLICY_SHA256`, `ROOT_POLICY_PERMIT_SHA256`. O permit exige fase fenced, target profile e idade<600s. Falta materializador/autoridade externa revisada para a fase/decisão, evitando ciclo contrato→manifest→binding→contrato. O helper puro `binding_source` não resolve isso operacionalmente. Zero/default e recibo fictício continuam ausentes.
4. **Inputs:** perfis/mapas/planos/imutáveis/provas/restore/manifests reais ainda não materializados.15 grupos de observação NOT_EXECUTED. O checker canônico sobre o kit nega `window/csv-contract.private.json` ausente; negativa preservada.
5. **Reprodução das sete provas — limitação confirmada nesta revisão:** `compose_offline.compose` exige HEAD exatamente6bcf e índice/template em `local-evidence`; o teste de índice adulterado acessa essa origem. Após a publicação, um clone no novo HEAD não executará a suíte inteira sem retornar à base e disponibilizar fontes privadas. Não alterar HEAD/defaults/mocks para PASS. A entrega permite reconstruir os bytes compostos por índice deduplicado e reproduzir32 testes via `reproduce.py`; isso não equivale a uma reprodução pública integral das sete provas do produtor. Código não corrigido nesta rodada.
6. **Documentação histórica:** índices/patches anteriores são checkpoints, não listas da publicação reduzida. FULL_DELTA corresponde ao checkpoint integrado após correções; não inclui a composição/reconciliação posteriores nem a si próprio. O DELTA.patch da composição, que incorpora os110 códigos, fica fora da publicação mínima; seu hash permanece no índice histórico. O MANIFEST original de128 membros refere o kit local original; use o índice deduplicado para resolver seus110 códigos. ALLOWLIST/FILES.sha256 desta rodada são a autoridade do conjunto publicado.

Esses pontos impedem NOT WINDOW READY de avançar. Não constituem autorização para corrigi-los ou observar a VPS agora.

## 7. Integridade, históricos e controles de publicação

Releitura integral dos relatórios/índices, fontes pertinentes e contraprovas. Conferidos176 hashes do índice resultante,41 entradas do índice aceito, código/saída dos32 testes, fontes Git e trecho entregue, manifests de aceite/result report/composição e hashes do kit. `consumer_delta.patch` foi reconstruído com transformações puras e comparado byte a byte; FULL_DELTA teve aplicabilidade conferida contra arquivos da base em diretório temporário, sem aplicação. Não se executaram entrypoints nem testes funcionais.

FINAL_REVIEW, FINAL_REVIEW_CHECKS e PROOFS_SANITIZED permanecem idênticos às cópias anteriores. Os18 arquivos de `prior-final-review` são necessários à rastreabilidade da contraprova/correção e comparação dos patches; não são runtime nem comandos para executar. Nenhum histórico versionado de geração/recibo/manifest consumido entrou no diff. Isso demonstra preservação dos arquivos locais auditados; **não é prova nova do filesystem da VPS**.

As três páginas canônicas receberam apenas um checkpoint de reconciliação que remete a este relatório e diferencia publicação de implantação. Os hashes históricos de snapshots documentais continuam históricos, não foram reescritos para apontar aos documentos atuais.

Pré-publicação: HEAD e remoto observados iguais a6bcf; índice Git inicialmente vazio. `vercel.json` mantém `git.deploymentEnabled["review/campaign-recovery-20260926"]=false`. Único workflow versionado `.github/workflows/ci.yml`: push/PR somente main/develop; nenhum workflow_dispatch e nenhum job operacional aplicável a este push. Configurações não alteradas; não será aberto PR. Não se inspecionaram integrações externas não versionadas: a evidência de ausência de deploy automático é a configuração versionada aplicável, não uma alegação sobre serviços externos desconhecidos.

## 8. Revisão/reprodução local e alcance da entrega

A lista completa está em [ALLOWLIST.json](ALLOWLIST.json), com caminhos relativos, finalidade e hashes em [FILES.sha256](FILES.sha256). [PUBLICATION_CHECKS.json](PUBLICATION_CHECKS.json) registra gates de publicação e achados. Fontes funcionais permanecem iguais às aceitas. Não executar arquivos `.source`, CLI composto ou instalador; são material de revisão.

A reprodução funcional existente e já comprovada é:

```bash
python3 -B docs/reviews/automation-freeform-window-release-af26/crm-csv-integrated-recovery-20261016/reproduce.py
```

O comando lê fontes versionadas por SHA/hashes e o trecho mínimo entregue, copia para diretório temporário e executa32 testes sintéticos sem fallback local-evidence. Não foi repetido nesta rodada. O clone deve conter o histórico Git referenciado; zip sem objetos Git não satisfaz esse contrato.

Para examinar os110 destinos sem publicar quatro cópias de cada arquivo, resolva `CODE_REVIEW_INDEX.entries`: `kind=git` por `git show commit:path`; `kind=delivery` pelo caminho relativo. Em ambos os casos confira SHA256 e tamanho. Cada arquivo tem os bytes antes/depois na proveniência. Os114 membros originais podem assim ser reconstruídos em **fixture temporária de revisão** (110 códigos +4 metadados originais), com COMPOSITION como115º arquivo, sem ler local-evidence. A conferência nesta rodada resolveu todos os bytes em memória; não produziu nova geração, não importou consumidores nem reexecutou o produtor.

**Nenhuma autorização de janela nasce desta publicação.** Próximo passo é revisão direta destes artefatos/limites. Não continuar implementação após publicar. NEWauth+NEWDB+NEWcipher, produção, ambos crons, guarda38 e out.15 permanecem fora de alteração; segurança externa/risco histórico continuam OPEN conforme aceite e gatilhos já registrados.

## 9. Conferência staged final

Allowlist exata de113 arquivos. `git diff --cached --check` retornou2 por whitespace já presente nos patches históricos e em três snapshots de fonte (linha vazia final ou espaço final). Lista em PUBLICATION_CHECKS.diffCheck. Não se reescreveram evidências/código para silenciar o aviso. O aviso não representa uma divergência dos hashes aceitos; integridade/aplicabilidade dos patches e identidade dos bytes foram conferidas separadamente. Não declarar diff --check global PASS. Nenhum arquivo adicional ou mecanismo de deploy foi incluído.
