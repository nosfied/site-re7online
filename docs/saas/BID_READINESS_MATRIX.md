# Bid Readiness Matrix

Auditoria de habilitacao real para editais B2G analisados a partir dos PDFs enviados.

Fontes auditadas:

- Conselheiro Lafaiete/MG: `0082026EDITALDEPREGAOELETRONICOWHATSAPPCAC.pdf`
- Aripuana/MT: `ARIPUANA PREGAO+PRESENCIAL+N.+26-2026+-+PLATAFORMA+DIGITAL+(WHATS).PDF`

Status usados:

- **ATENDE**: requisito atendido pelo produto/processo atual ou requisito nao exigido pelo edital.
- **ATENDE COM AJUSTE**: atendivel, mas depende de documento, declaracao, parametrizacao, prova operacional, proposta tecnica ou ajuste pequeno.
- **NAO ATENDE**: exige desenvolvimento, fornecedor externo, infraestrutura nova ou evidencia inexistente hoje.

## Resumo Executivo

| Edital | Aderencia documental | Aderencia tecnica | Veredito |
| --- | ---: | ---: | --- |
| Conselheiro Lafaiete/MG | 72% | 61% | Competitivo com ajustes tecnicos e documentais |
| Aripuana/MT | 70% | 50% | Possivel, mas com risco maior por escala, mobile, storage e multiplos canais |

Principais pontos de atencao:

- Conselheiro Lafaiete exige solucao WhatsApp Business API oficial, multiatendimento, chatbot, relatorios, agendamento automatico, validacao por CPF, transcricao de audio, busca por palavras-chave e avaliacao de satisfacao.
- Aripuana exige plataforma SaaS com API oficial Meta, web e mobile Android/iOS, ate 400 usuarios simultaneos, ate 30 canais WhatsApp oficiais, ate 5 canais Instagram Direct, ate 600 GB de midias, 60.000 templates e implantacao presencial em 13 unidades.
- O Converta esta forte em WhatsApp oficial, inbox, multiatendimento, filas/setores, historico, CRM/timeline, relatorios, dashboard, campanhas/templates e governanca multi-tenant.
- Gaps relevantes: Telegram, webchat, NPS formal, OTP, agendamento nativo, transcricao de audio, busca textual avancada em dialogos, storage contratado de 600 GB, prova de escala 400 usuarios/30 canais e documentacao comercial de atestados/equipe.

## Conselheiro Lafaiete/MG

### Dados do Certame

| Item | Evidencia |
| --- | --- |
| Orgao | Camara Municipal de Conselheiro Lafaiete |
| Processo | PAL 046/2026 |
| Pregao | Eletronico 008/2026 |
| Criterio | Menor preco global |
| Objeto | SaaS para gestao de atendimento multiconferencia e multiatendimento via WhatsApp Business API, com agendamento automatizado, chatbot de triagem e relatorios metricos |
| Prazo inicial | Implantacao/configuracao em ate 10 dias da NAF; treinamento em ate 5 dias uteis apos inicio da operacao |
| Valor estimado | 12 meses x R$ 1.001,84 = R$ 12.022,08 |

### Habilitacao

| Requisito | Exigencia identificada | Status | Acao necessaria |
| --- | --- | --- | --- |
| Documentos juridicos | Registro comercial, ato constitutivo/estatuto/contrato social e poderes de administradores, conforme tipo societario | ATENDE COM AJUSTE | Separar contrato social consolidado, alteracoes e documentos dos representantes |
| ME/EPP/MEI | Participacao restrita a MEI/ME/EPP | ATENDE COM AJUSTE | Confirmar enquadramento fiscal da empresa concorrente e preparar declaracao LC 123 |
| Documentos fiscais | CNPJ/CPF, inscricao estadual ou municipal, regularidade federal, estadual, municipal, INSS/FGTS e trabalhista | ATENDE COM AJUSTE | Emitir certidoes atualizadas antes do envio |
| Economico-financeiro | Certidao negativa de falencia; balanco, DRE e demonstracoes dos dois ultimos exercicios | ATENDE COM AJUSTE | Validar balancos assinados e forma exigida pelo contador |
| Patrimonio liquido minimo | Nao localizado percentual minimo explicito no edital analisado | ATENDE | Manter balanco disponivel por cautela |
| Atestado tecnico | Minimo de 1 atestado de capacidade tecnica compativel | ATENDE COM AJUSTE | Reunir atestado de atendimento digital/WhatsApp/SaaS em nome da empresa |
| API oficial Meta | Declaracao de uso da API oficial WhatsApp, com mencao a Meta Business Partner | ATENDE COM AJUSTE | Preparar declaracao tecnica. Se exigirem BSP formal, validar parceiro/credencial |
| Parceiro BSP | Nao ha clausula autonoma clara, mas ha expressao "meta Business Partner" | ATENDE COM AJUSTE | Pedir esclarecimento ou apresentar uso oficial Cloud API Meta + evidencias |
| POC | Nao localizada exigencia de POC | ATENDE | Sem acao |
| Visita tecnica | Nao localizada exigencia de visita tecnica | ATENDE | Sem acao |
| Garantia contratual | Edital informa que nao havera exigencia de garantia | ATENDE | Sem acao |
| Equipe tecnica | Suporte e treinamento exigidos, sem equipe nominal complexa | ATENDE COM AJUSTE | Preparar declaracao de equipe/suporte, responsaveis e SLA |

### Aderencia Tecnica

| Requisito | Status | Observacao |
| --- | --- | --- |
| WhatsApp Oficial / WABA | ATENDE | Converta opera com API oficial Meta/WhatsApp, sem QR Code/browser extension |
| Inbox multiatendente | ATENDE | Modulo de inbox, atribuicao e operadores ja existe |
| Handoff humano | ATENDE | Fluxo humano e devolucao/finalizacao existem |
| Filas/setores | ATENDE | Departments/setores e atendimento geral existem |
| Usuarios/permissoes | ATENDE | Usuarios, RBAC e sessao existem |
| Historico integral | ATENDE | Timeline/conversas persistidas existem |
| CRM/timeline | ATENDE | CRM e timeline operacional existem |
| Chatbot de triagem | ATENDE | Automacao configuravel existe |
| IA | ATENDE | IA por tenant existe, com configuracao DB-first |
| Agendamento automatico | NAO ATENDE | Exige modulo especifico de agendamento/agenda |
| Confirmacao automatica e lembretes | NAO ATENDE | Pode ser desenvolvido sobre templates/campaigns, mas nao esta pronto como agenda |
| Validacao por CPF | ATENDE COM AJUSTE | Pode ser configurado como coleta/validacao simples, mas nao ha modulo dedicado auditado |
| Relatorios metricos | ATENDE | Reports e dashboard existem |
| SLA/tempo de resposta | ATENDE | Metricas e SLA existem parcialmente/operacionalmente |
| Avaliacao de satisfacao/NPS | NAO ATENDE | NPS formal ainda nao existe |
| LGPD/seguranca | ATENDE COM AJUSTE | Retencao/LGPD e redaction existem; preparar documento tecnico de seguranca |
| Transcricao de audio | NAO ATENDE | Nao localizado modulo de transcricao |
| Busca por palavras-chave no dialogo | NAO ATENDE | Busca textual avancada nao esta formalizada como requisito de edital |
| Suporte em portugues | ATENDE COM AJUSTE | Depende de material operacional e SLA comercial |
| Treinamento | ATENDE COM AJUSTE | Preparar plano de treinamento e registros |

### Gaps para Competitividade

1. Modulo de agendamento com calendario, confirmacao e lembretes.
2. Pesquisa de satisfacao/NPS.
3. Transcricao de audio e busca avancada em historico.
4. Dossie tecnico de API oficial Meta e, se necessario, esclarecimento sobre BSP.
5. Atestado tecnico compativel.

## Aripuana/MT

### Dados do Certame

| Item | Evidencia |
| --- | --- |
| Orgao | Prefeitura Municipal de Aripuana/MT |
| Modalidade | Pregao Presencial para plataforma digital WhatsApp |
| Criterio | Menor preco global |
| Objeto | Plataforma SaaS de gestao de atendimento ao cidadao via aplicativo de mensagens, com API oficial Meta, web/mobile, suporte, manutencao e treinamento |
| Escala | 13 secretarias/unidades, 12 meses, 156 unidades mensais de licenciamento |
| Valor estimado | R$ 223.000,02 |
| Itens | Licenciamento R$ 156.000,00; 60.000 templates R$ 48.000,00; implantacao/treinamento R$ 19.000,02 |

### Habilitacao

| Requisito | Exigencia identificada | Status | Acao necessaria |
| --- | --- | --- | --- |
| Documentos juridicos | RG/registro empresarial/CCMEI/contrato social/estatuto/atos de administrador conforme tipo societario | ATENDE COM AJUSTE | Preparar pacote societario completo |
| Documentos fiscais | CPF/CNPJ, federal, FGTS, trabalhista, inscricao estadual/municipal e regularidade estadual/municipal | ATENDE COM AJUSTE | Emitir certidoes atualizadas |
| Economico-financeiro | Certidao negativa de falencia/insolvencia; balanco, DRE e demonstracoes dos 2 ultimos exercicios | ATENDE COM AJUSTE | Validar balanco e forma legal |
| Indices contabeis | LG, LC e SG superiores a 1 | ATENDE COM AJUSTE | Calcular e anexar declaracao do contador |
| Patrimonio liquido | Se indice <= 1, PL minimo de 5% do valor estimado | ATENDE COM AJUSTE | Valor de referencia aproximado: R$ 11.150,01 |
| Atestados tecnicos | Atestados de plataforma web/sistema informatizado multiusuario, atendimento publico/comunicacao digital e servico continuado com suporte/manutencao | ATENDE COM AJUSTE | Separar atestados e contratos de referencia compativeis |
| Quantitativos minimos | Ate 400 usuarios simultaneos, 30 canais WhatsApp, 5 Instagram Direct, 600 GB midia, 60.000 templates | ATENDE COM AJUSTE | Exige prova tecnica/infraestrutura; 600 GB e escala precisam plano formal |
| API oficial Meta | Exigida API oficial Meta | ATENDE | Converta opera com API oficial |
| Parceiro BSP | Nao localizado como exigencia autonoma | ATENDE | Sem acao especifica, manter evidencias Meta oficiais |
| POC | Nao localizada exigencia de POC | ATENDE | Sem acao |
| Visita tecnica | Nao ha visita obrigatoria; ha declaracao de conhecimento das condicoes locais | ATENDE COM AJUSTE | Assinar declaracao prevista |
| Garantia contratual | Ha conflito: edital indica sem garantia, TR/minuta mencionam garantia | ATENDE COM AJUSTE | Pedir esclarecimento formal; preparar plano de seguro-garantia/caucao se mantido |
| Equipe tecnica | Nao exige conselho profissional, mas exige responsavel/declaracoes e suporte | ATENDE COM AJUSTE | Preparar equipe, curriculos, suporte e plano de atendimento |

### Aderencia Tecnica

| Requisito | Status | Observacao |
| --- | --- | --- |
| API oficial Meta/WhatsApp | ATENDE | Aderente ao core atual |
| Plataforma web SaaS | ATENDE | Aplicacao web operacional |
| App mobile Android/iOS | ATENDE COM AJUSTE | Experiencia mobile/PWA existe; se exigirem app nativo de loja, nao atende sem ajuste |
| Ate 400 usuarios simultaneos | ATENDE COM AJUSTE | Precisa teste de carga e dimensionamento de infra |
| Ate 30 canais WhatsApp oficiais | ATENDE COM AJUSTE | Arquitetura multi-tenant/multicanal existe, mas precisa prova e configuracao especifica |
| Ate 5 Instagram Direct | ATENDE COM AJUSTE | Instagram inbound/outbound manual foi validado; exige configuracao/review por contas |
| Ate 600 GB midia | NAO ATENDE | Requer storage contratado, politica de retencao e custo especifico |
| 60.000 templates | ATENDE COM AJUSTE | Campanhas/templates existem; precisa validar throughput, aprovacao Meta e custos |
| Inbox multiatendente | ATENDE | Core funcional |
| Filas e historico | ATENDE | Core funcional |
| Relatorios e monitoramento | ATENDE | Reports/dashboard existem |
| Dashboard | ATENDE | Disponivel |
| SLA | ATENDE | Existe base de SLA/relatorios, pode exigir parametrizacao |
| CRM/timeline | ATENDE | Disponivel |
| Chatbot/automacao | ATENDE | Disponivel |
| IA | ATENDE | Disponivel, tenant-scoped |
| LGPD/retenção | ATENDE COM AJUSTE | Documentar politica e parametrizar retencao |
| Treinamento presencial in loco | ATENDE COM AJUSTE | Depende de logistica e material formal |
| Ambiente online de aprendizagem | NAO ATENDE | Nao localizado LMS/ambiente EAD proprio |
| Suporte e manutencao continuada | ATENDE COM AJUSTE | Exige SLA comercial/documental |
| API para integracao externa | ATENDE COM AJUSTE | Existem APIs internas; API publica/documentada para terceiros precisa dossie |
| Telegram | NAO ATENDE | Nao implementado |
| Webchat | NAO ATENDE | Nao implementado |
| NPS/satisfacao | NAO ATENDE | NPS formal nao implementado |
| OTP | NAO ATENDE | Nao implementado como modulo licitatorio |

### Gaps para Competitividade

1. Plano formal de escala para 400 usuarios, 30 WhatsApp e 5 Instagram.
2. Storage de midia de 600 GB com custo, retencao e backup.
3. Evidencia de app mobile: PWA pode ser insuficiente se o edital exigir app nativo Android/iOS.
4. Ambiente online de aprendizagem.
5. Pacote de atestados tecnicos com escopo equivalente.
6. Esclarecimento sobre garantia contratual, pois ha conflito interno no edital.

## Matriz Consolidada de Requisitos

| Requisito | Conselheiro Lafaiete | Aripuana | Observacao |
| --- | --- | --- | --- |
| Documentos juridicos | ATENDE COM AJUSTE | ATENDE COM AJUSTE | Depende do pacote societario atualizado |
| Documentos fiscais | ATENDE COM AJUSTE | ATENDE COM AJUSTE | Certidoes devem ser emitidas perto da disputa |
| Economico-financeiros | ATENDE COM AJUSTE | ATENDE COM AJUSTE | Ambos exigem balanco; Aripuana exige indices |
| Atestados tecnicos | ATENDE COM AJUSTE | ATENDE COM AJUSTE | Item mais importante para habilitacao tecnica |
| Quantitativos minimos | ATENDE COM AJUSTE | ATENDE COM AJUSTE | Aripuana e mais pesada por escala/storage |
| API oficial Meta | ATENDE | ATENDE | Manter evidencias de Cloud API/Meta |
| Parceiro BSP | ATENDE COM AJUSTE | ATENDE | Conselheiro tem redacao que pode gerar duvida |
| POC | ATENDE | ATENDE | Nao localizada exigencia formal nos PDFs |
| Visita tecnica | ATENDE | ATENDE COM AJUSTE | Aripuana exige declaracao de conhecimento |
| Garantia contratual | ATENDE | ATENDE COM AJUSTE | Aripuana tem conflito interno |
| Balanco | ATENDE COM AJUSTE | ATENDE COM AJUSTE | Necessario contador |
| Patrimonio liquido | ATENDE | ATENDE COM AJUSTE | Aripuana exige PL se indices <= 1 |
| Equipe tecnica | ATENDE COM AJUSTE | ATENDE COM AJUSTE | Preparar organograma e suporte |
| Relatorios | ATENDE | ATENDE | Produto ja possui base |
| SLA | ATENDE | ATENDE | Requer parametrizacao e demonstracao |
| Dashboard | ATENDE | ATENDE | Produto possui dashboard |
| NPS/satisfacao | NAO ATENDE | NAO ATENDE | Sprint futura recomendada |
| OTP/CPF validacao forte | ATENDE COM AJUSTE | NAO ATENDE | CPF simples pode ser configurado; OTP nao existe |
| Integracoes API | ATENDE COM AJUSTE | ATENDE COM AJUSTE | Precisa documentacao externa/publica |
| Telegram | NAO ATENDE | NAO ATENDE | Fora do produto atual |
| Webchat | NAO ATENDE | NAO ATENDE | Fora do produto atual |
| Multiagentes IA | ATENDE COM AJUSTE | ATENDE COM AJUSTE | IA tenant-scoped existe; "3 agentes" exigiria empacotamento/UX |
| POC/demo | ATENDE COM AJUSTE | ATENDE COM AJUSTE | Produto demo existe, mas roteiro licitatorio deve ser preparado |

## Roadmap Recomendado

### Prioridade 1 - Habilitacao comercial/documental

1. Montar dossie societario, fiscal e trabalhista.
2. Preparar balanco/indices e declaracao contábil.
3. Coletar atestados tecnicos compativeis com WhatsApp/SaaS/multiatendimento.
4. Criar declaracao tecnica de API oficial Meta e vedacao a QR Code/browser extension.
5. Criar organograma de suporte, SLA e treinamento.

### Prioridade 2 - Gaps tecnicos recorrentes

1. NPS/pesquisa de satisfacao.
2. Agendamento com calendario e lembretes.
3. API publica/documentada para integracao externa.
4. Dossie de LGPD, retencao, criptografia e auditoria.
5. Plano de escala para usuarios/canais/templates.

### Prioridade 3 - Gaps que exigem produto novo

1. Webchat.
2. Telegram.
3. OTP.
4. Transcricao de audio e busca avancada.
5. Ambiente EAD/treinamento online.
6. Storage de midia contratado em escala licitatoria.

## Veredito

Conselheiro Lafaiete e o edital mais proximo do Converta atual, mas ainda exige ajustes claros em agendamento, satisfacao, transcricao/busca e dossie documental.

Aripuana e viavel apenas com proposta tecnica bem controlada e plano de infraestrutura, porque a exigencia de escala, storage, mobile e multiplos canais e maior. O maior risco nao e o core de atendimento, mas sim evidenciar capacidade operacional e cumprir quantitativos sem improviso.
