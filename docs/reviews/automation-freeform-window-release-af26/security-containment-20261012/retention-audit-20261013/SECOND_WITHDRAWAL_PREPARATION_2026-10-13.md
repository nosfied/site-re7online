# Segundo lote pós-banco — preparação e limites

**Estado corrente: [segundo lote consumido, retirada e capacidade verificadas](SECOND_WITHDRAWAL_RESULT_2026-10-13.md). Não repetir B. Auditoria restante somente leitura, sem novas exclusões. Registros abaixo preservados como históricos.**

**PREPARAÇÃO SOMENTE. Nenhuma exclusão autorizada ou executada.** Auth/banco concluídos; NEWauth+NEWDB preservados, out.15 CLOSED e guarda38 fechada. Nove raízes da [allowlist auditada](SECOND_LOT_2026-10-13.md), potencial único **4.456.800.256B**. Preparações, logs e snapshot root continuam fora dela. A geração bancária140000 e o primeiro lote consumido não podem ser reexecutados.

## Recusa e correção do contexto observacional

A geração `retention-second-nine-20261013T211000Z` recusou com AssertionError na comparação dos aplicativos PM2, antes de produzir input ou executar dry-run. O preparador importava Bridge.apps/app_matches, que executam PM2 com o HOME herdado. Sob sudo foi consultada a instância root, e não a instância deploy requerida. A recusa original e seus bytes permanecem preservados.

Leitura root posterior21:39:50UTC/18:39:50Fortaleza: quatro PIDs/start ticks protegidos coincidem; input e intent ausentes. O daemon root observado existe desde **15/09/2026,23:40:19UTC**, PID3342106, com pid-file de15/09 e zero arquivos em seu diretório de PIDs de aplicativos. Portanto não foi criado por esta tarefa. Não foi parado, removido nem excluído do inventário de proprietários.

A v2 captura PM2 somente como deploy, com HOME/PM2_HOME explícitos e daemon18676/start222727 verificado antes/depois. O produtor root não chama PM2. Consome a captura privada com prazo600s e reutiliza Operations.config/System.check_config para conferir status, watch, cwd, executável e ambiente real em /proc. Nenhuma configuração ou segredo é publicado. A geração recusada não foi editada; os metadados/hash originais continuam sendo o esperado, e drift nega.

Geração nova: `/opt/re7online/backups/converta-persistent/preparations/retention-second-nine-v2-20261013T214500Z`. Fontes revisáveis em [second-withdrawal](second-withdrawal/withdraw.py). Hashes:

- withdraw.py (bytes que produziram o dry-run): `856cc229334c7c49fda217d5935eb7fb9b193d8ebace0ebb0b38adfb361757d4`.
- prepare-input.py: `48803b98aef36f7aaaafcf0799e61e6711111adac5e1ea8585a80392287a54ed`.
- capture-pm2-deploy.py: `29188bfae37c0cb55f18a1dc6b84f94930ed50f8f43976a409d2515ab40cd289`.

## Provas e alcance

**24 verificações locais dirigidas PASS**: raiz literal/membro novo/hash/metadados/hardlink/link divergente; symlink externo preservado; FD próprio e mapeamento após fechar FD detectados; proprietário/leitura incompleta/capacidade negam; intent consumido impede replay; retirada parcial injetada deixa recibo e impede continuação; root é recusado antes de PM2/gravação; produtor não chama PM2; contexto deploy explícito; referência nova, boot diferente, guarda aberta, marker uncertain e start ticks divergentes negam. A execução parcial é ensaio local, nunca ocorrência produtiva desta preparação. Os testes não atestam estado atual da VPS.

Driver revalida bindings, referências, boot, guarda/markers, processos, recibo DB VERIFIED/intent/plan/política9c7b44 e atributos/verificador DB efetivos. Duas observações completas incluem todos os processos; não excluem executor ou processos curtos. Negativa ou timeout preserva diagnóstico; não gera autorização de remoção. Exclusão futura, se autorizada, opera membros indexados via descritores O_NOFOLLOW, sem glob/prune ou seguir os sete links .data; diretórios são removidos somente vazios. Journal/intent/recibo preservados; inspeção do filesystem é obrigatória em resultado incerto, sem replay automático.

Custódia integral e índices previamente extraídos foram reconferidos: tar `eaa1d3e711746b0bc3b2b0b1fb1b0d86f8eb0624162eacea02bf8749d15bf22e`, índice `dd40e573610caf3ad39eac827ce1a1b428be7d2a74227f1bb39b55c5dfdfc55f`, manifesto adicional `4fc6e2fa851d73f20843d683a67e46459edda7bdf349f0b0c875728c6ade2c23`. Uma réplica física off-host privada permanente, acessível ao owner; não declarar redundância entre discos independentes.

WAL/health por leitura READ ONLY delimitada21:45:19UTC/18:45:19Fortaleza: WAL100.663.296B, zero slots, archiveoff, health OK. Consulta com statement_timeout8s/lock_timeout1s; sem scheduler/provider/entrypoint. Essa captura não é prova futura de capacidade nem drain.

**V2 INPUT/DRY_RUN/POST PASS — SEM RETIRADA.** Input `c41170f62b01912e9a73c05746d9ee04940fceb848147112304319bacbaf2d31`,140.758 membros,7.215 referências mais894 compilados/3 links de dependências. Recibo DRY_RUN_PASS: duas amostras novas21:47:20/21UTC (18:47:20/21Fortaleza), owners0/0, incomplete0/0, removedCount0. Post READ_ONLY confirmou140.758 membros existentes, zero drift dos não diretórios, owners0/incomplete0, recibo de retirada ausente e mínimo6.516.224.000B (piso6.468.665.344B atendido nesta leitura). Os PIDs/start ticks conferidos são exatamente188897/2161347676,410272/2170884687,410428/2170885045 e18676/222727. Nenhum input/binding foi adaptado ao estado divergente da instância root.

Potencial4.456.800.256B, reserva de evidências268.435.456B; disponibilidade projetada descontando essa reserva10.704.588.800B, não bytes efetivamente liberados. Piso operacional pós-retirada6.468.665.344B e orçamento protegido bancário2.173.698.048B. Só a conferência posterior à futura retirada poderá comprovar os bytes liberados. [Comandos concretos para revisão](SECOND_WITHDRAWAL_COMMANDS_FOR_REVIEW.txt): B não autorizado. Não repetir preparação ou dry-run desta geração; B, se autorizado, refaz todas as verificações e observações antes do intent, sem reutilizar certificado de proprietários. Negativa exige inspeção e nova decisão, não edição do input.

O inventário real inclui217 referências à geração bancária140000, hashes de seus quatro modos/controles, PM2 saved/fallback, boot/cron/Nginx/helpers/políticas. A cópia integral arquivada da geração contém249 arquivos, sem referências literais às nove raízes. A prova arquivada não substitui a conferência atual: input protege as referências reais e sua revalidação futura nega qualquer mudança. As262 menções históricas aos candidatos são evidências/manifests de preparações superadas; zero menções classificadas como referência operacional ativa. Dependências atuais são verificadas separadamente por cwd/config/kernel, symlinks e compilados, sem resolver .data como candidato removível.

Preparação não equivale a autorização de retirada. Nenhuma instalação, start/restart, ALTER, alteração de guarda ou mensagem ocorreu. A observação do daemon root preexistente não criou ou eliminou processo.

## Categorias separadas e cronologia

Leitura secundária root21:44:35UTC/18:44:35Fortaleza: zero erros,232 arquivos de logs (1.903.714.304B únicos),8.089 arquivos de snapshots (811.229.184B únicos),7.568 arquivos de preparações (19.087.331.328B únicos). São bytes alocados de arquivos regulares percorridos; excluem node_modules/.next/.git/.data e não medem destinos de symlinks ou blocos de diretórios. Nenhum inode sobreposto entre essas três categorias; dentro dos snapshots há compartilhamento por hardlinks, por isso não somar o tamanho de cada snapshot como recuperável.

Backup/cron atuais têm hashes idênticos à política lida anteriormente; defaults7daily/4weekly/3monthly, sem override no cron. Entre12 snapshots nominais, `20260812T011558Z` (6 arquivos/6.098.944B) fica fora da união dos buckets. Isso é classificação de retenção, **não** autorização ou candidato selado: sua proveniência/manifests, referências de recuperação e custódia específica faltam; permanece integralmente no host e fora da allowlist. Os11 restantes pertencem à união. Logs: não há excedente autorizado demonstrado; limites efetivos/drop-ins de journald e obrigação de preservação do incidente precedem qualquer proposta. Preparações: inventário e referências foram completados, mas classificação de gerações transitivamente necessárias e custódia de cada pacote duplicado ainda são necessárias para uma terceira allowlist. Tamanho/idade não provam redundância de conteúdo. Nenhuma dessas pendências impede a revisão dos nove caminhos já selados.

A [cronologia bancária](../DATABASE_EXECUTION_2026-10-13.md) foi corrigida: owner retirou a restrição de esperar17h15; a contenção efetiva ocorreu17h47:09, após renovação/custódia/conferências e instalação. Não houve execução antecipada em relação ao horário originalmente combinado. Interrupção conservadora37,198s preservada; não atribuir todo o intervalo preparatório à indisponibilidade ou a uma causa não registrada.

Custódia permanente privada desta continuidade:44 arquivos de diagnóstico/input/recibos; manifesto `cb24c40ca66d3458318e50ecf3ceca0c6db3e95d09e3c9752f6521c98f9cf3e3`. Originais da recusa e v2 separados, cópias conferidas por SHA-256, diretórios700/arquivos600, uma réplica física fora de Git/temporários. Artefatos funcionais, política9c7b44 e todas as instalações permanecem inalterados.

## Delta final da leitura posterior para revisão

Driver final `withdraw-final.py`, SHA `10f25ecc43a0edd749d2091fd076f17176defb072539d02740f38db1240156c4`, preparado no mesmo staging inativo como arquivo novo; `withdraw.py`856cc e todos os recibos anteriores preservados. O leitor posterior original retornava POST_READ_COMPLETE mesmo com owner/incomplete no objeto privado; nesta ocorrência concreta esses campos eram zero, portanto o PASS verificado permanece válido. O final nega proprietário ou leitura incompleta também em C, com stage/observations privados preservados. A recusa pré-intent e por raiz preserva igualmente os detalhes observacionais. Não altera raízes, seleção, hashes, bindings, orçamento, operações de filesystem, número de amostras ou partidas; não instala helper/política. Inputc41170f6 permanece idêntico.

Quatro testes diretamente afetados PASS: C incompleto nega e mantém PID/start/FD/errno; owner nega; duas amostras negativas preservadas; C completo mantém contagem/capacidade. As24 provas anteriores são reutilizadas. **Dry-run produtivo pertence ao driver856cc; o delta final foi ensaiado localmente e transferido sem execução privilegiada.** B/C publicados usam o final10f25ecc e exigem hash; B obtém novas observações antes do intent. Não atribuir o PASS histórico a uma invocação do final que não ocorreu.

O delta final e seus recibos de transferência/conferência foram acrescentados em subdiretório novo da custódia:9 arquivos, manifesto `e399e7a5294c1602ee9a15506a08800a6d26ee076bcb14f7e3fc3ab14b01b498`; manifesto44arquivos anterior preservado. Hash remoto do final10f25ecc/original856cc/inputc41170f6 conferidos, ausência de intent/recibo de retirada. Comparação AST:15 funções canônicas de metadados, estado, filesystem e observação idênticas; delta restrito aos gates/diagnósticos de run/post_read/main.
