const { GoogleGenerativeAI } = require("@google/generative-ai");

class FactGenerator {
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }

  async generateFacts(topic, difficulty = "medium") {
    const difficultySettings = {
      easy: {
        factCount: 5,
        complexity: "basic",
        timeLimit: 30,
      },
      medium: {
        factCount: 8,
        complexity: "intermediate",
        timeLimit: 25,
      },
      hard: {
        factCount: 10,
        complexity: "advanced",
        timeLimit: 20,
      },
    };

    const settings = difficultySettings[difficulty];

    try {
      const model = this.genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
      });

      const prompt = `Generate ${settings.factCount} ${settings.complexity} difficulty true/false statements about ${topic}.
    
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
      "explanation": "[brief explanation]"
    }
    
    Return as a JSON array of these objects.`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      const cleanedResponseText = responseText
        .replace(/```json|```/g, "")
        .trim();

      const facts = JSON.parse(cleanedResponseText);

      return {
        items: facts,
        difficulty,
        topic,
        timeLimit: settings.timeLimit,
      };
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
    const { topic, difficulty = "medium" } = req.body;
    const factGenerator = new FactGenerator();

    const facts = await factGenerator.generateFacts(topic, difficulty);

    res.status(200).json({
      facts,
      message: "Facts Generated Successfully",
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to generate facts",
      details: error.message,
    });
  }
};
