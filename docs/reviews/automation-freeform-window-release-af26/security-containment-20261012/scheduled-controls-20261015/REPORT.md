# Recuperação restrita dos controles agendados — 15/10/2026

**PREPARADA PARA REVISÃO / CHECK READ ONLY REAL PASS / NÃO APLICADA. Cifragem suspensa.** Não repetir A/B da v13. Política15b instalada, fase null, cinco gatesfalse/executionfalse, API410272/worker410428/frontend188897, NEWauth+NEWDB, console, out.15 CLOSED e guarda38 fechada preservados. Nenhuma instalação privilegiada, edição.env, restauração de cron, execução manual de job, backup novo, stop/start ou SQL mutável nesta tarefa.

[Comandos concretos](COMMANDS_FOR_REVIEW.txt), [evidência sanitizada](RECOVERY_SANITIZED.json), [provas locais](PROOFS_SANITIZED.json), [matriz de consumidores](MATRIX.md), [delta preventivo](FUTURE_CONTROLS.patch).

## Origem e impacto real

A comparação é com os **29 registros completos** de `window/deploy.crontab.before` da v13 e com o arquivo de contenção selado, não com uma reconstrução de horários. As únicas seis diferenças canônicas estão nas linhas1 e25–29: comandos originalmente ativos foram comentados pelo perfil `deploy.crontab.window`. Os outros23 registros permanecem byte a byte. O spool root acrescenta ainda um cabeçalho de instalação08:53:24UTC; o corpo atual corresponde exatamente ao perfil window. Esse horário coincide com a contenção v10, mas o timestamp sozinho não identifica o executor histórico.

O código demonstra a omissão: `DelegatedControls.prepare` instala o crontab window; `Sequencer.recover(prestop)` chamava somente `abort-prestop` e restauração da guarda. O helper restaura o cron de sistema, boot e nft, porém não o crontab deploy. A afirmação anterior de controles integralmente restaurados foi corrigida;3,497s permanece como limite da contenção de admissão da v10, não como duração da suspensão de cron. A v13 recusou antes de B e não originou nova contenção.

Todas as entradas executam `cd /opt/re7online/site-re7online/apps/whatsapp-agent &&` antes do comando abaixo. Os redirecionamentos originais são preservados no input privado e nos arquivos selados; não há token nos comandos.

| Linha original | Horário VPS UTC / Fortaleza | Comando original e finalidade | Consumidor e compatibilidade |
|---|---|---|---|
|1|03:15 /00:15|`./scripts/backup-data.sh` → `.backups/backup-cron.log`|Tar de `.data`, flock próprio e retenção original de14 dias de seus arquivos. Não carrega.env nem usa autenticação API/DB.|
|25|03:15 /00:15|mesmo `./scripts/backup-data.sh`, mesmo destino|Duplicação já existia em before. Preservar as duas entradas; o flock pode coalescer execuções, não inferir dois backups completos pelo número de entradas.|
|26|03:00 /00:00|`MEDIA_LOCAL_RETENTION_DAYS=7 npm run media:cleanup` → `.data/logs/media-cleanup.log`|`cleanup-local-media.mjs`, filesystem de mídias outbound, não carrega.env/SQL. Exclusão segundo comportamento original de7 dias; não executada agora.|
|27|03:30 /00:30|`npm run retention:run` → `.data/logs/retention-global.log`|`run-retention.ts` → Prisma → privacyRetentionService. Carrega.env, usa DB por TCP e políticas dos tenants. A senha desse.env difere de NEWDB; log de15/10 comprova tentativa com falha de autenticação. Não será corrigida ou reabilitada por atualização.env nesta recuperação.|
|28|03:20 /00:20|`npm run backup:postgres:alerted` → `backups/postgres/postgres-backup-cron.log`|Wrapper → backup-postgres.sh: modo Docker/local trust observado; NEWDB não altera esse mecanismo. Em falha, alerta canônico pode usar SMTP existente; nenhuma notificação foi provocada.|
|29|04:00 /01:00|`npm run backup:postgres:check`, mesmo log|Lê manifesto/estado e alerta canônico via configuração.env existente. Não usa senha DB para avaliar o backup. Pode enviar alerta se insalubre, conforme comportamento anterior; não é teste por envio.|

**Ocorrências de horário perdidas desde a contenção v10: zero até a amostra real09:03:19.478343 Fortaleza (12:03:19UTC).** A VPS confirmou Etc/UTC; não há atribuição CRON_TZ/TZ no crontab. A suspensão começou08:53UTC, depois dos seis horários de15/10. Próximo vencimento: **16/10,00:00 Fortaleza** (03:00UTC). Isso não atesta sucesso de cada job anterior: o job Prisma já falhava por autenticação, e as duas linhas03:15 compartilham lock/destino. Não há compensação manual planejada.

Leituras dos logs existentes: backup-data com conclusão e mtime03:15:04UTC; media com evento completed/mtime03:00:03UTC; retenção com erro de autenticação/mtime03:30:05UTC; verificação PG mtime04:00:04UTC. Manifesto PG registra backup.success15/10 03:20:15UTC,40.993.796B, Docker,614 objetos, offsite not_configured **nesse mecanismo legado**. Não confundir com o backup canônico persistente/custódia das janelas, cujo cron de sistema permaneceu before. Journal cron acessível ao deploy retornou zero registros: não é prova de ausência universal de execução, nem de integridade do histórico root. Os horários/mtimes e eventos dos logs são as evidências disponíveis; não se atribui autoria histórica sem prova.

## Credenciais, consumidores e escopo

Foram capturados oito arquivos diretos e seis dependências/lockfile, com hashes e metadados; todos serão reconferidos pelo driver. O privacyRetentionService efetivo é o hash33d36d97 previamente auditado, diferente da fonte local mais nova; a análise usou **a fonte real**, sem substituí-la. Alerta canônico, backupEvidence, config/env e db reais também foram lidos, sem importar a aplicação. Npm/package-lock e scripts não mudam.

A comparação privada por dotenv.parse, sem source/export, comprovou: mesmo endpoint/usuário DB, **senha diferente de NEWDB**; ADMIN_TOKEN, APP_AUTH_SECRET e WHATSAPP_WEB_WORKER_CONTROL_TOKEN desse.env também não correspondem aos perfis selados ativos. Não se testou login com credenciais antigas. A compatibilidade da **API/worker ativos** foi reconfirmada separadamente pelos perfis NEWauth+NEWDB e identidades. Cron não herda o ambiente PM2; o crontab não contém atribuições de ambiente globais.

Logo, a restauração do agendamento não certifica a saúde de todos os jobs: preserva a falha preexistente do consumidor Prisma, sem ampliar acesso SQL ou usar segredos revogados. `.env` obsoleto e sua reconciliação seletiva continuam em proposta separada. Alertas podem ler a configuração externa existente; a emissão não foi exercitada. Não alterar esse arquivo, ativar funcionalidades, deduplicar linhas ou mudar retenção dos tenants neste lote.

## Recuperação pronta para decisão

Capsule inativa **scheduled-controls-recovery-20261015T121000Z**,26.786B de arquivos iniciais; sem cópia de runtime/banco. Driverac23f0eb/input694d3fa6/manifest53ce7684. O capsule preliminar115500, com seu check, permanece preservado; o final acrescenta a exigência de forma exata dos cinco gates (vazio/ausente/tipo/extra negam), reutiliza o input694d inalterado e foi conferido novamente pelos bytes finais. Conferência real na VPS passou às09:03:19Fortaleza, com o **mesmo driver/input** entregue, sem flag de restauração. Novo diretório próprio; nenhuma geração recusada/selada/consumida ou manifest histórico foi editado. [Hashes completos](RECOVERY_SANITIZED.json).

O comando de aplicação proposto obtém o lock canônico `.incident-6683-window.lock`, exige pacote v13/review a7b17b6a íntegro, política15b sem fase, fontes vivas/configurações/ticks, guarda38, barreira ausente, dumps600/conteúdo, supervisão, system cron before e hashes/metadados de16 consumidores/fontes, inclusive.env intocado. Exige crontab atual **exatamente window**, before íntegro e somente as seis diferenças aprovadas. Faz CAS fresco imediatamente antes do intent; não recaptura input para aceitar drift.

Preserva o crontab atual em evidência privada600, cria intent e executa **uma única chamada `crontab -`**, como deploy, com o before aprovado. Não requer sudo nem instala helper/política. Confere crontab resultante e todos os controles novamente antes do recibo. Recusa a instalação nos dois minutos adjacentes aos horários críticos; não agenda catch-up. Canonical flock coordena as ferramentas deste protocolo, não impede um administrador externo de editar cron fora dele: exige ausência dessas edições e verifica antes/depois; não se promete CAS atômico do utilitário crontab contra escritores não cooperantes.

Erro/timeout/resposta perdida ou pós-condição divergente preserva intent e observação RESTORED/UNCHANGED/UNKNOWN, sem segunda chamada, rollback automático ou recibo de sucesso. C READ ONLY deve ocorrer mesmo nesses casos. RESTORED após resposta perdida, isoladamente, não equivale ao recibo completo. Qualquer recuperação posterior precisa de inspeção/decisão própria; não usar A/B v13. Os comandos incluem exportação privada off-host, sem cat de JSON privado no chat.

## Correção preventiva local, sem instalação

`scheduled_controls.py` centraliza as duas verificações independentes: deploy e sistema. `future_revision.py` produz **somente deltas de código** sobre os arquivos concretos v13, negando anchors divergentes; não gera nova janela/política/cifra e não modifica originais.12 arquivos derivados: sequencer, cadeia preparatória, requisito do conductor, quatro ops/quatro delegated e módulo compartilhado. O preparador futuro deverá incluir o módulo em seus manifests e recertificar sua geração; esses deltas não são um pacote de cifragem operacional.

Pré-parada: prova as identidades originais, nega qualquer cron desconhecido **antes** do helper, restaura root pelo protocolo existente, restaura deploy pela origem aprovada e certifica os dois antes de guarda/journal de sucesso. Admissão/cadeia preparatória agora negam se qualquer cron não estiver before. Encerramento mantém as validações reais de health/config/guard e exige os dois crons before; não usa nft/supervisão como substituto. Falha parcial não pode emitir `prestop_restored`/complete.

**74 casos locais PASS:**46 sobre consumidores reais/candidato completo e28 do driver/CLI. Incluem dois crons independentes, estados mistos/desconhecidos, falha root, falha de instalação, resposta perdida, leitura divergente, pré-condições, replay, tipo/modo/owner/hash/output inválidos, quatro modos prepare/finish e negativas de escopo das seis linhas. Apenas efeitos de host/processos/HTTP/root são substituídos. A nova entrada preparatória é executada até o checker estático inalterado (sentinela local); não se declara nova execução integral das provas de cifragem. Restore/runtime/SQL/grant e suas provas anteriores válidas não foram repetidos.

Escape anterior: recovery estava coberto por mocks de restauração e inspeção parcial de nft/boot, sem pós-condição explícita do crontab deploy. Agora o teste executa `Sequencer.recover(prestop)` e a ação `abort-prestop` do helper8de reais (somente I/O/root/processos substituídos), inclusive propagação de falhas, e o consumidor final `DelegatedControls.finish` real em cada modo com configurações completas.

## Estado corrente

Aplicação da recuperação **aguarda revisão/decisão**. Nenhum job foi executado manualmente ou cron reabilitado. Cifragem suspensa; não repetir A/B, renovar backup ou emitir outra janela para contornar o problema. Custódia privada permanente com conteúdo/índice/hashes/receita dos controles, plano, código, provas e recibo READ ONLY; não é réplica física independente do computador do owner. Auth/banco/console/out.15 concluídos; segurança externa/cifragem OPEN e risco histórico mantidos. Responsável operacional Deifson; última revisão15/10/próxima21/10, antecipada após mudanças.
