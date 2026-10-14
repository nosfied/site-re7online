# Decoder+cifragem — preparação operacional recusada por CAS, 14/10/2026

**DENY / NÃO PRONTA PARA JANELA.** A geração nova `incident-6683-v4-security-cipher-20261014T180000Z` foi registrada com execução e cinco gates falsos, antes de staging runtime, quatro modos completos, política ou instalador. Não instalar95eda nem executar d92 como janela. Produção continua intacta: NEWauth+NEWDB, API410272, worker410428/afbb, frontend188897, out.15 CLOSED e guarda38 fechada. Segurança externa/cifragem OPEN; funcionalidade local do produto não depende desta preparação. Nenhuma limpeza, token, desconexão Web, envio, SQL produtivo ou controle de processos.

## Decisões aprovadas registradas

[Registro separado](DESIGN_DECISION.json): grant95eda044e469fe458d07fbdf5ec416aea7861873550f7db2ec1c7f0127d43d62, população147 exata/sem prazo ou expansão automática; v2 independente com chave/contexto dedicado; disposição opaca Telegram exata. Aprovação somente de desenho/preparação, não de instalação/aplicação. Bytes do grant não foram editados para inserir aprovação.

A conta/tenant/linha/ciphertext/proveniência originais da Telegram coincidem com os da disposição selada revisada. O selo de captura atual73bb47b4914672efec7938446eef5f9be2c5e3298ed00a19cc5636b19fa35c64 registra apenas proveniência nova do inventário, sem ampliar a linha autorizada. Opaque intacta/não ativada, nenhuma recuperação criptográfica alegada. Risco residual permanece: posse de segredo+ciphertext históricos permite leitura fora dos gates da aplicação; grant restrito não neutraliza essa exposição.

## Capturas e negativa efetiva

| Prova | UTC / Fortaleza | Resultado |
|---|---|---|
| Processos/configuração/kernel/guarda/capacidade, duas amostras |14/10 18:03:15 /15:03:15| identidades/cfg preservadas, guarda38 fechada/sem tarefa e markers; mínimo18.454.896.640B |
| Inventário cifrado completo | captura anterior ao dump, SHA c9ad2bef… |11 cifras/uma inválida,341 vínculos,126 eventos/147 campos; quatro Web alteradas desde captura revisada |
| Dump fresco off-host | início18:07:32 /15:07:32; fim18:07:52 /15:07:52|40.261.687B, SHA6c5354ea95ab3eef87d8731d2004d5409da5d42632678ac3f560fd41beeafd73 |
| Leitura sudo root do owner | horário privado da captura | dez arquivos, hashes/cadeia/modos, zero mutações |
| SQL/proxy/cron/supervisão pelo leitor canônico |18:28:36 /15:28:36| leitura independente/noWork/baseline PASS; inspect consumido não reutilizado |
| Restore/147/v2 |18:32:11 /15:32:11|70 tabelas/66 linhas de migrations restauradas;147 campos e v2 PASS; conversão10 DENY |

As quatro linhas Web inicialmente divergiam da captura revisada em d92. Foram capturadas de novo, sem causa imputada, e originaram o **novo** planHash67e57724e16693e3f64bc552a4a6e7324dbadd1d36c0966cf706d6032bdf7840. Esse input não foi editado após a recusa.

O restore do dump iniciado quatro minutos depois demonstrou **nova alteração de duas linhas WhatsApp**: `secretCiphertext` e `updatedAt`; respectivas contas não divergiram. O verificador real READ ONLY retornou11 linhas totais, **9 originais compatíveis**, uma opaca compatível e zero recibos novos; MFA/webhook continuavam vazios. [Diagnóstico sanitizado](cas-denial.sanitized.json). Não foram apenas representações diferentes de timestamps: a inspeção comparou datas normalizadas e os campos das linhas. Nenhum valor, ID de tenant/conta ou conteúdo privado é publicado.

Consequência exigida pelo contrato aprovado: **bloquear**, não recriptografar/reaplicar, não atualizar hash/input para PASS, não repetir backup/captura numa busca automática de estabilidade. A causa histórica específica do rewrite não foi apurada; “refresh de sessão”, atividade humana e outras origens não são conclusões desta auditoria.

## Backup/restore: alcance real

O dump é um arquivo pg_dump consistente próprio, capturado off-host e restaurado integralmente em PG16 isolado, Unix socket/TCP desabilitado, sem aplicação/provider. A primeira tentativa local negou antes do restore por limite do caminho do socket; foi preservada e corrigida com socket curto em diretório local novo. A segunda restaurou dados, mas negou o CAS **antes** do SQL de conversão.

Inspeção posterior somente local comprovou70 tabelas,66 linhas de migrations e leitura dos147 históricos pelo compilado36f51ebe…, payloads intactos e escrita/leitura v2 independente. [Prova parcial de restore](restore.sanitized.json). As dez conversões/recibo/retornos não recebem PASS neste dump. Os testes sintéticos já válidos de d92 continuam prova do algoritmo, não prova desta ocorrência. O banco local está parado e conservado privadamente para diagnóstico; não alegamos remoção do banco temporário, restauração de ACLs/owner produtivos ou ensaio integral da nova fronteira.

Limite adicional: esta captura direta pg_dump não registrou aquisição do lock canônico de backup. Logo, embora o arquivo e restore sejam válidos, não foi emitido certificado operacional completo de backup/RPO/consumidores. A próxima geração deve usar o procedimento canônico com lock e custódia; não inferir conformidade a partir de um manifesto ou hora de download. RPO usa18:07:32, não horário do relatório.

## Root e dependências

Hashes efetivos, lidos na sessão sudo do owner: helper8de358fd60c6e7c880166651b45d7ebd60c8f9b102759ff7f7628796fda1b212; política9c7b44d58c96d0aa1dd9f6b7d790d810407e3ea364b01a748473c06928efff4c; regra literal62b5a2ac1d56b013f6db4bb8180b0637b985786214f4bc3ce0e5f8d3f7c5111a. Root600/644/440 e cadeias observadas; permanente frontend preservada. Não instalar delegação/helper/sudoers.

O `inspect` da política bancária consumida negou `phase_already_exists`. A recusa permanece íntegra, não foi repetida, apagada nem tratada como certificado atual. SQL/proxy e controles foram lidos separadamente, sem reparar política/bindings consumidos. Uma futura política terá geração/phase path próprios, source identities reais e arquivo histórico novo; a política9c7b44 é apenas fonte instalada a arquivar pelo instalador futuro. Não existe hash de política/instalador novo certificável nesta preparação recusada.

A composição36f51ebe…, dependências e quatro adapters/modos locais revisados em d92 foram preservados. Não repetimos build nem testes não afetados. Não houve cópia volumosa/staging antes do gate de coerência. Retornos continuam o contrato: reader compatível+NEWauth+NEWDB; pré-commit só chave ainda efetiva com ORIGINAL_VERIFIED; pós-VERIFIED somente NEWcipher; incerto bloqueia sucessor/replay/partidas automáticas.

## Capacidade, custódia e próxima ação concreta

Orçamento8.776.581.120B, mínimo medido18.454.896.640B; margem9.678.315.520B. WAL112MiB em duas amostras curtas e nenhum erro de escrita observado nos30min consultados. Não certificado de janela futura/growth de longo prazo/drain. Restaurar foi exclusivamente local; live SQL nunca sofreu apply.

[Custódia privada permanente](custody.sanitized.json) guarda dump, fontes, root/state/inventários, input recusado, stderr e provas, com hashes/índice/receita; originais e gerações anteriores intactos. Diretórios700/arquivos600, acessível ao owner, sem alegação de réplicas físicas independentes. Dumps PM2 e NEWauth/NEWDB continuam nos controles anteriormente comprovados; não houve save, chmod ou restart.

Próximo passo técnico: capturar inventário e dump **da mesma transação/snapshot exportada READ ONLY** no procedimento de backup com lock canônico, em outra geração. Manter o holder vivo até inventário e dump concluírem; `pg_dump --snapshot=ID` compartilha a imagem, eliminando a lacuna entre duas capturas independentes. [pg_dump16](https://www.postgresql.org/docs/16/app-pgdump.html), [snapshot synchronization](https://www.postgresql.org/docs/16/functions-admin.html). Esse método ainda precisa integração/ensaio local dos transportes; **não foi executado em produção**, não é certificado de estabilidade posterior e não congela writers.

Mesmo com snapshot coerente, comparar novamente as linhas ao estado efetivo antes da janela e após a saída/fence canônicos; nova mudança deve negar. Priorizar a próxima preparação em horário de menor uso informado pelo owner (após18hFortaleza), sem presumir silêncio/estabilidade. Não usar espera ou recapturas automáticas para obter PASS. Não emitir janela com planHash desta geração recusada.

Após essa prova: restore isolado completo10+opaca+147/v2, custódia/RPO/capacidade/inventário/retorno -> nova V4 quatro modos/política/instalador e comandos de execução para revisão. Não há autorização de conter processos, trocar chaves ou aplicar SQL para resolver esta lacuna. OpenAI emissão conhecida/troca coordenada permanece preparação separada de d92, sem criar/revogar e sem exigir recibo antigo/suporte.
