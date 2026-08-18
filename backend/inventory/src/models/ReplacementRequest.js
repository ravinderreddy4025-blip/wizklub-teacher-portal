const mongoose = require('mongoose');
const crypto = require('crypto');

const replacementRequestSchema = new mongoose.Schema({
  school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  kit: { type: mongoose.Schema.Types.ObjectId, ref: 'Kit', required: true },
  type: { type: String, enum: ['Damaged', 'Lost'], required: true },
  quantity: { type: Number, required: true, default: 1 },
  replacementId: { type: String, unique: true, index: true },
  reasonDetails: { type: String },
  imageUrl: { type: String },
  status: { 
    type: String, 
    enum: [
      'Pending AM Approval',
      'Pending Admin Approval',
      'Approved',
      'Replacement Pending',
      'Rejected',
    ], 
    required: true 
  },
  source: { type: String, enum: ['Manual', 'Receipt Issue'], default: 'Manual' },
  receiptIssue: { type: mongoose.Schema.Types.ObjectId, ref: 'ReceiptIssue' },
  severity: { type: String, enum: ['Minor Damage', 'Major Damage'] },
  photoUrls: [{ type: String }],
  videoUrl: { type: String },
  issueType: {
    type: String,
    enum: ['Damaged', 'Lost', 'Missing/Lost', 'Wrong Item Received', 'Quantity Mismatch'],
  },
  amNotes: { type: String },
  adminNotes: { type: String }
}, { timestamps: true });

replacementRequestSchema.index({ school: 1 });
replacementRequestSchema.index({ status: 1 });
replacementRequestSchema.index({ createdAt: -1 });

// Generate a unique, human-friendly replacement ID if missing.
// Use async hook (promise) to avoid callback-signature issues across Mongoose versions.
replacementRequestSchema.pre('validate', async function() {
  if (this.replacementId) return;

  const shortRandom = crypto.randomBytes(3).toString('hex').toUpperCase();
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  this.replacementId = `REPL-${datePart}-${shortRandom}`;
});

module.exports = mongoose.model('ReplacementRequest', replacementRequestSchema);
