const Dispatch = require('../models/Dispatch');
const School = require('../models/School');
const AuditReport = require('../models/AuditReport');
const Kit = require('../models/Kit');
const User = require('../models/User');
const Division = require('../models/Division');
const ReplacementRequest = require('../models/ReplacementRequest');
const ReceiptIssue = require('../models/ReceiptIssue');
const DivisionAuditWindow = require('../models/DivisionAuditWindow');
const receiptIssueService = require('../services/receiptIssueService');
const { populateAuditRelations } = require('../utils/auditQuery');
const {
  INCOMING_DISPATCH_STATUSES,
  ISSUE_TYPES_BY_CATEGORY,
  buildDispatchMonthMatch,
  buildIssueMonthMatch,
  buildReplacementMonthMatch,
} = require('../utils/dispatchHub');
const { auditMonthMatchValues } = require('../utils/auditMonth');
const { fetchSchoolDispatchHub } = require('../services/dispatchHubService');
const { closeExpiredAuditWindows } = require('../services/auditCloseoutService');
const mongoose = require('mongoose');
const { parsePagination, buildSearchRegex, paginatedMeta } = require('../utils/listQuery');
const { serializeAMList } = require('../utils/amUser');

async function findSchoolIdsMatchingSearch(search) {
  const regex = buildSearchRegex(search);
  if (!regex) return null;
  const schools = await School.find({
    $or: [{ name: regex }, { code: regex }, { contactEmail: regex }, { wizklubSchoolId: regex }],
  }).select('_id').lean();
  return schools.map((s) => s._id);
}

const getBootstrap = async (req, res) => {
  try {
    const [requests, receiptIssues, kits, ams, divisions, auditWindows, schoolCount] = await Promise.all([
      ReplacementRequest.find({
        status: { $in: ['Pending Admin Approval', 'Replacement Pending'] },
      })
        .populate('school')
        .populate('kit')
        .populate('requestedBy'),
      ReceiptIssue.find({
        status: {
          $in: [
            'Pending Admin Approval',
            'Clarification Requested',
            'Approved',
            'Damage Under Review',
            'Missing Item Under Review',
            'Received with Issues',
          ],
        },
      })
        .populate('school')
        .populate('kit')
        .populate('dispatch')
        .populate('reportedBy', 'name email')
        .sort({ createdAt: -1 }),
      Kit.find().sort({ name: 1 }),
      User.find({ role: 'AM' }).select('+passwordEncrypted').populate('divisionId'),
      Division.find().populate('regionalManagerId', 'name email'),
      DivisionAuditWindow.find()
        .populate('divisionId', 'name')
        .sort({ auditMonth: -1 }),
      School.countDocuments(),
    ]);

    const warehouseTotal = kits.reduce((sum, k) => sum + (k.warehouseQuantity || 0), 0);

    res.json({
      requests,
      receiptIssues,
      kits,
      ams: serializeAMList(ams),
      divisions,
      auditWindows,
      warehouseTotal,
      schoolCount,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const listDispatches = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = {};

    if (req.query.status && req.query.status !== 'All') {
      filter.status = req.query.status;
    }
    if (req.query.schoolId) {
      filter.school = req.query.schoolId;
    }
    if (req.query.divisionId) {
      const divisionSchools = await School.find({ divisionId: req.query.divisionId }).select('_id').lean();
      const schoolIds = divisionSchools.map((s) => s._id);
      filter.school = filter.school
        ? { $in: schoolIds.filter((id) => String(id) === String(filter.school)) }
        : { $in: schoolIds };
    }

    const search = req.query.search?.trim();
    if (search) {
      const regex = buildSearchRegex(search);
      const schoolIds = await findSchoolIdsMatchingSearch(search);
      const orClauses = [
        { dispatchId: regex },
        { consignmentNo: regex },
        { trackingId: regex },
        { kitId: regex },
        { replacementId: regex },
      ];
      if (schoolIds?.length) {
        orClauses.push({ school: { $in: schoolIds } });
      }
      filter.$or = orClauses;
    }

    const [total, dispatchesRaw] = await Promise.all([
      Dispatch.countDocuments(filter),
      Dispatch.find(filter)
        .populate('school')
        .populate('kit')
        .populate('reportingManager')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
    ]);

    const dispatches = await receiptIssueService.attachReceiptIssuesToDispatches(dispatchesRaw);

    res.json({
      data: dispatches,
      ...paginatedMeta(total, page, limit),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const listSchools = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = {};

    if (req.query.divisionId) {
      filter.divisionId = req.query.divisionId;
    }
    if (req.query.id) {
      filter._id = req.query.id;
    }

    const search = req.query.search?.trim();
    if (search) {
      const regex = buildSearchRegex(search);
      filter.$or = [{ name: regex }, { code: regex }, { contactEmail: regex }];
    }

    const [total, schoolsRaw] = await Promise.all([
      School.countDocuments(filter),
      School.find(filter)
        .populate('divisionId')
        .populate('rmId')
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit),
    ]);

    const schoolPortalUsers = await User.find({ role: 'School' }).select('_id email schoolId');
    const portalBySchoolId = new Map(
      schoolPortalUsers.map((u) => [String(u.schoolId), { _id: u._id, email: u.email }]),
    );

    const data = schoolsRaw.map((s) => {
      const doc = s.toObject();
      doc.portalUser = portalBySchoolId.get(String(s._id)) || null;
      return doc;
    });

    const schoolIds = data.map((s) => s._id);
    const dispatchCounts = schoolIds.length
      ? await Dispatch.aggregate([
          { $match: { school: { $in: schoolIds } } },
          { $group: { _id: '$school', count: { $sum: 1 } } },
        ])
      : [];
    const countMap = new Map(dispatchCounts.map((row) => [String(row._id), row.count]));
    const enriched = data.map((school) => ({
      ...school,
      dispatchCount: countMap.get(String(school._id)) || 0,
    }));

    res.json({
      data: enriched,
      ...paginatedMeta(total, page, limit),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const listAudits = async (req, res) => {
  try {
    await closeExpiredAuditWindows({
      schoolIds: req.query.schoolId ? [req.query.schoolId] : undefined,
      month: req.query.month || undefined,
    });

    const { page, limit, skip } = parsePagination(req.query);
    const filter = {};

    if (req.query.status && req.query.status !== 'All') {
      filter.status = req.query.status;
    }
    if (req.query.month) {
      const monthKeys = auditMonthMatchValues(req.query.month);
      filter.month = monthKeys.length > 1 ? { $in: monthKeys } : monthKeys[0];
    }
    if (req.query.workflowStatus && req.query.workflowStatus !== 'All') {
      filter.workflowStatus = req.query.workflowStatus;
    }
    if (req.query.schoolId) {
      filter.school = req.query.schoolId;
    }
    if (req.query.divisionId) {
      const divisionSchools = await School.find({ divisionId: req.query.divisionId }).select('_id').lean();
      const divisionIds = divisionSchools.map((s) => s._id);
      if (filter.school) {
        const allowed = new Set(divisionIds.map(String));
        if (!allowed.has(String(filter.school))) {
          return res.json({ data: [], ...paginatedMeta(0, page, limit) });
        }
      } else {
        filter.school = { $in: divisionIds };
      }
    }

    const search = req.query.search?.trim();
    if (search) {
      const schoolIds = await findSchoolIdsMatchingSearch(search);
      if (!schoolIds?.length) {
        return res.json({ data: [], ...paginatedMeta(0, page, limit) });
      }
      if (filter.school?.$in) {
        const allowed = new Set(filter.school.$in.map(String));
        const intersection = schoolIds.filter((id) => allowed.has(String(id)));
        if (!intersection.length) {
          return res.json({ data: [], ...paginatedMeta(0, page, limit) });
        }
        filter.school = { $in: intersection };
      } else if (filter.school) {
        const allowed = new Set(schoolIds.map(String));
        if (!allowed.has(String(filter.school))) {
          return res.json({ data: [], ...paginatedMeta(0, page, limit) });
        }
      } else {
        filter.school = { $in: schoolIds };
      }
    }

    const [total, data] = await Promise.all([
      AuditReport.countDocuments(filter),
      populateAuditRelations(
        AuditReport.find(filter)
      )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
    ]);

    res.json({
      data,
      ...paginatedMeta(total, page, limit),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const listKits = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = {};

    if (req.query.type) {
      filter.type = req.query.type;
    }

    const search = req.query.search?.trim();
    if (search) {
      const regex = buildSearchRegex(search);
      filter.$or = [{ name: regex }, { type: regex }, { kitId: regex }, { description: regex }];
    }

    const [total, data] = await Promise.all([
      Kit.countDocuments(filter),
      Kit.find(filter).sort({ name: 1 }).skip(skip).limit(limit),
    ]);

    res.json({
      data,
      ...paginatedMeta(total, page, limit),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** Division summary counts for dispatch grid — avoids loading all dispatches. */
const getDispatchDivisionSummary = async (req, res) => {
  try {
    const schools = await School.find().select('_id divisionId').lean();
    const schoolToDivision = new Map(schools.map((s) => [String(s._id), String(s.divisionId)]));

    const dispatchCounts = await Dispatch.aggregate([
      { $group: { _id: '$school', count: { $sum: 1 } } },
    ]);

    const divisionDispatchCounts = {};
    const schoolCountByDivision = {};
    schools.forEach((s) => {
      const divId = String(s.divisionId);
      schoolCountByDivision[divId] = (schoolCountByDivision[divId] || 0) + 1;
    });
    dispatchCounts.forEach((row) => {
      const divId = schoolToDivision.get(String(row._id));
      if (!divId) return;
      divisionDispatchCounts[divId] = (divisionDispatchCounts[divId] || 0) + row.count;
    });

    res.json({ schoolCountByDivision, divisionDispatchCounts });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getSchoolDispatchHub = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const result = await fetchSchoolDispatchHub({
      schoolId,
      month: req.query.month,
      section: req.query.section,
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search,
      issueType: req.query.issueType,
      issueStatus: req.query.issueStatus,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getBootstrap,
  listDispatches,
  listSchools,
  listAudits,
  listKits,
  getDispatchDivisionSummary,
  getSchoolDispatchHub,
};
