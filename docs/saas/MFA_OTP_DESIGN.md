# Sprint 77A - OTP / MFA Design

Data: 2026-06-24

Status: design tecnico/funcional. A Sprint 77B iniciou a fundacao estrutural com schema, flags e tela de settings, sem alterar login, sessao, JWT ou runtime de autenticacao.

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

- gerar/confirmar fator TOTP em tenant piloto;
- simular politica de obrigatoriedade;
- registrar `login.mfa_required` em shadow sem bloquear login;
- medir usuarios afetados.

### 77D - MFA Runtime MVP

- alterar `/auth/login` para desafio MFA apenas quando flags e politica exigirem;
- criar `/auth/mfa/verify`;
- emitir JWT final somente apos MFA;
- rollback por `mfaEnforced=false`.

### 77E - Recovery Codes

- gerar recovery codes;
- usar recovery em login;
- reset administrativo;
- revogacao de sessoes apos recovery/reset.

## MVP Recomendado Para Implementacao

1. Criar schema e configuracao sem enforcement.
2. Habilitar `mfa=true` em tenant piloto.
3. Permitir setup TOTP para `ADMIN`.
4. Rodar shadow para detectar quem seria bloqueado.
5. Ativar `mfaRequired=true` para `ADMIN`.
6. Ativar `mfaEnforced=true` somente apos recovery e smoke de login.

## Confirmacao De Escopo

Esta sprint:

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
