"use strict";

const express  = require("express");
const router   = express.Router();

const dashboardController = require("../controllers/dashboardController");
const { ensureAuthenticated } = require("../middleware/ensureAuthenticated");

router.use(ensureAuthenticated);

router.get("/", dashboardController.getDashboard);

module.exports = router;
