# CRA-PR PE 90004/2026 - Proposta Tecnica Base

## Apresentacao Da Solucao

O Converta Platform e uma plataforma SaaS web em nuvem para atendimento digital multicanal, com Inbox centralizado, chatbot por menus estruturados, atendimento humano assistido, filas, setores, historico de conversas, relatorios e operacao integrada a canais oficiais Meta.

A solucao e multi-tenant, com isolamento por cliente, controle de acesso por usuario, perfis de permissao, logs operacionais e configuracao por tenant.

## Arquitetura SaaS

- Aplicacao web acessada por navegador.
- Backend de mensageria e integracoes.
- Banco de dados PostgreSQL.
- Operacao em nuvem.
- Healthcheck, metricas, logs e alertas operacionais.
- Deploy controlado e rotina de backup/restore.

## Canais Atendidos

| Canal | Aderencia |
| --- | --- |
| WhatsApp Business Platform / Meta Cloud API | canal principal oficial |
| Instagram Direct | atendimento humano via API Meta aprovada |
| Facebook Messenger | atendimento humano via API Meta |
| Site institucional / Webchat | widget embutivel com sessao publica |

Todas as conversas chegam ao Inbox operacional, preservando identificacao do canal de origem.

## WhatsApp Oficial

A solucao utiliza API Oficial do WhatsApp Business / Meta Cloud API para envio e recebimento de mensagens, templates oficiais e controle de janela de atendimento.

Nao utiliza WhatsApp Web, extensoes de navegador, robos nao homologados ou mecanismos nao oficiais como base da operacao.

## Canais Meta

O Converta opera com canais digitais Meta por configuracao tenant-scoped, preservando tokens, channel accounts e flags por canal.

Instagram e Facebook/Messenger sao operados em modo atendimento humano, sem ativacao automatica de IA ou automacao fora do escopo aprovado.

## Webchat / Widget

O canal Webchat permite atendimento pelo site institucional, criando conversas com `channel=webchat`, historico proprio, handoff para humano e continuidade pelo Inbox.

No tenant RE7, o fluxo profissional ja cobre:

- Comercial;
- Suporte;
- Governo/Licitacoes;
- Atendimento humano;
- qualificacao antes do handoff;
- protocolo CVT;
- consulta e continuidade por protocolo.

## Chatbot Por Menus

O chatbot e baseado em menus estruturados, submenus, opcoes, perguntas e roteamento por arvore de decisao.

As respostas automaticas sao baseadas em conteudo previamente configurado. O atendimento nao depende de IA generativa para responder livremente aos usuarios.

## Atendimento Humano

A solucao permite:

- handoff para atendente;
- claim e atribuicao;
- transferencia;
- filas;
- departamentos/setores;
- historico completo;
- identificacao do responsavel;
- status operacional.

## Protocolo E Continuidade

Cada atendimento pode exibir protocolo CVT derivado da conversa. O protocolo aparece no Webchat e no Inbox.

O fluxo "Ja tenho protocolo" permite consulta segura mediante confirmacao de posse por e-mail ou telefone, com resposta anti-enumeracao. Quando validado, a nova conversa recebe vinculo operacional com a conversa original por `ConversationRuntimeState.answers.protocolContinuation`.

## Campanhas E Templates

O Converta possui modulo de campanhas e templates para disparos institucionais por WhatsApp Business Platform, respeitando templates oficiais aprovados pela Meta e regras de janela.

A criacao, adequacao, submissao e acompanhamento de templates dependem das politicas e validacoes da Meta.

## Relatorios

A plataforma oferece relatorios operacionais com filtros por periodo, canal, usuario, departamento/fila e metricas de atendimento/SLA.

Exportacoes em CSV estao contempladas nos relatorios operacionais. Outros formatos devem ser confirmados conforme exigencia final do edital.

## Seguranca E LGPD

A solucao adota:

- isolamento multi-tenant;
- controle de acesso por usuario;
- perfis de permissao;
- logs com redaction;
- historico e rastreabilidade;
- HTTPS em producao;
- boas praticas de protecao de dados;
- uso dos dados apenas para execucao contratual.

## Implantacao Em Ate 30 Dias

A implantacao e viavel em ate 30 dias corridos, condicionada a:

- disponibilizacao de dados e responsaveis pelo CRA-PR;
- acesso e validacao dos ativos Meta;
- aprovacao de templates pela Meta;
- disponibilidade dos usuarios para treinamento e homologacao.

## Suporte E SLA

O suporte sera remoto em horario comercial, com classificacao de criticidade alta, media e baixa, conforme plano SLA especifico.

Indisponibilidades de terceiros, como Meta/WhatsApp Business Platform, serao acompanhadas e comunicadas ao contratante, mas dependem da disponibilidade do provedor externo.

## Treinamento Remoto

O treinamento inicial remoto cobre:

- acesso e perfis;
- Inbox e atendimento humano;
- filas e setores;
- chatbot/menus;
- campanhas/templates;
- relatorios;
- boas praticas WhatsApp Business Platform;
- LGPD e uso adequado da base de contatos.

