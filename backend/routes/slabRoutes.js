const express = require('express');
const { getSlabs, createSlab, updateSlab, deleteSlab } = require('../controllers/slabController');
const { protect, authorize } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(protect);
router.use(authorize('admin', 'hr'));

router.route('/')
  .get(getSlabs)
  .post(createSlab);

router.route('/:id')
  .put(updateSlab)
  .delete(deleteSlab);

module.exports = router;
