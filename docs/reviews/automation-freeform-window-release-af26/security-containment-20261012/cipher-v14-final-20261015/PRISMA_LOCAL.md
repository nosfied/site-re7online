# Retenção Prisma — LOCAL VALIDATED / NOT DEPLOYED

A retenção automática por antiguidade passa a operar por conversa, sem inferir autorização de apagar/anonymizar todo o titular por identidade compartilhada. A operação explícita por titular mantém seu contrato e implementação anteriores.

- Protege HUMAN, IN_PROGRESS, atribuição, fila e handoff ACTIVE/PENDING. BOT/WAITING sozinho não comprova fila humana. Ausência/ambiguidade do runtime ou identidade compartilhada preserva todo o candidato.
- Revalida identidade/atividade da conversa, runtime e mensagens; preserva conversas recentes e outros tenants. PostgreSQL é o único perfil autorizado neste patch; JSON/hybrid nega e preserva.
- Transação Serializable, lock canônico de identidade e locks de linhas; lock_timeout1s/timeout10s. Política/estampas/version revalidadas, CAS e auditoria por item atômica. Concorrência/timeout nega sem replay. Não promete cobrir writers externos que ignorem o banco/contratos.
- Altera somente a conversa exata, mensagens vinculadas por conversationId+tenant e seu único runtime compatível. Runtime vira tombstone CLOSED, sem exclusão física/cleanup transitivo. Preserva Contact/CCI/Lead/notas/Inbound/Outbound/eventos anteriores/métricas/atribuições e status de entrega. Vínculos ambíguos permanecem intactos; não equivale a anonimização integral do titular.
- Prévia usa SELECT/findUnique, sem upsert de RetentionConfig, DML ou eventos; ausência de política usa default90 sem persistir. Relata motivos de skip e categorias preservadas.

Provas executadas novamente porque o código mudou:40 casos/regressões no serviço/rotas/PG sintético, mais2 dirigidos novos (política drift/perfil negado/lock deadline e orquestração real). Total42 PASS, sem falhas finais; typecheck --noEmit PASS. Node20.20.0,PG16.15,porta55781/database retention_lab estritamente local; cluster encerrado e evidências preservadas. Inclui concorrência real de claim/retenção, dois retainers, rollback na falha de auditoria, replay sem novo efeito, isolamento, aliases compartilhados, fila/humano/atividade, prévia sem escrita e regressões de titular explícito. Fixture FK e cast UUID/text foram corrigidos localmente; nenhuma tentativa produtiva.

Arquivos: privacyRetentionService.ts + conversationRetention.ts e testes correspondentes. Nenhum build funcional, deploy, retention CLI,SQL produtivo, alteração.env/credencial ou reativação de cron. Revisão futura deve decidir a implantação seletiva e seu alcance PostgreSQL; só depois reconsiderar a proposta.env por consumidor. As dez políticas existentes e a correção independente de cifragem permanecem preservadas.

Reprodução local (somente laboratório sintético já provisionado; DATABASE_URL deve apontar127.0.0.1:55781/retention_lab; teste nega outro alvo):

```bash
cd apps/whatsapp-agent
"$NODE20" --import tsx --test src/privacy/conversationRetention.postgres.test.ts src/privacy/privacyRetentionService.test.ts src/privacy/privacyRoutesContract.test.ts
"$NODE20" node_modules/typescript/bin/tsc --noEmit --incremental false
```

NODE20 indica o binário20.20.0 já disponível; variáveis de teste permanecem em configuração privada do laboratório, nunca carregar.env produtivo. O nome do teste de rotas deve seguir o arquivo real `src/privacy/privacyRoutesContract.test.ts`. Não reiniciar o laboratório ou repetir as provas sem alteração que justifique.
