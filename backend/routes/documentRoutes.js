const express = require('express');
const { generateAndUploadPDF, getDocuments, signAndSendDocument, uploadDocument, sendOfferLetterToCandidate, sendJoiningAgreementToCandidate, getSignedDownloadUrl, downloadDocument } = require('../controllers/documentController');
const { protect, authorize } = require('../middlewares/authMiddleware');

const router = express.Router();

// Public route for signing (token-based)
router.post('/sign-public/:token', signAndSendDocument);
router.get('/download/:id', downloadDocument);

router.use(protect);

router.post('/upload', authorize('admin', 'hr'), uploadDocument);
router.post('/offer-letter/send', authorize('admin', 'hr'), sendOfferLetterToCandidate);
router.post('/joining-agreement/send', authorize('admin', 'hr'), sendJoiningAgreementToCandidate);
router.post('/generate/:type/:employeeId', authorize('admin', 'hr'), generateAndUploadPDF);
router.post('/sign', signAndSendDocument);
router.get('/signed-url/:id', getSignedDownloadUrl);
router.get('/:employeeId', getDocuments);

module.exports = router;
