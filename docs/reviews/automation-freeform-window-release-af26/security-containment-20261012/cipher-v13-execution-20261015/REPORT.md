# Janela v13 autorizada — 15/10/2026

**Continuidade separada:** [recuperação restrita de cron CONSUMED/RESTORED](../scheduled-controls-20261015/RESULT_2026-10-15.md). Mantém esta recusa e a v13 intocadas; não executar A/B. Correção preventiva local e cron Prisma com.env obsoleto discriminados no relatório corrente.

**DENY ANTES DA CONTENÇÃO / POLÍTICA INSTALADA / B NÃO EXECUTADO / CIPHER NOT DEPLOYED.** Owner autorizou política15b91a/instalador722ae8 e declarou disponibilidade agora, sem uso humano. NEWauth+NEWDB, frontend, out.15 CLOSED e guarda38 preservados. Qualquer recusa anterior à contenção interrompe a tentativa; nenhuma adaptação de campo/input para PASS. v10 consumida não é usada; sem nova extração da v13.


## Resultado da tentativa e divergência efetiva

A captura root de **07:21:58.126940 Fortaleza** negou `scheduled_writer_sources_changed`. A tentativa está interrompida: não executar novamente A, não admitir gates e não executar B. A saída enviada contém a recusa e também a conclusão posterior do instalador; não se infere pelo transcript quantas execuções ocorreram. A inspeção efetiva confirmou política15b instalada, fase null, fontes vivas, cinco gatesfalse/executionfalse, zero entradas de selagem, marcas de parada, solicitações ownership ou intents de start. API410272, worker410428 e frontend188897 preservados; health/DB ok, barreira ausente, guarda38 fechada e dumps600. [Resultado sanitizado](DENIAL_SANITIZED.json).

A divergência não é apenas cabeçalho gerado: `/var/spool/cron/crontabs/deploy` tem seis entradas antes ativas agora comentadas, além do comentário de instalação. A leitura canônica `crontab -l` corresponde **exatamente** a `window/deploy.crontab.window`, não a `deploy.crontab.before`; SHA atual55fe793569d4221face0b54b3f3de1eae408ed0b0eadc45d7db80e810e9f37d1. A população dos arquivos cron permaneceu igual. O cabeçalho registra instalação08:53:24 UTC, compatível com a contenção v10 às05:53:24 Fortaleza; o timestamp sozinho não identifica o executor histórico.

A auditoria estática confirma uma lacuna real: `sequencer.recover(prestop)` chama `abort-prestop` e restaura a guarda; o helper desse caminho restaura `/etc/cron.d/re7-converta-backup`, nft e boot, mas **não restaura o crontab deploy**. A inspeção atual não prova que todos os controles foram restaurados na v10. A declaração anterior foi excessiva e recebe errata no relatório original. Não confundir o limite anterior3,497s da contenção de admissão com duração do crontab: a restauração integral deste último não foi demonstrada. Não houve contenção, parada ou conversão nesta tentativa v13.

Escape de cobertura: a cadeia preparatória verificava supervisão/guarda e contratos de consumidores, porém não comparava o crontab efetivo com `before`; os testes de recuperação não exigiam essa pós-condição no caminho real pré-parada. O novo checker root detectou o estado divergente antes de B. Não corrigir a baseline nem aceitar o perfil `window` como normal para passar. A v13 e seus inputs/checker/provas ficam intactos.

Pendência concreta: preparar correção futura do caminho pré-parada para restaurar e certificar os controles deploy e sistema separadamente; exercitar a recuperação real com efeitos de sistema substituídos, inclusive erro parcial. Adicionar comparação canônica de ambos os crons à admissão e à inspeção final, além dos hashes root. Preparar recuperação restrita dos controles atuais com preservação privada e decisão própria, sem repetir B/SQL/start ou trocar o input. **Nenhuma restauração de cron foi executada por esta inspeção.** A política15b permanece instalada e sem fase; não retornar à b6 por conveniência. A autorização desta tentativa não será reutilizada automaticamente. Captura root existente, stderr, inspeção de estado e crontab efetivo foram copiados privadamente off-host para custódia permanente do owner, arquivos600/diretório700, com índice de hashes/bytes e conferência integral; não se afirma réplica física independente do computador do owner.

Backup/restore/RPO renovados e suas provas válidas permanecem preservados; não repetir captura para corrigir este problema de controles. Segurança externa/cifragem OPEN; NEWauth+NEWDB, console, frontend, out.15 CLOSED e guarda38 preservados. O aceite de sessões anterior não prova execução dos jobs cron. Responsável Deifson; revisão15/10/próxima21/10 antecipada após mudanças.

## RPO e pacote concreto

- Captura real READ ONLY sob backup.lock: **07:03:24.180160–07:03:32.060780 Fortaleza**,7,881s;41.306.756B;SHA `69457bea928962a065714a30eb793c7e8e650777cfe978baaa92b9b244473753`.
- Catálogo614, schema/fronteira completo `142a2b61fd5a366bb770bd4274d6cdf7f0850808d26f4e03b7cdf4ffe7acd71d` estável antes/depois; pg_dump/restore16.12, Node20.20.0 preservados. Hash e catálogo lidos off-host; custódia permanente owner700/600 conferida. Não é réplica física independente do computador do owner.
- Laboratório original retido/parado confirmado com pg_ctl status3; dados/evidência preservados; temporaryDatabaseRemoved=false. Restore anterior reutilizado pela compatibilidade certificada, sem alegar restore novo do dump renovado/ACL/ownership.
-19 arquivos de provas/manifests atualizados coerentemente sob lock: quatro backup-manifests/bindings/scripts, referências restore/contrato/compatibilidade, mode/window/review manifests. Originais com bytes/metadados/índice preservados em `window/proofs-before-rpo-re7-v13-rpo-renewal-20261015T101000Z`.185 demais arquivos protegidos por hash; política/instalador/código/runtime/grant/SQL/fonte CAS inalterados.
- Renovação ensaiada localmente com arquivos completos:4 contratos válidos e4 variantes de recibo negadas. Root checker: captura integral original +transição de política autorizada e5 negativas locais; nenhuma é apresentada como leitura root produtiva já executada.
- Cadeia real READ ONLY passou novamente às **07:09:38.643656 Fortaleza**: quatro modos, referências,147 históricos, perfis, identidades, dumps600, controles, SQL/proxy e health/DB. Mínimo18.334.789.632B, WAL80MiB. Gatesfalse/execfalse; nenhuma instalação/contenção.
- Arquivo concreto renovado `176ce1c813585d222635e3dcd05f6ce4011f5d86d2594d28937a44b588c47d42`,5.950.324B; conferência integral tar↔candidato↔recibo,170 provas reutilizadas porque código idêntico. [Certificação sanitizada](RENEWAL_SANITIZED.json).

**Novo review SHA:** `a7b17b6a2218876b325da3b24e97b5264b7e19c5dc8adc3bb7d58c51dd6fc095`. Política `15b91a2a41708a1ef0ee8a499fd51f892298561d0d73dbbfb05ceb3fe285899f`; instalador `722ae81d542bb5c7a50d0820e9133d219c1b058a92f3891232ade3a213589d56` permanecem os revisados. Fonte root deve ser b6a584; helper8de/sudoers62b5 iguais. Root600/440/writers frescos e instalação exigem a sessão legítima do owner; não foram inferidos do pacote.

## Admissão explícita dos cinco gates, antes de B

Comando publicado antes da recusa, **NÃO EXECUTAR nesta tentativa interrompida**:

```bash
P=/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-security-cipher-restore-v13-20261015T100500Z
I=/dev/shm/re7-v13-owner-input-20261015T101500Z
python3 -B "$I/admit_gates.py" "$P" "$I" /dev/shm/re7-v13-gate-admission-20261015T102000Z --owner-authorized-v13
```

Admit script SHA `30398ea0f6236d8b77793e123eef0ba07b697b0f8d3c2053dfc76a232634bbd5`; root checker SHA `4a8914ca3c35879b647441c4e06217f11ce91e2d38856d8704628f66b37a9d11`. Código externo de condução; nenhum byte do instalador/runtime/V4 selado foi alterado. Não executa contenção/stop/start/SQL mutável. Recusa não admite gates nem inicia B. Lock exclusivo, intent/recibo próprio, sem replay; cinco valores só mudam depois de todas as verificações.

| Gate | Prova atual obrigatória |
|---|---|
| ownerAuthorized | autorização9db55543 desta tarefa e owner efetivamente disponível para A/sudo; argumento explícito |
| artifactsVerified | review a7b17b6a, checker/manifests/quatro modos/runtime e cadeia real atuais, mesmo código das170 provas |
| restoreVerified | quatro contratos compartilhados; dump real/RPO<1h/hash/custódia e laboratório original retido/parado, false preservado |
| preflightReviewed | root hash/owner/mode/cadeias/writers/cron completos comparados ao audit selado; política15b instalada/inspect phaseNone/sourceAlive; barreira ausente; cadeia atual |
| discrepanciesResolved | fontes imutáveis/NEWauth+NEWDB/identidades/SQL/proxy/inventário congelado; zero incompletudes/root writers desconhecidos; nenhuma adaptação do plano |

Saída e DBzero/CAS não são certificados antecipadamente por esses gates; são obrigatórios dentro de B, após contenção. O script reexecuta a cadeia canônica ainda com gatesfalse, vincula cada prova por hash e só então grava true/execution-authorized. Qualquer partial na admissão interrompe sem B. A única partida da sequência usa `python3 -B "$P/window/locked_cli.py" "$P"`; resultado incerto permite apenas C READ ONLY e decisão explícita correspondente, sem replay/OLDcipher após VERIFIED.

Estado final: tentativa interrompida pela recusa; inspeção/custódia e pendências acima substituem a próxima ação A/B anteriormente publicada.
