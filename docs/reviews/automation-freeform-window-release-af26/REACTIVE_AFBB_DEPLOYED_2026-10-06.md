# afbb — implantação coordenada concluída em 06/10/2026

**DEPLOYED TECHNICALLY / FUNCTIONAL ACCEPTANCE PENDING.** Execução única da preparação corrigida em `4dceb9a57af9091b9cd8e477e7b4baf67433137c`, após revisão independente e autorização existente. [Atestação sanitizada, hashes e resultados](reactive-baseline-prepared/deployed.sanitized.json). A tentativa consumida de d717f113 e os backups/provas anteriores permanecem preservados; não reutilizá-los.

## Releases efetivas

| Componente | Release / identidade conferida | Resultado |
| --- | --- | --- |
| API | `afbb7455f320793e05a25875e8a5f13f98cabf90`, PID3153929/start ticks2107666112 | PASS, zero reinícios |
| Worker | `worker-minimal-reactive-afbb7455-verified`, PID3154150/start ticks2107666513 | PASS, zero reinícios; somente pacote mínimo revisado |
| Frontend | af26, PID2537692/start ticks2081554427, BUILD_ID `J5cHyVKiKEI5xxiGBY5If` | PRESERVED, sem stop/start/rebuild |

Tar mínimo exato SHA-256 `8b67292578090a2f564e4a9bf399b002e667bba723c936859fc438aa1221f5c8`, manifesto completo `650b2a216b595f858c4b9b5110d2dbcd8909bc4a7ec655c3560734c5641ca398`: 7.044 arquivos e 11 symlinks internos conferidos antes da janela; closure preservada e auth/data externos conferidos separadamente. Overlay API `0ac7a6b6a02bc8fddbf2a26359dbdef2a2923e461b3ab15179af49a2d8485965`; schema/migrations/lockfiles/Prisma preservados. Builds e provas funcionais aprovados foram reutilizados, sem reconstrução ou novas suítes.

## Backup fresco e gates

O backup anterior tinha cerca de 12 horas e não foi considerado fresco apenas por estar íntegro. Foi arquivado com seus manifests/restore/bindings em subdiretório privado; nova captura terminou às **13:00:20 UTC / 10:00:20 Fortaleza**. Dump de 27.858.327 bytes, SHA-256 `b075448b0ae45967794fd7e289174b01146bb5630d45a754c477227ec2bc4011`, 614 objetos de catálogo; três arquivos privados de configuração/dados/conteúdo com leitura verificada.

Restore local PostgreSQL16.15, somente socket Unix, sem aplicação/provider: exit0, 60 migrations concluídas, nenhum checksum divergente/arquivo ausente, seis rollbacks históricos. Banco temporário removido e servidor isolado parado. Dump/FS não constituem snapshot simultâneo; writes posteriores ao dump permanecem na produção. Nenhum restore produtivo.

Manifests/proof-bindings de backup foram atualizados antes dos gates, preservando baselines e bindings de identidade/configuração. Contrato completo dos baselines passou antes de qualquer CAS. Reconfirmação imediata **13:10:14 UTC**: mesmos três processos b9/af26, quatro sessões/cinco auth, guarda aberta31, proxy/bindings/controles íntegros e exclusividade disponível. Zero trabalhos no recorte não foi usado como drain do worker.

Deifson instalou exclusivamente a política `00912bf4e0f44d88b0c9c639ba8a3d7dd773b317ea24f9df35dbef4e4e06add9`, root:root0600; original arquivado. Helper `8de358fd60c6e7c880166651b45d7ebd60c8f9b102759ff7f7628796fda1b212`, root:root0644 e nove chamadas sudo inalterados; sudoers root:root0440, cadeia e visudo PASS. `inspect`: política nova, fase nula, processos de origem vivos. Gates habilitados somente após as verificações.

## Sequência e interrupção

Baseline → fechamento CAS da guarda31→32/drain de campanhas → prova/preflight → contenção/iniciadores → stop-pair uma vez → saída/certificados/zero backends e advisory locks → API → prova V4 fresca → worker mínimo → controle HTTP sob nft → captura/renovação → saved/fallback → unfence → validação completa → guarda33 → restauração dos controles.

- Entrada na contenção: **13:10:46.713 UTC / 10:10:46.713 Fortaleza**.
- Saída comprovada do par antigo: gate stop-pair PASS às **13:10:57.745 UTC**; nenhuma coexistência aceita pelo procedimento.
- API start PASS **13:11:00.118 UTC**; worker start/identidade e controle HTTP passaram antes da retirada.
- Retirada da barreira confirmada: **13:11:19.697 UTC / 10:11:19.697 Fortaleza**.
- Conclusão de controles: **13:11:26.594 UTC / 10:11:26.594 Fortaleza**.

Intervalo de contenção observado: **32,984 segundos**. É o intervalo da barreira, não medição individual de indisponibilidade de cada request ou garantia sobre operações antigas pendentes. Shutdown antigo conserva o risco residual inbound/outbound/auth autorizado; nenhum resultado incerto foi reenviado. Sem bypass, kill adicional, start repetido ou retorno.

Uma primeira amostra de captura negou `worker_capture_churn`. A renovação limitada conseguiu dois samples consistentes; ocorreram duas capturas frescas no total, com histórico preservado e revalidação integral pelo helper. Nenhuma ação privilegiada retornou erro. Não foi necessário escalonar15 minutos.

## Verificações e limites

Leitura final **13:12:34 UTC**: API/DB/controle HTTP worker PASS; quatro sessões connected e cinco auth correspondem ao baseline, zero reinícios. Frontend manteve identidade. Guarda aberta33, tasks{}, sem falha; scheduler permanece habilitado e seu evento natural de bootstrap `campaign.schedule.processor.started` observado. Não há prova separada de tick concluído no recorte sem campanha; não provocar campanha para produzi-la. Crons de backup/deploy, boot inactive/enabled, PM2 saved/fallback compatíveis e barreira ausente PASS. Owner confirmou Inbox/CRM autenticados em leitura.

Leitura dirigida limitada a2MB por arquivo de log desde a contenção: API48 registros (45info/3warn), worker99info, sem registros de nível error/fatal nesse recorte. Três avisos `realtime.websocket.auth_failed` foram observados; o recorte também registra substituição/revogação de sessão e logins. Não atribuir causa aos avisos nem concluir ausência global de falhas por essa leitura. Recuperação de quatro sessões, auth e eventos naturais de recibo observados; não constituem prova funcional de contingência por intenção.

| Cenário | Estado desta janela |
| --- | --- |
| Versões, health/DB, worker control, identidades e controles | PASS técnico |
| Inbox/CRM autenticados | PASS de leitura confirmado pelo owner |
| HYBRID/AUTO reativo com indisponibilidade comprovada e janela legítima | NOT EXERCISED; provas locais mantidas |
| Expiração/resultado ambíguo/concorrência humana | Evidência local existente; NOT EXERCISED produtivamente |
| Seleções explícitas e campanhas/templates Meta-only | Contrato preservado e provas locais; não testado com envio nesta janela |

Nenhum envio de teste, mudança de tenant/transporte/fluxo, saneamento histórico, logout, limpeza de auth/locks ou migration. Retorno preparado permanece API/worker b9 sobre DB/auth atuais; após unfence requer preparação/política fresca e ownership comprovado, não repetição da preparação consumida. Backup não é rollback rotineiro.

Audiência CRM, CSV e aceite específico CRA-PR continuam pendentes. Ciclo avulso controlado demo já aceito permanece evidência separada. Os quatro históricos ficam intactos; reparo6683 de setembro CLOSED, SECULT/DB-only encerradas e inatividade no Guia pausada. Limitação de resposta automática já submetida e frente maior pendente mantêm registros separados.
