const express = require('express');
const { protect, authorize } = require('../middlewares/authMiddleware');
const {
  getTemplate,
  updateTemplate
} = require('../controllers/templateController');

const router = express.Router();

router.use(protect);

router.get('/:type', authorize('admin', 'hr'), getTemplate);
router.put('/:type', authorize('admin'), updateTemplate);

module.exports = router;

