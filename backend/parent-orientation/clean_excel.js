const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');

const BACKEND_ROOT = __dirname;
const XLSX_IN_BACKEND = path.join(BACKEND_ROOT, 'Parent_Orientation_Tracker.xlsx');
const XLSX_IN_ROOT = path.join(BACKEND_ROOT, '..', '..', 'Parent_Orientation_Tracker.xlsx');
const xlsxPath = fs.existsSync(XLSX_IN_BACKEND)
  ? XLSX_IN_BACKEND
  : fs.existsSync(XLSX_IN_ROOT)
    ? XLSX_IN_ROOT
    : XLSX_IN_BACKEND;

async function cleanSpreadsheet() {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.readFile(xlsxPath);

    let ws1 = wb.getWorksheet('PMO - Plan Sessions') || wb.getWorksheet('PMO – Plan Sessions') || wb.getWorksheet(1);
    if (ws1) {
      console.log('Cleaning PMO sheet...');
      for (let r = 4; r <= 2000; r++) {
        const row = ws1.getRow(r);
        row.values = [];
        row.commit();
      }
    }

    let ws2 = wb.getWorksheet('Speaker – Post Activity') || wb.getWorksheet('Speaker - Post Activity');
    if (ws2) {
      console.log('Cleaning Speaker sheet...');
      for (let r = 4; r <= 2000; r++) {
        const row = ws2.getRow(r);
        row.values = [];
        row.commit();
      }
    }

    await wb.xlsx.writeFile(xlsxPath);
    console.log('Successfully cleaned:', xlsxPath);
  } catch (err) {
    console.error('Error cleaning file:', err);
  }
}

cleanSpreadsheet();
