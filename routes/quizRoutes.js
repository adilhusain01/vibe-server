const express = require('express');
const multer = require('multer');
const router = express.Router();
const {
  getQuiz,
  createQuizByPrompt,
  createQuizByURL,
  createQuizByPdf,
  createQuizByVideo,
  joinQuiz,
  submitQuiz,
  getLeaderBoards,
  updateQuiz,
  updateQuizNftTokenId
} = require('../controllers/quizController');

const storage = multer.memoryStorage();
const upload = multer({ storage });

router.get('/leaderboards/:quizId', getLeaderBoards);
router.post('/verify/:quizId', getQuiz);
router.post('/create/prompt', createQuizByPrompt);
router.post('/create/url', createQuizByURL);
router.post('/create/video', createQuizByVideo);
router.post('/create/pdf', upload.single('pdf'), createQuizByPdf);
router.post('/join/:quizId', joinQuiz);
router.post('/submit', submitQuiz);
router.put('/update/:quizId', updateQuiz);
router.put('/update-nft-token-id', updateQuizNftTokenId); 

module.exports = router;
