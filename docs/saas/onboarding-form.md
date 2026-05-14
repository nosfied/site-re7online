# Formulario de Onboarding

Use este formulario como checklist oficial de coleta de dados antes da configuracao tecnica do cliente no WhatsApp Agent.

## Dados empresariais

- Razao social / nome comercial
- CNPJ / identificacao fiscal aplicavel
- Segmento de atuacao
- Nome do responsavel principal pelo projeto
- E-mail do responsavel principal
- Telefone do responsavel principal
- Cidade / estado / pais de operacao
- Site oficial / dominio principal
- Objetivo do uso do WhatsApp Agent (captacao, suporte, agendamento, vendas, pos-venda)

## Dados WhatsApp

- Numero que sera usado no WhatsApp Business
- Numero ja esta ativo em operacao? (sim/nao)
- Numero ja esta conectado a outro provedor? (sim/nao)
- Phone Number ID (se ja disponivel)
- Nome de exibicao aprovado no WhatsApp Business
- Lista inicial de numeros para allowlist de teste
- Janela operacional desejada para testes e go-live

## Acesso Meta

- Business Manager ID
- WABA ID (WhatsApp Business Account ID)
- App ID
- Nome do app Meta
- Confirmacao de que a Re7 possui acesso administrativo ao app / WABA
- Confirmacao de que webhook e credenciais podem ser configurados pela Re7
- Responsavel tecnico do cliente para aprovar templates e configuracoes
- Templates aprovados necessarios no go-live (ex.: handoff manual, pricing)

## Atendimento

- Nome do time ou pessoa responsavel pelo atendimento humano
- Numero do atendente / fallback humano (handoffAttendantWaid)
- Horario de atendimento comercial
- SLA interno esperado para retorno humano
- Idioma padrao de atendimento
- Template de handoff manual aprovado
- Regras comerciais que o bot deve respeitar (ex.: nao enviar proposta sem briefing, nao confirmar agendamento sem atendente)
- Criterios de go-live aprovados pelo cliente

## Automacao + IA

Antes de ativar IA conversacional, preencher o playbook completo:

- [Playbook de Parametrizacao: Automacao + IA por Tenant](./automation-ai-tenant-playbook.md)

Coletar e aprovar:

- modelo de uso desejado: fluxo estruturado, IA controlada, hibrido, humano assistido ou CRM/campanhas;
- estado desejado de Fluxo configuravel;
- estado desejado de Classificacao de intencao;
- estado desejado de Base de IA;
- estado desejado de IA controlada;
- maximo de respostas da IA por conversa;
- contexto de negocio da IA;
- instrucao adicional aprovada;
- temas permitidos;
- temas secundarios;
- termos bloqueados;
- palavras-chave de handoff;
- mensagem de boas-vindas;
- mensagem fallback;
- prompt de handoff;
- catalogo de intencoes;
- criterios de CRM;
- situacoes do negocio;
- follow-up;
- notificacao interna de novo lead.

## Confirmacao final

- Todos os dados acima foram conferidos com o cliente
- O cliente aprovou a configuracao inicial de tenant
- O cliente aprovou a lista de allowlist para testes controlados
- O cliente foi informado sobre o processo de validacao tecnica antes da ativacao
