# Boa Esperanca do Norte/MT - Premissas WhatsApp E Custos

Fonte: itens 2 e 5 do Termo de Referencia Corrigido.

## Volumetria Do TR

| Item | Volume mensal estimado |
| --- | ---: |
| Atendimentos | 3.000 |
| Mensagens recebidas | 15.000 |
| Mensagens enviadas | 20.000 |
| Interacoes totais | 35.000 |
| Oscilacao prevista | ate +50% |

Com +50%:

| Item | Volume mensal dimensionado |
| --- | ---: |
| Atendimentos | 4.500 |
| Mensagens recebidas | 22.500 |
| Mensagens enviadas | 30.000 |
| Interacoes totais | 52.500 |

## Categorias De Mensagens

| Categoria | Estimativa TR | Tratamento |
| --- | ---: | --- |
| Utility/service | 18.000/mês | Incluir no custo mensal estimado. |
| Authentication | 1.500/mês | Incluir no custo mensal estimado quando aplicavel. |
| Marketing | sem estimativa | Usar somente com autorizacao expressa e previa da Administracao. |

## Responsabilidades Operacionais

O TR permite que o numero WhatsApp seja fornecido pela contratada durante implantacao e transferido para titularidade da contratante apos conclusao, conforme cronograma acordado.

Na proposta, contemplar:

- ativacao do canal;
- configuracao Cloud API;
- WABA/phone number setup;
- webhook;
- templates quando necessarios;
- suporte a entrada em producao;
- custos de plataforma e tarifas Meta/WhatsApp;
- margem para oscilacao de demanda de ate 50%.

## Evidencia Tecnica Converta

- integracao oficial Meta Cloud API;
- webhook assinado por `X-Hub-Signature-256`;
- ausencia de dependencia WhatsApp Web/QR;
- inbound/outbound no Inbox;
- templates Meta quando aplicaveis;
- media e location;
- protocolos e relatorios.

## Premissas Comerciais

1. Custos Meta variam por tabela vigente, pais, categoria e regras de conversa/mensagem aplicaveis.
2. Mensagens de marketing somente serao usadas mediante autorizacao expressa e previa.
3. Alteracao material de volume ou categoria pode exigir revisao operacional/comercial conforme contrato.
4. Sistemas externos da Camara dependem de documentacao, credenciais de homologacao e disponibilidade tecnica.
5. Tokens, phone number IDs, WABA IDs e credenciais nao devem ser incluidos na proposta publica.

## Checklist Antes Da Proposta

- confirmar modelo de cobranca Meta vigente;
- estimar custo mensal para utility/auth com +50%;
- explicitar que marketing nao esta precificado sem autorizacao;
- definir quem sera titular final do numero;
- incluir implantacao e suporte do canal;
- incluir premissa de homologacao Meta e validacao de templates.
