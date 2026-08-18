const SchoolInventory = require('../models/SchoolInventory');

async function removeStock(schoolId, kitId, quantity) {
  if (!quantity || quantity <= 0) return null;

  const row = await SchoolInventory.findOne({ school: schoolId, kit: kitId });
  if (!row) return null;

  row.quantity = Math.max(0, row.quantity - quantity);
  await row.save();
  return row;
}

async function addStock(schoolId, kitId, quantity) {
  if (!quantity || quantity <= 0) return null;

  return SchoolInventory.findOneAndUpdate(
    { school: schoolId, kit: kitId },
    {
      $inc: { quantity },
      $setOnInsert: { school: schoolId, kit: kitId },
    },
    { upsert: true, new: true }
  );
}

async function getWarehouseForSchool(schoolId) {
  return SchoolInventory.find({ school: schoolId, quantity: { $gt: 0 } })
    .populate('kit')
    .sort({ updatedAt: -1 });
}

async function getStockMap(schoolId) {
  const rows = await SchoolInventory.find({ school: schoolId }).populate('kit');
  return rows.filter((row) => row.kit);
}

module.exports = { addStock, removeStock, getWarehouseForSchool, getStockMap };
