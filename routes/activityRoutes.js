"use strict";

const express  = require("express");
const router   = express.Router();

const activityController = require("../controllers/activityController");
const { ensureAuthenticated } = require("../middleware/ensureAuthenticated");
const { aiLimiter }           = require("../middleware/rateLimiter");

// Rate-limited: max 10 AI searches per IP every 5 minutes
router.post("/recommend", aiLimiter, activityController.getRecommendations);

router.get("/results", activityController.getLastResults);

router.post("/save", ensureAuthenticated, activityController.saveActivity);

router.delete("/:id", ensureAuthenticated, activityController.removeActivity);

module.exports = router;
