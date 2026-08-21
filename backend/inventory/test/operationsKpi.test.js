const assert = require('assert');
const {
  addOutstandingOwnership,
  emptyOutstandingBreakdown,
  pendingAckKitsOnDispatch,
  isApprovedAwaitingShip,
  liveUnresolvedIssue,
  inventoryHealthFromOpenIssues,
  replacementInTransitKitsOnDispatch,
  openIssuesByTypeFromIssues,
  fulfillmentFromDispatches,
  periodFromMonthlySummary,
} = require('../src/utils/operationsKpi');
const {
  LIFECYCLE,
  ensureInitialCycle,
  acknowledgeCurrentCycle,
  openReplacementCycle,
} = require('../src/utils/dispatchCycle');
const { buildSchoolAttentionQueues, buildAdminAttentionQueues, buildAmAttentionQueues } = require('../src/services/operationsAttentionService');

{
  const d = {
    quantity: 12,
    kitId: 'KIT-1',
    consignmentNo: 'T-1',
    cycles: [],
    trackingHistory: [],
  };
  ensureInitialCycle(d, { quantity: 12 });
  acknowledgeCurrentCycle(d, { quantityOk: 8, issueId: 'i1' });
  const resolved = { _id: 'i1', status: 'Resolved', issueType: 'Quantity Mismatch', quantityAffected: 4 };
  const open = { _id: 'i2', status: 'Pending AM Approval', issueType: 'Damaged Product', quantityAffected: 1 };
  d.receiptIssue = 'i2';
  d.outstandingQuantity = 1;
  const breakdown = emptyOutstandingBreakdown();
  addOutstandingOwnership(breakdown, d, [resolved, open]);
  assert.strictEqual(breakdown.mismatch, 0, 'resolved mismatch must not count');
  assert.strictEqual(breakdown.damaged, 1);
  assert.strictEqual(liveUnresolvedIssue(d, [resolved, open]).issueType, 'Damaged Product');
}

{
  const d = {
    quantity: 12,
    kitId: 'KIT-1',
    consignmentNo: 'T-1',
    cycles: [],
    trackingHistory: [],
  };
  ensureInitialCycle(d, { quantity: 12 });
  acknowledgeCurrentCycle(d, { quantityOk: 8 });
  openReplacementCycle(d, { quantity: 4, consignmentNo: 'XYZ' });
  assert.strictEqual(d.status, LIFECYCLE.DISPATCHED);
  assert.strictEqual(pendingAckKitsOnDispatch(d), 4, 'only live cycle');
}

{
  const dispatch = {
    status: LIFECYCLE.COMPLETED,
    outstandingQuantity: 4,
    cycles: [{ movementType: 'INITIAL', status: 'ACKNOWLEDGED', quantityDispatched: 12, quantityAcknowledged: 8 }],
  };
  const issue = { status: 'Approved' };
  assert.strictEqual(isApprovedAwaitingShip(issue, dispatch), true);
  openReplacementCycle(dispatch, { quantity: 4, consignmentNo: 'SHIP' });
  assert.strictEqual(isApprovedAwaitingShip(issue, dispatch), false);
}

{
  const d = {
    quantity: 12,
    kitId: 'KIT-1',
    consignmentNo: 'T-1',
    cycles: [],
    trackingHistory: [],
  };
  ensureInitialCycle(d, { quantity: 12 });
  acknowledgeCurrentCycle(d, { quantityOk: 0 });
  assert.strictEqual(d.quantityAcknowledged, 0);
  assert.strictEqual(d.status, LIFECYCLE.COMPLETED);
}

console.log('operationsKpi ownership and live-cycle tests passed');

{
  const warehouse = { qty: 0 };
  const d = { quantity: 100, kitId: 'KIT-1', consignmentNo: 'T-1', cycles: [], trackingHistory: [] };
  ensureInitialCycle(d, { quantity: 100 });
  acknowledgeCurrentCycle(d, { quantityOk: 95, issueId: 'm1' });
  warehouse.qty += 95;
  const issue = { _id: 'm1', status: 'Pending AM Approval', issueType: 'Quantity Mismatch', quantityAffected: 5 };
  d.receiptIssue = 'm1';
  const breakdown = emptyOutstandingBreakdown();
  addOutstandingOwnership(breakdown, d, [issue]);
  assert.strictEqual(warehouse.qty, 95, 'current inventory is OK kits only');
  assert.strictEqual(d.outstandingQuantity, 5);
  assert.strictEqual(breakdown.mismatch, 5);
  assert.strictEqual(
    breakdown.notReceived + breakdown.lost + breakdown.mismatch + breakdown.damaged + breakdown.other,
    d.outstandingQuantity,
    'type breakdown cannot exceed outstanding',
  );
  const health = inventoryHealthFromOpenIssues([issue]);
  assert.strictEqual(health.mismatchKits, 5);
  assert.strictEqual(health.lostKits, 0);
}

{
  const warehouse = { qty: 0 };
  const d = { quantity: 5, kitId: 'KIT-1', consignmentNo: 'T-1', cycles: [], trackingHistory: [] };
  ensureInitialCycle(d, { quantity: 5 });
  acknowledgeCurrentCycle(d, { quantityOk: 0, issueId: 'nr1' });
  const issue = { _id: 'nr1', status: 'Pending AM Approval', issueType: 'Shipment Not Received', quantityAffected: 5 };
  d.receiptIssue = 'nr1';
  const breakdown = emptyOutstandingBreakdown();
  addOutstandingOwnership(breakdown, d, [issue]);
  assert.strictEqual(warehouse.qty, 0, 'not received never enters warehouse');
  assert.strictEqual(d.outstandingQuantity, 5);
  assert.strictEqual(breakdown.notReceived, 5);
  const health = inventoryHealthFromOpenIssues([issue]);
  assert.strictEqual(health.lostKits + health.damagedKits + health.mismatchKits, 0, 'not received is not inventory health');
}

{
  const warehouse = { qty: 0 };
  const d = { quantity: 12, kitId: 'KIT-1', consignmentNo: 'T-1', cycles: [], trackingHistory: [] };
  ensureInitialCycle(d, { quantity: 12 });
  acknowledgeCurrentCycle(d, { quantityOk: 9, issueId: 'lost1' });
  warehouse.qty += 9;
  const issue = { _id: 'lost1', status: 'Approved', issueType: 'Missing Product', quantityAffected: 3 };
  d.receiptIssue = 'lost1';
  assert.strictEqual(d.outstandingQuantity, 3);
  assert.strictEqual(warehouse.qty, 9);
  openReplacementCycle(d, { quantity: 3, consignmentNo: 'REPL' });
  assert.strictEqual(replacementInTransitKitsOnDispatch(d), 3);
  acknowledgeCurrentCycle(d, { quantityOk: 3 });
  warehouse.qty += 3;
  assert.strictEqual(d.outstandingQuantity, 0);
  assert.strictEqual(d.quantityAffected, 3, 'affected stays historical');
  assert.strictEqual(warehouse.qty, 12);
}

{
  const schoolQueues = buildSchoolAttentionQueues({
    pendingAck: [{ at: new Date() }],
    clarification: [{ at: new Date() }, { at: new Date() }],
    auditsDue: [],
  });
  const ids = schoolQueues.map((q) => q.id);
  assert.deepStrictEqual(ids, ['pendingAck', 'clarification', 'auditDue']);
  assert.ok(schoolQueues.every((q) => String(q.href).startsWith('/school/')));
  assert.strictEqual(schoolQueues.find((q) => q.id === 'clarification').count, 2);

  const adminQueues = buildAdminAttentionQueues({
    pendingAm: [{ at: new Date() }],
    pendingAdmin: [{ at: new Date() }],
    clarification: [{ at: new Date() }],
    toShip: [{ at: new Date() }],
    pendingAck: [{ at: new Date() }],
    missingTracking: [{ at: new Date() }],
    auditsOverdue: [],
  });
  const adminIds = adminQueues.map((q) => q.id);
  assert.ok(adminIds.includes('pendingAdmin'));
  assert.ok(adminIds.includes('approvedToShip'));
  assert.ok(!ids.includes('pendingAdmin'));
  assert.ok(!ids.includes('approvedToShip'));
  assert.ok(!ids.includes('missingTracking'));
}

console.log('school inventory / outstanding / attention smoke tests passed');

{
  const byType = openIssuesByTypeFromIssues([
    { status: 'Pending AM Approval', issueType: 'Shipment Not Received', quantityAffected: 5 },
    { status: 'Pending AM Approval', issueType: 'Missing Product', quantityAffected: 3 },
    { status: 'Resolved', issueType: 'Quantity Mismatch', quantityAffected: 9 },
  ]);
  assert.strictEqual(byType.notReceivedKits, 5);
  assert.strictEqual(byType.lostKits, 3);
  assert.strictEqual(byType.mismatchKits, 0, 'resolved mismatch is not an open issue');
  const outstanding = 21;
  assert.notStrictEqual(
    byType.mismatchKits + byType.notReceivedKits + byType.damagedKits + byType.lostKits,
    outstanding,
    'open-issue types are not Outstanding',
  );
}

{
  const augStart = new Date(2026, 7, 1, 0, 0, 0, 0);
  const augEnd = new Date(2026, 8, 0, 23, 59, 59, 999);
  const augustInitial = {
    outstandingQuantity: 0,
    cycles: [
      { movementType: 'INITIAL', dispatchedAt: new Date(2026, 7, 10) },
      { movementType: 'REPLACEMENT', dispatchedAt: new Date(2026, 8, 5) },
    ],
  };
  const august = fulfillmentFromDispatches([augustInitial], augStart, augEnd);
  assert.strictEqual(august.eligibleDsps, 1);
  assert.strictEqual(august.fulfilledDsps, 1);

  const julyInitial = {
    outstandingQuantity: 0,
    cycles: [
      { movementType: 'INITIAL', dispatchedAt: new Date(2026, 6, 12) },
      { movementType: 'REPLACEMENT', dispatchedAt: new Date(2026, 7, 8) },
    ],
  };
  const julyInAugust = fulfillmentFromDispatches([julyInitial], augStart, augEnd);
  assert.strictEqual(julyInAugust.eligibleDsps, 0, 'July INITIAL is not an August eligible DSP');
  assert.strictEqual(julyInAugust.fulfilledDsps, 0);
}

{
  const amQueues = buildAmAttentionQueues({
    pendingAm: [{ at: new Date(), kitsAffected: 4 }, { at: new Date(), kitsAffected: 7 }],
    clarification: [{ at: new Date() }],
    auditsAttention: [{ at: new Date() }],
  });
  const ids = amQueues.map((q) => q.id);
  assert.deepStrictEqual(ids, ['pendingAm', 'clarification', 'auditsAttention']);
  assert.ok(amQueues.every((q) => String(q.href).startsWith('/am/')));
  assert.strictEqual(amQueues.find((q) => q.id === 'pendingAm').kitsAffected, 11);
  assert.ok(!ids.includes('pendingAdmin'));
  assert.ok(!ids.includes('approvedToShip'));
  assert.ok(!ids.includes('missingTracking'));
}

{
  const period = periodFromMonthlySummary({
    sentKits: 10,
    acknowledgedKits: 8,
    replacedKits: 2,
    scheduledKits: 12,
    rejectedKits: 1,
  });
  assert.strictEqual(period.shippedKits, 10);
  assert.strictEqual(period.scheduledKits, 12);
  assert.strictEqual(period.rejectedKits, 1);
}

console.log('AM operations KPI tests passed');

