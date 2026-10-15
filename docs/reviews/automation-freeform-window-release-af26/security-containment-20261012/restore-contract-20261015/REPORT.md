# Contrato único de restore — 15/10/2026

**PREPARAÇÃO CONCRETA VALIDADA PARA REVISÃO / NÃO INSTALADA / NÃO É AUTORIZAÇÃO NEM PRONTIDÃO DE JANELA.** Continuidade de199eca3d. v9/v10 e suas negativas/recibos permanecem intactos; não repetir A/B. A tentativa anterior conteve admissão por limite conservador de **3,497 s**, sem parada dos processos e sem medição contínua de HTTP. Auth, banco, console e out.15 CLOSED concluídos; NEWauth+NEWDB, frontend e guarda38 fechada preservados. Segurança externa/cifragem **OPEN**.

## Correção e causa de escape

Antes, o checker aceitava restore retido certificado e `Operations.stop` exigia remoção. `Operations.start` não validava a mesma prova; os testes com bridge substituíam o consumidor real. Agora **restore_contract.py é a única implementação**: o checker, Node `preparation-bindings.proofs`, preflight, stop, start, recuperação explícita e controles delegados chamam esse módulo. Node executa o mesmo Python, sem reinterpretar booleans. A exigência não é reduzida a “retido ou removido”.

A validação exige prova original por bytes/hash, resultado PASS, identidade/bytes/catálogo do dump, hashes de manifest e bindings, fronteira de schema/migrations, ferramentas, isolamento sem provider/aplicação/escrita produtiva, dez conversões/uma opaca/147 históricos/v2/replay e estado do laboratório explícito. Arquivos regulares, owner vigente,600, nlink1, sem symlink. Campos ausentes/divergentes negam. O laboratório certificado **continua retido/parado**; `temporaryDatabaseRemoved` permanece **false**. Nenhuma evidência foi apagada.

A prova reutilizada tem escopo explícito: o dump de RPO mais recente **não foi restaurado de novo**. Reutiliza-se o restore certificado original apenas pela compatibilidade de ferramentas/schema/fronteira já demonstrada; não se atesta restore de ACL/ownership (false), frescor de RPO, saída de writers ou CAS de execução. Esses requisitos continuam separados e obrigatórios. Os bytes originais são preservados, não reserializados para simular o hash.

A auditoria adicional encontrou e corrigiu, na versão nova:

- `delegated.main` ainda excluía `return-before-commit`; agora sua entrada real aceita os quatro modos e exige namespace exato. Defaults de baseline/enumeração do sequenciador também abrangem quatro. Encerramento/restauração da guarda validam o modo efetivamente executado, permitindo retorno isolado sem exigir irmãos ausentes; quatro provas proíbem acesso aos outros modos.
- `DelegatedControls` sobrescrevia controles básicos; cada entrada agora valida a prova antes dos efeitos. Requests e renovações também a validam.
- O gerador de retorno pós-unfence tinha regex de archive limitada ao nome antigo. Agora vincula a linha literal A ao novo destino, exigindo uma única substituição. Sua geração real continua dependente das identidades e VERIFIED futuros.
- Diagnósticos SQL recebem UUID por conexão; nomes fixos anteriores são preservados. Intent/plano/commit/start continuam de uso único; nenhum retry/replay foi ampliado.

## Pacote e validação real

Final: **incident-6683-v4-security-cipher-restore-v13-20261015T100500Z**, já transferida/extraída **inativa**, sob lock, sem sobrescrever geração. As v11/v12 intermediárias permanecem preservadas, sem publicação como prontas: a auditoria do produtor de retorno e do encerramento por modo exigiu novos bytes e outra certificação exata. Drafts locais recusados também preservados. v10 não foi reparada.

[Certificado sanitizado](PREPARATION_SANITIZED.json), [provas](PROOFS_SANITIZED.json), [comparação integral](COMPOSITION_SANITIZED.json), [matriz de consumidores](MATRIX.md), [comandos para revisão](COMMANDS_FOR_REVIEW.txt).

| Artefato | SHA-256 |
|---|---|
| Pacote privado,5.924.546 B | `1e2d010b457fafe98e9ece0496843e00db4e943c5f99a0bd47e3d80dc3fe6e23` |
| preparation-review.sha256 | `3b8f4c77e4d7454321da33f09857ad46345474309ef9534a2a55ad34cf135fcd` |
| window/sequencer-manifest.json | `0b1de8bdacc1b7cd1206c4d280936d5bce5da9f19ff4d72a6706c050bd4d39d0` |
| Política proposta | `15b91a2a41708a1ef0ee8a499fd51f892298561d0d73dbbfb05ceb3fe285899f` |
| Instalador proposto | `722ae81d542bb5c7a50d0820e9133d219c1b058a92f3891232ade3a213589d56` |
| Fonte root exigida | `b6a58431c989a36eebdfa9e443118a7e15fbe0229d102cd896f91d3d193f818d` |

O certificador compara **todos os arquivos do tar** com o candidato e vincula manifest/checker aos hashes do recibo real da VPS. Não admite publicar pelos testes isolados. O pacote não contém runtime reconstruído: inventário runtime, SQL/verify, grant/população, disposição, transporte e decoder preservados.Quatro caches Python locais foram excluídos da nova cópia, sem apagar os originais;69 arquivos derivados alterados (incluindo namespaces/hashes/quatro cópias dos consumidores),5 novos,124 preservados; perfis mudam apenas referências de namespace, não NEWauth+NEWDB. Sem hardlinks/symlinks novos. A cópia de aproximadamente9 MiB serve à geração independente de controle; o runtime volumoso existente foi reutilizado. Custódia/index e classificação de ciclo de vida são recibos próprios, sem editar manifests históricos.

A cadeia real final passou em **15/10,06:51:42.538344 Fortaleza** (09:51UTC), na VPS com arquivos/referências/runtime reais: checker completo, quatro perfis, três referências imutáveis não vazias,147 históricos/readability, controles/guard, dumps600 e conteúdo, identidades API410272/worker410428/frontend188897, inventário SQL/proxy, baseline congelada/out.15 e health/DB. Mínimo deploy/PostgreSQL **18.376.777.728 B**, WAL **83.886.080 B**, acima do piso8.794.603.520 B. É amostra datada, não reserva garantida para futura janela.

Uma leitura adicional do helper `inspect` encontrou **phase_already_exists**, esperado na política b6 consumida; negativa privada preservada e não repetida. Não se declarou inspect de instalação nova PASS. A ação distinta `check-absent` passou. Hash root600/440 fresco não foi obtido por atalho: a instalação futura deverá conferir b6/helper/regra/cadeias/arquivo histórico na sessão legítima do owner. Nenhuma nova sessão sudo foi solicitada para descobrir inconsistências.

Custódia permanente do owner: `re7-private-retention-custody/cipher-restore-v13-20261015`,18 arquivos/recibos mais índice de ciclo de vida,700/600/hash conferidos. Arquivo/index acessíveis fora de temporários. O sidecar inicial selado registra a criação; a classificação corrente está no recibo de revisão/custódia próprio, sem reescrever a história. A cópia no computador do owner não é uma réplica física independente desse computador.

## Provas e limites

**170 casos dirigidos PASS**:64 restore/Operations,79 assertivas reais/preflight/diagnósticos,24 CLI delegado/controles e3 recuperação. Cada ensaio usa cópia completa dos arquivos privados do candidato e plano integral existente de dez conversões; não fixtures vazias. Reutiliza-se somente o simulador de processos, não seus geradores simplificados de configuração. Substituem-se kernel/PM2/DB transport e o acesso ao BUILD_ID remoto por evidência capturada; as condições de Operations, prova, perfis, certificados, intents e fronteiras reais permanecem executadas. Na VPS, BUILD_ID/referências são reais, sem essas substituições.

Casos válidos removido/retido; ausente/erro/hash/schema/ferramentas/migrations/laboratório/tipo/symlink/owner/modo divergentes; guards/fence/processos desconhecidos/config/sobreviventes/socket/DB owner; certificado/generation/ordem/frontend/artefato/binding/start consumido. Retorno ORIGINAL_VERIFIED antes de commit, VERIFIED após commit com resposta perdida e UNCERTAIN negado; SQL/start/recovery não repetidos. Classificação SQL é simulada nesses ensaios de consumidor; a prova PG isolada anterior é reutilizada por hashes de SQL/verify inalterados, não reapresentada como nova execução PostgreSQL.

**Não executados:** renovação RPO/backup nesta tarefa; restore novo; root hash600/440 fresco; instalação/inspect da política nova; fence/saída/ownership DBzero; selagem atual/CAS/commit; sucessores/supervisão pós-deploy; retorno pós-unfence real. RPO é contado da captura real05:43:48 de15/10, nunca do manifesto/sufixo. À leitura final06:51 o limite de uma hora já estava excedido; **backup não é gate de execução satisfeito** nesta publicação. Renovar quando exigido, preservar anteriores e verificar compatibilidade/custódia; se a fronteira mudar, restore dirigido obrigatório. Não reutilizar exit/intents/recibos consumidos. A comparação integral dos 147 campos e opaca já certificada é preservada; nenhuma conversão produtiva ocorreu.

## Estado corrente e próxima ação

Revisar a v13 e seus comandos/limites. Instalação e janela exigem decisão própria; a autorização consumida da v10 não se transfere. Antes de eventual execução: RPO/custódia/capacidade/WAL, root b6/helper/regra, identidades/writers/SQL/proxy e quatro modos frescos. Fonte/plano/intent novos somente após saída comprovada, lock e fase explicitamente autorizada; drift/commit incerto nega, sem ajustar input. OLDcipher nunca volta após VERIFIED; pré-commit original exige observação exata e mantém NEWauth+NEWDB.

Sem aplicação.env, rotação externa, ativação Telegram, desconexão Web, limpeza, cron, abertura de guarda ou mensagens. Risco dos pares segredo+ciphertext históricos e credenciais externas continuam OPEN. Responsável operacional Deifson; última revisão15/10; semanal21/10, antecipada após mudanças conforme runbook. A rotina/adapters de retenção continuam somente publicados para revisão, não instalados/cron ativo.
