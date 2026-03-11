const express = require('express');
const { protect } = require('../middlewares/authMiddleware');
const { getMonthlyLeaderboard, getWeeklyLeaderboard, getMyLeaderboardStats } = require('../controllers/leaderboardController');

const router = express.Router();

router.use(protect);

router.get('/monthly', getMonthlyLeaderboard);
router.get('/weekly', getWeeklyLeaderboard);
router.get('/me', getMyLeaderboardStats);

module.exports = router;
