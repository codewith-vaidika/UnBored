"use strict";
/**
 * services/aiService.js
 * ─────────────────────────────────────────────────────────────
 * Core AI layer — wraps the Google Gemini API to produce
 * structured, validated activity recommendations.
 *
 * Design goals:
 *   1. Single responsibility — knows nothing about HTTP or DB.
 *      Only takes a params object, calls Gemini, returns clean data.
 *   2. Strict JSON contract — Gemini is instructed to ALWAYS return
 *      a valid JSON array. We parse + validate every field.
 *   3. Resilience — malformed AI responses are caught and a helpful
 *      error is thrown so the controller can handle it gracefully.
 *   4. Prompt engineering — the system instruction is version-stamped
 *      so we can A/B test different prompt strategies easily.
 * ─────────────────────────────────────────────────────────────
 */
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

// ── Singleton client (created once, reused across requests) ──────────────────
let _genAI = null;
let _model  = null;

function getModel() {
  if (_model) return _model;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to your .env file. " +
      "Get a free key at https://aistudio.google.com/app/apikey"
    );
  }

  _genAI = new GoogleGenerativeAI(apiKey);
  _model  = _genAI.getGenerativeModel({
    model: "gemini-2.5-flash",          // Fast, cost-efficient, supports JSON mode
    generationConfig: {
      temperature      : 0.85,           // Creative but not chaotic
      topP             : 0.9,
      topK             : 40,
      maxOutputTokens  : 8192,
      responseMimeType : "application/json",  // Force pure JSON output
    },
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ],
  });

  return _model;
}

// ── Valid category enum (must match Activity.js) ─────────────────────────────
const VALID_CATEGORIES = [
  "Creative", "Outdoor", "Gaming", "Fitness", "Music", "Reading",
  "Travel", "Food & Cooking", "Movies & Shows", "Social",
  "Mindfulness", "Learning", "DIY & Crafts", "Photography", "General",
];

const VALID_LOCATION_TYPES = ["indoor", "outdoor", "both", "online"];

// ────────────────────────────────────────────────────────────
//  SYSTEM INSTRUCTION (v2)
//  Defines Gemini's persona, output contract, and constraints.
// ────────────────────────────────────────────────────────────
const SYSTEM_INSTRUCTION = `
You are UnBored AI, a friendly and creative activity recommendation engine.
Your job is to suggest fun, practical activities based on a user's current mood,
available time, budget, location, and interests.

OUTPUT CONTRACT — you MUST follow this exactly:
- Respond with ONLY a valid JSON array. No markdown, no explanation, no prose.
- The array must contain between 4 and 6 activity objects.
- Each object must have EXACTLY these fields (no extras, no omissions):

{
  "title":         string  — Short, catchy name (max 60 chars)
  "category":      string  — MUST be one of: ${VALID_CATEGORIES.join(", ")}
  "description":   string  — 2-3 engaging sentences explaining what to do and why it's great (max 250 chars)
  "estimatedTime": string  — Human-readable duration, e.g. "30 minutes", "1–2 hours", "Half day"
  "estimatedCost": string  — Human-readable cost in INR, e.g. "Free", "₹100–₹300", "Under ₹500"
  "minCostINR":    number  — Minimum cost in INR as integer (0 if free)
  "maxCostINR":    number  — Maximum cost in INR as integer (0 if free)
  "locationType":  string  — MUST be one of: indoor, outdoor, both, online
  "tags":          array   — 3-5 lowercase single-word tags, e.g. ["solo", "creative", "cheap"]
  "whyItFits":     string  — One sentence explaining why this matches the user's specific context
}

RULES:
1. All activities MUST fit within the stated budget. Never suggest something that exceeds it.
2. All activities MUST be completable within the stated time window.
3. If a location is given (city/area), prefer activities available or doable there.
4. Match the mood — if the user is stressed, suggest calming activities; if adventurous, suggest exciting ones.
5. Vary the suggestions — mix different categories and location types for diversity.
6. Make activities specific and actionable, not vague (e.g. "Visit Sanjay Gandhi National Park in Mumbai" not just "Go for a walk").
7. If a natural language prompt is given, extract context from it intelligently.
8. NEVER return anything other than the JSON array. Any extra text will break the app.
`.trim();

// ────────────────────────────────────────────────────────────
//  PROMPT BUILDER
//  Converts structured params → a rich, context-aware user prompt
// ────────────────────────────────────────────────────────────
function buildPrompt(params) {
  const {
    prompt      = "",
    mood        = "",
    time        = "",
    budget      = null,
    location    = "",
    interests   = [],
    locationType = "",
    count        = 5,
  } = params;

  // If a natural-language prompt is provided, use it as the primary context
  if (prompt && prompt.trim().length > 10) {
    return `
User's request: "${prompt.trim()}"

Additional context (use if not already covered in the request):
${mood        ? `- Mood: ${mood}`                              : ""}
${time        ? `- Available time: ${time}`                    : ""}
${budget      ? `- Max budget: ₹${budget}`                     : ""}
${location    ? `- Location: ${location}`                      : ""}
${locationType? `- Preference: ${locationType} activities`     : ""}
${interests.length > 0 ? `- Interests: ${interests.join(", ")}` : ""}

Suggest ${count} activities. Remember: return ONLY the JSON array.
    `.trim();
  }

  // Structured prompt from individual form fields
  const lines = ["User context:"];
  if (mood)         lines.push(`- Current mood: ${mood}`);
  if (time)         lines.push(`- Available time: ${time}`);
  if (budget)       lines.push(`- Maximum budget: ₹${budget} INR`);
  if (location)     lines.push(`- Location: ${location}`);
  if (locationType) lines.push(`- Preferred setting: ${locationType}`);
  if (interests.length > 0)
    lines.push(`- Interests: ${interests.join(", ")}`);

  lines.push(`\nSuggest ${count} activities. Return ONLY the JSON array.`);
  return lines.join("\n");
}

// ────────────────────────────────────────────────────────────
//  RESPONSE VALIDATOR
//  Ensures every field is present and has the right type.
//  Sanitises/defaults any missing or invalid fields gracefully.
// ────────────────────────────────────────────────────────────
function validateAndSanitise(raw) {
  if (!Array.isArray(raw)) {
    throw new Error("Gemini returned a non-array response. Expected a JSON array of activities.");
  }

  return raw.map((item, idx) => {
    if (typeof item !== "object" || item === null) {
      throw new Error(`Item at index ${idx} is not an object.`);
    }

    // Required fields
    const title       = String(item.title       || "").trim().slice(0, 120);
    const description = String(item.description || "").trim().slice(0, 1000);

    if (!title)       throw new Error(`Activity at index ${idx} is missing a title.`);
    if (!description) throw new Error(`Activity at index ${idx} is missing a description.`);

    // Category — default to "General" if Gemini hallucinates an invalid value
    const category = VALID_CATEGORIES.includes(item.category)
      ? item.category
      : "General";

    // Location type
    const locationType = VALID_LOCATION_TYPES.includes(item.locationType)
      ? item.locationType
      : "both";

    // Cost fields
    const minCostINR = typeof item.minCostINR === "number" ? Math.max(0, item.minCostINR) : 0;
    const maxCostINR = typeof item.maxCostINR === "number" ? Math.max(0, item.maxCostINR) : 0;

    // Tags — flatten to clean lowercase strings
    const tags = Array.isArray(item.tags)
      ? item.tags
          .map((t) => String(t).toLowerCase().trim().replace(/\s+/g, "-"))
          .filter((t) => t.length > 0)
          .slice(0, 10)
      : [];

    return {
      title,
      description,
      category,
      estimatedTime : String(item.estimatedTime || "").trim() || "Varies",
      estimatedCost : String(item.estimatedCost || "").trim() || "Free",
      minCostINR,
      maxCostINR,
      locationType,
      locationTag   : "Any",           // Set by controller from user's location input
      tags,
      whyItFits     : String(item.whyItFits || "").trim().slice(0, 300),
      isAiGenerated : true,
    };
  });
}

// ────────────────────────────────────────────────────────────
//  MAIN EXPORT: getRecommendations
// ────────────────────────────────────────────────────────────

/**
 * getRecommendations
 * Calls Gemini and returns a validated array of activity objects.
 *
 * @param {Object} params
 *   @param {string}   params.prompt       - Natural language query (optional)
 *   @param {string}   params.mood         - e.g. "bored", "adventurous"
 *   @param {string}   params.time         - e.g. "2 hours"
 *   @param {number}   params.budget       - Max budget in INR
 *   @param {string}   params.location     - City/area name
 *   @param {string[]} params.interests    - e.g. ["music", "outdoor"]
 *   @param {string}   params.locationType - "indoor" | "outdoor" | "both" | "online"
 *   @param {number}   params.count        - Number of suggestions (default 5)
 *
 * @returns {Promise<Object[]>} Array of validated activity objects
 * @throws  {Error} If Gemini fails or returns invalid JSON
 */
async function getRecommendations(params = {}) {
  const model = getModel();   // throws if API key is missing

  const userPrompt = buildPrompt(params);

  try {
    // Use chat with a system instruction so the model's identity is stable
    const chat = model.startChat({
      history: [
        {
          role: "user",
          parts: [{ text: SYSTEM_INSTRUCTION }],
        },
        {
          role: "model",
          parts: [{ text: "Understood. I am UnBored AI. I will respond with only a valid JSON array of activity objects, following the exact schema you described." }],
        },
      ],
    });

    const result   = await chat.sendMessage(userPrompt);
    const response = result.response;

    // Check for safety blocks
    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason === "SAFETY") {
      throw new Error("The request was blocked by Gemini's safety filters. Please rephrase your query.");
    }

    const rawText = response.text().trim();

    if (!rawText) {
      throw new Error("Gemini returned an empty response. Please try again.");
    }

    // Fail-safe cleanup: remove markdown blocks if Gemini incorrectly wraps the JSON
    const cleanedText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

    // Parse
    let parsed;
    try {
      parsed = JSON.parse(cleanedText);
    } catch (jsonErr) {
      // Last-resort: try to extract a JSON array from the text
      const match = cleanedText.match(/\[[\s\S]*\]/);
      if (!match) {
        console.error("Raw Gemini response (non-JSON):\n", rawText.slice(0, 500));
        throw new Error("The AI returned a format we couldn't understand. Please try again.");
      }
      parsed = JSON.parse(match[0]);
    }

    // Validate and sanitise every activity object
    const activities = validateAndSanitise(parsed);

    // Inject the user's location into each activity
    if (params.location) {
      activities.forEach((a) => { a.locationTag = params.location; });
    }

    return activities;

  } catch (err) {
    // Re-throw with context so the controller can show a user-friendly message
    if (err.message.includes("API_KEY") || err.message.includes("PERMISSION_DENIED")) {
      throw new Error("Invalid Gemini API key. Please check your .env file.");
    }
    if (err.message.includes("RESOURCE_EXHAUSTED") || err.message.includes("quota")) {
      throw new Error("Gemini API quota exceeded. Please try again in a few minutes.");
    }
    throw err;
  }
}

// ────────────────────────────────────────────────────────────
//  EXPORT
// ────────────────────────────────────────────────────────────
module.exports = {
  getRecommendations,
  VALID_CATEGORIES,
  VALID_LOCATION_TYPES,
  buildPrompt,          // exported for unit testing
};
