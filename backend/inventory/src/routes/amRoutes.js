const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');
const {
  approveLostRequest,
  rejectLostRequest,
  approveReceiptIssue,
  rejectReceiptIssue,
  getDashboard,
  getOperationsReport,
  downloadSchoolReportPdf,
  downloadDispatchInvoice,
} = require('../controllers/amController');
const { approveAudit, rejectAudit } = require('../controllers/auditController');

router.use(protect);
router.use(authorize('AM'));

router.get('/dashboard', getDashboard);
router.get('/reports/monthly', getOperationsReport);
router.get('/reports/school/:schoolId/pdf', downloadSchoolReportPdf);
router.get('/dispatches/:id/invoice', downloadDispatchInvoice);
router.put('/replacement/:id/approve', approveLostRequest);
router.put('/replacement/:id/reject', rejectLostRequest);
router.put('/receipt-issue/:id/approve', approveReceiptIssue);
router.put('/receipt-issue/:id/reject', rejectReceiptIssue);
router.put('/audit/:id/approve', approveAudit);
router.put('/audit/:id/reject', rejectAudit);

module.exports = router;
