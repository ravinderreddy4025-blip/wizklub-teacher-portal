'use strict';

/**
 * Parse roster .xlsx/.csv (first sheet/row set). Row 1 must start with:
 * school_name, admission_number, user_name, student_name, grade (in this exact order).
 * Doc: ../../../docs/file-notes/server/services/rosterExcelImport.js.md
 */
const ExcelJS = require('exceljs');
const { Readable } = require('stream');
const ROSTER_IMPORT_DEBUG = String(process.env.ROSTER_IMPORT_DEBUG || '').toLowerCase() === 'true';

function importDebugLog(...args) {
  if (ROSTER_IMPORT_DEBUG) console.log(...args);
}

/**
 * Turn a row-1 Excel cell value into plain text (handles formulas, rich text, etc.).
 * @param {unknown} v
 */
function rawHeaderToString(v) {
  if (v == null) return '';
  if (typeof v === 'object' && v.richText && Array.isArray(v.richText)) {
    return v.richText.map((t) => (t && t.text != null ? String(t.text) : '')).join('').trim();
  }
  if (typeof v === 'object' && v.text != null) return String(v.text).trim();
  if (typeof v === 'object' && v.result != null) return String(v.result).trim();
  return String(v).trim();
}

function normHeader(v) {
  const raw = rawHeaderToString(v);
  return raw
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalized row-1 titles → internal column role (strict roster template only). */
const ROSTER_HEADER_TO_ROLE = {
  'school name': 'school',
  'admission number': 'admission',
  'user name': 'username',
  'student name': 'name',
  grade: 'grade',
};

/**
 * Map row-1 header cells (0-based column index) to roles — only the five roster headers, first column wins per role.
 * @param {string[]} headers
 */
function mapColumns(headers) {
  const col = {};
  for (let c = 0; c < headers.length; c++) {
    const h = normHeader(headers[c]);
    if (!h) continue;
    const role = ROSTER_HEADER_TO_ROLE[h];
    if (!role) continue;
    if (role === 'school' && col.school == null) col.school = c;
    else if (role === 'admission' && col.admission == null) col.admission = c;
    else if (role === 'username' && col.username == null) col.username = c;
    else if (role === 'name' && col.name == null) col.name = c;
    else if (role === 'grade' && col.grade == null) col.grade = c;
  }
  return col;
}

/**
 * Row 1 must start with 5 headers in this order:
 * school_name, admission_number, user_name, student_name, grade.
 * @param {unknown[]} headers
 * @returns {{ errors: string[], col: Record<string, number> | null }}
 */
function buildStrictColumnMap(headers) {
  const errors = [];
  const requiredOrder = ['school name', 'admission number', 'user name', 'student name', 'grade'];

  for (let i = 0; i < requiredOrder.length; i += 1) {
    const actual = normHeader(headers[i]);
    if (actual !== requiredOrder[i]) {
      errors.push(`Row 1: column ${i + 1} must be ${requiredOrder[i].replace(/ /g, '_')}.`);
    }
  }

  if (errors.length > 0) {
    return { errors, col: null };
  }

  return {
    errors: [],
    col: {
      school: 0,
      admission: 1,
      username: 2,
      name: 3,
      grade: 4,
    },
  };
}

/** Non-empty row-1 headers for error messages (1-based column numbers). */
function describeHeaderRow(headers, maxCols = 40) {
  const parts = [];
  const n = Math.min(headers.length, maxCols);
  for (let i = 0; i < n; i += 1) {
    const s = rawHeaderToString(headers[i]);
    if (s) parts.push(`col ${i + 1}: "${s}"`);
  }
  return parts.length ? parts.join('; ') : '(no header text found in row 1 — put titles in the first row)';
}

function normalizeGrade(raw) {
  const s = String(raw == null ? '' : raw).trim();
  const m = s.match(/\b([1-9])\b/);
  if (m) return m[1];
  if (/^[1-9]$/.test(s)) return s;
  return s;
}

function cellStr(ws, row, col0) {
  if (col0 == null || col0 < 0) return '';
  const v = ws.getRow(row).getCell(col0 + 1).value;
  if (v == null) return '';
  if (typeof v === 'object' && v.text != null) return String(v.text).trim();
  if (typeof v === 'object' && v.result != null) return String(v.result).trim();
  return String(v).trim();
}

/**
 * @param {Buffer} buffer
 * @param {{ filename?: string, mimetype?: string }} [meta]
 * @returns {{ rows: object[], errors: string[], warnings: string[] }}
 */
async function parseRosterExcelBuffer(buffer, meta = {}) {
  const errors = [];
  const warnings = [];
  const rows = [];
  const maxRowsRaw = Number(meta.maxRows);
  const maxRows = Number.isFinite(maxRowsRaw) && maxRowsRaw > 0
    ? Math.floor(maxRowsRaw)
    : Infinity;
  const wb = new ExcelJS.Workbook();
  const filename = String(meta.filename || '').toLowerCase();
  const mimetype = String(meta.mimetype || '').toLowerCase();
  const isCsv =
    filename.endsWith('.csv')
    || mimetype.includes('text/csv')
    || mimetype.includes('application/csv')
    || mimetype.includes('application/vnd.ms-excel');
  if (isCsv) {
    const stream = Readable.from(buffer);
    await wb.csv.read(stream);
  } else {
    await wb.xlsx.load(buffer);
  }
  const ws = wb.worksheets[0];
  if (!ws) {
    errors.push(isCsv ? 'The CSV has no rows.' : 'The workbook has no sheets.');
    return { rows, errors, warnings };
  }

  const r1 = ws.getRow(1);
  const headers = [];
  r1.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = cell.value;
  });
  const maxCol = Math.max(headers.length, r1.cellCount || 0, 10);
  for (let c = 0; c < maxCol; c++) {
    if (headers[c] === undefined) headers[c] = r1.getCell(c + 1).value;
  }

  const headingRow = [];
  for (let c = 0; c < maxCol; c++) {
    headingRow.push(rawHeaderToString(headers[c]));
  }
  while (headingRow.length > 0 && headingRow[headingRow.length - 1] === '') {
    headingRow.pop();
  }
  importDebugLog('[roster import] row 1 column headings:', headingRow);

  const headerSummary = describeHeaderRow(headers);

  const { errors: mapErrors, col } = buildStrictColumnMap(headers);
  if (mapErrors.length > 0 || !col) {
    errors.push(...mapErrors);
    if (errors.length === 0) {
      errors.push(`Row 1: invalid headers. Detected: ${headerSummary}`);
    }
    return { rows, errors, warnings };
  }

  const last = ws.actualRowCount || 1;
  for (let r = 2; r <= last; r++) {
    if (rows.length >= maxRows) {
      warnings.push(`Preview limited to first ${maxRows} valid rows for performance.`);
      break;
    }
    const username = cellStr(ws, r, col.username);
    if (!username) {
      importDebugLog(`[roster import] row ${r} skipped: user_name is empty`);
      continue;
    }
    const name = cellStr(ws, r, col.name);
    const schoolName = cellStr(ws, r, col.school);
    const gradeRaw = normalizeGrade(cellStr(ws, r, col.grade));
    const admissionRaw = cellStr(ws, r, col.admission);
    importDebugLog(`[roster import] row ${r} values:`, {
      school_name: schoolName,
      admission_number: admissionRaw,
      user_name: username,
      student_name: name,
      grade: gradeRaw,
    });
    const g = Number(gradeRaw);
    if (!Number.isFinite(g) || g < 1 || g > 9) {
      errors.push(`Row ${r}: grade must be a number from 1 to 9 for user_name "${username}".`);
      continue;
    }
    const grade = String(Math.floor(g));
    const admissionNumber = admissionRaw ? admissionRaw : undefined;

    if (!name) {
      errors.push(`Row ${r}: missing student_name for user_name "${username}".`);
      continue;
    }
    if (!schoolName) {
      errors.push(`Row ${r}: missing school_name for user_name "${username}".`);
      continue;
    }

    rows.push({
      studentId: username,
      username,
      name,
      grade,
      schoolName,
      admissionNumber,
    });
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push('No data rows (need user_name values from row 2 upward).');
  }

  return { rows, errors, warnings };
}

module.exports = {
  parseRosterExcelBuffer,
  mapColumns,
  buildStrictColumnMap,
  normalizeGrade,
  rawHeaderToString,
  normHeader,
};
