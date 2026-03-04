const Team = require('../models/Team');
const User = require('../models/User');
const asyncHandler = require('../middlewares/asyncHandler');

// @desc    Get all teams
// @route   GET /api/teams
// @access  Private/Admin
exports.getTeams = asyncHandler(async (req, res, next) => {
  const teams = await Team.find().populate('pnlHeadId', 'fullName email').lean();
  res.status(200).json({ success: true, count: teams.length, data: teams });
});

// @desc    Get single team
// @route   GET /api/teams/:id
// @access  Private
exports.getTeam = asyncHandler(async (req, res, next) => {
  const team = await Team.findById(req.params.id).populate('pnlHeadId', 'fullName email').lean();
  if (!team) {
    return res.status(404).json({ success: false, error: 'Team not found' });
  }
  res.status(200).json({ success: true, data: team });
});

// @desc    Create team
// @route   POST /api/teams
// @access  Private/Admin
exports.createTeam = asyncHandler(async (req, res, next) => {
  const team = await Team.create(req.body);
  res.status(201).json({ success: true, data: team });
});

// @desc    Update team
// @route   PUT /api/teams/:id
// @access  Private/Admin
exports.updateTeam = asyncHandler(async (req, res, next) => {
  const team = await Team.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });
  if (!team) {
    return res.status(404).json({ success: false, error: 'Team not found' });
  }
  res.status(200).json({ success: true, data: team });
});

// @desc    Delete team
// @route   DELETE /api/teams/:id
// @access  Private/Admin
exports.deleteTeam = asyncHandler(async (req, res, next) => {
  const team = await Team.findByIdAndDelete(req.params.id);
  if (!team) {
    return res.status(404).json({ success: false, error: 'Team not found' });
  }
  res.status(200).json({ success: true, data: {} });
});
