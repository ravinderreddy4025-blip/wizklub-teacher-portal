function populateAuditRelations(query) {
  return query
    .populate({ path: 'school', populate: { path: 'divisionId', select: 'name' } })
    .populate('items.kit')
    .populate('items.lostDispatch')
    .populate('items.damagedDispatch');
}

async function findAuditByIdPopulated(auditId) {
  const AuditReport = require('../models/AuditReport');
  return populateAuditRelations(AuditReport.findById(auditId));
}

module.exports = { populateAuditRelations, findAuditByIdPopulated };
