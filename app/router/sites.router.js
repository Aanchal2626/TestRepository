let router = require("express").Router();
const sitesController = require("../controllers/sites.controller");

router.post("/save-site", sitesController.saveSite);

module.exports = router;