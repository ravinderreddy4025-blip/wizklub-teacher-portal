const {
  SESSION_ID_RE,
  MAX_SESSIONS,
  SESSION_STATUS_ALLOWED,
  SPEAKER_MERGE_KEYS,
} = require('../config/constants');
const { migrateLegacyToCanonical } = require('./sessionKeys');

function validateSessionId(id) {
  return typeof id === 'string' && SESSION_ID_RE.test(id);
}

function normalizeSessionIdString(id) {
  if (id == null) return null;
  const s = String(id).trim();
  return SESSION_ID_RE.test(s) ? s : null;
}

function speakerIncomingIdSet(body) {
  const set = new Set();
  if (!Array.isArray(body)) return set;
  for (const item of body) {
    if (!item || typeof item !== 'object') continue;
    const sid = normalizeSessionIdString(item.id);
    if (sid) set.add(sid);
  }
  return set;
}

function normalizeGradeKey(grade) {
  if (grade == null || typeof grade !== 'string') return '';
  return grade
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean)
    .sort()
    .join(',');
}

/** Same calendar date, region, branch (grades compared separately via intersection). */
function sessionPlaceKey(item) {
  const date = item.scheduled_date != null ? String(item.scheduled_date).trim() : '';
  const region = item.region != null ? String(item.region).trim() : '';
  const branch = item.branch != null ? String(item.branch).trim() : '';
  return `${date}\u0001${region}\u0001${branch}`;
}

function gradeTokenSet(grade) {
  const set = new Set();
  if (grade == null) return set;
  const s = typeof grade === 'string' ? grade : String(grade);
  for (const part of s.split(',')) {
    const t = part.trim();
    if (t) set.add(t);
  }
  return set;
}

/** Sorted labels that appear in both grade selections. */
function intersectGradeSets(setA, setB) {
  const out = [];
  for (const x of setA) {
    if (setB.has(x)) out.push(x);
  }
  out.sort();
  return out;
}

function pmoScheduleConflictMessage(gradeLabels) {
  if (!gradeLabels || gradeLabels.length === 0) {
    return 'This time slot conflicts with another session for this branch and region.';
  }
  const glist = gradeLabels.join(', ');
  if (gradeLabels.length === 1) {
    return `Grade ${glist} already has a session at this time for this branch and region.`;
  }
  return `Grades ${glist} already have sessions at this time for this branch and region.`;
}

function parseTimeToMinutes(t) {
  const s = String(t ?? '').trim();
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!m) return NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(min) || h > 23 || min > 59) return NaN;
  return h * 60 + min;
}

/** Half-open [start, end) in minutes from midnight; null if invalid. */
function sessionIntervalHalfOpen(item) {
  const start = parseTimeToMinutes(item.scheduled_start_time);
  const end = parseTimeToMinutes(item.scheduled_end_time);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  return { start, end };
}

function intervalsOverlapHalfOpen(a0, a1, b0, b1) {
  return a0 < b1 && b0 < a1;
}

/**
 * If two sessions conflict (same place, overlapping time, any shared grade), returns sorted shared grade labels; else null.
 */
function pmoConflictingGrades(a, b) {
  if (String(a.id) === String(b.id)) return null;
  const am = migrateLegacyToCanonical({ ...a });
  const bm = migrateLegacyToCanonical({ ...b });
  if (sessionPlaceKey(am) !== sessionPlaceKey(bm)) return null;
  const ia = sessionIntervalHalfOpen(am);
  const ib = sessionIntervalHalfOpen(bm);
  if (!ia || !ib) return null;
  if (!intervalsOverlapHalfOpen(ia.start, ia.end, ib.start, ib.end)) return null;
  const inter = intersectGradeSets(gradeTokenSet(am.grade), gradeTokenSet(bm.grade));
  return inter.length ? inter : null;
}

/** True when same date/region/branch, time ranges overlap (half-open), and at least one grade is shared. */
function pmoSessionsTimeOverlap(a, b) {
  return pmoConflictingGrades(a, b) != null;
}

function isSafeHttpUrl(raw) {
  const s = String(raw ?? '').trim();
  if (!s || s.length > 2048) return false;
  let u;
  try {
    u = new URL(s);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  if (u.username || u.password) return false;
  if (!u.hostname) return false;
  return true;
}

function parseParentsInvited(raw) {
  if (raw === null || raw === undefined || raw === '') return NaN;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : NaN;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : NaN;
}

function validatePmoSessionRecord(rawItem) {
  const item = migrateLegacyToCanonical({ ...rawItem });
  const date = item.scheduled_date != null ? String(item.scheduled_date).trim() : '';
  const time = item.scheduled_start_time != null ? String(item.scheduled_start_time).trim() : '';
  const endTime = item.scheduled_end_time != null ? String(item.scheduled_end_time).trim() : '';
  if (!date) return 'Each session must have a session date.';
  if (!time) return 'Each session must have a start time.';
  if (!endTime) return 'Each session must have an end time.';
  const sm = parseTimeToMinutes(time);
  const em = parseTimeToMinutes(endTime);
  if (Number.isNaN(sm)) return 'Each session must have a valid start time.';
  if (Number.isNaN(em)) return 'Each session must have a valid end time.';
  if (em <= sm) return 'End time must be after start time.';
  const g = normalizeGradeKey(item.grade);
  if (!g) return 'Each session must include at least one grade (G1–G9).';
  const region = item.region != null ? String(item.region).trim() : '';
  const branch = item.branch != null ? String(item.branch).trim() : '';
  if (!region) return 'Each session must have a region.';
  if (!branch) return 'Each session must have a branch name.';
  const venue = item.venue != null ? String(item.venue).trim() : '';
  if (venue !== 'Online' && venue !== 'Offline') return 'Each session must have venue Online or Offline.';
  const teacher = item.teacher != null ? String(item.teacher).trim() : '';
  if (!teacher) return 'Each session must have a teacher name.';
  const location = item.location != null ? String(item.location).trim() : '';
  if (!location) return 'Each session must have a meeting link (online) or venue / location detail (offline).';
  if (venue === 'Online' && !isSafeHttpUrl(location)) {
    return 'Online sessions must include a valid http(s) meeting link.';
  }
  const inv = parseParentsInvited(item.invited);
  if (!Number.isFinite(inv) || inv < 0 || inv > 1_000_000) {
    return 'Each session must have a valid parents invited count (0–1000000).';
  }
  const rawSt = item.status != null ? String(item.status).trim() : '';
  const st = rawSt || 'Planned';
  if (!SESSION_STATUS_ALLOWED.has(st)) {
    return `Each session must have status Planned, Completed, Rescheduled, or Cancelled (got "${rawSt}").`;
  }
  return null;
}

function validatePmoSessionsBody(body) {
  if (!Array.isArray(body)) return { ok: false, status: 400, msg: 'Expected a JSON array of sessions.' };
  if (body.length > MAX_SESSIONS) {
    return { ok: false, status: 400, msg: `At most ${MAX_SESSIONS} sessions allowed.` };
  }
  const seenIds = new Set();
  const overlapBuckets = new Map();
  for (const raw of body) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, status: 400, msg: 'Each session must be a JSON object.' };
    }
    const item = migrateLegacyToCanonical({ ...raw });
    if (!validateSessionId(item.id)) {
      return {
        ok: false,
        status: 400,
        msg: 'Each session must have a valid id (letters, digits, underscore, hyphen; max 80 chars).',
      };
    }
    if (seenIds.has(item.id)) {
      return { ok: false, status: 400, msg: 'Duplicate session id in request body.' };
    }
    seenIds.add(item.id);
    const fieldErr = validatePmoSessionRecord(item);
    if (fieldErr) return { ok: false, status: 400, msg: `Session ${item.id}: ${fieldErr}` };
    const pk = sessionPlaceKey(item);
    const sm = parseTimeToMinutes(item.scheduled_start_time);
    const em = parseTimeToMinutes(item.scheduled_end_time);
    const gset = gradeTokenSet(item.grade);
    const list = overlapBuckets.get(pk) || [];
    for (const p of list) {
      if (!intervalsOverlapHalfOpen(sm, em, p.start, p.end)) continue;
      const shared = intersectGradeSets(gset, p.gradeSet);
      if (shared.length) {
        return {
          ok: false,
          status: 400,
          msg: `Session ${item.id}: ${pmoScheduleConflictMessage(shared)}`,
        };
      }
    }
    list.push({ start: sm, end: em, id: item.id, gradeSet: gset });
    overlapBuckets.set(pk, list);
  }
  return { ok: true };
}

function validateSpeakerSessionsPayload(body) {
  if (!Array.isArray(body)) return false;
  if (body.length > MAX_SESSIONS) return false;
  for (const item of body) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return false;
  }
  return true;
}

function mergeSpeakerUpdates(existing, incoming) {
  const incomingById = new Map();
  for (const incRaw of incoming) {
    if (!incRaw || typeof incRaw !== 'object') continue;
    const inc = migrateLegacyToCanonical({ ...incRaw });
    const sid = normalizeSessionIdString(inc.id);
    if (!sid) continue;
    incomingById.set(sid, { ...inc, id: sid });
  }
  return existing.map((s) => {
    const sid = normalizeSessionIdString(s.id);
    if (!sid) return s;
    const inc = incomingById.get(sid);
    if (!inc) return s;
    const next = { ...s };
    for (const k of SPEAKER_MERGE_KEYS) {
      if (Object.prototype.hasOwnProperty.call(inc, k)) {
        next[k] = inc[k];
      }
    }
    const st = String(inc.status || '').trim();
    const ua = String(inc.update_action || '').trim();
    const want =
      ua === 'Rescheduled' || ua === 'Cancelled'
        ? ua
        : st === 'Rescheduled' || st === 'Cancelled'
          ? st
          : '';
    if (want === 'Rescheduled' || want === 'Cancelled') {
      next.status = want;
      next.follow_up = '';
      next.follow_up_date = '';
      next.follow_up_notes = '';
    }

    if (next.status === 'Completed') {
      const rawFu = Object.prototype.hasOwnProperty.call(inc, 'follow_up')
        ? String(inc.follow_up ?? '').trim()
        : String(next.follow_up ?? '').trim();
      const normFu = rawFu === 'Y' ? 'Y' : rawFu === 'N' ? 'N' : '';
      next.follow_up = normFu;
      if (normFu !== 'Y') {
        next.follow_up_date = '';
        next.follow_up_notes = '';
      } else {
        if (Object.prototype.hasOwnProperty.call(inc, 'follow_up_date')) next.follow_up_date = inc.follow_up_date;
        if (Object.prototype.hasOwnProperty.call(inc, 'follow_up_notes')) next.follow_up_notes = inc.follow_up_notes;
      }
    }
    return next;
  });
}

function validateCompletedAttendedVsInvited(list, incomingIds) {
  for (const s of list) {
    if (s == null || typeof s !== 'object' || s.status !== 'Completed') continue;
    const sid = normalizeSessionIdString(s.id);
    if (!sid) continue;
    if (incomingIds instanceof Set && incomingIds.size > 0 && !incomingIds.has(sid)) continue;
    const invited = Number(s.invited);
    const inv = Number.isFinite(invited) && invited >= 0 ? invited : 0;
    const attRaw = s.attended;
    if (attRaw === '' || attRaw == null) continue;
    const att = parseInt(attRaw, 10);
    if (Number.isNaN(att) || att < 0) {
      return { ok: false, msg: `Session ${s.id}: invalid parents attended value.` };
    }
    if (att > inv) {
      return {
        ok: false,
        msg: `Session ${s.id}: parents attended (${att}) cannot exceed parents invited (${inv}).`,
      };
    }
  }
  return { ok: true };
}

function validateSpeakerSessionBusinessRules(_list, _incomingIds) {
  return { ok: true };
}

module.exports = {
  validateSessionId,
  normalizeSessionIdString,
  speakerIncomingIdSet,
  sessionPlaceKey,
  gradeTokenSet,
  pmoConflictingGrades,
  pmoScheduleConflictMessage,
  sessionIntervalHalfOpen,
  pmoSessionsTimeOverlap,
  validatePmoSessionRecord,
  validatePmoSessionsBody,
  validateSpeakerSessionsPayload,
  mergeSpeakerUpdates,
  validateCompletedAttendedVsInvited,
  validateSpeakerSessionBusinessRules,
  migrateLegacyToCanonical,
  isSafeHttpUrl,
};
