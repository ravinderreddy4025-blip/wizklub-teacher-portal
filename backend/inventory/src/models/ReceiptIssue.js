const mongoose = require('mongoose');

const receiptIssueSchema = new mongoose.Schema({
  dispatch: { type: mongoose.Schema.Types.ObjectId, ref: 'Dispatch', required: true, index: true },
  school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  kit: { type: mongoose.Schema.Types.ObjectId, ref: 'Kit', required: true },
  consignmentNo: { type: String, trim: true },
  sourceDispatchRef: { type: String, trim: true },
  originalKitId: { type: String, trim: true },
  originalCategory: { type: String, trim: true },
  /** 1-based issue cycle on this dispatch (1 = first report). */
  cycle: { type: Number, min: 1, default: 1 },
  supersededBy: { type: mongoose.Schema.Types.ObjectId, ref: 'ReceiptIssue' },
  reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiverName: { type: String, trim: true },
  receivedAt: { type: Date },
  issueType: {
    type: String,
    enum: ['Missing Product', 'Damaged Product', 'Quantity Mismatch', 'Shipment Not Received'],
    required: true,
  },
  quantitySent: { type: Number, required: true, min: 0 },
  quantityReceived: { type: Number, required: true, min: 0 },
  quantityAffected: { type: Number, required: true, min: 1 },
  damageDescription: { type: String },
  severity: { type: String, enum: ['Minor Damage', 'Major Damage'] },
  photoUrls: [{ type: String }],
  videoUrls: [{ type: String }],
  remarks: { type: String },
  status: {
    type: String,
    enum: [
      'Pending AM Approval',
      'Pending Admin Approval',
      'Clarification Requested',
      'Approved',
      'Rejected',
      'Superseded',
      // legacy
      'Damage Under Review',
      'Missing Item Under Review',
      'Received with Issues',
      'Replacement Pending',
      'Resolved',
    ],
    required: true,
  },
  amNotes: { type: String },
  amApprovedAt: { type: Date },
  adminNotes: { type: String },
  adminApprovedAt: { type: Date },
  replacementDispatch: { type: mongoose.Schema.Types.ObjectId, ref: 'Dispatch' },
  replacementRequest: { type: mongoose.Schema.Types.ObjectId, ref: 'ReplacementRequest' },
  claimHistory: [{
    issueType: { type: String },
    quantitySent: { type: Number, min: 0 },
    quantityReceived: { type: Number, min: 0 },
    quantityAffected: { type: Number, min: 0 },
    remarks: { type: String },
    damageDescription: { type: String },
    severity: { type: String },
    photoUrls: [{ type: String }],
    submittedAt: { type: Date },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  }],
}, { timestamps: true });

receiptIssueSchema.index({ school: 1, status: 1 });
receiptIssueSchema.index({ consignmentNo: 1 });

module.exports = mongoose.model('ReceiptIssue', receiptIssueSchema);
