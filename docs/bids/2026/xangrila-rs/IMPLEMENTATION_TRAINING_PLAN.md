# Xangri-La/RS PE 115/2026 - Plano De Implantacao E Treinamento

## Objetivo

Implantar o Converta Platform para gestao de mensagens WhatsApp, com ate 10 usuarios, chatbot, atendimento humano, relatorios, suporte e treinamento presencial em 3 turmas de 5 pessoas.

## Cronograma Minimo

| Fase | Prazo sugerido | Entrega |
| --- | --- | --- |
| Kickoff | D+1 | Reuniao inicial, responsaveis, dados do tenant e plano de trabalho. |
| Provisionamento | D+2 a D+4 | Tenant, usuarios, roles, departamentos/filas e parametros iniciais. |
| Canal WhatsApp | D+3 a D+8 | Configuracao Meta/WABA/numero, webhook, templates e smoke inbound/outbound. |
| Chatbot inicial | D+5 a D+10 | Fluxo de saudacao, triagem e handoff humano. |
| Integracoes | D+8 a D+15 | API/webservice/importacao/exportacao conforme credenciais e layouts fornecidos. |
| Relatorios/SLA | D+10 a D+18 | Validacao de relatorios, exportacao e rotina de acompanhamento. |
| Treinamento presencial | D+15 a D+25 | 3 turmas de 5 pessoas. |
| Homologacao e aceite | D+20 a D+30 | Checklist final, ajustes pequenos e aceite operacional. |
| Margem contratual | D+31 a D+60 | Janela reservada para dependencias externas, integracoes e ajustes de aceite dentro do prazo maximo de 60 dias. |

## Treinamento Presencial

Formato: 3 turmas de 5 pessoas.

Carga sugerida por turma: 2h a 3h, ajustavel conforme edital/contrato.

Conteudo:

1. visao geral do Converta;
2. login e seguranca;
3. Inbox e atendimento humano;
4. protocolo e historico;
5. chatbot e handoff;
6. usuarios, roles e boas praticas;
7. relatorios e exportacao;
8. LGPD e cuidados operacionais;
9. abertura de chamados de suporte;
10. perguntas e simulacao guiada.

## Reciclagem Mensal Remota

Periodicidade: mensal.

Formato: videoconferencia remota.

Conteudo:

- duvidas recorrentes;
- revisao de relatorios;
- boas praticas de atendimento;
- ajustes de fluxo;
- novidades e manutencoes;
- plano de melhoria operacional.

## Integracao

Escopo suportado:

- Public API;
- webhooks;
- exportacao CSV/PDF;
- importacao controlada mediante layout;
- integracao com webservice externo mediante credenciais/documentacao.

Rotina de integracao/importacao de dados:

1. levantamento do sistema externo e responsavel tecnico;
2. recebimento seguro de credenciais e documentacao;
3. validacao de endpoint, layout ou arquivo;
4. teste em ambiente controlado;
5. importacao/exportacao assistida;
6. validacao e aceite pelo contratante.

Premissas:

- o contratante deve fornecer credenciais, endpoint, homologacao e layout;
- integrações especificas fora do escopo inicial podem exigir cronograma complementar;
- segredos nunca devem ser enviados por e-mail comum ou commitados.

## Checklist De Go-Live

| Item | Status |
| --- | --- |
| Tenant criado | pendente |
| 10 usuarios criados/validados | pendente |
| Roles conferidas | pendente |
| WhatsApp oficial conectado | pendente |
| Webhook validado | pendente |
| Inbound testado | pendente |
| Outbound testado | pendente |
| Chatbot inicial aprovado | pendente |
| Handoff humano validado | pendente |
| Relatorios validados | pendente |
| Backup/restore operacional configurado | pendente |
| Treinamento presencial executado | pendente |
| Reciclagem mensal agendada | pendente |
| Aceite operacional assinado | pendente |

## Responsabilidades Do Contratante

- fornecer numero/WABA ou autorizar configuracao Meta;
- indicar usuarios e perfis;
- indicar fluxo inicial de atendimento;
- fornecer conteudo institucional;
- fornecer credenciais/layouts de integracao;
- disponibilizar equipe para treinamento;
- validar aceite.
