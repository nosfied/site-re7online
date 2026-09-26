// Real second process holds the guard's own writer lock at rename, not a mocked lock.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
export async function holdCampaignLedgerLock() {
  const releaseFile = path.join(path.dirname(process.env.CAMPAIGN_OPERATIONS_FILE!), "release-writer");
  const moduleUrl = new URL("./campaignOperations.ts", import.meta.url).href;
  const loader = new URL("../../node_modules/tsx/dist/loader.mjs", import.meta.url).href;
  const child = spawn(process.execPath, ["--import", loader, "--input-type=module", "-e", `
    import fs from 'node:fs';
    import { campaignTask } from ${JSON.stringify(moduleUrl)};
    const rename = fs.renameSync; let first = true;
    fs.renameSync = (...args) => {
      if (first && args[1] === process.env.CAMPAIGN_OPERATIONS_FILE) {
        first = false; process.stdout.write('LOCK_HELD');
        while (!fs.existsSync(${JSON.stringify(releaseFile)})) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
      }
      return rename(...args);
    };
    await campaignTask('concurrent-writer', async () => {});
  `], { env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"] });
  let errors = ""; child.stderr.on("data", data => { errors += data; });
  const exited = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolve() : reject(new Error(`writer exit ${code}: ${errors}`)));
  });
  await Promise.race([new Promise<void>(resolve => child.stdout.on("data", data => { if (String(data).includes("LOCK_HELD")) resolve(); })), exited.then(() => { throw new Error("writer exited before lock"); })]);
  return { release: async () => { fs.writeFileSync(releaseFile, "release"); await exited; }, kill: () => child.kill() };
}
