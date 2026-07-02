# Boa Esperanca do Norte/MT - Matriz De Decisao De Participacao

Fonte: pacote 84A, edital, TR corrigido e Anexo III.

## Decisao Preliminar

**Status: pronto com pendencias.**

Motivo: a plataforma possui aderencia tecnica forte, mas a participacao ainda depende de fechamento comercial, documentos de habilitacao, atestado tecnico, estrategia de preco e preparacao da POC de KB/API externa.

## Decision Gate 84C

**Decisao condicionada: participar somente se as pendencias bloqueantes abaixo forem fechadas antes do envio.**

Esta decisao nao exige alteracao de produto. O Converta Platform tem condicao tecnica real de competir, mas a participacao so deve ser autorizada se os documentos reais, a estrategia de preco e o ensaio da POC estiverem prontos. O risco principal deixou de ser engenharia e passou a ser habilitacao, demonstracao e margem operacional.

| Item | Classificacao | E impeditivo? | Condicao para liberar participacao |
| --- | --- | --- | --- |
| Atestado tecnico assinado por terceiro | Bloqueante | Sim | Atestado deve comprovar servico similar de atendimento digital/chatbot/omnichannel, sem afirmacoes nao verificaveis. |
| Certidoes e documentos societarios validos | Bloqueante | Sim | Conferir validade no dia do envio e organizar PDF/ZIP/RAR conforme edital. |
| Proposta comercial com margem minima | Bloqueante | Sim | Diretoria deve aprovar valor mensal, custos Meta/IA, suporte, treinamento e presencialidade. |
| POC de KB e API externa simulada | Bloqueante | Sim | Ensaio deve demonstrar resposta baseada em KB e chamada/retorno de API mock sem depender de sistema real da Camara. |
| Divergencia manutencao quinzenal presencial vs TR corrigido | Bloqueante comercial/juridico | Sim, se assumida sem preco | Tratar por esclarecimento, ressalva comercial permitida ou precificacao explicita. |
| Representante legal e declaracoes | Bloqueante | Sim | Declaracoes devem ser assinadas por pessoa com poderes e revisadas pelo juridico/contabil. |

Pendencias nao bloqueantes, desde que tratadas no plano de execucao:

| Item | Motivo |
| --- | --- |
| CRC Prefeitura Municipal de Sorriso/MT | Facultativo conforme leitura atual, mas pode reduzir risco documental. |
| Integracao real com sistemas da Camara | Depende de APIs, credenciais e homologacao fornecidas na implantacao; a POC deve usar simulacao controlada. |
| Portal externo de chamados | Pode ser operado por canal formal e registro de incidentes/status, desde que documentado na proposta. |
| Material final de apoio em PDF | Pode ser montado a partir dos documentos deste pacote antes da sessao de treinamento/POC. |
| Evidencias operacionais finais | Health, logs, SLA e screenshots devem ser capturados proximo da POC para evitar defasagem. |

## Semaforo Por Area

| Area | Status | Justificativa |
| --- | --- | --- |
| Produto | verde | Converta cobre web, WhatsApp oficial, Webchat, Inbox, chatbot, KB, reports, RBAC, LGPD e ops. |
| POC | amarelo | Roteiro existe, mas demo de KB alimentando resposta e API externa simulada precisa ensaio. |
| Habilitacao | amarelo | Depende de certidoes, declaracao unificada, atestado e documentos societarios. |
| Comercial | amarelo | Preco precisa considerar Meta, IA, suporte, treinamento e eventual presencialidade. |
| Juridico | amarelo | Necessario revisar manutencao quinzenal presencial vs TR corrigido. |
| Operacao | verde/amarelo | Suporte/SLA e backup existem, mas canais formais e equipe precisam estar definidos. |

## Principais Riscos

| Risco | Impacto | Probabilidade | Mitigacao |
| --- | --- | --- | --- |
| Falta de atestado tecnico compativel | Alto | Medio | Obter atestado Tendencia revisado e assinado. |
| Preco abaixo do custo real | Alto | Medio | Fechar planilha de custos com Meta/IA/suporte/treinamento. |
| POC falhar em KB/API externa | Alto | Medio | Ensaiar demo e preparar endpoint mock. |
| Comissao exigir manutencao presencial quinzenal | Medio/alto | Medio | Pedir esclarecimento ou precificar deslocamento. |
| Certidao vencida ou documento fora da ordem | Alto | Baixo/medio | Checklist de habilitacao e revisao final. |
| Prometer integracao real sem API da Camara | Alto | Baixo | Usar linguagem de simulacao controlada autorizada pelo TR. |
| Custos WhatsApp/marketing mal definidos | Medio | Medio | Registrar premissas e autorizacao expressa para marketing. |

## Riscos De POC

| Area | Risco | Tratamento recomendado |
| --- | --- | --- |
| KB/base de conhecimento | Comissao pedir evidencia de resposta automatizada baseada em artigo | Preparar artigo curto, pergunta previsivel, resposta com fonte e fallback humano. |
| API externa | Exigirem integracao com sistema real da Camara | Demonstrar mock controlado e declarar que conector real depende de API/credenciais do orgao. |
| Website/Webchat | Instabilidade de internet ou ambiente demo | Ter URL, print e conversa pre-criada como plano B. |
| WhatsApp oficial | Janela Meta/template ou numero indisponivel | Mostrar webhook/Cloud API, timeline real e evidencia tecnica; nao usar WhatsApp Web. |
| Indicadores/satisfacao | Pergunta sobre indicador nao populado no demo | Preparar dados demonstrativos e explicar coleta por periodo/relatorio. |
| Suporte/chamados | Exigirem portal externo dedicado | Demonstrar severidades/status/incidentes e registrar canal formal contratual. |
| Manutencao presencial | Cobranca do Anexo III em POC | Explicar divergencia com TR corrigido e tratamento comercial/juridico adotado. |

## Preco E Premissas Recomendadas

| Estrategia | Valor mensal | Decisao |
| --- | ---: | --- |
| Competitivo seguro | R$ 4.800,00 a R$ 6.000,00 | Recomendado se custos Meta/IA forem controlados e presencialidade recorrente nao for obrigatoria sem cobertura. |
| Teto tecnico | R$ 6.000,00 | Recomendado se houver risco de deslocamento, maior suporte ou maior consumo IA/WhatsApp. |
| Agressivo controlado | R$ 3.900,00 | Usar somente com limites claros de IA, Meta, suporte e sem manutencao presencial quinzenal obrigatoria. |
| Abaixo de R$ 3.000,00 | n/a | Nao recomendado; risco alto de inexequibilidade operacional. |

Premissas que devem constar na proposta ou no controle interno de custos:

- volumes de 15.000 mensagens recebidas, 20.000 enviadas e oscilacao de ate 50%;
- categorias utility/auth incluidas conforme TR e marketing apenas com autorizacao expressa;
- treinamento hibrido de 16h para ate 15 servidores;
- viagem/reuniao presencial somente se precificada ou exigida de forma expressa;
- integracoes reais condicionadas a APIs, credenciais e homologacao fornecidas pela Camara.

## Go/No-Go

| Pergunta | Resposta necessaria antes do envio |
| --- | --- |
| Temos atestado tecnico assinado por terceiro? | Sim |
| Certidoes principais estao validas? | Sim |
| Valor mensal cobre custos e margem minima? | Sim |
| Demo de KB/API externa foi ensaiada? | Sim |
| Proposta trata manutencao quinzenal presencial? | Sim, por ressalva/esclarecimento ou preco |
| Custos Meta/WhatsApp foram considerados? | Sim |
| Representante legal revisou declaracoes? | Sim |

## Recomendacao

Participar se:

1. o atestado tecnico for obtido;
2. a proposta comercial nao cair abaixo da margem minima;
3. a POC for ensaiada antes da sessao;
4. juridico validar as declaracoes e a divergencia de manutencao;
5. as certidoes forem emitidas/validadas no prazo.

Classificacao final da 84C: **participar somente se pendencias bloqueantes forem fechadas**.

Se todos os bloqueios forem resolvidos, a decisao operacional passa para **participar**. Se atestado, preco minimo ou POC KB/API nao forem fechados, a decisao deve permanecer **nao enviar proposta** para evitar inabilitacao, perda na prova de conceito ou execucao deficitaria.

Nao participar se:

- o preco vencedor esperado exigir operar abaixo do custo;
- nao houver atestado tecnico aceitavel;
- for obrigatoria manutencao presencial quinzenal sem cobertura de custo;
- a empresa nao conseguir demonstrar KB/API externa na POC.

## Proximas Acoes

| Prioridade | Acao | Responsavel |
| --- | --- | --- |
| Alta | Obter atestado Tendencia assinado | Comercial |
| Alta | Emitir certidoes e consulta TCU/CNJ/Transparencia | Juridico/Contabil |
| Alta | Fechar valor mensal/global | Diretoria/Comercial |
| Alta | Ensaiar POC com KB e API externa mock | Tecnico/Comercial |
| Media | Preparar PDF unico com indice | Comercial |
| Media | Revisar proposta tecnica e comercial | Juridico/Comercial |
| Media | Definir canais de suporte oficiais | Operacao |
