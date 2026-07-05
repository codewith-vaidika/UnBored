"use strict";

const { getRecommendations }  = require("../services/aiService");
const SearchHistory           = require("../models/SearchHistory");
const dashboardController     = require("./dashboardController");

function parseInterests(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((i) => i.trim().toLowerCase()).filter(Boolean);
  return String(raw)
    .split(",")
    .map((i) => i.trim().toLowerCase())
    .filter(Boolean);
}

function parseBudget(raw) {
  if (!raw) return null;
  const num = parseFloat(String(raw).replace(/[^0-9.]/g, ""));
  return isNaN(num) ? null : num;
}

function buildSearchParams(body) {
  return {
    prompt      : (body.prompt       || "").trim().slice(0, 500),
    mood        : body.mood          || "",
    availableTime: body.time          || "",
    budget      : parseBudget(body.budget),
    location    : (body.location     || "").trim(),
    interests   : parseInterests(body.interests),
    locationType: body.locationType  || "",
  };
}

exports.getRecommendations = async (req, res, next) => {
  try {
    const searchParams = buildSearchParams(req.body);
    const hasInput = searchParams.prompt
      || searchParams.mood
      || searchParams.interests.length > 0
      || searchParams.availableTime
      || searchParams.budget;

    if (!hasInput) {
      req.flash("error", "Please tell us something — your mood, available time, or what you enjoy!");
      return res.redirect("/dashboard");
    }
    const aiParams = {
      prompt      : searchParams.prompt,
      mood        : searchParams.mood,
      time        : searchParams.availableTime,
      budget      : searchParams.budget,
      location    : searchParams.location,
      interests   : searchParams.interests,
      locationType: searchParams.locationType,
      count       : 5,
    };
    let activities;
    try {
      activities = await getRecommendations(aiParams);
    } catch (aiErr) {
      console.error("Gemini API error:", aiErr.message);
      req.flash("error", aiErr.message || "AI is having trouble right now. Please try again in a moment.");
      return res.redirect("/dashboard");
    }

    if (req.user) {
      SearchHistory.logSearch(
        req.user._id,
        searchParams,
        activities.length
      ).catch((err) => console.error("SearchHistory log error:", err));
    }
    req.session.lastResults    = activities;
    req.session.lastSearchParams = searchParams;

    // ── Render results page ────────────────────────────────
    res.render("results", {
      title        : "Your Recommendations · UnBored",
      activities,
      searchParams,
      resultCount  : activities.length,
    });

  } catch (err) {
    next(err);
  }
};

exports.getLastResults = (req, res) => {
  const activities    = req.session.lastResults       || [];
  const searchParams  = req.session.lastSearchParams  || {};

  if (activities.length === 0) {
    req.flash("error", "No recent results found. Try a new search!");
    return res.redirect("/dashboard");
  }

  res.render("results", {
    title       : "Your Last Recommendations · UnBored",
    activities,
    searchParams,
    resultCount : activities.length,
  });
};

exports.saveActivity = (req, res, next) =>
  dashboardController.saveActivity(req, res, next);

exports.removeActivity = (req, res, next) =>
  dashboardController.removeActivity(req, res, next);
