import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");
const appEnvPath = path.join(appRoot, ".env");
const cwdEnvPath = path.resolve(process.cwd(), ".env");

const primary = dotenv.config({ path: appEnvPath, override: false });
const fallback = primary.error ? dotenv.config({ path: cwdEnvPath, override: false }) : null;
const ok = Boolean(!primary.error || (fallback && !fallback.error));
const loadedPath = !primary.error ? appEnvPath : !fallback?.error ? cwdEnvPath : undefined;

console.info(
  JSON.stringify({
    event: "env.loaded",
    ok,
    path: loadedPath,
  })
);

if (!ok) {
  console.warn(
    JSON.stringify({
      event: "env.load_failed",
      tried: [appEnvPath, cwdEnvPath],
    })
  );
}
