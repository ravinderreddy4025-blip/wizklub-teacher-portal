const { LIFECYCLE, CYCLE_OPEN, currentCycle } = require('./dispatchCycle');

const CLOSED_ISSUE_STATUSES = new Set(['Resolved', 'Superseded']);
const PENDING_APPROVAL_STATUSES = [
  'Pending AM Approval',
  'Pending Admin Approval',
  'Clarification Requested',
  'Damage Under Review',
  'Missing Item Under Review',
  'Received with Issues',
];
const OPEN_CLAIM_STATUSES = [
  ...PENDING_APPROVAL_STATUSES,
  'Approved',
];

function n(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function issueTypeKey(issueType) {
  if (issueType === 'Shipment Not Received') return 'notReceived';
  if (issueType === 'Missing Product') return 'lost';
  if (issueType === 'Quantity Mismatch') return 'mismatch';
  if (issueType === 'Damaged Product') return 'damaged';
  return 'other';
}

function liveUnresolvedIssue(dispatch, issues = []) {
  const outstanding = n(dispatch.outstandingQuantity);
  if (outstanding <= 0) return null;
  const list = Array.isArray(issues) ? issues : [];
  const linkedId = String(dispatch.receiptIssue?._id || dispatch.receiptIssue || '');
  const linked = list.find((issue) => String(issue._id) === linkedId);
  if (linked && !CLOSED_ISSUE_STATUSES.has(linked.status)) return linked;
  return [...list].reverse().find((issue) => !CLOSED_ISSUE_STATUSES.has(issue.status)) || null;
}

function emptyOutstandingBreakdown() {
  return { notReceived: 0, lost: 0, mismatch: 0, damaged: 0, other: 0 };
}

function addOutstandingOwnership(breakdown, dispatch, issues) {
  const outstanding = n(dispatch.outstandingQuantity);
  if (outstanding <= 0) return breakdown;
  const issue = liveUnresolvedIssue(dispatch, issues);
  const key = issue ? issueTypeKey(issue.issueType) : 'other';
  breakdown[key] += outstanding;
  return breakdown;
}

function pendingAckKitsOnDispatch(dispatch) {
  if (dispatch.status !== LIFECYCLE.DISPATCHED) return 0;
  const live = currentCycle(dispatch);
  if (live && live.status === CYCLE_OPEN) {
    return Math.max(0, n(live.quantityDispatched) - n(live.quantityAcknowledged));
  }
  return n(dispatch.quantity);
}

function hasOpenReplacementCycle(dispatch) {
  const live = currentCycle(dispatch);
  return live?.status === CYCLE_OPEN && live?.movementType === 'REPLACEMENT';
}

function replacementInTransitKitsOnDispatch(dispatch) {
  if (!hasOpenReplacementCycle(dispatch)) return 0;
  return pendingAckKitsOnDispatch(dispatch);
}

function inventoryHealthFromOpenIssues(issues = []) {
  const health = { lostKits: 0, damagedKits: 0, mismatchKits: 0 };
  issues.forEach((issue) => {
    if (!issue || CLOSED_ISSUE_STATUSES.has(issue.status)) return;
    const qty = n(issue.quantityAffected);
    const key = issueTypeKey(issue.issueType);
    if (key === 'lost') health.lostKits += qty;
    else if (key === 'damaged') health.damagedKits += qty;
    else if (key === 'mismatch') health.mismatchKits += qty;
  });
  return health;
}

function openIssuesByTypeFromIssues(issues = []) {
  const byType = { mismatchKits: 0, notReceivedKits: 0, damagedKits: 0, lostKits: 0 };
  issues.forEach((issue) => {
    if (!issue || CLOSED_ISSUE_STATUSES.has(issue.status)) return;
    const qty = n(issue.quantityAffected);
    const key = issueTypeKey(issue.issueType);
    if (key === 'mismatch') byType.mismatchKits += qty;
    else if (key === 'notReceived') byType.notReceivedKits += qty;
    else if (key === 'damaged') byType.damagedKits += qty;
    else if (key === 'lost') byType.lostKits += qty;
  });
  return byType;
}

function fulfillmentFromDispatches(dispatches = [], start, end) {
  let eligibleDsps = 0;
  let fulfilledDsps = 0;
  dispatches.forEach((dispatch) => {
    if (!initialMovementInRange(dispatch, start, end)) return;
    eligibleDsps += 1;
    if (n(dispatch.outstandingQuantity) === 0) fulfilledDsps += 1;
  });
  return {
    eligibleDsps,
    fulfilledDsps,
    rate: eligibleDsps > 0 ? Math.round((fulfilledDsps / eligibleDsps) * 1000) / 10 : 0,
  };
}

function periodFromMonthlySummary(summary = {}) {
  return {
    shippedKits: n(summary.sentKits ?? summary.dispatchedKits),
    acknowledgedKits: n(summary.acknowledgedKits),
    replacedKits: n(summary.replacedKits),
    pendingKits: n(summary.pendingKits),
    scheduledKits: n(summary.scheduledKits ?? n(summary.sentKits) + n(summary.pendingKits)),
    mismatchKits: n(summary.mismatchKits),
    lostKits: n(summary.lostKits),
    notReceivedKits: n(summary.notReceivedKits),
    damagedKits: n(summary.damagedKits),
    rejectedKits: n(summary.rejectedKits),
  };
}

function isApprovedAwaitingShip(issue, dispatch) {
  if (!issue || issue.status !== 'Approved') return false;
  if (n(dispatch?.outstandingQuantity) <= 0) return false;
  if (hasOpenReplacementCycle(dispatch)) return false;
  return true;
}

function initialMovementInRange(dispatch, start, end) {
  const cycles = Array.isArray(dispatch.cycles) ? dispatch.cycles : [];
  const initial = cycles.find((cycle) => cycle.movementType === 'INITIAL') || cycles[0];
  const at = initial?.dispatchedAt || dispatch.dispatchedAt || dispatch.createdAt;
  if (!at) return false;
  const t = new Date(at).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

function ageBucket(date) {
  if (!date) return 'gt48h';
  const hours = (Date.now() - new Date(date).getTime()) / 3600000;
  if (hours < 24) return 'lt24h';
  if (hours < 48) return 'h24to48';
  return 'gt48h';
}

function emptyAging() {
  return { lt24h: 0, h24to48: 0, gt48h: 0 };
}

module.exports = {
  CLOSED_ISSUE_STATUSES,
  PENDING_APPROVAL_STATUSES,
  OPEN_CLAIM_STATUSES,
  issueTypeKey,
  liveUnresolvedIssue,
  emptyOutstandingBreakdown,
  addOutstandingOwnership,
  pendingAckKitsOnDispatch,
  hasOpenReplacementCycle,
  replacementInTransitKitsOnDispatch,
  inventoryHealthFromOpenIssues,
  openIssuesByTypeFromIssues,
  fulfillmentFromDispatches,
  periodFromMonthlySummary,
  isApprovedAwaitingShip,
  initialMovementInRange,
  ageBucket,
  emptyAging,
};
