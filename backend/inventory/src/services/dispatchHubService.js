const mongoose = require('mongoose');
const Dispatch = require('../models/Dispatch');
const ReceiptIssue = require('../models/ReceiptIssue');
const ReplacementRequest = require('../models/ReplacementRequest');
const receiptIssueService = require('./receiptIssueService');
const {
  INCOMING_DISPATCH_STATUSES,
  ISSUE_TYPES_BY_CATEGORY,
  buildDispatchMonthMatch,
  buildIssueMonthMatch,
  buildReplacementMonthMatch,
} = require('../utils/dispatchHub');
const { parsePagination, buildSearchRegex, paginatedMeta } = require('../utils/listQuery');

const VALID_HUB_SECTIONS = ['incoming', 'past', 'lost', 'mismatch', 'damaged'];

async function aggregateDispatchSummary(match) {
  const [row] = await Dispatch.aggregate([
    { $match: match },
    { $group: { _id: null, count: { $sum: 1 }, units: { $sum: '$quantity' } } },
  ]);
  return { count: row?.count || 0, units: row?.units || 0 };
}

async function aggregateIssueSummary(match) {
  const [row] = await ReceiptIssue.aggregate([
    { $match: match },
    { $group: { _id: null, count: { $sum: 1 }, units: { $sum: '$quantityAffected' } } },
  ]);
  return { count: row?.count || 0, units: row?.units || 0 };
}

async function aggregateReplacementSummary(match) {
  const [row] = await ReplacementRequest.aggregate([
    { $match: match },
    { $group: { _id: null, count: { $sum: 1 }, units: { $sum: '$quantity' } } },
  ]);
  return { count: row?.count || 0, units: row?.units || 0 };
}

function mergeSummaries(a, b) {
  return { count: a.count + b.count, units: a.units + b.units };
}

async function fetchSchoolDispatchHub({ schoolId, month, section = 'incoming', page = 1, limit = 20, search }) {
  const hubSection = VALID_HUB_SECTIONS.includes(section) ? section : 'incoming';
  const pagination = parsePagination({ page, limit });
  const { skip } = pagination;
  const schoolObjectId = new mongoose.Types.ObjectId(schoolId);

  const dispatchMonth = buildDispatchMonthMatch(month);
  const issueMonth = buildIssueMonthMatch(month);
  const replacementMonth = buildReplacementMonthMatch(month);

  const incomingBase = {
    school: schoolObjectId,
    status: { $in: INCOMING_DISPATCH_STATUSES },
    ...dispatchMonth,
  };
  const pastBase = {
    school: schoolObjectId,
    status: { $nin: INCOMING_DISPATCH_STATUSES },
    ...dispatchMonth,
  };
  const lostIssueBase = {
    school: schoolObjectId,
    issueType: { $in: ISSUE_TYPES_BY_CATEGORY.lost },
    ...issueMonth,
  };
  const mismatchIssueBase = {
    school: schoolObjectId,
    issueType: { $in: ISSUE_TYPES_BY_CATEGORY.mismatch },
    ...issueMonth,
  };
  const damagedIssueBase = {
    school: schoolObjectId,
    issueType: { $in: ISSUE_TYPES_BY_CATEGORY.damaged },
    ...issueMonth,
  };
  const lostReplacementBase = { school: schoolObjectId, type: 'Lost', ...replacementMonth };
  const damagedReplacementBase = { school: schoolObjectId, type: 'Damaged', ...replacementMonth };

  const [
    incomingSummary,
    pastSummary,
    lostIssuesSummary,
    lostReplacementsSummary,
    mismatchSummary,
    damagedIssuesSummary,
    damagedReplacementsSummary,
  ] = await Promise.all([
    aggregateDispatchSummary(incomingBase),
    aggregateDispatchSummary(pastBase),
    aggregateIssueSummary(lostIssueBase),
    aggregateReplacementSummary(lostReplacementBase),
    aggregateIssueSummary(mismatchIssueBase),
    aggregateIssueSummary(damagedIssueBase),
    aggregateReplacementSummary(damagedReplacementBase),
  ]);

  const summary = {
    month: month || null,
    incoming: incomingSummary,
    past: pastSummary,
    lost: mergeSummaries(lostIssuesSummary, lostReplacementsSummary),
    mismatch: mismatchSummary,
    damaged: mergeSummaries(damagedIssuesSummary, damagedReplacementsSummary),
    lostIssues: lostIssuesSummary,
    lostReplacements: lostReplacementsSummary,
    damagedIssues: damagedIssuesSummary,
    damagedReplacements: damagedReplacementsSummary,
  };

  let data = [];
  let total = 0;
  let kind = 'dispatches';

  if (hubSection === 'incoming' || hubSection === 'past') {
    const filter = hubSection === 'incoming' ? { ...incomingBase } : { ...pastBase };
    if (search?.trim()) {
      const regex = buildSearchRegex(search);
      filter.$or = [
        { dispatchId: regex },
        { consignmentNo: regex },
        { trackingId: regex },
        { kitId: regex },
      ];
    }
    [total, data] = await Promise.all([
      Dispatch.countDocuments(filter),
      Dispatch.find(filter)
        .populate('school')
        .populate('kit')
        .populate('reportingManager')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pagination.limit),
    ]);
    data = await receiptIssueService.attachReceiptIssuesToDispatches(data);
  } else {
    kind = 'issues';
    const issueFilter = {
      school: schoolObjectId,
      issueType: { $in: ISSUE_TYPES_BY_CATEGORY[hubSection] },
      ...issueMonth,
    };
    const issues = await ReceiptIssue.find(issueFilter)
      .populate('kit')
      .populate('dispatch')
      .sort({ createdAt: -1 });

    let replacements = [];
    if (hubSection === 'lost') {
      replacements = await ReplacementRequest.find(lostReplacementBase).populate('kit').sort({ createdAt: -1 });
    } else if (hubSection === 'damaged') {
      replacements = await ReplacementRequest.find(damagedReplacementBase).populate('kit').sort({ createdAt: -1 });
    }

    const combined = [
      ...issues.map((issue) => ({ recordType: 'receipt_issue', item: issue })),
      ...replacements.map((request) => ({ recordType: 'replacement_request', item: request })),
    ].sort((a, b) => new Date(b.item.createdAt) - new Date(a.item.createdAt));

    total = combined.length;
    data = combined.slice(skip, skip + pagination.limit);
  }

  return {
    summary,
    section: hubSection,
    kind,
    data,
    ...paginatedMeta(total, pagination.page, pagination.limit),
  };
}

module.exports = {
  VALID_HUB_SECTIONS,
  fetchSchoolDispatchHub,
};
