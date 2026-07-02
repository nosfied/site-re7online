# Boa Esperanca do Norte/MT CE 001/2026 - Evidence Pack

Fonte auditada:

- `/home/deifson-oliveira/Downloads/EDITAL_0012026.pdf`
- `/home/deifson-oliveira/Downloads/ERRATA_N_0022026.pdf`
- `/home/deifson-oliveira/Downloads/TERMO_DE_REFERENCIA_CORRIGIDO.pdf`
- `/home/deifson-oliveira/Downloads/AVISO_DE_PUBLICAO_DA_ERRATA.pdf`

Data: 2026-07-02.

Escopo: pacote documental para proposta tecnica e POC da Concorrencia Eletronica no 001/2026 da Camara Municipal de Boa Esperanca do Norte/MT.

Este pacote nao cria produto separado, nao altera o Core do Converta, nao hardcoda regras do orgao no runtime e nao contem credenciais, tokens, IDs reais ou dados pessoais.

## Documentos

| Documento | Uso |
| --- | --- |
| `ANEXO_III_EVIDENCE_MATRIX.md` | Matriz dos 97 criterios do Anexo III com status, evidencia e roteiro de demonstracao. |
| `POC_REMOTE_SCRIPT.md` | Roteiro de POC remota cobrindo o item 11.3 do TR corrigido. |
| `TRAINING_16H_PLAN.md` | Plano de treinamento de 16 horas para ate 15 servidores. |
| `SUPPORT_SLA_PLAN.md` | Plano de suporte, chamados, severidades, manutencao e comunicacao de incidentes. |
| `WHATSAPP_COSTS_PREMISES.md` | Premissas de volume, categorias de mensagens e custos WhatsApp/Meta. |

## Resultado Executivo

Classificacao recomendada: **Participar com ajustes documentais e demonstrativos**.

O Converta Platform possui aderencia forte ao nucleo do certame: SaaS web, WhatsApp oficial Meta, Webchat, chatbot, fluxos, handoff humano, base de conhecimento tenant-scoped, Public API, webhooks, dashboard, relatorios, LGPD, RBAC, observabilidade, backup e suporte operacional.

Os principais pontos que exigem atencao antes da sessao de POC sao:

- demonstrar base de conhecimento alimentando respostas automatizadas;
- demonstrar integracao com API externa em simulacao controlada;
- apresentar plano formal de suporte/chamados com status;
- apresentar plano de treinamento 16h e material de apoio;
- tratar a divergencia entre TR corrigido e Anexo III sobre manutencao preventiva.

## Pontuacao Tecnica Conservadora

| Classificacao | Quantidade estimada | Observacao |
| --- | ---: | --- |
| Atende | 70 | Evidencia objetiva direta no produto, codigo ou docs. |
| Atende com demonstracao | 14 | Depende de roteiro/POC, parametrizacao ou comprovacao operacional. |
| Parcial | 10 | Capacidade base existe, mas falta demonstracao E2E especifica ou contrato operacional. |
| Nao comprovado | 3 | Nao ha evidencia objetiva suficiente hoje. |

Estimativa conservadora:

```text
POP provavel: 80 a 87 / 97
NPT provavel: 82,47 a 89,69 / 100
```

## Regra De Uso

Toda afirmacao tecnica da proposta deve apontar para:

- funcionalidade existente;
- evidencia no repositorio;
- roteiro de POC;
- responsabilidade operacional, quando aplicavel.

Nao declarar como entregue aquilo que depende de integracao real com sistemas da Camara ainda nao disponibilizados.
