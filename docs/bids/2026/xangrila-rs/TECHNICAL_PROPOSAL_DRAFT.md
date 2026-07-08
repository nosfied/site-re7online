# Xangri-La/RS PE 115/2026 - Minuta De Proposta Tecnica

Este documento e base interna. A proposta final deve ser editada fora do repositorio, com dados oficiais da licitante, assinatura e anexos exigidos.

## 1. Apresentacao

A RE7Online apresenta o Converta Platform, plataforma SaaS de atendimento omnichannel com foco em gestao de mensagens via WhatsApp Cloud API oficial, chatbot, atendimento humano, relatorios, seguranca, LGPD, backup e suporte operacional.

O Converta e uma plataforma unica, multi-tenant, parametrizada por capabilities. Nao ha produto separado por municipio ou orgao.

## 2. Escopo Ofertado

- tenant dedicado para Xangri-La/RS;
- ate 10 usuarios conforme contrato;
- canal WhatsApp Business oficial via Meta Cloud API;
- gestao de mensagens ativas ate 6.000/mês, conforme premissas comerciais;
- sessoes receptivas ilimitadas dentro dos limites tecnicos e politicas Meta;
- chatbot com fluxo inicial e handoff humano;
- Inbox para atendimento humano;
- historico integral das conversas;
- relatorios operacionais e exportacao CSV/PDF;
- suporte, manutencao e atualizacoes;
- implantacao, integracao, treinamento presencial e reciclagem remota mensal.

## 3. Arquitetura

O Converta opera como SaaS web:

- backend `whatsapp-agent`;
- frontend web `/app`;
- banco PostgreSQL;
- isolamento por tenant;
- RBAC por usuario;
- canais configurados por tenant;
- observabilidade via health, metricas e alertas.

## 4. WhatsApp Oficial

A integracao utiliza a WhatsApp Cloud API da Meta, com webhooks oficiais para recebimento e API oficial para envio. A solucao nao depende de WhatsApp Web, QR persistente ou API nao oficial.

## 5. Atendimento

O atendimento operacional contempla:

- Inbox por tenant;
- conversas com timeline completa;
- atendimento humano por operador;
- claim/release/transferencia quando configurado;
- protocolos operacionais `CVT-...`;
- status operacional;
- filtros por canal, status, setor e responsavel quando disponiveis.

## 6. Chatbot

O chatbot permite:

- saudacao inicial;
- menus e fluxos;
- triagem;
- coleta de dados;
- direcionamento para atendimento humano;
- handoff para fila/departamento.

## 7. Relatorios

O Converta disponibiliza relatorios com:

- volume de conversas;
- tempo medio de primeira resposta;
- tempo medio de resolucao;
- status operacional;
- SLA operacional;
- dados por canal, setor e atendente;
- exportacao CSV;
- geracao de PDF via tela.

## 8. Seguranca E LGPD

A plataforma contempla:

- HTTPS/TLS no ambiente produtivo;
- RBAC;
- isolamento multitenant;
- logs sem exposicao indevida de segredos;
- politicas de retencao;
- backup e restore;
- redaction de informacoes sensiveis em logs operacionais.

## 9. Integracoes

A plataforma oferece Public API e webhooks para integracoes com sistemas externos, webservices, importacao/exportacao operacional e automacoes controladas.

Integracoes especificas dependem de:

- disponibilizacao de credenciais pelo contratante;
- documentacao tecnica do sistema externo;
- homologacao em ambiente seguro;
- cronograma dentro da implantacao.

## 10. Implantacao E Treinamento

A implantacao sera conduzida conforme `IMPLEMENTATION_TRAINING_PLAN.md`, com configuracao do tenant, usuarios, canal WhatsApp, fluxo inicial, testes e treinamento presencial em 3 turmas de 5 pessoas, alem de reciclagem mensal remota.

## 11. Suporte E SLA

O suporte sera prestado conforme severidade:

- critico: incidente que impede operacao do atendimento;
- normal: duvida, ajuste operacional ou incidente sem indisponibilidade geral.

Os tempos finais devem seguir o edital e a proposta comercial assinada.

## 12. Evidencias Para Demonstracao

Durante demonstracao ou diligencia, apresentar:

1. `/app/inbox`;
2. conversa/timeline;
3. chatbot e handoff;
4. usuarios/roles;
5. relatorios e exportacao;
6. health/monitoramento;
7. backup/restore drill evidence;
8. Public API/webhooks.
