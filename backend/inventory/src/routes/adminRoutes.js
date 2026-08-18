const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/roles');
const {
  createDispatch,
  approveReplacement,
  generateDispatchForReplacement,
  rejectReplacement,
  approveReceiptIssue,
  rejectReceiptIssue,
  requestReceiptIssueClarification,
  updateDispatchTracking,
  getReports,
  getDashboardStats,
  getWizklubSchools,
  syncWizklubRegions,
  getWizklubRegionMappings,
  registerWizklubSchoolsBulk,
  syncOperationalAms,
} = require('../controllers/adminController');
const {
  getBootstrap,
  listDispatches,
  listSchools,
  listAudits,
  listKits,
  getDispatchDivisionSummary,
  getSchoolDispatchHub,
} = require('../controllers/adminListController');
const {
  createDivision,
  updateDivision,
  deleteDivision,
  createAM,
  updateAM,
  deleteAM,
  regenerateAMPassword,
  getAMPassword,
  createSchool,
  updateSchool,
  deleteSchool,
  regenerateSchoolPassword,
} = require('../controllers/entityController');
const { createKit, updateKit, deleteKit, getWarehouse, bulkUploadKits } = require('../controllers/kitController');
const { listAuditWindows, upsertAuditWindow, deleteAuditWindow } = require('../controllers/auditWindowController');
const { approveAuditAdmin, rejectAuditAdmin, dispatchAuditKit } = require('../controllers/auditController');
const { getMonthlyReport, downloadSchoolReportPdf } = require('../controllers/reportController');
const excelUpload = require('../middleware/excelUpload');
const receiptUpload = require('../middleware/receiptUpload');

router.use(protect);
router.use(authorize('Admin'));

router.post('/dispatch', receiptUpload.single('dispatchProof'), createDispatch);
router.patch('/dispatches/:id/tracking', updateDispatchTracking);
router.put('/replacement/:requestId/generate-dispatch', receiptUpload.single('dispatchProof'), generateDispatchForReplacement);
router.put('/replacement/:requestId/approve', approveReplacement);
router.put('/replacement/:requestId/reject', rejectReplacement);
router.put('/receipt-issue/:issueId/approve', approveReceiptIssue);
router.put('/receipt-issue/:issueId/reject', rejectReceiptIssue);
router.put('/receipt-issue/:issueId/clarify', requestReceiptIssueClarification);
router.get('/reports', getReports);
router.get('/reports/monthly', getMonthlyReport);
router.get('/reports/school/:schoolId/pdf', downloadSchoolReportPdf);
router.get('/bootstrap', getBootstrap);
router.get('/wizklub/schools', getWizklubSchools);
router.get('/wizklub/regions', getWizklubRegionMappings);
router.post('/wizklub/regions/sync', syncWizklubRegions);
router.post('/wizklub/schools/register-with-region', registerWizklubSchoolsBulk);
router.post('/wizklub/ams/sync-operational', syncOperationalAms);
router.get('/dispatches', listDispatches);
router.get('/schools', listSchools);
router.get('/audits', listAudits);
router.put('/audit/:id/approve', approveAuditAdmin);
router.put('/audit/:id/reject', rejectAuditAdmin);
router.post('/audit/:id/dispatch', receiptUpload.single('dispatchProof'), dispatchAuditKit);
router.get('/kits', listKits);
router.get('/dispatch-division-summary', getDispatchDivisionSummary);
router.get('/schools/:schoolId/dispatch-hub', getSchoolDispatchHub);
router.get('/dashboard', getDashboardStats);

router.get('/warehouse', getWarehouse);

router.post('/kits', createKit);
router.put('/kits/:id', updateKit);
router.delete('/kits/:id', deleteKit);
router.post('/kits/bulk-upload', excelUpload.single('file'), bulkUploadKits);

router.post('/divisions', createDivision);
router.put('/divisions/:id', updateDivision);
router.delete('/divisions/:id', deleteDivision);

router.get('/audit-windows', listAuditWindows);
router.post('/audit-windows', upsertAuditWindow);
router.delete('/audit-windows/:id', deleteAuditWindow);

router.post('/ams', createAM);
router.put('/ams/:id', updateAM);
router.delete('/ams/:id', deleteAM);
router.get('/ams/:id/password', getAMPassword);
router.post('/ams/:id/regenerate-password', regenerateAMPassword);

router.post('/schools', createSchool);
router.put('/schools/:id', updateSchool);
router.delete('/schools/:id', deleteSchool);
router.post('/schools/:id/regenerate-password', regenerateSchoolPassword);

module.exports = router;
