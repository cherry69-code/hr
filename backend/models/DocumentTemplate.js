const mongoose = require('mongoose');

const DocumentTemplateSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['offer_letter', 'joining_agreement', 'confidentiality_agreement'],
    required: true,
    unique: true
  },
  content: {
    type: String,
    required: true
  },
  placeholders: {
    type: [String],
    default: []
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
});

module.exports = mongoose.model('DocumentTemplate', DocumentTemplateSchema);
