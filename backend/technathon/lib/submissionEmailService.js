'use strict';

const fs = require('fs');
const path = require('path');
const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');

const sesRegion = String(process.env.SES_REGION || process.env.AWS_REGION || 'ap-south-1').trim();
const sesFromEmail = String(process.env.SES_FROM_EMAIL || '').trim();
const sesReplyToEmail = String(process.env.SES_REPLY_TO_EMAIL || '').trim();
const sesAccessKeyId = String(
  process.env.AWS_NOTIF_ACCESS_KEY || process.env.SES_ACCESS_KEY_ID || '',
).trim();
const sesSecretAccessKey = String(
  process.env.AWS_NOTIF_SECRET_KEY || process.env.SES_SECRET_ACCESS_KEY || '',
).trim();
const sesSessionToken = String(
  process.env.AWS_NOTIF_SESSION_TOKEN || process.env.SES_SESSION_TOKEN || '',
).trim();
const DEFAULT_SES_STUDENT_SUBMISSION_TEMPLATE_NAME = 'WIZ_TECHNATHON_STUDENT_SUBMISSION_CONFIRMATION';
const sesStudentSubmissionTemplateName = String(
  process.env.SES_STUDENT_SUBMISSION_TEMPLATE_NAME || DEFAULT_SES_STUDENT_SUBMISSION_TEMPLATE_NAME,
).trim();

const sesClientConfig = { region: sesRegion };
if (sesAccessKeyId && sesSecretAccessKey) {
  sesClientConfig.credentials = {
    accessKeyId: sesAccessKeyId,
    secretAccessKey: sesSecretAccessKey,
    ...(sesSessionToken ? { sessionToken: sesSessionToken } : {}),
  };
} else if (sesAccessKeyId || sesSecretAccessKey) {
  console.warn('[mail] SES explicit credentials are partially configured; falling back to default AWS credential chain.');
}
const sesClient = new SESv2Client(sesClientConfig);

/** Inline file as CID attachment for broad email-client support. */
const LOGO_FILE_MAX_BYTES = 120 * 1024;
const LOGO_MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};
const DEFAULT_LOGO_CID = 'wizklub-logo';

function readLogoFileAsInlineAttachment(logoPath) {
  const raw = String(logoPath || '').trim();
  if (!raw) return null;
  const abs = path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
  try {
    if (!fs.existsSync(abs)) {
      console.warn(`[mail] WIZKLUB_LOGO_PATH not found: ${abs}`);
      return null;
    }
    const buf = fs.readFileSync(abs);
    if (buf.length > LOGO_FILE_MAX_BYTES) {
      console.warn(`[mail] WIZKLUB_LOGO_PATH exceeds ${LOGO_FILE_MAX_BYTES} bytes (use a compressed PNG): ${abs}`);
      return null;
    }
    const ext = path.extname(abs).toLowerCase();
    const mime = LOGO_MIME_BY_EXT[ext] || 'image/png';
    const fileName = path.basename(abs) || `logo${ext || '.png'}`;
    return {
      logoUrl: `cid:${DEFAULT_LOGO_CID}`,
      attachment: {
        RawContent: buf,
        ContentDisposition: 'INLINE',
        FileName: fileName,
        ContentId: DEFAULT_LOGO_CID,
        ContentType: mime,
        ContentTransferEncoding: 'BASE64',
      },
    };
  } catch (e) {
    console.warn('[mail] WIZKLUB_LOGO_PATH read failed:', e && e.message);
    return null;
  }
}

/**
 * Value passed to SES template as `logo_url` (used in <img src>).
 * Priority: WIZKLUB_LOGO_PATH (CID attachment) → WIZKLUB_LOGO_URL (public HTTPS) → favicon fallback.
 */
function resolveLogoForSesTemplate() {
  const fromFile = readLogoFileAsInlineAttachment(process.env.WIZKLUB_LOGO_PATH);
  if (fromFile) {
    return {
      logoUrl: fromFile.logoUrl,
      attachments: [fromFile.attachment],
    };
  }

  const u = String(process.env.WIZKLUB_LOGO_URL || '').trim();
  if (u && /^https?:\/\//i.test(u)) {
    if (/\b(localhost|127\.0\.0\.1)\b/i.test(u)) {
      console.warn(
        '[mail] WIZKLUB_LOGO_URL points at localhost — email clients will not load it. ' +
          'Host the logo on a public HTTPS URL or set WIZKLUB_LOGO_PATH to a PNG/JPG on disk.',
      );
    }
    return { logoUrl: u, attachments: [] };
  }
  return { logoUrl: 'https://www.wizklub.com/favicon.ico', attachments: [] };
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  const v = normalizeEmail(email);
  if (!v) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function hashString(input) {
  const s = String(input || '');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

const SUBMISSION_EMAIL_THEMES = [
  {
    hero: 'linear-gradient(135deg,#ef5a2c 0%,#f6ac41 100%)',
    badgeBg: '#fff4e9',
    badgeColor: '#c2410c',
    panelBg: '#fffaf5',
    panelBorder: '#fed7aa',
    accent: '#ea580c',
  },
  {
    hero: 'linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%)',
    badgeBg: '#f5f3ff',
    badgeColor: '#5b21b6',
    panelBg: '#faf5ff',
    panelBorder: '#ddd6fe',
    accent: '#6d28d9',
  },
  {
    hero: 'linear-gradient(135deg,#0f766e 0%,#0891b2 100%)',
    badgeBg: '#ecfeff',
    badgeColor: '#0f766e',
    panelBg: '#f0fdfa',
    panelBorder: '#99f6e4',
    accent: '#0e7490',
  },
];

function getSubmissionEmailTheme(seed) {
  const idx = hashString(seed) % SUBMISSION_EMAIL_THEMES.length;
  return SUBMISSION_EMAIL_THEMES[idx];
}

function buildStudentSubmissionSesTemplateData(payload, logoUrl) {
  const {
    eventType, studentName, studentId, projectTitle, grade, schoolName, submittedAt, editDeadline,
  } = payload;
  const theme = getSubmissionEmailTheme(studentId || studentName || submittedAt);
  const action_word = eventType === 'edit' ? 'updated' : 'received';
  const event_badge_label = eventType === 'edit' ? 'Edited' : 'Submitted';
  const safe = {
    studentName: escapeHtml(studentName || 'Student'),
    studentId: escapeHtml(studentId || '-'),
    projectTitle: escapeHtml(projectTitle || '-'),
    grade: escapeHtml(grade || '-'),
    schoolName: escapeHtml(schoolName || '-'),
    submittedAt: escapeHtml(submittedAt || '-'),
    editDeadline: escapeHtml(editDeadline || ''),
  };
  let edit_deadline_row_html = '';
  if (editDeadline) {
    edit_deadline_row_html = `
                      <tr>
                        <td style="padding:8px 0;width:42%;font-size:13px;color:#6b7280;font-weight:600;">Edit Deadline</td>
                        <td style="padding:8px 0;font-size:14px;color:${theme.accent};font-weight:800;">${safe.editDeadline}</td>
                      </tr>`;
  }
  const edit_deadline_line = editDeadline ? `Edit Deadline: ${editDeadline}` : '';
  const sidForSubject = String(studentId || 'student').trim() || 'student';
  return {
    hero_background: theme.hero,
    badge_bg: theme.badgeBg,
    badge_color: theme.badgeColor,
    panel_bg: theme.panelBg,
    panel_border: theme.panelBorder,
    accent: theme.accent,
    logo_url: String(logoUrl || '').trim() || 'https://www.wizklub.com/favicon.ico',
    action_word,
    event_badge_label,
    student_id_subject: sidForSubject,
    student_name: safe.studentName,
    student_id: safe.studentId,
    project_title: safe.projectTitle,
    grade: safe.grade,
    school_name: safe.schoolName,
    submitted_at: safe.submittedAt,
    edit_deadline_line,
    edit_deadline_row_html,
  };
}

function getStudentSubmissionSesCreateEmailTemplateInput() {
  const subject = 'Technathon submission {{action_word}} ({{student_id_subject}})';
  const text = [
    'Hello {{student_name}},',
    '',
    'Your Technathon submission was {{action_word}} successfully.',
    'Student ID: {{student_id}}',
    'Project Title: {{project_title}}',
    'Grade: {{grade}}',
    'School: {{school_name}}',
    'Saved At: {{submitted_at}}',
    '{{edit_deadline_line}}',
    '',
    'This is an automated message from Wizklub Technathon.',
  ].join('\n');

  const html = `
<div style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;color:#111827;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f3f4f6;padding:26px 0;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="620" style="width:620px;max-width:620px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 18px 48px rgba(15,23,42,0.14);">
          <tr>
            <td style="padding:0;background:{{hero_background}};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="padding:22px 24px 18px 24px;vertical-align:top;">
                    <img src="{{logo_url}}" alt="WizKlub logo" width="126" height="40" style="display:block;border:0;outline:none;text-decoration:none;height:40px;width:auto;max-width:126px;filter:drop-shadow(0 2px 5px rgba(0,0,0,0.25));" />
                    <p style="margin:14px 0 4px 0;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.86);font-weight:700;">WizKlub Technathon</p>
                    <h1 style="margin:0 0 8px 0;font-size:26px;line-height:1.25;color:#ffffff;font-weight:800;">
                      Submission {{action_word}}
                    </h1>
                    <p style="margin:0;color:rgba(255,255,255,0.92);font-size:14px;line-height:1.55;">
                      Hi <strong>{{student_name}}</strong>, your project details are safely recorded.
                    </p>
                  </td>
                  <td style="padding:22px 24px 18px 0;vertical-align:top;text-align:right;">
                    <span style="display:inline-block;padding:7px 12px;border-radius:999px;background:rgba(255,255,255,0.2);color:#ffffff;font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">{{event_badge_label}}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 24px 10px 24px;">
              <div style="display:inline-block;padding:7px 12px;border-radius:999px;background:{{badge_bg}};color:{{badge_color}};font-size:12px;font-weight:700;letter-spacing:0.03em;">
                Submission snapshot
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:0 24px 12px 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid {{panel_border}};background:{{panel_bg}};border-radius:14px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td style="padding:8px 0;width:42%;font-size:13px;color:#6b7280;font-weight:600;">Student ID</td>
                        <td style="padding:8px 0;font-size:14px;color:#111827;font-weight:700;">{{student_id}}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;width:42%;font-size:13px;color:#6b7280;font-weight:600;">Project Title</td>
                        <td style="padding:8px 0;font-size:14px;color:#111827;font-weight:700;">{{project_title}}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;width:42%;font-size:13px;color:#6b7280;font-weight:600;">Grade</td>
                        <td style="padding:8px 0;font-size:14px;color:#111827;font-weight:700;">{{grade}}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;width:42%;font-size:13px;color:#6b7280;font-weight:600;">School</td>
                        <td style="padding:8px 0;font-size:14px;color:#111827;font-weight:700;">{{school_name}}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;width:42%;font-size:13px;color:#6b7280;font-weight:600;">Saved At</td>
                        <td style="padding:8px 0;font-size:14px;color:#111827;font-weight:700;">{{submitted_at}}</td>
                      </tr>
                      {{edit_deadline_row_html}}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:10px 24px 26px 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-radius:12px;background:#111827;">
                <tr>
                  <td style="padding:14px 16px;">
                    <p style="margin:0;font-size:12px;line-height:1.6;color:#d1d5db;">
                      This is an automated message from <strong style="color:#ffffff;">WizKlub Technathon</strong>.
                      Please do not reply directly to this email unless your organiser has enabled reply-to support.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</div>`;

  return {
    TemplateName: DEFAULT_SES_STUDENT_SUBMISSION_TEMPLATE_NAME,
    TemplateContent: {
      Subject: subject,
      Text: text,
      Html: html.trim(),
    },
  };
}

async function sendSubmissionStatusEmail({
  toEmail,
  eventType,
  studentId,
  studentName,
  projectTitle,
  grade,
  schoolName,
  submittedAt,
  editDeadline,
}) {
  const recipient = normalizeEmail(toEmail);
  if (!isValidEmail(recipient)) return { sent: false, reason: 'invalid-email' };
  if (!sesFromEmail) return { sent: false, reason: 'sender-not-configured' };
  if (!sesStudentSubmissionTemplateName) {
    return { sent: false, reason: 'ses-template-name-not-configured' };
  }

  const payload = {
    eventType,
    studentName,
    studentId,
    projectTitle,
    grade,
    schoolName,
    submittedAt,
    editDeadline,
  };
  const logo = resolveLogoForSesTemplate();
  const templateData = buildStudentSubmissionSesTemplateData(payload, logo.logoUrl);
  const input = {
    FromEmailAddress: sesFromEmail,
    Destination: { ToAddresses: [recipient] },
    Content: {
      Template: {
        TemplateName: sesStudentSubmissionTemplateName,
        TemplateData: JSON.stringify(templateData),
      },
    },
  };
  if (logo.attachments.length) {
    input.Content.Template.Attachments = logo.attachments;
  }
  if (sesReplyToEmail) input.ReplyToAddresses = [sesReplyToEmail];
  await sesClient.send(new SendEmailCommand(input));
  return { sent: true, transport: 'ses' };
}

module.exports = {
  normalizeEmail,
  isValidEmail,
  sendSubmissionStatusEmail,
  getSubmissionEmailTheme,
  buildStudentSubmissionSesTemplateData,
  getStudentSubmissionSesCreateEmailTemplateInput,
};