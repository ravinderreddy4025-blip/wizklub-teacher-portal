const REVIEW_STATUSES = new Set([
  'Pending AM Approval',
  'Pending Admin Approval',
  'Damage Under Review',
  'Missing Item Under Review',
  'Received with Issues',
]);

export function schoolIssueStatusLabel(status) {
  if (status === 'Clarification Requested') return 'Needs Information';
  if (status === 'Approved' || status === 'Replacement Pending' || status === 'Awaiting dispatch') {
    return 'Waiting for Replacement';
  }
  if (status === 'Resolved') return 'Resolved';
  if (status === 'Rejected') return 'Rejected';
  if (REVIEW_STATUSES.has(status)) return 'Needs Review';
  return status || '—';
}

export function schoolIssueTypeLabel(issueType) {
  if (issueType === 'Shipment Not Received') return 'Not Received';
  if (issueType === 'Missing Product') return 'Lost';
  if (issueType === 'Quantity Mismatch') return 'Mismatch';
  if (issueType === 'Damaged Product') return 'Damaged';
  return issueType || '—';
}

export function schoolIssueStatusBadge(status) {
  if (status === 'Resolved' || status === 'Approved') return 'success';
  if (status === 'Rejected') return 'error';
  if (status === 'Clarification Requested') return 'warning';
  return 'pending';
}

export const SCHOOL_ISSUE_STATUS_FILTERS = [
  { id: '', label: 'All' },
  { id: 'needsReview', label: 'Needs Review' },
  { id: 'needsInformation', label: 'Needs Information' },
  { id: 'waitingReplacement', label: 'Waiting for Replacement' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'rejected', label: 'Rejected' },
];

export const SCHOOL_ISSUE_TYPE_FILTERS = [
  { id: '', label: 'All types' },
  { id: 'notReceived', label: 'Not Received' },
  { id: 'lost', label: 'Lost' },
  { id: 'mismatch', label: 'Mismatch' },
  { id: 'damaged', label: 'Damaged' },
];
