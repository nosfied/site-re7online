# Snapshot produtivo coerente certificado; preparação DENY por CAS — 14/10/2026

**Snapshot/restore: PASS. Preparação V4: DENY_FRESH_CAS_DRIFT / NOT WINDOW READY.** A captura autorizada integrou inventário e pg_dump na mesma transação/snapshot READ ONLY sob o lock canônico. O restore isolado certificou dez conversões, Telegram opaco,147 históricos e v2. Depois, quatro bindings divergiram: o CAS negou e o plano não foi alterado. Não instalar ou executar envelopes offline anteriores; nenhum apply/deploy/stop/start, mudança de chave ou política produtiva nesta tarefa. Auth/banco/console aceitos; NEWauth+NEWDB preservados. Out15CLOSED/guarda38 e segurança externa/cifragem OPEN permanecem.

## Transporte, recusa e correção dirigida

Host sem libpq; Node/Prisma e PostgreSQL do container já existentes. `backup.lock` efetivo `/opt/re7online/backups/converta-persistent/backup.lock`, deploy1000:1000,640/nlink1; lock exclusivo não bloqueante antes de abrir o holder. Configuração pós-banco confrontada com `/proc` e três valores NEWauth aprovados, sem imprimir valores. Inventário por Prisma/TCP do perfil legítimo; dump/identidade por TCP loopback no container com NEWDB em ambiente privado, sem senha em argv. Mesmos banco/OID/usuário/versão/system identifier nos dois canais. Não usou senha antiga do ambiente de criação Docker.

[holder-paged.cjs](holder-paged.cjs) conserva RRO READ ONLY, timeout8s/consulta, lock_timeout1s e orçamento180s da transação. Inventaria famílias,341 referências externas, contas e126 eventos/147 campos. Exporta o próprio snapshot após as leituras; [transport.py](transport.py) mantém holder/lock até fim do dump, confirma protocolo/release, termina somente filhos próprios em falha e libera recursos. Protocolos/dados privados e outputs600/diretório700; nenhum retry. Não para writers ou executores de produção.

Primeiro transporte local negou após release porque stdin mantinha Node vivo. Corrigiu-se o fechamento do pipe e ensaiou-se a nova versão. Primeira captura produtiva `cipher-shared-snapshot-20261014T212400Z` negou antes de READY/dump, com Prisma P2010. Erro do Node não incluiu meta SQLSTATE. Logs delimitados do intervalo preservam cancelamento por statement_timeout e o SQL correspondente à contagem com jsonb_typeof; diagnóstico estreito de identidade/export/setting/count passou. Não reutilizamos essa negativa como certificado.

A varredura inteira foi substituída por páginas materializadas de1000 eventos por PK, cursor uuid, mesmo predicado, sem index/migration, sem omitir registros, limite600 páginas e contagem126/expansão DENY. Ensaio no PG16 isolado comprovou inventário completo **igual** ao leitor anterior. Nenhum timeout/retry foi ampliado. Nova captura depois desse delta de transporte, em namespace próprio; não foi recaptura por drift ou para obter estabilidade. [Fontes do executor usado, uma invocação](capture_reviewed_once.py); os paths consumidos recusam novo uso.

## Captura e certificado real

| Prova | Resultado |
|---|---|
| Captura real sob lock |14/10 **21:40:36.590–21:40:57.145 UTC /18:40:36.590–18:40:57.145 Fortaleza**; hora conservadora de início para RPO, não suffix/manifest |
| Dump |40.682.634B; SHA **d85908a917818068ee0a1b3c37713b581f00f882ad7605c7a477fbbef02af1e3** |
| Inventário |SHA **52d666e5fab18805e9cce5ec4454c52dc0439ca4d18cbcb0ace3023c925eebe2**; famílias/contas/seeds da imagem compartilhada |
| Plano inicial dessa imagem |**5eb082e2359127373952d5b669cd4d74a48d75775eb624dd1ef3b0ea371a13fe**; dez legíveis/uma opaca, mesma linha/tenant/conta/proveniência autorizados; sem novo token Telegram |
| Restore isolado |70tabelas/66migrations; ORIGINAL_VERIFIED → dez conversões SQL → VERIFIED; opaca integralmente preservada;147/payloads iguais; v2 independente; SQL replay0 eventos adicionais |
| Driver replay |apply após VERIFIED **nega** `cipher_original_not_proven`; ensaio SQL idempotente foi explícito e exclusivamente local |
| Root atual |owner leu dez arquivos/cadeias/modos por sudo, zero alterações; helper8de/regra62b5/política9c permanecem. Não repetir inspect consumido. |

[Captura](capture.sanitized.json), [restore](restore.sanitized.json), [root](root.sanitized.json). Tar36f51ebe/grant95eda, dependências e contratos/negativas pré/pós-commit/incerto válidos reutilizados; zero rebuild. Ajustes do harness local (ID textual da Telegram e classificação correta de replay negado) preservados; restore não foi refeito para esses ajustes. Banco local está parado e conservado. `--no-owner --no-acl` comprova dados/schema/fronteira, não restauração produtiva de ACLs/roles. Nenhuma aplicação/provider iniciou no restore.

## CAS fresco: impedimento preciso

Verificador canônico READ ONLY: total11, **original7**, current1 (opaca), opaque1, recibos0. Inspeção somente dos onze bindings, sem novo plano/inventário substituto, confirmou **quatro linhas diferentes**: três com secretHash/secretCiphertext/updatedAt e respectivas contas com metadata/updatedAt; uma com secretCiphertext/updatedAt, conta igual. Telegram não divergiu. [Prova de campos](cas-drift.sanitized.json). Não há atribuição de causa/autoria às mudanças.

A imagem do backup é coerente; o estado posterior mudou. Não reaplicar, atualizar plano/hashes oportunisticamente ou capturar de novo automaticamente. Fonte volátil precisa decisão explícita de protocolo/geração; não remover CAS ou ignorar metadata/controle. Depois de eventual revisão, CAS completo continua obrigatório antes da janela e após fence/saída. Ausência de writers humanos não é certificado de estabilidade.

Nova geração **na VPS** `incident-6683-v4-security-cipher-snapshot-20261014T214100Z`: sidecar/estado DENY, execution-authorized=false, cinco gates false. SHA lifecycle **d80bc6c5a0ee54f06dad7d05a58eb9a6874d13c76dfd7f804f14a4a184ee65bf**. Não houve cópia volumosa de runtime após a negativa, montagem dos quatro modos operacionais, emissão de instalador/política executáveis ou reaproveitamento de certificados consumidos. Esses itens **não estão concluídos**; emitir uma janela sobre este input seria contrariar o CAS.

Próxima ação concreta: revisar o protocolo de vinculação das linhas Web voláteis para uma futura geração/janela explicitamente autorizada, mantendo comparação integral e sem derivar novas linhas silenciosamente depois do DENY. Esta publicação não escolhe captura sob contenção (stop/fence não autorizados), relaxamento dos campos ou repetição da captura. Até decisão, manter esta geração negada. Os quatro modos/retorno compatível já ensaiados permanecem fontes de código, não pacote operacional atual aprovado.

## Estado protegido, capacidade e custódia

Conferência final **23:05:26UTC /20:05:26 Fortaleza**: API410272/worker410428/afbb/frontend188897 preservados; guarda38/tasks{} e markers ausentes; SQL/noWork/baseline congelada de out15/recibo/CRM/usage preservada. [Estado](state.sanitized.json). Saved/fallback600 e variáveis atuais conferidos por leitura separada. Não houve logout, envio, retomada, criação de credencial ou desconexão Web.

Mínimo deploy/PostgreSQL **18.479.755.264B**, orçamento8.776.581.120B, margem9.703.174.144B. WAL amostrado80MiB na leitura final; é amostra, não tendência garantida. Timeout SQL de leitura não foi confundido com erro de disco. Sem limpeza ou redução de reservas. RPO/capacidade/CAS e ownership precisarão nova conferência na janela futura; esta não está liberada.

[Custódia off-host](custody.sanitized.json): dump/inventários/denials/root/CAS/provas/planos e três `.env` originais, conteúdo+metadados/índice/receita,600/700, owner acessível;78 arquivos/51 objetos únicos,237.825.040B, SHA índice **f61953e3b370fd82898f493e56df4dc24b7847e53aea236315155fd02c3a2170**. Não é réplica física independente do workstation. Cluster local preservado fora do índice, snapshot principal/manifests anteriores intactos. Geração negada: manter recibos/fontes necessários; arquivável em custódia após revisão, sem retirada agora. Responsável Deifson; revisão14/10, próxima21/10 antecipada após mudanças. Risco de segredo exposto+ciphertext histórico permanece.

## Complemento `.env`

[Fontes, consumidores e reconciliação seletiva](ENV_REFERENCE_RECONCILIATION_FOR_REVIEW.md). Foram identificados o arquivo do projeto e dois legados da VPS; referências obsoletas confirmadas, sem concluir que arquivos legados sejam a autoridade dos processos atuais. Plano privado preparado, originals preservados; nenhuma atualização foi aplicada. Console recuperado continua aceito. Reconciliação de referências é pendência distinta da mutação cifrada e não reabre auth/banco.
