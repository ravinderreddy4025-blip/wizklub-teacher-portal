const LIFECYCLE = {
  PENDING: 'Pending',
  DISPATCHED: 'Dispatched',
  COMPLETED: 'Completed',
};

const CYCLE_OPEN = 'OPEN';
const CYCLE_ACKNOWLEDGED = 'ACKNOWLEDGED';
const MOVEMENT_INITIAL = 'INITIAL';
const MOVEMENT_REPLACEMENT = 'REPLACEMENT';

const INCOMING_LIFECYCLE_STATUSES = [LIFECYCLE.PENDING, LIFECYCLE.DISPATCHED];

const LEGACY_COMPLETED_STATUSES = new Set([
  'Completed',
  'Delivery Completed',
  'Received',
  'Received with Issues',
  'Not Received',
  'Damage Under Review',
  'Missing Item Under Review',
  'Replacement Pending',
  'missing_dispatch',
  'damaged_dispatch',
  'mismatch_dispatch',
  'not_received_dispatch',
  'audit_lost_dispatch',
  'audit_damaged_dispatch',
]);

function n(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function currentCycle(dispatch) {
  const cycles = asArray(dispatch.cycles);
  return cycles.length ? cycles[cycles.length - 1] : null;
}

function applyOrderTotals(dispatch) {
  const cycles = asArray(dispatch.cycles);
  let quantityInitial = 0;
  let quantityReplaced = 0;
  let quantityAcknowledged = 0;
  let quantityAffected = 0;

  cycles.forEach((cycle) => {
    const dispatched = n(cycle.quantityDispatched);
    if (cycle.movementType === MOVEMENT_REPLACEMENT) quantityReplaced += dispatched;
    else quantityInitial += dispatched;
    quantityAcknowledged += n(cycle.quantityAcknowledged);
    quantityAffected += n(cycle.quantityAffected);
  });

  dispatch.quantityInitial = quantityInitial;
  dispatch.quantityReplaced = quantityReplaced;
  dispatch.quantityDispatched = quantityInitial + quantityReplaced;
  dispatch.quantityAcknowledged = quantityAcknowledged;
  dispatch.quantityAffected = quantityAffected;
  dispatch.outstandingQuantity = Math.max(0, quantityInitial - quantityAcknowledged);
  return dispatch;
}

function touchCycles(dispatch) {
  if (typeof dispatch.markModified === 'function') dispatch.markModified('cycles');
  if (typeof dispatch.markModified === 'function') dispatch.markModified('trackingHistory');
}

function ensureCycleList(dispatch) {
  if (!Array.isArray(dispatch.cycles)) dispatch.cycles = [];
  return dispatch.cycles;
}

function ensureInitialCycle(dispatch, fields = {}) {
  const cycles = ensureCycleList(dispatch);
  if (cycles.length > 0) {
    applyOrderTotals(dispatch);
    return currentCycle(dispatch);
  }

  const quantity = n(fields.quantity ?? dispatch.quantity);
  const consignmentNo = fields.consignmentNo ?? dispatch.consignmentNo ?? '';
  cycles.push({
    cycle: 1,
    movementType: MOVEMENT_INITIAL,
    status: CYCLE_OPEN,
    quantityDispatched: quantity,
    quantityAcknowledged: 0,
    quantityAffected: 0,
    kitId: fields.kitId ?? dispatch.kitId ?? '',
    consignmentNo,
    category: fields.category ?? dispatch.category ?? 'New Dispatch',
    dispatchedAt: fields.dispatchedAt ?? dispatch.dispatchedAt ?? new Date(),
    dispatchedBy: fields.dispatchedBy ?? dispatch.dispatchedBy,
    acknowledgedAt: null,
    receiverName: '',
    issue: null,
  });
  dispatch.status = LIFECYCLE.DISPATCHED;
  if (consignmentNo) {
    pushTrackingHistory(dispatch, {
      consignmentNo,
      setAt: fields.dispatchedAt ?? dispatch.dispatchedAt ?? new Date(),
      setBy: fields.dispatchedBy ?? dispatch.dispatchedBy ?? dispatch.createdBy,
    });
  }
  applyOrderTotals(dispatch);
  touchCycles(dispatch);
  return currentCycle(dispatch);
}

/**
 * Record school OK qty on the current cycle. quantityOk is accepted kits only.
 */
function acknowledgeCurrentCycle(dispatch, { quantityOk, receiverName, receivedAt, issueId } = {}) {
  ensureInitialCycle(dispatch, { quantity: dispatch.quantity });
  const cycle = currentCycle(dispatch);
  const sent = n(cycle.quantityDispatched);
  const ok = Math.max(0, Math.min(sent, n(quantityOk)));
  const affected = Math.max(0, sent - ok);

  cycle.quantityAcknowledged = ok;
  cycle.quantityAffected = affected;
  cycle.status = CYCLE_ACKNOWLEDGED;
  cycle.acknowledgedAt = receivedAt || new Date();
  cycle.receiverName = receiverName || '';
  if (issueId) cycle.issue = issueId;

  dispatch.quantity = sent;
  dispatch.quantityReceived = ok;
  dispatch.receiverName = receiverName || dispatch.receiverName;
  dispatch.receivedAt = cycle.acknowledgedAt;
  dispatch.status = LIFECYCLE.COMPLETED;
  applyOrderTotals(dispatch);
  touchCycles(dispatch);
  return cycle;
}

function openReplacementCycle(dispatch, fields = {}) {
  const cycles = ensureCycleList(dispatch);
  const previous = currentCycle(dispatch);
  const quantity = n(fields.quantity);
  const consignmentNo = fields.consignmentNo || '';
  const nextNumber = (previous?.cycle || cycles.length) + 1;

  cycles.push({
    cycle: nextNumber,
    movementType: MOVEMENT_REPLACEMENT,
    status: CYCLE_OPEN,
    quantityDispatched: quantity,
    quantityAcknowledged: 0,
    quantityAffected: 0,
    kitId: fields.kitId || '',
    consignmentNo,
    category: fields.category || 'Lost Dispatch',
    dispatchedAt: fields.dispatchedAt || new Date(),
    dispatchedBy: fields.dispatchedBy,
    acknowledgedAt: null,
    receiverName: '',
    issue: fields.issueId || null,
  });

  dispatch.quantity = quantity;
  dispatch.kitId = fields.kitId || dispatch.kitId;
  dispatch.componentId = fields.kitId || dispatch.componentId;
  dispatch.consignmentNo = consignmentNo;
  dispatch.trackingId = consignmentNo;
  dispatch.category = fields.category || dispatch.category;
  dispatch.dispatchedAt = fields.dispatchedAt || new Date();
  dispatch.dispatchedBy = fields.dispatchedBy || dispatch.dispatchedBy;
  dispatch.quantityReceived = null;
  dispatch.receiverName = null;
  dispatch.receivedAt = null;
  dispatch.receiptNotes = null;
  dispatch.status = LIFECYCLE.DISPATCHED;

  if (consignmentNo) {
    pushTrackingHistory(dispatch, {
      consignmentNo,
      setAt: dispatch.dispatchedAt,
      setBy: fields.dispatchedBy || dispatch.dispatchedBy,
    });
  }

  applyOrderTotals(dispatch);
  touchCycles(dispatch);
  return currentCycle(dispatch);
}

function pushTrackingHistory(dispatch, { consignmentNo, setAt, setBy } = {}) {
  const value = String(consignmentNo || '').trim();
  if (!value) return dispatch;
  if (!Array.isArray(dispatch.trackingHistory)) dispatch.trackingHistory = [];
  const last = dispatch.trackingHistory[dispatch.trackingHistory.length - 1];
  if (last && last.consignmentNo === value) return dispatch;
  dispatch.trackingHistory.push({
    consignmentNo: value,
    setAt: setAt || new Date(),
    setBy: setBy || null,
  });
  if (typeof dispatch.markModified === 'function') dispatch.markModified('trackingHistory');
  return dispatch;
}

function snapshotClaim(issue) {
  return {
    issueType: issue.issueType,
    quantitySent: n(issue.quantitySent),
    quantityReceived: n(issue.quantityReceived),
    quantityAffected: n(issue.quantityAffected),
    remarks: issue.remarks || '',
    damageDescription: issue.damageDescription || '',
    severity: issue.severity || '',
    photoUrls: Array.isArray(issue.photoUrls) ? [...issue.photoUrls] : [],
    submittedAt: new Date(),
    submittedBy: issue.reportedBy || null,
  };
}

function ensureClaimHistory(issue) {
  if (!Array.isArray(issue.claimHistory) || issue.claimHistory.length === 0) {
    issue.claimHistory = [snapshotClaim(issue)];
  }
  return issue.claimHistory;
}

function appendClaimVersion(issue) {
  ensureClaimHistory(issue);
  issue.claimHistory.push(snapshotClaim(issue));
  if (typeof issue.markModified === 'function') issue.markModified('claimHistory');
  return issue;
}

function isIncomingLifecycle(status) {
  return INCOMING_LIFECYCLE_STATUSES.includes(status);
}

function isCompletedLifecycle(status) {
  return status === LIFECYCLE.COMPLETED || LEGACY_COMPLETED_STATUSES.has(status);
}

function mapLegacyLifecycle(dispatch) {
  const status = dispatch.status;
  if (status === LIFECYCLE.PENDING || status === LIFECYCLE.DISPATCHED || status === LIFECYCLE.COMPLETED) {
    return dispatch;
  }
  const issueStatuses = [
    'missing_dispatch',
    'damaged_dispatch',
    'mismatch_dispatch',
    'not_received_dispatch',
    'audit_lost_dispatch',
    'audit_damaged_dispatch',
  ];
  if (issueStatuses.includes(status)) {
    const receivedSet = dispatch.quantityReceived != null;
    const hasRedispatch = asArray(dispatch.redispatchCycles).length > 0;
    dispatch.status = hasRedispatch && !receivedSet ? LIFECYCLE.DISPATCHED : LIFECYCLE.COMPLETED;
    return dispatch;
  }
  if (LEGACY_COMPLETED_STATUSES.has(status)) {
    dispatch.status = LIFECYCLE.COMPLETED;
  }
  return dispatch;
}

function rebuildFromLegacyRedispatches(dispatch) {
  const snaps = asArray(dispatch.redispatchCycles);
  const liveQty = n(dispatch.quantity);
  const receivedSet = dispatch.quantityReceived != null;
  const liveReceived = n(dispatch.quantityReceived);
  const issueStatuses = [
    'missing_dispatch',
    'damaged_dispatch',
    'mismatch_dispatch',
    'not_received_dispatch',
    'audit_lost_dispatch',
    'audit_damaged_dispatch',
  ];
  const liveOpen = isIncomingLifecycle(dispatch.status)
    || (issueStatuses.includes(dispatch.status) && asArray(dispatch.redispatchCycles).length > 0 && !receivedSet);

  dispatch.cycles = snaps.map((snap, index) => {
    const dispatched = n(snap.quantity);
    const nextDispatched = index + 1 < snaps.length ? n(snaps[index + 1].quantity) : liveQty;
    const affected = Math.max(0, Math.min(dispatched, nextDispatched));
    const ok = Math.max(0, dispatched - affected);
    if (snap.consignmentNo) {
      pushTrackingHistory(dispatch, {
        consignmentNo: snap.consignmentNo,
        setAt: snap.authorizedAt || dispatch.createdAt,
      });
    }
    return {
      cycle: index + 1,
      movementType: index === 0 ? MOVEMENT_INITIAL : MOVEMENT_REPLACEMENT,
      status: CYCLE_ACKNOWLEDGED,
      quantityDispatched: dispatched,
      quantityAcknowledged: ok,
      quantityAffected: affected,
      kitId: snap.kitId || '',
      consignmentNo: snap.consignmentNo || '',
      category: snap.category || '',
      dispatchedAt: index === 0 ? (dispatch.createdAt || snap.authorizedAt) : snap.authorizedAt,
      dispatchedBy: snap.authorizedBy || dispatch.dispatchedBy,
      acknowledgedAt: snap.authorizedAt || null,
      receiverName: '',
      issue: snap.issue || null,
    };
  });

  const liveAck = liveOpen
    ? 0
    : (receivedSet ? liveReceived : liveQty);
  const liveAffected = liveOpen ? 0 : Math.max(0, liveQty - liveAck);
  dispatch.cycles.push({
    cycle: snaps.length + 1,
    movementType: snaps.length ? MOVEMENT_REPLACEMENT : MOVEMENT_INITIAL,
    status: liveOpen ? CYCLE_OPEN : CYCLE_ACKNOWLEDGED,
    quantityDispatched: liveQty,
    quantityAcknowledged: liveAck,
    quantityAffected: liveAffected,
    kitId: dispatch.kitId || '',
    consignmentNo: dispatch.consignmentNo || '',
    category: dispatch.category || '',
    dispatchedAt: dispatch.dispatchedAt || new Date(),
    dispatchedBy: dispatch.dispatchedBy,
    acknowledgedAt: liveOpen ? null : (dispatch.receivedAt || null),
    receiverName: dispatch.receiverName || '',
    issue: dispatch.receiptIssue || null,
  });

  if (dispatch.consignmentNo) {
    pushTrackingHistory(dispatch, {
      consignmentNo: dispatch.consignmentNo,
      setAt: dispatch.dispatchedAt || new Date(),
      setBy: dispatch.dispatchedBy,
    });
  }

  dispatch.status = liveOpen ? LIFECYCLE.DISPATCHED : LIFECYCLE.COMPLETED;
  applyOrderTotals(dispatch);
  touchCycles(dispatch);
  return dispatch;
}

function hydrateCyclesIfNeeded(dispatch) {
  if (dispatch.status === LIFECYCLE.PENDING) return dispatch;
  if (Array.isArray(dispatch.cycles) && dispatch.cycles.length > 0) {
    applyOrderTotals(dispatch);
    mapLegacyLifecycle(dispatch);
    return dispatch;
  }
  if (asArray(dispatch.redispatchCycles).length > 0) {
    rebuildFromLegacyRedispatches(dispatch);
    return dispatch;
  }
  const priorStatus = dispatch.status;
  const qty = n(dispatch.quantity);
  ensureInitialCycle(dispatch, {
    quantity: qty,
    kitId: dispatch.kitId,
    consignmentNo: dispatch.consignmentNo,
    category: dispatch.category,
    dispatchedAt: dispatch.dispatchedAt,
    dispatchedBy: dispatch.dispatchedBy,
  });
  if (priorStatus && !isIncomingLifecycle(priorStatus)) {
    const ok = Number.isFinite(Number(dispatch.quantityReceived))
      ? n(dispatch.quantityReceived)
      : (priorStatus === 'Delivery Completed' || priorStatus === LIFECYCLE.COMPLETED ? qty : 0);
    acknowledgeCurrentCycle(dispatch, {
      quantityOk: ok,
      receiverName: dispatch.receiverName,
      receivedAt: dispatch.receivedAt,
      issueId: dispatch.receiptIssue,
    });
  }
  mapLegacyLifecycle(dispatch);
  return dispatch;
}

function orderSnapshot(dispatch) {
  applyOrderTotals(dispatch);
  return {
    quantityInitial: n(dispatch.quantityInitial),
    quantityAcknowledged: n(dispatch.quantityAcknowledged),
    quantityAffected: n(dispatch.quantityAffected),
    quantityReplaced: n(dispatch.quantityReplaced),
    quantityDispatched: n(dispatch.quantityDispatched),
    outstandingQuantity: n(dispatch.outstandingQuantity),
    status: dispatch.status,
  };
}

module.exports = {
  LIFECYCLE,
  CYCLE_OPEN,
  CYCLE_ACKNOWLEDGED,
  MOVEMENT_INITIAL,
  MOVEMENT_REPLACEMENT,
  INCOMING_LIFECYCLE_STATUSES,
  currentCycle,
  applyOrderTotals,
  ensureInitialCycle,
  acknowledgeCurrentCycle,
  openReplacementCycle,
  pushTrackingHistory,
  snapshotClaim,
  ensureClaimHistory,
  appendClaimVersion,
  isIncomingLifecycle,
  isCompletedLifecycle,
  hydrateCyclesIfNeeded,
  rebuildFromLegacyRedispatches,
  orderSnapshot,
};
