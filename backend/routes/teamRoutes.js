const express = require('express');
const {
  getTeams,
  getTeam,
  createTeam,
  updateTeam,
  deleteTeam
} = require('../controllers/teamController');
const { protect, authorize } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(protect);

router.route('/')
  .get(authorize('admin', 'hr', 'manager'), getTeams)
  .post(authorize('admin'), createTeam);

router.route('/:id')
  .get(getTeam)
  .put(authorize('admin'), updateTeam)
  .delete(authorize('admin'), deleteTeam);

module.exports = router;
