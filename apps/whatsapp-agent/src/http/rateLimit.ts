import { IncomingMessage } from "node:http";

const WINDOW_MS = 60_000;
const LIMIT_WEBHOOK = 120;
const LIMIT_ADMIN = 60;
const LIMIT_AUTH = 12;
const CLEANUP_INTERVAL_OPS = 200;
const MAX_BUCKETS = 10_000;

type BucketClass = "admin" | "webhook" | "auth";

type Bucket = {
  count: number;
  windowStart: number;
  lastSeen: number;
};

const buckets = new Map<string, Bucket>();
let ops = 0;

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

function getBucketClass(pathname: string): BucketClass | null {
  if (pathname.startsWith("/admin/")) return "admin";
  if (pathname.startsWith("/webhook")) return "webhook";
  if (pathname === "/auth/login" || pathname === "/auth/forgot-password" || pathname === "/auth/reset-password") {
    return "auth";
  }
  return null;
}

function getLimit(bucketClass: BucketClass) {
  if (bucketClass === "auth") return LIMIT_AUTH;
  return bucketClass === "admin" ? LIMIT_ADMIN : LIMIT_WEBHOOK;
}

function getForwardedFor(req: IncomingMessage) {
  const value = req.headers["x-forwarded-for"];
  if (Array.isArray(value)) return value[0];
  return value;
}

function getClientIp(req: IncomingMessage) {
  const remote = normalizeIp(req.socket.remoteAddress);
  if (isLocalIp(remote)) {
    const forwarded = getForwardedFor(req);
    const rawCandidate = forwarded?.split(",")[0]?.trim() ?? "";
    const candidate = normalizeIp(rawCandidate);
    if (rawCandidate && candidate !== "unknown") {
      return candidate;
    }
  }
  return remote;
}

function cleanupBuckets(now: number) {
  const idleThreshold = WINDOW_MS * 2;
  const aggressive = buckets.size > MAX_BUCKETS;
  for (const [key, bucket] of buckets.entries()) {
    const idleMs = now - bucket.lastSeen;
    if (idleMs > idleThreshold || (aggressive && idleMs > WINDOW_MS)) {
      buckets.delete(key);
    }
  }
}

function maybeCleanup(now: number) {
  ops += 1;
  if (ops % CLEANUP_INTERVAL_OPS === 0 || buckets.size > MAX_BUCKETS) {
    cleanupBuckets(now);
  }
}

export function checkRateLimit(req: IncomingMessage, pathname: string) {
  const bucketClass = getBucketClass(pathname);
  const ip = getClientIp(req);
  if (!bucketClass) {
    return {
      limited: false as const,
      ip,
      limit: 0,
      bucketClass: null as BucketClass | null,
      windowMs: WINDOW_MS,
      retryAfterSec: 0,
    };
  }

  const limit = getLimit(bucketClass);
  if (isLocalIp(ip)) {
    return {
      limited: false as const,
      ip,
      limit,
      bucketClass,
      windowMs: WINDOW_MS,
      retryAfterSec: 0,
    };
  }

  const now = Date.now();
  const key = `${bucketClass}:${ip}`;
  maybeCleanup(now);
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now, lastSeen: now });
    return { limited: false as const, ip, limit, bucketClass, windowMs: WINDOW_MS, retryAfterSec: 0 };
  }

  bucket.lastSeen = now;
  if (bucket.count >= limit) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((bucket.windowStart + WINDOW_MS - now) / 1000)
    );
    return { limited: true as const, ip, limit, bucketClass, windowMs: WINDOW_MS, retryAfterSec };
  }

  bucket.count += 1;
  return { limited: false as const, ip, limit, bucketClass, windowMs: WINDOW_MS, retryAfterSec: 0 };
}

/*
Manual validation:
for i in $(seq 1 80); do
  curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:3001/admin/health" -H "X-Admin-Token: $ADMIN_TOKEN"
done
pm2 logs 0 --lines 200 --nostream | rg "rate.limit.hit"
*/
