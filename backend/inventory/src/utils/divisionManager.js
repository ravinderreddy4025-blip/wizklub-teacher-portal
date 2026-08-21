const User = require('../models/User');
const Division = require('../models/Division');

async function getDivisionManager(divisionId) {
  if (!divisionId) return null;

  const division = await Division.findById(divisionId).populate('regionalManagerId');
  if (division?.regionalManagerId?.role === 'AM') {
    return division.regionalManagerId;
  }
  if (division?.regionalManagerId) {
    return User.findById(division.regionalManagerId);
  }

  return User.findOne({ divisionId, role: 'AM' });
}

async function getAmDivisions(user) {
  if (!user?._id) return [];

  const byManager = await Division.find({ regionalManagerId: user._id }).sort({ name: 1 });
  const seen = new Set(byManager.map((d) => String(d._id)));
  const list = [...byManager];

  if (user.divisionId && !seen.has(String(user.divisionId))) {
    const legacy = await Division.findById(user.divisionId);
    const ownerId = legacy?.regionalManagerId ? String(legacy.regionalManagerId) : null;
    if (legacy && (!ownerId || ownerId === String(user._id))) {
      list.push(legacy);
    }
  }

  return list.sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = { getDivisionManager, getAmDivisions };
