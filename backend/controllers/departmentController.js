const Department = require('../models/Department');
const asyncHandler = require('../middlewares/asyncHandler');

exports.createDepartment = asyncHandler(async (req, res, next) => {
  const department = await Department.create(req.body);
  res.status(201).json({ success: true, data: department });
});

exports.getDepartments = asyncHandler(async (req, res, next) => {
  const departments = await Department.find().lean();
  res.status(200).json({ success: true, count: departments.length, data: departments });
});

exports.updateDepartment = asyncHandler(async (req, res, next) => {
  const department = await Department.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });
  if (!department) {
    return res.status(404).json({ success: false, error: 'Department not found' });
  }
  res.status(200).json({ success: true, data: department });
});

exports.deleteDepartment = asyncHandler(async (req, res, next) => {
  const department = await Department.findByIdAndDelete(req.params.id);
  if (!department) {
    return res.status(404).json({ success: false, error: 'Department not found' });
  }
  res.status(200).json({ success: true, data: {} });
});
