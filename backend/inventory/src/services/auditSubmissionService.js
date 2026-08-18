const AuditReport = require('../models/AuditReport');
const Dispatch = require('../models/Dispatch');
const ReplacementRequest = require('../models/ReplacementRequest');
const schoolInventoryService = require('./schoolInventoryService');
const notificationService = require('./notificationService');
const { populateAuditRelations } = require('../utils/auditQuery');
const { auditMonthMatchValues } = require('../utils/auditMonth');
const {
  isAuditWindowOpen,
  getAuditWindowForSchool,
  resolveAuditWindowForSchool,
} = require('./auditService');
const { closeExpiredAuditWindows } = require('./auditCloseoutService');

const PENDING_AM = 'Pending AM Approval';
const PENDING_ADMIN = 'Pending Admin Approval';

const { fileUrl } = require('../utils/mediaUrl');

async function listAuditsForSchool(schoolId, { month } = {}) {
  await closeExpiredAuditWindows({ schoolIds: [schoolId], month });

  const filter = { school: schoolId };
  if (month) {
    const keys = auditMonthMatchValues(month);
    filter.month = keys.length > 1 ? { $in: keys } : keys[0];
  }

  const audits = await populateAuditRelations(
    AuditReport.find(filter)
  )
    .sort({ createdAt: -1 })
    .lean();

  return { audits };
}

async function getAuditFormForSchool(schoolId, month) {
  const resolved = await resolveAuditWindowForSchool(schoolId, month || null);
  const auditMonth = resolved.month;
  await closeExpiredAuditWindows({ schoolIds: [schoolId] });

  const stockRows = await schoolInventoryService.getStockMap(schoolId);
  const kits = stockRows
    .filter((row) => row.quantity > 0)
    .map((row) => ({
      kit: row.kit._id,
      name: row.kit.name || 'Kit',
      kitId: row.kit.kitId,
      warehouseQuantity: row.quantity,
    }));

  const monthKeys = auditMonthMatchValues(auditMonth);
  const existingAudit = await AuditReport.findOne({
    school: schoolId,
    month: monthKeys.length > 1 ? { $in: monthKeys } : auditMonth,
  })
    .populate('items.kit')
    .sort({ createdAt: -1 });

  return {
    kits,
    existingAudit,
    window: resolved.window,
    open: resolved.open,
    month: auditMonth,
  };
}

async function submitAudit(schoolId, submittedBy, month, items, files = []) {
  const windowOpen = await isAuditWindowOpen(schoolId, month);
  if (!windowOpen) {
    const window = await getAuditWindowForSchool(schoolId, month);
    if (!window) {
      throw new Error('No audit window has been scheduled for your division this month. Contact your administrator.');
    }
    throw new Error('Audit window is closed for your division. Submit only during the scheduled audit dates.');
  }

  const existing = await AuditReport.findOne({
    school: schoolId,
    month,
    workflowStatus: { $nin: ['Rejected'] },
  });
  if (existing) {
    throw new Error('An audit for this month has already been submitted.');
  }

  const stockRows = await schoolInventoryService.getStockMap(schoolId);
  const stockByKit = Object.fromEntries(
    stockRows.map((row) => [String(row.kit._id), row.quantity])
  );

  const filesByField = {};
  for (const file of files) {
    filesByField[file.fieldname] = file;
  }

  let status = 'Normal';
  const processedItems = await Promise.all(items.map(async (item, index) => {
    const kitId = String(item.kit);
    const warehouseQuantity = stockByKit[kitId] ?? 0;
    const available = Number(item.availableQuantity) || 0;
    const lost = Number(item.lostQuantity) || 0;
    const damaged = Number(item.damagedQuantity) || 0;
    const totalReported = available + lost + damaged;

    if (warehouseQuantity <= 0) {
      throw new Error(`Kit "${item.name || kitId}" is not in your warehouse inventory.`);
    }
    if (totalReported !== warehouseQuantity) {
      if (totalReported > warehouseQuantity) {
        throw new Error(
          `For "${item.name || 'kit'}", available (${available}) + lost (${lost}) + damaged (${damaged}) cannot exceed warehouse stock (${warehouseQuantity}).`
        );
      }
      throw new Error(
        `For "${item.name || 'kit'}", available (${available}) + lost (${lost}) + damaged (${damaged}) must equal warehouse stock (${warehouseQuantity}).`
      );
    }

    const lostFile = filesByField[`lostEvidence_${index}`];
    const damagedFile = filesByField[`damagedEvidence_${index}`];
    if (lost > 0 && !lostFile) {
      throw new Error(`Photo or video evidence is required for lost kits (${item.name || 'kit'}).`);
    }
    if (damaged > 0 && !damagedFile) {
      throw new Error(`Photo or video evidence is required for damaged kits (${item.name || 'kit'}).`);
    }

    const dispatches = await Dispatch.find({
      school: schoolId,
      kit: item.kit,
      status: { $in: ['Received', 'Delivery Completed', 'Received with Issues', 'Damage Under Review', 'Missing Item Under Review', 'Replacement Pending'] },
    });
    const totalDispatched = dispatches.reduce(
      (acc, curr) => acc + (curr.quantityReceived ?? curr.quantity),
      0
    );
    const replacements = await ReplacementRequest.find({ school: schoolId, kit: item.kit, status: 'Approved' });
    const totalReplacements = replacements.reduce((acc, curr) => acc + curr.quantity, 0);
    const expectedQuantity = totalDispatched - totalReplacements;

    if (available < expectedQuantity) {
      status = 'Mismatch';
      await notificationService.notifyMismatch(schoolId, item.kit, expectedQuantity, available);
    }

    return {
      kit: item.kit,
      availableQuantity: available,
      lostQuantity: lost,
      damagedQuantity: damaged,
      warehouseQuantity,
      dispatchedQuantity: totalDispatched,
      replacementDeducted: totalReplacements,
      expectedQuantity,
      lostEvidenceUrl: lostFile ? fileUrl(lostFile) : undefined,
      lostEvidenceMime: lostFile?.mimetype,
      damagedEvidenceUrl: damagedFile ? fileUrl(damagedFile) : undefined,
      damagedEvidenceMime: damagedFile?.mimetype,
    };
  }));

  if (!processedItems.length) {
    throw new Error('Add at least one kit from your warehouse to submit an audit.');
  }

  const hasLost = processedItems.some((item) => item.lostQuantity > 0);
  const hasDamaged = processedItems.some((item) => item.damagedQuantity > 0);

  const report = await AuditReport.create({
    school: schoolId,
    submittedBy,
    month,
    items: processedItems,
    status,
    workflowStatus: PENDING_AM,
    lostAmStatus: hasLost ? 'Pending' : 'None',
    damagedAmStatus: hasDamaged ? 'Pending' : 'None',
  });

  return report;
}

module.exports = {
  listAuditsForSchool,
  getAuditFormForSchool,
  submitAudit,
  PENDING_AM,
  PENDING_ADMIN,
};
