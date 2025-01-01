const mongoose = require("mongoose");

const factCheckSchema = new mongoose.Schema({
  sId: { type: Number },
  gameId: { type: Number },
  factCheckId: { type: String, required: true, unique: true },
  creatorName: { type: String, required: true },
  creatorWallet: { type: String, required: true },
  facts: [
    {
      statement: String,
      isTrue: Boolean,
    },
  ],
  numParticipants: { type: Number, required: true },
  totalCost: { type: Number, required: true },
  factsCount: { type: Number, required: true },
  rewardPerScore: { type: Number, required: true },
  isPublic: { type: Boolean, default: false },
  isFinished: { type: Boolean, default: false },
});

module.exports = mongoose.model("FactCheck", factCheckSchema);
