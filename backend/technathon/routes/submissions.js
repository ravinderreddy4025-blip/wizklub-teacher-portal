/**
 * Submissions API: /api/submissions — by-link GET/PUT, admin list, export.
 * Doc: ../../../docs/file-notes/server/routes/submissions.js.md
 */
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');
const { verifyStudentLink } = require('../middleware/verifyStudentLink');
const ExcelJS = require('exceljs');
const { withSignedMediaUrlsList, maybeSignMediaUrl } = require('../lib/s3SignedUrl');
const { normalizeEmail, isValidEmail, sendSubmissionStatusEmail } = require('../lib/submissionEmailService');

const router = express.Router();

const EDIT_WINDOW_MS = 2 * 60 * 60 * 1000;

const FORM_FIELDS = [
  'name',
  'grade',
  'schoolName',
  'email',
  'projectTitle',
  'idea',
  'problemStatement',
  'solution',
  'techUsed',
  'impact',
  'videoUrl',
  'documentUrl',
  'username',
  'admissionNumber',
];

let Submission = null;
let RosterStudent = null;
let mockSubmissions = [];
let mockRoster = [];
let useMongo = false;

const init = (model, mock, mongo, rosterModel, rosterMock) => {
  Submission = model;
  if (Array.isArray(mock) && mock !== mockSubmissions) {
    mock.push(...mockSubmissions);
    mockSubmissions = mock;
  }
  useMongo = mongo;
  RosterStudent = rosterModel || null;
  if (Array.isArray(rosterMock)) {
    if (rosterMock !== mockRoster) rosterMock.push(...mockRoster);
    mockRoster = rosterMock;
  }
};

function pickFormPayload(body) {
  const out = {};
  for (const key of FORM_FIELDS) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

async function findRoster(studentId) {
  if (useMongo && RosterStudent) {
    return RosterStudent.findOne({ studentId }).lean();
  }
  return mockRoster.find((r) => r.studentId === studentId) || null;
}

function rosterLockedDefaults(roster) {
  return {
    studentId: roster.studentId,
    username: roster.username || roster.studentId,
    admissionNumber: roster.admissionNumber || '',
    name: roster.name,
    grade: String(roster.grade),
    schoolName: roster.schoolName,
    email: '',
    projectTitle: '',
    idea: '',
    problemStatement: '',
    solution: '',
    techUsed: '',
    impact: '',
    videoUrl: '',
    documentUrl: '',
  };
}

function mergeSubmissionWithRoster(doc, roster) {
  if (!roster) return doc;
  const shell = rosterLockedDefaults(roster);
  if (!doc) return shell;
  // Keep saved project/media fields from submission, but enforce roster-locked profile fields.
  return {
    ...shell,
    ...doc,
    studentId: roster.studentId,
    username: roster.username || roster.studentId,
    admissionNumber: roster.admissionNumber || '',
    name: roster.name,
    grade: String(roster.grade),
    schoolName: roster.schoolName,
  };
}

function buildMeta(studentId, linkExpiresAt, doc, roster) {
  const firstSubmittedAt = doc?.firstSubmittedAt ? new Date(doc.firstSubmittedAt) : null;
  const editDeadline = firstSubmittedAt ? new Date(firstSubmittedAt.getTime() + EDIT_WINDOW_MS) : null;
  const canEdit = !firstSubmittedAt || Date.now() < editDeadline.getTime();
  const meta = {
    studentId,
    linkExpiresAt: linkExpiresAt.toISOString(),
    editWindowHours: Math.floor(EDIT_WINDOW_MS / (60 * 60 * 1000)),
    firstSubmittedAt: firstSubmittedAt ? firstSubmittedAt.toISOString() : null,
    editDeadline: editDeadline ? editDeadline.toISOString() : null,
    canEdit,
    rosterFieldsLocked: !!roster,
  };
  if (roster) {
    meta.lockedProfile = {
      username: roster.username || roster.studentId,
      admissionNumber: roster.admissionNumber || '',
      name: roster.name,
      grade: String(roster.grade),
      schoolName: roster.schoolName,
    };
  }
  return meta;
}

function mockFindByStudentId(studentId) {
  return mockSubmissions.find((s) => s.studentId === studentId) || null;
}

/**
 * GET /api/submissions/by-link/:studentId/:exp/:sig
 */
router.get('/by-link/:studentId/:exp/:sig', apiLimiter, verifyStudentLink, async (req, res, next) => {
  try {
    const { studentId, linkExpiresAt } = req.studentLink;
    let doc = null;
    if (useMongo) {
      doc = await Submission.findOne({ studentId }).lean();
    } else {
      doc = mockFindByStudentId(studentId);
    }
    const roster = await findRoster(studentId);
    const data = mergeSubmissionWithRoster(doc, roster);
    res.json({
      success: true,
      meta: buildMeta(studentId, linkExpiresAt, doc, roster),
      data,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/submissions/by-link/:studentId/:exp/:sig
 * Upsert by studentId. Setting finalized: true on first save sets firstSubmittedAt (starts 2h edit window).
 */
router.put('/by-link/:studentId/:exp/:sig', apiLimiter, verifyStudentLink, async (req, res, next) => {
  try {
    const { studentId, linkExpiresAt } = req.studentLink;
    const finalized = req.body.finalized === true;

    let existing = null;
    if (useMongo) {
      existing = await Submission.findOne({ studentId }).lean();
    } else {
      existing = mockFindByStudentId(studentId);
    }

    if (existing?.firstSubmittedAt) {
      const deadline = new Date(new Date(existing.firstSubmittedAt).getTime() + EDIT_WINDOW_MS);
      if (Date.now() >= deadline.getTime()) {
        return res.status(403).json({
          success: false,
          message: 'The 2-hour edit window after your first submission has ended. Contact the organiser if you need changes.',
        });
      }
    }

    const roster = await findRoster(studentId);
    const payload = pickFormPayload(req.body);
    payload.studentId = studentId;
    if (payload.email !== undefined) {
      payload.email = normalizeEmail(payload.email);
      if (payload.email && !isValidEmail(payload.email)) {
        return res.status(400).json({
          success: false,
          message: 'Please enter a valid email address.',
        });
      }
    }

    if (roster) {
      payload.name = roster.name;
      payload.grade = String(roster.grade);
      payload.schoolName = roster.schoolName;
      payload.username = roster.username || roster.studentId;
      payload.admissionNumber = roster.admissionNumber || '';
    }

    if (existing?.firstSubmittedAt && existing.grade != null && existing.grade !== '' && !roster) {
      payload.grade = existing.grade;
    }

    if (finalized) {
      if (!payload.name || !payload.grade || !payload.schoolName || !payload.projectTitle) {
        return res.status(400).json({
          success: false,
          message: 'name, grade, schoolName, and projectTitle are required to submit.',
        });
      }
      if (!payload.videoUrl) {
        return res.status(400).json({
          success: false,
          message: 'A project video upload is required to submit.',
        });
      }
    }

    const setFirstSubmitted = finalized && !existing?.firstSubmittedAt;
    const notificationType = existing?.firstSubmittedAt ? 'edit' : 'submit';

    async function sendSubmissionEmailIfNeeded(savedRow) {
      if (!finalized) return;
      const toEmail = normalizeEmail(savedRow?.email || payload.email || existing?.email || '');
      if (!toEmail) return;
      try {
        const firstSubmitted = savedRow?.firstSubmittedAt ? new Date(savedRow.firstSubmittedAt) : null;
        const editDeadline = firstSubmitted
          ? new Date(firstSubmitted.getTime() + EDIT_WINDOW_MS).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
          : null;
        await sendSubmissionStatusEmail({
          toEmail,
          eventType: notificationType,
          studentId,
          studentName: savedRow?.name || payload.name || '',
          projectTitle: savedRow?.projectTitle || payload.projectTitle || '',
          grade: savedRow?.grade || payload.grade || '',
          schoolName: savedRow?.schoolName || payload.schoolName || '',
          submittedAt: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
          editDeadline,
        });
      } catch (mailErr) {
        console.error('[ses] submission email failed', {
          studentId,
          email: toEmail,
          eventType: notificationType,
          message: mailErr?.message || String(mailErr),
        });
      }
    }

    if (useMongo) {
      const update = { ...payload };
      if (setFirstSubmitted) update.firstSubmittedAt = new Date();
      const opts = { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true };
      const saved = await Submission.findOneAndUpdate({ studentId }, update, opts).lean();
      await sendSubmissionEmailIfNeeded(saved);
      const merged = mergeSubmissionWithRoster(saved, roster);
      return res.json({
        success: true,
        message: finalized ? 'Saved successfully.' : 'Draft saved.',
        meta: buildMeta(studentId, linkExpiresAt, saved, roster),
        data: merged,
      });
    }

    const now = new Date();
    const idx = mockSubmissions.findIndex((s) => s.studentId === studentId);
    if (idx === -1) {
      const row = {
        ...payload,
        _id: `m-${Date.now()}`,
        createdAt: now,
        updatedAt: now,
        firstSubmittedAt: setFirstSubmitted ? now : undefined,
      };
      mockSubmissions.push(row);
      await sendSubmissionEmailIfNeeded(row);
      const merged = mergeSubmissionWithRoster(row, roster);
      return res.json({
        success: true,
        message: finalized ? 'Saved successfully.' : 'Draft saved.',
        meta: buildMeta(studentId, linkExpiresAt, row, roster),
        data: merged,
      });
    }

    const prev = mockSubmissions[idx];
    const nextRow = {
      ...prev,
      ...payload,
      studentId,
      updatedAt: now,
      firstSubmittedAt: setFirstSubmitted ? now : prev.firstSubmittedAt,
    };
    mockSubmissions[idx] = nextRow;
    await sendSubmissionEmailIfNeeded(nextRow);
    const merged = mergeSubmissionWithRoster(nextRow, roster);
    return res.json({
      success: true,
      message: finalized ? 'Saved successfully.' : 'Draft saved.',
      meta: buildMeta(studentId, linkExpiresAt, nextRow, roster),
      data: merged,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/submissions
 * Protected — Admin only.
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    if (useMongo) {
      const list = await Submission.find().sort({ createdAt: -1 }).lean();
      const signedList = await withSignedMediaUrlsList(list);
      res.json({ success: true, count: signedList.length, data: signedList });
    } else {
      const signedList = await withSignedMediaUrlsList(mockSubmissions);
      res.json({ success: true, count: signedList.length, data: signedList });
    }
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/submissions/export
 */
router.get('/export', requireAuth, async (req, res, next) => {
  try {
    const submissions = useMongo
      ? await Submission.find().sort({ createdAt: -1 }).lean()
      : mockSubmissions;
    const rosterRows = useMongo && RosterStudent
      ? await RosterStudent.find(
        {},
        {
          studentId: 1,
          username: 1,
          admissionNumber: 1,
          name: 1,
          grade: 1,
          schoolName: 1,
          shareUrl: 1,
          linkExpMs: 1,
          updatedAt: 1,
        },
      ).lean()
      : mockRoster;
    const rosterById = new Map(
      (rosterRows || []).map((r) => [String(r.studentId || ''), r]),
    );

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'WizKlub Technathon';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Submissions');

    sheet.columns = [
      { header: 'Student ID', key: 'studentId', width: 15 },
      { header: 'Username', key: 'username', width: 16 },
      { header: 'Admission No', key: 'admissionNumber', width: 14 },
      { header: 'Name', key: 'name', width: 20 },
      { header: 'Grade', key: 'grade', width: 10 },
      { header: 'School Name', key: 'schoolName', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Project Title', key: 'projectTitle', width: 30 },
      { header: 'Idea', key: 'idea', width: 35 },
      { header: 'Problem Statement', key: 'problemStatement', width: 40 },
      { header: 'Solution', key: 'solution', width: 40 },
      { header: 'Technology Used', key: 'techUsed', width: 30 },
      { header: 'Impact', key: 'impact', width: 35 },
      { header: 'Video URL', key: 'videoUrl', width: 40 },
      { header: 'Document URL', key: 'documentUrl', width: 40 },
      { header: 'Submission Link', key: 'shareUrl', width: 50 },
      { header: 'Link Expiry', key: 'linkExpiry', width: 24 },
      { header: 'First Submitted At', key: 'firstSubmittedAt', width: 22 },
      { header: 'Last Updated', key: 'updatedAt', width: 22 },
    ];

    sheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEF5A2C' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFF0652A' } } };
    });
    sheet.getRow(1).height = 24;

    const submissionById = new Map(submissions.map((s) => [String(s.studentId || ''), s]));
    const rowsForExport = await Promise.all(submissions.map(async (sub) => {
      const roster = rosterById.get(String(sub.studentId || '')) || null;
      return {
        studentId: sub.studentId || '',
        username: sub.username || roster?.username || '',
        admissionNumber: sub.admissionNumber || roster?.admissionNumber || '',
        name: sub.name || roster?.name || '',
        grade: sub.grade || roster?.grade || '',
        schoolName: sub.schoolName || roster?.schoolName || '',
        email: sub.email || '',
        projectTitle: sub.projectTitle || '',
        idea: sub.idea || '',
        problemStatement: sub.problemStatement || '',
        solution: sub.solution || '',
        techUsed: sub.techUsed || '',
        impact: sub.impact || '',
        videoUrl: await maybeSignMediaUrl(sub.videoUrl || ''),
        documentUrl: await maybeSignMediaUrl(sub.documentUrl || ''),
        shareUrl: roster?.shareUrl || '',
        linkExpiry: roster?.linkExpMs ? new Date(Number(roster.linkExpMs)).toLocaleString('en-IN') : '',
        firstSubmittedAt: sub.firstSubmittedAt
          ? new Date(sub.firstSubmittedAt).toLocaleString('en-IN')
          : '',
        updatedAt: sub.updatedAt
          ? new Date(sub.updatedAt).toLocaleString('en-IN')
          : '',
      };
    }));

    for (const roster of rosterRows || []) {
      const sid = String(roster?.studentId || '');
      if (!sid || submissionById.has(sid)) continue;
      rowsForExport.push({
        studentId: sid,
        username: roster?.username || sid,
        admissionNumber: roster?.admissionNumber || '',
        name: roster?.name || '',
        grade: roster?.grade || '',
        schoolName: roster?.schoolName || '',
        email: '',
        projectTitle: '',
        idea: '',
        problemStatement: '',
        solution: '',
        techUsed: '',
        impact: '',
        videoUrl: '',
        documentUrl: '',
        shareUrl: roster?.shareUrl || '',
        linkExpiry: roster?.linkExpMs ? new Date(Number(roster.linkExpMs)).toLocaleString('en-IN') : '',
        firstSubmittedAt: '',
        updatedAt: roster?.updatedAt
          ? new Date(roster.updatedAt).toLocaleString('en-IN')
          : '',
      });
    }

    rowsForExport.forEach((rowData, idx) => {
      const row = sheet.addRow(rowData);

      if (idx % 2 === 1) {
        row.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF8F0' } };
        });
      }
      row.eachCell((cell) => {
        cell.alignment = { vertical: 'top', wrapText: true };
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=technathon_submissions_${new Date().toISOString().slice(0, 10)}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.init = init;
