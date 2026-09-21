const mongoose = require('mongoose');

const schoolSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  /** Year the school joined WizKlub — used as /YY in component IDs (e.g. 2025 → /25). */
  joiningYear: { type: Number, min: 2000, max: 2099, default: null },
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
  wizklubSchoolId: { type: String, trim: true, sparse: true, unique: true },
  wizklubRegionId: { type: Number, default: null },
  wizklubRegionName: { type: String, default: null, trim: true },
}, { timestamps: true });

schoolSchema.index({ wizklubSchoolId: 1 }, { sparse: true, unique: true });

schoolSchema.index({ rmId: 1 });
schoolSchema.index({ divisionId: 1 });
schoolSchema.index({ name: 'text' });

module.exports = mongoose.model('School', schoolSchema);
