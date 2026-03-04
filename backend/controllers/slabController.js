const Slab = require('../models/Slab');
const asyncHandler = require('../middlewares/asyncHandler');

// @desc    Get all slabs
// @route   GET /api/slabs
// @access  Private/Admin
exports.getSlabs = asyncHandler(async (req, res, next) => {
  const slabs = await Slab.find().sort({ createdAt: -1 });
  res.status(200).json({ success: true, count: slabs.length, data: slabs });
});

// @desc    Create slab
// @route   POST /api/slabs
// @access  Private/Admin
exports.createSlab = asyncHandler(async (req, res, next) => {
  // If we want only one active slab per role, we could deactivate others here
  if (req.body.isActive) {
    await Slab.updateMany({ role: req.body.role }, { isActive: false });
  }
  
  const slab = await Slab.create(req.body);
  res.status(201).json({ success: true, data: slab });
});

// @desc    Update slab
// @route   PUT /api/slabs/:id
// @access  Private/Admin
exports.updateSlab = asyncHandler(async (req, res, next) => {
  if (req.body.isActive) {
    // If enabling this slab, find its role and disable others
    const currentSlab = await Slab.findById(req.params.id);
    if (currentSlab) {
      await Slab.updateMany({ role: currentSlab.role, _id: { $ne: req.params.id } }, { isActive: false });
    }
  }

  const slab = await Slab.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  if (!slab) {
    return res.status(404).json({ success: false, error: 'Slab not found' });
  }

  res.status(200).json({ success: true, data: slab });
});

// @desc    Delete slab
// @route   DELETE /api/slabs/:id
// @access  Private/Admin
exports.deleteSlab = asyncHandler(async (req, res, next) => {
  const slab = await Slab.findByIdAndDelete(req.params.id);
  if (!slab) {
    return res.status(404).json({ success: false, error: 'Slab not found' });
  }
  res.status(200).json({ success: true, data: {} });
});
