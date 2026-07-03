# Boa Esperanca do Norte/MT - Demo Tenant E POC Rehearsal

Fonte: Sprint 84D.

Este documento descreve a preparacao operacional de um tenant tecnico de demonstracao para a POC da Concorrencia Eletronica no 001/2026.

Nao contem dados reais de cidadaos, credenciais reais, documentos pessoais ou segredos. O tenant e especifico para demonstracao e nao altera o Core do Converta Platform.

## Objetivo

Preparar uma POC reproduzivel com:

- departamentos e filas;
- usuarios demo;
- fluxo inicial de chatbot;
- Webchat demonstrativo;
- base de conhecimento institucional ficticia;
- API externa simulada;
- conversas ficticias para Inbox e Timeline;
- metricas/relatorios com dados demonstrativos.

## Tenant Tecnico

| Campo | Valor |
| --- | --- |
| clientKey | `boa-esperanca-poc` |
| Nome | `Boa Esperanca POC` |
| Profile | `government` |
| Finalidade | POC e rehearsal interno |
| Dados reais | Proibido |
| Hardcode no core | Nao |

## Comando De Seed

Executar somente em ambiente autorizado e isolado:

```bash
cd apps/whatsapp-agent
npm run demo:seed:boa-esperanca-poc
npm run demo:status:boa-esperanca-poc
```

O script:

- valida o banco atual antes de popular;
- cria ou atualiza apenas o tenant `boa-esperanca-poc`;
- limpa dados operacionais anteriores apenas desse tenant;
- cria usuarios, departamentos, filas, KB, Webchat, fluxo, conversas, metricas e evidencias de API mock;
- nao grava credenciais reais;
- nao altera tenants reais.

Variaveis opcionais:

| Variavel | Uso |
| --- | --- |
| `BOA_ESPERANCA_POC_CLIENT_KEY` | Sobrescrever clientKey do tenant tecnico, se necessario. |
| `BOA_ESPERANCA_POC_CLIENT_NAME` | Sobrescrever nome visivel do tenant tecnico. |
| `BOA_ESPERANCA_POC_PASSWORD` | Definir senha temporaria dos usuarios demo fora do Git. |

## Usuarios Demo

| Usuario | Role | Departamento |
| --- | --- | --- |
| `admin@boa-esperanca-poc.local` | ADMIN | Atendimento Geral |
| `supervisor@boa-esperanca-poc.local` | SUPERVISOR | Atendimento Geral |
| `ouvidoria@boa-esperanca-poc.local` | AGENT | Ouvidoria |
| `protocolo@boa-esperanca-poc.local` | AGENT | Protocolo |
| `esic@boa-esperanca-poc.local` | AGENT | e-SIC |
| `diario@boa-esperanca-poc.local` | AGENT | Diario Oficial |

Se `BOA_ESPERANCA_POC_PASSWORD` nao for definida, o script gera uma senha temporaria e exibe no JSON final da execucao.

Em ambiente compartilhado, definir `BOA_ESPERANCA_POC_PASSWORD` antes de executar o seed.

## Departamentos E Filas

| Departamento | Fila |
| --- | --- |
| Atendimento Geral | Fila Geral |
| Ouvidoria | Fila Ouvidoria |
| Protocolo | Fila Protocolo |
| e-SIC | Fila e-SIC |
| Diario Oficial | Fila Diario Oficial |

## Base De Conhecimento

Colecoes criadas:

- Portal Institucional;
- Ouvidoria;
- Protocolo;
- e-SIC;
- Diario Oficial.

Artigos ficticios demonstram:

- horario de atendimento;
- registro de manifestacao;
- consulta de protocolo;
- pedido e-SIC;
- consulta ao Diario Oficial.

## API Externa Simulada

O seed cria evidencia operacional de mock para:

```text
https://poc.boa-esperanca.local/api/protocolo
```

Exemplo demonstravel:

```text
protocolo: POC-2026-001
resultado: em_analise
```

Essa API e uma simulacao controlada para POC. Integracao real com sistemas da Camara depende de APIs, credenciais e homologacao fornecidas pelo orgao.

## Webchat

| Item | Valor |
| --- | --- |
| Site | Portal Institucional Demonstrativo |
| Slug | `portal-camara-demo` |
| Dominio demo | `poc.boa-esperanca.local` |
| Mensagem inicial | Atendimento digital demonstrativo da Camara |

## Smoke Checklist

Depois do seed, executar:

```bash
cd apps/whatsapp-agent
npm run demo:status:boa-esperanca-poc
```

O campo `prepared` deve retornar `true`. Em seguida, validar:

| Check | Resultado esperado |
| --- | --- |
| Login ADMIN | Acessa o app com tenant `boa-esperanca-poc`. |
| Dashboard | Exibe indicadores com dados ficticios. |
| Inbox | Lista conversas WhatsApp e Webchat. |
| Timeline | Mostra protocolo, mensagens e historico. |
| Chatbot | Mostra fluxo "POC Boa Esperanca - Atendimento Institucional". |
| KB | Mostra colecoes e artigos publicados. |
| Webchat | Site `portal-camara-demo` ativo. |
| API keys/webhooks | Evidencia de API mock e webhook entregue. |
| Relatorios | Periodo mensal possui conversas e metricas. |
| Usuarios/departamentos | Roles, setores e filas aparecem corretamente. |

## Rehearsal De 30 Minutos

1. Login ADMIN.
2. Dashboard com indicadores.
3. Inbox com filtro por canal.
4. Abrir conversa Webchat de protocolo.
5. Mostrar protocolo e resposta da API mock.
6. Abrir KB e artigo "Consulta de protocolo".
7. Abrir Chatbot e fluxo inicial.
8. Demonstrar handoff e departamentos.
9. Abrir Relatorios e exportacao, se disponivel no ambiente.
10. Abrir API keys/webhooks e explicar integracao real versus simulada.
11. Abrir usuarios/departamentos e explicar RBAC.
12. Encerrar com matriz Anexo III e limites assumidos.

## Criterio De Aprovacao Interna

Antes de usar em sessao oficial:

- KB e API mock devem estar demonstraveis sem improviso;
- nenhum dado real deve aparecer na tela;
- nenhum token ou segredo deve ser exibido;
- WhatsApp oficial deve ser explicado como Cloud API Meta;
- Webchat deve estar identificado como portal demonstrativo;
- integracao real com sistemas da Camara nao deve ser prometida sem APIs/credenciais;
- manutencao presencial quinzenal deve ter tratamento comercial/juridico definido.
