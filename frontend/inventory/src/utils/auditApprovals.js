export function hasAuditLineQuantity(audit, lineType) {
  return (audit?.items || []).some((item) =>
    lineType === 'lost' ? item.lostQuantity > 0 : item.damagedQuantity > 0
  );
}

/** AM line status with legacy fallback (whole-audit workflow). */
export function getAuditLineAmStatus(audit, lineType) {
  const key = lineType === 'lost' ? 'lostAmStatus' : 'damagedAmStatus';
  const stored = audit?.[key];
  if (stored && stored !== 'None') return stored;
  if (!hasAuditLineQuantity(audit, lineType)) return 'None';
  if (audit?.workflowStatus === 'Pending AM Approval') return 'Pending';
  if (audit?.workflowStatus === 'Rejected') return 'Rejected';
  return 'Approved';
}

export function countAuditLines(audits, lineType, {
  workflowStatus,
  undispatchedOnly = false,
  amStatus,
} = {}) {
  return audits
    .filter((audit) => !workflowStatus || audit.workflowStatus === workflowStatus)
    .filter((audit) => !amStatus || getAuditLineAmStatus(audit, lineType) === amStatus)
    .reduce((sum, audit) => {
      const items = (audit.items || []).filter((item) => {
        const qty = lineType === 'lost' ? item.lostQuantity : item.damagedQuantity;
        if (!qty || qty <= 0) return false;
        if (undispatchedOnly) {
          const dispatch = lineType === 'lost' ? item.lostDispatch : item.damagedDispatch;
          return !dispatch;
        }
        return true;
      });
      return sum + items.length;
    }, 0);
}

export function auditHasUndispatchedLines(audit) {
  return (audit.items || []).some(
    (item) =>
      (item.lostQuantity > 0 && !item.lostDispatch)
      || (item.damagedQuantity > 0 && !item.damagedDispatch),
  );
}

export function filterAuditsWithLines(audits, lineType, options = {}) {
  return audits
    .filter((audit) => !options.workflowStatus || audit.workflowStatus === options.workflowStatus)
    .filter((audit) => !options.amStatus || getAuditLineAmStatus(audit, lineType) === options.amStatus)
    .map((audit) => ({
      audit,
      items: (audit.items || []).filter((item) => {
        const qty = lineType === 'lost' ? item.lostQuantity : item.damagedQuantity;
        if (!qty || qty <= 0) return false;
        if (options.undispatchedOnly) {
          const dispatch = lineType === 'lost' ? item.lostDispatch : item.damagedDispatch;
          return !dispatch;
        }
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);
}
