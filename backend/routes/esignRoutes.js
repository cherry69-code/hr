const express = require('express');
const router = express.Router();
const { getSigningPage, getSigningPdf, signDocument, hrSignDocument, getPendingHrDocuments, generateDocument, sendDocument } = require('../controllers/esignController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.get('/sign/:token', getSigningPage);
router.get('/pdf/:token', getSigningPdf);
router.post('/sign/:token', signDocument);
router.get('/pending', protect, authorize('admin', 'hr'), getPendingHrDocuments);
router.post('/hr-sign/:id', protect, authorize('admin', 'hr'), hrSignDocument);
router.post('/hr/generate', protect, authorize('admin', 'hr'), generateDocument);
router.post('/hr/send', protect, authorize('admin', 'hr'), sendDocument);

module.exports = router;
