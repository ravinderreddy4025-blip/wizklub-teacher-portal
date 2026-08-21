const INCOMING_DISPATCH_STATUSES = ['Pending', 'Dispatched'];
const CLEAN_RECEIPT_STATUSES = ['Received', 'Delivery Completed', 'Completed'];
const CLOSED_ISSUE_STATUSES = new Set(['Approved', 'Resolved', 'Superseded']);

const ISSUE_TYPES_BY_CATEGORY = {
  lost: ['Missing Product', 'Shipment Not Received'],
  notReceived: ['Shipment Not Received'],
  mismatch: ['Quantity Mismatch'],
  damaged: ['Damaged Product'],
};

function parseMonth(monthStr) {
  if (!monthStr || typeof monthStr !== 'string') return null;
  const [year, month] = monthStr.split('-').map(Number);
  if (!year || !month || month < 1 || month > 12) return null;
  return {
    year,
    month,
    start: new Date(year, month - 1, 1),
    end: new Date(year, month, 1),
  };
}

function dispatchActivityDateExpr() {
  return { $ifNull: ['$dispatchedAt', '$createdAt'] };
}

function buildDispatchMonthMatch(monthStr) {
  const range = parseMonth(monthStr);
  if (!range) return {};
  return {
    $expr: {
      $and: [
        { $gte: [dispatchActivityDateExpr(), range.start] },
        { $lt: [dispatchActivityDateExpr(), range.end] },
      ],
    },
  };
}

function buildIssueMonthMatch(monthStr) {
  const range = parseMonth(monthStr);
  if (!range) return {};
  return {
    $or: [
      { receivedAt: { $gte: range.start, $lt: range.end } },
      {
        $and: [
          { $or: [{ receivedAt: { $exists: false } }, { receivedAt: null }] },
          { createdAt: { $gte: range.start, $lt: range.end } },
        ],
      },
    ],
  };
}

function buildReplacementMonthMatch(monthStr) {
  const range = parseMonth(monthStr);
  if (!range) return {};
  return { createdAt: { $gte: range.start, $lt: range.end } };
}

/** Inclusive calendar month — same bounds as acknowledgedKits on the monthly report. */
function reportMonthRange(monthStr) {
  const range = parseMonth(monthStr);
  if (!range) return null;
  return {
    start: new Date(range.year, range.month - 1, 1, 0, 0, 0, 0),
    end: new Date(range.year, range.month, 0, 23, 59, 59, 999),
  };
}

function dateInRange(date, range) {
  if (!range || !date) return false;
  const t = new Date(date).getTime();
  return t >= range.start.getTime() && t <= range.end.getTime();
}

function receivedOkQuantity(dispatch) {
  const received = Number(dispatch.quantityReceived);
  if (Number.isFinite(received) && received >= 0) return received;
  if (CLEAN_RECEIPT_STATUSES.includes(dispatch.status)) return Number(dispatch.quantity) || 0;
  return 0;
}

function incomingQuantity(dispatch) {
  return Number(dispatch.quantity) || 0;
}

/**
 * OK kits on a shipment for the selected month.
 * 100 shipped / 50 received OK / 50 issues → 50 here (Completed = Acknowledged).
 * Prior-cycle remainder on a closed issue is included after redispatch.
 */
function acknowledgedQuantity(dispatch, issues = [], range = null) {
  if (Number(dispatch.quantityAcknowledged) > 0) {
    const receivedInMonth = range ? dateInRange(dispatch.receivedAt, range) : Boolean(dispatch.receivedAt);
    if (!range || receivedInMonth) return Number(dispatch.quantityAcknowledged) || 0;
  }
  const issueList = Array.isArray(issues) ? issues.filter(Boolean) : [];
  const receivedOk = receivedOkQuantity(dispatch);
  const receivedInMonth = range ? dateInRange(dispatch.receivedAt, range) : Boolean(dispatch.receivedAt);
  const hasIssue = Boolean(dispatch.receiptIssue);

  let ack = 0;
  if (receivedInMonth) {
    if (!hasIssue) {
      if (receivedOk > 0) ack += receivedOk;
    } else if (CLEAN_RECEIPT_STATUSES.includes(dispatch.status) && receivedOk > 0) {
      ack += receivedOk;
    }
  }

  const liveIssueId = String(
    (dispatch.receiptIssue && dispatch.receiptIssue._id) || dispatch.receiptIssue || ''
  );
  const dispatchCountedAck = receivedInMonth
    && hasIssue
    && CLEAN_RECEIPT_STATUSES.includes(dispatch.status)
    && receivedOk > 0;

  issueList.forEach((issue) => {
    const issueOk = Number(issue.quantityReceived) || 0;
    if (issue.status === 'Rejected') {
      if (issueOk > 0) ack += issueOk;
      return;
    }
    const isLiveCycleIssue = receivedInMonth && liveIssueId && String(issue._id) === liveIssueId;
    const alreadyCountedOpenIssue = isLiveCycleIssue
      && dispatchCountedAck
      && !CLOSED_ISSUE_STATUSES.has(issue.status);
    if (issueOk > 0 && !alreadyCountedOpenIssue) ack += issueOk;
  });

  return ack;
}

module.exports = {
  INCOMING_DISPATCH_STATUSES,
  CLEAN_RECEIPT_STATUSES,
  ISSUE_TYPES_BY_CATEGORY,
  parseMonth,
  reportMonthRange,
  buildDispatchMonthMatch,
  buildIssueMonthMatch,
  buildReplacementMonthMatch,
  incomingQuantity,
  acknowledgedQuantity,
};
