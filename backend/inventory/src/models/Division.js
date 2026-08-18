const mongoose = require('mongoose');

const divisionSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: { type: String },
  regionalManagerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  auditStartDate: { type: Date, default: null },
  auditEndDate: { type: Date, default: null },
  wizklubRegionId: { type: Number, default: null, sparse: true, unique: true },
  wizklubRegionName: { type: String, default: null, trim: true },
}, { timestamps: true });

divisionSchema.index({ wizklubRegionId: 1 }, { sparse: true, unique: true });

module.exports = mongoose.model('Division', divisionSchema);
