'use strict';

const ExcelJS = require('exceljs');
const {
  mapColumns,
  buildStrictColumnMap,
  normalizeGrade,
  parseRosterExcelBuffer,
} = require('../services/rosterExcelImport');

describe('rosterExcelImport mapColumns', () => {
  test('maps official underscore headers from row 1 (any column order)', () => {
    const headers = ['school_name', 'admission_number', 'user_name', 'student_name', 'grade'];
    const col = mapColumns(headers);
    expect(col.school).toBe(0);
    expect(col.admission).toBe(1);
    expect(col.username).toBe(2);
    expect(col.name).toBe(3);
    expect(col.grade).toBe(4);
  });

  test('user_name maps to username (underscore normalization)', () => {
    const col = mapColumns(['user_name']);
    expect(col.username).toBe(0);
  });

  test('user-name (hyphen) maps to user name role', () => {
    const col = mapColumns(['User-Name']);
    expect(col.username).toBe(0);
  });
});

describe('buildStrictColumnMap', () => {
  test('accepts five roster headers in required order', () => {
    const headers = ['school_name', 'admission_number', 'user_name', 'student_name', 'grade'];
    const { errors, col } = buildStrictColumnMap(headers);
    expect(errors).toHaveLength(0);
    expect(col).not.toBeNull();
    expect(col.username).toBe(2);
  });

  test('ignores extra columns after position 5', () => {
    const headers = ['school_name', 'admission_number', 'user_name', 'student_name', 'grade', 'Project Title'];
    const { errors, col } = buildStrictColumnMap(headers);
    expect(errors).toHaveLength(0);
    expect(col).not.toBeNull();
    expect(col.grade).toBe(4);
  });

  test('rejects wrong column order', () => {
    const headers = ['school_name', 'user_name', 'admission_number', 'student_name', 'grade'];
    const { errors, col } = buildStrictColumnMap(headers);
    expect(col).toBeNull();
    expect(errors.some((e) => /column 2 must be admission_number/i.test(e))).toBe(true);
  });
});

describe('rosterExcelImport normalizeGrade', () => {
  test('extracts digit from labels', () => {
    expect(normalizeGrade('Grade 7')).toBe('7');
    expect(normalizeGrade(5)).toBe('5');
  });
});

describe('parseRosterExcelBuffer', () => {
  test('imports five-column sheet', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Roster');
    ws.getRow(1).getCell(1).value = 'school_name';
    ws.getRow(1).getCell(2).value = 'admission_number';
    ws.getRow(1).getCell(3).value = 'user_name';
    ws.getRow(1).getCell(4).value = 'student_name';
    ws.getRow(1).getCell(5).value = 'grade';
    ws.getRow(2).getCell(1).value = 'DPS';
    ws.getRow(2).getCell(2).value = 'ADM-1';
    ws.getRow(2).getCell(3).value = 'learner_001';
    ws.getRow(2).getCell(4).value = 'Asha Kumar';
    ws.getRow(2).getCell(5).value = '7';
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const { rows, warnings, errors } = await parseRosterExcelBuffer(buffer);
    expect(errors.length).toBe(0);
    expect(warnings.length).toBe(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].studentId).toBe('learner_001');
    expect(rows[0].username).toBe('learner_001');
    expect(rows[0].grade).toBe('7');
    expect(rows[0].schoolName).toBe('DPS');
    expect(rows[0].admissionNumber).toBe('ADM-1');
  });

  test('fails when required order is broken (grade missing at column 5)', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Roster');
    ws.getRow(1).getCell(1).value = 'school_name';
    ws.getRow(1).getCell(2).value = 'admission_number';
    ws.getRow(1).getCell(3).value = 'user_name';
    ws.getRow(1).getCell(4).value = 'student_name';
    ws.getRow(2).getCell(1).value = 'DPS';
    ws.getRow(2).getCell(2).value = '';
    ws.getRow(2).getCell(3).value = 'u1';
    ws.getRow(2).getCell(4).value = 'N';
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const { rows, errors } = await parseRosterExcelBuffer(buffer);
    expect(rows).toHaveLength(0);
    expect(errors.some((e) => /column 5 must be grade/i.test(e))).toBe(true);
  });

  test('rejects submissions export style wrong first five headers', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Export');
    ws.getRow(1).values = [
      undefined,
      'Student ID',
      'Name',
      'Grade',
      'School Name',
      'Project Title',
    ];
    ws.getRow(2).values = [undefined, 'stu_01', 'Asha Kumar', '7', 'DPS', 'My project'];
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const { rows, errors } = await parseRosterExcelBuffer(buffer);
    expect(rows).toHaveLength(0);
    expect(errors.some((e) => /column 1 must be school_name/i.test(e))).toBe(true);
  });

  test('accepts csv when first five headers are valid and ignores extra columns', async () => {
    const csv = [
      'school_name,admission_number,user_name,student_name,grade,extra_col',
      'DPS,ADM-1,learner_001,Asha Kumar,Grade 7,anything',
    ].join('\n');
    const buffer = Buffer.from(csv, 'utf8');
    const { rows, errors, warnings } = await parseRosterExcelBuffer(buffer, {
      filename: 'roster.csv',
      mimetype: 'text/csv',
    });
    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].studentId).toBe('learner_001');
    expect(rows[0].schoolName).toBe('DPS');
    expect(rows[0].grade).toBe('7');
  });

  test('limits parsed rows when maxRows is provided', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Roster');
    ws.getRow(1).getCell(1).value = 'school_name';
    ws.getRow(1).getCell(2).value = 'admission_number';
    ws.getRow(1).getCell(3).value = 'user_name';
    ws.getRow(1).getCell(4).value = 'student_name';
    ws.getRow(1).getCell(5).value = 'grade';
    ws.getRow(2).getCell(1).value = 'DPS';
    ws.getRow(2).getCell(2).value = 'ADM-1';
    ws.getRow(2).getCell(3).value = 'learner_001';
    ws.getRow(2).getCell(4).value = 'Asha Kumar';
    ws.getRow(2).getCell(5).value = '7';
    ws.getRow(3).getCell(1).value = 'DPS';
    ws.getRow(3).getCell(2).value = 'ADM-2';
    ws.getRow(3).getCell(3).value = 'learner_002';
    ws.getRow(3).getCell(4).value = 'Ravi Kumar';
    ws.getRow(3).getCell(5).value = '6';
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const { rows, errors, warnings } = await parseRosterExcelBuffer(buffer, { maxRows: 1 });
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].studentId).toBe('learner_001');
    expect(warnings.some((w) => /Preview limited to first 1 valid rows/i.test(String(w)))).toBe(true);
  });
});
