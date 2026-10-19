# Adequar encerramento e pesquisa CSAT à janela de 24h do WhatsApp

- **Prioridade:** Alta
- **Área:** Inbox / WhatsApp / Encerramento / Satisfação
- **Escopo:** todos os tenants e transportes WhatsApp, inclusive SECULT-PE
- **Estado inicial:** `CONFIRMED GAP / BACKLOG REQUIRED / NOT FIXED`
- **Registrado em:** 19/10/2026
- **Impacto SECULT-PE:** pesquisa automática ativa; necessita adequação antes de ser considerada plenamente aderente à política de janela do WhatsApp.

## Problema confirmado

Ao encerrar um atendimento humano, o sistema fecha corretamente o ciclo operacional,
registra o snapshot, remove a atribuição e marca a conversa como `CLOSED`.

Quando a pesquisa de satisfação está habilitada, porém, o caminho `web_session` tenta
enviar o aviso de encerramento e a pesquisa CSAT como texto livre sem validar se a janela
de atendimento de 24 horas está aberta.

O bloqueio `isWindowOpen` aplicado aos envios Meta não é aplicado nesse caminho. A
mensagem também não utiliza template aprovado. Portanto, o comportamento atual não
assegura o cumprimento uniforme da política do WhatsApp fora da janela de atendimento.

Há uma segunda inconsistência: a pesquisa é criada previamente com status `sent`. Se o
transporte falhar, o outbound fica como `FAILED`, mas a pesquisa pode continuar registrada
como enviada. Isso mantém um ciclo de satisfação pendente para uma mensagem que o cliente
possivelmente não recebeu.

No caminho Meta Cloud, o encerramento não utiliza a mesma rotina automática de CSAT.
Assim, o comportamento varia conforme o transporte:

- **Web Session:** tenta enviar texto livre mesmo com janela fechada.
- **Meta Cloud:** encerra localmente, mas não executa a mesma pesquisa automática.
- **Falha de transporte:** pode deixar pesquisa classificada como enviada.

## Comportamento esperado

1. O encerramento local deve sempre poder concluir, mesmo com a janela fechada:
   - fechar o ciclo;
   - registrar o snapshot;
   - remover atribuição;
   - marcar a conversa como `CLOSED`;
   - não depender do sucesso de mensagens externas.
2. Antes de qualquer aviso ou pesquisa, o sistema deve determinar:
   - transporte efetivo;
   - estado e validade temporal da janela;
   - tipo permitido de mensagem;
   - existência de template aprovado e autorizado, quando necessário.
3. Com janela aberta:
   - permitir aviso e CSAT em texto livre, quando suportados pelo transporte;
   - registrar a pesquisa como enviada somente após confirmação do transporte.
4. Com janela fechada:
   - não enviar texto livre;
   - usar template aprovado somente se houver configuração explícita, categoria permitida
     e suporte do transporte;
   - sem template aplicável, concluir o encerramento sem envio e registrar motivo tipado,
     por exemplo `WINDOW_CLOSED_NO_APPROVED_TEMPLATE`;
   - não fazer fallback silencioso entre Meta Cloud e Web Session.
5. Em falha de envio:
   - não manter `status=sent`;
   - registrar `pending`, `failed` ou `skipped` conforme resultado real;
   - armazenar motivo sanitizado;
   - não criar ciclo de resposta pendente para pesquisa não entregue;
   - não repetir automaticamente o envio.
6. A próxima mensagem do cliente deve:
   - abrir ou renovar a janela de 24h;
   - iniciar novo atendimento normalmente quando não houver pesquisa realmente entregue;
   - entrar no fluxo de satisfação somente quando existir pesquisa comprovadamente enviada
     e ainda válida.
7. O comportamento deve ser tenant-scoped:
   - nenhuma configuração de outro tenant;
   - nenhuma referência cruzada de conversa, contato ou pesquisa;
   - política e template resolvidos pelo tenant e canal corretos.

## Implementação recomendada

Centralizar a decisão em um único contrato compartilhado, anterior ao envio, retornando
algo equivalente a:

- `SEND_FREEFORM`;
- `SEND_APPROVED_TEMPLATE`;
- `SKIP_WINDOW_CLOSED`;
- `DENY_TRANSPORT_UNAVAILABLE`;
- `DENY_POLICY_OR_TEMPLATE`;
- `UNKNOWN`.

O consumidor deve persistir o resultado real do envio e manter o encerramento operacional
independente desse resultado.

Não criar um segundo cálculo aproximado da janela. Reutilizar o predicado canônico e
revalidá-lo imediatamente no ponto de envio para tratar concorrência.

## Testes obrigatórios

- Web Session, janela aberta: encerramento e CSAT enviados.
- Web Session, janela fechada: nenhum texto livre enviado.
- Meta Cloud, janela aberta: comportamento coerente com a política configurada.
- Meta Cloud, janela fechada, sem template: encerramento concluído e pesquisa não enviada.
- Janela fechada com template aprovado: envio somente pelo transporte autorizado.
- Template ausente, inativo, categoria não permitida ou divergente: negativa tipada.
- Falha e timeout do transporte: pesquisa não permanece como `sent`.
- Resposta perdida: resultado `UNKNOWN`, sem repetição automática.
- Nova mensagem após encerramento sem pesquisa entregue: novo atendimento iniciado.
- Pesquisa comprovadamente entregue: resposta tratada pelo ciclo CSAT.
- Fechamento repetido: nenhum snapshot, pesquisa ou envio duplicado.
- Isolamento entre tenants e canais.
- Nenhum fallback Meta↔Web Session.
- Nenhum envio automático fora da janela por mensagem livre.

## Evidências no código atual

- Fechamento e disparo da pesquisa:
  `apps/whatsapp-agent/src/web-session/webSessionInbound.ts`
- Exceção de Web Session no bloqueio da janela:
  `apps/whatsapp-agent/src/http/routes.ts`
- Persistência de outbound falho e retorno `FAILED`:
  `apps/whatsapp-agent/src/web-session/webSessionOutboundService.ts`

## Critério de aceite

O item estará concluído quando o encerramento continuar independente e idempotente, e
nenhuma mensagem livre automática — aviso, pesquisa, agradecimento ou orientação — puder
ser enviada fora da janela permitida. O estado da pesquisa deverá refletir o resultado
comprovado do transporte, com comportamento consistente entre os canais e sem fallback
silencioso.

## Restrições operacionais

Este registro não autoriza deploy, restart, PM2, envio, teste produtivo, SQL, migration ou
alteração de configuração. A implementação futura deve preservar produção viva,
isolamento multitenant e uma janela de mudança explicitamente autorizada.
