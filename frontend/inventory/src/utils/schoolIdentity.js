/** Spreadsheet SR code (e.g. SC-098/22). */
export function isSpreadsheetSrCode(value) {
  const v = String(value || '').trim();
  return /^SC-\d+\/\d{2}$/i.test(v) || /^NSC-\d+\/\d{2}$/i.test(v);
}

/** WizKlub portal login id (e.g. beng0010). */
export function isWizklubPortalLoginId(value) {
  const v = String(value || '').trim();
  if (!v) return false;
  if (isSpreadsheetSrCode(v)) return false;
  if (/^SCHOOL\d+$/i.test(v)) return true;
  return /^[a-z]{2,5}\d{3,5}$/i.test(v);
}

export function resolveSchoolDisplayCodes(school) {
  if (!school) return { srCode: null, wizklubSchoolId: null };

  const code = String(school.code || '').trim();
  const wiz = String(school.wizklubSchoolId || '').trim();

  let srCode = null;
  let wizklubSchoolId = null;

  for (const candidate of [code, wiz]) {
    if (!srCode && isSpreadsheetSrCode(candidate)) srCode = candidate;
    if (!wizklubSchoolId && isWizklubPortalLoginId(candidate)) wizklubSchoolId = candidate;
  }

  return { srCode, wizklubSchoolId };
}

/** Normalize API school list item for dual-code display. */
export function resolveSchoolDisplayFromApi(school) {
  if (!school) return { srCode: null, wizklubSchoolId: null };

  const candidates = [
    school.srCode,
    school.inventoryCode,
    school.code,
    school.wizklubSchoolId,
    school.schoolCode,
    school.schoolId,
  ].map((v) => String(v || '').trim()).filter(Boolean);

  let srCode = school.srCode || null;
  let wizklubSchoolId = school.wizklubSchoolId || null;

  if (!srCode) {
    srCode = candidates.find((v) => isSpreadsheetSrCode(v)) || null;
  }
  if (!wizklubSchoolId) {
    wizklubSchoolId = candidates.find((v) => isWizklubPortalLoginId(v)) || null;
  }

  return { srCode, wizklubSchoolId };
}
