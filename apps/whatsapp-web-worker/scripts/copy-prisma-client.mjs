import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.resolve(root, "../whatsapp-agent/node_modules/.prisma/client");
const target = path.resolve(root, "node_modules/.prisma/client");

if (!fs.existsSync(source)) {
  throw new Error(`Generated Prisma client not found at ${source}`);
}

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.cpSync(source, target, { recursive: true });
console.log("Copied generated Prisma client into whatsapp-web-worker node_modules.");
