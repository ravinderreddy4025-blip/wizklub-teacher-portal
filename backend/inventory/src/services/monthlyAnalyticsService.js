const School = require('../models/School');
const {
  currentMonth,
  parseMonth,
  getMonthlyReport,
  buildComposition,
  computeIssueRate,
  MIN_SHIPPED_FOR_RATE_RANK,
} = require('./monthlyReportService');
const { formatAuditMonth } = require('../utils/auditMonth');

const ISSUE_TYPE_KEYS = {
  all: null,
  mismatch: 'mismatch',
  notReceived: 'notReceived',
  damaged: 'damaged',
  lost: 'lost',
};

function shiftMonth(monthStr, offset) {
  const { year, month } = parseMonth(monthStr);
  const d = new Date(year, month - 1 + offset, 1);
  return formatAuditMonth(d);
}

function trendMonthKeys(endMonth, count) {
  const months = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    months.push(shiftMonth(endMonth, -i));
  }
  return months;
}

const MIN_TREND_CHART_MONTHS = 2;

function summaryHasReportingData(summary) {
  if (!summary) return false;
  return (summary.schoolsWithActivity || 0) > 0
    || (summary.sentKits || 0) > 0
    || (summary.acknowledgedKits || 0) > 0
    || (summary.replacedKits || 0) > 0
    || (summary.pendingKits || 0) > 0
    || (summary.affectedKits || 0) > 0
    || (summary.rejectedKits || 0) > 0;
}

function buildTrendsPayload(filteredPoints, trendMonthsWindow, issueType) {
  const availableMonths = filteredPoints.length;
  const showChart = availableMonths >= MIN_TREND_CHART_MONTHS;
  const chartPoints = showChart
    ? filteredPoints.slice(-trendMonthsWindow)
    : [];

  const trends = {
    months: chartPoints.map((p) => p.month),
    volume: {
      mismatch: chartPoints.map((p) => p.volume.mismatch),
      notReceived: chartPoints.map((p) => p.volume.notReceived),
      damaged: chartPoints.map((p) => p.volume.damaged),
      lost: chartPoints.map((p) => p.volume.lost),
      totalAffected: chartPoints.map((p) => p.volume.totalAffected),
    },
    rate: chartPoints.map((p) => p.issueRate),
    shipped: chartPoints.map((p) => p.shippedKits),
    availableMonths,
    showChart,
    chartMonths: chartPoints.length,
  };

  if (issueType !== 'all') {
    trends.volume = filterTrendVolume(trends.volume, issueType);
  }

  return trends;
}

async function loadFilteredTrendPoints(endMonth, scanMonths, reportOptions) {
  const monthKeys = trendMonthKeys(endMonth, scanMonths);
  const trendReports = await Promise.all(
    monthKeys.map((m) => getMonthlyReport(m, reportOptions)),
  );
  return trendReports
    .filter(({ summary }) => summaryHasReportingData(summary))
    .map(({ summary }) => buildTrendPoint(summary));
}

async function buildTrendSeries(endMonth, trendMonthsWindow, reportOptions, issueType = 'all') {
  const filteredPoints = await loadFilteredTrendPoints(endMonth, trendMonthsWindow, reportOptions);
  return buildTrendsPayload(filteredPoints, trendMonthsWindow, issueType);
}

function buildTrendPoint(summary) {
  const composition = buildComposition(summary);
  return {
    month: summary.month,
    shippedKits: summary.sentKits || 0,
    affectedKits: summary.affectedKits || 0,
    issueRate: computeIssueRate(summary.sentKits, summary.affectedKits),
    volume: {
      mismatch: composition.mismatch,
      notReceived: composition.notReceived,
      damaged: composition.damaged,
      lost: composition.lost,
      totalAffected: composition.totalAffected,
    },
  };
}

function filterComposition(composition, issueType) {
  const key = ISSUE_TYPE_KEYS[issueType];
  if (!key || key === 'all') return composition;
  const filtered = { mismatch: 0, notReceived: 0, damaged: 0, lost: 0, totalAffected: 0 };
  filtered[key] = composition[key] || 0;
  filtered.totalAffected = filtered[key];
  return filtered;
}

function filterTrendVolume(volume, issueType) {
  const key = ISSUE_TYPE_KEYS[issueType];
  if (!key) return volume;
  return {
    mismatch: key === 'mismatch' ? volume.mismatch : 0,
    notReceived: key === 'notReceived' ? volume.notReceived : 0,
    damaged: key === 'damaged' ? volume.damaged : 0,
    lost: key === 'lost' ? volume.lost : 0,
    totalAffected: volume[key] || 0,
  };
}

function buildKpis(summary) {
  return {
    shippedKits: summary.sentKits || 0,
    receivedKits: summary.acknowledgedKits || 0,
    replacedKits: summary.replacedKits || 0,
    pendingDispatchKits: summary.pendingKits || 0,
    affectedKits: summary.affectedKits || 0,
    fulfillment: summary.fulfillment || { eligibleDsps: 0, fulfilledDsps: 0, rate: 0 },
    issueRate: summary.issueRate ?? computeIssueRate(summary.sentKits, summary.affectedKits),
  };
}

function buildSchoolTableRow(row) {
  return {
    schoolId: row.schoolId,
    schoolName: row.schoolName,
    schoolCode: row.schoolCode,
    divisionName: row.divisionName,
    shippedKits: row.sentKits || 0,
    receivedKits: row.acknowledgedKits || 0,
    replacedKits: row.replacedKits || 0,
    affectedKits: row.affectedKits || 0,
    issueRate: row.issueRate ?? computeIssueRate(row.sentKits, row.affectedKits),
    fulfillment: row.fulfillment || { eligibleDsps: 0, fulfilledDsps: 0, rate: 0 },
  };
}

function rankTopSchools(schoolRows) {
  const byAffected = [...schoolRows]
    .filter((row) => (row.affectedKits || 0) > 0)
    .sort((a, b) => (b.affectedKits || 0) - (a.affectedKits || 0))
    .slice(0, 5)
    .map((row, index) => ({
      rank: index + 1,
      schoolId: row.schoolId,
      schoolName: row.schoolName,
      divisionName: row.divisionName,
      affectedKits: row.affectedKits || 0,
      shippedKits: row.shippedKits || 0,
    }));

  const byIssueRate = [...schoolRows]
    .filter((row) => (row.shippedKits || 0) >= MIN_SHIPPED_FOR_RATE_RANK && (row.affectedKits || 0) > 0)
    .sort((a, b) => (b.issueRate || 0) - (a.issueRate || 0))
    .slice(0, 5)
    .map((row, index) => ({
      rank: index + 1,
      schoolId: row.schoolId,
      schoolName: row.schoolName,
      divisionName: row.divisionName,
      issueRate: row.issueRate || 0,
      affectedKits: row.affectedKits || 0,
      shippedKits: row.shippedKits || 0,
    }));

  return { byAffected, byIssueRate };
}

async function resolveSchoolIds({ divisionId, schoolId }) {
  const trimmedSchool = String(schoolId || '').trim();
  if (trimmedSchool) return [trimmedSchool];

  const trimmedDivision = String(divisionId || '').trim();
  if (trimmedDivision) {
    const schools = await School.find({ divisionId: trimmedDivision }).select('_id').lean();
    return schools.map((s) => s._id);
  }

  return null;
}

async function getMonthlyAnalytics(options = {}) {
  const month = options.month || currentMonth();
  const trendMonths = Number(options.trendMonths) === 12 ? 12 : 6;
  const issueType = ISSUE_TYPE_KEYS[options.issueType] != null || options.issueType === 'all'
    ? (options.issueType || 'all')
    : 'all';

  const schoolIds = await resolveSchoolIds(options);
  const reportOptions = schoolIds == null ? {} : { schoolIds };

  const { summary, schools } = await getMonthlyReport(month, reportOptions);
  const schoolTableRows = schools.map(buildSchoolTableRow);

  const trends = await buildTrendSeries(month, trendMonths, reportOptions, issueType);

  const composition = filterComposition(buildComposition(summary), issueType);

  return {
    month,
    filters: {
      trendMonths,
      divisionId: options.divisionId || null,
      schoolId: options.schoolId || null,
      issueType,
    },
    kpis: buildKpis(summary),
    trends,
    composition,
    topSchools: rankTopSchools(schoolTableRows),
    schools: schoolTableRows,
    summary,
  };
}

async function getSchoolTrendData(schoolId, monthInput, trendMonths = 6) {
  const month = monthInput || currentMonth();
  const window = Number(trendMonths) === 12 ? 12 : 6;
  const series = await buildTrendSeries(month, window, { schoolIds: [schoolId] });
  return series;
}

module.exports = {
  getMonthlyAnalytics,
  getSchoolTrendData,
  buildKpis,
  buildComposition,
  buildTrendPoint,
  buildTrendsPayload,
  summaryHasReportingData,
  rankTopSchools,
  trendMonthKeys,
  filterComposition,
  MIN_SHIPPED_FOR_RATE_RANK,
  MIN_TREND_CHART_MONTHS,
};
