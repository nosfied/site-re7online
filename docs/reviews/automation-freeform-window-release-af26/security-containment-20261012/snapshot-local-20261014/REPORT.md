# Convergência inventário/dump e certificação local — 14/10/2026

**LOCAL VALIDATED / NOT DEPLOYED. Preparação V4: REVIEW ONLY / NOT WINDOW READY.** O delta do capturador e os ensaios exigidos passaram. A geração produtiva recusada180000 continua DENY, sem reutilização de certificados. Nesta tarefa houve **zero conexões à VPS**, zero providers e nenhuma mudança produtiva. NEWauth+NEWDB, out.15 CLOSED e guarda38 não foram tocados; não apresentamos estado produtivo histórico como reconferência atual. Segurança externa/cifragem OPEN.

A demora anterior decorreu de descobrir no restore que inventário e dump haviam sido capturados em instantes diferentes. A engenharia agora fecha essa fronteira localmente, sem tentar estabilizar produção por parar writers ou repetir capturas até PASS.

## Integração e provas

[snapshot_capture.py](snapshot_capture.py) adquire `flock LOCK_EX|LOCK_NB` **antes da conexão**; inicia `REPEATABLE READ READ ONLY`; confere banco/OID/usuário/versão/system identifier; exporta snapshot e executa inventário na própria transação; passa o ID a `pg_dump --snapshot`. O holder permanece aberto e é conferido durante o dump e após sua conclusão. Falha de inventário/dump, timeout, morte do holder ou identidade divergente negam: preservam outputs/denial, terminam somente o filho local criado pelo capturador, fazem rollback/close e liberam o lock. Não há retry nem limpeza de evidências. Uma conexão SQL negada precisa rollback explícito: comandos restantes de uma mensagem abortada não são pressupostos executados.

O lock canônico identificado no script preservado é `${BACKUP_ROOT}/backup.lock`, padrão `/opt/re7online/backups/converta-persistent/backup.lock`; o cron preservado não redefine BACKUP_ROOT. Fonte SHA e caminho estão na [prova](proof.sanitized.json). O script usa umask027; o adapter aceita arquivo regular do executor600 ou640, sem symlink/hardlink, sem alterar modo existente. No laboratório usa-se **o equivalente local**, não o arquivo da VPS. Propriedade/modo/override e acesso ao lock efetivo ainda exigem conferência produtiva expressamente autorizada. Não usar o lock privado de uma janela como substituto do backup.lock.

| Critério | Evidência efetivamente executada |
|---|---|
| Mesma imagem | Fonte isolada restaurada do dump6c5354ea… já preservado. Inventário exportado e dump compartilhado restaurado em outro banco local: igualdade integral das linhas capturadas. |
| Concorrência sem congelar writers | Writer exclusivamente local alterou updatedAt depois da exportação. Dump/inventário conservaram a imagem original; estado fresco da fonte divergiu. |
| CAS fresco obrigatório | Verificador canônico real negou a fonte alterada. Nenhuma conversão foi aplicada nela, nenhuma atualização oportunista do plano. |
| Fronteira integral no restore | ORIGINAL_VERIFIED → dez conversões pelo SQL revisado → VERIFIED. Linha opaca integralmente igual; payloads históricos iguais; replay sem eventos adicionais. |
|147 históricos e v2 | Reader/writer compilados já revisados:126 eventos/147 campos, população imutável95eda, v2 independente do grant legado inclusive ausente/expirado. Sem rebuild. |
| Falhas/recursos | Identidade, erro SQL, dump com erro, timeout, holder morto e lock ocupado negam. Cinco regressões dirigidas na versão final do transporte: seleção em BEGIN/SELECT/ROLLBACK, SQL mutável negado, destinos inválidos antes da captura, falhas e liberação de recursos. |
| Saída privada | Diretório700 do executor, tipo e cadeia sem symlink; ausência, arquivo, modo inadequado, proprietário divergente (fixture) negam antes da conexão. Arquivos novos600/exclusivos. |

[Prova integral sanitizada](proof.sanitized.json). Dump coerente local SHA **773e59ee6a7ccec1d63c8a92f1b8257297b1988b0056004afed9e59ffc38119a**; inventário bruto SHA **1c93c84bea9c11c9594c46c2a8a9bc8200b066f5818f09ed2673e8c84cd3cc08**; plano local SHA **20a9509cb87f30ed6681e539e9a2699c52813e2a36955d0cabfffc6d99d1e80e**. Este plano certifica o restore local, **não linhas atuais da VPS**.

O libpq consome todos os resultados de mensagens SQL e conserva o SELECT, sem confundi-lo com o último ROLLBACK. Esse caminho foi ensaiado com o verificador real. O dump usa ambiente sem PG* herdados/DATABASE_URL e opções READ ONLY; comando/conexão são inputs explícitos do adapter local. Não há CLI produtivo. Um transporte produtivo deve selar a mesma identidade nos dois canais e carregar credenciais somente das fontes legítimas; não copiar comandos de conexão local para a VPS.

As primeiras tentativas locais pararam na normalização de timestamps/string de payload e na leitura do último resultado SQL. Foram preservadas. Corrigiu-se representação, não ciphertext/dados/controles. O restore e o plano válidos foram reutilizados, sem novo dump produtivo ou recaptura. O teste de permissões precisou chmod explícito no fixture por causa do umask077; o de SQL negado passou a executar rollback explícito. Os cinco testes finais passaram. A fonte de laboratório e o restore final estão parados e conservados privadamente; nenhuma aplicação/scheduler foi iniciada.

## Provas reutilizadas e limites

Reutilizados: tar36f51ebe…; composição/dependências; grant95eda…; disposição Telegram exata; testes anteriores de tenant/conta/ciphertext, SQL rollback/CAS/concorrência/recibos e nove caminhos V4 pré/pós-commit/incerto. Esses testes continuam provas isoladas, não novos certificados de produção. Nesta rodada repetiram-se somente integração de snapshot/restore/fronteira real e regressões afetadas do transporte/saída.

O inventário bruto inclui contas, onze cifras, população histórica completa e contagens MFA/webhook. O plano compara integralmente suas linhas/contas e nega população inesperada. **Não certifica os341 vínculos externos**: a projeção local deixa externalRefs vazia, em vez de reciclar os números antigos como captura. Esse inventário continua requisito separado para uma eventual troca Meta, não realizada nem autorizada aqui.

Restore local com `--no-owner --no-acl`, Unix socket e TCP desabilitado. Comprova dados/schema e a nova fronteira; não comprova restauração produtiva de roles/ACLs, RBAC ao vivo ou permissões do transporte da VPS. Alterações históricas Web não receberam causa atribuída; o writer conhecido existe somente no ensaio local.

Snapshot coerente não promete estabilidade posterior. CAS atual antes da contenção e após fence/saída permanece obrigatório, para ciphertext, identidade, conta e todos os controles selados, inclusive Telegram. Drift gera DENY e exige decisão/nova geração; não trocar o hash esperado para PASS. Grant restrito não elimina o risco residual de segredo exposto + ciphertext histórico fora da aplicação.

## Nova preparação e gates

[prepare_v4.py](prepare_v4.py) reutiliza o coordenador de retenção e os adapters existentes, exige certificado/dump/inventário/plano/SQL consistentes antes da composição. Tar e dependências não foram reconstruídos ou recopiados. Quatro configurações novas e seladas: switch, return, return-partial, return-before-commit; hook, consumidores, SQL/verify, grant, manifest e sidecar. [Hashes/estado](v4.sanitized.json). API/worker conservam NEWauth+NEWDB; frontend não muda. Pré-commit só ORIGINAL_VERIFIED/chave ainda efetiva + reader compatível; pós-VERIFIED só NEWcipher; incerto bloqueia sucessor/replay e requer inspeção/decisão explícita. Nenhum retorno restaura cipher antigo após VERIFIED.

[prepare_policy_review.py](prepare_policy_review.py) produz **propostas offline** de política e instalador a partir de capturas datadas, preservando helper/sudoers e checks canônicos; [hashes e dependências](policy.sanitized.json). Não são instalador liberado ou montagem operacional completa. O template exige manifests/baseline/checkers estritos; sua ausência nega antes da substituição. Não reutiliza manifests/certificados de geração consumida. Política/helper/daemon/cron e identidades datadas não recebem validade renovada porque foram serializados novamente.

| Gate | Estado |
|---|---|
| Engenharia snapshot/restore10+opaca+147/v2/CAS | PASS local |
| Tar/SQL/verify/configurações quatro modos/NEWauth+NEWDB | PASS local |
| Custódia privada e integridade dos novos bytes | PASS local/off-host |
| ownerAuthorized/preflightReviewed/artifactsVerified/restoreVerified/discrepanciesResolved da janela | **cinco FALSE** |
| executionAuthorized / janela produtiva | **FALSE / NOT WINDOW READY** |
| Snapshot produtivo atual/lock/transportes/RPO/capacidade/saved-fallback/baseline e assembly canônico | **PENDENTES de autorização expressa de leitura/preparação na VPS** |

Não liberar comandos de instalação/execução sobre um envelope parcial. A próxima ação é revisão deste delta; se o owner autorizar nova operação de leitura/preparação, integrar o transporte existente da VPS sob backup.lock, gerar inventário+dump coerentes novos e certificar seu restore/CAS, identidade/permissões, RPO/custódia/capacidade/WAL e baseline dos quatro modos, antes da montagem/selagem operacional completa. Drift nega. Nenhuma janela fica implicitamente autorizada por esta publicação.

[Custódia](custody.sanitized.json): cofre permanente privado do owner,80 arquivos indexados/57 conteúdos únicos,137.429.609B, arquivos600/diretórios700; hashes/índice/receita, conteúdos integralmente relidos. Fonte original preservada por referência/hash, sem outra cópia; banco local conservado fora desse índice. É off-host da VPS, não réplica física independente do workstation. Classificação: provas/recibos/custódia obrigatórios; material de laboratório arquivável após revisão, sem retirada nesta tarefa. Responsável Deifson Oliveira; última revisão14/10, próxima21/10, antecipar após mudanças.
