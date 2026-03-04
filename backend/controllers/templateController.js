const asyncHandler = require('../middlewares/asyncHandler');
const DocumentTemplate = require('../models/DocumentTemplate');
const fs = require('fs');
const path = require('path');

// @desc    Get template by type
// @route   GET /api/templates/:type
// @access  Private/Admin
exports.getTemplate = asyncHandler(async (req, res) => {
  const { type } = req.params;
  
  let template = await DocumentTemplate.findOne({ type });

  // If not in DB, fallback to file
  if (!template) {
    let content = '';
    let filePath = '';
    
    if (type === 'joining_agreement') {
      filePath = path.join(__dirname, '../templates/joining_agreement_content.txt');
    } else if (type === 'joining_letter') {
      filePath = path.join(__dirname, '../templates/joining_letter_content.txt');
    }

    if (filePath && fs.existsSync(filePath)) {
      content = fs.readFileSync(filePath, 'utf-8');
    }

    // Return file content but don't save to DB yet unless user updates
    return res.status(200).json({ success: true, data: { type, content } });
  }

  res.status(200).json({ success: true, data: template });
});

// @desc    Update template
// @route   PUT /api/templates/:type
// @access  Private/Admin
exports.updateTemplate = asyncHandler(async (req, res) => {
  const { type } = req.params;
  const { content } = req.body;

  let template = await DocumentTemplate.findOne({ type });

  if (template) {
    template.content = content;
    template.lastUpdated = Date.now();
    template.updatedBy = req.user.id;
    await template.save();
  } else {
    template = await DocumentTemplate.create({
      type,
      content,
      updatedBy: req.user.id
    });
  }

  res.status(200).json({ success: true, data: template });
});
