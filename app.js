"use strict";
require("dotenv").config();

const express       = require("express");
const path          = require("path");
const mongoose      = require("mongoose");
const ejsMate       = require("ejs-mate");
const session       = require("express-session");
const flash         = require("connect-flash");
const passport      = require("passport");
const methodOverride = require("method-override");

// ── Passport config (loaded after passport is required) ──
const configurePassport = require("./config/passport-config");

// ── Route modules ────────────────────────────────────────
const authRoutes      = require("./routes/authRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const activityRoutes  = require("./routes/activityRoutes");

// ── App instance ─────────────────────────────────────────
const app = express();

// ────────────────────────────────────────────────────────
//  DATABASE CONNECTION
// ────────────────────────────────────────────────────────
const MONGO_URL = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/unbored";

mongoose
  .connect(MONGO_URL)
  .then(() => console.log("✅  MongoDB connected"))
  .catch((err) => console.error("❌  MongoDB connection error:", err));

// ────────────────────────────────────────────────────────
//  VIEW ENGINE
// ────────────────────────────────────────────────────────
app.engine("ejs", ejsMate);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ────────────────────────────────────────────────────────
//  MIDDLEWARE
// ────────────────────────────────────────────────────────
app.use(express.urlencoded({ extended: true }));   // parse form bodies
app.use(express.json());                           // parse JSON bodies
app.use(methodOverride("_method"));                // support PUT/DELETE via forms
app.use(express.static(path.join(__dirname, "public")));

// ── Session ──────────────────────────────────────────────
const sessionOptions = {
  secret: process.env.SESSION_SECRET || "unbored_dev_secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    // secure: true,  ← enable in production (HTTPS only)
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
};
app.use(session(sessionOptions));

// ── Flash messages ───────────────────────────────────────
app.use(flash());

// ── Passport ─────────────────────────────────────────────
configurePassport(passport);
app.use(passport.initialize());
app.use(passport.session());

// ────────────────────────────────────────────────────────
//  GLOBAL TEMPLATE LOCALS
//  Available as variables in every EJS view
// ────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.locals.currentUser    = req.user || null;
  res.locals.successMsg     = req.flash("success");
  res.locals.errorMsg       = req.flash("error");
  next();
});

// ────────────────────────────────────────────────────────
//  ROUTES
// ────────────────────────────────────────────────────────
app.use("/",          authRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/activity",  activityRoutes);

// NOTE: GET "/" is now handled inside authRoutes.js

// ── 404 handler ──────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render("errors/404");
});

// ── Global error handler ─────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  const statusCode = err.statusCode || 500;
  const message    = err.message   || "Something went wrong";
  res.status(statusCode).render("errors/error", { statusCode, message });
});

// ────────────────────────────────────────────────────────
//  START SERVER
// ────────────────────────────────────────────────────────
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀  UnBored server running → http://localhost:${PORT}`);
});