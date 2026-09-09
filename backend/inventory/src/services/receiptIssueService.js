const ReceiptIssue = require('../models/ReceiptIssue');
const Dispatch = require('../models/Dispatch');
const Kit = require('../models/Kit');
const School = require('../models/School');
const fs = require('fs');
const path = require('path');
const schoolInventoryService = require('./schoolInventoryService');
const { formatComponentId } = require('../utils/componentId');
const dispatchCycle = require('../utils/dispatchCycle');

const DEBUG_LOG = path.join(__dirname, '../../../debug-89ca70.log');

function debugLog(hypothesisId, location, message, data) {
  try {
    fs.appendFileSync(DEBUG_LOG, `${JSON.stringify({ sessionId: '89ca70', hypothesisId, location, message, data, timestamp: Date.now() })}\n`);
  } catch {
    // ignore
  }
}

const ISSUE_TYPES = ['Missing Product', 'Damaged Product', 'Quantity Mismatch', 'Shipment Not Received'];

const PENDING_AM = 'Pending AM Approval';
const PENDING_ADMIN = 'Pending Admin Approval';

const ISSUE_DISPATCH_STATUSES = {
  'Missing Product': 'missing_dispatch',
  'Damaged Product': 'damaged_dispatch',
  'Quantity Mismatch': 'mismatch_dispatch',
  'Shipment Not Received': 'not_received_dispatch',
};

function dispatchStatusForIssueType(issueType) {
  return ISSUE_DISPATCH_STATUSES[issueType] || 'Received with Issues';
}

function formatDispatchStatusLabel(status) {
  const labels = {
    missing_dispatch: 'Missing Dispatch',
    damaged_dispatch: 'Damaged Dispatch',
    mismatch_dispatch: 'Mismatch Dispatch',
    not_received_dispatch: 'Not Received Dispatch',
  };
  return labels[status] || status;
}

const ReplacementRequest = require('../models/ReplacementRequest');

const SCHOOL_EDITABLE_DISPATCH_STATUSES = [
  'Delivery Completed',
  'Received',
  'Not Received',
  'Received with Issues',
  'Damage Under Review',
  'Missing Item Under Review',
];

const LOCKED_ISSUE_STATUSES = ['Pending Admin Approval', 'Approved'];

const LOCKED_REPLACEMENT_STATUSES = ['Pending Admin Approval', 'Approved', 'Replacement Pending'];

const RESETTABLE_ISSUE_STATUSES = [
  PENDING_AM,
  'Clarification Requested',
  'Damage Under Review',
  'Missing Item Under Review',
  'Received with Issues',
];

function dispatchReceiptRef(dispatch) {
  return dispatch.dispatchId || String(dispatch._id);
}

async function getReceiptReplacementRequests(dispatch) {
  const ref = dispatchReceiptRef(dispatch);
  return ReplacementRequest.find({
    school: dispatch.school,
    reasonDetails: { $regex: `Dispatch ${ref} receipt`, $options: 'i' },
  });
}

function schoolCanEditDispatch(dispatch, activeIssues = []) {
  const issue = activeIssues.find((i) => i.status !== 'Rejected') || null;
  if (!issue) {
    return dispatch.status === 'Not Received' || dispatch.status === 'Dispatched';
  }
  if (LOCKED_ISSUE_STATUSES.includes(issue.status) || issue.status === 'Rejected') {
    return false;
  }
  return RESETTABLE_ISSUE_STATUSES.includes(issue.status);
}

async function resetDispatchReceiptForEdit(dispatch) {
  const issues = await ReceiptIssue.find({ dispatch: dispatch._id });
  const activeIssues = issues.filter((i) => i.status !== 'Rejected');

  if (!(schoolCanEditDispatch(dispatch, activeIssues))) {
    const err = new Error('This receipt can no longer be edited — it may be under AM or Admin review');
    err.statusCode = 400;
    throw err;
  }

  const prevReceived = dispatch.quantityReceived || 0;
  if (prevReceived > 0) {
    await schoolInventoryService.removeStock(
      dispatch.school,
      dispatch.kit._id || dispatch.kit,
      prevReceived,
    );
  }

  await ReceiptIssue.deleteMany({
    dispatch: dispatch._id,
    status: { $in: RESETTABLE_ISSUE_STATUSES },
  });

  const ref = dispatchReceiptRef(dispatch);
  await ReplacementRequest.deleteMany({
    school: dispatch.school,
    status: 'Pending AM Approval',
    reasonDetails: { $regex: `Dispatch ${ref} receipt`, $options: 'i' },
  });

  dispatch.status = 'Dispatched';
  dispatch.quantityReceived = null;
  dispatch.lostOnReceipt = 0;
  dispatch.damagedOnReceipt = 0;
  dispatch.damagedImageUrl = null;
  dispatch.deliveryPhotoUrl = null;
  dispatch.receiverName = null;
  dispatch.receivedAt = null;
  dispatch.receiptNotes = null;
  dispatch.receiptIssue = null;

  await dispatch.save();
  return dispatch;
}

function replacementCategory(issueType) {
  if (issueType === 'Damaged Product') return 'Damaged Dispatch';
  if (issueType === 'Quantity Mismatch') return 'Mismatch Dispatch';
  // Missing Product + Shipment Not Received
  return 'Lost Dispatch';
}

function isReplacementAwaitingAck(dispatch, issue) {
  if (!issue || issue.status !== 'Approved') return false;
  // Multi-cycle: after authorize, status is Dispatched awaiting school action.
  if (dispatch.status === 'Dispatched') return true;
  // Legacy rows still on *_dispatch after authorize.
  const expected = dispatchStatusForIssueType(issue.issueType);
  return dispatch.status === expected;
}

function nextIssueCycleForDispatch(existingIssues = []) {
  const maxCycle = existingIssues.reduce((max, issue) => {
    const n = Number(issue.cycle) || 0;
    return n > max ? n : max;
  }, 0);
  return maxCycle + 1;
}

async function repairStrayReplacementDispatch(issue) {
  if (!issue?.replacementDispatch || !issue?.dispatch) return null;
  const dispatchRef = String(issue.dispatch._id || issue.dispatch);
  const replacementRef = String(issue.replacementDispatch._id || issue.replacementDispatch);
  if (dispatchRef === replacementRef) return null;

  const original = await Dispatch.findById(dispatchRef);
  const stray = await Dispatch.findById(replacementRef);
  if (!original || !stray) return null;

  const qty = issue.quantityAffected || stray.quantity;
  original.quantity = qty;
  original.consignmentNo = stray.consignmentNo;
  original.status = 'Dispatched';
  original.category = stray.category || replacementCategory(issue.issueType);
  original.dispatchedAt = stray.dispatchedAt || original.dispatchedAt || new Date();
  original.dispatchedBy = stray.dispatchedBy || original.dispatchedBy;
  original.componentId = stray.componentId || original.componentId;
  if (stray.kitId && stray.kitId !== original.kitId) {
    if (!original.originalKitId && original.kitId) {
      original.originalKitId = original.kitId;
    }
    original.kitId = stray.kitId;
  } else if (stray.kitId) {
    original.kitId = stray.kitId;
  }
  original.parentDispatchRef = issue.sourceDispatchRef || original.dispatchId;
  original.receiptIssue = issue._id;
  await original.save();
  await Dispatch.deleteOne({ _id: stray._id });
  issue.replacementDispatch = original._id;
  await issue.save();
  debugLog('H1', 'receiptIssueService.js:repairStray', 'merged stray replacement into original', {
    dispatchId: original.dispatchId,
    consignmentNo: original.consignmentNo,
    quantity: original.quantity,
    status: original.status,
    deletedStrayId: replacementRef,
  });
  return original;
}

async function repairInPlaceApprovedIssues() {
  const issues = await ReceiptIssue.find({ status: 'Approved' });
  for (const issue of issues) {
    const dispatchRef = String(issue.dispatch?._id || issue.dispatch || '');
    const replacementRef = issue.replacementDispatch
      ? String(issue.replacementDispatch._id || issue.replacementDispatch)
      : '';
    if (!dispatchRef || dispatchRef !== replacementRef) continue;

    const original = await Dispatch.findById(dispatchRef);
    if (!original || original.status === 'Delivery Completed' || original.status === 'Completed') continue;

    const expectedStatus = dispatchStatusForIssueType(issue.issueType);
    const expectedCategory = replacementCategory(issue.issueType);
    let changed = false;

    // Multi-cycle: redispatched shipments await school on Dispatched (legacy kept *_dispatch).
    const desiredStatus = 'Dispatched';
    if (original.status !== desiredStatus && original.status === expectedStatus) {
      original.status = desiredStatus;
      changed = true;
    } else if (!['Dispatched', 'Delivery Completed', 'Received', 'Completed'].includes(original.status)
      && original.status !== expectedStatus) {
      original.status = desiredStatus;
      changed = true;
    }
    if (original.category !== expectedCategory) {
      original.category = expectedCategory;
      changed = true;
    }
    if (issue.originalKitId && !original.originalKitId) {
      original.originalKitId = issue.originalKitId;
      changed = true;
    }
    if (issue.originalCategory && !original.originalCategory) {
      original.originalCategory = issue.originalCategory;
      changed = true;
    }
    if (issue.consignmentNo && !original.originalConsignmentNo
      && issue.consignmentNo !== original.consignmentNo) {
      original.originalConsignmentNo = issue.consignmentNo;
      changed = true;
    }
    if (issue.amNotes && !issue.amApprovedAt) {
      issue.amApprovedAt = issue.updatedAt;
      await issue.save();
    }
    if (issue.adminNotes && !issue.adminApprovedAt && ['Approved', 'Resolved'].includes(issue.status)) {
      issue.adminApprovedAt = issue.updatedAt;
      await issue.save();
    }
    if (changed) {
      await original.save();
      debugLog('H6', 'receiptIssueService.js:repairInPlace', 'fixed in-place replacement metadata', {
        dispatchId: original.dispatchId,
        status: original.status,
        category: original.category,
      });
    }
  }
}

async function repairAllSplitReceiptIssues() {
  const issues = await ReceiptIssue.find({
    status: 'Approved',
    replacementDispatch: { $exists: true, $ne: null },
  });
  for (const issue of issues) {
    // eslint-disable-next-line no-await-in-loop
    await repairStrayReplacementDispatch(issue);
  }
  await repairInPlaceApprovedIssues();
}

async function createReceiptIssues({ issues, schoolId, reportedBy, receiverName, receivedAt }) {
  const dispatchIds = [...new Set(issues.map((i) => String(i.dispatch)).filter(Boolean))];
  const existingByDispatch = {};
  if (dispatchIds.length) {
    const existing = await ReceiptIssue.find({ dispatch: { $in: dispatchIds } }).select('dispatch cycle').lean();
    for (const row of existing) {
      const key = String(row.dispatch);
      if (!existingByDispatch[key]) existingByDispatch[key] = [];
      existingByDispatch[key].push(row);
    }
  }

  return ReceiptIssue.insertMany(issues.map((issue) => {
    const key = String(issue.dispatch);
    const cycle = issue.cycle || nextIssueCycleForDispatch(existingByDispatch[key] || []);
    if (!existingByDispatch[key]) existingByDispatch[key] = [];
    existingByDispatch[key].push({ cycle });
    return {
      ...issue,
      cycle,
      school: schoolId,
      reportedBy,
      receiverName,
      receivedAt,
      status: PENDING_AM,
      claimHistory: [dispatchCycle.snapshotClaim({
        ...issue,
        reportedBy,
      })],
    };
  }));
}

async function approveReceiptIssueByAm(issueId, amNotes) {
  const issue = await ReceiptIssue.findById(issueId);
  if (!issue) {
    const err = new Error('Receipt issue not found');
    err.statusCode = 404;
    throw err;
  }

  const eligible = [PENDING_AM, 'Damage Under Review', 'Missing Item Under Review', 'Received with Issues'];
  if (!eligible.includes(issue.status)) {
    const err = new Error('This issue is not pending AM approval');
    err.statusCode = 400;
    throw err;
  }

  issue.status = PENDING_ADMIN;
  issue.amNotes = amNotes;
  issue.amApprovedAt = new Date();
  await issue.save();
  return issue;
}

async function rejectReceiptIssue(issueId, notes, role = 'admin') {
  const issue = await ReceiptIssue.findById(issueId);
  if (!issue) {
    const err = new Error('Receipt issue not found');
    err.statusCode = 404;
    throw err;
  }

  issue.status = 'Rejected';
  if (role === 'am') issue.amNotes = notes;
  else issue.adminNotes = notes;
  await issue.save();
  const dispatch = await Dispatch.findById(issue.dispatch);
  if (dispatch) {
    dispatchCycle.hydrateCyclesIfNeeded(dispatch);
    dispatchCycle.applyOrderTotals(dispatch);
    await dispatch.save();
  }
  return issue;
}

async function requestClarification(issueId, adminNotes) {
  const issue = await ReceiptIssue.findById(issueId);
  if (!issue) {
    const err = new Error('Receipt issue not found');
    err.statusCode = 404;
    throw err;
  }

  issue.status = 'Clarification Requested';
  issue.adminNotes = adminNotes;
  await issue.save();
  return issue;
}

async function approveReceiptIssueByAdmin(issueId, { adminNotes } = {}) {
  debugLog('H1', 'receiptIssueService.js:approveReceiptIssueByAdmin:entry', 'approve without ship', { issueId });
  const issue = await ReceiptIssue.findById(issueId).populate('kit');
  if (!issue) {
    const err = new Error('Receipt issue not found');
    err.statusCode = 404;
    throw err;
  }

  if (issue.status !== PENDING_ADMIN) {
    const err = new Error('This issue is not pending admin approval');
    err.statusCode = 400;
    throw err;
  }

  const original = await Dispatch.findById(issue.dispatch);
  if (!original) {
    const err = new Error('Original dispatch not found');
    err.statusCode = 404;
    throw err;
  }

  const previousKitId = original.kitId || original.componentId || issue.originalKitId || '';
  const previousCategory = original.category || issue.originalCategory || 'New Dispatch';
  if (previousKitId && !original.originalKitId) original.originalKitId = previousKitId;
  if (!issue.originalKitId && previousKitId) issue.originalKitId = previousKitId;
  if (!original.originalCategory) original.originalCategory = previousCategory;
  if (!issue.originalCategory) issue.originalCategory = previousCategory;
  if (original.consignmentNo && !original.originalConsignmentNo) {
    original.originalConsignmentNo = original.consignmentNo;
  }

  dispatchCycle.hydrateCyclesIfNeeded(original);
  original.status = dispatchCycle.LIFECYCLE.COMPLETED;
  dispatchCycle.applyOrderTotals(original);
  await original.save();

  issue.status = 'Approved';
  issue.adminNotes = adminNotes;
  issue.adminApprovedAt = new Date();
  issue.replacementDispatch = original._id;
  await issue.save();

  debugLog('H1', 'receiptIssueService.js:approveReceiptIssueByAdmin:exit', 'approved, not shipped', {
    dispatchId: original.dispatchId,
    status: original.status,
    outstanding: original.outstandingQuantity,
  });

  return { issue, dispatch: original };
}

async function shipReceiptIssueReplacement(issueId, { consignmentNo, reportingManager, createdBy, adminNotes } = {}) {
  const issue = await ReceiptIssue.findById(issueId).populate('kit');
  if (!issue) {
    const err = new Error('Receipt issue not found');
    err.statusCode = 404;
    throw err;
  }
  if (issue.status !== 'Approved') {
    const err = new Error('Replacement is not approved for shipping');
    err.statusCode = 400;
    throw err;
  }

  const trimmedConsignment = consignmentNo?.trim() || '';
  if (!trimmedConsignment) {
    const err = new Error('Tracking ID (consignment no.) is required to ship a replacement');
    err.statusCode = 400;
    throw err;
  }

  const original = await Dispatch.findById(issue.dispatch);
  if (!original) {
    const err = new Error('Original dispatch not found');
    err.statusCode = 404;
    throw err;
  }

  dispatchCycle.hydrateCyclesIfNeeded(original);
  const live = dispatchCycle.currentCycle(original);
  if (live?.status === dispatchCycle.CYCLE_OPEN && live?.movementType === dispatchCycle.MOVEMENT_REPLACEMENT) {
    const err = new Error('A replacement cycle is already in transit for this dispatch');
    err.statusCode = 400;
    throw err;
  }

  const kitDoc = issue.kit?._id ? issue.kit : await Kit.findById(issue.kit);
  if (!kitDoc) {
    const err = new Error('Kit not found');
    err.statusCode = 404;
    throw err;
  }

  const qty = issue.quantityAffected;
  if ((kitDoc.warehouseQuantity || 0) < qty) {
    const err = new Error(
      `Insufficient warehouse stock for ${kitDoc.name}. Available: ${kitDoc.warehouseQuantity || 0}, requested: ${qty}`,
    );
    err.statusCode = 400;
    throw err;
  }

  const schoolDoc = await School.findById(issue.school);
  const now = new Date();
  const sourceRef = issue.sourceDispatchRef || original.dispatchId;
  const previousConsignment = original.consignmentNo;
  const previousQuantity = original.quantity;
  const previousKitId = original.kitId || original.componentId || issue.originalKitId || '';
  const previousCategory = original.category || issue.originalCategory || 'New Dispatch';

  const componentId = formatComponentId({
    schoolCode: schoolDoc?.code,
    joiningYear: schoolDoc?.joiningYear,
    kitId: kitDoc.kitId,
    quantity: qty,
  });

  const cycleNumber = Number(issue.cycle) || ((original.redispatchCycles?.length || 0) + 1);
  if (!Array.isArray(original.redispatchCycles)) original.redispatchCycles = [];
  original.redispatchCycles.push({
    cycle: cycleNumber,
    issue: issue._id,
    issueType: issue.issueType,
    quantity: previousQuantity,
    kitId: previousKitId || '',
    consignmentNo: previousConsignment || '',
    category: previousCategory,
    authorizedAt: now,
    authorizedBy: createdBy,
  });

  dispatchCycle.openReplacementCycle(original, {
    quantity: qty,
    kitId: componentId,
    consignmentNo: trimmedConsignment,
    category: replacementCategory(issue.issueType),
    dispatchedAt: now,
    dispatchedBy: createdBy,
    issueId: issue._id,
  });
  original.parentDispatchRef = sourceRef;
  original.lostOnReceipt = 0;
  original.damagedOnReceipt = 0;
  original.deliveryPhotoUrl = null;
  original.receiptIssue = issue._id;
  original.dispatchDetails = [
    `Replacement for ${issue.issueType} — ${qty} kit(s) under dispatch ${sourceRef} (cycle ${cycleNumber}).`,
    `Previous shipment: ${previousQuantity} kit(s), tracking ${previousConsignment || '—'}.`,
    adminNotes || issue.adminNotes || '',
  ].filter(Boolean).join(' ');

  if (reportingManager) original.reportingManager = reportingManager;

  original.markModified('redispatchCycles');
  original.markModified('cycles');
  await original.save();

  const kitBefore = await Kit.findById(kitDoc._id).select('warehouseQuantity name').lean();
  await Kit.findByIdAndUpdate(kitDoc._id, { $inc: { warehouseQuantity: -qty } });
  const kitAfter = await Kit.findById(kitDoc._id).select('warehouseQuantity').lean();

  issue.replacementDispatch = original._id;
  await issue.save();

  debugLog('H1', 'receiptIssueService.js:shipReceiptIssueReplacement', 'shipped', {
    dispatchId: original.dispatchId,
    status: original.status,
    consignmentNo: original.consignmentNo,
    qty,
    warehouseBefore: kitBefore?.warehouseQuantity,
    warehouseAfter: kitAfter?.warehouseQuantity,
  });

  return { issue, dispatch: original };
}

/** Close issue cycle when school confirms replacement dispatch received correctly. */
async function completeReplacementReceipt(dispatch) {
  if (!dispatch?.receiptIssue) return null;

  const issue = await ReceiptIssue.findById(dispatch.receiptIssue);
  if (!issue || issue.status !== 'Approved') return null;

  issue.status = 'Resolved';
  await issue.save();

  dispatchCycle.hydrateCyclesIfNeeded(dispatch);
  dispatch.status = dispatchCycle.LIFECYCLE.COMPLETED;
  dispatchCycle.applyOrderTotals(dispatch);
  await dispatch.save();

  return issue;
}

const ACTIVE_ISSUE_STATUSES = [
  PENDING_AM,
  PENDING_ADMIN,
  'Clarification Requested',
  'Approved',
  'Damage Under Review',
  'Missing Item Under Review',
  'Received with Issues',
  'Replacement Pending',
];

/** Attach receipt issues to dispatch rows for admin/AM/school list APIs. */
async function attachReceiptIssuesToDispatches(dispatches) {
  if (!dispatches?.length) return [];

  const dispatchIds = dispatches.map((d) => d._id || d);
  const receiptIssues = await ReceiptIssue.find({
    $or: [
      { dispatch: { $in: dispatchIds } },
      { replacementDispatch: { $in: dispatchIds } },
    ],
  }).populate('kit', 'name kitId').sort({ cycle: 1, createdAt: 1 });

  const issuesByDispatch = {};
  const orphanReplacementIds = new Set();

  for (const issue of receiptIssues) {
    const dispatchRef = issue.dispatch ? String(issue.dispatch._id || issue.dispatch) : '';
    const replacementRef = issue.replacementDispatch
      ? String(issue.replacementDispatch._id || issue.replacementDispatch)
      : '';
    if (dispatchRef && replacementRef && dispatchRef !== replacementRef) {
      orphanReplacementIds.add(replacementRef);
    }
    const key = String(issue.dispatch?._id || issue.dispatch);
    if (!key || key === 'undefined') continue;
    if (!issuesByDispatch[key]) issuesByDispatch[key] = [];
    issuesByDispatch[key].push(issue);
  }

  return dispatches
    .filter((d) => !orphanReplacementIds.has(String(d._id)))
    .map((d) => {
      const obj = typeof d.toObject === 'function' ? d.toObject() : { ...d };
      const dispatchIssues = issuesByDispatch[String(d._id)] || [];
      obj.receiptIssues = dispatchIssues;
      obj.receiptIssueHistory = dispatchIssues.filter((i) =>
        ['Resolved', 'Superseded', 'Rejected'].includes(i.status)
      );
      const linkedId = obj.receiptIssue ? String(obj.receiptIssue._id || obj.receiptIssue) : null;
      const linked = linkedId
        ? dispatchIssues.find((i) => String(i._id) === linkedId)
        : null;
      obj.receiptIssue = linked
        || dispatchIssues.find((i) => ACTIVE_ISSUE_STATUSES.includes(i.status))
        || dispatchIssues[dispatchIssues.length - 1]
        || null;
      return obj;
    });
}

/** @deprecated use approveReceiptIssueByAdmin */
async function approveReceiptIssue(issueId, adminNotes) {
  return approveReceiptIssueByAdmin(issueId, { adminNotes, consignmentNo: null });
}

module.exports = {
  ISSUE_TYPES,
  PENDING_AM,
  PENDING_ADMIN,
  ISSUE_DISPATCH_STATUSES,
  dispatchStatusForIssueType,
  formatDispatchStatusLabel,
  SCHOOL_EDITABLE_DISPATCH_STATUSES,
  schoolCanEditDispatch,
  resetDispatchReceiptForEdit,
  createReceiptIssues,
  approveReceiptIssueByAm,
  approveReceiptIssueByAdmin,
  shipReceiptIssueReplacement,
  approveReceiptIssue,
  rejectReceiptIssue,
  requestClarification,
  completeReplacementReceipt,
  repairAllSplitReceiptIssues,
  repairStrayReplacementDispatch,
  attachReceiptIssuesToDispatches,
  isReplacementAwaitingAck,
  nextIssueCycleForDispatch,
  debugLog,
};
