const fs = require('fs');
const path = require('path');
const { XLSX_PATH } = require('../config/paths');

async function ensureExcelTemplateFile() {
  if (fs.existsSync(XLSX_PATH)) return;
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();

  const pmo = wb.addWorksheet('PMO - Plan Sessions');
  pmo.getCell('A1').value = 'Parent orientation — PMO plan';
  pmo.getCell('A2').value = 'Headers are applied automatically when you export.';

  const spk = wb.addWorksheet('Speaker – Post Activity');
  spk.getCell('A1').value = 'Speaker export — schedule & post-activity';
  spk.getCell('A2').value = 'Row 3 headers are refreshed on each export.';
  const speakerHdrs = [
    'Session Date',
    'Start Time',
    'End Time',
    'Grade',
    'Branch',
    'Region',
    'Venue / Medium',
    'Teacher',
    'Co-Host',
    'Parents Invited',
    'Parents Attended',
    'Status',
    'Overall session status',
    'Engagement',
    'Follow-up required',
    'Follow-up date',
    'Follow-up notes',
    'Remarks',
  ];
  const spkR3 = spk.getRow(3);
  speakerHdrs.forEach((h, i) => {
    spkR3.getCell(i + 1).value = h;
  });
  spkR3.commit();

  const sum = wb.addWorksheet('Summary Dashboard');
  const sumLabels = [
    ['C5', 'Total sessions'],
    ['C6', 'Completed'],
    ['C7', 'Parents invited'],
    ['C8', 'Parents attended'],
    ['C9', 'Attendance rate'],
    ['C10', 'High engagement'],
    ['C11', 'Moderate engagement'],
    ['C12', 'Low engagement'],
  ];
  for (const [addr, text] of sumLabels) {
    sum.getCell(addr).value = text;
  }
  for (let r = 5; r <= 12; r++) {
    sum.getRow(r).getCell(4).value = 0;
  }

  await wb.xlsx.writeFile(XLSX_PATH);
  console.log(`Created Excel template (first run): ${path.basename(XLSX_PATH)}`);
}

async function writeExcelBufferWithRetry(destPath, buf, attempts = 6, delayMs = 200) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      await fs.promises.writeFile(destPath, buf);
      return;
    } catch (e) {
      lastErr = e;
      const code = e && e.code;
      if ((code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') && i < attempts - 1) {
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

function destPathLabel(p) {
  try {
    return path.basename(p);
  } catch (_) {
    return '';
  }
}

module.exports = {
  ensureExcelTemplateFile,
  writeExcelBufferWithRetry,
  destPathLabel,
};
