const express = require('express');
const { calculateSalary, calculatePayroll, generatePayslip, getPayslips, getPayslipsForMonth } = require('../controllers/payrollController');
const { protect, authorize } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(protect);

router.post('/calculate/:employeeId', authorize('admin', 'hr'), calculateSalary);
router.post('/calculate', calculatePayroll);
router.post('/generate', authorize('admin', 'hr'), generatePayslip);
router.get('/payslips', authorize('admin', 'hr'), getPayslipsForMonth);
router.get('/payslips/:employeeId', getPayslips);

module.exports = router;
