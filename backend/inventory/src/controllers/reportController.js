const monthlyReportService = require('../services/monthlyReportService');
const { generateSchoolConsolidatedReportPdf } = require('../services/schoolConsolidatedReportPdf');

const getMonthlyReport = async (req, res) => {
  try {
    const month = req.query.month || monthlyReportService.currentMonth();
    const schoolId = String(req.query.schoolId || '').trim();
    const data = await monthlyReportService.getMonthlyReport(
      month,
      schoolId ? { schoolIds: [schoolId] } : {},
    );
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
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
  downloadSchoolReportPdf,
};
