const REPLACEMENT_ACK_STATUSES = ['missing_dispatch', 'damaged_dispatch', 'mismatch_dispatch', 'not_received_dispatch'];
const ADMIN_REDISPATCH_ISSUE_STATUSES = ['Approved', 'Resolved', 'Superseded'];

export function canAcknowledgeDispatch(item) {
  if (!item) return false;
  if (item.status === 'Dispatched') return true;
  if (item.receiptIssue?.status === 'Approved') {
    return REPLACEMENT_ACK_STATUSES.includes(item.status);
  }
  return false;
}

const EDITABLE_ISSUE_STATUSES = [
  'Pending AM Approval',
  'Clarification Requested',
  'Damage Under Review',
  'Missing Item Under Review',
  'Received with Issues',
];

const EDITABLE_DISPATCH_STATUSES = [
  'missing_dispatch',
  'damaged_dispatch',
  'mismatch_dispatch',
  'not_received_dispatch',
  'Received with Issues',
  'Damage Under Review',
  'Missing Item Under Review',
  'Not Received',
];

/** School may revise acknowledgment while AM review is still pending. */
export function canEditSchoolReceipt(item) {
  if (!item) return false;
  const issue = item.receiptIssue;
  if (!issue) return false;
  return EDITABLE_ISSUE_STATUSES.includes(issue.status)
    && EDITABLE_DISPATCH_STATUSES.includes(item.status);
}

/** Legacy rows marked Not Received before receipt-issue flow existed. */
export function canUpgradeNotReceivedReport(item) {
  return item?.status === 'Not Received' && !item?.receiptIssue;
}

/** Redispatched shipment awaiting school ack or new issue report. */
export function isReplacementAwaitingReceipt(item) {
  if (!item?.receiptIssue || item.receiptIssue.status !== 'Approved') return false;
  if (item.status === 'Dispatched') return true;
  return REPLACEMENT_ACK_STATUSES.includes(item.status);
}

/** Admin authorized at least one replacement on this dispatch. */
export function hasRedispatchHistory(item) {
  if ((item?.redispatchCycles || []).length > 0) return true;
  const issue = item?.receiptIssue;
  if (!issue || !ADMIN_REDISPATCH_ISSUE_STATUSES.includes(issue.status)) {
    // Also check history list if present
    const history = item?.receiptIssueHistory || item?.receiptIssues || [];
    if (history.some((i) => ADMIN_REDISPATCH_ISSUE_STATUSES.includes(i.status) && i.adminApprovedAt)) {
      return true;
    }
    return false;
  }
  if (item.status === 'Dispatched') return true;
  if (REPLACEMENT_ACK_STATUSES.includes(item.status)) return true;
  if (item.status === 'Delivery Completed' && ['Resolved', 'Superseded', 'Approved'].includes(issue.status)) {
    return true;
  }
  return false;
}

/** @deprecated use hasRedispatchHistory */
export function isAdminRedispatched(item) {
  return hasRedispatchHistory(item);
}

function trackingId(item) {
  return item?.consignmentNo || item?.trackingId || '';
}

/** Category of the replacement shipment created for this issue type. */
export function categoryForIssueType(issueType) {
  if (issueType === 'Damaged Product') return 'Damaged Dispatch';
  if (issueType === 'Quantity Mismatch') return 'Mismatch Dispatch';
  if (issueType === 'Missing Product' || issueType === 'Shipment Not Received') return 'Lost Dispatch';
  return null;
}

/**
 * Prefer stored category; for older rows where mismatch was stored as Lost Dispatch,
 * derive from issueType when present.
 */
function displayCategory(storedCategory, issueType) {
  const derived = categoryForIssueType(issueType);
  if (derived && (storedCategory === 'Lost Dispatch' || !storedCategory) && issueType === 'Quantity Mismatch') {
    return derived;
  }
  if (derived && !storedCategory) return derived;
  return storedCategory || derived || '—';
}

function buildOriginalSnapshot(item, issue) {
  const originalKitId = item?.originalKitId || issue?.originalKitId;
  const originalTracking =
    item?.originalConsignmentNo
    || issue?.consignmentNo
    || (hasRedispatchHistory(item) ? null : trackingId(item))
    || '—';
  return {
    kitId: originalKitId || item?.kitId || item?.componentId || '—',
    category: item?.originalCategory || issue?.originalCategory || 'New Dispatch',
    quantity: issue?.quantitySent ?? item?.quantity ?? 0,
    trackingId: originalTracking,
    label: 'Original',
  };
}

function buildRedispatchSnapshot(item, issue) {
  return {
    kitId: item?.kitId || item?.componentId || '—',
    category: item?.category || 'New Dispatch',
    quantity: issue?.quantityAffected ?? item?.quantity ?? 0,
    trackingId: trackingId(item) || '—',
    label: 'Current',
  };
}

/**
 * Build ordered shipment history: original → each replaced cycle → current live.
 */
export function getDispatchCycleHistory(item) {
  const issue = item?.receiptIssue;
  const storedCycles = item?.redispatchCycles || [];

  if (!storedCycles.length && !hasRedispatchHistory(item)) {
    return [{
      label: 'Shipment',
      kitId: item?.kitId || item?.componentId || '—',
      category: item?.category || 'New Dispatch',
      quantity: item?.quantity ?? 0,
      trackingId: trackingId(item) || '—',
    }];
  }

  const history = [];

  if (storedCycles.length) {
    // Each cycle snapshot is the shipment that was replaced. After authorize, the
    // *new* shipment category is derived from that cycle's issueType.
    // Display: Original (first snapshot) → each redispatch category from issueType → current live.
    const first = storedCycles[0];
    history.push({
      label: 'Original',
      cycle: first.cycle,
      kitId: item?.originalKitId || first.kitId || '—',
      category: item?.originalCategory || first.category || 'New Dispatch',
      quantity: first.quantity ?? 0,
      trackingId: item?.originalConsignmentNo || first.consignmentNo || '—',
      issueType: null,
    });

    storedCycles.forEach((cycle, index) => {
      const isLastStored = index === storedCycles.length - 1;
      if (isLastStored) return; // current live row covers latest redispatch
      const next = storedCycles[index + 1];
      history.push({
        label: `Redispatch ${index + 1}`,
        cycle: cycle.cycle,
        kitId: next?.kitId || '—',
        // Category of the redispatch created for this issue (not the prior ship label).
        category: categoryForIssueType(cycle.issueType) || next?.category || '—',
        quantity: next?.quantity ?? 0,
        trackingId: next?.consignmentNo || '—',
        issueType: cycle.issueType,
      });
    });

    const latestCause = storedCycles[storedCycles.length - 1];
    const latestIssueType = latestCause?.issueType || issue?.issueType;
    history.push({
      label: `Current (redispatch ${storedCycles.length})`,
      kitId: item?.kitId || item?.componentId || '—',
      category: categoryForIssueType(latestIssueType)
        || displayCategory(item?.category, latestIssueType),
      quantity: item?.quantity ?? 0,
      trackingId: trackingId(item) || '—',
      issueType: latestIssueType || null,
    });
    return history;
  }

  // Legacy single redispatch (original* + live)
  return [
    buildOriginalSnapshot(item, issue),
    buildRedispatchSnapshot(item, issue),
  ];
}

/** Number of shipment snapshots in history (original + redispatches), or 1 if none. */
export function getCycleCount(item) {
  const cycles = getDispatchCycleHistory(item);
  return cycles.length || 1;
}

/**
 * Unified original vs redispatch snapshot for school dispatch rows.
 * @returns {{ mode: 'single'|'pending'|'redispatched', original: object, redispatch: object|null, cycles: object[] }}
 */
export function getDispatchRedispatchSummary(item) {
  const issue = item?.receiptIssue;
  const currentQty = item?.quantity ?? 0;
  const cycles = getDispatchCycleHistory(item);

  if (!issue && !(item?.redispatchCycles || []).length) {
    return {
      mode: 'single',
      original: {
        kitId: item?.kitId || item?.componentId || '—',
        category: item?.category || 'New Dispatch',
        quantity: currentQty,
        trackingId: trackingId(item) || '—',
      },
      redispatch: null,
      cycles,
    };
  }

  if (hasRedispatchHistory(item)) {
    return {
      mode: 'redispatched',
      original: cycles[0],
      redispatch: cycles[cycles.length - 1],
      cycles,
    };
  }

  const original = buildOriginalSnapshot(item, issue);
  return {
    mode: 'pending',
    original,
    redispatch: null,
    affectedQuantity: issue?.quantityAffected ?? null,
    cycles: [original],
  };
}

/** Original shipment qty vs replacement/redispatch qty for school dispatch rows. */
export function getDispatchQuantityDisplay(item) {
  const summary = getDispatchRedispatchSummary(item);

  if (summary.mode === 'single') {
    return { mode: 'single', quantity: summary.original.quantity };
  }

  if (summary.mode === 'redispatched') {
    return {
      mode: 'split',
      originalSent: summary.original.quantity,
      redispatched: summary.redispatch.quantity,
      label: summary.cycles.length > 2 ? 'Latest' : 'Redispatched',
      cycles: summary.cycles,
    };
  }

  if (summary.affectedQuantity != null && summary.affectedQuantity !== summary.original.quantity) {
    return {
      mode: 'split',
      originalSent: summary.original.quantity,
      redispatched: summary.affectedQuantity,
      label: 'Affected',
    };
  }

  return { mode: 'single', quantity: summary.original.quantity };
}

/** Kit ID lines for school dispatch rows — new ID only after admin redispatch. */
export function getDispatchKitIdDisplay(item) {
  const summary = getDispatchRedispatchSummary(item);

  if (summary.mode === 'redispatched') {
    return {
      mode: 'split',
      originalKitId: summary.original.kitId,
      redispatchKitId: summary.redispatch.kitId,
      cycles: summary.cycles,
    };
  }

  return { mode: 'single', kitId: summary.original.kitId };
}
