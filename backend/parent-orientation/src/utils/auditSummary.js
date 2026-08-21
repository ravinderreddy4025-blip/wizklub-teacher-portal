function formatAuditRole(role) {
  const r = String(role || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  if (!r) return '';
  if (r === 'pmo') return 'PMO';
  if (r === 'sales_admin') return 'Sales Admin';
  if (r === 'superadmin') return 'Super Admin';
  return r.charAt(0).toUpperCase() + r.slice(1);
}

function formatAuditDate(dateStr) {
  const s = String(dateStr || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || '';
  const d = new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
}

function pushField(fields, label, value) {
  if (value == null || value === '') return;
  const text = String(value).trim();
  if (!text) return;
  fields.push({ label, value: text });
}

function sessionAuditFields(session) {
  if (!session || typeof session !== 'object') return [];
  const fields = [];
  const date = session.scheduled_date || session.date || '';
  const start = session.scheduled_start_time || session.scheduled_time || session.time || '';
  const end = session.scheduled_end_time || session.end_time || '';
  const venue = session.venue != null ? String(session.venue).trim() : '';

  pushField(fields, 'School / branch', session.branch);
  pushField(fields, 'Region', session.region);
  pushField(fields, 'Grade', session.grade);
  if (date) {
    let when = formatAuditDate(date);
    if (start && end) when += ` · ${start}–${end}`;
    else if (start) when += ` · ${start}`;
    pushField(fields, 'Date & time', when);
  } else if (start || end) {
    pushField(fields, 'Time', start && end ? `${start}–${end}` : start || end);
  }
  pushField(fields, 'Venue', venue);
  if (session.location) {
    pushField(fields, venue === 'Online' ? 'Meeting link' : 'Location / address', session.location);
  }
  pushField(fields, 'Teacher', session.teacher);
  pushField(fields, 'Co-host', session.co_host);
  if (session.invited != null && session.invited !== '') {
    pushField(fields, 'Parents invited', session.invited);
  }
  pushField(fields, 'Status', session.status || session.session_status);
  if (session.attended != null && session.attended !== '') {
    pushField(fields, 'Parents attended', session.attended);
  }
  pushField(fields, 'Engagement', session.engagement);
  pushField(fields, 'Follow-up', session.follow_up);
  pushField(fields, 'Follow-up date', session.follow_up_date);
  pushField(fields, 'Follow-up notes', session.follow_up_notes);
  pushField(fields, 'Remarks', session.remarks);
  pushField(fields, 'Update action', session.update_action);
  if (Array.isArray(session.student_ids) && session.student_ids.length) {
    pushField(fields, 'Student IDs logged', String(session.student_ids.length));
  }
  pushField(fields, 'Session ID', session.id);

  return fields;
}

function sessionAuditDetail(session) {
  return sessionAuditFields(session)
    .map(({ label, value }) => `${label}: ${value}`)
    .join(' · ');
}

function sessionBrief(session) {
  return sessionAuditDetail(session) || 'session';
}

function actorLabel(actor) {
  if (!actor || !actor.username) return '';
  const role = formatAuditRole(actor.role);
  return role ? `${actor.username} (${role})` : String(actor.username);
}

function sessionCreatedSummary(session, actor) {
  const detail = sessionAuditDetail(session);
  const who = actorLabel(actor);
  if (who && detail) return `${who} scheduled — ${detail}`;
  if (detail) return `Scheduled — ${detail}`;
  return 'Scheduled session';
}

function sessionUpdatedSummary(session, actor) {
  const detail = sessionAuditDetail(session);
  const who = actorLabel(actor);
  if (who && detail) return `${who} updated — ${detail}`;
  if (detail) return `Updated — ${detail}`;
  return 'Updated session';
}

function sessionDeletedSummary(session, actor) {
  const detail = sessionAuditDetail(session);
  const who = actorLabel(actor);
  if (who && detail) return `${who} removed — ${detail}`;
  if (detail) return `Removed — ${detail}`;
  return 'Removed session';
}

module.exports = {
  sessionBrief,
  sessionAuditFields,
  sessionAuditDetail,
  sessionCreatedSummary,
  sessionUpdatedSummary,
  sessionDeletedSummary,
  formatAuditRole,
  formatAuditDate,
};
