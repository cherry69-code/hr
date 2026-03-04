const User = require('../models/User');
const Leave = require('../models/Leave');
const asyncHandler = require('../middlewares/asyncHandler');

exports.getStats = asyncHandler(async (req, res, next) => {
  const employeeId = req.query.employeeId;

  if (employeeId) {
    const pendingLeaves = await Leave.countDocuments({ employeeId, status: 'pending' });
    const approvedLeaves = await Leave.countDocuments({ employeeId, status: 'approved' });
    const totalAttendance = 20; // Mock

    return res.status(200).json({
      success: true,
      data: {
        pendingLeaves,
        approvedLeaves,
        totalAttendance
      }
    });
  }

  const totalEmployees = await User.countDocuments({ role: 'employee' });
  const pendingLeaves = await Leave.countDocuments({ status: 'pending' });
  
  res.status(200).json({
    success: true,
    data: {
      totalEmployees,
      pendingLeaves,
      presentToday: Math.floor(totalEmployees * 0.9), 
      absentToday: Math.floor(totalEmployees * 0.1)
    }
  });
});
