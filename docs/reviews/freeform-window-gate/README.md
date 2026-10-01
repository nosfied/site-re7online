# Freeform Window Gate — Review Package

**LOCAL VALIDATED / NOT DEPLOYED.** This package documents the review delta after `4b78bddedb827336df4154229472229c57df5e5b` for WhatsApp freeform-window enforcement and template readiness. It includes no production operation, bundles, secrets, fixtures, or private evidence.

## Worker Minimal Backport

`apps/whatsapp-agent/src/web-session/webSessionInbound.ts` is imported by `apps/whatsapp-web-worker/src/whatsappWebSessionWorker.ts`, so the worker artifact is affected. Keep the production worker composition minimal: `bf5f1d76 + f06d49cb + 91230f88 + b66bb89a`, then apply [`worker-web-session-window-gate.patch`](worker-web-session-window-gate.patch). Do **not** replace it with the full API tree.

Patch SHA-256: `e77a0a6101a458d2a754a97aa8514e17ce1de4e62bf0ec1078fd014782be2ed8`.

Changed worker source:

- `apps/whatsapp-agent/src/web-session/webSessionInbound.ts` -> `e68f03e3a82756e999163f62969ce4bee040c5a4a23985ee2ead41d47264c0d2`

Local worker build hashes after `npm --prefix apps/whatsapp-web-worker run build`:

- `dist/whatsapp-agent/src/web-session/webSessionInbound.js` -> `917cf1700ff3dd8bad0f0efa7f1382c62954a98de3cbe9aefdeddbaf5e63a814`
- `dist/whatsapp-agent/src/conversation/conversation.service.js` -> `9da72b5b680ebae67d3af32b0eebcd5777c5a7af7a2d63c051cbf8df2fa4c5bd`

`conversation.service.js` is already present in the worker artifact; this patch does not introduce a new compiled dependency beyond the updated inbound module.

## API Delta Outside Worker

`sendPassiveOutboundText` in `apps/whatsapp-agent/src/whatsapp/webhook.controller.ts` now reloads current runtime state and checks `isWindowOpen(...)` immediately before WEB_SESSION provider submission. This covers responses prepared by AI/provider simulation where the 24h window expires before transport. It returns `window_closed` with zero provider call and no false flow advancement.

## Validation Matrix

New/affected checks executed locally with simulated providers and local DB only:

- `campaignsFeatureRoutes.test.ts` focused: `inbox template send|web session inbound uses shared chatbot flow and queue handoff|inbox routes WhatsApp web session outbound through worker without Meta fallback` -> 9/9 PASS.
- `automationOwnActivity.test.ts` focused: `passive WEB sender revalidates window after reply preparation|Meta/hybrid IA|real accepted outbound during|integrated WEB consent` -> 13/13 PASS. The passive WEB sender expiration case is new in this package; the remaining cases are directed regressions around b66/self-write protection.
- `src/lib/inboxWindow.test.ts` + `campaignsPageContract.test.ts` -> 32/32 PASS.
- `npm --prefix apps/whatsapp-agent run build` -> PASS.
- `npm --prefix apps/whatsapp-web-worker run build` -> PASS.
- `npm run build` -> PASS.

Previous phrase “inatividade + b66bb89a 13/13” referred to a selected directed subset, not the older 15-case full statement from prior reviews.

## Limits

No production, deploy, activation, migration, provider real, or real send. META_CLOUD pure and productive API->WEB correlation remain separate validation items. Bundles and detailed evidence stay outside Git.
