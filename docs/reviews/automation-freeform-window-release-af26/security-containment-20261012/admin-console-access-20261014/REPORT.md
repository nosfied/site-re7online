# Console interno após NEWauth — auditoria e reconexão, 14/10/2026

**RECOVERED / ADMIN CONSOLE ACCEPTED. API/NEWauth/GET administrativo PASS; saída canônica e funcionamento com o token vigente confirmados pelo owner.** Sem restart, nova rotação, segredo antigo, mudança de RBAC, deploy ou SQL mutável. Snapshot87d2f431 permanece LOCAL VALIDATED/NOT DEPLOYED e exige preparação operacional atual. Auth e banco continuam concluídos; este registro cobre a conferência do console que não foi discriminada no aceite original. Segurança externa/cifragem OPEN; out.15 CLOSED/guarda38 preservados.

## Diagnóstico sustentado

O console interno em `https://converta.re7online.com/admin/tenants` usa `X-Admin-Token`. `resolveAdminAuth` compara o token com ADMIN_TOKEN efetivo; há também contrato legado de token administrativo limitado ao tenant, sem convertê-lo em superadmin. JWT/login em `/app` é outro contrato: não deve ser copiado para esse campo nem substituído para recuperar o console.

Às **14/10 20:59:09 UTC /17:59:09 Fortaleza**, configuração selada pós-banco + ambiente do processo API410272/ticks2170884687 coincidiram privadamente com os **três valores NEWauth aprovados**. GET `/admin/health` local e GET `/agent-api/admin/health` pela origem legítima do owner retornaram200/ok/dbtrue. Guard38 e identidade permaneceram iguais antes/depois. [Prova sanitizada](live.sanitized.json). Nenhum valor/header/config foi impresso; token existiu somente em memória do leitor e custódia privada.

O owner confirmou a origem converta e que “Sair do console” levou ao formulário de acesso. Portanto, não está preso sem caminho de reconexão. Origem/proxy corretos e credencial ativa válida foram comprovados. **Não capturamos o token nem a Base URL armazenados antes da saída**; não declaramos comprovada a identidade da credencial anterior. Credencial persistida anterior, token incompleto/incorreto ou JWT colocado no campo são possibilidades, não achados históricos. Não houve necessidade de inspecionar storage privado do owner ou pedir que enviasse token/cookie.

Duas leituras anteriores usaram equivocadamente admin.re7online.com como origem web (host SSH), negaram redirecionamento e foram preservadas. Não demonstram defeito da Base URL do owner, que era converta. A leitura posterior usou a origem informada pelo owner, sem seguir redirecionamentos da credencial. A página SSR retornou200 sem token administrativo no HTML; o formulário é inicializado no cliente, logo a ausência dos campos no HTML SSR **não é prova de interface ausente nem aceite funcional do browser**.

O owner acrescentou que antes consultava o token em **`.env`**. Esse nome não identifica sozinho o arquivo/release nem comprova seu conteúdo atual. A API lê ADMIN_TOKEN de `process.env`; nesta implantação, a configuração selada e o ambiente do processo foram conferidos com NEWauth. Um `.env` local ou histórico pode conservar outro valor sem ser a fonte efetiva do processo. Não investigamos um arquivo não identificado nem o editamos para coincidir; usar a custódia atual já conferida resolveu o acesso. Nenhum segredo antigo foi reativado.

## Contrato de persistência e saída

Fontes canônicas: `src/lib/whatsappAdminApi.ts`, `src/components/admin/AdminConsoleProvider.tsx`, `AdminConfigPanel.tsx` e `src/app/admin/layout.tsx`. Quatro arquivos iguais à fonte atestada do frontend ativo já preservada; nenhuma alteração runtime/build. `rememberToken=false` seleciona sessionStorage; `true` seleciona localStorage. Reload conserva esses valores. `isConnected` significa Base URL/token preenchidos, não certificado de autenticação;401 não apaga automaticamente a credencial nem exibe de novo o formulário.

“**Sair do console**” chama `clearAdminConnection`, removendo exatamente:

- localStorage `wa_admin_connection_v1`;
- localStorage `wa_admin_token_local_v1`;
- sessionStorage `wa_admin_token_session_v1`.

Não apaga JWT do tenant, sessão de suporte, cookies, mídias ou dados gerais. “Sair do modo suporte” é outra ação, com outro contrato; não foi solicitado nem executado. Não orientar Limpar dados do site, storage.clear ou logout global.

[Prova dirigida](storage.sanitized.json) com Node20.20.0/tokens sintéticos: os dois modos preservam token no reload,401 nega GET, saída limpa só as três entradas, reconexão envia a nova credencial e GET200; JWT/sessão de suporte e sentinel de dados do tenant permanecem. O primeiro lançamento tsx negou no sandbox pelo IPC; a execução local autorizada passou. Sem testes de envio, chamadas de provider, build ou suíte ampla.

## Recuperação privada orientada

Foi disponibilizada somente a credencial ADMIN_TOKEN aprovada, conferida com o processo ativo, em arquivo600 dentro do cofre permanente700 do owner:
`/home/deifson-oliveira/DEIFSON/re7-private-retention-custody/console-admin-access-20261014/ADMIN_TOKEN.current.private.txt`.

Abrir privadamente no computador do owner; copiar somente para o campo **X-Admin-Token**. Não executar cat/echo do valor, não enviar ao chat, não copiar configuração completa ou usar JWT/senha do tenant. Evidências das recusas/leitura e índice estão no mesmo cofre; não se criou token novo. Índice privado SHA **f9fbfda89b6f5c9cb0e1daeadb72d2190c4bad02fb78a1a19d2ee51eb2801285**. Não publicamos fingerprint da credencial.

Na origem converta, após “Sair do console”, usar o formulário existente: **Base URL `/agent-api` → X-Admin-Token novo → Testar conexão → Entrar → recarregar**. Preferir não lembrar em equipamento compartilhado. Testar/entrar usam GET administrativo; não editar tenant, enviar, assumir ou abrir guarda. Se aparecer e-mail/senha, informar apenas essa distinção para orientar a rota; não colar token em login do tenant. Se401 persistir, preservar a negativa e conferir rota/seleção de credencial privadamente; não repetir rotação ou alterar RBAC.

**Aceite específico concluído:** após a orientação Testar→Entrar→reload, o owner respondeu “sim, funcionou com o token indicado.” A reconexão administrativa foi recuperada e aceita no alcance confirmado; GETs e ensaio sintético permanecem identificados separadamente. Nenhum patch de produção necessário foi demonstrado; não reabrir ou reexecutar auth. A credencial anteriormente armazenada não foi comparada, portanto não atribuímos identidade histórica ao valor rejeitado.
