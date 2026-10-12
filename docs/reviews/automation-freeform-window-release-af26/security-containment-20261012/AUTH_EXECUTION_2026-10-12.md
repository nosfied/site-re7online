# Fase auth autorizada — bloqueada antes da instalação, 12/10/2026

**AUTH NOT INSTALLED / NOT ROTATED / NO WINDOW. Segurança OPEN; out.15 CLOSED.** A autorização de c3ef43dd foi aplicada ao ajuste dos dois dumps PM2 e às conferências. O gate negou `saved_reference_drift`; nenhuma substituição root, contenção, parada, partida, save ou logout foi executada. A autorização não permite editar os bindings para aceitar esta divergência.

## Diagnóstico comprovado

Leitura atual 23:13:20UTC/20:13:20Fortaleza: API186864, worker187037, frontend188897, reinícios0; mesmos ticks/releases/configurações esperados. Guarda38 fechada/tasks{}, markers ausentes, health/DB OK. Piso de capacidade desta fase passou. O checker completo de instalação, sob exclusividade, conferiu pacote/manifests, configurações, identidades, controles e symlinks, depois negou a comparação dos dumps. As verificações posteriores ao ponto de recusa (inventário SQL/proxy nessa invocação) **não recebem PASS**. A leitura agregada de estado não substitui o checker completo.

Dumps reais, ambos: `48510399ad79abe89ecfb9b53bdfffb75f7045e0229342e66d50649c3202c7ec`. Referências herdadas na geração auth, ambas: `50af61753bd6d4a370f47f7ad5ade47e48bbc0f60ccc15c5bbfa1474509b1e5d`. A preparação standby usada como origem possui o mesmo hash antigo. Comparação por nome comprova diferenças em cwd/pm_exec_path/CAMPAIGN_BUILD_ID da API, RE7_FRONT_CONTROL/RE7_FRONT_RUN e entry/control do frontend, logs/identificadores de execução. Portanto não é somente ordem, métricas ou chmod: há referências operacionais antigas. `prepare_auth_v4.py` copiava indiscriminadamente esses arquivos do manifesto da origem, em vez de capturar saved/fallback atuais.

A preparação223100 e suas referências permaneceram intactas nesse aspecto. Política instalada a2ff permanece instalada; proposta723444/instalador188a588 não usados. Cinco gates e execution-authorized=false. Código do preparador corrigido **localmente para revisão**: nova geração deve copiar as duas fontes reais por duas observações consistentes, sem reescrever a geração recusada. `saved_reference_capture.py` nega symlink, tipo/proprietário/modo inválidos, observação concorrente e destino existente. Três testes locais dirigidos PASS. Não executar o preparador com o destino223100 já existente; falta gerar e revisar uma geração nova, com controles próprios e conferência completa. Helper/sudoers não mudam.

## Efeitos autorizados realmente executados

- Duas amostras completas de permissões POSIX/ACL/NSS antes do ajuste; cópias privadas preservadas. Somente dump.pm2 e dump.pm2.bak ficaram600, mesmo owner/conteúdo. Nenhum diretório foi alterado. Próximos saves continuam exigindo umask077. Mudança de modo não resolveu nem originou a divergência de conteúdo.
- Dump SQL fresco transmitido diretamente para custódia off-host:37.337.106B, SHA-256 `6f64c9a1792ccdd1d08f44e8e91b78d6b29d35cff3ddd872ba4fce5ba954a585`. Restore PostgreSQL isolado PASS:70tabelas/614objetos/60checksums de migrations; banco temporário removido, nenhum app/provider/executor iniciado.
- Controles/runtime off-host: SHA-256 `21f3ece1c8655610885b7bca6c098a681b7fe712bfd82771c3e9317708071e62`. Tar conferido e extraído isoladamente. Manifests/provas de backup foram renovados, anteriores arquivados; política, instalador, configurações e bindings operacionais preservados.
- Geração preservada e arquivos anteriores dos dumps em custódia off-host:713.760B, SHA-256 `93edc2997c178d5e365e8b7a3c5b9053e820f604fbd6f1ab293c286cc926aa48`; extração segura validada.
- Retrato final23:21:17UTC/20:21:17Fortaleza: mesmos processos/guard38, health/DB OK, saved/fallback600, min(deploy/PG)2.232.520.704B, WAL83.886.080B/slots0. PASS **datado e específico auth**, não capacidade universal. Nenhum segredo foi rotacionado; testes de login/oldsession/novo controle não foram executados, pois exigem cutover real.

[Resultado e hashes consolidados](AUTH_EXECUTION_2026-10-12.sanitized.json). Diagnósticos completos stdout/stderr/exit/timeouts permanecem privados, inclusive a negativa. Não contornar o gate nem repetir o instalador.

## Continuidade concreta, sem ações externas

Mapa privado das cinco substitutas em `local-evidence/security-auth-authorized-20261012/owner-external-instructions.private.json`: console, slot, consumidores já inventariados, IDs de app/ativos efetivamente disponíveis, ação e impacto. Nenhum valor de credencial incluído. App ID de Business Login foi identificado na configuração; emissores de outros app secrets, projeto/key record OpenAI e system-user emissor do token global ainda não podem ser inferidos de segredo opaco. Essa confirmação indispensável é do console; não é pedido para redescobrir consumidores. Valores iguais entre slots não provam mesmo app. Não executar reset Meta antes do plano dos341refs cifrados.

- Meta app secrets: painel de apps/Settings-Basic da aplicação **privadamente vinculada**, confirmar reset/revogação/escopo; troca posterior coordenada dos validadores webhook/OAuth e, para META_APP_SECRET, dos341refs Messenger/Telegram. Efeitos exatos de reset sobre tokens dependem do ativo/emissor e ainda precisam confirmação; nenhum reset efetuado.
- OpenAI: organização/projeto correto → API Keys/service account; criar substituta com permissões necessárias, custodiar diretamente no arquivo selado, cutover aprovado e só depois revogar anterior. Dependência de texto/áudio já inventariada. [Contrato oficial de permissões](https://developers.openai.com/api/docs/guides/rbac).
- Token WhatsApp global: Business Settings/System Users do emissor confirmado, app e ativos WhatsApp privados; substituta com mesmo alcance necessário. Zero TenantMetaConfig tokens coincidiram com o fallback exposto; não trocar automaticamente os tokens individuais de tenants.

`telegram-recovery.private.json` identifica tenant, bot/account/row e hash original. A linha GCM inválida não é resolvida por nova chave. Caminho canônico concreto ADMIN `/app/telegram/bots/{accountId privado}/rotate-token`; fonte legítima via BotFather ou backup original comprovadamente válido, preservando o registro anterior. [Contrato Telegram/BotFather](https://core.telegram.org/bots/features). Nenhuma chamada/rotação/reparo autorizado ou executado agora.

`derived-channel-map.private.json` relaciona11linhas cifradas aos tenants/accounts:4Meta tokens legíveis,1Telegram legível,1Telegram inválido e5estados Web. Recriptografar não revoga tokens/sessões derivados. Cada estado Web tem tenant/account/operator e impacto de eventual re-pairing a decidir; nenhum dispositivo foi desconectado. O status histórico do inventário não substitui observação fresca antes de qualquer recredenciamento.

## Decoder histórico e escrita dedicada — local

`seed_epoch_codec.cjs` implementa leitura v1 somente com autorização explícita única por tenant/evento/campo/digest de ciphertext, hash da chave histórica e prazo. Não consulta ambiente nem usa fallback permissivo. Writer v2 exige chave dedicada e epoch, autenticando tenant/evento/campo/epoch via AAD. Chave antiga fica restrita à leitura autorizada; não reescreve Event, hash ou recibo.

Quatro cenários sintéticos Node20.20.0 PASS: leitura imutável, escopo/duplicação, prazo/chave/tamper/estrutura, escrita nova e negativas de cross-tenant/campo/epoch. Prova offline adicional com os147campos originais/126eventos PASS: hashes dos payloads intactos, novos ciphertexts apenas em memória, zero SQL/provider. As provas funcionais anteriores foram reutilizadas; nenhum build de release repetido.

**Limite:** codec administrativo local, ainda não integrado aos leitores/writers runtime canônicos. Antes de cifragem produtiva é necessária integração contextual dos callers de campaignSeedPrivacy, autorização histórica selada e completa, dedicada CAMPAIGN_SEED_SECRET de escrita e artefato/revisão próprios. A autorização temporária local da prova não é uma política produtiva. Não implantar/rotacionar chave de canal ou alterar snapshots com este arquivo isolado.

## Banco e próxima ação executável

Adapter selado/SQL/SCRAM/configs anteriores preservados, applyAuthorized=false. Não foi fabricada geração “pós-auth”: não existem novas identidades porque a fase auth não rodou. Preparação bancária exige o resultado real de auth, baseline fresca, adapter na fronteira source-exit/ownership comprovados → alteração/verificação do role → único sucessor. Nenhum ALTER ROLE/credencial DB alterado.

Próximo passo: revisão do fix local de captura PM2 e **nova preparação auth** com fontes efetivas saved/fallback; conferir seus manifests/proofs/identidades/inventário/proxy/backup e publicar política/instalador novos. Não editar223100 nem usar seu blocoB. A autorização registrada permanece como contexto, mas nenhuma negativa autoriza modificar silenciosamente o pacote revisado. O instalador desta geração não é apresentado para execução enquanto bloqueada.

Out15CLOSED/recibo/CRM/resultados permanecem preservados. Guarda38 fechada; segurança OPEN. Banco, providers, cifragem, expansão internacional, CSV/Syer, CRA-PR e multilote/AUTO seguem separados. Não declarar contenção dos14 após chmod ou provas locais.
