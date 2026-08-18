const Division = require('../models/Division');
const DivisionAuditWindow = require('../models/DivisionAuditWindow');
const {
  getNextAuditMonth,
  formatAuditMonthLabel,
  isNextAuditMonth,
} = require('../utils/auditMonth');

const listAuditWindows = async (req, res) => {
  try {
    const filter = {};
    if (req.query.divisionId) filter.divisionId = req.query.divisionId;
    if (req.query.auditMonth) filter.auditMonth = req.query.auditMonth;

    const windows = await DivisionAuditWindow.find(filter)
      .populate('divisionId', 'name')
      .sort({ auditMonth: -1, createdAt: -1 });

    res.json({ windows, nextAuditMonth: getNextAuditMonth() });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const upsertAuditWindow = async (req, res) => {
  try {
    const { divisionId, auditMonth, startDate, endDate } = req.body;

    if (!divisionId || !auditMonth || !startDate || !endDate) {
      return res.status(400).json({ message: 'Division, audit month, start date, and end date are required' });
    }

    if (!isNextAuditMonth(auditMonth)) {
      return res.status(400).json({
        message: `Audit windows can only be scheduled for the upcoming month (${formatAuditMonthLabel(getNextAuditMonth())})`,
      });
    }

    const division = await Division.findById(divisionId);
    if (!division) return res.status(404).json({ message: 'Division not found' });

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return res.status(400).json({ message: 'Invalid start or end date' });
    }
    if (end < start) {
      return res.status(400).json({ message: 'End date must be on or after start date' });
    }

    const window = await DivisionAuditWindow.findOneAndUpdate(
      { divisionId, auditMonth },
      { startDate: start, endDate: end },
      { upsert: true, new: true, runValidators: true }
    ).populate('divisionId', 'name');

    res.json({
      window,
      message: `Audit window saved for ${division.name} — ${formatAuditMonthLabel(auditMonth)}`,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteAuditWindow = async (req, res) => {
  try {
    const window = await DivisionAuditWindow.findByIdAndDelete(req.params.id);
    if (!window) return res.status(404).json({ message: 'Audit window not found' });
    res.json({ message: 'Audit window removed' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { listAuditWindows, upsertAuditWindow, deleteAuditWindow };
