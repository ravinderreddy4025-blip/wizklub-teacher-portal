const ReplacementRequest = require('../models/ReplacementRequest');
const School = require('../models/School');
const AuditReport = require('../models/AuditReport');
const Dispatch = require('../models/Dispatch');

const ReceiptIssue = require('../models/ReceiptIssue');
const receiptIssueService = require('../services/receiptIssueService');
const notificationService = require('../services/notificationService');
const monthlyReportService = require('../services/monthlyReportService');
const { generateSchoolConsolidatedReportPdf } = require('../services/schoolConsolidatedReportPdf');
const { generateDispatchInvoicePdf, sendInvoicePdf } = require('../services/dispatchBillPdf');
const { getOperationsSnapshot } = require('../services/operationsSnapshotService');
const { getOperationsAttention } = require('../services/operationsAttentionService');
const operationsKpi = require('../utils/operationsKpi');
const { closeExpiredAuditWindows } = require('../services/auditCloseoutService');
const { populateAuditRelations } = require('../utils/auditQuery');
const { getAmDivisions } = require('../utils/divisionManager');

const PENDING_AM_APPROVAL = 'Pending AM Approval';

async function requireAmDivisions(user) {
  const divisions = await getAmDivisions(user);
  if (!divisions.length) {
    const error = new Error('Account Manager is not assigned to a division');
    error.status = 400;
    throw error;
  }
  return divisions;
}

async function getDivisionSchoolIds(divisionIds) {
  const ids = Array.isArray(divisionIds) ? divisionIds : [divisionIds];
  const schools = await School.find({ divisionId: { $in: ids } }).select('_id');
  return schools.map((s) => s._id);
}

async function assertSchoolInAmDivisions(schoolRef, divisionIds) {
  const schoolIds = await getDivisionSchoolIds(divisionIds);
  if (!schoolIds.some((id) => String(id) === String(schoolRef))) {
    const error = new Error('This item is not in your region');
    error.status = 403;
    throw error;
  }
}

async function serializeAmDivisions(divisions) {
  const counts = await School.aggregate([
    { $match: { divisionId: { $in: divisions.map((d) => d._id) } } },
    { $group: { _id: '$divisionId', count: { $sum: 1 } } },
  ]);
  const countById = new Map(counts.map((row) => [String(row._id), row.count]));
  return divisions.map((d) => ({
    _id: d._id,
    name: d.name,
    description: d.description || '',
    schoolCount: countById.get(String(d._id)) || 0,
  }));
}

const approveLostRequest = async (req, res) => {
  try {
    const divisions = await requireAmDivisions(req.user);
    const divisionIds = divisions.map((d) => d._id);

    const { id } = req.params;
    const amNotes = req.body.amNotes ?? req.body.rmNotes;

    const request = await ReplacementRequest.findById(id);
    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    await assertSchoolInAmDivisions(request.school, divisionIds);

    if (request.status !== PENDING_AM_APPROVAL) {
      return res.status(400).json({ message: 'Request is not pending AM approval' });
    }

    request.status = 'Pending Admin Approval';
    request.amNotes = amNotes;
    await request.save();

    res.json(request);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

const rejectLostRequest = async (req, res) => {
  try {
    const divisions = await requireAmDivisions(req.user);
    const divisionIds = divisions.map((d) => d._id);

    const { id } = req.params;
    const amNotes = req.body.amNotes ?? req.body.rmNotes;

    const request = await ReplacementRequest.findById(id);
    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    await assertSchoolInAmDivisions(request.school, divisionIds);

    request.status = 'Rejected';
    request.amNotes = amNotes;
    await request.save();

    res.json(request);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

const approveReceiptIssue = async (req, res) => {
  try {
    const divisions = await requireAmDivisions(req.user);
    const divisionIds = divisions.map((d) => d._id);

    const { id } = req.params;
    const amNotes = req.body.amNotes ?? req.body.rmNotes ?? '';

    const issue = await ReceiptIssue.findById(id);
    if (!issue) {
      return res.status(404).json({ message: 'Receipt issue not found' });
    }

    await assertSchoolInAmDivisions(issue.school, divisionIds);
    const updated = await receiptIssueService.approveReceiptIssueByAm(id, amNotes);
    await notificationService.notifyReceiptIssueWorkflow(updated._id, 'am_approved', {
      workflowNote: amNotes,
    });
    res.json(updated);
  } catch (error) {
    res.status(error.statusCode || error.status || 500).json({ message: error.message });
  }
};

const rejectReceiptIssue = async (req, res) => {
  try {
    const divisions = await requireAmDivisions(req.user);
    const divisionIds = divisions.map((d) => d._id);

    const { id } = req.params;
    const amNotes = req.body.amNotes ?? req.body.rmNotes ?? '';

    const issue = await ReceiptIssue.findById(id);
    if (!issue) {
      return res.status(404).json({ message: 'Receipt issue not found' });
    }

    await assertSchoolInAmDivisions(issue.school, divisionIds);
    const updated = await receiptIssueService.rejectReceiptIssue(id, amNotes, 'am');
    await notificationService.notifyReceiptIssueWorkflow(updated._id, 'am_rejected', {
      workflowNote: amNotes,
    });
    res.json(updated);
  } catch (error) {
    res.status(error.statusCode || error.status || 500).json({ message: error.message });
  }
};

const EMPTY_DASHBOARD = {
  division: null,
  schools: [],
  audits: [],
  dispatches: [],
  requests: [],
  receiptIssues: [],
};

const getDashboard = async (req, res) => {
  try {
    const assigned = await requireAmDivisions(req.user);
    const divisions = await serializeAmDivisions(assigned);

    const requestedId = String(req.query.divisionId || '').trim();
    let selected = null;
    if (requestedId) {
      selected = assigned.find((d) => String(d._id) === requestedId) || null;
    } else if (assigned.length === 1) {
      selected = assigned[0];
    }

    if (!selected) {
      return res.json({
        needsSelection: true,
        divisions,
        ...EMPTY_DASHBOARD,
      });
    }

    const schools = await School.find({ divisionId: selected._id }).populate('divisionId');
    const schoolIds = schools.map((s) => s._id);

    await receiptIssueService.repairAllSplitReceiptIssues();
    await closeExpiredAuditWindows({ schoolIds });

    const [audits, dispatchesRaw, requests, receiptIssues] = await Promise.all([
      populateAuditRelations(
        AuditReport.find({ school: { $in: schoolIds } })
      ).sort({ createdAt: -1 }),
      Dispatch.find({ school: { $in: schoolIds } })
        .populate('school')
        .populate('kit')
        .sort({ createdAt: -1 }),
      ReplacementRequest.find({
        school: { $in: schoolIds },
        type: 'Lost',
        status: PENDING_AM_APPROVAL,
      })
        .populate('school')
        .populate('kit'),
      ReceiptIssue.find({
        school: { $in: schoolIds },
        status: { $in: [PENDING_AM_APPROVAL, 'Damage Under Review', 'Missing Item Under Review', 'Received with Issues'] },
      })
        .populate('school')
        .populate('kit')
        .populate('dispatch')
        .sort({ createdAt: -1 }),
    ]);

    const dispatches = await receiptIssueService.attachReceiptIssuesToDispatches(dispatchesRaw);

    res.json({
      needsSelection: false,
      divisions,
      division: selected,
      schools,
      audits,
      dispatches,
      requests,
      receiptIssues,
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

const emptyOpsPayload = (month) => ({
  summary: {
    month,
    pendingKits: 0,
    scheduledKits: 0,
    sentKits: 0,
    dispatchedKits: 0,
    replacedKits: 0,
    lostKits: 0,
    notReceivedKits: 0,
    damagedKits: 0,
    mismatchKits: 0,
    acknowledgedKits: 0,
    rejectedKits: 0,
    rejectedByAm: 0,
    rejectedByAdmin: 0,
    schoolsWithActivity: 0,
  },
  schools: [],
  month,
  period: operationsKpi.periodFromMonthlySummary({}),
  current: {
    month,
    pendingAcknowledgementKits: 0,
    outstandingKits: 0,
    openIssues: { claims: 0, kitsAffected: 0, byType: { mismatchKits: 0, notReceivedKits: 0, damagedKits: 0, lostKits: 0 } },
    fulfillment: { eligibleDsps: 0, fulfilledDsps: 0, rate: 0 },
  },
  attention: { queues: [] },
});

const getOperationsReport = async (req, res) => {
  try {
    const assigned = await requireAmDivisions(req.user);
    const requestedId = String(req.query.divisionId || '').trim();
    let selected = null;
    if (requestedId) {
      selected = assigned.find((d) => String(d._id) === requestedId) || null;
    } else if (assigned.length === 1) {
      selected = assigned[0];
    }
    const month = req.query.month || monthlyReportService.currentMonth();
    if (!selected) {
      return res.json(emptyOpsPayload(month));
    }

    const schools = await School.find({ divisionId: selected._id }).select('_id');
    let schoolIds = schools.map((s) => s._id);
    const requestedSchoolId = String(req.query.schoolId || '').trim();
    if (requestedSchoolId) {
      await assertSchoolInAmDivisions(requestedSchoolId, [selected._id]);
      schoolIds = [requestedSchoolId];
    }

    const scope = { schoolIds };
    const [data, current, attention] = await Promise.all([
      monthlyReportService.getMonthlyReport(month, scope),
      getOperationsSnapshot(month, scope),
      getOperationsAttention(month, { ...scope, actor: 'am' }),
    ]);
    res.json({
      summary: data.summary,
      schools: data.schools,
      month,
      period: operationsKpi.periodFromMonthlySummary(data.summary),
      current,
      attention,
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

const downloadSchoolReportPdf = async (req, res) => {
  try {
    const assigned = await requireAmDivisions(req.user);
    const divisionIds = assigned.map((d) => d._id);
    const { schoolId } = req.params;
    await assertSchoolInAmDivisions(schoolId, divisionIds);
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

const downloadDispatchInvoice = async (req, res) => {
  try {
    const assigned = await requireAmDivisions(req.user);
    const divisionIds = assigned.map((d) => d._id);
    const dispatch = await Dispatch.findById(req.params.id).select('school');
    if (!dispatch) {
      return res.status(404).json({ message: 'Dispatch not found' });
    }
    await assertSchoolInAmDivisions(dispatch.school, divisionIds);
    const { buffer, filename } = await generateDispatchInvoicePdf(req.params.id);
    sendInvoicePdf(res, buffer, filename);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

module.exports = {
  approveLostRequest,
  rejectLostRequest,
  approveReceiptIssue,
  rejectReceiptIssue,
  getDashboard,
  getOperationsReport,
  downloadSchoolReportPdf,
  downloadDispatchInvoice,
};
