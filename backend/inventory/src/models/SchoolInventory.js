const mongoose = require('mongoose');

const schoolInventorySchema = new mongoose.Schema({
  school: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  kit: { type: mongoose.Schema.Types.ObjectId, ref: 'Kit', required: true },
  quantity: { type: Number, required: true, default: 0, min: 0 },
}, { timestamps: true });

schoolInventorySchema.index({ school: 1, kit: 1 }, { unique: true });
schoolInventorySchema.index({ school: 1 });

module.exports = mongoose.model('SchoolInventory', schoolInventorySchema);
