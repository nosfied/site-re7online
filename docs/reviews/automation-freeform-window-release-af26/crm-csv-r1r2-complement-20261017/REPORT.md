# Correção local de boot_id e complementação futura R1/R2

Base `37ae6051f0f7bb75a31064f793da274f97f00a2c`.
**LOCAL VALIDATED / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY.**
CSV SUSPENSO. Nenhuma nova coleta, SSH/SCP/sudo/VPS, instalação, emissão, backup,
janela ou reparo produtivo nesta rodada. Tentativa consumida e DENYs preservados.

## Reprodução e solução

O reader publicado d01961f5… foi carregado dos bytes versionados conferidos e
executado contra boot_id **real local**, sem imprimir seu valor. A chamada
bufferizada read(8.388.609) reproduziu OSError/errno12 (ENOMEM). Isso caracteriza
esta reprodução local, não comprova o errno da falha antiga na VPS (o recibo
original registrou só a classe). Não é diagnóstico de falta de RAM produtiva.

A nova versão escolhe a política antes de qualquer leitura: no caminho literal
boot_id,64B e uma única os.read; nos demais arquivos o limite8MiB e o caminho
bufferizado existentes continuam. Exige UUID textual canônico minúsculo8-4-4-4-12
com newline, exatamente37B. Leitura curta/extra/malformada nega sem ecoar conteúdo.
Não tenta a leitura grande primeiro, não usa fallback, não relaxa formato para
obter PASS. No-follow, FDs de pais/folha e comparações de metadados pré/pós são
mantidos. Substituição durante a leitura nega, inclusive pela alteração nlink/ctime
antes da comparação pelo caminho. Nada é apresentado como snapshot atômico.

Erros OS pertinentes incluem errno numérico no inventário, comando, transporte,
terminal de custódia e erro externo, além da classe. RuntimeError/timeout sem
errno recebem null, sem fabricar código. Conteúdo arbitrário do erro/UUID não é
incluído no resumo público; bytes de canal permanecem somente em custódia.
private_record permanece a fonte canônica93a11451… byte-exata; run_privileged
inalterado. Código novo em read_package.py; diff exato em READER_DELTA.patch.
Não se modifica o código da tentativa antiga ou consumidores operacionais.

## Escopo e vínculo da complementação

[Roteiro](COMMANDS.md) tem destinos novos e hashes literais; somente para aprovação
posterior. A ação root da complementação observa **um** caminho, boot_id. Depois
executa os cinco argv pendentes sem mudanças. Não relê as18 observações remotas.
Os seletores genéricos mantidos no fonte são herança/procedência para equivalência;
não são percorridos pela ação root complementar, como demonstra a instrumentação.

ORIGIN fixa o SHA931c9c39…/87.778B, o reader e stdout originais, os tempos root
01:22:00.199522–01:22:00.349350UTC17/10/2026 e18 observações; estado RAW_READS_DENY.
verify_origin abre o arquivo privado local somente para leitura, exige owner600,
parent700/nlink1/no-follow e confere bytes/tamanho, hashes, horários e estado.
Cada campo das18 observações continua coberto pelo hash do stdout e do recibo
original. Não há cópia modificada, redatação ou promoção dos dados antigos.

O código foi conferido contra a origem privada real, sem alterá-la. Os cinco
arquivos privados preservados conservaram bytes, mtime e ctime na verificação.
Atime não faz parte dessa alegação. Nenhum conteúdo bruto é publicado. A
revalidação da origem antes da futura transferência é local; nenhuma releitura
adicional na VPS foi adicionada. Nova leitura complementar e exportação de seu
próprio journal são as únicas ações remotas propostas.

A custódia continua export→conferência byte-exata→private_record. O recibo novo
identifica a origem histórica e a complementação, com
originalCollectionCompleted=false, atomicSnapshot=false. Nunca muda a coleta
antiga para COMPLETE. A cópia complementar tem outro nome/diretório. Origem
adulterada/ausente nega antes de transferência, sem buscar reconstruí-la. Falha
nova preserva seu próprio DENY/bytes; nenhuma operação é repetida automaticamente.

## Provas e fronteiras

[PROOFS.json](PROOFS.json):16 casos PASS no conjunto dirigido. Primeira execução:
14 PASS e uma expectativa de erro excessivamente específica no teste de troca.
O consumidor já negava em leaf_changed_during_read, antes da comparação de caminho
esperada pelo teste. Ajustado somente o teste para as duas negativas canônicas;
reexecutado esse caso e um novo teste de entrada por stdin. Um único caso real foi
reexecutado para reter os números do diagnóstico no arquivo de prova. Não se
repetiu suíte histórica, build ou prova operacional.

Cobertura: boot_id real, formato inválido, newline faltante, truncamento/extra,
short read, EIO/errno5 sem conteúdo sensível, troca de arquivo, symlinks, controle
normal/ausente/link/oversize idêntico ao anterior, somente boot+cinco argv,
origem íntegra/adulterada, preservação byte-exata do DENY e dos tempos, custódia
complementar sem complete original, EACCES/errno13 no transporte e consumo sem
retry. Formato é revalidado nos consumidores da saída, não só no produtor.

Reais: arquivo virtual local; reader antigo/novo e syscalls contadas; filho Python
com os bytes pelo stdin (sem sudo), FDs Linux, exportador, validator, hashs e
private_record em diretórios descartáveis. Simulados: root/sudo e namespace dos
outros testes; cinco comandos pendentes; rede SSH; origem sintética nos ensaios de
custódia, com hash de fixture explícito. A origem real foi apenas conferida
localmente depois. Nenhum processo produtivo ou verificador de janela foi exercido.

## Pendências e preservações

A complementação não rejuvenesce as18 observações, não recupera o boot_id do momento
antigo e não atesta que houve o mesmo boot entre os tempos. Não certifica a
população/configuração completa, dois crons em uma época única, SQL/ownership,
RPO/capacidade ou toolchain transitivo. Os dados Event775 e as bibliotecas/alias
ausentes permanecem como observados historicamente, sem correção. Os16 bindings,
pins, perfis, autoridade e permits não foram materializados.

NEWauth+NEWDB+NEWcipher, produção, crons, guarda38 e out.15 preservados pela ausência
de intervenção, não por observação nova. Segurança externa permanece OPEN e as
decisões21/10 não foram reabertas. Instalação estática, âncora, emissão e execução
permanecem fases distintas, todas fora deste incremento.

Publicação: apenas código/provas/docs sanitizados e checkpoints, branch de revisão;
deploymentEnabled=false, CI versionado apenas main/develop, sem configurações
alteradas. Históricos, destinos privados, .data/local-evidence e demais trabalhos
preservados. Responsável Deifson; revisão17/10UTC/próxima21/10 ou mudança.
**Próximo passo: revisar o roteiro complementar. Nada está autorizado a executá-lo.**
