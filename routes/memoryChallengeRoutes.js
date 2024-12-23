const express = require("express");
const router = express.Router();
const {
  generateMemoryChallenge,
} = require("../controllers/memoryChallengeController");

router.post("/challenge", generateMemoryChallenge);

module.exports = router;
