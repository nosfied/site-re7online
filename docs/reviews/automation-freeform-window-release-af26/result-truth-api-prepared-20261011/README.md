# Result Truth — preparação API, 11/10/2026

**Estado atual: DEPLOYED TECHNICALLY (11/10,18:33 Fortaleza).** [Execução, verificação produtiva e aceite discriminado](DEPLOYMENT_2026-10-11.md). O registro de preparação abaixo é histórico e permanece íntegro.

**PREPARED FOR INSTALLATION REVIEW / NOT INSTALLED / NOT DEPLOYED.** Correção funcional revisada em `2ed9dccc490ad1bb9501f387efb09eebe574fef3`. Esta tarefa autorizou staging e leituras delimitadas, não instalação root, gates verdadeiros, interrupção ou implantação. [Comandos concretos de instalação, execução, retorno e leitura posterior](COMMANDS_FOR_REVIEW.txt).

## Composição e proveniência

API ativa/retorno integral: `/opt/re7online/releases/campaign-preventive-a26-20261011T002421Z/apps/whatsapp-agent`. Candidata inativa: `/opt/re7online/releases/campaign-result-truth-2ed9dccc-20261011T184000Z/apps/whatsapp-agent`.

Geração operacional própria: `/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-result-truth-2ed9dccc-20261011T184000Z`.

| Artefato | SHA-256 |
|---|---|
| Overlay tar exato,3.041.280bytes | `af8406ad2bab480cf45be552eaab2817bfafd6939c34a8dca217107d27bf9637` |
| Fonte `src/http/routes.ts` revisada | `479f94eb1714ff5912782e0f2d3103000ba0a7e38bf5b6eb478c768d302c08b4` |
| Compilado `dist/http/routes.js` reutilizado | `0118b7d3d4a9ca619863b4dd6c52d41717f1454049e8112c974238836163402f` |
| Fonte ativa original | `ccf8eee93dd92b2fcc2423ec683c23f0f837087a61e0982e0e20ad51ce040ee6` |
| Compilado ativo original/retorno | `d762c4457ee4b94df4d7f98f39034d71d4df5e3cb58f834b221b05306f39ae7b` |
| Helper V4 preservado | `8de358fd60c6e7c880166651b45d7ebd60c8f9b102759ff7f7628796fda1b212` |
| Sequenciador preservado | `df0ba9bd3ffee691b037c9bfa67cddbb553ffa94a3011ed2f7a36ad331a57d85` |
| Política V4 proposta, NÃO instalada | `620a119f931fff9f52c6403aa940ed31a5d1471bc2abdd6a1adee8d17e6ee62f` |
| Instalador policy-only | `0554745ee0a961326a920c172bb74ea53bcbc5aa206c78c4df5bc273ecfa60e0` |

[Overlay manifest](overlay-manifest.json), [comparação integral sanitizada](api-comparison.public.json), [hashes completos dos três modos/política/manifests/instaladores](operational-hashes.json). Manifesto superior `preparation.sha256`: `9b9061d19acbff9cf564a17a8e2e8a870c34231737ce0cdd594bad3e91d41a85`,16 entradas; comandos transferidos ao staging sem execução. Configurações, política privada, baseline, nonces, auth, logs, SQL e tar permanecem privados/off-host; somente nomes/hashes opacos são publicados. Os hashes das configurações privadas não contêm seus valores.

O ativo foi conferido integralmente contra seu manifesto atestado. A fonte ativa de routes é idêntica à revisão `3ca5efed`, e o diff até2ed altera somente os leitores Result Truth e suas fontes agrupadas/seed; nenhum handler funcional alheio foi exportado. [Patch mínimo contra a origem ativa](result-truth-on-active.patch), `git apply --unidiff-zero`. O tar contém exatamente fonte e compilado correspondentes. **Não houve rebuild**: o routes.js é o compilado Node20 já ensaiado/publicado em2ed.

Staging extraiu esses mesmos bytes e copiou o restante da release efetiva. Verificador remoto: **1.893 arquivos,2 symlinks,6.944 entradas de dependência**; única diferença runtime `dist/http/routes.js`, além da fonte correspondente. Dependências reutilizadas por symlink, com inventário/hash integral; preservar toda a cadeia de releases enquanto referenciada. API atual, arquivos privados, package/lock, Prisma gerado/schema, migrations e todos os demais compilados preservados. `.data`/auth continuam nos mesmos destinos, sem restore produtivo. [Verificador completo](verify-package.py).

Worker mínimo reativo afbb permanece exatamente o atual. O V4 exige sua parada/retomada coordenada por ownership DB e sessões, sem backport, rebuild ou delta funcional. Frontend3227, BUILD_ID `8OqIZZxaW7_ogf6h7AVoe`, launcher/controles/supervisão/dumps referenciados são preservados; nenhum procedimento de troca frontend entra nesta janela API.

## Leituras atuais e baseline

Captura inicial **18:34:17–18:34:19UTC /15:34:17–15:34:19Fortaleza**. Conferência final **19:10:42UTC /16:10:42Fortaleza**, pelo [checker de leitura](check-immediate.py). Nenhuma captura histórica foi usada como atestado atual.

- API PID4049504/ticks2146911015; worker4049657/ticks2146911319; frontend4121573/ticks2150012070; daemon18676. Identidades/configurações reais e hashes de releases/manifests correspondem aos bindings próprios. R/S não muda identidade.
- Guarda **fechada38**, `tasks:{}`, sem ledgerFault/lock/.uncertain. Arquivamento integral/razão própria da recuperação.6 e recibo durável continuam referenciados pelo contrato frozen-work. Nenhum apply/ack repetido.
- Inventário global pelos SELECTs canônicos, em transação READ ONLY com statement_timeout10s/lock_timeout2s: um job queued/attempt1/operational_suspension sem lease, lote running e duas campanhas sending vinculadas à recuperação. Há também o job/lote blocked terminal já aceito pelo classificador, com vencimento histórico; isso não é execução ativa. Zero leases ativos/vinculados na tabela de leases. Nenhum job foi expirado, apagado ou retomado. **Inventário congelado não constitui certificado de drain**.
- Seis Outbounds únicos com status delivered reportado, somente posições1–6; posições7–11 sem Outbound/submissão observada; recibo, estados sending/running/queued e CRM preservados. Fonte/outcome não reclassificados como confirmação humana.
- Auth/connected/flags iguais aos IDs observados e aos fences vigentes; health/DB, proxy Docker/exe/identidade/container/bindings, cron, crontab, bootenabled, PM2 saved/fallback e supervisão permanente frontend conferidos. Fonte frontend capturada do ambiente OS/PM2 envelope real conforme contrato já corrigido; baselines funcional/operacional e JSON/ecosystem dos três modos passaram.
- Helper V4, observador DB e leitores frontend mantiveram bytes. Leitura NOPASSWD existente comprovou barreira ausente; leitor permanente root produziu duas amostras sem alterar supervisão.

Baseline operacional nova deriva da guarda realmente fechada: `guard.open=false`, observedGuardOpenfalse, geração38. `close.cjs` é idempotente; `open.cjs` conserva fechamento e não faz POST. Não houve edição de baseline antiga para aceitar estado novo. Nenhum intent, certificado de saída, autorização root ou nonce consumido foi copiado. A referência histórica de recibo/ack frozen-work continua sendo restrição, não prova de uma janela nova.

## Capacidade e backup

[Capacidade datada](capacity-result.json): PGDATA/pg_wal/tablespaces padrão/ledger no mesmo filesystem, leitura como postgresUID70 e deployUID1000, sem contabilizar reserva root. Antes do staging2.346.192.896bytes; depois2.303.778.816bytes; final2.303.193.088bytes. Piso vigente **2.131.755.008bytes**, margem final **171.438.080bytes**. Piso inclui snapshot1GiB, expansão WAL944MiB, orçamento SQL64MiB e ledger1MiB; não é garantia de pico máximo. Inodes disponíveis na segunda amostra6.858.733.

Duas amostras18:36:46–18:58:36UTC: WAL em disco80MiB, alvo max_wal_size1024MiB flexível, archiveoff, sem slots/replicação. WAL gerado34.910.370bytes/1.310s (~26.649B/s); geração WAL não equivale a crescimento líquido do disco e intervalo não limita rajadas futuras. Nenhum erro de escrita encontrado no recorte legível PostgreSQL desde17:30UTC; logs root/kernel não foram atestados. Nenhuma limpeza, prune ou alteração de retenção executada. Capacidade observada PASS para este staging/piso, **reconfirmar capacidade/WAL imediatamente antes de executar**.

[Backup e hashes](backup-result.json): dump fresco off-host **18:42:59UTC /15:42:59Fortaleza**,35.886.045bytes, horário real do fim da captura (não confundido com a hora de montagem do manifesto). Arquivo privado de controles/runtime preserva saved/fallback, ledger, cron, configuração e `.data`/auth. Tar íntegro e extração isolada conferida. SQL restaurado exclusivamente em PostgreSQL isolado:70tabelas, migrations iguais à leitura atual, recibo/6Outbounds/job iguais, cinco posições sem submissão; banco temporário removido. [Restore PASS](restore-result.json). Nenhuma aplicação, provider, scheduler ou executor iniciou nesse banco.

Backup/modelo de fonte/config/ledger são evidências datadas. Frescor/RPO, estados operacionais e custódia off-host precisam ser reconfirmados na futura janela; atualização necessária segue procedimento canônico e arquiva manifests/proofs anteriores. Integrity/restore PASS antigo não substitui frescor. A comparação detectou as mesmas diferenças históricas já registradas entre migrations do repositório e banco; não houve schema ou migration nova.

## Privilégio e contingências

**Helper e sudoers permanecem iguais. Somente política V4 precisa mudar.** Sudoers esperado62b5a2ac…c5111a; política instalada esperada d3bd2043…b4b6f7, vinculada à tentativa anterior. Deploy leu helper root644/política root600, mas não pode ler os bytes root600 nem stat do sudoers dentro do diretório protegido. Essa negativa foi preservada. O hash instalado completo e a regra literal devem ser revalidados na sessão sudo de Deifson pelo instalador **antes** do arquivamento; não são apresentados como leitura fresca integral nesta tarefa.

[Instalador policy-only](install-api-window-policy.sh) arquiva `/usr/local/libexec/re7/incident-6683-window-policy.pre-result-truth-2ed9dccc-184000.json`, exige hash antigo exato e arquivo histórico ausente, instala root600 e confere chain/ownership/permissões/visudo/inspect com fase nula e origem viva. Não amplia sudo, não instala helper, não toca políticas frontend. Instalação parcial, archive existente ou drift interrompem, sem repetir ou sobrescrever. Owner precisa autorizar instalação/janela; a autorização desta rodada cobre somente preparação.

Abortar antes da parada: preservar recusa, controles restituídos, guarda38 fechada, produção mantida. Após stop/partida parcial: sequenciador seleciona return-partial/return conforme estado; exige saída/provas DB/fences frescas antes do sucessor, mantém partida única. Provas consumidas são arquivadas conforme renovação canônica; captura antes de unfence tem duas observações/limite e revalidação root, não ignora churn. HTTP do worker segue verificação pré-unfence compatível com nft; health/API completo ocorre após retirada, pois3001 também está bloqueada em loopback. Diagnóstico não é recuperação automática irrestrita.

Falha persistente pós-unfence: manter guarda fechada, capturar diagnóstico e executar o gerador canônico de retorno **em caminho novo** definido nos comandos, capturando identidades reais. Worker vivo ou explicitamente ausente comprovado por captura anterior, árvore/descendentes/sockets; PIDzero/porta fechada não bastam. Observador indisponível, sobrevivente, substituto, ambiguidade ou leitura incompleta negam. **Deifson deve permanecer disponível para instalar a política fresca de contingência antes de qualquer nova contenção desse retorno**. É dependência prevista, não permissão geral ou instalação automática. DB/auth atuais nunca restaurados.

A auditoria corrigiu o template inativo herdado: fonte da política pós-unfence deve ser620a desta ida, archive deve ser próprio, e inspect deve corresponder estritamente ao formato canônico de `absent-proven` quando presente. Hash final no operational-hashes. Rascunhos anteriores preservados; root helper/classificador não mudaram.6 provas do predicado extraído do instalador cobrem vivo/ausente e negativas de hash/fase/ausência. Efeitos root/PM2/nft/systemd **não foram executados ou simulados como PASS operacional novo**.

## Provas reutilizadas e adicionais necessárias

- [Correção principal+fallback e provas2ed](../campaign-list-result-truth-20261011/README.md):10 PostgreSQL/4 browser, Node20.20.0, compilação exit0. Nenhum rebuild/reempacotamento de branch completa ou repetição de suítes amplas.
- Para a composição específica sobre a API ativa,441 compilados da base local coincidem com o manifesto ativo integralmente verificado. Reutilizou-se essa árvore e substituiu-se somente routes.js; **2 testes dirigidos PASS**,8 casos da mesma suíte deliberadamente SKIP:6delivered+5pending lista/detalhe/polling e fallback6histórico+1delivery em ambas ordens e falha/bloqueio. Provider proibido; PostgreSQL sintético. Nenhuma nova atribuição às provas de runner/webhook já aceitas.
- Staging/verificador remoto, JSON/ecosystem, baseline completo, bindings de origem, fontes agrupadas/retorno/dependências/Node20, sintaxe bash/python/JS e checker imediato PASS sem alteração operacional.
- Sequenciador/helper/logger/modos já comprovados foram reutilizados; código executável do protocolo não mudou além dos caminhos/configurações próprias. Não houve novo ensaio PM2/stop/start nesta preparação; a sequência real futura depende dos gates e observações novas.
- Preservadas as recusas intermediárias: driver histórico ausente no tmpfs (zero dump/início), cast UUID indevido em ID textual do job (SELECT recusado, tx sem escrita), permissão de stat sudoers, rascunho do template pós-unfence e metadata inicial com hora de preparação em vez da captura. Ajustes de leitores/template/manifests foram locais/inativos, não mudanças de fontes/identidades para aceitar drift.

[Resultados e limites](validation.json). Fontes dos drivers estão publicadas; valores privados não. Tar e evidencia off-host ficam fora do Git. Autodeploy da branch de revisão está explicitamente false e workflows de CI/deploy não selecionam essa branch; publicação só fast-forward.

## Próximo passo e leitura posterior

Decisão do owner sobre **instalação exclusiva da política + janela API/mesmo worker e retornos previstos**, exigindo prechecks frescos. Após complete/switch, confirmar release/compiledroutes efetivo, health/DB/sessões, guarda38/job/recibo/seis resultados/cinco sem submissão, frontend3227, cron/boot/scheduler/nft, saved/fallback e supervisão.

[Leitor posterior](post-read-models.cjs) usa fontes legítimas da API via capturador canônico que remove DATABASE_URL/auth/decoder herdados, transação READ ONLY/RepeatableRead e limites. Não executado contra candidata em produção nesta tarefa. Deve conferir **out.15 lista → detalhe → nova lista/polling,6 entregas reportadas+5pendentes sem duplicação**, incluindo recibo/job. Complementar na sessão legítima owner com leitura dessas telas, sem envio/claim/edição. Manter separados comportamento medido nos leitores, observação da interface e implantação técnica.

Aceitação/webhook já aceitos, frontend3227 concluído, recuperação.6/setembro encerrados preservados. Sem abertura, retomada, reenvio, repair ou expansão internacional. CSV/Syer, internacionais, multilote natural, contingência AUTO natural e CRA-PR seguem separados.
