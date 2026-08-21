const express = require('express');
const router = express.Router();
const { middleware } = require('../../core');
const { protect, authorize, receiptUpload, upload } = middleware;
const {
  confirmDelivery,
  reportReceiptIssues,
  resetReceiptAcknowledgment,
  notifyReceiptAcknowledgmentHandler,
  getWarehouse,
  getAuditForm,
  getAuditHistory,
  submitAudit, 
  createReplacementRequest,
  getDispatches,
  getDispatchHub,
  getReplacementHistory,
  getAuditWindowStatus,
  getOperationsReport,
  downloadOperationsPdf,
  downloadDispatchInvoice,
} = require('../controllers/schoolController');

router.use(protect);
router.use(authorize('School'));

router.get('/dispatches', getDispatches);
router.get('/dispatch-hub', getDispatchHub);
router.get('/warehouse', getWarehouse);
router.get('/audit/window', getAuditWindowStatus);
router.get('/audit/form', getAuditForm);
router.get('/audits', getAuditHistory);
router.post('/audit', receiptUpload.any(), submitAudit);
router.put('/dispatch/:id/confirm', receiptUpload.fields([
  { name: 'deliveryPhoto', maxCount: 1 },
  { name: 'damagedImage', maxCount: 1 },
]), confirmDelivery);
router.post('/dispatch/:id/reset-receipt', resetReceiptAcknowledgment);
router.post('/receipt/report-issues', receiptUpload.any(), reportReceiptIssues);
router.post('/receipt/notify', notifyReceiptAcknowledgmentHandler);
router.post('/replacement', upload.single('image'), createReplacementRequest);
router.get('/replacements/history', getReplacementHistory);
router.get('/reports/summary', getOperationsReport);
router.get('/reports/pdf', downloadOperationsPdf);
router.get('/dispatches/:id/invoice', downloadDispatchInvoice);

module.exports = router;
