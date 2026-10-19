/**
 * PMO School Health dashboard (Phase 1 mock fixture).
 */
(function () {
  const FIXTURE_URL = 'fixtures/pmo-school-health-mock.json';

  const state = {
    loaded: false,
    loading: false,
    error: null,
    fixture: null,
    period: 'month',
    monthKey: '',
    search: '',
    region: '',
    grade: '',
    statusTier: '',
    page: 1,
    showAll: false,
    view: 'overview',
    schoolId: null,
  };

  function M() {
    return window.PmoSchoolHealthMetrics || {};
  }

  function esc(s) {
    if (window.PO && window.PO.escapeHtml) return window.PO.escapeHtml(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function rootEl() {
    return document.getElementById('pmo-school-health-root');
  }

  function filters() {
    return {
      period: state.period,
      monthKey: state.monthKey,
      search: state.search,
      region: state.region,
      grade: state.grade,
      statusTier: state.statusTier,
    };
  }

  function paging() {
    return { page: state.page, showAll: state.showAll, pageSize: M().DEFAULT_PAGE_SIZE || 10 };
  }

  function vm() {
    if (!state.fixture) return null;
    return M().buildViewModel(state.fixture, filters(), paging());
  }

  function formatMonthLabel(ym) {
    if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return ym || '';
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    return d.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  }

  function tierPill(row) {
    const meta = row.tierMeta;
    let sub = '';
    if (row.tier === 'unknown' && row.coverage) {
      sub = `<span class="pmo-shr-tier__sub">Coverage ${row.coverage.measured}/${row.coverage.required}</span>`;
    }
    return `<span class="pmo-shr-tier ${meta.cls}">${esc(meta.label)}${sub}</span>`;
  }

  function sampleBanner() {
    const label = state.fixture?.meta?.sampleLabel || 'SAMPLE DATA · NOT LIVE METRICS';
    return `<div class="pmo-shr-sample" role="status">
      <strong>${esc(label)}</strong>
      <span class="pmo-shr-sample__sub">Illustrative dashboard for UX; metrics are not connected to production.</span>
    </div>`;
  }

  function renderPrimaryKpis(k) {
    const k1 = k.totalSchools;
    const k2 = k.activeSchoolsToday;
    const k3 = k.studentLogins;
    const k4 = k.labSessions;
    const loginStr =
      k3.actual != null && k3.expected != null
        ? `${M().formatInt(k3.actual)} / ${M().formatInt(k3.expected)}`
        : '—';
    const labStr =
      k4.completed != null && k4.due != null
        ? `${M().formatInt(k4.completed)} / ${M().formatInt(k4.due)}`
        : '—';
    return `<div class="pmo-shr-kpi-grid" aria-label="Primary KPIs">
      <div class="pmo-shr-kpi">
        <span class="pmo-shr-kpi__label">Total schools</span>
        <span class="pmo-shr-kpi__value">${k1.value}</span>
        <span class="pmo-shr-kpi__sub">${esc(k1.sub)}</span>
      </div>
      <div class="pmo-shr-kpi">
        <span class="pmo-shr-kpi__label">Active schools today</span>
        <span class="pmo-shr-kpi__value">${k2.active} / ${k2.total}</span>
        <span class="pmo-shr-kpi__sub">${k2.pct != null ? k2.pct + '% of portfolio' : '—'}</span>
      </div>
      <div class="pmo-shr-kpi">
        <span class="pmo-shr-kpi__label">Student logins (${esc(k3.periodLabel)})</span>
        <span class="pmo-shr-kpi__value">${loginStr}</span>
        <span class="pmo-shr-kpi__sub">Achievement ${k3.achievement != null ? k3.achievement + '%' : 'N/A'} (unique students, illustrative)</span>
      </div>
      <div class="pmo-shr-kpi">
        <span class="pmo-shr-kpi__label">Lab session completion</span>
        <span class="pmo-shr-kpi__value">${labStr}</span>
        <span class="pmo-shr-kpi__sub">${esc(k4.periodLabel)} · ${k4.pct != null ? k4.pct + '%' : 'N/A'}</span>
      </div>
    </div>`;
  }

  function renderSchoolActivity(act) {
    const logged = act.loggedIn;
    const not = act.notLoggedIn;
    const lp = act.loggedPct != null ? act.loggedPct : 0;
    const np = act.notPct != null ? act.notPct : 0;
    return `<section class="pmo-shr-activity" aria-labelledby="pmo-shr-activity-title">
      <h3 class="pmo-shr-panel-title" id="pmo-shr-activity-title">School activity (today)</h3>
      <p class="pmo-shr-muted">Derived from all schools in the sample (not affected by table filters).</p>
      <div class="pmo-shr-activity-grid">
        <div class="pmo-shr-activity-stat">
          <span class="pmo-shr-activity-stat__label">Logged in today</span>
          <span class="pmo-shr-activity-stat__value">${logged} <span class="pmo-shr-muted">(${lp}%)</span></span>
        </div>
        <div class="pmo-shr-activity-stat">
          <span class="pmo-shr-activity-stat__label">Not logged in today</span>
          <span class="pmo-shr-activity-stat__value">${not} <span class="pmo-shr-muted">(${np}%)</span></span>
        </div>
        <div class="pmo-shr-donut" role="img" aria-label="Logged in ${logged} of ${act.total} schools (${lp} percent)">
          <svg viewBox="0 0 36 36" class="pmo-shr-donut__svg" aria-hidden="true">
            <path class="pmo-shr-donut__bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
            <path class="pmo-shr-donut__fg" stroke-dasharray="${lp}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
          </svg>
          <span class="pmo-shr-donut__pct">${lp}%</span>
        </div>
      </div>
    </section>`;
  }

  function renderTodayPanel(trend) {
    const p = trend.todayPanel || {};
    const actual = p.actual != null ? M().formatInt(p.actual) : '—';
    const expected = p.expected != null ? M().formatInt(p.expected) : '—';
    const gap = p.gap != null ? M().formatInt(Math.abs(p.gap)) : null;
    let vsYesterday = '';
    if (p.yesterday != null && p.actual != null) {
      const delta = p.actual - p.yesterday;
      const sign = delta >= 0 ? '+' : '';
      vsYesterday = `<p class="pmo-shr-muted">vs yesterday: ${sign}${delta} (${M().formatInt(p.yesterday)} logins)</p>`;
    }
    const label = p.label ? esc(p.label) : "Today's logins (all schools)";
    return `<div class="pmo-shr-trend-panel">
      <h3 class="pmo-shr-panel-title">Student login trend — ${label}</h3>
      <p class="pmo-shr-muted pmo-shr-trend-note">Single-day comparison (not a multi-day trend). All schools in sample.</p>
      <div class="pmo-shr-today-nums">
        <div class="pmo-shr-kpi"><span class="pmo-shr-kpi__label">Actual</span><span class="pmo-shr-kpi__value">${actual}</span></div>
        <div class="pmo-shr-kpi"><span class="pmo-shr-kpi__label">Expected</span><span class="pmo-shr-kpi__value">${expected}</span></div>
        <div class="pmo-shr-kpi"><span class="pmo-shr-kpi__label">Achievement</span><span class="pmo-shr-kpi__value">${p.achievement != null ? p.achievement + '%' : 'N/A'}</span></div>
        ${gap != null ? `<div class="pmo-shr-kpi"><span class="pmo-shr-kpi__label">Gap</span><span class="pmo-shr-kpi__value">${gap}</span></div>` : ''}
      </div>
      ${vsYesterday}
    </div>`;
  }

  function renderMonthTrend(trend) {
    const series = trend.series || [];
    if (!series.length) {
      return `<div class="pmo-shr-trend-panel"><p class="pmo-shr-empty">No daily login data for this month.</p></div>`;
    }
    const maxVal = Math.max(...series.map((d) => Math.max(d.actual || 0, d.expected || 0)), 1);
    const bars = series
      .map((d) => {
        const day = String(d.date).slice(8, 10);
        const ah = Math.round(((d.actual || 0) / maxVal) * 100);
        const eh = Math.round(((d.expected || 0) / maxVal) * 100);
        return `<div class="pmo-shr-bar-group" title="${esc(d.date)}: actual ${d.actual ?? '—'}, expected ${d.expected ?? '—'}">
          <div class="pmo-shr-bar-stack">
            <div class="pmo-shr-bar pmo-shr-bar--expected" style="height:${eh}%"></div>
            <div class="pmo-shr-bar pmo-shr-bar--actual" style="height:${ah}%"></div>
          </div>
          <span class="pmo-shr-bar-label">${esc(day)}</span>
        </div>`;
      })
      .join('');
    const summary = trend.todayPanel;
    const sumHtml = summary
      ? `<p class="pmo-shr-muted">Last day in series: actual ${M().formatInt(summary.actual)}, expected ${M().formatInt(summary.expected)}, achievement ${summary.achievement != null ? summary.achievement + '%' : 'N/A'}.</p>`
      : '';
    return `<div class="pmo-shr-trend-panel">
      <h3 class="pmo-shr-panel-title">Student login trend — ${esc(formatMonthLabel(trend.monthKey))}</h3>
      <p class="pmo-shr-muted pmo-shr-trend-note">Daily unique active students (all schools). Orange = actual, navy = expected.</p>
      <div class="pmo-shr-bar-chart" role="img" aria-label="Daily login trend">${bars}</div>
      ${sumHtml}
    </div>`;
  }

  function renderFilters(vmodel) {
    const regions = vmodel.regions || [];
    const grades = vmodel.grades || [];
    const regionOpts = regions
      .map((r) => `<option value="${esc(r)}"${state.region === r ? ' selected' : ''}>${esc(r)}</option>`)
      .join('');
    const gradeOpts = grades
      .map((g) => `<option value="${esc(g)}"${state.grade === g ? ' selected' : ''}>${esc(g)}</option>`)
      .join('');
    const tiers = M().TIER_META || {};
    const statusOpts = Object.keys(tiers)
      .map((k) => {
        const t = tiers[k];
        return `<option value="${esc(t.id)}"${state.statusTier === t.id ? ' selected' : ''}>${esc(t.label)}</option>`;
      })
      .join('');
    const periodToday = state.period === 'today' ? ' checked' : '';
    const periodMonth = state.period === 'month' ? ' checked' : '';
    const monthDisabled = state.period === 'today' ? ' disabled' : '';
    return `<div class="pmo-shr-filters">
      <fieldset class="pmo-shr-period">
        <legend class="pmo-shr-filter-label">Period</legend>
        <label><input type="radio" name="pmo-shr-period" value="today"${periodToday}> Today</label>
        <label><input type="radio" name="pmo-shr-period" value="month"${periodMonth}> This month</label>
      </fieldset>
      <div class="pmo-shr-filter-field">
        <label class="pmo-shr-filter-label" for="pmo-shr-month">Month</label>
        <input type="month" id="pmo-shr-month" value="${esc(state.monthKey)}"${monthDisabled}>
      </div>
      <div class="pmo-shr-filter-field">
        <label class="pmo-shr-filter-label" for="pmo-shr-region">Region</label>
        <select id="pmo-shr-region"><option value="">All regions</option>${regionOpts}</select>
      </div>
      <div class="pmo-shr-filter-field">
        <label class="pmo-shr-filter-label" for="pmo-shr-grade">Grade batch</label>
        <select id="pmo-shr-grade"><option value="">All grades</option>${gradeOpts}</select>
      </div>
      <div class="pmo-shr-filter-field">
        <label class="pmo-shr-filter-label" for="pmo-shr-status">Health status</label>
        <select id="pmo-shr-status"><option value="">All statuses</option>${statusOpts}</select>
      </div>
      <div class="pmo-shr-filter-field pmo-shr-filter-field--grow">
        <label class="pmo-shr-filter-label" for="pmo-shr-search">Search</label>
        <input type="search" id="pmo-shr-search" placeholder="School name…" value="${esc(state.search)}">
      </div>
      <button type="button" class="btn btn-o btn-sm" id="pmo-shr-export">Export CSV</button>
    </div>`;
  }

  function renderTable(vmodel) {
    const rows = vmodel.pageRows || [];
    const pag = vmodel.pagination || { total: 0, page: 1, pageCount: 1 };
    const countLive = `<p class="pmo-shr-table-meta" aria-live="polite">Showing ${rows.length} of ${pag.total} schools (filtered)</p>`;
    if (!pag.total) {
      return `${countLive}<p class="pmo-shr-empty">No schools match the current filters.</p>`;
    }
    const body = rows
      .map((r) => {
        return `<tr class="pmo-shr-row" data-school-id="${esc(r.id)}" tabindex="0">
          <td>${esc(r.name)}</td>
          <td>${esc(r.gradeBatch)}</td>
          <td>${tierPill(r)}</td>
          <td>${r.monthActiveStudents != null ? M().formatInt(r.monthActiveStudents) : '—'}</td>
          <td>${M().formatPct(r.labCompletionPct)}</td>
          <td>${M().formatPct(r.assessmentCompletionPct)}</td>
          <td>${r.hardwareUtilPct != null ? M().formatPct(r.hardwareUtilPct) : 'N/A'}</td>
          <td>${M().formatPct(r.batchCompletionPct)}</td>
          <td>${r.batchEndDate ? esc(r.batchEndDate) : '—'}</td>
          <td><button type="button" class="btn btn-o btn-sm" data-pmo-shr-view="${esc(r.id)}">View details</button></td>
        </tr>`;
      })
      .join('');
    const pager = state.showAll
      ? `<button type="button" class="btn btn-o btn-sm" id="pmo-shr-paginate">Paginate (${M().DEFAULT_PAGE_SIZE || 10} per page)</button>`
      : `<div class="pmo-shr-pager">
          <button type="button" class="btn btn-o btn-sm" id="pmo-shr-prev" ${pag.page <= 1 ? 'disabled' : ''}>Prev</button>
          <span>Page ${pag.page} / ${pag.pageCount}</span>
          <button type="button" class="btn btn-o btn-sm" id="pmo-shr-next" ${pag.page >= pag.pageCount ? 'disabled' : ''}>Next</button>
          <button type="button" class="btn btn-o btn-sm" id="pmo-shr-show-all">Show all</button>
        </div>`;
    return `${countLive}
    <div class="pmo-shr-table-wrap">
      <table class="pmo-shr-table">
        <thead><tr>
          <th>School</th><th>Grade / batch</th><th>Health status</th><th>Monthly active students</th>
          <th>Lab completion</th><th>Assessment</th><th>Hardware</th><th>Batch completion</th><th>Batch end</th><th></th>
        </tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    ${pager}`;
  }

  function renderSchoolDetail(school, vmodel) {
    const row = M().enrichSchoolRow(school, vmodel.period);
    const periodLbl = vmodel.period === 'today' ? 'Today' : `This month (${vmodel.monthKey})`;
    const hw =
      row.hardwareUtilPct != null
        ? M().formatPct(row.hardwareUtilPct)
        : 'N/A (no telemetry)';
    const pl = row.periodLabCompleted != null && row.periodLabTotal != null
      ? `${row.periodLabCompleted} / ${row.periodLabTotal} (${M().formatPct(row.periodLabPct)})`
      : 'N/A';
    return `${sampleBanner()}
      <button type="button" class="btn btn-o btn-sm pmo-shr-back" data-pmo-shr-back>← School health overview</button>
      <header class="pmo-shr-detail-hero">
        <h2 class="pmo-shr-detail-title">${esc(school.name)}</h2>
        <p class="pmo-shr-muted">${esc(school.region)} · ${esc(row.gradeBatch)} · Enrolled ${row.enrolledStudents ?? '—'}</p>
        <div class="pmo-shr-detail-status">${tierPill(row)}</div>
      </header>
      ${renderFilters(vmodel)}
      <div class="pmo-shr-detail-grid">
        <section class="pmo-shr-detail-card">
          <h3>Login engagement — ${esc(periodLbl)}</h3>
          <p>Active students: <strong>${row.activeStudents ?? '—'}</strong></p>
          <p>Active ratio: <strong>${M().formatRatioPct(row.activeRatio)}</strong></p>
          <p>Logged in today: <strong>${row.loggedInToday ? 'Yes' : 'No'}</strong></p>
        </section>
        <section class="pmo-shr-detail-card">
          <h3>Lab sessions — ${esc(periodLbl)}</h3>
          <p>Completed / due: <strong>${esc(pl)}</strong></p>
          <p>Batch lab completion: <strong>${M().formatPct(row.labCompletionPct)}</strong></p>
        </section>
        <section class="pmo-shr-detail-card">
          <h3>Assessment — batch to date</h3>
          <p>Completion: <strong>${M().formatPct(row.assessmentCompletionPct)}</strong></p>
        </section>
        <section class="pmo-shr-detail-card">
          <h3>Hardware &amp; batch</h3>
          <p>Hardware: <strong>${esc(hw)}</strong></p>
          <p>Batch completion: <strong>${M().formatPct(row.batchCompletionPct)}</strong></p>
          <p>Batch dates: <strong>${esc(row.batchStartDate || '—')} → ${esc(row.batchEndDate || '—')}</strong></p>
        </section>
      </div>`;
  }

  function renderOverview(vmodel) {
    const trend =
      vmodel.trend.mode === 'today' ? renderTodayPanel(vmodel.trend) : renderMonthTrend(vmodel.trend);
    return `${sampleBanner()}
      <header class="pmo-shr-header">
        <h2 class="pmo-shr-title">School Health Report</h2>
        <p class="pmo-shr-lead">Monitor school engagement, learning progress and identify at-risk schools.</p>
      </header>
      ${renderFilters(vmodel)}
      ${renderPrimaryKpis(vmodel.primaryKpis)}
      ${renderSchoolActivity(vmodel.schoolActivity)}
      ${trend}
      <h3 class="pmo-shr-panel-title">School-wise health</h3>
      ${renderTable(vmodel)}`;
  }

  function renderShell() {
    const el = rootEl();
    if (!el) return;
    if (state.loading) {
      el.innerHTML = `${sampleBanner()}<p class="pmo-shr-muted" role="status">Loading sample data…</p>`;
      return;
    }
    if (state.error) {
      el.innerHTML = `${sampleBanner()}
        <p class="pmo-shr-error" role="alert">${esc(state.error)}</p>
        <button type="button" class="btn btn-p btn-sm" id="pmo-shr-retry">Retry</button>`;
      return;
    }
    if (!state.fixture) {
      el.innerHTML = `${sampleBanner()}<p class="pmo-shr-muted">No data loaded.</p>`;
      return;
    }
    const vmodel = vm();
    if (!vmodel) return;

    if (state.view === 'detail' && state.schoolId) {
      const school = M().findSchool(state.fixture, state.schoolId);
      if (!school) {
        state.view = 'overview';
        state.schoolId = null;
        el.innerHTML = renderOverview(vmodel);
        return;
      }
      el.innerHTML = renderSchoolDetail(school, vmodel);
    } else {
      el.innerHTML = renderOverview(vmodel);
    }
  }

  function setSchoolRoute(schoolId) {
    const hooks = window.__poSchoolHealthHooks;
    if (hooks && hooks.setSchoolHash) hooks.setSchoolHash(schoolId || null);
    else {
      state.view = schoolId ? 'detail' : 'overview';
      state.schoolId = schoolId || null;
      renderShell();
    }
  }

  function onFilterChange(resetPage) {
    if (resetPage) state.page = 1;
    renderShell();
  }

  let _delegationBound = false;

  function bindEvents() {
    const el = rootEl();
    if (!el || _delegationBound) return;
    _delegationBound = true;

    el.addEventListener('click', (e) => {
      if (e.target.closest('#pmo-shr-retry')) {
        loadFixture();
        return;
      }
      if (e.target.closest('#pmo-shr-export')) {
        const vmodel = vm();
        if (!vmodel) return;
        const csv = M().buildCsv(vmodel.tableRows, vmodel.period);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = M().csvFilename
          ? M().csvFilename(vmodel.period, vmodel.monthKey)
          : `school-health-${vmodel.monthKey || 'export'}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }
      if (e.target.closest('#pmo-shr-prev')) {
        state.page = Math.max(1, state.page - 1);
        renderShell();
        return;
      }
      if (e.target.closest('#pmo-shr-next')) {
        state.page += 1;
        renderShell();
        return;
      }
      if (e.target.closest('#pmo-shr-show-all')) {
        state.showAll = true;
        renderShell();
        return;
      }
      if (e.target.closest('#pmo-shr-paginate')) {
        state.showAll = false;
        state.page = 1;
        renderShell();
        return;
      }
      const back = e.target.closest('[data-pmo-shr-back]');
      if (back) {
        setSchoolRoute(null);
        return;
      }
      const viewBtn = e.target.closest('[data-pmo-shr-view]');
      if (viewBtn) {
        e.stopPropagation();
        setSchoolRoute(viewBtn.getAttribute('data-pmo-shr-view'));
        return;
      }
      const row = e.target.closest('.pmo-shr-row');
      if (row && !e.target.closest('button')) {
        setSchoolRoute(row.getAttribute('data-school-id'));
      }
    });

    el.addEventListener('change', (e) => {
      const t = e.target;
      if (t.name === 'pmo-shr-period' && t.checked) {
        state.period = t.value === 'today' ? 'today' : 'month';
        onFilterChange(true);
      }
      if (t.id === 'pmo-shr-month') {
        state.monthKey = t.value || state.fixture?.meta?.defaultMonth || '';
        onFilterChange(true);
      }
      if (t.id === 'pmo-shr-region') {
        state.region = t.value || '';
        onFilterChange(true);
      }
      if (t.id === 'pmo-shr-grade') {
        state.grade = t.value || '';
        onFilterChange(true);
      }
      if (t.id === 'pmo-shr-status') {
        state.statusTier = t.value || '';
        onFilterChange(true);
      }
    });

    el.addEventListener('input', (e) => {
      if (e.target.id === 'pmo-shr-search') {
        state.search = e.target.value || '';
        onFilterChange(true);
      }
    });

    el.addEventListener('keydown', (e) => {
      const row = e.target.closest('.pmo-shr-row');
      if (row && e.key === 'Enter') setSchoolRoute(row.getAttribute('data-school-id'));
    });
  }

  async function loadFixture() {
    state.loading = true;
    state.error = null;
    renderShell();
    try {
      const res = await fetch(FIXTURE_URL, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`Could not load sample data (${res.status})`);
      state.fixture = await res.json();
      if (!state.monthKey) state.monthKey = state.fixture.meta?.defaultMonth || '';
      state.loading = false;
      state.loaded = true;
    } catch (e) {
      state.loading = false;
      state.error = e.message || 'Failed to load sample data';
      state.fixture = null;
    }
    renderShell();
  }

  async function onSectionActive(opts) {
    bindEvents();
    const schoolId = opts && opts.schoolId ? String(opts.schoolId) : null;
    state.view = schoolId ? 'detail' : 'overview';
    state.schoolId = schoolId;
    if (!state.loaded && !state.loading) await loadFixture();
    else renderShell();
  }

  function applyRouteSchoolId(schoolId) {
    const next = schoolId ? String(schoolId) : null;
    if (state.schoolId === next && state.view === (next ? 'detail' : 'overview')) return;
    state.schoolId = next;
    state.view = next ? 'detail' : 'overview';
    if (state.loaded) renderShell();
  }

  window.PmoSchoolHealth = {
    onSectionActive,
    applyRouteSchoolId,
    renderShell,
  };
})();
