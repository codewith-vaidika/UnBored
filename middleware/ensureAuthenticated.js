"use strict";
/**
 * middleware/ensureAuthenticated.js
 * ─────────────────────────────────────────────────────────────
 * Route guard middleware.
 * Protects any route that requires a logged-in user.
 * Usage: router.get("/dashboard", ensureAuthenticated, handler)
 * ─────────────────────────────────────────────────────────────
 */

/**
 * ensureAuthenticated — redirect to /login if not authenticated
 */
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  // Save the originally requested URL to redirect back after login
  req.session.returnTo = req.originalUrl;
  req.flash("error", "You must be logged in to access that page.");
  res.redirect("/login");
}

/**
 * ensureGuest — redirect to /dashboard if already logged in
 * (prevents logged-in users from seeing login/signup pages)
 */
function ensureGuest(req, res, next) {
  if (!req.isAuthenticated()) return next();
  res.redirect("/dashboard");
}

module.exports = { ensureAuthenticated, ensureGuest };
