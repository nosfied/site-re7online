import { IncomingMessage } from "node:http";

const WINDOW_MS = 60_000;
const LIMIT_WEBHOOK = 120;
const LIMIT_ADMIN = 60;

type Bucket = {
  count: number;
  windowStart: number;
};

const buckets = new Map<string, Bucket>();

function normalizeIp(ipRaw: string | undefined) {
  if (!ipRaw) return "unknown";
  const ip = ipRaw.trim();
  if (ip.startsWith("::ffff:")) {
    return ip.slice(7);
  }
  return ip;
}

function isLocalIp(ip: string) {
  return ip === "127.0.0.1" || ip === "::1";
}

function getLimitForPath(pathname: string) {
  if (pathname.startsWith("/admin/")) return LIMIT_ADMIN;
  if (pathname.startsWith("/webhook")) return LIMIT_WEBHOOK;
  return null;
}

export function checkRateLimit(req: IncomingMessage, pathname: string) {
  const limit = getLimitForPath(pathname);
  const ip = normalizeIp(req.socket.remoteAddress);
  if (!limit || isLocalIp(ip)) {
    return { limited: false as const, ip, limit: limit ?? 0 };
  }

  const key = `${pathname.startsWith("/admin/") ? "admin" : "webhook"}:${ip}`;
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return { limited: false as const, ip, limit };
  }

  if (bucket.count >= limit) {
    return { limited: true as const, ip, limit };
  }

  bucket.count += 1;
  return { limited: false as const, ip, limit };
}
