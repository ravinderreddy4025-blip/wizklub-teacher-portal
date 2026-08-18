const mongoose = require('mongoose');

const kitSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  kitId: { type: String, required: true, unique: true },
  type: { type: String, default: 'General' },
  warehouseQuantity: { type: Number, default: 0, min: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Kit', kitSchema);
