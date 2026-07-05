"use strict";

const express  = require("express");
const multer   = require("multer");
const router   = express.Router();

const authController = require("../controllers/authController");
const { ensureAuthenticated, ensureGuest } = require("../middleware/ensureAuthenticated");

router.get("/", (req, res) => {
  res.render("home", { title: "UnBored · Stop Scrolling. Start Living." });
});

function storeReturnTo(req, res, next) {
  if (req.session && req.session.returnTo) {
    res.locals.returnTo = req.session.returnTo;
  }
  next();
}

let profileUpload;
try {
  const { profileStorage } = require("../config/cloudinary-config");
  profileUpload = multer({
    storage: profileStorage,
    limits : { fileSize: 5 * 1024 * 1024 },  // 5 MB max
    fileFilter(_req, file, cb) {
      const allowed = ["image/jpeg", "image/png", "image/webp"];
      if (allowed.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error("Only JPEG, PNG, and WebP images are allowed."), false);
      }
    },
  }).single("profilePicture");
} catch (e) {
  console.warn("⚠️  Cloudinary not configured — profile picture upload disabled.");
  profileUpload = multer({ storage: multer.memoryStorage() }).single("profilePicture");
}

router.get("/login", ensureGuest, authController.getLogin);

router.post("/login", ensureGuest, authController.postLogin);


router.get("/signup", ensureGuest, authController.getRegister);

router.post(
  "/signup",
  ensureGuest,
  (req, res, next) => {
    profileUpload(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        req.flash("error", `Upload error: ${err.message}`);
        return res.redirect("/signup");
      }
      if (err) {
        req.flash("error", err.message);
        return res.redirect("/signup");
      }
      next();
    });
  },
  authController.postRegister
);

router.get("/logout", authController.logout);

router.get("/profile", ensureAuthenticated, authController.getProfile);

router.put(
  "/profile",
  ensureAuthenticated,
  (req, res, next) => {
    profileUpload(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        req.flash("error", `Upload error: ${err.message}`);
        return res.redirect("/profile");
      }
      if (err) {
        req.flash("error", err.message);
        return res.redirect("/profile");
      }
      next();
    });
  },
  authController.updateProfile
);

router.get(
  "/saved",
  ensureAuthenticated,
  require("../controllers/dashboardController").getSaved
);

module.exports = router;
