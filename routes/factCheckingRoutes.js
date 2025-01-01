const express = require("express");
const router = express.Router();
const {
  generateFactChallenge,
  updateFactCheck,
  getFactCheck,
  joinFactCheck,
  getLeaderBoards,
  submitFactCheck,
} = require("../controllers/factCheckingController");

// Route to get leaderboards
router.get("/leaderboards/:factCheckId", getLeaderBoards);
router.post("/verify/:factCheckId", getFactCheck);
router.post("/create/challenge", generateFactChallenge);
router.post("/join/:factCheckId", joinFactCheck);
router.post("/submit", submitFactCheck);
router.put("/update/:factCheckId", updateFactCheck);

module.exports = router;
