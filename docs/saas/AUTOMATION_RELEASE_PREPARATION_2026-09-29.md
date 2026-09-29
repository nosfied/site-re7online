# Release Automação — preparação remota e backup, 29/09/2026

**PUBLISHED FOR REVIEW / NOT DEPLOYED. Automação desligada.** Complementa o [plano](AUTOMATION_RELEASE_PLAN_2026-09-29.md) e os [comandos da janela](AUTOMATION_RELEASE_COMMANDS_2026-09-29.md). Preparação autorizada executada; nenhuma troca de processo, contenção, alteração de guarda/scheduler/cron/boot ou ativação. Sem novos testes/builds: pacotes ba66c241 e worker mínimo previamente verificados reutilizados.

## Releases e configurações

- API/frontend: `/opt/re7online/releases/ba66c24112ccb10f2dfdcced54350f513d399bc6`. Código funcional até d06a92b8. Build frontend `l1eBvPioySXt7NLiuFMkg`.
- Worker: `/opt/re7online/releases/worker-bf5f1d76-f06d49cb-91230f88`, apenas base mínima + persistência f06 + backport912; não é worker completo da API.
- Preparação privada: `/opt/re7online/backups/converta-persistent/preparations/automation-20260929T220203Z`.
- Extração, cópia de dependências e resolução isolada de configuração concluídas às 22:09:18UTC, em 44,072 s. Todos os arquivos conferidos pelos manifests; hashes dos pacotes no [manifesto versionado](../reviews/automation-worker-backport/RELEASE_ARTIFACTS_2026-09-29.json). Package/lockfiles iguais aos ativos; dependências copiadas sem instalar/atualizar e symlinks confinados à cópia. Schema gerado Prisma igual ao ativo; nenhuma migration.
- Releases mode 0700; CJS privado mode 0600. `candidate.ecosystem.config.cjs` resolvido com script/cwd explícitos, Node `/usr/bin/node`, fork/uma instância/watch=false. Derivado do CJS válido e cada variável comparada ao processo real; sem metadados PM2 brutos. Guarda compartilhada e scheduler preservados. `.data` usa o destino persistente atual, sem substituir auth. Nenhuma aplicação iniciada para validar configuração.
- Retorno: `return.ecosystem.config.cjs`, releases anteriores a3d16d4b e worker mínimo f06/042e386a preservados e arquivados com dependências. Saved/fallback/crons copiados privadamente, não modificados.

## Backup fresco e restauração comprovada

Backup 22:10:06–22:13:21UTC (3 min 15 s incluindo catálogo, hashes e leitura dos arquivos compactados). Antes da preparação38.103.977.984bytes livres; após backup35.908.001.792bytes. Sem limpeza/retenção destrutiva. Dump8,425s; API/frontend retorno86,015s; worker retorno32,277s. Essas medidas não representam tempo de recuperação do serviço ou garantia para a janela.

Todos os arquivos abaixo ficam somente na preparação privada; apenas tamanho/hash são versionados:

| Arquivo | Bytes | SHA256 |
| --- | ---: | --- |
| api-frontend-return.private.tar.gz | 279613465 | `535344bbaf48b936e2395baed289d664a79df6a2ffa5b02f85bc23d5cdb02ccf` |
| database.dump | 23132316 | `c32730005bb882532d47290611b5a1a80836c9ebc6a71dd6bd2047b95e42f06a` |
| database.catalog | 48617 | `9ecf014b9902d974a21bc4e06c9f4fa00a8c904ac0122825b4e92f861a2fe4c9` |
| content.private.tar.gz | 461711466 | `413083a841d50f4d85dab34fc8a708fcb6cbd67299fc9b5bf240e7c41d645097` |
| runtime-data.private.tar.gz | 2396683 | `6c1e41f5173b4bb4af0ae14bcde98bc0481c237be73916a9768d8158c9559354` |
| configuration.private.tar.gz | 7282 | `c40d41d21590a5c14fff4d93dd2c3492b6f4fa4c74d97ec0192fcd8e284609ba` |
| worker-return.private.tar.gz | 95989198 | `da6abc678d3921ddb6df5f82aacb98237455e2b3b5d5217bdd2746b515303e00` |

`pg_dump -Fc` terminou exit0; catálogo `pg_restore --list` e `tar -tzf` dos arquivos compactados PASS. Cópia do dump local teve o mesmo SHA256. Restauração 22:14:19–22:14:24UTC em PostgreSQL isolado 127.0.0.1:55432, sem apps/providers/schedulers: `createdb re7_release_restore_20260929_220203`; `pg_restore --no-owner --no-acl --exit-on-error`; consultas de catálogo, contagens e checksums; `dropdb` somente desse banco. Restauração 5,091 s; sequência completa 5,307 s. Confirmada ausência do banco temporário após remoção. Dump/evidências preservados privadamente.

Resultado: 60 migrations concluídas, zero divergência de checksum contra o candidato, jobs/grupos/leases=0, quatro registros auth, opt-in Automação true=0. Nenhum restore em produção. O dump é consistente; arquivos/auth capturados com sistema vivo não são snapshot atômico com DB. Backup não comprova reconexão de sessão ou replay de inbound. Capturar novamente guarda/auth após futura saída dos processos, sem restaurá-los sobre estado novo.

## Produção preservada e limites

Reconferências 22:11:29–22:11:32 UTC e final 22:16:27 UTC: PIDs/restarts/hashes ativos iguais ao preflight imediato; API/frontend a3d16d4b e worker mínimo f06/042e386a. HealthAPI/DB e worker ok. WEB_SESSION: 3 connected / 1 disconnected / 1 pending, quatro registros auth; saved/fallback e cron inalterados; boot enabled/inactive. Guarda OPEN geração 5, tasks=0, fault=null, **drained=false**; scheduler habilitado como antes. Fila/grupos/leases/sending/agendamentos0; Automação true=0. Zero momentâneo não é drain. Não foi provocada varredura ou envio.

O limite lock→PID permanece: não há vínculo individual comprovado. A barreira futura exige saída da árvore antiga com start ticks, desaparecimento dos sockets capturados e backends/locks, com zero outros clientes DB/locks no intervalo controlado. Terceiro legítimo ou sobrevivente bloqueia sucessor; não matar sessões ou apagar locks. Sem coleta indefinida: escalar ao owner dentro do horizonte acordado. Timeout/silêncio/lock livre não comprovam drain; término PM2 não será descrito como gracioso. Nenhum kill adicional automático por prazo.

## Decisão final ainda necessária

1. Início e fim da janela em America/Fortaleza; confirmar execução única Deifson/Codex e disponibilidade para recuperação.
2. Horizonte de escalonamento e ponto de iniciar retorno antes do fim; definir quem decide extensão se ownership impedir sucessor/retorno. Tempos de backup/restore não justificam duração garantida de indisponibilidade.
3. Aceite explícito do risco residual de inbound/outbound/auth não observáveis durante interrupção WEB_SESSION, incluindo política de término PM2 e impacto API/META_CLOUD/webhooks/outros tenants. Alternativa: adiar para correção própria de shutdown, não implementada aqui.
4. Autorizar a janela coordenada de contenção/supervisão e fechamento/drain/restauração das admissões ao estado inicial. Nenhuma dessas ações foi autorizada implicitamente pela preparação.

Antes da parada, qualquer divergência de identidade/config/backup, trabalho novo sem decisão, janela indefinida ou concorrência aborta mantendo processos atuais. Depois da parada, não iniciar sucessor/retorno enquanto houver proprietário antigo. Recuperar par compatível preservado sobre DB/auth atuais; sem restore, logout, limpeza ou retry incerto. Retorno a3/minimal-f06 preserva persistência concorrente/SECULT mas reintroduz912; revogar chave mantendo binários novos é cenário distinto. Ativação em tenant indicado e aceite funcional posteriores, separados do deploy com default false.

Campanhas/CRA aguardam validação funcional do owner; respostas automáticas em andamento constituem limitação separada; inatividade Guia pausada; SECULT encerrada;6683 CLOSED.
