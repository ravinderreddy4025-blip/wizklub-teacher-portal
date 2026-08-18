/**
 * After the official audit window end date, schools that did not submit
 * are treated as having confirmed every kit intact and exact:
 * available = warehouse, lost = 0, damaged = 0, status Normal.
 */
const AuditReport = require('../models/AuditReport');
const School = require('../models/School');
const DivisionAuditWindow = require('../models/DivisionAuditWindow');
const schoolInventoryService = require('./schoolInventoryService');
const { isAuditWindowExpired } = require('./auditService');
const { auditMonthMatchValues } = require('../utils/auditMonth');

const ASSUMED_INTACT_NOTE =
  'Official audit window ended with no school submission. All kits treated as intact and exact.';

async function buildIntactItems(schoolId) {
  const stockRows = await schoolInventoryService.getStockMap(schoolId);
  return stockRows
    .filter((row) => row.kit && (row.quantity || 0) > 0)
    .map((row) => {
      const qty = row.quantity || 0;
      return {
        kit: row.kit._id,
        availableQuantity: qty,
        lostQuantity: 0,
        damagedQuantity: 0,
        warehouseQuantity: qty,
        expectedQuantity: qty,
        dispatchedQuantity: qty,
        replacementDeducted: 0,
      };
    });
}

async function closeExpiredAuditWindows({ schoolIds, month } = {}) {
  const now = new Date();
  const monthKeys = month ? auditMonthMatchValues(month) : [];

  const schoolQuery = {};
  if (schoolIds?.length) schoolQuery._id = { $in: schoolIds };

  const schools = await School.find(schoolQuery).select('_id divisionId').lean();
  if (!schools.length) return { created: 0 };

  const divisionIds = [...new Set(schools.map((s) => s.divisionId).filter(Boolean))];
  if (!divisionIds.length) return { created: 0 };

  const windowQuery = {
    divisionId: { $in: divisionIds },
    endDate: { $lte: now },
  };
  if (monthKeys.length) windowQuery.auditMonth = { $in: monthKeys };

  const windows = (await DivisionAuditWindow.find(windowQuery).lean())
    .filter((window) => isAuditWindowExpired(window, now));
  if (!windows.length) return { created: 0 };

  const schoolsByDivision = new Map();
  schools.forEach((school) => {
    const key = String(school.divisionId);
    if (!schoolsByDivision.has(key)) schoolsByDivision.set(key, []);
    schoolsByDivision.get(key).push(school);
  });

  const toCreate = [];
  for (const window of windows) {
    const divisionSchools = schoolsByDivision.get(String(window.divisionId)) || [];
    if (!divisionSchools.length) continue;

    const monthValues = auditMonthMatchValues(window.auditMonth);
    const existing = await AuditReport.find({
      school: { $in: divisionSchools.map((s) => s._id) },
      month: monthValues.length > 1 ? { $in: monthValues } : window.auditMonth,
    }).select('school').lean();
    const alreadyFiled = new Set(existing.map((doc) => String(doc.school)));

    for (const school of divisionSchools) {
      if (alreadyFiled.has(String(school._id))) continue;
      const items = await buildIntactItems(school._id);
      toCreate.push({
        school: school._id,
        month: window.auditMonth,
        items,
        status: 'Normal',
        workflowStatus: 'Approved',
        lostAmStatus: 'None',
        damagedAmStatus: 'None',
        assumedIntact: true,
        assumedIntactAt: now,
        adminNotes: ASSUMED_INTACT_NOTE,
      });
    }
  }

  if (!toCreate.length) return { created: 0 };

  try {
    const inserted = await AuditReport.insertMany(toCreate, { ordered: false });
    return { created: inserted.length };
  } catch (error) {
    if (error.code === 11000 || error.writeErrors) {
      return { created: error.insertedDocs?.length || 0 };
    }
    throw error;
  }
}

module.exports = {
  ASSUMED_INTACT_NOTE,
  closeExpiredAuditWindows,
};
