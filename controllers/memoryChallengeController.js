const { GoogleGenerativeAI } = require("@google/generative-ai");

class MemoryChallengeGenerator {
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }

  // Generate Image Sequence Challenge
  async generateImageSequenceChallenge(difficulty = "medium") {
    const difficultySettings = {
      easy: {
        sequenceLength: 4,
        timeLimit: 30,
        categories: ["animals", "fruits", "simple_objects"],
      },
      medium: {
        sequenceLength: 6,
        timeLimit: 25,
        categories: ["vehicles", "nature", "household_items"],
      },
      hard: {
        sequenceLength: 8,
        timeLimit: 20,
        categories: ["complex_objects", "abstract_shapes", "technology"],
      },
    };

    const settings = difficultySettings[difficulty];

    try {
      // Generate AI prompt for image sequence
      const model = this.genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
      });
      const prompt = `Generate a unique set of ${
        settings.sequenceLength
      } image descriptions for a memory challenge. 
      
      RULES:
      - Select from ${settings.categories.join(", ")} categories
      - Ensure no repeated items
      - Provide distinct, memorable images
      - Format: 
        1. [Image Description]
        2. [Image Description]
        ...
      `;

      const result = await model.generateContent(prompt);

      const imageDescriptions = this.processImageDescriptions(
        result.response.text()
      );

      return {
        sequence: imageDescriptions,
        difficulty,
        timeLimit: settings.timeLimit,
        sequenceLength: settings.sequenceLength,
      };
    } catch (error) {
      console.error("Image Sequence Generation Error:", error);
      return this.getFallbackImageSequence(difficulty);
    }
  }

  // Process and clean image descriptions
  processImageDescriptions(text) {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.match(/^\d+\.\s/))
      .map((line) => line.replace(/^\d+\.\s/, ""))
      .filter((line) => line.length > 5 && line.length < 200)
      .slice(0, 8); // Ensure max 8 items
  }

  // Fallback image sequence for potential AI generation failures
  getFallbackImageSequence(difficulty) {
    const sequences = {
      easy: ["Red Apple", "Blue Car", "Yellow Flower", "Green Frog"],
      medium: [
        "Silver Laptop",
        "Orange Submarine",
        "Purple Bicycle",
        "Brown Telescope",
        "Pink Camera",
        "Gray Headphones",
      ],
      hard: [
        "Translucent Crystal",
        "Holographic Drone",
        "Metallic Geometric Shape",
        "Iridescent Butterfly",
        "Abstract Spiral",
        "Quantum Circuit Board",
        "Fractal Pattern",
        "Luminescent Jellyfish",
      ],
    };

    return {
      sequence: sequences[difficulty],
      difficulty,
      timeLimit: difficulty === "easy" ? 30 : difficulty === "medium" ? 25 : 20,
      sequenceLength: sequences[difficulty].length,
    };
  }
}

// Express Route Handlers
exports.generateMemoryChallenge = async (req, res) => {
  try {
    const { difficulty = "medium" } = req.body;
    const challengeGenerator = new MemoryChallengeGenerator();

    const challenge = await challengeGenerator.generateImageSequenceChallenge(
      difficulty
    );

    res.status(200).json({
      challenge,
      message: "Memory Challenge Generated Successfully",
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to generate memory challenge",
      details: error.message,
    });
  }
};
