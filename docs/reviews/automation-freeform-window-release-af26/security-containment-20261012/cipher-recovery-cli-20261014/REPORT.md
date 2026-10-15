# Recuperação explícita da cifragem V4 — revisão operacional

**LOCAL VALIDATED / NOT DEPLOYED.** Lacuna do CLI corrigida em nova geração completa `incident-6683-v4-security-cipher-recovery-v9-20261015T025000Z`. A v7 publicada em 3f3d1a6e e os drafts locais permanecem íntegros. Esta tarefa não acessou nem escreveu na VPS, não instalou política, não conteve processos e não reaplicou SQL. A geração v9 está no cofre privado do owner, com extração local conferida; transferência inativa e checker na VPS são requisitos explícitos de A0, antes de qualquer A/B.

[Roteiro integral A0/A/B/C/D](COMMANDS_FOR_REVIEW.txt). Não há autorização de janela. Os cinco gates e execution-authorized permanecem falsos, seal-current vazio, sem intent/recibo de operação. O sufixo da geração identifica o pacote; não representa horário de captura de backup ou leitura produtiva.

## Delta mínimo

- Novo CLI expõe `record-original`, `recover-original`, `record-verified` e `recover-verified`, exigindo `--operator-decision` correspondente. Inspeção/registro/recuperação adquirem o lock exclusivo canônico; run e retorno pós-unfence usam o lock já adquirido pelo sequenciador, evitando aquisição dupla.
- `record-*` classifica novamente pelo SQL canônico READ ONLY, verifica fonte/plano/intent de selagem, scope/phaseId e intent de commit correspondentes e grava o recibo exato. Não executa selagem, conversão, replay ou partida. Observações contraditórias, recibo existente ou classificação ambígua negam.
- `recover-*` exige outra classificação fresca e o recibo correspondente, valida modos/manifests/NEWauth+NEWDB, guarda38 fechada, frontend e fence. O modo vem do estado observado pelo sequenciador. Antes de começar, grava intent próprio exclusivo; qualquer tentativa posterior, mesmo após falha, nega. Certificados novos de saída e ownership DB continuam sendo produzidos/exigidos pelo retorno canônico. Intent ou start ambíguo não é ignorado.
- A execução normal salva antecipadamente a baseline completa (PID/start ticks) em arquivo privado exclusivo, permitindo recuperar em outro processo sem recapturar uma baseline que esconda drift. Ausência da baseline nega; não se inventa uma para a v7.
- ORIGINAL_VERIFIED permite apenas return-before-commit, com reader compatível e NEWauth+NEWDB. VERIFIED permite apenas os retornos NEWcipher. O recibo VERIFIED original, se já existir, é reutilizado após inspeção; não se tenta regravá-lo. Uma observação ORIGINAL registrada impede selecionar a alternativa VERIFIED no mesmo protocolo.
- O preparador de retorno fresco copia também o novo módulo de recuperação. Após unfence, a alternativa é D, com geração/política/identidades próprias; não reaproveita starts ou certificados consumidos.

Nenhum módulo runtime, grant, disposição Telegram, população, renderer SQL, driver, fase transacional, start gate ou boundary histórico foi alterado. Somente código operacional novo e referências/manifests derivados da nova geração. O retorno não admite OLDcipher após VERIFIED. Se a classificação exata negar por evolução concorrente, C não a converte em PASS; D continua sujeito ao leitor compatível e aos controles já aprovados.

## Provas executadas e reutilizadas

**18 ensaios dirigidos do novo CLI passaram**, invocando o parser e `main` com os argumentos publicados. Sequenciador e consumidores são os canônicos; ações de processos/política usam bridge isolado. Cobrem pré-commit, resposta de commit perdida, decisão ausente, ambiguidade, intent divergente, observação repetida/contraditória, ausência de recibo/baseline, gates falsos, manifest drift, frontend divergente, lock ocupado, start incerto/consumido, recuperação que falha sem replay e caminho normal/sucessor com NEWcipher.

**Duas alternativas também passaram com PostgreSQL16 real isolado**, usando `verification_sql` canônico e as bases já certificadas. A base com commit efetivo/resposta perdida foi reutilizada, não houve nova conversão ou restore. ORIGINAL_VERIFIED e VERIFIED foram registrados e encaminhados pelos mesmos argumentos C1/C2. A execução de processos foi simulada; não se apresenta essa prova como uma janela produtiva. Zero conexões produtivas, zero selagens posteriores à falha, zero replay SQL.

Conferência local dos quatro modos: ecosystem/configs, hashes, ownership600, scripts/manifests, grant95eda, gates falsos e ausência de intents passaram. Runtime, scope, source config, writer inventory, backup/restore, driver, boundary, SQL/phase e start gate foram comparados byte a byte com a v7. A primeira tentativa de PostgreSQL foi bloqueada pelo socket do sandbox; a tentativa seguinte identificou uma serialização incorreta apenas na fixture. Logs privados preservados; o ensaio final usou o digest canônico e passou. Não houve alteração dos artefatos selados para aceitar esse ensaio.

Reutilizados: runtime36f51ebe, snapshot/dump d859 e restore certificado (dez conversões, Telegram opaco,147 campos, v2), concorrência/CAS/locks/deadlines já aprovados. Nenhum rebuild, novo dump, investigação auth/banco/console ou consulta OpenAI.

Comandos locais reproduzíveis:

```bash
python3 -B docs/reviews/automation-freeform-window-release-af26/security-containment-20261012/cipher-recovery-cli-20261014/test_recovery_cli.py
# PostgreSQL isolado: usar um RE7_LAB_SUFFIX novo; não sobrescrever provas existentes.
RE7_LAB_SUFFIX=-nova-prova python3 -B docs/reviews/automation-freeform-window-release-af26/security-containment-20261012/cipher-recovery-cli-20261014/test_recovery_postgres.py
```

## Hashes finais e custódia

| Artefato | SHA-256 |
|---|---|
| Política proposta | `1e8d79d3e15d39c4629dc1ee113955524254f1a091f21794cdae0ca332fdfb2f` |
| Instalador | `bdab2cbed806cdd6eebff24a68d83fe529c4dde06e46d45781c45a1f596117cc` |
| CLI | `44c7eb3187e444998822b69f4c507376e1c6e638a37ebf520d5b198e6d7e40c7` |
| Recovery actions | `31ad5d6dd672033477a239878f3f8c1d8fc6a94dbca26c53c03fa8eda2e37d0f` |
| Window manifest | `53585a3803da641dd5155ccd0dd96de67d2d55d134004401c6782f04244bb6fb` |
| Review manifest | `f377d64456d2496746d2ca5c413829949e58b1b221574ac073e951cfd258475d` |
| Pacote privado | `7ad30d08d9966838bd81a914dcc3019bd2742a1095cd6f07e76cf1c8734933cf` |

Cofre do owner: `/home/deifson-oliveira/DEIFSON/re7-private-retention-custody/cipher-recovery-v9-20261014`, diretório700, pacote/índice600. Pacote9.000.960 B, índice de arquivos/modos/hashes e extração comprovada. Fora da VPS e do Git; não equivale a réplica física independente do computador do owner. A v7 e suas evidências não foram modificadas.

## Gates restantes e limites

A decisão de janela precisa preceder A/B/C/D. A0 deve transferir/conferir o pacote inativo na VPS; o checker não foi executado ali para esta v9. Antes de contenção: conferir novamente root9c7/helper8de/regra62b5, capacidade/WAL, backup/RPO contado da captura real, custódia, processos, SQL/proxy, consumidores/cron/boot, saved/fallback600 e guard/out15. Reutilização do restore exige mesma fronteira/schema/ferramentas; não há atestado novo de RPO nesta tarefa.

Reserva canônica8.776.581.120 B preservada. Para transferência/extracão da v9, exigir adicional conservador18.001.920 B (duas vezes o pacote), total **8.794.583.040 B** pelo mínimo deploy/PostgreSQL, além de reavaliar crescimento/WAL conforme runbook. A amostra anterior18.432.376.832 B é datada e não constitui CAPACITY PASS atual. Nenhum runtime/dependência/dump será copiado por A0.

Saída/fence/ownership e classificação são provas imediatas da janela, não certificados antecipados. Após commit incerto: somente C e decisão explícita; após recuperação incerta: preservar intent e inspecionar, sem replay. Risco residual segredo+ciphertext históricos continua documentado. NEWauth+NEWDB, frontend, out.15 CLOSED, seis resultados/cinco não enviadas e guarda38 permanecem preservados por ausência de intervenção. Segurança externa/cifragem OPEN; propostas.env e credenciais externas separadas.

Responsável operacional: Deifson Oliveira. Revisão14/10/2026 Fortaleza; próxima21/10, antecipada após qualquer mudança ou janela. Próxima ação: revisar este pacote/roteiro e decidir a janela, incluindo transferência inativa e requisitos imediatos; não executar a v7.
