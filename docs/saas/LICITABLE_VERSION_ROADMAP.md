# Licitable Version Roadmap

Status: roadmap executivo da Sprint 79A. Documento de consolidacao; nao altera runtime.

## Objetivo

Definir o que falta para declarar oficialmente:

```text
Versao Licitavel 1.0
```

## Estado Atual

O Converta esta tecnicamente maduro para disputar editais semelhantes aos cinco usados como referencia. A maior parte das pendencias agora e documental, comercial ou juridica.

## Obrigatorio

| Item | Categoria | Motivo | Fonte |
| --- | --- | --- | --- |
| Manual do Administrador | Documentacao | Necessario para implantacao, operacao e treinamento | Derivar de `admin-ui.md`, `FEATURE_FLAGS_MATRIX.md`, `CHANNELS_GOVERNANCE.md` |
| Manual do Operador | Documentacao | Necessario para PoC e treinamento | Derivar de Inbox, CRM, Search, Reports, Scheduling |
| Guia de Implantacao B2G | Documentacao/operacao | Necessario para proposta e execucao | Consolidar `RELEASE_CHECKLIST.md`, `go-live-checklist.md`, runbooks |
| Modelo de Proposta Tecnica | Comercial | Necessario para responder edital rapido | Usar `TECHNICAL_POSITIONING.md` e `BID_COMPLIANCE_MATRIX.md` |
| Roteiro de PoC municipal | Licitacoes | Necessario para demonstracao | Atualizar `DEMO_SCRIPT.md` |
| Matriz edital-item por certame | Licitacoes | Necessario para cada disputa real | Derivar de `BID_COMPLIANCE_MATRIX.md` |
| Dossie juridico/fiscal | Juridico | Pode inabilitar mesmo com produto pronto | Fora do repositorio |
| Atestados tecnicos | Juridico/comercial | Habilitacao tecnica | Fora do repositorio |
| Declaracao API oficial Meta | Comercial/juridico | Requisito recorrente | Derivar de `bid-package/06-whatsapp-oficial.md` |

## Importante

| Item | Categoria | Motivo | Acao |
| --- | --- | --- | --- |
| Atualizar bid-package | Documentacao/comercial | Material ainda nao reflete totalmente Webchat, Telegram, Search, MFA, Observabilidade e Load Lab | Revisar 01-12 |
| Deck institucional tecnico | Comercial | Apoio a reunioes e apresentacoes | Atualizar executive deck |
| Plano de treinamento | Comercial/operacao | Editais exigem treinamento | Criar carga horaria, publico e formato |
| SLA comercial | Comercial/juridico | Define suporte e penalidades | Criar anexo com niveis |
| Backup offsite | Operacao | Aumenta aderencia em contratos maiores | Implementar se contrato exigir |
| Restore drill recorrente | Operacao | Evidencia continuidade | Agenda recorrente |
| Plano de storage por porte | Infra/comercial | Aripuana e similares podem exigir 600GB | Precificar e documentar |
| Kit de evidencias POC | Licitacoes | Facilita diligencias | Prints, logs redigidos, endpoints, resultados |

## Desejavel

| Item | Categoria | Motivo |
| --- | --- | --- |
| Incident response playbook | Operacao | Melhora maturidade operacional |
| Historico persistente de metricas | Observabilidade | Facilita SLA e auditoria |
| Alertas externos | Observabilidade | Slack/email/webhook futuro |
| Readiness/liveness separados | Infra | Prepara HA |
| Telegram midia/grupos | Produto | Apenas se edital exigir |
| NPS runtime completo | Produto | Apenas se exigencia recorrente se tornar bloqueadora |
| Audio piloto real | Produto | Eleva aderencia em editais com transcricao |
| OTP cidadao | Produto | Apenas se edital exigir autenticacao externa |

## Criterio Formal Para Declarar Versao Licitavel 1.0

A plataforma pode ser declarada Versao Licitavel 1.0 quando:

1. `BID_COMPLIANCE_MATRIX.md` estiver atualizado;
2. `LICITABLE_VERSION_1_0_CHECKLIST.md` tiver todos os itens obrigatorios marcados como prontos ou com responsavel externo definido;
3. manual admin e manual operador existirem;
4. modelo de proposta tecnica existir;
5. roteiro de PoC municipal existir;
6. bid-package tiver sido atualizado pos-Fase III;
7. atestados/certidoes/documentos juridicos estiverem reunidos fora do repositorio;
8. limites de HA, storage, app nativo, NPS, audio e OTP estiverem declarados de forma transparente.

## Sequencia Recomendada

| Sprint | Tema | Resultado esperado |
| --- | --- | --- |
| 79A | Bid Readiness Master Pack | Camada mestre de consolidacao |
| 79B | Manual Admin/Operador | Materiais de uso e treinamento |
| 79C | Proposal Technical Template | Modelo de resposta tecnica |
| 79D | B2G PoC Runbook | Roteiro demonstravel para banca |
| 79E | Bid Package Refresh | Atualizacao dos anexos comerciais |
| 79F | Legal/Commercial Evidence Checklist | Checklist externo de certidoes/atestados |

## Decisao

Nao abrir novas sprints de produto antes de concluir os itens obrigatorios da Fase IV, salvo se um edital real trouxer requisito bloqueador nao atendido.
