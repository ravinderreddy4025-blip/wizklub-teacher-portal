/**
 * Canonical session field names: lowercase snake_case (API + Mongo).
 * migrateLegacyToCanonical maps older camelCase / short keys for one release window.
 */

function pad2(n) {
  return String(n).padStart(2, '0');
}

function parseTimeToMinutesLoose(t) {
  const s = String(t ?? '').trim();
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!m) return NaN;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(min) || h > 23 || min > 59) return NaN;
  return h * 60 + min;
}

/** When only start time existed, assume a 60-minute block (capped same calendar day). */
function defaultScheduledEndFromStart(startStr) {
  const sm = parseTimeToMinutesLoose(startStr);
  if (Number.isNaN(sm)) return '';
  const end = Math.min(sm + 60, 24 * 60 - 1);
  if (end <= sm) return '';
  return `${pad2(Math.floor(end / 60))}:${pad2(end % 60)}`;
}

/** YYYY-MM-DD for API/UI; accepts BSON Date (Node) or ISO datetime string. */
function normalizeScheduledDateValue(val) {
  if (val == null || val === '') return '';
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return val.toISOString().slice(0, 10);
  }
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

function migrateLegacyToCanonical(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return o;
  const out = { ...o };
  if (out.scheduled_date == null || out.scheduled_date === '') {
    out.scheduled_date = out.date || out.session_date || out.scheduledDate || out.sessionDate;
  }
  if (out.scheduled_start_time == null || out.scheduled_start_time === '') {
    out.scheduled_start_time =
      out.scheduled_time != null && out.scheduled_time !== ''
        ? out.scheduled_time
        : out.scheduledStartTime != null && out.scheduledStartTime !== ''
          ? out.scheduledStartTime
          : out.time;
  }
  if (out.scheduled_end_time == null || out.scheduled_end_time === '') {
    out.scheduled_end_time =
      out.end_time != null && out.end_time !== ''
        ? out.end_time
        : out.endTime != null && out.endTime !== ''
          ? out.endTime
          : out.scheduledEndTime;
  }
  if (out.scheduled_end_time == null || out.scheduled_end_time === '') {
    out.scheduled_end_time = defaultScheduledEndFromStart(out.scheduled_start_time);
  }
  if (out.location == null || out.location === '') out.location = out.zoom;
  if (out.co_host == null || out.co_host === '') out.co_host = out.cohost;
  if (out.session_status == null || out.session_status === '') out.session_status = out.sessionStatus;
  if (out.follow_up == null || out.follow_up === '') out.follow_up = out.followUp;
  if (out.follow_up_date == null || out.follow_up_date === '') out.follow_up_date = out.followUpDate;
  if (out.follow_up_notes == null || out.follow_up_notes === '') out.follow_up_notes = out.followUpNotes;
  if (out.update_action == null || out.update_action === '') out.update_action = out.updateAction;
  out.scheduled_date = normalizeScheduledDateValue(out.scheduled_date);
  delete out.date;
  delete out.session_date;
  delete out.scheduledDate;
  delete out.sessionDate;
  delete out.time;
  delete out.scheduled_time;
  delete out.scheduledStartTime;
  delete out.end_time;
  delete out.endTime;
  delete out.scheduledEndTime;
  delete out.zoom;
  delete out.cohost;
  delete out.sessionStatus;
  delete out.followUp;
  delete out.followUpDate;
  delete out.followUpNotes;
  delete out.updateAction;
  return out;
}

module.exports = {
  migrateLegacyToCanonical,
};
