const DocumentTemplate = require('../models/DocumentTemplate');

exports.create = (data) => DocumentTemplate.create(data);

exports.findById = (id) => DocumentTemplate.findById(id);

exports.list = (filter = {}) => DocumentTemplate.find(filter).sort({ createdAt: -1 }).lean();

exports.getActive = (companyId, templateType) => DocumentTemplate.findOne({ companyId, templateType, isActive: true }).sort({ version: -1 }).lean();

exports.deactivateAll = (companyId, templateType) => DocumentTemplate.updateMany({ companyId, templateType, isActive: true }, { $set: { isActive: false } });

exports.activateById = (id) => DocumentTemplate.findByIdAndUpdate(id, { $set: { isActive: true } }, { new: true }).lean();

exports.updateById = (id, update) => DocumentTemplate.findByIdAndUpdate(id, { $set: update }, { new: true }).lean();

