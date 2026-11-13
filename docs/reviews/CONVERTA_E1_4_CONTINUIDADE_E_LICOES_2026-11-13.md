# Converta — E1.4: continuidade e prevenção de retrabalho

**Data:** 13/11/2026. **Tipo:** registro de continuidade e lições; NÃO é runbook nem autorização de operações. **Precedência:** `docs/saas/WORKING_PRINCIPLES.md`, `CURRENT_STATE.md/json`, `DEPLOY_RUNBOOK.md`, `DEPLOY_ARTIFACT_LIFECYCLE.md`. **Control plane no início deste registro:** `review/campaign-recovery-20260926@88a5e8b721f1f223cc0777c559c82e5cea43f17a`. Evidências operacionais são as informadas pelo Codex; hashes e receipts privados permanecem com suas autoridades originais.

## 1. Objetivo e baseline que JÁ funcionou

O objetivo original era utilizar build externo para reduzir o espaço exigido na VPS, com atualização imutável segura, rollback e fechamento mensurado dos temporários. O piloto `immutable-a838bd33-external-20261110T130618Z` **já havia produzido, instalado e ativado uma API em produção**, preservando frontend e worker.

Documento histórico: `Fechamento-do-piloto-a838bd33-e-padrao-de-build.md` (biblioteca do projeto); evidências versionadas em `docs/saas/DEPLOY_ARTIFACT_LIFECYCLE.md`, `CAPACITY_RECOVERY_POLICY.md` e PRs #375–#377.

- Gate de build na VPS **9.663.676.416 B**; gate de receber/verificar/instalar pacote externo **5.700.927.488 B**; diferença **3.962.748.928 B (~41%)**. **41% NÃO significa economia líquida de disco.**
- Build externo anterior **652,436 s**; escrita de pacote na VPS **10,366 s**; verificação **74,6 s**; instalação inerte **106,3 s**; restart API até readiness **2,646 s**. Medidas de etapas distintas.
- Equivalência de **34.381 entradas** verificada.
- Dois runtimes legados retirados: **982.900.736 B recuperados**. Worktree v2 de **1.027.608.576 B**, `PRESERVED_RETENTION_DEBT` até **10/12/2026 20:59:59 America/Fortaleza**, e worktree v1 de **671.199.232 B**: preservar, sem inferir autorização de retirada.
- PR **#375** comprovou observação privilegiada fechada no builder. PR **#376** integrou prova de retenção; PR **#377** comprovou ciclo sintético descartável e rollback com PM2 real na CI. **Ensaio CI não substitui ciclo completo de fechamento de uma release produtiva.**

**Regra:** iniciar sempre pela última execução bem-sucedida equivalente, comparar contratos, artefatos e efeito pretendido; alterar somente o delta necessário. Não refazer provas ainda suficientes.

## 2. Autoridade única da atualização real da Inbox

- Release: `immutable-fa10f4f5-external-20261112T233820Z`.
- Target de aplicação: `fa10f4f59c9a05328e536dd25a1668c3ba25939e`; árvore: `9ae01069b58e465eee1093132a5b4c5d421dcd40`.
- Control plane integrado: `88a5e8b721f1f223cc0777c559c82e5cea43f17a`; tree `7dd96ef167d3965dc45a84de3a9f4a6175487215`.
- Pacote imutável SHA-256: `29ec148a01b518e16f752ed8c289904b36edcc1ea11a03dc4003d743799ff6b1`; manifesto `8e255cdc234ccfa385751c934c181ed58eb2d0e8a9dcb1c71db81be1e9ffa3cc`; índice `312e047ec58514eb62f115c2efe115fe261de7deafdd052bd428b3ad4d376b19`.
- BUILD_ID: `4j3t9N75vsvYu9t3DoFq4`; API entrypoint `304ef14eb3db321a4380af768534750ac0a6823438bdae6fb3cb265b5d11bff1`.
- Producer `RELEASE BUILT` e `RELEASE VERIFIED`; export `EXPORTED / AUTHORITY_EXPORTED / SUCCESS`; recibo `012103fd3dd41987f4352ef61b635e3ba1866c2d3926dc416ac3f6e5d571a6bb`.
- Pacote transferido UMA VEZ, mesmo hash conferido na VPS, release instalada inertemente e verificada integralmente; **NÃO repetir build, transferência, verificação já válida, extração nem instalação**.
- Handoff schema 3 SHA `3a6751aa79baa3b55843a05f1cd00e424cd0b9efdd733cb69530e2f19a1f7304`. Intenção VPS de zero comandos inicial `80173fc0960293cd08b9ab1ba51aa3f437e770ed219be705b7344aa41afa1ebf` não serve para o driver por lock divergente; intenção sucessora **autorizada** `cf22eb0f466b448092e1bebd9bf83279c076cf654b6b00b4e57e725ade3b9bc2` com `approvedPaths=[]`, autorização `10cbcd2357fd9d8355308d7eb366f1c350521c79632a2d725c6732f4d80fe0cf`.
- Preflight da transação `immutable-fa10f4f5-external-20261112T233820Z-api-frontend-88a5e8b7-v1-once` concluído `PREFLIGHT_PASS`. Journal do preflight `292314f7693602ece4acd8874dec44ff8cb480fb01ea17f913217b55c4f007a4`; **não repetir preflight**.
- Ativação de API e frontend concluiu em `AWAITING_ACCEPTANCE`, sem rollback; journal `7874ae1fb8a1cd2b1ec3758628bcf7cc6af3ce7261c6180919d2b5b8ab8ddbea`, `saveCount=0`, marker ausente. API e frontend apontam à release nova; worker `immutable-e2e7f17a-20261022T005110Z` preservado.
- Login, Inbox, CRM, asset e health local/público passaram; confirmação humana explícita dos **cinco cenários funcionais de Inbox** recebida e usada.
- Request do aceite `403cd6774e6888e7610844d199b2fff002600ae6474571fec803fe6af58def48`; **ACEITE TÉCNICO PASS já materializado**, hash `1427ff7dd23e5a1059295fa400bc9f5d9def1c7d8395ff54a2cb3c47d238de7a`, conteúdo literal `ACEITE TÉCNICO PASS\n`, `deploy:deploy 0600`, inode `64769:786718`.
- **PENDENTE: finalize com autorização distinta, único `pm2 save`, marker e estado final, depois retenção e encerramento do builder. Não republicar aceite nem reiniciar/reativar.**

## 3. Desvios ocorridos e prevenção obrigatória

| Desvio comprovado | Causa | Regra preventiva |
| --- | --- | --- |
| Reconstrução de etapas e excesso de subdivisões | Falta de baseline explícita do piloto | Antes da próxima tarefa: matriz `COMPLETED / REUSABLE / MISSING`, com revisão, hashes e evidências |
| Geração falha por `cache` versus `npm-cache` | Lifecycle admitia uma raiz incompatível com o produtor | Validar o produtor real antes de `OPEN`; PR #382 corrigiu `roots.cache=<root>/npm-cache` |
| Resíduo de bytecode `preparation_artifact_lifecycle.cpython-312.pyc` | Inspeção Python sem `-B`; precedente também ocorreu no worktree histórico v2 | Sempre `python3 -B` e `PYTHONDONTWRITEBYTECODE=1`; PR #383 acrescentou reconciliação estrita. Não remover manualmente |
| Retirada bloqueada por `disposable_process_observation_incomplete` | Varredura sem privilégio; observador do piloto era fechado a `a838bd33` | PR #384 acrescentou perfil específico com helper privilegiado, install proof e coleta em `prepare/execute`; não ampliar perfil histórico |
| Handoff schema 2 não aceitava `EXPORTED/SUCCESS` | Exigia closure da metodologia anterior | PR #384 adicionou schema 3 que registra `PENDING_RETENTION_DEBT` sem fingir sanitização |
| Retirement intent vinculou lock incorreto | Usou `/opt/re7online/.deploy-canonical.lock` em vez do lock literal do driver | Antes de pedir `AUTHORIZE_ONCE`, comparar `generation_retirement_deployment_lock` com `scripts/converta-deploy.py::LOCK` = `/opt/re7online/backups/converta-persistent/deploy.lock` |
| Testes isolados PASS, integração falhou | Falta de contrato ponta a ponta entre consumidor e produtor | Testar **transições reais**; CI isolada não garante compatibilidade de artefatos |
| Documentação e evidências voláteis repetidas | Tratou snapshots como autoridades perenes | Hashes/receipts imutáveis continuam válidos; recapturar somente health, grafo, locks, PM2 e observações frescas no momento exigido |
| Reabertura de trabalho após êxito | Não distinguir fase concluída e próxima mutação | Reutilizar transação e request existentes; falha antes da mutação não autoriza novo build, janela, restart ou save |

## 4. Capacidade — valores e obrigações restantes

Fotografias relatadas, não ocupação atual comprovada neste momento:

- Builder antes do build **196.025.651.200 B** livres; mínimo amostrado **192.579.715.072 B**; pico observado **3.445.936.128 B**, 109.686 inodes. Após export, cerca de **193,41 GB livres**. Custódia exportada **154.689.536 B** (preservada).
- Raiz descartável bem-sucedida atualmente retida **2.508.197.888 B / 75.640 inodes**. **Zero bytes recuperados** até receipt `SANITIZED/CLOSURE_RECORDED`; não confundir recuperação projetada com realizada.
- Geração falha separada `immutable-fa10f4f5-external-20261112T211724Z`: **78.295.040 B**, `EXPORTED / FAILED`, bytecode preservado; não misturar intenções.
- VPS: pacote de custódia **148.213.760 B**, release instalada cerca de **989.159.424 B**. A permanência das seleções anteriores/retornos é exigência operacional, não lixo. Último livre relatado após ativação **7.246.856.192 B**; medidas posteriores podem diferir.
- Build novo ~**757 s** e piloto anterior **652,436 s** (cerca de 16% mais lento neste ciclo, sem atribuição causal). Transferência nova **22,9 s**; verificação VPS ~**78 s**; instalação ~**111 s**. **Não inferir economia ponta a ponta dos 41% de gate.**
- Obrigatório ao final: bytes/inodes antes e depois em ambos hosts, pico amostrado, custódias necessárias, recuperado real, tempo e eventuais resíduos. Não apagar releases ativas, retornos ou dívidas históricas por economia artificial.

## 5. Continuação exata — NÃO REINICIAR

**Próximo marco (se autorizado pelo responsável):** `finalize` da transação **já aceita**, exclusivamente pelo wrapper versionado `scripts/fixed-current-finalization-continuation.py`, sob lock canônico, revalidando journal `AWAITING_ACCEPTANCE`, aceite hash `1427ff7d...`, worker/PM2/current/health e intenção de retirement de zero comandos. Uma única execução `pm2 save`; marker `DEPLOYED`; encerramento documentado. Se negativa, comparar o precedente fixed-current antes de qualquer retry; jamais repetir ativação ou save.

**Segundo marco independente:** fechar raiz do builder bem-sucedida depois de `prepare` com observação privilegiada fechada e autorização `AUTHORIZE_ONCE` específica; executar e comprovar raiz ausente, Git sem worktree e receipt terminal. Se `sudo` exigir credencial, autenticação humana local, nunca pedir a senha ao agente. Geração falha tem recuperação própria posterior.

**Regra para próximas atualizações:** checklist de compatibilidade **antes de abrir geração e antes de solicitar autorização**, com quatro provas: (1) produtor↔lifecycle (roots/cache); (2) export↔handoff↔retirement; (3) retirement↔driver (lock literal); (4) observer↔runtime (privilégios/perfil). Não aceitar novos PRs de infraestrutura apenas porque há um obstáculo: primeiro comparar a última operação equivalente de sucesso e corrigir o delta mínimo; não usar a implantação como laboratório de um novo fluxo.

**Estado documental:** este arquivo é registro dos feitos e pendências; não altera `CURRENT_STATE`, não concede autorização para `finalize`, `pm2 save`, retirada ou limpeza. Após receipts produtivos, reconciliar `CURRENT_STATE.md/json`, documentar fechamento e atualizar o índice.
