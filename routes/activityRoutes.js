"use strict";

const express  = require("express");
const router   = express.Router();

const activityController = require("../controllers/activityController");
const { ensureAuthenticated } = require("../middleware/ensureAuthenticated");

router.post("/recommend", activityController.getRecommendations);

router.get("/results", activityController.getLastResults);

router.post("/save", ensureAuthenticated, activityController.saveActivity);

router.delete("/:id", ensureAuthenticated, activityController.removeActivity);

module.exports = router;
