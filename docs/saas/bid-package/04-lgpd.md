# LGPD

## Visao Geral

O Converta trata dados pessoais no contexto de atendimento digital, relacionamento, historico de conversas, qualificacao de leads/cidadaos e operacao de equipes.

A plataforma possui recursos para governanca de retencao e minimizacao operacional, cabendo ao contratante definir a base legal, politicas internas e periodo de guarda aplicavel.

## Dados Tratados

Podem ser tratados:

- nome ou identificacao do contato;
- telefone/identificador externo do canal;
- mensagens trocadas;
- midias enviadas/recebidas;
- historico de atendimento;
- notas de operadores;
- classificacoes de CRM;
- setor/departamento;
- dados de campanha/template;
- dados de usuarios operadores.

## Finalidades

- atendimento ao cliente/cidadao;
- gestao de filas e setores;
- acompanhamento de historico;
- suporte;
- vendas e relacionamento, quando aplicavel;
- cumprimento de obrigacoes contratuais;
- auditoria operacional;
- relatorios gerenciais.

## Retencao

O Converta possui configuracao de retencao por tenant.

Politica operacional atual:

- conversas antigas podem ser removidas da operacao por soft delete;
- dados podem ser anonimizados conforme politica de retencao;
- historico operacional pode ser reduzido em telas como inbox e relatorios;
- retencao deve ser parametrizada antes do go-live.

## Direitos Do Titular

A operacao pode apoiar processos internos de:

- consulta de historico;
- revisao de dados;
- minimizacao;
- anonimizacao;
- exclusao operacional quando aplicavel;
- comprovacao de atendimento.

O atendimento formal a titulares deve ser definido em procedimento do controlador/contratante.

## Opt-out Operacional

O opt-out operacional para campanhas e envios ativos e controle auditavel por
tenant/canal, diferente de anonimizacao. O estado canonico atual e derivado de
eventos `contact.opt_out.recorded` e `contact.opt_out.revoked`, escopados por
tenant e identidade WhatsApp canonica. Quando ativo, o bloqueio deve ocorrer
antes de chamada a provedor externo; campanhas registram bloqueio por
`campaign.recipient.opt_out_blocked` e podem exportar evidencia `opt_out`.

Esse controle nao remove historico, nao substitui politica de retencao e nao
deve bloquear canais nao relacionados sem definicao contratual explicita.

Validacao Demo 2026-09-16: opt-out canonico foi criado para B `****6787`, uma
campanha controlada foi bloqueada antes da Meta com status `opt_out`, sem envio
real e sem billing, e a reversao canonica restaurou a elegibilidade mantendo o
historico auditavel.

## Segurança E Minimização

Recomendacoes:

- coletar apenas dados necessarios;
- evitar documentos pessoais quando nao houver necessidade;
- orientar operadores;
- configurar retencao adequada;
- limitar acesso por perfil e setor;
- evitar exportacoes desnecessarias;
- redigir evidencias publicas.

## Responsabilidades

| Papel | Responsabilidade |
| --- | --- |
| Contratante/controlador | Base legal, finalidade, politica de privacidade, comunicacao ao titular |
| Operadores | Uso correto da plataforma e tratamento adequado dos dados |
| Converta/fornecedor | Disponibilizar controles tecnicos, segregacao, retencao e seguranca operacional |

## Anexos Recomendados

- Politica de privacidade do contratante.
- Termo de tratamento de dados.
- Plano de retencao.
- Matriz de acesso.
- Plano de resposta a incidente.
