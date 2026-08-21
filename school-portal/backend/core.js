/**
 * Bridge to the shared inventory backend (models, services, middleware).
 * When moving school-portal to another project, replace this module with your
 * own implementations or copy the listed paths from inventory-core.
 */
const path = require('path');
const fs = require('fs');

/** Monorepo dev: repo/inventory-backend/src — Docker: /app/src next to /app/school-portal */
const INV_CANDIDATES = [
  path.join(__dirname, '..', '..', 'backend', 'inventory', 'src'),
  path.join(__dirname, '..', '..', 'Inventory', 'inventory-backend', 'src'),
  path.join(__dirname, '..', '..', 'inventory-backend', 'src'),
  path.join(__dirname, '..', '..', 'backend', 'src'),
  path.join(__dirname, '..', '..', 'src'),
];

const INV = INV_CANDIDATES.find((candidate) => fs.existsSync(path.join(candidate, 'models', 'User.js')));

if (!INV) {
  throw new Error('school-portal/backend/core.js: could not locate inventory backend src (models/User.js)');
}

function load(subpath) {
  return require(path.join(INV, subpath));
}

module.exports = {
  models: {
    User: load('models/User'),
    School: load('models/School'),
    Dispatch: load('models/Dispatch'),
    ReceiptIssue: load('models/ReceiptIssue'),
    AuditReport: load('models/AuditReport'),
    ReplacementRequest: load('models/ReplacementRequest'),
  },
  middleware: {
    protect: load('middleware/auth').protect,
    authorize: load('middleware/roles').authorize,
    receiptUpload: load('middleware/receiptUpload'),
    upload: load('middleware/upload'),
  },
  services: {
    auditService: load('services/auditService'),
    auditSubmissionService: load('services/auditSubmissionService'),
    replacementService: load('services/replacementService'),
    schoolReplacementService: load('services/schoolReplacementService'),
    schoolInventoryService: load('services/schoolInventoryService'),
    notificationService: load('services/notificationService'),
    receiptIssueService: load('services/receiptIssueService'),
    dispatchHubService: load('services/dispatchHubService'),
    dispatchConsignmentService: load('services/dispatchConsignmentService'),
    wizklubApi: load('services/wizklubApiService'),
    monthlyReportService: load('services/monthlyReportService'),
    schoolConsolidatedReportPdf: load('services/schoolConsolidatedReportPdf'),
    dispatchBillPdf: load('services/dispatchBillPdf'),
    operationsSnapshotService: load('services/operationsSnapshotService'),
    operationsAttentionService: load('services/operationsAttentionService'),
  },
  utils: {
    preserveSchoolLoginId: load('utils/schoolCode').preserveSchoolLoginId,
    wizklubSchoolNameToBranch: load('utils/schoolName').wizklubSchoolNameToBranch,
    formatSchoolDisplayName: load('utils/schoolName').formatSchoolDisplayName,
    generateSecurePassword: load('utils/passwordGenerator').generateSecurePassword,
    fileUrl: load('utils/mediaUrl').fileUrl,
    dispatchCycle: load('utils/dispatchCycle'),
    operationsKpi: load('utils/operationsKpi'),
  },
};
