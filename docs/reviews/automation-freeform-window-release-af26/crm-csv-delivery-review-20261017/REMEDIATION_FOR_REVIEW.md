# Event — proposta mínima de remediação para decisão separada

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
