/**
 * Admin API: /api/admin — login, roster import, student links, roster GET.
 * Doc: ../../../docs/file-notes/server/routes/admin.js.md
 */
const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { loginLimiter, apiLimiter } = require('../middleware/rateLimiter');
const { requireAuth } = require('../middleware/auth');
const adminRosterService = require('../services/adminRosterService');
const { parseRosterExcelBuffer } = require('../services/rosterExcelImport');
const { resolveStudentFacingOrigin } = require('../lib/publicWebOrigin');
const { withSignedMediaUrlsList } = require('../lib/s3SignedUrl');

const router = express.Router();
const MAX_IMPORT_PREVIEW_ROWS = Number(process.env.MAX_IMPORT_PREVIEW_ROWS) > 0
  ? Math.floor(Number(process.env.MAX_IMPORT_PREVIEW_ROWS))
  : 5000;
const MAX_STUDENT_LINK_ROWS = Number(process.env.MAX_STUDENT_LINK_ROWS) > 0
  ? Math.floor(Number(process.env.MAX_STUDENT_LINK_ROWS))
  : 5000;
const LINK_GEN_CHUNK_SIZE = Number(process.env.LINK_GEN_CHUNK_SIZE) > 0
  ? Math.floor(Number(process.env.LINK_GEN_CHUNK_SIZE))
  : 250;

function chunkArray(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) {
    out.push(list.slice(i, i + size));
  }
  return out;
}

const rosterExcelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      /\.xlsx$/i.test(file.originalname || '')
      || /\.csv$/i.test(file.originalname || '')
      || file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      || file.mimetype === 'text/csv'
      || file.mimetype === 'application/csv'
      || file.mimetype === 'application/vnd.ms-excel';
    if (ok) return cb(null, true);
    return cb(new Error('Upload an .xlsx or .csv roster file.'));
  },
});

function loginAttemptsPayload(req) {
  const rl = req.rateLimit;
  if (!rl || typeof rl.remaining !== 'number') return {};
  return { attemptsRemaining: rl.remaining };
}

/**
 * POST /api/admin/login
 * Rate-limited: 5 attempts per 15 minutes per IP.
 * Returns a signed JWT valid for 8 hours on success.
 */
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required.',
      });
    }

    // Check username
    if (username !== process.env.ADMIN_USERNAME) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials.',
        ...loginAttemptsPayload(req),
      });
    }

    // Compare hashed password
    const isMatch = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials.',
        ...loginAttemptsPayload(req),
      });
    }

    // Sign JWT
    const token = jwt.sign(
      { username, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      success: true,
      token,
      expiresIn: 8 * 60 * 60, // seconds
      message: 'Logged in successfully.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/roster/import
 * Multipart field `file`: .xlsx/.csv row 1 starts with school_name, admission_number, user_name, student_name, grade.
 * Parse + validate roster rows for preview. Selected rows are saved when POST /student-links is called.
 */
router.post('/roster/import', requireAuth, apiLimiter, rosterExcelUpload.single('file'), async (req, res, next) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ success: false, message: 'No file uploaded (use field name: file).' });
    }
    const { rows, errors, warnings: parseWarnings } = await parseRosterExcelBuffer(req.file.buffer, {
      filename: req.file.originalname || '',
      mimetype: req.file.mimetype || '',
      maxRows: MAX_IMPORT_PREVIEW_ROWS,
    });
    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: errors.join(' ') || 'No valid data rows found.',
        errors,
        warnings: parseWarnings || [],
      });
    }
    const rowPayload = rows.map((row) => ({
      studentId: row.studentId,
      username: row.username,
      name: row.name,
      schoolName: row.schoolName,
      grade: row.grade,
      admissionNumber: row.admissionNumber,
    }));
    res.json({
      success: true,
      parsed: rows.length,
      rowCount: rows.length,
      rows: rowPayload,
      warnings: [...(parseWarnings || []), ...errors],
      message: 'Preview ready. Select students to save and generate links.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Normalize one entry from `students` body (full profile + signed link).
 * @param {object} s
 */
function rosterRowFromStudentPayload(s) {
  const username = String(s?.username ?? s?.studentId ?? '').trim();
  const name = String(s?.name ?? '').trim();
  const schoolName = String(s?.schoolName ?? '').trim();
  const grade = String(s?.grade ?? '').trim();
  const admissionNumber =
    s?.admissionNumber != null && String(s.admissionNumber).trim()
      ? String(s.admissionNumber).trim()
      : '';
  return {
    studentId: username,
    username,
    name,
    schoolName,
    grade,
    admissionNumber,
  };
}

/**
 * POST /api/admin/student-links
 * Body: { validDays, publicBaseUrl?, students: [{ username, name, schoolName, grade, admissionNumber? }] }
 * Each student row is upserted to roster (DB), then a signed URL is minted and stored on that row.
 * Student form fields stay locked from roster data on the submission page.
 */
router.post('/student-links', requireAuth, async (req, res, next) => {
  try {
    const secret = process.env.STUDENT_FORM_SECRET;
    if (!secret) {
      return res.status(503).json({ success: false, message: 'STUDENT_FORM_SECRET is not configured.' });
    }

    const { validDays } = req.body;
    const days = Number(validDays);
    if (!Number.isFinite(days) || days < 1 || days > 365) {
      return res.status(400).json({
        success: false,
        message: 'validDays must be a number from 1 to 365.',
      });
    }

    const base = resolveStudentFacingOrigin(
      { publicBaseUrl: typeof req.body?.publicBaseUrl === 'string' ? req.body.publicBaseUrl : '' },
      req,
    );

    const rawStudents = Array.isArray(req.body.students) ? req.body.students : [];
    if (rawStudents.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Provide students with full details (username, name, schoolName, grade; admissionNumber optional).',
      });
    }
    if (rawStudents.length > MAX_STUDENT_LINK_ROWS) {
      return res.status(400).json({
        success: false,
        message: `Too many students in one request (${rawStudents.length}). Max allowed is ${MAX_STUDENT_LINK_ROWS}.`,
      });
    }

    const rows = [];
    const seenIds = new Set();
    let duplicateRowsSkipped = 0;
    const duplicateIds = new Set();
    for (let i = 0; i < rawStudents.length; i += 1) {
      const r = rosterRowFromStudentPayload(rawStudents[i]);
      if (!r.username || !r.name || !r.schoolName || !r.grade) {
        return res.status(400).json({
          success: false,
          message: `students[${i}]: username, name, schoolName, and grade are required (admission number is optional).`,
        });
      }
      const g = Number(r.grade);
      if (!Number.isFinite(g) || g < 1 || g > 9) {
        return res.status(400).json({
          success: false,
          message: `students[${i}]: grade must be a number from 1 to 9.`,
        });
      }
      if (seenIds.has(r.studentId)) {
        duplicateRowsSkipped += 1;
        duplicateIds.add(r.studentId);
        continue;
      }
      seenIds.add(r.studentId);
      rows.push({ ...r, grade: String(Math.floor(g)) });
    }
    if (rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No unique students found after removing duplicate user_name rows.',
      });
    }
    const ids = rows.map((r) => r.studentId);
    const linkLocked = await adminRosterService.findLinkGeneratedStudentIds(ids);
    if (linkLocked.length > 0) {
      return res.status(409).json({
        success: false,
        message:
          'Cannot regenerate links or update roster profile for students whose link is already generated. '
          + 'Remove those students from the selection and try again.',
        blockedStudentIds: linkLocked,
      });
    }

    const blocked = await adminRosterService.findSubmittedStudentIds(ids);
    if (blocked.length > 0) {
      return res.status(409).json({
        success: false,
        message:
          'Cannot generate or refresh links for students who already submitted a final entry. '
          + 'Remove those students from the selection and try again.',
        blockedStudentIds: blocked,
      });
    }

    const { errors } = await adminRosterService.importRosterRows(rows);
    const data = [];
    const idChunks = chunkArray(ids, LINK_GEN_CHUNK_SIZE);
    for (const idChunk of idChunks) {
      const chunkData = await Promise.all(
        idChunk.map((id) => adminRosterService.getOrCreateLink(id, days, base, secret)),
      );
      data.push(...chunkData);
    }
    const uniqueGeneratedCount = new Set(
      (data || []).map((d) => String(d?.studentId || '').trim()).filter(Boolean),
    ).size;
    const persistedFalseStudentIds = (data || [])
      .filter((d) => d && d.persisted === false)
      .map((d) => String(d.studentId || '').trim())
      .filter(Boolean);
    const rosterWarnings = [...errors];
    if (duplicateRowsSkipped > 0) {
      rosterWarnings.push(`Skipped ${duplicateRowsSkipped} duplicate user_name row(s) from this request.`);
    }

    res.json({
      success: true,
      data,
      rosterWarnings,
      summary: {
        requestedRows: rawStudents.length,
        uniqueRowsProcessed: rows.length,
        duplicateRowsSkipped,
        duplicateStudentIdsSample: Array.from(duplicateIds).slice(0, 50),
        generatedCount: uniqueGeneratedCount,
        notGeneratedCount: Math.max(0, rawStudents.length - uniqueGeneratedCount),
        persistedFalseCount: persistedFalseStudentIds.length,
        persistedFalseStudentIdsSample: persistedFalseStudentIds.slice(0, 50),
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/roster
 * Excel roster merged with submissions; share links read from DB when generated and still valid.
 */
router.get('/roster', requireAuth, async (req, res, next) => {
  try {
    const secret = process.env.STUDENT_FORM_SECRET;
    if (!secret) {
      return res.status(503).json({ success: false, message: 'STUDENT_FORM_SECRET is not configured.' });
    }

    const base = resolveStudentFacingOrigin(
      { publicBaseUrl: typeof req.query.publicBaseUrl === 'string' ? req.query.publicBaseUrl : '' },
      req,
    );

    const envDefault = Number(process.env.ROSTER_LINK_VALID_DAYS);
    let linkValidDays = Number.isFinite(envDefault) && envDefault >= 1 && envDefault <= 365
      ? Math.floor(envDefault)
      : 30;
    const qDays = req.query.linkValidDays;
    if (qDays !== undefined && qDays !== '') {
      const n = Number(qDays);
      if (Number.isFinite(n)) {
        linkValidDays = Math.min(365, Math.max(1, Math.floor(n)));
      }
    }

    const { rows, analytics } = await adminRosterService.buildRoster(base, secret, { linkValidDays });
    const signedRows = await withSignedMediaUrlsList(rows);
    res.json({ success: true, data: signedRows, analytics });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
