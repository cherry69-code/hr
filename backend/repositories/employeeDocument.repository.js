const EmployeeDocument = require('../models/EmployeeDocument');

exports.create = (data) => EmployeeDocument.create(data);

exports.listByEmployeeId = (employeeId) =>
  EmployeeDocument.find({ employeeId }).sort({ createdAt: -1 }).lean();

