const PDFDocument = require('pdfkit');
const { getSchoolReportData } = require('./monthlyReportService');

const BRAND_ORANGE = '#F7941D';
const BRAND_DEEP = '#1A1A2E';
const MUTED = '#64748B';
const BORDER = '#E2E8F0';

function formatDate(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatMonthLabel(month) {
  const [year, m] = String(month || '').split('-').map(Number);
  if (!year || !m) return month;
  return new Date(year, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function drawHeader(doc, title, subtitle) {
  doc.save();
  doc.rect(0, 0, doc.page.width, 88).fill(BRAND_ORANGE);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(20).text('WizKlub', 50, 24);
  doc.font('Helvetica').fontSize(10).text('Inventory — Monthly School Report', 50, 48);
  doc.font('Helvetica-Bold').fontSize(13).text(title, doc.page.width - 260, 26, { width: 210, align: 'right' });
  doc.font('Helvetica').fontSize(9).text(subtitle, doc.page.width - 260, 48, { width: 210, align: 'right' });
  doc.restore();
  doc.y = 104;
}

function drawStatRow(doc, stats, startY) {
  const rejected = stats.rejectedKits || 0;
  const rejectedHint = `Rejected by AM ${stats.rejectedByAm || 0} / Admin ${stats.rejectedByAdmin || 0}`;
  const rows = [
    [
      ['Sent till date', stats.sentKits ?? stats.dispatchedKits],
      ['Scheduled', stats.scheduledKits],
      ['Acknowledged', stats.acknowledgedKits],
      ['Mismatched', stats.mismatchKits],
    ],
    [
      ['Lost', stats.lostKits],
      ['Damaged', stats.damagedKits],
      ['Rejected', rejected],
    ],
  ];
  const gap = 8;
  const cardHeight = 58;
  let y = startY;
  rows.forEach((cards) => {
    const cardWidth = (doc.page.width - 100 - gap * (cards.length - 1)) / cards.length;
    let x = 50;
    cards.forEach(([label, value]) => {
      doc.roundedRect(x, y, cardWidth, cardHeight, 6).fillAndStroke('#FFF8F0', BORDER);
      doc.fillColor(MUTED).font('Helvetica').fontSize(7).text(label.toUpperCase(), x + 8, y + 10, { width: cardWidth - 16 });
      doc.fillColor(BRAND_DEEP).font('Helvetica-Bold').fontSize(16).text(String(value ?? 0), x + 8, y + 26, { width: cardWidth - 16 });
      if (label === 'Rejected') {
        doc.fillColor(MUTED).font('Helvetica').fontSize(6.5).text(rejectedHint, x + 8, y + 44, { width: cardWidth - 16 });
      } else if (label === 'Scheduled') {
        doc.fillColor(MUTED).font('Helvetica').fontSize(6.5).text('Includes sent + pending', x + 8, y + 44, { width: cardWidth - 16 });
      } else if (label === 'Sent till date') {
        doc.fillColor(MUTED).font('Helvetica').fontSize(6.5).text('Shipped — not pending', x + 8, y + 44, { width: cardWidth - 16 });
      }
      x += cardWidth + gap;
    });
    y += cardHeight + 8;
  });
  return y + 4;
}

function drawSectionTitle(doc, title, y) {
  doc.fillColor(BRAND_ORANGE).font('Helvetica-Bold').fontSize(11).text(title, 50, y);
  doc.moveTo(50, y + 16).lineTo(doc.page.width - 50, y + 16).strokeColor(BORDER).stroke();
  return y + 24;
}

function drawDispatchTable(doc, dispatches, startY) {
  if (!dispatches.length) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(9).text('No dispatches recorded for this month.', 50, startY);
    return startY + 20;
  }

  const colDate = 50;
  const colId = 115;
  const colKit = 210;
  const colSent = 355;
  const colReship = 410;
  const colStatus = 465;
  const rowHeight = 22;
  const headerHeight = 24;
  let y = startY;

  doc.rect(colDate, y, doc.page.width - 100, headerHeight).fill('#FFF8F0');
  doc.fillColor(BRAND_ORANGE).font('Helvetica-Bold').fontSize(8);
  doc.text('DATE', colDate + 6, y + 7);
  doc.text('DISPATCH ID', colId, y + 7);
  doc.text('KIT', colKit, y + 7);
  doc.text('SENT', colSent, y + 7);
  doc.text('RESHIP', colReship, y + 7);
  doc.text('STATUS', colStatus, y + 7);
  y += headerHeight;

  dispatches.forEach((d, index) => {
    if (y > doc.page.height - 80) {
      doc.addPage();
      y = 50;
    }
    const bg = index % 2 === 0 ? '#FFFFFF' : '#FAFAFA';
    doc.rect(colDate, y, doc.page.width - 100, rowHeight).fill(bg);
    doc.fillColor(BRAND_DEEP).font('Helvetica').fontSize(8);
    doc.text(formatDate(d.dispatchedAt || d.createdAt), colDate + 6, y + 6, { width: 60 });
    doc.text(d.dispatchId || '—', colId, y + 6, { width: 90 });
    doc.text(d.kit?.name || '—', colKit, y + 6, { width: 140 });
    const sent = d.reportOriginalQty ?? d.reportSentQty ?? d.quantity ?? 0;
    const reship = d.reportReshipQty ?? 0;
    doc.text(String(sent), colSent, y + 6);
    doc.text(reship > 0 ? String(reship) : '—', colReship, y + 6);
    doc.text(d.status || '—', colStatus, y + 6, { width: 80 });
    y += rowHeight;
  });

  return y + 12;
}

function drawReceiptIssuesSection(doc, receiptIssues, startY) {
  const issues = receiptIssues || [];
  if (!issues.length) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(9).text('No receipt issues for this month.', 50, startY);
    return startY + 20;
  }

  let y = startY;
  issues.forEach((issue) => {
    if (y > doc.page.height - 60) {
      doc.addPage();
      y = 50;
    }
    const dispatchId = issue.dispatch?.dispatchId || issue.sourceDispatchRef || '—';
    const sent = issue.quantitySent ?? 0;
    const receivedOk = issue.quantityReceived ?? 0;
    const affected = issue.quantityAffected || 0;
    doc.fillColor(BRAND_DEEP).font('Helvetica-Bold').fontSize(9)
      .text(`${issue.kit?.name || 'Kit'} · ${issue.issueType || 'Issue'} · Dispatch ${dispatchId}`, 50, y);
    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
      .text(
        `Sent: ${sent} · Received OK: ${receivedOk} · Affected: ${affected} · Status: ${issue.status || '—'}`,
        50,
        y + 12,
      );
    y += 28;
  });
  return y + 8;
}

function drawAuditSection(doc, audit, startY) {
  if (!audit) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(9).text('No monthly audit submitted for this period.', 50, startY);
    return startY + 20;
  }

  let y = startY;
  if (audit.assumedIntact) {
    doc.fillColor(BRAND_DEEP).font('Helvetica-Bold').fontSize(9)
      .text('Official audit dates ended — all kits treated as intact and exact.', 50, y);
    y += 14;
    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
      .text('No school submission. Warehouse quantity is available; lost 0; damaged 0.', 50, y, {
        width: doc.page.width - 100,
      });
    return y + 20;
  }

  doc.fillColor(BRAND_DEEP).font('Helvetica-Bold').fontSize(9)
    .text(`Audit status: ${audit.status} · Workflow: ${audit.workflowStatus}`, 50, y);
  y += 16;

  const items = (audit.items || []).filter((item) => item.lostQuantity > 0 || item.damagedQuantity > 0);
  if (!items.length) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(9).text('No lost or damaged kits reported in audit.', 50, y);
    return y + 20;
  }

  items.forEach((item) => {
    if (y > doc.page.height - 60) {
      doc.addPage();
      y = 50;
    }
    doc.fillColor(BRAND_DEEP).font('Helvetica-Bold').fontSize(9).text(item.kit?.name || 'Kit', 50, y);
    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
      .text(`Lost: ${item.lostQuantity || 0} · Damaged: ${item.damagedQuantity || 0} · Available: ${item.availableQuantity || 0}`, 50, y + 12);
    y += 28;
  });

  return y + 8;
}

async function generateSchoolConsolidatedReportPdf(schoolId, month) {
  const data = await getSchoolReportData(schoolId, month);
  const { school, stats, dispatches, receiptIssues, audit } = data;
  const schoolName = school.name || 'School';
  const monthLabel = formatMonthLabel(month);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    drawHeader(doc, schoolName, monthLabel);

    doc.fillColor(MUTED).font('Helvetica').fontSize(9)
      .text(`School code: ${school.code || '—'}`, 50, doc.y);
    doc.text(`Division: ${school.divisionId?.name || '—'}`, 50, doc.y + 12);
    doc.y += 28;
    doc.fontSize(8).text(
      'Sent till date is kits actually shipped (not pending). Scheduled includes sent plus still pending. Rejected shows who closed the claim (AM or Admin).',
      50,
      doc.y,
      { width: doc.page.width - 100 },
    );
    doc.y += 22;

    let y = drawStatRow(doc, stats, doc.y);
    y = drawSectionTitle(doc, 'Dispatch activity', y);
    y = drawDispatchTable(doc, dispatches, y);
    y = drawSectionTitle(doc, 'Receipt outcomes — sent, received OK, affected', y + 8);
    y = drawReceiptIssuesSection(doc, receiptIssues, y);
    y = drawSectionTitle(doc, 'Monthly audit — lost / damaged', y + 8);
    drawAuditSection(doc, audit, y);

    doc.fillColor(MUTED).font('Helvetica').fontSize(7)
      .text(`Generated ${formatDate(new Date())} · WizKlub Inventory`, 50, doc.page.height - 40, {
        width: doc.page.width - 100,
        align: 'center',
      });

    doc.end();
  });
}

module.exports = { generateSchoolConsolidatedReportPdf };
