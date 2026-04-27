    const STORE_KEY = 'po_sessions_v8';
    const PO_ROLE_HEADER = 'X-PO-Role';

    // Local-only guard: if PMO opens on http://localhost/pmo without port, force :9080.
    (function ensureLocalGatewayPort() {
      const { protocol, hostname, port, pathname, search, hash } = window.location;
      const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
      const underPmo = pathname === '/pmo' || pathname.startsWith('/pmo/');
      if (protocol === 'http:' && isLocal && !port && underPmo) {
        window.location.replace(`${protocol}//${hostname}:9080${pathname}${search}${hash}`);
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

    /** Sends which role this tab uses so PMO and Speaker can both be logged in (separate cookies). */
    function poApiFetch(url, init = {}) {
      const role = sessionStorage.getItem('po_logged_in');
      const headers = new Headers(init.headers || {});
      if (role === 'pmo' || role === 'speaker') headers.set(PO_ROLE_HEADER, role);
      return fetch(poResolveUrl(url), { credentials: 'include', ...init, headers });
    }

    let sessions = [];
    let openExpand = {};
    let _selEng = {};
    let _selAction = {};
    let _selGrades = [];
    let _selVenue = '';
    let editingId = null;

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
    function locationLinkHtml(loc) {
      const href = safeZoomHref(loc);
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
          sessionStorage.removeItem('po_logged_in');
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
      const speakerBeforePut =
        sessionStorage.getItem('po_logged_in') === 'speaker'
          ? JSON.parse(JSON.stringify(sessions))
          : null;
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(sessions));
      } catch (_) { /* quota */ }
      const role = sessionStorage.getItem('po_logged_in');
      if (role === 'pmo') {
        const ok = await pullSessionsFromServer();
        if (!ok) toast('Could not refresh sessions from the server.', 'error');
        await pmoUploadExcelFile();
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
      if (st && en) timePart = `${st}–${en}`;
      else timePart = st || en;
      const bits = [];
      if (dateStr && dateStr !== '—') bits.push(dateStr);
      if (timePart) bits.push(timePart);
      return bits.length ? bits.join(' · ') : '—';
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

    /** Hash: #/login | #/pmo/analytics[/YYYY-MM] | #/pmo/plan | #/pmo/plan/edit/:id | #/pmo/meetings | #/speaker */
    const PO_PMO_SECTIONS = new Set(['analytics', 'plan', 'meetings']);

    function poStripHash() {
      return (location.hash || '').replace(/^#/, '');
    }

    /** @returns {{ name: 'root'|'login'|'pmo'|'speaker'|'unknown', params: Record<string, string|null> }} */
    function parseAppRoute() {
      const parts = poStripHash().split('/').filter(Boolean);
      if (parts.length === 0) return { name: 'root', params: {} };
      if (parts[0] === 'login') return { name: 'login', params: {} };
      if (parts[0] === 'speaker') return { name: 'speaker', params: {} };
      if (parts[0] === 'pmo') {
        if (parts.length >= 4 && parts[1] === 'plan' && parts[2] === 'edit' && parts[3]) {
          const editId = decodeURIComponent(parts.slice(3).join('/'));
          return { name: 'pmo', params: { section: 'plan', month: null, editId } };
        }
        const sec = PO_PMO_SECTIONS.has(parts[1]) ? parts[1] : 'analytics';
        const month = sec === 'analytics' && parts[2] && /^\d{4}-\d{2}$/.test(parts[2]) ? parts[2] : null;
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
      const role = sessionStorage.getItem('po_logged_in');
      const route = parseAppRoute();

      if (!role) {
        if (route.name !== 'login') {
          if (poReplaceHash('#/login')) syncRouteFromHash(opts);
        }
        return;
      }

      if (route.name === 'login' || route.name === 'root' || route.name === 'unknown') {
        const def = role === 'pmo' ? '#/pmo/analytics' : '#/speaker';
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
        if (render) renderAll();
      }
    }

    function showLogin() {
      const ls = document.getElementById('login-screen');
      ls.style.display = 'flex';
      ls.style.pointerEvents = 'auto';
      document.querySelector('.app').style.display = 'none';
      const route = parseAppRoute();
      if (route.name !== 'login') poReplaceHash('#/login');
    }

    async function logoutUser() {
      const role = sessionStorage.getItem('po_logged_in');
      try {
        await poApiFetch('api/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: role || '' })
        });
      } catch (_) { /* offline */ }
      sessionStorage.removeItem('po_logged_in');
      document.getElementById('login-user').value = '';
      document.getElementById('login-pass').value = '';
      showLogin();
      toast('Logged out successfully', 'success');
    }

    function showApp() {
      const ls = document.getElementById('login-screen');
      ls.style.display = 'none';
      ls.style.pointerEvents = 'none';
      document.querySelector('.app').style.display = 'block';

      const role = sessionStorage.getItem('po_logged_in');
      const tabs = document.getElementById('role-tabs');
      if (role === 'pmo' || role === 'speaker') {
        if (tabs) tabs.style.display = 'none';
      }

      syncRouteFromHash({ render: false });
      initPlanFormRegionAndBranch();
      loadData();
    }

    async function loginUser() {
      const user = document.getElementById('login-user').value.trim();
      const pass = document.getElementById('login-pass').value;
      try {
        const r = await poApiFetch('api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user, pass })
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.role) {
          sessionStorage.setItem('po_logged_in', j.role);
          const v = await poApiFetch('api/me');
          const me = await v.json().catch(() => ({}));
          if (!v.ok || !me.role) {
            sessionStorage.removeItem('po_logged_in');
            toast('Login succeeded but the browser did not keep your session. If the URL starts with http://, set COOKIE_SECURE=0 in the server .env and restart.', 'warning');
            return;
          }
          document.getElementById('login-pass').value = '';
          showApp();
          toast(j.role === 'pmo' ? 'Welcome PMO' : 'Welcome Speaker', 'success');
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
      });
    }

    function initStaticPageControls() {
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
      document.getElementById('pmo-nav')?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-pmo-nav]');
        if (!b) return;
        const sec = b.dataset.pmoNav;
        if (sec === 'analytics') setPmoHash('analytics');
        else if (sec === 'plan') setPmoHash('plan');
        else if (sec === 'meetings') setPmoHash('meetings');
      });
      window.addEventListener('hashchange', () => syncRouteFromHash());
    }

    function initLogin() {
      initPoClickDelegation();
      initStaticPageControls();
      document.getElementById('login-form').addEventListener('submit', function (e) {
        e.preventDefault();
        loginUser();
      });
      (async function () {
        const rememberedRole = sessionStorage.getItem('po_logged_in');
        if (!rememberedRole) {
          showLogin();
          return;
        }
        try {
          const r = await poApiFetch('api/me');
          if (!r.ok) {
            sessionStorage.removeItem('po_logged_in');
            showLogin();
            return;
          }
          const j = await r.json();
          if (j.role && j.role === rememberedRole) {
            showApp();
            return;
          }
          sessionStorage.removeItem('po_logged_in');
          showLogin();
        } catch (_) {
          showLogin();
        }
      })();
    }

    function fmtDate(d) {
      if (d == null || d === '') return '—';
      const s = String(d).trim();
      const core = s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
      const parts = core.split('-');
      if (parts.length < 3) return '—';
      const [y, m, day] = parts;
      if (!y || !m || !day) return '—';
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

    /** Planned sessions: toggle full form vs remarks-only for Rescheduled/Cancelled. */
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
      if (section === 'analytics' && monthKey) path += `/${monthKey}`;
      return `#${path}`;
    }

    function setPmoHash(section, monthKey, editSessionId) {
      const next = buildPmoHash(section, monthKey, editSessionId);
      if (location.hash !== next) location.hash = next;
      else applyPmoRoute();
    }

    function maybeOpenPlanEditFromHash() {
      if (sessionStorage.getItem('po_logged_in') !== 'pmo') return;
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
    }

    function switchRole(r) {
      const vpmo = document.getElementById('view-pmo');
      const vspk = document.getElementById('view-speaker');
      if (r === 'pmo') {
        vpmo.style.display = 'block';
        vpmo.style.pointerEvents = 'auto';
        vspk.style.display = 'none';
        vspk.style.pointerEvents = 'none';
      } else {
        vpmo.style.display = 'none';
        vpmo.style.pointerEvents = 'none';
        vspk.style.display = 'block';
        vspk.style.pointerEvents = 'auto';
      }
      document.getElementById('tab-pmo').classList.toggle('active', r === 'pmo');
      document.getElementById('tab-spk').classList.toggle('active', r === 'speaker');
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
      if (!el) return;
      const z = el.value.trim();

      if (_selVenue !== 'Online' && _selVenue !== 'Offline') {
        el.type = 'text';
        el.removeAttribute('inputmode');
        el.placeholder = 'Select Online or Offline above…';
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
        el.placeholder = 'https://zoom.us/j/… or https://meet.google.com/…';
        el.setCustomValidity(safeZoomHref(z) ? '' : 'For online sessions, paste a full meeting link starting with https:// or http://');
        if (hint) {
          hint.style.display = 'block';
          hint.textContent = 'Online sessions must use a full web link (https:// or http://). Plain text is not accepted.';
        }
        const href = safeZoomHref(z);
        if (wrap && openA) {
          if (href) {
            openA.href = href;
            wrap.style.display = 'block';
          } else {
            wrap.style.display = 'none';
          }
        }
        return;
      }

      el.type = 'text';
      el.removeAttribute('inputmode');
      el.placeholder = 'e.g. Auditorium, branch address, or N/A';
      if (offlineFieldLooksLikeLink(z)) {
        el.setCustomValidity('Offline venue must be plain text only — not a web link (http://, https://, www.…).');
      } else if (z.length === 0) {
        el.setCustomValidity('For offline sessions, enter the venue or location (you can type N/A if not applicable).');
      } else {
        el.setCustomValidity('');
      }
      if (hint) {
        hint.style.display = 'block';
        hint.textContent = 'Offline: enter the physical venue or N/A — plain text only, not a web link.';
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

    function cancelEdit() {
      editingId = null;
      document.getElementById('form-title').innerHTML = `Plan New Session <span class="sec-sub">Overlap is blocked when two plans share the same date, region, branch, overlapping times, and at least one of the same grades. Different grades with no overlap in the lists can run in parallel.</span>`;
      document.getElementById('btn-save-plan').textContent = 'Save Session Plan';
      document.getElementById('btn-cancel-edit').style.display = 'none';
      if (sessionStorage.getItem('po_logged_in') === 'pmo' && (location.hash || '').includes('/plan/edit/')) {
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

      const ft = document.getElementById('form-title');
      if (ft) {
        ft.innerHTML = `Edit Session <span class="sec-sub">Updating details for ${escapeHtml(s.branch || '')}</span>`;
      }
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
          setPmoHash('meetings');
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
          setPmoHash('meetings');
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
          if (s.status === 'Planned') {
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
          <input type="number" id="f-att-${s.id}" data-po-invited-cap="${invitedCap}" placeholder="0" min="0" max="${invitedCap}" title="Must be ≤ parents invited (${invitedCap})" value="${escapeAttr(attVal)}" aria-describedby="f-att-err-${s.id}">
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

    function buildExpandContent(s) {
      const isSpeaker = isSpeakerViewVisible();
      const canUpdatePlanned = isSpeaker && s.status === 'Planned';

      const infoGrid = `
    <div class="ig">
      <div class="ii"><label title="Unique session id (UUID) stored as the database key">Meeting ID</label><p><code style="user-select:all;word-break:break-all;font-size:12px;color:var(--po-text, #1a1a2e)">${escapeHtml(s.id)}</code></p></div>
      <div class="ii"><label>Session date</label><p>${escapeHtml(s.scheduled_date ? fmtDate(s.scheduled_date) : '—')}</p></div>
      <div class="ii"><label>Start time</label><p>${escapeHtml(String(s.scheduled_start_time || '').trim() || '—')}</p></div>
      <div class="ii"><label>End time</label><p>${escapeHtml(String(s.scheduled_end_time || '').trim() || '—')}</p></div>
      <div class="ii"><label>Grade</label><p>${s.grade ? escapeHtml(s.grade) : '—'}</p></div>
      <div class="ii"><label>Link or location</label><p>${locationLinkHtml(s.location)}</p></div>
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
        isSessionClosed(s)
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

      if (!canUpdatePlanned) {
        return infoGrid + readOnlyPost;
      }

      return `${infoGrid}
    <div class="divhr"></div>
    <div class="stl">Post-Activity Update</div>
    
    <div class="fg" style="margin-bottom:12px">
      <label>Update Action *</label>
      <div class="grade-bar" id="p-action-bar-${s.id}">
        <button type="button" class="gb active" id="act-Completed-${s.id}" data-po-pick-action="1" data-po-sid="${escapeAttr(s.id)}" data-po-act="Completed">Completed</button>
        <button type="button" class="gb" id="act-Rescheduled-${s.id}" data-po-pick-action="1" data-po-sid="${escapeAttr(s.id)}" data-po-act="Rescheduled">Rescheduled</button>
        <button type="button" class="gb" id="act-Cancelled-${s.id}" data-po-pick-action="1" data-po-sid="${escapeAttr(s.id)}" data-po-act="Cancelled">Cancelled</button>
      </div>
    </div>

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
            completed: 0,
            rescheduled: 0,
            cancelled: 0,
            attended: 0,
            invited: 0,
          };
        }
        map[mk].scheduled += 1;
        if (s.status === 'Completed') {
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

    function setMetricContainerHtml(id, html) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = html;
    }

    function renderAnalyticsUI() {
      setMetricContainerHtml('analytics-hero-metrics', metricTilesHtmlForList(sessions));
      const grid = document.getElementById('analytics-month-grid');
      if (grid) {
        if (!sessions.length) {
          grid.innerHTML =
            '<div class="empty" style="padding:20px 12px">No sessions yet. Open <strong>New session</strong> to add plans.</div>';
        } else {
          const rows = aggregateByMonth(sessions);
          grid.innerHTML = rows
            .map(
              (r) => `
      <button type="button" class="month-card" data-pmo-month="${escapeAttr(r.monthKey)}">
        <div class="month-card-label">${escapeHtml(formatMonthLabel(r.monthKey))}</div>
        <div class="month-card-stats">
          <div>Scheduled: <b>${r.scheduled}</b> · Completed: <b>${r.completed}</b> · Rescheduled: <b>${r.rescheduled}</b> · Cancelled: <b>${r.cancelled}</b></div>
          <div>Parents attended: <b>${r.attended}</b> · Invited: <b>${r.invited}</b></div>
        </div>
      </button>`
            )
            .join('');
        }
      }
      const { month } = parsePmoHash();
      const panels = document.getElementById('analytics-detail-panels');
      const mm = document.getElementById('analytics-month-metrics');
      if (month) {
        const filtered = sessions.filter((s) => sessionMonthKey(s) === month);
        setMetricContainerHtml('analytics-month-metrics', metricTilesHtmlForList(filtered));
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
      } else {
        if (mm) mm.innerHTML = '';
        if (panels) panels.innerHTML = '';
      }
    }

    function renderMetrics() {
      setMetricContainerHtml('metrics', metricTilesHtmlForList(sessions));
    }

    function sessionRowHTML(s, speakerMode) {
      const pillCls = sessionStatusPillClass(s);
      const mode = speakerMode ? 'spk' : 'pmo';
      const key = expandKey(s.id, mode);
      const isOpen = openExpand[key];
      return `
    <div class="srow">
      <div class="shead" data-po-row="1" data-po-sid="${escapeAttr(s.id)}" data-po-mode="${escapeAttr(mode)}" role="button" tabindex="0">
        <div class="smeta">
          <div class="strow">
            <span class="sname">${escapeHtml(s.branch || '—')}</span>
            <span class="pill ${pillCls}">${escapeHtml(s.status)}</span>
            ${s.region ? `<span style="font-size:11px;color:#888">${escapeHtml(s.region)}</span>` : ''}
          </div>
          <div class="sdet">
            ${!speakerMode ? `<span title="Session id (UUID)">🆔 <code style="font-size:11px;user-select:all;word-break:break-all">${escapeHtml(s.id)}</code></span>` : ''}
            <span>📅 ${escapeHtml(fmtSessionScheduleSummary(s))}</span>
            <span>👤 ${escapeHtml(s.teacher || '—')}${s.co_host ? ' + ' + escapeHtml(s.co_host) : ''}</span>
            ${s.venue ? `<span>📍 ${escapeHtml(s.venue)}</span>` : ''}
            <span>Invited: <b>${escapeHtml(String(s.invited || 0))}</b></span>
            ${s.status === 'Completed' ? `<span>Attended: <b>${escapeHtml(String(s.attended))}</b></span>` : ''}
          </div>
        </div>
        <div class="sact">
          <button type="button" class="btn btn-o btn-sm" data-po-details="1" data-po-sid="${escapeAttr(s.id)}" data-po-mode="${escapeAttr(mode)}">Details <span class="arrow ${isOpen ? 'open' : ''}" id="arr-${mode}-${s.id}">▼</span></button>
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

    function renderPMO() {
      applyPmoRoute();
      renderMetrics();
      renderAnalyticsUI();
      const sf = document.getElementById('f-status')?.value || '';
      const q = (document.getElementById('f-search')?.value || '').toLowerCase();
      let list = sessions;
      if (sf) list = list.filter(s => s.status === sf);
      if (q) list = list.filter(s =>
        (s.branch || '').toLowerCase().includes(q) ||
        (s.teacher || '').toLowerCase().includes(q) ||
        (s.region || '').toLowerCase().includes(q)
      );
      document.getElementById('count-lbl').textContent = `${list.length} session${list.length !== 1 ? 's' : ''}`;
      document.getElementById('pmo-list').innerHTML = list.length
        ? list.map(s => sessionRowHTML(s, false)).join('')
        : '<div class="empty">No sessions yet. Use <strong>New session</strong> to add a plan.</div>';
    }

    function renderSpeaker() {
      syncSpeakerSortControls();
      const { sortBy, sortDir } = getSpeakerSortPrefs();
      const pending = sortSessionsForSpeaker(
        sessions.filter((s) => s.status === 'Planned'),
        sortBy,
        sortDir
      );
      const completed = sortSessionsForSpeaker(
        sessions.filter((s) => s.status === 'Completed'),
        sortBy,
        sortDir
      );
      const rescheduled = sortSessionsForSpeaker(
        sessions.filter((s) => s.status === 'Rescheduled'),
        sortBy,
        sortDir
      );
      const cancelled = sortSessionsForSpeaker(
        sessions.filter((s) => s.status === 'Cancelled'),
        sortBy,
        sortDir
      );

      const tb = document.getElementById('spk-toolbar');
      if (tb) tb.hidden = sessions.length === 0;

      let html = '';
      if (pending.length) {
        html += `<div class="spk-sec">
          <div class="spk-sec-hd"><div class="glbl">Pending update (${pending.length})</div></div>
          <div class="slist slist--spk-grid">${pending.map((s) => sessionRowHTML(s, true)).join('')}</div>
        </div>`;
      }
      if (completed.length) {
        html += `<div class="spk-sec">
          <div class="spk-sec-hd"><div class="glbl">Completed (${completed.length})</div></div>
          <div class="slist slist--spk-grid">${completed.map((s) => sessionRowHTML(s, true)).join('')}</div>
        </div>`;
      }
      if (rescheduled.length) {
        html += `<div class="spk-sec">
          <div class="spk-sec-hd"><div class="glbl">Rescheduled (${rescheduled.length})</div></div>
          <div class="slist slist--spk-grid">${rescheduled.map((s) => sessionRowHTML(s, true)).join('')}</div>
        </div>`;
      }
      if (cancelled.length) {
        html += `<div class="spk-sec">
          <div class="spk-sec-hd"><div class="glbl">Cancelled (${cancelled.length})</div></div>
          <div class="slist slist--spk-grid">${cancelled.map((s) => sessionRowHTML(s, true)).join('')}</div>
        </div>`;
      }
      document.getElementById('spk-list').innerHTML =
        html || '<div class="empty">No sessions planned yet. Ask PMO to add sessions.</div>';
    }

    function renderAll() {
      renderPMO();
      renderSpeaker();
    }

    // ── Excel Export ─────────────────────────────────────────────────────────────
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
