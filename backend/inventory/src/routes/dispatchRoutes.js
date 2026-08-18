const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');
const { updateDispatchStatus, getPendingDispatches, getDispatchHistory, updateDispatchKitId } = require('../controllers/dispatchController');

router.use(protect);
router.use(authorize('Dispatch', 'Admin'));

router.get('/pending', getPendingDispatches);
router.get('/history', getDispatchHistory);
router.put('/:id/kitId', updateDispatchKitId);
router.put('/:id/status', updateDispatchStatus);

module.exports = router;
