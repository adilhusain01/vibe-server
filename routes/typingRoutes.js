const express = require("express");
const router = express.Router();
const { generateTypingWords } = require("../controllers/typingController");

router.post("/words", generateTypingWords);

module.exports = router;
