const express = require('express');
const router = express.Router();
const { getSigningPage, signDocument, hrSignDocument, getPendingHrDocuments } = require('../controllers/esignController');
const { protect, authorize } = require('../middlewares/authMiddleware');

router.get('/sign/:token', getSigningPage);
router.post('/sign/:token', signDocument);
router.get('/pending', protect, authorize('admin', 'hr'), getPendingHrDocuments);
router.post('/hr-sign/:id', protect, authorize('admin', 'hr'), hrSignDocument);

module.exports = router;
