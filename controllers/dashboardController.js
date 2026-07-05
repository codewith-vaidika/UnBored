"use strict";
/**
 * controllers/dashboardController.js
 * ─────────────────────────────────────────────────────────────
 * Handles the user dashboard — the central hub of UnBored.
 *
 * Dashboard features:
 *   1. Personalized greeting + stats strip
 *   2. AI search form (prefilled with user's saved preferences)
 *   3. Recent search history widget (last 5 searches)
 *   4. Saved activities grid (from user.savedActivities)
 * ─────────────────────────────────────────────────────────────
 */
const User          = require("../models/User");
const Activity      = require("../models/Activity");
const SearchHistory = require("../models/SearchHistory");

// ────────────────────────────────────────────────────────────
//  GET /dashboard
// ────────────────────────────────────────────────────────────
exports.getDashboard = async (req, res, next) => {
  try {
    // Fetch a fresh copy of the user with savedActivities populated
    // (req.user from Passport session may be stale or missing savedActivities)
    const user = await User.findById(req.user._id).select(
      "username email profilePicture bio preferences savedActivities createdAt"
    );

    if (!user) {
      req.flash("error", "Could not load your profile. Please log in again.");
      return res.redirect("/login");
    }

    // Sort saved activities newest-first
    const savedActivities = (user.savedActivities || [])
      .slice()
      .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

    // Fetch last 5 searches for the history widget
    const searchHistory = await SearchHistory.forUser(req.user._id, 5);

    // Quick stats
    const stats = {
      savedCount  : savedActivities.length,
      searchCount : searchHistory.length,
      memberDays  : Math.floor(
        (Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24)
      ),
    };

    res.render("dashboard", {
      title          : `Dashboard · ${user.username}`,
      user,
      savedActivities,
      searchHistory,
      stats,
      // Pass user preferences to prefill the search form
      prefill: {
        mood        : user.preferences?.defaultMood        || "",
        budget      : user.preferences?.defaultBudget      || 500,
        location    : user.preferences?.defaultLocation    || "",
        interests   : user.preferences?.interests          || [],
      },
    });

  } catch (err) {
    next(err);
  }
};

// ────────────────────────────────────────────────────────────
//  POST /activity/save  (wired via activityController)
//  Saves an AI-generated activity snapshot to the user's
//  savedActivities array AND creates a global Activity doc.
// ────────────────────────────────────────────────────────────
exports.saveActivity = async (req, res) => {
  try {
    const {
      title,
      category,
      description,
      estimatedTime,
      estimatedCost,
      minCostINR,
      maxCostINR,
      locationType,
      tags,
    } = req.body;

    // ── 1. Validate required fields ───────────────────────
    if (!title || !description) {
      return res.status(400).json({
        success: false,
        message: "Activity title and description are required.",
      });
    }

    // ── 2. Duplicate guard ────────────────────────────────
    //    Check user hasn't already saved this exact title
    const user = await User.findById(req.user._id).select("savedActivities");
    if (!user) {
      return res.status(401).json({ success: false, message: "User not found." });
    }

    const alreadySaved = user.hasActivitySaved(title);
    if (alreadySaved) {
      return res.status(409).json({
        success: false,
        message: "You've already saved this activity.",
      });
    }

    // ── 3. Build the snapshot object ──────────────────────
    const snapshot = {
      title,
      category     : category     || "General",
      description,
      estimatedTime: estimatedTime || "",
      estimatedCost: estimatedCost || "Free",
      locationType : locationType  || "both",
      imageUrl     : "",   // Cloudinary image enhancement future scope
      savedAt      : new Date(),
    };

    // ── 4. Push snapshot to User.savedActivities ──────────
    await User.findByIdAndUpdate(
      req.user._id,
      { $push: { savedActivities: snapshot } },
      { new: true, runValidators: true }
    );

    // ── 5. Upsert global Activity document ────────────────
    //    findOneAndUpdate with upsert: creates if not exists,
    //    otherwise increments saveCount on the existing doc.
    const activityDoc = await Activity.findOneAndUpdate(
      { title: title.trim() },                   // match by title
      {
        $inc: { saveCount: 1 },                  // increment save counter
        $setOnInsert: {                           // only set these on creation
          title,
          category     : category      || "General",
          description,
          estimatedTime: estimatedTime  || "",
          estimatedCost: estimatedCost  || "Free",
          minCostINR   : Number(minCostINR) || 0,
          maxCostINR   : Number(maxCostINR) || 0,
          locationType : locationType   || "both",
          tags         : Array.isArray(tags) ? tags : [],
          isAiGenerated: true,
        },
      },
      { upsert: true, new: true }
    );

    // ── 6. Respond ────────────────────────────────────────
    return res.status(200).json({
      success   : true,
      message   : `"${title}" saved to your favourites! ❤️`,
      activityId: activityDoc._id,
      savedAt   : snapshot.savedAt,
    });

  } catch (err) {
    console.error("saveActivity error:", err);

    if (err.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: Object.values(err.errors)[0].message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Something went wrong while saving. Please try again.",
    });
  }
};

// ────────────────────────────────────────────────────────────
//  DELETE /activity/:id  — Remove a saved activity by its
//  subdocument _id from the user's savedActivities array.
// ────────────────────────────────────────────────────────────
exports.removeActivity = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid activity ID.",
      });
    }

    // Pull the subdoc by its _id from the embedded array
    const result = await User.findByIdAndUpdate(
      req.user._id,
      { $pull: { savedActivities: { _id: id } } },
      { new: true }
    );

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Activity not found in your saved list.",
      });
    }

    // Optionally decrement saveCount on the global Activity doc (best-effort)
    // We use the title from the pull — but since it's gone from the array we
    // don't have access to it here. Decrement is handled in a future analytics pass.

    return res.status(200).json({
      success: true,
      message: "Activity removed from your favourites.",
    });

  } catch (err) {
    console.error("removeActivity error:", err);
    return res.status(500).json({
      success: false,
      message: "Could not remove activity. Please try again.",
    });
  }
};

// ────────────────────────────────────────────────────────────
//  GET /saved
//  Dedicated "Saved Activities" full-page view
// ────────────────────────────────────────────────────────────
exports.getSaved = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select("username savedActivities");

    const savedActivities = (user.savedActivities || [])
      .slice()
      .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

    res.render("saved", {
      title          : `Saved Activities · ${user.username}`,
      savedActivities,
      user,
    });
  } catch (err) {
    next(err);
  }
};
