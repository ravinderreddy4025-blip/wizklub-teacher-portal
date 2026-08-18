const mongoose = require('mongoose');

const divisionAuditWindowSchema = new mongoose.Schema({
  divisionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Division',
    required: true,
  },
  auditMonth: {
    type: String,
    required: true,
  },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
}, { timestamps: true });

divisionAuditWindowSchema.index({ divisionId: 1, auditMonth: 1 }, { unique: true });

module.exports = mongoose.model('DivisionAuditWindow', divisionAuditWindowSchema);
