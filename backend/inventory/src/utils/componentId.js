/**
 * Component ID format:
 *   {schoolPrefix}-{schoolNumber}/{joinYearSeg}-{kitId}-01-{quantityEnd}
 * Example:
 *   BENG-0010/25-TEST123-01-01
 *   - BENG-0010/25 → school code + year joined WizKlub
 *   - TEST123       → kit catalog id
 *   - 01-01         → quantity range (01 through 01; always starts at 01)
 */

function stripLegacyYearSuffix(code) {
  return String(code || '').trim().replace(/\/\d{2}$/, '');
}

function parseSchoolCode(code) {
  const raw = stripLegacyYearSuffix(code);
  if (!raw) return { prefix: 'SCH', number: '001' };

  const dashed = raw.match(/^([A-Za-z]+)-(\d+)$/i);
  if (dashed) {
    return {
      prefix: dashed[1].toUpperCase(),
      number: dashed[2].padStart(3, '0'),
    };
  }

  const alpha = raw.match(/^([A-Za-z]+)/)?.[1]?.toUpperCase() || 'SCH';
  const digits = raw.match(/(\d+)/)?.[1] || '1';
  return { prefix: alpha, number: digits.padStart(3, '0') };
}

function parseLegacyYearSuffixFromCode(code) {
  const match = String(code || '').trim().match(/\/(\d{2})$/);
  return match ? Number(match[1]) : null;
}

function joiningYearSegment(joiningYear, schoolCode) {
  if (joiningYear != null && Number.isFinite(Number(joiningYear))) {
    const year = Math.trunc(Number(joiningYear));
    if (year >= 2000 && year <= 2099) {
      return String(year % 100).padStart(2, '0');
    }
  }

  const legacySuffix = parseLegacyYearSuffixFromCode(schoolCode);
  if (legacySuffix != null) {
    return String(legacySuffix).padStart(2, '0');
  }

  return String(new Date().getFullYear() % 100).padStart(2, '0');
}

function formatQuantityRange(quantity) {
  const qtyEnd = Math.max(1, Number(quantity) || 1);
  return `01-${String(qtyEnd).padStart(2, '0')}`;
}

function formatSchoolIdentityPrefix(schoolCode, joiningYear) {
  const { prefix, number } = parseSchoolCode(schoolCode);
  const yearSeg = joiningYearSegment(joiningYear, schoolCode);
  return `${prefix}-${number}/${yearSeg}`;
}

function formatComponentId({
  schoolCode,
  joiningYear,
  schoolId: _legacySchoolId,
  kitId,
  quantity,
  lineIndex: _lineIndex = 1,
}) {
  const { prefix, number } = parseSchoolCode(schoolCode);
  const yearSeg = joiningYearSegment(joiningYear, schoolCode);
  const kitCode = String(kitId || '').toUpperCase().trim();
  const qtyRange = formatQuantityRange(quantity);

  return `${prefix}-${number}/${yearSeg}-${kitCode}-${qtyRange}`;
}

function normalizeJoiningYear(value) {
  if (value === null || value === undefined || value === '') return null;
  const year = Number(value);
  if (!Number.isInteger(year) || year < 2000 || year > 2099) {
    throw new Error('Joining year must be a whole year between 2000 and 2099');
  }
  return year;
}

module.exports = {
  parseSchoolCode,
  joiningYearSegment,
  formatQuantityRange,
  formatSchoolIdentityPrefix,
  formatComponentId,
  normalizeJoiningYear,
  // Backward-compatible alias (deprecated — uses joining year now)
  schoolIdSegment: joiningYearSegment,
};
