# Converta Operator Guide

Status: guia operacional para uso interno e treinamento. Este documento não altera produto, dados ou configuração.

## Princípios

- Trabalhe sempre dentro da organização correta.
- Use o Inbox como ponto central da operação.
- Assuma a conversa antes de responder quando o fluxo exigir.
- Verifique canal, janela de atendimento e bloqueios antes de iniciar contato ativo.
- Use modelos aprovados quando a janela livre estiver fechada.
- Use mensagens prontas apenas como texto operacional, não como modelo Meta.
- Não tente contornar bloqueios LGPD, opt-out ou permissão.

## Linguagem operacional

A interface operacional deve priorizar termos simples para quem atende:

| Termo tecnico | Texto para operador |
| --- | --- |
| Inbox | Caixa de entrada |
| Dashboard | Painel |
| Reports | Relatórios |
| Settings | Configurações |
| Template | Modelo aprovado ou modelo de mensagem |
| Template Meta | Modelo aprovado pela Meta |
| Canned reply | Mensagem pronta |
| Webchat | Chat do site |
| Webhook | Integração de recebimento |
| Status | Situação |
| Status da conversa | Situação do atendimento |
| Timeline | Histórico |
| Session | Sessão |
| Last seen | Última atividade observada |
| Duration | Duração observada |
| Login | Entrada |
| Logout | Saída |
| MFA / TOTP | Verificação em duas etapas ou aplicativo autenticador |
| Recovery codes | Códigos de recuperação |
| API key | Chave de integração |
| Claim | Assumir atendimento |
| Assignment | Responsável ou atribuição |
| Queue assignment | Distribuição de atendimentos |
| Round-robin | Distribuição alternada |
| Least active | Menor carga |
| Tenant | Organização ou cliente |
| Channel | Canal |
| ChannelAccount | Canal configurado |
| Provider | Provedor |
| Token | Acesso ou credencial mascarada |
| Payload | Conteúdo técnico sanitizado |
| Endpoint | URL de integração |
| Lead sem cadastro completo | Contato |
| Lead | Contato ou cadastro |
| Campaign | Campanha |
| Audience | Público |
| Recipient | Destinatario |
| Opt-out | Bloqueado para comunicações |
| Source | Origem |
| MFA | Verificação em duas etapas |

Os nomes técnicos continuam válidos em código, eventos, APIs, logs sanitizados e documentação técnica. A troca acima vale para rótulos, avisos, botões, mensagens vazias e erros vistos pelo operador.

## Inbox

No Inbox, o operador deve:

1. selecionar a conversa;
2. conferir canal, status, fila/departamento e responsavel;
3. assumir quando necessario;
4. responder por texto livre somente quando o canal permitir;
5. usar modelo aprovado quando o WhatsApp estiver fora da janela livre;
6. usar mensagem pronta apenas para acelerar texto dentro da regra do canal.

Conversas com dados anonimizados não devem aparecer no uso normal. Se um contato tiver sido minimizado por LGPD, não se deve tentar restaurar nome, número, histórico ou contexto anterior.

## Painel

Em `Painel`, ADMIN e SUPERVISOR podem acompanhar a presenca operacional atual da equipe.

A secao `Presenca da equipe` usa a mesma fonte da distribuicao automatica: o atendente so aparece como `Online` quando marcou disponibilidade e possui heartbeat recente dentro do TTL operacional atual. Sessao autenticada ativa, por si so, nao significa presenca online.

ADMIN visualiza os atendentes e supervisores ativos do tenant. SUPERVISOR visualiza apenas usuarios dos setores em que possui escopo operacional. A carga `Atendimentos ativos` usa os atendimentos atribuidos em `IN_PROGRESS` e `WAITING`, preservando o mesmo recorte operacional usado para limite de carga.

Esta visao e operacional e quase em tempo real. Ela nao e relatorio historico, controle de ponto, jornada de trabalho ou comprovacao de produtividade.

## Configuração de filas e visibilidade

ADMIN pode ajustar as regras operacionais publicadas sem instalação local, pacote por tenant ou deploy específico. Depois de uma nova versão do frontend, use F5/reload normal do navegador antes de validar a tela.

Checklist recomendado:

1. Entrar como ADMIN na organização correta.
2. Abrir `Configurações > Filas`.
3. Escolher a policy: manual, distribuição alternada ou menor carga.
4. Configurar disponibilidade obrigatória, capacidade e inclusão de supervisores conforme a operação.
5. Salvar e revisar o estado exibido.
6. Abrir `Configurações > Atendimento`.
7. Escolher a política de visibilidade do Inbox: compartilhada ou individual após atribuição.
8. Salvar.
9. Orientar AGENTs a ajustarem Disponível/Indisponível.
10. Fazer smoke com uma conversa controlada.
11. Validar a visão de SUPERVISOR e ADMIN.

SUPERVISOR pode consultar a configuração de filas quando autorizado, mas a escrita administrativa é de ADMIN. AGENT não acessa a configuração administrativa.

Smoke mínimo após mudança de fila ou visibilidade:

- conversa em espera compartilhada aparece para agentes elegíveis;
- atribuição direciona conversa, dot/som/read-state ao responsável esperado;
- transferência para usuário troca a visibilidade corretamente;
- devolução para fila volta ao compartilhado quando sem responsável;
- transferência de setor respeita a audiência do novo setor;
- F5 não muda o resultado de visibilidade;
- conversa fechada permanece visível para quem participou quando a política permitir;
- SUPERVISOR e ADMIN preservam a visão esperada;
- saúde do canal está operacional antes do teste real.

## Criador guiado de fluxos

No Guided Builder 2.4 local, o encaminhamento humano deve ser explicado como
escolha de setor. A fila e um mecanismo operacional interno: quando o setor tem
uma unica fila ativa, a plataforma resolve essa fila sem mostrar campo de fila
ao usuario. Quando o setor nao tem fila, o criador bloqueia a geracao com
"Este setor ainda não está preparado para receber atendimentos.". Somente setores
com mais de uma fila mostram o seletor `Fila`, como caso excepcional.

Perguntas guiadas devem ter pergunta, tipo de resposta e proximo passo. O
criador permite ate 3 perguntas consecutivas; depois disso o proximo passo deve
ser mensagem, menu/submenu, atendimento humano, encerramento ou retorno ao menu.
Condicionais por resposta capturada ainda nao fazem parte do runtime publicado e
nao devem ser ensinadas como funcionalidade disponivel.

A etapa final "Revisar antes de aplicar" pode resumir o caminho humano mais
relevante quando houver handoff. O resumo completo por opcao, submenu e caminho
esta classificado como backlog de UX do Guided Builder, sem mudanca de runtime
ou de `ChatbotFlow.definition`.

## Suporte da plataforma

ADMIN e SUPERVISOR podem abrir e acompanhar suporte da plataforma em `Suporte`. O fluxo cria ou retoma uma `Conversation` no tenant de suporte configurado pela plataforma, com protocolo normal do Converta. Não existe módulo paralelo de ticket ou case.

Cada usuário vê seus próprios chamados no MVP. Se já houver chamado ativo para o mesmo tenant e usuário, a tela retoma a conversa ativa; se o chamado anterior foi encerrado, uma nova abertura cria outra conversa. O destino do suporte é resolvido pelo backend via `PLATFORM_SUPPORT_TENANT_KEY`; a interface não escolhe tenant, WABA, telefone ou `clientId` de destino.

O tenant de suporte pode ter roteamento próprio em `TenantOperationalConfig.config.supportChannel`, apontando para um `chatbotFlowId` ativo do mesmo tenant e, opcionalmente, departamento/fila. Sem fluxo dedicado válido, o chamado entra em modo humano na fila configurada ou na fila operacional padrão; o `entryPoint` geral do tenant só deve ser usado se isso for explicitamente configurado.

O suporte aceita texto e prints/imagens enviados pelo solicitante. Use `Anexar imagem` ou cole um print no campo da conversa. O MVP permite uma imagem por envio, nos formatos PNG, JPEG/JPG ou WebP, ate 8 MB, com legenda opcional. Envie varias mensagens sucessivas se precisar anexar mais de uma evidencia.

A conversa aparece para a equipe da plataforma no Inbox do tenant de suporte, usando identidade sintética e rótulo seguro com tenant e usuário solicitante. Não copie telefone, email, token, SID, IP ou dados de CRM do tenant origem para o atendimento. Evite anexar prints com credenciais, tokens, dados bancários ou informações pessoais além do necessário para diagnóstico.

O operador do suporte visualiza a imagem no Inbox e responde por texto. Envio de imagem do suporte para o cliente ainda não faz parte desta etapa.

## Treinamentos

Todos os usuarios autenticados podem acessar `Suporte > Treinamentos`. A area exibe materiais oficiais publicados pela equipe da plataforma, separados por tema, como videos curtos e guias em PDF. O conteudo e somente leitura.

O catalogo de treinamentos e administrado no console interno da RE7ONLINE em `/admin/training`. A equipe autorizada pode criar, editar, publicar, despublicar, ordenar, visualizar, substituir arquivo e excluir conteudos sem SSH, Git ou deploy. A interface nunca envia caminho de arquivo. O backend resolve o material por `contentId` dentro do diretorio configurado por `TRAINING_CONTENT_ROOT`, bloqueia paths arbitrarios e entrega apenas formatos permitidos, como MP4 e PDF.

Quando o storage não estiver configurado ou o arquivo ainda não estiver publicado, a tela mostra uma mensagem amigável e não quebra a navegação do operador.

Para publicar material novo, a equipe interna usa `Admin > Treinamentos > Adicionar treinamento`, informa metadados, envia PDF ou MP4 e publica explicitamente. Arquivos grandes de vídeo ou PDF não devem ser commitados no repositório.

## Texto livre, modelo aprovado e mensagem pronta

| Recurso | Quando usar | Limite principal |
| --- | --- | --- |
| Texto livre | Atendimento receptivo com janela aberta | Bloqueado quando a janela estiver fechada. |
| Modelo aprovado | Inicio ativo ou recontato permitido pelo WhatsApp | Exige modelo aprovado, ativo no Converta e variaveis preenchidas. |
| Mensagem pronta | Respostas repetitivas dentro da operação | Não é modelo Meta e não abre janela fechada. |

Quando a interface indicar janela fechada, use modelo aprovado. Não use mensagem pronta como alternativa para burlar a regra.

## Marcar mensagem como referencia

No Inbox, use o menu de acoes da mensagem para selecionar `Marcar mensagem` e transformar uma mensagem anterior em referencia contextual da proxima resposta. Use quando a nova comunicacao depende de uma pergunta, documento, imagem, audio, modelo ou informacao ja enviada na conversa.

Marcar não define a intenção da nova mensagem. O operador escreve livremente e pode usar a referência para responder, corrigir, complementar ou esclarecer. O Converta não adiciona prefixos automáticos como resposta ou retificação.

Ao clicar no bloco de `Referência` em uma mensagem enviada com marcação, o histórico tenta rolar até a mensagem original e destaca a bolha correspondente. Se a mensagem original não estiver carregada no histórico atual, a interface informa que a referência não está disponível naquele momento.

Editar mensagem original não faz parte do fluxo operacional. Quando houver erro em uma comunicação já enviada, envie uma nova mensagem clara usando essa marcação, sem tentar modificar o registro anterior.

Os balões priorizam conteúdo, horário, situação, interlocutor discreto e referências. O canal da conversa fica no contexto do atendimento e não é repetido em cada mensagem.

## Modelos aprovados

Antes de enviar um modelo:

- confira nome, categoria e idioma;
- preencha variaveis com dados neutros e corretos;
- revise a previa renderizada;
- leia a estimativa de custo quando exibida;
- confirme somente quando o destinatario e o contexto estiverem corretos.

A cobrança depende de categoria, país, entrega e política vigente da Meta. A previsão local é apoio operacional, não demonstrativo oficial.

## Mensagens prontas

Mensagens prontas ficam em `Modelos de mensagem`, em secao separada dos modelos Meta. ADMIN/SUPERVISOR podem criar, editar, inativar e reativar. Agentes usam apenas mensagens ativas.

No Inbox:

- a acao `Prontas` abre a lista;
- inserir no campo não envia automaticamente;
- o envio exige clique explicito;
- com janela fechada, a interface orienta usar modelo aprovado.

## Assinatura do atendente

Em `Configurações > Atendimento`, administradores podem ativar a assinatura do atendente por organização. Por padrão, ela fica desativada.

Quando ativa, mensagens humanas de texto e mensagens prontas enviadas pelo Inbox recebem o nome profissional do atendente no inicio do texto enviado ao cliente:

```text
*Maria*
Ola, como posso ajudar?
```

Essa assinatura faz parte da mesma mensagem enviada pelo WhatsApp. Ela não cria mensagem adicional, não altera mensagens antigas e não se aplica automaticamente a modelos Meta, bot, automações ou campanhas.

O nome do atendente é dado pessoal. Use apenas o nome profissional cadastrado e ative o recurso conforme a política operacional da organização.

## Campanhas

Campanhas devem seguir o fluxo seguro:

1. gerar previa de audiencia;
2. revisar elegiveis e bloqueados;
3. mapear variaveis do modelo;
4. criar rascunho;
5. revisar o rascunho;
6. enviar apenas por acao explicita.

Rascunho não dispara mensagem. Bloqueios por opt-out, contato anonimizado, duplicidade, canal incompatível ou ausência de WhatsApp válido devem ser respeitados.

## Opt-out e bloqueio de envio ativo

Bloqueio de envio ativo impede campanhas, modelos e contatos iniciados pela empresa. Ele não apaga histórico e não impede atendimento receptivo quando permitido pelo canal.

Se um contato solicitar descadastro, registre o bloqueio pelo fluxo operacional disponivel. A liberacao deve ocorrer apenas quando houver justificativa operacional e autorizacao adequada.

## Anonimizacao

Anonimização remove o registro da operação visível e minimiza dados pessoais. Não é inativação simples, não é opt-out e não é hard delete.

O operador não deve:

- tentar recriar dados antigos manualmente;
- copiar informacoes de conversas antigas anonimizadas;
- usar campanha ou template para reidratar contato;
- abrir excecao sem orientacao de privacidade.

## Custos Meta

O Converta exibe estimativas para apoiar decisão operacional. Use essas informações para evitar disparos desnecessários, revisar categoria de modelo e controlar volume por organização.

O operador não deve prometer valor definitivo ao cliente final com base apenas na previsão local.

## Central de Relatorios

Em `Relatorios`, os filtros globais de periodo, canal, atendente, setor e deduplicacao ficam no topo e afetam as abas operacionais de conversas, SLA e atendentes. A aba `Visao geral` resume o recorte atual sem alterar as formulas existentes.

As abas disponíveis são:

- `Visao geral`: indicadores principais do periodo selecionado.
- `Conversas`: volume por canal, setor, atendimentos concluidos por setor e amostra de protocolos.
- `SLA`: tempos e risco operacional calculados pelas metricas existentes.
- `Atendentes`: separa mensagens humanas enviadas, conversas atribuidas e atendimentos concluidos.
- `Acessos/Sessoes`: auditoria de autenticacao com filtros locais proprios.
- `Exportacoes`: CSV de conversas, CSV de atendimentos concluidos, CSV de sessoes e impressao/PDF consolidado.

Os filtros de `Acessos/Sessões` são locais dessa aba e não alteram o recorte global das conversas.

O PDF gerado em `Exportações` é um relatório gerencial agregado: identifica organização, período, filtros aplicados, data/hora de geração, resumo executivo, conversas, SLA, atendentes e resumo de acessos/sessões. Ele não substitui os CSVs quando a necessidade for auditoria linha a linha ou conferência detalhada.

## Relatorio Acessos/Sessoes

Em `Relatórios`, a seção `Acessos/Sessões` mostra trilha operacional de autenticação por organização. Ela usa sessões observadas pela aplicação e permite consultar login, logout explícito, substituição de sessão, renovação, expiração e última atividade observada.

As sessões do Converta possuem validade absoluta de 12 horas. No último minuto, a interface solicita renovação explícita com `Continuar conectado`; essa ação encerra a sessão atual como `Renovada` e cria uma nova sessão com mais 12 horas. Não existe renovação automática por atividade: atividade e `lastSeenAt` não estendem a sessão automaticamente.

Esta seção não é controle de ponto, folha de ponto, jornada de trabalho ou comprovação de presença laboral. Fechar navegador, desligar computador ou perder internet não gera logout determinístico. Quando uma sessão vence sem requisição posterior, o relatório pode exibi-la como `Expirada`, sem preencher logout artificialmente.

Campos principais:

- `Login`: quando a sessao foi criada.
- `Encerramento`: quando houve revogacao deterministica, como logout explicito.
- `Motivo`: humanizacao do motivo tecnico real, sem transformar tudo em logout.
- `Duracao observada`: calculada somente quando login e encerramento existem.
- `Última atividade observada`: atividade autenticada vista pela aplicação, não presença online.

O CSV segue a mesma minimização da tela: não exporta token, IP bruto, hash de IP, user agent, fingerprint ou identificadores de dispositivo.

## Relatório Atividade dos atendentes

Em `Relatórios`, a seção `Atividade dos atendentes` conta mensagens enviadas por humanos no período selecionado. A fonte é a autoria persistida no momento do envio em `OutboundMessage.rawPayload.actor.userId`.

Essa métrica não conta bot, automação, campanha, mensagem pronta sem autoria preservada ou histórico antigo sem ator. Mensagens históricas anteriores à captura de autoria podem não ser atribuíveis.

A seção `Conversas atribuídas por atendente` tem outro significado: ela mede distribuição operacional de conversas por `ConversationRuntimeState` e `ConversationAssignment`. Não use essa seção como produtividade individual nem como substituto de mensagens realmente enviadas.

## Relatorio Atendimentos concluidos

Em `Relatorios`, `Atendimentos concluidos` conta ciclos/protocolos encerrados a partir de `CompletedServiceSnapshot`. A data do relatorio e sempre o momento do fechamento (`closedAt`), nao a data de abertura da conversa.

Cada linha de snapshot corresponde a um atendimento concluido. Se a mesma conversa tiver dois ciclos/protocolos encerrados, o relatorio conta dois atendimentos. A atribuicao por atendente e setor usa o responsavel e o setor registrados no momento do fechamento; mudancas posteriores na conversa nao reatribuem o historico.

Quando o fechamento nao possui atendente ou setor, a contagem aparece em `Sem atendente` ou `Sem setor`. Se um usuario ou setor for removido depois, a contagem permanece com rotulo de entidade removida.

O historico comeca no primeiro fechamento registrado nesse formato. Quando nao houver snapshots para a organizacao, a tela mostra que o indicador ainda nao possui historico disponivel em vez de sugerir que periodos antigos tiveram zero atendimentos.

## O que não fazer

- Não enviar campanhas sem revisar audiência.
- Não clicar em `Enviar campanha` durante smoke ou treinamento.
- Não submeter modelo à Meta sem revisão interna.
- Não alterar credenciais ou canais sem autorização.
- Não registrar dados pessoais em campos de observação quando não for necessário.
- Não usar mensagens prontas para contornar janela fechada.
- Não tentar restaurar contato anonimizado.
