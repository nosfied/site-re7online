# CSV — recuperação integrada futura, somente local

**LOCAL VALIDATED / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY.**
**Revisão final: CORREÇÕES LOCAIS NECESSÁRIAS.** [Achados R1/R2 e contraprova dirigida](FINAL_REVIEW.md). Os42 PASS permanecem válidos no alcance declarado, mas não autorizam aceitar a integração como concluída. Código/provas antigos preservados; nenhuma correção implementada nesta revisão.

Base/HEAD `6bcf122ca5e5992769e67c1158208408b9c0b15b`, branch `review/campaign-recovery-20260926`, reconferidos antes da edição; nenhum delta rastreado inicial. Demais worktrees/arquivos privados preservados. CSV suspenso; recuperação/instalação consumidas. Sem commit/push deste incremento.

## Causa e solução

O CLI classificava STOPPED_UNSELECTED, mas anunciava PRESTOP_ONLY; a opção CANDIDATE forçava seleção/overlay. O modo original compatível existia, mas sua recuperação emergencial exigia dispatcher/política separados. Este delta conecta classificação, decisão, CLI, modo, start gate e proposta restrita de política, sem executar/copiar a geração consumida.

- `recovery.py`: inspeção coerente, decisão explícita e reclassificação sob os dois locks; intent exclusivo, sem replay/recuperação automática. Recibo somente após fechamento completo; consumo/ambiguidade não autorizam efeitos.
- `recovery_contract.py`: autoridade READ ONLY com pin explícito do contrato, perfis/relações dos quatro modos, código comum, inventário/hash do modo original, baseline e controles. Reutiliza profile_delta/stage_boundary canônicos. Não exige pais Event ou artefatos externos candidatos para inspecionar/recuperar original.
- `recovery_bridge.py`: Bridge, Operations (ausência/DB/restore), SELECT de ausência de admissão candidata e ScheduledControls. Mapa original separado/selado usa o MESMO path_bindings, conforme dispatcher comprovado; divergência do mapa original nega. Binding candidato ausente e Event775 não bloqueiam o retorno original aplicável.
- `recovery_start.py`: original exige intent ORIGINAL/STOPPED_UNSELECTED ligado à execução/contrato; nega seleção/overlay/partida candidata possível. Operations mantém saída, ordem API→worker, DB ownership, intent único e revalidação no uso. Candidato mantém checker/stage canônicos.
- `policy_proposal.py`: função pura; somente targetProcesses.return muda para os dois runtimes originais. Return-before-commit → authorize-return → root mode return. Alternativa candidata conserva alvo candidato. Sem instalador, helper/sudoers novo ou ampliação de ações.
- `future_sources.py`: versões em memória do CLI concreto/main, consumidor de bindings, start gate e Sequencer. Preserva prevenção de6bcf na ida, revalidações, dois crons e guarda38. Preserva também os quatro modos em node/eligibility e mapeia worker capture original para root return, mantendo baseline/close com guarda38 fechada. Factory exige hashes de contrato, política e bytes exportados da prova root. Binding source é função pura; nenhum pacote/captura emitido.

[Estado → decisão → modo → política](STATE_MATRIX.md).

## Sequência e fronteiras

Inspeção READ ONLY → decisão explícita → locks/classificação fresca/gates já admitidos → prova e política correspondentes → intent → recover-partial original ou stop/recover candidato → saída comprovada → API→worker → finish/fechamento → gates falsos → recibo.

Original não aplica overlay nem cria seleção CSV. Após seleção/possível escrita, só candidato; estado incerto não permite retorno original ou replay. Depois de unfence, retorno exige preparação/política fresca e decisão fora deste fluxo.

Finish preserva worker/identidades/captura, saved/fallback antes da liberação, autorização root, health/DB/validate após unfence, restauração/verificação separada de cron sistema e deploy. Fechamento confere supervisão, conteúdo/modo600 de saved/fallback, frontend, guarda38 e barreira ausente. Não alega HTTP200 sob bloqueio de3001.

O export root é privado600 e legível por deploy, fixado por hash revisado; política/perfil/fase/frescor conferidos. Não se exige leitura direta de arquivo root600 por deploy. Captura/instalação legítima e publicação desse pin são dependências de futura composição revisada, não fatos executados aqui. O helper existente mantém suas verificações nos efeitos. O schema switch/return permanece; o dispatcher original limita ações. Nenhuma mudança produtiva de política.

## Provas reproduzíveis

```bash
python3 -B docs/reviews/automation-freeform-window-release-af26/crm-csv-integrated-recovery-20261016/reproduce.py
```

**42 testes PASS em diretório isolado**, somente arquivos entregues/fontes Git pinadas em6bcf e hashes conferidos. Filho sem .git/local-evidence; audit hook nega acesso a evidência privada. Inclui factory real com três pins. Suíte anterior19/28 reaproveitada, não repetida. Reexecutadas somente provas novas/afetadas durante desenvolvimento deste delta.

Consumidores concretos conectados: CLI futuro completo, Recovery/Contract/Bridge, Sequencer canônico com delta declarado, classe Operations intacta e Controls.unfence intacto, bindings, stage/profile_delta, ScheduledControls e parser root. Testes de ordem não certificam equivalência geral nem pacote operacional.

Cobertura: PRESTOP, parado sem seleção, seleção incerta/divergente/confirmada, API parcial/par candidato, start incerto, consumo, Event775/binding ausente negando ida antes dos efeitos, recuperação original independente deles, mapa original alterado antes do segundo start, admissão nova, DB/restore/identidades/code-hash divergentes, política/recibo root incorretos/expirados, falha/resposta perdida em start/abort/unfence e falhas de cron/saved/supervisão. Sem replay/falso complete.

### Real versus simulado

- Operations.stop/start e Controls.unfence executam corpos reais sobre arquivos sintéticos e driver OS. ScheduledControls é real; comandos interceptados e saved/fallback sintéticos600. Nenhum PM2/nft/systemd/SQL/HTTP produtivo executado.
- Pre_unfence usa o predicado concreto; apenas HTTP e captura /proc/sockets são injetados. Identidades/árvores/sockets/DB/root são observações simuladas. Deleção nft do consumidor delegado é modelada como preparação de permissão; liberação root continua separada.
- validate.cjs/saúde API/DB e restore previamente certificado são autoridades injetadas para aceitar/negar. Restore não reconstruído. Checker completo/admissão não afetados são injetados no CLI, sem alegação de certificação do pacote.
- Parser root real sobre política sintética completa; root_regular substituído somente para cadeia/proprietário local. Não comprova permissões root reais. Event775 interno é real; somente ancestrais externos às fixtures são modelados755. Nenhum chmod/chown.
- Trecho mínimo de código consumidor ausente no Git (Operations e Controls.unfence, sem System OS/CLI/configurações/recibos) entregue com origem/hash/ranges em SOURCE_PROVENANCE.json. Revisão textual: sem segredo/dado produtivo. Não foi copiada ou executada a geração consumida. Demais entradas versionadas no SHA exato.
- Fixtures representam os consumidores e dependências originais sob teste; não são um pacote operacional completo ou prova produtiva. Não há certificação de HTTP contínuo, SLA, tenant/provider ou autoridade root real.

## Pendências e cronologia

Integração de estados/CLI/modo/proposta de política validada LOCALMENTE neste alcance. Faltam futura composição concreta completa, manifests/checkers/bindings atuais e certificação READ ONLY dos bytes finais; nenhum pacote/instalador ou prontidão de janela foi produzido. Provas root/SQL/restore/controles atuais somente na sequência separadamente autorizada. Defeito persistente candidato exige versão compatível nova. Resultado/recibo perdido não implica rollback/sucesso; sem reuso de intents/políticas consumidos.

A descrição “sem commit/push” da preparação pré-parada era anterior à publicação. Depois houve publicação em `6bcf122ca5e5992769e67c1158208408b9c0b15b`, parent `bd82db403e1f4db46525e24d0aef479941af0d74`. Estado corrente corrigido em backlog/runbook/índice; relatório/provas/índice históricos preservados byte a byte. Os31 PASS antigos continuam insuficientes para equivalência; a prova posterior19/28 é a válida. Este NOVO incremento não foi commitado/pushado.

NEWauth+NEWDB+NEWcipher, reader histórico, dois crons, frontend/console, guarda38 e out.15 CLOSED intocados. Segurança externa OPEN/adiamento do owner preservados. Sem VPS/SSH, deploy, instalação, contenção/restart real, backup, importação/envio, permissões produtivas, .env, credenciais, schema, retenção ou limpeza. Parar para revisão.

`consumer_delta.patch`: integrações em memória. `FULL_DELTA.patch`: delta completo contra6bcf, sem incluir a si próprio. Índice de hashes exclui ele próprio/FULL_DELTA para evitar ciclos. Patches podem conter marcadores de contexto vazio; não são comandos de aplicação em geração selada.
