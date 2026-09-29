# SECULT — fechamento técnico da janela de 29/09/2026

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


**CÓDIGO IMPLANTADO / ATIVAÇÃO PENDENTE / ACEITE FUNCIONAL PENDENTE.**
Execução autorizada pelo owner após revisão `042e386a`, incluindo primeira
interrupção do worker antigo e seus riscos residuais. Este registro atualiza o
[plano](SECULT_DEPLOY_PLAN_2026-09-29.md); suas etapas anteriores ficam preservadas
como histórico. Campanhas/CRA aguardam validação funcional do owner. DB-only
encerrada/aceita, inatividade no Guia pausada, 6683 CLOSED.

## Artefatos e compatibilidade

- API/frontend efetivos: `a3d16d4bdc4b143deeb6b66d4e963b0b4b3f216b`.
  Frontend BUILD_ID `hyNdsxtFPVdqkO80fSTAk` conferido local/publicamente.
- Worker: backport mínimo reproduzido sobre `bf5f1d76`, cinco fontes de
  `f06d49cb`, manifesto revisado em `042e386a`; 92 compilados conferidos.
  Não foi implantado o worker completo de a3d16d4b. Node v20.20.0.
- Configurações explícitas por release, watch=false, um processo de cada
  componente; ambiente e identidade reais conferidos. API não usa árvore worker.
  Os scripts escritores estão disponíveis na release compatível da API; nenhuma
  execução de escritor antigo foi identificada. Manutenções agendadas restauradas
  não substituem TenantOperationalConfig.config. Execução manual futura deve usar
  a release compatível, nunca checkout antigo.
- Saved/fallback iguais e referentes aos três componentes compatíveis; cron do
  deploy, cron de backup e boot restaurados. Unit enabled/inactive: habilitação
  de boot não foi confundida com iniciar outra instância agora.
- Banco permanece com 60 migrations; nenhuma migration executada nesta janela.

## Backup e restauração

Backup fresco persistente na preparação privada `secult-20260929T133547Z`, sob
`/opt/re7online/backups/converta-persistent/preparations/`. Inclui DB, catálogo,
conteúdo, dados auxiliares, configuração, guarda, saved/fallback, crons e retorno
worker com dependências. Segredos/bundles/evidências operacionais ficam fora do Git.

Dump: 22.157.561 bytes; SHA256
`2d5276f6a5a33729565a912fc4c807688b1bd81a936dd5b902a6985f6c2d0b8b`.
Dump em 5,248s; esse mesmo dump foi restaurado em PostgreSQL local isolado em
4,708s, com 60 migrations, sem aplicação, scheduler ou provider iniciado.
Catálogo e hash conferidos. Não houve restauração produtiva, limpeza de retenção
ou sobrescrita de auth. Cópias live de arquivos não são snapshot atômico com DB;
restauração isolada não demonstra recuperação de toda a plataforma nesse tempo.

## Sequência e impacto observado (UTC)

| Marco | Horário / evidência |
| --- | --- |
| Campanhas fechadas | 13:47:21, geração 4, drain comprovado, tasks=0/fault=null |
| Contenção API/frontend | 13:51:21, confirmação do owner |
| Saída antiga | 13:52:16, PIDs/filhos encerrados, conexões DB de clientes e advisory locks zerados antes do sucessor |
| Novos processos iniciados | Troca concluída 13:52:22; API, único worker, frontend |
| Tráfego restaurado | 13:53:30, confirmação do owner; contenção 2min09s |
| Admissões reabertas | 14:00:52, geração 5, motivo auditável pelo mecanismo superadmin |
| Scheduler observado | 14:01:18 e 14:02:18, tarefas admitidas e concluídas, sem tarefas inesperadas |
| Conferência final | 14:04:49, health/DB, frontend, worker e guarda aprovados |

A primeira interrupção foi expressamente autorizada com incerteza residual, não
um drain WEB_SESSION comprovado. Ausência de logs/timeout/liberação de lock não
foram usados como essa prova. Sucessor iniciou somente após barreira de saída de
processos antigos e suas conexões. Nenhum resultado incerto foi reenviado; não há
prova retroativa de ausência de aceitação remota não persistida. Não foi implementada
correção adicional de shutdown. API/webhooks/META e atendimento de outros tenants
podem sofrer impacto durante contenção; preservação de auth não garante inbound/retry.

## Verificações efetivas e limites

Health local e pelos dois caminhos públicos: HTTP 200, DB ok. Frontend Inbox e
settings/inbox: HTTP 200 e build correspondente. Worker control health autenticado
ok. Os três processos online, zero restarts na conferência. Três WEB_SESSION
reconectadas; QR_REQUIRED e DISCONNECTED preexistentes preservados; quatro registros
de auth preservados, sem logout/limpeza/restauração de credenciais antigas.
Owner confirmou na própria sessão: **Inbox e CRM funcionando**.

Antes/depois: jobs, grupos, leases e campanhas sending/scheduled = 0. Guarda final
OPEN, geração 5, tasks=0, ledgerFault=null. Scheduler habilitado, duas varreduras
observadas pelo ledger sem fixture e sem envio provocado. Guarda aberta não é
estado drained: o drain foi comprovado enquanto fechada antes da parada.

Testes locais anteriores conservam seu escopo: Node20/backport 104 PASS e provas
SECULT revisadas sustentam os respectivos artefatos; não são aceite produtivo ou
prova de shutdown seguro. Builds não eliminam limitações de tipagem documentadas.
Nenhum fluxo/atendimento real foi alterado para validação, nem mensagem artificial.
Telegram, DELIVERED/READ e validação funcional de lotes permanecem separados.

## Ativação e retorno

Nenhum tenant com a chave true na conferência final; SECULT continua ausente/false.
A ativação foi autorizada pelo owner, porém o setter existente exige sessão legítima
SUPERVISOR/ADMIN do tenant. Não existe grant de suporte ativo para SECULT na leitura
realizada. Não foi forjada sessão, usado token superadmin como identidade do cliente,
criada permissão paralela nem feita atualização SQL para contornar RBAC.

Próxima condição: sessão legítima já autorizada ou acesso de suporte concedido pelo
fluxo existente, para GET/PUT `/app/settings/inbox/closed-conversations`, somente
SECULT, seguido de confirmação persistida/auditoria. Aceite AGENT/SUPERVISOR depende
então de usuários legítimos e dados existentes; não pedir criação de fixtures reais.
Legados sem prova suficiente não precisam ser liberados: sem backfill, inferência
de responsável ou novo corte temporal.

Retorno preferencial mantém escritores compatíveis e chave revogada pelo setter
real. Hoje ela ainda está desligada. Retorno completo à API antiga e8 nega CLOSED,
mas perde a garantia de persistência concorrente; não é equivalente nem
automaticamente seguro depois de ativação futura. Não voltar a escritores antigos
concorrentes, não restaurar DB/auth sobre dados novos. Artefatos/configurações
anteriores estão preservados privadamente. Paradas futuras continuam sujeitas aos
limites do shutdown documentado e coordenação exclusiva de ownership.
