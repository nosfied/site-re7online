# Converta — fechamento P00, métodos de retirada e passagem ao backlog (14/11/2026)

**Estado:** `P00_EXTRAORDINARY_CLEANUP_CLOSED / RESUME_PRODUCT_BACKLOG`.
**Autoridade superior:** [WORKING_PRINCIPLES.md](../saas/WORKING_PRINCIPLES.md). **Escopo deste registro:** síntese auditável dos receipts informados, revisão cruzada dos documentos do branch operacional e padrão para novas gerações. Este texto **não** é autorização de retirada, alteração de produção, deployment ou expurgo da custódia.

## 1. Resultado terminal — sem repetição

| Lote excepcional | Caminhos | Bytes físicos recuperados | Inodes | Receipt terminal | Condição |
| --- | ---: | ---: | ---: | --- | --- |
| Cinco runtimes pré-contrato | 5 | 5.055.328.256 | 180.704 | `3fcb72eaebb343c233d417102749f7bdd0fe1b93e1bd243384ba1e6c27c1fa06` | terminal; não repetir |
| Dez releases legadas | 10 | 8.523.984.896 | 279.130 | `25788ae257beb85d6c342cd2a06678617792e3a06b69de88c43b1997cf16c451` | terminal; não repetir |
| Três frontends históricos | 3 | 1.917.009.920 | 76.717 | `ece95abecc17a9b74a278f35cbfb9164cde109ecf9159e5cc7075fa37a9365c7` | terminal; não repetir |
| Campaign API histórica | 1 | 363.323.392 | 9.839 | `8c6e5013b62d8f9640136ad9c7965314001a313a7ecc6ae392bd2fc1eaee6082` | terminal; não repetir |
| Nove releases com `.data` físico | 9 | **8.897.097.728** | **309.433** | `4c834211cf16c0b4b7418e18641bbc090c04280d8e30b7f2b2c4661969f8dc2a` | **terminal; não repetir** |
| **Total desses cinco lotes** | **28** | **24.756.744.192** | **855.823** | receipts individuais acima | **fechado** |

A execução mais recente obteve journal SHA-256 `f5839ac5161d4138ea42e58eac7574e1a4490c472a0fa28db828fa24f5b677a9`, com **9 ATTEMPT + 9 RESULT exitCode=0 + 9 VERIFIED**. A autorização privada consumida tem SHA-256 `f3965d7e1f44882ee1cb42f94270b0dba846e3c1861d6b3c50cc4f1a7ceee728`, observação privilegiada EXECUTE SHA-256 `4b674ca1b69dd27c8749d2929c6c090fc3fb1eae8d67c9a678897f4ded735599`. Intenção `6b3a69abff2176854e1c47edaa6a0f775171d130cd7e6ae8054c225e9eec2a7d`; comandos `9d5be058ea18e93ba7ad0534d137d3d78a066dde96c754288fae85c68f2b634d`. Os nove caminhos estão fisicamente ausentes conforme receipt terminal.

Medição do **último lote**: 22.889.132.032 → **31.786.229.760 bytes livres**; 9.290.172 → **9.599.605 inodes livres**. A diferença medida foi 8.897.097.728 B, **32.768 B inferior** ao potencial preflight de 8.897.130.496 B; usar a medição terminal como resultado, sem forçar equivalência. São bytes decimais, não GiB. Total de 28 caminhos inclui somente os cinco lotes da tabela; outros expurgos históricos constam de receipts separados e **não devem ser somados automaticamente**.

Produção reportada após o último lote: API e frontend `immutable-fa10f4f5-external-20261112T233820Z`; worker `immutable-e2e7f17a-20261022T005110Z`; mesmos PIDs, PM2 restart count 0, health API `ok=true/db=ok`, frontend HTTP 200, seleções e dump inalterados, locks liberados. São **evidências reportadas do momento da operação**, não promessa de estado vivo futuro.

## 2. Metodologia comprovada e suas variantes

**Pré-seleção econômica e operacional.** Priorizar resíduos relevantes, tipicamente agrupamentos físicos ≥5.000.000.000 B, sem confundir limiar econômico com elegibilidade ou autorização. Escolher caminhos literais inativos; excluir current, PM2 vivo/dump, worker, rollback imediato, retorno transitivo requerido, mounts, referências e writers. Não presumir dispensa por nome, idade ou tamanho; classificar apenas com evidência dirigida. Nunca incluir dados de tenants ou a única autoridade necessária. Inventário prévio é reutilizado, sem `du` global, hash de toda a VPS ou novas coletas quando não houver lacuna material.

**Duas topologias de persistência — distinção obrigatória.**
- Symlink `.data` externo: preservar o destino fora da raiz; copiar/restaurar o link **sem dereference**; conferir que `rm --one-file-system` da raiz não alcança a persistência externa.
- `.data` físico **dentro** da release: preservar também todos os bytes e metadados desse suplemento, comprovar ausência de uso produtivo (inclusive writers e referências) e restauração isolada. Não apagar a raiz com `.data` interno enquanto persistência vital depender dela.

**Custódia externa e restauração.** Reutilizar pacotes autoritativos já existentes, inclusive comprimidos, em vez de transferir árvores expandidas. Para as nove privadas: 1.351.376.292 B de pacotes e 747.520 B de suplementos `.data`; transferência útil 1.352.123.812 B, tráfego real 1.500.115.768 B devido a um pacote rejeitado; restauração isolada 9/9 PASS com 8.899.563.520 B reconstruídos no filesystem local. Usou o repack autoritativo `a62da468` e o formato histórico `release-manifest.json` / `release-index.json` do `5c339b2e`. Custódia `p00-nine-private-releases-exceptional-20261114-v1`, receipt `46d3049a71396c7f7fcef8cae511a79bc5eb28bbf21ba09b9d65c6afbfb3ad87`, índice `48eb52f4736fb0a3f9eebf00490df04a9424792dbc8f67b8534ec501a9d41699`, manifesto privado `.data` `8c22c6d19a49c15845a1aa4388551f98cc759c16842867dbf6c12ecdfd9617f4`. Não publicar arquivos privados nem expor segredos em evidência versionada. Custódia em uma máquina local não substitui, por si, política independente de backup de dados vitais.

**Contrato e observador privilegiado.** O lote excepcional 9/9 usou helper SHA-256 `84d5909b6cfb53b1fe38ca0c1d699d4297dfc3b4d7c1b61fdf027078ba82975c`, instalação autenticada root:root 0500, identidade 64769:786605, receipt `d1420cc807e3b436ff63a7884672e7064fc4329324c05c6286a3c0ce5523d180`; sudoers byte-intacto. O conjunto de candidatos do request `/proc` precisa estar **lexicograficamente ordenado**, independentemente da **ordem literal dos efeitos**. A correção desse mismatch foi integrada no PR #398 (merge `133f59333a651645006a42cd7a23aeee8398a67d`). Testar integração entre produtor de request e helper, não somente unitários em separado. Um lote novo nunca herda allowlist, predecessor, inode, instalador, receipt ou autorização de lotes anteriores; validar o contrato existente antes de propor qualquer sucessão.

**Gates e effects.** Comprovar identidades (device/inode, owner/mode), código e registros íntegros, custódia/restauração, grafo/current/PM2/dump, mounts, ausência de referências/writers, observação `/proc` privilegiada **completa e sem falhas**. Em seguida selar intenção e comandos literais, receber autorização específica vinculada a SHA, revalidar gates em `EXECUTE`, tomar os locks canônicos e executar **somente** comandos autorizados com `/usr/bin/rm -r --one-file-system -- <caminho-literal>`, sem glob nem seguir symlinks. Journal durável `ATTEMPT → RESULT(exitCode=0) → VERIFIED` por efeito; reconciliação após interrupção deve evitar repetição; conferir ausência física, saúde de produção, bytes/inodes antes/depois, publicar receipt terminal. Falha ou evidência incompleta => deny sem efeito; não contornar com `rm` avulso.

**Fechamento.** Atualizar estado canônico, ledger e backlog; marcar caminhos `TERMINAL_SANITIZED / DO_NOT_REPEAT`. Preservar receipts, journals, authorities e custódias; não reexecutar nem recapturar conteúdo de um lote terminal. Documentação é evidência e não controle substituto de autorização.

## 3. Falhas de integração descobertas — evitar reincidência

1. Helper restrito a allowlist histórica => `HELPER_CANDIDATE_SCOPE`. Antes de agendar retirada nova, confrontar caminho literal e identidade contra helper **instalado** e consumidor **integrado**.
2. Consumidor sem perfil novo => `CONSUMER_PROFILE_UNAVAILABLE`. Aprovar interface produtor/consumidor completa em testes integrados antes de instalação.
3. Helper worker antigo / proof inode desatualizado => `HELPER_PROOF_IDENTITY`; **não** reutilizar prova física depois da substituição de binário; o lote de 365,67 MB ficou `ECONOMICALLY_SUSPENDED_BELOW_5GB`, PR #396 fechado sem merge.
4. Ordem distinta em `candidatePaths` => `REQUEST_CANDIDATES_ORDER`. Ordenação lexical no request/response, mantendo ordem distinta dos efeitos; não sobregravar `attempt-01` ao retomar, usar destino exclusivo e evidências novas.
5. Instalação requer autenticação sudo real; não contornar a segurança administrativa.
6. `.data` interno exige suplemento privado com restore PASS, não apenas hashes do runtime.
7. Diferenças entre previsão preflight e `df` terminal devem ser registradas, não escondidas.

Esses são **precedentes metodológicos**, não permissão para transformar um incidente singular em framework genérico ou iniciar PRs sucessivos para resíduos economicamente insignificantes.

## 4. Política permanente de capacidade

- VPS é para produção, dados dos tenants, configurações/segredos essenciais, **uma geração ativa e um rollback imediato por componente**; retornos transitivos extras exigem binding, owner e `retainUntil`.
- Persistência dos tenants é externa a releases imutáveis; `.data` físico em release nova deve negar admissão.
- Build e compressão preferencialmente no builder; releases, outputs, worktrees e preparações devem ter orçamento explícito de bytes/inodes, prazo de retenção, custódia de autoridades e alvo de **zero payload local terminal**.
- Receipts, journals, índices e provas necessários podem ir a custódia externa autenticada se a sua função de recuperação puder ser mantida; não confundir preservação da evidência com retenção integral de payload na VPS.
- Limpeza rotineira usa o lifecycle e os consumidores canônicos; excepcional só por candidato, prova e autorização próprias.
- Não expandir / modificar o executor por padrão para cada lote. Se o custo de adaptar contrato exceder o benefício, documentar e suspender; em lote grande, corrigir defeitos mínimos dirigidos com regressão integrada.

## 5. Auditoria de reconciliação documental e prontidão para backlog

Esta revisão confronta o relatório terminal 9/9 com os documentos do branch operacional. **Não equivale a auditoria dinâmica completa de código, banco, tenants e VPS**: tais evidências exigem inspeção do estado real pelo Codex. Não executar testes end-to-end produtivos ou alterações de tenant como consequência implícita deste documento.

| Domínio | Constatação documental | Destino |
| --- | --- | --- |
| P00 capacidade | O último documento canônico ainda falava em `PRESERVATION_VERIFIED` / `NO_SAFE_5GB_BATCH` antes do receipt 9/9 | Corrigir ponteiros de estado, marcar terminal; não repetir |
| Deploy | API/frontend fa10f4f5 e worker e2e7f17a reportados saudáveis | Preservar; usar seleção viva do próximo preflight, não snapshot antigo |
| Lifecycle | Regras de retorno, `.data` externo e teto de geração já descritas | Reutilizar e aplicar na próxima geração; evitar nova política concorrente |
| Campanhas CRA-PR | Frente técnica de campanhas e relatórios contratuais requer continuidade funcional e aceite | Retomar validação contratual/funcional, sem alterar produção nesta revisão |
| SECULT-PE | Escopo receptivo e visibilidade de conversas CLOSED por responsável | Conferir backlog, testes e evidências existentes antes de mudanças |
| Multitenancy/Meta | Isolamento, sessões, mídia, templates, filas e cobrança são invariantes | Auditar diferenças de código e requisitos nas próximas tarefas, com testes negativos |
| PM2 worker | Contaminação histórica de `PWD` ainda exige fonte canônica antes de manutenção | Pendência independente; não reiniciar worker por causa da P00 |
| Documentação legada | `CURRENT_STATE.json` schema v8 contém ponteiros históricos a a838 por compatibilidade com validador | Não reclassificar esses campos como seleções vivas; compatibilidade é trabalho distinto |
| Custódia | Arquivos locais e receipts privados preservados | Restringir acesso e cópias; nenhuma exclusão local autorizada |

### Condições para encerrar rodadas e voltar ao produto

1. Consolidar receipt 9/9 e total de 28 caminhos no `CURRENT_STATE` e no P00 backlog, sem somar duplamente outras limpezas.
2. Manter todo caminho terminal fora de scans, intents, schedules e lotes futuros.
3. Para novas gerações, verificar budget e lifecycle no próprio ciclo de deploy; não criar outra rodada exploratória extraordinária.
4. Reabrir manutenção de capacidade apenas por limiar objetivo de disco, incidente operacional ou geração nova; sempre com evidência específica e sem desviar equipe de funcionalidades.
5. Antes de declarar **auditoria integral do projeto concluída**, executar/reutilizar (no Codex com acesso aos ambientes) uma única reconciliação dirigida: branch/PRs abertos, testes reais backend/worker/frontend, migrations, isolamento tenant, health e deploy, integrações Meta, backups/restore e backlog contratual. Registrar resultados, lacunas e owners. Não transformar essa verificação em deploy ou novas cópias.

## 6. Continuidade do backlog

**P00 extraordinário:** fechado no conjunto terminal acima, mantendo dívidas históricas não destrutivas documentadas. **Auditoria integral e prontidão do backlog:** [matriz única de verificação de projeto](CONVERTA_PROJECT_AUDIT_AND_BACKLOG_READINESS_2026-11-14.md). Esta matriz diferencia documentos reconciliados de fatos ainda não atestados no runtime; somente a inspeção dirigida do Codex pode fechar o status `PROJECT_AUDIT_COMPLETE`.

**Próxima prioridade:** trabalhar a partir de `WORKING_PRINCIPLES.md`, `CURRENT_STATE.md/json`, `DEPLOY_RUNBOOK.md`, `DEPLOY_ARTIFACT_LIFECYCLE.md` e backlog funcional vigente. Não assumir que CI de docs ou recibo de limpeza substitui aceitação funcional de CRA-PR/SECULT-PE.

Referências: [política de capacidade](../saas/CAPACITY_RECOVERY_POLICY.md), [lifecycle](../saas/DEPLOY_ARTIFACT_LIFECYCLE.md), [inventário](../saas/CAPACITY_INVENTORY_AND_EXTERNAL_RELEASE_STANDARD_2026-11-13.md), [backlog P00](../saas/backlog/PROJECT_SANITATION_AND_RETENTION_P00_2026-10-30.md), [estado canônico](../saas/CURRENT_STATE.md), [princípios](../saas/WORKING_PRINCIPLES.md).
