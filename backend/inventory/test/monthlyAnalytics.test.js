const assert = require('node:assert/strict');
const {
  buildComposition,
  computeIssueRate,
  enrichReportRow,
  MIN_SHIPPED_FOR_RATE_RANK,
} = require('../src/services/monthlyReportService');
const {
  rankTopSchools,
  buildKpis,
  filterComposition,
  summaryHasReportingData,
  buildTrendPoint,
  buildTrendsPayload,
  MIN_TREND_CHART_MONTHS,
} = require('../src/services/monthlyAnalyticsService');

function testIssueRate() {
  assert.strictEqual(computeIssueRate(100, 25), 25);
  assert.strictEqual(computeIssueRate(0, 10), 0);
  assert.strictEqual(computeIssueRate(80, 12), 15);
}

function testAffectedHistorical() {
  const stats = {
    mismatchKits: 4,
    notReceivedKits: 0,
    damagedKits: 0,
    lostKits: 0,
    affectedKits: 4,
    sentKits: 20,
  };
  const composition = buildComposition(stats);
  assert.strictEqual(composition.totalAffected, 4);
  assert.strictEqual(composition.mismatch, 4);
}

function testAuditNotInComposition() {
  const stats = {
    mismatchKits: 2,
    affectedKits: 2,
    auditLostKits: 5,
    auditDamagedKits: 3,
    lostKits: 0,
    damagedKits: 0,
  };
  const composition = buildComposition(stats);
  assert.strictEqual(composition.lost, 0);
  assert.strictEqual(composition.damaged, 0);
  assert.strictEqual(composition.totalAffected, 2);
}

function testFulfillmentOnRow() {
  const row = enrichReportRow(
    { sentKits: 10, affectedKits: 2, acknowledgedKits: 8, pendingKits: 1, replacedKits: 0 },
    { eligibleDsps: 4, fulfilledDsps: 3, rate: 75 },
  );
  assert.strictEqual(row.fulfillment.rate, 75);
  assert.strictEqual(row.issueRate, 20);
  assert.strictEqual(row.receivedKits, 8);
}

function testRankings() {
  const schools = [
    { schoolId: 'a', schoolName: 'A', divisionName: 'D1', shippedKits: 100, affectedKits: 20, issueRate: 20 },
    { schoolId: 'b', schoolName: 'B', divisionName: 'D1', shippedKits: 5, affectedKits: 4, issueRate: 80 },
    { schoolId: 'c', schoolName: 'C', divisionName: 'D1', shippedKits: 50, affectedKits: 15, issueRate: 30 },
  ];
  const ranked = rankTopSchools(schools);
  assert.strictEqual(ranked.byAffected[0].schoolId, 'a');
  assert.strictEqual(ranked.byIssueRate.length, 2);
  assert.ok(ranked.byIssueRate.every((row) => row.shippedKits >= MIN_SHIPPED_FOR_RATE_RANK));
}

function testBuildKpis() {
  const kpis = buildKpis({
    sentKits: 70,
    acknowledgedKits: 53,
    replacedKits: 5,
    pendingKits: 12,
    affectedKits: 18,
    fulfillment: { eligibleDsps: 10, fulfilledDsps: 8, rate: 80 },
    issueRate: 25.7,
  });
  assert.strictEqual(kpis.shippedKits, 70);
  assert.strictEqual(kpis.receivedKits, 53);
  assert.strictEqual(kpis.affectedKits, 18);
  assert.strictEqual(kpis.fulfillment.rate, 80);
}

function testIssueTypeFilter() {
  const composition = filterComposition(
    { mismatch: 4, notReceived: 6, damaged: 2, lost: 1, totalAffected: 13 },
    'mismatch',
  );
  assert.strictEqual(composition.mismatch, 4);
  assert.strictEqual(composition.notReceived, 0);
  assert.strictEqual(composition.totalAffected, 4);
}

function testSummaryHasReportingData() {
  assert.strictEqual(summaryHasReportingData({ sentKits: 0, schoolsWithActivity: 0 }), false);
  assert.strictEqual(summaryHasReportingData({ sentKits: 10 }), true);
  assert.strictEqual(summaryHasReportingData({ affectedKits: 0, acknowledgedKits: 5 }), true);
}

function testTrendsPayloadLaunchAware() {
  const aug = buildTrendPoint({
    month: '2026-08',
    sentKits: 70,
    affectedKits: 12,
    mismatchKits: 4,
    notReceivedKits: 8,
    damagedKits: 0,
    lostKits: 0,
  });
  const oneMonth = buildTrendsPayload([aug], 6, 'all');
  assert.strictEqual(oneMonth.showChart, false);
  assert.strictEqual(oneMonth.availableMonths, 1);
  assert.strictEqual(oneMonth.months.length, 0);

  const jul = buildTrendPoint({
    month: '2026-07',
    sentKits: 40,
    affectedKits: 8,
    mismatchKits: 8,
    notReceivedKits: 0,
    damagedKits: 0,
    lostKits: 0,
  });
  const twoMonths = buildTrendsPayload([jul, aug], 6, 'all');
  assert.strictEqual(twoMonths.showChart, true);
  assert.strictEqual(twoMonths.months.length, 2);
  assert.deepStrictEqual(twoMonths.volume.totalAffected, [8, 12]);

  const zeroIssueMonth = buildTrendPoint({
    month: '2026-06',
    sentKits: 20,
    affectedKits: 0,
    mismatchKits: 0,
    notReceivedKits: 0,
    damagedKits: 0,
    lostKits: 0,
  });
  const withZeroIssues = buildTrendsPayload([zeroIssueMonth, jul, aug], 6, 'all');
  assert.strictEqual(withZeroIssues.showChart, true);
  assert.strictEqual(withZeroIssues.volume.totalAffected[0], 0);
}

testIssueRate();
testAffectedHistorical();
testAuditNotInComposition();
testFulfillmentOnRow();
testRankings();
testBuildKpis();
testIssueTypeFilter();
testSummaryHasReportingData();
testTrendsPayloadLaunchAware();

console.log('monthlyAnalytics.test.js: all tests passed');
