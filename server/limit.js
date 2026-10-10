// Bellek içi token bucket: kapasite = limit, perMs içinde limit kadar dolar. IP'ler yalnız bellekte durur.
export function createLimiter({ limit, perMs = 60_000, now = Date.now }) {
  const buckets = new Map(); // anahtar -> { tokens, ts }
  const refill = b => Math.min(limit, b.tokens + (now() - b.ts) * limit / perMs);
  const sweep = () => { for (const [k, b] of buckets) if (refill(b) >= limit) buckets.delete(k); };
  setInterval(sweep, 60_000).unref();
  return {
    take(key) {
      if (buckets.size > 10_000) sweep();
      const b = buckets.get(key) ?? { tokens: limit, ts: now() };
      b.tokens = refill(b); b.ts = now();
      buckets.set(key, b);
      if (b.tokens >= 1) { b.tokens -= 1; return { ok: true }; }
      return { ok: false, retryAfterS: Math.ceil((1 - b.tokens) * perMs / limit / 1000) };
    },
    size: () => buckets.size,
  };
}
