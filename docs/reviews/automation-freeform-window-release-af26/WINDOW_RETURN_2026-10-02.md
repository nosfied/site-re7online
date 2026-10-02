# Janela af26 de 02/10/2026: retorno compatível concluído

**Resultado: `af26f48a` NOT DEPLOYED.** A tentativa iniciada nesta janela chegou à contenção e à saída comprovada da API e do worker antigos, mas não iniciou o candidato. O atendimento voltou ao conjunto produtivo anterior compatível. Não há aceite funcional da release af26.

## Evidência e sequência

- O owner confirmou que havia um único executor para esta janela. A leitura remota encontrou o frontend antigo online, API e worker ausentes, `old-exit-confirmed.json` do modo `switch` presente e nenhuma evidência de start do candidato.
- O backup fresco desta janela registrou `database.dump` com 24.075.411 bytes e SHA-256 `156a73aa2f6cde9c306d5bead8d8331da972ac31c57b86d533aa0f5b1bb56e7c`; catálogo com 614 objetos. A restauração isolada usou esse mesmo hash, removeu o banco temporário, não iniciou aplicação/provider e não encontrou divergência de checksum de migration. Evidências privadas permanecem em `/opt/re7online/backups/converta-persistent/preparations/freeform-window-af26/`.
- A prova privilegiada para `switch/start:re7-whatsapp-agent`, registrada às 18:54:51 UTC, não foi consumida em 300 segundos. O protocolo usa arquivos exclusivos por ação e proíbe reaproveitamento de prova vencida. Não se iniciou o candidato nem se apagaram marcadores para repetir a ação.
- Foi escolhida a rota preparada `return-partial`. A barreira de saída do par antigo foi novamente verificada às 19:08:05 UTC. API compatível iniciou às 19:08:40 UTC. O primeiro start do worker foi barrado **antes de `start-intent`** por `successor_identity_changed`: o PID e o tempo de início da API não mudaram, `restart_time=0`, mas o estado transitório do processo passou de `R` a `S`. O verificador comparava também esse estado.
- Para recuperar sem reutilizar a prova consumida, os dois scripts de verificação do modo `return-partial` receberam correção restrita: identidade estável por PID e tempo de início, com rejeição de zumbi, e uma ação de retomada do worker com nova prova privilegiada e marcador próprio. Os originais e o manifesto anterior foram preservados na preparação privada. O manifesto corrigido foi conferido integralmente; hashes de `ops.py` e `delegated.py`: `56a495f769bd7f8d9ebc0544671d271d146162061e6c204aa1f6356691d45540` e `292d36d3435a9cd8833781377012bc686ef34979c9aac10850ac18131470a53a`. O start anterior não tinha criado `start-intent` nem worker. O teste local focado confirmou `R→S` como mesma identidade e rejeição de tempo de início distinto/zumbi.
- Worker compatível iniciou às 19:15:14 UTC. O frontend anterior permaneceu online; como já correspondia ao alvo de retorno, não foi parado. O conjunto completo foi conferido e salvo em PM2 e fallback, com hashes iguais `741315196503d120c9213845f0caa3743723b06b7137282bf8d25c56d9154514`.
- A prova da retirada da barreira foi registrada às 19:16:31 UTC. Validação técnica: três endpoints de health `200`, DB `ok`, três páginas do frontend `200` com BUILD_ID esperado, worker health aprovado; zero jobs não concluídos, grupos, leases ativos, campanhas `sending` ou `scheduled`, e nenhuma divergência nas identidades de sessões/auth e flags comparadas ao baseline preparado. O owner confirmou Inbox e CRM carregando em sua sessão, somente leitura.
- A guarda foi restaurada por CAS ao estado inicial **aberto**, geração 11, às 19:24:08 UTC, com motivo auditável referente ao retorno. Cron de backup e boot foram restaurados pelo operador; a prova final foi consumida às 19:25:13 UTC e o crontab do usuário voltou ao baseline. A leitura final às 19:27:05 UTC encontrou `pm2-deploy.service` `inactive/enabled`, três processos online sem restart/watch, guarda aberta sem tasks/fault e scheduler da API habilitado (`CAMPAIGN_SCHEDULE_PROCESSOR_DISABLED=false`).

A contenção foi comprovada às 18:36:49 UTC e retirada às 19:16:31 UTC, intervalo entre provas de 39 min 42 s; a aplicação da regra ocorreu antes da primeira prova. O par antigo estava comprovadamente fora às 18:53:33 UTC. Esse intervalo não prova ausência de impacto em inbound/outbound/auth; não foi realizado replay de resultado incerto. O horizonte de escalonamento de 15 minutos foi ultrapassado e comunicado ao owner durante a recuperação. O instalador pontual dos verificadores retornou erro apenas na sua asserção final por inversão das variáveis `nome/hash`; a leitura subsequente confirmou todos os hashes do manifesto, os backups originais e a ausência de start anterior do worker antes da retomada.

## Estado efetivo e limites

| Componente | Release efetiva no encerramento |
| --- | --- |
| API | `b66bb89aca9112277463b7d2adbee0b9e7831157-api` |
| Worker | mínimo `worker-bf5f1d76-f06d49cb-91230f88-b66bb89a` |
| Frontend | `ba66c24112ccb10f2dfdcced54350f513d399bc6` (BUILD_ID `l1eBvPioySXt7NLiuFMkg`) |

Leitura final: quatro sessões WEB_SESSION conectadas e uma desconectada, cinco registros de auth; a comparação com o baseline da janela passou. Uma linha histórica de lease existia, mas nenhum lease ativo. Não houve migration, restauração sobre produção, limpeza de auth/locks, logout, provider/test-send, ativação de tenant ou deploy do candidato af26.

Antes de uma nova janela af26, corrigir **no pacote revisável original** o comparador de identidade para ignorar `R/S` sem perder a proteção por PID/tempo de início/zumbi e prover renovação segura de provas expiradas com novo nonce e trilha sem sobrescrita. Reensaiar os dois pontos e revisar os hashes/manifesto. Uma nova janela exige preflight, backup e provas novos; os marcadores desta tentativa não podem ser reutilizados. META_CLOUD puro e híbrido API→WEB permanecem sem validação funcional desta release. Campanhas/CRA e demais frentes mantêm seus estados anteriores.

Atualização posterior: [patch e ensaio local do protocolo](OPERATIONAL_PROTOCOL_FIX_2026-10-02.md) preparados nos quatro modos; **não instalados em produção** e ainda sujeitos a revisão e nova janela.
