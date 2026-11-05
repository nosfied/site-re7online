import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const pageSource = fs.readFileSync(
  path.join(process.cwd(), "src/app/admin/tenants/[tenantId]/channels/page.tsx"),
  "utf8",
);
const apiSource = fs.readFileSync(path.join(process.cwd(), "src/lib/whatsappAdminApi.ts"), "utf8");

test("Meta inbound readiness keeps connection, DB-first persistence and real Inbox validation separate", () => {
  assert.match(pageSource, /1\. Identidade vinculada/);
  assert.match(pageSource, /2\. Persistência configurada/);
  assert.match(pageSource, /3\. Recebimento na Inbox/);
  assert.match(pageSource, /Conectado/);
  assert.match(pageSource, /Inbound validado/);
  assert.match(pageSource, /Identidades Meta sem ChannelAccount/);
  assert.match(pageSource, /Mensagem real persistida uma vez e visível na timeline humana/);
  assert.match(pageSource, /Atendimento Geral|departmentName/);
});

test("Console action is restricted to baseConfig and does not accept operational feature values", () => {
  assert.match(pageSource, /Gravar somente baseConfig/);
  assert.match(apiSource, /JSON\.stringify\(\{ field: "baseConfig" \}\)/);
  const actionStart = apiSource.indexOf("export async function materializeTenantMetaInboundBaseConfig");
  const actionEnd = apiSource.indexOf("\nexport async function", actionStart + 1);
  const actionSource = apiSource.slice(actionStart, actionEnd);
  assert.doesNotMatch(actionSource, /automationEnabled|outboundEnabled|aiEnabled|handoffEnabled/);
});
