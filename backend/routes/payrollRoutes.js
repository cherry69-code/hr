const express = require('express');
const {
  calculateSalary,
  calculatePayroll,
  generatePayslip,
  generateAllPayslips,
  getPayslipDownloadUrl,
  getPayslips,
  getPayslipsForMonth
} = require('../controllers/payrollController');
const { protect, authorize } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(protect);

router.post('/calculate/:employeeId', authorize('admin', 'hr'), calculateSalary);
router.post('/calculate', calculatePayroll);
router.post('/generate', authorize('admin', 'hr'), generatePayslip);
router.post('/generate-all', authorize('admin', 'hr'), generateAllPayslips);
router.get('/payslips', authorize('admin', 'hr'), getPayslipsForMonth);
router.get('/payslip/:id/download-url', getPayslipDownloadUrl);
router.get('/payslips/:employeeId', getPayslips);

module.exports = router;
