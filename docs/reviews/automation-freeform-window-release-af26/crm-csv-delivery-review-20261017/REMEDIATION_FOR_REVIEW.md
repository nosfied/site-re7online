# Event — proposta mínima de remediação para decisão separada

## Resultado da execução autorizada —17/10/2026,14:17:02 Fortaleza

**PREFLIGHT CONSUMED/DENY / APLICAÇÃO NÃO AUTORIZADA.** Base/remoto f0538524 conferidos, fontes/manifests/hashes publicados PASS. O bloco literal abaixo foi executado **uma vez**, deploy sem sudo. [Resultado sanitizado e procedência dos canais](PREFLIGHT_RESULT.json). Exit1, sem timeout ou falha de transporte; `denialStage=tool-preflight`, `denialReason=READ_OR_TOOL_FAILURE`, `errorClass=FileNotFoundError`, `errno=2`. A primeira operação da etapa é `os.lstat('/usr/bin/getfacl')`: esse caminho obrigatório não pôde ser resolvido (ENOENT). Isso não prova o estado de instalação de um pacote ou ausência de qualquer ferramenta em outro caminho; **nenhuma busca/alternativa foi realizada**.

Foi observada somente a identidade do executor: uid/euid1000, gid/egid1000, quatro grupos suplementares preservados privadamente. Isso confirma ausência de elevação nessa execução, não atribuição dos writers. **Zero diretórios/cadeias/ACLs observados e zero comandos getfacl executados.** A negativa precede a abertura de qualquer alvo. Canais stdout602B/stderr0B, registro de comando e recibo estão privados0700/0600, conferidos byte-exatos com o leitor/custódia canônicos; sourceComplete=false e applicationAuthorized=false. Não há PASS parcial dos pais.

### Decisão técnica sobre0775→0755

**DENY de aplicação por evidência insuficiente, sem rejeitar nem executar a proposta de desenho.** Nenhuma ACL, modo ou cadeia atual dos cinco foi obtida nesta tentativa. A identidade do executor é compatível numericamente com o owner1000 da referência anterior; isso não certifica owner atual ou cobertura de outros executores. O registro das14:02:30 continua provando0775 somente do primeiro pai **naquele horário**; a R1 das01:22UTC continua histórica para os cinco. Não atualizar timestamps, unir os intervalos como snapshot nem promover essas referências a CAS da tentativa14:17.

Retirar g+w de diretórios0775 preservaria owner=rwx e leitura/travessia de grupo/outros, retirando criação/remoção/rename de entradas por quem depende de grupo. Sem ACL access/default atual não é possível concluir se haveria também redução por máscara em entradas nomeadas nem avaliar sua herança. Os efeitos condicionais descritos na tabela de consumidores abaixo continuam válidos; nenhum consumidor foi demonstrado como dependente de g+w, **mas sua ausência e exclusão continuam desconhecidas**. Coleta falhou antes de esclarecer esse ponto, não evidenciou conflito concreto de um writer nem atribuiu causa histórica.

### Faltante exato e próximo ato para decisão, sem continuação automática

1. Decisão separada do owner sobre disponibilização da ferramenta ACL explicitamente exigida ou revisão prévia do mecanismo de obtenção dessa evidência. O roteiro consumido não pode prosseguir na situação observada. **Esta entrega não propõe comando de instalação, alternativa automática, novo coletor, nova coleta ou aumento de privilégio.** Não executar novamente o bloco/destino abaixo.
2. Depois dessa decisão e de eventual autorização própria, ainda obter os cinco estados completos (cadeia/metadados/ACLs) em destino novo. Nenhum deles foi certificado agora; a nova evidência não pode ser fabricada a partir das custódias anteriores.
3. Atribuir os mantenedores Git/npm/automação/sessões relevantes e comprovar sua exclusão durante a manutenção. A consulta de identidade/ACL não substitui esse requisito. Não foi autorizado inventário genérico ou contenção para fechá-lo.
4. Somente com esses insumos: executor/plano/hash/intent novos revisados e aprovação explícita; CAS/revalidação por FD, verificação integral e retorno condicionado já descritos. Nenhuma autorização ou prontidão de aplicação decorre desta coleta.

O bloco abaixo passa a ser **registro consumido de f0538524; não é instrução reutilizável**. Seus bytes, scripts/fontes, testes, registros anteriores e destino foram preservados; não se corrigiu o gate para obter PASS. ELF segue PAUSADO; sem nova leitura remota, chmod, teste de escrita, instalação, sudo, SQL, backup ou janela. NEWauth+NEWDB+NEWcipher/crons/guarda38/out.15 não foram modificados; sem recertificação global de produção. Responsável Deifson; revisão17/10, próxima21/10 ou antes de uma nova decisão. CSV SUSPENSO / NOT DEPLOYED / NOT WINDOW READY.

---

**SOMENTE PROPOSTA / NÃO EXECUTADA / NÃO É AUTORIZAÇÃO DE CSV.** Responsável: Deifson; revisão17/10/2026, próxima21/10 ou antes de qualquer mudança.

## Impedimento demonstrado e alcance

A execução literal única de92df116b terminou às14:02:30 Fortaleza (17:02:30UTC), exit1, `event-parent-contract` / `EVENT_PARENT_CONTRACT_NOT_SATISFIED`. O primeiro pai `/opt/re7online/site-re7online/apps/whatsapp-agent/src/events` é diretório0775, uid/gid1000. `event_parents` exige diretório sem bits0022; o bit de escrita de grupo viola esse contrato. Não houve timeout, sudo, escrita remota, retry ou leitura adicional. Custódia dos canais e journal verificada byte-exata; stderr vazio. [Resultado e hashes](RESULT.json).

A observação atual desse primeiro pai coincide com a R1 histórica em dev/inode, uid/gid, modo, mtime/ctime. Isso não é captura atômica nem prova de continuidade entre horários. Os outros quatro pais0775 abaixo são **somente históricos**, da R1 às01:22:00UTC17/10 (22:22:00 Fortaleza16/10), recibo pinado931c9c39…/87.778B. Não foram alcançados agora; nenhum deles está certificado atualmente. O arquivo Event0664 é também histórico e fica fora da mudança proposta.

## Uma proposta restrita, com allowlist literal

Propor a remoção **somente de escrita de grupo** nos cinco diretórios historicamente impeditivos, após preflight atual integral e decisão do owner. Não é chmod recursivo, troca de owner, mudança de arquivos ou aplicação do overlay:

| Diretório literal | Antes admitido para esta proposta | Depois proposto | Evidência disponível |
| --- | --- | --- | --- |
| /opt/re7online/site-re7online |0775 |0755 |R1 histórica |
| /opt/re7online/site-re7online/apps |0775 |0755 |R1 histórica |
| /opt/re7online/site-re7online/apps/whatsapp-agent |0775 |0755 |R1 histórica |
| /opt/re7online/site-re7online/apps/whatsapp-agent/src |0775 |0755 |R1 histórica |
| /opt/re7online/site-re7online/apps/whatsapp-agent/src/events |0775 |0755 |Atual17:02:30UTC e R1 histórica |

Os pais `/`, `/opt`, `/opt/re7online` não são alvos. O arquivo `eventRetentionPolicy.ts`, descendentes, arquivos selados, releases, `.env`, credenciais e políticas permanecem fora da allowlist. A escolha de cinco evita uma correção isolada do primeiro pai que apenas deslocaria a recusa se os outros quatro permanecerem como na R1; **não** presume que estejam iguais. Antes diferente exige DENY/revisão, sem ampliar a lista ou adaptar valores para PASS.

## Efeito por consumidor e evidência insuficiente

O consumidor comprovadamente bloqueado é o predicado canônico208f2ef5…: `event_parents` → `validate_pre_stop` → checker/CLI antes de contain/stop, revalidado em Operations/overlay. Não será substituído nem relaxado. O classificador é importado por `apps/whatsapp-agent/scripts/events-retention.ts` e `apps/whatsapp-agent/scripts/storage-report.ts`; mudar diretórios não executa esses scripts, não muda Event nem reabilita retenção. O retorno ORIGINAL continua independente do overlay.

0755 preserva leitura/travessia para o grupo e escrita do owner; retira do grupo criação, remoção e rename de entradas nesses diretórios. Pode afetar automações de atualização/staging por outro UID, mesmo sem alterar API/worker/frontend ativos. Não há prova atual completa dos writers de filesystem, ACLs ou identidade efetiva desses consumidores; uid1000 observado não identifica sozinho o usuário executor. Se houver ACL estendida, alterar os bits de grupo pode alterar sua máscara e acesso efetivo. **Esses efeitos devem ser esclarecidos no preflight restrito, não presumidos seguros.** Arquivo0664 pode continuar gravável por grupo: corrigir os pais satisfaz apenas esse predicado, não certifica integridade ampla nem permissões do arquivo.

## Próximo ato operacional exato para revisão e autorização

Aprovar separadamente uma operação de manutenção **limitada aos cinco caminhos da tabela**, com duas fases: preflight integral privado antes de qualquer efeito, depois aplicação única condicionada a CAS. Não executar A/B, stop/start, overlay ou CSV como parte dela. Não há comando de aplicação liberado nesta rodada: faltam metadados atuais dos quatro pais não alcançados, ACLs e atribuição dos writers de filesystem. Não fabricar esses bindings a partir da R1. Esta proposta define os efeitos; um executor literal e seus hashes devem ser revisados antes de autorização de aplicação.

1. Conferir identidade legítima do executor, tipo/cadeia sem symlinks, dev/inode, uid/gid, modo, nlink, mtime/ctime e ACL de **cada um dos cinco**, com FDs no-follow estáveis. Preservar privadamente o estado anterior e diagnóstico pelos canais/custódia canônicos; ausência, acesso negado ou resposta perdida nega, sem sudo/fallback automático. Comparar o primeiro com a observação17:02 e os demais com a R1 como referências datadas; qualquer mudança precisa classificação explícita, não atualização oportunista. Confirmar que a retirada de g+w não bloqueia os escritores legítimos identificados. Não usar teste de escrita para descobrir consumidores.
2. Selar plano/hash/intent novo exclusivo com os cinco estados atuais aprovados e o efeito literal0775→0755. Verificar **todos antes da primeira mudança**, revalidar no FD no ponto de uso e conferir cadeia/resolução. A aplicação por FD deve comparar identidade e metadados esperados imediatamente antes do fchmod; uma checagem seguida por chmod de caminho substituível não basta. Operações de filesystem não são uma transação global: corrida entre comparação e efeito permanece risco residual; sem exclusão/cobertura dos writers relevantes não declarar CAS forte nem prosseguir. Sem criar/remover diretórios ou corrigir inconsistências.
3. Aplicar uma única passagem, somente aos FDs atestados; manter owner/gid e demais bits. Registrar cada efeito e metadados posteriores. Falha/parcial/timeout: preservar intent/recibo/journal e inspecionar somente conforme autorização; não repetir passagem, não completar automaticamente os restantes nem fazer rollback cego.
4. Verificar separadamente os cinco resultados e a cadeia completa pelo **mesmo** `event_parents`, sem dispensar outros verificadores. Comparar owner/gid/dev/inode e conteúdo Event com o estado anterior autorizado; registrar ctime alterado como efeito esperado, sem reescrever prova antiga. Não afirmar PASS dos pais não observados; mesmo PASS integral de Event não admite gates, instalação ou janela.
5. Retorno apenas por decisão explícita: restaurar os bits removidos nos diretórios efetivamente mudados e comprovados pelo recibo, nos mesmos dev/inode/owner/gid, com CAS do estado pós-mudança, cadeia e ausência de drift concorrente. Divergência nega retorno automático. Restauração0775 reintroduz a negativa pré-parada; não é retorno do backend nem restauração de credenciais.

## Depois desta remediação, sem continuação automática

Mesmo que Event passe, o próximo requisito CSV é a obtenção dirigida dos dados atuais de trio/saved/fallback/controles e canal SQL/ownership, com autorização própria para SELECT e atribuição; seguem vínculos/autoridade e proteção dos consumidores. Não há backup/RPO a renovar enquanto não houver janela coordenada. Reusar composição, pacotes e provas válidos, incluindo recuperação ORIGINAL e prevenção pré-parada. ELF/toolchain-discovery permanece pausado; não se inventa sua certificação nem se retoma esse método auxiliar.

NEWauth+NEWDB+NEWcipher, ambos os crons, frontend, guarda38 e out.15 não foram modificados. Isso descreve ausência de efeitos nesta operação, **não** uma recertificação atual global de produção. CSV SUSPENSO / NOT DEPLOYED / NOT WINDOW READY.

## Preflight literal f0538524 — registro agora CONSUMIDO, não repetir

```bash
(
set -euo pipefail
umask 077
python3 -B -I -S - <<'REVIEWED_EVENT_PREFLIGHT'
import hashlib,os,stat,sys
from pathlib import Path
p=Path('/home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/tmp/worktrees/re7-campaign-recovery-20260926/scripts/crm_csv_delivery/preflight.py')
for q in (p,*p.parents):assert not q.is_symlink(),'reviewed_source_symlink'
s=p.lstat();assert stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_size<65536,'reviewed_source_type_size'
def meta(m):return tuple(getattr(m,'st_'+k) for k in ('dev','ino','mode','uid','gid','nlink','size','mtime_ns','ctime_ns'))
fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
try:
 assert meta(os.fstat(fd))==meta(s),'reviewed_source_replaced'
 raw=os.read(fd,65536)
 assert meta(os.fstat(fd))==meta(s)==meta(p.lstat()),'reviewed_source_changed'
finally:os.close(fd)
assert hashlib.sha256(raw).hexdigest()=='4447ecad371247b57b6f0007b719362e6f716339e0a6a792ae27a5b8f42516f7','reviewed_event_preflight_digest'
ns={'__name__':'reviewed_event_preflight_driver','__file__':str(p)}
exec(compile(raw,str(p),'exec'),ns)
sys.exit(ns['execute']())
REVIEWED_EVENT_PREFLIGHT
)
```

### Ferramentas, sequência e destinos do comando acima

Na preparação f0538524, o bloco estava **preparado para revisão**, com autorização de preflight separada de chmod. A execução posterior está registrada no início deste documento: **CONSUMED/DENY**, sem autorização de aplicação. Há um só SSH deploy, BatchMode/StrictHostKeyChecking, prazo25s, sem reconexão. Nenhum arquivo remoto é criado. O destino local novo é `/home/deifson-oliveira/DEIFSON/re7-private-retention-custody/csv-delivery-event-preflight-20261017-v1`, exclusivo0700, sob o pai privado existente; destino já existente nega antes de SSH. Os destinos Event-boundary, R1 e complementações anteriores continuam consumidos/intocados.

| Ferramenta / fonte | Conferência anterior ao uso | Ausência / divergência |
| --- | --- | --- |
| ThinkPad `/usr/bin/ssh`, Python3/stdlib |Disponíveis no laboratório; script/reader/fontes conferidos antes do único SSH |Nega localmente, sem conexão |
| VPS `/usr/bin/python3 -B -I -S` |Canal já usado; erro de execução é preservado em stderr/exit do SSH |Sem alternativa/interpretação via app |
| VPS `/usr/bin/getfacl` |**Na preparação, disponibilidade remota desconhecida; na execução, caminho fixo ENOENT (resultado acima)**. Primeiro gate remoto após identidade: arquivo regular/no-follow, FD, metadados estáveis, SHA e versão, antes dos alvos |Nega antes de ler os diretórios. Sem command-v/search, instalação, sudo, getfattr/xattr alternativo ou fallback |
| `/proc/self/fd`, openat/no-follow e passagem de FDs |Uso real no laboratório; ausência/acesso negado remoto nega |Não substitui por reabertura do mesmo caminho |

No laboratório getfacl2.3.2 foi conferido e executado por **imagem FD**, com argv0 estável. O primeiro ensaio expôs que argv0 pelo número do FD altera o nome impresso por `--version`; corrigiu-se somente argv0 mantendo executable no FD, sem relaxar formato. A presença desse utilitário e a proteção de seu caminho na VPS não são certificadas pela prova local. Seu hash é observação, não autoridade para instalar/executar aplicações ou certificação do toolchain pausado.

O driver carrega os bytes pinados do transporte anterior, `stable_file/meta` do leitor R2 e `Capture/private_record` canônicos, sem entrypoints históricos. O reader e o novo corpo remoto são verificados e compilados dos mesmos bytes; não há hash seguido de import por caminho mutável. A consulta inicia registrando uid/euid/gid/egid/grupos e exige executor não privilegiado, sem mudança de identidade. A sessão SSH é a de deploy. Um uid numérico não prova cobertura dos writers.

A cadeia deduplicada `/`→`/opt`→`/opt/re7online`→cinco alvos é aberta componente a componente, no-follow, com FDs mantidos até o final. Registra nove campos do `meta` canônico: dev/ino/mode/uid/gid/nlink/size/mtime_ns/ctime_ns. Cada ACL dos **cinco** alvos é lida pelo getfacl numérico sobre o FD herdado, incluindo ACL default, sem teste de escrita. Não se lê o arquivo Event ou perfis/ambientes; metadados/ACLs dos pais não alvos não autorizam sua modificação. A coleta final revalida FD, resolução por pai e metadados de todos os elos; atime não integra o contrato canônico. Intervalos separados não são snapshot atômico; a amostra não exclui writers nem garante estabilidade futura.

Cada comando getfacl tem argumentos, início/fim, exit, tamanho/hash e canais Base64 privados, mesmo se houver parcial. Prazo3s por chamada, saída131.072B por canal (no excesso preserva o byte sentinela adicional), versão mais cinco ACLs; tool máximo1MiB lido só em memória para hash. Timeout/excesso encerra/recolhe o filho, sem retry. Canais externos stdout/stderr do único SSH são preservados antes do parse, com seus horários/código/tamanhos/SHA pelo Capture e journal canônicos. Não há novo escritor de custódia ou exportador remoto. Ausência, acesso negado, symlink, adulteração, erro/formato ACL ou drift nega e preserva o alcançado; os restantes não são certificados.

Resultado completo significa **OBSERVED_NOT_AUTHORIZED**;0775 e ACL estendida/default são observados, nunca convertidos em autorização de0755. `writersExcluded=false`, `applicationAuthorized=false`, `eventParentsCertified=false`. O predicado Event original não é chamado para produzir PASS sobre0775, nem foi modificado. Ele continua exigido na verificação futura depois de qualquer mudança aprovada.

### Consumidores: o que a documentação/configuração permite afirmar

| Consumidor / referência existente | Relação com os cinco diretórios | Conclusão sobre dependência de g+w |
| --- | --- | --- |
| Runbook, fluxo histórico de deploy sem migration (checkout/pull no checkout e npm ci/db:generate/build em apps/whatsapp-agent) |Git pode criar/remover/renomear entradas em todos os cinco; npm gera dependências/artefatos sobretudo abaixo de apps/whatsapp-agent |Se UID efetivo for owner,0755 mantém escrita. Se depender de grupo/ACL, pode quebrar atualização. Configuração documental não demonstra UID/grupos atuais ou exclusão. Exemplos antigos não serão executados |
| Política original-only e2a5 pinada na custódia R1; targetProcesses.return |API usa release security-epoch-v3-36f51ebe…; worker usa release worker-minimal-reactive…; ambos fora do checkout alvo |Não demonstram necessidade de criar entradas nos cinco pais. São referências históricas atestadas, não identidade/cwd atual nem prova de ausência de outros acessos |
| `apps/whatsapp-agent/scripts/events-retention.ts` e `storage-report.ts`; package.json events:retention/storage:report |Leem/importam Event; retenção modifica DB e relatório lê filesystem. `.data`/logs são descendentes distintos; travessia permanece com0755 |Nenhum exige comprovadamente g+w dos cinco pais para importar o módulo. Não executar os scripts para testar; não certificar credenciais/políticas ou reabilitar retenção |
| Cron de media/retention documentado no runbook |Cwd do checkout, saída em `.data/logs`, sem criação demonstrada nos cinco diretórios literais |Permissões de descendentes ficam intactas. Documento não é crontab atual, nem prova de identidade/writers; crons recuperados não serão alterados |
| Preparadores futuros/overlay Event e `prestop_contract.event_parents` |Consumidor direto do contrato de pais sem0022, revalidado no uso |Mudança proposta resolve só esse contrato se toda cadeia estiver adequada; não autoriza overlay, CSV ou outra alteração |

**Não foi identificado em evidência disponível um consumidor que comprovadamente precise de escrita de grupo nesses cinco diretórios específicos. Isso não prova sua ausência.** Faltam atribuição efetiva de mantenedores/Git/npm/automação/SSH concorrentes e respectivos direitos/locks. O preflight proposto não faz inventário genérico de processos nem pretende fornecer essa exclusão. Antes de aplicar: owner deve identificar e impedir sessões/jobs de manutenção relevantes durante a operação, com mecanismo/identidade e saída comprovados sob decisão específica; lock advisory desconhecido não é exclusão. Se essa cobertura não puder ser demonstrada, aplicação continua bloqueada, mesmo com coleta completa.

### Decisão possível depois do preflight e controles de aplicação/retorno

- Se getfacl faltar: diagnóstico exato TOOL/PATH/errno custodiado; nenhum alvo certificado. Parar e decidir separadamente, sem ferramenta alternativa automática.
- Se o preflight negar ou qualquer alvo divergir da proposta literal0775/identidade/cadeia: preservar; não adaptar input. Não há PASS parcial autorizando chmod.
- Se completo: analisar owner/grupos e ACL access/default de cada alvo. ACL estendida exige avaliar efeito da máscara;0775→0755 não é autorização para alterar uma máscara sem essa análise. O preflight não fabrica esse aceite.
- Somente após owner aceitar impactos e cobertura/exclusão: futuro plano/intent/hash novo ligado ao snapshot privado, aplicação por FD com revalidação imediata, sem CAS simulado como atomicidade de filesystem. O executor de aplicação **ainda não está entregue/autorizado**; resultado da coleta é o insumo necessário. Os cinco efeitos/partial/recibo e retorno condicionado já delimitados acima permanecem exigidos.
- Verificação futura: mesmas identidades/owners/grupos/ACLs esperadas e modo0755, cadeia/predicado Event completo; conteúdo Event, releases e controles preservados. Retorno só sobre FDs/efeitos comprovados, CAS pós-mudança e decisão explícita, sem rollback automático, restaurando0775 e sua negativa conhecida.

### Validação local desta extensão

[14 provas focadas](PREFLIGHT_PROOFS.json), reproduzíveis com `PYTHONDONTWRITEBYTECODE=1 python3 -m scripts.crm_csv_delivery.test_preflight`. Bash/heredoc/Python literal executados em laboratório; shim Python só injeta a instrumentação local de SSH/namespace/custódia. Código verificado, decisões, FD/getfacl local, leitor, Capture e private_record reais. O namespace remoto é fixture temporária; UID/root, access denied, substituição, ACL estendida/formato, timeout e resposta perdida são fronteiras simuladas explicitamente. Excesso de canal usa filho local real e limite real. Destino existente e adulteração de source/reader negam antes de SSH. Prova local não certifica ferramentas, ACLs, identidades ou exclusão de writers produtivos. Nenhuma suíte anterior, rebuild, captura VPS ou ação consumida foi repetida.

LOCAL VALIDATED no alcance acima / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY. Apenas preflight futuro para revisão; nenhuma autorização de aplicação. ELF continua PAUSADO.
