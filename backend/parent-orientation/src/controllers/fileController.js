const fs = require('fs');
const { XLSX_PATH } = require('../config/paths');
const { writeExcelBufferWithRetry, destPathLabel } = require('../services/excel');

function sendTemplateXlsx(req, res) {
  if (!fs.existsSync(XLSX_PATH)) {
    return res.status(404).send('Template workbook not found on server.');
  }
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  return res.sendFile(XLSX_PATH);
}

function uploadExcel(req, res) {
  (async () => {
    try {
      if (!req.body || !Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).send('Empty body.');
      }
      await writeExcelBufferWithRetry(XLSX_PATH, req.body);
      return res.sendStatus(200);
    } catch (err) {
      const code = err && err.code;
      if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') {
        console.warn(
          '[uploadExcel] Workbook file is locked (often open in Excel or OneDrive). Close it or pause sync, then retry.',
          destPathLabel(XLSX_PATH)
        );
        return res
          .status(409)
          .type('text/plain')
          .send(
            'Could not save the Excel file: it is in use or locked. Close Parent_Orientation_Tracker.xlsx in Excel (and any preview), then try again.'
          );
      }
      console.error('Error saving Excel:', err);
      return res.status(500).send('Error saving file.');
    }
  })();
}

module.exports = { sendTemplateXlsx, uploadExcel };

