// apps/whatsapp-agent/src/campaigns/campaignAcceptedDeliveryRecovery.ts
import crypto2 from "node:crypto";

// apps/whatsapp-agent/src/billing/metaUsageLedger.ts
var SERVICE_BILLING_CHANGE_DATE = Date.UTC(2026, 9, 1, 0, 0, 0);

// apps/whatsapp-agent/src/billing/activeMessageBilling.ts
var CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1e3;

// apps/whatsapp-agent/src/campaigns/campaignOperations.ts
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { AsyncLocalStorage } from "node:async_hooks";
function executorIdentity(pid) {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    const start = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
    return `${fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim()}.${start}`;
  } catch {
    return "unknown";
  }
}
var instance = `${process.pid}:${executorIdentity(process.pid)}:${crypto.randomUUID()}`;
var context = new AsyncLocalStorage();
var build = process.env.CAMPAIGN_BUILD_ID || `guard-sha256:${crypto.createHash("sha256").update(fs.readFileSync(fileURLToPath(import.meta.url))).digest("hex")}`;

// apps/whatsapp-agent/src/campaigns/campaignAcceptedDeliveryRecovery.ts
var originalEvidenceHash = (v) => crypto2.createHash("sha256").update(JSON.stringify(v, (_k, x) => x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x).replace(/[\u0080-\uffff]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"))).digest("hex");
export {
  originalEvidenceHash
};
