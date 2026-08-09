# Converta Operator Guide

Status: guia operacional para uso interno e treinamento. Este documento nao altera produto, dados ou configuracao.

## Principios

- Trabalhe sempre dentro do tenant correto.
- Use o Inbox como ponto central da operacao.
- Assuma a conversa antes de responder quando o fluxo exigir.
- Verifique canal, janela de atendimento e bloqueios antes de iniciar contato ativo.
- Use modelos aprovados quando a janela livre estiver fechada.
- Use mensagens prontas apenas como texto operacional, nao como modelo Meta.
- Nao tente contornar bloqueios LGPD, opt-out ou permissao.

## Inbox

No Inbox, o operador deve:

1. selecionar a conversa;
2. conferir canal, status, fila/departamento e responsavel;
3. assumir quando necessario;
4. responder por texto livre somente quando o canal permitir;
5. usar modelo aprovado quando o WhatsApp estiver fora da janela livre;
6. usar mensagem pronta apenas para acelerar texto dentro da regra do canal.

Conversas com dados anonimizados nao devem aparecer no uso normal. Se um contato tiver sido minimizado por LGPD, nao se deve tentar restaurar nome, numero, historico ou contexto anterior.

## Suporte da plataforma

ADMIN e SUPERVISOR podem abrir e acompanhar suporte da plataforma em `Suporte`. O fluxo cria ou retoma uma `Conversation` no tenant de suporte configurado pela plataforma, com protocolo normal do Converta. Nao existe modulo paralelo de ticket ou case.

Cada usuario ve seus proprios chamados no MVP. Se ja houver chamado ativo para o mesmo tenant e usuario, a tela retoma a conversa ativa; se o chamado anterior foi encerrado, uma nova abertura cria outra conversa. O destino do suporte e resolvido pelo backend via `PLATFORM_SUPPORT_TENANT_KEY`; a interface nao escolhe tenant, WABA, telefone ou `clientId` de destino.

O tenant de suporte pode ter roteamento proprio em `TenantOperationalConfig.config.supportChannel`, apontando para um `chatbotFlowId` ativo do mesmo tenant e, opcionalmente, departamento/fila. Sem flow dedicado valido, o chamado entra em modo humano na fila configurada ou na fila operacional padrao; o `entryPoint` geral do tenant so deve ser usado se isso for explicitamente configurado.

O suporte aceita apenas texto nesta etapa. Anexos ficam para evolucao futura. A conversa aparece para a equipe da plataforma no Inbox do tenant de suporte, usando identidade sintetica e rotulo seguro com tenant e usuario solicitante. Nao copie telefone, email, token, SID, IP ou dados de CRM do tenant origem para o atendimento.

## Texto livre, modelo aprovado e mensagem pronta

| Recurso | Quando usar | Limite principal |
| --- | --- | --- |
| Texto livre | Atendimento receptivo com janela aberta | Bloqueado quando a janela estiver fechada. |
| Modelo aprovado | Inicio ativo ou recontato permitido pelo WhatsApp | Exige modelo aprovado, ativo no Converta e variaveis preenchidas. |
| Mensagem pronta | Respostas repetitivas dentro da operacao | Nao e modelo Meta e nao abre janela fechada. |

Quando a interface indicar janela fechada, use modelo aprovado. Nao use mensagem pronta como alternativa para burlar a regra.

## Marcar mensagem como referencia

No Inbox, use o menu de acoes da mensagem para selecionar `Marcar mensagem` e transformar uma mensagem anterior em referencia contextual da proxima resposta. Use quando a nova comunicacao depende de uma pergunta, documento, imagem, audio, modelo ou informacao ja enviada na conversa.

Marcar nao define a intencao da nova mensagem. O operador escreve livremente e pode usar a referencia para responder, corrigir, complementar ou esclarecer. O Converta nao adiciona prefixos automaticos como resposta ou retificacao.

Ao clicar no bloco de `Referencia` em uma mensagem enviada com marcacao, a timeline tenta rolar ate a mensagem original e destaca a bolha correspondente. Se a mensagem original nao estiver carregada no historico atual, a interface informa que a referencia nao esta disponivel naquele momento.

Editar mensagem original nao faz parte do fluxo operacional. Quando houver erro em uma comunicacao ja enviada, envie uma nova mensagem clara usando essa marcacao, sem tentar modificar o registro anterior.

Os baloes priorizam conteudo, horario, status, interlocutor discreto e referencias. O canal da conversa fica no contexto do atendimento e nao e repetido em cada mensagem.

## Modelos aprovados

Antes de enviar um modelo:

- confira nome, categoria e idioma;
- preencha variaveis com dados neutros e corretos;
- revise a previa renderizada;
- leia a estimativa de custo quando exibida;
- confirme somente quando o destinatario e o contexto estiverem corretos.

A cobranca depende de categoria, pais, entrega e politica vigente da Meta. A previsao local e apoio operacional, nao demonstrativo oficial.

## Mensagens prontas

Mensagens prontas ficam em `Modelos de mensagem`, em secao separada dos modelos Meta. ADMIN/SUPERVISOR podem criar, editar, inativar e reativar. Agentes usam apenas mensagens ativas.

No Inbox:

- a acao `Prontas` abre a lista;
- inserir no campo nao envia automaticamente;
- o envio exige clique explicito;
- com janela fechada, a interface orienta usar modelo aprovado.

## Assinatura do atendente

Em `Configuracoes > Atendimento`, administradores podem ativar a assinatura do atendente por tenant. Por padrao, ela fica desativada.

Quando ativa, mensagens humanas de texto e mensagens prontas enviadas pelo Inbox recebem o nome profissional do atendente no inicio do texto enviado ao cliente:

```text
*Maria*
Ola, como posso ajudar?
```

Essa assinatura faz parte da mesma mensagem enviada pelo WhatsApp. Ela nao cria mensagem adicional, nao altera mensagens antigas e nao se aplica automaticamente a modelos Meta, bot, automacoes ou campanhas.

O nome do atendente e dado pessoal. Use apenas o nome profissional cadastrado e ative o recurso conforme a politica operacional do tenant.

## Campanhas

Campanhas devem seguir o fluxo seguro:

1. gerar previa de audiencia;
2. revisar elegiveis e bloqueados;
3. mapear variaveis do modelo;
4. criar rascunho;
5. revisar o rascunho;
6. enviar apenas por acao explicita.

Rascunho nao dispara mensagem. Bloqueios por opt-out, contato anonimizado, duplicidade, canal incompativel ou ausencia de WhatsApp valido devem ser respeitados.

## Opt-out e bloqueio de envio ativo

Bloqueio de envio ativo impede campanhas, modelos e contatos iniciados pela empresa. Ele nao apaga historico e nao impede atendimento receptivo quando permitido pelo canal.

Se um contato solicitar descadastro, registre o bloqueio pelo fluxo operacional disponivel. A liberacao deve ocorrer apenas quando houver justificativa operacional e autorizacao adequada.

## Anonimizacao

Anonimizacao remove o registro da operacao visivel e minimiza dados pessoais. Nao e inativacao simples, nao e opt-out e nao e hard delete.

O operador nao deve:

- tentar recriar dados antigos manualmente;
- copiar informacoes de conversas antigas anonimizadas;
- usar campanha ou template para reidratar contato;
- abrir excecao sem orientacao de privacidade.

## Custos Meta

O Converta exibe estimativas para apoiar decisao operacional. Use essas informacoes para evitar disparos desnecessarios, revisar categoria de modelo e controlar volume por tenant.

O operador nao deve prometer valor definitivo ao cliente final com base apenas na previsao local.

## Central de Relatorios

Em `Relatorios`, os filtros globais de periodo, canal, atendente, setor e deduplicacao ficam no topo e afetam as abas operacionais de conversas, SLA e atendentes. A aba `Visao geral` resume o recorte atual sem alterar as formulas existentes.

As abas disponiveis sao:

- `Visao geral`: indicadores principais do periodo selecionado.
- `Conversas`: volume por canal, setor e amostra de protocolos.
- `SLA`: tempos e risco operacional calculados pelas metricas existentes.
- `Atendentes`: separa mensagens humanas enviadas de conversas atribuidas.
- `Acessos/Sessoes`: auditoria de autenticacao com filtros locais proprios.
- `Exportacoes`: CSV de conversas, CSV de sessoes e impressao/PDF consolidado.

Os filtros de `Acessos/Sessoes` sao locais dessa aba e nao alteram o recorte global das conversas.

O PDF gerado em `Exportacoes` e um relatorio gerencial agregado: identifica tenant, periodo, filtros aplicados, data/hora de geracao, resumo executivo, conversas, SLA, atendentes e resumo de acessos/sessoes. Ele nao substitui os CSVs quando a necessidade for auditoria linha a linha ou conferencia detalhada.

## Relatorio Acessos/Sessoes

Em `Relatorios`, a secao `Acessos/Sessoes` mostra trilha operacional de autenticacao por tenant. Ela usa sessoes observadas pela aplicacao e permite consultar login, logout explicito, substituicao de sessao, renovacao, expiracao e ultima atividade observada.

As sessoes do Converta possuem TTL absoluto de 12 horas. No ultimo minuto, a interface solicita renovacao explicita com `Continuar conectado`; essa acao encerra a sessao atual como `Renovada` e cria uma nova sessao com mais 12 horas. Nao existe sliding expiration: atividade e `lastSeenAt` nao estendem a sessao automaticamente.

Esta secao nao e controle de ponto, folha de ponto, jornada de trabalho ou comprovacao de presenca laboral. Fechar navegador, desligar computador ou perder internet nao gera logout deterministico. Quando uma sessao vence sem request posterior, o relatorio pode exibi-la como `Expirada`, sem preencher logout artificialmente.

Campos principais:

- `Login`: quando a sessao foi criada.
- `Encerramento`: quando houve revogacao deterministica, como logout explicito.
- `Motivo`: humanizacao do motivo tecnico real, sem transformar tudo em logout.
- `Duracao observada`: calculada somente quando login e encerramento existem.
- `Ultima atividade observada`: atividade autenticada vista pela aplicacao, nao presenca online.

O CSV segue a mesma minimizacao da tela: nao exporta token, IP bruto, hash de IP, user agent, fingerprint ou identificadores de dispositivo.

## Relatorio Atividade dos atendentes

Em `Relatorios`, a secao `Atividade dos atendentes` conta mensagens outbound enviadas por humanos no periodo selecionado. A fonte e a autoria persistida no momento do envio em `OutboundMessage.rawPayload.actor.userId`.

Essa metrica nao conta bot, automacao, campanha, mensagem pronta sem autoria preservada ou historico antigo sem ator. Mensagens historicas anteriores a captura de autoria podem nao ser atribuiveis.

A secao `Conversas atribuidas por atendente` tem outro significado: ela mede distribuicao operacional de conversas por `ConversationRuntimeState` e `ConversationAssignment`. Nao use essa secao como produtividade individual nem como substituto de mensagens realmente enviadas.

Fechamentos por atendente e SLA por responsavel so devem ser usados quando houver evidencia confiavel de snapshot no momento do fechamento ou da atribuicao. Na ausencia desse snapshot, ficam como melhoria P2 e nao devem ser inferidos por responsavel atual.

## O que nao fazer

- Nao enviar campanhas sem revisar audiencia.
- Nao clicar em `Enviar campanha` durante smoke ou treinamento.
- Nao submeter modelo a Meta sem revisao interna.
- Nao alterar credenciais ou canais sem autorizacao.
- Nao registrar dados pessoais em campos de observacao quando nao for necessario.
- Nao usar mensagens prontas para contornar janela fechada.
- Nao tentar restaurar contato anonimizado.
