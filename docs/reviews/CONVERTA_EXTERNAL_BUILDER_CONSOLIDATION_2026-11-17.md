# Consolidação definitiva do builder externo — 17–18/11/2026

Esta revisão reconcilia código integrado, CI e receipts existentes. Não executou
build, transferência, instalação, deploy, PM2, retirement ou limpeza.

## Linha de autoridade

| Marco | Evidência | Conclusão reutilizável |
| --- | --- | --- |
| A838 | piloto externo API-only e registros E1 | separação entre artefato funcional, custódia e dívida do builder |
| FA10 | receipt `4b4f1a29…ca7d`, lifecycle `b28caeaf…69e0` | build/export, promoção e closure canônica produtivos |
| ED74 | release 3/3 e PRs #401–#414 | API+frontend+worker, PM2 real, aceite, save único, rollback e retomada; raiz externa ausente não equivale a closure |
| Durable V1 | PRs #417–#420 e homologação sintética real | raiz durável, `/proc` privilegiado e `prepare → AUTHORIZE_ONCE → execute` com receipt legítimo |

## Entregas integradas

| PRs | Commits de merge | Árvores | Resultado |
| --- | --- | --- | --- |
| #375–#377 | `5958f197`, `45352d53`, `0433b060` | `dc673795`, `68a33009`, `81f82f58` | lifecycle/observação inicial e sucessões autenticadas |
| #382–#384 | `39c4eecc`, `62baf3f1`, `88a5e8b7` | `3bd25870`, `52e3f1c9`, `7dd96ef1` | produtor, export e handoff externos |
| #401–#414 | `623cb42d`, `e8778799`, `32a1f1cc`, `18564d5a`, `23819c07`, `87f52ef1`, `4e55c9d9`, `8e22f685`, `3ac77ac1`, `98fbcfc7`, `c0c97f31`, `5be0ac61`, `cff40c94`, `c2beccb2` | `e89d2e7e`, `a77ef8e4`, `54b15e70`, `240d8ba6`, `d5745934`, `4e9cae35`, `92f08248`, `a892f575`, `a2f86c78`, `39e79f73`, `b2657788`, `51cf514f`, `30d90258`, `a93dcf5e` | perfil 3/3, PM2 real, aceite/finalize, retomada e retirement |
| #416–#420 | `bab31deb`, `8f2ae5f7`, `df80709a`, `2260cc97`, `c3e97072` | `c8d29c29`, `80f7a39f`, `1a716b7a`, `9981e9c5`, `e561fbdf` | saneamento, raiz durável, paridade P00-D e observador durável |

Os identificadores abreviados são índices de leitura; Git conserva os objetos
completos. O PR #415 permanece **open/draft**, histórico, não integrado e
superado pelo estado real. Não deve ser mergeado nem encerrado automaticamente.

## Contrato vigente

- Política da raiz: `scripts/release-assets/disposable-builder-root-policy.v1.json`,
  SHA-256 `405d613026ce4b65c665f6bd9bdc07d14abc562489460d0417a96878307f4f8c`.
- Lifecycle/consumidor: `scripts/disposable-builder-lifecycle.py`, SHA-256
  `0d5a8d4f168ad5eb6c60800e6aa53642f0b75d4df9098d6644dfdb36733be069`.
- Perfil privilegiado `DISPOSABLE_BUILDER_DURABLE_PROC_V1`: helper instalado
  `32c6d63d…c71f`, instalador `57402b87…1842`, receipt administrativo
  `37e828a9…5b1a`; sucedeu somente o predecessor FA10 `f154dcfe…4003`.
- O sudo autoriza o argv literal de `collect-disposable-builder-durable-v1`.
  Autenticação administrativa e cache `sudo` são fatos distintos; senha nunca é
  evidência. Sudoers e comandos históricos foram preservados.
- A paridade P00-D foi integrada no #419: admissão valida a projeção publicada;
  retirement conserva checks físicos, locks e observações frescas.

## Homologação sintética real

Geração `immutable-durable-proc-v1-synthetic-20261118T143839Z`:

| Autoridade/resultado | SHA-256 ou valor |
| --- | --- |
| export receipt | `0abc10ad28496b4fc17d718e7aa2ae306b8a057f0063bf080dac6bd69ae06e70` |
| autorização | `acb36668b1a9cc9ae29f3c590f61a6c7eed5816e378f54a5eabfb17f6add5d71` |
| journal terminal | `efbd0a0a9b08024e62cdcf92b03b772ed902749fde78e9b61f11fb6e7ce6020a` |
| receipt terminal | `fb4bd2b5dc833825fafe62492d881f3f5018f7748863c62311a7197b5b6a6d49` |
| lifecycle terminal | `febff099a94c3fa568ac45854730ea78a122ee8e73889c4cd0af35918ba67930` |
| efeitos | 2 comandos; 6 eventos `ATTEMPT → RESULT → VERIFIED` |
| recuperação | 49.152 bytes; 12 inodes |
| terminal | `SANITIZED/CLOSURE_RECORDED`; raiz/worktree ausentes; custódia preservada; locks livres |

A prova usou `/proc` privilegiado real, inclusive negativa enquanto um processo
referenciava a raiz, e consumidores reais. É homologação real do lifecycle
sintético, não build nem deploy produtivo.

## Classificação das provas

| Classe | Comprovado | Não inferir |
| --- | --- | --- |
| Produção | build/export, transferência/readback, instalação inerte, preflight, activate, aceite, finalize/save único e rollback | que a raiz ED74 teve closure canônica |
| Sintético real | raiz durável, observação privilegiada, negativa por processo, prepare/execute e receipt terminal | reboot real ou primeira geração produtiva sob #417–#420 |
| Integrado/testado | paridade P00-D, interrupção/retomada e os três perfis fechados | que todo replay possível foi exercitado no host real |

Pendências nominais: (1) reboot real entre `open` e retomada; (2) primeira release
produtiva usando conjuntamente #417–#420; (3) replay checks não efetivamente
invocados na homologação sintética real.

## Sequência e handoff

O único percurso é `qualification → admission → open → build → verify → export →
transfer → install → preflight → activate → acceptance → finalize → retirement →
closure`. Cada fase reabre hashes anteriores, publica evidência exclusiva e para
no primeiro predicado. Build, upload, activate, `pm2 save` e retirement não se
repetem: retomada deriva do journal. Gates administrativos, ativação,
aceite/finalize e retirada são distintos; custódia fica fora da raiz descartável.

Terminal do builder exige receipt, lifecycle `SANITIZED/CLOSURE_RECORDED`, journal
completo, raiz e registro Git ausentes, custódia preservada e locks livres.
Ausência física sem journal/receipt continua `ROOT_EXTERNALLY_ABSENT`.

## Estado definitivo

`EXTERNAL_BUILDER_STANDARD_INTEGRATED / SYNTHETIC_CLOSURE_VERIFIED`.

A infraestrutura deixa de ser frente de desenvolvimento. As três provas pendentes
acompanham a próxima atualização autorizada e não justificam novo pipeline.
