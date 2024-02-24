let router = require("express").Router();
let authRouter = require("./auth.router");
let renderRouter = require("./render.router");
let documentRouter = require("./document.router");
let userRouter = require("./user.router");
let siteRouter = require("./sites.router");

router.use("/", renderRouter);
router.use("/auth", authRouter);
router.use("/docs", documentRouter);
router.use("/users", userRouter);
router.use("/sites", siteRouter);

router.use((req, res,) => {
    res.render('404.ejs');
});

module.exports = router;
