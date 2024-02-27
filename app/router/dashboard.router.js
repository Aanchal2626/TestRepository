let router = require("express").Router();
const dashboardController = require("../controllers/dashboard.controller");

router.post("/site-stats", dashboardController.getSiteStats);

module.exports = router;