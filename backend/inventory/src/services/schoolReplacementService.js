const AuditReport = require('../models/AuditReport');

function auditLineStatus(audit, dispatchRef) {
  if (audit.workflowStatus === 'Rejected') return 'Rejected';
  if (dispatchRef) return 'Dispatched';
  if (audit.workflowStatus === 'Approved') return 'Awaiting dispatch';
  if (audit.workflowStatus === 'Pending Admin Approval') return 'Pending Admin Approval';
  return 'Pending AM Approval';
}

function buildAuditReplacementRows(audits) {
  const rows = [];

  for (const audit of audits) {
    if (audit.workflowStatus === 'Rejected') continue;

    (audit.items || []).forEach((item, index) => {
      const kit = item.kit;
      const kitId = kit?._id || kit;
      const kitName = kit?.name || 'Kit';

      if (item.lostQuantity > 0) {
        rows.push({
          _id: `audit-${audit._id}-${index}-lost`,
          source: 'Monthly Audit',
          type: 'Lost',
          quantity: item.lostQuantity,
          kit,
          replacementId: `AUDIT-${audit.month}-LOST-${index + 1}`,
          status: auditLineStatus(audit, item.lostDispatch),
          auditMonth: audit.month,
          auditWorkflowStatus: audit.workflowStatus,
          createdAt: audit.createdAt,
          replacementSummary: {
            type: 'Lost',
            quantity: item.lostQuantity,
            status: auditLineStatus(audit, item.lostDispatch),
          },
        });
      }

      if (item.damagedQuantity > 0) {
        rows.push({
          _id: `audit-${audit._id}-${index}-damaged`,
          source: 'Monthly Audit',
          type: 'Damaged',
          quantity: item.damagedQuantity,
          kit,
          replacementId: `AUDIT-${audit.month}-DMG-${index + 1}`,
          status: auditLineStatus(audit, item.damagedDispatch),
          auditMonth: audit.month,
          auditWorkflowStatus: audit.workflowStatus,
          createdAt: audit.createdAt,
          replacementSummary: {
            type: 'Damaged',
            quantity: item.damagedQuantity,
            status: auditLineStatus(audit, item.damagedDispatch),
          },
        });
      }
    });
  }

  return rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function buildSummaryFromRows(rows) {
  const summary = {
    'Lost Dispatch': { count: 0, totalQuantity: 0 },
    'Damaged Dispatch': { count: 0, totalQuantity: 0 },
  };

  for (const row of rows) {
    const key = row.type === 'Lost' ? 'Lost Dispatch' : 'Damaged Dispatch';
    summary[key].count += 1;
    summary[key].totalQuantity += row.quantity || 0;
  }

  return {
    ...summary,
    totalReplacements: rows.length,
  };
}

async function getSchoolReplacementHistory(schoolId) {
  const audits = await AuditReport.find({
    school: schoolId,
    workflowStatus: { $ne: 'Rejected' },
  })
    .populate('items.kit')
    .populate('items.lostDispatch')
    .populate('items.damagedDispatch')
    .sort({ createdAt: -1 });

  const replacements = buildAuditReplacementRows(audits);
  const replacementSummary = buildSummaryFromRows(replacements);

  return { replacementSummary, replacements };
}

module.exports = {
  getSchoolReplacementHistory,
  buildAuditReplacementRows,
};
