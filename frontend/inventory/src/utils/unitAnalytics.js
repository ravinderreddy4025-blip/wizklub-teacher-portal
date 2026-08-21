import { getDispatchQuantityDisplay } from './schoolDispatch';

const SEGMENTS = [
  { key: 'acknowledged', label: 'Acknowledged', hint: 'Received OK, including remainder after issues', color: '#16A34A', track: '#DCFCE7' },
  { key: 'inTransit', label: 'In transit', hint: 'Shipped, not yet received', color: '#F89C28', track: '#FFF4E5' },
  { key: 'mismatched', label: 'Mismatched', hint: 'Shortfall vs sent quantity', color: '#6366F1', track: '#EEF2FF' },
  { key: 'lost', label: 'Lost', hint: 'Received, later reported missing', color: '#64748B', track: '#F1F5F9' },
  { key: 'damaged', label: 'Damaged', hint: 'Damaged remainder of sent qty', color: '#D97706', track: '#FEF3C7' },
  { key: 'rejected', label: 'Rejected', hint: 'Replacement claim denied', color: '#DC2626', track: '#FEE2E2' },
];

export function buildUnitAnalytics(summary, incomingUnits) {
  const sent = Number(summary?.sentKits ?? summary?.dispatchedKits ?? 0) || 0;
  const replaced = Number(summary?.replacedKits ?? 0) || 0;
  const pending = Number(summary?.pendingKits ?? 0) || 0;
  const scheduled = Number(summary?.scheduledKits ?? sent + pending) || sent + pending;
  const acknowledged = Number(summary?.acknowledgedKits ?? 0) || 0;
  const mismatched = Number(summary?.mismatchKits ?? 0) || 0;
  const lost = Number(summary?.lostKits ?? 0) || 0;
  const damaged = Number(summary?.damagedKits ?? 0) || 0;
  const rejected = Number(summary?.rejectedKits ?? 0) || 0;
  const rejectedByAm = Number(summary?.rejectedByAm ?? 0) || 0;
  const rejectedByAdmin = Number(summary?.rejectedByAdmin ?? 0) || 0;

  const placed = acknowledged + mismatched + lost + damaged + rejected;
  const computedInTransit = Math.max(0, sent - placed);
  const inTransit = incomingUnits == null ? computedInTransit : Math.max(0, Number(incomingUnits) || 0);
  const ackRate = sent > 0 ? Math.round((acknowledged / sent) * 100) : 0;
  const barTotal = Math.max(sent, acknowledged + inTransit + mismatched + lost + damaged + rejected, 1);

  const units = { acknowledged, inTransit, mismatched, lost, damaged, rejected };
  const segments = SEGMENTS.map((segment) => {
    const value = units[segment.key] || 0;
    return {
      ...segment,
      units: value,
      pct: barTotal > 0 ? (value / barTotal) * 100 : 0,
    };
  });

  const partSum = acknowledged + inTransit + mismatched + lost + damaged + rejected;
  const shippedBalance = partSum - sent;

  return {
    sent,
    replaced,
    pending,
    scheduled,
    acknowledged,
    mismatched,
    lost,
    damaged,
    rejected,
    rejectedByAm,
    rejectedByAdmin,
    inTransit,
    ackRate,
    barTotal,
    gap: Math.max(0, sent - acknowledged),
    partSum,
    shippedBalance,
    balanced: shippedBalance === 0,
    segments,
  };
}

function hubStat(hub, key) {
  return {
    units: Number(hub?.[key]?.units ?? 0) || 0,
    records: Number(hub?.[key]?.count ?? 0) || 0,
  };
}

function diffWhy(analyticsUnits, listUnits, whenDifferent, whenSame = 'Same units.') {
  const delta = analyticsUnits - listUnits;
  if (delta === 0) return whenSame;
  const abs = Math.abs(delta);
  return `${whenDifferent} Difference: ${abs} unit${abs === 1 ? '' : 's'}.`;
}

export function buildHubJustification(analytics, hub) {
  if (!hub) return null;
  const incoming = hubStat(hub, 'incoming');
  const completed = hubStat(hub, 'past');
  const lostList = hubStat(hub, 'lost');
  const mismatchList = hubStat(hub, 'mismatch');
  const damagedList = hubStat(hub, 'damaged');

  return [
    {
      id: 'ack-completed',
      leftLabel: 'Acknowledged',
      leftUnits: analytics.acknowledged,
      rightLabel: 'Completed',
      rightUnits: completed.units,
      rightRecords: completed.records,
      why: diffWhy(
        analytics.acknowledged,
        completed.units,
        'Should be the same: OK kits after acknowledgment. If they differ, a receipt date or prior-cycle remainder is in one count only.',
        'Same cycle: shipped and acknowledged OK kits are Completed.'
      ),
    },
    {
      id: 'transit-incoming',
      leftLabel: 'In transit',
      leftUnits: analytics.inTransit,
      rightLabel: 'Incoming',
      rightUnits: incoming.units,
      rightRecords: incoming.records,
      why: diffWhy(
        analytics.inTransit,
        incoming.units,
        'In transit is leftover shipped units not yet in an outcome bucket. Incoming is open shipment records still Pending/Dispatched.',
        'Open shipments waiting for school receipt.'
      ),
    },
    {
      id: 'lost',
      leftLabel: 'Lost',
      leftUnits: analytics.lost,
      rightLabel: 'Lost / not received',
      rightUnits: lostList.units,
      rightRecords: lostList.records,
      why: diffWhy(
        analytics.lost,
        lostList.units,
        'Lost KPI is missing units from receipt + monthly audit. The list also adds Lost replacement requests as records.',
        'Missing units match the list.'
      ),
    },
    {
      id: 'mismatch',
      leftLabel: 'Mismatched',
      leftUnits: analytics.mismatched,
      rightLabel: 'Mismatch',
      rightUnits: mismatchList.units,
      rightRecords: mismatchList.records,
      why: diffWhy(
        analytics.mismatched,
        mismatchList.units,
        'KPI is shortfall units. The list is issue records (one shipment can hold several short units).',
        `Same ${mismatchList.units} short units across ${mismatchList.records} record${mismatchList.records === 1 ? '' : 's'}.`
      ),
    },
    {
      id: 'damaged',
      leftLabel: 'Damaged',
      leftUnits: analytics.damaged,
      rightLabel: 'Damaged',
      rightUnits: damagedList.units,
      rightRecords: damagedList.records,
      why: diffWhy(
        analytics.damaged,
        damagedList.units,
        'Damaged KPI is units from receipt + audit. The list also includes Damaged replacement requests.',
        'Damaged units match the list.'
      ),
    },
    {
      id: 'rejected',
      leftLabel: 'Rejected',
      leftUnits: analytics.rejected,
      rightLabel: 'No list card',
      rightUnits: null,
      rightRecords: null,
      why: 'Denied replacement qty. Those kits already received stay in Acknowledged — Rejected is not a fifth exclusive bucket and has no Completed-style card.',
    },
  ];
}

function line(label, value, kind = 'units') {
  return { label, value: Number(value) || 0, kind };
}

export function rowListQuantity(item) {
  if (item?.acknowledgedUnits != null) return Number(item.acknowledgedUnits) || 0;
  const qty = getDispatchQuantityDisplay(item);
  if (qty.mode === 'single') return Number(qty.quantity) || 0;
  return Number(qty.redispatched) || 0;
}

export function getListCardTooltip(sectionId, analytics, hub, sectionRows, activeSection) {
  if (!hub) return null;
  const incoming = hubStat(hub, 'incoming');
  const completed = hubStat(hub, 'past');
  const lostList = hubStat(hub, 'lost');
  const mismatchList = hubStat(hub, 'mismatch');
  const damagedList = hubStat(hub, 'damaged');
  const lostIssues = hubStat(hub, 'lostIssues');
  const lostRepl = hubStat(hub, 'lostReplacements');
  const damagedIssues = hubStat(hub, 'damagedIssues');
  const damagedRepl = hubStat(hub, 'damagedReplacements');
  const rowLines =
    activeSection === sectionId && Array.isArray(sectionRows) && sectionRows.length
      ? sectionRows.map((row, index) =>
          line(row.dispatchId || `Row ${index + 1}`, rowListQuantity(row))
        )
      : null;
  const rowTotal = rowLines ? rowLines.reduce((sum, item) => sum + item.value, 0) : null;

  if (sectionId === 'incoming') {
    return {
      title: 'Incoming',
      total: rowTotal ?? incoming.units,
      lines: rowLines || [
        line('Open shipments', incoming.records, 'records'),
        line('Qty column total', incoming.units),
      ],
      equation: `${rowTotal ?? incoming.units} = sum of Qty in Incoming`,
    };
  }

  if (sectionId === 'past') {
    return {
      title: 'Completed',
      total: rowTotal ?? completed.units,
      lines: rowLines || [
        line('Acknowledged OK kits', analytics.acknowledged),
        line('Completed list (same OK kits)', completed.units),
        line('Shipments with OK units', completed.records, 'records'),
      ],
      equation: `${rowTotal ?? completed.units} completed = ${analytics.acknowledged} acknowledged OK`,
    };
  }

  if (sectionId === 'lost') {
    return {
      title: 'Lost / not received',
      total: lostList.units,
      lines: [
        line('Missing-product issues', lostIssues.units),
        line('Lost replacement requests', lostRepl.units),
        line('This list (issues + requests)', lostList.units),
        line('Lost KPI (top row)', analytics.lost),
        line('List records', lostList.records, 'records'),
      ],
      equation: `${lostIssues.units} issues + ${lostRepl.units} replacements = ${lostList.units}`,
    };
  }

  if (sectionId === 'mismatch') {
    return {
      title: 'Mismatch',
      total: mismatchList.units,
      lines: [
        line('Mismatch issue records', mismatchList.records, 'records'),
        line('Short units on those records', mismatchList.units),
        line('Mismatched KPI (top row)', analytics.mismatched),
      ],
      equation: `${mismatchList.units} short units across ${mismatchList.records} records`,
    };
  }

  if (sectionId === 'damaged') {
    return {
      title: 'Damaged',
      total: damagedList.units,
      lines: [
        line('Damaged-product issues', damagedIssues.units),
        line('Damaged replacement requests', damagedRepl.units),
        line('This list (issues + requests)', damagedList.units),
        line('Damaged KPI (top row)', analytics.damaged),
        line('List records', damagedList.records, 'records'),
      ],
      equation: `${damagedIssues.units} issues + ${damagedRepl.units} replacements = ${damagedList.units}`,
    };
  }

  return null;
}

export function getSegmentTooltip(segment, analytics, hub) {
  if (!segment) return null;
  const completed = hubStat(hub, 'past');
  const incoming = hubStat(hub, 'incoming');

  if (segment.key === 'acknowledged') {
    return {
      title: 'Acknowledged',
      total: analytics.acknowledged,
      lines: [
        line('OK kits this month (receipts)', analytics.acknowledged),
        line('Completed list (same cycle)', completed.units),
        line('Of shipped', analytics.sent),
      ],
      equation: `${analytics.acknowledged} acknowledged = ${completed.units} completed (the OK kits)`,
    };
  }

  if (segment.key === 'inTransit') {
    return {
      title: 'In transit',
      total: analytics.inTransit,
      lines: [
        line('Of shipped', analytics.sent),
        line('Incoming list qty', incoming.units),
        line('Incoming shipments', incoming.records, 'records'),
      ],
      equation: `${analytics.inTransit} of ${analytics.sent} shipped, not received yet`,
    };
  }

  if (segment.key === 'mismatched') {
    const mismatchList = hubStat(hub, 'mismatch');
    return {
      title: 'Mismatched',
      total: analytics.mismatched,
      lines: [
        line('Of shipped', analytics.sent),
        line('Short units (KPI)', analytics.mismatched),
        line('Mismatch records', mismatchList.records, 'records'),
      ],
      equation: `${analytics.mismatched} short units · ${mismatchList.records || 0} records`,
    };
  }

  if (segment.key === 'lost') {
    const lostList = hubStat(hub, 'lost');
    const lostIssues = hubStat(hub, 'lostIssues');
    const lostRepl = hubStat(hub, 'lostReplacements');
    return {
      title: 'Lost',
      total: analytics.lost,
      lines: [
        line('Lost KPI (receipt + audit)', analytics.lost),
        line('Missing issues (list)', lostIssues.units),
        line('Lost replacement requests', lostRepl.units),
        line('Lost list total', lostList.units),
      ],
      equation: `KPI ${analytics.lost} · list ${lostList.units} = ${lostIssues.units} + ${lostRepl.units}`,
    };
  }

  if (segment.key === 'damaged') {
    const damagedList = hubStat(hub, 'damaged');
    const damagedIssues = hubStat(hub, 'damagedIssues');
    const damagedRepl = hubStat(hub, 'damagedReplacements');
    return {
      title: 'Damaged',
      total: analytics.damaged,
      lines: [
        line('Damaged KPI (receipt + audit)', analytics.damaged),
        line('Damaged issues (list)', damagedIssues.units),
        line('Damaged replacement requests', damagedRepl.units),
        line('Damaged list total', damagedList.units),
      ],
      equation: `KPI ${analytics.damaged} · list ${damagedList.units} = ${damagedIssues.units} + ${damagedRepl.units}`,
    };
  }

  return {
    title: 'Rejected',
    total: analytics.rejected,
    lines: [
      line('Rejected units', analytics.rejected),
      line('Denied by AM', analytics.rejectedByAm),
      line('Denied by Admin', analytics.rejectedByAdmin),
      line('Still counted in Acknowledged', analytics.acknowledged),
    ],
    equation: `${analytics.rejectedByAm} AM + ${analytics.rejectedByAdmin} Admin = ${analytics.rejected}`,
  };
}

export function getShippedTooltip(analytics) {
  return {
    title: 'Shipped',
    total: analytics.sent,
    lines: [
      line('Initial shipped', analytics.sent),
      line('Replacements', analytics.replaced),
      line('Physical movements', analytics.sent + analytics.replaced),
      line('Acknowledged', analytics.acknowledged),
      line('In transit', analytics.inTransit),
      line('Mismatched', analytics.mismatched),
      line('Lost', analytics.lost),
      line('Damaged', analytics.damaged),
      line('Rejected', analytics.rejected),
      line('Pending (not shipped)', analytics.pending),
    ],
    equation: `Shipped ${analytics.sent} (initial) · Replacements ${analytics.replaced} · Movements ${analytics.sent + analytics.replaced}`,
  };
}
