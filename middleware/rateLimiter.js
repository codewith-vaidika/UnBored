"use strict";

/**
 * ─── MIDDLEWARE: RATE LIMITER ────────────────────────────
 *
 * Purpose: Protects expensive routes (like the Gemini API call)
 * from being spammed by a single IP address. This is a core
 * backend security practice that prevents abuse and saves
 * real money on API costs.
 *
 * How it works:
 *   - Each IP address gets a "bucket" of allowed requests.
 *   - If they exceed the limit within the time window,
 *     they get a 429 "Too Many Requests" response.
 *   - The bucket refills automatically after the window expires.
 */

const rateLimit = require("express-rate-limit");

// ── Limiter for the Gemini AI recommendation endpoint ────
// Allows 10 AI searches per IP address every 5 minutes.
const aiLimiter = rateLimit({
  windowMs : 5 * 60 * 1000,   // 5-minute window
  max      : 10,               // max 10 requests per window per IP
  standardHeaders: true,       // Return rate limit info in `RateLimit-*` headers
  legacyHeaders  : false,      // Disable `X-RateLimit-*` headers

  // User-friendly message shown when the limit is hit
  handler(req, res) {
    req.flash(
      "error",
      "You're sending too many requests. Please wait a few minutes before searching again."
    );
    return res.redirect("/dashboard");
  },
});

// ── General limiter for auth routes (login/signup) ───────
// Prevents brute-force password attacks.
const authLimiter = rateLimit({
  windowMs : 15 * 60 * 1000,  // 15-minute window
  max      : 25,               // max 25 attempts per window per IP
  standardHeaders: true,
  legacyHeaders  : false,

  handler(req, res) {
    req.flash(
      "error",
      "Too many login attempts. Please try again in 15 minutes."
    );
    return res.redirect("/login");
  },
});

module.exports = { aiLimiter, authLimiter };
