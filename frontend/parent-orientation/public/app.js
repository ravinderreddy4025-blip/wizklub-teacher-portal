    const STORE_KEY = 'po_sessions_v8';
    const ROLE_KEY = 'po_logged_in';
    const PO_ROLE_HEADER = 'X-PO-Role';

    function poGetRole() {
      return sessionStorage.getItem(ROLE_KEY) || '';
    }

    function poSetRole(role) {
      if (!role) return;
      sessionStorage.setItem(ROLE_KEY, role);
    }

    function poClearRole() {
      sessionStorage.removeItem(ROLE_KEY);
    }

    // Local-only guard: if PMO opens on http://localhost/pmo without port, force :8080.
    (function ensureLocalGatewayPort() {
      const { protocol, hostname, port, pathname, search, hash } = window.location;
      const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
      const underPmo = pathname === '/pmo' || pathname.startsWith('/pmo/');
      if (protocol === 'http:' && isLocal && !port && underPmo) {
        window.location.replace(`${protocol}//${hostname}:8080${pathname}${search}${hash}`);
      }
    })();

    /** Align older cached/API rows with canonical snake_case keys (matches server migrateLegacyToCanonical). */
    function migrateLegacyClientSession(o) {
      if (!o || typeof o !== 'object' || Array.isArray(o)) return o;
      const out = { ...o };
      const L = o;
      if (out.scheduled_date == null || out.scheduled_date === '') {
        out.scheduled_date = L.date || L.session_date || L.scheduledDate || L.sessionDate;
      }
      if (out.scheduled_start_time == null || out.scheduled_start_time === '') {
        out.scheduled_start_time =
          L.scheduled_start_time != null && L.scheduled_start_time !== ''
            ? L.scheduled_start_time
            : L.scheduled_time != null && L.scheduled_time !== ''
              ? L.scheduled_time
              : L.scheduledStartTime != null && L.scheduledStartTime !== ''
                ? L.scheduledStartTime
                : L.time;
      }
      if (out.scheduled_end_time == null || out.scheduled_end_time === '') {
        out.scheduled_end_time =
          L.end_time != null && L.end_time !== ''
            ? L.end_time
            : L.endTime != null && L.endTime !== ''
              ? L.endTime
              : L.scheduledEndTime;
      }
      if (out.scheduled_end_time == null || out.scheduled_end_time === '') {
        out.scheduled_end_time = defaultScheduledEndFromStartClient(out.scheduled_start_time);
      }
      if (out.location == null || out.location === '') out.location = L.zoom;
      if (out.co_host == null || out.co_host === '') out.co_host = L.cohost;
      if (out.session_status == null || out.session_status === '') out.session_status = L.sessionStatus;
      if (out.follow_up == null || out.follow_up === '') out.follow_up = L.followUp;
      if (out.follow_up_date == null || out.follow_up_date === '') out.follow_up_date = L.followUpDate;
      if (out.follow_up_notes == null || out.follow_up_notes === '') out.follow_up_notes = L.followUpNotes;
      if (out.update_action == null || out.update_action === '') out.update_action = L.updateAction;
      if (out.scheduled_date != null && out.scheduled_date !== '') {
        const ds = String(out.scheduled_date).trim();
        out.scheduled_date = /^\d{4}-\d{2}-\d{2}/.test(ds) ? ds.slice(0, 10) : ds;
      }
      delete out.date;
      delete out.session_date;
      delete out.scheduledDate;
      delete out.sessionDate;
      delete out.time;
      delete out.scheduled_time;
      delete out.scheduledStartTime;
      delete out.zoom;
      delete out.cohost;
      delete out.sessionStatus;
      delete out.followUp;
      delete out.followUpDate;
      delete out.followUpNotes;
      delete out.updateAction;
      delete out.end_time;
      delete out.endTime;
      delete out.scheduledEndTime;
      return out;
    }

    function pad2Client(n) {
      return String(n).padStart(2, '0');
    }

    function parseTimeToMinutesClient(t) {
      const s = String(t ?? '').trim();
      const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
      if (!m) return NaN;
      const h = Number(m[1]);
      const min = Number(m[2]);
      if (!Number.isInteger(h) || !Number.isInteger(min) || h > 23 || min > 59) return NaN;
      return h * 60 + min;
    }

    function defaultScheduledEndFromStartClient(startStr) {
      const sm = parseTimeToMinutesClient(startStr);
      if (Number.isNaN(sm)) return '';
      const end = Math.min(sm + 60, 24 * 60 - 1);
      if (end <= sm) return '';
      return `${pad2Client(Math.floor(end / 60))}:${pad2Client(end % 60)}`;
    }

    /**
     * Never rely on `location.pathname` alone for API paths: `http://host/pmo#/…` has pathname `/pmo`, and
     * relative `api/login` becomes `/api/login` (wrong). Prefer the folder of this script (`app.js`): e.g.
     * `/pmo/app.js` → API base `/pmo/api/` so login hits `/pmo/api/login` on the same origin:port as the UI.
     */
    const PO_API_PREFIX = (function () {
      const scripts = document.getElementsByTagName('script');
      for (let i = scripts.length - 1; i >= 0; i--) {
        const src = scripts[i].src;
        if (!src || !/\/app\.js/i.test(src)) continue;
        try {
          const path = new URL(src).pathname;
          const dir = path.includes('/') ? path.replace(/[^/]+$/, '') : '/';
          return `${dir}api/`.replace(/\/{2,}/g, '/');
        } catch (_) {
          break;
        }
      }
      const p = window.location.pathname || '/';
      const underPmo = p === '/pmo' || p.startsWith('/pmo/');
      return underPmo ? '/pmo/api/' : 'api/';
    })();

    function poResolveUrl(url) {
      const u = String(url || '');
      if (/^(https?:)?\/\//i.test(u) || u.startsWith('/pmo/') || u.startsWith('/api/')) return u;
      if (u.startsWith('api/')) {
        const tail = u.slice(4);
        return PO_API_PREFIX.endsWith('/') ? PO_API_PREFIX + tail : `${PO_API_PREFIX}/${tail}`;
      }
      if (u === 'Parent_Orientation_Tracker.xlsx') {
        const base = PO_API_PREFIX.replace(/\/?api\/$/, '/');
        return `${base}Parent_Orientation_Tracker.xlsx`.replace(/\/{2,}/g, '/');
      }
      return u;
    }

    function poRoleScopedUrl(url, role) {
      if (!role) return url;
      try {
        const abs = new URL(url, window.location.origin);
        if (!abs.searchParams.has('role')) abs.searchParams.set('role', role);
        if (/^(https?:)?\/\//i.test(url)) return abs.toString();
        return `${abs.pathname}${abs.search}${abs.hash}`;
      } catch (_) {
        return url;
      }
    }

    /** Sends which role this tab uses so PMO and Speaker can both be logged in (separate cookies). */
    function poApiFetch(url, init = {}) {
      const role = poGetRole();
      const headers = new Headers(init.headers || {});
      if (role === 'pmo' || role === 'speaker' || role === 'sales_admin') {
        headers.set(PO_ROLE_HEADER, role);
      }
      const resolved = poResolveUrl(url);
      return fetch(poRoleScopedUrl(resolved, role), { credentials: 'include', ...init, headers });
    }

    let sessions = [];
    let openExpand = {};
    let _selEng = {};
    let _selAction = {};
    let _selGrades = [];
    let _selVenue = '';
    let editingId = null;
    let _sessionsSyncTimer = null;

    function escapeHtml(s) {
      if (s == null) return '';
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
    function escapeAttr(s) {
      return escapeHtml(s).replace(/'/g, '&#39;');
    }

    /** Unicode literals for UI (avoids mojibake when app.js is mis-saved as Latin-1). */
    const PO_TEXT = {
      emDash: '\u2014',
      enDash: '\u2013',
      middot: '\u00B7',
      ellipsis: '\u2026',
      arrowDown: '\u25BC',
      arrowRight: '\u2192',
      iconCal: '\u{1F4C5}',
      iconPerson: '\u{1F464}',
      iconPin: '\u{1F4CD}',
      iconId: '\u{1F194}',
    };

    function safeZoomHref(url) {
      const u = String(url || '').trim();
      return /^https?:\/\//i.test(u) ? u : '';
    }

    function todayIsoLocal() {
      const n = new Date();
      return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
    }

    /** Offline venue must be plain text — flag http(s), www., mailto, ftp, or any :// */
    function offlineFieldLooksLikeLink(z) {
      const s = String(z || '').trim();
      if (!s) return false;
      if (safeZoomHref(s)) return true;
      if (/^https?:\/\//i.test(s)) return true;
      if (/^www\./i.test(s)) return true;
      if (/^mailto:/i.test(s)) return true;
      if (/^ftp:\/\//i.test(s)) return true;
      if (/:\/\//.test(s)) return true;
      return false;
    }

    /** Local Date for session date + time inputs (YYYY-MM-DD + HH:mm or HH:mm:ss). */
    function sessionInstantLocal(dateIso, timeStr) {
      const dIso = String(dateIso || '').trim();
      const p = String(timeStr || '').trim();
      if (!dIso || !p) return null;
      const norm = p.length === 5 ? `${p}:00` : p;
      const t = new Date(`${dIso}T${norm}`);
      return Number.isNaN(t.getTime()) ? null : t;
    }

    function refreshPlanDateMinAttr() {
      const el = document.getElementById('p-date');
      if (el) el.min = todayIsoLocal();
    }

    /** Requires session start strictly in the future (today = start after now); end must be after start. */
    function validatePlanScheduleOrToast() {
      const dateIso = document.getElementById('p-date')?.value?.trim() || '';
      const timeStr = document.getElementById('p-time')?.value?.trim() || '';
      const endStr = document.getElementById('p-end-time')?.value?.trim() || '';
      if (!dateIso || !timeStr) return true;
      const today = todayIsoLocal();
      if (dateIso < today) {
        toast('Session date must be today or a future date.', 'error');
        focusPlanField('p-date');
        return false;
      }
      const inst = sessionInstantLocal(dateIso, timeStr);
      if (!inst) {
        toast('Please enter a valid start time.', 'error');
        focusPlanField('p-time');
        return false;
      }
      if (inst.getTime() <= Date.now()) {
        toast('Choose a date and start time in the future. For today, pick a start time after the current time.', 'error');
        focusPlanField('p-time');
        return false;
      }
      if (!endStr) return true;
      const sm = parseTimeToMinutesClient(timeStr);
      const em = parseTimeToMinutesClient(endStr);
      if (Number.isNaN(sm) || Number.isNaN(em)) {
        toast('Please enter valid start and end times.', 'error');
        focusPlanField(Number.isNaN(sm) ? 'p-time' : 'p-end-time');
        return false;
      }
      if (em <= sm) {
        toast('End time must be after start time.', 'error');
        focusPlanField('p-end-time');
        return false;
      }
      return true;
    }
    function buildJoinUrl(sessionId) {
      if (!sessionId) return '';
      return `${window.location.origin}/pmo/join/${encodeURIComponent(sessionId)}`;
    }

    function openRawMeetingLink(href) {
      const h = safeZoomHref(href);
      if (h) window.open(h, '_blank', 'noopener,noreferrer');
    }

    async function copyTextToClipboard(text) {
      if (!text) return false;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(text);
          return true;
        } catch (_) { /* fall through */ }
      }
      return false;
    }

    async function copyJoinLinkForSession(sessionId) {
      if (!sessionId) {
        toast('Save the session first to get a share link for students.', 'warning');
        return;
      }
      const url = buildJoinUrl(sessionId);
      const ok = await copyTextToClipboard(url);
      if (ok) toast('Student share link copied.', 'info');
      else toast('Could not copy automatically — copy the join URL from the session details.', 'warning');
    }

    function formatStudentIdsCell(s) {
      const ids = s && Array.isArray(s.student_ids) ? s.student_ids : [];
      return ids.length ? escapeHtml(ids.join(', ')) : '—';
    }

    function locationLinkHtml(loc, opts) {
      const o = opts && typeof opts === 'object' ? opts : {};
      const href = safeZoomHref(loc);
      const sid = o.sessionId;
      const online = o.venue === 'Online';
      if (href && online && sid) {
        return `<a href="${escapeAttr(href)}" class="po-meeting-link" data-po-meeting-sid="${escapeAttr(sid)}" data-po-meeting-href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer" style="color:#c2410c;text-decoration:none;font-weight:600;">Open meeting</a>
          <button type="button" class="btn btn-o btn-sm po-copy-meeting-link" data-po-meeting-sid="${escapeAttr(sid)}" style="margin-left:8px;vertical-align:middle">Copy share link</button>`;
      }
      if (href) {
        return `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer" style="color:#c2410c;text-decoration:none;font-weight:600;">Open link</a>`;
      }
      const t = (loc || '').trim();
      return t ? escapeHtml(t) : '—';
    }

    function expandKey(sid, mode = 'pmo') {
      return `${mode}:${sid}`;
    }

    async function generateExcelBuffer() {
      const headers = [
        'Session Date', 'Start Time', 'End Time', 'Grade', 'Link or location', 'Region', 'Branch Name', 'Venue / Medium',
        'Conducted By', 'Co-Host', 'Parents Invited'
      ];

      const response = await poApiFetch('Parent_Orientation_Tracker.xlsx');
      if (!response.ok) {
        const msg =
          response.status === 401
            ? 'Sign in again, then export.'
            : response.status === 404
              ? 'Excel template missing on server. Restart the Node server (it creates one on startup).'
              : `Could not load Excel template (HTTP ${response.status}).`;
        throw new Error(msg);
      }
      const arrayBuffer = await response.arrayBuffer();
      if (!arrayBuffer || arrayBuffer.byteLength < 64) {
        throw new Error('Excel template from server is too small or empty — restart the server to regenerate it.');
      }

      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(arrayBuffer);

      let ws = wb.getWorksheet('PMO - Plan Sessions') || wb.getWorksheet('PMO – Plan Sessions') || wb.getWorksheet('Session Log') || wb.getWorksheet(1);
      if (!ws) {
        throw new Error('Workbook has no PMO sheet (PMO - Plan Sessions). Replace Parent_Orientation_Tracker.xlsx with a valid template.');
      }

      const headerRow = ws.getRow(3);
      headerRow.values = headers;
      for (let c = 1; c <= headers.length; c++) {
        const cell = headerRow.getCell(c);
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
      }
      for (let c = headers.length + 1; c <= 25; c++) {
        const cell = headerRow.getCell(c);
        cell.value = null; cell.style = {};
      }
      headerRow.commit();

      // Forcefully clear rows to avoid any leftover test data
      for (let r = 4; r <= 2000; r++) {
        const row = ws.getRow(r);
        if (row.hasValues) {
          row.values = [];
          row.commit();
        }
      }

      sessions.forEach((s, idx) => {
        const row = ws.getRow(4 + idx);
        row.values = [
          s.scheduled_date, s.scheduled_start_time || '', s.scheduled_end_time || '', s.grade || '', s.location || '', s.region, s.branch, s.venue,
          s.teacher, s.co_host, s.invited || 0
        ];
        row.commit();
      });

      let wsSpeaker = wb.getWorksheet('Speaker – Post Activity') || wb.getWorksheet('Speaker - Post Activity');
      if (wsSpeaker) {
        const spkHeaders = [
          'Session Date',
          'Start Time',
          'End Time',
          'Grade',
          'Branch',
          'Region',
          'Venue / Medium',
          'Teacher',
          'Co-Host',
          'Parents Invited',
          'Parents Attended',
          'Status',
          'Overall session status',
          'Engagement',
          'Follow-up required',
          'Follow-up date',
          'Follow-up notes',
          'Remarks',
        ];
        for (let r = 1; r <= 2000; r++) {
          const row = wsSpeaker.getRow(r);
          if (row.hasValues) {
            row.values = [];
            row.commit();
          }
        }
        const spkHdrRow = wsSpeaker.getRow(3);
        spkHdrRow.values = spkHeaders;
        for (let c = 1; c <= spkHeaders.length; c++) {
          const cell = spkHdrRow.getCell(c);
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
        }
        for (let c = spkHeaders.length + 1; c <= 30; c++) {
          const cell = spkHdrRow.getCell(c);
          cell.value = null;
          cell.style = {};
        }
        spkHdrRow.commit();

        sessions.forEach((s, idx) => {
          const row = wsSpeaker.getRow(4 + idx);
          let attOut = '';
          if (s.attended !== '' && s.attended != null && s.attended !== undefined) {
            const n = parseInt(s.attended, 10);
            if (!Number.isNaN(n)) attOut = n;
          }
          row.values = [
            s.scheduled_date || '',
            s.scheduled_start_time || '',
            s.scheduled_end_time || '',
            s.grade || '',
            s.branch || '',
            s.region || '',
            s.venue || '',
            s.teacher || '',
            s.co_host || '',
            s.invited != null && s.invited !== '' ? Number(s.invited) : 0,
            attOut,
            s.status || '',
            s.session_status || '',
            s.engagement || '',
            s.follow_up || '',
            s.follow_up_date || '',
            s.follow_up_notes || '',
            s.remarks || '',
          ];
          row.commit();
        });
      }

      let wsSummary = wb.getWorksheet('Summary Dashboard') || wb.getWorksheet('Summary');
      if (wsSummary) {
        const total = sessions.length;
        const done = sessions.filter(s => s.status === 'Completed').length;
        const inv = sessions.reduce((a, s) => a + (s.invited || 0), 0);
        const att = sessions.reduce((a, s) => a + (parseInt(s.attended) || 0), 0);
        const rate = inv ? Math.round(att / inv * 100) : 0;
        const highEng = sessions.filter(s => s.engagement === 'H').length;
        const medEng = sessions.filter(s => s.engagement === 'M').length;
        const lowEng = sessions.filter(s => s.engagement === 'L').length;

        wsSummary.getRow(5).getCell(4).value = total;
        wsSummary.getRow(6).getCell(4).value = done;
        wsSummary.getRow(7).getCell(4).value = inv;
        wsSummary.getRow(8).getCell(4).value = att;
        wsSummary.getRow(9).getCell(4).value = rate + '%';
        wsSummary.getRow(10).getCell(4).value = highEng;
        wsSummary.getRow(11).getCell(4).value = medEng;
        wsSummary.getRow(12).getCell(4).value = lowEng;
      }

      return await wb.xlsx.writeBuffer();
    }

    async function loadData() {
      let payload = null;
      try {
        const r = await poApiFetch('api/sessions');
        if (r.status === 401) {
          poClearRole();
          showLogin();
          toast('Sign in again to load sessions from the server.', 'warning');
          return;
        }
        try {
          const t = await r.text();
          payload = t ? JSON.parse(t) : null;
        } catch (_) {
          payload = null;
        }
        if (r.ok && Array.isArray(payload)) {
          sessions = normalizeSessionsArray(payload);
          pmoFulfillmentCache = null;
          try {
            localStorage.setItem(STORE_KEY, JSON.stringify(sessions));
          } catch (_) { /* quota */ }
          renderAll();
          queueMicrotask(() => maybeOpenPlanEditFromHash());
          return;
        }
        if (r.status === 503 && payload && typeof payload === 'object' && !Array.isArray(payload) && payload.error) {
          toast(String(payload.error), 'warning');
        } else if (r.status === 503) {
          toast('Could not reach the database. Showing sessions saved in this browser if any.', 'warning');
        } else if (!r.ok && payload && typeof payload === 'object' && payload.error) {
          toast(String(payload.error), 'error');
        }
      } catch (_) { /* offline or server down */ }
      try {
        sessions = normalizeSessionsArray(JSON.parse(localStorage.getItem(STORE_KEY) || '[]'));
      } catch (e) {
        sessions = [];
      }
      renderAll();
      queueMicrotask(() => maybeOpenPlanEditFromHash());
    }

    async function pullSessionsFromServer() {
      try {
        const r = await poApiFetch('api/sessions');
        if (!r.ok) return false;
        const data = await r.json();
        if (Array.isArray(data)) {
          sessions = normalizeSessionsArray(data);
          pmoFulfillmentCache = null;
          try {
            localStorage.setItem(STORE_KEY, JSON.stringify(sessions));
          } catch (_) { /* quota */ }
          return true;
        }
        return false;
      } catch (_) {
        return false;
      }
    }

    async function pmoUploadExcelFile() {
      try {
        const buf = await generateExcelBuffer();
        const res = await poApiFetch('api/uploadExcel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
          body: buf
        });
        if (!res.ok) console.error('Failed to sync Excel file to server. Status:', res.status);
      } catch (err) {
        console.error('Failed to upload Excel to backend:', err);
      }
    }

    async function putPmoSessionOnServer(s) {
      const r = await poApiFetch(`api/sessions/${encodeURIComponent(s.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(s)
      });
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        if (t) toast(t, 'error');
        else toast(`Could not save session (HTTP ${r.status}).`, 'error');
        return false;
      }
      return true;
    }

    async function postPmoSessionOnServer(s) {
      const r = await poApiFetch('api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(s)
      });
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        if (t) toast(t, 'error');
        else toast(`Could not create session (HTTP ${r.status}).`, 'error');
        return false;
      }
      return true;
    }

    async function deletePmoSessionOnServer(id) {
      const r = await poApiFetch(`api/sessions/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      if (!r.ok && r.status !== 204) {
        const t = await r.text().catch(() => '');
        if (t) toast(t, 'error');
        else toast(`Could not delete session (HTTP ${r.status}).`, 'error');
        return false;
      }
      return true;
    }

    /** Ensure JSON.stringify sends follow-up keys so the server merge does not keep stale follow_up=Y (undefined is omitted). */
    function speakerSessionsPutPayload(arr) {
      return arr.map((row) => {
        const s = { ...row };
        if (s.follow_up === undefined || s.follow_up === null) s.follow_up = '';
        if (s.follow_up_date === undefined || s.follow_up_date === null) s.follow_up_date = '';
        if (s.follow_up_notes === undefined || s.follow_up_notes === null) s.follow_up_notes = '';
        return s;
      });
    }

    /** PMO: refresh from server + Excel sync (no bulk PUT). Speaker: full-array merge PUT. */
    async function saveData() {
      const speakerBeforePut = poGetRole() === 'speaker' ? JSON.parse(JSON.stringify(sessions)) : null;
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(sessions));
      } catch (_) { /* quota */ }
      const role = poGetRole();
      if (role === 'pmo') {
        const ok = await pullSessionsFromServer();
        if (!ok) toast('Could not refresh sessions from the server.', 'error');
        await pmoUploadExcelFile();
        return ok;
      }
      if (role === 'sales_admin') {
        const ok = await pullSessionsFromServer();
        if (!ok) toast('Could not refresh sessions from the server.', 'error');
        return ok;
      }
      let persistOk = false;
      try {
        const put = await poApiFetch('api/sessions', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(speakerSessionsPutPayload(sessions))
        });
        persistOk = put.ok;
        if (!put.ok) {
          const t = await put.text().catch(() => '');
          if (t) toast(t, 'error');
          else toast(`Could not save sessions (HTTP ${put.status}).`, 'error');
          console.error('Failed to sync sessions to MongoDB. Status:', put.status);
          const pulled = await pullSessionsFromServer();
          if (!pulled && speakerBeforePut) {
            sessions = normalizeSessionsArray(speakerBeforePut);
            try {
              localStorage.setItem(STORE_KEY, JSON.stringify(sessions));
            } catch (_) { /* quota */ }
          }
        } else {
          const r = await poApiFetch('api/sessions');
          if (r.ok) {
            const data = await r.json();
            if (Array.isArray(data)) {
              sessions = normalizeSessionsArray(data);
              try {
                localStorage.setItem(STORE_KEY, JSON.stringify(sessions));
              } catch (_) { /* quota */ }
            }
          }
        }
      } catch (err) {
        console.error('Failed to PUT sessions:', err);
        toast('Could not reach the server to save sessions.', 'error');
        persistOk = false;
        const pulled = await pullSessionsFromServer();
        if (!pulled && speakerBeforePut) {
          sessions = normalizeSessionsArray(speakerBeforePut);
          try {
            localStorage.setItem(STORE_KEY, JSON.stringify(sessions));
          } catch (_) { /* quota */ }
        }
      }
      return persistOk;
    }

    async function refreshData() {
      const ok = await saveData();
      renderAll();
      return ok;
    }

    /** RFC 4122 UUID v4 for new session / meeting records (server accepts legacy ids too). */
    function newSessionId() {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
      const bytes = new Uint8Array(16);
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(bytes);
      } else {
        for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
      }
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }

    function sessionPlaceKeyFromParts(date, region, branch) {
      return `${String(date || '').trim()}\u0001${String(region || '').trim()}\u0001${String(branch || '').trim()}`;
    }

    function gradeTokenSetFromStr(gradeStr) {
      const set = new Set();
      for (const part of String(gradeStr || '').split(',')) {
        const t = part.trim();
        if (t) set.add(t);
      }
      return set;
    }

    function intersectGradeTokensClient(setA, setB) {
      const out = [];
      for (const x of setA) {
        if (setB.has(x)) out.push(x);
      }
      out.sort();
      return out;
    }

    function sessionIntervalFromRow(s) {
      const start = parseTimeToMinutesClient(s.scheduled_start_time);
      const end = parseTimeToMinutesClient(s.scheduled_end_time);
      if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
      return { start, end };
    }

    /** Sorted shared grades if same place + overlapping time; else null. */
    function sessionsConflictingGrades(a, b) {
      if (String(a.id) === String(b.id)) return null;
      if (sessionPlaceKeyFromParts(a.scheduled_date, a.region, a.branch) !==
          sessionPlaceKeyFromParts(b.scheduled_date, b.region, b.branch)) {
        return null;
      }
      const ia = sessionIntervalFromRow(a);
      const ib = sessionIntervalFromRow(b);
      if (!ia || !ib) return null;
      if (!(ia.start < ib.end && ib.start < ia.end)) return null;
      const inter = intersectGradeTokensClient(gradeTokenSetFromStr(a.grade), gradeTokenSetFromStr(b.grade));
      return inter.length ? inter : null;
    }

    function scheduleConflictToastMessage(gradeLabels) {
      if (!gradeLabels || !gradeLabels.length) {
        return 'This session overlaps another plan for this branch, region and time.';
      }
      const glist = gradeLabels.join(', ');
      if (gradeLabels.length === 1) {
        return `Grade ${glist} already has a session at this time for this branch and region.`;
      }
      return `Grades ${glist} already have sessions at this time for this branch and region.`;
    }

    /** One line for list rows: date · start–end (handles missing pieces). */
    function fmtSessionScheduleSummary(s) {
      const dateStr = s.scheduled_date ? fmtDate(s.scheduled_date) : '';
      const st = String(s.scheduled_start_time || '').trim();
      const en = String(s.scheduled_end_time || '').trim();
      let timePart = '';
      if (st && en) timePart = `${st}\u2013${en}`;
      else timePart = st || en;
      const bits = [];
      if (dateStr && dateStr !== '\u2014') bits.push(dateStr);
      if (timePart) bits.push(timePart);
      return bits.length ? bits.join(' \u00B7 ') : '\u2014';
    }

    /** Notifications via React Toastify (see /react-toastify-bundle.js). */
    function toast(msg, type, opts) {
      const api = window.poToast;
      if (!api) {
        console.warn(msg);
        return;
      }
      const t = type || 'info';
      if (t === 'success') api.success(msg, opts);
      else if (t === 'error') api.error(msg, opts);
      else if (t === 'warning') api.warning(msg, opts);
      else api.info(msg, opts);
    }

    /** Hash: #/ | #/login/{pmo|speaker|sales-admin} | #/pmo/... | #/speaker | #/sales-admin/{overview|targets}[/YYYY-MM] */
    const PO_PMO_SECTIONS = new Set(['analytics', 'plan', 'meetings']);
    const PO_SALES_SECTIONS = new Set(['overview', 'targets']);
    const PO_LOGIN_PORTALS = {
      pmo: {
        hash: '#/login/pmo',
        role: 'pmo',
        title: 'PMO sign in',
        sub: 'Planning, analytics, and session management.',
      },
      speaker: {
        hash: '#/login/speaker',
        role: 'speaker',
        title: 'Speaker sign in',
        sub: 'Post-activity updates for orientation sessions.',
      },
      'sales-admin': {
        hash: '#/login/sales-admin',
        role: 'sales_admin',
        title: 'Sales Admin sign in',
        sub: 'School targets and fulfillment tracking.',
      },
    };
    let salesFulfillmentCache = null;
    let salesTablePage = 0;
    const SALES_TABLE_PAGE_SIZE = 10;
    /** Last-saved completion targets per school (region|branch → number); used to enable Save targets. */
    let salesTargetsSavedSnapshot = null;
    let pmoFulfillmentCache = null;

    function poStripHash() {
      return (location.hash || '').replace(/^#/, '');
    }

    /** @returns {{ name: 'root'|'login'|'pmo'|'speaker'|'unknown', params: Record<string, string|null> }} */
    function parseAppRoute() {
      const parts = poStripHash().split('/').filter(Boolean);
      if (parts.length === 0) return { name: 'root', params: {} };
      if (parts[0] === 'login') {
        const portal = parts[1] && PO_LOGIN_PORTALS[parts[1]] ? parts[1] : null;
        return { name: 'login', params: { portal } };
      }
      if (parts[0] === 'speaker') {
        const month = parts[1] && /^\d{4}-\d{2}$/.test(parts[1]) ? parts[1] : null;
        return { name: 'speaker', params: { month } };
      }
      if (parts[0] === 'sales-admin') {
        const p1 = parts[1];
        const p2 = parts[2];
        if (PO_SALES_SECTIONS.has(p1)) {
          const month = p2 && /^\d{4}-\d{2}$/.test(p2) ? p2 : null;
          return { name: 'sales-admin', params: { section: p1, month } };
        }
        if (p1 && /^\d{4}-\d{2}$/.test(p1)) {
          return { name: 'sales-admin', params: { section: 'overview', month: p1 } };
        }
        return { name: 'sales-admin', params: { section: 'overview', month: null } };
      }
      if (parts[0] === 'pmo') {
        if (parts.length >= 4 && parts[1] === 'plan' && parts[2] === 'edit' && parts[3]) {
          const editId = decodeURIComponent(parts.slice(3).join('/'));
          return { name: 'pmo', params: { section: 'plan', month: null, editId } };
        }
        const sec = PO_PMO_SECTIONS.has(parts[1]) ? parts[1] : 'analytics';
        const month =
          (sec === 'analytics' || sec === 'meetings') && parts[2] && /^\d{4}-\d{2}$/.test(parts[2])
            ? parts[2]
            : null;
        return { name: 'pmo', params: { section: sec, month, editId: null } };
      }
      return { name: 'unknown', params: {} };
    }

    function poReplaceHash(nextHash) {
      const base = `${location.pathname}${location.search}`;
      if (location.hash === nextHash) return false;
      history.replaceState(null, '', `${base}${nextHash}`);
      return true;
    }

    /**
     * Align URL hash with role and feature; update visible shell (PMO vs Speaker sections).
     * @param {{ render?: boolean }} opts — pass render:false from showApp before loadData() to avoid double render.
     */
    function syncRouteFromHash(opts) {
      const render = opts && opts.render === false ? false : true;
      const role = poGetRole();
      const route = parseAppRoute();

      if (!role) {
        syncPublicRoute(route);
        return;
      }

      if (route.name === 'login' || route.name === 'root' || route.name === 'unknown') {
        let def = '#/speaker';
        if (role === 'pmo') def = '#/pmo/analytics';
        else if (role === 'sales_admin') def = '#/sales-admin/overview';
        if (poReplaceHash(def)) syncRouteFromHash(opts);
        return;
      }

      if (role === 'pmo') {
        if (route.name !== 'pmo') {
          if (poReplaceHash('#/pmo/analytics')) syncRouteFromHash(opts);
          return;
        }
        switchRole('pmo');
        applyPmoRoute();
        if (render) renderAll();
        return;
      }

      if (role === 'speaker') {
        if (route.name !== 'speaker') {
          if (poReplaceHash('#/speaker')) syncRouteFromHash(opts);
          return;
        }
        switchRole('speaker');
        applySpeakerRoute();
        if (render) renderAll();
        return;
      }

      if (role === 'sales_admin') {
        if (route.name !== 'sales-admin') {
          if (poReplaceHash('#/sales-admin/overview')) syncRouteFromHash(opts);
          return;
        }
        switchRole('sales_admin');
        applySalesRoute();
        if (render) {
          if (salesFulfillmentCache) renderSalesAdmin();
          else ensureSalesAdminData();
        }
      }
    }

    function hideAllShells() {
      const landing = document.getElementById('landing-screen');
      const ls = document.getElementById('login-screen');
      const app = document.querySelector('.app');
      if (landing) {
        landing.style.display = 'none';
        landing.style.pointerEvents = 'none';
      }
      if (ls) {
        ls.style.display = 'none';
        ls.style.pointerEvents = 'none';
      }
      if (app) app.style.display = 'none';
      document.body.classList.remove('body--sales-admin');
    }

    function showLanding() {
      hideAllShells();
      const landing = document.getElementById('landing-screen');
      if (landing) {
        landing.style.display = 'flex';
        landing.style.pointerEvents = 'auto';
      }
      const route = parseAppRoute();
      if (route.name !== 'root') poReplaceHash('#/');
    }

    function showLoginPortal(portalKey) {
      const portal = portalKey && PO_LOGIN_PORTALS[portalKey] ? PO_LOGIN_PORTALS[portalKey] : null;
      if (!portal) {
        showLanding();
        return;
      }
      hideAllShells();
      const ls = document.getElementById('login-screen');
      if (ls) {
      ls.style.display = 'flex';
      ls.style.pointerEvents = 'auto';
      }
      const titleEl = document.getElementById('login-portal-title');
      const subEl = document.getElementById('login-portal-sub');
      if (titleEl) titleEl.textContent = portal.title;
      if (subEl) subEl.textContent = portal.sub;
      ls?.setAttribute('data-po-login-portal', portalKey);
      const route = parseAppRoute();
      const want = portal.hash;
      if (route.name !== 'login' || route.params.portal !== portalKey) poReplaceHash(want);
    }

    function syncPublicRoute(route) {
      if (route.name === 'login' && route.params.portal) {
        showLoginPortal(route.params.portal);
        return;
      }
      if (route.name === 'login') {
        if (poReplaceHash('#/')) syncRouteFromHash();
        return;
      }
      if (route.name === 'root') {
        showLanding();
        return;
      }
      if (poReplaceHash('#/')) syncRouteFromHash();
    }

    function showLogin() {
      showLanding();
    }

    function portalRoleFromKey(portalKey) {
      const p = portalKey && PO_LOGIN_PORTALS[portalKey];
      return p ? p.role : null;
    }

    function getActiveLoginPortalKey() {
      const route = parseAppRoute();
      if (route.name === 'login' && route.params.portal) return route.params.portal;
      const ls = document.getElementById('login-screen');
      return ls?.getAttribute('data-po-login-portal') || null;
    }

    async function logoutUser() {
      if (_sessionsSyncTimer) {
        clearInterval(_sessionsSyncTimer);
        _sessionsSyncTimer = null;
      }
      const role = poGetRole();
      try {
        await poApiFetch('api/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: role || '' })
        });
      } catch (_) { /* offline */ }
      poClearRole();
      document.getElementById('login-user').value = '';
      document.getElementById('login-pass').value = '';
      resetLoginPasswordVisibility();
      poReplaceHash('#/');
      showLanding();
      toast('Logged out successfully', 'success');
    }

    function startSessionsAutoSync() {
      if (_sessionsSyncTimer) clearInterval(_sessionsSyncTimer);
      _sessionsSyncTimer = setInterval(async () => {
        const role = poGetRole();
        if (!role) return;
        if (role === 'sales_admin' || role === 'speaker') return;
        if (document.hidden) return;
        if (editingId) return;
        const ok = await pullSessionsFromServer();
        if (ok) renderAll();
      }, 30000);
    }

    function showApp() {
      hideAllShells();
      document.querySelector('.app').style.display = 'block';

      const role = poGetRole();
      const tabs = document.getElementById('role-tabs');
      if (role === 'pmo' || role === 'speaker' || role === 'sales_admin') {
        if (tabs) tabs.style.display = 'none';
      }
      document.querySelector('.app')?.classList.toggle('app--sales-admin', role === 'sales_admin');
      document.body.classList.toggle('body--sales-admin', role === 'sales_admin');
      const exportBtn = document.getElementById('btn-export-excel');
      if (exportBtn) exportBtn.style.display = role === 'sales_admin' ? 'none' : '';
      const spkRefreshBtn = document.getElementById('btn-speaker-refresh');
      if (spkRefreshBtn) spkRefreshBtn.style.display = role === 'speaker' ? '' : 'none';
      const sub = document.querySelector('.app-sub');
      if (sub && role !== 'sales_admin') {
        sub.textContent = 'Pre-Sales Activity Management';
      }

      syncRouteFromHash({ render: false });
      if (role !== 'sales_admin') initPlanFormRegionAndBranch();
      startSessionsAutoSync();
      loadData();
    }

    async function loginUser() {
      const user = document.getElementById('login-user').value.trim();
      const pass = document.getElementById('login-pass').value;
      const portalKey = getActiveLoginPortalKey();
      const expectedRole = portalRoleFromKey(portalKey);
      try {
        const r = await poApiFetch('api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user, pass })
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.role) {
          if (expectedRole && j.role !== expectedRole) {
            const portalLabel =
              portalKey === 'sales-admin' ? 'Sales Admin' : portalKey === 'pmo' ? 'PMO' : 'Speaker';
            try {
              await poApiFetch('api/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: j.role }),
              });
            } catch (_) { /* ignore */ }
            toast(
              `Those credentials are not for ${portalLabel}. Use the correct portal on the home page.`,
              'error'
            );
            return;
          }
          poSetRole(j.role);
          const v = await poApiFetch('api/me');
          const me = await v.json().catch(() => ({}));
          if (!v.ok || !me.role) {
            poClearRole();
            toast('Login succeeded but the browser did not keep your session. If the URL starts with http://, set COOKIE_SECURE=0 in the server .env and restart.', 'warning');
            return;
          }
          document.getElementById('login-pass').value = '';
          resetLoginPasswordVisibility();
          showApp();
          const welcome =
            j.role === 'pmo'
              ? 'Welcome PMO'
              : j.role === 'sales_admin'
                ? 'Welcome Sales Admin'
                : 'Welcome Speaker';
          toast(welcome, 'success');
          return;
        }
      } catch (_) { /* network */ }
      toast('Invalid username or password', 'error');
    }

    /** Live + native validity for parents attended vs invited (speaker post-activity form). */
    function syncSpeakerAttendedError(inputEl) {
      if (!inputEl || !inputEl.id || !inputEl.id.startsWith('f-att-')) return;
      const sid = inputEl.id.slice('f-att-'.length);
      const errEl = document.getElementById(`f-att-err-${sid}`);
      if (!errEl) return;
      const capRaw = inputEl.getAttribute('data-po-invited-cap');
      const inv = capRaw != null && capRaw !== '' ? Number(capRaw) : NaN;
      const invitedNum = Number.isFinite(inv) && inv >= 0 ? inv : 0;
      const raw = String(inputEl.value ?? '').trim();
      const n = raw === '' ? NaN : parseInt(raw, 10);
      if (raw === '' || Number.isNaN(n) || n < 0) {
        errEl.textContent = '';
        errEl.style.display = 'none';
        inputEl.setCustomValidity('');
        inputEl.removeAttribute('aria-invalid');
        return;
      }
      if (n > invitedNum) {
        const msg = `Parents attended cannot be greater than parents invited (${invitedNum}).`;
        errEl.textContent = msg;
        errEl.style.display = 'block';
        inputEl.setCustomValidity(msg);
        inputEl.setAttribute('aria-invalid', 'true');
        return;
      }
      errEl.textContent = '';
      errEl.style.display = 'none';
      inputEl.setCustomValidity('');
      inputEl.removeAttribute('aria-invalid');
    }

    function initPoClickDelegation() {
      const app = document.querySelector('.app');
      if (!app || app.dataset.poDeleg === '1') return;
      app.dataset.poDeleg = '1';
      app.addEventListener('input', (e) => {
        const t = e.target;
        if (t && t.id && t.id.startsWith('f-att-')) syncSpeakerAttendedError(t);
      });
      app.addEventListener('change', (e) => {
        const t = e.target;
        if (t && t.id && t.id.startsWith('f-att-')) syncSpeakerAttendedError(t);
        if (t && t.id && t.id.startsWith('f-fu-')) {
          const sid = t.id.slice('f-fu-'.length);
          applySpeakerFollowUpVisibility(sid);
        }
      });
      app.addEventListener('click', (e) => {
        const sub = e.target.closest('[data-po-submit]');
        if (sub) {
          e.preventDefault();
          submitUpdate(sub.dataset.poSid);
          return;
        }
        const engB = e.target.closest('[data-po-pick-eng]');
        if (engB) {
          e.preventDefault();
          pickEng(engB.dataset.poSid, engB.dataset.poEng);
          return;
        }
        const pact = e.target.closest('[data-po-pick-action]');
        if (pact) {
          e.preventDefault();
          pickAction(pact.dataset.poSid, pact.dataset.poAct);
          return;
        }
        const del = e.target.closest('[data-po-del]');
        if (del) {
          e.stopPropagation();
          e.preventDefault();
          delSession(del.dataset.poSid);
          return;
        }
        const ed = e.target.closest('[data-po-edit]');
        if (ed) {
          e.stopPropagation();
          e.preventDefault();
          editSession(ed.dataset.poSid);
          return;
        }
        const det = e.target.closest('[data-po-details]');
        if (det) {
          e.stopPropagation();
          e.preventDefault();
          toggleExp(det.dataset.poSid, det.dataset.poMode);
          return;
        }
        const row = e.target.closest('.shead[data-po-row]');
        if (row && !e.target.closest('.sact')) {
          toggleExp(row.dataset.poSid, row.dataset.poMode);
          return;
        }
        const mcard = e.target.closest('[data-pmo-month]');
        if (mcard) {
          e.preventDefault();
          setPmoHash('analytics', mcard.dataset.pmoMonth);
          return;
        }
        const backAn = e.target.closest('[data-pmo-analytics-back]');
        if (backAn) {
          e.preventDefault();
          setPmoHash('analytics');
        }
        const skcard = e.target.closest('[data-spk-month]');
        if (skcard) {
          e.preventDefault();
          poReplaceHash(`#/speaker/${skcard.dataset.spkMonth}`);
          syncRouteFromHash();
          return;
        }
        const spkBack = e.target.closest('[data-spk-back]');
        if (spkBack) {
          e.preventDefault();
          poReplaceHash('#/speaker');
          syncRouteFromHash();
        }
        const meetOpen = e.target.closest('.po-meeting-link');
        if (meetOpen) {
          e.preventDefault();
          const href = meetOpen.dataset.poMeetingHref || meetOpen.href || '';
          openRawMeetingLink(href);
          return;
        }
        const meetCopy = e.target.closest('.po-copy-meeting-link');
        if (meetCopy) {
          e.preventDefault();
          copyJoinLinkForSession(meetCopy.dataset.poMeetingSid || '');
          return;
        }
      });
    }

    function initOnlineMeetingLinkHandlers() {
      const openA = document.getElementById('p-location-open');
      const copyBtn = document.getElementById('p-location-copy');

      openA?.addEventListener('click', (e) => {
        const href = safeZoomHref(document.getElementById('p-location')?.value || '');
        if (!href || getSelectedPlanVenue() !== 'Online') return;
        e.preventDefault();
        openRawMeetingLink(href);
      });

      copyBtn?.addEventListener('click', async (e) => {
        e.preventDefault();
        if (getSelectedPlanVenue() !== 'Online') return;
        await copyJoinLinkForSession(editingId || '');
      });
    }

    function initStaticPageControls() {
      initPmoTimelineFloatTip();
      initPmoRegionMap();
      initPlanFormRegionAndBranch();
      document.getElementById('btn-export-excel')?.addEventListener('click', () => exportExcel());
      document.getElementById('btn-logout')?.addEventListener('click', () => logoutUser());
      document.getElementById('tab-pmo')?.addEventListener('click', () => {
        if (location.hash !== '#/pmo/analytics') location.hash = '#/pmo/analytics';
        else syncRouteFromHash();
      });
      document.getElementById('tab-spk')?.addEventListener('click', () => {
        if (location.hash !== '#/speaker') location.hash = '#/speaker';
        else syncRouteFromHash();
      });
      document.getElementById('p-region')?.addEventListener('change', updateBranches);
      document.getElementById('f-status')?.addEventListener('change', renderPMO);
      document.getElementById('f-meetings-month')?.addEventListener('change', () => {
        const m = document.getElementById('f-meetings-month')?.value || '';
        setPmoHash('meetings', m || null);
        renderPMO();
      });
      document.getElementById('f-search')?.addEventListener('input', renderPMO);
      document.getElementById('spk-sort-by')?.addEventListener('change', onSpeakerSortChange);
      document.getElementById('spk-sort-dir')?.addEventListener('change', onSpeakerSortChange);
      document.getElementById('btn-cancel-edit')?.addEventListener('click', cancelEdit);
      document.getElementById('btn-clear-form')?.addEventListener('click', clearForm);
      document.getElementById('plan-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        saveSession();
      });
      document.getElementById('p-location')?.addEventListener('input', syncPlanLocationValidity);
      document.getElementById('p-location')?.addEventListener('change', syncPlanLocationValidity);
      for (let g = 1; g <= 9; g++) {
        const gx = `G${g}`;
        document.getElementById(`grade-${gx}`)?.addEventListener('click', () => pickGrade(gx));
      }
      document.getElementById('venue-Online')?.addEventListener('click', () => pickVenue('Online'));
      document.getElementById('venue-Offline')?.addEventListener('click', () => pickVenue('Offline'));
      document.getElementById('p-date')?.addEventListener('focus', refreshPlanDateMinAttr);
      document.getElementById('p-date')?.addEventListener('click', refreshPlanDateMinAttr);
      refreshPlanDateMinAttr();
      syncPlanLocationValidity();
      initOnlineMeetingLinkHandlers();
      document.getElementById('pmo-nav')?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-pmo-nav]');
        if (!b) return;
        const sec = b.dataset.pmoNav;
        if (sec === 'analytics') setPmoHash('analytics');
        else if (sec === 'plan') setPmoHash('plan');
        else if (sec === 'meetings') {
          const m = document.getElementById('f-meetings-month')?.value || '';
          setPmoHash('meetings', m || null);
        }
      });
      window.addEventListener('hashchange', () => syncRouteFromHash());
      document.addEventListener('visibilitychange', async () => {
        if (document.hidden) return;
        if (editingId) return;
        const role = poGetRole();
        if (!role) return;
        if (role === 'sales_admin' || role === 'speaker') return;
        const ok = await pullSessionsFromServer();
        if (ok) renderAll();
      });
      const salesMonth = document.getElementById('sales-month');
      populateSalesMonthOptions();
      populatePmoMeetingsMonthOptions();
      initMonthCalendarPickers();
      document.getElementById('sales-nav')?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-sales-nav]');
        if (!b) return;
        setSalesHash(b.dataset.salesNav, getSalesSelectedMonth());
      });
      salesMonth?.addEventListener('change', () => {
        salesTablePage = 0;
        const m = getSalesSelectedMonth();
        setSalesHash(parseSalesRoute().section, m || null);
        loadSalesFulfillment().then(() => renderSalesAdmin());
      });
      document.getElementById('btn-sales-logout')?.addEventListener('click', () => {
        document.getElementById('btn-logout')?.click();
      });
      document.getElementById('btn-sales-export-report')?.addEventListener('click', () => exportExcel());
      document.getElementById('btn-sales-refresh')?.addEventListener('click', () => refreshSalesAdminData());
      document.getElementById('btn-speaker-refresh')?.addEventListener('click', () => refreshSpeakerData());
      document.getElementById('sales-school-table-pager')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-sales-page]');
        if (!btn || btn.disabled) return;
        const dir = btn.dataset.salesPage;
        if (dir === 'prev') salesTablePage = Math.max(0, salesTablePage - 1);
        else if (dir === 'next') salesTablePage += 1;
        renderSalesSchoolTable(salesFulfillmentCache, getSalesSelectedMonth());
      });
      document.getElementById('sales-school-table-root')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-sales-goto-targets]');
        if (!btn) return;
        setSalesHash('targets', getSalesSelectedMonth());
      });
      document.getElementById('btn-sales-save-targets')?.addEventListener('click', () => saveSalesTargets());
      document.getElementById('sales-regions-root')?.addEventListener('input', (e) => {
        if (e.target.matches('[data-sales-school-target]')) syncSalesSaveTargetsButton();
      });
      document.getElementById('sales-regions-root')?.addEventListener('click', (e) => {
        const schoolBtn = e.target.closest('.sales-school-toggle');
        if (schoolBtn) {
          const detailId = schoolBtn.getAttribute('aria-controls');
          const detail = detailId ? document.getElementById(detailId) : null;
          if (detail) {
            const hidden = detail.classList.toggle('is-hidden');
            schoolBtn.setAttribute('aria-expanded', hidden ? 'false' : 'true');
            if (!hidden) {
              const region = schoolBtn.dataset.salesRegion || '';
              const branch = schoolBtn.dataset.salesBranch || '';
              const month = getSalesSelectedMonth();
              const fulfillHint = {
                scheduled: Number(schoolBtn.dataset.salesScheduled) || 0,
                completed: Number(schoolBtn.dataset.salesCompleted) || 0,
              };
              const panel = detail.querySelector('.sales-meetings-panel');
              if (panel) {
                panel.innerHTML = '<p class="sales-student-empty" style="margin:0">Loading booking details…</p>';
                void (async () => {
                  const html = await ensureSchoolMeetingDetails(region, branch, month, fulfillHint);
                  if (panel.isConnected) panel.innerHTML = html;
                })();
              }
            }
          }
          return;
        }
        const hd = e.target.closest('.sales-region-hd');
        if (!hd) return;
        const body = hd.parentElement?.querySelector('.sales-region-body');
        if (!body) return;
        body.classList.toggle('is-collapsed');
        const open = !body.classList.contains('is-collapsed');
        hd.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      document.getElementById('pmo-targets-by-region')?.addEventListener('click', (e) => {
        const hd = e.target.closest('.sales-region-hd');
        if (!hd) return;
        const body = hd.parentElement?.querySelector('.sales-region-body');
        if (!body) return;
        body.classList.toggle('is-collapsed');
        const open = !body.classList.contains('is-collapsed');
        hd.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }

    function setLoginEyeIcons(btn, showPassword) {
      const open = btn.querySelector('.login-eye-open');
      const closed = btn.querySelector('.login-eye-closed');
      open?.classList.toggle('login-eye-hidden', showPassword);
      closed?.classList.toggle('login-eye-hidden', !showPassword);
    }

    function resetLoginPasswordVisibility() {
      const pass = document.getElementById('login-pass');
      const btn = document.getElementById('login-pass-toggle');
      if (!pass) return;
      pass.type = 'password';
      if (!btn) return;
      btn.setAttribute('aria-label', 'Show password');
      btn.setAttribute('aria-pressed', 'false');
      setLoginEyeIcons(btn, false);
    }

    function initLoginPasswordToggle() {
      const pass = document.getElementById('login-pass');
      const btn = document.getElementById('login-pass-toggle');
      if (!pass || !btn || btn.dataset.poBound === '1') return;
      btn.dataset.poBound = '1';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const show = pass.type === 'password';
        pass.type = show ? 'text' : 'password';
        btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        btn.setAttribute('aria-pressed', show ? 'true' : 'false');
        setLoginEyeIcons(btn, show);
      });
    }

    function initLogin() {
      initPoClickDelegation();
      initStaticPageControls();
      initLoginPasswordToggle();
      document.getElementById('login-form').addEventListener('submit', function (e) {
        e.preventDefault();
        loginUser();
      });
      document.getElementById('login-back-home')?.addEventListener('click', () => {
        poReplaceHash('#/');
        showLanding();
      });
      document.getElementById('landing-screen')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-po-portal]');
        if (!btn) return;
        const portal = btn.getAttribute('data-po-portal');
        const cfg = portal && PO_LOGIN_PORTALS[portal];
        if (!cfg) return;
        poReplaceHash(cfg.hash);
        showLoginPortal(portal);
      });
      (async function () {
        const rememberedRole = poGetRole();
        if (!rememberedRole) {
          syncRouteFromHash();
          return;
        }
        try {
          const r = await poApiFetch('api/me');
          if (!r.ok) {
            poClearRole();
            syncRouteFromHash();
            return;
          }
          const j = await r.json();
          if (j.role && j.role === rememberedRole) {
            showApp();
            return;
          }
          poClearRole();
          syncRouteFromHash();
        } catch (_) {
          syncRouteFromHash();
        }
      })();
    }

    function fmtDate(d) {
      if (d == null || d === '') return PO_TEXT.emDash;
      const s = String(d).trim();
      const core = s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
      const parts = core.split('-');
      if (parts.length < 3) return PO_TEXT.emDash;
      const [y, m, day] = parts;
      if (!y || !m || !day) return PO_TEXT.emDash;
      return `${day}/${m}/${y}`;
    }

    /** Next calendar day after session date (YYYY-MM-DD); for follow-up min / validation. */
    function isoDayAfterSession(sessionDateStr) {
      const d = String(sessionDateStr || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return '';
      const [y, m, day] = d.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, day));
      dt.setUTCDate(dt.getUTCDate() + 1);
      return dt.toISOString().slice(0, 10);
    }

    function isSessionClosed(s) {
      return (
        s.status === 'Completed' || s.status === 'Rescheduled' || s.status === 'Cancelled'
      );
    }

    /** Speaker may submit post-activity for Planned or finalize a Rescheduled session. */
    function canSpeakerPostUpdate(s) {
      return s.status === 'Planned' || s.status === 'Rescheduled';
    }

    const SPK_SORT_BY_KEY = 'po_spk_sort_by';
    const SPK_SORT_DIR_KEY = 'po_spk_sort_dir';

    function getSpeakerSortPrefs() {
      const by = sessionStorage.getItem(SPK_SORT_BY_KEY) || 'date';
      const dir = sessionStorage.getItem(SPK_SORT_DIR_KEY) || 'desc';
      const allowedBy = new Set(['date', 'branch', 'region', 'invited', 'attended']);
      const allowedDir = new Set(['asc', 'desc']);
      return {
        sortBy: allowedBy.has(by) ? by : 'date',
        sortDir: allowedDir.has(dir) ? dir : 'desc',
      };
    }

    function setSpeakerSortPrefs(sortBy, sortDir) {
      sessionStorage.setItem(SPK_SORT_BY_KEY, sortBy);
      sessionStorage.setItem(SPK_SORT_DIR_KEY, sortDir);
    }

    function syncSpeakerSortControls() {
      const { sortBy, sortDir } = getSpeakerSortPrefs();
      const sb = document.getElementById('spk-sort-by');
      const sd = document.getElementById('spk-sort-dir');
      if (sb) sb.value = sortBy;
      if (sd) sd.value = sortDir;
    }

    /** Milliseconds for sorting; date-only rows use midnight local. */
    function sessionSortTimestamp(s) {
      const inst = sessionInstantLocal(s.scheduled_date, s.scheduled_start_time);
      if (inst) return inst.getTime();
      const d = String(s.scheduled_date || '').trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        const t = new Date(`${d}T00:00:00`);
        return Number.isNaN(t.getTime()) ? 0 : t.getTime();
      }
      return 0;
    }

    function sortSessionsForSpeaker(list, sortBy, sortDir) {
      const mul = sortDir === 'asc' ? 1 : -1;
      const idTie = (a, b) => String(a.id).localeCompare(String(b.id));
      const arr = [...list];
      arr.sort((a, b) => {
        let c = 0;
        switch (sortBy) {
          case 'branch':
            c = String(a.branch || '').localeCompare(String(b.branch || ''), undefined, { sensitivity: 'base' });
            break;
          case 'region':
            c = String(a.region || '').localeCompare(String(b.region || ''), undefined, { sensitivity: 'base' });
            break;
          case 'invited':
            c = (Number(a.invited) || 0) - (Number(b.invited) || 0);
            break;
          case 'attended':
            c = (parseInt(a.attended, 10) || 0) - (parseInt(b.attended, 10) || 0);
            break;
          case 'date':
          default:
            c = sessionSortTimestamp(a) - sessionSortTimestamp(b);
            break;
        }
        if (c === 0) return idTie(a, b);
        return mul * c;
      });
      return arr;
    }

    function onSpeakerSortChange() {
      const sb = document.getElementById('spk-sort-by');
      const sd = document.getElementById('spk-sort-dir');
      if (!sb || !sd) return;
      setSpeakerSortPrefs(sb.value, sd.value);
      renderSpeaker();
    }

    function sessionStatusPillClass(s) {
      switch (s.status) {
        case 'Completed':
          return 'pc';
        case 'Planned':
          return 'pl';
        case 'Rescheduled':
          return 'pr';
        case 'Cancelled':
          return 'px';
        default:
          return 'pl';
      }
    }

    /** Align status strings from Mongo/Excel (e.g. "planned") so speaker PMO filters match. */
    function canonSessionStatus(raw) {
      const t = String(raw || '').trim().toLowerCase();
      if (t === 'planned') return 'Planned';
      if (t === 'completed') return 'Completed';
      if (t === 'rescheduled') return 'Rescheduled';
      if (t === 'cancelled') return 'Cancelled';
      return String(raw || '').trim();
    }

    function normalizeClientSession(s) {
      if (!s || typeof s !== 'object') return s;
      let st = canonSessionStatus(s.status);
      const ua = String(s.update_action || s.updateAction || '');
      if (st === 'Completed' && ua === 'Rescheduled') return { ...s, status: 'Rescheduled' };
      if (st === 'Completed' && ua === 'Cancelled') return { ...s, status: 'Cancelled' };
      if (!st && ua === 'Rescheduled') return { ...s, status: 'Rescheduled' };
      if (!st && ua === 'Cancelled') return { ...s, status: 'Cancelled' };
      if (!st) return { ...s, status: 'Planned' };
      const known = new Set(['Planned', 'Completed', 'Rescheduled', 'Cancelled']);
      if (!known.has(st)) return { ...s, status: 'Planned' };
      if (st !== s.status) return { ...s, status: st };
      return s;
    }

    function normalizeSessionsArray(arr) {
      if (!Array.isArray(arr)) return [];
      return arr.map((row) => normalizeClientSession(migrateLegacyClientSession(row)));
    }

    function applySpeakerFollowUpVisibility(sid) {
      const sel = document.getElementById(`f-fu-${sid}`);
      const wrapD = document.getElementById(`f-fud-wrap-${sid}`);
      const wrapN = document.getElementById(`f-fun-wrap-${sid}`);
      if (!sel || !wrapD || !wrapN) return;
      const show = sel.value === 'Y';
      wrapD.style.display = show ? '' : 'none';
      wrapN.style.display = show ? '' : 'none';
    }

    /** Speaker post-activity: toggle full form vs remarks-only for Rescheduled/Cancelled. */
    function applySpeakerActionLayout(sid, action) {
      const plan = document.getElementById(`spk-plan-fields-${sid}`);
      const remBlk = document.getElementById(`spk-remarks-block-${sid}`);
      const lbl = document.getElementById(`f-rem-lbl-${sid}`);
      if (!plan || !remBlk || !lbl) return;
      if (action === 'Completed') {
        plan.style.display = 'block';
        remBlk.style.display = 'block';
        lbl.textContent = 'Remarks';
      } else if (action === 'Rescheduled') {
        plan.style.display = 'none';
        remBlk.style.display = 'block';
        lbl.textContent = 'Reason for reschedule *';
      } else {
        plan.style.display = 'none';
        remBlk.style.display = 'none';
        lbl.textContent = 'Remarks';
      }
    }

    function sessionMonthKey(s) {
      const d = String(s.scheduled_date || '').trim();
      if (d.length >= 7 && /^\d{4}-\d{2}/.test(d)) return d.slice(0, 7);
      return '_nodate';
    }

    function formatMonthLabel(monthKey) {
      if (monthKey === '_nodate') return 'No date set';
      const parts = monthKey.split('-');
      const y = Number(parts[0]);
      const mo = Number(parts[1]);
      if (!y || !mo) return monthKey;
      return new Date(y, mo - 1, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' });
    }

    const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    /** Every month in each calendar year from earliest session year through next year. */
    function calendarMonthKeys(sessionList) {
      const now = new Date();
      let minYear = now.getFullYear();
      let maxYear = now.getFullYear() + 1;
      for (const s of sessionList || []) {
        const mk = sessionMonthKey(s);
        if (!mk || mk === '_nodate') continue;
        const y = Number(mk.slice(0, 4));
        if (!y) continue;
        if (y < minYear) minYear = y;
        if (y > maxYear) maxYear = y;
      }
      const keys = [];
      for (let y = minYear; y <= maxYear; y++) {
        for (let m = 1; m <= 12; m++) {
          keys.push(`${y}-${String(m).padStart(2, '0')}`);
        }
      }
      return keys.sort().reverse();
    }

    function calendarYears(sessionList) {
      const years = new Set();
      for (const key of calendarMonthKeys(sessionList)) {
        years.add(Number(key.slice(0, 4)));
      }
      return [...years].sort((a, b) => b - a);
    }

    function sessionMonthKeySet(sessionList) {
      const set = new Set();
      for (const s of sessionList || []) {
        const mk = sessionMonthKey(s);
        if (mk && mk !== '_nodate') set.add(mk);
      }
      return set;
    }

    function monthPickerDisplayLabel(value) {
      if (!value) return 'All months';
      return formatMonthLabel(value);
    }

    function syncMonthPickerLabel(wrap) {
      if (!wrap) return;
      const inp = wrap.querySelector('input[type="hidden"]');
      const lbl = wrap.querySelector('.po-month-cal__label');
      if (lbl && inp) lbl.textContent = monthPickerDisplayLabel(inp.value || '');
    }

    function monthPickerViewYear(wrap) {
      const inp = wrap?.querySelector('input[type="hidden"]');
      const selected = inp?.value || '';
      const fromData = wrap?.dataset.poViewYear;
      if (fromData && /^\d{4}$/.test(fromData)) return Number(fromData);
      if (selected && /^\d{4}-\d{2}$/.test(selected)) return Number(selected.slice(0, 4));
      return new Date().getFullYear();
    }

    function renderMonthPickerPanel(wrap) {
      const panel = wrap?.querySelector('.po-month-cal__panel');
      const inp = wrap?.querySelector('input[type="hidden"]');
      if (!panel || !inp) return;
      const selected = String(inp.value || '').trim();
      const years = calendarYears(sessions);
      const viewYear = monthPickerViewYear(wrap);
      wrap.dataset.poViewYear = String(viewYear);
      const withData = sessionMonthKeySet(sessions);
      const yearBtns = years
        .map(
          (y) =>
            `<button type="button" class="po-month-cal__year${y === viewYear ? ' is-active' : ''}" data-po-view-year="${y}">${y}</button>`
        )
        .join('');
      const monthBtns = MONTH_SHORT.map((short, idx) => {
        const key = `${viewYear}-${String(idx + 1).padStart(2, '0')}`;
        const cls = [
          'po-month-cal__month',
          selected === key ? 'is-selected' : '',
          withData.has(key) ? 'has-data' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return `<button type="button" class="${cls}" data-po-month-value="${escapeAttr(key)}">${short}</button>`;
      }).join('');
      panel.innerHTML = `
        <button type="button" class="po-month-cal__all${selected ? '' : ' is-selected'}" data-po-month-value="">All months</button>
        <div class="po-month-cal__legend" aria-hidden="true">
          <span><i class="is-selected"></i> Selected</span>
          <span><i class="has-data"></i> Has sessions</span>
          <span><i class="is-empty"></i> No sessions</span>
        </div>
        <div class="po-month-cal__years" role="tablist" aria-label="Years">${yearBtns}</div>
        <div class="po-month-cal__grid" role="grid" aria-label="Months for ${viewYear}">${monthBtns}</div>`;
    }

    function closeAllMonthPickers() {
      document.querySelectorAll('.po-month-cal__panel').forEach((p) => p.classList.add('is-hidden'));
      document.querySelectorAll('.po-month-cal__trigger').forEach((t) => t.setAttribute('aria-expanded', 'false'));
    }

    function syncMonthPickerByInputId(inputId) {
      const inp = document.getElementById(inputId);
      const wrap = inp?.closest('.po-month-cal');
      if (!wrap || !inp) return;
      const selected = String(inp.value || '').trim();
      if (/^\d{4}-\d{2}$/.test(selected)) wrap.dataset.poViewYear = selected.slice(0, 4);
      syncMonthPickerLabel(wrap);
      const panel = wrap.querySelector('.po-month-cal__panel');
      if (panel && !panel.classList.contains('is-hidden')) renderMonthPickerPanel(wrap);
    }

    function refreshMonthCalendarPickers() {
      document.querySelectorAll('[data-po-month-cal]').forEach((wrap) => {
        syncMonthPickerLabel(wrap);
        const panel = wrap.querySelector('.po-month-cal__panel');
        if (panel && !panel.classList.contains('is-hidden')) renderMonthPickerPanel(wrap);
      });
    }

    function initMonthCalendarPickers() {
      if (document.body.dataset.poMonthCalBound === '1') return;
      document.body.dataset.poMonthCalBound = '1';
      document.querySelectorAll('[data-po-month-cal]').forEach(syncMonthPickerLabel);
      document.addEventListener('click', (e) => {
        const trigger = e.target.closest('.po-month-cal__trigger');
        if (trigger) {
          e.stopPropagation();
          const wrap = trigger.closest('.po-month-cal');
          const panel = wrap?.querySelector('.po-month-cal__panel');
          const willOpen = panel?.classList.contains('is-hidden');
          closeAllMonthPickers();
          if (willOpen && wrap && panel) {
            renderMonthPickerPanel(wrap);
            panel.classList.remove('is-hidden');
            trigger.setAttribute('aria-expanded', 'true');
          }
          return;
        }
        const monthBtn = e.target.closest('[data-po-month-value]');
        if (monthBtn) {
          const wrap = monthBtn.closest('.po-month-cal');
          const inp = wrap?.querySelector('input[type="hidden"]');
          if (!inp) return;
          inp.value = monthBtn.getAttribute('data-po-month-value') || '';
          syncMonthPickerLabel(wrap);
          closeAllMonthPickers();
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          return;
        }
        const yearBtn = e.target.closest('[data-po-view-year]');
        if (yearBtn) {
          const wrap = yearBtn.closest('.po-month-cal');
          if (!wrap) return;
          wrap.dataset.poViewYear = yearBtn.dataset.poViewYear || '';
          renderMonthPickerPanel(wrap);
          return;
        }
        if (!e.target.closest('.po-month-cal')) closeAllMonthPickers();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeAllMonthPickers();
      });
    }

    function populatePmoMeetingsMonthOptions() {
      refreshMonthCalendarPickers();
    }

    function populateSalesMonthOptions() {
      refreshMonthCalendarPickers();
    }

    function parsePmoHash() {
      const r = parseAppRoute();
      if (r.name === 'pmo') {
        return {
          section: r.params.section,
          month: r.params.month,
          editId: r.params.editId != null ? r.params.editId : null,
        };
      }
      return { section: 'analytics', month: null, editId: null };
    }

    function buildPmoHash(section, monthKey, editSessionId) {
      if (section === 'plan' && editSessionId) {
        return `#/pmo/plan/edit/${encodeURIComponent(editSessionId)}`;
      }
      let path = `/pmo/${section}`;
      if ((section === 'analytics' || section === 'meetings') && monthKey) path += `/${monthKey}`;
      return `#${path}`;
    }

    function setPmoHash(section, monthKey, editSessionId) {
      const next = buildPmoHash(section, monthKey, editSessionId);
      if (location.hash !== next) location.hash = next;
      else applyPmoRoute();
    }

    function maybeOpenPlanEditFromHash() {
      if (poGetRole() !== 'pmo') return;
      const { section, editId } = parsePmoHash();
      if (section !== 'plan' || !editId) return;
      const s = sessions.find((x) => String(x.id) === String(editId));
      if (!s) return;
      if (String(editingId) === String(editId)) return;
      editSession(editId, { fromHash: true });
    }

    function applyPmoRoute() {
      const { section, month, editId } = parsePmoHash();
      document.querySelectorAll('.pmo-nav-btn').forEach((btn) => {
        btn.classList.toggle('is-active', btn.dataset.pmoNav === section);
      });
      document.querySelectorAll('#view-pmo .pmo-section').forEach((el) => {
        const on = el.dataset.pmoSection === section;
        el.classList.toggle('is-hidden', !on);
        if (on) el.removeAttribute('hidden');
        else el.setAttribute('hidden', '');
      });
      const monthsWrap = document.getElementById('analytics-months-wrap');
      const detailWrap = document.getElementById('analytics-detail-wrap');
      if (monthsWrap && detailWrap && section === 'analytics') {
        const showDetail = Boolean(month);
        monthsWrap.classList.toggle('is-hidden', showDetail);
        detailWrap.classList.toggle('is-hidden', !showDetail);
        const lbl = document.getElementById('analytics-breadcrumb-label');
        if (lbl && month) lbl.textContent = formatMonthLabel(month);
      } else if (monthsWrap && detailWrap) {
        monthsWrap.classList.remove('is-hidden');
        detailWrap.classList.add('is-hidden');
      }
      if (section === 'plan' && editId) {
        queueMicrotask(() => maybeOpenPlanEditFromHash());
      }
      if (section === 'plan') {
        initPlanFormRegionAndBranch();
      }
      if (section === 'meetings') {
        populatePmoMeetingsMonthOptions();
        const sel = document.getElementById('f-meetings-month');
        if (sel) sel.value = month && /^\d{4}-\d{2}$/.test(month) ? month : '';
        syncMonthPickerByInputId('f-meetings-month');
      }
    }

    function salesMonthDisplayLabel(monthKey) {
      return monthPickerDisplayLabel(monthKey);
    }

    function switchRole(r) {
      const vpmo = document.getElementById('view-pmo');
      const vspk = document.getElementById('view-speaker');
      const vsales = document.getElementById('view-sales-admin');
      const hide = (el) => {
        if (!el) return;
        el.style.display = 'none';
        el.style.pointerEvents = 'none';
      };
      const show = (el) => {
        if (!el) return;
        el.style.display = 'block';
        el.style.pointerEvents = 'auto';
      };
      hide(vpmo);
      hide(vspk);
      hide(vsales);
      if (r === 'pmo') show(vpmo);
      else if (r === 'sales_admin') show(vsales);
      else show(vspk);
      document.getElementById('tab-pmo')?.classList.toggle('active', r === 'pmo');
      document.getElementById('tab-spk')?.classList.toggle('active', r === 'speaker');
    }

    function pickGrade(val) {
      if (!_selGrades.includes(val)) {
        _selGrades.push(val);
      } else {
        _selGrades = _selGrades.filter(g => g !== val);
      }
      _selGrades.sort(); // Sort so they are always in standard order G1..G9

      document.querySelectorAll('#p-grade-bar .gb').forEach(btn => btn.classList.remove('active'));
      _selGrades.forEach(g => {
        const b = document.getElementById('grade-' + g);
        if (b) b.classList.add('active');
      });
      syncPlanLocationValidity();
    }

    function pickVenue(val) {
      _selVenue = val;
      document.querySelectorAll('#p-venue-bar .gb').forEach(btn => btn.classList.remove('active'));
      const b = document.getElementById('venue-' + val);
      if (b) b.classList.add('active');
      syncPlanLocationValidity();
    }

    /** Read venue from the active plan-form button so save matches what the user sees (avoids stale _selVenue). */
    function getSelectedPlanVenue() {
      const on = document.getElementById('venue-Online');
      const off = document.getElementById('venue-Offline');
      if (on && on.classList.contains('active')) return 'Online';
      if (off && off.classList.contains('active')) return 'Offline';
      return _selVenue;
    }

    /** Link or location field: Online = URL + preview; Offline = plain venue text. */
    function syncPlanLocationValidity() {
      const el = document.getElementById('p-location');
      const hint = document.getElementById('p-location-hint');
      const wrap = document.getElementById('p-location-open-wrap');
      const openA = document.getElementById('p-location-open');
      const locLabel = document.getElementById('p-location-label');
      if (!el) return;
      const z = el.value.trim();

      if (_selVenue !== 'Online' && _selVenue !== 'Offline') {
        el.type = 'text';
        el.removeAttribute('inputmode');
        if (locLabel) locLabel.textContent = 'Meeting link or venue';
        el.placeholder = 'Choose Online or Offline above first';
        el.setCustomValidity('');
        if (hint) {
          hint.style.display = 'none';
          hint.textContent = '';
        }
        if (wrap) wrap.style.display = 'none';
        return;
      }

      if (_selVenue === 'Online') {
        el.type = 'url';
        el.setAttribute('inputmode', 'url');
        if (locLabel) locLabel.textContent = 'Meeting link (required)';
        el.placeholder = 'https://zoom.us/j/... or https://meet.google.com/...';
        el.setCustomValidity(safeZoomHref(z) ? '' : 'For online sessions, paste a full meeting link starting with https:// or http://');
        if (hint) {
          hint.style.display = 'block';
          hint.textContent = 'Paste a full https:// or http:// link. Plain text is not accepted for online sessions.';
        }
        const href = safeZoomHref(z);
        if (wrap && openA) {
          if (href) {
            openA.href = href;
            wrap.style.display = 'flex';
          } else {
            wrap.style.display = 'none';
          }
        }
        return;
      }

      el.type = 'text';
      el.removeAttribute('inputmode');
      if (locLabel) locLabel.textContent = 'Venue / address';
      el.placeholder = 'e.g. Auditorium, branch address, or N/A';
      if (offlineFieldLooksLikeLink(z)) {
        el.setCustomValidity('Offline venue must be plain text only — not a web link (http://, https://, www., etc.).');
      } else if (z.length === 0) {
        el.setCustomValidity('For offline sessions, enter the venue or location (you can type N/A if not applicable).');
      } else {
        el.setCustomValidity('');
      }
      if (hint) {
        hint.style.display = 'block';
        hint.textContent = 'Offline: physical venue or N/A — plain text only, not a web link.';
      }
      if (wrap) wrap.style.display = 'none';
    }

    const regionBranches = {
      "Andhra Pradesh": [
        "Sri Chaitanya-Asilmetta 3",
        "Sri Chaitanya-Eluru CBSE",
        "Sri Chaitanya-Ganapavaram",
        "Sri Chaitanya-Guntur Res",
        "Sri Chaitanya-International Bezawada",
        "Sri Chaitanya-International School Vijayawada",
        "Sri Chaitanya-International School Whitehouse",
        "Sri Chaitanya-Kakinada 3",
        "Sri Chaitanya-Kurmannapalem",
        "Sri Chaitanya-Madhurawada",
        "Sri Chaitanya-Madhurawada 5",
        "Sri Chaitanya-Palakol 2",
        "Sri Chaitanya-REDDYPALEM DS",
        "Sri Chaitanya-Rajahmundry 1",
        "Sri Chaitanya-TSN Puram",
        "Sri Chaitanya-Tadepalligudem",
        "Sri Chaitanya-Vizianagaram",
      ],
      "Bengaluru": [
        "Sri Chaitanya-Basavanagudi",
        "Sri Chaitanya-Banaswadi",
        "Sri Chaitanya-Bannerghatta Road",
        "Sri Chaitanya-Electronic City International",
        "Sri Chaitanya-Future Pathways Global School Varthur",
        "Sri Chaitanya-Hebbal",
        "Sri Chaitanya-HSR layout",
        "Sri Chaitanya-Kudlu 2",
        "Sri Chaitanya-JP Nagar",
        "Sri Chaitanya-Kaggadasapura 2",
        "Sri Chaitanya-Kaggadasapura 3",
        "Sri Chaitanya-Kudlu",
        "Sri Chaitanya-Kaggadasapura",
        "Sri Chaitanya-KR Puram",
        "Sri Chaitanya-Kanakapura Road",
        "Sri Chaitanya-Marthahally 1",
        "Sri Chaitanya-Marthahally 2",
        "Sri Chaitanya-Mahalakshmi Layout",
        "Sri Chaitanya-M S Palya",
        "Sri Chaitanya-Nagarbhavi",
        "Sri Chaitanya-Peenya Dasarahalli",
        "Sri Chaitanya-Ram Murthy Nagar 1",
        "Sri Chaitanya-Ram Murthy Nagar 3",
        "Sri Chaitanya-Ram Murthy Nagar 4",
        "Sri Chaitanya-Rajaji Nagar",
        "Sri Chaitanya-Seshadripuram",
        "Sri Chaitanya-Uttarahalli",
        "Sri Chaitanya-Ullal",
        "Sri Chaitanya-Vidyaranyapura",
        "Sri Chaitanya-Whitefield",
        "Sri Chaitanya-Yeshwanthpur",
        "Sri Chaitanya-Yelahanka",
        "Sri Chaitanya-Rampura",
      ],
      "Chennai": [
        "Sri Chaitanya-Iyyapanthangal",
        "Sri Chaitanya-Keelkattalai",
        "Sri Chaitanya-KK Nagar",
        "Sri Chaitanya-Mylapore",
        "Sri Chaitanya-Moolakadai",
        "Sri Chaitanya-Madhavaram",
        "Sri Chaitanya-Manapakkam",
        "Sri Chaitanya-Nolambur",
        "Sri Chaitanya-Pallavaram 2",
        "Sri Chaitanya-Perungudi",
        "Sri Chaitanya-Pallavaram",
        "Sri Chaitanya-Pallavakkam",
        "Sri Chaitanya-Perumbakkam",
        "Sri Chaitanya-Royapuram",
        "Sri Chaitanya-Ramapuram",
        "Sri Chaitanya-Selaiyur",
        "Sri Chaitanya-Poonamallee International School",
        "Sri Chaitanya-Thoraipakkam",
        "Sri Chaitanya-Tambaram",
        "Sri Chaitanya-Velachery"
      ],
      "Delhi NCR": [
        "Sri Chaitanya-Faridabad 2",
        "Sri Chaitanya-Faridabad",
        "Sri Chaitanya-Gurugram 1",
        "Sri Chaitanya-Ghaziabad 1",
        "Sri Chaitanya-Gurugram 2",
        "Sri Chaitanya-Ghaziabad 2",
        "Sri Chaitanya-Gurugram 3",
        "Sri Chaitanya-Gurugram 4",
        "Sri Chaitanya-Gurugram 6",
        "Sri Chaitanya-Gurugram 9",
        "Sri Chaitanya-Noida 1",
        "Sri Chaitanya-Noida 2",
        "Sri Chaitanya-Noida 3"
      ],
      "Haryana": [
        "Sri Chaitanya-Ambala",
        "Sri Chaitanya-Karnal",
        "Sri Chaitanya-Panipat",
        "Sri Chaitanya-Gurugram 12",
        "Sri Chaitanya-Palwal 1",
        "Sri Chaitanya-Samalkha",
        "Sri Chaitanya-Fatehabad 2",
        "Sri Chaitanya-Rohtak",
      ],
      "Maharashtra": [
        "Sri Chaitanya-Aurangabad 1",
        "Sri Chaitanya-Aurangabad 2",
        "Sri Chaitanya-Bavadhan",
        "Sri Chaitanya-Nashik 1",
        "Sri Chaitanya-Nashik 2",
        "Sri Chaitanya-Nanded",
        "Sri Chaitanya-Dombivali",
        "Sri Chaitanya-Ulhasnagar",
        "Sri Chaitanya-Wagholi",
        "Sri Chaitanya-Ahmednagar",
        "Sri Chaitanya-Badlapur",
        "Sri Chaitanya-Bhiwandi",
        "Sri Chaitanya-Nanded 2",
        "Sri Chaitanya-Shirdi",
        "Sri Chaitanya-Shrirampur",
      ],
      "Punjab": [
        "Sri Chaitanya-DHURI 2",
        "Sri Chaitanya-Hathan",
        "Sri Chaitanya-Jalandhar",
        "Sri Chaitanya-Malsian",
        "Sri Chaitanya-Sunam",
        "Sri Chaitanya-Ludhiana 1",
        "Sri Chaitanya-Chandigarh",
        "Sri Chaitanya-Ludhiana 2",
        "Sri Chaitanya-Mansa 2",
        "Sri Chaitanya-Moga",
        "Sri Chaitanya-Mohali",
      ],
      "Rajasthan": [
        "Sri Chaitanya-Bikaner",
        "Sri Chaitanya-Jaipur 1",
        "Sri Chaitanya-Jaipur 2",
        "Sri Chaitanya-Jaipur 3",
        "Sri Chaitanya-Jaipur 4",
        "Sri Chaitanya-Jodhpur",
        "Sri Chaitanya-Chittorgarh",
        "Sri Chaitanya-Jaipur 5",
        "Sri Chaitanya-Udaipur"
      ],
      "Rest of Karnataka": [
        "Sri Chaitanya-Ballari",
        "Sri Chaitanya-Davanagere",
        "Sri Chaitanya-Gangavathi",
        "Sri Chaitanya-Hubli",
        "Sri Chaitanya-Hospet",
        "Sri Chaitanya-Mandya",
        "Sri Chaitanya-Mangalore",
        "Sri Chaitanya-Mysore",
        "Sri Chaitanya-Raichur 3",
        "Sri Chaitanya-Sindhanur",
        "Sri Chaitanya-Tumkur 1",
        "Sri Chaitanya-Tumkur 3"
      ],
      "Rest of Tamil Nadu": [
        "Sri Chaitanya-Coimbatore 1",
        "Sri Chaitanya-Coimbatore-2",
        "Sri Chaitanya-Coimbatore 4",
        "Sri Chaitanya-Coimbatore 6",
        "Sri Chaitanya-Dindigul",
        "Sri Chaitanya-Erode",
        "Sri Chaitanya-Hosur 1",
        "Sri Chaitanya-Hosur 2",
        "Sri Chaitanya-Hosur 3",
        "Sri Chaitanya-Karur",
        "Sri Chaitanya-Krishnagiri",
        "Sri Chaitanya-Namakkal",
        "Sri Chaitanya-Salem",
        "Sri Chaitanya-Tiruppur 2",
        "Sri Chaitanya-Tiruppur",
        "Sri Chaitanya-Tiruvannamalai",
        "Sri Chaitanya-Trichy",
        "Sri Chaitanya-Padur",
        "Sri Chaitanya-Coimbatore 5",
        "Sri Chaitanya-Coimbatore 6",
        "Sri Chaitanya-Madurai",
        "Sri Chaitanya-Pollachi",
        "Sri Chaitanya-Tiruchirappalli",
        "Sri Chaitanya-Vellore",
        "Sri Chaitanya-Thanjavur",
        "Sri Chaitanya-Coimbatore Chetty Street",
        "Sri Chaitanya-Coimbatore Kalapatti",
        "Sri Chaitanya-Madurai",
        "Sri Chaitanya-Tiruchengode",
      ],
      "Telangana": [
        "Sri Chaitanya-Adibatla",
        "Sri Chaitanya-Chaitanyapuri CBSE",
        "Sri Chaitanya-Ecil 3",
        "Sri Chaitanya-Gundla Pochampally CBSE",
        "Sri Chaitanya-Hasmathpet",
        "Sri Chaitanya-Himayatnagar",
        "Sri Chaitanya-Jubilee Hills",
        "Sri Chaitanya-Kompally 2",
        "Sri Chaitanya-Kompally 5",
        "Sri Chaitanya-Khalsa",
        "Sri Chaitanya-Mehdipatnam",
        "Sri Chaitanya-Manikonda",
        "Sri Chaitanya-Nallakunta",
        "Sri Chaitanya-Nagole",
        "Sri Chaitanya-Nacharam",
        "Sri Chaitanya-Nallagandla",
        "Sri Chaitanya- NTPC Ramagundam",
        "Sri Chaitanya-Ramagundam",
        "Sri Chaitanya-Sr Nagar",
        "Sri Chaitanya-Beeramguda",
        "Sri Chaitanya-Dammaiguda",
        "Sri Chaitanya-Hyderguda",
        "Sri Chaitanya-Kharmanghat",
        "Sri Chaitanya-Kompally 4",
        "Sri Chaitanya-Kukatpally",
        "Sri Chaitanya-Kukatpally 2",
        "Sri Chaitanya-Kushaiguda ECIL-1",
        "Sri Chaitanya-Nizampet",
        "Sri Chaitanya-Serilingampally",
        "Sri Chaitanya-SP Nagar DS",
        "Sri Chaitanya-Beeramguda",
        "Sri Chaitanya-Dammaiguda",
        
      ],
      "Uttar Pradesh": [
        "Sri Chaitanya-Agra",
        "Sri Chaitanya-Lucknow 1",
        "Sri Chaitanya-Muzaffarnagar",
        "Sri Chaitanya-Shamli",
        "Sri Chaitanya-Agra 2",
        "Sri Chaitanya-Bareilly",

      ],
      "Uttarakhand": [
        "Sri Chaitanya-Dehradun"
      ],
      "West Bengal": [
        "Sri Chaitanya-Bada Bazar",
        "Sri Chaitanya-Dunlop",
        "Sri Chaitanya-Howrah",
        "Sri Chaitanya-New Town 1",
        "Sri Chaitanya-New Town 2",
        "Sri Chaitanya-Rishra",
        "Sri Chaitanya-Serampore",
        "Sri Chaitanya-Chinsurah",
        
      ],
    };

    function fillRegionSelectFromMap() {
      const sel = document.getElementById('p-region');
      if (!sel) {
        console.error('[PO] #p-region not found; region list was not built.');
        return;
      }
      const current = String(sel.value || '').trim();
      const keys = Object.keys(regionBranches);
      let html = '<option value="">Select Region</option>';
      keys.forEach((k) => {
        html += `<option value="${escapeAttr(k)}">${escapeHtml(k)}</option>`;
      });
      if (current && !keys.includes(current)) {
        html += `<option value="${escapeAttr(current)}">${escapeHtml(current)}</option>`;
      }
      sel.innerHTML = html;
      if (current) sel.value = current;
    }

    function ensureRegionOptionInSelect(val) {
      if (val == null || val === '') return;
      const sel = document.getElementById('p-region');
      if (!sel) return;
      if (Array.from(sel.options).some((o) => o.value === val)) return;
      const o = document.createElement('option');
      o.value = val;
      o.textContent = val;
      sel.appendChild(o);
    }

    function updateBranches(forceBranch) {
      const pReg = document.getElementById('p-region');
      if (!pReg) {
        console.error('[PO] #p-region not found in updateBranches.');
        return;
      }
      const reg = String(pReg.value || '').trim();
      const container = document.getElementById('branch-container');
      if (!container) {
        console.error('[PO] #branch-container not found; cannot render branch field.');
        return;
      }
      const raw = regionBranches[reg];
      const list = (Array.isArray(raw) ? raw : [])
        .map((b) => String(b == null ? '' : b).replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      if (Array.isArray(raw) && list.length < raw.length) {
        console.warn('[PO] Skipped empty branch row(s) for region:', reg);
      }
      const nUnique = new Set(list).size;
      if (list.length !== nUnique) {
        console.warn(
          '[PO] Duplicate branch name in regionBranches for "' + reg + ' — same string twice collapses the count in the UI in some browsers. list:',
          list
        );
      }

      const currentVal =
        typeof forceBranch === 'string'
          ? forceBranch
          : (document.getElementById('p-branch') ? document.getElementById('p-branch').value : '');

      if (list.length > 0) {
        let optionsHTML = '<option value="">Select Branch</option>';
        let found = false;
        for (let i = 0; i < list.length; i += 1) {
          const b = list[i];
          optionsHTML += `<option value="${escapeAttr(b)}">${escapeHtml(b)}</option>`;
          if (b === currentVal) found = true;
        }
        if (currentVal && !found) {
          optionsHTML += `<option value="${escapeAttr(currentVal)}">${escapeHtml(currentVal)}</option>`;
        }

        container.innerHTML = `<label>Branch Name</label><select id="p-branch" name="branch" required>${optionsHTML}</select>`;
      } else {
        container.innerHTML = `<label>Branch Name</label><input type="text" id="p-branch" name="branch" required placeholder="Type Branch Name here...">`;
      }

      const el = document.getElementById('p-branch');
      if (el) el.value = currentVal;
    }

    function initPlanFormRegionAndBranch() {
      fillRegionSelectFromMap();
      const br = document.getElementById('p-branch');
      const keep = br && 'value' in br ? br.value : '';
      updateBranches(typeof keep === 'string' ? keep : '');
    }

    function setPlanField(id, value) {
      const el = document.getElementById(id);
      if (!el) return false;
      el.value = value != null && value !== '' ? String(value) : '';
      return true;
    }

    function clearForm() {
      ['p-date', 'p-time', 'p-end-time', 'p-location', 'p-region', 'p-teacher', 'p-cohost', 'p-invited']
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
      _selGrades = [];
      _selVenue = '';
      document.querySelectorAll('#p-grade-bar .gb, #p-venue-bar .gb').forEach((b) => b.classList.remove('active'));
      updateBranches('');
      refreshPlanDateMinAttr();
      syncPlanLocationValidity();
    }

    const PLAN_FORM_SUBTITLE_DEFAULT =
      'Overlap is blocked when two plans share the same date, region, branch, overlapping times, and at least one of the same grades. Different grades with no overlap can run in parallel.';

    function setPlanFormHeader(title, subtitle) {
      const t = document.getElementById('form-title');
      const s = document.getElementById('form-title-sub');
      if (t) t.textContent = title;
      if (s) s.textContent = subtitle || PLAN_FORM_SUBTITLE_DEFAULT;
    }

    function cancelEdit() {
      editingId = null;
      setPlanFormHeader('Plan New Session', PLAN_FORM_SUBTITLE_DEFAULT);
      document.getElementById('btn-save-plan').textContent = 'Save Session Plan';
      document.getElementById('btn-cancel-edit').style.display = 'none';
      if (poGetRole() === 'pmo' && (location.hash || '').includes('/plan/edit/')) {
        poReplaceHash('#/pmo/plan');
      }
      clearForm();
    }

    function editSession(id, opts) {
      const fromHash = opts && opts.fromHash;
      const s = sessions.find(x => x.id === id);
      if (!s) return;
      editingId = id;

      if (!fromHash) {
        const next = buildPmoHash('plan', null, id);
        if (location.hash !== next) location.hash = next;
      }
      applyPmoRoute();

      const need = ['p-date', 'p-time', 'p-end-time', 'p-location', 'p-region', 'p-teacher', 'p-cohost', 'p-invited'];
      const missing = need.filter((fid) => !document.getElementById(fid));
      if (missing.length) {
        editingId = null;
        toast(
          'The plan form is out of date. Hard-refresh the page (Ctrl+Shift+R) or clear this site’s cache, then try Edit again.',
          'error'
        );
        return;
      }

      setPlanField('p-date', s.scheduled_date);
      setPlanField('p-time', s.scheduled_start_time || '');
      setPlanField(
        'p-end-time',
        (s.scheduled_end_time && String(s.scheduled_end_time).trim()) ||
          defaultScheduledEndFromStartClient(s.scheduled_start_time) ||
          ''
      );
      _selGrades = s.grade ? s.grade.split(',').map(g => g.trim()).filter(Boolean) : [];
      document.querySelectorAll('#p-grade-bar .gb').forEach(btn => btn.classList.remove('active'));
      _selGrades.forEach(g => {
        const b = document.getElementById('grade-' + g);
        if (b) b.classList.add('active');
      });
      setPlanField('p-location', s.location || '');
      ensureRegionOptionInSelect(s.region);
      setPlanField('p-region', s.region || '');
      updateBranches(s.branch || '');
      pickVenue(s.venue || '');
      setPlanField('p-teacher', s.teacher || '');
      setPlanField('p-cohost', s.co_host || '');
      const inv = s.invited;
      setPlanField(
        'p-invited',
        inv !== null && inv !== undefined && inv !== '' && !Number.isNaN(Number(inv)) ? String(Number(inv)) : ''
      );

      setPlanFormHeader('Edit Session', `Updating details for ${s.branch || 'this school'}.`);
      const bsave = document.getElementById('btn-save-plan');
      if (bsave) bsave.textContent = 'Update Session Plan';
      const bcancel = document.getElementById('btn-cancel-edit');
      if (bcancel) bcancel.style.display = 'inline-block';

      refreshPlanDateMinAttr();
      syncPlanLocationValidity();
      const ploc = document.getElementById('p-location');
      if (_selVenue === 'Online' && ploc && !safeZoomHref(ploc.value)) {
        focusPlanField('p-location');
      }
      document.getElementById('pmo-section-plan')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }

    function focusPlanField(id) {
      const el = document.getElementById(id);
      if (!el) return;
      el.focus();
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    /** Browser + custom checks: run while saving (and constraints update while typing link/location). */
    function validatePlanFormBeforeSave() {
      if (!_selGrades.length) {
        toast('Select at least one grade (G1–G9).', 'error');
        focusPlanField('grade-G1');
        return false;
      }
      const planVenue = getSelectedPlanVenue();
      if (planVenue === 'Online' || planVenue === 'Offline') _selVenue = planVenue;
      if (_selVenue !== 'Online' && _selVenue !== 'Offline') {
        toast('Select venue: Online or Offline.', 'error');
        focusPlanField('venue-Online');
        return false;
      }
      syncPlanLocationValidity();
      const locVal = document.getElementById('p-location')?.value.trim() || '';
      if (_selVenue === 'Offline' && offlineFieldLooksLikeLink(locVal)) {
        toast('Offline mode accepts venue text only. Remove web links (http://, https://, www., …).', 'error');
        focusPlanField('p-location');
        return false;
      }
      const planForm = document.getElementById('plan-form');
      if (planForm && !planForm.checkValidity()) {
        planForm.reportValidity();
        return false;
      }
      if (!validatePlanScheduleOrToast()) return false;
      const invitedRaw = document.getElementById('p-invited').value;
      const invitedNum = parseInt(invitedRaw, 10);
      if (invitedRaw === '' || Number.isNaN(invitedNum) || invitedNum < 0 || invitedNum > 1_000_000) {
        toast('Enter a valid number of parents invited (0 or more).', 'error');
        focusPlanField('p-invited');
        return false;
      }
      return true;
    }

    function saveSession() {
      if (!validatePlanFormBeforeSave()) return;

      const date = document.getElementById('p-date').value;
      const branch = document.getElementById('p-branch').value.trim();
      const teacher = document.getElementById('p-teacher').value.trim();
      const time = document.getElementById('p-time').value;
      const endTime = document.getElementById('p-end-time').value;
      const region = document.getElementById('p-region').value.trim();
      const gradeStr = _selGrades.join(', ');
      const meetingLoc = document.getElementById('p-location').value.trim();
      const invitedNum = parseInt(document.getElementById('p-invited').value, 10);
      const planVenue = getSelectedPlanVenue();
      if (planVenue === 'Online' || planVenue === 'Offline') _selVenue = planVenue;

      const draft = {
        id: editingId || '__draft__',
        scheduled_date: date,
        scheduled_start_time: time,
        scheduled_end_time: endTime,
        region,
        branch,
        grade: gradeStr,
      };
      let conflictGrades = null;
      for (const s of sessions) {
        if (s.id === editingId) continue;
        const cg = sessionsConflictingGrades(draft, s);
        if (cg && cg.length) {
          conflictGrades = cg;
          break;
        }
      }
      if (conflictGrades) {
        toast(scheduleConflictToastMessage(conflictGrades), 'warning');
        return;
      }

      if (editingId) {
        const s = sessions.find(x => x.id === editingId);
        if (!s) return;
        const backup = { ...s };
        s.scheduled_date = date;
        s.scheduled_start_time = time;
        s.scheduled_end_time = endTime;
        s.grade = gradeStr;
        s.location = meetingLoc;
        s.branch = branch;
        s.region = region;
        s.venue = planVenue;
        s.teacher = teacher;
        s.co_host = document.getElementById('p-cohost').value.trim();
        s.invited = invitedNum;
        (async () => {
          const ok = await putPmoSessionOnServer(s);
          if (!ok) {
            Object.assign(s, backup);
            renderAll();
            return;
          }
          await pullSessionsFromServer();
          await pmoUploadExcelFile();
          cancelEdit();
          toast('Session updated successfully.', 'success');
          const monthKey = /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7) : null;
          setPmoHash('meetings', monthKey);
          document.getElementById('pmo-section-meetings')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
          renderAll();
        })();
      } else {
        const newId = newSessionId();
        const newRow = {
          id: newId,
          scheduled_date: date,
          scheduled_start_time: time,
          scheduled_end_time: endTime,
          grade: gradeStr,
          location: meetingLoc,
          branch, region,
          venue: planVenue,
          teacher,
          co_host: document.getElementById('p-cohost').value.trim(),
          invited: invitedNum,
          status: 'Planned',
          attended: '', engagement: '', follow_up: '', follow_up_date: '', follow_up_notes: '', session_status: '', remarks: ''
        };
        sessions.unshift(newRow);
        clearForm();
        (async () => {
          const ok = await postPmoSessionOnServer(newRow);
          if (!ok) {
            sessions = sessions.filter((x) => x.id !== newId);
            renderAll();
            return;
          }
          await pullSessionsFromServer();
          await pmoUploadExcelFile();
          toast('Session planned!', 'success');
          const monthKey = /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7) : null;
          setPmoHash('meetings', monthKey);
          renderAll();
        })();
      }
    }

    async function delSession(id) {
      const api = window.poToast;
      if (!api || typeof api.confirm !== 'function') {
        console.error('Confirm dialog unavailable');
        return;
      }
      const yes = await api.confirm('Delete this session?', {
        confirmLabel: 'Delete',
        cancelLabel: 'Cancel',
        variant: 'danger',
      });
      if (!yes) return;
      const idx = sessions.findIndex((s) => s.id === id);
      if (idx < 0) return;
      const removed = sessions[idx];
      sessions.splice(idx, 1);
      (async () => {
        const ok = await deletePmoSessionOnServer(removed.id);
        if (!ok) {
          sessions.splice(idx, 0, removed);
          renderAll();
          return;
        }
        await pullSessionsFromServer();
        await pmoUploadExcelFile();
        toast('Deleted', 'success');
        renderAll();
      })();
    }

    function toggleExp(sid, mode = 'pmo') {
      const key = expandKey(sid, mode);
      openExpand[key] = !openExpand[key];
      const expEl = document.getElementById(`exp-${mode}-${sid}`);
      const arrEl = document.getElementById(`arr-${mode}-${sid}`);
      if (!expEl) return;
      if (openExpand[key]) {
        const s = sessions.find((x) => x.id === sid);
        if (!s) {
          openExpand[key] = false;
          expEl.style.display = 'none';
          expEl.innerHTML = '';
          if (arrEl) arrEl.classList.remove('open');
          return;
        }
        expEl.innerHTML = buildExpandContent(s);
        expEl.style.display = 'block';
        if (arrEl) arrEl.classList.add('open');
        if (mode === 'spk') {
          applySpeakerFollowUpVisibility(sid);
          if (canSpeakerPostUpdate(s)) {
            applySpeakerActionLayout(sid, _selAction[sid] || 'Completed');
            const attIn = document.getElementById(`f-att-${sid}`);
            if (attIn) syncSpeakerAttendedError(attIn);
          }
        }
      } else {
        expEl.style.display = 'none';
        expEl.innerHTML = '';
        if (arrEl) arrEl.classList.remove('open');
      }
    }

    function isSpeakerViewVisible() {
      const el = document.getElementById('view-speaker');
      if (!el) return false;
      return window.getComputedStyle(el).display !== 'none';
    }

    function speakerPostFieldsInnerHtml(s) {
      const invitedCap = Number(s.invited) || 0;
      const attVal = s.attended != null && s.attended !== '' ? String(s.attended) : '';
      const fuShow = s.follow_up === 'Y';
      const fudMin = escapeAttr(isoDayAfterSession(s.scheduled_date));
      const fudMinAttr = fudMin ? ` min="${fudMin}"` : '';
      return `
        <div class="fg2" style="margin-bottom:12px">
        <div id="spk-plan-fields-${s.id}">
        <div class="fg">
          <label>No. of Parents Attended *</label>
          <input type="number" id="f-att-${s.id}" data-po-invited-cap="${invitedCap}" placeholder="0" min="0" max="${invitedCap}" title="Must be â‰¤ parents invited (${invitedCap})" value="${escapeAttr(attVal)}" aria-describedby="f-att-err-${s.id}">
          <div id="f-att-err-${s.id}" class="po-att-err" role="alert" style="display:none;color:#c62828;font-size:12px;margin-top:4px;font-weight:500"></div>
        </div>
        <div class="fg">
          <label>Engagement Level *</label>
          <div class="engbar">
            <button type="button" class="eb ${s.engagement === 'H' ? 'eH' : ''}" id="eng-H-${s.id}" data-po-pick-eng="1" data-po-sid="${escapeAttr(s.id)}" data-po-eng="H">H – High</button>
            <button type="button" class="eb ${s.engagement === 'M' ? 'eM' : ''}" id="eng-M-${s.id}" data-po-pick-eng="1" data-po-sid="${escapeAttr(s.id)}" data-po-eng="M">M – Medium</button>
            <button type="button" class="eb ${s.engagement === 'L' ? 'eL' : ''}" id="eng-L-${s.id}" data-po-pick-eng="1" data-po-sid="${escapeAttr(s.id)}" data-po-eng="L">L – Low</button>
          </div>
        </div>
        <div class="fg">
          <label>Follow-Up Required</label>
          <select id="f-fu-${s.id}">
            <option value="">Select</option>
            <option value="Y" ${s.follow_up === 'Y' ? 'selected' : ''}>Y – Yes</option>
            <option value="N" ${s.follow_up === 'N' ? 'selected' : ''}>N – No</option>
          </select>
        </div>
        <div class="fg" id="f-fud-wrap-${s.id}" style="display:${fuShow ? 'block' : 'none'}">
          <label>Follow-Up Date *</label>
          <input type="date" id="f-fud-${s.id}"${fudMinAttr} value="${escapeAttr(s.follow_up_date || '')}" title="Must be after the session date">
        </div>
        <div class="fg">
          <label>Overall Session Status *</label>
          <select id="f-sts-${s.id}">
            <option value="">Select status</option>
            ${['Successful', 'Excellent', 'Moderate', 'Low Turnout']
          .map(o => `<option value="${o}" ${s.session_status === o ? 'selected' : ''}>${o}</option>`).join('')}
          </select>
        </div>
        <div class="fg full" id="f-fun-wrap-${s.id}" style="display:${fuShow ? 'block' : 'none'}">
          <label>Follow-Up Notes *</label>
          <textarea id="f-fun-${s.id}" placeholder="Notes for follow-up team...">${escapeHtml(s.follow_up_notes || '')}</textarea>
        </div>
        </div>
        <div id="spk-remarks-block-${s.id}" class="fg full">
          <label for="f-rem-${s.id}" id="f-rem-lbl-${s.id}">Remarks</label>
          <textarea id="f-rem-${s.id}" placeholder="Overall session remarks...">${escapeHtml(s.remarks || '')}</textarea>
        </div>
      </div>`;
    }

    function speakerPostActionBarHtml(s) {
      const sid = escapeAttr(s.id);
      const fromRescheduled = s.status === 'Rescheduled';
      return `
    <div class="fg" style="margin-bottom:12px">
      <label>Update Action *</label>
      <div class="grade-bar" id="p-action-bar-${s.id}">
        <button type="button" class="gb active" id="act-Completed-${s.id}" data-po-pick-action="1" data-po-sid="${sid}" data-po-act="Completed">Completed</button>
        ${fromRescheduled ? '' : `<button type="button" class="gb" id="act-Rescheduled-${s.id}" data-po-pick-action="1" data-po-sid="${sid}" data-po-act="Rescheduled">Rescheduled</button>`}
        <button type="button" class="gb" id="act-Cancelled-${s.id}" data-po-pick-action="1" data-po-sid="${sid}" data-po-act="Cancelled">Cancelled</button>
        </div>
      </div>`;
    }

    function buildExpandContent(s) {
      const isSpeaker = isSpeakerViewVisible();
      const canUpdate = isSpeaker && canSpeakerPostUpdate(s);

      const infoGrid = `
    <div class="ig">
      <div class="ii"><label title="Unique session id (UUID) stored as the database key">Meeting ID</label><p><code style="user-select:all;word-break:break-all;font-size:12px;color:var(--po-text, #1a1a2e)">${escapeHtml(s.id)}</code></p></div>
      <div class="ii"><label>Session date</label><p>${escapeHtml(s.scheduled_date ? fmtDate(s.scheduled_date) : '—')}</p></div>
      <div class="ii"><label>Start time</label><p>${escapeHtml(String(s.scheduled_start_time || '').trim() || '—')}</p></div>
      <div class="ii"><label>End time</label><p>${escapeHtml(String(s.scheduled_end_time || '').trim() || '—')}</p></div>
      <div class="ii"><label>Grade</label><p>${s.grade ? escapeHtml(s.grade) : '—'}</p></div>
      <div class="ii"><label>Link or location</label><p>${locationLinkHtml(s.location, { sessionId: s.id, venue: s.venue })}</p></div>
      <div class="ii"><label>Student IDs</label><p>${formatStudentIdsCell(s)}</p></div>
      <div class="ii"><label>Branch</label><p>${s.branch ? escapeHtml(s.branch) : '—'}</p></div>
      <div class="ii"><label>Region</label><p>${s.region ? escapeHtml(s.region) : '—'}</p></div>
      <div class="ii"><label>Venue / Medium</label><p>${s.venue ? escapeHtml(s.venue) : '—'}</p></div>
      <div class="ii"><label>Teacher</label><p>${s.teacher ? escapeHtml(s.teacher) : '—'}</p></div>
      <div class="ii"><label>Co-Host</label><p>${s.co_host ? escapeHtml(s.co_host) : '—'}</p></div>
      <div class="ii"><label>Parents Invited</label><p>${escapeHtml(String(s.invited || 0))}</p></div>
      <div class="ii"><label>Attended</label><p>${s.attended !== '' && s.attended != null ? escapeHtml(String(s.attended)) : '—'}</p></div>
      <div class="ii"><label>Engagement</label><p>${s.engagement ? escapeHtml(s.engagement) : '—'}</p></div>
    </div>`;

      const readOnlyPost =
        isSessionClosed(s) && !canUpdate
          ? `
      <div class="divhr"></div>
      <div class="stl">Post-Activity Details</div>
      <div class="ig">
        <div class="ii"><label>Session Status</label><p>${s.session_status ? escapeHtml(s.session_status) : '—'}</p></div>
        <div class="ii"><label>Follow-Up Required</label><p>${s.follow_up ? escapeHtml(s.follow_up) : '—'}</p></div>
        <div class="ii"><label>Follow-Up Date</label><p>${escapeHtml(fmtDate(s.follow_up_date))}</p></div>
        <div class="ii" style="grid-column:1/-1"><label>Follow-Up Notes</label><p>${s.follow_up_notes ? escapeHtml(s.follow_up_notes) : '—'}</p></div>
        <div class="ii" style="grid-column:1/-1"><label>Remarks</label><p>${s.remarks ? escapeHtml(s.remarks) : '—'}</p></div>
      </div>`
          : '';

      if (!canUpdate) {
        return infoGrid + readOnlyPost;
      }

      const reschNote =
        s.status === 'Rescheduled' && s.remarks
          ? `<div class="fg full" style="margin-bottom:12px"><label>Reschedule reason</label><p style="margin:0;color:var(--po-text,#1a1a2e)">${escapeHtml(s.remarks)}</p></div>`
          : '';

      return `${infoGrid}
    <div class="divhr"></div>
    <div class="stl">Post-Activity Update</div>
    ${reschNote}
    ${speakerPostActionBarHtml(s)}

    <div id="upd-form-fields-${s.id}">
      ${speakerPostFieldsInnerHtml(s)}
    </div>
    <div style="display:flex;justify-content:flex-end">
      <button type="button" class="btn btn-p" id="btn-submit-${s.id}" data-po-submit="1" data-po-sid="${escapeAttr(s.id)}">Mark as Completed</button>
    </div>
  `;
    }

    function pickEng(sid, val) {
      _selEng[sid] = val;
      ['H', 'M', 'L'].forEach(v => {
        const b = document.getElementById(`eng-${v}-${sid}`);
        if (b) b.className = 'eb' + (v === val ? ' e' + v : '');
      });
    }

    /** Read post-activity control inside this session’s expand panel (avoids wrong field if ids ever duplicated). */
    function speakerField(sid, prefix) {
      const root = document.getElementById(`upd-form-fields-${sid}`);
      const id = `${prefix}-${sid}`;
      if (root) {
        const el = root.querySelector(`[id="${id}"]`);
        if (el) return el;
      }
      return document.getElementById(id);
    }

    function pickAction(sid, action) {
      _selAction[sid] = action;
      const actionBar = document.getElementById(`p-action-bar-${sid}`);
      if (actionBar) actionBar.querySelectorAll('.gb').forEach((btn) => btn.classList.remove('active'));
      const b = document.getElementById(`act-${action}-${sid}`);
      if (b) b.classList.add('active');

      /** Clear follow-up fields in memory as soon as user leaves “Completed” so the next PUT cannot send stale follow_up_date (server was validating merged rows against session date). */
      if (action === 'Rescheduled' || action === 'Cancelled') {
        const row = sessions.find((x) => x.id === sid);
        if (row) {
          row.follow_up = '';
          row.follow_up_date = '';
          row.follow_up_notes = '';
        }
      }

      const submitBtn = document.getElementById(`btn-submit-${sid}`);
      if (!submitBtn) return;
      applySpeakerActionLayout(sid, action);
      if (action === 'Completed') {
        submitBtn.textContent = 'Mark as Completed';
      } else {
        submitBtn.textContent = `Mark as ${action}`;
      }
    }

    function submitUpdate(sid) {
      const s = sessions.find(x => x.id === sid);
      if (!s) { toast('Session not found', 'error'); return; }

      const wasAlreadyCompleted = s.status === 'Completed';
      const action = _selAction[sid] || 'Completed';

      if (action === 'Completed') {
        const att = speakerField(sid, 'f-att')?.value?.trim();
        const eng = _selEng[sid] || s.engagement;
        const sts = speakerField(sid, 'f-sts')?.value;
        if (!att) { toast('Please enter number of parents attended', 'error'); return; }
        if (!eng) { toast('Please select engagement level', 'error'); return; }
        if (!sts) { toast('Please select overall session status', 'error'); return; }
        const invitedNum = Number(s.invited) || 0;
        const attNum = parseInt(att, 10);
        if (Number.isNaN(attNum) || attNum < 0) {
          toast('Enter a valid number of parents attended (0 or more).', 'error');
          return;
        }
        if (attNum > invitedNum) {
          const attEl = speakerField(sid, 'f-att');
          if (attEl) syncSpeakerAttendedError(attEl);
          toast(`Parents attended cannot be greater than parents invited (${invitedNum}).`, 'error');
          return;
        }
        const fu = speakerField(sid, 'f-fu')?.value || '';
        if (fu === 'Y') {
          const fud = speakerField(sid, 'f-fud')?.value?.trim() || '';
          const fun = speakerField(sid, 'f-fun')?.value?.trim() || '';
          const sessionDay = String(s.scheduled_date || '').trim();
          if (fud) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDay)) {
              toast('Session date is missing or invalid; cannot validate follow-up date.', 'error');
              return;
            }
            if (fud <= sessionDay) {
              toast('Follow-up date must be after the session date.', 'error');
              return;
            }
          }
          s.follow_up = 'Y';
          s.follow_up_date = fud;
          s.follow_up_notes = fun;
        } else {
          s.follow_up = fu === 'N' ? 'N' : '';
          s.follow_up_date = '';
          s.follow_up_notes = '';
        }
        s.attended = attNum;
        s.engagement = eng;
        s.session_status = sts;
        s.remarks = speakerField(sid, 'f-rem')?.value || '';
      } else if (action === 'Rescheduled') {
        const rem = speakerField(sid, 'f-rem')?.value?.trim() || '';
        if (!rem) {
          toast('Enter a reason for reschedule (Remarks).', 'error');
          return;
        }
        s.attended = 0;
        s.engagement = '';
        s.follow_up = '';
        s.follow_up_date = '';
        s.follow_up_notes = '';
        s.session_status = action;
        s.remarks = rem;
      } else {
        s.attended = 0;
        s.engagement = '';
        s.follow_up = '';
        s.follow_up_date = '';
        s.follow_up_notes = '';
        s.session_status = action;
        s.remarks = '';
      }

      s.status = action;
      s.update_action = action;
      delete _selEng[sid];
      delete _selAction[sid];
      openExpand[expandKey(sid, 'spk')] = false;
      openExpand[expandKey(sid, 'pmo')] = false;
      const doneMsg =
        wasAlreadyCompleted && action === 'Completed'
          ? 'Changes saved.'
          : `Session marked as ${action}!`;
      refreshData().then((ok) => {
        if (ok) toast(doneMsg, 'success');
      });
    }

    function aggregateByMonth(sessionList) {
      const map = Object.create(null);
      for (const s of sessionList) {
        const mk = sessionMonthKey(s);
        if (!map[mk]) {
          map[mk] = {
            scheduled: 0,
            planned: 0,
            completed: 0,
            rescheduled: 0,
            cancelled: 0,
            attended: 0,
            invited: 0,
          };
        }
        map[mk].scheduled += 1;
        if (s.status === 'Planned') map[mk].planned += 1;
        else if (s.status === 'Completed') {
          map[mk].completed += 1;
          map[mk].attended += parseInt(s.attended, 10) || 0;
        } else if (s.status === 'Rescheduled') {
          map[mk].rescheduled += 1;
        } else if (s.status === 'Cancelled') {
          map[mk].cancelled += 1;
        }
        map[mk].invited += Number(s.invited) || 0;
      }
      return Object.keys(map)
        .sort()
        .reverse()
        .map((k) => ({ monthKey: k, ...map[k] }));
    }

    function aggregateByBranch(sessionList) {
      const map = Object.create(null);
      for (const s of sessionList) {
        const b = String(s.branch || '').trim() || '(Branch not set)';
        if (!map[b]) map[b] = { scheduled: 0, completed: 0, attended: 0 };
        map[b].scheduled += 1;
        if (s.status === 'Completed') {
          map[b].completed += 1;
          map[b].attended += parseInt(s.attended, 10) || 0;
        }
      }
      return Object.keys(map)
        .sort((a, b) => a.localeCompare(b))
        .map((k) => ({ key: k, ...map[k] }));
    }

    function parseSessionGrades(s) {
      return String(s.grade || '')
        .split(',')
        .map((g) => g.trim())
        .filter(Boolean);
    }

    function gradeSortKey(g) {
      const m = /^G(\d+)$/i.exec(g);
      if (m) return parseInt(m[1], 10);
      return 999;
    }

    function aggregateByGrade(sessionList) {
      const map = Object.create(null);
      for (const s of sessionList) {
        const grades = parseSessionGrades(s);
        const buckets = grades.length ? grades : ['(Grade not set)'];
        const n = buckets.length;
        const isDone = s.status === 'Completed';
        const attended = isDone ? parseInt(s.attended, 10) || 0 : 0;
        const share = n > 0 ? attended / n : attended;
        for (const g of buckets) {
          if (!map[g]) map[g] = { scheduled: 0, completed: 0, attended: 0 };
          map[g].scheduled += 1;
          if (isDone) map[g].completed += 1;
          map[g].attended += share;
        }
      }
      return Object.keys(map)
        .sort((a, b) => gradeSortKey(a) - gradeSortKey(b) || a.localeCompare(b))
        .map((k) => ({ key: k, ...map[k] }));
    }

    function aggregateByRegion(sessionList) {
      const map = Object.create(null);
      for (const s of sessionList) {
        const r = String(s.region || '').trim() || '(Region not set)';
        if (!map[r]) map[r] = { scheduled: 0, completed: 0, attended: 0 };
        map[r].scheduled += 1;
        if (s.status === 'Completed') {
          map[r].completed += 1;
          map[r].attended += parseInt(s.attended, 10) || 0;
        }
      }
      return Object.keys(map)
        .sort((a, b) => a.localeCompare(b))
        .map((k) => ({ key: k, ...map[k] }));
    }

    function fmtDashAttended(n) {
      if (!Number.isFinite(n)) return '0';
      const r = Math.round(n);
      if (Math.abs(n - r) < 0.05) return String(r);
      return n.toFixed(1);
    }

    /**
     * @param {boolean} sumFooter - if true, show numeric totals row; if false, show grade-view footnote
     * @param {{ hideParentsAttended?: boolean }} [opts] - omit Parents attended column (month view: By grade only)
     */
    function dashboardTableHtml(title, keyLabel, rows, sumFooter, opts) {
      const hideAtt = Boolean(opts && opts.hideParentsAttended);
      if (!rows.length) {
        return `<div class="dash-panel"><div class="dash-panel-title">${escapeHtml(title)}</div><div class="empty" style="padding:14px">No data</div></div>`;
      }
      let ts = 0;
      let tc = 0;
      let ta = 0;
      const body = rows
        .map((row) => {
          ts += row.scheduled;
          tc += row.completed;
          if (!hideAtt) ta += row.attended;
          const attTd = hideAtt ? '' : `<td class="num">${fmtDashAttended(row.attended)}</td>`;
          return `<tr><td>${escapeHtml(row.key)}</td><td class="num">${row.scheduled}</td><td class="num">${row.completed}</td>${attTd}</tr>`;
        })
        .join('');
      const colSpan = hideAtt ? 3 : 4;
      const foot = sumFooter
        ? `<tfoot><tr><td>Total</td><td class="num">${ts}</td><td class="num">${tc}</td>${
            hideAtt ? '' : `<td class="num">${fmtDashAttended(ta)}</td>`
          }</tr></tfoot>`
        : `<tfoot><tr><td colspan="${colSpan}" class="dash-foot" style="padding:10px;background:#fafbfc">Totals above sum per-grade rows (a session with multiple grades appears once per grade). Compare with region totals for unique session counts.</td></tr></tfoot>`;
      const thAtt = hideAtt ? '' : '<th class="num">Parents attended</th>';
      return `<div class="dash-panel"><div class="dash-panel-title">${escapeHtml(title)}</div><div class="dash-table-wrap"><table class="dash-table" aria-label="${escapeAttr(title)}"><thead><tr><th>${escapeHtml(keyLabel)}</th><th class="num">Scheduled</th><th class="num">Completed</th>${thAtt}</tr></thead><tbody>${body}</tbody>${foot}</table></div></div>`;
    }

    function metricTilesHtmlForList(list) {
      const total = list.length;
      const planned = list.filter((s) => s.status === 'Planned').length;
      const done = list.filter((s) => s.status === 'Completed').length;
      const resch = list.filter((s) => s.status === 'Rescheduled').length;
      const canc = list.filter((s) => s.status === 'Cancelled').length;
      const inv = list.reduce((a, s) => a + (Number(s.invited) || 0), 0);
      const att = list.reduce((a, s) => a + (parseInt(s.attended, 10) || 0), 0);
      const rate = inv ? Math.round((att / inv) * 100) : 0;
      return `
    <div class="metric"><div class="mv">${total}</div><div class="ml">Sessions</div></div>
    <div class="metric"><div class="mv">${planned}</div><div class="ml">Planned</div></div>
    <div class="metric"><div class="mv">${done}</div><div class="ml">Completed</div></div>
    <div class="metric"><div class="mv">${resch}</div><div class="ml">Rescheduled</div></div>
    <div class="metric"><div class="mv">${canc}</div><div class="ml">Cancelled</div></div>
    <div class="metric"><div class="mv">${inv}</div><div class="ml">Parents invited</div></div>
    <div class="metric"><div class="mv">${att} <span style="font-size:13px;color:#888">(${rate}%)</span></div><div class="ml">Parents attended</div></div>
  `;
    }

    function sessionStatusCounts(list) {
      return {
        total: list.length,
        planned: list.filter((s) => s.status === 'Planned').length,
        completed: list.filter((s) => s.status === 'Completed').length,
        rescheduled: list.filter((s) => s.status === 'Rescheduled').length,
        cancelled: list.filter((s) => s.status === 'Cancelled').length,
        invited: list.reduce((a, s) => a + (Number(s.invited) || 0), 0),
        attended: list.reduce((a, s) => a + (parseInt(s.attended, 10) || 0), 0),
      };
    }

    function pmoMonthStackedBarHtml(r) {
      const total = Math.max(1, r.scheduled);
      const segs = [
        { w: (r.completed / total) * 100, cls: 'month-card__stack-seg--done', title: `Completed ${r.completed}` },
        { w: (r.planned / total) * 100, cls: 'month-card__stack-seg--plan', title: `Planned ${r.planned}` },
        { w: (r.rescheduled / total) * 100, cls: 'month-card__stack-seg--resch', title: `Rescheduled ${r.rescheduled}` },
        { w: (r.cancelled / total) * 100, cls: 'month-card__stack-seg--canc', title: `Cancelled ${r.cancelled}` },
      ].filter((s) => s.w > 0);
      return `<div class="month-card__stack" title="${escapeAttr(segs.map((s) => s.title).join(', '))}">${segs
            .map(
          (s) =>
            `<span class="month-card__stack-seg ${s.cls}" style="width:${s.w}%"></span>`
        )
        .join('')}</div>`;
    }

    function pmoTimelineSegHtml(w, cls, _label, count) {
      if (w <= 0 || !count) return '';
      return `<span class="pmo-mo-timeline-seg pmo-mo-timeline-seg--${cls}" style="width:${w}%"></span>`;
    }

    function pmoTimelineStatusItemsFromRowEl(row) {
      return [
        { cls: 'done', label: 'Completed', count: Number(row.dataset.completed) || 0 },
        { cls: 'plan', label: 'Planned', count: Number(row.dataset.planned) || 0 },
        { cls: 'resch', label: 'Rescheduled', count: Number(row.dataset.rescheduled) || 0 },
        { cls: 'canc', label: 'Cancelled', count: Number(row.dataset.cancelled) || 0 },
      ].filter((x) => x.count > 0);
    }

    function pmoTimelineSegLabelFromEl(seg) {
      if (seg.classList.contains('pmo-mo-timeline-seg--done')) return 'Completed';
      if (seg.classList.contains('pmo-mo-timeline-seg--plan')) return 'Planned';
      if (seg.classList.contains('pmo-mo-timeline-seg--resch')) return 'Rescheduled';
      if (seg.classList.contains('pmo-mo-timeline-seg--canc')) return 'Cancelled';
      return '';
    }

    function pmoTimelineFloatTipHtml(row, highlightLabel) {
      const month = row.dataset.monthLabel || '';
      const scheduled = Number(row.dataset.scheduled) || 0;
      const items = pmoTimelineStatusItemsFromRowEl(row);
      const lines = items.length
        ? items
            .map((x) => {
              const hi = highlightLabel === x.label ? ' pmo-mo-timeline-tip__line--hi' : '';
              return `<div class="pmo-mo-timeline-tip__line${hi}"><span class="pmo-mo-timeline-tip__dot pmo-mo-timeline-tip__dot--${x.cls}"></span>${escapeHtml(x.label)}: <strong>${x.count}</strong></div>`;
            })
            .join('')
        : '<div class="pmo-mo-timeline-tip__line">No sessions</div>';
      return `<div class="pmo-mo-timeline-tip__title">${escapeHtml(month)}</div>${lines}<div class="pmo-mo-timeline-tip__total">${scheduled} session${scheduled !== 1 ? 's' : ''} total</div>`;
    }

    let pmoTimelineFloatTipEl = null;

    function ensurePmoTimelineFloatTip() {
      if (pmoTimelineFloatTipEl) return pmoTimelineFloatTipEl;
      pmoTimelineFloatTipEl = document.createElement('div');
      pmoTimelineFloatTipEl.id = 'pmo-timeline-float-tip';
      pmoTimelineFloatTipEl.className = 'pmo-mo-timeline-float-tip';
      pmoTimelineFloatTipEl.setAttribute('role', 'tooltip');
      pmoTimelineFloatTipEl.hidden = true;
      document.body.appendChild(pmoTimelineFloatTipEl);
      return pmoTimelineFloatTipEl;
    }

    function positionPmoTimelineFloatTip(clientX, clientY) {
      const tip = pmoTimelineFloatTipEl;
      if (!tip || tip.hidden) return;
      const pad = 14;
      const rect = tip.getBoundingClientRect();
      let left = clientX + pad;
      let top = clientY - rect.height - pad;
      if (top < 8) top = clientY + pad;
      if (left + rect.width > window.innerWidth - 8) {
        left = Math.max(8, clientX - rect.width - pad);
      }
      if (left < 8) left = 8;
      tip.style.left = `${left}px`;
      tip.style.top = `${top}px`;
    }

    function initPmoTimelineFloatTip() {
      ensurePmoTimelineFloatTip();
      if (document.body.dataset.pmoTimelineTipInit === '1') return;
      document.body.dataset.pmoTimelineTipInit = '1';
      const tip = pmoTimelineFloatTipEl;

      document.addEventListener(
        'mousemove',
        (e) => {
          const hit = e.target.closest('.pmo-mo-timeline-row__track, .pmo-mo-timeline-seg');
          if (!hit) {
            tip.hidden = true;
            return;
          }
          const row = hit.closest('[data-pmo-timeline-row]');
          if (!row) {
            tip.hidden = true;
            return;
          }
          const seg = e.target.closest('.pmo-mo-timeline-seg');
          const highlight = seg ? pmoTimelineSegLabelFromEl(seg) : '';
          tip.innerHTML = pmoTimelineFloatTipHtml(row, highlight);
          tip.hidden = false;
          positionPmoTimelineFloatTip(e.clientX, e.clientY);
        },
        { passive: true }
      );

      document.addEventListener('scroll', () => {
        if (pmoTimelineFloatTipEl) pmoTimelineFloatTipEl.hidden = true;
      }, true);
    }

    function pmoTimelineRowHtml(r) {
      const total = Math.max(1, r.scheduled);
      const doneW = (r.completed / total) * 100;
      const planW = (r.planned / total) * 100;
      const reschW = (r.rescheduled / total) * 100;
      const cancW = (r.cancelled / total) * 100;
      const short = formatMonthLabel(r.monthKey).replace(/,?\s*\d{4}$/, '').trim();
      const monthLabel = formatMonthLabel(r.monthKey);
      return `<div class="pmo-mo-timeline-row" data-pmo-timeline-row="1"
        data-month-label="${escapeAttr(monthLabel)}"
        data-completed="${r.completed}"
        data-planned="${r.planned}"
        data-rescheduled="${r.rescheduled}"
        data-cancelled="${r.cancelled}"
        data-scheduled="${r.scheduled}">
        <span class="pmo-mo-timeline-row__label">${escapeHtml(short)}</span>
        <div class="pmo-mo-timeline-row__track-wrap">
          <div class="pmo-mo-timeline-row__track">
            ${pmoTimelineSegHtml(doneW, 'done', 'Completed', r.completed)}
            ${pmoTimelineSegHtml(planW, 'plan', 'Planned', r.planned)}
            ${pmoTimelineSegHtml(reschW, 'resch', 'Rescheduled', r.rescheduled)}
            ${pmoTimelineSegHtml(cancW, 'canc', 'Cancelled', r.cancelled)}
        </div>
        </div>
        <span class="num">${r.scheduled}</span>
      </div>`;
    }

    /**
     * India map markers: left/top are direct percentages within the visible India outline
     * on india-outline.svg (viewBox 666×777). Tuned visually against the rendered map.
     */
    const PMO_REGION_MAP_COORDS = [
      { name: 'Andhra Pradesh', left: 50, top: 60, short: 'A.P.' },
      { name: 'Bengaluru', left: 42, top: 67, short: 'Bengaluru' },
      { name: 'Chennai', left: 53, top: 70, short: 'Chennai' },
      { name: 'Delhi NCR', left: 42, top: 21, short: 'Delhi NCR' },
      { name: 'Haryana', left: 40, top: 23, short: 'Haryana' },
      { name: 'Maharashtra', left: 30, top: 48, short: 'Maharashtra' },
      { name: 'Punjab', left: 35, top: 16, short: 'Punjab' },
      { name: 'Rajasthan', left: 30, top: 30, short: 'Rajasthan' },
      { name: 'Rest of Karnataka', left: 38, top: 63, short: 'Karnataka' },
      { name: 'Rest of Tamil Nadu', left: 48, top: 78, short: 'Tamil Nadu' },
      { name: 'Telangana', left: 45, top: 53, short: 'Telangana' },
      { name: 'Uttar Pradesh', left: 50, top: 27, short: 'U.P.' },
      { name: 'Uttarakhand', left: 47, top: 18, short: 'Uttarakhand' },
      { name: 'West Bengal', left: 60, top: 33, short: 'W. Bengal' },
    ];

    const PMO_REGION_MAP_POS = Object.fromEntries(
      PMO_REGION_MAP_COORDS.map((r) => [r.name, { left: r.left, top: r.top, short: r.short }])
    );

    function pmoRegionMapSortedKeys() {
      return Object.keys(regionBranches).sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: 'base' })
      );
    }

    function pmoRegionMapPos(name) {
      return PMO_REGION_MAP_POS[name] || { left: 50, top: 50, short: name };
    }

    function poPublicAssetUrl(file) {
      const p = window.location.pathname || '';
      return p === '/pmo' || p.startsWith('/pmo/') ? `/pmo/${file}` : file;
    }

    let _pmoMapSelectedRegion = null;
    let _pmoMapHoverRegion = null;
    let pmoMapFloatTipEl = null;

    function branchesForRegion(region) {
      const raw = regionBranches[region];
      if (!raw) return [];
      return [...new Set(raw.map((b) => String(b).replace(/\s+/g, ' ').trim()).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: 'base' })
      );
    }

    function ensurePmoMapFloatTip() {
      if (pmoMapFloatTipEl) return pmoMapFloatTipEl;
      pmoMapFloatTipEl = document.createElement('div');
      pmoMapFloatTipEl.id = 'pmo-map-float-tip';
      pmoMapFloatTipEl.className = 'pmo-map-float-tip';
      pmoMapFloatTipEl.hidden = true;
      document.body.appendChild(pmoMapFloatTipEl);
      return pmoMapFloatTipEl;
    }

    function positionPmoMapFloatTip(clientX, clientY) {
      const tip = pmoMapFloatTipEl;
      if (!tip || tip.hidden) return;
      const pad = 8;
      const rect = tip.getBoundingClientRect();
      let left = clientX;
      let top = clientY - pad;
      if (top - rect.height < pad) top = clientY + rect.height * 0.2 + pad;
      if (left - rect.width / 2 < pad) left = pad + rect.width / 2;
      if (left + rect.width / 2 > window.innerWidth - pad) {
        left = window.innerWidth - pad - rect.width / 2;
      }
      tip.style.left = `${left}px`;
      tip.style.top = `${top}px`;
    }

    function pmoMapTipHtml(region) {
      const schools = branchesForRegion(region).length;
      return `<strong>${escapeHtml(region)}</strong>
        <span class="pmo-map-float-tip__line">${schools} school${schools !== 1 ? 's' : ''}</span>
        <span class="pmo-map-float-tip__hint">Click to view all branches</span>`;
    }

    function pmoRegionMapMarkersHtml() {
      return pmoRegionMapSortedKeys()
        .map((name) => {
          const pos = pmoRegionMapPos(name);
          const count = branchesForRegion(name).length;
          const active = _pmoMapSelectedRegion === name;
          const hover = _pmoMapHoverRegion === name && !active;
          const label = pos.short || name;
          return `<button type="button" class="pmo-map-marker-btn${active ? ' is-active' : ''}${hover ? ' is-hover' : ''}" data-pmo-map-region="${escapeAttr(name)}" style="left:${pos.left}%;top:${pos.top}%" aria-pressed="${active ? 'true' : 'false'}" aria-label="${escapeAttr(name)} — ${count} schools">
          <span class="pmo-map-marker-btn__pulse"></span>
          <span class="pmo-map-marker-btn__pin">
            <span class="pmo-map-marker-btn__dot"></span>
            <span class="pmo-map-marker-btn__count">${count}</span>
          </span>
          <span class="pmo-map-marker-btn__label">${escapeHtml(label)}</span>
        </button>`;
        })
        .join('');
    }

    function pmoRegionMapQuickPicksHtml() {
      const picks = Object.keys(regionBranches)
        .map((name) => ({ name, n: branchesForRegion(name).length }))
        .sort((a, b) => b.n - a.n)
        .slice(0, 6);
      return `<div class="pmo-map-quick-picks">
        <p class="pmo-region-map__empty">Hover a dot on the map for a preview, or click a region to list every school branch.</p>
        <p class="pmo-map-quick-picks__lbl">Popular regions</p>
        <div class="pmo-map-quick-picks__row">${picks
          .map(
            (p) =>
              `<button type="button" class="pmo-map-chip" data-pmo-map-region="${escapeAttr(p.name)}">${escapeHtml(p.name)} <span class="pmo-map-chip__n">${p.n}</span></button>`
          )
          .join('')}</div>
      </div>`;
    }

    function pmoRegionMapPanelHtml(region, branchFilter) {
      if (!region) return pmoRegionMapQuickPicksHtml();
      const branches = branchesForRegion(region);
      const q = String(branchFilter || '')
        .trim()
        .toLowerCase();
      const filtered = q ? branches.filter((b) => b.toLowerCase().includes(q)) : branches;
      const list =
        filtered.length > 0
          ? `<ul class="pmo-map-branch-list" id="pmo-map-branch-list">${filtered
              .map(
                (b) =>
                  `<li class="pmo-map-branch-item" data-branch-name="${escapeAttr(b)}"><span class="pmo-map-branch-item__name">${escapeHtml(b)}</span></li>`
              )
              .join('')}</ul>`
          : `<p class="pmo-region-map__empty">${q ? 'No schools match your search.' : 'No branches listed for this region.'}</p>`;
      return `<div class="pmo-region-map__panel-head">
        <div class="pmo-region-map__panel-head-row">
          <h4 class="pmo-region-map__panel-title">${escapeHtml(region)}</h4>
          <button type="button" class="btn btn-o btn-sm" data-pmo-map-clear title="Clear selection">Clear</button>
        </div>
        <p class="pmo-region-map__panel-meta"><strong>${branches.length}</strong> school${branches.length !== 1 ? 's' : ''} in this region</p>
      </div>
      <div class="pmo-map-panel-tools">
        <input type="search" class="pmo-map-search" data-pmo-map-search placeholder="Search schools in ${escapeAttr(region)}…" autocomplete="off" value="${escapeAttr(q)}">
        <span class="pmo-map-search-count" data-pmo-map-count>${filtered.length} shown</span>
      </div>
      ${list}`;
    }

    function pmoRegionMapCardHtml() {
      const chips = Object.keys(regionBranches)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
        .map((name) => {
          const active = _pmoMapSelectedRegion === name;
          const hover = _pmoMapHoverRegion === name && !active;
          const n = branchesForRegion(name).length;
          return `<button type="button" class="pmo-map-chip${active ? ' is-active' : ''}${hover ? ' is-hover' : ''}" data-pmo-map-region="${escapeAttr(name)}">${escapeHtml(name)} <span class="pmo-map-chip__n">${n}</span></button>`;
        })
            .join('');
      return `<div class="sales-chart-card sales-chart-card--wide pmo-region-map-card">
        <h3 class="sales-chart-title">Regions &amp; school branches</h3>
        <div class="pmo-region-map__body">
          <div class="pmo-region-map__viz">
            <div class="pmo-map-stage" tabindex="0" role="application" aria-label="Interactive map of India — use arrow keys to move between regions, Enter to select">
              <img class="pmo-map-img" src="${escapeAttr(poPublicAssetUrl('india-outline.svg'))}" width="667" height="777" alt="India outline" decoding="async">
              <div class="pmo-map-markers-overlay" aria-hidden="false">${pmoRegionMapMarkersHtml()}</div>
              <p class="pmo-map-hint">Hover for preview · Click to list schools · Arrow keys to browse</p>
            </div>
          </div>
          <div class="pmo-region-map__panel pmo-region-map__panel--interactive" id="pmo-map-branch-panel" aria-live="polite">
            ${pmoRegionMapPanelHtml(_pmoMapSelectedRegion)}
          </div>
        </div>
        <div class="pmo-map-region-chips" role="toolbar" aria-label="Select region">${chips}</div>
      </div>`;
    }

    function syncPmoMapHighlightStates() {
      const root = document.getElementById('analytics-overview-viz');
      if (!root) return;
      root.querySelectorAll('[data-pmo-map-region]').forEach((el) => {
        const name = el.getAttribute('data-pmo-map-region');
        const active = name === _pmoMapSelectedRegion;
        const hover = name === _pmoMapHoverRegion && !active;
        el.classList.toggle('is-active', active);
        el.classList.toggle('is-hover', hover);
        if (el.classList.contains('pmo-map-marker-btn') || el.classList.contains('pmo-map-chip')) {
          el.setAttribute('aria-pressed', active ? 'true' : 'false');
        }
      });
    }

    function refreshPmoMapMarkersOverlay() {
      const overlay = document.querySelector('#analytics-overview-viz .pmo-map-markers-overlay');
      if (overlay) overlay.innerHTML = pmoRegionMapMarkersHtml();
    }

    function updatePmoMapPanel(region, branchFilter, opts) {
      const panel = document.getElementById('pmo-map-branch-panel');
      if (!panel) return;
      const focusSearch = Boolean(opts && opts.focusSearch);
      panel.classList.remove('pmo-region-map__panel--pop');
      panel.innerHTML = pmoRegionMapPanelHtml(region, branchFilter);
      void panel.offsetWidth;
      panel.classList.add('pmo-region-map__panel--pop');
      if (focusSearch && region) {
        const search = panel.querySelector('[data-pmo-map-search]');
        search?.focus();
      }
    }

    function filterPmoMapBranches(query) {
      if (!_pmoMapSelectedRegion) return;
      updatePmoMapPanel(_pmoMapSelectedRegion, query);
    }

    function hoverPmoMapRegion(region) {
      _pmoMapHoverRegion = region || null;
      syncPmoMapHighlightStates();
      refreshPmoMapMarkersOverlay();
    }

    function hidePmoMapTip() {
      if (pmoMapFloatTipEl) pmoMapFloatTipEl.hidden = true;
    }

    function showPmoMapTip(region, clientX, clientY) {
      if (!region) {
        hidePmoMapTip();
        return;
      }
      const tip = ensurePmoMapFloatTip();
      tip.innerHTML = pmoMapTipHtml(region);
      tip.hidden = false;
      positionPmoMapFloatTip(clientX, clientY);
    }

    function updatePmoMapSelection(region, opts) {
      syncPmoMapHighlightStates();
      refreshPmoMapMarkersOverlay();
      updatePmoMapPanel(region, '', { focusSearch: Boolean(region && (!opts || opts.focusSearch !== false)) });
    }

    function stepPmoMapRegion(delta) {
      const keys = pmoRegionMapSortedKeys();
      if (!keys.length) return;
      let idx = _pmoMapSelectedRegion ? keys.indexOf(_pmoMapSelectedRegion) : -1;
      idx = (idx + delta + keys.length) % keys.length;
      selectPmoMapRegion(keys[idx]);
      const btn = document.querySelector(
        `#analytics-overview-viz .pmo-map-marker-btn[data-pmo-map-region="${escapeAttr(keys[idx])}"]`
      );
      btn?.focus();
    }

    function clearPmoMapSelection() {
      _pmoMapSelectedRegion = null;
      _pmoMapHoverRegion = null;
      hidePmoMapTip();
      updatePmoMapSelection(null);
    }

    function selectPmoMapRegion(region) {
      const name = String(region || '').trim();
      if (!name || !regionBranches[name]) return;
      _pmoMapSelectedRegion = name;
      hidePmoMapTip();
      updatePmoMapSelection(name);
    }

    function initPmoRegionMap() {
      ensurePmoMapFloatTip();
      if (document.body.dataset.pmoRegionMapInit === '1') return;
      document.body.dataset.pmoRegionMapInit = '1';

      document.addEventListener('click', (e) => {
        if (e.target.closest('[data-pmo-map-clear]')) {
          e.preventDefault();
          clearPmoMapSelection();
          return;
        }
        if (e.target.closest('.pmo-map-stage') && !e.target.closest('[data-pmo-map-region]')) {
          clearPmoMapSelection();
          return;
        }
        const hit = e.target.closest('#analytics-overview-viz [data-pmo-map-region]');
        if (!hit) return;
        selectPmoMapRegion(hit.getAttribute('data-pmo-map-region'));
      });

      document.addEventListener('keydown', (e) => {
        const onMap =
          e.target.closest('.pmo-map-stage') ||
          e.target.closest('#analytics-overview-viz [data-pmo-map-region]');
        if (onMap && (e.key === 'ArrowRight' || e.key === 'ArrowDown')) {
          e.preventDefault();
          stepPmoMapRegion(1);
          return;
        }
        if (onMap && (e.key === 'ArrowLeft' || e.key === 'ArrowUp')) {
          e.preventDefault();
          stepPmoMapRegion(-1);
          return;
        }
        if (e.key === 'Escape' && _pmoMapSelectedRegion) {
          const inMap = e.target.closest('#analytics-overview-viz .pmo-region-map-card');
          if (inMap) {
            e.preventDefault();
            clearPmoMapSelection();
          }
          return;
        }
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const hit = e.target.closest('#analytics-overview-viz [data-pmo-map-region]');
        if (!hit) return;
        e.preventDefault();
        selectPmoMapRegion(hit.getAttribute('data-pmo-map-region'));
      });

      document.addEventListener('mouseover', (e) => {
        const hit = e.target.closest('#analytics-overview-viz [data-pmo-map-region]');
        if (!hit) return;
        const name = hit.getAttribute('data-pmo-map-region');
        if (_pmoMapHoverRegion === name) return;
        hoverPmoMapRegion(name);
        showPmoMapTip(name, e.clientX, e.clientY);
      });

      document.addEventListener('mouseout', (e) => {
        const hit = e.target.closest('#analytics-overview-viz [data-pmo-map-region]');
        if (!hit) return;
        const name = hit.getAttribute('data-pmo-map-region');
        const rel = e.relatedTarget && e.relatedTarget.closest('[data-pmo-map-region]');
        if (rel && rel.getAttribute('data-pmo-map-region') === name) return;
        hoverPmoMapRegion(null);
        hidePmoMapTip();
      });

      document.addEventListener(
        'mousemove',
        (e) => {
          const hit = e.target.closest('#analytics-overview-viz .pmo-map-marker-btn[data-pmo-map-region]');
          if (!hit || pmoMapFloatTipEl?.hidden) return;
          const name = hit.getAttribute('data-pmo-map-region');
          if (name && name !== _pmoMapSelectedRegion) {
            showPmoMapTip(name, e.clientX, e.clientY);
          }
        },
        { passive: true }
      );

      document.addEventListener('input', (e) => {
        if (e.target.matches('[data-pmo-map-search]')) {
          filterPmoMapBranches(e.target.value);
        }
      });

      document.addEventListener('scroll', hidePmoMapTip, true);
    }

    function renderAnalyticsMonthGrid(rows) {
      if (!rows.length) {
        return '<div class="empty" style="padding:20px 12px">No sessions yet. Open <strong>New session</strong> to add plans.</div>';
      }
      return `<div class="analytics-month-pick"><h3>Pick a month</h3><div class="month-grid">${rows
        .map((r) => {
          const attPct = r.invited ? Math.round((r.attended / r.invited) * 100) : 0;
          return `<button type="button" class="month-card" data-pmo-month="${escapeAttr(r.monthKey)}">
        <div class="month-card-label">${escapeHtml(formatMonthLabel(r.monthKey))}</div>
        <div class="month-card__viz">${pmoMonthStackedBarHtml(r)}</div>
        <div class="month-card__kpis">
          <span><strong>${r.scheduled}</strong> sessions</span>
          <span><strong>${r.completed}</strong> done</span>
          <span class="month-card__att-pct">Parents: <strong>${r.attended}</strong> / ${r.invited} invited (${attPct}%)</span>
        </div>
      </button>`;
        })
        .join('')}</div></div>`;
    }

    function renderAnalyticsOverviewViz() {
      const root = document.getElementById('analytics-overview-viz');
      if (!root) return;
      if (!sessions.length) {
        root.innerHTML =
          '<div class="empty" style="padding:20px 12px">No sessions yet. Open <strong>New session</strong> to add plans.</div>';
        return;
      }
      const rows = aggregateByMonth(sessions);
      const all = sessionStatusCounts(sessions);
      const maxAtt = Math.max(1, ...rows.map((r) => (r.invited ? Math.round((r.attended / r.invited) * 100) : 0)));
      const attRowsHtml = rows
        .map((r) => {
          const pct = r.invited ? Math.round((r.attended / r.invited) * 100) : 0;
          const short = formatMonthLabel(r.monthKey).replace(/,?\s*\d{4}$/, '').trim();
          return `<div class="pmo-mo-att-row">
          <span>${escapeHtml(short)}</span>
          <div class="pmo-mo-att-row__bar"><span class="pmo-mo-att-row__fill" style="width:${Math.round((pct / maxAtt) * 100)}%"></span></div>
          <span class="num"><strong>${pct}%</strong></span>
        </div>`;
        })
        .join('');
      const totalStatus = Math.max(1, all.total);
      const statusSegs = [
        { value: Math.round((all.completed / totalStatus) * 100), color: '#16a34a' },
        { value: Math.round((all.planned / totalStatus) * 100), color: '#94a3b8' },
        { value: Math.round((all.rescheduled / totalStatus) * 100), color: '#3b82f6' },
        { value: Math.round((all.cancelled / totalStatus) * 100), color: '#ef4444' },
      ].filter((s) => s.value > 0);
      const donePct = all.total ? Math.round((all.completed / all.total) * 100) : 0;
      const attRateAll = all.invited ? Math.round((all.attended / all.invited) * 100) : 0;
      root.innerHTML = `
        <div class="analytics-overview-charts">
          <div class="sales-chart-card sales-chart-card--wide">
            <h3 class="sales-chart-title">Sessions by month (stacked status)</h3>
            <div class="pmo-mo-timeline">${rows.map(pmoTimelineRowHtml).join('')}</div>
            <div class="pmo-mo-legend">
              <span><i style="background:#16a34a"></i> Completed</span>
              <span><i style="background:#94a3b8"></i> Planned</span>
              <span><i style="background:#3b82f6"></i> Rescheduled</span>
              <span><i style="background:#ef4444"></i> Cancelled</span>
            </div>
          </div>
          <div class="sales-chart-card">
            <h3 class="sales-chart-title">All sessions — status mix</h3>
            <div class="sales-donut-wrap">
              ${salesDonutSvg(donePct, statusSegs.length ? statusSegs : [{ value: 100, color: '#e5e7eb' }])}
              <ul class="sales-donut-legend">
                <li><span class="sales-donut-swatch" style="background:#16a34a"></span> ${all.completed} completed</li>
                <li><span class="sales-donut-swatch" style="background:#94a3b8"></span> ${all.planned} planned</li>
                <li><span class="sales-donut-swatch" style="background:#3b82f6"></span> ${all.rescheduled} rescheduled</li>
                <li><span class="sales-donut-swatch" style="background:#ef4444"></span> ${all.cancelled} cancelled</li>
              </ul>
            </div>
          </div>
          <div class="sales-chart-card">
            <h3 class="sales-chart-title">Parent attendance rate by month</h3>
            <div class="pmo-mo-att-bars">${attRowsHtml}</div>
            <p class="card-lead" style="margin:10px 0 0;font-size:0.75rem">All months combined: <strong>${attRateAll}%</strong> (${all.attended} / ${all.invited} invited)</p>
          </div>
          ${pmoRegionMapCardHtml()}
        </div>
        ${renderAnalyticsMonthGrid(rows)}`;
      initPmoTimelineFloatTip();
      if (_pmoMapSelectedRegion) updatePmoMapSelection(_pmoMapSelectedRegion);
    }

    function renderAnalyticsMonthViz(list) {
      const el = document.getElementById('analytics-month-viz');
      if (!el) return;
      const c = sessionStatusCounts(list);
      const attPct = c.invited ? Math.round((c.attended / c.invited) * 100) : 0;
      const totalStatus = Math.max(1, c.total);
      const statusSegs = [
        { value: Math.round((c.completed / totalStatus) * 100), color: '#16a34a' },
        { value: Math.round((c.planned / totalStatus) * 100), color: '#94a3b8' },
        { value: Math.round((c.rescheduled / totalStatus) * 100), color: '#3b82f6' },
        { value: Math.round((c.cancelled / totalStatus) * 100), color: '#ef4444' },
      ].filter((s) => s.value > 0);
      const donePct = c.total ? Math.round((c.completed / c.total) * 100) : 0;
      el.innerHTML = `
        <div class="analytics-month-viz__grid">
          <div class="analytics-month-viz__kpi"><div class="analytics-month-viz__kpi-val">${c.total}</div><div class="analytics-month-viz__kpi-lbl">Sessions</div></div>
          <div class="analytics-month-viz__kpi"><div class="analytics-month-viz__kpi-val">${c.completed}</div><div class="analytics-month-viz__kpi-lbl">Completed</div></div>
          <div class="analytics-month-viz__kpi"><div class="analytics-month-viz__kpi-val">${c.planned}</div><div class="analytics-month-viz__kpi-lbl">Planned</div></div>
          <div class="analytics-month-viz__kpi"><div class="analytics-month-viz__kpi-val">${c.rescheduled}</div><div class="analytics-month-viz__kpi-lbl">Rescheduled</div></div>
          <div class="analytics-month-viz__kpi"><div class="analytics-month-viz__kpi-val">${c.cancelled}</div><div class="analytics-month-viz__kpi-lbl">Cancelled</div></div>
          <div class="analytics-month-viz__kpi"><div class="analytics-month-viz__kpi-val">${c.invited}</div><div class="analytics-month-viz__kpi-lbl">Parents invited</div></div>
          <div class="analytics-month-viz__kpi"><div class="analytics-month-viz__kpi-val">${c.attended}</div><div class="analytics-month-viz__kpi-lbl">Parents attended</div></div>
          <div class="analytics-month-viz__kpi"><div class="analytics-month-viz__kpi-val">${attPct}%</div><div class="analytics-month-viz__kpi-lbl">Attendance rate</div></div>
        </div>
        <div class="analytics-month-viz__charts">
          <div class="sales-chart-card">
            <h3 class="sales-chart-title">This month — status mix</h3>
            <div class="sales-donut-wrap">
              ${c.total ? salesDonutSvg(donePct, statusSegs.length ? statusSegs : [{ value: 100, color: '#e5e7eb' }]) : '<p class="empty" style="margin:0">No sessions</p>'}
              <ul class="sales-donut-legend">
                <li><span class="sales-donut-swatch" style="background:#16a34a"></span> ${c.completed} completed</li>
                <li><span class="sales-donut-swatch" style="background:#94a3b8"></span> ${c.planned} planned</li>
                <li><span class="sales-donut-swatch" style="background:#3b82f6"></span> ${c.rescheduled} rescheduled</li>
                <li><span class="sales-donut-swatch" style="background:#ef4444"></span> ${c.cancelled} cancelled</li>
              </ul>
            </div>
          </div>
          <div class="sales-chart-card">
            <h3 class="sales-chart-title">Parent attendance</h3>
            <div class="sales-donut-wrap">
              ${salesDonutSvg(attPct, [{ value: 100, color: attPct >= 60 ? '#16a34a' : '#f97316' }])}
              <ul class="sales-donut-legend">
                <li><span class="sales-donut-swatch" style="background:#f97316"></span> ${c.attended} attended</li>
                <li><span class="sales-donut-swatch" style="background:#e5e7eb"></span> ${Math.max(0, c.invited - c.attended)} not recorded</li>
                <li>Invited total: <strong>${c.invited}</strong></li>
              </ul>
            </div>
          </div>
        </div>`;
    }

    function setMetricContainerHtml(id, html) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = html;
    }

    function renderAnalyticsUI() {
      renderAnalyticsOverviewViz();
      const { month } = parsePmoHash();
      const panels = document.getElementById('analytics-detail-panels');
      const monthViz = document.getElementById('analytics-month-viz');
      if (month) {
        const filtered = sessions.filter((s) => sessionMonthKey(s) === month);
        renderAnalyticsMonthViz(filtered);
        const h = document.getElementById('analytics-detail-heading');
        if (h) h.textContent = formatMonthLabel(month);
        if (panels) {
          if (!filtered.length) {
            panels.innerHTML = '<p class="empty" style="padding:12px">No sessions in this month.</p>';
          } else {
            const byR = aggregateByRegion(filtered);
            const byB = aggregateByBranch(filtered);
            const byG = aggregateByGrade(filtered);
            panels.innerHTML =
              dashboardTableHtml('By region', 'Region', byR, true) +
              dashboardTableHtml('By branch', 'Branch', byB, true) +
              dashboardTableHtml('By grade', 'Grade', byG, false, { hideParentsAttended: true });
          }
        }
        renderPmoMonthTargets(month);
      } else {
        if (monthViz) monthViz.innerHTML = '';
        if (panels) panels.innerHTML = '';
        clearPmoTargetsSection();
      }
    }

    function renderMetrics() {
      setMetricContainerHtml('metrics', metricTilesHtmlForList(getPmoMeetingsFilteredList()));
    }

    /** PMO Scheduled meetings list after month, status, and search filters. */
    function getPmoMeetingsFilteredList() {
      const sf = document.getElementById('f-status')?.value || '';
      const monthF = String(document.getElementById('f-meetings-month')?.value || '').trim();
      const q = (document.getElementById('f-search')?.value || '').toLowerCase();
      let list = sessions;
      if (monthF) list = list.filter((s) => sessionMonthKey(s) === monthF);
      if (sf) list = list.filter((s) => s.status === sf);
      if (q) {
        list = list.filter(
          (s) =>
            (s.branch || '').toLowerCase().includes(q) ||
            (s.teacher || '').toLowerCase().includes(q) ||
            (s.region || '').toLowerCase().includes(q)
        );
      }
      return list;
    }

    function sessionRowHTML(s, speakerMode, cardIndex) {
      const pillCls = sessionStatusPillClass(s);
      const mode = speakerMode ? 'spk' : 'pmo';
      const key = expandKey(s.id, mode);
      const isOpen = openExpand[key];
      const delayStyle =
        speakerMode && typeof cardIndex === 'number'
          ? ` style="animation-delay:${Math.min(cardIndex, 14) * 0.05}s"`
          : '';
      return `
    <div class="srow"${delayStyle}>
      <div class="shead" data-po-row="1" data-po-sid="${escapeAttr(s.id)}" data-po-mode="${escapeAttr(mode)}" role="button" tabindex="0">
        <div class="smeta">
          <div class="strow">
            <span class="sname">${escapeHtml(s.branch || PO_TEXT.emDash)}</span>
            <span class="pill ${pillCls}">${escapeHtml(s.status)}</span>
            ${s.region ? `<span style="font-size:11px;color:#888">${escapeHtml(s.region)}</span>` : ''}
          </div>
          <div class="sdet">
            ${!speakerMode ? `<span title="Session id (UUID)">${PO_TEXT.iconId} <code style="font-size:11px;user-select:all;word-break:break-all">${escapeHtml(s.id)}</code></span>` : ''}
            <span>${PO_TEXT.iconCal} ${escapeHtml(fmtSessionScheduleSummary(s))}</span>
            <span>${PO_TEXT.iconPerson} ${escapeHtml(s.teacher || PO_TEXT.emDash)}${s.co_host ? ' + ' + escapeHtml(s.co_host) : ''}</span>
            ${s.venue ? `<span>${PO_TEXT.iconPin} ${escapeHtml(s.venue)}</span>` : ''}
            <span>Invited: <b>${escapeHtml(String(s.invited || 0))}</b></span>
            ${s.status === 'Completed' ? `<span>Attended: <b>${escapeHtml(String(s.attended))}</b></span>` : ''}
          </div>
        </div>
        <div class="sact">
          <button type="button" class="btn btn-o btn-sm" data-po-details="1" data-po-sid="${escapeAttr(s.id)}" data-po-mode="${escapeAttr(mode)}">Details <span class="arrow ${isOpen ? 'open' : ''}" id="arr-${mode}-${s.id}">${PO_TEXT.arrowDown}</span></button>
          ${!speakerMode && s.status === 'Planned'
          ? `<button type="button" class="btn btn-o btn-sm" data-po-edit="1" data-po-sid="${escapeAttr(s.id)}">Edit</button><button type="button" class="btn btn-d btn-sm" data-po-del="1" data-po-sid="${escapeAttr(s.id)}">Delete</button>`
          : ''}
        </div>
      </div>
      <div class="exp" id="exp-${mode}-${s.id}" style="display:${isOpen ? 'block' : 'none'}">
        ${isOpen ? buildExpandContent(s) : ''}
      </div>
    </div>`;
    }

    function pmoMeetingsEmptyHtml(list) {
      if (list.length) return '';
      if (!sessions.length) {
        return '<div class="empty">No sessions yet. Use <strong>New session</strong> to add a plan.</div>';
      }
      const monthF = String(document.getElementById('f-meetings-month')?.value || '').trim();
      const sf = document.getElementById('f-status')?.value || '';
      const q = (document.getElementById('f-search')?.value || '').trim();
      const parts = [];
      if (monthF) parts.push(`<strong>${escapeHtml(formatMonthLabel(monthF))}</strong>`);
      if (sf) parts.push(`status <strong>${escapeHtml(sf)}</strong>`);
      if (q) parts.push(`search “${escapeHtml(q)}”`);
      const hint = parts.length
        ? `No sessions match ${parts.join(', ')}. Try <strong>All months</strong> or change the filters.`
        : 'No sessions match the current filters. Try <strong>All months</strong>.';
      return `<div class="empty">${hint}</div>`;
    }

    function renderPMO() {
      applyPmoRoute();
      renderAnalyticsUI();
      populatePmoMeetingsMonthOptions();
      const { section, month } = parsePmoHash();
      if (section === 'meetings') {
        const sel = document.getElementById('f-meetings-month');
        if (sel) sel.value = month && /^\d{4}-\d{2}$/.test(month) ? month : '';
        syncMonthPickerByInputId('f-meetings-month');
      }
      const list = getPmoMeetingsFilteredList();
      renderMetrics();
      document.getElementById('count-lbl').textContent = `${list.length} session${list.length !== 1 ? 's' : ''}`;
      document.getElementById('pmo-list').innerHTML = list.length
        ? list.map(s => sessionRowHTML(s, false)).join('')
        : pmoMeetingsEmptyHtml(list);
    }

    function getSpeakerRouteMonth() {
      const route = parseAppRoute();
      if (route.name !== 'speaker') return null;
      return route.params.month || null;
    }

    function spkTriggerPanelAnimation(wrap) {
      if (!wrap || wrap.classList.contains('is-hidden')) return;
      wrap.classList.remove('spk-animate-in');
      void wrap.offsetWidth;
      wrap.classList.add('spk-animate-in');
    }

    function applySpeakerRoute() {
      const month = getSpeakerRouteMonth();
      const monthsWrap = document.getElementById('spk-months-wrap');
      const detailWrap = document.getElementById('spk-detail-wrap');
      if (!monthsWrap || !detailWrap) return;
      const showDetail = Boolean(month);
      monthsWrap.classList.toggle('is-hidden', showDetail);
      detailWrap.classList.toggle('is-hidden', !showDetail);
      const lbl = document.getElementById('spk-breadcrumb-label');
      if (lbl) lbl.textContent = month ? 'This month' : '';
      const h = document.getElementById('spk-detail-heading');
      if (h && month) h.textContent = formatMonthLabel(month);
      spkTriggerPanelAnimation(showDetail ? detailWrap : monthsWrap);
    }

    function speakerMonthStackHtml(r) {
      const total = Math.max(1, r.scheduled);
      const seg = (n, cls) => {
        const w = n > 0 ? Math.max(4, Math.round((n / total) * 100)) : 0;
        return w ? `<span class="spk-month-tile__seg ${cls}" style="flex:${w} 1 0"></span>` : '';
      };
      return (
        seg(r.completed, 'spk-month-tile__seg--done') +
        seg(r.planned, 'spk-month-tile__seg--plan') +
        seg(r.rescheduled, 'spk-month-tile__seg--resch') +
        seg(r.cancelled, 'spk-month-tile__seg--canc')
      );
    }

    function speakerMonthTileHtml(r, index) {
      const pendingBadge =
        r.planned > 0
          ? `<span class="spk-pending-badge"><span aria-hidden="true">⚡</span> ${r.planned} pending</span>`
          : '';
      const delay = Math.min(index, 12);
      return `<button type="button" class="spk-month-tile" data-spk-month="${escapeAttr(r.monthKey)}" style="animation-delay:${delay * 0.07}s">
        <div class="spk-month-tile__label">${escapeHtml(formatMonthLabel(r.monthKey))}</div>
        <div class="spk-month-tile__bar" aria-hidden="true">${speakerMonthStackHtml(r)}</div>
        <div class="spk-month-tile__kpis">
          <span>Total <strong>${r.scheduled}</strong></span>
          <span>Done <strong>${r.completed}</strong></span>
          <span>Pending <strong>${r.planned}</strong></span>
          <span>Resched. <strong>${r.rescheduled}</strong></span>
        </div>
        ${pendingBadge}
      </button>`;
    }

    function renderSpeakerDetailStats(list) {
      const el = document.getElementById('spk-detail-stats');
      if (!el) return;
      const pending = list.filter((s) => s.status === 'Planned').length;
      const completed = list.filter((s) => s.status === 'Completed').length;
      const rescheduled = list.filter((s) => s.status === 'Rescheduled').length;
      const cancelled = list.filter((s) => s.status === 'Cancelled').length;
      const pills = [
        { cls: 'spk-stat-pill--pending', label: 'Pending', val: pending, delay: 0 },
        { cls: 'spk-stat-pill--done', label: 'Completed', val: completed, delay: 1 },
        { cls: '', label: 'Rescheduled', val: rescheduled, delay: 2 },
        { cls: '', label: 'Cancelled', val: cancelled, delay: 3 },
      ];
      el.innerHTML = pills
        .map(
          (p) =>
            `<div class="spk-stat-pill ${p.cls}" style="animation-delay:${p.delay * 0.08}s"><strong>${p.val}</strong>${escapeHtml(p.label)}</div>`
        )
        .join('');
    }

    function speakerStatusLaneHtml(laneCls, icon, title, count, cardsHtml, laneDelay) {
      return `<section class="spk-status-lane spk-status-lane--${laneCls}" style="animation-delay:${laneDelay * 0.1}s">
        <div class="spk-status-lane__hd">
          <span class="spk-status-lane__icon" aria-hidden="true">${icon}</span>
          <h3 class="spk-status-lane__title">${escapeHtml(title)}</h3>
          <span class="spk-status-lane__count">${count}</span>
        </div>
        <div class="slist slist--spk-grid">${cardsHtml}</div>
      </section>`;
    }

    function renderSpeakerMonthGrid() {
      const grid = document.getElementById('spk-month-grid');
      if (!grid) return;
      if (!sessions.length) {
        grid.innerHTML =
          '<div class="spk-empty-state">No sessions yet. Ask PMO to add plans — your months will appear here with live progress.</div>';
        return;
      }
      const rows = aggregateByMonth(sessions).filter((r) => r.monthKey !== '_nodate');
      grid.innerHTML = rows.map((r, i) => speakerMonthTileHtml(r, i)).join('');
    }

    function renderSpeakerSessionList(list) {
      syncSpeakerSortControls();
      const { sortBy, sortDir } = getSpeakerSortPrefs();
      const pending = sortSessionsForSpeaker(
        list.filter((s) => s.status === 'Planned'),
        sortBy,
        sortDir
      );
      const completed = sortSessionsForSpeaker(
        list.filter((s) => s.status === 'Completed'),
        sortBy,
        sortDir
      );
      const rescheduled = sortSessionsForSpeaker(
        list.filter((s) => s.status === 'Rescheduled'),
        sortBy,
        sortDir
      );
      const cancelled = sortSessionsForSpeaker(
        list.filter((s) => s.status === 'Cancelled'),
        sortBy,
        sortDir
      );

      const tb = document.getElementById('spk-toolbar');
      if (tb) tb.hidden = list.length === 0;

      renderSpeakerDetailStats(list);

      let html = '';
      let lane = 0;
      let cardIdx = 0;
      if (pending.length) {
        html += speakerStatusLaneHtml(
          'pending',
          '⚡',
          'Pending update',
          pending.length,
          pending.map((s) => sessionRowHTML(s, true, cardIdx++)).join(''),
          lane++
        );
      }
      if (completed.length) {
        html += speakerStatusLaneHtml(
          'completed',
          '✓',
          'Completed',
          completed.length,
          completed.map((s) => sessionRowHTML(s, true, cardIdx++)).join(''),
          lane++
        );
      }
      if (rescheduled.length) {
        html += speakerStatusLaneHtml(
          'rescheduled',
          '↻',
          'Rescheduled',
          rescheduled.length,
          rescheduled.map((s) => sessionRowHTML(s, true, cardIdx++)).join(''),
          lane++
        );
      }
      if (cancelled.length) {
        html += speakerStatusLaneHtml(
          'cancelled',
          '×',
          'Cancelled',
          cancelled.length,
          cancelled.map((s) => sessionRowHTML(s, true, cardIdx++)).join(''),
          lane++
        );
      }
      const listEl = document.getElementById('spk-list');
      if (listEl) {
        listEl.innerHTML =
          html ||
          '<div class="spk-empty-state">No sessions in this month.</div>';
      }
    }

    function renderSpeaker() {
      applySpeakerRoute();
      const month = getSpeakerRouteMonth();
      if (!month) {
        renderSpeakerMonthGrid();
        return;
      }
      const filtered = sessions.filter((s) => sessionMonthKey(s) === month);
      renderSpeakerSessionList(filtered);
    }

    async function refreshSpeakerData() {
      if (poGetRole() !== 'speaker') return;
      const btn = document.getElementById('btn-speaker-refresh');
      if (btn?.disabled) return;
      if (btn) {
        btn.disabled = true;
        btn.setAttribute('aria-busy', 'true');
      }
      try {
        const ok = await pullSessionsFromServer();
        if (!ok) {
          toast('Could not refresh sessions. Check your connection.', 'warning');
          return;
        }
        renderSpeaker();
        toast('Sessions refreshed.', 'success', { autoClose: 2500 });
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.removeAttribute('aria-busy');
        }
      }
    }

    function currentCalendarMonthKey() {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      return `${y}-${m}`;
    }

    function parseSalesRoute() {
      const r = parseAppRoute();
      if (r.name === 'sales-admin') {
        const section = PO_SALES_SECTIONS.has(r.params.section) ? r.params.section : 'overview';
        return { section, month: r.params.month || null };
      }
      return { section: 'overview', month: null };
    }

    function buildSalesHash(section, monthKey) {
      const sec = PO_SALES_SECTIONS.has(section) ? section : 'overview';
      let path = `/sales-admin/${sec}`;
      if (monthKey && /^\d{4}-\d{2}$/.test(monthKey)) path += `/${monthKey}`;
      return `#${path}`;
    }

    function setSalesHash(section, monthKey) {
      const next = buildSalesHash(section, monthKey);
      if (location.hash !== next) location.hash = next;
      else {
        applySalesRoute();
        renderSalesAdmin();
      }
    }

    function getSalesSelectedMonth() {
      const el = document.getElementById('sales-month');
      const v = el ? String(el.value || '').trim() : '';
      if (/^\d{4}-\d{2}$/.test(v)) return v;
      const { month } = parseSalesRoute();
      if (month && /^\d{4}-\d{2}$/.test(month)) return month;
      return '';
    }

    function applySalesRoute() {
      const { section, month } = parseSalesRoute();
      const el = document.getElementById('sales-month');
      if (el) el.value = month && /^\d{4}-\d{2}$/.test(month) ? month : '';
      syncMonthPickerByInputId('sales-month');
      document.querySelectorAll('.sales-nav-btn').forEach((btn) => {
        btn.classList.toggle('is-active', btn.dataset.salesNav === section);
      });
      document.querySelectorAll('#view-sales-admin .sales-section').forEach((secEl) => {
        const on = secEl.dataset.salesSection === section;
        secEl.classList.toggle('is-hidden', !on);
        if (on) secEl.removeAttribute('hidden');
        else secEl.setAttribute('hidden', '');
      });
    }

    function salesSectionLabel(section) {
      if (section === 'targets') return 'Targets & schools';
      return 'Overview';
    }

    function salesSchoolKey(region, branch) {
      return `${String(region || '').trim()}\u0001${String(branch || '').trim()}`;
    }

    function salesCompletionProgressCell(actual, target) {
      const a = Number(actual) || 0;
      const t = Number(target) || 0;
      if (t <= 0) {
        return `<td class="num sales-td-actual"><span class="sales-meetings-count">${a}</span></td>`;
      }
      const pct = Math.min(100, Math.round((a / t) * 100));
      const met = a >= t;
      const fillClass = met ? 'sales-prog-fill is-met' : 'sales-prog-fill';
      const badge = met
        ? `<span class="sales-badge-met">${a} / ${t}</span>`
        : `<span class="sales-badge-pending">${a} / ${t}</span>`;
      return `<td class="num sales-td-actual"><div class="sales-prog-wrap">${badge}<div class="sales-prog-bar"><span class="${fillClass}" style="width:${pct}%"></span></div></div></td>`;
    }

    function fulfillmentMapFromPayload(payload) {
      const map = Object.create(null);
      const schools = payload && Array.isArray(payload.schools) ? payload.schools : [];
      for (const row of schools) {
        const key = salesSchoolKey(row.region, row.branch);
        map[key] = row;
      }
      return map;
    }

    function schoolFulfillmentPct(row) {
      const t = Number(row.target_completed) || 0;
      if (t <= 0) return null;
      const a = Number(row.actual_completed) || 0;
      return Math.min(100, Math.round((a / t) * 100));
    }

    function schoolsBelowThreshold(schools, thresholdPct) {
      const thr = Number(thresholdPct) || 50;
      return schools
        .filter((row) => {
          const t = Number(row.target_completed) || 0;
          if (t <= 0) return false;
          const pct = schoolFulfillmentPct(row);
          return pct !== null && pct < thr;
        })
        .sort((a, b) => (schoolFulfillmentPct(a) ?? 0) - (schoolFulfillmentPct(b) ?? 0));
    }

    function aggregateFulfillmentByRegion(schools) {
      const map = Object.create(null);
      for (const row of schools) {
        const region = String(row.region || '').trim() || '(Region not set)';
        if (!map[region]) {
          map[region] = {
            region,
            target_completed: 0,
            actual_scheduled: 0,
            actual_completed: 0,
            schools: [],
          };
        }
        map[region].target_completed += Number(row.target_completed) || 0;
        map[region].actual_scheduled += Number(row.actual_scheduled) || 0;
        map[region].actual_completed += Number(row.actual_completed) || 0;
        map[region].schools.push(row);
      }
      return Object.keys(map)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
        .map((k) => map[k]);
    }

    async function loadPmoFulfillment(month) {
      if (pmoFulfillmentCache && pmoFulfillmentCache.month === month) {
        return pmoFulfillmentCache.payload;
      }
      try {
        const r = await poApiFetch(`api/sales/fulfillment?month=${encodeURIComponent(month)}`);
        if (!r.ok) {
          pmoFulfillmentCache = null;
          return null;
        }
        const payload = await r.json();
        pmoFulfillmentCache = { month, payload };
        return payload;
      } catch (_) {
        pmoFulfillmentCache = null;
        return null;
      }
    }

    function clearPmoTargetsSection() {
      const section = document.getElementById('pmo-targets-section');
      const viz = document.getElementById('pmo-targets-viz');
      const regions = document.getElementById('pmo-targets-by-region');
      if (viz) {
        for (const id of ['pmo-targets-hero', 'pmo-targets-kpis', 'pmo-targets-charts', 'pmo-targets-focus']) {
          const el = document.getElementById(id);
          if (el) el.innerHTML = '';
        }
      }
      if (regions) regions.innerHTML = '';
      if (section) section.classList.add('is-hidden');
      pmoFulfillmentCache = null;
    }

    function pmoSchoolCardHtml(row) {
      const tier = schoolFulfillmentTier(row);
      const pct = schoolFulfillmentPct(row) ?? 0;
      const ringColor = tier === 'below' ? '#ef4444' : tier === 'met' ? '#16a34a' : '#3b82f6';
      const deg = Math.min(100, pct) * 3.6;
      const ac = Number(row.actual_completed) || 0;
      const tc = Number(row.target_completed) || 0;
      return `<article class="pmo-school-card pmo-school-card--${tier}">
        <div class="pmo-school-card__ring" style="background:conic-gradient(${ringColor} ${deg}deg,#e5e7eb 0)">${pct}%</div>
        <div class="pmo-school-card__name">${escapeHtml(row.branch)}</div>
        <div class="pmo-school-card__region">${escapeHtml(row.region)}</div>
        <div class="pmo-school-card__stat">${ac} / ${tc} completed</div>
      </article>`;
    }

    function renderPmoTargetsHero(summary) {
      const el = document.getElementById('pmo-targets-hero');
      if (!el) return;
      const s = summary || {};
      const target = Number(s.target_completed) || 0;
      const completed = Number(s.actual_completed) || 0;
      const scheduled = Number(s.actual_scheduled) || 0;
      const pct = target > 0 ? Math.min(100, Math.round((completed / target) * 100)) : 0;
      const barCls = pct >= 100 ? ' pmo-targets-hero__bar-fill--met' : '';
      const donut =
        target > 0
          ? salesDonutSvg(pct, [{ value: 100, color: pct >= 100 ? '#16a34a' : '#f97316' }])
          : salesDonutSvg(0, [{ value: 100, color: '#e5e7eb' }]);
      el.innerHTML = `
        <div class="sales-donut-wrap" style="flex-shrink:0">${donut}</div>
        <div class="pmo-targets-hero__copy">
          <h4 class="pmo-targets-hero__title">Monthly target fulfillment</h4>
          <p class="pmo-targets-hero__sub">All schools combined — completed parent orientation meetings vs Sales Admin targets for this month.</p>
          <div class="pmo-targets-hero__bar" aria-hidden="true"><span class="pmo-targets-hero__bar-fill${barCls}" style="width:${pct}%"></span></div>
          <p class="pmo-targets-hero__nums">
            <strong>${completed}</strong> completed · <strong>${target}</strong> target · <strong>${scheduled}</strong> scheduled
            ${target > 0 ? ` · <strong>${pct}%</strong> of combined targets` : ''}
          </p>
        </div>`;
      }

    function renderPmoTargetsKpis(summary, schools) {
      const el = document.getElementById('pmo-targets-kpis');
      if (!el) return;
      const s = summary || {};
      const withTarget = schools.filter((row) => Number(row.target_completed) > 0);
      let met = 0;
      let below = 0;
      let track = 0;
      for (const row of withTarget) {
        const tier = schoolFulfillmentTier(row);
        if (tier === 'met') met += 1;
        else if (tier === 'below') below += 1;
        else track += 1;
      }
      el.innerHTML = `
        <div class="pmo-target-kpi"><div class="pmo-target-kpi__val">${Number(s.target_completed) || 0}</div><div class="pmo-target-kpi__lbl">Combined target</div></div>
        <div class="pmo-target-kpi"><div class="pmo-target-kpi__val pmo-target-kpi__val--warn">${Number(s.actual_completed) || 0}</div><div class="pmo-target-kpi__lbl">Completed</div></div>
        <div class="pmo-target-kpi"><div class="pmo-target-kpi__val pmo-target-kpi__val--risk">${below}</div><div class="pmo-target-kpi__lbl">Below 50%</div></div>
        <div class="pmo-target-kpi"><div class="pmo-target-kpi__val pmo-target-kpi__val--ok">${met}</div><div class="pmo-target-kpi__lbl">Target met</div></div>
        <div class="pmo-target-kpi"><div class="pmo-target-kpi__val">${track}</div><div class="pmo-target-kpi__lbl">On track</div></div>`;
    }

    function renderPmoTargetsCharts(payload) {
      const el = document.getElementById('pmo-targets-charts');
      if (!el) return;
      const schools = payload && Array.isArray(payload.schools) ? payload.schools : [];
      const withTarget = schools.filter((s) => Number(s.target_completed) > 0);
      let met = 0;
      let track = 0;
      let below = 0;
      for (const row of withTarget) {
        const tier = schoolFulfillmentTier(row);
        if (tier === 'met') met += 1;
        else if (tier === 'below') below += 1;
        else track += 1;
      }
      const totalTier = Math.max(1, met + track + below);
      const segMet = Math.round((met / totalTier) * 100);
      const segTrack = Math.round((track / totalTier) * 100);
      const segBelow = Math.round((below / totalTier) * 100);
      const segRemainder = 100 - segMet - segTrack - segBelow;
      const donutSegs =
        withTarget.length > 0
          ? [
              { value: segMet, color: '#16a34a' },
              { value: segTrack, color: '#3b82f6' },
              { value: segBelow + Math.max(0, segRemainder), color: '#ef4444' },
            ].filter((s) => s.value > 0)
          : [{ value: 100, color: '#e5e7eb' }];
      const statusRows = [
        { label: 'Target met (100%+)', count: met, cls: 'met' },
        { label: 'On track (50–99%)', count: track, cls: 'track' },
        { label: 'Below 50%', count: below, cls: 'risk' },
      ];
      const maxStatus = Math.max(1, met, track, below);
      const barSchools = withTarget
        .map((row) => ({
          row,
          pct: schoolFulfillmentPct(row) ?? 0,
          tier: schoolFulfillmentTier(row),
        }))
        .sort((a, b) => a.pct - b.pct);
      const schoolBarsHtml = barSchools.length
        ? barSchools
            .map(({ row, pct, tier }) => {
              const cls =
                tier === 'below'
                  ? ' sales-school-bar-row--below'
                  : tier === 'met'
                    ? ' sales-school-bar-row--met'
                    : '';
              return `<div class="sales-school-bar-row${cls}">
              <span class="sales-school-bar-row__label" title="${escapeAttr(row.branch + ' · ' + row.region)}">${escapeHtml(row.branch)}</span>
              <span class="num">${pct}%</span>
              <div class="sales-school-bar-row__track"><span class="sales-school-bar-row__fill" style="width:${Math.min(100, pct)}%"></span></div>
            </div>`;
            })
            .join('')
        : '<p class="pmo-focus-panel__empty" style="margin:0">No school targets set for this month.</p>';
      const mixPct = withTarget.length ? Math.round((met / withTarget.length) * 100) : 0;
      el.innerHTML = `
        <div class="sales-chart-card">
          <h3 class="sales-chart-title">School mix</h3>
          <div class="sales-donut-wrap">
            ${withTarget.length ? salesDonutSvg(mixPct, donutSegs) : salesDonutSvg(0, [{ value: 100, color: '#e5e7eb' }])}
            <ul class="sales-donut-legend">
              <li><span class="sales-donut-swatch" style="background:#16a34a"></span> ${met} met target</li>
              <li><span class="sales-donut-swatch" style="background:#3b82f6"></span> ${track} on track</li>
              <li><span class="sales-donut-swatch" style="background:#ef4444"></span> ${below} below 50%</li>
            </ul>
          </div>
        </div>
        <div class="sales-chart-card">
          <h3 class="sales-chart-title">Count by status</h3>
          <div class="sales-status-bars">
            ${statusRows
              .map(
                (st) => `<div class="sales-status-row">
              <span>${st.label}</span>
              <div class="sales-status-row__bar"><span class="sales-status-row__fill sales-status-row__fill--${st.cls}" style="width:${Math.round((st.count / maxStatus) * 100)}%"></span></div>
              <span class="num"><strong>${st.count}</strong></span>
            </div>`
              )
              .join('')}
          </div>
        </div>
        <div class="sales-chart-card sales-chart-card--wide">
          <h3 class="sales-chart-title">Every school — lowest completion first</h3>
          <div class="sales-school-bars">${schoolBarsHtml}</div>
        </div>`;
    }

    function renderPmoTargetsFocus(schools) {
      const el = document.getElementById('pmo-targets-focus');
      if (!el) return;
      const withTarget = schools.filter((row) => Number(row.target_completed) > 0);
      const below = withTarget
        .filter((row) => schoolFulfillmentTier(row) === 'below')
        .sort((a, b) => (schoolFulfillmentPct(a) ?? 0) - (schoolFulfillmentPct(b) ?? 0));
      const met = withTarget
        .filter((row) => schoolFulfillmentTier(row) === 'met')
        .sort((a, b) => String(a.branch).localeCompare(String(b.branch), undefined, { sensitivity: 'base' }));
      const track = withTarget
        .filter((row) => schoolFulfillmentTier(row) === 'track')
        .sort((a, b) => (schoolFulfillmentPct(a) ?? 0) - (schoolFulfillmentPct(b) ?? 0));
      const belowGrid = below.length
        ? `<div class="pmo-focus-school-grid">${below.map(pmoSchoolCardHtml).join('')}</div>`
        : '<p class="pmo-focus-panel__empty">No schools below 50% of target.</p>';
      const metGrid = met.length
        ? `<div class="pmo-focus-school-grid">${met.map(pmoSchoolCardHtml).join('')}</div>`
        : '<p class="pmo-focus-panel__empty">No schools have met target yet.</p>';
      const trackGrid = track.length
        ? `<div class="pmo-focus-school-grid">${track.map(pmoSchoolCardHtml).join('')}</div>`
        : '<p class="pmo-focus-panel__empty">No schools in the 50–99% range.</p>';
      el.innerHTML = `
        <section class="pmo-focus-panel pmo-focus-panel--below" aria-label="Schools below target">
          <div class="pmo-focus-panel__head">
            <h4 class="pmo-focus-panel__title">Below target</h4>
            <span class="pmo-focus-panel__count">${below.length}</span>
          </div>
          ${belowGrid}
        </section>
        <section class="pmo-focus-panel pmo-focus-panel--track" aria-label="Schools on track">
          <div class="pmo-focus-panel__head">
            <h4 class="pmo-focus-panel__title">On track (50–99%)</h4>
            <span class="pmo-focus-panel__count">${track.length}</span>
          </div>
          ${trackGrid}
        </section>
        <section class="pmo-focus-panel pmo-focus-panel--met" aria-label="Schools that met target">
          <div class="pmo-focus-panel__head">
            <h4 class="pmo-focus-panel__title">Target met</h4>
            <span class="pmo-focus-panel__count">${met.length}</span>
          </div>
          ${metGrid}
        </section>`;
    }

    function renderPmoTargetsViz(payload) {
      const schools = payload && Array.isArray(payload.schools) ? payload.schools : [];
      const summary = payload && payload.summary ? payload.summary : {};
      renderPmoTargetsHero(summary);
      renderPmoTargetsKpis(summary, schools);
      renderPmoTargetsCharts(payload);
      renderPmoTargetsFocus(schools);
    }

    function renderPmoTargetsByRegion(payload) {
      const root = document.getElementById('pmo-targets-by-region');
      if (!root) return;
      const fulfillMap = fulfillmentMapFromPayload(payload);
      const regions = Object.keys(regionBranches).sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: 'base' })
      );
      if (!regions.length) {
        root.innerHTML = '<div class="empty">No schools configured.</div>';
        return;
      }
      let html = '';
      for (const region of regions) {
        const branches = regionBranches[region] || [];
        const uniqueBranches = [...new Set(branches.map((b) => String(b).trim()).filter(Boolean))];
        let regionTarget = 0;
        let regionScheduledA = 0;
        let regionCompletedA = 0;
        const rowData = uniqueBranches.map((branch) => {
          const key = salesSchoolKey(region, branch);
          const f = fulfillMap[key] || {
            region,
            branch,
            target_completed: 0,
            actual_scheduled: 0,
            actual_completed: 0,
          };
          const tc = Number(f.target_completed) || 0;
          const as = Number(f.actual_scheduled) || 0;
          const ac = Number(f.actual_completed) || 0;
          regionTarget += tc;
          regionScheduledA += as;
          regionCompletedA += ac;
          const tier = schoolFulfillmentTier({ target_completed: tc, actual_completed: ac });
          const pct = schoolFulfillmentPct({ target_completed: tc, actual_completed: ac });
          return { branch, tc, as, ac, tier, pct: pct ?? -1 };
        });
        rowData.sort((a, b) => {
          const order = { below: 0, track: 1, none: 2, met: 3 };
          const d = (order[a.tier] ?? 2) - (order[b.tier] ?? 2);
          if (d !== 0) return d;
          return a.pct - b.pct;
        });
        const rows = rowData
          .map(({ branch, tc, as, ac, tier }) => {
            const rowCls =
              tier === 'below' ? ' sales-row--below' : tier === 'met' ? ' sales-row--met' : '';
            const badge = salesStatusBadgeHtml(tier);
            return `<tr class="sales-row${rowCls}">
              <td>${escapeHtml(branch)} ${badge}</td>
              <td class="num sales-td-target">${tc}</td>
              <td class="num sales-td-actual"><span class="sales-meetings-count">${as}</span></td>
              <td class="num sales-td-actual"><span class="sales-meetings-count">${ac}</span></td>
              ${salesCompletionProgressCell(ac, tc)}
            </tr>`;
          })
          .join('');
        html += `<section class="sales-region">
          <button type="button" class="sales-region-hd" aria-expanded="false">
            <span>${escapeHtml(region)}</span>
            <span class="sec-sub">Completed ${regionCompletedA}/${regionTarget} · ${regionScheduledA} scheduled</span>
          </button>
          <div class="sales-region-body is-collapsed">
            <div class="dash-table-wrap">
              <table class="dash-table" aria-label="${escapeAttr(region)} schools">
                <thead>
                  <tr>
                    <th>School</th>
                    <th class="num sales-th-target">Completion target</th>
                    <th class="num sales-th-actual">Meetings scheduled</th>
                    <th class="num sales-th-actual">Meetings completed</th>
                    <th class="num sales-th-actual">Completed vs target</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </div>
        </section>`;
      }
      root.innerHTML = html;
    }

    async function renderPmoMonthTargets(month) {
      const section = document.getElementById('pmo-targets-section');
      if (!section || !month) {
        clearPmoTargetsSection();
        return;
      }
      section.classList.remove('is-hidden');
      const vizIds = ['pmo-targets-hero', 'pmo-targets-kpis', 'pmo-targets-charts', 'pmo-targets-focus'];
      for (const id of vizIds) {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<p class="card-lead" style="margin:0">Loading targets…</p>';
      }
      const regionsEl = document.getElementById('pmo-targets-by-region');
      if (regionsEl) regionsEl.innerHTML = '';
      const payload = await loadPmoFulfillment(month);
      if (!payload) {
        for (const id of vizIds) {
          const el = document.getElementById(id);
          if (el) {
            el.innerHTML =
              '<p class="empty" style="margin:0">Could not load target data. Check database connection.</p>';
          }
        }
        if (regionsEl) regionsEl.innerHTML = '';
        return;
      }
      renderPmoTargetsViz(payload);
      renderPmoTargetsByRegion(payload);
    }

    function countSessionsBySchoolForMonth(sessionList, month) {
      const map = Object.create(null);
      for (const s of sessionList) {
        if (month && sessionMonthKey(s) !== month) continue;
        const region = String(s.region || '').trim();
        const branch = String(s.branch || '').trim();
        if (!region || !branch) continue;
        const key = `${region}\u0001${branch}`;
        if (!map[key]) map[key] = { region, branch, scheduled: 0, completed: 0 };
        const status = String(s.status || '').trim();
        if (status === 'Completed') map[key].completed += 1;
        else if (status === 'Planned' || status === 'Rescheduled') map[key].scheduled += 1;
      }
      return map;
    }

    function buildClientFulfillmentPayload(month, sessionList, targetRows) {
      const actualMap = countSessionsBySchoolForMonth(sessionList, month || null);
      const targetMap = Object.create(null);
      for (const t of targetRows || []) {
        const key = `${t.region}\u0001${t.branch}`;
        targetMap[key] = t;
      }
      const keys = new Set([...Object.keys(actualMap), ...Object.keys(targetMap)]);
      const schools = [];
      for (const key of keys) {
        const actual = actualMap[key] || {
          region: targetMap[key]?.region || key.split('\u0001')[0] || '',
          branch: targetMap[key]?.branch || key.split('\u0001')[1] || '',
          scheduled: 0,
          completed: 0,
        };
        const tgt = targetMap[key] || { target_completed: 0 };
        schools.push({
          region: actual.region || '',
          branch: actual.branch || '',
          target_completed: tgt.target_completed || 0,
          actual_scheduled: actual.scheduled || 0,
          actual_completed: actual.completed || 0,
        });
      }
      schools.sort(
        (a, b) =>
          a.region.localeCompare(b.region, undefined, { sensitivity: 'base' }) ||
          a.branch.localeCompare(b.branch, undefined, { sensitivity: 'base' })
      );
      const summary = schools.reduce(
        (acc, row) => {
          acc.target_completed += row.target_completed;
          acc.actual_scheduled += row.actual_scheduled;
          acc.actual_completed += row.actual_completed;
          if (row.target_completed > 0 && row.actual_completed >= row.target_completed) {
            acc.schools_met += 1;
          }
          if (row.target_completed > 0) acc.schools_with_targets += 1;
          return acc;
        },
        {
          target_completed: 0,
          actual_scheduled: 0,
          actual_completed: 0,
          schools_met: 0,
          schools_with_targets: 0,
        }
      );
      summary.completion_pct =
        summary.target_completed > 0
          ? Math.min(100, Math.round((summary.actual_completed / summary.target_completed) * 100))
          : null;
      summary.target_met =
        summary.target_completed > 0 && summary.actual_completed >= summary.target_completed;
      return { month: month || '', summary, schools };
    }

    async function loadSalesFulfillment() {
      const month = getSalesSelectedMonth();
      if (!month) {
        salesFulfillmentCache = buildClientFulfillmentPayload('', sessions, []);
        return true;
      }
      try {
        const r = await poApiFetch(`api/sales/fulfillment?month=${encodeURIComponent(month)}`);
        if (!r.ok) {
          salesFulfillmentCache = null;
          return false;
        }
        salesFulfillmentCache = await r.json();
        return true;
      } catch (_) {
        salesFulfillmentCache = null;
        return false;
      }
    }

    function captureSalesTargetsSnapshot() {
      const snap = {};
      document.querySelectorAll('[data-sales-school-target]').forEach((inp) => {
        const region = inp.dataset.region || '';
        const branch = inp.dataset.branch || '';
        if (!region || !branch) return;
        snap[salesSchoolKey(region, branch)] = Math.max(0, parseInt(String(inp.value || '0'), 10) || 0);
      });
      return snap;
    }

    function salesTargetsHaveUnsavedChanges() {
      if (!salesTargetsSavedSnapshot) return false;
      const cur = captureSalesTargetsSnapshot();
      const keys = new Set([
        ...Object.keys(salesTargetsSavedSnapshot),
        ...Object.keys(cur),
      ]);
      for (const k of keys) {
        if ((salesTargetsSavedSnapshot[k] || 0) !== (cur[k] || 0)) return true;
      }
      return false;
    }

    function syncSalesSaveTargetsButton() {
      const btn = document.getElementById('btn-sales-save-targets');
      if (!btn) return;
      const dirty = salesTargetsHaveUnsavedChanges();
      btn.disabled = !dirty;
      btn.setAttribute('aria-disabled', dirty ? 'false' : 'true');
    }

    function resetSalesTargetsSavedSnapshot() {
      salesTargetsSavedSnapshot = captureSalesTargetsSnapshot();
      syncSalesSaveTargetsButton();
    }

    async function saveSalesTargets() {
      const btn = document.getElementById('btn-sales-save-targets');
      if (btn?.disabled) return;
      const month = getSalesSelectedMonth();
      if (!month) {
        toast('Select a month to edit targets.', 'warning');
        return;
      }
      const targets = [];
      document.querySelectorAll('[data-sales-school-target]').forEach((inp) => {
        const region = inp.dataset.region || '';
        const branch = inp.dataset.branch || '';
        if (!region || !branch) return;
        targets.push({
          region,
          branch,
          target_completed: Math.max(0, parseInt(String(inp.value || '0'), 10) || 0),
        });
      });
      try {
        const r = await poApiFetch('api/sales/targets', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ month, targets }),
        });
        if (!r.ok) {
          toast('Could not save targets.', 'error');
          return;
        }
        await loadSalesFulfillment();
        renderSalesAdmin();
        resetSalesTargetsSavedSnapshot();
        toast('Targets updated successfully for this month.', 'success');      } catch (_) {
        toast('Could not save targets.', 'error');
      }
    }

    function schoolInitials(name) {
      const parts = String(name || '')
        .trim()
        .split(/[\s\-]+/)
        .filter(Boolean);
      if (!parts.length) return '??';
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }

    function schoolLastUpdatedLabel(region, branch, month) {
      const list = schoolSessionsForSalesPanel(region, branch, month);
      if (!list.length) return '—';
      const latest = list.reduce((a, b) => (sessionSortTimestamp(a) > sessionSortTimestamp(b) ? a : b));
      const ts = sessionSortTimestamp(latest);
      if (!ts) return '—';
      const diff = Date.now() - ts;
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return 'Just now';
      if (mins < 60) return `${mins} mins ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 48) return `${hrs} hrs ago`;
      const days = Math.floor(hrs / 24);
      return `${days} day${days === 1 ? '' : 's'} ago`;
    }

    function getSalesSchoolSearch() {
      const el = document.getElementById('sales-school-search');
      return el ? String(el.value || '').trim().toLowerCase() : '';
    }

    function populateSalesRegionFilter(payload) {
      const sel = document.getElementById('sales-region-filter');
      if (!sel) return;
      const prev = sel.value;
      const regions = new Set();
      const schools = payload && Array.isArray(payload.schools) ? payload.schools : [];
      for (const row of schools) {
        const r = String(row.region || '').trim();
        if (r) regions.add(r);
      }
      const sorted = [...regions].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
      sel.innerHTML =
        '<option value="">All regions</option>' +
        sorted.map((r) => `<option value="${escapeAttr(r)}">${escapeHtml(r)}</option>`).join('');
      if (prev && sorted.includes(prev)) sel.value = prev;
    }

    function getSalesRegionFilter() {
      const sel = document.getElementById('sales-region-filter');
      return sel ? String(sel.value || '').trim() : '';
    }

    function salesFilteredSchools(payload) {
      return payload && Array.isArray(payload.schools) ? payload.schools : [];
    }

    /** Count targets set vs not set across the full school catalog (210 schools). */
    function salesCatalogTargetCounts(payload) {
      const fulfillMap = fulfillmentMapFromPayload(payload);
      let targetsSet = 0;
      let targetsNotSet = 0;
      for (const region of Object.keys(regionBranches)) {
        const branches = [
          ...new Set((regionBranches[region] || []).map((b) => String(b).trim()).filter(Boolean)),
        ];
        for (const branch of branches) {
          const tc = Number((fulfillMap[salesSchoolKey(region, branch)] || {}).target_completed) || 0;
          if (tc > 0) targetsSet += 1;
          else targetsNotSet += 1;
        }
      }
      return { targetsSet, targetsNotSet };
    }

    /** Overview risk chart: 80%+ on-track, 50–79% moderate, &lt;50% critical */
    function salesDashRiskTier(row) {
      const t = Number(row.target_completed) || 0;
      if (t <= 0) return 'none';
      const pct = schoolFulfillmentPct(row);
      if (pct >= 80) return 'ontrack';
      if (pct >= 50) return 'moderate';
      return 'critical';
    }

    function salesTableStatusBadge(tier) {
      if (tier === 'met') return '<span class="sales-pill--met">Target Met</span>';
      if (tier === 'below') return '<span class="sales-pill--below">Below 50%</span>';
      if (tier === 'track') return '<span class="sales-pill--track">On track</span>';
      return '<span class="sales-pill--track" style="opacity:0.7">No target</span>';
    }

    /** Figma Overall Progress: ring = completion %, legend rows below donut */
    function salesOverallProgressDonutSvg(pct) {
      const p = Math.max(0, Math.min(100, pct));
      const cx = 96;
      const cy = 96;
      const ringR = 72;
      const stroke = 22;
      const c = 2 * Math.PI * ringR;
      const completedLen = (p / 100) * c;
      const pendingLen = c - completedLen;
      return `<svg class="sales-progress-donut" viewBox="0 0 192 192" role="img" aria-label="Overall progress ${p} percent completed">
        <circle cx="${cx}" cy="${cy}" r="${ringR}" fill="none" stroke="#fff4e6" stroke-width="${stroke}"/>
        <circle cx="${cx}" cy="${cy}" r="${ringR}" fill="none" stroke="#f97316" stroke-width="${stroke}" stroke-linecap="butt"
          stroke-dasharray="${completedLen} ${pendingLen}" transform="rotate(-90 ${cx} ${cy})"/>
        <circle cx="${cx}" cy="${cy}" r="52" fill="#fff" filter="url(#salesDonutInnerShadow)"/>
        <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-family="'Nunito', 'Segoe UI', sans-serif" font-size="36" font-weight="800" fill="#f97316">${p}%</text>
        <text x="${cx}" y="${cy + 18}" text-anchor="middle" font-family="'Nunito', 'Segoe UI', sans-serif" font-size="12" font-weight="500" fill="#9a3412" letter-spacing="0.6">Completed</text>
        <defs>
          <filter id="salesDonutInnerShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.06"/>
          </filter>
        </defs>
      </svg>`;
    }

    const SALES_KPI_GLYPHS = ['◎', '◷', '✓', '%'];

    /** Topic mini graphics for KPI cards (same slot/size as former sparklines). */
    function salesKpiTopicGraphic(idx, level) {
      const w = 120;
      const h = 44;
      const p = Math.min(1, Math.max(0.08, Number(level) || 0.35));
      const orange = '#f97316';
      const orangeSoft = 'rgba(249, 115, 22, 0.22)';
      const orangeFade = 'rgba(249, 115, 22, 0.08)';
      if (idx === 0) {
        const bars = [0.45, 0.72, 0.55 + p * 0.35].map((f, i) => {
          const bw = 18;
          const x = 14 + i * 32;
          const bh = 8 + f * 28;
          return `<rect x="${x}" y="${h - 6 - bh}" width="${bw}" height="${bh}" rx="4" fill="${i === 2 ? orange : orangeSoft}"/>`;
        });
        return `<svg class="sales-kpi-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${bars.join('')}</svg>`;
      }
      if (idx === 1) {
        const cx = 28;
        const cy = 22;
        const r = 14;
        const tick = Math.round(p * 8);
        let marks = '';
        for (let i = 0; i < 8; i++) {
          const a = (-Math.PI / 2) + (i / 8) * Math.PI * 1.5;
          const x1 = cx + Math.cos(a) * (r - 2);
          const y1 = cy + Math.sin(a) * (r - 2);
          const x2 = cx + Math.cos(a) * (r + 3);
          const y2 = cy + Math.sin(a) * (r + 3);
          marks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${i < tick ? orange : orangeSoft}" stroke-width="2" stroke-linecap="round"/>`;
        }
        return `<svg class="sales-kpi-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${orangeFade}" stroke-width="3"/>
          <line x1="${cx}" y1="${cy}" x2="${cx + 4}" y2="${cy - 8}" stroke="${orange}" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="${cx}" y1="${cy}" x2="${cx + 10}" y2="${cy + 2}" stroke="${orangeSoft}" stroke-width="2" stroke-linecap="round"/>
          ${marks}
          <rect x="52" y="10" width="58" height="8" rx="4" fill="${orangeFade}"/>
          <rect x="52" y="24" width="42" height="8" rx="4" fill="${orangeSoft}"/>
          <rect x="52" y="38" width="28" height="6" rx="3" fill="${orangeFade}"/>
        </svg>`;
      }
      if (idx === 2) {
        const n = 5;
        let blocks = '';
        const filled = Math.max(1, Math.round(p * n));
        for (let i = 0; i < n; i++) {
          const x = 10 + i * 22;
          const on = i < filled;
          blocks += `<rect x="${x}" y="14" width="16" height="16" rx="4" fill="${on ? orangeSoft : orangeFade}"/>`;
          if (on) {
            blocks += `<path d="M${x + 4} ${22} L${x + 7} ${25} L${x + 12} ${18}" fill="none" stroke="${orange}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
          }
        }
        return `<svg class="sales-kpi-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${blocks}</svg>`;
      }
      const cx = 60;
      const cy = 38;
      const r = 26;
      const c = Math.PI * r;
      const filled = p * c;
      return `<svg class="sales-kpi-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke="${orangeFade}" stroke-width="8" stroke-linecap="round"/>
        <path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" fill="none" stroke="${orange}" stroke-width="8" stroke-linecap="round"
          stroke-dasharray="${filled.toFixed(1)} ${c.toFixed(1)}"/>
        <circle cx="${cx - 18}" cy="${cy - 6}" r="3" fill="${orangeSoft}"/>
        <circle cx="${cx}" cy="${cy - 10}" r="3" fill="${orange}"/>
        <circle cx="${cx + 18}" cy="${cy - 6}" r="3" fill="${orangeFade}"/>
      </svg>`;
    }

    function renderSalesSummary(summary) {
      const s = summary || {
        target_completed: 0,
        actual_scheduled: 0,
        actual_completed: 0,
      };
      const pct =
        s.target_completed > 0
          ? Math.min(100, Math.round((s.actual_completed / s.target_completed) * 100))
          : 0;
      const pctLabel = s.target_completed > 0 ? `${pct}%` : '—';
      const targetNorm = Math.min(1, (Number(s.target_completed) || 0) / 50);
      const schedNorm = Math.min(1, (Number(s.actual_scheduled) || 0) / Math.max(1, s.target_completed || 1));
      const doneNorm = Math.min(1, (Number(s.actual_completed) || 0) / Math.max(1, s.target_completed || 1));
      const rateNorm = s.target_completed > 0 ? pct / 100 : 0.15;
      const kpis = [
        { badge: 'Targets', badgeCls: 'sales-kpi-card__badge--up', label: 'Total targets', value: s.target_completed, idx: 0, spark: targetNorm || 0.45 },
        { badge: 'Scheduled', badgeCls: 'sales-kpi-card__badge--static', label: 'Meetings scheduled', value: s.actual_scheduled, idx: 1, spark: schedNorm || 0.2 },
        { badge: 'Completed', badgeCls: 'sales-kpi-card__badge--hot', label: 'Meetings completed', value: s.actual_completed, idx: 2, spark: doneNorm || 0.25 },
        { badge: 'Rate', badgeCls: 'sales-kpi-card__badge--up', label: 'Completion %', value: pctLabel, idx: 3, spark: rateNorm },
      ];
      setMetricContainerHtml(
        'sales-summary-metrics',
        kpis
          .map(
            (k) => `<div class="sales-kpi-card">
            <div class="sales-kpi-card__top">
              <span class="sales-kpi-card__icon sales-kpi-card__icon--glyph" aria-hidden="true">${SALES_KPI_GLYPHS[k.idx]}</span>
              <span class="sales-kpi-card__badge ${k.badgeCls}">${escapeHtml(k.badge)}</span>
            </div>
            <div class="sales-kpi-card__label">${escapeHtml(k.label)}</div>
            <div class="sales-kpi-card__value">${escapeHtml(String(k.value))}</div>
            ${salesKpiTopicGraphic(k.idx, k.spark)}
          </div>`
          )
          .join('')
      );
    }

    /** Overview charts only: 80% on-track threshold (targets tab keeps schoolFulfillmentTier). */
    function salesChartFulfillmentTier(row) {
      const t = Number(row.target_completed) || 0;
      if (t <= 0) return 'none';
      const pct = schoolFulfillmentPct(row);
      if (pct >= 100) return 'met';
      if (pct < 80) return 'below';
      return 'track';
    }

    function schoolFulfillmentTier(row) {
      const t = Number(row.target_completed) || 0;
      if (t <= 0) return 'none';
      const pct = schoolFulfillmentPct(row);
      if (pct >= 100) return 'met';
      if (pct < 50) return 'below';
      return 'track';
    }

    function salesStatusBadgeHtml(tier, opts) {
      const figma = opts && opts.figma;
      if (tier === 'below') {
        return `<span class="sales-badge-status sales-badge-status--below">${figma ? 'BELOW 50%' : 'Below 50%'}</span>`;
      }
      if (tier === 'met') {
        return `<span class="sales-badge-status sales-badge-status--met">${figma ? 'TARGET MET' : 'Target met'}</span>`;
      }
      return '';
    }

    function schoolSessionsForSalesPanel(region, branch, month) {
      const r = String(region || '').trim();
      const b = String(branch || '').trim();
      return sessions.filter((s) => {
        if (month && sessionMonthKey(s) !== month) return false;
        if (String(s.region || '').trim() !== r) return false;
        if (String(s.branch || '').trim() !== b) return false;
        const st = String(s.status || '').trim();
        return st === 'Completed' || st === 'Planned' || st === 'Rescheduled';
      });
    }

    function captureSalesOpenMeetingDetails() {
      const open = new Set();
      document.querySelectorAll('.sales-meetings-detail:not(.is-hidden)').forEach((tr) => {
        if (tr.id) open.add(tr.id);
      });
      return open;
    }

    function restoreSalesOpenMeetingDetails(open) {
      if (!open || !open.size) return;
      for (const id of open) {
        const detail = document.getElementById(id);
        const btn = document.querySelector(`[aria-controls="${id}"]`);
        if (detail) detail.classList.remove('is-hidden');
        if (btn) btn.setAttribute('aria-expanded', 'true');
      }
    }

    function renderSalesStudentIdsHtml(s) {
      const ids = s && Array.isArray(s.student_ids) ? s.student_ids : [];
      if (!ids.length) {
        return '<span class="sales-student-empty">No student IDs recorded yet (students join via share link).</span>';
      }
      const chips = ids.map((id) => `<span class="sales-student-chip">${escapeHtml(id)}</span>`).join('');
      return `<div class="sales-student-ids">${chips}</div>`;
    }

    function salesMeetingCardHtml(s, opts) {
      const pending = Boolean(opts && opts.pending);
      const idCount = Array.isArray(s.student_ids) ? s.student_ids.length : 0;
      const statusLbl = pending
        ? `<span class="sales-meeting-card__status sales-meeting-card__status--pending">${escapeHtml(s.status)}</span>`
        : '';
      const meta = pending
        ? `Student IDs from join (live): <strong>${idCount}</strong> · Invited: <strong>${escapeHtml(String(s.invited || 0))}</strong>`
        : `Parents attended (recorded): <strong>${parseInt(s.attended, 10) || 0}</strong> · Student IDs from join: <strong>${idCount}</strong>`;
      return `<article class="sales-meeting-card${pending ? ' sales-meeting-card--pending' : ''}">
            <div class="sales-meeting-card__head">${escapeHtml(fmtSessionScheduleSummary(s))} ${statusLbl}</div>
            <div class="sales-meeting-card__meta">${meta}</div>
            ${renderSalesStudentIdsHtml(s)}
          </article>`;
    }

    function renderSalesMeetingsPanel(region, branch, month, fulfillHint) {
      const list = schoolSessionsForSalesPanel(region, branch, month);
      if (!list.length) {
        const sched = fulfillHint ? Number(fulfillHint.scheduled) || 0 : 0;
        const done = fulfillHint ? Number(fulfillHint.completed) || 0 : 0;
        if (sched > 0 || done > 0) {
          return `<p class="sales-student-empty" style="margin:0">This school has <strong>${sched}</strong> scheduled and <strong>${done}</strong> completed meeting(s). Click <strong>↻ Refresh</strong> above to load booking details and live student IDs.</p>`;
        }
        return `<p class="sales-student-empty" style="margin:0">No meetings${month ? ' this month' : ''}.</p>`;
      }
      const sorted = [...list].sort((a, b) => sessionSortTimestamp(b) - sessionSortTimestamp(a));
      const pending = sorted.filter((s) => s.status === 'Planned' || s.status === 'Rescheduled');
      const completed = sorted.filter((s) => s.status === 'Completed');
      let html = '';
      if (pending.length) {
        html += `<p class="sales-meetings-panel__title">Pending bookings · live student IDs</p>${pending.map((s) => salesMeetingCardHtml(s, { pending: true })).join('')}`;
      }
      if (completed.length) {
        html += `<p class="sales-meetings-panel__title">Completed meetings · student IDs</p>${completed.map((s) => salesMeetingCardHtml(s, { pending: false })).join('')}`;
      }
      return html;
    }

    async function ensureSchoolMeetingDetails(region, branch, month, fulfillHint) {
      let list = schoolSessionsForSalesPanel(region, branch, month);
      const sched = fulfillHint ? Number(fulfillHint.scheduled) || 0 : 0;
      const done = fulfillHint ? Number(fulfillHint.completed) || 0 : 0;
      if (!list.length && (sched > 0 || done > 0)) {
        await pullSessionsFromServer();
      }
      return renderSalesMeetingsPanel(region, branch, month, fulfillHint);
    }

    function salesDonutSvg(pctComplete, segments) {
      const r = 42;
      const c = 2 * Math.PI * r;
      let offset = 0;
      const arcs = segments
        .map((seg) => {
          const len = (seg.value / 100) * c;
          const dash = `${len} ${c - len}`;
          const el = `<circle cx="60" cy="60" r="${r}" fill="none" stroke="${seg.color}" stroke-width="14" stroke-dasharray="${dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 60 60)"/>`;
          offset += len;
          return el;
        })
        .join('');
      return `<svg class="sales-donut" viewBox="0 0 120 120" role="img" aria-label="Overall completion ${pctComplete} percent">
        <circle cx="60" cy="60" r="${r}" fill="none" stroke="#f1f5f9" stroke-width="14"/>
        ${arcs}
        <text x="60" y="56" text-anchor="middle" font-size="18" font-weight="700" fill="#1e3a5f">${pctComplete}%</text>
        <text x="60" y="72" text-anchor="middle" font-size="9" fill="#64748b">completed</text>
      </svg>`;
    }

    function renderSalesCharts(payload) {
      const el = document.getElementById('sales-charts-root');
      if (!el) return;
      const schools = salesFilteredSchools(payload);
      const summary = payload && payload.summary ? payload.summary : {};
      const target = Number(summary.target_completed) || 0;
      const completed = Number(summary.actual_completed) || 0;
      const pctOverall =
        target > 0 ? Math.min(100, Math.round((completed / target) * 100)) : 0;

      const { targetsSet, targetsNotSet } = salesCatalogTargetCounts(payload);
      let metCount = 0;
      let trackCount = 0;
      let belowCount = 0;
      for (const row of schools) {
        const t = Number(row.target_completed) || 0;
        if (t <= 0) continue;
        const tier = schoolFulfillmentTier(row);
        if (tier === 'met') metCount += 1;
        else if (tier === 'below') belowCount += 1;
        else if (tier === 'track') trackCount += 1;
      }

      const riskRows = [
        { label: 'Target met', count: metCount, cls: 'met', labelCls: 'met' },
        { label: 'On track', count: trackCount, cls: 'track', labelCls: 'track' },
        { label: 'Below 50%', count: belowCount, cls: 'critical', labelCls: 'critical' },
      ];
      const maxRisk = Math.max(1, metCount, trackCount, belowCount);

      function salesStatusItemHtml(st) {
        const pct = Math.round((st.count / maxRisk) * 100);
        return `<div class="sales-status-item">
          <div class="sales-status-item__head">
            <span class="sales-status-item__label sales-status-item__label--${st.labelCls}">${escapeHtml(st.label)}</span>
            <span class="sales-status-item__count"><span class="sales-status-item__num">${st.count}</span> Schools</span>
          </div>
          <div class="sales-status-item__track" role="presentation">
            <span class="sales-status-item__fill sales-status-item__fill--${st.cls}" style="width:${pct}%"></span>
          </div>
        </div>`;
      }

      el.innerHTML = `
        <div class="sales-insight-card sales-progress-card">
          <div class="sales-insight-card__head">
            <h3 class="sales-insight-card__title">Overall Progress</h3>
          </div>
          <div class="sales-progress-card__viz">
            ${salesOverallProgressDonutSvg(pctOverall)}
            <ul class="sales-progress-legend">
              <li class="sales-progress-legend__row">
                <span class="sales-progress-legend__label">
                  <span class="sales-progress-legend__dot sales-progress-legend__dot--active"></span>
                  Targets set
                </span>
                <span class="sales-progress-legend__value">${targetsSet} Schools</span>
              </li>
              <li class="sales-progress-legend__row">
                <span class="sales-progress-legend__label">
                  <span class="sales-progress-legend__dot sales-progress-legend__dot--pending"></span>
                  Targets not set
                </span>
                <span class="sales-progress-legend__value">${targetsNotSet} Schools</span>
              </li>
            </ul>
          </div>
        </div>
        <div class="sales-insight-card sales-status-card">
          <div class="sales-insight-card__head">
            <h3 class="sales-insight-card__title">Schools by Status</h3>
            <div class="sales-status-legend" aria-hidden="true">
              <span><i class="met"></i> Target met</span>
              <span><i class="track"></i> On track</span>
              <span><i class="critical"></i> Below 50%</span>
            </div>
          </div>
          <div class="sales-status-list">
            ${riskRows.map(salesStatusItemHtml).join('')}
          </div>
        </div>`;
    }

    function renderSalesAlerts(payload) {
      const el = document.getElementById('sales-alerts-root');
      if (!el) return;
      const schools = payload && Array.isArray(payload.schools) ? payload.schools : [];
      let critical = 0;
      let met = 0;
      const regionBelow = Object.create(null);
      for (const row of schools) {
        const tier = schoolFulfillmentTier(row);
        if (tier === 'below') {
          critical += 1;
          const r = String(row.region || '').trim() || 'Other';
          regionBelow[r] = (regionBelow[r] || 0) + 1;
        }
        if (tier === 'met') met += 1;
      }
      let worstRegion = '';
      let worstCount = 0;
      for (const [r, n] of Object.entries(regionBelow)) {
        if (n > worstCount) {
          worstCount = n;
          worstRegion = r;
        }
      }
      const criticalMsg =
        critical > 0
          ? `${critical} school${critical === 1 ? '' : 's'} below 50% completion — review targets and speaker follow-up.`
          : 'No schools are in critical range this month.';
      const regionMsg =
        worstRegion && worstCount > 0
          ? `${worstRegion} has ${worstCount} school${worstCount === 1 ? '' : 's'} below 50% — highest concentration in one region.`
          : 'Regional performance is evenly distributed.';
      const successMsg =
        met > 0
          ? `${met} school${met === 1 ? ' has' : 's have'} met completion targets this month.`
          : 'No schools have met targets yet — keep momentum on scheduled sessions.';

      el.innerHTML = `
        <div class="sales-alert-card sales-alert-card--critical">
          <span class="sales-alert-card__icon" aria-hidden="true">!</span>
          <div class="sales-alert-card__body">
            <strong>Critical performance alert</strong>
            ${escapeHtml(criticalMsg)}
          </div>
        </div>
        <div class="sales-alert-card sales-alert-card--warn">
          <span class="sales-alert-card__icon" aria-hidden="true">⚠</span>
          <div class="sales-alert-card__body">
            <strong>Regional drop</strong>
            ${escapeHtml(regionMsg)}
          </div>
        </div>
        <div class="sales-alert-card sales-alert-card--success">
          <span class="sales-alert-card__icon" aria-hidden="true">✓</span>
          <div class="sales-alert-card__body">
            <strong>Success milestone</strong>
            ${escapeHtml(successMsg)}
          </div>
        </div>`;
    }

    function renderSalesSchoolTable(payload, month) {
      const root = document.getElementById('sales-school-table-root');
      const pager = document.getElementById('sales-school-table-pager');
      if (!root || !pager) return;

      const schools = salesFilteredSchools(payload)
        .filter((row) => Number(row.target_completed) > 0)
        .map((row) => ({
          row,
          pct: schoolFulfillmentPct(row) ?? 0,
          tier: schoolFulfillmentTier(row),
        }))
        .sort((a, b) => a.pct - b.pct);

      const total = schools.length;
      const totalPages = Math.max(1, Math.ceil(total / SALES_TABLE_PAGE_SIZE));
      if (salesTablePage >= totalPages) salesTablePage = totalPages - 1;
      if (salesTablePage < 0) salesTablePage = 0;
      const start = salesTablePage * SALES_TABLE_PAGE_SIZE;
      const pageRows = schools.slice(start, start + SALES_TABLE_PAGE_SIZE);

      if (!total) {
        root.innerHTML =
          '<p class="sales-student-empty" style="margin:12px">Set school targets on the <strong>Targets &amp; schools</strong> tab to see performance rows.</p>';
        pager.innerHTML = '';
        return;
      }

      const rowsHtml = pageRows
        .map(({ row, pct, tier }) => {
          const fillCls =
            tier === 'met' ? 'is-met' : tier === 'below' ? 'is-critical' : tier === 'track' ? 'is-moderate' : '';
          return `<tr>
            <td><div class="sales-school-name-cell"><span class="sales-school-avatar">${escapeHtml(schoolInitials(row.branch))}</span><span>${escapeHtml(row.branch)}</span></div></td>
            <td>
              <div class="sales-table-prog">
                <span class="num" style="min-width:2.5rem;text-align:left">${pct}%</span>
                <div class="sales-table-prog__bar"><span class="sales-table-prog__fill ${fillCls}" style="width:${Math.min(100, pct)}%"></span></div>
              </div>
            </td>
            <td>${salesTableStatusBadge(tier)}</td>
          </tr>`;
        })
        .join('');

      root.innerHTML = `<table class="sales-school-table" aria-label="School-wise performance">
        <thead>
          <tr>
            <th>School name</th>
            <th>Orientation progress</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>`;

      const from = start + 1;
      const to = Math.min(start + SALES_TABLE_PAGE_SIZE, total);
      pager.innerHTML = `
        <span>Showing ${from}–${to} of ${total} schools</span>
        <div class="sales-table-pager__btns">
          <button type="button" data-sales-page="prev" ${salesTablePage <= 0 ? 'disabled' : ''}>Previous</button>
          <button type="button" data-sales-page="next" ${salesTablePage >= totalPages - 1 ? 'disabled' : ''}>Next</button>
        </div>`;
    }

    function renderSalesOverview() {
      const month = getSalesSelectedMonth();
      const payload = salesFulfillmentCache;
      const summary = payload && payload.summary ? payload.summary : null;
      renderSalesSummary(summary);
      renderSalesCharts(payload);
      renderSalesAlerts(payload);
      renderSalesSchoolTable(payload, month);
    }

    function getSalesTypeFilter() {
      const sel = document.getElementById('sales-type-filter');
      return sel ? String(sel.value || '').trim() : '';
    }

    function branchMatchesSchoolType(branch, typeFilter) {
      if (!typeFilter) return true;
      const name = String(branch || '').toLowerCase();
      if (typeFilter === 'elite') return name.includes('elite');
      return true;
    }

    function renderSalesTargets() {
      const root = document.getElementById('sales-regions-root');
      if (!root) return;
      const month = getSalesSelectedMonth();
      const monthLocked = !month;
      if (monthLocked) {
        root.innerHTML =
          '<div class="empty">Select a month from the filter above to set school targets.</div>';
        salesTargetsSavedSnapshot = {};
        syncSalesSaveTargetsButton();
        return;
      }
      const payload = salesFulfillmentCache;
      const fulfillMap = fulfillmentMapFromPayload(payload);
      let regions = Object.keys(regionBranches).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
      if (!regions.length) {
        root.innerHTML = '<div class="empty">No schools configured.</div>';
        salesTargetsSavedSnapshot = {};
        syncSalesSaveTargetsButton();
        return;
      }
      let html = '';
      let detailSeq = 0;
      let regionsRendered = 0;
      for (const region of regions) {
        const branches = regionBranches[region] || [];
        let uniqueBranches = [...new Set(branches.map((b) => String(b).trim()).filter(Boolean))];
        if (!uniqueBranches.length) continue;
        let regionTarget = 0;
        let regionScheduledA = 0;
        let regionCompletedA = 0;
        const rows = uniqueBranches
          .map((branch) => {
            const key = salesSchoolKey(region, branch);
            const f = fulfillMap[key] || {};
            const tc = Number(f.target_completed) || 0;
            const as = Number(f.actual_scheduled) || 0;
            const ac = Number(f.actual_completed) || 0;
            regionTarget += tc;
            regionScheduledA += as;
            regionCompletedA += ac;
            const safeBranch = escapeAttr(branch);
            const safeRegion = escapeAttr(region);
            const tier = schoolFulfillmentTier({ target_completed: tc, actual_completed: ac });
            const rowCls =
              tier === 'below' ? ' sales-row--below' : tier === 'met' ? ' sales-row--met' : '';
            const badge = salesStatusBadgeHtml(tier);
            const detailId = `sales-meetings-${detailSeq++}`;
            const schoolSessions = schoolSessionsForSalesPanel(region, branch, month);
            const canExpand = as > 0 || ac > 0 || schoolSessions.length > 0;
            const schoolCell = canExpand
              ? `<button type="button" class="sales-school-toggle" aria-expanded="false" aria-controls="${detailId}" data-sales-region="${safeRegion}" data-sales-branch="${safeBranch}" data-sales-scheduled="${as}" data-sales-completed="${ac}">
                  <span class="sales-school-toggle__chev" aria-hidden="true">▶</span>
                  <span>${escapeHtml(branch)}</span>
                </button> ${badge}`
              : `${escapeHtml(branch)} ${badge}`;
            const mainRow = `<tr class="sales-row${rowCls}">
              <td>${schoolCell}</td>
              <td class="num sales-td-target"><input type="number" class="sales-target-inp" min="0" step="1" value="${tc}" data-sales-school-target="1" data-region="${safeRegion}" data-branch="${safeBranch}" aria-label="Completion target for ${escapeAttr(branch)}"></td>
              <td class="num sales-td-actual"><span class="sales-meetings-count">${as}</span></td>
              <td class="num sales-td-actual"><span class="sales-meetings-count">${ac}</span></td>
              ${salesCompletionProgressCell(ac, tc)}
            </tr>`;
            if (!canExpand) return mainRow;
            return `${mainRow}
            <tr id="${detailId}" class="sales-meetings-detail is-hidden">
              <td colspan="5">
                <div class="sales-meetings-panel">
                  ${renderSalesMeetingsPanel(region, branch, month, { scheduled: as, completed: ac })}
                </div>
              </td>
            </tr>`;
          })
          .join('');
        const expandRegion = regions.length === 1;
        regionsRendered += 1;
        html += `<section class="sales-region">
          <button type="button" class="sales-region-hd" aria-expanded="${expandRegion ? 'true' : 'false'}">
            <span>${escapeHtml(region)}</span>
            <span class="sec-sub">Target ${regionCompletedA}/${regionTarget} completed · ${regionScheduledA} scheduled</span>
          </button>
          <div class="sales-region-body${expandRegion ? '' : ' is-collapsed'}">
            <div class="dash-table-wrap">
              <table class="dash-table" aria-label="${escapeAttr(region)} schools">
                <thead>
                  <tr>
                    <th>School</th>
                    <th class="num sales-th-target">Completion target</th>
                    <th class="num sales-th-actual">Meetings scheduled</th>
                    <th class="num sales-th-actual">Meetings completed</th>
                    <th class="num sales-th-actual">Completed vs target</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </div>
          </div>
        </section>`;
      }
      const openMeetingDetails = captureSalesOpenMeetingDetails();
      root.innerHTML = regionsRendered
        ? html
        : '<div class="empty">No schools match the current filters.</div>';
      restoreSalesOpenMeetingDetails(openMeetingDetails);
      resetSalesTargetsSavedSnapshot();
    }

    function renderSalesAdmin() {
      if (poGetRole() !== 'sales_admin') return;
      populateSalesMonthOptions();
      applySalesRoute();
      const { section } = parseSalesRoute();
      const month = getSalesSelectedMonth();
      const sub = document.querySelector('.app-sub');
      if (sub) sub.textContent = `Sales Admin · ${salesSectionLabel(section)} · ${salesMonthDisplayLabel(month)}`;
      const monthInp = document.getElementById('sales-month');
      if (monthInp && monthInp.value !== month) monthInp.value = month;
      syncMonthPickerByInputId('sales-month');
      if (section === 'targets') renderSalesTargets();
      else renderSalesOverview();
    }

    async function ensureSalesAdminData() {
      if (poGetRole() !== 'sales_admin') return;
      populateSalesMonthOptions();
      applySalesRoute();
      const pulled = await pullSessionsFromServer();
      if (!pulled) {
        toast('Could not load sessions. Click ↻ Refresh or sign in again.', 'warning');
      }
      const ok = await loadSalesFulfillment();
      if (!ok) toast('Could not load fulfillment data. Check database connection.', 'warning');
      renderSalesAdmin();
    }

    async function refreshSalesAdminData() {
      if (poGetRole() !== 'sales_admin') return;
      const btn = document.getElementById('btn-sales-refresh');
      if (btn?.disabled) return;
      if (btn) {
        btn.disabled = true;
        btn.setAttribute('aria-busy', 'true');
      }
      try {
        const ok = await pullSessionsFromServer();
        if (!ok) {
          toast('Could not refresh sessions. Check your connection.', 'warning');
          return;
        }
        await loadSalesFulfillment();
        renderSalesAdmin();
        toast('Sessions and student IDs refreshed.', 'success', { autoClose: 2500 });
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.removeAttribute('aria-busy');
        }
      }
    }

    function renderAll() {
      const role = poGetRole();
      if (role === 'sales_admin') {
        ensureSalesAdminData();
        return;
      }
      renderPMO();
      renderSpeaker();
    }

    // â”€â”€ Excel Export â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    async function exportExcel() {
      await refreshData();
      toast('Generating Excel file... Please wait.', 'info', { autoClose: 4500 });

      try {
        const buffer = await generateExcelBuffer();
        saveAs(new Blob([buffer]), "Parent_Orientation_Tracker.xlsx");
        toast('Excel file downloaded successfully.', 'success');
      } catch (error) {
        console.error('Failed to export Excel:', error);
        toast(error && error.message ? error.message : 'Failed to generate Excel file.', 'error');
      }
    }

    initLogin();

    (function registerServiceWorker() {
      if (!('serviceWorker' in navigator)) return;
      const { protocol, hostname } = window.location;
      const local =
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '[::1]' ||
        hostname.endsWith('.localhost');
      // HTTP on localhost/127.0.0.1: do not register — SW cached old app.js and `regionBranches` in the UI would not update.
      if (protocol === 'http:' && local) return;
      if (protocol !== 'https:' && !local) return;
      window.addEventListener('load', () => {
        const swUrl = new URL('sw.js', window.location.href).href;
        const scopeUrl = new URL('./', window.location.href).href;
        navigator.serviceWorker.register(swUrl, { scope: scopeUrl }).catch(() => {});
      });
    })();
