# Artefato de recuperação de atendimento — revisão 2026-09-26

NOT DEPLOYED / OWNER UI PENDING. Branch `review/campaign-service-recovery-20260926`,
base exata `5ee2de6b8878aefa733a6fbe1b7f1553fd78ae2e`. Não é o candidato de campanhas.
O candidato está em `review/campaign-recovery-20260926` e contém a fila e a guarda/drain.
Este artefato mantém a aplicação antiga com campanhas permanentemente fechadas em
código: scheduler, runner interno, mutações de campanhas e test-send não podem
abrir por variável, arquivo aberto ou POST superadmin. Inbox/CRM/auth/webhooks
permanecem funcionais nos casos sintéticos validados antes/depois da migration.
Não aplicar migration, REVOKE, down migration, limpeza de jobs ou restore destrutivo.
Gerar Prisma Client próprio do schema desta branch; nunca compartilhar Client com
outra versão. Worker e sessões permanecem intocados.

## Estado persistente e segurança

Usar exatamente o mesmo `CAMPAIGN_OPERATIONS_FILE` absoluto do candidato em todas
as instâncias e releases do mesmo host Linux, fora dos diretórios de release.
Exemplo de configuração a provisionar futuramente: `/var/lib/re7/campaign-operations/state.json`.
Este caminho é proposta, não instalação comprovada no alvo. Diretório privado do
usuário da API, 0700; arquivo 0600. Modos são aplicados na criação, não corrigem
permissões pré-existentes. Operador deve verificar ownership, ancestrais, ausência
de symlinks e de escrita por terceiros antes de usar. Mesmo UID/root pode alterar
estado: não há isolamento contra um administrador do host ou runtime comprometido.
Diagnóstico/controle HTTP exigem o superadmin existente no backend; tenant admin
não pode consultar nem alterar. Nenhuma credencial integra este artefato.

Arquivo ausente permanece fechado; ilegível/corrompido ou lock ocupado impede
admissão e diagnóstico pode informar indisponível, nunca drain comprovado.
Mkdir exclusivo serializa escritores; temp 0600 + fsync + rename + fsync do diretório
preservam atomicidade em filesystem local. Lock/tarefas abandonados não expiram.
Restart/resurrect não autoriza limpeza ou reenvio; preservar estado, hashes,
intents e resultados aceitos e investigar trabalho incerto. Não usar arquivo vazio.
Mesma máquina/arquivo é o alcance comprovado; não é coordenação entre hosts/NFS.
A recuperação nunca abre, inclusive em topologia não validada. O candidato exige
atestado `CAMPAIGN_OPERATIONS_TOPOLOGY=single-host` e identidade local correspondente
em `CAMPAIGN_OPERATIONS_HOST_ID`, além do diagnóstico e abertura explícita.

## Evidência e limites

Validações locais anteriores preservadas: atendimento 4/4 sem tabelas novas e 5/5
com tabelas novas; bloqueio de campanhas 1/1 em cada DB; build backend PASS.
Troca candidato → recuperação → candidato 1/1, mesma guarda/DB, estado de
Campaign/jobs/batches/Event/OutboundMessage preservado e três submissões simuladas
únicas. Provider simulado, banco loopback sintético; nenhuma validação remota.
Nenhuma alteração funcional posterior neste artefato exige repetição dessas suítes.

A primeira troca do processo antigo não instrumentado permanece pendente: não há
quiescência retroativa. Antes de qualquer instalação, fechar inventário privilegiado
de entradas/supervisores e decisão do owner sobre impacto/incertezas. Parada de API
afeta atendimento e webhooks; não prometer preservação de inbound/retries. Não
ressuscitar o runner antigo desprotegido. Restaurar atendimento com este artefato
exige encerrar executores anteriores e manter campanhas suspensas; health isolado
não comprova atendimento. Retornar ao candidato com mesmo estado fechado; investigar
pendências e só abrir após condições do runbook. Owner UI e aceite CRA pendentes.
6683 CLOSED; divergência DELIVERED/READ → HUMAN/WAITING permanece separada.

## Publicação sem implantação

Somente branch de revisão, sem merge/force/deploy. `.github/workflows/ci.yml` roda
push em main/develop e PRs para essas branches, sem job de deploy. `vercel.json`
bloqueia auto-deploy das duas branches de revisão por `git.deploymentEnabled=false`
por nome exato ([documentação oficial](https://vercel.com/docs/project-configuration/git-configuration)).
Estado operacional, .data, evidências, dumps, credenciais e configs privadas excluídos.
Runbook/preflight e quatro documentos canônicos atualizados na branch candidata,
com histórico preservado: [preflight](https://github.com/nosfied/site-re7online/blob/review/campaign-recovery-20260926/docs/saas/CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md).


## Correção incremental sobre e6a12bc9 — 2026-09-26

Consentimento POST /app/campaigns/opt-out e POST /app/campaigns/opt-out/revoke
alcança os handlers/políticas existentes mesmo com guarda fechada. Exceção exata
por método/caminho; envio/test-send/scheduler continuam bloqueados em código.
CRM atual usa POST/DELETE /app/crm/contacts/:id/opt-out, já fora da guarda.
Autenticação, feature e isolamento tenant intactos. Nenhum transporte/runner novo.

Diagnóstico também reconhece `${CAMPAIGN_OPERATIONS_FILE}.uncertain` do candidato:
não declara drain sobre esse marcador. Preservá-lo junto do arquivo e locks nas
trocas/backups. Falha de ledger pós-aceite no candidato não impede persistência
SQL; a pendência não expira e requer revisão. Se banco e filesystem estiverem
indisponíveis, resposta pode ficar apenas em memória; não assumir rejeição/retry
seguro nem retomada automática. Manter executores sem admissão durante reparo e
reconciliar antes de retomar. Recovery não habilita nenhuma campanha.

Validação afetada: consentimento/política/tenant 1/1; consumidores CRM 4/4;
fechamento e diagnóstico 2/2; build backend PASS. DB local anterior à migration,
provider simulado/nenhuma chamada real. Evidência anterior compatível com DB após
migration preservada, sem repetição incidental. Novos testes de ledger pertencem
somente ao candidato; resultado detalhado no preflight da branch candidata.
NOT DEPLOYED / OWNER UI PENDING; primeira transição continua pendente, sem
quiescência retroativa. 6683 CLOSED; materialização permanece separada.
