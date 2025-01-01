const mongoose = require("mongoose");

const participantFactsSchema = new mongoose.Schema({
  factCheckId: { type: String, required: true },
  participantName: { type: String, required: true },
  walletAddress: { type: String, required: true },
  score: { type: Number, default: null },
  reward: { type: Number, default: null },
  nftTokenId: { type: Number }, // Add this field
});

module.exports = mongoose.model("ParticipantFacts", participantFactsSchema);
