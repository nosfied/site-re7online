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

## Texto livre, modelo aprovado e mensagem pronta

| Recurso | Quando usar | Limite principal |
| --- | --- | --- |
| Texto livre | Atendimento receptivo com janela aberta | Bloqueado quando a janela estiver fechada. |
| Modelo aprovado | Inicio ativo ou recontato permitido pelo WhatsApp | Exige modelo aprovado, ativo no Converta e variaveis preenchidas. |
| Mensagem pronta | Respostas repetitivas dentro da operacao | Nao e modelo Meta e nao abre janela fechada. |

Quando a interface indicar janela fechada, use modelo aprovado. Nao use mensagem pronta como alternativa para burlar a regra.

## Marcar mensagem como referencia

No Inbox, o icone de seta `Marcar mensagem` seleciona uma mensagem anterior como referencia contextual da proxima mensagem. Use quando a nova comunicacao depende de uma pergunta, documento, imagem, audio, modelo ou informacao ja enviada na conversa.

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

## O que nao fazer

- Nao enviar campanhas sem revisar audiencia.
- Nao clicar em `Enviar campanha` durante smoke ou treinamento.
- Nao submeter modelo a Meta sem revisao interna.
- Nao alterar credenciais ou canais sem autorizacao.
- Nao registrar dados pessoais em campos de observacao quando nao for necessario.
- Nao usar mensagens prontas para contornar janela fechada.
- Nao tentar restaurar contato anonimizado.
