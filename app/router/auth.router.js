let router = require("express").Router();
const authController = require("../controllers/auth.controller");

router.post("/login", authController.login);
router.get("/logout", authController.logout);
router.post("/reset-otp", authController.sendResetOTP);

module.exports = router;