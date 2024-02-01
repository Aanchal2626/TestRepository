let router = require("express").Router();
let authRouter = require("./auth.router");
let renderRouter = require("./render.router");
let documentRouter = require("./document.router");

router.use("/", renderRouter);
router.use("/auth", authRouter);
router.use("/docs", documentRouter);

module.exports = router;
