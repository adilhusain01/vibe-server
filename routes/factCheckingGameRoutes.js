const express = require("express");
const router = express.Router();
const {
  generateFactChallenge,
} = require("../controllers/factCheckingGameController");

// Route to generate fact challenge
router.post("/challenge", generateFactChallenge);

module.exports = router;
