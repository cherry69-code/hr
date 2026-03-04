const express = require('express');
const { generateAndUploadPDF, getDocuments, signAndSendDocument, uploadDocument, sendOfferLetterToCandidate, sendJoiningAgreementToCandidate } = require('../controllers/documentController');
const { protect, authorize } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(protect);

router.post('/upload', authorize('admin', 'hr'), uploadDocument);
router.post('/offer-letter/send', authorize('admin', 'hr'), sendOfferLetterToCandidate);
router.post('/joining-agreement/send', authorize('admin', 'hr'), sendJoiningAgreementToCandidate);
router.post('/generate/:type/:employeeId', authorize('admin', 'hr'), generateAndUploadPDF);
router.post('/sign', signAndSendDocument);
router.get('/:employeeId', getDocuments);

module.exports = router;
