# Auth v3 — execução concluída; segurança OPEN

Autorização existente executada exclusivamente na geração `incident-6683-v4-security-auth-v3-20261012T234100Z`. **Três valores rotacionados**, logout esperado e novo login/telas confirmados pelo owner. Banco, providers e cifragem não foram rotacionados. [Evidência sanitizada e hashes](AUTH_V3_EXECUTION_RESULT.sanitized.json).

## Sequência e tempos

Política093a instalada na sessão sudo do owner, anteriora2ff arquivada root600, helper8de e sudoers62b5 preservados. Manifests, configurações/ecosystems dos três modos, dumps atuais, identidades, SQL global/proxy, controles, capacidade e frescor conferidos antes da execução. Uma invocação V4, exit0, `complete/switch`, uma partida API e uma do mesmo worker mínimo, zero partidas frontend e zero retornos.

Contenção: **13/10 00:31:29.842–00:32:22.995 UTC / 12/10 21:31:29.842–21:32:22.995 Fortaleza, 53,154s**. Parada do par iniciada00:31:31.509; unfence concluído00:32:12.807; conferência de ausência da barreira concluída antes do complete. Esses tempos delimitam a indisponibilidade pelo protocolo; não representam uma medição externa contínua de cada requisição. Execução total do bloco73,910s incluindo reconferência prévia. Nenhuma contenção atingiu15min.

A primeira amostra de renovação de captura do worker foi recusada; o orçamento existente preservou a negativa e obteve captura nova consistente antes do unfence. Não houve partida repetida, bypass, alteração de binding ou ampliação de tentativas. Um `inspect` adicional pós-complete retornouexit1: preservado integralmente, sem mudar política ou repetir a sequência. O leitor final usou `check-absent` canônico e confirmou `complete/switch`, configurações e estados efetivos; a recusa adicional não foi usada para fabricar PASS.

## Backup, capacidade e resultado

Dump privado fresco transmitido diretamente off-host: captura real00:15:51.689UTC, 37.383.860B, hashcbb75eec…; restaurado isoladamente PG16,70tabelas/614objetos/60migrations sem divergência, banco temporário removido. Cabeçalho bruto do arquivo preservado, sem reinterpretar seu fuso como horário de captura. Provas/manifests anteriores arquivados, renovados pelo procedimento; manifesto público inicial379e… permanece histórico, novo82fa… conferido pelo owner. Instaladorf9ed e política093a não mudaram.

Últimas duas amostras00:38:38–00:38:40UTC: mínimo deploy/PostgreSQL≥2.181.595.136B; piso auth com reserva2.135.949.312B, margem45.645.824B. WAL80MiB estável/slots0 no intervalo2,2s. **PASS datado para o orçamento verificado; não prova ausência de rajadas nem frescor futuro da fase banco.** Sem limpeza/retirada/alteração de retenção nesta etapa.

API ativa em `campaign-dynamic-compatible-return-5b3cf3af-20261012T170000Z`, PID243332/ticks2163590583, mesmos bytes funcionais/dependências, zero rebuild. Worker mínimoafbb PID243529/ticks2163591155, funcionalmente inalterado. Frontend dinâmico previamente concluído PID188897/ticks2161347676/BUILD_IDdFvS6tFEaWQsSIIn3P702 permaneceu intacto. Todos online/restart0. Saved/fallback idênticos hash849893e2…,600; gravaçõesumask077. Chmod anterior não repetido.

GET de controle API e worker: credenciais novas200, antigas401, sem mensagens. Owner confirmou rejeição da sessão antiga, novo login e Inbox/CRM/Campanhas funcionando somente em leitura. Health/DB, baseline SQL global/sessões/recibo/CRM, cron/boot/supervisão preservados; barreira ausente e cinco gates falsos. Ledger hash9e1a… intacto, guarda38fechada/tasks{}, markers ausentes. Out.15 CLOSED, seis entregas reportadas/cinco não enviadas/recibo.6 preservados. Nenhuma abertura, retomada, envio, alteração histórica, schema ou configuração de tenant.

Captura privada finalauth8.104.816B/hash86a2… copiada off-host e extraída isoladamente; contém diagnósticos stdout/stderr/exit privilegiados, capturas anteriores e journals. Conteúdo privado, tar, valores, nonces e logs ficam fora do Git.

## Continuidade bancária — draft concreto, não instalação/execução

Geração nova `incident-6683-v4-security-database-v2-20261013T004500Z` com identidades pós-auth, dumps atuais capturados consistentemente, baselines novas, três modos29arquivos, policy a9f838ee…, installer9f13d3…, adapter/SQL/plano selados no manifesto. Fonte atual preserva NEWauth e OLDDB; candidatos e retornos pós-commit preservam NEWauth+NEWDB. `applyAuthorized=false`, cinco gatesfalse, execution-authorizedfalse. Nada instalado, nenhum `ALTER ROLE` ou intent bancário executado. Custódia off-host09888ec1…/extração/manifests conferidos.

A geração inicialv1 foi interrompida por cópia duplicada do certificado histórico já presente no manifesto; diretório parcial e diagnóstico preservados, sem política produzida ou efeito produtivo. O preparadorv2 exclui essa cópia do laço e preserva uma única cópia integral; [fonte revisável](prepare_database_postauth_v2.py). O certificado é evidência histórica, nunca exit/drain proof. Geração v2 produzida e validada, sem repetir testes funcionais ou build.

**Ainda não declarar janela bancária pronta.** Dependências concretas para sua revisão: (1) distinguir aborto/retorno antes do commit bancário, quando OLDDB ainda é a credencial efetiva, de sucessores/retornos após recibo VERIFIED, que exigem NEWDB; o adapter atual bloqueia commit incerto, porém seu retorno genérico pré-commit não basta; (2) selar consumidores administrativos/backup-cron/ferramentas, PM2 saved/fallback e configuração futura de inicialização Docker, sem recriar container; (3) reconfirmar privilégios/HBA/verificador originais por leitura e renovação do backup/RPO/capacidade no orçamento específico. Nenhuma recuperação pode reativar segredo já revogado ou partir sob commit incerto. Esses itens são separados do sucessoauth; exigem delta local dirigido e revisão antes da instalação bancária.

As cinco substitutas externas, Telegram futuro/linha inválida, estados Web derivados,147campos seed/decoder local e cifragem permanecem nos roteiros existentes, sem ativação/desconexão/recredenciamento/rotação implícita. SegurançaOPEN; CSV/Syer, internacional, CRA-PR, multilote/AUTO e liberação da guarda continuam separados.

## Complemento de aceite — console interno,14/10

[Auditoria de acesso administrativo](admin-console-access-20261014/REPORT.md): credencial ADMIN_TOKEN ativa/NEWauth aprovado e GET local/proxy200 comprovados; owner confirmou origem converta e saída canônica. O aceite original de novo login/Inbox/CRM/Campanhas referia-se à sessão JWT do tenant e não discriminava reconexão do console X-Admin-Token. Arquivo atual disponibilizado somente no cofre privado; após orientação de reconexão/reload, owner confirmou “sim, funcionou com o token indicado”. Aceite específico do console recuperado/concluído, sem identificar retrospectivamente o valor antes armazenado. Não repetir a rotação auth ou restaurar valores anteriores. Esta ressalva não desfaz a execução técnica concluída.
