const nodemailer = require('nodemailer');
const { escapeHtml } = require('../utils/escapeHtml');
const { generateDispatchBillPdf } = require('./dispatchBillPdf');

let transporter = null;

function isSmtpConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    pool: true,
    maxConnections: 3,
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 12000,
  });

  return transporter;
}

/** Send without blocking the HTTP response when SMTP is configured. */
async function sendCredentialsEmailAsync(sendFn) {
  if (!isSmtpConfigured()) {
    return sendFn();
  }
  sendFn().catch((err) => console.error('[email] Failed to send credentials:', err.message));
  return { sent: true, reason: 'Credentials email is being sent.' };
}

async function sendMail({ to, subject, text, html, attachments }) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@wizklub.com';
  const mailer = getTransporter();

  if (!mailer) {
    console.log('\n========== EMAIL (SMTP not configured) ==========');
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    if (attachments?.length) {
      console.log(`Attachments: ${attachments.map((a) => a.filename).join(', ')}`);
    }
    console.log(text);
    console.log('=================================================\n');
    return { sent: false, reason: 'SMTP not configured — logged to server console' };
  }

  await mailer.sendMail({ from, to, subject, text, html, attachments });
  return { sent: true };
}

function resolveDivisionNames({ divisionNames, divisionName }) {
  const fromList = Array.isArray(divisionNames)
    ? divisionNames.map((n) => String(n || '').trim()).filter(Boolean)
    : [];
  if (fromList.length) return fromList;
  const single = String(divisionName || '').trim();
  return single ? [single] : [];
}

function formatDivisionList(names) {
  if (names.length === 0) return '—';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

async function sendAccountManagerCredentialsEmail({
  to,
  name,
  password,
  divisionName,
  divisionNames,
  isRegenerated = false,
}) {
  const loginUrl = process.env.FRONTEND_URL
    ? `${process.env.FRONTEND_URL.replace(/\/$/, '')}/login/am`
    : 'http://localhost:5173/login/am';

  const names = resolveDivisionNames({ divisionNames, divisionName });
  const divisionLabel = names.length === 1 ? 'Division' : 'Divisions';
  const divisionList = formatDivisionList(names);
  const divisionHtml = names.length
    ? names.map((n) => escapeHtml(n)).join('<br>')
    : '—';

  const subject = isRegenerated
    ? 'WizKlub — Your Account Manager password has been reset'
    : 'WizKlub — Your Account Manager account credentials';

  const html = `
    <div style="font-family: Inter, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #101828;">
      <h2 style="color: #F7941D;">WizKlub Inventory Portal</h2>
      <p>Hello <strong>${escapeHtml(name)}</strong>,</p>
      <p>
        ${isRegenerated
          ? 'Your Account Manager password has been reset by the administrator.'
          : `You have been assigned as Account Manager for <strong>${escapeHtml(divisionList)}</strong>.`}
      </p>
      <table style="margin: 20px 0; border-collapse: collapse; width: 100%;">
        <tr><td style="padding: 8px 0; color: #6C757D; vertical-align: top;">Portal</td><td><a href="${loginUrl}">${loginUrl}</a></td></tr>
        <tr><td style="padding: 8px 0; color: #6C757D; vertical-align: top;">Email</td><td><strong>${escapeHtml(to)}</strong></td></tr>
        <tr><td style="padding: 8px 0; color: #6C757D; vertical-align: top;">Password</td><td><strong>${escapeHtml(password)}</strong></td></tr>
        <tr><td style="padding: 8px 0; color: #6C757D; vertical-align: top;">${divisionLabel}</td><td><strong>${divisionHtml}</strong></td></tr>
      </table>
      <p style="font-size: 13px; color: #6C757D;">Please sign in after receiving this email.</p>
      <p style="font-size: 12px; color: #ADB5BD;">— WizKlub Operations</p>
    </div>
  `;

  const text = [
    `Hello ${name},`,
    '',
    isRegenerated
      ? 'Your Account Manager password has been reset.'
      : `You are now Account Manager for ${divisionList}.`,
    '',
    `Login: ${loginUrl}`,
    `Email: ${to}`,
    `Password: ${password}`,
    `${divisionLabel}: ${names.length ? names.join(', ') : '—'}`,
  ].join('\n');

  return sendMail({ to, subject, text, html });
}

async function sendSchoolCredentialsEmail({
  to,
  name,
  schoolName,
  schoolCode,
  password,
  isRegenerated = false,
}) {
  const loginUrl = process.env.FRONTEND_URL
    ? `${process.env.FRONTEND_URL.replace(/\/$/, '')}/login/school`
    : 'http://localhost:5173/login/school';

  const subject = isRegenerated
    ? `WizKlub — School portal password reset for ${schoolName}`
    : `WizKlub — School portal credentials for ${schoolName}`;

  const html = `
    <div style="font-family: Inter, Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #101828;">
      <h2 style="color: #F7941D;">WizKlub School Portal</h2>
      <p>Hello <strong>${name}</strong>,</p>
      <p>
        ${isRegenerated
          ? `Your portal password for <strong>${schoolName}</strong> has been reset by the administrator.`
          : `Your school <strong>${schoolName}</strong> has been registered on the WizKlub Inventory portal.`}
      </p>
      <table style="margin: 20px 0; border-collapse: collapse; width: 100%;">
        <tr><td style="padding: 8px 0; color: #6C757D;">Portal</td><td><a href="${loginUrl}">${loginUrl}</a></td></tr>
        <tr><td style="padding: 8px 0; color: #6C757D;">School</td><td><strong>${schoolName}</strong></td></tr>
        <tr><td style="padding: 8px 0; color: #6C757D;">School ID (login)</td><td><strong>${schoolCode}</strong></td></tr>
        <tr><td style="padding: 8px 0; color: #6C757D;">Password</td><td><strong>${password}</strong></td></tr>
        <tr><td style="padding: 8px 0; color: #6C757D;">Contact email</td><td>${to}</td></tr>
      </table>
      <p style="font-size: 13px; color: #6C757D;">Sign in with your <strong>School ID</strong> and password. The contact email is for notifications only.</p>
      <p style="font-size: 12px; color: #ADB5BD;">— WizKlub Operations</p>
    </div>
  `;

  const text = [
    `Hello ${name},`,
    '',
    isRegenerated
      ? `Your portal password for ${schoolName} has been reset.`
      : `${schoolName} (${schoolCode}) is now on the WizKlub portal.`,
    '',
    `Login: ${loginUrl}`,
    `School ID: ${schoolCode}`,
    `Password: ${password}`,
    `Contact email: ${to}`,
  ].join('\n');

  return sendMail({ to, subject, text, html });
}

async function sendDispatchCreatedEmail({ to, recipientName, schoolName, kitName, quantity, componentId, consignmentNo, dispatchId }) {
  return sendDispatchBatchEmail({
    to,
    recipientName,
    schoolName,
    consignmentNo,
    items: [{ kitName, quantity, componentId, dispatchId }],
  });
}

async function sendDispatchBatchEmail({
  to,
  recipientName,
  recipientRole = 'school',
  schoolName,
  schoolCode,
  divisionName,
  category,
  consignmentNo,
  amName,
  authorizedAt,
  items,
  pdfBuffer,
}) {
  const safe = {
    recipientName: escapeHtml(recipientName),
    schoolName: escapeHtml(schoolName),
    schoolCode: escapeHtml(schoolCode),
    divisionName: escapeHtml(divisionName),
    category: escapeHtml(category || 'New Dispatch'),
    consignmentNo: escapeHtml(consignmentNo || '—'),
    amName: escapeHtml(amName || '—'),
  };

  const dateLabel = authorizedAt
    ? new Date(authorizedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    : new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

  const intro = recipientRole === 'am'
    ? `A new kit dispatch has been authorized for <strong>${safe.schoolName}</strong> in your division. The dispatch challan is attached as a PDF for your records.`
    : `A new kit shipment has been authorized for <strong>${safe.schoolName}</strong>. Please find the dispatch challan attached — confirm receipt in the school portal once kits arrive.`;

  const subject = `WizKlub Dispatch · ${schoolName} · Consignment ${consignmentNo || '—'}`;

  const itemRows = (items || []).map(
    (item) => `
      <tr>
        <td style="padding:14px 12px;border-bottom:1px solid #F1F5F9;">
          <div style="font-weight:700;color:#0F172A;font-size:14px;">${escapeHtml(item.kitName)}</div>
        </td>
        <td style="padding:14px 12px;border-bottom:1px solid #F1F5F9;text-align:center;font-weight:700;color:#F7941D;">${escapeHtml(item.quantity)}</td>
        <td style="padding:14px 12px;border-bottom:1px solid #F1F5F9;font-family:Consolas,Monaco,monospace;font-size:12px;color:#334155;">${escapeHtml(item.componentId)}</td>
        <td style="padding:14px 12px;border-bottom:1px solid #F1F5F9;font-size:12px;color:#475569;">${escapeHtml(item.dispatchId)}</td>
      </tr>`
  ).join('');

  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:Inter,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F8FAFC;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 10px 40px rgba(15,23,42,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#F7941D 0%,#F15A24 100%);padding:28px 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <div style="font-size:24px;font-weight:800;color:#FFFFFF;letter-spacing:-0.02em;">WizKlub</div>
                    <div style="font-size:12px;color:rgba(255,255,255,0.88);margin-top:4px;text-transform:uppercase;letter-spacing:0.12em;">Dispatch Authorization</div>
                  </td>
                  <td align="right" style="vertical-align:top;">
                    <div style="display:inline-block;background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.25);border-radius:999px;padding:8px 14px;font-size:11px;font-weight:700;color:#FFFFFF;text-transform:uppercase;letter-spacing:0.08em;">
                      ${safe.category}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 8px;font-size:15px;color:#64748B;">Hello <strong style="color:#0F172A;">${safe.recipientName}</strong>,</p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#334155;">${intro}</p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FFF8F0;border:1px solid #FDE6C8;border-radius:14px;margin-bottom:24px;">
                <tr>
                  <td style="padding:18px 20px;width:50%;vertical-align:top;border-right:1px solid #FDE6C8;">
                    <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#F15A24;font-weight:700;margin-bottom:6px;">Destination School</div>
                    <div style="font-size:16px;font-weight:800;color:#0F172A;line-height:1.4;">${safe.schoolName}</div>
                    <div style="font-size:12px;color:#64748B;margin-top:8px;">School ID: <strong style="color:#334155;">${safe.schoolCode}</strong></div>
                  </td>
                  <td style="padding:18px 20px;width:50%;vertical-align:top;">
                    <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#F15A24;font-weight:700;margin-bottom:6px;">Shipment Details</div>
                    <div style="font-size:13px;color:#334155;line-height:1.8;">
                      <div><span style="color:#64748B;">Consignment:</span> <strong>${safe.consignmentNo}</strong></div>
                      <div><span style="color:#64748B;">Division:</span> <strong>${safe.divisionName}</strong></div>
                      <div><span style="color:#64748B;">Account Manager:</span> <strong>${safe.amName}</strong></div>
                      <div><span style="color:#64748B;">Authorized:</span> <strong>${escapeHtml(dateLabel)}</strong></div>
                    </div>
                  </td>
                </tr>
              </table>

              <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.1em;color:#F15A24;font-weight:700;margin-bottom:10px;">Kit Line Items</div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;">
                <thead>
                  <tr style="background:#FFF8F0;">
                    <th align="left" style="padding:12px;font-size:11px;color:#64748B;text-transform:uppercase;letter-spacing:0.08em;">Kit</th>
                    <th align="center" style="padding:12px;font-size:11px;color:#64748B;text-transform:uppercase;letter-spacing:0.08em;">Qty</th>
                    <th align="left" style="padding:12px;font-size:11px;color:#64748B;text-transform:uppercase;letter-spacing:0.08em;">Component ID</th>
                    <th align="left" style="padding:12px;font-size:11px;color:#64748B;text-transform:uppercase;letter-spacing:0.08em;">Dispatch ID</th>
                  </tr>
                </thead>
                <tbody>${itemRows}</tbody>
              </table>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:24px;background:#F8FAFC;border-radius:12px;border:1px dashed #CBD5E1;">
                <tr>
                  <td style="padding:16px 18px;font-size:13px;line-height:1.6;color:#475569;">
                    📎 <strong>Dispatch challan attached</strong> — A PDF copy of this dispatch bill is included with this email for audit, logistics, and school receipt records.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;background:#0F172A;text-align:center;">
              <div style="font-size:12px;color:rgba(255,255,255,0.72);line-height:1.6;">WizKlub Inventory Operations</div>
              <div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:6px;">This is an automated dispatch notification. Please do not reply to this email.</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `Hello ${recipientName},`,
    '',
    recipientRole === 'am'
      ? `New dispatch authorized for ${schoolName} (${schoolCode}).`
      : `New kit shipment authorized for ${schoolName}.`,
    '',
    `Consignment: ${consignmentNo || '—'}`,
    `Division: ${divisionName || '—'}`,
    `Category: ${category || 'New Dispatch'}`,
    `Account Manager: ${amName || '—'}`,
    `Authorized: ${dateLabel}`,
    '',
    'Line items:',
    ...(items || []).flatMap((item) => [
      `— ${item.kitName} × ${item.quantity}`,
      `  Component ID: ${item.componentId}`,
      `  Dispatch ID: ${item.dispatchId}`,
      '',
    ]),
    'PDF dispatch challan is attached to this email.',
  ].join('\n');

  const pdfFilename = `WizKlub-Dispatch-${String(consignmentNo || 'bill').replace(/[^\w.-]+/g, '_')}.pdf`;
  const attachments = pdfBuffer && Buffer.isBuffer(pdfBuffer) && pdfBuffer.length > 0
    ? [{
      filename: pdfFilename,
      content: pdfBuffer,
      contentType: 'application/pdf',
      contentDisposition: 'attachment',
    }]
    : undefined;

  return sendMail({ to, subject, text, html, attachments });
}

async function buildAndSendDispatchNotifications(payload) {
  let pdfBuffer = null;
  try {
    pdfBuffer = await generateDispatchBillPdf({
      consignmentNo: payload.consignmentNo,
      schoolName: payload.schoolName,
      schoolCode: payload.schoolCode,
      divisionName: payload.divisionName,
      category: payload.category,
      amName: payload.amName,
      authorizedBy: payload.authorizedBy,
      authorizedAt: payload.authorizedAt,
      items: payload.items,
    });
  } catch (error) {
    console.error('[email] Failed to generate dispatch PDF:', error.message);
  }

  const emailPayload = { ...payload, pdfBuffer };
  const sendTasks = [];

  if (payload.amEmail) {
    sendTasks.push(sendDispatchBatchEmail({
      to: payload.amEmail,
      recipientName: payload.amName,
      recipientRole: 'am',
      ...emailPayload,
    }));
  }

  if (payload.schoolEmail) {
    sendTasks.push(sendDispatchBatchEmail({
      to: payload.schoolEmail,
      recipientName: payload.schoolName,
      recipientRole: 'school',
      ...emailPayload,
    }));
  }

  return Promise.all(sendTasks);
}

/** Send dispatch emails without blocking the HTTP response when SMTP is configured. */
async function sendDispatchNotificationsAsync(sendFn) {
  if (!isSmtpConfigured()) {
    return sendFn();
  }
  sendFn().catch((err) => console.error('[email] Failed to send dispatch notifications:', err.message));
  return [{ sent: false, reason: 'Dispatch notification emails are being sent.' }];
}

async function sendDeliveryConfirmationEmail({
  to,
  recipientName,
  recipientRole = 'admin',
  schoolName,
  schoolCode,
  divisionName,
  kitName,
  dispatchId,
  consignmentNo,
  quantitySent,
  quantityReceived,
  lostOnReceipt,
  damagedOnReceipt,
  status,
  receiptNotes,
  receivedAt,
  receiverName,
}) {
  const safe = {
    recipientName: escapeHtml(recipientName),
    schoolName: escapeHtml(schoolName),
    schoolCode: escapeHtml(schoolCode),
    divisionName: escapeHtml(divisionName || '—'),
    kitName: escapeHtml(kitName),
    dispatchId: escapeHtml(dispatchId || '—'),
    consignmentNo: escapeHtml(consignmentNo || '—'),
    status: escapeHtml(status),
    receiptNotes: escapeHtml(receiptNotes || '—'),
    receiverName: escapeHtml(receiverName || '—'),
  };

  const receivedLabel = receivedAt
    ? new Date(receivedAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })
    : new Date().toLocaleDateString('en-IN', { dateStyle: 'medium' });

  const hasMismatch = (lostOnReceipt || 0) + (damagedOnReceipt || 0) > 0;
  const statusColor = ['Delivery Completed', 'Received', 'Damage Under Review', 'Missing Item Under Review'].includes(status) ? '#059669' : '#DC2626';
  const intro = recipientRole === 'am'
    ? `<strong>${safe.schoolName}</strong> has acknowledged receipt of a kit dispatch in your division.`
    : `<strong>${safe.schoolName}</strong> has acknowledged receipt of a kit dispatch.`;

  const subject = `WizKlub Receipt · ${schoolName} · ${consignmentNo || dispatchId || 'Dispatch'}`;

  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:Inter,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F8FAFC;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 10px 40px rgba(15,23,42,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#059669 0%,#047857 100%);padding:28px 32px;">
              <div style="font-size:24px;font-weight:800;color:#FFFFFF;letter-spacing:-0.02em;">WizKlub</div>
              <div style="font-size:12px;color:rgba(255,255,255,0.88);margin-top:4px;text-transform:uppercase;letter-spacing:0.12em;">Dispatch Receipt Confirmed</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 8px;font-size:15px;color:#64748B;">Hello <strong style="color:#0F172A;">${safe.recipientName}</strong>,</p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#334155;">${intro}</p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:14px;margin-bottom:24px;">
                <tr>
                  <td style="padding:18px 20px;width:50%;vertical-align:top;border-right:1px solid #BBF7D0;">
                    <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#047857;font-weight:700;margin-bottom:6px;">School</div>
                    <div style="font-size:16px;font-weight:800;color:#0F172A;line-height:1.4;">${safe.schoolName}</div>
                    <div style="font-size:12px;color:#64748B;margin-top:8px;">School ID: <strong style="color:#334155;">${safe.schoolCode}</strong></div>
                    <div style="font-size:12px;color:#64748B;margin-top:4px;">Division: <strong style="color:#334155;">${safe.divisionName}</strong></div>
                  </td>
                  <td style="padding:18px 20px;width:50%;vertical-align:top;">
                    <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:#047857;font-weight:700;margin-bottom:6px;">Receipt Status</div>
                    <div style="font-size:18px;font-weight:800;color:${statusColor};">${safe.status}</div>
                    <div style="font-size:12px;color:#64748B;margin-top:8px;">Received date: <strong style="color:#334155;">${escapeHtml(receivedLabel)}</strong></div>
                    <div style="font-size:12px;color:#64748B;margin-top:4px;">Receiver: <strong style="color:#334155;">${safe.receiverName}</strong></div>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;margin-bottom:24px;">
                <tr style="background:#F8FAFC;">
                  <td style="padding:12px 16px;font-size:11px;color:#64748B;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Kit</td>
                  <td style="padding:12px 16px;font-size:11px;color:#64748B;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Sent</td>
                  <td style="padding:12px 16px;font-size:11px;color:#64748B;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Received</td>
                </tr>
                <tr>
                  <td style="padding:14px 16px;font-weight:700;color:#0F172A;">${safe.kitName}</td>
                  <td style="padding:14px 16px;font-weight:700;color:#334155;">${escapeHtml(quantitySent)}</td>
                  <td style="padding:14px 16px;font-weight:700;color:#059669;">${escapeHtml(quantityReceived)}</td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F8FAFC;border-radius:12px;border:1px solid #E2E8F0;margin-bottom:16px;">
                <tr>
                  <td style="padding:16px 18px;font-size:13px;line-height:1.8;color:#475569;">
                    <div><span style="color:#64748B;">Dispatch ID:</span> <strong style="font-family:Consolas,Monaco,monospace;">${safe.dispatchId}</strong></div>
                    <div><span style="color:#64748B;">Tracking ID (Consignment):</span> <strong>${safe.consignmentNo}</strong></div>
                    ${hasMismatch ? `<div style="margin-top:8px;color:#DC2626;"><strong>Lost:</strong> ${escapeHtml(lostOnReceipt || 0)} &nbsp;·&nbsp; <strong>Damaged:</strong> ${escapeHtml(damagedOnReceipt || 0)}</div>` : ''}
                    <div style="margin-top:8px;"><span style="color:#64748B;">Notes:</span> ${safe.receiptNotes}</div>
                  </td>
                </tr>
              </table>

              ${hasMismatch ? `<p style="margin:0;font-size:13px;color:#B45309;background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:12px 16px;">Replacement requests may have been auto-created for lost or damaged kits.</p>` : ''}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;background:#0F172A;text-align:center;">
              <div style="font-size:12px;color:rgba(255,255,255,0.72);line-height:1.6;">WizKlub Inventory Operations</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `Hello ${recipientName},`,
    '',
    `${schoolName} has acknowledged receipt of a kit dispatch.`,
    '',
    `Status: ${status}`,
    `School: ${schoolName} (${schoolCode})`,
    `Division: ${divisionName || '—'}`,
    `Kit: ${kitName}`,
    `Sent: ${quantitySent} · Received: ${quantityReceived}`,
    `Dispatch ID: ${dispatchId || '—'}`,
    `Tracking ID (Consignment): ${consignmentNo || '—'}`,
    hasMismatch ? `Lost: ${lostOnReceipt || 0} · Damaged: ${damagedOnReceipt || 0}` : null,
    `Notes: ${receiptNotes || '—'}`,
    `Receiver: ${receiverName || '—'}`,
    `Received date: ${receivedLabel}`,
  ].filter(Boolean).join('\n');

  return sendMail({ to, subject, text, html });
}

async function sendReceiptAcknowledgmentEmail({
  to,
  recipientName,
  recipientRole = 'admin',
  receiptCategory,
  schoolName,
  schoolCode,
  divisionName,
  consignmentNo,
  receiverName,
  receivedAt,
  receiptNotes,
  dispatches = [],
  issues = [],
  extraInfo = {},
}) {
  const categoryMeta = {
    all_received: {
      label: 'Delivery Completed',
      headline: 'All Items Received',
      intro: 'has confirmed that all items were received correctly.',
      color: '#059669',
      gradient: 'linear-gradient(135deg,#059669 0%,#047857 100%)',
    },
    report_issue: {
      label: 'Received with Issues',
      headline: 'Issue Reported — Under Review',
      intro: 'has acknowledged receipt but reported issues that require admin review.',
      color: '#D97706',
      gradient: 'linear-gradient(135deg,#F59E0B 0%,#D97706 100%)',
    },
    not_received: {
      label: 'Shipment Not Received',
      headline: 'Shipment Not Received',
      intro: 'has reported that the shipment was not received.',
      color: '#DC2626',
      gradient: 'linear-gradient(135deg,#EF4444 0%,#DC2626 100%)',
    },
    issue_am_approved: {
      label: 'Issue Approved by AM',
      headline: 'Receipt Issue — AM Approved',
      intro: 'An Account Manager has approved a receipt issue. Admin authorization is required next.',
      color: '#2563EB',
      gradient: 'linear-gradient(135deg,#3B82F6 0%,#2563EB 100%)',
    },
    issue_admin_approved: {
      label: 'Replacement Dispatched',
      headline: 'Receipt Issue — Admin Authorized',
      intro: 'Admin has authorized the replacement dispatch for a reported receipt issue.',
      color: '#059669',
      gradient: 'linear-gradient(135deg,#059669 0%,#047857 100%)',
    },
    issue_rejected: {
      label: 'Receipt Issue Rejected',
      headline: 'Receipt Issue — Rejected',
      intro: 'A receipt issue report has been rejected.',
      color: '#DC2626',
      gradient: 'linear-gradient(135deg,#EF4444 0%,#DC2626 100%)',
    },
    issue_clarification: {
      label: 'Clarification Requested',
      headline: 'Receipt Issue — Clarification Needed',
      intro: 'Admin has requested clarification on a receipt issue report.',
      color: '#D97706',
      gradient: 'linear-gradient(135deg,#F59E0B 0%,#D97706 100%)',
    },
  };

  const meta = categoryMeta[receiptCategory] || categoryMeta.all_received;
  const safe = {
    recipientName: escapeHtml(recipientName),
    schoolName: escapeHtml(schoolName),
    schoolCode: escapeHtml(schoolCode),
    divisionName: escapeHtml(divisionName || '—'),
    consignmentNo: escapeHtml(consignmentNo || '—'),
    receiverName: escapeHtml(receiverName || '—'),
    receiptNotes: escapeHtml(receiptNotes || '—'),
    label: escapeHtml(meta.label),
  };

  const receivedLabel = receivedAt
    ? new Date(receivedAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })
    : new Date().toLocaleDateString('en-IN', { dateStyle: 'medium' });

  const dispatchRows = dispatches.map((d) => `
    <tr>
      <td style="padding:14px 16px;font-weight:700;color:#0F172A;">${escapeHtml(d.kit?.name || 'Kit')}</td>
      <td style="padding:14px 16px;font-weight:700;color:#334155;">${escapeHtml(d.quantity)}</td>
      <td style="padding:14px 16px;font-weight:700;color:#059669;">${escapeHtml(d.quantityReceived ?? 0)}</td>
      <td style="padding:14px 16px;font-size:12px;color:#475569;">${escapeHtml(d.status || '—')}</td>
    </tr>`).join('');

  const issueRows = issues.map((issue) => `
    <tr>
      <td style="padding:12px 16px;font-weight:600;color:#0F172A;">${escapeHtml(issue.kit?.name || 'Kit')}</td>
      <td style="padding:12px 16px;">${escapeHtml(issue.quantityReceived)}/${escapeHtml(issue.quantitySent)} (${escapeHtml(issue.quantityAffected)} affected)</td>
      <td style="padding:12px 16px;"><strong>${escapeHtml(issue.issueType)}</strong></td>
      <td style="padding:12px 16px;font-size:12px;color:#475569;">${escapeHtml(issue.status)}</td>
    </tr>`).join('');

  const workflowExtra = [
    extraInfo.parentDispatchRef && `<div><span style="color:#64748B;">Dispatch ID (original):</span> <strong>${escapeHtml(extraInfo.parentDispatchRef)}</strong></div>`,
    extraInfo.newConsignmentNo && `<div><span style="color:#64748B;">New tracking ID:</span> <strong>${escapeHtml(extraInfo.newConsignmentNo)}</strong></div>`,
    extraInfo.workflowNote && `<div style="margin-top:8px;"><span style="color:#64748B;">Notes:</span> ${escapeHtml(extraInfo.workflowNote)}</div>`,
  ].filter(Boolean).join('');

  const intro = recipientRole === 'am'
    ? `<strong>${safe.schoolName}</strong> ${meta.intro}`
    : `<strong>${safe.schoolName}</strong> ${meta.intro}`;

  const subject = `WizKlub · ${meta.label} · ${schoolName} · ${consignmentNo || dispatches[0]?.dispatchId || 'Dispatch'}`;

  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:Inter,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F8FAFC;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 10px 40px rgba(15,23,42,0.08);">
        <tr>
          <td style="background:${meta.gradient};padding:28px 32px;">
            <div style="font-size:24px;font-weight:800;color:#FFFFFF;">WizKlub</div>
            <div style="font-size:12px;color:rgba(255,255,255,0.88);margin-top:4px;text-transform:uppercase;letter-spacing:0.12em;">${meta.headline}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 8px;font-size:15px;color:#64748B;">Hello <strong style="color:#0F172A;">${safe.recipientName}</strong>,</p>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#334155;">${intro}</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:14px;margin-bottom:24px;">
              <tr>
                <td style="padding:18px 20px;">
                  <div style="font-size:10px;text-transform:uppercase;color:#64748B;font-weight:700;margin-bottom:6px;">Acknowledgment type</div>
                  <div style="font-size:18px;font-weight:800;color:${meta.color};">${safe.label}</div>
                  <div style="font-size:13px;color:#475569;margin-top:12px;line-height:1.8;">
                    <div>School: <strong>${safe.schoolName}</strong> (${safe.schoolCode})</div>
                    <div>Division: <strong>${safe.divisionName}</strong></div>
                    <div>Consignment: <strong>${safe.consignmentNo}</strong></div>
                    <div>Receiver: <strong>${safe.receiverName}</strong></div>
                    <div>Received date: <strong>${escapeHtml(receivedLabel)}</strong></div>
                    <div>Notes: ${safe.receiptNotes}</div>
                    ${workflowExtra ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid #E2E8F0;">${workflowExtra}</div>` : ''}
                  </div>
                </td>
              </tr>
            </table>
            <div style="font-size:12px;text-transform:uppercase;color:#64748B;font-weight:700;margin-bottom:10px;">Kit line items</div>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;margin-bottom:24px;">
              <thead><tr style="background:#F8FAFC;">
                <th align="left" style="padding:12px 16px;font-size:11px;color:#64748B;">Kit</th>
                <th align="left" style="padding:12px 16px;font-size:11px;color:#64748B;">Sent</th>
                <th align="left" style="padding:12px 16px;font-size:11px;color:#64748B;">Received</th>
                <th align="left" style="padding:12px 16px;font-size:11px;color:#64748B;">Status</th>
              </tr></thead>
              <tbody>${dispatchRows}</tbody>
            </table>
            ${issues.length > 0 ? `
            <div style="font-size:12px;text-transform:uppercase;color:#D97706;font-weight:700;margin-bottom:10px;">Reported issues</div>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #FDE68A;border-radius:12px;overflow:hidden;margin-bottom:16px;">
              <thead><tr style="background:#FFFBEB;">
                <th align="left" style="padding:12px 16px;font-size:11px;color:#92400E;">Item</th>
                <th align="left" style="padding:12px 16px;font-size:11px;color:#92400E;">Received</th>
                <th align="left" style="padding:12px 16px;font-size:11px;color:#92400E;">Issue type</th>
                <th align="left" style="padding:12px 16px;font-size:11px;color:#92400E;">Review status</th>
              </tr></thead>
              <tbody>${issueRows}</tbody>
            </table>` : ''}
          </td>
        </tr>
        <tr><td style="padding:20px 32px 28px;background:#0F172A;text-align:center;">
          <div style="font-size:12px;color:rgba(255,255,255,0.72);">WizKlub Inventory Operations</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const textLines = [
    `Hello ${recipientName},`,
    '',
    `${schoolName} — ${meta.label}`,
    meta.intro,
    '',
    `Consignment: ${consignmentNo || '—'}`,
    `Receiver: ${receiverName || '—'}`,
    `Received date: ${receivedLabel}`,
    `Notes: ${receiptNotes || '—'}`,
    '',
    'Kit items:',
    ...dispatches.flatMap((d) => [`- ${d.kit?.name}: sent ${d.quantity}, received ${d.quantityReceived ?? 0}, status ${d.status}`]),
  ];

  if (issues.length > 0) {
    textLines.push('', 'Reported issues:');
    issues.forEach((issue) => {
      textLines.push(`- ${issue.kit?.name}: ${issue.quantityReceived}/${issue.quantitySent} (${issue.quantityAffected} affected) — ${issue.issueType} (${issue.status})`);
    });
  }
  if (extraInfo.parentDispatchRef) textLines.push('', `Dispatch ID (original): ${extraInfo.parentDispatchRef}`);
  if (extraInfo.newConsignmentNo) textLines.push(`New tracking ID: ${extraInfo.newConsignmentNo}`);
  if (extraInfo.workflowNote) textLines.push(`Workflow notes: ${extraInfo.workflowNote}`);

  return sendMail({ to, subject, text: textLines.join('\n'), html });
}

async function buildAndSendReceiptAcknowledgmentEmails(payload) {
  const { recipients, receiptCategory, dispatches, issues, schoolName, schoolCode, divisionName, consignmentNo, receiverName, receivedAt, receiptNotes, extraInfo } = payload;
  const uniqueByEmail = new Map();

  for (const user of recipients || []) {
    if (user?.email && !uniqueByEmail.has(user.email.toLowerCase())) {
      uniqueByEmail.set(user.email.toLowerCase(), user);
    }
  }

  const sendTasks = [...uniqueByEmail.values()].map((user) =>
    sendReceiptAcknowledgmentEmail({
      to: user.email,
      recipientName: user.name,
      recipientRole: user.role === 'AM' ? 'am' : 'admin',
      receiptCategory,
      schoolName,
      schoolCode,
      divisionName,
      consignmentNo,
      receiverName,
      receivedAt,
      receiptNotes,
      dispatches,
      issues,
      extraInfo,
    })
  );

  return Promise.all(sendTasks);
}

async function buildAndSendDeliveryConfirmationEmails(payload) {
  const { recipients, dispatch, schoolName, schoolCode, divisionName } = payload;
  const uniqueByEmail = new Map();

  for (const user of recipients || []) {
    if (user?.email && !uniqueByEmail.has(user.email.toLowerCase())) {
      uniqueByEmail.set(user.email.toLowerCase(), user);
    }
  }

  const sendTasks = [...uniqueByEmail.values()].map((user) =>
    sendDeliveryConfirmationEmail({
      to: user.email,
      recipientName: user.name,
      recipientRole: user.role === 'AM' ? 'am' : 'admin',
      schoolName,
      schoolCode,
      divisionName,
      kitName: dispatch.kit?.name || 'Kit',
      dispatchId: dispatch.dispatchId,
      consignmentNo: dispatch.consignmentNo || dispatch.trackingId,
      quantitySent: dispatch.quantity,
      quantityReceived: dispatch.quantityReceived,
      lostOnReceipt: dispatch.lostOnReceipt,
      damagedOnReceipt: dispatch.damagedOnReceipt,
      status: dispatch.status,
      receiptNotes: dispatch.receiptNotes,
      receivedAt: dispatch.receivedAt,
      receiverName: dispatch.receiverName,
    })
  );

  return Promise.all(sendTasks);
}

/** Send receipt confirmation emails without blocking the HTTP response when SMTP is configured. */
async function sendDeliveryConfirmationEmailsAsync(sendFn) {
  if (!isSmtpConfigured()) {
    return sendFn();
  }
  sendFn().catch((err) => console.error('[email] Failed to send receipt confirmation emails:', err.message));
  return [{ sent: false, reason: 'Receipt confirmation emails are being sent.' }];
}

module.exports = {
  isSmtpConfigured,
  sendCredentialsEmailAsync,
  sendDispatchNotificationsAsync,
  sendDeliveryConfirmationEmailsAsync,
  sendAccountManagerCredentialsEmail,
  sendSchoolCredentialsEmail,
  sendDispatchCreatedEmail,
  sendDispatchBatchEmail,
  sendDeliveryConfirmationEmail,
  sendReceiptAcknowledgmentEmail,
  buildAndSendDispatchNotifications,
  buildAndSendDeliveryConfirmationEmails,
  buildAndSendReceiptAcknowledgmentEmails,
};
