/** Student IDs for online meeting attendance: uppercase, unique (last occurrence wins). */
const STUDENT_ID_RE = /^[A-Z0-9][A-Z0-9_-]{0,39}$/;

function normalizeStudentId(raw) {
  if (raw == null) return '';
  return String(raw).trim().toUpperCase();
}

function isValidStudentId(id) {
  const n = normalizeStudentId(id);
  return n.length > 0 && STUDENT_ID_RE.test(n);
}

/** Dedupe: later entries override earlier ones for the same id. */
function normalizeStudentIds(list) {
  if (!Array.isArray(list)) return [];
  const order = [];
  const seen = new Set();
  for (const raw of list) {
    const id = normalizeStudentId(raw);
    if (!id || !STUDENT_ID_RE.test(id)) continue;
    if (seen.has(id)) {
      order.splice(order.indexOf(id), 1);
    } else {
      seen.add(id);
    }
    order.push(id);
  }
  return order;
}

function addStudentId(existing, newRaw) {
  const id = normalizeStudentId(newRaw);
  if (!id || !STUDENT_ID_RE.test(id)) return { ok: false, msg: 'Student ID must be 1–40 characters (letters, digits, hyphen, underscore).' };
  const base = normalizeStudentIds(existing);
  return { ok: true, student_ids: normalizeStudentIds([...base, id]) };
}

module.exports = {
  STUDENT_ID_RE,
  normalizeStudentId,
  isValidStudentId,
  normalizeStudentIds,
  addStudentId,
};
