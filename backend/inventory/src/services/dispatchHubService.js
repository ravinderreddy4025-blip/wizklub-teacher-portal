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
  reportMonthRange,
  incomingQuantity,
  acknowledgedQuantity,
} = require('../utils/dispatchHub');
const { parsePagination, buildSearchRegex, paginatedMeta } = require('../utils/listQuery');

const VALID_HUB_SECTIONS = ['incoming', 'past', 'history', 'issues', 'lost', 'mismatch', 'damaged', 'notReceived'];

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

async function aggregateIncomingSummary(match) {
  const docs = await Dispatch.find(match).select('quantity').lean();
  return {
    count: docs.length,
    units: docs.reduce((sum, doc) => sum + incomingQuantity(doc), 0),
  };
}

function dispatchIdKey(value) {
  if (!value) return '';
  if (typeof value === 'object' && value._id) return String(value._id);
  return String(value);
}

async function loadCompletedDispatches({ schoolObjectId, month, issueMonth }) {
  const range = reportMonthRange(month);
  const issuesInMonth = await ReceiptIssue.find({
    school: schoolObjectId,
    ...issueMonth,
  }).lean();

  const issuesByDispatch = new Map();
  issuesInMonth.forEach((issue) => {
    const id = dispatchIdKey(issue.dispatch);
    if (!id) return;
    if (!issuesByDispatch.has(id)) issuesByDispatch.set(id, []);
    issuesByDispatch.get(id).push(issue);
  });

  const candidateIds = new Set(issuesByDispatch.keys());
  const receivedMatch = {
    school: schoolObjectId,
    status: { $nin: INCOMING_DISPATCH_STATUSES },
  };
  if (range) {
    receivedMatch.receivedAt = { $gte: range.start, $lte: range.end };
  }
  const receivedDocs = await Dispatch.find(receivedMatch).select('_id').lean();
  receivedDocs.forEach((doc) => candidateIds.add(String(doc._id)));

  if (candidateIds.size === 0) return [];

  const candidates = await Dispatch.find({
    _id: { $in: [...candidateIds] },
    school: schoolObjectId,
    status: { $nin: INCOMING_DISPATCH_STATUSES },
  })
    .select('quantity quantityReceived quantityAcknowledged quantityInitial quantityAffected quantityReplaced outstandingQuantity status receivedAt receiptIssue dispatchedAt createdAt dispatchId consignmentNo trackingId kitId cycles')
    .populate('receiptIssue', 'quantityReceived quantityAffected quantitySent status')
    .lean();

  return candidates
    .map((doc) => {
      const units = Number(doc.quantityAcknowledged) > 0
        ? Number(doc.quantityAcknowledged)
        : acknowledgedQuantity(doc, issuesByDispatch.get(String(doc._id)) || [], range);
      return { ...doc, acknowledgedUnits: units };
    })
    .filter((doc) => doc.acknowledgedUnits > 0)
    .sort((a, b) => new Date(b.receivedAt || b.createdAt) - new Date(a.receivedAt || a.createdAt));
}

async function fetchSchoolDispatchHub({
  schoolId,
  month,
  section = 'incoming',
  page = 1,
  limit = 20,
  search,
  issueType,
  issueStatus,
}) {
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
  const historyBase = {
    school: schoolObjectId,
    ...dispatchMonth,
  };
  const lostIssueBase = {
    school: schoolObjectId,
    issueType: { $in: ISSUE_TYPES_BY_CATEGORY.lost },
    ...issueMonth,
  };
  const notReceivedIssueBase = {
    school: schoolObjectId,
    issueType: { $in: ISSUE_TYPES_BY_CATEGORY.notReceived },
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
    completedDocs,
    historyCount,
    lostIssuesSummary,
    notReceivedSummary,
    lostReplacementsSummary,
    mismatchSummary,
    damagedIssuesSummary,
    damagedReplacementsSummary,
    issuesCount,
  ] = await Promise.all([
    aggregateIncomingSummary(incomingBase),
    loadCompletedDispatches({ schoolObjectId, month, issueMonth }),
    Dispatch.countDocuments(historyBase),
    aggregateIssueSummary(lostIssueBase),
    aggregateIssueSummary(notReceivedIssueBase),
    aggregateReplacementSummary(lostReplacementBase),
    aggregateIssueSummary(mismatchIssueBase),
    aggregateIssueSummary(damagedIssueBase),
    aggregateReplacementSummary(damagedReplacementBase),
    ReceiptIssue.countDocuments({ school: schoolObjectId, ...issueMonth }),
  ]);

  const pastSummary = {
    count: completedDocs.length,
    units: completedDocs.reduce((sum, doc) => sum + (Number(doc.acknowledgedUnits) || 0), 0),
  };

  const summary = {
    month: month || null,
    incoming: incomingSummary,
    past: pastSummary,
    history: { count: historyCount, units: 0 },
    issues: { count: issuesCount, units: 0 },
    lost: mergeSummaries(lostIssuesSummary, lostReplacementsSummary),
    notReceived: notReceivedSummary,
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

  if (hubSection === 'incoming') {
    const filter = { ...incomingBase };
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
  } else if (hubSection === 'past') {
    let matched = completedDocs;
    if (search?.trim()) {
      const regex = buildSearchRegex(search);
      matched = completedDocs.filter((doc) => (
        regex.test(doc.dispatchId || '')
        || regex.test(doc.consignmentNo || '')
        || regex.test(doc.trackingId || '')
        || regex.test(doc.kitId || '')
      ));
    }
    total = matched.length;
    const pageDocs = matched.slice(skip, skip + pagination.limit);
    if (pageDocs.length === 0) {
      data = [];
    } else {
      const ackById = new Map(pageDocs.map((doc) => [String(doc._id), doc.acknowledgedUnits]));
      data = await Dispatch.find({ _id: { $in: pageDocs.map((doc) => doc._id) } })
        .populate('school')
        .populate('kit')
        .populate('reportingManager');
      data = await receiptIssueService.attachReceiptIssuesToDispatches(data);
      const order = new Map(pageDocs.map((doc, index) => [String(doc._id), index]));
      data = data
        .map((doc) => {
          const json = typeof doc.toObject === 'function' ? doc.toObject() : doc;
          json.acknowledgedUnits = ackById.get(String(doc._id)) || 0;
          return json;
        })
        .sort((a, b) => (order.get(String(a._id)) ?? 0) - (order.get(String(b._id)) ?? 0));
    }
  } else if (hubSection === 'history') {
    const filter = { ...historyBase };
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
  } else if (hubSection === 'issues') {
    kind = 'issues';
    const TYPE_MAP = {
      notReceived: ['Shipment Not Received'],
      lost: ['Missing Product'],
      mismatch: ['Quantity Mismatch'],
      damaged: ['Damaged Product'],
    };
    const STATUS_MAP = {
      pending: ['Pending AM Approval', 'Pending Admin Approval', 'Clarification Requested', 'Damage Under Review', 'Missing Item Under Review', 'Received with Issues'],
      pendingAm: ['Pending AM Approval', 'Damage Under Review', 'Missing Item Under Review', 'Received with Issues'],
      pendingAdmin: ['Pending Admin Approval'],
      clarification: ['Clarification Requested'],
      needsReview: ['Pending AM Approval', 'Pending Admin Approval', 'Damage Under Review', 'Missing Item Under Review', 'Received with Issues'],
      needsInformation: ['Clarification Requested'],
      waitingReplacement: ['Approved'],
      approved: ['Approved'],
      resolved: ['Resolved'],
      rejected: ['Rejected'],
    };
    const issueFilter = { school: schoolObjectId, ...issueMonth };
    if (issueType && TYPE_MAP[issueType]) issueFilter.issueType = { $in: TYPE_MAP[issueType] };
    if (issueStatus && STATUS_MAP[issueStatus]) issueFilter.status = { $in: STATUS_MAP[issueStatus] };
    if (search?.trim()) {
      const regex = buildSearchRegex(search);
      issueFilter.$or = [{ remarks: regex }, { consignmentNo: regex }];
    }
    const issues = await ReceiptIssue.find(issueFilter)
      .populate('kit')
      .populate('dispatch')
      .populate('school')
      .sort({ createdAt: -1 });
    total = issues.length;
    data = issues.slice(skip, skip + pagination.limit).map((issue) => ({
      recordType: 'receipt_issue',
      item: issue,
    }));
  } else {
    kind = 'issues';
    const issueFilter = {
      school: schoolObjectId,
      issueType: { $in: ISSUE_TYPES_BY_CATEGORY[hubSection] || ISSUE_TYPES_BY_CATEGORY.lost },
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
