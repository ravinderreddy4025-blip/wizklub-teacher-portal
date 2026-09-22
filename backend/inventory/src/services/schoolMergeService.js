const mongoose = require('mongoose');
const School = require('../models/School');
const Division = require('../models/Division');
const User = require('../models/User');
const Dispatch = require('../models/Dispatch');
const ReceiptIssue = require('../models/ReceiptIssue');
const ReplacementRequest = require('../models/ReplacementRequest');
const SchoolInventory = require('../models/SchoolInventory');
const AuditReport = require('../models/AuditReport');
const SchoolMergeLog = require('../models/SchoolMergeLog');
const { getDivisionManager } = require('../utils/divisionManager');
const { normalizeBranchName, formatSchoolDisplayName } = require('../utils/schoolName');
const { preserveSchoolLoginId } = require('../utils/schoolCode');
const { normalizeJoiningYear } = require('../utils/componentId');

const ACTIVE_DISPATCH_STATUSES = ['Pending', 'Dispatched'];

const WORKFLOW_RANK = {
  Rejected: 0,
  'Pending AM Approval': 1,
  'Pending Admin Approval': 2,
  Approved: 3,
};

function schoolSummary(school, division, am) {
  return {
    _id: school._id,
    name: school.name,
    code: school.code,
    wizklubSchoolId: school.wizklubSchoolId || null,
    joiningYear: school.joiningYear ?? null,
    division: division ? { _id: division._id, name: division.name } : null,
    accountManager: am ? { _id: am._id, name: am.name, email: am.email } : null,
  };
}

async function loadSchoolPair(primarySchoolId, secondarySchoolId) {
  if (!primarySchoolId || !secondarySchoolId) {
    const error = new Error('Primary and secondary school IDs are required');
    error.status = 400;
    throw error;
  }
  if (String(primarySchoolId) === String(secondarySchoolId)) {
    const error = new Error('Cannot merge a school with itself');
    error.status = 400;
    throw error;
  }

  const [primary, secondary] = await Promise.all([
    School.findById(primarySchoolId),
    School.findById(secondarySchoolId),
  ]);
  if (!primary || !secondary) {
    const error = new Error('One or both schools were not found');
    error.status = 404;
    throw error;
  }

  const divisionIds = [...new Set([primary.divisionId, secondary.divisionId].filter(Boolean))];
  const divisions = await Division.find({ _id: { $in: divisionIds } });
  const divisionMap = new Map(divisions.map((d) => [String(d._id), d]));

  const [primaryAm, secondaryAm] = await Promise.all([
    getDivisionManager(primary.divisionId),
    getDivisionManager(secondary.divisionId),
  ]);

  return {
    primary,
    secondary,
    primarySummary: schoolSummary(
      primary,
      divisionMap.get(String(primary.divisionId)),
      primaryAm,
    ),
    secondarySummary: schoolSummary(
      secondary,
      divisionMap.get(String(secondary.divisionId)),
      secondaryAm,
    ),
  };
}

async function findActiveDispatchConflicts(primaryId, secondaryId) {
  const [primaryActive, secondaryActive] = await Promise.all([
    Dispatch.find({ school: primaryId, status: { $in: ACTIVE_DISPATCH_STATUSES } })
      .select('consignmentNo kit')
      .lean(),
    Dispatch.find({ school: secondaryId, status: { $in: ACTIVE_DISPATCH_STATUSES } })
      .select('consignmentNo kit status consignmentNo')
      .lean(),
  ]);

  const primaryKeys = new Set(
    primaryActive
      .filter((row) => row.consignmentNo)
      .map((row) => `${row.consignmentNo}::${row.kit}`),
  );

  const conflicts = secondaryActive
    .filter((row) => row.consignmentNo && primaryKeys.has(`${row.consignmentNo}::${row.kit}`))
    .map((row) => ({
      consignmentNo: row.consignmentNo,
      kit: row.kit,
      message: `Active dispatch conflict on consignment ${row.consignmentNo}`,
    }));

  return conflicts;
}

async function findInventoryOverlaps(primaryId, secondaryId) {
  const [primaryRows, secondaryRows] = await Promise.all([
    SchoolInventory.find({ school: primaryId }).select('kit quantity').lean(),
    SchoolInventory.find({ school: secondaryId }).select('kit quantity').lean(),
  ]);
  const primaryKits = new Set(primaryRows.map((row) => String(row.kit)));
  return secondaryRows
    .filter((row) => primaryKits.has(String(row.kit)))
    .map((row) => ({ kit: row.kit, secondaryQuantity: row.quantity }));
}

async function findAuditMonthOverlaps(primaryId, secondaryId) {
  const [primaryMonths, secondaryMonths] = await Promise.all([
    AuditReport.find({ school: primaryId }).select('month').lean(),
    AuditReport.find({ school: secondaryId }).select('month').lean(),
  ]);
  const primarySet = new Set(primaryMonths.map((row) => row.month));
  return secondaryMonths
    .filter((row) => primarySet.has(row.month))
    .map((row) => row.month);
}

async function previewSchoolMerge({ primarySchoolId, secondarySchoolId }) {
  const { primary, secondary, primarySummary, secondarySummary } = await loadSchoolPair(
    primarySchoolId,
    secondarySchoolId,
  );

  const [
    dispatchCountPrimary,
    dispatchCountSecondary,
    receiptIssueCount,
    replacementCount,
    inventoryCount,
    auditCount,
    portalUsers,
    activeConflicts,
    inventoryOverlaps,
    auditMonthOverlaps,
  ] = await Promise.all([
    Dispatch.countDocuments({ school: primary._id }),
    Dispatch.countDocuments({ school: secondary._id }),
    ReceiptIssue.countDocuments({ school: secondary._id }),
    ReplacementRequest.countDocuments({ school: secondary._id }),
    SchoolInventory.countDocuments({ school: secondary._id }),
    AuditReport.countDocuments({ school: secondary._id }),
    User.countDocuments({ role: 'School', schoolId: { $in: [primary._id, secondary._id] } }),
    findActiveDispatchConflicts(primary._id, secondary._id),
    findInventoryOverlaps(primary._id, secondary._id),
    findAuditMonthOverlaps(primary._id, secondary._id),
  ]);

  const blockingConflicts = activeConflicts;

  return {
    primary: primarySummary,
    secondary: secondarySummary,
    counts: {
      dispatches: { primary: dispatchCountPrimary, secondary: dispatchCountSecondary, total: dispatchCountPrimary + dispatchCountSecondary },
      receiptIssues: receiptIssueCount,
      replacementRequests: replacementCount,
      inventoryRows: inventoryCount,
      auditReports: auditCount,
      portalUsers,
    },
    warnings: {
      inventoryOverlaps: inventoryOverlaps.length,
      auditMonthOverlaps,
    },
    blockingConflicts,
    canMerge: blockingConflicts.length === 0,
  };
}

function pickWorkflowStatus(a, b) {
  const rankA = WORKFLOW_RANK[a] ?? 0;
  const rankB = WORKFLOW_RANK[b] ?? 0;
  return rankA >= rankB ? a : b;
}

function mergeAuditItems(primaryItems, secondaryItems) {
  const byKit = new Map();
  for (const item of primaryItems) {
    byKit.set(String(item.kit), { ...item.toObject?.() || item });
  }
  for (const item of secondaryItems) {
    const key = String(item.kit);
    const existing = byKit.get(key);
    if (!existing) {
      byKit.set(key, { ...item.toObject?.() || item });
      continue;
    }
    const numericFields = [
      'availableQuantity', 'lostQuantity', 'damagedQuantity', 'warehouseQuantity',
      'expectedQuantity', 'dispatchedQuantity', 'replacementDeducted',
    ];
    for (const field of numericFields) {
      existing[field] = (existing[field] || 0) + (item[field] || 0);
    }
  }
  return [...byKit.values()];
}

async function applyFinalAm(finalDivisionId, finalAmId) {
  const division = await Division.findById(finalDivisionId);
  if (!division) {
    const error = new Error('Final division not found');
    error.status = 400;
    throw error;
  }

  if (finalAmId) {
    const am = await User.findById(finalAmId);
    if (!am || am.role !== 'AM') {
      const error = new Error('Final Account Manager not found');
      error.status = 400;
      throw error;
    }
    division.regionalManagerId = am._id;
    await division.save();
    await School.updateMany({ divisionId: division._id }, { $set: { rmId: am._id } });
    return am._id;
  }

  const manager = await getDivisionManager(finalDivisionId);
  return manager?._id || null;
}

async function assertIdentityAvailable(survivor, absorbed, { code, wizklubSchoolId }) {
  if (code && code !== survivor.code) {
    const codeOwner = await School.findOne({ code, _id: { $nin: [survivor._id, absorbed._id] } });
    if (codeOwner) {
      const error = new Error('School code is already in use');
      error.status = 400;
      throw error;
    }
  }
  if (wizklubSchoolId) {
    const portalOwner = await School.findOne({
      wizklubSchoolId,
      _id: { $nin: [survivor._id, absorbed._id] },
    });
    if (portalOwner) {
      const error = new Error('WizKlub portal ID is already in use');
      error.status = 400;
      throw error;
    }
  }
}

async function resolveIdentity(survivor, absorbed, identitySource, customIdentity = {}) {
  if (identitySource === 'secondary') {
    await assertIdentityAvailable(survivor, absorbed, {
      code: absorbed.code,
      wizklubSchoolId: absorbed.wizklubSchoolId,
    });
    survivor.name = absorbed.name;
    survivor.code = absorbed.code;
    survivor.wizklubSchoolId = absorbed.wizklubSchoolId || null;
    survivor.joiningYear = absorbed.joiningYear ?? null;
    return;
  }

  if (identitySource === 'custom') {
    const branchName = normalizeBranchName(customIdentity.name);
    if (!branchName) {
      const error = new Error('Branch name is required for custom identity');
      error.status = 400;
      throw error;
    }
    const nextCode = preserveSchoolLoginId(customIdentity.code);
    if (!nextCode.trim()) {
      const error = new Error('Unique school ID is required for custom identity');
      error.status = 400;
      throw error;
    }
    const codeOwner = await School.findOne({ code: nextCode, _id: { $nin: [survivor._id, absorbed._id] } });
    if (codeOwner) {
      const error = new Error('School code is already in use');
      error.status = 400;
      throw error;
    }
    survivor.name = branchName;
    survivor.code = nextCode;
    survivor.wizklubSchoolId = customIdentity.wizklubSchoolId
      ? String(customIdentity.wizklubSchoolId).trim()
      : null;
    if (customIdentity.joiningYear === null || customIdentity.joiningYear === '') {
      survivor.joiningYear = null;
    } else if (customIdentity.joiningYear !== undefined) {
      survivor.joiningYear = normalizeJoiningYear(customIdentity.joiningYear);
    }
  }
}

function withSession(query, session) {
  return session ? query.session(session) : query;
}

async function mergeSchoolInventory(primaryId, secondaryId, session) {
  const secondaryRows = await withSession(SchoolInventory.find({ school: secondaryId }), session);
  let merged = 0;

  for (const row of secondaryRows) {
    const primaryRow = await withSession(
      SchoolInventory.findOne({ school: primaryId, kit: row.kit }),
      session,
    );
    if (primaryRow) {
      primaryRow.quantity += row.quantity;
      await (session ? primaryRow.save({ session }) : primaryRow.save());
      await withSession(SchoolInventory.deleteOne({ _id: row._id }), session);
    } else {
      row.school = primaryId;
      await (session ? row.save({ session }) : row.save());
    }
    merged += 1;
  }

  return merged;
}

async function mergeAuditReports(primaryId, secondaryId, session) {
  const secondaryReports = await withSession(AuditReport.find({ school: secondaryId }), session);
  let merged = 0;

  for (const secondaryReport of secondaryReports) {
    const primaryReport = await withSession(
      AuditReport.findOne({ school: primaryId, month: secondaryReport.month }),
      session,
    );

    if (!primaryReport) {
      secondaryReport.school = primaryId;
      await (session ? secondaryReport.save({ session }) : secondaryReport.save());
      merged += 1;
      continue;
    }

    primaryReport.items = mergeAuditItems(primaryReport.items, secondaryReport.items);
    primaryReport.workflowStatus = pickWorkflowStatus(
      primaryReport.workflowStatus,
      secondaryReport.workflowStatus,
    );
    if (secondaryReport.status === 'Mismatch' || primaryReport.status === 'Mismatch') {
      primaryReport.status = 'Mismatch';
    }
    await (session ? primaryReport.save({ session }) : primaryReport.save());
    await withSession(AuditReport.deleteOne({ _id: secondaryReport._id }), session);
    merged += 1;
  }

  return merged;
}

async function runMergeSteps({
  primary,
  secondary,
  identitySource,
  customIdentity,
  finalDivisionId,
  finalAmId,
  performedBy,
  session,
}) {
  const conflicts = await findActiveDispatchConflicts(primary._id, secondary._id);
  if (conflicts.length) {
    const error = new Error('Cannot merge while active dispatch consignment conflicts exist');
    error.status = 400;
    error.details = conflicts;
    throw error;
  }

  const dispatchResult = await withSession(
    Dispatch.updateMany({ school: secondary._id }, { $set: { school: primary._id } }),
    session,
  );
  const receiptIssueResult = await withSession(
    ReceiptIssue.updateMany({ school: secondary._id }, { $set: { school: primary._id } }),
    session,
  );
  const replacementResult = await withSession(
    ReplacementRequest.updateMany({ school: secondary._id }, { $set: { school: primary._id } }),
    session,
  );

  const inventoryRows = await mergeSchoolInventory(primary._id, secondary._id, session);
  const auditReports = await mergeAuditReports(primary._id, secondary._id, session);

  const rmId = await applyFinalAm(finalDivisionId, finalAmId);

  await resolveIdentity(primary, secondary, identitySource, customIdentity);
  primary.divisionId = finalDivisionId;
  primary.rmId = rmId;
  await (session ? primary.save({ session }) : primary.save());

  const displayName = formatSchoolDisplayName(primary.name);
  const portalUpdate = User.updateOne(
    { role: 'School', schoolId: primary._id },
    { $set: { name: displayName } },
  );
  await (session ? portalUpdate.session(session) : portalUpdate);
  await withSession(User.deleteOne({ role: 'School', schoolId: secondary._id }), session);

  const mergeLogPayload = {
    survivorSchoolId: primary._id,
    absorbedSchoolId: secondary._id,
    absorbedSchoolSnapshot: {
      name: secondary.name,
      code: secondary.code,
      wizklubSchoolId: secondary.wizklubSchoolId || null,
      divisionId: secondary.divisionId,
    },
    identitySource,
    finalDivisionId,
    finalAmId: rmId,
    transferred: {
      dispatches: dispatchResult.modifiedCount,
      receiptIssues: receiptIssueResult.modifiedCount,
      replacementRequests: replacementResult.modifiedCount,
      inventoryRows,
      auditReports,
    },
    performedBy,
    performedAt: new Date(),
  };

  const mergeLog = session
    ? await SchoolMergeLog.create([mergeLogPayload], { session })
    : [await SchoolMergeLog.create(mergeLogPayload)];

  await withSession(School.findByIdAndDelete(secondary._id), session);

  return {
    school: primary,
    mergeLog: mergeLog[0],
    transferred: {
      dispatches: dispatchResult.modifiedCount,
      receiptIssues: receiptIssueResult.modifiedCount,
      replacementRequests: replacementResult.modifiedCount,
      inventoryRows,
      auditReports,
    },
  };
}

function shouldRunMergeWithoutTransaction(error) {
  const message = String(error?.message || '');
  return message.includes('Transaction numbers are only allowed on a replica set member')
    || message.includes('does not support retryable writes');
}

async function runMergeWithoutTransaction(args) {
  return runMergeSteps({ ...args, session: null });
}

async function mergeSchools({
  primarySchoolId,
  secondarySchoolId,
  identitySource = 'primary',
  customIdentity = {},
  finalDivisionId,
  finalAmId,
  performedBy,
}) {
  if (!finalDivisionId) {
    const error = new Error('Final division is required');
    error.status = 400;
    throw error;
  }

  if (!['primary', 'secondary', 'custom'].includes(identitySource)) {
    const error = new Error('Invalid identity source');
    error.status = 400;
    throw error;
  }

  const { primary, secondary } = await loadSchoolPair(primarySchoolId, secondarySchoolId);
  const mergeArgs = {
    primary,
    secondary,
    identitySource,
    customIdentity,
    finalDivisionId,
    finalAmId,
    performedBy,
  };

  let session;
  try {
    session = await mongoose.startSession();
  } catch (error) {
    if (shouldRunMergeWithoutTransaction(error)) {
      return runMergeWithoutTransaction(mergeArgs);
    }
    throw error;
  }

  try {
    session.startTransaction();
    const result = await runMergeSteps({ ...mergeArgs, session });
    await session.commitTransaction();
    return result;
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    if (shouldRunMergeWithoutTransaction(error)) {
      return runMergeWithoutTransaction(mergeArgs);
    }
    throw error;
  } finally {
    session.endSession();
  }
}

async function listMergeLogs({ limit = 50 } = {}) {
  return SchoolMergeLog.find()
    .sort({ performedAt: -1 })
    .limit(limit)
    .populate('survivorSchoolId', 'name code')
    .populate('absorbedSchoolSnapshot.divisionId', 'name')
    .populate('finalDivisionId', 'name')
    .populate('finalAmId', 'name email')
    .populate('performedBy', 'name email')
    .lean();
}

module.exports = {
  previewSchoolMerge,
  mergeSchools,
  listMergeLogs,
};
