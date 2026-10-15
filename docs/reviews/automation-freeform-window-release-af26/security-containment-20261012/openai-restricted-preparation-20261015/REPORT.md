# OpenAI — emissão registrada e perfis restritos para revisão

Estado: LOCAL PROFILE VALIDATED / NOT ACTIVATED / NOT WINDOW READY, 15/10/2026. Responsável operacional: Deifson Oliveira; revisão semanal21/10, antecipada após mudança. Segurança externa e risco de segredo+ciphertext históricos OPEN. Auth/banco/cifragem/console/cron/out.15 concluídos; não repetir.

## Emissão e projeto

Registro privado completo: nome e ID da substituta, data de emissão, permissões, organização e Project IDs. Comparação exata privada passou: SAME_ID_RENAMED; Converta é o projeto antes chamado Default, segundo declaração do owner e IDs informados. Não há migração de projeto a justificar recriação. Identificadores e chave permanecem fora do Git.

O console forneceu data, sem horário: registro `date_only`, sem inferir meia-noite, fuso ou mtime. Associação da substituta: valor já custodiado + confirmação explícita do owner de cópia direta dessa emissão + metadados lidos no console. Não representa autenticação no provedor, recibo original de API ou identificação comprovada do registro da chave antiga configurada. A revogação antiga continua decisão separada; sem nova busca de recibo inexistente ou dependência de suporte.

`OWNER_ACTIONS.private.json` atualizado pelo coletor, com original/recibo próprios e demais campos preservados. Custódia local permanente700/arquivos600. Coleta v1 preservada; v2 aceita data exibida. Falhas anteriores ocorreram antes das gravações. O comando interativo agora usa subshell para que um erro não encerre o terminal do owner.

## Consumidores e compatibilidade

Fonte concreta completa: perfil pós-cifragem v14, hash `dffb3c6f8b5be260b42b4668a6dbae36d15df431cf29668f55ec43ea10f80724`. É uma prova histórica atestada, não leitura fresca da VPS. Comparação integral confirmou somente API.OPENAI_API_KEY alterada. Worker/frontend e todos os demais campos, incluindo NEWauth+NEWDB+NEWcipher, permanecem iguais. Nenhum `.env` foi alterado.

| Consumidor auditado | Recurso | Verificação pendente para ativação |
|---|---|---|
| API `openai.brain.ts` | Responses; modelo configurado; contexto enviado explicitamente | Autenticação e acesso ao modelo com substituta |
| API/filho `audioTranscriptionProcess.ts` | audio/transcriptions, gpt-4o-mini-transcribe | Permissão/limite de áudio; sem transcrição ou mensagem de teste nesta etapa |
| Worker/frontend | Sem OPENAI_API_KEY no perfil concreto | Reconferir ausência de consumidor novo e perfis ativos antes da janela |

Os caminhos auditados não usam IDs persistidos de assistant/files/vector store/previous_response. Isso não inventaria todos os recursos da organização. Renomear o mesmo Project ID não demonstra saldo ou limites: consultar no console acesso aos dois modelos, faturamento ativo, limites de uso/spend e RPM/TPM/áudio; valores atuais não foram observados. Permissões All registradas, sem ampliação executada. [Projeto/ID e nome](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/projects/methods/retrieve), [limites por modelo/projeto](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/projects/subresources/rate_limits/methods/list_rate_limits), [RBAC](https://developers.openai.com/api/docs/guides/rbac).

## Artefatos e provas

Perfis privados preparados em `re7-private-retention-custody/openai-restricted-preparation-20261015/profiles`: fonte e retorno pré-ativação, candidato e retorno pós-ativação, plano, índice e resumo. Índice SHA256 `7936db4554461009ba78855e38e4ec332399d8a30518acd5ebc01fab2d77816f`. São cópias pequenas deliberadas para prova/retorno, sem build/tar/runtime duplicado. A saída só é criada depois de validar fonte, proveniência, projeto, permissões e hash da chave.

15 testes locais PASS: coletor original3, v2 seis, preparador seis. Preparador ensaiado contra os três apps completos reais, substituta sintética; nenhum segredo nos resultados. Provas incluem projeto divergente, troca de valor, permissão diferente, proveniência ausente, fonte alterada e proibição de inventar horário para data isolada. Preparação real e verificador read-only privados passaram; candidato = retorno pós-ativação e recomposição da única variável = fonte integral.

Não executados: chamada autenticada, GET/models, inferência/transcrição, transferência VPS, instalação, gates, contenção, restart ou revogação. Nenhuma política/installer V4 novo foi produzido: perfis locais completos não são uma janela operacional.

## Sequência restrita proposta e impactos

1. Conferir no console modelos/permissões/faturamento/limites do mesmo projeto; registrar evidência privada sem valores secretos. Não criar outra chave por nome.
2. Compor geração operacional NOVA sobre fonte root pós-v14, com quatro modos/consumidores reais/retornos NEWauth+NEWDB+NEWcipher, usando gates preventivos de retenção. V14 está consumida; seus A/B não são reutilizáveis. Levantar hashes root/identidades/SQL/proxy/ambos crons/boot/saved/fallback e demonstrar compatibilidade do driver, sem instalar.
3. Publicar política, instalador, manifests e A/B/C/D somente após cadeia concreta certificar. Capacidade: reserva canônica8.794.603.520B não substitui orçamento específico; medir alocação única dos perfis/pacote/backup/retornos e WAL/crescimento. Estimativa de evidências32MiB é margem de planejamento, não piso revisado nem CAPACITY PASS. RPO/restore/custódia e espaço devem ser frescos na janela futura, sem backup repetido agora.
4. Autorizar separadamente ativação e eventual interrupção da API; o cliente carrega a chave no processo. Worker só acompanha se o sequenciador canônico exigir, sem ampliar seu ambiente. Frontend/PostgreSQL não precisam reiniciar por esta variável. Não se espera logout por preservação NEWauth. Tempo real de parada não medido; limite só após ensaio do driver. Nenhuma mensagem de teste.
5. Validar autenticação/acesso ao modelo por método aprovado, health/DB, controle API↔worker, leitura de telas/sessões/console, reconexões, saved/fallback600, supervisão/boot/crons, guarda38/out.15 e gates falsos. GET/models200 isolado não prova o registro ou todo recurso utilizado.
6. Só depois de ativação aceita, decisão separada de revogação antiga: comprovar registro suficiente ou decisão explícita baseada no inventário de usos. Preservar antiga até essa decisão; nenhuma revogação implícita.

Aborto antes de ativação mantém configuração ainda efetiva/NEWauth+NEWDB+NEWcipher. Após ativação aceita, retorno compatível mantém a substituta; não reintroduzir credencial exposta automaticamente. Se substituta for recusada ou resultado incerto, não revogar antiga nem repetir partidas: inspecionar e decidir pela fronteira canônica ainda a publicar. Não existe recuperação produtiva autorizada por estes perfis.

Próxima ação do owner: apenas leitura do console para confirmar acesso aos modelos e situação/limites do projeto, sem valores de chave. Próxima engenharia independente: geração operacional nova e certificação dos quatro modos; não pedir janela com estes perfis isolados.
