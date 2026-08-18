const mongoose = require('mongoose');

const AUDIT_WORKFLOW_STATUSES = [
  'Pending AM Approval',
  'Pending Admin Approval',
  'Approved',
  'Rejected',
];

const AUDIT_LINE_AM_STATUSES = ['None', 'Pending', 'Approved', 'Rejected'];

const auditItemSchema = {
  kit: { type: mongoose.Schema.Types.ObjectId, ref: 'Kit', required: true },
  availableQuantity: { type: Number, required: true, default: 0, min: 0 },
  lostQuantity: { type: Number, required: true, default: 0, min: 0 },
  damagedQuantity: { type: Number, required: true, default: 0, min: 0 },
  warehouseQuantity: { type: Number, required: true, default: 0, min: 0 },
  expectedQuantity: { type: Number, required: true, default: 0 },
  dispatchedQuantity: { type: Number, default: 0 },
  replacementDeducted: { type: Number, default: 0 },
  lostEvidenceUrl: { type: String },
  lostEvidenceMime: { type: String },
  damagedEvidenceUrl: { type: String },
  damagedEvidenceMime: { type: String },
  lostDispatch: { type: mongoose.Schema.Types.ObjectId, ref: 'Dispatch' },
  damagedDispatch: { type: mongoose.Schema.Types.ObjectId, ref: 'Dispatch' },
};

const auditReportSchema = new mongoose.Schema({
  school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  month: { type: String, required: true },
  items: [auditItemSchema],
  status: { type: String, enum: ['Normal', 'Mismatch'], default: 'Normal' },
  /** Set when the official audit window ended with no school submission. */
  assumedIntact: { type: Boolean, default: false },
  assumedIntactAt: { type: Date },
  workflowStatus: {
    type: String,
    enum: AUDIT_WORKFLOW_STATUSES,
    default: 'Pending AM Approval',
  },
  /** Independent AM decisions for lost vs damaged replacement lines. */
  lostAmStatus: {
    type: String,
    enum: AUDIT_LINE_AM_STATUSES,
    default: 'None',
  },
  damagedAmStatus: {
    type: String,
    enum: AUDIT_LINE_AM_STATUSES,
    default: 'None',
  },
  amNotes: { type: String },
  adminNotes: { type: String },
  amApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  adminApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  amApprovedAt: { type: Date },
  adminApprovedAt: { type: Date },
}, { timestamps: true });

auditReportSchema.index({ school: 1, month: 1 }, { unique: true });
auditReportSchema.index({ status: 1 });
auditReportSchema.index({ workflowStatus: 1 });
auditReportSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditReport', auditReportSchema);
module.exports.AUDIT_WORKFLOW_STATUSES = AUDIT_WORKFLOW_STATUSES;
module.exports.AUDIT_LINE_AM_STATUSES = AUDIT_LINE_AM_STATUSES;
