# Sprint 77A - OTP / MFA Design

Data: 2026-06-24

Status: design tecnico/funcional. A Sprint 77B iniciou a fundacao estrutural com schema, flags e tela de settings; a Sprint 77C adicionou validacao TOTP shadow. A Sprint 77D desenha o runtime de login sem implementar enforcement.

## Objetivo

Projetar a evolucao de MFA/OTP do Converta para ambientes corporativos e governamentais, reaproveitando o login atual, sessoes persistidas, RBAC, feature flags, auditoria e recuperacao de senha.

O objetivo nao e implementar MFA nesta sprint. O objetivo e definir o menor caminho seguro para adicionar autenticacao reforcada sem quebrar o login atual nem criar dependencia operacional de provider externo antes da hora.

## Auditoria De Reaproveitamento

| Area | Estado atual | Reaproveitamento para MFA | Gap |
| --- | --- | --- | --- |
| Login `/auth/login` | Valida email/senha, usuario ativo, tenant ativo, cria `AppAuthSession` exclusiva e emite JWT proprio. | Alta. MFA deve entrar entre senha valida e emissao do JWT final. | Falta estado intermediario de desafio MFA. |
| JWT app | `issueClientAuthToken()` assina JWT HS256 com `sub`, `clientId`, `role`, `sid`, `iat`, `exp`. | Media. Mantem o token final depois do MFA. | Nao deve emitir token final antes de desafio concluido quando MFA estiver exigido. |
| Sessao persistida | `AppAuthSession` guarda `clientId`, `userId`, `userAgent`, `ipHash`, `expiresAt`, `revokedAt`, `revokeReason`, `lastSeenAt`. | Alta. Pode continuar sendo a sessao final autenticada. | Falta `mfaVerifiedAt` ou uma sessao/desafio intermediario antes da sessao final. |
| Logout/revogacao | `revokeAppSession`, `revokeAllUserSessionsAndPush` e revogacao de push subscriptions. | Alta. Reset/rotacao MFA deve revogar sessoes ativas. | Falta evento especifico de revogacao por MFA reset/rotacao. |
| RBAC | Roles normalizadas `ADMIN`, `SUPERVISOR`, `AGENT`. Rotas usam `isAgentRole`, `isSupervisorRole`, `isAdminRole`. | Alta. Define politica inicial por perfil. | Falta configuracao por tenant/perfil para obrigatoriedade de MFA. |
| Feature flags | `Client.features` e defaults por profile em `clientFeatures.ts`. | Alta. Seguir o padrao `mfa`, `mfaRequired`, `mfaEnforced`. | Flags ainda nao existem. |
| Profile B2G | `Client.profile=government` altera defaults/experiencia. | Media. Pode recomendar defaults mais restritivos para government no futuro. | Nao deve ligar MFA automaticamente sem rollout. |
| Password reset | `PasswordResetToken` com `tokenHash`, TTL 30 min, `usedAt`, `requestedIpHash`, user-agent, email via SMTP/Resend. | Alta. Padrao de token hash, TTL, envio e auditoria pode ser reaproveitado para Email OTP/recovery. | MFA precisa recovery codes e reset administrativo seguro, nao apenas reset de senha. |
| Auditoria/logs | Eventos `auth.login.success`, `auth.login.failed`, `auth.session.revoked`, `auth.password_reset.*`. | Alta. Novo modulo deve seguir eventos redigidos. | Falta tabela/eventos formais de MFA. |
| Admin/usuarios | Gestao de usuarios por `/app` e console interno; roles e ativo/inativo. | Media/alta. Pode exibir status MFA por usuario e reset controlado. | Falta tela de configuracao e reset MFA. |
| Rate limit | Existem padroes de rate limit em rotas sensiveis/publicas. | Media. Deve ser aplicado ao desafio MFA. | Falta limite especifico por usuario/IP/sessao/desafio. |

## Estado Atual De Autenticacao

Fluxo atual:

```text
email + senha
↓
usuario ativo + tenant ativo
↓
createExclusiveAppSession()
↓
issueClientAuthToken()
↓
app autenticado
```

Fluxo alvo com MFA:

```text
email + senha
↓
usuario ativo + tenant ativo
↓
avaliar politica MFA
↓
se MFA nao exigido: sessao final + JWT
↓
se MFA exigido: criar desafio MFA temporario
↓
validar codigo/fator
↓
createExclusiveAppSession()
↓
issueClientAuthToken()
```

Ponto de desenho: enquanto o desafio MFA nao for concluido, o backend nao deve emitir o JWT final usado pelo `/app`.

## Comparacao De Metodos

| Metodo | Seguranca | Custo | Operacao | Aderencia a editais | Risco |
| --- | --- | --- | --- | --- | --- |
| TOTP Authenticator | Alta; independe de canal externo; padrao corporativo. | Baixo; sem custo por envio. | Requer QR code, segredo criptografado e recovery. | Alta para B2G/corporativo. | Perda de dispositivo exige recovery/reset. |
| Email OTP | Media; depende da seguranca do email. | Baixo/medio; usa SMTP/Resend existente. | Simples para usuarios; entrega pode falhar. | Media; bom fallback. | Menos forte que TOTP; risco de atraso/spam. |
| WhatsApp OTP | Media; bom para cidadao, menos ideal para operador/admin. | Variavel; pode exigir template Meta e janela. | Complexo por Meta policy/templates. | Alta quando edital fala em OTP para cidadao. | Mistura canal operacional com auth; custo e compliance. |
| SMS OTP | Media; amplo alcance. | Alto/variavel por envio. | Exige provider, contrato, monitoramento. | Alta em editais que citam SMS. | SIM swap, custo, provider externo. |

## MVP Recomendado

MVP recomendado: **TOTP para usuarios internos do `/app`, com recovery codes na fase seguinte**.

Justificativa:

- nao depende de WhatsApp/SMS/email para login diario;
- reduz custo operacional;
- e padrao reconhecido em ambientes corporativos e governamentais;
- evita acoplar o core de autenticacao aos canais de atendimento;
- pode ser implementado de forma tenant-scoped e feature-gated;
- permite rollout controlado primeiro para `ADMIN`, depois `SUPERVISOR`, depois opcional para `AGENT`.

Email OTP deve ficar como fallback futuro ou alternativa de recovery, nao como fator principal do MVP. WhatsApp/SMS OTP deve ser tratado como modulo separado se edital exigir validacao de cidadao externo, porque o risco, custo e politica de mensagens sao diferentes do MFA de operador.

## Escopo MVP

### Usuarios elegiveis

| Perfil | Politica MVP | Observacao |
| --- | --- | --- |
| `ADMIN` | Obrigatorio quando `mfaRequired=true`. | Primeiro alvo do rollout. |
| `SUPERVISOR` | Opcional no 77D; obrigatorio quando `mfaEnforced=true` por tenant/perfil. | Boa segunda fase. |
| `AGENT` | Opcional no MVP. | Evita atrito operacional em centrais grandes. |

### Politica por tenant

MFA deve ser configuravel por tenant:

- MFA desligado;
- MFA disponivel/opcional;
- MFA exigido para `ADMIN`;
- MFA exigido para `ADMIN` + `SUPERVISOR`;
- MFA exigido para todos.

Para tenants `government`, a recomendacao de rollout e iniciar com `ADMIN` obrigatorio no piloto, mas manter default `false` ate validacao operacional.

## Modelo Alvo

### Entidades propostas

`UserMfaFactor`

- `id`
- `clientId`
- `userId`
- `type` (`totp`, futuro `email_otp`, futuro `sms_otp`)
- `status` (`pending`, `active`, `disabled`, `revoked`)
- `secretCiphertext`
- `secretKeyVersion`
- `label`
- `confirmedAt`
- `lastUsedAt`
- `createdAt`
- `updatedAt`

`MfaChallenge`

- `id`
- `clientId`
- `userId`
- `factorId`
- `type`
- `status` (`pending`, `verified`, `failed`, `expired`, `cancelled`)
- `attemptCount`
- `expiresAt`
- `verifiedAt`
- `ipHash`
- `userAgent`
- `createdAt`
- `updatedAt`

`MfaRecoveryCode`

- `id`
- `clientId`
- `userId`
- `codeHash`
- `usedAt`
- `createdAt`

### Segredos

Segredos TOTP devem ser recuperaveis para validacao, portanto devem ser criptografados, nao apenas hash. A abordagem deve seguir o padrao ja adotado para secrets recuperaveis:

- ciphertext no banco;
- chave estavel em env;
- `keyVersion` para rotacao futura;
- segredo nunca em logs, API ou UI depois do setup;
- QR code exibido apenas no setup;
- recovery codes exibidos uma vez.

Env sugerida:

```text
MFA_SECRET_ENCRYPTION_KEY=<32 bytes base64>
```

## Feature Flags

| Flag | Default | Uso |
| --- | --- | --- |
| `mfa` | false | Exibe configuracao e permite setup por usuario/tenant. |
| `mfaRequired` | false | Exige MFA para perfis configurados, inicialmente `ADMIN`. |
| `mfaEnforced` | false | Bloqueia login de usuarios elegiveis que ainda nao concluiriam MFA. |

Regras:

- `mfa=false`: login atual permanece igual.
- `mfa=true`, `mfaRequired=false`: usuarios podem configurar TOTP opcional.
- `mfaRequired=true`, `mfaEnforced=false`: modo aviso/shadow; login pode continuar, mas registra quem deveria estar protegido.
- `mfaEnforced=true`: login exige desafio MFA para perfis configurados.

## Fluxos

### Setup TOTP

```text
usuario autenticado
↓
POST /app/security/mfa/totp/setup
↓
gera segredo criptografado e URI otpauth
↓
usuario escaneia QR
↓
POST /app/security/mfa/totp/confirm
↓
valida codigo
↓
ativa fator
↓
gera recovery codes
```

### Login com MFA

```text
POST /auth/login
↓
senha valida
↓
politica exige MFA
↓
cria MfaChallenge
↓
retorna { mfaRequired: true, challengeId, methods }
↓
POST /auth/mfa/verify
↓
codigo valido
↓
cria AppAuthSession final
↓
retorna JWT final
```

### Reset administrativo

```text
ADMIN/SUPERVISOR autorizado
↓
POST /app/users/:id/mfa/reset
↓
revoga fatores
↓
revoga sessoes ativas do usuario
↓
usuario refaz setup no proximo login
```

Para reset de `ADMIN`, exigir regra mais forte: outro `ADMIN`, superadmin interno ou procedimento operacional documentado.

## Recovery

Recovery codes devem entrar depois do runtime MFA:

- gerados no setup;
- mostrados uma unica vez;
- armazenados somente como hash;
- uso unico;
- uso de recovery revoga sessoes antigas e deve sugerir rotacao do fator;
- eventos especificos de auditoria.

Perda de dispositivo:

1. usuario usa recovery code;
2. se nao houver recovery, admin autorizado reseta MFA;
3. reset administrativo revoga sessoes e exige novo setup.

## Auditoria

Eventos propostos:

| Evento | Quando |
| --- | --- |
| `login.mfa_required` | Senha valida, MFA exigido, desafio criado. |
| `login.mfa_success` | Codigo validado e sessao final emitida. |
| `login.mfa_failed` | Codigo invalido, expirado ou desafio inexistente. |
| `login.mfa_recovery_used` | Recovery code usado. |
| `mfa.factor.created` | Setup iniciado. |
| `mfa.factor.activated` | TOTP confirmado. |
| `mfa.factor.revoked` | Fator removido/resetado. |
| `mfa.policy.updated` | Politica tenant/perfil alterada. |

Logs devem conter `clientId`, `userId`, `role`, `requestId`, `challengeId` quando seguro, `ipHash` quando aplicavel. Nunca logar codigo OTP, segredo TOTP, recovery code ou QR URI.

## Seguranca

Controles obrigatorios:

- limite de tentativas por desafio;
- TTL curto para desafio, recomendado 5 minutos;
- rate limit por usuario, IP hash e tenant;
- lockout progressivo apos falhas;
- replay protection por `challengeId` e status;
- invalidar desafios anteriores ao criar novo desafio;
- TOTP com janela pequena de tolerancia;
- segredo criptografado;
- recovery codes hash-only;
- auditoria redigida;
- revogar sessoes apos reset MFA;
- nao emitir JWT final antes do MFA quando enforcement estiver ativo.

## Multi-tenant

Regras:

- todas as entidades MFA devem ter `clientId`;
- consultas sempre filtradas por `clientId`;
- politica MFA resolvida por `Client.features` + configuracao futura;
- tenant `government` pode receber recomendacao de politica mais forte, mas default continua off;
- admin interno pode diagnosticar, mas nao deve visualizar segredo, QR URI ou recovery codes.

## Impacto Nos Editais

MFA melhora principalmente:

- seguranca de acesso administrativo;
- trilha de auditoria de login;
- aderencia a editais que exigem controle de acesso robusto;
- reducao de risco em operacoes com dados pessoais;
- classificacao em editais avancados como Sao Jose do Rio Preto/SP.

MFA nao substitui OTP cidadao. Quando o edital exigir validacao ativa do cidadao por WhatsApp/SMS/email, isso deve ser tratado como modulo separado de OTP publico.

## Classificacao De Aderencia

| Requisito | Estado atual | Depois do design 77A |
| --- | --- | --- |
| MFA para usuarios internos | NAO ATENDE | ATENDE COM AJUSTE no plano, ainda sem runtime. |
| OTP cidadao | NAO ATENDE | Continua NAO ATENDE operacionalmente. |
| Auditoria de login reforcada | ATENDE COM AJUSTE | Plano de eventos definido. |
| Seguranca B2G de acesso | ATENDE COM AJUSTE | Roadmap claro para elevar aderencia. |

## Riscos

| Risco | Nivel | Mitigacao |
| --- | --- | --- |
| Bloquear operadores em producao | Alto | Rollout por flag, shadow antes de enforcement, recovery codes. |
| Perda de dispositivo ADMIN | Alto | Recovery codes e reset administrativo documentado. |
| Vazamento de segredo TOTP | Alto | Ciphertext, redaction, segredo exibido apenas no setup. |
| Brute force de codigo | Medio/alto | TTL, attemptCount, rate limit, lockout. |
| Atraso de provider email/SMS | Medio | TOTP como MVP sem provider externo. |
| Confundir MFA operador com OTP cidadao | Medio | Separar roadmaps e nomenclatura. |

## Roadmap

### 77B - MFA Schema + Settings

- criar models aditivos;
- criar flags `mfa`, `mfaRequired`, `mfaEnforced` com default false;
- criar tela `/app/security` ou area equivalente;
- permitir configuracao tenant/perfil sem alterar login;
- nenhum desafio MFA ainda.

Status 77B: implementado como fundacao. Foram criados `MfaTotpSecret`, `MfaRecoveryCode`, flags default off, endpoint `/app/mfa`, endpoint `/app/mfa/enrollment` e tela `/app/settings/security`. O enrollment gera segredo TOTP criptografado e payload `otpauth://`, mas ainda nao valida codigo, nao ativa enforcement e nao altera login/JWT.

### 77C - TOTP Shadow

- validar codigo TOTP em endpoint autenticado `/app/mfa/verify-shadow`;
- manter login, JWT e `AppAuthSession` inalterados;
- registrar `mfa.shadow.verify_success`, `mfa.shadow.verify_failed` e `mfa.shadow.verify_denied`;
- exibir teste de codigo em `/app/settings/security`;
- manter `mfaRequired` e `mfaEnforced` sem efeito sobre login.

Status 77C: implementado como validacao shadow. O endpoint `/app/mfa/verify-shadow` valida TOTP descriptografando o segredo tenant-scoped, retorna apenas `valid=true/false`, aplica rate limit simples e audita eventos redigidos. A tela `/app/settings/security` permite testar o codigo sem ativar MFA obrigatorio. Login, JWT, `AppAuthSession`, password reset e enforcement permanecem inalterados.

### 77D - MFA Runtime MVP

Objetivo: desenhar a primeira mudanca de runtime de login para exigir TOTP apenas quando a politica estiver ativa, sem implementar nesta sprint.

#### Fluxo alvo de login

```text
POST /auth/login
↓
validar email/senha sem revelar se usuario existe
↓
validar usuario ativo + tenant ativo
↓
avaliar politica MFA tenant-scoped
↓
se MFA nao se aplica:
  createExclusiveAppSession()
  issueClientAuthToken()
  retornar fluxo atual
↓
se MFA se aplica e usuario tem fator valido:
  criar desafio temporario MFA
  auditar login.mfa_required
  retornar { mfaRequired: true, mfaToken, expiresAt, methods: ["totp"] }
↓
POST /auth/mfa/verify
↓
validar mfaToken + TOTP
↓
createExclusiveAppSession()
↓
issueClientAuthToken()
↓
auditar login.mfa_success
```

Quando `mfaEnforced=true`, o backend nao deve emitir JWT final antes da verificacao TOTP. Enquanto o desafio estiver pendente, o usuario nao tem acesso ao `/app`.

#### Sessao temporaria MFA

Opcao recomendada para MVP: token assinado stateless, com payload minimo e TTL curto.

Campos do payload:

- `typ=mfa_challenge`
- `clientId`
- `userId`
- `role`
- `challengeId`
- `iat`
- `exp`
- `attemptNonce`

TTL recomendado: 5 minutos.

Persistencia recomendada para tentativas: usar tabela `MfaChallenge` em sprint runtime, porque permite `attemptCount`, lockout, expiracao e auditoria mais confiavel do que token puramente stateless. Se o MVP quiser reduzir migration, o token assinado pode ser usado primeiro com rate limit em memoria/Redis futuro, mas a opcao preferida para producao governamental e tabela tenant-scoped.

Modelo recomendado para `MfaChallenge`:

- `id`
- `clientId`
- `userId`
- `status` (`pending`, `verified`, `failed`, `expired`, `cancelled`)
- `attemptCount`
- `expiresAt`
- `verifiedAt`
- `ipHash`
- `userAgentHash`
- `createdAt`
- `updatedAt`

#### Politica de flags

| Flags | Comportamento |
| --- | --- |
| `mfa=false` | Login atual, sem area MFA e sem desafio. |
| `mfa=true`, `mfaRequired=false`, `mfaEnforced=false` | Setup e shadow disponiveis; login atual permanece igual. |
| `mfa=true`, `mfaRequired=true`, `mfaEnforced=false` | Runtime shadow: login continua emitindo JWT, mas registra `login.mfa_required`/`login.mfa_bypassed` para usuarios elegiveis. |
| `mfa=true`, `mfaRequired=true`, `mfaEnforced=true` | Runtime enforcement: usuarios elegiveis precisam completar TOTP antes do JWT final. |

MVP de perfil: aplicar apenas para `ADMIN`. `SUPERVISOR` entra em fase seguinte; `AGENT` permanece fora ate recovery, suporte e carga operacional estarem maduros.

#### Usuario elegivel sem fator

Para evitar lockout operacional:

- com `mfaEnforced=false`: login segue fluxo atual e registra bypass;
- com `mfaEnforced=true`: retornar erro controlado `mfa_setup_required` apenas para perfis exigidos;
- antes de ligar enforcement, tenant piloto deve ter todos os ADMINs com enrollment validado.

Sem recovery codes reais, enforcement deve ser restrito a tenant piloto e janela assistida.

#### Endpoint futuro

```text
POST /auth/mfa/verify
```

Entrada:

- `mfaToken`
- `code`

Saida de sucesso:

- mesmo contrato atual de `/auth/login` apos sessao final criada;
- `token`
- `user`
- `client`
- `features`

Saida de falha:

- `401/403` generico e redigido;
- nunca retornar segredo, ciphertext, codigo submetido ou detalhes de existencia de usuario.

#### Frontend

Fluxo recomendado:

1. `/app/login` envia email/senha.
2. Se resposta tiver `mfaRequired=true`, armazenar somente `mfaToken` temporario em memoria ou sessionStorage de curta duracao.
3. Exibir tela intermediaria `/app/login/mfa` ou estado inline no login.
4. Usuario informa codigo TOTP.
5. Frontend chama `/auth/mfa/verify`.
6. Em sucesso, salva a sessao final exatamente como hoje.
7. Em expiracao, volta ao login com mensagem clara.

Erros de codigo devem ser curtos e sem revelar detalhes: "Codigo invalido ou expirado.".

#### Recovery

Nao implementar recovery nesta fase. Para 77D runtime, rollback operacional deve ser a primeira linha de contingencia:

- desligar `mfaEnforced`;
- manter `mfa=true`;
- manter `mfaRequired=true` se quiser continuar medindo;
- reset manual de fator somente por procedimento assistido.

Recovery codes entram na 77G, antes de expandir enforcement para mais perfis.

#### Auditoria e seguranca

Eventos:

- `login.mfa_required`
- `login.mfa_success`
- `login.mfa_failed`
- `login.mfa_expired`
- `login.mfa_bypassed`

Controles:

- TTL de desafio de 5 minutos;
- maximo de 5 tentativas por desafio;
- rate limit por `clientId:userId`, IP hash e `challengeId`;
- invalidar desafio apos sucesso;
- invalidar desafio apos excesso de falhas;
- logs sem codigo TOTP, segredo, QR URI ou ciphertext;
- nao emitir JWT final antes do MFA quando enforcement estiver ativo.

#### Rollback

Rollback funcional:

```text
mfaEnforced=false
```

Resultado:

- `/auth/login` volta a emitir sessao final no fluxo atual;
- fatores e desafios historicos permanecem no banco;
- `/app/settings/security` e `/app/mfa/verify-shadow` continuam disponiveis se `mfa=true`;
- nenhum rollback de schema e necessario.

#### Status 77D

Sprint 77D e design-only. Nao altera codigo, banco, login, JWT, `AppAuthSession`, password reset ou enforcement.

### 77E - MFA Runtime Shadow

- instrumentar `/auth/login` para avaliar politica sem bloquear;
- registrar `login.mfa_shadow_required`, `login.mfa_shadow_not_required` e `login.mfa_shadow_skipped`;
- expor `/app/mfa/runtime-status` para diagnostico;
- login continua emitindo JWT final;
- nenhuma obrigatoriedade.

Status 77E: implementado como runtime shadow sem enforcement. Apos senha valida, `/auth/login` avalia `mfa` + `mfaRequired` para o perfil MVP `ADMIN`, registra `login.mfa_shadow_required`, `login.mfa_shadow_not_required` ou `login.mfa_shadow_skipped`, e continua criando `AppAuthSession` e JWT exatamente como antes. O endpoint `/app/mfa/runtime-status` retorna `enrolled`, `enabled`, `wouldRequireMfa`, `mode=shadow` e `reason` para diagnostico na tela `/app/settings/security`. A flag `mfaEnforced` permanece sem efeito nesta sprint.

### 77F - MFA Controlled Enforcement Design

- criar desafio temporario MFA;
- definir armazenamento/TTL/tentativas;
- definir endpoint futuro `/auth/mfa/verify`;
- definir rollback por `mfaEnforced=false`;
- documentar escopo piloto `ADMIN` + tenant piloto;
- nao alterar login nesta sprint.

Status 77F: design-only. Define enforcement controlado antes de alterar `/auth/login`, JWT ou `AppAuthSession`.

#### Fluxo De Enforcement Controlado

```text
POST /auth/login
↓
senha valida + usuario ativo + tenant ativo
↓
avaliar mfa=true + mfaRequired=true + mfaEnforced=true
↓
confirmar perfil elegivel: ADMIN no MVP
↓
confirmar fator TOTP existente e descriptografavel
↓
criar MfaChallenge temporario
↓
nao criar AppAuthSession final
↓
nao emitir JWT final
↓
retornar { mfaRequired: true, challengeToken, expiresAt, methods: ["totp"] }
↓
POST /auth/mfa/verify
↓
validar challengeToken + tenant + user + expiracao + tentativas
↓
validar codigo TOTP
↓
marcar challenge como verified
↓
createExclusiveAppSession()
↓
issueClientAuthToken()
↓
retornar contrato final atual de login
```

Se a politica nao exigir MFA, ou se `mfaEnforced=false`, o login segue exatamente o fluxo atual.

#### Desafio Temporario

Opcao aprovada para implementacao governamental: tabela tenant-scoped `MfaChallenge`, mesmo que exista um `challengeToken` assinado. A tabela evita depender apenas de memoria local e permite auditoria, tentativas e rollback limpo.

Campos recomendados:

| Campo | Uso |
| --- | --- |
| `id` | Identificador interno do desafio. |
| `clientId` | Isolamento multi-tenant obrigatorio. |
| `userId` | Usuario autenticado por senha. |
| `status` | `pending`, `verified`, `failed`, `expired`, `cancelled`. |
| `attemptCount` | Contador para lockout por desafio. |
| `expiresAt` | TTL curto; recomendado 5 minutos. |
| `verifiedAt` | Preenchido no sucesso. |
| `ipHash` | Auditoria sem IP bruto. |
| `userAgentHash` | Auditoria sem user-agent bruto. |
| `createdAt` / `updatedAt` | Operacao e troubleshooting. |

`challengeToken` deve conter apenas referencia assinada ao desafio:

- `typ=mfa_challenge`;
- `challengeId`;
- `clientId`;
- `userId`;
- `iat`;
- `exp`.

O token nao deve conter segredo TOTP, codigo, email completo ou dados sensiveis.

#### Endpoint Futuro

```text
POST /auth/mfa/verify
```

Entrada:

```json
{
  "challengeToken": "...",
  "code": "123456"
}
```

Resposta de sucesso:

```json
{
  "ok": true,
  "token": "...",
  "user": {},
  "features": {},
  "profile": "government"
}
```

Resposta de falha:

- `401` para desafio invalido, expirado ou codigo invalido;
- `429` para excesso de tentativas/rate limit;
- mensagem generica: `codigo_invalido_ou_expirado`;
- nunca retornar se o usuario existe, segredo, ciphertext, codigo enviado ou detalhes do fator.

#### Comportamento Das Flags

| Condicao | Resultado |
| --- | --- |
| `mfa=false` | Login atual, sem shadow/enforcement. |
| `mfa=true`, `mfaRequired=false` | Login atual; setup/verificacao disponiveis. |
| `mfa=true`, `mfaRequired=true`, `mfaEnforced=false` | Runtime shadow: login atual + auditoria. |
| `mfa=true`, `mfaRequired=true`, `mfaEnforced=true` | Enforcement controlado para perfis elegiveis. |

`mfaEnforced` so deve ser ligado em tenant piloto depois de:

- todos os `ADMIN` elegiveis terem enrollment TOTP;
- smoke de `/app/mfa/verify-shadow` passar;
- plano de rollback validado;
- equipe operacional presente para reset manual.

#### Escopo Piloto

MVP:

- tenant piloto: `demo-prefeitura` ou tenant governamental controlado;
- perfil: `ADMIN`;
- fator: TOTP apenas;
- usuarios sem enrollment: nao devem ser incluidos no piloto ou devem receber erro controlado `mfa_setup_required` com rollback imediato disponivel;
- `SUPERVISOR` e `AGENT`: fora do enforcement.

Nao implementar nesta fase:

- recovery codes;
- enforcement para `SUPERVISOR`;
- OTP cidadao;
- email/SMS/WhatsApp OTP;
- obrigatoriedade global.

#### Fallback Operacional

Sem recovery codes, o fallback e operacional:

1. Desligar `mfaEnforced=false` no tenant.
2. Manter `mfa=true` e `mfaRequired=true` para continuar medindo.
3. Login volta imediatamente ao fluxo atual.
4. Challenges pendentes devem ser ignorados e expirar naturalmente.
5. Se necessario, admin plataforma reseta fator TOTP do usuario em procedimento assistido.

Regra de seguranca: nao ligar enforcement se houver risco de travar o ultimo ADMIN de um tenant.

#### Frontend

Fluxo:

1. `/app/login` recebe `mfaRequired=true`.
2. Nao salva sessao final.
3. Guarda `challengeToken` em memoria ou `sessionStorage` de curta duracao.
4. Exibe tela intermediaria de codigo.
5. Chama `/auth/mfa/verify`.
6. Em sucesso, salva a sessao final atual.
7. Em expiracao, limpa o challenge e volta ao login.

Estados:

- aguardando codigo;
- codigo invalido;
- desafio expirado;
- muitas tentativas;
- voltar ao login.

#### Auditoria

Eventos planejados:

| Evento | Quando |
| --- | --- |
| `login.mfa_challenge_created` | Senha valida e enforcement exige MFA. |
| `login.mfa_challenge_verified` | TOTP valido e sessao final emitida. |
| `login.mfa_challenge_failed` | Codigo invalido ou tentativa falha. |
| `login.mfa_challenge_expired` | Challenge expirado. |
| `login.mfa_enforcement_bypassed` | Enforcement desligado/rollback ou usuario fora do escopo. |

Campos permitidos:

- `clientId`;
- `userId`;
- `role`;
- `challengeId`;
- `requestId`;
- `reason`;
- `attemptCount`;
- `ipHash` quando aplicavel.

Campos proibidos:

- codigo TOTP;
- segredo TOTP;
- ciphertext;
- QR URI;
- recovery code;
- senha;
- IP bruto;
- user-agent bruto.

#### Seguranca

Controles obrigatorios:

- TTL 5 minutos;
- maximo 5 tentativas por challenge;
- rate limit por `clientId:userId`, `challengeId` e IP hash;
- invalidar challenge apos sucesso;
- invalidar ou marcar failed apos excesso de tentativas;
- nao emitir JWT final antes do TOTP valido;
- nao criar `AppAuthSession` final antes do TOTP valido;
- resposta generica para falhas;
- rollback por flag sem migration rollback.

#### Rollback

Passo a passo:

```text
mfaEnforced=false
```

Depois:

- recarregar backend se flags estiverem cacheadas;
- confirmar `/auth/login` 200 para ADMIN;
- confirmar `/app/mfa/runtime-status` ainda mostra shadow;
- manter challenges pendentes ate expirarem;
- nao apagar fatores TOTP.

#### Criterios Para Implementar 77H

- 77F aprovado;
- `MFA_SECRET_ENCRYPTION_KEY` presente em producao;
- pelo menos um ADMIN piloto com enrollment validado;
- smoke de `verify-shadow` passando;
- rollback por `mfaEnforced=false` testado;
- decisao explicita sobre `MfaChallenge` migration.

### 77G - Recovery Codes

- criar recovery codes hash-only;
- gerar e regenerar codigos em `/app/mfa/recovery-codes/generate`;
- expor apenas status seguro em `/app/mfa/recovery-codes/status`;
- exibir codigos em claro uma unica vez;
- manter recovery fora do login ate a sprint de enforcement;
- preparar reset administrativo futuro.

Status 77G: implementado como MVP de seguranca pre-enforcement. A tela `/app/settings/security` permite gerar/regenerar 10 codigos de recuperacao, exibidos uma unica vez. O backend salva apenas hashes `scrypt`, remove codigos antigos nao usados na regeneracao e preserva contadores seguros de disponiveis/usados/total. Os eventos `mfa.recovery.generated`, `mfa.recovery.regenerated` e `mfa.recovery.status_viewed` sao redigidos. Login, JWT, `AppAuthSession`, password reset, `mfaRequired` e `mfaEnforced` permanecem inalterados; recovery codes ainda nao sao aceitos no login.

### 77H - MFA Runtime Controlled Enforcement MVP

- criar desafio temporario MFA;
- retornar `mfaRequired=true` para `ADMIN` em tenant piloto;
- criar `/auth/mfa/verify`;
- emitir JWT final somente apos TOTP valido;
- manter recovery codes fora do login;
- rollback por `mfaEnforced=false`.

Status 77H: implementado como enforcement MVP controlado. Quando `mfa=true`, `mfaRequired=true`, `mfaEnforced=true`, o usuario `ADMIN` possui TOTP enrolled/enabled e a senha e valida, `/auth/login` cria `MfaChallenge`, retorna `mfaRequired=true`, `challengeToken`, `expiresAt` e nao cria `AppAuthSession` nem JWT final. O endpoint `/auth/mfa/verify` valida o TOTP, marca o challenge como verificado e so entao emite a sessao/JWT final pelo mesmo contrato de login existente. `SUPERVISOR` e `AGENT` permanecem fora do enforcement MVP. Recovery codes continuam gerados/hash-only, mas nao sao aceitos no login nesta sprint. Rollback imediato: `mfaEnforced=false`.

### 77I - Supervisor Enforcement

- expandir enforcement para `SUPERVISOR` somente apos recovery codes e piloto ADMIN estavel.

### 77J - Admin Console Recovery

- diagnostico de MFA por usuario;
- reset administrativo auditado;
- revogacao de sessoes apos reset;
- procedimento especial para ultimo ADMIN do tenant.

## MVP Recomendado Para Implementacao

1. Criar schema e configuracao sem enforcement.
2. Habilitar `mfa=true` em tenant piloto.
3. Permitir setup TOTP para `ADMIN`.
4. Rodar verificacao TOTP shadow para validar codigos sem bloquear login.
5. Executar 77E em runtime shadow para medir impacto de `mfaRequired=true`.
6. Concluir 77F design de enforcement controlado.
7. Implementar recovery codes antes de enforcement amplo.
8. Ativar enforcement controlado somente para `ADMIN` em tenant piloto.
9. Expandir para `SUPERVISOR` somente depois de piloto e recovery estaveis.

## Confirmacao De Escopo

Sprints de design 77A/77D/77F:

- nao altera codigo;
- nao altera banco;
- nao cria migration;
- nao cria provider;
- nao altera login;
- nao altera JWT;
- nao altera sessoes;
- nao altera password reset;
- nao altera runtime.

Resultado: MFA/OTP fica desenhado, com caminho seguro para implementacao incremental e rollback por feature flag.
