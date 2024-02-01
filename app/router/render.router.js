let router = require("express").Router();
let renderController = require("../controllers/render.controller");

router.get("/", renderController.renderDashboard);

module.exports = router;