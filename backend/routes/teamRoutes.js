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
  .post(authorize('admin', 'hr'), createTeam);

router.route('/:id')
  .get(authorize('admin', 'hr', 'manager'), getTeam)
  .put(authorize('admin', 'hr'), updateTeam)
  .delete(authorize('admin', 'hr'), deleteTeam);

module.exports = router;
