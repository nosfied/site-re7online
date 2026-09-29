# Worker WEB_SESSION — proposta completa de parada para revisão

29/09/2026. **PROPOSTA, NÃO IMPLEMENTADA. PRODUÇÃO INTACTA.** Esta proposta é
pré-requisito operacional separado da permissão SECULT. O backport concorrente não
altera shutdown. Os testes de persistência não aprovam parada. Não mudar distribuição,
lifecycle, filas, capacidade, disponibilidade ou encerrar atendimentos HUMAN.

## A. Correção mínima para FUTURAS paradas

### Objetivo e invariantes

Parar novas operações, concluir as admitidas, preservar auth e encerrar transporte
antes de liberar ownership. Nenhum segundo worker deve assumir enquanto o anterior
puder agir na sessão. Resultado incerto não equivale a rejeição nem autoriza retry.

Estado explícito no processo: RUNNING → DRAINING → STOPPED, com FAILED/UNCERTAIN
como impedimento de conclusão. Não criar tabela, serviço ou infraestrutura paralela
por conveniência. Reutilizar correlação, locks e persistência existentes. A necessidade
de durabilidade adicional, se comprovada na implementação, volta à revisão.

### Escopo de código proposto

- `src/index.ts`: coordenar/aguardar a parada, em lugar de abort + close sem conclusão.
- `src/whatsappWebSessionWorker.ts`: registro de trabalhos/filhos, bloquear novas
  conexões/reconexões e preservar ownership até transporte e trabalho concluírem.
- `src/webSessionControlServer.ts`: negar novas operações durante drain, contar
  requisições admitidas e aguardar close efetivo. Diagnóstico autenticado e sanitizado.
- `src/web-session/baileysSocketFactory.ts`: registrar conclusão/falha dos callbacks
  relevantes e confirmar término do transporte. Não retirar callbacks simplesmente
  para declarar zero; não ignorar eventos já admitidos.
- `src/web-session/baileysAuthState.ts` e compartilhado
  `web-session/webSessionAuthStore.ts`: aguardar fila de auth e tratar `{ok:false}`
  como falha de persistência. Preservar chaves, staging e escopos; sem logout/clear.

A localização exata do pequeno registro em memória pode ser interna a esses módulos.
Não antecipar implementação neste documento nem mudar algoritmos de negócio.

### Sequência e critérios

1. Marcar DRAINING sincronamente, antes de qualquer await. Recusar novos send-text,
   send-media e recipient lookup; cessar poll que abre sessões e reconexões.
   Acompanhar HTTP já admitido, conexão/identidade, inbound, receipts e auth. Registrar
   operações-filhas antes do await: um inbound pode produzir envio, DB ou auth.
2. Aguardar operações dependentes do transporte, inclusive envios derivados de
   inbound admitido. Não fechar socket com chamada ao provider em curso. Enquanto
   chegarem callbacks, zero momentâneo não é drain. Se não houver uma fronteira
   segura com as APIs atuais do Baileys, reportar a lacuna, sem fingir que rejeitar
   callback garante replay. O prazo é de escalonamento, não autorização de kill.
3. Encerrar transporte sem logout, mantendo o advisory lock dedicado. Confirmar
   término do socket e registrar callbacks finais (conexão, receipts, credenciais).
   Aguardar trabalhos já admitidos e fila de auth; nenhum trabalho novo pode nascer
   depois do ponto declarado como transporte encerrado. Validar essa corrida.
4. Confirmar writes bem-sucedidos, não apenas promises resolvidas. Falha de auth/DB,
   resultado incerto ou callback pendente impede STOPPED. Não remover tarefas/locks
   por timeout, não reenviar. Persistência de resultado do provider no chamador
   precisa ser comprovada; memória do worker isoladamente não é recuperação durável.
5. Aguardar close do servidor HTTP; declarar STOPPED somente com transporte incapaz
   de operar e trabalhos confirmados. Então liberar advisory locks, fechar recursos
   e permitir saída. Em falha manter estado explicitamente incompleto; supervisão não
   deve converter prazo em kill/restart automático sem decisão operacional.
6. Só iniciar o sucessor após confirmar saída do processo antigo e exclusividade.
   Preservar credenciais atuais, não restaurar snapshot antigo sobre dados novos.

### Diagnóstico mínimo e ensaio exigido antes de aprovar

Contagens por classe/conta, fase de parada, último erro sanitizado e trabalhos
incertos com identificadores de correlação; sem payload, número completo, token ou
credencial. Autenticação pelo mecanismo de controle existente. Health simples não
significa drain. Não prometer dashboard novo.

Ensaiar barreiras determinísticas para inbound ativo, envio aceito/resposta atrasada,
auth save em fila/falho, callback tardio, desconexão/reconexão e disputa de lock por
processos locais distintos. Provar que sucessor não obtém ownership antes do fim
seguro; reabrir auth persistida sem clear/pareamento artificial; não retry cego.
Rever PM2 kill_timeout/autorestart/boot em planejamento, sem alterá-los nesta fase.
Esses ensaios futuros são distintos das quatro reproduções do defeito atual.

## B. PRIMEIRA parada do worker antigo

### O que a versão atual consegue demonstrar

| Sinal existente | Evidência que sustenta | O que não comprova |
| --- | --- | --- |
| `whatsapp.web.outbound.sent` com requestId | sendMessage retornou para aquela chamada; log informa presença de externalMessageId | Persistência final pelo chamador, ausência de outros envios ou aceite após timeout |
| `whatsapp.web.inbound.processed` | ingestão daquele item retornou, com action/reason; pode ter sido ignorado conforme contrato | Conjunto completo admitido, fim de todo callback ou de todo trabalho em fila |
| `whatsapp.web.receipt.processed` | Tratamento de receipt observado concluiu o caminho registrado | Ausência de outros receipts/trabalhos |
| Resultado/ID persistido do envio ou registro inbound, quando correlacionável | Confirma aquele resultado durável no DB | Operações não registradas ou ainda no provider |
| Auth: registro atualizado/hash no DB e upsert bem-sucedido | Uma versão foi persistida; não imprimir ciphertext/chave | Ausência de atualização posterior em memória/fila; adapter atual pode ignorar `{ok:false}` |
| PID/cgroup/descendentes, sockets, advisory locks PostgreSQL | Existência de processo, transporte e posse observáveis | Callback em JS ou request remoto aceito ainda sem resposta |
| Saída de TODOS os processos proprietários e ausência de seus sockets/locks | Antigo não pode iniciar novas operações locais sobre a sessão | Rejeição de chamadas já entregues ao provider ou recuperação integral de inbound/auth |

Logs não formam um contador confiável de admissão/conclusão: não há ID por toda tarefa
nem flush global. Contagens zero de campanhas, conexões DB idle, silêncio de logs,
espera fixa e atendimentos HUMAN abertos não determinam drain. Auth keys/staging em
memória, callbacks do socket, download, promise sendMessage e aceites sem registro
permanecem parcial ou totalmente invisíveis aos mecanismos atuais.

### Impedimento concreto

O ensaio do código compilado antigo mostra que SIGTERM/SIGINT via handler atual
podem liberar advisory lock com socket e trabalhos pendentes. **Esse comando não
satisfaz a exigência de manter ownership enquanto o antigo ainda puder operar.**
Não executar essa sequência como se fosse drain. Não iniciar sucessor porque o
lock ficou livre, porque PM2 mudou nome/status ou porque health caiu.

A versão nova não corrige retroativamente essa lacuna. Com os mecanismos existentes,
**não há primeira transição comprovadamente graciosa e sem risco residual**. Este
plano não fornece um comando mágico nem autoriza stop/restart como experiência em
produção. Também não usa pausa de processo, retirada manual de lock ou worker duplo
como contorno.

### Menor janela operacional e decisão necessária

Preparação de código/configuração, backup fresco, verificação/restauração isolada e
aprovação do retorno ficam antes da janela. A primeira janela é uma **interrupção
coordenada**, não uma atualização contínua comprovada.

O objetivo mínimo é suspender WEB_SESSION para TODAS as contas servidas por esse
worker: inbound, outbound, receipts e atualização de auth/pareamento. Não somente
SECULT. A guarda de campanhas não bloqueia todos os envios da Inbox. O mecanismo de
contenção já ensaiado de porta API suspende também auth/Inbox/CRM/realtime/webhooks
META; logo, **a menor abrangência comprovada hoje pode incluir toda a API**, além
do worker. Frontend estático pode permanecer servido. Isolamento seletivo só pode
reduzir esse alcance após prova, não por suposição. Não alterar regras agora.

Ordem condicional para uma primeira interrupção, caso explicitamente decidida:

1. Deifson/Codex confirmam execução única, responsáveis, backup/retorno, instâncias,
   supervisores e ausência de sucessor. Capturar sinais positivos e trabalhos
   conhecidos. Qualquer resultado incerto segue sem reenvio automático.
2. Conter novas entradas externas pelo mecanismo revisado e impedir reinício
   concorrente/ressurreição por supervisores. Isso reduz admissão, **não prova drain
   nem cessa callbacks do socket já conectado**. Não liberar lock manualmente.
3. **Ponto de decisão ainda aberto:** se não surgir prova aplicável ao binário antigo,
   Deifson precisa decidir sobre o risco de uma primeira interrupção não graciosa:
   chamada pode ter sido aceita sem resultado persistido; inbound/receipt pode não
   ser repetido; credencial recente em memória pode não estar no DB e sessão pode
   exigir recuperação. Isso ampliaria a decisão operacional; não está autorizado
   nem executado neste pacote. Não usar SIGTERM que libera ownership cedo como
   falsa solução, nem deixar PM2 impor SIGKILL silenciosamente ao vencer seu prazo.
4. Se uma interrupção explícita vier a ser aprovada, nenhum sucessor inicia antes de
   comprovar que TODOS os processos antigos capazes de operar saíram, seus sockets
   desapareceram e os locks/conexões que possuíam foram encerrados. Verificar wrapper,
   filho Node e outros iniciadores, não apenas o PID apresentado pelo PM2. Chamadas
   remotas já entregues podem continuar incertas mesmo depois dessa barreira.
5. Subir somente um worker compatível, recuperar auth atual sem restore/logout,
   verificar sessões e atender divergências. Não reenviar aceites incertos. Retomar
   API/admissões apenas após verificações e decisão operacional correspondente.

Duração mínima é **contenção + cessação comprovada do antigo + partida/reconexão +
verificação**. Não há valor em minutos defensável: a versão antiga não tem drain
observável e nenhuma reconexão real foi provocada. Os 3,32s do harness e os 3min21s
do deploy anterior de API não medem essa janela. Exigir horizonte de escalonamento
e margem de retorno definidos pelo owner; não converter horizonte em garantia ou
kill automático. Se o owner exigir zero chamada interrompida/zero perda, **abortar
a primeira transição com a evidência atual**, mesmo após implementar A.

Responsável operacional: Deifson; Codex prepara evidências/comandos revisáveis;
sudo somente na sessão privada de Deifson. G2 continua aberto até a decisão e
procedimento correspondente. Nenhuma sessão nem atendimento é encerrado nesta fase.

## C. Retorno: cenários que não compartilham a mesma garantia

### Preferencial — escritores compatíveis, chave revogada

API/frontend reconhecedores de SECULT, worker mínimo compatível e scripts da release
compatível. Revogar pelo setter transacional, conferir false persistido e novas
leituras negadas. Preservar compatibilidade de TODO escritor e bloquear ressurgimento
de executáveis antigos via saved/fallback/boot ou execução manual. Se a falha exige
reverter API para código sem SECULT, essa já é a alternativa abaixo, não este cenário.

A assinatura atrasada compatível respeitou revogação no ensaio. Não restaurar DB nem
auth antigos; preservar sessões e dados novos. Revalidação da UI remove acesso pela
rotina existente, não promete apagar conteúdo já recebido. Falha que impeça o setter
ou a confirmação no DB impede declarar revogação; manter gate, sem edição ad hoc.

### Alternativa — retorno completo à API anterior e8ebd776

Essa API nega CLOSED ao AGENT independentemente da chave, porém seus escritores de
config são antigos: **garantia de persistência concorrente perdida**. Não afirmar
que manter apenas o worker compatível torna a API antiga protegida.

Antes do retorno: excluir/quiescer todos os escritores, revogar ainda no código
compatível e conferir false; eliminar processos/transações com snapshots true antes
de abrir código antigo. Não coexistir API SECULT com escritores obsoletos. Se não
houver exclusão comprovada, o retorno não está pronto. A reprodução mostrou que
escritor antigo atrasado restaura true, mesmo após setter novo revogar.

O banco atual permanece. Funcionalidade fica indisponível no código antigo; scripts
obsoletos não são reintroduzidos incidentalmente. Se necessário voltar também o
worker, usar somente o bundle preservado identificado, sob os mesmos gates de
parada/ausência de dois proprietários. Antes de retornar posteriormente a SECULT,
revalidar/revogar a chave sob exclusão, reinstalar TODOS os escritores compatíveis e
verificar saved/fallback/boot. Não restaurar dump sobre dados novos ou prometer
concorrência segura durante permanência da API antiga.

## D. Limites de produto preservados

SECULT continua NOT DEPLOYED, default false e somente consulta na Inbox existente.
Não há obrigação de disponibilizar legados sem prova suficiente. Legados que já
satisfaçam todos os critérios implementados permanecem elegíveis: CLOSED atual,
responsável comprovado no encerramento atual, snapshot correspondente e acesso
departamental atual válido pelo resolvedor canônico, além dos demais controles.
Sem backfill, inferência de responsável, participação genérica ou corte temporal novo.
Ações operacionais continuam bloqueadas. Campanhas/CRA aguardam validação funcional
do owner; DB-only encerrada; 6683 CLOSED.

## E. Condições objetivas de abortar e retornar

Antes de interrupção: abortar se versão/configuração/backup/restauração não conferem,
se houver escritor/proprietário concorrente ou supervisor não controlado, falta de
acesso operacional, trabalho incerto não decidido, ou exigência de perda zero sem
prova disponível. Manter estado produtivo atual; não começar uma parada para testar.

Depois de eventual contenção autorizada: se o antigo ainda pode operar, não iniciar
outro worker. Se a parada não começou e a versão atual permanece íntegra, reversão
da contenção depende de conferir seu estado e as admissões, sem trocar versão.
Se o antigo já saiu e o sucessor falha, manter um único proprietário e parar de
avançar: não ressuscitar o antigo em paralelo. Retorno de código exige cessação do
sucessor e escolha explícita do cenário C, preservando DB/auth atuais. Auth ausente,
resultado incerto ou discrepância de ownership bloqueiam declaração de recuperação.
Nenhuma regra aqui autoriza kill por timeout, restore de DB, logout ou retry cego.

A validação Node20 (104 testes e carregamento) é de compatibilidade/persistência;
não resolve nenhuma dessas condições de parada.
