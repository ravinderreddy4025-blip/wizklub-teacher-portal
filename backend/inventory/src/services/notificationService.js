const Notification = require('../models/Notification');
const User = require('../models/User');
const School = require('../models/School');
const Dispatch = require('../models/Dispatch');
const ReceiptIssue = require('../models/ReceiptIssue');
const { formatSchoolDisplayName } = require('../utils/schoolName');

const CATEGORY_LABELS = {
  all_received: 'Delivery Completed',
  report_issue: 'Received with Issues',
  not_received: 'Shipment Not Received',
  issue_am_approved: 'Issue Approved by AM',
  issue_admin_approved: 'Replacement Approved',
  issue_replacement_shipped: 'Replacement Dispatched',
  issue_rejected: 'Receipt Issue Rejected',
  issue_clarification: 'Clarification Requested',
};

async function getAdminAndAmRecipients(school) {
  const divisionId = school?.divisionId?._id || school?.divisionId;
  const admins = await User.find({ role: 'Admin' }).select('_id name email role');
  const ams = divisionId
    ? await User.find({ role: 'AM', divisionId }).select('_id name email role')
    : [];
  return [...admins, ...ams];
}

const notifyMismatch = async (schoolId, kitId, expected, available) => {
  const school = await School.findById(schoolId);
  const admins = await User.find({ role: 'Admin' });
  const ams = await User.find({ role: 'AM', divisionId: school.divisionId });

  const recipients = [...admins, ...ams];
  const message = `Audit mismatch for School ${formatSchoolDisplayName(school.name)}. Expected ${expected}, but found ${available} for kit ID ${kitId}.`;

  const notifications = recipients.map(user => ({
    recipient: user._id,
    type: 'AuditMismatch',
    message,
    relatedEntity: { entityType: 'School', entityId: schoolId }
  }));

  if (notifications.length > 0) {
    await Notification.insertMany(notifications);
  }
};

const notifyDispatchCreated = async (dispatch) => {
  await notifyDispatchCreatedBatch([dispatch]);
};

const notifyDispatchCreatedBatch = async (dispatches) => {
  if (!dispatches?.length) return;

  const dispatchTeam = await User.find({ role: 'Dispatch' }).select('_id');
  if (!dispatchTeam.length) return;

  const notifications = dispatches.flatMap((dispatch) => {
    const message = `New dispatch request created for School ${dispatch.school}. Kit ID ${dispatch.kit}, Quantity: ${dispatch.quantity}.`;
    return dispatchTeam.map((user) => ({
      recipient: user._id,
      type: 'DispatchCreated',
      message,
      relatedEntity: { entityType: 'Dispatch', entityId: dispatch._id },
    }));
  });

  if (notifications.length > 0) {
    await Notification.insertMany(notifications);
  }
};

const notifyReceiptAcknowledgment = async ({
  receiptCategory,
  dispatchIds,
  issueIds = [],
  receiverName,
  receivedAt,
  receiptNotes,
}) => {
  if (!dispatchIds?.length) return;

  const dispatches = await Dispatch.find({ _id: { $in: dispatchIds } })
    .populate('kit')
    .populate({ path: 'school', populate: { path: 'divisionId' } });

  if (!dispatches.length) return;

  const school = dispatches[0].school;
  const schoolDisplayName = formatSchoolDisplayName(school?.name);
  const recipients = await getAdminAndAmRecipients(school);

  const categoryLabel = CATEGORY_LABELS[receiptCategory] || dispatches[0].status;
  const kitSummary = dispatches.map((d) => `${d.kit?.name || 'Kit'} (${d.status})`).join(', ');

  const message = `${schoolDisplayName} — ${categoryLabel}. ${kitSummary}. Receiver: ${receiverName || '—'}.`;

  const notifications = recipients.map((user) => ({
    recipient: user._id,
    type: 'DeliveryConfirmation',
    message,
    relatedEntity: { entityType: 'Dispatch', entityId: dispatches[0]._id },
  }));

  if (notifications.length > 0) {
    await Notification.insertMany(notifications);
  }
};

const notifyDeliveryConfirmation = async (dispatch, options = {}) => {
  const receiptCategory = options.receiptCategory
    || (dispatch.status === 'Delivery Completed' || dispatch.status === 'Completed' ? 'all_received'
      : dispatch.status === 'Not Received' ? 'not_received'
        : 'report_issue');

  await notifyReceiptAcknowledgment({
    receiptCategory,
    dispatchIds: [dispatch._id],
    issueIds: options.issueIds || [],
    receiverName: dispatch.receiverName,
    receivedAt: dispatch.receivedAt,
    receiptNotes: dispatch.receiptNotes,
  });
};

const notifyReplacementApproval = async (request) => {
  const schoolUser = await User.findById(request.requestedBy);
  if (schoolUser) {
    await Notification.create({
      recipient: schoolUser._id,
      type: 'ReplacementApproval',
      message: `Your replacement request for kit size ${request.quantity} has been ${request.status}.`,
      relatedEntity: { entityType: 'ReplacementRequest', entityId: request._id }
    });
  }
};

const WORKFLOW_EVENT_CATEGORIES = {
  am_approved: 'issue_am_approved',
  am_rejected: 'issue_rejected',
  admin_approved: 'issue_admin_approved',
  admin_shipped: 'issue_replacement_shipped',
  admin_rejected: 'issue_rejected',
  clarification_requested: 'issue_clarification',
};

const notifyReceiptIssueWorkflow = async (issueId, event, extra = {}) => {
  const receiptCategory = WORKFLOW_EVENT_CATEGORIES[event];
  if (!receiptCategory) return;

  const issue = await ReceiptIssue.findById(issueId)
    .populate('kit')
    .populate({ path: 'dispatch', populate: 'kit' })
    .populate({ path: 'school', populate: { path: 'divisionId' } });

  if (!issue?.dispatch) return;

  const school = issue.school;
  const schoolDisplayName = formatSchoolDisplayName(school?.name);
  const recipients = await getAdminAndAmRecipients(school);

  const categoryLabel = CATEGORY_LABELS[receiptCategory];
  const message = `${schoolDisplayName} — ${categoryLabel}. ${issue.kit?.name || 'Kit'}: ${issue.issueType}.`;

  const notifications = recipients.map((user) => ({
    recipient: user._id,
    type: 'DeliveryConfirmation',
    message,
    relatedEntity: { entityType: 'ReceiptIssue', entityId: issue._id },
  }));

  if (notifications.length > 0) {
    await Notification.insertMany(notifications);
  }
};

module.exports = {
  notifyMismatch,
  notifyDispatchCreated,
  notifyDispatchCreatedBatch,
  notifyDeliveryConfirmation,
  notifyReceiptAcknowledgment,
  notifyReceiptIssueWorkflow,
  notifyReplacementApproval,
};
