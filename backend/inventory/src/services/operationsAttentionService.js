/**
 * Action queues. Live state only — not monthly report totals.
 */
const Dispatch = require('../models/Dispatch');
const ReceiptIssue = require('../models/ReceiptIssue');
const AuditReport = require('../models/AuditReport');
const DivisionAuditWindow = require('../models/DivisionAuditWindow');
const School = require('../models/School');
const {
  PENDING_APPROVAL_STATUSES,
  isApprovedAwaitingShip,
  pendingAckKitsOnDispatch,
  ageBucket,
  emptyAging,
} = require('../utils/operationsKpi');
const { parseMonth } = require('./monthlyReportService');

function bump(aging, date) {
  aging[ageBucket(date)] += 1;
}

function kitsAffectedOn(items) {
  return items.reduce((sum, item) => sum + (Number(item.kitsAffected) || 0), 0);
}

function queue(id, label, items, href, extra = {}) {
  const aging = emptyAging();
  items.forEach((item) => bump(aging, item.at));
  const payload = {
    id,
    label,
    count: items.length,
    aging,
    href,
  };
  if (extra.kitsAffected != null) payload.kitsAffected = extra.kitsAffected;
  return payload;
}

function buildAdminAttentionQueues({
  pendingAm,
  pendingAdmin,
  clarification,
  toShip,
  pendingAck,
  missingTracking,
  auditsOverdue,
}) {
  return [
    queue('pendingAm', 'Pending AM Approval', pendingAm, '/admin/replacements'),
    queue('pendingAdmin', 'Pending Admin Approval', pendingAdmin, '/admin/replacements'),
    queue('clarification', 'Clarification Requested', clarification, '/admin/replacements'),
    queue('approvedToShip', 'Approved replacements to ship', toShip, '/admin/replacements'),
    queue('pendingAck', 'Pending acknowledgement', pendingAck, '/admin/dispatches'),
    queue('missingTracking', 'Dispatched >24h without tracking', missingTracking, '/admin/dispatches'),
    queue('auditsOverdue', 'Audits overdue', auditsOverdue, '/admin/audits'),
  ];
}

function buildSchoolAttentionQueues({ pendingAck, clarification, auditsDue }) {
  return [
    queue('pendingAck', 'Deliveries need acknowledgement', pendingAck, '/school/dispatches'),
    queue('clarification', 'Issues need information', clarification, '/school/dispatches'),
    queue('auditDue', 'Audit due', auditsDue, '/school/audit'),
  ];
}

function buildAmAttentionQueues({ pendingAm, clarification, auditsAttention }) {
  return [
    queue('pendingAm', 'Pending AM Approval', pendingAm, '/am/approvals', {
      kitsAffected: kitsAffectedOn(pendingAm),
    }),
    queue('clarification', 'Clarification Requested', clarification, '/am/dispatches'),
    queue('auditsAttention', 'Audits Requiring Attention', auditsAttention, '/am/audits'),
  ];
}

async function getOperationsAttention(monthInput, options = {}) {
  const { auditMonth, auditMonthPadded } = parseMonth(monthInput);
  const schoolIds = options.schoolIds ?? null;
  const actor = options.actor === 'school' || options.actor === 'am' ? options.actor : 'admin';
  const schoolMatch = schoolIds == null ? {} : { school: { $in: schoolIds } };
  const now = new Date();

  const [issues, dispatches, windows, pendingAmAudits] = await Promise.all([
    ReceiptIssue.find({
      ...schoolMatch,
      status: { $in: [...PENDING_APPROVAL_STATUSES, 'Approved'] },
    })
      .populate('dispatch', 'status outstandingQuantity cycles consignmentNo trackingId dispatchedAt')
      .select('status createdAt adminApprovedAt dispatch quantityAffected issueType')
      .lean(),
    Dispatch.find({ ...schoolMatch, status: 'Dispatched' })
      .select('status consignmentNo trackingId dispatchedAt createdAt quantity cycles outstandingQuantity')
      .lean(),
    actor === 'am'
      ? Promise.resolve([])
      : DivisionAuditWindow.find(
        actor === 'school'
          ? { startDate: { $lte: now } }
          : { endDate: { $lt: now } },
      ).lean(),
    actor === 'am'
      ? AuditReport.find({
        ...schoolMatch,
        workflowStatus: 'Pending AM Approval',
      }).select('createdAt submittedAt').lean()
      : Promise.resolve([]),
  ]);

  const pendingAm = issues.filter((i) => (
    i.status === 'Pending AM Approval'
    || i.status === 'Damage Under Review'
    || i.status === 'Missing Item Under Review'
    || i.status === 'Received with Issues'
  ));
  const pendingAdmin = issues.filter((i) => i.status === 'Pending Admin Approval');
  const clarification = issues.filter((i) => i.status === 'Clarification Requested');
  const toShip = issues.filter((i) => isApprovedAwaitingShip(i, i.dispatch || {}));

  const pendingAck = dispatches.filter((d) => pendingAckKitsOnDispatch(d) > 0);
  const missingTracking = dispatches.filter((d) => {
    const tracking = (d.consignmentNo || d.trackingId || '').trim();
    if (tracking) return false;
    const at = d.dispatchedAt || d.createdAt;
    return at && (Date.now() - new Date(at).getTime()) > 24 * 60 * 60 * 1000;
  });

  let auditsDue = [];
  if (windows.length) {
    const divisionIds = [...new Set(windows.map((w) => String(w.divisionId)))];
    const months = [...new Set(windows.map((w) => w.auditMonth))];
    const schools = await School.find({
      divisionId: { $in: divisionIds },
      ...(schoolIds ? { _id: { $in: schoolIds } } : {}),
    }).select('_id divisionId').lean();
    const audited = await AuditReport.find({
      month: { $in: [...months, auditMonth, auditMonthPadded] },
      school: { $in: schools.map((s) => s._id) },
    }).select('school month').lean();
    const auditedSet = new Set(audited.map((a) => `${a.school}:${a.month}`));
    auditsDue = schools.filter((school) => {
      const window = windows.find((w) => String(w.divisionId) === String(school.divisionId));
      if (!window) return false;
      return !auditedSet.has(`${school._id}:${window.auditMonth}`)
        && !auditedSet.has(`${school._id}:${auditMonth}`)
        && !auditedSet.has(`${school._id}:${auditMonthPadded}`);
    }).map((school) => ({
      at: windows.find((w) => String(w.divisionId) === String(school.divisionId))?.endDate,
    }));
  }

  const pendingAckItems = pendingAck.map((d) => ({ at: d.dispatchedAt || d.createdAt }));
  const clarificationItems = clarification.map((i) => ({ at: i.createdAt, kitsAffected: i.quantityAffected }));
  const pendingAmItems = pendingAm.map((i) => ({ at: i.createdAt, kitsAffected: i.quantityAffected }));

  if (actor === 'school') {
    return {
      queues: buildSchoolAttentionQueues({
        pendingAck: pendingAckItems,
        clarification: clarificationItems,
        auditsDue,
      }),
    };
  }

  if (actor === 'am') {
    return {
      queues: buildAmAttentionQueues({
        pendingAm: pendingAmItems,
        clarification: clarificationItems,
        auditsAttention: pendingAmAudits.map((audit) => ({ at: audit.submittedAt || audit.createdAt })),
      }),
    };
  }

  return {
    queues: buildAdminAttentionQueues({
      pendingAm: pendingAm.map((i) => ({ at: i.createdAt })),
      pendingAdmin: pendingAdmin.map((i) => ({ at: i.createdAt })),
      clarification: clarificationItems,
      toShip: toShip.map((i) => ({ at: i.adminApprovedAt || i.createdAt })),
      pendingAck: pendingAckItems,
      missingTracking: missingTracking.map((d) => ({ at: d.dispatchedAt || d.createdAt })),
      auditsOverdue: auditsDue,
    }),
  };
}

module.exports = {
  getOperationsAttention,
  buildSchoolAttentionQueues,
  buildAdminAttentionQueues,
  buildAmAttentionQueues,
};
