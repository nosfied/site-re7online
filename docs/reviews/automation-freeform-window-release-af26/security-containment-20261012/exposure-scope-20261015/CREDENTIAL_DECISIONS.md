# Decisão consolidada por credencial — avaliação de risco, sem execução

**ROTAÇÕES ADIADAS POR ACEITAÇÃO DO OWNER —15/10/2026.** [Registro explícito sobre a matriz b1d41b33](OWNER_ACCEPTANCE_2026-10-15.md), revisão21/10/2026 ou antes pelos gatilhos. A fundamentação abaixo fica preservada; a decisão de adiar já foi tomada. P0/A/B e resets suspensos; não há revogação ou contenção completa.

[Alcance e evidências preservados](REPORT.md). Esta revisão substitui a classificação anterior de “rotação necessária” baseada apenas na presença do segredo no contexto do modelo. **O envio ao provedor autorizado é um fato sobre o tratamento do dado; isoladamente, não demonstra acesso não autorizado, comprometimento da conta ou obrigação de rotação.** A inadequação de imprimir configurações permanece registrada, sem transformar essa falha em prova de abuso.

Separação das conclusões:

- **Evidência:** registros locais, tool output fornecido ao modelo, notificação local Gemini e comparação com perfis preservados. Não se altera nenhum desses fatos.
- **Recomendação preventiva:** reduzir cópias e capacidade de uso futuro de credenciais ainda iguais às originais, ponderando os impactos da substituição. Prioridade preventiva não equivale a emergência ou obrigação.
- **Obrigação comprovada:** **não há obrigação adicional de rotação demonstrada pelos elementos auditados**. Não foi identificada política/contrato aplicável que imponha troca apenas por esse processamento autorizado. Se uma exigência específica existir, deve ser identificada e vinculada à credencial/ocorrência; não presumida.
- **Decisão do owner:** as trocas pendentes podem ser adiadas com aceitação do risco conhecido e das incertezas. Não é necessário provar ausência absoluta de acesso. Não registrar aceitação em nome do owner antes de sua decisão.

## Decisão recomendada agora

**Manter a suspensão e permitir decisão conjunta de adiamento das trocas externas, state, verificação e Web Push. Os fatos disponíveis não justificam um reset emergencial indiscriminado.** Preservar os pacotes preparados para eventual execução coordenada posterior. Auth/banco/cifragem já concluídos permanecem concluídos; não repetir essas janelas ou reinterpretar retroativamente a decisão aprovada como obrigação universal.

O owner pode aceitar o adiamento até a revisão já registrada de21/10, antecipada apenas por fato relevante, ou definir outra data/disposição explícita. Essa data organiza a revisão; não é validade criptográfica, prazo de RPO ou obrigação de nova coleta/rotação. Também pode decidir não rotacionar uma categoria após ponderar impacto e risco residual. Incertezas delimitadas podem ser aceitas; não são automaticamente bloqueios técnicos impossíveis de resolver.

## Matriz revisada

“Local” inclui executor/UI/rollout/SQLite; “modelo” refere-se ao tool output truncado identificado. Comparação de vigência é com o perfil pós-cifragem atestado e preservado, não nova leitura produtiva. Valores não são exibidos.

| Credencial/categoria | Evidência, sem inferir abuso | Recomendação e possibilidade de adiamento | Obrigação adicional comprovada |
|---|---|---|---|
| ADMIN_TOKEN | Completo no modelo/local e coincidente no `.env` Gemini; diferente no perfil pós-auth | Troca já concluída por decisão aprovada; console aceito. Preservar NEWauth, sem repetir | Nenhuma nova |
| APP_AUTH_SECRET | Completo no modelo/local; variante legada distinta no Gemini; diferente no perfil pós-auth | Troca já concluída e login/logout aceitos. Não repetir; variante legada não demonstra comprometimento de NEWauth | Nenhuma nova |
| WHATSAPP_WEB_WORKER_CONTROL_TOKEN | Completo localmente, não no resultado truncado; diferente no perfil pós-auth | Troca já concluída; preservar controle API↔worker | Nenhuma nova |
| Credencial DATABASE_URL | Completa no modelo/local; URL/senha legadas distintas no Gemini; NEWDB diferente | Troca já concluída, antiga rejeitada na janela aprovada. Não repetir ALTER | Nenhuma nova |
| CHANNEL_ACCOUNT_SECRET_KEY | Completa no modelo/local; NEWcipher diferente | Troca já concluída; preservar reader147/grant/disposição opaca. Risco histórico chave antiga+ciphertext deve ser tratado como residual, sem nova rotação por rotina | Nenhuma nova |
| MFA_SECRET_ENCRYPTION_KEY | Completa no modelo/local; NEWcipher diferente | Troca já concluída. Nova chave não apaga cópias históricas; não repetir | Nenhuma nova |
| WEBHOOK_SECRET_ENCRYPTION_KEY | Completa localmente, não no resultado truncado; NEWcipher diferente | Troca já concluída; preservar reader compatível | Nenhuma nova |
| META_APP_SECRET | Completo no modelo/local e coincidente no Gemini; ainda igual no perfil preservado | **Preventiva**, prioridade pelo alcance de assinatura/autenticação. **Pode adiar** mediante aceitação; qualquer reset futuro exige emissor/usos/341 vínculos/retorno e avaliação de OAuth/HMAC, não hipótese de abuso | Não demonstrada |
| META_INSTAGRAM_APP_SECRET | Completo no modelo/local; ainda igual no perfil | **Preventiva; pode adiar.** Troca futura coordenada por ativo/consumidores e derivados. Não presumir independência ou coexistência | Não demonstrada |
| META_INSTAGRAM_BUSINESS_LOGIN_APP_SECRET | Completo no modelo/local; ainda igual no perfil | **Preventiva; pode adiar.** Mesmo cuidado com emissor e retorno; não resetar apps em conjunto por conveniência | Não demonstrada |
| META_INSTAGRAM_BUSINESS_LOGIN_STATE_SECRET | Completo no modelo/local; ainda igual no perfil | **Preventiva; pode adiar.** Troca futura pode invalidar fluxos OAuth pendentes; não autoriza tocar NEWauth | Não demonstrada |
| OPENAI_API_KEY antiga | Completa localmente/Gemini; não completa no tool output truncado; ainda igual no perfil | **Preventiva; pode adiar.** Substituta conhecida e pacote permanecem custodiados/suspensos. Ativação, validação e revogação são decisões distintas. Revogar registro antigo exige vínculo suficiente ou decisão explícita baseada nos usos | Não demonstrada apenas por esses registros |
| WHATSAPP_ACCESS_TOKEN de fallback | Completo localmente/Gemini; não completo no resultado truncado; ainda igual no perfil | **Preventiva; pode adiar.** Ponderar alcance de acesso/envio e continuidade; não confundir fallback com todos os tokens dos tenants ou resetar app sem avaliar derivados | Não demonstrada |
| WHATSAPP_VERIFY_TOKEN | Completo localmente/Gemini; não completo no resultado truncado | **Aceitação de risco ou troca preventiva; pode adiar.** Verificação de webhook não equivale a bearer de envio. Troca exige sincronização aplicação/console | Não demonstrada |
| WEB_PUSH_VAPID_PRIVATE_KEY | Completa localmente; ausente completa no tool output truncado; sem coincidência demonstrada no Gemini. Igual no perfil, consumidor no código | **Preventiva; pode adiar inclusive com consumidores ativos**, ponderando risco e impacto conhecidos. Presença não prova uso. Troca futura pode exigir renovar inscrições e afetar notificações; inventário ajuda planejar, mas ausência de consumidores não é condição para aceitar risco | Não demonstrada |
| WEB_PUSH_VAPID_PUBLIC_KEY | Pública, no mesmo JSON | Não requer troca por exposição da parte pública. Pode mudar junto ao par privado em migração futura | Nenhuma por esse fato |
| APP_AUTH_SECRET/DATABASE_URL legados do `.env` Gemini | Valores distintos dos originais produtivos e do perfil pós-cifragem; validade/consumidores desconhecidos | **Pode aceitar a incerteza e adiar a reconciliação seletiva**, registrando limite. Não presumir validade/inocuidade; não atualizar `.env` para NEWDB, reabilitar Prisma/cron ou revogar conta desconhecida | Não demonstrada |

## Fatos que justificariam urgência

Não foram comprovados nesta auditoria; são gatilhos proporcionais para reavaliar o adiamento:

| Novo fato verificável | Consequência de decisão |
|---|---|
| Uso não reconhecido atribuível à credencial: chamadas, faturamento, mensagens, assinatura OAuth/webhook ou push | Priorizar a credencial afetada, preservar evidência e planejar contenção/revogação com impacto explícito; não atingir todos os provedores automaticamente |
| Credencial válida publicada em local público ou acessível a terceiro não autorizado; leitura/download de sessão por identidade não autorizada | Prioridade alta para esse segredo e seus derivados comprovados; distinguir acesso ao arquivo de suposição por permissões |
| Sessão da conta do owner tomada, dispositivo perdido com acesso aos dados, malware ou processo não autorizado lendo o material | Avaliar primeiro o acesso/identidades afetados e as credenciais alcançadas; trocar valores sem resolver o acesso pode expor as substitutas |
| Confirmação de envio por Gemini/outro destino fora da autorização ou política aplicável | Reavaliar tratamento/retensão e risco específico. Novo destino, sozinho, não prova abuso; urgência depende de acesso, escopo e controles demonstrados |
| Exigência aplicável de política/contrato ou alerta concreto do emissor exigindo revogação | Registrar fonte, prazo e credencial abrangida; cumprir pelo procedimento adequado, sem converter recomendação geral em obrigação presumida |

Esses gatilhos exigem nova decisão conforme o fato, não replay automático de P0/A/B, reset genérico ou restauração de segredos antigos. A mera impossibilidade de excluir todos os acessos históricos, expiração de backup ou presença em arquivo privado não estabelece urgência adicional.

## Controles da conta ainda verificáveis — opcionais, sem nova busca exigida

Os itens abaixo podem ajudar a decisão; **não são gates obrigatórios nem solicitações de prova de ausência absoluta**. Não foram consultados nesta revisão e não se presumem disponíveis em todas as modalidades de conta.

- **Conta ChatGPT/Codex usada na sessão:** modalidade pessoal/workspace, controles de uso de dados para melhoria, opções de histórico/retensão que efetivamente se apliquem ao Codex, links compartilhados/exportações e sessões/dispositivos reconhecidos; MFA e integrações autorizadas. Um controle atual não prova sua configuração em12/10, e um controle de treinamento não significa ausência de armazenamento. Não confundir essa conta OAuth com o projeto API OpenAI da aplicação.
- **Projeto API OpenAI já identificado:** atividade/uso atribuível à chave, quando a interface disponibilizar esse vínculo; registros e permissões já coletados continuam válidos. Não repetir emissão, exigir quotas/saldo ou revogar a Active por hipótese. Não há necessidade de recibo antigo inexistente para decidir o adiamento.
- **Gemini Code Assist:** modalidade/conta da extensão e política de tratamento aplicável; configuração de inclusão de arquivos/contexto e diagnósticos; informações de sessão/atividade disponíveis. `didOpen` comprova recebimento local, não envio remoto. Qualquer consulta futura deve emitir apenas resumo; não encaminhar `.env`, logs brutos ou chaves ao suporte/modelo.
- **Host local:** membros de grupos e permissões já observados, processos autorizados e eventual sincronização/backup conhecido pelo owner. Não é preciso refazer varredura extensa nem demonstrar inexistência de toda cópia. Nenhuma alteração de configuração, logout, limpeza ou exclusão está autorizada aqui.

A documentação oficial de [produção](https://developers.openai.com/api/docs/guides/production-best-practices) e [segurança](https://developers.openai.com/api/docs/guides/safety-best-practices) orienta prevenção e resposta quando uma chave é considerada comprometida. É orientação de segurança; não prova que este processamento autorizado configurou comprometimento ou obrigação contratual específica. Se surgir evidência de comprometimento, a prioridade muda pelo fato observado.

## Registro mínimo de aceitação

Uma decisão consolidada pode listar todas as categorias adiadas, impactos evitados, alcance conhecido, incertezas aceitas, owner e próxima revisão já programada, com os gatilhos acima. Aceitar risco não equivale a afirmar que nada aconteceu ou que a conta não retém dados. Não publicar valores, IDs de organizações/projetos/chaves ou nova coleta de emissão. **Aceitação explícita registrada posteriormente no documento OWNER_ACCEPTANCE_2026-10-15.md, referenciada acima.**

P0/A/B e resets seguem suspensos até decisão explícita. Pacotes, R0 DENY/ack, evidências, NEWauth+NEWDB+NEWcipher, crons, produção, guarda38 e out.15 CLOSED preservados. Responsável operacional Deifson; revisão15/10/próxima21/10, antecipar por fato relevante.
