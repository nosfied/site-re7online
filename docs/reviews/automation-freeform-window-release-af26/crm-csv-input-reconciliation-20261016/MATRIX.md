# Matriz dos 57 grupos — requisitos, não capturas

## Atualização de17/10 — pendências restantes, base a60a00cb

Revisão da integração frontend: **ACCEPT LOCAL no alcance dos quatro ensaios**, em conjunto com as onze provas de reconciliação. São provas locais/fixtures, não observações ou certificação produtiva. [Integração](../crm-csv-diagnostic-integration-20261017/REPORT.md) e [reconciliação](../crm-csv-frontend-reconciliation-20261017/REPORT.md) não são reabertas. A seção histórica dos57 IDs abaixo permanece intacta; `INPUT_MATRIX.json.currentReconciliation` registra somente esta atualização, sem preencher inputs.

| Pendência / consumidores | Evidência reaproveitável | Conclusão offline | Faltante exato e dependência operacional |
|---|---|---|---|
| Saved/fallback e identidades finais — LIVE, I02/I10/I18/I26/I34/I49/I50; Bridge/Contract/compare_saved/System | Restauração original e UI aceitas16/10; referências hash-conferidas; RPC/identidades iniciais/API-worker de17/10 às10:14; frontend reconciliado localmente | Proveniência e contrato correto disponíveis; mapas OS/PM2 não são intercambiáveis. Sem necessidade de nova investigação frontend | A coleta consumida não chegou a ler saved/fallback atuais nem repetir boot/identidades ao final. Faltam essas comparações completas, owner/modo600 e vínculo ao intervalo de uma observação futura autorizada. Não promover o stat inicial a observação final |
| SQL/ownership — I37/I38/I41/I52; db_container/db_backends/identity.sql/classify/db_owner_set_gate | Canal NEWDB documentado, configuração loopback5432 e proxy; binding histórico1d67ff65; SQLs/classificador e inventário Event terminais históricos | Consumidores/canal pretendido/consultas estão definidos, sem conexão ou novo resultado | Rota/ID/imagem/rede/publicação e cliente psql não foram alcançados; depois, SELECT autorizado para cluster/database/role/privilégios/fronteira/importações; atribuição por tuplas socket/proxy/backend com observador canônico root. SELECT sozinho não fecha ownership. Produção ativa não exige zero artificial; saída/fence/duas amostras são prova da janela, não de leitura preparatória |
| Toolchain protegido — TOOLCHAIN/I57 e ROOT/I53; Context/pm2_input/parser/install_static | Hash Node d01614ef, seeds CLI/package com tar pinado, closure26 diagnóstica e provas locais PM2/FD/B3/B4 | Reusar fontes e prova de consumo FD; conferir apenas closure declarada contra fontes pinadas já disponíveis. Isso não prova a imagem/dependências instaladas | Faltam closure JS/ELF efetivamente consumida e proteção real de toolchain/bibliotecas/alias. R1 observou futuros alvos ausentes. Não repetir readelf nem instalar alternativa;4552 não é meta de captura. Observações residuais e instalação protegida requerem escopos próprios |
|16 vínculos, fonte root e autoridade — PATHS/DERIVED/ROOT/ANCHOR/PERMIT; path_bindings/checkers/Store/Context | BINDING_PLAN, composição estática ORIGINAL/quatro modos e provas aceitas; R1 e2a5/helper8de/sudoers62b5; inspeção de alvos ausentes | Mapas/ordem de selagem conhecidos; não há16 capturas. **Incoerência de fonte root fa113/e2a5 ainda aberta**; pode ser revisada localmente com os bytes preservados | Namespace/perfis/caminhos/metadados atuais precedem as quatro renderizações por modo (ops/execution-check/delegated/read-state). Só depois índices→contrato→política→manifest→âncora, sem ciclos. Instalação estática, âncora e emissão owner são decisões separadas. Permit recovery não existe por consulta e não é requisito da ida/PRESTOP |

**Impedimento pré-contenção já observado:** os cinco pais Event775 da R1 continuam incompatíveis com event_parents. É evidência datada, não nova medição. Se inalterados, a ida nega antes de contain/stop. Exige decisão operacional específica e revisão restrita de permissões/consumidores antes de qualquer execução; nunca chmod genérico, dispensa do predicado ou ajuste automático. ORIGINAL permanece independente do código candidato.

Os conjuntos acima dependem de ROOT/LIVE/SQL/TOOLCHAIN;32 arquivos de modo são derivados, não novas observações independentes. Os alvos root futuros ausentes não são reparados por documentação. Fonte e2a5 observada não é certificado root atual; o Context/permit não pode ser fabricado para completar a matriz.

O restore certificado retido/parado continua reutilizável apenas se schema/fronteira/ferramentas permanecerem compatíveis; preservar temporaryDatabaseRemoved=false. Não renovar backup/RPO/root agora: RPO curto pertence à sequência coordenada futura, root por último. Supervision/cron before já comparados não são reabertos; futura admissão/encerramento exigem suas revalidações próprias.

**Primeiro bloqueio e sequência única:** ver [atualização do relatório](REPORT.md). Os comandos antigos e destinos consumidos não são um roteiro autorizado novo.

---


Cada ID reproduz literalmente um item de MISSING_INPUTS. O JSON adjacente contém consumidor, fonte, reuso, observação, momento e frescor **por item**. Os agrupamentos abaixo não atestam nenhum input.

| Grupo | Consumidor/predicado | Fonte / reuso | Observação e momento |
|---|---|---|---|
| ROOT | root policy_from; csv_contract.check/original_checks.check_original; pre_install.verify; installer CAS | Root files/chains actually installed + owner-reviewed static package; Historical root policy e2a5ffab… and accepted source helper/sudoers are comparison evidence only | R1 root bytes/hash/metadata/chains, prior targets incl absent entries; no helper invocation; At future binding review; repeat source CAS immediately before installation. Short-lived root certificate only at coordinated window; historical <600s is not a newly authorized deadline. |
| LIVE | Bridge.apps/app_matches/identity; Contract; profile_delta; System.check_config; baseline_all4 | Active process identity/config, original saved/fallback; canonical accepted NEWauth/NEWDB/NEWcipher custody; Accepted original recovery receipt and source profiles are historical candidates, not current attestations | R2 process identity/config and private exact profile comparison; root/proc access only where necessary; Binding capture plus revalidation before admission, stop and start. PID/ticks and boot must still match; no reusable fixed TTL inferred. |
| PATHS | prestop_contract.path_bindings/validate_pre_stop; original_bindings; Operations.__init__/start | Actual cwd/script/.data resolution for original and staged targets; 16 pendingNamespaceRenderings; original consumer semantics and 123-path static kit | R2 resolved paths, link targets and existing candidate artifact digest; no candidate selected; At materialization; parents/links rechecked before contain and at use. No age-based PASS. |
| EVENT | prestop_contract.event_parents; csv_boundary.event_consumers/event_policy; check_current | Literal Event source and every parent; known Event consumer inventory; Accepted Event predicate and CSV compiled proof; historical 775 finding is not repaired | R2 lstat chain/hash plus current consumer source references; read failure/775 => DENY; Before contain and CAS at overlay/use; no TTL substitutes for revalidation. |
| CRON | ScheduledControls.verify; delegated controls; Recovery closure; helper source controls | deploy crontab and /etc/cron.d/re7-converta-backup separately; Consumed restricted cron recovery receipts, original six commands/schedules | R1/R2 both current byte sets and source hashes; no crontab install/job execution; At binding, admission, pre-stop recovery and final closure; compare exact bytes, not one combined success flag. |
| SQL | capture_imports.classify; csv_boundary.exit_and_imports; db_owner_set_gate.verify; current-sql baseline | Bounded Event SELECT plus known-activity inventory; current SQL/proxy/FD ownership; Classifier/SELECT source and terminal historical operations; no current scope inference | R3 read-only SQL through verified channel + R2 ownership/process inventory; Before future admission; post-exit terminal proof only inside authorized window. UNKNOWN/PROCESSING/incomplete denies; no HTTP inference. |
| CONTROLS | Bridge.guard; baseline_contract; check_current; ScheduledControls; closure | Current guard/out.15/supervision and both cron controls; Owner accepted UI and historical guard38/closed out.15; preserve as history | R2 canonical GET/SELECT and supervision reads with credentials handled privately; Binding and fresh admission; after exits and closure independently. Do not run waiting-work historical entrypoint. |
| RESTORE | restore_contract.validate shared by Operations/baseline/Node; admission RPO/custody checks | Original certified restore + schema/tooling frontier + byte-exact custody receipts; Retained/stopped certified restore, original receipt bytes; prior snapshot proof | No backup now. Later R0 only when a window actually requires fresh RPO; compare frontier/tools first; Restore has no calendar TTL in validate and does NOT certify RPO. Retain temporaryDatabaseRemoved=false; RPO <3600s only when invoked by reviewed admission; root last. |
| DERIVED | Contract/check_original; csv_contract.check; mode/baseline/ecosystem checkers; Context manifest DAG | Materialize from authenticated observations and accepted static code, then review by owner; Existing code/proofs, renderer and seal order; no historical data promoted to fresh | None independent: consumes ROOT/LIVE/PATHS/EVENT/CRON/SQL/CONTROLS/RESTORE; After inputs validated; seal leaves -> mode indexes -> original review -> recovery contract -> policy -> phase manifest -> anchor. Do not include own hash or permit in ancestor. |
| COMPILED | csv_contract.check compiled-proof binding; profile_delta | Certified CSV24e5857f package + sanitized compiled proof/provenance; Existing compiled package/proof; no rebuild | Check existing bytes and references at future materialization; no fresh production behavior asserted; Content-valid until bytes/toolchain/contract change; not time-based and not functional production validation. |
| TOOLCHAIN | authority.protected_bytes/Context.snapshot; pm2_input.start; parser; B4 install_static/verify_static | Actual Node/PM2 launcher, resolved scripts/modules and complete transitive dependencies; protected alias/libs; Full local PM2 B4 proof and same-byte FD transport; accepted static sources | R2 locate exact executable/interpreter and readlink; R4 close toolchain dependency/metadata inventory; Before approving static targets; immutable hashes and root chains revalidated at load/use; version output alone insufficient. |
| ANCHOR | root_store.Store.install_owner_once; Context bundle/validate_dag; Loader snapshot | Owner-approved contract/policy/profile/code manifest, root-owned immutable anchor; Accepted owner trust model and future installer source, not an installed authority | No observational substitute: require separately authorized static/anchor installation after package review; Only AFTER concrete package hashes and owner approval; query does not create or renew. |
| PERMIT | Store.issue_owner_once; Context.start_mode recovery authorization; original start gate | Explicit owner decision + fresh classification, execution identity, profile/policy pins; Accepted R3 distinction forward vs recovery and B2 lineage | Window-only facts/owner issuance, never part of next read-only capture; Recovery ORIGINAL/CANDIDATE only, age 0<=age<600s; once/decision-specific. PRESTOP and forward switch do not acquire recovery permit. |

## Correspondência exaustiva

| ID | Input literal | Grupo |
|---|---|---|
| I01 | `return/backup-manifest.json` | RESTORE |
| I02 | `return/baseline.private.json` | LIVE |
| I03 | `return/candidate.config.private.json` | DERIVED |
| I04 | `return/candidate.ecosystem.config.cjs` | DERIVED |
| I05 | `return/plan.private.json` | DERIVED |
| I06 | `return/proof-bindings.private.json` | RESTORE |
| I07 | `return/return.config.private.json` | DERIVED |
| I08 | `return/return.ecosystem.config.cjs` | DERIVED |
| I09 | `return-before-commit/backup-manifest.json` | RESTORE |
| I10 | `return-before-commit/baseline.private.json` | LIVE |
| I11 | `return-before-commit/candidate.config.private.json` | DERIVED |
| I12 | `return-before-commit/candidate.ecosystem.config.cjs` | DERIVED |
| I13 | `return-before-commit/plan.private.json` | DERIVED |
| I14 | `return-before-commit/proof-bindings.private.json` | RESTORE |
| I15 | `return-before-commit/return.config.private.json` | DERIVED |
| I16 | `return-before-commit/return.ecosystem.config.cjs` | DERIVED |
| I17 | `return-partial/backup-manifest.json` | RESTORE |
| I18 | `return-partial/baseline.private.json` | LIVE |
| I19 | `return-partial/candidate.config.private.json` | DERIVED |
| I20 | `return-partial/candidate.ecosystem.config.cjs` | DERIVED |
| I21 | `return-partial/plan.private.json` | DERIVED |
| I22 | `return-partial/proof-bindings.private.json` | RESTORE |
| I23 | `return-partial/return.config.private.json` | DERIVED |
| I24 | `return-partial/return.ecosystem.config.cjs` | DERIVED |
| I25 | `switch/backup-manifest.json` | RESTORE |
| I26 | `switch/baseline.private.json` | LIVE |
| I27 | `switch/candidate.config.private.json` | DERIVED |
| I28 | `switch/candidate.ecosystem.config.cjs` | DERIVED |
| I29 | `switch/plan.private.json` | DERIVED |
| I30 | `switch/proof-bindings.private.json` | RESTORE |
| I31 | `switch/return.config.private.json` | DERIVED |
| I32 | `switch/return.ecosystem.config.cjs` | DERIVED |
| I33 | `mode/window manifests and original-preparation-review.sha256` | DERIVED |
| I34 | `window/csv-baseline.private.json` | LIVE |
| I35 | `window/csv-compiled-proof.private.json` | COMPILED |
| I36 | `window/csv-contract.private.json` | DERIVED |
| I37 | `window/csv-known-imports.private.json` | SQL |
| I38 | `window/db-owner-bindings.private.json` | SQL |
| I39 | `window/deploy.crontab.before + window` | CRON |
| I40 | `window/event-consumer-binding.private.json` | EVENT |
| I41 | `window/initial.private.json` | CONTROLS |
| I42 | `window/original-bindings/path-bindings.private.json` | PATHS |
| I43 | `window/owner-evidence` | RESTORE |
| I44 | `window/path-bindings.private.json` | PATHS |
| I45 | `window/privileged-policy.private.json` | ROOT |
| I46 | `window/re7-converta-backup.before + window` | CRON |
| I47 | `window/recovery-contract.private.json` | DERIVED |
| I48 | `window/restore proofs and mode backup/baseline/proof-bindings` | RESTORE |
| I49 | `window/saved-dump.pm2.private.json + saved-dump.pm2.bak.private.json` | LIVE |
| I50 | `window/source.profile.private.json` | LIVE |
| I51 | `window/target.profile.private.json` | DERIVED |
| I52 | `window/waiting-work.private.json` | CONTROLS |
| I53 | `current protected-file/prior-target hashes and root chains` | ROOT |
| I54 | `phase code manifest with actual uid/modes` | DERIVED |
| I55 | `static anchor approved against policy/contract/profiles` | ANCHOR |
| I56 | `decision-specific permit (recovery only)` | PERMIT |
| I57 | `current PM2/Node executable + transitive toolchain integrity` | TOOLCHAIN |

## Os 16 vínculos

São `pendingNamespaceRenderings` do BINDING_PLAN: `ops.py`, `execution-check.cjs`, `delegated.py`, `read-state.py` em cada um de switch, return, return-partial e return-before-commit. Não são 16 PIDs, 16 capturas nem os três pins. Sua saída depende do namespace de uma **futura** preparação e dos caminhos reais compartilhados. Não foi reservado novo namespace operacional nem renderizado arquivo nesta rodada.

A matriz histórica menciona recovery_binding.py no sealOrder. Essa etapa foi substituída pela autoridade root aprovada em R3/B1/B2: não regenerar módulo de pins implícito. Reutilizar apenas o DAG aplicável: folhas estáticas e dados → índices por modo/original → contrato → política → manifest de código/metadados → âncora revisada. Permit específico é posterior, fora dos índices que o antecedem.

ORIGINAL dispensa código executável candidato, não os dados selados dos quatro modos nem switch/old-exit-confirmed.json. PRESTOP não parte. Os mapas original e candidato permanecem separados; resolução segue exatamente path_bindings, sem endurecimento improvisado.
