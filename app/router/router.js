let router = require("express").Router();
let authRouter = require("./auth.router");
let renderRouter = require("./render.router");
let documentRouter = require("./document.router");
let userRouter = require("./user.router");

router.use("/", renderRouter);
router.use("/auth", authRouter);
router.use("/docs", documentRouter);
router.use("/users", userRouter);

module.exports = router;
