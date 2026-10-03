# Syer — ativação restrita de acompanhamento de automação

## Adendo de leitura, 03/10/2026 UTC

A afirmação histórica “somente em Syer” abaixo descreve a conferência de 30/09 às 00:52 UTC, não o estado atual. Leitura somente leitura do banco em 03/10 encontrou a chave `allowAutomationConversationsInInbox=true` em **dois** tenants: `syer-rodrigues` e `cra-pr`. Para CRA-PR há evento `inbox.automation.settings_updated` `enabled=true` em **30/09/2026 18:14:38.106 UTC**, com ator cuja role corrente é ADMIN e vínculo com o mesmo tenant; o handler exige ADMIN no momento da gravação. Não há, nesta leitura, prova de aceite funcional CRA-PR, nem foi feita alteração da chave. O `updatedAt` geral da configuração não é tomado como horário da ativação. Esta reconciliação é independente da análise af26/PostgreSQL.

## Incidente prioritário 91230f88 — correção local para revisão, 29/09/2026

**INCIDENT OPEN IN PRODUCTION / FIX LOCAL VALIDATED / NOT DEPLOYED.** [Matriz de todos os tenants, causa, testes e retorno compatível](AUTOMATION_RUNTIME_SELF_WRITE_INCIDENT_2026-09-29.md). Syer: escrita própria de atividade outbound invalidava updatedAt e impedia persistir avanço. Tendência: conflito correlacionado com encaminhamento humano legítimo; não atribuído ao loop. Demais tenants inventariados, sem prova de ocorrência no período observado.

Fix mantém CAS e reconhece apenas a escrita própria condicional; protege tenant/identidade, ciclo, inbound e transições humanas. API inclui projeção de identidade Meta condicional; worker exclusivamente mínimo bf5+f06+912 com patch específico de quatro fontes. 15 casos integrados API; caso Meta/IA revalidado após projeção; 14 aplicáveis no worker Node20.20.0, também nos compilados; 89 regressões afetadas PASS, sem somar reexecuções. Backend tipado PASS; worker --noCheck PASS e 13 diagnósticos --noEmit idênticos à base, sem aprovação integral de tipos.

Publicação somente para auditoria; nenhum restart, alteração da guarda/scheduler, fluxo, transporte ou runtime produtivo. Retornos estreito/abrangente e riscos estão no incidente, sem execução autorizada nesta etapa. Recuperação exige avanço persistido após publicação controlada, não health. Chave Automação permanece ligada somente em Syer; sua validação não equivale a CRA. Resposta automática tardia e frente maior pendente continuam separadas. Campanhas/CRA aguardam owner; SECULT e DB-only encerradas; inatividade Guia pausada;6683 CLOSED.


**ACTIVATED IN SYER / FUNCTIONAL VALIDATION PARTIAL.** Tenant confirmado pelo owner: Syer Rodrigues, chave canônica `syer-rodrigues`, ACTIVE. Não existe chave exata `syer`; a correspondência foi confirmada antes da ativação. Não foi ativado demo-converta ou CRA-PR.

## Ativação e isolamento comprovados

Às 00:32:47.136 UTC 30/09/2026 (21:32:47 Fortaleza 29/09), uma sessão ADMIN legítima do próprio tenant executou a gravação pela página `/app/settings/inbox`, seção Acompanhamento de automação, botão Salvar acompanhamento. Owner confirmou o toast “Acompanhamento de automação atualizado.” Codex não recebeu credenciais, fabricou sessão, chamou setter por bypass ou editou JSON/DB diretamente.

`PUT /app/settings/inbox/automation-conversations` exige autenticação do tenant, papel ADMIN e cliente ACTIVE. O setter `saveAllowAutomationConversationsInInbox` transforma a configuração atual sob lock transacional; o evento `inbox.automation.settings_updated` integra a mesma transação. Leitura produtiva comprovou false→true, evento enabled=true e autor ADMIN do próprio tenant. A role do autor na consulta é a role corrente; a exigência ADMIN na execução é estabelecida pelo handler, sem inferir papel histórico somente dessa leitura.

Na conferência imediata após ativação (00:33:34 UTC), o fingerprint dos campos alheios à chave no tenant permaneceu igual; projeção das chaves dos demais tenants permaneceu igual, com zero outros enabled. Evidências privadas em `local-evidence/syer-automation-activation/`, fora do Git. Nenhum deploy/restart, alteração de campanhas/scheduler/transporte/fluxo ou outro tenant realizado nesta etapa.

## Evidências funcionais e limites

A validação produtiva não deve herdar PASS dos testes locais. Referência reutilizada: [matriz, testes 36/22 e quatro casos dirigidos posteriores](INBOX_AUTOMATION_LOCAL_2026-09-29.md), cada conjunto com seu escopo histórico. Não repetidos nesta ativação. Conteúdo restrito, mensagens/anexos, acesso direto AGENT e revogação com conversa aberta exigem sessões legítimas/casos existentes; não criar fixture ou provocar mensagens para obter PASS.

Intervenções não foram executadas. Disponibilidade visual de Assumir/Transferir não comprova elegibilidade: SUPERVISOR precisa de escopo departamental para operar; ADMIN não ganha elegibilidade automática de destinatário/capacidade. Leitura independente de departamento não altera essas regras. Antes de assumir/encaminhar um caso real, identificar ao owner e obter indicação específica. Resposta automática já submetida pode ainda chegar após intervenção; não há cancelamento garantido. A limitação de envio tardio não é a regressão de persistência identificada abaixo.

## Achado separado — repetição de consentimento WEB_SESSION

Owner relatou respostas 1/2 na conversa autorizada (identificação preservada somente na evidência privada), por WhatsApp real. Auditoria restrita ao tenant/caso, sem novo envio provocado: fluxo ativo/entryPoint começa em consentimento, acceptOption=1, declineOption=2, destino de aceite existe; definição não foi modificada. Caso recebido por WEB_SESSION, com eventos Meta deduplicados, não autorização para trocar transporte. Runtime observado: BOT, handoff NONE, status null, sem flow/chatbotNodeId e chatbotActive=false. Logs consultados do worker incluem `automation.runtime.stale_write_skipped` para esse tenant; não se atribui a cada linha um timestamp/caso que a projeção não comprovou.

**Regressão confirmada no mecanismo introduzido por 91230f88, não erro de resposta 1/2:** `webSessionInbound.ts` captura token, executa chatbot e chama `createWebSessionTextOutboundMessage`; `webSessionOutboundService.ts::markWebSessionOutboundActivity` faz updateMany no runtime para lastOutboundAt/messageId. Prisma também altera updatedAt. Depois, `persistWebSessionRuntimeState` usa o token anterior; `runtimeWriteFence.ts::updateRuntimeIfUnchanged` compara updatedAt e rejeita a gravação. O nó/fluxo ativo não fica persistido. Na entrada seguinte, `!chatbotActive` faz inboundText=null e reinicia o prompt. A guarda protege contra escrita humana concorrente, mas também conflita com a própria atividade outbound.

O caminho existe tanto nas fontes atuais quanto no worker mínimo efetivo bf5+f06+912. Não se presume que trocar pelo worker completo resolva. A evidência produtiva é de estado/eventos; a demonstração causal foi local, sintética, sem provider: controle sem escrita intermediária persistiu; mesma sequência com a escrita de atividade outbound mudou somente updatedAt no token e retornou null, mantendo flow/node nulos e chatbotActive=false. Banco isolado 127.0.0.1:55432, Node local v22.13.0 (não é nova validação de execução do worker Node20); registros sintéticos removidos. Um cenário dirigido com controle; não é uma suíte E2E nem um envio real. Primeira execução do script não rodou por formato CJS/top-level-await; corrigido apenas para .mts, reprodução concluída.

Menor direção de correção a revisar: reconciliar/propagar de forma condicional o token da atividade outbound da mesma execução, sem legitimar estado capturado antes de intervenção humana ou outro inbound. Não remover a guarda genericamente, reler e aceitar cegamente o estado atual, nem segurar lock durante provider. Preservar modo/status/atribuição/departamento/fila/ciclo e a durabilidade do resultado aceito. Necessário teste integrado do envio simulado que escreve atividade, além de intervenção humana/inbound concorrentes, nos artefatos API e worker mínimo. **Nenhuma correção implementada ou implantada nesta etapa.**

A ativação de leitura não causa nem corrige esse conflito. Não houve falha de autorização/privacidade comprovada nesta auditoria. Aceite Syer não equivale a aceite CRA-PR; Campanhas/CRA seguem aguardando owner; SECULT encerrada; inatividade Guia pausada; 6683 CLOSED.

## Matriz produtiva — atualização durante a verificação

| Caso | Evidência / limite |
| --- | --- |
| Setter ADMIN, auditoria e isolamento | Comprovados por leitura DB: chave true, evento do próprio tenant, demais campos/chaves inalterados |
| ADMIN/SUPERVISOR em Automação, fora de TODAS; AGENT inclusive URL direta | Owner respondeu “sim, sim” ao roteiro combinado nas sessões legítimas; confirmação do owner, sem captura independente ou detalhamento individual por papel |
| Contadores humanos | Exclusão coberta pelos testes locais; não houve relato separado de comparação numérica em produção |
| Leitura sem atribuição/lifecycle | Fingerprint de modo/status/handoff/assignee/departamento/fila/closedAt/answers igual antes/depois da leitura (00:40:48–00:45:20UTC); quantidade de runtimes atribuídos igual; caso BOT sem responsável. Não se confunde isso com intervenção executada |
| Mensagens restritas, anexos e mídia em acesso direto | Testes locais reutilizados; conteúdo/mídia restritos não exercitados especificamente em produção, sem solicitar mensagens/arquivos artificiais |
| Ações nativas | Contrato revisado; nenhuma ação de assumir/encaminhar/envio executada. Disponibilidade visual e elegibilidade completa não verificadas separadamente pelo owner |
| META_CLOUD/IA | Sem caso produtivo autorizado exercitado nesta etapa; reprodução/validação local histórica não reatribuída |
| WEB_SESSION | Caso real apenas lido/auditado; repetição de consentimento é regressão separada abaixo, não PASS do fluxo |
| Eventos novos após revogação | Sem envio provocado para teste; atualização de painel/acesso direto tratada separadamente da entrega de mensagens novas |

### Divergência observada no teste de revogação

Owner informou perda de acesso após o passo de revogação. Porém as leituras 00:46:55 e00:48:12UTC ainda mostraram chave=true e apenas evento de ativação 00:32:47, sem evento enabled=false. Esse relato não comprova revogação do backend; solicitado uso do botão específico Salvar acompanhamento e conferência técnica antes de restaurar true. Não classificar como PASS nem como vazamento sem comprovação do request persistido. O fingerprint de outros campos do tenant mudou nesse intervalo posterior à ativação; a causa não foi atribuída ao setter sem evidência. A comparação das chaves dos demais tenants continuou idêntica/zero enabled. Codex não executou nenhuma mutação de configuração nesse intervalo.

A conferência seguinte resolveu a pendência de gravação: evento ADMIN enabled=false às 00:49:31.736 UTC 30/09, valor false confirmado às 00:50:07; fingerprint dos demais campos igual ao imediatamente anterior, demais tenants inalterados. O owner foi orientado a testar novamente o painel/URL nessa condição efetivamente persistida e só depois religar pelo mesmo setter. O primeiro relato visual, anterior à gravação false, não foi retroativamente atribuído a essa revogação.

## Fechamento — chave ligada somente em Syer

Sequência auditada no próprio tenant, todos os atores conferidos ADMIN/mesmo tenant:

|  UTC 30/09/2026 | Fortaleza 29/09/2026 | Valor persistido |
| --- | --- | --- |
| 00:32:47.136 | 21:32:47 | true — ativação |
| 00:49:31.736 | 21:49:31 | false — revogação coordenada |
| 00:51:30.144 | 21:51:30 | true — restauração final |

Owner informou: “o filtro automação ficou zero para o supervisor. depois reativei — Acompanhamento de automação atualizado.” Isso comprova por relato a revalidação da lista/filtro sob a revogação realmente persistida; a resposta final não detalhou o acesso direto por URL, portanto esse subcaso não recebeu PASS produtivo independente. Nenhum evento novo com mensagem/anexo foi provocado para testar realtime. Não se promete remoção instantânea nem apagamento de conteúdo já recebido.

Às 00:52:41UTC, chave true conferida; zero outros tenants enabled, fingerprint de suas chaves igual ao anterior. Outros campos do target iguais entre a leitura imediatamente anterior à revogação e a final, sem atribuir a esta operação a alteração concorrente observada antes. Nenhuma ação operacional na conversa executada. Ações nativas permanecem sujeitas às restrições revisadas e a indicação específica do owner antes de intervenção real.

**ACTIVATED IN SYER / FUNCTIONAL VALIDATION PARTIAL.** Não é aceite CRA-PR nem validação integral de privacidade/mídia/realtime/fluxo. A regressão de consentimento tem diagnóstico e reprodução local preservados, mas permanece sem implementação/correção/deploy. Sem mudanças de campanhas, scheduler, transporte ou definição do fluxo pelo Codex; ações coordenadas de configuração desta etapa limitaram-se aos três saves do setter feitos pelo ADMIN legítimo. Publicação exclusivamente documental na branch de revisão, sem auto-deploy.
