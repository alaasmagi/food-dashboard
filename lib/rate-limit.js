const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_SECONDS || 60) * 1000;
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS || 30);
const buckets = new Map();

export function checkRateLimit(req, keyPrefix = "api") {
  const now = Date.now();
  const ip = getClientIp(req);
  const key = `${keyPrefix}:${ip}`;
  const current = buckets.get(key);

  if (!current || now >= current.resetAt) {
    const next = {
      count: 1,
      resetAt: now + WINDOW_MS
    };
    buckets.set(key, next);
    cleanupBuckets(now);
    return rateLimitResult(next, true);
  }

  current.count += 1;
  return rateLimitResult(current, current.count <= MAX_REQUESTS);
}

export function applyRateLimitHeaders(res, result) {
  res.setHeader("X-RateLimit-Limit", String(MAX_REQUESTS));
  res.setHeader("X-RateLimit-Remaining", String(result.remaining));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));

  if (!result.allowed) {
    res.setHeader("Retry-After", String(Math.ceil(result.retryAfterMs / 1000)));
  }
}

function rateLimitResult(bucket, allowed) {
  const remaining = Math.max(0, MAX_REQUESTS - bucket.count);
  return {
    allowed,
    remaining,
    resetAt: bucket.resetAt,
    retryAfterMs: Math.max(0, bucket.resetAt - Date.now())
  };
}

function getClientIp(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  const forwarded = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  const realIp = req.headers["x-real-ip"];
  if (Array.isArray(realIp)) return realIp[0];
  if (realIp) return realIp;

  return req.socket?.remoteAddress || "unknown";
}

function cleanupBuckets(now) {
  if (buckets.size < 1000) return;

  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) {
      buckets.delete(key);
    }
  }
}
