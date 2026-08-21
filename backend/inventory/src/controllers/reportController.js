const monthlyAnalyticsService = require('../services/monthlyAnalyticsService');
const monthlyReportService = require('../services/monthlyReportService');
const { getOperationsSnapshot } = require('../services/operationsSnapshotService');
const { getOperationsAttention } = require('../services/operationsAttentionService');
const { generateSchoolConsolidatedReportPdf } = require('../services/schoolConsolidatedReportPdf');
const schoolInventoryService = require('../services/schoolInventoryService');

const getMonthlyReport = async (req, res) => {
  try {
    const month = req.query.month || monthlyReportService.currentMonth();
    const trendMonths = req.query.trendMonths;
    const divisionId = req.query.divisionId;
    const schoolId = String(req.query.schoolId || '').trim();
    const issueType = req.query.issueType || 'all';

    const data = await monthlyAnalyticsService.getMonthlyAnalytics({
      month,
      trendMonths,
      divisionId,
      schoolId: schoolId || undefined,
      issueType,
    });

    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

const getAdminOperations = async (req, res) => {
  try {
    const month = req.query.month || monthlyReportService.currentMonth();
    const schoolId = String(req.query.schoolId || '').trim();
    const options = schoolId ? { schoolIds: [schoolId] } : {};
    const [period, current, attention] = await Promise.all([
      monthlyReportService.getMonthlyReport(month, options),
      getOperationsSnapshot(month, options),
      getOperationsAttention(month, options),
    ]);
    res.json({
      month,
      period: {
        shippedKits: period.summary?.sentKits || 0,
        acknowledgedKits: period.summary?.acknowledgedKits || 0,
        replacedKits: period.summary?.replacedKits || 0,
        summary: period.summary,
      },
      current,
      attention,
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

const getSchoolInventory = async (req, res) => {
  try {
    const inventory = await schoolInventoryService.getWarehouseForSchool(req.params.schoolId);
    res.json({ inventory });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const downloadSchoolReportPdf = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const month = req.query.month || monthlyReportService.currentMonth();
    const buffer = await generateSchoolConsolidatedReportPdf(schoolId, month);
    const safeName = String(schoolId).replace(/[^a-zA-Z0-9-_]/g, '');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="wizklub-school-report-${safeName}-${month}.pdf"`);
    res.send(buffer);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

module.exports = {
  getMonthlyReport,
  getAdminOperations,
  getSchoolInventory,
  downloadSchoolReportPdf,
};
