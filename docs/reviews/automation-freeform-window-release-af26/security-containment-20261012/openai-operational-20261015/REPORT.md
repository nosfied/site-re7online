# OpenAI — pacote operacional preparado para decisão

**Decisão de risco revisada — sem execução,15/10:** [matriz consolidada](../exposure-scope-20261015/CREDENTIAL_DECISIONS.md). Presença no contexto do provedor autorizado não comprova obrigação de rotação; trocas pendentes externas/state/verificação/Web Push podem ser adiadas mediante aceitação do owner. Nenhuma obrigação adicional demonstrada ou aceitação presumida. Gatilhos concretos de urgência e controles opcionais separados; não exigir ausência absoluta de acesso. P0/A/B e resets continuam suspensos; fases concluídas, pacotes, evidências e custódia local16PASS preservados. Sem novas buscas extensas, backups, mudanças de conta ou produção.


**Estado corrente — SECURITY OPEN / P0/A/B E RESETS EXTERNOS SUSPENSOS,15/10:** [alcance sanitizado e matriz por credencial](../exposure-scope-20261015/REPORT.md).14 slots completos no registro local,9 no tool output truncado OpenAI; VAPID privado adicional local; Gemini recebeu antes um.env por didOpen com5 credenciais coincidentes, sem transmissão ao Google comprovada. Sem evidência de acesso não autorizado nem prova de ausência absoluta. NEWauth+NEWDB+NEWcipher já diferentes dos originais; não repetir fases concluídas. [Custódia v2 local](../receipt-custody-v2-20261015/REPORT.md):16 ensaios PASS com bytes originais, cadeia real sobre171 arquivos/quatro modos e relógio histórico/transferência simulados; não implantada. R0 DENY/ack/pacote originais intactos; sem backup novo, captura root ou ativação. Ambos crons/produção/guarda38/out.15 CLOSED preservados. Deifson; revisão15/10/próxima21/10, antecipar após mudanças.

A suspensão acima prevalece sobre os roteiros e checkpoints anteriores abaixo.


**Atualização R0 de15/10: DENY antes da atualização dos bindings.** [Resultado, causa e hashes efetivos](R0_RESULT_2026-10-15.md). Backup/custódia/restore retido conferidos;171 arquivos inalterados. Sem novo review ou autorização de P0/A/B. O estado abaixo é o checkpoint anterior à tentativa R0.

Estado: **OPERATIONAL PACKAGE PREPARED / INACTIVE STAGING READ ONLY PASS / NOT INSTALLED / NOT ACTIVATED**. Não é WINDOW READY com provas vencidas. Geração `incident-6683-v4-security-openai-v4-20261015T203000Z`. Nenhuma autorização de janela decorre deste relatório. [Comandos integrais](COMMANDS_FOR_REVIEW.txt), [provas sanitizadas](PROOFS_SANITIZED.json) e [matriz dos consumidores](MATRIX.md).

## Escopo e evidência

Reutilizados custódia da substituta, registro privado da emissão, comparação exata SAME_ID_RENAMED e perfis aprovados/15 testes de bc1bec5d. Nenhuma nova solicitação de organização, Project ID, emissão ou valor. Registro da criação permanece date_only, sem horário inventado. O pacote foi comparado integralmente ao candidato privado aprovado; somente `OPENAI_API_KEY` da API muda. Todos os outros campos da API, worker e frontend permanecem iguais, incluindo NEWauth+NEWDB+NEWcipher/reader histórico/v2. `.env` não participa da troca nem foi reconciliado.

| Uso efetivo | Modelo e endpoint | Contrato mantido |
|---|---|---|
| `OpenAIBrain.generateReply` | gpt-4.1-mini; POST https://api.openai.com/v1/responses | SDK e parâmetros atuais; sistema/contexto enviados no request, sem recurso persistido referenciado |
| `transcribeWithOpenAi` | gpt-4o-mini-transcribe; POST https://api.openai.com/v1/audio/transcriptions | multipart, linguagem pt, áudio/timeout originais |
| Worker/frontend | Sem esta chave no perfil | Nenhuma variável adicionada; frontend preservado |

Os dois módulos compilados usados no ensaio foram comparados aos hashes do runtime efetivo. A documentação oficial confirma os endpoints dos modelos; não atesta acesso desta conta: [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini), [GPT-4o mini transcribe](https://developers.openai.com/api/docs/models/gpt-4o-mini-transcribe).

A única solicitação consolidada de console foi retirada conforme decisão do owner: manter modelos, permissões e limites existentes. Organização/projeto/emissão permanecem conferidos privadamente. Limites, saldo e permissões efetivas por modelo NÃO foram observados por acesso administrativo e não são inventados. Não existe gate genérico de console nem dependência de suporte/recibo antigo. Erro real de quota/permissão/autenticação na validação futura deve negar antes da instalação/contenção; não alterar configuração para PASS.

## Conferência concreta e controles

Captura de leitura15/10 às16:49:09Fortaleza: API774414/worker774607, frontend188897 e daemon conferidos; NEWcipher VERIFIED por SELECT canônico; SQL congelado, proxy, perfis ativos, saved/fallback600 e ambos crons. Mínimo18.056.998.912B/WAL224MiB. O inspect da política consumida recusou; diagnóstico privado preservado. Não foi interpretado como nova autorização: a fonte fa113e exige leitura root direta no pré-A.

Staging inativo transferido/extraído UMA VEZ e conferido na VPS às17:19:55Fortaleza:171 arquivos exatos, owner/modos, checker real completo/quatro modos/restore retido/runtime/dependências/referências imutáveis PASS; cadeia canônica atual de perfis/identidades/SQL/proxy/guard/supervisão/ambos crons/saved600/healthDB PASS. Mínimo18.107.121.664B, WAL160MiB. São amostras, não tendência contínua nem certificação de I/O histórico. Nenhuma política, gate, contenção, partida, provider ou configuração ativa foi executada. A escrita na VPS limitou-se ao staging/evidências privados. O checker conferiu arquivos do runtime e destinos dos links; a prova profunda de dependências anteriores foi reutilizada, sem alegar novo rehash integral da árvore compartilhada.

Fonte root esperada **fa113e52** pós-cifragem; proposta **e2695c3d**, helper8de358fd/regra62b5a2ac iguais. Configurações de boot/retorno/saved/fallback passam pelo mesmo fluxo canônico e mantêm NEWauth+NEWDB+NEWcipher. Controles deploy E sistema são conferidos separadamente na admissão, recuperação pré-parada e encerramento. População de quatro modos, campo mode explícito, tipos/owner/modos/hashes/perfis/manifests e referências imutáveis não vazias compartilhados no checker/start gate.

## Cadeia e retorno

R0 renova uma vez backup pelo backup.lock e lock da janela, confirma custódia off-host/catalog/schema/laboratório certificado retido/parado e atualiza SOMENTE provas dos quatro modos. Originais são arquivados; nenhuma chave, SQL/grant/cifra ou boolean de remoção é alterado. Republicar novo review hash antes de A; código/política/instalador permanecem fixos. O backup de14:27:42UTC é histórico e já expirou; nenhuma renovação foi executada apenas para esperar uma decisão.

P0, somente com autorização futura explícita: dois requests sintéticos pelos métodos REAIS da aplicação, usando a substituta antes da interrupção: resposta textual não vazia/source ai/modelo/usage e reconhecimento da fala sintética “Teste local de validacao de audio.”. O WAV foi sintetizado localmente com biblioteca existente, sem usar gravação de tenant ou TTS externo. Não há rota de envio/tenant/conversa/banco no probe. São chamadas faturáveis ao provedor, sem envio WhatsApp; mantêm SDK/parâmetros atuais. Até três tentativas HTTP do SDK em Responses e uma no áudio por fase, conforme política do SDK preservada. Wrapper150s por fase; não repetir automaticamente após recusa/timeout. GET/models e health200 nunca satisfazem esse gate.

A instala SOMENTE a política restrita após hash/review/current/root/RPO frescos. A admissão exige cinco gates com provas atuais: autorizaçãoSHA40, artefatos, restore/RPO/custódia/lab, preflight/root/política instalada e discrepâncias resolvidas/current/probe. Só FIVE_GATES_ADMITTED permite B.

B único: admissão ainda fresca → contenção e saída/ownership canônicos → intent/recibo LOCAL de seleção de credencial nova → API/mesmo worker → repetir a validação funcional em subprocesso isolado com o perfil instalado → unfence/save/fallback/controles → cadeia posterior e gates false. Não existe ALTER, mudança de cifra, migração ou revogação nesse CLI. A seleção é uma fronteira local de perfis; não deve ser chamada de commit de provider ou prova de revogação.

C é inspeção. ORIGINAL_LIVE/ORIGINAL_STOPPED antes da seleção autorizam somente a alternativa ORIGINAL por decisão explícita. NEW_LIVE/NEW_PARTIAL/NEW_STOPPED com seleção íntegra autorizam somente NEW. Intent incerto, start intent sem marker, divergência ou proprietário inesperado negam ambos. Sem replay de B, SQL ou partida consumida. Recuperação ORIGINAL usa a credencial ainda efetiva antes da ativação e preserva os três conjuntos novos; após seleção todos os retornos usam a substituta. Certificados de saída são emitidos pelo Operations canônico, nunca copiados/relabeled para satisfazer outra configuração. Cada modo possui seus próprios intents; falha ambígua exige inspeção/nova decisão.

Após unfence, retorno exige geração/política/identidades frescas e decisão própria; C1/C2 não contornam a exigência de fence presente. Um probe consumido sem recibo não é repetido por recovery. Se o probe posterior já possui recibo válido do mesmo contrato/alvo, recovery reutiliza esse recibo. Sem ele, não declarar retorno completo se o driver negar nova validação. A chave antiga continua válida no provedor e não é apagada/revogada por esta troca; sua revogação continua decisão separada por vínculo suficiente ou inventário de usos aprovado.

A revisão local final adicionou negativa da identidade PID/ticks do frontend na inspeção, antes de qualquer intent/efeito de recuperação. Uma configuração igual com processo substituído não é aceitação. Drafts anteriores permanecem preservados; nenhuma tentativa A/B ocorreu.

## Provas e limites

15 provas prévias reutilizadas;63 novas provas locais PASS:45 contrato real/Operations.stop/start/preflight/encerramento4modos e negativas;6 funções EXATAS do CLI, incluindo falha pré-parada, saída sem seleção, start incerto e retorno NEW sob fence;5 admissão com relógio/provas externas injetados, negando frescor/provider errado antes de gravar gates;4 casos do updater canônico sobre os quatro modos concretos (frescor/schema/catálogo com relógio injetado);3 transportes com os módulos REAIS e HTTP simulado (sucesso/401/áudio vazio). Nas provas de admissão não se certifica a autoridade real de root/provider/RPO; nos testes do CLI são injetadas as observações externas e efeitos OS. Código e arquivos concretos completos são usados, sem fixtures vazias de restore/perfis. Probes testados em Node22.13 local; execução futura usa Node da API verificado no perfil. Sem rebuild, instalação de dependências ou ensaio HTTP real nesta tarefa.

A cadeia READ ONLY na VPS comprova os requisitos de leitura descritos acima, não stop/start, troca real ou acesso funcional ao provider. Novos requests, erro de quota, custo, tempos de interrupção e reconexões são futuros. Não há medição de downtime nova; planejar até150s por fase de validação mais a sequência canônica e recuperação, sem prometer duração contínua de HTTP. Usuários podem observar indisponibilidade da API e reconexões Web; frontend/PG não reiniciam. Não se espera logout porque NEWauth permanece igual; aceite de telas/console continua necessário.

## Capacidade, retenção e custódia

Orçamento específico9.508.698.574B: piso conservador preservado8.794.603.520B + WAL/crescimento512MiB + backup novo128MiB + evidências32MiB + staging/retornos9.451.982B (inclui margem de metadados). Retornos já estão no staging: rubrica extra0, sem contar runtime compartilhado novamente. Arquivo transferido1.413.120B. Amostra18.107.121.664B comporta esse orçamento, sem dispensar reconferência/falhas I/O e dump real limitado à sua reserva. Se ultrapassar, DENY; não diminuir piso ou excluir material.

Inventário/alocação única, decisão de cópia justificada e classificação reutilizam coordenador canônico. Sidecar lifecycle registra propósito/REVIEW/dono/dependências/custódia/revisões. Runtime, dependências, dump e restore são reutilizados; apenas controles/perfis ligados ao novo namespace foram copiados. Nenhum hardlink/symlink novo. Não há limpeza, cron novo ou política automática. Auth/banco/cifragem e a recuperação cron continuam consumidos; não repetir.

Extração isolada de custódia conferiu171 arquivos, sem promoção. Arquivo/índice/recibos e vínculo com a emissão ficam em custódia privada permanente do owner, fora do Git. É off-host em relação à VPS, não réplica física independente. Logs de leitura gerados após a extração são evidências passivas; não reescrevem o review selado. Identificadores e valores nunca integram a publicação.

Gates false/execution false; backup/RPO renovado, root fresco, validação HTTP real, instalação/admissão/B/recuperação e aceite de UI ainda NÃO executados. Estado final: pacote preparado para revisão; execução depende de autorização futura e das provas frescas previstas, sem nova solicitação de console. Segurança externa e risco de segredo+ciphertext históricos OPEN; Meta341/fallback/credenciais remanescentes continuam separados. NEWauth+NEWDB+NEWcipher, leitor histórico, ambos crons, out.15 CLOSED/guarda38 fechada/produção preservados. Sem Prisma/limpeza/env/Telegram nesta entrega.

Responsável operacional Deifson; última revisão15/10, próxima21/10, antecipar após mudança/janela.
