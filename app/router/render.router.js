let router = require("express").Router();
let renderController = require("../controllers/render.controller");
let authMiddleware = require("../middlewares/auth.middleware");

router.get("/", authMiddleware.checkLoginStatus, renderController.renderDashboard);
router.get("/documents", authMiddleware.checkLoginStatus, renderController.renderDocuments);
router.get("/documents/create-document", authMiddleware.checkLoginStatus, renderController.createDocument);
router.get("/documents/:id", authMiddleware.checkLoginStatus, renderController.renderSingleDocument);

module.exports = router;