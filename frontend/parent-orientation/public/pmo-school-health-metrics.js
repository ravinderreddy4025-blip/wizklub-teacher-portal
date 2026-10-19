/**
 * PMO School Health — metrics, tiers, view-model (Phase 1 mock).
 * Definitions align with PMO_SCHOOL_HEALTH_CONTRACT.md.
 */
(function (global) {
  const HEALTH_THRESHOLDS = {
    criticalActiveRatio: 0.25,
    criticalLabPct: 30,
    atRiskPct: 60,
  };

  const REQUIRED_METRICS_FOR_TIER = ['activeStudentRatio', 'labCompletionPct'];
  const MIN_MEASURED_FOR_TIER = 2;
  const DEFAULT_PAGE_SIZE = 10;

  const TIER_META = {
    healthy: { id: 'healthy', label: 'Healthy', cls: 'pmo-shr-tier--healthy' },
    at_risk: { id: 'at_risk', label: 'At Risk', cls: 'pmo-shr-tier--at-risk' },
    critical: { id: 'critical', label: 'Critical', cls: 'pmo-shr-tier--critical' },
    unknown: { id: 'unknown', label: 'Unknown', cls: 'pmo-shr-tier--unknown' },
  };

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  /** actual / expected × 100; null if denominator missing or zero. */
  function loginAchievement(actual, expected) {
    const a = num(actual);
    const e = num(expected);
    if (a == null || e == null || e <= 0) return null;
    return Math.min(999, Math.round((a / e) * 100));
  }

  function pctFromParts(completed, total) {
    const c = num(completed);
    const t = num(total);
    if (c == null || t == null || t <= 0) return null;
    return Math.round((c / t) * 100);
  }

  function ratioFromSchool(school, period) {
    const block = period === 'today' ? school.today : school.month;
    if (!block) return null;
    const r = num(block.activeStudentRatio);
    if (r != null) return r;
    const active = num(block.activeStudents);
    const enrolled = num(school.enrolledStudents);
    if (active != null && enrolled != null && enrolled > 0) return active / enrolled;
    return null;
  }

  function labPct(school) {
    return num(school.batchWide?.labCompletionPct);
  }

  function assessmentPct(school) {
    return num(school.batchWide?.assessmentCompletionPct);
  }

  function batchCompletionPct(school) {
    const b = school.batch?.completionPct;
    if (b != null) return num(b);
    return labPct(school);
  }

  function hardwarePct(school) {
    if (!school.hasHardwareTelemetry) return null;
    return num(school.hardwareUtilPct);
  }

  function periodLab(school, period) {
    const block = school.periodLab?.[period === 'today' ? 'today' : 'month'];
    if (!block) return { completedDue: null, totalDue: null, pct: null };
    const completedDue = num(block.completedDue);
    const totalDue = num(block.totalDue);
    return {
      completedDue,
      totalDue,
      pct: pctFromParts(completedDue, totalDue),
    };
  }

  function computeSchoolTier(school, period) {
    const activeRatio = ratioFromSchool(school, period);
    const lab = labPct(school);
    const measured = {
      activeStudentRatio: activeRatio,
      labCompletionPct: lab,
    };
    let measuredCount = 0;
    for (const key of REQUIRED_METRICS_FOR_TIER) {
      if (measured[key] != null) measuredCount += 1;
    }
    const coverage = { measured: measuredCount, required: REQUIRED_METRICS_FOR_TIER.length };

    if (measuredCount < MIN_MEASURED_FOR_TIER) {
      return { tier: 'unknown', coverage, metrics: measured };
    }

    const activePct = activeRatio != null ? activeRatio * 100 : null;
    const labP = lab;

    if (
      (activePct != null && activePct < HEALTH_THRESHOLDS.criticalActiveRatio * 100) ||
      (labP != null && labP < HEALTH_THRESHOLDS.criticalLabPct)
    ) {
      return { tier: 'critical', coverage, metrics: measured };
    }

    const atRisk =
      (activePct != null && activePct < HEALTH_THRESHOLDS.atRiskPct) ||
      (labP != null && labP < HEALTH_THRESHOLDS.atRiskPct);
    if (atRisk) return { tier: 'at_risk', coverage, metrics: measured };

    return { tier: 'healthy', coverage, metrics: measured };
  }

  function formatPct(v, digits) {
    if (v == null) return 'N/A';
    const d = digits == null ? 0 : digits;
    return `${v.toFixed(d)}%`;
  }

  function formatRatioPct(ratio) {
    if (ratio == null) return 'N/A';
    return formatPct(ratio * 100, 0);
  }

  function formatInt(n) {
    const v = num(n);
    if (v == null) return '—';
    return v.toLocaleString();
  }

  function normalizeSearch(s) {
    return String(s || '').trim().toLowerCase();
  }

  function schoolMatchesSearch(school, q) {
    if (!q) return true;
    const hay = `${school.name} ${school.region} ${school.gradeBatch || ''}`.toLowerCase();
    return hay.includes(q);
  }

  function enrichSchoolRow(school, period) {
    const tierResult = computeSchoolTier(school, period);
    const pl = periodLab(school, period);
    return {
      school,
      id: school.id,
      name: school.name,
      region: school.region,
      gradeBatch: school.gradeBatch || '—',
      loggedInToday: Boolean(school.loggedInToday),
      enrolledStudents: num(school.enrolledStudents),
      activeStudents:
        period === 'today' ? num(school.today?.activeStudents) : num(school.month?.activeStudents),
      monthActiveStudents: num(school.month?.activeStudents),
      activeRatio: ratioFromSchool(school, period),
      labCompletionPct: labPct(school),
      assessmentCompletionPct: assessmentPct(school),
      batchCompletionPct: batchCompletionPct(school),
      hardwareUtilPct: hardwarePct(school),
      batchEndDate: school.batch?.endDate || null,
      batchStartDate: school.batch?.startDate || null,
      periodLabCompleted: pl.completedDue,
      periodLabTotal: pl.totalDue,
      periodLabPct: pl.pct,
      tier: tierResult.tier,
      tierMeta: TIER_META[tierResult.tier] || TIER_META.unknown,
      coverage: tierResult.coverage,
    };
  }

  function filterSchools(rows, filters) {
    const q = normalizeSearch(filters.search);
    const regionFilter = String(filters.region || '').trim();
    const statusFilter = String(filters.statusTier || '').trim();
    const gradeFilter = String(filters.grade || '').trim();

    let out = rows.filter((row) => schoolMatchesSearch(row.school, q));
    if (regionFilter) out = out.filter((r) => r.region === regionFilter);
    if (statusFilter) out = out.filter((r) => r.tier === statusFilter);
    if (gradeFilter) out = out.filter((r) => r.gradeBatch === gradeFilter);
    return out;
  }

  function filterDailyForMonth(dailyLogins, monthKey) {
    const prefix = `${monthKey}-`;
    return (dailyLogins || []).filter((d) => String(d.date || '').startsWith(prefix));
  }

  function aggregateSchoolActivity(allRows) {
    const total = allRows.length;
    const loggedIn = allRows.filter((r) => r.loggedInToday).length;
    const notLoggedIn = total - loggedIn;
    const loggedPct = total > 0 ? Math.round((loggedIn / total) * 100) : null;
    const notPct = total > 0 ? Math.round((notLoggedIn / total) * 100) : null;
    return { total, loggedIn, notLoggedIn, loggedPct, notPct };
  }

  function portfolioLab(fixture, period) {
    const key = period === 'today' ? 'today' : 'month';
    const block = fixture.portfolioLab?.[key];
    if (block) {
      return {
        completedDue: num(block.completedDue),
        totalDue: num(block.totalDue),
        pct: pctFromParts(block.completedDue, block.totalDue),
      };
    }
    let c = 0;
    let t = 0;
    for (const s of fixture.schools || []) {
      const pl = periodLab(s, period);
      if (pl.completedDue != null) c += pl.completedDue;
      if (pl.totalDue != null) t += pl.totalDue;
    }
    return { completedDue: c, totalDue: t, pct: pctFromParts(c, t) };
  }

  function paginateRows(rows, page, pageSize, showAll) {
    if (showAll) return { pageRows: rows, page: 1, pageCount: 1, total: rows.length };
    const total = rows.length;
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const p = Math.min(Math.max(1, page), pageCount);
    const start = (p - 1) * pageSize;
    return {
      pageRows: rows.slice(start, start + pageSize),
      page: p,
      pageCount,
      total,
    };
  }

  /**
   * @param {object} fixture
   * @param {object} filters
   * @param {{ page?: number, pageSize?: number, showAll?: boolean }} paging
   */
  function buildViewModel(fixture, filters, paging) {
    const period = filters.period === 'today' ? 'today' : 'month';
    const monthKey = filters.monthKey || fixture.meta?.defaultMonth || '';
    const pageSize = paging?.pageSize || DEFAULT_PAGE_SIZE;
    const showAll = Boolean(paging?.showAll);
    const page = num(paging?.page) || 1;

    const allRows = (fixture.schools || []).map((s) => enrichSchoolRow(s, period));
    const tableRows = filterSchools(allRows, filters);

    const regions = [...new Set((fixture.schools || []).map((s) => s.region).filter(Boolean))].sort();
    const grades = [...new Set((fixture.schools || []).map((s) => s.gradeBatch).filter(Boolean))].sort();

    const activity = aggregateSchoolActivity(allRows);
    const snap = fixture.todaySnapshot || {};
    const activeSchoolsToday =
      num(snap.activeSchools) != null ? num(snap.activeSchools) : activity.loggedIn;
    const totalSchools = allRows.length;
    const loginActual = period === 'today' ? num(snap.actualLogins) : null;
    const loginExpected = period === 'today' ? num(snap.expectedLogins) : null;
    let monthLoginActual = null;
    let monthLoginExpected = null;
    if (period === 'month') {
      const series = filterDailyForMonth(fixture.dailyLogins, monthKey);
      monthLoginActual = series.reduce((s, d) => s + (num(d.actual) || 0), 0);
      monthLoginExpected = series.reduce((s, d) => s + (num(d.expected) || 0), 0);
    }
    const labBlock = portfolioLab(fixture, period);

    const primaryKpis = {
      totalSchools: {
        value: totalSchools,
        sub: `${activeSchoolsToday} active today · ${totalSchools - activeSchoolsToday} inactive today`,
      },
      activeSchoolsToday: {
        active: activeSchoolsToday,
        total: totalSchools,
        pct: pctFromParts(activeSchoolsToday, totalSchools),
      },
      studentLogins: {
        actual: period === 'today' ? loginActual : monthLoginActual,
        expected: period === 'today' ? loginExpected : monthLoginExpected,
        achievement: loginAchievement(
          period === 'today' ? loginActual : monthLoginActual,
          period === 'today' ? loginExpected : monthLoginExpected
        ),
        periodLabel: period === 'today' ? 'today' : `month (${monthKey})`,
      },
      labSessions: {
        completed: labBlock.completedDue,
        due: labBlock.totalDue,
        pct: labBlock.pct,
        periodLabel: period === 'today' ? 'today (sessions due)' : 'this month (sessions due)',
      },
    };

    const tableTierCounts = { healthy: 0, at_risk: 0, critical: 0, unknown: 0 };
    for (const r of tableRows) tableTierCounts[r.tier] = (tableTierCounts[r.tier] || 0) + 1;

    const tableKpis = {
      showing: tableRows.length,
      atRisk: tableTierCounts.at_risk + tableTierCounts.critical,
      healthy: tableTierCounts.healthy,
    };

    const pagination = paginateRows(tableRows, page, pageSize, showAll);

    let trend = { mode: period === 'today' ? 'today' : 'month', monthKey, series: [], todayPanel: null };

    if (period === 'today') {
      trend.todayPanel = {
        actual: loginActual,
        expected: loginExpected,
        yesterday: num(snap.yesterdayLogins),
        achievement: loginAchievement(loginActual, loginExpected),
        gap:
          loginActual != null && loginExpected != null ? loginExpected - loginActual : null,
      };
    } else {
      trend.series = filterDailyForMonth(fixture.dailyLogins, monthKey).map((d) => ({
        date: d.date,
        actual: num(d.actual),
        expected: num(d.expected),
        achievement: loginAchievement(d.actual, d.expected),
      }));
      const last = trend.series[trend.series.length - 1];
      trend.todayPanel = last
        ? {
            actual: last.actual,
            expected: last.expected,
            achievement: last.achievement,
            gap:
              last.actual != null && last.expected != null ? last.expected - last.actual : null,
            label: 'Last day in month',
          }
        : null;
    }

    return {
      period,
      monthKey,
      regions,
      grades,
      primaryKpis,
      schoolActivity: activity,
      tableKpis,
      trend,
      tableRows,
      pageRows: pagination.pageRows,
      pagination,
      allRows,
    };
  }

  function escapeCsvCell(value) {
    const s = value == null ? '' : String(value);
    if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  function buildCsv(tableRows, period) {
    const periodLabel = period === 'today' ? 'Today' : 'Month';
    const headers = [
      'School',
      'Region',
      'Grade batch',
      'Health status',
      'Data coverage',
      `Monthly active students (${periodLabel})`,
      'Lab completion % (batch)',
      'Assessment completion % (batch)',
      'Hardware usage %',
      'Batch completion %',
      'Batch end date',
    ];
    const lines = [headers.map(escapeCsvCell).join(',')];
    for (const r of tableRows) {
      const cov = `${r.coverage.measured}/${r.coverage.required}`;
      lines.push(
        [
          r.name,
          r.region,
          r.gradeBatch,
          r.tierMeta.label,
          cov,
          r.monthActiveStudents != null ? r.monthActiveStudents : '',
          r.labCompletionPct != null ? r.labCompletionPct : '',
          r.assessmentCompletionPct != null ? r.assessmentCompletionPct : '',
          r.hardwareUtilPct != null ? r.hardwareUtilPct : '',
          r.batchCompletionPct != null ? r.batchCompletionPct : '',
          r.batchEndDate || '',
        ]
          .map(escapeCsvCell)
          .join(',')
      );
    }
    return lines.join('\r\n');
  }

  function findSchool(fixture, id) {
    return (fixture.schools || []).find((s) => String(s.id) === String(id)) || null;
  }

  function csvFilename(period, monthKey) {
    const d = new Date().toISOString().slice(0, 10);
    const p = period === 'today' ? 'today' : monthKey || 'month';
    return `school-health-${p}-${d}.csv`;
  }

  global.PmoSchoolHealthMetrics = {
    HEALTH_THRESHOLDS,
    REQUIRED_METRICS_FOR_TIER,
    MIN_MEASURED_FOR_TIER,
    DEFAULT_PAGE_SIZE,
    TIER_META,
    loginAchievement,
    buildViewModel,
    computeSchoolTier,
    enrichSchoolRow,
    filterSchools,
    formatPct,
    formatRatioPct,
    formatInt,
    escapeCsvCell,
    buildCsv,
    csvFilename,
    findSchool,
    filterDailyForMonth,
  };
})(typeof window !== 'undefined' ? window : global);
