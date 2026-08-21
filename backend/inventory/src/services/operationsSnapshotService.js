/**
 * Live operational snapshot. Do not derive these from monthlyReportService.
 */
const Dispatch = require('../models/Dispatch');
const ReceiptIssue = require('../models/ReceiptIssue');
const {
  OPEN_CLAIM_STATUSES,
  PENDING_APPROVAL_STATUSES,
  pendingAckKitsOnDispatch,
  emptyOutstandingBreakdown,
  addOutstandingOwnership,
  replacementInTransitKitsOnDispatch,
  inventoryHealthFromOpenIssues,
  openIssuesByTypeFromIssues,
  fulfillmentFromDispatches,
} = require('../utils/operationsKpi');
const { parseMonth } = require('../services/monthlyReportService');

function schoolFilter(schoolIds) {
  if (schoolIds == null) return {};
  return { school: { $in: schoolIds } };
}

async function getOperationsSnapshot(monthInput, options = {}) {
  const { start, end, auditMonthPadded } = parseMonth(monthInput);
  const schoolIds = options.schoolIds ?? null;
  const match = schoolFilter(schoolIds);

  const [dispatches, issues] = await Promise.all([
    Dispatch.find({ ...match, status: { $ne: 'Pending' } })
      .select('status quantity quantityInitial outstandingQuantity dispatchedAt createdAt cycles receiptIssue')
      .lean(),
    ReceiptIssue.find({ ...match, status: { $in: OPEN_CLAIM_STATUSES } })
      .select('status issueType quantityAffected dispatch')
      .lean(),
  ]);

  const issuesByDispatch = new Map();
  issues.forEach((issue) => {
    const id = String(issue.dispatch?._id || issue.dispatch || '');
    if (!id) return;
    if (!issuesByDispatch.has(id)) issuesByDispatch.set(id, []);
    issuesByDispatch.get(id).push(issue);
  });

  let pendingAcknowledgementKits = 0;
  let replacementInTransitKits = 0;
  let outstandingKits = 0;
  const outstandingByType = emptyOutstandingBreakdown();
  dispatches.forEach((dispatch) => {
    pendingAcknowledgementKits += pendingAckKitsOnDispatch(dispatch);
    replacementInTransitKits += replacementInTransitKitsOnDispatch(dispatch);
    const owed = Number(dispatch.outstandingQuantity) || 0;
    outstandingKits += owed;
    addOutstandingOwnership(outstandingByType, dispatch, issuesByDispatch.get(String(dispatch._id)) || []);
  });
  const fulfillment = fulfillmentFromDispatches(dispatches, start, end);

  const openIssues = issues.filter((issue) => OPEN_CLAIM_STATUSES.includes(issue.status));
  const pendingApprovals = issues.filter((issue) => PENDING_APPROVAL_STATUSES.includes(issue.status));

  const openIssueKits = openIssues.reduce((sum, issue) => sum + (Number(issue.quantityAffected) || 0), 0);
  const approvalKits = pendingApprovals.reduce((sum, issue) => sum + (Number(issue.quantityAffected) || 0), 0);

  const health = inventoryHealthFromOpenIssues(openIssues);

  return {
    month: auditMonthPadded,
    pendingAcknowledgementKits,
    replacementInTransitKits,
    outstandingKits,
    outstandingByType,
    openIssues: {
      claims: openIssues.length,
      kitsAffected: openIssueKits,
      byType: openIssuesByTypeFromIssues(openIssues),
    },
    approvals: {
      claims: pendingApprovals.length,
      kitsAffected: approvalKits,
      pendingAm: pendingApprovals.filter((i) => i.status === 'Pending AM Approval' || i.status === 'Damage Under Review' || i.status === 'Missing Item Under Review' || i.status === 'Received with Issues').length,
      pendingAdmin: pendingApprovals.filter((i) => i.status === 'Pending Admin Approval').length,
      clarification: pendingApprovals.filter((i) => i.status === 'Clarification Requested').length,
    },
    fulfillment,
    inventoryHealth: health,
  };
}

module.exports = { getOperationsSnapshot };
