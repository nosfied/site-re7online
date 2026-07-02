# Boa Esperanca do Norte/MT - Checklist De Habilitacao

Fonte: Edital da Concorrencia Eletronica no 001/2026, item 10.2 e seguintes, Termo de Referencia Corrigido e Anexo III.

Status permitidos:

- pronto
- pendente
- validar
- nao aplicavel

Este checklist nao deve receber certidoes reais, documentos pessoais, dados bancarios, tokens ou credenciais no repositorio. Os documentos finais devem ser montados fora do Git, em PDF/ZIP/RAR conforme o edital.

## Regras Gerais Do Envio

| Exigencia | Status | Responsavel | Observacao |
| --- | --- | --- | --- |
| Enviar arquivos apenas em PDF ou pacote PDF/ZIP/RAR aceito pela plataforma | validar | Comercial/Juridico | O edital orienta juntar documentos e declaracoes em arquivo unico com indice. |
| Montar indice na ordem do item 10.2 | pendente | Comercial | Evita inabilitacao por desorganizacao documental. |
| Nao enviar documentos rasurados, ilegíveis ou incompletos | validar | Comercial/Juridico | Conferencia antes do upload. |
| Documentos com validade devem estar vigentes | validar | Juridico/Contabil | Conferir data no dia do certame. |
| Documentos sem validade expressa: validade de 30 dias desde expedicao | validar | Juridico/Contabil | Exceto regra especifica do proprio documento. |
| CRC Prefeitura Municipal de Sorriso/MT | validar | Juridico | Edital aponta como facultativo, mas relevante. Confirmar estrategia. |

## I - Habilitacao Juridica

| Documento | Status | Responsavel | Validade/Prazo | Observacao |
| --- | --- | --- | --- | --- |
| Documento oficial com foto dos socios/representantes | pendente | Juridico | vigente | Nao commitar no repositorio. |
| Contrato social/ato constitutivo/estatuto em vigor | pendente | Juridico/Contabil | vigente | Deve comprovar poderes de representacao. |
| Documentos de eleicao de administradores, se aplicavel | validar | Juridico | vigente | Aplicavel conforme natureza societaria. |
| Decreto/autorizacao para empresa estrangeira, se aplicavel | nao aplicavel | Juridico | n/a | Confirmar se licitante e nacional. |
| CRC Prefeitura Municipal de Sorriso/MT | validar | Juridico | conforme emissao | Facultativo no edital, mas pode reduzir risco operacional. |

## II - Regularidade Fiscal E Trabalhista

| Documento | Status | Responsavel | Validade/Prazo | Observacao |
| --- | --- | --- | --- | --- |
| CNPJ | pendente | Contabil | emissao recente | Documento publico da licitante. |
| Inscricao estadual ou declaracao de nao contribuinte, se aplicavel | validar | Contabil | conforme orgao | Compatibilidade com atividade. |
| Certidao Federal/INSS/Divida Ativa da Uniao | pendente | Contabil | conforme certidao | Regularidade fiscal federal. |
| Certidao Estadual de debitos tributarios e nao tributarios | pendente | Contabil | conforme certidao | Estado da sede. |
| Certidao de Divida Ativa Estadual | pendente | Contabil | conforme certidao | Procuradoria estadual. |
| Certidao Municipal da sede, incluindo divida ativa | pendente | Contabil | conforme certidao | Municipio da sede. |
| FGTS/CRF | pendente | Contabil | conforme Caixa | Conferir validade no dia do upload. |
| CNDT trabalhista | pendente | Contabil/Juridico | conforme TST | Regularidade trabalhista. |
| Consulta Consolidada TCU/CNJ/Portal da Transparencia | pendente | Juridico | emissao recente | Usar `https://certidoes-apf.apps.tcu.gov.br/`. |

## III - Qualificacao Economico-Financeira

| Documento | Status | Responsavel | Validade/Prazo | Observacao |
| --- | --- | --- | --- | --- |
| Balanco patrimonial do ultimo exercicio ou documento equivalente | pendente | Contabil | ultimo exercicio | Para ME/EPP/Simples, avaliar DEFIS/IRPJ conforme edital. |
| Demonstracoes contabeis exigidas | pendente | Contabil | ultimo exercicio | Assinatura/registro conforme regime. |
| Certidao negativa de falencia/concordata/recuperacao | pendente | Juridico | se sem validade, emitir ate 90 dias antes | Para MT, edital cita opcoes AUTOR e REU; para outros estados, conferir equivalencia. |
| Se positiva de recuperacao: plano acolhido judicialmente | nao aplicavel | Juridico | n/a | Usar apenas se houver recuperacao judicial. |

## IV - Qualificacao Tecnica

| Documento | Status | Responsavel | Validade/Prazo | Observacao |
| --- | --- | --- | --- | --- |
| Declaracao unificada conforme Anexo IV | pendente | Juridico/Representante legal | data do certame | Deve ser emitida em papel timbrado e assinada por representante com poderes. |
| Atestado de capacidade tecnica de pessoa juridica | pendente | Comercial | sem validade definida, preferir recente | Deve comprovar servico similar de autoatendimento/chatbot/atendimento digital. |
| Minuta Tendencia Modas revisada e assinada | pendente | Comercial/Tendencia | antes do upload | Usar `TECHNICAL_CAPACITY_CERTIFICATE_TENDENCIA_DRAFT.md` como base. |
| Evidencias complementares do servico prestado | validar | Comercial | n/a | Contrato, prints, relatorio de servicos, se solicitados em diligencia. |
| Proposta tecnica e matriz Anexo III | pendente | Comercial/Tecnico | certame | Usar `TECHNICAL_PROPOSAL_DRAFT.md` e `ANEXO_III_EVIDENCE_MATRIX.md`. |

## Declaracao Unificada - Itens A Conferir

| Declaracao | Status | Observacao |
| --- | --- | --- |
| Nao possui servidores publicos do Poder Executivo Municipal em quadro decisorio | validar | Confirmar juridicamente. |
| Nao emprega menor em situacao vedada | validar | Declaracao padrao. |
| Recebeu documentos e conhece condicoes do edital | validar | Declaracao padrao. |
| Nao esta inidonea/impedida de contratar | validar | Conferir TCU/CNJ/Transparencia. |
| Disponibilidade para executar nos prazos/condicoes | validar | Depende da decisao comercial de preco e escopo. |
| Concorda com edital, TR e anexos | validar | Somente assinar apos revisar riscos de SLA/manutencao. |

## Ordem Sugerida Do Arquivo De Habilitacao

1. Indice.
2. Habilitacao juridica.
3. Regularidade fiscal/trabalhista.
4. Qualificacao economico-financeira.
5. Declaracao unificada.
6. Atestado de capacidade tecnica.
7. Proposta tecnica.
8. Proposta comercial.
9. Anexos tecnicos: matriz Anexo III, POC, SLA, treinamento, premissas WhatsApp.

## Checklist Final De Documentos Reais

Nao commitar estes documentos no repositorio. Conferir manualmente em pasta segura antes do upload.

| Documento real | Status esperado antes do envio | Bloqueante? | Observacao |
| --- | --- | --- | --- |
| Atestado tecnico assinado | pronto | Sim | Deve citar servico similar de atendimento digital/chatbot/omnichannel de forma comprovavel. |
| Certidao Federal/INSS/Divida Ativa | pronta e valida | Sim | Conferir data no dia do envio. |
| Certidao Estadual e Divida Ativa Estadual | pronta e valida | Sim | Conforme UF da sede. |
| Certidao Municipal da sede | pronta e valida | Sim | Incluir divida ativa quando exigido. |
| FGTS/CRF | pronta e valida | Sim | Conferir validade. |
| CNDT | pronta e valida | Sim | Conferir validade. |
| CNPJ | pronto | Sim | Emissao recente. |
| Contrato social/ato constitutivo | pronto | Sim | Deve comprovar poderes do assinante. |
| Documento dos socios/representante | pronto | Sim | Nao armazenar no Git. |
| Balanco/DEFIS/IRPJ/demonstracoes | pronto | Sim | Confirmar regime fiscal e exigencia aplicavel. |
| Certidao falencia/recuperacao | pronta e valida | Sim | Observar regra de prazo do edital. |
| Consulta TCU/CNJ/Portal da Transparencia | pronta e recente | Sim | Anexar evidencias da consulta. |
| SICAF/CRC, se aplicavel | validar | Nao, salvo exigencia final | CRC Sorriso aparenta facultativo, mas pode reduzir risco. |
| Declaracao unificada | pronta e assinada | Sim | Assinatura de representante com poderes. |
| Proposta tecnica | pronta | Sim | Usar matriz Anexo III e POC como anexos. |
| Proposta comercial | pronta | Sim | Valor mensal/global e validade preenchidos fora do Git. |

Conferencia final:

- documentos sem rasura e legiveis;
- validade vigente no dia do envio;
- nomes, CNPJ e poderes de assinatura consistentes;
- arquivo unico ou pacote aceito pela plataforma;
- indice seguindo a ordem do edital;
- nenhuma credencial, token, documento pessoal ou dado bancario incluido neste repositorio.

## Riscos De Habilitacao

| Risco | Impacto | Mitigacao |
| --- | --- | --- |
| Atestado nao mencionar chatbot/atendimento digital | Alto | Ajustar minuta para servico similar comprovavel. |
| Documentos fora de validade | Alto | Conferencia no dia anterior e no dia do envio. |
| Arquivo fora do formato aceito | Alto | Converter tudo para PDF e testar upload. |
| Declaracao com representante sem poderes | Alto | Conferir contrato social/procuracao. |
| CRC facultativo ausente | Baixo/medio | Avaliar emissao preventiva. |
| Divergencia manutencao presencial quinzenal vs TR corrigido | Medio | Registrar condicao comercial ou pedir esclarecimento. |
