# Playbook de Parametrizacao: Automacao + IA por Tenant

Use este roteiro para configurar novos clientes no CONVERTA/RE7ONLINE. O objetivo e transformar o conhecimento do negocio do cliente em parametros seguros para fluxo, IA, CRM, handoff, follow-up e campanhas.

Este playbook deve ser preenchido antes de liberar IA conversacional em producao.

## Principio

Global:

- estrutura da plataforma;
- seguranca;
- guardrails universais;
- linguagem neutra;
- limites tecnicos.

Tenant:

- dominio de negocio;
- vocabulario;
- tom de voz;
- temas permitidos;
- temas secundarios;
- criterios comerciais;
- mensagens;
- catalogo de intencoes;
- CRM.

Nunca reutilize vocabulario de um ramo em outro tenant. Um tenant de varejo nao deve herdar linguagem juridica; um tenant de seguros nao deve receber termos previdenciarios; um tenant governamental nao deve receber linguagem comercial.

## 1. Diagnostico do tenant

Levante:

- nome comercial;
- segmento principal;
- segmentos secundarios;
- publico-alvo;
- tipo de cliente atendido;
- regioes atendidas;
- horario de atendimento humano;
- canais de atendimento;
- servicos principais;
- servicos secundarios;
- servicos que nao atende;
- objetivos da automacao;
- principais duvidas;
- principais objeções;
- informacoes que o cliente normalmente precisa antes de decidir;
- riscos regulatorios, juridicos, medicos, financeiros ou de compliance;
- dados sensiveis que a IA nao deve pedir;
- quando encaminhar para humano;
- o que torna um lead quente, morno ou frio.

## 2. Modelos possiveis de uso

### Modelo A: fluxo estruturado + classificacao de intencao

Use quando:

- o atendimento precisa seguir menus;
- existem opcoes claras;
- a triagem deve ser padronizada;
- operadores precisam receber resumo muito estruturado.

Configuracao comum:

- Fluxo configuravel: ON
- Classificacao de intencao: ON
- IA controlada: OFF ou limitada

Vantagem: controle.

Risco: experiencia menos natural.

### Modelo B: IA controlada como entrada principal

Use quando:

- o tenant quer atendimento conversacional;
- ha contexto de negocio bem preenchido;
- as perguntas sao majoritariamente educativas, comerciais ou operacionais;
- o time humano assume casos especificos.

Configuracao comum:

- Fluxo configuravel: OFF
- Classificacao de intencao: OFF
- Base de IA: ON
- IA controlada: ON
- Fallback para handoff: ON

Vantagem: experiencia mais natural.

Risco: exige parametrizacao forte e revisao de respostas.

### Modelo C: hibrido profissional

Use quando:

- IA responde perguntas simples;
- fluxo trata jornadas especificas;
- classificador leva mensagens livres para pontos certos;
- humano assume casos concretos.

Configuracao comum:

- Fluxo configuravel: ON
- Classificacao de intencao: ON
- IA controlada: ON
- Fallback para handoff: ON

Vantagem: equilibrio entre controle e naturalidade.

Risco: precisa separar bem quando fluxo vence e quando IA responde.

### Modelo D: humano assistido

Use quando:

- ha alto risco regulatorio;
- IA nao deve conduzir muito;
- a prioridade e resumir e classificar o atendimento para o operador.

Configuracao comum:

- Fluxo configuravel: ON ou OFF
- IA controlada: OFF ou muito limitada
- Resumo/CRM: ON
- Handoff: ON

Vantagem: menor risco.

Risco: menor automacao.

### Modelo E: CRM + campanhas

Use quando:

- o tenant quer recuperar leads;
- existem situacoes comerciais claras;
- campanhas precisam ser segmentadas por interesse, temperatura e status.

Recursos associados:

- situacao do negocio;
- tags;
- lead_temp;
- prioridade;
- campanhas;
- templates;
- follow-up.

## 3. Campos de Automacao

### Fluxo configuravel

Sentido: ativa fluxos estruturados por tenant.

Use ON quando:

- ha menus;
- ha coleta guiada;
- ha triagem padronizada;
- o atendimento precisa de previsibilidade.

Use OFF quando:

- a IA deve conduzir a entrada;
- os menus ainda nao estao maduros;
- o tenant quer experiencia conversacional.

### Classificacao de intencao

Sentido: tenta entender mensagens livres e direcionar para fluxo/contexto.

Use ON quando:

- fluxos estao ativos;
- ha intencoes previsiveis;
- mensagens livres devem entrar no node correto.

Use OFF quando:

- a IA deve responder antes de menus;
- a classificacao estiver desviando perguntas educativas para fluxo indevido;
- a experiencia precisa ser mais natural.

### Base de IA do tenant

Sentido: libera os recursos de IA para o tenant. Nao deve ser ativada se a configuracao minima estiver incompleta.

Obrigatorio antes de ativar:

- contexto de negocio;
- temas permitidos;
- mensagem fallback;
- prompt de handoff.

### IA controlada

Sentido: permite que a IA responda duvidas simples, educativas, comerciais ou operacionais dentro dos limites do tenant.

Nao deve:

- prometer resultado;
- analisar caso concreto;
- pedir dados sensiveis;
- substituir humano;
- inventar servicos;
- usar vocabulario de outro tenant.

### Maximo por conversa

Sentido: limita respostas automaticas da IA por conversa.

Referencia:

- 2 a 3: conservador;
- 4 a 6: atendimento assistido medio;
- 8 a 10: triagem conversacional mais longa;
- acima disso exige maturidade operacional.

### Fallback para handoff

Sentido: permite recomendacao supervisionada de encaminhamento para humano.

Normalmente ON quando existe equipe humana para assumir leads.

### Notificacao interna de novo lead

Sentido: envia aviso privado para numeros internos quando o bot/IA encaminha um lead ao humano.

Definir:

- se ativa;
- numeros ativos;
- revezamento;
- rotina para manter janela WhatsApp aberta;
- formato do resumo;
- prioridade por tipo de lead.

### Follow-up automatico

Sentido: recontato automatico para leads parados ou oportunidades abertas.

Definir:

- quando enviar;
- quantas tentativas;
- intervalo;
- texto aprovado;
- quando bloquear follow-up.

## 4. Campos de IA

### Contexto de negocio da IA

E o campo mais importante. Deve ensinar a IA sobre o tenant.

Deve conter:

- quem e a empresa;
- o que faz;
- publico-alvo;
- servicos principais;
- servicos secundarios;
- limites;
- tom de voz;
- horario;
- quando encaminhar para humano;
- o que pode explicar;
- o que nao pode afirmar.

Modelo:

```text
O tenant [NOME] atua em [SEGMENTO]. Atende principalmente [PUBLICO]. Seus servicos principais sao [LISTA]. Tambem pode realizar triagem inicial sobre [SECUNDARIOS], mas esses assuntos devem ser encaminhados para a equipe quando exigirem analise especifica.

A IA deve usar tom [TOM], com respostas curtas, naturais e profissionais. Deve explicar conceitos gerais, orientar proximos passos e fazer no maximo uma pergunta por vez.

A IA nao deve prometer resultado, confirmar direito individual, calcular valores especificos, analisar documentos, solicitar dados sensiveis ou substituir a equipe humana.

Quando o cliente pedir atendimento humano, demonstrar urgencia, apresentar caso especifico, perguntar sobre valores individualizados ou sair do escopo automatico, a IA deve oferecer encaminhamento para uma pessoa da equipe.
```

### Instrucao adicional aprovada

Regras complementares obrigatorias.

Modelo:

```text
Responda de forma natural, objetiva e profissional.
Nao repita saudacao em toda mensagem.
Nao liste todos os servicos quando o cliente ja indicou um assunto.
Faca uma pergunta por vez.
Use o contexto recente da conversa para dar continuidade.
Nao invente servicos, prazos, valores ou garantias.
Nao solicite CPF, RG, documentos, laudos, dados bancarios ou dados sensiveis no atendimento automatico.
Quando houver caso especifico, baixa confianca, pedido de humano ou tema fora do escopo automatico, ofereca encaminhamento para uma pessoa da equipe.
```

### Temas permitidos para IA

Lista de assuntos que a IA pode responder de forma educativa, comercial ou operacional.

Inclua:

- termos tecnicos;
- termos leigos;
- sinonimos;
- erros comuns de digitacao;
- perguntas comerciais;
- perguntas de inicio de atendimento.

Formato recomendado:

```text
tema principal
sinonimo do tema
forma leiga usada pelo cliente
erro comum de digitacao
pergunta comercial relacionada
```

### Temas secundarios

Assuntos proximos ao negocio, mas que a IA nao deve responder em profundidade.

Comportamento esperado:

```text
Esse assunto pode ser atendido ou triado pela equipe, mas precisa de uma analise mais especifica. Posso direcionar voce para uma pessoa da equipe?
```

### Termos bloqueados

Assuntos que devem gerar guardrail ou handoff.

Inclua:

- dados pessoais;
- documentos;
- laudos;
- calculos individualizados;
- promessa de resultado;
- fraude;
- termos fora do escopo;
- pedidos de analise especifica;
- termos sensiveis do segmento.

### Palavras-chave de handoff

Inclua variacoes:

```text
atendente
humano
especialista
equipe
consultor
me liga
quero atendimento
quero contratar
preciso de ajuda
pode encaminhar
falar com alguem
nao entendi
meu caso e especifico
```

### Mensagem de boas-vindas da IA

Deve:

- acolher;
- apresentar o tenant;
- nao ser taxativa quando existem servicos secundarios;
- pedir ao cliente para dizer o que precisa.

Modelo curto:

```text
Ola! Seja bem-vindo(a) a [NOME]. Me diga em poucas palavras como posso te ajudar.
```

Modelo completo:

```text
Ola! Seja bem-vindo(a) a [NOME]. Nossa equipe atua principalmente com [SERVICOS PRINCIPAIS] e tambem pode fazer uma triagem inicial sobre [SECUNDARIOS], quando necessario. Me diga em poucas palavras como posso te ajudar.
```

### Mensagem fallback da IA

Usada quando a IA nao identifica o assunto.

Modelo:

```text
Nao consegui identificar bem o assunto. Voce pode me dizer em poucas palavras o que precisa?
```

### Prompt de handoff

Usado quando a IA recomenda humano.

Modelo:

```text
Esse ponto pode precisar de uma analise mais especifica. Posso encaminhar voce para uma pessoa da equipe?
```

## 5. Catalogo de intencoes da IA

Use JSON com intencoes operacionais.

Regras:

- nao usar demografia como intencao principal;
- nao usar ano isolado como topico principal;
- preferir servico/interesse;
- incluir frases reais;
- incluir erros comuns;
- incluir resposta curta;
- incluir proxima pergunta.

Modelo:

```json
[
  {
    "intent": "nome_operacional_da_intencao",
    "label": "Rotulo legivel",
    "examples": [
      "frase real do cliente",
      "forma abreviada",
      "erro comum de digitacao"
    ],
    "area": "area_do_negocio",
    "servico": "servico_ou_interesse",
    "lead_temp": "quente",
    "priority": "alta",
    "response": "Resposta curta, segura e contextual.",
    "next_question": "Pergunta de continuidade, uma por vez."
  }
]
```

## 6. CRM

### Area

Defina macroareas do tenant.

Exemplos:

- vendas;
- suporte;
- financeiro;
- pos-venda;
- juridico;
- previdenciario;
- seguros;
- educacao;
- governo.

### Servico

Defina interesses reais que o CRM deve registrar.

### Situacao do negocio

Sugestao base:

- novo_lead;
- em_triagem;
- atendimento_humano;
- aguardando_cliente;
- aguardando_documentos;
- proposta_enviada;
- negociacao;
- fechado;
- perdido;
- sem_interesse;
- retorno_futuro;
- fora_do_escopo.

### Temperatura

Quente:

- pediu humano;
- quer contratar;
- perguntou preco;
- pediu proximo passo;
- tem urgencia;
- trouxe caso concreto;
- confirmou interesse.

Morno:

- perguntou informacao geral;
- demonstrou interesse inicial;
- quer entender requisitos;
- ainda nao pediu atendimento.

Frio:

- curiosidade;
- mensagem vaga;
- fora de escopo;
- sem intencao clara.

### Prioridade

Alta:

- urgencia;
- prazo;
- risco;
- pedido humano;
- oportunidade clara.

Media:

- interesse real sem urgencia.

Baixa:

- duvida generica ou fora de escopo.

## 7. Follow-up

Defina:

- quais situacoes recebem follow-up;
- tempo do primeiro retorno;
- quantidade maxima;
- texto por situacao;
- bloqueios;
- quando virar campanha.

Modelo:

```text
Ola, [nome se disponivel]. Passando para saber se voce ainda deseja seguir com [assunto]. Posso te direcionar para a equipe ou tirar uma duvida geral por aqui.
```

## 8. Notificacao interna de novo lead

Defina:

- numeros recebedores;
- se ha revezamento;
- quem recebe leads urgentes;
- mensagem consolidada;
- criterios de prioridade.

Conteudo ideal da notificacao:

- tenant;
- lead;
- link wa.me;
- origem;
- area;
- servico/interesse;
- temperatura;
- prioridade;
- resumo;
- proximo passo.

Observacao: a notificacao interna nao deve enviar sugestao de resposta pronta. A recomendacao atual e enviar apenas resumo operacional, dados estruturados e proximo passo, para evitar poluir o atendimento humano e a timeline.

## 9. Checklist antes de ativar IA

- Contexto de negocio preenchido.
- Instrucao adicional aprovada.
- Temas permitidos revisados.
- Temas secundarios revisados.
- Termos bloqueados revisados.
- Palavras de handoff revisadas.
- Boas-vindas aprovada.
- Fallback aprovado.
- Prompt de handoff aprovado.
- Catalogo de intencoes validado.
- Criterios de CRM definidos.
- Limite de respostas da IA definido.
- Fluxo/classificador definidos como ON/OFF de forma coerente.
- Testes WhatsApp executados.
- Inbox conferido.
- CRM conferido.
- Handoff conferido.
- Follow-up conferido.

## 10. Prompt para gerar a parametrizacao de um novo tenant

Use o prompt abaixo em um chat de diagnostico do cliente:

```text
Voce e um consultor senior de automacao conversacional, CRM, atendimento via WhatsApp e desenho de IA multitenant.

Seu objetivo e entrevistar o responsavel pelo tenant, entender profundamente o negocio, o publico, os servicos, limites, riscos e tom de voz, e devolver uma configuracao completa para preencher a tela de Automacao + IA do CONVERTA/RE7ONLINE.

A plataforma possui:
- WhatsApp Agent multitenant;
- fluxo configuravel por tenant;
- classificador de intencao;
- IA conversacional controlada;
- guardrails;
- handoff supervisionado;
- CRM enriquecido por IA;
- memoria operacional resumida;
- follow-up automatico;
- notificacao interna de novo lead;
- campanhas;
- templates;
- inbox humano.

Regras:
- Seja especifico para o tenant.
- Nao use termos de outro segmento.
- Nao invente servicos.
- Nao prometa resultado.
- Nao solicite dados sensiveis.
- Prefira linguagem natural, curta e profissional.
- Entregue conteudo pronto para colar no CONVERTA.

Entregue:
1. Diagnostico do tenant
2. Estrategia recomendada de automacao
3. Flags ON/OFF recomendadas
4. Contexto de negocio da IA
5. Instrucao adicional aprovada
6. Temas permitidos
7. Temas secundarios
8. Termos bloqueados
9. Palavras-chave de handoff
10. Mensagem de boas-vindas
11. Mensagem fallback
12. Prompt de handoff
13. Catalogo de intencoes em JSON
14. Criterios de CRM
15. Criterios de lead quente/morno/frio
16. Situacoes do negocio recomendadas
17. Follow-up sugerido
18. Notificacao interna de novo lead
19. Riscos e limites
20. Checklist para revisar antes de ativar
```
