# Feature Flags Matrix

Status: current-state documentation based on code inspection. This file does not define runtime behavior.

## Sources Of Truth

- Backend feature defaults: `apps/whatsapp-agent/src/features/clientFeatures.ts`
- Frontend feature defaults: `src/lib/appFeatures.ts`
- Stored override: `Client.features` JSON in Postgres
- Profile selector: `Client.profile`, normalized to `business` or `government`
- Backend enforcement: `enforceAppFeature` in `apps/whatsapp-agent/src/http/routes.ts`

## Active App Features

| Feature | Business Default | Government Default | Origin Of Rule | Backend Enforcement | Frontend Use |
| --- | --- | --- | --- | --- | --- |
| `dashboard` | false | true | `DEFAULT_*_CLIENT_FEATURES` / `DEFAULT_*_APP_FEATURES` | yes, routes with `feature: "dashboard"` | yes |
| `departments` | true | true | same defaults | yes, department routes | yes |
| `users` | true | true | same defaults | partial; user UI/API uses app auth/RBAC and session features | yes |
| `templates` | true | false | same defaults | yes, template routes | yes |
| `sla` | true | true | same defaults | represented in feature defaults; operational SLA uses DB config | yes |
| `reports` | true | true | same defaults | yes, reports routes | yes |
| `campaigns` | true | false | same defaults | yes, campaign routes | yes |
| `chatbot` | true | true | same defaults | yes, chatbot routes | yes |
| `knowledgeBase` | false | false | controlled rollout via `Client.features` | yes, knowledge base routes | yes |
| `scheduling` | false | false | controlled rollout via `Client.features` | yes, scheduling routes | yes |
| `schedulingReminders` | false | false | controlled rollout via `Client.features` | yes, scheduling reminders routes | yes |
| `schedulingRemindersShadow` | false | false | controlled rollout via `Client.features` | CLI shadow eligibility only | no customer UI yet |
| `schedulingRemindersSend` | false | false | controlled rollout via `Client.features` | CLI controlled send only | no customer UI yet |
| `schedulingConfirmation` | false | false | controlled rollout via `Client.features` | reserved for future confirmation runtime | no runtime yet |
| `satisfaction` | false | false | controlled rollout via `Client.features` | yes, satisfaction routes | yes |
| `audioTranscription` | false | false | controlled rollout via `Client.features` | yes, audio transcription read route | yes |
| `audioTranscriptionRuntime` | false | false | controlled rollout via `Client.features` | reserved for future STT runtime | no runtime yet |
| `advancedSearch` | false | false | controlled rollout via `Client.features` | yes, advanced search diagnostic route | yes |
| `advancedSearchRuntime` | false | false | controlled rollout via `Client.features` | reserved for future search runtime/indexer | no runtime yet |
| `webchat` | false | false | controlled rollout via `Client.features` | yes, webchat settings routes | yes |
| `webchatOutbound` | false | false | controlled rollout via `Client.features` | yes, webchat outbound guard | yes |
| `telegram` | false | false | controlled rollout via `Client.features` | yes, Telegram settings/webhook routes | yes |
| `telegramInbound` | false | false | controlled rollout via `Client.features` | yes, Telegram inbound guard | no separate customer UI |
| `telegramOutbound` | false | false | controlled rollout via `Client.features` | yes, Telegram outbound guard | no separate customer UI |
| `webhooks` | false | false | controlled rollout via `Client.features` | yes, webhook endpoint routes | yes |
| `webhookDispatch` | false | false | controlled rollout via `Client.features` | CLI/manual dispatch guard | no customer execution UI |
| `webhookDispatchExecute` | false | false | controlled rollout via `Client.features` | real dispatch execution guard | no customer execution UI |
| `mfa` | false | false | controlled rollout via `Client.features` | yes, `/app/mfa` and enrollment route | yes |
| `mfaRequired` | false | false | controlled rollout via `Client.features` | no login runtime yet; policy flag reserved | visible in MFA status |
| `mfaEnforced` | false | false | controlled rollout via `Client.features` | no login runtime yet; enforcement reserved | visible in MFA status |

## Frontend-Only/Future Flags

These are typed in the frontend feature model but are not part of backend `ClientFeatureKey` enforcement today.

| Feature | Default | Current Status |
| --- | --- | --- |
| `governmentReports` | false | future/reserved |
| `poc` | false | future/reserved |
| `salesPipeline` | false | future/reserved |
| `instagramIntegration` | false | future/reserved |

## Feature Resolution Rules

1. The tenant profile is read from `Client.profile`.
2. If profile is `government`, government defaults apply.
3. Otherwise business defaults apply.
4. If `Client.features` contains a boolean override for a known feature, the override wins.
5. Backend denies disabled features with `feature_not_enabled` and writes an audit event named `feature.denied`.

## Governance Notes

- Backend and frontend currently duplicate the default matrix in separate files.
- Any new production feature flag must be added to both backend and frontend definitions unless a shared package is introduced later.
- Tenant-level automation flags in `tenants.json` are not the same as `Client.features`; they are operational configuration, not module availability.
- MFA flags are structural in Sprint 77B. They do not change `/auth/login`, JWT issuance or `AppAuthSession` behavior until a future runtime sprint.
