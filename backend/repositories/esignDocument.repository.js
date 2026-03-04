const EsignDocument = require('../models/EsignDocument');

exports.create = (data) => EsignDocument.create(data);

exports.findById = (id) => EsignDocument.findById(id);

exports.findByIdLean = (id) => EsignDocument.findById(id).lean();

exports.findByTokenHash = (tokenHash) => EsignDocument.findOne({ tokenHash }).lean();

exports.updateById = (id, update) => EsignDocument.findByIdAndUpdate(id, update, { new: true }).lean();

exports.listPendingForHr = () =>
  EsignDocument.find({
    status: { $in: ['sent', 'employee_signed'] }
  })
    .populate('employeeId', 'fullName email employeeId designation')
    .sort({ updatedAt: -1 })
    .lean();

