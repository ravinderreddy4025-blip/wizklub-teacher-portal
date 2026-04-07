/** Domain and storage constants (no I/O). */
const STATE_DOC_ID = 'tracker_sessions';
const SESSIONS_COLLECTION = 'sessions';
const MAX_SESSIONS = 5000;
/** New sessions use UUID v4; legacy rows may still use short alphanumeric ids. */
const SESSION_ID_RE =
  /^(?:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|[a-zA-Z0-9_-]{1,80})$/;
const SESSION_STATUS_ALLOWED = new Set(['Planned', 'Completed', 'Rescheduled', 'Cancelled']);
const SPEAKER_MERGE_KEYS = new Set([
  'attended',
  'engagement',
  'follow_up',
  'follow_up_date',
  'follow_up_notes',
  'session_status',
  'remarks',
  'status',
  'update_action',
]);

const WEAK_PASSWORDS = new Set(
  ['pmo@123', 'speaker@123', 'password', 'password123', 'admin', 'admin123', '12345678', 'qwerty'].map((s) =>
    s.toLowerCase()
  )
);

module.exports = {
  STATE_DOC_ID,
  SESSIONS_COLLECTION,
  MAX_SESSIONS,
  SESSION_ID_RE,
  SESSION_STATUS_ALLOWED,
  SPEAKER_MERGE_KEYS,
  WEAK_PASSWORDS,
};
