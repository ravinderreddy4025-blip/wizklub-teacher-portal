const express = require('express');
const router = express.Router();
const {
  registerUser,
  authUser,
  authAdmin,
  refreshAdmin,
  logoutAdmin,
} = require('../controllers/authController');
const schoolAuthRoutes = require('../../../../school-portal/backend/src/routes/schoolAuthRoutes');
const {
  bridgeTeacherSchools,
  bridgeTeacherSelectSchool,
} = require('../../../../school-portal/backend/src/controllers/schoolAuthController');
const { requireInternalBridge } = require('../middleware/internalBridge');

router.post('/register', registerUser);
router.post('/login', authUser);
router.post('/login/admin', authAdmin);
router.post('/admin/refresh', refreshAdmin);
router.post('/admin/logout', logoutAdmin);
router.post('/teacher-bridge/schools', requireInternalBridge, bridgeTeacherSchools);
router.post('/teacher-bridge/select-school', requireInternalBridge, bridgeTeacherSelectSchool);
router.use(schoolAuthRoutes);

module.exports = router;
