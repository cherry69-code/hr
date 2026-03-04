const express = require('express');
const { 
  createDepartment, 
  getDepartments, 
  updateDepartment, 
  deleteDepartment 
} = require('../controllers/departmentController');
const { protect, authorize } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(protect);

router.route('/')
  .get(getDepartments)
  .post(authorize('admin'), createDepartment);

router.route('/:id')
  .put(authorize('admin'), updateDepartment)
  .delete(authorize('admin'), deleteDepartment);

module.exports = router;
