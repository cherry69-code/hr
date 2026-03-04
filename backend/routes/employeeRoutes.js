const express = require('express');
const {
  getEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getManagers,
  sendLetter
} = require('../controllers/employeeController');
const { protect, authorize } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(protect);

router.post('/:id/send-letter', authorize('admin', 'hr'), sendLetter);

router.get('/managers', authorize('admin', 'hr', 'manager'), getManagers);

router.route('/')
  .get(authorize('admin', 'hr', 'manager'), getEmployees)
  .post(authorize('admin', 'hr'), createEmployee);

router.route('/:id')
  .get(getEmployee)
  .put(authorize('admin', 'hr'), updateEmployee)
  .delete(authorize('admin'), deleteEmployee);

module.exports = router;
