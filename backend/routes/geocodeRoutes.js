const express = require('express');
const { geocode } = require('../controllers/geocodeController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(protect);

router.get('/', geocode);

module.exports = router;

