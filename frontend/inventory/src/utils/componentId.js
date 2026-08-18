/**
 * Component ID format:
 *   {schoolPrefix}-{schoolNumber}/{schoolIdSeg}-{kitId}-01-{quantityEnd}
 * Example: SC-078/65-FIB-01-06 (quantity range 01 through 06)
 */

export function parseSchoolCode(code) {
  if (!code) return { prefix: 'SCH', number: '001' };

  const dashed = String(code).match(/^([A-Za-z]+)-(\d+)$/i);
  if (dashed) {
    return {
      prefix: dashed[1].toUpperCase(),
      number: dashed[2].padStart(3, '0'),
    };
  }

  const alpha = String(code).match(/^([A-Za-z]+)/)?.[1]?.toUpperCase() || 'SCH';
  const digits = String(code).match(/(\d+)/)?.[1] || '1';
  return { prefix: alpha, number: digits.padStart(3, '0') };
}

export function schoolIdSegment(schoolId) {
  if (!schoolId) return '00';
  const tail = String(schoolId).slice(-2);
  const numeric = parseInt(tail, 16);
  return String(Number.isNaN(numeric) ? 0 : numeric % 100).padStart(2, '0');
}

export function formatQuantityRange(quantity) {
  const qtyEnd = Math.max(1, Number(quantity) || 1);
  return `01-${String(qtyEnd).padStart(2, '0')}`;
}

export function formatComponentId({
  schoolCode,
  schoolId,
  kitId,
  quantity,
  lineIndex: _lineIndex = 1,
}) {
  const { prefix, number } = parseSchoolCode(schoolCode);
  const schoolSeg = schoolIdSegment(schoolId);
  const kitCode = String(kitId || '').toUpperCase().trim();
  const qtyRange = formatQuantityRange(quantity);

  return `${prefix}-${number}/${schoolSeg}-${kitCode}-${qtyRange}`;
}

export function previewComponentId(school, kit, quantity, lineIndex = 1) {
  if (!school || !kit || !quantity) return 'Select school, kit, and quantity';
  return formatComponentId({
    schoolCode: school.code,
    schoolId: school._id,
    kitId: kit.kitId,
    quantity,
    lineIndex,
  });
}
