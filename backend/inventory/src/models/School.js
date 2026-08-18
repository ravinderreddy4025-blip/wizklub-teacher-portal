const mongoose = require('mongoose');

const schoolSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  divisionId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Division',
    required: true
  },
  address: { type: String },
  contactEmail: { type: String, trim: true, lowercase: true },
  rmId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User'
  },
  wizklubSchoolId: { type: String, default: null, trim: true, sparse: true, unique: true },
  wizklubRegionId: { type: Number, default: null },
  wizklubRegionName: { type: String, default: null, trim: true },
}, { timestamps: true });

schoolSchema.index({ wizklubSchoolId: 1 }, { sparse: true, unique: true });

schoolSchema.index({ rmId: 1 });
schoolSchema.index({ divisionId: 1 });
schoolSchema.index({ name: 'text' });

module.exports = mongoose.model('School', schoolSchema);
