const PDFDocument = require('pdfkit');
const { getSchoolReportData } = require('./monthlyReportService');
const { getSchoolTrendData } = require('./monthlyAnalyticsService');
const { drawPdfBrandHeader } = require('../utils/brandLogo');

const BRAND_ORANGE = '#F7941D';
const BRAND_DEEP = '#1A1A2E';
const MUTED = '#64748B';
const BORDER = '#E2E8F0';

const TREND_COLORS = {
  mismatch: '#6366F1',
  notReceived: '#F89C28',
  damaged: '#D97706',
  lost: '#64748B',
};

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

function formatShortMonth(month) {
  const [year, m] = String(month || '').split('-').map(Number);
  if (!year || !m) return month;
  return new Date(year, m - 1, 1).toLocaleDateString('en-IN', { month: 'short' });
}

function drawHeader(doc, title, subtitle) {
  drawPdfBrandHeader(doc, {
    rightTitle: title,
    rightSubtitle: subtitle,
  });
}

function drawKpiCards(doc, stats, startY) {
  const fulfillment = stats.fulfillment || {};
  const cards = [
    ['Shipped', stats.sentKits ?? 0, 'INITIAL kits'],
    ['Received', stats.acknowledgedKits ?? 0, 'OK acknowledged'],
    ['Replacements', stats.replacedKits ?? 0, 'Replacement shipped'],
    ['Pending', stats.pendingKits ?? 0, 'Not yet shipped'],
    ['Affected', stats.affectedKits ?? 0, 'Receipt issues'],
    ['Fulfillment', `${fulfillment.rate ?? 0}%`, `${fulfillment.fulfilledDsps ?? 0}/${fulfillment.eligibleDsps ?? 0} DSPs`],
  ];
  const gap = 8;
  const cardWidth = (doc.page.width - 100 - gap * 2) / 3;
  const cardHeight = 54;
  let y = startY;
  cards.forEach((card, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = 50 + col * (cardWidth + gap);
    const cy = y + row * (cardHeight + gap);
    doc.roundedRect(x, cy, cardWidth, cardHeight, 6).fillAndStroke('#FFF8F0', BORDER);
    doc.fillColor(MUTED).font('Helvetica').fontSize(7).text(card[0].toUpperCase(), x + 8, cy + 8, { width: cardWidth - 16 });
    doc.fillColor(BRAND_DEEP).font('Helvetica-Bold').fontSize(15).text(String(card[1]), x + 8, cy + 22, { width: cardWidth - 16 });
    doc.fillColor(MUTED).font('Helvetica').fontSize(6.5).text(card[2], x + 8, cy + 40, { width: cardWidth - 16 });
  });
  return y + 2 * (cardHeight + gap) + 8;
}

function drawTrendChart(doc, trendSeries, startY) {
  if (!trendSeries?.showChart) {
    let y = startY;
    doc.fillColor(BRAND_DEEP).font('Helvetica-Bold').fontSize(10)
      .text('Not enough historical data yet', 50, y);
    y += 16;
    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
      .text('Issue trends will appear as monthly data accumulates.', 50, y, { width: doc.page.width - 100 });
    y += 14;
    if (trendSeries?.availableMonths === 1) {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED)
        .text('1 month of data available', 50, y);
      y += 12;
    }
    return y + 8;
  }

  const trendPoints = trendSeries.months.map((month, index) => ({
    month,
    volume: {
      mismatch: trendSeries.volume.mismatch[index] || 0,
      notReceived: trendSeries.volume.notReceived[index] || 0,
      damaged: trendSeries.volume.damaged[index] || 0,
      lost: trendSeries.volume.lost[index] || 0,
    },
  }));

  if (!trendPoints.length) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(9).text('No trend data available.', 50, startY);
    return startY + 20;
  }

  const chartX = 50;
  const chartY = startY + 8;
  const chartW = doc.page.width - 100;
  const chartH = 100;
  const maxVal = Math.max(
    1,
    ...trendPoints.flatMap((p) => [p.volume.mismatch, p.volume.notReceived, p.volume.damaged, p.volume.lost]),
  );

  doc.rect(chartX, chartY, chartW, chartH).strokeColor(BORDER).stroke();
  trendPoints.forEach((point, i) => {
    const px = chartX + (i / Math.max(trendPoints.length - 1, 1)) * (chartW - 20) + 10;
    doc.fillColor(MUTED).font('Helvetica').fontSize(6).text(formatShortMonth(point.month), px - 12, chartY + chartH + 4, { width: 28, align: 'center' });
    ['mismatch', 'notReceived', 'damaged', 'lost'].forEach((key, lineIndex) => {
      const val = point.volume[key] || 0;
      const py = chartY + chartH - (val / maxVal) * (chartH - 10) - 5;
      if (i > 0) {
        const prev = trendPoints[i - 1];
        const prevX = chartX + ((i - 1) / Math.max(trendPoints.length - 1, 1)) * (chartW - 20) + 10;
        const prevVal = prev.volume[key] || 0;
        const prevY = chartY + chartH - (prevVal / maxVal) * (chartH - 10) - 5;
        doc.moveTo(prevX, prevY).lineTo(px, py).strokeColor(TREND_COLORS[key]).lineWidth(1).stroke();
      }
      doc.circle(px, py, 1.5).fill(TREND_COLORS[key]);
      if (lineIndex === 0) doc.circle(px, py, 1.5).fill(TREND_COLORS[key]);
    });
  });

  doc.fillColor(MUTED).font('Helvetica').fontSize(7)
    .text(`Issue volume by type — ${trendPoints.length} month${trendPoints.length === 1 ? '' : 's'} of available history`, chartX, chartY + chartH + 18, { width: chartW });
  return chartY + chartH + 36;
}

function drawComposition(doc, composition, startY) {
  const items = [
    ['Mismatch', composition.mismatch || 0],
    ['Not received', composition.notReceived || 0],
    ['Damaged', composition.damaged || 0],
    ['Lost', composition.lost || 0],
  ];
  const total = composition.totalAffected || items.reduce((s, [, v]) => s + v, 0);
  if (total <= 0) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(9).text('No affected kits this month.', 50, startY);
    return startY + 20;
  }
  let y = startY;
  const barW = doc.page.width - 100;
  let x = 50;
  items.forEach(([label, value]) => {
    if (value <= 0) return;
    const w = (value / total) * barW;
    doc.rect(x, y, w, 14).fill(BRAND_ORANGE);
    x += w;
  });
  y += 22;
  items.forEach(([label, value]) => {
    doc.fillColor(BRAND_DEEP).font('Helvetica').fontSize(8).text(`${label}: ${value}`, 50, y);
    y += 12;
  });
  return y + 8;
}

function drawSectionTitle(doc, title, y) {
  doc.fillColor(BRAND_ORANGE).font('Helvetica-Bold').fontSize(11).text(title, 50, y);
  doc.moveTo(50, y + 16).lineTo(doc.page.width - 50, y + 16).strokeColor(BORDER).stroke();
  return y + 24;
}

function drawCycleHistory(doc, dispatches, startY) {
  const rows = [];
  dispatches.forEach((dispatch) => {
    const cycles = Array.isArray(dispatch.cycles) ? dispatch.cycles : [];
    if (cycles.length) {
      cycles.forEach((cycle) => {
        rows.push({
          date: cycle.dispatchedAt || dispatch.dispatchedAt || dispatch.createdAt,
          dispatchId: dispatch.dispatchId,
          kit: dispatch.kit?.name,
          movement: cycle.movementType || '—',
          qty: cycle.quantityDispatched ?? dispatch.quantity ?? 0,
          tracking: dispatch.trackingId || '—',
          status: cycle.status || dispatch.status,
        });
      });
    } else {
      rows.push({
        date: dispatch.dispatchedAt || dispatch.createdAt,
        dispatchId: dispatch.dispatchId,
        kit: dispatch.kit?.name,
        movement: 'INITIAL',
        qty: dispatch.reportOriginalQty ?? dispatch.quantity ?? 0,
        tracking: dispatch.trackingId || '—',
        status: dispatch.status,
      });
      if ((dispatch.reportReshipQty ?? 0) > 0) {
        rows.push({
          date: dispatch.dispatchedAt || dispatch.createdAt,
          dispatchId: dispatch.dispatchId,
          kit: dispatch.kit?.name,
          movement: 'REPLACEMENT',
          qty: dispatch.reportReshipQty,
          tracking: dispatch.trackingId || '—',
          status: dispatch.status,
        });
      }
    }
  });

  if (!rows.length) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(9).text('No dispatch cycles recorded for this month.', 50, startY);
    return startY + 20;
  }

  const cols = [50, 105, 175, 285, 330, 400, 470];
  const headers = ['DATE', 'DISPATCH', 'KIT', 'TYPE', 'QTY', 'TRACKING', 'STATUS'];
  let y = startY;
  doc.rect(cols[0], y, doc.page.width - 100, 22).fill('#FFF8F0');
  doc.fillColor(BRAND_ORANGE).font('Helvetica-Bold').fontSize(7);
  headers.forEach((h, i) => doc.text(h, cols[i] + 4, y + 7));
  y += 22;

  rows.forEach((row, index) => {
    if (y > doc.page.height - 70) {
      doc.addPage();
      y = 50;
    }
    doc.rect(cols[0], y, doc.page.width - 100, 20).fill(index % 2 === 0 ? '#FFFFFF' : '#FAFAFA');
    doc.fillColor(BRAND_DEEP).font('Helvetica').fontSize(7);
    doc.text(formatDate(row.date), cols[0] + 4, y + 6, { width: 50 });
    doc.text(row.dispatchId || '—', cols[1], y + 6, { width: 65 });
    doc.text(row.kit || '—', cols[2], y + 6, { width: 105 });
    doc.text(row.movement, cols[3], y + 6, { width: 40 });
    doc.text(String(row.qty), cols[4], y + 6);
    doc.text(row.tracking, cols[5], y + 6, { width: 65 });
    doc.text(row.status || '—', cols[6], y + 6, { width: 75 });
    y += 20;
  });
  return y + 10;
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
    doc.fillColor(BRAND_DEEP).font('Helvetica-Bold').fontSize(9)
      .text(`${issue.kit?.name || 'Kit'} · ${issue.issueType || 'Issue'} · Dispatch ${dispatchId}`, 50, y);
    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
      .text(
        `Sent: ${issue.quantitySent ?? 0} · Received OK: ${issue.quantityReceived ?? 0} · Affected: ${issue.quantityAffected || 0} · Status: ${issue.status || '—'}`,
        50,
        y + 12,
      );
    y += 28;
  });
  return y + 8;
}

function drawAuditSection(doc, audit, startY) {
  doc.fillColor(MUTED).font('Helvetica').fontSize(7)
    .text('Audit lost/damaged is separate from receipt-issue Affected Kits.', 50, startY, { width: doc.page.width - 100 });
  let y = startY + 14;

  if (!audit) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(9).text('No monthly audit submitted for this period.', 50, y);
    return y + 20;
  }

  if (audit.assumedIntact) {
    doc.fillColor(BRAND_DEEP).font('Helvetica-Bold').fontSize(9)
      .text('Official audit dates ended — all kits treated as intact and exact.', 50, y);
    y += 14;
    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
      .text('No school submission. Warehouse quantity is available; audit lost 0; damaged 0.', 50, y, { width: doc.page.width - 100 });
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
  const [data, trendSeries] = await Promise.all([
    getSchoolReportData(schoolId, month),
    getSchoolTrendData(schoolId, month, 6),
  ]);
  const { school, stats, composition, dispatches, receiptIssues, audit } = data;
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
    doc.y += 24;

    let y = drawKpiCards(doc, stats, doc.y);
    y = drawSectionTitle(doc, '6-month issue trend', y);
    y = drawTrendChart(doc, trendSeries, y);
    y = drawSectionTitle(doc, 'Issue composition', y + 4);
    y = drawComposition(doc, composition || {}, y);
    y = drawSectionTitle(doc, 'Dispatch cycle history', y + 4);
    y = drawCycleHistory(doc, dispatches, y);
    y = drawSectionTitle(doc, 'Receipt outcomes', y + 4);
    y = drawReceiptIssuesSection(doc, receiptIssues, y);
    y = drawSectionTitle(doc, 'Monthly audit', y + 4);
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
