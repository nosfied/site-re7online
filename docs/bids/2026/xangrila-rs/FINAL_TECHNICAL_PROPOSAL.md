# Xangri-La/RS PE 115/2026 - Proposta Tecnica Final

Este documento e a base tecnica final para participacao. A versao assinada deve ser preparada fora do Git com dados oficiais da licitante.

## 1. Solucao Ofertada

A solucao ofertada e o **Converta Platform**, plataforma SaaS web, multi-tenant, para gestao de mensagens via WhatsApp Cloud API oficial, chatbot, atendimento humano, historico, relatorios, logs, LGPD, backup, suporte, manutencao e integracoes.

O Converta Platform e produto unico. A configuracao para o contratante sera realizada por tenant e capabilities, sem criar produto separado para Xangri-La/RS.

## 2. SaaS Web

A plataforma e acessada por navegador web, com operacao centralizada no `/app`, contemplando:

- login de usuarios autorizados;
- Inbox operacional;
- timeline de conversas;
- chatbot e fluxos;
- relatorios;
- administracao de usuarios e configuracoes permitidas;
- APIs e webhooks quando contratualmente aplicavel.

## 3. WhatsApp API Oficial

A integracao com WhatsApp e realizada via Cloud API oficial da Meta:

- recebimento por webhook oficial;
- envio pela API oficial;
- suporte a texto e midias conforme recursos implementados;
- controle por tenant/canal;
- historico persistido;
- sem dependencia de WhatsApp Web, QR persistente ou API nao oficial como requisito principal.

## 4. Usuarios E Atendimento

O escopo contempla ate 10 usuarios, com controle de acesso por perfil e permissao.

Recursos operacionais:

- atendimento humano no Inbox;
- claim/assumir atendimento;
- historico integral;
- status operacional;
- protocolo operacional;
- filtros e acompanhamento por responsavel quando aplicavel.

## 5. Volumetria

O pacote considera:

- ate 6.000 mensagens ativas/mês via WhatsApp;
- sessoes receptivas ilimitadas dentro das politicas Meta, limites tecnicos razoaveis e capacidade contratada;
- monitoramento do uso para controle operacional.

## 6. Chatbot

O chatbot permite:

- saudacao inicial;
- menus e fluxos;
- coleta de informacoes;
- triagem;
- direcionamento para atendimento humano;
- mensagens institucionais;
- ajuste de fluxo conforme conteudo fornecido pelo contratante.

## 7. Integracoes

A plataforma suporta integracao por:

- Public API;
- webhooks;
- importacao/exportacao controlada;
- webservice/API externa mediante credenciais, documentacao e homologacao.

Integracoes especificas dependem de disponibilidade tecnica do sistema externo e serao executadas dentro do cronograma de implantacao pactuado.

## 8. Logs, LGPD E Seguranca

Recursos disponiveis:

- HTTPS/TLS no ambiente produtivo;
- isolamento multitenant;
- RBAC;
- logs operacionais com cuidado para nao expor segredos;
- redaction de dados sensiveis em logs quando aplicavel;
- politicas de retencao;
- controles de acesso por usuario;
- backup e restore operacional.

## 9. Backup

O Converta possui rotina operacional de backup PostgreSQL, validação por checksum/manifest e procedimento de restore drill. Destino offsite pode ser configurado conforme politica operacional aprovada.

## 10. SLA, Suporte E Manutencao

O suporte contempla atendimento a incidentes criticos e normais, com registro, classificacao, acompanhamento e comunicacao operacional.

A manutencao inclui:

- correcao de falhas;
- atualizacoes de seguranca;
- manutencao preventiva;
- manutencao evolutiva dentro do escopo contratado;
- comunicacao de indisponibilidades programadas quando aplicavel.

## 11. Implantacao E Treinamento

A implantacao segue o plano `IMPLEMENTATION_TRAINING_PLAN.md`, com prazo maximo planejado de ate 60 dias, contemplando:

- kickoff;
- configuracao do tenant;
- usuarios;
- WhatsApp oficial;
- fluxo inicial;
- integracoes;
- treinamento presencial em 3 turmas de 5 pessoas;
- reciclagem mensal remota;
- aceite operacional.

## 12. Evidencias

Documentos de apoio neste pacote:

- `ADHERENCE_MATRIX.md`;
- `TECHNICAL_DECLARATION.md`;
- `IMPLEMENTATION_TRAINING_PLAN.md`;
- `COMMERCIAL_PROPOSAL_PREMISES.md`;
- `HABILITATION_CHECKLIST.md`;
- `FINAL_SUBMISSION_DECISION.md`.
