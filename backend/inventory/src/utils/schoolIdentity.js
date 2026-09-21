/** Spreadsheet / inventory SR code (e.g. SC-098/22). */
function isSpreadsheetSrCode(value) {
  const v = String(value || '').trim();
  return /^SC-\d+\/\d{2}$/i.test(v) || /^NSC-\d+\/\d{2}$/i.test(v);
}

/** WizKlub Teachers Portal school login id (e.g. beng0010, visa0001). */
function isWizklubPortalLoginId(value) {
  const v = String(value || '').trim();
  if (!v) return false;
  if (isSpreadsheetSrCode(v)) return false;
  if (/^SCHOOL\d+$/i.test(v)) return true;
  return /^[a-z]{2,5}\d{3,5}$/i.test(v);
}

/**
 * When applying an SR code to school.code, preserve the portal login id in wizklubSchoolId.
 */
function resolvePortalLoginId({ code, wizklubSchoolId, previousCode } = {}) {
  if (isWizklubPortalLoginId(wizklubSchoolId)) return String(wizklubSchoolId).trim();
  if (isWizklubPortalLoginId(code)) return String(code).trim();
  if (isWizklubPortalLoginId(previousCode)) return String(previousCode).trim();
  return null;
}

function normalizeSchoolNameKey(name) {
  return String(name || '')
    .replace(/^sri chaitanya[\s-]*/i, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

module.exports = {
  isSpreadsheetSrCode,
  isWizklubPortalLoginId,
  resolvePortalLoginId,
  normalizeSchoolNameKey,
};
