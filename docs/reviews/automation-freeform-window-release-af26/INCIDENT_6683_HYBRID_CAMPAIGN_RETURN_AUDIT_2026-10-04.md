# Auditoria dirigida — retorno híbrido da Campanha teste out.6 (04/10/2026)

**Somente leitura; nenhum registro reparado, anonimizado ou reenviado.** Produção: API `879cb1fa`, worker mínimo af26, frontend af26. A correção da janela continua **DEPLOYED TECHNICALLY / OWNER VALIDATION PENDING**. Este achado de associação de identidade é separado do reparo histórico 6683 de setembro, que permanece CLOSED.

## Correlação sanitizada

No tenant `demo-converta`, a campanha avulsa `Campanha teste out.6` enviou `data_exame` via Meta às 11:27:59 UTC (08:27:59 Fortaleza). O seed registrou retorno `human_department` para **Atendimento Geral / Fila Geral**, setor ativo e fila existente. O outbound foi aceito pelo provider; `SENT` aqui não é confirmação de entrega. Um status Meta materializou às 11:28:07 uma Conversation/runtime Meta novos, com destino humano, `HUMAN/WAITING`, janela fechada, `lastInboundAt=null` e sem responsável. O owner viu a mensagem de janela fechada e o botão Assumir indisponível. Não houve nova atribuição nem aviso de protocolo nessa fase; a rota backend de claim não foi chamada.

Entre 11:36:30 e 11:38:37 UTC, cinco respostas do celular foram persistidas como inbound `WEB_SESSION`; cinco notificações Meta correspondentes foram deduplicadas (`hybrid_logical_message_exists`). Meta e Web pertencem ao **mesmo tenant e ao mesmo número público de atendimento**, final `5328`, confirmado por comparação da configuração persistida das contas; não houve troca de conta empresarial. O destinatário do outbound Meta tinha `waId` de 13 dígitos; o remetente observado nos dois caminhos inbound tinha 12. A diferença é exatamente um nono dígito `9` após o DDD, não uma alteração do DDD ou dos oito dígitos locais restantes. A comparação dos identificadores completos ficou em evidência local privada, sem números no Git.

O inbound Web criou outra Conversation/runtime, outra Contact, outra Lead e outra ContactChannelIdentity. Essa conversa Web abriu a janela por inbound legítimo e percorreu o entry point ativo do chatbot; após a escolha de **Registro** ficou `HUMAN/WAITING`, com fila Registro e Assumir disponível. A Conversation/runtime Meta da campanha continuou separada em Atendimento Geral/Fila Geral, fechada e sem inbound. A deduplicação das cinco mensagens impediu processamento Meta duplicado, mas não associou o outbound da campanha à conversa Web.

| Propriedade | Meta da campanha | Respostas Web |
| --- | --- | --- |
| Tenant/conta pública | `demo-converta` / final `5328` | mesmos tenant e conta pública |
| Identidade do destinatário/remetente | 13 dígitos, com nono `9` | 12 dígitos, sem esse `9` |
| Conversation/runtime | próprios, criados após status Meta | outros, criados no primeiro inbound |
| Janela | fechada, nenhum inbound | aberta por inbound real |
| Destino final observado | Atendimento Geral / Fila Geral | fluxo ativo → Registro / Registro |
| Contact/Lead | registros Meta | registros Web distintos |

## Contrato e caminho efetivo

O [contrato de transporte híbrido](../../saas/whatsapp-transport-policy.md#hybrid-default) distingue o provider da campanha (Meta) do provider da resposta/fluxo (Web), mas exige convergência do inbound para **uma Conversation canônica**. A homologação anterior registrou continuidade de conversa e ciclo; ela não demonstra que uma variante de nono dígito recém-criada por campanha sem conversa prévia seja associada depois a um inbound Web. Compartilhar apenas Contact seria insuficiente para conservar departamento, fila e runtime da conversa.

- [Normalização WhatsApp](../../../apps/whatsapp-agent/src/utils/waid.ts) apenas retira caracteres não numéricos; preserva as versões de 12 e 13 dígitos como chaves diferentes. [Identidade CRM](../../../apps/whatsapp-agent/src/crm/crmWhatsappIdentity.ts) conhece candidatos com/sem nono dígito, mas isso não transforma automaticamente `waId` de Conversation/Runtime numa chave compartilhada.
- O [resolvedor de destinatário de campanha](../../../apps/whatsapp-agent/src/campaigns/campaignRecipientConversationBridge.ts#L104) aceita variante de nono dígito **somente quando existe uma Conversation não anonimizada, única e segura antes do envio**. O [teste existente](../../../apps/whatsapp-agent/src/http/campaignsFeatureRoutes.test.ts#L15817) cobre essa direção. Aqui não havia conversa ativa reutilizável após anonimização da linha histórica; o novo destinatário Meta permaneceu com 13 dígitos.
- O [runner](../../../apps/whatsapp-agent/src/campaigns/campaignRunner.ts#L1371) envia ao recipient resolvido. O [webhook de status Meta](../../../apps/whatsapp-agent/src/whatsapp/webhook.controller.ts#L3126) lê `returnDestination` do outbound e chama [ensureCampaignOutboundConversation](../../../apps/whatsapp-agent/src/campaigns/campaignOutboundConversation.ts#L273), que grava destino humano na Conversation/runtime Meta; o banco confirma essa aplicação. O seed correto, por si, não é prova de encaminhamento da resposta.
- No inbound, [persistConversationWindow](../../../apps/whatsapp-agent/src/db/persist.ts#L143) procura e faz upsert por `(clientId, waId)` **exato**. O [handler Web](../../../apps/whatsapp-agent/src/web-session/webSessionInbound.ts#L2732) passa o remetente de 12 dígitos; [ensureWebSessionRuntimeState](../../../apps/whatsapp-agent/src/web-session/webSessionInbound.ts#L982) usa a mesma chave exata. Sem runtime humano nessa chave, carrega o [entry point ativo](../../../apps/whatsapp-agent/src/web-session/webSessionInbound.ts#L1314) e inicia automação. O teste de [WAITING humano já existente](../../../apps/whatsapp-agent/src/web-session/webSessionInbound.test.ts#L3355) mostra que, quando o mesmo runtime humano com departamento/fila é encontrado, o inbound não inicia o menu.
- A [deduplicação híbrida](../../../apps/whatsapp-agent/src/channels/hybridInboundDedupe.ts#L92) usa cliente, remetente inbound e stanza; ela não relaciona o outbound Meta de 13 dígitos ao novo `waId` Web. `ContactChannelIdentity` é escopada por tenant, canal, provider, conta e hash; os dois registros observados não compartilham Contact. `ChannelAccountAlias` identifica **contas empresariais**, não uma equivalência autorizada entre destinatários.

O código acima é anterior à API `879cb1fa` no ponto de seleção exata da Conversation Web e da identidade de campanha. O delta `af26→879cb1fa` protege a janela e o recebimento tardio de status; não introduziu esse lookup Web. Isto não diminui o defeito observado nem autoriza reconciliar os registros por sufixo.

## Classificação e decisões

**Defeito de continuidade híbrida para esta variante comprovada**, frente ao contrato de Conversation canônica e retorno humano salvo. Não é configuração incompatível: Meta/Web do mesmo número público estavam operacionais, o setor estava ativo e a fila existia. A seleção do fluxo Web foi coerente com **o runtime Web novo que o código encontrou**; é a separação anterior de identidade/conversa que impediu o retorno da campanha. A prova do owner liga as respostas ao envio controlado, mas o sistema não persiste um vínculo inequívoco entre o outbound de 13 dígitos e o remetente de 12; uma correção não pode juntar conversas por sufixo ou nono dígito sem resolver colisão/ambiguidade, tenant, conta, anonimização e intervenção concorrente.

Pontos para a revisão da correção, sem implementá-la aqui:

1. Definir evidência autorizável de alias de destinatário para **novos** ciclos híbridos e negar associação ambígua. Preservar anonimização e escopo de tenant/conta; não fundir retroativamente estas duas conversas.
2. Reutilizar o destino humano e runtime da campanha na seleção inbound **antes** de abrir outro ciclo/entry point, com fence contra claim, transferência, reentrada e status atrasado. Compartilhar Contact isoladamente não basta.
3. Cobrir campanha Meta sem conversa anterior, variante 13→12, Web vencedor da deduplicação, Meta vencedor, mesmo número público, contas/tenants distintos e homônimos ambíguos. Manter bloqueio da janela até inbound real.

**Aceite parcial preservado:** janela Meta fechada após campanha e bloqueio visual de Assumir passaram. Claim backend antes do provider, retorno humano na mesma conversa e continuidade híbrida ainda não foram comprovados; status DELIVERED/READ tardio durante intervenção humana não foi exercitado. A próxima prova produtiva só deve ser escolhida após revisar a associação de identidades e usar caso sob controle cujo retorno esperado seja verificável. Não repetir campanha, anonimizar, reenviar ou alterar transporte como diagnóstico.

Evidência completa somente em `local-evidence/incident-6683/campaign-out6-identity-20261004.private.jsonl` (0600, fora do Git), SHA-256 `cf4ce745e259945a51b778fd54ed04f0ada1e5a52e7f3d8f21b0c2489e6c9bf7`; saída original das consultas preservada em arquivo privado separado.
