# afbb — correção do contrato de baselines após d717f113

**LOCAL VALIDATED / PREPARED FOR REVIEW / NOT DEPLOYED.** Não houve nova janela, instalação root, fechamento da guarda, contenção, cron/boot, restart, envio, reparo histórico ou alteração de tenant. A autorização funcional e de retorno permanece; a revisão do delta operacional é o gate atual. API/worker b9 e frontend af26 seguem efetivos.

## Causa corrigida e auditoria dos contratos

O diagnóstico operacional de d717f113 estava correto quanto ao `KeyError: supervision`, mas seu texto confundiu os arquivos: **o acesso que falhou é a `window/initial.private.json`**, não o baseline funcional de cada modo. `Controls.__init__` carrega o primeiro; a preparação anterior produziu somente `guard` e `observedUtc`, omitindo `supervision`. O relatório anterior recebe errata explícita; commit/logs, provas, política/fase, marcadores e preparação consumida permanecem preservados.

| Baseline | Produtores efetivos | Campos obrigatórios / observações | Consumidores |
| --- | --- | --- | --- |
| Operacional, `window/initial.private.json` | Antigo staging privado incompleto; agora `prepare_baselines.py` → `capture_operational`; retorno pós-unfence usa o mesmo capturador | `guard.open` bool, generation int >=0, tasks int **0** (contagem), ledgerFault **false**; `supervision` saída exata systemctl inactive/enabled ou inactive/disabled; observedUtc ISO com timezone; observedGuardOpen bool real | `ops.Controls` enter/finish; `DelegatedControls` prepare/finish; delegated renewal prepare/restore; JS open; validação sequenciador e política |
| Funcional, `<modo>/baseline.private.json` | Antigo finalizador privado; agora `capture_functional` + `write_baselines`; template pós-unfence recaptura SQL | auth/connected/flags: arrays de IDs string únicos; frontendBuild string não vazia de `.next/BUILD_ID`; observedAt ISO com timezone. SQL existente somente leitura, limitado a10s | preparation-bindings.cjs baseline/frontend em validação pós-unfence; contrato antes de qualquer close/prova/efeito; baselines dos três modos devem coincidir |
| Sequenciador, `self.baseline` em memória/journal | capture_baseline e post_unfence_return | guardGeneration int, três nomes canônicos; PID int positivo, ticks string decimal ASCII positiva, estado válido não zumbi/morto. Ausência só no worker de retorno com prova própria | close_then_preflight, certificado/frontend, recuperação prestop, ida/retorno |

`tasks` **no arquivo da guarda** continua objeto vazio `{}`, exigido pelo schema existente; no diagnóstico HTTP é array vazio; no baseline operacional é **contagem inteira zero**. Esses formatos não são intercambiáveis. `read-state.py` observa a guarda, não gera um quarto baseline nem fornece supervisão por inferência.

O helper root não consome esses JSON: lê a guarda, a política imutável e os processos/capturas; permanece byte a byte inalterado. `prepare_policy.py` agora valida o contrato completo antes de emitir política. Só o modo pós-unfence explicitamente marcado admite o layout com baseline funcional apenas em return, sem aceitar silenciosamente um modo faltante na ida normal.

## Menor delta aplicado

- `baseline_contract.py`: contratos separados, tipos estritos, campos obrigatórios, JSON/arquivo ausente com diagnóstico específico, identidade sequencial e coerência entre modos/BUILD_ID. Sem defaults falsy.
- `prepare_baselines.py`: observações reais de guarda/systemd e SQL existente, duas leituras coerentes de controles, saída exclusiva 0600; valida tudo antes de gravar; recusa arquivo preexistente, tentativa consumida ou gates habilitados. Nenhum comando mutativo de sistema/DB.
- Sequenciador valida o conjunto **antes de hashes/gates/inspect e de CAS**; recaptura compara guarda/geração/supervisão. Revalida antes de close; retornos também validam antes de enter/start. Nenhuma nova leitura permissiva, start repetido ou renovação cega.
- Patch sobre as origens atestadas: `ops.Controls` valida na construção; `delegated.bindings` valida antes de emitir/registrar/consumir prova e leituras de supervisão; `execution-check.cjs` chama o contrato read-only; `open.cjs` valida antes de ler ou sair pelo ramo guarda inicialmente fechada.
- Template pós-unfence usa capturadores compartilhados e valida o resultado. `guard.open` de **restauração** vem do baseline original validado; `observedGuardOpen` registra a guarda realmente fechada. Não inventa uma observação aberta. PID/descendentes/worker ausente/proxy e barreiras continuam exigidos.

Nenhuma mudança em helper/sudoers, prazo/nonce/certificados, provider, artefatos funcionais ou frontend. O módulo compartilhado entra em window e nos três modos, elevando cada manifesto de25 para **26 arquivos**. Hash de initial também é fixado no manifesto do sequenciador.

## Provas executadas sobre a composição final

| Prova | Resultado | O que é efetivo / o que é simulado |
| --- | --- | --- |
| Contratos e cadeia | **13 testes PASS**, com subcasos, sem somar como casos distintos | Captura → gravação exclusiva → leitura, Bridge.protocol, delegated request/record/main, prova/nonce/consumo e DelegatedControls.prepare/finish são reais. Código copiado da preparação final; somente prefixo bound é rebaseado para `/tmp` no laboratório. Systemd/crontab/nft/PM2/proc/DB são observações/efeitos injetados. |
| Regressões sequenciais afetadas | **24 PASS** | Driver controlado: CAS antes da prova, expiração/drift, falha parcial, ida/retorno/abort, frontend e controles; efeitos de sistema simulados. Mesmos bytes do sequenciador final. |
| Template integrado | **4 PASS** | Arquivos/manifests de26 e geração/leitura reais; retorno vivo e worker ausente, negativas de origem e logger. PID/socket/DB e root effects injetados, não atestação de nova troca real. |
| Gate JS | Incluído nos13, **PASS em Node20.20.0 real** | Node inicia Python real, lê JSON/config/manifest em fixture isolada e nega supervisão ausente, inclusive open com guarda inicialmente fechada; não inicia aplicação/provider. |

Reprodução negativa usa reversão do patch nas origens atestadas e o baseline operacional incompleto, percorrendo Bridge.protocol → main → prepare, reproduzindo o KeyError antes de crontab. Com correção, campo ausente/null/false/string vazia/tipo errado, snapshot alterado, JSON inválido, modo divergente, BUILD_ID divergente e identidade inválida negam antes de mutação. Não se substitui a validação do contrato por stub.

Durante desenvolvimento foram corrigidos problemas do harness (reverse-patch após rebinding, manifesto da fixture após recaptura); não são PASS da cadeia. O sandbox também negou spawnSync do Python no primeiro teste Node; a mesma prova passou em execução isolada fora dessa restrição, sem relaxar código. Evidências anteriores não são reatribuídas ao delta atual.

Reprodução usando a composição privada preservada:

```bash
python3 docs/reviews/automation-freeform-window-release-af26/v4-sequencer/test_baseline_contract.py local-evidence/reactive-baseline-correction-20261005/exact-final-composition-v3
python3 docs/reviews/automation-freeform-window-release-af26/v4-sequencer/test_sequencer.py
python3 docs/reviews/automation-freeform-window-release-af26/v4-sequencer/test_composition_template.py local-evidence/reactive-baseline-correction-20261005/exact-final-composition-v3
```

## Preparação concreta e hashes

Nova preparação: `/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-reactive-afbb-baseline-20261006T020000Z`. Captura em **2026-10-06T09:54:32.087189+00:00** (UTC). Estado observado: guarda aberta geração31, quatro sessões/cinco auth; API/worker b9 e frontend af26 com mesmos PIDs/ticks e zero reinícios. Os insumos foram gerados de novo; nenhum nonce, prova, fase ou marcador consumido copiado. Cinco gates **false**.

API afbb e tar mínimo exato `8b67292578090a2f564e4a9bf399b002e667bba723c936859fc438aa1221f5c8` reutilizados, fontes/compilados/manifesto completo novamente conferidos; nenhum rebuild ou suíte funcional alheia. Retornos para API/worker b9 efetivos, frontend, DB/auth e configurações preservados. Backup/restore anterior íntegro reutilizado (33ba8ab892619578b6fb1ce17c2dac5c643449a33790c2ae801fbacd769782ec); **não é backup recém-gerado nesta correção**. Deve ser reconfirmado/atualizado antes da futura janela conforme runbook, sem restore sobre produção. Esta etapa não declara WINDOW READY.

| Insumo | SHA-256 |
| --- | --- |
| Helper inalterado | `8de358fd60c6e7c880166651b45d7ebd60c8f9b102759ff7f7628796fda1b212` |
| Política nova, não instalada | `00912bf4e0f44d88b0c9c639ba8a3d7dd773b317ea24f9df35dbef4e4e06add9` |
| Contrato | `6ed15712948f998328b5ba82578d3241073848a4f8ce356861a12fa890964657` |
| Gerador de baselines | `a126003876c1d865d16725ba393856611525a9ea49875b37ebb595cf69deb696` |
| Sequenciador | `8fadca4c3071d96c6a6f82c38f1a3af8dea825b470bfbafe62f189940f348cc1` |
| Patch de quatro consumidores | `c1dc4a711d93b4c6a556bd97525622f8720e7f89f52ea04104b83aceb4478bbe` |
| OWNER-STEPS | `cdad4ce7abdbd62265971769d97dbdec21b0016bf57e6e0772b1496935c20cf2` |

[Manifesto completo](reactive-baseline-prepared/manifest.sanitized.json), [origens/resultados e hashes das provas](reactive-baseline-prepared/patch-attestation.sanitized.json), [comandos concretos](reactive-baseline-prepared/OWNER-STEPS.txt). Configuração, baselines com IDs, auth, tar, backup e logs privados excluídos do Git.

## Revisão, instalação futura e retorno

Apenas a **política** precisará de substituição por Deifson na sessão sudo, após revisão. O bloco publicado exige hash da política instalada `e8e431efdb99655a0e1f63aa91cba6eae25dedb5ca8910762376408006c4ab98`, arquiva o original em `incident-6683-window-policy.pre-reactive-baseline-afbb-020000.json`, instala a nova0600, valida cadeia/visudo/contrato e inspect (política nova/fase nula/origem viva). Não executar agora. Helper0644 e mesmas nove chamadas root permanecem; sem sudo ampliado.

Após revisão e gates imediatos: sequenciador único → captura/validação → CAS/drain → prova/preflight → contenção/controle → stop-pair uma vez → saída/certificados/zero backends/locks → API afbb → V4 fresca → worker mínimo reativo → controle HTTP sob nft → recaptura limitada → saved/fallback/unfence → validação completa → guarda/cron/boot. Frontend não para. Recusa antes de contenção aborta prestop; falha parcial/completa usa retorno preparado. Após unfence, política fresca de contingência exige Deifson disponível, com worker ausente comprovado quando aplicável; não reutiliza prova/start.

Reconfirmar backup, origem/env/bindings, proxy, sessões/trabalhos, controles e executor único antes de janela. Drift material nega; reconfirmar não significa adaptar arquivo consumido ao processo divergente. Escalonamento aos15min de contenção; sem bypass, kill adicional, restore produtivo ou retry de resultado incerto. O risco de shutdown antigo continua documentado, não foi corrigido por este contrato.

Campanhas/CRA: Audiência CRM, CSV e aceite específico CRA-PR seguem pendentes; ciclo avulso demo aceito não os cobre. SECULT/DB-only encerradas, inatividade Guia pausada e históricos intactos. **Sem deploy nesta etapa.**
