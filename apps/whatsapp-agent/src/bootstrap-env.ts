import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const cwdPath = path.resolve(process.cwd(), ".env");
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fallbackPath = path.resolve(__dirname, "../.env");

const primary = dotenv.config({ path: cwdPath, override: false });
const fallback = primary.error
  ? dotenv.config({ path: fallbackPath, override: false })
  : null;

if (process.env.NODE_ENV !== "production") {
  console.info(
    `dotenv loaded: ${Boolean(!primary.error || (fallback && !fallback.error))}`
  );
}
