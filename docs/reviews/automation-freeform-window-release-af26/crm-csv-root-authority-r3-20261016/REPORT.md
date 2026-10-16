# R3 — separar ida normal e autorização específica de recuperação

**R3 corrigido e ensaiado localmente. INTEGRATION BLOCKED / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY. CSV SUSPENSO.**

Base `2cc9a35058c25bfdd01e597564a29e8d952d69aa`, branch `review/campaign-recovery-20260926`. Incremento local restrito, sem VPS, instalação, emissão real, geração operacional ou mudança produtiva. Os diretórios publicados anteriores são preservados byte a byte. Não há fechamento de B1–B4.

## Contraprova e causa

O transformador anterior `integration.operations` inseria no início de `Operations.start`:

```python
decision = 'ORIGINAL' if self.root.name == 'return-before-commit' else 'CANDIDATE'
authority.operation(decision, 'start')
```

Consequentemente, `switch` era tratado como recuperação CANDIDATE. `Context.revalidate('start', ...)` exigia permit, embora a ida fosse admitida por seu fluxo canônico de revisão/gates/execução/seleção. A suíte anterior cobria recuperações com permits sintéticos e PRESTOP, mas não a partida switch com a integração de autoridade. Seus33 PASS não demonstravam essa ida válida.

Duas contraprovas executam o transformador predecessor do SHA-base sobre o trecho concreto de Operations, com Context consultando o Store real em diretório sintético:

1. `test_r3_before_no_permit_denies_before_start_intent`: após o stop sintético certificado e seleção registrada, `Operations.start(API)` levanta `authority_permit_required`, antes de restore/start gate/start-intent ou efeito de partida.
2. `test_r3_before_later_real_issue_replaces_context_no_retry`: o mesmo Context é mantido; `Store.issue_owner_once` emite exclusivamente em arquivos sintéticos, com owner/root/lock simulados. A segunda tentativa levanta `authority_replaced`, pois a identidade passou de `(anchorHash, None)` para `(anchorHash, permitHash)`. Outra emissão nega `authority_issue_consumed`. Não é proposta de contornar o erro por emissão tardia ou retry produtivo.

## Delta mínimo e matriz de autorização

As únicas fontes futuras substituídas são `authority.py` e `integration.py` deste diretório. Usar as demais fontes do incremento anterior por referência; não sobrescrever sua entrega ou manifests. `SOURCE_DELTA.patch` compara essas fontes com os predecessores publicados. `consumer_delta.patch` compara as duas renderizações de Operations sobre a mesma fonte concreta completa e fixa seus hashes em `SOURCE_PROVENANCE.json`.

| Caminho | Autorização e fronteira | Resultado |
| --- | --- | --- |
| Inspeção/PRESTOP | Context autenticado; PRESTOP sem permit e sem start | Sem mudança |
| `switch` | `Context.start_mode`: diretório exato na preparação autenticada; âncora/política atuais; fase fenced; nenhum permit de recuperação; hash do contrato e perfil candidato; identidade da execução estável; nenhum encerramento/recovery já admitido | Autoridade da ida, sem fabricar permit |
| ORIGINAL (`return-before-commit`) | `operation('ORIGINAL', 'start')`, permit específico, perfil/execução, frescor e fase | Sem relaxamento |
| CANDIDATE (`return`/`return-partial`) | `operation('CANDIDATE', 'start')`, mesmas exigências específicas | Sem relaxamento |
| Fase/mode/contrato/perfil/identidade/execução divergente, recuperação/encerramento consumidos | DENY | Nenhuma partida |

A autoridade da ida deriva da instalação estática **futura** aprovada pelo owner e consultada pelo canal root já proposto; ela não depende de um hash autodeclarado, env ou argumento. Isso não afirma instalação existente ou transporte certificado. A aprovação dinâmica continua no fluxo canônico: admissão e intent no CLI, cinco gates no Sequencer/entrypoint, seleção no CSV start gate, certificado e ownership em Operations. `start_mode` não cria/admite gates, não seleciona, não emite/renova e não substitui esses consumidores.

O Context conserva sua identidade, inclusive o pin de permit ausente. Emissão posterior ou troca continua negando; não se aceita um Context antigo para uma autoridade nova. O hash da execução é fixado no primeiro uso forward daquele Context e revalidado no segundo uso/entre API e worker; sua origem continua sendo o intent do CLI canônico, não uma nova raiz de confiança. Cada filho ainda deve passar pelo transporte autenticado previsto; B2 continua bloqueio dessa prova combinada.

`Operations.start` chama `start_mode` antes dos predicados existentes e novamente depois de gravar o start-intent, imediatamente antes de `d.start`. Nenhum predicado de restore, CSV start gate, guarda38, certificado geracional, frontend, configurações, ordem, bindings ou DB foi removido. Intents continuam exclusivos; falha após intent não autoriza replay.

O leitor também reconhece escopo explícito `forward` para entradas de partida switch: valida antes do snapshot/import. Não existe conversão implícita de uma entrada recovery para forward. O manifest operacional concreto continua não composto (B4); esta extensão de enum não é uma política/classificador paralelo nem instalação.

## Validação focada e consumidores

Executar localmente, em checkout com as referências Git declaradas:

```bash
python3 -B docs/reviews/automation-freeform-window-release-af26/crm-csv-root-authority-r3-20261016/reproduce.py
```

**28 testes PASS:**18 dirigidos R3/forward e10 regressões diretamente afetadas da recuperação/prevenção. Não foram repetidas as suítes antigas33/32/42 completas. Uma execução inicial de26 passou; a rodada de27 acrescentou a prova dos cinco gates e conectou a ida válida a `Sequencer.start_pair`; a rodada final de28 incluiu o escopo forward no Loader antes do import e a negativa de escopo recovery sem permit. Essas mudanças justificaram as reexecuções afetadas.

Reprodução isolada: harness copia as fontes predecessor pelo SHA-base, preserva `integration_before_r3.py`, sobrepõe somente duas fontes novas e o teste. Fontes canônicas antigas continuam obtidas por SHA/hash e os trechos sanitizados já publicados. O subprocesso não usa Git/local-evidence. `TEST_OUTPUT.txt` e `PROOFS.json` fixam resultado e bytes.

Consumidores reais exercitados:

- `Sequencer.start_pair('switch')`, `action`/verificação dos marcadores e configuração, protocolo do Bridge da fixture e `Operations.start` renderizado; `Context` lê a resposta de `Store.query_locked` e valida seus digests.
- `csv_start_gate.authorize_start` e `csv_boundary.stage_boundary`: seleção ausente ou hash divergente nega. A admissão de pacote `csv_contract.check`/`check_current` continua stub explícito da fixture preexistente; não há alegação de pacote operacional certificado.
- `Sequencer.eligible`: cada um dos cinco gates falsos nega. Comando de checksum é simulado por leitura/hash dos arquivos sintéticos, sem executar entrypoint operacional.
- Operations: geração37 versus guarda38, DB não zero, restore inválido, consumo/start perdido e marcadores/identidades. Troca de autoridade depois do intent nega antes de `Driver.start`; troca/execução divergente entre API e worker impede a segunda partida.
- Recuperação concreta ORIGINAL/CANDIDATE, checker original, certificado, PRESTOP sem partida, expiração/troca entre API-worker, seleção incerta e consumo sem replay. Negativas Event775/binding ausente preservadas.

**Simulações/limites:** owner UID, root filesystem/lock, guard/nft, DB/processos, PM2, HTTP, cron/supervisão e driver externos são sintéticos/injetados. A seleção é preparada em fixture, não por overlay real. Não foi executado o CLI inteiro de contenção/overlay/unfence nem certificada sua composição. A ida válida provada é o segmento concreto de partida ordenada API/worker, e não uma janela completa. Os dez testes de recuperação reutilizam seus permits sintéticos explícitos anteriores; a ida válida usa permit ausente, não um permit fictício. Nenhum efeito produtivo foi executado.

## B1–B4 e preservações

Permanecem bloqueios, sem implementação adicional nesta correção:

- **B1:** `fixed_query` ainda não conectado ao diagnóstico privado canônico byte-exato.
- **B2:** cadeia completa delegated e Node→Python/consumidores ainda não certificada em conjunto.
- **B3:** releitura do ecosystem CJS pelo processo PM2 continua fora da prova de mesmos bytes.
- **B4:** instalador concreto e fechamento transitivo real dos quatro modos, root/pins/namespaces, ainda não selados.

NEWauth+NEWDB+NEWcipher, produção, ambos crons, frontend, guarda38 e out.15 não foram acessados ou alterados. Gerações/intents/recibos consumidos e evidências anteriores permanecem intactos. Não há emissão real, instalação, backup, permissões, env, schema/dados, importação/envio ou janela.

## Índices e publicação

`FULL_DELTA.patch` representa as adições deste diretório e checkpoints contra o SHA-base, excluindo o próprio patch, `MANIFEST.sha256` e `ALLOWLIST.json`. O índice externo MANIFEST fixa os arquivos finais; a allowlist fixa o alcance exato da publicação. Relatórios e manifests históricos não foram reescritos. Alterações da documentação são acréscimos de checkpoint; a declaração anterior “sem commit/push” descreve a etapa anterior à publicação em2cc9a350.

**R3 LOCAL VALIDATED no alcance descrito / INTEGRATION BLOCKED / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY. CSV suspenso.** Revisão operacional21/10 ou antes diante de mudança, owner Deifson. Nenhum dos resultados autoriza janela.
