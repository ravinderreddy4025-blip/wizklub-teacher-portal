const mongoose = require('mongoose');

const dispatchSchema = new mongoose.Schema({
  kit: { type: mongoose.Schema.Types.ObjectId, ref: 'Kit', required: true },
  quantity: { type: Number, required: true },
  school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  reportingManager: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  kitId: { type: String, trim: true },
  originalKitId: { type: String, trim: true },
  componentId: { type: String, trim: true, index: true },
  consignmentNo: { type: String, trim: true },
  originalConsignmentNo: { type: String, trim: true },
  category: {
    type: String,
    enum: [
      'New Dispatch',
      'Lost Dispatch',
      'Damaged Dispatch',
      'Mismatch Dispatch',
      'Audit Lost Dispatch',
      'Audit Damaged Dispatch',
    ],
    default: 'New Dispatch'
  },
  originalCategory: { type: String, trim: true },
  /** First-class physical movements. Live cycle is the last item. */
  cycles: [{
    cycle: { type: Number, required: true, min: 1 },
    movementType: { type: String, enum: ['INITIAL', 'REPLACEMENT'], default: 'INITIAL' },
    status: { type: String, enum: ['OPEN', 'ACKNOWLEDGED'], default: 'OPEN' },
    quantityDispatched: { type: Number, min: 0, default: 0 },
    quantityAcknowledged: { type: Number, min: 0, default: 0 },
    quantityAffected: { type: Number, min: 0, default: 0 },
    kitId: { type: String, trim: true },
    consignmentNo: { type: String, trim: true },
    category: { type: String, trim: true },
    dispatchedAt: { type: Date },
    dispatchedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    acknowledgedAt: { type: Date },
    receiverName: { type: String, trim: true },
    issue: { type: mongoose.Schema.Types.ObjectId, ref: 'ReceiptIssue' },
  }],
  /** Snapshots of each replaced shipment before a redispatch (legacy; prefer cycles). */
  redispatchCycles: [{
    cycle: { type: Number, required: true, min: 1 },
    issue: { type: mongoose.Schema.Types.ObjectId, ref: 'ReceiptIssue' },
    issueType: { type: String, trim: true },
    quantity: { type: Number, min: 0 },
    kitId: { type: String, trim: true },
    consignmentNo: { type: String, trim: true },
    category: { type: String, trim: true },
    authorizedAt: { type: Date },
    authorizedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  }],
  dispatchDetails: { type: String },
  replacementId: { type: String, index: true },
  trackingId: { type: String, trim: true },
  trackingHistory: [{
    consignmentNo: { type: String, trim: true },
    setAt: { type: Date, default: Date.now },
    setBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  }],
  status: { 
    type: String, 
    enum: [
      'Pending',
      'Dispatched',
      'Completed',
      // legacy — kept until migrateDispatchCycles runs
      'Received',
      'Delivery Completed',
      'Received with Issues',
      'Damage Under Review',
      'Missing Item Under Review',
      'Replacement Pending',
      'Not Received',
      'missing_dispatch',
      'damaged_dispatch',
      'mismatch_dispatch',
      'not_received_dispatch',
      'audit_lost_dispatch',
      'audit_damaged_dispatch',
    ], 
    default: 'Pending' 
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  dispatchedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  dispatchedAt: { type: Date },
  dispatchId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  quantityReceived: { type: Number, min: 0 },
  quantityInitial: { type: Number, min: 0, default: 0 },
  quantityReplaced: { type: Number, min: 0, default: 0 },
  quantityDispatched: { type: Number, min: 0, default: 0 },
  quantityAcknowledged: { type: Number, min: 0, default: 0 },
  quantityAffected: { type: Number, min: 0, default: 0 },
  outstandingQuantity: { type: Number, min: 0, default: 0 },
  lostOnReceipt: { type: Number, min: 0, default: 0 },
  damagedOnReceipt: { type: Number, min: 0, default: 0 },
  damagedImageUrl: { type: String },
  deliveryPhotoUrl: { type: String },
  dispatchProofUrl: { type: String },
  receiverName: { type: String, trim: true },
  receivedAt: { type: Date },
  receiptNotes: { type: String },
  parentDispatchRef: { type: String, trim: true, index: true },
  receiptIssue: { type: mongoose.Schema.Types.ObjectId, ref: 'ReceiptIssue' },
  auditReport: { type: mongoose.Schema.Types.ObjectId, ref: 'AuditReport' },
}, { timestamps: true });

dispatchSchema.index({ school: 1 });
dispatchSchema.index({ reportingManager: 1 });
dispatchSchema.index({ status: 1 });
dispatchSchema.index({ createdAt: -1 });

dispatchSchema.index({ consignmentNo: 1, school: 1, kit: 1 }, {
  unique: true,
  partialFilterExpression: {
    consignmentNo: { $exists: true, $type: 'string', $gt: '' },
    status: { $in: ['Pending', 'Dispatched'] },
  },
  name: 'unique_active_consignment_kit',
});

module.exports = mongoose.model('Dispatch', dispatchSchema);
