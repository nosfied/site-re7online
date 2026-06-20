# Multi-tenant

## Conceito

O Converta opera em modelo multi-tenant, no qual cada cliente/entidade possui configuracoes, usuarios, canais, conversas e regras proprias, segregadas por identificador de tenant.

## Identidade Do Tenant

Cada tenant e representado no banco por `Client`, incluindo:

- chave do tenant;
- nome;
- status;
- perfil de uso;
- feature flags;
- configuracoes operacionais;
- relacao com canais e usuarios.

## Segregacao Operacional

Dados vinculados ao tenant:

- usuarios;
- departamentos;
- conversas;
- mensagens;
- eventos;
- leads;
- notas;
- campanhas;
- templates;
- configuracoes de CRM;
- configuracoes de IA;
- canais;
- retencao.

## Perfis

O produto reconhece perfis de uso:

| Perfil | Enfase |
| --- | --- |
| `business` | operacao comercial, campanhas, templates, CRM e conversao |
| `government` | relatorios, controle, atendimento ao cidadao, setores e transparencia operacional |

## Feature Flags

Funcionalidades podem ser ativadas/desativadas por tenant:

- dashboard;
- departments;
- users;
- templates;
- SLA;
- reports;
- campaigns;
- chatbot.

## Configuracao Operacional DB-first

Configuracoes migradas para banco:

- status de CRM;
- template de handoff manual;
- follow-up;
- notificacao interna de handoff;
- politica de midia;
- limites/plano;
- flags de automacao;
- configuracao de IA;
- catalogo de intencoes e qualificacao.

## Canais Por Tenant

Cada tenant pode ter canais proprios:

- numeros WhatsApp;
- paginas Messenger;
- contas Instagram;
- aliases tecnicos;
- tokens criptografados;
- flags de inbound/outbound/IA/handoff.

## Beneficios Do Modelo

- isolamento logico;
- configuracao por cliente;
- governanca centralizada;
- evolucao por feature flag;
- suporte a perfis B2B e B2G;
- reducao de retrabalho na implantacao;
- maior controle de seguranca e auditoria.

