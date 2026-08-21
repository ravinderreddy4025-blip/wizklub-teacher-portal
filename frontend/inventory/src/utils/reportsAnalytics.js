export const ISSUE_TYPE_OPTIONS = [
  { value: 'all', label: 'All issue types' },
  { value: 'mismatch', label: 'Mismatch' },
  { value: 'notReceived', label: 'Not received' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'lost', label: 'Lost' },
];

export const ISSUE_COLORS = {
  mismatch: '#6366F1',
  notReceived: '#F89C28',
  damaged: '#D97706',
  lost: '#64748B',
  totalAffected: '#DC2626',
  rate: '#16A34A',
};

export const KPI_CARDS = [
  { key: 'shippedKits', label: 'Shipped', hint: 'INITIAL kits this month' },
  { key: 'receivedKits', label: 'Received', hint: 'OK acknowledged kits' },
  { key: 'replacedKits', label: 'Replacements', hint: 'Replacement movements shipped' },
  { key: 'pendingDispatchKits', label: 'Pending Dispatch', hint: 'Created, not yet shipped' },
  { key: 'affectedKits', label: 'Affected Kits', hint: 'Receipt issues reported this month' },
  { key: 'fulfillment', label: 'Fulfillment', hint: 'Fulfilled DSPs / eligible DSPs', isRate: true },
];

export function formatIssueRate(rate) {
  const n = Number(rate);
  if (!Number.isFinite(n)) return '0%';
  return `${n}%`;
}

export function formatFulfillment(fulfillment) {
  const rate = Number(fulfillment?.rate ?? 0);
  const fulfilled = Number(fulfillment?.fulfilledDsps ?? 0);
  const eligible = Number(fulfillment?.eligibleDsps ?? 0);
  return {
    primary: `${rate}%`,
    secondary: `${fulfilled} / ${eligible} DSPs`,
  };
}

export function formatMonthLabel(month) {
  const [year, m] = String(month || '').split('-').map(Number);
  if (!year || !m) return month;
  return new Date(year, m - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

export function formatMonthLong(month) {
  const [year, m] = String(month || '').split('-').map(Number);
  if (!year || !m) return month;
  return new Date(year, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function trendChartData(trends) {
  if (!trends?.months?.length) return [];
  return trends.months.map((month, index) => ({
    month: formatMonthLabel(month),
    mismatch: trends.volume?.mismatch?.[index] ?? 0,
    notReceived: trends.volume?.notReceived?.[index] ?? 0,
    damaged: trends.volume?.damaged?.[index] ?? 0,
    lost: trends.volume?.lost?.[index] ?? 0,
    totalAffected: trends.volume?.totalAffected?.[index] ?? 0,
    issueRate: trends.rate?.[index] ?? 0,
  }));
}

export function compositionChartData(composition) {
  if (!composition) return [];
  return [
    { name: 'Mismatch', value: composition.mismatch ?? 0, key: 'mismatch' },
    { name: 'Not received', value: composition.notReceived ?? 0, key: 'notReceived' },
    { name: 'Damaged', value: composition.damaged ?? 0, key: 'damaged' },
    { name: 'Lost', value: composition.lost ?? 0, key: 'lost' },
  ].filter((item) => item.value > 0);
}

export function kpiValue(kpis, key) {
  if (key === 'fulfillment') return formatFulfillment(kpis?.fulfillment);
  return { primary: String(kpis?.[key] ?? 0), secondary: null };
}
