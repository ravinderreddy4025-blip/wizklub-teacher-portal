const AuditReport = require('../models/AuditReport');
const Dispatch = require('../models/Dispatch');
const School = require('../models/School');
const Kit = require('../models/Kit');
const { generateUniqueDispatchId } = require('../utils/dispatchId');
const { formatComponentId } = require('../utils/componentId');
const { getDivisionManager } = require('../utils/divisionManager');
const notificationService = require('./notificationService');

const PENDING_AM = 'Pending AM Approval';
const PENDING_ADMIN = 'Pending Admin Approval';

function hasLineQuantity(audit, lineType) {
  return (audit.items || []).some((item) =>
    lineType === 'lost' ? item.lostQuantity > 0 : item.damagedQuantity > 0
  );
}

/** Resolve AM line status with legacy fallback for audits created before split approval. */
function getLineAmStatus(audit, lineType) {
  const key = lineType === 'lost' ? 'lostAmStatus' : 'damagedAmStatus';
  const stored = audit[key];
  if (stored && stored !== 'None') return stored;
  if (stored === 'None') {
    // None is only valid when that line type has no qty.
    if (!hasLineQuantity(audit, lineType)) return 'None';
  }
  if (!hasLineQuantity(audit, lineType)) return 'None';

  // Legacy audits: whole-report workflow implies both line types share that state.
  if (audit.workflowStatus === PENDING_AM) return 'Pending';
  if (audit.workflowStatus === 'Rejected') return 'Rejected';
  return 'Approved';
}

function syncWorkflowAfterLineAmDecision(audit) {
  const lost = getLineAmStatus(audit, 'lost');
  const damaged = getLineAmStatus(audit, 'damaged');
  const statuses = [lost, damaged].filter((s) => s !== 'None');

  if (!statuses.length) {
    // No replacement lines — whole-audit AM path.
    return;
  }

  if (statuses.some((s) => s === 'Pending')) {
    if (audit.workflowStatus === PENDING_AM || audit.workflowStatus === PENDING_ADMIN) {
      audit.workflowStatus = PENDING_AM;
    }
    return;
  }

  if (statuses.every((s) => s === 'Rejected')) {
    audit.workflowStatus = 'Rejected';
    return;
  }

  // At least one Approved, none Pending.
  if (audit.workflowStatus === PENDING_AM || audit.workflowStatus === 'Rejected') {
    audit.workflowStatus = PENDING_ADMIN;
  }
}

async function assertAuditInDivision(audit, divisionIdOrIds) {
  const school = await School.findById(audit.school);
  const allowed = Array.isArray(divisionIdOrIds) ? divisionIdOrIds : [divisionIdOrIds];
  if (!school || !allowed.some((id) => String(school.divisionId) === String(id))) {
    const error = new Error('Audit is not in your division');
    error.status = 403;
    throw error;
  }
}

async function approveAuditByAm(auditId, amUserId, amNotes = '', lineType = null) {
  const audit = await AuditReport.findById(auditId);
  if (!audit) {
    const error = new Error('Audit report not found');
    error.status = 404;
    throw error;
  }

  const hasLost = hasLineQuantity(audit, 'lost');
  const hasDamaged = hasLineQuantity(audit, 'damaged');

  // Whole-audit approve (Audits page / no replacement split).
  if (!lineType) {
    if (audit.workflowStatus !== PENDING_AM) {
      throw new Error('Audit is not pending AM approval');
    }
    if (hasLost) audit.lostAmStatus = 'Approved';
    if (hasDamaged) audit.damagedAmStatus = 'Approved';
    if (!hasLost) audit.lostAmStatus = 'None';
    if (!hasDamaged) audit.damagedAmStatus = 'None';
    audit.workflowStatus = PENDING_ADMIN;
    audit.amNotes = amNotes;
    audit.amApprovedBy = amUserId;
    audit.amApprovedAt = new Date();
    await audit.save();
    return audit;
  }

  if (!['lost', 'damaged'].includes(lineType)) {
    throw new Error('lineType must be lost or damaged');
  }
  if (!hasLineQuantity(audit, lineType)) {
    throw new Error(`This audit has no ${lineType} kits to approve`);
  }

  const current = getLineAmStatus(audit, lineType);
  if (current !== 'Pending') {
    throw new Error(
      current === 'Approved'
        ? `The ${lineType} lines for this audit were already approved`
        : `The ${lineType} lines for this audit cannot be approved (status: ${current})`
    );
  }

  // Materialize both statuses so legacy audits don't treat the sibling as whole-report Approved.
  const siblingType = lineType === 'lost' ? 'damaged' : 'lost';
  const siblingStatus = getLineAmStatus(audit, siblingType);
  if (lineType === 'lost') {
    audit.lostAmStatus = 'Approved';
    if (hasDamaged) audit.damagedAmStatus = siblingStatus === 'None' ? 'Pending' : siblingStatus;
    else audit.damagedAmStatus = 'None';
  } else {
    audit.damagedAmStatus = 'Approved';
    if (hasLost) audit.lostAmStatus = siblingStatus === 'None' ? 'Pending' : siblingStatus;
    else audit.lostAmStatus = 'None';
  }

  syncWorkflowAfterLineAmDecision(audit);
  if (amNotes) {
    const label = lineType === 'lost' ? 'Lost' : 'Damaged';
    const prior = audit.amNotes ? `${audit.amNotes}\n` : '';
    audit.amNotes = `${prior}[${label}] ${amNotes}`.trim();
  }
  audit.amApprovedBy = amUserId;
  audit.amApprovedAt = new Date();
  await audit.save();
  return audit;
}

async function rejectAuditByAm(auditId, amUserId, amNotes = '', lineType = null) {
  const audit = await AuditReport.findById(auditId);
  if (!audit) {
    const error = new Error('Audit report not found');
    error.status = 404;
    throw error;
  }

  const hasLost = hasLineQuantity(audit, 'lost');
  const hasDamaged = hasLineQuantity(audit, 'damaged');

  if (!lineType) {
    if (audit.workflowStatus !== PENDING_AM) {
      throw new Error('Audit is not pending AM approval');
    }
    if (hasLost) audit.lostAmStatus = 'Rejected';
    if (hasDamaged) audit.damagedAmStatus = 'Rejected';
    audit.workflowStatus = 'Rejected';
    audit.amNotes = amNotes;
    audit.amApprovedBy = amUserId;
    audit.amApprovedAt = new Date();
    await audit.save();
    return audit;
  }

  if (!['lost', 'damaged'].includes(lineType)) {
    throw new Error('lineType must be lost or damaged');
  }
  if (!hasLineQuantity(audit, lineType)) {
    throw new Error(`This audit has no ${lineType} kits to reject`);
  }

  const current = getLineAmStatus(audit, lineType);
  if (current !== 'Pending') {
    throw new Error(
      current === 'Rejected'
        ? `The ${lineType} lines for this audit were already rejected`
        : `The ${lineType} lines for this audit cannot be rejected (status: ${current})`
    );
  }

  const siblingType = lineType === 'lost' ? 'damaged' : 'lost';
  const siblingStatus = getLineAmStatus(audit, siblingType);
  if (lineType === 'lost') {
    audit.lostAmStatus = 'Rejected';
    if (hasDamaged) audit.damagedAmStatus = siblingStatus === 'None' ? 'Pending' : siblingStatus;
    else audit.damagedAmStatus = 'None';
  } else {
    audit.damagedAmStatus = 'Rejected';
    if (hasLost) audit.lostAmStatus = siblingStatus === 'None' ? 'Pending' : siblingStatus;
    else audit.lostAmStatus = 'None';
  }

  syncWorkflowAfterLineAmDecision(audit);
  if (amNotes) {
    const label = lineType === 'lost' ? 'Lost' : 'Damaged';
    const prior = audit.amNotes ? `${audit.amNotes}\n` : '';
    audit.amNotes = `${prior}[${label} rejected] ${amNotes}`.trim();
  }
  audit.amApprovedBy = amUserId;
  audit.amApprovedAt = new Date();
  await audit.save();
  return audit;
}

async function approveAuditByAdmin(auditId, adminUserId, adminNotes = '') {
  const audit = await AuditReport.findById(auditId).populate('items.kit');
  if (!audit) {
    const error = new Error('Audit report not found');
    error.status = 404;
    throw error;
  }
  if (audit.workflowStatus !== PENDING_ADMIN) {
    throw new Error('Audit is not pending admin approval');
  }

  for (const item of audit.items) {
    const SchoolInventory = require('../models/SchoolInventory');
    await SchoolInventory.findOneAndUpdate(
      { school: audit.school, kit: item.kit._id || item.kit },
      { $set: { quantity: item.availableQuantity } },
      { upsert: true }
    );
  }

  audit.workflowStatus = 'Approved';
  audit.adminNotes = adminNotes;
  audit.adminApprovedBy = adminUserId;
  audit.adminApprovedAt = new Date();
  await audit.save();
  return audit;
}

async function rejectAuditByAdmin(auditId, adminUserId, adminNotes = '') {
  const audit = await AuditReport.findById(auditId);
  if (!audit) {
    const error = new Error('Audit report not found');
    error.status = 404;
    throw error;
  }
  if (audit.workflowStatus !== PENDING_ADMIN) {
    throw new Error('Audit is not pending admin approval');
  }

  audit.workflowStatus = 'Rejected';
  audit.adminNotes = adminNotes;
  audit.adminApprovedBy = adminUserId;
  audit.adminApprovedAt = new Date();
  await audit.save();
  return audit;
}

function auditReplacementQuantity(item, type) {
  const qty = type === 'lost' ? item.lostQuantity : item.damagedQuantity;
  return Math.max(0, Number(qty) || 0);
}

async function dispatchAuditReplacement(auditId, itemIndex, type, adminUserId, options = {}) {
  const audit = await AuditReport.findById(auditId);
  if (!audit) {
    const error = new Error('Audit report not found');
    error.status = 404;
    throw error;
  }
  if (audit.workflowStatus !== 'Approved') {
    throw new Error('Audit must be approved before dispatching replacements');
  }

  const item = audit.items[itemIndex];
  if (!item) {
    throw new Error('Invalid audit line item');
  }

  const isLost = type === 'lost';
  const lineAmStatus = getLineAmStatus(audit, type);
  if (lineAmStatus === 'Rejected') {
    throw new Error(`Cannot dispatch ${type} kits — AM rejected this line type`);
  }
  if (lineAmStatus === 'Pending') {
    throw new Error(`Cannot dispatch ${type} kits — still pending AM approval`);
  }

  const dispatchQuantity = auditReplacementQuantity(item, type);
  if (!dispatchQuantity || dispatchQuantity < 1) {
    throw new Error(`No ${type} quantity to dispatch for this kit`);
  }

  if (isLost && item.lostDispatch) {
    throw new Error('Lost kits for this line have already been dispatched');
  }
  if (!isLost && item.damagedDispatch) {
    throw new Error('Damaged kits for this line have already been dispatched');
  }

  if (!options.consignmentNo?.trim()) {
    throw new Error('Shipment consignment number is required');
  }

  const [schoolDoc, kitDoc] = await Promise.all([
    School.findById(audit.school),
    Kit.findById(item.kit),
  ]);
  if (!schoolDoc) {
    throw new Error('School not found');
  }
  if (!kitDoc) {
    throw new Error('Kit not found');
  }
  if ((kitDoc.warehouseQuantity || 0) < dispatchQuantity) {
    throw new Error(
      `Insufficient warehouse stock for ${kitDoc.name}. Available: ${kitDoc.warehouseQuantity || 0}, requested: ${dispatchQuantity}`
    );
  }

  let reportingManager = options.reportingManager;
  if (!reportingManager) {
    const am = await getDivisionManager(schoolDoc.divisionId);
    reportingManager = am?._id;
  }
  if (!reportingManager) {
    throw new Error('No Account Manager assigned to this school division. Assign an AM before dispatching.');
  }

  // Component ID range reflects replacement units only (lost/damaged), not audit available/warehouse qty.
  const componentId = formatComponentId({
    schoolCode: schoolDoc.code,
    schoolId: schoolDoc._id,
    kitId: kitDoc.kitId,
    quantity: dispatchQuantity,
  });

  const dispatchId = await generateUniqueDispatchId();
  const now = new Date();
  const category = isLost ? 'Audit Lost Dispatch' : 'Audit Damaged Dispatch';
  const status = 'Dispatched';

  const dispatch = await Dispatch.create({
    kit: item.kit,
    quantity: dispatchQuantity,
    school: audit.school,
    reportingManager,
    dispatchDetails: options.dispatchDetails || `Monthly audit ${audit.month} — ${type} kit replacement`,
    kitId: componentId,
    componentId,
    consignmentNo: options.consignmentNo.trim(),
    category,
    status,
    dispatchedAt: now,
    dispatchedBy: adminUserId,
    dispatchId,
    createdBy: adminUserId,
    auditReport: audit._id,
    dispatchProofUrl: options.dispatchProofUrl,
  });

  kitDoc.warehouseQuantity = Math.max(0, (kitDoc.warehouseQuantity || 0) - dispatchQuantity);
  await kitDoc.save();

  if (isLost) {
    audit.items[itemIndex].lostDispatch = dispatch._id;
  } else {
    audit.items[itemIndex].damagedDispatch = dispatch._id;
  }
  audit.markModified('items');
  await audit.save();

  try {
    await notificationService.notifyDispatchCreated(dispatch);
  } catch {
    // non-blocking
  }

  return { audit, dispatch };
}

module.exports = {
  assertAuditInDivision,
  approveAuditByAm,
  rejectAuditByAm,
  approveAuditByAdmin,
  rejectAuditByAdmin,
  dispatchAuditReplacement,
  getLineAmStatus,
  hasLineQuantity,
  PENDING_AM,
  PENDING_ADMIN,
};
