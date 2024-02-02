let router = require("express").Router();
let documentController = require("../controllers/document.controller");

router.get("/generate-document-number", documentController.generateDocumentNumber);
router.get("/get-document-reference", documentController.getDocumentReference);
router.post("/save-draft", documentController.saveDraft);

module.exports = router;