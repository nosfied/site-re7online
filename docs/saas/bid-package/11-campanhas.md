# Campanhas

## Visao Geral

O modulo de campanhas permite acionar contatos usando templates oficiais aprovados pela Meta, respeitando politicas de mensageria e regras comerciais do canal.

## Recursos

- criacao de campanha;
- selecao de destinatarios;
- uso de templates aprovados;
- acompanhamento de envio;
- vinculo com mensagens outbound;
- rastreabilidade operacional;
- uso por tenant.

## Templates

Templates sao modelos submetidos e aprovados conforme politica da Meta.

Podem ser usados para:

- comunicados;
- follow-up;
- retorno em janela fechada;
- campanhas autorizadas;
- avisos institucionais;
- notificacoes.

## Governanca

Campanhas devem observar:

- permissao do tenant;
- autorizacao do contato quando aplicavel;
- politica Meta;
- limites contratados;
- plano/quota;
- horario e finalidade;
- LGPD e base legal.

## Relatorios De Campanha

O sistema pode manter evidencias de:

- campanha criada;
- destinatarios;
- parametros de template;
- mensagens geradas;
- status operacional;
- historico de envio.

## UX e Resultado Operacional

Status em 2026-09-18: Campaign UX/result-truth INTEGRATED LOCAL / OWNER
REVALIDATION PENDING / NO DEPLOY. A tela operacional de campanhas deve mostrar
destino humano por Setor, lifecycle persistido (`Enviando`, `Agendadas`,
`Concluídas`), progresso que continua no backend mesmo com modal fechado e
resultado por destinatario com motivos de bloqueio/falha/opt-out quando
persistidos. A UX do cliente nao deve exibir preco, custo, tarifa ou estimativa
financeira; evidencias financeiras pertencem ao gate de relatorios/billing.

## Premissas Para Editais

- O edital deve distinguir atendimento receptivo de campanhas ativas.
- Templates e custos Meta devem ser previstos.
- Volumes como 60.000 templates exigem planejamento de custo, throughput e aprovacao.
- Disparo proativo deve respeitar politica da Meta e base legal do controlador.
