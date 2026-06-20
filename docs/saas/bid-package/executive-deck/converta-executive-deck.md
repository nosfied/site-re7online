# Converta

Central Inteligente de Atendimento e Operacao Comercial

Plataforma SaaS para centralizar conversas, organizar equipes, automatizar atendimentos e dar visibilidade gerencial.

**Notas do apresentador**

Apresentar o Converta como uma central de operacao, nao como chatbot. O foco e controle, previsibilidade, atendimento humano integrado e canais oficiais.

---

# 1. Problema

Empresas e orgaos publicos perdem eficiencia quando o atendimento digital fica espalhado.

- conversas em celulares diferentes;
- falta de historico;
- demora na resposta;
- leads/cidadaos sem dono;
- ausencia de fila e prioridade;
- pouca visibilidade da gestao;
- dificuldade para medir SLA;
- risco de uso informal do WhatsApp.

**Mensagem-chave**

O problema nao e apenas responder mensagens. E controlar toda a operacao de atendimento.

---

# 2. Solucao

O Converta centraliza canais digitais em uma unica plataforma de atendimento.

- WhatsApp oficial;
- Instagram Direct, quando habilitado;
- Facebook/Messenger, quando configurado;
- inbox multiatendente;
- atendimento humano;
- chatbot e IA supervisionada;
- CRM conversacional;
- campanhas oficiais;
- relatorios e dashboards.

**Mensagem-chave**

Uma central para receber, organizar, atender, acompanhar e medir conversas.

---

# 3. Beneficios

O Converta melhora a operacao em quatro frentes.

| Frente | Beneficio |
| --- | --- |
| Atendimento | respostas mais organizadas e rastreaveis |
| Gestao | visibilidade de filas, equipes e prazos |
| Conversao | menos leads perdidos e mais continuidade |
| Governanca | canais oficiais, historico e controle por usuario |

**Resultados esperados**

- menos perda de atendimento;
- mais previsibilidade;
- melhor acompanhamento da equipe;
- reducao de retrabalho;
- dados para decisao.

---

# 4. WhatsApp Oficial

O Converta opera com API oficial da Meta para WhatsApp.

- sem automacao por QR Code;
- sem extensao de navegador;
- webhook oficial;
- templates aprovados pela Meta;
- rastreabilidade;
- maior estabilidade;
- adequado para operacao profissional e contratos publicos.

**Mensagem-chave**

WhatsApp oficial reduz risco operacional e permite uma operacao auditavel.

---

# 5. IA

IA supervisionada para apoiar a operacao, nao substituir a equipe.

- saudacao inicial;
- triagem;
- qualificacao;
- coleta de informacoes;
- classificacao de intencoes;
- resposta assistida;
- encaminhamento humano quando necessario.

**Controles**

- configuracao por tenant;
- topicos permitidos;
- termos bloqueados;
- limite de respostas;
- desativacao por configuracao;
- avaliacao/replay de casos reais.

---

# 6. Atendimento Humano

O operador assume a conversa quando o atendimento precisa de pessoa.

- atribuicao de responsavel;
- filas e setores;
- atendimento geral;
- finalizacao de atendimento;
- devolucao para fila;
- notificacoes;
- historico completo;
- permissao por perfil.

**Mensagem-chave**

Automacao ajuda, mas a operacao permanece controlada por pessoas.

---

# 7. CRM

CRM conversacional integrado ao atendimento.

- registro de lead/contato;
- historico por conversa;
- notas internas;
- status de negocio;
- interesse ou demanda;
- acompanhamento por operador;
- timeline completa.

**Aplicacoes**

- vendas;
- suporte;
- relacionamento;
- ouvidoria;
- atendimento ao cidadao;
- acompanhamento de demandas.

---

# 8. Dashboard

Visao gerencial para tomada de decisao.

- volume de conversas;
- conversas por canal;
- conversas por setor;
- tempo de primeira resposta;
- tempo medio de resolucao;
- conversas fora do SLA;
- campanhas e templates;
- operacao por periodo.

**Mensagem-chave**

O gestor deixa de depender de percepcao e passa a acompanhar dados.

---

# 9. LGPD

Governanca de dados pessoais desde a operacao.

- segregacao por tenant;
- controle de acesso;
- retencao configuravel;
- soft delete operacional;
- anonimizacao conforme politica;
- reducao de exposicao;
- orientacao para minimizacao de dados.

**Responsabilidade**

O contratante define finalidade, base legal e politicas internas. O Converta fornece controles tecnicos para apoiar a operacao.

---

# 10. Seguranca

Controles para uma operacao profissional.

- autenticacao de usuarios;
- sessoes controladas;
- RBAC/perfis;
- setores/departamentos;
- tokens redigidos;
- secrets de canais criptografados;
- logs operacionais;
- separacao entre app do cliente e console interno.

**Mensagem-chave**

Credenciais e dados sensiveis nao devem aparecer em telas, logs ou anexos.

---

# 11. Casos De Uso

## Empresas

- vendas por WhatsApp;
- central de atendimento;
- campanhas oficiais;
- CRM comercial;
- follow-up;
- suporte.

## Governo

- central de atendimento ao cidadao;
- ouvidoria;
- secretarias;
- protocolo inicial;
- orientacao de servicos;
- relatorios de demanda.

---

# 12. Arquitetura Simplificada

```text
Cidadao / Cliente
  |
  v
Canais oficiais Meta
WhatsApp | Instagram | Messenger
  |
  v
Converta Backend
Webhooks | Realtime | Automacao | IA
  |
  v
PostgreSQL
Conversas | Usuarios | CRM | Relatorios | Configuracoes
  |
  v
Frontend Converta
Inbox | CRM | Dashboard | Campanhas | Configuracoes
```

**Mensagem-chave**

Uma arquitetura SaaS centralizada, multi-tenant e preparada para evolucao.

---

# 13. Diferenciais

- foco em operacao, nao apenas chatbot;
- WhatsApp oficial;
- inbox multiatendente;
- CRM conversacional;
- IA supervisionada;
- configuracao por tenant;
- perfis B2B e B2G;
- relatorios e SLA;
- governanca LGPD;
- campanhas oficiais;
- suporte a Messenger e Instagram quando configurados.

**Mensagem-chave**

O Converta une atendimento, automacao e gestao em uma unica central.

---

# 14. Modelo SaaS

O Converta e fornecido como plataforma SaaS.

- acesso web;
- configuracao por tenant;
- evolucao continua;
- suporte e manutencao;
- atualizacoes controladas;
- perfis e feature flags;
- integrações por escopo;
- infraestrutura dimensionada conforme contrato.

**Premissas comerciais**

- volumes de usuarios e canais devem ser definidos em contrato;
- armazenamento de midias deve ser dimensionado;
- templates Meta podem gerar custos externos;
- requisitos especiais exigem matriz de aderencia.

---

# Encerramento

Converta transforma conversas em operacao organizada.

- atende melhor;
- mede melhor;
- controla melhor;
- reduz perda de atendimento;
- fortalece relacionamento com clientes e cidadaos.

**Chamada final**

Centralize canais, organize equipes e acompanhe resultados em uma plataforma profissional.

