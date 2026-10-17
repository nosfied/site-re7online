# R2 — dois diagnósticos delimitados e custódia, 17/10/2026

**CONSUMED / RAW PRESERVED NOT CERTIFIED / CSV SUSPENSO / NOT DEPLOYED / NOT WINDOW READY.** Responsável: Deifson; revisão21/10 ou mudança. Leitura e custódia exit0, uma execução de cada bloco. Não é fechamento R2 ou autorização de instalação.

## Procedimento e rastreabilidade

Fonte: NEXT_COMMANDS.md em `68575192cf3283c49b2a404b87c2bd9e5d2efa42`, SHA256 `6daa22ad7248b46f2cbabc57c5e231bfcfec8ad912218f7f87d254688519891d`. Dois blocos extraídos literalmente, sem alterações. Antes da VPS, oito ensaios foram publicados em `5f5dd88aec19a67c09a1f1fdea4d0d625bc9df9a`, com SHA remoto confirmado. Ver [provas e limites do laboratório](../crm-csv-r2-gap-rehearsal-20261017/REPORT.md).

O primeiro transporte no sandbox falhou em resolução DNS, antes de conexão ou execução remota. O transporte autorizado fora do sandbox executou o bloco de leitura uma única vez, sem sudo. Não houve repetição de coleta ou mudança de comando. O segundo bloco exportou somente o journal novo e efetuou a custódia canônica, também uma única vez.

| Etapa | UTC,17/10 | Fortaleza,17/10 | Resultado |
|---|---|---|---|
| Início da leitura | 11:16:07.055634 | 08:16:07.055634 | R2_GAP_BEGIN |
| Frontend | 11:16:07.058204 | 08:16:07.058204 | representação preservada |
| Proxy | 11:16:08.207980 | 08:16:08.207980 | representação preservada |
| Fim da leitura | 11:16:08.208736 | 08:16:08.208736 | DIAGNOSTIC_READS_COMPLETE_NOT_CERTIFIED |
| Custódia local | 11:16:22.420128 | 08:16:22.420128 | R2_GAP_RAW_PRESERVED_NOT_CERTIFIED |

Intervalo da leitura:1,153102s; não mede disponibilidade HTTP. Journal novo: **3.059B**, SHA256 `d19f335f38531d2cc14a40fffe9946eb1d0630a2aa1161ae9a0c94b512f3ecaf`. Transferência4.547B, stderr0B; base64 decodificada igual byte a byte ao raw, tamanho/hash/metadata e recibo conferidos localmente. Destino privado `csv-r2-gap-diagnostic-20261017-v1`, sob a custódia canônica do owner: diretório700, arquivos600. Nenhum bruto, cmdline ou ambiente privado publicado. [PROVENANCE.json](PROVENANCE.json) relaciona hashes/tamanhos de cada artefato privado e os dois blocos.

## Frontend: fato observado e limite

PID188897/PPID18676/ticks2161347676 passou no predicado publicado de identidade, antes/depois da leitura. A representação cmdline tem84B e um argumento/título único, iniciado por identificação Node; não contém o caminho literal do script esperado. O ambiente selecionado contém somente PM2_HOME, sem pm_exec_path. O cwd coincide com o perfil histórico. A imagem aberta por FD tem SHA256 `d01614ef369e36eee9ab8d86fbfa93ddf44931010add45e5262a63e3ddda784e`, igual à evidência Node anterior, que não foi relida.

O hash da cmdline atual coincide com o campo cmdlineSha256 do processo frontend no contexto privado histórico aceito. Isso comprova igualdade desses bytes de representação com a referência, sem reconstruir/emitir cmdline histórica. Não comprova por si só o script/configuração efetiva PM2 nem autoriza ignorar o checker canônico. Nenhuma autoria ou causa histórica foi inferida.

## Proxy: fato observado e limite

PID177517/PPID176940/ticks96580070, proprietário0, passou no predicado publicado. Cmdline129B/12 argumentos coincide exatamente com o argv do contexto privado histórico: cinco pares de opção/valor e a flag unitária final -use-listen-fd. Portanto, a exigência genérica de cardinalidade ímpar em proxy_channel do reader consumido não representa esse formato observado. Não foi executado Docker, proxy, SQL ou PM2; destino interno e configuração brutos permanecem privados. O vínculo efetivo com identidade do servidor/banco/role ainda não foi certificado por SQL.

## Menor correção proposta — NÃO IMPLEMENTADA

1. **process(frontend):** separar representação observável de prova de configuração. Preservar PID/PPID/ticks/owner/boot/cwd/imagem e before/after; não substituir script_seen por startswith(node), cwd isolado ou aceitação genérica. Para esse frontend, suportar a representação histórica exata, vinculada à referência privada aprovada e sua procedência, registrando explicitamente qual evidência confirma o script. Se não houver prova suficiente de configuração pelas fontes canônicas disponíveis, devolver UNKNOWN/DENY para certificação de script, preservando a observação diagnóstica. Os verificadores finais de perfil/configuração não mudam. O caso API/worker continua exigindo seus marcadores/canal. Atualizar validator e interface interval_checks apenas para representar essa distinção explícita, nunca preencher scriptMarkerConfirmed=true sem prova.
2. **proxy_channel:** percorrer tokens com gramática delimitada: as cinco opções atuais continuam consumindo um valor cada; somente -use-listen-fd é flag unitária conhecida. Rejeitar repetição, desconhecida, valor ausente, tokens restantes e limites excedidos; preservar os predicados de executable/protocolo/porta e identidade. Registrar a flag separada dos valores, preservando as chaves consumidas por interval_checks. Não remover toda a validação de formato nem aceitar qualquer número par de argumentos.
3. Futuro delta local deve usar as representações agora preservadas privadamente, mais contraprovas de formato/identidade/concorrência e interfaces reais. Esta rodada entrega proposta; nenhum reader/validator/caller/geração consumida foi alterado. Nenhuma releitura remota adicional está proposta como comando pronto.

## Preservações, épocas e pendências

As quatro custódias anteriores (20 arquivos) foram comparadas antes/depois por hash,tamanho,modo,inode,mtime/ctime: intactas. Os dois DENYs iniciais,18 observações e o DENY dirigido posterior mantêm bytes, horários e classificação. O complemento de seis comandos continua histórico. O reader consumido continua SHA66f337fb…; writer93a11451… intacto. Não houve nova execução de R2 inteiro nem supervisão/ps/ss/Node/seeds PM2.

Boot inicial foi comparado ao digest publicado e revalidado ao fim pelo próprio bloco; não se atribui retroativamente esse boot às observações anteriores. Daemon/API/worker/listeners/PM2 são reaproveitados somente nos respectivos intervalos históricos. A junção não constitui snapshot atômico nem preenche interval-checks que não executaram na tentativa DENY.

SQL/ownership,16 vínculos, fechamento transitivo/proteção do toolchain, autoridade instalada e certificação operacional permanecem pendentes. Nenhum binding/pin/permit fabricado. NEWauth+NEWDB+NEWcipher, crons, produção, guarda38 e out.15 não foram alterados por esta leitura; não houve nova certificação global desses controles. Sem instalação, reparo, chmod/chown, backup, retenção ou janela. Próximo passo recomendado: revisão da proposta do leitor acima, antes de qualquer implementação/coleta adicional.

## Publicação

Allowlist: este relatório, PROOFS.json, PROVENANCE.json, MANIFEST.sha256 e checkpoints de BACKLOG_TECH/RUNBOOK_WHATSAPP_AGENT/DOCUMENTATION_INDEX. Ensaio já publicado em commit separado. Deploy dessa branch permanece false; único workflow versionado aplica-se somente a main/develop. Sem PR/workflow manual. Brutos e configurações permanecem fora do Git.
