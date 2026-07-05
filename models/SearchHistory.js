"use strict";
/**
 * models/SearchHistory.js
 * ─────────────────────────────────────────────────────────────
 * Tracks every AI recommendation request made by a user.
 *
 * Why store this?
 *   1. Dashboard "Recent Searches" widget (Step 5)
 *   2. Re-run a past search with one click
 *   3. Analytics — most popular moods / interests / budgets
 *
 * Each document is lightweight:  ~300 bytes on average.
 * We auto-expire old records (TTL index) to avoid unbounded growth.
 * ─────────────────────────────────────────────────────────────
 */
const mongoose = require("mongoose");

const { Schema } = mongoose;

// ── Search parameters sub-schema ─────────────────────────────────────────────
// Mirrors the form fields on the dashboard (Step 6 — dashboard.ejs)
const SearchParamsSchema = new Schema(
  {
    // Natural-language prompt the user typed, if used
    prompt: {
      type   : String,
      default: "",
      trim   : true,
      maxlength: 500,
    },

    // Structured fields (may be populated from form sliders / dropdowns)
    mood: {
      type   : String,
      enum   : ["happy", "bored", "stressed", "adventurous", "social", "solo", ""],
      default: "",
    },

    availableTime: {
      type   : String,
      default: "",
      // e.g. "30 min", "1 hour", "2-3 hours", "half day"
    },

    budget: {
      type   : Number,
      default: null,
      min    : 0,
      // Maximum budget in INR
    },

    location: {
      type   : String,
      default: "",
      trim   : true,
      // e.g. "Mumbai", "Delhi", "Home"
    },

    interests: {
      type   : [String],
      default: [],
      // e.g. ["outdoor", "creative"]
    },

    locationType: {
      type   : String,
      enum   : ["indoor", "outdoor", "both", "online", ""],
      default: "",
    },
  },
  { _id: false }
);

// ── Main SearchHistory schema ─────────────────────────────────────────────────
const SearchHistorySchema = new Schema(
  {
    // ── Reference to the user who made this search ─────────
    userId: {
      type    : Schema.Types.ObjectId,
      ref     : "User",
      required: true,
      index   : true,   // heavily queried by userId
    },

    // ── What the user searched for ──────────────────────────
    searchParams: {
      type   : SearchParamsSchema,
      default: () => ({}),
    },

    // ── What the AI returned ────────────────────────────────
    resultCount: {
      type   : Number,
      default: 0,
      // Number of activities returned by Gemini
    },

    // The full raw Gemini response (stringified JSON) for debugging
    // Stored only in development; can be stripped in production via middleware
    rawResponse: {
      type   : String,
      default: "",
      select : false,   // not returned by default
    },

    // Timestamp of the search (also tracked by createdAt, but explicit here
    // to make TTL + dashboard queries more readable)
    searchedAt: {
      type   : Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// ────────────────────────────────────────────────────────────
//  TTL INDEX — auto-delete search history older than 90 days
// ────────────────────────────────────────────────────────────
SearchHistorySchema.index(
  { searchedAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 }  // 90 days
);

// ────────────────────────────────────────────────────────────
//  COMPOUND INDEX — fast "last N searches for user" queries
// ────────────────────────────────────────────────────────────
SearchHistorySchema.index({ userId: 1, searchedAt: -1 });

// ────────────────────────────────────────────────────────────
//  STATIC METHODS
// ────────────────────────────────────────────────────────────

/**
 * SearchHistory.forUser(userId, limit)
 * Returns the most recent searches for a given user.
 * Usage (dashboardController): await SearchHistory.forUser(req.user._id, 5)
 */
SearchHistorySchema.statics.forUser = function (userId, limit = 5) {
  return this.find({ userId })
    .sort({ searchedAt: -1 })
    .limit(limit)
    .select("-rawResponse");   // never expose raw AI output to views
};

/**
 * SearchHistory.logSearch(userId, searchParams, resultCount)
 * Convenience method to create a new record.
 * Usage: await SearchHistory.logSearch(userId, params, activities.length)
 */
SearchHistorySchema.statics.logSearch = function (userId, searchParams, resultCount = 0) {
  return this.create({ userId, searchParams, resultCount });
};

// ────────────────────────────────────────────────────────────
//  JSON transform
// ────────────────────────────────────────────────────────────
SearchHistorySchema.set("toJSON", {
  virtuals: true,
  transform(doc, ret) {
    delete ret.__v;
    delete ret.rawResponse;   // extra safety
    return ret;
  },
});

module.exports = mongoose.model("SearchHistory", SearchHistorySchema);
