const express = require('express');
const {
  getLocations,
  getActiveLocations,
  getTodayOfficePins,
  createLocation,
  updateLocation,
  deleteLocation
} = require('../controllers/locationController');
const { protect, authorize } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(protect);

router.get('/active', getActiveLocations);
router.get('/pins/today', authorize('admin', 'hr'), getTodayOfficePins);
router.get('/', authorize('admin', 'hr'), getLocations);
router.post('/', authorize('admin', 'hr'), createLocation);
router.put('/:id', authorize('admin', 'hr'), updateLocation);
router.delete('/:id', authorize('admin'), deleteLocation);

module.exports = router;

