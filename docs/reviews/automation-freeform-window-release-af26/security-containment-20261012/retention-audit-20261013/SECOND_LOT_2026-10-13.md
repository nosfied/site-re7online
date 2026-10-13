# Segundo lote — auditoria delimitada, sem retirada

Banco140000 e janela17h15 têm prioridade. O lote47008ee6 está consumido e não foi repetido. Esta rodada não instala políticas, não altera gates, não remove arquivos nem muda processos/credenciais. AuthNEW, out.15CLOSED e guarda38 fechada preservados.

## Medição atual e vínculos

Captura deploy:140.758 entradas nas sete releases e dois arquivos;5.839 referências lidas,27 arquivos root inacessíveis depois lidos pela sessão sudo do owner. Leitor root `6bfe4ca7…` terminou COMPLETE em duas amostras, incomplete0/0. Encontrou seis FDs em cada amostra, todos do `/usr/bin/tar` PID389703/start2170046570 durante a preservação off-host, dentro da release03f930e5. Essa observação **não** certifica ausência de proprietários nem autoriza retirada; a atividade de custódia não foi excluída do inventário.

Total único por (device,inode):4.456.800.256B alocados. Nenhum hardlink externo às nove raízes detectado;172 symlinks não foram seguidos nem tiveram o tamanho de seus destinos somado. Links de diretórios não foram tratados como hardlinks externos. O potencial alocado não é um certificado de espaço liberável.

| Caminho literal sob `/opt/re7online/releases/` | Alocados B | Finalidade / decisão desta rodada |
|---|---:|---|
| `03f930e5453efd313a91a16de3e22057a0573d9c` | 345,341,952 | Release superada; custódia/extração/hash verificados; retirada candidata após gates novos. Não é API/frontend ativo ou retorno vigente. |
| `a1cc380eddcd1467b8e0d3a8e405f82689a25b3d` | 995,717,120 | Release superada; custódia/extração/hash verificados; retirada candidata após gates novos. Não é API/frontend ativo ou retorno vigente. |
| `a3d16d4bdc4b143deeb6b66d4e963b0b4b3f216b` | 990,670,848 | Release superada; custódia/extração/hash verificados; retirada candidata após gates novos. Não é API/frontend ativo ou retorno vigente. |
| `campaign-eligibility-recovery-reviewed-20261008` | 363,339,776 | Release superada; custódia/extração/hash verificados; retirada candidata após gates novos. Não é API/frontend ativo ou retorno vigente. |
| `e8ebd776ba7c92cc9013fefb29035eae3ab1af4e` | 1,022,730,240 | Release superada; custódia/extração/hash verificados; retirada candidata após gates novos. Não é API/frontend ativo ou retorno vigente. |
| `flow-e8ebd776.tar.gz` | 51,998,720 | Pacote de publicação histórica; cópia idêntica e extração isolada verificadas, candidato a unlink literal após gates frescos. |
| `frontend-a1cc380e.tar.gz` | 26,472,448 | Pacote de publicação histórica; cópia idêntica e extração isolada verificadas, candidato a unlink literal após gates frescos. |
| `worker-bf5f1d76-f06d49cb-042e386a` | 326,356,992 | Worker superado; custódia/extração/hash verificados; retirada candidata após gates novos. Não é worker afbb ativo. |
| `worker-bf5f1d76-f06d49cb-91230f88` | 334,172,160 | Worker superado; custódia/extração/hash verificados; retirada candidata após gates novos. Não é worker afbb ativo. |

Há referências históricas em preparações consumidas e políticas arquivadas, sobretudo ao worker91230f88. Isso exige conservar os vínculos/manifests/journals e receita histórica off-host; não equivale a uso pela política instalada ou a obrigação de manter cada pacote executável no host. Nenhum dos nove aparece nos arquivos examinados das gerações banco140000, authv3, standby compatível184200 ou frontend ativo170000. Os dois arquivos `.tar.gz` não têm menções em nenhuma referência examinada nem proprietários nas duas amostras. Nenhuma dependência compartilhada foi incluída na allowlist.

A conferência canônica bancária, com argumento publicado, passou às18:32:13UTC/15:32:13Fortaleza: mínimo deploy/PostgreSQL6.674.800.640B; orçamento2.173.698.048B; verificador original/conexões, inventário/proxy e guarda38 preservados, gatesfalse. Uma primeira invocação sem argumento foi recusada antes da conferência; stderr preservado. Estes resultados são datados e não substituem backup/RPO/WAL e demais gates imediatos da janela.

## Preparações, logs e snapshots — pendências delimitadas

Inventário secundário:15.897 arquivos, quatro diretórios ilegíveis a deploy; não recebe PASS integral.56 arquivos alocados acima de64MiB. Grandes pacotes de conteúdo repetidos em preparações eligibility de08/10 estão perto de479MB cada. Igualdade de tamanho não comprova duplicação: hash, referências transitivas, custódia e restauração ainda precisam ser fechados antes de incluí-los em retirada. Não retirar preparações inteiras: launchers/manifests/journals podem ser dependências permanentes.

Logs acessíveis somam1.901.846.528B; `/var/log/private`, `letsencrypt` e `unattended-upgrades` ficaram inacessíveis nesta leitura deploy. Não foi demonstrado excedente removível segundo logrotate efetivo/obrigação do incidente; logs não integram a allowlist. Não truncar/vacuum/prune.

Onze snapshots acessíveis foram inventariados. Sua união dos últimos7daily/4weekly/3monthly preserva todos esses onze, sem somar grupos sobrepostos. O snapshot root de12/08 permanece pendente de leitura/obrigação de retenção; idade isolada não o torna removível. Não aplicar essa política a preparações ou backups de incidentes.

## Custódia e próximos gates

Os dois tar originais tiveram SHA idêntico na VPS/off-host, listagem integral e extração isolada sem execução de componentes. Índices privados incluem permissões, owner/group originais, tipos, symlinks e tempos. Extração usa owner local; os owners originais permanecem no índice e tar para restauração autorizada. Nenhuma configuração antiga pode ser usada para reativar segredos expostos.

A primeira cópia conjunta das nove raízes expirou em180s; parcial e diagnóstico preservados, não classificados como custódia válida. Nova cópia de preservação, arquivo próprio/compressão rápida, concluída sem alteração das fontes:1.544.456.898B, SHA `eaa1d3e711746b0bc3b2b0b1fb1b0d86f8eb0624162eacea02bf8749d15bf22e`. Extração isolada140.758 entradas/172 symlinks;125.939 arquivos com hash exatamente igual às fontes originais. Índice SHA `dd40e573610caf3ad39eac827ce1a1b428be7d2a74227f1bb39b55c5dfdfc55f`. Os sete links externos `.data` foram preservados como links, sem copiar ou alcançar seus destinos produtivos. Estes destinos não integram o espaço recuperável.

Allowlist candidata para revisão: nove raízes literais da tabela,4.456.800.256B alocados, incluindo sete releases4.378.329.088B e dois arquivos78.471.168B. Custódia integral comprovada. Após o término de tar/hash, duas novas amostras root completas tiveram owners0/0 e incomplete0/0; a anterior6/6 não foi apagada ou reinterpretada. Driver/input de retirada selados e reconferências frescas após a fase banco ainda são necessários: nenhuma exclusão foi autorizada ou executada. A auditoria destas nove raízes foi concluída; a investigação de categorias secundárias permanece parcial. Preparações/logs/snapshot root permanecem pendentes; não atrasam a rotação bancária.

Uma retirada futura exige autorização própria, novo driver/input selados pelo procedimento canônico, observações completas frescas, inventário atual, hashes/metadata individuais, custódia íntegra, capacidade mínima/WAL e leitura posterior inclusive em recusa/parcial/timeout. Não reutilizar driver/input/intents do lote consumido. Não repetir operação incerta. Preservar raízes/diretórios/retornos/manifests e todas as referências bancárias.

Custódia permanente privada acessível ao owner (fora de temporários): índice de14 arquivos, manifesto `c6c8bf350351a8357a55a341488ca32689186c9bfe2374235096aa50bb3c0ed8`; uma réplica física off-host. Locators e índices completos ficam privados. A VPS mantém ambos os originais. Não afirmar duas réplicas independentes. [Allowlist sanitizada e hashes](SECOND_LOT.sanitized.json).

Os nove candidatos não alteram bindings bancários na conferência realizada: nomes não aparecem em configurações/controles/políticas examinadas, nenhum symlink/dependência compartilhada é retirado, manifests e conteúdos dos quatro modos permanecem preservados; checker bancário PASS datado. Uma remoção futura será outra decisão e deverá reconferir estado/capacidade/RPO antes da janela. A presente auditoria não habilita gate nem constitui autorização de retirada.

## Limites e negativos preservados

O primeiro leitor de hash usava igualdade integral de stat, que incluía atime alterado pela própria leitura. Recusa preservada; V2 compara device/inode/tipo/owner/group/nlink/size/blocks/mtime/ctime antes e depois e todas as referências originais. Ensaio local dirigido confirmou que mudança de atime não mascara escrita real: alteração de size/mtime/ctime nega. V2 produtivo concluiu e seus125.939 hashes coincidem com o arquivo extraído. Isso é correção do leitor de auditoria, não mudança funcional ou de bindings bancários.

Ainda não foi gerado/staged um driver de retirada desta allowlist. Não apresentar as primitivas em COMMANDS como bloco autorizado/executável nem usar o driver consumido47008ee6. As categorias secundárias e o driver de retirada seguem após a prioridade bancária; a auditoria não exige ou autoriza excluir antes das17h15. Mudança de identidades/política na janela bancária deverá ser tratada como estado novo em outra preparação revisada, não drift adaptado numa tentativa existente.

Manifesto adicional da custódia integral: `4fc6e2fa851d73f20843d683a67e46459edda7bdf349f0b0c875728c6ade2c23`,12 arquivos adicionais, uma réplica física. Índices/fontes/evidências e caminhos de recuperação completos privados; nenhum valor de configuração foi publicado.

## Decisão do owner após revisão de b2ac1bfd —13/10

Allowlist dos nove caminhos e custódia preservadas; **nenhuma exclusão autorizada**. Janela bancária17h15Fortaleza permanece prioritária. Até sua execução, somente preparação que não dispute CPU/I/O/locks nem altere requisitos: esta continuidade é documental, sem novas leituras produtivas ou cópias. As observações anteriores continuam datadas, sem renovação implícita.

Após o resultado real da fase banco, preparar geração própria de driver/input vinculada às identidades, política e credencial DB efetivamente vigentes, preservando NEWauth. NEWDB somente poderá ser tratada como efetiva após commit VERIFIED; em resultado incerto, o protocolo bancário de inspeção/decisão precede a preparação de retirada. Nunca presumir sucesso da rotação ou restaurar credencial exposta.

Reutilizar hashes/custódia que continuem válidos, reconfirmar referências, proprietários, metadados e dependências compartilhadas. Retirada recursiva deverá operar somente os membros indexados das sete releases: lstat/O_NOFOLLOW, sem seguir os sete symlinks externos `.data`, sem alcançar seus destinos. Dois pacotes permanecem alvos literais próprios. Não reutilizar drivers/intents consumidos do primeiro lote.

Entrega posterior exigida: driver/input e hashes novos, comandos restritos, dry-run e verificações posteriores inclusive em recusa/parcial/timeout, para decisão concreta de retirada. Preparações, logs e snapshot root permanecem fora da allowlist e serão auditados separadamente, sem descarte por idade/tamanho. Reconfirmar capacidade/WAL e requisitos bancários antes de qualquer retirada futura. Out.15CLOSED, guarda38 fechada, controles e retornos preservados.
