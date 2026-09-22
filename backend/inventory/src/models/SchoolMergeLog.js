const mongoose = require('mongoose');

const schoolMergeLogSchema = new mongoose.Schema({
  survivorSchoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  absorbedSchoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  absorbedSchoolSnapshot: {
    name: String,
    code: String,
    wizklubSchoolId: String,
    divisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Division' },
  },
  identitySource: {
    type: String,
    enum: ['primary', 'secondary', 'custom'],
    required: true,
  },
  finalDivisionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Division', required: true },
  finalAmId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  transferred: {
    dispatches: { type: Number, default: 0 },
    receiptIssues: { type: Number, default: 0 },
    replacementRequests: { type: Number, default: 0 },
    inventoryRows: { type: Number, default: 0 },
    auditReports: { type: Number, default: 0 },
  },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  performedAt: { type: Date, default: Date.now },
}, { timestamps: true });

schoolMergeLogSchema.index({ survivorSchoolId: 1, performedAt: -1 });
schoolMergeLogSchema.index({ absorbedSchoolId: 1 });

module.exports = mongoose.model('SchoolMergeLog', schoolMergeLogSchema);
