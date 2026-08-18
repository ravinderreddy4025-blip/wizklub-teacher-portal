const Dispatch = require('../models/Dispatch');
const Kit = require('../models/Kit');

const ACTIVE_CONSIGNMENT_STATUSES = ['Pending', 'Dispatched'];

async function findDuplicateKitOnConsignment(schoolId, consignmentNo, kitIds) {
  if (!consignmentNo?.trim() || !kitIds?.length) return null;

  const existing = await Dispatch.find({
    school: schoolId,
    consignmentNo: consignmentNo.trim(),
    kit: { $in: kitIds },
    status: { $in: ACTIVE_CONSIGNMENT_STATUSES },
  })
    .populate('kit', 'name kitId')
    .lean();

  return existing.length ? existing : null;
}

/**
 * Remove duplicate kit lines on the same consignment (e.g. from a failed partial create + retry).
 * Keeps the newest record per school + consignment + kit; restores warehouse stock for removed lines.
 */
async function dedupeDuplicateConsignmentKitLines() {
  const groups = await Dispatch.aggregate([
    {
      $match: {
        consignmentNo: { $exists: true, $nin: [null, ''] },
        status: { $in: ACTIVE_CONSIGNMENT_STATUSES },
      },
    },
    {
      $group: {
        _id: { school: '$school', consignmentNo: '$consignmentNo', kit: '$kit' },
        count: { $sum: 1 },
        docs: {
          $push: {
            id: '$_id',
            quantity: '$quantity',
            createdAt: '$createdAt',
          },
        },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ]);

  let removed = 0;

  for (const group of groups) {
    const sorted = [...group.docs].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    const duplicates = sorted.slice(1);

    for (const doc of duplicates) {
      // eslint-disable-next-line no-await-in-loop
      const deleted = await Dispatch.findByIdAndDelete(doc.id);
      if (deleted) {
        // eslint-disable-next-line no-await-in-loop
        await Kit.findByIdAndUpdate(group._id.kit, {
          $inc: { warehouseQuantity: deleted.quantity },
        });
        removed += 1;
      }
    }
  }

  return removed;
}

module.exports = {
  ACTIVE_CONSIGNMENT_STATUSES,
  findDuplicateKitOnConsignment,
  dedupeDuplicateConsignmentKitLines,
};
