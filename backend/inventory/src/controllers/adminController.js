const Dispatch = require('../models/Dispatch');
const receiptIssueService = require('../services/receiptIssueService');
const ReceiptIssue = require('../models/ReceiptIssue');
const ReplacementRequest = require('../models/ReplacementRequest');
const AuditReport = require('../models/AuditReport');
const notificationService = require('../services/notificationService');
const School = require('../models/School');
const Division = require('../models/Division');
const Kit = require('../models/Kit');
const User = require('../models/User');
const DashboardService = require('../services/dashboardService');
const APIFeatures = require('../utils/apiFeatures');
const crypto = require('crypto');
const { getDivisionManager } = require('../utils/divisionManager');
const { formatComponentId } = require('../utils/componentId');
const { generateUniqueDispatchId, generateUniqueDispatchIds } = require('../utils/dispatchId');
const { findDuplicateKitOnConsignment } = require('../services/dispatchConsignmentService');
const wizklubApi = require('../services/wizklubApiService');
const { fileUrl } = require('../utils/mediaUrl');
const { generateDispatchInvoicePdf, sendInvoicePdf } = require('../services/dispatchBillPdf');
const wizklubRegionService = require('../services/wizklubRegionService');
const { loadOperationalVerification } = require('../services/operationalSchoolList');
const { bulkRegisterWizklubSchools } = require('../services/wizklubSchoolImportService');
const { syncOperationalAmsToDivisions } = require('../services/operationalAmService');
const { serializeAMList } = require('../utils/amUser');
const dispatchCycle = require('../utils/dispatchCycle');

function readWizklubAccessToken(req) {
  return (
    req.headers['x-wizklub-access-token']?.trim()
    || req.query.wizklubAccessToken?.trim()
    || null
  );
}

const generateUniqueReplacementId = async () => {
  // Try a few times to avoid rare collisions.
  for (let i = 0; i < 5; i++) {
    const shortRandom = crypto.randomBytes(3).toString('hex').toUpperCase();
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const candidate = `REPL-${datePart}-${shortRandom}`;

    // eslint-disable-next-line no-await-in-loop
    const exists = await ReplacementRequest.exists({ replacementId: candidate });
    if (!exists) return candidate;
  }

  // Fallback if uniqueness checks keep failing (very unlikely).
  const shortRandom = crypto.randomBytes(6).toString('hex').toUpperCase();
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `REPL-${datePart}-${shortRandom}`;
};

const createDispatch = async (req, res) => {
  try {
    const { school, divisionId, consignmentNo, category, kit, quantity } = req.body;

    // When sent as multipart (proof photo attached), `items` arrives as a JSON string.
    let items = req.body.items;
    if (typeof items === 'string') {
      try {
        items = JSON.parse(items);
      } catch {
        items = [];
      }
    }

    const dispatchProofUrl = fileUrl(req.file) || undefined;

    const lineItems = Array.isArray(items) && items.length > 0
      ? items
      : (kit && quantity ? [{ kit, quantity: Number(quantity) }] : []);

    if (!school || lineItems.length === 0) {
      return res.status(400).json({ message: 'School and at least one kit line are required' });
    }

    const normalizedItems = lineItems.map((item, index) => {
      const qty = Number(item.quantity);
      if (!item.kit || !qty || qty < 1) {
        throw new Error(`Line ${index + 1}: kit and valid quantity are required`);
      }
      return { kit: item.kit, quantity: qty };
    });

    const schoolDoc = await School.findById(school).populate('divisionId');
    if (!schoolDoc) return res.status(404).json({ message: 'School not found' });

    if (divisionId && String(schoolDoc.divisionId?._id || schoolDoc.divisionId) !== String(divisionId)) {
      return res.status(400).json({ message: 'School does not belong to the selected division' });
    }

    const qtyByKit = normalizedItems.reduce((acc, item) => {
      const key = String(item.kit);
      acc[key] = (acc[key] || 0) + item.quantity;
      return acc;
    }, {});

    const kitIds = Object.keys(qtyByKit);
    const kitList = await Kit.find({ _id: { $in: kitIds } });
    const kitDocs = Object.fromEntries(kitList.map((k) => [String(k._id), k]));
    if (kitList.length !== kitIds.length) {
      return res.status(404).json({ message: 'One or more kits were not found' });
    }
    for (const kitId of kitIds) {
      const kitDoc = kitDocs[kitId];
      if ((kitDoc.warehouseQuantity || 0) < qtyByKit[kitId]) {
        return res.status(400).json({
          message: `Insufficient warehouse stock for ${kitDoc.name}. Available: ${kitDoc.warehouseQuantity || 0}, requested: ${qtyByKit[kitId]}`,
        });
      }
    }

    const seenKitTypes = new Set();
    for (const item of normalizedItems) {
      const kitDoc = kitDocs[String(item.kit)];
      const kitType = kitDoc.type || kitDoc.kitId || String(item.kit);
      if (seenKitTypes.has(kitType)) {
        return res.status(400).json({
          message: `Duplicate kit type "${kitDoc.type || kitType}" in this dispatch. Each kit type can only be added once.`,
        });
      }
      seenKitTypes.add(kitType);
    }

    const trimmedConsignment = consignmentNo?.trim() || '';

    if (trimmedConsignment) {
      const existingDuplicates = await findDuplicateKitOnConsignment(
        school,
        trimmedConsignment,
        kitIds,
      );
      if (existingDuplicates?.length) {
        const kitNames = [...new Set(existingDuplicates.map((d) => d.kit?.name || 'Kit'))].join(', ');
        return res.status(400).json({
          message: `Consignment "${trimmedConsignment}" already includes: ${kitNames}. Use a new tracking number or remove the duplicate shipment from admin dispatches.`,
        });
      }
    }

    const divisionRef = schoolDoc.divisionId?._id || schoolDoc.divisionId;
    const [am, dispatchIds] = await Promise.all([
      getDivisionManager(divisionRef),
      generateUniqueDispatchIds(normalizedItems.length),
    ]);

    if (new Set(dispatchIds).size !== dispatchIds.length) {
      return res.status(500).json({ message: 'Failed to generate unique dispatch IDs. Please try again.' });
    }

    const now = new Date();
    const preparedLines = normalizedItems.map((item, i) => {
      const kitDoc = kitDocs[String(item.kit)];
      const componentId = formatComponentId({
        schoolCode: schoolDoc.code,
        joiningYear: schoolDoc.joiningYear,
        kitId: kitDoc.kitId,
        quantity: item.quantity,
        lineIndex: i + 1,
      });
      return { item, kitDoc, componentId, dispatchId: dispatchIds[i] };
    });

    const dispatchRecords = [];
    const createdDispatchIds = [];
    try {
      for (const line of preparedLines) {
        const { item, componentId, dispatchId } = line;
        // eslint-disable-next-line no-await-in-loop
        const record = await Dispatch.create({
          kit: item.kit,
          quantity: item.quantity,
          school,
          reportingManager: am?._id,
          componentId,
          kitId: componentId,
          consignmentNo: trimmedConsignment,
          category: category || 'New Dispatch',
          status: 'Dispatched',
          dispatchedAt: now,
          dispatchedBy: req.user._id,
          dispatchId,
          createdBy: req.user._id,
          dispatchProofUrl,
        });
        dispatchCycle.ensureInitialCycle(record, {
          quantity: item.quantity,
          kitId: componentId,
          consignmentNo: trimmedConsignment,
          category: category || 'New Dispatch',
          dispatchedAt: now,
          dispatchedBy: req.user._id,
        });
        await record.save();
        dispatchRecords.push(record);
        createdDispatchIds.push(record._id);
      }
    } catch (createErr) {
      if (createdDispatchIds.length) {
        await Dispatch.deleteMany({ _id: { $in: createdDispatchIds } });
      }
      throw createErr;
    }

    await Promise.all(
      normalizedItems.map((item) =>
        Kit.findByIdAndUpdate(item.kit, { $inc: { warehouseQuantity: -item.quantity } })
      )
    );

    notificationService.notifyDispatchCreatedBatch(dispatchRecords).catch((err) => {
      console.error('[dispatch] In-app notification failed:', err.message);
    });

    const populated = await Dispatch.find({ _id: { $in: dispatchRecords.map((d) => d._id) } })
      .populate('school')
      .populate('kit')
      .populate('reportingManager')
      .sort({ createdAt: 1 });

    res.status(201).json({
      dispatches: populated,
      dispatch: populated[0],
      componentId: preparedLines[0]?.componentId,
      itemCount: populated.length,
    });
  } catch (error) {
    const status = error.message?.startsWith('Line ') ? 400 : 500;
    const message = error.code === 11000
      ? 'A dispatch with this ID already exists. Please try again.'
      : error.message;
    res.status(status).json({ message });
  }
};

const generateDispatchForReplacement = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { kitId, dispatchDetails, reportingManager, adminNotes } = req.body;

    const request = await ReplacementRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    if (!['Pending Admin Approval', 'Replacement Pending'].includes(request.status)) {
      return res.status(400).json({ message: 'Request is not eligible for dispatch authorization' });
    }

    // Ensure replacementId exists before creating the dispatch.
    if (!request.replacementId) {
      const newId = await generateUniqueReplacementId();
      request.replacementId = newId;
      await ReplacementRequest.updateOne(
        { _id: request._id },
        { $set: { replacementId: newId } },
        { runValidators: false }
      );
    }

    request.status = 'Approved';
    request.adminNotes = adminNotes;
    await request.save();

    const category = request.type === 'Lost' ? 'Lost Dispatch' : 'Damaged Dispatch';
    const dispatchId = await generateUniqueDispatchId();
    const now = new Date();
    const dispatchProofUrl = fileUrl(req.file) || undefined;
    const dispatch = await Dispatch.create({
      kit: request.kit,
      quantity: request.quantity,
      school: request.school,
      reportingManager,
      dispatchDetails: dispatchDetails || `Authorized Replacement (${request.type}). Admin Notes: ${adminNotes || 'N/A'}`,
      kitId,
      category,
      replacementId: request.replacementId,
      status: 'Dispatched',
      dispatchedAt: now,
      dispatchedBy: req.user._id,
      dispatchId,
      createdBy: req.user._id,
      dispatchProofUrl,
    });
    dispatchCycle.ensureInitialCycle(dispatch, {
      quantity: request.quantity,
      kitId,
      consignmentNo: dispatch.consignmentNo,
      category,
      dispatchedAt: now,
      dispatchedBy: req.user._id,
    });
    await dispatch.save();

    await notificationService.notifyReplacementApproval(request);
    await notificationService.notifyDispatchCreated(dispatch);

    res.status(201).json(dispatch);
  } catch (error) {
    console.error('generateDispatchForReplacement error:', error);
    res.status(500).json({ message: error.message || 'Server error generating replacement dispatch' });
  }
};

const approveReplacement = async (req, res) => {
  try {
    const { requestId } = req.params;
    // Backward-compatible: if kitId is provided we can generate the dispatch here too.
    const { adminNotes, kitId, dispatchDetails, reportingManager } = req.body;

    const request = await ReplacementRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    if (!['Pending Admin Approval', 'Replacement Pending'].includes(request.status)) {
      return res.status(400).json({ message: 'Request is not eligible for dispatch authorization' });
    }

    // If admin didn't provide kitId, keep old behavior of approving request only.
    if (!kitId) {
      request.status = 'Approved';
      request.adminNotes = adminNotes;
      await request.save();
      await notificationService.notifyReplacementApproval(request);
      return res.status(200).json(request);
    }

    return generateDispatchForReplacement(req, res);
  } catch (error) {
    console.error('approveReplacement error:', error);
    res.status(500).json({ message: error.message || 'Server error approving replacement' });
  }
};

const rejectReplacement = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { adminNotes } = req.body;

    const request = await ReplacementRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    request.status = 'Rejected';
    request.adminNotes = adminNotes;
    await request.save();

    await notificationService.notifyReplacementApproval(request);

    res.json(request);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getReports = async (req, res) => {
  try {
    await receiptIssueService.repairAllSplitReceiptIssues();

    const dispatchesRaw = await Dispatch.find()
      .populate('school')
      .populate('kit')
      .populate('reportingManager');
    const dispatches = await receiptIssueService.attachReceiptIssuesToDispatches(dispatchesRaw);

    // Backfill dispatchId for older records created before the field existed.
    // This keeps the admin registry/export consistent without requiring a separate migration.
    const dispatchesNeedingId = dispatches.filter(d => !d.dispatchId);
    for (const d of dispatchesNeedingId) {
      await Dispatch.updateOne(
        { _id: d._id },
        { $set: { dispatchId: d._id.toString() } },
        { runValidators: false }
      );
    }
    const audits = await AuditReport.find().populate('school').populate('items.kit');
    const requests = await ReplacementRequest.find({
      status: { $in: ['Pending Admin Approval', 'Replacement Pending'] },
    })
      .populate('school')
      .populate('kit')
      .populate('requestedBy');

    const receiptIssues = await ReceiptIssue.find({
      status: { $in: ['Pending Admin Approval', 'Clarification Requested', 'Damage Under Review', 'Missing Item Under Review', 'Received with Issues'] },
    })
      .populate('school')
      .populate('kit')
      .populate('dispatch')
      .populate('reportedBy', 'name email')
      .sort({ createdAt: -1 });

    // Backfill replacementId for older pending requests.
    // Do it explicitly to avoid relying on Mongoose hooks being triggered.
    const requestsNeedingId = requests.filter(r => !r.replacementId);
    for (const r of requestsNeedingId) {
      const newId = await generateUniqueReplacementId();
      r.replacementId = newId;
      await ReplacementRequest.updateOne(
        { _id: r._id },
        { $set: { replacementId: newId } },
        { runValidators: false }
      );
    }

    const schoolsRaw = await School.find().populate('divisionId').populate('rmId');
    const schoolPortalUsers = await User.find({ role: 'School' }).select('_id email schoolId');
    const portalBySchoolId = new Map(
      schoolPortalUsers.map((u) => [String(u.schoolId), { _id: u._id, email: u.email }])
    );
    const schools = schoolsRaw.map((s) => {
      const doc = s.toObject();
      doc.portalUser = portalBySchoolId.get(String(s._id)) || null;
      return doc;
    });
    const kits = await Kit.find();
    const ams = await User.find({ role: 'AM' }).select('+passwordEncrypted').populate('divisionId');
    const divisions = await Division.find().populate('regionalManagerId', 'name email');
    const DivisionAuditWindow = require('../models/DivisionAuditWindow');
    const auditWindows = await DivisionAuditWindow.find()
      .populate('divisionId', 'name')
      .sort({ auditMonth: -1 });
    const warehouseTotal = kits.reduce((sum, k) => sum + (k.warehouseQuantity || 0), 0);

    res.json({
      dispatches,
      audits,
      requests,
      receiptIssues,
      schools,
      kits,
      ams: serializeAMList(ams),
      divisions,
      auditWindows,
      warehouseTotal,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getDashboardStats = async (req, res) => {
  try {
    const [stats, attentionSchools] = await Promise.all([
      DashboardService.getAdminStats(),
      DashboardService.getAttentionSchools(6),
    ]);
    res.status(200).json({ success: true, data: stats, attentionSchools });
  } catch (err) {
    console.error('Error fetching dashboard stats:', err);
    res.status(500).json({ success: false, message: 'Server error fetching stats' });
  }
};

const getAllSchools = async (req, res) => {
  try {
    const features = new APIFeatures(School.find(), req.query)
      .filter()
      .sort()
      .limitFields()
      .paginate();

    const schools = await features.query.lean();

    res.status(200).json({
      success: true,
      results: schools.length,
      data: schools
    });
  } catch (err) {
    console.error('Error fetching schools:', err);
    res.status(500).json({ success: false, message: 'Server error fetching schools' });
  }
};

const approveReceiptIssue = async (req, res) => {
  try {
    const { issueId } = req.params;
    const { adminNotes, consignmentNo, reportingManager } = req.body;
    const result = await receiptIssueService.approveReceiptIssueByAdmin(issueId, {
      adminNotes,
    });
    await notificationService.notifyReceiptIssueWorkflow(result.issue._id, 'admin_approved', {
      replacementDispatchId: result.dispatch._id,
      parentDispatchRef: result.dispatch.parentDispatchRef,
      workflowNote: adminNotes,
    });
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const shipReceiptIssueReplacement = async (req, res) => {
  try {
    const { issueId } = req.params;
    const { consignmentNo, reportingManager, adminNotes } = req.body;
    const result = await receiptIssueService.shipReceiptIssueReplacement(issueId, {
      consignmentNo,
      reportingManager,
      adminNotes,
      createdBy: req.user._id,
    });
    await notificationService.notifyReceiptIssueWorkflow(result.issue._id, 'admin_shipped', {
      replacementDispatchId: result.dispatch._id,
      parentDispatchRef: result.dispatch.parentDispatchRef,
      newConsignmentNo: result.dispatch.consignmentNo,
      workflowNote: adminNotes,
    });
    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const rejectReceiptIssue = async (req, res) => {
  try {
    const { issueId } = req.params;
    const { adminNotes } = req.body;
    const issue = await receiptIssueService.rejectReceiptIssue(issueId, adminNotes);
    await notificationService.notifyReceiptIssueWorkflow(issue._id, 'admin_rejected', {
      workflowNote: adminNotes,
    });
    res.json(issue);
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const TRACKING_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

function canAdminEditDispatchTracking(dispatch) {
  if (!dispatch || dispatch.status !== 'Dispatched') {
    return { allowed: false, reason: 'Tracking can only be edited while the dispatch status is Dispatched' };
  }
  const current = (dispatch.consignmentNo || dispatch.trackingId || '').trim();
  const dispatchedAt = dispatch.dispatchedAt ? new Date(dispatch.dispatchedAt).getTime() : null;
  if (!dispatchedAt || Number.isNaN(dispatchedAt)) {
    return { allowed: false, reason: 'Dispatch has no ship date' };
  }
  const withinWindow = Date.now() < dispatchedAt + TRACKING_EDIT_WINDOW_MS;
  if (!current) {
    return { allowed: true, overdue: !withinWindow };
  }
  if (withinWindow) {
    return { allowed: true, overdue: false };
  }
  return { allowed: false, reason: 'Tracking can no longer be changed after 24 hours once it is set' };
}

const updateDispatchTracking = async (req, res) => {
  try {
    const { id } = req.params;
    const trimmed = req.body.consignmentNo?.trim() || '';
    if (!trimmed) {
      return res.status(400).json({ message: 'Tracking ID (consignment number) is required' });
    }

    const dispatch = await Dispatch.findById(id);
    if (!dispatch) {
      return res.status(404).json({ message: 'Dispatch not found' });
    }

    const gate = canAdminEditDispatchTracking(dispatch);
    if (!gate.allowed) {
      return res.status(400).json({ message: gate.reason });
    }

    const duplicates = await findDuplicateKitOnConsignment(
      dispatch.school,
      trimmed,
      [dispatch.kit],
    );
    const conflicting = (duplicates || []).filter((d) => String(d._id) !== String(dispatch._id));
    if (conflicting.length) {
      return res.status(400).json({
        message: `Consignment "${trimmed}" already includes this kit for the school. Use a different tracking number.`,
      });
    }

    dispatch.consignmentNo = trimmed;
    dispatch.trackingId = trimmed;
    dispatchCycle.pushTrackingHistory(dispatch, {
      consignmentNo: trimmed,
      setAt: new Date(),
      setBy: req.user._id,
    });
    const live = dispatchCycle.currentCycle(dispatch);
    if (live) live.consignmentNo = trimmed;
    await dispatch.save();

    const populated = await Dispatch.findById(dispatch._id)
      .populate('school')
      .populate('kit')
      .populate('reportingManager');

    res.json({ dispatch: populated });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const requestReceiptIssueClarification = async (req, res) => {
  try {
    const { issueId } = req.params;
    const { adminNotes } = req.body;
    if (!adminNotes?.trim()) {
      return res.status(400).json({ message: 'Clarification message is required' });
    }
    const issue = await receiptIssueService.requestClarification(issueId, adminNotes.trim());
    await notificationService.notifyReceiptIssueWorkflow(issue._id, 'clarification_requested', {
      workflowNote: adminNotes.trim(),
    });
    res.json(issue);
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
};

function filterWizklubRegistrySchools(schools, { mapping, search, scope }) {
  let list = schools;

  if (mapping === 'mapped') {
    list = list.filter((s) => s.mappingStatus === 'mapped' || s.mappingStatus === 'registered');
  } else if (mapping === 'not_mapped') {
    list = list.filter((s) => s.mappingStatus === 'not_mapped');
  }

  if (scope === 'operational') {
    list = list.filter((s) => s.inOperationalList);
  } else if (scope === 'operational_gaps') {
    list = list.filter(
      (s) => s.inOperationalList
        && (s.operationalStatus === 'found_not_mapped'
          || s.operationalStatus === 'missing_region'
          || s.mappingStatus === 'not_mapped'),
    );
  }

  const q = String(search || '').trim().toLowerCase();
  if (q) {
    list = list.filter((school) => {
      const name = String(school.name || '').toLowerCase();
      const code = String(school.code || school.id || '').toLowerCase();
      const email = String(school.email || '').toLowerCase();
      const region = String(school.region || '').toLowerCase();
      return name.includes(q) || code.includes(q) || email.includes(q) || region.includes(q);
    });
  }

  return list;
}

const getWizklubSchools = async (req, res) => {
  try {
    const accessToken = readWizklubAccessToken(req);
    if (!accessToken) {
      return res.status(400).json({
        message: 'WizKlub session expired or missing. Sign in again through the admin portal.',
      });
    }

    const includeSchools = req.query.includeSchools !== 'false';
    const mapping = String(req.query.mapping || '').trim();
    const scope = String(req.query.scope || 'all').trim();
    const search = String(req.query.search || '').trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100);

    const pageSize = Math.min(Number(req.query.page_size) || 100, 500);
    const schools = await wizklubApi.listAllSchools(accessToken, { pageSize });

    const autoSync = req.query.autoSyncDivisions !== 'false';
    let divisionsEnsured = null;
    if (autoSync) {
      divisionsEnsured = await wizklubRegionService.ensureDivisionsFromSchools(schools);
    }

    const [registeredCodesList, divisionLookup, amDivisionIds, amByDivisionId] = await Promise.all([
      School.find().select('code').lean(),
      wizklubRegionService.buildDivisionLookup(),
      wizklubRegionService.loadAmDivisionIds(),
      wizklubRegionService.loadAmByDivisionId(),
    ]);

    const operationalLookup = loadOperationalVerification();

    const registeredCodes = new Set(
      registeredCodesList
        .map((school) => String(school.code || '').trim().toLowerCase())
        .filter(Boolean),
    );

    const enrichCtx = {
      divisionLookup,
      registeredCodes,
      amDivisionIds,
      amByDivisionId,
      operationalLookup,
    };

    const enriched = schools.map((school) => wizklubRegionService.enrichWizklubSchool(school, enrichCtx));

    const withRegion = enriched.filter((s) => !s.needsRegionAssignment);
    const needsRegion = enriched.filter((s) => s.needsRegionAssignment);
    const readyToRegister = enriched.filter((s) => s.readyToRegister);

    const mapped = enriched.filter((s) => s.mappingStatus === 'mapped' || s.mappingStatus === 'registered');
    const notMapped = enriched.filter((s) => s.mappingStatus === 'not_mapped');

    const operationalInCatalog = enriched.filter((s) => s.inOperationalList);
    const operationalMapped = operationalInCatalog.filter(
      (s) => s.mappingStatus === 'mapped' || s.mappingStatus === 'registered',
    );
    const operationalNotMapped = operationalInCatalog.filter((s) => s.mappingStatus === 'not_mapped');
    const operationalGaps = (operationalLookup.rows || []).filter(
      (row) => row.status === 'not_found' || row.status === 'found_not_mapped' || row.status === 'missing_region',
    );

    const pendingRegisterCount = mapped.filter((s) => s.mappingStatus === 'mapped').length;

    const payload = {
      total: enriched.length,
      withRegionCount: withRegion.length,
      needsRegionCount: needsRegion.length,
      readyToRegisterCount: readyToRegister.length,
      mappedCount: mapped.length,
      notMappedCount: notMapped.length,
      pendingRegisterCount,
      divisionsCreated: divisionsEnsured?.created?.length || 0,
      operationalList: {
        total: operationalLookup.summary?.total || operationalInCatalog.length,
        inCatalog: operationalInCatalog.length,
        mapped: operationalMapped.length,
        notMapped: operationalNotMapped.length,
        gaps: operationalGaps.length,
        summary: operationalLookup.summary,
        gapsNotInWizklub: operationalGaps.filter((row) => row.status === 'not_found'),
        gapsInWizklub: operationalGaps.filter((row) => row.status !== 'not_found'),
      },
    };

    if (mapping === 'mapped' || mapping === 'not_mapped') {
      const filtered = filterWizklubRegistrySchools(enriched, { mapping, search, scope });
      const totalFiltered = filtered.length;
      const totalPages = Math.max(1, Math.ceil(totalFiltered / limit));
      const safePage = Math.min(page, totalPages);
      const start = (safePage - 1) * limit;
      payload.data = filtered.slice(start, start + limit);
      payload.page = safePage;
      payload.limit = limit;
      payload.totalFiltered = totalFiltered;
      payload.totalPages = totalPages;
    }

    if (includeSchools) {
      payload.schools = enriched;
      payload.mapped = mapped;
      payload.notMapped = notMapped;
      payload.withRegion = withRegion;
      payload.needsRegion = needsRegion;
      payload.readyToRegister = readyToRegister;
    }

    res.json(payload);
  } catch (error) {
    res.status(error.status || 500).json({
      message: error.message || 'Failed to load schools from WizKlub',
    });
  }
};

const syncWizklubRegions = async (req, res) => {
  try {
    const accessToken = readWizklubAccessToken(req);
    if (!accessToken) {
      return res.status(400).json({
        message: 'WizKlub session expired or missing. Sign in again through the admin portal.',
      });
    }

    const pageSize = Math.min(Number(req.body?.page_size) || 100, 500);
    const schools = await wizklubApi.listAllSchools(accessToken, { pageSize });
    const result = await wizklubRegionService.syncRegionsFromSchools(schools);

    res.json({
      message: `Synced ${result.regionsFound} WizKlub regions (${result.created.length} division(s) created)`,
      ...result,
    });
  } catch (error) {
    res.status(error.status || 500).json({
      message: error.message || 'Failed to sync WizKlub regions',
    });
  }
};

const getWizklubRegionMappings = async (req, res) => {
  try {
    const divisions = await Division.find()
      .populate('regionalManagerId', 'name email')
      .sort({ wizklubRegionName: 1, name: 1 })
      .lean();

    res.json({ divisions });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || 'Failed to load region mappings' });
  }
};

const registerWizklubSchoolsBulk = async (req, res) => {
  try {
    const accessToken = readWizklubAccessToken(req);
    if (!accessToken) {
      return res.status(400).json({
        message: 'WizKlub session expired or missing. Sign in again through the admin portal.',
      });
    }

    const { schoolIds, registerAllReady, registerAllWithRegion } = req.body || {};
    const pageSize = Math.min(Number(req.body?.page_size) || 100, 500);
    const schools = await wizklubApi.listAllSchools(accessToken, { pageSize });

    const [registeredCodesList, divisionLookup, amDivisionIds] = await Promise.all([
      School.find().select('code').lean(),
      wizklubRegionService.buildDivisionLookup(),
      wizklubRegionService.loadAmDivisionIds(),
    ]);

    const registeredCodes = new Set(
      registeredCodesList
        .map((school) => String(school.code || '').trim().toLowerCase())
        .filter(Boolean),
    );

    let ids = Array.isArray(schoolIds) ? schoolIds : null;
    if (registerAllWithRegion) {
      ids = schools
        .map((s) => String(s.id || s.code))
        .filter((id) => {
          const school = schools.find((x) => String(x.id || x.code) === id);
          const codeKey = String(school?.code || school?.id || id).trim().toLowerCase();
          if (registeredCodes.has(codeKey)) return false;
          const enriched = wizklubRegionService.enrichWizklubSchool(school, {
            divisionLookup, registeredCodes, amDivisionIds,
          });
          return enriched.mappingStatus === 'mapped';
        });
    } else if (registerAllReady) {
      ids = schools
        .filter((s) => wizklubRegionService.hasRegionAssignment(s))
        .map((s) => String(s.id || s.code))
        .filter((id) => {
          const enriched = wizklubRegionService.enrichWizklubSchool(
            schools.find((x) => String(x.id || x.code) === id),
            { divisionLookup, registeredCodes, amDivisionIds },
          );
          return enriched.readyToRegister;
        });
    }

    const report = await bulkRegisterWizklubSchools(schools, {
      divisionLookup,
      amDivisionIds,
      registeredCodes,
      schoolIds: ids,
    });

    res.json({
      message: `Registered ${report.registered.length} school(s)`,
      summary: {
        registered: report.registered.length,
        skippedAlreadyRegistered: report.skippedAlreadyRegistered.length,
        skippedNoRegion: report.skippedNoRegion.length,
        skippedNoDivision: report.skippedNoDivision.length,
        skippedNoAm: report.skippedNoAm.length,
        skippedNoEmail: report.skippedNoEmail.length,
        failed: report.failed.length,
      },
      report,
    });
  } catch (error) {
    res.status(error.status || 500).json({
      message: error.message || 'Bulk registration failed',
    });
  }
};

const syncOperationalAms = async (req, res) => {
  try {
    const result = await syncOperationalAmsToDivisions();
    res.json({
      message: `Assigned ${result.divisionsAssigned.length} division(s) to operational Account Managers`,
      ...result,
    });
  } catch (error) {
    res.status(error.status || 500).json({
      message: error.message || 'Failed to sync operational Account Managers',
    });
  }
};

const downloadDispatchInvoice = async (req, res) => {
  try {
    const { buffer, filename } = await generateDispatchInvoicePdf(req.params.id);
    sendInvoicePdf(res, buffer, filename);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

module.exports = {
  createDispatch,
  generateDispatchForReplacement,
  approveReplacement,
  rejectReplacement,
  approveReceiptIssue,
  shipReceiptIssueReplacement,
  rejectReceiptIssue,
  requestReceiptIssueClarification,
  updateDispatchTracking,
  downloadDispatchInvoice,
  getReports,
  getDashboardStats,
  getAllSchools,
  getWizklubSchools,
  syncWizklubRegions,
  getWizklubRegionMappings,
  registerWizklubSchoolsBulk,
  syncOperationalAms,
};
