const crypto = require('crypto');
const { models, services, utils } = require('../../core');
const { fileUrl } = utils;

const Dispatch = models.Dispatch;
const ReceiptIssue = models.ReceiptIssue;
const AuditReport = models.AuditReport;
const ReplacementRequest = models.ReplacementRequest;
const auditService = services.auditService;
const auditSubmissionService = services.auditSubmissionService;
const monthlyReportService = services.monthlyReportService;
const replacementService = services.replacementService;
const schoolReplacementService = services.schoolReplacementService;
const schoolInventoryService = services.schoolInventoryService;
const notificationService = services.notificationService;
const receiptIssueService = services.receiptIssueService;
const { fetchSchoolDispatchHub } = services.dispatchHubService;
const { dedupeDuplicateConsignmentKitLines } = services.dispatchConsignmentService;

const generateUniqueReplacementId = async () => {
  for (let i = 0; i < 5; i++) {
    const shortRandom = crypto.randomBytes(3).toString('hex').toUpperCase();
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const candidate = `REPL-${datePart}-${shortRandom}`;

    // eslint-disable-next-line no-await-in-loop
    const exists = await ReplacementRequest.exists({ replacementId: candidate });
    if (!exists) return candidate;
  }

  const shortRandom = crypto.randomBytes(6).toString('hex').toUpperCase();
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `REPL-${datePart}-${shortRandom}`;
};

const confirmDelivery = async (req, res) => {
  try {
    if (!req.user.schoolId) {
      return res.status(400).json({ message: 'User is not associated with a school' });
    }

    const { id } = req.params;
    const receiptType = req.body.receiptType || 'partial';
    const receiverName = req.body.receiverName?.trim() || '';
    const receivedDate = req.body.receivedDate?.trim() || '';
    const receiptNotes = req.body.receiptNotes?.trim() || '';

    if (!receiverName) {
      return res.status(400).json({ message: 'Receiver name is required' });
    }

    if (!receivedDate) {
      return res.status(400).json({ message: 'Received date is required' });
    }

    const parsedReceivedAt = new Date(receivedDate);
    if (Number.isNaN(parsedReceivedAt.getTime())) {
      return res.status(400).json({ message: 'Valid received date is required' });
    }

    if (receiptType === 'partial') {
      return res.status(400).json({ message: 'Use Report Issue (Option B) for partial receipts with issues' });
    }

    let quantityReceived = Number(req.body.quantityReceived);
    const lostQuantity = Number(req.body.lostQuantity || 0);
    const damagedQuantity = Number(req.body.damagedQuantity || 0);

    const isEdit = req.body.isEdit === 'true';
    if (isEdit) {
      return res.status(400).json({ message: 'Acknowledged shipments cannot be edited' });
    }

    const dispatch = await Dispatch.findById(id).populate('kit');
    if (!dispatch) {
      return res.status(404).json({ message: 'Dispatch not found' });
    }

    if (String(dispatch.school) !== String(req.user.schoolId)) {
      return res.status(403).json({ message: 'Not authorized for this dispatch' });
    }

    if (dispatch.status !== 'Dispatched') {
      const issue = dispatch.receiptIssue
        ? await ReceiptIssue.findById(dispatch.receiptIssue)
        : null;
      const replacementAck = receiptIssueService.isReplacementAwaitingAck(dispatch, issue);
      receiptIssueService.debugLog('H4', 'schoolController.js:confirmDelivery:replacementCheck', 'non-dispatched confirm', {
        dispatchStatus: dispatch.status,
        issueStatus: issue?.status,
        replacementAck,
        receiptType,
      });
      if (!replacementAck) {
        return res.status(400).json({ message: 'This dispatch is not awaiting receipt acknowledgment' });
      }
    }

    const sent = dispatch.quantity;

    if (receiptType === 'all_received') {
      quantityReceived = sent;
    } else if (receiptType === 'not_received') {
      quantityReceived = 0;
    } else if (Number.isNaN(quantityReceived) || quantityReceived < 0) {
      return res.status(400).json({ message: 'Valid quantity received is required' });
    }

    const shortfall = sent - quantityReceived;

    if (quantityReceived > sent) {
      return res.status(400).json({ message: `Received quantity cannot exceed ${sent} kits sent` });
    }

    if (shortfall > 0) {
      if (lostQuantity + damagedQuantity !== shortfall) {
        return res.status(400).json({
          message: `Lost (${lostQuantity}) + damaged (${damagedQuantity}) must equal ${shortfall} missing kits`,
        });
      }
      const damagedFile = req.files?.damagedImage?.[0];
      if (damagedQuantity > 0 && !damagedFile) {
        return res.status(400).json({ message: 'Photo is required when reporting damaged kits' });
      }
    } else if (lostQuantity > 0 || damagedQuantity > 0) {
      return res.status(400).json({ message: 'Lost/damaged quantities apply only when received is less than sent' });
    }

    const damagedImageUrl = fileUrl(req.files?.damagedImage?.[0]);
    const deliveryPhotoUrl = fileUrl(req.files?.deliveryPhoto?.[0]);

    dispatch.quantityReceived = quantityReceived;
    dispatch.lostOnReceipt = shortfall > 0 ? lostQuantity : 0;
    dispatch.damagedOnReceipt = shortfall > 0 ? damagedQuantity : 0;
    dispatch.damagedImageUrl = damagedImageUrl;
    dispatch.deliveryPhotoUrl = deliveryPhotoUrl;
    dispatch.receiverName = receiverName;
    dispatch.receiptNotes = receiptNotes;
    dispatch.receivedAt = parsedReceivedAt;

    if (receiptType === 'all_received') {
      dispatch.status = 'Delivery Completed';
    } else if (quantityReceived > 0) {
      dispatch.status = 'Received';
    } else {
      dispatch.status = 'Not Received';
    }

    await dispatch.save();

    if (receiptType === 'all_received' && dispatch.receiptIssue) {
      await receiptIssueService.completeReplacementReceipt(dispatch);
    }

    if (quantityReceived > 0) {
      await schoolInventoryService.addStock(dispatch.school, dispatch.kit, quantityReceived);
    }

    const mismatchNote = `Dispatch ${dispatch.dispatchId || dispatch._id} receipt`;

    if (lostQuantity > 0) {
      await replacementService.createRequest(
        dispatch.school,
        req.user._id,
        dispatch.kit._id || dispatch.kit,
        'Lost',
        lostQuantity,
        `${mismatchNote}: ${lostQuantity} kit(s) lost on delivery.${receiptNotes ? ` Notes: ${receiptNotes}` : ''}`,
        null
      );
    }

    if (damagedQuantity > 0) {
      await replacementService.createRequest(
        dispatch.school,
        req.user._id,
        dispatch.kit._id || dispatch.kit,
        'Damaged',
        damagedQuantity,
        `${mismatchNote}: ${damagedQuantity} kit(s) damaged on delivery.${receiptNotes ? ` Notes: ${receiptNotes}` : ''}`,
        damagedImageUrl
      );
    }

    if (req.body.suppressNotification !== 'true') {
      const receiptCategory = receiptType === 'all_received'
        ? 'all_received'
        : receiptType === 'not_received'
          ? 'not_received'
          : 'report_issue';

      await notificationService.notifyDeliveryConfirmation(dispatch, { receiptCategory });
    }

    const warehouse = await schoolInventoryService.getWarehouseForSchool(req.user.schoolId);

    res.json({ dispatch, warehouse });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getWarehouse = async (req, res) => {
  try {
    if (!req.user.schoolId) {
      return res.status(400).json({ message: 'User is not associated with a school' });
    }

    const inventory = await schoolInventoryService.getStockMap(req.user.schoolId);
    res.json({ inventory });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const submitAudit = async (req, res) => {
  try {
    if (!req.user.schoolId) {
      return res.status(400).json({ message: 'User is not associated with a school' });
    }

    const month = req.body.month;
    let items;
    try {
      items = typeof req.body.items === 'string' ? JSON.parse(req.body.items) : req.body.items;
    } catch {
      return res.status(400).json({ message: 'Invalid audit items payload' });
    }

    const report = await auditSubmissionService.submitAudit(
      req.user.schoolId,
      req.user._id,
      month,
      items,
      req.files || []
    );

    res.status(201).json(report);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const getAuditForm = async (req, res) => {
  try {
    if (!req.user.schoolId) {
      return res.status(400).json({ message: 'User is not associated with a school' });
    }
    const resolved = await auditService.resolveAuditWindowForSchool(
      req.user.schoolId,
      req.query.month || null,
    );
    const form = await auditSubmissionService.getAuditFormForSchool(
      req.user.schoolId,
      resolved.month,
    );
    res.json(form);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getAuditHistory = async (req, res) => {
  try {
    if (!req.user.schoolId) {
      return res.status(400).json({ message: 'User is not associated with a school' });
    }
    const history = await auditSubmissionService.listAuditsForSchool(req.user.schoolId, {
      month: req.query.month || undefined,
    });
    res.json(history);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createReplacementRequest = async (req, res) => {
  try {
    return res.status(403).json({
      message: 'Manual replacement requests are disabled. Report lost and damaged kits during the monthly audit only.',
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getDispatches = async (req, res) => {
  try {
    if (!req.user.schoolId) {
      return res.status(400).json({ message: 'User is not associated with a school' });
    }

    await dedupeDuplicateConsignmentKitLines();
    const repairCountBefore = await Dispatch.countDocuments({ school: req.user.schoolId });
    await receiptIssueService.repairAllSplitReceiptIssues();
    receiptIssueService.debugLog('H6', 'schoolController.js:getDispatches', 'repair complete', {
      schoolId: String(req.user.schoolId),
      dispatchCountBefore: repairCountBefore,
    });

    const dispatches = await Dispatch.find({ school: req.user.schoolId })
      .populate('kit')
      .populate('reportingManager', 'name email')
      .sort({ createdAt: -1 });
    const dispatchesNeedingId = dispatches.filter(d => !d.dispatchId);
    for (const d of dispatchesNeedingId) {
      await Dispatch.updateOne(
        { _id: d._id },
        { $set: { dispatchId: d._id.toString() } },
        { runValidators: false }
      );
    }
    const dispatchesNeedingCategory = dispatches.filter(d => !d.category);
    for (const d of dispatchesNeedingCategory) {
      await Dispatch.updateOne(
        { _id: d._id },
        { $set: { category: 'New Dispatch' } },
        { runValidators: false }
      );
    }

    const dispatchIds = dispatches.map((d) => d._id);
    const receiptIssues = await ReceiptIssue.find({
      $or: [
        { dispatch: { $in: dispatchIds } },
        { replacementDispatch: { $in: dispatchIds } },
      ],
    })
      .populate('replacementDispatch', 'dispatchId consignmentNo status quantity')
      .populate('kit', 'name kitId');
    const issuesByDispatch = {};
    const orphanReplacementIds = new Set();
    for (const issue of receiptIssues) {
      const dispatchRef = issue.dispatch ? String(issue.dispatch._id || issue.dispatch) : null;
      const replacementRef = issue.replacementDispatch
        ? String(issue.replacementDispatch._id || issue.replacementDispatch)
        : null;
      if (dispatchRef && replacementRef && dispatchRef !== replacementRef) {
        orphanReplacementIds.add(replacementRef);
      }
      const key = String(issue.dispatch?._id || issue.dispatch);
      if (!key || key === 'undefined') continue;
      if (!issuesByDispatch[key]) issuesByDispatch[key] = [];
      issuesByDispatch[key].push(issue);
    }

    const payload = await Promise.all(
      dispatches
        .filter((d) => !orphanReplacementIds.has(String(d._id)))
        .map(async (d) => {
      const obj = d.toObject();
      const dispatchIssues = issuesByDispatch[String(d._id)] || [];
      obj.receiptIssues = dispatchIssues;
      obj.receiptIssue = dispatchIssues.find((i) => i.status !== 'Rejected') || dispatchIssues[0] || null;
      obj.canEditReceipt = false;
      return obj;
    }));

    res.json(payload);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getReplacementHistory = async (req, res) => {
  try {
    if (!req.user.schoolId) {
      return res.status(400).json({ message: 'User is not associated with a school' });
    }

    const history = await schoolReplacementService.getSchoolReplacementHistory(req.user.schoolId);
    res.json(history);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const reportReceiptIssues = async (req, res) => {
  try {
    if (!req.user.schoolId) {
      return res.status(400).json({ message: 'User is not associated with a school' });
    }

    const receiverName = req.body.receiverName?.trim() || '';
    const receivedDate = req.body.receivedDate?.trim() || '';
    const receiptNotes = req.body.receiptNotes?.trim() || '';

    let items;
    try {
      items = JSON.parse(req.body.items || '[]');
    } catch {
      return res.status(400).json({ message: 'Invalid items payload' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'At least one item is required' });
    }

    const notReceivedOnly = items.every((item) => item.issueType === 'Shipment Not Received');

    if (!notReceivedOnly) {
      if (!receiverName) {
        return res.status(400).json({ message: 'Receiver name is required' });
      }
      if (!receivedDate) {
        return res.status(400).json({ message: 'Received date is required' });
      }
    }

    const parsedReceivedAt = notReceivedOnly
      ? new Date()
      : new Date(receivedDate);
    if (!notReceivedOnly && Number.isNaN(parsedReceivedAt.getTime())) {
      return res.status(400).json({ message: 'Valid received date is required' });
    }

    const filesByField = {};
    for (const file of req.files || []) {
      filesByField[file.fieldname] = file;
    }

    const getPhotosForItem = (index, maxCount) => {
      const found = [];
      for (let i = 0; i < maxCount; i += 1) {
        const file = filesByField[`item_${index}_photo_${i}`];
        if (file) found.push(file);
      }
      return found;
    };

    const getVideoForItem = (index) => filesByField[`item_${index}_video`] || null;

    const issueRecords = [];
    const dispatchUpdates = [];

    if (req.body.isEdit === 'true') {
      if (items.length !== 1) {
        return res.status(400).json({ message: 'Edit one dispatch at a time' });
      }

      const item = items[0];
      const dispatch = await Dispatch.findById(item.dispatchId).populate('kit');
      if (!dispatch) {
        return res.status(404).json({ message: 'Dispatch not found' });
      }
      if (String(dispatch.school) !== String(req.user.schoolId)) {
        return res.status(403).json({ message: 'Not authorized for this dispatch' });
      }

      const issue = dispatch.receiptIssue
        ? await ReceiptIssue.findById(dispatch.receiptIssue)
        : null;
      if (!issue || !receiptIssueService.schoolCanEditDispatch(dispatch, [issue])) {
        return res.status(400).json({
          message: 'This acknowledgment can no longer be edited — it may be under AM or Admin review',
        });
      }

      const sent = dispatch.quantity;
      const issueType = item.issueType || issue.issueType;
      if (!receiptIssueService.ISSUE_TYPES.includes(issueType)) {
        return res.status(400).json({ message: 'Invalid issue type' });
      }

      const quantityReceived = issueType === 'Shipment Not Received'
        ? 0
        : Number(item.quantityReceived);
      if (Number.isNaN(quantityReceived) || quantityReceived < 0 || quantityReceived > sent) {
        return res.status(400).json({ message: `Invalid received quantity for ${dispatch.kit?.name || 'kit'}` });
      }

      const quantityAffected = sent - quantityReceived;
      if (quantityAffected < 1) {
        return res.status(400).json({ message: `Issue quantity must be at least 1 for ${dispatch.kit?.name}` });
      }

      const photos = getPhotosForItem(0, 5);
      const videoFile = getVideoForItem(0);
      const hasExistingEvidence = (issue.photoUrls?.length || 0) > 0 || (issue.videoUrls?.length || 0) > 0;
      if (photos.length < 1 && !videoFile && !hasExistingEvidence) {
        return res.status(400).json({ message: 'Photo or video evidence is required' });
      }

      if (photos.length) {
        issue.photoUrls = photos.map((f) => fileUrl(f)).filter(Boolean);
      }
      if (videoFile) {
        issue.videoUrls = [fileUrl(videoFile)].filter(Boolean);
      }

      issue.issueType = issueType;
      issue.quantityReceived = quantityReceived;
      issue.quantityAffected = quantityAffected;
      issue.quantitySent = sent;
      issue.remarks = item.remarks?.trim() || receiptNotes || issue.remarks;
      issue.receiverName = receiverName;
      issue.receivedAt = parsedReceivedAt;

      if (issueType === 'Damaged Product') {
        const damageDescription = item.damageDescription?.trim();
        const severity = item.severity;
        if (!damageDescription) {
          return res.status(400).json({ message: 'Damage description is required for damaged items' });
        }
        if (!['Minor Damage', 'Major Damage'].includes(severity)) {
          return res.status(400).json({ message: 'Severity (Minor/Major) is required for damaged items' });
        }
        issue.damageDescription = damageDescription;
        issue.severity = severity;
      } else {
        issue.damageDescription = undefined;
        issue.severity = undefined;
      }

      if (!issue.remarks?.trim() && !receiptNotes) {
        return res.status(400).json({ message: `Remarks are required for ${issueType}` });
      }

      dispatch.quantityReceived = quantityReceived;
      dispatch.receiverName = receiverName;
      dispatch.receivedAt = parsedReceivedAt;
      dispatch.receiptNotes = receiptNotes;
      dispatch.lostOnReceipt = issueType === 'Missing Product' || issueType === 'Quantity Mismatch' || issueType === 'Shipment Not Received'
        ? sent - quantityReceived
        : 0;
      dispatch.damagedOnReceipt = issueType === 'Damaged Product' ? sent - quantityReceived : 0;
      dispatch.status = receiptIssueService.dispatchStatusForIssueType(issueType);

      await issue.save();
      await dispatch.save();

      const warehouse = await schoolInventoryService.getWarehouseForSchool(req.user.schoolId);
      return res.json({ issues: [issue], dispatches: [dispatch], warehouse });
    }

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      const dispatch = await Dispatch.findById(item.dispatchId).populate('kit');
      if (!dispatch) {
        return res.status(404).json({ message: `Dispatch not found: ${item.dispatchId}` });
      }
      if (String(dispatch.school) !== String(req.user.schoolId)) {
        return res.status(403).json({ message: 'Not authorized for one or more dispatches' });
      }

      const activeIssue = dispatch.receiptIssue
        ? await ReceiptIssue.findById(dispatch.receiptIssue)
        : null;

      const legacyNotReceived = dispatch.status === 'Not Received' && !dispatch.receiptIssue
        && item.issueType === 'Shipment Not Received';
      const redispatchedAwaitingSchool = activeIssue?.status === 'Approved'
        && (
          dispatch.status === 'Dispatched'
          || ['missing_dispatch', 'damaged_dispatch', 'mismatch_dispatch', 'not_received_dispatch']
            .includes(dispatch.status)
        );
      const canReportFresh = dispatch.status === 'Dispatched' || redispatchedAwaitingSchool || legacyNotReceived;

      if (!canReportFresh) {
        let message;
        if (['Pending AM Approval', 'Pending Admin Approval', 'Clarification Requested'].includes(activeIssue?.status)
          || (
            !redispatchedAwaitingSchool
            && (
              dispatch.status === 'Received with Issues'
              || dispatch.status === 'missing_dispatch'
              || dispatch.status === 'damaged_dispatch'
              || dispatch.status === 'mismatch_dispatch'
              || dispatch.status === 'not_received_dispatch'
            )
          )) {
          message = `Dispatch ${dispatch.dispatchId} already has a reported issue pending review`;
        } else if (dispatch.status === 'Delivery Completed' || dispatch.status === 'Received') {
          message = `Dispatch ${dispatch.dispatchId} was already marked as received`;
        } else if (dispatch.status === 'Not Received') {
          message = `Dispatch ${dispatch.dispatchId} was already marked as not received`;
        } else {
          message = `Dispatch ${dispatch.dispatchId} is not awaiting acknowledgment (status: ${dispatch.status})`;
        }
        return res.status(400).json({ message });
      }

      const sent = dispatch.quantity;
      const quantityReceived = Number(item.quantityReceived);
      const issueType = item.issueType;

      if (Number.isNaN(quantityReceived) || quantityReceived < 0 || quantityReceived > sent) {
        return res.status(400).json({ message: `Invalid received quantity for ${dispatch.kit?.name || 'kit'}` });
      }

      if (!issueType || issueType === 'None') {
        continue;
      }

      if (!receiptIssueService.ISSUE_TYPES.includes(issueType)) {
        return res.status(400).json({ message: `Invalid issue type: ${issueType}` });
      }

      if (issueType === 'Shipment Not Received' && quantityReceived !== 0) {
        return res.status(400).json({ message: 'Shipment not received must have zero kits received' });
      }

      const quantityAffected = sent - quantityReceived;
      if (quantityAffected < 1) {
        return res.status(400).json({ message: `Issue quantity must be at least 1 for ${dispatch.kit?.name}` });
      }

      const photos = getPhotosForItem(index, 5);
      const videoFile = getVideoForItem(index);
      if (issueType !== 'Shipment Not Received' && photos.length < 1 && !videoFile) {
        return res.status(400).json({
          message: `Photo or video evidence is required for ${dispatch.kit?.name || 'kit'}`,
        });
      }

      const photoUrls = issueType === 'Shipment Not Received'
        ? []
        : photos.map((f) => fileUrl(f)).filter(Boolean);
      const videoUrls = issueType === 'Shipment Not Received'
        ? []
        : (videoFile ? [fileUrl(videoFile)].filter(Boolean) : []);
      const baseRecord = {
        dispatch: dispatch._id,
        kit: dispatch.kit._id || dispatch.kit,
        consignmentNo: dispatch.consignmentNo,
        sourceDispatchRef: dispatch.dispatchId,
        originalKitId: dispatch.kitId || dispatch.componentId || '',
        originalCategory: dispatch.category || 'New Dispatch',
        issueType,
        quantitySent: sent,
        quantityReceived,
        quantityAffected,
        photoUrls,
        videoUrls,
        remarks: issueType === 'Shipment Not Received'
          ? 'Shipment not received'
          : (item.remarks?.trim() || receiptNotes),
      };

      if (issueType === 'Damaged Product') {
        const damageDescription = item.damageDescription?.trim();
        const severity = item.severity;
        if (!damageDescription) {
          return res.status(400).json({ message: 'Damage description is required for damaged items' });
        }
        if (!['Minor Damage', 'Major Damage'].includes(severity)) {
          return res.status(400).json({ message: 'Severity (Minor/Major) is required for damaged items' });
        }
        issueRecords.push({ ...baseRecord, damageDescription, severity });
      } else if (issueType === 'Shipment Not Received') {
        issueRecords.push(baseRecord);
      } else {
        if (!item.remarks?.trim() && !receiptNotes) {
          return res.status(400).json({ message: `Remarks are required for ${issueType}` });
        }
        issueRecords.push(baseRecord);
      }

      dispatchUpdates.push({
        dispatch,
        quantityReceived,
        issueType,
        priorApprovedIssueId: activeIssue?.status === 'Approved' ? activeIssue._id : null,
      });
    }

    if (issueRecords.length === 0) {
      return res.status(400).json({ message: 'Report at least one issue with an issue type selected' });
    }

    const createdIssues = await receiptIssueService.createReceiptIssues({
      issues: issueRecords,
      schoolId: req.user.schoolId,
      reportedBy: req.user._id,
      receiverName,
      receivedAt: parsedReceivedAt,
    });

    for (let i = 0; i < dispatchUpdates.length; i += 1) {
      const { dispatch, quantityReceived, issueType, priorApprovedIssueId } = dispatchUpdates[i];
      const issue = createdIssues[i];

      if (priorApprovedIssueId) {
        await ReceiptIssue.findByIdAndUpdate(priorApprovedIssueId, {
          status: 'Superseded',
          supersededBy: issue._id,
        });
      }

      dispatch.quantityReceived = quantityReceived;
      dispatch.receiverName = issueType === 'Shipment Not Received' ? null : receiverName;
      dispatch.receivedAt = parsedReceivedAt;
      dispatch.receiptNotes = issueType === 'Shipment Not Received' ? null : receiptNotes;
      dispatch.lostOnReceipt = issueType === 'Missing Product' || issueType === 'Quantity Mismatch' || issueType === 'Shipment Not Received'
        ? dispatch.quantity - quantityReceived
        : 0;
      dispatch.damagedOnReceipt = issueType === 'Damaged Product' ? dispatch.quantity - quantityReceived : 0;
      dispatch.status = receiptIssueService.dispatchStatusForIssueType(issueType);
      dispatch.receiptIssue = issue._id;
      await dispatch.save();

      if (quantityReceived > 0) {
        await schoolInventoryService.addStock(dispatch.school, dispatch.kit, quantityReceived);
      }
    }

    await notificationService.notifyReceiptAcknowledgment({
      receiptCategory: 'report_issue',
      dispatchIds: dispatchUpdates.map((u) => u.dispatch._id),
      issueIds: createdIssues.map((i) => i._id),
      receiverName,
      receivedAt: parsedReceivedAt,
      receiptNotes,
    });

    const warehouse = await schoolInventoryService.getWarehouseForSchool(req.user.schoolId);

    res.json({
      issues: createdIssues,
      dispatches: dispatchUpdates.map((u) => u.dispatch),
      warehouse,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const notifyReceiptAcknowledgmentHandler = async (req, res) => {
  try {
    if (!req.user.schoolId) {
      return res.status(400).json({ message: 'User is not associated with a school' });
    }

    const { receiptCategory, dispatchIds, receiverName, receivedDate, receiptNotes, issueIds = [] } = req.body;

    if (!receiptCategory || !dispatchIds?.length) {
      return res.status(400).json({ message: 'receiptCategory and dispatchIds are required' });
    }

    const owned = await Dispatch.countDocuments({
      _id: { $in: dispatchIds },
      school: req.user.schoolId,
    });

    if (owned !== dispatchIds.length) {
      return res.status(403).json({ message: 'Not authorized for one or more dispatches' });
    }

    await notificationService.notifyReceiptAcknowledgment({
      receiptCategory,
      dispatchIds,
      issueIds,
      receiverName,
      receivedAt: receivedDate ? new Date(receivedDate) : new Date(),
      receiptNotes,
    });

    res.json({ sent: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const resetReceiptAcknowledgment = async (req, res) => {
  try {
    if (!req.user.schoolId) {
      return res.status(400).json({ message: 'User is not associated with a school' });
    }

    const dispatch = await Dispatch.findById(req.params.id).populate('kit');
    if (!dispatch) {
      return res.status(404).json({ message: 'Dispatch not found' });
    }
    if (String(dispatch.school) !== String(req.user.schoolId)) {
      return res.status(403).json({ message: 'Not authorized for this dispatch' });
    }

    const issues = await ReceiptIssue.find({ dispatch: dispatch._id });
    const activeIssues = issues.filter((i) => i.status !== 'Rejected');
    if (!receiptIssueService.schoolCanEditDispatch(dispatch, activeIssues)) {
      return res.status(400).json({
        message: 'This acknowledgment can no longer be edited — it may be under AM or Admin review',
      });
    }

    await receiptIssueService.resetDispatchReceiptForEdit(dispatch);
    const refreshed = await Dispatch.findById(dispatch._id).populate('kit').populate('reportingManager', 'name email');
    res.json({ dispatch: refreshed });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const getAuditWindowStatus = async (req, res) => {
  try {
    if (!req.user.schoolId) {
      return res.status(400).json({ message: 'User is not associated with a school' });
    }

    const resolved = await auditService.resolveAuditWindowForSchool(req.user.schoolId);

    res.json({
      month: resolved.month,
      open: resolved.open,
      window: resolved.window
        ? {
            startDate: resolved.window.startDate,
            endDate: resolved.window.endDate,
            auditMonth: resolved.window.auditMonth,
          }
        : null,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getDispatchHub = async (req, res) => {
  try {
    if (!req.user.schoolId) {
      return res.status(400).json({ message: 'User is not associated with a school' });
    }

    const result = await fetchSchoolDispatchHub({
      schoolId: req.user.schoolId,
      month: req.query.month,
      section: req.query.section,
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getOperationsReport = async (req, res) => {
  try {
    if (!req.user.schoolId) {
      return res.status(400).json({ message: 'User is not associated with a school' });
    }
    const month = req.query.month || monthlyReportService.currentMonth();
    const data = await monthlyReportService.getMonthlyReport(month, {
      schoolIds: [req.user.schoolId],
    });
    res.json({
      summary: data.summary,
      school: data.schools[0] || null,
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

const downloadOperationsPdf = async (req, res) => {
  try {
    if (!req.user.schoolId) {
      return res.status(400).json({ message: 'User is not associated with a school' });
    }
    const month = req.query.month || monthlyReportService.currentMonth();
    const { generateSchoolConsolidatedReportPdf } = services.schoolConsolidatedReportPdf;
    const buffer = await generateSchoolConsolidatedReportPdf(req.user.schoolId, month);
    const safeName = String(req.user.schoolId).replace(/[^a-zA-Z0-9-_]/g, '');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="wizklub-school-report-${safeName}-${month}.pdf"`);
    res.send(buffer);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

module.exports = {
  confirmDelivery,
  reportReceiptIssues,
  resetReceiptAcknowledgment,
  notifyReceiptAcknowledgmentHandler,
  getWarehouse,
  getAuditForm,
  getAuditHistory,
  submitAudit,
  createReplacementRequest,
  getDispatches,
  getDispatchHub,
  getReplacementHistory,
  getAuditWindowStatus,
  getOperationsReport,
  downloadOperationsPdf,
};
