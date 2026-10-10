// Offline administrative CLI. No app entrypoint, provider, scheduler or runner.
import fs from "node:fs";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { dryRunPosition6, applyPosition6, verifyPosition6, acknowledgePosition6, type Position6RecoveryInput } from "../src/campaigns/campaignAcceptedDeliveryRecovery.js";
const args = process.argv.slice(2);
const allowed = ["--mode=", "--input=", "--input-sha256=", "--plan-hash=", "--actor=", "--output="];
if (args.some(x => x !== "--execute-authorized" && !allowed.some(k => x.startsWith(k))))
    throw Error("position6_cli_unknown_argument");
const value = (key: string) => { const found = args.filter(x => x.startsWith(key + "=")); if (found.length > 1)
    throw Error("position6_cli_duplicate_argument"); return found[0]?.slice(key.length + 1); };
const mode = value("--mode") ?? "dry-run", inputFile = value("--input"), inputHash = value("--input-sha256"), outputFile = value("--output");
if (!["dry-run", "apply-sql", "verify-receipt", "ack-task"].includes(mode) || !inputFile || !outputFile || !inputHash || !/^[a-f0-9]{64}$/.test(inputHash))
    throw Error("position6_cli_mode_input_hash_output_required");
if (["apply-sql", "ack-task"].includes(mode) && !args.includes("--execute-authorized"))
    throw Error("position6_cli_execution_not_authorized");
const stat = fs.lstatSync(inputFile);
if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 0o077 || stat.size > 2 * 1024 * 1024)
    throw Error("position6_cli_private_input_invalid");
const raw = fs.readFileSync(inputFile);
if (crypto.createHash("sha256").update(raw).digest("hex") !== inputHash)
    throw Error("position6_cli_input_hash_mismatch");
if (!process.env.DATABASE_URL)
    throw Error("position6_cli_database_url_required_no_fallback");
const fd = fs.openSync(outputFile, "wx", 0o600), input = JSON.parse(raw.toString("utf8")) as Position6RecoveryInput, db = new PrismaClient({ log: [] });
try {
    let result: unknown;
    if (mode === "dry-run")
        result = await dryRunPosition6(db, input);
    else if (mode === "verify-receipt")
        result = await verifyPosition6(db, input);
    else if (mode === "apply-sql") {
        const planHash = value("--plan-hash"), actor = value("--actor");
        if (!planHash || !actor)
            throw Error("position6_cli_plan_actor_required");
        result = await applyPosition6(db, input, planHash, actor);
    }
    else {
        const actor = value("--actor");
        if (!actor)
            throw Error("position6_cli_actor_required");
        result = await acknowledgePosition6(db, input, actor);
    }
    fs.writeFileSync(fd, JSON.stringify({ mode, result, at: new Date().toISOString(), inputSha256: inputHash }) + "\n");
    fs.fsyncSync(fd);
    console.log(JSON.stringify({ mode, result, privateDiagnosticSaved: true, providerCalls: 0 }));
}
catch (error) {
    const e = error as Error & {
        code?: string;
    };
    const safe = e.message.startsWith("position6_") || e.message.startsWith("reconciliation_") || e.message.startsWith("accepted_delivery_") ? e.message : `${e.name}:${e.code ?? "unclassified"}`;
    fs.writeFileSync(fd, JSON.stringify({ mode, error: { name: e.name, code: e.code ?? null, reason: safe }, at: new Date().toISOString(), inputSha256: inputHash }) + "\n");
    fs.fsyncSync(fd);
    console.error(safe);
    process.exitCode = 1;
}
finally {
    fs.closeSync(fd);
    await db.$disconnect();
}
