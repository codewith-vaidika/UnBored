"use strict";
/**
 * models/User.js
 * ─────────────────────────────────────────────────────────────
 * Mongoose schema for the UnBored user.
 *
 * Relationships:
 *   - savedActivities  → Array of embedded ActivitySnapshot sub-docs
 *                        (we store a snapshot so activity cards always
 *                         render even if the source doc is deleted)
 *   - searchHistory    → Populated via SearchHistory.userId (Step 5)
 * ─────────────────────────────────────────────────────────────
 */
const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

const { Schema } = mongoose;

// ── Embedded sub-schema: a lightweight snapshot of a saved activity ──────────
const ActivitySnapshotSchema = new Schema(
  {
    title        : { type: String, required: true },
    category     : { type: String, default: "General" },
    description  : { type: String, default: "" },
    estimatedTime: { type: String, default: "" },   // e.g. "1–2 hours"
    estimatedCost: { type: String, default: "" },   // e.g. "₹200–₹500"
    locationType : {
      type    : String,
      enum    : ["indoor", "outdoor", "both", "online"],
      default : "both",
    },
    imageUrl     : { type: String, default: "" },   // Cloudinary URL or placeholder
    savedAt      : { type: Date, default: Date.now },
  },
  { _id: true }
);

// ── Preferences sub-schema ───────────────────────────────────────────────────
const PreferencesSchema = new Schema(
  {
    defaultBudget  : { type: Number, default: 500 },      // INR
    defaultLocation: { type: String, default: "" },        // e.g. "Mumbai"
    interests      : {
      type   : [String],
      default: [],
      // e.g. ["gaming", "music", "outdoor", "creative"]
    },
    defaultMood    : {
      type   : String,
      enum   : ["happy", "bored", "stressed", "adventurous", "social", "solo", ""],
      default: "",
    },
  },
  { _id: false }   // embedded, no separate _id needed
);

// ── Main User schema ─────────────────────────────────────────────────────────
const UserSchema = new Schema(
  {
    // ── Identity ──────────────────────────────────────────
    username: {
      type     : String,
      required : [true, "Username is required"],
      unique   : true,
      trim     : true,
      minlength: [3, "Username must be at least 3 characters"],
      maxlength: [30, "Username cannot exceed 30 characters"],
      match    : [/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"],
    },

    email: {
      type     : String,
      required : [true, "Email is required"],
      unique   : true,
      lowercase: true,
      trim     : true,
      match    : [/^\S+@\S+\.\S+$/, "Please enter a valid email address"],
    },

    // ── Auth ───────────────────────────────────────────────
    password: {
      type    : String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
      select  : false,   // never returned in queries by default — call .select("+password") explicitly
    },

    // ── Profile ────────────────────────────────────────────
    profilePicture: {
      url      : { type: String, default: "" },          // Cloudinary secure_url
      publicId : { type: String, default: "" },          // Cloudinary public_id (for deletion)
    },

    bio: {
      type     : String,
      default  : "",
      maxlength: [200, "Bio cannot exceed 200 characters"],
    },

    // ── Personalization ────────────────────────────────────
    preferences: {
      type   : PreferencesSchema,
      default: () => ({}),
    },

    // ── Saved activities (embedded snapshots) ──────────────
    savedActivities: {
      type   : [ActivitySnapshotSchema],
      default: [],
    },

    // ── Account metadata ───────────────────────────────────
    isVerified: { type: Boolean, default: false },
    lastLogin : { type: Date,    default: null  },
  },
  {
    timestamps: true,   // adds createdAt + updatedAt automatically
  }
);

// ────────────────────────────────────────────────────────────
//  VIRTUALS
// ────────────────────────────────────────────────────────────

/**
 * avatarUrl — returns the Cloudinary URL if set,
 * or a DiceBear avatar generated from the username as fallback.
 */
UserSchema.virtual("avatarUrl").get(function () {
  if (this.profilePicture && this.profilePicture.url) {
    return this.profilePicture.url;
  }
  return `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(this.username)}`;
});

/**
 * savedActivityCount — quick count without loading the full array.
 */
UserSchema.virtual("savedActivityCount").get(function () {
  return this.savedActivities.length;
});

// ────────────────────────────────────────────────────────────
//  PRE-SAVE HOOK — hash password before storing
// ────────────────────────────────────────────────────────────
UserSchema.pre("save", async function (next) {
  // Only hash if the password field was modified (or is new)
  if (!this.isModified("password")) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// ────────────────────────────────────────────────────────────
//  INSTANCE METHODS
// ────────────────────────────────────────────────────────────

/**
 * matchPassword — compare a plain-text password against the stored hash.
 * Usage: const isMatch = await user.matchPassword(plainTextPassword)
 */
UserSchema.methods.matchPassword = async function (plainPassword) {
  return bcrypt.compare(plainPassword, this.password);
};

/**
 * hasActivitySaved — check if a title is already in savedActivities.
 * Usage: const saved = user.hasActivitySaved("Morning Hiking")
 */
UserSchema.methods.hasActivitySaved = function (title) {
  return this.savedActivities.some(
    (a) => a.title.toLowerCase() === title.toLowerCase()
  );
};

// ────────────────────────────────────────────────────────────
//  INDEXES (beyond unique on username / email)
// ────────────────────────────────────────────────────────────
UserSchema.index({ "preferences.defaultLocation": 1 });

// ────────────────────────────────────────────────────────────
//  JSON transform — strip sensitive fields when serialised
// ────────────────────────────────────────────────────────────
UserSchema.set("toJSON", {
  virtuals: true,
  transform(doc, ret) {
    delete ret.password;
    delete ret.__v;
    return ret;
  },
});

UserSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("User", UserSchema);
