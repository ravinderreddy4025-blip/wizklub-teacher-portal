const INCOMING_DISPATCH_STATUSES = ['Pending', 'Dispatched'];

const ISSUE_TYPES_BY_CATEGORY = {
  lost: ['Missing Product', 'Shipment Not Received'],
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

module.exports = {
  INCOMING_DISPATCH_STATUSES,
  ISSUE_TYPES_BY_CATEGORY,
  parseMonth,
  buildDispatchMonthMatch,
  buildIssueMonthMatch,
  buildReplacementMonthMatch,
};
