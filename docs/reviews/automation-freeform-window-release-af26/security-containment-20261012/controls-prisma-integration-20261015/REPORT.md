# Controles integrados e consumidor Prisma — 15/10/2026

**LOCAL VALIDATED / NOT DEPLOYED para a integração dos controles.** Composição completa de engenharia, quatro modos, sem nova janela pronta. Recuperação do cron permanece **CONSUMED / RESTORED**; não foi repetida. Cifragem suspensa e segurança externa/cifragem OPEN. NEWauth+NEWDB, produção, política15b, frontend, guarda38 fechada e out.15 CLOSED preservados.

## Delta integrado

`prepare_future.py` consome os arquivos completos da v13 e o recibo da recuperação consumida, aplica a correção futura revisada e recalcula manifests dos quatro modos, window e review. Originais comprovadamente inalterados. Não copia/recompila runtime; a composição local aloca9.207.808B. [Patch integral dos consumidores](INTEGRATED_FUTURE.patch) e [provas/index](PROOFS_SANITIZED.json).

A admissão chama diretamente o contrato compartilhado dos dois controles, exige o gate `scheduled_controls_before` da cadeia e só então admite os cinco gates. Recuperação pré-parada e encerramento verificam crontab deploy **e** `/etc/cron.d/re7-converta-backup` separadamente; supervisão não substitui cron. Primeiro o helper restaura o controle de sistema; depois o consumidor deploy restaura exclusivamente o crontab conhecido. Leitura falha, estado desconhecido ou restauração parcial propagam negativa, sem certificado antecipado.

O checker root futuro compara o corpo funcional integral do spool deploy com `deploy.crontab.before`. Somente os três cabeçalhos gerados pelo Debian, reconhecidos estritamente, podem diferir; comandos, comentários funcionais e demais fontes cron continuam exatos. A fonte da política é15b efetivamente instalada. Alterações nos arquivos funcionais continuam DENY.

A composição usa o namespace/provas históricos apenas para ensaios. `APPROVAL_COMMIT=None` impede sua admissão operacional. O instalador histórico retido NÃO é instalador válido para uma janela futura. Não transferir nem executar esse diretório sobre a v13. A selagem externa `composition-index.private.json` abrange também conductor/checker/contrato, evitando hash autorreferente no review. Review de engenharia: `4bb21d25e22a0d55010979b9200631930300d509fadb1c138d1e4ab2f774cb7b`.

## Matriz de validação e limites

|Consumidor real|Precondição/prova local executada|Efeito produtivo não exercitado|
|---|---|---|
|`conductor/admit_gates.py`, nos quatro modos|Main completo: backup/custódia/lab concretos, checker root, revisão/manifestos, dois crons e emissão local dos gates. Ausência de autorização nega. Autorização/relógio simulados exclusivamente no ensaio.|Novo RPO, root/writers/SQL/proxy frescos; instalação e admissão na VPS.|
|`read-preparatory.py`|Novo gate de cron ligado ao consumidor; manifests concretos conferidos. Subprocesso externo reutiliza resposta READ ONLY real anterior, acrescentando verificações novas efetivamente executadas.|Cadeia externa inteira NÃO foi reexecutada; não é prova produtiva nova.|
|`Sequencer.close_then_preflight`|Validadores canônicos de baseline/ecossistema/restore sobre arquivos completos; gate dos crons, drain e preflight locais.|HTTP de contenção, lock/saída/ownership reais.|
|`Sequencer.recover` + ramo real8de `abort-prestop`|Recuperação pré-parada com os dois controles contidos; helper de sistema seguido da restauração deploy; estado final before e journal verificados em cada modo.|Escrita root/crontab, PM2/systemd/nft/SQL.|
|`Sequencer.finish` + `DelegatedControls.finish` + ramo real8de `restore-controls`|Encerramento real dos quatro modos, configurações completas, ambos crons before e journal complete.|Starts/SQL/conversão; provas pre-unfence de rede/nonce/processos reutilizadas e efeitos substituídos.|
|Contrato compartilhado/checker/manifests|14 casos adicionais: cabeçalho gerado aceito; drift funcional deploy/sistema, ausência/duplicidade, hashes nos quatro modos/módulo, owner, modo, symlink e sistema não restaurado negam.|Nenhuma escrita de cron ou mudança de política.|

São16 casos da sequência integrada (quatro por modo),14 casos dirigidos e4 provas seletivas do.env PASS (34 execuções locais). Os efeitos de sistema foram substituídos; os consumidores e arquivos completos não. As74 provas anteriores dos controles e170 de restore/Operations/recuperação continuam referências históricas válidas; não foram contabilizadas como novas execuções. Não se repetiram recuperação consumida, backup, testes de envio ou A/B v13. O laboratório certificado retido/parado mantém `temporaryDatabaseRemoved=false`.

## Prisma: fonte e políticas efetivas

Auditoria produtiva limitada em15/10 às09:29:03Fortaleza, transação **READ ONLY**, SELECT agregado, rollback, timeouts10s/1s. Fonte real de `privacyRetentionService.ts`: `33d36d97e189442baa65a357544ef274d6ac31ce5cdf5a7b0ccd21cb72c14740`; não se usou a versão mais nova do repositório como substituta. Código/SQL em `audit_prisma.py`/`prisma_audit.sql`. `.env` foi apenas capturado privadamente, nunca carregado ou modificado.

Todos os dez tenants estavam ACTIVE e tinham RetentionConfig persistida; fallback90 não foi necessário nesta amostra. O mapeamento alias→tenant/ID fica no relatório privado do owner.

|Alias|Dias persistidos|Conversas totais|Elegíveis pelo consumidor|Elegíveis sem closedAt|
|---|---:|---:|---:|---:|
|T01|90|89|0|0|
|T02|90|247|0|0|
|T03|365|30|0|0|
|T04|90|173|1|1|
|T05|90|29|0|0|
|T06|90|13|0|0|
|T07|90|129|0|0|
|T08|90|341|0|0|
|T09|90|13|0|0|
|T10|90|253|0|0|

Total1317;670 já soft-deleted e669 anonimizadas são contagens distintas, não somáveis. Últimos eventos `retention.executed` em13/10 às00:30Fortaleza; evento não prova integralidade de toda retenção histórica. Logs já auditados registram erro de autenticação após a rotação bancária. O novo SELECT não testou credenciais antigas nem executou Prisma.

O comando agendado não passa `--client-key`: `client.findMany` percorre todos os tenants, sem filtro de status. `dotenv.config` não sobrescreve env já fornecido, mas cron não herda o PM2; fonte típica desse comando é o `.env` do projeto. Predicado: deletedAt ausente, createdAt/updatedAt e última entrada/saída anteriores ao cutoff. **Não exige closedAt nem exclui atendimento humano/fila.** A amostra de T04 demonstra ausência de requisito de encerramento; não comprova que está em atendimento humano hoje.

`--dry-run` não satisfaz auditoria READ ONLY: antes do ramo dry-run, `getOrCreateRetentionConfig` chama upsert (create90/update{}). Não foi invocado. A auditoria usa SELECT sem criar políticas.

## Efeitos de exclusão/anonimização

A rotina chama anonimização e depois exclusão lógica em transações distintas, por conversa; não há transação única para lote/tenant. Falha posterior pode deixar efeitos parciais. O contador de uma conversa elegível é apenas a semente: seletores por identidade podem alcançar outras conversas e registros relacionados do mesmo tenant, inclusive sem reproduzir o cutoff em toda a expansão.

A anonimização minimiza identificação da conversa, mensagens/inbounds/payloads, Contact/identidades, Lead/notas, OutboundMessage e eventos selecionados; fecha/limpa atribuição e estado runtime. Eventos de auditoria de privacidade têm exceções explícitas. A exclusão marca deletedAt/closedAt e fecha runtime nas conversas correspondentes; não há deleteMany físico nesse serviço. Há remoção do estado runtime em filesystem após a transação DB, sem atomicidade DB/filesystem. Não se fabrica resultado de entrega/falha. Os escopos clientId/tenantId existem nos seletores; o script global não passa por RBAC HTTP. Esta revisão de código não substitui ensaio funcional de uma futura alteração do serviço.

## Reconciliação seletiva do .env — SOMENTE PROPOSTAS

Arquivo exato: `/opt/re7online/site-re7online/apps/whatsapp-agent/.env`, capturado privadamente600. DATABASE_URL aponta ao mesmo endpoint/usuário, mas senha difere de NEWDB; ADMIN_TOKEN, APP_AUTH_SECRET e WHATSAPP_WEB_WORKER_CONTROL_TOKEN também são obsoletos frente aos perfis ativos. Nenhum outro valor foi reconciliado ou presumido atual.

`propose_env.py` reutiliza o renderer seletivo revisado, verifica hash do perfil selado completo e igualdade dos valores compartilhados API/worker, produz duas alternativas privadas e preserva as demais linhas byte a byte. Propostas auth-only e database-only não foram aplicadas; não são passos sequenciais nem pacote aprovado. A comparação com o ambiente ativo e a custódia é prova anterior reutilizada, não nova captura de /proc.

|Consumidor/fonte|Efeito da proposta|Decisão|
|---|---|---|
|API/worker PM2 ativos, saved/fallback e perfis selados NEWauth+NEWDB|Não dependem desta edição do.env para os valores já injetados.|Preservar, sem restart/save.|
|Cron `retention:run` + Prisma/.env|DATABASE_URL nova reabilitaria alcance global, com a semente elegível descrita e expansão por identidade.|**BLOCKED**, decidir predicado/política e produzir previsão de impacto por identidade antes da aplicação.|
|Scripts/admin/dev que carregam o.env; src/db/Prisma|DATABASE_URL nova reabilitaria seus acessos quando invocados; auth-only mudaria referências administrativas ao próximo carregamento.|Nenhuma invocação autorizada; inventário direto anterior preservado, comandos ad hoc externos/desenvolvimento não são exaustivamente conhecidos.|
|Backup-data/media|Não carregam esse.env para DB/auth.|Nenhuma alteração.|
|Backup PostgreSQL legado Docker/local trust|Senha TCP não é usada nesse caminho.|Nenhuma alteração de credencial necessária; não executar backup para testar.|
|Alertas/check de backup que carregam.env SMTP|As quatro variáveis selecionadas não mudam SMTP; comportamento de alerta preexistente continua separado.|Não provocar notificações.|
|Boot/retornos compatíveis e Docker PostgreSQL|Referências pós-DB seladas independem desta proposta; Docker não deve ser recriado nem regressar a valores expostos.|Preservar NEWauth+NEWDB e contratos existentes.|

Fonte operacional canônica: perfis selados pós-rotação e credenciais vigentes entregues ao cofre privado do owner, não o.env legado. Antes de futura aplicação: inventário fresco de leitores, CAS do arquivo, cópia privada, aprovação de efeitos por consumidor, migração seletiva/launcher dedicado revisado e validação sem retenção/mensagens. Retorno nunca reativa segredo exposto. Um perfil dedicado para retenção pode limitar consumidores, mas não resolve sozinho predicado/expansão por identidade e não foi implantado.

## Pendências exatas e próxima ação

1. Revisar este delta local. Para futura janela será necessário gerar namespace/política/instalador novos com fonte15b, autorização própria e provas frescas RPO/custódia/root/writers/SQL-proxy/capacidade; a composição de engenharia não supre isso.
2. Prisma/.env: decidir se o predicado deve excluir atendimentos não encerrados e definir a fronteira de identidade; produzir previsão somente leitura do grafo completo antes de reabilitar DB ao job. Não executar retenção nem usar --dry-run como leitor. Reconciliação auth-only também exige inventário/efeitos aprovados.
3. Segurança externa/cifragem permanece OPEN; grant147, Telegram opaco, NEWauth+NEWDB e provas anteriores preservados. Nenhuma fase concluída reaberta. Três remanescentes de limpeza continuam apenas backlog.

Responsável operacional Deifson Oliveira; última revisão15/10/2026, próxima21/10/2026, antecipar após mudanças. Código local publicado não é integração instalada nem cron novo ativo. Evidências privadas: cofre do owner `controls-prisma-integration-20261015`, com índice/hash/modos700/600 e receita de recuperação; custódia fora da VPS, no computador do owner, não cópia física independente.
