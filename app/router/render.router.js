let router = require("express").Router();
let renderController = require("../controllers/render.controller");
let authMiddleware = require("../middlewares/auth.middleware");


router.get("/", authMiddleware.checkLoginStatus, renderController.renderDashboard);
router.get("/documents", authMiddleware.checkLoginStatus, renderController.renderDocuments);
router.get("/users", authMiddleware.checkLoginStatus, renderController.renderUsers);
router.get("/sites", authMiddleware.checkLoginStatus, renderController.renderSites);
router.get("/documents/create-document", authMiddleware.checkLoginStatus, renderController.renderCreateDocument);
router.get("/documents/import/email", authMiddleware.checkLoginStatus, renderController.renderEmailImport);
router.get("/documents/import/excel", authMiddleware.checkLoginStatus, renderController.renderExcelImport);
router.get("/documents/:id", authMiddleware.checkLoginStatus, renderController.renderSingleDocument);


module.exports = router;