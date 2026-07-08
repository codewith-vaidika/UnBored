"use strict";

/**
 * ─── SERVICE: RESPONSE CACHE ────────────────────────────
 *
 * Purpose: Avoids burning a Gemini API call when the same
 * (or very similar) query has been made recently.
 *
 * Strategy: Simple in-memory Map with a TTL (Time-To-Live).
 *   - When a request comes in, we generate a cache key from
 *     the search parameters.
 *   - If a matching, non-expired entry exists, we return it
 *     instantly — zero API cost, near-zero latency.
 *   - If not, we call Gemini, store the result, and set a timer.
 *
 * Trade-offs (important to understand):
 *   - This is a per-process, in-memory cache. If your server
 *     restarts, the cache is gone. That's fine for a portfolio
 *     project and even many production single-server apps.
 *   - For multi-server deployments, you'd use Redis instead.
 *     The pattern (key → TTL → value) is identical.
 */

const cache = new Map();

// Default TTL: 10 minutes. Trending/generic queries get longer.
const DEFAULT_TTL_MS  = 10 * 60 * 1000;   // 10 minutes
const TRENDING_TTL_MS = 30 * 60 * 1000;   // 30 minutes

/**
 * Generates a deterministic cache key from the search params.
 * Two identical searches should produce the same key.
 */
function buildCacheKey(params) {
  // Normalize and sort for consistency
  const normalized = {
    prompt      : (params.prompt || "").toLowerCase().trim(),
    mood        : (params.mood || "").toLowerCase(),
    time        : (params.time || "").toLowerCase(),
    budget      : params.budget || null,
    location    : (params.location || "").toLowerCase().trim(),
    interests   : (params.interests || []).sort().join(","),
    locationType: (params.locationType || "").toLowerCase(),
  };
  return JSON.stringify(normalized);
}

/**
 * Check if a cached response exists and is still fresh.
 * @param  {Object} params  - The AI search parameters
 * @return {Array|null}     - Cached activities array, or null
 */
function get(params) {
  const key   = buildCacheKey(params);
  const entry = cache.get(key);

  if (!entry) return null;

  // Check if the entry has expired
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }

  console.log(`📦  Cache HIT for key: ${key.slice(0, 80)}…`);
  return entry.data;
}

/**
 * Store a response in the cache.
 * @param {Object} params     - The AI search parameters
 * @param {Array}  data       - The activities array from Gemini
 * @param {number} [ttlMs]    - Custom TTL in milliseconds
 */
function set(params, data, ttlMs) {
  const key = buildCacheKey(params);

  // Determine TTL: trending/generic queries live longer
  const prompt = (params.prompt || "").toLowerCase();
  const isTrending = prompt.includes("trending")
                  || prompt.includes("popular")
                  || params.mood === "trending";

  const ttl = ttlMs || (isTrending ? TRENDING_TTL_MS : DEFAULT_TTL_MS);

  cache.set(key, {
    data,
    expiresAt: Date.now() + ttl,
    createdAt: new Date().toISOString(),
  });

  console.log(`💾  Cache SET for key: ${key.slice(0, 80)}… (TTL: ${ttl / 1000}s)`);
}

/**
 * Get basic cache statistics (useful for debugging).
 */
function stats() {
  // Prune expired entries first
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now > entry.expiresAt) cache.delete(key);
  }
  return { size: cache.size };
}

/**
 * Clear the entire cache (useful for admin/debug routes).
 */
function clear() {
  cache.clear();
  console.log("🗑️  Cache cleared.");
}

module.exports = { get, set, stats, clear };
