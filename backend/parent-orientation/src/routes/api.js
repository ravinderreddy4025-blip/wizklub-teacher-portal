const express = require('express');
const {
  requireAuth,
  requirePmo,
  requireSalesAdmin,
} = require('../middleware/auth');
const { loginLimiter, uploadLimiter, apiGeneralLimiter } = require('../middleware/rateLimiters');
const { getHealth } = require('../controllers/systemController');
const { getMe, login, logout } = require('../controllers/authController');
const {
  getSessions,
  createSession,
  updateSession,
  deleteSession,
  replaceSessions,
  postSessionStudentId,
} = require('../controllers/sessionController');
const { sendTemplateXlsx, uploadExcel } = require('../controllers/fileController');
const { getTargets, putTargets, getFulfillment } = require('../controllers/targetController');

function mountApiRoutes(app) {
  app.use(express.json({ limit: '10mb', strict: true }));

  app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
    next(err);
  });

  app.use(apiGeneralLimiter);

  app.get('/api/health', getHealth);

  app.get('/api/me', getMe);

  app.post('/api/login', loginLimiter, login);

  app.post('/api/logout', logout);

  app.get('/Parent_Orientation_Tracker.xlsx', requireAuth, sendTemplateXlsx);

  app.get('/api/sessions', requireAuth, getSessions);

  app.post('/api/sessions', requireAuth, requirePmo, createSession);

  app.put('/api/sessions/:id', requireAuth, requirePmo, updateSession);

  app.post('/api/sessions/:id/student-ids', requireAuth, requirePmo, postSessionStudentId);

  app.delete('/api/sessions/:id', requireAuth, requirePmo, deleteSession);

  app.put('/api/sessions', requireAuth, replaceSessions);

  const uploadExcelParser = express.raw({
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    limit: '10mb',
  });

  app.post('/api/uploadExcel', requireAuth, requirePmo, uploadLimiter, uploadExcelParser, uploadExcel);

  app.get('/api/sales/targets', requireAuth, getTargets);
  app.put('/api/sales/targets', requireAuth, requireSalesAdmin, putTargets);
  app.get('/api/sales/fulfillment', requireAuth, getFulfillment);
}

module.exports = { mountApiRoutes };
