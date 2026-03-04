const express = require('express');
const { protect } = require('../middlewares/authMiddleware');
const { myDocuments } = require('../controllers/vaultController');

const router = express.Router();

router.use(protect);

router.get('/my', myDocuments);

module.exports = router;

