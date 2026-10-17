# Complementação R1/R2 — tentativa única consumida em DENY

Autorização/roteiro: `2a3e9a81d6f78a14ff82ae9d3828feea16266dd9`,
crm-csv-r1r2-complement-20261017/COMMANDS.md.
**COMPLEMENT_CONSUMED_DENY / CUSTODY_DENY / NOT DEPLOYED / NOT WINDOW READY.**
**CSV SUSPENSO. Não repetir, sobrescrever ou reparar esta tentativa.**

## Resultado

A etapa0 local retornou ORIGINAL_DENY_REFERENCE_VERIFIED_NO_WRITE. Branch/HEAD,
remoto, hashes e destino local inexistente foram conferidos. O diretório novo
inativo foi criado uma vez na VPS; os dois arquivos aprovados foram transferidos
uma vez, ambos com exit0. Nenhum dos18 caminhos anteriores foi recapturado.

O bloco de coleta executado pelo owner registrou apenas a tentativa do comando
boot-id: exit1, stdout0B, stderr29B, accepted=false. O diagnóstico privado corresponde
exatamente à mensagem estática de senha exigida por sudo. **sudo-n não encontrou
autenticação não interativa utilizável para esse comando/sessão.** O reader root
não retornou JSON e nenhum boot_id foi observado. Os cinco comandos seguintes não
rodaram. Não há novo errno de leitura: errno=null pertence à falha do subprocesso,
não é uma leitura virtual falhando novamente. Não foram coletados novos dados
root, de crontab deploy, supervisão, processos, listeners ou tool paths.

A preservação da etapa3 foi executada uma vez. SSH/export exit0, cópia privada
byte-exata conferida:1.630B, SHA256
`2a8afe5a15cc1a90be5658828125fd219ba631e013887a3a498798f114b52e99`.
A ingestão negou command_count (um resultado em vez dos seis). Foi mantido
R1R2_COMPLEMENT_CUSTODY_DENY, sem ingerir registros de coleta como sucesso e sem
R1R2_COMPLEMENT_CUSTODY_COMPLETE_NOT_CERTIFIED. Transferência/preservação verificadas
não são certificado de custódia completa.

[Resultado sanitizado/hashes](SANITIZED_RESULT.json) e [procedência](PROVENANCE.json).
Nenhum bruto, política, cron, ambiente, UUID, stderr integral ou journal privado
é publicado. Toda análise posterior usa apenas os arquivos privados locais;
a única ação remota pós-DENY foi a exportação prevista para preservação.

## Tempos distintos; nenhuma identidade retroativa

| Marco | UTC do recibo | Fortaleza |
|---|---|---|
| Observação root anterior, início |17/10/2026 01:22:00.199522 |16/10/2026 22:22:00.199522 |
| Observação root anterior, fim |17/10/2026 01:22:00.349350 |16/10/2026 22:22:00.349350 |
| Início complementação |17/10/2026 01:40:39.463180 |16/10/2026 22:40:39.463180 |
| Tentativa boot-id, início |17/10/2026 01:40:39.463589 |16/10/2026 22:40:39.463589 |
| Tentativa boot-id, fim |17/10/2026 01:40:39.478735 |16/10/2026 22:40:39.478735 |
| Fim complementação DENY |17/10/2026 01:40:39.479116 |16/10/2026 22:40:39.479116 |
| Diagnóstico transferência |17/10/2026 01:41:31.541716 |16/10/2026 22:41:31.541716 |
| Custódia DENY |17/10/2026 01:41:31.543182 |16/10/2026 22:41:31.543182 |

O segundo intervalo é de uma solicitação negada, não de novas observações do host.
Os18 dados anteriores mantêm seus horários e limites; nenhum recebe a data da
complementação. Não há snapshot atômico entre intervalos nem boot_id que os una.
Não é possível deduzir retrospectivamente o mesmo boot. Não se mediu HTTP contínuo
ou indisponibilidade de serviço; nenhum efeito de contenção/parada foi executado.

## Fatos, incertezas e preservação

- **Comprovado:** os bytes de stdin do comando são os do reader aprovado cdfb33b2…;
  o comando foi negado por senha exigida por sudo-n; o coletor interrompeu antes
  dos cinco próximos comandos. O UUID e a nova leitura64B não foram comprovados
  na VPS nesta tentativa. A validação local anterior permanece com seu alcance.
- **Não comprovado:** por que não havia autenticação não interativa utilizável.
  O recibo não determina expiração específica, outra TTY, falha humana ou senha
  incorreta. Não atribuir uma dessas causas por hipótese. Não foi aberta outra
  sessão para tentar aproveitar ticket do owner ou autenticar após o DENY.
- **Histórico preservado:** origem SHA931c9c39…/87.778B, root18/19 e o DENY original,
  fonte de política e2a5ffab…, helper/sudoers históricos, Event775 e ausências das
  bibliotecas/alias futuros. São observações antigas, não reconferidas agora.
- **Ainda desconhecido:** boot atual e seu vínculo ao intervalo antigo, crontab
  deploy atual, supervisão efetiva, trio de identidades/configurações, listeners,
  caminho real Node/PM2, SQL/ownership e closure transitiva. Os16 bindings não foram
  preenchidos. Não houve backup, RPO, capacidade ou prova root frescos.

A referência ORIGIN do novo recibo corresponde à origem privada preservada e foi
conferida localmente sem escrita. Os cinco arquivos privados da primeira tentativa
mantêm exatamente seus tamanhos/hashes publicados. Não se transforma a antiga
RAW_READS_DENY/R1R2_CUSTODY_DENY em COMPLETE. Os destinos novos de coleta e custódia
permanecem consumidos; nenhuma limpeza, correção, retomada ou replay foi feita.

A custódia nova preserva complement-capture.private.jsonl, stdout/stderr integrais
da transferência e os dois journals canônicos. Os cinco são owner600 em diretório
owner700. Exportador/conferência de hash e tamanho aprovaram os bytes copiados;
validate_capture negou antes da ingestão (command_count). Mesmo com essa contagem,
exit1/accepted=false e COMPLEMENT_READS_DENY também impediriam COMPLETE.
Diagnóstico de transporte e negativa permanecem; não foram editados para PASS.

## Próximas leituras R3/R4 — proposta, NÃO EXECUTADA

**Precondição ainda faltante:** estabelecer, mediante revisão/autorização separada,
como obter a identidade/configuração e observações pendentes com autenticação na
mesma sessão de execução. Não reutilizar os destinos desta tentativa. Esta
publicação não prepara outro coletor, nova geração, teste de sudo ou janela.

**R3 SQL/ownership:** depois das identidades atuais, confirmar o canal legítimo,
container/DB/role, proxy e consumidores correspondentes. Propor SELECTs delimitados
com BEGIN READ ONLY/statement_timeout/ROLLBACK para identidade/schema e Event por
tenant/operação, reutilizando SQL/classify de capture_imports sem invocar seu
produtor pós-saída. Cruzar inventário conhecido; UNKNOWN/PROCESSING não vira
conclusão por ausência HTTP. Ownership requer os mesmos PIDs/ticks/portas e
observador canônico com fonte/ação revisadas, sem acionar helper/inspect consumido.
Faltam esses vínculos atuais; **argv SQL/observer não é apresentado como pronto**.
Nenhum SELECT, retenção/dry-run ou consulta de socket adicional foi executado.

**R4 toolchain:** após PID/ticks/cwd/interpreter e resolução command-v, conferir
executáveis realmente consumidos, saltos de links, hashes/metadados/cadeias e
closure PM2/Node/parser, bibliotecas protegidas e alias. Reutilizar composição e
prova PM2 local válidas. command-v/versão não são integridade transitiva nem
identidade do processo ativo. Não usar PM2 CLI que possa iniciar daemon ou require
CJS mutável como leitor. Caminhos/PIDs/transitivos concretos ainda faltam;
**nenhum comando R4 foi executado ou certificado**. Ausências de01:22UTC continuam
históricas. Derivação dos16 vínculos, instalação estática, âncora, emissão e janela
permanecem separadas e não autorizadas.

## Publicação e encerramento

Somente relatório/projeção sanitizada, hashes/procedência e três checkpoints.
Código e roteiro cdfb33b2… intactos; nenhuma suíte repetida. Não há atualização de
pins/bindings, sudoers, permissões, credenciais, .env, Event, dados ou runtime.
NEWauth+NEWDB+NEWcipher, processos, frontend, dois crons, guarda38 e out.15 preservados
pela ausência de efeitos operacionais, sem alegar uma certificação nova deles.
Segurança externa OPEN/revisão21/10 continua separada. Vercel desabilitado para a
branch e CI versionado somente main/develop; nenhuma configuração alterada.

Responsável Deifson. Revisão17/10UTC (16/10Fortaleza); próxima21/10 ou mudança.
**Tentativa encerrada em DENY. Não repetir autenticação/coleta/custódia para tentar
concluir este destino consumido.**
