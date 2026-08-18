const express = require('express');
const { requireAuth, requireSuperAdmin } = require('../middleware/auth');
const {
  getUsers,
  postUser,
  putUser,
  putUserPassword,
  deleteUser,
} = require('../controllers/userAdminController');
const {
  getSchools,
  postSchool,
  putSchool,
  deleteSchool,
} = require('../controllers/schoolAdminController');
const { getAuditLogs } = require('../controllers/auditController');

function mountAdminRoutes(app) {
  const router = express.Router();
  router.use(requireAuth, requireSuperAdmin);

  router.get('/users', getUsers);
  router.post('/users', postUser);
  router.put('/users/:id', putUser);
  router.put('/users/:id/password', putUserPassword);
  router.delete('/users/:id', deleteUser);

  router.get('/schools', getSchools);
  router.post('/schools', postSchool);
  router.put('/schools/:id', putSchool);
  router.delete('/schools/:id', deleteSchool);

  router.get('/audit-logs', getAuditLogs);

  app.use('/api/admin', router);
}

module.exports = { mountAdminRoutes };
