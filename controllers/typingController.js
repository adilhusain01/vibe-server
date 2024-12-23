const { GoogleGenerativeAI } = require("@google/generative-ai");

class TypingWordGenerator {
  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }

  getWordGenerationPrompt(difficulty = "medium", category = "common") {
    const difficultyCriteria = {
      easy: "simple, frequently used words with 3-6 characters",
      medium: "moderately complex words with 5-8 characters",
      hard: "advanced, less common words with 7-12 characters",
    };

    const categoryCriteria = {
      common: "everyday language words",
      technical: "technology and science-related terminology",
      academic: "scholarly and intellectual vocabulary",
      random: "a diverse mix of words from various domains",
    };

    return `Generate 100 unique ${difficultyCriteria[difficulty]} from ${categoryCriteria[category]} domain.

STRICT OUTPUT FORMAT (CRITICAL):
word1
word2
word3
...word100

RULES:
- No repeated words
- No proper nouns
- No hyphenated words
- No numbers or special characters
- Ensure clear spelling
- Prefer standard English words`;
  }

  async generateWords(difficulty = "medium", category = "common") {
    try {
      const model = this.genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
      });

      const prompt = this.getWordGenerationPrompt(difficulty, category);
      const result = await model.generateContent(prompt);
      const wordText = result.response.text();

      const cleanedWords = this.processWords(wordText);

      return cleanedWords;
    } catch (error) {
      console.error("Word Generation Error:", error);
      return this.getFallbackWords(difficulty);
    }
  }

  processWords(wordText) {
    return wordText
      .split("\n")
      .map((word) => word.trim().toLowerCase())
      .filter(
        (word) =>
          word && word.length > 2 && word.length < 15 && /^[a-z]+$/.test(word)
      )
      .slice(0, 100);
  }

  getFallbackWords(difficulty) {
    const wordSets = {
      easy: [
        "cat",
        "dog",
        "run",
        "sun",
        "car",
        "book",
        "tree",
        "fish",
        "bird",
        "ball",
        "talk",
        "walk",
        "play",
        "home",
        "love",
      ],
      medium: [
        "happy",
        "smile",
        "quick",
        "brave",
        "light",
        "dance",
        "music",
        "dream",
        "ocean",
        "river",
        "story",
        "magic",
        "power",
        "world",
        "peace",
      ],
      hard: [
        "magnificent",
        "adventure",
        "challenge",
        "brilliant",
        "elegant",
        "fantastic",
        "wonderful",
        "incredible",
        "mysterious",
        "fantastic",
      ],
    };

    return wordSets[difficulty].slice(0, 100);
  }
}

// Express Route Handler
exports.generateTypingWords = async (req, res) => {
  try {
    const { difficulty = "medium", category = "common" } = req.body;

    const wordGenerator = new TypingWordGenerator();
    const words = await wordGenerator.generateWords(difficulty, category);

    res.status(200).json({
      words,
      count: words.length,
      difficulty,
      category,
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to generate typing words",
      details: error.message,
    });
  }
};
