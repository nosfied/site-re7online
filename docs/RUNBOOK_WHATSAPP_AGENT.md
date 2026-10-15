# RUNBOOK OPERACIONAL — WhatsApp Agent

**Estado corrente — integração dos controles/Prisma,15/10:** [LOCAL VALIDATED / NOT DEPLOYED; relatório consolidado](reviews/automation-freeform-window-release-af26/security-containment-20261012/controls-prisma-integration-20261015/REPORT.md). Composição completa com admissão, recuperação pré-parada e encerramento nos quatro modos;34 provas locais PASS, efeitos de sistema substituídos e fatos externos reutilizados explicitamente. Crons deploy/sistema verificados separadamente; namespace/política/instalador futuros e provas frescas ainda necessários para qualquer janela, nenhuma autorização transferida da v13. Recuperação121000 permanece CONSUMED/RESTORED, seis entradas e owner UI aceitos; não repetir. Auditoria SELECT READ ONLY: dez tenants com políticas persistidas (nove90d/um365d), uma semente elegível sem closedAt. Retention:run global; dry-run chama upsert e não é leitor puro. Duas propostas.env privadas NÃO APLICADAS; NEWDB no.env reabilitaria retenção/ferramentas, bloqueada até revisão do predicado/alcance por identidade e efeitos por consumidor. NEWauth+NEWDB, política15b/gatesfalse, produção, console, out.15 CLOSED e guarda38 preservados. Cifragem suspensa/segurança externa e cifragem OPEN; nenhuma instalação/cron/retencão/restart novo. Deifson; última revisão15/10/próxima21/10, antecipar após mudanças.

**Resultado consumido — recuperação dos controles,15/10:** [CONSUMED / RESTORED; recuperação restrita concluída](reviews/automation-freeform-window-release-af26/security-containment-20261012/scheduled-controls-20261015/RESULT_2026-10-15.md). Aplicação única como deploy/sem sudo às09:18:22Fortaleza: recibo RESTRICTED_DEPLOY_CRON_RESTORED/seis entradas, inspeção RESTORED09:18:24, dois crons before conferidos;23 linhas restantes idênticas. Invocação SSH/prechecks/aplicação/C10,647s, sem stop/start ou contenção de admissão. Custódia18 arquivos+índice/hashes600/700, owner confirmou sessão/console/telas/out.15. Não repetir aplicação121000 nem A/B v13. Zero vencimentos perdidos nesse intervalo; próxima execução natural16/10 00hFortaleza, sem compensação manual. Prisma/.env obsoleto permanece separado/falha preexistente; nada atualizado. Correção preventiva74 provas continua local/não instalada. Política15b/gatesfalse/NEWauth+NEWDB/API/worker/frontend/out.15 CLOSED/guarda38 preservados; cifragem suspensa e segurança externa/cifragem OPEN. Deifson; revisão15/10/próxima21/10 antecipada após mudanças.

**Checkpoint histórico — preparação v13,15/10:** [v13: contrato de restore único, preparação concreta validada para revisão / NOT INSTALLED / NOT WINDOW READY](reviews/automation-freeform-window-release-af26/security-containment-20261012/restore-contract-20261015/REPORT.md). Checker/Node/preflight/Operations.stop/start/quatro modos/recuperação/controles delegados compartilham a prova íntegra, schema/fronteira/tooling/estado do laboratório; restore certificado retido/parado preservado, temporaryDatabaseRemoved=false.170 provas dirigidas sobre arquivos completos PASS; cadeia real VPS15/10 06:51:42Fortaleza PASS com três referências imutáveis,147 históricos, perfis/NEWauth+NEWDB, dumps600, SQL/proxy/health. Mínimo18.376.777.728B/WAL80MiB datados. Corrigidos CLI delegado3→4, encerramento por modo e diagnósticos UUID; v11/v12 intermediárias preservadas, v9/v10 consumidas intocadas. Política nova15b91a/instalador722ae8 apenas propostos; fonte root b6 permanece instalada/consumida, inspect=phase_already_exists preservado, check-absent PASS. Gatesfalse/execfalse; nenhuma instalação/contenção/stop/start/conversão. RPO real05:43:48 já excede1h: renovar/republicar provas coerentes pelo contrato antes de eventual janela; conferir hashes root frescos/owner sudo, writers/saída/ownership/CAS só em decisão própria. Próxima ação: revisão do pacote/comandos/matriz; autorização v10 não se transfere. Auth/banco/console e out.15 CLOSED concluídos; guarda38 fechada, frontend/worker/produção preservados. Contenção anterior de admissão3,497s é limite conservador, não parada nem medição contínua HTTP. Segurança externa/cifragem OPEN/risco histórico acompanhado; propostas.env/externas separadas, três remanescentes de retenção só backlog. Deifson; última revisão15/10/próxima21/10, antecipada após mudanças; sem cron/adapters instalados.

**Checkpoint histórico — tentativa v10,15/10:** [v10 B CONSUMED / FAILED PRESTOP / RESTORED / CIPHER NOT DEPLOYED](reviews/automation-freeform-window-release-af26/security-containment-20261012/cipher-package-contract-20261015/WINDOW_RESULT_2026-10-15.md). Política b6a584 instalada; fonte9c7 arquivada; helper/sudoers iguais. B único8,721s; `ops.stop` negou `restore_not_verified` porque exige temporaryDatabaseRemovedtrue e o checker aceita restore retido certificado. Falha de auditoria nossa; v10 preservada, sem conserto de boolean/bindings, sem repetir A/B. C=NO_FINAL_PLAN, selagem/intent/recibo de commit ausentes; nenhum processo parado/start/cifra convertida. Contenção de admissão limitada a3,497s pelo journal; restaurada canonicamente antes da parada. Gatesfalse/barreira ausente, identidades/NEWauth+NEWDB/health/worker/admin/frontend/saved600/supervisão/SQL e owner UI PASS. Out.15 CLOSED/guarda38 preservados. Backup fresco05:43:48 Fortaleza off-host, fronteira/tooling iguais, provas históricas arquivadas. Próxima ação de engenharia: contrato de restore compartilhado com stop/start/retornos, prova real de precondições, nova geração/revisão com fonte root b6 instalada; corrigir diagnóstico fixo auxiliar sem sobrescrever histórico. Sem nova janela implícita. Segurança externa/cifragem OPEN, chaves de cifra ainda não substituídas e risco histórico acompanhado; propostas.env/externas separadas. Deifson; revisão15/10/próxima21/10 antecipada após mudanças.

**CHECKPOINT HISTÓRICO — preparação locked-v7, 14/10:** [V4 integrado e geração NOVA completa para revisão](reviews/automation-freeform-window-release-af26/security-containment-20261012/cipher-locked-v4-20261014/REPORT.md). Geração locked-v7/011500 na VPS inativa, quatro modos+política6e0649/installer d887, cinco gatesfalse, nenhuma instalação/stop/start/SQL mutável. Saída/DBzero obrigatórios antes de fonte/plano/hash/intent novos sob lock/CAS integral; OLDcipher negado após VERIFIED também em ops.start. Grant95eda/147/opaca/v2 preservados; leitura atual/identidades/root/proxy/capacidade18.432.376.832B PASS datado, RPO/ownership/saída frescos ainda necessários antes da janela. Restore d859/provas válidas reutilizados;214100 DENY intocada. Propostas.env separadas: NEWDB pode reabilitar retention:run mutável, não aplicar agora. NEWauth+NEWDB/auth/banco/console/out15CLOSED/guarda38 preservados; segurança externa/cifragem OPEN. Próxima ação: revisão do pacote/comandos e decisão própria da janela. Deifson; revisão14/10/próxima21/10 antecipada após mudanças.

[Reconciliação.env para revisão](reviews/automation-freeform-window-release-af26/security-containment-20261012/cipher-snapshot-operational-20261014/ENV_REFERENCE_RECONCILIATION_FOR_REVIEW.md): fonte operacional é perfil selado concluído+recibo+kernel, não arquivo legado. Owner recebe credencial atual em custódia privada a cada rotação/aceite. Dois.env legados VPS conservam OLDauth/OLDDB; processos/saved/fallback600 continuamNEW. Originals preservados; atualizar somente campos conhecidos após decisão de efeitos em scripts/cron, nunca tudo, desconhecidos locais ou propostas ainda não ativadas. Atualização.env pode reabilitar ferramentas SQL: sem autorização indireta para jobs mutáveis/providers. Não restaurar backup.env com segredo revogado nem boot/recriar Docker pelo POSTGRES_PASSWORD original.

**Recuperação do console interno após auth:** [contrato e prova atual](reviews/automation-freeform-window-release-af26/security-containment-20261012/admin-console-access-20261014/REPORT.md). ADMIN_TOKEN ativo confere com NEWauth; GET administrativo local/proxy200/DBtrue. Owner confirmou origem converta e “Sair do console”. Reconexão com token vigente confirmada pelo owner: console RECOVERED/aceite específico concluído; não confundir com login JWT do tenant já aceito. Nenhuma nova rotação/restart/RBAC necessária. Snapshot87d2f431 LOCAL VALIDATED/NOT DEPLOYED preservado; segurança externa/cifragem OPEN.

Procedimento de401 administrativo: confirmar origem/rota e token vigente por comparação privada com configuração+kernel legítimos; GET `/admin/health` autorizado, sem imprimir valores/headers/configs. Owner usa **Sair do console**, que remove somente as três entradas wa_admin_* documentadas, preservando JWT/cookies/dados do tenant. Reconectar em Base URL `/agent-api` com ADMIN_TOKEN vigente da custódia privada; Testar→Entrar→reload. Não colar JWT/senha do tenant, limpar dados gerais, sair do suporte, restaurar segredo exposto ou reduzir RBAC. Se401 persistir, inspeção privada da rota/credencial; não repetir auth. Registrar esse aceite separadamente. Um `.env` local/histórico não prova a credencial vigente: identificar a fonte e conferir configuração selada+processo ativo, sem imprimir/editar valores para coincidir.

**CHECKPOINT HISTÓRICO de segurança — 14/10/2026:** [snapshot inventário/dump LOCAL VALIDATED / NOT DEPLOYED](reviews/automation-freeform-window-release-af26/security-containment-20261012/snapshot-local-20261014/REPORT.md). Dez conversões/linha opaca/147/v2/CAS local PASS; transporte final5 provas dirigidas; quatro modos/configurações e propostas offline selados, gates false. Sem VPS nesta tarefa. Próxima ação: revisão do delta e autorização expressa de captura produtiva coerente + montagem/baseline/permissões/lock/RPO/capacidade atuais; sem instalação/janela implícita. Geração180000 permanece DENY. NEWauth+NEWDB concluídos, out15CLOSED/guarda38 preservados; segurança externa/cifragem OPEN, OpenAI separada. Responsável Deifson; revisão14/10/próxima21/10 antecipada após mudanças. Históricos abaixo preservados.

**Contrato de backup para inventários mutáveis:** adquirir o `BACKUP_ROOT/backup.lock` canônico antes da conexão; holder `REPEATABLE READ READ ONLY`, inventário na mesma transação e `pg_dump --snapshot` com a mesma identidade DB. Manter holder/lock até ambos terminarem; erro/timeout/morte negam, preservar outputs, terminar somente filho próprio, rollback/close/unlock. Saída privada deve negar tipo/symlink/proprietário/modo inadequados antes da captura. Snapshot não elimina CAS fresco antes/depois da contenção. Não trocar fontes/hashes para PASS. [Código, provas e limites](reviews/automation-freeform-window-release-af26/security-containment-20261012/snapshot-local-20261014/COMMANDS_FOR_REVIEW.txt). Esta integração está validada localmente, não instalada no procedimento da VPS.

**CHECKPOINT HISTÓRICO — DESENHO95EDA/TG APROVADO PARA PREPARAÇÃO; GERAÇÃO OPERACIONAL NOVA DENY POR NOVO DRIFT WEB.** [Capturas, backup/restore, negativa e próximo passo](reviews/automation-freeform-window-release-af26/security-containment-20261012/cipher-operational-20261014/REPORT.md). Inventário atual11 cifras/147 históricos; duas linhas Web mudaram ciphertext/updatedAt entre captura18:03UTC e dump18:07UTC:9 originais compatíveis/11, Telegram intacto. Não adaptar input67e57724 nem repetir captura/backup para PASS. Dump40.261.687B off-host, restore70tabelas/66migrations e147/v2 PASS; dez conversões/recibo/retornos NÃO certificados, nenhum apply. Políticas/instaladores e quatro modos completos não emitidos; geração180000 registrada DENY/gatesfalse. Helper8de/regra62b5/política9c físicos conferidos; inspect consumido phase_already_exists preservado, SQL/proxy lidos separadamente. Próxima integração local: inventário+dump no mesmo snapshot READ ONLY e lock canônico, ensaio; nova geração precisa CAS atual e bloquear nova mudança. Auth/banco concluídos, NEWauth+NEWDB/out15CLOSED/guarda38/produção preservados; segurança OPEN. OpenAI substituta conhecida independente, sem criação/revogação; retenção encerrada nesta rodada/três no backlog. Segurança não bloqueia auditoria/implementação local funcional. Responsável Deifson, revisão14/10/próxima21/10 antecipada após mudanças.

**CHECKPOINT HISTÓRICO — AUTH/BANCO CONCLUÍDOS; SEGURANÇA EXTERNA/CIFRAGEM OPEN; V4 LOCAL INTEGRADO PARA REVISÃO, SEM PRODUÇÃO.** [Contratos revisados, pacote e comandos](reviews/automation-freeform-window-release-af26/security-containment-20261012/remaining-v3-20261014/REVIEW.md). OpenAI: GETmodels/suporte opcionais, substituta conhecida no projeto correto preparada como alternativa; emissão/revogação não executadas e antigo vínculo desconhecido. Writers/leitores v2 independem do grant v1; proposta população147 selada até disposição explícita, sem renovação periódica; não instalar prazo22/10. Telegram opaco preservado/inventariado sem recuperação. Composição446 arquivos, dois módulos revisados/444 reutilizados; SQL/verify e quatro modos/fronteiras V4 selados, nove ensaios canônicos com Bridge simulado e verificador real em PG16 sintético PASS, gatesfalse. Janela produtiva depende de revisão grant/disposição, baseline/root/capacidade/WAL/RPO/restore e política NOVA frescos; geração140000 consumida não será executada. NEWauth+NEWDB/out15CLOSED/guarda38fechada/worker/frontend preservados. Limpeza encerrada nesta rodada: terceiro loteCONSUMED/PARTIAL20/3, três apenas backlog. Segurança não bloqueia auditoria/implementação local funcional do produto. Responsável Deifson; última revisão14/10/próxima21/10, antecipar após mudanças; sem cron/adapter instalado.

**CHECKPOINT HISTÓRICO — AUTH/BANCO CONCLUÍDOS; EXTERNA/CIFRAGEM OPEN; PREPARAÇÃO LOCAL PARA REVISÃO, NÃO JANELA PRONTA.** [Composição completa, disposição Telegram, expiração, orçamento e próxima ação OpenAI](reviews/automation-freeform-window-release-af26/security-containment-20261012/remaining-v2-20261014/REVIEW.md). Tar446 arquivos/439 preservados,147 campos históricos comprovados; dez cifras legíveis planejadas e uma Telegram opaca preservada com seal exato. PostgreSQL isolado CAS/rollback/replay/concorrência e recibos por tenant PASS. Sem consulta OpenAI real: configurada=custódia, registro Active do projeto ainda sem vínculo comprovado; proposta GETmodels único +correlação pelo emissor, sem revogação por hipótese. Retorno v3 compatível em cwd distinto, NEWauth+NEWDB; política/grant/hooks V4 e backup/restore da fronteira nova continuam dependências explícitas. Capacidade local datada18.471.538.688B, orçamento8.776.581.120B, não certificado de janela. Custódia permanente48 arquivos700/600. Terceiro loteCONSUMED/PARTIAL20/3, sem certificado completo/sem repetir B; out15CLOSED/guarda38fechada preservados. Responsável Deifson, última revisão14/10/próxima21/10 antecipada após mudanças; nenhum cron/adapter instalado.

**CHECKPOINT HISTÓRICO — AUTH/BANCO CONCLUÍDOS; SEGURANÇA EXTERNA/CIFRAGEM OPEN; RETENÇÃO CONSUMED/PARTIAL.** [Preparação local e próxima ação do owner](reviews/automation-freeform-window-release-af26/security-containment-20261012/remaining-local-20261014/REVIEW.md): primeira credencial OpenAI, projeto Default/duas chaves/uma revogada informados pelo owner, vínculo/permissões ainda por conferir privadamente. Decoder composto por sete módulos sobre base atestada;147 campos/126 eventos imutáveis,252 negativas e contrato compilado PASS, sem instalação/rotação. Telegram futuro: disposição específica preservar linha opaca proposta, planner integral ainda DENY. Terceiro lote20 retirados/3 preservados, sem certificado completo; B consumido, nenhuma repetição/retirada manual; nova preparação exclusiva3 somente backlog. NEWauth+NEWDB/out.15CLOSED/guarda38 fechada preservados. Capacidade18.659.729.408B datada14/10 11:22UTC, não certificado de janela futura. Responsável Deifson, revisão14/10/próxima21/10 antecipada após mudanças; sem cron/adapters instalados.

**CHECKPOINT HISTÓRICO — resultado anterior preservado:** ** TERCEIRO LOTE CONSUMIDO/PARTIAL DENY; SEGURANÇA EXTERNA/CIFRAGEM OPEN.** [Resultado e diagnóstico](reviews/automation-freeform-window-release-af26/security-containment-20261012/retention-audit-20261013/THIRD_WITHDRAWAL_RESULT_2026-10-14.md). Uma chamada B retirou20/23,8.130.785.280B alocados;3 restantes685.793.280B mantidos. Recusa em stat_before/PID529658/errno2 antes de start ticks,origem específica desconhecida. C PASS owners0/incomplete0; sem WITHDRAWAL_COMPLETE/certificado23; intent/journal/parcial consumidos, não repetir. Mínimo deploy/PG11:22UTC14/10:18.659.729.408B,WAL80MiB,healthDB/HBA/processos/NEWauth+NEWDB/dumps600/cron-boot/supervisão/gatesfalse preservados;owner confirmou sessão/telas. Out15CLOSED/seis entregas/cinco não enviadas/guarda38 fechada.11 principais/109links/controles/manifests intactos,custódia privada permanente. Retenção:3 restantes exigem preparação/decisão novas; nenhuma exclusão adicional. [Segurança retomada](reviews/automation-freeform-window-release-af26/security-containment-20261012/SECURITY_REMAINING_PREPARATION_2026-10-14.md): base privada pós-banco/formulário5 slots,sem reset/rotação/rebuild. Responsável Deifson; revisão21/10 antecipada após mudanças; adapters não instalados,cron inativo.

**CHECKPOINT DOCUMENTAL HISTÓRICO — integração preventiva14/10/2026:** adapters FUTUROS API/frontend e encerramento auth/banco conectados ao coordenador, [código/provas/comandos](reviews/automation-freeform-window-release-af26/security-containment-20261012/retention-audit-20261013/PREPARER_INTEGRATION_2026-10-14.md), **38 testes locais PASS**. Conexão de código concluída localmente para revisão; NÃO instalada na VPS, sem cron ou nova janela. Responsável Deifson; revisão21/10 antecipada após mudanças conforme o runbook. Terceiro lote preparado, sem exclusão autorizada. NEWauth+NEWDB, out.15 CLOSED, guarda38 fechada; **segurança externa/cifragem OPEN**, decisão de contenção separada continua na sequência ativa.

**CHECKPOINT DOCUMENTAL HISTÓRICO — revisão de retenção14/10/2026:** responsável operacional **Deifson Oliveira (owner/operador de janela)**; apoio de manutenção dos preparadores: Codex nesta revisão. Última revisão **14/10/2026** (local/documental; não nova amostra produtiva); próxima revisão semanal **21/10/2026**, antecipada após janela/recusa/substituição/encerramento. Versão futura local dos cinco gates e validação de destino privado em [scripts](../scripts/README.md#operational_preparation_reviewpy), para revisão; ligação aos preparadores produtivos NÃO concluída, nenhum cron ativo. Terceiro lote preparado, sem retirada autorizada. NEWauth+NEWDB, out.15 CLOSED, guarda38 fechada; **segurança externa/cifragem OPEN**, próxima decisão de contenção permanece separada e acompanhada no relatório de segurança.

**Integração permanente de retenção14/10:** [princípios](saas/CHANGE_POLICY.md#princípios-permanentes-de-retenção-operacional), [procedimento](RUNBOOK_WHATSAPP_AGENT.md#retenção-operacional-permanente) e [checklist](saas/RELEASE_CHECKLIST.md#retenção-de-releases-e-preparações) publicados; rotina somente local para revisão, sem cron/limpeza ativados. Auditoria de preparadores e critérios no [backlog](BACKLOG_TECH.md#retenção-operacional--integração-preventiva-dos-preparadores). Estado operacional e próxima decisão do terceiro lote abaixo preservados.

**CHECKPOINT HISTÓRICO — TERCEIRO LOTE PREPARADO/PASS PARA REVISÃO; ZERO RETIRADAS NOVAS.** [23 arquivos duplicados, grafo/custódia/input/comandos](reviews/automation-freeform-window-release-af26/security-containment-20261012/retention-audit-20261013/THIRD_WITHDRAWAL_PREPARATION_2026-10-14.md). Potencial8.816.578.560B alocados;11 nomes mantidos, hardlinksfa60 zero recuperação; diretórios/manifests/journals/recibos/logs/snapshots fora da allowlist. Driver e1380546/input77503f96 próprios, selo e dry-run09:23UTC/06:23Fortaleza14/10 PASS,owners0/incomplete0,removedCount0; sem intent. Custódia off-host10 conteúdos/34 metadados+extração verificados; diagnósticos/timeouts anteriores preservados, grafo12s fora da VPS. Capacidade09:29UTC mínimo deploy/PostgreSQL10.531.876.864B,WAL80MiB,healthDBok. NEWauth+NEWDB/API410272/worker410428/frontend188897/dumps600/boot/cron/política9c7b44 preservados,gatesfalse,guarda38closed,out15CLOSED/seis entregas/cinco não enviadas. Próxima decisão: autorização exclusiva dos23 literais pelo novo A0/A1/B/C,nenhum apply agora. Segundo lote/banco/auth consumidos,não repetir. Segurança externa/cifragem OPEN; retenção automática apenas proposta.

**CHECKPOINT HISTÓRICO — AUTH/BANCO CONCLUÍDOS; SEGUNDO LOTE CONSUMIDO E VERIFICADO; SEGURANÇA EXTERNA/CIFRAGEM OPEN.** [Resultado, negativas e auditoria restante](reviews/automation-freeform-window-release-af26/security-containment-20261012/retention-audit-20261013/SECOND_WITHDRAWAL_RESULT_2026-10-13.md). Nove raízes/140.758 membros retirados uma vez,4.456.800.256B alocados; inspeção complementar mesmos bytes confirmou owners0/incomplete0 e zero restantes, preservando DENY original por reutilização de inode. CAPACITY PASS datado: mínimo deploy/PostgreSQL10.905.092.096B às00:38UTC14/10 (21:38Fortaleza13/10), WAL112MiB. NEWauth+NEWDB/identidades/saved-fallback600/boot-cron-supervisão preservados, gatesfalse, guarda38closed/out15CLOSED, seis entregas/cinco não enviadas; owner confirmou telas. Não repetir B/auth/banco. Auditoria restante root COMPLETE,17.062 entradas,dez grupos idênticos; preparações/logs/snapshots SEM nova allowlist. Próximo passo: fechar referências/custódia e propor lote literal de duplicados, sem exclusão automática. Revisão observacional pendente: identidade de geração de inode e referência explícita ao fallback .bak; nenhum patch produtivo nesta etapa.

**CHECKPOINT HISTÓRICO — AUTH3/BANCO CONCLUÍDOS; SEGUNDO LOTE PREPARADO PARA REVISÃO, SEM RETIRADA.** [Resultado concreto e limites](reviews/automation-freeform-window-release-af26/security-containment-20261012/retention-audit-20261013/SECOND_WITHDRAWAL_PREPARATION_2026-10-13.md). Nove raízes já auditadas, driver final10f25ecc/inputc41170f6 próprios pós-banco (dry-run produtivo856cc, delta final4 testes locais),140.758 membros preservados, dry-run/read posterior PASS, owners0/incomplete0, zero remoções. Mínimo deploy/PostgreSQL6.516.224.000B datado; potencial4.456.800.256B. Custódia/hash/extração reutilizados e reconferidos. Geração211000 recusada/contexto PM2 root preservada; v2 usa captura deploy e kernel. Próxima ação: decisão exclusiva sobre [A0/A1/B/C](reviews/automation-freeform-window-release-af26/security-containment-20261012/retention-audit-20261013/SECOND_WITHDRAWAL_COMMANDS_FOR_REVIEW.txt), novas verificações antes do intent; nenhuma exclusão autorizada. Preparações/logs/snapshot root fora do lote. NEWauth+NEWDB, API410272/worker410428/frontend188897, retornos/140000 consumida, dumps600, guarda38 fechada/out15CLOSED protegidos. Cronologia corrigida: autorização de iniciar sem esperar17h15; contenção efetiva17h47:09, interrupção37,198s. Segurança externa/cifragem OPEN; Telegram futuro/liberação da guarda separados. Não repetir banco/auth/primeiro lote nem executar retorno ou envio.

**CHECKPOINT HISTÓRICO — AUTH3 E BANCO CONCLUÍDOS/VERIFIED; SECURITY OPEN EXTERNA/CIFRAGEM.** [Resultado e limites](reviews/automation-freeform-window-release-af26/security-containment-20261012/DATABASE_EXECUTION_2026-10-13.md). Geração140000 consumida uma vez, complete/switch13/10,17:47:50Fortaleza; interrupção conservadora37,198s. NEWDB TCP aceito/OLDDB rejeitado, NEWauth preservada; API410272/worker410428, frontend188897 e daemon intactos; HBA/atributos/healthDB/sessões/telas confirmados. Saved/fallback600, barreira ausente, cinco gatesfalse/execfalse; guarda38closed/out15CLOSED/seis resultados/cinco não enviados preservados. Não repetir instalação/ALTER/start/retirada consumida. Próxima preparação autorizada: driver/input novos do segundo lote com identidades/política/NEWDB efetivos; nenhuma exclusão autorizada. Segurança externa/cifragem e liberação da guarda permanecem decisões separadas.

**CHECKPOINT HISTÓRICO — banco AUTORIZADO; conferências iniciais PASS; janela13/10 antecipada pelo owner para agora; A aguardando resultado na sessão sudo; NÃO INSTALADO/NÃO EXECUTADO.** [Janela e limites](reviews/automation-freeform-window-release-af26/security-containment-20261012/DATABASE_WINDOW_2026-10-13.md). Geração140000/política9c7b44/instalador17a92e preservados; quatro modos/consumidores/SQL/proxy/verificador/HBA/dumps600 conferidos, gatesfalse/zerointents. Mínimo11:34Fortaleza6.670.139.392B, WAL176MiB estável. Custódia íntegra; renovar backup/RPO e reconfirmar requisitos imediatamente antes da janela. Próxima ação: resultado efetivo de A único/inspect na sessão sudo já disponível, então reconferências e B único; incerteza permite somente C inspect antes de decisão explícita de recuperação. AuthNEW concluída, retirada consumida, out15CLOSED/guarda38closed e produção preservadas; segurança externa/cifragem OPEN. Nenhum start/ALTER/instalação agora. **Auditoria secundária:** [segundo lote](reviews/automation-freeform-window-release-af26/security-containment-20261012/retention-audit-20261013/SECOND_LOT_2026-10-13.md): nove raízes4.456.800.256B alocados, custódia/extração/hash integral e duas amostras root posteriores owners0/incomplete0; nenhuma retirada. Preparações/logs/snapshot root e driver de retirada selado pendentes; banco17h15 prioritário, bindings140000 preservados. Reconferir estado/capacidade/RPO após qualquer futura decisão de retirada. **Decisão pós-revisão b2ac1bfd:** nenhuma exclusão autorizada; driver/input novos somente após o resultado real da fase banco, vinculados às identidades/política/NEWDB efetivos, sem seguir os sete links externos .data. Até17h15 apenas preparação sem disputa de recursos/locks; categorias secundárias separadas. Provas backup renovadas/custódia íntegra, outer44e09f3c…, política9c7b44/instalador17a92e intactos. Zero ALTER/contenção/partida nesta conferência; retirada secundária adiada até resultado real do banco.

**Histórico preservado abaixo; apenas o checkpoint acima define a próxima ação.**

**CHECKPOINT HISTÓRICO — RETIRADA CONCLUÍDA; CAPACITY PASS datado; banco preparado PARA REVISÃO, NÃO INSTALADO/NÃO EXECUTADO.** [Resultado/retornos/comandos](reviews/automation-freeform-window-release-af26/security-containment-20261012/retention-audit-20261013/WITHDRAWAL_RESULT_2026-10-13.md). Lote47008ee6 consumido uma vez,4.630.863.872B alocados liberados, cache/main/controles preservados. Mínimo pós-staging14:16UTC6.657.581.056B; piso6.468.665.344B/orçamento banco2.173.698.048B atendidos. Dump fresco13:38UTC+restore PG16 isolado PASS, custódia permanente conferida. Geração bancária140000, quatro modos29arquivos/checker integral PASS, gatefalse/fivegatesfalse/zerointents; políticas apenas propostas. Próxima ação: decisão própria da fase banco, com reconferência imediata de capacidade/WAL/RPO/custódia e owner sudo antes de instalar/ALTER. Auth concluída/NEWauth, saved/fallback600, out.15 CLOSED/guarda38false/sessões preservados; segurança OPEN. Sem restart/expansão/nova rotação/envio/abertura. Retenção automática permanece proposta.

**Histórico preservado abaixo; apenas o checkpoint acima define a próxima ação.**

**CHECKPOINT HISTÓRICO — lote de retenção autorizado; A1 PASS durável com falha posterior do reporter; B ainda não executado; CAPACITY DENY atual.** [Diagnóstico A1 e continuidade](reviews/automation-freeform-window-release-af26/security-containment-20261012/retention-audit-20261013/A1_REPORTING_DIAGNOSIS_2026-10-13.md). Duas observações completas/owners0; erro `len(False)` reproduzido no CLI exato, sem modificar driver/input ou repetir A1. C completo confirmou todos os candidatos presentes e mínimo deploy/PostgreSQL2.041.073.664B. Diagnósticos preservados off-host. Próxima ação: B único já autorizado na sessão sudo do owner, seguido de C fresco em diretório próprio; depois capacidade real/WAL e, com PASS, renovar backup/RPO e reconferir banco para revisão. Auth concluída/NEWauth, dumps600, out.15 CLOSED, guarda38 fechada e produção preservados; segurança OPEN. Nenhuma retirada, instalação ou rotação nesta publicação.

**Checkpoint histórico — lote publicado antes da autorização e de A1:**

**CHECKPOINT HISTÓRICO — retenção auditada; lote de cinco caminhos PARA REVISÃO / NÃO RETIRADO; banco CAPACITY DENY; auth concluída; out.15 CLOSED; guarda38 fechada.** [Inventário root completo, custódia e proposta4,63GB](reviews/automation-freeform-window-release-af26/security-containment-20261012/retention-audit-20261013/REPORT.md). Expansão adiada. Cache+quatro blobs idênticos, main/manifests/journals/releases/retornos/segredos preservados.13 testes locais do driver e custódia verificada; driver produtivo não executado, nenhuma retirada. Próxima decisão: autorizar este lote com dry-run fresco e leitura posterior; depois renovar RPO/custódia e conferir capacidade bancária. Segurança OPEN, sem nova rotação/instalação.

**Checkpoint histórico — expansão preparada antes da priorização da retenção:**

**Continuidade 13/10 — expansão PREPARADA PARA DECISÃO, não executada:** DigitalOcean confirmado por DMI; Basic Regular80GiB/4GiB/2vCPU US$24/mês (catálogo, +US$6 se atualRegular18), exige desligamento/boot. 62GiB não é opção comprovada. [Roteiro, preservação GPT, custos/limites e dependências](reviews/automation-freeform-window-release-af26/security-containment-20261012/DATABASE_CAPACITY_FOR_REVIEW.md). Banco continua CAPACITY DENY; leitura root integral depende da sessão sudo, fatura/opção regional e snapshot recuperável dependem do console. NEWauth/out15CLOSED/guard38 e artefatos preservados; após reboot exigir geração/bindings reais novos e backup/RPO fresco, sem editar geração antiga.

**Checkpoint histórico — composição bancária anterior à identificação do provedor:**

**CHECKPOINT HISTÓRICO ÚNICO — auth3 CONCLUÍDA/PRESERVADA; banco composição final revisável, CAPACITY DENY; segurança OPEN; out15 CLOSED/guarda38 fechada.** [Entrega bancária e caminho concreto de capacidade](reviews/automation-freeform-window-release-af26/security-containment-20261012/DATABASE_FINAL_PREPARATION_2026-10-13.md). Quatro modos/configs/manifests/política proposta59043/installer94b7/Node20Prisma reutilizado, dez ensaios PG16 reais com efeitos PM2/nft/HTTP simulados; prova TCP original na VPS passou, final checker negou orçamento. Zero ALTER produtivo/instalações/restarts/envios/abertura; NEWauth em todas as variantes. Mínimo10:33UTC/07:33Fortaleza2.104.283.136B, orçamento2.173.698.048B, déficit69.414.912B. Próxima decisão: expansão do disco raiz60→62GiB proposta, sem limpeza/retirada; depois PASS real e renovação RPO/custódia antes de revisão de execução bancária. Backup01:14UTC/restore70/614/60 íntegro é histórico, não frescor atual. Helpers/sudoers/frontend/recibo/CRM/guard38/6resultados/5nãoenviados preservados; gatesfalse/zero intents. Externos/cifragem/Telegram futuro e liberaçãoguard separados. Auth não é trabalho pendente.

**Checkpoint histórico — auth concluída e draft bancário inicial:**

**Estado anteriormente vigente — out.15 CLOSED; guarda38 fechada; segurança OPEN; AUTH3 EXECUTADA/CONFIRMADA.** [Resultado consolidado e continuidade bancária](reviews/automation-freeform-window-release-af26/security-containment-20261012/AUTH_V3_EXECUTION_2026-10-13.md). Geração234100 complete/switch exit0, contenção53,154s em13/10 00:31–00:32UTC/12/10 21:31–21:32Fortaleza; três segredos novos, uma partida API e mesmo worker, frontend intacto. Owner confirmou logout da sessão antiga e novo login/telas; controle interno novo200/antigo401 em API/worker. Guard38closed/tasks{}, out15CLOSED/6entregas/5nãoenviadas/reciboCRMusage preservados, barreira ausente, cron/boot/supervisão/sessões conferidos, saved/fallback600/hash849893e2…, cinco gatesfalse. Backup fresco off-host/restauração isolada PASS; provas anteriores preservadas. Política093a instalada/helper-sudoers iguais. Banco draft novo pós-authv2-004500 com adapter/SQL/plano selados e applyAuthorizedfalse; NOT INSTALLED/NOT EXECUTED. Próxima ação: revisar retorno bancário pré/pós-commit e consumidores administrativos, reconferir privilégios/HBA e orçamento/frescor antes de decisão bancária. Não declarar contenção completa. Externos/cifragem/Telegram futuro/CSV-Syer/internacional/CRA-PR/multilote-AUTO/liberação guard separados.

**Checkpoint histórico — preparação auth v3 anterior à execução:**

**Estado anteriormente vigente — out.15 CLOSED; segurança OPEN; auth bloqueada para execução/zero rotações; NOVA preparação v3 concluída PARA REVISÃO.** [Pacote093a/instaladorf9/comandos A/B/provas](reviews/automation-freeform-window-release-af26/security-containment-20261012/AUTH_V3_PREPARATION_2026-10-12.md). Geração234100 captura saved/fallback atuais por duas observações; ambos485103/mode600 e mesma configuração fonte, sem repetir chmod.223100 recusada/diagnósticos preservados, não instalar nem editar seus bindings. Conferência integral SQL global/proxy/baselines/manifests/JSON-ecosystem/sessões/controles/identidades PASS, dados privados preservados; leitura não é drain/exit certificate. Policy093a proposta NÃO INSTALADA;a2ff permanece/helper-sudoers iguais; cinco gatesfalse/execution-authorized=false. Artefatos funcionais/29arquivos por modo/retornos com NEWauth preservados, sem rebuild/parada/start/save/logout. Custódia707117B/ab4d706f…validada e extraída; backup23:14UTC/restore70tabelas614objetos60migrations íntegro reutilizado, frescor/RPO precisará reconferência/renovação na janela. Último23:52UTC/20:52Fortaleza:min(deploy/PG)2.230.255.616B/authbudgetPASSdatado,WAL80MiB/slots0,healthDBOK, mesmos PIDs/ticks,guard38closed/tasks{}. Owner declara Telegram não usado/frente futura; dois cadastros, uma flag efetiva inbound/zero outbound, zero registrosTelegram30dias; não inferir uso por enabled/token. Linha inválida preservada/dependência específica da cifragem, sem omissão/BotFather/ativação/Webdisconnect/recredenciamento. Decoder integrado LOCAL a reader/writer canônicos/callers com escopo tenant; dedicated key/epoch opt-in e política histórica selada/prazo/tenant/payload-cipher hashes.147campos126eventos preservados/4testes seed e3captura/typecheckNode20 PASS, sem SQL/provider; NÃO incluído nos runtime artifacts auth. Próxima ação: revisão do pacote v3 e depois instalação restrita com owner sudo/conferências atuais; não executar223100. Banco pós-auth depende do cutover real; nenhum apply/reset/cipher rotation. .6/setembro encerrados/audiência originalNOTACCEPTED; liberação guard, CSV/Syer, internacional, CRA-PR,multilote/AUTO separados.

**Checkpoint histórico — recusa e continuidade local4f5bd046:**

**Estado anteriormente vigente — out.15 CLOSED; segurança OPEN; auth autorizada BLOQUEADA antes da instalação.** [Execução parcial autorizada/diagnóstico/provas](reviews/automation-freeform-window-release-af26/security-containment-20261012/AUTH_EXECUTION_2026-10-12.md). Somente dois dumps PM2 ajustados600 com duas amostras/cópia privada/conteúdo-owner intactos; backup fresco off-host/restore70tabelas614objetos60migrations/banco removido. Checker negou saved_reference_drift: geraçãoauth223100 herdou dumps50af do standby anterior, distintos dos atuais485103 e com referências API/frontend antigas. Nenhuma instalação root/contenção/parada/start/save/rotação/logout; a2ff permanece, gatesfalse, guard38closed/tasks{}, processos atuais preservados. Fix do preparador/captura de fontes reais LOCAL/3testes PASS; não aplicado na geração recusada. Decoder administrativo histórico+writerdedicado LOCAL/4cenários sintéticos e147campos126eventosoriginais PASS/hashes intactos; integração runtime/autorizações seladas continuam necessárias antes de cifragem. Mapas privados de5substitutas externas/11linhas derivadas/5estadosWeb e botTelegraminválido preparados sem valores/publicação/revogação/desconexão. Geração banco pós-auth bloqueada por inexistência de cutover/novas identidades; adapter/SQL anteriores preservados, sem apply. Próxima ação: revisar fix e gerar preparação auth nova com saved/fallback efetivos, nunca adaptar223100 para PASS; precondições globais/proxy devem completar e backup/capacidade renovados conforme validade. Último23:21UTC/20:21Fortaleza:min(deploy/PG)2.232.520.704B/authbudgetPASSdatado,WAL80MiB/slots0,healthDBOK. Out15 e.6/setembro encerrados; audiência originalNOTACCEPTED. Guard38/liberação futura, CSV/Syer, internacional, CRA-PR,multilote/AUTO separados. Contenção completa NÃO demonstrada.

**Checkpoint histórico — preparação c3ef43dd anterior à execução autorizada:**

**Estado anteriormente vigente — out.15 CLOSED no alcance de 2e8dc9ea; segurança OPEN, preparação concreta de contenção para revisão.** [Pacote/roteiro/hashes](reviews/automation-freeform-window-release-af26/security-containment-20261012/README.md). Inventário14slots/13valores distintos privado, consumidores/emissores/escopos locais e campos externos pendentes explícitos; nenhuma necessidade de reconstruir todo transcript. Auth3 tem geração V4 inativa223100, política723 proposta/instalador188, configs integrais/29arquivos/modo/baselines reais, helpers/sudoers iguais, gates falsos, retorno com valores novos. Fonte ativaa2ff permanece instalada; mesmos API/worker/frontend/PIDs/health/DB/saved/fallback. Dados de cifragem:10/11 canais legíveis,1Telegram enabled com estrutura inválida, MFA0/webhook0,341refs legíveis,147 campos de seed em126eventos dependem de chavecanal; troca cega bloqueada. Backup restaurado isoladamente/roundtripsNode20/SCRAMPG16 e contrato/adapter de commit incerto sem start validados no alcance local publicado. Permissões2amostras POSIX/ACL iguais: saved664 mas leitura atual deploy/root pela cadeia; proposta600+umask077, não aplicada. Propostas privadas geradas, escrow verificado, driverSCRAM/SQL/configs/recibo e adapter bancário para revisão; sem SQL ou keys prod. Próxima decisão: instalação/janela auth3/logout e ajuste mínimo de permissões; owner fornece proof/valores externos em arquivo privado; cifragem depende de recuperação específica e decoder histórico versionado revisado; derivadosWeb/Meta/Telegram exigem decisão própria. Último retrato22:58UTC/19:58Fortaleza:min(deploy/PG)2.233.253.888B/authreserva4MiB PASSdatado,WAL80MiB/slots0,guard38closed/tasks{},gatesfalse. Não declarar contenção dos14 nem capacidade universal de cifragem. Nenhuma rotação/revogação/chmodPM2/restart/deploy/envio/abertura/retomada/migration. Audiência históricaNOTACCEPTED,recibo/CRM/6resultados/5nãoenviados preservados; .6/setembro encerrados. CSV/Syer, internacional, CRA-PR,multilote/AUTO separados. Liberação da guarda será decisão independente.

**Checkpoint histórico — encerramento da campanha e segurança em auditoria — out.15 encerrada por cancelamento canônico verificado, 12/10/2026; ocorrência de segurança OPEN separadamente.** [Resultado/certificado](reviews/automation-freeform-window-release-af26/dynamic-integrated-prepared-20261012/out15-closure-20261012/RESULT_2026-10-12.md) / [segurança e plano de rotação](reviews/automation-freeform-window-release-af26/dynamic-integrated-prepared-20261012/out15-closure-20261012/SECURITY_FOLLOWUP.md). Política standby a2ff instalada pelo owner, anterior112830 arquivada, helper/sudoers iguais; inspect PASS/phase null e todos os gates falsos. Uma ação ADMIN Cancelar conjunto: controlador/filho/link/conjunto/job cancelados, um evento19:57:22UTC/16:57:22Fortaleza. BlocoB único/planHashce1afa/certificado integral PASS; lista→detalhe→polling confirmado pelo owner. Seis entregas reportadas preservadas, cinco não enviadas, pending0/failed0; snapshot255/11/244 e exclusões históricas separados. Restore isolado do dump fresco comprovou CRM/usage/recibo/seis Outbounds idênticos; banco temporário removido. Guarda38 fechada/tasks{}, leases0; API/worker/frontend/sessões/controles/saved/fallback intactos, nenhuma execução de retorno, envio ou abertura. Incidente específico CLOSED; público original NOT ACCEPTED, lacunas históricas preservadas. .6/setembro/implantações encerrados; CSV/Syer, internacional, CRA-PR, multilote/AUTO separados. Próxima ação: decisão sobre plano de rotação/avaliação de acesso ao transcript; valores potencialmente expostos ainda configurados, nenhuma rotação realizada. Não presumir contenção por ausência no Git.

**Checkpoint histórico — implantação/encerramento ainda pendente — implantação integrada de 12/10 concluída tecnicamente, com telas confirmadas pelo owner. Encerramento da out.15 preparado para decisão, NÃO EXECUTADO.** [Relatório único](reviews/automation-freeform-window-release-af26/dynamic-integrated-prepared-20261012/deployed-20261012/DEPLOYED_2026-10-12.md) e [procedimento histórico](reviews/automation-freeform-window-release-af26/dynamic-integrated-prepared-20261012/deployed-20261012/OUT15_CLOSURE_FOR_REVIEW.md). API dinâmica 5b3cf3af, mesmo worker mínimo afbb e frontend dinâmico estão ativos; identidade, BUILD_ID/CSS, health/DB, sessões e controles conferidos. Contenção da API: 35,414 s; intervalo observado da parada do frontend à prontidão: até 6,744 s. Uma partida por componente, sem retorno; promoção sem restart após confirmação humana, saved/fallback iguais e gates falsos. Helpers/sudoers preservados, cron/boot restaurados e barreira ausente. Guarda38 fechada, tarefa arquivada/recibo .6 preservados, job suspenso, seis entregas reportadas e cinco posições sem submissão. Retorno compatível com identidades reais preparado na geração 184200, com política a2ff, 29 arquivos por modo e gates falsos; política NÃO INSTALADA, execução bloqueada até certificado do futuro cancelamento canônico. A prova dirigida Node20/PostgreSQL passou; nenhuma ação histórica foi executada em produção. Próxima ação: decisão específica sobre o procedimento de encerramento e a política de retorno compatível. Público original da out.15 não aceito; incidente permanece aberto até encerramento verificado. Recuperação .6/setembro encerrados; CSV/Syer, internacional, CRA-PR, multilote e AUTO separados. Ocorrência de segurança independente: valores de configuração privada apareceram acidentalmente no output de uma ferramenta, sem inclusão no Git; credenciais preservadas, avaliação de acesso/rotação depende de decisão própria.

**Checkpoint histórico consumido — retirada autorizada5b3 e staging integrado,12/10. WITHDRAWAL COMPLETE / CAPACITY PASS DATADO / INACTIVE STAGING VERIFIED FOR REVIEW / NOT INSTALLED / NOT DEPLOYED.** [Relatório único](reviews/automation-freeform-window-release-af26/dynamic-integrated-prepared-20261012/README.md), [comandos concretos](reviews/automation-freeform-window-release-af26/dynamic-integrated-prepared-20261012/COMMANDS_FOR_REVIEW.txt), [hashes/provas](reviews/automation-freeform-window-release-af26/dynamic-integrated-prepared-20261012/staging-result-20261012.json). Duas cópias retiradas,958.939.136B; root2amostras completas/owners0/incomplete0,main/evidências preservadas e recibo off-host. CAPACITY pós-staging14:46Fortaleza:min(deploy/PG)2.259.595.264B,piso2.131.755.008B,margem127.840.256B,WAL80MiB/5/0slots; datado, reconferir. Backup off-host concluído14:17Fortaleza/restore70tabelas/614objetos/banco temporário removido/checksumssemdivergência; idade não é horário de geração do manifesto. APIoverlay6033/frontendtar74a2 reutilizados; candidatos e retorno API compatível staged, sem starts. Identidades/baselines/inventário/proxy/guard38/sessõescontroles/savedfallback PASS14:45Fortaleza; cinco gatesfalse/frontendfalse. Políticas V4/window/permanente concretas propostas;helpers/sudoers preservados, futura instalação depende Deifsonsudo. Próxima ação: revisão do pacote/decisão consolidada API→frontend, com baseline real póscomplete/switch antes da instalação/paradafrontend. Cancelamento histórico permanece bloqueado até binding/política novos do retorno compatível à composição entãoefetiva; não inventar PIDs futuros. ProduçãoAPI2ed/workerafbb/frontend3227 viva,guard38fechada/jobsuspenso/6resultados/5semsubmissão/recibo.6 íntegros. IncidenteOPEN,audiênciaout.15NOTACCEPTED; nenhuma abertura/envio/cancelamento/reconciliação/deploy/instalação. .6/setembroCLOSED,aceitesanteriorespreservados;CSV/Syer,internacional,CRA-PR,multilote/AUTO separados. Diagnósticosrun_release/policy_already_exists/metadatatime/restorecontrato preservados e resolvidos no staging, sem relaxar gates.

**Checkpoint histórico consumido — continuação cf55655b, 12/10. LOCAL VALIDATED / STORAGE ACTION READY FOR REVIEW / NOT DEPLOYED.** [Relatório único atualizado](reviews/automation-freeform-window-release-af26/dynamic-integrated-prepared-20261012/README.md) e [dois caminhos/958.939.136B/comandos restritos](reviews/automation-freeform-window-release-af26/dynamic-integrated-prepared-20261012/STORAGE_WITHDRAWAL_FOR_REVIEW.md). Aceitação conhecida sem Outbound compatível permanece uncertain também após cancelamento; lista/detalhe/lote Node20/PG PASS, sem not_submitted indevido. Retorno operacional compatível ativo+overlay6033/mesmo frontend74a2 preserva6entregas+5não enviados, resume409/claimnull/provider0 em isolamento; retorno semântico aos leitores antigos proibido após cancelamento histórico. Frontend/build/tar/provas válidas reutilizados. Capacidade usa mínimo deploy/PostgreSQL; orçamento inclui retorno adicional36.171.776B. Amostra12:56Fortaleza: déficit824.857.127B; retirada projetada supera déficit com margem134.082.009B, sem CAPACITY PASS antecipado. Custódia off-host/blob/extracao765 reconferidos; root2amostras completas/owners0/incomplete0/4174referências/zero aos dois caminhos. Main, todas as gerações/referências/retornos/manifests/journals/WAL preservados. Retirada NÃO AUTORIZADA/NÃO EXECUTADA; próximo passo decisão específica sobre blocoA/B/C, depois capacidade real/backup/WAL/staging/bindings/políticas novos com gatesfalse. Nenhuma política/window declarada pronta sem staging. Guardafechada38/hash/PIDs/ticks atuais reconfirmados na leitura root12:55; job suspenso,6resultados/5sem submissão/recibo.6 preservados. Incidente OPEN; audiência out.15 não aceita, quatro elegíveis não autorizam teste individual. Recuperação.6/setembro CLOSED, frontend3227 anterior concluído; CSV/Syer, internacional,CRA-PR,multilote/AUTO naturais separados. Nenhum envio/abertura/retomada/cancelamento produtivo/deploy/instalação nesta tarefa. Preferência de janela sem humanos não dispensa automações/serviços.

**Histórico preservado abaixo — somente o checkpoint acima define a próxima ação.**

**Checkpoint cf55655b — histórico de audiência dinâmica (12/10/2026). LOCAL IMPLEMENTED/VALIDATED FOR REVIEW; NOT DEPLOYED; CAPACITY DENY / NOT PREPARED FOR INSTALLATION/WINDOW.** [Entrega integrada, artefatos/hashes, provas, fronteiras e próximos gates](reviews/automation-freeform-window-release-af26/dynamic-integrated-prepared-20261012/README.md). Lifecycle compartilhado/proteção PROVISIONAL e invalidação da prévia preservados; projeção tenant-scoped distingue processamento, pausa solicitada/efetiva, suspensão e resultado incerto em lista/detalhe/polling, sem ledger global ou Campaign.status reescrito. Encerramento canônico ensaiado somente local: seis entregas reportadas preservadas, cinco não enviadas (nenhuma falha Meta fabricada), concorrência/replay idempotentes, zero provider. Quatro elegíveis não são público autorizado do teste; audiência out.15 NOT ACCEPTED. Leitura atual12:18Fortaleza: API2ed/workerafbb/frontend3227 e identidades preservados, guarda38fechada/tasks{}, job suspenso sem lease, seis resultados/cinco sem submissão e recibo.6 íntegros. Reboot local recuperado; builds finais Node20.20.0/5 provas PostgreSQL/11+6 casos Chrome tar exato/1unit PASS; provas válidas anteriores reutilizadas. Backup privado off-host/restore isolado comprovado, frescor/RPO futuro ainda obrigatório. Margem staging integrada insuficiente em807.359.015B; não instalar/montar política operacional ou declarar geração executável pronta. Próximo passo: revisão código/contrato e ação de capacidade concreta separada; depois staging/bindings/políticas novas e decisão de implantação, seguida de decisão própria de cancelamento. Não retornar ao leitor API antigo depois do cancelamento histórico. Incidente OPEN até implantação/aceite do delta e encerramento específico verificado sem envio. Recuperação.6/setembro CLOSED; frontend3227 anterior concluído; aceitação/webhook/ResultTruth aceitos no alcance publicado. CSV/Syer, internacional, CRA-PR, multilote/AUTO naturais separados. Nenhum deploy/cancelamento produtivo/ack/abertura/retomada/envio nesta tarefa. Preferência owner: feriados/fins de semana/após18hFortaleza, sem dispensar serviços/automações.

**Histórico preservado abaixo — checkpoints anteriores não substituem o estado corrente.**

**Audiência dinâmica out.13→out.15 — AUDIENCE NOT ACCEPTED / LOCAL CORRECTIONS VALIDATED / NOT DEPLOYED (12/10).** [Diagnóstico por posição, contratos, patch e provas](reviews/automation-freeform-window-release-af26/dynamic-audience-continuity-20261011/README.md). out.13=NURTURE, out.14=FOLLOW_UP, out.15=NEW em campanhas distintas;255IDs NEW já existiam antes da criação da out.15. Onze identidades correspondem ao filtro salvo, mas sete Contacts PROVISIONAL violam o lifecycle operacional; gate compartilhado omitia essa condição. Quatro admissíveis pelo contrato não validam a intenção de teste individual. Estimativa/tela original não registrada, owner não recorda: causa histórica da seleção desconhecida. Correção local reaproveita lifecycle/candidatos e invalida prévia pela geração existente quando usuário muda filtro/modalidade. PostgreSQL compilado Node20 PASS255→4/251, módulo original FAIL esperado11; seis casos Chrome final/CSS PASS. API/build local conferidos, worker unchanged, nenhum staging/deploy. Result Truth e telas aceitos somente pelos seis resultados conhecidos/cinco pendentes; público não aceito. Guarda38fechada/job suspenso/recibo.6/históricos e componentes preservados. Enviando é status persistido, não execução ativa; revisão de indicação de suspensão separada. Próximo: revisão local e decisão própria sobre público/job, sem retomada automática. CSV/Syer, internacional, CRA-PR, multilote/AUTO naturais separados; frontend3227/recuperação.6/setembro encerrados. Checkpoints anteriores permanecem históricos.

**Result Truth API — DEPLOYED TECHNICALLY (11/10,18:33 Fortaleza), READ MODELS PRODUTIVOS PASS.** [Registro, duração, hashes e aceite discriminado](reviews/automation-freeform-window-release-af26/result-truth-api-prepared-20261011/DEPLOYMENT_2026-10-11.md). API2ed exata sobre preventiva/onlyroutes runtime; sequência V4única complete/switch exit0, contenção37,824s, uma partida API/mesmo workerafbb, frontend3227 PID/BUILD_ID preservados. Lista/detalhe/nova lista6entregas reportadas+5pendentes sem duplicação; recibo/.6/job/guarda38fechada intactos. Health/DB,auth/sessões,proxy,cron/boot/supervisão,saved/fallback/barreiraausente PASS;5gatesfalse. Backup adicional fresco off-host/restore70tabelas comparado/banco local removido.2worker_capture_churn negados e3ªamostra consistente; serializaçãofalse arquivada/restaurada aos bytes atestados, manifesto16entradas PASS. Owner confirmou especificamente lista/detalhe/polling6entregas+5pendentes sem duplicação/mistura: Result Truth PASS no escopo. StatusEnviando preservado por job suspenso/cinco posições pendentes; disposição/retomada separada. Aceites anteriores e frentes independentes preservados. Sem envio/abertura/retomada/replay/reparo. Checkpoints anteriores seguem históricos.

**Result Truth API — PREPARED FOR INSTALLATION REVIEW / NOT INSTALLED / NOT DEPLOYED (11/10).** [Pacote operacional completo, comandos e limites](reviews/automation-freeform-window-release-af26/result-truth-api-prepared-20261011/README.md). Sobre API preventiva ativa, apenas routes.js runtime e fonte correspondentes; overlayaf8406ad…, compilado0118b7d3… reutilizado.1.893arquivos/2links/6.944dependências verificados, retorno completo preventivo, workerafbb sem delta e frontend3227 preservado. Geração184000 nova, guarda38/job suspenso/recibo e seis resultados/cinco não submetidos intactos;5gatesfalse/sem intents/provas consumidas. Backup fresco18:42UTC off-host/restore70tabelas removido; capacidade observada PASS pelo piso com margem datada171MB.2 provas de composição Node20/PG sintético PASS, demais reutilizadas. Somente política V4 precisa instalar por Deifson; helper/sudoers/políticas frontend iguais. Hash root600 atual exige leitura sudo antes da instalação; prechecks/backup/WAL precisam reconferência na janela. Nenhuma instalação/stop/start/deploy/envio/abertura nesta tarefa. Próximo passo decisão de instalação/janela e retornos; aceites e frentes independentes preservados.


**Result Truth — complemento local do fallback histórico (11/10), REVIEW READY / NOT DEPLOYED.** [Relatório e provas](reviews/automation-freeform-window-release-af26/campaign-list-result-truth-20261011/README.md#complemento--fallback-histórico-por-execução-base99ad6b6b). Conjunto soma projeções canônicas por execução, sem reprojetar o resumo global:6 envios históricos sem resultados individuais +1delivered =7enviados, apenas1entrega reportada. Contador defasado de cada execução continua subordinado aos seus próprios resultados explícitos. Duas ordens dos filhos e falha/bloqueio PASS;10 provas de leitores PostgreSQL e4 cenários browser/polling PASS, Node20.20.0. Sem rebuild frontend, mudança worker ou consulta produtiva. Aceites e históricos anteriores preservados; produção aguarda revisão/decisão de implantação.


**Result Truth LISTA — CORREÇÃO LOCAL VALIDADA / REVIEW READY / NOT DEPLOYED (11/10).** [Patch mínimo, contrato dos contadores,10 provas PostgreSQL e4 cenários Chrome](reviews/automation-freeform-window-release-af26/campaign-list-result-truth-20261011/README.md). Lista e detalhe compartilham a projeção canônica e vínculos tenant/controlador/lote, sem recibo específico/N+1. Filho/controlador6entregas reportadas+5pendentes, página só controlador, várias execuções, público previsto/materializado, FAILED131026/bloqueios, isolamento/RBAC e polling PASS em laboratório. Node20.20.0, TypeScript exit0; frontend3227 exato reutilizado/estilos PASS, sem rebuild ou alteração frontend/worker. FAIL produtivo da lista permanece até revisão e futura implantação autorizada deste delta API. Aceitação/webhook já aceitos, frontend3227 concluído, recuperação.6 e setembro CLOSED preservados; guarda38/job/recibo/históricos não acessados nem alterados. CSV/Syer, internacionais, multilote/AUTO naturais e CRA-PR separados. Checkpoints anteriores abaixo permanecem históricos.

**API preventiva — ACEITAÇÃO/WEBHOOK ACEITOS NO ALCANCE REVISADO; RESULT TRUTH PARCIAL (11/10,08:22 Fortaleza).** [Matriz, hashes ativos, leitura atual e pendência P2 específica](reviews/automation-freeform-window-release-af26/preventive-api-frontend3227-prepared-20261010/API_ACCEPTANCE_2026-10-11.md). Dez provas fonte/novas fronteiras e nove provas do compilado exato reutilizadas, seis hashes runtime atuais iguais/Node20.20.0. Não há novo caso natural pós-deploy: prevenção de falha CRM/corrida webhook NOT EXERCISED em produção, sem exigir falha fabricada. Detalhe filho/controlador/conjunto6delivered+5pending PASS; lista controlador conserva0enviados/244bloqueados e resumo próprio, filho metaSummary.pending0: divergência comprovada do read model, não reparo dos dados. Pendência mínima: revisão/correção local da agregação canônica da LISTA e prova de polling, sem implementação nesta auditoria. Guarda38/job suspenso/recibo/tarefa arquivada/.6/seis únicos/cinco sem submissão preservados. Frontend3227 concluído; API tecnicamente implantada; CSV/Syer/internacionais/CRA-PR/multilote/AUTO separados, setembro CLOSED. Checkpoints anteriores permanecem históricos.

**Frontend3227 — DEPLOYED TECHNICALLY / OWNER UI CONFIRMED (11/10,08:08 Fortaleza).** [Encerramento,46,122s medidos, hashes e limites](reviews/automation-freeform-window-release-af26/frontend3227-observation-diagnostic-20261011/EXECUTION_2026-10-11.md). Ida/root before e exited novos, única partida/ready/BUILD_ID/CSS PASS; owner confirmou telas. Bloqueio reader_integrity resolvido por campo único readerSha256 da política permanente autorizado em a91c538b, originais arquivados/root600/leitura real PASS. Promoção/supervisão/PM2 save/fallback PASS às08:07:23, gatefalse; frontend4121573/API4049504/worker4049657 restart0, API/worker preservados. Health/DB/sessões/inventário/cron/boot/barreira/manifests PASS; guarda fechada38/job suspenso/recuperação.6/seis resultados/cinco sem submissão intactos. Sem rebuild, envio, abertura, retomada ou reparo. Diagnósticos e manifests off-host verificados; retorno fa60/gerações referenciadas preservados. Aceite funcional API, CSV/Syer, internacionais, multilote/AUTO naturais e CRA-PR separados; setembro CLOSED. Checkpoints anteriores abaixo são históricos superados quando conflitarem com este estado atual.

**Frontend3227 — SERVING / OWNER UI CONFIRMED / PERMANENT PROMOTION BLOCKED (11/10).** [Causa reader_integrity, provas e bytes mínimos propostos](reviews/automation-freeform-window-release-af26/frontend3227-observation-diagnostic-20261011/PERMANENT_READER_BLOCK_2026-10-11.md). Ida e nova saída root PASS, partida única/ready/BUILD_ID/CSS PASS; owner confirmou telas. Política permanente ed28 ainda fixa reader935, mas reader aprovado agora c885; dependência omitida na auditoria. Antes da promoção/save precisa decisão sobre campo único readerSha256 e referências arquivadas; não ampliar sudo/helpers/roles nem repetir start. Fa60 retorno também depende desse reader. API/worker/guarda38/job/.6 preservados. Não declarar DEPLOYED TECHNICALLY completo enquanto supervisão/save pendentes.

**Frontend3227 — OBSERVER/POLICY VERIFIED / PREPARATORY INTEGRATED PREFLIGHT PASS / WINDOW DECISION PENDING / NOT DEPLOYED (11/10).** [Resultado integrado, hashes e7 provas dirigidas](reviews/automation-freeform-window-release-af26/frontend3227-observation-diagnostic-20261011/README.md#preflight-concluído-após-inicialização-autorizada--11102026). Preparador agora inicializa/valida receipts-private sem reparar divergências. Na VPS, lock/manifests/checker/bytes/gatefalse/ausência de intents PASS; criado só diretório deploy700 e uma invocação do preflight, uma tentativa/two-sample root PASS às07:39Fortaleza. Captura preparatória arquivada e off-host; erro anterior preservado. Instalador/helper/políticas/sudoers/bindings/controles não repetidos ou alterados nesta continuação. API preventiva/workerafbb/fa60/saved/guarda38/job/recuperação.6 preservados. Próxima ação decisão de janela com leitura fresca, sem usar captura preparatória como saída; nenhum rebuild/deploy/envio/abertura. Frentes CSV/Syer, internacional, multilote/AUTO e CRA-PR separadas.

**Frontend3227 — helper/política diagnóstico INSTALLED AND CHECKED / PREFLIGHT SETUP DENY / NOT DEPLOYED (11/10).** [Resultado e reprodução da omissão](reviews/automation-freeform-window-release-af26/frontend3227-observation-diagnostic-20261011/README.md#resultado-da-instalação-autorizada--11102026): hashes/root/modos/regra/visudo e checker estrito PASS; preflight parou antes da observação por falta do pai receipts-private. 1 prova local reproduz FileNotFoundError/zero attempts; não atribuir12 provas antigas ao setup vazio. Sem repetição do instalador/preflight, mkdir produtivo ou binding alterado. API preventiva/workerafbb/fa60, supervisão/saved/fallback, guarda38/job/recuperação.6 preservados em leitura07:33Fortaleza. Próximo passo revisão mínima da criação/validação do diretório antes de decidir nova execução exclusivamente do preflight; janela segue impedida.

**Frontend3227 — nova composição observacional conferida / FOR RESTRICTED INSTALLATION AND PREFLIGHT REVIEW / NOT DEPLOYED (11/10).** [Diagnóstico, patch, 15+6 novas provas e12 regressões, hashes e roteiro concreto](reviews/automation-freeform-window-release-af26/frontend3227-observation-diagnostic-20261011/README.md). Causa histórica específica permanece desconhecida: stderr original genérico sem operação/PID/FD. Helper proposto acrescenta contexto sanitizado mantendo negativas/prazos; NÃO instalado. Geração nova101500 deriva da API preventiva/workerafbb/fa60 efetivos, guarda38 e controle return ativo; tar3227/build/provas reutilizados, gatefalse. Manifests/composição/artifacts PASS; checker normal DENY esperado antes da nova instalação, futuro preflight NOT EXERCISED. Helper+política de janela exigem revisão/autorização específica; sudoers e política permanente ed28 inalterados. Leitura atual10:19UTC não substitui reconferência futura. Guardafechada38, job suspenso e recuperação.6 encerrada preservados; nenhuma janela, envio, restart ou recuperação. CSV/Syer, internacional, multilote/AUTO naturais e CRA-PR separados.

**Encerramento consolidado — API preventiva DEPLOYED TECHNICALLY; frontend RETURNED TO fa60 (10/10 23:28 Fortaleza / 11/10 02:28 UTC).** [Resultado final e diagnósticos](reviews/automation-freeform-window-release-af26/preventive-api-frontend3227-prepared-20261010/EXECUTION_2026-10-11.md): V4 API/mesmo worker complete/switch, contenção28s; frontend exited inicial DENY ownership_observation_incomplete, segunda leitura nova PASS, retorno fa60 único/owner confirmou. Política permanente/promoção/supervisão/save/fallback PASS, gate frontend falso, CSS servido e configs persistidas conferidos. API4049504/worker4049657/frontend4051349 restart0; health/DB, cron/boot/barreira e inventário preservados. Guarda fechada38/job suspenso/seis resultados/cinco posições sem submissão intactos. Frontend3227 NOT DEPLOYED/sem partida, tar e provas preservados. Próximo: diagnóstico isolado da recusa observacional antes de outra proposta frontend; aceite funcional API e frentes CSV-Syer/CRA-PR/multilote/AUTO separados. Nenhum envio/reparo/abertura.

**Frontend3227 — retorno fa60 confirmado pelo owner; candidato não iniciado (11/10 02:16 UTC / 10/10 23:16 Fortaleza).** [Registro](reviews/automation-freeform-window-release-af26/preventive-api-frontend3227-prepared-20261010/EXECUTION_2026-10-11.md): primeiro exited DENY ownership_observation_incomplete; segunda observação nova PASS, retorno fa60 único/HTTP/identidade/CSS PASS. Sem alteração de checker/binding ou bypass. API preventiva e worker afbb ativos, guarda fechada38/job suspenso. Política permanente/promoção/save do novo controle de retorno pendentes da sessão sudo de Deifson; confirmação das telas já registrada. Frontend3227 NOT DEPLOYED; aceite funcional API separado.

**Execução consolidada em andamento — API preventiva DEPLOYED TECHNICALLY; frontend3227 NOT DEPLOYED (11/10 02:12 UTC / 10/10 23:12 Fortaleza).** [Registro factual](reviews/automation-freeform-window-release-af26/preventive-api-frontend3227-prepared-20261010/EXECUTION_2026-10-11.md): V4 complete/switch exit0, contenção28s, mesmo worker afbb retomado, frontend fa60 preservado, guarda fechada38 e job suspenso. Backup fresco off-host/restore isolado PASS. Baseline real pós-API PASS/gate frontend falso; política de janela frontend aguarda execução na sessão sudo de Deifson. Promoção frontend depende de confirmação owner. Sem envios/abertura/recuperação repetida; aceite funcional separado.


**API preventiva sobre a26 + frontend3227 — PREPARED FOR REVIEW / NOT DEPLOYED (10/10 22:40 Fortaleza / 11/10 01:40 UTC).** [Relatório consolidado, artefatos, hashes e comandos](reviews/automation-freeform-window-release-af26/preventive-api-frontend3227-prepared-20261010/README.md): overlay restrito de seis fontes/compilados, Node20.20.0/9 testes compilados, 264 módulos runtime iguais na VPS, schema/Prisma/deps ativos preservados. Tar3227 exato reutilizado, CSS/manifestos/retorno fa60 conferidos; worker mínimo afbb sem mudança funcional. Preparações env-v2 novas, três modos JSON/ecosystem/28 arquivos íntegros, política e controles próprios, gates falsos. Geração inicial DENY environment_drift frontend preservada; produtor corrigido para ambiente OS real de PM2 cluster, ensaio Node20/PM2 real PASS sem relaxar checker. Inventário congelado exige recibo/ack/guarda38 e rejeita drift; captura frontend pós-API arquiva baseline anterior e exige sucesso real antes de avançar. Dump pós-ack off-host/restore isolado PASS/banco temporário removido; capacidade datada com margem225.595.392bytes acima do piso. Nenhuma política instalada, stop/start/save/abertura/envio/recuperação repetida. Próxima decisão: políticas restritas e sequência API→baseline frontend→janela frontend; confirmação owner precede promoção frontend. Leituras frescas, RPO/WAL e instalação sudo permanecem gates futuros. Recuperação .6 CLOSED; guarda fechada38/job suspenso/seis resultados/cinco posições sem submissão preservados. CSV/Syer, internacional, CRA-PR, multilote/AUTO e cinco restantes separados; setembro CLOSED.

**Out.15 posição .6 — RECUPERAÇÃO PRODUTIVA CONCLUÍDA (10/10Fortaleza21:13 / 11/10UTC00:13).** [Relatório único, recibo e arquivo sanitizados](reviews/automation-freeform-window-release-af26/position6-operational-preparation-20261010/README.md): preflight/backup fresco off-host/dry-run exato → apply uma vez → verify completo → ack uma vez, exit0/sem timeout. Outbound .6 com DELIVERED reportado/tempos originais/bodyText:null motivado, disposição CRM histórica específica/usage/eventos/totais/recibo verificados; nenhuma identidade/janela Meta criada. Arquivo integral no audit canônico, razão accepted-delivered própria/ref/hash exatos; guarda fechada38/zero tarefas, cinco Outbounds/WebCRM preservados, seis entregas reportadas e cinco sem submissão. Jobqueued suspenso/loterunning e demais estados intactos; sem abertura/retomada/reenvio/restart/deploy. APIa26/workerafbb/frontendfa60 e controles/sessões preservados, health/DBPASS. Decisão sobre cinco posições restantes separada. Frontend3227/prevençõesAPI PENDING/NOT DEPLOYED; CSV/Syer, internacional, CRA-PR, multilote/AUTO e setembro CLOSED separados.

**Out.15 posição .6 — RETIRADA ESPECÍFICA CONCLUÍDA / CAPACITY PASS delimitado (10/10,23:51–23:58UTC / 20:51–20:58Fortaleza).** [Relatório único e evidências sanitizadas](reviews/automation-freeform-window-release-af26/position6-operational-preparation-20261010/README.md): quatro cópias redundantes retiradas uma vez/exit0/stderr vazio; main, diretórios/manifests/journals e blob+índice off-host preservados. 1.917.861.888 bytes alocados liberados; duas amostras root posteriores completas, zero owners/incomplete. postgres/deploy mínimo2.399.555.584bytes disponíveis, acima do piso planejado2.131.755.008 em267.800.576bytes; WAL80MiB/sem slots/archive, crescimento medido em108s não limita rajadas. CAPACITY PASS datado não autoriza apply/ack; rever espaço, fontes e frescor/RPO antes de decisão separada. Nove arquivos administrativos/244 referências atuais/248 históricas íntegros. Guarda37/provider-persisting/job suspenso, cinco Outbounds/WebCRM/.7–.11 e identidades APIa26/workerafbb/frontendfa60 preservados; owner confirmou Inbox/CRM. Uma sessão Web QR_REQUIRED histórica permanece, sem desconexão causada pela ação. Sem apply/ack/abertura/restart/deploy. Frontend3227/prevençõesAPI pendentes; CSV/Syer, internacional, CRA-PR, multilote/AUTO separados; setembro CLOSED.

**Out.15 posição .6 — REVISÃO OPERACIONAL / CAPACITY DENY (10/10,23:05–23:11UTC / 20:05–20:11Fortaleza).** [Relatório existente, fontes dos drivers, grafo/receita e ação mínima proposta](reviews/automation-freeform-window-release-af26/position6-operational-preparation-20261010/README.md): quatro templates reversíveis reproduzem hashes preparados sem valores privados; render alterado nega; grafo/bundle originais conferidos, sem rebuild. PGDATA/WAL/ledger no mesmo disco,455–461MiB livres versus piso1GiB da rotina vigente e orçamento proposto2.033MiB; logs sem erro não atestam capacidade. Preparações22,9GiB e cinco arquivos históricos idênticos; preservar conteúdo/metadados off-host e retirar apenas quatro redundantes poderá liberar1,786GiB, mas depende de leitura root/referências completas e autorização própria (143processos ilegíveis). Nenhuma limpeza, retenção, infra/config ou arquivo alterado na VPS. Guarda37/tarefa/job, identidades/protegidos e staging íntegros; backup/restore/testes reutilizados. Apply/ack permanecem NÃO AUTORIZADOS/BLOQUEADOS; comandos separados no relatório. Frontend3227/prevençõesAPI PENDING/PRESERVED; CSV/Syer, internacionais, CRA-PR, multilote/AUTO e setembro CLOSED separados.

**Out.15 posição .6 — PREPARAÇÃO READ ONLY / BACKUP-RESTORE / DRY-RUN PRODUTIVO PASS (10/10,22:43–22:56UTC / 19:43–19:56Fortaleza); NOT APPLIED / NOT ACKNOWLEDGED.** [Resultado consolidado, hashes e comandos separados](reviews/automation-freeform-window-release-af26/position6-operational-preparation-20261010/README.md): guarda fechada37/provider-persisting/ref/taskHash e cinco Outbounds/WebCRM intactos; APIa26/workerafbb/frontendfa60 mesmos PID/ticks/restart0, saved/fallback/cron/boot preservados. Input original sem syntheticProofPolicy, CLI Node20.20.0/Prisma6.19.2 isolado na VPS; planHash7949aebe…1011 prevê6submitted/6DELIVERED reportados/5pending, sem provider e sem resultado aplicado. Dump fresco c25cd5ef…903c fora da VPS, restore local70tabelas/protegidos conferidos, banco removido. Disco ~478MB livres e pacote administrativo tmpfs não durável exigem avaliação de margem SQL/WAL e frescor antes de apply. Dez tenants inventariados, jobqueued suspenso/loterunning/leases expirados preservados; não é drain. Apply/verify/ack separados, timeout/commit incerto exige inspeção SQL+ledger+recibo, sem repetir automaticamente. Frontend3227 e prevenções API continuam PENDING/PRESERVED/NOT DEPLOYED; CSV/Syer, internacionais, CRA-PR, multilote/AUTO e setembro CLOSED separados.

**Out.15 posição .6 — A/B/C LOCAL VERIFIED / FOR REVIEW / NOT APPLIED (10/10).** [Implementação, decisão histórica exata, CLI e provas](reviews/automation-freeform-window-release-af26/position6-recovery-implementation-20261010/README.md): owner aprovou disposição histórica/bodyTextnull somente para demo/out.15/child-run-message .6/MetaID/taskHash fixos. Resultado SENT com DELIVERED reportado, WebCRM integralmente preservado, disposition/usage/eventos/recibo completos e ack de razão própria usando archive canônico; normal CRM obrigatório e FAILED131026 preservado. 29 novas provas Node20/Postgres sintético + 1 regressão FAILED131026 + noEmit PASS. Leituras canônicas distinguem 6 entregues reportados/5 pending sem duplicar conjunto; guard/job não retomados. SQL/ledger não atômicos e produção não reatestada nesta rodada. Apply/ack produtivos exigem revisão/autorização próprias, estado/backup frescos. Frontend3227 PENDING/PRESERVED; CSV/Syer, suporte internacional, CRA-PR, multilote/AUTO e setembro CLOSED separados.

**Guarda37 — auditoria produtiva READ ONLY atual / recuperação .6 FOR REVIEW (10/10, SQL21:45–21:52UTC).** [Relatório, fontes originais e proposta](reviews/automation-freeform-window-release-af26/position6-current-audit-20261010/README.md): closed37/provider-persisting/taskHash preservados, APIa26/workerafbb/frontendfa60 vivos. Conta efetiva, destinatário e componentes .6 comprovados pelo seed/log/JSON originais; body renderizado e HTTP bruto não preservados nas fontes inspecionadas. Uma aceitação + dois orphans SENT/DELIVERED, zeroOutbound/usage .6; cinco anteriores idênticos, cinco posteriores sem submissão observada. [Checklist único atualizado](reviews/automation-freeform-window-release-af26/guard37-local-proposal-20261010/POSITION6_RECOVERY_CHECKLIST.md): decisão históricaCRM explícita/bodyTextnull, usage/eventos/recibo/totais e ack accepted-delivered específico ainda pendentes; não usarFAILED131026 ou tornarCRM opcional. Jobqueued suspenso e guarda fechada, inventário dos dez tenants não é drain. Nenhum apply/ack/reenvio/abertura/restart/instalação/deploy, build/suíte ou binding alterado. Frontend3227 PENDING/NOT DEPLOYED; demais frentes e históricos preservados.

**Guarda37 — fronteira webhook/CRM LOCAL FIX VERIFIED / NOT DEPLOYED (10/10).** [Revisão de162, causa, código e provas](reviews/automation-freeform-window-release-af26/guard37-local-proposal-20261010/WEBHOOK_CRM_BOUNDARY_20261010.md): status Meta agora durável/monotônico antes da materialização CRM; falha registrada separadamente, sem fabricar Conversation/runtime/janela, cleanup ou continuidade. 5 provas novas Node20/PostgreSQL PASS, 2 regressões diretamente afetadas PASS, API noEmit PASS; demais provas anteriores reutilizadas sem atribuição ao caso novo. [Checklist único .6](reviews/automation-freeform-window-release-af26/guard37-local-proposal-20261010/POSITION6_RECOVERY_CHECKLIST.md): proveniência original, CRM/disposição, usage/evento, totais e ack próprio ainda bloqueiam apply/ack. Sem SSH/leitura atual, provider real, envio, política ou deploy; frontend3227 e históricos preservados. CSV/Syer/internacionais/CRA-PR/multilote/AUTO separados.

**Guarda37 — prevenção implementada LOCALMENTE / FOR REVIEW / NOT DEPLOYED (10/10).** [Relatório único, testes, hashes e limites](reviews/automation-freeform-window-release-af26/guard37-local-proposal-20261010/IMPLEMENTATION_20261010.md): resultado aceito é gravado/relido antes de CRM; falha CRM mantém Outbound, suspensão, tarefa persisting e fechamento. 10 provas Node20/PostgreSQL PASS e predicado frontend PASS; shared helper, worker, schema e identidade internacional não mudaram. Verificador/recibo específico .6 é somente offline/transport_result_only/ackEligible=false; proveniência original e CRM/usage/read models/ack de sucesso ainda precisam revisão. Cinco existentes e cinco pendentes não autorizam retomada. Frontend3227 é tecnicamente separável com baseline nova verdadeira closed37/tarefa preservada; baseline36 não foi editada, nenhuma preparação/política nova montada. Estado VPS não reatestado; sem SSH, mutação, envio, ack, abertura ou deploy. CSV/Syer, internacionais, CRA-PR, multilote/AUTO e reparo setembro CLOSED permanecem separados.

**Guarda37 — reprodução local concluída / proposta preventiva e recuperação específica para revisão (10/10).** [Resultado e contratos](reviews/automation-freeform-window-release-af26/guard37-local-proposal-20261010/README.md): Node20/PostgreSQL isolado, uma aceitação simulada → erro CRM real → zero Outbound → provider persisting → guarda fechada/job queued sem lease. A preservação internacional no envio de 25/09 não revogou CRM/importação BR-only de 19/09. Proposto persistir/verificar resultado antes de CRM, mantendo suspensão; suporte internacional exige decisão separada. Plano .6 accepted/delivered sem reenvio, com timestamps/proveniência/idempotência e lacunas explícitas; não reutiliza FAILED131026. Ack de sucesso ainda exige verificador/semântica próprios. Cinco Outbounds e cinco pendentes preservados; job queued/lote running não podem ser retomados/terminalizados por esta recuperação. Sem código funcional, mutação produtiva, ack, abertura ou alteração de bindings frontend.

**Guarda37 — causa identificada; auditoria READ ONLY, sem recuperação (10/10).** [Relatório, IDs, linha do tempo, SQL e inventário](reviews/automation-freeform-window-release-af26/guard37-provider-audit-20261010/README.md): demo/out.15, sexto envio internacional aceito pela Meta, com webhook delivered órfão. A materialização CRM restrita ao Brasil lançou `Invalid WhatsApp number` após aceitação. Cinco outbounds SENT/delivered persistidos, sexto sem Outbound e cinco posteriores não submetidos. Tarefa filha `provider/persisting` retida; término do runner fechou a geração37. API a26 segue viva; a guarda bloqueia campanhas globalmente, sem comprovar indisponibilidade do atendimento. Inventário dos dez tenants: um job queued e um lote running em demo; lease de tenant expirado e 17 jobs terminais com metadados de lease expirados. Não é certificado de drain. Recuperação out.13/FAILED131026 não se aplica automaticamente à posição .6 com entrega reportada e sem recibo. Próximo passo: reprodução local e plano específico revisável. Frontend3227 permanece impedido, gate falso e políticas preservadas; CSV e demais aceites separados.

**Frontend3227 — POLICY INSTALLATION BLOCKED / DENY BEFORE INSTALLATION (10/10,17:36Fortaleza).** [Resultado no relatório único](reviews/automation-freeform-window-release-af26/frontend-3227b2d7-prepared-20261009/README.md#continuidade-autorizada-para-políticapreflight--10102026-interrompida-antes-da-instalação): branch sincronizada7c5430a9; manifests e composição conferidos até `guard_drift`. Baseline aberta36/tasks{} diverge da guarda atual **fechada37/uma tarefa provider**, audit `uncertain_close/unfinished_child_requires_review` em12:40Fortaleza. Instalação não executada; política antiga6087… e permanente24a… preservadas, leitores atuais duas amostras consistentes; gatefalse, sem intents/capturas. Frontendfa60/APIa26/workerafbb mesmas identidades/restart0. Cron/boot posteriores ao ponto de recusa não reatestados. Próximo passo é revisar por leitura a tarefa e o fechamento antes de qualquer composição nova; não adaptar bindings, abrir guarda, reenviar ou reconciliar automaticamente. Preflight proposto NOT EXERCISED / NOT DEPLOYED. CSV e aceites anteriores permanecem separados.

**Frontend3227 — CONTINUITY AUDIT PASS / WINDOW-POLICY PREFLIGHT PENDING / NOT DEPLOYED (10/10).** [Relatório único de continuidade](reviews/automation-freeform-window-release-af26/frontend-3227b2d7-prepared-20261009/README.md#auditoria-de-continuidade--10102026-referência-6a354ceb): referência6a354ceb e worktree reconciliadas; leitura nova11:20Fortaleza/14:20UTC, manifests/tar/políticas/bindings/identidades/controles íntegros, gatefalse. Frontendfa60 corrigido é o retorno efetivo; APIa26/workerafbb intactos/restart0. Duas amostras atuais consistentes sob políticas instaladas não atestam a proposta. Próxima decisão somente instalação da política de janela + preflight preparatório; política permanente após owner/pré-promoção continua dependência explícita, sem instalação agora. Instalação parcial, timeout/intent consumido e ledger incompleto exigem diagnóstico/estado real, sem replay/start repetido/bypass. Nenhum rebuild, suíte repetida, stop/start/deploy/save/envio/mutação produtiva. Históricos/aceites e pendências multilote/AUTO/CRA-PR preservados.

**Frontend fa60 corrigido — DEPLOYED TECHNICALLY / OWNER READ AND LAYOUT CONFIRMED (07/10).** [Execução e limites](reviews/automation-freeform-window-release-af26/FRONTEND_FA60F0F6_PREPARED_2026-10-07.md#implantação-do-frontend-corrigido-concluída--0710-fortaleza): tar17bd exato, preflights/saída nova/start único/prontidão PASS; CSS efetivamente servido em localhost/público e owner confirmou layout/sessão/Inbox/CRM/Campanhas. Stop20:50:15Fortaleza, prontidão20:51:22,758 (limite observado68s), promoção/save depois da confirmação, conclusão20:57:37. Supervisão permanente PASS; saved/fallbackfb058238… iguais, gatefalse. API/workerafbb e daemon mesmosPIDs/restart0, guarda aberta33/scheduler habilitado/boot preservados. Geração234000 agora permanente: não remover enquanto referenciada. Sem envio/reparo/reboot produtivo; dois erros auxiliares de consolidação documentados, sem repetir partidas. Aceites e pendências funcionais independentes permanecem.

**Frontend — observador permanente INSTALLED VERIFIED / LIVE READ PASS (07/10).** [Relatório único e integração concreta](reviews/automation-freeform-window-release-af26/FRONTEND_FA60F0F6_PREPARED_2026-10-07.md#instalação-permanente-conferida-e-integração-final--0710): instalação restrita autorizada/visudo/hashes PASS, duas amostras reais completas154/154; 9f e API/worker afbb, scripts ativos e saved/fallback preservados. Nova integração234000 gatefalse, tar corrigido17bd e retorno íntegros; política de janela6087 apenas proposta. Preflight da futura janela NÃO EXECUTADO, depende de revisão/autorização própria. Sem restart/build/envio ou alteração de histórico; provas anteriores reutilizadas com seus limites. Esta nota substitui somente o status das propostas anteriores, mantendo seus registros históricos e aceites independentes.

**Frontend — recuperação automática pós-reboot, LOCAL OPERATIONAL VALIDATED / DELEGATION REVIEW REQUIRED / NOT INSTALLED (07/10).** [Relatório único](reviews/automation-freeform-window-release-af26/FRONTEND_FA60F0F6_PREPARED_2026-10-07.md#supervisão-permanente-após-reboot--proposta-isolada): janela e supervisão separadas; leitor permanente proposto tem escopo root estático de artefatos/PM2 e descobre boot/daemon atuais, sem rebind ou reutilização de PIDs/inodes antigos. PM2/Node/Next reais save/resurrect/daemon novo e retorno9f PASS; boot/permissão injetados, sobrevivente real nega. Uma chamada sudo literal adicional somente leitura requer aprovação; helper/sudoers de janela intocados. Substitui requisito manual da preparação43ff para futura composição, não altera staging9f ativo. Tar17bd/provas funcionais preservados, sem rebuild/install/janela. Revisão da delegação precede integração/preflight/janela; demais aceites/históricos mantidos.

**Frontend fa60 corrigido — PACKAGE STAGED / PREPARED FOR POLICY REVIEW / NOT DEPLOYED (07/10).** [Relatório único](reviews/automation-freeform-window-release-af26/FRONTEND_FA60F0F6_PREPARED_2026-10-07.md#preparação-com-tar-corrigido-e-binding-permanente--0710): tar17bd íntegro na VPS/extração completa/CSS PASS, sem rebuild ou partida;9f/afbb e saved preservados. Composição real PM2/Node/Next ida/retorno/save/resurrect com daemon novo ensaiada; boot e permissão injetados, instalação root simulada. Inventário local completo no mesmo boot permite recuperação automática; binding root antigo nega. Após reboot, exige política explicitamente renovada e leitura root atual, sem atualização silenciosa ou sudo novo. Política nova proposta/hash10fa, gatesfalse; depende de revisão/autorização de instalação e preflight final antes de qualquer janela. Não remover staging/controle/journals enquanto referenciados; sobrevivente/incompleto continuam negados. Aceites/frentes independentes e históricos preservados.

**Frontend9f — DEPLOYED TECHNICALLY / OWNER READ CHECK CONFIRMED (07/10).** [Resultado no relatório único](reviews/automation-freeform-window-release-af26/FRONTEND_9F4CBE0F_PREPARED_2026-10-06.md): stop12:44:09UTC, prontidão12:44:45.979UTC, limite superior observado36,965s. Partida única do9f, ausência af26 comprovada; owner confirmou sessão/Inbox/CRM/campanhas antes da promoção permanente, sem nova partida. Saved/fallback iguais, gatefalse; API afbb/worker mínimo/daemon mesmas identidades, restart0; guarda aberta33, scheduler/cron/boot/DB/auth preservados. Sem falha/retorno/envio/reparo. Pasta operacional agora referenciada por active/saved/fallback: preservação obrigatória. Conferência de leitura não equivale a prova produtiva de processamento/agendamento; agrupamento, audiência dinâmica, agendamento real, contingência Auto e CRA-PR permanecem pendentes. Registros de preparação abaixo são históricos.

**Frontend9f — REMOTE STAGING COMPLETE / NOT DEPLOYED (07/10).** [Relatório único, hashes e comandos finais](reviews/automation-freeform-window-release-af26/FRONTEND_9F4CBE0F_PREPARED_2026-10-06.md): sete scripts8da transferidos com originais arquivados, tar/candidato/retorno/configs conferidos; baseline af26/afbb/worker mínimo e daemon preservados, sem reinícios. Gatefalse e captura de leitura nova arquivada, sem intents/controls consumidos. Seletores atuais de limpeza não alcançam a geração; preservar pasta inteira enquanto active/saved/fallback referenciar launcher/control/journals. Próxima autorização é exclusivamente frontend, sem API/worker/guarda/scheduler. Sem rebuild ou suítes repetidas. Agrupamento, audiência dinâmica, agendamento real, contingência Auto e CRA-PR continuam pendentes; aceites avulso/CRM estático imediato/CSV individual imediato mantêm seus limites.

**Supervisão permanente frontend — 07/10, LOCAL VALIDATED / NOT DEPLOYED.** [Relatório único e comandos](reviews/automation-freeform-window-release-af26/FRONTEND_9F4CBE0F_PREPARED_2026-10-06.md): janela tem intent único e morte do Next termina o launcher/PM2 stopped, sem retry; promoção explícita fecha o gate e permite autorestart/resurrect com evidências e nonces novos. Candidato e af26 reais ensaiados com PM2 6.0.14/Node20.20.0, mesmo dump, morte do Next após prontidão e ausência final; sobrevivente/repetição continuam negados. Diretório da geração referenciado por active/saved/fallback deve ser preservado permanentemente. Na revisão local anterior não houve rebuild ou transferência; staging remoto concluído conforme nota acima, sem troca produtiva; aceites/pendências funcionais independentes preservados.

**Revisão operacional frontend 07/10 — LOCAL OPERATIONAL VALIDATED / NOT DEPLOYED.** [Relatório único atualizado](reviews/automation-freeform-window-release-af26/FRONTEND_9F4CBE0F_PREPARED_2026-10-06.md): identidade registrada antes de liberar Next, saída precoce com retorno comprovado no laboratório, descendente/socket sobrevivente nega; prontidão30s/30 tentativas e logs privados, sem repetir starts. Node20.20.0/PM2 6.0.14 reais; backend/retorno af26 em fixtures, tar Next exato também ensaiado. Tar/build preservados; na revisão histórica os scripts estavam apenas locais; staging remoto atualizado conforme nota acima, gates falsos. Nenhuma janela/alteração produtiva. Aceites e pendências funcionais independentes permanecem como registrados.

**Preparação somente frontend Campanhas — 06/10/2026:** [pacote exato e comandos revisáveis](reviews/automation-freeform-window-release-af26/FRONTEND_9F4CBE0F_PREPARED_2026-10-06.md), PREPARED FOR REVIEW / NOT DEPLOYED. API afbb e worker mínimo reativo permanecem ativos; não usar stop-pair/guarda/nft/cron/boot ou scripts genéricos de deploy para esta atualização. Candidato9f/retornoaf26 isolados, assets antigos preservados, gates falsos; swap futuro exige identidade/saída comprovada do frontend e confirmação owner separada. Nenhum envio/reparo/migration nesta preparação.

**Novo 6683 — `879cb1fa` FOR REVIEW / NOT DEPLOYED.** [Revisão temporal, dry-run e pacote API/retorno](reviews/automation-freeform-window-release-af26/INCIDENT_6683_REVIEW_CLOSE_2026-10-03.md). A API af26, o worker mínimo e o frontend seguem ativos; a release nova foi montada apenas em diretório isolado. Na próxima janela, usar preparação V4 fresca, preservar frontend e coordenar API/worker; os modos consumidos da janela anterior não podem ser reutilizados. Não houve reparo de dados.

**Observação dirigida após af26:** [matriz de aceite e caso demo final 6683](reviews/automation-freeform-window-release-af26/POST_DEPLOY_ACCEPTANCE_2026-10-03.md). Estado técnico estável não valida os três transportes. A conversa nova 6683 teve claim permitido por janela aberta no runtime sem inbound persistido; o protocolo falhou na Meta (131047) embora o evento interno diga `notice.sent`. Não reenviar nem alterar runtime sem análise própria. Reparo histórico 6683 permanece CLOSED.

**Estado vigente 03/10 UTC — af26 V4 DEPLOYED TECHNICALLY / OWNER VALIDATION PENDING.** [Execução sanitizada e limites](reviews/automation-freeform-window-release-af26/V4_WINDOW_RESULT_2026-10-03.md). API/frontend af26 e worker mínimo af26 são os componentes ativos; frontend BUILD_ID, health/DB, worker, sessões e Inbox/CRM em leitura passaram. Guarda aberta geração 13, scheduler habilitado, crons/boot e saved/fallback restaurados. Nenhum envio foi provocado para validar. Aceite funcional af26, META_CLOUD puro e híbrido API→WEB seguem pendentes. Registros de V3 bloqueado e preflight V4 abaixo são históricos, não o estado implantado atual.

**Gate histórico de 02/10: V3 BLOQUEADO / NOT DEPLOYED.** [Leitura factual e atribuição através do docker-proxy](reviews/automation-freeform-window-release-af26/DOCKER_PROXY_ATTRIBUTION_AUDIT_2026-10-02.md). O confronto direto PostgreSQL↔API falha na topologia atual; não executar comandos históricos de janela nem interpretar o pacote V3 local como pronto. Requer decisão sobre a propriedade exigida pelo gate, mecanismo observável com permissões delimitadas e ensaio Docker representativo antes de nova preparação. Os comandos e estados históricos abaixo preservam seu contexto temporal.

**Preparacao 01/10 — release af26f48a freeform window: PREPARED FOR REVIEW / NOT DEPLOYED.** [Pacote revisavel, manifesto, patch API/frontend e composicao worker minima](reviews/automation-freeform-window-release-af26/README.md). Leitura produtiva confirmou PM2 usando releases isoladas: frontend `ba66c241`, API `b66bb89a`, worker minimo `bf5+f06+912+b66`; o checkout do repo em producao estava em `5ee2de6b`, portanto nao deve ser usado como prova do artefato ativo. Preparacao agora detalha diretorios isolados, origem exata das fontes, montagem/build de API, frontend e worker minimo sem depender do checkout produtivo `5ee2de6b`, comandos de contencao/parada/inicio sequencial/retorno, restauracao de supervisao e reconciliacao BUILD_ID + worker 92/93. Hashes executaveis finais continuam pendentes ate build futuro autorizado. Nao houve troca de release, restart, ativacao, migration, provider call ou envio real. META_CLOUD puro e hibrido API->WEB continuam pendentes.

**Atualização operacional 30/09, 02:30 UTC — DEPLOYED TECHNICALLY / INCIDENT OPEN.** [Registro sanitizado da troca API b66bb89a + worker mínimo, frontend preservado](saas/AUTOMATION_RUNTIME_FIX_ROLLOUT_2026-09-30.md). Guarda reaberta geração 9; sessões e atendimento verificados. Avanço real do fluxo em Syer via WEB_SESSION comprovado às 02:32–02:33 UTC por outbounds SENT, nó menu persistido e confirmação visual do owner; META_CLOUD puro e híbrido API→WEB seguem pendentes.

## Preparação operacional do incidente 91230f88 — 30/09/2026

**PREPARED / NOT DEPLOYED / INCIDENT OPEN.** [Plano de troca somente API/worker, hashes, backup fresco, restauração local e gates](saas/AUTOMATION_RUNTIME_FIX_PREPARATION_2026-09-30.md). Releases privadas b66bb89a e worker mínimo bf5+f06+912+b66; frontend ba66 preservado. Nenhuma contenção, parada, mudança de guarda ou ativação executada. Teste funcional do avanço do fluxo em Syer permanece gate de recuperação. As seções históricas abaixo registram o estado nas respectivas datas.

## Incidente prioritário 91230f88 — correção local para revisão, 29/09/2026

**INCIDENT OPEN IN PRODUCTION / FIX LOCAL VALIDATED / NOT DEPLOYED.** [Matriz de todos os tenants, causa, testes e retorno compatível](saas/AUTOMATION_RUNTIME_SELF_WRITE_INCIDENT_2026-09-29.md). Syer: escrita própria de atividade outbound invalidava updatedAt e impedia persistir avanço. Tendência: conflito correlacionado com encaminhamento humano legítimo; não atribuído ao loop. Demais tenants inventariados, sem prova de ocorrência no período observado.

Fix mantém CAS e reconhece apenas a escrita própria condicional; protege tenant/identidade, ciclo, inbound e transições humanas. API inclui projeção de identidade Meta condicional; worker exclusivamente mínimo bf5+f06+912 com patch específico de quatro fontes. 15 casos integrados API; caso Meta/IA revalidado após projeção; 14 aplicáveis no worker Node20.20.0, também nos compilados; 89 regressões afetadas PASS, sem somar reexecuções. Backend tipado PASS; worker --noCheck PASS e 13 diagnósticos --noEmit idênticos à base, sem aprovação integral de tipos.

Publicação somente para auditoria; nenhum restart, alteração da guarda/scheduler, fluxo, transporte ou runtime produtivo. Retornos estreito/abrangente e riscos estão no incidente, sem execução autorizada nesta etapa. Recuperação exige avanço persistido após publicação controlada, não health. Chave Automação permanece ligada somente em Syer; sua validação não equivale a CRA. Resposta automática tardia e frente maior pendente continuam separadas. Campanhas/CRA aguardam owner; SECULT e DB-only encerradas; inatividade Guia pausada;6683 CLOSED.


## Syer — acompanhamento ativado, validação parcial; regressão de consentimento separada

**ACTIVATED IN SYER / FUNCTIONAL VALIDATION PARTIAL.** [Setter/auditoria, verificações e limitações](saas/SYER_AUTOMATION_ACTIVATION_2026-09-29.md). Tenant canônico `syer-rodrigues`, confirmado pelo owner; sequência ADMIN true→false→true, estado final ligado somente nele. Owner relatou leitura por papel e filtro SUPERVISOR zerado na revogação; anexos restritos, novos eventos realtime e intervenções reais não receberam PASS produtivo. Nenhum atendimento assumido/encaminhado; leitura preservou fingerprint de controle. Demais tenants não ativados. Não equivale a aceite CRA-PR.

**Regressão a corrigir separadamente:** no WEB_SESSION, atividade do próprio outbound altera updatedAt e invalida o token91230f88; persistência do avanço do chatbot é rejeitada e o consentimento reinicia. Código/logs/estado do caso autorizado + reprodução sintética em DB local confirmaram o mecanismo. Não corrigir removendo proteção humana nem trocar pelo worker completo; requer ajuste dirigido e cobertura do outbound simulado/conflitos nos artefatos API/worker mínimo. Nenhuma correção ou deploy nesta etapa. Limitação de resposta automática tardia permanece distinta. Campanhas/CRA aguardam owner; SECULT encerrada; inatividade Guia pausada;6683 CLOSED.

## Release Automação implantada — 29/09/2026, Fortaleza

**DEPLOYED / AUTOMATION NOT ACTIVATED.** [Execução, versões, backup, retorno e limites](saas/AUTOMATION_ROLLOUT_2026-09-29.md). API/frontend ba66c241 (funcional d06a92b8); worker exclusivamente mínimo bf5+f06+backport91230f88. Correção912 separada do acompanhamento BOT. `allowAutomationConversationsInInbox` permanece false/ausente em todos; nenhum tenant ativado. Owner confirmou sessão, Inbox, CRM e configurações em leitura; não equivale a aceite funcional de Automação. Contenção de 3min20; processos antigos/sockets ausentes e barreira DB/locks zero antes do sucessor. Sessões preservaram 3 connected / 1 disconnected / 1 pending; risco residual inbound/outbound/auth não é eliminado por essa contagem. Guarda reaberta na geração 7, scheduler preservado e dois ciclos naturais observados; crons/boot/saved/fallback restaurados com referências compatíveis. Registros anteriores de NOT DEPLOYED permanecem históricos, superados apenas quanto ao deploy técnico por esta entrada.

Escritores compatíveis e retorno a3/minimal-f06 preservados; rollback não restaura DB/auth antigos nem autoriza dois proprietários. Respostas automáticas em andamento seguem limitação separada, sem promessa de cancelamento. Campanhas/CRA aguardam validação funcional do owner; ativação/aceite BOT posteriores; SECULT encerrada/aceita; inatividade no Guia pausada; DB-only encerrada; 6683 CLOSED.

## Automação — preparação remota e retorno verificados

**PUBLISHED FOR REVIEW / NOT DEPLOYED.** [Evidências de releases, backup fresco e restauração isolada](saas/AUTOMATION_RELEASE_PREPARATION_2026-09-29.md). Pacote API/frontend ba66c241 mantido; worker mínimo f06+912 separado. Configs privadas resolvidas sem início; restore local PASS/60 checksums, banco temporário removido. Guarda/scheduler/processos/sessões preservados; Automação desligada. Pendem início/fim da janela, horizonte de escalonamento/retorno e aceite do risco residual inbound/outbound/auth. Entradas históricas abaixo preservam o estado de cada etapa; não representam pendência atual de preparar releases/backup. Campanhas/CRA aguardam owner; SECULT encerrada.

## Preparação da release Automação ba66c241 — sem execução

[Plano, artefatos, preflight e limites](saas/AUTOMATION_RELEASE_PLAN_2026-09-29.md) e [comandos revisáveis](saas/AUTOMATION_RELEASE_COMMANDS_2026-09-29.md). PUBLISHED FOR REVIEW / NOT DEPLOYED. API/frontend fixos em ba66c241; worker mínimo f06 + backport91230f88. Artefatos preparados apenas localmente; falta preparação remota/configs, backup fresco/restauração e aprovação da janela com risco residual WEB_SESSION. Última parada executada não comprovou drain worker; ownership/processos/sockets devem ser verificados antes de sucessor. Guarda atual aberta não é drained. Opt-in Automação permanecerá desligado; ativação/aceite separados.

## Fechamento SECULT — confirmação do owner em 29/09/2026

**DEPLOYED / CLIENT ACCEPTED.** Deifson informou: “SECULT aprovou. Já está
utilizando a nova atualização.” Ativação e uso registrados conforme esse relato;
não foram informados horário, executor da ativação ou casos específicos exercitados.
A confirmação do cliente é distinta das verificações técnicas e testes locais.
A pendência de ativação registrada na janela anterior fica superada pelo relato,
sem reescrever sua evidência histórica ou afirmar nova leitura técnica da chave.
Permanecem os limites de shutdown, tipagem e rollback documentados; escritores
compatíveis são necessários para preservar a garantia de concorrência.
Campanhas/CRA aguardam validação funcional do owner; inatividade no Guia pausada;
DB-only encerrada/aceita; 6683 CLOSED. Telegram e DELIVERED/READ separados.


## Estado vigente — janela SECULT de 29/09/2026

**Código implantado; ativação SECULT e aceite funcional pendentes.** API/frontend
`a3d16d4b`, worker mínimo `bf5f1d76` + cinco fontes `f06d49cb` (pacote `042e386a`).
[Fechamento técnico, backup, horários, limites e retorno](saas/SECULT_ROLLOUT_2026-09-29.md).
Campanhas reabertas (geração 5), scheduler observado; Inbox/CRM confirmados pelo
owner. Chave permanece desligada em todos os tenants: falta sessão legítima ou
grant de suporte existente para o setter SECULT. Sem contorno de RBAC/SQL.
Compatibilidade de API/worker/scripts deve ser mantida; retorno a escritores antigos
perde a garantia concorrente. Primeira interrupção autorizada não comprova drain
retroativo do worker. Campanhas/CRA aguardam validação funcional do owner; DB-only
encerrada, inatividade no Guia pausada, 6683 CLOSED. Registros abaixo preservam
o escopo e o estado histórico de cada etapa.


> Atualização local 29/09 — [alternativa mínima e parada do worker](saas/SECULT_DEPLOY_PLAN_2026-09-29.md):
> base bf5f1d76 reproduz o bundle alcançável; backport de cinco fontes f06 recomendado
> para revisão. G1/G2 continuam abertos. 45+30 testes PASS; quatro reproduções mostram
> shutdown inseguro, não drain aprovado. Proposta de correção separada não implementada.
> Rollback antigo perde garantia de concorrência; revogar em código SECULT exige
> escritores compatíveis. Produção intacta, SECULT não ativada; campanhas/CRA aguardam owner.


## Inicio efetivo e ensaio operacional local — 2026-09-26

Status: LOCAL ROLLOUT / SUSPENDED ROLLBACK REHEARSED; NOT DEPLOYED / OWNER UI PENDING.
Base `fedef1e1965aa6a1e53222426c6b55424e2d83fa`, branch
`review/campaign-recovery-20260926`; historico e owner PASS anteriores preservados.

- `effectiveStartedAt` passa a ser preenchido somente quando nulo, sob lock do
  grupo; materializacao/recuperacao preservam o valor. `job.startedAt` continua
  informando o claim do lote/tentativa, ja exposto pela API/UI. Nenhum ajuste visual.
- Testes focados: os dois casos reproduziram a sobrescrita e passaram apos a
  correcao (2/2); fila afetada 8/8; build backend PASS. Sem repetir suites amplas,
  build frontend ou smokes anteriores.
- Cluster PostgreSQL local separado, `127.0.0.1:55434/re7_rollout_local`, com
  ambiente limpo e provider em memoria. Base `6d664d0b`: 59 migrations e tres
  campanhas antigas; migrate deploy aplicou apenas a fila, totalizando 60.
  Campanhas antigas preservadas; checksum da migration conferido com Prisma.
- Falha injetada apos migration/antes da ativacao: runtime sem permissao de
  campanhas e admissao fechada; zero jobs criados. Banco migrado foi mantido.
- Codigo novo processou fila; pausa drenou uma chamada com aceite conhecido.
  Morte de outro processo apos submissao, antes da resposta local, deixou uma
  pendencia explicitamente marcada needs_review. Snapshot sem filhos sobreviveu
  a interrupcao e alteracao do CRM.
- Rollback ensaiado **com processamento suspenso**, ingresso HTTP em manutencao
  e papel runtime sem privilegios nas tabelas. Runner real de `6d664d0b` recebeu
  permission denied; zero provider. Jobs, leases, snapshots, resultados e demais
  registros permaneceram iguais no intervalo do rollback. Health nao foi usado
  como prova de rollback funcional; o backend antigo nao e uma alternativa de envio.
- Retorno exclusivo ao novo codigo: dois grupos completos, quatro aceites
  conhecidos, uma submissao incerta ainda retida e zero duplicacoes entre cinco
  submissoes simuladas. Todos os jobs/eventos anteriores e o inicio original dos
  grupos foram preservados. Admissao permaneceu fechada ao final do ensaio.
- Drift: 16 objetos do inventario anterior identicos antes/depois; diff somente
  leitura igual ao ja registrado, sem diferenca nas tabelas de fila. Nao impede
  este rollout aditivo, desde que defaults/indices/constraints sejam preservados.
  Nenhuma correcao incidental de drift, down migration, reset ou limpeza de filas.

Procedimento, condicoes de parada e limites: RUNBOOK_WHATSAPP_AGENT.md, secao
"Ensaio operacional local da fila — procedimento executado". Evidencias preservadas
em `local-evidence/recovery/rollout-local/`, incluindo tres dumps e manifestos.
Pendencias para decisao: validar cercas/permissoes e parada de todas as instancias
no ambiente alvo, reconciliacao de pendencias incertas, owner UI e aceite CRA.
Nao houve deploy, banco/provider de producao ou envio real. DELIVERED/READ →
Conversation/HUMAN/WAITING continua separado; reparo 6683 CLOSED.

## Correcoes da revisao Git 109c9f15 — 2026-09-26

Status: LOCAL REVIEW FIXES VALIDATED / NOT DEPLOYED / OWNER UI PENDING.
Base desta correcao: `109c9f1544003750d29930bd7b10ce6a4cf50c03`, branch
`review/campaign-recovery-20260926`. Historico `6d664d0b` e owner PASS do lote
anterior preservados; esta nota nao concede aceite CRA nem prontidao para deploy.

- CSV: grupo, filhos, seeds e resultado idempotente na mesma transacao; falha
  no segundo filho deixa zero registros. Retries concorrentes produzem um unico
  conjunto. Chave vinculada ao tenant/operacao/hash do payload; conflito = 409.
- Estados: locks de grupo preservam pausa/cancelamento/needs_review; falha
  impeditiva bloqueia os proximos lotes, inclusive rejeicao recebida apos pausa.
  Cancelado nao vira completed. Dinamica sem filhos pode pausar/retomar.
- Fila: tenants ocupados excluidos antes do limite; um candidato por tenant,
  ate 20 por consulta (teto 100), rechecado sob lock. Caso com 25 jobs antigos de
  A nao impede B; exclusividade e continuidade contra avulsa/test-send mantidas.
- Dinamica: recuperacao reutiliza o snapshot persistido, mesmo com CRM alterado;
  filhos e enqueue sao atomicos. Recuperacao do intervalo legado filhos/sem jobs
  nao duplica filhos nem snapshot. Apenas controlador sem provider recupera lease.
- UI/API: Enviar conjunto agora exige confirmacao e RBAC, entra na mesma fila,
  e retry nao duplica jobs. Agendamento futuro permanece sem antecipacao.

Validacao final: 13/13 focados novos; suites afetadas de campanhas **198/198**
(fila 8, runner 10, revisao 11, rotas 128, importacao 7, exclusao 5, UI 29),
compostas por 188 casos fora do runner e sua repeticao final 10/10; Webchat 17/17.
Builds backend/frontend PASS. Smoke visual de confirmar/recusar envio agregado,
pausa, retomada e cancelamento PASS; zero outbound/provider. Nao houve repeticao
da bateria visual anterior. Evidencia local: `local-evidence/recovery/review-fixes/`.

A primeira suite teve interrupcao SIGKILL do runner durante diagnostico de I/O
JSON; as demais suites passaram. A repeticao isolada revelou dois testes longos
com relogio congelado emitindo leases vencidas. Fixture corrigida para tempo
atual, sem reduzir audiencia, assertions ou concorrencia; runner final 10/10.
O build expos tipagem incorreta da nova fixture CSV e filtro startsWith sobre
UUID no Webchat, ja presente na base. Corrigidos TemplateContext e intervalo UUID
equivalente; quatro testes de protocolo e limites SQL locais validados. O mock
da auditoria compartilhada foi isolado (antes tentava gravar tenant_a no DB real).
O registro historico de build PASS nao substitui esta nova evidencia compilada.

Schema/SQL migration sem alteracao; DB local `re7_recovery_audit` com 60 migrations
concluidas e zero pendentes. Nenhum migrate adicional, db push/reset ou correcao
de drift historico. Continuam pendentes ensaio operacional de rollout/rollback,
owner UI, aceite CRA e drift residual inventariado no runbook. CI de push apenas
main/develop; bloqueio Vercel da branch de revisao preservado. Sem deploy/DB de
producao/provider real. DELIVERED/READ → Conversation/HUMAN/WAITING continua
separada e sem alteracao funcional; reparo 6683 CLOSED.

## Persistencia para revisao Git — 2026-09-26

Status desta frente: TECHNICAL LOCAL VALIDATED / NOT DEPLOYED / OWNER UI PENDING.
Branch dedicada `review/campaign-recovery-20260926`, com parent/base `6d664d0b9ffcf52f5315bfeca96f0622f4d25792`.
A base de reconstrucao foi `5d925973`; os 80 acrescimos documentais de `6d664d0b`
foram conferidos e seu historico permanece ancestral. O owner PASS do lote anterior
(normalizacao/settings/contraste, head funcional `5ee2de6b`) continua OWNER VALIDATED / CLOSED;
nao se estende automaticamente a esta frente de lotes/fila.

Delta e fontes foram arquivados antes da troca de branch. Reaplicacao sobre `6d664d0b`
restaurou os mesmos 23 arquivos, com hashes conferidos; nao houve conflito funcional,
reset/clean ou alteracao da branch original. Implementacao, testes, schema/migration,
os quatro docs e este runbook compoem o escopo; .data, evidencias, dumps, arquivos
compactados, credenciais e fixtures de ambiente ficam fora do Git.

As 18 anotacoes UUID correspondem a tipos SQL ja existentes, sem ALTER TYPE novo.
O inventario por objeto e impacto do drift residual anterior esta no
`docs/RUNBOOK_WHATSAPP_AGENT.md`, secao "Drift historico residual — revisao da fila".
Nenhum desses defaults, indices ou nomes foi corrigido nesta frente.

Validacao preservada: fila/runner/rotas 144/144, apoio 41/41 e rechecagem dos casos
falhos 4/4; builds e Prisma validados anteriormente. Sem repeticao de testes/builds
porque esta persistencia nao muda comportamento funcional. Staging e whitespace
sao conferidos separadamente. CI versionada: push apenas main/develop; PR apenas
com destino main/develop. `vercel.json` bloqueia auto-deploy somente desta branch
via git.deploymentEnabled=false para seu nome exato; demais branches inalteradas.
Push de revisao nao autoriza merge, deploy, producao DB, provider ou envio real.

Pendencias: ensaio operacional de rollout/rollback, drift residual anterior,
owner UI e aceite CRA. Divergencia DELIVERED/READ → Conversation/HUMAN/WAITING
permanece separada e sem alteracao funcional. Reparo 6683 continua CLOSED.

## Objetivo
Padronizar o fluxo manual-controlado do `apps/whatsapp-agent` no modelo atual:

`LOCAL -> VALIDACAO LOCAL -> COMMIT/PUSH -> VPS -> VALIDACAO POS-DEPLOY`

Este runbook reflete o estado real atual do projeto:
- ambiente local funcional para backend, frontend e banco
- validacao real no `/app/login` e `/app/inbox`
- deploy manual na VPS
- rastreabilidade minima por branch, commit, horario e resultado

Runbooks complementares:
- `docs/onboarding.md`
- `docs/saas/runbook-re7.md`
- `docs/whatsapp-agent/05-env-and-smoke-test.md`
- `docs/whatsapp-agent/ops/DEPLOY_VPS_PM2.md`

## Principios operacionais
- Producao nao deve mais ser usada como ambiente principal de descoberta de bug.
- Todo patch deve passar por validacao local real antes da VPS.
- O deploy continua manual, mas deve ser rastreavel.
- Nao ha obrigatoriedade de PR formal ou CI/CD complexo neste momento.
- O commit exato que foi validado localmente deve ser o mesmo commit levado para a VPS.

## Fluxo padrao
1. Desenvolver e validar localmente.
2. Rodar build local.
3. Registrar o commit.
4. Fazer `push` da branch de trabalho.
5. Atualizar a VPS manualmente.
6. Validar health e fluxo funcional minimo na VPS.
7. Registrar o deploy.

## Pre-requisitos locais
- Repositorio local clonado
- PostgreSQL local funcional
- `.env` local configurado em `apps/whatsapp-agent/.env`
- backend local funcional
- frontend local funcional

Portas atuais de referencia:
- backend local: `http://127.0.0.1:3002`
- frontend local: `http://localhost:3000`

## Fluxo local

### 1) Backend local
```bash
cd /home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/apps/whatsapp-agent
npm ci --include=dev
npm run db:generate
npm run build
npm run dev
```

### 2) Frontend local
Em outro terminal:

```bash
cd /home/deifson-oliveira/DEIFSON/re7online-site/re7online-site
PORT=3000 NEXT_PUBLIC_WHATSAPP_AGENT_BASE_URL=http://127.0.0.1:3002 npm run dev
```

### 3) Validacao funcional local minima
Validar no navegador:
- `http://localhost:3000/app/login`
- `http://localhost:3000/app/inbox`

Checklist local minimo:
- login no `/app/login`
- inbox carregando
- fluxo do patch sendo validado localmente
- quando aplicavel, confirmar no banco o estado persistido
- quando o patch afetar realtime/inbox:
  - confirmar WebSocket `101 Switching Protocols` em `/agent-api/app/realtime`
    ou `/app/realtime`
  - validar ponto verde, som principal, som suave e fallback por polling
  - validar que trocar conversa nao recarrega nem desloca a lista lateral

Exemplo ja validado no estado atual:
- Sprint 37 validada localmente
- `CLOSED` persistindo com `closedAt` confirmado no banco

### 4) Build local final
```bash
cd /home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/apps/whatsapp-agent
npm run build

cd /home/deifson-oliveira/DEIFSON/re7online-site/re7online-site
npm run build
```

### 5) Commit e push
```bash
cd /home/deifson-oliveira/DEIFSON/re7online-site/re7online-site
git status
git add <arquivos>
git commit -m "<mensagem>"
git push origin flow-executor-quote-hardening
git rev-parse --short HEAD
```

Branch de trabalho atual:
- `flow-executor-quote-hardening`

### Deploy com commit fixo (recomendado)
Depois do `push` local, capture o commit exato validado:

```bash
cd /home/deifson-oliveira/DEIFSON/re7online-site/re7online-site
git rev-parse HEAD
git rev-parse --short HEAD
```

Na VPS, prefira deployar o commit exato:

```bash
cd /opt/re7online/site-re7online
git fetch origin
git checkout <commit_hash>
git rev-parse --short HEAD
```

Uso recomendado:
- branch continua sendo a referencia de trabalho
- commit exato passa a ser a referencia de deploy
- isso evita subir codigo diferente do que foi validado localmente

## Fluxo de deploy sem migration

### 1) Atualizar codigo na VPS
```bash
cd /opt/re7online/site-re7online
git fetch origin
git checkout flow-executor-quote-hardening
git pull --ff-only origin flow-executor-quote-hardening
git rev-parse --short HEAD
```

### 2) Reinstalar dependencias e rebuildar
```bash
cd /opt/re7online/site-re7online/apps/whatsapp-agent
npm ci --include=dev
npm run db:generate
npm run build
```

### 3) Reiniciar o processo
```bash
pm2 restart re7-whatsapp-agent --update-env
```

### 4) Validar rapidamente
```bash
curl -sS http://127.0.0.1:3001/health
pm2 status
lsof -i :3001
pm2 logs re7-whatsapp-agent --lines 50
```

## Fluxo de deploy com migration
Use este fluxo quando o patch incluir migration Prisma nova.

### 1) Atualizar codigo na VPS
```bash
cd /opt/re7online/site-re7online
git fetch origin
git checkout flow-executor-quote-hardening
git pull --ff-only origin flow-executor-quote-hardening
git rev-parse --short HEAD
```

### 2) Reinstalar dependencias, generate e migration
```bash
cd /opt/re7online/site-re7online/apps/whatsapp-agent
npm ci --include=dev
npm run db:generate
pg_dump -U wa_agent whatsapp_agent > backup_$(date +%F_%H%M).sql
npm run db:deploy
npm run build
```

### Backup antes de migration (obrigatorio em producao)
Antes de rodar `db:deploy`, gerar backup do banco:

```bash
cd /opt/re7online/site-re7online/apps/whatsapp-agent
pg_dump -U wa_agent whatsapp_agent > backup_$(date +%F_%H%M).sql
```

Objetivo:
- ter um ponto de recuperacao minimo antes de migration
- aumentar a seguranca operacional sem burocracia extra

### 3) Reiniciar o processo
```bash
pm2 restart re7-whatsapp-agent --update-env
```

### 4) Validar rapidamente
```bash
curl -sS http://127.0.0.1:3001/health
pm2 status
lsof -i :3001
pm2 logs re7-whatsapp-agent --lines 50
```

## Checklist pre-deploy
- patch validado localmente
- `/app/login` validado localmente
- `/app/inbox` validado localmente quando o patch afetar atendimento
- backend local buildando
- frontend local buildando quando houver alteracao em `src/`
- commit criado
- commit enviado para `origin`
- commit identificado (`git rev-parse --short HEAD`)
- definido se o patch tem migration ou nao

## Checklist pos-deploy
- `curl -sS http://127.0.0.1:3001/health`
- `pm2 logs re7-whatsapp-agent --lines 50`
- processo `re7-whatsapp-agent` ativo no PM2
- porta `3001` ativa
- sem processo duplicado escutando a mesma porta
- commit da VPS confere com o commit validado localmente
- smoke funcional minimo do patch em producao

Checks adicionais uteis:
```bash
pm2 status
curl -sS http://127.0.0.1:3001/admin/health -H "X-Admin-Token: $ADMIN_TOKEN"
lsof -i :3001
```

Quando o patch afetar realtime/inbox, validar tambem no navegador:
- `/app/inbox` abre sem erro;
- socket aparece como `101 Switching Protocols`;
- inbound em conversa nao ativa atualiza lista, ponto verde e som principal;
- inbound na conversa aberta atualiza timeline e toca som suave;
- polling continua atualizando estado se o socket cair.

## Retencao de midia local

Midias outbound enviadas pelo `/app/inbox` sao cacheadas localmente em
`apps/whatsapp-agent/.data/media/outbound/` para permitir reabertura,
download e reproducao futura sem depender apenas da URL temporaria da Meta.

Limpeza manual:

```bash
cd /opt/re7online/site-re7online/apps/whatsapp-agent
MEDIA_LOCAL_RETENTION_DAYS=7 npm run media:cleanup
```

Cron recomendado:

```cron
0 3 * * * cd /opt/re7online/site-re7online/apps/whatsapp-agent && MEDIA_LOCAL_RETENTION_DAYS=7 npm run media:cleanup >> /opt/re7online/site-re7online/apps/whatsapp-agent/.data/logs/media-cleanup.log 2>&1
```

Na VPS `converta.re7online.com`, essa entrada ja foi instalada no crontab do usuario
`deploy` em 2026-04-28, no commit `dbfcbd5`.

Verificacao:

```bash
crontab -l | grep media:cleanup
tail -n 50 /opt/re7online/site-re7online/apps/whatsapp-agent/.data/logs/media-cleanup.log
```

Reativar somente se a VPS/usuario `deploy` forem recriados, se o crontab for
removido, ou se a pasta de producao mudar.

Detalhes: `docs/whatsapp-agent/ops/MEDIA_RETENTION.md`.

## Retencao LGPD automatica

A retencao LGPD remove conversas antigas da operacao por soft delete e
anonimizacao, conforme `RetentionConfig.retentionDays` de cada tenant. A rotina
nao deve apagar fisicamente mensagens, eventos, metricas, leads ou contacts.

Execucao manual global, para todos os tenants existentes no banco no momento da
execucao:

```bash
cd /opt/re7online/site-re7online/apps/whatsapp-agent
npm run retention:run
```

Execucao manual limitada a um tenant especifico, quando necessario:

```bash
cd /opt/re7online/site-re7online/apps/whatsapp-agent
npm run retention:run -- --client-key justa-advocacia
```

Cron global instalado na VPS `converta.re7online.com`, no usuario `deploy`, em
2026-05-02. Ele roda para todos os tenants existentes no momento da execucao:

```cron
30 3 * * * cd /opt/re7online/site-re7online/apps/whatsapp-agent && npm run retention:run >> /opt/re7online/site-re7online/apps/whatsapp-agent/.data/logs/retention-global.log 2>&1
```

Verificacao:

```bash
crontab -l | grep retention
tail -n 50 /opt/re7online/site-re7online/apps/whatsapp-agent/.data/logs/retention-global.log
```

Reativar somente se a VPS/usuario `deploy` forem recriados, se o crontab for
removido, ou se a pasta de producao mudar. Para novos tenants, nao e necessario
criar nova linha de cron: a execucao global ja inclui todos os tenants com
`RetentionConfig` no banco, criando configuracao default de 90 dias quando ela
ainda nao existir.

Antes de usar retencao curta em producao, validar `RetentionConfig.retentionDays`
na tela `/app/settings/privacy`. Valores baixos, como 1 a 7 dias, podem retirar
conversas ativas da operacao.

## Retencao operacional de eventos

A tabela `Event` concentra auditoria e sinais operacionais. A limpeza de eventos
deve ser conservadora: medir primeiro, executar somente dry-run e apagar apenas
eventos classificados como `NOISE` quando o resultado for seguro.

Relatorio de armazenamento:

```bash
cd /opt/re7online/site-re7online/apps/whatsapp-agent
npm run --silent storage:report -- --json --include-events
```

Dry-run seguro, sem mutacao:

```bash
cd /opt/re7online/site-re7online/apps/whatsapp-agent
npm run --silent events:retention -- \
  --dry-run \
  --json \
  --include-noise \
  --noise-only \
  --days 30
```

Executar limpeza real somente se:

- `critical` for `0`;
- `operational` for `0`;
- `affectedEventNames` contiver apenas eventos descartaveis;
- health e DB estiverem OK;
- nao houver deploy instavel ou investigacao em andamento.

Limpeza real de ruido:

```bash
cd /opt/re7online/site-re7online/apps/whatsapp-agent
npm run --silent events:retention -- \
  --json \
  --include-noise \
  --noise-only \
  --days 30
```

Nao executar limpeza operacional sem decisao explicita. O script exige
`--confirm-operational` para execucao real com eventos `OPERATIONAL`; esta flag
nao deve ser usada em rotina comum.

Primeira execucao real segura registrada em 2026-07-13:

- HEAD de producao: `880420a`;
- `Event.rows` antes: `65193`;
- candidatos `NOISE`: `12912`;
- `critical`: `0`;
- `operational`: `0`;
- removidos: `12912`;
- eventos removidos:
  - `webhook.status.received`: `8555`;
  - `allowlist.check`: `4357`;
- `Event.rows` depois: `52281`;
- health final: OK;
- DB final: OK;
- PM2 final: `re7-admin-front` e `re7-whatsapp-agent` online.

A reducao fisica em disco pode nao aparecer imediatamente em `totalSize`, pois
depende de autovacuum/VACUUM do PostgreSQL.

Gatilho recomendado: repetir apenas a cada 7 a 14 dias, sempre seguindo a ordem
`storage:report`, dry-run `noise-only`, decisao explicita e execucao real
somente se os criterios acima continuarem seguros.

## Registro minimo do deploy
Registrar preferencialmente em:
- `docs/DEPLOY_LOG.md`

Registrar no minimo:

- branch:
- commit:
- horario:
- houve migration? `sim` / `nao`
- quem executou:
- validacao local: `ok` / `falhou`
- validacao pos-deploy: `ok` / `falhou`
- observacoes:

Exemplo:

```md
Deploy WhatsApp Agent
- branch: flow-executor-quote-hardening
- commit: abc1234
- horario: 2026-04-12 14:35 BRT
- migration: nao
- validacao local: ok (/app/login, /app/inbox)
- validacao pos-deploy: ok (/health, smoke do patch)
- observacoes: sem erro no PM2
```

## Rollback
Rollback minimo operacional:
1. identificar o commit anterior estavel
2. fazer checkout desse commit na VPS
3. reinstalar dependencias
4. rodar `db:generate`
5. rebuildar
6. reiniciar PM2
7. validar `/health`

Comandos:
```bash
cd /opt/re7online/site-re7online
git log --oneline -n 10
git checkout <commit_anterior>

cd /opt/re7online/site-re7online/apps/whatsapp-agent
npm ci --include=dev
npm run db:generate
npm run build
pm2 restart re7-whatsapp-agent --update-env
curl -sS http://127.0.0.1:3001/health
pm2 logs re7-whatsapp-agent --lines 50
```

Observacao:
- rollback de codigo nao reverte automaticamente migration destrutiva
- se o patch tiver migration sensivel, avaliar impacto antes do deploy

## Campanhas - fila por tenant e execucao incerta

Quando a fila duravel de campanhas por tenant estiver habilitada, uma execucao
`running` com resultado incerto nao deve ser liberada apenas por expiracao de
lease. O tenant permanece bloqueado para novas campanhas/test-send ate:

1. o runner finalizar o job normalmente; ou
2. uma revisao operacional classificar o job como `needs_review`, registrando
   motivo auditavel e liberando a lease sem reenviar automaticamente o trabalho.

Esse procedimento preserva a regra de nao executar duas campanhas simultaneas
para o mesmo tenant e evita reenvio automatico quando o processo caiu durante ou
logo apos uma chamada ao provider. Antes de classificar `needs_review`, conferir
logs, OutboundMessage/resultados ja persistidos, eventos tecnicos, estado do
provider quando disponivel e ausencia de runner ativo com posse valida. Apos a
classificacao, a campanha deve aparecer como "Revisao operacional" na lista,
com o motivo do bloqueio. A retomada/reexecucao deve ser decidida por gate
operacional separado, nunca por retry automatico cego.

Se o provider retornar sucesso/aceite e o executor perder a lease antes de
continuar, preservar primeiro a evidencia ja recebida de forma idempotente
(`OutboundMessage`, eventos e contadores aplicaveis) e impedir novas chamadas
do executor antigo. O proximo job do tenant so deve iniciar depois que o estado
do job atual estiver terminal ou classificado para revisao operacional. Nao
reenviar destinatario aceito apenas porque a lease expirou ou mudou de token.

Validacao local de integracao UI/API em 2026-09-26: o detalhe de campanha passa
a carregar `executionBatch` para exibir conjunto, chunks numerados, progresso
agregado/por lote, fila do tenant, horarios e motivos operacionais. Evidencia
tecnica: `campaignExecutionQueue` 8/8, `campaignRunner` 10/10,
`campaignsFeatureRoutes` 125/125, `campaignsPageContract` 29/29, backend build,
frontend build e `git diff --check` passaram. Smoke autenticado por API em
portas isoladas confirmou SUPERVISOR/ADMIN lendo um conjunto local de
3.001 destinatarios / quatro chunks e AGENT recebendo 403; a evidencia
sanitizada fica em `local-evidence/20260926-batch-ui-smoke/` e nao deve ser
versionada. Smoke visual estrito permanece pendente quando nao houver
	automacao disponivel; nesta frente foi possivel usar Chrome headless/CDP para
	validar detalhe do conjunto em desktop/tela estreita, SUPERVISOR/ADMIN
	autorizados e AGENT restrito. Complemento local tambem clicou pause/resume/cancel
	agregado e confirmou persistencia no DB local. Isso nao substitui smoke visual
	completo de criacao agrupada CRM/CSV nem toast de test-send ocupado por clique
	de UI. Em validacoes locais, evitar subir o processador de agendamento
com fixtures cujo `eligibleAt` ja venceu, pois ele pode consumir a fila local
antes do smoke visual.

## Observacoes praticas
- Compare link pode continuar sendo usado para revisao rapida, mas nao substitui o registro do commit exato deployado.
- O repositorio da VPS continua em:
  - `/opt/re7online/site-re7online`
- O backend principal continua em:
  - `/opt/re7online/site-re7online/apps/whatsapp-agent`
- Processo PM2 de producao:
  - `re7-whatsapp-agent`
- Health real da VPS:
  - `http://127.0.0.1:3001/health`

## Resumo operacional
- descubra bug localmente
- corrija localmente
- valide localmente
- build local
- commit + push
- deploy manual na VPS
- valide `/health` e o fluxo afetado
- registre branch, commit, horario e resultado

## Recuperacao local apos reboot — campanhas em lotes, 2026-09-26

O worktree de desenvolvimento em `/tmp` foi perdido. O delta foi reconstruido
por edicoes registradas na sessao e deve permanecer em caminho persistente:
`tmp/worktrees/re7-campaign-recovery-20260926`, dentro do checkout principal.
Nao confiar em `/tmp` para preservar codigo, banco, fixtures ou evidencias.
O checkout principal e o trabalho pausado de Guided Builder foram preservados.

A validacao local usou frontend 127.0.0.1:3062, API 127.0.0.1:3008 e PostgreSQL
127.0.0.1:55432. O harness local bloqueia fetch externo e nao inicia scheduler
periodico. Para snapshot dinamico, executar apenas um job de materializacao
com relogio de teste; verificar zero outbound e zero chamadas externas antes
de liberar qualquer etapa seguinte. Nao copiar configuracao sintetica para
producao. Scripts, fixture e dados locais nao devem ser versionados.

Para retomar, usar `start-api.sh` e `start-front.sh` em `local-evidence/recovery/`.
O banco correto e `re7_recovery_audit`, criado por migrations no PostgreSQL local
127.0.0.1:55432. As copias `re7_recovery_smoke` e `re7_recovery_regression` foram
preservadas como evidencias do erro de setup; nao sao baseline de schema nem destino
para o Client alinhado. Nao usar schema.test/compat, db push, reset ou SQL manual.
Em outro banco local vazio, executar `DATABASE_URL=<URL_LOCAL_ISOLADA> npm --prefix
apps/whatsapp-agent run db:deploy`, seguido de db:generate. Conferir todos os
checksums de `_prisma_migrations` e o schema incorporado no Client antes dos testes.
Os defaults/indices historicos listados no diff de auditoria nao foram removidos.
O migrate deploy valida a migration; ensaio operacional de rollout/rollback e separado.

Fechamento: os quatro fluxos UI/DB passaram (CRM estatico/dinamico, CSV,
agendamento/pausa/retomada/cancelamento agregado, test-send ocupado). Consultar
`RESULT_REPORT.md` e `result-summary.json` no diretorio local de evidencias.
O delta continua sem commit/push/deploy. Owner validation, aceite CRA, ensaio
operacional de rollout/rollback e decisao sobre materializacao DELIVERED/READ permanecem
pendentes. Manter o reparo 6683 encerrado e webhook/runtime preservados.

## Auditoria da recuperacao — 2026-09-26

Status tecnico: PRONTO PARA COMMIT DE REVISAO / NOT DEPLOYED / OWNER VALIDATION PENDING.
Esta nota atualiza o fechamento local abaixo; nao declara prontidao para deploy ou aceite CRA.

- Worktree persistente: `/home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/tmp/worktrees/re7-campaign-recovery-20260926`. HEAD detached `5d9259739754816d570470a30d52eb7eb53541bc`;
  referencia do ultimo HEAD anterior `6d664d0b9ffcf52f5315bfeca96f0622f4d25792`
  (branch original `zero-eligible-crm-eligibility-20260923`). Nao houve novo commit.
- Integridade: SHA-256 do patch e tar original conferidos; ambos coincidiam com
  o codigo no inicio desta auditoria. Replay independente das edicoes historicas
  confirmou migration, fila, runner e testes. API/UI e consultas CRM receberam
  as correcoes posteriores discriminadas em `local-evidence/recovery/audit/`.
  Nao existe snapshot integral do filesystem anterior: DB e capturas perdidos
  nao sao declarados recuperados byte a byte. Comportamentos criticos foram testados.
- Falhas fechadas: `CompletedServiceSnapshot.clientId` text versus cast SQL uuid;
  joins Client.id/WaPhoneNumber.clientId e Conversation.id/ConversationMetrics.conversationId
  com uuid/text na copia parcialmente criada. Banco novo `re7_recovery_audit`,
  127.0.0.1:55432, criado exclusivamente por `prisma migrate deploy`, corrigiu o ambiente.
  A fixture de agendamento ja teve o `idempotencyKey` obrigatorio reposto na retomada.
  Nenhuma assertion removida ou relaxada; concorrencia preservada.
- Schema: 18 anotacoes `@db.Uuid` alinhadas aos tipos das migrations existentes;
  Prisma Client 6.19.2 regenerado e semanticamente correspondente. SQL da fila intacto.
  Diff somente leitura ainda registra defaults, indices e nomes historicos;
  nao foi aplicado e nao ha diferenca de tipos ou estrutura da fila nesse diff.
- Migration validada: registro anterior de 60 migrations PASS recuperado; novo
  `migrate deploy` 60/60 PASS necessario porque o DB de teste recuperado havia
  sido substituido por schemas divergentes. Checksums de 60 SQLs iguais ao ledger.
  "Ensaio pendente" dizia respeito a rollout/rollback operacional, nao a falha
  da migration. Nao foi usado db push, reset ou SQL manual nesta auditoria.
- Testes finais: casos anteriormente falhos 4/4; fila 8/8 + runner 10/10 + rotas
  126/126 = 144/144; importacao/exclusao/contratos UI 41/41; zero skips/falhas.
  Backend build e prisma validate/generate PASS. Build frontend anterior preservado
  porque UI nao mudou nesta auditoria. Os quatro smokes aprovados nao foram repetidos.
- Contratos: 3.001 → quatro lotes, snapshot unico, variaveis CRM/CSV, isolamento por
  tenant/exclusividade, scheduler concorrente, retomada, aceite apos perda de lease
  e bloqueios antes do provider cobertos. Provider apenas simulado nos testes.
- Pendencias efetivas: rollout/rollback operacional, drift residual historico de
  defaults/indices, owner validation, aceite CRA e decisao de dominio DELIVERED/READ →
  Conversation/HUMAN/WAITING. Divergencia de dominio permanece separada e sem alteracao
  funcional; 6683 segue encerrado. Sem commit/push/deploy, producao DB ou envio real.

## Drift historico residual — revisao da fila

Inventario do diff somente leitura entre o DB criado pelas 60 migrations e o
schema alinhado. Todos os objetos abaixo sao anteriores a
`20260925143000_add_campaign_execution_queue`. O diff nao foi executado.
Nao ha ALTER TYPE nem diferenca nas quatro tabelas de batch/job/lease.

| Objeto existente no SQL | Diferenca no schema / impacto de aplicar o diff incidentalmente |
|---|---|
| Client.id — DEFAULT gen_random_uuid() | @default(uuid()) gera UUID pelo Prisma; remover default SQL prejudicaria inserts SQL que omitem id. Default preservado. |
| WaPhoneNumber.id — DEFAULT gen_random_uuid() | Mesmo caso; default SQL preservado. |
| Contact.id — DEFAULT gen_random_uuid() | Mesmo caso; default SQL preservado. |
| Conversation.id — DEFAULT gen_random_uuid() | Mesmo caso; default SQL preservado. |
| Message.id — DEFAULT gen_random_uuid() | Mesmo caso; default SQL preservado. |
| Event.id — DEFAULT gen_random_uuid() | Mesmo caso; default SQL preservado. |
| InboundMessage.id — DEFAULT gen_random_uuid() | Mesmo caso; default SQL preservado. |
| OutboundMessage.id — DEFAULT gen_random_uuid() | Mesmo caso; default SQL preservado. |
| AgentAvailability.updatedAt — DEFAULT CURRENT_TIMESTAMP | Schema usa @updatedAt, sem default SQL declarado; retirar default mudaria inserts externos ao Prisma. Preservado. |
| ChatbotFlow.updatedAt — DEFAULT CURRENT_TIMESTAMP | Mesmo caso; default SQL preservado. |
| DepartmentBusinessHour.updatedAt — DEFAULT CURRENT_TIMESTAMP | Mesmo caso; default SQL preservado. |
| UserDepartmentMembership.updatedAt — DEFAULT CURRENT_TIMESTAMP | Mesmo caso; default SQL preservado. |
| SearchIndex_searchVector_idx — GIN(searchVector) | Indice SQL adicional, sobre coluna tsvector; removê-lo poderia degradar busca textual. Preservado. |
| WebhookEndpoint_clientId_signingSecretKeyVersion_idx | Indice SQL adicional; removê-lo poderia degradar consultas por tenant/versao de chave. Preservado. |
| Department_operationalQueue_fkey | Nome do SQL difere do inferido Department_clientId_id_operationalQueueId_fkey; renomeacao de catalogo, sem mudar relacao. Preservado. |
| CompletedServiceSnapshot_clientId_departmentId_assignedUserId_c | Nome SQL difere de CompletedServiceSnapshot_clientId_departmentId_assignedUser_idx; renomeacao de catalogo, sem mudar colunas. Preservado. |

As 18 anotacoes @db.Uuid apenas alinham o Client aos tipos preexistentes:
`20260215133500_fix_uuid_ids` ja define Client.id, WaPhoneNumber.id/clientId,
Contact.id/clientId, Conversation.id/clientId, Message.id/conversationId,
Event.id/clientId, InboundMessage.id/clientId e OutboundMessage.id/clientId (15 campos).
`20260412233000_add_sla_and_conversation_metrics` define
ConversationMetrics.clientId/conversationId e SLAConfig.clientId (3 campos).
A migration da fila permanece byte a byte igual a validada; nenhuma migration
historica foi editada. Defaults SQL e geracao UUID no Prisma sao aspectos distintos.

Evidencias locais nao versionadas: `local-evidence/recovery/audit/schema-db-diff.sql`,
`db-uuid-columns.tsv`, `migration-checksums.json` e `validated-source-hashes.json`.
Backup pre-Git: `local-evidence/recovery/git-review/`, incluindo os deltas contra
5d925973 e 6d664d0b, tar dos fontes, hashes e referencia de stash mantida.

## Operacao dos conjuntos apos revisao 109c9f15

- Retry CSV: conservar requestId e payload; 409 exige revisar a operacao, nunca
  trocar a chave automaticamente para contornar conflito. Resultado legado sem
  fingerprint tambem exige revisao. Falha transacional pode repetir a mesma chave.
- Pausa aguarda fim da chamada em andamento; nao retomar enquanto existir job
  running/needs_review ou falha impeditiva. Cancelamento em voo exige revisao
  operacional; resultado aceito permanece auditado e nao autoriza reenvio.
- Falha de snapshot/filhos: manter o evento criptografado e a chave de segredo;
  controlador expirado e recuperado no proximo tick. Snapshot ilegivel bloqueia
  a materializacao; nao consultar CRM novamente para substituir a audiencia.
- Envio imediato nao antecipa conjuntos futuros, nao usa provider direto e
  respeita conjunto ativo/lease do tenant. Pausa libera outros trabalhos quando
  nao ha chamada em andamento; conjunto ativo mantem continuidade dos lotes.
- Rollback operacional ainda nao ensaiado: antes de qualquer publicacao futura,
  registrar jobs/leases e aceites, interromper admissao e tratar chamadas em voo.
  Nao reverter schema ou limpar filas/snapshots para reexecutar envios aceitos.

## Ensaio operacional local da fila — procedimento executado

Esta secao substitui a pendencia de **ensaio local**, preservando os registros
anteriores. Nao atesta rollback funcional com envio nem valida a infraestrutura
de producao. O codigo antigo usado foi `6d664d0b` (anterior a fila); o novo foi
`fedef1e1` com a correcao de inicio efetivo desta revisao.

### Preparacao e isolamento

Executado no worktree persistente
`/home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/tmp/worktrees/re7-campaign-recovery-20260926`.
Cluster exclusivo PostgreSQL 16, TCP somente 127.0.0.1:55434, DB
`re7_rollout_local`; socket curto `/tmp/re7-rollout-socket-20260926`.
O primeiro caminho de socket excedia 107 bytes e foi corrigido antes da criacao
do banco; os logs dessa tentativa foram preservados. Nenhum DB anterior foi usado
como destino de restore/reset. Dados do ensaio permanecem preservados.

O harness versionado `apps/whatsapp-agent/scripts/campaign-rollout-rehearsal.ts`
recusa outro host/porta/DB, parametros extras de URL, usuario ou cwd. Exige
`LOCAL_CAMPAIGN_REHEARSAL=synthetic-only`; usa segredo/credenciais falsos, respostas
em memoria e bloqueio de fetch/HTTP externo. O launcher usa ambiente sem variaveis
herdadas, exceto PATH. O papel `rollout_runtime` nao e owner/superuser nem herda
permissoes; `rollout_owner` e exclusivo da administracao deste cluster sintetico.

Para repetir, usar outro worktree/diretorio de evidencias novo e uma instancia
local livre na porta reservada; **nao apagar o ensaio existente**. Com dependencias
ja instaladas no worktree, preparar o equivalente aos comandos abaixo:

```bash
task_worktree="$PWD"
task_evidence="$task_worktree/local-evidence/recovery/rollout-local"
# Exigir destino inexistente e porta livre; abortar se ja houver PG_VERSION/DB.
mkdir -p "$task_evidence/old-source" "$task_evidence/runtime" /tmp/re7-rollout-socket-20260926
git archive 6d664d0b apps/whatsapp-agent/src apps/whatsapp-agent/prisma | tar -x -C "$task_evidence/old-source"
ln -s "$task_worktree/apps/whatsapp-agent/node_modules" "$task_evidence/old-source/apps/whatsapp-agent/node_modules"
/usr/lib/postgresql/16/bin/initdb -D "$task_evidence/pgdata" --username=rollout_owner --auth=trust --encoding=UTF8 --no-locale
/usr/lib/postgresql/16/bin/pg_ctl -D "$task_evidence/pgdata" -l "$task_evidence/postgres.log" -o '-p 55434 -h 127.0.0.1 -k /tmp/re7-rollout-socket-20260926' start
createdb -h 127.0.0.1 -p 55434 -U rollout_owner re7_rollout_local
env -i PATH="$PATH" DATABASE_URL=postgresql://rollout_owner@127.0.0.1:55434/re7_rollout_local "$task_worktree/apps/whatsapp-agent/node_modules/.bin/prisma" migrate deploy --schema "$task_evidence/old-source/apps/whatsapp-agent/prisma/schema.prisma"
rehearse_phase() {
  (cd "$task_evidence/runtime" && env -i PATH="$PATH" DATABASE_URL="postgresql://$2@127.0.0.1:55434/re7_rollout_local" LOCAL_CAMPAIGN_REHEARSAL=synthetic-only ENABLE_TENANTS_JSON_FALLBACK=false "$task_worktree/apps/whatsapp-agent/node_modules/.bin/tsx" "$task_worktree/apps/whatsapp-agent/scripts/campaign-rollout-rehearsal.ts" "$1")
}
rehearse_phase seed-base rollout_owner
pg_dump -h 127.0.0.1 -p 55434 -U rollout_owner -Fc -f "$task_evidence/base-before-migration.dump" re7_rollout_local
env -i PATH="$PATH" DATABASE_URL=postgresql://rollout_owner@127.0.0.1:55434/re7_rollout_local "$task_worktree/apps/whatsapp-agent/node_modules/.bin/prisma" migrate deploy --schema "$task_worktree/apps/whatsapp-agent/prisma/schema.prisma"
rehearse_phase after-migration rollout_owner
```

### Sequencia de falha, suspensao e recuperacao

Cada fase deve gravar log proprio. Interromper imediatamente diante de resultado
inesperado; nao prosseguir para grant/resume se uma assert falhar. As saidas 72/73
abaixo sao falhas deliberadas, verificadas pelo operador, nao erros a ignorar.

1. `startup-fault rollout_runtime`: saida **72** esperada apos comprovar que o
   runtime ainda nao pode consultar Campaign. Migration permanece aplicada; tres
   campanhas antigas iguais, zero jobs. Falha de startup nao autoriza ativar o
   runner antigo sobre o schema novo.
2. `grant rollout_owner`, depois `drain rollout_runtime`: liberar somente o
   runtime novo. Processar fila real com provider em memoria. Fechar ingresso
   para todas as rotas, exceto health, pausar conjunto e aguardar retorno da
   chamada em voo; um aceite conhecido permanece auditado. Interromper controlador
   dinamico apos persistir snapshot, pausar e alterar o CRM de teste.
3. `uncertain-crash rollout_runtime`: saida **73** esperada, terminando realmente
   o processo apos submissao simulada e antes da resposta. O ledger do provider
   e uma evidencia externa simulada, nao um aceite inventado no Event local.
4. `fence rollout_owner`: marcar o job incerto via operacao needs_review, sem
   reenfileirar. Revogar privilegios de tabelas/sequences do runtime e preservar
   `rollback-preserved.json`; gerar `suspended-before-rollback.dump` com pg_dump.
   Em ambiente alvo: fechar ingresso em todas as instancias, desabilitar
   `CAMPAIGN_SCHEDULE_PROCESSOR_DISABLED=true`, parar workers/instancias e
   confirmar inexistencia de conexoes/sessoes antigas antes de trocar versao.
5. `old-probe rollout_runtime`: importar e invocar o runner real de `6d664d0b`;
   a consulta e negada pelo DB. `verify-fence rollout_owner` compara todas as
   campanhas, grupos, jobs, leases, eventos e outbound ao manifesto suspenso.
   Resultado observado: igualdade integral e zero chamadas de provider.
6. Confirmar processo antigo encerrado e zero conexoes `rollout_runtime` em
   pg_stat_activity. Somente entao `grant rollout_owner` e
   `resume-new rollout_runtime`. O controlador espera sua lease real expirar;
   o snapshot anterior e reutilizado, sem apagar jobs, eventos ou tabelas.
   Retomar apenas grupos sem incerteza; o grupo needs_review continua bloqueado.
7. `verify-final rollout_runtime`: conferir quatro aceites conhecidos, uma
   pendencia incerta, inicio original de todos os grupos e cinco rotas HTTP em
   503, sem alteracao de estado. Gerar `after-return-new.dump`. Reabertura de
   admissao nao foi automatizada nem executada neste ensaio.

**Limite do rollback:** processamento de campanhas fica SUSPENSO. O ensaio usou
manutencao de toda a API, exceto a passagem de health, e revogacao de acesso do
runtime a todas as tabelas. Nao se declara disponibilidade funcional do backend
antigo. Apenas desligar o scheduler e insuficiente: envio manual/API pode existir.
Se o runtime alvo for owner/superuser, compartilhar credenciais privilegiadas ou
possuir outro caminho de ingresso/provider sem bloqueio, **parar o rollout** ate
haver cerca equivalente comprovada. Nao executar down migration/drop/reset nem
restaurar dump anterior sobre aceites posteriores. Dumps servem para preservacao
forense/recuperacao isolada, nunca para apagar historico e liberar reenvio.

**Condicoes de parada:** migration falha/checksum divergente; perda das campanhas
antigas; entrada de campanha durante manutencao; processo/conexao antiga viva;
provider real acessivel; quebra de exclusividade; snapshot ilegivel; resultado
incerto; duplicacao; divergencia de IDs/payloads no intervalo suspenso. Manter
admissao fechada, salvar evidencias e investigar. Resultado incerto exige
reconciliacao operacional com fonte autorizada; nunca converter em queued por
expiracao da lease. A unica recuperacao automatica ensaiada e a do controlador
sem chamada a provider, preservando o snapshot.

### Drift: decisao por objeto e evidencia

O inventario anterior permanece a referencia; o SQL de diff **nao foi aplicado**.
`drift-before.json` e `drift-after.json` sao identicos nos 16 objetos abaixo.
`drift-readonly.sql` coincide integralmente com o diff historico; nao ha diferenca
nas quatro tabelas da fila. A migration aplicada foi exclusivamente aditiva.

| Objetos historicos | Impedem este rollout? | Evidencia/condicao |
|---|---|---|
| Client.id, WaPhoneNumber.id, Contact.id, Conversation.id, Message.id, Event.id, InboundMessage.id, OutboundMessage.id | Nao | Oito defaults SQL gen_random_uuid preservados; IDs/FKs UUID aceitos no seed antigo e no processamento novo. Nao remover defaults para alinhar diff. |
| AgentAvailability.updatedAt, ChatbotFlow.updatedAt, DepartmentBusinessHour.updatedAt, UserDepartmentMembership.updatedAt | Nao | Quatro defaults CURRENT_TIMESTAMP intactos; nova migration nao toca essas tabelas. Prisma @updatedAt continua compativel com defaults SQL. |
| SearchIndex_searchVector_idx | Nao | GIN existente preservado no catalogo; fila nao exige sua remocao. |
| WebhookEndpoint_clientId_signingSecretKeyVersion_idx | Nao | Indice adicional preservado, sem alteracao de consulta/estrutura. |
| Department_operationalQueue_fkey | Nao | Definicao relacional identica; diferenca e o nome inferido pelo schema. |
| CompletedServiceSnapshot_clientId_departmentId_assignedUserId_c | Nao | Colunas/definicao identicas; diferenca e o nome inferido do indice. |

Essa conclusao vale para o rollout aditivo ensaiado sobre as 59 migrations
anteriores, mantendo o catalogo existente. Nao autoriza aplicar o diff de drift,
nem presume que um banco alvo desconhecido tenha o mesmo catalogo. Conferencia
somente leitura do alvo e das permissoes/rotas de operacao permanece uma condicao
para eventual decisao de implantacao, fora do escopo local autorizado.

### Resultados e limites comprovados

- Migrations 59 → 60 via Prisma; tres campanhas antigas preservadas.
- Falha de startup 72; falha em voo 73; nenhum estado apagado para recuperar.
- Admissao 503, rollback antigo sem acesso a Campaign e sem provider.
- Retorno novo: dois grupos completos, cinco submissoes unicas simuladas,
  quatro aceites locais conhecidos e uma pendencia needs_review retida.
- Snapshot/variavel original preservados apesar da mudanca no CRM; IDs de jobs
  e eventos anteriores preservados; inicios efetivos dos grupos inalterados.
- 2/2 testes de horario/recuperacao, 8/8 fila e build backend PASS. UI ja usa
  job.startedAt por lote; nenhum smoke visual/build frontend repetido.
- Limites: uma instancia/cluster local, provider simulado, sem prova de capacidade,
  HA, fences de producao, entrega real ou rollback com processamento ativo.
  Owner UI e aceite CRA continuam pendentes; NOT DEPLOYED. Divergencia
  DELIVERED/READ → HUMAN/WAITING separada; 6683 CLOSED.


### Preflight do alvo — 2026-09-26 (somente leitura)

Produção `5ee2de6b`; candidato `2ecfc91a`: **NOT DEPLOYED / OWNER UI PENDING**.
[Preflight único, condições de parada e recuperação](saas/CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md) atualizado após `66b9cf2b`: portas 3000/3001 alcançáveis externamente, rewrite público do frontend e risco PM2 resurrect confirmados. Leituras privilegiadas de Nginx/firewall negadas; comandos exatos para o operador constam no preflight.

Recomendação: não avançar à migration; preparar e ensaiar guarda de admissão/drain e artefato de recuperação do atendimento com campanhas fechadas, em tarefa separada. Código atual não comprova quiescência de test-send/runners, nem retorno seletivo seguro. A estimativa preliminar de 30–60 min não constitui janela proposta para aprovação. Sem promessa de inbound/retries; sem REVOKE do papel compartilhado. Migration/drift/ensaio anteriores não repetidos; nenhuma alteração de runtime. Owner PASS anterior preservado, 6683 CLOSED, CRA pendente e DELIVERED/READ → HUMAN/WAITING separados.


## Guarda operacional de campanhas — implementação local, 2026-09-26

Base `2b5697b6`, sem commit/push/deploy. A leitura remota anterior está no
[preflight único](saas/CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md); não houve nova
consulta a produção nesta implementação. NOT DEPLOYED / OWNER UI PENDING.

### Configuração e autorização

`CAMPAIGN_OPERATIONS_FILE` deve ser um caminho absoluto persistente no volume
local de `.data`, **o mesmo arquivo** para todas as instâncias e diretórios de
release/recuperação. Ausência da variável, arquivo inválido, erro de leitura ou
lock indisponível fecham campanhas. Arquivo inexistente começa fechado. Não usar
um arquivo por release nem storage efêmero. Implementação para processos no mesmo
host/filesystem local Linux (identidade de boot + início do processo em `/proc`); não foi validada para NFS ou múltiplos hosts. Configurar
`CAMPAIGN_BUILD_ID` com a identificação do artefato; na ausência é exposto o SHA256
do módulo da guarda (não uma alegação de hash do release completo).

Reutiliza a persistência JSON/rename da convenção de armazenamento local e o
superadmin operacional existente. Manutenções em memória não são usadas como
fence. Escrita usa lock exclusivo por mkdir, fsync do arquivo, rename e fsync do
diretório. Nenhum timeout remove lock abandonado ou tarefa. Não há nova fila,
tabela, migration, mudança de papel SQL nem bloqueio do outbound genérico Inbox.

API autenticada existente: `GET /admin/ops/campaign-execution` retorna estado,
geração, instância/build, tarefas/fases e últimas ações auditadas. POST no mesmo
path recebe `{ "open": false, "generation": <geração lida>, "reason": "motivo" }`.
Abertura usa `open:true`, geração atual e motivo obrigatório; exige ausência de
pendências. Token tenant e usuários app (inclusive supervisor/admin tenant) não
controlam esse endpoint. A identidade operacional segue o token superadmin já
existente, não inventa identidade pessoal quando o token é compartilhado.

O registro é metadado de execução, não prova de entrega: intents, aceites,
OutboundMessage e eventos de domínio continuam sendo a evidência. Diagnóstico
não inclui telefone, payload, variáveis ou credenciais; referências técnicas
permitem correlacionar tenant/campanha/messageId para revisão autorizada.

### Fechamento e drain

Admissão de mutações app/admin/public-api ocorre antes da pré-validação assíncrona.
Scheduler, claim e runner desacoplado têm registros próprios. Uma resposta HTTP
concluída não apaga o runner; a finalização do scheduler não confunde esse filho
ativo com erro. Antes da invocação de outbound de campanha, registra intento e
serializa a invocação com o fechamento. Se fechar durante persistência do intento,
provider não é invocado; o intento fica pendente para revisão conservadora.

Chamada já iniciada pode concluir e gravar aceitação/resultado. Pendência de
provider/persistência não é liberada por timeout. Falha/crash mantém registro;
restart com registros de executor encerrado fecha admissão, não zera evidência.
`drained=true` exige estado fechado legível e nenhum trabalho pendente no arquivo
compartilhado. Isso só cobre executores instrumentados e o arquivo configurado:
não prova drain de código antigo, outro host ou arquivo de configuração divergente.

Suspensão administrativa devolve o job à fila existente sem mudar a intenção
sending/running da campanha/grupo. Pausa/cancelamento do usuário continuam com
RBAC e precedem o requeue: job não é reaberto se o usuário interrompeu a campanha.
As rotas de pause/cancel continuam disponíveis com a guarda fechada. Abertura
explícita permite o scheduler existente retomar com snapshot/intents/aceites
preservados; nenhum contador é usado como autorização para reenvio cego.

Se houver tarefa/lock abandonado, NÃO apagar arquivo, expirar lease nem trocar
por um arquivo vazio para abrir. Manter fechado, preservar cópia/hash e estado
SQL, identificar o processo/geração e correlacionar intent/aceite/resultado.
A reconciliação requer decisão operacional e evidência externa quando aplicável;
não há endpoint de “limpar pendências” ou reconciliação automática nesta entrega.
O ensaio não transforma submissão incerta em entregue/não entregue.

### Artefato de recuperação do atendimento

Worktree separado `tmp/worktrees/re7-campaign-service-recovery-20260926`, detached
em `5ee2de6b`, com guarda compilada permanentemente fechada: nem variável de
ambiente, arquivo aberto ou POST superadmin liberam campanhas. Rotas de mutação,
scheduler e runner interno são impedidos; atendimento não é cercado pelo guard.
Client Prisma privado gerado do schema desse SHA; nenhuma migration executada.
Não compartilhar o Client gerado entre versões. Worker, módulos de sessão e
transportes não foram alterados. Patch/hashes locais preservam as diferenças do
artefato; não houve commit do worktree de recuperação.

Em recuperação futura: manter arquivo/generation fechado, confirmar ausência de
executor anterior e respawn, iniciar apenas artefato identificado, verificar
atendimento por critérios funcionais e conservar tabelas novas/jobs/snapshots/
aceites. Nunca executar down migration/restore destrutivo para fazer o antigo
funcionar. Retorno ao candidato mantém o mesmo fence fechado; abrir explicitamente
só após diagnóstico sem pendências e revisão de incertezas. Resultado de health
isolado não aceita recuperação de atendimento.

### Primeira instalação: condição ainda externa ao ensaio

O SHA hoje vivo não tem instrumentação. Instalar a guarda por restart NÃO prova
retroativamente que a API antiga terminou chamadas. Antes de qualquer janela,
operador deve conferir Nginx efetivo, portas diretas/IPv4/IPv6, frontend/aliases e
PM2 saved state/boot conforme comandos do preflight. Bloquear admissão antiga em
todas as entradas exige autorização própria; scheduler antigo continua sendo
fonte interna até cessar o processo. Não usar REVOKE, pm2 kill ou reload all.

É necessária decisão explícita do owner sobre a primeira troca de API e sobre
chamadas potencialmente incertas. Preservar logs/intents/resultados e marco da
transição; comprovar que não resta processo antigo ou mecanismo que o ressuscite.
Onde o código antigo não permite demonstrar término, classificar a pendência para
reconciliação, não presumir quiescência por status sending=0 ou espera. Subir o
artefato guardado inicialmente fechado pode recuperar atendimento, mas não apaga
a incerteza anterior. Não avançar à migration/abertura enquanto houver essa lacuna.

API parada afeta Inbox/CRM/autenticação/realtime/webhooks; worker/sessões devem
ficar preservados, mas callbacks dependentes da API degradam. Não há promessa de
preservação integral de inbound, retry/replay ou risco zero. Esta primeira
transição, acesso privilegiado, janela/aceitação de impacto, owner UI e CRA não
foram autorizados/exercidos por esta tarefa local.


Validação final e resultados exatos, sem duplicar o relatório:
[ensaios da guarda e recuperação](saas/CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md#resultados-comprovados-do-ensaio-local).
Para repetir apenas um caso relevante, usar env limpo com DATABASE_URL do DB
sintético, NODE_ENV=test, segredos fictícios, loader tsx e
`--import ./apps/whatsapp-agent/scripts/campaign-guard-local-isolation.mjs`.
As quatro suítes afetadas abrem arquivos temporários exclusivos pela API real
na fixture `campaignOperationsTestSupport.ts`; não existe bypass de produção.
O teste de retorno usa `CAMPAIGN_RECOVERY_WORKTREE` apontando para o worktree
separado e chama o probe estritamente local `campaign-guard-recovery-probe.ts`.
Não reutilizar esses nomes/URLs de teste em produção nem inferir que um arquivo
local fechado protege outro processo com configuração diferente.


## Publicação dos dois artefatos para revisão — 2026-09-26

NOT DEPLOYED / OWNER UI PENDING. Esta seção sucede o estado local sem commit
registrado acima; não substitui nem apaga os ensaios ou encerramentos anteriores.

- Candidato: `review/campaign-recovery-20260926`, parent documental `2b5697b6`,
  preserva candidato funcional `2ecfc91a` e histórico owner PASS. Guarda/drain,
  integração à fila existente e testes; não é autorização de deploy ou aceite CRA.
- Recuperação: `review/campaign-service-recovery-20260926`, commit `e6a12bc9f4ae77ada191f7bdc7d835ee704d5bac`,
  parent direto `5ee2de6b8878aefa733a6fbe1b7f1553fd78ae2e`. Atendimento antigo com
  campanhas permanentemente fechadas em código. Não misturar sua implementação
  com o candidato nem voltar ao runner original desprotegido.
  [Procedimento do artefato](https://github.com/nosfied/site-re7online/blob/e6a12bc9f4ae77ada191f7bdc7d835ee704d5bac/docs/CAMPAIGN_SERVICE_RECOVERY_REVIEW.md).

### Configuração e limite efetivamente imposto

`CAMPAIGN_OPERATIONS_FILE` é absoluto, persistente, fora do release, idêntico em
TODAS as instâncias/versões do mesmo host. Proposta a provisionar no alvo:
`/var/lib/re7/campaign-operations/state.json`; não foi configurada remotamente.
Não usar caminho por release nem arquivos separados. Exigir filesystem local
Linux, sem NFS, hostnames/container namespaces com visão divergente de /proc ou
múltiplos hosts. Abertura exige `CAMPAIGN_OPERATIONS_TOPOLOGY=single-host` e
`CAMPAIGN_OPERATIONS_HOST_ID` igual à identidade local de `/etc/machine-id`.
Não publicar o valor dessa identidade. Estado aberto fica vinculado a esse host.
Configuração ausente, identidade divergente ou topologia diferente fecha a leitura
operacional e impede nova admissão/provider; POST open é recusado se configuração
não validada. Ledger legado sem vínculo exige abertura explícita após revisão.
Fechamento/diagnóstico e finalização de trabalho já admitido permanecem disponíveis.

Esse atestado é configuração operacional, não descoberta de hosts: inventário
completo de executores continua obrigatório. Se houver host adicional, arquivo
diferente, filesystem/namespace não validado ou inventário inconclusivo, NÃO
atestar single-host/NÃO abrir. Configuração indevidamente replicada ou inventário
falso não são detectáveis integralmente pelo arquivo. Não há coordenação entre
hosts. A recuperação não pode abrir sob nenhuma topologia/configuração.

Diretório privado 0700/arquivo 0600 são criados com esses modos; diretórios já
existentes não têm permissões reparadas. Antes de provisionar, verificar dono,
ancestrais, ausência de symlinks e ausência de escrita por terceiros. Não alterar
permissões compartilhadas. Mesmo UID/root continua capaz de modificar estado;
o arquivo não é proteção contra runtime/host comprometido. Controle via backend
exige superadmin; tenant-admin é recusado, audit usa o ator técnico do mecanismo
existente, sem inventar identificação pessoal para token compartilhado.

Arquivo ausente inicia fechado; ilegível/corrompido recusa operação e não comprova
drain. Lock exclusivo por mkdir, temp 0600, fsync/rename/fsync serializam alterações
no filesystem validado. Colisão recusa operação, sem espera/retry que abra janela.
Crash pode deixar lock/temp; não apagar nem expirar automaticamente. Restart e
resurrect preservam ledger de trabalho incerto; identidade boot/processo impede
confundir reutilização de PID com executor vivo. Investigar pendências correlacionando
intents/aceites/resultados SQL. Não inferir entrega nem reenviar por timeout.

Primeira transição permanece pendente e não há quiescência retroativa. Necessários:
verificações privilegiadas de entradas/supervisores, provisionamento privado do
estado/mesma configuração, decisão owner sobre janela/impacto e tratamento de
chamadas antigas incertas. Recuperação do atendimento mantém campanhas suspensas;
health sozinho não aceita rollback. Sem promessa de preservação inbound/retries.
6683 CLOSED; DELIVERED/READ → HUMAN/WAITING separado; owner UI/CRA pendentes.

### Publicação Git e evidências

Backups anteriores intactos; novos patches, arquivos e hashes em
`local-evidence/recovery/guard-publication/` (fora do Git). Staging explícito exclui
estado operacional, .data, dumps, evidências, credenciais e configurações privadas.
Ambos `vercel.json` recusam auto-deploy para os dois nomes exatos de branches
([semântica oficial](https://vercel.com/docs/project-configuration/git-configuration)).
Único workflow nas duas árvores: CI em push main/develop e PR para main/develop,
sem job de implantação. Scripts VPS são manuais, não invocados pelo workflow.
Nenhum merge/force/deploy. Leitura do projeto/lista Vercel antes do push não mostrou
implantação das branches de revisão; consulta detalhada get_project indisponível
por incompatibilidade de schema do connector, sem alteração de configuração.

Resultados incrementais e evidências anteriores ficam no preflight único.
Para o probe de recuperação commitada, informar `CAMPAIGN_RECOVERY_EXPECTED_SHA`
com SHA completo e `CAMPAIGN_RECOVERY_WORKTREE`; o script exige HEAD exato e
ancestralidade em 5ee2de6b. Provider/rede externos continuam bloqueados pelo
launcher sintético. Não repetir suítes completas sem alteração pertinente.


## Correção dos achados de consentimento e aceite/ledger — 2026-09-26

Revisão incremental sobre candidato `889a1c7c` e recuperação `e6a12bc9`, sem
reabrir desenho/auditoria. NOT DEPLOYED / OWNER UI PENDING. Histórico acima e
ensaios anteriores preservados. Sem alteração de schema/migration/infraestrutura.

### Consentimento com campanhas suspensas

Auditoria dos consumidores: `src/app/app/crm/page.tsx` chama
`recordAppCrmContactOptOut`/`revokeAppCrmContactOptOut` em `src/lib/appClientApi.ts`,
que usam POST/DELETE `/app/crm/contacts/:id/opt-out`. Essas rotas já não eram
interceptadas pela guarda. As rotas de consentimento POST `/app/campaigns/opt-out`
e POST `/app/campaigns/opt-out/revoke` também são legítimas; a classificação
anterior as bloqueava genericamente. Ambos artefatos agora deixam SOMENTE esses
pares exatos método/path alcançarem seus handlers existentes. Autenticação,
tenant ativo, feature e escopo continuam intactos. Não há nova exceção por sufixo,
liberação de envio ou alteração de RBAC. Não assumir que todo usuário CRM pode
usar a rota legada: sua política existente de feature campaigns foi preservada.
Subcaminhos send/test-send continuam fechados. Scheduler não é liberado por revoke.

### Aceitação recebida não depende de atualização de fase do ledger

Reprodução local confirmou que contenção e EIO após await do provider antes
impediam retornar sua resposta. A fase anterior à submissão agora é fsyncada
ANTES de invocar o provider, ainda sob o lock que serializa o fechamento. Uma
falha ao liberar o lock depois da invocação também não descarta a promise iniciada.
Depois do resultado, erro ao marcar persisting não impede o chamador de gravar
os mecanismos existentes: `campaign.message.provider_accepted`, OutboundMessage
SENT/metaMessageId, eventos sent/test_send.sent. Erro em `persisted()`/finalização
não transforma esse resultado em rejeição. Se o SQL falha enquanto há aceitação
conhecida, runner registra `campaign.result.persistence_pending`, preserva
intenção/pendência e não marca rejeição de provider ou avança ao próximo destinatário.

Na falha de escrituração, criar marcador permanente
`${CAMPAIGN_OPERATIONS_FILE}.uncertain` (diretório privado 0700), independente do
lock disputado, com fsync do diretório pai. Todos os processos do candidato que
compartilham o caminho recusam novas admissões/provider/abertura; drain permanece
falso, mesmo se o SQL já conservou o aceite. O artefato fechado de recuperação
reconhece esse marcador no diagnóstico de drain; sua implementação de envio não
foi alterada nem habilitada. Preservar o marcador junto ao ledger/locks em
backup/restauração/troca de versão. Não há limpeza automática nem endpoint para
apagar a pendência. Versões anteriores à correção não conhecem esse marcador:
NÃO manter instâncias candidatas antigas em paralelo como se compartilhassem
esse contrato. A recuperação é sempre fechada em código.

O lock candidato contém owner.json com identidade de instância/boot/processo.
Diagnóstico `lock_busy_live` significa escritor com identidade viva, não garante
que vá progredir; `lock_abandoned` identifica proprietário morto/identidade
divergente; `lock_owner_unverifiable` cobre dono ausente/ilegível e lock legado.
Erro de ledger/JSON é separado de contenção (`ledger_io_or_corrupt`/`ledger_io`).
Não remover locks/tarefas por idade ou timeout. Nos testes, o segundo processo
segura o lock REAL do escritor em rename e só o libera por sinal explícito.
Contenção após aceite é conservadora: liberação natural do lock não remove o
marcador nem reabre campanhas. Conciliar o aceite SQL antes de qualquer recuperação.

### Limite de indisponibilidade simultânea

Se o filesystem não permite sequer criar/fsyncar o marcador, a instância conserva
bloqueio em memória e emite `campaign_ledger_fault_fence_not_durable`. Intent/task
anteriores continuam sendo a evidência já durável. Se SQL também não aceita a
resposta, metaMessageId/aceite recebido podem existir somente em memória e podem
ser perdidos no crash. Não há promessa de persistência impossível, nem dedução de
rejeição a partir da ausência de OutboundMessage. Esse bloqueio só em memória NÃO
é uma garantia de coordenação entre processos após recuperação do storage.
Operador deve manter TODOS os executores de campanha sem admissão durante reparo,
preservar evidências/estado e reconciliar chamadas antes de restaurar processamento;
não basta reparar disco/DB e deixar schedulers retomarem automaticamente. Não
apagar intent/lock/tarefa, não reenfileirar nem retransmitir cegamente. Falha de
ambos os meios exige decisão/reconciliação explícita, não aceite automático de drain.
Não foi realizado reparo operacional nem reconciliação nesta entrega.

Resultados exatos no preflight único; evidências sanitizadas/local sintéticas em
`local-evidence/recovery/guard-findings/`, fora do staging. Primeira transição,
provisionamento/inventário do alvo, owner UI/CRA e tratamento de incerteza antiga
continuam pendentes. Não há quiescência retroativa. 6683 CLOSED; divergência
DELIVERED/READ → HUMAN/WAITING separada.


## Primeira transição — plano condicionado às evidências do operador

Artefatos fixos: candidato `a1cc380eddcd1467b8e0d3a8e405f82689a25b3d`;
recuperação `03f930e5453efd313a91a16de3e22057a0573d9c`. O commit documental que
contém este plano não muda esses artefatos funcionais. **NÃO EXECUTAR os comandos
mutáveis abaixo sem uma autorização operacional posterior e passagem de G0.**
Esta tarefa somente leu e documentou: nenhum backup, provisionamento, migration,
restart/reload, firewall, provider ou envio foi executado.

### G0 — evidência antes de pedir janela

> Histórico de 4d282049: o pacote abaixo foi posteriormente fornecido pelo owner
> em 27/09 e está consolidado no preflight. Não repetir a solicitação. O complemento
> executivo ao final substitui a lista de pendências e detalha a contenção.

Não foram localizados os novos resultados privilegiados anunciados. O owner
informou que não sabe localizá-los. Acesso SSH existente funcionou e reconfirmou
HEAD `5ee2de6b`; as tentativas exatas `sudo -n nginx -T`, nft, iptables, ip6tables,
ufw e crontab root continuam exigindo senha. Não pedir senha ao owner, ampliar
sudoers ou tentar outro usuário para contornar isso. Unit PM2 reconfirmada enabled,
inactive; ExecStart resurrect, ExecReload reload all, ExecStop kill. Demais fatos
anteriores conservam sua data de observação; não são uma nova fotografia completa.

O operador com privilégio deve executar o bloco abaixo em sessão própria, guardar
a saída integral PRIVADAMENTE e entregar apenas a matriz sanitizada indicada.
Não encaminhar .env, dumps PM2 completos, chaves, cookies ou tokens ao chat/Git.
Este bloco coleta leituras; não habilita privilégios para o Codex:

```bash
sudo nginx -T
sudo journalctl -u nginx --since '2026-08-10' --no-pager
sudo nft list ruleset
sudo iptables-save
sudo ip6tables-save
sudo ufw status verbose
sudo systemctl cat pm2-deploy.service
sudo systemctl show pm2-deploy.service -p ActiveState -p UnitFileState -p Restart -p ExecStart -p ExecStop -p ExecReload
sudo systemctl list-unit-files
sudo systemctl list-timers --all
sudo crontab -l
sudo ls -l /etc/cron.d /etc/cron.daily /etc/cron.hourly
```

Complementos dirigidos: ler comandos dos cron jobs relevantes e rc.local, quando
existir; metadados/mtime dos includes e error_log Nginx identificado em nginx -T;
inventário de PM2 de outros usuários, agentes externos e painel de firewall/DNS.
Não inferir ausência de supervisores pela crontab de um único usuário. Saída
nginx -T é configuração de disco: correlacionar último reload/start bem-sucedido,
logs/mtimes e workers vivos. Sem essa trilha, disco = memória continua inconclusivo.

Entrega sanitizada exigida do operador: timestamp/origem; includes efetivos e
tratamento do server_name duplicado; rota upstream de cada host/alias/frontend;
política/regra IPv4 e IPv6 de portas diretas e firewall do provedor; todos os
iniciadores (PM2 vivo/saved/backup/boot/crons/CI externos) e responsável capaz de
suspendê-los. Acrescentar nomes/scripts/cwd/status dos processos, não seus envs.
Se faltar qualquer item, manter G0 **PENDENTE** e não pedir aprovação genérica de
janela. A documentação não transforma a indisponibilidade de acesso em PASS.

### Recomendação única e decisões do owner

Primeira troca por **parada controlada da API antiga inteira**, com retorno
primeiro pelo artefato de recuperação fechado; depois migration/candidato também
fechado. Não depender de uma regra Nginx para isolar campanhas enquanto o runner
antigo continua vivo. Essa parada cobre o processo que atende portas diretas,
frontend/aliases e scheduler, mas não prova que o provider já encerrou chamadas.
Ela só é admissível após inventário completo e decisão expressa sobre incerteza.

Responsáveis: operador privilegiado (entrada/supervisores/provisionamento), operador
de aplicação no usuário deploy (PM2/releases), DBA (backup/migration/reconciliação),
owner (janela, impacto, incerteza e liberação funcional). Codex apresenta evidências
e prepara comandos; execução futura depende de autorização específica. Registrar
quem ocupa cada função antes de G0 PASS, inclusive responsável por abortar.

Duas autorizações separadas: (A) interromper a API antiga aceitando ou recusando a
incerteza residual identificada; (B) liberar campanhas após verificação. A não
implica B. Se owner exigir prova de zero chamadas antigas, **A não pode ocorrer
com a instrumentação atual**: status sending=0, silêncio/espera e sockets não
fornecem essa prova. Não prometer janela numérica sem medidas de backup/restauração,
provisionamento e startup. Owner define limite de indisponibilidade e horário de
acionar recuperação; ultrapassá-lo não autoriza reabrir campanhas.

### Sequência de execução futura e pontos de parada

Preparar releases fora do checkout ativo, com artefatos compilados identificados
pelos SHAs acima e Prisma Client próprio de cada versão. Não usar git checkout,
npm ci/build ou deploy-vps.sh no diretório de processos vivos: o script genérico
pode aplicar migration/reload fora desta sequência. Evidência local aprovada é
reutilizada; preparação do artefato no alvo deve comprovar hash, dependências,
configuração privada, paths persistentes e compatibilidade, sem iniciar runner.
Os caminhos de release abaixo são PROPOSTOS, não provisionados/validados no alvo.

```bash
umask 077
CANDIDATE=/opt/re7online/releases/a1cc380eddcd1467b8e0d3a8e405f82689a25b3d
RECOVERY=/opt/re7online/releases/03f930e5453efd313a91a16de3e22057a0573d9c
GUARD=/var/lib/re7/campaign-operations/state.json
# OPS_CURL: arquivo privado 0600 com header superadmin; nunca imprimir seu conteúdo.
# EVIDENCE: diretório privado exclusivo da janela, fora de qualquer restore automático.
```

1. **Operador + DBA, antes da parada:** G0 PASS; releases e acesso superadmin
   conferidos; checklist de backup/restauração abaixo aprovado; capturar baseline
   de processos/worker/sessões e registros antigos. Inventariar todos os executores
   em host único e mesmo namespace Linux; não atestar single-host por conveniência.
   Se houver outro host, versão não instrumentada ou caminho de estado diferente,
   ABORTAR. Frontend/worker atuais continuam no checkout original.
2. **DBA, marco T0:** em transação READ ONLY, registrar agregados por tenant e
   correlação técnica tenant+campaign/message/requestId de submit_started,
   provider_accepted, OutboundMessage e test_send.requested/sent/failed. Conferir
   também logs de falha/persistência desde antes de T0 até a parada. Guardar IDs e
   logs privadamente, publicar somente contagens/estados. Reutilizar consultas do
   preflight; não refazer inventário de drift. Campanhas sending/scheduled são
   sinais, não inventário completo. Requisições em pré-validação e aceites sem
   registro podem não aparecer: registrar explicitamente **quantidade desconhecida**.
   Owner recebe essa evidência ANTES de decidir A.
3. **Operador privilegiado, após A:** congelar deploys/resurrect manuais e todos
   os iniciadores identificados em G0. Para a unit conhecida, se o estado ainda
   for enabled/inactive como documentado, `sudo systemctl disable pm2-deploy.service`
   SEM --now impede seu boot automático durante a troca sem parar daemon/worker.
   Conferir `systemctl is-enabled pm2-deploy.service` (esperado disabled, exit 1)
   e `systemctl is-active pm2-deploy.service` (continua inactive).
   Isso NÃO bloqueia start manual ou outros supervisores: controle deles é uma
   condição anterior, não presunção. Se estado divergente, ABORTAR sem usar
   stop/reload/restart da unit, kill ou reload all.
4. **Operador deploy, ponto de interrupção T1:** preservar dumps PM2 atuais e seus
   backups fora dos paths de resurrect, com ACL privada; então retirar SOMENTE a API:

   ```bash
   # EVIDENCE deve ser novo, privado e exclusivo desta janela; preservar antes da parada.
   install -m 600 /home/deploy/.pm2/dump.pm2 "$EVIDENCE/dump.pm2.before"
   # Se dump.pm2.bak existir, preservar também; nunca recriar histórico ausente.
   install -m 600 /home/deploy/.pm2/dump.pm2.bak "$EVIDENCE/dump.pm2.bak.before"
   pm2 delete re7-whatsapp-agent
   pm2 save
   ```

   Delete é a parada/removal intencional desta entrada PM2, não exclusão de dados.
   Não há drain antigo: uma chamada pode ser interrompida. Conferir que todos os
   PIDs/filhos antigos identificados cessaram, nenhuma API permanece em 3001 ou
   outras portas inventariadas, nenhum job/supervisor a recria, e worker/front
   mantêm PIDs/status. Usar `ss -ltnp` e projeção sanitizada de `pm2 jlist`; não
   imprimir env. Saved dump deve conter worker/front e NÃO a API antiga. Preservar
   o dump.pm2.bak anterior em EVIDENCE e substituir a cópia ativa de fallback pela
   cópia salva já verificada, para que fallback também não ressuscite 5ee2de6b:

   ```bash
   # PM2_HOME é o HOME real do daemon confirmado em G0; não inferir se divergente.
   # Após preservar originais e conferir conteúdo sem segredos:
   install -m 600 /home/deploy/.pm2/dump.pm2 /home/deploy/.pm2/dump.pm2.bak
   ```

   Não reabilitar boot ainda. Identificar processo sobrevivente exige investigação,
   não kill genérico por nome. Se não provar cessação/ausência de respawn, ABORTAR:
   não subir outro executor, não migrar, não restaurar automaticamente a API antiga.
   Conexão recusada prova apenas ausência daquele listener, não fim de envio remoto.
5. **Operador privilegiado/deploy:** validar dono, ancestrais, filesystem local e
   inexistência de symlinks no path GUARD. Se já houver ledger/lock/.uncertain,
   preservar e investigar; NÃO sobrescrever com estado vazio. Para caminho realmente
   novo, somente após verificação de que não existe estado de campanha em outro path:

   ```bash
   sudo install -d -o deploy -g "$(id -gn deploy)" -m 700 /var/lib/re7/campaign-operations
   sudo -u deploy python3 - <<'PYGUARD'
   import os, json
   p = '/var/lib/re7/campaign-operations/state.json'
   fd = os.open(p, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
   with os.fdopen(fd, 'w') as f:
       json.dump(dict(version=1, open=False, generation=0, tasks={}, audit=[]), f)
       f.flush(); os.fsync(f.fileno())
   fd = os.open(os.path.dirname(p), os.O_RDONLY)
   os.fsync(fd); os.close(fd)
   PYGUARD
   ```

   Estado inicial vazio descreve somente o NOVO mecanismo; não encerra registros
   antigos incertos. Registrar inventário/identidade privada do host; não publicar
   machine-id. Compartilhar o mesmo arquivo e diretórios auxiliares entre releases.
6. **Operador deploy, recuperação imediata do atendimento:** configuração privada
   completa já preparada, cwd e storages conferidos, Client antigo próprio. Exportar
   guard explicitamente no ambiente PM2 (sem imprimir segredos) e iniciar somente
   o artefato de recuperação. O ecosystem versionado contém só a API:

   ```bash
   export CAMPAIGN_OPERATIONS_FILE="$GUARD"
   export CAMPAIGN_OPERATIONS_TOPOLOGY=single-host
   export CAMPAIGN_OPERATIONS_HOST_ID="$(cat /etc/machine-id)"
   export CAMPAIGN_BUILD_ID=03f930e5453efd313a91a16de3e22057a0573d9c
   export CAMPAIGN_RECOVERY_ONLY=true
   export CAMPAIGN_SCHEDULE_PROCESSOR_DISABLED=true
   pm2 start "$RECOVERY/apps/whatsapp-agent/ecosystem.config.cjs" --only re7-whatsapp-agent --env production --update-env
   curl --fail --silent --show-error http://127.0.0.1:3001/health
   curl --fail --silent --show-error --config "$OPS_CURL" http://127.0.0.1:3001/admin/ops/campaign-execution | jq '{available,open,drained,generation,build,taskCount:(.tasks|length)}'
   ```

   Exigir build correto/closed, e testar atendimento pelos critérios abaixo; health
   isolado não aceita recuperação. `drained=true` aqui NÃO prova nada sobre 5ee2de6b.
   Se recuperação não servir atendimento, manter API parada e escalar; não voltar
   ao SHA sem guarda. Se passar, salvar PM2 e atualizar backup ativo somente após
   preservar o anterior; todas as referências de API devem apontar à recovery.
   Reabilitar a unit de boot apenas após esses checks e inventário G0, sem start/reload
   da unit (`sudo systemctl enable pm2-deploy.service`, se era enabled originalmente).
7. **DBA + owner, antes da migration:** revisar correlação T0/T1 e resultados
   recebidos depois da parada. Qualquer aceitação/snapshot/job incerto permanece
   preservado; não reenfileirar nem classificar ausência como rejeição. Se não há
   prova suficiente para liberação, continuar em recovery com campanhas fechadas.
   Não migrar enquanto o gate de evidências/backup/decisão estiver incompleto.
   Aplicar apenas migration já validada, com credencial provisionada privadamente:

   ```bash
   cd "$CANDIDATE/apps/whatsapp-agent"
   ./node_modules/.bin/prisma migrate status --schema prisma/schema.prisma
   # Exigir somente 20260925143000_add_campaign_execution_queue pendente.
   ./node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma
   ./node_modules/.bin/prisma migrate status --schema prisma/schema.prisma
   ```

   Nenhum db push/reset/manual DDL/resolve automático. DBA monitora locks/impacto
   e limite de janela aprovado. Em erro, conservar saída privada e banco como está;
   não rodar down/restore destrutivo. Recovery pode continuar se funcionalmente
   compatível; migration parcial/bloqueante exige diagnóstico antes de prosseguir.
8. **Operador deploy, segunda troca:** após migration confirmada e mesmos gates de
   supervisores, repetir suspensão de boot pelo operador privilegiado
   (`sudo systemctl disable pm2-deploy.service`, sem --now) e congelar iniciadores; parar/deletar só API recovery, conferir fim dos PIDs, preservar
   arquivo/lock/.uncertain e iniciar candidato com admissão fechada. Recuperação
   nunca enviou campanhas; atendimento também pode ter chamadas em voo: nenhuma
   promessa de drain genérico de Inbox/webhooks.

   ```bash
   pm2 delete re7-whatsapp-agent
   pm2 save
   # Conferir saved sem API e preservar fallback anterior antes de substituí-lo.
   install -m 600 /home/deploy/.pm2/dump.pm2 /home/deploy/.pm2/dump.pm2.bak
   export CAMPAIGN_BUILD_ID=a1cc380eddcd1467b8e0d3a8e405f82689a25b3d
   export CAMPAIGN_RECOVERY_ONLY=false
   export CAMPAIGN_SCHEDULE_PROCESSOR_DISABLED=false
   pm2 start "$CANDIDATE/apps/whatsapp-agent/ecosystem.config.cjs" --only re7-whatsapp-agent --env production --update-env
   # Repetir GET health e diagnóstico acima: available=true, open=false, build esperado.
   ```

   Os exports anteriores de path/topologia/host continuam necessários em toda
   sessão; ler configuração efetiva pela projeção autorizada, não imprimir env.
   Conferir startup scheduler sem claim/provider com guarda fechada. Preservar
   fila/snapshots/aceites e validar atendimento. Salvar estado PM2 e backup ativo
   com API apontando ao candidato só depois de aprovado; jamais salvar a antiga.
   Reabilitar boot somente após validar saved e fallback guardados, como no passo 6.
   Frontend atual/worker não são alterados por esses comandos. A UI de campanhas
   pode exigir frontend do mesmo candidato: preparar artefato e plano de troca do
   frontend separadamente, conferir compatibilidade e obter owner UI antes de B;
   não declarar publicação funcional da frente com apenas backend trocado.
9. **Owner B, somente após evidências:** registro de todas as instâncias no mesmo
   arquivo/build/topologia, open=false, tasks=0, sem `.lock` abandonado/`.uncertain`,
   resultados incertos antigos resolvidos por evidência (ou política formal que
   mantenha os destinatários afetados bloqueados, sem retry cego), atendimento
   aprovado, frontend pertinente e saved/boot apontando só para artefatos guardados.
   Contador vazio não basta. Nesta frente não há endpoint automático de reconciliação;
   se a política exigisse implementação nova, B continua bloqueada.
   Então obter geração atual por GET autenticado e POST
   `/admin/ops/campaign-execution` com `{open:true,generation:<geração lida>,reason:<referência da decisão B>}`.
   Exigir 200 e mesma geração avançada; 409/estado indisponível exige parar e investigar,
   não repetir abertura cegamente. Esse POST pode iniciar agendamentos vencidos:
   owner deve aprovar antecipadamente contagens/ordem/tenants elegíveis e budget.
   Não usar test-send/provider como sondagem de manutenção.

### Critérios de atendimento, impacto e recuperação

| Serviço | Durante retirada da API | Critério para considerar recuperado |
| --- | --- | --- |
| Campanhas/test-send de todos tenants | Bloqueados pelo fim do executor; depois pela guarda | B separado, sem pendências; nunca reabrir para testar |
| Inbox/CRM/auth/realtime | Indisponíveis/degradados apesar de frontend carregado | Login autorizado, lista/detalhe CRM e Inbox com escopo correto, histórico existente, conexão realtime; nenhum envio necessário |
| Webhooks/integrações | Podem falhar/atrasar/perder chamadas na troca | Rota correta, logs sem erros e evidência de processamento de inbound natural autorizado; sem evento observado, recebimento permanece não comprovado |
| Worker/sessões | Preservados, mas callbacks para API podem falhar | Mesmos processos/sessões, conectado sem novo QR; isso não prova replay/inbound integral |
| PostgreSQL | Ativo; migration pode disputar locks | Migração concluída e atendimento funcional; não modificar papel compartilhado |
| Frontend operacional | Continua servindo UI com API indisponível | Compatibilidade da UI/artefato aprovado pelo owner; troca frontend fora destes comandos |
| Site institucional/Vercel | Sem mudança | Não integra esta manutenção |

Recuperação após falha do candidato: fechar guarda quando disponível, não iniciar
mais trabalho; usar drain instrumentado, preservar `.uncertain`/tasks e SQL, parar
somente o candidato e iniciar recovery com mesmos paths/config (passo 6), sem
reverter migration nem apagar tabelas/jobs/snapshots. Se candidato crashou, drain
não é inferido; tratar incerteza. Se storage/SQL não permitem conservar estado,
manter executores sem admissão, não reparar e permitir retomada automática.
Worker/frontend nunca são parados via unit PM2 inteira. O SHA 5ee2de6b não é opção
de rollback para campanhas. Registrar horas de T1, retorno recovery, migration,
troca candidato, aceitação de atendimento e eventual B. Duração é medida por
etapa e limitada pela decisão owner, não por espera arbitrária de drain.

### Checklist de backup fresco e restauração — preparar, não executar nesta tarefa

- DBA confirma destino real, espaço/inodes/ownership/ACL e capacidade para dump,
  conteúdos e restauração isolada; os 42 GiB do preflight são fotografia antiga.
  Preservar snapshots com retenção pendente por ownership root; não limpar ou
  corrigir permissões incidentalmente. Offsite continua não comprovado.
- Antes de T1, backup fresco com timestamp, SHA de código/migrations, checksum,
  tamanho e catálogo; preservar os anteriores. Fazer outro ponto antes da migration
  se atendimento/worker continuaram escrevendo. `pg_dump` consistente não equivale
  a snapshot simultâneo de DB + filesystem. Definir RPO de writes pós-dump.
- Credenciais por serviço PostgreSQL privado, nunca URL no shell/log. Exemplo
  futuro, após DBA vincular `re7_transition_source` ao alvo conferido:

  ```bash
  pg_dump --dbname=service=re7_transition_source --format=custom --file="$EVIDENCE/pre-migration.dump"
  pg_restore --list "$EVIDENCE/pre-migration.dump" > "$EVIDENCE/pre-migration.list"
  sha256sum "$EVIDENCE/pre-migration.dump" > "$EVIDENCE/pre-migration.sha256"
  ```

  Lista/checksum não provam restore. Restaurar cópia em destino ISOLADO novo,
  previamente identificado por DBA e sem provider/rotas de produção, usando
  `pg_restore --exit-on-error --no-owner --no-privileges --dbname=service=re7_transition_restore_isolated "$EVIDENCE/pre-migration.dump"`.
  Não usar --clean, drop/reset nem apontar esse serviço ao banco vivo. Medir duração
  e validar leitura de dados/snapshots com chaves corretas. Se falta destino ou
  configuração desses serviços, backup/restore continua um gate pendente.
- Incluir configurações privadas/chaves de criptografia necessárias para ler
  snapshots, conteúdos persistentes, ledger completo + auxiliares, manifests dos
  dois artefatos e PM2 saved/backup originais em armazenamento seguro separado.
  Não versionar nem imprimir. Cópia de sessões Web ativas não comprova consistência;
  preservar worker in-place e definir backup consistente sem prometer restauração
  de sessão que não foi validada. Não parar worker para fazer o checklist passar.
- Scripts existentes backup-postgres.sh/backup-data.sh aplicam retenção; não usar
  às cegas para esta captura preservadora. Operador deve confirmar a rotina real
  de snapshots antes de invocá-la. Esta tarefa não executou esses scripts.
- Restore do DB vivo NÃO é rollback normal: apagaria aceites/inbound/escritas de
  outros serviços após o dump. Só em desastre com decisão separada de perda de
  dados e reconciliação. Recuperação ordinária é código fechado sobre o DB atual.

Gates pendentes concretos: G0 (leituras/inventário), responsáveis nominados,
artefatos/config privada no alvo, backup/restore/segredos e tempos, decisão A com
incerteza explicitada, aceitação do atendimento/frontend e decisão B. Não há
aprovação final de implantação implícita. NOT DEPLOYED / OWNER UI PENDING;
primeira transição pendente, 6683 CLOSED, DELIVERED/READ → HUMAN/WAITING separado.


## G0 consolidado — complemento executivo de 27/09/2026

Prevalece este complemento para evidência/pendências e contenção; os comandos do
plano anterior de releases, guarda, recovery, migration/candidato e validação
continuam condicionados aos gates. Nada abaixo foi executado. Fonte/atribuição e
matriz completa no [preflight](saas/CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md#g0-consolidado-em-27092026--owner-e-leituras-dirigidas).
Candidato a1cc380e, recovery 03f930e5. NOT DEPLOYED / OWNER UI PENDING.

### Lacuna dirigida que ainda impede autorizar a primeira parada

> Histórico de 5b391ecb: a leitura PYROOT abaixo já foi fornecida pelo owner.
> Não repetir. O complemento PM2 root ao final delimita somente a lacuna residual.

Um PM2 root foi observado, separado de deploy; sem filhos imediatos naquele
instante, mas dumps/fallback e user units não legíveis por deploy. O operador deve
fornecer somente projeção sanitizada desse estado e identificar quem/o que pode
iniciá-lo. Não repetir as evidências já entregues. Exemplo de leitura em sessão
privilegiada própria, sem PM2 start/resurrect/jlist que possa iniciar novo daemon:

```bash
sudo python3 - <<'PYROOT'
import json
from pathlib import Path
for name in ('dump.pm2', 'dump.pm2.bak'):
    p = Path('/root/.pm2') / name
    if not p.exists():
        print(name, 'absent'); continue
    data = json.loads(p.read_text())
    print(name, [{k: x.get(k) for k in
      ('name', 'pm_exec_path', 'pm_cwd', 'status', 'autorestart')}
      for x in data])
p = Path('/root/.config/systemd/user')
print('root_user_units', [x.name for x in p.iterdir()] if p.exists() else [])
PYROOT
```

Conferir árvore de processos root PM2, unidades/drop-ins/links indicados e mecanismo
que criou a sessão; leitura de comandos dos possíveis iniciadores em ambiente
privado, devolvendo apenas finalidade e controle. Ausência de filhos agora não
resolve saved/fallback/boot. Confirmar automações externas/deploy hooks com seu
responsável, sem deduzir ausência pela lista de units. Se houver referência à API
antiga, preparar retirada SOMENTE dessa entrada nesse supervisor e salvar estado
seguro, preservando original privado; não kill/reload all nem parar unidade global.
Não há comando mutável root PM2 pronto até identificar as entradas exatas. Esse
é o ponto de parada concreto, não pedido para reenviar nginx/firewall.

### Contenção temporária central — somente em janela aprovada

Escolha proposta: barreira temporária na porta real da API, incluindo loopback,
seguida da retirada do executor antigo. Controla acesso direto, Nginx, alias admin,
frontend /public-api e acesso local sem depender de precedência do vhost duplicado.
Não alterar INPUT/FORWARD/Docker existentes, não ativar UFW nem editar firewall do
provedor. Não corrigir exposição permanente das portas nesta frente.

**A decisão A vem ANTES da barreira:** ela interrompe tráfego API de todos os
tenants, inclusive HTTP já em andamento; não é apenas bloqueio de novas campanhas.
Scheduler/Promises antigas podem continuar até a parada do processo, e uma chamada
provider já iniciada pode ser aceita depois. A barreira não é um fence de egress
provider, não prova drain e não elimina a incerteza submetida ao owner.

Pré-condições: somente endpoints/listeners API identificados pelo inventário; sem
outra API fora de 3001; controle de todos os supervisores incluindo root; operador
nomeado com sudo e sessão SSH/console de recuperação; nenhum processo antigo será
iniciado automaticamente. Se algum item não for comprovado, não aplicar a barreira.

Operador prepara este arquivo PRIVADO na janela futura (`$EVIDENCE` exclusivo,
0700; umask 077), revisa e valida com nft --check; não executar agora:

```bash
cat > "$EVIDENCE/api-fence.nft" <<'NFT'
table inet re7_campaign_transition {
  chain api_input {
    type filter hook input priority -10; policy accept;
    tcp dport 3001 counter reject with tcp reset
  }
}
NFT
sudo nft --check --file "$EVIDENCE/api-fence.nft"
# Confirmar previamente que a tabela não existe. Se já existir, parar/investigar.
sudo nft list tables
# Somente depois da decisão A e validação:
sudo nft --file "$EVIDENCE/api-fence.nft"
sudo nft list table inet re7_campaign_transition
```

Família inet cobre IPv4/IPv6 do host, mesmo sem comprovação de IPv6 público.
Regra deliberadamente também pega loopback e pode encerrar conexões API existentes.
Não afeta SSH/DB/worker diretamente. Frontend 3000 pode exibir páginas, mas seus
chamados API falham; isso não constitui atendimento disponível. Outros listeners
API, containers/hosts não inventariados invalidam esse plano; não ampliar portas
às cegas. Regra temporária não persiste em reboot: durante a janela impedir boot
involuntário e garantir saved/fallback sem API antiga, nunca depender só da regra.

Verificação futura SEM enviar mensagens: GET health via loopback/direto e via
/agent-api/health deve falhar (conexão recusada/reset ou erro de upstream), incluindo
alias seguido de redirect; observar contador da regra. GET através de rewrite
público do frontend não pode alcançar a API. Não usar POST de campanha como probe.
Apenas depois dessas verificações retirar API antiga conforme plano anterior e
comprovar fim de todos os PIDs/ausência de respawn. Não esperar N segundos e chamar
isso drain. Capturar T0/barreira/parada e sinais antes/depois para reconciliação.

Reversão da barreira, exclusivamente da tabela criada por esta janela:

```bash
# Conferir que a tabela ainda é a criada pela janela, sem alterações de terceiros.
sudo nft list table inet re7_campaign_transition
sudo nft delete table inet re7_campaign_transition
```

Não executar flush ruleset nem restaurar dump global de firewall. Antes da retirada
da API, reverter a barreira devolve o estado antigo, portanto também campanhas:
exige decisão explícita de abortar A, nunca reação automática a um erro. Depois
da parada antiga, remover a barreira somente com recovery/candidato guardado de
SHA/config conferidos, ou API ainda parada sob controle; jamais ressuscitar 5ee.
Como a barreira bloqueia até health local, comprovar offline o artefato/cwd/Client,
configuração efetiva da guarda e ausência de executores antigos antes de removê-la;
para a primeira retomada usar recovery fechada INCONDICIONALMENTE em código.
Depois liberar tráfego para validar health/diagnóstico/atendimento; se falhar,
reaplicar a mesma barreira revisada e manter campanhas suspensas. Health não aceita
atendimento sozinho. Nova prova de diagnóstico não encerra chamadas antigas.

### Jobs concorrentes — tratamento temporário, não correção de higiene

Timezone lida: Etc/UTC. Jobs recebidos do owner: persistent snapshot 02:40; media
cleanup 03:00; duas linhas backup-data 03:15; backup PG com alerta 03:20; retention
03:30; check de backup 04:00. Não inferir fim dos processos pelo relógio.

Conteúdos lidos: backup-data aplica retenção 14 dias; PG aplica retenção configurada;
persistent backup usa rsync/manifest/link latest e remove snapshots pela seleção
7/4/3 documentada; media cleanup remove arquivos; retention faz soft-delete e
anonymize (inclui OutboundMessage/Event). Alertas podem enviar e-mail. Nenhum deles
foi executado nesta tarefa, nem foi encontrada invocação direta de campaignRunner
nos caminhos chamados inspecionados. Locks flock são próprios de cada rotina:
não garantem coordenação de todas nem eliminam duplicidade sequencial.

Para a janela, operador suspende temporariamente SOMENTE as seis entradas deploy
relacionadas (duas backup-data, media, retention, backup+alert e check) e a entrada
cron.d persistent snapshot, preservando conteúdo/metadata originais privadamente.
Não parar cron.service, timers globais ou atualizações do host. Comandos futuros:

```bash
crontab -l > "$EVIDENCE/deploy.crontab.before"
# Criar deploy.crontab.window a partir dessa cópia: comentar SOMENTE as seis
# linhas identificadas; revisão humana do diff, nenhuma outra linha alterada.
diff -u "$EVIDENCE/deploy.crontab.before" "$EVIDENCE/deploy.crontab.window"
# diff exit 1 é esperado pelas linhas comentadas, não liberação automática.
crontab "$EVIDENCE/deploy.crontab.window"
# Para a entrada cron.d, preservar cópia privada fora de /etc/cron.d, e preparar
# arquivo temporário root:root 0644 que apenas comente a linha 02:40 existente.
sudo install -o root -g root -m 0644 "$EVIDENCE/re7-converta-backup.window" /etc/cron.d/re7-converta-backup
```

Essa preparação é gate: arquivos `.window` não existem nem foram aprovados nesta
tarefa. O operador valida diff/hash e preserva original cron.d antes de instalar.
Não exportar credenciais que possam existir em outras linhas de crontab. O cadastro
cron suspenso não encerra job já iniciado: verificar processos/locks/logs; deixar
concluir ou adiar a janela, sem matar backup/retention em transação e sem remover
lock. Não iniciar captura/reconciliação/migration em paralelo com esses jobs.

Restabelecer originais somente após verificar que não houve edição concorrente
nos cadastros e que DB/storage/atendimento estão estáveis, anotando execuções
perdidas para decisão do operador. Não executar catch-up automático:

```bash
crontab "$EVIDENCE/deploy.crontab.before"
sudo install -o root -g root -m 0644 "$EVIDENCE/re7-converta-backup.before" /etc/cron.d/re7-converta-backup
```

Restaurar o cadastro original também restaura sua linha duplicada: eliminar essa
duplicidade é mudança de higiene separada. `.bak` Nginx igualmente terá revisão
própria: preservar fora do glob, mover somente o backup e validar nginx -t antes
de reload autorizado em outra ação. Nada disso foi aplicado como parte desta etapa.

### Ordem integrada, impacto, reversão e aprovação concreta

1. **Operador/DBA:** fechar lacuna PM2 root/automações; nomear responsáveis e
   substitutos; conferir releases/configs/Client/guarda compartilhada; preparar
   artefatos privados da barreira e cron, sem ativar. Não alterar papel superuser.
2. **DBA:** backup fresco + restore isolado comprovado, chaves e RPO/tempo; espaço
   e retenção pendente conferidos. Scripts lidos fazem descarte e não incluem
   automaticamente `/var/lib/re7/campaign-operations`: não executá-los cegamente
   como captura preservadora. Guardar também ledger + .lock + .uncertain com
   contexto de consistência, nunca limpar para copiar. Offsite/backups do provedor
   não estão comprovados. Dump sobre produção não é rollback.
3. **Owner A:** recebe sinais conhecidos/quantidade desconhecida das chamadas
   antigas, impacto em atendimento/webhooks e critérios de abortar, e decide
   explicitamente a primeira interrupção. Se requer zero incerteza antiga, não
   prosseguir com esta instrumentação. Registrar limite de parada e responsável
   pela recuperação; não apresentar 30–60 min como tempo comprovado.
4. **Operador:** suspender iniciadores concorrentes e crons selecionados; conferir
   ausência de jobs ativos; ativar contenção temporária da API; retirar somente
   executores antigos e referências saved/fallback/boot de TODOS os PM2 abrangidos.
   As instruções anteriores de disable sem --now valem só para unit deploy
   identificada; não resolvem automaticamente o daemon root. Worker/sessões ficam
   preservados. Se há executor residual, parar antes de migration/outro executor.
5. **Operador:** provisionar/configurar guarda persistente (sem sobrescrever estado)
   e recovery fechada. Retirar barreira após conferir artefato/cwd/config e ausência
   do antigo; validar atendimento. Saved/fallback seguros antes de reabilitar boot.
   Inbox/CRM/auth/realtime e webhooks ficam indisponíveis/degradados entre contenção
   e validação; worker pode permanecer conectado, callbacks falham. Nenhuma garantia
   de inbound/retries/replay integral. Consentimento CRM legítimo continua permitido
   quando a API guardada retorna, conforme RBAC/política existentes.
6. **DBA + owner:** gates de incerteza/backup resolvidos e autorização de migration
   aditiva; recovery continua fechada. Em falha de DDL, preservar DB/histórico,
   diagnosticar; não down/reset/restore automático. Depois conter novamente API,
   retirar recovery com mesmos controles e iniciar candidato fechado sobre o
   MESMO estado persistente, nunca uma cópia vazia. Não reiniciar worker/sessões.
7. **Operador/owner:** retirar barreira após comprovações, validar atendimento
   funcional, frontend compatível e diagnóstico em todas as instâncias. Em falha,
   conservar campaigns closed, conter tráfego quando necessário e retornar código
   recovery sobre o DB atual; não abrir para testar. Restaurar crons/boot apenas
   para estado seguro verificado, preservando arquivos originais/evidências.
8. **Owner B separado:** só então decide abertura com geração atual e sem
   task/lock incerto/.uncertain; revisar jobs/agendamentos vencidos e orçamento
   multi-tenant antes de abrir (abertura pode iniciar trabalho). Aceites antigos
   incertos exigem reconciliação; não bypass de ledger ou retry cego. UI/CRA não
   são aprovados por esta documentação ou pelo health.

Aborto antes da mutation: falta de controle PM2 root/outros iniciadores; inventário
incompleto de listeners; artefato/config não conferido; backup/restore/chaves não
comprovados; jobs de retenção ativos; falta de decisão A sobre desconhecidos.
Após parar o antigo, "abortar" significa recovery fechada ou manter API parada,
não desfazer contenção restabelecendo runner antigo. Preservar aceites e dados
multi-tenant; não ampliar alteração funcional para conseguir um PASS.

Próxima aprovação concreta: depois das confirmações dirigidas, autorizar a
contenção temporária descrita + suspensão/restauração dos crons selecionados +
retirada da API antiga + retorno do atendimento pela recovery fechada, com
responsáveis nominados, RPO e limite de indisponibilidade. Migration e abertura B
mantêm gates próprios; não é pedido genérico de janela nem aprovação implícita.

Todos os contratos permanecem: multi-tenant/RBAC, opt-out/revoke legítimos, alias
12/13, delivery truth, zero-eligible, preservação de aceites, pause/cancel sem nova
tentativa após chamada em voo, HUMAN/WAITING e worker/sessões. 6683 CLOSED;
DELIVERED/READ separado. NOT DEPLOYED / OWNER UI PENDING, sem aceite CRA.


## Complemento PM2 root — gate residual de 27/09/2026

> Histórico de 082a8946: PYROOTLIVE já executado pelo owner e recebido sem erros.
> Bloco preservado como registro, não como nova tarefa. Prevalece o encerramento abaixo.

O owner confirmou os dois dumps ausentes e `root_user_units []` pelo Python acima.
Essa solicitação está encerrada. Ver atribuição, leituras próprias e limites no
[preflight](saas/CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md#complemento-pm2-root--leitura-owner-de-27092026).
Scope `active/abandoned` + PPID 1 não prova origem histórica nem restart; nenhum
reiniciador automático root PM2 foi encontrado nas leituras acessíveis. O manager
`user@0.service` ativo justifica apenas a leitura residual abaixo. Não executar
CLI PM2 root, nem reiniciar manager/bus para obter evidência.

**Único bloco adicional proposto ao operador (somente leitura):** finalidade é
listar units carregadas/habilitadas do manager root, inclusive transientes, e
mostrar metadados de origem sem argumentos/env. A consulta usa o bus já existente;
se indisponível, registrar falha, não iniciar serviços. Não reler dumps/user dir,
Nginx/firewall/cron. Saída sem credenciais; caminhos ficam sujeitos à revisão do
operador antes de compartilhar.

```bash
sudo python3 - <<'PYROOTLIVE'
import os, subprocess, json
from pathlib import Path
bus = Path('/run/user/0/bus')
if not bus.exists():
    print('root_user_bus absent; no service started'); raise SystemExit(0)
env = dict(os.environ, XDG_RUNTIME_DIR='/run/user/0',
           DBUS_SESSION_BUS_ADDRESS='unix:path=/run/user/0/bus')
def query(*args):
    p = subprocess.run(['systemctl', '--user', *args], env=env,
                       capture_output=True, text=True, timeout=15)
    if p.returncode:
        print(json.dumps({'query': args[0], 'rc': p.returncode}))
        return ''  # no raw stderr/command/env
    return p.stdout
units = query('list-units', '--all', '--plain', '--no-legend', '--no-pager',
              '--type=service,timer,path,socket')
for line in units.splitlines():
    fields = line.split()
    if not fields: continue
    name = fields[0]
    print(json.dumps({'unit': name, 'state': fields[1:4]}))
    # Explicit allowlist excludes ExecStart/Environment and their secrets.
    print(query('show', name,
          '--property=FragmentPath,DropInPaths,Transient,Restart,Triggers,TriggeredBy'))
print(query('list-unit-files', '--no-legend', '--no-pager',
            '--type=service,timer,path,socket'))
PYROOTLIVE
```

Operador interpreta somente eventuais units iniciadoras: conferir localmente o
arquivo/wrapper indicado e devolver finalidade, identidade e controle necessário,
sem copiar comandos com segredos. Uma unit genérica pode chamar wrapper indireto;
a lista sem o vínculo não basta para aprovar. Nenhuma unit encontrada significa
apenas ausência nesse manager consultado; não controla SSH/manual/CI externo.
Responsável pela VPS deve identificar e congelar, **somente na janela aprovada**,
intervenções/deploy hooks externos capazes de criar apps como root ou deploy.
Nenhum mecanismo externo específico foi comprovado nesta investigação.

Critério de encerramento do gate: units iniciadoras eventualmente encontradas
mapeadas e com contenção aprovada; responsáveis por intervenções externas nomeados;
árvore/processos/portas conferidos antes da parada para detectar nova instância;
saved/boot deploy tratado conforme plano, sem matar worker ou daemon global.
Origem histórica não recuperável pode permanecer documentada se o controle atual
for demonstrado. Não condicionar o gate a recuperar shell history ou a provar
impossibilidade absoluta de um administrador executar comandos.

Próxima ação concreta ainda é essa leitura residual e atribuição de controle.
Depois, preparar aprovação A de contenção/parada/retorno pela recovery fechada.
Backup fresco + restore isolado, nomes do operador/DBA e decisão sobre chamadas
incertas continuam gates separados. A evidência de PM2 não prova quiescência, não
libera migration nem abertura de campanhas. Plano de impacto/reversão de 5b391ecb
inalterado; nenhuma parada/alteração de infraestrutura executada.
NOT DEPLOYED / OWNER UI PENDING; 6683 CLOSED; DELIVERED/READ separado.


## Root user manager — encerramento da coleta dirigida

Projeção PYROOTLIVE recebida do owner em 27/09/2026 sem erros; obtenção da leitura
**encerrada**. [Evidência e limites consolidados no preflight](saas/CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md#root-user-manager--projeção-recebida-e-coleta-encerrada).
Não repetir bloco, dumps ou G0. Units carregadas sem transientes/drop-ins, serviços
Restart=no, sockets e timer de sessão ativos; nenhum iniciador root PM2 comprovado.
Não concluir ausência de indiretos por nomes. Não há indício material novo para
leitura adicional de conteúdo; não abrir investigação histórica indefinida.

O controle de execução da janela ainda exige **confirmação do owner sobre quem
responde por intervenções/automações externas**, não mais uma projeção root manager.
Nomear responsável pelos acessos/deploy hooks e indicar como evitar novas criações
root/deploy durante a janela autorizada. Se existir iniciador concreto, incorporar
somente sua contenção e reversão ao plano. Não alterar agora serviços/permissões.
Preservar prevenção de resurrect deploy e conferência temporal árvore/portas antes
da parada; não matar PM2 global/worker nem tratar fotografia antiga como estado vivo.

Próxima decisão: atribuir esses responsáveis/controles. Preparar, separadamente,
backup fresco/restore isolado com DBA, RPO e limite de indisponibilidade; apresentar
chamadas conhecidas/incertas. Só então owner decide A (contenção/parada antiga e
retorno recovery fechada). O procedimento/impacto/reversão de 5b391ecb permanece;
API HTTP pode ficar indisponível e inbound/retries não têm garantia comprovada.
Migration e abertura B não são autorizadas por esta consolidação. Sem testes/builds
ou mudança operacional; NOT DEPLOYED / OWNER UI PENDING, 6683 CLOSED e materialização
separada. Coleta técnica encerrada não equivale a janela aprovada ou quiescência.


## Preparação executada em 27/09 à noite — comandos de A continuam futuros

> Histórico de 0e98af9a: etapa A executada posteriormente. Os nomes de configuração
> preparados abaixo foram invalidados durante a execução; usar o fechamento ao final.

[Evidência única, medidas e limitações](saas/CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md#preparação-da-noite-de-27092026--decisão-a-ainda-não-executada).
Responsável Deifson Oliveira; somente Deifson/Codex, sem execução paralela. Não
pedir senha. Backup/restore isolado realizados; processos produtivos preservados.
Roteiro completo revisado permanece privado no destino persistente abaixo como
`DECISION_A_COMMANDS.md`; nenhum comando mutável do roteiro foi executado.

```bash
PREP=/opt/re7online/backups/converta-persistent/preparations/night-20260927T233110Z
RECOVERY=/opt/re7online/releases/03f930e5453efd313a91a16de3e22057a0573d9c
PM2=/home/deploy/.npm-global/bin/pm2
# Única leitura privilegiada pendente, na sessão de Deifson:
sudo nft --check --file "$PREP/api-fence.nft"
sudo nft list tables
```

Abortar se check falhar ou tabela inet re7_campaign_transition já existir; não
substituir tabela alheia. Sem guarda provisionada ou autenticação superadmin já
conferida; preparar estes gates antes de levantar a contenção. Roteiro antigo de
PM2 deve usar a **configuração privada preparada** abaixo (cwd/paths/ambiente exatos),
não depender apenas de exports ou do ecosystem genérico versionado.

**Somente APÓS decisão A explícita, estado/horários reconfirmados:** comparar crons
atuais com cópias before, impedir execuções concorrentes já ativas (adiar, não matar
por timeout), suspender só as entradas propostas e boot known inactive/enabled:

```bash
crontab -l | cmp - "$PREP/deploy.crontab.before"
cmp /etc/cron.d/re7-converta-backup "$PREP/re7-converta-backup.before"
systemctl show pm2-deploy.service --property=ActiveState,UnitFileState
# Se divergir de inactive/enabled: parar o procedimento, não a unit global.
crontab "$PREP/deploy.crontab.window"
sudo install -o root -g root -m 0644 "$PREP/re7-converta-backup.window" /etc/cron.d/re7-converta-backup
sudo systemctl disable pm2-deploy.service
sudo nft --file "$PREP/api-fence.nft"
sudo nft list table inet re7_campaign_transition
```

Verificar bloqueio API direto/loopback/aliases/frontend; health também bloqueado.
Preservar saved/fallback atuais privadamente, retirar SOMENTE re7-whatsapp-agent,
salvar/inspecionar estado sem API antiga e substituir fallback somente após cópia
original preservada. Conferir fim de PID/filhos/listeners e ausência de respawn;
worker/frontend devem manter estado/PIDs. Aplicar exatamente os passos detalhados
de 5b391ecb, sem pm2 kill/reload all ou parada global. PM2 pode forçar encerramento;
nenhuma garantia de drain do código antigo. Provisionar guard novo com O_EXCL e
fsync conforme bloco PYGUARD anterior; abortar se houver estado/lock/.uncertain
pré-existente, sem apagar ou sobrescrever. Compartilhar mesmo path/host entre versões.

```bash
# Após os gates de parada/guard/paths; não executar nesta preparação:
"$PM2" start "$RECOVERY/prepared.ecosystem.cjs" --only re7-whatsapp-agent
# Conferir cwd/script/build, processos antigos ausentes e guard fechado offline.
sudo nft delete table inet re7_campaign_transition
curl --fail --max-time 5 --silent --show-error http://127.0.0.1:3001/health
```

Validar atendimento com Deifson e diagnóstico backend superadmin por credencial
privada existente; não expor token. Health não basta e guard novo não oferece
quiescência retroativa. Não declarar Telegram recuperado: ciphertext malformado no
backup requer disposição explícita do owner. Sem provider/envio real nesta etapa.
Após validação, salvar PM2, inspecionar saved seguro, preservar/corrigir fallback,
reabilitar somente boot originalmente enabled SEM start/reload e restaurar crons
originais após comparar com held files. Sem disparar jobs de catch-up. Não apagar
duplicidade histórica ou .bak Nginx incidentalmente.

**Reversão:** antes da parada, retirada da contenção devolveria runner antigo e
exige decisão explícita de abortar pelo owner. Depois da parada, não restaurar dump
PM2 antigo/5ee2de6b: manter recovery fechada ou API contida/parada para diagnóstico.
Reaplicar só a tabela temporária própria revisada se o atendimento falhar após
retirada; nunca flush ruleset. Não existe garantia medida de alternativa que devolva
atendimento se recovery falhar; não prometer limite de indisponibilidade nesse caso.
Não restaurar dump DB sobre produção como rollback normal.

**Tempo:** restore DB 4,299 s; probe local bootstrap+health 0,829 s, não atendimento
produtivo. Proposta de planejamento: iniciar até 23:00, reservar 20 min para executar
etapas humanas/validar ou escalar, antes do primeiro cron 23:40. Reserva não é SLA
nem disponibilidade presumida; horário final owner ainda precisa ser confirmado.
Sem check nft, disposição Telegram ou fim de janela confirmado, não iniciar A.
Migration e abertura B separadas. NOT DEPLOYED / OWNER UI PENDING; 6683 CLOSED.


## Etapa A — fechamento operacional e correções de invocação

[Evidência única e linha do tempo](saas/CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md#etapa-a-concluída--27092026-americafortaleza).
Recovery 03f930e5 ativa; candidato NÃO implantado, migration/abertura não autorizadas.
Owner validou Inbox/CRM demo em leitura; Telegram fora de uso e limitação aceita,
sem validação desse canal. Interrupção 21:22:54–21:30:53 Fortaleza (7min59s).
Boot/crons restaurados e saved/fallback seguro; worker/frontend preservados.

**Configuração válida atual (referência, não ordem para reiniciar):**
`/opt/re7online/releases/03f930e5453efd313a91a16de3e22057a0573d9c/stage-a.ecosystem.config.cjs`.
Os arquivos `prepared.ecosystem.cjs` e `prepared.ecosystem.config.cjs` anteriores
foram preservados como evidência, mas NÃO devem ser usados. Primeiro nome foi
tratado como script; o segundo revelou metadados PM2 indevidamente copiados em env,
que chegaram a iniciar API antiga sob contenção. Instância removida imediatamente
após identificação, sem salvar estado dessa tentativa. Registrar esse incidente;
não resumir como startup recovery bem-sucedido na primeira tentativa.

Na montagem de qualquer configuração futura, preservar variáveis de aplicação,
**não copiar /proc/environ inteiro para env do ecosystem**. Excluir metadados como
pm_exec_path, pm_cwd, pm_id, watch/status e PM2_*; validar script/cwd reais no processo
e no saved, tipos booleanos de watch e flags do guard. Recovery corrigida removeu
72 chaves impróprias; código Git não mudou. Sufixo reconhecido pelo PM2 do alvo é
`.config.cjs`. Construção de PrismaClient ou hash de arquivo não validam a semântica
de startup do PM2. Configuração do candidato antigo continua bloqueada para uso.

Invocações cron com caminho longo falharam sem alteração do cadastro. Usar cwd e
basename para aplicar os arquivos já revisados, somente na autorização apropriada:

```bash
# Referência para futuras janelas; hoje o original já está restaurado.
(cd "$PREP" && crontab deploy.crontab.window)
(cd "$PREP" && crontab deploy.crontab.before)
```

Ao final de A: API PID1478445/restarts0/watchfalse/cwd e script da recovery;
worker/frontend com mesmos PIDs; guard `/var/lib/re7/campaign-operations/state.json`
fechado, 0600, diretório privado 0700. GET autenticado superadmin confirmou build,
available=true/open=false/taskCount0. Não interpretar drained=true como prova
retroativa. Sem apagar locks/estado/uncertain; não houve abertura nem provedor real
provocado pela validação. Verificação de boot/saved/fallback foi estática, sem reboot.

Evidências privadas do alvo em
`/opt/re7online/backups/converta-persistent/preparations/night-20260927T233110Z/stage-a/`;
cópias sanitizadas locais em `local-evidence/recovery/stage-a-20260927/`. Origens
owner (sudo/UI) e Codex (verificação/PM2) separadas no preflight; segredos excluídos
no staging. Roteiro histórico preservado; estado atual prevalece sobre instruções
antigas que poderiam iniciar configuração inválida ou ressuscitar 5ee2de6b.

Próxima etapa requer autorização específica de migration, backup novo sem retenção,
status/checksums limitados à aditiva esperada, controle de locks/limite de abortar e
recovery fechada preservada. Não é ordem para executar agora. Ativação do candidato
exige corrigir configuração PM2 antes, e autorização distinta; abertura/owner UI/CRA
seguem pendentes. Nenhum down/reset ou dump sobre produção como rollback normal.
6683 CLOSED; materialização DELIVERED/READ separada.


## Migration autorizada concluída — recovery mantida, candidato inativo

[Registro único: backup, hashes, catálogo e tempos](saas/CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md#migration-aditiva-aplicada-com-recovery-fechada--27092026).
Em 27/09 às 21:57 Fortaleza, somente 20260925143000_add_campaign_execution_queue
aplicada via Prisma do release a1cc380e; 59→60 concluídas, sem pendências/falhas.
Recovery 03f930e5 permanece ativa/fechada, mesmo PID; owner confirmou Inbox/CRM demo
pós-DDL. Não repetir migrate deploy para “validar” nem reaplicar roteiro da etapa A.

Procedimento executado: gates de versão/guarda/saved/cron e espaço → checksums/history
somente leitura → conexão Prisma com timeouts próprios verificados → configuração
candidata limpa/inativa → backup novo com flock/hash/catálogo → reconferência dos
gates e somente migrate deploy → catálogo/checksum/status, health/diagnóstico
superadmin e Inbox/CRM owner. Sem parada, mudança de cron/boot ou retenção. Operação
terminou antes do limite 23:10; primeira rotina agendada 23:40. Limites 5s lock/30s
statement/40s socket/60s subprocesso; em erro preservar migration/logs/objetos e
recovery fechada. Não matar sessões alheias, resolver migration, fazer down/reset
ou restaurar dump sobre produção automaticamente.

Evidências/scripts privados no backup `preparations/migration-20260928T005604Z`.
`deploy.py` é registro da execução, com bloqueio contra repetição, NÃO comando para
próxima etapa. Dump novo hash/catálogo verificados; restauração reutilizada é a do
dump night-20260927T233110Z, não deste dump novo. Guarda/auxiliares/configuração ativa
corrigida e saved/fallback incluídos. Restauração de sessões e RPO zero não comprovados.

Configuração futura correta do candidato:
`/opt/re7online/releases/a1cc380eddcd1467b8e0d3a8e405f82689a25b3d/migration-prepared.ecosystem.config.cjs`.
Não usar prepared.ecosystem*. Valores de aplicação obtidos por chaves .env da
configuração ativa válida, sem metadados de /proc/environ. Parser/normalizador PM2
6.0.14 comprovou caminhos, fork/watch=false e merge sem sobrescrita; nenhum start.
Guarda compartilhada single-host, host conferido, scheduler desabilitado. Em eventual
ativação autorizada, usar invocação com ambiente reduzido (env -i PATH/HOME/USER
explícitos) e verificar processo efetivo/saved; esta referência NÃO autoriza start.
Recovery permanece no stage-a.ecosystem.config.cjs, permanentemente fechada.

Próximos gates, somente com autorização separada: reconfirmar guarda/configuração/
backup e estado vigente; ativação candidata fechada com validação real de atendimento
antes de salvar supervisão; em falha, recovery conhecida compatível com DDL aditivo,
sem ressuscitar 5ee2de6b. Abertura de campanhas e aceite owner UI/CRA são decisões
separadas. STOP após preparação. Sem garantia retroativa de drain/inbound/retry,
Telegram inalterado/não validado; 6683 CLOSED e materialização separada.


## Candidato fechado ativo — procedimento executado e retorno disponível

[Estado efetivo e evidências](saas/CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md#candidato-ativado-com-campanhas-fechadas--27092026).
Backend/frontend a1cc380e ativos; guarda fechada, scheduler desabilitado. Recovery
03f930e5 e frontend anterior 5ee2de6b disponíveis, worker/sessões preservados.
Contenção 27/09 22:19:42–22:21:51 Fortaleza; crons originais e boot seguro restaurados.
Não reaplicar os scripts históricos: swap.py tem marcador contra repetição e descreve
a troca já executada. Nenhuma abertura está autorizada neste fechamento.

Artefatos atuais:

- API: `<release-a1cc380e>/migration-prepared.ecosystem.config.cjs`.
- Frontend: `<release-a1cc380e>/frontend.ecosystem.config.cjs`, build
  esJVODIxT1rETZKxEPdX5 em frontend isolado, sem alterar checkout anterior.
- Retorno API: `<release-03f930e5>/stage-a.ecosystem.config.cjs`.
- Retorno frontend: `preparations/activation-20260928T011150Z/frontend-return.config.cjs`;
  aponta somente para Next anterior, não inicia API antiga.

Retorno, se necessário e coordenado: conter 3000/3001 com arquivo próprio revisado,
suspender rotinas/boot conforme gates, retirar SOMENTE processo afetado, conferir fim
de PID/listener antes de iniciar artefato de retorno com ambiente reduzido; verificar
/proc cwd/exe/entrypoint, host/guarda/scheduler/watch, health/atendimento, salvar estado
seguro e preservar/corrigir fallback, retirar contenção e restaurar rotinas. Nunca
kill/reload all, prepared.ecosystem* inválido, API 5ee2de6b, down/reset/restore DB como
rollback normal. Em divergência de identidade, manter contenção e interromper para
diagnóstico; não prosseguir confiando no nome PM2/build env. Worker não é alvo.

Validação efetiva: health/diagnóstico guard/build, HTML com BUILD_ID correto,
owner confirmou atendimento/lista/detalhe em sessão privada; grupo de execução não
comprovado porque DB está sem grupos. Não criar dados para preencher cobertura.
RBAC não alterado, sem fabricar sessões/aceite por papel. Logs novos sem erro e
processos sem restarts; boot verificado estaticamente, sem ensaio de reboot.

Para futura abertura: reler jobs/agendamentos/ledger, explicitar autorização e
motivo/geração. Em 22:27:39 estavam zerados jobs/grupos/leases/scheduled/sending.
Abrir guarda permite chamadas manuais/test-send autorizadas mesmo sem timer;
habilitar scheduler dispara varredura imediata e ticks. Estas decisões permanecem
separadas. Não remover lock/tarefa por timeout ou reenviar resultado incerto.
DEPLOYED CLOSED; validação completa de lotes/owner UI e CRA pendentes. Telegram,
6683 CLOSED e divergência DELIVERED/READ preservados separadamente.


## Liberação operacional concluída — configuração atual e resposta a falha

[Registro único de abertura e observação](saas/CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md#liberação-controlada-concluída--campanhas-abertas-e-scheduler-habilitado).
Em 27/09/2026, API a1cc380e reiniciada sozinha com guarda fechada; scheduler habilitado
por `<release-a1cc380e>/scheduler-enabled.ecosystem.config.cjs`. Identidade real,
health/diagnóstico e Inbox/CRM owner conferidos antes da abertura. Frontend/worker
preservados. POST superadmin abriu às 22:43:42.139 Fortaleza, geração 0→1, motivo no
registro único. Sem edição direta de ledger ou envio provocado.

Dois ciclos reais às 22:46:38.623 e 22:47:38.623, com tarefa scheduler/claim interno
admitida e concluída; fila permaneceu vazia, eventos de envio sem incremento e
zero saídas registradas no período observado. Logs sem erro. Saved/fallback seguros,
crons originais e boot inactive/enabled restaurados. Scripts em
`preparations/opening-20260928T013618Z` são evidência histórica, NÃO reaplicar open.cjs
ou restart-api.py. Nenhum teste/build/suíte foi repetido.

Configuração persistida habilita scheduler; guarda aberta/geração 1 está no arquivo
compartilhado e vinculada ao host. Um restart sem tarefas/fault pode retomar admissão
e varredura inicial; **não foi provocado restart com guarda aberta para provar isso**.
Se houver tarefa abandonada, lock/fault ou identidade divergente, o mecanismo fecha
admissão: não apagar evidências nem inferir rejeição/reenviar. Arquivo de configuração
fechada anterior continua disponível, mas não representa o estado ativo atual.

Resposta a divergência: consultar GET superadmin /admin/ops/campaign-execution e
fechar pelo POST existente com open=false, geração retornada e motivo explícito;
manter credencial privada. Depois inspecionar tasks/ledgerFault e chamadas aceitas/
incertas; fechamento impede novas admissões, não comprova drain imediatamente.
Não matar provider ou remover lock/tarefa por prazo. Em falha do mecanismo, conter
novas entradas conforme plano e avaliar processos/chamadas antes de parar; recovery
03f930e5 fechada sobre DB atual só quando necessária e coordenada. Sem down/reset/
restore de dump, sem API 5ee2de6b e sem alterar frontend/worker incidentalmente.

Validação funcional posterior pelo owner: conferir audiência, template e variáveis;
definir destinatários controlados/autorizados e janela antes de envio; conferir
snapshot/lotes/ordem, pausa/retomada e resultado sem retry cego. Esta liberação não
criou dados para preencher cobertura nem valida lotes completos, RBAC por sessões
distintas ou CRA. CAMPAIGNS OPEN / SCHEDULER ENABLED; 6683 CLOSED, Telegram e
DELIVERED/READ separados, incertezas antigas não apagadas.


## Estado após deploy de flows DB-only — 28/09/2026

[Registro operacional completo](saas/CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md#deploy-técnico-da-correção-de-flows-db-only--28092026).
API/frontend e8ebd776 efetivos; guarda compartilhada aberta geração 3, scheduler
habilitado e dois ciclos observados. Crons e boot restaurados; saved/fallback
seguros. Worker preservado. Nenhuma migration neste deploy, DB permanece em 60.
Os caminhos a1cc380e das seções anteriores agora são retorno, não versão ativa.

Configurações atuais: `<release-e8ebd776>/flow-write.ecosystem.config.cjs` e
`<release-e8ebd776>/frontend.ecosystem.config.cjs`. Ambiente reduzido, watch=false,
identidade single-host e guarda persistente existentes; não copiar ambiente bruto
PM2. Não repetir swap/open da preparação flow-write-20260928T192050Z.

Em regressão: fechar pelo mecanismo superadmin usando geração atual e motivo;
inspecionar tarefas/fault e aguardar drain real, sem matar chamadas ou apagar
locks. Conter e controlar supervisão conforme procedimento anterior; substituir
somente API/frontend afetados por a1cc380e, verificar fim dos processos antes de
iniciar retorno. Usar `scheduler-enabled.ecosystem.config.cjs` da release antiga
com guarda compartilhada fechada e `frontend.ecosystem.config.cjs`; conferir
script/cwd/build/host/flags, health e atendimento antes de liberar tráfego e
admissões. Salvar estado seguro, preservar fallback e restaurar rotinas.
Nenhum restore sobre dados novos, down/reset ou retorno à API do worker.

Backup fresco íntegro e restauração local comprovada no registro único; cópias
live de sessões/arquivos não provam inbound integral. Validação técnica produtiva
foi somente leitura. Em 28/09/2026, Eduardo confirmou “Funcionou, obrigado Deifson”
(relato encaminhado pelo owner): **DEPLOYED / CLIENT ACCEPTED**, restrito à
correção de gravação de flows DB-only em `e8ebd776`. Não informa modos/operações
exercitados nem comprova as quatro combinações locais. Sem aceite global CRA
ou de lotes. 6683 CLOSED; demais frentes preservadas.


## SECULT — plano futuro de implantação a3d16d4b, 29/09/2026

Consultar o [plano revisável específico](saas/SECULT_DEPLOY_PLAN_2026-09-29.md)
antes de reaproveitar comandos históricos. Nenhuma operação produtiva foi realizada
nessa preparação. Builds locais não autorizam o swap. O worker vivo contém módulos
compartilhados anteriores ao checkout 5ee2de6b: preservar o bundle real para retorno,
não recompilar esse SHA presumindo equivalência. Delta adicional de fila/CRM exige
revisão própria; shutdown worker ainda não prova drain de mensagens/auth/control.

Gates separados: revisão/ensaio worker → configuração/artefatos compatíveis → backup
fresco + restore isolado → fechamento superadmin/drain campanhas → contenção e
parada segura de TODOS os escritores → código default false → atendimento validado
→ decisão específica de ativação SECULT. Não inferir drain worker da guarda nem
zerar/expirar locks/tarefas. Não usar PM2 kill/reload all, REVOKE compartilhado,
migration ou restore produtivo como rollback rotineiro. Rollback a escritores
antigos exige revogação comprovada antes e impede garantia de concorrência futura.

# Revisão do novo 6683 — pacote API preparado, 03/10/2026

Consultar [revisão, diagnóstico e retorno](reviews/automation-freeform-window-release-af26/INCIDENT_6683_REVIEW_CLOSE_2026-10-03.md) e [manifesto](reviews/automation-freeform-window-release-af26/INCIDENT_6683_API_MANIFEST_2026-10-03.json). A correção `879cb1fa` **não está implantada**. `OutboundMessage.createdAt` é posterior à chamada Meta e à atualização de atividade outbound; o fence novo usa o snapshot persistido no `submit_started` antes do provider. Quatro linhas foram avaliadas por dry-run produtivo somente leitura, sem reparo.

A release API está isolada; o frontend e o worker mínimo ativos não foram tocados. Para a próxima janela, **não executar literalmente** os modos V4 já consumidos: criar preparação e nonces frescos, adaptar a sequência para preservar o frontend e coordenar a parada/reinício do mesmo worker mínimo com a API, mantendo zero conexões/locks antes da API e prova V4 antes do worker. Configuração privada candidata/retorno e auth atual ficam fora do Git. Retorno aponta à API af26, após saída comprovada da candidata e prova antes do worker; nunca restaurar dump sobre dados novos. Backup/restore fresco, rechecagem dos processos/sessões/trabalhos/guarda/scheduler e decisão de janela continuam gates obrigatórios. Nenhum comando desta seção autoriza deploy ou saneamento dos quatro casos.

O [pacote V4 novo da correção 6683](reviews/automation-freeform-window-release-af26/INCIDENT_6683_V4_WINDOW_PLAN_2026-10-03.md) e seu [preflight](reviews/automation-freeform-window-release-af26/INCIDENT_6683_V4_PREFLIGHT_2026-10-03.md) foram **PREPARED FOR WINDOW / NOT DEPLOYED** nessa captura histórica. Os modos `switch`, `return` e `return-partial` preservam o processo frontend af26 e coordenam apenas API + worker mínimo. Na janela seguinte, não executar o V4 af26 consumido nem seus nonces. Reconfirmar a leitura nft privilegiada, o estado vivo e a execução única antes de habilitar qualquer gate. O FAIL funcional novo 6683 e o saneamento dos quatro runtimes são frentes separadas; o reparo de setembro continua CLOSED.

**Resultado da tentativa de 03/10:** a [janela V4 6683](reviews/automation-freeform-window-release-af26/INCIDENT_6683_V4_ABORT_2026-10-03.md) foi abortada **antes** da contenção porque a primeira prova foi emitida antes do fechamento da guarda. O gate rejeitou execução e renovação depois da mudança de geração. A guarda voltou aberta na geração 15; processos af26, cron, boot e frontend não foram trocados. O pacote privado está desabilitado e deve ser preservado. Para nova preparação, executar e ensaiar estritamente `close.cjs` antes de `request/record preflight`; usar provas novas em diretório novo. Nenhum aceite funcional ou saneamento foi obtido.

O [executor sequencial V4](reviews/automation-freeform-window-release-af26/INCIDENT_6683_V4_SEQUENCED_REVIEW_2026-10-03.md) foi implementado e ensaiado **somente localmente**; substitui a sequência manual repetida, não os gates V4. A delegação root restrita proposta ainda não está instalada/autorizada. Preparação nova e provas novas são obrigatórias; a janela 6683 não recomeçou. Consultar [comandos de instalação/remoção e limites](reviews/automation-freeform-window-release-af26/v4-sequencer/README.md) antes de qualquer intervenção. Frontend e worker mínimo permanecem af26; API candidata 879cb1fa NOT DEPLOYED.

**Estado posterior em 03/10:** a [tentativa sequenciada e o retorno](reviews/automation-freeform-window-release-af26/INCIDENT_6683_V4_SEQUENCED_RETURN_2026-10-03.md) prevalecem sobre o parágrafo histórico acima. Após `authorize-switch` e `authorize-return` negarem a identidade dos filhos PM2 por `argv`, o helper foi corrigido para conferir metadados exatos de execução, e a recuperação compatível foi concluída. Contenção 22:41:01–22:46:09 UTC; API/worker/frontend af26 ativos, frontend preservado, guarda aberta geração 19, cron/boot restaurados; owner confirmou Inbox/CRM em leitura. A candidata 879cb1fa não passou pelo `unfence` e **não está implantada**. Não reutilizar a preparação consumida nem seus comandos históricos. O novo 6683 segue FAIL; o reparo homônimo de setembro permanece CLOSED. Nenhum dos quatro registros foi saneado ou reenviado.

**Estado efetivo posterior — 03/10, 22:08 Fortaleza:** consultar o [registro da janela corretiva](reviews/automation-freeform-window-release-af26/INCIDENT_6683_V4_DEPLOY_2026-10-03.md). API `879cb1fa` liberada, worker mínimo af26 coordenado, frontend af26 preservado. Guarda aberta geração 23; cron/boot restaurados, PM2 saved/fallback compatíveis, nft ausente. A primeira validação após retirar a contenção falhou sem detalhe interno capturado, mas a repetição somente leitura passou e a conclusão dos controles foi verificada; **não repetir start** nem reutilizar preparações/provas consumidas. Antes de outra janela, corrigir a captura do erro de validação e o caminho de conclusão após falha transitória pós-`unfence`. O retorno compatível exige nova contenção e saída comprovada; nunca restaurar dump sobre DB atual. Implantação técnica não encerra o FAIL funcional do caso novo 6683; os quatro runtimes históricos permanecem sem reparo, e o reparo homônimo de setembro segue CLOSED.

**Estado posterior — 04/10, retorno da tentativa b9:** consultar o [registro sanitizado da janela](reviews/automation-freeform-window-release-af26/HYBRID_B9_V4_ATTEMPT_AND_RETURN_2026-10-04.md). A API e o worker mínimo b9 foram iniciados, porém a validação detectou dependência compilada ausente no worker; o par retornou a API `879cb1fa` e worker mínimo af26. Frontend af26 preservado, guarda aberta geração 25, scheduler ativo, PM2 saved/fallback e crons/boot restaurados. Não reutilizar a preparação b9, política, provas, certificados ou intents consumidos. Antes de outra janela, fechar todos os imports compilados do worker no artefato empacotado e corrigir a renovação após prova consumida e a checagem HTTP sob nft; o primeiro erro do start de retorno permanece sem causa capturada. O retorno não restaurou banco/auth nem saneou os quatro registros; não reenviar resultados incertos. **b9 NOT DEPLOYED / OWNER VALIDATION PENDING**.


## Estado efetivo — contingência reativa afbb, 06/10/2026

**afbb — DEPLOYED TECHNICALLY / FUNCTIONAL ACCEPTANCE PENDING (06/10).** [Execução e evidências](reviews/automation-freeform-window-release-af26/REACTIVE_AFBB_DEPLOYED_2026-10-06.md): API afbb7455/worker mínimo reativo implantados pela sequência única corrigida; frontend af26 preservado. Backup fresco/restore isolado PASS, contenção32,984s, guarda aberta33, quatro sessões/cinco auth, health/DB/controle worker e crons/boot/saved/fallback/barreira PASS. Churn transitório resolvido pela renovação limitada; sem falha privilegiada/retorno/start repetido. Owner confirmou Inbox/CRM em leitura; contingência funcional não exercitada. CRM/CSV/CRA continuam pendentes, ciclo avulso demo aceito separado; históricos intactos, reparo de setembro CLOSED. Preparação consumida: não reutilizar provas/intents; eventual retorno pós-unfence exige preparação/política fresca.

## 10/10/2026 — posição .6: captura corrigida e preservação para decisão

Continuidade dcbeea48: [relatório único](reviews/automation-freeform-window-release-af26/position6-operational-preparation-20261010/README.md), com6provas dirigidas de ambiente, leitura SQL limitada, duas amostras root completas e preservação off-host do blob+índice dos cinco caminhos. Nenhuma exclusão/apply/ack/abertura/restart/deploy. Guarda37/tarefa/job e cinco Outbounds/CRM preservados; APIa26/workerafbb/frontendfa60 mesmos PID/start ticks. Capacidade continua DENY (475.422.720bytes na última leitura); revisar somente retirada das quatro cópias redundantes, com revalidação fresca individual e pós-auditoria. Mantidos originais/manifests e recusa inicial do coletor; corrigido FD de coleta sem excluir processos. Driver destrutivo só syntax-check, não execução comprovada. SQL/ack dependem de decisão separada e frescor/margem atuais. Frontend3227/prevençõesAPI permanecem pendentes; CSV/Syer, internacional, CRA-PR, multilote/AUTO separados, setembroCLOSED.

## Retenção operacional permanente

Fonte normativa única do procedimento; princípios em
[Change Policy](saas/CHANGE_POLICY.md#princípios-permanentes-de-retenção-operacional),
medição em [Operational Baseline](saas/OPERATIONAL_BASELINE.md#capacidade-e-retenção-operacional)
e gates de preparação no [Release Checklist](saas/RELEASE_CHECKLIST.md#retenção-de-releases-e-preparações).
Reutiliza a [proposta e auditorias de retenção](reviews/automation-freeform-window-release-af26/security-containment-20261012/retention-audit-20261013/RETENTION_POLICY_FOR_REVIEW.md),
sem criar política de dados ou rotina automática paralela.

### Registro e encerramento de geração

Responsável operacional prepara e mantém um sidecar privado, fora dos manifests
selados: ID, finalidade, estado ACTIVE/STANDBY/READY/REVIEW/CONSUMED/REFUSED/SUPERSEDED,
responsável e owner decisor, hashes/runtime, raízes/dependências, origem de cópias e
justificativa, bytes únicos por filesystem, live/saved/fallback, custódia, prova de
extração/recuperação, decisão, intent/recibo e próxima revisão. Publicar apenas resumo
sanitizado. Ao concluir/recusar/substituir, classificar no mesmo encerramento:

- Necessário no host: ativo, retorno compatível completo, preparação vigente e suas
  dependências transitivas (inclui launcher em geração consumida).
- Arquivável: bytes executáveis históricos sem vínculo, com custódia comprovada;
  propor retirada separada. Manter controles/manifests/journals/recibos e evidências
  obrigatórias, salvo revisão própria de seu contrato.
- Não resolvido: referências, obrigação de evidência ou custódia incompletas;
  manter e registrar lacuna/responsável, sem classificar como recuperável.

Custódia off-host deve ser permanente, privada, acessível ao owner, com conteúdo,
índice dos nomes/metadados/links, hashes, receita e extração isolada comprovadas.
Informar número real de réplicas e limites (inode/ctime/birth não são restauráveis
por tar). Temporário local não é custódia durável. Dados/evidências de tenant não
são eliminados pela retirada de um pacote. Manifests históricos permanecem intactos;
índice e recibo de retirada indicam nomes ausentes e recuperação exige novos bindings.

### Revisão semanal e após cada janela

Responsável operacional agenda manualmente uma revisão a cada sete dias; registrar
última/próxima data e owner. Fazer também após toda janela, recusa, substituição e
encerramento. Antes de nova cópia/build/tar, conferir artefatos existentes e orçamento.
Executar inventário delimitado READ ONLY com timeout/limites e saída privada: metadados,
hardlinks/FS, referências transitivas, processos/cwd/FD/mappings, symlinks, PM2
live/saved/fallback, boot/systemd/cron/Nginx, helpers/políticas, manifests/launchers/journals.
Não invocar PM2 como root para descobrir estado nem importar entrypoint, scheduler ou
provider. Captura deve respeitar contexto do usuário e provar identidade/consistência.
Observação parcial não recebe PASS. Hashing/grafo pesado pode ser ensaiado off-host
com fontes exatas e lacunas declaradas; não competir com janela prioritária.

A [rotina local](../scripts/README.md#operational-retention-reportpy) inventaria apenas
raízes locais explícitas e produz relatório/dry-run de revisão. Não coleta SQL/root/WAL,
não resolve o grafo produtivo, não autoriza retirada nem certifica capacidade. Associar
as capturas canônicas frescas para concluir os gates; registrar lacunas, candidatos
explicados e motivos de manter. Nesta publicação ela é LOCAL PARA REVISÃO, sem
instalação na VPS, cron ou automação. Correções de integração estão no
[backlog](BACKLOG_TECH.md#retenção-operacional--integração-preventiva-dos-preparadores).

### Retirada sob revisão específica

Priorizar cache/temporários e cópias redundantes verificadas; idade/tamanho sozinhos
não autorizam nada. Logs e snapshots seguem políticas efetivas próprias, não prune
ou truncamento genéricos. Procedimento obrigatório:

1. Allowlist literal de membros/raízes; bytes alocados recuperáveis, finalidade,
   referências transitivas, compartilhamento, risco, custódia e dependências protegidas.
2. Hash/metadata/owner/nlink/FS, custódia e restauração conferidos; budget/capacidade
   por executor e WAL/crescimento frescos. Observações completas em duas amostras,
   incluindo executor, arquivos abertos já retirados e mappings; inode reutilizado
   exige identidade por tipo/geração/target sustentada. Ambiguidade/permissão nega.
3. Driver/input próprios selados, dry-run e autorização do lote. Revalidar antes do
   intent e por raiz. Não seguir links externos nem modificar controles para PASS.
4. Uma execução; intent/recibo preservados. Timeout/parcial/incerto: inspeção sem replay,
   sem limpar marcador ou ampliar allowlist. Preservar negativas e diagnósticos.
5. Inspeção posterior inclusive em recusa; conferir membros, principals/dependências,
   owners/incompletudes, bytes efetivos/espaço disponível, WAL/DB/health/sessões,
   saved/fallback/controles. Copiar recibos/diagnósticos off-host e atualizar sidecar.
   Nenhuma conclusão pela saída do shell isolada.

Estado de implantação desta regra: documentação e rotina local publicadas para revisão;
preparadores atuais não possuem integração uniforme. Terceiro lote segue somente
PREPARADO; auth/banco e lotes anteriores concluídos não serão repetidos. NEWauth+NEWDB,
out.15 CLOSED e guarda38 fechada preservados; segurança externa/cifragem OPEN.

### Versão futura de integração local dos preparadores

Revisão14/10/2026: [contrato/comandos](../scripts/README.md#operational_preparation_reviewpy).
O coordenador local reutiliza calculador/grafo/captura consistente por hashes e
conecta inventário, capacidade, decisões de cópia, classificação e revisão no sidecar.
Output exige diretório do executor700 antes da captura; fonte/export600, arquivo novo600,
nenhuma correção automática. Foram executados24 testes locais, sem build funcional.

Nenhum adapter produtivo foi instalado/acionado: capturas/frescor/roots produtivos
não podem ser substituídos por input sintético. Integração local revisável distingue-se
da integração aos pontos de copy/staging/fechamento, ainda pendente no backlog.
Owner Deifson responsável pela revisão manual21/10/2026 ou após janela; não há cron.
Não altera a decisão pendente do terceiro lote nem encerra segurança externa/cifragem.

### Uso dos adapters futuros de preparação e encerramento

[Contrato/comandos](../scripts/README.md#operational_preparers_v3py),
[provas/limites](reviews/automation-freeform-window-release-af26/security-containment-20261012/retention-audit-20261013/PREPARER_INTEGRATION_2026-10-14.md).
Versões novas conectam o gate antes de copy/build/tar e ao fechamento auth/banco.
Não executar entrypoints históricos para importar essas regras; novos inputs/capturas
não adaptam bindings consumidos. Arquivo privado700/600 e hashes selados são requisitos;
relógio/frescor reais antes de cada passo, REFUSED/DENY e parciais preservados.

Encerramento exige journal canônico e recibo VERIFIED quando aplicável, não resposta
da UI ou formato parecido. Classificação não libera allowlist. Uso remoto exige seu
procedimento específico; LOCAL_PREPARED não autoriza janela e medição local posterior
não atesta espaço PostgreSQL/WAL atual. Cron/exclusão automática permanecem inativos.
Não reexecutar auth/banco/out.15; segurança externa/cifragem continua OPEN.
