const asyncHandler = require('../middlewares/asyncHandler');
const employeeDocRepo = require('../repositories/employeeDocument.repository');

exports.myDocuments = asyncHandler(async (req, res) => {
  const docs = await employeeDocRepo.listByEmployeeId(req.user.id);
  res.status(200).json({ success: true, data: docs });
});

