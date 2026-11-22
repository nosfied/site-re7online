# Persistência durável de runtime entre releases

**Estado:** `LOCAL_VALIDATED / IMPLEMENTED_NOT_ENFORCED / NOT_DEPLOYED / OWNER_REVIEW_REQUIRED`.

Este contrato especializa o modelo de releases imutáveis. Código, pacote e cache
continuam pertencendo à release; estado operacional necessário à continuidade
fica em raiz persistente autenticada, fora de `releases`. O primeiro consumidor é
`INBOX_READ_STATE_V1`; a regra não reclassifica outras superfícies sem prova.

## Inventário dirigido

| Superfície | Escritor/leitor | Persistência | Local observado | Destino correto | Gate |
| --- | --- | --- | --- | --- | --- |
| Inbox read-state (`shared`/`assigned`) | `readStateStore.ts` | necessária | `process.cwd()/.data/app-read-state` | raiz privada externa indicada por `INBOX_READ_STATE_ROOT` | qualification, preflight, acceptance e retirement |
| `.next/cache/images` | Next.js / finalize | descartável, mas autenticado no finalize | release frontend | permanece release-local | manifesto de cache V2 já integrado |
| mídia/sessões/runtime em PostgreSQL | consumidores existentes | necessária | roots externos ou PostgreSQL | manter autoridade atual | gates existentes; sem delta nesta frente |
| demais entradas de `.data` | escritores ainda não delimitados | inconclusiva | release API | preservar como `ACTIVE_DEPENDENCY` | negar retirada até classificação específica |

O defeito comprovado é apenas o read-state: a transição 41D → CB3721D4 deixou
20 chaves/aliases fora da projeção ativa. Os bytes históricos permanecem
preservados; isso não autoriza copiá-los.

## Contrato técnico

- Em produção, `INBOX_READ_STATE_ROOT` é obrigatório, absoluto e externo ao CWD
  da release. Ausência, symlink, owner divergente ou modo diferente de `0700`
  falha fechado; não existe fallback para `.data`.
- O layout continua tenant-scoped e separa `shared` de
  `assigned/<assignedUserId>`. Arquivos são `0600`, diretórios `0700` e writes
  continuam atômicos e serializados por destino. Escritores reais e reconciliação
  disputam o mesmo lock de filesystem derivado do destino; a fila em memória é
  apenas ordenação local, não autoridade de exclusão.
- Restart, candidata e rollback recebem a mesma raiz pelo ambiente PM2
  autenticado. A raiz não integra intents de retirement da release.

## Reconciliação única

O executor `readStateReconciliation.ts` recebe request privado autenticado por
SHA-256, roots com identidade física, fontes confinadas, tenant, scope e destino
derivado do layout canônico. As exclusões vêm de autoridade privada de
anonimização autenticada; journal e receipt ficam confinados à custódia. Ele:

1. autentica cada fonte e adquire lock exclusivo;
2. escolhe o maior `lastReadAt` válido por chave;
3. preserva `manuallyUnread` somente se sua observação não for anterior ao maior
   timestamp; ordenação ausente/ambígua é negativa;
4. exclui explicitamente chaves já anonimizadas;
5. usa compare-and-swap pelo hash anterior do destino;
6. registra `ATTEMPT → VERIFIED` em journal append-only e receipt exclusivo;
   retomadas antes/depois de rename e journal reconciliam o hash físico, e replay
   somente retorna `REPLAY_VERIFIED` após readback do destino.

Falha parcial preserva journal e destino. Não há rollback por cópia antiga: a
continuação autentica request, journal e hash do destino. Nenhuma reconciliação
produtiva foi executada por esta entrega.

## Gates recorrentes

`scripts/durable-runtime-persistence-gate.py` é o controle versionado isolado para
qualification, preflight, acceptance e retirement. Nesta revisão ele permanece
`IMPLEMENTED_NOT_ENFORCED`: os executores reais de admission/deploy/retirement
ainda não o invocam obrigatoriamente. Um PASS isolado não é autoridade operacional.

- **Qualification:** classifica superfície, prova raiz externa e vincula plano de
  reconciliação.
- **Preflight:** autentica device/inode, uid/gid, `0700`, ancestrais e raízes
  candidatas/rollback; receipt de reconciliação é validado semanticamente por
  operação, tenant, scope e destino quando declarado.
- **Acceptance:** exige a mesma raiz e readback verificado de continuidade,
  aliases, scopes e isolamento.
- **Retirement:** nega se `unreconciledReleaseDependencies` não estiver vazio.

O gate não altera receipts históricos de 41D/CB3721D4. Sua integração obrigatória
nos executores reais segue pendente; até lá não se declara metodologia recorrente
ENFORCED. Produção continua com a dívida conhecida até autorização de
provisionamento, reconciliação e deploy.
