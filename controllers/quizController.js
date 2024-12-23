const Quiz = require('../models/Quiz');
const Participant = require('../models/Participant');
const AWS = require('aws-sdk');
const pdfParse = require('pdf-parse');
const cheerio = require('cheerio');
const axios = require('axios');
const { google } = require('googleapis');
const youtube = google.youtube('v3');
const TranscriptAPI = require('youtube-transcript-api');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Configure AWS SDK
AWS.config.update({
  region: 'us-east-1', // Replace with your region
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const bedrock = new AWS.Bedrock();
const bedrockRuntime = new AWS.BedrockRuntime();
const modelId = process.env.MODEL_ID;

// Robust Question Extraction Function (unchanged)
const extractQuestions = (responseText) => {
  // Multiple regex patterns to handle different possible formats
  const patterns = [
    // Pattern 1: Markdown-style with double asterisks
    /\*\*Question (\d+):\*\* (.*?)\n\nA\) (.*?)\nB\) (.*?)\nC\) (.*?)\nD\) (.*?)\n\n\*\*Correct Answer: (\w)\*\*/g,

    // Pattern 2: Simple numbered format
    /Question (\d+): (.*?)\nA\) (.*?)\nB\) (.*?)\nC\) (.*?)\nD\) (.*?)\nCorrect Answer: (\w)/g,

    // Pattern 3: More flexible format with potential extra whitespace
    /(?:Q(?:uestion)?\.?\s*)?(\d+)[\.:]\s*(.*?)\s*(?:Choices|Options)?:?\s*\n\s*[Aa]\)\s*(.*?)\s*\n\s*[Bb]\)\s*(.*?)\s*\n\s*[Cc]\)\s*(.*?)\s*\n\s*[Dd]\)\s*(.*?)\s*\n\s*(?:Correct\s*(?:Answer)?:?\s*|\[Answer\]\s*:?\s*)(\w)/g,
  ];

  const questions = [];

  // Try each pattern
  for (const pattern of patterns) {
    let match;
    // Reset lastIndex to ensure we start from the beginning
    pattern.lastIndex = 0;

    while ((match = pattern.exec(responseText)) !== null) {
      // Ensure we have a valid match with 7 capture groups
      if (match.length === 8) {
        const question = {
          question: match[2].trim(),
          options: [
            `A) ${match[3].trim()}`,
            `B) ${match[4].trim()}`,
            `C) ${match[5].trim()}`,
            `D) ${match[6].trim()}`,
          ],
          correctAnswer: match[7].trim().toUpperCase(),
        };

        // Validate the question
        if (
          question.question &&
          question.options.length === 4 &&
          ['A', 'B', 'C', 'D'].includes(question.correctAnswer)
        ) {
          questions.push(question);
        }
      }
    }

    // If we found questions, break the loop
    if (questions.length > 0) {
      break;
    }
  }

  return questions;
};

const QUIZ_GENERATION_PROMPT = (
  content,
  questionCount
) => `The following is the content:

${content.substring(0, 8000)} // Limit content length to avoid token limits

Based on this content, generate a quiz with exactly ${questionCount} multiple-choice questions.

IMPORTANT FORMATTING INSTRUCTIONS:
- Each question must have EXACTLY 4 options: A, B, C, and D
- Clearly mark the correct answer
- Follow this EXACT format:

Question 1: [Question Text]
A) [Option A]
B) [Option B]
C) [Option C]
D) [Option D]
Correct Answer: [A/B/C/D]

Question 2: [Next Question Text]
...and so on.`;

const createModelParams = (content, questionCount) => ({
  modelId,
  contentType: 'application/json',
  accept: 'application/json',
  body: JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: QUIZ_GENERATION_PROMPT(content, questionCount),
      },
    ],
  }),
});

async function generateQuestionsWithGemini(content, questionCount) {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const prompt = QUIZ_GENERATION_PROMPT(content, questionCount);

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();

  return extractQuestions(text);
}

async function scrapeWebsiteContent(url) {
  try {
    // Validate URL format
    new URL(url);

    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    // Remove script tags, style tags, and other non-content elements
    $('script').remove();
    $('style').remove();
    $('nav').remove();
    $('footer').remove();
    $('header').remove();

    // Extract text from main content areas
    const textContent = $('body')
      .find('p, h1, h2, h3, h4, h5, h6, li, td, th, div')
      .map((_, element) => $(element).text().trim())
      .get()
      .filter((text) => text.length > 0)
      .join('\n\n');

    return textContent;
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Invalid URL format');
    }
    throw new Error(`Failed to fetch website content: ${error.message}`);
  }
}

const extractVideoId = (url) => {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname.includes('youtube.com')) {
      return urlObj.searchParams.get('v');
    } else if (urlObj.hostname.includes('youtu.be')) {
      console.log(urlObj.pathname);
      console.log(urlObj.pathname.slice(1));
      return urlObj.pathname.slice(1);
    }
    return null;
  } catch (error) {
    return null;
  }
};

const getVideoDetails = async (videoId) => {
  try {
    const response = await youtube.videos.list({
      key: process.env.YOUTUBE_API_KEY,
      part: ['snippet'],
      id: [videoId],
    });

    console.log(response.data);

    if (response.data.items.length === 0) {
      throw new Error('Video not found');
    }

    return response.data.items[0].snippet;
  } catch (error) {
    console.error('Error fetching video details:', error);
    return null;
  }
};

const getTranscriptFromAPI = async (videoId) => {
  try {
    const isValid = await TranscriptAPI.validateID(videoId);
    if (!isValid) {
      console.error('Invalid video ID');
      return null;
    }
    const transcript = await TranscriptAPI.getTranscript(videoId);
    console.log(transcript);
    return transcript.map((item) => item.text).join(' ');
  } catch (error) {
    console.error('Error fetching transcript:', error);
    return null;
  }
};

const getVideoSummary = async (videoId) => {
  try {
    const options = {
      method: 'POST',
      url: 'https://youtube-summarizer1.p.rapidapi.com/api/summarize/youtube',
      headers: {
        'Content-Type': 'application/json',
        'x-rapidapi-key': `${process.env.RAPID_API_KEY}`,
        'x-rapidapi-host': 'youtube-summarizer1.p.rapidapi.com',
      },
      data: {
        url: `https://www.youtube.com/watch?v=${videoId}`,
        additionalInfo: 'give brief',
      },
    };

    const response = await axios.request(options);
    console.log(response.data);

    return response.data.summary;
  } catch (error) {
    console.error('Error getting video summary:', error);
    return null;
  }
};

const getAlternativeSummary = async (videoId) => {
  try {
    const options = {
      method: 'GET',
      url: 'https://youtube-video-summarizer-with-ai.p.rapidapi.com/api/v1/record/getRecordDetails',
      params: {
        recordId: `${videoId}`,
        locale: 'en',
      },
      headers: {
        'x-rapidapi-key': `${process.env.RAPID_API_KEY}`,
        'x-rapidapi-host': 'youtube-video-summarizer-with-ai.p.rapidapi.com',
        uniqueid: '9db871a38b62a74e396e7542d43a7b32',
      },
    };

    const response = await axios.request(options);
    return response.data.summary;
  } catch (error) {
    console.error('Error getting alternative summary:', error);
    return null;
  }
};

exports.createQuizByPrompt = async (req, res) => {
  const {
    creatorName,
    creatorWallet,
    prompt,
    numParticipants,
    questionCount,
    rewardPerScore,
    isPublic,
    totalCost,
  } = req.body;

  try {
    const params = createModelParams(prompt, questionCount);
    let questions;
    try {
      const response = await bedrockRuntime.invokeModel(params).promise();
      const result = JSON.parse(new TextDecoder().decode(response.body));
      questions = extractQuestions(result.content[0].text);
    } catch (err) {
      if (err.statusCode === 429) {
        console.log('AWS Bedrock rate limited, falling back to Gemini API');
        enhancedContent = prompt;
        questions = await generateQuestionsWithGemini(
          enhancedContent,  
          questionCount
        );
      } else {
        throw err;
      }
    }

    if (!questions || questions.length === 0) {
      return res.status(400).json({
        error: 'Failed to generate valid questions from the video content',
      });
    }

    const quizId = Math.random().toString(36).substring(2, 7);

    const quiz = new Quiz({
      quizId,
      creatorName,
      creatorWallet,
      questions,
      numParticipants,
      totalCost,
      questionCount,
      rewardPerScore,
      isPublic,
    });

    await quiz.save();
    res.status(201).json(quiz);
  } catch (err) {
    console.log(err);
    res.status(400).json({ error: err.message });
  }
};

exports.createQuizByPdf = async (req, res) => {
  const {
    creatorName,
    creatorWallet,
    numParticipants,
    questionCount,
    rewardPerScore,
    isPublic,
    totalCost,
  } = req.body;
  const pdfFile = req.file;

  if (!pdfFile) {
    return res.status(400).json({ error: 'No PDF file uploaded.' });
  }

  try {
    const pdfData = await pdfParse(pdfFile.buffer);
    const params = createModelParams(pdfData.text, questionCount);

    let questions;
    try {
      const response = await bedrockRuntime.invokeModel(params).promise();
      const result = JSON.parse(new TextDecoder().decode(response.body));
      questions = extractQuestions(result.content[0].text);
    } catch (err) {
      if (err.statusCode === 429) {
        console.log('AWS Bedrock rate limited, falling back to Gemini API');
        enhancedContent = pdfData.text;
        questions = await generateQuestionsWithGemini(
          enhancedContent,
          questionCount
        );
      } else {
        throw err;
      }
    }

    if (!questions || questions.length === 0) {
      return res.status(400).json({
        error: 'Failed to generate valid questions from the video content',
      });
    }

    const quizId = Math.random().toString(36).substring(2, 7);

    const quiz = new Quiz({
      quizId,
      creatorName,
      creatorWallet,
      questions,
      numParticipants,
      totalCost,
      questionCount,
      rewardPerScore,
      isPublic,
    });

    await quiz.save();
    res.status(201).json(quiz);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};

exports.createQuizByURL = async (req, res) => {
  const {
    creatorName,
    creatorWallet,
    websiteUrl,
    numParticipants,
    questionCount,
    rewardPerScore,
    isPublic = true,
    totalCost,
  } = req.body;

  try {
    let response = await fetch(websiteUrl, {
      method: 'HEAD',
      timeout: 5000,
    });

    const contentType = response.headers.get('content-type');
    const isValidContent = contentType && contentType.includes('text/html');

    if (!response.ok || !isValidContent) {
      return res.status(400).json({
        error: 'URL is not accessible or does not contain valid HTML content',
      });
    }

    const websiteContent = await scrapeWebsiteContent(websiteUrl);

    if (!websiteContent || websiteContent.length < 100) {
      return res.status(400).json({
        error: 'Could not extract sufficient content from the provided URL',
      });
    }

    const params = createModelParams(websiteContent, questionCount);
    let questions;
    try {
      const response = await bedrockRuntime.invokeModel(params).promise();
      const result = JSON.parse(new TextDecoder().decode(response.body));
      questions = extractQuestions(result.content[0].text);
    } catch (err) {
      if (err.statusCode === 429) {
        console.log('AWS Bedrock rate limited, falling back to Gemini API');
        enhancedContent = websiteContent;
        questions = await generateQuestionsWithGemini(
          enhancedContent,
          questionCount
        );
      } else {
        throw err;
      }
    }

    if (!questions || questions.length === 0) {
      return res.status(400).json({
        error: 'Failed to generate valid questions from the video content',
      });
    }

    const quizId = Math.random().toString(36).substring(2, 7);
    const quiz = new Quiz({
      quizId,
      creatorName,
      creatorWallet,
      questions,
      numParticipants,
      totalCost,
      questionCount,
      rewardPerScore,
      isPublic,
    });

    await quiz.save();
    res.status(201).json(quiz);
  } catch (err) {
    console.error('Quiz creation error:', err);
    res.status(400).json({
      error: err.message || 'Failed to create quiz from URL',
    });
  }
};

exports.createQuizByVideo = async (req, res) => {
  const {
    creatorName,
    creatorWallet,
    ytVideoUrl,
    numParticipants,
    questionCount,
    rewardPerScore,
    isPublic = false,
    totalCost,
  } = req.body;

  try {
    const videoId = extractVideoId(ytVideoUrl);
    if (!videoId) {
      return res.status(400).json({
        error: 'Invalid YouTube URL. Please provide a valid YouTube video URL.',
      });
    }

    const videoDetails = await getVideoDetails(videoId);
    if (!videoDetails) {
      return res.status(400).json({
        error:
          'Could not fetch video details. Please check if the video exists.',
      });
    }

    let videoContent = '';
    let contentSource = '';

    const transcript = await getTranscriptFromAPI(videoId);
    if (transcript) {
      videoContent = transcript;
      contentSource = 'transcript';
    } else {
      const summary = await getVideoSummary(videoId);
      if (summary) {
        videoContent = summary;
        contentSource = 'primary_summary';
      } else {
        const altSummary = await getAlternativeSummary(videoId);
        if (altSummary) {
          videoContent = altSummary;
          contentSource = 'alternative_summary';
        } else {
          videoContent = `${videoDetails.title}\n\n${videoDetails.description}`;
          contentSource = 'video_description';
        }
      }
    }

    const enhancedContent = `Content Type: ${contentSource}\n\n${videoContent}`;
    const params = createModelParams(enhancedContent, questionCount);

    let questions;
    try {
      const response = await bedrockRuntime.invokeModel(params).promise();
      const result = JSON.parse(new TextDecoder().decode(response.body));
      questions = extractQuestions(result.content[0].text);
    } catch (err) {
      if (err.statusCode === 429) {
        console.log('AWS Bedrock rate limited, falling back to Gemini API');
        questions = await generateQuestionsWithGemini(
          enhancedContent,
          questionCount
        );
      } else {
        throw err;
      }
    }

    if (!questions || questions.length === 0) {
      return res.status(400).json({
        error: 'Failed to generate valid questions from the video content',
      });
    }

    const quizId = Math.random().toString(36).substring(2, 7);
    const quiz = new Quiz({
      quizId,
      creatorName,
      creatorWallet,
      questions,
      numParticipants,
      totalCost,
      questionCount,
      rewardPerScore,
      isPublic,
    });

    await quiz.save();
    res.json(quiz);
  } catch (err) {
    console.error('Quiz creation error:', err);
    res.status(400).json({
      error: err.message || 'Failed to create quiz from video',
    });
  }
};

exports.updateQuiz = async (req, res) => {
  const data = req.body;

  const { quizId } = req.params;

  try {
    const quiz = await Quiz.findOne({ quizId });

    if (!quiz) return res.status(404).json({ message: 'Quiz not found' });

    Object.keys(data).forEach((key) => {
      quiz[key] = data[key];
    });

    await quiz.save();
    res.status(200).json(quiz);
  } catch (err) {
    console.log(err);
    res.status(400).json({ error: err.message });
  }
};

exports.getQuiz = async (req, res) => {
  const { quizId } = req.params;
  const { walletAddress } = req.body;

  try {
    const quiz = await Quiz.findOne({ quizId });
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    if (!quiz.isPublic) {
      return res.status(403).json({ error: 'This quiz is private.' });
    }

    const existingParticipant = await Participant.findOne({
      quizId,
      walletAddress,
    });
    if (existingParticipant) {
      return res
        .status(403)
        .json({ error: 'You have already participated in this quiz.' });
    }

    const participantCount = await Participant.countDocuments({ quizId });
    if (participantCount >= quiz.numParticipants) {
      return res.status(403).json({
        error: 'The number of participants for this quiz has been reached.',
      });
    }

    res.status(200).json(quiz);
  } catch (err) {
    console.log(err);
    res.status(400).json({ error: err.message });
  }
};

exports.joinQuiz = async (req, res) => {
  const { quizId } = req.params;
  const { walletAddress, participantName } = req.body;

  try {
    const quiz = await Quiz.findOne({ quizId });
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    if (quiz.isPublic === false) {
      return res.status(403).json({ error: 'This quiz is private.' });
    }

    const existingParticipant = await Participant.findOne({
      quizId,
      walletAddress,
    });
    if (existingParticipant) {
      return res
        .status(403)
        .json({ error: 'You have already participated in this quiz.' });
    }

    const participantCount = await Participant.countDocuments({ quizId });
    if (participantCount >= quiz.numParticipants) {
      return res.status(403).json({
        error: 'The number of participants for this quiz has been reached.',
      });
    }

    const participant = new Participant({
      quizId,
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
  const { quizId } = req.params;

  try {
    const quiz = await Quiz.findOne({ quizId });
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    const participants = await Participant.find({ quizId });

    res.status(200).json({ quiz, participants });
  } catch (err) {
    console.log(err);
    res.status(400).json({ error: err.message });
  }
};

exports.submitQuiz = async (req, res) => {
  const { quizId, walletAddress, answers } = req.body;

  try {
    // 1. Find quiz and validate
    const quiz = await Quiz.findOne({ quizId });
    if (!quiz) {
      return res.status(404).json({ error: 'Quiz not found' });
    }

    // 2. Find participant and validate
    const participant = await Participant.findOne({ quizId, walletAddress });
    if (!participant) {
      return res.status(403).json({ error: 'You have not joined this quiz.' });
    }

    // 3. Calculate score
    const indexToLetter = ['A', 'B', 'C', 'D'];
    let score = 0;

    quiz.questions.forEach((question) => {
      const userAnswerIndex = answers[question._id];
      if (userAnswerIndex !== 'no_answer') {
        const userAnswerLetter = indexToLetter[userAnswerIndex];
        if (userAnswerLetter === question.correctAnswer) {
          score++;
        }
      }
    });

    // 4. Update participant score
    participant.score = score;
    await participant.save();

    res.status(200).json(participant);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
};

exports.updateQuizNftTokenId = async (req, res) => {
  const { quizId, walletAddress, nftTokenId } = req.body;

  try {
    // 1. Find and validate participant
    const participant = await Participant.findOne({ quizId, walletAddress });
    if (!participant) {
      return res.status(404).json({ error: 'Participant not found' });
    }

    // 2. Update NFT token ID
    participant.nftTokenId = nftTokenId;
    await participant.save();

    res.status(200).json(participant);
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: error.message });
  }
};