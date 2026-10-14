# Retenção — auditoria e lote concreto para revisão (13/10/2026)

**Estado corrente: [terceiro lote preparado, sem retirada](THIRD_WITHDRAWAL_PREPARATION_2026-10-14.md). Segundo lote concluído/consumido; não repetir. Segurança externa/cifragem OPEN.**

**Estado corrente: [segundo lote consumido, retirada e capacidade verificadas](SECOND_WITHDRAWAL_RESULT_2026-10-13.md). Não repetir B. Auditoria restante somente leitura, sem novas exclusões. Registros abaixo preservados como históricos.**

**Estado corrente:** [retirada concluída, CAPACITY PASS datado e preparação bancária renovada](WITHDRAWAL_RESULT_2026-10-13.md). O inventário e decisões abaixo são históricos.

**AUDIT COMPLETE AS DATED / ALLOWLIST FOR REVIEW / NOT WITHDRAWN.** Expansão do Droplet adiada. Banco continua bloqueado até CAPACITY PASS real; auth concluída/NEWauth, out.15 CLOSED, guarda38 fechada e produção preservados. Nenhuma compra, shutdown, resize, exclusão, chmod produtivo, política, restart ou rotação executada. [Dados sanitizados/hashes](RESULT.sanitized.json), [política proposta](RETENTION_POLICY_FOR_REVIEW.md).

## Inventário e referências

Leitura root na sessão sudo do owner, **11:42:40–11:45:47 UTC /08:42:40–08:45:47 Fortaleza**:914.686 entradas,14.817 symlinks,5.758 arquivos de referência, duas amostras completas dos processos/cwd/exe/FDs, zero incomplete e zero proprietários dos candidatos. Root reader `c2534d…` foi executado uma vez; sem instalar delegação. Inventário do filesystem raiz completo dentro do orçamento240s. /proc,/sys,/dev,/run são pseudo/outros filesystems separados; tmpfs não foi somado ao espaço recuperável da raiz. Mounts de outros dispositivos registrados separadamente. Esta captura tem duração e não é snapshot transacional global: files/logs/DB ativos podem crescer. Não é certificado de drain.

Contagem por `(st_dev,st_ino)` e `st_blocks*512`: **59.127.242.752 B únicos** observados;900 inodes aparecem por mais de um caminho. Nenhuma sobreposição por hardlink entre as categorias de primeiro nível observadas; diretórios pais e filhos continuam sobrepostos e não são somados duas vezes. Diferença para df não é espaço recuperável: metadados/reservas/arquivos em mudança ou abertos não são atribuídos cegamente. Symlinks não fazem o destino ser contado novamente no diretório do link. Cache não possui symlinks nem hardlinks externos; nlink1 exigido para cada arquivo selecionado.

| Categoria | Bytes alocados únicos observados | Decisão |
|---|---:|---|
| Preparações |21.960.753.152| Somente quatro blobs duplicados neste lote; controles/journals/manifests permanecem |
| Releases |17.730.494.464| Todas preservadas neste lote |
| Cache npm `_cacache` |2.762.084.352| Candidato; raiz do cache mantida, retirar somente entradas indexadas |
| Logs /var/log |1.895.317.504| Fora do lote; preservar registros e políticas |
| Docker |933.253.120| Fora do lote; nenhum prune |
| Temporários /tmp |125.247.488| Fora do lote; sem retirada por idade |

29 releases inventariadas:22 conservadoramente protegidas por vínculos,7 sem vínculo efetivo identificado, **não declaradas recuperáveis nem autorizadas**. Mapa privado inclui PM2 live/saved/fallback, symlinks, processos/FDs, boot/systemd/cron, Nginx, helpers/políticas, launchers e controles. Fecho conservador:120 raízes protegidas/3.948 hashes de referência e182 caminhos de controle, incluindo adições/remoções de configuração no gate. Scripts/arquivos de referência não acessam providers/entrypoint. Vínculos absolutos, membros de manifests e 27 referências históricas por basename nas gerações candidatas foram examinados; namespace permitido não é automaticamente dependência de todo seu conteúdo. Não promete análise universal de qualquer caminho calculado por software externo.

Dependência comprovada e protegida: API atual → node_modules da release Result Truth → preventiva a26 → elegibilidade final. Também preservar worker mínimo afbb, frontend dinâmico ativo, seu launcher/bootstrap/journals permanentes, retorno frontend3227, standby compatível, preparação bancária finalv4 e authv3. Preparação consumida não é descartável se ainda sustenta processo/dump/retorno. Políticas/helpers/sudoers permanecem intactos.

Read-only pós-auditoria:11:58UTC min PostgreSQL/deploy observado **2.062.151.680 B**, WAL144MiB, DB694MB, volume PG montado no host confirmado. Health/boot/dumps conferidos: saved/fallback600/hash849893e2…, guarda/hash9e1a…sem alteração. SQL delimitado12:05UTC confirmou controlador/filho/conjunto/job cancelados, sem lease e seis Outbounds; enum técnico dessas linhas é SENT, não inferir entrega apenas dele. Seis entregas reportadas/cinco não enviadas continuam sustentadas pelo certificado/read model já aceito; esta rodada não repete envio ou aceite da audiência. Recibo/CRM/usage não foram alterados.

## Allowlist exata proposta

1. `/home/deploy/.npm/_cacache` — **2,762,080,256 B projetados**;6.007 entradas originalmente (2.763 arquivos/3.244 diretórios), sem referências explícitas ou FDs proprietários. Remover somente arquivos indexados e subdiretórios indexados vazios; **manter a raiz**, .npmrc, _logs, npm-global/PM2 e todos os node_modules. Risco: próximo npm poderá precisar baixar artefatos; não afeta os pacotes instalados. Cache inteiro preservado off-host, não depender de download para recuperação.
2. `/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-20261003T150000Z/window/prior-backup-20261003T145400Z/content.private.tar.gz` — 467,197,952 B alocados; arquivo regular/nlink1, inode distinto, SHA comum comprovado.
3. `/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-20261003T150000Z/window/refresh-20261003T152700Z/content.private.tar.gz` — 467,193,856 B alocados; arquivo regular/nlink1, inode distinto, SHA comum comprovado.
4. `/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-pm2-20261003T235000Z/window/backup-first-preserved-20261003T235000Z/content.private.tar.gz` — 467,193,856 B alocados; arquivo regular/nlink1, inode distinto, SHA comum comprovado.
5. `/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-sequenced-20261003T163000Z/window/prior-backup-20261003T163200Z/content.private.tar.gz` — 467,197,952 B alocados; arquivo regular/nlink1, inode distinto, SHA comum comprovado.

Principal mantida: `/opt/re7online/backups/converta-persistent/preparations/freeform-window-af26/v4-20261003/window/content.private.tar.gz`. SHA comum dos cinco blobs `3f4affa2d3135756687d95d41912b221163f82585937db7a561518ed95721fe0`. As quatro cópias têm tamanho lógico467.189.826B/inodes distintos/nlink1. Não remover diretórios, manifests, journals ou os registros que citam basename; futura consulta histórica recupera bytes pelo índice/recibo, sem reativar controles consumidos ou credenciais expostas.

Total projetado **4,630,863,872 B (≈4,63GB/4,31GiB)**. Com o par atual2026-10-13T12:41:40.051001+00:00, min(deploy/PostgreSQL)2,076,680,192B, projetaria6,707,544,064B livres e margem4,533,846,016B sobre o orçamento bancário. **Não é capacidade já liberada.** Exigir min(deploy/PostgreSQL)≥6.468.665.344B depois, correspondente ao orçamento2.173.698.048B **mais4GiB de folga adicional**. Se crescimento reduzir essa margem, o lote nega antes da retirada; não reduzir orçamento nem acrescentar paths. WAL/reservas/RPO serão reconfirmados antes da futura fase bancária.

## Custódia e limites comprovados

Custódia acessível ao owner fora de Git e temporários: `/home/deifson-oliveira/DEIFSON/re7-private-retention-custody/`. Blob histórico467.189.826B, tar759membros/740arquivos, extração limpa e índice de conteúdo/metadados verificados. Cache tar773.063.490B/SHA8bf3419b…,6.007 entradas: tipos/owner/grupo/modos comparados com inventário root,2.763 hashes de arquivo e1.728 endereços SHA512 conferidos. Extração segura Python retirou bits de escrita originalmente presentes: a primeira recusa foi preservada; modos originais foram reconstruídos **somente na cópia local isolada** e conferidos. Tar guarda ACLs/xattrs/numeric owners; índice preserva dev/inode/nlink/timestamps originais. Ctime/inodes de uma restauração são novos; não fabricar os originais.

Conteúdo, índices, hashes, receitas e diagnósticos ficam privados/600 sob diretórios700. Pacote final privado em `retention-final-review-20261013T124500Z`, manifestoSHA4e3a2723…; archives/extrações na custódia primária `retention-custody-20261013T120000Z`, manifestoSHA07badfea… reconferido. Arquivos off-host estão no disco do owner; pastas/cópias nesse mesmo disco não são réplicas independentes de desastre. Git recebe apenas código/contagens/hashes/categorias, nunca configs/tokens/SQL/logs/tars ou o input. Evidências antigas e os drafts desta preparação mantidos. Recuperação histórica é restaurar o blob idêntico no caminho literal e metadados pelo índice; **não iniciar serviço com configurações históricas**. Cache pode ser recuperado por extração isolada conferida e cópia do `_cacache` com metadados, após decisão, sem mudar releases/deps. Nenhum restore produtivo executado.

## Driver e sequência futura — não executar nesta autorização

Driver selado: SHA `0f85b527c819a24663913855a402319e9eca647fcd1b638bdcb0213abda27c01`. Input final:SHA `73002641728a9967e54e37e42f597a7d3661be18dde88e1342731e189148e7ab`. Post-reader:SHA `f1cab41eb4f08b7be934c2c7a8c5a981649dbfedd004ae3e060e2c3f98e59c21`. Staging inativo final `/dev/shm/re7-retention-withdrawal-final-20261013T124500Z`; drafts123000 preservados. **Driver produtivo não executado**.13 testes locais passaram: filesystem real em fixtures temporárias (unlink/rmdir seguros, metadados/hash, symlink, hardlink externo, membro novo, principal/raiz mantidos, parcial/recibo/no replay) e negativas de owner/incomplete/capacidade. UID/root, estado produtivo, capacidade e amostras da cadeia local foram simulados; root inventory real desta rodada é prova separada, não prova da futura retirada.

Bloco A: na máquina do owner, reconferir hashes dos dois archives/input/manifesto de custódia; no sudo legítimo, conferir os três arquivos staged e executar **dry-run sem flag apply**, sob lock exclusivo. Hashes, membros/metadata, nlink, principal, identidades/ticks/cwd, guarda38/tasks/markers,3.948 referências,182 controles, margem e duas observações **novas** de FDs devem passar. Drift nega; input não é regenerado para PASS.

Bloco B só após nova autorização explícita: uma invocação com `--owner-authorized-apply`, mesmo planHash. Driver cria intent O_EXCL/fsync; cada unlink abre todos os pais sem seguir symlinks e revalida inode/metadados/hash. Somente vazios indexados do cache são removidos; diretórios históricos e raiz cache permanecem. Recibo durable registra completo/parcial; intent consumido impede replay. Sem SQL/ledger write/service/provider.

Bloco C obrigatório inclusive DENY/parcial/timeout: leitor posterior separado, principal hash, quatro paths, entradas restantes/novas do cache, duas observações completas inclusive inodes já retirados mas abertos, min dos dois executores/health/controles. Copiar recibos/diagnósticos off-host; conferir WAL/DB/out15/dumps/serviços pelo leitor canônico e sessão legítima apenas em leitura. Timeout ou incerto: inspecionar, não repetir B nem apagar intent. Sucesso da retirada não autoriza banco: renovar RPO/dump/custódia e revisar janela bancária vigente com estado real.

[Comandos separados](COMMANDS_FOR_REVIEW.txt). Próximo passo concreto: **decisão sobre estes cinco caminhos**, com preflight fresco e verificações posteriores. Sem expansão e sem limpeza automática. Segurança OPEN/providers/banco/cifragem continuam separados; out.15 não foi reaberta.

## Continuidade do segundo lote,13/10

[Auditoria atual, custódia integral e limites](SECOND_LOT_2026-10-13.md). Nove raízes4.456.800.256B alocados; nenhuma retirada. A janela bancária17h15 mantém prioridade; não repetir o lote consumido.

## Continuidade pós-banco — preparação v2 concluída, sem retirada

[Driver/input, dry-run e limites](SECOND_WITHDRAWAL_PREPARATION_2026-10-13.md). Inputc41170f6/driver856cc229, duas amostras root novas owners0/incomplete0;140.758 membros preservados/zero remoções. Nove raízes4.456.800.256B potenciais, mínimo6.516.224.000B datado. Geração211000 recusada por contexto PM2 root preservada; v2 captura deploy e valida kernel/configuração. [Comandos A0/A1/B/C para decisão](SECOND_WITHDRAWAL_COMMANDS_FOR_REVIEW.txt); **B não autorizado**. Preparações/logs/snapshot root fora da allowlist; auditoria secundária e retenção classificadas no novo relatório. Auth/banco concluídos, NEWauth+NEWDB/guarda38/out15CLOSED preservados; segurança externa/cifragem OPEN.

## Integração canônica da retenção —14/10/2026

A proposta histórica foi incorporada aos [princípios](../../../../saas/CHANGE_POLICY.md#princípios-permanentes-de-retenção-operacional), [runbook](../../../../RUNBOOK_WHATSAPP_AGENT.md#retenção-operacional-permanente), [capacidade](../../../../saas/OPERATIONAL_BASELINE.md#capacidade-e-retenção-operacional) e [checklist](../../../../saas/RELEASE_CHECKLIST.md#retenção-de-releases-e-preparações). Reutilizadas auditorias/custódia/provas dos lotes anteriores, sem novas leituras produtivas ou alteração dos manifests selados.

Auditoria dos preparadores auth/banco/frontend/API registrou cinco correções preventivas com evidência de código e critérios de aceite no [backlog](../../../../BACKLOG_TECH.md#retenção-operacional--integração-preventiva-dos-preparadores). Nenhum preparador consumido foi alterado. Rotina `scripts/operational-retention-report.py`: LOCAL READ ONLY/dry-run para revisão, nove testes dirigidos PASS; links novos/diff conferidos. Não coleta SQL/WAL/owners nem autoriza retirada. Integração aos preparadores, execução semanal na VPS e alertas automáticos NÃO implantados. Revisão semanal/pós-janela documentada, sem cron.

Terceiro lote permanece preparado/sem apply; nenhum novo arquivo produtivo retirado. NEWauth+NEWDB, out.15 CLOSED e guarda38 fechada preservados. Segurança externa/cifragem permanece OPEN. Hashes desta entrega pertencem ao novo commit documental; manifests/recibos históricos permanecem íntegros.

## Gates futuros locais e destino privado —14/10/2026

Revisão posterior a de9faa27: destino executor700/sem symlink validado antes da
captura; FD mantido e vínculo conferido antes de escrever600, sem corrigir destino.
Treze provas inventário/destino e onze provas do coordenador futuro: **24 PASS**.
Novo coordenador local reutiliza três componentes exatos, sem modificar suas fontes,
e cobre os cinco gates (reuso, capacidade, ciclo de vida, referências, relatório).
[Contrato, limites e comandos](../../../../../scripts/README.md#operational_preparation_reviewpy).
Integração aos adapters produtivos ainda pendente; nenhum serviço/cron instalado,
nenhuma captura ou mutação produtiva nesta tarefa. Preflight sintético não certifica
raízes/owners/frescor reais. Históricos/manifests/custódia e preparação do terceiro
lote preservados, sem apply. Responsável operacional Deifson Oliveira; última revisão
local14/10/2026, próxima21/10/2026 ou pós-janela. NEWauth+NEWDB/out.15CLOSED/guarda38
mantidos; segurança externa/cifragem OPEN segue no relatório de segurança.

## Integração preventiva dos adapters futuros concluída localmente —14/10/2026

[Entrega/código/provas/comandos](PREPARER_INTEGRATION_2026-10-14.md).
API/frontend passam pelo gate antes de operações; auth/banco registram encerramento
por journal/recibo canônicos. **38 testes locais PASS**; dois formatos históricos
reais lidos apenas para compatibilidade, sem novo certificado de fase. Coordenador,
preparadores históricos, gerações/manifestos consumidos e custódias preservados.
Revisão21/10 mantida. Nenhuma instalação/read novo na VPS, cron, rebuild funcional,
exclusão ou janela. Terceiro lote preparado; segurança externa/cifragem OPEN segue
separadamente, NEWauth+NEWDB/out.15CLOSED/guarda38 preservados.

## 14/10 — terceiro lote consumido/parcial, sem certificado completo

[Resultado/diagnóstico/capacidade/custódia](THIRD_WITHDRAWAL_RESULT_2026-10-14.md).20 retirados uma vez/8.130.785.280B,3 mantidos,ObservationDenied stat_before/PID529658,zeroowners/uma incompletude. C passou; não repetir B ou adaptar77503f96. Custódia/sidecar próprios,manifests históricos intactos; NEWauth+NEWDB/out15CLOSED/guarda38/serviços preservados,owner confirmou. Segurança externa/cifragem retomada offline e OPEN; nenhuma nova retirada/instalação/rotação.
