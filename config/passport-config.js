"use strict";
/**
 * config/passport-config.js
 * ─────────────────────────────────────────────────────────────
 * Configures Passport.js Local Strategy for username + password
 * authentication using bcryptjs for password comparison.
 *
 * Called once at startup from app.js:
 *   const configurePassport = require("./config/passport-config");
 *   configurePassport(passport);
 * ─────────────────────────────────────────────────────────────
 */
const LocalStrategy = require("passport-local").Strategy;
const User          = require("../models/User");

module.exports = function configurePassport(passport) {

  // ────────────────────────────────────────────────────────
  //  LOCAL STRATEGY
  //  Triggered by passport.authenticate("local") in authRoutes
  // ────────────────────────────────────────────────────────
  passport.use(
    new LocalStrategy(
      {
        usernameField: "username",  // matches <input name="username">
        passwordField: "password",  // matches <input name="password">
      },
      async (username, password, done) => {
        try {
          // 1. Find the user — must include password (it's select:false by default)
          const user = await User.findOne({
            username: username.trim().toLowerCase(),
          }).select("+password");

          if (!user) {
            return done(null, false, {
              message: "No account found with that username.",
            });
          }

          // 2. Compare submitted password against bcrypt hash
          const isMatch = await user.matchPassword(password);

          if (!isMatch) {
            return done(null, false, {
              message: "Incorrect password. Please try again.",
            });
          }

          // 3. Update lastLogin timestamp (fire-and-forget, non-blocking)
          User.findByIdAndUpdate(user._id, { lastLogin: new Date() }).exec();

          // 4. Success — pass the user object (without password) to serializeUser
          return done(null, user);

        } catch (err) {
          return done(err);
        }
      }
    )
  );

  // ────────────────────────────────────────────────────────
  //  SERIALIZE — what to store in the session cookie
  //  We store only the user's _id to keep the session small
  // ────────────────────────────────────────────────────────
  passport.serializeUser((user, done) => {
    done(null, user._id);
  });

  // ────────────────────────────────────────────────────────
  //  DESERIALIZE — called on every request with a session
  //  Converts the stored _id back into a full user object
  //  attached to req.user
  // ────────────────────────────────────────────────────────
  passport.deserializeUser(async (id, done) => {
    try {
      // Select commonly needed fields; exclude password
      const user = await User.findById(id).select(
        "username email profilePicture bio preferences savedActivities isVerified lastLogin createdAt"
      );

      if (!user) {
        // Session references a deleted account — clear it gracefully
        return done(null, false);
      }

      done(null, user);
    } catch (err) {
      done(err);
    }
  });
};
