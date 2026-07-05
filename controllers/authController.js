"use strict";

const passport = require("passport");
const User     = require("../models/User");


exports.getLogin = (req, res) => {
  res.render("users/login", {
    title   : "Login · UnBored",
    formData: {},
  });
};

// ────────────────────────────────────────────────────────────
//  POST /login  — Passport.authenticate is applied in authRoutes
//  These two callbacks are used as successRedirect/failureRedirect
//  alternatives when we need custom logic:
// ────────────────────────────────────────────────────────────

/**
 * postLogin — Passport authenticate callback (custom, not redirect-based)
 * Gives us full control over success and failure responses.
 */
exports.postLogin = (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (err) return next(err);

    if (!user) {
      // Authentication failed — re-render form with error + preserved username
      req.flash("error", info?.message || "Login failed. Please try again.");
      return res.redirect("/login");
    }

    // Log the user in (sets req.user + creates session)
    req.logIn(user, (loginErr) => {
      if (loginErr) return next(loginErr);

      req.flash("success", `Welcome back, ${user.username}! 🎉`);

      // Redirect to originally requested URL if stored in session, else dashboard
      const redirectTo = req.session.returnTo || "/dashboard";
      delete req.session.returnTo;
      return res.redirect(redirectTo);
    });
  })(req, res, next);
};

// ────────────────────────────────────────────────────────────
//  GET /signup
// ────────────────────────────────────────────────────────────
exports.getRegister = (req, res) => {
  res.render("users/signup", {
    title   : "Create Account · UnBored",
    formData: {},
  });
};

// ────────────────────────────────────────────────────────────
//  POST /signup
// ────────────────────────────────────────────────────────────
exports.postRegister = async (req, res, next) => {
  try {
    const { username, email, password, confirmPassword } = req.body;

    // ── 1. Server-side validation ────────────────────────
    const errors = [];

    if (!username || username.trim().length < 3) {
      errors.push("Username must be at least 3 characters.");
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      errors.push("Username can only contain letters, numbers, and underscores.");
    }
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      errors.push("Please enter a valid email address.");
    }
    if (!password || password.length < 6) {
      errors.push("Password must be at least 6 characters.");
    }
    if (password !== confirmPassword) {
      errors.push("Passwords do not match.");
    }

    if (errors.length > 0) {
      req.flash("error", errors[0]);
      return res.render("users/signup", {
        title   : "Create Account · UnBored",
        formData: { username, email },  // re-populate form (never password)
      });
    }

    // ── 2. Duplicate check ───────────────────────────────
    const existingUser = await User.findOne({
      $or: [
        { username: username.trim().toLowerCase() },
        { email: email.trim().toLowerCase() },
      ],
    });

    if (existingUser) {
      const field = existingUser.username === username.trim().toLowerCase()
        ? "username"
        : "email";
      req.flash("error", `That ${field} is already taken. Please choose another.`);
      return res.render("users/signup", {
        title   : "Create Account · UnBored",
        formData: { username, email },
      });
    }

    // ── 3. Build user object ─────────────────────────────
    const newUser = new User({
      username: username.trim().toLowerCase(),
      email   : email.trim().toLowerCase(),
      password,               // bcrypt pre-save hook handles hashing
    });

    // ── 4. Handle optional profile picture upload ────────
    if (req.file) {
      // Multer + Cloudinary storage puts the result on req.file
      newUser.profilePicture = {
        url     : req.file.path,          // Cloudinary secure_url
        publicId: req.file.filename,      // Cloudinary public_id
      };
    }

    // ── 5. Save to DB ────────────────────────────────────
    await newUser.save();

    // ── 6. Auto-login after registration ─────────────────
    req.logIn(newUser, (err) => {
      if (err) return next(err);
      req.flash("success", `Welcome to UnBored, ${newUser.username}! Let's find something fun. 🎉`);
      res.redirect("/dashboard");
    });

  } catch (err) {
    // Handle Mongoose validation errors gracefully
    if (err.name === "ValidationError") {
      const firstError = Object.values(err.errors)[0].message;
      req.flash("error", firstError);
      return res.render("users/signup", {
        title   : "Create Account · UnBored",
        formData: { username: req.body.username, email: req.body.email },
      });
    }

    // Duplicate key error from MongoDB (race condition edge case)
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      req.flash("error", `That ${field} is already in use.`);
      return res.render("users/signup", {
        title   : "Create Account · UnBored",
        formData: { username: req.body.username, email: req.body.email },
      });
    }

    next(err);
  }
};

// ────────────────────────────────────────────────────────────
//  GET /logout
// ────────────────────────────────────────────────────────────
exports.logout = (req, res, next) => {
  const username = req.user?.username || "there";

  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy((sessionErr) => {
      if (sessionErr) console.error("Session destroy error:", sessionErr);
      res.clearCookie("connect.sid");
      req.flash("success", `See you later, ${username}! 👋`);
      res.redirect("/");
    });
  });
};

// ────────────────────────────────────────────────────────────
//  GET /profile  (protected — ensureAuthenticated in route)
// ────────────────────────────────────────────────────────────
exports.getProfile = async (req, res, next) => {
  try {
    // Fetch fresh data (req.user may be stale from session)
    const user = await User.findById(req.user._id).select(
      "username email profilePicture bio preferences savedActivities createdAt"
    );

    res.render("users/profile", {
      title: `${user.username}'s Profile · UnBored`,
      user,
    });
  } catch (err) {
    next(err);
  }
};

// ────────────────────────────────────────────────────────────
//  PUT /profile  (protected — update bio + preferences + pic)
// ────────────────────────────────────────────────────────────
exports.updateProfile = async (req, res, next) => {
  try {
    const { bio, defaultBudget, defaultLocation, defaultMood, interests } = req.body;

    // Build update payload
    const updateData = {
      bio: bio?.trim() || "",
      "preferences.defaultBudget"  : Number(defaultBudget) || 500,
      "preferences.defaultLocation": defaultLocation?.trim() || "",
      "preferences.defaultMood"    : defaultMood || "",
      "preferences.interests"      : Array.isArray(interests)
        ? interests
        : interests
          ? interests.split(",").map((i) => i.trim()).filter(Boolean)
          : [],
    };

    // Handle new profile picture upload
    if (req.file) {
      updateData["profilePicture.url"]      = req.file.path;
      updateData["profilePicture.publicId"] = req.file.filename;

      // Optionally delete old Cloudinary image here (Step 5 enhancement)
    }

    await User.findByIdAndUpdate(req.user._id, updateData, { runValidators: true });

    req.flash("success", "Profile updated successfully! ✅");
    res.redirect("/profile");
  } catch (err) {
    if (err.name === "ValidationError") {
      req.flash("error", Object.values(err.errors)[0].message);
      return res.redirect("/profile");
    }
    next(err);
  }
};
