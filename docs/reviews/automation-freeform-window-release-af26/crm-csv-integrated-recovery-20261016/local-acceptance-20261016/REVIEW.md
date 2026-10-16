# Parecer técnico final — ACCEPT LOCAL

**ACCEPT LOCAL / LOCAL VALIDATED / NOT DEPLOYED / NOT WINDOW READY.**

Base e HEAD conferidos: `6bcf122ca5e5992769e67c1158208408b9c0b15b`; branch `review/campaign-recovery-20260926`; index Git vazio. CSV permanece suspenso. Sem alteração de implementação, VPS, testes funcionais novos, commit/push ou composição operacional nesta revisão. Este parecer conclui a revisão técnica local; não autoriza janela.

## Decisão e fundamento

**ACCEPT LOCAL. R1 e R2 resolvidos no código final conferido. Não foi identificado impedimento remanescente ao aceite técnico local no escopo revisado.** Os32 testes focados foram reaproveitados, com correspondência dos hashes de código/saída/provas; nenhuma suíte foi repetida. A suíte42 anterior é evidência histórica limitada ao seu alcance, não substitui as contraprovas novas.

| Contrato | Integração conferida | Evidência reaproveitada / limite |
| --- | --- | --- |
| R1 | `Bridge.verify_recovery_exit` chama `Operations.certificate` antes da classificação ORIGINAL e novamente na revalidação sob lock; Operations revalida no start. Direção/configHash, geração efetiva, árvores/identidades/sockets e DB são exigidos. | Geração37 versus guarda38, mesmo com inventário hash-consistente, nega antes do intent/efeitos; direção/configHash, identidade reaparecida e mudança concorrente também negam. |
| R2 | `Contract` chama `check_original(live=True)` e exige pins/cobertura completos. Checker reaproveita os predicados canônicos de leitura/metadados e loops imutáveis/quatro modos, com baseline/ecossistema/restore e índices selados. | Hashes/AST e negativos de referências, UID/modo/nlink, symlink/substituição, integridade, ausência/leitura e índice vazio/incompleto preservados. |
| PRESTOP | `source_live` exige par/frontend originais atestados; `recover` usa somente o ramo `s.recover()` de restauração de controles. Não entra no ramo de `start_pair`. | Teste PRESTOP comprova ausência de start; os efeitos de cron/root do ensaio são simulados. |
| ORIGINAL | Somente STOPPED_UNSELECTED comprovado, sem seleção/overlay/start candidato/admissão nova, com índice/mapa/perfis/política originais, saída e controles canônicos válidos. | Fluxo completo original passa sem overlay/binding candidato e com leituras/lstat do runtime externo candidato proibidas. |
| CANDIDATE | Seleção/recibo/hash e identidades comprovados; apenas return/return-partial compatíveis. Nunca oferece ORIGINAL após seleção/possível escrita. | Três caminhos candidatos ensaiados na prova32, incluindo API parcial e par conhecido. |
| DENY / consumo | Incerteza, intent sem ack, identidade/referência divergente ou consumo bloqueiam efeitos/replay. Intent é exclusivo e mantido em falha/resposta perdida. | Consumo e resposta perdida não produzem segunda partida ou falso recibo completo. |

O retorno ORIGINAL permanece independente de executáveis, overlay e mapa de bindings **exclusivos do candidato**. Mantém a exigência dos metadados selados compartilhados dos quatro modos e do perfil alvo; independência não significa dispensar esses contratos. Nenhuma restauração de segredo antigo foi introduzida: `profile_delta` preserva env/worker/frontend em relação à fonte pinada e os modos originais usam fonte=destino pós-NEWauth+NEWDB+NEWcipher. Trata-se de preservação estrutural; não houve nova leitura de credenciais produtivas.

A prevenção Event e `path_bindings` de6bcf permanecem intocados. A ida nega Event775/binding ausente antes de conter/parar; os consumidores mantêm revalidação no uso. O checker agora detecta o drift concorrente do mapa original pelo índice antes do segundo start. Nenhuma falha de leitura é convertida em PASS. Não há criação/correção automática de bindings/permissões no verificador.

Os controles finais continuam distribuídos pelos consumidores reais: configuração/população/identidades, DB e ordem API→worker, captura/ownership, saved/fallback antes da liberação, health/DB após liberação, crons deploy e sistema conferidos separadamente, supervisão, guarda38, barreira ausente e gates falsos. São predicados locais revisados e ensaiados com efeitos externos simulados; este parecer não certifica a execução produtiva deles.

## Integridade, allowlist e documentação

Conferidos41 registros do índice de entrega, hashes de todas as fontes versionadas/trecho entregue, hashes atuais das provas32 e preservação byte a byte de FINAL_REVIEW, FINAL_REVIEW_CHECKS e PROOFS_SANITIZED. O `consumer_delta.patch` foi reconstruído pelas transformações puras sobre as fontes pinadas e corresponde exatamente ao arquivo entregue. CORRECTION_DELTA foi reconstruído contra os bytes anteriores preservados; FULL_DELTA contra6bcf, incluindo os arquivos novos da allowlist e três documentos canônicos. Ambos correspondem byte a byte. `git diff --check` passou; nenhum patch foi aplicado e nenhum entrypoint operacional foi importado/executado.

Somente BACKLOG_TECH, RUNBOOK_WHATSAPP_AGENT e DOCUMENTATION_INDEX apresentam alterações rastreadas contra a base. Eles mantêm CSV suspenso, serviço original aceito, recuperação consumida, revisão local/sem instalação e certificação operacional pendente. Seus checkpoints REVIEW PENDING são anteriores a este parecer; não alegam retomada CSV nem janela pronta. Preservados nesta revisão para não alterar os bytes auditados. Este parecer suplementar registra a decisão técnica final sem reescrever as provas anteriores.

Os históricos de publicação/gerações/recibos não foram editados. Arquivos privados, `.data`, local-evidence, caches e demais trabalhos fora da allowlist permanecem fora da entrega. A cópia histórica de FULL_DELTA não é embutida no próprio delta novo; seu hash e bytes retidos foram conferidos. A relação completa, incluindo cópias históricas sanitizadas, está em CHECKS.json.

## Arquivos do incremento contra a base

Documentos rastreados:

- `docs/BACKLOG_TECH.md`
- `docs/RUNBOOK_WHATSAPP_AGENT.md`
- `docs/saas/DOCUMENTATION_INDEX.md`

Arquivos novos do incremento revisado, neste diretório pai:

- `CORRECTION_DELTA.patch`
- `CORRECTION_PROOFS.json`
- `CORRECTION_REPORT.md`
- `CORRECTION_TEST_OUTPUT.txt`
- `FINAL_REVIEW.md`
- `FINAL_REVIEW_CHECKS.json`
- `PROOFS_SANITIZED.json`
- `REPORT.md`
- `SOURCE_PROVENANCE.json`
- `STATE_MATRIX.md`
- `consumer_delta.patch`
- `future_sources.py`
- `inputs.py`
- `original_checks.py`
- `policy_proposal.py`
- `recovery.py`
- `recovery_bridge.py`
- `recovery_contract.py`
- `recovery_start.py`
- `reference_sources/operations_recovery_original.py`
- `reproduce.py`
- `test_corrections.py`
- `test_recovery.py`
- `PUBLIC_FILES_SHA256.json` e `FULL_DELTA.patch` (índice e delta consolidado).

Preservação histórica adicional: 18 arquivos em `prior-final-review/`, todos enumerados com hash em CHECKS.json. Não são componentes de runtime ou novos comandos operacionais.

Na correção R1/R2 mudaram apenas recovery_bridge, recovery_contract e future_sources; foi acrescentado original_checks. Fixture/provas/reprodução/procedência e documentação foram atualizadas. recovery.py, recovery_start, policy_proposal, inputs, STATE_MATRIX e o trecho Operations não mudaram nessa correção. Nesta revisão final não mudou nenhum desses arquivos; somente este parecer, CHECKS.json e MANIFEST.sha256 são novos, em subdiretório separado e fora do índice/patch anterior preservado.

## Hashes do conjunto aceito

- `CORRECTION_REPORT.md`: `b20bb590e60bff4276094798c4468b4b3affa6a82c3e66e201ff915ab2a608f3`
- `CORRECTION_DELTA.patch`: `6d6bec70a758b44783f1379a659c7076fc3cbf08192d74d3d9916d4513d0185e`
- `CORRECTION_PROOFS.json`: `fb25671f5abf6d1299808c1ca19eefef2043d58bd8234b009514aacf5655bfc0`
- `FULL_DELTA.patch`: `76d7a404b950c7b8ad31b702dc6a8c04e069e3aca48e744aa05d62462fa8a8df`
- `PUBLIC_FILES_SHA256.json`: `7477edd325c63ce13a8ae3d955cc626de8a8e7668df596bf5ffe97c8b73d276a`

## Riscos residuais e certificação operacional pendente

- As provas usam arquivos/perfis sintéticos, drivers e observações de processos/DB/HTTP/root simulados. Falhas de metadados são injetadas; ancestrais externos Event são modelados755. Não comprovam permissões/atores/estado da VPS, estabilidade de atendimento ou SLA.
- Restore válido foi reutilizado como autoridade injetada; não houve backup ou restore novo. Checker/admissão de ida candidata ainda têm a delimitação declarada na prova, sem certificação de pacote operacional concreto.
- Ainda é necessária composição futura separadamente autorizada: geração nova completa, pins/índice original/imutáveis/reader e dependências, código dos quatro modos, dispatchers, política e perfis/identidades coerentes sobre os bytes concretos. A proposta local não é política instalada.
- Antes de qualquer execução futura, mediante autorização expressa: provas frescas de RPO/custódia/fronteira de restore/capacidade/WAL, writers/SQL/proxy/saída/ownership, root e controles; certificação da cadeia concreta e decisão da janela. Nada disso foi iniciado agora.
- Concorrência não desaparece com a prova prévia: revalidação no uso permanece obrigatória. Resultado incerto/consumido nunca permite replay; retorno pós-unfence exige sua própria fronteira/decisão. Depois de seleção/possível escrita candidata, o backend original não é alternativa presumida.

Esses pontos impedem declarar WINDOW READY; não são impedimentos ao ACCEPT LOCAL do delta revisado. NEWauth+NEWDB+NEWcipher, reader histórico, produção, ambos crons, frontend, guarda38 e out.15 permanecem intocados. Segurança externa/risco histórico continuam acompanhados pelas decisões anteriores. Sem Prisma, limpeza, .env, credenciais externas ou novas operações neste escopo. Parar após este parecer.
