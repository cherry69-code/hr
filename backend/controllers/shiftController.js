const Shift = require('../models/Shift');
const asyncHandler = require('../middlewares/asyncHandler');

exports.getShifts = asyncHandler(async (req, res) => {
  const shifts = await Shift.find().sort('name').lean();
  res.status(200).json({ success: true, count: shifts.length, data: shifts });
});

exports.createShift = asyncHandler(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const shiftStart = String(req.body?.shiftStart || '').trim();
  const shiftEnd = String(req.body?.shiftEnd || '').trim();
  const graceMinutes = req.body?.graceMinutes !== undefined ? Number(req.body.graceMinutes) : undefined;

  if (!name || !shiftStart || !shiftEnd) {
    return res.status(400).json({ success: false, error: 'name, shiftStart and shiftEnd are required' });
  }

  const existing = await Shift.findOne({ name }).select('_id').lean();
  if (existing) return res.status(400).json({ success: false, error: 'Shift name already exists' });

  const shift = await Shift.create({
    name,
    shiftStart,
    shiftEnd,
    graceMinutes: Number.isFinite(graceMinutes) ? graceMinutes : undefined
  });

  res.status(201).json({ success: true, data: shift });
});
