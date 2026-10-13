# Banco — composição final revisável; CAPACITY DENY

**ESTADO CORRENTE — retenção auditada; lote de cinco caminhos PARA REVISÃO / NÃO RETIRADO; banco CAPACITY DENY; auth concluída; out.15 CLOSED; guarda38 fechada.** [Inventário root completo, custódia e proposta4,63GB](retention-audit-20261013/REPORT.md). Expansão adiada. Cache+quatro blobs idênticos, main/manifests/journals/releases/retornos/segredos preservados.13 testes locais do driver e custódia verificada; driver produtivo não executado, nenhuma retirada. Próxima decisão: autorizar este lote com dry-run fresco e leitura posterior; depois renovar RPO/custódia e conferir capacidade bancária. Segurança OPEN, sem nova rotação/instalação.

**Checkpoint histórico — expansão preparada antes da priorização da retenção:**

**Continuidade 13/10 — expansão PREPARADA PARA DECISÃO, não executada:** DigitalOcean confirmado por DMI; Basic Regular80GiB/4GiB/2vCPU US$24/mês (catálogo, +US$6 se atualRegular18), exige desligamento/boot. 62GiB não é opção comprovada. [Roteiro, preservação GPT, custos/limites e dependências](DATABASE_CAPACITY_FOR_REVIEW.md). Banco continua CAPACITY DENY; leitura root integral depende da sessão sudo, fatura/opção regional e snapshot recuperável dependem do console. NEWauth/out15CLOSED/guard38 e artefatos preservados; após reboot exigir geração/bindings reais novos e backup/RPO fresco, sem editar geração antiga.


**Auth concluída, não repetida. Segurança OPEN.** Geração final `incident-6683-v4-security-database-final-v4-20261013T103000Z`; todos os scripts/configurações/consumidores e quatro modos materializados e preservados off-host. **Não pronta para execução:** orçamento bancário negado. Nenhuma senha produtiva alterada, política instalada, serviço reiniciado, campanha aberta ou histórico reparado. [Hashes/estado](DATABASE_FINAL_RESULT.sanitized.json), [comandos condicionais](DATABASE_COMMANDS_FOR_REVIEW.txt), [proposta concreta de capacidade](DATABASE_CAPACITY_FOR_REVIEW.md), [ensaios](DATABASE_FINAL_LAB.sanitized.json).

## Fronteira e retornos

| Estado comprovado | Caminho permitido |
|---|---|
| Antes de intent/ALTER; verificador original, atributos e TCP originais comprovados | Aborto prestop ou `return-before-commit`, OLDDB ainda efetiva + NEWauth. Nenhum ALTER para restaurar senha. |
| Commit VERIFIED; NEWDB aceita/OLDDB rejeita; atributos, plano e recibo exatos | Sucessores e retornos `return`/`return-partial` usam exclusivamente NEWDB+NEWauth. |
| Intent sem recibo compatível; erro, timeout ou resultado incerto | Sem sucessor ou replay automático. Inspeção SQL/verificador/TCP/recibo; ação explícita registra observação verificada antes do retorno canônico. |

O adapter chama os verificadores canônicos de saída, fence, guarda e ownership. A configuração pré-commit está em diretório próprio, com manifesto, JSON/ecosystem completo e intents próprios. Extensão restrita dos módulos deploy-owned de sequenciador/serializador para esse quarto modo; **helper8de, sudoers62b5 e formato da política root inalterados**. Target executável/cwd/script é idêntico nas variantes; configurações/ambientes continuam integralmente validados. Captura root nova/renovação limitada/negação de sobreviventes, zumbis, identidade ou leitura incompleta permanecem. Nenhuma identidade/prova consumida foi copiada.

Intent O_EXCL e recibo fsync vinculam planHash e hash do intent original. SQL usa transaction, lock_timeout2s/statement_timeout10s, lock de catálogo e guarda sobre verificador original e atributos completos; único efeito planejado é ALTER ROLE PASSWORD com SCRAM privado, sem plaintext na SQL/argv. Falha SQL ou commit incerto mantém intent e bloqueio. Retorno após observação ORIGINAL exige decisão explícita e prova original atual, não restauração de senha; observação VERIFIED não permite voltar a OLDDB. Baseline real original do sequenciador é gravada integralmente para recuperação, sem reconstruir ticks/estados por hipótese. O gerador fresco canônico ainda exigia28arquivos e não copiava waiting-work-frozen; o wrapper bancário revisável exige29/copiar o perfil completo, prova VERIFIED/TCP atual e NEWauth antes de delegar. Render/negação/sintaxe verificados localmente; efeitos externos do gerador fresco não executados nesta etapa. Nenhuma promessa de certificado operacional real desse ramo. Start incerto permanece negado; pós-unfence usa geração/política fresca canônica com credenciais efetivamente válidas, sem ALTER/replay.

## Consumidores selados

| Consumidor | Transporte / atualização |
|---|---|
| API e mesmo worker mínimo | TCP; configs finais NEWDB+NEWauth, quatro variantes seladas; frontend intacto. |
| PM2 saved/fallback | Save canônico somente do conjunto completo;600/umask077; novo DB nos sucessores/retornos pós-commit. Pré-commit mantém DB efetiva e NEWauth. |
| Administração | Leitores canônicos derivam configuração da API viva após remover env herdado; arquivo NEWDB privado adicional é ativado somente com recibo VERIFIED, sem fallback. Inputs históricos aposentados permanecem forenses, nunca atualizados/reexecutados. |
| Backup/cron | `docker exec pg_dump` via trust Unix local, sem senha armazenada; script root e cron selados. Cron exige hash original no preflight e hash window sob contenção, nunca aceitação genérica. |
| Docker inicialização/recuperação | Spec privada com image digest/config/hostConfig/mounts atuais e NEWDB; ativação exige VERIFIED. Container atual não é recriado/reiniciado. Seu ENV antigo é metadado imutável de bootstrap, cuja senha deixa de ser válida para TCP após troca; não foi falsamente declarado atualizado. Antigo arquivo Compose dos labels está ausente. |

Libpq não existe no host da VPS; o draft anterior negou `PQconnectdb`, com diagnóstico preservado. Solução final reutiliza Node20/Prisma da API ativa, sem instalar dependências/importar entrypoint/scheduler/provider. URI via stdin privado, SELECT1 em transação READ ONLY, timeouts; somente P1000 comprovado é negativa de autenticação. Outros erros/observações incompletas negam e são gravados privadamente. A prova final na VPS passou para OLDDB efetiva/NEWDB recusada e chegou ao DENY específico de orçamento.

Observador permanente frontend é estático para daemon/artefatos frontend e não vincula senha DB/PIDs API-worker; nenhuma mudança em sua política/helper/sudoers é necessária. Sua leitura/identidade e hashes devem ser reconfirmados antes da janela, como os demais controles.

## Provas e limites

Dez cenários dirigidos executaram adapter, Boundary e métodos reais do sequenciador sobre PostgreSQL16/SCRAM isolado e cliente Node20.20.0/Prisma: falha antes de intent, commit, falha de sucessor, timeout real de transporte15s antes/depois do commit, rollback SQL, guarda de catálogo, sobrevivente, privilégio divergente e recibo incompatível. Originais e novos TCP comprovados, no máximo uma tentativa SQL; atributos completos/dados fixture preservados. Efeitos PM2/processos/nft/cron/HTTP usaram o FakeBridge existente: **não constituem drain/exit certificado operacional na VPS**. A composição cron before/contained foi incluída no teste. Suítes funcionais/build de API/worker/frontend e auth não repetidos; seus bytes/provas anteriores reutilizados.

Fixture inicial recusou colisão de ecosystem e serializador três-modos; provas preservadas. v1/v2 drafts e finalv1 permanecem; finalv2 não foi despachada por falha SSH Network unreachable/existência ausente conferida. Finalv3 negou capacidade e dependência libpq descoberta antes da janela; finalv4 usa transporte Node validado. Staging com stdin vazio e leitura Docker sem -i/zero bytes foram preservados como incompletos, nunca PASS. Inventário du expirou e não certifica cobertura integral de consumo.

Dump off-host44b3ce61…/37.431.420B capturado **13/10 01:14:04UTC /12/10 22:14:04Fortaleza**, restore PG isolado70tabelas/614objetos/60migrations íntegro, banco temporário removido; controles7f0bc687…/9.948B extraídos. Na publicação esse horário é histórico, **não atestado de frescor/RPO atual**. Renovar pelo procedimento canônico antes de execução; preservar originais/manifests/política, sem adaptar hashes para PASS. Custódia final947e5cb9…/784.128B, extração limpa e todos os manifests conferidos.

Último13/10 10:33:07UTC/07:33Fortaleza: mínimo deploy/PostgreSQL2.104.283.136B contra2.173.698.048B; déficit69.414.912B. Staging final2.887.680B, nenhuma cópia funcional/dependência. WAL80→144MiB/slots0/archiveoff, duas amostras recentes estáveis; crescimento observado não limita rajadas. Orçamento: piso canônico2.131.755.008 +32MiB para dois segmentos WAL +8MiB controles/retorno, preservando reserva de produção. Proposta de expansão2GiB do disco raiz, sem excluir evidências/retornos/WAL, detalhada separadamente; NÃO EXECUTADA.

Source IDs API243332/ticks2163590583, worker243529/ticks2163591155, frontend188897/ticks2161347676, daemon18676 preservados; fonte, saved/fallback600, SQL global, proxy, baselines, guard38closed/tasks{}, out15CLOSED/recibo/CRM e ausência de submissão restante conferidos pelo checker antes do budget. Todos os gatesfalse, zero intents/start. Políticas apenas propostas; root instalação exige owner sudo/hash093a atual/arquivo histórico ausente/chain/modes/visudo. Hoje não instalar/executar enquanto CAPACITY DENY.

**Próxima decisão é capacidade, não execução bancária.** Após expansão autorizada e PASS real, renovar RPO/custódia e controles conforme o runbook; revisão do pacote/instalação restrita/uma sequência V4 em horário sem utilização humana. Se provider exigir reboot, requer decisão própria: nenhuma autorização de reboot inferida. Auth segue concluída; segurança externa/cifragem/Telegram futuro/liberação da guarda permanecem separados. Out15/.6/setembro CLOSED; CSV/Syer, internacional, CRA-PR/multilote/AUTO não encerrados por esta preparação.
