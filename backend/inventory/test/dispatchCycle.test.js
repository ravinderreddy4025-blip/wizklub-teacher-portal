const assert = require('assert');
const {
  LIFECYCLE,
  ensureInitialCycle,
  acknowledgeCurrentCycle,
  openReplacementCycle,
  applyOrderTotals,
  hydrateCyclesIfNeeded,
  orderSnapshot,
} = require('../src/utils/dispatchCycle');

function dispatchOf(qty) {
  return {
    quantity: qty,
    kitId: 'KIT-1',
    consignmentNo: 'T-1',
    category: 'New Dispatch',
    dispatchedAt: new Date(),
    cycles: [],
    trackingHistory: [],
  };
}

function assertSnap(dispatch, expected) {
  const snap = orderSnapshot(dispatch);
  assert.strictEqual(snap.quantityInitial, expected.initial, 'initial');
  assert.strictEqual(snap.quantityAcknowledged, expected.ack, 'ack');
  assert.strictEqual(snap.quantityAffected, expected.affected, 'affected');
  assert.strictEqual(snap.quantityReplaced, expected.replaced, 'replaced');
  assert.strictEqual(snap.outstandingQuantity, expected.outstanding, 'outstanding');
  if (expected.status) assert.strictEqual(snap.status, expected.status, 'status');
}

// All OK
{
  const d = dispatchOf(12);
  ensureInitialCycle(d, { quantity: 12, consignmentNo: 'T-1' });
  acknowledgeCurrentCycle(d, { quantityOk: 12 });
  assertSnap(d, { initial: 12, ack: 12, affected: 0, replaced: 0, outstanding: 0, status: LIFECYCLE.COMPLETED });
}

// Partial + pending
{
  const d = dispatchOf(12);
  ensureInitialCycle(d, { quantity: 12 });
  acknowledgeCurrentCycle(d, { quantityOk: 8, issueId: 'issue-1' });
  assertSnap(d, { initial: 12, ack: 8, affected: 4, replaced: 0, outstanding: 4, status: LIFECYCLE.COMPLETED });
}

// Partial + approved (quantities unchanged)
{
  const d = dispatchOf(12);
  ensureInitialCycle(d, { quantity: 12 });
  acknowledgeCurrentCycle(d, { quantityOk: 8, issueId: 'issue-1' });
  assertSnap(d, { initial: 12, ack: 8, affected: 4, replaced: 0, outstanding: 4 });
}

// Replacement dispatched
{
  const d = dispatchOf(12);
  ensureInitialCycle(d, { quantity: 12, consignmentNo: 'ABC' });
  acknowledgeCurrentCycle(d, { quantityOk: 8, issueId: 'issue-1' });
  openReplacementCycle(d, { quantity: 4, kitId: 'KIT-R', consignmentNo: 'XYZ', category: 'Mismatch Dispatch' });
  assertSnap(d, { initial: 12, ack: 8, affected: 4, replaced: 4, outstanding: 4, status: LIFECYCLE.DISPATCHED });
  assert.strictEqual(d.quantityDispatched, 16);
}

// Replacement received
{
  const d = dispatchOf(12);
  ensureInitialCycle(d, { quantity: 12 });
  acknowledgeCurrentCycle(d, { quantityOk: 8, issueId: 'issue-1' });
  openReplacementCycle(d, { quantity: 4, consignmentNo: 'XYZ' });
  acknowledgeCurrentCycle(d, { quantityOk: 4 });
  assertSnap(d, { initial: 12, ack: 12, affected: 4, replaced: 4, outstanding: 0, status: LIFECYCLE.COMPLETED });
}

// Issue rejected (quantities stay at partial ack)
{
  const d = dispatchOf(12);
  ensureInitialCycle(d, { quantity: 12 });
  acknowledgeCurrentCycle(d, { quantityOk: 8, issueId: 'issue-1' });
  applyOrderTotals(d);
  assertSnap(d, { initial: 12, ack: 8, affected: 4, replaced: 0, outstanding: 4, status: LIFECYCLE.COMPLETED });
}

// Replacement has new issue: 8+3 ack, 4+1 affected, outstanding 1
{
  const d = dispatchOf(12);
  ensureInitialCycle(d, { quantity: 12 });
  acknowledgeCurrentCycle(d, { quantityOk: 8, issueId: 'issue-1' });
  openReplacementCycle(d, { quantity: 4, consignmentNo: 'XYZ' });
  acknowledgeCurrentCycle(d, { quantityOk: 3, issueId: 'issue-2' });
  assertSnap(d, { initial: 12, ack: 11, affected: 5, replaced: 4, outstanding: 1, status: LIFECYCLE.COMPLETED });
}

// Ack never includes affected
{
  const d = dispatchOf(12);
  ensureInitialCycle(d, { quantity: 12 });
  acknowledgeCurrentCycle(d, { quantityOk: 8 });
  const cycle = d.cycles[0];
  assert.strictEqual(cycle.quantityAcknowledged, 8);
  assert.strictEqual(cycle.quantityAffected, 4);
  assert.notStrictEqual(cycle.quantityAcknowledged, cycle.quantityDispatched);
}

// Rebuild last matrix row from legacy redispatchCycles
{
  const d = {
    quantity: 4,
    quantityReceived: 3,
    status: 'mismatch_dispatch',
    kitId: 'KIT-R',
    consignmentNo: 'XYZ',
    receivedAt: new Date(),
    redispatchCycles: [{
      cycle: 1,
      quantity: 12,
      kitId: 'KIT-1',
      consignmentNo: 'ABC',
      category: 'New Dispatch',
      issueType: 'Quantity Mismatch',
      authorizedAt: new Date(),
    }],
    cycles: [],
    trackingHistory: [],
  };
  hydrateCyclesIfNeeded(d);
  assertSnap(d, { initial: 12, ack: 11, affected: 5, replaced: 4, outstanding: 1, status: LIFECYCLE.COMPLETED });
}

// Idempotent hydrate
{
  const d = dispatchOf(12);
  ensureInitialCycle(d, { quantity: 12 });
  acknowledgeCurrentCycle(d, { quantityOk: 12 });
  hydrateCyclesIfNeeded(d);
  hydrateCyclesIfNeeded(d);
  assert.strictEqual(d.cycles.length, 1);
  assertSnap(d, { initial: 12, ack: 12, affected: 0, replaced: 0, outstanding: 0, status: LIFECYCLE.COMPLETED });
}

console.log('dispatchCycle quantity matrix passed');
