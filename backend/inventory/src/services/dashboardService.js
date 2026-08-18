const Dispatch = require('../models/Dispatch');
const AuditReport = require('../models/AuditReport');
const School = require('../models/School');
const ReplacementRequest = require('../models/ReplacementRequest');
const ReceiptIssue = require('../models/ReceiptIssue');
const Kit = require('../models/Kit');

class DashboardService {
  static getCurrentAuditMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth() + 1}`;
  }

  static async getAdminStats() {
    const currentMonth = DashboardService.getCurrentAuditMonth();

    const [
      dispatchStats,
      auditStats,
      totalSchools,
      replacementStats,
      pendingAcknowledgments,
      pendingReceiptIssues,
      pendingReplacementRequests,
      auditMismatches,
      missingInventoryAgg,
      activeInventoryAgg,
      schoolsWithAuditThisMonth,
    ] = await Promise.all([
      Dispatch.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalQuantity: { $sum: '$quantity' },
          },
        },
      ]),
      AuditReport.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),
      School.countDocuments({}),
      ReplacementRequest.aggregate([
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 },
            totalQuantity: { $sum: '$quantity' },
          },
        },
      ]),
      Dispatch.countDocuments({ status: 'Dispatched' }),
      ReceiptIssue.countDocuments({ status: 'Pending Admin Approval' }),
      ReplacementRequest.countDocuments({
        status: { $in: ['Pending Admin Approval', 'Replacement Pending'] },
      }),
      AuditReport.countDocuments({ status: 'Mismatch' }),
      AuditReport.aggregate([
        { $unwind: '$items' },
        { $group: { _id: null, total: { $sum: '$items.lostQuantity' } } },
      ]),
      Dispatch.aggregate([
        { $match: { status: { $in: ['Received', 'Delivery Completed'] } } },
        {
          $group: {
            _id: null,
            total: { $sum: { $ifNull: ['$quantityReceived', '$quantity'] } },
          },
        },
      ]),
      AuditReport.distinct('school', { month: currentMonth }),
    ]);

    const kits = await Kit.find().select('warehouseQuantity').lean();
    const warehouseStock = kits.reduce((sum, k) => sum + (k.warehouseQuantity || 0), 0);
    const auditedSchoolSet = new Set(schoolsWithAuditThisMonth.map(String));
    const pendingAudits = totalSchools - auditedSchoolSet.size;

    return {
      dispatchSummary: dispatchStats,
      auditStatus: auditStats,
      replacementSummary: replacementStats,
      totalSchoolsCount: totalSchools,
      warehouseStock,
      activeInventory: activeInventoryAgg[0]?.total || 0,
      missingInventory: missingInventoryAgg[0]?.total || 0,
      pendingAudits: Math.max(0, pendingAudits),
      pendingAcknowledgments,
      pendingReceiptIssues,
      pendingReplacementRequests,
      pendingAdminApprovals: pendingReceiptIssues + pendingReplacementRequests,
      auditMismatches,
      totalKits: kits.length,
      fetchedAt: new Date().toISOString(),
    };
  }

  static async getAttentionSchools(limit = 6) {
    const currentMonth = DashboardService.getCurrentAuditMonth();
    const schools = await School.find().select('name code divisionId').lean();

    const [pendingAckBySchool, mismatchSchoolIds, auditedThisMonth, pendingReplaceBySchool] = await Promise.all([
      Dispatch.aggregate([
        { $match: { status: 'Dispatched' } },
        { $group: { _id: '$school', count: { $sum: 1 } } },
      ]),
      AuditReport.distinct('school', { status: 'Mismatch' }),
      AuditReport.distinct('school', { month: currentMonth }),
      ReplacementRequest.aggregate([
        { $match: { status: { $in: ['Pending Admin Approval', 'Replacement Pending'] } } },
        { $group: { _id: '$school', count: { $sum: 1 } } },
      ]),
    ]);

    const ackMap = new Map(pendingAckBySchool.map((r) => [String(r._id), r.count]));
    const mismatchSet = new Set(mismatchSchoolIds.map(String));
    const auditedSet = new Set(auditedThisMonth.map(String));
    const replaceMap = new Map(pendingReplaceBySchool.map((r) => [String(r._id), r.count]));

    return schools
      .map((school) => {
        const schoolId = String(school._id);
        const pendingAck = ackMap.get(schoolId) || 0;
        const hasMismatch = mismatchSet.has(schoolId);
        const needsAudit = !auditedSet.has(schoolId);
        const pendingReplace = replaceMap.get(schoolId) || 0;
        const score = pendingAck * 3 + (hasMismatch ? 2 : 0) + (needsAudit ? 1 : 0) + pendingReplace * 2;
        return {
          school,
          pendingAck,
          hasMismatch,
          needsAudit,
          pendingReplace,
          score,
        };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}

module.exports = DashboardService;
