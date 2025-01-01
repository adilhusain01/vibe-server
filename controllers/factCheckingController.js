const { GoogleGenerativeAI } = require("@google/generative-ai");
const FactCheck = require("../models/FactCheck");
const ParticipantFacts = require("../models/ParticipantFacts");

class FactGenerator {
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }

  async generateFacts(
    topic,
    difficulty = "medium",
    creatorName,
    creatorWallet,
    numParticipants,
    totalCost,
    rewardPerScore,
    factsCount,
    isPublic
  ) {
    const difficultySettings = {
      easy: {
        complexity: "basic",
        timeLimit: 30,
      },
      medium: {
        complexity: "intermediate",
        timeLimit: 25,
      },
      hard: {
        complexity: "advanced",
        timeLimit: 20,
      },
    };

    const settings = difficultySettings[difficulty];

    try {
      const model = this.genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
      });

      const prompt = `Generate ${factsCount} ${settings.complexity} difficulty true/false statements about ${topic}.
    
    RULES:
    - Mix of true and false statements
    - Each statement should be clear and concise
    - Avoid obvious true/false indicators
    - Include interesting but lesser-known facts
    - For false statements, make subtle but clear modifications to true facts
    
    Format each fact as a JSON object with:
    {
      "statement": "[fact statement]",
      "isTrue": boolean,
    }
    
    Return as a JSON array of these objects.`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      const cleanedResponseText = responseText
        .replace(/```json|```/g, "")
        .trim();

      const facts = JSON.parse(cleanedResponseText);

      const factCheckId = Math.random().toString(36).substring(2, 7);

      const factCheck = new FactCheck({
        creatorName,
        creatorWallet,
        facts,
        numParticipants,
        totalCost,
        rewardPerScore,
        factsCount,
        isPublic,
        factCheckId,
      });

      await factCheck.save();
      return factCheck;
    } catch (error) {
      console.error("Fact Generation Error:", error);
      return this.getFallbackFacts(topic, difficulty);
    }
  }

  getFallbackFacts(topic, difficulty) {
    const fallbackFacts = {
      items: [
        {
          statement: `This is a sample ${topic} fact 1`,
          isTrue: true,
          explanation: "This is a fallback fact",
        },
        {
          statement: `This is a sample ${topic} fact 2`,
          isTrue: false,
          explanation: "This is another fallback fact",
        },
        // Add more fallback facts as needed
      ],
      difficulty,
      topic,
      timeLimit: 30,
    };

    return fallbackFacts;
  }
}

// Express Route Handler
exports.generateFactChallenge = async (req, res) => {
  try {
    const {
      topic,
      difficulty = "medium",
      creatorName,
      creatorWallet,
      numParticipants,
      totalCost,
      rewardPerScore,
      factsCount,
      isPublic,
    } = req.body;
    const factGenerator = new FactGenerator();

    const facts = await factGenerator.generateFacts(
      topic,
      difficulty,
      creatorName,
      creatorWallet,
      numParticipants,
      totalCost,
      rewardPerScore,
      factsCount,
      isPublic
    );

    res.json(facts);
  } catch (error) {
    res.status(500).json({
      error: "Failed to generate facts",
      details: error.message,
    });
  }
};

exports.updateFactCheck = async (req, res) => {
  const data = req.body;
  const { factCheckId } = req.params;

  try {
    const factCheck = await FactCheck.findOne({ factCheckId });

    if (!factCheck)
      return res.status(404).json({ message: "Fact Check not found" });

    Object.keys(data).forEach((key) => {
      if (key === "gameId" && typeof data[key] === "object" && data[key].hex) {
        factCheck[key] = parseInt(data[key].hex, 16);
      } else {
        factCheck[key] = data[key];
      }
    });

    await factCheck.save();

    const participants = await ParticipantFacts.find({ factCheckId });
    const participantWalletAddress = participants.map((p) => p.walletAddress);
    const participantRewards = participants.map((p) => p.reward);

    console.log({
      fact,
    });

    res.json({
      gameId: factCheck.gameId,
      participants: participantWalletAddress,
      rewards: participantRewards,
    });
  } catch (err) {
    console.log(err);
    res.status(400).json({ error: err.message });
  }
};

exports.getFactCheck = async (req, res) => {
  const { factCheckId } = req.params;
  const { walletAddress } = req.body;

  try {
    const factCheck = await FactCheck.findOne({ factCheckId });
    if (!factCheck)
      return res.status(404).json({ error: "Fact Check not found" });

    if (!factCheck.isPublic) {
      return res.status(403).json({ error: "This fact check is private." });
    }

    const existingParticipant = await ParticipantFacts.findOne({
      factCheckId,
      walletAddress,
    });
    if (existingParticipant) {
      return res
        .status(403)
        .json({ error: "You have already participated in this fact check." });
    }

    const participantCount = await ParticipantFacts.countDocuments({
      factCheckId,
    });
    if (participantCount >= factCheck.numParticipants) {
      return res.status(403).json({
        error:
          "The number of participants for this fact check has been reached.",
      });
    }

    res.status(200).json(factCheck);
  } catch (err) {
    console.log(err);
    res.status(400).json({ error: err.message });
  }
};

exports.joinFactCheck = async (req, res) => {
  const { factCheckId } = req.params;
  const { walletAddress, participantName } = req.body;

  try {
    const factCheck = await FactCheck.findOne({ factCheckId });
    if (!factCheck)
      return res.status(404).json({ error: "Fact Check not found" });

    if (factCheck.isPublic === false) {
      return res.status(403).json({ error: "This fact check is private." });
    }

    const existingParticipant = await ParticipantFacts.findOne({
      factCheckId,
      walletAddress,
    });
    if (existingParticipant) {
      return res
        .status(403)
        .json({ error: "You have already participated in this fact check." });
    }

    const participantCount = await ParticipantFacts.countDocuments({
      factCheckId,
    });
    if (participantCount >= factCheck.numParticipants) {
      return res.status(403).json({
        error:
          "The number of participants for this fact check has been reached.",
      });
    }

    const participant = new ParticipantFacts({
      factCheckId,
      participantName,
      walletAddress,
    });
    await participant.save();

    res.status(200).json(participant);
  } catch (err) {
    console.log(err);
    res.status(400).json({ error: err.message });
  }
};

exports.getLeaderBoards = async (req, res) => {
  const { factCheckId } = req.params;

  console.log(factCheckId);

  try {
    const factCheck = await FactCheck.findOne({ factCheckId });
    if (!factCheck)
      return res.status(404).json({ error: "Fact Check not found" });

    const participants = await ParticipantFacts.find({ factCheckId });

    res.status(200).json({ factCheck, participants });
  } catch (err) {
    console.log(err);
    res.status(400).json({ error: err.message });
  }
};

exports.submitFactCheck = async (req, res) => {
  const { factCheckId, walletAddress, answers } = req.body;

  try {
    const factCheck = await FactCheck.findOne({ factCheckId });
    if (!factCheck) {
      return res.status(404).json({ error: "Fact Check not found" });
    }

    const participant = await ParticipantFacts.findOne({
      factCheckId,
      walletAddress,
    });
    if (!participant) {
      return res
        .status(403)
        .json({ error: "You have not joined this fact check." });
    }

    let score = 0;
    // Compare answers using fact IDs
    factCheck.facts.forEach((fact) => {
      const userAnswer = answers[fact._id];
      // Convert string "true"/"false" to boolean for comparison
      const userAnswerBool = userAnswer === "true";
      if (userAnswerBool === fact.isTrue) {
        score++;
      }
    });

    const totalReward = score * factCheck.rewardPerScore;
    participant.score = score;
    participant.reward = totalReward;
    await participant.save();

    res.status(200).json(participant);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
};
