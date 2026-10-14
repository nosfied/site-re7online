# Segundo lote — retirada concluída e verificada (13/10 Fortaleza)

**WITHDRAWAL_COMPLETE / CAPACITY PASS datado. Geração consumida; não repetir B.** [Resultado sanitizado](SECOND_WITHDRAWAL_RESULT.sanitized.json). Auth e banco concluídos/NEWauth+NEWDB; segurança externa/cifragem OPEN; out.15 CLOSED e guarda38 fechada.

## Execução e espaço

A0/custódia e A1 passaram. B executado uma única vez, com driver10f25ecc/inputc41170f6 publicados: recibo exato WITHDRAWAL_COMPLETE, 140.758 registros únicos do journal correspondem integralmente ao índice. Nove raízes ausentes, zero membros restantes. Sete destinos externos `.data` preservados; nenhum symlink externo foi seguido. Releases atuais, dependências compartilhadas, retornos, preparações, manifests e journals preservados.

Bytes alocados únicos retirados: **4.456.800.256 B**. Aumento líquido observado na primeira inspeção positiva: **4.447.715.328 B**, sujeito à atividade produtiva e gravação das evidências. Não confundir tamanho aparente com recuperação nem atribuir toda variação de df exclusivamente à retirada. Mínimo deploy/PostgreSQL: 10.936.266.752 B na inspeção complementar; última amostra técnica **10.905.092.096 B**,14/10 00:38:04 UTC /13/10 21:38:04 Fortaleza. Piso6.468.665.344 B atendido. WAL112MiB, crescimento16MiB frente à amostra anterior; zero slots, archiveoff. HBA preservado. Logs PostgreSQL delimitados desde23:50UTC, tail500,15 linhas retornadas: zero correspondências de erros de escrita; isso não é prova universal de ausência de erros.

Invocação aproximada23:58:26 UTC, intent00:01:12, primeiro unlink00:01:15, recibo00:12:27 UTC (Fortaleza20:58:26–21:12:27). Cerca de841s de invocação,675s entre intent e recibo. Horário inicial inferido dos outputs, não cronômetro exato. **Não houve parada/restart nem interrupção de serviços provocada pela retirada.**

## Negativa preservada e inspeção complementar

C original negou `post_owner_or_incomplete`: owners10, incomplete0. Seus próprios outputs novos no filesystem raiz reutilizaram `(dev,ino)` de dois diretórios já retirados. Tipo anterior diretório, tipo posterior arquivo regular e nascimento posterior comprovados. PIDs da cadeia C já não existiam na inspeção posterior. Os targets históricos dos FDs13/14 não foram registrados; não atribuímos individualmente esses FDs por hipótese.

A inspeção complementar usou **os mesmos bytes/input**, somente leitura, com stdout/stderr em tmpfs privado. PASS às00:23:24 UTC: rootsAbsent9, remainingEntries0, metadataDrift0, owners0/incomplete0, recibo presente. Original DENY preservado; não convertido retroativamente em PASS. Nenhum processo ignorado, binding flexibilizado, driver instalado corrigido ou B repetido.

Leitores auxiliares pós-retirada recusaram inicialmente duas suposições de instrumentação: ADMIN_TOKEN opcional no worker e fallback `.bak` ausente no filtro de referências. Correção apenas do leitor: contrato `.get` e hash fixo publicado do banco para ambos os dumps. Erros preservados; nenhum conteúdo produtivo alterado. Leitor final v3 `fb75babf…` passou. Próxima revisão observacional deve distinguir gerações de inode (tipo/nlink/nascimento/target), preservando negativas de proprietário real, arquivo retirado ainda aberto e leitura incompleta; sem instalação nesta tarefa.

## Preservação técnica e aceite

API410272/worker410428/frontend188897 e start ticks conferidos; NEWauth+NEWDB, recibo DB VERIFIED, HBA, cron/boot/supervisão preservados. Saved/fallback600, owner/hash fixo3ddec683…, barreira ausente, cinco gatesfalse/executionfalse. Guard38 fechada/tasks vazias/sem markers. Health/DB PASS. Rotas compiladas efetivamente ativas em transação READ ONLY: lista → detalhe → nova lista, out.15 cancelada, seis entregas reportadas, cinco não enviadas, pending0/failed0, sem duplicação; Contact/Lead/Conversation/runtime, usage/disposição/recibo e seis Outbounds: todos os seis fingerprints iguais à captura canônica anterior ao encerramento out15. Owner confirmou sessão/Inbox/CRM/Campanhas em leitura. Nenhum envio, replay, retomada, cancelamento adicional, rotação ou abertura.

Evidências privadas66 arquivos preservadas e conferidas off-host em `re7-private-retention-custody/retention-second-executed-20261014T004200Z`, diretórios700/arquivos600. Manifest SHA-256 `97f7b0411db40895cd128c7ffc4147883d45450d6d331441f6e513d261692075`. Inclui intent/recibo/journal integral, negativas, observação complementar e auditoria posterior. Custódia histórica das releases/hash/extração reutilizada; uma cópia física off-host, não promessa de duas réplicas independentes.

## Auditoria restante — sem autorização de retirada

Leitura root14/10 00:40:50–00:41:52 UTC /13/10 21:40:50–21:41:52 Fortaleza:17.062 entradas,183 referências,17 arquivos de políticas, erros0, duas amostras FD completas com owners21/21 e incomplete0 (usos das categorias, não candidatos ausentes). [Inventário delimitado e grupos idênticos](REMAINING_AUDIT.sanitized.json).

| Categoria | Bytes alocados únicos no escopo | Próximo requisito |
|---|---:|---|
| Preparações |19.279.364.096| Fechar referências transitivas de cada grupo e preservar conteúdo/índice/receita off-host antes de proposta literal |
| Snapshots |813.494.272| Conferir retenção diária/semanal/mensal, hardlinks, proveniência e recuperação; sem exclusão por idade isolada |
| /var/log |1.900.363.776| Correlacionar rotação efetiva e usos; sem truncamento |
| PM2 logs |316.395.520| Conferir retenção específica/FDs e custódia; sem prune |

Dez grupos grandes com SHA idêntico comprovados (incluindo11 cópias de467.189.826 B e seis de479.460.086 B aparentes). Isso **não** declara todos retiráveis: faltam fecho de referências, escolha da principal e custódia específica; hashes e paths públicos no inventário. Medição exclui node_modules/.next/.git/.data, não é total de todos os descendentes nem certificado de retirada/drain. Hardlinks contados uma vez por categoria, sem somar categorias aninhadas.

Políticas lidas: global weekly/rotate4; Nginx daily/rotate14; apt/dpkg monthly/rotate12; journald sem limite explícito de capacidade nos arquivos observados, drop-in ForwardToSyslog=yes. Não inferir ausência de limite runtime nem autorizar limpeza automática. Próximo passo: proposta restrita de duplicados de preparações com custódia e referências fechadas; logs/snapshots separados. Nenhuma nova exclusão autorizada ou executada.
