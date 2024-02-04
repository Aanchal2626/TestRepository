let router = require("express").Router();
const userController = require("../controllers/user.controller");

router.post("/save-user", userController.saveUser);

module.exports = router;