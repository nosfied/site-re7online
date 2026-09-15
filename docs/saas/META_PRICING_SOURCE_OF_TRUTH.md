# Meta Pricing Source Of Truth

Status: FINOPS HARDENING / P1 WHILE REAL CAMPAIGN COST IS BLOCKED.

Last audit: 2026-09-15.

This document separates Meta provider cost from Converta customer contract price.
Do not use internal planning estimates, sales markup or contract units as the
official Meta tariff.

## Current Official Source

Primary official source:

- WhatsApp Business Platform Pricing:
  `https://whatsappbusiness.com/products/platform-pricing/`
- Meta for Developers pricing documentation:
  `https://developers.facebook.com/docs/whatsapp/pricing`

Official source status:

- The public WhatsApp pricing page is official.
- It confirms per-message billing, delivered-message condition, market/category
  pricing, four categories, volume tiers for utility/authentication, free entry
  points and free service/utility responses while applicable.
- The page links to official rate cards and volume tiers by currency.
- The exact structured rate-card table was not retrieved through the audit
  environment because the developer docs endpoint returned rate limiting and
  the public page rendered rate rows interactively.

Therefore:

- Official pricing model: PROVEN.
- Exact current structured Brazil rates from official source: NOT INGESTED.
- Exact rates below remain pending official rate-card import before production
  billing mutation or Recipient B send.

## Current Pricing Model

As of 2026-09-15, Meta describes WhatsApp Business Platform charges as:

- charge unit: delivered message, not sent message;
- pricing dimensions: recipient market and message category;
- categories: marketing, utility, authentication and service;
- service messages: no charge while responding in the customer service window
  under current public pricing text;
- utility templates sent in response to users: no charge under current public
  pricing text;
- free entry point: messages are free for 72 hours after click-to-WhatsApp or
  Facebook Page CTA entry;
- utility/authentication: can have volume tiers;
- marketing: category-specific delivered template price;
- rate changes: must be versioned by effective date; do not retroactively change
  prior message calculations.

Recipient country/market must follow Meta's market/rate-card rule. The public
official pricing page says rates vary by who the message is sent to and by
message category. Non-official cross-checks indicate the customer's phone
country/calling code is used; this must be confirmed from official docs/rate-card
metadata before implementation.

## Brazil Rate Card Status

Official structured rate data was not ingested in this audit.

Non-canonical cross-checks, citing Meta's official BRL rate card effective
2026-07-01, report:

| Category | Brazil tier/list rate | Currency | Source status |
| --- | ---: | --- | --- |
| Marketing | 0.3217 | BRL/message | Secondary, claims Meta BRL CSV |
| Utility | 0.0350 | BRL/message | Secondary, claims Meta BRL CSV |
| Authentication | 0.0350 | BRL/message | Secondary, claims Meta BRL CSV |
| Service | 0.0000 before 2026-10-01 public-rule context; future changes reported externally | BRL/message | Official public page confirms no charge now; exact future rate not ingested |

These values are useful for investigation, but they are not yet Converta's
canonical rate table. Canonical production use requires official source capture:
downloaded official rate card, WhatsApp Manager/Billing export, Graph/analytics
endpoint response, or invoice/usage data with source metadata.

## Canonical Rate Version

Every Meta rate used for billing or preview must be versioned:

- provider: `meta_whatsapp_business_platform`;
- market/country code;
- category;
- message family/type where applicable;
- currency;
- unit rate;
- volume tier start/end where applicable;
- effectiveFrom;
- effectiveTo;
- source URL/reference;
- retrievedAt;
- source checksum/version if available;
- import actor/review status.

Historical billing must use the rate version effective at event time. A new rate
card must create a new version and must not rewrite historical snapshots.

## Provider Cost vs Contract Price

Keep these separate:

- Provider cost: Meta tariff for the delivered message, in Meta billing currency.
- FX: conversion from provider currency to contract currency, if needed.
- Contract price: what Converta charges the customer under proposal/contract.
- Markup/margin: only if explicitly part of commercial model.
- Taxes/pass-through: only when contract/accounting requires.

Rules:

- Never derive Meta provider cost from contract price.
- Never derive contract price from Meta provider cost unless the customer
  contract explicitly defines a pass-through formula.
- `billing.active_message.delivered` is an eligibility/count event; it must not
  be read as BRL price unless a contract snapshot exists separately.

## FX Policy

If Meta charges in foreign currency and the customer contract is BRL, conversion
requires explicit policy:

- FX source;
- currency pair;
- rate timestamp/date;
- rounding rule;
- whether tax/gross-up applies;
- immutable snapshot on event/report.

No CRA source currently defines an FX source. Do not silently choose one for
billing. A recommended future policy is an admin-reviewed official daily PTAX or
invoice FX source snapshot, but this is not active.

## Product Audit

Current Converta references:

- `meta-br-planning-2026-08`: internal planning estimate, not official current
  pricing truth.
- `estimatedMetaUnitCostUsd=0.008`: internal Meta planning estimate for Utility,
  not official current Brazil BRL tariff.
- `billing.active_message.delivered`: delivered Utility outside-window
  eligibility/count event, idempotent by provider message id; not a BRL ledger.
- active-message report `unitPrice`: request parameter used to calculate report
  totals; not tenant config and not canonical provider price.
- `R$ 0,32`: internal CRA central commercial planning premise
  `R$ 3.200,00 / 10.000 mensagens ativas`; not Meta tariff and not proven final
  CRA contract unit.

Production read-only tenant config audit on 2026-09-15 found no active BRL
Utility unit override in `activeMessageBilling`, `billing` or `metaUsagePolicy`
for:

- `demo-converta`;
- `cra-pr`;
- `secult-pe`;
- `syer-rodrigues`.

## Resolver Design

Provider resolver:

```ts
resolveMetaPricing({
  provider: "META",
  recipientMarket,
  category,
  messageContext,
  timestamp,
  monthlyTierContext,
})
```

Returns:

- rate;
- currency;
- rateVersion;
- source;
- effectiveFrom/effectiveTo;
- tier metadata;
- priceStatus: `VERIFIED`, `STALE` or `UNKNOWN`.

Commercial resolver must be separate:

```ts
resolveContractPricing({
  clientId,
  contractId,
  billingItem,
  timestamp,
})
```

Returns the customer charge rule without modifying the provider-cost result.

## Ingestion Strategy

Recommended approach: hybrid official rate-card import plus admin review.

1. Import official downloadable rate card or official API/analytics data where
   available.
2. Store immutable rate versions with source metadata and checksum.
3. Require admin review/approval before marking a new rate version current.
4. Use invoices/WhatsApp Manager usage data to reconcile actual monthly spend.
5. Never scrape blindly if an official structured source exists.
6. Never silently fall back to stale internal estimates as official current cost.

## Staleness Behavior

- `PRICING VERIFIED`: official source imported and effective for timestamp.
- `PRICING STALE`: prior official source exists but freshness window expired or
  new effective date expected.
- `PRICING UNKNOWN`: no official effective rate for market/category/timestamp.

For cost preview and real billing:

- show provider cost only when `VERIFIED`;
- show customer/contract price separately when proven by contract;
- block or label provider-cost preview as unknown when Meta pricing is stale;
- do not block fixed contract price if contract is independent from Meta, but
  keep provider cost unknown.

## Campaign Preview Requirements

Campaign previews must label:

- message count;
- category;
- provider market;
- provider currency;
- provider rate and source/effective date;
- provider cost;
- FX source/rate if conversion is applied;
- contract unit and contract amount if contract-proven;
- pricing status.

Do not show a single unlabeled number called "cost".

## Billing Event Snapshot

Future delivered active-message billing snapshots should include, conceptually:

- provider category;
- provider market;
- provider rate;
- provider currency;
- provider rate version;
- provider cost;
- source/effective date;
- FX rate/source/date/rounding when used;
- contract unit;
- contract currency;
- contract amount;
- billing reason;
- source timestamps.

Schema change is likely needed for full provider/contract snapshots, but not
approved in this audit.

## CRA / Demo Impact

Recipient A:

- eligibility/count: correct (`delivered` Utility outside 24h);
- provider cost: not exactly reconstructable from official source in this audit;
- contract amount: not proven;
- mutation: none in this audit.

Recipient B:

- status: NOT ATTEMPTED;
- gate: PAUSED / PRICING RECONCILIATION;
- do not send until current official Meta Utility rate is proven and CRA
  contract price semantics are proven or clearly separated from Demo capability
  validation.
