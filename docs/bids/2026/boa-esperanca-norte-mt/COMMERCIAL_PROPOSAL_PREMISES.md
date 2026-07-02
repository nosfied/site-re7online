# Boa Esperanca do Norte/MT - Proposta Comercial E Premissas

Fonte: Termo de Referencia Corrigido, itens de volumetria, custos, pagamento e vigencia.

Este documento e uma base interna de composicao comercial. Nao inserir dados bancarios, proposta assinada, credenciais ou informacoes fiscais sensiveis no repositorio.

## Parametros Do Edital

| Item | Valor/Condicao |
| --- | --- |
| Teto anual informado para estrategia | R$ 72.000,00/ano |
| Vigencia inicial | 12 meses |
| Implantacao total | ate 30 dias corridos apos Ordem de Servico |
| Pagamento | mensal ou por milestones, com nota fiscal atestada |
| Atendimentos estimados | 3.000/mês |
| Mensagens recebidas | 15.000/mês |
| Mensagens enviadas | 20.000/mês |
| Interacoes totais | 35.000/mês |
| Oscilacao de demanda | ate +50% |
| Utility/service | 18.000/mês |
| Authentication | 1.500/mês |
| Marketing | somente com autorizacao expressa e previa |

## Estrutura Da Proposta Comercial

Campos a preencher fora do repositorio:

| Campo | Valor |
| --- | --- |
| Valor mensal ofertado | R$ [preencher] |
| Valor global 12 meses | R$ [preencher] |
| Prazo de validade da proposta | [preencher] |
| Dados da licitante | [preencher fora do Git] |
| Representante legal | [preencher fora do Git] |

## Escopo Incluido

- licenciamento e uso do Converta Platform no tenant contratado;
- configuracao inicial do tenant;
- WhatsApp oficial Meta conforme viabilidade do numero/WABA;
- Webchat para portal institucional;
- chatbot, fluxos, mensagens institucionais e handoff;
- ate 3 administradores;
- ate 10 operadores;
- ate 5 usuarios de consulta/relatorios;
- treinamento de 16h para ate 15 servidores;
- suporte e SLA conforme `SUPPORT_SLA_PLAN.md`;
- relatorios e exportacoes CSV/PDF;
- backup e operacao conforme pacote tecnico;
- POC remota e implantacao em ate 30 dias.

## Premissas WhatsApp

Usar em conjunto com `WHATSAPP_COSTS_PREMISES.md`.

- custos Meta/WhatsApp devem estar contemplados ou explicitamente condicionados conforme estrategia comercial adotada;
- utility/auth consideradas conforme volumes do TR;
- marketing nao deve ser enviado sem autorizacao expressa;
- variacao de ate +50% deve estar considerada no preco ou tratada como limite operacional/comercial;
- templates Meta dependem de aprovacao da Meta;
- titularidade/transferencia do numero deve ser definida em contrato.

## Custos A Considerar

| Categoria | Pergunta de decisao | Status |
| --- | --- | --- |
| Meta/WhatsApp | Sera absorvido no preco ou repassado como custo variavel? | definir |
| IA/OpenAI | Havera limite mensal de uso generativo? | definir |
| Hospedagem | Ambiente atual suporta o contrato ou exige upgrade? | validar |
| Backup/offsite | Offsite incluso? Qual destino? | definir |
| Suporte | Horario comercial ou janela ampliada? | definir |
| Treinamento | Hibrido com deslocamento? | definir |
| Viagens | Ha presencialidade obrigatoria? | validar |
| Manutencao presencial | Anexo III cita quinzenal presencial; TR corrigido cita remota mensal | esclarecer/precificar |
| POC | Custos de preparacao e equipe | incluir |
| Margem | Margem minima aceitavel | definir |

## Cenarios Comerciais

| Cenario | Valor mensal | Valor anual | Uso |
| --- | ---: | ---: | --- |
| Conservador | R$ 6.000,00 | R$ 72.000,00 | Usa teto anual integral; maior margem para suporte, IA, Meta e treinamento. |
| Competitivo | R$ 4.800,00 | R$ 57.600,00 | Reduz preco preservando margem se custos Meta/IA forem controlados. |
| Agressivo | R$ 3.900,00 | R$ 46.800,00 | Usar somente se limites de IA/Meta/suporte presencial estiverem bem definidos. |
| Nao recomendado | abaixo de R$ 3.000,00 | abaixo de R$ 36.000,00 | Risco alto frente a suporte, treinamento, Meta, IA e manutencao. |

## Formula De Verificacao Interna

Antes de fechar preco:

```text
receita_mensal
- custo_meta_whatsapp_estimado
- custo_ia_estimado
- hospedagem/backup
- suporte mensal
- amortizacao implantacao/treinamento
- deslocamentos/presencialidade
= margem operacional
```

## Condicoes E Exclusoes A Avaliar

Nao declarar como exclusao se o edital exigir como incluso. Quando permitido, registrar como premissa:

- sistemas externos da Camara dependem de API, credenciais e homologacao fornecidas;
- integracoes especificas fora da POC podem exigir cronograma tecnico;
- mensagens de marketing dependem de autorizacao previa;
- volumes acima da oscilacao de +50% podem exigir reavaliacao comercial;
- atendimento presencial recorrente deve ser precificado se exigido;
- dados reais e credenciais serao coletados por canal seguro, nunca por proposta publica.

## Decisao Comercial Preliminar

Status: **pronto com pendencias comerciais**.

Pendencias antes de enviar:

1. definir valor mensal e anual;
2. decidir tratamento dos custos Meta/WhatsApp;
3. decidir limite de IA generativa;
4. decidir se manutencao presencial quinzenal sera ofertada ou questionada;
5. validar margem minima com financeiro;
6. revisar juridicamente condicoes e premissas.
