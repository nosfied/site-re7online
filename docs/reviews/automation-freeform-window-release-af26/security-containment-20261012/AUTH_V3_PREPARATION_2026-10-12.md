# Nova preparação auth v3 e integração local de seed — 12/10/2026

**PREPARATION COMPLETE FOR REVIEW / NOT INSTALLED / AUTH NOT ROTATED.** A fase auth permanece bloqueada para execução até revisão deste pacote novo e conferências imediatas previstas. Dumps600 concluídos, sem repetir chmod. Segurança OPEN, out.15 CLOSED, guarda38 fechada. Não instalar/executar223100, cuja recusa e referências antigas foram integralmente preservadas.

## Preparação concreta

Geração: `/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-security-auth-v3-20261012T234100Z`. Criada23:40:56UTC/20:40:56Fortaleza; o timestamp no nome identifica a geração. [Comandos A/B para revisão](AUTH_V3_COMMANDS_FOR_REVIEW.txt), [instalador literal](install-auth-policy-v3-for-review.sh), [checker preparatório](check-auth-v3-immediate.py), [hashes/resultados](AUTH_V3_RESULT.sanitized.json).

| Bytes | SHA-256 |
|---|---|
| Política proposta |093a04831663d5d348ea4d5546d3aedb7f37ba2d5b76a17352aef65e447310b7|
| Instalador |f9edbd489ab3c99f9914ca6509ca0d676500ca3ffec1abc5b17a0da5de8b278d|
| Review manifest |379e7d403c6d33420ca3248c3c43a9908ae4179bac9419dbb4801264f9505273|
| Switch29arquivos |98e907389c4b9e406894c3163383127ba9ae2517ee9543a876ccd3776909d5cc|
| Return29arquivos |9a087317b9813b60e08bd858cd0f8300cd5afbd0fc706a2a514016995b382d0f|
| Return-partial29arquivos |76283d86f3494189f4a2b1d03083ee8bba92adc6ef2cfaaacc0e5b46bcf76ad8|
| Checker imediato |3b79715cff6e3c1a833e6f4e6fa008e21bed0ae6b5c5add010875171edf4b4db|
| Geração privada off-host |ab4d706f7f2c8d7787aaac6e54664dfa74acab74d4efc6cfcb7376858262f675|

Capturador revisado nega symlink, tipo/UID/modo inesperados, leitura concorrente, destino existente e duas amostras divergentes. Três testes dirigidos PASS reutilizados nesta composição. Preparador agora exige geração v3 nova, captura saved/fallback reais em vez de herdar os da standby e exige manifest atestado da fonte de backup/restore. Não faz correção automática de divergência. Nenhum intento, certificado de saída ou fase anterior copiado; controles ligados à geração nova. O certificado CLOSED é evidência histórica durável, nunca prova de saída.

Dumps capturados ambos SHA48510399ad79abe89ecfb9b53bdfffb75f7045e0229342e66d50649c3202c7ec, mode600/UIDdeploy, iguais aos atuais. Configurações reais/proc/cwd/exe/env correspondem à origem. A inspeção adicional inicial tratou dump PM2 como jlist e negou KeyError:pid; o diagnóstico foi preservado. Seu adapter de leitura foi corrigido para usar o PID atual observado, mantendo os bytes do dump e todas as verificações; nova leitura PASS. Nenhum binding foi adaptado e o checker integral original já havia passado.

Conferência completa23:41:33UTC PASS: baseline/JSON-ecosystem/manifests, três processos/daemon, symlinks, cron/boot, saved/fallback, inventário SQL global com timeouts READ ONLY, auth/sessões/flags, contrato frozen/closure e proxy identificado pela leitura root existente. Captura SQL/proxy completa adicional preservada privadamente: SHA58397934ed36dd82455c399a1e254c8807cd23206889ba718895324b05e5d893, ledger idêntico antes/depois; não é certificado de drain. O inventário incluiu jobs/groups/leases/sendingScheduled e os vínculos duráveis receipt/closure. Policy inspect root continuaa2ff/phase null/sourceProcessesAlive=true; proposta093a não instalada, arquivo de arquivamento novo ausente. Owner deverá conferir hash root/sudoers/modes/visudo no instalador antes da futura substituição. Helper8de e sudoers62b5 preservados.

Artefatos funcionais/API/worker/frontend, dependências e provas válidas reutilizados, sem rebuild. Sucessores dos três modos diferem somente nas três credenciais auth; API utiliza releases existentes corretas, worker mínimo preservado, frontend integralmente igual. Todos os retornos usam valores novos. Tar da geração707.117B validado/extraído isoladamente; review manifest e29arquivos/mode conferidos.

## Backup, capacidade e requisitos da execução

Reutilizada a renovação autorizada23:14:55UTC: dump6f64c9a1…37.337.106B, restore isolado70tabelas614objetos60migrations PASS/banco temporário removido; controles21f3ece1… íntegros off-host. Os manifests correspondentes foram copiados por hash validado, sem fingir novo dump. Schema/ferramentas/artefatos funcionais não mudaram. **Essa prova de integridade não certifica frescor/RPO na futura janela**: conferir e renovar conforme runbook antes de habilitar gates; preservar arquivos anteriores. Não repetir restore/suítes por rotina sem mudança/validade exigida.

Última leitura23:52:03UTC/20:52:03Fortaleza: min(deploy/PG)2.230.255.616B, WAL83.886.080B/slots0; piso2.131.755.008B+reservaauth4MiB PASS datado. Não representa orçamento universal de banco/cifragem. API186864/worker187037/frontend188897 e ticks anteriores preservados, restart0/healthDBOK; mesmas sessões/configurações e guarda38/tasks{}. Cinco gatesfalse e execution-authorized=false. Nenhuma instalação/chmod adicional/stop/start/save/rotação/logout/envio ou abertura realizada nesta etapa.

Próximo passo concreto é revisar política093a/instaladorf9/blocos A/B; depois owner instala apenas a política na própria sessão sudo e confere inspect. Senha nunca no chat. Só com requirements atuais e autorização de execução vigente será admissível a sequência única. Saída/fence/ownership/captura antes do unfence exigem provas novas, não a leitura preparatória. Não usar os comandosA/B antigos de223100. Retorno pós-unfence exige preparação/política fresca com identidades reais e instalação restrita, conforme contrato canônico.

## Canais por tenant e decisão Telegram

[Reconciliação sanitizada por tenant](CHANNELS_2026-10-12.sanitized.json); mapa de IDs/clientKeys fica privado. SQL READ ONLY/limites/30dias, getFeatures **do compilado ativo** e perfis reais, sem import de entrypoint/provider/scheduler. Resolver SHA d6783e5cfada966cce34358b8e0fecef353677c12dcdab1b5e4977a694374e23. Documentos consultados: TELEGRAM_DESIGN (evolução74B–74F/runtime texto gated), TELEGRAM_AUDIT (fundação histórica anterior), runtime inbound/outbound real e clientFeatures. O texto antigo de auditoria não é prova de ausência de código runtime atual.

Owner confirmou Telegram fora de uso e frente futura. Existem duas contas cadastradas, uma flag efetiva telegram+inbound habilitada, nenhuma flag outbound habilitada nos dez tenants; **zero** InboundMessage/OutboundMessage/Conversation Telegram no recorte30dias. Flags/account.enabled/token armazenado não comprovam uso humano nem webhook ativo; não se extrapola esse recorte para “nunca utilizado”. Linhas sem canal/provider explícitos continuam desconhecidas; não são atribuídas a um transporte por hipótese. Predicados reais também exigem tenant ativo, flags de recurso/inbound ou outbound, account.runtimeEnabled e permissões correspondentes; token/cifra configurados não substituem resultado observado.

Nenhuma ativação, chamada BotFather, desconexão Web, recredenciamento ou alteração de flags foi realizada ou exigida para auth. A linha Telegram estruturalmente inválida permanece com hash/row preservados. É dependência específica da cifragem futura: o planner integral continua DENY enquanto não existir disposição revisada para ela, mesmo sem uso. Não omitir a linha, fabricar decrypt ou exigir bot operacional para obter PASS. Nova nota privada de disposição explicita actionRequiredForAuth=false e botFatherRequiredNow=false; documentação/owner consoles antigos são apenas possibilidades futuras, não ações necessárias nesta tarefa.

## Seed: integração local aos caminhos canônicos

`campaignSeedEpoch.ts` foi ligado diretamente a `buildPrivateCampaignSeedFields` e `readPrivateCampaignSeedFields`, sem resolvedor de identidade paralelo. Callers de runner/materialização, importação, detalhe, privacidade e verificadores históricos passam o clientId do escopo já autorizado. Escritores das três modalidades já usam o builder compartilhado. Nenhum consumidor importa index.ts ou ativa executor para descobrir estado.

Modo epoch é opt-in pela configuração futura CAMPAIGN_SEED_WRITE_EPOCH; exige CAMPAIGN_SEED_SECRET dedicada, distinta de canal/sessão/legado. Novo v2 autentica versão/epoch/tenant/seedId/campo; não escreve com a chave exposta. Leitura v1 após ativação exige arquivo privado600/UIDdoexecutor/sem symlink, SHA selado, prazo e uma autorização única contendo tenant/evento/campo/digest do ciphertext **e do payload original completo**. Chave histórica só leitura, sem fallback de canal/sessão. Ciphertext desconhecido, contexto divergente/ausente, policy inválida, duplicate, prazo, integridade/permissão/proprietário/symlink negam; plaintext fallback nega. Histórico não é recifrado por esse leitor. O modo atual sem epoch mantém o contrato legado existente; ativar a nova política/chave não está autorizado.

Node20.20.0: teste dirigido do reader/writer canônico e negativas PASS, três testes seed/privacidade diretamente afetados PASS, typecheck --noEmit PASS. Prova offline **dos147campos/126eventos originais** através desses leitores/writers PASS: plaintext lógico igual ao leitor anterior, hashes completos dos payloads preservados, novos ciphertexts só em memória, zero SQL/provider. Dedicated key proposta privada nova/independente, não na geração auth. Os exemplos administrativos v2 anteriores eram ensaios em memória; não são formato de produção nem autorização histórica vigente.

Limites: delta local não compilado em release nem incluído no pacote auth; artifact funcional auth mudou zero módulos. Antes da cifragem faltam revisão dessa integração, autorização histórica selada completa com proveniência, configuração/época definitiva, artefato próprio e disposição Telegram. Preservar ciphertexts/hashes antigos garante operação auditável; não recupera confidencialidade de backups antigos cujo segredo possa ter sido exposto. Segurança continua OPEN. Out15CLOSED/recibo/CRM/usage/seis resultados/cinco não enviados preservados, .6/setembro encerrados; sem reabrir essas frentes. Banco pós-auth, externos, CSV/Syer, internacional, CRA-PR e multilote/AUTO continuam separados.
