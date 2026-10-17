# R1/R2 — complemento deploy consumido, coleta e custódia concluídas

**COMPLEMENT_CONSUMED_COMPLETE_NOT_CERTIFIED / CSV SUSPENSO /
NOT DEPLOYED / NOT WINDOW READY.** Não repetir este roteiro ou reutilizar destinos.
Autorização:1f51505816334b5b606afa55a60de676648b9e2a,
[COMMANDS.md imutável](../crm-csv-r1r2-deploy-complement-20261017/COMMANDS.md).

## Execução delimitada e resultado

Branch/HEAD/remoto e bytes do manifest foram conferidos antes dos efeitos.
Precondição privada retornou ORIGINAL_DENY_REFERENCE_VERIFIED_NO_WRITE; destino
local novo estava ausente e seu pai owner700. Os dois DENYs anteriores foram
conferidos localmente por hashes; nenhum caminho remoto antigo foi recapturado.
Os cinco blocos do roteiro foram extraídos e executados sem modificação.

Uma criação exclusiva de ferramentas, uma transferência dos dois arquivos inativos,
uma coleta e uma transferência/custódia: todos exit0. Sessão SSH deploy, **SEM sudo**,
sem autenticação owner, helper ou elevação na VPS. O launcher autenticou os mesmos
bytes conferidos; o boot subprocess recebeu o reader aprovado por stdin.

Resultados exatos:
- Coletor: R1R2_COMPLEMENT_COLLECTION_COMPLETE_NOT_CERTIFIED.
- Journal da coleta: COMPLEMENT_READS_COMPLETE; seis comandos aceitos, exit0 e
  stderr vazio em todos. Boot37B, formato UUID/newline válido; única leitura64B.
- Transferência SSH/exportador: exit0, stdout33.703B, stderr0B.
- Custódia canônica: **R1R2_COMPLEMENT_CUSTODY_COMPLETE_NOT_CERTIFIED**.
- Raw preservado byte-exato:24.914B,
  SHA`a2e898cc429ec72a1f3948479c7f9772984ea78230e8921be88d236ea498f35c`.

[Resultado sanitizado, canais/tamanhos/hashes e intervalos](SANITIZED_RESULT.json)
e [procedência](PROVENANCE.json). Nenhum bruto, UUID, cron, política, ambiente,
lista de processos, listener ou journal privado foi publicado. Os arquivos privados
estão no destino aprovado csv-r1r2-deploy-complement-read-20261017-v1, fora do Git.
Diretório700/owner e cinco arquivos600/owner conferidos. Ingestão validou argv,
stdin, canais, seis resultados e terminal antes do recibo; receipt referencia o hash
exato do raw. private_record permanece o único escritor dos journals canônicos.

## Três épocas distintas

| Evidência | Intervalo UTC17/10/2026 | Fortaleza16/10 |
|---|---|---|
| Primeira coleta root DENY,18 observações |01:22:00.199522–01:22:00.349350 |22:22:00 |
| Segunda coleta DENY, sem boot observado |01:40:39.463180–01:40:39.479116 |22:40:39 |
| Complemento deploy atual, seis comandos |01:54:56.720312–01:54:56.880586 |22:54:56 |
| Transferência registrada |01:55:06.313625 |22:55:06 |
| Recibo canônico da custódia |01:55:06.330391 |22:55:06 |

originalCollectionCompleted=false e atomicSnapshot=false permanecem no recibo.
As18 observações originais mantêm timestamps, hashes, ausências e limites antigos;
a coleta original continua DENY. Não se prova identidade de boot retroativa.
Os seis comandos atuais são sequenciais, sem snapshot atômico entre si ou com18
leituras anteriores. Nenhuma medição contínua de HTTP/indisponibilidade foi feita.

## Análise local dos resultados atuais

- **boot_id:** leitura válida e preservada privadamente. Não publica UUID nem une
  retroativamente as épocas. Prova apenas o valor observado nesse comando.
- **crontab deploy:** seis linhas ativas não comentadas e23 comentadas. O conteúdo
  permanece privado. Não se executou job, retenção ou compensação. Contagem não
  substitui conferência integral dos dois controles para uma futura janela.
- **Supervisão:** `pm2-deploy.service` respondeu **ActiveState=inactive**,
  **UnitFileState=enabled**. É fato atual dessa unidade, não prova de API/worker
  parados. O histórico de recuperação atesta supervisionRestored=true e aceite
  das telas ([RECOVERY_COMPLETE](../crm-csv-original-recovery-20261016/RECOVERY_COMPLETE.md));
  não é identidade semântica entre esse boolean histórico e ActiveState atual.
  Há uma divergência/pendência a esclarecer por leitura dirigida futura autorizada,
  sem atribuir causa, data de mudança ou executar restart/reparo agora.
- **ps:**164 linhas de processos, metadados/comm sem args/env. Nomes podem conter
  espaços/títulos customizados; não inferir ausência de Node, trio ou writers por
  busca de nome ou contagem. Identidades/configurações atuais não foram certificadas.
- **ss:**12 linhas de listeners, visibilidade deploy. Não é owner-set root,
  validação de proxy ou health/DB. Não foram feitos HTTP, SQL ou novas leituras.
- **Ferramentas:** node resolvido em `/usr/bin/node`; PM2 não resolvido no PATH
  fixo do coletor. Ausência de resolução não demonstra ausência de PM2 instalado:
  perfis podem ter outro PATH/NVM. Nenhum Node/PM2 foi executado; R4 permanece aberto.

Os dois resultados anteriores continuam intactos: todos os arquivos de ambas as
custódias mantiveram hash, tamanho, inode, modo, mtime e ctime; conjuntos de nomes
iguais. Nenhum recibo histórico foi reescrito. Fonte root e2a5ffab…, helper/sudoers,
Event775 e ausências de bibliotecas/alias continuam **evidência histórica01:22UTC**,
sem nova certificação ou ajuste de pins/bindings.

## Pendências e limites

Esta autorização terminou na análise local. Próxima decisão deve delimitar a
leitura sobre a supervisão e identidade/toolchain; R3/SQL/ownership e R4 completo
não foram executados. Não foram preenchidos16 vínculos, perfis ou autoridade.
Não houve instalação, emissão, reparo, alteração de permissões, backup, RPO,
capacidade, contenção, start/stop, importação, envio ou janela. NEWauth+NEWDB+NEWcipher,
crons, guarda38 e out.15 não sofreram alteração por esta coleta; sua condição atual
completa não foi recertificada e a supervisão observada está explicitada acima.

Código/roteiro publicado e os dois pacotes consumidos não foram alterados.
Somente este resultado sanitizado, hashes e três checkpoints compõem a allowlist.
Vercel deploymentEnabled=false e CI versionado limitado a main/develop foram
reconferidos; nenhuma configuração ou workflow foi alterado/disparado manualmente.
Responsável: Deifson; revisão21/10/2026 ou antes conforme mudança/gatilhos.
