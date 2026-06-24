const Location = require('../models/Location');
const asyncHandler = require('../middlewares/asyncHandler');
const { getDailyOfficePin, getBusinessDateKey } = require('../utils/officePin');

// @desc    Get all locations (active + inactive)
// @route   GET /api/locations
// @access  Private
exports.getLocations = asyncHandler(async (req, res) => {
  const locations = await Location.find().sort({ createdAt: -1 }).lean();
  res.status(200).json({ success: true, count: locations.length, data: locations });
});

// @desc    Get active locations (for employees to view)
// @route   GET /api/locations/active
// @access  Private
exports.getActiveLocations = asyncHandler(async (req, res) => {
  const locations = await Location.find({ active: true }).sort({ createdAt: -1 }).lean();
  res.status(200).json({ success: true, count: locations.length, data: locations });
});

// @desc    Get today's office PINs for all active locations (display at office reception)
// @route   GET /api/locations/pins/today
// @access  Private/Admin/HR
exports.getTodayOfficePins = asyncHandler(async (req, res) => {
  const now = new Date();
  const locations = await Location.find({ active: true }).sort({ name: 1 }).lean();
  const businessDate = getBusinessDateKey(now);
  const data = locations.map((loc) => ({
    locationId: loc._id,
    name: loc.name,
    businessDate,
    officePin: getDailyOfficePin(loc._id, now)
  }));
  res.status(200).json({ success: true, businessDate, data });
});

// @desc    Create location
// @route   POST /api/locations
// @access  Private/Admin/HR
exports.createLocation = asyncHandler(async (req, res) => {
  const location = await Location.create(req.body);
  res.status(201).json({ success: true, data: location });
});

// @desc    Update location
// @route   PUT /api/locations/:id
// @access  Private/Admin/HR
exports.updateLocation = asyncHandler(async (req, res) => {
  const location = await Location.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  }).lean();

  if (!location) {
    return res.status(404).json({ success: false, error: 'Location not found' });
  }

  res.status(200).json({ success: true, data: location });
});

// @desc    Delete location
// @route   DELETE /api/locations/:id
// @access  Private/Admin
exports.deleteLocation = asyncHandler(async (req, res) => {
  const location = await Location.findByIdAndDelete(req.params.id);

  if (!location) {
    return res.status(404).json({ success: false, error: 'Location not found' });
  }

  res.status(200).json({ success: true, data: {} });
});

