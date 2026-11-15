// Per-process limiter. Multi-instance deployments must also set an edge rate limit.
function rateLimit({ limit, windowMs, key = req => req.ip, now = Date.now }) {
  const buckets = new Map();
  return (req, res, next) => {
    const time = now();
    for (const [id, bucket] of buckets) if (bucket.until <= time) buckets.delete(id);
    const id = key(req);
    const bucket = buckets.get(id) || { count: 0, until: time + windowMs };
    if (++bucket.count > limit) {
      res.setHeader("Retry-After", Math.ceil((bucket.until - time) / 1000));
      return res.status(429).json({ error: "Terlalu banyak percobaan. Silakan coba lagi nanti." });
    }
    buckets.set(id, bucket);
    next();
  };
}
module.exports = { rateLimit };
