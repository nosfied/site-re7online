# Alcance da saída de12/10 — auditoria sanitizada e contenção suspensa

**SECURITY OPEN / P0/A/B E RESETS EXTERNOS SUSPENSOS.** Esta avaliação não autoriza rotação, revogação, instalação, captura produtiva ou remoção de históricos. NEWauth+NEWDB+NEWcipher, reader histórico, ambos crons, frontend/produção, guarda38 fechada e out.15 CLOSED permanecem preservados. [Provas sanitizadas](PROOFS_SANITIZED.json), [recomendações individuais](CREDENTIAL_DECISIONS.md), [auditor local READ ONLY](audit_readonly.py) e [correção local separada da custódia](../receipt-custody-v2-20261015/REPORT.md).

A saída completa foi registrada no computador do owner; uma versão truncada entrou no contexto do modelo OpenAI. Outro registro local comprova recebimento anterior de um `.env` pelo processo Gemini Code Assist. Não foi encontrada evidência de acesso não autorizado nos materiais examinados; não existe prova de ausência absoluta de acesso, de cópias ou de risco. Não se declara vazamento público nem transmissão ao Google sem evidência.

## Chamada, finalidade e arquivo

Sessão `01a0defe-3126-7dc2-8f24-a4b5c46fc43a`, iniciada26/09 e continuada12/10. Chamada `call_pVi84hOpyU5n75lFnVaugcBm`, em12/10/2026 às18:38:11.806UTC; resultado18:38:11.963UTC, **15:38:11Fortaleza**. Contexto: revisão da preparação integrada de política/configuração; o comando leu parte do preparador e tentou identificar a forma do ecosystem JSON. Nenhum valor era necessário para essa finalidade.

Comando exato do executor (sem valores):

```bash
sed -n '75,135p' local-evidence/dynamic-integrated-20261012/withdrawal-authorized-5b3cf3af/final-preserved/incident-6683-v4-dynamic-5b3cf3af-20261012T170000Z/window/prepare_policy.py; rg -n 'module.exports|"apps"' local-evidence/dynamic-integrated-20261012/withdrawal-authorized-5b3cf3af/final-preserved/incident-6683-v4-dynamic-5b3cf3af-20261012T170000Z/switch/candidate.config.private.json | head -1
```

Executado no worktree `tmp/worktrees/re7-campaign-recovery-20260926`, via `functions.exec`/`exec_command`, `max_output_tokens=2300`. O JSON privado era compacto: a linha encontrada por `"apps"` continha o ambiente completo. `head -1` limitava linhas; não removia valores. A limitação de tokens truncou apenas o resultado fornecido ao modelo, não o registro completo do executor/UI. As provas identificam os objetos por SHA256 do evento inteiro, sem publicar hashes individuais de segredos.

## Destinos e limites de comprovação

| Camada/destino | Observação direta | Limite |
|---|---|---|
| Codex local: rollout JSONL | Linha81765 chamada;81766 evento de execução com saída completa;81768 resultado truncado da ferramenta | O mesmo arquivo contém versões com alcances distintos; não confundir limite de tokens com saneamento |
| Codex local: `thread_history_1.sqlite` | Item `exec-c291e4ac-6551-482b-b718-dc81bc1e8f5d`; saída completa idêntica à linha81766 | É projeção local do histórico; não prova leitores ou retenção no servidor |
| Modelo OpenAI | Resultado truncado registrado como tool output, seguido de nova resposta/inferência;9 slots completos coincidentes | Evidência do contexto entregue ao modelo, não captura de pacote HTTP; não prova que os demais valores completos chegaram por outra via |
| Analytics Codex → `chatgpt.com/backend-api/codex/analytics-events/events` | Logs locais do dia mostram POST/200 | Eventos observados antes da chamada, sem corpo de payload; não atribuir segredos a analytics. Referência NEL Cloudflare em header não prova outro envio |
| Gemini Code Assist local | Log às12:04:24.283524 de12/10, notificação `textDocument/didOpen` com texto de `apps/whatsapp-agent/.env`;5 credenciais exatamente coincidentes | Anterior ao incidente Codex, fonte é documento aberto no editor. Não demonstra cópia do output Codex nem transmissão ao Google |
| Compartilhamento/exportações/outras cópias | Não foi localizada ação comprovada de exportação/compartilhamento da sessão nos registros delimitados. Settings Sync registra disabled; nenhuma inscrição remote-control no banco Codex atual | Não é inventário global de backups, exportações manuais, cloud storage ou acesso privilegiado. Estes não podem ser excluídos |

O rollout é `~/.codex/sessions/2026/09/26/rollout-2026-09-26T15-33-15-01a0defe-3126-7dc2-8f24-a4b5c46fc43a.jsonl`. O Gemini está em `~/.config/Code/logs/20261012T120406/window1/exthost/output_logging_20261012T120408/3-Gemini Code Assist.log`, linha9. A inspeção leu esses arquivos no lugar; não copiou textos sensíveis para o relatório ou Git. Os originais não foram apagados ou alterados.

## Categorias efetivamente presentes

Saída local completa:14 slots/13 valores distintos do inventário anterior, abrangendo administração/assinatura de sessão/controle do worker, banco,3 mecanismos de cifragem,3 segredos Meta, state OAuth, OpenAI, acesso WhatsApp e verificação de webhook. **Adicional:** campo privado VAPID Web Push, com forma de chave de32bytes, e chave pública correspondente. Forma não comprova validade remota ou uso efetivo; a pública não é segredo. Identificadores/flags/caminhos também constam na configuração, sem serem publicados aqui.

Tool output truncado para o modelo: `ADMIN_TOKEN`, `APP_AUTH_SECRET`, `CHANNEL_ACCOUNT_SECRET_KEY`, `DATABASE_URL`, `META_APP_SECRET`, `META_INSTAGRAM_APP_SECRET`, `META_INSTAGRAM_BUSINESS_LOGIN_APP_SECRET`, `META_INSTAGRAM_BUSINESS_LOGIN_STATE_SECRET`, `MFA_SECRET_ENCRYPTION_KEY`. O campo privado Web Push, OpenAI, acesso/verificação WhatsApp, controle worker e cifra de webhooks **não aparecem completos nesse resultado**. Isso não implica ausência em todos os contextos possíveis.

Gemini local: coincidência exata de `ADMIN_TOKEN`, `META_APP_SECRET`, `OPENAI_API_KEY`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN`. Há também campos APP_AUTH_SECRET e DATABASE_URL divergentes dos originais produtivos e do perfil pós-cifragem; senha da URL também diverge. Não inferir validade ou uso desses valores legados, nem pedir nova rotação de auth/banco por essa ocorrência. Nenhum valor foi reproduzido. O texto da notificação foi entregue ao processo local cloudcode; o log não comprova destino remoto desse conteúdo.

## Cliente, autenticação, configuração e permissões

A extensão VS Code registra `26.1007.21434` no dia12. O contexto daquela chamada usa `gpt-6.1-sol`, approval `on-request`, workspace-write e network_access=false; o banco da sessão registra provedor `openai`. Sandbox de rede não impede que o host Codex envie o contexto ao modelo. Versão CLI atual observada `0.162.0-alpha.17.2`; cabeçalho inicial da sessão antiga contém `0.155.0-alpha.16.3`. Logs de outra instância no dia mostram0.160.0; não atribuir essa versão à chamada sem prova binária contemporânea.

Logs do dia registram auth_mode Chatgpt. Hoje `auth.json` contém estrutura OAuth/refresh e não chave API; não foi impresso ou copiado token, claim pessoal ou ID de conta. A chave OpenAI da aplicação não é a modalidade de login do Codex. Configuração local atual sem provedor alternativo/base URL ou OTEL customizado e sem opção analytics explícita; arquivo tem mtime anterior à ocorrência, mas mtime não equivale a histórico assinado. Analytics efetivo está demonstrado pelos logs. [Configuração oficial: analytics/exporters/autenticação](https://learn.chatgpt.com/docs/config-file/config-reference). Não foram verificados controles de treinamento, retenção da conta, logs de acesso internos do provedor ou quem teve acesso à infraestrutura.

Permissões atuais: home750; `.codex`/sessions775; rollout664; histórico SQLite644; auth/config600; log Gemini664. ACLs examinadas não acrescentam entradas. Grupo1000 observado contém apenas o owner, inclusive contas com esse grupo primário; home750 impede travessia por outros usuários sem permissão adicional. Owner/root e processos com suas credenciais continuam podendo ler. Não alterar modos nesta auditoria. Modos atuais não provam os de12/10 nem excluem backups, privilégios ou acessos anteriores.

## Conclusão operacional

**Revisão da decisão:** [matriz consolidada, gatilhos de urgência e controles opcionais](CREDENTIAL_DECISIONS.md). A classificação anterior de rotação necessária por simples presença no contexto autorizado foi substituída, preservando integralmente as evidências.

A comparação privada com o perfil pós-cifragem já preservado comprova que os7 slots de auth/banco/cifragem são diferentes dos originais; não é nova captura produtiva e não reabre as rotações concluídas. Os7 slots externos/state/verificação e VAPID continuam iguais nesse perfil. A matriz revisada separa evidência, recomendação preventiva e obrigação comprovada: processamento pelo provedor autorizado não estabelece sozinho obrigação de rotação. Todas as trocas pendentes podem ser adiadas por aceitação explícita de risco; nenhuma obrigação adicional foi demonstrada. Não se exige prova de ausência absoluta de acesso, nem se declara invasão ou dispara reset. O grant histórico e a posse simultânea de chave antiga+ciphertext continuam risco residual; rotação atual não apaga cópias históricas.

P0/A/B e todos os resets permanecem suspensos até decisão do owner sobre o alcance. Próxima decisão é sobre a matriz de risco, não executar comandos antigos nem renovar RPO para perseguir prazo. Segurança OPEN; Prisma/limpeza e mudanças de configuração fora do escopo. Responsável Deifson; revisão15/10, próxima21/10, antecipar após mudanças.
