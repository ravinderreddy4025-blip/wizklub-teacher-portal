/**
 * Component ID format:
 *   {schoolPrefix}-{schoolNumber}/{joinYearSeg}-{kitId}-01-{quantityEnd}
 * Example: BENG-0010/25-TEST123-01-01
 */

function stripLegacyYearSuffix(code) {
  return String(code || '').trim().replace(/\/\d{2}$/, '');
}

export function parseSchoolCode(code) {
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

export function joiningYearSegment(joiningYear, schoolCode) {
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

/** @deprecated Use joiningYearSegment */
export function schoolIdSegment(joiningYear, schoolCode) {
  return joiningYearSegment(joiningYear, schoolCode);
}

export function formatQuantityRange(quantity) {
  const qtyEnd = Math.max(1, Number(quantity) || 1);
  return `01-${String(qtyEnd).padStart(2, '0')}`;
}

export function formatSchoolIdentityPrefix(schoolCode, joiningYear) {
  const { prefix, number } = parseSchoolCode(schoolCode);
  const yearSeg = joiningYearSegment(joiningYear, schoolCode);
  return `${prefix}-${number}/${yearSeg}`;
}

export function formatComponentId({
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

export function previewComponentId(school, kit, quantity, lineIndex = 1) {
  if (!school || !kit || !quantity) return 'Select school, kit, and quantity';
  return formatComponentId({
    schoolCode: school.code,
    joiningYear: school.joiningYear,
    kitId: kit.kitId,
    quantity,
    lineIndex,
  });
}

export function resolveJoiningYearDisplay(school) {
  if (school?.joiningYear != null) return school.joiningYear;
  const legacy = parseLegacyYearSuffixFromCode(school?.code);
  if (legacy != null) return 2000 + legacy;
  return new Date().getFullYear();
}
